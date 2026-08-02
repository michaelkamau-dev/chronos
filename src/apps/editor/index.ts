/**
 * The Editor app.
 *
 * The same three rules that govern Files govern this, and one more that is its own.
 *
 * **It knows core and nothing else.** No era identifier appears here and
 * `test/invariants.test.js` enforces that mechanically. The document face, the
 * selection colour and the five states of every control arrive as skin CSS over the
 * `data-ui` vocabulary; the file's display name and the location string come from
 * `PathCodec`; Save, Save As and the close guard are `WindowHandle` services. There
 * is no conditional on which era is running and no way for this file to find out.
 *
 * **All persistence goes through `FsApi`.** `fs.readText` and `fs.write`, nothing
 * else, and a `fs.watch` on the open file's parent so a change made anywhere else
 * arrives here.
 *
 * **It survives suspend and resume with state intact**, which is phase 5's gate.
 * See `suspend()` and `render()` together — the interesting half is not the undo
 * stack, which is plain data and survives by being plain data. It is the caret, the
 * selection range, the scroll offsets and a half-typed search term, all of which
 * live in the DOM and are destroyed by the write `render()` makes to the text
 * surface. `resume()` performs exactly that write.
 *
 * **The one thing it holds that the filesystem does not** is the edit buffer. That
 * is not a duplicate of the file: it is uncommitted work, and the difference
 * between the two *is* the unsaved-changes state the era's dirty indicator and
 * `canClose()` both report. Everything the filesystem does know — the name, the
 * location, whether the file still exists — is read from it on every render and
 * cached nowhere.
 */

import type { AppHost, AppInstance, AppModule } from '../../core/app/types.js'
import type { FsEvent, NodeId } from '../../core/fs/types.js'
import { isFsError } from '../../core/fs/errors.js'
import { asAppId } from '../../core/wm/types.js'
import type { MenuSpec } from '../../core/input/menu.js'
import type { HitTarget } from '../../core/input/dispatcher.js'
import type { ButtonWidget, TextAreaWidget, TextFieldWidget } from '../../core/ui/kit.js'
import { findAll, findNext, findPrevious, indexOfMatch, replaceAll } from './find.js'
import { diff, UndoStack, type Snapshot } from './undo.js'

/**
 * The name a document has before it has been saved.
 *
 * Canonical, not decorated: `PathCodec` decides how a stored name is spelled on
 * screen, and there is no era hook for "what an unsaved document is called".
 * Naming that gap here rather than inventing six spellings is the same call the
 * dialog service made about its own window size.
 */
const UNTITLED = 'Untitled.txt'

/**
 * The find bar's state.
 *
 * The two caret ranges are in this record for the same reason Files keeps a
 * half-typed rename in one: the fields are rebuilt by every render, so a search
 * term the user is in the middle of typing is destroyed by a sibling window
 * touching the file — and by `resume()`.
 */
interface FindState {
  query: string
  replacement: string
  matchCase: boolean
  wrap: boolean
  /** Replace row shown. Find alone is a smaller bar, which is what the eras had. */
  replacing: boolean
  querySel: { start: number; end: number }
  replacementSel: { start: number; end: number }
  /** Which field the caret was in, so the round trip returns it there. */
  focus: 'query' | 'replacement' | null
}

function emptyFind(replacing: boolean): FindState {
  return {
    query: '',
    replacement: '',
    matchCase: false,
    wrap: true,
    replacing,
    querySel: { start: 0, end: 0 },
    replacementSel: { start: 0, end: 0 },
    focus: 'query',
  }
}

class EditorApp implements AppInstance {
  private readonly host: AppHost

  // ---- document state. All of it survives suspend/resume; see `suspend()`.
  private fileId: NodeId | null = null
  private text = ''
  private dirty = false
  private wordWrap = true
  private find: FindState | null = null
  /** Caret and scroll, mirrored out of the DOM whenever the DOM is about to lose them. */
  private caret = { start: 0, end: 0 }
  private scroll = { top: 0, left: 0 }
  private readonly undo = new UndoStack()
  /** Set when the open file changed underneath an edited buffer. */
  private diskChanged = false
  /** Set when the open file was deleted underneath us. */
  private detached = false

  // ---- live machinery, rebuilt freely
  private unwatch: (() => void) | null = null
  private suspended = false
  private destroyed = false
  private renderToken = 0
  /** True while `render()` is writing to the fields, so echoes are not edits. */
  private writing = false

  private readonly area: TextAreaWidget
  private readonly statusEl: HTMLElement
  private readonly findHost: HTMLElement
  private readonly buttons: Record<string, ButtonWidget> = {}
  private wrapButton: ButtonWidget | null = null
  private queryField: TextFieldWidget | null = null
  private replacementField: TextFieldWidget | null = null
  private findButtons: Record<string, ButtonWidget> = {}

  constructor(host: AppHost, startAt?: NodeId) {
    this.host = host
    this.fileId = startAt ?? null

    const { ui, root } = host
    root.dataset['app'] = 'editor'

    const toolbar = ui.toolbar()
    this.buttons['new'] = ui.button({
      label: 'New',
      title: 'Start an empty document',
      onActivate: () => void this.newDocument(),
    })
    this.buttons['open'] = ui.button({
      label: 'Open',
      title: 'Open a document',
      onActivate: () => void this.openDocument(),
    })
    this.buttons['save'] = ui.button({
      label: 'Save',
      title: 'Save this document',
      onActivate: () => void this.save(),
    })
    this.buttons['saveAs'] = ui.button({
      label: 'Save As',
      title: 'Save this document under a new name',
      onActivate: () => void this.saveAs(),
    })
    this.buttons['revert'] = ui.button({
      label: 'Revert',
      title: 'Discard changes and reload from disk',
      onActivate: () => void this.revert(),
    })
    this.buttons['find'] = ui.button({
      label: 'Find',
      title: 'Find text in this document',
      onActivate: () => this.openFind(false),
    })
    for (const key of ['new', 'open', 'save', 'saveAs', 'revert', 'find']) {
      const b = this.buttons[key]
      if (b) toolbar.body.appendChild(b.el)
    }

    /*
     * Word wrap as a toggle button rather than a checkbox, for the reason
     * `ButtonSpec.pressed` exists: it is one of a row of toolbar controls, and a
     * checkbox in a toolbar is a control none of the six eras put there.
     */
    this.wrapButton = ui.button({
      label: 'Word Wrap',
      title: 'Fold long lines to the window width',
      pressed: this.wordWrap,
      onActivate: () => this.setWordWrap(!this.wordWrap),
    })
    toolbar.body.appendChild(this.wrapButton.el)

    this.area = ui.textArea({
      label: 'Document text',
      wrap: this.wordWrap,
      onInput: () => this.onInput(),
    })

    this.findHost = root.ownerDocument.createElement('div')
    this.findHost.dataset['uiRole'] = 'findbar'
    this.findHost.hidden = true

    const status = ui.statusBar()
    this.statusEl = status.el

    root.append(toolbar.el, this.area.el, this.findHost, this.statusEl)

    /*
     * The chords, bound on the app's own root.
     *
     * The dispatcher listens on `window` in the bubble phase, so a key handled
     * here and stopped never reaches the skin's keymap — and every chord below is
     * one no skin binds, checked against all six keymaps. Both modifiers are
     * accepted rather than one, which is not an era conditional: it is what the
     * list widget in `core/ui/kit.ts` already does for Ctrl/Cmd+A, and it is the
     * only way to be right on a Mac era and a Windows era from one branch.
     *
     * The menus stay bare. DECISIONS 4.47: an enabled item's accelerator must come
     * from the active keymap, and an app has no route to it, so advertising a chord
     * would be the app claiming to speak for the keyboard. A chord that works and
     * is not advertised is the safe direction; the reverse is not.
     */
    root.addEventListener('keydown', (e) => this.onKeyDown(e))
  }

  // ------------------------------------------------------------------ lifecycle

  async start(): Promise<void> {
    if (this.fileId !== null) await this.loadFromDisk({ discardBuffer: true })
    this.rewatch()
    await this.render()
    this.area.focus()
  }

  /**
   * Stop computing, keep every piece of state.
   *
   * The filesystem watch is dropped — it is the only thing this app does while
   * nobody is looking at it, and leaving it armed would be a suspended window
   * doing work.
   *
   * Everything else is *captured*, not dropped. The caret, the selection range,
   * both scroll offsets and the find bar's two fields live in the DOM, and
   * `resume()` re-reads the file and re-renders, which writes over the text
   * surface and rebuilds the bar. A search term half-typed at the moment of
   * suspension is destroyed by the very re-render that brings the window back
   * unless it is read out here.
   *
   * The undo stack is not in this list and that is the point of saying so: it is
   * plain data, so it survives by being plain data, exactly as the current folder
   * does in Files. What costs work is what lives in the DOM.
   */
  suspend(): void {
    if (this.suspended) return

    /*
     * Capture **before** raising the flag.
     *
     * Both capture methods refuse to run while suspended — they read the live DOM,
     * and a suspended app's DOM is a frozen picture rather than a source of truth.
     * Setting the flag first therefore turns both calls into no-ops, and the
     * failure is completely silent: every piece of state still comes back, because
     * nothing has destroyed it *yet*. It only surfaces on a resume that has to
     * rewrite the surface, which is a resume where the file changed underneath a
     * clean buffer — and a test whose buffer was dirty never reaches it.
     */
    this.captureCaret()
    this.captureFind()
    this.undo.breakRun()

    this.suspended = true
    this.unwatch?.()
    this.unwatch = null
  }

  /** Resume, re-reading once because the file may have changed while stopped. */
  resume(): void {
    if (!this.suspended) return
    this.suspended = false
    this.rewatch()
    void this.loadFromDisk({ discardBuffer: false }).then(() => this.render())
  }

  /** True while suspended. The browser suite asserts the round trip, not the flag. */
  isSuspended(): boolean {
    return this.suspended
  }

  destroy(): void {
    this.destroyed = true
    this.unwatch?.()
    this.unwatch = null
  }

  /**
   * The unsaved-changes guard.
   *
   * Three buttons and not two, because two makes the user choose between losing
   * work and not closing the window — which is the choice every one of these eras
   * offered a way out of. Save is the default, Cancel is what Escape and the
   * frame's close box both take, and Don't Save is the deliberate one in the
   * middle with no keyboard shortcut of its own.
   *
   * Returning a promise is what `AppInstance.canClose` already allows and what the
   * window manager already awaits; a synchronous guard could not have asked.
   */
  async canClose(): Promise<boolean> {
    if (!this.dirty) return true
    const name = await this.documentName()
    const choice = await this.host.win.message({
      title: 'Close',
      message: `Save changes to ${name} before closing?`,
      buttons: [
        { label: 'Save', isDefault: true },
        { label: "Don't Save" },
        { label: 'Cancel', isCancel: true },
      ],
    })
    if (choice === 1) return true
    if (choice !== 0) return false
    // A Save that is cancelled at the file dialog must cancel the close too, or
    // the window goes away with the work the user just declined to discard.
    return await this.save()
  }

  // ---------------------------------------------------------------------- menus

  menu(): MenuSpec {
    const canRevert = this.fileId !== null && this.dirty
    const hasFind = this.find !== null && this.find.query.length > 0
    return [
      {
        kind: 'submenu',
        label: 'File',
        enabled: true,
        items: [
          { kind: 'item', label: 'New', enabled: true, onActivate: () => void this.newDocument() },
          { kind: 'item', label: 'Open', enabled: true, onActivate: () => void this.openDocument() },
          { kind: 'separator' },
          { kind: 'item', label: 'Save', enabled: true, onActivate: () => void this.save() },
          { kind: 'item', label: 'Save As', enabled: true, onActivate: () => void this.saveAs() },
          {
            kind: 'item',
            label: 'Revert',
            enabled: canRevert,
            onActivate: () => void this.revert(),
          },
          { kind: 'separator' },
          {
            kind: 'item',
            label: 'Close',
            enabled: true,
            onActivate: () => this.host.win.requestClose(),
          },
        ],
      },
      {
        kind: 'submenu',
        label: 'Edit',
        enabled: true,
        /*
         * No Cut, Copy or Paste.
         *
         * §5 lists a `ClipboardApi` on `AppHost` and there is not one — Files did
         * not need it and did not add it, and adding it here would be a second
         * contract change on a branch that already carries one. The text surface
         * keeps the platform's own cut, copy and paste on the keyboard, so nothing
         * is lost; what would be lost is the honesty of a menu, because an item
         * this app cannot perform is an item promising a command that does not
         * exist. Omission is the honest third option — the same call System 1's
         * File menu made about Get Info, Duplicate and Eject.
         */
        items: [
          {
            kind: 'item',
            label: 'Undo',
            enabled: this.undo.canUndo(),
            onActivate: () => this.performUndo(),
          },
          {
            kind: 'item',
            label: 'Redo',
            enabled: this.undo.canRedo(),
            onActivate: () => this.performRedo(),
          },
          { kind: 'separator' },
          { kind: 'item', label: 'Select All', enabled: true, onActivate: () => this.selectAll() },
          { kind: 'separator' },
          { kind: 'item', label: 'Find', enabled: true, onActivate: () => this.openFind(false) },
          {
            kind: 'item',
            label: 'Find Next',
            enabled: hasFind,
            onActivate: () => this.step(1),
          },
          {
            kind: 'item',
            label: 'Find Previous',
            enabled: hasFind,
            onActivate: () => this.step(-1),
          },
          { kind: 'item', label: 'Replace', enabled: true, onActivate: () => this.openFind(true) },
        ],
      },
      {
        kind: 'submenu',
        label: 'Format',
        enabled: true,
        items: [
          {
            kind: 'item',
            label: 'Word Wrap',
            enabled: true,
            checked: this.wordWrap,
            onActivate: () => this.setWordWrap(!this.wordWrap),
          },
        ],
      },
    ]
  }

  contextMenu(target: HitTarget): MenuSpec | null {
    if (!target.el || !this.host.root.contains(target.el)) return null
    return [
      {
        kind: 'item',
        label: 'Undo',
        enabled: this.undo.canUndo(),
        onActivate: () => this.performUndo(),
      },
      {
        kind: 'item',
        label: 'Redo',
        enabled: this.undo.canRedo(),
        onActivate: () => this.performRedo(),
      },
      { kind: 'separator' },
      { kind: 'item', label: 'Select All', enabled: true, onActivate: () => this.selectAll() },
      { kind: 'item', label: 'Find', enabled: true, onActivate: () => this.openFind(false) },
    ]
  }

  // ------------------------------------------------------------- test surface

  /** State a suite asserts across the round trip. Reads live DOM, never a cache. */
  snapshotForTest(): {
    text: string
    caret: { start: number; end: number }
    scroll: { top: number; left: number }
    undo: { undo: number; redo: number }
    wordWrap: boolean
    dirty: boolean
    find: FindState | null
  } {
    return {
      text: this.area.value(),
      caret: this.suspended ? this.caret : this.area.selection(),
      scroll: this.suspended ? this.scroll : this.area.scrollOffset(),
      undo: this.undo.depth(),
      wordWrap: this.wordWrap,
      dirty: this.dirty,
      find: this.find === null ? null : { ...this.liveFind() },
    }
  }

  /** The find bar's state including the two live caret ranges. */
  private liveFind(): FindState {
    const state = this.find
    if (!state) return emptyFind(false)
    if (this.suspended || this.queryField === null) return state
    return {
      ...state,
      query: this.queryField.value(),
      querySel: this.queryField.selection(),
      ...(this.replacementField
        ? {
            replacement: this.replacementField.value(),
            replacementSel: this.replacementField.selection(),
          }
        : {}),
    }
  }

  // ------------------------------------------------------------------- editing

  /**
   * A change arrived from the text surface.
   *
   * The edit is recovered by diffing the buffer this app last wrote against what
   * the surface now holds, rather than by reading the event: a `<textarea>`'s
   * `input` is always one contiguous replacement, so the common prefix and suffix
   * bracket it exactly, and the diff is the same for a keystroke, a paste and a
   * selection overwritten. `render()` sets `writing` while it drives the field, so
   * the app never records its own writes as the user's edits.
   */
  private onInput(): void {
    if (this.writing) return
    const before = this.text
    const after = this.area.value()
    if (before === after) return
    const edit = diff(before, after)
    this.undo.record(
      { text: before, selStart: edit.at, selEnd: edit.at + edit.removed.length },
      edit,
    )
    this.text = after
    this.setDirty(true)
    this.captureCaret()
    void this.render()
  }

  private performUndo(): void {
    const entry = this.undo.undo(this.currentSnapshot())
    if (!entry) return
    this.applySnapshot(entry)
  }

  private performRedo(): void {
    const entry = this.undo.redo(this.currentSnapshot())
    if (!entry) return
    this.applySnapshot(entry)
  }

  private currentSnapshot(): Snapshot {
    const sel = this.suspended ? this.caret : this.area.selection()
    return { text: this.text, selStart: sel.start, selEnd: sel.end }
  }

  private applySnapshot(s: Snapshot): void {
    this.text = s.text
    this.caret = { start: s.selStart, end: s.selEnd }
    this.setDirty(true)
    void this.render().then(() => this.area.focus())
  }

  private selectAll(): void {
    this.caret = { start: 0, end: this.text.length }
    this.area.setSelection(0, this.text.length)
    this.area.focus()
    this.undo.breakRun()
  }

  private setWordWrap(on: boolean): void {
    this.wordWrap = on
    this.area.setWrap(on)
    this.wrapButton?.setPressed(on)
    // Folding a long line moves every character after it, so a horizontal offset
    // measured against the unwrapped layout means nothing once it folds.
    if (on) this.scroll = { top: this.scroll.top, left: 0 }
    void this.render()
  }

  private setDirty(on: boolean): void {
    this.dirty = on
    this.host.win.setDirty(on)
  }

  // ------------------------------------------------------------------ document

  private async documentName(): Promise<string> {
    const id = this.fileId
    if (id === null) return UNTITLED
    try {
      return this.host.codec.displayName(await this.host.fs.stat(id))
    } catch {
      // The file went away between the render and this read. The buffer is still
      // the user's work, so it keeps the name it had before it had a file.
      return UNTITLED
    }
  }

  private async newDocument(): Promise<void> {
    if (!(await this.confirmDiscard('starting a new document'))) return
    this.fileId = null
    this.text = ''
    this.detached = false
    this.diskChanged = false
    this.undo.clear()
    this.caret = { start: 0, end: 0 }
    this.scroll = { top: 0, left: 0 }
    this.setDirty(false)
    this.rewatch()
    await this.render()
    this.area.focus()
  }

  /** The folder a file dialog should open onto: where this document already lives. */
  private async startFolder(): Promise<NodeId | undefined> {
    const id = this.fileId
    if (id === null) return undefined
    try {
      return (await this.host.fs.stat(id)).parent ?? undefined
    } catch {
      return undefined
    }
  }

  private async openDocument(): Promise<void> {
    if (!(await this.confirmDiscard('opening another document'))) return
    const startAt = await this.startFolder()
    const chosen = await this.host.win.openFile({
      title: 'Open',
      accept: ['text/'],
      ...(startAt !== undefined ? { startAt } : {}),
    })
    if (chosen === null) return
    this.fileId = chosen
    this.undo.clear()
    this.caret = { start: 0, end: 0 }
    this.scroll = { top: 0, left: 0 }
    this.detached = false
    this.diskChanged = false
    await this.loadFromDisk({ discardBuffer: true })
    this.rewatch()
    await this.render()
    this.area.focus()
  }

  /**
   * Read the file into the buffer.
   *
   * `discardBuffer` is the difference between opening a document and noticing that
   * one changed underneath us. Opening replaces the buffer outright. A watch event
   * may not: an edited buffer is the user's unsaved work, and adopting the disk
   * copy over the top of it would destroy exactly what the dirty flag exists to
   * protect. So a change under an edited buffer is *reported* — in the status bar
   * — and the user decides with Revert.
   */
  private async loadFromDisk(opts: { discardBuffer: boolean }): Promise<void> {
    const id = this.fileId
    if (id === null) return
    try {
      const disk = await this.host.fs.readText(id)
      if (opts.discardBuffer || !this.dirty) {
        if (disk !== this.text) {
          this.text = disk
          this.clampCaret()
        }
        if (opts.discardBuffer) this.setDirty(false)
        this.diskChanged = false
      } else if (disk !== this.text) {
        this.diskChanged = true
      }
      this.detached = false
    } catch (err) {
      if (!isFsError(err)) throw err
      // The file is gone. The buffer is not: it becomes an unsaved document, which
      // is the outcome that loses no work, and Save routes through Save As.
      this.fileId = null
      this.detached = true
      this.diskChanged = false
      this.setDirty(true)
    }
  }

  /**
   * Save, resolving true when the document is on disk.
   *
   * The boolean is what makes the close guard correct: a Save that the user
   * cancelled at the file dialog must not let the window close.
   */
  private async save(): Promise<boolean> {
    if (this.fileId === null) return await this.saveAs()
    try {
      await this.host.fs.write(this.fileId, this.text)
    } catch (err) {
      await this.reportError(err)
      return false
    }
    this.setDirty(false)
    this.diskChanged = false
    this.undo.breakRun()
    await this.render()
    return true
  }

  private async saveAs(): Promise<boolean> {
    const suggested = await this.documentName()
    const startAt = await this.startFolder()
    const target = await this.host.win.saveFile({
      title: 'Save As',
      suggestedName: suggested,
      ...(startAt !== undefined ? { startAt } : {}),
    })
    if (target === null) return false

    try {
      const existing = await this.host.fs.exists(target.parent, target.name)
      if (existing) {
        const replace = await this.host.win.message({
          title: 'Save As',
          message: `${target.name} already exists. Replace it?`,
          buttons: [{ label: 'Replace', isDefault: true }, { label: 'Cancel', isCancel: true }],
        })
        if (replace !== 0) return false
        const siblings = await this.host.fs.list(target.parent)
        const victim = siblings.find((n) => n.name === target.name)
        if (victim && victim.kind === 'file') {
          await this.host.fs.write(victim.id, this.text)
          this.fileId = victim.id
        } else {
          // A folder of that name is not something to overwrite.
          await this.host.win.message({
            title: 'Save As',
            message: `${target.name} is a folder and cannot be replaced.`,
          })
          return false
        }
      } else {
        this.fileId = await this.host.fs.createFile(target.parent, target.name, this.text, {
          mime: 'text/plain',
        })
      }
    } catch (err) {
      await this.reportError(err)
      return false
    }

    this.detached = false
    this.diskChanged = false
    this.setDirty(false)
    this.undo.breakRun()
    this.rewatch()
    await this.render()
    return true
  }

  private async revert(): Promise<void> {
    if (this.fileId === null) return
    const name = await this.documentName()
    const choice = await this.host.win.message({
      title: 'Revert',
      message: `Discard changes to ${name} and reload the saved version?`,
      buttons: [{ label: 'Revert', isDefault: true }, { label: 'Cancel', isCancel: true }],
    })
    if (choice !== 0) return

    const before = this.currentSnapshot()
    try {
      const disk = await this.host.fs.readText(this.fileId)
      // Revert is undoable. Every one of these editors treated it as a discard with
      // no way back, and every one of them was wrong about it — a whole-buffer
      // replacement the undo stack cannot reach is the one edit that can lose an
      // afternoon.
      if (disk !== this.text) this.undo.recordDiscrete(before)
      this.text = disk
      this.clampCaret()
    } catch (err) {
      await this.reportError(err)
      return
    }
    this.diskChanged = false
    this.setDirty(false)
    await this.render()
    this.area.focus()
  }

  /** Guard the buffer before an action that would replace it. */
  private async confirmDiscard(what: string): Promise<boolean> {
    if (!this.dirty) return true
    const name = await this.documentName()
    const choice = await this.host.win.message({
      title: 'Unsaved Changes',
      message: `Save changes to ${name} before ${what}?`,
      buttons: [
        { label: 'Save', isDefault: true },
        { label: "Don't Save" },
        { label: 'Cancel', isCancel: true },
      ],
    })
    if (choice === 1) return true
    if (choice !== 0) return false
    return await this.save()
  }

  private async reportError(err: unknown): Promise<void> {
    if (!isFsError(err)) throw err
    await this.host.win.message({ title: 'Editor', message: err.message })
  }

  // ---------------------------------------------------------------- find bar

  private openFind(replacing: boolean): void {
    const existing = this.liveFind()
    this.find =
      this.find === null ? emptyFind(replacing) : { ...existing, replacing: replacing || existing.replacing }
    // A search opened over a selection searches for it, which every one of these
    // editors did and which saves the commonest retype.
    const sel = this.suspended ? this.caret : this.area.selection()
    if (this.find.query.length === 0 && sel.end > sel.start) {
      const seed = this.text.slice(sel.start, sel.end)
      if (!seed.includes('\n')) {
        this.find.query = seed
        this.find.querySel = { start: 0, end: seed.length }
      }
    }
    this.find.focus = replacing && this.find.query.length > 0 ? 'replacement' : 'query'
    void this.render()
  }

  private closeFind(): void {
    this.find = null
    void this.render().then(() => this.area.focus())
  }

  /** Every match in the buffer, for the counter and for Replace All alike. */
  private matches(): ReturnType<typeof findAll> {
    const state = this.liveFind()
    if (state.query.length === 0) return []
    return findAll(this.text, state.query, state.matchCase)
  }

  /**
   * Move to the next or previous match.
   *
   * Forwards searches from the *end* of the selection and backwards from its
   * start, which is what stops Find Next finding the match it is already sitting
   * on. `wrap` off and nothing further is not an error — it is the end of the
   * document, and the status bar says so rather than a dialog interrupting.
   *
   * **`stay` is where the focus goes, and it is not a detail.** Enter pressed in
   * the search field must leave the caret in the search field, or the second Enter
   * types a newline into the document instead of finding the next match. Every
   * other route — the menu, the chord, the Next and Previous buttons — wants focus
   * on the document, because that is where the selection it just made is. The
   * mechanism is `render()`: it captures which field held focus *before* rebuilding
   * the bar and restores it after, so moving focus before rendering is what decides
   * where it lands.
   */
  private step(direction: 1 | -1, stay: 'field' | 'document' = 'document'): void {
    const state = this.liveFind()
    if (state.query.length === 0) return
    this.captureCaret()
    const opts = { matchCase: state.matchCase, wrap: state.wrap }
    const hit =
      direction === 1
        ? findNext(this.text, state.query, this.caret.end, opts)
        : findPrevious(this.text, state.query, this.caret.start, opts)
    if (hit) {
      this.caret = { start: hit.start, end: hit.end }
      this.area.setSelection(hit.start, hit.end)
      this.undo.breakRun()
    }
    if (stay === 'document') this.area.focus()
    void this.render()
  }

  /** Replace the selection when it is a match, then move to the next one. */
  private replaceOne(stay: 'field' | 'document' = 'document'): void {
    const state = this.liveFind()
    if (state.query.length === 0) return
    this.captureCaret()
    const selected = this.text.slice(this.caret.start, this.caret.end)
    const isMatch =
      selected.length > 0 &&
      (state.matchCase
        ? selected === state.query
        : selected.toLowerCase() === state.query.toLowerCase())
    if (!isMatch) {
      this.step(1, stay)
      return
    }
    this.undo.recordDiscrete(this.currentSnapshot())
    const at = this.caret.start
    this.text = this.text.slice(0, at) + state.replacement + this.text.slice(this.caret.end)
    this.caret = { start: at + state.replacement.length, end: at + state.replacement.length }
    this.setDirty(true)
    this.step(1, stay)
  }

  private replaceEvery(): void {
    const state = this.liveFind()
    if (state.query.length === 0) return
    const result = replaceAll(this.text, state.query, state.replacement, state.matchCase)
    if (result.count === 0) {
      void this.render()
      return
    }
    this.undo.recordDiscrete(this.currentSnapshot())
    this.text = result.text
    this.clampCaret()
    this.setDirty(true)
    void this.render()
  }

  // --------------------------------------------------------------------- keys

  /**
   * The app's own chords.
   *
   * Only the chords below are consumed; everything else bubbles to the shell, so
   * Alt+F4, Meta+W, Escape-to-dismiss-a-menu and window cycling all still work
   * from inside a document. Tab is deliberately *not* claimed: it is focus
   * containment in every era of this project, and a text surface that swallowed it
   * would be the one window a keyboard user cannot get out of.
   */
  private onKeyDown(e: KeyboardEvent): void {
    if (this.suspended) return
    const mod = e.ctrlKey || e.metaKey
    if (!mod) {
      if (e.key === 'Escape' && this.find !== null) {
        e.preventDefault()
        e.stopPropagation()
        this.closeFind()
      }
      return
    }
    // Alt with Ctrl is AltGr on a Windows layout, which types characters.
    if (e.altKey) return

    const key = e.key.toLowerCase()
    const claim = (): void => {
      e.preventDefault()
      e.stopPropagation()
    }
    switch (key) {
      case 's':
        claim()
        void this.save()
        return
      case 'z':
        claim()
        if (e.shiftKey) this.performRedo()
        else this.performUndo()
        return
      case 'y':
        claim()
        this.performRedo()
        return
      case 'f':
        claim()
        this.openFind(false)
        return
      case 'h':
        claim()
        this.openFind(true)
        return
      case 'g':
        claim()
        this.step(e.shiftKey ? -1 : 1)
        return
      default:
        return
    }
  }

  // ------------------------------------------------------------------- render

  private rewatch(): void {
    this.unwatch?.()
    this.unwatch = null
    // A suspended app arms nothing: re-subscribing while suspended would restart
    // the background work `suspend()` exists to stop.
    if (this.suspended || this.destroyed) return
    const id = this.fileId
    if (id === null) return
    this.unwatch = this.host.fs.watchAll((e) => this.onFsEvent(e))
  }

  private onFsEvent(e: FsEvent): void {
    if (this.suspended || this.destroyed) return
    if (e.id !== this.fileId) return
    void this.loadFromDisk({ discardBuffer: false }).then(() => this.render())
  }

  /**
   * Mirror the DOM's caret and scroll into fields, before anything overwrites them.
   *
   * **The surface's caret is the truth only while the surface is showing what the
   * app thinks it is showing.** After a programmatic edit — undo, Replace, Replace
   * All, Revert, a reload from disk — the buffer has moved and the surface has not
   * yet been written, so its caret still points into the *old* text. Capturing it
   * then would overwrite the position the edit just computed with a stale one, and
   * the symptom is Replace All leaving the cursor wherever it happened to be
   * before. One comparison decides it, and it costs nothing: `render()` writes the
   * surface immediately afterwards, so the two are back in step within the same
   * call.
   */
  private captureCaret(): void {
    if (this.suspended) return
    if (this.area.value() !== this.text) return
    this.caret = this.area.selection()
    this.scroll = this.area.scrollOffset()
  }

  /**
   * Mirror the find bar's two fields into state.
   *
   * The early return on an unmounted bar is load-bearing rather than defensive:
   * `openFind` sets `focus` to the field it wants the caret in and *then* renders,
   * so a capture that read `document.activeElement` before the bar existed would
   * overwrite that with `null` — and the bar would open with no cursor in it,
   * every time, from the menu and from the chord alike.
   */
  private captureFind(): void {
    if (this.find === null || this.suspended) return
    if (this.queryField === null) return
    this.find = this.liveFind()
    const active = this.host.root.ownerDocument.activeElement
    this.find.focus =
      active === this.replacementField?.el
        ? 'replacement'
        : active === this.queryField.el
          ? 'query'
          : null
  }

  private clampCaret(): void {
    const n = this.text.length
    this.caret = {
      start: Math.min(this.caret.start, n),
      end: Math.min(this.caret.end, n),
    }
  }

  /**
   * Write the app's state onto the DOM.
   *
   * **This is the destructive step, and everything about suspend/resume follows
   * from it.** Writing a `<textarea>`'s value resets its caret to zero and both
   * its scroll offsets to zero, and rebuilding the find bar destroys two more
   * carets — so every entry point captures first and this restores afterwards.
   * `resume()` calls it, which is why the round trip needs the capture at all.
   *
   * `renderToken` is what makes overlapping renders safe: the filesystem read is
   * awaited, and a second event arriving during it would otherwise let the older
   * read write its stale name over the newer one's.
   */
  private async render(): Promise<void> {
    if (this.destroyed) return
    const token = ++this.renderToken

    const id = this.fileId
    let name = UNTITLED
    let location = ''
    if (id !== null) {
      try {
        const [node, chain] = await Promise.all([this.host.fs.stat(id), this.host.fs.chain(id)])
        name = this.host.codec.displayName(node)
        location = this.host.codec.format(chain)
      } catch {
        name = UNTITLED
      }
    }
    if (token !== this.renderToken || this.destroyed) return

    /*
     * Capture **here**, immediately before the writes below, and not at the top of
     * this method.
     *
     * Capturing before the `await` is capturing a caret that is about to become
     * stale: anything the user does during the filesystem read — clicking into the
     * document, dragging a selection, typing into the search field — happens after
     * the read and before the restore, so the restore puts the *old* position back
     * and the interaction is silently undone. It reproduces exactly: place a caret
     * while a sibling window is writing to the file, and it jumps back.
     *
     * Adjacency is the fix and it is also the rule. A capture is only valid for the
     * write it is protecting against, so it belongs next to that write.
     */
    this.captureCaret()
    this.captureFind()

    this.host.win.setTitle(name)

    this.writing = true
    if (this.area.value() !== this.text) this.area.setValue(this.text)
    this.area.setWrap(this.wordWrap)
    this.writing = false
    this.area.setSelection(this.caret.start, this.caret.end)
    this.area.setScrollOffset(this.scroll.top, this.scroll.left)

    this.buttons['revert']?.setEnabled(this.fileId !== null && this.dirty)
    this.wrapButton?.setPressed(this.wordWrap)

    this.renderFindBar()
    this.renderStatus(name, location)
  }

  /**
   * Build the find bar from state.
   *
   * Torn down and rebuilt rather than mutated, for the same reason Files rebuilds
   * every row: the app renders from its own state and holds no half-live widgets.
   * That is what makes the captured caret offsets load-bearing rather than
   * decorative — the fields the user is typing into are new elements every time.
   */
  private renderFindBar(): void {
    const state = this.find
    this.findHost.textContent = ''
    this.queryField = null
    this.replacementField = null
    this.findButtons = {}

    if (state === null) {
      this.findHost.hidden = true
      return
    }
    this.findHost.hidden = false

    /*
     * Each row of the bar is a real `ui.toolbar()`, and that is a correctness
     * decision rather than a tidy one.
     *
     * Every skin distinguishes a *command* button from a *toolbar* button, because
     * a command button has a measured width — Windows 3.1's is a fixed
     * `--w31-btn-w` — and a toolbar button sizes to its label. Built as bare
     * buttons in a plain row, `Replace All`, `Match Case` and `Wrap Around` all
     * rendered clipped to 70px reading `Replace`, `Match` and `Wrap`. That is the
     * same failure `CLAUDE.md` records for `.lg-btn`: a class is a *kind* of
     * control, and reusing the wrong kind gets the era's ink with the wrong
     * construction.
     *
     * Emitting the rows as toolbars picks up the rule each skin already wrote,
     * rather than adding a second copy of it to six stylesheets that would then
     * drift from the first.
     */
    const { ui } = this.host
    const row = (): HTMLElement => {
      const bar = ui.toolbar()
      bar.el.dataset['uiRole'] = 'findrow'
      this.findHost.appendChild(bar.el)
      return bar.body
    }

    const findRow = row()
    const findCaption = ui.label({ text: 'Find' })
    this.queryField = ui.textField({
      label: 'Find what',
      value: state.query,
      onInput: (v) => {
        state.query = v
        state.querySel = this.queryField?.selection() ?? { start: v.length, end: v.length }
        // The count and the button states, not a whole render: rebuilding the bar
        // on every keystroke would destroy the field being typed into, which is
        // the bug the captured caret exists to survive and not one to cause.
        this.renderStatus()
        this.refreshFindButtons()
      },
      onCommit: () => this.step(1, 'field'),
      onCancel: () => this.closeFind(),
    })
    findCaption.el.dataset['uiRole'] = 'findlabel'
    findRow.append(findCaption.el, this.queryField.el)

    this.findButtons['prev'] = ui.button({
      label: 'Previous',
      title: 'Find the previous occurrence',
      onActivate: () => this.step(-1),
    })
    this.findButtons['next'] = ui.button({
      label: 'Next',
      title: 'Find the next occurrence',
      onActivate: () => this.step(1),
    })
    findRow.append(this.findButtons['prev'].el, this.findButtons['next'].el)

    if (state.replacing) {
      const replaceRow = row()
      const replaceCaption = ui.label({ text: 'Replace' })
      replaceCaption.el.dataset['uiRole'] = 'findlabel'
      this.replacementField = ui.textField({
        label: 'Replace with',
        value: state.replacement,
        onInput: (v) => {
          state.replacement = v
          state.replacementSel = this.replacementField?.selection() ?? {
            start: v.length,
            end: v.length,
          }
        },
        onCommit: () => this.replaceOne('field'),
        onCancel: () => this.closeFind(),
      })
      this.findButtons['replace'] = ui.button({
        label: 'Replace',
        title: 'Replace this occurrence and find the next',
        onActivate: () => this.replaceOne(),
      })
      this.findButtons['replaceAll'] = ui.button({
        label: 'Replace All',
        title: 'Replace every occurrence',
        onActivate: () => this.replaceEvery(),
      })
      replaceRow.append(
        replaceCaption.el,
        this.replacementField.el,
        this.findButtons['replace'].el,
        this.findButtons['replaceAll'].el,
      )
    }

    const optionRow = row()

    /*
     * Match case and Wrap around are **toggle buttons, not checkboxes**, and this
     * is a departure worth naming rather than burying.
     *
     * Every one of the six eras drew these two as checkboxes in its Find dialog,
     * so a checkbox is the era-correct control. Five of the six skins ship no
     * checkbox artwork at all — `base.css` strips the browser's with
     * `appearance: none` precisely so a missing skin rule is loud, and only
     * System 1 has drawn one. Supplying the other five would mean inventing a
     * Luna, a Platinum, an Aqua and a Windows 3.1 check mark with no source in
     * `docs/sources/` for any of them, which is the one thing `CLAUDE.md` forbids
     * outright: a chrome dimension is measured, not eyeballed.
     *
     * A toggle button is already drawn by all six — `[data-pressed='true']` — and
     * already carries a documented reason for existing. So the honest trade is a
     * slightly wrong *control* over six invented *bitmaps*, and the checkbox
     * artwork is raised as era work in `docs/apps/editor.md` rather than taken here.
     */
    const matchCaseBox = ui.button({
      label: 'Match Case',
      title: 'Only match text with the same capitalisation',
      pressed: state.matchCase,
      onActivate: () => {
        state.matchCase = !state.matchCase
        matchCaseBox.setPressed(state.matchCase)
        this.renderStatus()
        this.refreshFindButtons()
      },
    })
    const wrapAroundBox = ui.button({
      label: 'Wrap Around',
      title: 'Continue from the other end of the document',
      pressed: state.wrap,
      onActivate: () => {
        state.wrap = !state.wrap
        wrapAroundBox.setPressed(state.wrap)
      },
    })
    this.findButtons['close'] = ui.button({
      label: 'Close',
      title: 'Close the find bar',
      onActivate: () => this.closeFind(),
    })
    optionRow.append(matchCaseBox.el, wrapAroundBox.el, this.findButtons['close'].el)

    this.queryField.select(state.querySel.start, state.querySel.end)
    this.replacementField?.select(state.replacementSel.start, state.replacementSel.end)
    /*
     * Put focus back where it was before the rebuild — and only then.
     *
     * `render()` captured `focus` from `document.activeElement` moments ago, so a
     * non-null value means the caret genuinely was in one of these fields and the
     * teardown above is what took it away. Restoring unconditionally would be a
     * find bar that steals the cursor out of the document every time a sibling
     * window touches the file.
     */
    if (state.focus === 'replacement' && this.replacementField) this.replacementField.focus()
    else if (state.focus === 'query') this.queryField.focus()
    this.refreshFindButtons()
  }

  private refreshFindButtons(): void {
    const has = this.liveFind().query.length > 0
    this.findButtons['next']?.setEnabled(has)
    this.findButtons['prev']?.setEnabled(has)
    this.findButtons['replace']?.setEnabled(has)
    this.findButtons['replaceAll']?.setEnabled(has)
  }

  /** Name and location as the last render read them, so the status line is cheap. */
  private lastName = UNTITLED
  private lastLocation = ''

  private renderStatus(name: string = this.lastName, location: string = this.lastLocation): void {
    this.lastName = name
    this.lastLocation = location
    const parts: string[] = []
    parts.push(location.length > 0 ? location : name)
    parts.push(`${this.text.length} characters`)
    if (this.find !== null) {
      const state = this.liveFind()
      if (state.query.length > 0) {
        const all = this.matches()
        const at = indexOfMatch(all, this.caret.start, this.caret.end)
        parts.push(
          all.length === 0
            ? 'no matches'
            : at >= 0
              ? `match ${at + 1} of ${all.length}`
              : `${all.length} matches`,
        )
      }
    }
    if (this.detached) parts.push('the file was deleted; save to keep this document')
    else if (this.diskChanged) parts.push('changed on disk since you edited it')
    /*
     * A hyphen, not U+00B7.
     *
     * ChiKareGo2 has no middle dot, and a missing glyph does not fail loudly — it
     * falls back to the browser's default face, which antialiases, so a 1-bit
     * window gets a grey smudge in its status bar and nothing reports it. Same
     * trap as U+2014 in a window title and the `▸` in a file list, both already in
     * `CLAUDE.md`; this is the third surface to find it. The separator is not era
     * styling, so the safe character is the right answer rather than six of them.
     */
    this.statusEl.textContent = parts.join(' - ')
  }
}

/** The mounted app, so a test can reach the state a round trip has to preserve. */
export type EditorInstance = EditorApp

/*
 * `defaultSize` is a request: `Shell.launchApp` clamps it into the work area, so
 * asking for more than a 512x342 era can give is safe and asking for less than a
 * 1024-wide era wants is not recoverable.
 *
 * The height is set by the era with the largest type. Ledger sets its interface in
 * 18px Black — a derivation, not a preference, per §8's `stem >= cell` — so its
 * toolbar wraps to two rows and its find bar occupies three, and at 320px the
 * document was left with one visible line. 480 is the measured floor at which
 * every era shows the toolbar, an open *replace* bar, the status line and at least
 * four lines of document at once — `tools/shots/editor-render.mjs` reports the
 * line count per era and fails below four. The width stays inside System 1's 512px
 * viewport so the tightest era clamps by the least.
 */
const DEFAULT_SIZE = { w: 470, h: 480 }
const MIN_SIZE = { w: 260, h: 200 }

export const editorApp: AppModule = {
  id: asAppId('editor'),
  title: 'Editor',
  defaultSize: DEFAULT_SIZE,
  minSize: MIN_SIZE,
  resizable: true,
  mount(host: AppHost): AppInstance {
    const app = new EditorApp(host)
    void app.start()
    return app
  },
}

/** The same app, opened onto a document — what "Open" from a file manager means. */
export function editorAppAt(file: NodeId): AppModule {
  return {
    ...editorApp,
    mount(host: AppHost): AppInstance {
      const app = new EditorApp(host, file)
      void app.start()
      return app
    },
  }
}
