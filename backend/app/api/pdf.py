import asyncio
import logging
import re
import time
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.responses import FileResponse
from pydantic import ValidationError
from starlette.types import Receive, Scope, Send

from app.core import MAX_CONFIG_BYTES, ProcessingError
from app.models import WatermarkConfig
from app.services.pdf_service import process_pdf
from app.services.progress_service import read_progress, write_progress

router = APIRouter(prefix="/api/pdf", tags=["PDF"])
logger = logging.getLogger("secure_pdf")


def progress_key(value: str) -> str:
    try:
        key = UUID(value)
        if key.version != 4 or len(value) != 36:
            raise ValueError
        return str(key)
    except ValueError:
        raise HTTPException(422, "ID proses tidak valid.") from None


@router.get("/progress/{progress_id}")
def progress_endpoint(
    progress_id: str, request: Request, response: Response
) -> dict[str, int]:
    response.headers["Cache-Control"] = "no-store"
    path = request.app.state.progress_files.get(progress_key(progress_id))
    if path is None:
        raise HTTPException(404, "Status proses tidak tersedia.")
    return read_progress(path)


@router.post("/cancel/{progress_id}", status_code=204)
async def cancel_endpoint(progress_id: str, request: Request) -> Response:
    key = progress_key(progress_id)
    path = request.app.state.progress_files.get(key)
    if path is not None:
        try:
            path.with_suffix(".cancel").touch()
        except FileNotFoundError:
            # The worker may have finished and removed its temporary directory.
            pass
        deadline = time.monotonic() + 60
        while request.app.state.progress_files.get(key) == path:
            if time.monotonic() >= deadline:
                raise HTTPException(
                    503, "Proses PDF masih dihentikan. Silakan tunggu sebentar."
                )
            await asyncio.sleep(0.05)
    return Response(status_code=204, headers={"Cache-Control": "no-store"})


def secured_filename(filename: str | None) -> str:
    basename = (filename or "document.pdf").replace("\\", "/").split("/")[-1]
    stem = re.sub(r"[^a-zA-Z0-9_.-]+", "_", Path(basename).stem).strip("._-")[:100]
    return f"{stem or 'document'}_secured.pdf"


class TemporaryPdfResponse(FileResponse):
    def __init__(
        self, path: Path, filename: str, temporary: TemporaryDirectory[str]
    ) -> None:
        super().__init__(
            path,
            media_type="application/pdf",
            filename=filename,
            headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
        )
        self.temporary = temporary

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        # Finally also handles response errors/disconnects, unlike background-only cleanup.
        try:
            await super().__call__(scope, receive, send)
        finally:
            self.temporary.cleanup()


@router.post(
    "/process",
    response_class=FileResponse,
    responses={
        200: {
            "content": {"application/pdf": {}},
            "description": "PDF dengan watermark menyatu pada setiap halaman",
        },
        413: {"description": "File melebihi batas"},
        422: {"description": "PDF atau pengaturan tidak valid"},
        503: {"description": "Server sedang memproses PDF"},
    },
)
def process_endpoint(
    request: Request,
    file: Annotated[UploadFile, File(description="File PDF asli")],
    config: Annotated[str, Form(description="JSON WatermarkConfig")],
    progressId: Annotated[str | None, Form()] = None,
) -> FileResponse:
    key = progress_key(progressId) if progressId is not None else None
    if len(config.encode("utf-8")) > MAX_CONFIG_BYTES:
        raise HTTPException(422, "Pengaturan watermark melebihi batas ukuran.")
    try:
        watermark = WatermarkConfig.model_validate_json(config)
    except (ValidationError, ValueError):
        raise HTTPException(
            422,
            "Pengaturan watermark tidak valid. Periksa teks, huruf, posisi, warna, transparansi, rotasi, jarak, dan kualitas PDF.",
        ) from None
    if not (file.filename or "").lower().endswith(".pdf") or file.content_type not in (
        "application/pdf",
        "application/octet-stream",
    ):
        raise HTTPException(415, "Hanya file PDF yang dapat diproses.")
    gate = request.app.state.processing_gate
    if not gate.acquire(blocking=False):
        raise HTTPException(
            503, "Server sedang memproses PDF lain. Silakan coba kembali sebentar lagi."
        )
    temporary: TemporaryDirectory[str] | None = None
    try:
        temporary = TemporaryDirectory(prefix="secure-pdf-")
        settings = request.app.state.settings
        input_path = Path(temporary.name) / "input.pdf"
        output_path = Path(temporary.name) / "output.pdf"
        progress_path = Path(temporary.name) / "progress.json" if key else None
        if key and progress_path:
            write_progress(str(progress_path), 0, 1)
            request.app.state.progress_files[key] = progress_path
        total = 0
        with input_path.open("wb") as destination:
            while chunk := file.file.read(1024 * 1024):
                total += len(chunk)
                if total > settings.max_file_bytes:
                    raise HTTPException(
                        413,
                        f"File PDF melebihi batas {settings.max_file_bytes // (1024 * 1024)} MB.",
                    )
                destination.write(chunk)
        if total == 0:
            raise HTTPException(422, "File PDF kosong.")
        # MuPDF runs in an isolated process, never in simultaneous ASGI threads.
        result = request.app.state.processor.submit(
            process_pdf,
            str(input_path),
            str(output_path),
            watermark.model_dump(),
            settings,
            str(progress_path) if progress_path else None,
        ).result()
        logger.info(
            "Rasterized pages=%s seconds=%s input_bytes=%s output_bytes=%s",
            result["pages"],
            result["seconds"],
            result["input_bytes"],
            result["output_bytes"],
        )
        input_path.unlink(missing_ok=True)
        return TemporaryPdfResponse(
            output_path, secured_filename(file.filename), temporary
        )
    except ProcessingError as cause:
        if temporary is not None:
            temporary.cleanup()
        raise HTTPException(cause.status_code, cause.detail) from None
    except HTTPException:
        if temporary is not None:
            temporary.cleanup()
        raise
    except Exception as cause:  # noqa: BLE001 - sanitize all internal API errors
        if temporary is not None:
            temporary.cleanup()
        logger.error("Secure PDF processing failed: %s", type(cause).__name__)
        raise HTTPException(
            500, "Proses PDF gagal. Silakan coba kembali atau gunakan dokumen lain."
        ) from None
    finally:
        file.file.close()
        # Cancellation acknowledges completion only after the gate is released.
        gate.release()
        if key:
            request.app.state.progress_files.pop(key, None)
