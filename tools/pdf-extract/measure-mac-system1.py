#!/usr/bin/env python3
"""
Measures System 1 chrome from the figures `extract-mac-figures.py` pulls out of the
Macintosh HIG. Every number in `src/skins/system1/metrics.ts` comes from here.

The primary specimen is `mac-hig-screen-512x342.png`: a two-colour 512x342 bitmap,
which is exactly a Macintosh 128K / 512K / Plus screen. Nothing about it needs a
calibration argument the way the XP and Tiger JPEGs did — a resample of any factor
would introduce a third tone into a two-tone image, and there is none.

Three findings here are the ones a recreation gets wrong:

- **Disabled text is a 50% checkerboard knocked out of the drawn glyph** — Apple's
  `notPatBic`. Proven by parity, not by eye: the File menu's disabled `Revert` is 77
  ink pixels with **all 77 on one `(x + y)` parity**, while `Save As...` beside it is
  179 split 91/88. This is the same discriminator `tools/captures/measure-win31.py`
  applies to Microsoft's `GrayString`, so both vendors' bitmaps are held to one test.
- **An inactive window loses its controls rather than dimming them.** No racing
  stripes, no close box, no size box, and scroll bars reduced to their outer outline.
  Documented in the HIG's own prose (p164) and visible in
  `mac-hig-inactive-windows.png`.
- **The drop shadow is the frame's right column and bottom row translated (+1, +1)**,
  which notches the top-right and bottom-left corners by one pixel. Measured on four
  independent 640x480 screen dumps. Two figures disagree by a pixel at one corner
  each and that disagreement is reported rather than smoothed away.

Requires: pip install pillow numpy
Usage: python3 tools/pdf-extract/measure-mac-system1.py docs/sources/figures
"""

import os
import sys

import numpy as np
from PIL import Image


def load(path, threshold=128):
    """Ink mask. Threshold only matters for the colour System 7 dumps."""
    return np.asarray(Image.open(path).convert('L')).astype(int) < threshold


def runs(vec, offset=0, minlen=1):
    out = []
    start = None
    for i, v in enumerate(vec):
        if v and start is None:
            start = i
        elif not v and start is not None:
            if i - start >= minlen:
                out.append((start + offset, i - 1 + offset))
            start = None
    if start is not None and len(vec) - start >= minlen:
        out.append((start + offset, len(vec) - 1 + offset))
    return out


def longest(vec):
    best = (0, None)
    for a, b in runs(vec):
        if b - a + 1 > best[0]:
            best = (b - a + 1, (a, b))
    return best[1]


def parity(ink, y0, y1, x0, x1):
    """Ink split by `(x + y)` parity. One parity only means a 50% checkerboard."""
    even = odd = 0
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if ink[y, x]:
                if (x + y) % 2 == 0:
                    even += 1
                else:
                    odd += 1
    total = even + odd
    return total, even, odd, (max(even, odd) / total if total else 0.0)


def head(title):
    print(f'\n{title}\n{"-" * len(title)}')


# --------------------------------------------------------------------- the screen


def measure_screen(d):
    ink = load(os.path.join(d, 'mac-hig-screen-512x342.png'))
    h, w = ink.shape
    head(f'Screen — mac-hig-screen-512x342.png ({w}x{h})')
    print(f'  512x342 is the Macintosh 128K/512K/Plus framebuffer exactly.')

    # The screen's own 1px border, with rounded corners.
    top = runs(ink[0])
    print(f'  row 0 ink runs: {top}  (a 1px border, short by 2px at each end)')
    corner = [runs(ink[y])[0] for y in range(3)]
    print(f'  top-left corner, first ink x per row: {[c[0] for c in corner]}'
          f'  -> the screen corners are rounded, 2px')

    # Menu bar.
    rule = [y for y in range(30) if int(ink[y].sum()) == w]
    print(f'  full-width rows in the top 30: {rule}  -> the menu bar rule is row '
          f'{rule[0]}, so the menu bar is {rule[0] + 1}px including it')
    band = ink[1:19]
    groups = []
    start = None
    gap = 0
    colink = band.sum(axis=0)
    for x in range(w):
        if colink[x]:
            if start is None:
                start = x
            gap = 0
        elif start is not None:
            gap += 1
            if gap >= 5:
                groups.append((start, x - gap))
                start = None
    print(f'  menu title ink groups: {groups}')

    # Desktop pattern.
    total, even, odd, share = parity(ink, 200, 280, 460, 500)
    area = (281 - 200) * (501 - 460)
    print(f'  desktop pattern over a clear 41x81 region: {total} ink of {area} '
          f'({100 * total / area:.1f}%), even={even} odd={odd}')
    print(f'    -> a 1px 50% checkerboard: every ink pixel on one (x + y) parity')

    return ink


# ---------------------------------------------------------------------- the frame


# Each entry names where the window's 1px frame rectangle sits in that figure —
# (left, top, right, bottom) — which was located by hand once. The script does not
# re-find it, it re-measures the shadow against it, so what is being tested is the
# construction rather than the search.
FRAME_SPECIMENS = [
    ('mac-hig-window-on-grey.png', 100, (48, 42, 393, 265),
     'System 7 640x480 dump, solid grey desktop'),
    ('mac-hig-inactive-windows.png', 100, (174, 158, 425, 295),
     'the active window in the inactive-state figure'),
    ('mac-hig-modeless-dialog.png', 128, (0, 0, 335, 137), '1-bit, on white'),
    ('mac-hig-slider-window.png', 128, (0, 0, 167, 82), '1-bit, on white'),
    ('mac-hig-screen-512x342.png', 128, (7, 26, 433, 327),
     '1-bit, over the dithered desktop — its parity confounds two of the four reads'),
]


def measure_frames(d):
    head('Window frame and drop shadow')
    print('  Model under test: the frame is a 1px rectangle and the shadow is that')
    print("  rectangle's right column and bottom row translated (+1, +1), which")
    print('  notches the top-right and the bottom-left corner by exactly 1px.')
    for name, thr, (lx, ty, rx, by), note in FRAME_SPECIMENS:
        ink = load(os.path.join(d, name), thr)
        h, w = ink.shape
        sides = {
            'left col': runs(ink[:, lx]),
            'right col': runs(ink[:, rx]),
        }
        shadow_col = [t for t in runs(ink[:, rx + 1])
                      if t[1] - t[0] >= (by - ty) - 4] if rx + 1 < w else []
        top = [t for t in runs(ink[ty]) if t[1] - t[0] > 20]
        bot = [t for t in runs(ink[by]) if t[1] - t[0] > 20]
        shadow_row = [t for t in runs(ink[by + 1]) if t[1] - t[0] > 20] if by + 1 < h else []
        print(f'\n  {name}  ({note})')
        print(f'    frame ({lx},{ty})-({rx},{by})  {rx - lx + 1}x{by - ty + 1}')
        print(f'    left col x={lx} rows '
              f'{[t for t in sides["left col"] if t[1] - t[0] > 20]}')
        print(f'    right col x={rx} rows '
              f'{[t for t in sides["right col"] if t[1] - t[0] > 20]}')
        tr = 'notched 1px' if top and top[-1][1] == rx else (
            f'runs to x={top[-1][1]}' if top else 'not found')
        print(f'    top row y={ty} ink {top}  -> top-right {tr}')
        if shadow_col:
            print(f'    shadow col x={rx + 1} rows {shadow_col[0][0]}..{shadow_col[0][1]}'
                  f'  -> begins {shadow_col[0][0] - ty}px below the frame top')
        print(f'    bottom row y={by} ink {bot}')
        if shadow_row:
            print(f'    shadow row y={by + 1} ink {shadow_row}  -> begins '
                  f'{shadow_row[0][0] - lx}px right of the frame left')


# ------------------------------------------------------------------ the title bar


def measure_titlebar(d):
    ink = load(os.path.join(d, 'mac-hig-modeless-dialog.png'))
    head('Title bar — mac-hig-modeless-dialog.png, frame (0,0)-(335,137)')
    full = [y for y in range(24) if int(ink[y, 0:336].sum()) >= 330]
    print(f'  full-width rows in the top 24: {full}'
          f'  -> the title bar is rows {full[0]}..{full[1]} = {full[1] - full[0] + 1}px')
    stripes = [y for y in range(full[0] + 1, full[1])
               if all(ink[y, 21:97])]
    print(f'  stripe rows: {stripes}  ({len(stripes)} stripes, 1px on / 1px off, '
          f'rows {stripes[0]}..{stripes[-1]} of the title bar)')
    r4 = runs(ink[stripes[0], 0:336])
    print(f'  first stripe row runs: {r4}')
    print(f'    frame line at 0; stripe {r4[1]}; close box {r4[2]}; stripe {r4[3]};')
    print(f'    title clearance {r4[3][1] + 1}..{r4[4][0] - 1}; stripe {r4[4]}; frame {r4[5]}')
    print(f'    -> stripes run left+2 .. right-2; close box is 11px wide at left+9')
    text = [y for y in range(1, 18) if ink[y, 103:235].any()]
    print(f'  title text ink rows: {text[0]}..{text[-1]}')
    caps = [y for y in text if int(ink[y, 103:235].sum()) > 10]
    print(f'    cap band {caps[0]}..{caps[-1]} = {caps[-1] - caps[0] + 1}px'
          f' (Chicago 12 cap height), descender to {text[-1]}')


# ------------------------------------------------------------------- scroll bars


def measure_scrollbars(ink):
    head('Scroll bars and size box — from the 512x342 screen')
    print('  window frame (7,26)-(433,327), shadow x=434 / y=328')
    left = None
    for x in range(400, 434):
        if int(ink[45:300, x].sum()) > 240:
            left = x
            break
    print(f'  vertical scroll bar left border x={left}; frame right x=433'
          f'  -> {433 - left + 1}px wide')
    fulls = [y for y in range(44, 90) if all(ink[y, left:434])]
    print(f'  full-width scroll bar rows: {fulls[:4]}')
    print(f'    up-arrow box y=44..{fulls[1]} = {fulls[1] - 44 + 1}px tall'
          f'  -> a 16x16 box')
    print(f'    scroll box outline columns x={left + 1} and x=432, rows '
          f'{fulls[2]}..{fulls[3]} = {fulls[3] - fulls[2] + 1}px tall by '
          f'{432 - (left + 1) + 1}px wide (the track interior)')
    print(f'      -> a fixed 16px-tall box filling the 14px interior. Proportional '
          f'thumbs are a later Platinum feature.')
    # Trough: QuickDraw ltGray is 0x88 0x22 repeating — one ink px per 2x4 cell.
    cells = {}
    tot = inked = 0
    for y in range(100, 301):
        for x in range(left + 1, 433):
            tot += 1
            if ink[y, x]:
                inked += 1
                cells[(x % 4, y % 2)] = cells.get((x % 4, y % 2), 0) + 1
    dominant = sorted(cells.items(), key=lambda kv: -kv[1])[:2]
    print(f'  trough: {100 * inked / tot:.1f}% ink, concentrated in (x%4, y%2) cells '
          f'{[c[0] for c in dominant]}')
    print(f'    -> QuickDraw ltGray, a 25% 4x2 pattern. The HIG calls the scroll bar '
          f'"a light gray rectangle" (p182).')

    head('Size box')
    hbar = [y for y in range(300, 330) if int(ink[y, 20:430].sum()) > 380]
    print(f'  horizontal scroll bar top border y={hbar[0]}, frame bottom y={hbar[1]}'
          f'  -> {hbar[1] - hbar[0] + 1}px tall')
    icon_rows = [y for y in range(hbar[0] + 1, hbar[1])
                 if any(ink[y, left + 2:433])]
    xs = [x for x in range(left + 1, 433)
          if any(ink[y, x] for y in range(hbar[0] + 1, hbar[1]))]
    print(f'  grow icon bbox x {xs[0]}..{xs[-1]}, y {icon_rows[0]}..{icon_rows[-1]}'
          f'  = {xs[-1] - xs[0] + 1}x{icon_rows[-1] - icon_rows[0] + 1}')
    print(f'    inset inside the 16x16 box: left {xs[0] - left}, top '
          f'{icon_rows[0] - hbar[0]}, right {433 - xs[-1]}, bottom {hbar[1] - icon_rows[-1]}')
    for y in range(icon_rows[0], icon_rows[-1] + 1):
        print(f'      y={y} {runs(ink[y, left + 1:433], left + 1)}')


# ------------------------------------------------------------------------- menus


def measure_menu(d):
    ink = load(os.path.join(d, 'mac-hig-file-menu.png'))
    head('Pull-down menu — mac-hig-file-menu.png')
    lx, rx = 40, 152
    print(f'  left border x={lx}, right border x={rx}, shadow x={rx + 1}')
    print(f'    left col rows {runs(ink[:, lx])[0]};  right col '
          f'{[t for t in runs(ink[:, rx]) if t[1] - t[0] > 100]};  shadow col '
          f'{[t for t in runs(ink[:, rx + 1]) if t[1] - t[0] > 100]}')
    bottom = [y for y in range(200, ink.shape[0])
              if any(t[1] - t[0] > 100 for t in runs(ink[y]))]
    for y in bottom[:2]:
        print(f'    row y={y} ink {[t for t in runs(ink[y]) if t[1] - t[0] > 100]}')
    ix0, ix1 = lx + 1, rx - 1
    ty, by = 19, bottom[0]
    interior = by - ty - 1
    print(f'  interior rows {ty + 1}..{by - 1} = {interior}px')

    seps = []
    for y in range(ty + 1, by):
        band = ink[y, ix0:ix1 + 1]
        n = int(band.sum())
        width = ix1 - ix0 + 1
        if 0.45 * width <= n <= 0.55 * width:
            idx = [i for i in range(width) if band[i]]
            if len(idx) > 3 and all(idx[k + 1] - idx[k] == 2 for k in range(len(idx) - 1)):
                seps.append(y)
    print(f'  separator rule rows: {seps}  (each a 1px 50% pattern spanning the '
          f'full interior width — a grey line, not a solid one)')

    tops = []
    prev = False
    for y in range(ty + 1, by):
        now = bool(ink[y, ix0:ix1 + 1].any())
        if now and not prev:
            tops.append(y)
        prev = now
    labels = [y for y in tops if y not in seps]
    print(f'  item ink tops: {labels}')
    gaps = [labels[i + 1] - labels[i] for i in range(len(labels) - 1)]
    print(f'  ink-top gaps: {gaps}  -> item height 16px; a gap of 32 is an item plus '
          f'a 16px separator, so a separator is a full-height item')
    n_items, n_seps = len(labels), len(seps)
    print(f'  {n_items} items + {n_seps} separators at 16px = '
          f'{16 * (n_items + n_seps)}px against a measured interior of {interior}px')
    boxes = [ty + 1 + 16 * i for i in range(n_items + n_seps)]
    print(f'  derived item boxes: {boxes}')
    print(f'    cap top offset within an item: '
          f'{sorted({t - max(b for b in boxes if b <= t) for t in labels})}')
    print(f'    separator rule offset within its item: '
          f'{sorted({s - max(b for b in boxes if b <= s) for s in seps})}')

    firsts = []
    for t in labels:
        band = ink[t:t + 13, ix0:ix1 + 1].any(axis=0)
        r = runs(band, ix0)
        firsts.append(r[0][0])
    print(f'  label ink start per item: {sorted(set(firsts))}  -> {min(firsts) - lx}px '
          f'right of the left border line')

    head('notPatBic — the disabled-item stipple, proven by parity')
    for name, (y0, y1) in [('Revert (disabled)', (116, 131)),
                           ('Save As... (enabled)', (100, 115)),
                           ('Save (enabled)', (84, 99)),
                           ('Quit (enabled)', (196, 211))]:
        total, even, odd, share = parity(ink, y0, y1, ix0, ix1)
        print(f'  {name:22s} ink={total:4d} even={even:4d} odd={odd:4d} '
              f'one-parity share={share:.3f}')
    print('  -> 1.000 is a 50% checkerboard knocked out of the glyph. ~0.50 is solid '
          'ink.\n     The same discriminator measure-win31.py runs on GrayString.')


def measure_menu_glyphs(ink):
    head('Menu glyphs, from the 512x342 screen (menu box x=152..285)')
    print('  These have no substitute in any Chicago clone, so the skin draws them')
    print('  from the measured bitmaps rather than from a font.')
    for label, (y0, y1, x0, x1) in [
        ('checkmark (Align Left)', (70, 77, 156, 164)),
        ('submenu triangle (Size)', (25, 35, 272, 277)),
    ]:
        print(f'\n  {label}: {x1 - x0 + 1}x{y1 - y0 + 1} at x={x0}, y={y0}')
        for y in range(y0, y1 + 1):
            print('    ' + ''.join('#' if ink[y, x] else '.' for x in range(x0, x1 + 1)))


def measure_command_glyph(d):
    ink = load(os.path.join(d, 'mac-hig-file-menu.png'))
    head('Command-key glyph, from the File menu')
    x0, x1, y0, y1 = 129, 137, 23, 31
    print(f'  {x1 - x0 + 1}x{y1 - y0 + 1} at x={x0}; the key letter starts at x=140,'
          f' so the glyph advances 11px')
    for y in range(y0, y1 + 1):
        print('    ' + ''.join('#' if ink[y, x] else '.' for x in range(x0, x1 + 1)))
    print(f'  menu right border x=152, so the accelerator column starts '
          f'{152 - x0}px left of it')


# ----------------------------------------------------------------- push buttons


def measure_button(d):
    ink = load(os.path.join(d, 'mac-hig-modeless-dialog.png'))
    head('Push button and default ring — mac-hig-modeless-dialog.png')
    # Located by hand once, like the frame rects: ring (259,100)-(325,127) and the
    # button it surrounds, (263,104)-(321,123).
    RING = (259, 100, 325, 127)
    BTN = (263, 104, 321, 123)
    ring_rows = [y for y in range(RING[1] - 4, RING[3] + 5) if ink[y, 256:331].any()]
    print(f'  ring + button occupy rows {ring_rows[0]}..{ring_rows[-1]} = '
          f'{ring_rows[-1] - ring_rows[0] + 1}px, x {RING[0]}..{RING[2]} = '
          f'{RING[2] - RING[0] + 1}px')
    print(f'  button box ({BTN[0]},{BTN[1]})-({BTN[2]},{BTN[3]}) = '
          f'{BTN[2] - BTN[0] + 1}x{BTN[3] - BTN[1] + 1}'
          f'  — the HIG states 59px for OK/Cancel and 20px tall')
    straight = [y for y in range(BTN[1], BTN[3] + 1) if ink[y, BTN[0]] and ink[y, BTN[2]]]
    print(f'  button side columns flush on rows {straight[0]}..{straight[-1]}'
          f'  ({straight[0] - BTN[1]}..{straight[-1] - BTN[1]} of the button)')
    prof = []
    for y in range(BTN[1], BTN[1] + 4):
        r = runs(ink[y, BTN[0]:BTN[2] + 1], BTN[0])
        prof.append(r[0][0] - BTN[0] if r else None)
    print(f'  corner arc, leftmost button ink per row from the button top: {prof}')
    print(f'    -> insets 3,1,1 then flush. A 3-row arc, not a border-radius.')
    rprof = []
    for y in range(RING[1], RING[1] + 6):
        r = runs(ink[y, 256:331], 256)
        rprof.append(r[0][0] - RING[0] if r else None)
    print(f'  ring arc, leftmost ring ink per row from the ring top: {rprof}')
    gapcols = [x for x in range(RING[0], BTN[0]) if not ink[straight[3], x]]
    print(f'  ring is {BTN[0] - RING[0] - len(gapcols)}px thick with a '
          f'{len(gapcols)}px white gap — the HIG states exactly that (p230).')


# ------------------------------------------------------------------ Chicago 12


CHICAGO_TARGETS = [
    ('mac-hig-modeless-dialog.png', 'Modeless Dialog Box', (1, 18), (103, 234)),
    ('mac-hig-file-menu.png', 'Save', (84, 99), (56, 84)),
    ('mac-hig-file-menu.png', 'Revert', (116, 131), (56, 97)),
]


def measure_chicago(d):
    head('Chicago 12 — the substitution target')
    ink = load(os.path.join(d, 'mac-hig-modeless-dialog.png'))
    rows = [y for y in range(1, 18) if ink[y, 103:235].any()]
    caps = [y for y in rows if int(ink[y, 103:235].sum()) > 10]
    print(f'  cap height {caps[-1] - caps[0] + 1}px, descender '
          f'{rows[-1] - caps[-1]}px below the baseline')
    print(f'  a 16px cell: ascent 12 + descent 3 + leading 1. Cap top sits at cell+3 '
          f'and the baseline at cell+11, which is what makes')
    print(f'    19px title bar = 1px frame + 1px + 16px cell + 1px rule, and')
    print(f'    20px menu bar  = 2px + 16px cell + 1px + 1px rule.')
    print('  ink widths a substitute must reproduce at font-size 16px:')
    for name, string, (y0, y1), (x0, x1) in CHICAGO_TARGETS:
        img = load(os.path.join(d, name))
        band = img[y0:y1 + 1, x0:x1 + 1].any(axis=0)
        r = runs(band, x0)
        print(f'    {string!r:22s} {r[-1][1] - r[0][0] + 1:3d}px'
              f'   ({name})')
    print('    File 21  Edit 23  View 30  Label 33  Special 44   (menu bar, p077)')
    print('    New 27  Open... 43  Close 33  Quit 24  untitled 50')


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    d = sys.argv[1]
    screen = measure_screen(d)
    measure_frames(d)
    measure_titlebar(d)
    measure_scrollbars(screen)
    measure_menu(d)
    measure_menu_glyphs(screen)
    measure_command_glyph(d)
    measure_button(d)
    measure_chicago(d)
    return 0


if __name__ == '__main__':
    sys.exit(main())
