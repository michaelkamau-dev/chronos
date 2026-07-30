/**
 * Mac OS X Tiger fidelity.
 *
 * Every number asserted here is measured from the Tiger HIG's embedded figures;
 * `tools/pdf-extract/measure-tiger-titlebuttons.py` and `measure-tiger-chrome.py`
 * reproduce them, and `docs/eras/tiger.md` carries the derivation. Apple published no
 * window, title bar, scroll bar or menu specification in prose, so there is no
 * `documented` tier for the chrome and these are the strongest values available.
 *
 * Four assertions exist because §7 was wrong, or because every clone is:
 *
 * - The first traffic light is **9px** from the window's edge, not the 13px §7
 *   recorded. §7's figure was read with an edge finder that locked onto the window's
 *   drop shadow; five figures agree on 9px.
 * - A light is **14px** including its ring, not 12px. §7's 12px is the saturated core.
 * - The famous `#FF5F57` / `#FEBC2E` / `#28C840` are **modern macOS values from CSS
 *   clones**, and a test asserts they are absent — a regression toward them would look
 *   plausible and be wrong by two OS generations.
 * - The menu bar is **opaque**. Translucency arrives with 10.5 Leopard, and this is
 *   the single most common thing a Tiger recreation gets wrong.
 *
 * The lights-are-not-centred test is the one worth reading. It asserts an *asymmetry*:
 * 5px above and 3px below inside a 22px bar, where centring would give 4 and 4. That
 * cannot pass by accident and it fails the moment someone "tidies" the placement into
 * a flexbox centre — which is exactly what happened to Luna's caption buttons.
 */

import { test, expect, type Page } from '@playwright/test'

async function boot(page: Page): Promise<void> {
  await page.goto('/?era=tiger')
  await page.waitForFunction(() => window.__chronos !== undefined)
  await page.evaluate(() => window.__chronos.reset())
}

/** The active era must actually be the one under test, or every assertion is vacuous. */
test.beforeEach(async ({ page }) => {
  await boot(page)
  expect(await page.evaluate(() => window.__chronos.era)).toBe('tiger')
})

/** Geometry of the first window's frame, title bar and lights, in logical pixels. */
async function frameGeometry(page: Page): Promise<{
  win: { x: number; y: number; w: number; h: number }
  bar: number
  content: number
  lights: Array<{ action: string; x: number; y: number; w: number; h: number }>
}> {
  return page.evaluate(() => {
    const win = document.querySelector('[data-win-id]')!
    const wb = win.getBoundingClientRect()
    const bar = win.querySelector('[data-part="titlebar"]')!.getBoundingClientRect()
    const contentEl = win.querySelector('[data-content]')!
    const content = contentEl.getBoundingClientRect()
    return {
      win: { x: Math.round(wb.x), y: Math.round(wb.y), w: Math.round(wb.width), h: Math.round(wb.height) },
      bar: Math.round(bar.height),
      // The *interior* of the client area, so the 1px separator — which is drawn as
      // the content box's top border — is counted rather than skipped.
      content: Math.round(content.top - wb.top) + contentEl.clientTop,
      lights: [...win.querySelectorAll<HTMLElement>('[data-action]')].map((el) => {
        const b = el.getBoundingClientRect()
        return {
          action: el.dataset['action'] ?? '',
          x: Math.round(b.x - wb.x),
          y: Math.round(b.y - wb.y),
          w: Math.round(b.width),
          h: Math.round(b.height),
        }
      }),
    }
  })
}

test.describe('window frame', () => {
  test('the title bar is 22px and the client area begins 23px down', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(1))
    const g = await frameGeometry(page)
    // 22px measured independently in six figures, and corroborated by
    // NSStatusBar.system.thickness == 22.
    expect(g.bar).toBe(22)
    // Plus the 1px separator, which is ChromeMetrics.border.top.
    expect(g.content).toBe(23)
  })

  test('the frame is a 1px hairline, not a sizing border', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(1))
    const w = await page
      .locator('[data-win-id]')
      .first()
      .evaluate((el) => {
        const cs = getComputedStyle(el)
        return { left: cs.borderLeftWidth, right: cs.borderRightWidth, bottom: cs.borderBottomWidth }
      })
    // Aqua carries a window's weight in its shadow. Luna's 4px four-step frame is the
    // opposite approach, in the same window manager.
    expect(w).toEqual({ left: '1px', right: '1px', bottom: '1px' })
  })

  test('the top corner is a real radius, not Luna-style hard steps', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(1))
    const s = await page
      .locator('[data-win-id]')
      .first()
      .evaluate((el) => {
        const cs = getComputedStyle(el)
        return { radius: cs.borderTopLeftRadius, clip: cs.clipPath, bottom: cs.borderBottomLeftRadius }
      })
    // Measured arc profile 4,3,2,1,1,0 — structurally the same object as Luna's
    // 5,3,2,1,1,0, but antialiased, so a radius reproduces it and a clip-path polygon
    // would throw away the partial coverage that is part of the artwork.
    expect(s.radius).toBe('6px')
    expect(s.clip).toBe('none')
    // The bottom corners are square (Figure 13-22).
    expect(s.bottom).toBe('0px')
  })

  test('the window carries a drop shadow, unlike Luna which measured zero', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(1))
    const shadow = await page
      .locator('[data-win-id]')
      .first()
      .evaluate((el) => getComputedStyle(el).boxShadow)
    expect(shadow).not.toBe('none')
    // Two layers: a tight contact shadow and a broad ambient one.
    expect(shadow.split('rgba').length - 1).toBeGreaterThanOrEqual(2)
  })
})

test.describe('the traffic lights', () => {
  test('14px on 21px centres, 9px in from the window edge', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(1))
    const g = await frameGeometry(page)
    expect(g.lights).toHaveLength(3)
    // 14px including the 1px ring, confirmed on 40+ button instances across four
    // figures. §7's 12px is the saturated core a saturation test finds.
    for (const l of g.lights) {
      expect(l.w).toBe(14)
      expect(l.h).toBe(14)
    }
    // 9px, not §7's 13px — that value came from measuring to the drop shadow.
    expect(g.lights[0]!.x).toBe(9)
    // 21px centre to centre, which never varies in any figure.
    expect(g.lights[1]!.x - g.lights[0]!.x).toBe(21)
    expect(g.lights[2]!.x - g.lights[1]!.x).toBe(21)
  })

  test('they are NOT vertically centred — 5px above, 3px below', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(1))
    const g = await frameGeometry(page)
    const light = g.lights[0]!
    // Centring 14px in a 22px bar gives 4 and 4. Apple's fifteen specimens all show
    // 5 and 3: the lights sit one pixel low. Same class of finding as Luna's caption
    // buttons, and the same thing a "tidy this into a flex centre" edit would destroy.
    expect(light.y).toBe(5)
    expect(g.bar - (light.y + light.h)).toBe(3)
  })

  test('close is on the LEFT and the third button is zoom, not maximize', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(1))
    const g = await frameGeometry(page)
    // The order is close, minimize, zoom — left to right — where both Windows eras put
    // close last and on the right.
    expect(g.lights.map((l) => l.action)).toEqual(['close', 'minimize', 'maximize'])
    // The third light occupies the WM's `maximize` slot but zooms: the vocabulary
    // names the slot and `metrics.maximizeSemantics` names the behaviour.
    const semantics = await page.evaluate(
      () => window.__chronos.shell.wm.metrics.maximizeSemantics,
    )
    expect(semantics).toBe('zoom')
  })

  test('the colours are Tiger\'s, not the modern macOS values clones ship', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(1))
    const faces = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('[data-win-id] [data-action]')].map(
        (el) => getComputedStyle(el).backgroundImage,
      ),
    )
    const all = faces.join(' ').toLowerCase()
    // Measured: the close button's body sits around #C1362F and peaks at #F07A71.
    expect(all).toContain('rgb(193, 54, 47)')
    expect(all).toContain('rgb(240, 122, 113)')
    // The widely-circulated modern values, which are what a CSS clone would carry.
    // A regression toward them looks plausible and is two OS generations wrong.
    expect(all).not.toContain('rgb(255, 95, 87)')
    expect(all).not.toContain('rgb(254, 188, 46)')
    expect(all).not.toContain('rgb(40, 200, 64)')
  })

  test('no glyph is drawn at rest — Apple\'s fifteen specimens show none', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(1))
    const content = await page.evaluate(() => {
      const el = document.querySelector('[data-win-id] [data-action="close"]')!
      return getComputedStyle(el, '::after').content
    })
    // The glyph is a hover affordance here, and it is derived rather than measured —
    // so at rest there must be nothing, which is what the source actually shows.
    expect(content === 'none' || content === 'normal' || content === '').toBeTruthy()
  })

  test('all five states are distinct on a traffic light', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(1))
    const close = page.locator('[data-win-id] [data-action="close"]').first()
    const snap = async (): Promise<string> =>
      close.evaluate((el) => {
        const cs = getComputedStyle(el)
        const after = getComputedStyle(el, '::after')
        return [cs.backgroundImage, cs.boxShadow, cs.filter, after.backgroundImage].join('|')
      })

    const rest = await snap()

    // Disabled is read first, because a release over the close button closes the
    // window and takes the element with it.
    const disabled = await close.evaluate((el) => {
      const b = el as HTMLButtonElement
      b.disabled = true
      const cs = getComputedStyle(b)
      const out = [cs.backgroundImage, cs.boxShadow, cs.filter].join('|')
      b.disabled = false
      return out
    })

    await close.hover()
    const hover = await snap()

    // Focus, via the keyboard rather than by forcing a class.
    await close.evaluate((el) => (el as HTMLButtonElement).focus())
    const focused = await close.evaluate((el) => getComputedStyle(el).boxShadow)

    // Pressed, held so the state can be read before the release fires the action.
    const box = (await close.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    const active = await close.evaluate((el) => getComputedStyle(el).filter)
    await page.mouse.move(box.x + 300, box.y + 300)
    await page.mouse.up()

    expect(disabled).not.toBe(rest)
    // Hover reveals the glyph, so the ::after background changes.
    expect(hover).not.toBe(rest)
    // Focus is the measured Aqua ring, from the document's one lossless bitmap.
    expect(focused).toContain('rgb(138, 188, 227)')
    expect(active).not.toBe('none')
  })

  test('an inactive window greys its lights and its title ink', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(2))
    const s = await page.evaluate(() => {
      const wins = [...document.querySelectorAll<HTMLElement>('[data-win-id]')]
      const blurred = wins.find((w) => w.dataset['state'] === 'blurred')!
      const focused = wins.find((w) => w.dataset['state'] === 'focused')!
      const face = (w: HTMLElement): string =>
        getComputedStyle(w.querySelector('[data-action="close"]')!).backgroundImage
      return {
        blurredFace: face(blurred),
        focusedFace: face(focused),
        blurredInk: getComputedStyle(blurred.querySelector('[data-part="title"]')!).color,
        focusedInk: getComputedStyle(focused.querySelector('[data-part="title"]')!).color,
      }
    })
    // Apple: "controls in inactive windows do not have color" (HIG p191).
    expect(s.blurredFace).not.toBe(s.focusedFace)
    expect(s.blurredFace).not.toContain('rgb(193, 54, 47)')
    // The measured inactive ink, #4D5B5F — not black, and not a plain opacity change.
    expect(s.blurredInk).toBe('rgb(77, 91, 95)')
    expect(s.focusedInk).toBe('rgb(0, 0, 0)')
  })

  test('a modal dialog has no title bar buttons at all', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(1))
    await page.locator('.status button', { hasText: 'New modal' }).click()
    const counts = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('[data-win-id]')].map((w) => ({
        modal: w.dataset['modal'],
        actions: w.querySelectorAll('[data-action]').length,
      })),
    )
    const modal = counts.find((c) => c.modal === 'true')
    expect(modal).toBeDefined()
    // Apple: "Alerts and modal dialogs do not include any of these buttons" (p174).
    // The same structural move Windows 3.1 makes by emitting no close button.
    expect(modal!.actions).toBe(0)
    // And the ordinary window still has its three.
    expect(counts.find((c) => c.modal === 'false')!.actions).toBe(3)
  })
})

test.describe('the shell regions', () => {
  test('the menu bar is 22px at the top and reserves work area', async ({ page }) => {
    const s = await page.evaluate(() => {
      const bar = document.querySelector('[data-shell-region="menubar"]')!
      const b = bar.getBoundingClientRect()
      return {
        y: Math.round(b.y),
        h: Math.round(b.height),
        edge: (bar as HTMLElement).dataset['edge'],
        work: window.__chronos.shell.display.workArea(),
      }
    })
    // The same 22px as a title bar, which is what NSStatusBar.thickness describes.
    expect(s.h).toBe(22)
    expect(s.y).toBe(0)
    expect(s.edge).toBe('top')
    // The window manager learns only that the work area starts 22px down.
    expect(s.work.y).toBe(22)
  })

  test('the menu bar is opaque — translucency is 10.5, not 10.4', async ({ page }) => {
    const bg = await page.evaluate(() => {
      const cs = getComputedStyle(document.querySelector('[data-shell-region="menubar"]')!)
      return { image: cs.backgroundImage, colour: cs.backgroundColor, filter: cs.backdropFilter }
    })
    // Measured rather than asserted: two columns 420px apart inside Apple's bar give
    // identical per-row values, and the desktop below it is a different gradient.
    expect(bg.filter === 'none' || bg.filter === '').toBeTruthy()
    // No alpha anywhere in the painted gradient.
    expect(bg.image).not.toContain('rgba')
    // The measured trough at row 11, which a linear ramp would not produce.
    expect(bg.image).toContain('rgb(233, 233, 233)')
  })

  test('the Dock reserves work area and sits at the bottom', async ({ page }) => {
    const s = await page.evaluate(() => {
      const dock = document.querySelector('[data-shell-region="dock"]')!
      const b = dock.getBoundingClientRect()
      return {
        h: Math.round(b.height),
        edge: (dock as HTMLElement).dataset['edge'],
        work: window.__chronos.shell.display.workArea(),
        viewportH: window.innerHeight,
      }
    })
    expect(s.edge).toBe('bottom')
    expect(s.h).toBe(68)
    // The work area is the screen minus the menu bar, the Dock and the harness strip.
    // The WM never learns which of those is which.
    expect(s.work.y + s.work.h).toBeLessThanOrEqual(s.viewportH - s.h)
  })

  test('a window cannot be opened underneath the Dock', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(6))
    const bad = await page.evaluate(() => {
      const work = window.__chronos.shell.display.workArea()
      return window.__chronos.shell.wm
        .list()
        .filter((s) => s.rect.y + s.rect.h > work.y + work.h || s.rect.y < work.y)
        .map((s) => s.title)
    })
    // Apple: "prevent users from moving or resizing windows so that they are behind
    // the Dock" (HIG p56). The reserved work area is what implements it, and the
    // cascade has to respect it too.
    expect(bad).toEqual([])
  })

  test('a minimized window genies to its own Dock tile', async ({ page }) => {
    const ids = await page.evaluate(() => window.__chronos.openWindows(2))
    const target = await page.evaluate((id) => {
      const dock = document.querySelector('[data-shell-region="dock"]')!
      const tile = dock.querySelector<HTMLElement>(`[data-dock-tile="${id}"]`)
      if (!tile) return null
      const t = tile.getBoundingClientRect()
      const root = window.__chronos.shell.wm.root.getBoundingClientRect()
      return { x: Math.round(t.x - root.x), y: Math.round(t.y - root.y) }
    }, ids[1])
    // Only the Dock knows where a given window's tile ended up, which is why the
    // window manager asks rather than guessing at the work area's corner.
    expect(target).not.toBeNull()
    expect(target!.y).toBeGreaterThan(0)
  })

  test('the menu bar highlight clears however the menu closed', async ({ page }) => {
    await page.locator('[data-menubar-title="window"]').click()
    expect(await page.locator('[data-menu]').count()).toBe(1)
    expect(
      await page.locator('[data-menubar-title="window"]').getAttribute('data-open'),
    ).toBe('true')
    await page.keyboard.press('Escape')
    // Escape is one of six routes a menu can close by that the bar never sees, which
    // is what MenuController.subscribe exists for.
    expect(await page.locator('[data-menu]').count()).toBe(0)
    expect(
      await page.locator('[data-menubar-title="window"]').getAttribute('data-open'),
    ).toBeNull()
  })

  test('a menu title stays undimmed even when everything in it is unavailable', async ({
    page,
  }) => {
    // No windows open, so every window-related item is disabled.
    const s = await page.evaluate(() => {
      const t = document.querySelector<HTMLButtonElement>('[data-menubar-title="app"]')!
      return { disabled: t.disabled, colour: getComputedStyle(t).color }
    })
    // Apple states this twice (HIG p144 and p154): the user can always open a menu and
    // see why nothing applies.
    expect(s.disabled).toBe(false)
    expect(s.colour).toBe('rgb(0, 0, 0)')
  })
})

test.describe('menus', () => {
  async function openWindowMenu(page: Page): Promise<void> {
    await page.evaluate(() => window.__chronos.openWindows(1))
    await page.locator('[data-menubar-title="window"]').click()
    await page.locator('[data-menu]').waitFor()
  }

  test('items are 19px and a separator slot is 12px', async ({ page }) => {
    await openWindowMenu(page)
    const s = await page.evaluate(() => {
      const menu = document.querySelector('[data-menu]')!
      return {
        items: [...menu.querySelectorAll('[data-menu-item]')].map((i) =>
          Math.round(i.getBoundingClientRect().height),
        ),
        sep: Math.round(
          menu.querySelector('[data-menu-separator]')!.getBoundingClientRect().height,
        ),
      }
    })
    expect(new Set(s.items)).toEqual(new Set([19]))
    expect(s.sep).toBe(12)
  })

  test('the background is a 4px pinstripe, not a flat fill', async ({ page }) => {
    await openWindowMenu(page)
    const bg = await page.evaluate(
      () => getComputedStyle(document.querySelector('[data-menu]')!).backgroundImage,
    )
    // Two measured greys on a 2-row period. Proven in a lossless PNG in the same
    // source document, which is what licenses reading it out of the lossy figure.
    expect(bg).toContain('repeating-linear-gradient')
    expect(bg).toContain('rgb(243, 243, 243)')
    expect(bg).toContain('rgb(239, 239, 239)')
    expect(bg).toContain('2px')
    expect(bg).toContain('4px')
  })

  test('accelerators are modifier glyphs, not spelled-out words', async ({ page }) => {
    await openWindowMenu(page)
    const accels = await page.evaluate(() =>
      [...document.querySelectorAll('[data-menu] .tg-menu-accel')]
        .map((a) => a.textContent ?? '')
        .filter((t) => t.length > 0),
    )
    expect(accels.length).toBeGreaterThan(0)
    // A Mac menu draws ⌘M where Windows spells Ctrl+M. The chord table stays
    // platform-neutral (`Meta+M`) and the skin does the spelling.
    expect(accels.some((a) => a.includes('\u2318'))).toBeTruthy()
    for (const a of accels) {
      expect(a).not.toContain('Meta')
      expect(a).not.toContain('+')
    }
  })

  test('a dimmed item is dimmed AND is not highlighted', async ({ page }) => {
    // With no window open the Apple menu's Force Quit is disabled.
    await page.locator('[data-menubar-title="apple"]').click()
    await page.locator('[data-menu]').waitFor()
    const s = await page.evaluate(() => {
      const disabled = document.querySelector<HTMLElement>(
        '[data-menu] [data-menu-item][aria-disabled="true"]',
      )!
      const before = getComputedStyle(disabled).backgroundColor
      // Force the highlight the controller would apply on hover or arrow-down.
      disabled.dataset['highlight'] = 'true'
      const after = getComputedStyle(disabled)
      return { before, after: after.backgroundColor, ink: after.color }
    })
    // Apple: an unavailable item "is not highlighted when the user moves the pointer
    // over it" (HIG p146). The controller does highlight disabled entries — every
    // Windows era did — so this half of Apple's rule lives in the skin.
    expect(s.after).toBe(s.before)
    expect(s.after).not.toContain('rgb(50, 98, 180)')
    // The measured dimmed ink.
    expect(s.ink).toBe('rgb(128, 128, 128)')
  })

  test('the highlight is Tiger\'s measured blue', async ({ page }) => {
    await openWindowMenu(page)
    const bg = await page.evaluate(() => {
      const item = document.querySelector<HTMLElement>(
        '[data-menu] [data-menu-item][aria-disabled="false"]',
      )!
      item.dataset['highlight'] = 'true'
      const cs = getComputedStyle(item)
      return { bg: cs.backgroundColor, ink: cs.color }
    })
    expect(bg.bg).toBe('rgb(50, 98, 180)')
    expect(bg.ink).toBe('rgb(255, 255, 255)')
  })
})

test.describe('type', () => {
  test('a point is a pixel: the system font is 13px', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(1))
    const sizes = await page.evaluate(() => {
      const title = document.querySelector('[data-part="title"]')!
      const bar = document.querySelector('[data-shell-region="menubar"]')!
      return {
        title: getComputedStyle(title).fontSize,
        menubar: getComputedStyle(bar).fontSize,
      }
    })
    // Mac OS X drew at a nominal 72 DPI, so Lucida Grande 13pt is 13px exactly — the
    // opposite of Windows, where 8pt at 96 DPI is 10.667px and the era rasterised it
    // at 11. Writing `13pt` in CSS would give 17.33px.
    expect(sizes.title).toBe('13px')
    expect(sizes.menubar).toBe('13px')
  })

  test('the chrome never asks for bold — the bold subset is not shipped', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(1))
    await page.locator('[data-menubar-title="window"]').click()
    await page.locator('[data-menu]').waitFor()
    const weights = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          '[data-part="title"], [data-shell-region] *, [data-menu] *, [data-win-id] *',
        ),
      ].map((el) => getComputedStyle(el).fontWeight),
    )
    // Only the regular weight ships. A browser asked for bold would synthesise one by
    // smearing these outlines, which is visibly wrong. See docs/fonts/tiger-README.md.
    expect([...new Set(weights)]).toEqual(['400'])
  })

  test('the window title is regular weight, which was measured not assumed', async ({
    page,
  }) => {
    await page.evaluate(() => window.__chronos.openWindows(1))
    const w = await page.evaluate(
      () => getComputedStyle(document.querySelector('[data-part="title"]')!).fontWeight,
    )
    // Apple documents no window-title font. Measured against both title strings in
    // the figures: regular lands inside the +/-6% band the five-string comparison
    // establishes, bold is 18-22% out.
    expect(w).toBe('400')
  })
})

test.describe('paths', () => {
  test('the same stored nodes render as POSIX paths under /Users/chronos', async ({ page }) => {
    const paths = await page.evaluate(async () => {
      const fs = window.__chronos.fs
      const codec = window.__chronos.codec
      const root = fs.root()
      const kids = await fs.list(root)
      const docs = kids.find((k) => k.wellKnown === 'documents')!
      const chain = await fs.chain(docs.id)
      return { docs: codec.format(chain), root: codec.format(await fs.chain(root)) }
    })
    // The cross-era spine: the identical node XP renders as `C:\My Documents\`.
    expect(paths.docs).toBe('/Users/chronos/Documents/')
    // A POSIX volume is the empty string — the boot volume *is* `/`.
    expect(paths.root).toBe('/')
  })

  test('a path with the home prefix round-trips, though the nodes do not exist', async ({
    page,
  }) => {
    const ok = await page.evaluate(async () => {
      const fs = window.__chronos.fs
      const codec = window.__chronos.codec
      const root = fs.root()
      const found = await codec.parse('/Users/chronos/Documents', root)
      const kids = await fs.list(root)
      const docs = kids.find((k) => k.wellKnown === 'documents')!
      return { found, expected: docs.id, tilde: await codec.parse('~/Documents', root) }
    })
    // `/Users/chronos` is presentation, not storage: there are no `Users` or `chronos`
    // nodes to walk, so `parse` strips the prefix. Inventing them would put era
    // knowledge in the filesystem and corrupt the other five eras' paths.
    expect(ok.found).toBe(ok.expected)
    expect(ok.tilde).toBe(ok.expected)
  })
})

test.describe('keyboard', () => {
  test('Command+W closes, reaching the same path as the close button', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(2))
    const before = await page.evaluate(() => window.__chronos.shell.wm.list().length)
    await page.keyboard.press('Meta+w')
    await page.waitForFunction(
      (n) => window.__chronos.shell.wm.list().length === n - 1,
      before,
    )
    expect(await page.evaluate(() => window.__chronos.shell.wm.list().length)).toBe(before - 1)
  })

  test('Command+M minimizes, and the Dock tile survives it', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(1))
    await page.keyboard.press('Meta+m')
    await page.waitForFunction(() =>
      window.__chronos.shell.wm.list().some((s) => s.minimized),
    )
    const tiles = await page.evaluate(
      () => document.querySelectorAll('[data-shell-region="dock"] [data-dock-tile]').length,
    )
    // A minimized window keeps its Dock tile — that is where it went.
    expect(tiles).toBeGreaterThanOrEqual(2)
  })

  test('every chord in the keymap is reachable', async ({ page }) => {
    // A misspelled chord fails silently, and a dead keyboard path is a fidelity bug.
    expect(await page.evaluate(() => window.__chronos.keymapUnknownKeys())).toEqual([])
  })

  test('every registered command has a keyboard path in THIS era', async ({ page }) => {
    /*
     * `a11y.spec.ts` asserts this against the default era's keymap. It has to hold per
     * era, because each skin binds its own chords: Tiger uses Command where the Windows
     * eras use Alt, drops Alt+Space entirely, and reaches minimize and zoom through the
     * menu bar rather than a title-bar chrome menu. A command left with no Tiger path
     * would be a mouse-only feature in this era and invisible in the default one.
     */
    await page.evaluate(() => window.__chronos.openWindows(2))
    const report = await page.evaluate(() => {
      const shell = window.__chronos.shell
      const registered = shell.commands.registered()

      const chordBound = new Set<string>()
      for (const b of shell.skinKeymap) chordBound.add(b.command)

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
      const desktop = document.querySelector<HTMLElement>('[data-desktop]')
      if (desktop) collect(shell.menuSpecFor(d.resolve(desktop)))

      return registered.filter((c) => !chordBound.has(c) && !menuBound.has(c))
    })
    expect(report, 'commands with no keyboard path under Tiger').toEqual([])
  })

  test('the menu bar opens from the keyboard', async ({ page }) => {
    await page.evaluate(() => window.__chronos.openWindows(1))
    await page.locator('[data-menubar-title="window"]').focus()
    await page.keyboard.press('Enter')
    await page.locator('[data-menu]').waitFor()
    // Every mouse interaction has a keyboard path, including opening a menu bar menu.
    expect(await page.locator('[data-menu]').count()).toBe(1)
    const highlighted = await page.locator('[data-menu] [data-highlight="true"]').count()
    expect(highlighted).toBe(1)
  })
})
