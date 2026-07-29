# Figure extractions

Bitmaps lifted from the source PDFs, plus what measuring them established. These
close geometry that no vendor stated in prose.

Extracted with `tools/pdf-extract/find-figures.py`; measured with
`tools/pdf-extract/measure-xp-window.py`, `measure-xp-titlebars.py` and
`measure-tiger-window.py`. All three need `pip install pymupdf pillow numpy`.

**Why extract rather than render the page.** A figure captioned "in actual size"
is only 1:1 in the *embedded bitmap*. Rasterising the PDF page at some DPI
resamples it and destroys the measurement. Every number below comes from the
embedded image at its native pixel size.

---

## Windows XP — `xp-window-actual-size.jpeg` (485×403)

*Windows XP Visual Guidelines*, page 34, captioned **"Standard window components in
actual size"**. Microsoft says 1:1, so these are Microsoft's pixels.

| Metric | Measured | Was |
|---|---|---|
| Caption height (outer top edge → client) | **30px** | 28px, from XP.css |
| Frame width, left / right / bottom | **4px**, four discrete 1px steps | 3px, from XP.css |
| Left frame, outermost → innermost | `#0019CE` `#0831D9` `#166AEE` `#0955DE` | three steps only |
| Bottom frame | `#0048F2` ×2, `#001EA0` ×2 | — |
| Top-left corner arc | 5 rows, x-insets **5, 3, 2, 1, 1, 0** | radius 8px, from XP.css |

**XP.css missed the outermost frame step.** Its three colours are my steps 2–4;
there is a fourth, `#0019CE`, outside them. The Luna sizing frame is **4px**, which
settles the 3-vs-4 question §7 had listed as unverified.

**The corner is not an 8px radius.** The arc completes in five rows and its inset
profile is 5,3,2,1,1,0 — a hand-drawn corner bitmap, tighter than XP.css's curve.

### Active caption gradient, per row

Measured as the median of caption-blue pixels per row, so window icon and title
text cannot contaminate a sample. 30 rows:

```
+0  #0058EA   +8  #0054E3   +16 #0056EB   +24 #026AFF
+1  #3E95FF   +9  #0155E4   +17 #0058EE   +25 #026AFD
+2  #2B90FF   +10 #0055E6   +18 #005BF2   +26 #0165FB
+3  #0372FF   +11 #0055E4   +19 #005AF6   +27 #0060FA
+4  #0465F0   +12 #0055E4   +20 #0061FA   +28 #004CE3
+5  #015CE9   +13 #0055E4   +21 #0064F8   +29 #0143CF
+6  #0158E6   +14 #0055E4   +22 #026AFD
+7  #0056E4   +15 #0155EB   +23 #026AFE
```

The shape is unambiguous: a dark top edge, a bright highlight at rows 1–3, a
plateau around `#0055E4` through the middle, a second brightening to `#026AFF`
around rows 22–25, then two dark rows closing it.

**This does not resolve the contested gradient, and it should not be read as
doing so.** The figure is a JPEG, so every value carries lossy error, and none of
these matches either XP.css's endpoints or Microsoft's published palette. What it
does establish is the *structure* — two highlights, not a linear ramp — which is
enough to build a faithful caption and still leaves `luna.msstyles` as the way to
get exact values.

## Windows XP — `xp-titlebar-states.jpeg` (376×160)

Same document, the figure showing inactive, active and maximized captions.

- **Caption height 30px, corner profile 5,3,2,1,1,0** — measured again here,
  independently of the window figure, and identical. Two agreeing measurements
  from separate bitmaps.
- **Inactive caption gradient** — previously unverified anywhere. Same structure,
  desaturated: `#688CE0` top edge, `#98B2E8` / `#9DB9EB` highlight at rows 1–2,
  a `#7A9BE2` plateau, `#7993DE` closing.
- The maximized caption loses the rounded corner. Its height could not be
  measured: the band runs to the bottom edge of the figure and is clipped.

## Mac OS X Tiger — `tiger-window-parts.jpeg` (431×327)

Tiger HIG Figure 13-2, "Standard window parts". Apple published **no** window,
title bar, scroll bar or menu specification section — only figures — so this is the
only source for Tiger's chrome geometry.

| Metric | Measured |
|---|---|
| Title bar height | **22px**, plus a 1px separator (23px to the client area) |
| Traffic light diameter | **~12px** |
| Traffic light spacing | **21px** centre to centre, twice, consistent |
| First light inset from window left | **13px** |
| Scroll bar width | **~15px** |
| Top corner radius | ~6–8px (JPEG-noisy; the shadow interferes) |

### The scale argument, stated because it matters

This figure carries no element whose size Apple documented, so it cannot be
self-calibrated. What can be shown is that this document embeds native-resolution
bitmaps: `tiger-pushbtn-{a,b,c}.png` are Figure 14-1's three push buttons, and they
measure **16, 22 and 19px including their drop shadows** against documented heights
of **15, 20 and 17px "not including the shadow"** — three independent matches at
1:1 once the 1–2px shadow is excluded.

That is evidence, not proof, for Figure 13-2 specifically. Two things corroborate
it anyway: the measured 22px title bar matches the widely-held value *and* the
`NSStatusBar.system.thickness == 22` datum from a filed Apple feedback report, and
the 15px scroll bar matches the classic Aqua figure. All Tiger numbers are
therefore recorded as `measured`, never `documented`.

Note the page-placement scales differ per figure — 1.538 px/pt for the window,
1.25 for the buttons — and neither is 96/72. Placement scale says nothing about the
bitmap; only the bitmap's own pixels matter.

## Classic Mac and Platinum — from prose, not figures

Searching `macintosh-hig.pdf` and `Apple_HIGOS8_Guidelines.pdf` for dimensions
turned up specifications that make several previously-unverified values
`documented`. These are Apple's own words, not measurements.

| Metric | Value | Where |
|---|---|---|
| Document window title bar | **19px** | Macintosh HIG p162; **restated in the OS 8 Platinum addendum p103** |
| Utility window drag region | **11px** | Macintosh HIG p162 |
| Utility window title bar with text | ≥19px, filled with a **25% pattern**, and **no racing stripes** | Macintosh HIG p162 |
| Push button height | **20px** | Macintosh HIG p380 |
| Push button text padding | **≥8px each side** | Macintosh HIG p380 |
| Default button ring | **3px black border, separated by 1px white** | Macintosh HIG p380 |
| Bevel button spacing in dialogs | ≥12px | OS 8 addendum p74 |
| Keyboard-activated button highlight | 8 ticks (~133ms) | Macintosh HIG p380 |

Two of these are significant beyond their own row:

**The 19px title bar is now documented twice.** Phase-0 research had it from
Apple's `StandardWDEF.a` (`minTitleH EQU 19`); the HIG states it in prose, and the
Platinum addendum restates it. So the same 19px applies to the classic era *and* to
Mac OS 8 — Platinum kept the geometry and changed the appearance, exactly as
predicted.

**The default-button ring was listed as unverified** with a note that the
often-repeated "3px ring" was unsourced folklore. It is not folklore: Apple's own
checklist specifies a 3px black border separated by 1px of white.

**Caveat on era.** `macintosh-hig.pdf` is the 1992 edition, describing System 7.
The `documentProc` chrome was visually unchanged from 1984 through System 6, so
19px carries back to System 1 — but the source is System 7-era and that is recorded
rather than glossed.
