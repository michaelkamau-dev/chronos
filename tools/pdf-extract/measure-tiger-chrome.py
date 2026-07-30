#!/usr/bin/env python3
"""
Measures the rest of Mac OS X Tiger's window chrome from four more HIG figures.

`measure-tiger-window.py` read Figure 13-2 and `measure-tiger-titlebuttons.py` read
Figure 13-3. Four further figures in the same two chapters carry what neither of those
could show:

- **Figure 13-19** (p191) "Main, key, and inactive windows" — three windows in one
  bitmap, so the active and *inactive* title bars are measurable side by side, and on
  a window whose client area is visible below the separator.
- **Figure 13-22** (p194) "The elements of a scroll bar" — a whole standard window
  with both scroll bars, the resize control and the toolbar control.
- **Figure 12-12** (p154) "The menu bar displayed when the Finder is active".
- **Figure 12-16** (p158) "The File menu" — item pitch, the highlight, the separator.

**Calibration.** Every one of these reproduces the 22px title bar plus 1px separator
already measured twice, from bitmaps cropped and compressed separately, which is what
establishes them as 1:1 — the same argument the XP caption-button figure was accepted
on. Nothing here is `documented`: Apple published no window, title bar, scroll bar or
menu specification in prose, only figures.

**Two corrections this script exists to make.**

1. `measure-tiger-window.py` located the window's edges with "the first step greater
   than 30 in channel sum", and an Aqua window sits on a *drop shadow*, which is
   itself a ramp of 30-to-40-unit steps. So it locked onto the shadow and reported the
   first traffic light 13px from the window's left edge. The real frame line is the
   largest step in the profile by a factor of five, and measuring from it gives 9px —
   which Figures 13-3 and 13-19 independently confirm.

2. An edge must be found on a **median profile across the whole width or height**, not
   down one row or column. A frame line and a separator span the window; a traffic
   light, a proxy icon, a title string and a toolbar lozenge do not. Probing a single
   column put this script's own first draft's separator on the toolbar control and
   read it as `#26B4D9`, which is Aqua blue rather than a rule.

Requires: pip install pymupdf pillow numpy
Usage:
    python3 tools/pdf-extract/measure-tiger-chrome.py <tiger-hig.pdf> [outdir]
"""

import sys
import os
import numpy as np
from PIL import Image

try:
    import fitz
except ImportError:
    fitz = None

# (0-indexed page, xref, filename stem, what it is)
FIGURES = [
    (190, 1860, "tiger-fig13-19-window-states", "Figure 13-19, main / key / inactive"),
    (193, 1882, "tiger-fig13-22-scrollbars", "Figure 13-22, the elements of a scroll bar"),
    (153, 1579, "tiger-fig12-12-menubar", "Figure 12-12, the Finder menu bar"),
    (152, 4397, "tiger-fig12-11-hierarchical-menu", "Figure 12-11, a hierarchical menu"),
    (124, 1250, "tiger-fig10-1-dock", "Figure 10-1, the Dock"),
    (98, 1137, "tiger-fig7-1-focus-ring", "Figure 7-1, keyboard focus for a text field"),
]

RING = 45   # how much darker than the local title bar a traffic light's ring runs


def hexof(px):
    return "#%02X%02X%02X" % (int(px[0]), int(px[1]), int(px[2]))


def extract(pdf, outdir):
    if fitz is None:
        raise SystemExit("pymupdf is required; pip install pymupdf")
    doc = fitz.open(pdf)
    os.makedirs(outdir, exist_ok=True)
    out = []
    for pno, xref, stem, what in FIGURES:
        page = doc.load_page(pno)
        if xref not in {x for x, *_ in page.get_images(full=True)}:
            raise SystemExit(f"xref {xref} not on page {pno + 1} — wrong PDF edition?")
        info = doc.extract_image(xref)
        path = os.path.join(outdir, f"{stem}.{info['ext']}")
        with open(path, "wb") as fh:
            fh.write(info["image"])
        out.append((path, what, info["width"], info["height"]))
    return out


# --------------------------------------------------------------------- profiles

def row_profile(a, x0=None, x1=None):
    """Per-row median channel-sum. A frame line or separator moves this; an
    ornament a few pixels wide does not."""
    seg = a[:, (x0 or 0) : (x1 if x1 is not None else a.shape[1])]
    return np.median(seg.sum(axis=2), axis=1)


def col_profile(a, y0=None, y1=None):
    seg = a[(y0 or 0) : (y1 if y1 is not None else a.shape[0]), :]
    return np.median(seg.sum(axis=2), axis=0)


def edge(prof, lo, hi):
    """The frame line inside `prof[lo:hi]`: largest step, then the darker side of it.

    Taking the darker side matters because whether the frame line is the row before
    or after the largest step depends on which side is brighter — the page above a
    title bar is brighter, the client area below a separator is brighter too, and a
    single rule between two bright neighbours has the largest step on either side.
    """
    lo = max(1, lo)
    hi = min(len(prof), hi)
    if hi - lo < 2:
        return None
    best, at = -1.0, None
    for i in range(lo, hi - 1):
        d = abs(float(prof[i + 1]) - float(prof[i]))
        if d > best:
            best, at = d, i
    if at is None:
        return None
    # Darkest index within one of the step.
    cand = [j for j in (at - 1, at, at + 1, at + 2) if 0 <= j < len(prof)]
    return min(cand, key=lambda j: prof[j])


def darkest(prof, lo, hi):
    lo, hi = max(0, lo), min(len(prof), hi)
    return min(range(lo, hi), key=lambda i: prof[i])


# --------------------------------------------------------------- window features

def title_bar(a, lx, rx, ty):
    """Title bar depth and its separator row.

    The separator is the darkest full-width row in the band below the top frame
    line, which is what makes a median profile the right instrument: the rule spans
    the window and the ornaments in the bar do not.
    """
    prof = row_profile(a, lx + 2, rx - 1)
    sep = darkest(prof, ty + 10, min(len(prof) - 1, ty + 34))
    return sep - ty, sep


def gradient(a, lx, rx, ty, sep, avoid):
    """Per-row median of the title bar over columns carrying no ornament.

    Median per row rather than one column: any single column through a caption
    eventually crosses a traffic light, the proxy icon or the title text — the trap
    `measure-xp-titlebars.py` documents for Luna.
    """
    keep = [x for x in range(lx + 2, rx - 1)
            if not any(x0 - 1 <= x <= x1 + 1 for x0, x1 in avoid)]
    return [np.median(a[y, keep], axis=0) for y in range(ty, sep + 1)]


def buttons(a, lx, rx, ty, sep):
    """Traffic lights, by contrast against the title bar's own gradient.

    A disabled or inactive light has no saturation at all, so a saturation test finds
    only the coloured ones. Every state shares a dark ring, so the test is "materially
    darker than this row runs at the bar's right end".
    """
    right0, right1 = max(lx + 150, rx - 40), rx - 6
    ref = {y: float(np.median(a[y, right0:right1].sum(axis=1))) for y in range(ty, sep)}
    spans, run = [], None
    for x in range(lx + 2, min(rx, lx + 150)):
        hot = sum(1 for y in range(ty + 1, sep) if ref[y] - float(a[y, x].sum()) > RING) >= 3
        if hot and run is None:
            run = x
        elif not hot and run is not None:
            if x - run >= 7:
                spans.append((run, x - 1))
            run = None
    out = []
    for x0, x1 in spans:
        cx = (x0 + x1) // 2
        rows = [y for y in range(ty + 1, sep) if ref[y] - float(a[y, cx].sum()) > RING]
        if not rows:
            continue
        core = a[rows[0] : rows[-1] + 1, x0 : x1 + 1]
        sat = int((core.max(axis=2) - core.min(axis=2)).max())
        out.append({
            "x": (x0, x1), "d": x1 - x0 + 1,
            "y": (rows[0], rows[-1]), "dy": rows[-1] - rows[0] + 1,
            "inset_left": x0 - lx, "inset_top": rows[0] - ty, "inset_bottom": sep - rows[-1],
            "sat": sat, "coloured": sat > 60,
            "rows": [np.median(a[y, x0 : x1 + 1], axis=0) for y in range(rows[0], rows[-1] + 1)],
        })
    return out


def report_buttons(bs, label):
    print(f"  {label}: {len(bs)} found")
    for i, b in enumerate(bs):
        print(f"    #{i + 1} x {b['x'][0]}..{b['x'][1]} d={b['d']}px  "
              f"y {b['y'][0]}..{b['y'][1]} d={b['dy']}px  "
              f"inset L={b['inset_left']} T={b['inset_top']} B={b['inset_bottom']}  "
              f"{'coloured' if b['coloured'] else 'grey'} sat={b['sat']}")
    if len(bs) >= 2:
        c = [(b["x"][0] + b["x"][1]) / 2 for b in bs]
        print("    centre-to-centre: "
              + " ".join(f"{c[i + 1] - c[i]:.1f}" for i in range(len(c) - 1)))


def darkest_pixel(a, x0, x1, y0, y1):
    seg = a[y0:y1, x0:x1]
    s = seg.sum(axis=2)
    iy, ix = np.unravel_index(np.argmin(s), s.shape)
    return hexof(seg[iy, ix])


# ------------------------------------------------------------------- the figures

def window_states(path):
    """Figure 13-19: active and inactive chrome in one bitmap."""
    a = np.asarray(Image.open(path).convert("RGB")).astype(int)
    print(f"\n########## {path}  {a.shape[1]}x{a.shape[0]}")

    # Each window is located from a row and a column that cross its *client area*,
    # where the only full-width step is the frame line itself. Probing the title bar
    # instead finds a traffic light's ring, which is darker than the frame.
    for label, client_row, client_col, lsearch, tsearch in (
        ("inactive", 45, 430, (0, 40), (0, 14)),
        ("main (active, not key)", 140, 470, (40, 90), (66, 82)),
        ("key (utility / panel)", 205, 700, (230, 280), (162, 178)),
    ):
        rp = row_profile(a, 0, a.shape[1])
        cp = col_profile(a, client_row, client_row + 12)
        lx = edge(cp, *lsearch)
        rp_local = row_profile(a, lx + 30, lx + 200)
        ty = edge(rp_local, *tsearch)
        # Right edge: the next full-height step to the right of the lights, found on
        # the same client band.
        rx = None
        for x in range(lx + 120, a.shape[1] - 1):
            if abs(float(cp[x + 1]) - float(cp[x])) > 120:
                rx = min(x, x + 1, key=lambda j: cp[j])
                break
        if rx is None:
            rx = min(lx + 400, a.shape[1] - 1)
        bar_h, sep = title_bar(a, lx, rx, ty)
        print(f"\n-- {label}: left frame x={lx} {hexof(a[client_row, lx])}, "
              f"right frame x={rx}, top frame y={ty} {hexof(a[ty, lx + 60])}")
        print(f"   title bar {bar_h}px  separator y={sep} {hexof(a[sep, lx + 60])}  "
              f"client below {hexof(a[sep + 1, lx + 60])}")
        bs = buttons(a, lx, rx, ty, sep)
        report_buttons(bs, "lights")
        avoid = [(b["x"][0] - 2, b["x"][1] + 2) for b in bs]
        avoid.append((lx + 110, lx + 340))     # title text and proxy icon
        avoid.append((rx - 40, rx))            # toolbar control, if any
        g = gradient(a, lx, rx, ty, sep, avoid)
        print("   gradient, top row first (the top frame line is row 0):")
        print("     " + " ".join(hexof(p) for p in g))
        print(f"   title ink: {darkest_pixel(a, lx + 120, lx + 320, ty + 3, sep - 3)}")


def scrollbars(path):
    """Figure 13-22: a whole standard window, both scroll bars, the resize control."""
    a = np.asarray(Image.open(path).convert("RGB")).astype(int)
    h, w, _ = a.shape
    print(f"\n########## {path}  {w}x{h}")

    rp, cp = row_profile(a), col_profile(a)
    # The top frame line is the *first* full-width darkening below the page, not the
    # largest: the separator 22 rows further down is darker still, and searching for
    # a maximum finds it and reports a 10px title bar.
    page = float(rp[0])
    ty = next(y for y in range(1, h // 3) if float(rp[y]) < page - 60)
    ty = min((ty - 1, ty, ty + 1), key=lambda j: rp[j])
    by = edge(rp, 2 * h // 3, h - 1)
    lx, rx = edge(cp, 1, w // 4), edge(cp, 3 * w // 4, w - 1)
    print(f"  frame box x {lx}..{rx} (w={rx - lx + 1}), y {ty}..{by} (h={by - ty + 1})")
    print(f"  frame colours: left {hexof(a[h // 2, lx])} right {hexof(a[h // 2, rx])} "
          f"top {hexof(a[ty, w // 2])} bottom {hexof(a[by, w // 2])}")

    bar_h, sep = title_bar(a, lx, rx, ty)
    print(f"  title bar {bar_h}px  separator y={sep} {hexof(a[sep, lx + 60])}  "
          f"client {hexof(a[sep + 1, lx + 60])}")
    bs = buttons(a, lx, rx, ty, sep)
    report_buttons(bs, "lights")

    print("\n  frame thickness — pixels inward from each edge line:")
    y = (sep + by) // 2
    print("    left:   " + " ".join(f"{x}:{hexof(a[y, x])}" for x in range(lx - 1, lx + 4)))
    print("    right:  " + " ".join(f"{x}:{hexof(a[y, x])}" for x in range(rx - 3, rx + 2)))
    print("    bottom: " + " ".join(f"{yy}:{hexof(a[yy, (lx + rx) // 2])}"
                                    for yy in range(by - 3, by + 2)))

    # ---- vertical scroll bar ------------------------------------------------
    # Its left boundary is a full-height step inside the client, so it shows up on a
    # column profile taken over the client rows only.
    cpc = col_profile(a, sep + 4, by - 20)
    sb_left = edge(cpc, rx - 24, rx - 2)
    print(f"\n  vertical scroll bar: left boundary x={sb_left} {hexof(a[y, sb_left])}, "
          f"right frame x={rx} → width {rx - sb_left} px "
          f"({rx - sb_left + 1} px inclusive of both boundary columns)")
    for frac, what in ((0.22, "across the scroller"), (0.60, "across the empty track")):
        yy = int(sep + (by - sep) * frac)
        print(f"    y={yy} ({what}): "
              + " ".join(f"{x}:{hexof(a[yy, x])}" for x in range(sb_left - 1, rx + 1)))
    cx = (sb_left + rx) // 2
    col = a[sep:by, cx]
    sat = col.max(axis=1) - col.min(axis=1)
    hot = [i + sep for i, s in enumerate(sat) if s > 40]
    if hot:
        runs, st = [], hot[0]
        for i in range(1, len(hot)):
            if hot[i] != hot[i - 1] + 1:
                runs.append((st, hot[i - 1]))
                st = hot[i]
        runs.append((st, hot[-1]))
        runs = [r for r in runs if r[1] - r[0] >= 2]
        print(f"    saturated runs down x={cx}: "
              + " ".join(f"{s}..{e} (d={e - s + 1})" for s, e in runs))
        print("    (the long run is the scroller; the short one at the bottom is the "
              "arrow pair, which Tiger places together at one end)")

    # ---- horizontal scroll bar ----------------------------------------------
    rpc = row_profile(a, lx + 4, sb_left - 4)
    hb_top = edge(rpc, by - 24, by - 2)
    print(f"\n  horizontal scroll bar: top boundary y={hb_top} → height {by - hb_top} px")
    print("    " + " ".join(f"{yy}:{hexof(a[yy, (lx + rx) // 2])}"
                            for yy in range(hb_top - 1, by + 1)))

    # ---- corners -------------------------------------------------------------
    print("\n  corner profiles — first stepped x per row, as an inset from the frame line:")
    for name, rows in (("top-left", range(ty, ty + 8)),
                       ("bottom-left", range(by, by - 8, -1))):
        prof = []
        for yy in rows:
            r = [float(v) for v in a[yy].sum(axis=1)]
            at = edge(r, 1, 40)
            prof.append(None if at is None else at - lx)
        print(f"    {name}: {prof}")

    # ---- the drop shadow ----------------------------------------------------
    print(f"\n  drop shadow, page inward to the left frame line (row y={y}):")
    print("    " + " ".join(f"{lx - i}:{hexof(a[y, lx - i])}" for i in range(12, -1, -1)))
    print(f"  drop shadow below the bottom frame line (column x={(lx + rx) // 2}):")
    print("    " + " ".join(f"{by + i}:{hexof(a[min(h - 1, by + i), (lx + rx) // 2])}"
                            for i in range(0, min(13, h - by))))


def menubar(path):
    """Figure 12-12: the Finder menu bar. A full-screen-width crop from the top."""
    a = np.asarray(Image.open(path).convert("RGB")).astype(int)
    h, w, _ = a.shape
    print(f"\n########## {path}  {w}x{h}")
    prof = row_profile(a)
    bottom = edge(prof, 4, h - 4)
    print(f"  bottom rule at y={bottom} {hexof(a[bottom, w // 2])} → "
          f"menu bar is {bottom + 1}px tall including it")
    print("  per-row median, top to bottom:")
    print("    " + " ".join(f"{y}:{hexof(np.median(a[y], axis=0))}" for y in range(0, min(h, bottom + 4))))
    print(f"  menu title ink: {darkest_pixel(a, 4, w // 2, 2, bottom)}")
    # Is any of it translucent? A translucent bar over a desktop shows the desktop's
    # own variation through it; an opaque one does not.
    band = a[2:bottom, :]
    print(f"  horizontal variation inside the bar (std of the row medians): "
          f"{float(np.std(np.median(band, axis=0))):.2f}")


def runs_of(ys):
    """Consecutive integers grouped into (start, end) runs."""
    out, st, prev = [], None, None
    for y in ys:
        if st is None:
            st = y
        elif y != prev + 1:
            out.append((st, prev))
            st = y
        prev = y
    if st is not None:
        out.append((st, prev))
    return out


def menus(path):
    """Figure 12-11: a hierarchical menu — the richest menu specimen in the book.

    It carries in one bitmap everything the skin needs: an enabled item, a *dimmed*
    item, a highlighted item, two separators, an accelerator column, a submenu, and
    a highlighted menu bar title.
    """
    a = np.asarray(Image.open(path).convert("RGB")).astype(int)
    h, w, _ = a.shape
    print(f"\n########## {path}  {w}x{h}")

    # ---- the box -------------------------------------------------------------
    y_clean = 25   # inside the first item, above its text
    row = [float(v) for v in a[y_clean].sum(axis=1)]
    lx = edge(row, 1, 40)
    rx = edge(row, w // 2, w - 1) if w > 240 else None
    # The right border is the first hard step to the right of the label column.
    for x in range(lx + 120, w - 1):
        if row[x] < row[x + 1] - 90 and row[x] < row[x - 1] - 90:
            rx = x
            break
    print(f"  menu box x {lx}..{rx} (w={rx - lx + 1}); "
          f"border left {hexof(a[y_clean, lx])} right {hexof(a[y_clean, rx])}")

    # ---- the background is not flat -----------------------------------------
    # Sampled down a column clear of every label, icon and accelerator.
    col = [hexof(a[y, lx + 4]) for y in range(30, 62)]
    print("  background down x=lx+4, y=30..61 (a horizontal pinstripe, not a flat fill):")
    print("    " + " ".join(col))
    vals = [a[y, lx + 4, 0] for y in range(30, 62)]
    uniq = sorted(set(int(v) for v in vals))
    print(f"    distinct greys: {[f'#{v:02X}{v:02X}{v:02X}' for v in uniq]}")

    # ---- the highlight -------------------------------------------------------
    inner = a[:, lx + 6 : rx - 6]
    sat = (inner.max(axis=2) - inner.min(axis=2)).mean(axis=1)
    bands = [r for r in runs_of([y for y in range(h) if sat[y] > 60]) if r[1] - r[0] >= 8]
    for s, e in bands:
        print(f"  highlight band y {s}..{e} (d={e - s + 1}px)")
        print("    rows: " + " ".join(hexof(np.median(a[yy, lx + 6 : rx - 6], axis=0))
                                      for yy in range(s, e + 1)))
        core = [np.median(a[yy, lx + 6 : rx - 6], axis=0) for yy in range(s + 2, e - 1)]
        print(f"    core (edges dropped, they are JPEG blends): "
              f"{hexof(np.median(np.array(core), axis=0))}")

    # ---- separators ----------------------------------------------------------
    print("  separator rules — full-width rows darker than the pinstripe either side:")
    for y in range(4, h - 4):
        m = float(np.median(a[y, lx + 6 : rx - 6].sum(axis=1)))
        up = float(np.median(a[y - 3, lx + 6 : rx - 6].sum(axis=1)))
        dn = float(np.median(a[y + 3, lx + 6 : rx - 6].sum(axis=1)))
        if up - m > 45 and dn - m > 45 and m > 400:
            print(f"    y={y} {hexof(np.median(a[y, lx + 6 : rx - 6], axis=0))}")

    # ---- item pitch ----------------------------------------------------------
    inked = [y for y in range(20, h - 4) if a[y, lx + 16 : rx - 30].sum(axis=1).min() < 300]
    rr = runs_of(inked)
    tops = [r[0] for r in rr]
    print(f"  ink runs in the label column: {rr}")
    print(f"    top-to-top: {[tops[i + 1] - tops[i] for i in range(len(tops) - 1)]}")

    # ---- text colours --------------------------------------------------------
    print(f"  enabled label ink: {darkest_pixel(a, lx + 16, lx + 110, 28, 42)}")
    print(f"  dimmed label ink:  {darkest_pixel(a, lx + 16, lx + 110, 46, 60)}")

    # ---- the menu bar title, highlighted ------------------------------------
    print("  highlighted menu bar title, per-row median over its width:")
    print("    " + " ".join(hexof(np.median(a[y, 2:26], axis=0)) for y in range(0, 20)))


def dock(path):
    """Figure 10-1: the Dock.

    This is the figure that settles §7's correction — Tiger's Dock is a **flat 2D
    shelf**, not the 3D glass shelf, which arrives with 10.5 Leopard. What it cannot
    settle is the shelf's own fill: the crop places the Dock on the document's white
    page, and Tiger's shelf is translucent, so it composites to the page and the only
    part of it left to measure is its 1px edging. Recorded as unverified with that
    cause rather than guessed at.
    """
    a = np.asarray(Image.open(path).convert("RGB")).astype(int)
    h, w, _ = a.shape
    print(f"\n########## {path}  {w}x{h}")

    rp, cp = row_profile(a), col_profile(a)
    hlines = [y for y in range(1, h - 1)
              if float(rp[y]) < float(rp[y - 1]) - 40 and float(rp[y]) < float(rp[y + 1]) - 40]
    vlines = [x for x in range(1, w - 1)
              if float(cp[x]) < float(cp[x - 1]) - 40 and float(cp[x]) < float(cp[x + 1]) - 40]
    print(f"  full-width rules at y={hlines} "
          + " ".join(hexof(np.median(a[y], axis=0)) for y in hlines))
    print(f"  full-height rules at x={vlines} "
          + " ".join(hexof(np.median(a[:, x], axis=0)) for x in vlines))
    print("  (the vertical rule inside the strip is the Dock's divider, between the "
          "application region and the Trash)")

    # Icon size, from the leftmost icon's saturated extent. This is what calibrates
    # the figure: Apple documents Dock icons at 48px.
    seg = a[:, 0:120]
    sat = (seg.max(axis=2) - seg.min(axis=2)).max(axis=1)
    rows = [y for y in range(h) if sat[y] > 60]
    print(f"  leftmost icon spans rows {rows[0]}..{rows[-1]} → {rows[-1] - rows[0] + 1}px "
          f"against the documented 48px Dock icon — which is what calibrates this figure")
    print(f"  median outside the icons, above and below: "
          f"{hexof(np.median(a[1], axis=0))} / {hexof(np.median(a[h - 2], axis=0))} "
          f"— the page, not the shelf, so the shelf's fill is not in this bitmap")


def type_specimens(menu_path, outdir):
    """Crops of Apple's own rendered type, and their ink widths.

    Lucida Grande cannot ship, so the substitute needs a target to be judged against.
    Windows XP got one from Wine's purpose-built Tahoma metric substitute; Tiger gets
    a better one, because the HIG's figures are 1:1 and therefore contain the actual
    OS rasterisation of known strings at a known size.

    Ink width — first inked column to last — rather than advance width, because ink
    is what a bitmap shows. The substitute is measured the same way, so the two are
    comparable. See tools/font-compare/tiger-lucida.mjs.
    """
    a = np.asarray(Image.open(menu_path).convert("RGB")).astype(int)
    os.makedirs(outdir, exist_ok=True)
    print("\n########## type specimens — Apple's own rasterisation, "
          "system font (Lucida Grande Regular 13pt = 13px)")

    # (label, first ink row, last ink row) for items with no icon in the gutter.
    items = [
        ("Back", 29, 41),
        ("Enclosing Folder", 67, 80),
        ("Recent Folders", 236, 246),
        ("Go to Folder", 267, 277),
        ("Connect to Server", 287, 296),
    ]
    x0, x1 = 30, 175
    for label, y0, y1 in items:
        s = a[y0 : y1 + 1, x0 : x1 + 1].sum(axis=2)
        cols = [x for x in range(s.shape[1]) if s[:, x].min() < 330]
        if not cols:
            continue
        ix0, ix1 = x0 + cols[0], x0 + cols[-1]
        print(f"  {label:<20} ink x {ix0}..{ix1} → {ix1 - ix0 + 1}px wide, "
              f"rows {y0}..{y1} → {y1 - y0 + 1}px tall")
        name = label.lower().replace(" ", "-")
        Image.fromarray(
            np.asarray(Image.open(menu_path).convert("RGB"))[y0 - 2 : y1 + 3, ix0 - 1 : ix1 + 2]
        ).save(os.path.join(outdir, f"tiger-lucida-{name}.png"))
    print(f"  crops written to {outdir}")


def focus_ring(path):
    """Figure 7-1: keyboard focus for a text field.

    The one figure in the book that is a **lossless PNG** rather than a JPEG, which
    makes it the only place a colour can be read without lossy error — and it settles
    two things at once. Apple's prose: "Focus is indicated with a ring in the
    appearance color (Aqua or Graphite)".

    It also proves the Aqua pinstripe. The background here alternates two exact
    values on a 2-row period, in a lossless file, so the pinstripe is a real
    construction rather than compression noise — which is what licenses reading the
    same 2-row alternation out of the JPEG menu figure.
    """
    a = np.asarray(Image.open(path).convert("RGB")).astype(int)
    h, w, _ = a.shape
    print(f"\n########## {path}  {w}x{h}  (lossless PNG)")

    bg = [hexof(a[y, 2]) for y in range(6, 22)]
    print("  background down x=2 (the Aqua pinstripe, in a lossless file):")
    print("    " + " ".join(bg))
    print(f"    distinct values: {sorted(set(bg))}")

    sat = a.max(axis=2) - a.min(axis=2)
    pts = np.argwhere(sat > 40)
    y0, y1, x0, x1 = pts[:, 0].min(), pts[:, 0].max(), pts[:, 1].min(), pts[:, 1].max()
    print(f"  ring bounding box: x {x0}..{x1}, y {y0}..{y1}")
    cy = (y0 + y1) // 2
    print(f"  across the ring's left edge (row y={cy}), outside inward:")
    print("    " + " ".join(f"{x}:{hexof(a[cy, x])}" for x in range(x0 - 2, x0 + 10)))
    cxm = (x0 + x1) // 2
    print(f"  down the ring's top edge (column x={cxm}), outside inward:")
    print("    " + " ".join(f"{y}:{hexof(a[y, cxm])}" for y in range(y0 - 2, y0 + 10)))


def type_check(menubar_path, menu_path):
    """Does Tiger's type land at 1pt = 1px?

    Mac OS X's window server drew at a nominal 72 DPI, so a point should be a pixel
    — unlike Windows at 96, where `8pt` is 10.667px and the era rasterised it at 11.
    That claim is checkable rather than assumed: Lucida Grande's cap height is 0.723
    em, so the 13pt system font should ink caps at about 9px and the 14pt menu bar
    font at about 10px. Measured against the figures below.
    """
    print("\n########## type: is a point a pixel?")
    for path, label, x0, x1, y0, y1 in (
        (menubar_path, "menu bar title", 30, 60, 0, 22),
        (menu_path, "menu item label", 46, 76, 28, 44),
    ):
        a = np.asarray(Image.open(path).convert("RGB")).astype(int)
        seg = a[y0:y1, x0:x1]
        ink = [y for y in range(seg.shape[0]) if seg[y].sum(axis=1).min() < 300]
        if not ink:
            print(f"  {label}: no ink found in the sampled box")
            continue
        print(f"  {label}: ink rows {ink[0]}..{ink[-1]} → {ink[-1] - ink[0] + 1}px tall "
              f"(cap-and-ascender band)")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    pdf = sys.argv[1]
    outdir = sys.argv[2] if len(sys.argv) > 2 else "docs/sources/figures/tiger-chrome"
    got = extract(pdf, outdir)
    for path, what, w, h in got:
        print(f"extracted {path}  {w}x{h}  — {what}")
    window_states(got[0][0])
    scrollbars(got[1][0])
    menubar(got[2][0])
    menus(got[3][0])
    dock(got[4][0])
    focus_ring(got[5][0])
    type_specimens(got[3][0], 'docs/fonts/tiger-apple-type')
    type_check(got[2][0], got[3][0])
    return 0


if __name__ == "__main__":
    sys.exit(main())
