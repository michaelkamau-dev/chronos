# Windows XP substitute faces

The *Windows XP Visual Guidelines* specify **four** faces, and none of the four is
redistributable. This is the rendered comparison agreed as a phase-3 precondition,
expanded from one face to four.

**Source of the requirement:** `docs/sources/winxp-luna-metrics.md`, independently
re-verified against the Controls chapter mirror (see "Verification" below).

| Role | Microsoft specifies | Sizes in px @96dpi | Substitute | Status |
|---|---|---|---|---|
| System default — body, menus, dialogs, labels | **Tahoma** 8 / 9 / 11pt | 11 / 12 / 15 | **Source Sans 3** (OFL) | **needs your call** |
| Window title bars, and nothing else | **Trebuchet MS Bold** 10pt | 13 | **Cabin** (OFL) | **needs your call** |
| Floating / tear-off palette captions only | **Verdana Bold** 8pt | 11 | **DejaVu Sans Bold** | agreed |
| Headers only, never body text | **Franklin Gothic Medium** 14pt+ (21pt in Control Panel titles) | 19 / 28 | **Libre Franklin** (OFL) | agreed |

Sheets: [`xp-font-tahoma.png`](xp-font-tahoma.png) ·
[`xp-font-trebuchet.png`](xp-font-trebuchet.png) ·
[`xp-font-verdana.png`](xp-font-verdana.png) ·
[`xp-font-franklin.png`](xp-font-franklin.png)

Regenerate with `npm run fonts:compare` (see "Reproducing" below).

---

## Read the point sizes as pixels, not points

This is the first finding and it changes how every XP surface gets written.

At 96 DPI, `8pt` is **10.667px**. CSS `font-size: 8pt` resolves to exactly that,
which puts every glyph edge on a half-pixel and softens the entire UI. Windows
rasterised Tahoma 8pt at **11px**. So the skin must specify integer pixels:

| Microsoft says | Raw px @96dpi | Ships as |
|---|---|---|
| Tahoma 8pt | 10.667 | **11px** |
| Tahoma 9pt | 12.0 | **12px** (exact) |
| Tahoma 11pt | 14.667 | **15px** |
| Trebuchet MS Bold 10pt | 13.333 | **13px** |
| Verdana Bold 8pt | 10.667 | **11px** |
| Franklin Gothic Medium 14pt | 18.667 | **19px** |
| Franklin Gothic Medium 21pt | 28.0 | **28px** (exact) |

Only 9pt and 21pt land on whole pixels. Every other size is a rounding decision,
and writing `pt` in the stylesheet would silently make a different one.

## How the sheets were made

Each line is drawn to a canvas **once at the real integer pixel size**, then that
bitmap is redrawn at 4x with `imageSmoothingEnabled = false`. What you are looking
at is the actual 1x rasterisation magnified — including its grayscale
antialiasing.

Using CSS `zoom` or `transform: scale()` would re-rasterise the glyphs at the
larger size and show you a rendering that never appears on screen. That is the
opposite of what needs judging at 11px.

## The Tahoma row has an objective target

Wine ships a font whose `FontName` is `WineTahoma` and whose `FullName` is
`Tahoma` — a Bitstream Vera Sans derivative by Larry Snyder, renamed under Vera's
licence, whose **advance widths were matched to the real Tahoma** so that Windows
applications lay out correctly under Wine.

Parsing `wine/fonts/tahoma.sfd` therefore yields a usable numeric target rather
than an aesthetic impression. Extraction is committed as
[`tahoma-metric-target.json`](tahoma-metric-target.json). At 2048 UPM, `Cancel`
at 11px measures **31.90px**.

| Candidate | `Cancel` @11px | vs target | Licence |
|---|---|---|---|
| **Source Sans 3** | 30.9px | **−3.2%** | OFL 1.1 |
| PT Sans | 31.1px | −2.6% | OFL 1.1 |
| Open Sans | 34.0px | +6.6% | OFL 1.1 |
| Liberation Sans | 34.2px | +7.3% | OFL 1.1 |
| Noto Sans | 34.2px | +7.3% | OFL 1.1 |
| DejaVu Sans | 37.3px | **+16.8%** | Vera derivative |

**DejaVu Sans is 17% too wide for Tahoma** — it is a *Verdana* substitute, and
Verdana is the wider face. Using it for the system default would push every dialog
label, menu string and button caption out of its documented box. That is worth
stating because DejaVu is the obvious reach for a permissive sans, and here it is
the wrong one. It remains correct for the Verdana Bold row.

### Why Source Sans 3 over PT Sans

PT Sans is 0.6 percentage points closer on width — effectively a tie. Two things
break it:

1. **One file covers both weights.** Microsoft uses **Tahoma Bold 8pt** for
   special-folder and webview task-box headers, so the Tahoma row needs regular
   *and* bold. Source Sans 3 is a variable font with a weight axis; PT Sans needs
   two static files. On a 250KB critical-path budget that is a real difference.
2. **Neutrality.** Tahoma's letterforms are plainly humanist without much
   personality. PT Sans carries more — a distinctive `a` and `ж`-influenced
   proportions — which at 11px reads as "not Tahoma" rather than as a near miss.

## The Trebuchet row has no target, and one honest compromise

Wine ships no Trebuchet substitute and no advance-width table for Trebuchet MS
was reachable from this sandbox, so this row is judged on letterform character and
plausible width. Trebuchet MS is a moderately narrow humanist sans.

| Candidate | `Add or Remove Programs` @13px bold | Licence |
|---|---|---|
| PT Sans | 139.6px | OFL 1.1 |
| **Cabin** | 142.7px | OFL 1.1 |
| Source Sans 3 | 144.3px | OFL 1.1 |
| Fira Sans | 148.8px | OFL 1.1 |
| Liberation Sans | 160.4px | OFL 1.1 |
| Open Sans | 164.1px | OFL 1.1 |

**Recommendation: Cabin.** Closest overall humanist character, a plausible caption
width, and a variable weight axis so one file serves the role.

**The compromise, stated plainly:** Trebuchet MS has a **double-storey `g`**.
Cabin's is single-storey. At 13px bold in a title bar that difference is two or
three pixels of bowl, but it is a real divergence on the single most
character-bearing glyph in the face.

If you weight that letterform above width and overall feel, **Source Sans 3** has
the correct double-storey `g` and sits 1.6px wider than Cabin. It would also mean
one font file serving both the Tahoma and Trebuchet rows — about 13KB saved.

I did not take that option, because Trebuchet-vs-Tahoma is a visible distinction
on *every window* in the era: caption text and body text are different faces, and
collapsing them to one would trade a per-glyph detail for a system-wide one. Say
the word and I will switch.

## Verdana Bold and Franklin Gothic Medium

Both as agreed, and both hold up in the sheets.

**DejaVu Sans Bold** for Verdana Bold: same Bitstream lineage, and the width that
made it wrong for Tahoma is what makes it right here. Verdana is the wide face.

**Libre Franklin** for Franklin Gothic Medium: a direct OFL revival, the cleanest
substitution in the whole XP row. It renders correctly at both 19px and 28px,
which is the range Microsoft restricts the face to — 14pt and above, never body
text.

## Verification

`docs/sources/winxp-luna-metrics.md` notes that `github.io` is reachable from the
build sandbox. It is not — `windowsdevops.github.io` is refused at the proxy with
a 403 on CONNECT, the same as every other non-allowlisted host.

`raw.githubusercontent.com` **is** allowlisted, and the mirror is served from a
repository, so the Controls chapter was fetched from
`raw.githubusercontent.com/windowsdevops/windowsdevops.github.io/master/docs/controls.htm`
instead. It confirms the extraction verbatim, including both flagged conflicts:

- *"A command button should typically be 75 pixels wide (50 dialog units) by 23
  pixels tall (14 dialog units)."*
- *"The curve of a command button is a 1 pixel indent."* — no radius, anywhere.
- Controls disabled text `R: 161 G: 161 B: 146` (`#A1A192`); menu disabled text
  `R: 128, G: 128, B: 128` (`#808080`). Two different grays, confirmed separately
  specified.
- Radio buttons and check boxes: `13x13, 16x16, 25x25`, with only 16×16 used.
- Navigation buttons: `32x32, 24x24, 21x21, 16x16, and 13x13`.

## Licences, and what gets committed

| Font | Licence | Redistributable | Modifiable (subsetting) |
|---|---|---|---|
| Source Sans 3 | SIL OFL 1.1 | yes | yes, with RFN rules |
| Cabin | SIL OFL 1.1 | yes | yes, with RFN rules |
| Libre Franklin | SIL OFL 1.1 | yes | yes, with RFN rules |
| DejaVu Sans Bold | Bitstream Vera derivative | yes | yes, requires renaming |

All four permit the subset-and-convert-to-WOFF2 step, which is what the pipeline in
`docs/ARCHITECTURE.md` §7 requires. None of the four is a conversion of a
proprietary original — the trap `98.css` fell into with its "Pixelated MS Sans
Serif".

**No font binaries are committed yet.** The candidates were fetched to a scratch
directory for this comparison; the three or four chosen faces get subset, converted
and committed when phase 3 builds the XP skin, with their licence files alongside.

## Two escalations available if you want exact Tahoma metrics

Neither is needed to proceed; both are recorded so the option is not lost.

1. **Compile Wine Tahoma itself.** It is the only purpose-built Tahoma metric
   substitute in existence and it is freely licensed. Converting `tahoma.sfd` needs
   FontForge: `sfdLib` gets partway and then fails on the file's TrueType hinting
   data (`ValueError: invalid literal for int()` on a UTF-7 block), and FontForge
   is not installed here. A build on a machine with FontForge would produce an
   exact-metric face.
2. **Metric-remap a candidate.** `fontTools` can rewrite Source Sans 3's advance
   widths to Tahoma's, which is exactly how Liberation Sans is metric-compatible
   with Arial. It fixes layout precisely but leaves sidebearings visibly off, so it
   trades appearance for fit.

## Reproducing

```
npm run fonts:compare -- <fontDir> docs/fonts
```

`tools/font-compare/build.mjs` takes a directory of candidate font files and
renders the sheets. It fails loudly if every candidate in a role measures
identically, which is the signature of the fonts not having loaded — canvas
`measureText` does not trigger a CSS `@font-face` fetch, so an earlier version of
this comparison silently rendered six copies of the same fallback.
