/**
 * The window manager contract.
 *
 * The WM owns geometry, z-order and focus. It owns no pixels. Everything an era
 * knows how to draw reaches the WM through `ChromeRenderer` and `ChromeMetrics`,
 * and the WM's only structural knowledge of a frame is the data-attribute
 * vocabulary in `FramePart`.
 */

import type { Rect, Size, Insets } from '../geometry.js'

export type WindowId = number & { readonly __brand: unique symbol }
export type AppId = string & { readonly __appBrand: unique symbol }

export function asAppId(s: string): AppId {
  return s as AppId
}

/** How "maximize" behaves. Windows fills the work area; classic Mac zoom
 *  toggles to the content's natural size, which is a different gesture. */
export type MaximizeSemantics = 'fill' | 'zoom'

/** What the era does when a window is minimized. `none` means the era has no
 *  minimize at all and the skin does not emit the button (System 1). */
export type MinimizeStyle = 'none' | 'shrink' | 'genie' | 'collapse'

export interface ChromeMetrics {
  /** Frame-relative title bar height, focused. */
  titleBarHeight: number
  /** Some eras change caption height when inactive; most do not. */
  titleBarHeightInactive: number
  /** Frame border thickness per side, excluding the title bar. */
  border: Insets
  /**
   * How the top two corners are shaped.
   *
   * A discriminated union rather than a number because Windows XP's corner is
   * categorically not a radius: Microsoft's 1:1 figure shows a 5-row arc whose
   * per-row x-insets are 5,3,2,1,1,0 — a hand-drawn corner bitmap that no
   * `border-radius` value reproduces. Eras that genuinely use a radius say so.
   */
  cornerTop:
    | { readonly kind: 'radius'; readonly px: number }
    | { readonly kind: 'steps'; readonly insets: readonly number[] }
  /** Extra hit-test slop around resize edges, so a 1px border stays grabbable. */
  resizeGrab: number
  /** Shadow area that is painted but must not be hit-tested. */
  shadowInsets: Insets
  /** Cascade offset applied to each successive new window. */
  cascadeStep: number
  /** Minimum horizontal overlap kept between a window and the work area. */
  dragGrabMargin: number
  maximizeSemantics: MaximizeSemantics
  minimizeStyle: MinimizeStyle
}

export type ProvenanceLevel = 'documented' | 'measured' | 'derived' | 'unverified'

export interface ProvenanceEntry {
  level: ProvenanceLevel
  source: string
  /** Required when level is 'unverified': say what is unknown and why. */
  note?: string
}

/**
 * Forces a provenance entry for every metric a skin declares. Omitting a key is
 * a compile error, which is what makes "measured, not eyeballed" mechanical
 * rather than aspirational.
 */
export type Provenance<T> = { [K in keyof T]-?: ProvenanceEntry }

export interface WindowState {
  readonly id: WindowId
  readonly appId: AppId
  title: string
  /** Frame rect in logical era pixels. */
  rect: Rect
  /** Pre-maximize rect, restored on unmaximize. */
  restoreRect: Rect | null
  /** Index in the z-order array; 0 is backmost. Maintained by the WM. */
  z: number
  focused: boolean
  minimized: boolean
  maximized: boolean
  resizable: boolean
  minSize: Size
  maxSize: Size | null
  /** Set when this window is a modal owned by another window. */
  modalOwner: WindowId | null
  /** Unsaved changes. Drives the close guard and any era's dirty indicator. */
  dirty: boolean
  closable: boolean
  /** Suspended windows are frozen; only Ledger surfaces this visually. */
  suspended: boolean
}

/** Bitfield so a focus change never rebuilds a title bar's DOM. */
export const Change = {
  None: 0,
  Title: 1 << 0,
  Focus: 1 << 1,
  Rect: 1 << 2,
  Dirty: 1 << 3,
  Maximized: 1 << 4,
  Minimized: 1 << 5,
  Suspended: 1 << 6,
} as const
export type ChangeMask = number

/**
 * The data-attribute vocabulary. This is the entire structural coupling between
 * the window manager and a skin: the WM asks "what did the pointer land on?" and
 * never inspects the frame beyond these.
 */
export type FrameAction = 'close' | 'minimize' | 'maximize' | 'menu' | 'collapse'
export type ResizeEdge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

export interface FrameHandle {
  readonly el: HTMLElement
  /** Where the app mounts — the frame's `[data-content]`. */
  readonly content: HTMLElement
}

export interface ChromeRenderer {
  readonly metrics: ChromeMetrics
  createFrame(s: WindowState): FrameHandle
  updateFrame(h: FrameHandle, s: WindowState, changed: ChangeMask): void
  destroyFrame(h: FrameHandle): void
  /** Era-correct minimize. Resolves when the animation is done. */
  minimizeTo(h: FrameHandle, target: Rect): Promise<void>
  /** Era-correct restore from minimized. */
  restoreFrom(h: FrameHandle, from: Rect): Promise<void>
}

export type WmEventType =
  | 'opened'
  | 'closed'
  | 'focused'
  | 'blurred'
  | 'moved'
  | 'resized'
  | 'minimized'
  | 'restored'
  | 'maximized'
  | 'unmaximized'
  | 'titled'
  | 'dirtied'
  | 'suspended'
  | 'resumed'
  | 'orderchanged'

export interface WmEvent {
  type: WmEventType
  id: WindowId
}

export type Unsubscribe = () => void

export interface OpenSpec {
  appId: AppId
  title: string
  /** Omit to let the WM cascade from the work area origin. */
  rect?: Rect
  minSize?: Size
  maxSize?: Size | null
  resizable?: boolean
  closable?: boolean
  modalOwner?: WindowId | null
}

/** Consulted before a window closes. Returning false cancels the close. */
export type CloseGuard = (id: WindowId) => boolean | Promise<boolean>
