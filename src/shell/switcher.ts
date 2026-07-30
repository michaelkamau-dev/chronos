/**
 * The Alt+Tab switcher overlay.
 *
 * Real switcher semantics: the first Alt+Tab opens the overlay and selects the
 * next window in most-recently-used order, further Tab presses advance the
 * selection, Shift reverses it, releasing the modifier commits, and Escape
 * cancels back to the window that was focused when the overlay opened.
 *
 * The overlay lives in the shell because placement and appearance are era
 * concerns; the window manager only supplies MRU order and `focus()`.
 */

import type { CaptureLayer, CaptureStack } from '../core/input/capture.js'
import type { WindowManager } from '../core/wm/manager.js'
import type { WindowId } from '../core/wm/types.js'

export class Switcher {
  private readonly wm: WindowManager
  private readonly capture: CaptureStack
  private readonly host: HTMLElement

  private el: HTMLElement | null = null
  private order: WindowId[] = []
  private index = 0
  private openedFrom: WindowId | null = null
  private release: (() => void) | null = null
  private readonly layer: CaptureLayer

  constructor(wm: WindowManager, capture: CaptureStack, host: HTMLElement) {
    this.wm = wm
    this.capture = capture
    this.host = host
    this.layer = {
      kind: 'switcher',
      onKeyDown: (e) => this.onKeyDown(e),
      onKeyUp: (e) => this.onKeyUp(e),
      release: () => this.teardown(),
    }
  }

  get isOpen(): boolean {
    return this.el !== null
  }

  /** Advance the selection, opening the overlay if it is not already up. */
  cycle(dir: 1 | -1): void {
    if (!this.isOpen) {
      /*
       * Candidates are windows that are actually on the screen — not windows that are
       * merely un-minimized.
       *
       * `!s.minimized` was the same test until an era declared `collapse`. A
       * windowshade is minimized *and* on screen: its title bar is visible, it can be
       * dragged, and clicking it activates it. Filtering it out here would make it the
       * one window a user can see and cannot reach from the keyboard, which is the
       * "every mouse action has a keyboard path" rule failing in the direction nothing
       * would catch. The WM owns the distinction so this and its four sites cannot
       * drift.
       */
      this.order = this.wm.mruOrder().filter((id) => {
        const s = this.wm.get(id)
        return s !== undefined && !this.wm.isOffScreen(s)
      })
      // Fewer than two candidates: there is nothing to switch between.
      if (this.order.length < 2) return
      this.openedFrom = this.wm.focusedId()
      this.index = 0
      this.render()
      this.release = this.capture.push(this.layer)
    }
    this.index = (this.index + dir + this.order.length) % this.order.length
    this.render()
  }

  commit(): void {
    const target = this.order[this.index]
    this.closeOverlay()
    if (target !== undefined) this.wm.focus(target)
  }

  cancel(): void {
    const back = this.openedFrom
    this.closeOverlay()
    if (back !== null && this.wm.get(back)) this.wm.focus(back)
  }

  private onKeyDown(e: KeyboardEvent): boolean {
    if (e.key === 'Tab') {
      this.cycle(e.shiftKey ? -1 : 1)
      return true
    }
    if (e.key === 'Escape') {
      this.cancel()
      return true
    }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      this.cycle(1)
      return true
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      this.cycle(-1)
      return true
    }
    if (e.key === 'Enter' || e.key === ' ') {
      this.commit()
      return true
    }
    return false
  }

  private onKeyUp(e: KeyboardEvent): boolean {
    // Releasing the modifier that opened the switcher commits it.
    if (e.key === 'Alt' || e.key === 'Meta' || e.key === 'Control') {
      this.commit()
      return true
    }
    return false
  }

  private closeOverlay(): void {
    const rel = this.release
    this.release = null
    this.teardown()
    // Removing the layer runs `release`, which is why teardown is idempotent.
    if (rel) rel()
  }

  private teardown(): void {
    this.el?.remove()
    this.el = null
    this.order = []
    this.index = 0
    this.openedFrom = null
  }

  private render(): void {
    if (!this.el) {
      const el = document.createElement('div')
      el.className = 'switcher'
      el.dataset['switcher'] = ''
      el.setAttribute('role', 'listbox')
      el.setAttribute('aria-label', 'Open windows')
      this.host.appendChild(el)
      this.el = el
    }
    const el = this.el
    el.textContent = ''
    for (let i = 0; i < this.order.length; i++) {
      const id = this.order[i]
      if (id === undefined) continue
      const s = this.wm.get(id)
      if (!s) continue
      const item = document.createElement('div')
      item.className = 'switcher-item'
      item.setAttribute('role', 'option')
      item.setAttribute('aria-selected', i === this.index ? 'true' : 'false')
      item.textContent = s.title
      el.appendChild(item)
    }
  }
}
