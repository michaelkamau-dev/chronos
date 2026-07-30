#!/usr/bin/env python3
"""
Measures type that a real OS rasterised, out of a figure bitmap.

This is the objective half of a font substitution. `build.mjs` renders candidate
faces so they can be looked at; this reads the *original* rasterisation out of a
vendor figure so the candidate can be scored against numbers instead of against an
impression. It is the same shape as the Windows 3.1 metric target in
`docs/sources/win31-metrics.md`, generalised so any era can use it.

What it reports, for a rectangle of a bitmap containing one line of text:

  * ink rows — the ascender, x-height and descender bands, as row indices relative
    to the band's top, so a baseline can be located exactly
  * per-glyph ink width, and the delta between successive ink starts
  * total ink width of the string

Deltas rather than advances, deliberately: a bitmap shows where ink starts, not
where the advance boundary was. A substitute that reproduces both the ink widths
and the start deltas is reproducing the advances and the side bearings together,
which is the thing that makes a title bar the right length.

Glyph segmentation is by blank columns. That merges a kerned pair into one run,
which is why the tool prints the run list rather than asserting a glyph count — the
caller matches runs to characters and says so when a run covers two.

Usage:
  measure-bitmap-type.py <png> <x0> <y0> <x1> <y1> [--ink HEX] [--bg HEX]

`--ink` restricts ink to one exact colour, which is what you want on a lossless
indexed source: the era's text is one palette entry and everything else in the band
is chrome. Without it, ink is "any colour darker than the band's most common one",
which is the right rule for a lossy source.

Requires: pip install pillow
"""

import sys
from collections import Counter

from PIL import Image


def hexof(c):
    return "#%02X%02X%02X" % tuple(c[:3])


def parse_hex(s):
    s = s.lstrip("#")
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16))


def runs_of(flags):
    """Contiguous True runs as (start, end) inclusive."""
    out, start = [], None
    for i, f in enumerate(flags):
        if f and start is None:
            start = i
        elif not f and start is not None:
            out.append((start, i - 1))
            start = None
    if start is not None:
        out.append((start, len(flags) - 1))
    return out


def main():
    argv = sys.argv[1:]
    if len(argv) < 5:
        print(__doc__)
        return 1
    path = argv[0]
    x0, y0, x1, y1 = (int(v) for v in argv[1:5])
    ink_colour = None
    bg_colour = None
    rest = argv[5:]
    for i, a in enumerate(rest):
        if a == "--ink" and i + 1 < len(rest):
            ink_colour = parse_hex(rest[i + 1])
        if a == "--bg" and i + 1 < len(rest):
            bg_colour = parse_hex(rest[i + 1])

    img = Image.open(path).convert("RGB")
    band = [[img.getpixel((x, y)) for x in range(x0, x1 + 1)] for y in range(y0, y1 + 1)]
    w, h = x1 - x0 + 1, y1 - y0 + 1

    counts = Counter(px for row in band for px in row)
    if bg_colour is None:
        bg_colour = counts.most_common(1)[0][0]

    print(f"{path} band x={x0}..{x1} y={y0}..{y1} ({w}x{h})")
    print(f"band colours: " + ", ".join(f"{hexof(c)}x{n}" for c, n in counts.most_common(8)))
    print(f"background taken as {hexof(bg_colour)}")

    if ink_colour is not None:
        print(f"ink restricted to {hexof(ink_colour)}")

        def is_ink(px):
            return px[:3] == ink_colour
    else:
        bg_sum = sum(bg_colour)

        def is_ink(px):
            return sum(px[:3]) < bg_sum - 60

    ink = [[is_ink(px) for px in row] for row in band]
    total = sum(sum(r) for r in ink)
    print(f"ink pixels: {total}")
    if total == 0:
        print("no ink found — check the band and the ink colour")
        return 0

    row_has = [any(r) for r in ink]
    row_runs = runs_of(row_has)
    print("\nink rows (relative to band top):")
    for s, e in row_runs:
        counts_per = [sum(ink[y]) for y in range(s, e + 1)]
        print(f"  rows {s}..{e} (h={e - s + 1})  per-row ink: {counts_per}")
    first, last = row_runs[0][0], row_runs[-1][1]
    print(f"  ink band: rows {first}..{last}, height {last - first + 1}px")

    # The widest row is the x-height band's floor in a bitmap face; report the row
    # profile so the caller can pick the baseline rather than have it guessed.
    widest = max(range(h), key=lambda y: sum(ink[y]))
    print(f"  widest ink row: {widest} ({sum(ink[widest])} px)")

    col_has = [any(ink[y][x] for y in range(h)) for x in range(w)]
    col_runs = runs_of(col_has)
    print(f"\nglyph runs: {len(col_runs)} (blank-column segmentation; a kerned pair reads as one)")
    starts = []
    for i, (s, e) in enumerate(col_runs):
        rows = [y for y in range(h) if ink[y][s : e + 1].count(True) > 0]
        print(f"  #{i} x {s}..{e}  inkWidth={e - s + 1}  rows {rows[0]}..{rows[-1]}")
        starts.append(s)
    deltas = [starts[i + 1] - starts[i] for i in range(len(starts) - 1)]
    print(f"\n  inkWidths:   {[e - s + 1 for s, e in col_runs]}")
    print(f"  startDeltas: {deltas}")
    print(f"  ink extent:  x {col_runs[0][0]}..{col_runs[-1][1]} = "
          f"{col_runs[-1][1] - col_runs[0][0] + 1}px")
    print(f"  absolute:    x {x0 + col_runs[0][0]}..{x0 + col_runs[-1][1]}")

    # Parity, for the disabled-text question. On a 1-bit or 4-bit display the only
    # way to say "unavailable" is to remove half the pixels, and this project has
    # already found that construction in two other eras — so every text band gets
    # tested rather than only the ones that look stippled.
    even = sum(1 for y in range(h) for x in range(w) if ink[y][x] and (x + y) % 2 == 0)
    odd = total - even
    print(f"\nparity of ink (x+y): even={even} odd={odd}")
    if total >= 20 and (even == 0 or odd == 0):
        print("  ALL ink on one parity — this is a 50% checkerboard, not a solid fill")
    else:
        print("  ink on both parities — a solid fill, not a checkerboard")
    return 0


if __name__ == "__main__":
    sys.exit(main())
