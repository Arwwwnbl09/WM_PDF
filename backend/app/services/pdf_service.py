import math
import time
from dataclasses import replace
from pathlib import Path

import pymupdf
from PIL import Image

from app.core import (
    COMPACT_TARGET_BYTES,
    OUTPUT_PROFILES,
    ProcessingError,
    ProcessingSettings,
)
from app.models import WatermarkConfig
from app.services.compression_service import (
    CompressedRaster,
    compress_raster,
)
from app.services.progress_service import check_cancelled, write_progress
from app.services.watermark_service import burn_watermark


def validate_document(
    document: pymupdf.Document, settings: ProcessingSettings
) -> list[tuple[float, float]]:
    if not document.is_pdf:
        raise ProcessingError("File bukan dokumen PDF yang valid.")
    if document.is_encrypted or document.needs_pass:
        raise ProcessingError(
            "PDF dilindungi kata sandi. Buka proteksi PDF terlebih dahulu."
        )
    if document.page_count == 0:
        raise ProcessingError("PDF tidak memiliki halaman.")
    if document.page_count > settings.max_pages:
        raise ProcessingError(
            f"Jumlah halaman melebihi batas {settings.max_pages} halaman."
        )
    dimensions: list[tuple[float, float]] = []
    for page in document:
        width, height = page.rect.width, page.rect.height
        if not math.isfinite(width * height) or width <= 0 or height <= 0:
            raise ProcessingError("Ukuran halaman PDF tidak valid.")
        # Upper bound including pixel rounding from nonzero crop-box origins.
        pixels = (math.ceil(width * settings.dpi / 72) + 1) * (
            math.ceil(height * settings.dpi / 72) + 1
        )
        if pixels > settings.max_pixels_per_page:
            raise ProcessingError(
                f"Ukuran halaman {page.number + 1} terlalu besar untuk kualitas PDF yang dipilih."
            )
        dimensions.append((width, height))
    return dimensions


def insert_encoded_image(page: pymupdf.Page, raster: CompressedRaster) -> int:
    if raster.palette is None:
        page.insert_image(page.rect, stream=raster.data, keep_proportion=False)
        return len(raster.data)
    output = page.parent
    width, height = raster.size
    xref = output.get_new_xref()
    highest_index = len(raster.palette) // 3 - 1
    output.update_object(
        xref,
        f"<< /Type /XObject /Subtype /Image /Width {width} /Height {height} "
        f"/BitsPerComponent 8 /ColorSpace [/Indexed /DeviceRGB {highest_index} "
        f"<{raster.palette.hex()}>] >>",
    )
    output.update_stream(xref, raster.data, compress=True)
    page.insert_image(page.rect, xref=xref, keep_proportion=False)
    return len(output.xref_stream_raw(xref)) + len(raster.palette)


def insert_raster_page(
    source: pymupdf.Page,
    output: pymupdf.Document,
    config: WatermarkConfig,
    settings: ProcessingSettings,
    byte_budget: int | None = None,
) -> int:
    pixmap = source.get_pixmap(
        dpi=settings.dpi, colorspace=pymupdf.csRGB, alpha=False, annots=True
    )
    try:
        if pixmap.width * pixmap.height > settings.max_pixels_per_page:
            raise ProcessingError("Ukuran halaman PDF melebihi batas pemrosesan.")
        with Image.frombytes(
            "RGB", (pixmap.width, pixmap.height), pixmap.samples
        ) as image:
            # Release the MuPDF raster before creating the composite.
            pixmap = None
            with burn_watermark(image, config, settings) as secured:
                encoded = compress_raster(secured, settings, byte_budget)
                output_page = output.new_page(
                    width=source.rect.width, height=source.rect.height
                )
                return insert_encoded_image(output_page, encoded)
    finally:
        pixmap = None


def verify_output(path: Path, dimensions: list[tuple[float, float]]) -> None:
    with pymupdf.open(path) as document:
        if (
            not document.is_pdf
            or document.page_count != len(dimensions)
            or document.get_ocgs()
            or document.embfile_count()
        ):
            raise ProcessingError(
                "Hasil PDF tidak dapat diverifikasi. Silakan coba kembali.", 500
            )
        for page, (width, height) in zip(document, dimensions, strict=True):
            images = page.get_images(full=True)
            if (
                abs(page.rect.width - width) > 0.1
                or abs(page.rect.height - height) > 0.1
                or len(images) != 1
                or page.get_text().strip()
                or list(page.annots() or [])
                or list(page.widgets() or [])
                or page.get_links()
            ):
                raise ProcessingError(
                    "Hasil PDF tidak dapat diverifikasi. Silakan coba kembali.", 500
                )
            rects = page.get_image_rects(images[0][0])
            if len(rects) != 1 or any(
                abs(a - b) > 0.1 for a, b in zip(rects[0], page.rect, strict=True)
            ):
                raise ProcessingError(
                    "Hasil PDF tidak dapat diverifikasi. Silakan coba kembali.", 500
                )


def process_pdf(
    input_path: str,
    output_path: str,
    config_data: dict[str, object],
    settings: ProcessingSettings,
    progress_path: str | None = None,
) -> dict[str, float | int]:
    started = time.perf_counter()
    source_path, destination = Path(input_path), Path(output_path)
    if source_path.stat().st_size > settings.max_file_bytes:
        raise ProcessingError("File PDF terlalu besar.", 413)
    if source_path.stat().st_size == 0:
        raise ProcessingError("File PDF kosong.")
    config = WatermarkConfig.model_validate(config_data)
    dpi, quality, subsampling = OUTPUT_PROFILES[config.outputQuality]
    settings = replace(
        settings, dpi=dpi, jpeg_quality=quality, jpeg_subsampling=subsampling
    )
    try:
        check_cancelled(progress_path)
        # Bounded compressed input bytes also avoid Windows file locks if MuPDF's
        # constructor fails before it can return a closable Document.
        with (
            pymupdf.open(stream=source_path.read_bytes(), filetype="pdf") as source,
            pymupdf.open() as output,
        ):
            dimensions = validate_document(source, settings)
            write_progress(progress_path, 0, len(dimensions))
            image_bytes = 0
            image_budget = COMPACT_TARGET_BYTES - 64 * 1024 - len(dimensions) * 2048
            for index, page in enumerate(source, start=1):
                check_cancelled(progress_path)
                budget = (
                    max(
                        1, (image_budget - image_bytes) // (len(dimensions) - index + 1)
                    )
                    if config.outputQuality == "compact"
                    else None
                )
                image_bytes += insert_raster_page(
                    page, output, config, settings, budget
                )
                check_cancelled(progress_path)
                write_progress(progress_path, index, len(dimensions))
            check_cancelled(progress_path)
            output.set_metadata({"producer": "Secure PDF Watermark"})
            output.save(destination, garbage=3, deflate=True)
        check_cancelled(progress_path)
        verify_output(destination, dimensions)
        check_cancelled(progress_path)
        write_progress(progress_path, len(dimensions), len(dimensions), finished=True)
        return {
            "pages": len(dimensions),
            "seconds": round(time.perf_counter() - started, 3),
            "input_bytes": source_path.stat().st_size,
            "output_bytes": destination.stat().st_size,
        }
    except ProcessingError:
        destination.unlink(missing_ok=True)
        raise
    except Exception as cause:
        destination.unlink(missing_ok=True)
        raise ProcessingError(
            "PDF tidak dapat diproses. Pastikan dokumen dapat dibuka, lalu coba kembali."
        ) from cause
