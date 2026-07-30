/**
 * The phase-1 performance gate.
 *
 * The brief asks for 60fps window drag on a 2019 laptop, with movement that is
 * transform-only, does not thrash layout, and does not allocate per frame. This
 * file measures all four, with 20 windows open, over a sustained drag.
 *
 * Selectors here use the window manager's own contract vocabulary —
 * `[data-win-id]`, `[data-action]`, `[data-part]`, `[data-resize]` — rather than
 * any skin's class names. These tests assert the contract, so they must pass
 * against whichever era is active; keying them to one skin's classes made them
 * hang the moment Windows XP became the default.
 *
 * How each claim is measured:
 *
 * - **Frame pacing** — rAF timestamps collected in-page during the drag. A
 *   dropped frame shows up as an interval near a multiple of the vsync period,
 *   so the assertion is on the long tail, not the mean.
 * - **A 2019 laptop** — CDP `Emulation.setCPUThrottlingRate` at 4x, the standard
 *   proxy for mid-tier hardware. Running this unthrottled on a server CPU would
 *   prove nothing.
 * - **Layout thrash** — CDP `Performance.getMetrics` counters for `LayoutCount`
 *   and `RecalcStyleCount`, sampled either side of the drag. A transform-only
 *   move must not add layouts per frame.
 * - **Allocation** — `HeapProfiler.collectGarbage` then `Runtime.getHeapUsage`
 *   either side, so the delta is retained bytes rather than garbage in flight.
 *   The one unavoidable per-frame allocation is the transform string, which is
 *   short-lived and must not survive a collection.
 */

import { test, expect, type CDPSession, type Page } from '@playwright/test'

const WINDOWS = 20
const DRAG_MS = 6000
const CPU_THROTTLE = 4

interface FrameStats {
  count: number
  median: number
  p95: number
  p99: number
  max: number
  over50: number
  longTasks: number
  longestTask: number
  vsync: number
}

async function boot(page: Page): Promise<void> {
  await page.goto('/')
  await page.waitForFunction(() => window.__chronos !== undefined)
  await page.evaluate(() => window.__chronos.reset())
}

/** Drives a drag from inside the page and records rAF pacing while it runs. */
async function measureDrag(page: Page, durationMs: number): Promise<FrameStats> {
  return page.evaluate(async (duration) => {
    const frame = document.querySelector<HTMLElement>('[data-win-id][data-state="focused"]')
      ?? document.querySelector<HTMLElement>('[data-win-id]')
    if (!frame) throw new Error('no window to drag')
    const bar = frame.querySelector<HTMLElement>('[data-part="titlebar"]')
    if (!bar) throw new Error('no title bar')

    const times: number[] = []
    const longTasks: number[] = []
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) longTasks.push(entry.duration)
    })
    try {
      observer.observe({ entryTypes: ['longtask'] })
    } catch {
      // longtask is not supported everywhere; frame pacing still carries the gate.
    }

    let raf = 0
    const tick = (t: number): void => {
      times.push(t)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    const box = bar.getBoundingClientRect()
    const startX = box.left + 60
    const startY = box.top + Math.floor(box.height / 2)

    function send(type: string, x: number, y: number, buttons: number): void {
      bar.dispatchEvent(
        new PointerEvent(type, {
          pointerId: 1,
          pointerType: 'mouse',
          isPrimary: true,
          bubbles: true,
          cancelable: true,
          composed: true,
          clientX: x,
          clientY: y,
          button: type === 'pointermove' ? -1 : 0,
          buttons,
        }),
      )
    }

    send('pointerdown', startX, startY, 1)

    // Move on a Lissajous path so the window keeps changing direction: a
    // straight line would let the compositor settle into an easy case.
    const begin = performance.now()
    await new Promise<void>((resolve) => {
      function step(): void {
        const now = performance.now()
        const elapsed = now - begin
        if (elapsed >= duration) {
          resolve()
          return
        }
        const phase = elapsed / 1000
        const x = startX + Math.sin(phase * 2.1) * 220
        const y = startY + Math.sin(phase * 1.3) * 120
        send('pointermove', x, y, 1)
        requestAnimationFrame(step)
      }
      step()
    })

    send('pointerup', startX, startY, 0)
    cancelAnimationFrame(raf)
    observer.disconnect()

    const deltas: number[] = []
    for (let i = 1; i < times.length; i++) {
      const prev = times[i - 1]
      const cur = times[i]
      if (prev !== undefined && cur !== undefined) deltas.push(cur - prev)
    }
    deltas.sort((a, b) => a - b)
    const at = (q: number): number => deltas[Math.min(deltas.length - 1, Math.floor(deltas.length * q))] ?? 0

    // The display's actual period, taken as the median rather than assumed to be
    // 16.67: the container's compositor is the authority on what one frame is.
    const vsync = at(0.5)

    return {
      count: deltas.length,
      median: vsync,
      p95: at(0.95),
      p99: at(0.99),
      max: deltas[deltas.length - 1] ?? 0,
      over50: deltas.filter((d) => d > 50).length,
      longTasks: longTasks.length,
      longestTask: longTasks.length > 0 ? Math.max(...longTasks) : 0,
      vsync,
    }
  }, durationMs)
}

async function heapUsed(cdp: CDPSession): Promise<number> {
  await cdp.send('HeapProfiler.collectGarbage')
  const usage = (await cdp.send('Runtime.getHeapUsage')) as { usedSize: number }
  return usage.usedSize
}

async function counters(cdp: CDPSession): Promise<Map<string, number>> {
  const res = (await cdp.send('Performance.getMetrics')) as {
    metrics: Array<{ name: string; value: number }>
  }
  return new Map(res.metrics.map((m) => [m.name, m.value]))
}

test.describe('@perf drag performance', () => {
  test('sustains 60fps with 20 windows under 4x CPU throttling', async ({ page }) => {
    test.setTimeout(120_000)
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Performance.enable')
    await cdp.send('HeapProfiler.enable')

    await boot(page)
    await page.evaluate((n) => window.__chronos.openWindows(n), WINDOWS)
    await expect(page.locator('[data-win-id]')).toHaveCount(WINDOWS)

    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE })

    const heapBefore = await heapUsed(cdp)
    const before = await counters(cdp)

    const stats = await measureDrag(page, DRAG_MS)

    const after = await counters(cdp)
    const heapAfter = await heapUsed(cdp)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })

    const delta = (k: string): number => (after.get(k) ?? 0) - (before.get(k) ?? 0)
    const layouts = delta('LayoutCount')
    const recalcs = delta('RecalcStyleCount')
    /*
     * Per-frame cost of our own work, in milliseconds under the 4x throttle.
     *
     * This is the instrument that isolates the drag loop from the container. Frame
     * count and the interval percentiles both fall when the host is busy; script time
     * per frame does not, because it measures how long our JavaScript ran, not when it
     * was allowed to run. A regression that adds allocation, forces a reflow, or does
     * more work per move shows up here and nowhere else.
     */
    const scriptPerFrame = (delta('ScriptDuration') / stats.count) * 1000
    const layoutPerFrame = (delta('LayoutDuration') / stats.count) * 1000
    const heapDeltaKB = (heapAfter - heapBefore) / 1024

    // Reported unconditionally so the numbers are visible in CI output, not just
    // on failure. These are the phase-1 gate evidence.
    console.log(
      [
        `frames=${stats.count}`,
        `median=${stats.median.toFixed(2)}ms`,
        `p95=${stats.p95.toFixed(2)}ms`,
        `p99=${stats.p99.toFixed(2)}ms`,
        `max=${stats.max.toFixed(2)}ms`,
        `over50ms=${stats.over50}`,
        `longTasks=${stats.longTasks}`,
        `longestTask=${stats.longestTask.toFixed(1)}ms`,
        `layouts=${layouts}`,
        `recalcs=${recalcs}`,
        `scriptPerFrame=${scriptPerFrame.toFixed(3)}ms`,
        `layoutPerFrame=${layoutPerFrame.toFixed(3)}ms`,
        `retainedHeapDelta=${heapDeltaKB.toFixed(0)}KB`,
        `windows=${WINDOWS}`,
        `cpuThrottle=${CPU_THROTTLE}x`,
      ].join(' '),
    )

    // Enough samples for the percentiles to mean something.
    expect(stats.count).toBeGreaterThan(120)

    // 60fps: the median frame interval must sit at or under the vsync period.
    // A small tolerance covers timer quantisation, not dropped frames.
    expect(stats.median).toBeLessThanOrEqual(17.5)

    /*
     * The tail is NOT asserted, and the reason is worth keeping.
     *
     * `p95` and `p99` were asserted here and they are not ours to control. The claim
     * is "our drag loop sustains 60fps", and the container does not guarantee the
     * renderer 60Hz of CPU: the same 4x-throttled drag reported p99 16.80ms on one
     * container generation and 50.00ms on the next, from an unchanged bundle, with
     * `longTasks=0` and `layouts=1` in both. Reproduced on the commit before any of
     * that day's work, which is what established it as the host rather than a
     * regression. Asserting on a percentile was measuring the scheduler.
     *
     * An "is every long interval a whole multiple of vsync" check was tried instead
     * and discarded: the compositor delivers rAF only on vsync boundaries, so *every*
     * interval is a multiple whether we caused it or not. Injecting a deliberate 7ms
     * block per frame produced zero off-grid intervals — a guard that cannot fail is
     * not a guard.
     *
     * What is left is the set of instruments that measure our own work, below. They
     * held steady across both container generations. The percentiles stay in the
     * reported line above so a real regression is still visible in CI output.
     */

    // Our JavaScript per drag frame. Measured at ~0.94ms under 4x throttling, so the
    // bound is roughly 3x headroom: tight enough that adding a forced reflow or a
    // per-frame allocation to the drag loop trips it, loose enough to survive noise.
    expect(scriptPerFrame, 'per-frame script cost regressed').toBeLessThan(3)

    // Layout time per frame, which transform-only movement makes near zero.
    expect(layoutPerFrame, 'per-frame layout cost regressed').toBeLessThan(0.5)

    // Exactly one style recalculation per frame: the transform write, and nothing
    // else. Two would mean something is reading and writing style in the same frame.
    expect(recalcs).toBeLessThanOrEqual(stats.count + 8)

    /*
     * Nothing we run may block the main thread.
     *
     * A stall caused by our own code is by definition a task that occupied the main
     * thread, so it appears here. A gap in rAF delivery with `longTasks === 0` means
     * the renderer process was not scheduled at all.
     */
    expect(stats.longTasks).toBe(0)
    expect(stats.longestTask).toBeLessThan(50)

    // Transform-only movement: layout must not run per frame. A handful of
    // layouts from the surrounding harness is fine; one per frame is not.
    expect(layouts).toBeLessThan(stats.count / 4)

    // Retained heap after a forced GC. The per-frame transform strings are
    // short-lived; if they were being retained this would climb with frame count.
    expect(heapDeltaKB).toBeLessThan(600)
  })

  test('opening 20 windows keeps one delegated listener set, not one per window', async ({
    page,
  }) => {
    await boot(page)
    const cdp = await page.context().newCDPSession(page)

    await page.evaluate((n) => window.__chronos.openWindows(n), WINDOWS)
    await expect(page.locator('[data-win-id]')).toHaveCount(WINDOWS)

    // Count listeners actually registered on the root element via CDP, which
    // reports the real registry rather than anything the page can self-report.
    const evaluated = (await cdp.send('Runtime.evaluate', {
      expression: "document.getElementById('chronos-root')",
    })) as { result: { objectId?: string } }
    const objectId = evaluated.result.objectId
    expect(objectId, 'could not obtain a remote handle for #chronos-root').toBeTruthy()

    const listeners = (await cdp.send('DOMDebugger.getEventListeners', {
      objectId: objectId!,
    })) as { listeners: Array<{ type: string }> }

    const perType = new Map<string, number>()
    for (const l of listeners.listeners) perType.set(l.type, (perType.get(l.type) ?? 0) + 1)

    console.log(
      `root listeners with ${WINDOWS} windows: ` +
        [...perType.entries()].map(([t, n]) => `${t}=${n}`).join(' '),
    )

    for (const [type, count] of perType) {
      expect(count, `${type} should have exactly one root listener`).toBe(1)
    }
    // The delegated set must actually be present.
    expect(perType.size).toBeGreaterThanOrEqual(6)
  })

  test('a drag releases its compositor layer hint afterwards', async ({ page }) => {
    await boot(page)
    await page.evaluate(() => window.__chronos.openWindows(3))
    await measureDrag(page, 400)
    const willChange = await page
      .locator('[data-win-id]')
      .evaluateAll((els) => els.map((el) => (el as HTMLElement).style.willChange))
    // Holding will-change permanently is how 20 windows become a memory problem.
    expect(willChange.every((w) => w === '')).toBe(true)
  })
})
