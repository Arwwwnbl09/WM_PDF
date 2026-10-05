from dataclasses import dataclass

DEFAULT_RENDER_DPI = 300
IMAGE_FORMAT = "JPEG"
JPEG_QUALITY = 85
# (DPI, JPEG quality, chroma subsampling).
OUTPUT_PROFILES = {
    "compact": (150, 75, 0),
    "economy": (100, 70, 2),
    "balanced": (150, 80, 0),
    "high": (300, 85, 0),
}
COMPACT_TARGET_BYTES = 10 * 1024 * 1024
COMPACT_MIN_JPEG_QUALITY = 70
COMPACT_MAX_COLOR_ERROR = 12
COMPACT_MAX_MEAN_ERROR = 1.5
COMPACT_MAX_RMS_ERROR = 2
MAX_FILE_BYTES = 50 * 1024 * 1024
MAX_PAGES = 200
MAX_PIXELS_PER_PAGE = 25_000_000
MAX_WATERMARK_PIXELS = 4_000_000
MAX_CONFIG_BYTES = 8192
MAX_REPEATED_MARKS_PER_PAGE = 100_000


@dataclass(frozen=True)
class ProcessingSettings:
    dpi: int = DEFAULT_RENDER_DPI
    image_format: str = IMAGE_FORMAT
    jpeg_quality: int = JPEG_QUALITY
    jpeg_subsampling: int = 0
    max_file_bytes: int = MAX_FILE_BYTES
    max_pages: int = MAX_PAGES
    max_pixels_per_page: int = MAX_PIXELS_PER_PAGE
    max_watermark_pixels: int = MAX_WATERMARK_PIXELS
    max_repeated_marks_per_page: int = MAX_REPEATED_MARKS_PER_PAGE


class ProcessingError(Exception):
    def __init__(self, detail: str, status_code: int = 422) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code

    def __reduce__(self) -> tuple[type, tuple[str, int]]:
        return type(self), (self.detail, self.status_code)
