/**
 * Ledger chrome.
 *
 * Three things here are the era arriving in the window frame, and each is §8 rather
 * than a look:
 *
 * 1. **The cost gutter is `border.right`.** A 40px itemised strip down the right edge
 *    of every window, declared to the window manager as border rather than added to
 *    the contract. That single decision is what makes §8's "it makes every layout in
 *    the OS 40px narrower than it wants to be" *true* — `chromeExtra()` subtracts it
 *    from the content area, every app gets a narrower box, and the window manager
 *    never learns that a disclosure strip exists.
 *
 * 2. **The title bar carries the running cost.** §8: `Letter — 3.1 kJ — 14 min`,
 *    "Long, ugly, constantly rewriting itself." The em dash is §8's own and Public
 *    Sans carries U+2014, which was checked before this file was written rather than
 *    after a fidelity test caught it — the ChiKareGo2 lesson.
 *
 * 3. **A suspended window bleaches; it does not dim.** §8: "The longer a window sits
 *    unfocused, the further it bleaches toward the paper colour and the coarser its
 *    dither gets. You can read at a glance how long you have ignored something." So
 *    the inactive treatment is a *clock*, and `opacity` would be the wrong mechanism
 *    twice over — it carries no duration, and it is alpha, which §8 rules out because
 *    "low-power display modes quantise".
 *
 * ### Nothing animates, and that includes the minimize
 *
 * §8: "Nothing animates. Transitions cost joules. States *cut*. There is no fade, no
 * spring, no easing curve anywhere in the OS." `minimizeTo` and `restoreFrom` return
 * immediately without creating an animation. That is not the same absence as System
 * 1's, where the methods are unreachable because the era has no minimize at all —
 * this era minimizes, and the cut *is* the animation. `ledger-fidelity.spec.ts`
 * asserts it as an era claim, which inverts what the other five suites assert.
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
import { LEDGER_METRICS, GUTTER } from './metrics.js'
import { BLEACH_BANDS, bleachBandFor } from './dither.js'
import {
  formatCalls,
  formatElapsed,
  formatJoules,
  type LedgerClock,
  type WindowCost,
} from './clock.js'

const EDGES: readonly ResizeEdge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']

interface GutterRow {
  value: HTMLElement
  unit: HTMLElement
  mark: HTMLElement
}

interface LedgerHandle extends FrameHandle {
  titleText: HTMLElement
  costText: HTMLElement
  bleach: HTMLElement
  rows: readonly GutterRow[]
  title: string
  /** The bleach band currently written, so an unchanged band writes no DOM. */
  band: number
  /** The last cost strings written, for the same reason. */
  last: string
}

const handles = new WeakMap<HTMLElement, LedgerHandle>()

export class LedgerChrome implements ChromeRenderer {
  readonly metrics = LEDGER_METRICS

  private readonly clock: LedgerClock
  private readonly live = new Set<LedgerHandle>()
  /** Reused on every tick: the cost path runs once per window per delivered frame. */
  private readonly cost: WindowCost = { joules: 0, modelCalls: 0, elapsedMs: 0, frames: 0 }
  private readonly ids = new WeakMap<HTMLElement, number>()

  constructor(clock: LedgerClock) {
    this.clock = clock
    // One subscription for every window rather than one per frame: the clock is
    // driven by the governor, so this is already rate-limited to whatever the era's
    // target is — 1Hz while reading, the display's rate during a burst.
    clock.watch(() => this.repaint())
  }

  createFrame(s: WindowState): FrameHandle {
    const el = document.createElement('div')
    el.className = 'lg-win'
    el.dataset['state'] = s.focused ? 'focused' : 'blurred'

    const bar = document.createElement('div')
    bar.className = 'lg-titlebar'
    bar.dataset['part'] = 'titlebar'

    const title = document.createElement('span')
    title.className = 'lg-title'
    title.dataset['part'] = 'title'
    title.textContent = s.title
    bar.appendChild(title)

    // The cost suffix is a separate node from the title the window manager writes.
    // Concatenating them into one text node would mean every governor tick rewrote
    // the app's own title, and `Change.Title` would fight the clock for the node.
    const cost = document.createElement('span')
    cost.className = 'lg-title-cost'
    cost.dataset['ledgerCost'] = 'title'
    bar.appendChild(cost)

    for (const action of ['minimize', 'maximize', 'close'] as const) {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = `lg-btn lg-btn-${action}`
      b.dataset['action'] = action
      b.setAttribute('aria-label', action[0]!.toUpperCase() + action.slice(1))
      b.title = b.getAttribute('aria-label')!
      bar.appendChild(b)
    }

    const content = document.createElement('div')
    content.className = 'lg-content'
    content.dataset['content'] = ''

    // The gutter. §8 calls it a regulatory disclosure, so it carries a role and a
    // label rather than being decorative furniture a screen reader skips.
    const gutter = document.createElement('div')
    gutter.className = 'lg-gutter'
    gutter.dataset['ledgerGutter'] = ''
    gutter.setAttribute('role', 'group')
    gutter.setAttribute('aria-label', 'Cost disclosure')

    const rows: GutterRow[] = []
    for (const kind of ['joules', 'calls', 'elapsed'] as const) {
      const entry = document.createElement('div')
      entry.className = 'lg-gutter-entry'
      entry.dataset['ledgerEntry'] = kind

      const value = document.createElement('span')
      value.className = 'lg-gutter-value'
      const unitRow = document.createElement('span')
      unitRow.className = 'lg-gutter-unit'
      const unit = document.createElement('span')
      const mark = document.createElement('span')
      mark.className = 'lg-gutter-mark'
      mark.dataset['ledgerRounded'] = 'false'
      unitRow.append(unit, mark)

      entry.append(value, unitRow)
      gutter.appendChild(entry)
      rows.push({ value, unit, mark })
    }

    // The bleach overlay: one dithered surface over the whole frame, paper-coloured,
    // whose density and cell size say how long the window has been ignored. One
    // element rather than a filter on each part, so the pattern has a single phase
    // across the window and does not seam where two surfaces meet.
    const bleach = document.createElement('div')
    bleach.className = 'lg-bleach'
    bleach.dataset['ledgerBleach'] = '0'
    bleach.setAttribute('aria-hidden', 'true')

    el.append(bar, content, gutter, bleach)

    for (const edge of EDGES) {
      const h = document.createElement('div')
      h.className = `lg-resize lg-resize-${edge}`
      h.dataset['resize'] = edge
      el.appendChild(h)
    }

    const handle: LedgerHandle = {
      el,
      content,
      titleText: title,
      costText: cost,
      bleach,
      rows,
      title: s.title,
      band: -1,
      last: '',
    }
    handles.set(el, handle)
    this.ids.set(el, s.id)
    this.live.add(handle)
    this.clock.open(s.id)
    this.applyState(handle, s)
    this.paintOne(handle, s.id, s.suspended)
    return handle
  }

  updateFrame(h: FrameHandle, s: WindowState, changed: ChangeMask): void {
    const lh = handles.get(h.el)
    if (!lh) return
    if (changed & Change.Title) {
      lh.title = s.title
      lh.titleText.textContent = s.title
    }
    if (changed & Change.Focus) {
      h.el.dataset['state'] = s.focused ? 'focused' : 'blurred'
      // The charge follows focus, because §8's whole deletion is that only the
      // focused window computes.
      this.clock.setFocused(s.focused ? s.id : null)
      if (s.focused) {
        lh.band = -1
        lh.bleach.dataset['ledgerBleach'] = '0'
      }
    }
    if (changed & (Change.Dirty | Change.Maximized | Change.Minimized | Change.Suspended)) {
      this.applyState(lh, s)
    }
    this.paintOne(lh, s.id, s.suspended)
  }

  destroyFrame(h: FrameHandle): void {
    const lh = handles.get(h.el)
    if (lh) this.live.delete(lh)
    const id = this.ids.get(h.el)
    if (id !== undefined) this.clock.close(id as never)
    handles.delete(h.el)
  }

  /**
   * Minimize is a cut.
   *
   * §8: "Nothing animates. Transitions cost joules. States *cut*." The window manager
   * hides the frame the moment this resolves, so resolving immediately with no
   * `Animation` created is the complete behaviour — not an omission, and not the same
   * thing as System 1's empty implementation, which is empty because that era has no
   * minimize to perform at all.
   */
  async minimizeTo(_h: FrameHandle, _target: Rect): Promise<void> {
    return
  }

  async restoreFrom(_h: FrameHandle, _from: Rect): Promise<void> {
    return
  }

  // ------------------------------------------------------------------ private

  /** Every live window's cost line and bleach band, once per delivered frame. */
  private repaint(): void {
    for (const h of this.live) {
      const id = this.ids.get(h.el)
      if (id === undefined) continue
      this.paintOne(h, id as never, h.el.dataset['suspended'] === 'true')
    }
  }

  /**
   * Writes one window's cost strings and bleach band.
   *
   * Guarded on the composed string and the band index: at the era's own 1Hz this runs
   * once a second per window, but a burst runs it at the display's rate, and rewriting
   * an unchanged text node every frame would dirty layout for nothing.
   */
  private paintOne(h: LedgerHandle, id: number, suspended: boolean): void {
    const c = this.clock.costOf(id as never, this.cost)
    const j = formatJoules(c.joules)
    const m = formatCalls(c.modelCalls)
    const t = formatElapsed(c.elapsedMs)

    // §8's format, em dash and all: `Letter — 3.1 kJ — 14 min`.
    const suffix = ` — ${j.value} ${j.unit} — ${t.value} ${t.unit}`
    if (suffix !== h.last) {
      h.last = suffix
      h.costText.textContent = suffix
    }

    const cells = [j, m, t]
    for (let i = 0; i < h.rows.length; i++) {
      const row = h.rows[i]!
      const cell = cells[i]!
      if (row.value.textContent !== cell.value) row.value.textContent = cell.value
      if (row.unit.textContent !== cell.unit) row.unit.textContent = cell.unit
      const rounded = cell.rounded ? 'true' : 'false'
      if (row.mark.dataset['ledgerRounded'] !== rounded) {
        row.mark.dataset['ledgerRounded'] = rounded
        row.mark.textContent = cell.rounded ? GUTTER.roundedMark : ''
      }
    }

    // The bleach clock only runs while the window is suspended: §8 suspends a window
    // about 400ms after it loses focus, and the fade is what happens next.
    const band = suspended ? bleachBandFor(this.clock.unfocusedFor(id as never)) : 0
    if (band !== h.band) {
      h.band = band
      h.bleach.dataset['ledgerBleach'] = String(band)
      const spec = BLEACH_BANDS[band]!
      h.bleach.style.setProperty('--lg-bleach-tile', `var(--lg-tile-bleach-${band})`)
      h.bleach.style.setProperty('--lg-bleach-cell', `${spec.cell}px`)
    }
  }

  private applyState(h: LedgerHandle, s: WindowState): void {
    h.el.dataset['maximized'] = s.maximized ? 'true' : 'false'
    h.el.dataset['dirty'] = s.dirty ? 'true' : 'false'
    h.el.dataset['suspended'] = s.suspended ? 'true' : 'false'
    h.el.dataset['modal'] = s.modalOwner !== null ? 'true' : 'false'
    h.el.dataset['resizable'] = s.resizable ? 'true' : 'false'
    const close = h.el.querySelector<HTMLButtonElement>('[data-action="close"]')
    if (close) close.disabled = !s.closable
    const max = h.el.querySelector<HTMLButtonElement>('[data-action="maximize"]')
    if (max) max.disabled = !s.resizable
  }
}
