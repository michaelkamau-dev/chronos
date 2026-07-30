/**
 * Windows XP Luna window chrome.
 *
 * Built to the measured 1:1 figure, not to XP.css. The four divergences are
 * annotated where they occur.
 *
 * The corner is the interesting one. Microsoft's figure shows a five-row arc whose
 * per-row x-insets are 5,3,2,1,1,0 — a hand-drawn corner bitmap. No `border-radius`
 * value reproduces that, so the frame is clipped with a rectilinear `clip-path`
 * built from the measured insets. Every segment is axis-aligned on an integer pixel
 * boundary, so the clip has no partial coverage and therefore no antialiasing: the
 * steps stay hard, which is the whole point.
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
import { XP_METRICS } from './metrics.js'

const EDGES: readonly ResizeEdge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

interface XpHandle extends FrameHandle {
  titleText: HTMLElement
  buttons: {
    minimize: HTMLButtonElement
    maximize: HTMLButtonElement
    close: HTMLButtonElement
  }
  sysIcon: HTMLButtonElement
}

const handles = new WeakMap<HTMLElement, XpHandle>()

/**
 * Builds the `clip-path` polygon for the stepped top corners.
 *
 * Walks the measured insets down the left side, mirrors them on the right, and
 * closes around the bottom. Coordinates are integer pixels from the top-left, so
 * the browser has no fractional coverage to antialias.
 */
function steppedCornerClip(insetsPerRow: readonly number[]): string {
  const pts: string[] = []
  // Left side, top-down: each row starts one step further left than the last.
  for (let row = 0; row < insetsPerRow.length; row++) {
    const inset = insetsPerRow[row] ?? 0
    pts.push(`${inset}px ${row}px`)
    const next = insetsPerRow[row + 1]
    if (next !== undefined && next !== inset) pts.push(`${inset}px ${row + 1}px`)
  }
  const flush = insetsPerRow[insetsPerRow.length - 1] ?? 0
  pts.push(`${flush}px 100%`)
  pts.push(`calc(100% - ${flush}px) 100%`)
  // Right side, bottom-up: the mirror of the left.
  for (let row = insetsPerRow.length - 1; row >= 0; row--) {
    const inset = insetsPerRow[row] ?? 0
    const prev = insetsPerRow[row - 1]
    if (prev !== undefined && prev !== inset) pts.push(`calc(100% - ${inset}px) ${row + 1}px`)
    pts.push(`calc(100% - ${inset}px) ${row}px`)
  }
  return `polygon(${pts.join(', ')})`
}

export class XpChrome implements ChromeRenderer {
  readonly metrics = XP_METRICS

  private readonly clip =
    XP_METRICS.cornerTop.kind === 'steps'
      ? steppedCornerClip(XP_METRICS.cornerTop.insets)
      : 'none'

  createFrame(s: WindowState): FrameHandle {
    const el = document.createElement('div')
    el.className = 'xp-win'
    el.dataset['state'] = s.focused ? 'focused' : 'blurred'
    // The stepped corner, applied to the frame rather than to the caption, so the
    // 4px side frame is clipped by the same arc the caption is.
    el.style.clipPath = this.clip

    const bar = document.createElement('div')
    bar.className = 'xp-titlebar'
    bar.dataset['part'] = 'titlebar'

    // The window icon opens the system menu on a single click and closes the
    // window on a double click, which is why it is a real button carrying
    // data-action rather than decoration.
    const sysIcon = document.createElement('button')
    sysIcon.type = 'button'
    sysIcon.className = 'xp-sysicon'
    sysIcon.dataset['action'] = 'menu'
    sysIcon.setAttribute('aria-label', 'System menu')
    sysIcon.title = 'System menu'
    bar.appendChild(sysIcon)

    const title = document.createElement('span')
    title.className = 'xp-title'
    title.dataset['part'] = 'title'
    title.textContent = s.title
    bar.appendChild(title)

    const controls = document.createElement('div')
    controls.className = 'xp-controls'
    const minimize = makeCaptionButton('minimize', 'Minimize')
    const maximize = makeCaptionButton('maximize', 'Maximize')
    const close = makeCaptionButton('close', 'Close')
    controls.appendChild(minimize)
    controls.appendChild(maximize)
    controls.appendChild(close)
    bar.appendChild(controls)
    el.appendChild(bar)

    const content = document.createElement('div')
    content.className = 'xp-content'
    content.dataset['content'] = ''
    el.appendChild(content)

    for (const edge of EDGES) {
      const h = document.createElement('div')
      h.className = `xp-resize xp-resize-${edge}`
      h.dataset['resize'] = edge
      el.appendChild(h)
    }

    const handle: XpHandle = {
      el,
      content,
      titleText: title,
      buttons: { minimize, maximize, close },
      sysIcon,
    }
    handles.set(el, handle)
    this.applyState(handle, s)
    return handle
  }

  updateFrame(h: FrameHandle, s: WindowState, changed: ChangeMask): void {
    const xh = handles.get(h.el)
    if (!xh) return
    if (changed & Change.Title) xh.titleText.textContent = s.title
    if (changed & Change.Focus) h.el.dataset['state'] = s.focused ? 'focused' : 'blurred'
    if (changed & (Change.Dirty | Change.Maximized | Change.Minimized | Change.Suspended)) {
      this.applyState(xh, s)
    }
    if (changed & Change.Maximized) {
      // A maximized Luna window loses the rounded corner entirely — visible in the
      // states figure, where the maximized caption is flush to the screen edge.
      h.el.style.clipPath = s.maximized ? 'none' : this.clip
    }
  }

  destroyFrame(h: FrameHandle): void {
    handles.delete(h.el)
  }

  /** XP shrinks the window toward its taskbar button. */
  /*
   * XP shrinks toward the taskbar button.
   *
   * No reduced-motion check: the WM skips the call entirely when the query matches,
   * so honouring it is not something a skin can get wrong. See src/core/motion.ts.
   */
  async minimizeTo(h: FrameHandle, target: Rect): Promise<void> {
    const box = h.el.getBoundingClientRect()
    if (box.width === 0 || box.height === 0) return
    const sx = Math.max(target.w / box.width, 0.05)
    const sy = Math.max(target.h / box.height, 0.05)
    const anim = h.el.animate(
      [
        { transform: h.el.style.transform, opacity: 1 },
        {
          transform: `translate3d(${target.x}px, ${target.y}px, 0) scale(${sx}, ${sy})`,
          opacity: 0.15,
        },
      ],
      { duration: 130, easing: 'ease-out' },
    )
    await anim.finished.catch(() => undefined)
  }

  async restoreFrom(h: FrameHandle, from: Rect): Promise<void> {
    const anim = h.el.animate(
      [
        { transform: `translate3d(${from.x}px, ${from.y}px, 0) scale(0.15)`, opacity: 0.15 },
        { transform: h.el.style.transform, opacity: 1 },
      ],
      { duration: 130, easing: 'ease-out' },
    )
    await anim.finished.catch(() => undefined)
  }

  private applyState(h: XpHandle, s: WindowState): void {
    h.el.dataset['maximized'] = s.maximized ? 'true' : 'false'
    h.el.dataset['dirty'] = s.dirty ? 'true' : 'false'
    h.el.dataset['suspended'] = s.suspended ? 'true' : 'false'
    h.el.dataset['modal'] = s.modalOwner !== null ? 'true' : 'false'
    h.el.dataset['resizable'] = s.resizable ? 'true' : 'false'
    // Disabled is one of the five required states and it has to be genuine: a
    // non-closable window's close box is really disabled, not merely dimmed.
    h.buttons.close.disabled = !s.closable
    h.buttons.maximize.disabled = !s.resizable
    h.buttons.maximize.setAttribute('aria-label', s.maximized ? 'Restore' : 'Maximize')
    h.buttons.maximize.title = s.maximized ? 'Restore' : 'Maximize'
    h.buttons.maximize.dataset['glyph'] = s.maximized ? 'restore' : 'maximize'
  }
}

function makeCaptionButton(action: string, label: string): HTMLButtonElement {
  const b = document.createElement('button')
  b.type = 'button'
  // The colour class is semantic, not cosmetic: XP's navigation-button system
  // makes red high-impact and blue neutral, which is *why* close is red and
  // minimize and maximize are blue. They are not a uniform set.
  const category = action === 'close' ? 'impact' : 'neutral'
  b.className = `xp-capbtn xp-capbtn-${action} xp-capbtn--${category}`
  b.dataset['action'] = action
  b.dataset['glyph'] = action
  b.setAttribute('aria-label', label)
  b.title = label
  return b
}

/** Exported so the pixel-comparison test can assert the clip matches the metrics. */
export function xpCornerClipPath(): string {
  return XP_METRICS.cornerTop.kind === 'steps'
    ? steppedCornerClip(XP_METRICS.cornerTop.insets)
    : 'none'
}
