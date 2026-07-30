# Mac OS X Tiger — measured chrome

Everything Chronos knows about Tiger's chrome, and where each number came from.
Apple published **no** window, title bar, scroll bar, Dock or menu specification in
prose — the *Apple Human Interface Guidelines*, Tiger edition (2005-12-06) states
control sizes and font sizes and shows everything else only as figures. So the top
level of confidence available here is `measured`, never `documented`, exactly as
`docs/sources/win31-metrics.md` records for Windows 3.1 and for the same reason.

Reproduce every number below with:

```
pip install pymupdf pillow numpy
python3 tools/pdf-extract/measure-tiger-window.py docs/sources/figures/tiger-window-parts.jpeg
python3 tools/pdf-extract/measure-tiger-titlebuttons.py docs/sources/tiger-hig-2005-12-06.pdf
python3 tools/pdf-extract/measure-tiger-chrome.py      docs/sources/tiger-hig-2005-12-06.pdf
```

---

## 1. The sources, and why they are 1:1

Phase 3 had one Tiger figure, 13-2, and argued its scale from Figure 14-1's three
push buttons measuring 16/22/19px against documented heights of 15/20/17px "not
including the shadow". That argument stands, and it is now much stronger, because
**five more figures were found and every one of them independently reproduces the
22px title bar plus its 1px separator**:

| Figure | Page | Bitmap | What it settles |
|---|---|---|---|
| 13-2 "Standard window parts" | 173 | 431×327 jpeg | the whole window, scroll bar, proxy icon |
| **13-3 "Title bar buttons for standard windows"** | 175 | **15 separate bitmaps**, ~100×27 each, all placed at **px/pt = 1.000** | the traffic lights' artwork, enabled *and* disabled |
| 13-19 "Main, key, and inactive windows" | 191 | 861×569 jpeg | the **inactive** title bar; the utility-window title bar |
| 13-22 "The elements of a scroll bar" | 194 | 451×329 jpeg | scroll bar, scroller, frame, corners, shadow |
| 12-12 "The menu bar displayed when the Finder is active" | 154 | 771×39 jpeg | menu bar height and gradient |
| 12-11 "A hierarchical menu" | 153 | 502×333 jpeg | menu item pitch, highlight, separators, dimmed text |
| 10-1 "The Dock" | 125 | 944×78 jpeg | the Dock is a **flat 2D shelf**; icon size |
| 7-1 "Keyboard focus for a text field" | 99 | 237×45 **png — lossless** | the Aqua focus ring; proof of the pinstripe |

Six independent crops agreeing on 22px + 1px is what makes these 1:1. A resample
cannot preserve a 1px separator six times over, and an integer upscale would report a
multiple of 22. The 22px also matches the independent `NSStatusBar.system.thickness`
datum, and Figure 12-12 puts the **menu bar** at the same 22px — which is the value
that datum actually describes.

**Figure 13-3 is the single most valuable find.** It is fifteen bitmaps rather than
one, each placed at exactly `px/pt = 1.000` — one image pixel per point, which is 72
DPI, which is the resolution Mac OS X itself drew at. It is the Tiger analogue of
Windows XP's "states for Title Bar buttons" specimen sheet, and it settles the traffic
lights the way that sheet settled Luna's caption buttons.

**A caveat kept rather than glossed.** This edition's figures carry the copyright line
"© 1992, 2001-2003, 2005", and individual bitmaps may predate Tiger — Figure 7-1's
pinstriped window body is an Aqua 10.0–10.2 trait. Every value here is therefore
"measured from the Tiger HIG", which is not quite the same claim as "measured from
Tiger". Where a figure looks era-specific it is noted below.

---

## 2. Two corrections to ARCHITECTURE.md §7

### The first traffic light is 9px from the window edge, not 13px

§7 records "First light inset from window left: **13px**". That is wrong, and the
cause is a bug in `measure-tiger-window.py`, not a misreading of the figure.

The script found the window's edges with *the first step greater than 30 in channel
sum*. An Aqua window sits on a soft drop shadow, and that shadow is a ramp of
30-to-40-unit steps — so the search stopped on the shadow, three pixels outside the
window, and every inset measured from it came out 3px too large. The real frame line
is the **largest** step in the row by a factor of five:

```
row y=100, Figure 13-2, steps left to right:  (217, x=13)  (40, x=9)  (32, x=10)
                                               ^ the frame  ^ the shadow ramp
```

Measuring from x=13 gives **9px**, and three other figures agree exactly:

| Figure | first light's ring starts | window frame line | inset |
|---|---|---|---|
| 13-2 | x=22 | x=13 | **9px** |
| 13-3 (all fifteen specimens) | x=18/19 | x=9/10 | **9px** |
| 13-19, inactive window | x=19 | x=10 | **9px** |
| 13-19, main window | x=64 | x=55 | **9px** |
| 13-22 | x=23 | x=14 | **9px** |

The script is fixed and carries a note saying what the threshold version cost.
Figure 13-2's saturation-based light detector reports 10px rather than 9px because it
finds the *coloured core* and skips the light's 1px dark ring; both readings are the
same measurement of different things and are reconciled in §3 below.

### The traffic lights are 14px, not 12px

§7 records "Traffic light diameter: ~12px", measured with a saturation test on Figure
13-2 — which finds only the saturated interior and stops at the ring. Measuring by
contrast against the title bar's own gradient instead, so that a *grey* light is found
too, gives **14px including a 1px dark ring, with a 12px coloured core**. Both numbers
are right about different boundaries; 14px is the one the layout needs.

This is confirmed 40 times over: fifteen specimens in Figure 13-3 carry up to three
buttons each, plus six more across Figures 13-19 and 13-22, and **every one measures
14×14**. As with Luna's 21×21 buttons, that is also the argument the bitmaps were not
resampled.

---

## 3. The window frame

| Metric | Value | Level |
|---|---|---|
| Title bar height | **22px** | measured — six figures |
| Separator below the title bar | **1px `#8C8C8C`** → 23px to the client area | measured |
| Frame, left / right / bottom | **1px**; left `#A4B6BE`, right `#AEBAC0` | measured — 13-22 |
| Top frame line | **1px `#C0C0C0`** | measured — 13-3, exactly neutral in fifteen crops |
| Top corner | a **5-row arc**, x-insets **4, 3, 2, 1, 1, 0** | measured — 13-3 |
| Bottom corners | square | measured — 13-22 |
| Drop shadow, sides | ~12px ramp, `#FBFBFB` → `#A4B6BE` at the frame | measured — 13-22 |
| Drop shadow, below | deeper than 12px; still ramping at the crop edge | measured, incomplete |

**The corner ships as a `radius`, and that is a real choice.** The measured arc profile
4,3,2,1,1,0 is structurally the same kind of object as Luna's 5,3,2,1,1,0 — and
DECISIONS 3.15 made `cornerTop` a union precisely so an era could say which it is.
Tiger's arc is **antialiased**, where Luna's is hard 1-bit steps, so a `border-radius`
reproduces it and a `clip-path` polygon would actually be *less* faithful: it would
throw away the partial coverage that is part of the artwork. A 6px radius predicts
insets 3.6, 2.0, 1.1, 0.6, 0.2, 0.0 against the measured 4, 3, 2, 1, 1, 0 — the 1px
excess at rows 1–2 is the antialiasing the measurement cannot help including. **6px,
`measured`.**

### The active title bar gradient — resolved, not contested

Three of Figure 13-3's specimens, cropped and compressed separately, give the same 23
rows to within one unit, and **every row is exactly neutral (R = G = B)**:

```
row 0  #C0C0C0   ← the top frame line
   1   #F9F9F9      8   #E3E3E3     15  #D7D7D7
   2   #EFEFEF      9   #E2E2E2     16  #D5D5D5
   3   #E8E8E8     10   #E0E0E0     17  #D3D3D3
   4   #E6E6E6     11   #DFDFDF     18  #D1D1D1
   5   #E6E6E6     12   #DDDDDD     19  #CFCFCF
   6   #E6E6E6     13   #DBDBDB     20  #CCCCCC
   7   #E4E4E4     14   #D9D9D9     21  #CACACA
row 22 #8C8C8C   ← the separator
```

A bright top row, a short plateau at `#E6E6E6`, then a smooth ramp to `#CACACA`.

Figures 13-2 and 13-19 read the same bar with a **4-to-9 unit cool cast** (`#F4FBFD`
… `#DFECF2`). That looked like it might be Aqua Blue's real tint and would have had to
be recorded as contested, like Luna's caption gradient — except that three independent
crops landing on byte-identical *exactly neutral* values settles it. A source with any
tint could not produce `R = G = B` on 23 rows three times. The cast belongs to those
two busier, more heavily compressed bitmaps. **Neutral, `measured`.**

### The inactive title bar

From Figure 13-19, whose three windows make active and inactive directly comparable:

| | active | inactive |
|---|---|---|
| gradient | `#F9F9F9` → `#CACACA`, a full ramp | **nearly flat**, `#FAFBFD` then `#EFF4F8`–`#EBF0F3` |
| title ink | `#000000` | **`#4D5B5F`** |
| traffic lights | coloured | **grey wells**, identical to the disabled artwork |
| separator | `#8C8C8C` | `#9A9FA1` |

Apple's prose backs the lights: *"Active windows are visually distinct from inactive
windows in that their controls have color, while the controls in inactive windows do
not have color."* (p191, documented.)

---

## 4. The traffic lights

| Metric | Value | Level |
|---|---|---|
| Diameter | **14px** including a 1px ring; 12px coloured core | measured — 40+ instances |
| Centre to centre | **21px**, never varying | measured — 13-2, 13-3, 13-19, 13-22 |
| First light, inset from the frame line | **9px** | measured — five figures |
| Inset from the top frame line | **5px** | measured — all fifteen specimens |
| Clear above the separator | **4px** | measured — all fifteen specimens |

**The lights are not vertically centred**, and this is the same finding Luna's caption
buttons produced. Centring 14px in a 22px bar gives 4px above and 4px below; measured
is **5 above, 3 below** (4 to the separator). They sit one pixel low, in all fifteen
specimens. `5 + 14 + 4 = 23`, which is the title bar plus its separator — the same
kind of exact division that confirmed Luna's `6 + 21 + 3 = 30`.

### The artwork, per row

Per-row median across each light's width, top row first, from the specimen where that
button is the only one present so no neighbour can contaminate the sample:

```
close     #B9B9B9 #848B8C #AE9B9C #B99797 #A65450 #B4352E #C1362F
          #D05449 #E36A5F #F07A71 #F39788 #DD9C8D #C68F8B #C8C3C5
minimize  #B9B7B8 #8F868B #B99E9D #B8B39A #C88249 #D98520 #EB9427
          #F3AE2E #F8BB3F #F6CB5A #FAD177 #DBD686 #CDCD7B #C6C3C3
zoom      #B7B7B7 #89898C #9AA09D #A3B39F #729448 #549B25 #6BAC29
          #80BE2E #93D14B #A4DC69 #B2E37C #BDDC8C #ABCD85 #C4C8C6
disabled  #C9C9C9 #ADADAD #C8C8C8 #C5C5C5 #C1C1C1 #C8C8C8 #CDCDCD
          #D6D6D6 #DDDDDD #E0E0E0 #E1E1E1 #DADADA #D0D0D0 #CECECE
```

Read down a light: a dark ring, a grey-pink specular highlight at rows 2–3, the
saturated body, then a *brightening* toward the bottom (`#F39788`, `#FAD177`,
`#B2E37C`). That bottom brightening is Aqua's inner reflection and it is what makes
these read as glass rather than as flat dots.

**The widely-circulated `#FF5F57` / `#FEBC2E` / `#28C840` are modern macOS values from
CSS clones and are not in this document.** Tiger's close button peaks at `#F07A71` and
its body sits around `#C1362F`.

**A shading component we do not reproduce, stated rather than hidden.** The lights are
shaded horizontally as well as vertically — the close button's middle row runs
`#411316` at the ring, `#B42A27`, up to `#D96058` at the centre, and back down. The
skin ships the measured *vertical* gradient plus a measured 1px ring, so the centre of
each light is up to ~20 units darker than Apple's. Reproducing the second axis needs a
radial layer whose centre and falloff are not derivable from a 14px JPEG crop, and
inventing them is what the fidelity rules forbid.

### Three states are not in the document at all

Figure 13-3 gives fifteen states and **not one of them shows a glyph** — no ×, −, or
+. Nor does the HIG's prose describe a rollover, a pressed state, or the glyph
artwork; searching it for "rollover", "pointer is over" and "symbols appear" returns
nothing about title bar buttons. So:

- `rest` — **measured** (enabled artwork above)
- `disabled` — **measured** (the grey well above; the same artwork an inactive window
  uses)
- `hover`, `active`, `focus` — **unverified.** `CLAUDE.md` requires all five states on
  every interactive element, so all five ship, and the three with no source say so in
  their provenance notes rather than being presented as measurements.

This is the same shape as Luna's `disabled` caption buttons being `contested`: the
structure is what ships, and the note names what would resolve it — a 1:1 Tiger
screenshot with the pointer over the button group.

---

## 5. The menu bar

From Figure 12-12, a full-width crop from the top of the screen.

| Metric | Value | Level |
|---|---|---|
| Height | **22px**, including its 1px bottom rule | measured |
| Bottom rule | 1px `#BDBDBD` | measured |
| Shadow onto the desktop | 1px `#9E9E9E` below the rule | measured |
| Ink | `#000000` | measured |
| Highlighted title | the menu highlight blue, white text | measured — 12-11 |
| Translucency | **none** | measured |

Per-row median, rows 0–21:

```
#FFFFFF #FEFEFE #FBFBFB #F8F8F8 #F5F5F5 #F4F4F4 #F3F3F3 #F2F2F2
#F2F2F2 #F2F2F2 #F0F0F0 #E9E9E9 #EAEAEA #F0F1F1 #F3F3F4 #F4F5F5
#FBFBFB #F9F9F9 #FEFEFE #FFFFFF #FCFCFC #BDBDBD
```

Bright at the top, a trough at `#E9E9E9` around rows 11–12, bright again at rows
18–19, then the rule. Two highlights rather than a ramp — structurally the same
surprise Luna's caption gradient produced.

**§7's translucency correction is confirmed by measurement rather than by assertion.**
A translucent bar over a desktop shows the desktop's own variation through it. This bar
does not: two columns 420px apart, both clear of any menu title, give the same per-row
values to within one unit, and the desktop visible *below* the bar is a distinctly
different gradient (`#AAAAAA` → `#B9B9B9`). Menu bar translucency arrives with 10.5
Leopard.

---

## 6. Menus

From Figure 12-11, the richest menu specimen in the book: an enabled item, a dimmed
item, a highlighted item, two separators, an accelerator column, a submenu and a
highlighted menu bar title, all in one bitmap.

| Metric | Value | Level |
|---|---|---|
| Border | 1px `#949494` | measured |
| Background | a **4px-period horizontal pinstripe**: 2px `#F3F3F3`, 2px `#EFEFEF` | measured |
| Item height | **19px** | measured — see below |
| Separator rule | 1px `#CDCDCD` | measured |
| Separator slot | **12px** | measured — see below |
| Highlight | `#3262B4`, full interior width, white text | measured |
| Enabled ink | `#000000` | measured |
| Dimmed ink | **`#808080`** | measured |
| Icon size | 16px | measured |

**The background is not a flat fill.** Sampled down a column clear of every label,
icon and accelerator, it alternates two greys on a two-row period for the menu's whole
height, and there are **exactly two distinct values**. JPEG noise cannot produce that:
JPEG works in 8×8 blocks and would give an 8px period and more than two values. It is
independently proven in Figure 7-1, which is a **lossless PNG** and whose window body
alternates `#E1E3E7` / `#E4E6EA` on the same two-row period. Aqua's pinstripe is real,
it is 4px, and nearly every recreation ships a flat fill instead.

**Item height: 19px, and the spread is stated.** Item tops in the label column are 29,
48, 67, 100, 119, 139, 158, 183, 204, 236, 267, 287, giving pitches of 19, 19, 19, 20,
19, 20, 19 where no separator intervenes. The highlight band measures 21 rows with two
JPEG-blended edge rows, so 19 core. 19 is the modal value and the samples run 19–20.

**Separator slot: 12px.** Where a separator intervenes the pitch is 31, 32 or 33
against a 19–20px item, so the separator adds 11–14px. 12 is the middle of that range
and the spread is JPEG plus the ±1 of locating an ink top.

Apple's prose, documented: *"When a menu item is unavailable … the item should appear
dimmed (gray) in the menu and is not highlighted when the user moves the pointer over
it."* (p146). That is a behavioural requirement, and the skin implements the
not-highlighted half as well as the grey.

---

## 7. Scroll bars

From Figure 13-22.

| Metric | Value | Level |
|---|---|---|
| Width | **15px** | measured |
| Track, empty, left to right | `#C3CCD5` `#C3D2DA` `#C7D8E0` `#D1E0E7` `#DBE8EE` `#E3EDEF` `#EDF2F5` `#F4F7F8` `#F6F8FD` `#F8F9FC` `#FBFCFE` `#FDFDFE` `#FCFCFE` `#F8F8FD` `#EAF3F5` | measured |
| Scroller | 13px wide inside the 15px track, 1px of track visible either side | measured |
| Scroller, across | `#215EB8` outline, body `#83C8FF` → `#50C6F1` → `#ADF2F3` | measured |
| Scroller length | **proportional** — 110px of a 270px track | measured |
| Arrows | **both together at one end**, not split top and bottom | measured |

The empty track is not a flat fill either: it is darkest at its left edge and
brightens rightward, which is an inner shadow cast by the window's content edge.

**The proportional scroller is a cross-era contrast worth recording.** §7 already
notes that classic Mac scroll thumbs are a fixed 16×16 square and that most
recreations get it wrong. Tiger is the opposite case: its scroller is genuinely
proportional, and the same codebase has to do both. The System 1 skin's fixed square
and this proportional lozenge are the same widget contract with different metrics.

---

## 8. The Dock

Figure 10-1 is the Dock, and it confirms §7's correction: **a flat 2D shelf**, not the
3D glass shelf, which arrives with 10.5 Leopard.

| Metric | Value | Level |
|---|---|---|
| Icon size | 47px measured against Apple's documented 48px | measured — this is also what calibrates the figure |
| Divider between applications and Trash | 1px `#DFDFDF`, vertical | measured |
| Shelf edging | 1px `#DEDEDE` | measured |
| Shelf fill | **unverified** | — |
| Shelf height | **unverified** | — |
| Magnified icon | 128px | documented — §7 |

**Why the fill is unverified, rather than guessed.** The figure crops the Dock onto the
document's white page, and Tiger's shelf is translucent, so it composited against the
page: the median above and below the icons is `#FEFEFE`, which is the paper. All that
survives is the 1px edging and the divider. A 1:1 screenshot of a Tiger desktop
resolves it in one shot. The skin ships the shelf with its fill tagged `unverified`
and a note saying exactly this.

---

## 9. Type — and a point really is a pixel here

Documented in prose (p119–120, p200), so `documented` rather than `measured`:

| Role | Face | Where used |
|---|---|---|
| System font | Lucida Grande Regular **13pt** | "text in menus, dialogs, and full-size controls" |
| Emphasized system | Lucida Grande Bold 13pt | alert message text; "use sparingly" |
| Small system | Lucida Grande Regular 11pt | help tags, column headings, small controls |
| Mini system | Lucida Grande Regular 9pt | mini controls, utility window labels |
| View font | Lucida Grande Regular 12pt | lists and tables |
| Label font | Lucida Grande Regular 10pt | toolbar button labels, slider ticks |
| Application title | Lucida Grande Bold 14pt | About windows only |

**Mac OS X drew at a nominal 72 DPI, so 1pt = 1px** — the exact opposite of the trap
`CLAUDE.md` records for Windows, where 8pt at 96dpi is 10.667px and the era rasterised
it at 11. The rule that produced those XP values ("never write `pt` in a stylesheet —
resolve to the integer pixel the era actually rendered") is unchanged; on this platform
the resolution is the identity.

That is checked rather than assumed. Lucida Grande's ascender band is about 0.76em, so
a 13pt system font should ink caps-and-ascenders at ~10px. Measured: the menu bar title
inks 10px and a menu item label 11px (one row of JPEG blur). A 96 DPI reading would put
13pt at 17.3px and the band at ~13px, which is ruled out.

Apple also documents, and it matters for a project that renders five other eras with
hard pixels: *"All user-visible text in your application should be anti-aliased."*
(p120). Tiger is the first Chronos era where antialiased type is correct rather than a
defect, and the only one so far that does not need the integer-scaled viewport.

### The substitution

`ARCHITECTURE.md` §7 records the decision and it is not reopened here: **DejaVu Sans
for Lucida Grande.** Luxi Sans is the obvious relative — same designers as Lucida —
and its licence **prohibits modification**, which blocks subsetting, so it cannot
ship. The visual loss is real and stated. See `docs/fonts/tiger-README.md` for the
rendered specimen at every size Tiger uses and the measured divergences.

---

## 10. Utility windows and modal dialogs

Figure 13-19's third window is a utility window (the Fonts panel), and Figure 13-3's
third specimen is captioned "Alerts and modal dialogs only".

| | standard | utility / panel | alert / modal |
|---|---|---|---|
| Title bar | 22px | **16px** | 22px |
| Traffic lights | 14px, 21px centres | **11px, 18px centres** | **none at all** |
| Light inset from the frame | 9px | 7px | — |

Apple's prose, documented: *"Alerts and modal dialogs do not include any of these
buttons"* (p174) and *"Utility windows always display an active close button but never
an active minimize button"* (p174).

Chronos's modal frames therefore emit a title bar with **no** `data-action` elements at
all, which is a structurally different frame from the standard one and needed no change
to the window manager contract — the same way Windows 3.1 emits no close button.

One thing this figure does *not* settle: the utility window's lights read grey
(saturation ≈ 25) even though it is the key window, which contradicts the prose that
active windows' controls have colour. Either the screenshot was taken while the panel
was not key, or utility windows differ. Not resolved, and not needed — Chronos has no
utility window class.

---

## 11. What is still unverified

Carried here so the gaps stay visible rather than dissolving into the implementation:

| Unknown | Why | What would resolve it |
|---|---|---|
| Traffic light `hover`, `active`, `focus` | not in any of the fifteen specimens, nor in the prose | a 1:1 Tiger screenshot with the pointer over the buttons |
| The lights' glyphs (×, −, +) | never drawn in this document | the same |
| Dock shelf fill and height | the figure composited it against the white page | a 1:1 Tiger desktop screenshot |
| Window shadow parameters | the crop ends while the shadow is still ramping | a screenshot with clear space below a window |
| The lights' horizontal shading | measurable in magnitude, not in centre or falloff, from a 14px crop | a larger 1:1 capture |
| Whether individual figures are Tiger-era | the edition's copyright spans 1992–2005 | per-figure provenance Apple never published |
