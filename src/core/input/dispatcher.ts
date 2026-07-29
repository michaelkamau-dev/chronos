/**
 * The root event dispatcher.
 *
 * Nine listeners on `#chronos-root`, for the lifetime of the page, regardless of
 * how many windows exist. Per event it does exactly one coordinate conversion
 * (client px to logical era px, dividing by the display scale) and one
 * `closest()` walk to resolve the target, writing the result into a single
 * reused `HitTarget` object.
 *
 * The dispatcher knows about window chrome parts, resize handles, the desktop
 * and the capture stack. It knows nothing about which era is active: the chords
 * it resolves come from the skin's keymap and it only ever executes semantic
 * commands.
 */

import type { FrameAction, ResizeEdge, WindowId } from '../wm/types.js'
import type { WindowManager } from '../wm/manager.js'
import type { GestureController } from '../wm/drag.js'
import type { CaptureStack } from './capture.js'
import type { CommandRegistry } from './commands.js'
import type { KeymapStack } from './keymap.js'
import { FocusScope } from './focus.js'

export type HitKind =
  | 'titlebar'
  | 'action'
  | 'resize'
  | 'content'
  | 'desktop'
  | 'shell'
  | 'none'

export interface HitTarget {
  kind: HitKind
  /** Set for titlebar/action/resize/content. */
  windowId: WindowId | null
  action: FrameAction | null
  edge: ResizeEdge | null
  /** The element the event actually landed on. */
  el: HTMLElement | null
}

export interface DisplayTransform {
  /** Integer scale factor applied to the whole desktop. */
  scale: number
  /** Offset of the scaled desktop within the viewport, in client px. */
  offsetX: number
  offsetY: number
}

export interface DispatcherHooks {
  /** Right-click or the keyboard menu key. Return true if a menu was opened. */
  onContextMenu?(hit: HitTarget, x: number, y: number): boolean
  /** A click that landed on nothing in particular. */
  onDesktopPointerDown?(x: number, y: number, e: PointerEvent): void
  /** Pointer landed on a window blocked by its own modal. */
  onBlockedInteraction?(blockedId: WindowId, modalId: WindowId): void
}

const DOUBLE_CLICK_MS = 400
const DOUBLE_CLICK_SLOP = 4

export class Dispatcher {
  private readonly root: HTMLElement
  private readonly wm: WindowManager
  private readonly gestures: GestureController
  private readonly capture: CaptureStack
  private readonly keymaps: KeymapStack
  private readonly commands: CommandRegistry
  private readonly hooks: DispatcherHooks
  readonly focusScope = new FocusScope()

  private display: DisplayTransform = { scale: 1, offsetX: 0, offsetY: 0 }

  /** Reused across every event. The dispatcher allocates nothing per event. */
  private readonly hit: HitTarget = {
    kind: 'none',
    windowId: null,
    action: null,
    edge: null,
    el: null,
  }

  /** Manual double-click tracking: `dblclick` does not survive pointer capture
   *  on a frame that moves under the cursor, and the title bar needs it. */
  private lastDownTime = 0
  private lastDownX = 0
  private lastDownY = 0
  private lastDownTarget: HitKind = 'none'
  private lastDownWindow: WindowId | null = null

  private readonly bound: {
    pointerdown: (e: PointerEvent) => void
    pointermove: (e: PointerEvent) => void
    pointerup: (e: PointerEvent) => void
    pointercancel: (e: PointerEvent) => void
    keydown: (e: KeyboardEvent) => void
    keyup: (e: KeyboardEvent) => void
    contextmenu: (e: MouseEvent) => void
    wheel: (e: WheelEvent) => void
    focusin: (e: FocusEvent) => void
  }

  constructor(opts: {
    root: HTMLElement
    wm: WindowManager
    gestures: GestureController
    capture: CaptureStack
    keymaps: KeymapStack
    commands: CommandRegistry
    hooks?: DispatcherHooks
  }) {
    this.root = opts.root
    this.wm = opts.wm
    this.gestures = opts.gestures
    this.capture = opts.capture
    this.keymaps = opts.keymaps
    this.commands = opts.commands
    this.hooks = opts.hooks ?? {}

    this.bound = {
      pointerdown: (e) => this.onPointerDown(e),
      pointermove: (e) => this.onPointerMove(e),
      pointerup: (e) => this.onPointerUp(e),
      pointercancel: (e) => this.onPointerCancel(e),
      keydown: (e) => this.onKeyDown(e),
      keyup: (e) => this.onKeyUp(e),
      contextmenu: (e) => this.onContextMenu(e),
      wheel: (e) => this.onWheel(e),
      focusin: (e) => this.onFocusIn(e),
    }
  }

  attach(): () => void {
    const r = this.root
    r.addEventListener('pointerdown', this.bound.pointerdown)
    r.addEventListener('pointermove', this.bound.pointermove)
    r.addEventListener('pointerup', this.bound.pointerup)
    r.addEventListener('pointercancel', this.bound.pointercancel)
    r.addEventListener('contextmenu', this.bound.contextmenu)
    r.addEventListener('wheel', this.bound.wheel, { passive: false })
    r.addEventListener('focusin', this.bound.focusin)
    // Keys are listened for on the window: focus may sit on the document body
    // before the first window opens, and Alt+Tab must still work there.
    window.addEventListener('keydown', this.bound.keydown)
    window.addEventListener('keyup', this.bound.keyup)

    return () => {
      r.removeEventListener('pointerdown', this.bound.pointerdown)
      r.removeEventListener('pointermove', this.bound.pointermove)
      r.removeEventListener('pointerup', this.bound.pointerup)
      r.removeEventListener('pointercancel', this.bound.pointercancel)
      r.removeEventListener('contextmenu', this.bound.contextmenu)
      r.removeEventListener('wheel', this.bound.wheel)
      r.removeEventListener('focusin', this.bound.focusin)
      window.removeEventListener('keydown', this.bound.keydown)
      window.removeEventListener('keyup', this.bound.keyup)
    }
  }

  setDisplayTransform(t: DisplayTransform): void {
    this.display = t
  }

  displayTransform(): DisplayTransform {
    return this.display
  }

  toLogicalX(clientX: number): number {
    return (clientX - this.display.offsetX) / this.display.scale
  }

  toLogicalY(clientY: number): number {
    return (clientY - this.display.offsetY) / this.display.scale
  }

  /** Resolve an event target into the reused HitTarget. */
  resolve(target: EventTarget | null): HitTarget {
    const h = this.hit
    h.kind = 'none'
    h.windowId = null
    h.action = null
    h.edge = null
    h.el = null
    if (!(target instanceof HTMLElement)) return h
    h.el = target

    const frame = target.closest<HTMLElement>('[data-win-id]')
    if (frame) {
      const idAttr = frame.dataset['winId']
      h.windowId = idAttr !== undefined ? (Number(idAttr) as WindowId) : null

      const resizeEl = target.closest<HTMLElement>('[data-resize]')
      if (resizeEl && frame.contains(resizeEl)) {
        h.kind = 'resize'
        h.edge = (resizeEl.dataset['resize'] ?? 'se') as ResizeEdge
        return h
      }
      const actionEl = target.closest<HTMLElement>('[data-action]')
      if (actionEl && frame.contains(actionEl)) {
        h.kind = 'action'
        h.action = actionEl.dataset['action'] as FrameAction
        return h
      }
      const titleEl = target.closest<HTMLElement>('[data-part="titlebar"]')
      if (titleEl && frame.contains(titleEl)) {
        h.kind = 'titlebar'
        return h
      }
      h.kind = 'content'
      return h
    }

    if (target.closest('[data-shell-region]')) {
      h.kind = 'shell'
      return h
    }
    if (target.closest('[data-desktop]')) {
      h.kind = 'desktop'
      return h
    }
    return h
  }

  // ------------------------------------------------------------------ pointer

  private onPointerDown(e: PointerEvent): void {
    const x = this.toLogicalX(e.clientX)
    const y = this.toLogicalY(e.clientY)

    // An open menu is a capture layer and owns its own dismissal: it has to
    // distinguish a press on one of its entries from a press outside, which a
    // blanket dismissal here could not do.
    const top = this.capture.top()
    if (top?.onPointerDown?.(e, x, y)) return

    const hit = this.resolve(e.target)
    const isDouble =
      e.timeStamp - this.lastDownTime < DOUBLE_CLICK_MS &&
      Math.abs(x - this.lastDownX) <= DOUBLE_CLICK_SLOP &&
      Math.abs(y - this.lastDownY) <= DOUBLE_CLICK_SLOP &&
      hit.kind === this.lastDownTarget &&
      hit.windowId === this.lastDownWindow
    this.lastDownTime = e.timeStamp
    this.lastDownX = x
    this.lastDownY = y
    this.lastDownTarget = hit.kind
    this.lastDownWindow = hit.windowId

    if (hit.windowId !== null) {
      const id = hit.windowId
      // If this window is blocked by its own modal, redirect and report.
      const modal = this.wm.topModalOwnedBy(id)
      if (modal !== null && modal !== id) {
        this.wm.focus(modal)
        this.hooks.onBlockedInteraction?.(id, modal)
        e.preventDefault()
        return
      }
      this.wm.focus(id)
    }

    switch (hit.kind) {
      case 'resize': {
        if (hit.windowId !== null && hit.edge) {
          if (this.gestures.beginResize(hit.windowId, hit.edge, x, y, e.pointerId, this.root)) {
            e.preventDefault()
          }
        }
        return
      }
      case 'titlebar': {
        if (hit.windowId === null) return
        if (isDouble) {
          this.wm.toggleMaximize(hit.windowId)
          e.preventDefault()
          return
        }
        if (e.button === 0 && this.gestures.beginMove(hit.windowId, x, y, e.pointerId, this.root)) {
          e.preventDefault()
        }
        return
      }
      case 'action': {
        // Chrome buttons act on pointerup so a press can be aborted by moving
        // off the button, which every one of the six eras allowed.
        e.preventDefault()
        return
      }
      case 'desktop': {
        this.hooks.onDesktopPointerDown?.(x, y, e)
        return
      }
      default:
        return
    }
  }

  private onPointerMove(e: PointerEvent): void {
    const top = this.capture.top()
    if (top?.onPointerMove) {
      const x = this.toLogicalX(e.clientX)
      const y = this.toLogicalY(e.clientY)
      if (top.onPointerMove(e, x, y)) return
    }
    if (this.gestures.active) {
      // Hot path: two divisions and two integer writes.
      this.gestures.move(this.toLogicalX(e.clientX), this.toLogicalY(e.clientY))
    }
  }

  private onPointerUp(e: PointerEvent): void {
    const x = this.toLogicalX(e.clientX)
    const y = this.toLogicalY(e.clientY)
    const top = this.capture.top()
    if (top?.onPointerUp?.(e, x, y)) return

    if (this.gestures.active) {
      this.gestures.end()
      return
    }

    const hit = this.resolve(e.target)
    if (hit.kind === 'action' && hit.windowId !== null && hit.action) {
      this.runFrameAction(hit.windowId, hit.action)
    }
  }

  private onPointerCancel(e: PointerEvent): void {
    void e
    if (this.gestures.active) this.gestures.cancel()
  }

  private runFrameAction(id: WindowId, action: FrameAction): void {
    switch (action) {
      case 'close':
        void this.wm.close(id)
        return
      case 'minimize':
        void this.wm.minimize(id)
        return
      case 'maximize':
      case 'collapse':
        this.wm.toggleMaximize(id)
        return
      case 'menu':
        this.commands.run('window.openChromeMenu')
        return
    }
  }

  // --------------------------------------------------------------------- keys

  private onKeyDown(e: KeyboardEvent): void {
    const top = this.capture.top()
    if (top?.onKeyDown?.(e)) {
      e.preventDefault()
      return
    }

    // Escape cancels an in-flight gesture before anything else sees it.
    if (e.key === 'Escape' && this.gestures.active) {
      this.gestures.cancel()
      e.preventDefault()
      return
    }

    // Tab is focus containment, not a command: it must stay inside the window.
    if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) {
      const id = this.wm.focusedId()
      if (id !== null) {
        const handle = this.wm.handleOf(id)
        if (handle) {
          this.focusScope.cycle(handle.el, e.shiftKey ? -1 : 1)
          e.preventDefault()
          return
        }
      }
    }

    // The keyboard route to a context menu, required everywhere a right-click works.
    if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
      if (this.openContextMenuAtFocus()) {
        e.preventDefault()
        return
      }
    }

    const cmd = this.keymaps.resolve(e)
    if (cmd && this.commands.run(cmd)) {
      e.preventDefault()
      // Alt+F4 and friends must not also reach the browser.
      e.stopPropagation()
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    const top = this.capture.top()
    if (top?.onKeyUp?.(e)) {
      e.preventDefault()
    }
  }

  private onWheel(e: WheelEvent): void {
    const top = this.capture.top()
    if (top?.onWheel?.(e)) e.preventDefault()
  }

  private onFocusIn(e: FocusEvent): void {
    // Clicking a control inside an unfocused window focuses that window, so WM
    // focus and DOM focus can never disagree.
    const target = e.target
    if (!(target instanceof HTMLElement)) return
    const frame = target.closest<HTMLElement>('[data-win-id]')
    if (!frame) return
    const idAttr = frame.dataset['winId']
    if (idAttr === undefined) return
    const id = Number(idAttr) as WindowId
    if (this.wm.focusedId() !== id) this.wm.focus(id)
  }

  // ------------------------------------------------------------- context menu

  private onContextMenu(e: MouseEvent): void {
    const x = this.toLogicalX(e.clientX)
    const y = this.toLogicalY(e.clientY)
    const hit = this.resolve(e.target)
    if (hit.windowId !== null) this.wm.focus(hit.windowId)
    if (this.hooks.onContextMenu?.(hit, x, y)) {
      e.preventDefault()
    }
  }

  private openContextMenuAtFocus(): boolean {
    const active = document.activeElement
    const el = active instanceof HTMLElement ? active : this.root
    const box = el.getBoundingClientRect()
    const hit = this.resolve(el)
    return (
      this.hooks.onContextMenu?.(
        hit,
        this.toLogicalX(box.left + box.width / 2),
        this.toLogicalY(box.top + box.height / 2),
      ) ?? false
    )
  }
}
