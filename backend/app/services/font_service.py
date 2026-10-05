import os
from pathlib import Path

from PIL import ImageFont

from app.core import ProcessingError
from app.models import WatermarkFont

FONT_FILES: dict[str, tuple[str, ...]] = {
    "Arial": ("arial.ttf", "LiberationSans-Regular.ttf", "DejaVuSans.ttf"),
    "Helvetica": ("arial.ttf", "LiberationSans-Regular.ttf", "DejaVuSans.ttf"),
    "Times New Roman": ("times.ttf", "LiberationSerif-Regular.ttf", "DejaVuSerif.ttf"),
    "Courier": ("cour.ttf", "LiberationMono-Regular.ttf", "DejaVuSansMono.ttf"),
    "Georgia": ("georgia.ttf", "DejaVuSerif.ttf", "LiberationSerif-Regular.ttf"),
}


def load_font(name: WatermarkFont, size: int) -> ImageFont.FreeTypeFont:
    directories: list[Path] = []
    if custom := os.getenv("WATERMARK_FONT_DIR"):
        directories.append(Path(custom))
    if os.name == "nt":
        directories.append(Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts")
    directories.extend(
        [
            Path("/usr/share/fonts/truetype/liberation2"),
            Path("/usr/share/fonts/truetype/liberation"),
            Path("/usr/share/fonts/truetype/dejavu"),
            Path("/Library/Fonts"),
        ]
    )
    for filename in FONT_FILES[name]:
        for directory in directories:
            path = directory / filename
            if path.is_file():
                try:
                    return ImageFont.truetype(str(path), max(1, size))
                except OSError:
                    continue
        try:
            return ImageFont.truetype(filename, max(1, size))
        except OSError:
            continue
    raise ProcessingError(
        "Font watermark tidak tersedia. Hubungi pengelola aplikasi.", 500
    )
