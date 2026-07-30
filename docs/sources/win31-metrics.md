# Windows 3.1 VGA — measured metrics

**Source:** `win31-1280x960.png` in this directory. PCjs Windows 3.10, VGA
640×480, canvas buffer extracted via `canvas.toDataURL()` at exactly 2× scale.
**All measurements below are already divided by 2 and stated in logical VGA
pixels.**

Capture integrity: 14 unique colors, zero blend values, no color profile. Every
edge transition is a single hard pixel run. This is a lossless 2× nearest
integer capture, not a resample.

---

## Palette — 6-bit VGA DAC values, not 8-bit hex

This is the finding most recreations miss. VGA DACs are 6 bits per channel, so
the shipped values are not the `#C0C0C0` / `#000080` / `#FFFFFF` constants that
appear in every CSS clone.

| Role | Measured | 6-bit DAC | Common (wrong) assumption |
|---|---|---|---|
| Window / client background | `#FCFCFC` | 63,63,63 | `#FFFFFF` |
| Button face, frame, scrollbar | `#C0C4C8` | 48,49,50 | `#C0C0C0` |
| Active caption | `#0000A8` | 0,0,42 | `#000080` |
| Frame lines, text | `#000000` | 0,0,0 | — |
| Shadow / disabled text | `#84888C` | 33,34,35 | `#808080` |
| Bright blue (icon art) | `#0000FC` | 0,0,63 | `#0000FF` |
| Yellow (icon art) | `#FCFC00` | 63,63,0 | `#FFFF00` |
| Dithered yellow | `#A8A854` | 42,42,21 | — |
| Cyan / dithered cyan | `#00FCFC` / `#54A8A8` | — | — |
| Red | `#FC0000` | 63,0,0 | `#FF0000` |
| Magenta / dithered | `#FC00FC` / `#A854A8` | — | — |
| Dark magenta | `#A80054` | 42,0,21 | — |

**The button face is not a neutral gray.** `#C0C4C8` carries a measurable blue
tint — the three channels are 48/49/50, not 48/48/48. Same for the shadow at
33/34/35. Encode these as literals; do not "correct" them to gray.

The `#A8A854`, `#54A8A8`, `#A854A8` entries are the dithered halftones the VGA
driver uses for the 8 extra colors it can't display directly. Relevant to icon
rendering and to the disabled-text stipple.

## Chrome geometry

| Metric | Value | Confidence |
|---|---|---|
| **Caption height** | **18px** | Confirmed 3× — top-level active, MDI child active, and inactive |
| Caption bottom border | 1px `#000000` | confirmed |
| Active caption fill | `#0000A8`, flat — **no gradient** | confirmed |
| **Inactive caption fill** | **`#FCFCFC` white** — not gray | confirmed |
| **Sizing frame** | **4px total: 1px black / 2px `#C0C4C8` / 1px black** | confirmed on 3 windows |
| **Menu bar background** | **`#FCFCFC` white** — not `#C0C0C0` | confirmed |
| Scrollbar width | 16px (15px face + 1px black border) | confirmed |

Three of these contradict what a Win95-derived recreation would produce:

1. **The inactive caption is white, not gray.** Default 3.1 scheme sets
   `COLOR_INACTIVECAPTION` to white with black text. Windows 95 changed it.
2. **The menu bar is white, not gray.** Same story. Every 98.css-lineage
   recreation gets this wrong because it inherits the 95 palette.
3. **The active caption is flat.** Caption gradients arrived with Windows 95's
   `COLOR_GRADIENTACTIVECAPTION`. There is nothing to gradient here.

This is also the fourth correction to §7's existing note that
`COLOR_3DDKSHADOW` / `COLOR_3DLIGHT` don't exist in 3.1 — the palette itself is
narrower than the Win95 one in more ways than the bevel constants.

## Still to capture

The current PNG covers frames, captions, menu bar, scrollbars, and MDI
containment, plus a disabled menu item. Three screens remain, same 2× canvas
extraction method:

1. **System menu open** — click the box at a window's top-left. Yields menu
   popup frame, item height, item text inset, separator construction, and a
   disabled entry (Maximize is grayed when already maximized).
2. **A dialog** — File → Run. Yields dialog frame, push button rest geometry and
   bevel, edit field construction, OK/Cancel sizing and spacing.
3. **A push button in pressed state** — hold the mouse down on OK before
   capturing. This settles whether 3.1's label shifts 1px on depress, which §7
   asserts and which is the one claim in that section still unverified.

## Method, for reproducing

```js
const c = document.querySelector('canvas');
const a = document.createElement('a');
a.download = 'capture.png';
a.href = c.toDataURL('image/png');
a.click();
```

Reads the canvas backing buffer directly. Immune to browser zoom, window size,
device pixel ratio, and any screenshot extension in the chain. Verify before
trusting: a clean VGA capture has fewer than 20 unique colors. Anything in the
hundreds has been resampled and is worthless for measurement.

---

# Measured from all three captures

Added after the two remaining screens landed. Everything below is in logical VGA
pixels and reproducible with:

```
python3 tools/captures/measure-win31.py docs/sources
```

The script verifies capture integrity before measuring anything — fewer than 20
colours and every 2×2 block uniform — and refuses to proceed otherwise, so a
resampled capture cannot silently produce numbers.

## The finding that matters most: disabled text is a stipple

**Windows 3.1 draws disabled text as a 50% checkerboard knocked out of the black
glyph.** Not a grey fill, and not a grey fill with a white shadow — that is the
Windows 95 treatment, and it is what nearly every recreation uses.

This is proven rather than eyeballed. A stipple puts ink on only one `(x + y)`
parity; a solid glyph occupies both. Measured:

| Label | Ink pixels | Parity split | Verdict |
|---|---|---|---|
| Run dialog's OK (disabled) | 37 | 37 / 0 | 100% on one parity — **stipple** |
| Run dialog's Cancel (rest) | 140 | 71 / 69 | solid glyph |

The same mechanism applies to the disabled `Restore` item in the system menu, where
the surviving pixels are white against the navy highlight. It is the same idea as
System 1's `notPatBic`, which is a pleasing symmetry across the two 1984–1992 eras.

**The Run dialog's OK button is disabled, not pressed.** It looks unusual because
3.1 greys OK until the command line has content. So these captures do **not** settle
whether a 3.1 push button's label shifts 1px on depress — §7's one remaining
unverified claim for this era stays unverified. A capture with the mouse held down on
Cancel would close it.

## System menu popup

| Metric | Value |
|---|---|
| Frame | 1px `#000000`, all four sides |
| Drop shadow | 1px `#C0C4C8`, **right and bottom only**, offset 1px past the frame |
| Item height | **18px** — text-block pitch of exactly 18 across four adjacent items |
| Item text block | 12px (10px label + 1px gap + 1px mnemonic underline), so 3px above and below |
| Separator | **7px tall**, the 1px rule as its 4th row — 3px padding either side |
| Separator width | the popup's **full outer width**, replacing the frame pixel at each end |
| Label gutter | 16px from the interior's left edge to label ink |
| Accelerator gutter | 15px from the accelerator's right edge to the interior's right edge |
| Highlight | full interior width, `#0000A8` fill with `#FCFCFC` text |

The popup's shadow being grey rather than black is worth noting: it is a 1px
`#C0C4C8` offset, not a darkening, so over the white client area it reads as a thin
grey rule rather than as a shadow at all.

One measurement is ambiguous and stays flagged: the accelerator column. `Ctrl+F4` and
`Ctrl+F6` are the same width, so a right-aligned column and a fixed left column
produce identical pixels. Right-aligned with a 15px gutter is the standard 3.1
behaviour and is what ships, but two equal-width strings cannot distinguish them.

## Push buttons

**70×23px**, measured on both buttons in the Run dialog, stacked with a **4px** gap.

The bevel is three colours, which confirms §7's note that 3.1 has no four-colour 3D
bevel — `COLOR_3DDKSHADOW` and `COLOR_3DLIGHT` are Windows 95 additions. What the
capture **corrects** is the width:

| Layer | §7 said | Measured |
|---|---|---|
| Outline | 1px black | 1px `#000000`, corners notched |
| Highlight, top and left | 1px | **2px** `#FCFCFC` |
| Shadow, bottom and right | 1px | **2px** `#84888C` |
| Face | `#C0C0C0` | `#C0C4C8` |

The notched corners mean the black rectangle's top and bottom runs are each 1px short
of the side rails, so the outline is not a plain `border`.

## Edit field and check box

- **Edit field**: a plain 1px `#000000` rectangle with a `#FCFCFC` fill. **No bevel
  at all** — the sunken two-tone edit field is a Windows 95 feature. 20px tall, 18px
  of interior.
- **Check box**: 13×13, 1px black frame, white fill.

## Modal dialog frame

Not the sizing frame a window gets — a dialog has its own:

| Side | Construction |
|---|---|
| Left and right | 1px `#000000` + 4px `#0000A8` + 1px `#FCFCFC` = 6px |
| Top | 1px `#000000` + 3px `#0000A8` + 1px `#FCFCFC` = 5px |
| Bottom | 4px `#0000A8` + 1px `#000000` = 5px, **no white line** |

Then an 18px `#0000A8` caption and a 1px black rule above the client area, so the
total top inset is 24px. Client area in this capture: 366×132.

The white line is a highlight, so having it on three sides and not the bottom is
internally consistent. But this is one capture and a 1px difference in a frame is
exactly what an underlying window can fake, so the 3px-versus-4px top asymmetry is
recorded as measured-but-flagged rather than smoothed to symmetric. A second dialog
capture settles it.

## The System font — one face, and it is not MS Sans Serif

**Windows 3.1 uses a single face for the entire era**: captions, the menu bar, menu
items, dialog labels and button labels are all the same bold proportional bitmap at
one size. That is `SYSTEM.FON`, the System font.

This corrects the substitution table in §7, which lists "Win 3.1 System / MS Sans
Serif → W95FA" as one row. They are two different faces, 3.1 shipped both, and the
chrome uses System throughout. W95FA is a recreation of the **Windows 95** MS Sans
Serif bitmap, so it is the right licence and the wrong face — the same era-lineage
problem as inheriting 98.css's font, one step further back.

The metric target for a substitute, measured off two known strings:

| | Cap height | Ink height | Stem |
|---|---|---|---|
| System font, VGA | 9px | 13px (ascender to descender, from `Program`'s `g`) | **2px** |

| String | Per-glyph ink widths | Deltas between ink starts | Total ink |
|---|---|---|---|
| `Minimize` (menu item) | 10, 2, 6, 2, 10, 2, 6, 6 | 12, 4, 8, 4, 12, 4, 8 | 58px |
| `Cancel` (button label) | 7, 6, 6, 6, 6, 2 | 8, 7, 7, 7, 7 | 38px |

The 2px stem is the constraint that rules most candidates out: this is a bold face,
and a 1px-stem pixel font is the wrong weight no matter how well its widths match.

Deltas rather than advances because ink start is what a bitmap capture shows. A
substitute that matches both strings is matching the advances and the side bearings
together, which is a stronger test than either alone.
