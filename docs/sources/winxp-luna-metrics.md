# Windows XP Luna — documented metrics

**Source:** *Windows XP Visual Guidelines*, Microsoft Corporation, site last
updated August 1, 2001. Retrieved from
`interface.free.fr/Archives/GUI_Xp.pdf`.

Everything below is `level: 'documented'` — stated in Microsoft's own prose with
explicit RGB values or pixel counts. This is a stronger provenance than measuring
XP.css or a screenshot.

**Reachable mirror for Claude Code:** the Controls chapter is mirrored as HTML at
`windowsdevops.github.io/docs/controls.htm`. `github.io` is reachable from the
build sandbox, so this chapter can be re-fetched directly during phase 3 rather
than relying on this extraction. A second mirror is at
`retrospace.net/download/WebApplications/WindowsXPDesignGuidelines/`.

---

## Fonts — XP uses FOUR faces, not two

This is the headline finding and it expands the open font question rather than
closing it. Microsoft's Fonts chapter is explicit:

| Face | Size | Used for | Constraint |
|---|---|---|---|
| **Tahoma** | 8, 9, or 11 point | System default — body text, menus, dialogs, labels | Only these three sizes |
| **Trebuchet MS Bold** | 10 point | **Window title bars, and only window title bars** | — |
| **Verdana Bold** | 8 point | Title bars of tear-off / floating palettes only | — |
| **Franklin Gothic Medium** | 14 point and above (21pt in Control Panel titles, soft-barrier headings) | Headers only | **Never for body text**, never under 14pt |

This confirms §7's correction #1 from Microsoft's own document: the Luna caption
font is Trebuchet MS Bold 10pt, not Tahoma. Building captions in Tahoma would be
wrong on every window in the era.

It also adds a fourth face nobody accounted for. **Franklin Gothic Medium at
21pt appears in Control Panel titles and soft-barrier pages** — visible surfaces,
not edge cases. The substitution table in §7 has one open row for XP; it actually
needs four:

- **Tahoma** — metric-compatible OFL sans at 8/9/11pt. The hard one; Tahoma's
  hinting does the work at 8pt and clones lose it.
- **Trebuchet MS Bold** — humanist sans with distinctive lowercase `g`. Not
  redistributable even from Core Fonts for the Web, per §7.
- **Verdana Bold** — same family designer as Tahoma (Carter); DejaVu Sans Bold
  is the usual stand-in and is a closer match here than for Tahoma.
- **Franklin Gothic Medium** — **Libre Franklin (OFL)** is a direct revival of
  Franklin Gothic and is the cleanest answer in the whole XP row. Take it.

Recommend the rendered comparison cover all four, not just Tahoma. Franklin
Gothic is essentially solved; Verdana is close; Trebuchet and Tahoma are the two
that need eyes on them.

## Command buttons — documented, and it settles a §7 question

| Metric | Value |
|---|---|
| **Standard size** | **75px × 23px** (50 × 14 dialog units) |
| Corner treatment | **1 pixel indent** — not a radius |
| Disabled text | `#A1A192` (161, 161, 146) |

"The curve of a command button is a 1 pixel indent" is worth reading literally.
Microsoft describes a single-pixel corner cut, not a 3px border-radius. §7 lists
`radius 3px` as measured from XP.css — that is XP.css's interpretation, and it
conflicts with the primary source. **Flag as a conflict and build to the 1px
indent.**

Note also that 75×23 is the *standard* size — §7's caption-button and border
numbers still need the `[SysMetrics]` dump or the 1:1 figure.

## Radio buttons and check boxes

| Metric | Value |
|---|---|
| Available sizes | 13×13, 16×16, 25×25 |
| **Actually used in XP** | **16×16 only** — chosen automatically from video card DPI |
| Disabled text, all states (checked / unchecked / mixed) | `#A1A192` |

## Text boxes

| Metric | Value |
|---|---|
| Normal border | `#7F9DB9` (127, 157, 185) |
| Disabled fill | `#EBEBE4` (235, 235, 228) |
| Read-only fill | `#EBEBE4` |
| Disabled text | `#A1A192` |
| Read-only text | `#000000` |

## Dropdown combo boxes

| Metric | Value |
|---|---|
| Text field fill, normal | `#FFFFFF` |
| Text field fill, disabled | `#C9C7BA` (201, 199, 186) |
| Border, normal | `#7F9DB9` |
| Border, disabled | `#F5F4EA` (245, 244, 234) |

Note the disabled *fill* differs between text boxes (`#EBEBE4`) and combo boxes
(`#C9C7BA`). Not a typo in the source — they are separately specified.

## Group boxes

| Metric | Value |
|---|---|
| Size | Any — no fixed dimension |
| Title, normal | `#0046D5` (0, 70, 213) |
| Title, disabled | `#A1A192` |

## Menus — fully documented

| Metric | Value |
|---|---|
| Highlight background | `#316AC5` (49, 106, 197) |
| Highlight text | `#FFFFFF` |
| Border and separator | `#808080` (128, 128, 128) |
| Disabled text | `#808080` |
| Background | `#FFFFFF` |
| Enabled text | `#000000` |

Note the menu disabled text is `#808080`, **not** the `#A1A192` used for every
control's disabled text. Two different disabled grays in the same OS, by design.

## Spin buttons

| Metric | Value |
|---|---|
| Text field outline, normal | `#828282` (130, 130, 130) |
| Text field fill, normal | `#FFFFFF` |
| Text field outline, disabled | `#A1A192` |
| Text field fill, disabled | `#EBEBE4` |

## Status bar

| Metric | Value |
|---|---|
| Separator, left line | `#C7C5B2` (199, 197, 178) |
| Separator, right line | `#FFFFFF` |
| Gripper squares | `#B8B4A3` (184, 180, 163) and `#FFFFFF` |

Composed of three pieces: background, separators, resize gripper.

## Scroll bars

Three pieces, named: **scroll arrow buttons, scroll box, and scrollbar shaft**
(the shaft is the trough). States documented for box, buttons, and shaft
separately — but only as figures. **No pixel dimensions in prose.**

## Navigation buttons

Distinct from command buttons and semantically colored:

| Sizes | 32×32, 24×24, 21×21, 16×16, 13×13 |
|---|---|
| Blue | Neutral action — e.g. minimize |
| Green | Start of an action, simple navigation — e.g. Go in the Address bar |
| Red | High-impact — e.g. Close, Shut Down |
| Yellow | Less severe than red, still high impact — e.g. Log Off |

Construction: colored background plus a white sign glyph. **This is the actual
design rationale for the red close button**, and it means the three caption
buttons are not a uniform set — close is red by category, minimize and maximize
are blue.

## Icons

| Context | Sizes |
|---|---|
| Standard | 48×48, 32×32, 24×24, 16×16 |
| Recommended to ship | 48, 32, 16 |
| Right side of Start menu | 24×24 |
| Toolbar | 24×24 and 16×16 |
| Toolbar states | default and hot — hot increases saturation (Photoshop Levels midpoint 0.75) |
| Drop shadow | angle 135°, distance 2, size 2, black at 75% opacity |
| Toolbar icons | **no drop shadow** |

Icons are drawn on a perspective grid at an angle, light source upper-left.
Exceptions rendered straight-on: documents, symbol icons (warning/info), and
anything unrecognizable at an angle (magnifying glass).

## Folder chrome typography

| Surface | Font | Color |
|---|---|---|
| Special folder task box header | Tahoma Bold 8pt | `#FFFFFF` |
| Special folder task box body | Tahoma 8pt | `#215DC6` (33, 93, 198) |
| Generic webview task box header | Tahoma Bold 8pt | `#215DC6` |
| Soft barrier title | Franklin Gothic Medium 21pt | `#D6DFF5` (214, 223, 245) |
| Soft barrier body | Franklin Gothic Medium 14pt | `#FFFFFF` |

| Watermark | Size | Treatment |
|---|---|---|
| Special folder | 150×150, anchored bottom-right | tint `#475E94` (71, 94, 148), ~12% opacity, alpha channel |
| Soft barrier | 300×300, anchored bottom-right | 15% opacity, hue 222 / sat 0 / light 0, input levels 40/100/255 |

## Full palette, as published

**Base:** `#FFCC00` `#FF9933` `#DE5C2F` `#E6EAD8` `#8CAAE6` `#6487DC` `#003399` `#13920D`

**Controls:** `#F2C977` `#E68B2C` `#808080` `#A1A192` `#B8B4A3` `#7F9DB9` `#2178E0`
`#128BE7` `#4D9FE1` `#83A6F4` `#C7C5B2` `#C9C7BA` `#EBEBEE` `#003CA5` `#082EA2`
`#0046D5` `#316AC5` `#B7D3FC` `#D2ECFF` `#267C08` `#828282` `#22C020` `#9BEA9C`

**Window frame and taskbar:** `#081BCB` `#4977B4` `#0062EA` `#14A5F4` `#8EB6D9`
`#5DB3FF` `#008D00` `#31A431` `#5EDB5E`

**Folders:** `#0148B2` `#285BC5` `#5582D2` `#6487DC` `#8CAAE6` `#D6DFF5`

Microsoft's own caveat: because Luna uses many gradients, these are sample
values and the running UI carries the full range. Treat the palette as
authoritative for flat fills and as anchor points for gradients.

Cross-check against §7: the existing table lists the active caption gradient as
8 stops from `#0997ff` to `#003dd7`, measured from XP.css. Neither endpoint
appears in the published Window-frame set above (`#0062EA`, `#14A5F4`, `#081BCB`,
`#4977B4`). **Flag as a conflict.** The `[SysMetrics]` / `.msstyles` dump would
resolve it; the published set is closer to primary but is explicitly described
as a sample.

## Color schemes

Three shipped: **Blue (default), Olive Green, Silver.** Every control image in
the guidelines is the Blue scheme; controls recolor under the other two. Chronos
only needs Blue, but the skin should not hard-code Luna blue in a way that
forecloses the other two later.

Documented character, useful for the 2035-era contrast argument: Blue is
"fresh, vivid, engaging" and the product signature. Silver is "metallic,
precision sculpted." Olive Green is "comforting, natural."

## What this document does NOT give

Everything geometric about the window frame. Microsoft states it only as a
figure — **"Standard window components in actual size"** — with no numbers in
prose. Still unverified:

- Caption height
- Sizing border width
- Caption button dimensions and spacing
- Top corner radius
- Active caption gradient stop positions
- Scroll bar width, arrow button size, scroll box minimum
- Tab control dimensions
- Progress bar dimensions

**But that figure is explicitly labeled "in actual size," which means 1:1.**
Extracting it from the PDF gives Microsoft's own pixels — the same technique §7
proposes for the Tiger HIG figures, on a source that states its own scale. Same
for the "Example of the states for Title Bar buttons" figure, which carries all
five states for all three caption buttons.

The remaining one-shot unblock is still `luna.msstyles`. Its `[SysMetrics]`
section is the authoritative source for caption height, sizing border, and
caption button sizing, and it would resolve the two conflicts flagged above.
Path on any XP install: `\Windows\Resources\Themes\Luna\Luna.msstyles`.
