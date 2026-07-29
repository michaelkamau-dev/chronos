/**
 * Keyboard move and resize.
 *
 * The brief requires every mouse action to have a keyboard equivalent, and
 * dragging a window is the one people forget. This is the real Windows "Move"
 * and "Size" system-menu behaviour: a command puts the window into a modal
 * geometry mode, arrows nudge it, Shift+arrow nudges by a larger step, Enter
 * commits and Escape reverts.
 *
 * It goes through `wm.moveTo`/`wm.resizeTo` rather than the rAF gesture loop:
 * a keystroke is not a 60fps stream, so there is nothing to amortise.
 */

import { cloneRect, rect, type Rect } from '../core/geometry.js'
import type { CaptureLayer, CaptureStack } from '../core/input/capture.js'
import type { WindowManager } from '../core/wm/manager.js'
import type { WindowId } from '../core/wm/types.js'

const STEP = 1
const COARSE_STEP = 10

type Mode = 'move' | 'resize'

export class KeyboardGeometry {
  private readonly wm: WindowManager
  private readonly capture: CaptureStack

  private mode: Mode = 'move'
  private id: WindowId | null = null
  private original: Rect = rect(0, 0, 0, 0)
  private release: (() => void) | null = null
  private readonly layer: CaptureLayer

  constructor(wm: WindowManager, capture: CaptureStack) {
    this.wm = wm
    this.capture = capture
    this.layer = {
      kind: 'gesture',
      onKeyDown: (e) => this.onKeyDown(e),
      release: () => this.teardown(),
    }
  }

  get isActive(): boolean {
    return this.id !== null
  }

  begin(mode: Mode): void {
    const id = this.wm.focusedId()
    if (id === null) return
    const s = this.wm.get(id)
    if (!s || s.minimized) return
    if (mode === 'move' && s.maximized) return
    if (mode === 'resize' && !s.resizable) return
    if (this.id !== null) this.finish()

    this.mode = mode
    this.id = id
    this.original = cloneRect(s.rect)
    const handle = this.wm.handleOf(id)
    handle?.el.classList.add(mode === 'move' ? 'is-keyboard-moving' : 'is-keyboard-resizing')
    this.release = this.capture.push(this.layer)
  }

  private onKeyDown(e: KeyboardEvent): boolean {
    const id = this.id
    if (id === null) return false
    const s = this.wm.get(id)
    if (!s) {
      this.finish()
      return true
    }

    const step = e.shiftKey ? COARSE_STEP : STEP
    let dx = 0
    let dy = 0
    switch (e.key) {
      case 'ArrowLeft':
        dx = -step
        break
      case 'ArrowRight':
        dx = step
        break
      case 'ArrowUp':
        dy = -step
        break
      case 'ArrowDown':
        dy = step
        break
      case 'Enter':
        this.finish()
        return true
      case 'Escape':
        this.revert()
        return true
      default:
        return false
    }

    if (this.mode === 'move') {
      this.wm.moveTo(id, s.rect.x + dx, s.rect.y + dy)
    } else {
      const next = cloneRect(s.rect)
      next.w += dx
      next.h += dy
      this.wm.resizeTo(id, next)
    }
    return true
  }

  private revert(): void {
    const id = this.id
    if (id !== null) {
      if (this.mode === 'move') this.wm.moveTo(id, this.original.x, this.original.y)
      else this.wm.resizeTo(id, this.original)
    }
    this.finish()
  }

  private finish(): void {
    const rel = this.release
    this.release = null
    this.teardown()
    if (rel) rel()
  }

  private teardown(): void {
    if (this.id !== null) {
      const handle = this.wm.handleOf(this.id)
      handle?.el.classList.remove('is-keyboard-moving', 'is-keyboard-resizing')
    }
    this.id = null
  }
}
