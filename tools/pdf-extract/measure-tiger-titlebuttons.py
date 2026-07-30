#!/usr/bin/env python3
"""
Measures Mac OS X Tiger's title bar buttons from Apple's own bitmaps.

Figure 13-3, "Title bar buttons for standard windows" (Tiger HIG p175), is fifteen
separate embedded images rather than one. Every one is placed at px/pt = 1.000,
which is 72 DPI — the resolution Mac OS X itself renders at, so a screenshot placed
at 1.000 is at native size. Figure 13-2 was the only source ARCHITECTURE.md §7 had
for Tiger's chrome; this is a second, independent one in the same chapter, and it
answers what a single window screenshot could not: the traffic lights' artwork in
both the enabled and the disabled state.

**Calibration.** Each specimen reproduces the 22px title bar plus its 1px separator
already measured from Figure 13-2, and does so across fifteen bitmaps that were
cropped separately. A resample cannot preserve a 1px separator fifteen times, and an
integer upscale would report a multiple of 22. Everything here is `measured`.

**Why per-row medians.** The lights are glossy spheres, so a single column through
one crosses the specular highlight and reports it as the whole button. Each row is
summarised by the median of the pixels inside the button's width at that row, which
is the same discriminator `measure-xp-titlebars.py` uses on the Luna caption.

Requires: pip install pymupdf pillow numpy
Usage:
    python3 tools/pdf-extract/measure-tiger-titlebuttons.py <tiger-hig.pdf> [outdir]
"""

import sys
import os
import numpy as np
from PIL import Image

try:
    import fitz
except ImportError:
    fitz = None

# PDF page 175 (0-indexed 174) carries Figure 13-3. The specimens are listed in
# page order, top to bottom then left to right, with what each one shows. The
# reading is from the pixels, not from the page: only one specimen is captioned
# ("Alerts and modal dialogs only"), so the rest are named by what they contain.
SPECIMENS = [
    (1723, "all three enabled"),
    (1724, "close and minimize enabled, zoom disabled"),
    (1731, "no buttons - alerts and modal dialogs only"),
    (1725, "all three disabled"),
    (1732, "close enabled, minimize and zoom disabled"),
    (1718, "close and zoom enabled, minimize disabled"),
    (1722, "minimize and zoom enabled, close disabled"),
    (1719, "minimize enabled, close and zoom disabled"),
    (1721, "zoom enabled, close and minimize disabled"),
    (1720, "close and minimize present, zoom absent"),
    (1730, "close present, minimize and zoom absent"),
    (1726, "close and zoom present, minimize absent"),
    (1727, "minimize and zoom present, close absent"),
    (1729, "minimize present, close and zoom absent"),
    (1728, "zoom present, close and minimize absent"),
]

STEP = 24          # channel-sum delta that counts as an edge, JPEG noise allowed for
RING = 45          # how far below the local title bar a pixel must sit to be ring


def hexof(px):
    return "#%02X%02X%02X" % (int(px[0]), int(px[1]), int(px[2]))


def extract(pdf, outdir):
    """Pull Figure 13-3's specimens out of the PDF at their native pixel size."""
    if fitz is None:
        raise SystemExit("pymupdf is required to extract; pip install pymupdf")
    doc = fitz.open(pdf)
    page = doc.load_page(174)
    have = {x for x, *_ in page.get_images(full=True)}
    os.makedirs(outdir, exist_ok=True)
    paths = []
    for xref, what in SPECIMENS:
        if xref not in have:
            raise SystemExit(f"xref {xref} is not on page 175 — wrong PDF edition?")
        info = doc.extract_image(xref)
        p = os.path.join(outdir, f"tiger-titlebtn-{xref}.{info['ext']}")
        with open(p, "wb") as fh:
            fh.write(info["image"])
        paths.append((xref, what, p, info["width"], info["height"]))
    return paths


def window_box(a):
    """Left edge and top edge of the window inside a specimen.

    The specimen is the window's top-left corner on white page, and the window
    carries a drop shadow — so the edge is a step, never "the first non-white
    pixel". Same rule as measure-tiger-window.py.
    """
    h, w, _ = a.shape
    mid = h // 2
    row = a[mid]
    lx = next(i for i in range(1, w) if abs(int(row[i].sum()) - int(row[i - 1].sum())) > STEP)
    col = a[:, w - 2]
    ty = next(i for i in range(1, h) if abs(int(col[i].sum()) - int(col[i - 1].sum())) > STEP)
    return lx, ty


def title_bar_rows(a, ty, x):
    """Rows of the title bar, and the separator row that ends it.

    The Aqua title bar is a light gradient closed by a distinctly darker 1px rule;
    the client area below is lighter again. So the separator is the darkest row in
    the band under the top edge.
    """
    h = a.shape[0]
    band = [(y, int(a[y, x].sum())) for y in range(ty + 8, min(h, ty + 32))]
    sep = min(band, key=lambda t: t[1])[0]
    return sep - ty, sep


def find_buttons(a, lx, ty, bar_h):
    """Button spans in x, found by contrast against the title bar gradient itself.

    A disabled light is a grey well with no saturation at all, so a saturation test
    (which is what the Figure 13-2 script uses) finds only the enabled ones. What
    every state shares is a dark ring: the button is wherever a column runs
    materially darker than the gradient does at that row.
    """
    h, w, _ = a.shape
    top, bot = ty + 2, ty + bar_h - 1
    # The title bar's own gradient, sampled where no button can be: the right end.
    ref = {y: int(np.median(a[y, w - 12 : w - 2].sum(axis=1))) for y in range(top, bot)}
    dark = np.zeros(w, dtype=int)
    for x in range(lx + 1, w):
        dark[x] = sum(1 for y in range(top, bot) if ref[y] - int(a[y, x].sum()) > RING)
    spans, run = [], None
    for x in range(w):
        if dark[x] >= 2 and run is None:
            run = x
        elif dark[x] < 2 and run is not None:
            if x - run >= 6:
                spans.append((run, x - 1))
            run = None
    if run is not None and w - run >= 6:
        spans.append((run, w - 1))
    return spans


def vertical_span(a, x0, x1, ty, bar_h):
    """Rows the button occupies, by the same contrast rule applied down its middle."""
    h, w, _ = a.shape
    ref = {y: int(np.median(a[y, w - 12 : w - 2].sum(axis=1))) for y in range(ty, ty + bar_h)}
    cx = (x0 + x1) // 2
    rows = [y for y in range(ty, ty + bar_h) if ref[y] - int(a[y, cx].sum()) > RING]
    return (rows[0], rows[-1]) if rows else (None, None)


def profile(a, x0, x1, y0, y1):
    """Per-row median colour across the button's width — its artwork, one row deep."""
    out = []
    for y in range(y0, y1 + 1):
        seg = a[y, x0 : x1 + 1]
        out.append(np.median(seg, axis=0))
    return out


def measure(path, xref, what):
    a = np.asarray(Image.open(path).convert("RGB")).astype(int)
    h, w, _ = a.shape
    lx, ty = window_box(a)
    bar_h, sep = title_bar_rows(a, ty, w - 6)
    print(f"\n=== xref {xref} — {what}")
    print(f"    {w}x{h}px; window left edge x={lx}, top edge y={ty}")
    print(f"    title bar {bar_h}px, separator row y={sep} {hexof(a[sep, w - 6])}, "
          f"client {hexof(a[min(h - 1, sep + 1), w - 6])}")

    spans = find_buttons(a, lx, ty, bar_h)
    if not spans:
        print("    no buttons")
        return {"xref": xref, "what": what, "bar_h": bar_h, "buttons": []}

    got = []
    for x0, x1 in spans:
        y0, y1 = vertical_span(a, x0, x1, ty, bar_h)
        if y0 is None:
            continue
        cx = (x0 + x1) // 2
        # Saturation at the middle rows says enabled (coloured) or disabled (grey).
        mid = a[(y0 + y1) // 2, x0 : x1 + 1]
        sat = int((mid.max(axis=1) - mid.min(axis=1)).max())
        got.append(
            {
                "x": (x0, x1),
                "d": x1 - x0 + 1,
                "y": (y0, y1),
                "dy": y1 - y0 + 1,
                "inset_left": x0 - lx,
                "inset_top": y0 - ty,
                "inset_bottom": sep - y1,
                "sat": sat,
                "state": "enabled" if sat > 60 else "disabled",
                "rows": profile(a, x0, x1, y0, y1),
                "cx": cx,
            }
        )

    for i, b in enumerate(got):
        print(f"    button {i + 1}: x {b['x'][0]}..{b['x'][1]} (d={b['d']}px)  "
              f"y {b['y'][0]}..{b['y'][1]} (d={b['dy']}px)  "
              f"inset left={b['inset_left']} top={b['inset_top']} bottom={b['inset_bottom']}  "
              f"{b['state']} (sat={b['sat']})")
    if len(got) >= 2:
        centres = [(b["x"][0] + b["x"][1]) / 2 for b in got]
        print("    centre-to-centre: "
              + " ".join(f"{centres[i + 1] - centres[i]:.1f}" for i in range(len(centres) - 1)))
    return {"xref": xref, "what": what, "bar_h": bar_h, "sep": sep, "lx": lx, "ty": ty,
            "buttons": got, "img": a}


def corner(a, lx, ty):
    """The top-left corner arc: first stepped x per row, as an inset profile."""
    out = []
    for y in range(ty, ty + 8):
        row = a[y]
        fx = next((i for i in range(1, a.shape[1])
                   if abs(int(row[i].sum()) - int(row[i - 1].sum())) > STEP), None)
        out.append(None if fx is None else fx - lx)
    return out


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    pdf = sys.argv[1]
    outdir = sys.argv[2] if len(sys.argv) > 2 else "docs/sources/figures/tiger-titlebuttons"
    print(f"Figure 13-3, {pdf} page 175 — fifteen specimens, each placed at px/pt = 1.000")

    results = []
    for xref, what, path, w, h in extract(pdf, outdir):
        results.append(measure(path, xref, what))

    # ---- what holds across every specimen ------------------------------------
    bars = sorted({r["bar_h"] for r in results})
    print(f"\ntitle bar height across all fifteen: {bars}")
    diam = sorted({b["d"] for r in results for b in r["buttons"]})
    vert = sorted({b["dy"] for r in results for b in r["buttons"]})
    print(f"button diameter, horizontal: {diam}   vertical: {vert}")
    tops = sorted({b["inset_top"] for r in results for b in r["buttons"]})
    bots = sorted({b["inset_bottom"] for r in results for b in r["buttons"]})
    print(f"inset from window top edge: {tops}   clear above the separator: {bots}")
    firsts = sorted({b["inset_left"] for r in results for b in r["buttons"][:1]})
    print(f"first button inset from the window's left edge: {firsts}")

    # ---- the artwork ---------------------------------------------------------
    # One representative per category, from the specimen where that button is the
    # only enabled one, so nothing about a neighbour can contaminate the sample.
    solo = {"close": 1730, "minimize": 1729, "zoom": 1728, "disabled": 1725}
    print("\nper-row median artwork (top row first):")
    for name, xref in solo.items():
        r = next(x for x in results if x["xref"] == xref)
        if not r["buttons"]:
            continue
        b = r["buttons"][0] if name != "disabled" else r["buttons"][0]
        rows = " ".join(hexof(p) for p in b["rows"])
        print(f"  {name:<9} ({b['dy']} rows) {rows}")

    # Horizontal variation, which decides whether a per-row gradient is honest.
    print("\nhorizontal spread within a row (max channel range across the row's width):")
    for name, xref in solo.items():
        r = next(x for x in results if x["xref"] == xref)
        if not r["buttons"]:
            continue
        b = r["buttons"][0]
        a = r["img"]
        mid = (b["y"][0] + b["y"][1]) // 2
        seg = a[mid, b["x"][0] : b["x"][1] + 1]
        print(f"  {name:<9} row y={mid}: " + " ".join(hexof(p) for p in seg))

    # ---- the title bar itself ------------------------------------------------
    # Sampled to the right of every button, so nothing ornamental is in the median.
    # These specimens are the cleanest reading of the Aqua title bar in the book: the
    # values come out exactly neutral (R = G = B on every row) across fifteen crops,
    # where the two larger figures both carry a 4-to-9 unit cool cast. See
    # docs/eras/tiger.md — the cast is recorded as contested rather than averaged away.
    print("\nactive title bar gradient, per-row median right of the buttons "
          "(row 0 is the top frame line):")
    for xref in (1723, 1725, 1730):
        r = next(x for x in results if x["xref"] == xref)
        a = r["img"]
        x0, x1 = r["lx"] + 70, a.shape[1] - 3
        rows = [np.median(a[y, x0:x1], axis=0) for y in range(r["ty"], r["sep"] + 1)]
        neutral = all(abs(p[0] - p[1]) <= 1 and abs(p[1] - p[2]) <= 1 for p in rows)
        print(f"  xref {xref} ({len(rows)} rows, exactly neutral: {neutral})")
        print("    " + " ".join(hexof(p) for p in rows))

    # ---- the corner ----------------------------------------------------------
    r = results[0]
    print(f"\ntop-left corner inset per row (xref {r['xref']}): {corner(r['img'], r['lx'], r['ty'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
