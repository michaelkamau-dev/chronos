/**
 * Ledger's accounting.
 *
 * The era bills the viewer for rendering, so something has to decide what a window
 * costs. This is that, and the decision it makes is that **the counts are real**: the
 * joules a window is charged come from frames the render-budget governor actually
 * delivered while that window was focused, not from a plausible-looking number that
 * climbs on a timer.
 *
 * That is not a detail. §8's premise is that the OS "does not hide the machine from
 * you. It bills you for it", and a gutter showing invented numbers would be a
 * screenshot of the idea rather than the idea. It also makes the throttle visible in
 * the only place that matters: hold the display at 1Hz and the cost climbs slowly,
 * type and force a burst and it climbs fast, because those are literally different
 * numbers of painted frames.
 *
 * ### What is real and what is a fiction, stated rather than blurred
 *
 * - **Frame counts: real.** `RenderBudget.stats()`, measured.
 * - **Elapsed: real.** Wall clock since the window opened.
 * - **The joules-per-frame coefficient: invented.** There is no way to measure a
 *   device's draw from inside a browser tab. So the instrument is honest and its
 *   scale is made up, and that is worth saying plainly rather than letting a
 *   two-decimal number imply a measurement.
 * - **Model calls: really zero.** §8's premise is that "every search, every
 *   autocomplete, every 'what was I doing' is a model call". Phase 4 has no apps and
 *   therefore nothing that would call a model, so the line reads `0` — because
 *   inventing a number here would be the one place this era lied about its own
 *   accounting, in the gutter whose entire purpose is disclosure. It starts counting
 *   when phase 5 gives it something to count.
 *
 * ### The coefficients are calibrated against §8's own example
 *
 * §8 prints a title bar: `Letter — 3.1 kJ — 14 min`. That is the closest thing this
 * era has to a source figure, so the two coefficients are chosen to reproduce it. 14
 * minutes is 840 seconds; at 2.5W of panel baseline that is 2100 J, leaving 1000 J of
 * frame cost, which at 0.12 J/frame is about 8300 frames — roughly 10fps averaged over
 * the session, which is what a mostly-idle 1Hz display with typing bursts produces. A
 * session that looks like §8's example produces §8's number.
 */

import type { RenderBudget, RenderBudgetStats } from '../../core/input/render-budget.js'
import type { WindowId } from '../../core/wm/types.js'
import { GUTTER } from './metrics.js'

/** Panel and SoC baseline, in watts. Calibrated — see the file header. */
const IDLE_WATTS = 2.5
/** Marginal cost of painting one frame, in joules. Calibrated — see the file header. */
const JOULES_PER_FRAME = 0.12

/** What one window has cost. */
export interface WindowCost {
  /** Joules. */
  joules: number
  /** On-device model calls. Zero until an app makes one. */
  modelCalls: number
  /** Milliseconds since the window opened. */
  elapsedMs: number
  /** Frames painted while this window held focus. */
  frames: number
}

interface Entry extends WindowCost {
  openedAt: number
  /** Frame counter reading when this window last took focus, or -1 when unfocused. */
  focusedAtFrames: number
  /** When this window last lost focus, for the bleach ramp. `0` while focused. */
  blurredAt: number
}

/**
 * Round a cost **up**, to the number of characters the gutter column holds.
 *
 * §8: "the OS **rounds every cost up** and tells you it did, in the gutter, every
 * time." This is the mechanism, and the reason it exists at all is the column: 40px
 * less the frame rule leaves 36, which holds three glyphs of 18px Public Sans Black
 * and no more. A value too wide for its disclosure gets squeezed, and squeezing
 * upward is the choice a billing authority makes.
 *
 * Always ceilings, never rounds-to-nearest — `3.01` becomes `3.1`, not `3.0`.
 */
export function roundUpTo(value: number, chars: number): { text: string; rounded: boolean } {
  if (value < 10) {
    const up = Math.ceil(value * 10) / 10
    return { text: up.toFixed(1), rounded: up !== value }
  }
  const limit = Math.pow(10, chars) - 1
  const up = Math.ceil(value)
  if (up <= limit) return { text: String(up), rounded: up !== value }
  // Wider than the column even as an integer: the unit has to change, and the caller
  // does that. Report the clamped text so the column can never overflow.
  return { text: String(limit), rounded: true }
}

/** `3.1 kJ` and friends, as a value and a unit, already squeezed to the column. */
export function formatJoules(j: number): { value: string; unit: string; rounded: boolean } {
  if (j < 1000) {
    const r = roundUpTo(j, GUTTER.valueChars)
    return { value: r.text, unit: 'J', rounded: r.rounded }
  }
  if (j < 1_000_000) {
    const r = roundUpTo(j / 1000, GUTTER.valueChars)
    return { value: r.text, unit: 'kJ', rounded: r.rounded }
  }
  const r = roundUpTo(j / 1_000_000, GUTTER.valueChars)
  return { value: r.text, unit: 'MJ', rounded: r.rounded }
}

/** `14 min`, rounded up, in the same three-character column. */
export function formatElapsed(ms: number): { value: string; unit: string; rounded: boolean } {
  const minutes = ms / 60_000
  if (minutes < 60) {
    const up = Math.ceil(minutes)
    return { value: String(Math.min(up, 999)), unit: 'min', rounded: up * 60_000 !== ms }
  }
  const r = roundUpTo(minutes / 60, GUTTER.valueChars)
  return { value: r.text, unit: 'h', rounded: true }
}

/** Model calls. Zero, honestly — see the file header. */
export function formatCalls(n: number): { value: string; unit: string; rounded: boolean } {
  const r = roundUpTo(n, GUTTER.valueChars)
  return { value: n === 0 ? '0' : r.text, unit: 'mc', rounded: n !== 0 && r.rounded }
}

/**
 * The skin's clock and ledger.
 *
 * Constructed once in `index.ts` and handed to both the chrome renderer and the shell
 * region, so the gutter on a window and the total in the budget bar are two views of
 * one set of numbers rather than two counters that can disagree. The governor arrives
 * later, when the region mounts — the shell builds the chrome renderer before it
 * mounts regions, so `attach` is the join.
 */
export class LedgerClock {
  private budget: RenderBudget | null = null
  private readonly entries = new Map<WindowId, Entry>()
  private readonly watchers = new Set<() => void>()
  private unsubscribe: (() => void) | null = null

  /** Reused: `stats()` is read on every delivered frame and must not allocate. */
  private readonly stat: RenderBudgetStats = {
    delivered: 0,
    suppressed: 0,
    priority: 0,
    sleptMs: 0,
    hz: null,
  }

  private startedAt = 0
  private focused: WindowId | null = null

  /** Total frames painted, delivered plus gesture frames. */
  private framesNow = 0

  attach(budget: RenderBudget): () => void {
    this.budget = budget
    this.startedAt = performance.now()
    this.unsubscribe = budget.subscribe(() => this.onFrame())
    return () => {
      this.unsubscribe?.()
      this.unsubscribe = null
      this.budget = null
    }
  }

  get attached(): boolean {
    return this.budget !== null
  }

  /** Notified on every delivered frame, so a surface can redraw its own numbers. */
  watch(fn: () => void): () => void {
    this.watchers.add(fn)
    return () => this.watchers.delete(fn)
  }

  open(id: WindowId): void {
    const now = performance.now()
    this.entries.set(id, {
      joules: 0,
      modelCalls: 0,
      elapsedMs: 0,
      frames: 0,
      openedAt: now,
      focusedAtFrames: -1,
      blurredAt: now,
    })
  }

  close(id: WindowId): void {
    this.entries.delete(id)
    if (this.focused === id) this.focused = null
  }

  /**
   * Move the charge.
   *
   * §8: "Only the focused window computes." So a window accrues frame cost only while
   * it holds focus, and the accounting is the era's thesis written out rather than an
   * approximation of it.
   */
  setFocused(id: WindowId | null): void {
    const frames = this.readFrames()
    const now = performance.now()
    if (this.focused !== null) {
      const prev = this.entries.get(this.focused)
      if (prev && prev.focusedAtFrames >= 0) {
        prev.frames += Math.max(0, frames - prev.focusedAtFrames)
        prev.focusedAtFrames = -1
        prev.blurredAt = now
      }
    }
    this.focused = id
    if (id !== null) {
      const next = this.entries.get(id)
      if (next) {
        next.focusedAtFrames = frames
        next.blurredAt = 0
      }
    }
  }

  /** Milliseconds since this window lost focus, or 0 while it holds it. */
  unfocusedFor(id: WindowId): number {
    const e = this.entries.get(id)
    if (!e || e.blurredAt === 0) return 0
    return performance.now() - e.blurredAt
  }

  /** What this window has cost. Written into `out`, which is reused by the caller. */
  costOf(id: WindowId, out: WindowCost): WindowCost {
    const e = this.entries.get(id)
    const now = performance.now()
    if (!e) {
      out.joules = 0
      out.modelCalls = 0
      out.elapsedMs = 0
      out.frames = 0
      return out
    }
    const live = e.focusedAtFrames >= 0 ? Math.max(0, this.readFrames() - e.focusedAtFrames) : 0
    const frames = e.frames + live
    const elapsed = now - e.openedAt
    out.frames = frames
    out.elapsedMs = elapsed
    out.modelCalls = e.modelCalls
    out.joules = (elapsed / 1000) * IDLE_WATTS + frames * JOULES_PER_FRAME
    return out
  }

  /** The session total, for the budget bar. */
  sessionCost(out: WindowCost): WindowCost {
    const elapsed = this.startedAt === 0 ? 0 : performance.now() - this.startedAt
    const frames = this.readFrames()
    out.frames = frames
    out.elapsedMs = elapsed
    out.modelCalls = 0
    out.joules = (elapsed / 1000) * IDLE_WATTS + frames * JOULES_PER_FRAME
    return out
  }

  /** Frames the governor has painted, delivered plus gesture. */
  readFrames(): number {
    const b = this.budget
    if (!b) return this.framesNow
    b.stats(this.stat)
    this.framesNow = this.stat.delivered + this.stat.priority
    return this.framesNow
  }

  private onFrame(): void {
    this.readFrames()
    for (const fn of this.watchers) fn()
  }
}
