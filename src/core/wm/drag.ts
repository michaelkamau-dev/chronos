/**
 * Drag and resize sessions.
 *
 * The hot path is deliberately dull. A `pointermove` writes two integers into a
 * preallocated session object and schedules a rAF if one is not already pending;
 * it touches no DOM and reads no layout. The rAF callback writes one transform
 * (drag) or a transform plus width/height (resize) and returns.
 *
 * Allocation budget per frame: the template string handed to `style.transform`,
 * and nothing else. CSSOM offers no zero-allocation path for this — Typed OM's
 * CSSTranslate allocates a wrapper object per call, which is strictly worse —
 * so one small short-lived string per moved frame is the floor, not a shortcut.
 *
 * The window manager's state rect is intentionally stale for the duration of a
 * gesture. Pointer capture means nothing else can be hit-tested mid-drag, and
 * the single commit on pointerup is what fires 'moved'/'resized'.
 */

import {
  type Rect,
  constrainToWorkArea,
  clamp,
  copyRect,
  rect,
} from '../geometry.js'
import type { ResizeEdge, WindowId } from './types.js'
import type { WindowManager } from './manager.js'

type Mode = 'idle' | 'move' | 'resize'

export class GestureController {
  private readonly wm: WindowManager

  private mode: Mode = 'idle'
  private id: WindowId = 0 as WindowId
  private pointerId = -1
  private edge: ResizeEdge = 'se'
  private captureEl: HTMLElement | null = null
  private frameEl: HTMLElement | null = null

  /** Pointer position where the gesture started, in logical era px. */
  private originX = 0
  private originY = 0
  /** Frame rect when the gesture started. */
  private readonly start: Rect = rect(0, 0, 0, 0)
  /** Latest pointer position. Written by pointermove, read by the rAF. */
  private pointerX = 0
  private pointerY = 0

  /** Live geometry, mutated in place by the rAF. Never reallocated. */
  private readonly live: Rect = rect(0, 0, 0, 0)
  private readonly scratch: Rect = rect(0, 0, 0, 0)
  private readonly work: Rect = rect(0, 0, 0, 0)

  private minW = 0
  private minH = 0
  private maxW = Number.POSITIVE_INFINITY
  private maxH = Number.POSITIVE_INFINITY
  private titleBarHeight = 0
  private grabMargin = 0

  private rafHandle = 0
  /** Bound once in the constructor so scheduling a frame allocates no closure. */
  private readonly tick: () => void

  constructor(wm: WindowManager) {
    this.wm = wm
    this.tick = () => this.onFrame()
  }

  get active(): boolean {
    return this.mode !== 'idle'
  }

  get activeId(): WindowId | null {
    return this.mode === 'idle' ? null : this.id
  }

  /**
   * Begin a move. `x`/`y` are pointer coordinates already converted to logical
   * era pixels by the dispatcher.
   */
  beginMove(id: WindowId, x: number, y: number, pointerId: number, captureEl: HTMLElement): boolean {
    const s = this.wm.get(id)
    const handle = this.wm.handleOf(id)
    if (!s || !handle || s.maximized || s.minimized) return false
    this.prime(id, x, y, pointerId, captureEl, handle.el, s.minSize.w, s.minSize.h, s.maxSize)
    copyRect(s.rect, this.start)
    copyRect(s.rect, this.live)
    this.mode = 'move'
    this.frameEl?.classList.add('is-dragging')
    if (this.frameEl) this.frameEl.style.willChange = 'transform'
    return true
  }

  beginResize(
    id: WindowId,
    edge: ResizeEdge,
    x: number,
    y: number,
    pointerId: number,
    captureEl: HTMLElement,
  ): boolean {
    const s = this.wm.get(id)
    const handle = this.wm.handleOf(id)
    if (!s || !handle || !s.resizable || s.minimized) return false
    this.prime(id, x, y, pointerId, captureEl, handle.el, s.minSize.w, s.minSize.h, s.maxSize)
    copyRect(s.rect, this.start)
    copyRect(s.rect, this.live)
    this.edge = edge
    this.mode = 'resize'
    this.frameEl?.classList.add('is-resizing')
    if (this.frameEl) this.frameEl.style.willChange = 'transform, width, height'
    return true
  }

  /** Hot path. Two integer writes and at most one rAF schedule. */
  move(x: number, y: number): void {
    if (this.mode === 'idle') return
    this.pointerX = x
    this.pointerY = y
    if (this.rafHandle === 0) this.rafHandle = requestAnimationFrame(this.tick)
  }

  /** Commit the gesture into window manager state. */
  end(): void {
    if (this.mode === 'idle') return
    if (this.rafHandle !== 0) {
      cancelAnimationFrame(this.rafHandle)
      this.rafHandle = 0
    }
    // Flush the final pointer position so releasing mid-frame cannot drop it.
    this.computeInto(this.live)

    const mode = this.mode
    const id = this.id
    this.teardown()

    if (mode === 'move') this.wm.moveTo(id, this.live.x, this.live.y)
    else this.wm.resizeTo(id, this.live)
  }

  /** Abandon the gesture and put the window back where it started (Escape). */
  cancel(): void {
    if (this.mode === 'idle') return
    if (this.rafHandle !== 0) {
      cancelAnimationFrame(this.rafHandle)
      this.rafHandle = 0
    }
    const el = this.frameEl
    const start = this.start
    this.teardown()
    if (el) {
      el.style.transform = `translate3d(${start.x}px, ${start.y}px, 0)`
      el.style.width = `${start.w}px`
      el.style.height = `${start.h}px`
    }
  }

  // ------------------------------------------------------------------ private

  private prime(
    id: WindowId,
    x: number,
    y: number,
    pointerId: number,
    captureEl: HTMLElement,
    frameEl: HTMLElement,
    minW: number,
    minH: number,
    maxSize: { w: number; h: number } | null,
  ): void {
    this.id = id
    this.originX = x
    this.originY = y
    this.pointerX = x
    this.pointerY = y
    this.pointerId = pointerId
    this.captureEl = captureEl
    this.frameEl = frameEl
    this.minW = minW
    this.minH = minH
    this.maxW = maxSize ? maxSize.w : Number.POSITIVE_INFINITY
    this.maxH = maxSize ? maxSize.h : Number.POSITIVE_INFINITY

    const m = this.wm.metrics
    this.titleBarHeight = m.titleBarHeight
    this.grabMargin = m.dragGrabMargin
    copyRect(this.wm.workAreaRef, this.work)

    // Pointer capture keeps the gesture alive past the window edge and removes
    // any need for document-level fallback listeners.
    if (captureEl.setPointerCapture && pointerId >= 0) {
      try {
        captureEl.setPointerCapture(pointerId)
      } catch {
        // A synthetic or already-released pointer id: the gesture still works
        // through the root listeners, so there is nothing to recover from.
      }
    }
  }

  private teardown(): void {
    const el = this.frameEl
    if (el) {
      el.classList.remove('is-dragging', 'is-resizing')
      // Dropping will-change releases the compositor layer; holding one per
      // window permanently is what turns 20 windows into a memory problem.
      el.style.willChange = ''
    }
    if (this.captureEl && this.pointerId >= 0 && this.captureEl.hasPointerCapture?.(this.pointerId)) {
      this.captureEl.releasePointerCapture(this.pointerId)
    }
    this.mode = 'idle'
    this.captureEl = null
    this.frameEl = null
    this.pointerId = -1
  }

  /** No allocation: writes into the caller's rect. */
  private computeInto(dst: Rect): void {
    const dx = this.pointerX - this.originX
    const dy = this.pointerY - this.originY
    const s = this.start

    if (this.mode === 'move') {
      this.scratch.x = s.x + dx
      this.scratch.y = s.y + dy
      this.scratch.w = s.w
      this.scratch.h = s.h
      constrainToWorkArea(this.scratch, this.work, this.titleBarHeight, this.grabMargin, dst)
      return
    }

    const e = this.edge
    let x = s.x
    let y = s.y
    let w = s.w
    let h = s.h

    if (e === 'e' || e === 'ne' || e === 'se') w = clamp(s.w + dx, this.minW, this.maxW)
    if (e === 's' || e === 'se' || e === 'sw') h = clamp(s.h + dy, this.minH, this.maxH)
    if (e === 'w' || e === 'nw' || e === 'sw') {
      w = clamp(s.w - dx, this.minW, this.maxW)
      x = s.x + (s.w - w)
    }
    if (e === 'n' || e === 'ne' || e === 'nw') {
      h = clamp(s.h - dy, this.minH, this.maxH)
      y = s.y + (s.h - h)
    }
    // The top edge may not be dragged above the work area.
    if (y < this.work.y) {
      const over = this.work.y - y
      y = this.work.y
      h = clamp(h - over, this.minH, this.maxH)
    }

    dst.x = Math.round(x)
    dst.y = Math.round(y)
    dst.w = Math.round(w)
    dst.h = Math.round(h)
  }

  private onFrame(): void {
    this.rafHandle = 0
    if (this.mode === 'idle') return
    const el = this.frameEl
    if (!el) return

    const prevX = this.live.x
    const prevY = this.live.y
    const prevW = this.live.w
    const prevH = this.live.h
    this.computeInto(this.live)

    if (this.live.x !== prevX || this.live.y !== prevY) {
      el.style.transform = `translate3d(${this.live.x}px, ${this.live.y}px, 0)`
    }
    if (this.mode === 'resize') {
      if (this.live.w !== prevW) el.style.width = `${this.live.w}px`
      if (this.live.h !== prevH) el.style.height = `${this.live.h}px`
    }
  }
}
