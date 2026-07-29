/**
 * The capture stack: an ordered list of exclusive input claimants.
 *
 * An open menu, an active gesture and a modal dialog all need first refusal on
 * input. Rather than scattering `if (menuOpen)` checks through the dispatcher,
 * each claimant pushes a layer and the dispatcher offers events to the top of
 * the stack first.
 */

export type CaptureKind = 'menu' | 'gesture' | 'modal' | 'switcher'

export interface CaptureLayer {
  kind: CaptureKind
  /** Return true to swallow the event. */
  onPointerDown?(e: PointerEvent, x: number, y: number): boolean
  onPointerMove?(e: PointerEvent, x: number, y: number): boolean
  onPointerUp?(e: PointerEvent, x: number, y: number): boolean
  onKeyDown?(e: KeyboardEvent): boolean
  onKeyUp?(e: KeyboardEvent): boolean
  onWheel?(e: WheelEvent): boolean
  /** Called when the layer is force-released, e.g. a click outside a menu. */
  release?(): void
}

export class CaptureStack {
  private readonly layers: CaptureLayer[] = []

  push(layer: CaptureLayer): () => void {
    this.layers.push(layer)
    return () => this.remove(layer)
  }

  remove(layer: CaptureLayer): void {
    const i = this.layers.indexOf(layer)
    if (i >= 0) this.layers.splice(i, 1)
  }

  top(): CaptureLayer | null {
    return this.layers.length > 0 ? (this.layers[this.layers.length - 1] ?? null) : null
  }

  has(kind: CaptureKind): boolean {
    for (let i = 0; i < this.layers.length; i++) {
      if (this.layers[i]?.kind === kind) return true
    }
    return false
  }

  /** Release every layer of a kind, top-down. */
  releaseKind(kind: CaptureKind): void {
    for (let i = this.layers.length - 1; i >= 0; i--) {
      const layer = this.layers[i]
      if (layer?.kind === kind) {
        this.layers.splice(i, 1)
        layer.release?.()
      }
    }
  }

  releaseAll(): void {
    while (this.layers.length > 0) {
      const layer = this.layers.pop()
      layer?.release?.()
    }
  }

  get depth(): number {
    return this.layers.length
  }
}
