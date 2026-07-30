# Chronos — Architecture

## Context

Chronos boots into six real desktop environments across four decades — System 1
(1984), Windows 3.1, Mac OS 8, Windows XP, Mac OS X Tiger, and a speculative 2035
OS — over one persistent IndexedDB filesystem. Save a document in System 1, reboot
into Windows XP, and it is there: correct icon, correct metadata, correct
Properties dialog, opening in the XP-skinned editor.

The repo is empty apart from `CLAUDE.md` and `docs/BRIEF.md`. This is a
greenfield build with no existing code to reuse.

The project is won or lost on fidelity. Two forces pull against each other and
the architecture exists to resolve them:

- **Era knowledge must be total** — every measured pixel, font, sound, path
  syntax, keybinding and failure dialog differs per era.
- **Era knowledge must be nowhere** — `CLAUDE.md` forbids era conditionals
  inside app logic or the window manager.

The resolution: **one typed `Skin` manifest per era is the only place an era
exists.** Core and apps consume semantic contracts (commands, metrics, templates,
codecs) and never learn which era is active. This is enforced by a test, not by
discipline.

### Settled by review

| Question | Decision |
|---|---|
| Display model | System 1 (512×342) and Win 3.1 (640×480) render in a native-resolution viewport, integer-scaled nearest-neighbour. OS 8 / XP / Tiger / 2035 full-bleed 1:1. WM always works in logical era pixels. |
| Fonts | Bundle permissively-licensed clones (OFL / CC-BY / public domain), WOFF2, subset, lazy-loaded per era. Every substitution documented with its licence. |
| Delivery | Push each phase to `claude/new-session-aej4gm` with verification evidence, then stop for go-ahead. |
| 2035 era | Concept pitched below for approval alongside this doc. |

---

## 1. Layer architecture

```
src/
  core/          knows nothing about eras or apps
    wm/          window model, z-order, focus, drag/resize, frame lifecycle
    fs/          virtual filesystem over idb-keyval — the single source of truth
    input/       root event delegation, keymap stack, focus/capture stacks
    audio/       Web Audio synthesis engine (oscillators, envelopes, reverb)
    ui/          era-neutral widget kit (the app-facing DOM vocabulary)
  apps/          six apps. Know about core. Never about eras.
    files/ editor/ paint/ terminal/ media/ settings/
  skins/         the ONLY place an era exists. One lazy-loaded chunk each.
    system1/ win31/ macos8/ winxp/ tiger/ ledger/
      metrics.ts             measured chrome geometry
      metrics.provenance.ts  a source for every single number
      chrome.ts              window frame template
      widgets.ts             structural widget overrides
      keymap.ts              chord → semantic command table
      paths.ts               PathCodec + well-known folder display names
      sounds.ts              synthesis recipes
      skin.css               all era styling
  shell/         desktop, menu bar/taskbar, boot sequence, switcher, failure states
                 — parameterised entirely by the active Skin manifest
```

Dependency rule, enforced in CI: `core/` imports nothing from `apps/`, `skins/`
or `shell/`. `apps/` imports only `core/`. Only `shell/` may import a skin, and
only through `import()`.

### Enforcing the invariant

`test/invariants.test.js` fails the build if:

1. Any file under `core/`, `apps/` or `shell/` contains an era identifier
   (`system1|win31|macos8|winxp|tiger|ledger`) — catches era conditionals.
   Comments are stripped before scanning but string literals are kept, since
   `=== 'winxp'` is exactly the violation being hunted.
2. Any file outside `core/fs/` references `idb-keyval` or `indexedDB` — enforces
   "all persistence flows through the FS layer."
3. Any file under `core/wm/` assigns `.style.top` or `.style.left`, by property or
   via `setProperty` — enforces transform-only movement. Position lives in the
   skin's CSS so the window manager never writes either, at creation or in the
   drag loop.
4. `core/wm/drag.ts` mentions any layout-reading API (`getBoundingClientRect`,
   `offsetWidth`, `getComputedStyle`, …) — a forced reflow per frame is the
   easiest way to lose the frame budget.
5. Any source file contains `TODO|FIXME|XXX|HACK|placeholder|in a real
   implementation`.
6. Any skin is missing `metrics.ts`, a `Provenance<ChromeMetrics>` export, or a
   `note` on an `unverified` metric.
7. The dispatcher registers more than one root listener per event type.
8. Anything outside `skins/` constructs a chrome renderer — a window manager that
   picks a renderer is picking an era.

They run in under a second, and they make the CLAUDE.md rules mechanical rather
than aspirational. `test/browser/a11y.spec.ts` adds the matching keyboard rule:
every command with a live handler must be reachable from a chord or a menu entry,
so a mouse-only feature fails the build too.

---

## 2. The window manager contract

The WM owns geometry, z-order and focus. It owns **no pixels**. It asks the
active skin to build a frame and tells it when state changes.

```ts
type WindowId = number & { readonly __brand: unique symbol }

interface WindowState {
  readonly id: WindowId
  appId: AppId
  title: string
  icon: IconRef
  rect: Rect              // logical era px — position of the FRAME
  restoreRect: Rect | null
  z: number
  focused: boolean
  minimized: boolean
  maximized: boolean
  resizable: boolean
  minSize: Size           // per-app, content area
  modalOwner: WindowId | null
  dirty: boolean          // drives unsaved-changes guard
  closable: boolean
}
```

Public surface — everything the shell, apps and keymaps can do:

```ts
interface WindowManager {
  open(spec: OpenSpec): WindowId
  close(id: WindowId, opts?: { force?: boolean }): Promise<boolean>
  focus(id: WindowId): void
  moveTo(id: WindowId, x: number, y: number): void
  resizeTo(id: WindowId, rect: Rect): void
  minimize(id): void; restore(id): void; toggleMaximize(id): void
  raise(id): void; lower(id): void
  cycle(dir: 1 | -1, commit: boolean): void   // Alt+Tab / Cmd+Tab
  list(): readonly WindowState[]              // z-ordered, back to front
  focusedId(): WindowId | null
  subscribe(fn: (e: WmEvent) => void): Unsubscribe
}
```

### The skin side of the contract

```ts
interface ChromeRenderer {
  readonly metrics: ChromeMetrics
  createFrame(s: WindowState): FrameHandle
  updateFrame(h: FrameHandle, s: WindowState, changed: ChangeMask): void
  destroyFrame(h: FrameHandle): void
  minimizeTo(h: FrameHandle, target: Rect): Promise<void>
}
```

`ChangeMask` is a bitfield (`TITLE | FOCUS | RECT | DIRTY | MAXIMIZED`) so a
focus change never re-renders a title bar's DOM — it flips one attribute.

The frame DOM a skin returns is free-form **except** for a small vocabulary the
WM hit-tests against. This is the entire coupling between WM and skin:

| Attribute | Meaning |
|---|---|
| `[data-part="titlebar"]` | drag origin, double-click-to-maximize target |
| `[data-part="title"]` | text node the WM writes the title into |
| `[data-action="close\|minimize\|maximize\|menu\|collapse"]` | chrome buttons |
| `[data-resize="n\|s\|e\|w\|ne\|nw\|se\|sw"]` | eight resize handles |
| `[data-content]` | where the app mounts |
| `[data-state]` on the frame | `focused` / `blurred` — skin styles inactive chrome |

This vocabulary is why one WM drives six structurally different chromes.
System 1 emits a close box and six racing stripes and no other buttons. Mac OS 8
emits close, zoom and collapse. XP emits an icon menu on the left and
minimize/maximize/close on the right. Tiger emits three traffic lights on the
left. The WM only ever asks "what did the pointer land on?"

`ChromeMetrics` carries the numbers the WM needs for layout maths — title bar
height, border widths per side, corner radius, resize-grab slop, shadow insets
(excluded from hit-testing), cascade offset for new windows, and the era's
minimize style.

### Requirements coverage

- **Real z-order** — single ordered array; `z` is the index; one style write per
  affected frame on reorder.
- **Click-to-focus with inactive styling** — `data-state` flip, CSS-only.
- **Eight-handle resize with per-app min sizes** — `minSize` comes from the app
  module; the WM clamps. Handles are hit-tested from the skin's `data-resize`
  regions, with `metrics.resizeGrab` slop so a 1px System 1 border is still
  grabbable.
- **Double-click-to-maximize** — on `[data-part="titlebar"]`. "Maximize" is
  era-semantic: Windows fills the screen; classic Mac **zoom** toggles to the
  content's natural size, which is a different behaviour. The skin declares
  `metrics.maximizeSemantics: 'fill' | 'zoom'` and the WM implements both.
- **Alt+Tab with switcher overlay** — WM exposes `cycle()`; shell renders the
  overlay from the skin's template; the chord comes from the skin's keymap.
- **Alt+F4** — a chord bound to the semantic command `window.close`, which
  routes through the same `close()` path as the close box, including the guard.
- **Era-correct minimize animation** — `minimizeTo()` is the skin's job. XP
  shrinks toward the taskbar button, Tiger genies to the Dock, OS 8 collapses to
  a title bar (windowshade), System 1 has no minimize at all and the skin simply
  does not emit the button.
- **Modal dialogs that genuinely trap focus** — see §4.

---

## 3. Virtual filesystem schema

The FS is the single source of truth. No app holds duplicate state; apps render
from FS reads and re-render on FS change events.

### Node model

```ts
type NodeId = string   // monotonic, era-independent

interface FsNodeBase {
  id: NodeId
  parent: NodeId | null
  name: string             // canonical name, no era decoration
  created: number; modified: number; accessed: number
  wellKnown?: WellKnown    // 'root'|'documents'|'pictures'|'desktop'|'trash'|'system'|'apps'
  createdInEra: EraId      // lore + Properties dialog, never behaviour
  locked: boolean
}

interface FsDir  extends FsNodeBase { kind: 'dir';  childIds: NodeId[] }
interface FsFile extends FsNodeBase {
  kind: 'file'
  size: number
  mime: string             // canonical type
  typeCode?: string        // classic Mac 4-char OSType, e.g. 'TEXT'
  creatorCode?: string     // e.g. 'MACS'
  blobKey: string
}
```

### IndexedDB layout (via idb-keyval, single store)

| Key | Value |
|---|---|
| `fs:meta` | `{ schemaVersion, rootId, nextId }` |
| `fs:node:<id>` | node record — small, JSON-serialisable |
| `fs:blob:<id>` | `Blob` — file content, stored separately |
| `sys:prefs` | current era, wallpaper, volume, per-era display scale |

Metadata and content are separate keys **because a file manager listing 200
files must never pull 200 PNGs into memory.** `list()` reads node records only.

**Atomicity**: multi-key mutations go through `setMany`, which idb-keyval runs in
a single IndexedDB transaction. Creating a file writes the blob first, then the
node record and the parent's `childIds` together — so a crash can orphan a blob
but can never produce a directory entry pointing at nothing. A boot-time sweep
reclaims orphaned blobs.

**Migrations**: `fs:meta.schemaVersion` drives an ordered migration list. Reload
survival across schema changes is a phase-2 test, not an afterthought.

**Quota**: `navigator.storage.estimate()` is checked before large writes; the
overflow path surfaces the era's authentic disk-full error rather than a
console throw.

### Era-specific path semantics over identical data

Paths are **presentation**. The FS API is id-based throughout; every path string
in the system is produced by the active skin's codec.

```ts
interface PathCodec {
  format(chain: FsNode[]): string
  parse(input: string, cwd: NodeId): Promise<NodeId | null>
  displayName(node: FsNode): string     // well-known folder + extension policy
  volumeName(): string
}
```

| Era | Same file renders as |
|---|---|
| System 1 / Mac OS 8 | `Macintosh HD:Documents:Letter` |
| Windows 3.1 | `C:\DOCS\LETTER.TXT` (8.3, uppercase) |
| Windows XP | `C:\My Documents\Letter.txt` |
| Mac OS X Tiger | `/Users/chronos/Documents/Letter.txt` |
| 2035 | see §8 |

Three things vary and all three live in the codec: the separator and volume
syntax, the well-known folder display name (`Documents` vs `My Documents`), and
the extension policy (classic Mac hides extensions and carries type/creator
codes; Win 3.1 coerces to 8.3 for display). The stored node is untouched by all
of it — which is exactly what makes the cross-era spine demonstrable.

### API

```ts
interface FsApi {
  root(): Promise<NodeId>
  stat(id: NodeId): Promise<FsNode>
  list(dir: NodeId): Promise<FsNode[]>
  read(file: NodeId): Promise<Blob>
  readText(file: NodeId): Promise<string>
  write(file: NodeId, data: Blob | string): Promise<void>
  create(parent: NodeId, name: string, kind: 'file'|'dir', data?: Blob|string): Promise<NodeId>
  rename(id: NodeId, name: string): Promise<void>
  move(id: NodeId, newParent: NodeId): Promise<void>
  trash(id: NodeId): Promise<void>
  purge(id: NodeId): Promise<void>
  watch(dir: NodeId, cb: (e: FsEvent) => void): Unsubscribe
}
```

`watch()` is what enforces "no app holds duplicate state." Two file manager
windows open on the same folder stay in sync because both re-read on the event —
and that is a directly demonstrable proof of the invariant, not a claim.

---

## 4. Event and focus model

### One delegated listener per event type

`pointerdown`, `pointermove`, `pointerup`, `keydown`, `keyup`, `contextmenu`,
`dblclick`, `wheel`, `focusin` — nine listeners on `#chronos-root`, for the
lifetime of the page, regardless of window count.

The dispatcher does exactly one coordinate conversion per event (client px →
logical era px, dividing by the display scale from §1) and one `closest()` walk
to resolve the target into a `HitTarget` discriminated union — window chrome
part, resize handle, content area, desktop, taskbar, menu. That resolved target
is a reused mutable object, not a fresh allocation.

### Three distinct focus concepts

1. **WM focus** — which window is active. Drives inactive-title-bar styling.
2. **DOM focus** — which element takes keystrokes. Always inside the WM-focused
   window, via a roving-tabindex scope the WM maintains per window. Tab cycles
   within the window and cannot escape it.
3. **Capture stack** — an ordered stack of exclusive input claimants: open menu,
   active drag, active resize, modal dialog. The top of the stack sees input
   first and can swallow it.

### Keyboard routing

```
capture stack top  →  focused window's app keymap  →  window chrome keymap
                   →  shell keymap  →  active skin's era keymap
```

Era keybindings are **data, not code**. Each skin exports a table mapping chords
to semantic commands; the WM only ever executes commands:

```ts
// skins/tiger/keymap.ts
[ { chord: 'Meta+W', command: 'window.close' },
  { chord: 'Meta+Q', command: 'app.quit' },
  { chord: 'Meta+Tab', command: 'window.cycleNext' } ]

// skins/winxp/keymap.ts
[ { chord: 'Alt+F4', command: 'window.close' },
  { chord: 'Alt+Tab', command: 'window.cycleNext' },
  { chord: 'Ctrl+Escape', command: 'shell.openLauncher' } ]
```

This is how Cmd+W and Alt+F4 coexist with zero era conditionals in the WM.

### Modal dialogs that genuinely block

A modal pushes onto the capture stack, and its owner frame gets the native
`inert` attribute — which removes the whole subtree from tab order and from
pointer targeting at the platform level, with no dependency and no focus-sentinel
hack. A `pointerdown` on an inert owner produces the era's authentic rejection
feedback: the classic Mac system beep, or XP's ding plus three title-bar flashes
on the modal.

Focus enters the modal on the era's correct initial control and cannot leave it.
Escape and the default button both resolve through the same command path.

### Context menus everywhere

Right-click — and the keyboard Menu key, and Shift+F10 — resolve the `HitTarget`
to a menu **owner**, and the owner returns a `MenuSpec`:

```ts
type MenuSpec = Array<
  | { kind: 'item'; label: string; command: Command; enabled: boolean
    ; checked?: boolean; accel?: string }
  | { kind: 'separator' }
  | { kind: 'submenu'; label: string; enabled: boolean; items: MenuSpec }
>
```

Desktop, file icon, title bar, taskbar button, app content — each owner supplies
its own spec with correct items, separators, submenus and disabled entries. The
shell renders the spec; the skin supplies the template, metrics and open/close
behaviour. Menu bars use the same `MenuSpec` type, placed differently: Mac eras
render it in the global menu bar at the top of the screen, Windows eras render it
inside the window. **One spec, six placements** — the same trick as chrome.

### Every mouse action has a keyboard path

Move and resize windows via a keyboard modal mode (a semantic command puts the
WM in move/resize state, arrows nudge, Enter commits, Escape reverts — this is
how the real Windows "Move" system-menu item worked). Menus open and navigate
from the keyboard with type-ahead. Desktop icons are an arrow-navigable grid.
Paint tools have accelerators and the canvas has a keyboard cursor mode.

---

## 5. One app, six skins

An app is a module that knows core and nothing else:

```ts
interface AppModule {
  id: AppId
  defaultSize: Size; minSize: Size; resizable: boolean
  mount(host: AppHost): AppInstance
}

interface AppHost {
  root: HTMLElement        // the frame's [data-content]
  fs: FsApi
  win: WindowHandle        // setTitle, setDirty, requestClose, openDialog
  ui: UiKit                // ← the mechanism
  sound: SoundApi
  clipboard: ClipboardApi
}

interface AppInstance {
  menu(): MenuSpec
  contextMenu(t: HitTarget): MenuSpec | null
  canClose(): boolean | Promise<boolean>   // unsaved-changes guard
  onFocus?(): void; onBlur?(): void; onResize?(w: number, h: number): void
  destroy(): void
}
```

App code writes `ui.button({ label: 'Save', onActivate })`, never `<button
class="xp-button">`. The `UiKit` resolves against the active skin in **two
tiers**:

**Tier 1 — same DOM, skin CSS differs.** Buttons, labels, text fields,
checkboxes, radios, group boxes, tabs. The kit emits a stable vocabulary
(`data-ui="button"`, `data-state="rest|hover|active|focus|disabled"`) and each
skin's CSS paints all five states era-correctly. A skin never sees this code.

**Tier 2 — structure genuinely differs, so the skin supplies a template.**
Scrollbars (System 1's hatched track and single arrow pair vs XP Luna's gradient
thumb vs Tiger's lozenge with a split-arrow preference), menus, window chrome,
progress bars, and the file-list view. The skin exports a `WidgetRenderer` with
the same `create/update/destroy` shape as `ChromeRenderer`, against the same
data-attribute contract.

The five interactive states are a **type obligation**, not a convention: each
skin's widget entry is typed `Record<WidgetState, StateSpec>`, so omitting
`disabled` for a skin's button is a compile error. `CLAUDE.md` requires all five
on every interactive element — this makes the compiler enforce it.

### The six apps

| App | Substance |
|---|---|
| **Files** | Icon + list + details views, rename in place, drag to move, multi-select, Properties dialog with era-correct metadata (type/creator codes on Mac, extensions on Windows), trash with restore, live-updating via `fs.watch`. |
| **Editor** | Find/replace with wrap and match-case, unsaved-changes guard through `canClose()`, word wrap toggle, era-correct Save/Save As/Revert dialogs, print-preview-free but genuine Page Setup where the era had one. |
| **Paint** | Canvas 2D. Pencil, brush, eraser, fill, line, rect, ellipse, text, select+move, colour picker, undo stack. **Saves a real PNG into the VFS** via `canvas.toBlob`. System 1's palette is 1-bit and its brushes are dither patterns — the tool set is the same code, the palette comes from the skin. |
| **Terminal** | Real command set on the real FS: `ls/dir`, `cd`, `pwd`, `cat/type`, `mkdir`, `rm/del`, `cp/copy`, `mv/move`, `echo`, `touch`, `find`, `tree`, `open`, `clear/cls`, `df`, `date`, `ver`, `help`, plus `crash`, `reboot`, `era`. Command *names* and path syntax come from the skin's codec — `dir C:\DOCS` on Windows, `ls /Users/chronos` on Tiger. |
| **Media** | Plays images from the VFS and audio the user imports, plus a built-in Web Audio demo track so the player is exercisable with zero imports. Real transport, seek, volume, and an `AnalyserNode` visualiser. |
| **Settings** | Era switch (triggers a real reboot sequence), wallpaper/desktop pattern, sound volume, display scale, date/time, keyboard repeat. Every control writes through the prefs store. |

### The shell is parameterised the same way

The desktop shell differs more between eras than the windows do — System 1 and
Mac OS 8 have a global menu bar with the Apple menu at the left, Windows 3.1 has
Program Manager with MDI child windows and no taskbar at all, XP has the Start
menu and taskbar, Tiger has a menu bar *and* a Dock, Ledger has a persistent
budget bar.

Rather than six shells, there is one shell driven by a declarative layout in the
skin manifest:

```ts
interface ShellLayout {
  regions: Array<{
    edge: 'top' | 'bottom' | 'left' | 'right'
    kind: 'menubar' | 'taskbar' | 'dock' | 'budgetbar'
    thickness: number
    reservesSpace: boolean      // does it shrink the window work area?
  }>
  launcher: 'apple-menu' | 'start-menu' | 'program-groups' | 'ledger-index'
  desktopIcons: boolean          // Win 3.1: false — Program Manager owned everything
  windowContainment: 'screen' | 'mdi-parent'
}
```

The shell computes the work area from `reservesSpace` regions and hands it to the
WM as a plain rect — so the WM knows the Dock exists only as "the work area is
72px shorter," never as "this is Tiger." Program Manager's MDI containment is the
one structurally different case, and it is expressed as a containment rect on a
parent window rather than as a Win 3.1 branch.

---

## 6. Performance architecture

### 60fps drag — transform only

- Drag state lives in **one preallocated session object**, reused across drags.
- `pointermove` writes two numbers to it and schedules a rAF if one is not
  already pending. It touches no DOM.
- The rAF callback writes `transform: translate3d(x, y, 0)` and returns. No
  closures, no arrays, no objects, no `getBoundingClientRect`, no style reads —
  the frame's geometry is read **once** at drag start.
- Integer-rounded coordinates, and the write is skipped entirely when the
  rounded position has not changed.
- The dragged frame gets `will-change: transform` on drag start and loses it on
  drag end, so we do not permanently hold a compositor layer per window.
- `setPointerCapture` means no document-level fallback listeners and no
  pointer-leaves-window edge cases.

The one unavoidable per-frame allocation is the transform string itself; CSSOM
offers no zero-allocation path (Typed OM's `CSSTranslate` allocates too). I will
state that honestly in the code comment rather than claim zero.

Resize is the same loop, but resize necessarily changes layout — so resizing
writes width/height while dragging writes only transform, and expensive skin
effects (Aqua shadows, backdrop filters) are suppressed under a `.resizing`
class.

### Cold load under 2s on 4G

Slow-4G budget is roughly 1.6 Mbps with 150ms RTT, so 2s means a **~250KB
transfer budget** for the critical path. That budget is what forces skins to be
lazily-loaded chunks:

| Chunk | Target (gzipped) |
|---|---|
| Core (WM + FS + input + shell) | ≤ 60 KB |
| Active era skin (CSS + templates + icons) | ≤ 40 KB |
| Active era font subset (WOFF2, Latin-1) | ≤ 30 KB |
| Each app, on first open | ≤ 20 KB |

Only the active era loads. Icons are inline SVG sprites, or canvas-generated
pattern data URLs for the dithered bitmap eras — no image files on the critical
path. `idb-keyval` is ~600 bytes and is the only runtime dependency.

Phase 1 lands a size-budget check in CI so a regression fails the build rather
than being discovered at the end.

---

## 7. Fidelity: making provenance a type

`CLAUDE.md`: *"Chrome dimensions are measured values, not eyeballed.
Unverifiable value → comment it as unverified rather than inventing a number."*

Rather than trusting comments, every skin ships its metrics alongside a
provenance record that TypeScript forces to be complete:

```ts
type Provenance<T> = { [K in keyof T]: {
  level: 'documented' | 'measured' | 'derived' | 'unverified'
  source: string    // URL or document name
  note?: string     // required when level is 'unverified'
}}

export const XP_METRICS: ChromeMetrics = { titleBarHeight: 28, /* ... */ }
export const XP_PROVENANCE: Provenance<ChromeMetrics> = {
  titleBarHeight: { level: 'measured', source: 'https://…', note: '…' },
  // omitting any key is a compile error
}
```

A test asserts every `unverified` entry carries a `note`. Unverified values are
allowed to exist — inventing one silently is not.

### System 1 — measured, and it corrects two assumptions

Sourced from Apple's own shipped `StandardWDEF.a` assembly listing and
independently corroborated against Executor's clean-room Toolbox
reimplementation. The two agree exactly.

| Metric | Value | Level |
|---|---|---|
| Title bar height | **19px** (21px with a SICN icon) | documented — `minTitleH EQU 19` |
| Frame left / top | 1px black | confirmed |
| Frame right / bottom | **2px effective** (1px frame + 1px shadow) | confirmed |
| Racing stripes | **6**, 1px on / 1px off, rows 4–14, `left+1`→`right-2` | confirmed |
| Title inset | 6px each side; baseline at `top-5` | documented |
| Close box | 11×11 visible, 10px in from left frame line | confirmed |
| Zoom box | **does not exist in System 1** (`documentProc` has none) | documented |
| Minimise / collapse | **does not exist** | documented |
| Grow box | 14×14, bottom-right | confirmed |
| Scroll bar | 16px wide; thumb a **fixed 16×16 square, not proportional** | documented |
| Menu bar | 20px (Roman script) | documented — Inside Macintosh |
| Disabled menu item | gray pattern knocked *out of* drawn text via `notPatBic` | confirmed |
| System font | Chicago 12 | documented |

Two corrections worth flagging now, because both are strong authenticity tells:

- **System 1 windows *did* have a drop shadow** — 1px hard, on the right and
  bottom only, with the right-hand shadow starting 1px below the frame top. That
  produces a characteristic notched top-right corner and an asymmetric frame
  (1px left/top, 2px right/bottom). The common belief that classic Mac windows
  were unshadowed is wrong.
- **Classic Mac scroll thumbs are fixed 16×16 squares.** Proportional thumbs are
  a later Platinum feature. Most web recreations get this wrong.

Also worth knowing: **`system.css` is not a dimensional reference.** Its author
states it was recreated from the HIG by eye, and it is measurably off (24px
Chicago, 22px scrollbars, percentage-based stripes landing on fractional
pixels). It is a fine aesthetic reference and a bad source of numbers. The XP,
Win 3.1 and Tiger tables land in this doc the same way before their skins are
built.

### Windows XP — measured, and it corrects the brief in three places

Sourced from the *Windows XP Visual Guidelines* (Microsoft, 2001), XP.css,
Wine's `user32/uitools.c`, ReactOS's `sysparams.c`, and the Win32 docs.

| Metric | Value | Level |
|---|---|---|
| Caption height | **30px** from the outer top edge | measured — Microsoft's 1:1 figure |
| Luna frame | **4px per side**, as four discrete 1px steps | measured — Microsoft's 1:1 figure |
| Frame colours left, outer→inner | `#0019CE` `#0831D9` `#166AEE` `#0955DE` | measured — XP.css missed the outermost |
| Frame colours bottom | `#0048F2` ×2, `#001EA0` ×2 | measured |
| Top corner arc | 5 rows, x-insets **5,3,2,1,1,0** — not a radius | measured |
| Caption buttons | **21×21**, 2px gap, **2px** gutter to the frame's inner edge (6px from the outer edge; 2px when maximized), 6px down from the caption top and 3px clear of its bottom | measured — "Title Bar Buttons" figure, three real captions, nine buttons |
| Caption button states | four measured 19-row gradients per category; `disabled` contested | measured — "states for Title Bar buttons" specimen sheet |
| Caption font | **Trebuchet MS Bold 10pt** (13.33px @96dpi) | documented |
| UI / menu / dialog font | Tahoma 8pt | documented |
| Active caption gradient | 8 stops, `#0997ff 0%` → `#003dd7 100%` | **contested** — see below |
| Command button | **75×23px**, corner is a **1px indent, not a radius** | documented |
| Button border / text | `1px solid #003c74`, 11px text | measured |
| Classic (unthemed) `SM_CYCAPTION` | 19px | documented |

**Three corrections to the brief**, each of which would have shipped as a
fidelity bug:

1. **"Windows XP is Tahoma 8pt" — only for menus and message text.** The Luna
   *caption* font is **Trebuchet MS Bold 10pt**; floating palettes are a third
   font again, Verdana Bold 8pt. Building captions in Tahoma would be wrong on
   every window in the era.
2. **"3px Luna gradient border" — 3px is right, "gradient" is wrong.** It is
   three discrete 1px colour steps, and the steps differ between the top/left
   and bottom/right edges. Implemented as a CSS `linear-gradient` it comes out
   visibly wrong; it needs six stacked `inset` box-shadows.
3. **"An XP button that doesn't depress-and-shift-1px on mousedown is a bug" —
   that is Windows *classic* behaviour, not Luna.** Luna's `:active` state
   swaps the background gradient and the label does **not** move. The 1px label
   shift is correct for the Win 3.1 and classic-Windows bevel, and wrong for XP.

A fourth correction, for Windows 3.1: **the four-colour 3D bevel does not exist
in 3.1.** `COLOR_3DDKSHADOW` and `COLOR_3DLIGHT` are constants 21 and 22, added
in Windows 95. Windows 3.1 gets a three-colour bevel — black `COLOR_WINDOWFRAME`
outline, 1px `#FFFFFF` highlight, 1px `#808080` shadow over `#C0C0C0` face.

### The primary source arrived, and it overrides two XP.css values

`docs/sources/winxp-luna-metrics.md` is an extraction from the *Windows XP Visual
Guidelines* (Microsoft, August 2001), re-verified against the Controls chapter
served from `raw.githubusercontent.com/windowsdevops/windowsdevops.github.io`.
Where it disagrees with a recreation, it wins.

**Resolved — the command button corner is not a radius.** Microsoft: *"A command
button should typically be 75 pixels wide (50 dialog units) by 23 pixels tall (14
dialog units)"* and *"The curve of a command button is a 1 pixel indent."* The
`radius 3px` above came from XP.css and is that project's reading. Chronos builds
the 1px corner indent.

**Unresolved — the caption gradient.** The eight stops above run `#0997ff` →
`#003dd7`, measured from XP.css. Neither endpoint appears in Microsoft's published
window-frame palette: `#0062EA`, `#14A5F4`, `#081BCB`, `#4977B4`. But Microsoft
explicitly calls its own list a *sample*, because Luna is gradient-heavy and the
running UI carries the full range — so the published set does not disprove the
XP.css stops either. Both are now tagged accordingly, and `luna.msstyles`
`[SysMetrics]` is the one-shot resolution.

**Also documented, and easy to get wrong:**

- **Two disabled grays, separately specified.** Controls use `#A1A192`; menus use
  `#808080`. Disabled *fills* diverge too — text boxes `#EBEBE4`, combo boxes
  `#C9C7BA`. Unifying them would be wrong in both directions.
- **Caption buttons are not a uniform set.** XP's navigation-button colours are
  semantic: red is high-impact, blue is neutral, green starts an action, yellow is
  less severe than red. Close is red *by category*; minimize and maximize are
  blue. That is the actual design rationale rather than a stylistic choice.
- **Radio buttons and check boxes** ship at 13×13, 16×16 and 25×25, and XP only
  ever uses **16×16**, chosen from display DPI.
- **XP needs four faces, not one** — see §7's font table and `docs/fonts/`.

Still missing, and still the reason phase 3's pixel gate needs the figure
extraction: every window-frame dimension. Microsoft states them only as a figure
captioned *"Standard window components in actual size"* — explicitly 1:1, so the
same technique proposed for the Tiger HIG figures applies, on a source that
states its own scale.

Wine's `DrawEdge` also reveals a trap worth encoding once: there are **two**
raised-edge colour mappings. Generic raised panels put `#DFDFDF` outer /
`#FFFFFF` inner on the top-left, while push buttons take the `BF_SOFT` path and
swap them. Recreations that reuse one set of CSS variables for both get panels
wrong. Our bevel primitive will take the variant as a parameter.

### Mac OS X Tiger — controls documented, chrome never published

Sourced from the Tiger-edition *Apple Human Interface Guidelines* (2005-12-06),
which is reachable from here.

| Metric | Value | Level |
|---|---|---|
| Push button height | 20 / 17 / 15px (full / small / mini), excl. shadow | documented |
| Standard OK/Cancel width | 68px | documented |
| Min button spacing | 12 / 10 / 8px | documented |
| Metal (textured) button | 25–32px full — metal chrome runs ~5px taller | documented |
| Segmented control | 25px on metal windows, 20px otherwise | documented |
| Checkbox | 18×18 incl. shadow (full) | documented |
| Text field / search field | 22 / 19 / 15px | documented |
| Pop-up, pop-down, combo | 20 / 17 / 15px |documented |
| Window cascade offset | 20px right, 20px down | documented |
| System font | Lucida Grande Regular 13pt | documented |
| Small / mini system font | Lucida Grande 11pt / 9pt | documented |
| View font (lists, tables) | Lucida Grande 12pt | documented |
| Label font | Lucida Grande 10pt | documented |
| Dock | 48px icons, 128px magnified; **flat 2D shelf in Tiger** | measured |
| Menu bar translucency | **Tiger did not have it** — that is 10.5 Leopard | measured |

**Apple never published the window chrome in prose** — there is no Window, Title
Bar, Scroll Bar or Menu specification section anywhere in the HIG, only figures. The
phase-4 extraction is done, and it found **five more figures** beyond the Figure 13-2
this table originally rested on. Full derivation, the calibration argument and the
list of what remains unknown: [`docs/eras/tiger.md`](eras/tiger.md).

| Metric | Measured | From |
|---|---|---|
| Title bar height | **22px** + a 1px separator (23px to the client area) | six figures |
| Traffic light diameter | **14px** incl. a 1px ring (12px coloured core) | 40+ instances |
| Traffic light spacing | **21px** centre to centre | four figures |
| First light inset from the window's left edge | **9px** | five figures |
| Light inset from the top frame line | **5px** — one pixel **below** centre | fifteen specimens |
| Active title bar gradient | 21 rows, `#F9F9F9` → `#CACACA`, exactly neutral | three specimens agreeing |
| Inactive title bar | nearly flat, ink `#4D5B5F` | Figure 13-19 |
| Window frame | **1px hairline** on left / right / bottom | Figure 13-22 |
| Top corner | a 5-row arc, insets **4,3,2,1,1,0** → a 6px radius | Figure 13-3 |
| Menu bar height | **22px** incl. its 1px `#BDBDBD` rule | Figure 12-12 |
| Menu item height | **19px**; separator slot 12px | Figure 12-11 |
| Menu highlight | `#3262B4`, white text; dimmed ink `#808080` | Figure 12-11 |
| Menu background | a **4px pinstripe**: 2px `#F3F3F3`, 2px `#EFEFEF` | Figure 12-11, proven in a lossless PNG |
| Aqua focus ring | `#C5D5E2` / `#A8C8E2` / `#8ABCE3` outward-in | Figure 7-1 — **lossless PNG** |
| Scroll bar width | **15px**, proportional scroller, arrows together at one end | Figure 13-22 |
| Utility window | 16px title bar, 11px lights on 18px centres | Figure 13-19 |

The scale is argued rather than assumed: Figure 14-1's three push buttons measure
16/22/19px including shadows against documented heights of 15/20/17px "not
including the shadow", so this document embeds 1:1 bitmaps. That argument is now much
stronger — **six separately cropped, separately compressed figures all reproduce the
22px title bar plus its 1px separator**, and Figure 12-12 puts the *menu bar* at the
same 22px, which is what the independent `NSStatusBar.system.thickness == 22` datum
actually describes. Everything stays tagged `measured`; Apple published none of it.

**Two values above correct this table's own earlier entries, and both had one cause.**
`tools/pdf-extract/measure-tiger-window.py` located the window's edges with "the first
step greater than 30 in channel sum", and an Aqua window sits on a soft drop shadow
that ramps in 30-to-40-unit steps — so it stopped on the shadow, three pixels outside
the window, and every inset measured from it came out 3px large. The frame line is the
*largest* step in the row by a factor of five (217 against the shadow's 40). Measuring
from it gives **9px, not 13px**. Separately, the 12px diameter came from a saturation
test that finds only a light's coloured core and cannot see its ring — or a grey light
at all, which is why the disabled state was recorded as unmeasurable. Both scripts are
fixed and carry notes saying what the threshold version cost.

**Figure 13-3 is what made the difference**, and it is the same lesson the Luna
caption-button figure taught: *before recording something as unresolvable, check
whether another figure in the same chapter shows it.* "Title bar buttons for standard
windows" is **fifteen separate embedded bitmaps**, each placed at exactly
`px/pt = 1.000` — 72 DPI, the resolution Mac OS X itself drew at. It is the Tiger
analogue of Microsoft's caption-button specimen sheet, and it settled the lights'
artwork in both the enabled and the disabled state in one pass.

Still unverified, with the cause stated in each case: the traffic lights' **hover,
pressed and glyph artwork** (no figure shows a glyph and no prose describes a
rollover), the **Dock shelf's fill and height** (the figure crops the translucent
shelf onto the white page, so it composited against the paper), and the **window
shadow's full depth** (the crop ends while the shadow is still ramping). The
widely-circulated traffic-light *colours* (`#FF5F57`…) are confirmed **modern macOS
values from CSS clones, not Tiger** — Tiger's close button bodies around `#C1362F`.

**A point is a pixel in this era.** Mac OS X drew at a nominal 72 DPI, so Lucida
Grande 13pt is 13px exactly — the inverse of the Windows trap recorded above, where
8pt at 96 DPI is 10.667px. The rule is unchanged (integer pixels, never `pt` in a
stylesheet, because CSS `13pt` means 17.33px); the conversion is the identity. Checked
against the figures rather than assumed: the menu bar title inks a 10px
caps-and-ascenders band, which 13px predicts and a 96 DPI reading does not.

### The Apple sources arrived, and they close more than expected

`docs/sources/` now carries the Macintosh HIG, the Mac OS 8 Platinum addendum and
the Tiger HIG as PDFs. Searching their prose promotes several values from
`unverified` to `documented`:

| Metric | Value | Source |
|---|---|---|
| Document window title bar | **19px** | Macintosh HIG p162, **restated in the Platinum addendum p103** |
| Utility window drag region | **11px** | Macintosh HIG p162 |
| Utility title bar with text | ≥19px, **25% pattern fill, no racing stripes** | Macintosh HIG p162 |
| Push button height | **20px** | Macintosh HIG p380 |
| Push button text padding | **≥8px each side** | Macintosh HIG p380 |
| Default button ring | **3px black, separated by 1px white** | Macintosh HIG p380 |
| Bevel button spacing in dialogs | ≥12px | Platinum addendum p74 |

Two of these matter beyond their own row. **The 19px title bar is now documented in
Apple's prose twice**, corroborating `StandardWDEF.a`'s `minTitleH EQU 19` — and
because the Platinum addendum restates it, the same value is confirmed for Mac OS 8.
Platinum kept the geometry and changed only the appearance. And the
**default-button ring was recorded above as unverified folklore**; it is not
folklore, it is in Apple's own checklist.

Caveat kept rather than glossed: `macintosh-hig.pdf` is the 1992 edition describing
System 7. The `documentProc` chrome was visually unchanged from 1984 through System
6, so 19px carries back to System 1, but the source is System 7-era.

### The remaining Platinum gap

**Platinum's *appearance* is still unverifiable in this environment.** The Platinum
Appearance chapter of the Mac OS 8 HIG is the authoritative source, and every
mirror of it — `dev.os9.ca`, `preterhuman.net`, `interface.free.fr` — plus
`web.archive.org` is blocked by this sandbox's network policy at the proxy, by
direct fetch and by tool. `developer.apple.com` and `github.com` are reachable,
which is precisely why System 1 came back well-sourced and Platinum did not.

So essentially every Platinum number — title bar height, frame widths, the
pinstripe period and its two grays, the chiselled bevel layer order, the
close/zoom/collapse box geometry, the grayscale palette — is currently
unverified. The existing CSS recreations are not usable as sources: the
best-known one targets Mac OS **9**, not 8, and makes an accuracy claim with no
stated methodology.

Three ways forward, and I would like your call at the phase-4 gate rather than now:

1. **You drop the HIG PDF into the repo** (it is freely available outside this
   sandbox) and I extract the real numbers. Best outcome by far.
2. **Measure from a 1:1 emulator screenshot** — Infinite Mac runs 8.1 in-browser
   at native resolution. Needs a screenshot I can pixel-inspect, which means you
   capturing it or allowing that domain.
3. **Ship Platinum with metrics explicitly tagged `unverified`**, each carrying a
   note naming what is unknown. Honest, and the type system already supports it,
   but it means one of the six eras does not meet the fidelity bar the brief sets.

I am not going to invent plausible Platinum numbers to paper over this. Options
1 and 2 both fully solve it; option 3 is the fallback I would rather not take.

**Windows 3.1 has the same problem, for a different reason.** Its metrics were
runtime values derived from the display driver and were never published as a
table — caption height, frame widths, and the system-menu/minimise/maximise box
dimensions all came from the VGA driver's bitmaps. GUIdebook, toastytech, the
KB mirrors and the archived Petzold scan are all blocked here too. What *is*
solid is the colour scheme, the bevel construction (from Wine's `DrawEdge`), the
Program Manager MDI behaviour, and the GPF dialog wording. What is missing is
the geometry.

The unblock is the same shape: a 1:1 PNG of a Windows 3.1 VGA window that I can
pixel-inspect settles nearly the entire table at once. Same for a
`luna.msstyles` `[SysMetrics]` dump, which would confirm XP's real sizing-border
width and caption-button sizes in one shot.

**What this means for sequencing:** XP is the phase-3 reference implementation
and it is now well enough sourced to build. System 1 is fully sourced. The two
gaps land in phase 4, which is exactly where your review gate already is — so
they do not block starting, and I will bring you a specific list of the values I
need at that gate rather than quietly filling them in.

### The stipple: one mechanism, two vendors, four years apart

The single most surprising measured result in the project, and it is a fact about
**two** eras rather than one, so it lives here rather than in either skin.

**System 1 (Apple, 1984)** draws a disabled menu item by drawing the text normally and
then knocking a 50% gray pattern out of it with `notPatBic` — the pattern is ANDed
against the already-drawn glyph, so the ink is removed in a checkerboard rather than
being replaced with a lighter colour. Sourced from Apple's own shipped `StandardWDEF.a`
listing and corroborated against Executor.

**Windows 3.1 (Microsoft, 1992)** does the same thing, by a different name. `GrayString`
paints a checkerboard of the *background* colour over the drawn glyph. Measured from the
VGA captures and proven by parity rather than by eye: the Run dialog's disabled `OK`
label is 37 ink pixels with **all 37 on one `(x + y)` parity**, while the `Cancel` label
beside it is 140 pixels split 71/69. The same treatment applies to a disabled menu item
and a disabled button label alike.

Two competing vendors, eight years of hardware apart, converged on the identical
construction — and both did so for the same reason: on a 1-bit or 4-bit display there
is no lighter shade of black to reach for, so the only way to say "unavailable" is to
remove half the pixels. Windows 95 abandoned it for a grey fill with a white shadow the
moment 8-bit colour was assumed, which is why nearly every recreation of either era
gets it wrong — they inherit the later treatment.

Three consequences for the build, all load-bearing:

1. **It is why the bitmap eras render at an integer scale.** A one-pixel checkerboard
   at a fractional scale averages into exactly the flat grey it exists to disprove. The
   integer-viewport decision in §1 was made for type crispness; this is the second,
   stronger reason for it.
2. **It cannot be implemented as a colour.** CSS has no way to knock a pattern out of
   live text, so the Win 3.1 skin paints a checkerboard of the background over the
   glyph — which is not a workaround but the actual historical mechanism.
3. **The test asserts the mechanism, not the appearance.** `win31-fidelity.spec.ts`
   applies the same parity discriminator to the rendered output that
   `tools/captures/measure-win31.py` applies to Microsoft's pixels, so the source and
   the implementation are held to one standard. A grey fill fails it; a checkerboard
   passes. System 1's skin will reuse that assertion verbatim.

### Fonts — the substitution table, and one trap

Confirmed: **not one of the eight authentic faces is shippable.** Chicago,
Charcoal, Geneva, Monaco and Lucida Grande are Apple's or Monotype's; Tahoma,
MS Sans Serif and the Windows "System" font are Microsoft's; and Trebuchet MS,
despite being in Core Fonts for the Web, is licensed only as the *original
unmodified installer* — converting it to WOFF2 is both modification and format
conversion, so it falls outside the licence.

| Era need | Substitute | Licence |
|---|---|---|
| Chicago (System 1, OS 8.0/8.1) | **ChicagoFLF** | public domain per Robin Casady |
| Chicago alt / bitmap-truer | ChiKareGo2 | CC-BY (verify deed on download) |
| Geneva 9 (icon labels) | FindersKeepers | free; **terms unconfirmed** |
| Win 3.1 **System** (`SYSTEM.FON`) — the entire era's chrome | **unresolved** — see below | — |
| Win 3.1 MS Sans Serif (`SSERIFE.FON`), unused by our chrome | W95FA | SIL OFL |
| DOS/VGA text (Win 3.1 terminal) | Px437 IBM VGA (Oldschool PC Font Pack) | CC BY-SA 4.0 — see below |
| Tahoma 8/9/11pt (XP system default) | **Source Sans 3** | SIL OFL |
| Trebuchet MS Bold 10pt (XP captions only) | **Cabin** | SIL OFL |
| Verdana Bold 8pt (XP palette captions only) | DejaVu Sans Bold | Vera derivative |
| Franklin Gothic Medium 14pt+ (XP headers only) | **Libre Franklin** | SIL OFL |
| Lucida Grande (Tiger) | DejaVu Sans | permissive (Bitstream Vera derived) |
| Charcoal (OS 8.5+) | **none exists** | — |

**The trap:** 98.css ships a font called "Pixelated MS Sans Serif" whose own
README states it is *a conversion of the original MS Sans Serif* — Microsoft's
actual bitmaps, not a clean-room design. 98.css's MIT licence covers its CSS and
says nothing about the font binaries inside it. `system.css` has the same problem
and additionally ships Apple's Monaco. **We will not inherit a font just because
a popular library does.** W95FA is licensed cleanly — an OFL recreation by Alina
Sava — but it is a recreation of the **Windows 95** MS Sans Serif bitmap, which is
the wrong face for 3.1's chrome and one era too late. Measurement from the VGA
captures settles this: 3.1 draws its captions, menu bar, menu items, dialog labels
and button labels in a *single* face, the bold `SYSTEM.FON`, with 2px stems at a 9px
cap height. MS Sans Serif is the lighter dialog face 3.1 also shipped and our chrome
never uses. The row above therefore splits in two, and the one we need is open.
The metric target is in `docs/sources/win31-metrics.md`.

Two licence nuances I want on the record: the Oldschool PC Font Pack is CC
**BY-SA**, and subsetting produces a derivative that must stay BY-SA and carry
attribution — fine for this project, but it is copyleft, not permissive. And
Luxi Sans, the obvious Lucida Grande relative (same designers), **prohibits
modification**, which blocks subsetting — so DejaVu Sans is the clean choice
despite being a weaker visual match. Tiger and Mac OS 8 both take a real,
unavoidable fidelity loss on type, and I would rather say that now than discover
it at phase 4.

### Pixel-crisp bitmap text: what actually works

Worth stating plainly because most retro projects get this wrong. **There is no
cross-platform CSS property that disables text antialiasing.**
`-webkit-font-smoothing` is macOS-only — a no-op for roughly 90% of users, and
never on the standards track. `image-rendering: pixelated` does not apply to
text at all. `text-rendering: geometricPrecision` affects kerning, not
antialiasing.

What works is structural: **ship pixel-outline fonts — whose glyph outlines are
integer-grid rectangles — and set `font-size` to an exact integer multiple of the
design size.** Every edge then lands on a device-pixel boundary, so the
rasteriser has no partial coverage to smooth. Antialiasing stays on and simply
has nothing to do. This is why W95FA and the Px437 family render hard.

That imposes three rules the bitmap skins must hold, and they interact with the
integer-scaled CRT viewport decision:

- Font sizes are integers, never `rem`-derived fractions.
- The viewport scale factor must be an integer **and** `scale × devicePixelRatio`
  must also be an integer — on a 1.5 DPR display a 2× scale gives 3, fine, but
  the scale picker has to compute this rather than assume.
- Hinting is stripped from the shipped WOFF2; leftover hints fight the grid.

The escape hatch, if a specific surface still won't hold: render that text to a
1x canvas and upscale with `image-rendering: pixelated`, which is
nearest-neighbour by spec. Costs selectable, accessible text — so it is a last
resort, not the default.

Build toolchain is BDF → `bdf2ttf` → `pyftsubset --flavor=woff2`, run once
offline with the result committed. **Build-time only — the zero-runtime-dependency
rule stays intact.** Budget is ~8–20KB per face for pixel fonts, ~30KB for
DejaVu; two faces per era keeps the whole project comfortably inside the
transfer budget in §6.

---

## 8. The 2035 era — **Ledger**

Five eras are archaeology; this one is an argument. It gets an authored spec
sheet — the one place in Chronos where a number is normative because I wrote it
rather than uncertain because I found it.

### What made it necessary: the joule budget

Hardware stopped getting faster around 2029 and started getting cheaper to run.
At the same time on-device inference became the default interaction layer —
every search, every autocomplete, every "what was I doing" is a model call, and
model calls are thermally bounded in a way that spreadsheet math never was.

So the scarce resource stopped being cycles or RAM and became **joules per
hour**. Ledger is the first consumer OS whose primary job is *allocation* rather
than abstraction. It does not hide the machine from you. It bills you for it.

That single premise generates everything below. None of it is a style choice.

### What it deleted: background execution

**Nothing runs when you are not looking at it.** Only the focused window
computes. Everything else is suspended to a bitmap within about 400ms of losing
focus. No background sync, no notifications, no downloads while you work, no
autosave in an unfocused editor.

This is the generational deletion, and it is genuinely painful. An entire way of
working — forty warm tabs, a render going in the background, messages arriving —
simply stops being possible. The people angriest about it are the ones who grew
up assuming a computer keeps its promises while you look away. There is a
jailbreak scene shipping "always-warm" kernel patches, and the community norm is
that running them makes you a freeloader.

The sharpest consequence, and my favourite: **in Ledger, the media player stops
when you click away from it.** Not pauses politely — suspends, mid-bar. That is
not a bug to be worked around in the Ledger skin. It is the entire thesis
arriving at the one app where you cannot ignore it, and it should be exactly as
infuriating as it sounds.

The historical rhyme is the point: **Chronos opens and closes on single-tasking
machines.** 1984 couldn't afford to compute more. 2035 won't.

### What it gets wrong: the cost gutter

Every real OS has a compromise that dates it within five years. Luna had the
Fisher-Price plastic. Aqua had the pinstripe overgloss. Office had the ribbon.

Ledger's is **the cost gutter**: a permanent 40px itemised strip down the right
edge of *every window*, showing joules, model calls and elapsed time as running
ledger lines. It cannot be hidden — it is a regulatory disclosure, not a
preference. It makes every layout in the OS 40px narrower than it wants to be,
it wrecks any document view, and by 2045 it will read exactly as embarrassing as
a beveled gradient toolbar does now.

Title bars carry the same disease: `Letter — 3.1 kJ — 14 min`. Long, ugly,
constantly rewriting itself. And the OS **rounds every cost up** and tells you it
did, in the gutter, every time. Petty and bureaucratic in a way that a real
committee would absolutely have shipped.

Its Clippy is **the Steward** — a budget assistant that interrupts to propose
closing your work and phrases it as a favour. *"You haven't touched Untitled 3
in 20 minutes. Shall I settle it?"* It can be deferred but not disabled, and the
defer control is deliberately the smallest target on screen.

### What it looks like: two-ink thermal

The look is downstream of the premise, and the premise is austerity, so:
**paper white, carbon black, and one amber ink.** Thermal-receipt palette —
institutional, cheap, unglamorous. Tone comes from **ordered (Bayer) dither**,
not from alpha, because low-power display modes quantise. This reuses exactly
the dither machinery System 1 needs.

- **Type is heavy.** Thin strokes do not survive dithering, so Ledger's face is a
  chunky grotesque at generous sizes. The physics picks the type, not taste.
- **Nothing animates.** Transitions cost joules. States *cut*. There is no fade,
  no spring, no easing curve anywhere in the OS.
- **Suspended windows fade like thermal paper.** The longer a window sits
  unfocused, the further it bleaches toward the paper colour and the coarser its
  dither gets. You can read at a glance how long you have ignored something. This
  replaces inactive-title-bar styling with something that carries real
  information.
- **The screen refreshes at 1Hz while you read**, in a visible horizontal band
  like e-ink. Typing forces a burst mode that looks and behaves differently — and
  ticks the gutter. The cursor blinks at 0.5Hz. It is mildly unpleasant. It is
  supposed to be.

  The band honours **`prefers-reduced-motion`** — a media query, not a setting.
  Under reduced motion the refresh band does not sweep; the surface updates
  without the travelling seam. This is an accessibility obligation and it is the
  one thing in Ledger the user does not have to argue with. It is deliberately
  *not* a preference in the OS: **the Steward stays undisableable.** Ledger
  bullies you about joules; it does not bully you about vestibular disorders.
- Windows still overlap, stack, drag and resize. Rationing did not delete
  direct manipulation.

**Paths are ledger entries.** Every node carries a stable entry number, so the
same file the other five eras call `Letter` is `#04412 letter`, and the
hierarchical form is `you/documents/#04412 letter`. The terminal accepts either.

### What this costs the architecture

Ledger is the honesty test, and it is not free — it needs two additions to core,
both of which are era-neutral and only *surfaced* by this skin:

1. `AppInstance.suspend()` / `resume()` — suspend to a bitmap, restore on focus.
   Legitimately useful for every era; only Ledger makes it visible.
2. A render-budget governor in `core/input` that can throttle the rAF loop to a
   target rate. Era-neutral; only Ledger sets it below 60.

Neither is an era conditional, so the invariant holds. If a premise this hostile
to the other five drops into the same `Skin` manifest with only those two
additions, the contract is real.

---

## 9. Sound

Everything synthesised through Web Audio; zero audio files, per the brief.

`core/audio` provides oscillators, `PeriodicWave` for harmonically-rich chime
timbres, ADSR gain envelopes, biquad filters, and an algorithmically-generated
impulse response (exponentially-decaying shaped noise written into an
`AudioBuffer` at runtime) so `ConvolverNode` gives real reverb tails with no
file to download.

Each skin exports **recipes** — chord, register, envelope, timbre — not audio.
Boot chimes, error beeps, menu ticks, window close, trash empty, disk insert.

Techniques that make "no audio files" genuinely workable:

- **Reverb with no impulse-response file.** `ConvolverNode.buffer` is just an
  `AudioBuffer`; nothing requires it to come from a file. Fill one with white
  noise shaped by an exponential decay envelope and you get a convincing hall.
  Built once at init and cached — never inside a playback path, per the
  no-allocation rule.
- **Chorus** — two or three parallel `DelayNode`s at 15–35ms whose `delayTime` is
  modulated by slow sine oscillators, voices detuned ±3–8 cents. This is what
  makes a struck-chord chime sound "fat" rather than synthetic.
- **Timbre** via `createPeriodicWave` rather than raw oscillator types — it is
  band-limited, so no aliasing on high partials.
- **Brass character** comes from enveloping a lowpass `frequency` upward during
  the attack, far more than from the waveform choice.

**On reproducing the real sounds — the risk is not the one people expect.** US
law is unusually clear that a sound-recording copyright does *not* extend to an
independent fixation that merely imitates it, so synthesising from oscillators
does not infringe the recording. Composition copyright still applies. But the
actual exposure is **trademark**: Apple registered the startup chime as a US
sound mark in December 2012 in International Class 009 — computer hardware,
software and operating systems, which is precisely this product's category. A
sound mark has no de-minimis defence and no fair-use-by-length.

So my recommendation, concretely: **synthesise era-characteristic originals** —
keep the grammar (soft-attack chorused reverberant struck chord for the Mac
eras; two-hit fanfare for Windows 3.1; rising pad swell for XP) and change the
content: different root, different voicing, no signature detune. Name them
`chime-era4.ts`, never "Mac startup chime" — naming is what converts homage into
a claim of source. The one thing worth reproducing exactly is the **1984
Macintosh beep: a 600Hz square wave**, generated in software on the 6522 VIA.
That is a fact about a circuit, not expression, and it is safe.

*(Correcting my own earlier note: the XP startup sound is by Bill Brown and Tom
Ozanich, 2001. Brian Eno wrote the Windows 95 sound.)*

---

## 10. Failure states — reachable, not decorative

Windows 3.1 GPF dialog, XP bluescreen, Sad Mac with the death chime. Reachable
three ways, so they are part of the system rather than an easter egg:

1. **Genuinely**, via an app-level error boundary — an unhandled exception inside
   an app instance routes to the active era's failure state, carrying the real
   error. This is the actual error-handling strategy, not a simulation.
2. **Deliberately**, via the terminal's `crash` command.
3. **Systemically**, via the storage-quota path when IndexedDB is full.

Each failure state is era-correct in text, font, colour and recovery path, and
each has a real way out: XP's bluescreen reboots into the boot sequence, the GPF
dialog closes the offending app and leaves the rest of the session alive.

---

## 11. Build order and verification gates

Following the brief's order. Each phase ends with evidence and a stop for go-ahead.
Phases 1–3 landed on `claude/new-session-aej4gm`; from phase 4 the convention is one
branch per era, `era/<id>`, each merging to `main`. See §13 for what is merged.

| # | Phase | Gate — what I show you |
|---|---|---|
| 1 | WM + focus model, one era, unstyled boxes | A Chrome Performance trace over a 10-second drag with 20 windows open showing frame times under 16.7ms and a flat allocation profile. Plus the invariant tests and the size budget check, both green from day one. |
| 2 | FS layer + persistence | A scripted reload-survival test: create a tree, write files, reload, assert byte-identical. Plus two file manager windows proving live sync through `fs.watch`. |
| 3 | **Windows XP at full fidelity** — the reference implementation | Pixel comparison against the 1:1 references in `docs/sources/`; all five states on every control; the full metrics table with provenance; keyboard-only operation of the entire shell. **Two hard preconditions, both before phase 3 starts** — see below. |
| 4 | The other five eras against that contract | Same evidence per era. Any core change required by a later era is a contract bug and gets fixed in core, not patched in the skin, and is reported rather than absorbed. **Windows 3.1 done and merged**; System 1, Mac OS 8, Tiger and Ledger remain — order and rationale in §13. Four contract additions so far, listed in §13. |
| 5 | Apps | Each app exercised end-to-end: Paint writes a PNG that Files shows with the right icon and Media opens; Editor's guard blocks a close; Terminal manipulates the real tree. **Plus: every app survives `suspend()`/`resume()` with state intact** — Paint's undo stack, the editor's cursor and selection, the terminal's scrollback. Verified per app, not asserted. |
| 6 | Sound, failure states, boot sequences | Each chime and each failure path triggered and verified. |

### Phase 3 preconditions

Phase 3 does not start until both are satisfied. XP is the reference every other
era is measured against; starting it on unresolved inputs would poison all six.

1. **The XP substitute faces are named and shown — done, awaiting sign-off.**
   XP uses **four** faces and none is redistributable. The rendered comparison is
   in [`docs/fonts/`](../docs/fonts/README.md) with one sheet per face, drawn at
   the integer pixel sizes Windows actually rasterised at and magnified 4x from the
   1x bitmap. Franklin Gothic Medium → Libre Franklin and Verdana Bold → DejaVu
   Sans Bold are agreed. Tahoma → Source Sans 3 and Trebuchet MS Bold → Cabin need
   sign-off; the Tahoma row is ranked against an objective target extracted from
   Wine's Tahoma metric substitute.
2. **The 1:1 references are in `docs/sources/`.** Pixel comparison is the gate,
   and a gate needs a reference. Expected: the Platinum HIG, a 1:1 Windows 3.1
   VGA screenshot, and a 1:1 XP Luna screenshot. These also close the two
   verification gaps in §7 — the Platinum HIG converts Mac OS 8 from
   mostly-`unverified` to measured, and the Win 3.1 capture does the same for its
   geometry.

Final acceptance is the brief's own: boot into any era, create files, open apps,
drag and resize and stack windows, right-click anything, run it entirely from the
keyboard, close the tab, reopen, and find the work exactly where it was.

---

## 12. Conflicts I am flagging rather than silently resolving

`CLAUDE.md` says to flag conflicts instead of simplifying. Four are real, and I
have a recommendation for each — none blocks starting phase 1.

1. **System 1 had no application switching and no minimise.** It was
   single-tasking; MultiFinder arrived in 1987. The brief wants Alt+Tab and an
   era-correct minimise everywhere. *Recommendation:* System 1 gets multiple
   Finder-style document windows (authentic) with window cycling on a
   Chronos-neutral chord, and simply omits the minimise button rather than
   inventing one. Documented as a knowing anachronism.

2. **System 1, Mac OS 8 and Windows 3.1 had no terminal** in the modern sense.
   Win 3.1 shipped an MS-DOS Prompt, and classic Mac had MPW Shell as a
   developer tool. *Recommendation:* Win 3.1's terminal is the MS-DOS Prompt
   (fully authentic), the classic Mac eras get an MPW-Shell-styled window
   (defensible), and System 1 gets the same shell labelled as the one deliberate
   anachronism in the project.

3. **Three of the brief's own fidelity claims are wrong** — the XP caption font,
   the Luna border being a gradient, and the XP button 1px depress. All three
   are documented with sources in §7. I am building to the verified values, not
   to the brief, and calling it out here rather than silently diverging. If you
   want the brief's version instead in any of the three cases, say so and I will
   build that — but I would be shipping something I can show is wrong.

4. **Two eras cannot currently be built to the fidelity bar** — Mac OS 8 and
   Windows 3.1, per §7. Not a blocker for phases 1–3; a decision needed at the
   phase-4 gate.

---

## 13. State of play — read this first

Written for a session that has none of the preceding conversation. Everything below
is fact about the repository as it stands, not plan.

### Where the work is

| Branch | Contents | Status |
|---|---|---|
| `main` | phases 1–3, Windows 3.1, Mac OS X Tiger | the trunk; every era branch merges into it |
| `claude/new-session-aej4gm` | phases 1–3 (WM, FS, Windows XP Luna) | **merged to `main`** |
| `era/win31` | Windows 3.1 | **merged to `main`** via pull request #1 |
| `era/tiger` | Mac OS X Tiger | **merged to `main`** |

Branch the next era off `main`, not off any merged branch. The convention is
`era/<id>`, one per era, each merging back to `main`: `era/system1`, `era/macos8`,
`era/ledger`.

**Order, and why.** Windows XP first because it is the reference implementation.
Windows 3.1 second because it had 1:1 captures and is XP's closest structural sibling,
so it stress-tested the contract cheaply. Tiger third because it is the first era whose
*shell* is more than a desktop — a menu bar and a Dock, both reserving space — so it
was the one that forced §5's `ShellLayout` to exist rather than remain a design.
Remaining: **System 1 and Mac OS 8**, on the Apple prose in §7; both are substantially
sourced, and both inherit Tiger's shell regions for their own menu bars. Then **Ledger**
last, because it is the era most hostile to the contract and the only one that needs
`suspend()`/`resume()` to be visible and the render-budget governor to exist.

### Test counts, so a regression is obvious

`npm test` runs all three suites. As of the Tiger merge: **171 green** — 11 invariant,
7 budget, 153 browser. The browser suites are `wm`, `a11y`, `fs`, `perf`,
`xp-fidelity` (28), `win31-fidelity` (20) and `tiger-fidelity` (34).

The fidelity suites each assert `window.__chronos.era` in a `beforeEach`. Without that a
suite passes vacuously against whichever era is default, which is how four suites
silently tested XP when XP became the default in phase 3.

### The contract additions phase 4 has made so far

Seven, all era-neutral. §11 says a core change a later era demands is a contract bug to
be fixed in core rather than patched in the skin; these are the record of that happening.
Items 5–7 came from Tiger and are the reason `era/system1` and `era/macos8` should rebase
onto `main` before building their menu bars — all three are things a Mac shell needs.

1. **`ChromeMetrics.cornerTop` is a discriminated union**, not a number.
   ```ts
   cornerTop:
     | { readonly kind: 'radius'; readonly px: number }
     | { readonly kind: 'steps'; readonly insets: readonly number[] }
   ```
   Because XP's top corner is not a radius: Microsoft's 1:1 figure shows a five-row arc
   with per-row x-insets `5,3,2,1,1,0`, which no `border-radius` reproduces. XP declares
   `steps` and clips to them; Windows 3.1 declares `radius: 0` because 3.1 frames are
   rectangles. An era with a genuine radius says so. A test asserts the rendered
   `border-radius` is literally `0px` alongside the `clip-path`, so a regression to a
   radius fails rather than looking close.

2. **`src/core/motion.ts`** owns the reduced-motion query. `prefersReducedMotion()` and
   `onReducedMotionChange()`. The window manager does **not call** a skin's
   `minimizeTo`/`restoreFrom` at all when the query matches, so honouring the obligation
   is not something a skin can forget — it was four copies of the same `matchMedia`
   across two chrome renderers, on the way to twelve. Skins may read it for their own
   effects; none is required to. Ledger's 1Hz refresh band needs
   `onReducedMotionChange` rather than the point-in-time read, because a running timer
   has to stop when the query flips, not merely start suppressed.

3. **`suspend()`/`resume()` exist on the window manager** and set `data-suspended` on the
   frame. `WindowState.suspended` is in the contract and `Change.Suspended` is in the
   change mask. Every skin styles it (XP and 3.1 both dim the content); only Ledger will
   make it load-bearing, bleaching a window further the longer it sits unfocused. The
   phase-5 gate is that every *app* survives the round trip with state intact — Paint's
   undo stack, the editor's cursor and selection, the terminal's scrollback — verified
   per app, not asserted.

4. **The render-budget governor does not exist yet.** It is the one §8 addition still
   outstanding, and it is Ledger's alone: a way to throttle the rAF loop to a target rate
   below 60. Era-neutral by construction — it belongs in `core/input`, and only Ledger
   sets a rate below 60. Build it when Ledger is built, not before.

5. **`SkinManifest.regions` — edge-anchored shell chrome.** §5's `ShellLayout`, finally
   implemented, because Tiger is the first era whose shell is more than a desktop.
   ```ts
   interface ShellRegion {
     edge: 'top' | 'bottom' | 'left' | 'right'
     kind: string            // 'menubar' | 'taskbar' | 'dock' | 'budgetbar'
     thickness: number
     reservesSpace: boolean
     mount(host: HTMLElement, api: ShellRegionHost): (() => void) | void
     minimizeTarget?(id: WindowId): Rect | null
   }
   ```
   The shell builds each element, positions it from `data-edge` in `base.css`, sums the
   reserving ones and hands the window manager a plain rect — so the WM knows a Dock
   exists only as "the work area is 68px shorter". Regions live **inside** the desktop
   element, so they sit inside the display transform and a 512×342 era's menu bar scales
   with its integer-scaled viewport instead of floating beside it. An era with no shell
   chrome declares no regions; Windows 3.1 had no taskbar and says so by omission.

   Two traps this exposed, both now handled in the shell and both worth knowing before
   adding a region: **reservations accumulate**, so use `Shell.addReservedEdges()` rather
   than writing the display's reserved edges directly — the harness status strip did the
   latter and silently erased Tiger's menu bar and Dock from the work area. And a region
   element is offset by the *other* claims on its edge, or the work area is right while
   the pixels overlap.

6. **`WindowManager.setMinimizeTarget(fn)`.** §2 requires an era-correct minimize target
   — "XP shrinks toward the taskbar button, Tiger genies to the Dock" — and neither is
   knowable by the window manager: only the Dock knows where a given window's tile ended
   up, and tiles move as windows open and close. So the WM asks, per window, at minimize
   time, and falls back to the work area's bottom-left corner when nothing answers. It
   never learns *why* the rect is where it is. XP's taskbar will use the same hook.

7. **`MenuController.subscribe(fn: (open: boolean) => void)`.** A menu bar highlights the
   title whose menu is open, and a menu closes by six routes the bar never sees: Escape,
   activating an item, a click on the desktop, a click on a window, losing the capture
   layer, or another menu opening. Without the notification the highlight goes stale after
   every one of them. Era-neutral — the Windows eras render their menu bar inside a window
   and have the identical problem.

Also worth knowing, though they are shell rather than core:

- **`src/shell/base.css`** holds every structural rule that must be true in every era —
  frame positioning and `contain`, the title bar's `touch-action`/`user-select`, resize
  handle positioning, handle suppression on non-resizable and maximized windows,
  pointer-event suppression mid-gesture, shell-region positioning keyed off `data-edge`,
  and the overlay z-index constants `--layer-region` / `--layer-switcher` /
  `--layer-menu`. Before writing a rule into a skin, ask whether a
  skin that omitted it would be wrong. Seven tests in `wm.spec.ts` assert all of it
  against the contract vocabulary, so they hold for a new era without being rewritten.
- **Menus carry `data-menu`, `data-menu-item`, `data-menu-separator` and
  `data-menu-submenu`.** The vocabulary table in `core/wm/types.ts` is the reference. A
  new skin's menu renderer must emit them; `win31-fidelity.spec.ts` and `wm.spec.ts` both
  assert the active skin does.
- **`src/shell/display.ts` exposes `scale()`.** The bitmap eras render in a fixed logical
  viewport at an integer scale, and a fidelity test that measures a one-pixel pattern has
  to convert device pixels back to logical ones.
- **`skin.generatedProperties()` is written on the shell root, not on `.desktop`.**
  Custom properties inherit, and menus, the switcher and every overlay are hosted on the
  root — *outside* the desktop element. Writing them on the desktop leaves every overlay
  with undefined variables, and the failure is silent and total: Tiger's first menu
  rendered with no background, no border colour, the browser's default serif at 16px and
  a 0px separator. The two Windows skins had masked it by *also* declaring every variable
  in a `:root` block, which means each measured value existed twice in the tree — exactly
  what generating them was meant to prevent. Those duplicate `:root` blocks can now go.
- **Era selection is `?era=<id>`** in `src/main.ts`, which holds an `ERAS` registry of
  thunks so Vite emits one chunk per era and the browser fetches exactly one.
  `main.ts` is the only module that names an era; the invariant test enforces that by
  grepping `core/`, `apps/` and `shell/` for era identifiers. Adding an era is adding one
  line to that registry. `window.__chronos.era` is exposed so a fidelity suite can assert
  it is testing the era it thinks it is — without it, a suite passes vacuously against
  whichever era is default.

### Fonts are resolved for the three built eras

The scrutiny sheets, the substitution table with its stated losses, and the metric
targets all live in **[`docs/fonts/`](../docs/fonts/README.md)**. Source faces are
committed there too, so a subset can be rebuilt without a network fetch.

| Era | Need | Substitute | Licence | Stated loss |
|---|---|---|---|---|
| Windows XP | Tahoma 8/9/11pt | Source Sans 3 | OFL | ~3% narrow, the safe direction |
| Windows XP | Trebuchet MS Bold 10pt, captions only | Cabin Bold | OFL | **single-storey `g`** — the face's signature, permanent |
| Windows XP | Verdana Bold 8pt, palettes only | DejaVu Sans Bold | Bitstream Vera | deferred; not on the critical path |
| Windows XP | Franklin Gothic Medium 14pt+, headers only | Libre Franklin | OFL | deferred; direct revival |
| Windows 3.1 | `SYSTEM.FON` — the whole era | **Pixel Operator Bold @ 16px** | CC0 | advances diverge per glyph; 2px descender against 4px |
| Mac OS X Tiger | Lucida Grande, 13/12/11/10/9pt — the whole era | **DejaVu Sans** | Bitstream Vera | ±6.3% against Apple's own rasterisation; narrower, rounder face; **bold deferred** |

Two things about the 3.1 row that a fresh session will otherwise rediscover the hard
way. **W95FA is not a candidate** — it is an OFL recreation of the *Windows 95* MS Sans
Serif bitmap, so it is the right licence and the wrong face, one era late; 3.1's chrome
is `SYSTEM.FON` throughout and MS Sans Serif is a separate face 3.1 shipped that our
chrome never touches. And **`PixelOperatorSC-Bold` is small caps, not semi-condensed** —
`Cancel` comes out at 48px rather than 44. Not a candidate.

The gate for a new era's font is unchanged and it is a hard one: name a specific face,
show a rendered comparison at the sizes the era actually uses, and only then build
chrome that depends on it. `tools/font-compare/win31-system.mjs` is the pattern — it
records each candidate's verdict and reason so the rejections stay reviewable. Note the
structural failure mode it found: a pixel font designed on a different cell steps its
cap height 8, 10, 12 … and simply has no size that yields 9, which rules out a whole
class of candidate regardless of width.

### The perf gate measures our code, not the host

This changed, and a fresh session reading the old assertions would draw the wrong
conclusion from a red gate.

**Asserted** (all held across two container generations):

- `ScriptDuration / frames < 3ms` under 4× CPU throttling. Measured 0.55–0.69ms.
- `LayoutDuration / frames < 0.5ms`. Measured 0.001ms.
- One style recalculation per frame, `LayoutCount` bounded, median interval at vsync,
  `longTasks === 0`, retained heap delta bounded.

**Reported as diagnostics only, never asserted**: `p95`, `p99`, `over50`, frame count.

The reason is in `test/browser/perf.spec.ts` at length. Briefly: the container does not
guarantee the renderer 60Hz of CPU, and the identical 4×-throttled drag reported p99
16.80ms on one container generation and 50.00ms on the next from an unchanged bundle,
with `longTasks=0` and `layouts=1` in both — reproduced on the commit before that day's
work, which is what established it as the host. Asserting a percentile was measuring the
scheduler.

One discarded instrument is worth not re-inventing. "Every long frame interval must be a
whole multiple of the vsync period" looks like the exact discriminator between a frame
the host skipped and one we delayed. It is useless: the compositor delivers rAF only on
vsync boundaries, so every interval is a multiple whichever caused it. Verified by
injecting a deliberate 7ms block per frame and measuring zero off-grid intervals. Test
that a new instrument *can* fail before trusting it.

### What is still open

None of these blocks an era, and each is recorded with notes rather than guessed at.

1. **`luna.msstyles` `[SysMetrics]`** would settle three XP values in one file: the
   caption gradient colours, the disabled caption-button artwork, and the real sizing
   border width. All three are tagged `contested` with the evidence for why, in
   `src/skins/winxp/metrics.ts`.
2. **A Windows 3.1 capture with the mouse held down on Cancel** would settle whether a
   3.1 push button's label shifts 1px on depress, and would confirm or refute the
   dialog frame's measured 3px-versus-4px top asymmetry. The capture taken to settle the
   depress question shows a *disabled* OK button — 3.1 greys OK until the Run dialog's
   command line has content — so it gave the disabled state and left this open. The
   stylesheet deliberately does not move the label, so the unverified behaviour is
   absent rather than invented.
3. **A 1:1 Tiger screenshot** would settle three things at once: the traffic lights'
   hover and pressed artwork and their glyphs — Apple's fifteen-state specimen sheet
   shows no glyph in any state and the prose never describes a rollover — plus the Dock
   shelf's fill and height, which the source figure composited against the white page.
   All are tagged in `src/skins/tiger/metrics.ts`, and `docs/eras/tiger.md` §11 lists
   them with what each would resolve.

### The tools, and what each is for

| Path | Purpose |
|---|---|
| `tools/pdf-extract/find-figures.py` | locates figure captions in a source PDF and reports embedded bitmap sizes |
| `tools/pdf-extract/measure-xp-window.py` | the "actual size" Luna window figure |
| `tools/pdf-extract/measure-xp-titlebars.py` | the caption gradient, per-row median |
| `tools/pdf-extract/measure-xp-capbuttons.py` | caption button geometry and the four state faces |
| `tools/pdf-extract/measure-tiger-window.py` | Tiger Figure 13-2 |
| `tools/pdf-extract/measure-tiger-titlebuttons.py` | Tiger Figure 13-3 — fifteen 1:1 specimens; the traffic lights' artwork |
| `tools/pdf-extract/measure-tiger-chrome.py` | Tiger Figures 13-19, 13-22, 12-11, 12-12, 10-1 and 7-1 |
| `tools/font-compare/tiger-lucida.mjs` | Lucida Grande substitute, against Apple's own 13px ink widths |
| `tools/captures/measure-win31.py` | all three Windows 3.1 VGA captures, including the stipple parity proof |
| `tools/font-compare/build.mjs` | renders candidate faces against a metric target |
| `tools/font-compare/win31-system.mjs` | the 3.1 System font candidate verdicts |

Extraction rules that cost real time to learn are in `CLAUDE.md` under "Figure
extraction and measurement" — chiefly: extract the image XObject, never rasterise the
page; a figure's page-placement scale says nothing about its bitmap scale; calibrate
against a value already measured elsewhere in the same document; and a JPEG-derived hex
value is `measured`, never `documented`.

---

## 14. Verification

Runnable from the repo root. `npm test` runs everything that exists.

```
npm run typecheck         # strict TS, no emit
npm run test:invariants   # era leakage, persistence leakage, transform-only, no-TODO
npm run test:budget       # per-chunk gzipped size budget (builds first)
npm run test:wm           # window manager behaviour, real browser input
npm run test:fs           # reload survival, atomicity, watch, trash, path codec
npm run test:a11y         # keyboard reachability of every command, focus, reduced motion
npm run test:perf         # the 60fps drag gate under 4x CPU throttling
npm test                  # all of the above
```

Browser tests need Chromium; this environment's pre-installed build is wired up
in `playwright.config.ts` and can be overridden with `CHRONOS_CHROMIUM`.

Manual gates per phase are in the table in §11. I will not report a phase as
working without having run it.

**First action on approval:** this document is committed to the repo as
`docs/ARCHITECTURE.md` — it is a living contract, not a one-off, and the
measured tables, the provenance records and the flagged conflicts all belong
under version control next to the code they govern. `CLAUDE.md`'s mistake log
gets an entry for each brief-correction in §7 and §12, per its own instruction
that corrections become permanent rules.
