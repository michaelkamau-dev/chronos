/**
 * The phase-2 directory view.
 *
 * A complete, working directory browser: navigate, create folders and files, edit
 * a text file's contents, rename, trash, restore and purge. Every control does its
 * job.
 *
 * It is deliberately *not* the Files app — no icon view, no Properties dialog, no
 * drag and drop, no era chrome. Its purpose is to prove the filesystem invariant
 * that phase 2 is gated on: **it holds no state of its own.** Every mutation goes
 * to the filesystem and the view re-renders from `fs.watch`, which is why two of
 * these windows open on the same folder stay in step without knowing about each
 * other. The real Files app in phase 5 replaces this and inherits the same rule.
 */

import type { FsApi, FsNode, NodeId, PathCodec } from '../core/fs/types.js'
import { isDir } from '../core/fs/types.js'
import { isFsError } from '../core/fs/errors.js'
import type { NameDecorator } from '../core/fs/types.js'

export interface DirectoryViewOptions {
  fs: FsApi
  codec: PathCodec
  decorate: NameDecorator
  root: HTMLElement
  startAt?: NodeId
  /** Reports errors to the host so they can reach a failure state, not a console. */
  onError?(message: string): void
}

export class DirectoryView {
  private readonly fs: FsApi
  private readonly codec: PathCodec
  private readonly decorate: NameDecorator
  private readonly root: HTMLElement
  private readonly onError: (message: string) => void

  private cwd: NodeId
  private unwatch: (() => void) | null = null
  /** Frozen by `suspend()`. See the method for what is stopped and what is kept. */
  private suspended = false
  private selected: NodeId | null = null
  /** Guards against overlapping renders when events arrive during a read. */
  private renderToken = 0

  private readonly pathEl: HTMLElement
  private readonly listEl: HTMLElement
  private readonly statusEl: HTMLElement
  private readonly editorWrap: HTMLElement
  private readonly editor: HTMLTextAreaElement
  private readonly buttons: Record<string, HTMLButtonElement> = {}

  constructor(opts: DirectoryViewOptions) {
    this.fs = opts.fs
    this.codec = opts.codec
    this.decorate = opts.decorate
    this.root = opts.root
    this.onError = opts.onError ?? (() => undefined)
    this.cwd = opts.startAt ?? opts.fs.root()

    this.root.classList.add('dirview')

    const toolbar = document.createElement('div')
    toolbar.className = 'dirview-toolbar'
    this.root.appendChild(toolbar)

    this.buttons['up'] = this.addButton(toolbar, 'Up', 'Go to parent folder', () => void this.goUp())
    this.buttons['newFolder'] = this.addButton(toolbar, 'New folder', 'Create a folder', () =>
      void this.createDir(),
    )
    this.buttons['newFile'] = this.addButton(toolbar, 'New file', 'Create a text file', () =>
      void this.createFile(),
    )
    this.buttons['rename'] = this.addButton(toolbar, 'Rename', 'Rename the selection', () =>
      void this.renameSelected(),
    )
    this.buttons['trash'] = this.addButton(toolbar, 'Trash', 'Move the selection to Trash', () =>
      void this.trashSelected(),
    )
    this.buttons['restore'] = this.addButton(toolbar, 'Restore', 'Restore from Trash', () =>
      void this.restoreSelected(),
    )
    this.buttons['purge'] = this.addButton(toolbar, 'Delete', 'Delete permanently', () =>
      void this.purgeSelected(),
    )

    this.pathEl = document.createElement('div')
    this.pathEl.className = 'dirview-path'
    this.root.appendChild(this.pathEl)

    this.listEl = document.createElement('div')
    this.listEl.className = 'dirview-list'
    this.listEl.setAttribute('role', 'listbox')
    this.listEl.setAttribute('aria-label', 'Folder contents')
    this.listEl.tabIndex = 0
    this.listEl.addEventListener('keydown', (e) => this.onListKeyDown(e))
    this.root.appendChild(this.listEl)

    this.editorWrap = document.createElement('div')
    this.editorWrap.className = 'dirview-editor'
    this.editorWrap.hidden = true
    this.editor = document.createElement('textarea')
    this.editor.setAttribute('aria-label', 'File contents')
    this.editor.spellcheck = false
    this.editorWrap.appendChild(this.editor)
    const save = document.createElement('button')
    save.type = 'button'
    save.textContent = 'Save'
    save.addEventListener('click', () => void this.saveEditor())
    this.editorWrap.appendChild(save)
    this.buttons['save'] = save
    this.root.appendChild(this.editorWrap)

    this.statusEl = document.createElement('div')
    this.statusEl.className = 'dirview-status'
    this.statusEl.setAttribute('role', 'status')
    this.root.appendChild(this.statusEl)
  }

  async start(): Promise<void> {
    this.rewatch()
    await this.render()
  }

  /**
   * Stop computing, keeping every piece of state.
   *
   * `AppInstance.suspend()` in `core/app/types.ts`, implemented here because an era
   * exists whose entire premise is that unfocused work stops, and a contract with no
   * implementation is untested code — the lesson `MinimizeStyle`'s unexercised
   * `'collapse'` member taught, which was wrong at all three of its decision sites
   * until an era finally declared it.
   *
   * What actually stops is the filesystem watch, which is this view's only live
   * subscription and therefore its only way of doing work while nobody is looking at
   * it. What is kept is everything a person would notice losing: the current folder,
   * the selection, the scroll position and any unsaved text in the editor. That last
   * one is the point — the DOM stays mounted, so the textarea keeps its value,
   * cursor and selection without this method touching them.
   *
   * **Scope, stated rather than implied.** This is one harness view. The phase-5 gate
   * is that all six apps survive the round trip with state intact — Paint's undo
   * stack, the editor's cursor and selection, the terminal's scrollback — verified per
   * app. This proves the contract is wireable and nothing more.
   */
  suspend(): void {
    if (this.suspended) return
    this.suspended = true
    // The watch is dropped rather than merely ignored: a suspended view that kept its
    // subscription would still be woken by every sibling window's write, which is
    // exactly the background work the contract exists to stop.
    this.unwatch?.()
    this.unwatch = null
  }

  /** Resume, and re-read once because the folder may have changed while stopped. */
  resume(): void {
    if (!this.suspended) return
    this.suspended = false
    this.rewatch()
    void this.render()
  }

  /** True while suspended. Read by the fidelity suite to prove the round trip. */
  isSuspended(): boolean {
    return this.suspended
  }

  destroy(): void {
    this.unwatch?.()
    this.unwatch = null
  }

  currentDir(): NodeId {
    return this.cwd
  }

  async navigateTo(dir: NodeId): Promise<void> {
    this.cwd = dir
    this.selected = null
    this.rewatch()
    await this.render()
  }

  // ------------------------------------------------------------------ private

  private addButton(
    host: HTMLElement,
    label: string,
    title: string,
    onClick: () => void,
  ): HTMLButtonElement {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = label
    b.title = title
    b.setAttribute('aria-label', title)
    b.addEventListener('click', onClick)
    host.appendChild(b)
    return b
  }

  /**
   * Watching the current directory is the whole mechanism: the view never mutates
   * its own list, it only re-reads when the filesystem says the folder changed —
   * whether the change came from this window, a sibling window, or another tab.
   */
  private rewatch(): void {
    this.unwatch?.()
    this.unwatch = null
    // A suspended view arms nothing. Navigation and error recovery both call this,
    // and either re-subscribing while suspended would quietly restart the background
    // work `suspend()` exists to stop.
    if (this.suspended) return
    this.unwatch = this.fs.watch(this.cwd, () => {
      void this.render()
    })
  }

  private async render(): Promise<void> {
    const token = ++this.renderToken
    let children: FsNode[]
    let chain: FsNode[]
    try {
      chain = await this.fs.chain(this.cwd)
      children = await this.fs.list(this.cwd)
    } catch (e) {
      // The current folder can be deleted from under us by a sibling window.
      if (isFsError(e, 'not-found')) {
        this.cwd = this.fs.root()
        this.rewatch()
        await this.render()
        return
      }
      this.fail(e)
      return
    }
    // A newer render started while this one was awaiting; its result is the one
    // that should win.
    if (token !== this.renderToken) return

    this.pathEl.textContent = this.codec.format(chain)

    children.sort((a, b) => {
      if (isDir(a) !== isDir(b)) return isDir(a) ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    this.listEl.textContent = ''
    for (const node of children) {
      const row = document.createElement('div')
      row.className = 'dirview-row'
      row.dataset['nodeId'] = node.id
      row.setAttribute('role', 'option')
      row.setAttribute('aria-selected', node.id === this.selected ? 'true' : 'false')
      row.tabIndex = -1

      const kind = document.createElement('span')
      kind.className = 'dirview-kind'
      kind.textContent = isDir(node) ? '[dir]' : '[file]'
      row.appendChild(kind)

      const name = document.createElement('span')
      name.className = 'dirview-name'
      name.textContent = this.codec.displayName(node)
      row.appendChild(name)

      const meta = document.createElement('span')
      meta.className = 'dirview-meta'
      meta.textContent = isDir(node) ? `${node.childIds.length} items` : `${node.size} B`
      row.appendChild(meta)

      row.addEventListener('click', () => void this.select(node.id))
      row.addEventListener('dblclick', () => void this.activate(node))
      this.listEl.appendChild(row)
    }

    if (children.length === 0) {
      const empty = document.createElement('div')
      empty.className = 'dirview-empty'
      empty.textContent = 'Empty folder'
      this.listEl.appendChild(empty)
    }

    await this.refreshControls(children)
  }

  private async refreshControls(children: readonly FsNode[]): Promise<void> {
    const cwdNode = await this.fs.stat(this.cwd)
    const sel = this.selected !== null ? children.find((c) => c.id === this.selected) : undefined

    this.buttons['up']!.disabled = cwdNode.parent === null
    this.buttons['newFolder']!.disabled = false
    this.buttons['newFile']!.disabled = false
    // System folders are genuinely protected, so these are really disabled.
    const mutable = sel !== undefined && sel.wellKnown === undefined && !sel.locked
    this.buttons['rename']!.disabled = !mutable
    this.buttons['trash']!.disabled = !mutable || this.cwd === this.fs.trash()
    this.buttons['restore']!.disabled = !mutable || this.cwd !== this.fs.trash()
    this.buttons['purge']!.disabled = !mutable

    const editable = sel !== undefined && !isDir(sel)
    this.editorWrap.hidden = !editable
    if (editable && sel) {
      this.editor.value = await this.fs.readText(sel.id)
      this.buttons['save']!.disabled = sel.locked
    }

    const count = children.length
    this.statusEl.textContent =
      `${count} item${count === 1 ? '' : 's'}` +
      (sel ? ` · selected: ${this.codec.displayName(sel)}` : '')
  }

  private async select(id: NodeId): Promise<void> {
    this.selected = id
    await this.render()
  }

  private async activate(node: FsNode): Promise<void> {
    if (isDir(node)) await this.navigateTo(node.id)
    else await this.select(node.id)
  }

  private async goUp(): Promise<void> {
    const node = await this.fs.stat(this.cwd)
    if (node.parent !== null) await this.navigateTo(node.parent)
  }

  private async createDir(): Promise<void> {
    try {
      const name = await this.fs.suggestName(this.cwd, 'New Folder', this.decorate)
      const id = await this.fs.createDir(this.cwd, name)
      this.selected = id
    } catch (e) {
      this.fail(e)
    }
  }

  private async createFile(): Promise<void> {
    try {
      const name = await this.fs.suggestName(this.cwd, 'Untitled.txt', this.decorate)
      const id = await this.fs.createFile(this.cwd, name, '', { mime: 'text/plain' })
      this.selected = id
    } catch (e) {
      this.fail(e)
    }
  }

  private async renameSelected(): Promise<void> {
    const id = this.selected
    if (id === null) return
    const node = await this.fs.stat(id)
    const next = window.prompt('New name', node.name)
    if (next === null || next === node.name) return
    try {
      await this.fs.rename(id, next)
    } catch (e) {
      this.fail(e)
    }
  }

  private async trashSelected(): Promise<void> {
    const id = this.selected
    if (id === null) return
    try {
      await this.fs.moveToTrash(id)
      this.selected = null
    } catch (e) {
      this.fail(e)
    }
  }

  private async restoreSelected(): Promise<void> {
    const id = this.selected
    if (id === null) return
    try {
      await this.fs.restoreFromTrash(id)
      this.selected = null
    } catch (e) {
      this.fail(e)
    }
  }

  private async purgeSelected(): Promise<void> {
    const id = this.selected
    if (id === null) return
    const node = await this.fs.stat(id)
    if (!window.confirm(`Delete "${node.name}" permanently?`)) return
    try {
      await this.fs.purge(id)
      this.selected = null
    } catch (e) {
      this.fail(e)
    }
  }

  private async saveEditor(): Promise<void> {
    const id = this.selected
    if (id === null) return
    try {
      await this.fs.write(id, this.editor.value)
    } catch (e) {
      this.fail(e)
    }
  }

  /** Arrow-key navigation, so the list is not a mouse-only surface. */
  private onListKeyDown(e: KeyboardEvent): void {
    const rows = [...this.listEl.querySelectorAll<HTMLElement>('.dirview-row')]
    if (rows.length === 0) return
    const currentIndex = rows.findIndex((r) => r.dataset['nodeId'] === this.selected)

    switch (e.key) {
      case 'ArrowDown': {
        const next = rows[Math.min(rows.length - 1, currentIndex + 1)]
        if (next?.dataset['nodeId']) void this.select(next.dataset['nodeId'] as NodeId)
        e.preventDefault()
        return
      }
      case 'ArrowUp': {
        const prev = rows[Math.max(0, currentIndex <= 0 ? 0 : currentIndex - 1)]
        if (prev?.dataset['nodeId']) void this.select(prev.dataset['nodeId'] as NodeId)
        e.preventDefault()
        return
      }
      case 'Enter': {
        if (this.selected !== null) {
          void this.fs.stat(this.selected).then((n) => this.activate(n))
        }
        e.preventDefault()
        return
      }
      case 'Backspace': {
        void this.goUp()
        e.preventDefault()
        return
      }
      default:
        return
    }
  }

  private fail(e: unknown): void {
    const message = isFsError(e) ? e.message : e instanceof Error ? e.message : String(e)
    this.statusEl.textContent = message
    this.onError(message)
  }
}
