#!/usr/bin/env python3
"""
Measures the three caption states from the Windows XP Visual Guidelines figure
"Example of the states for Title Bar buttons" — inactive, active, and maximized.

This figure is the only primary source for the *inactive* caption gradient, which
every recreation guesses at, and for what changes when a window is maximized (the
rounded corner disappears and the maximize glyph becomes restore).

Same JPEG caveats as measure-xp-window.py: boundaries are found by change
detection rather than exact colour match, and reported hex values are sampled from
the middle of a run.

Requires: pip install pillow numpy
Usage: python3 tools/pdf-extract/measure-xp-titlebars.py <figure.jpeg>
"""

import sys
import numpy as np
from PIL import Image

BLUE_MIN_SUM = 120  # a caption pixel is dark-ish and blue-dominant


def is_caption(px):
    r, g, b = int(px[0]), int(px[1]), int(px[2])
    return b > 120 and b > r + 40 and b > g + 20


def main():
    path = sys.argv[1]
    a = np.asarray(Image.open(path).convert("RGB"))
    h, w, _ = a.shape
    print(f"figure: {w}x{h}px  ({path})")

    # Find horizontal bands that are predominantly caption-blue. Each band is one
    # of the three example captions.
    blueness = []
    for y in range(h):
        row = a[y]
        n = sum(1 for x in range(0, min(w, 240)) if is_caption(row[x]))
        blueness.append(n)

    bands = []
    inband = False
    start = 0
    for y, n in enumerate(blueness):
        hot = n > 60
        if hot and not inband:
            inband, start = True, y
        elif not hot and inband:
            inband = False
            if y - start >= 8:
                bands.append((start, y - 1))
    if inband:
        bands.append((start, h - 1))

    labels = ["inactive", "active", "maximized"]
    print(f"caption bands found: {len(bands)}")

    for i, (y0, y1) in enumerate(bands):
        label = labels[i] if i < len(labels) else f"band{i}"
        band_h = y1 - y0 + 1
        print(f"\n=== {label}: rows {y0}..{y1}  height={band_h}px")

        # Left edge of this caption, and its corner profile.
        insets = []
        for y in range(y0, min(y0 + 8, y1 + 1)):
            row = a[y]
            xs = [x for x in range(0, min(w, 200)) if is_caption(row[x])]
            insets.append(xs[0] if xs else None)
        base = min(v for v in insets if v is not None)
        print(f"  corner profile (x offset from x={base}): "
              + " ".join(str(v - base if v is not None else '-') for v in insets))

        # Gradient per row, taken as the median of the pixels that are actually
        # caption-blue. Sampling a fixed column does not work: the caption carries
        # a window icon and title text, so any single column eventually crosses
        # one of them and reports orange or white as "gradient".
        print("  gradient (median of caption-blue pixels per row):")
        for y in range(y0, y1 + 1):
            row = a[y]
            blues = np.array([row[x] for x in range(w) if is_caption(row[x])], dtype=int)
            if len(blues) < 12:
                print(f"    +{y - y0:<3} (too few caption pixels)")
                continue
            med = np.median(blues, axis=0).astype(int)
            print(f"    +{y - y0:<3} #%02X%02X%02X   n=%d" % (med[0], med[1], med[2], len(blues)))

    return 0


if __name__ == "__main__":
    sys.exit(main())
