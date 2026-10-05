import zlib
from dataclasses import dataclass
from io import BytesIO

from PIL import Image, ImageChops, ImageStat

from app.core import (
    COMPACT_MAX_COLOR_ERROR,
    COMPACT_MAX_MEAN_ERROR,
    COMPACT_MAX_RMS_ERROR,
    COMPACT_MIN_JPEG_QUALITY,
    ProcessingSettings,
)


@dataclass(frozen=True)
class CompressedRaster:
    data: bytes
    size: tuple[int, int]
    palette: bytes | None = None


def palette_is_faithful(image: Image.Image, indexed: Image.Image) -> bool:
    with (
        indexed.convert("RGB") as restored,
        ImageChops.difference(image, restored) as diff,
    ):
        statistics = ImageStat.Stat(diff)
        return (
            max(high for _, high in diff.getextrema()) <= COMPACT_MAX_COLOR_ERROR
            and max(statistics.mean) <= COMPACT_MAX_MEAN_ERROR
            and max(statistics.rms) <= COMPACT_MAX_RMS_ERROR
        )


def encode_jpeg(
    image: Image.Image, settings: ProcessingSettings, quality: int, dpi: int
) -> bytes:
    with BytesIO() as encoded:
        options = {
            "format": settings.image_format,
            "quality": quality,
            "subsampling": settings.jpeg_subsampling,
            "dpi": (dpi, dpi),
        }
        try:
            image.save(encoded, optimize=True, **options)
        except OSError:
            # Pillow's optimized BytesIO encoder can overflow its guessed
            # buffer for high-entropy RGB photos. Retry without Huffman
            # optimization, preserving resolution, quality and colors.
            encoded.seek(0)
            encoded.truncate()
            image.save(encoded, optimize=False, **options)
        return encoded.getvalue()


def fit_jpeg(
    image: Image.Image,
    settings: ProcessingSettings,
    dpi: int,
    budget: int,
) -> bytes:
    high_quality = settings.jpeg_quality
    encoded = encode_jpeg(image, settings, high_quality, dpi)
    if len(encoded) <= budget:
        return encoded
    low_quality = COMPACT_MIN_JPEG_QUALITY
    best = encode_jpeg(image, settings, low_quality, dpi)
    if len(best) > budget:
        return best
    # Keep the highest quality that fits; never repeatedly recompress a JPEG.
    while high_quality - low_quality > 1:
        quality = (high_quality + low_quality) // 2
        candidate = encode_jpeg(image, settings, quality, dpi)
        if len(candidate) <= budget:
            best, low_quality = candidate, quality
        else:
            high_quality = quality
    return best


def compress_raster(
    image: Image.Image, settings: ProcessingSettings, budget: int | None = None
) -> CompressedRaster:
    if budget is None:
        return CompressedRaster(
            encode_jpeg(image, settings, settings.jpeg_quality, settings.dpi),
            image.size,
        )
    jpeg = fit_jpeg(image, settings, settings.dpi, budget)
    result = CompressedRaster(jpeg, image.size)
    # Fixed resolution keeps glyph edges and thin table lines. An Indexed PDF
    # image stores repeated colors efficiently without JPEG ringing.
    with image.quantize(
        colors=256, method=Image.Quantize.MAXCOVERAGE, dither=Image.Dither.NONE
    ) as indexed:
        if palette_is_faithful(image, indexed):
            palette = bytes(indexed.getpalette() or [])
            indices = indexed.tobytes()
            # Compare actual Flate data + palette, rather than PNG file size:
            # normal PNG insertion expands the palette back to RGB in MuPDF.
            if len(zlib.compress(indices)) + len(palette) + 512 < len(jpeg):
                result = CompressedRaster(indices, image.size, palette)
    # A small budget never lowers resolution or JPEG below the readability
    # floor. Complex/photo-heavy documents may exceed the soft target.
    return result
