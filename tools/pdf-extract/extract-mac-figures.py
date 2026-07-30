#!/usr/bin/env python3
"""
Extracts the 1-bit figures Chronos measures System 1 from out of
`docs/sources/macintosh-hig.pdf`, at their native pixel size.

Why this document turns out to be the best System 1 source in the repo: the
Macintosh HIG embeds its screen shots as **PNG image XObjects, and many of them are
pure two-colour bitmaps**. One of them — page 105 — is 512x342, which is exactly the
screen of a Macintosh 128K / 512K / Plus. A figure that is 512x342 with two colours
and nothing in between cannot have been resampled: any scale, however small,
introduces a third value. So these are Apple's own pixels at 1:1, in the bit depth
System 1 actually ran at, which is a stronger provenance than the XP and Tiger
figures had (both JPEG, both requiring a calibration argument).

The same reasoning is why `find-figures.py`'s rule holds here too: extract the
XObject, never rasterise the page. Rendering page 105 at any DPI would resample a
512x342 bitmap and destroy the measurement.

Each figure is verified on extraction:

  * the declared native size
  * for the 1-bit set, that `#000000` and `#FFFFFF` are present exactly and that at
    most one other value exists, covering under 5% of the figure

That last allowance is not a loosened test, it is a different test. A resampled
bitmap carries **dozens** of blend values spread along every glyph edge. Two of these
figures carry exactly **one** extra flat tone, because the book's illustrator drew a
callout bracket or a leader line over the screen shot — p204 has `#F1F3F2` and p077
has `#BEBEBE`, each in one contiguous region. So the script reports where the extra
tone lies and how much of the figure it covers, and refuses anything with more than
one, which is the condition that would actually indicate resampling.

Requires: pip install pymupdf pillow numpy
Usage: python3 tools/pdf-extract/extract-mac-figures.py docs/sources/macintosh-hig.pdf docs/sources/figures
"""

import io
import os
import sys

import numpy as np
from PIL import Image

import fitz

# (page number as printed by the PDF reader, image xref, output name, expected px,
#  bit depth we require, what it is for, and optionally the region the 1-bit check
#  applies to). The region exists for one figure: p077 is a 512x67 crop whose top 20
#  rows are the menu bar at 1:1 and whose remaining 47 rows are a flat grey field the
#  book drew to hang callout brackets off. The menu bar is the measurement; the grey
#  is the page.
FIGURES = [
    (105, 506, 'mac-hig-screen-512x342.png', (512, 342), 1,
     'A whole Macintosh screen at native resolution: menu bar, a pulled-down menu '
     'with checkmarks / accelerators / submenu triangles, a document window with '
     'both scroll bars and a size box, and the 50% desktop pattern.'),
    (87, 375, 'mac-hig-file-menu.png', (308, 362), 1,
     'The File menu with Revert disabled. This is the notPatBic specimen — the '
     'parity test that proves the 50% knockout runs on this figure.'),
    (204, 1122, 'mac-hig-modeless-dialog.png', (337, 139), 1,
     'A document-style frame on a white page: the whole 19px title bar, the close '
     'box, the six racing stripes, and a default push button with its ring. The '
     'cleanest frame specimen in the document because nothing is behind it.'),
    (77, 312, 'mac-hig-menubar-512.png', (512, 67), 1,
     'The Finder menu bar at full 512px screen width — menu bar height and title '
     'placement.', (0, 0, 512, 20)),
    (239, 1315, 'mac-hig-slider-window.png', (169, 84), 1,
     'A second 1-bit frame specimen, used to cross-check the title bar and the '
     'shadow corners.'),
    # The colour System 7 screen dumps. Kept because their desktop is a solid grey
    # rather than a dither, which is what makes the drop-shadow corners measurable:
    # on the 1-bit screen the checkerboard's parity paints the same pixel the shadow
    # would occupy, so that one corner cannot be read there.
    (179, 984, 'mac-hig-window-on-grey.png', (636, 480), 8,
     'A 640x480 System 7 screen dump. Solid grey desktop, so the frame + drop '
     'shadow corner geometry is unambiguous.'),
    (163, 891, 'mac-hig-inactive-windows.png', (636, 480), 8,
     'One active and two inactive windows. The inactive ones have no racing '
     'stripes, no close box, no size box and empty scroll bars — the documented '
     'inactive appearance, which most recreations render as a dim instead.'),
    (184, 1010, 'mac-hig-inactive-scrollbars.png', (350, 163), 8,
     'An active window whose scroll bars are inactive: outline only, hollow '
     'arrows, no grey area, no scroll box.'),
]


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 1
    pdf, outdir = sys.argv[1], sys.argv[2]
    os.makedirs(outdir, exist_ok=True)
    doc = fitz.open(pdf)

    failures = 0
    for spec in FIGURES:
        page, xref, name, expect, depth, why = spec[:6]
        region = spec[6] if len(spec) > 6 else None
        try:
            info = doc.extract_image(xref)
        except Exception as exc:
            print(f'FAIL {name}: xref {xref} on p{page} would not decode: {exc}')
            failures += 1
            continue

        got = (info['width'], info['height'])
        if got != expect:
            print(f'FAIL {name}: expected {expect[0]}x{expect[1]}, xref {xref} is '
                  f'{got[0]}x{got[1]} — the PDF is not the edition this was measured from')
            failures += 1
            continue

        im = Image.open(io.BytesIO(info['image'])).convert('RGB')
        checked = im if region is None else im.crop(region)
        arr = np.asarray(checked).reshape(-1, 3)
        uniq, counts = np.unique(arr, axis=0, return_counts=True)
        note = ''
        if depth == 1:
            keys = {tuple(int(c) for c in u): int(n) for u, n in zip(uniq, counts)}
            if (0, 0, 0) not in keys or (255, 255, 255) not in keys:
                print(f'FAIL {name}: black and white are not both present exactly.')
                failures += 1
                continue
            extra = {k: v for k, v in keys.items() if k not in ((0, 0, 0), (255, 255, 255))}
            if len(extra) > 1:
                print(f'FAIL {name}: {len(extra)} tones besides black and white — that '
                      f'is a resampled bitmap, not an illustrator annotation.')
                failures += 1
                continue
            if extra:
                (r, g, b), n = next(iter(extra.items()))
                share = 100.0 * n / len(arr)
                if share >= 5.0:
                    print(f'FAIL {name}: extra tone #{r:02X}{g:02X}{b:02X} covers '
                          f'{share:.1f}% — too much to be a callout.')
                    failures += 1
                    continue
                ys, xs = np.where(np.all(np.asarray(checked) == (r, g, b), axis=-1))
                note = (f'annotation #{r:02X}{g:02X}{b:02X} {share:.2f}% at '
                        f'x {xs.min()}..{xs.max()}, y {ys.min()}..{ys.max()}')

        im.save(os.path.join(outdir, name))
        kind = '1-bit' if depth == 1 else f'{len(uniq)} colours'
        if region is not None:
            kind += f' in {region[2] - region[0]}x{region[3] - region[1]}'
        print(f'ok   {name:34s} {got[0]}x{got[1]:<4d} {kind:12s} p{page} xref{xref}')
        print(f'     {why}')
        if note:
            print(f'     {note}')

    if failures:
        print(f'\n{failures} figure(s) failed verification and were not written.')
    return 1 if failures else 0


if __name__ == '__main__':
    sys.exit(main())
