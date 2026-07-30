/**
 * Windows 3.1 fidelity.
 *
 * Every number asserted here is measured from the three VGA captures in
 * `docs/sources/`; `tools/captures/measure-win31.py` reproduces them. Where §7 of the
 * architecture doc and the captures disagreed, the captures won, and the tests are
 * written against the captures so a regression toward the recreation-derived value
 * fails rather than looking plausible.
 *
 * Four assertions exist specifically because Windows 3.1 is not Windows 95 with a
 * different palette, and every 95-lineage recreation gets them wrong: the inactive
 * caption is white, the menu bar is white, the active caption is flat, and disabled
 * text is a stipple rather than a grey fill.
 *
 * The stipple test is the one worth reading. It asserts the *mechanism*, not a colour:
 * ink on exactly one `(x + y)` parity is a checkerboard, ink on both is a solid glyph.
 * That is the same discriminator the measurement script applies to Microsoft's own
 * pixels, so the source and the implementation are being held to one test.
 *
 * `measureParity` now lives in `./stipple.ts`, because System 1's `notPatBic` is the
 * same construction and the two suites must not be able to drift apart on it.
 */

import { test, expect, type Page } from '@playwright/test'
import { measureParity } from './stipple.js'

async function boot(page: Page): Promise<void> {
  await page.goto('/?era=win31')
  await page.waitForFunction(() => window.__chronos !== undefined)
  await page.evaluate(() => window.__chronos.reset())
}

/** The active era must actually be the one under test, or every assertion is vacuous. */
test.beforeEach(async ({ page }) => {
  await boot(page)
  expect(await page.evaluate(() => window.__chronos.era)).toBe('win31')
})

test.describe('window frame', () => {
  test('the caption is 18px, measured three times in the capture', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(1))
    const h = await page
      .locator('[data-part="titlebar"]')
      .first()
      .evaluate((el) => Math.round(el.getBoundingClientRect().height / window.__chronos.shell.display.scale()))
    expect(h).toBe(18)
  })

  test('the sizing frame is 1px black, 2px face, 1px black', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(1))
    const shadow = await page
      .locator('[data-win-id]')
      .first()
      .evaluate((el) => getComputedStyle(el).boxShadow)
    // Twelve inset bands: three colour steps on each of four sides.
    expect(shadow.split('inset').length - 1).toBe(12)
    // The measured VGA DAC values, not the Windows colour constants.
    expect(shadow).toContain('rgb(0, 0, 0)')
    expect(shadow).toContain('rgb(192, 196, 200)')
    // #C0C0C0 would be the wrong, un-tinted assumption.
    expect(shadow).not.toContain('rgb(192, 192, 192)')
  })

  test('the frame is square — rounded corners arrive with XP', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(1))
    const s = await page
      .locator('[data-win-id]')
      .first()
      .evaluate((el) => {
        const cs = getComputedStyle(el)
        return { radius: cs.borderTopLeftRadius, clip: cs.clipPath }
      })
    expect(s.radius).toBe('0px')
    expect(s.clip).toBe('none')
  })
})

test.describe('3.1 is not Windows 95 with a different palette', () => {
  test('the active caption is flat — no gradient', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(1))
    const bar = await page
      .locator('[data-win-id][data-state="focused"] [data-part="titlebar"]')
      .evaluate((el) => {
        const cs = getComputedStyle(el)
        return { image: cs.backgroundImage, colour: cs.backgroundColor }
      })
    // COLOR_GRADIENTACTIVECAPTION is a Windows 95 addition; there is nothing to
    // gradient here, so a background-image would be an invention.
    expect(bar.image).toBe('none')
    expect(bar.colour).toBe('rgb(0, 0, 168)')
    // #000080 is the familiar constant and the wrong value: VGA DACs are 6-bit.
    expect(bar.colour).not.toBe('rgb(0, 0, 128)')
  })

  test('the inactive caption is white with black text, not grey', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(2))
    const bars = await page.locator('[data-win-id]').evaluateAll((frames) =>
      frames.map((f) => {
        const bar = f.querySelector('[data-part="titlebar"]')!
        const title = f.querySelector('[data-part="title"]')!
        return {
          state: (f as HTMLElement).dataset['state'],
          bg: getComputedStyle(bar).backgroundColor,
          fg: getComputedStyle(title).color,
        }
      }),
    )
    const inactive = bars.find((b) => b.state === 'blurred')
    const active = bars.find((b) => b.state === 'focused')
    expect(inactive?.bg).toBe('rgb(252, 252, 252)')
    expect(inactive?.fg).toBe('rgb(0, 0, 0)')
    expect(active?.bg).toBe('rgb(0, 0, 168)')
    expect(active?.fg).toBe('rgb(252, 252, 252)')
  })
})

test.describe('there is no close box', () => {
  test('the caption emits a system menu and no close action', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(1))
    const frame = page.locator('[data-win-id]').first()
    // 3.1 closed a window through the system menu, so no close control exists.
    expect(await frame.locator('[data-action="close"]').count()).toBe(0)
    await expect(frame.locator('[data-action="menu"]')).toBeVisible()
    await expect(frame.locator('[data-action="minimize"]')).toBeVisible()
    await expect(frame.locator('[data-action="maximize"]')).toBeVisible()
  })

  test('Close is still reachable, from the menu and from the keyboard', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(2))
    await expect(page.locator('[data-win-id]')).toHaveCount(2)

    // The mouse path: the system menu's Close item.
    await page.locator('[data-win-id]').last().locator('[data-part="titlebar"]')
      .click({ button: 'right' })
    await page.locator('[data-menu] [data-menu-item]', { hasText: 'Close' }).click()
    await expect(page.locator('[data-win-id]')).toHaveCount(1)

    // The keyboard path: Ctrl+F4 closed a document window in 3.1. Alt+F4 exited
    // Windows itself, and is bound to the same command because Chronos cannot exit.
    await page.keyboard.press('Control+F4')
    await expect(page.locator('[data-win-id]')).toHaveCount(0)
  })

  test('the maximize box swaps to a restore glyph when maximized', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(1))
    const box = page.locator('[data-action="maximize"]').first()
    await expect(box).toHaveAttribute('data-glyph', 'maximize')
    await page.keyboard.press('Alt+F10')
    await expect(box).toHaveAttribute('data-glyph', 'restore')
    await expect(box).toHaveAttribute('aria-label', 'Restore')
  })
})

test.describe('disabled text is a 50% checkerboard, not a grey fill', () => {
  /*
   * The mechanism, asserted the same way the measurement script asserts it against
   * Microsoft's pixels: ink on one `(x + y)` parity is a stipple, ink on both is
   * solid. A grey fill would show ink on both parities and would pass no version of
   * this test, which is the point — the Windows 95 treatment cannot sneak in.
   */
  test('a disabled menu item renders as a real checkerboard', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(1))
    // A maximized window's system menu disables Maximize and enables Restore; an
    // un-maximized one is the other way round. Either gives a disabled item.
    await page.locator('[data-part="titlebar"]').first().click({ button: 'right' })
    const disabled = page.locator('[data-menu] [data-menu-item][aria-disabled="true"]').first()
    await expect(disabled).toBeVisible()

    const applied = await disabled.evaluate((el) => {
      // GrayString painted a checkerboard of the *background* colour over the glyph,
      // so the implementation is an overlay layer rather than a colour change.
      const over = getComputedStyle(el, '::after')
      return {
        image: over.backgroundImage,
        size: over.backgroundSize,
        // The glyph keeps its ink colour. A grey fill would change it, which is the
        // Windows 95 treatment this era must not have.
        colour: getComputedStyle(el).color,
      }
    })
    expect(applied.image).toContain('conic-gradient')
    // One logical VGA pixel per cell, so a 2px tile.
    expect(applied.size).toBe('2px 2px')
    expect(applied.colour).toBe('rgb(0, 0, 0)')

    const parity = await measureParity(page, disabled)
    expect(parity.ink).toBeGreaterThan(20)
    expect(parity.oneParityShare).toBeGreaterThan(0.95)
  })

  test('an enabled item beside it is solid, so the test can tell them apart', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(1))
    await page.locator('[data-part="titlebar"]').first().click({ button: 'right' })
    const enabled = page.locator('[data-menu] [data-menu-item][aria-disabled="false"]').first()
    await expect(enabled).toBeVisible()
    const parity = await measureParity(page, enabled)
    expect(parity.ink).toBeGreaterThan(20)
    // Solid glyph strokes occupy both parities. The capture's Cancel label splits
    // 71/69; anything near 50% is solid.
    expect(parity.oneParityShare).toBeLessThan(0.7)
  })
})

test.describe('controls', () => {
  test('a push button is 70x23 with a 2px three-colour bevel', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(1))
    const geom = await page.evaluate(() => {
      const host = document.querySelector('[data-win-id] [data-content]')!
      const b = document.createElement('button')
      b.className = 'w31-button'
      b.textContent = 'Cancel'
      host.appendChild(b)
      const r = b.getBoundingClientRect()
      const cs = getComputedStyle(b)
      const out = {
        w: Math.round(r.width / window.__chronos.shell.display.scale()),
        h: Math.round(r.height / window.__chronos.shell.display.scale()),
        shadow: cs.boxShadow,
        clip: cs.clipPath,
      }
      b.remove()
      return out
    })
    expect(geom.w).toBe(70)
    expect(geom.h).toBe(23)
    // Three colours, not four: COLOR_3DDKSHADOW and COLOR_3DLIGHT are Windows 95.
    expect(geom.shadow).toContain('rgb(252, 252, 252)')
    expect(geom.shadow).toContain('rgb(132, 136, 140)')
    expect(geom.shadow).toContain('rgb(0, 0, 0)')
    // The outline's corners are notched, so it cannot be a plain border.
    expect(geom.clip).toContain('polygon')
  })

  test('an edit field is a plain 1px black rectangle — no bevel', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(1))
    const s = await page.evaluate(() => {
      const host = document.querySelector('[data-win-id] [data-content]')!
      const i = document.createElement('input')
      i.className = 'w31-textbox'
      host.appendChild(i)
      const cs = getComputedStyle(i)
      const out = {
        border: `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`,
        bg: cs.backgroundColor,
        shadow: cs.boxShadow,
      }
      i.remove()
      return out
    })
    expect(s.border).toBe('1px solid rgb(0, 0, 0)')
    expect(s.bg).toBe('rgb(252, 252, 252)')
    // The sunken two-tone field is a Windows 95 feature. Any inset shadow here
    // would be that feature arriving four years early.
    expect(s.shadow).toBe('none')
  })

  test('a check box is 13x13', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(1))
    const size = await page.evaluate(() => {
      const host = document.querySelector('[data-win-id] [data-content]')!
      const c = document.createElement('input')
      c.type = 'checkbox'
      c.className = 'w31-check'
      host.appendChild(c)
      const r = c.getBoundingClientRect()
      const out = { w: Math.round(r.width / window.__chronos.shell.display.scale()), h: Math.round(r.height / window.__chronos.shell.display.scale()) }
      c.remove()
      return out
    })
    expect(size).toEqual({ w: 13, h: 13 })
  })

  test('every interactive element ships five distinct states', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(1))
    const snap = await page.evaluate(() => {
      const host = document.querySelector('[data-win-id] [data-content]')!
      const b = document.createElement('button')
      b.className = 'w31-button'
      b.textContent = 'OK'
      host.appendChild(b)
      // The disabled difference is an ::after knockout layer, so it has to be read
      // there — comparing only the element's own properties reports no change and
      // was how a genuinely invisible disabled state passed an earlier version.
      const read = (): string => {
        const cs = getComputedStyle(b)
        const over = getComputedStyle(b, '::after')
        return `${cs.backgroundColor}|${cs.boxShadow}|${cs.color}|${over.backgroundImage}`
      }
      const rest = read()
      b.disabled = true
      const disabled = read()
      b.disabled = false
      b.remove()
      return { rest, disabled }
    })
    expect(snap.disabled).not.toBe(snap.rest)

    // hover / active / focus need real input, since pseudo-classes cannot be forced.
    const btn = page.locator('[data-win-id] [data-content] .w31-button').first()
    await page.evaluate(() => {
      const host = document.querySelector('[data-win-id] [data-content]')!
      const b = document.createElement('button')
      b.className = 'w31-button'
      b.textContent = 'OK'
      host.appendChild(b)
    })
    const read = async (): Promise<string> =>
      btn.evaluate((el) => {
        const cs = getComputedStyle(el)
        return `${cs.backgroundColor}|${cs.boxShadow}`
      })
    const rest = await read()

    // Focus is checked before the pointer work, deliberately. Chromium only treats
    // programmatic focus as `:focus-visible` when the last interaction was a
    // keyboard one, so reading it after a mouse press reports no indicator and the
    // assertion fails for a reason that has nothing to do with the stylesheet.
    await btn.focus()
    const focus = await btn.evaluate((el) => getComputedStyle(el).outlineStyle)

    await btn.hover()
    const hover = await read()
    await page.mouse.down()
    const active = await read()
    await page.mouse.up()

    expect(hover).not.toBe(rest)
    // Pressed swaps the bevel: highlight and shadow trade sides.
    expect(active).not.toBe(hover)
    expect(active).not.toBe(rest)
    expect(focus).toBe('dotted')
  })
})

test.describe('menus', () => {
  test('items are 18px and separators are 7px with the rule as the 4th row', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(1))
    await page.locator('[data-part="titlebar"]').first().click({ button: 'right' })
    const m = await page.locator('[data-menu]').first().evaluate((menu) => {
      const scale = window.__chronos.shell.display.scale()
      const item = menu.querySelector('[data-menu-item]')!
      const sep = menu.querySelector('[data-menu-separator]')
      const cs = getComputedStyle(menu)
      return {
        item: Math.round(item.getBoundingClientRect().height / scale),
        sep: sep ? Math.round(sep.getBoundingClientRect().height / scale) : null,
        sepImage: sep ? getComputedStyle(sep).backgroundImage : '',
        border: getComputedStyle(menu).borderTopWidth,
        shadow: cs.boxShadow,
      }
    })
    expect(m.item).toBe(18)
    expect(m.sep).toBe(7)
    // 3px transparent, the 1px rule, 3px transparent.
    expect(m.sepImage).toContain('gradient')
    expect(m.border).toBe('1px')
    // A 1px grey drop shadow on the right and bottom only — not a blur, and not
    // black. Same asymmetric idea as System 1, in grey.
    expect(m.shadow).toContain('rgb(192, 196, 200)')
    expect(m.shadow).toContain('1px 1px 0px 0px')
  })

  test('the skin emits the menu contract, not just its own classes', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(1))
    await page.locator('[data-part="titlebar"]').first().click({ button: 'right' })
    const menu = page.locator('[data-menu]').first()
    await expect(menu.locator('[data-menu-item]').first()).toBeVisible()
    expect(await menu.locator('[data-menu-separator]').count()).toBeGreaterThan(0)
    expect(await menu.locator('[data-menu-submenu]').count()).toBeGreaterThan(0)
  })
})

test.describe('typography', () => {
  test('one face at one size for the whole era', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(1))
    const faces = await page.evaluate(() => {
      const pick = (sel: string): { family: string; size: string; weight: string } => {
        const el = document.querySelector(sel)!
        const cs = getComputedStyle(el)
        return { family: cs.fontFamily, size: cs.fontSize, weight: cs.fontWeight }
      }
      return {
        title: pick('[data-part="title"]'),
        content: pick('[data-win-id] [data-content]'),
      }
    })
    // Windows 3.1 used SYSTEM.FON for captions, menus, dialog labels and button
    // labels alike. Unlike XP, which needs four faces, one is correct here.
    expect(faces.title.family).toContain('W31 System')
    expect(faces.content.family).toContain('W31 System')
    expect(faces.title.family).toBe(faces.content.family)
    // 16px exactly: Pixel Operator Bold is a 16px cell, so this is the only size
    // that yields a 9px cap height with no fraction and no antialiasing.
    expect(faces.title.size).toBe('16px')
    expect(faces.title.weight).toBe('700')
  })

  test('the substitute font actually loads', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(1))
    const loaded = await page.evaluate(async () => {
      await document.fonts.ready
      return [...document.fonts].map((f) => `${f.family} ${f.weight} ${f.status}`)
    })
    expect(loaded.some((f) => f.startsWith('W31 System') && f.endsWith('loaded'))).toBe(true)
  })

  test('no stylesheet declares a pt font size', async ({ page }) => {
    const offenders = await page.evaluate(() => {
      const bad: string[] = []
      for (const sheet of [...document.styleSheets]) {
        let rules: CSSRuleList
        try {
          rules = sheet.cssRules
        } catch {
          continue
        }
        for (const rule of [...rules]) {
          const text = rule.cssText
          if (/font-size:\s*[\d.]+pt/.test(text)) bad.push(text.slice(0, 90))
        }
      }
      return bad
    })
    expect(offenders).toEqual([])
  })
})

test.describe('the era renders at an integer scale', () => {
  /*
   * Not a cosmetic preference. The disabled-text checkerboard is a
   * one-logical-pixel pattern, so a fractional scale would alias it into exactly
   * the grey fill it exists to disprove — and the pixel-outline font only stays
   * hard when its size is an integer multiple of its 16px design cell.
   */
  test('the display scale is a whole number and the viewport is 640x480', async ({ page }) => {
    const d = await page.evaluate(() => {
      const w = window.__chronos.shell.display
      const a = w.workArea()
      return { scale: window.__chronos.shell.display.scale(), w: a.w + 0, h: a.h + 0 }
    })
    expect(Number.isInteger(d.scale)).toBe(true)
    expect(d.scale).toBeGreaterThanOrEqual(1)
    // The work area is the logical desktop less any reserved edges, so it is
    // 640 wide and shorter than 480 by the status strip.
    expect(d.w).toBe(640)
    expect(d.h).toBeLessThanOrEqual(480)
  })
})
