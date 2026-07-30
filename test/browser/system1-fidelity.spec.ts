/**
 * Macintosh System 1 fidelity.
 *
 * Every number asserted here is measured from the Macintosh HIG's own figures;
 * `tools/pdf-extract/extract-mac-figures.py` extracts them and
 * `tools/pdf-extract/measure-mac-system1.py` reproduces the measurements. Where a
 * common recreation and the figures disagree, the figures win and the test is written
 * against the figures, so a regression toward the plausible value fails rather than
 * looking right.
 *
 * Three assertions here exist because this era is not a later Mac with fewer colours,
 * and a Platinum- or Aqua-lineage recreation gets all three wrong:
 *
 * - **An inactive window loses its controls**, it does not dim them. No stripes, no
 *   close box, no size box.
 * - **There is no zoom box and no minimize**, and the window manager refuses both
 *   commands rather than the skin merely omitting two buttons.
 * - **Disabled text is a 50% checkerboard knocked out of the glyph**, asserted by the
 *   same parity discriminator `measure-mac-system1.py` runs on Apple's own bitmap and
 *   `measure-win31.py` runs on Microsoft's. The helper is shared with the Windows 3.1
 *   suite for exactly that reason.
 *
 * The strongest test in the file is the last one: the whole rendered desktop carries
 * **two tones and nothing between them**. Every "grey" in this era is a dither of
 * black and white, so a single antialiased edge anywhere — a soft glyph, a rounded
 * corner, a fractional scale — shows up as a third value and fails it.
 */

import { test, expect, type Locator, type Page } from '@playwright/test'
import { measureParity } from './stipple.js'

async function boot(page: Page): Promise<void> {
  await page.goto('/?era=system1')
  await page.waitForFunction(() => window.__chronos !== undefined)
  await page.evaluate(() => window.__chronos.reset())
  await page.evaluate(() => document.fonts.ready)
}

/** The active era must actually be the one under test, or every assertion is vacuous. */
test.beforeEach(async ({ page }) => {
  await boot(page)
  expect(await page.evaluate(() => window.__chronos.era)).toBe('system1')
})

/**
 * An element's own pixels, reduced to logical era pixels as a boolean ink grid.
 *
 * One device sample per logical pixel, taken at the centre of each block, which is the
 * same reduction `measureParity` performs — a 1-bit era is only assertable at the
 * logical grid, and sampling a block edge would report the neighbour.
 */
async function inkGrid(page: Page, locator: Locator): Promise<boolean[][]> {
  const shot = await locator.screenshot()
  const scale = await page.evaluate(() => window.__chronos.shell.display.scale())
  return page.evaluate(
    async ({ bytes, scale: s }) => {
      const blob = new Blob([new Uint8Array(bytes)], { type: 'image/png' })
      const bmp = await createImageBitmap(blob)
      const c = new OffscreenCanvas(bmp.width, bmp.height)
      const ctx = c.getContext('2d')!
      ctx.drawImage(bmp, 0, 0)
      const d = ctx.getImageData(0, 0, bmp.width, bmp.height).data
      const off = Math.floor(s / 2)
      const rows: boolean[][] = []
      for (let ly = 0; ly * s + off < bmp.height; ly++) {
        const row: boolean[] = []
        for (let lx = 0; lx * s + off < bmp.width; lx++) {
          const i = ((ly * s + off) * bmp.width + (lx * s + off)) * 4
          row.push(d[i]! < 128)
        }
        rows.push(row)
      }
      return rows
    },
    { bytes: [...shot], scale },
  )
}

/** Inclusive runs of ink in a row, as `[start, end]` pairs. */
function runs(row: readonly boolean[]): Array<[number, number]> {
  const out: Array<[number, number]> = []
  let start: number | null = null
  for (let i = 0; i < row.length; i++) {
    if (row[i] && start === null) start = i
    else if (!row[i] && start !== null) {
      out.push([start, i - 1])
      start = null
    }
  }
  if (start !== null) out.push([start, row.length - 1])
  return out
}

test.describe('the title bar reproduces Apple\'s figure row for row', () => {
  test('19px, six racing stripes on rows 4..14, close box 11px at frame+9', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(1))
    // The shell focuses the first control in a new window, and this era's focus
    // indicator is a real 2px ring over the stripes. Measure the rest state.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    const bar = page.locator('[data-part="titlebar"]').first()
    const grid = await inkGrid(page, bar)

    // 19px total: the frame's top line, three white rows, the 11-row stripe block,
    // three white rows, and the rule under the caption.
    expect(grid.length).toBe(19)

    const stripeRows = grid
      .map((row, i) => [i, row] as const)
      .filter(([i, row]) => i > 0 && i < 18 && row.slice(22, 40).every(Boolean))
      .map(([i]) => i)
    expect(stripeRows, 'six stripes, 1px on / 1px off, on rows 4..14')
      .toEqual([4, 6, 8, 10, 12, 14])

    // Row 4 is the whole title bar's structure in one line. Apple's figure reads
    // frame line, 6px of stripe, the close box, then stripes to the title clearance:
    //   #.######.###########.####…
    const row4 = runs(grid[4]!)
    expect(row4[0], 'the frame line').toEqual([0, 0])
    expect(row4[1], 'stripe from frame+2').toEqual([2, 7])
    expect(row4[2], 'an 11px close box at frame+9, 1px of white either side')
      .toEqual([9, 19])
    expect(row4[3]![0], 'stripes resume at frame+21').toBe(21)

    // Rows 1..3 and 15..17 are clear, and row 18 is the rule.
    for (const i of [1, 2, 3, 15, 16, 17]) {
      expect(grid[i]!.slice(22, 40).some(Boolean), `row ${i} is clear`).toBe(false)
    }
    expect(grid[18]!.slice(22, 40).every(Boolean), 'row 18 is the caption rule').toBe(true)
  })

  test('the frame is 1px left/top and 2px right/bottom, the second px a shadow', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(1))
    const s = await page.locator('[data-win-id] .s1-frame').first().evaluate((el) => {
      const cs = getComputedStyle(el)
      const win = el.parentElement as HTMLElement
      return {
        shadow: cs.boxShadow,
        radius: cs.borderTopLeftRadius,
        frame: el.getBoundingClientRect().width,
        outer: win.getBoundingClientRect().width,
        scale: window.__chronos.shell.display.scale(),
      }
    })
    // Four 1px inset lines plus one outset shadow offset (+1, +1). The outset is what
    // notches the top-right and bottom-left corners by a pixel; drawing the second
    // pixel as border instead would square them off.
    expect(s.shadow.split('inset').length - 1).toBe(4)
    expect(s.shadow).toContain('rgb(0, 0, 0) 1px 1px 0px 0px')
    expect(s.radius).toBe('0px')
    // The frame element is 1px smaller than the window box on each axis, so the
    // shadow lands inside it and `border` in metrics.ts stays honest.
    expect((s.outer - s.frame) / s.scale).toBeCloseTo(1, 0)
  })
})

test.describe('an inactive window loses its controls rather than dimming', () => {
  test('no stripes, no close box, no size box when blurred', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(2))
    const state = await page.locator('[data-win-id]').evaluateAll((frames) =>
      frames.map((f) => {
        const bar = f.querySelector<HTMLElement>('[data-part="titlebar"]')!
        const close = f.querySelector<HTMLElement>('[data-action="close"]')!
        const grow = f.querySelector<HTMLElement>('.s1-grow')!
        return {
          state: (f as HTMLElement).dataset['state'],
          stripes: getComputedStyle(bar).backgroundImage,
          close: getComputedStyle(close).display,
          grow: getComputedStyle(grow).display,
          title: getComputedStyle(f.querySelector('[data-part="title"]')!).color,
        }
      }),
    )
    const active = state.find((s) => s.state === 'focused')!
    const inactive = state.find((s) => s.state === 'blurred')!

    expect(active.stripes, 'the active caption carries stripes').toContain('gradient')
    expect(inactive.stripes, 'HIG p164: the stripes disappear').toBe('none')
    expect(inactive.close, 'the close box disappears').toBe('none')
    expect(inactive.grow, 'the size box disappears').toBe('none')
    // The title is NOT in the list of things Apple says disappears, and there is no
    // second black to dim it to. It stays ink.
    expect(inactive.title).toBe('rgb(0, 0, 0)')
    expect(active.title).toBe('rgb(0, 0, 0)')
  })
})

test.describe('there is no zoom box and no minimize', () => {
  test('the caption emits only a close box', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(1))
    const frame = page.locator('[data-win-id]').first()
    await expect(frame.locator('[data-action="close"]')).toBeVisible()
    // documentProc has no zoom box — zoomDocProc arrives in 1987 — and System 1 is
    // single-tasking, so there is nothing to minimize into.
    expect(await frame.locator('[data-action="maximize"]').count()).toBe(0)
    expect(await frame.locator('[data-action="minimize"]').count()).toBe(0)
    expect(await frame.locator('[data-action="collapse"]').count()).toBe(0)
  })

  test('the window manager refuses the maximize command outright', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(1))
    const before = await page.evaluate(() => {
      const wm = window.__chronos.shell.wm
      const id = wm.focusedId()!
      return { rect: { ...wm.get(id)!.rect }, semantics: wm.metrics.maximizeSemantics }
    })
    expect(before.semantics).toBe('none')
    // Both the double-click gesture and the command route through toggleMaximize.
    await page.locator('[data-part="titlebar"]').first().dblclick({ position: { x: 120, y: 8 } })
    await page.evaluate(() => {
      const wm = window.__chronos.shell.wm
      wm.toggleMaximize(wm.focusedId()!)
    })
    const after = await page.evaluate(() => {
      const wm = window.__chronos.shell.wm
      const s = wm.get(wm.focusedId()!)!
      return { rect: { ...s.rect }, maximized: s.maximized }
    })
    expect(after.maximized).toBe(false)
    expect(after.rect).toEqual(before.rect)
  })

  test('the chrome menu disables what the era does not have', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(1))
    const spec = await page.evaluate(() => {
      const shell = window.__chronos.shell
      const bar = document.querySelector<HTMLElement>('[data-part="titlebar"]')!
      const items = shell.menuSpecFor(shell.dispatcher.resolve(bar)) ?? []
      return items
        .filter((e): e is Extract<typeof e, { kind: 'item' }> => e.kind === 'item')
        .map((e) => ({ label: e.label, enabled: e.enabled, accel: e.accel ?? null }))
    })
    const by = (label: string): { enabled: boolean; accel: string | null } =>
      spec.find((e) => e.label === label)!
    expect(by('Restore').enabled, 'no zoom in this era').toBe(false)
    expect(by('Maximize').enabled, 'no zoom in this era').toBe(false)
    expect(by('Minimize').enabled, 'no minimize in this era').toBe(false)
    expect(by('Move').enabled).toBe(true)
    expect(by('Size').enabled).toBe(true)
    // The accelerator comes from the active skin's own keymap, so a Macintosh menu
    // shows a Command chord rather than the Alt+F4 the shell used to hardcode.
    expect(by('Close').accel).toBe('Meta+W')
  })
})

test.describe('disabled text is notPatBic, not a grey fill', () => {
  /*
   * The mechanism, asserted the way the measurement script asserts it against Apple's
   * pixels: ink on one `(x + y)` parity is a checkerboard, ink on both is solid. In
   * the File-menu figure the disabled `Revert` is 77 ink pixels with 77 on one parity,
   * against `Save As...` at 179 split 91/88.
   */
  test('a disabled menu item renders as a real checkerboard', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(1))
    await page.locator('[data-part="titlebar"]').first().click({ button: 'right' })
    const disabled = page.locator('[data-menu] [data-menu-item][aria-disabled="true"]').first()
    await expect(disabled).toBeVisible()

    const applied = await disabled.evaluate((el) => {
      // notPatBic removed ink from the drawn glyph; the CSS equivalent paints a
      // checkerboard of the background over it, which is also what GrayString did.
      const over = getComputedStyle(el, '::after')
      return {
        image: over.backgroundImage,
        size: over.backgroundSize,
        colour: getComputedStyle(el).color,
      }
    })
    expect(applied.image).toContain('conic-gradient')
    // One logical Macintosh pixel per cell, so a 2px tile.
    expect(applied.size).toBe('2px 2px')
    // The glyph keeps its ink colour. There is no second black to change it to.
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
    expect(parity.oneParityShare).toBeLessThan(0.7)
  })
})

test.describe('menus', () => {
  test('16px items, and a separator is a full item with a grey rule at +8', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(1))
    await page.locator('[data-part="titlebar"]').first().click({ button: 'right' })
    const menu = page.locator('[data-menu]').first()
    const m = await menu.evaluate((el) => {
      const scale = window.__chronos.shell.display.scale()
      const item = el.querySelector('[data-menu-item]')!
      const sep = el.querySelector('[data-menu-separator]')!
      const cs = getComputedStyle(el)
      const sepStyle = getComputedStyle(sep)
      return {
        item: Math.round(item.getBoundingClientRect().height / scale),
        sep: Math.round(sep.getBoundingClientRect().height / scale),
        sepImage: sepStyle.backgroundImage,
        sepSize: sepStyle.backgroundSize,
        sepPos: sepStyle.backgroundPosition,
        border: cs.borderTopWidth,
        shadow: cs.boxShadow,
      }
    })
    expect(m.item, 'nine cap tops in the figure all land on item + 3').toBe(16)
    expect(m.sep, 'a separator is a full item, not a thin rule').toBe(16)
    // On 1-bit hardware a grey rule is alternating pixels, not a lighter line.
    expect(m.sepImage).toContain('conic-gradient')
    expect(m.sepSize).toBe('100% 1px')
    expect(m.sepPos).toBe('0px 8px')
    // Same frame and shadow construction as a window: 1px black plus a 1px offset.
    expect(m.border).toBe('1px')
    expect(m.shadow).toContain('rgb(0, 0, 0) 1px 1px 0px 0px')
  })

  test('the accelerator is a drawn command symbol, not a font character', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(1))
    await page.locator('[data-part="titlebar"]').first().click({ button: 'right' })
    const cmd = page.locator('[data-menu] .s1-menu-cmd').first()
    await expect(cmd).toBeVisible()
    const drawn = await cmd.evaluate((el) => {
      const cs = getComputedStyle(el)
      return { text: el.textContent, shadow: cs.boxShadow, w: cs.width }
    })
    // U+2318 is absent from every Chicago substitute that holds the pixel grid, so
    // the 9x9 bitmap from the figure is drawn as box-shadow pixels instead.
    expect(drawn.text).toBe('')
    expect(drawn.w).toBe('1px')
    expect(drawn.shadow.split(',').length).toBeGreaterThan(20)
    // currentColor, so the glyph inverts with a highlighted item for free.
    expect(drawn.shadow).toContain('rgb(0, 0, 0)')
  })

  test('the skin emits the menu contract, not just its own classes', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(1))
    await page.locator('[data-part="titlebar"]').first().click({ button: 'right' })
    const menu = page.locator('[data-menu]').first()
    await expect(menu.locator('[data-menu-item]').first()).toBeVisible()
    expect(await menu.locator('[data-menu-separator]').count()).toBeGreaterThan(0)
    expect(await menu.locator('[data-menu-submenu]').count()).toBeGreaterThan(0)
  })

  test('a menu is hosted inside the scaled desktop, at the era\'s own size',
    async ({ page }) => {
      await page.evaluate(() => window.__chronos.openWindows(1))
      await page.locator('[data-part="titlebar"]').first().click({ button: 'right' })
      const m = await page.evaluate(() => {
        const menu = document.querySelector<HTMLElement>('[data-menu]')!
        const desktop = document.querySelector<HTMLElement>('[data-desktop]')!
        return {
          insideDesktop: desktop.contains(menu),
          scale: window.__chronos.shell.display.scale(),
          rendered: menu.getBoundingClientRect().height,
          own: menu.offsetHeight,
        }
      })
      // Parented to the page root a menu escapes the display transform, so on this
      // era it came out at half the size of everything around it.
      expect(m.insideDesktop).toBe(true)
      expect(m.rendered).toBeCloseTo(m.own * m.scale, 0)
    })
})

test.describe('controls', () => {
  test('a push button is 59x20 with a measured 3,1,1 corner arc', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(1))
    await page.evaluate(() => {
      const host = document.querySelector('[data-win-id] [data-content]')!
      const b = document.createElement('button')
      b.className = 's1-button'
      b.textContent = 'Cancel'
      host.appendChild(b)
    })
    const btn = page.locator('[data-win-id] .s1-button').first()
    const size = await btn.evaluate((el) => {
      const scale = window.__chronos.shell.display.scale()
      const r = el.getBoundingClientRect()
      return { w: Math.round(r.width / scale), h: Math.round(r.height / scale) }
    })
    // Apple's prose: 59px wide for OK/Cancel (p228), 20px tall (p229).
    expect(size).toEqual({ w: 59, h: 20 })

    const grid = await inkGrid(page, btn)
    expect(grid.length).toBe(20)
    // The arc is a hand-drawn 3-row staircase, not a radius. Leftmost ink per row:
    const profile = grid.slice(0, 4).map((row) => runs(row)[0]![0])
    expect(profile, 'x-insets 3,1,1 then flush').toEqual([3, 1, 1, 0])
    const bottom = grid.slice(16).map((row) => runs(row)[0]![0])
    expect(bottom, 'mirrored at the bottom').toEqual([0, 1, 1, 3])
  })

  test('the default button ring is 3px of ink separated by 1px of white', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(1))
    await page.evaluate(() => {
      const host = document.querySelector('[data-win-id] [data-content]')!
      const ring = document.createElement('span')
      ring.className = 's1-default'
      const b = document.createElement('button')
      b.className = 's1-button'
      b.textContent = 'Save'
      ring.appendChild(b)
      host.appendChild(ring)
    })
    const ring = page.locator('[data-win-id] .s1-default').first()
    const grid = await inkGrid(page, ring)
    // Documented at p230. The ring adds 4px on every side: 3 of ink and 1 of white.
    const mid = grid[Math.floor(grid.length / 2)]!
    const r = runs(mid)
    expect(r[0], 'three ink columns then the gap').toEqual([0, 2])
    expect(r[1]![0], 'the button outline begins 4px in').toBe(4)
  })

  test('pressed inverts, because a 1-bit display has no other press', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(1))
    await page.evaluate(() => {
      const host = document.querySelector('[data-win-id] [data-content]')!
      const b = document.createElement('button')
      b.className = 's1-button'
      b.textContent = 'OK'
      host.appendChild(b)
    })
    const btn = page.locator('[data-win-id] .s1-button').first()
    const read = async (): Promise<string> =>
      btn.evaluate((el) => {
        const cs = getComputedStyle(el)
        const fill = getComputedStyle(el, '::before')
        return `${cs.color}|${fill.backgroundColor}`
      })

    // Focus is read before any pointer work: Chromium only treats focus as
    // :focus-visible when the last interaction was a keyboard one.
    await btn.focus()
    const focus = await btn.evaluate((el) => {
      const cs = getComputedStyle(el)
      return `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineOffset}`
    })

    const rest = await read()
    await btn.hover()
    const hover = await read()
    await page.mouse.down()
    const active = await read()
    await page.mouse.up()

    // Pressed is inversion, documented at p229: "the button highlights (inverts)".
    expect(active).not.toBe(rest)
    expect(active).toBe('rgb(255, 255, 255)|rgb(0, 0, 0)')
    // Hover is IDENTICAL to rest, and that is the assertion. System 1 tracked no
    // rollover anywhere — the Appearance Manager introduces it in 1997 — so a hover
    // difference here would be an invention, not a fidelity improvement.
    expect(hover, 'this era has no hover state').toBe(rest)
    // The focus indicator is the era's own: "a rectangular border of two black
    // pixels, which is separated from the list by one pixel of white space" (p222).
    expect(focus).toBe('solid 2px 1px')

    const disabled = await page.evaluate(() => {
      const b = document.querySelector<HTMLButtonElement>('[data-win-id] .s1-button')!
      const read2 = (): string => {
        const cs = getComputedStyle(b)
        const over = getComputedStyle(b, '::after')
        return `${cs.color}|${over.backgroundImage}`
      }
      const before = read2()
      b.disabled = true
      const after = read2()
      b.disabled = false
      return { before, after }
    })
    expect(disabled.after).not.toBe(disabled.before)
  })

  test('a text field is a plain 1px rectangle and a check box is 12x12', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(1))
    const s = await page.evaluate(() => {
      const scale = window.__chronos.shell.display.scale()
      const host = document.querySelector('[data-win-id] [data-content]')!
      const i = document.createElement('input')
      i.className = 's1-textbox'
      host.appendChild(i)
      const c = document.createElement('input')
      c.type = 'checkbox'
      c.className = 's1-check'
      host.appendChild(c)
      const ics = getComputedStyle(i)
      const cr = c.getBoundingClientRect()
      const out = {
        border: `${ics.borderTopWidth} ${ics.borderTopStyle} ${ics.borderTopColor}`,
        shadow: ics.boxShadow,
        height: Math.round(i.getBoundingClientRect().height / scale),
        check: { w: Math.round(cr.width / scale), h: Math.round(cr.height / scale) },
      }
      i.remove()
      c.remove()
      return out
    })
    expect(s.border).toBe('1px solid rgb(0, 0, 0)')
    // No bevel of any kind. There is nothing to bevel with.
    expect(s.shadow).toBe('none')
    expect(s.height).toBe(22)
    expect(s.check).toEqual({ w: 12, h: 12 })
  })
})

test.describe('typography', () => {
  test('one face at one size, with a 9px cap height', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(1))
    const faces = await page.evaluate(() => {
      const pick = (sel: string): { family: string; size: string; line: string } => {
        const cs = getComputedStyle(document.querySelector(sel)!)
        return { family: cs.fontFamily, size: cs.fontSize, line: cs.lineHeight }
      }
      return { title: pick('[data-part="title"]'), content: pick('[data-win-id] [data-content]') }
    })
    // Chicago 12 is the whole era's face, exactly as SYSTEM.FON is Windows 3.1's.
    expect(faces.title.family).toContain('S1 Chicago')
    expect(faces.title.family).toBe(faces.content.family)
    // 16px is the only size that works: ChiKareGo2 is a 1024-upm face on a 64-unit
    // grid, so 16px puts every coordinate and every advance on a whole pixel.
    expect(faces.title.size).toBe('16px')
    // 15px, not 16: at 16px the content box is exactly 15px and the baseline sits
    // 12px down, so a 15px line box has zero half-leading and lands the cap top on
    // row 3. A 16px line-height would half-lead by 0.5px.
    expect(faces.title.line).toBe('15px')
  })

  test('the substitute font actually loads', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(1))
    const loaded = await page.evaluate(async () => {
      await document.fonts.ready
      return [...document.fonts].map((f) => `${f.family} ${f.status}`)
    })
    expect(loaded.some((f) => f.startsWith('S1 Chicago') && f.endsWith('loaded'))).toBe(true)
  })

  test('the rendered cap height is exactly 9px', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(1))
    await page.evaluate(() => {
      const wm = window.__chronos.shell.wm
      wm.setTitle(wm.focusedId()!, 'HIGH')
    })
    const grid = await inkGrid(page, page.locator('[data-part="title"]').first())
    const inked = grid.map((row, i) => [i, row.some(Boolean)] as const)
      .filter(([, any]) => any)
      .map(([i]) => i)
    // A string of caps with no descenders: the ink band is the cap height.
    expect(inked[inked.length - 1]! - inked[0]! + 1).toBe(9)
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
          if (/font-size:\s*[\d.]+pt/.test(rule.cssText)) bad.push(rule.cssText.slice(0, 90))
        }
      }
      return bad
    })
    expect(offenders).toEqual([])
  })
})

test.describe('the era is one bit deep, and the viewport proves it', () => {
  test('512x342 at a whole-number scale', async ({ page }) => {
    const d = await page.evaluate(() => {
      const display = window.__chronos.shell.display
      const a = display.workArea()
      return { scale: display.scale(), w: a.w, h: a.h }
    })
    expect(Number.isInteger(d.scale)).toBe(true)
    expect(d.scale).toBeGreaterThanOrEqual(1)
    // The work area is the logical screen less the status strip.
    expect(d.w).toBe(512)
    expect(d.h).toBeLessThanOrEqual(342)
  })

  test('the desktop is a 1px 50% checkerboard, not a flat grey', async ({ page }) => {
    await page.evaluate(() => window.__chronos.reset())
    const parity = await measureParity(page, page.locator('[data-desktop]'))
    expect(parity.ink).toBeGreaterThan(1000)
    // 1661 of 3321 pixels in the figure, every one on the same parity.
    expect(parity.oneParityShare).toBeGreaterThan(0.98)
  })

  /*
   * The whole-era assertion. Every tone in System 1 is a dither of two colours, so a
   * single antialiased edge anywhere — a soft glyph, a `border-radius`, a fractional
   * scale, a gradient — appears as a third value and fails this. It is the reason the
   * corner arcs are clip-path staircases and the font size is 16px and not 15 or 17.
   */
  test('the rendered desktop contains two tones and nothing between', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(2))
    await page.evaluate(() => {
      const host = document.querySelector('[data-win-id] [data-content]')!
      const b = document.createElement('button')
      b.className = 's1-button'
      b.textContent = 'Cancel'
      host.appendChild(b)
      const d = document.createElement('button')
      d.className = 's1-button'
      d.textContent = 'Eject'
      d.disabled = true
      host.appendChild(d)
    })
    await page.locator('[data-part="titlebar"]').first().click({ button: 'right' })
    const tones = await page.evaluate(
      async ({ bytes }) => {
        const blob = new Blob([new Uint8Array(bytes)], { type: 'image/png' })
        const bmp = await createImageBitmap(blob)
        const c = new OffscreenCanvas(bmp.width, bmp.height)
        const ctx = c.getContext('2d')!
        ctx.drawImage(bmp, 0, 0)
        const d = ctx.getImageData(0, 0, bmp.width, bmp.height).data
        const seen = new Map<number, number>()
        for (let i = 0; i < d.length; i += 4) {
          const key = (d[i]! << 16) | (d[i + 1]! << 8) | d[i + 2]!
          seen.set(key, (seen.get(key) ?? 0) + 1)
        }
        return [...seen.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([k, n]) => ({ hex: `#${k.toString(16).padStart(6, '0')}`, n }))
      },
      { bytes: [...(await page.locator('[data-desktop]').screenshot())] },
    )
    expect(tones.map((t) => t.hex).sort()).toEqual(['#000000', '#ffffff'])
  })
})
