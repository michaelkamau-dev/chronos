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
