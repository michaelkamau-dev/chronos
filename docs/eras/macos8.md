# Mac OS 8 Platinum — measured chrome

Era-specific findings for `era/macos8`. Shared documents (`docs/ARCHITECTURE.md`,
`CLAUDE.md`, `docs/sources/figures/README.md`) are left to their owners; only §7's
Mac OS 8 subsection and §13's contract list are touched.

**Primary source.** *Mac OS 8 Human Interface Guidelines*, Apple Computer Inc.,
9/2/97 — `docs/sources/Apple_HIGOS8_Guidelines.pdf`. Read second, on purpose: the
OS 8 book is an addendum that defers window, scroll bar and text field
specifications to the classic *Macintosh Human Interface Guidelines* by name, so
`docs/sources/macintosh-hig.pdf` (1992, System 7) is the geometry authority and the
OS 8 book is the appearance authority.

Prose extraction is in `docs/sources/macos8-platinum-metrics.md`. This document
covers what only the figures carry.

**Every value here survived an adversarial re-measurement pass** — four independent
lenses instructed to refute rather than confirm, defaulting to "refuted" when they
could not reproduce a value. They refuted 29 of 57 claims in the first draft. What
follows is the corrected table; the corrections are called out where a first reading
would otherwise look reasonable, because most of them are the *kind* of mistake that
looks right.

---

## 1. The extraction, and why it is better sourced than XP or Tiger

**The figures are lossless.** XP's and Tiger's are JPEG, which is why every colour
taken from them is `measured` rather than exact. This document embeds PNG-compressed
and *raw* indexed bitmaps with declared palettes, so a colour read here is the exact
byte the PDF stores.

**That is not the same as an era byte, and one figure proves it.** Check a figure's
palette against the Mac 8-bit grey ramp — multiples of `0x11` — before quoting it. The
chrome figures (4-1, 5-3, 5-4, 5-5, 5-6, 2-25, 2-26) are entirely on that ramp. Page
42's Figure 2-29 declares `#DEDEDE` and `#737373`, which are not, and page 29's bevel
figure is colour-converted the same way. A lossless read of a converted bitmap is
exactly as wrong as a lossy read of an authentic one.

**The figures that carry the unstated values are inline images, and the existing tool
could not see them.** `page.get_images()` reports only a page's `/Resources /XObject`
entries and misses inline images entirely. Three of the figures carrying values no
prose states are `BI/ID/EI` inline, and those pages report *zero* images to the
XObject path:

| Page | Figure | Inline image | Carries |
|---|---|---|---|
| 40 | 2-26 A horizontal scroll bar | 140×19, 8-bit indexed | the only second accent colour |
| 103 | 5-5 Tool palette | 55×109, **4-bit** indexed | the documented 22×22 button |
| 105 | 5-7 Full zoom box | 90×45, 8-bit indexed | the zoom glyph at 2× |

`tools/pdf-extract/extract-inline.py` was written for this. Reproduce with:

```
pip install pymupdf pillow numpy fonttools brotli
python3 tools/pdf-extract/extract-inline.py   catalogue docs/sources/Apple_HIGOS8_Guidelines.pdf
python3 tools/pdf-extract/extract-xobject.py  catalogue docs/sources/Apple_HIGOS8_Guidelines.pdf
python3 tools/pdf-extract/pixdump.py          row|col|grid|hist|edges <png> …
python3 tools/font-compare/measure-bitmap-type.py <png> <x0> <y0> <x1> <y1> --ink 000000
```

### Calibration — the figures are 1:1

| Anchor | Apple's prose | Measured | Where |
|---|---|---|---|
| Checkbox / radio square | 12×12px (p75) | nine separate **12×12** bitmaps | p25 Figure 2-5 |
| Tool palette bevel button | 22×22px (p103) | 22px pitch | p103 Figure 5-5 |
| Progress indicator | 12px high (p83) | 128×**14** = 12 + 1px frame each side | p50 Figure 2-42 |
| Document window title bar | 19px (p103) | interior 20px; see §3 | Figures 5-1, 5-3, 5-6 |

**A calibration anchor was wrong and is removed.** The first draft cited page 42's two
inline images (53×20 and 55×20) as confirming the documented 20px push button. They are
Figure 2-29, *a static text field in its active and disabled states* — Apple's prose on
that page says so, and both bitmaps show the word "Height". Apple documents a static
text field at 16px (p84), so their 20px is figure padding, not a control height. Two of
their greys (`#DEDEDE`, `#737373`) are also off the Mac 8-bit palette that every chrome
figure uses. A calibration table is the argument that the whole extraction is 1:1, so a
row that does not measure what it claims has to come out of it rather than be quietly
kept because the number matched.

**Distinct-colour count**, an orthogonal argument: Figure 5-3 has **15** colours,
Figure 5-1 **13**, the collapsed window **11**. Interpolated rescaling produces hundreds.

**But that test has a blind spot, and one figure fell into it.** Nearest-neighbour
*duplication* introduces no new colours at all, so a bitmap stretched by whole-pixel row
repetition passes the distinct-colour test unchanged. Figure 2-26 is exactly that — see
§5. The test proves "not resampled with interpolation"; it does not prove "not stretched".

**Figure 5-7 is magnified by exactly 2× and is usable.** The first draft dismissed it as
unmeasurable. Wrong: every era pixel is a clean 2×2 block, the left specimen spans
26×26 image pixels = **13×13 era pixels**, and dividing by two makes it a fifth
independent confirmation of the box footprint and the only view of the zoom glyph from a
bitmap with a different palette. Its *colours* are a different family and must not be
used; its geometry is fine once divided.

---

## 2. Window frame — two bevel rings, not six stacked steps

The frame is 6px per side. The first draft enumerated it as six 1px steps per side and
observed that the highlight and shadow "swap" between left/top and bottom/right. The
observation is true of the pixels and the *model* is wrong, in a way that matters for
the stylesheet.

It is **two nested 1px bevel rings around a 2px `#CCCCCC` core, enclosed by `#000000`**:

| Layer | Top / left | Bottom / right |
|---|---|---|
| outer line | `#000000` | `#000000` |
| **ring A** (outset) | `#FFFFFF` | `#999999` |
| core, 2px | `#CCCCCC` | `#CCCCCC` |
| **ring B** (inset) | `#999999` | `#FFFFFF` |
| inner line | `#000000` | `#000000` |

One light source at the top-left, applied to two rings — an outset one and an inset one
— generates all four sides. That is two variable sets, not "one per side", and it is
the model that will not be wrong on two edges. Read as six independent per-side steps,
the same construction needs four hand-maintained lists that can drift apart.

**The shadow notches both free corners, not one.** The right column runs from
window-top + 2, and the bottom row runs from window-left + 2 — an L whose two open ends
are each pulled in by 2px. The first draft recorded only the top-right notch, which is
the one System 1 is famous for; the bottom-left is there in every figure
(Figure 5-3 row 216 starts at x2, the collapsed window's row 22 likewise).

**The shadow's colour tracks the frame line.** `#000000` on an active window and
`#555555` on an inactive one — measured in Figure 5-1, the same bitmap the inactive
palette came from. Recording `#000000` unconditionally would draw a black shadow under a
deactivated window that never had one.

**The shadow is 1px, on three witnesses.** Most extractions are cropped flush to the
shadow — Figure 5-3 is 405px wide for a 404px window — so those crops cannot bound it.
Three figures do show page background beyond it: Figure 5-1 (the next window's frame
abuts at x=218), Figure 5-4 (frame x350, shadow x351, white page x352–354) and Figure
5-5 (frame x52, shadow x53, page beyond).

**6px is the *document window* frame, not Platinum's frame.** The utility window
(Figure 5-4) and the tool palette (Figure 5-5) carry a **4px** frame — `#000000` ·
`#FFFFFF`/`#EEEEEE` · `#999999` · `#000000`, with no 2px core. Both figures were in the
extraction set and neither was cited for the frame in the first draft, which is how a
per-window-class value got written down as an era-wide one.

Corners are square; the only corner treatment anywhere is the shadow's two notches.

---

## 3. Title bar — 19px is documented, 20px is what the bitmaps show

This is the correction with the most consequence for provenance, and the first draft got
its level wrong.

What is **measured**, four times over: **22px** from the outer frame line to the content
region, containing a **20px interior** — 1px of ring A, an 18px `#CCCCCC` face, 1px of
ring B — between the two `#000000` lines.

What is **documented**: Apple's prose says the title bar is 19px (p103), restated from
the classic HIG p162 and corroborated by `StandardWDEF.a`'s `minTitleH EQU 19`.

Those are not the same claim. Both 19-row candidates inside the 20px interior — rows
1..19 or rows 2..20 — cut through one of the bevel rings, and both sum to 22
(`1+19+1+1` and `2+19+1`). **The arithmetic cannot choose between them**, so calling
19px "measured in four figures" overstated it: the figures measure 22 and 20, the 19
comes from prose, and where it sits inside the 20 is `derived`. The first draft also
billed the same white pixel row twice — as frame layer 2 on the left and as "title bar
row 0" on the top — which is what made 1 + 19 + 1 + 1 appear to close.

### The six racing stripes

Platinum kept System 7's six racing stripes and re-lit them: six pairs of a white
highlight over a `#777777` shadow on the `#CCCCCC` face, occupying twelve consecutive
rows. System 1 drew six 1px-on/1px-off black lines; the count survived thirteen years.

Offsets from the interior's first row:

- `#FFFFFF` on **3, 5, 7, 9, 11, 13**
- `#777777` on **4, 6, 8, 10, 12, 14**

*(The first draft's prose stated this backwards while its own table three lines above
had it right. Sampled at two columns outside the title's clear zone, x=100 and x=300,
which agree.)*

**The stripes stop clear of the title, and the clearance is asymmetric.** In Figure 5-3
the clear zone is **46px** against 37px of title ink. It is 5px left / 4px right on
highlight rows and 4px left / 5px right on shadow rows, because the two row types end
one pixel apart. The first draft said "4px each side", which describes a 45px zone that
exists on neither row type — 4 + 37 + 4 = 45 ≠ 46. Nine pixels of total slack,
confirmed in four figures.

### Inactive

| | Active | Inactive |
|---|---|---|
| Frame lines | `#000000` | `#555555` |
| Interior, 20px | ring A / 18px face / ring B, striped | flat `#DDDDDD` |
| Title text | `#000000` | `#666666` |
| Shadow | `#000000` | `#555555` |
| Close / zoom / collapse | drawn | **not drawn at all** |

Both states are **1 + 20 + 1 = 22**. The first draft had active as `1+19+1+1` and
inactive as `1+20+1`; both sum to 22, which hid the fact that they were being counted by
two different conventions. They are the same band.

**An inactive window draws no title bar boxes whatsoever.** Rows 4–23 of Figure 5-1's
inactive window contain exactly two colours — `#DDDDDD` and the `#666666` title ink. No
`#222222`, no `#888888`, no `#FFFFFF`. This is a behaviour a skin must implement and it
also governs hit-testing: there is nothing there to click.

---

## 4. Close, zoom and collapse boxes — 13×13, five layers, three glyphs

**They are not identical.** The first draft said all three boxes share one construction
and one size. Byte-differencing the 13×13 blocks in Figure 5-3 gives 11, 18 and 15
differing pixels between the three pairs — never zero. The chisel, the inner bevel and
the ramp are shared; **the glyph is what distinguishes them**, and the glyph is the
entire point of the widget.

| Box | Glyph |
|---|---|
| Close | none |
| Zoom | a nested 7×7 `#222222` square — 11px of ink |
| Collapse | two 9px `#222222` rules — 18px of ink |

**Five construction layers, not three:**

1. outer chisel — `#888888` top + left, `#FFFFFF` bottom + right, 12px arms
2. an 11×11 `#222222` outline
3. inner bevel — `#CCCCCC` top + left, `#888888` bottom + right, with `#FFFFFF` at the
   inner top-left corner pixel
4. a 7×7 diagonal ramp
5. the glyph

The two layers the first draft omitted are 16 pixels of a 167-pixel widget, and without
them the `#222222` ring lands straight on the ramp with no inner bevel at all.

**The ramp is seven steps, not six**, in 2-wide bands of constant `(col + row)` across a
7×7 core: `#999999` `#AAAAAA` `#BBBBBB` `#CCCCCC` `#DDDDDD` `#EEEEEE` `#FFFFFF`. The
dropped step was `#FFFFFF` — a single pixel, and the brightest one, which is what makes
the diagonal read as lit rather than as a wash. Confirmed at 2× in Figure 5-7.

| Metric | Value |
|---|---|
| Footprint | 13×13 |
| Inset from the window's outer frame edge, left and right | 4px |
| Inset from the interior's top and bottom | 3px each |
| Gap between zoom and collapse | 3px |

**Utility windows carry all three at 10×10** (8×8 `#222222` outline), 2px inset each
side, 1px gap, inside an 11px title bar — matching the classic HIG's documented 11px
utility drag region.

### The size box — settled, and the reason it looked open was wrong

Apple's word is **size box** (p101); *grow box* is the Toolbox name.

**21×21**, and byte-identical across three figures: Figure 5-3, Figure 5-1's active
window and Figure 5-6's normal window differ by **zero pixels**. The first draft left it
open on the theory that Figure 5-1's empty scroll bars changed its surroundings. They do
not: Figure 5-1 has a disabled `#EEEEEE` bar and Figure 5-3 has a live one with a
lavender thumb, and the grow boxes are the same bytes.

Construction: 1px `#000000` rule and 1px `#FFFFFF` highlight on the top and left (16px
arms), a 17×17 `#CCCCCC` field, and the frame's `#999999` and `#000000` on the bottom
and right. Excludes the 1px window shadow.

Grip: **three "/" lines** at constant `(col + row)`, each a 6px `#FFFFFF` run with one
extra head pixel, a 6px `#777777` run two units down-right, and a single `#AAAAAA` tail
pixel, over `#CCCCCC`. On an inactive window the square is reserved and drawn flat
`#DDDDDD` with its rule in `#555555` — no highlight, no grip.

---

## 5. Scroll bars — 16px, and Figure 2-26 is stretched, not contested

**16px**, measured in **four figures across five instances**: Figure 5-3 (active,
lavender thumb), Figure 5-1's active window (empty), Figure 5-1's inactive window,
Figure 5-6 (empty), and **Figure 2-25 — a real list box** (active, lavender thumb).
Arrow box 16×16 square.

**Figure 2-26's 19px is not a second right answer.** The first draft recorded the
19px standalone specimen as `contested` and reasoned that raw indexed data cannot be a
rescale artefact. That reasoning is wrong twice over:

- *Raw indexed data* proves the PDF did not recompress the bitmap. It says nothing about
  whether the bitmap was stretched **before** being pasted in.
- The stretch is **anisotropic**: along the track, Figure 2-26 matches the 16px figures
  to the pixel (arrow box 16, thumb 17); across the track every layer gains, `#888888`
  1→2, `#AAAAAA` 10→11, `#BBBBBB` 1→2. That is whole-row duplication, 16→19, ratio
  1.1875 — and the extra rows are *inside* the black outlines, which no framing could do.

Nearest-neighbour duplication adds no colours, so §1's distinct-colour test cannot see
it. **16px is simply the value.**

The "maybe 19 is the list-box case" hypothesis was the right thing to test and it fails:
the real list box measures 16px with a byte-identical cross-section.

**Figure 2-26 is also not the sole authority on construction.** Figure 2-25 — same
chapter — shows an active bar with both black arrows and a lavender thumb, and its thumb
is pixel-identical to Figure 5-3's (0 differing pixels of 272). Declaring one figure the
only witness without checking its neighbours is exactly the mistake `CLAUDE.md` already
records for XP's caption buttons. Figure 2-26's unique contribution is a *second accent
colour* and the only horizontal bar.

Cross-section, outer line inward: `#000000` `#777777` `#888888` `#AAAAAA`×10 `#BBBBBB`
`#CCCCCC` `#000000`.

### An empty scroll bar still draws its arrows

The first draft said a nothing-to-scroll bar is flat `#EEEEEE` with no arrows. It draws
them, in grey — the same glyph artwork recoloured. There are **two** empty states:

| | Active, nothing to scroll | Inactive window |
|---|---|---|
| Fill | `#EEEEEE` | `#FFFFFF` |
| Arrows | drawn, `#888888` | none |
| Arrow-box dividers | `#555555` | none |
| Outer lines | `#000000` | `#555555` |
| Thumb | none | none |

### The thumb is fixed-size, and it is not a square

**16 across × 17 along** (interior 14×15), measured in three figures against track spans
of 145, 68 and 110px — ratios of 11.7%, 25% and 15.5%. Figure 5-3's and Figure 2-25's
thumbs are byte-identical despite different track lengths, which is what settles fixed
over proportional.

`CLAUDE.md` records classic Mac thumbs as "a fixed **16×16 square**". Fixed is right;
16×16 is not, for Platinum — the along-track dimension is 17.

### The accent is four steps by role, not five

An exact slot-for-slot correspondence between the two thumbs:

| Role | Lavender (default) | Green |
|---|---|---|
| highlight | `#CCCCFF` | `#66FF99` |
| face | `#9999FF` | `#33CC66` |
| grip | `#333399` | `#006633` |
| shadow | `#6666CC` | `#339966` |
| *grip cap* (4px) | `#EEEEEE` — **grey** | `#CCFFCC` |
| *corner* (1px) | `#EEEEEE` | `#FFFFFF` |

The fifth green, `#CCFFCC`, occupies four pixels — the leading caps of the grip lines —
and the structurally identical four pixels in the lavender thumb are a **grey**. A slot
that is accent-coloured in one accent and grey in the other is not a ramp step, so the
ramp is four and the skin needs two extra non-ramp values.

Both ramps are **measured inside thumb pixels**, not merely declared: the green budget
closes at 254 of 255 interior pixels, the lavender at 205 of 210. That is stronger than
the "declared palette" framing the first draft used — by the project's own rule, a
declared palette entry is not proof a colour is used.

**`#000044` is removed.** It comes from a bevel-button icon outline on p31 Figure 2-12,
a different control in a different chapter section, in a figure with no scroll bar and a
disjoint grey family (`#CECECE` `#9C9C9C` `#8C8C8C` `#737373` `#424242`).

Apple states the indicator takes the user's Appearance colour (p40) and that the default
focus ring is lavender (p66). Two figures showing two accents is what proves it varies.

---

## 6. Menu bar and menus

**Menu bar — 20px.** Top to bottom: `#FFFFFF` 1px highlight · `#DDDDDD` 17px face ·
`#999999` 1px · `#000000` 1px. The face is **lighter than the title bar's `#CCCCCC`**;
unifying them would be wrong.

**Pulled-down title**: `#333399` fill with `#6666CC` above and `#000088` below, white
text. Not a plain inversion.

**Popup**: a 1px `#000000` frame on all four sides, and inside it a mitred 1px inner
bevel — `#FFFFFF` on the top and left, `#999999` on the bottom and right, each stopping
one column short at the opposite corner. Interior `#DDDDDD`. The first draft described
only the two vertical edges and read the frame line and the bevel as one stack.

**The popup's shadow is on the right *and* the bottom** — the first draft recorded
right-only. It is the same notched L as the window frame: offset 2 rows down from the
top-right and 2 columns right of the bottom-left, `#222222`, confirmed in all three menu
figures (4-1, and 4-2 and 4-3, which the first draft never opened).

| Metric | Value |
|---|---|
| Item height | **16px** — five consecutive pitches |
| Separator | **6px**; `#888888` rule on row 3, `#FFFFFF` engrave on row 4 |
| Enabled text | `#000000` |
| Disabled text | `#888888` |

The 16px item height is exactly Chicago 12's documented 16px overall height (p70), so an
item is one line box. The pitch is derived from text-band tops, which is only safe
because every item in Figure 4-1 begins with a capital and Chicago's ascenders match its
caps at 9 rows — stated because a mixed-case list would break the derivation.

The separator **reuses** the 2px etch Apple specifies for the separator *control* (p50)
inside a 6px menu item: 2 rows of face, the `#888888` rule, the `#FFFFFF` engrave, 2 rows
of face. It does not confirm the control — two different objects — but it does supply the
colours the prose omits.

**Text inset and title spacing**, settled across all three menu figures: item text ink
starts **16px** right of the popup's interior left edge (18px from the outer frame line),
independent of the first letter; menu bar titles sit at a constant **15px** ink-to-ink
gap, measured across all four gaps in Figure 4-1.

§6 is no longer single-source: p92 Figure 4-2 and p94 Figure 4-3 — neither opened in the
first draft — independently reproduce the 20px bar, the 16px item, the 6px separator and
the shadow.

### The stipple is gone, and that is the finding

System 1 knocks a 50% checkerboard out of a disabled glyph with `notPatBic`; Windows 3.1
does the identical thing with `GrayString`. `CLAUDE.md` records that as a cross-era fact
governing two skins. **Mac OS 8 abandons it.**

| Label | Ink | `(x+y)` even / odd | Verdict |
|---|---|---|---|
| `Undo`, disabled | 127 px of `#888888` | 64 / 63 | solid fill |
| `Copy`, enabled | 124 px of `#000000` | 60 / 64 | solid fill |
| `⌘Z`, disabled | 66 px of `#888888` | 33 / 33 | solid fill |

A checkerboard puts 100% of its ink on one parity — that is how Windows 3.1's disabled
`OK` label was proven at 37 pixels on one parity. Here the split is even. The glyph is
also unchanged: `Undo` and `Copy` are both four glyphs of 6px ink. Same artwork,
different ink.

This completes the arc. The stipple existed because a 1-bit or 4-bit display has no
lighter black; Windows 95 dropped it once 8-bit colour was assumed, and Mac OS 8 is 1997.
The mechanism governs **System 1 and Windows 3.1 only**.

---

## 7. Type — Chicago 12, and Charcoal does *not* match its advances

Charcoal shipped; Chicago is the metric basis and Apple states Charcoal is based on
Chicago's metrics (p17). Chicago 12 is a **12px em**, documented overall height 16px
(p70) — exactly the measured menu item height.

**ChicagoFLF at 12px reproduces Apple's Chicago rasterisation:**

| Measure | Apple's figures | ChicagoFLF @ 12px |
|---|---|---|
| Cap height | 9px | **9.00px** |
| x-height | 7px | **7.00px** |
| `Active window` ink extent | 95px | **95px** |
| `Collapsed window`, 15 glyphs | — | mean ink error **0.015px** |
| `Open window`, 10 glyphs | — | mean ink error **0.015px** |

Side-bearing structure matches: Apple documents `J`, `T`, `j` outdenting 1px and `I`/`1`
taking one more than standard (p70–71); ChicagoFLF's standard bearing is ≈1px, `J`/`T`
sit at 0, `I`/`1` at ≈2px. The relative structure is exact, the absolute is consistently
1px under Apple's stated figures — Apple appears to count from the character cell rather
than the ink.

**Figure 5-3 is the outlier, and the divergence is larger than the first draft said.**
Not two glyphs but four metrics: `t` ink +1, `v` ink +1, **`c` advance −1, `i` advance
−1** — netting a **2px (5%) shortfall over six glyphs**. So "two faces sharing one set of
metrics" is too strong a reading of Apple's prose: Charcoal shares Chicago's design size
and vertical metrics, **not its advances**, and that sentence is exactly what would
license treating a Charcoal title bar as metrically interchangeable. It is not.

And 5-3 is one figure against eight: `t` measures 4px in Figure 4-1's `Edit` (both in the
bar and in the pulled-down title), in its `Cut`, `Paste` and `Select All`, in Figure 4-3,
Figure 2-25 and Figure 2-29. So the whole document is Chicago except Figure 5-3 — which
strengthens ChicagoFLF as the substitute rather than weakening it.

One caveat on the vertical match: the string measured in 5-3 is `active`, which has no
capital, so the 9-row band being compared there is the **ascender** band, not the cap
height.

Sheet: [`docs/fonts/macos8-chicago.png`](../fonts/macos8-chicago.png).

### The stated visual loss

ChicagoFLF is a smooth outline revival, not a pixel-outline face; many coordinates sit
on half-pixels, so where Apple's bitmap has a hard edge it antialiases. Metrically the
same font, optically a slightly soft version of it.

**ChiKareGo2** was considered and rejected: a genuine pixel font that would render hard,
but its file carries no licence record at all (name IDs 13 and 14 absent, author
`GilesBooth`), and §7 already flags its terms as unverified. A confirmed public-domain
face with a 0.02px metric error beats an unconfirmed one that is optically closer.

### The licence, and a notice that predates it

`src/skins/macos8/fonts/chicago-sub.woff2`, 9,040 bytes — inside §6's 30KB budget.

**Its embedded copyright notice contradicts its licence, and both are correct.** Name ID
0 reads `4.1 (c)1990-92 by Richard A. Ware. All Rights Reserved.` — the original
Casady & Greene *Fluent Laser Fonts* line, Ware having digitised much of that library
("FLF" is that series). When Casady & Greene closed, rights reverted to the authors and
**Robin Casady placed ChicagoFLF in the public domain** — a statement made afterwards
and never written back into the name table.

So the file looks encumbered and is not. The notice is **retained** in the subset rather
than stripped, because it is the font's actual history and the evidence a licence audit
needs to explain the discrepancy.

### The symbol glyphs

ChicagoFLF has no `U+2318`; it preserves Chicago's symbol set in the private use area at
`U+E000` + the classic character code. Verified by rasterising each, not by trusting
glyph names:

| Codepoint | Glyph name | Classic code | Symbol |
|---|---|---|---|
| `U+E003` | `DC1` | 0x11 | ⌘ command |
| `U+E004` | `DC2` | 0x12 | ✓ check |
| `U+E005` | `DC3` | 0x13 | ◆ diamond |
| `U+E006` | `DC4` | 0x14 |  Apple logo |

Keyboard equivalents must compose from `U+E003`, not `U+2318`, or they render as tofu.

---

## 8. Still open

The first draft listed five open items. The refutation pass settled four of them and
narrowed the fifth, and surfaced three genuinely new ones.

### Settled

- **Size box** — 21×21, §4.
- **Utility window boxes** — all three at 10×10, §4.
- **Fixed-versus-proportional thumb** — fixed, §5.
- **Figure 5-7** — 2× exactly and usable divided, §1.
- **Menu item text inset and menu bar title spacing** — 16px and 15px, §6.
- **Utility window crosshatch.** A **3×3 cell**: one `#FFFFFF` pixel and one darker
  pixel set one column right and one row down of it, over `#CCCCCC`, repeating with
  period 3 on both axes.
- **The small (2px) bevel stack**, from Figure 5-5's tool palette at 1:1 in era
  colours: a 22×22 button at a 22px pitch with an 18×18 face, outer ring `#666666`
  top/left and `#333333` bottom/right with `#555555` mitres.

### Still open

- **The crosshatch's dark grey is contested.** `#555555` in Figure 5-4 against
  `#777777` in Figure 5-5, with both greys present in both palettes and no reading that
  explains the difference. This is `contested` in the project's strict sense — unlike
  the scroll bar, where a reading *did* explain both numbers. Needs a third crosshatched
  drag region.
- **Medium (3px) and large (4px) bevel colours.** Figure 2-10 gives the widths and the
  ramp structure at 1:1 but is colour-converted, so its greys cannot be quoted, and no
  1:1 era-palette figure in this PDF shows a medium or large bevel.
- **Figure 5-8's vertical and horizontal zoom boxes are not in the file.** Both the
  Figure 5-7 and Figure 5-8 captions sit on the same page, that page carries exactly one
  image — the 90×45 Figure 5-7 — and the next carries none. So this is unsourceable from
  this PDF rather than merely unmeasured, and **no pixel gate can be scheduled against
  it**: a comparison gate needs a reference, and there is none.
- **Menu accelerator column alignment.** All five accelerators in Figure 4-1 are ⌘ plus
  a single 6px capital, so right-aligned and fixed-left produce identical pixels —
  precisely the trap `CLAUDE.md` already records for `Ctrl+F4` / `Ctrl+F6`. Figures 4-2
  and 4-3 supply no mixed-width pair either.
- **Whether the thumb is truly fixed or proportional clamped at a 17px minimum.** Three
  figures at three track lengths all give 17px and Apple's p40 prose says the indicator
  shows position, but figures alone cannot exclude a clamp.
- **What Figure 5-7's second, dark-interior specimen is.** Apple's caption says
  inactive, but Figure 5-1's inactive window has no zoom box at all. A pressed state is
  the most consistent reading and nothing in the source says so.
