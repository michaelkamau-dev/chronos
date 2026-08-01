# Files — phase 5

Branch `app/files`. Base `fb6e189`.

**Verified:** `npm test` — 12 invariant, 7 budget, 295 browser. The browser suite was
269 at base, so this adds 26 and changes none. The perf gate is unmoved:
`scriptPerFrame` 0.503ms against a 3ms bound, `longTasks=0`, inside the 0.27–0.94ms
band every previous run reported. Rendered and looked at in all six eras.

---

## 1. The dialog question, answered before anything was built

**Open and Save are a core service on `WindowHandle`. Files does not export them.**

`host.win.openFile(…)`, `host.win.saveFile(…)`, `host.win.chooseFolder(…)`,
`host.win.message(…)`, `host.win.openDialog(…)` — implemented in
`src/core/ui/dialogs.ts`, rendered from the active skin's tier-1 widgets, opened as a
modal owned by the *calling* window.

Five reasons, in order of what they cost to get wrong:

1. **§5's contract line already said so** — `win: WindowHandle // setTitle, setDirty,
   requestClose, openDialog`. Nothing anywhere described it as a Files export.
2. **"An app knows core and nothing else."** Editor calling Files for Save As breaks
   the top invariant in `CLAUDE.md` and makes five branches depend on a sixth's build
   order.
3. **Files may be closed.** The alternative is an always-mounted Files singleton
   holding an `fs.watch` after the user quit it.
4. **The modal's owner is the caller's window** (`wm.open({ modalOwner })`, as
   Ledger's Steward proved). Routing through Files would put it under the wrong owner
   and break the shell's existing blocked-click feedback.
5. **The eras agree.** `comdlg32`'s `GetOpenFileName`, the Standard File Package,
   `NSOpenPanel` — OS services, which is why every app's Open box looked identical and
   none looked like the file manager's own window.

Files owns the *conventions* the dialog reuses — sort order, `wellKnown` naming,
acceptance rules — inside the shared list widget, not in an app-to-app call.

**For the other five sessions:** call `host.win.openFile({ accept: ['image/'] })` and
`host.win.saveFile({ suggestedName: 'Untitled.txt' })`. Both resolve to `null` on
cancel. `saveFile` returns `{ parent, name }` — a location and a *canonical stored
name*, not a decorated one; the era's spelling is the codec's business. Three browser
tests exercise them through a real `WindowHandle`, not through Files.

---

## 2. What was built, and why core grew

§5's app layer was specified and absent. `AppInstance` and `Shell.registerApp` existed;
`AppModule`, `AppHost`, `WindowHandle`, `UiKit` and `src/apps/` did not. Building Files
meant building the layer under it. **This is shared code that five other sessions need
and cannot see until it merges** — it is listed here in full so the merge is reviewable.

| Added | Where |
|---|---|
| `UiKit` — tier-1 widgets, `data-ui` + `data-state` vocabulary | `src/core/ui/kit.ts` |
| `DialogService` — modal, message, open, save, choose-folder | `src/core/ui/dialogs.ts` |
| `AppModule`, `AppHost`, `WindowHandle`, `LaunchOptions` | `src/core/app/types.ts` |
| `Shell.launchApp`, `appFor`, `handleFor`, `appMenuFor`, `AppServices` | `src/shell/shell.ts` |
| Tier-1 widget *structure* | `src/shell/base.css` |
| Tier-1 widget *appearance*, six skins | `src/skins/*/skin.css` |
| The Files app | `src/apps/files/` |

Three departures from §5 as written, each with a reason:

1. **`AppHost` carries `codec` and `decorate`.** §5 omitted both. An app cannot render
   one filename without `codec.displayName`, cannot draw a location bar without
   `codec.format`, and cannot create "New Folder" without the era's collision suffix —
   and it may not import a skin. `main.ts` handed them to the harness view out of band,
   which worked only while the sole consumer was constructed in `main.ts`.
2. **`AppHost` has no `sound`.** §9 is phase 6 and nothing exists behind it. A field
   that resolves to nothing is the unfinished work `CLAUDE.md` forbids shipping; adding
   it later costs one line.
3. **The file list is tier 1, not tier 2.** §5 puts it in tier 2, which would make the
   app's central surface six skins' work before Files could render at all. It ships as
   tier 1 *by construction*: it emits `listrow`/`listcell`/`listheader` into the same
   attribute vocabulary and each skin paints them. **Raised, not resolved** — if tier 2
   is wanted for the list, a skin can already override every rule, and the icon view is
   the stronger tier-2 candidate.

**Not built, deliberately.** Tabs (§5 lists them tier 1; Files uses none, and a widget
that cannot be verified against six skins is worse than no widget). Scroll bars and
per-era icon artwork (both genuine tier-2 additions and therefore contract changes —
raised rather than taken). One exception: System 1's list scroll bar got a two-tone
face, because a native Chromium scroll bar renders three mid greys in an era that has
none. That is the no-grey obligation, not the tier-2 widget.

`DirectoryView` and `openDirectoryWindow` are untouched. Eleven tests across four
suites drive the phase-2 harness by name, and it proves a different claim; deleting it
would be removing working behaviour to make a new feature easier.

---

## 3. The phase-5 gate

`suspend()` → `resume()` with state intact, per app, asserted rather than assumed.

What survives, and where it lives:

| State | Kind |
|---|---|
| current folder, view mode, sort key and direction | plain fields |
| selection and keyboard cursor | identity-based, in the list widget |
| **scroll offset** | **in the DOM** |
| **an in-progress rename — text and both caret offsets** | **in the DOM** |

The last two are the test. `resume()` re-reads the filesystem and rebuilds every row,
so a rename half-typed at the moment of suspension is destroyed by the very re-render
that brings the window back — unless it is read out on the way down and re-mounted on
the way up. The suite types `half-typed`, puts the caret at offset 4 (neither end, so a
restore that selects everything or collapses to zero fails), suspends, writes to the
filesystem to prove the app does *no work* while suspended, resumes, and asserts the
text, the caret, the selection, the folder and the scroll offset are all identical —
and that the editor is really back on screen rather than only remembered in a field.

The round trip also runs in all six eras.

---

## 4. Bugs found by rendering it, not by testing it

Every one of these passed the assertions and was wrong on screen.

1. **The list's type-ahead ate the rename editor's keystrokes.** `preventDefault()` on
   a printable keydown stops it reaching the input, so `renamed` arrived as `a`. The
   list is the only tab stop, so anything else reporting focus is a descendant widget:
   `if (e.target !== this.el) return`. Same shape as DECISIONS 1.9 — the surface that
   owns an event must not consume the events belonging to what it opened.

2. **Category glyphs were characters, and no era face carries them.** `▸` `▤` `♪` fell
   back to the browser's default face and antialiased: **2,569 mid-grey pixels** in a
   1-bit window. `ListRow.glyph` is now a *category* (`folder`, `document`, …) written
   as `data-glyph` with no text at all, and the skin draws it. `CLAUDE.md` records the
   identical trap for U+2014 in a window title.

3. **`clip-path` antialiases its diagonals.** The replacement silhouettes were polygons
   and put the grey straight back. Percentages have the same problem one step later —
   12% of a 12px box is 1.44px. Every mark is now concentric `inset` shadows at integer
   pixel spreads, which land on the grid at any integer display scale.

4. **`border-radius: 50%` on a radio is a grey in a 1-bit era.** The view switch is
   toggle buttons instead — and not as a concession to one era: all six shipped their
   view switch as toolbar buttons or a menu, never a radio column. `ButtonSpec.pressed`
   is the vocabulary.

5. **Extending a skin's selector reaches one layer, not the construction.** System 1's
   button is an element plus a clipped `::before` paper interior; attaching `[data-ui]`
   to the outer rule alone gave black-on-black. Its `::before`, `:active` and disabled
   rules all needed the same treatment.

6. **`.lg-btn` is Ledger's *caption* button** — a fixed `--lg-control-h` square — so
   attaching the kit's buttons to it made every toolbar button a square the width of
   its own height and crushed eight labels to one letter each. Ledger now has a push
   button that sizes to its label, sharing the era's ink and its five states and
   nothing else.

7. **A flex toolbar button shrinks below its own label.** `flex: 0 0 auto` is in
   `base.css`, not a skin: a button whose label is a single letter is unusable, not
   differently styled.

8. `1 bytes` is not a size.

---

## 5. The no-grey gate is this app's to make, and its instrument had to change

`system1-fidelity.spec.ts` asserts no pixel anywhere is a mid grey — and it would have
passed whatever Files rendered, because it builds its own two buttons and screenshots
the desktop and a menu. Reading it as coverage of a new surface is the mistake
`CLAUDE.md` records twice under *a guard that cannot fail*, so the app that added the
surface adds the assertion.

Its instrument could not be reused. That suite's discriminator is a luma band — below
40 or above 208 — derived from Chromium's LCD fringes on **black text on white**, the
only polarity its surfaces render. A selected row inverts, and white-on-black fringes
to a different set: measured here at lumas 51, 54, 81, 91, 126, 163, 168 and 189,
squarely inside the band. Widening the band until this passes is precisely the
*loosen a threshold until a false assertion passes* failure.

So the claim is restated to the one that is true and is the actual point: **no region
is flat grey.** A fill has a large connected region of non-pure pixels; a fringed edge
is confined to one glyph. Measured: the largest non-pure component in the Files window
is **168** device pixels, an injected `#808080` row is **27,760**, and the bound is one
character cell — `(font-size × display-scale)²` — derived from the era's own type
rather than picked. Per `CLAUDE.md`'s own rule, a second test injects a real grey fill
and asserts the probe catches it.

---

## 6. Open, and not blocking

1. **App menus carry no accelerators.** DECISIONS 4.47: an enabled item's accelerator
   must come from the active keymap, and `AppHost` exposes no `accelFor` — deliberately,
   since an app that could read the keymap could disagree with it. Every item is bare
   and reachable by walking the menu. If apps should bind commands, that is a contract
   decision, not a Files one.
2. **`AppModule.mount` takes only a host**, so a start folder cannot travel through it.
   `filesAppAt(dir)` closes over the folder instead — the same mechanism `main.ts`
   already uses for era bundles, and it costs the contract nothing.
3. **One `defaultSize` meets six type scales.** 460×300 is comfortable in five eras and
   tight in Ledger, whose 18px Black type wraps the toolbar to three rows. The window is
   resizable and the app must not know which era it is in; if this matters, the fix is a
   size the *skin* scales, not a conditional in the app.
4. **Opening a file shows its properties**, because no type→app registry exists yet.
   Stated in the code rather than left as a silent no-op.
5. **Tiger's and Mac OS 8's control geometry is derived, not measured.** Neither source
   publishes a push-button, list-row or text-field bitmap and `docs/sources/` has no 1:1
   capture of either. Every such value is marked in the stylesheet. The four skins that
   already had measured control faces reuse them by selector, so no measured value is
   duplicated.
