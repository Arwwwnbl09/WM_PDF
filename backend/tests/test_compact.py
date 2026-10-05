import random
from dataclasses import replace
from io import BytesIO
from pathlib import Path

import pymupdf
import pytest
from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageStat

from app.core import ProcessingSettings
from app.models import WatermarkConfig
from app.services import pdf_service
from app.services.compression_service import compress_raster, palette_is_faithful
from app.services.pdf_service import insert_encoded_image, process_pdf, verify_output


def compact_settings() -> ProcessingSettings:
    return replace(ProcessingSettings(), dpi=150, jpeg_quality=75, jpeg_subsampling=0)


def test_tight_budget_keeps_color_resolution_and_all_pages(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    source, output = tmp_path / "dense.pdf", tmp_path / "compact.pdf"
    dimensions = [(595, 842)] * 3
    with pymupdf.open() as document:
        for index in range(3):
            page = document.new_page(width=595, height=842)
            for row in range(65):
                page.insert_text(
                    (30, 40 + row * 11),
                    f"Page {index + 1} row {row + 1}: pressure 123.456 kPa; temperature 37 C.",
                    fontsize=8,
                )
            page.draw_rect((30, 775, 100, 820), fill=(0.1, 0.2, 0.8))
        document.save(source)
    # An impossible target must not blur the pages to satisfy a byte budget.
    monkeypatch.setattr(pdf_service, "COMPACT_TARGET_BYTES", 1)
    config = WatermarkConfig(
        text="INTERNAL", color="#FF0000", opacity=1, outputQuality="compact"
    )
    result = process_pdf(
        str(source), str(output), config.model_dump(), ProcessingSettings()
    )
    verify_output(output, dimensions)
    assert result["pages"] == 3
    assert result["output_bytes"] == output.stat().st_size > 1
    with pymupdf.open(output) as document:
        for page in document:
            info = document.extract_image(page.get_images()[0][0])
            assert abs(info["width"] - 595 * 150 / 72) <= 1
            assert abs(info["height"] - 842 * 150 / 72) <= 1
            pixmap = page.get_pixmap()
            assert pixmap.pixel(50, 800)[2] > pixmap.pixel(50, 800)[0] + 50
            pixels = memoryview(pixmap.samples)
            assert any(
                pixels[i] > 150 and pixels[i + 1] < 100 and pixels[i + 2] < 100
                for i in range(0, len(pixels), 3)
            )


def test_impossible_photo_budget_keeps_resolution_and_jpeg_quality_floor() -> None:
    settings = compact_settings()
    size = (300, 400)
    with Image.frombytes(
        "RGB", size, random.Random(73).randbytes(300 * 400 * 3)
    ) as image:
        ImageDraw.Draw(image).rectangle((20, 20, 100, 100), fill="red")
        encoded = compress_raster(image, settings, budget=1)
        floor_jpeg = BytesIO()
        image.save(floor_jpeg, format="JPEG", quality=70, subsampling=0)
    assert encoded.palette is None
    assert encoded.size == size
    assert len(encoded.data) > 1
    with (
        Image.open(BytesIO(encoded.data)) as decoded,
        Image.open(BytesIO(floor_jpeg.getvalue())) as quality_floor,
    ):
        assert decoded.mode == "RGB"
        assert decoded.size == size
        assert decoded.quantization == quality_floor.quantization
        red, green, blue = decoded.getpixel((50, 50))
        assert red > 200 and green < 50 and blue < 50


def test_palette_round_trip_preserves_small_text_thin_lines_and_color_exactly(
    tmp_path: Path,
) -> None:
    size = (501, 701)  # Odd dimensions also exercise index row boundaries.
    with Image.new("RGB", size, "white") as image:
        draw = ImageDraw.Draw(image)
        draw.text(
            (12, 12),
            "Pressure 123.456 kPa",
            font=ImageFont.load_default(size=16),
            fill="black",
        )
        draw.line((12, 35, 480, 35), fill="black", width=1)
        draw.rectangle((12, 55, 35, 75), fill=(20, 60, 180))
        draw.rectangle((50, 55, 75, 75), fill=(230, 30, 15))
        assert image.getcolors(256) is not None
        expected = image.tobytes()
        encoded = compress_raster(image, compact_settings(), budget=1024 * 1024)
    assert encoded.palette is not None
    assert encoded.size == size
    output = tmp_path / "exact-palette.pdf"
    dimensions = [(size[0] * 72 / 150, size[1] * 72 / 150)]
    with pymupdf.open() as document:
        page = document.new_page(width=dimensions[0][0], height=dimensions[0][1])
        insert_encoded_image(page, encoded)
        document.save(output, garbage=3, deflate=True)
    verify_output(output, dimensions)
    with pymupdf.open(output) as document:
        info = document[0].get_images(full=True)[0]
        assert info[5] == "Indexed"
        assert info[8] == "FlateDecode"
        assert info[1] == 0
        image_data = document.extract_image(info[0])["image"]
    with Image.open(BytesIO(image_data)) as decoded, decoded.convert("RGB") as rgb:
        assert rgb.size == size
        assert rgb.tobytes() == expected


def test_palette_admission_preserves_full_page_and_tiny_colored_legend() -> None:
    size = (600, 800)
    with Image.new("RGB", size, "white") as image:
        draw = ImageDraw.Draw(image)
        for x in range(256):
            draw.line((x, 0, x, 799), fill=(x, x, x))
        # Over 256 colors require quantization; a page average alone is not enough
        # to protect these small saturated legend entries.
        draw.rectangle((400, 400, 405, 405), fill=(255, 0, 0))
        draw.rectangle((412, 400, 417, 405), fill=(0, 255, 0))
        draw.rectangle((424, 400, 429, 405), fill=(0, 0, 255))
        assert image.getcolors(256) is None
        encoded = compress_raster(image, compact_settings(), budget=1024 * 1024)
        assert encoded.palette is not None
        with Image.frombytes("P", encoded.size, encoded.data) as indexed:
            indexed.putpalette(encoded.palette)
            with (
                indexed.convert("RGB") as decoded,
                ImageChops.difference(image, decoded) as diff,
            ):
                stats = ImageStat.Stat(diff)
                assert max(high for _, high in stats.extrema) <= 12
                assert max(stats.mean) <= 1.5
                assert max(stats.rms) <= 2
                assert decoded.getpixel((402, 402)) == (255, 0, 0)
                assert decoded.getpixel((414, 402)) == (0, 255, 0)
                assert decoded.getpixel((426, 402)) == (0, 0, 255)


def test_photo_falls_back_to_jpeg_even_with_unrestricted_budget() -> None:
    size = (300, 400)
    with Image.frombytes(
        "RGB", size, random.Random(29).randbytes(300 * 400 * 3)
    ) as image:
        encoded = compress_raster(image, compact_settings(), budget=1024 * 1024)
    assert encoded.palette is None
    assert encoded.size == size
    with Image.open(BytesIO(encoded.data)) as decoded:
        assert decoded.size == size
        assert decoded.mode == "RGB"


def test_palette_rejects_erased_tiny_label_despite_low_page_average() -> None:
    with (
        Image.new("RGB", (600, 800), "white") as image,
        Image.new("P", image.size, 0) as damaged_candidate,
    ):
        image.putpixel((400, 400), (255, 0, 0))
        damaged_candidate.putpalette([255, 255, 255])
        with (
            damaged_candidate.convert("RGB") as damaged,
            ImageChops.difference(image, damaged) as diff,
        ):
            assert max(ImageStat.Stat(diff).mean) < 0.001
        assert not palette_is_faithful(image, damaged_candidate)


def test_mixed_indexed_and_jpeg_pdf_preserves_structure_and_page_order(
    tmp_path: Path,
) -> None:
    source, output = tmp_path / "mixed.pdf", tmp_path / "secured.pdf"
    dimensions = [(216, 288), (288, 216)]
    with pymupdf.open() as document:
        page = document.new_page(width=216, height=288)
        page.insert_text((20, 35), "Small technical text 123.456", fontsize=8)
        page.add_text_annot((10, 10), "private annotation")
        document.embfile_add("private.txt", b"private attachment")
        page = document.new_page(width=288, height=216)
        with (
            Image.frombytes(
                "RGB", (600, 450), random.Random(91).randbytes(600 * 450 * 3)
            ) as image,
            BytesIO() as image_bytes,
        ):
            image.save(image_bytes, format="PNG")
            page.insert_image(page.rect, stream=image_bytes.getvalue())
        document.save(source)
    config = WatermarkConfig(
        text="INTERNAL", color="#000000", opacity=1, angle=0, outputQuality="compact"
    )
    process_pdf(str(source), str(output), config.model_dump(), ProcessingSettings())
    verify_output(output, dimensions)
    with pymupdf.open(output) as document:
        assert document.page_count == 2
        assert document.embfile_count() == 0
        assert not document.get_ocgs()
        assert [page.get_images()[0][8] for page in document] == [
            "FlateDecode",
            "DCTDecode",
        ]
        for page in document:
            assert len(page.get_images()) == 1
            assert page.get_images()[0][1] == 0
            assert not page.get_text().strip()
            assert not list(page.annots() or [])
            assert not list(page.widgets() or [])
            assert not page.get_links()
            assert page.get_pixmap().width > 0
