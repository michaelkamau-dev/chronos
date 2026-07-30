# Macintosh System 1 (1984)

Everything measured, resolved or left open for `era/system1`. The shared docs keep
the cross-era rules; this file keeps what belongs to one era.

**Reproduce it all:**

```
pip install pymupdf pillow numpy fonttools brotli
python3 tools/pdf-extract/extract-mac-figures.py docs/sources/macintosh-hig.pdf docs/sources/figures
python3 tools/pdf-extract/measure-mac-system1.py docs/sources/figures
node tools/font-compare/system1-chicago.mjs <fontDir> docs/fonts/system1-font-chicago.png
npx playwright test test/browser/system1-fidelity.spec.ts
```

---

## The source turned out to be better than XP's or Tiger's

The *Macintosh Human Interface Guidelines* embeds its screen shots as PNG image
XObjects, and **several of them are pure two-colour bitmaps**. One is **512×342** —
exactly the framebuffer of a Macintosh 128K / 512K / Plus.

That single fact removes the calibration argument this project needed twice before.
XP's figure required Microsoft's "in actual size" caption plus a 27-instance
cross-check; Tiger's required arguing from three documented push-button heights in a
different figure. A 512×342 image containing exactly `#000000` and `#FFFFFF` and
nothing between them **cannot have been resampled**: any scale, by any factor,
introduces a third value. So these are Apple's own pixels, at 1:1, in the bit depth
the era actually ran at.

`extract-mac-figures.py` enforces that on extraction and refuses anything that fails
it. Two figures carry exactly *one* extra flat tone — an illustrator's callout
bracket, `#F1F3F2` on p204 and `#BEBEBE` on p077 — and the script reports where it
lies rather than rejecting them, because one flat tone in one contiguous region is
not what resampling looks like. Resampling produces dozens of blend values along
every glyph edge.

### The figures

| File | Source | What it settles |
|---|---|---|
| `mac-hig-screen-512x342.png` | p105, 1-bit | Whole screen: menu bar, a pulled-down menu, a document window with both scroll bars and a size box, the desktop pattern |
| `mac-hig-file-menu.png` | p87, 1-bit | The File menu with `Revert` disabled — the `notPatBic` specimen |
| `mac-hig-modeless-dialog.png` | p204, 1-bit | A document-style frame on white: the whole 19px title bar, close box, six stripes, and a default push button with its ring |
| `mac-hig-menubar-512.png` | p77, 1-bit in its top 20 rows | The Finder menu bar at full screen width |
| `mac-hig-slider-window.png` | p239, 1-bit | A second frame specimen, for cross-checking |
| `mac-hig-window-on-grey.png` | p179, colour | A 640×480 System 7 dump on a **solid** grey desktop — the only place the shadow corners are unambiguous |
| `mac-hig-inactive-windows.png` | p163, colour | One active and two inactive windows |
| `mac-hig-inactive-scrollbars.png` | p184, colour | An active window with inactive scroll bars |

**Era caveat, kept rather than glossed.** `macintosh-hig.pdf` is the 1992 edition and
describes System 7. The `documentProc` chrome was visually unchanged from 1984 through
System 6, and its 19px title bar is independently in Apple's shipped `StandardWDEF.a`
as `minTitleH EQU 19`, so the geometry carries back. Where a feature is *later* than
System 1 it is named and omitted — the zoom box arrives with `zoomDocProc` in 1987 and
this era has none.

---

## What the measurements corrected

### The title bar decomposes exactly

19px, measured on four figures and stated twice in Apple's prose (p162, restated in
the Platinum addendum p103):

```
row 0        the frame's top line
rows 1–3     clear
rows 4–14    the six racing stripes, 1px on / 1px off
rows 15–17   clear
row 18       the rule under the caption
```

which is **1px frame + 1px + a 16px Chicago 12 cell + 1px rule**. The same
arithmetic gives the 20px menu bar: 2px + the 16px cell + 1px + its 1px rule. Neither
number is a coincidence and neither can be adjusted independently of the font.

### Two §7 values were off by a pixel

- **Racing stripes span `left+2` → `right-2`**, not `left+1`. Measured on the
  modeless-dialog frame: row 4 reads frame line at 0, stripe 2–7, close box 9–19,
  stripe from 21.
- **The close box is 9px in from the frame line**, not 10. Confirmed twice: x=16
  against a frame line at x=7 on the 512×342 screen, and x=9 against x=0 on the
  modeless dialog.

### The drop shadow, and the corner notch §7 predicted

§7 says the frame is 1px left/top and 2px right/bottom, the second pixel being a hard
drop shadow, and that this notches the top-right corner. Both are confirmed, and the
construction is now exact: **the shadow is the frame rectangle's right column and
bottom row translated (+1, +1)**, which notches the top-right *and* the bottom-left by
one pixel each. In CSS that is one `box-shadow: 1px 1px 0 0` on an inner element — the
notches come free, and drawing the second pixel as border instead squares them off,
which is what nearly every classic Mac recreation does.

The corner notch is **measured with variance**, and the variance is reported rather
than smoothed:

| Specimen | Top-right notch | Bottom-left notch |
|---|---|---|
| `mac-hig-window-on-grey.png` (genuine 640×480 dump) | 1px | 1px |
| `mac-hig-inactive-windows.png` (genuine 640×480 dump) | 2px | 1px |
| `mac-hig-modeless-dialog.png` (book crop) | 1px | 2px |
| `mac-hig-slider-window.png` (book crop) | 1px | 0px |
| `mac-hig-screen-512x342.png` | unmeasurable | unmeasurable |

The two genuine screen dumps agree on 1px at both corners and that is what ships. The
512×342 screen cannot settle either corner: the desktop is a 50% checkerboard, and its
`(x + y)` parity paints ink at exactly the pixel the shadow would occupy. That is the
one place where the best-provenance figure in the set is the least useful, and it is
worth remembering — a dithered background can hide a 1px feature completely.

### The scroll bar track is 25%, not 50%

Measured 25.2% ink concentrated in the `(x%4, y%2)` cells `(0,0)` and `(2,1)` —
QuickDraw's `ltGray` exactly, on a 4×2 cell. The HIG independently calls the scroll
bar "a light gray rectangle" (p182). The **desktop** is the 50% one: 50.0% ink with
every pixel on one parity.

Getting these the wrong way round would put the era's two most visible dithers at each
other's density.

### The scroll box is 16px tall and fills the 14px track interior

§7 said "a fixed 16×16 square". Measured: the vertical scroll bar is 16px wide
*including* its own 1px left border and the window's 1px frame line, so its interior is
14px, and the scroll box's outline is 14 wide × 16 tall. Sixteen counting the borders,
fourteen as its own artwork — the second is what a skin draws.

### An inactive window loses its controls; it does not dim them

Apple's own enumeration, p164: *"The close box, zoom box, size box, scroll box, and
stripes in the title bar disappear."* Visible in `mac-hig-inactive-windows.png`. Three
consequences:

- The **title text is not in that list**, and there is no second black to dim it to, so
  it stays ink. The colour figure shows grey because a colour screen has a grey; a
  1-bit screen does not.
- Scroll bars have **three** documented states, not two (p184): active and scrollable
  shows the grey area, the scroll box and the arrows; active and unscrollable shows the
  outline with hollow arrows and no grey area; inactive shows only the outer outline.
- Almost every recreation renders this as opacity. It is not opacity.

### Menu geometry closes on the arithmetic

From the File menu, nine items and three separators:

| | |
|---|---|
| Item height | **16px** — nine cap tops all land on item + 3 |
| Separator | **a full 16px item**, its 9th row carrying the rule |
| Separator rule | a 1px **50% alternating** line spanning the whole interior width — 56 ink pixels across 111px |
| Interior | 9 items + 3 separators × 16px = **192px** against a measured 192px |
| Label ink | border + 16 |
| Checkmark | 9×8 bitmap at border + 4 |
| Command symbol | 9×9 bitmap, 23px left of the right border, key letter 11px after it |
| Submenu arrow | 6×11 solid triangle, right edge 8px from the right border |

**One figure disagrees and it is recorded rather than averaged.** The Format menu on
the 512×342 screen gives an item pitch of 16 (four consecutive items, so the pitch is
solid) but a separator of roughly 10–12px, and its numbers do not close on any
consistent grid. The File menu is internally exact — three independent 32px
item-to-item gaps across a divider, nine cap tops on +3, and an interior that divides
evenly — so it is the specimen that ships. The Format menu's separator height stays
contested.

### Push buttons are documented and the corner is not a radius

59×20 is Apple's prose (p228, p229) and measures exactly that. The corner is a
hand-drawn **3-row arc with x-insets 3, 1, 1** then flush — the same category of fact
as XP's 1px command-button indent, and no `border-radius` reproduces it. The default
ring is 3px of ink separated by 1px of white, also prose (p230), with its own measured
5,3,2,1,1 arc.

The white gap between ring and button carries the *button's* arc profile on a box one
pixel larger, which is why the skin can reuse one clip path for both.

### Chicago 12, as a target

| | |
|---|---|
| Cell | 16px — ascent 12 + descent 3 + leading 1 |
| Cap height | **9px** |
| Descender | **3px** |
| Cap top | cell + 3 |
| Baseline | cell + 11 |

Ink widths a substitute must reproduce at 16px: `Modeless Dialog Box` 132, `untitled`
50, `Save` 29, `Revert` 42, `Quit` 24, `Close` 33, `Open...` 43, `New` 27, `File` 21,
`Edit` 23, `View` 30, `Label` 33, `Special` 44. Per-glyph advances from ink-start
deltas: `N` 9, `e` 8, `O` 8, `p` 8, `C` 8, `l` 4, `S` 7, `a` 8, `v` 8, `Q` 8, `u` 8,
`i` 4, `P` 8, `r` 6.

---

## notPatBic, proven on Apple's own pixels

The disabled `Revert` in the File menu is **77 ink pixels with all 77 on one `(x + y)`
parity**. `Save As...` beside it is 179 split 91/88; `Save` 108 split 56/52; `Quit` 181
split 91/90.

That is the same discriminator `tools/captures/measure-win31.py` runs on Microsoft's
`GrayString`, so both vendors' bitmaps are now held to one test — and
`test/browser/stipple.ts` runs it on our render, so the sources and the two
implementations are held to that same one. `measureParity` moved there out of
`win31-fidelity.spec.ts` for exactly that reason: a second copy is a second thing that
can drift.

The construction is Windows 3.1's, unchanged, per the instruction and per
DECISIONS.md 4.12: an `::after` layer painting a checkerboard of the *background*
colour over the glyph. CSS cannot knock a pattern out of live text, and a `mask` on the
element stipples the frame along with the label.

---

## The font: ChiKareGo2, and three rejections

Sheet: [`docs/fonts/system1-font-chicago.png`](../fonts/system1-font-chicago.png).
Source face: [`docs/fonts/ChiKareGo2.ttf`](../fonts/ChiKareGo2.ttf). Subset:
`src/skins/system1/fonts/chicago-sub.woff2`, 3.6KB.

| Candidate | Cap @16px | Off-grid coords | Advances | Ink exact | Verdict |
|---|---|---|---|---|---|
| **ChiKareGo2** (Giles Booth) | 9 | **0 / 16172** | 12/14 | 7/13 | **accept** |
| Chicago Kare (Duane King) | 9 | 300 / 8892 | 13/14 | 10/13 | reject |
| FA Sysfont C (Alina Sava) | 10.672 | 6476 / 6804 | 0/14 | 0/13 | reject |
| ChicagoFLF (attrib. Robin Casady) | 12 | n/a — outline revival | 0/14 | 0/13 | reject |

**ChicagoFLF is disqualified by its own copyright record.** §7 lists it as "public
domain per Robin Casady". The binary's nameID 0 reads **"4.1 (c)1990-92 by Richard A.
Ware. All Rights Reserved."** — a different author and an explicit reservation of
rights. It is also the wrong lineage: an outline revival with a 750/1000 cap, 33% wider
than Chicago 12 on every string. This is the 98.css lesson arriving from a new
direction — the trap was not a converted binary this time, it was a licence claim that
the file itself contradicts.

**FA Sysfont C has the best licence in the field and the worst geometry.** OFL 1.1
declared inside the binary with a deed URL, by the author whose W95FA this project
already vetted. And it was drawn on a grid then fitted to 1000 upm, so 95% of its
coordinates and 182 of 188 advances are fractional at *every* integer size, and its cap
height at 16px is 10.672px. Nothing about a licence can fix that. Worth stating
plainly: the best-licensed candidate is not automatically the shippable one.

**Chicago Kare matches the widths better than the accepted face and still loses.**
Twenty-four glyphs are off the pixel grid, including the quote and apostrophe a window
title will carry and — the reason it was a candidate at all — U+2713, whose advance is
11.11px. Its provenance is unstated: the README claims a faithful reproduction with no
method, the repo LICENSE says MIT while the binary's nameID 13 says OFL, the copyright
record names Susan Kare, and the family name uses a typeface name Apple holds as a
trade mark.

**ChiKareGo2 verifies structurally.** 1024 upm on a 64-unit grid, so at `font-size:
16px` every coordinate and every advance lands on a whole pixel: 0 off-grid
coordinates and 0 off-grid advances across all 178 mapped code points. Cap height
exactly 9px, descender exactly 3px, ascent 12 + descent 3 — Chicago 12's cell. Its
provenance is stated: drawn glyph by glyph in BitFontMaker2 from observation in a 68k
emulator, and its name does not claim Apple's trade mark.

### Two stated losses, and one open licence question

- **Two glyph advances diverge by 1px.** `N` is 10px against 9 and `r` is 7px against
  6. Consequence per measured string: `New` +1, `File` +1, `Edit` +1, `Revert` +1,
  `Modeless Dialog Box` +2, `Open...` −1. Seven of thirteen strings are exact and the
  worst error is 2px on a 132px string, +1.5%. Same category as Trebuchet's
  double-storey `g` and Pixel Operator's ±16%: a real, permanent, stated loss.
- **Four chrome glyphs have no substitute at all.** No candidate carries the checkmark,
  the command symbol, the submenu arrow or the grow icon on the pixel grid, so all four
  are transcribed from the figures pixel for pixel and drawn as `box-shadow` bitmaps in
  `currentColor` — which also means they invert with a highlighted menu item for free.
- **The licence variant is unconfirmed, and this needs you.** ChiKareGo2 is
  Creative Commons per the author's release page. Every primary source is refused at
  this sandbox's proxy: the author's blog (403 on CONNECT), the BitFontMaker2 gallery
  (403), and fontlibrary.org (403) — the same block §7 records for the Platinum
  mirrors. What is reachable is a third-party statement in
  `EngineersNeedArt/SystemSix`: *"The ChiKareGo2 font is under Creative Commons
  license."* The specific variant and version are **not confirmed**, and the binary
  carried no licence record. The subset now carries one, written before subsetting:
  nameID 0 attributes Giles Booth, nameID 13 states Creative Commons and says the
  variant is unconfirmed, nameID 14 is the release page. Attribution satisfies every CC
  variant; a `-ND` variant would forbid the WOFF2 conversion. **One fetch from outside
  the sandbox closes this**, and it is the same shape of ask as the Platinum HIG.

---

## LCD subpixel antialiasing, and why "two colours" is not assertable as written

The strongest test in the era's suite is that no pixel anywhere is a mid grey. Getting
it to state something true took several passes and the finding generalises to every
dithered era, so it belongs here.

**Chromium tints the edge pixels of a glyph whenever it takes the LCD text path, and it
does so even when the glyph is perfectly pixel-aligned**, because the filter kernel
spans neighbouring subpixels. Measured on this era, the fringes are exactly four
values — `#4f0f00`, `#000f4f`, `#ffe7a7`, `#a7e7ff` — whose lumas are 32, 18, 231 and
215. Every one is within a few percent of black or white. **There is no mid grey**,
which is the claim the era actually makes and the one the test now asserts.

When Chromium takes that path explains why some surfaces are pure and others are not.
LCD text is used when the text sits on a background Blink can prove opaque **and** the
containing layer's transform is a translation:

- **Window titles are fringed** — a white erase rect behind the string, and the frame
  carries `translate3d`. 800 tinted pixels on a four-letter title at scale 2.
- **Menus are not** — a menu is scaled by `--display-scale`, and a scale disables the
  LCD path outright. Measured 0.
- `background: none` on the title made it pure too, by removing the provable opacity —
  and let the racing stripes run through the string, which is flatly wrong rather than
  subtly wrong. Not taken.

**None of the font-smoothing properties help.** Measured on this Chromium:
`-webkit-font-smoothing: antialiased`, `-webkit-font-smoothing: none`,
`font-smooth: never` and `text-rendering: optimizeSpeed` all leave the count unchanged.
That is §7's claim about that property restated as a measurement rather than a warning.

§7 already names the complete cure — render the affected text to a 1× canvas and
upscale with `image-rendering: pixelated`. It costs selectable, accessible text, so it
is not taken here and the limitation is recorded instead.

Two constructions in the skin exist because of this, and both are the era's own rather
than workarounds:

- **The title's clearance is erased by the title bar, not painted by the title.** That
  is what the Window Manager did — erase a rect, then draw the string — and it keeps
  the text element transparent.
- **The title is centred with `Math.floor` in the chrome renderer.** CSS centring
  distributes free space without rounding, so a title whose width has the opposite
  parity to its bar lands on a half pixel. `StandardWDEF` positions the title with
  `(left + right - titleWidth) / 2` in integer arithmetic, which truncates — so the
  floor is the era's arithmetic, not a rounding convenience.

---

## Knowing divergences

Each is a place the era and the harness genuinely disagree. None is a measurement that
was fudged.

| Divergence | Why |
|---|---|
| **Window cycling on `Ctrl+Tab`** | §12 conflict 1. System 1 is single-tasking; MultiFinder is 1987. Control is the right key to spend it on precisely because the 1984 keyboard has none, so the chord cannot collide with anything the era bound. |
| **`Escape` bound alongside `Meta+.`** | The 1984 keyboard has no Escape key; `Cmd+.` was the cancel. Escape is bound anyway as the accessibility escape hatch, because CLAUDE.md forbids an era's behaviour from being what blocks one. |
| **Eight resize handles** | The era resized from the grow box and nowhere else. §2 specifies the affordance for this era in as many words — "with `metrics.resizeGrab` slop so a 1px System 1 border is still grabbable" — so the `se` handle is exactly the 16×16 grow box and the other seven are the harness's. |
| **A chrome context menu on the title bar** | System 1 had no such menu. It is the harness's, present in every era, and it is why Move and Size are reachable at all without function keys. |
| **No hover state** | Not a divergence but an absence, and the fidelity suite asserts it: hover is **identical** to rest. Rollover feedback arrives with the Appearance Manager in 1997. Asserting a difference here, as the other two eras' suites do, would have forced an invention. |
| **The close box's pressed artwork** | Inversion, from the HIG's general rule for highlighting (p284, "reversing the background with the foreground") and the button rule (p229, "the button highlights (inverts)"). No figure shows a pressed close box, so the *artwork* is the documented general rule applied, not a measurement. |
| **The radio button's dot** | 12×12 envelope measured; the HIG documents "a dot in the middle of the button" (p234) but the dot's bitmap was not isolable from any figure. That one shape is `unverified` in metrics.ts. |

---

## Not built in this pass

- **The menu bar.** Measured (20px including its 1px rule, title ink positions from the
  512px strip) and recorded in `SYSTEM1.menuBar`, but not rendered. It needs Tiger's
  `ShellRegion` / `SkinManifest.regions`, which is on
  `claude/chronos-tiger-phase-4-tm4o09` and not yet in main. Building a second
  region mechanism to avoid waiting would be worse than waiting.
- **Scroll bars, the size box's drag behaviour beyond the `se` handle, and the
  three documented scroll-bar states.** Scroll bars are a tier-2 widget and the
  `UiKit` is phase 5; XP and Windows 3.1 ship none either. Every number they need is
  measured and in `SYSTEM1.scrollBar`, including the `ltGray` cell.
- **The Apple menu glyph.** Needed only by the menu bar.
