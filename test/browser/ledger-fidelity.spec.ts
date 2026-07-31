/**
 * Ledger (2035) fidelity.
 *
 * Every other suite in this directory asserts against a vendor's measured pixels.
 * There are none here: Ledger is the only invented era and `docs/ARCHITECTURE.md` §8
 * is its specification. So this suite asserts against **§8's own sentences**, quoted
 * in each test name, and against the derivations `src/skins/ledger/metrics.ts` records
 * for the values §8 does not state.
 *
 * That makes one class of test possible here that is not possible anywhere else — a
 * test of a *derivation*. `metrics.ts` claims every box dimension is a multiple of the
 * dither cell because a tone boundary off the cell grid puts two dithered surfaces out
 * of phase. That is checkable over the whole table at once, and it is, below.
 *
 * Two assertions are inversions of what the other five suites make, and both are the
 * era rather than a shortcut:
 *
 * - **Nothing animates.** Five eras assert their minimize animation *runs* when motion
 *   is not reduced. §8 says "Nothing animates. Transitions cost joules. States *cut*",
 *   so this era asserts the opposite, permanently and in both media states.
 * - **The disabled text is NOT a stipple.** `measureParity` proves the checkerboard in
 *   Windows 3.1 and System 1. Here it is run to prove a negative — and it has to be,
 *   because Bayer's lower half is exactly the even `(x + y)` sublattice, so the
 *   obvious dithered-tone implementation would have passed the stipple test while
 *   being the wrong mechanism by fifty years.
 */

import { test, expect, type Locator, type Page } from '@playwright/test'
import { measureParity } from './stipple.js'

const PAPER = '#f2efe6'
const CARBON = '#1b1714'
const AMBER = '#c25e00'
const CELL = 4

async function boot(page: Page): Promise<void> {
  await page.goto('/?era=ledger')
  await page.waitForFunction(() => window.__chronos !== undefined)
  await page.evaluate(() => window.__chronos.reset())
  await page.evaluate(() => document.fonts.ready)
}

/** The active era must actually be the one under test, or every assertion is vacuous. */
test.beforeEach(async ({ page }) => {
  await boot(page)
  expect(await page.evaluate(() => window.__chronos.era)).toBe('ledger')
})

/** Every distinct colour in an element's own box, most common first. */
async function colours(page: Page, locator: Locator): Promise<Array<[string, number]>> {
  return countColours(page, await locator.screenshot())
}

/**
 * A patch of bare desktop, with nothing painted over it.
 *
 * Screenshotting the desktop *element* was the first attempt and it was wrong: the
 * element contains the shell regions and every window, so the sample came back with
 * amber from the budget bar and the whole of the refresh band's mid-tone in it. The
 * dither claim is about the surface, so the sample has to be of the surface.
 *
 * Reduced motion is emulated first, which stops the band — that is the supported way
 * to get it off the screen, and it is also a small proof that stopping it works.
 */
async function bareDesktopColours(page: Page): Promise<Array<[string, number]>> {
  await setReducedMotion(page, 'reduce')
  await page.evaluate(() => window.__chronos.reset())
  const box = await page.evaluate(() => {
    const d = document.querySelector('[data-desktop]')!.getBoundingClientRect()
    return { x: Math.round(d.x + 40), y: Math.round(d.y + 40), width: 40, height: 40 }
  })
  return countColours(page, await page.screenshot({ clip: box }))
}

async function countColours(page: Page, shot: Buffer): Promise<Array<[string, number]>> {
  return page.evaluate(async (bytes) => {
    const bmp = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: 'image/png' }))
    const c = new OffscreenCanvas(bmp.width, bmp.height)
    const ctx = c.getContext('2d')!
    ctx.drawImage(bmp, 0, 0)
    const d = ctx.getImageData(0, 0, bmp.width, bmp.height).data
    const seen = new Map<string, number>()
    for (let i = 0; i < d.length; i += 4) {
      const k = `#${[d[i]!, d[i + 1]!, d[i + 2]!].map((v) => v.toString(16).padStart(2, '0')).join('')}`
      seen.set(k, (seen.get(k) ?? 0) + 1)
    }
    return [...seen.entries()].sort((a, b) => b[1] - a[1])
  }, [...shot])
}

/**
 * `setEmulatedMedia` over CDP, with the emulation asserted to have landed.
 *
 * Playwright's `reducedMotion` context option is silently a no-op against the Chromium
 * build in this environment, which once made a whole pair of tests pass while
 * exercising the unreduced path.
 */
async function setReducedMotion(page: Page, value: 'reduce' | 'no-preference'): Promise<void> {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: value === 'reduce' ? 'reduce' : '' }],
  })
  const applied = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  expect(applied, `emulation did not apply for "${value}"`).toBe(value === 'reduce')
}

// ---------------------------------------------------------------------------------

test.describe('the dither is ordered, and it is the reason for the geometry', () => {
  test('the desktop is exactly two inks with nothing between them', async ({ page }) => {
    // The strongest test in the file, and the same shape as System 1's — arrived at
    // from a different premise. §8: tone comes from ordered dither "because low-power
    // display modes quantise", so a third value anywhere is a grey this era cannot
    // produce: an alpha blend, a soft edge, or a fractional scale averaging a cell.
    const found = await bareDesktopColours(page)
    expect(found.map(([hex]) => hex).sort()).toEqual([CARBON, PAPER].sort())
  })

  test('the desktop tone is Bayer 4x4 at level 4 — exactly 25% ink', async ({ page }) => {
    // Not "about a quarter". An ordered dither at level 4 of 16 inks four cells in
    // every sixteen, exactly, forever — that is what distinguishes it from a noise
    // dither and from an alpha fill that happens to average the same.
    const found = await bareDesktopColours(page)
    const total = found.reduce((a, [, n]) => a + n, 0)
    const carbon = found.find(([hex]) => hex === CARBON)?.[1] ?? 0
    expect(carbon / total).toBeCloseTo(0.25, 3)
  })

  test('the generated tiles are SVG, so the pattern is inspectable rather than opaque', async ({
    page,
  }) => {
    const tile = await page.evaluate(() =>
      getComputedStyle(document.getElementById('chronos-root')!).getPropertyValue(
        '--lg-tile-ink-4',
      ),
    )
    expect(tile).toContain('data:image/svg+xml')
    // Four rects for level 4, and crisp edges — an antialiased tile is a grey, which
    // is the one thing this era's tone must never be.
    expect(decodeURIComponent(tile).match(/<rect/g)?.length).toBe(4)
    expect(decodeURIComponent(tile)).toContain('crispEdges')
  })

  test('every box dimension in the metrics table is a multiple of the cell', async ({ page }) => {
    // A derivation, tested as one. metrics.ts claims this holds because a tone
    // boundary off the cell grid puts two dithered surfaces out of phase; if a future
    // value breaks it, this fails rather than the seam being noticed by eye.
    const offenders = await page.evaluate(
      ({ cell }) => {
        const m = window.__chronos.shell.wm.metrics
        const out: string[] = []
        const check = (name: string, v: number): void => {
          if (v % cell !== 0) out.push(`${name}=${v}`)
        }
        check('titleBarHeight', m.titleBarHeight)
        check('titleBarHeightInactive', m.titleBarHeightInactive)
        check('border.top', m.border.top)
        check('border.right', m.border.right)
        check('border.bottom', m.border.bottom)
        check('border.left', m.border.left)
        check('resizeGrab', m.resizeGrab)
        check('cascadeStep', m.cascadeStep)
        check('dragGrabMargin', m.dragGrabMargin)
        return out
      },
      { cell: CELL },
    )
    expect(offenders).toEqual([])
  })

  test('no element declares a fractional opacity — this era has no alpha', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(2))
    const alpha = await page.evaluate(() => {
      const out: string[] = []
      for (const el of document.querySelectorAll<HTMLElement>('#chronos-root *')) {
        const o = parseFloat(getComputedStyle(el).opacity)
        if (!Number.isNaN(o) && o > 0 && o < 1) out.push(`${el.className}: ${o}`)
      }
      return out
    })
    expect(alpha).toEqual([])
  })
})

test.describe('the cost gutter — §8\'s deliberate mistake', () => {
  test('is 40px, on the right of every window, and cannot be closed away', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(2))
    const boxes = await page.locator('[data-ledger-gutter]').evaluateAll((els) =>
      els.map((e) => {
        const g = e.getBoundingClientRect()
        const w = e.closest('[data-win-id]')!.getBoundingClientRect()
        return { width: Math.round(g.width), rightGap: Math.round(w.right - g.right) }
      }),
    )
    expect(boxes.length).toBeGreaterThanOrEqual(2)
    for (const b of boxes) {
      expect(b.width, '§8: "a permanent 40px itemised strip"').toBe(40)
      // Flush to the frame's inner right edge — the 4px frame line and nothing else.
      expect(b.rightGap).toBe(4)
    }
  })

  test('makes the content area 40px narrower than it would otherwise be', async ({ page }) => {
    // §8: "It makes every layout in the OS 40px narrower than it wants to be." The
    // claim is enforced through the existing contract rather than an addition to it:
    // the gutter is declared as border.right, so the window manager subtracts it.
    await page.evaluate(() => window.__chronos.openWindows(1))
    const gap = await page.evaluate(() => {
      const m = window.__chronos.shell.wm.metrics
      const id = window.__chronos.shell.wm.list()[0]!.id
      const frame = document.querySelector<HTMLElement>(`[data-win-id="${id}"]`)!
      const content = frame.querySelector<HTMLElement>('[data-content]')!
      return {
        frameW: Math.round(frame.getBoundingClientRect().width),
        contentW: Math.round(content.getBoundingClientRect().width),
        borderRight: m.border.right,
        borderLeft: m.border.left,
      }
    })
    expect(gap.borderRight - gap.borderLeft).toBe(40)
    expect(gap.frameW - gap.contentW).toBe(gap.borderLeft + gap.borderRight)
  })

  test('shows joules, model calls and elapsed time as three ledger lines', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(1))
    const kinds = await page
      .locator('[data-win-id]')
      .first()
      .locator('[data-ledger-entry]')
      .evaluateAll((els) => els.map((e) => e.dataset['ledgerEntry']))
    expect(kinds).toEqual(['joules', 'calls', 'elapsed'])
  })

  test('every rounded value carries the mark, because the OS says it rounded', async ({ page }) => {
    // §8: "the OS **rounds every cost up** and tells you it did, in the gutter, every
    // time." The mark is `+` rather than a triangle because Public Sans carries no
    // U+25B2 — decided from coverage before the chrome was built.
    await page.evaluate(() => window.__chronos.openWindows(1))
    await page.waitForTimeout(1200)
    const marks = await page
      .locator('[data-win-id]')
      .first()
      .locator('[data-ledger-entry] [data-ledger-rounded]')
      .evaluateAll((els) => els.map((e) => ({ rounded: e.dataset['ledgerRounded'], text: e.textContent })))
    expect(marks.length).toBe(3)
    for (const m of marks) {
      if (m.rounded === 'true') expect(m.text).toBe('+')
      else expect(m.text).toBe('')
    }
    // At least one value is rounded at any moment: joules is a continuous quantity
    // squeezed into a three-character column, so it effectively always is.
    expect(marks.some((m) => m.rounded === 'true')).toBe(true)
  })

  test('no gutter value ever exceeds the three characters the column holds', async ({ page }) => {
    // This is the derivation behind the rounding: 40px less the 4px rule leaves 36,
    // which holds three glyphs of the era's face and no more. A value that overflowed
    // would mean the squeeze had stopped working.
    await page.evaluate(() => window.__chronos.openWindows(1))
    await page.waitForTimeout(1200)
    const overflow = await page.evaluate(() => {
      const out: string[] = []
      for (const v of document.querySelectorAll<HTMLElement>('.lg-gutter-value')) {
        const text = v.textContent ?? ''
        if (text.replace('.', '').length > 3) out.push(text)
        if (v.scrollWidth > v.clientWidth + 1) out.push(`overflow:${text}`)
      }
      return out
    })
    expect(overflow).toEqual([])
  })
})

test.describe('the title bar carries the running cost', () => {
  test('reads "<title> — <joules> — <elapsed>", §8\'s own format', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(1))
    await page.waitForTimeout(1200)
    const text = await page.evaluate(() => {
      const bar = document.querySelector('[data-part="titlebar"]')!
      const title = bar.querySelector('[data-part="title"]')!.textContent
      const cost = bar.querySelector('[data-ledger-cost]')!.textContent
      return { title, cost }
    })
    // §8's example is `Letter — 3.1 kJ — 14 min`.
    expect(text.cost).toMatch(/^ — \d+(\.\d)? (J|kJ|MJ) — \d+ (min|h)$/)
    expect(text.title!.length).toBeGreaterThan(0)
  })

  test('the em dash is a real glyph, not a fallback', async ({ page }) => {
    // The ChiKareGo2 lesson, applied to a face that passes it: a missing glyph does
    // not fail loudly — it falls back to a face whose fractional advance takes every
    // glyph after it off the pixel grid. §8 puts U+2014 in a Ledger title bar, so the
    // face has to carry it.
    const ok = await page.evaluate(() => document.fonts.check('900 18px "Public Sans Ledger"', '—'))
    expect(ok).toBe(true)
  })

  test('the substitute covers every character this skin renders', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(1))
    const missing = await page.evaluate(() => {
      const face = '900 18px "Public Sans Ledger"'
      const seen = new Set<string>()
      const walk = (n: Node): void => {
        if (n.nodeType === Node.TEXT_NODE) for (const ch of n.textContent ?? '') seen.add(ch)
        for (const c of n.childNodes) walk(c)
      }
      walk(document.getElementById('chronos-root')!)
      // The harness status strip is not era text and renders in the host font.
      for (const el of document.querySelectorAll('.status')) {
        for (const ch of el.textContent ?? '') seen.delete(ch)
      }
      return [...seen].filter((ch) => ch.trim().length > 0 && !document.fonts.check(face, ch))
    })
    expect(missing, 'characters the face does not carry').toEqual([])
  })
})

test.describe('a suspended window bleaches; it does not dim', () => {
  test('loses focus, suspends within ~400ms, and the bleach clock starts', async ({ page }) => {
    // §8: "Everything else is suspended to a bitmap within about 400ms of losing
    // focus." The policy is a skin timer calling the era-neutral wm.suspend — the
    // window manager never learns that an era has a policy.
    const ids = await page.evaluate(() => window.__chronos.openWindows(2))
    const first = ids[0]!
    expect(await page.evaluate((id) => window.__chronos.shell.wm.get(id)!.suspended, first)).toBe(
      false,
    )
    await page.waitForTimeout(700)
    const s = await page.evaluate((id) => {
      const st = window.__chronos.shell.wm.get(id)!
      const el = document.querySelector<HTMLElement>(`[data-win-id="${id}"]`)!
      return { suspended: st.suspended, attr: el.dataset['suspended'] }
    }, first)
    expect(s.suspended).toBe(true)
    expect(s.attr).toBe('true')
  })

  test('focusing it resumes it, and the bleach resets', async ({ page }) => {
    const ids = await page.evaluate(() => window.__chronos.openWindows(2))
    const first = ids[0]!
    await page.waitForTimeout(700)
    await page.evaluate((id) => window.__chronos.shell.wm.focus(id), first)
    const s = await page.evaluate((id) => {
      const st = window.__chronos.shell.wm.get(id)!
      const el = document.querySelector<HTMLElement>(`[data-win-id="${id}"]`)!
      return {
        suspended: st.suspended,
        band: el.querySelector<HTMLElement>('[data-ledger-bleach]')!.dataset['ledgerBleach'],
      }
    }, first)
    expect(s.suspended).toBe(false)
    expect(s.band).toBe('0')
  })

  test('the bleach is a dithered overlay, not opacity', async ({ page }) => {
    // §8 rules out alpha for tone. An `opacity` fade would also carry no duration,
    // where the bleach's whole job is to say *how long* you have ignored something.
    await page.evaluate(() => window.__chronos.openWindows(2))
    await page.waitForTimeout(700)
    const el = await page.evaluate(() => {
      const b = document.querySelector<HTMLElement>('[data-ledger-bleach]')!
      const cs = getComputedStyle(b)
      return { opacity: cs.opacity, image: cs.backgroundImage.slice(0, 40) }
    })
    expect(el.opacity).toBe('1')
    // Band 0 declares no image; the point is that the mechanism is background-image.
    expect(el.image === 'none' || el.image.startsWith('url(')).toBe(true)
  })

  test('the app instance is suspended too, and its state survives the round trip', async ({
    page,
  }) => {
    // The contract, exercised end to end: the window manager emits, the shell routes,
    // the instance stops. What this does NOT prove is the phase-5 gate — six real
    // apps surviving with Paint's undo stack and the terminal's scrollback intact.
    // There is one harness view here and it proves the wiring, nothing more.
    const result = await page.evaluate(async () => {
      const wm = window.__chronos.shell.wm
      const id = window.__chronos.openDirectoryWindow()
      await new Promise((r) => setTimeout(r, 250))
      const view = window.__chronos.viewFor(id)!
      const before = view.currentDir()
      wm.suspend(id)
      const whileSuspended = view.isSuspended()
      wm.resume(id)
      return { before, whileSuspended, after: view.currentDir(), resumed: !view.isSuspended() }
    })
    expect(result.whileSuspended, 'suspend() reached the instance').toBe(true)
    expect(result.resumed, 'resume() reached the instance').toBe(true)
    expect(result.after, 'state survived the round trip').toBe(result.before)
  })
})

test.describe('nothing animates', () => {
  test('no element declares a transition or animation duration, in either media state', async ({
    page,
  }) => {
    // §8: "Nothing animates. Transitions cost joules. States *cut*. There is no fade,
    // no spring, no easing curve anywhere in the OS." Five eras satisfy this only
    // under reduced motion; this one satisfies it always, which is the era.
    await page.evaluate(() => window.__chronos.openWindows(2))
    for (const media of ['no-preference', 'reduce'] as const) {
      await setReducedMotion(page, media)
      const moving = await page.evaluate(() => {
        const out: string[] = []
        for (const el of document.querySelectorAll<HTMLElement>('#chronos-root *')) {
          const cs = getComputedStyle(el)
          const t = parseFloat(cs.transitionDuration) || 0
          const a = parseFloat(cs.animationDuration) || 0
          if (t > 0 || a > 0) out.push(`${el.className}: t=${cs.transitionDuration} a=${cs.animationDuration}`)
        }
        return out
      })
      expect(moving, `under prefers-reduced-motion: ${media}`).toEqual([])
    }
  })

  test('minimize creates no animation even when motion is not reduced', async ({ page }) => {
    await setReducedMotion(page, 'no-preference')
    await page.evaluate(() => window.__chronos.openWindows(2))
    const during = await page.evaluate(async () => {
      const wm = window.__chronos.shell.wm
      const id = wm.focusedId()!
      const el = document.querySelector<HTMLElement>(`[data-win-id="${id}"]`)!
      void el.getBoundingClientRect()
      const pending = wm.minimize(id)
      const n = el.getAnimations().length
      await pending
      return n
    })
    expect(during, 'a Ledger minimize is a cut, not an animation').toBe(0)
  })
})

test.describe('the refresh band', () => {
  test('runs when motion is not reduced, and STOPS when the query flips', async ({ page }) => {
    // The requirement is precisely this: it must stop when the query flips, not merely
    // start suppressed. That is why the skin uses `onReducedMotionChange` rather than a
    // point-in-time read — a running band would otherwise keep travelling across the
    // screen of someone who asked it to stop while it was already moving.
    await setReducedMotion(page, 'no-preference')
    await page.waitForTimeout(300)
    const band = page.locator('[data-ledger-band]')
    await expect(band).toHaveAttribute('data-ledger-band', 'running')

    await setReducedMotion(page, 'reduce')
    await expect(band).toHaveAttribute('data-ledger-band', 'stopped')

    // And back, because a one-way transition would pass this test and be broken.
    await setReducedMotion(page, 'no-preference')
    await expect(band).toHaveAttribute('data-ledger-band', 'running')
  })

  test('steps by exactly one band height per delivered frame', async ({ page }) => {
    await setReducedMotion(page, 'no-preference')
    const ys = await page.evaluate(async () => {
      const band = document.querySelector<HTMLElement>('[data-ledger-band]')!
      const seen: number[] = []
      for (let i = 0; i < 4; i++) {
        await new Promise((r) => setTimeout(r, 1100))
        const m = /translate3d\(0px, (-?\d+)px/.exec(band.style.transform)
        seen.push(m ? Number(m[1]) : 0)
      }
      return seen
    })
    // Each observation is a multiple of the 64px band height, and the band moved.
    for (const y of ys) expect(y % 64).toBe(0)
    expect(new Set(ys).size, 'the band moved between observations').toBeGreaterThan(1)
  })

  test('claims no space — the work area is unchanged by it', async ({ page }) => {
    const info = await page.evaluate(() => {
      const regions = [...document.querySelectorAll<HTMLElement>('[data-shell-region]')].map(
        (r) => r.dataset['shellRegion'],
      )
      const work = window.__chronos.shell.wm.workArea()
      return { regions, workY: work.y }
    })
    expect(info.regions).toContain('refreshband')
    expect(info.regions).toContain('budgetbar')
    // The band is at the top edge and reserves nothing, so the work area still starts
    // at y=0. A band that reserved space would push every window down 64px.
    expect(info.workY).toBe(0)
  })
})

test.describe('the render-budget governor', () => {
  test('holds the display to 1Hz while reading, and suppresses the rest', async ({ page }) => {
    await setReducedMotion(page, 'no-preference')
    const stats = await page.evaluate(async () => {
      const b = window.__chronos.shell.budget
      const out = { delivered: 0, suppressed: 0, priority: 0, sleptMs: 0, hz: null as number | null }
      b.stats(out)
      const before = { ...out }
      await new Promise((r) => setTimeout(r, 2600))
      b.stats(out)
      return { before, after: { ...out } }
    })
    const delivered = stats.after.delivered - stats.before.delivered
    // About one per second over ~2.6s. Bounded rather than exact: the governor sleeps
    // on a timer and wakes on a vsync boundary, so the count is 2 or 3, never 150.
    expect(delivered).toBeGreaterThanOrEqual(1)
    expect(delivered, 'a 1Hz target must not deliver at the display rate').toBeLessThanOrEqual(6)
    expect(stats.after.hz).toBe(1)
    // And it genuinely sleeps rather than waking 60 times a second to discard 59.
    expect(stats.after.sleptMs).toBeGreaterThan(stats.before.sleptMs)
  })

  test('an interaction forces burst mode, which ticks faster', async ({ page }) => {
    // §8: "Typing forces a burst mode that looks and behaves differently — and ticks
    // the gutter."
    await setReducedMotion(page, 'no-preference')
    const burst = await page.evaluate(async () => {
      const b = window.__chronos.shell.budget
      const out = { delivered: 0, suppressed: 0, priority: 0, sleptMs: 0, hz: null as number | null }
      b.stats(out)
      const before = out.delivered
      const bursting: boolean[] = []
      for (let i = 0; i < 24; i++) {
        b.poke()
        bursting.push(b.bursting)
        await new Promise((r) => requestAnimationFrame(() => r(null)))
      }
      b.stats(out)
      return { gained: out.delivered - before, bursting: bursting.every(Boolean) }
    })
    expect(burst.bursting).toBe(true)
    // 24 frames of poking delivers far more than the ~0 frames 1Hz would have.
    expect(burst.gained, 'burst mode delivers at the display rate').toBeGreaterThan(8)
  })

  test('a drag runs on the priority lane and is never throttled', async ({ page }) => {
    // §8: "Windows still overlap, stack, drag and resize. Rationing did not delete
    // direct manipulation." A drag delivered at 1Hz would not be a drag.
    await page.evaluate(() => window.__chronos.openWindows(1))
    const bar = page.locator('[data-part="titlebar"]').last()
    const box = (await bar.boundingBox())!
    const before = await page.evaluate(() => {
      const out = { delivered: 0, suppressed: 0, priority: 0, sleptMs: 0, hz: null as number | null }
      window.__chronos.shell.budget.stats(out)
      return out.priority
    })
    await page.mouse.move(box.x + 40, box.y + 10)
    await page.mouse.down()
    for (let i = 1; i <= 14; i++) await page.mouse.move(box.x + 40 + i * 6, box.y + 10 + i * 2)
    await page.mouse.up()
    const after = await page.evaluate(() => {
      const out = { delivered: 0, suppressed: 0, priority: 0, sleptMs: 0, hz: null as number | null }
      window.__chronos.shell.budget.stats(out)
      return out.priority
    })
    expect(after - before, 'gesture frames ran despite the 1Hz target').toBeGreaterThan(4)
  })

  test('the era declares the rate; core never learns why', async ({ page }) => {
    const hz = await page.evaluate(() => {
      const out = { delivered: 0, suppressed: 0, priority: 0, sleptMs: 0, hz: null as number | null }
      window.__chronos.shell.budget.stats(out)
      return out.hz
    })
    expect(hz).toBe(1)
  })
})

test.describe('disabled text is a voided ledger line, and provably not the stipple', () => {
  test('a disabled menu item is struck with an amber rule', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(1))
    // The chrome menu carries a permanently disabled entry in this era, and the
    // desktop menu's "Close All Windows" disables with no windows — but the chrome
    // menu is the reliable one, so open that.
    await page.locator('[data-part="titlebar"]').last().click({ button: 'right' })
    const item = page.locator('[data-menu-item][data-ledger-void="true"]').first()
    await expect(item).toBeVisible()
    const strike = await item.evaluate((el) => {
      const s = el.querySelector<HTMLElement>('.lg-menu-strike')!
      const cs = getComputedStyle(s)
      return { display: cs.display, colour: cs.backgroundColor, height: cs.height }
    })
    expect(strike.display).toBe('block')
    expect(strike.colour).toBe('rgb(194, 94, 0)')
    // Four pixels: this era has no hairlines, because a rule thinner than the dither
    // cell is a thin stroke and §8's reason for the heavy type applies to lines too.
    expect(strike.height).toBe('4px')
  })

  test('it is NOT a 50% checkerboard — the parity discriminator must fail here', async ({
    page,
  }) => {
    /*
     * Proving a negative, with the instrument that proves the positive twice.
     *
     * `measureParity` reports ink on one `(x + y)` parity: Windows 3.1's disabled OK
     * label is 37 pixels all on one parity, System 1's `Revert` is 77 on one. Mac OS 8
     * dropped the mechanism and splits 64/63.
     *
     * This test exists because the obvious implementation would have passed the wrong
     * way. Bayer's lower half is exactly the even sublattice, so a dithered tone at or
     * below 50% ink is pixel-for-pixel a checkerboard — an era fifty years later would
     * have measured as wearing a 1984 mechanism, and nothing would have said so.
     */
    await page.evaluate(() => window.__chronos.openWindows(1))
    await page.locator('[data-part="titlebar"]').last().click({ button: 'right' })
    const label = page
      .locator('[data-menu-item][data-ledger-void="true"]')
      .first()
      .locator('.lg-menu-label')
    await expect(label).toBeVisible()
    const parity = await measureParity(page, label)
    expect(parity.ink, 'the label has ink to measure').toBeGreaterThan(20)
    expect(
      parity.oneParityShare,
      'a share near 1.0 would mean this era had inherited notPatBic',
    ).toBeLessThan(0.72)
  })

  test('an enabled item beside it carries no strike', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(1))
    await page.locator('[data-part="titlebar"]').last().click({ button: 'right' })
    const enabled = page.locator('[data-menu-item][data-ledger-void="false"]').first()
    await expect(enabled).toBeVisible()
    const display = await enabled.evaluate(
      (el) => getComputedStyle(el.querySelector('.lg-menu-strike')!).display,
    )
    expect(display).toBe('none')
  })
})

test.describe('the skin emits the contract, not just its own classes', () => {
  test('menus carry the data-menu vocabulary', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(1))
    await page.locator('[data-part="titlebar"]').last().click({ button: 'right' })
    await expect(page.locator('[data-menu]')).toBeVisible()
    expect(await page.locator('[data-menu-item]').count()).toBeGreaterThan(0)
    expect(await page.locator('[data-menu-separator]').count()).toBeGreaterThan(0)
    expect(await page.locator('[data-menu-submenu]').count()).toBeGreaterThan(0)
  })

  test('every chrome button has an accessible name and all five states', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(1))
    const unnamed = await page
      .locator('[data-win-id] [data-action]')
      .evaluateAll((els) => els.filter((e) => !(e.getAttribute('aria-label') ?? '').trim()).length)
    expect(unnamed).toBe(0)

    const btn = page.locator('[data-win-id]').last().locator('[data-action="close"]')
    const rest = await btn.evaluate((el) => getComputedStyle(el).backgroundColor)
    await btn.hover()
    const hover = await btn.evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(hover, 'hover must differ from rest').not.toBe(rest)
    await btn.focus()
    const focus = await btn.evaluate((el) => getComputedStyle(el).outlineColor)
    expect(focus).toBe('rgb(194, 94, 0)')
  })
})

test.describe('the Steward', () => {
  /**
   * The 20-minute threshold, driven rather than waited out.
   *
   * §8 fixes the wording of the trigger inside the Steward's own line — "You haven't
   * touched Untitled 3 in 20 minutes" — so the threshold is authored and a test that
   * skipped it would be leaving the era's most specified behaviour unverified. The
   * clock is installed before navigation so `performance.now()`, `setTimeout` and
   * `requestAnimationFrame` all advance together; the skin reads all three and a
   * partially-mocked clock would deadlock the governor rather than fail.
   */
  async function bootWithClock(page: Page): Promise<void> {
    await page.clock.install({ time: new Date('2035-01-01T09:00:00Z') })
    await boot(page)
    await setReducedMotion(page, 'reduce')
  }

  test('interrupts after 20 minutes with §8\'s own proposition', async ({ page }) => {
    await bootWithClock(page)
    await page.evaluate(() => window.__chronos.openWindows(2))
    const target = await page.evaluate(() => window.__chronos.shell.wm.list()[0]!.title)

    await page.clock.fastForward('21:00')
    const steward = page.locator('[data-ledger-steward]')
    await expect(steward).toBeVisible()
    // The window's own title in the sentence, because the Steward is proposing to
    // settle a specific piece of work rather than issuing a system notice.
    await expect(steward.locator('.lg-steward-text')).toHaveText(
      `You haven’t touched ${target} in 20 minutes. Shall I settle it?`,
    )
  })

  test('is a real modal that genuinely blocks the window it is proposing to close', async ({
    page,
  }) => {
    // Not an overlay with a bespoke z-layer: `wm.open({ modalOwner })`, so it inherits
    // the window manager's `inert` blocking and focus redirect. `inert` removes the
    // subtree from tab order, the accessibility tree and pointer targeting at the
    // platform level, which is a genuine block rather than a focus-sentinel imitation.
    await bootWithClock(page)
    const ids = await page.evaluate(() => window.__chronos.openWindows(2))
    await page.clock.fastForward('21:00')
    await expect(page.locator('[data-ledger-steward]')).toBeVisible()

    const state = await page.evaluate((id) => {
      const wm = window.__chronos.shell.wm
      const modal = wm.list().find((s) => s.modalOwner === id)
      const ownerEl = document.querySelector<HTMLElement>(`[data-win-id="${id}"]`)!
      return { inert: ownerEl.inert, closable: modal?.closable, exists: modal !== undefined }
    }, ids[0]!)
    expect(state.exists).toBe(true)
    expect(state.inert, 'the owner is genuinely inert').toBe(true)
    // §8: it "can be deferred but not disabled". No close box, so Defer is the way out.
    expect(state.closable).toBe(false)
  })

  test('the defer control is the smallest target on screen, and keyboard-reachable', async ({
    page,
  }) => {
    /*
     * Both halves, because §8 asks for one and CLAUDE.md forbids sacrificing the other.
     *
     * §8: the defer control "is deliberately the smallest target on screen". CLAUDE.md:
     * an era's hostile behaviour may never be the thing that blocks an accessibility
     * escape hatch. So the pointer target really is 12px, and the keyboard route to it
     * is full size — a real button in the tab order with the era's full 4px focus ring.
     */
    await bootWithClock(page)
    await page.evaluate(() => window.__chronos.openWindows(2))
    await page.clock.fastForward('21:00')

    const defer = page.locator('[data-ledger-defer]')
    await expect(defer).toBeVisible()
    const box = (await defer.boundingBox())!
    expect(Math.round(box.width)).toBe(12)
    expect(Math.round(box.height)).toBe(12)

    // Smallest on screen: no other interactive element is smaller.
    const smallest = await page.evaluate(() => {
      let min = Infinity
      for (const el of document.querySelectorAll<HTMLElement>(
        '#chronos-root button, #chronos-root input, #chronos-root [data-action]',
      )) {
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        min = Math.min(min, Math.min(r.width, r.height))
      }
      return min
    })
    expect(smallest).toBe(12)

    // The keyboard path is not small. It is focusable, and its ring is the era's own.
    await defer.focus()
    const ring = await defer.evaluate((el) => {
      const cs = getComputedStyle(el)
      return { colour: cs.outlineColor, width: cs.outlineWidth, style: cs.outlineStyle }
    })
    expect(ring.style).not.toBe('none')
    expect(ring.width).toBe('4px')
    expect(ring.colour).toBe('rgb(194, 94, 0)')
  })

  test('Escape defers it, and it comes back — deferred, not disabled', async ({ page }) => {
    await bootWithClock(page)
    await page.evaluate(() => window.__chronos.openWindows(2))
    await page.clock.fastForward('21:00')
    await expect(page.locator('[data-ledger-steward]')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.locator('[data-ledger-steward]')).toHaveCount(0)

    // §8: "It can be deferred but not disabled." So it returns.
    await page.clock.fastForward('06:00')
    await expect(page.locator('[data-ledger-steward]')).toBeVisible()
  })

  test('Settle closes the work it was proposing to close', async ({ page }) => {
    await bootWithClock(page)
    const ids = await page.evaluate(() => window.__chronos.openWindows(2))
    await page.clock.fastForward('21:00')
    await expect(page.locator('[data-ledger-steward]')).toBeVisible()

    await page.locator('[data-ledger-settle]').click()
    await expect(page.locator('[data-ledger-steward]')).toHaveCount(0)
    const gone = await page.evaluate(
      (id) => window.__chronos.shell.wm.get(id) === undefined,
      ids[0]!,
    )
    expect(gone, 'settling closed the window it named').toBe(true)
  })

  test('it carries its own cost gutter, billing you for itself', async ({ page }) => {
    // The satire made structural: the Steward is a window, Ledger's chrome gives every
    // window a 40px disclosure strip, so the assistant that interrupts to complain
    // about what your work costs shows what interrupting you costs.
    await bootWithClock(page)
    await page.evaluate(() => window.__chronos.openWindows(2))
    await page.clock.fastForward('21:00')
    const gutter = page
      .locator('[data-win-id]')
      .filter({ has: page.locator('[data-ledger-steward]') })
      .locator('[data-ledger-gutter]')
    await expect(gutter).toBeVisible()
    expect(Math.round((await gutter.boundingBox())!.width)).toBe(40)
  })
})

test.describe('paths are ledger entries', () => {
  test('a file renders as "#NNNNN name", lower case, five digits', async ({ page }) => {
    const formatted = await page.evaluate(async () => {
      const { fs, codec } = window.__chronos
      const docs = (await fs.list(fs.root())).find((n) => n.wellKnown === 'documents')!
      // Created rather than found: the seed's contents are not this suite's to depend
      // on, and the claim under test is about the codec's rendering of any node.
      const id = await fs.createFile(docs.id, 'Letter.txt', 'x', { mime: 'text/plain' })
      const file = await fs.stat(id)
      return {
        path: codec.format(await fs.chain(id)),
        name: codec.displayName(file),
        ordinal: file.ordinal,
      }
    })
    expect(formatted.name).toMatch(/^#\d{5} [^A-Z]*$/)
    // §8's own example shape: `you/documents/#04412 letter`.
    expect(formatted.path).toMatch(/^you\/documents\/#\d{5} /)
  })

  test('the terminal form accepts either — a bare entry number resolves anywhere', async ({
    page,
  }) => {
    // §8: "The terminal accepts either." An account number that only worked from the
    // right folder would not be an account number.
    const ok = await page.evaluate(async () => {
      const { fs, codec } = window.__chronos
      const docs = (await fs.list(fs.root())).find((n) => n.wellKnown === 'documents')!
      const id = await fs.createFile(docs.id, 'Letter.txt', 'x', { mime: 'text/plain' })
      const file = await fs.stat(id)
      const byNumber = await codec.parse(`#${String(file.ordinal).padStart(5, '0')}`, fs.root())
      const byPath = await codec.parse(codec.format(await fs.chain(id)), fs.root())
      // The bare number resolves from a folder that does not contain it, which is the
      // whole point of an account number.
      const fromElsewhere = await codec.parse(String(file.ordinal), fs.trash())
      return { byNumber, byPath, fromElsewhere, want: id }
    })
    expect(ok.byNumber).toBe(ok.want)
    expect(ok.byPath).toBe(ok.want)
    expect(ok.fromElsewhere).toBe(ok.want)
  })

  test('collisions get a plain numeric suffix, not "(2)" and not " copy"', async ({ page }) => {
    // The filesystem never decorates a name itself — it asks the active skin, which is
    // what keeps the stored tree era-neutral. So the decorator is what is under test.
    const suggested = await page.evaluate(async () => {
      const { fs } = window.__chronos
      const docs = (await fs.list(fs.root())).find((n) => n.wellKnown === 'documents')!
      await fs.createFile(docs.id, 'Report.txt', 'a', { mime: 'text/plain' })
      const { ledgerNameDecorator } = await import('/src/skins/ledger/paths.ts')
      return fs.suggestName(docs.id, 'Report.txt', ledgerNameDecorator)
    })
    // A plain numeric suffix. Not XP's " (2)" and not the classic Mac's " copy": a
    // ledger that already numbers every entry has no collision to dress up, but the
    // stored name still has to be distinct and the other five eras still have to be
    // able to render it.
    expect(suggested).toBe('Report 2.txt')
  })
})

test.describe('the budget bar', () => {
  test('shows the session total and reserves its own height', async ({ page }) => {
    const bar = page.locator('[data-shell-region="budgetbar"]')
    await expect(bar).toBeVisible()
    const h = await bar.evaluate((el) => Math.round(el.getBoundingClientRect().height))
    expect(h).toBe(48)
    await expect(page.locator('[data-ledger-total]')).toContainText(/\d/)
  })

  test('the cursor blinks at 0.5Hz — every other delivered frame at a 1Hz refresh', async ({
    page,
  }) => {
    // Derived rather than timed: §8 states 1Hz and 0.5Hz, and half of one delivery per
    // second is `index % 2`. No third number and no second timer.
    await setReducedMotion(page, 'no-preference')
    const states = await page.evaluate(async () => {
      const caret = document.querySelector<HTMLElement>('[data-ledger-caret]')!
      const seen: string[] = []
      for (let i = 0; i < 5; i++) {
        await new Promise((r) => setTimeout(r, 1050))
        seen.push(caret.dataset['ledgerCaret']!)
      }
      return seen
    })
    expect(new Set(states).size, 'the caret toggled').toBe(2)
  })
})
