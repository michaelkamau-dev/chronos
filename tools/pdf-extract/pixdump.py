#!/usr/bin/env python3
"""
Generic pixel inspector for extracted figure bitmaps.

The era-specific `measure-*.py` scripts each answer one question. This answers
the question that comes before all of them: what is actually in these pixels.
It exists so that every measurement in a multi-figure extraction is read off the
same instrument rather than eight ad-hoc scripts that disagree about what an edge
is.

Modes (all coordinates are 0-based, all ranges inclusive):

  hist <png>
      Every distinct colour with its count, most frequent first. On an indexed
      source this is the figure's real palette usage — a 4-bit Platinum figure
      shows a dozen entries, and a resampled one shows hundreds. That difference
      is itself the test for whether a bitmap was rescaled.

  row <png> <y> [x0 x1]
      One scanline as run-length pairs: `#RRGGBB xN`. Reading frame widths off
      runs rather than off a threshold is what keeps a 1px step from being lost.

  col <png> <x> [y0 y1]
      One column, same format.

  grid <png> <x0> <y0> <x1> <y1>
      A rectangle as a character map, one legend character per distinct colour,
      with the legend printed underneath. This is how a bevel's layer order is
      read: the map shows which grey sits outside which.

  edges <png> <axis> <index> [threshold]
      Positions along a row (axis=h) or column (axis=v) where the summed channel
      value steps by more than `threshold` (default 12). Change detection, not
      exact colour match, because a JPEG source never repeats an exact value —
      though the Platinum figures are lossless, so here it mostly confirms runs.

  probe <png> <x> <y>
      One pixel.

Requires: pip install pillow
"""

import sys

from PIL import Image

LEGEND = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"


def load(path):
    return Image.open(path).convert("RGB")


def hexof(c):
    return "#%02X%02X%02X" % tuple(c[:3])


def runs(seq):
    out = []
    for c in seq:
        if out and out[-1][0] == c:
            out[-1][1] += 1
        else:
            out.append([c, 1])
    return out


def fmt_runs(rs, start):
    parts, pos = [], start
    for c, n in rs:
        parts.append(f"{hexof(c)} x{n} @{pos}")
        pos += n
    return "  ".join(parts)


def cmd_hist(path):
    img = load(path)
    print(f"{path}: {img.width}x{img.height}")
    counts = {}
    for c in img.getdata():
        counts[c] = counts.get(c, 0) + 1
    print(f"distinct colours: {len(counts)}")
    for c, n in sorted(counts.items(), key=lambda kv: -kv[1]):
        print(f"  {hexof(c)}  {n}")


def cmd_row(path, y, x0=None, x1=None):
    img = load(path)
    y = int(y)
    x0 = 0 if x0 is None else int(x0)
    x1 = img.width - 1 if x1 is None else int(x1)
    seq = [img.getpixel((x, y)) for x in range(x0, x1 + 1)]
    print(f"row y={y} x={x0}..{x1} ({img.width}x{img.height})")
    print(fmt_runs(runs(seq), x0))


def cmd_col(path, x, y0=None, y1=None):
    img = load(path)
    x = int(x)
    y0 = 0 if y0 is None else int(y0)
    y1 = img.height - 1 if y1 is None else int(y1)
    seq = [img.getpixel((x, y)) for y in range(y0, y1 + 1)]
    print(f"col x={x} y={y0}..{y1} ({img.width}x{img.height})")
    print(fmt_runs(runs(seq), y0))


def cmd_grid(path, x0, y0, x1, y1):
    img = load(path)
    x0, y0, x1, y1 = int(x0), int(y0), int(x1), int(y1)
    legend, order = {}, []
    print(f"grid x={x0}..{x1} y={y0}..{y1} ({img.width}x{img.height})")
    header = "".join(str((x // 10) % 10) if x % 10 == 0 else " " for x in range(x0, x1 + 1))
    print(f"      {header}")
    print(f"      {''.join(str(x % 10) for x in range(x0, x1 + 1))}")
    for y in range(y0, y1 + 1):
        line = []
        for x in range(x0, x1 + 1):
            c = img.getpixel((x, y))
            if c not in legend:
                legend[c] = LEGEND[len(order)] if len(order) < len(LEGEND) else "?"
                order.append(c)
            line.append(legend[c])
        print(f"  {y:>4}  {''.join(line)}")
    print("legend:")
    for c in order:
        print(f"  {legend[c]} = {hexof(c)}")


def cmd_edges(path, axis, index, threshold=12):
    img = load(path)
    index, threshold = int(index), int(threshold)
    if axis == "h":
        seq = [img.getpixel((x, index)) for x in range(img.width)]
        label = f"row y={index}"
    else:
        seq = [img.getpixel((index, y)) for y in range(img.height)]
        label = f"col x={index}"
    print(f"{label} steps >{threshold} ({img.width}x{img.height})")
    for i in range(1, len(seq)):
        a, b = sum(seq[i - 1][:3]), sum(seq[i][:3])
        if abs(b - a) > threshold:
            print(f"  {i:>4}  {hexof(seq[i - 1])} -> {hexof(seq[i])}  d={b - a:+}")


def cmd_probe(path, x, y):
    img = load(path)
    print(f"({x},{y}) = {hexof(img.getpixel((int(x), int(y))))}")


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        return 1
    mode = sys.argv[1]
    args = sys.argv[2:]
    table = {
        "hist": cmd_hist, "row": cmd_row, "col": cmd_col,
        "grid": cmd_grid, "edges": cmd_edges, "probe": cmd_probe,
    }
    if mode not in table:
        print(__doc__)
        return 1
    table[mode](*args)
    return 0


if __name__ == "__main__":
    sys.exit(main())
