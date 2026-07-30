/**
 * Windows 3.1 chrome renderer.
 *
 * Structurally different from XP in three ways that the data-attribute vocabulary
 * absorbs without the window manager learning anything about either era:
 *
 * 1. **There is no close button.** 3.1 closes a window through the system menu at
 *    the top left — double-clicking that box, or picking Close, or Ctrl+F4. So the
 *    caption emits `data-action="menu"` on the left and minimize/maximize on the
 *    right, and no `data-action="close"` element exists at all. The WM's `close()`
 *    path is reached from the menu and the keymap instead, which is what makes the
 *    "every mouse action has a keyboard path" rule cut both ways here.
 * 2. **The caption is 18px and flat.** No gradient — `COLOR_GRADIENTACTIVECAPTION`
 *    arrives with Windows 95 — and the inactive caption is white with black text
 *    rather than grey.
 * 3. **The chrome boxes are 1px bitmaps, not glyph text.** The minimize triangle,
 *    the maximize triangle and the system-menu bar are drawn from `box-shadow`
 *    rectangles at exact pixel offsets, because a font glyph scaled into an 18px
 *    caption would land off the grid and blur.
 *
 * Every measurement here is from `docs/sources/win31-*.png`; see metrics.ts.
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
import { WIN31_METRICS } from './metrics.js'

const EDGES: readonly ResizeEdge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

interface Win31Handle extends FrameHandle {
  titleText: HTMLElement
  sysMenu: HTMLButtonElement
  minimize: HTMLButtonElement
  maximize: HTMLButtonElement
}

const handles = new WeakMap<HTMLElement, Win31Handle>()

export class Win31Chrome implements ChromeRenderer {
  readonly metrics = WIN31_METRICS

  createFrame(s: WindowState): FrameHandle {
    const el = document.createElement('div')
    el.className = 'w31-win'
    el.dataset['state'] = s.focused ? 'focused' : 'blurred'

    const bar = document.createElement('div')
    bar.className = 'w31-titlebar'
    bar.dataset['part'] = 'titlebar'

    // The system-menu box. In 3.1 this is the only route to Close from the mouse,
    // so it carries `data-action="menu"` and the WM opens the chrome menu on it.
    const sysMenu = box('menu', 'System menu')
    sysMenu.classList.add('w31-sysbox')
    bar.appendChild(sysMenu)

    const title = document.createElement('span')
    title.className = 'w31-title'
    title.dataset['part'] = 'title'
    title.textContent = s.title
    bar.appendChild(title)

    const controls = document.createElement('div')
    controls.className = 'w31-controls'
    const minimize = box('minimize', 'Minimize')
    minimize.classList.add('w31-minbox')
    const maximize = box('maximize', 'Maximize')
    maximize.classList.add('w31-maxbox')
    controls.appendChild(minimize)
    controls.appendChild(maximize)
    bar.appendChild(controls)

    el.appendChild(bar)

    const content = document.createElement('div')
    content.className = 'w31-content'
    content.dataset['content'] = ''
    el.appendChild(content)

    for (const edge of EDGES) {
      const h = document.createElement('div')
      h.className = `w31-resize w31-resize-${edge}`
      h.dataset['resize'] = edge
      el.appendChild(h)
    }

    const handle: Win31Handle = { el, content, titleText: title, sysMenu, minimize, maximize }
    handles.set(el, handle)
    this.applyState(handle, s)
    return handle
  }

  updateFrame(h: FrameHandle, s: WindowState, changed: ChangeMask): void {
    const wh = handles.get(h.el)
    if (!wh) return
    if (changed & Change.Title) wh.titleText.textContent = s.title
    if (changed & Change.Focus) h.el.dataset['state'] = s.focused ? 'focused' : 'blurred'
    if (changed & (Change.Dirty | Change.Maximized | Change.Minimized | Change.Suspended)) {
      this.applyState(wh, s)
    }
  }

  destroyFrame(h: FrameHandle): void {
    handles.delete(h.el)
  }

  /*
   * 3.1 minimizes to an icon on the desktop — there is no taskbar — so the window
   * collapses toward the target the shell supplies rather than toward a button.
   *
   * No reduced-motion check here: the WM skips the call entirely when the query
   * matches. See src/core/motion.ts.
   */
  async minimizeTo(h: FrameHandle, target: Rect): Promise<void> {
    const box_ = h.el.getBoundingClientRect()
    if (box_.width === 0 || box_.height === 0) return
    const sx = Math.max(target.w / box_.width, 0.05)
    const sy = Math.max(target.h / box_.height, 0.05)
    const anim = h.el.animate(
      [
        { transform: h.el.style.transform, opacity: 1 },
        {
          transform: `translate3d(${target.x}px, ${target.y}px, 0) scale(${sx}, ${sy})`,
          opacity: 0.2,
        },
      ],
      // Deliberately short and linear. 3.1 had no easing curves; it repainted.
      { duration: 90, easing: 'linear' },
    )
    await anim.finished.catch(() => undefined)
  }

  async restoreFrom(h: FrameHandle, from: Rect): Promise<void> {
    const anim = h.el.animate(
      [
        { transform: `translate3d(${from.x}px, ${from.y}px, 0) scale(0.2)`, opacity: 0.2 },
        { transform: h.el.style.transform, opacity: 1 },
      ],
      { duration: 90, easing: 'linear' },
    )
    await anim.finished.catch(() => undefined)
  }

  private applyState(h: Win31Handle, s: WindowState): void {
    h.el.dataset['maximized'] = s.maximized ? 'true' : 'false'
    h.el.dataset['dirty'] = s.dirty ? 'true' : 'false'
    h.el.dataset['suspended'] = s.suspended ? 'true' : 'false'
    h.el.dataset['modal'] = s.modalOwner !== null ? 'true' : 'false'
    h.el.dataset['resizable'] = s.resizable ? 'true' : 'false'
    // Disabled has to be real, not dimmed: a non-resizable window's maximize box
    // genuinely does not work, and a non-closable window's system menu cannot
    // reach Close — which the menu spec enforces rather than this attribute.
    h.maximize.disabled = !s.resizable
    // 3.1 swaps the maximize box for a restore box when maximized. Two triangles
    // rather than one, and the glyph is what changes, not the box.
    h.maximize.dataset['glyph'] = s.maximized ? 'restore' : 'maximize'
    h.maximize.setAttribute('aria-label', s.maximized ? 'Restore' : 'Maximize')
    h.maximize.title = s.maximized ? 'Restore' : 'Maximize'
  }
}

function box(action: string, label: string): HTMLButtonElement {
  const b = document.createElement('button')
  b.type = 'button'
  b.className = `w31-box w31-box-${action}`
  b.dataset['action'] = action
  b.dataset['glyph'] = action
  b.setAttribute('aria-label', label)
  b.title = label
  return b
}
