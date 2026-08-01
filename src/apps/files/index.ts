/**
 * The Files app.
 *
 * Three things govern every decision in this file.
 *
 * **It knows core and nothing else.** No era identifier appears anywhere here and
 * `test/invariants.test.js` enforces that mechanically. Everything era-shaped
 * arrives as data: names come from `PathCodec`, controls come from `UiKit`, the
 * collision suffix comes from `NameDecorator`, and dialogs come from the window
 * handle. There is not one conditional on which era is running, and there is no
 * way for this file to find out.
 *
 * **It holds no duplicate state.** The filesystem is the single source of truth,
 * so the app renders from `fs.list`/`fs.stat` reads and re-renders on `fs.watch`.
 * Nothing here caches a name, a size or a child list. Two Files windows on one
 * folder stay in step because neither knows the other exists — the same invariant
 * phase 2 was gated on.
 *
 * **It survives suspend and resume with state intact**, which is phase 5's gate.
 * See `suspend()` for what that costs, and `test/browser/files.spec.ts` for the
 * test that fails if it stops being true. The subtle half is not the folder or
 * the selection — those are plain fields — it is the state that lives in the DOM:
 * the scroll offset, and a rename the user is in the middle of typing. Both are
 * captured on the way down, because resume re-reads the filesystem and rebuilds
 * every row, which would otherwise throw them away.
 */

import type {
  AppHost,
  AppInstance,
  AppModule,
} from '../../core/app/types.js'
import type { FsNode, NodeId } from '../../core/fs/types.js'
import { isDir } from '../../core/fs/types.js'
import { isFsError } from '../../core/fs/errors.js'
import { asAppId } from '../../core/wm/types.js'
import type { MenuSpec } from '../../core/input/menu.js'
import type { HitTarget } from '../../core/input/dispatcher.js'
import type {
  ButtonWidget,
  ListColumn,
  ListRow,
  ListWidget,
  TextFieldWidget,
} from '../../core/ui/kit.js'
import { formatDate, formatKind, formatSize, glyphFor, splitName } from './format.js'
import { propertiesDialog } from './properties.js'

/** Icon, list and details, as §5 asks for. */
export type ViewMode = 'icon' | 'list' | 'details'
export type SortKey = 'name' | 'size' | 'kind' | 'modified'

/**
 * A rename the user is part-way through.
 *
 * Kept as data rather than only as a live text field, because the field is
 * destroyed and rebuilt by every re-render — including the one `resume()` does.
 * The caret positions are part of it: a rename that comes back with the text
 * intact and the cursor at the start is not "state intact".
 */
interface RenameState {
  id: NodeId
  value: string
  selStart: number
  selEnd: number
}

const DETAIL_COLUMNS: readonly ListColumn[] = [
  { key: 'name', label: 'Name' },
  { key: 'size', label: 'Size', width: 78, align: 'end' },
  { key: 'kind', label: 'Kind', width: 96 },
  { key: 'modified', label: 'Modified', width: 132 },
]

const NAME_COLUMN: readonly ListColumn[] = [{ key: 'name', label: 'Name' }]

/** Past this many pixels a press becomes a drag rather than a click. */
const DRAG_THRESHOLD = 4

class FilesApp implements AppInstance {
  private readonly host: AppHost

  // ---- view state. All of it survives suspend/resume; see `suspend()`.
  private cwd: NodeId
  private view: ViewMode = 'list'
  private sortKey: SortKey = 'name'
  private sortAscending = true
  private rename: RenameState | null = null
  private scrollOffset = 0

  // ---- live rendering machinery, rebuilt freely
  private nodes: FsNode[] = []
  private unwatch: (() => void) | null = null
  private suspended = false
  /** Guards against overlapping renders when events arrive during a read. */
  private renderToken = 0
  private destroyed = false

  private readonly list: ListWidget
  private readonly locationLabel: HTMLElement
  private readonly statusEl: HTMLElement
  private readonly buttons: Record<string, ButtonWidget> = {}
  private readonly viewButtons: Partial<Record<ViewMode, ButtonWidget>> = {}
  private renameField: TextFieldWidget | null = null
  /** True while the app is tearing the rename editor down itself. */
  private renameTeardown = false

  // ---- drag-to-move
  private dragCandidate: { id: NodeId; x: number; y: number; pointerId: number } | null = null
  private dragging = false
  private dropTarget: NodeId | null = null

  constructor(host: AppHost, startAt?: NodeId) {
    this.host = host
    this.cwd = startAt ?? host.fs.root()

    const { ui, root } = host
    root.dataset['app'] = 'files'

    const toolbar = ui.toolbar()
    this.buttons['up'] = ui.button({
      label: 'Up',
      title: 'Go to the enclosing folder',
      onActivate: () => void this.goUp(),
    })
    this.buttons['newFolder'] = ui.button({
      label: 'New Folder',
      title: 'Create a folder here',
      onActivate: () => void this.newFolder(),
    })
    this.buttons['rename'] = ui.button({
      label: 'Rename',
      title: 'Rename the selected item',
      onActivate: () => this.beginRename(),
    })
    this.buttons['moveTo'] = ui.button({
      label: 'Move To',
      title: 'Move the selection to another folder',
      onActivate: () => void this.moveToChosenFolder(),
    })
    this.buttons['trash'] = ui.button({
      label: 'Trash',
      title: 'Move the selection to the Trash',
      onActivate: () => void this.trashSelection(),
    })
    this.buttons['restore'] = ui.button({
      label: 'Put Back',
      title: 'Restore the selection to where it came from',
      onActivate: () => void this.restoreSelection(),
    })
    this.buttons['delete'] = ui.button({
      label: 'Delete',
      title: 'Delete the selection permanently',
      onActivate: () => void this.deleteSelection(),
    })
    this.buttons['properties'] = ui.button({
      label: 'Properties',
      title: 'Show information about the selection',
      onActivate: () => void this.showProperties(),
    })
    for (const key of [
      'up',
      'newFolder',
      'rename',
      'moveTo',
      'trash',
      'restore',
      'delete',
      'properties',
    ]) {
      const b = this.buttons[key]
      if (b) toolbar.body.appendChild(b.el)
    }

    /*
     * The three view modes, as an exclusive set of toggle buttons.
     *
     * Buttons rather than radios, and not as a concession to one era: every one of
     * the six shipped its view switch as toolbar buttons or as a menu, never as a
     * radio column. A radio would also have been actively wrong in the 1-bit era —
     * its mark is a circle, `border-radius` antialiases, and the result is grey in
     * an era whose whole thesis is that it has none.
     */
    const viewGroup = host.root.ownerDocument.createElement('div')
    viewGroup.dataset['uiRole'] = 'viewmodes'
    for (const mode of ['icon', 'list', 'details'] as const) {
      const label = mode === 'icon' ? 'Icons' : mode === 'list' ? 'List' : 'Details'
      const button = ui.button({
        label,
        title: `Show items as ${label.toLowerCase()}`,
        pressed: mode === this.view,
        onActivate: () => this.setView(mode),
      })
      button.el.dataset['viewMode'] = mode
      this.viewButtons[mode] = button
      viewGroup.appendChild(button.el)
    }
    toolbar.body.appendChild(viewGroup)

    const location = ui.label({ text: '' })
    location.el.dataset['uiRole'] = 'location'
    this.locationLabel = location.el

    this.list = ui.list({
      label: 'Folder contents',
      layout: 'rows',
      columns: NAME_COLUMN,
      multiSelect: true,
      onSelectionChange: () => void this.refreshControls(),
      onActivate: (id) => void this.activate(id as NodeId),
      onSortColumn: (key) => this.setSort(key as SortKey),
    })

    const status = ui.statusBar()
    this.statusEl = status.el

    root.append(toolbar.el, this.locationLabel, this.list.el, this.statusEl)

    this.list.el.addEventListener('pointerdown', (e) => this.onDragPointerDown(e))
    this.list.el.addEventListener('pointermove', (e) => this.onDragPointerMove(e))
    this.list.el.addEventListener('pointerup', (e) => void this.onDragPointerUp(e))
    this.list.el.addEventListener('pointercancel', () => this.cancelDrag())
    this.list.el.addEventListener('scroll', () => {
      if (!this.suspended) this.scrollOffset = this.list.scrollOffset()
    })
    // F2 renames, which is the one keystroke both Windows eras used and which no
    // other surface here claims. Escape cancels a rename before anything else sees it.
    this.list.el.addEventListener('keydown', (e) => {
      // Only when the list itself has focus: F2 typed inside the rename editor
      // this opened would otherwise restart the rename it is in the middle of.
      if (e.key === 'F2' && e.target === this.list.el) {
        e.preventDefault()
        this.beginRename()
      }
    })
  }

  // ------------------------------------------------------------------ lifecycle

  async start(): Promise<void> {
    this.rewatch()
    await this.render()
  }

  /**
   * Stop computing, keep every piece of state.
   *
   * Two things are dropped and both are genuinely *work*: the filesystem watch,
   * which is the app's only way of doing anything while nobody is looking at it,
   * and any drag in progress, because a gesture cannot span a suspension — the
   * pointer that started it is long gone.
   *
   * Everything else is captured rather than dropped. The scroll offset and the
   * in-progress rename live in the DOM, and `resume()` re-reads the filesystem and
   * rebuilds every row, so a rename half-typed at the moment of suspension would
   * be destroyed by the very re-render that brings the window back. Reading them
   * out here is what makes the round trip lossless rather than merely quiet.
   */
  suspend(): void {
    if (this.suspended) return
    this.suspended = true

    this.scrollOffset = this.list.scrollOffset()
    this.captureRename()
    this.cancelDrag()

    this.unwatch?.()
    this.unwatch = null
  }

  /** Resume, re-read once because the folder may have changed while stopped. */
  resume(): void {
    if (!this.suspended) return
    this.suspended = false
    this.rewatch()
    void this.render()
  }

  /** True while suspended. The browser suite asserts the round trip, not the flag. */
  isSuspended(): boolean {
    return this.suspended
  }

  destroy(): void {
    this.destroyed = true
    this.unwatch?.()
    this.unwatch = null
    this.renameTeardown = true
    this.renameField?.destroy()
    this.renameField = null
  }

  canClose(): boolean {
    // Files writes through on every action, so there is never unsaved work. A
    // rename in progress is not unsaved work: abandoning it changes nothing.
    return true
  }

  // ---------------------------------------------------------------------- menus

  /**
   * The app's menus, for an era that renders a menu bar.
   *
   * **No accelerators.** DECISIONS 4.47: an enabled item's accelerator must come
   * from the active keymap, and an app has no route to it — `AppHost` exposes no
   * `accelFor`, deliberately, because an app that could read the keymap could
   * disagree with it. Showing a chord nothing binds would advertise a keyboard
   * path that does not exist, so every item here is bare and every one of them is
   * reachable by walking the menu from the keyboard.
   */
  menu(): MenuSpec {
    const sel = this.selectedNodes()
    const one = sel.length === 1 ? sel[0] : undefined
    const mutable = sel.length > 0 && sel.every((n) => n.wellKnown === undefined && !n.locked)
    const inTrash = this.cwd === this.host.fs.trash()

    return [
      {
        kind: 'submenu',
        label: 'File',
        enabled: true,
        items: [
          {
            kind: 'item',
            label: 'New Folder',
            enabled: true,
            onActivate: () => void this.newFolder(),
          },
          {
            kind: 'item',
            label: 'Open',
            enabled: one !== undefined,
            onActivate: () => {
              if (one) void this.activate(one.id)
            },
          },
          { kind: 'separator' },
          {
            kind: 'item',
            label: 'Rename',
            enabled: one !== undefined && mutable,
            onActivate: () => this.beginRename(),
          },
          {
            kind: 'item',
            label: 'Move To',
            enabled: mutable && !inTrash,
            onActivate: () => void this.moveToChosenFolder(),
          },
          { kind: 'separator' },
          {
            kind: 'item',
            label: 'Move to Trash',
            enabled: mutable && !inTrash,
            onActivate: () => void this.trashSelection(),
          },
          {
            kind: 'item',
            label: 'Put Back',
            enabled: mutable && inTrash,
            onActivate: () => void this.restoreSelection(),
          },
          {
            kind: 'item',
            label: 'Delete',
            enabled: mutable,
            onActivate: () => void this.deleteSelection(),
          },
          { kind: 'separator' },
          {
            kind: 'item',
            label: 'Properties',
            enabled: one !== undefined,
            onActivate: () => void this.showProperties(),
          },
        ],
      },
      {
        kind: 'submenu',
        label: 'Edit',
        enabled: true,
        items: [
          {
            kind: 'item',
            label: 'Select All',
            enabled: this.nodes.length > 0,
            onActivate: () => {
              this.list.setSelection(this.nodes.map((n) => n.id))
              void this.refreshControls()
            },
          },
          {
            kind: 'item',
            label: 'Deselect All',
            enabled: this.list.selection().length > 0,
            onActivate: () => {
              this.list.setSelection([])
              void this.refreshControls()
            },
          },
        ],
      },
      {
        kind: 'submenu',
        label: 'View',
        enabled: true,
        items: [
          {
            kind: 'item',
            label: 'as Icons',
            enabled: true,
            checked: this.view === 'icon',
            onActivate: () => this.setView('icon'),
          },
          {
            kind: 'item',
            label: 'as List',
            enabled: true,
            checked: this.view === 'list',
            onActivate: () => this.setView('list'),
          },
          {
            kind: 'item',
            label: 'as Details',
            enabled: true,
            checked: this.view === 'details',
            onActivate: () => this.setView('details'),
          },
          { kind: 'separator' },
          ...(['name', 'size', 'kind', 'modified'] as const).map((key) => ({
            kind: 'item' as const,
            label: `Sort by ${key === 'modified' ? 'Date' : key[0]?.toUpperCase() + key.slice(1)}`,
            enabled: true,
            checked: this.sortKey === key,
            onActivate: () => this.setSort(key),
          })),
          { kind: 'separator' },
          {
            kind: 'item',
            label: 'Go Up',
            enabled: this.canGoUp(),
            onActivate: () => void this.goUp(),
          },
        ],
      },
    ]
  }

  contextMenu(target: HitTarget): MenuSpec | null {
    const el = target.el
    const rowEl = el?.closest<HTMLElement>('[data-ui="listrow"]') ?? null
    const rowId = rowEl?.dataset['rowId'] as NodeId | undefined

    // A right-click on an unselected row selects it first, which is what every one
    // of the six eras did and what makes the menu's items refer to what was clicked.
    if (rowId !== undefined && !this.list.selection().includes(rowId)) {
      this.list.setSelection([rowId])
      this.list.setCursor(rowId)
      void this.refreshControls()
    }

    const sel = this.selectedNodes()
    const one = sel.length === 1 ? sel[0] : undefined
    const mutable = sel.length > 0 && sel.every((n) => n.wellKnown === undefined && !n.locked)
    const inTrash = this.cwd === this.host.fs.trash()

    if (rowId === undefined) {
      return [
        {
          kind: 'item',
          label: 'New Folder',
          enabled: true,
          onActivate: () => void this.newFolder(),
        },
        {
          kind: 'item',
          label: 'Select All',
          enabled: this.nodes.length > 0,
          onActivate: () => {
            this.list.setSelection(this.nodes.map((n) => n.id))
            void this.refreshControls()
          },
        },
        { kind: 'separator' },
        { kind: 'item', label: 'Go Up', enabled: this.canGoUp(), onActivate: () => void this.goUp() },
      ]
    }

    return [
      {
        kind: 'item',
        label: 'Open',
        enabled: one !== undefined,
        onActivate: () => {
          if (one) void this.activate(one.id)
        },
      },
      {
        kind: 'item',
        label: 'Rename',
        enabled: one !== undefined && mutable,
        onActivate: () => this.beginRename(),
      },
      {
        kind: 'item',
        label: 'Move To',
        enabled: mutable && !inTrash,
        onActivate: () => void this.moveToChosenFolder(),
      },
      { kind: 'separator' },
      {
        kind: 'item',
        label: 'Move to Trash',
        enabled: mutable && !inTrash,
        onActivate: () => void this.trashSelection(),
      },
      {
        kind: 'item',
        label: 'Put Back',
        enabled: mutable && inTrash,
        onActivate: () => void this.restoreSelection(),
      },
      {
        kind: 'item',
        label: 'Delete',
        enabled: mutable,
        onActivate: () => void this.deleteSelection(),
      },
      { kind: 'separator' },
      {
        kind: 'item',
        label: 'Properties',
        enabled: one !== undefined,
        onActivate: () => void this.showProperties(),
      },
    ]
  }

  // ----------------------------------------------------------------- public API

  currentDir(): NodeId {
    return this.cwd
  }

  viewMode(): ViewMode {
    return this.view
  }

  selection(): readonly NodeId[] {
    return this.list.selection() as readonly NodeId[]
  }

  /** The rename in progress, if any. The suspend test reads it. */
  renameState(): Readonly<RenameState> | null {
    // Read from the live field when there is one, so a caller sees what the user
    // has actually typed rather than what was last captured.
    this.captureRename()
    return this.rename
  }

  listScrollOffset(): number {
    return this.suspended ? this.scrollOffset : this.list.scrollOffset()
  }

  async navigateTo(dir: NodeId): Promise<void> {
    this.cancelRename()
    this.cwd = dir
    this.list.setSelection([])
    this.list.setCursor(null)
    this.scrollOffset = 0
    this.rewatch()
    await this.render()
  }

  setView(mode: ViewMode): void {
    if (this.view === mode) return
    this.view = mode
    this.applyView()
    void this.render()
  }

  setSort(key: SortKey): void {
    if (this.sortKey === key) this.sortAscending = !this.sortAscending
    else {
      this.sortKey = key
      this.sortAscending = true
    }
    void this.render()
  }

  // -------------------------------------------------------------------- private

  private applyView(): void {
    this.list.setLayout(this.view === 'icon' ? 'grid' : 'rows')
    this.list.setColumns(this.view === 'details' ? DETAIL_COLUMNS : NAME_COLUMN)
    this.host.root.dataset['view'] = this.view
    for (const mode of ['icon', 'list', 'details'] as const) {
      this.viewButtons[mode]?.setPressed(mode === this.view)
    }
  }

  private rewatch(): void {
    this.unwatch?.()
    this.unwatch = null
    // A suspended app arms nothing. Navigation and error recovery both come
    // through here, and re-subscribing while suspended would quietly restart the
    // background work `suspend()` exists to stop.
    if (this.suspended || this.destroyed) return
    this.unwatch = this.host.fs.watch(this.cwd, () => void this.render())
  }

  private async render(): Promise<void> {
    if (this.destroyed) return
    const token = ++this.renderToken
    const { fs, codec } = this.host

    let chain: FsNode[]
    let children: FsNode[]
    try {
      chain = await fs.chain(this.cwd)
      children = await fs.list(this.cwd)
    } catch (e) {
      // A sibling window can delete the folder we are showing.
      if (isFsError(e, 'not-found')) {
        this.cwd = fs.root()
        this.rewatch()
        await this.render()
        return
      }
      this.fail(e)
      return
    }
    // A newer render started while this one awaited; that one wins.
    if (token !== this.renderToken || this.destroyed) return

    this.nodes = this.sorted(children)
    this.locationLabel.textContent = codec.format(chain)

    // Capture before the rebuild, restore after: `setRows` destroys every row
    // element, including whichever one is hosting a rename editor.
    this.captureRename()
    this.renameTeardown = true
    this.renameField?.destroy()
    this.renameField = null
    this.renameTeardown = false

    this.list.setRows(this.nodes.map((node) => this.rowFor(node)))
    this.list.setScrollOffset(this.scrollOffset)
    if (this.rename !== null) {
      if (this.nodes.some((n) => n.id === this.rename?.id)) this.mountRenameEditor()
      else this.rename = null
    }
    await this.refreshControls()
  }

  private rowFor(node: FsNode): ListRow {
    const { codec } = this.host
    const name = codec.displayName(node)
    const cells =
      this.view === 'details'
        ? [
            name,
            isDir(node) ? '' : formatSize(node.size),
            formatKind(node),
            formatDate(node.modified),
          ]
        : [name]
    return {
      id: node.id,
      cells,
      glyph: glyphFor(node),
      // A well-known or locked node is shown as unavailable for the operations
      // that would fail on it. It is still selectable and still openable.
      ...(node.locked ? { disabled: true } : {}),
    }
  }

  private sorted(nodes: readonly FsNode[]): FsNode[] {
    const dir = this.sortAscending ? 1 : -1
    return [...nodes].sort((a, b) => {
      // Folders first in every era and every sort, which every one of the six did.
      if (isDir(a) !== isDir(b)) return isDir(a) ? -1 : 1
      switch (this.sortKey) {
        case 'size': {
          const sa = isDir(a) ? -1 : a.size
          const sb = isDir(b) ? -1 : b.size
          if (sa !== sb) return (sa - sb) * dir
          break
        }
        case 'kind': {
          const c = formatKind(a).localeCompare(formatKind(b))
          if (c !== 0) return c * dir
          break
        }
        case 'modified': {
          if (a.modified !== b.modified) return (a.modified - b.modified) * dir
          break
        }
        case 'name':
          break
      }
      return a.name.localeCompare(b.name) * dir
    })
  }

  private selectedNodes(): FsNode[] {
    const chosen = new Set<string>(this.list.selection())
    return this.nodes.filter((n) => chosen.has(n.id))
  }

  private canGoUp(): boolean {
    return this.cwd !== this.host.fs.root()
  }

  private async refreshControls(): Promise<void> {
    if (this.destroyed) return
    const sel = this.selectedNodes()
    const one = sel.length === 1
    const mutable = sel.length > 0 && sel.every((n) => n.wellKnown === undefined && !n.locked)
    const inTrash = this.cwd === this.host.fs.trash()

    this.buttons['up']?.setEnabled(this.canGoUp())
    this.buttons['newFolder']?.setEnabled(!inTrash)
    this.buttons['rename']?.setEnabled(one && mutable)
    this.buttons['moveTo']?.setEnabled(mutable && !inTrash)
    this.buttons['trash']?.setEnabled(mutable && !inTrash)
    this.buttons['restore']?.setEnabled(mutable && inTrash)
    this.buttons['delete']?.setEnabled(mutable)
    this.buttons['properties']?.setEnabled(one)

    const count = this.nodes.length
    const parts = [`${count} item${count === 1 ? '' : 's'}`]
    if (sel.length === 1 && sel[0]) parts.push(this.host.codec.displayName(sel[0]))
    else if (sel.length > 1) parts.push(`${sel.length} selected`)
    this.statusEl.textContent = parts.join(' · ')
  }

  private async activate(id: NodeId): Promise<void> {
    const node = this.nodes.find((n) => n.id === id)
    if (!node) return
    if (isDir(node)) await this.navigateTo(node.id)
    // Opening a file belongs to whichever app claims its type, and no such
    // registry exists yet. Showing its properties is a real answer rather than a
    // silent nothing, and it is the era-correct one for a double-click on a
    // document whose creator is missing.
    else await this.showProperties()
  }

  private async goUp(): Promise<void> {
    const node = await this.host.fs.stat(this.cwd)
    if (node.parent !== null) await this.navigateTo(node.parent)
  }

  private async newFolder(): Promise<void> {
    try {
      const name = await this.host.fs.suggestName(this.cwd, 'New Folder', this.host.decorate)
      const id = await this.host.fs.createDir(this.cwd, name)
      await this.render()
      this.list.setSelection([id])
      this.list.setCursor(id)
      // Straight into a rename, which is what every era did with a new folder.
      this.beginRename()
    } catch (e) {
      this.fail(e)
    }
  }

  // ------------------------------------------------------------------- renaming

  private beginRename(): void {
    const sel = this.list.selection()
    const id = (sel.length === 1 ? sel[0] : this.list.cursor()) as NodeId | null
    if (id === null || id === undefined) return
    const node = this.nodes.find((n) => n.id === id)
    if (!node || node.wellKnown !== undefined || node.locked) return
    // The stem is selected and the extension is not, because the stored name
    // carries the extension in every era even where the era hides it.
    const { stem } = splitName(node.name)
    this.rename = { id, value: node.name, selStart: 0, selEnd: stem.length }
    this.mountRenameEditor()
  }

  private mountRenameEditor(): void {
    const state = this.rename
    if (!state || this.destroyed) return
    const rowEl = this.list.rowElement(state.id)
    if (!rowEl) return
    const cell = rowEl.querySelector<HTMLElement>('[data-ui="listcell"]')
    if (!cell) return

    cell.textContent = ''
    const field = this.host.ui.textField({
      label: 'New name',
      value: state.value,
      onInput: (v) => {
        state.value = v
      },
      onCommit: () => void this.commitRename(),
      onCancel: () => this.cancelRename(),
      onBlur: () => {
        // A rebuild blurs the field on its way out; that is not the user leaving it.
        if (!this.renameTeardown) void this.commitRename()
      },
    })
    field.el.dataset['uiRole'] = 'rename'
    cell.appendChild(field.el)
    this.renameField = field
    field.focus()
    field.select(state.selStart, state.selEnd)
  }

  /** Reads the live field back into the state record, if there is one. */
  private captureRename(): void {
    const field = this.renameField
    const state = this.rename
    if (!field || !state) return
    state.value = field.value()
    const sel = field.selection()
    state.selStart = sel.start
    state.selEnd = sel.end
  }

  private cancelRename(): void {
    this.rename = null
    this.renameTeardown = true
    this.renameField?.destroy()
    this.renameField = null
    this.renameTeardown = false
    this.list.focus()
    void this.render()
  }

  private async commitRename(): Promise<void> {
    const state = this.rename
    if (!state) return
    this.captureRename()
    const next = state.value.trim()
    const node = this.nodes.find((n) => n.id === state.id)
    this.rename = null
    this.renameTeardown = true
    this.renameField?.destroy()
    this.renameField = null
    this.renameTeardown = false

    if (!node || next.length === 0 || next === node.name) {
      await this.render()
      return
    }
    try {
      await this.host.fs.rename(state.id, next)
    } catch (e) {
      this.fail(e)
      await this.render()
    }
  }

  // ---------------------------------------------------------------- mutations

  private async moveToChosenFolder(): Promise<void> {
    const ids = [...this.list.selection()] as NodeId[]
    if (ids.length === 0) return
    const target = await this.host.win.chooseFolder({ startAt: this.cwd })
    if (target === null) return
    await this.moveInto(ids, target)
  }

  private async moveInto(ids: readonly NodeId[], target: NodeId): Promise<void> {
    for (const id of ids) {
      if (id === target) continue
      try {
        await this.host.fs.move(id, target)
      } catch (e) {
        // A cycle or a collision is the user's answer, not a crash: report the
        // first failure and stop rather than half-moving a multiple selection.
        this.fail(e)
        break
      }
    }
    await this.render()
  }

  private async trashSelection(): Promise<void> {
    for (const id of [...this.list.selection()] as NodeId[]) {
      try {
        await this.host.fs.moveToTrash(id)
      } catch (e) {
        this.fail(e)
        break
      }
    }
    this.list.setSelection([])
    await this.render()
  }

  private async restoreSelection(): Promise<void> {
    for (const id of [...this.list.selection()] as NodeId[]) {
      try {
        await this.host.fs.restoreFromTrash(id)
      } catch (e) {
        this.fail(e)
        break
      }
    }
    this.list.setSelection([])
    await this.render()
  }

  private async deleteSelection(): Promise<void> {
    const sel = this.selectedNodes()
    if (sel.length === 0) return
    const what =
      sel.length === 1 && sel[0]
        ? `"${this.host.codec.displayName(sel[0])}"`
        : `${sel.length} items`
    const answer = await this.host.win.message({
      title: 'Delete',
      message: `Delete ${what} permanently? This cannot be undone.`,
      buttons: [
        { label: 'Delete', isDefault: true },
        { label: 'Cancel', isCancel: true },
      ],
    })
    if (answer !== 0) return
    for (const node of sel) {
      try {
        await this.host.fs.purge(node.id)
      } catch (e) {
        this.fail(e)
        break
      }
    }
    this.list.setSelection([])
    await this.render()
  }

  private async showProperties(): Promise<void> {
    const sel = this.list.selection()
    const id = (sel.length === 1 ? sel[0] : this.list.cursor()) as NodeId | null
    if (id === null || id === undefined) return
    try {
      const [node, chain] = await Promise.all([
        this.host.fs.stat(id),
        this.host.fs.chain(id),
      ])
      await this.host.win.openDialog(
        propertiesDialog({ node, chain, codec: this.host.codec }),
      )
    } catch (e) {
      this.fail(e)
    }
  }

  // ------------------------------------------------------------- drag to move

  private onDragPointerDown(e: PointerEvent): void {
    if (this.suspended || e.button !== 0) return
    const target = e.target
    if (!(target instanceof Element)) return
    // A press that lands in the rename editor is text selection, not a drag.
    if (target.closest('[data-ui="field"]')) return
    const rowEl = target.closest<HTMLElement>('[data-ui="listrow"]')
    const id = rowEl?.dataset['rowId'] as NodeId | undefined
    if (id === undefined) return
    this.dragCandidate = { id, x: e.clientX, y: e.clientY, pointerId: e.pointerId }
  }

  private onDragPointerMove(e: PointerEvent): void {
    const candidate = this.dragCandidate
    if (!candidate || candidate.pointerId !== e.pointerId) return

    if (!this.dragging) {
      const dx = e.clientX - candidate.x
      const dy = e.clientY - candidate.y
      if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return
      this.dragging = true
      this.list.el.setPointerCapture(e.pointerId)
      this.list.el.dataset['dragging'] = 'true'
    }

    const overId = this.list.rowAt(e.clientX, e.clientY) as NodeId | null
    const node = overId !== null ? this.nodes.find((n) => n.id === overId) : undefined
    // Only a folder that is not itself being dragged can take a drop.
    const valid =
      node !== undefined && isDir(node) && !this.list.selection().includes(node.id)
        ? node.id
        : null
    if (valid === this.dropTarget) return
    if (this.dropTarget !== null) {
      delete this.list.rowElement(this.dropTarget)?.dataset['dropTarget']
    }
    this.dropTarget = valid
    if (valid !== null) {
      const el = this.list.rowElement(valid)
      if (el) el.dataset['dropTarget'] = 'true'
    }
  }

  private async onDragPointerUp(e: PointerEvent): Promise<void> {
    const candidate = this.dragCandidate
    const target = this.dropTarget
    const wasDragging = this.dragging
    this.cancelDrag()
    if (!wasDragging || !candidate || target === null) return
    if (this.list.el.hasPointerCapture(e.pointerId)) {
      this.list.el.releasePointerCapture(e.pointerId)
    }
    // Everything selected moves, and the dragged row is included even when the
    // press did not change the selection.
    const ids = new Set<NodeId>(this.list.selection() as NodeId[])
    ids.add(candidate.id)
    await this.moveInto([...ids], target)
  }

  private cancelDrag(): void {
    if (this.dropTarget !== null) {
      delete this.list.rowElement(this.dropTarget)?.dataset['dropTarget']
    }
    this.dropTarget = null
    this.dragCandidate = null
    this.dragging = false
    delete this.list.el.dataset['dragging']
  }

  private fail(e: unknown): void {
    const message = isFsError(e) ? e.message : e instanceof Error ? e.message : String(e)
    this.statusEl.textContent = message
    this.statusEl.dataset['error'] = 'true'
  }
}

/**
 * The module the shell launches.
 *
 * `defaultSize` is a request, not a guarantee: `Shell.launchApp` clamps it into
 * the work area, so a 560px default does not open a window wider than a 512px
 * screen. `minSize` is the size below which the toolbar stops being usable, and
 * it is small enough to fit every era's work area with room over.
 */
export const filesApp: AppModule = {
  id: asAppId('files'),
  title: 'Files',
  defaultSize: { w: 460, h: 300 },
  minSize: { w: 240, h: 160 },
  resizable: true,
  mount(host: AppHost): AppInstance {
    const app = new FilesApp(host)
    void app.start()
    return app
  },
}

/**
 * A module that opens onto a given folder.
 *
 * `AppModule.mount` takes only a host, so a start location cannot travel through
 * it. Rather than widen the contract for one app, the launch site builds a module
 * that closes over the folder — which is the same mechanism `main.ts` already uses
 * for era bundles and costs the contract nothing.
 */
export function filesAppAt(startAt: NodeId): AppModule {
  return {
    ...filesApp,
    mount(host: AppHost): AppInstance {
      const app = new FilesApp(host, startAt)
      void app.start()
      return app
    },
  }
}

export type { FilesApp }
