import math

from PIL import Image, ImageColor, ImageDraw

from app.core import ProcessingError, ProcessingSettings
from app.models import WatermarkConfig
from app.services.font_service import load_font


def mm_to_pixels(mm: float, dpi: int) -> float:
    return mm / 25.4 * dpi


def make_watermark(
    config: WatermarkConfig, page_size: tuple[int, int], settings: ProcessingSettings
) -> Image.Image:
    size = max(1, round(config.fontSize * settings.dpi / 72))
    font = load_font(config.font, size)
    bounds = font.getbbox(config.text)
    width, height = max(1, bounds[2] - bounds[0]), max(1, bounds[3] - bounds[1])
    radians = math.radians(config.angle)
    rotated_width = abs(width * math.cos(radians)) + abs(height * math.sin(radians))
    rotated_height = abs(width * math.sin(radians)) + abs(height * math.cos(radians))
    if config.type == "single":
        padding = mm_to_pixels(8, settings.dpi)
        fit = min(
            1,
            max(1, page_size[0] - 2 * padding) / max(1, rotated_width + 4),
            max(1, page_size[1] - 2 * padding) / max(1, rotated_height + 4),
        )
        if fit < 1:
            font = load_font(config.font, max(1, int(size * fit)))
            bounds = font.getbbox(config.text)
            width, height = max(1, bounds[2] - bounds[0]), max(1, bounds[3] - bounds[1])
            rotated_width = abs(width * math.cos(radians)) + abs(
                height * math.sin(radians)
            )
            rotated_height = abs(width * math.sin(radians)) + abs(
                height * math.cos(radians)
            )
    # Single has already been fitted to the validated page. Its diagonal bounding
    # rectangle can legitimately exceed the smaller Repeated tile budget.
    pixel_budget = (
        min(page_size[0] * page_size[1], settings.max_pixels_per_page)
        if config.type == "single"
        else settings.max_watermark_pixels
    )
    if math.ceil(rotated_width + 4) * math.ceil(rotated_height + 4) > pixel_budget:
        raise ProcessingError(
            "Watermark terlalu besar. Kurangi panjang teks atau ukuran huruf."
        )
    mark = Image.new("RGBA", (width + 4, height + 4), (0, 0, 0, 0))
    try:
        color = ImageColor.getrgb(config.color) + (round(config.opacity * 255),)
        ImageDraw.Draw(mark).text(
            (2 - bounds[0], 2 - bounds[1]), config.text, font=font, fill=color
        )
        rotated = mark.rotate(
            config.angle, resample=Image.Resampling.BICUBIC, expand=True
        )
        with rotated.getchannel("A") as alpha:
            visible = alpha.getbbox()
        if visible:
            cropped = rotated.crop(visible)
            rotated.close()
            return cropped
        return rotated
    finally:
        mark.close()


def single_position(
    page_size: tuple[int, int], mark_size: tuple[int, int], position: str, dpi: int
) -> tuple[int, int]:
    width, height = page_size
    mark_width, mark_height = mark_size
    padding = round(mm_to_pixels(8, dpi))
    vertical, horizontal = position.split("-")
    left = (
        padding
        if horizontal == "left"
        else width - padding - mark_width
        if horizontal == "right"
        else (width - mark_width) // 2
    )
    top = (
        padding
        if vertical == "top"
        else height - padding - mark_height
        if vertical == "bottom"
        else (height - mark_height) // 2
    )
    return max(0, min(width - mark_width, left)), max(0, min(height - mark_height, top))


def burn_watermark(
    image: Image.Image, config: WatermarkConfig, settings: ProcessingSettings
) -> Image.Image:
    # Compositing goes directly onto the raster; no page-sized overlay copy is retained.
    with (
        image.convert("RGBA") as raster,
        make_watermark(config, image.size, settings) as mark,
    ):
        if config.type == "single":
            if mark.width > raster.width or mark.height > raster.height:
                ratio = min(raster.width / mark.width, raster.height / mark.height)
                with mark.resize(
                    (max(1, int(mark.width * ratio)), max(1, int(mark.height * ratio))),
                    Image.Resampling.LANCZOS,
                ) as fitted:
                    raster.alpha_composite(
                        fitted,
                        dest=single_position(
                            raster.size, fitted.size, config.position, settings.dpi
                        ),
                    )
            else:
                raster.alpha_composite(
                    mark,
                    dest=single_position(
                        raster.size, mark.size, config.position, settings.dpi
                    ),
                )
        else:
            step_x = max(
                1, round(mark.width + mm_to_pixels(config.spaceX, settings.dpi))
            )
            step_y = max(
                1, round(mark.height + mm_to_pixels(config.spaceY, settings.dpi))
            )
            rows = math.ceil((raster.height + mark.height) / step_y) + 1
            # Bound CPU work for tiny glyphs with zero spacing before drawing any tile.
            columns = math.ceil((raster.width + 2 * mark.width + step_x) / step_x)
            if rows * columns > settings.max_repeated_marks_per_page:
                raise ProcessingError(
                    "Watermark berulang terlalu padat. Perbesar jarak atau ukuran huruf."
                )
            for row in range(rows):
                y = row * step_y - mark.height // 2
                shift = step_x // 2 if row % 2 else 0
                for x in range(
                    -step_x - mark.width // 2 + shift, raster.width + mark.width, step_x
                ):
                    raster.alpha_composite(mark, dest=(x, y))
        # Flatten transparency over white explicitly, before JPEG encoding.
        with Image.new("RGBA", raster.size, (255, 255, 255, 255)) as white:
            white.alpha_composite(raster)
            return white.convert("RGB")
