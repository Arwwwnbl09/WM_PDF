"""Verify a PDF downloaded by the browser; print its burned color bounds."""

import json
import sys

import pymupdf
from PIL import Image

with pymupdf.open(sys.argv[1]) as document:
    assert len(document) == int(sys.argv[2])
    bounds = []
    for page in document:
        if len(sys.argv) > 3:
            dpi = int(sys.argv[3])
            info = document.extract_image(page.get_images()[0][0])
            assert abs(info["width"] - page.rect.width * dpi / 72) <= 1
            assert abs(info["height"] - page.rect.height * dpi / 72) <= 1
        assert not page.get_text().strip()
        assert not list(page.annots() or [])
        assert not list(page.widgets() or [])
        assert not page.get_links()
        assert len(page.get_images()) == 1
        assert page.get_image_rects(page.get_images()[0][0])[0] == page.rect
        pixmap = page.get_pixmap()
        image = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
        mask = image.convert("L")
        mask.putdata(
            [
                255 if r - g > 25 and b - g > 25 and abs(r - b) < 40 else 0
                for r, g, b in image.get_flattened_data()
            ]
        )
        bounds.append(mask.getbbox())
    assert not document.embfile_count()
    assert not document.get_ocgs()
    print(json.dumps({"pages": len(document), "bounds": bounds}))
