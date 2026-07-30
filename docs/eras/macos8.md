# Mac OS 8 Platinum — measured chrome

Era-specific findings for `era/macos8`. Shared documents (`docs/ARCHITECTURE.md`,
`CLAUDE.md`, `docs/sources/figures/README.md`) are left to their owners; only §7's
Mac OS 8 subsection is touched.

**Primary source.** *Mac OS 8 Human Interface Guidelines*, Apple Computer Inc.,
9/2/97 — `docs/sources/Apple_HIGOS8_Guidelines.pdf`. Read second, on purpose: the
OS 8 book is an addendum that defers window, scroll bar and text field
specifications to the classic *Macintosh Human Interface Guidelines* by name, so
`docs/sources/macintosh-hig.pdf` (1992, System 7) is the geometry authority and the
OS 8 book is the appearance authority. Where they disagree on geometry, the OS 8 book
wins for this era; where the classic book is silent on appearance, it is not
evidence.

Prose extraction is already in `docs/sources/macos8-platinum-metrics.md`. This
document covers what only the figures carry.

---

## 1. The extraction, and why it is better sourced than XP or Tiger

Two things about this document make it a stronger source than either of the ones
phase 3 worked from.

**The figures are lossless.** XP's and Tiger's figures are JPEG, which is why every
colour taken from them is `measured` rather than exact and why boundaries had to be
found by change detection. The Mac OS 8 HIG embeds PNG-compressed and *raw* indexed
bitmaps with declared palettes. A colour read out of one of these is Apple's exact
byte. The 4-bit and 8-bit indexed figures also declare their palettes in the PDF
structure, so the era's palette comes out of the file as a list rather than being
inferred from pixels.

**The figures that matter are inline images, and the existing tool could not see
them.** `page.get_images()` reports only a page's `/Resources /XObject` entries.
Three of the figures carrying values no prose states are `BI/ID/EI` inline images
instead, and those pages report *zero* images to the XObject path:

| Page | Figure | Inline image | Carries |
|---|---|---|---|
| 40 | 2-26 A horizontal scroll bar | 140×19, 8-bit indexed, 16-entry palette | scroll bar construction and the accent ramp |
| 103 | 5-5 Tool palette with bevel buttons | 55×109, **4-bit** indexed | the documented 22×22 button, for calibration |
| 105 | 5-7 Full zoom box | 90×45, 8-bit indexed | zoom box artwork |

`tools/pdf-extract/extract-inline.py` was written for this and does the whole job:
catalogue, palette dump, and extraction at native size. The data is uncompressed
index bytes, so there is no decode step that could lose anything.

Reproduce everything below with:

```
pip install pymupdf pillow numpy fonttools brotli
python3 tools/pdf-extract/extract-inline.py   catalogue docs/sources/Apple_HIGOS8_Guidelines.pdf
python3 tools/pdf-extract/extract-xobject.py  catalogue docs/sources/Apple_HIGOS8_Guidelines.pdf
python3 tools/pdf-extract/pixdump.py          row|col|grid|hist|edges <png> …
python3 tools/font-compare/measure-bitmap-type.py <png> <x0> <y0> <x1> <y1> --ink 000000
```

Figures committed to `docs/sources/figures/` as `macos8-*.png`, each the embedded
bitmap at native size. Nothing here was rendered from a page.

### Calibration — the figures are 1:1

Established against values Apple states in prose in the same document, not assumed:

| Anchor | Apple's prose | Measured | Where |
|---|---|---|---|
| Document window title bar | 19px (p103) | **19 rows**, four times | Figures 5-1, 5-3, 5-6 normal, 5-6 collapsed |
| Checkbox / radio square | 12×12px (p75) | nine separate **12×12** bitmaps | p25 Figure 2-5 |
| Tool palette bevel button | 22×22px (p103) | 55×109 sheet, 22px pitch | p103 Figure 5-5 |
| Push button height | 20px (p72) | **20px** | p42 inline images, 53×20 and 55×20 |
| Progress indicator | 12px high (p83) | 128×**14** = 12 + 1px frame each side | p50 Figure 2-42 |

A second, orthogonal argument: **distinct-colour count.** An unresampled era bitmap
carries roughly 8–16 colours; interpolated rescaling produces hundreds. Figure 5-3
has **15**, Figure 5-1 has **13**, the collapsed window has **11**. Every inline
image is also placed at exactly 1 point per pixel — noted only as a coincidence,
since placement scale is never a ruler.

**One figure is magnified and must not be measured for geometry.** Figure 5-7 "Full
zoom box" is 90×45 for what should be two ~13px boxes, and its palette is a 16-step
even grey ramp (`#EFEFEF #DEDEDE #C6C6C6 #B5B5B5 #A5A5A5 #949494 #7B7B7B …`) that
does not intersect the `#DDDDDD`/`#CCCCCC`/`#AAAAAA` family every 1:1 figure uses.
Two different grey families in one document is the tell. Its artwork is usable; its
dimensions are not.

---

## 2. Window frame — chiselled, and asymmetric because of the shadow

Measured in Figure 5-3 (window origin at 0,0) and independently in Figure 5-1, whose
active window origin is at (3,2). Both give identical layer stacks.

**Left frame, outermost → innermost — 6px:**

`#000000` · `#FFFFFF` · `#CCCCCC` · `#CCCCCC` · `#999999` · `#000000`

**Bottom frame, outermost → innermost — 6px, plus 1px of shadow outside it:**

`#000000` · `#999999` · `#CCCCCC` · `#CCCCCC` · `#FFFFFF` · `#000000`

The white and the grey **swap** between the two. That is the whole of "chiselled":
the frame is a raised slab lit from the top-left, so its outer bevel is highlighted
on the top/left and shadowed on the bottom/right, and its inner bevel is the reverse.
Building both sides from one set of CSS variables produces a frame that is visibly
wrong on two edges — the same trap Wine's two raised-edge mappings set for XP.

**The drop shadow is real, and it is System 1's shadow.** `x=403` is `#000000` for
all 217 rows — that is the frame. `x=404` is `#FFFFFF` for rows 0–1 and `#000000`
from row 2 down — a 1px hard shadow on the right and bottom only, starting two rows
below the frame top, which **notches the top-right corner**. Thirteen years after
System 1 and Platinum still draws the same shadow. `shadowInsets` therefore carries
1px on the right and bottom and must be excluded from hit-testing.

Corners are square. There is no radius anywhere in the frame.

| Metric | Value | Level |
|---|---|---|
| Frame, left / top | 6px / 1px + title bar | measured |
| Frame, right / bottom | 6px + 1px shadow | measured |
| Content region | `#FFFFFF` | measured |
| Corner | square, no radius | measured |
| Shadow | 1px `#000000`, right and bottom, offset 2 rows down at the top-right | measured |

---

## 3. Title bar — 19px, and the six racing stripes survived

19 rows, confirmed in four figures. Structure, as row offsets from the title bar's
own first row:

| Rows | Content |
|---|---|
| 0 | `#FFFFFF` — top highlight |
| 1–2 | `#CCCCCC` |
| 3–14 | **six stripe pairs**, each `#FFFFFF` then `#777777` |
| 15–18 | `#CCCCCC` |

and immediately below the 19 rows, outside them: `#999999` then `#000000`.

**Platinum kept System 1's six racing stripes and re-lit them.** System 1 drew six
1px-on/1px-off black lines; Platinum draws six pairs of a white highlight over a
`#777777` shadow on a `#CCCCCC` bar — the same six bands, chiselled instead of
inked. Proven by period rather than by eye: ink lands on rows 3,5,7,9,11,13 for the
shadow and 4,6,8,10,12,14 for the highlight, one class each of `(row − 3) mod 2`,
across twelve consecutive rows and no others.

**The stripes stop clear of the title.** Figure 5-3's flat `#CCCCCC` clear zone runs
x179–x223 while the title's ink runs x183–x219: **4px of clearance on each side** of
the text. A title bar striped edge-to-edge behind the text is the commonest error in
recreations of this era.

Title type sits at rows 5–13 (a 9px cap band), so the baseline is at row 14 and the
ink band is vertically centred with 5 rows above and 5 below.

### Inactive — flat, and its frame lines are not black

Figure 5-1 shows both states side by side, so this is directly measurable rather
than inferred.

| | Active | Inactive |
|---|---|---|
| Frame lines | `#000000` | `#555555` |
| Title bar fill | `#CCCCCC` + stripes | flat `#DDDDDD`, no stripes, no highlight row |
| Title text | `#000000` | `#666666` |
| Below the bar | `#999999` + `#000000` | nothing — the fill runs to the frame |

The total from the outer frame line to the content region is **22px in both states**
— active is 1 + 19 + 1 + 1, inactive is 1 + 20 + 1. So the drag region does not
change size when a window deactivates; only its lighting does. Apple's prose (p99)
independently describes the inactive frame as "flat light gray, recedes," which is
what the pixels show.

---

## 4. Close, zoom and collapse boxes — 13×13, and the arithmetic closes

All three boxes are identical in construction and size. Apple's prose gives their
positions and never their dimensions.

**Footprint 13×13**, built as three layers:

- `#888888` 1px on the top and left
- `#222222` an 11×11 outline
- `#FFFFFF` 1px on the bottom and right

So the box *proper* is **11×11** — System 1's close box size, unchanged — and the
chisel around it brings the footprint to 13×13.

| Metric | Value |
|---|---|
| Footprint | 13×13 |
| Dark body | 11×11 `#222222` |
| Inset from the window's outer frame edge, left and right | **4px** |
| Inset from the title bar's top and bottom | **3px** each |
| Gap between zoom and collapse | **3px** |

**3 + 13 + 3 = 19.** The boxes are genuinely centred in the title bar and land on the
pixel grid — the opposite of XP, where centring a 21px button in a 30px caption
computes 4.5px and had to be resolved as 6 above and 3 below. Odd height, odd box,
integer result.

The interior is not flat: a diagonal gradient runs `#999999` → `#AAAAAA` →
`#BBBBBB` → `#CCCCCC` → `#DDDDDD` → `#EEEEEE` from the top-left to the bottom-right,
so each box reads as a diagonally-lit square rather than a plain sunken well.

Positions, from Apple's prose and confirmed in the figures: close at the far left,
then the title, then zoom, then collapse at the far right (p103–104).

---

## 5. Scroll bars — 16px, and Figure 2-26 disagrees

| Metric | Value | Level |
|---|---|---|
| Thickness | **16px** | measured, three figures |
| Arrow box | **16×16**, square | measured |
| Track fill | `#AAAAAA` | measured |
| Track edges, across | `#777777` `#888888` … `#BBBBBB` `#CCCCCC` | measured |
| Empty / nothing-to-scroll | flat `#EEEEEE`, no arrows, no thumb | measured |
| Thumb | accent-coloured, beveled, with a grip texture | measured |

**The width is contested and the window wins.** Figure 5-3's vertical scroll bar
measures 16px (x383–x398) and Figure 5-1's measures 16px (x196–x211), which also
makes the arrow box a 16×16 square — the classic Mac value this project already
recorded for System 1. But Figure 2-26, the standalone "horizontal scroll bar", is
**19px** thick, with a 16×19 arrow box that cannot be square. It is raw indexed data
with no resampling, so it is not a rescale artefact; it is a specimen drawn thicker
than the control ships. The project's own rule decides it: only a real assembled
window gives real geometry. **16px**, with Figure 2-26 recorded as `contested`.

Figure 2-26 remains the authority on *construction*, since it is the only figure
showing an active scroll bar with both arrows and a thumb.

### The accent colour is a five-step ramp, and it is a variable

Apple states that the scroll indicator "takes the color set by the user through the
Appearance control panel" (p40) and that the default focus ring is lavender (p66).
Two figures show two different accents, which is the proof that it varies:

| Accent | Lightest → darkest | Source |
|---|---|---|
| Lavender (default) | `#CCCCFF` `#9999FF` `#6666CC` `#333399` | Figure 5-3's thumb; `#000044` also in the p31 palette |
| Green | `#CCFFCC` `#66FF99` `#33CC66` `#339966` `#006633` | Figure 2-26's declared palette |

Both are Apple's exact bytes — Figure 2-26's greens are read straight out of the
inline image's declared 16-entry palette, not sampled from pixels. The skin must
treat the ramp as a five-stop custom property, not a constant.

---

## 6. Menu bar and menus

**Menu bar — 20px.** Platinum kept the classic Roman-script height. Construction,
top to bottom: `#FFFFFF` 1px highlight · `#DDDDDD` 17px face · `#999999` 1px ·
`#000000` 1px. Note the face is `#DDDDDD`, **lighter than the title bar's
`#CCCCCC`** — unifying them would be wrong.

**Pulled-down menu title** is filled `#333399` with `#6666CC` above it and `#000088`
below, and its text is `#FFFFFF`. Not a plain inversion.

**Menu popup.** Left frame `#000000` then a `#FFFFFF` highlight; right frame
`#999999` then `#000000`; interior `#DDDDDD`; and a **1px `#222222` drop shadow**
outside the right edge — the same asymmetric shadow idea as the window frame.

| Metric | Value |
|---|---|
| Item height | **16px** — five consecutive 16px pitches measured |
| Separator | **6px** tall; `#888888` rule on its 3rd row, `#FFFFFF` engrave on its 4th |
| Enabled item text | `#000000` |
| Disabled item text | `#888888` |

The separator confirms Apple's own prose for a separator line — "2 pixels, the top
pixel is the line, the bottom pixel is the engrave" (p50) — and supplies the two
colours the prose omits.

### The stipple is gone, and that is the finding

System 1 knocks a 50% checkerboard out of a disabled glyph with `notPatBic`;
Windows 3.1 does the identical thing with `GrayString`. `CLAUDE.md` records that as
a cross-era fact governing two skins. **Mac OS 8 abandons it.**

Figure 4-1 shows a menu with `Undo`, `Cut`, `Paste` and `Clear` disabled beside
`Copy`, `Select All` and `Show Clipboard` enabled, so both states are in one bitmap.
Tested by parity, not by eye:

| Label | Ink | `(x+y)` even / odd | Verdict |
|---|---|---|---|
| `Undo`, disabled | 127 px of `#888888` | 64 / 63 | solid fill |
| `Copy`, enabled | 124 px of `#000000` | 64 / 60 | solid fill |
| `⌘Z`, disabled | 66 px of `#888888` | 33 / 33 | solid fill |

A checkerboard puts 100% of its ink on one parity — that is how the Windows 3.1
disabled `OK` label was proven at 37 pixels on one parity. Here the split is even, so
**Platinum draws disabled text as a solid `#888888`.** The glyph is also unchanged:
`Undo` and `Copy` are both four glyphs of 6px ink each. Same artwork, different ink.

This completes the arc rather than contradicting it. The stipple existed because a
1-bit or 4-bit display has no lighter black. Windows 95 dropped it the moment 8-bit
colour was assumed; Mac OS 8 is 1997 and drops it for the same reason. So the
mechanism governs **System 1 and Windows 3.1 only**, and Platinum is where the Mac
side of it ends — which is worth knowing precisely because a skin that inherited
System 1's stipple would look four years out of date.

---

## 7. Type — Chicago 12, and one figure is not Chicago

Apple shipped **Charcoal** as OS 8's system font and states it is based on Chicago's
metrics (p17); every HIG figure was believed to use Chicago. Chicago 12 is a **12px
em** and Apple documents its overall height as 16px (p70) — which is exactly the
measured menu item height, so a menu item is one line box.

**ChicagoFLF at 12px reproduces Apple's rasterisation.** Scored against ink widths
measured out of the figures, not judged by eye:

| Measure | Apple's figures | ChicagoFLF @ 12px |
|---|---|---|
| Cap height | 9px | **9.00px** |
| x-height | 7px | **7.00px** |
| `Active window` ink extent | 95px | **95px** rendered, 94.80px from advances |
| `Collapsed window`, 15 glyphs | — | mean ink error **0.015px**, max 0.04 |
| `Open window`, 10 glyphs | — | mean ink error **0.015px**, max 0.04 |

Side-bearing structure matches too: Apple documents `J`, `T`, `j` outdenting 1px left
of standard and `I`/`1` taking one more than standard (p70–71). ChicagoFLF's standard
left bearing is 84/1000 em ≈ 1px, `J` and `T` sit at 0, and `I` and `1` sit at 167 ≈
2px. The relative structure is exact; the absolute is consistently 1px below Apple's
stated 2px/3px, which suggests Apple counts from the character cell rather than the
ink. Recorded rather than reconciled.

**Figure 5-3 is Charcoal, not Chicago.** Its title `active` diverges on exactly two
glyphs — `t` is 5px where Chicago's is 4, `v` is 7px where Chicago's is 6 — while
`a`, `c`, `i` and `e` match to 0.05px and cap height, x-height and the 2px stem are
identical. A size change would scale every glyph; this changes two. That is two faces
sharing one set of metrics, which is precisely what Apple says Charcoal is, measured
rather than taken on faith. Figures 5-1 and 5-6 are Chicago; 5-3 is Charcoal. The
metric target therefore has to name its figure, and the sheet does.

Sheet: [`docs/fonts/macos8-chicago.png`](../fonts/macos8-chicago.png), regenerate with

```
node tools/font-compare/macos8-chicago.mjs src/skins/macos8/fonts/chicago-sub.woff2 <refDir> docs/fonts/macos8-chicago.png
```

### The stated visual loss

ChicagoFLF is a smooth outline revival, not a pixel-outline face. Its coordinates do
not all land on the 12px grid — many sit on half-pixels — so where Apple's bitmap has
a hard edge, ChicagoFLF antialiases. Metrically it is the same font; optically it is
a slightly soft version of it. That is the whole of the loss, and it is visible on the
sheet at 4×.

The alternative was considered and rejected: **ChiKareGo2** is a genuine pixel font
and would render hard, but it is a FontStruct recreation whose file carries no licence
record at all (name ID 13 and 14 absent, author `GilesBooth`), and §7 already flags
its terms as needing verification. A confirmed public-domain face with a measurable
0.02px metric error beats an unconfirmed one that is optically closer.

### The licence, and a notice that predates it

`src/skins/macos8/fonts/chicago-sub.woff2` is ChicagoFLF subset to Latin-1 plus the
classic Mac symbols, 9,040 bytes — inside §6's 30KB font budget.

**Its embedded copyright notice contradicts its licence, and both are correct.** Name
ID 0 reads `4.1 (c)1990-92 by Richard A. Ware. All Rights Reserved.` — the original
Casady & Greene *Fluent Laser Fonts* line, Ware having digitised much of that
library. ChicagoFLF is the "FLF" of that series. When Casady & Greene closed, rights
reverted to the authors, and **Robin Casady placed ChicagoFLF in the public domain** —
a statement made after the fact and never written back into the font's name table.

So the file looks encumbered and is not. The notice is retained in the subset rather
than stripped, because it is the font's actual history; the public-domain status is
recorded here, where a licence audit will find both together. This is a general trap:
**a font's embedded copyright notice can predate its licence, and stripping the
notice would destroy the evidence needed to explain the discrepancy.**

### The symbol glyphs

ChicagoFLF has no `U+2318`. It preserves Chicago's own symbol set in the private use
area at `U+E000` + the classic character code, verified by rasterising each one rather
than trusting the glyph names:

| Codepoint | Glyph name | Classic code | Symbol |
|---|---|---|---|
| `U+E003` | `DC1` | 0x11 | ⌘ command |
| `U+E004` | `DC2` | 0x12 | ✓ check |
| `U+E005` | `DC3` | 0x13 | ◆ diamond |
| `U+E006` | `DC4` | 0x14 |  Apple logo |
| `U+E017` | `apple` | — | a second Apple logo |

Menu keyboard equivalents must be composed from `U+E003`, not from `U+2318`, or they
render as tofu.

---

## 8. Still open

- **Grow box.** It sits at the intersection of the two scroll bars and carries
  diagonal grip lines (`#777777` rules with `#FFFFFF` highlights over `#CCCCCC`), but
  its exact footprint is not yet pinned to a single figure — Figure 5-1's active
  window has empty scroll bars, which changes what surrounds it.
- **Utility window crosshatch.** Apple's prose says the drag region is crosshatch
  filled (p102) and Figure 5-4 is a 4-bit bitmap of one, but its period and greys are
  not yet measured.
- **Bevel stacks per control.** Apple documents the widths (small 2 / medium 3 /
  large 4px, p29) and never the colours. Figure 2-11's seven bevel button states and
  Figure 5-5's tool palette carry them.
- **Zoom box variants.** Figure 5-8 shows vertical and horizontal zoom boxes; only
  the full variant is measured.
- **Menu item text insets** and menu bar title spacing.
