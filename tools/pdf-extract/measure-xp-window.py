#!/usr/bin/env python3
"""
Measures the Windows XP window frame from the Visual Guidelines figure captioned
"Standard window components in actual size".

The figure is a JPEG screenshot embedded at native pixel size, so its pixels are
Microsoft's pixels. Two things make naive measurement wrong:

- **It is a JPEG.** Lossy encoding smears colour across hard edges, so an exact
  RGB match test finds nothing. Every boundary here is found by looking for a
  large change between adjacent pixels, and reported colours are sampled from the
  middle of a run rather than at its edge.
- **Decorative magnifier bubbles overlap the window.** The figure has zoom
  callouts drawn on top of the title bar and the bottom-left corner. Scan lines
  are chosen to avoid them, and the script prints which columns and rows it used
  so the choice is auditable.

Requires: pip install pymupdf pillow numpy
Usage: python3 tools/pdf-extract/measure-xp-window.py <figure.jpeg>
"""

import sys
import numpy as np
from PIL import Image

# A JPEG edge is a ramp, not a step. This is the per-channel sum-of-differences
# that counts as a real boundary rather than compression noise.
EDGE_DELTA = 42


def runs(line):
    """Collapse a scan line into runs of near-constant colour."""
    out = []
    start = 0
    for i in range(1, len(line)):
        if int(np.abs(line[i].astype(int) - line[i - 1].astype(int)).sum()) > EDGE_DELTA:
            out.append((start, i - 1, i - start))
            start = i
    out.append((start, len(line) - 1, len(line) - start))
    return out


def hexof(px):
    return "#%02X%02X%02X" % (int(px[0]), int(px[1]), int(px[2]))


def mid_colour(line, a, b):
    return hexof(line[(a + b) // 2])


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else "xp-window-actual-size.jpeg"
    img = Image.open(path).convert("RGB")
    a = np.asarray(img)
    h, w, _ = a.shape
    print(f"figure: {w}x{h}px  ({path})")

    # ---- locate the window box against the white page background -------------
    # Scan a row through the client area, clear of both magnifier bubbles.
    probe_row = int(h * 0.62)
    row = a[probe_row]
    nonwhite = [x for x in range(w) if int(row[x].astype(int).sum()) < 720]
    left, right = min(nonwhite), max(nonwhite)

    probe_col = left + 90  # inside the window, left of the title-bar bubble
    col = a[:, probe_col]
    nonwhite_v = [y for y in range(h) if int(col[y].astype(int).sum()) < 720]
    top, bottom = min(nonwhite_v), max(nonwhite_v)

    print(f"scan lines: row y={probe_row}, column x={probe_col} (chosen to miss the callouts)")
    print(f"window box: x {left}..{right} (w={right - left + 1}), y {top}..{bottom} (h={bottom - top + 1})")

    # ---- vertical structure: frame top, caption, client ----------------------
    print("\nvertical runs down the window (top edge → client area):")
    vcol = a[top : bottom + 1, probe_col]
    vruns = runs(vcol)
    acc = 0
    for i, (s, e, n) in enumerate(vruns[:12]):
        print(f"  y+{s:<4} len={n:<4} {mid_colour(vcol, s, e)}")
        acc += n
        if acc > 90:
            break

    # ---- horizontal structure: left and right frame -------------------------
    print("\nhorizontal runs across the window at the client row:")
    hrow = a[probe_row, left : right + 1]
    hruns = runs(hrow)
    for s, e, n in hruns[:6]:
        print(f"  x+{s:<4} len={n:<4} {mid_colour(hrow, s, e)}")
    print("  ... right edge ...")
    for s, e, n in hruns[-6:]:
        print(f"  x+{s:<4} len={n:<4} {mid_colour(hrow, s, e)}")

    # ---- bottom frame -------------------------------------------------------
    print("\nvertical runs at the bottom of the window:")
    tail = a[max(top, bottom - 14) : bottom + 1, probe_col]
    for s, e, n in runs(tail):
        print(f"  y={bottom - (len(tail) - 1) + s:<5} len={n:<4} {mid_colour(tail, s, e)}")

    # ---- caption gradient ---------------------------------------------------
    # Sampled down the caption in a column with no button and no bubble.
    print("\ncaption gradient, sampled per row:")
    for y in range(top, min(top + 34, bottom)):
        print(f"  y+{y - top:<3} {hexof(a[y, probe_col])}")

    # ---- top-left corner profile -------------------------------------------
    # A rounded corner shows as the left edge starting further right on each of
    # the first few rows. The row-by-row inset IS the corner radius profile.
    print("\ntop-left corner: first non-white x per row (radius profile)")
    for y in range(top, top + 12):
        r = a[y]
        xs = [x for x in range(left - 4, min(left + 30, w)) if int(r[x].astype(int).sum()) < 720]
        print(f"  y+{y - top:<3} first_x_offset={xs[0] - left if xs else 'none'}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
