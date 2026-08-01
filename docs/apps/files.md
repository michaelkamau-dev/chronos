# Files — phase 5

Branch `app/files`. Written before any app code, because the survey that was
supposed to take an hour found the app layer is not there.

---

## 1. The blocker: §5's app layer does not exist in the tree

§5 specifies four things and the repository has one of them.

| §5 declares | In the tree? | Where |
|---|---|---|
| `AppInstance` | **yes** | `src/core/app/types.ts` |
| `AppModule` (`id`, `defaultSize`, `minSize`, `resizable`, `mount`) | no | — |
| `AppHost` (`root`, `fs`, `win`, `ui`, `sound`, `clipboard`) | no | — |
| `WindowHandle` (`setTitle`, `setDirty`, `requestClose`, `openDialog`) | no | — |
| `UiKit` — tier 1 widgets | no | — |
| `SkinManifest.widgets` — tier 2 `WidgetRenderer` | no | `SkinManifest` has `chrome`, `menu`, `keymap`, `viewport`, `regions`, `renderBudget`, `generatedProperties` |
| `SoundApi`, `ClipboardApi` | no | — |
| `src/apps/` | no | the invariant scan already walks the path, so the slot is reserved and empty |

Verified by reading `src/core/app/types.ts`, `src/shell/shell.ts`, `src/core/wm/types.ts`
and by grepping the whole tree: `UiKit`, `AppHost`, `AppModule`, `WindowHandle` and
`openDialog` appear **nowhere in `src/`**. The only matches are `Shell.registerApp` in
`src/shell/shell.ts:355` and its one caller in `src/main.ts:177`.

What phase 4 actually built is the *routing*: `Shell.registerApp(id, instance)` turns the
window manager's `suspended`/`resumed`/`focused`/`closed` events into calls on an
`AppInstance`, and registers `canClose` as the WM's close guard. `core/app/types.ts` says
this in its own doc comment — one harness implementation, proof the contract is wireable
and nothing more. That is exactly right and it is not the same thing as an app layer.

So the brief's instruction — *"You write `ui.button(...)`, never a class name"* — has no
callable subject today. Neither has *"Tier 1 widgets resolve through UiKit"*.

### Why this is not mine to fix on `app/files`

It is not a contract *change* discovered mid-build; it is the phase-5 foundation, and it
is identical for all six app sessions. If each of the six builds the widget kit it needs,
`main` gets six incompatible `UiKit`s, six `AppHost` shapes and six merge conflicts in
`core/` — and five of them get thrown away. §11's rule is that a core change is fixed in
core and reported rather than absorbed; the same reasoning applies with more force to core
code that does not exist yet.

**`core/app` + `core/ui` has to land on `main` before the six app branches write widget
code.** Which session builds it is the call to make; the sequencing is not optional.

### Three gaps in §5 itself, found while checking the above

These need answers whoever builds the layer, so they are recorded here rather than
discovered six times.

1. **`AppHost` has no `PathCodec` and no `NameDecorator`.** Files cannot render a single
   row without `codec.displayName(node)`, cannot draw a location bar without
   `codec.format(chain)` or `codec.volumeName()`, and cannot create "New Folder" without
   `decorate` for the collision suffix. An app may not import a skin, so there is no other
   route. `main.ts` hands both to `DirectoryView` directly, out of band — which works for
   a harness constructed in `main.ts` and does not survive contact with `AppModule.mount`.
   Same shape of omission as `ShellRegionHost.accelFor`: the accessor exists one layer up
   and not on the surface that needs it.

2. **`AppHost.sound` would be a stub.** §9 is phase 6; there is no `SoundApi` and nothing
   to put behind it. CLAUDE.md forbids shipping the placeholder that would result. Either
   sound lands minimally now with something real behind it, or `AppHost` omits the field
   until phase 6 adds it. Omission is the honest option and costs one line later.

3. **§5 puts the file-list view in tier 2**, i.e. each skin exports its structure. That
   makes the Files app's central surface skin-supplied, and it means six skins gain a
   file-list `WidgetRenderer` — work in the skin layer that no app session owns and that
   blocks Files specifically. Worth re-deciding: the *structure* of a name/size/kind/date
   list is the same in all six eras, and what differs is chrome, metrics and the column
   set. Tier 1 with a `data-ui="filelist"` vocabulary would put it inside the kit and let
   each skin's CSS paint it, the same way §5 already handles tabs and group boxes. The
   icon view is a stronger tier-2 candidate than the list view is.

---

## 2. The open/save dialogs: **core provides them. Files does not export them.**

This is the answer the other five sessions are waiting on, so it is stated first and
argued second.

`host.win.openDialog(...)` — a core service reachable from every app's `WindowHandle`,
rendered from the active skin's widgets, opened as a modal owned by the *calling* window.
Files is its heaviest consumer and owns none of it.

Five reasons, in order of how much they cost to get wrong.

1. **§5 already says so and it is in the contract line, not the prose.** `win:
   WindowHandle // setTitle, setDirty, requestClose, openDialog`. The dialog was specified
   as a window-handle capability from the start; nothing anywhere describes it as a Files
   export.

2. **"An app knows core and nothing else."** If Editor calls Files for Save As, Editor
   knows Files exists. That is the top invariant in CLAUDE.md, broken directly, and it
   makes five app branches depend on the build order of a sixth.

3. **Files is not necessarily running.** A dialog that lives in the Files app fails when
   the user has closed Files — or Files becomes an always-mounted singleton service, which
   is worse, because now an app that the user quit is still holding a filesystem watch.

4. **The modal belongs to the caller's window.** The mechanism is
   `wm.open({ modalOwner })`, already proven by Ledger's Steward. The owner of that modal
   is the window that asked, so the dialog's lifetime is the caller's — including
   `flashModal`'s rejection feedback when the user clicks the blocked parent. Routing it
   through Files would put the modal under the wrong owner and break the blocked-click
   behaviour the shell already implements.

5. **It is historically backwards as well.** These were OS services, not file-manager
   features: `comdlg32.dll`'s `GetOpenFileName` on both Windows eras, the Standard File
   Package on the classic Macs, `NSOpenPanel` on Tiger. An app got the dialog from the
   system, which is why every app's Open box looked identical and none of them looked like
   the Finder's window. Building it as a Files export would reproduce a coupling the real
   eras did not have.

**What Files does own:** the browsing conventions the dialog reuses — sort order, the
`wellKnown` folder naming, the "can this node be chosen" rules, extension filtering. Those
belong in the shared file-list widget both surfaces render, not in an app-to-app call.

**What this costs core:** one `openDialog` on `WindowHandle`, a `FileDialogSpec`/result
pair, and one implementation over `FsApi` + the file-list widget. It is a core addition,
which is why it is raised here and not built.

---

## 3. Verified baseline at the time of writing

`main` and both branches at `fb6e189`. `npm run typecheck` clean; `npm run test:invariants`
12/12. Browser suites not re-run — no source has changed.
