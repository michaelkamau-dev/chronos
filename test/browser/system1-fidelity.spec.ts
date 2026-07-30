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

  test('a menu is hosted on the shell root and scales itself to the display',
    async ({ page }) => {
      await page.evaluate(() => window.__chronos.openWindows(1))
      await page.locator('[data-part="titlebar"]').first().click({ button: 'right' })
      const m = await page.evaluate(() => {
        const menu = document.querySelector<HTMLElement>('[data-menu]')!
        const desktop = document.querySelector<HTMLElement>('[data-desktop]')!
        const root = document.getElementById('chronos-root')!
        return {
          insideDesktop: desktop.contains(menu),
          onRoot: menu.parentElement === root,
          scale: window.__chronos.shell.display.scale(),
          published: getComputedStyle(root).getPropertyValue('--display-scale').trim(),
          rendered: menu.getBoundingClientRect().height,
          own: menu.offsetHeight,
          family: getComputedStyle(menu).fontFamily,
        }
      })
      // A menu lives on the root so the display transform cannot clip it — which also
      // means it escapes that transform, and this era renders at scale 2. Left
      // unscaled it came out at half the size of the era around it.
      expect(m.insideDesktop).toBe(false)
      expect(m.onRoot).toBe(true)
      expect(m.published).toBe(String(m.scale))
      expect(m.rendered).toBeCloseTo(m.own * m.scale, 0)
      // And it inherits the skin's generated properties, which are written at the root
      // for exactly this reason: on the desktop, a menu got the browser's serif.
      expect(m.family).toContain('S1 Chicago')
    })
})

test.describe('the menu bar', () => {
  /**
   * The bar's 20px decompose as 1px + 18px + 1px, and its first row is the screen's
   * own border line — which is what makes the era's own arithmetic close and lands the
   * cap top on row 5. Measured on three figures; reproduced by
   * `measure-mac-system1.py`'s `measure_menubar`.
   */
  test('20px, its first row the screen border, its last the rule, caps on row 5',
    async ({ page }) => {
      const bar = page.locator('[data-shell-region="menubar"]')
      await expect(bar).toBeVisible()
      const grid = await inkGrid(page, bar)
      expect(grid.length, 'the bar is 20px including its rule').toBe(20)

      // Row 0 is the screen's border, short by 2px at each end for the rounded
      // corner; row 19 is the rule and spans the whole width.
      expect(runs(grid[0]!), 'row 0 is the screen border line').toEqual([[2, 509]])
      expect(runs(grid[19]!), 'row 19 is the bar rule').toEqual([[0, 511]])

      // Rows 1, 16, 17 and 18 carry no title ink: the 16px cell sits at rows 2..17
      // and Chicago's caps occupy 5..13 inside it.
      for (const i of [1, 16, 17, 18]) {
        expect(grid[i]!.some(Boolean), `row ${i} is clear`).toBe(false)
      }
      const capRows = grid
        .map((row, i) => [i, row.slice(40, 240).some(Boolean)] as const)
        .filter(([i, any]) => any && i > 0 && i < 19)
        .map(([i]) => i)
      expect(capRows[0], 'the cap top lands on row 5').toBe(5)
      expect(capRows[capRows.length - 1]).toBeLessThanOrEqual(15)
    })

  /**
   * The Apple title is the one that is artwork rather than a string: an 11x14 bitmap
   * from the file-menu figure at x 18..28, rows 2..15, inside a 17px advance. The
   * advance is what makes every following title land on its measured column, which is
   * why it is a measured value and not the ink width.
   */
  test('the Apple title is the measured 11x14 bitmap at x 18', async ({ page }) => {
    const grid = await inkGrid(page, page.locator('[data-shell-region="menubar"]'))
    const cols: number[] = []
    for (let x = 0; x < 40; x++) {
      if (grid.slice(1, 19).some((row) => row[x])) cols.push(x)
    }
    expect([cols[0], cols[cols.length - 1]], 'ink x 18..28').toEqual([18, 28])
    const rows = grid
      .map((row, i) => [i, row.slice(0, 40).some(Boolean)] as const)
      .filter(([i, any]) => any && i > 0 && i < 19)
      .map(([i]) => i)
    expect([rows[0], rows[rows.length - 1]], 'ink rows 2..15').toEqual([2, 15])
    // Its top three rows are the stem: 2, 2 and 1 pixels wide.
    expect([2, 3, 4].map((i) => grid[i]!.slice(0, 40).filter(Boolean).length))
      .toEqual([2, 2, 1])
  })

  /**
   * Two measurements that do not reconcile, both shipped exactly.
   *
   * A title's box is the string plus 10px either side (two figures), and the stride to
   * the next string is the string plus 15px (four of five transitions in the Finder's
   * bar). Together they mean adjacent boxes overlap by 5px, which no figure can settle
   * because only one title is ever highlighted. The construction is asserted rather
   * than the absolute columns, because the columns also carry the substitute font's
   * advance drift — see docs/eras/system1.md.
   */
  test('a title box is the string + 10px either side, on a stride of + 15',
    async ({ page }) => {
      const m = await page.evaluate(() => {
        const scale = window.__chronos.shell.display.scale()
        const bar = document.querySelector<HTMLElement>('[data-shell-region="menubar"]')!
        const titles = [...bar.querySelectorAll<HTMLElement>('[data-menubar-title]')]
        const origin = bar.getBoundingClientRect().left
        const px = (v: number): number => Math.round(v / scale)
        return {
          pad: titles.map((t) => getComputedStyle(t).paddingLeft),
          boxes: titles.map((t) => {
            const r = t.getBoundingClientRect()
            return { left: px(r.left - origin), w: px(r.width) }
          }),
        }
      })
      expect(new Set(m.pad), 'every title carries the measured 10px').toEqual(
        new Set(['10px']),
      )
      // The first box's left edge, 8px in from the screen's border line.
      expect(m.boxes[0]!.left, 'the Apple box starts at 8').toBe(8)
      // The Apple advance is 17, so its box is 37 and the next box starts at 40 —
      // both values straight off the file-menu figure.
      expect(m.boxes[0]!.w, 'the Apple box is 17 + 20').toBe(37)
      expect(m.boxes[1]!.left, 'File\'s box starts at 40').toBe(40)
      // Every stride is its own box minus the 5px overlap the two measurements imply.
      for (let i = 0; i < m.boxes.length - 1; i++) {
        expect(m.boxes[i + 1]!.left - m.boxes[i]!.left, `stride ${i}`)
          .toBe(m.boxes[i]!.w - 5)
      }
    })

  /**
   * Apple's own construction: the inverted title, the bar's rule and the menu's left
   * border are one continuous run of ink. That falls out of opening the menu at the
   * *title's* bottom rather than the bar's — the box ends on row 18, so the menu's own
   * 1px top border lands on the rule at row 19.
   */
  test('a menu drops from the title box\'s left edge, its top border on the rule',
    async ({ page }) => {
      await page.locator('[data-menubar-title="file"]').click()
      const m = await page.evaluate(() => {
        const scale = window.__chronos.shell.display.scale()
        const bar = document.querySelector<HTMLElement>('[data-shell-region="menubar"]')!
        const title = document.querySelector<HTMLElement>('[data-menubar-title="file"]')!
        const menu = document.querySelector<HTMLElement>('[data-menu]')!
        const b = bar.getBoundingClientRect()
        const t = title.getBoundingClientRect()
        const n = menu.getBoundingClientRect()
        const cs = getComputedStyle(title)
        return {
          menuLeft: Math.round((n.left - b.left) / scale),
          titleLeft: Math.round((t.left - b.left) / scale),
          menuTop: Math.round((n.top - b.top) / scale),
          titleBottom: Math.round((t.bottom - b.top) / scale),
          background: cs.backgroundColor,
          color: cs.color,
        }
      })
      expect(m.menuLeft, 'the menu\'s left border is the box\'s left edge')
        .toBe(m.titleLeft)
      expect(m.titleBottom, 'the box ends on row 18, so its bottom edge is row 19')
        .toBe(19)
      expect(m.menuTop, 'the menu\'s top border lands on the rule').toBe(19)
      // The title inverts. On 1-bit hardware that is the only highlight there is.
      expect(m.background).toBe('rgb(0, 0, 0)')
      expect(m.color).toBe('rgb(255, 255, 255)')
    })

  /**
   * The inversion has to clear however the menu closed, and Escape is the route that
   * catches a bar polling for pointer events instead. `MenuController.subscribe` is
   * what makes it work — this is the assertion that the bar uses it.
   */
  test('the inversion clears when the menu closes by Escape', async ({ page }) => {
    const title = page.locator('[data-menubar-title="file"]')
    await title.click()
    await expect(title).toHaveAttribute('data-open', 'true')
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-menu]')).toHaveCount(0)
    expect(await title.getAttribute('data-open')).toBeNull()
  })

  test('sliding along the bar with a menu open switches menus', async ({ page }) => {
    await page.locator('[data-menubar-title="file"]').click()
    await page.locator('[data-menubar-title="edit"]').hover()
    await expect(page.locator('[data-menubar-title="edit"]'))
      .toHaveAttribute('data-open', 'true')
    expect(await page.locator('[data-menubar-title="file"]').getAttribute('data-open'))
      .toBeNull()
    // One menu at a time, however it was opened.
    expect(await page.locator('[data-menu]').count()).toBe(1)
  })

  /**
   * Every mouse interaction needs a keyboard path. The era's keyboard has no arrow
   * keys at all, so the keys accepted here are a Chronos accessibility obligation
   * rather than an era behaviour — the same reasoning that binds Escape in a keymap
   * whose hardware had no Escape key.
   */
  test('a title opens from the keyboard and highlights the first item',
    async ({ page }) => {
      await page.locator('[data-menubar-title="view"]').focus()
      await page.keyboard.press('Enter')
      const menu = page.locator('[data-menu]')
      await expect(menu).toHaveCount(1)
      await expect(menu.locator('[data-menu-item]').first())
        .toHaveAttribute('data-highlight', 'true')
    })

  /**
   * Apple states it twice (HIG p144, p154): a menu title is never dimmed, even when
   * every item under it is unavailable. The Apple, View and Special menus are entirely
   * disabled here and their titles still open.
   */
  test('no menu title is ever disabled, however unavailable its contents',
    async ({ page }) => {
      const titles = page.locator('[data-menubar-title]')
      expect(await titles.count()).toBe(5)
      for (const t of await titles.all()) {
        expect(await t.isDisabled(), 'a Mac menu title is never dimmed').toBe(false)
        expect(await t.getAttribute('aria-disabled')).toBeNull()
      }
      await page.locator('[data-menubar-title="special"]').click()
      await expect(page.locator('[data-menu]')).toHaveCount(1)
    })

  /**
   * An **enabled** item's accelerator has to come from the active keymap, because it
   * promises a chord that works. A **disabled** item promises nothing, so it may carry
   * the chord the era gave it — which is how the Edit menu keeps the four chords it
   * made famous without any of them being bound.
   */
  test('every enabled item\'s accelerator comes from the skin\'s keymap',
    async ({ page }) => {
      await page.locator('[data-menubar-title="file"]').click()
      const items = await page.evaluate(() => {
        const shell = window.__chronos.shell
        return [...document.querySelectorAll('[data-menu-item]')].map((el) => ({
          label: el.querySelector('.s1-menu-label')?.textContent ?? '',
          key: el.querySelector('.s1-menu-key')?.textContent ?? '',
          disabled: el.getAttribute('aria-disabled') === 'true',
          fromKeymap: {
            open: shell.accelFor('shell.newWindow'),
            close: shell.accelFor('window.close'),
          },
        }))
      })
      // Open is the era's own chord for the action that makes a window. Command-N was
      // New Folder, which Chronos has nothing to make.
      expect(items.map((i) => [i.label, i.key])).toEqual([['Open', 'O'], ['Close', 'W']])
      expect(items[0]!.fromKeymap.open).toBe('Meta+O')
      expect(items[0]!.fromKeymap.close).toBe('Meta+W')
      // Open always applies; Close needs a closable window, and says so.
      expect(items.map((i) => i.disabled)).toEqual([false, true])

      await page.keyboard.press('Escape')
      await page.evaluate(() => window.__chronos.openWindows(1))
      await page.locator('[data-menubar-title="file"]').click()
      const enabled = await page.evaluate(() =>
        [...document.querySelectorAll('[data-menu-item]')].map(
          (el) => el.getAttribute('aria-disabled') === 'true',
        ),
      )
      expect(enabled, 'both apply once a window is frontmost').toEqual([false, false])
    })

  test('the Edit menu keeps its historical chords, and every item is stippled',
    async ({ page }) => {
      await page.locator('[data-menubar-title="edit"]').click()
      const keys = await page.evaluate(() =>
        [...document.querySelectorAll('[data-menu-item]')].map((el) => [
          el.querySelector('.s1-menu-label')?.textContent ?? '',
          el.querySelector('.s1-menu-key')?.textContent ?? '',
          el.getAttribute('aria-disabled'),
        ]),
      )
      expect(keys).toEqual([
        ['Undo', 'Z', 'true'],
        ['Cut', 'X', 'true'],
        ['Copy', 'C', 'true'],
        ['Paste', 'V', 'true'],
        ['Clear', '', 'true'],
      ])
      // And they are stippled by the same notPatBic knockout the window chrome menu
      // uses — the identical instrument the Windows 3.1 suite runs on GrayString.
      const p = await measureParity(
        page,
        page.locator('[data-menu] [data-menu-item]').first(),
      )
      expect(p.ink).toBeGreaterThan(20)
      expect(p.oneParityShare, 'a 50% checkerboard knocked out of the glyph')
        .toBeGreaterThan(0.95)
    })

  test('View keeps the current sort ticked while its commands are unavailable',
    async ({ page }) => {
      await page.locator('[data-menubar-title="view"]').click()
      const first = page.locator('[data-menu] [data-menu-item]').first()
      await expect(first).toHaveAttribute('aria-disabled', 'true')
      // Checked *and* disabled is what the Finder showed: the view stays ticked, the
      // commands do not apply. The tick is the measured 9x8 bitmap.
      const mark = first.locator('.s1-menu-mark')
      expect(await mark.getAttribute('data-glyph')).toBe('check')
      expect(await mark.evaluate((el) => getComputedStyle(el, '::before').boxShadow))
        .toContain('rgb(0, 0, 0)')
    })

  /**
   * A substitute face's *coverage* is part of verifying it, and the font comparison
   * never checked it: it rendered the target strings and measured their shapes and
   * widths, so a character none of them contained was invisible to it.
   *
   * ChiKareGo2 has no U+2026 and no U+2014. A missing glyph does not fail loudly — it
   * falls back to the browser's default face, whose fractional advance takes every
   * glyph after it in the run off the pixel grid. The text still appears; it is just
   * no longer 1-bit. That is why the menus say `About the Finder...` rather than using
   * an ellipsis character.
   */
  test('the substitute covers every character this skin renders', async ({ page }) => {
    const labels: string[] = []
    for (const kind of ['apple', 'file', 'edit', 'view', 'special']) {
      await page.locator(`[data-menubar-title="${kind}"]`).click()
      labels.push(
        ...(await page.locator('[data-menu] [data-menu-item]').allTextContents()),
      )
      await page.keyboard.press('Escape')
    }
    labels.push(...(await page.locator('[data-menubar-title]').allTextContents()))
    const uncovered = await page.evaluate(
      (strings: string[]) =>
        strings.filter((t) => t !== '' && !document.fonts.check('16px "S1 Chicago"', t)),
      labels,
    )
    expect(uncovered, 'every glyph comes from the era face, none from a fallback')
      .toEqual([])
  })

  /**
   * One region, and the absences are the era. No Dock, no taskbar, no window list —
   * there is no multitasking to list, and no minimize for a Dock to receive.
   */
  test('the bar is the era\'s only region, and it reserves its 20px',
    async ({ page }) => {
      const m = await page.evaluate(() => {
        const regions = [...document.querySelectorAll('[data-shell-region]')]
          .map((el) => (el as HTMLElement).dataset['shellRegion'])
        const desktop = document.querySelector<HTMLElement>('[data-desktop]')!
        const bar = document.querySelector<HTMLElement>('[data-shell-region="menubar"]')!
        return {
          // The harness status strip is not a skin region; it lives on the root.
          inDesktop: [...desktop.querySelectorAll('[data-shell-region]')]
            .map((el) => (el as HTMLElement).dataset['shellRegion']),
          regions,
          workAreaTop: window.__chronos.shell.wm.workArea().y,
          insideTransform: desktop.contains(bar),
        }
      })
      expect(m.inDesktop, 'exactly one skin region, the menu bar').toEqual(['menubar'])
      expect(m.regions).not.toContain('dock')
      // Regions live inside the desktop so they sit inside the display transform:
      // a 512x342 era's bar scales with its viewport instead of floating beside it.
      expect(m.insideTransform).toBe(true)
      expect(m.workAreaTop, 'the bar reserves its 20px from the work area').toBe(20)
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
   * The whole-era assertion, and the one that took the longest to state truthfully.
   *
   * Every tone in System 1 is a dither of two colours, so no pixel anywhere may be a
   * mid grey: a grey disabled-text fill, a fractional display scale, a `border-radius`,
   * a gradient or a softened glyph all produce one and all fail here.
   *
   * What the era *does* produce, and what a naive "exactly two colours" assertion
   * fails on, is **LCD subpixel fringing on text**. Chromium tints the edge pixels of
   * a glyph whenever it takes the LCD text path, and it does so even when the glyph is
   * perfectly pixel-aligned, because the filter kernel spans neighbouring subpixels.
   * Measured on this era: the fringes are exactly four values — `#4f0f00`, `#000f4f`,
   * `#ffe7a7` and `#a7e7ff` — whose lumas are 32, 18, 231 and 215. Every one is within
   * a few percent of black or white. There is no mid grey, which is the actual claim.
   *
   * When Chromium takes that path is worth recording, because it explains why some of
   * this era's surfaces are pure and others are not. LCD text is used when the text
   * sits on a background Blink can prove opaque *and* its layer's transform is a
   * translation. So the window titles are fringed — white erase rect, and the frame
   * carries `translate3d` — while the menus are not, because a menu is scaled by
   * `--display-scale` and a scale disables the LCD path outright. `background: none`
   * on the title made it pure too, by removing the provable opacity, but it also let
   * the racing stripes run through the string, which is flatly wrong rather than
   * subtly wrong. None of `-webkit-font-smoothing: antialiased`, `none`,
   * `font-smooth: never` or `text-rendering: optimizeSpeed` changes it — measured, and
   * §7 says as much about that property already.
   *
   * §7 names the complete cure: render the affected text to a 1x canvas and upscale
   * with `image-rendering: pixelated`. It costs selectable, accessible text, so it is
   * not taken here and the limitation is recorded instead.
   */
  test('no pixel anywhere is a mid grey', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(2))
    await page.evaluate(() => {
      const host = document.querySelector('[data-win-id] [data-content]')!
      const wrap = document.createElement('div')
      // A block container at an integer offset, so the test measures the skin rather
      // than the baseline alignment of two bare inline-blocks.
      wrap.setAttribute('style', 'position:absolute;left:8px;top:8px')
      for (const [label, off] of [['Cancel', false], ['Eject', true]] as const) {
        const b = document.createElement('button')
        b.className = 's1-button'
        b.textContent = label
        b.disabled = off
        b.style.display = 'block'
        b.style.marginBottom = '8px'
        wrap.appendChild(b)
      }
      host.appendChild(wrap)
    })
    await page.locator('[data-part="titlebar"]').first().click({ button: 'right' })
    const surfaces = [
      [...(await page.locator('[data-desktop]').screenshot())],
      [...(await page.locator('[data-menu]').first().screenshot())],
    ]
    const stats = await page.evaluate(async (shots: number[][]) => {
      let pure = 0
      let fringe = 0
      const mid: string[] = []
      for (const bytes of shots) {
        const blob = new Blob([new Uint8Array(bytes)], { type: 'image/png' })
        const bmp = await createImageBitmap(blob)
        const c = new OffscreenCanvas(bmp.width, bmp.height)
        const ctx = c.getContext('2d')!
        ctx.drawImage(bmp, 0, 0)
        const d = ctx.getImageData(0, 0, bmp.width, bmp.height).data
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i]!
          const g = d[i + 1]!
          const b = d[i + 2]!
          if ((r === 0 && g === 0 && b === 0) || (r === 255 && g === 255 && b === 255)) {
            pure++
            continue
          }
          const luma = 0.299 * r + 0.587 * g + 0.114 * b
          if (luma < 40 || luma > 208) fringe++
          else mid.push(`#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')} luma ${Math.round(luma)}`)
        }
      }
      return { pure, fringe, mid: [...new Set(mid)].slice(0, 8), total: pure + fringe + mid.length }
    }, surfaces)

    // The claim: no mid grey exists. A grey fill lands at luma ~128 and fails.
    expect(stats.mid, 'mid-grey pixels').toEqual([])
    // And the fringing stays a rounding error on text edges rather than a look.
    expect(stats.fringe / stats.total).toBeLessThan(0.02)
  })
})

test.describe('era-correct path syntax over the same stored nodes', () => {
  test('renders colon-separated paths with the extension hidden', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const fs = window.__chronos.fs
      const codec = window.__chronos.codec
      const docs = (await fs.list(fs.root())).find((n) => n.wellKnown === 'documents')!
      const file = await fs.createFile(docs.id, 'Letter.txt', 'x', { mime: 'text/plain' })
      const path = codec.format(await fs.chain(file))
      return {
        path,
        storedName: docs.name,
        volume: codec.volumeName(),
        separator: codec.separator,
        // The display drops the extension, so a path read off the screen has to be
        // typeable back — parse matches the stored name first, then the shown form.
        roundTrip: (await codec.parse(path, fs.root())) === file,
        byStoredName: (await codec.parse('Macintosh HD:Documents:Letter.txt', fs.root())) === file,
        // A leading colon is the era's relative marker, and `::` is the parent.
        relative: (await codec.parse(':Letter', docs.id)) === file,
        parent: (await codec.parse('::Documents:Letter', docs.id)) === file,
        wrongVolume: await codec.parse('Untitled:Documents:Letter', fs.root()),
      }
    })
    // The same stored node the XP codec renders as C:\My Documents\Letter.txt.
    expect(result.path).toBe('Macintosh HD:Documents:Letter')
    expect(result.storedName).toBe('Documents')
    expect(result.volume).toBe('Macintosh HD')
    expect(result.separator).toBe(':')
    expect(result.roundTrip).toBe(true)
    expect(result.byStoredName).toBe(true)
    expect(result.relative).toBe(true)
    expect(result.parent).toBe(true)
    expect(result.wrongVolume).toBeNull()
  })

  test('a folder path ends in a colon and the System Folder keeps its name', async ({ page }) => {
    const out = await page.evaluate(async () => {
      const fs = window.__chronos.fs
      const codec = window.__chronos.codec
      const roots = await fs.list(fs.root())
      const docs = roots.find((n) => n.wellKnown === 'documents')!
      return {
        folder: codec.format(await fs.chain(docs.id)),
        names: roots.map((n) => ({ stored: n.name, shown: codec.displayName(n) })),
      }
    })
    expect(out.folder).toBe('Macintosh HD:Documents:')
    const byStored = new Map(out.names.map((n) => [n.stored, n.shown]))
    // No Recycle Bin, no Program Files: the Trash was an icon and applications sat on
    // the volume.
    expect(byStored.get('Trash')).toBe('Trash')
    expect(byStored.get('Applications')).toBe('Applications')
    expect(byStored.get('System')).toBe('System Folder')
  })

  test('the extension policy is conservative, not greedy', async ({ page }) => {
    const shown = await page.evaluate(async () => {
      const codec = window.__chronos.codec
      const fs = window.__chronos.fs
      const made = await Promise.all(
        ['Letter.txt', 'Notes.1984', 'Read Me', 'Chart.png', 'a.b'].map((n) =>
          fs.createFile(fs.root(), n, 'x', { mime: 'text/plain' }),
        ),
      )
      const stats = await Promise.all(made.map((id) => fs.stat(id)))
      return stats.map((n) => [n.name, codec.displayName(n)])
    })
    // A short alphanumeric run after the last dot is an extension; a year is not, and
    // a name with no dot is untouched.
    expect(Object.fromEntries(shown)).toEqual({
      'Letter.txt': 'Letter',
      'Notes.1984': 'Notes.1984',
      'Read Me': 'Read Me',
      'Chart.png': 'Chart',
      'a.b': 'a',
    })
  })

  test('name collisions get the Mac decoration, not the Windows one', async ({ page }) => {
    const suggested = await page.evaluate(async () => {
      const fs = window.__chronos.fs
      await fs.createFile(fs.root(), 'Report', 'a', { mime: 'text/plain' })
      const { system1NameDecorator } = await import('/src/skins/system1/paths.ts')
      return fs.suggestName(fs.root(), 'Report', system1NameDecorator)
    })
    // The Finder appended " copy". " (2)" belongs to a different skin, and the
    // filesystem knows neither.
    expect(suggested).toBe('Report copy')
  })
})
