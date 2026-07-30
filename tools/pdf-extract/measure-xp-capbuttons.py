#!/usr/bin/env python3
"""
Measures Windows XP's caption button geometry from Microsoft's own figures.

Two figures in the Windows XP Visual Guidelines carry the buttons:

- **"Title Bar Buttons"** — three real captions (inactive, active, maximized) with
  nothing drawn over the buttons. This is the one that settles placement. The
  "Standard window components in actual size" figure has a magnifier callout over
  its caption buttons, which is what blocked the measurement until this one was read.
- **"Example of the states for Title Bar buttons"** — a 4x4 specimen grid of
  active/inactive x normal/hot/pressed/disabled for both button categories, plus a
  row of all five glyphs. This is the cross-check and the source of the state faces.

Boundaries are found by locating the button's 1px outline, and two things that look
like they should work do not. Matching a colour fails because the outline is white on
an active caption and `#BCC4EE` on an inactive one. Taking the brightest pixels in the
band fails too, because the glyphs are pure white — on the inactive caption the
maximize glyph sets the ceiling and the outline falls outside it. What works is
"brighter than both horizontal neighbours, in nearly every row of the button": an
outline is a full-height vertical line and a glyph pixel is not, and the comparison is
local so there is no threshold to get wrong.

Output, for reference — all nine buttons across the three real captions:

    inactive   caption 0..29 = 30px    3 buttons 21px  gaps [2, 2]  right inset 6px
    active     caption 53..82 = 30px   3 buttons 21px  gaps [2, 2]  right inset 6px
    maximized  caption 134..clipped    3 buttons 21px  gaps [2, 2]  right inset 2px
    active vertical: rows 59..79 = 21px, top 6px, bottom 3px, 6 + 21 + 3 = 30

The 6px against 2px is the decomposition: a restored window's inset is the 4px frame
plus a 2px gutter, and a maximized window has no side frame, so the gutter shows alone.

The scale argument is in docs/sources/figures/README.md and is worth restating: the
active caption in the Title Bar Buttons figure measures 30px tall with a 4px right
frame, both already measured independently from the other bitmap, so this figure is
1:1. Twenty-seven button instances across the two figures all measure 21x21 with a
1px outline, which no non-integer resampling could produce.

Requires: pip install pymupdf pillow numpy
Usage: python3 tools/pdf-extract/measure-xp-capbuttons.py docs/sources/figures
"""

import sys
import os
import numpy as np
from PIL import Image

# Measured origins, once, so the script reports rather than re-derives them.
# Title Bar Buttons figure (376x160): the three captions.
CAPTIONS = {
    # name:        (caption top, caption bottom, scan row through the buttons)
    'inactive': (0, 29, 14),
    'active': (53, 82, 67),
    'maximized': (134, None, 145),
}


def window_right_edge(a: np.ndarray, y0: int, y1: int, lo: int) -> int:
    """
    The window's outer right edge, as a column index.

    Found as the column before the first *fully* page-white column across the whole
    button band. Testing a single scan line would stop at the figure's own caption
    labels ("inactive", "active", "maximized"), which are dark text on the page
    background; text occupies a few rows of the band, the background occupies all of
    them.
    """
    band = a[y0:y1 + 1]
    for x in range(lo, band.shape[1]):
        if (band[:, x].sum(axis=1) > 740).all():
            return x - 1
    return band.shape[1] - 1


def outline_columns(a: np.ndarray, y0: int, y1: int, lo: int, hi: int) -> list[int]:
    """
    The button's left and right outlines, as column indices.

    A single scan line does not work, and the reason is worth keeping: the glyphs are
    white too, so local-maximum lightness along one row reports the X of the close
    button and the two rectangles of the restore button as outline pixels. What
    separates an outline from a glyph is that the outline is a *full-height vertical
    line* — it is bright in nearly every row of the button — while a glyph pixel is
    bright in a handful.

    The test is "brighter than both horizontal neighbours", counted down the column,
    rather than "close to the band's brightest pixel". An absolute threshold fails on
    the inactive caption: its outline is `#BCC4EE` while the maximize glyph beside it
    is pure white, so the glyph sets the ceiling and the outline falls outside it. A
    local comparison has no ceiling to be wrong about — it works the same whether the
    outline is white or pale.
    """
    lum = a[y0:y1 + 1].sum(axis=2)
    height = y1 - y0 + 1
    out = []
    for x in range(lo, min(hi, lum.shape[1] - 1)):
        n = int(
            ((lum[:, x] > lum[:, x - 1] + 30) & (lum[:, x] > lum[:, x + 1] + 30)).sum()
        )
        # -5 rather than an exact match because the maximized bar runs off the bottom
        # of the bitmap, so its band is one row short of the button.
        if n >= height - 5:
            out.append(x)
    return out


def spans(cols: list[int], want: int = 21) -> list[tuple[int, int, int]]:
    """Outline pairs `want` apart are one button. Overlapping pairs are dropped."""
    found: list[tuple[int, int, int]] = []
    used: set[int] = set()
    for i, left in enumerate(cols):
        if left in used:
            continue
        for right in cols[i + 1:]:
            w = right - left + 1
            if w > want + 3:
                break
            if abs(w - want) <= 3:
                found.append((left, right, w))
                used.add(left)
                used.add(right)
                break
    return found


def measure_titlebars(path: str) -> None:
    a = np.asarray(Image.open(path).convert('RGB')).astype(int)
    h, w, _ = a.shape
    print(f'\n=== {os.path.basename(path)} ({w}x{h}) — three real captions')
    for name, (top, bottom, scan) in CAPTIONS.items():
        # The button band: 6px down from the caption top, 21 rows tall.
        y0, y1 = top + 6, min(top + 26, h - 1)
        # Search the right third: the buttons are always at the right end, and
        # further left lies the window icon and the white title text. Bounded on the
        # right by the window's own edge, or the page background reads as 21 rows of
        # pure white in every column and every one looks like an outline.
        lo = w // 3
        edge = window_right_edge(a, y0, y1, lo)
        btns = spans(outline_columns(a, y0, y1, lo, edge + 1))
        if not btns:
            print(f'  {name:10s} no buttons found in rows {y0}..{y1}')
            continue
        gaps = [btns[i + 1][0] - btns[i][1] - 1 for i in range(len(btns) - 1)]
        print(f'  {name:10s} caption {top}..{bottom if bottom is not None else "clipped"}'
              f'{"" if bottom is None else f" = {bottom - top + 1}px"}')
        print(f'             {len(btns)} buttons {[f"{l}..{r} {n}px" for l, r, n in btns]}')
        print(f'             gaps {gaps}px   right inset from outer edge '
              f'{edge - btns[-1][1]}px')

    # Vertical placement, down the middle of the active window's close button.
    top, bottom, scan = CAPTIONS['active']
    edge = window_right_edge(a, top + 6, top + 26, w // 3)
    btns = spans(outline_columns(a, top + 6, top + 26, w // 3, edge + 1))
    left, right, _ = btns[-1]
    # A column clear of the glyph: 2px in from the outline.
    cx = left + 2
    col = a[:, cx].sum(axis=1)
    inside = [y for y in range(top, bottom + 1) if col[y] >= col[top:bottom + 1].max() - 60]
    if len(inside) >= 2:
        bt, bb = inside[0], inside[-1]
        print(f'  active vertical (x={cx}): button rows {bt}..{bb} = {bb - bt + 1}px, '
              f'top inset {bt - top}px, bottom inset {bottom - bb}px, '
              f'sum {bt - top} + {bb - bt + 1} + {bottom - bb} = {bottom - top + 1}')


def measure_states(path: str) -> None:
    a = np.asarray(Image.open(path).convert('RGB')).astype(int)
    h, w, _ = a.shape
    print(f'\n=== {os.path.basename(path)} ({w}x{h}) — the specimen grid')
    # Grid origins, measured: four state rows, two hue columns, 21px swatches.
    rows = {'rest': 64, 'hover': 90, 'active': 116, 'disabled': 142}
    cols = {'impact': 69, 'neutral': 104}
    size = 21
    for state, y0 in rows.items():
        for cat, x0 in cols.items():
            # Median of the interior columns per row: a single column eventually
            # crosses a glyph and reports it as face colour.
            face = []
            for r in range(1, size - 1):
                px = [a[y0 + r, x] for x in range(x0 + 4, x0 + size - 4)]
                m = tuple(int(np.median([p[k] for p in px])) for k in range(3))
                face.append(f'#{m[0]:02X}{m[1]:02X}{m[2]:02X}')
            print(f'  {state:9s} {cat:8s} {size}x{size}  {face[0]} .. {face[len(face)//2]} .. {face[-1]}')

    # The disabled row is contested. Show why: solve for an alpha and watch it fail.
    def med(y, x0, x1):
        return np.array([float(np.median([a[y, x][k] for x in range(x0, x1)])) for k in range(3)])
    panel = med(152, 92, 101)
    print(f'\n  panel behind the disabled row: {panel}')
    for cat, x0 in cols.items():
        n, d = med(74, x0 + 6, x0 + 15), med(152, x0 + 6, x0 + 15)
        denom = n - panel
        al = [(d[k] - panel[k]) / denom[k] for k in range(3) if abs(denom[k]) > 12]
        print(f'  {cat:8s} per-channel alpha {[round(x, 3) for x in al]} '
              f'-> mean {round(float(np.mean(al)), 3)}'
              f'{"  <- impossible, so it is separate artwork" if np.mean(al) > 1 else ""}')


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    d = sys.argv[1]
    measure_titlebars(os.path.join(d, 'xp-titlebar-states.jpeg'))
    measure_states(os.path.join(d, 'xp-button-states.jpeg'))
    return 0


if __name__ == '__main__':
    sys.exit(main())
