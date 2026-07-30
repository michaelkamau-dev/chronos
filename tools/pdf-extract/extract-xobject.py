#!/usr/bin/env python3
"""
Extracts image XObjects from a source PDF at their native pixel size, and
catalogues every image in the document alongside the caption text near it.

Why this exists as a separate tool from find-figures.py: that one *reports* what
is embedded, this one gets the bitmap out. A figure captioned "in actual size" is
1:1 only in its embedded bitmap — rasterising the page resamples it and destroys
the measurement — so extraction has to go through the XObject stream rather than
through any page renderer.

Two modes:

  catalogue <pdf>
      Every page carrying an image, with the image's native size, its bit depth,
      its colorspace, and the nearest "Figure N-M" caption on the page. This is
      how you find which xref holds which figure without opening the PDF.

  extract <pdf> <xref> <out.png>
      One image, written at native size. 4-bit and 8-bit indexed images are
      converted to RGB with their palette applied, because measurement code wants
      colour values rather than palette indices.

Requires: pip install pymupdf pillow
"""

import io
import re
import sys

import fitz
from PIL import Image

FIGURE_RE = re.compile(r"Figure\s+(\d+-\d+)", re.IGNORECASE)


def page_figures(page):
    return [m.group(0) for m in FIGURE_RE.finditer(page.get_text())]


def catalogue(path):
    doc = fitz.open(path)
    print(f"{path}: {doc.page_count} pages")
    for pno in range(doc.page_count):
        page = doc.load_page(pno)
        images = page.get_images(full=True)
        if not images:
            continue
        figs = page_figures(page)
        print(f"\n--- page {pno + 1} figures={figs or '-'}")
        for xref, *_ in images:
            try:
                info = doc.extract_image(xref)
            except Exception as exc:
                print(f"    xref={xref} UNDECODABLE {exc}")
                continue
            rects = page.get_image_rects(xref)
            placed = (round(rects[0].width, 1), round(rects[0].height, 1)) if rects else None
            ppp = round(info["width"] / placed[0], 3) if placed and placed[0] else None
            print(
                f"    xref={xref:>5} {info['width']}x{info['height']}px {info['ext']} "
                f"bpc={info.get('bpc')} cs={info.get('colorspace')} "
                f"placed={placed}pt px/pt={ppp}"
            )
    return 0


def extract(path, xref, out):
    doc = fitz.open(path)
    info = doc.extract_image(int(xref))
    img = Image.open(io.BytesIO(info["image"]))
    # Indexed sources (bpc=4 in the Platinum addendum) carry the era's exact
    # 16-colour palette. Converting to RGB applies it losslessly; leaving it
    # indexed would make every measurement read palette indices instead.
    img = img.convert("RGB")
    img.save(out)
    print(f"xref {xref}: {img.width}x{img.height}px {info['ext']} bpc={info.get('bpc')} -> {out}")
    return 0


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return 1
    mode = sys.argv[1]
    if mode == "catalogue":
        return catalogue(sys.argv[2])
    if mode == "extract":
        return extract(sys.argv[2], sys.argv[3], sys.argv[4])
    print(__doc__)
    return 1


if __name__ == "__main__":
    sys.exit(main())
