#!/usr/bin/env python3
"""
Measures the Mac OS X Tiger window frame from the HIG figure "Standard window
parts" (Figure 13-2).

Apple never published Tiger's window chrome geometry — there is no Window, Title
Bar or Scroll Bar specification section anywhere in the HIG, only figures. This
extracts the figure's own pixels instead.

**Scale calibration.** This figure carries no element whose size Apple documented,
so it cannot be self-calibrated. What can be shown is that *other* figures in the
same document embed native-resolution bitmaps: Figure 14-1's three push buttons
measure 22, 19 and 16px including their drop shadows against documented heights of
20, 17 and 15px "not including the shadow". Three independent matches at 1:1 is
strong evidence that Apple embedded unscaled screenshots throughout, but it is
evidence rather than proof for this figure specifically, so every number here is
reported as `measured`, never `documented`.

Requires: pip install pillow numpy
Usage: python3 tools/pdf-extract/measure-tiger-window.py <figure.jpeg>
"""

import sys
import numpy as np
from PIL import Image

EDGE = 30


def hexof(px):
    return "#%02X%02X%02X" % (int(px[0]), int(px[1]), int(px[2]))


def main():
    path = sys.argv[1]
    a = np.asarray(Image.open(path).convert("RGB")).astype(int)
    h, w, _ = a.shape
    print(f"figure: {w}x{h}px  ({path})")

    # The figure sits on a white page with a soft shadow under the window, so the
    # window edge is found by looking for a real step rather than any non-white.
    def first_step(vals):
        for i in range(1, len(vals)):
            if abs(int(vals[i].sum()) - int(vals[i - 1].sum())) > EDGE:
                return i
        return None

    mid_y = h // 2
    row = a[mid_y]
    lx = first_step(row)
    rx = w - 1 - first_step(row[::-1])
    mid_x = (lx + rx) // 2
    col = a[:, mid_x]
    ty = first_step(col)
    by = h - 1 - first_step(col[::-1])
    print(f"window box: x {lx}..{rx} (w={rx - lx + 1}), y {ty}..{by} (h={by - ty + 1})")

    # ---- title bar: scan down until the stripe gives way to the white client --
    print("\nvertical runs from the window top:")
    start = None
    y = ty
    prev = None
    runs = []
    while y <= min(ty + 40, by):
        c = a[y, mid_x]
        if prev is None or abs(int(c.sum()) - int(prev.sum())) > EDGE:
            if start is not None:
                runs.append((start, y - 1))
            start = y
        prev = c
        y += 1
    if start is not None:
        runs.append((start, min(ty + 40, by)))
    for s, e in runs[:10]:
        print(f"  y+{s - ty:<4} len={e - s + 1:<4} {hexof(a[(s + e) // 2, mid_x])}")

    # The client area is the first long white run.
    client_top = None
    for s, e in runs:
        if int(a[(s + e) // 2, mid_x].sum()) > 740 and (e - s + 1) > 4:
            client_top = s
            break
    if client_top is not None:
        print(f"\n  title bar + top frame = {client_top - ty}px "
              f"(client area begins at y+{client_top - ty})")

    # ---- traffic lights ------------------------------------------------------
    # Saturated colour in the title bar band: red, yellow, green.
    band = a[ty : (client_top if client_top else ty + 22), :]
    sat = []
    for x in range(0, min(w, 140)):
        colr = band[:, x]
        mx = colr.max(axis=1)
        mn = colr.min(axis=1)
        sat.append(int((mx - mn).max()))
    groups = []
    inb = False
    for x, s in enumerate(sat):
        hot = s > 60
        if hot and not inb:
            inb, st = True, x
        elif not hot and inb:
            inb = False
            groups.append((st, x - 1))
    if inb:
        groups.append((st, len(sat) - 1))
    groups = [g for g in groups if g[1] - g[0] >= 4]
    print(f"\ntraffic lights: {len(groups)} found")
    for i, (x0, x1) in enumerate(groups):
        colspan = x1 - x0 + 1
        colr = band[:, (x0 + x1) // 2]
        rows = [yy for yy in range(colr.shape[0]) if int(colr[yy].max()) - int(colr[yy].min()) > 60]
        vspan = (rows[-1] - rows[0] + 1) if rows else 0
        print(f"  #{i + 1} x {x0}..{x1} (d={colspan}px)  vertical d={vspan}px  "
              f"centre {hexof(band[(rows[0] + rows[-1]) // 2 if rows else 0, (x0 + x1) // 2])}")
    if len(groups) >= 2:
        centres = [(g[0] + g[1]) / 2 for g in groups]
        gaps = [round(centres[i + 1] - centres[i], 1) for i in range(len(centres) - 1)]
        print(f"  centre-to-centre spacing: {gaps}")
        print(f"  first light inset from window left edge: {groups[0][0] - lx}px")

    # ---- scroll bar ---------------------------------------------------------
    print("\nscroll bar (scanning right side at the client mid-height):")
    scan_y = (client_top or ty + 22) + ((by - (client_top or ty + 22)) // 3)
    r = a[scan_y]
    edges = []
    for x in range(rx, max(lx, rx - 40), -1):
        if abs(int(r[x].sum()) - int(r[x - 1].sum())) > EDGE:
            edges.append(x)
    print(f"  step positions from the right edge (y={scan_y}): "
          + " ".join(str(rx - x) for x in edges[:8]))
    for x in edges[:6]:
        print(f"    x={x} (inset {rx - x}) {hexof(r[x])}")

    # ---- corner radius -----------------------------------------------------
    print("\ntop-left corner: first stepped x per row")
    for y in range(ty, ty + 10):
        rr = a[y]
        fx = first_step(rr)
        print(f"  y+{y - ty:<3} x offset = {fx - lx if fx is not None else 'none'}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
