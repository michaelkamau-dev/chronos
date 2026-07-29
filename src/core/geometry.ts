/**
 * Rect maths in logical era pixels. Every value in this module is an integer:
 * the bitmap eras render on an integer-scaled viewport and fractional geometry
 * would land chrome on half-pixels.
 *
 * Nothing here allocates during a drag — callers pass a destination rect to
 * mutate. The `*Into` functions exist specifically so the drag loop can run
 * without producing garbage.
 */

export interface Size {
  w: number
  h: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Insets {
  top: number
  right: number
  bottom: number
  left: number
}

export function rect(x: number, y: number, w: number, h: number): Rect {
  return { x, y, w, h }
}

export function copyRect(src: Rect, dst: Rect): Rect {
  dst.x = src.x
  dst.y = src.y
  dst.w = src.w
  dst.h = src.h
  return dst
}

export function cloneRect(src: Rect): Rect {
  return { x: src.x, y: src.y, w: src.w, h: src.h }
}

export function rectEquals(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h
}

export function rectContains(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

/**
 * Keep a window reachable: at least `grabMargin` px of its title bar must stay
 * inside the work area horizontally, and its top edge may never go above the
 * work area. Windows may hang off the bottom and sides, which every one of the
 * six eras allowed.
 */
export function constrainToWorkArea(
  r: Rect,
  work: Rect,
  titleBarHeight: number,
  grabMargin: number,
  dst: Rect,
): Rect {
  const minX = work.x - r.w + grabMargin
  const maxX = work.x + work.w - grabMargin
  dst.x = Math.round(clamp(r.x, minX, maxX))
  dst.y = Math.round(clamp(r.y, work.y, work.y + work.h - titleBarHeight))
  dst.w = r.w
  dst.h = r.h
  return dst
}

/** Clamp a rect's size between min and (optional) max, in place. */
export function clampSize(r: Rect, min: Size, max: Size | null, dst: Rect): Rect {
  dst.x = r.x
  dst.y = r.y
  dst.w = Math.max(min.w, max ? Math.min(r.w, max.w) : r.w)
  dst.h = Math.max(min.h, max ? Math.min(r.h, max.h) : r.h)
  return dst
}

export function insets(top: number, right: number, bottom: number, left: number): Insets {
  return { top, right, bottom, left }
}

export function insetRect(r: Rect, i: Insets, dst: Rect): Rect {
  dst.x = r.x + i.left
  dst.y = r.y + i.top
  dst.w = r.w - i.left - i.right
  dst.h = r.h - i.top - i.bottom
  return dst
}
