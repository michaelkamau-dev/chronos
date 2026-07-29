/**
 * Menus.
 *
 * One `MenuSpec` type serves context menus, title-bar chrome menus and menu bars.
 * The controller owns behaviour — keyboard navigation, type-ahead, submenu
 * timing, the capture layer, disabled-entry skipping — and the skin owns
 * appearance and structure through `MenuRenderer`. That split is what lets the
 * same spec render in a Mac global menu bar and in a Windows in-window menu bar
 * without the caller knowing which era is active.
 *
 * Disabled entries are focusable but not activatable, which is the behaviour
 * every one of the six eras had: you can walk onto a greyed item and see it,
 * you just cannot fire it.
 */

import type { Command } from './commands.js'
import type { CaptureLayer, CaptureStack } from './capture.js'

export interface MenuItemSpec {
  kind: 'item'
  label: string
  command?: Command
  onActivate?: () => void
  enabled: boolean
  checked?: boolean
  /** Display-only accelerator text, e.g. "Alt+F4". */
  accel?: string
}

export interface MenuSeparatorSpec {
  kind: 'separator'
}

export interface MenuSubmenuSpec {
  kind: 'submenu'
  label: string
  enabled: boolean
  items: MenuSpec
}

export type MenuEntrySpec = MenuItemSpec | MenuSeparatorSpec | MenuSubmenuSpec
export type MenuSpec = MenuEntrySpec[]

export interface MenuView {
  el: HTMLElement
  /** One entry per spec index. Separators map to a non-null element that is
   *  never highlighted, so indices stay aligned with the spec. */
  entryEls: HTMLElement[]
}

export interface MenuRenderer {
  createMenu(spec: MenuSpec): MenuView
  setHighlight(view: MenuView, index: number | null): void
  destroyMenu(view: MenuView): void
}

interface OpenLevel {
  view: MenuView
  spec: MenuSpec
  index: number | null
}

const SUBMENU_DELAY_MS = 220

function isNavigable(e: MenuEntrySpec): boolean {
  return e.kind !== 'separator'
}

export class MenuController {
  private readonly renderer: MenuRenderer
  private readonly capture: CaptureStack
  private readonly host: HTMLElement

  private levels: OpenLevel[] = []
  private release: (() => void) | null = null
  private submenuTimer = 0
  private typeAhead = ''
  private typeAheadAt = 0
  /**
   * Whether a pointerdown has arrived since the menu opened.
   *
   * A right-click opens the menu on *mousedown* in Chrome, so the matching
   * pointerup arrives while the menu is already up. Without this flag that
   * release would dismiss the menu instantly — the menu would flash and vanish
   * on every right-click.
   */
  private sawPointerDown = false
  private readonly layer: CaptureLayer

  constructor(renderer: MenuRenderer, capture: CaptureStack, host: HTMLElement) {
    this.renderer = renderer
    this.capture = capture
    this.host = host
    this.layer = {
      kind: 'menu',
      onKeyDown: (e) => this.onKeyDown(e),
      onPointerDown: (e) => this.onPointerDown(e),
      onPointerMove: (e) => this.onPointerMove(e),
      onPointerUp: (e) => this.onPointerUp(e),
      release: () => this.teardown(),
    }
  }

  get isOpen(): boolean {
    return this.levels.length > 0
  }

  /**
   * Open a menu with its top-left at the given client coordinates, flipping when
   * it would overflow the host. Returns false for an empty spec so callers can
   * fall through rather than opening an empty box.
   */
  open(spec: MenuSpec, clientX: number, clientY: number): boolean {
    if (spec.length === 0) return false
    this.closeAll()
    const view = this.renderer.createMenu(spec)
    this.host.appendChild(view.el)
    this.position(view.el, clientX, clientY)
    this.levels = [{ view, spec, index: null }]
    this.sawPointerDown = false
    this.release = this.capture.push(this.layer)
    return true
  }

  closeAll(): void {
    const rel = this.release
    this.release = null
    this.teardown()
    if (rel) rel()
  }

  /** Move the highlight to the first navigable entry (keyboard entry point). */
  highlightFirst(): void {
    const level = this.levels[0]
    if (!level) return
    const next = this.step(level.spec, null, 1)
    this.setIndex(0, next)
  }

  // ------------------------------------------------------------------ private

  private position(el: HTMLElement, clientX: number, clientY: number): void {
    // Measure before deciding, since flipping depends on the rendered size.
    el.style.left = '0px'
    el.style.top = '0px'
    const box = el.getBoundingClientRect()
    const hostBox = this.host.getBoundingClientRect()
    let x = clientX - hostBox.left
    let y = clientY - hostBox.top
    if (x + box.width > hostBox.width) x = Math.max(0, x - box.width)
    if (y + box.height > hostBox.height) y = Math.max(0, y - box.height)
    el.style.left = `${Math.round(x)}px`
    el.style.top = `${Math.round(y)}px`
  }

  private teardown(): void {
    if (this.submenuTimer !== 0) {
      clearTimeout(this.submenuTimer)
      this.submenuTimer = 0
    }
    for (let i = this.levels.length - 1; i >= 0; i--) {
      const level = this.levels[i]
      if (!level) continue
      this.renderer.destroyMenu(level.view)
      level.view.el.remove()
    }
    this.levels = []
    this.typeAhead = ''
  }

  private closeFrom(depth: number): void {
    if (this.submenuTimer !== 0) {
      clearTimeout(this.submenuTimer)
      this.submenuTimer = 0
    }
    while (this.levels.length > depth) {
      const level = this.levels.pop()
      if (!level) break
      this.renderer.destroyMenu(level.view)
      level.view.el.remove()
    }
  }

  private setIndex(depth: number, index: number | null): void {
    const level = this.levels[depth]
    if (!level) return
    level.index = index
    this.renderer.setHighlight(level.view, index)
    this.closeFrom(depth + 1)
    if (index === null) return
    const entry = level.spec[index]
    if (entry?.kind === 'submenu' && entry.enabled) {
      this.submenuTimer = window.setTimeout(() => {
        this.submenuTimer = 0
        this.openSubmenu(depth, index)
      }, SUBMENU_DELAY_MS)
    }
  }

  private openSubmenu(depth: number, index: number): void {
    const level = this.levels[depth]
    if (!level) return
    const entry = level.spec[index]
    if (entry?.kind !== 'submenu' || !entry.enabled) return
    if (this.levels.length > depth + 1) return
    const anchor = level.view.entryEls[index]
    if (!anchor) return
    const view = this.renderer.createMenu(entry.items)
    this.host.appendChild(view.el)
    const box = anchor.getBoundingClientRect()
    this.position(view.el, box.right, box.top)
    this.levels.push({ view, spec: entry.items, index: null })
  }

  private step(spec: MenuSpec, from: number | null, dir: 1 | -1): number | null {
    const n = spec.length
    if (n === 0) return null
    let i = from ?? (dir === 1 ? -1 : n)
    for (let count = 0; count < n; count++) {
      i = (i + dir + n) % n
      const entry = spec[i]
      if (entry && isNavigable(entry)) return i
    }
    return null
  }

  private activate(depth: number, index: number): void {
    const level = this.levels[depth]
    if (!level) return
    const entry = level.spec[index]
    if (!entry) return
    if (entry.kind === 'separator') return
    if (!entry.enabled) return
    if (entry.kind === 'submenu') {
      this.openSubmenu(depth, index)
      const first = this.step(entry.items, null, 1)
      this.setIndex(depth + 1, first)
      return
    }
    // Close before running: a handler that opens another window should not have
    // the menu still capturing input underneath it.
    const run = entry.onActivate
    this.closeAll()
    run?.()
  }

  private levelIndexOfElement(el: HTMLElement): { depth: number; index: number } | null {
    for (let d = this.levels.length - 1; d >= 0; d--) {
      const level = this.levels[d]
      if (!level) continue
      const entries = level.view.entryEls
      for (let i = 0; i < entries.length; i++) {
        const entryEl = entries[i]
        if (entryEl && (entryEl === el || entryEl.contains(el))) return { depth: d, index: i }
      }
    }
    return null
  }

  private onPointerMove(e: PointerEvent): boolean {
    if (!this.isOpen) return false
    const target = e.target
    if (!(target instanceof HTMLElement)) return false
    const found = this.levelIndexOfElement(target)
    if (!found) return false
    const entry = this.levels[found.depth]?.spec[found.index]
    if (!entry || entry.kind === 'separator') return true
    this.setIndex(found.depth, found.index)
    return true
  }

  /** True when the element sits inside any open level, entry or not. */
  private insideMenu(el: HTMLElement): boolean {
    for (let d = 0; d < this.levels.length; d++) {
      const view = this.levels[d]?.view
      if (view && (view.el === el || view.el.contains(el))) return true
    }
    return false
  }

  private onPointerDown(e: PointerEvent): boolean {
    if (!this.isOpen) return false
    this.sawPointerDown = true
    const target = e.target
    if (target instanceof HTMLElement && this.insideMenu(target)) return true
    // A press outside dismisses the menu and is swallowed rather than passed
    // through, which is what every one of the six eras did.
    this.closeAll()
    return true
  }

  private onPointerUp(e: PointerEvent): boolean {
    if (!this.isOpen) return false
    const target = e.target
    const inside = target instanceof HTMLElement && this.insideMenu(target)

    if (inside && target instanceof HTMLElement) {
      const found = this.levelIndexOfElement(target)
      // Releasing over an entry activates it, which makes press-drag-release
      // work as well as click-then-click.
      if (found) this.activate(found.depth, found.index)
      return true
    }

    // The release belonging to the gesture that opened the menu must not
    // dismiss it: right-click opens on mousedown, so its mouseup lands here.
    if (!this.sawPointerDown) return true

    this.closeAll()
    return true
  }

  private onKeyDown(e: KeyboardEvent): boolean {
    if (!this.isOpen) return false
    const depth = this.levels.length - 1
    const level = this.levels[depth]
    if (!level) return false

    switch (e.key) {
      case 'Escape': {
        if (depth === 0) this.closeAll()
        else {
          this.closeFrom(depth)
          const parent = this.levels[depth - 1]
          if (parent) this.renderer.setHighlight(parent.view, parent.index)
        }
        return true
      }
      case 'ArrowDown':
        this.setIndex(depth, this.step(level.spec, level.index, 1))
        return true
      case 'ArrowUp':
        this.setIndex(depth, this.step(level.spec, level.index, -1))
        return true
      case 'Home':
        this.setIndex(depth, this.step(level.spec, null, 1))
        return true
      case 'End':
        this.setIndex(depth, this.step(level.spec, null, -1))
        return true
      case 'ArrowRight': {
        if (level.index !== null) {
          const entry = level.spec[level.index]
          if (entry?.kind === 'submenu' && entry.enabled) {
            this.activate(depth, level.index)
            return true
          }
        }
        return true
      }
      case 'ArrowLeft': {
        if (depth > 0) {
          this.closeFrom(depth)
          const parent = this.levels[depth - 1]
          if (parent) this.renderer.setHighlight(parent.view, parent.index)
        }
        return true
      }
      case 'Enter':
      case ' ': {
        if (level.index !== null) this.activate(depth, level.index)
        return true
      }
      default:
        break
    }

    // Type-ahead: matches the first navigable entry whose label starts with the
    // accumulated prefix, resetting after a second of silence.
    if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      const now = e.timeStamp
      if (now - this.typeAheadAt > 1000) this.typeAhead = ''
      this.typeAheadAt = now
      this.typeAhead += e.key.toLowerCase()
      const found = this.findByPrefix(level.spec, this.typeAhead)
      if (found !== null) this.setIndex(depth, found)
      return true
    }
    return false
  }

  private findByPrefix(spec: MenuSpec, prefix: string): number | null {
    for (let i = 0; i < spec.length; i++) {
      const entry = spec[i]
      if (!entry || entry.kind === 'separator') continue
      if (entry.label.toLowerCase().startsWith(prefix)) return i
    }
    return null
  }
}
