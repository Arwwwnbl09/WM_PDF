from pathlib import Path
from uuid import uuid4

import pytest
from conftest import create_pdf
from fastapi.testclient import TestClient

from app.core import ProcessingSettings
from app.main import create_app
from app.models import WatermarkConfig
from app.services import pdf_service
from app.services.progress_service import read_progress, write_progress


def test_worker_progress_tracks_pages_and_finishes_after_verification(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    source, output, progress = [
        tmp_path / name for name in ["source.pdf", "output.pdf", "progress.json"]
    ]
    create_pdf(source, [(200, 300)] * 3)
    updates = []
    original_write = pdf_service.write_progress
    original_verify = pdf_service.verify_output

    def track(
        path: str | None, completed: int, total: int, *, finished: bool = False
    ) -> None:
        original_write(path, completed, total, finished=finished)
        updates.append(read_progress(progress)["percentage"])

    def verify(path: Path, dimensions: list[tuple[float, float]]) -> None:
        assert read_progress(progress) == {"percentage": 99}
        original_verify(path, dimensions)

    monkeypatch.setattr(pdf_service, "write_progress", track)
    monkeypatch.setattr(pdf_service, "verify_output", verify)
    pdf_service.process_pdf(
        str(source),
        str(output),
        WatermarkConfig(text="TEST").model_dump(),
        ProcessingSettings(),
        str(progress),
    )
    assert updates == [0, 33, 66, 99, 100]


def test_progress_endpoint_and_registration_cleanup(tmp_path: Path) -> None:
    app = create_app()
    path = tmp_path / "progress.json"
    key = str(uuid4())
    with TestClient(app) as client:
        write_progress(str(path), 2, 4)
        app.state.progress_files[key] = path
        response = client.get(f"/api/pdf/progress/{key}")
        assert response.status_code == 200
        assert response.json() == {"percentage": 50}
        assert response.headers["cache-control"] == "no-store"
        app.state.progress_files.clear()
        assert client.get(f"/api/pdf/progress/{key}").status_code == 404
        source = tmp_path / "input.pdf"
        create_pdf(source, [(200, 300)])
        response = client.post(
            "/api/pdf/process",
            files={"file": ("input.pdf", source.read_bytes(), "application/pdf")},
            data={
                "config": WatermarkConfig(text="TEST").model_dump_json(),
                "progressId": key,
            },
        )
        assert response.status_code == 200
        assert app.state.progress_files == {}
        assert client.get(f"/api/pdf/progress/{key}").status_code == 404
        response = client.post(
            "/api/pdf/process",
            files={"file": ("bad.pdf", b"invalid", "application/pdf")},
            data={
                "config": WatermarkConfig(text="TEST").model_dump_json(),
                "progressId": key,
            },
        )
        assert response.status_code == 422
        assert app.state.progress_files == {}


@pytest.mark.parametrize(
    "token", ["invalid", "..", "00000000-0000-0000-0000-000000000000"]
)
def test_invalid_progress_tokens_rejected(token: str) -> None:
    with TestClient(create_app()) as client:
        response = client.post(
            "/api/pdf/process",
            files={"file": ("input.pdf", b"sample", "application/pdf")},
            data={"config": '{"text":"TEST"}', "progressId": token},
        )
        assert response.status_code == 422
        assert client.app.state.progress_files == {}


@pytest.mark.parametrize(
    "content", ["partial", "null", "[]", '{"percentage":true}', '{"percentage":999}']
)
def test_partial_or_invalid_update_is_safe(tmp_path: Path, content: str) -> None:
    path = tmp_path / "progress.json"
    path.write_text(content)
    assert read_progress(path) == {"percentage": 0}


def test_progress_write_failure_does_not_fail_processing(tmp_path: Path) -> None:
    write_progress(str(tmp_path / "missing" / "progress.json"), 1, 2)
    assert read_progress(tmp_path / "missing.json") == {"percentage": 0}
