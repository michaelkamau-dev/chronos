# Mac OS X Tiger substitute face

Tiger uses **one** face for the entire interface: Lucida Grande, at seven documented
sizes. That is the opposite of Windows XP, which needs four different families, and it
makes this the simplest substitution row in the project — and the one with the largest
unavoidable loss.

| Role | Apple specifies | Ships as | Status |
|---|---|---|---|
| System font — menus, dialogs, full-size controls, **window titles** | Lucida Grande Regular 13pt | **DejaVu Sans 13px** | agreed |
| Emphasized system — alert message text | Lucida Grande Bold 13pt | DejaVu Sans Bold 13px | **deferred**, see below |
| View font — lists and tables | Lucida Grande Regular 12pt | DejaVu Sans 12px | agreed |
| Small system — help tags, column headings | Lucida Grande Regular 11pt | DejaVu Sans 11px | agreed |
| Mini system — mini controls | Lucida Grande Regular 9pt | DejaVu Sans 9px | agreed |
| Label font — toolbar labels, slider ticks | Lucida Grande Regular 10pt | DejaVu Sans 10px | agreed |
| Application title — About windows only | Lucida Grande Bold 14pt | DejaVu Sans Bold 14px | **deferred** |

Sheet: [`tiger-font-lucida.png`](tiger-font-lucida.png). Regenerate with
`npm run fonts:tiger`.

---

## A point is a pixel here, and that is the era's fact rather than a shortcut

`CLAUDE.md` records, from Windows XP: *"Point sizes are not pixel sizes. 8pt at 96dpi
is 10.667px; Windows rasterised it at 11px. Never write `pt` in a stylesheet — resolve
to the integer pixel the era actually rendered."*

That rule is unchanged and it still applies. What changes is the arithmetic: **Mac OS
X drew at a nominal 72 DPI**, so 13pt is 13px exactly, 11pt is 11px, and every size in
the table above lands on a whole pixel with nothing to round. The stylesheet still
writes `px` and never `pt` — because `font-size: 13pt` in CSS means 17.33px, which is
the 96 DPI conversion and would be wrong by a third.

This is checked rather than assumed. Lucida Grande's caps-and-ascenders band is about
0.76em, so 13px should ink about 10px tall. Measured off Apple's own 1:1 figures: the
menu bar title inks **10px** and a menu item label **11px** (one row of JPEG blur). A
96 DPI reading would put 13pt at 17.3px and the band near 13px, which the measurement
rules out.

## The target is Apple's own rasterisation

Windows XP's Tahoma row was ranked against advance widths parsed from Wine's
purpose-built metric substitute — the closest thing to an authoritative Tahoma metric
table that is freely available. Tiger gets a strictly better target, because the HIG's
figures are 1:1 and therefore contain **Mac OS X's actual rendering** of known strings
in the system font at 13px.

`tools/pdf-extract/measure-tiger-chrome.py` measures their ink widths — first inked
column to last — and writes the crops to `tiger-apple-type/`.
`tools/font-compare/tiger-lucida.mjs` measures DejaVu Sans the same way and puts the
two renderings side by side at 4×, so the divergence is visible rather than only
tabulated.

| String | Apple, Lucida Grande 13px | DejaVu Sans 13px | Deviation |
|---|---|---|---|
| `Back` (menu item) | 29px | 30px | **+3.4%** |
| `Enclosing Folder` (menu item) | 110px | 106px | **−3.6%** |
| `Recent Folders` (menu item) | 97px | 95px | **−2.1%** |
| `Main but not Key` (window title) | 105px | 108px | **−2.9%** |
| `Scroll Bars` (window title) | 63px | 67px | **+6.3%** |

**Within ±6.3% across five strings, and inside ±4% on four of them.** For comparison,
Windows 3.1's Pixel Operator lands within ±16% and the sign depends on the string, and
DejaVu was rejected outright for Tahoma at +16.8%.

That last figure is worth stating plainly, because it inverts an earlier decision
rather than contradicting it: **DejaVu Sans is a bad Tahoma substitute and a good
Lucida Grande substitute.** DECISIONS 3.3 rejected it for XP's system font at +16.8%
on the grounds that it is a *Verdana* substitute and Verdana is the wider face. Lucida
Grande is itself a wide humanist face, so the same excess width that disqualified
DejaVu there is what fits here. §7's choice is now backed by a number instead of an
assertion.

## The window title is regular weight, and that was measured, not assumed

Apple documents no window-title font anywhere in the HIG. Both title strings above are
compared against DejaVu at both weights:

| | Apple | DejaVu Regular | DejaVu Bold |
|---|---|---|---|
| `Scroll Bars` | 63px | 67px (+6.3%) | 77px (+22%) |
| `Main but not Key` | 105px | 108px (−2.9%) | 124px (+18%) |

Regular lands inside the ±6% band the five-string comparison establishes; bold is 18–22%
out, far outside it. Rendering the two titles at 4× confirms it by eye — the strokes
are thin. **The window title is the system font at 13px, regular.**

One measurement trap on the way to that, recorded because it nearly produced the wrong
answer: the first pass measured "Scroll Bars" at 78px and concluded *bold*, because the
ink span it found started at the **proxy icon** sitting to the left of the title rather
than at the first letter. Splitting the span into runs separated by more than two blank
columns puts the icon in its own run and gives the text 63px. A title bar string is not
alone in its band.

## What is actually lost

Not a compromise with a better candidate waiting — there is no better candidate.

- **Luxi Sans is the obvious relative and cannot ship.** Same designers as Lucida
  Grande, and its licence **prohibits modification**, which blocks subsetting. Not a
  question of effort; the licence forecloses it.
- **Lucida Grande is narrower and rounder**, with a larger x-height relative to its cap
  height. At 13px DejaVu's ratio is 0.778; the sheet's side-by-side crops show Apple's
  letterforms sitting tighter with more open counters.
- **Antialiasing is correct here**, which is new for this project. Apple documents
  *"All user-visible text in your application should be anti-aliased"* (HIG p120).
  Tiger is the first Chronos era where soft type is the era's own behaviour rather than
  a defect, and the only one so far that does not need the integer-scaled viewport for
  type. The pixel-crisp rules in ARCHITECTURE.md §7 do not apply to this skin.

Same category as Trebuchet's missing double-storey `g` and Pixel Operator's 2px
descender: a real, permanent, stated loss with a named cause, not a silent compromise.

## Bold is deferred, deliberately

Only the regular weight ships. Two of the seven roles are bold — alert message text and
the About window title — and neither exists in phase 4, which builds chrome. Shipping an
unused 10KB face against a 30KB per-era font budget would be waste, and the precedent is
DECISIONS 3.19: Source Sans 3 ships at wght 400 only, and the skin may not ask for bold
until a surface needs it.

**Consequence, stated so it cannot be tripped over:** nothing in `skin.css` may specify
`font-weight: bold` until `lucida-bold-sub.woff2` is added, because the browser would
synthesise a fake bold by smearing the regular outlines, and that is visibly wrong. A
fidelity test asserts the chrome asks for weight 400 only.

## Subsetting

```
pyftsubset /usr/share/fonts/truetype/dejavu/DejaVuSans.ttf \
  --output-file=src/skins/tiger/fonts/lucida-sub.woff2 --flavor=woff2 \
  --unicodes="U+0020-007E,U+00A0-00FF,U+2018-201D,U+2022,U+2026,U+2013,U+2014,\
U+00D7,U+2212,U+002B,U+25B6,U+25C0,U+25B2,U+25BC,U+2713,U+2325,U+2318,U+21E7,U+2303" \
  --layout-features='' --no-hinting --desubroutinize \
  --name-IDs='0,1,2,3,4,5,6,7,13,14' --notdef-outline
```

**10.3KB**, 242 glyphs, against a 30KB per-era font budget.

The Unicode ranges beyond Latin-1 are the ones this era's chrome actually draws:
`U+2318 ⌘`, `U+2325 ⌥`, `U+21E7 ⇧` and `U+2303 ⌃` for menu accelerators — Mac menus
show modifier glyphs where Windows spells out `Ctrl+`; `U+00D7`, `U+2212` and `U+002B`
for the traffic-light glyphs; `U+25B6 U+25C0 U+25B2 U+25BC` for submenu and scroll
arrows; `U+2713 ✓` for a checked menu item.

`--name-IDs` keeps nameID 0 (copyright), 13 (licence description) and 14 (licence URL).
pyftsubset drops name records by default, and the Bitstream Vera licence requires the
notice to travel with the font — the default would ship a licence violation. Verified
present in the output:

```
nameID 0  Copyright (c) 2003 by Bitstream, Inc. All Rights Reserved. …
nameID 13 Fonts are (c) Bitstream (see below). DejaVu changes are in public domain. …
nameID 14 http://dejavu.sourceforge.net/wiki/index.php/License
```

`--no-hinting` matters less here than in the bitmap eras — Tiger's type is antialiased
by design, so there is no pixel grid for leftover hints to fight — but it is kept for
consistency and it saves bytes.
