/**
 * The app contract.
 *
 * ARCHITECTURE.md §5 specifies this interface and phase 5 implements it six times.
 * It exists here now, ahead of any app, because §8's sixth era is the one that makes
 * `suspend()` and `resume()` load-bearing and a contract that arrives with its first
 * consumer has never been tested against a second.
 *
 * **What is and is not verified.** The interface is real, the routing in
 * `shell/shell.ts` is real, and the harness's directory view implements it and is
 * exercised by `test/browser/wm.spec.ts`. What is *not* here is the phase-5 gate:
 * "every app survives `suspend()`/`resume()` with state intact — Paint's undo stack,
 * the editor's cursor and selection, the terminal's scrollback — verified per app,
 * not asserted." There are no apps yet. One harness implementation is a proof that
 * the contract is wireable, not a proof that six apps honour it, and the difference
 * is exactly the one `MinimizeStyle`'s unexercised `'collapse'` member cost: a union
 * member no era had declared was untested code, and every site that switched on it
 * was wrong in a way nothing failed on.
 */

import type { HitTarget } from '../input/dispatcher.js'
import type { MenuSpec } from '../input/menu.js'
import type { UiKit } from '../ui/kit.js'
import type { DialogSpec, FileOpenSpec, FileSaveSpec, FileSaveTarget, MessageSpec } from '../ui/dialogs.js'
import type { FsApi, NameDecorator, NodeId, PathCodec } from '../fs/types.js'
import type { AppId, WindowId } from '../wm/types.js'
import type { Size } from '../geometry.js'

/**
 * A mounted app.
 *
 * `suspend()` and `resume()` are **required**, not optional, and the asymmetry with
 * `onFocus?()` beside them is deliberate. Focus is a notification an app may ignore.
 * Suspension is not: an era exists whose entire thesis is that unfocused work stops,
 * and `CLAUDE.md` states the obligation as a correctness requirement rather than a
 * lifecycle nicety — "every app must survive `suspend()`/`resume()` with full state
 * intact, verified per app". An optional method is one an app can forget, and the
 * symptom of forgetting is a media player that keeps drawing while suspended, which
 * looks like nothing at all until someone measures the frame count. Making it
 * required turns that into a compile error, the same mechanism §5 already uses to
 * force all five widget states.
 */
export interface AppInstance {
  /** The app's own menus, for an era that renders a menu bar. */
  menu(): MenuSpec
  /** The context menu for a right-click inside the app's content, or null. */
  contextMenu(target: HitTarget): MenuSpec | null
  /** The unsaved-changes guard. Returning false cancels the close. */
  canClose(): boolean | Promise<boolean>

  onFocus?(): void
  onBlur?(): void
  onResize?(w: number, h: number): void

  /**
   * Stop computing and release anything that ticks.
   *
   * Timers, animation subscriptions, media playback, in-flight work. State must be
   * *retained* — this is not `destroy()`, and the window is still on screen showing
   * whatever it last rendered. An app that rebuilds cheaply may do nothing here; an
   * app that holds a running clock may not.
   */
  suspend(): void

  /** Resume computing, with every piece of state exactly as `suspend()` left it. */
  resume(): void

  destroy(): void
}

/**
 * What an app may do to its own window.
 *
 * Deliberately five methods. An app that could reach the window manager could
 * move, raise and close *other* windows, and §2's first invariant works in both
 * directions — the WM knows nothing about apps, and an app knows nothing about
 * the WM beyond the window it was given.
 */
export interface WindowHandle {
  readonly id: WindowId
  setTitle(title: string): void
  /** Drives the era's dirty indicator and the close guard. */
  setDirty(dirty: boolean): void
  /** Asks the window manager to close, which consults `AppInstance.canClose`. */
  requestClose(): void

  /**
   * A modal dialog owned by this window.
   *
   * Resolves to the index of the button that dismissed it. Owned by the *calling*
   * window rather than by whichever app implements the dialog, which is what makes
   * the shell's existing blocked-click feedback work without the dialog knowing it
   * exists.
   */
  openDialog(spec: DialogSpec): Promise<number>
  /** A message or confirmation. Resolves to the index of the button pressed. */
  message(spec: MessageSpec): Promise<number>
  /** The system Open dialog. Resolves to the chosen file, or null if cancelled. */
  openFile(spec?: FileOpenSpec): Promise<NodeId | null>
  /** The system Save dialog. Resolves to a parent and a name, or null. */
  saveFile(spec?: FileSaveSpec): Promise<FileSaveTarget | null>
  /**
   * Choose a folder. Resolves to the folder, or null.
   *
   * The keyboard path for dragging something onto a folder, which `CLAUDE.md`
   * requires every mouse gesture to have.
   */
  chooseFolder(spec?: FileOpenSpec): Promise<NodeId | null>
}

/**
 * Everything an app is given, and nothing else.
 *
 * `codec` and `decorate` are here because an app cannot import a skin and cannot
 * render a single filename without them: `codec.displayName` decides whether a
 * node shows as `Documents` or `My Documents` and whether its extension is
 * visible, `codec.format` builds a location string, and `decorate` supplies the
 * era's collision suffix when a new folder lands on a taken name. §5's original
 * table omitted both, which worked only for as long as the sole consumer was a
 * harness constructed in `main.ts` and handed them out of band.
 *
 * There is no `sound` field. §9 is phase 6, nothing exists behind it, and a field
 * that resolves to nothing is precisely the unfinished work `CLAUDE.md` forbids
 * shipping. Adding it when there is something real to put there costs one line.
 */
export interface AppHost {
  /** The frame's `[data-content]`. The app owns everything inside it. */
  readonly root: HTMLElement
  readonly fs: FsApi
  readonly codec: PathCodec
  readonly decorate: NameDecorator
  readonly win: WindowHandle
  readonly ui: UiKit
}

/**
 * An app, as the shell sees it before anything is mounted.
 *
 * `mount` is called once per window, so opening a second Files window builds a
 * second independent instance over the same filesystem — which is the invariant
 * phase 2 was gated on and the reason two windows on one folder stay in step
 * without knowing about each other.
 */
export interface AppModule {
  readonly id: AppId
  readonly title: string
  readonly defaultSize: Size
  readonly minSize: Size
  readonly resizable: boolean
  mount(host: AppHost): AppInstance
}

/** Where a launch should start, for an app that opens onto a location. */
export interface LaunchOptions {
  startAt?: NodeId
  title?: string
}

