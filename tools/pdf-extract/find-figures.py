#!/usr/bin/env python3
"""
Locates figure captions in the primary-source PDFs and reports the embedded
images on those pages at their native pixel size.

Why native size matters: the Windows XP Visual Guidelines caption the window
figure "Standard window components in actual size", and the Tiger HIG's push
button figures are dimensioned drawings. An embedded bitmap that is 1:1 with the
screen it was captured from carries Microsoft's and Apple's own pixels — but only
if it is extracted rather than re-rendered. Rasterising the page at some DPI would
resample it and destroy exactly the measurement being sought.

So this reports the *embedded* image dimensions and how they compare to the
on-page placement, which is how you tell whether a figure is genuinely 1:1.

Requires: pip install pymupdf
Usage: python3 tools/pdf-extract/find-figures.py <pdf> <search-term>...
"""

import sys
import fitz


def describe_images(page):
    out = []
    for xref, *_ in page.get_images(full=True):
        try:
            info = page.parent.extract_image(xref)
        except Exception as exc:  # a figure we cannot decode is still worth naming
            out.append({"xref": xref, "error": str(exc)})
            continue
        # Where the image sits on the page, in points (72/inch).
        rects = page.get_image_rects(xref)
        placed = None
        if rects:
            r = rects[0]
            placed = (round(r.width, 1), round(r.height, 1))
        out.append(
            {
                "xref": xref,
                "px": (info["width"], info["height"]),
                "ext": info["ext"],
                "bpc": info.get("bpc"),
                "colorspace": info.get("colorspace"),
                "placed_pt": placed,
                # 1.0 means the image is placed at exactly 72 DPI, i.e. one image
                # pixel per point. Screenshots captured at 96 DPI and placed at
                # native size land near 1.333.
                "px_per_pt": round(info["width"] / placed[0], 3) if placed and placed[0] else None,
            }
        )
    return out


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return 1
    path = sys.argv[1]
    terms = [t.lower() for t in sys.argv[2:]]
    doc = fitz.open(path)
    print(f"{path}: {doc.page_count} pages")

    for pno in range(doc.page_count):
        page = doc.load_page(pno)
        text = page.get_text().lower()
        hits = [t for t in terms if t in text]
        if not hits:
            continue
        imgs = describe_images(page)
        print(f"\n--- page {pno + 1} (index {pno}) matched: {hits}")
        # Show the caption line itself so the figure can be identified.
        for line in page.get_text().split("\n"):
            if any(t in line.lower() for t in terms):
                print(f"    CAPTION: {line.strip()[:150]}")
        for im in imgs:
            if "error" in im:
                print(f"    image xref={im['xref']} UNDECODABLE: {im['error']}")
                continue
            print(
                f"    image xref={im['xref']:>5} {im['px'][0]}x{im['px'][1]}px "
                f"{im['ext']} bpc={im['bpc']} {im['colorspace']} "
                f"placed={im['placed_pt']}pt px/pt={im['px_per_pt']}"
            )
    return 0


if __name__ == "__main__":
    sys.exit(main())
