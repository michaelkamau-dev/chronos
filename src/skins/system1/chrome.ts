/**
 * Macintosh System 1 chrome renderer.
 *
 * Structurally the sparsest of the three eras built so far, and every absence is a
 * measured fact rather than a simplification:
 *
 * 1. **One chrome control.** A close box, on the left. No zoom box —
 *    `documentProc` has none and `zoomDocProc` is three years away — and no
 *    minimize, because System 1 is single-tasking. The skin emits neither, and
 *    `metrics.maximizeSemantics: 'none'` plus `minimizeStyle: 'none'` make the
 *    window manager refuse both commands so nothing else can reach them.
 * 2. **An inactive window loses its controls, it does not dim them.** The racing
 *    stripes, the close box and the size box all disappear. Apple's own words
 *    (HIG p164): "The close box, zoom box, size box, scroll box, and stripes in the
 *    title bar disappear." That is done in CSS off `data-state`, so a focus change
 *    still flips one attribute and rebuilds no DOM.
 * 3. **The frame is asymmetric.** 1px on the left and top, 2px on the right and
 *    bottom, because the second pixel is a hard drop shadow offset (+1, +1). It is
 *    drawn as a real `box-shadow` on an inner element rather than as border pixels,
 *    which is what reproduces the 1px notch at the top-right and bottom-left corners
 *    for free — see skin.css.
 *
 * The inner `.s1-frame` element exists for that shadow: `[data-win-id]` carries
 * `contain: layout paint` from base.css, and an outer shadow on the frame element
 * itself would sit at the edge of a paint-contained box. Nesting keeps the shadow
 * inside the window's own box, which is also what makes the frame element exactly
 * `rect.w` x `rect.h` including the shadow — matching `border` in metrics.ts.
 *
 * Every measurement is from `docs/sources/figures/mac-hig-*`; see metrics.ts.
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
import { SYSTEM1_METRICS } from './metrics.js'

const EDGES: readonly ResizeEdge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

interface System1Handle extends FrameHandle {
  titleText: HTMLElement
  close: HTMLButtonElement
}

const handles = new WeakMap<HTMLElement, System1Handle>()

export class System1Chrome implements ChromeRenderer {
  readonly metrics = SYSTEM1_METRICS

  createFrame(s: WindowState): FrameHandle {
    const el = document.createElement('div')
    el.className = 's1-win'
    el.dataset['state'] = s.focused ? 'focused' : 'blurred'

    const frame = document.createElement('div')
    frame.className = 's1-frame'

    const bar = document.createElement('div')
    bar.className = 's1-titlebar'
    bar.dataset['part'] = 'titlebar'

    // 11x11, 9px in from the frame's left line, on the stripe rows. The 1px of white
    // either side of it is painted by the button's own outset shadow, because the
    // stripes are the title bar's background and the box has to knock them out.
    const close = document.createElement('button')
    close.type = 'button'
    close.className = 's1-close'
    close.dataset['action'] = 'close'
    close.setAttribute('aria-label', 'Close')
    close.title = 'Close'
    bar.appendChild(close)

    const title = document.createElement('span')
    title.className = 's1-title'
    title.dataset['part'] = 'title'
    title.textContent = s.title
    bar.appendChild(title)

    frame.appendChild(bar)

    const content = document.createElement('div')
    content.className = 's1-content'
    content.dataset['content'] = ''
    frame.appendChild(content)

    // The grow box: the 16x16 corner the era resized from, carrying the measured
    // 11x11 two-square icon. Purely chrome — the drag is hit-tested from the `se`
    // handle, which is positioned over exactly this box.
    const grow = document.createElement('div')
    grow.className = 's1-grow'
    grow.setAttribute('aria-hidden', 'true')
    frame.appendChild(grow)

    el.appendChild(frame)

    for (const edge of EDGES) {
      const h = document.createElement('div')
      h.className = `s1-resize s1-resize-${edge}`
      h.dataset['resize'] = edge
      el.appendChild(h)
    }

    const handle: System1Handle = { el, content, titleText: title, close }
    handles.set(el, handle)
    this.applyState(handle, s)
    return handle
  }

  updateFrame(h: FrameHandle, s: WindowState, changed: ChangeMask): void {
    const sh = handles.get(h.el)
    if (!sh) return
    if (changed & Change.Title) sh.titleText.textContent = s.title
    if (changed & Change.Focus) h.el.dataset['state'] = s.focused ? 'focused' : 'blurred'
    if (changed & (Change.Dirty | Change.Maximized | Change.Minimized | Change.Suspended)) {
      this.applyState(sh, s)
    }
    if (changed & (Change.Title | Change.Rect | Change.Focus)) this.centreTitle(sh)
  }

  destroyFrame(h: FrameHandle): void {
    handles.delete(h.el)
  }

  /*
   * System 1 has no minimize, so these are never called: `minimizeStyle: 'none'` makes
   * `WindowManager.minimize` return before it reaches the renderer. They resolve
   * immediately rather than animating, which is the complete and correct behaviour for
   * an era with no minimized state to animate into — there is no window list, no
   * Dock and no desktop icon for a document window to collapse toward until
   * MultiFinder in 1987.
   */
  async minimizeTo(_h: FrameHandle, _target: Rect): Promise<void> {
    return
  }

  async restoreFrom(_h: FrameHandle, _from: Rect): Promise<void> {
    return
  }

  /**
   * Centres the title on a whole pixel.
   *
   * This is a fidelity requirement, not a nicety. CSS centring distributes the free
   * space without rounding, so a title whose width has the opposite parity to its bar
   * lands on a half pixel — and in a 1-bit era a half-pixel glyph edge is the one
   * thing the whole integer-scaled viewport exists to prevent. Left to the browser it
   * produced 632 subpixel-antialiased pixels on one window title, which the
   * two-tones-only fidelity test catches.
   *
   * `Math.floor` rather than `Math.round` because that is what the era did:
   * `StandardWDEF` positions the title with `(left + right - titleWidth) / 2` in
   * integer arithmetic, which truncates.
   *
   * Called only on a title, rect or focus change — never inside a gesture loop, which
   * is why reading layout here is safe. `core/wm/drag.ts` remains the only place a
   * layout read is forbidden outright.
   */
  private centreTitle(h: System1Handle): void {
    const bar = h.titleText.parentElement
    if (!bar) return
    const free = bar.clientWidth - h.titleText.offsetWidth
    h.titleText.style.left = `${Math.max(0, Math.floor(free / 2))}px`
  }

  private applyState(h: System1Handle, s: WindowState): void {
    h.el.dataset['maximized'] = s.maximized ? 'true' : 'false'
    h.el.dataset['dirty'] = s.dirty ? 'true' : 'false'
    h.el.dataset['suspended'] = s.suspended ? 'true' : 'false'
    h.el.dataset['modal'] = s.modalOwner !== null ? 'true' : 'false'
    h.el.dataset['resizable'] = s.resizable ? 'true' : 'false'
    // A window that cannot be closed shows no close box at all. The classic Mac had
    // no greyed close box: `documentProc` either drew one or it did not, which is the
    // same distinction `goAwayFlag` makes in the Window Manager.
    h.close.hidden = !s.closable
    // No dirty indicator, deliberately. The classic Mac showed unsaved state in the
    // Save Changes alert and nowhere in the chrome; a marker in the title bar would be
    // a Windows habit. The attribute is still set, because it is contract.
  }
}
