/**
 * The Terminal app.
 *
 * **It knows core and nothing else.** No era identifier appears here and
 * `test/invariants.test.js` enforces that mechanically. The one thing that would be
 * tempting to branch on — whether this era says `dir` or `ls` — arrives as data:
 * `dialect.ts` picks a shell from `PathCodec.separator`, and every command is one
 * implementation reached through a `CommandId` rather than through a word.
 *
 * **It holds no duplicate state.** Every listing, every path and every byte comes
 * from `FsApi` at the moment it is asked for. Nothing here caches a node between
 * commands, which is why a `dir` typed after a sibling window deleted something
 * shows the deletion without either window knowing the other exists.
 *
 * **It survives suspend and resume with state intact**, which is phase 5's gate.
 * The scrollback, the working directory and the command history are plain fields
 * and survive because they are data. Two things are not: a *half-typed command
 * line*, which lives in a DOM widget, and a running `find` or `tree`, which lives
 * in a suspended stack. Both are handled in `suspend()`/`resume()` below and both
 * are asserted in `test/browser/terminal.spec.ts`.
 */

import type { AppHost, AppInstance, AppModule } from '../../core/app/types.js'
import type { FsNode, NodeId, Unsubscribe } from '../../core/fs/types.js'
import { isFsError } from '../../core/fs/errors.js'
import { asAppId } from '../../core/wm/types.js'
import type { MenuSpec } from '../../core/input/menu.js'
import type { HitTarget } from '../../core/input/dispatcher.js'
import type { TextFieldWidget } from '../../core/ui/kit.js'
import { ConsoleView, line, lines } from './console.js'
import type { Block } from './console.js'
import { nameOf, shellFor } from './dialect.js'
import type { FlagId, Shell } from './dialect.js'
import { parseLine } from './parse.js'
import { HANDLERS } from './commands.js'
import type { CommandContext } from './commands.js'
import { TerminalError, promptPath } from './paths.js'

/**
 * A command line the user has not finished.
 *
 * Kept as data rather than only as a live widget, because the widget is destroyed
 * and rebuilt by every render — including the one `resume()` performs. The caret
 * offsets are part of it: a line that comes back with its text intact and the caret
 * at the start is not "state intact".
 */
interface DraftLine {
  value: string
  selStart: number
  selEnd: number
  focused: boolean
}

/** How many commands the history keeps. Both families' shells kept a bounded list. */
const HISTORY_LIMIT = 200

class TerminalApp implements AppInstance {
  private readonly host: AppHost
  private readonly shell: Shell
  private readonly console: ConsoleView

  // ---- state that must survive the suspend round trip
  private cwd: NodeId
  private readonly history: string[] = []
  /** Where Up/Down currently sits. `history.length` means "on a fresh line". */
  private historyIndex = 0
  private draft: DraftLine = { value: '', selStart: 0, selEnd: 0, focused: false }

  // ---- live machinery, rebuilt freely
  private readonly promptEl: HTMLElement
  private readonly promptRow: HTMLElement
  private field: TextFieldWidget | null = null
  private promptText = ''
  private unwatch: Unsubscribe | null = null
  private suspended = false
  private destroyed = false
  private busy = false
  /** Set by `crash`. A stopped session accepts nothing further. */
  private faulted = false
  /** Resolvers waiting on `gate()`, released by `resume()` and by `destroy()`. */
  private gateWaiters: Array<() => void> = []
  /** Coalesces the filesystem's chatter into one prompt read. */
  private promptQueued = false

  constructor(host: AppHost, startAt?: NodeId) {
    this.host = host
    this.shell = shellFor(host.codec.separator)
    this.cwd = startAt ?? host.fs.root()

    const doc = host.root.ownerDocument
    host.root.dataset['app'] = 'terminal'
    host.win.setTitle(this.shell.title)

    this.console = new ConsoleView(doc)

    this.promptRow = doc.createElement('div')
    this.promptRow.dataset['uiRole'] = 'prompt'
    this.promptEl = doc.createElement('span')
    this.promptEl.dataset['termPrompt'] = ''
    this.promptRow.appendChild(this.promptEl)

    host.root.append(this.console.el, this.promptRow)

    // A click anywhere on the scrollback puts the caret back where typing goes,
    // which is what every one of these windows did — unless the click was a
    // selection, in which case taking focus away would discard it.
    this.console.el.addEventListener('click', () => {
      const selection = doc.getSelection()
      if (selection && !selection.isCollapsed) return
      this.field?.focus()
    })
  }

  // ------------------------------------------------------------------ lifecycle

  async start(): Promise<void> {
    this.rewatch()
    await this.render()
    this.console.append(
      lines([
        'Chronos',
        `Type ${nameOf(this.shell, 'help') ?? 'help'} for the command list.`,
        '',
      ]),
    )
    this.console.scrollToEnd()
    this.field?.focus()
  }

  /**
   * Stop computing, keep every piece of state.
   *
   * Three things stop and all three are genuinely *work*: the filesystem watch,
   * which is the only way this app does anything while nobody is looking at it; any
   * walk in progress, which parks on `gate()` mid-directory rather than quietly
   * finishing; and the command line, which is put into its disabled state so a
   * suspended window cannot be typed into. Disabled rather than removed — a control
   * that says "not now" is one of the five states every interactive element ships,
   * and deleting it would be saying something else.
   *
   * The half-typed line is read out here because `resume()` rebuilds the prompt row
   * that hosts it. See `render()` for why that rebuild is unconditional.
   */
  suspend(): void {
    if (this.suspended || this.destroyed) return
    this.suspended = true

    this.captureDraft()
    this.field?.setEnabled(false)

    this.unwatch?.()
    this.unwatch = null
  }

  /**
   * Resume, rebuilding from the filesystem and from the model.
   *
   * The working directory may have been renamed, moved or deleted outright while
   * this window was stopped — by a file manager that was never suspended — so the
   * prompt is re-read rather than trusted, and a working directory that has gone
   * falls back to the root and says so.
   */
  resume(): void {
    if (!this.suspended || this.destroyed) return
    this.suspended = false
    this.rewatch()

    const waiters = this.gateWaiters
    this.gateWaiters = []
    for (const release of waiters) release()

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
    const waiters = this.gateWaiters
    this.gateWaiters = []
    for (const release of waiters) release()
    this.field?.destroy()
    this.field = null
  }

  canClose(): boolean {
    // Everything a command does is written through as it happens, so there is never
    // unsaved work. A command still running is not unsaved work either: closing the
    // window destroys the instance and the walk unwinds at its next suspension point.
    return true
  }

  // ---------------------------------------------------------------- public API

  /** The working directory. The suspend test reads it. */
  currentDir(): NodeId {
    return this.cwd
  }

  /** The scrollback as text, for the transcript and for the suspend test. */
  transcript(): string {
    return this.console.toText()
  }

  /** The commands typed so far, oldest first. */
  commandHistory(): readonly string[] {
    return this.history
  }

  /** The command line, live when there is one and captured when there is not. */
  draftLine(): Readonly<DraftLine> {
    this.captureDraft()
    return this.draft
  }

  scrollOffset(): number {
    return this.console.scrollOffset()
  }

  /** Runs a line exactly as pressing Enter on it would. */
  async run(text: string): Promise<void> {
    await this.submit(text)
  }

  // --------------------------------------------------------------------- menus

  /**
   * The app's menus.
   *
   * **No accelerators.** DECISIONS 4.47: an enabled item's accelerator must come
   * from the active keymap, and an app has no route to it — `AppHost` exposes no
   * `accelFor`, deliberately, since an app that could read the keymap could disagree
   * with it. Every item here is bare and every one is reachable by walking the menu.
   */
  menu(): MenuSpec {
    const hasText = this.console.rows() > 0
    return [
      {
        kind: 'submenu',
        label: 'File',
        enabled: true,
        items: [
          {
            kind: 'item',
            label: 'Save Transcript',
            enabled: hasText,
            onActivate: () => void this.saveTranscript(),
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
        items: [
          {
            kind: 'item',
            label: 'Select All',
            enabled: hasText,
            onActivate: () => this.selectAll(),
          },
          { kind: 'separator' },
          {
            kind: 'item',
            label: 'Clear',
            enabled: hasText,
            onActivate: () => {
              this.console.clear()
              this.field?.focus()
            },
          },
        ],
      },
      {
        kind: 'submenu',
        label: 'Help',
        enabled: true,
        items: [
          {
            kind: 'item',
            label: 'Commands',
            enabled: !this.faulted,
            onActivate: () => void this.submit(nameOf(this.shell, 'help') ?? 'help'),
          },
        ],
      },
    ]
  }

  contextMenu(_target: HitTarget): MenuSpec | null {
    const hasText = this.console.rows() > 0
    return [
      { kind: 'item', label: 'Select All', enabled: hasText, onActivate: () => this.selectAll() },
      {
        kind: 'item',
        label: 'Clear',
        enabled: hasText,
        onActivate: () => {
          this.console.clear()
          this.field?.focus()
        },
      },
      { kind: 'separator' },
      {
        kind: 'item',
        label: 'Save Transcript',
        enabled: hasText,
        onActivate: () => void this.saveTranscript(),
      },
    ]
  }

  // ------------------------------------------------------------------ rendering

  /**
   * Rebuilds the prompt row from the filesystem.
   *
   * There is one rendering path and it replaces the whole row rather than patching
   * the text inside it. That costs a capture and a restore of the command line, and
   * it buys the thing a second path always eventually loses: the prompt and the
   * control beside it cannot drift into being built two different ways. It is the
   * same trade the file manager's row rebuild makes one app earlier.
   *
   * The filesystem watch calls this too, and it is the one caller that may skip the
   * work: an event says what changed, so an unchanged path means an unchanged row.
   * `resume()` has no such information — it has been blind for the whole suspension
   * — so it always rebuilds.
   */
  private async render(onlyIfChanged = false): Promise<void> {
    if (this.destroyed) return

    let chain: FsNode[]
    try {
      chain = await this.host.fs.chain(this.cwd)
    } catch (e) {
      if (!isFsError(e, 'not-found')) throw e
      // The folder we were standing in has gone. Say so rather than silently
      // teleporting, and take the one place that always exists.
      this.cwd = this.host.fs.root()
      this.emit(line('The current folder has gone; moved to the volume root.', 'error'))
      chain = await this.host.fs.chain(this.cwd)
    }
    if (this.destroyed) return

    const next = `${promptPath(this.host.codec, chain)}${this.shell.promptSuffix}`
    if (onlyIfChanged && next === this.promptText && this.field !== null) return

    this.captureDraft()
    this.promptText = next
    this.promptEl.textContent = next
    this.mountCommandLine()
  }

  /**
   * Builds the command line and puts the draft back into it.
   *
   * Focus is restored only when the widget being replaced had it, so a rebuild
   * triggered while the user was selecting text in the scrollback does not snatch
   * the caret back.
   */
  private mountCommandLine(): void {
    const previous = this.field
    previous?.destroy()

    const field = this.host.ui.textField({
      label: 'Command',
      value: this.draft.value,
      onInput: (value) => {
        this.draft.value = value
        // Typing leaves whatever the history was showing and becomes a fresh line.
        this.historyIndex = this.history.length
      },
      onCommit: (value) => void this.submit(value),
    })
    field.el.dataset['uiRole'] = 'command'
    field.el.addEventListener('keydown', (e) => this.onCommandKey(e))
    this.promptRow.appendChild(field.el)
    this.field = field

    if (!this.suspended && !this.faulted && !this.busy) field.setEnabled(true)
    else field.setEnabled(false)

    field.select(this.draft.selStart, this.draft.selEnd)
    if (this.draft.focused) field.focus()
  }

  /** Reads the live command line back into the draft record, if there is one. */
  private captureDraft(): void {
    const field = this.field
    if (!field) return
    const selection = field.selection()
    this.draft = {
      value: field.value(),
      selStart: selection.start,
      selEnd: selection.end,
      focused: field.el.ownerDocument.activeElement === field.el,
    }
  }

  private setDraft(value: string): void {
    this.draft = { value, selStart: value.length, selEnd: value.length, focused: true }
    const field = this.field
    if (!field) return
    field.setValue(value)
    field.select(value.length, value.length)
  }

  // ------------------------------------------------------------------- keyboard

  /**
   * The keys a command line owns.
   *
   * Enter and Escape belong to the field widget itself. History and scrollback are
   * this app's, and both are keyboard paths for things that otherwise need a mouse
   * — `CLAUDE.md` requires every mouse interaction to have one, and the scrollback
   * is a scrolling region with no other way in.
   */
  private onCommandKey(e: KeyboardEvent): void {
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault()
        this.recall(-1)
        return
      case 'ArrowDown':
        e.preventDefault()
        this.recall(1)
        return
      case 'PageUp':
        e.preventDefault()
        this.console.setScrollOffset(this.console.scrollOffset() - this.console.el.clientHeight)
        return
      case 'PageDown':
        e.preventDefault()
        this.console.setScrollOffset(this.console.scrollOffset() + this.console.el.clientHeight)
        return
      case 'Home':
        if (!e.ctrlKey && !e.metaKey) return
        e.preventDefault()
        this.console.setScrollOffset(0)
        return
      case 'End':
        if (!e.ctrlKey && !e.metaKey) return
        e.preventDefault()
        this.console.scrollToEnd()
        return
      default:
        return
    }
  }

  private recall(step: number): void {
    if (this.history.length === 0) return
    const next = Math.max(0, Math.min(this.history.length, this.historyIndex + step))
    this.historyIndex = next
    // Past the newest entry is the empty line the user was on, which is what both
    // families' history did rather than sticking on the last command.
    this.setDraft(next === this.history.length ? '' : (this.history[next] ?? ''))
  }

  // -------------------------------------------------------------------- running

  private async submit(text: string): Promise<void> {
    if (this.destroyed || this.faulted || this.busy) return
    const trimmed = text.trim()

    this.console.append({ tone: 'input', rows: [{ cells: [`${this.promptText}${text}`] }] })
    this.setDraft('')

    if (trimmed.length > 0 && this.history[this.history.length - 1] !== trimmed) {
      this.history.push(trimmed)
      if (this.history.length > HISTORY_LIMIT) this.history.shift()
    }
    this.historyIndex = this.history.length

    if (trimmed.length === 0) {
      this.console.scrollToEnd()
      return
    }

    this.busy = true
    this.field?.setEnabled(false)
    try {
      await this.dispatch(trimmed)
    } finally {
      this.busy = false
      if (!this.destroyed && !this.faulted && !this.suspended) {
        this.field?.setEnabled(true)
        this.field?.focus()
      }
      this.console.scrollToEnd()
    }
  }

  private async dispatch(text: string): Promise<void> {
    const parsed = parseLine(this.shell, text)
    if (!parsed) return
    if (parsed.command === null) {
      this.emit(line(this.shell.notFound(parsed.word), 'error'))
      return
    }
    if (parsed.unknownFlags.length > 0) {
      this.emit(line(`${parsed.word}: unknown switch ${parsed.unknownFlags.join(' ')}`, 'error'))
      return
    }
    try {
      await HANDLERS[parsed.command](this.context(parsed.flags, parsed.operands))
    } catch (e) {
      if (this.destroyed) return
      this.emit(line(messageFor(e), 'error'))
    }
  }

  private context(
    flags: ReadonlySet<FlagId>,
    operands: readonly string[],
  ): CommandContext {
    const app = this
    return {
      host: this.host,
      shell: this.shell,
      codec: this.host.codec,
      get cwd(): NodeId {
        return app.cwd
      },
      flags,
      operands,
      stat: (id) => this.host.fs.stat(id),
      chain: (id) => this.host.fs.chain(id),
      list: (id) => this.host.fs.list(id),
      out: (block: Block) => this.emit(block),
      chdir: async (id: NodeId) => {
        this.cwd = id
        this.rewatch()
        await this.render()
      },
      clearScreen: () => this.console.clear(),
      gate: () => this.gate(),
      gone: () => this.destroyed,
      raiseFault: (reason: string) => this.raiseFault(reason),
      rebootSession: () => location.reload(),
      switchEra: (name: string) => {
        const url = new URL(location.href)
        url.searchParams.set('era', name)
        location.assign(url.toString())
      },
      eraSelection: () => new URLSearchParams(location.search).get('era'),
    }
  }

  /**
   * Every line that reaches the scrollback goes through here.
   *
   * The shell's error marker is applied at this one point rather than at each of the
   * dozen places that report a failure, so a shell that marks its diagnostics cannot
   * mark some of them. It goes into the *model*, not into the rendering, because a
   * saved transcript has to read the same as the window it came from.
   */
  private emit(block: Block): void {
    const prefix = this.shell.errorPrefix
    if (block.tone === 'error' && prefix.length > 0) {
      this.console.append({
        ...block,
        rows: block.rows.map((row) => ({
          ...row,
          cells: row.cells.map((cell, i) => (i === 0 ? `${prefix}${cell}` : cell)),
        })),
      })
    } else {
      this.console.append(block)
    }
    this.console.scrollToEnd()
  }

  /**
   * The suspension point a walk parks on.
   *
   * Resolves immediately while the window is live. While it is suspended the walk
   * stops between directories and costs nothing at all — which is the difference
   * between an app that stops computing and one that merely stops showing its work.
   */
  private gate(): Promise<void> {
    if (!this.suspended || this.destroyed) return Promise.resolve()
    return new Promise<void>((resolve) => this.gateWaiters.push(resolve))
  }

  /**
   * A real unhandled fault, and a session that really stops.
   *
   * The error is thrown from a task of its own so nothing in this call stack can
   * catch it: that is what an app-level error boundary will see when §10's boundary
   * exists, and it is what the browser reports today. The window stays open because
   * closing it is the recovery path — §10 requires each failure state to have one,
   * and for a single window it is the window.
   */
  private raiseFault(reason: string): void {
    this.faulted = true
    this.emit(
      lines([`Fault: ${reason}`, 'This session has stopped. Close the window to end it.'], 'error'),
    )
    this.field?.setEnabled(false)
    const fault = new Error(`Chronos terminal fault: ${reason}`)
    setTimeout(() => {
      throw fault
    })
  }

  // ------------------------------------------------------------------ the rest

  private rewatch(): void {
    this.unwatch?.()
    this.unwatch = null
    // A suspended app arms nothing. Re-subscribing while suspended would quietly
    // restart the background work `suspend()` exists to stop.
    if (this.suspended || this.destroyed) return
    /*
     * `watchAll`, not `watch(cwd)`.
     *
     * The prompt is the whole path, so renaming *any* folder above the working
     * directory changes it — and a rename notifies the renamed node's parent, not
     * the node itself. Watching one directory would leave the prompt showing a
     * folder name that no longer exists. The cost is bounded by the short-circuit
     * in `render`: an event whose path is unchanged rebuilds nothing.
     */
    this.unwatch = this.host.fs.watchAll(() => {
      if (this.promptQueued) return
      this.promptQueued = true
      queueMicrotask(() => {
        this.promptQueued = false
        if (!this.suspended && !this.destroyed) void this.render(true)
      })
    })
  }

  private selectAll(): void {
    const doc = this.host.root.ownerDocument
    const selection = doc.getSelection()
    if (!selection) return
    const range = doc.createRange()
    range.selectNodeContents(this.console.el)
    selection.removeAllRanges()
    selection.addRange(range)
  }

  /**
   * Writes the scrollback into the filesystem through the system Save dialog.
   *
   * The dialog is a core service on the window handle — this app does not know a
   * file manager exists — and what comes back is a location and a *canonical stored
   * name*, which is why nothing here decorates it.
   */
  private async saveTranscript(): Promise<void> {
    const target = await this.host.win.saveFile({
      title: 'Save Transcript',
      startAt: this.cwd,
      suggestedName: 'Transcript.txt',
    })
    if (target === null) return
    try {
      const name = await this.host.fs.suggestName(target.parent, target.name, this.host.decorate)
      await this.host.fs.createFile(target.parent, name, `${this.console.toText()}\n`, {
        mime: 'text/plain',
      })
    } catch (e) {
      this.emit(line(messageFor(e), 'error'))
    }
  }
}

function messageFor(e: unknown): string {
  if (e instanceof TerminalError) return e.message
  if (isFsError(e)) return e.message
  return e instanceof Error ? e.message : String(e)
}

/**
 * The module the shell launches.
 *
 * `title` is what the window carries for the instant before `mount` runs; the app
 * replaces it with the shell's own name as soon as it can see the codec, because
 * which shell this is is a fact about the era's path syntax and not something an
 * `AppModule` can know before it is given a host.
 */
export const terminalApp: AppModule = {
  id: asAppId('terminal'),
  title: 'Terminal',
  defaultSize: { w: 480, h: 300 },
  minSize: { w: 240, h: 140 },
  resizable: true,
  mount(host: AppHost): AppInstance {
    const app = new TerminalApp(host)
    void app.start()
    return app
  },
}

/**
 * A module that opens onto a given folder.
 *
 * `AppModule.mount` takes only a host, so a starting folder cannot travel through
 * it. The launch site builds a module that closes over the folder instead — the
 * same mechanism the entry point already uses for era bundles, and it costs the
 * contract nothing.
 */
export function terminalAppAt(startAt: NodeId): AppModule {
  return {
    ...terminalApp,
    mount(host: AppHost): AppInstance {
      const app = new TerminalApp(host, startAt)
      void app.start()
      return app
    },
  }
}

export type { TerminalApp }
