#!/usr/bin/env python3
"""
Measures Windows 3.1 VGA chrome from the three PCjs captures in docs/sources/.

The captures are 1280x960 canvas dumps of a 640x480 VGA screen — a lossless 2x
nearest-neighbour scale, which this script verifies before measuring anything and
then undoes with `[::2, ::2]`. Verification matters: a resampled capture has hundreds
of colours and blended edges, and every pixel count taken from it would be wrong. A
clean VGA capture has fewer than 20 colours and every 2x2 block uniform.

    win31-1280x960.png   frames, captions, menu bar, scroll bars, MDI containment
    win31-sysmenu.png    the open system menu — item height, separators, disabled item
    win31-dialog.png     the Run dialog — frame, push buttons, edit field, check box

Everything is reported in logical VGA pixels.

Two findings here are the ones most recreations get wrong, and both are visible rather
than inferred:

- **Disabled text is a 50% checkerboard knocked out of the black glyph**, not a grey
  fill and not a grey fill with a white shadow (that is the Windows 95 style). It is
  the same mechanism for a disabled menu item and a disabled button label, and it is
  the same idea as System 1's `notPatBic`. The Run dialog's OK button is disabled
  because the command line is empty, which is what makes it measurable here.
- **The push-button bevel is 2px, not 1px.** A 1px black outline with notched
  corners, then 2px of `#FCFCFC` on the top and left and 2px of `#84888C` on the
  bottom and right, over a `#C0C4C8` face.

What these captures do **not** settle: whether a 3.1 push button's label shifts 1px on
depress. No pressed button was captured — the OK button looks unusual because it is
disabled, not pressed. That claim stays unverified.

Requires: pip install pillow numpy
Usage: python3 tools/captures/measure-win31.py docs/sources
"""

import sys
import os
import numpy as np
from PIL import Image

BLACK = (0, 0, 0)
WHITE = (252, 252, 252)
FACE = (192, 196, 200)
NAVY = (0, 0, 168)
SHADOW = (132, 136, 140)
NAMES = {BLACK: 'K', WHITE: 'W', FACE: 'G', NAVY: 'N', SHADOW: 'S'}


def load(path: str) -> np.ndarray:
    """Verifies the capture is a clean 2x nearest scale, then returns logical pixels."""
    a = np.asarray(Image.open(path).convert('RGB'))
    h, w, _ = a.shape
    colours = len({tuple(c) for c in a.reshape(-1, 3)})
    if h % 2 or w % 2:
        raise SystemExit(f'{path}: {w}x{h} is not an even multiple; cannot be a 2x capture')
    blocks = a.reshape(h // 2, 2, w // 2, 2, 3)
    if not np.all(blocks == blocks[:, 0:1, :, 0:1, :]):
        raise SystemExit(f'{path}: 2x2 blocks are not uniform — this capture was resampled')
    if colours > 20:
        raise SystemExit(f'{path}: {colours} colours — resampled, worthless for measurement')
    print(f'{os.path.basename(path)}: {w}x{h}, {colours} colours, clean 2x -> {w//2}x{h//2}')
    return a[::2, ::2].astype(int)


def runs(seq: list) -> list:
    """[(value, start, length)] for a sequence of colour names."""
    out = []
    start = 0
    for i in range(1, len(seq) + 1):
        if i == len(seq) or seq[i] != seq[start]:
            out.append((seq[start], start, i - start))
            start = i
    return out


def name(px) -> str:
    return NAMES.get(tuple(px), '?')


def vslice(a, x, y0, y1):
    return runs([name(a[y, x]) for y in range(y0, y1)])


def hslice(a, y, x0, x1):
    return runs([name(a[y, x]) for x in range(x0, x1)])


def show(label, rs, origin):
    parts = [f'{v}x{n}' for v, s, n in rs]
    print(f'  {label}: ' + '  '.join(parts) + f'   (from {origin})')


def measure_frames(a) -> None:
    print('\n--- window frame and caption')
    # Program Manager's caption is the widest navy band at the top.
    navy = (a[..., 0] < 40) & (a[..., 1] < 40) & (a[..., 2] > 120) & (a[..., 2] < 200)
    rows = np.where(navy.any(axis=1))[0]
    bands = []
    start = prev = rows[0]
    for y in rows[1:]:
        if y != prev + 1:
            bands.append((start, prev))
            start = y
        prev = y
    bands.append((start, prev))
    for lo, hi in bands:
        cs = np.where(navy[lo:hi + 1].any(axis=0))[0]
        if hi - lo + 1 >= 12 and cs.max() - cs.min() > 100:
            print(f'  caption: rows {lo}..{hi} = {hi - lo + 1}px, cols {cs.min()}..{cs.max()}')
    # The nested frames down the left edge: two 4px sizing frames side by side.
    show('left edge frames (y=100)', hslice(a, 100, 0, 14), 'x=0')


def measure_menu(a) -> None:
    print('\n--- system menu popup')
    # Interior spans x=13..159 in this capture; find the frame from the top black rule.
    show('popup frame, vertical (x=20)', vslice(a, 20, 68, 216), 'y=68')
    show('popup frame, horizontal (y=100)', hslice(a, 100, 8, 168), 'x=8')

    # Item boundaries from the text blocks: ink rows inside the interior.
    ink = []
    for y in range(70, 216):
        row = a[y, 13:160]
        bg = ((row == WHITE).all(axis=1)) | ((row == NAVY).all(axis=1))
        ink.append((y, int((~bg).sum())))
    rules = [y for y, n in ink if n >= 140]
    blocks = []
    start = None
    for y, n in ink:
        if 0 < n < 140 and start is None:
            start = y
        elif (n == 0 or n >= 140) and start is not None:
            blocks.append((start, y - 1))
            start = None
    # Merge a label block with its mnemonic underline: they are separated by one
    # blank row and are one item, not two.
    merged = []
    for b in blocks:
        if merged and b[0] - merged[-1][1] <= 2:
            merged[-1] = (merged[-1][0], b[1])
        else:
            merged.append(b)
    merged = [b for b in merged if b[1] - b[0] >= 6]
    print(f'  full-width rules (frame + separators): {rules}')
    print(f'  item text blocks: {merged}')
    if len(merged) >= 2:
        pitch = [merged[i + 1][0] - merged[i][0] for i in range(len(merged) - 1)]
        print(f'  text-block pitch: {pitch}  -> item height {min(pitch)}px '
              f'(larger pitches straddle a separator)')

    # A separator is a 1px rule with equal padding; report the gap either side.
    for r in rules[1:-1]:
        print(f'  separator at y={r}: spans x='
              f'{min(x for x in range(0, 200) if tuple(a[r, x]) == BLACK and 10 <= x <= 165)}..'
              f'{max(x for x in range(0, 200) if tuple(a[r, x]) == BLACK and 10 <= x <= 165)}')


def stipple_report(a, y0, y1, x0, x1, bg, label) -> None:
    """
    Is the ink a solid glyph or a 50% checkerboard?

    A stipple has ink only where (x + y) has one parity. Solid glyph strokes occupy
    both parities, so the ratio between them is the discriminator.
    """
    even = odd = 0
    for y in range(y0, y1):
        for x in range(x0, x1):
            if tuple(a[y, x]) != bg:
                if (x + y) % 2 == 0:
                    even += 1
                else:
                    odd += 1
    total = even + odd
    if total == 0:
        print(f'  {label}: no ink found')
        return
    ratio = max(even, odd) / total
    verdict = '50% CHECKERBOARD STIPPLE' if ratio > 0.95 else 'solid glyph'
    print(f'  {label}: {total} ink px, parity split {even}/{odd} '
          f'({ratio:.0%} on one parity) -> {verdict}')


def measure_dialog(a) -> None:
    print('\n--- Run dialog')
    show('frame + caption, vertical (x=320)', vslice(a, 320, 54, 224), 'y=54')
    show('frame, horizontal (y=150)', hslice(a, 150, 36, 50), 'x=36')
    show('frame right end (y=150)', hslice(a, 150, 405, 422), 'x=405')

    print('\n--- push buttons')
    for label, y0 in (('OK (disabled)', 92), ('Cancel (rest)', 119)):
        top = [y for y in range(y0, y0 + 3)
               if all(tuple(a[y, x]) == BLACK for x in range(340, 396))]
        bottom = [y for y in range(y0 + 18, y0 + 26)
                  if all(tuple(a[y, x]) == BLACK for x in range(340, 396))]
        left = [x for x in range(330, 340) if tuple(a[y0 + 8, x]) == BLACK]
        right = [x for x in range(398, 412) if tuple(a[y0 + 8, x]) == BLACK]
        if top and bottom and left and right:
            h = bottom[0] - top[0] + 1
            w = right[0] - left[0] + 1
            print(f'  {label}: {w}x{h}px  rows {top[0]}..{bottom[0]}  cols {left[0]}..{right[0]}')
            show('    bevel, vertical', vslice(a, 360, top[0], bottom[0] + 1), f'y={top[0]}')
            show('    bevel, horizontal', hslice(a, y0 + 8, left[0], right[0] + 1), f'x={left[0]}')

    print('\n--- disabled rendering')
    stipple_report(a, 99, 108, 340, 396, FACE, 'OK button label (disabled)')
    stipple_report(a, 126, 135, 340, 396, FACE, 'Cancel button label (rest)')

    print('\n--- edit field and check box')
    show('edit field, vertical (x=200)', vslice(a, 200, 115, 143), 'y=115')
    show('edit field, horizontal (y=128)', hslice(a, 128, 44, 60), 'x=44')
    # The box is the first contiguous black run on its top rule; scanning further
    # right would pick up the label's glyphs.
    top = next(y for y in range(150, 170)
               if sum(1 for x in range(46, 70) if tuple(a[y, x]) == BLACK) >= 10)
    xs = [x for x in range(46, 80) if tuple(a[top, x]) == BLACK]
    right = xs[0]
    while right + 1 in xs:
        right += 1
    rows_ = [y for y in range(150, 175) if tuple(a[y, xs[0]]) == BLACK]
    print(f'  check box: cols {xs[0]}..{right} rows {rows_[0]}..{rows_[-1]} '
          f'= {right - xs[0] + 1}x{rows_[-1] - rows_[0] + 1}px, 1px black frame, white fill')


def measure_font_target(sysmenu, dialog) -> None:
    """
    An objective substitution target for the System font.

    Windows 3.1 uses ONE face for captions, the menu bar, menu items, dialog labels
    and button labels — the System font, which is bold. This is not MS Sans Serif, and
    it is not what W95FA recreates.
    """
    print('\n--- System font: metric target for a substitute')
    for label, a, y0, y1, x0, x1, bg, text in (
        ('menu item "Minimize"', sysmenu, 129, 139, 20, 120, WHITE, 'Minimize'),
        ('button label "Cancel"', dialog, 126, 135, 340, 400, FACE, 'Cancel'),
    ):
        ink = []
        start = None
        for x in range(x0, x1):
            col = a[y0:y1, x]
            has = not (col == bg).all(axis=1).all()
            if has and start is None:
                start = x
            elif not has and start is not None:
                ink.append((start, x - 1))
                start = None
        if start is not None:
            ink.append((start, x1 - 1))
        widths = [r - l + 1 for l, r in ink]
        advances = [ink[i + 1][0] - ink[i][0] for i in range(len(ink) - 1)]
        # Bounded to the label's own columns and to rows that are face/background on
        # both sides of it, so the button's bevel is not counted as ink.
        rows_ = [y for y in range(y0 - 5, y1 + 5)
                 if not (a[y, ink[0][0]:ink[-1][1] + 1] == bg).all(axis=1).all()
                 and tuple(a[y, ink[0][0] - 3]) == bg]
        print(f'  {label}: total ink {ink[0][0]}..{ink[-1][1]} = {ink[-1][1] - ink[0][0] + 1}px')
        print(f'    per-glyph ink widths {widths}')
        print(f'    ink-start deltas    {advances}')
        print(f'    ink rows {rows_[0]}..{rows_[-1]} = {rows_[-1] - rows_[0] + 1}px')


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    d = sys.argv[1]
    main_cap = load(os.path.join(d, 'win31-1280x960.png'))
    sysmenu = load(os.path.join(d, 'win31-sysmenu.png'))
    dialog = load(os.path.join(d, 'win31-dialog.png'))
    measure_frames(main_cap)
    measure_menu(sysmenu)
    measure_dialog(dialog)
    measure_font_target(sysmenu, dialog)
    return 0


if __name__ == '__main__':
    sys.exit(main())
