import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Event
from uuid import uuid4

import pytest
from conftest import create_pdf
from fastapi.testclient import TestClient

from app.core import ProcessingError, ProcessingSettings
from app.main import create_app
from app.models import WatermarkConfig
from app.services import pdf_service


@pytest.mark.parametrize("completed", [0, 1, 3])
def test_cancelled_worker_discards_partial_output(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, completed: int
) -> None:
    source, output, progress = [
        tmp_path / name for name in ["source.pdf", "output.pdf", "progress.json"]
    ]
    create_pdf(source, [(200, 300)] * 3)
    original_write = pdf_service.write_progress
    updates = []

    def track(path: str | None, count: int, total: int, **kwargs: bool) -> None:
        original_write(path, count, total, **kwargs)
        updates.append(count)
        if count == completed:
            progress.with_suffix(".cancel").touch()

    monkeypatch.setattr(pdf_service, "write_progress", track)
    with pytest.raises(ProcessingError) as failure:
        pdf_service.process_pdf(
            str(source),
            str(output),
            WatermarkConfig(text="TEST").model_dump(),
            ProcessingSettings(),
            str(progress),
        )
    assert failure.value.status_code == 499
    assert updates[-1] == completed
    assert not output.exists()


def test_cancel_waits_for_worker_cleanup_and_allows_retry(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    source = tmp_path / "source.pdf"
    create_pdf(source, [(200, 300)] * 3)
    key = str(uuid4())
    started, release = Event(), Event()
    calls = []
    original_insert = pdf_service.insert_raster_page

    def hold_page(*args: object, **kwargs: object) -> int:
        calls.append(1)
        started.set()
        assert release.wait(10)
        return original_insert(*args, **kwargs)

    monkeypatch.setattr(pdf_service, "insert_raster_page", hold_page)
    app = create_app()
    upload = {
        "files": {"file": ("source.pdf", source.read_bytes(), "application/pdf")},
        "data": {"config": '{"text":"TEST"}', "progressId": key},
    }
    with (
        TestClient(app) as client,
        ThreadPoolExecutor(max_workers=1) as worker,
        ThreadPoolExecutor(max_workers=2) as requests,
    ):
        # One worker still obeys the real gate; threads expose lifecycle events.
        app.state.processor = worker
        processing = requests.submit(client.post, "/api/pdf/process", **upload)
        try:
            assert started.wait(5)
            progress_path = app.state.progress_files[key]
            cancellation = requests.submit(client.post, f"/api/pdf/cancel/{key}")
            deadline = time.monotonic() + 5
            while not progress_path.with_suffix(".cancel").exists():
                assert time.monotonic() < deadline
                time.sleep(0.01)
            assert not cancellation.done()
        finally:
            release.set()
        assert processing.result(timeout=10).status_code == 499
        response = cancellation.result(timeout=10)
        assert response.status_code == 204
        assert response.headers["cache-control"] == "no-store"
        assert calls == [1]
        assert app.state.progress_files == {}
        assert not progress_path.parent.exists()

        upload["data"]["progressId"] = str(uuid4())
        result = client.post("/api/pdf/process", **upload)
        assert result.status_code == 200
        assert result.content.startswith(b"%PDF-")
        assert len(calls) == 4
        assert app.state.progress_files == {}


def test_cancel_is_idempotent_and_validates_id() -> None:
    with TestClient(create_app()) as client:
        key = str(uuid4())
        assert client.post(f"/api/pdf/cancel/{key}").status_code == 204
        assert client.post(f"/api/pdf/cancel/{key}").status_code == 204
        assert client.post("/api/pdf/cancel/invalid").status_code == 422
