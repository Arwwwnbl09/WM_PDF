from pathlib import Path

import pymupdf
import pytest
from conftest import create_pdf
from pydantic import ValidationError

from app.core import OUTPUT_PROFILES, ProcessingError, ProcessingSettings
from app.models import WatermarkConfig
from app.services.pdf_service import process_pdf, verify_output


@pytest.mark.parametrize("mode", ["single", "repeated"])
def test_quality_presets_compress_and_keep_all_pages(tmp_path: Path, mode: str) -> None:
    source = tmp_path / "input.pdf"
    dimensions = [(595, 842), (842, 595)]
    create_pdf(source, dimensions)
    sizes = {}
    for quality, (dpi, _, _) in OUTPUT_PROFILES.items():
        output = tmp_path / f"{quality}.pdf"
        config = WatermarkConfig(
            text="INTERNAL USE ONLY",
            type=mode,
            outputQuality=quality,
            color="#FF0000",
            opacity=1,
            angle=0,
        )
        process_pdf(str(source), str(output), config.model_dump(), ProcessingSettings())
        verify_output(output, dimensions)
        sizes[quality] = output.stat().st_size
        with pymupdf.open(output) as document:
            for page, (width, height) in zip(document, dimensions, strict=True):
                info = document.extract_image(page.get_images()[0][0])
                assert abs(info["width"] - width * dpi / 72) <= 1
                assert abs(info["height"] - height * dpi / 72) <= 1
                # The watermark is present in the page raster in every preset.
                pixmap = page.get_pixmap()
                pixels = memoryview(pixmap.samples)
                assert any(
                    pixels[i] > 150 and pixels[i + 1] < 100 and pixels[i + 2] < 100
                    for i in range(0, len(pixels), 3)
                )
    # Compact preserves balanced's text resolution and can exceed economy's
    # lower-resolution JPEG on photos. This text fixture benefits from Flate.
    assert sizes["compact"] < sizes["balanced"]
    assert sizes["economy"] < sizes["balanced"] < sizes["high"]
    assert sizes["balanced"] < sizes["high"] * 0.6


@pytest.mark.parametrize("quality", list(OUTPUT_PROFILES))
def test_quality_does_not_override_resource_limits(
    tmp_path: Path, quality: str
) -> None:
    source = tmp_path / "input.pdf"
    create_pdf(source, [(595, 842)])
    output = tmp_path / "output.pdf"
    config = WatermarkConfig(text="TEST", outputQuality=quality)
    with pytest.raises(ProcessingError, match="terlalu besar"):
        process_pdf(
            str(source),
            str(output),
            config.model_dump(),
            ProcessingSettings(max_pixels_per_page=100),
        )
    assert not output.exists()


@pytest.mark.parametrize("quality", ["strong", "low", "HIGH", 150, None, ""])
def test_invalid_output_quality_rejected(quality: object) -> None:
    with pytest.raises(ValidationError):
        WatermarkConfig.model_validate({"text": "TEST", "outputQuality": quality})


def test_default_compact_and_exactly_four_quality_profiles() -> None:
    assert WatermarkConfig(text="TEST").outputQuality == "compact"
    assert set(OUTPUT_PROFILES) == {"compact", "economy", "balanced", "high"}
    with pytest.raises(ValidationError):
        WatermarkConfig.model_validate({"text": "TEST", "dpi": 1000})
