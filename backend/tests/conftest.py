from pathlib import Path

import pymupdf
import pytest

from app.models import WatermarkConfig


@pytest.fixture
def config() -> WatermarkConfig:
    return WatermarkConfig(text="CONFIDENTIAL", outputQuality="compact")


def create_pdf(
    path: Path,
    dimensions: list[tuple[float, float]],
    encrypted: bool = False,
    rotated: bool = False,
) -> None:
    with pymupdf.open() as document:
        for index, (width, height) in enumerate(dimensions):
            page = document.new_page(width=width, height=height)
            page.insert_text((20, 30), f"ORIGINAL PAGE {index + 1}", fontsize=12)
            page.draw_rect(
                pymupdf.Rect(10, height - 45, 80, height - 10),
                color=(0.1, 0.25, 0.4),
                fill=(0.1, 0.25, 0.4),
            )
            if rotated:
                page.set_rotation(90)
        document.set_metadata(
            {"title": "PRIVATE ORIGINAL METADATA", "author": "SENSITIVE AUTHOR"}
        )
        if encrypted:
            document.save(
                path,
                encryption=pymupdf.PDF_ENCRYPT_AES_256,
                owner_pw="owner",
                user_pw="secret",
            )
        else:
            document.save(path)


@pytest.fixture
def source(tmp_path: Path) -> Path:
    path = tmp_path / "source.pdf"
    create_pdf(path, [(320, 440)])
    return path
