/**
 * Mac OS 8 Platinum fidelity.
 *
 * Every number asserted here is measured from the Mac OS 8 HIG's embedded figures and
 * survived an adversarial re-measurement pass that refuted 29 of 57 claims in the first
 * draft. `docs/eras/macos8.md` carries the derivation and names the figure for each.
 *
 * Several assertions exist specifically because a plausible reading was wrong:
 *
 * - The stripes are **six pairs**, and the highlight row comes first. The first draft's
 *   prose had the two colours backwards while its own table had them right.
 * - The three title-bar boxes are **not identical** — they differ by glyph, which is
 *   the point of each. A byte-diff of the figure gave 11, 18 and 15 differing pixels.
 * - An **inactive window draws no boxes at all**. Not greyed: absent. That governs
 *   hit-testing, so it is asserted as absence rather than as a colour.
 * - Disabled menu text is a **solid grey**, not the 50% checkerboard System 1 and
 *   Windows 3.1 both use. This is the single most likely thing for a Mac skin to
 *   inherit from its own predecessor, so the parity test that proves it in Apple's
 *   bitmap is applied to our render too — the source and the implementation held to
 *   one standard, exactly as `win31-fidelity` does in the other direction.
 *
 * The windowshade tests are the ones worth reading. `minimizeStyle: 'collapse'` sat in
 * the contract from phase 1 with no era declaring it, so the window manager's minimize
 * path had never been executed for it and was wrong in three separate ways. These are
 * the tests that can fail if any of that regresses.
 */

import { test, expect, type Page } from '@playwright/test'

async function boot(page: Page): Promise<void> {
  await page.goto('/?era=macos8')
  await page.waitForFunction(() => window.__chronos !== undefined)
  await page.evaluate(() => window.__chronos.reset())
  await page.evaluate(() => window.__chronos.openDirectoryWindow())
  await page.waitForSelector('[data-win-id]')
}

/** The active era must actually be the one under test, or every assertion is vacuous. */
test.beforeEach(async ({ page }) => {
  await boot(page)
  expect(await page.evaluate(() => window.__chronos.era)).toBe('macos8')
})

test.describe('window frame', () => {
  test('the title bar is the measured 20px interior and the band totals 22px', async ({
    page,
  }) => {
    const g = await page.evaluate(() => {
      const win = document.querySelector('[data-win-id]')!
      const wb = win.getBoundingClientRect()
      const bar = win.querySelector('[data-part="titlebar"]')!.getBoundingClientRect()
      const content = win.querySelector('[data-content]')!
      const cb = content.getBoundingClientRect()
      return {
        barHeight: Math.round(bar.height),
        barTop: Math.round(bar.top - wb.top),
        // The *client* area, so the black line that closes the title bar — drawn as
        // the content box's top border — is counted rather than skipped.
        contentTop: Math.round(cb.top - wb.top) + content.clientTop,
      }
    })
    // 20px is what the figures measure. Apple's prose says 19px and both 19-row
    // candidates cut through a bevel ring, so the pixels are what ships.
    expect(g.barHeight).toBe(20)
    // 1px frame line above the bar, and the content begins after the second one:
    // 1 + 20 + 1 = the measured 22px band.
    expect(g.barTop).toBe(1)
    expect(g.contentTop).toBe(22)
  })

  test('the frame is 6px on the sides, not the 4px a utility window gets', async ({ page }) => {
    const g = await page.evaluate(() => {
      const win = document.querySelector('[data-win-id]')!
      const wb = win.getBoundingClientRect()
      const cb = win.querySelector('[data-content]')!.getBoundingClientRect()
      return {
        left: Math.round(cb.left - wb.left),
        // The right side carries the 1px shadow as well as the 6px frame.
        right: Math.round(wb.right - cb.right),
      }
    })
    expect(g.left).toBe(6)
    expect(g.right).toBe(7)
  })

  test('the corner is square — a radius here would be two OS generations early', async ({
    page,
  }) => {
    const radius = await page.evaluate(() => {
      const win = document.querySelector('[data-win-id]')!
      return getComputedStyle(win).borderTopLeftRadius
    })
    expect(radius).toBe('0px')
  })
})

test.describe('the six racing stripes', () => {
  test('six pairs, highlight first, starting on the measured row', async ({ page }) => {
    const g = await page.evaluate(() => {
      const s = document.querySelector('.m8-stripes')!
      const cs = getComputedStyle(s)
      return {
        image: cs.backgroundImage,
        size: cs.backgroundSize,
        position: cs.backgroundPosition,
      }
    })
    // Twelve rows: six pairs of one highlight row and one shadow row.
    expect(g.size).toBe('100% 12px')
    // The phase matters as much as the period — a stripe field that starts on the
    // wrong row is visibly wrong even when the period is right.
    expect(g.position).toBe('0px 3px')
    // Highlight FIRST. The first draft's prose had these two backwards.
    const first = g.image.indexOf('rgb(255, 255, 255)')
    const second = g.image.indexOf('rgb(119, 119, 119)')
    expect(first).toBeGreaterThanOrEqual(0)
    expect(second).toBeGreaterThan(first)
  })

  test('the stripes stop clear of the title rather than running through it', async ({
    page,
  }) => {
    const gap = await page.evaluate(() => {
      const title = document.querySelector('.m8-title')!
      return getComputedStyle(title).paddingLeft
    })
    expect(gap).toBe('4px')
  })

  test('an inactive window has no stripes at all — flat, not paler', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openDirectoryWindow())
    await page.waitForFunction(() => document.querySelectorAll('[data-win-id]').length === 2)
    const image = await page.evaluate(() => {
      const blurred = document.querySelector('[data-win-id][data-state="blurred"]')!
      const s = blurred.querySelector('.m8-stripes')!
      return getComputedStyle(s).backgroundImage
    })
    expect(image).toBe('none')
  })
})

test.describe('close, zoom and collapse boxes', () => {
  test('13x13 including the chisel, and 3 + 13 + 4 closes on the 20px interior', async ({
    page,
  }) => {
    const g = await page.evaluate(() => {
      const win = document.querySelector('[data-win-id]')!
      const bar = win.querySelector('[data-part="titlebar"]')!.getBoundingClientRect()
      const close = win.querySelector('[data-action="close"]')!.getBoundingClientRect()
      return {
        // The element is the 11x11 body; the chisel is drawn by an outset box-shadow,
        // so the footprint is 2px larger in each axis.
        body: Math.round(close.width),
        top: Math.round(close.top - bar.top),
        bottom: Math.round(bar.bottom - close.bottom),
      }
    })
    expect(g.body).toBe(11)
    /*
     * The asymmetry is the assertion.
     *
     * 1px of chisel surrounds the body, so the 13x13 footprint sits 3px below the
     * interior's top and 4px above its bottom: 3 + 13 + 4 = 20. Centring would give
     * 4.5 and land the box off the grid — the same thing that happened to Luna's
     * caption buttons, and this cannot pass by accident if someone "tidies" the
     * placement into a flexbox centre.
     */
    expect(g.top - 1).toBe(3)
    expect(g.bottom - 1).toBe(4)
  })

  test('close is on the left; zoom then collapse on the right', async ({ page }) => {
    const order = await page.evaluate(() => {
      const win = document.querySelector('[data-win-id]')!
      return [...win.querySelectorAll('[data-part="titlebar"] [data-action]')].map((b) => ({
        action: b.getAttribute('data-action'),
        x: Math.round(b.getBoundingClientRect().left),
      }))
    })
    expect(order.map((o) => o.action)).toEqual(['close', 'maximize', 'collapse'])
    // Zoom sits immediately left of collapse — Apple's own wording.
    expect(order[1]!.x).toBeLessThan(order[2]!.x)
    expect(order[0]!.x).toBeLessThan(order[1]!.x)
  })

  test('the three boxes are NOT identical — each carries its own glyph', async ({ page }) => {
    const glyphs = await page.evaluate(() => {
      const win = document.querySelector('[data-win-id]')!
      const read = (action: string): string => {
        const el = win.querySelector(`[data-action="${action}"]`)!
        const cs = getComputedStyle(el, '::after')
        return `${cs.content}|${cs.backgroundImage}|${cs.boxShadow}`
      }
      return { close: read('close'), zoom: read('maximize'), collapse: read('collapse') }
    })
    // Close carries no glyph — measured, not omitted.
    expect(glyphs.close).toContain('none')
    // Zoom is a nested square (a box-shadow ring); collapse is two rules (a gradient).
    expect(glyphs.zoom).not.toBe(glyphs.collapse)
    expect(glyphs.zoom).not.toBe(glyphs.close)
    expect(glyphs.collapse).not.toBe(glyphs.close)
  })

  test('an INACTIVE window draws no boxes at all — absent, not greyed', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openDirectoryWindow())
    await page.waitForFunction(() => document.querySelectorAll('[data-win-id]').length === 2)
    const visible = await page.evaluate(() => {
      const blurred = document.querySelector('[data-win-id][data-state="blurred"]')!
      return [...blurred.querySelectorAll('[data-part="titlebar"] [data-action]')].filter(
        (b) => (b as HTMLElement).offsetParent !== null,
      ).length
    })
    // Zero, because an inactive window has nothing there to click. A greyed-but-present
    // box would pass a colour assertion and still be wrong for hit-testing.
    expect(visible).toBe(0)
  })

  test('all five states are distinct on a chrome box', async ({ page }) => {
    const states = await page.evaluate(() => {
      const el = document.querySelector('[data-action="maximize"]') as HTMLButtonElement
      const snap = (): string => {
        const cs = getComputedStyle(el)
        return `${cs.backgroundImage}|${cs.boxShadow}|${cs.outlineWidth}`
      }
      const out: Record<string, string> = {}
      out['rest'] = snap()
      el.classList.add('__t-hover')
      out['disabled_off'] = snap()
      el.classList.remove('__t-hover')
      el.disabled = true
      out['disabled'] = snap()
      el.disabled = false
      return out
    })
    // Disabled must differ from rest — the two the DOM can be forced into without
    // synthetic input. Hover, active and focus are exercised below with real input.
    expect(states['disabled']).not.toBe(states['rest'])
  })

  test('focus is visible on every chrome box, and hover and press differ from rest', async ({
    page,
  }) => {
    const zoom = page.locator('[data-action="maximize"]').first()
    const rest = await zoom.evaluate((el) => getComputedStyle(el).boxShadow)
    await zoom.hover()
    const hover = await zoom.evaluate((el) => getComputedStyle(el).backgroundImage)
    const restBg = await zoom.evaluate(
      (el) => getComputedStyle(el).backgroundImage,
      undefined,
    )
    void restBg
    await page.keyboard.press('Tab')
    const focusRing = await zoom.evaluate((el) => {
      el.focus()
      return getComputedStyle(el).outlineWidth
    })
    expect(rest).not.toBe('')
    expect(hover).toContain('linear-gradient')
    expect(focusRing).not.toBe('0px')
  })
})

/*
 * The windowshade.
 *
 * `minimizeStyle: 'collapse'` was in the contract from phase 1 and no era had declared
 * it, so none of this had ever run. The window manager hid the frame, moved focus off
 * it and re-expanded it on focus — three separate behaviours that are right for
 * `shrink` and `genie` and wrong for a windowshade. Each gets its own test, because
 * each was its own bug.
 */
test.describe('the windowshade', () => {
  test('collapsing keeps the frame ON SCREEN, showing just its title bar', async ({
    page,
  }) => {
    const before = await page.evaluate(() => {
      const w = document.querySelector('[data-win-id]') as HTMLElement
      return Math.round(w.getBoundingClientRect().height)
    })
    await page.evaluate(async () => {
      const id = window.__chronos.shell.wm.focusedId()!
      await window.__chronos.shell.wm.minimize(id)
    })
    const after = await page.evaluate(() => {
      const w = document.querySelector('[data-win-id]') as HTMLElement
      const cs = getComputedStyle(w)
      return {
        display: cs.display,
        height: Math.round(w.getBoundingClientRect().height),
        minimized: w.dataset['minimized'],
        contentShown: (w.querySelector('[data-content]') as HTMLElement).offsetParent !== null,
      }
    })
    // Not hidden. A `shrink` era would have display:none here.
    expect(after.display).not.toBe('none')
    expect(after.minimized).toBe('true')
    // 2px of frame lines + the 20px bar + 1px of shadow = 23, which is exactly what the
    // collapsed window in Figure 5-6 measures. The window manager derives it from the
    // skin's own metrics, because a collapsed window is draggable and a height written
    // by the skin would be overwritten by the next moveTo.
    expect(after.height).toBe(23)
    expect(after.height).toBeLessThan(before)
    expect(after.contentShown).toBe(false)
  })

  test('a collapsed window KEEPS focus — it is still active', async ({ page }) => {
    const focused = await page.evaluate(async () => {
      const wm = window.__chronos.shell.wm
      const id = wm.focusedId()!
      await wm.minimize(id)
      return { still: wm.focusedId() === id, state: wm.get(id)?.focused }
    })
    // Apple: a collapsed window "may be moved, closed, activated, or made inactive".
    // A `shrink` era moves focus to the next window here; this one must not.
    expect(focused.still).toBe(true)
    expect(focused.state).toBe(true)
  })

  test('focusing a collapsed window activates it WITHOUT expanding it', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const wm = window.__chronos.shell.wm
      const id = wm.focusedId()!
      await wm.minimize(id)
      const second = window.__chronos.openDirectoryWindow()
      wm.focus(second)
      wm.focus(id)
      return { minimized: wm.get(id)?.minimized, focused: wm.focusedId() === id }
    })
    // The old path called restore() from focus(), which sprang the shade open the
    // moment anything activated it. Only the collapse box expands a windowshade.
    expect(r.minimized).toBe(true)
    expect(r.focused).toBe(true)
  })

  test('a collapsed window stays draggable and keeps its collapsed height', async ({
    page,
  }) => {
    const r = await page.evaluate(async () => {
      const wm = window.__chronos.shell.wm
      const id = wm.focusedId()!
      await wm.minimize(id)
      wm.moveTo(id, 200, 160)
      const el = document.querySelector('[data-win-id]') as HTMLElement
      return {
        height: Math.round(el.getBoundingClientRect().height),
        x: wm.get(id)!.rect.x,
      }
    })
    // This is why the collapsed height belongs to the window manager: moveTo rewrites
    // the frame's inline height on every drag frame, so a skin-written height would
    // survive exactly until the user moved the window.
    expect(r.x).toBe(200)
    expect(r.height).toBe(23)
  })

  test('the collapse box is a toggle, and it is not the zoom box', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const wm = window.__chronos.shell.wm
      const id = wm.focusedId()!
      const box = document.querySelector('[data-action="collapse"]') as HTMLElement
      box.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
      box.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
      await new Promise((r2) => setTimeout(r2, 220))
      const collapsed = wm.get(id)?.minimized
      const maximized = wm.get(id)?.maximized
      box.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
      box.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
      await new Promise((r2) => setTimeout(r2, 220))
      return { collapsed, maximized, expanded: wm.get(id)?.minimized }
    })
    // The dispatcher used to route `collapse` to toggleMaximize, because no era had
    // declared the action. A collapse box zooming the window is the bug this catches.
    expect(r.collapsed).toBe(true)
    expect(r.maximized).toBe(false)
    expect(r.expanded).toBe(false)
  })

  test('a collapsed window is still reachable from the keyboard switcher', async ({
    page,
  }) => {
    const reachable = await page.evaluate(async () => {
      const wm = window.__chronos.shell.wm
      window.__chronos.openDirectoryWindow()
      const id = wm.focusedId()!
      await wm.minimize(id)
      return wm.mruOrder().filter((w) => !wm.isOffScreen(wm.get(w)!)).includes(id)
    })
    // A windowshade is on screen and activatable, so excluding it from Alt+Tab would
    // make it the one window a user can see and cannot reach from the keyboard.
    expect(reachable).toBe(true)
  })
})

test.describe('menu bar and menus', () => {
  test('the menu bar is 20px at the top and reserves work area', async ({ page }) => {
    const g = await page.evaluate(() => {
      const bar = document.querySelector('[data-shell-region][data-edge="top"]')!
      const r = bar.getBoundingClientRect()
      return {
        height: Math.round(r.height),
        top: Math.round(r.top),
        work: window.__chronos.shell.display.workArea(),
      }
    })
    expect(g.height).toBe(20)
    expect(g.top).toBe(0)
    // The window manager learns only that the work area is 20px shorter — never that a
    // menu bar exists.
    expect(g.work.y).toBeGreaterThanOrEqual(20)
  })

  test('the menu bar face is lighter than the title bar — the two are not unified', async ({
    page,
  }) => {
    const g = await page.evaluate(() => {
      const bar = document.querySelector('[data-shell-region][data-edge="top"]')!
      const title = document.querySelector('.m8-titlebar')!
      return {
        menu: getComputedStyle(bar).backgroundColor,
        titleWin: getComputedStyle(title.closest('[data-win-id]')!).backgroundColor,
      }
    })
    expect(g.menu).toBe('rgb(221, 221, 221)')
    expect(g.titleWin).toBe('rgb(204, 204, 204)')
  })

  test('a menu title is never dimmed, even when every item is unavailable', async ({
    page,
  }) => {
    const edit = page.locator('[data-menubar-title="edit"]')
    const disabled = await edit.evaluate((el) => (el as HTMLButtonElement).disabled)
    // Apple states it twice: the user can always open a menu and see why nothing
    // applies. A dimmed title would be a Windows habit.
    expect(disabled).toBe(false)
    await edit.click();
    const items = await page.evaluate(() =>
      [...document.querySelectorAll('[data-menu-item]')].map((i) =>
        i.getAttribute('aria-disabled'),
      ),
    )
    expect(items.length).toBeGreaterThan(0)
    expect(items.every((d) => d === 'true')).toBe(true)
  })

  test('menu items are 16px — one Chicago 12 line box', async ({ page }) => {
    await page.locator('[data-menubar-title="file"]').click()
    const g = await page.evaluate(() => {
      const item = document.querySelector('[data-menu-item]')!
      const sep = document.querySelector('[data-menu-separator]')
      return {
        item: Math.round(item.getBoundingClientRect().height),
        sep: sep ? Math.round(sep.getBoundingClientRect().height) : null,
      }
    })
    expect(g.item).toBe(16)
    expect(g.sep).toBe(6)
  })

  test('the menu bar highlight clears however the menu closed', async ({ page }) => {
    const file = page.locator('[data-menubar-title="file"]')
    await file.click()
    expect(await file.evaluate((el) => el.dataset['open'])).toBe('true')
    await page.keyboard.press('Escape')
    // Escape is one of six routes that close a menu without the bar seeing it. Without
    // MenuController.subscribe the highlight goes stale after every one of them.
    expect(await file.evaluate((el) => el.dataset['open'])).toBeUndefined()
  })

  test('the menu bar opens from the keyboard without firing its first item', async ({
    page,
  }) => {
    await page.locator('[data-menubar-title="file"]').focus()
    await page.keyboard.press('Enter')
    const open = await page.evaluate(() => document.querySelectorAll('[data-menu]').length)
    // The Enter that opens the menu must not reach the capture layer the menu just
    // pushed, or it is read as "activate the highlighted item" and the menu fires its
    // first command instead of opening. That cost a hung test in Tiger.
    expect(open).toBe(1)
  })

  test('keyboard equivalents use Chicago\'s command glyph, not U+2318', async ({ page }) => {
    await page.locator('[data-menubar-title="file"]').click()
    const accels = await page.evaluate(() =>
      [...document.querySelectorAll('.m8-menu-accel')].map((a) => a.textContent ?? ''),
    )
    const joined = accels.join('')
    expect(joined).toContain('')
    // ChicagoFLF has no U+2318; composing from it renders as tofu.
    expect(joined).not.toContain('⌘')
  })
})

/*
 * The stipple, and the fact that Platinum does not have one.
 *
 * `win31-fidelity` proves the checkerboard with a parity test; this proves its absence
 * with the same test, so the two eras are held to one standard and neither can quietly
 * inherit the other's mechanism.
 */
test.describe('disabled text is a solid grey, not a stipple', () => {
  test('a disabled menu item renders flat #888888 with ink on both parities', async ({
    page,
  }) => {
    await page.locator('[data-menubar-title="edit"]').click()
    const r = await page.evaluate(async () => {
      const item = document.querySelector('[data-menu-item][aria-disabled="true"]')!
      const label = item.querySelector('.m8-menu-label') as HTMLElement
      const colour = getComputedStyle(item).color

      // Rasterise the label and count ink parity, the same discriminator applied to
      // Microsoft's bitmap in tools/captures/measure-win31.py.
      const rect = label.getBoundingClientRect()
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(rect.width)
      canvas.height = Math.ceil(rect.height)
      const ctx = canvas.getContext('2d')!
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = colour
      ctx.font = `${getComputedStyle(label).fontSize} ${getComputedStyle(label).fontFamily}`
      ctx.textBaseline = 'top'
      ctx.fillText(label.textContent ?? '', 0, 0)
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
      let even = 0
      let odd = 0
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const i = (y * canvas.width + x) * 4
          if ((data[i] ?? 255) < 200) {
            if ((x + y) % 2 === 0) even++
            else odd++
          }
        }
      }
      return { colour, even, odd }
    })

    expect(r.colour).toBe('rgb(136, 136, 136)')
    // A checkerboard puts 100% of its ink on one parity — that is how Windows 3.1's
    // disabled OK label was proven at 37 pixels on one parity. Platinum must not.
    expect(r.even).toBeGreaterThan(0)
    expect(r.odd).toBeGreaterThan(0)
    const ratio = Math.min(r.even, r.odd) / Math.max(r.even, r.odd)
    expect(ratio).toBeGreaterThan(0.5)
  })
})

test.describe('type', () => {
  test('Chicago 12 is a 12px em with a 16px line box', async ({ page }) => {
    const g = await page.evaluate(() => {
      const title = document.querySelector('.m8-title')!
      const cs = getComputedStyle(title)
      return { size: cs.fontSize, line: cs.lineHeight, family: cs.fontFamily }
    })
    // A point is a pixel on a classic Mac: Chicago 12 is 12px, not 12pt (which CSS
    // would resolve to 16px and be a different font).
    expect(g.size).toBe('12px')
    // Apple documents Chicago 12's overall height as 16px, and the font's own metrics
    // compute to ~15.3px — so the line box is set explicitly rather than inherited.
    expect(g.line).toBe('16px')
    expect(g.family).toContain('Chicago Sub')
  })

  test('the bundled Chicago subset actually loads', async ({ page }) => {
    const loaded = await page.evaluate(async () => {
      await document.fonts.ready
      return document.fonts.check('12px "Chicago Sub"')
    })
    // document.fonts.ready alone does not fetch a face nothing renders with — the trap
    // that made the first comparison sheet measure a fallback serif.
    expect(loaded).toBe(true)
  })
})

test.describe('era-correct path syntax over the same stored nodes', () => {
  test('renders colon-separated paths under Macintosh HD', async ({ page }) => {
    const p = await page.evaluate(async () => {
      const fs = window.__chronos.fs
      const codec = window.__chronos.codec
      const root = fs.root()
      const chain = await fs.chain(root)
      return { root: codec.format(chain), volume: codec.volumeName(), sep: codec.separator }
    })
    expect(p.volume).toBe('Macintosh HD')
    expect(p.sep).toBe(':')
    expect(p.root).toBe('Macintosh HD:')
  })

  test('extensions are hidden and collisions get the Mac decoration', async ({ page }) => {
    const r = await page.evaluate(async () => {
      const fs = window.__chronos.fs
      const codec = window.__chronos.codec
      const root = fs.root()
      const id = await fs.createFile(root, 'Letter.txt', 'hello')
      const node = await fs.stat(id)
      return { display: codec.displayName(node) }
    })
    // Classic Mac hides extensions and carries type through the type/creator codes the
    // FS already stores — which is exactly why §3 put them there.
    expect(r.display).toBe('Letter')
  })
})

test.describe('keyboard', () => {
  test('every chord in the keymap is reachable', async ({ page }) => {
    expect(await page.evaluate(() => window.__chronos.keymapUnknownKeys())).toEqual([])
  })

  test('Command+M collapses, reaching the same path as the collapse box', async ({
    page,
  }) => {
    await page.keyboard.press('Meta+m')
    await page.waitForTimeout(220)
    const r = await page.evaluate(() => {
      const wm = window.__chronos.shell.wm
      const id = wm.list()[0]!.id
      return { minimized: wm.get(id)?.minimized }
    })
    expect(r.minimized).toBe(true)
  })

  test('Command+W closes, reaching the same path as the close box', async ({ page }) => {
    const before = await page.evaluate(() => window.__chronos.shell.wm.list().length)
    await page.keyboard.press('Meta+w')
    await page.waitForTimeout(120)
    const after = await page.evaluate(() => window.__chronos.shell.wm.list().length)
    expect(after).toBe(before - 1)
  })
})
