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
