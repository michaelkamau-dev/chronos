/**
 * The phase-1 chrome renderer.
 *
 * Emits the data-attribute vocabulary the window manager hit-tests against, and
 * nothing more: a title bar, three chrome buttons, eight resize handles and a
 * content area. Styling lives entirely in skin.css.
 *
 * `updateFrame` honours the ChangeMask, so a focus change flips one attribute
 * rather than rebuilding DOM. That discipline is set here in the harness so the
 * era skins inherit it rather than discovering it at phase 4.
 */

import { Change, type ChangeMask, type ChromeRenderer, type FrameHandle, type ResizeEdge, type WindowState } from '../../core/wm/types.js'
import type { Rect } from '../../core/geometry.js'
import { PLAIN_METRICS } from './metrics.js'

const EDGES: readonly ResizeEdge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

interface PlainHandle extends FrameHandle {
  titleText: HTMLElement
  buttons: { minimize: HTMLButtonElement; maximize: HTMLButtonElement; close: HTMLButtonElement }
}

const handles = new WeakMap<HTMLElement, PlainHandle>()

export class PlainChrome implements ChromeRenderer {
  readonly metrics = PLAIN_METRICS

  createFrame(s: WindowState): FrameHandle {
    const el = document.createElement('div')
    el.className = 'win'
    el.dataset['state'] = s.focused ? 'focused' : 'blurred'

    const bar = document.createElement('div')
    bar.className = 'win-titlebar'
    bar.dataset['part'] = 'titlebar'

    const title = document.createElement('span')
    title.className = 'win-title'
    title.dataset['part'] = 'title'
    title.textContent = s.title
    bar.appendChild(title)

    const controls = document.createElement('div')
    controls.className = 'win-controls'

    const minimize = makeButton('minimize', '_', 'Minimize')
    const maximize = makeButton('maximize', '□', 'Maximize')
    const close = makeButton('close', '×', 'Close')

    // System 1 has no minimize at all; a skin whose era lacks a control simply
    // does not emit it. The harness keeps all three so the contract is exercised.
    if (this.metrics.minimizeStyle !== 'none') controls.appendChild(minimize)
    controls.appendChild(maximize)
    controls.appendChild(close)
    bar.appendChild(controls)
    el.appendChild(bar)

    const content = document.createElement('div')
    content.className = 'win-content'
    content.dataset['content'] = ''
    el.appendChild(content)

    for (const edge of EDGES) {
      const h = document.createElement('div')
      h.className = `win-resize win-resize-${edge}`
      h.dataset['resize'] = edge
      el.appendChild(h)
    }

    const handle: PlainHandle = {
      el,
      content,
      titleText: title,
      buttons: { minimize, maximize, close },
    }
    handles.set(el, handle)
    this.applyState(handle, s)
    return handle
  }

  updateFrame(h: FrameHandle, s: WindowState, changed: ChangeMask): void {
    const ph = handles.get(h.el)
    if (!ph) return
    if (changed & Change.Title) ph.titleText.textContent = s.title
    if (changed & Change.Focus) h.el.dataset['state'] = s.focused ? 'focused' : 'blurred'
    if (changed & (Change.Dirty | Change.Maximized | Change.Minimized | Change.Suspended)) {
      this.applyState(ph, s)
    }
  }

  destroyFrame(h: FrameHandle): void {
    handles.delete(h.el)
  }

  /*
   * `shrink`: collapse toward the target rect, with the Web Animations API so the
   * window manager can await it.
   *
   * There is no reduced-motion check here. The WM does not call this at all when the
   * query matches, so a skin cannot forget it — see src/core/motion.ts.
   */
  async minimizeTo(h: FrameHandle, target: Rect): Promise<void> {
    const box = h.el.getBoundingClientRect()
    if (box.width === 0 || box.height === 0) return
    const sx = Math.max(target.w / box.width, 0.05)
    const sy = Math.max(target.h / box.height, 0.05)
    const current = h.el.style.transform
    const anim = h.el.animate(
      [
        { transform: current, opacity: 1 },
        {
          transform: `translate3d(${target.x}px, ${target.y}px, 0) scale(${sx}, ${sy})`,
          opacity: 0.2,
        },
      ],
      { duration: 120, easing: 'ease-out' },
    )
    await anim.finished.catch(() => undefined)
  }

  async restoreFrom(h: FrameHandle, from: Rect): Promise<void> {
    const anim = h.el.animate(
      [
        { transform: `translate3d(${from.x}px, ${from.y}px, 0) scale(0.2)`, opacity: 0.2 },
        { transform: h.el.style.transform, opacity: 1 },
      ],
      { duration: 120, easing: 'ease-out' },
    )
    await anim.finished.catch(() => undefined)
  }

  private applyState(h: PlainHandle, s: WindowState): void {
    h.el.dataset['maximized'] = s.maximized ? 'true' : 'false'
    h.el.dataset['dirty'] = s.dirty ? 'true' : 'false'
    h.el.dataset['suspended'] = s.suspended ? 'true' : 'false'
    h.el.dataset['modal'] = s.modalOwner !== null ? 'true' : 'false'
    // Disabled is one of the five required states, and it has to be real: a
    // non-closable window's close button is genuinely disabled, not just dimmed.
    h.buttons.close.disabled = !s.closable
    h.buttons.maximize.disabled = !s.resizable
    h.el.dataset['resizable'] = s.resizable ? 'true' : 'false'
  }
}

function makeButton(action: string, glyph: string, label: string): HTMLButtonElement {
  const b = document.createElement('button')
  b.type = 'button'
  b.className = `win-button win-button-${action}`
  b.dataset['action'] = action
  b.textContent = glyph
  b.setAttribute('aria-label', label)
  b.title = label
  return b
}
