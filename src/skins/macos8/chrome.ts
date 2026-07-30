/**
 * Mac OS 8 Platinum chrome renderer.
 *
 * Structurally different from the three eras built so far in four ways, and one of
 * them is the reason the window manager needed fixing rather than working around:
 *
 * 1. **Three boxes, and they are not a uniform set.** Close at the far left; zoom then
 *    collapse at the far right (HIG p103–104). The zoom box takes the WM's `maximize`
 *    slot — the vocabulary names the slot, and `metrics.maximizeSemantics: 'zoom'`
 *    supplies the semantics — while the collapse box takes `collapse`, which is a
 *    windowshade toggle rather than a maximize.
 * 2. **Minimize is a windowshade.** The content region goes and the title bar stays,
 *    visible and active. The frame is not hidden and focus does not move, which is what
 *    `minimizeHidesFrame` in the WM now expresses.
 * 3. **An inactive window draws no boxes at all.** Not greyed — absent. Measured in
 *    Figure 5-1: the whole inactive title band contains exactly two colours. So this
 *    renderer removes them on deactivation rather than restyling them, and an inactive
 *    window has nothing there to click.
 * 4. **The size box is the only resize affordance the era had.** Chronos requires eight
 *    handles in every era, so the other seven exist and are invisible; the size box is
 *    real artwork at the bottom-right and is where the era expected you to drag.
 *
 * Every number is from `./metrics.ts`, and every colour there is Apple's exact byte
 * rather than a JPEG-recovered approximation — see `docs/eras/macos8.md`.
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
import { MACOS8_METRICS } from './metrics.js'

const EDGES: readonly ResizeEdge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

interface Macos8Handle extends FrameHandle {
  titleText: HTMLElement
  boxes: HTMLElement | null
  close: HTMLButtonElement | null
  zoom: HTMLButtonElement | null
  collapse: HTMLButtonElement | null
}

const handles = new WeakMap<HTMLElement, Macos8Handle>()

export class Macos8Chrome implements ChromeRenderer {
  readonly metrics = MACOS8_METRICS

  createFrame(s: WindowState): FrameHandle {
    const el = document.createElement('div')
    el.className = 'm8-win'
    el.dataset['state'] = s.focused ? 'focused' : 'blurred'

    const bar = document.createElement('div')
    bar.className = 'm8-titlebar'
    bar.dataset['part'] = 'titlebar'

    // The striped band is drawn behind the title rather than by the title bar itself,
    // because the stripes stop clear of the text: a single background would run them
    // straight through it. Two spans, one each side, sized by the title's own width.
    const stripesLeft = document.createElement('span')
    stripesLeft.className = 'm8-stripes m8-stripes-left'
    stripesLeft.setAttribute('aria-hidden', 'true')
    const stripesRight = document.createElement('span')
    stripesRight.className = 'm8-stripes m8-stripes-right'
    stripesRight.setAttribute('aria-hidden', 'true')

    let boxes: HTMLElement | null = null
    let close: HTMLButtonElement | null = null
    let zoom: HTMLButtonElement | null = null
    let collapse: HTMLButtonElement | null = null

    const title = document.createElement('span')
    title.className = 'm8-title'
    title.dataset['part'] = 'title'
    title.textContent = s.title

    // A modal alert is movable and has a title bar, but carries none of the three
    // boxes — the same structural move Windows 3.1 makes by emitting no close button
    // and Tiger makes for its alerts.
    if (s.modalOwner === null) {
      close = box('close', 'Close')
      zoom = box('maximize', 'Zoom')
      collapse = box('collapse', 'Collapse')
      boxes = document.createElement('span')
      boxes.className = 'm8-boxes'
      boxes.append(zoom, collapse)
      bar.append(close, stripesLeft, title, stripesRight, boxes)
    } else {
      bar.append(stripesLeft, title, stripesRight)
    }

    el.appendChild(bar)

    const content = document.createElement('div')
    content.className = 'm8-content'
    content.dataset['content'] = ''
    el.appendChild(content)

    for (const edge of EDGES) {
      const h = document.createElement('div')
      h.className = `m8-resize m8-resize-${edge}`
      h.dataset['resize'] = edge
      // The size box is the era's real resize affordance and it is drawn artwork, so
      // the south-east handle carries it rather than being an invisible grab strip.
      if (edge === 'se') h.classList.add('m8-sizebox')
      el.appendChild(h)
    }

    const handle: Macos8Handle = {
      el,
      content,
      titleText: title,
      boxes,
      close,
      zoom,
      collapse,
    }
    handles.set(el, handle)
    this.applyState(handle, s)
    return handle
  }

  updateFrame(h: FrameHandle, s: WindowState, changed: ChangeMask): void {
    const mh = handles.get(h.el)
    if (!mh) return
    if (changed & Change.Title) mh.titleText.textContent = s.title
    if (changed & Change.Focus) {
      h.el.dataset['state'] = s.focused ? 'focused' : 'blurred'
      // Deactivation removes the boxes rather than dimming them, which is what the
      // figure shows. Done here rather than in CSS because it is not a look: an
      // inactive window has no close box to hit-test against.
      this.applyBoxVisibility(mh, s)
    }
    if (changed & (Change.Dirty | Change.Maximized | Change.Minimized | Change.Suspended)) {
      this.applyState(mh, s)
    }
  }

  destroyFrame(h: FrameHandle): void {
    handles.delete(h.el)
  }

  /**
   * The windowshade.
   *
   * Not a shrink toward anything — `target` is deliberately unused, because a
   * collapsed window stays exactly where it is. The frame's rendered height is the
   * window manager's to apply (it derives the collapsed height from the metrics this
   * skin declares), so all this animates is the roll-up itself.
   *
   * The real effect wipes the content away a few scan lines at a time, top to bottom,
   * which `clip-path` reproduces honestly: the content is revealed/hidden by a moving
   * horizontal edge rather than being scaled, so nothing is squashed.
   *
   * No reduced-motion check here: the window manager refuses to call this at all when
   * the query matches. See src/core/motion.ts.
   */
  async minimizeTo(h: FrameHandle, target: Rect): Promise<void> {
    void target
    const mh = handles.get(h.el)
    if (!mh) return
    const anim = mh.content.animate(
      [
        { clipPath: 'inset(0 0 0 0)' },
        { clipPath: 'inset(0 0 100% 0)' },
      ],
      // Short and linear. The Finder's shade was a fast wipe, not an eased slide.
      { duration: 140, easing: 'linear' },
    )
    await anim.finished.catch(() => undefined)
  }

  async restoreFrom(h: FrameHandle, from: Rect): Promise<void> {
    void from
    const mh = handles.get(h.el)
    if (!mh) return
    const anim = mh.content.animate(
      [
        { clipPath: 'inset(0 0 100% 0)' },
        { clipPath: 'inset(0 0 0 0)' },
      ],
      { duration: 140, easing: 'linear' },
    )
    await anim.finished.catch(() => undefined)
  }

  private applyState(h: Macos8Handle, s: WindowState): void {
    h.el.dataset['maximized'] = s.maximized ? 'true' : 'false'
    h.el.dataset['dirty'] = s.dirty ? 'true' : 'false'
    h.el.dataset['suspended'] = s.suspended ? 'true' : 'false'
    h.el.dataset['modal'] = s.modalOwner !== null ? 'true' : 'false'
    h.el.dataset['resizable'] = s.resizable ? 'true' : 'false'

    // Genuinely disabled rather than dimmed: a non-resizable window's zoom box does
    // nothing, and a non-closable window's close box does nothing.
    if (h.zoom) h.zoom.disabled = !s.resizable
    if (h.close) h.close.disabled = !s.closable

    // The collapse box is the one control that reports a state rather than an action,
    // because it is a toggle: it collapses a window and expands a collapsed one.
    if (h.collapse) {
      const shaded = s.minimized
      h.collapse.setAttribute('aria-expanded', shaded ? 'false' : 'true')
      const label = shaded ? 'Expand' : 'Collapse'
      h.collapse.setAttribute('aria-label', label)
      h.collapse.title = label
    }
    this.applyBoxVisibility(h, s)
  }

  private applyBoxVisibility(h: Macos8Handle, s: WindowState): void {
    const shown = s.focused
    if (h.close) h.close.hidden = !shown
    if (h.boxes) h.boxes.hidden = !shown
  }
}

function box(action: string, label: string): HTMLButtonElement {
  const b = document.createElement('button')
  b.type = 'button'
  b.className = `m8-box m8-box-${action}`
  b.dataset['action'] = action
  b.dataset['glyph'] = action
  b.setAttribute('aria-label', label)
  b.title = label
  return b
}
