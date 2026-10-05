import json
from pathlib import Path

import pymupdf
import pytest
from conftest import create_pdf
from fastapi.testclient import TestClient
from PIL import Image, ImageChops
from pydantic import ValidationError

from app.api.pdf import secured_filename
from app.core import ProcessingError, ProcessingSettings
from app.main import create_app
from app.models import WatermarkConfig
from app.services.pdf_service import process_pdf, verify_output
from app.services.watermark_service import (
    burn_watermark,
    make_watermark,
)


def assert_raster_pdf(path: Path, expected: list[tuple[float, float]]) -> None:
    verify_output(path, expected)
    with pymupdf.open(path) as document:
        assert document.page_count == len(expected)
        assert document.metadata["author"] == ""
        assert document.metadata["title"] == ""
        assert document.embfile_count() == 0
        assert not document.get_ocgs()
        for page in document:
            assert not list(page.annots() or [])
            assert not list(page.widgets() or [])
            assert not page.get_text().strip()
            assert not page.get_links()
            images = page.get_images(full=True)
            assert len(images) == 1
            assert images[0][8] in {"DCTDecode", "FlateDecode"}
            assert images[0][1] == 0  # No separable transparency/watermark mask.
            # Also decode/render each output page, not just its page tree.
            pixmap = page.get_pixmap(dpi=72)
            assert pixmap.width > 0 and pixmap.height > 0


@pytest.mark.parametrize(
    "dimensions", [[(595, 842)], [(842, 595)], [(595, 842), (842, 595), (612, 792)]]
)
def test_real_output_all_pages_and_sizes(
    tmp_path: Path, dimensions: list[tuple[float, float]], config: WatermarkConfig
) -> None:
    source = tmp_path / "input.pdf"
    output = tmp_path / "output.pdf"
    create_pdf(source, dimensions)
    result = process_pdf(
        str(source), str(output), config.model_dump(), ProcessingSettings()
    )
    assert result["pages"] == len(dimensions)
    assert_raster_pdf(output, dimensions)
    with pymupdf.open(output) as document:
        for page, (width, height) in zip(document, dimensions, strict=True):
            image = document.extract_image(page.get_images()[0][0])
            assert (
                image["width"] == round(width * 150 / 72)
                or abs(image["width"] - width * 150 / 72) <= 1
            )
            assert abs(image["height"] - height * 150 / 72) <= 1


def test_rotated_crop_annotations_attachments_and_page_order(
    tmp_path: Path, config: WatermarkConfig
) -> None:
    source, output = tmp_path / "mixed.pdf", tmp_path / "secured.pdf"
    with pymupdf.open() as document:
        for index, color in enumerate([(1, 0, 0), (0, 1, 0), (0, 0, 1)]):
            page = document.new_page(width=200 + index * 20, height=300)
            page.draw_rect(page.rect, color=color, fill=color)
            if index == 1:
                page.set_rotation(90)
            if index == 2:
                page.set_cropbox(pymupdf.Rect(10, 20, 220, 280))
            page.add_text_annot((50, 50), "ANNOTATION PRIVATE")
            page.insert_link(
                {
                    "kind": pymupdf.LINK_URI,
                    "from": pymupdf.Rect(10, 10, 50, 20),
                    "uri": "https://example.com",
                }
            )
        document.embfile_add("private.txt", b"private attachment")
        document.add_ocg("private layer")
        document.save(source)
    with pymupdf.open(source) as document:
        dimensions = [(page.rect.width, page.rect.height) for page in document]
    process_pdf(str(source), str(output), config.model_dump(), ProcessingSettings())
    assert_raster_pdf(output, dimensions)
    with pymupdf.open(output) as document:
        for index, page in enumerate(document):
            pixmap = page.get_pixmap(dpi=72)
            pixel = pixmap.pixel(5, 5)
            assert pixel[index] > 200 and sum(pixel) < 310


@pytest.mark.parametrize(
    "position",
    [
        f"{row}-{column}"
        for row in ["top", "middle", "bottom"]
        for column in ["left", "center", "right"]
    ],
)
def test_nine_positions_are_inside_page(position: str) -> None:
    settings = ProcessingSettings()
    config = WatermarkConfig(text="TEST", position=position, color="#FF0000", opacity=1)
    with (
        Image.new("RGB", (1800, 2400), "white") as image,
        burn_watermark(image, config, settings) as result,
    ):
        bounds = ImageChops.difference(image, result).getbbox()
        assert bounds
        left, top, right, bottom = bounds
        assert left > 0 and top > 0 and right < image.width and bottom < image.height
        vertical, horizontal = position.split("-")
        center_x, center_y = (left + right) / 2, (top + bottom) / 2
        if horizontal == "left":
            assert center_x < image.width / 2
        elif horizontal == "right":
            assert center_x > image.width / 2
        else:
            assert abs(center_x - image.width / 2) < 5
        if vertical == "top":
            assert center_y < image.height / 2
        elif vertical == "bottom":
            assert center_y > image.height / 2
        else:
            assert abs(center_y - image.height / 2) < 5


@pytest.mark.parametrize("angle", [0, 45, -45, 90])
def test_repeated_covers_edges_and_spacing_changes(angle: float) -> None:
    settings = ProcessingSettings()
    config = WatermarkConfig(
        text="TEST",
        fontSize=20,
        angle=angle,
        type="repeated",
        color="#FF0000",
        opacity=1,
        spaceX=0,
        spaceY=0,
    )
    with (
        Image.new("RGB", (1400, 1800), "white") as image,
        burn_watermark(image, config, settings) as result,
    ):
        with ImageChops.difference(image, result) as diff:
            for box in [
                (0, 0, 1400, 250),
                (0, 1550, 1400, 1800),
                (0, 0, 300, 1800),
                (1100, 0, 1400, 1800),
            ]:
                with diff.crop(box) as band:
                    assert band.getbbox()
            dense_pixels = sum(
                1 for pixel in diff.get_flattened_data() if max(pixel) > 40
            )
        sparse = config.model_copy(update={"spaceX": 60.0, "spaceY": 60.0})
        with (
            burn_watermark(image, sparse, settings) as spaced,
            ImageChops.difference(image, spaced) as diff,
        ):
            assert (
                sum(1 for pixel in diff.get_flattened_data() if max(pixel) > 40)
                < dense_pixels
            )


@pytest.mark.parametrize("color", ["#FF0000", "#4287F5", "#12B76A", "#000000"])
@pytest.mark.parametrize("opacity", [0.1, 0.4, 0.8, 1.0])
def test_colors_and_opacity(color: str, opacity: float) -> None:
    config = WatermarkConfig(text="MMMM", color=color, opacity=opacity, angle=0)
    rgb = tuple(int(color[i : i + 2], 16) for i in (1, 3, 5))
    with (
        Image.new("RGB", (1400, 1800), "white") as image,
        burn_watermark(image, config, ProcessingSettings()) as result,
    ):
        # Solid glyph interiors should match source-over blending, within rounding.
        strongest = min(result.get_flattened_data(), key=sum)
        expected = tuple(
            round(255 * (1 - opacity) + channel * opacity) for channel in rgb
        )
        assert all(
            abs(actual - target) <= 2
            for actual, target in zip(strongest, expected, strict=True)
        )


@pytest.mark.parametrize("angle", [0, 45, -45, 90])
def test_angle_geometry(angle: float) -> None:
    config = WatermarkConfig(text="CONFIDENTIAL", angle=angle, opacity=1)
    with make_watermark(config, (2200, 3000), ProcessingSettings()) as mark:
        if angle == 0:
            assert mark.width > mark.height * 3
        elif angle == 90:
            assert mark.height > mark.width * 3
        else:
            assert 0.8 < mark.width / mark.height < 1.2
            # Actual glyphs have asymmetric corners; check rotation direction via
            # the pixel mask's covariance rather than requiring a square crop.
            with mark.getchannel("A") as alpha:
                points = [
                    (index % mark.width, index // mark.width, weight)
                    for index, weight in enumerate(alpha.get_flattened_data())
                    if weight
                ]
                mass = sum(weight for _, _, weight in points)
                center_x = sum(x * weight for x, _, weight in points) / mass
                center_y = sum(y * weight for _, y, weight in points) / mass
                covariance = sum(
                    (x - center_x) * (y - center_y) * weight for x, y, weight in points
                )
                assert covariance * angle < 0


def test_oversized_single_fits_and_white_background() -> None:
    config = WatermarkConfig(text="CONFIDENTIAL " * 12, fontSize=200, opacity=1)
    with (
        Image.new("RGBA", (500, 700), (0, 0, 0, 0)) as image,
        burn_watermark(image, config, ProcessingSettings()) as result,
    ):
        assert result.mode == "RGB"
        assert result.getpixel((0, 0)) == (255, 255, 255)
        assert result.getbbox() == (0, 0, 500, 700)


@pytest.mark.parametrize(
    "patch",
    [
        {"text": " "},
        {"color": "red"},
        {"opacity": 1.1},
        {"angle": 181},
        {"fontSize": 201},
        {"spaceX": -1},
        {"type": "annotation"},
        {"font": "unknown"},
    ],
)
def test_config_validation(patch: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        WatermarkConfig.model_validate({"text": "CONFIDENTIAL", **patch})


def test_pixel_page_file_limits_and_failure_cleanup(
    tmp_path: Path, config: WatermarkConfig, monkeypatch: pytest.MonkeyPatch
) -> None:
    source, output = tmp_path / "in.pdf", tmp_path / "out.pdf"
    create_pdf(source, [(320, 440), (320, 440)])
    for settings, message in [
        (ProcessingSettings(max_pages=1), "halaman"),
        (ProcessingSettings(max_pixels_per_page=100), "terlalu besar"),
        (ProcessingSettings(max_file_bytes=1), "terlalu besar"),
    ]:
        with pytest.raises(ProcessingError, match=message):
            process_pdf(str(source), str(output), config.model_dump(), settings)
        assert not output.exists()
    import app.services.pdf_service as service

    original = service.insert_raster_page
    calls = 0

    def fail_second(*args: object) -> int:
        nonlocal calls
        calls += 1
        if calls == 2:
            raise RuntimeError("unexpected detail should not be exposed")
        return original(*args)

    monkeypatch.setattr(service, "insert_raster_page", fail_second)
    with pytest.raises(ProcessingError) as caught:
        process_pdf(str(source), str(output), config.model_dump(), ProcessingSettings())
    assert calls == 2
    assert "unexpected detail" not in str(caught.value)
    assert not output.exists()
    source.unlink()  # Closed input handle (also works on Windows).


def test_100_pages_no_page_loss(tmp_path: Path, config: WatermarkConfig) -> None:
    source, output = tmp_path / "100.pdf", tmp_path / "100_secured.pdf"
    create_pdf(source, [(100, 120)] * 100)
    process_pdf(str(source), str(output), config.model_dump(), ProcessingSettings())
    assert_raster_pdf(output, [(100, 120)] * 100)


def test_empty_corrupt_zero_page_encrypted(
    tmp_path: Path, config: WatermarkConfig
) -> None:
    source, output = tmp_path / "bad.pdf", tmp_path / "out.pdf"
    for content in [
        b"",
        b"not a pdf",
        b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Count 0 /Kids [] >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF",
    ]:
        source.write_bytes(content)
        with pytest.raises(ProcessingError):
            process_pdf(
                str(source), str(output), config.model_dump(), ProcessingSettings()
            )
        assert not output.exists()
    create_pdf(source, [(320, 440)], encrypted=True)
    with pytest.raises(ProcessingError, match="dilindungi kata sandi"):
        process_pdf(str(source), str(output), config.model_dump(), ProcessingSettings())


def test_http_endpoint_download_swagger_and_temp_cleanup(
    source: Path,
    config: WatermarkConfig,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    from tempfile import TemporaryDirectory

    import app.api.pdf as route

    allocated: list[Path] = []

    def tracked_temp(*args: object, **kwargs: object) -> TemporaryDirectory[str]:
        directory = TemporaryDirectory(dir=tmp_path, prefix="tracked-")
        allocated.append(Path(directory.name))
        return directory

    monkeypatch.setattr(route, "TemporaryDirectory", tracked_temp)
    with TestClient(create_app()) as client:
        assert client.get("/health").json() == {"status": "ok"}
        assert client.get("/docs").status_code == 200
        schema = client.get("/openapi.json").json()
        assert (
            "application/pdf"
            in schema["paths"]["/api/pdf/process"]["post"]["responses"]["200"][
                "content"
            ]
        )
        response = client.post(
            "/api/pdf/process",
            files={
                "file": ("../../document.pdf", source.read_bytes(), "application/pdf")
            },
            data={"config": config.model_dump_json()},
        )
        assert response.status_code == 200, response.text[:100]
        assert response.headers["content-type"] == "application/pdf"
        assert "document_secured.pdf" in response.headers["content-disposition"]
        assert response.headers["cache-control"] == "no-store"
        output = tmp_path / "download.pdf"
        output.write_bytes(response.content)
        assert_raster_pdf(output, [(320, 440)])
        assert allocated and all(not path.exists() for path in allocated)
        for content, filename, mime, expected in [
            (b"corrupt", "bad.pdf", "application/pdf", 422),
            (b"", "empty.pdf", "application/pdf", 422),
            (b"text", "bad.txt", "text/plain", 415),
        ]:
            failed = client.post(
                "/api/pdf/process",
                files={"file": (filename, content, mime)},
                data={"config": config.model_dump_json()},
            )
            assert failed.status_code == expected
        invalid = client.post(
            "/api/pdf/process",
            files={"file": ("test.pdf", source.read_bytes(), "application/pdf")},
            data={"config": json.dumps({"text": " "})},
        )
        assert invalid.status_code == 422
        assert all(not path.exists() for path in allocated)


def test_http_file_limit(source: Path, config: WatermarkConfig) -> None:
    with TestClient(create_app(ProcessingSettings(max_file_bytes=100))) as client:
        response = client.post(
            "/api/pdf/process",
            files={"file": ("large.pdf", source.read_bytes(), "application/pdf")},
            data={"config": config.model_dump_json()},
        )
        assert response.status_code == 413
        response = client.post(
            "/api/pdf/process",
            content=b"x" * (1024 * 1024 + 101),
            headers={"Content-Type": "multipart/form-data; boundary=test"},
        )
        assert response.status_code == 413


@pytest.mark.parametrize(
    "name", ["../../document.pdf", "C:\\folder\\document.pdf", 'document\r\n".pdf']
)
def test_filename_safe(name: str) -> None:
    assert re_safe_filename(secured_filename(name))


def re_safe_filename(name: str) -> bool:
    import re

    return re.fullmatch(r"[a-zA-Z0-9_.-]+_secured\.pdf", name) is not None


def test_default_page_and_pixel_limits(tmp_path: Path, config: WatermarkConfig) -> None:
    source, output = tmp_path / "oversized.pdf", tmp_path / "out.pdf"
    create_pdf(source, [(100, 120)] * 201)
    with pytest.raises(ProcessingError, match="200 halaman"):
        process_pdf(str(source), str(output), config.model_dump(), ProcessingSettings())
    create_pdf(source, [(10000, 10000)])
    assert source.stat().st_size < 10000
    with pytest.raises(ProcessingError, match="terlalu besar"):
        process_pdf(str(source), str(output), config.model_dump(), ProcessingSettings())
    assert not output.exists()


def test_endpoint_password_and_busy(tmp_path: Path, config: WatermarkConfig) -> None:
    source = tmp_path / "encrypted.pdf"
    create_pdf(source, [(320, 440)], encrypted=True)
    application = create_app()
    with TestClient(application) as client:
        response = client.post(
            "/api/pdf/process",
            files={"file": ("encrypted.pdf", source.read_bytes(), "application/pdf")},
            data={"config": config.model_dump_json()},
        )
        assert response.status_code == 422
        assert "PDF dilindungi kata sandi" in response.json()["detail"]
        application.state.processing_gate.acquire()
        try:
            response = client.post(
                "/api/pdf/process",
                files={"file": ("test.pdf", source.read_bytes(), "application/pdf")},
                data={"config": config.model_dump_json()},
            )
            assert response.status_code == 503
        finally:
            application.state.processing_gate.release()


def test_response_failure_also_cleans_temp(tmp_path: Path) -> None:
    import asyncio
    from tempfile import TemporaryDirectory

    from app.api.pdf import TemporaryPdfResponse

    directory = TemporaryDirectory(dir=tmp_path)
    path = Path(directory.name)
    output = path / "response.pdf"
    output.write_bytes(b"sample response body")
    response = TemporaryPdfResponse(output, "safe_secured.pdf", directory)

    async def send_failure(message: object) -> None:
        raise RuntimeError("simulated disconnected response")

    async def receive() -> dict[str, object]:
        return {"type": "http.disconnect"}

    scope = {"type": "http", "method": "GET", "headers": [], "extensions": {}}
    with pytest.raises(RuntimeError, match="simulated"):
        asyncio.run(response(scope, receive, send_failure))
    assert not path.exists()


def test_chunked_request_limit_before_parser() -> None:
    import asyncio

    from app.middleware import BodyLimitMiddleware

    messages: list[dict[str, object]] = []
    chunks = iter([b"123456", b"789012"])

    async def unexpected_app(scope: object, receive: object, send: object) -> None:
        raise AssertionError("Oversized body should never reach multipart parser")

    async def receive() -> dict[str, object]:
        return {"type": "http.request", "body": next(chunks), "more_body": True}

    async def send(message: dict[str, object]) -> None:
        messages.append(message)

    middleware = BodyLimitMiddleware(unexpected_app, max_bytes=10)
    asyncio.run(
        middleware({"type": "http", "method": "POST", "headers": []}, receive, send)
    )
    assert messages[0]["status"] == 413
