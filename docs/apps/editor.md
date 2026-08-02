# The Editor

Phase 5, branch `app/editor`. What was built, what it cost core, and what rendering
it found that the assertions did not.

---

## 0. Read this first: the contract changes

Three, all in core, all of them shared code the other five app sessions need and
cannot see until this merges. §11 says a core change a later consumer demands is a
contract bug to be fixed in core rather than worked around, and reported rather than
absorbed.

| # | Change | File | Why it could not be avoided |
|---|---|---|---|
| 1 | **`UiKit.textArea`** — a multi-line text surface, tier 1 | `src/core/ui/kit.ts` | The Editor's central surface. The kit had `textField` (single-line `<input>`) and nothing else, so there was no way to put an editable document on screen through `ui.*`. |
| 2 | **Structure for it**, plus one bug fix | `src/shell/base.css` | `[data-ui='textarea']` sizing and wrap behaviour; the find bar's row and field geometry; and `[data-ui-role='findbar'][hidden] { display: none }`, without which a *closed* find bar stayed on screen in all six eras. |
| 3 | **The file chooser's category marks** | `src/core/ui/dialogs.ts` | It passed `▸` and `·` as `ListRow.glyph`, which is documented as a **category, never a character**. The kit wrote `data-glyph="▸"`, every skin's rule missed, and the chooser drew an empty box in front of every row in all six eras. |

Change 3 is not the Editor's: it is a pre-existing bug in the dialog service that the
Editor found by opening an Open dialog and looking at it. It is fixed here because it
is core, with `test/browser/editor.spec.ts` asserting the categories against the
contract vocabulary so it holds for a new era without being rewritten.

**`textArea` is tier 1 by §5's own test — "same DOM, skin CSS differs."** MacWrite,
Notepad, SimpleText and TextEdit are one structure with six faces, six inks, six
borders and six selection colours; there is no era among them whose text surface is
built out of different *elements*, so there is nothing for a tier-2 template to vary.
What genuinely does differ is the scroll bar, and that was already a tier-2 candidate
before this widget existed and still is.

```ts
interface TextAreaSpec {
  label: string
  value?: string
  wrap?: boolean            // behaviour, not a look — see below
  enabled?: boolean
  readOnly?: boolean
  onInput?(value: string): void
}

interface TextAreaWidget extends ControlWidget {
  value(): string
  setValue(v: string): void          // resets caret and both scroll offsets to 0
  selection(): { start: number; end: number }
  setSelection(start: number, end: number): void
  scrollOffset(): { top: number; left: number }
  setScrollOffset(top: number, left: number): void
  setWrap(on: boolean): void
  setReadOnly(on: boolean): void
}
```

`wrap` is a property rather than a look for the same reason `pressed` is on
`ButtonSpec`: word wrap changes what the control *does*, and every era shipped it as a
user setting rather than a house style. The kit writes both the `wrap` attribute and
`data-wrap`, because the attribute alone does not settle horizontal overflow.

**For the other four sessions:** `host.ui.textArea({ label, wrap, onInput })`. It is
styled in all six skins. Terminal will want it for scrollback; Paint will not.

### Not taken, raised instead

- **A modeless dialog service.** Core's only dialog is modal (`wm.open({ modalOwner })`),
  and a modal Find that blocks the text you are searching is wrong for every one of the
  six. So Find/Replace is an in-window bar. The era-correct construction is a modeless
  owned window — Notepad's and TextEdit's both were — and that is
  `WindowHandle.openPanel(spec)` or similar. It is core surface five sessions would
  inherit and suspend/resume across two windows needs its own rules, so it is raised.
  The bar is also the only construction where "open find/replace state survives
  suspend" is genuinely the editor's own state to capture, which is what the phase-5
  gate asks for.
- **`ClipboardApi`.** §5 lists it on `AppHost`; Files did not need it and did not add
  it. So the Edit menu has **no Cut, Copy or Paste** — the text surface keeps the
  platform's own on the keyboard, and a menu item this app cannot perform would be
  advertising a command that does not exist. Omission is the honest third option, the
  same call System 1's File menu made about Get Info, Duplicate and Eject.
- **Checkbox artwork for five skins.** Match Case and Wrap Around were checkboxes in
  every era's Find dialog. Five of the six skins ship no checkbox artwork —
  `base.css` strips the browser's with `appearance: none` precisely so a missing skin
  rule is loud — and only System 1 has drawn one. Supplying a Luna, a Platinum, an Aqua
  and a Windows 3.1 check mark would mean inventing four bitmaps with no source in
  `docs/sources/`, which `CLAUDE.md` forbids outright. They ship as toggle buttons,
  which all six already draw. **This is era work with a source requirement, not app
  work.**
- **An era-specific untitled name.** `PathCodec` has no hook for "what an unsaved
  document is called", so it is the canonical `Untitled.txt` in all six.

---

## 1. What was built

`src/apps/editor/` — `index.ts` (the app), `find.ts` (search, pure), `undo.ts` (the
stack and the buffer diff).

- **Find and replace** with wrap and match-case, in a bar built from tier-1 widgets:
  Find Next, Find Previous, Replace, Replace All, a live match counter reading
  `match 2 of 5`, and Enter in the search field that finds the next match *and leaves
  the caret in the field* so the second Enter finds the one after.
- **The unsaved-changes guard** through `canClose(): Promise<boolean>` — Save,
  Don't Save, Cancel. A Save cancelled at the file chooser cancels the close too.
- **Word wrap**, a toggle button and a checkable menu item that cannot disagree.
- **Save / Save As / Revert**, era-correct because they are `WindowHandle` services
  and get the active skin's chrome and controls for free. Save As over an existing
  name asks before replacing. Revert asks first and **is undoable** — every one of
  these editors treated Revert as a discard with no way back, and a whole-buffer
  replacement the undo stack cannot reach is the one edit that can lose an afternoon.
- **Undo/redo** with word-granular coalescing, structural rather than timed.

### The buffer is not duplicate state

`CLAUDE.md`: the filesystem is the single source of truth and no app holds duplicate
state. The Editor holds an edit buffer, and that is *uncommitted work* rather than a
copy — the difference between the buffer and the file **is** the unsaved-changes
condition the dirty indicator and `canClose()` both report. Everything the filesystem
does know is read on every render and cached nowhere: the name, the location, whether
the file still exists.

When the open file changes underneath a **clean** buffer the change is adopted, which
is "render from filesystem reads". Underneath a **dirty** buffer it is not — adopting
it would destroy exactly what the flag protects — and the status bar says
`changed on disk since you edited it`. If the file is deleted the buffer survives as
an unsaved document and Save routes through Save As, which is the outcome that loses
no work.

### Chords

`Ctrl/Cmd` + `S`, `Z`, `Shift+Z`, `Y`, `F`, `H`, `G`, `Shift+G`. Checked against all
six skins' keymaps: none is bound by any of them. Both modifiers are accepted, which
is not an era conditional — `core/ui/kit.ts` already does it for Ctrl/Cmd+A, and it is
the only way to be right on a Mac era and a Windows era from one branch.

**Tab is deliberately not claimed.** Notepad inserted a tab character; in this project
Tab is focus containment in every era, and a text surface that swallowed it would be
the one window a keyboard user cannot get out of.

**The menus advertise no accelerators.** DECISIONS 4.47: an enabled item's chord must
come from the active keymap and an app has no route to it. A chord that works and is
not advertised is the safe direction; the reverse is not. A test asserts every item is
bare.

---

## 2. The phase-5 gate

`suspend()` → `resume()` with state intact, asserted per app.

| State | Where it lives | Survives because |
|---|---|---|
| open file, dirty flag, word wrap | plain fields | they are plain fields |
| **undo and redo stacks** | plain data, by design | see below |
| **caret and selection range** | **the DOM** | captured and re-mounted |
| **both scroll offsets** | **the DOM** | captured and re-mounted |
| **find bar: term, replacement, both caret ranges, which field had focus** | **the DOM** | captured and re-mounted |

The undo stack is in that table to make a point rather than to claim credit. A
`<textarea>` has the browser's own undo and it is unusable here for two independent
reasons: it is destroyed by any programmatic write to `value` — which Replace All,
Revert, Open and `resume()` all perform — and it cannot be read, so a claim that it
survived is a claim nothing can test. Owning it makes it plain data, and plain data
costs the round trip nothing.

### The test had to be made capable of failing first

The first version of the suspend test dirtied the buffer before suspending. **Every
assertion in it passed with the capture and the re-mount both deleted** — verified by
deleting them — because a dirty buffer is never overwritten from disk, so `resume()`
wrote nothing to the surface and there was nothing to destroy. That is `CLAUDE.md`'s
"a guard that cannot fail", found for the third and fourth time in this project.

The test now **saves** before suspending, which leaves the buffer clean and the undo
stack loaded, then rewrites the file from outside while suspended using the same string
upper-cased — same length, so an offset of 40 and a `scrollTop` of 60 still mean
something on the other side. `resume()` genuinely adopts the new text, genuinely
rewrites the surface, and three separate probes now fail it: removing the capture in
`suspend()`, removing the re-mount in `render()`, and removing the search field's caret
restore.

### …and that is what found the bug

`suspend()` set `this.suspended = true` **before** calling its two capture methods, and
both refuse to run while suspended — they read the live DOM, and a suspended app's DOM
is a frozen picture rather than a source of truth. So both calls were no-ops. The
failure is completely silent: every piece of state still comes back, because nothing has
destroyed it *yet*. It only surfaces on a resume that has to rewrite the surface, which
is exactly the case the first test could not reach.

### Where the capture belongs

**Adjacent to the write it protects against, and nowhere else.** The first version
captured at the top of `render()`, before the awaited filesystem read. That is capturing
a caret that is about to go stale: anything the user does during the read — clicking into
the document, dragging a selection, typing into the search field — happens after the
capture and before the restore, so the restore puts the old position back and the
interaction is silently undone. It reproduces exactly: place a caret while a sibling
window is writing to the file and it jumps back.

There is a second rule underneath it. `captureCaret()` returns early when
`area.value() !== this.text`, because **the surface's caret is the truth only while the
surface is showing what the app thinks it is showing.** After a programmatic edit the
buffer has moved and the surface has not, so its caret points into the old text; capturing
it then overwrites the position the edit just computed. The symptom is Replace All leaving
the cursor wherever it happened to be.

---

## 3. Bugs found by rendering it, not by testing it

Every one of these passed the assertions and was wrong on screen.
`tools/shots/editor-render.mjs` produces the six pictures and reports what a picture
cannot show.

1. **A closed find bar stayed on screen.** `hidden` is a UA rule of the lowest possible
   specificity, so `base.css`'s `display: flex` beat it and closing the bar left an empty
   strip — in all six eras at once, because the rule that broke it is the shared one. The
   list header three rules above needed the identical line for the identical reason.

2. **Windows 3.1 clipped its own buttons.** `Replace All`, `Match Case` and `Wrap Around`
   rendered as `Replace`, `Match` and `Wrap`, because a 3.1 command button is a fixed
   `--w31-btn-w` and every skin distinguishes a *command* button from a *toolbar* button
   for exactly that reason. Same failure `CLAUDE.md` records for `.lg-btn`: a class is a
   **kind** of control. The bar's rows are now real `ui.toolbar()`s, which picks up the
   rule each skin already wrote instead of adding a second copy to six stylesheets.

3. **Ledger's search field swallowed the window.** Its `[data-ui='field']` is
   `width: 100%; height: 100%`, written when the only field in the project was the sole
   child of a sized box. In a row that resolves against the row's own auto height. Fixed
   structurally in `base.css` and given the era's control height in the skin.

4. **Ledger had one visible line of document.** 18px Black type — a derivation, not a
   preference — wraps the toolbar to two rows and the find bar to four. The default window
   size is now 470×480, and the render tool reports the visible line count per era and
   fails below four, so the next person to add a toolbar button finds out.

5. **The status bar rendered `·` in a face that has no `·`.** ChiKareGo2 carries no
   U+00B7, and a missing glyph does not fail loudly — it falls back to the browser's
   default face, which antialiases, so a 1-bit window got a grey smudge and nothing
   reported it. Third surface in this project to hit this trap after U+2014 in a window
   title and `▸` in a file list. It is a plain hyphen now.

   **`src/apps/files/index.ts:735` has the same line and the same bug.** Not changed here
   — it is another session's file and a one-character fix — but it is real, and it is
   wrong only in System 1, so it is that app's call rather than a shared one.

6. **The file chooser drew an empty box in front of every row**, in all six eras. Core
   bug, described in §0.

---

## 4. The glyph-coverage instrument, which was wrong twice

`CLAUDE.md` names `document.fonts.check()` as the instrument for "does this era's face
carry every character this app renders". **It is the wrong call**: it answers "are the
faces this text needs loaded", not "does this face have this glyph". A character the era's
face lacks is drawn by the browser's default, which counts as available, so it returns
true for every character in every era. Verified by injecting U+25B8 and U+2014 into a
status bar and watching it report nothing.

The advance width is the next thing to reach for and it is wrong in the other direction:
Pixel Operator Bold at 16px has the same advance as the browser's default for two dozen
ordinary Latin letters, so it reported `n`, `o` and every digit missing in Windows 3.1.

What works is **rasterising the character twice with the same fallback anchor**. Comparing
the era's face against a *nonexistent family* does not work either — a missing glyph falls
back through the system font list while a missing family falls back to the default font,
and the two land on different faces, which is why that version reported Windows 3.1 and
Mac OS 8 clean while the probe characters were sitting in their status bars. Appending the
same generic to both stacks makes the fallback identical by construction, so equal pixels
mean exactly one thing.

`node tools/shots/editor-render.mjs --probe` injects U+25B8 and U+2014 and asserts the
instrument reports them. It also states the fact that makes "every era must report" the
wrong pass condition: ChiKareGo2 carries none of U+25B8, U+2014 or U+00B7, while Pixel
Operator Bold and the Chicago subset carry all three, so only the era genuinely missing a
character can report it.

---

## 5. The no-grey gate

Reused from `files.spec.ts` with its reasoning intact: the era's own fidelity suite
screenshots the desktop and a menu, so it would pass whatever this window rendered, and
its luma band cannot be borrowed because that band came from black-on-white fringes while
an inverted selection fringes straight through it. The claim asserted is **no region is
flat grey**, measured as the largest connected run of non-pure pixels against a bound of
one character cell, with a probe that injects a real grey and asserts the guard fires.

A `<textarea>` is the widget a browser most wants to give a default border, a default face
and a resize grip to, and every one of those arrives as grey.

---

## 6. Open, and not blocking

1. **Two eras' document faces are unresolved substitutions.** XP's Notepad set documents
   in **Lucida Console 10pt** and 3.1's in **Fixedsys** — a fifth and a sixth face this
   project has never scrutinised, and §13's substitution table names neither. Both render
   in their era's system face instead, which is a face that era shipped rather than an
   invented stand-in. Resolving them is the §13 font gate: name a face, show a rendered
   comparison at the sizes the era used, then build. The four Mac/Ledger eras have no such
   gap — their document faces are the ones the skin already resolved.
2. **The find bar is not the era's construction.** See §0. A modeless dialog service would
   make it one.
3. **Match Case and Wrap Around are toggle buttons, not checkboxes.** See §0. This one
   needs sources, not a decision.
4. **No line-and-column readout.** It needs a caret-move listener, which is the one thing
   this app deliberately does not have — the caret is read at the two moments it is about
   to be destroyed and never polled. Cheap to add if wanted; stated so its absence is a
   choice rather than an omission.

---

## 7. Verification

```
npm test        # 12 invariant, 7 budget, 328 browser
```

The browser suite was 295 at the Files merge, so this adds 33 and changes none. The perf
gate is unmoved after the shared-CSS changes: `scriptPerFrame` 0.476ms against a 3ms
bound, `layoutPerFrame` 0.005ms, `longTasks=0`, `layouts=1` — inside the 0.27–0.94ms band
every previous run has reported.

Rendered and looked at in all six eras via `tools/shots/editor-render.mjs`, which reports
zero missing glyphs, no content overflowing its frame, and at least five visible lines of
document with the replace bar open in every era.
