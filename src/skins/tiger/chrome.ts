/**
 * Mac OS X Tiger chrome renderer.
 *
 * Structurally different from both eras built so far, and none of it needed a change
 * to the window manager contract:
 *
 * 1. **The buttons are on the left**, and they are close / minimize / *zoom* rather
 *    than minimize / maximize / close. Zoom maps to `data-action="maximize"` because
 *    the WM's vocabulary names the *slot*, not the semantics; the semantics come from
 *    `metrics.maximizeSemantics: 'zoom'`, which the WM already implements.
 * 2. **A modal has no buttons at all.** Apple: "Alerts and modal dialogs do not
 *    include any of these buttons" (HIG p174). So a modal frame emits a title bar
 *    with no `data-action` element in it — the same structural move Windows 3.1
 *    makes by emitting no close button.
 * 3. **The title bar is a drag region with a text label, not a coloured caption.**
 *    An inactive Tiger window greys its ink and flattens its gradient rather than
 *    swapping a caption colour.
 *
 * Every number is from `./metrics.ts`; every artwork gradient is a measured per-row
 * list generated into CSS custom properties by `./index.ts`, so the stylesheet reads
 * the measurement instead of keeping a second copy that could drift.
 */

import {
  Change,
  type ChangeMask,
  type ChromeRenderer,
  type FrameHandle,
  type ResizeEdge,
  type WindowState,
} from '../../core/wm/types.js'
import type { Rect } from '../../core/geometry.js'
import { TIGER_METRICS } from './metrics.js'

const EDGES: readonly ResizeEdge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

interface TigerHandle extends FrameHandle {
  titleText: HTMLElement
  lights: HTMLElement | null
  close: HTMLButtonElement | null
  minimize: HTMLButtonElement | null
  zoom: HTMLButtonElement | null
}

const handles = new WeakMap<HTMLElement, TigerHandle>()

export class TigerChrome implements ChromeRenderer {
  readonly metrics = TIGER_METRICS

  createFrame(s: WindowState): FrameHandle {
    const el = document.createElement('div')
    el.className = 'tg-win'
    el.dataset['state'] = s.focused ? 'focused' : 'blurred'

    const bar = document.createElement('div')
    bar.className = 'tg-titlebar'
    bar.dataset['part'] = 'titlebar'

    let lights: HTMLElement | null = null
    let close: HTMLButtonElement | null = null
    let minimize: HTMLButtonElement | null = null
    let zoom: HTMLButtonElement | null = null

    // A modal or alert gets a title bar and no buttons — Apple's rule, and the
    // reason the WM must never assume a frame has a close box.
    if (s.modalOwner === null) {
      lights = document.createElement('div')
      lights.className = 'tg-lights'
      close = light('close', 'Close')
      minimize = light('minimize', 'Minimize')
      // The zoom button occupies the WM's "maximize" slot. What it *does* is
      // decided by metrics.maximizeSemantics, not by this element's name.
      zoom = light('maximize', 'Zoom')
      zoom.classList.add('tg-light-zoom')
      lights.append(close, minimize, zoom)
      bar.appendChild(lights)
    }

    const title = document.createElement('span')
    title.className = 'tg-title'
    title.dataset['part'] = 'title'
    title.textContent = s.title
    bar.appendChild(title)

    el.appendChild(bar)

    const content = document.createElement('div')
    content.className = 'tg-content'
    content.dataset['content'] = ''
    el.appendChild(content)

    for (const edge of EDGES) {
      const h = document.createElement('div')
      h.className = `tg-resize tg-resize-${edge}`
      h.dataset['resize'] = edge
      el.appendChild(h)
    }

    const handle: TigerHandle = { el, content, titleText: title, lights, close, minimize, zoom }
    handles.set(el, handle)
    this.applyState(handle, s)
    return handle
  }

  updateFrame(h: FrameHandle, s: WindowState, changed: ChangeMask): void {
    const th = handles.get(h.el)
    if (!th) return
    if (changed & Change.Title) th.titleText.textContent = s.title
    if (changed & Change.Focus) h.el.dataset['state'] = s.focused ? 'focused' : 'blurred'
    if (changed & (Change.Dirty | Change.Maximized | Change.Minimized | Change.Suspended)) {
      this.applyState(th, s)
    }
  }

  destroyFrame(h: FrameHandle): void {
    handles.delete(h.el)
  }

  /**
   * The genie.
   *
   * The real effect warps the window along a Bezier as it is sucked into the Dock,
   * which needs a mesh transform no CSS property provides. What ships is the part
   * that *is* expressible: a scale and translate toward the Dock tile with a
   * horizontal squeeze that leads the vertical one, on an ease-in curve, so the
   * window appears to be drawn down into the shelf rather than merely shrinking.
   * The curved warp is not reproduced and that is a stated loss, not a claim.
   *
   * No reduced-motion check here: the window manager refuses to call this at all
   * when the query matches. See src/core/motion.ts.
   */
  async minimizeTo(h: FrameHandle, target: Rect): Promise<void> {
    const box = h.el.getBoundingClientRect()
    if (box.width === 0 || box.height === 0) return
    const sx = Math.max(target.w / box.width, 0.04)
    const sy = Math.max(target.h / box.height, 0.04)
    const anim = h.el.animate(
      [
        { transform: h.el.style.transform, opacity: 1, offset: 0 },
        {
          transform:
            `translate3d(${target.x + (target.w - box.width * 0.35) / 2}px, ` +
            `${target.y - box.height * 0.28}px, 0) scale(0.35, 0.62)`,
          opacity: 0.85,
          offset: 0.55,
        },
        {
          transform: `translate3d(${target.x}px, ${target.y}px, 0) scale(${sx}, ${sy})`,
          opacity: 0.15,
          offset: 1,
        },
      ],
      { duration: 420, easing: 'cubic-bezier(0.42, 0, 0.72, 0.9)' },
    )
    await anim.finished.catch(() => undefined)
  }

  async restoreFrom(h: FrameHandle, from: Rect): Promise<void> {
    const anim = h.el.animate(
      [
        { transform: `translate3d(${from.x}px, ${from.y}px, 0) scale(0.06, 0.06)`, opacity: 0.15 },
        { transform: h.el.style.transform, opacity: 1 },
      ],
      { duration: 380, easing: 'cubic-bezier(0.28, 0.1, 0.58, 1)' },
    )
    await anim.finished.catch(() => undefined)
  }

  private applyState(h: TigerHandle, s: WindowState): void {
    h.el.dataset['maximized'] = s.maximized ? 'true' : 'false'
    h.el.dataset['dirty'] = s.dirty ? 'true' : 'false'
    h.el.dataset['suspended'] = s.suspended ? 'true' : 'false'
    h.el.dataset['modal'] = s.modalOwner !== null ? 'true' : 'false'
    h.el.dataset['resizable'] = s.resizable ? 'true' : 'false'

    // Genuinely disabled, not merely dimmed: Apple requires that a button which
    // does nothing is drawn in its inactive state rather than omitted, and the
    // inactive artwork is the same grey well an inactive window shows.
    if (h.zoom) h.zoom.disabled = !s.resizable
    if (h.close) h.close.disabled = !s.closable
    if (h.minimize) h.minimize.disabled = this.metrics.minimizeStyle === 'none'

    // "When a document has unsaved changes, the close button should display a dot."
    // Apple documents the dot on the close button specifically, which is why this
    // is not a title-bar-wide dirty indicator like Windows would use.
    if (h.close) h.close.dataset['dot'] = s.dirty ? 'true' : 'false'
  }
}

function light(action: string, label: string): HTMLButtonElement {
  const b = document.createElement('button')
  b.type = 'button'
  b.className = `tg-light tg-light-${action}`
  b.dataset['action'] = action
  b.setAttribute('aria-label', label)
  b.title = label
  return b
}
