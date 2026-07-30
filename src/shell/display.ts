/**
 * The display surface.
 *
 * Two viewport modes, both of which produce the same thing for the rest of the
 * system: a work area in logical era pixels plus a transform the dispatcher
 * divides pointer coordinates by.
 *
 * - `native` — the desktop fills the viewport at 1:1. Mac OS 8, XP, Tiger, Ledger.
 * - `fixed`  — the desktop is a fixed logical resolution (512×342, 640×480)
 *              scaled by an integer factor and centred. System 1, Windows 3.1.
 *
 * The integer constraint is not cosmetic. Pixel-outline bitmap fonts stay crisp
 * only when every glyph edge lands on a device-pixel boundary, so the scale
 * factor must be an integer *and* `scale × devicePixelRatio` must also be an
 * integer. `chooseScale` is the only place that arithmetic lives.
 */

import { rect, type Rect } from '../core/geometry.js'

export type ViewportMode = 'native' | 'fixed'

export interface ViewportSpec {
  mode: ViewportMode
  /** Logical resolution, required when mode is 'fixed'. */
  logical?: { w: number; h: number }
  /** Upper bound on the integer scale factor. */
  maxScale?: number
}

export interface DisplayState {
  scale: number
  offsetX: number
  offsetY: number
  /** Desktop size in logical era pixels. */
  logicalW: number
  logicalH: number
}

/**
 * Largest integer scale that fits `logical` inside `client` and keeps
 * `scale × dpr` integral. Returns at least 1 — a viewport smaller than the
 * logical resolution overflows rather than rendering at a fractional scale,
 * because a fractional scale would soften every glyph in the bitmap eras.
 */
export function chooseScale(
  logicalW: number,
  logicalH: number,
  clientW: number,
  clientH: number,
  dpr: number,
  maxScale = 4,
): number {
  const fit = Math.min(clientW / logicalW, clientH / logicalH)
  for (let s = Math.min(maxScale, Math.floor(fit)); s >= 1; s--) {
    if (Number.isInteger(s * dpr)) return s
  }
  return 1
}

export class Display {
  private readonly host: HTMLElement
  readonly desktop: HTMLElement
  private spec: ViewportSpec
  private state: DisplayState = { scale: 1, offsetX: 0, offsetY: 0, logicalW: 0, logicalH: 0 }
  private readonly listeners = new Set<(s: DisplayState) => void>()
  private observer: ResizeObserver | null = null
  /** Reserved edges, in logical px, contributed by shell regions. */
  private reserved = { top: 0, right: 0, bottom: 0, left: 0 }

  constructor(host: HTMLElement, spec: ViewportSpec) {
    this.host = host
    this.spec = spec

    this.desktop = document.createElement('div')
    this.desktop.className = 'desktop'
    this.desktop.dataset['desktop'] = ''
    this.host.appendChild(this.desktop)
  }

  attach(): () => void {
    this.observer = new ResizeObserver(() => this.measure())
    this.observer.observe(this.host)
    this.measure()
    return () => {
      this.observer?.disconnect()
      this.observer = null
    }
  }

  setSpec(spec: ViewportSpec): void {
    this.spec = spec
    this.measure()
  }

  /** Shell regions that shrink the window work area (menu bars, taskbars, docks). */
  setReservedEdges(edges: { top?: number; right?: number; bottom?: number; left?: number }): void {
    this.reserved = {
      top: edges.top ?? 0,
      right: edges.right ?? 0,
      bottom: edges.bottom ?? 0,
      left: edges.left ?? 0,
    }
    this.emit()
  }

  current(): DisplayState {
    return this.state
  }

  /**
   * The integer factor logical era pixels are scaled by.
   *
   * Exposed because the bitmap eras' fidelity depends on it: Windows 3.1's
   * disabled-text checkerboard is a one-logical-pixel pattern, so a test that
   * measures it has to convert device pixels back to logical ones, and a test that
   * asserts the scale is a whole number needs to read it.
   */
  scale(): number {
    return this.state.scale
  }

  workArea(): Rect {
    const r = this.reserved
    return rect(
      r.left,
      r.top,
      Math.max(0, this.state.logicalW - r.left - r.right),
      Math.max(0, this.state.logicalH - r.top - r.bottom),
    )
  }

  subscribe(fn: (s: DisplayState) => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private measure(): void {
    const clientW = this.host.clientWidth
    const clientH = this.host.clientHeight
    const dpr = window.devicePixelRatio || 1

    if (this.spec.mode === 'native') {
      this.state = {
        scale: 1,
        offsetX: 0,
        offsetY: 0,
        logicalW: clientW,
        logicalH: clientH,
      }
      this.desktop.style.width = '100%'
      this.desktop.style.height = '100%'
      this.desktop.style.transform = ''
    } else {
      const logical = this.spec.logical ?? { w: clientW, h: clientH }
      const scale = chooseScale(
        logical.w,
        logical.h,
        clientW,
        clientH,
        dpr,
        this.spec.maxScale ?? 4,
      )
      const offsetX = Math.floor((clientW - logical.w * scale) / 2)
      const offsetY = Math.floor((clientH - logical.h * scale) / 2)
      this.state = { scale, offsetX, offsetY, logicalW: logical.w, logicalH: logical.h }
      this.desktop.style.width = `${logical.w}px`
      this.desktop.style.height = `${logical.h}px`
      this.desktop.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`
      // Nearest-neighbour so an integer upscale stays hard-edged.
      this.desktop.style.imageRendering = 'pixelated'
    }
    this.emit()
  }

  private emit(): void {
    for (const fn of this.listeners) fn(this.state)
  }
}
