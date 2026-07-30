/**
 * The window manager.
 *
 * Owns geometry, z-order and focus. Owns no pixels: every frame is built by the
 * active skin's ChromeRenderer, and the WM's only structural knowledge of that
 * frame is the data-attribute vocabulary in ./types.ts.
 *
 * Position is applied as `transform: translate3d(...)` and never as top/left,
 * so the drag loop in ./drag.ts can move a window without triggering layout.
 */

import {
  type Rect,
  type Size,
  cloneRect,
  copyRect,
  constrainToWorkArea,
  clampSize,
  rect,
  rectEquals,
} from '../geometry.js'
import { prefersReducedMotion } from '../motion.js'
import {
  Change,
  type ChangeMask,
  type ChromeMetrics,
  type ChromeRenderer,
  type CloseGuard,
  type FrameHandle,
  type OpenSpec,
  type Unsubscribe,
  type WindowId,
  type WindowState,
  type WmEvent,
  type WmEventType,
} from './types.js'

interface Entry {
  state: WindowState
  handle: FrameHandle
  guard: CloseGuard | null
  /** Rect the window was minimized from, for the restore animation. */
  minimizedFrom: Rect | null
}

const DEFAULT_MIN_CONTENT: Size = { w: 120, h: 60 }

export class WindowManager {
  readonly root: HTMLElement

  private readonly chrome: ChromeRenderer
  private readonly entries = new Map<WindowId, Entry>()
  /** Back-to-front paint order. Index is the window's `z`. */
  private readonly order: WindowId[] = []
  /** Most-recently-focused first. Drives Alt+Tab. */
  private readonly mru: WindowId[] = []
  private readonly listeners = new Set<(e: WmEvent) => void>()

  private nextId = 1
  private focused: WindowId | null = null
  private work: Rect
  private cascadeIndex = 0

  /** Reused across every geometry operation so moves and resizes allocate nothing. */
  private readonly scratchA: Rect = rect(0, 0, 0, 0)
  private readonly scratchB: Rect = rect(0, 0, 0, 0)
  private readonly event: WmEvent = { type: 'opened', id: 0 as WindowId }

  constructor(root: HTMLElement, chrome: ChromeRenderer, workArea: Rect) {
    this.root = root
    this.chrome = chrome
    this.work = cloneRect(workArea)
  }

  // ---------------------------------------------------------------- lifecycle

  open(spec: OpenSpec): WindowId {
    const id = this.nextId++ as WindowId
    const minContent = spec.minSize ?? DEFAULT_MIN_CONTENT
    const extra = this.chromeExtra()
    const minSize: Size = { w: minContent.w + extra.w, h: minContent.h + extra.h }

    let r: Rect
    if (spec.rect) {
      r = cloneRect(spec.rect)
    } else {
      const step = this.chrome.metrics.cascadeStep
      const off = (this.cascadeIndex++ % 8) * step
      r = rect(this.work.x + 24 + off, this.work.y + 24 + off, 480, 320)
    }
    clampSize(r, minSize, spec.maxSize ?? null, r)
    constrainToWorkArea(
      r,
      this.work,
      this.chrome.metrics.titleBarHeight,
      this.chrome.metrics.dragGrabMargin,
      r,
    )

    const state: WindowState = {
      id,
      appId: spec.appId,
      title: spec.title,
      rect: r,
      restoreRect: null,
      z: this.order.length,
      focused: false,
      minimized: false,
      maximized: false,
      resizable: spec.resizable ?? true,
      minSize,
      maxSize: spec.maxSize ?? null,
      modalOwner: spec.modalOwner ?? null,
      dirty: false,
      closable: spec.closable ?? true,
      suspended: false,
    }

    const handle = this.chrome.createFrame(state)
    handle.el.dataset['winId'] = String(id)
    // Position and the 0,0 transform origin come from the skin's CSS. The WM
    // never writes `top` or `left` — not at creation and not in the drag loop —
    // so `test/invariants.test.js` can assert that mechanically.
    this.root.appendChild(handle.el)

    const entry: Entry = { state, handle, guard: null, minimizedFrom: null }
    this.entries.set(id, entry)
    this.order.push(id)
    this.mru.unshift(id)
    this.applyGeometry(entry)
    this.applyZ()

    if (state.modalOwner !== null) this.refreshModalBlocking()

    this.emit('opened', id)
    this.focus(id)
    return id
  }

  /**
   * Closes a window, consulting its guard first. Resolves true if it closed.
   * The close box, Alt+F4 and the app's own quit path all route through here,
   * so the unsaved-changes guard cannot be bypassed.
   */
  async close(id: WindowId, opts?: { force?: boolean }): Promise<boolean> {
    const entry = this.entries.get(id)
    if (!entry) return false
    if (!opts?.force) {
      if (!entry.state.closable) return false
      // A window with an open modal cannot be closed behind it.
      if (this.modalsOwnedBy(id).length > 0) return false
      if (entry.guard) {
        const ok = await entry.guard(id)
        if (!ok) return false
      }
    }

    // Close anything this window owns modally, first.
    for (const child of this.modalsOwnedBy(id)) await this.close(child, { force: true })

    this.chrome.destroyFrame(entry.handle)
    entry.handle.el.remove()
    this.entries.delete(id)

    const oi = this.order.indexOf(id)
    if (oi >= 0) this.order.splice(oi, 1)
    const mi = this.mru.indexOf(id)
    if (mi >= 0) this.mru.splice(mi, 1)

    this.applyZ()
    this.refreshModalBlocking()
    this.emit('closed', id)

    if (this.focused === id) {
      this.focused = null
      const next = this.mru.find((w) => {
        const e = this.entries.get(w)
        return e !== undefined && !e.state.minimized
      })
      if (next !== undefined) this.focus(next)
    }
    return true
  }

  setCloseGuard(id: WindowId, guard: CloseGuard | null): void {
    const entry = this.entries.get(id)
    if (entry) entry.guard = guard
  }

  // ------------------------------------------------------------------- focus

  focus(id: WindowId): void {
    const entry = this.entries.get(id)
    if (!entry) return
    if (entry.state.minimized) this.restore(id)

    // Focus is redirected to a blocking modal rather than denied outright,
    // which is what every one of the six eras does.
    const modal = this.topModalOwnedBy(id)
    if (modal !== null && modal !== id) {
      this.focus(modal)
      return
    }

    if (this.focused === id) {
      this.raise(id)
      return
    }

    const prev = this.focused
    if (prev !== null) {
      const pe = this.entries.get(prev)
      if (pe) {
        pe.state.focused = false
        this.chrome.updateFrame(pe.handle, pe.state, Change.Focus)
        this.emit('blurred', prev)
      }
    }

    this.focused = id
    entry.state.focused = true
    this.chrome.updateFrame(entry.handle, entry.state, Change.Focus)

    const mi = this.mru.indexOf(id)
    if (mi >= 0) this.mru.splice(mi, 1)
    this.mru.unshift(id)

    this.raise(id)
    this.emit('focused', id)
  }

  focusedId(): WindowId | null {
    return this.focused
  }

  /** Most-recently-focused first, excluding minimized windows. Drives Alt+Tab. */
  mruOrder(): WindowId[] {
    return this.mru.filter((id) => this.entries.has(id))
  }

  // ------------------------------------------------------------------ z-order

  raise(id: WindowId): void {
    const i = this.order.indexOf(id)
    if (i < 0 || i === this.order.length - 1) return
    this.order.splice(i, 1)
    this.order.push(id)
    this.applyZ()
    this.emit('orderchanged', id)
  }

  lower(id: WindowId): void {
    const i = this.order.indexOf(id)
    if (i <= 0) return
    this.order.splice(i, 1)
    this.order.unshift(id)
    this.applyZ()
    this.emit('orderchanged', id)
  }

  /** Back-to-front. */
  list(): readonly WindowState[] {
    const out: WindowState[] = []
    for (const id of this.order) {
      const e = this.entries.get(id)
      if (e) out.push(e.state)
    }
    return out
  }

  get(id: WindowId): WindowState | undefined {
    return this.entries.get(id)?.state
  }

  handleOf(id: WindowId): FrameHandle | undefined {
    return this.entries.get(id)?.handle
  }

  // ---------------------------------------------------------------- geometry

  moveTo(id: WindowId, x: number, y: number): void {
    const entry = this.entries.get(id)
    if (!entry || entry.state.maximized) return
    const s = entry.state
    this.scratchA.x = x
    this.scratchA.y = y
    this.scratchA.w = s.rect.w
    this.scratchA.h = s.rect.h
    constrainToWorkArea(
      this.scratchA,
      this.work,
      this.chrome.metrics.titleBarHeight,
      this.chrome.metrics.dragGrabMargin,
      this.scratchB,
    )
    if (rectEquals(s.rect, this.scratchB)) return
    copyRect(this.scratchB, s.rect)
    this.applyGeometry(entry)
    this.chrome.updateFrame(entry.handle, s, Change.Rect)
    this.emit('moved', id)
  }

  resizeTo(id: WindowId, r: Rect): void {
    const entry = this.entries.get(id)
    if (!entry || !entry.state.resizable) return
    const s = entry.state
    clampSize(r, s.minSize, s.maxSize, this.scratchA)
    if (rectEquals(s.rect, this.scratchA)) return
    copyRect(this.scratchA, s.rect)
    if (s.maximized) {
      s.maximized = false
      this.chrome.updateFrame(entry.handle, s, Change.Maximized)
      this.emit('unmaximized', id)
    }
    this.applyGeometry(entry)
    this.chrome.updateFrame(entry.handle, s, Change.Rect)
    this.emit('resized', id)
  }

  /** Work area shrinks for menu bars, taskbars and docks that reserve space. */
  setWorkArea(r: Rect): void {
    this.work = cloneRect(r)
    for (const id of this.order) {
      const entry = this.entries.get(id)
      if (!entry) continue
      if (entry.state.maximized) {
        copyRect(this.work, entry.state.rect)
        this.applyGeometry(entry)
        this.chrome.updateFrame(entry.handle, entry.state, Change.Rect)
      } else {
        this.moveTo(id, entry.state.rect.x, entry.state.rect.y)
      }
    }
  }

  workArea(): Rect {
    return cloneRect(this.work)
  }

  /** Live reference to the work area. Read-only by convention: the gesture
   *  controller copies from it every frame and must not allocate to do so. */
  get workAreaRef(): Rect {
    return this.work
  }

  get metrics(): ChromeMetrics {
    return this.chrome.metrics
  }

  // -------------------------------------------------------- maximize/minimize

  toggleMaximize(id: WindowId): void {
    const entry = this.entries.get(id)
    if (!entry || !entry.state.resizable) return
    const s = entry.state

    if (s.maximized) {
      if (s.restoreRect) copyRect(s.restoreRect, s.rect)
      s.restoreRect = null
      s.maximized = false
      this.applyGeometry(entry)
      this.chrome.updateFrame(entry.handle, s, Change.Rect | Change.Maximized)
      this.emit('unmaximized', id)
      return
    }

    s.restoreRect = cloneRect(s.rect)
    if (this.chrome.metrics.maximizeSemantics === 'fill') {
      copyRect(this.work, s.rect)
    } else {
      // Classic Mac zoom: grow to the content's natural size, bounded by the
      // work area, keeping the top-left anchored.
      const natural = this.naturalSize(entry)
      s.rect.w = Math.min(natural.w, this.work.w - (s.rect.x - this.work.x))
      s.rect.h = Math.min(natural.h, this.work.h - (s.rect.y - this.work.y))
    }
    clampSize(s.rect, s.minSize, s.maxSize, s.rect)
    s.maximized = true
    this.applyGeometry(entry)
    this.chrome.updateFrame(entry.handle, s, Change.Rect | Change.Maximized)
    this.emit('maximized', id)
  }

  async minimize(id: WindowId, target?: Rect): Promise<void> {
    const entry = this.entries.get(id)
    if (!entry || entry.state.minimized) return
    if (this.chrome.metrics.minimizeStyle === 'none') return
    // A window with an open modal cannot be minimized out from under it.
    if (this.modalsOwnedBy(id).length > 0) return

    const s = entry.state
    entry.minimizedFrom = cloneRect(s.rect)
    s.minimized = true
    this.chrome.updateFrame(entry.handle, s, Change.Minimized)
    // The reduced-motion query is honoured here, not in the skin. A skin that
    // forgot the check would ship an era that animates anyway, and the only
    // symptom is motion a viewer asked not to see — nothing would fail.
    if (!prefersReducedMotion()) {
      await this.chrome.minimizeTo(entry.handle, target ?? this.defaultMinimizeTarget())
    }
    entry.handle.el.style.display = 'none'
    this.emit('minimized', id)

    if (this.focused === id) {
      this.focused = null
      const next = this.mru.find((w) => {
        const e = this.entries.get(w)
        return e !== undefined && w !== id && !e.state.minimized
      })
      if (next !== undefined) this.focus(next)
    }
  }

  restore(id: WindowId): void {
    const entry = this.entries.get(id)
    if (!entry || !entry.state.minimized) return
    const s = entry.state
    s.minimized = false
    entry.handle.el.style.display = ''
    this.chrome.updateFrame(entry.handle, s, Change.Minimized)
    if (!prefersReducedMotion()) {
      void this.chrome.restoreFrom(entry.handle, entry.minimizedFrom ?? s.rect)
    }
    entry.minimizedFrom = null
    this.emit('restored', id)
  }

  // ------------------------------------------------------------- state pokes

  setTitle(id: WindowId, title: string): void {
    const entry = this.entries.get(id)
    if (!entry || entry.state.title === title) return
    entry.state.title = title
    this.chrome.updateFrame(entry.handle, entry.state, Change.Title)
    this.emit('titled', id)
  }

  setDirty(id: WindowId, dirty: boolean): void {
    const entry = this.entries.get(id)
    if (!entry || entry.state.dirty === dirty) return
    entry.state.dirty = dirty
    this.chrome.updateFrame(entry.handle, entry.state, Change.Dirty)
    this.emit('dirtied', id)
  }

  /**
   * Freeze a window. Era-neutral: every era may suspend, only Ledger renders it
   * as a visible state. Apps hook the resulting event to release resources.
   */
  suspend(id: WindowId): void {
    const entry = this.entries.get(id)
    if (!entry || entry.state.suspended) return
    entry.state.suspended = true
    this.chrome.updateFrame(entry.handle, entry.state, Change.Suspended)
    this.emit('suspended', id)
  }

  resume(id: WindowId): void {
    const entry = this.entries.get(id)
    if (!entry || !entry.state.suspended) return
    entry.state.suspended = false
    this.chrome.updateFrame(entry.handle, entry.state, Change.Suspended)
    this.emit('resumed', id)
  }

  // ------------------------------------------------------------------ modals

  modalsOwnedBy(id: WindowId): WindowId[] {
    const out: WindowId[] = []
    for (const [wid, e] of this.entries) if (e.state.modalOwner === id) out.push(wid)
    return out
  }

  /** The frontmost modal in the chain rooted at `id`, or null if unblocked. */
  topModalOwnedBy(id: WindowId): WindowId | null {
    const direct = this.modalsOwnedBy(id)
    if (direct.length === 0) return null
    let best: WindowId | null = null
    let bestZ = -1
    for (const m of direct) {
      const deeper = this.topModalOwnedBy(m)
      const candidate = deeper ?? m
      const z = this.order.indexOf(candidate)
      if (z > bestZ) {
        bestZ = z
        best = candidate
      }
    }
    return best
  }

  /**
   * Applies the native `inert` attribute to every window that currently owns an
   * open modal. `inert` removes the subtree from tab order, from the
   * accessibility tree and from pointer targeting at the platform level, which
   * is a genuine block rather than a focus-sentinel imitation.
   */
  private refreshModalBlocking(): void {
    const blocked = new Set<WindowId>()
    for (const e of this.entries.values()) {
      if (e.state.modalOwner !== null) blocked.add(e.state.modalOwner)
    }
    for (const [id, e] of this.entries) {
      const shouldBlock = blocked.has(id)
      if (e.handle.el.inert !== shouldBlock) e.handle.el.inert = shouldBlock
    }
  }

  // ------------------------------------------------------------------ events

  subscribe(fn: (e: WmEvent) => void): Unsubscribe {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit(type: WmEventType, id: WindowId): void {
    // Reused event object: the WM emits on every drag-commit and every focus
    // change, and this keeps those paths allocation-free.
    this.event.type = type
    this.event.id = id
    for (const fn of this.listeners) fn(this.event)
  }

  // ------------------------------------------------------------------ private

  /** Chrome overhead: how much bigger a frame is than its content area. */
  private chromeExtra(): Size {
    const m = this.chrome.metrics
    return {
      w: m.border.left + m.border.right,
      h: m.titleBarHeight + m.border.top + m.border.bottom,
    }
  }

  private naturalSize(entry: Entry): Size {
    const extra = this.chromeExtra()
    const c = entry.handle.content
    return {
      w: Math.max(entry.state.minSize.w, c.scrollWidth + extra.w),
      h: Math.max(entry.state.minSize.h, c.scrollHeight + extra.h),
    }
  }

  private defaultMinimizeTarget(): Rect {
    return rect(this.work.x, this.work.y + this.work.h, 160, 24)
  }

  /**
   * The only place a frame's position and size are written. Position is a
   * transform; size is width/height. Nothing else in the WM touches layout.
   */
  private applyGeometry(entry: Entry): void {
    const { rect: r } = entry.state
    const el = entry.handle.el
    el.style.transform = `translate3d(${r.x}px, ${r.y}px, 0)`
    el.style.width = `${r.w}px`
    el.style.height = `${r.h}px`
  }

  private applyZ(): void {
    for (let i = 0; i < this.order.length; i++) {
      const id = this.order[i]
      if (id === undefined) continue
      const e = this.entries.get(id)
      if (!e) continue
      e.state.z = i
      e.handle.el.style.zIndex = String(i + 1)
    }
  }
}
