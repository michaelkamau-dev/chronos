/**
 * Accessibility and keyboard-completeness gate.
 *
 * The brief requires full keyboard operation — "every mouse action has a
 * keyboard equivalent". That is easy to claim and easy to quietly break, so this
 * file asserts it structurally: every command with a live handler must be
 * reachable either from a chord in the active skin's keymap or from a menu entry
 * that keyboard navigation can walk to.
 *
 * Selectors here use the window manager's own contract vocabulary —
 * `[data-win-id]`, `[data-action]`, `[data-part]`, `[data-resize]` — rather than
 * any skin's class names. These tests assert the contract, so they must pass
 * against whichever era is active; keying them to one skin's classes made them
 * hang the moment Windows XP became the default.
 *
 * It also covers the accessibility obligations that are media queries rather
 * than preferences, per CLAUDE.md.
 */

import { test, expect, type Page } from '@playwright/test'

async function boot(page: Page): Promise<void> {
  await page.goto('/')
  await page.waitForFunction(() => window.__chronos !== undefined)
  await page.evaluate(() => window.__chronos.reset())
  await page.evaluate(() => window.__chronos.openWindows(2))
}

test.describe('keyboard completeness', () => {
  test('every registered command is reachable from the keyboard', async ({ page }) => {
    await boot(page)

    const report = await page.evaluate(() => {
      const shell = window.__chronos.shell
      const registered = shell.commands.registered()

      // Commands bound to a chord in the active skin's keymap.
      const chordBound = new Set<string>()
      for (const b of shell.skinKeymap) chordBound.add(b.command)

      // Commands reachable from a menu. Menus themselves are keyboard-reachable
      // via Alt+Space and Shift+F10, both covered in wm.spec.ts, and menu
      // navigation is arrow-key driven — so a tagged menu entry is a keyboard path.
      const menuBound = new Set<string>()
      const collect = (spec: ReturnType<typeof shell.menuSpecFor>): void => {
        if (!spec) return
        for (const entry of spec) {
          if (entry.kind === 'submenu') collect(entry.items)
          else if (entry.kind === 'item' && entry.command) menuBound.add(entry.command)
        }
      }
      const d = shell.dispatcher
      const bar = document.querySelector<HTMLElement>('[data-win-id] [data-part="titlebar"]')
      if (bar) collect(shell.menuSpecFor(d.resolve(bar)))
      const desktop = document.querySelector<HTMLElement>('.desktop')
      if (desktop) collect(shell.menuSpecFor(d.resolve(desktop)))

      const unreachable = registered.filter((c) => !chordBound.has(c) && !menuBound.has(c))
      return { registered, chords: [...chordBound], menus: [...menuBound], unreachable }
    })

    console.log(
      `commands: ${report.registered.length} registered, ` +
        `${report.chords.length} chord-bound, ${report.menus.length} menu-bound`,
    )
    expect(report.unreachable, 'commands with no keyboard path').toEqual([])
  })

  test('the active keymap contains no unreachable chords', async ({ page }) => {
    await boot(page)
    const unknown = await page.evaluate(() => window.__chronos.keymapUnknownKeys())
    expect(unknown, 'chords whose key can never match a KeyboardEvent').toEqual([])
  })
})

test.describe('focus and naming', () => {
  test('every chrome button has an accessible name', async ({ page }) => {
    await boot(page)
    const unnamed = await page.locator('[data-action]').evaluateAll((els) =>
      els
        .filter((el) => {
          const label = el.getAttribute('aria-label') ?? ''
          return label.trim().length === 0
        })
        .map((el) => el.className),
    )
    expect(unnamed).toEqual([])
  })

  test('Tab reaches every chrome button of the focused window', async ({ page }) => {
    await boot(page)
    const expected = await page.locator('[data-win-id]').last().locator('[data-action]:not([disabled])').count()
    expect(expected).toBeGreaterThan(0)

    const reached = new Set<string>()
    for (let i = 0; i < expected * 3; i++) {
      await page.keyboard.press('Tab')
      const info = await page.evaluate(() => {
        const active = document.activeElement as HTMLElement | null
        if (!active) return null
        const frames = [...document.querySelectorAll('[data-win-id]')]
        return {
          // Identified by the contract attribute, not a skin class: every era
          // names its chrome buttons differently but all of them carry data-action.
          action: active.dataset['action'] ?? null,
          frame: frames.findIndex((f) => f.contains(active)),
        }
      })
      if (info?.action) reached.add(info.action)
      // Focus must never escape the focused window.
      if (info) expect(info.frame).toBe(1)
    }
    expect(reached.size).toBe(expected)
  })

  test('focused controls have a visible indicator', async ({ page }) => {
    await boot(page)
    await page.keyboard.press('Tab')
    const outline = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null
      if (!active) return null
      const cs = getComputedStyle(active)
      return { width: cs.outlineWidth, style: cs.outlineStyle, color: cs.outlineColor }
    })
    expect(outline).not.toBeNull()
    expect(outline!.style).not.toBe('none')
    expect(parseFloat(outline!.width)).toBeGreaterThan(0)
  })

  test('disabled chrome buttons are genuinely disabled, not just dimmed', async ({ page }) => {
    await boot(page)
    // A non-resizable window's maximize control must be a real disabled control.
    await page.evaluate(() => {
      window.__chronos.shell.wm.open({
        appId: 'harness-fixed' as never,
        title: 'Fixed size',
        resizable: false,
        rect: { x: 60, y: 300, w: 300, h: 160 },
      })
    })
    const maximize = page.locator('[data-win-id]').last().locator('[data-action="maximize"]')
    await expect(maximize).toBeDisabled()
    // A disabled control must also be out of the tab order.
    const focusable = await maximize.evaluate((el) => (el as HTMLButtonElement).disabled)
    expect(focusable).toBe(true)
  })
})

/**
 * Counts animations created while a minimize is in flight. Wall-clock timing is
 * not used: it measures first-layout work rather than the animation, which made
 * an earlier version of this test both flaky and meaningless.
 */
async function animationsDuringMinimize(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const wm = window.__chronos.shell.wm
    const id = wm.focusedId()!
    const el = document.querySelector<HTMLElement>(`[data-win-id="${id}"]`)!
    // Force the initial layout first so it cannot be mistaken for animation work.
    void el.getBoundingClientRect()
    const pending = wm.minimize(id)
    const during = el.getAnimations().length
    await pending
    return during
  })
}

/**
 * Sets the reduced-motion media feature over CDP and verifies it actually took
 * effect.
 *
 * Playwright's `reducedMotion` context option is silently a no-op against the
 * Chromium build in this environment — `matchMedia` still reports
 * `no-preference` — which made an earlier version of these tests pass while
 * exercising the unreduced path. Asserting the emulation landed is what stops
 * that from happening again.
 */
async function setReducedMotion(page: Page, value: 'reduce' | 'no-preference'): Promise<void> {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: value === 'reduce' ? 'reduce' : '' }],
  })
  const applied = await page.evaluate(
    () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  expect(applied, `prefers-reduced-motion emulation did not apply for "${value}"`).toBe(
    value === 'reduce',
  )
}

test.describe('reduced motion is a media query, not a preference', () => {
  test('minimize creates no animation under reduced motion, and does without it', async ({
    page,
  }) => {
    // Both directions in one test, against one page, so the pair can never
    // disagree about which media state was actually in force.
    await boot(page)
    await setReducedMotion(page, 'no-preference')
    expect(
      await animationsDuringMinimize(page),
      'the era minimize animation should run when motion is not reduced',
    ).toBeGreaterThan(0)

    await boot(page)
    await setReducedMotion(page, 'reduce')
    expect(await animationsDuringMinimize(page), 'no animation under reduced motion').toBe(0)
    await expect(page.locator('[data-win-id]').last()).toHaveCSS('display', 'none')
  })

  test('no element declares a non-zero transition or animation duration', async ({ page }) => {
    await boot(page)
    await setReducedMotion(page, 'reduce')
    const moving = await page.evaluate(() => {
      const out: string[] = []
      for (const el of document.querySelectorAll<HTMLElement>('#chronos-root *')) {
        const cs = getComputedStyle(el)
        const t = parseFloat(cs.transitionDuration) || 0
        const a = parseFloat(cs.animationDuration) || 0
        if (t > 0 || a > 0) {
          out.push(`${el.className}: t=${cs.transitionDuration} a=${cs.animationDuration}`)
        }
      }
      return out
    })
    expect(moving).toEqual([])
  })
})
