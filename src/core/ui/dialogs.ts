/**
 * Dialogs, as a core service.
 *
 * **Why core owns these and no app exports them.** §5's contract line already put
 * `openDialog` on `WindowHandle`, and every other reading breaks something:
 *
 * - *"An app knows core and nothing else."* If the editor calls the file manager
 *   for Save As, the editor knows the file manager exists — the top invariant in
 *   `CLAUDE.md`, broken directly, and five apps made to depend on a sixth's build
 *   order.
 * - **The owning app may not be running.** A dialog implemented inside a file
 *   manager fails the moment the user closes that window, unless the file manager
 *   becomes an always-mounted singleton — which is worse, because an app the user
 *   quit would still be holding a filesystem watch.
 * - **The modal belongs to the caller's window.** `wm.open({ modalOwner })` is the
 *   mechanism, and the owner has to be the window that asked, or the shell's
 *   existing blocked-click feedback flashes the wrong caption.
 * - **The eras agree.** These were operating-system services — `comdlg32`'s
 *   `GetOpenFileName` on both Windows eras, the Standard File Package on the
 *   classic Macs, `NSOpenPanel` on Tiger. Every app's Open box looked identical
 *   and none of them looked like the file manager's own window, because the file
 *   manager was not what drew it.
 *
 * Everything here is era-neutral. The dialog is a window like any other, so it
 * gets the active skin's chrome for free, and its contents are tier-1 widgets, so
 * it gets the active skin's controls for free. Nothing in this file knows how many
 * eras exist.
 */

import type { FsApi, FsNode, NameDecorator, NodeId, PathCodec } from '../fs/types.js'
import { isDir } from '../fs/types.js'
import type { WindowManager } from '../wm/manager.js'
import { asAppId, type WindowId } from '../wm/types.js'
import type { Size } from '../geometry.js'
import { createUiKit, type ListRow, type UiKit } from './kit.js'

export interface DialogButton {
  label: string
  /** Enter activates this one. At most one button should declare it. */
  isDefault?: boolean
  /** Escape activates this one, and so does the frame's close box. */
  isCancel?: boolean
  /**
   * Consulted before the dialog closes. Returning false keeps it open, which is
   * what lets a Save dialog refuse an empty or invalid name in place rather than
   * closing and failing afterwards.
   */
  validate?(): boolean | Promise<boolean>
}

export interface DialogSpec {
  title: string
  /**
   * Fills the dialog body with tier-1 widgets. Returns a teardown, or nothing.
   * The kit passed in is the *dialog's* kit, rooted at the dialog's own content,
   * so its delegated listeners go away with the dialog.
   */
  build(body: HTMLElement, ui: UiKit): (() => void) | void
  buttons: readonly DialogButton[]
  size?: Size
}

export interface MessageSpec {
  title: string
  message: string
  /** Defaults to a single OK. */
  buttons?: readonly DialogButton[]
}

export interface FileOpenSpec {
  title?: string
  startAt?: NodeId
  /**
   * MIME prefixes a file must match to be selectable — `['image/']` for a picture
   * viewer. Folders are always navigable regardless. Omit to accept anything.
   */
  accept?: readonly string[]
}

export interface FileSaveSpec {
  title?: string
  startAt?: NodeId
  suggestedName?: string
}

export interface FileSaveTarget {
  parent: NodeId
  /** A canonical stored name. Era decoration is the codec's business, not this. */
  name: string
}

/** What the dialog service needs from the rest of the system. */
export interface DialogHostDeps {
  readonly wm: WindowManager
  readonly fs: FsApi
  readonly codec: PathCodec
  readonly decorate: NameDecorator
}

const DEFAULT_DIALOG_SIZE: Size = { w: 320, h: 150 }
/**
 * The file dialog's size.
 *
 * Chosen to fit inside the smallest work area any era presents — System 1's
 * 512x342 viewport, less a 20px menu bar and the harness's 24px status strip —
 * with margin on every side. That is a constraint, not a measurement: no era's
 * documentation states a size for a dialog whose content is ours.
 */
const FILE_DIALOG_SIZE: Size = { w: 380, h: 260 }

export class DialogService {
  private readonly deps: DialogHostDeps

  constructor(deps: DialogHostDeps) {
    this.deps = deps
  }

  /**
   * Opens a modal dialog owned by `owner` and resolves with the index of the
   * button that dismissed it.
   *
   * A dialog dismissed by its frame's close box resolves to the cancel button's
   * index, or to -1 when the spec declares none — so a caller always learns that
   * nothing was chosen rather than hanging on a promise that never settles.
   */
  open(owner: WindowId, spec: DialogSpec): Promise<number> {
    const { wm } = this.deps
    const size = spec.size ?? DEFAULT_DIALOG_SIZE
    const ownerRect = wm.get(owner)?.rect
    const work = wm.workArea()
    // Centred on the owner where there is room, then clamped into the work area,
    // which is what keeps a 380px dialog on a 512px screen.
    const wanted = ownerRect
      ? {
          x: Math.round(ownerRect.x + (ownerRect.w - size.w) / 2),
          y: Math.round(ownerRect.y + (ownerRect.h - size.h) / 3),
          w: size.w,
          h: size.h,
        }
      : {
          x: Math.round(work.x + (work.w - size.w) / 2),
          y: Math.round(work.y + (work.h - size.h) / 3),
          w: size.w,
          h: size.h,
        }
    const rect = {
      x: Math.max(work.x, Math.min(wanted.x, work.x + work.w - size.w)),
      y: Math.max(work.y, Math.min(wanted.y, work.y + work.h - size.h)),
      w: Math.min(size.w, work.w),
      h: Math.min(size.h, work.h),
    }

    const id = wm.open({
      appId: asAppId('dialog'),
      title: spec.title,
      modalOwner: owner,
      resizable: false,
      minSize: { w: Math.min(size.w, work.w), h: Math.min(size.h, work.h) },
      rect,
    })

    const handle = wm.handleOf(id)
    if (!handle) return Promise.resolve(-1)

    const cancelIndex = spec.buttons.findIndex((b) => b.isCancel === true)

    return new Promise<number>((resolve) => {
      const doc = handle.content.ownerDocument
      const shellEl = doc.createElement('div')
      shellEl.dataset['ui'] = 'dialog'
      const body = doc.createElement('div')
      body.dataset['ui'] = 'dialogbody'
      const buttonRow = doc.createElement('div')
      buttonRow.dataset['ui'] = 'dialogbuttons'
      shellEl.append(body, buttonRow)
      handle.content.appendChild(shellEl)

      const ui = createUiKit(shellEl)
      const teardown = spec.build(body, ui)

      let settled = false
      const finish = (index: number): void => {
        if (settled) return
        settled = true
        unsubscribe()
        teardown?.()
        ui.destroy()
        // Force, because the dialog's own buttons are the decision — running a
        // close guard here would ask a second time.
        void wm.close(id, { force: true })
        resolve(index)
      }

      const choose = async (index: number): Promise<void> => {
        const button = spec.buttons[index]
        if (!button) return
        if (button.validate) {
          const ok = await button.validate()
          if (!ok) return
        }
        finish(index)
      }

      for (let i = 0; i < spec.buttons.length; i++) {
        const button = spec.buttons[i]
        if (!button) continue
        const index = i
        const widget = ui.button({
          label: button.label,
          ...(button.isDefault === true ? { isDefault: true } : {}),
          onActivate: () => void choose(index),
        })
        buttonRow.appendChild(widget.el)
      }

      // Enter and Escape are bound on the dialog rather than on each button, so
      // they work wherever focus is — which is the behaviour every one of the six
      // eras had and the reason a text field inside a dialog stops its own Enter.
      const onKeyDown = (e: KeyboardEvent): void => {
        if (e.key === 'Enter') {
          const i = spec.buttons.findIndex((b) => b.isDefault === true)
          if (i >= 0) {
            e.preventDefault()
            e.stopPropagation()
            void choose(i)
          }
          return
        }
        if (e.key === 'Escape') {
          if (cancelIndex >= 0) {
            e.preventDefault()
            e.stopPropagation()
            void choose(cancelIndex)
          }
        }
      }
      shellEl.addEventListener('keydown', onKeyDown)

      // The frame's own close box bypasses the buttons entirely.
      const unsubscribe = wm.subscribe((e) => {
        if (e.id === id && e.type === 'closed') {
          if (settled) return
          settled = true
          teardown?.()
          ui.destroy()
          resolve(cancelIndex)
        }
      })

      // Focus the default button so Enter works before anything is touched, and
      // so a keyboard-only user is never dropped into a dialog with no cursor.
      const firstDefault = buttonRow.querySelector<HTMLElement>('[data-default="true"]')
      ;(firstDefault ?? buttonRow.querySelector<HTMLElement>('[data-ui="button"]'))?.focus()
    })
  }

  message(owner: WindowId, spec: MessageSpec): Promise<number> {
    const buttons = spec.buttons ?? [{ label: 'OK', isDefault: true, isCancel: true }]
    return this.open(owner, {
      title: spec.title,
      buttons,
      build: (body, ui) => {
        const text = ui.label({ text: spec.message })
        text.el.dataset['uiRole'] = 'message'
        body.appendChild(text.el)
      },
    })
  }

  async openFile(owner: WindowId, spec: FileOpenSpec = {}): Promise<NodeId | null> {
    const chooser = new FileChooser(this.deps, 'open', spec.startAt ?? this.deps.fs.root(), {
      ...(spec.accept !== undefined ? { accept: spec.accept } : {}),
    })
    const index = await this.open(owner, chooser.spec(spec.title ?? 'Open'))
    if (index !== 0) return null
    return chooser.chosenFile()
  }

  async saveFile(owner: WindowId, spec: FileSaveSpec = {}): Promise<FileSaveTarget | null> {
    const chooser = new FileChooser(this.deps, 'save', spec.startAt ?? this.deps.fs.root(), {
      ...(spec.suggestedName !== undefined ? { suggestedName: spec.suggestedName } : {}),
    })
    const index = await this.open(owner, chooser.spec(spec.title ?? 'Save As'))
    if (index !== 0) return null
    return chooser.chosenTarget()
  }

  /**
   * Choose a folder rather than a file.
   *
   * It exists because `CLAUDE.md` requires every mouse interaction to have a
   * keyboard path, and dragging a file onto a folder is otherwise a gesture with
   * no equivalent. A "Move To…" command needs somewhere to send the selection, and
   * a folder chooser is what every era's equivalent used.
   */
  async chooseFolder(owner: WindowId, spec: FileOpenSpec = {}): Promise<NodeId | null> {
    const chooser = new FileChooser(this.deps, 'folder', spec.startAt ?? this.deps.fs.root(), {})
    const index = await this.open(owner, chooser.spec(spec.title ?? 'Choose Folder'))
    if (index !== 0) return null
    return chooser.chosenFolder()
  }
}

/**
 * The shared body of both file dialogs.
 *
 * Open and Save differ by one text field and by what the accept button means, so
 * they are one implementation with two modes rather than two that drift. The list
 * is the same tier-1 list widget the file manager uses, which is what makes the
 * dialog inherit an era's list styling without the dialog knowing an era exists.
 */
class FileChooser {
  private readonly deps: DialogHostDeps
  private readonly mode: 'open' | 'save' | 'folder'
  private readonly accept: readonly string[] | undefined
  private readonly suggestedName: string | undefined

  private cwd: NodeId
  private nodes: FsNode[] = []
  private selectedId: NodeId | null = null
  private nameValue = ''
  private setLocation: ((text: string) => void) | null = null
  private setRows: ((rows: readonly ListRow[]) => void) | null = null
  private unwatch: (() => void) | null = null

  constructor(
    deps: DialogHostDeps,
    mode: 'open' | 'save' | 'folder',
    startAt: NodeId,
    opts: { accept?: readonly string[]; suggestedName?: string },
  ) {
    this.deps = deps
    this.mode = mode
    this.cwd = startAt
    this.accept = opts.accept
    this.suggestedName = opts.suggestedName
    this.nameValue = opts.suggestedName ?? ''
  }

  spec(title: string): DialogSpec {
    return {
      title,
      size: FILE_DIALOG_SIZE,
      buttons: [
        {
          label: this.mode === 'save' ? 'Save' : this.mode === 'folder' ? 'Choose' : 'Open',
          isDefault: true,
          validate: () => this.validate(),
        },
        { label: 'Cancel', isCancel: true },
      ],
      build: (body, ui) => this.build(body, ui),
    }
  }

  chosenFile(): NodeId | null {
    return this.selectedId
  }

  /** The folder the chooser is showing, which is what `folder` mode returns. */
  chosenFolder(): NodeId | null {
    return this.cwd
  }

  chosenTarget(): FileSaveTarget | null {
    const name = this.nameValue.trim()
    if (name.length === 0) return null
    return { parent: this.cwd, name }
  }

  private build(body: HTMLElement, ui: UiKit): () => void {
    const location = ui.label({ text: '' })
    location.el.dataset['uiRole'] = 'location'
    this.setLocation = (text) => location.setText(text)

    const up = ui.button({
      label: 'Up',
      title: 'Go to the enclosing folder',
      onActivate: () => void this.goUp(),
    })

    const list = ui.list({
      label: 'Files',
      layout: 'rows',
      columns: [{ key: 'name', label: 'Name' }],
      onSelectionChange: (ids) => {
        const id = (ids[0] ?? null) as NodeId | null
        this.selectedId = id
        if (id !== null && this.mode === 'save') {
          const node = this.nodes.find((n) => n.id === id)
          if (node && !isDir(node)) {
            this.nameValue = node.name
            nameField?.setValue(node.name)
          }
        }
      },
      onActivate: (rowId) => void this.activate(rowId as NodeId),
    })
    this.setRows = (rows) => list.setRows(rows)

    const header = body.ownerDocument.createElement('div')
    header.dataset['uiRole'] = 'chooser-header'
    header.append(up.el, location.el)
    body.append(header, list.el)

    let nameField: ReturnType<UiKit['textField']> | null = null
    if (this.mode === 'save') {
      const row = body.ownerDocument.createElement('div')
      row.dataset['uiRole'] = 'chooser-name'
      const caption = ui.label({ text: 'Name' })
      nameField = ui.textField({
        label: 'File name',
        value: this.nameValue,
        onInput: (v) => {
          this.nameValue = v
        },
      })
      row.append(caption.el, nameField.el)
      body.appendChild(row)
      // Select the stem so typing replaces the name and keeps the extension,
      // which is what every era's Save dialog did with a suggested name.
      const stem = this.nameValue.lastIndexOf('.')
      nameField.focus()
      nameField.select(0, stem > 0 ? stem : this.nameValue.length)
    } else {
      list.focus()
    }

    void this.refresh()
    return () => {
      this.unwatch?.()
      this.unwatch = null
      this.setRows = null
      this.setLocation = null
    }
  }

  private async refresh(): Promise<void> {
    const { fs, codec } = this.deps
    this.unwatch?.()
    this.unwatch = fs.watch(this.cwd, () => void this.refresh())

    const [chain, children] = await Promise.all([fs.chain(this.cwd), fs.list(this.cwd)])
    this.nodes = children
    this.setLocation?.(codec.format(chain))

    const sorted = [...children].sort((a, b) => {
      if (isDir(a) !== isDir(b)) return isDir(a) ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    this.setRows?.(
      sorted.map((node) => ({
        id: node.id,
        cells: [codec.displayName(node)],
        /*
         * A **category**, not a character.
         *
         * `ListRow.glyph` documents this at length and this call site was the one
         * that did not follow it: it passed `▸` and `·`, so the kit wrote
         * `data-glyph="▸"` and every skin's rule — which matches `folder`,
         * `document`, `image`, `sound` and `trash` — missed, leaving the file
         * chooser drawing an empty box in front of every row in all six eras. Not
         * the grey-pixel failure the categories were introduced to stop, because
         * the kit emits no text either way; the other half of it, where the mark
         * simply never appears.
         */
        glyph: isDir(node) ? 'folder' : 'document',
        // A file the caller will not accept is shown and not choosable, which is
        // what every era did — the alternative hides the user's own file and
        // makes the dialog look broken.
        disabled: !isDir(node) && !this.acceptable(node),
      })),
    )
  }

  private acceptable(node: FsNode): boolean {
    if (isDir(node)) return true
    // A folder chooser shows files so the user can see where they are, and lets
    // none of them be picked. Hiding them would make a populated folder look empty.
    if (this.mode === 'folder') return false
    if (this.accept === undefined) return true
    return this.accept.some((prefix) => node.mime.startsWith(prefix))
  }

  private async activate(id: NodeId): Promise<void> {
    const node = this.nodes.find((n) => n.id === id)
    if (!node) return
    if (isDir(node)) {
      this.cwd = node.id
      this.selectedId = null
      await this.refresh()
    }
  }

  private async goUp(): Promise<void> {
    const node = await this.deps.fs.stat(this.cwd)
    if (node.parent === null) return
    this.cwd = node.parent
    this.selectedId = null
    await this.refresh()
  }

  private async validate(): Promise<boolean> {
    // A folder chooser accepts wherever it currently is, so navigating *is* choosing
    // and there is nothing to validate.
    if (this.mode === 'folder') return true
    if (this.mode === 'open') {
      const id = this.selectedId
      if (id === null) return false
      const node = this.nodes.find((n) => n.id === id)
      if (!node) return false
      if (isDir(node)) {
        // Enter on a folder navigates rather than choosing it, which is what the
        // accept button did in every era's Open box.
        await this.activate(id)
        return false
      }
      return this.acceptable(node)
    }
    const name = this.nameValue.trim()
    if (name.length === 0) return false
    // Path separators from any era are rejected by the filesystem anyway; catching
    // them here means the dialog says so instead of throwing after it closes.
    return !/[/\\:]/.test(name)
  }
}
