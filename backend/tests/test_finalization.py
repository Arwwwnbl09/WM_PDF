from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.config import frontend_origins
from app.core import ProcessingError, ProcessingSettings
from app.main import create_app
from app.models import WatermarkConfig
from app.services.font_service import load_font
from app.services.pdf_service import process_pdf, verify_output
from app.services.watermark_service import burn_watermark, make_watermark


def test_long_diagonal_single_uses_validated_page_budget(tmp_path: Path) -> None:
    from conftest import create_pdf

    dimensions = [(595, 842), (842, 595)]
    source = tmp_path / "diagonal.pdf"
    output = tmp_path / "diagonal_secured.pdf"
    create_pdf(source, dimensions)
    settings = ProcessingSettings()
    config = WatermarkConfig(
        text="Internal Use Only - Dicetak Oleh: Yusuf Rahman - 16-12-2025 - Fuel Terminal Standard - Dokumen Terkendali",
        fontSize=20,
        angle=51,
        opacity=0.51,
    )
    page_size = (2480, 3509)
    with make_watermark(config, page_size, settings) as mark:
        assert mark.width * mark.height > settings.max_watermark_pixels
        assert mark.width <= page_size[0]
        assert mark.height <= page_size[1]
    process_pdf(str(source), str(output), config.model_dump(), settings)
    verify_output(output, dimensions)


@pytest.mark.parametrize(
    "origin",
    [
        "",
        "*",
        "https://*.example.com",
        "ftp://example.com",
        "https://example.com/path",
        "https://user:password@example.com",
        "http://example.com:0",
        "http://example.com:99999",
        "https://example.com?x=1",
        "https://example.com#fragment",
        "https://exa mple.com",
        "https://example.com\\path",
    ],
)
def test_cors_rejects_invalid_deployment_origin(
    origin: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("FRONTEND_ORIGINS", origin)
    with pytest.raises(ValueError, match="FRONTEND_ORIGINS"):
        frontend_origins()


def test_production_origins_and_deduplication(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(
        "FRONTEND_ORIGINS",
        "https://pdf.example.com/,https://pdf.example.com,http://[::1]:3000",
    )
    assert frontend_origins() == ["https://pdf.example.com", "http://[::1]:3000"]


def test_dense_zero_spacing_rejected_before_compositing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def unexpected_composite(*args: object, **kwargs: object) -> None:
        raise AssertionError("Dense tiles must be rejected before drawing")

    monkeypatch.setattr(Image.Image, "alpha_composite", unexpected_composite)
    with (
        Image.new("RGB", (2000, 2000), "white") as image,
        pytest.raises(ProcessingError, match="terlalu padat"),
    ):
        burn_watermark(
            image,
            WatermarkConfig(
                text=".", fontSize=8, angle=0, type="repeated", spaceX=0, spaceY=0
            ),
            ProcessingSettings(),
        )


def test_zero_spacing_normal_text_terminates() -> None:
    with (
        Image.new("RGB", (400, 500), "white") as image,
        burn_watermark(
            image,
            WatermarkConfig(
                text="CONFIDENTIAL",
                fontSize=8,
                angle=-180,
                type="repeated",
                spaceX=0,
                spaceY=0,
            ),
            ProcessingSettings(),
        ) as result,
    ):
        assert result.size == image.size
        assert result.mode == "RGB"


@pytest.mark.parametrize("mode,size", [("single", 200), ("repeated", 16)])
def test_long_text_real_raster_output(
    source: Path, tmp_path: Path, mode: str, size: int
) -> None:
    output = tmp_path / "long_secured.pdf"
    config = WatermarkConfig(
        text="CONFIDENTIAL - INTERNAL DOCUMENT - ARWIN NABIEL",
        type=mode,
        fontSize=size,
        angle=45,
    )
    process_pdf(str(source), str(output), config.model_dump(), ProcessingSettings())
    verify_output(output, [(320, 440)])


def test_corrupt_custom_font_uses_safe_installed_fallback(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    (tmp_path / "arial.ttf").write_bytes(b"not a font")
    monkeypatch.setenv("WATERMARK_FONT_DIR", str(tmp_path))
    font = load_font("Arial", 32)
    assert font.getbbox("CONFIDENTIAL")[2] > 0


def test_negative_content_length_and_error_cors() -> None:
    with TestClient(create_app()) as client:
        response = client.post(
            "/api/pdf/process",
            content=b"",
            headers={"Content-Length": "-1", "Origin": "http://localhost:3000"},
        )
        assert response.status_code == 400
        assert response.json() == {"detail": "Content-Length tidak valid."}
        assert (
            response.headers["access-control-allow-origin"] == "http://localhost:3000"
        )
