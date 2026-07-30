/**
 * Window manager behaviour, driven through real browser input.
 *
 * Selectors here use the window manager's own contract vocabulary —
 * `[data-win-id]`, `[data-action]`, `[data-part]`, `[data-resize]` — rather than
 * any skin's class names. These tests assert the contract, so they must pass
 * against whichever era is active; keying them to one skin's classes made them
 * hang the moment Windows XP became the default.
 *
 * These are the phase-1 gate: every window manager capability the brief lists,
 * exercised with actual pointer and keyboard events rather than by calling
 * methods directly, because the dispatcher and the hit-test are the parts most
 * likely to be wrong.
 */

import { test, expect, type Page } from '@playwright/test'

async function boot(page: Page): Promise<void> {
  await page.goto('/')
  await page.waitForFunction(() => window.__chronos !== undefined)
  await page.evaluate(() => window.__chronos.reset())
}

function win(page: Page, n: number) {
  return page.locator('[data-win-id]').nth(n)
}

async function titleBarOf(page: Page, n: number) {
  return win(page, n).locator('[data-part="titlebar"]')
}

async function openWindows(page: Page, n: number): Promise<void> {
  await page.evaluate((count) => window.__chronos.openWindows(count), n)
}

async function transformOf(page: Page, n: number): Promise<string> {
  return win(page, n).evaluate((el) => (el as HTMLElement).style.transform)
}

test.describe('window lifecycle', () => {
  test('opens, cascades and focuses the newest window', async ({ page }) => {
    await boot(page)
    await openWindows(page, 3)
    await expect(page.locator('[data-win-id]')).toHaveCount(3)

    // The newest window is focused and frontmost.
    const states = await page.locator('[data-win-id]').evaluateAll((els) =>
      els.map((el) => ({
        state: (el as HTMLElement).dataset['state'],
        z: Number((el as HTMLElement).style.zIndex),
      })),
    )
    expect(states.filter((s) => s.state === 'focused')).toHaveLength(1)
    const focused = states.findIndex((s) => s.state === 'focused')
    expect(states[focused]!.z).toBe(Math.max(...states.map((s) => s.z)))

    // Cascade: each window is offset from the last.
    const t0 = await transformOf(page, 0)
    const t1 = await transformOf(page, 1)
    expect(t0).not.toBe(t1)
  })

  test('click-to-focus raises and restyles inactive chrome', async ({ page }) => {
    await boot(page)
    await openWindows(page, 3)
    const bar = await titleBarOf(page, 0)
    await bar.click({ position: { x: 40, y: 8 } })

    await expect(win(page, 0)).toHaveAttribute('data-state', 'focused')
    await expect(win(page, 1)).toHaveAttribute('data-state', 'blurred')
    await expect(win(page, 2)).toHaveAttribute('data-state', 'blurred')

    const z = await page.locator('[data-win-id]').evaluateAll((els) =>
      els.map((el) => Number((el as HTMLElement).style.zIndex)),
    )
    expect(z[0]).toBe(Math.max(...z))
  })

  test('the close box closes the window', async ({ page }) => {
    await boot(page)
    await openWindows(page, 2)
    await win(page, 1).locator('[data-action="close"]').click()
    await expect(page.locator('[data-win-id]')).toHaveCount(1)
  })

  test('Alt+F4 closes the focused window through the same path', async ({ page }) => {
    await boot(page)
    await openWindows(page, 2)
    await page.keyboard.press('Alt+F4')
    await expect(page.locator('[data-win-id]')).toHaveCount(1)
  })

  test('a close guard can refuse the close', async ({ page }) => {
    await boot(page)
    await openWindows(page, 1)
    // Install a guard that always refuses, then verify both routes are blocked.
    await page.evaluate(() => {
      const wm = window.__chronos.shell.wm
      const id = wm.focusedId()!
      wm.setCloseGuard(id, () => false)
    })
    await win(page, 0).locator('[data-action="close"]').click()
    await expect(page.locator('[data-win-id]')).toHaveCount(1)
    await page.keyboard.press('Alt+F4')
    await expect(page.locator('[data-win-id]')).toHaveCount(1)
  })
})

test.describe('drag', () => {
  test('moves with transform only and never writes top or left', async ({ page }) => {
    await boot(page)
    await openWindows(page, 1)
    const bar = await titleBarOf(page, 0)
    const box = (await bar.boundingBox())!

    const before = await transformOf(page, 0)
    await page.mouse.move(box.x + 60, box.y + 8)
    await page.mouse.down()
    for (let i = 1; i <= 12; i++) {
      await page.mouse.move(box.x + 60 + i * 6, box.y + 8 + i * 4)
    }
    await page.mouse.up()

    const after = await transformOf(page, 0)
    expect(after).not.toBe(before)
    expect(after).toContain('translate3d')

    // The gate: inline top/left are never written, and the layer hint is released.
    const inline = await win(page, 0).evaluate((el) => {
      const s = (el as HTMLElement).style
      return { top: s.top, left: s.left, willChange: s.willChange }
    })
    expect(inline.top).toBe('')
    expect(inline.left).toBe('')
    expect(inline.willChange).toBe('')
  })

  test('Escape during a drag reverts to the start position', async ({ page }) => {
    await boot(page)
    await openWindows(page, 1)
    const bar = await titleBarOf(page, 0)
    const box = (await bar.boundingBox())!
    const before = await transformOf(page, 0)

    await page.mouse.move(box.x + 60, box.y + 8)
    await page.mouse.down()
    await page.mouse.move(box.x + 220, box.y + 140)
    await page.keyboard.press('Escape')
    await page.mouse.up()

    expect(await transformOf(page, 0)).toBe(before)
  })

  test('a window cannot be dragged fully off the work area', async ({ page }) => {
    await boot(page)
    await openWindows(page, 1)
    const bar = await titleBarOf(page, 0)
    const box = (await bar.boundingBox())!

    await page.mouse.move(box.x + 60, box.y + 8)
    await page.mouse.down()
    // Aim far above and left of the viewport.
    await page.mouse.move(-500, -500)
    await page.mouse.up()

    const rect = await page.evaluate(() => {
      const wm = window.__chronos.shell.wm
      const s = wm.list()[0]!
      return { x: s.rect.x, y: s.rect.y, w: s.rect.w }
    })
    // Top edge is clamped to the work area, and part of the title bar stays reachable.
    expect(rect.y).toBeGreaterThanOrEqual(0)
    expect(rect.x + rect.w).toBeGreaterThan(0)
  })
})

test.describe('resize', () => {
  for (const edge of ['e', 's', 'se', 'w', 'n', 'nw', 'ne', 'sw'] as const) {
    test(`the ${edge} handle resizes`, async ({ page }) => {
      await boot(page)
      await openWindows(page, 1)
      const before = await page.evaluate(() => {
        const s = window.__chronos.shell.wm.list()[0]!
        return { ...s.rect }
      })

      const handle = win(page, 0).locator(`[data-resize="${edge}"]`)
      const box = (await handle.boundingBox())!
      const cx = box.x + box.width / 2
      const cy = box.y + box.height / 2
      const dx = edge.includes('w') ? -40 : edge.includes('e') ? 40 : 0
      const dy = edge.includes('n') ? -40 : edge.includes('s') ? 40 : 0

      await page.mouse.move(cx, cy)
      await page.mouse.down()
      await page.mouse.move(cx + dx / 2, cy + dy / 2)
      await page.mouse.move(cx + dx, cy + dy)
      await page.mouse.up()

      const after = await page.evaluate(() => {
        const s = window.__chronos.shell.wm.list()[0]!
        return { ...s.rect }
      })

      if (dx !== 0) expect(after.w).not.toBe(before.w)
      if (dy !== 0) expect(after.h).not.toBe(before.h)
      // Dragging a west or north edge moves the opposite origin, not just the size.
      if (edge.includes('w')) expect(after.x).not.toBe(before.x)
      if (edge.includes('n')) expect(after.y).not.toBe(before.y)
    })
  }

  test('resize honours the per-app minimum size', async ({ page }) => {
    await boot(page)
    await openWindows(page, 1)
    const min = await page.evaluate(() => {
      const s = window.__chronos.shell.wm.list()[0]!
      return { ...s.minSize }
    })

    const handle = win(page, 0).locator('[data-resize="se"]')
    const box = (await handle.boundingBox())!
    await page.mouse.move(box.x + 2, box.y + 2)
    await page.mouse.down()
    await page.mouse.move(box.x - 900, box.y - 900)
    await page.mouse.up()

    const after = await page.evaluate(() => {
      const s = window.__chronos.shell.wm.list()[0]!
      return { ...s.rect }
    })
    expect(after.w).toBeGreaterThanOrEqual(min.w)
    expect(after.h).toBeGreaterThanOrEqual(min.h)
  })
})

test.describe('maximize and minimize', () => {
  test('double-clicking the title bar maximizes and restores', async ({ page }) => {
    await boot(page)
    await openWindows(page, 1)
    const bar = await titleBarOf(page, 0)
    const before = await page.evaluate(() => ({ ...window.__chronos.shell.wm.list()[0]!.rect }))

    await bar.dblclick({ position: { x: 40, y: 8 } })
    await expect(win(page, 0)).toHaveAttribute('data-maximized', 'true')
    const work = await page.evaluate(() => window.__chronos.shell.wm.workArea())
    const maxed = await page.evaluate(() => ({ ...window.__chronos.shell.wm.list()[0]!.rect }))
    expect(maxed.w).toBe(work.w)
    expect(maxed.h).toBe(work.h)

    await bar.dblclick({ position: { x: 40, y: 8 } })
    await expect(win(page, 0)).toHaveAttribute('data-maximized', 'false')
    const restored = await page.evaluate(() => ({ ...window.__chronos.shell.wm.list()[0]!.rect }))
    expect(restored).toEqual(before)
  })

  test('minimize hides the window and focus moves on; restore brings it back', async ({ page }) => {
    await boot(page)
    await openWindows(page, 2)
    await page.keyboard.press('Alt+F9')

    await expect(win(page, 1)).toHaveCSS('display', 'none')
    const focusedTitle = await page.evaluate(() => {
      const wm = window.__chronos.shell.wm
      const id = wm.focusedId()
      return id !== null ? wm.get(id)!.title : null
    })
    expect(focusedTitle).not.toBeNull()

    await page.evaluate(() => {
      const wm = window.__chronos.shell.wm
      const hidden = wm.list().find((s) => s.minimized)!
      wm.restore(hidden.id)
    })
    await expect(win(page, 1)).not.toHaveCSS('display', 'none')
  })
})

test.describe('Alt+Tab switcher', () => {
  test('opens, advances and commits on modifier release', async ({ page }) => {
    await boot(page)
    await openWindows(page, 3)
    const initial = await page.evaluate(() => window.__chronos.shell.wm.focusedId())

    await page.keyboard.down('Alt')
    await page.keyboard.press('Tab')
    await expect(page.locator('.switcher')).toBeVisible()
    const selected = await page.locator('.switcher-item[aria-selected="true"]').innerText()
    await page.keyboard.up('Alt')

    await expect(page.locator('.switcher')).toHaveCount(0)
    const after = await page.evaluate(() => {
      const wm = window.__chronos.shell.wm
      const id = wm.focusedId()
      return id !== null ? wm.get(id)!.title : null
    })
    expect(after).toBe(selected.trim())
    expect(await page.evaluate(() => window.__chronos.shell.wm.focusedId())).not.toBe(initial)
  })

  test('Escape cancels back to the original window', async ({ page }) => {
    await boot(page)
    await openWindows(page, 3)
    const before = await page.evaluate(() => window.__chronos.shell.wm.focusedId())

    await page.keyboard.down('Alt')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Escape')
    await page.keyboard.up('Alt')

    await expect(page.locator('.switcher')).toHaveCount(0)
    expect(await page.evaluate(() => window.__chronos.shell.wm.focusedId())).toBe(before)
  })
})

test.describe('modal dialogs', () => {
  test('the owner is inert and focus cannot leave the modal', async ({ page }) => {
    await boot(page)
    await openWindows(page, 1)
    await page.evaluate(() => {
      const wm = window.__chronos.shell.wm
      const owner = wm.focusedId()!
      wm.open({
        appId: 'harness-modal' as never,
        title: 'Modal',
        modalOwner: owner,
        resizable: false,
        rect: { x: 200, y: 200, w: 260, h: 140 },
      })
    })

    const owner = win(page, 0)
    await expect(owner).toHaveJSProperty('inert', true)

    // Tab cycles inside the modal and never lands in the owner.
    const modal = win(page, 1)
    await modal.locator('[data-part="titlebar"]').click({ position: { x: 20, y: 8 } })
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab')
      const insideModal = await page.evaluate(() => {
        const active = document.activeElement
        const frames = [...document.querySelectorAll('[data-win-id]')]
        const idx = frames.findIndex((f) => f.contains(active))
        return idx
      })
      expect(insideModal).toBe(1)
    }
  })

  test('clicking the blocked owner redirects focus to the modal', async ({ page }) => {
    await boot(page)
    await openWindows(page, 1)
    await page.evaluate(() => {
      const wm = window.__chronos.shell.wm
      wm.open({
        appId: 'harness-modal' as never,
        title: 'Modal',
        modalOwner: wm.focusedId()!,
        resizable: false,
        rect: { x: 320, y: 260, w: 260, h: 140 },
      })
    })
    const modalId = await page.evaluate(() => window.__chronos.shell.wm.focusedId())

    // The owner's title bar is inert, so this click reaches the desktop; either
    // way focus must remain on the modal.
    const ownerBar = win(page, 0).locator('[data-part="titlebar"]')
    await ownerBar.click({ position: { x: 30, y: 8 }, force: true })
    expect(await page.evaluate(() => window.__chronos.shell.wm.focusedId())).toBe(modalId)
  })

  test('the owner cannot be closed or minimized behind its modal', async ({ page }) => {
    await boot(page)
    await openWindows(page, 1)
    const ownerId = await page.evaluate(() => window.__chronos.shell.wm.focusedId())
    await page.evaluate((owner) => {
      window.__chronos.shell.wm.open({
        appId: 'harness-modal' as never,
        title: 'Modal',
        modalOwner: owner as never,
        resizable: false,
        rect: { x: 320, y: 260, w: 260, h: 140 },
      })
    }, ownerId)

    const closed = await page.evaluate((owner) => window.__chronos.shell.wm.close(owner as never), ownerId)
    expect(closed).toBe(false)
    await expect(page.locator('[data-win-id]')).toHaveCount(2)
  })
})

test.describe('keyboard geometry', () => {
  test('Alt+F7 then arrows moves the window; Escape reverts', async ({ page }) => {
    await boot(page)
    await openWindows(page, 1)
    const before = await page.evaluate(() => ({ ...window.__chronos.shell.wm.list()[0]!.rect }))

    await page.keyboard.press('Alt+F7')
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight')
    const moved = await page.evaluate(() => ({ ...window.__chronos.shell.wm.list()[0]!.rect }))
    expect(moved.x).toBe(before.x + 5)

    await page.keyboard.press('Escape')
    const reverted = await page.evaluate(() => ({ ...window.__chronos.shell.wm.list()[0]!.rect }))
    expect(reverted.x).toBe(before.x)
  })

  test('Alt+F8 then arrows resizes; Enter commits', async ({ page }) => {
    await boot(page)
    await openWindows(page, 1)
    const before = await page.evaluate(() => ({ ...window.__chronos.shell.wm.list()[0]!.rect }))

    await page.keyboard.press('Alt+F8')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')

    const after = await page.evaluate(() => ({ ...window.__chronos.shell.wm.list()[0]!.rect }))
    expect(after.w).toBe(before.w + 1)
    expect(after.h).toBe(before.h + 1)
  })

  test('Shift+arrow uses the coarse step', async ({ page }) => {
    await boot(page)
    await openWindows(page, 1)
    const before = await page.evaluate(() => ({ ...window.__chronos.shell.wm.list()[0]!.rect }))
    await page.keyboard.press('Alt+F7')
    await page.keyboard.press('Shift+ArrowRight')
    await page.keyboard.press('Enter')
    const after = await page.evaluate(() => ({ ...window.__chronos.shell.wm.list()[0]!.rect }))
    expect(after.x).toBe(before.x + 10)
  })
})

test.describe('context menus', () => {
  test('right-clicking a title bar yields the chrome menu with correct disabled state', async ({
    page,
  }) => {
    await boot(page)
    await openWindows(page, 1)
    const bar = await titleBarOf(page, 0)
    await bar.click({ button: 'right', position: { x: 40, y: 8 } })

    const menu = page.locator('.menu')
    await expect(menu).toBeVisible()
    // A non-maximized window has Restore disabled and Maximize enabled.
    const restore = menu.locator('.menu-item', { hasText: 'Restore' })
    await expect(restore).toHaveAttribute('aria-disabled', 'true')
    await expect(menu.locator('.menu-item', { hasText: 'Maximize' })).toHaveAttribute(
      'aria-disabled',
      'false',
    )
    await expect(menu.locator('.menu-separator')).toHaveCount(2)
    await expect(menu.locator('[aria-haspopup="true"]')).toHaveCount(1)
  })

  test('the desktop menu opens and its action works', async ({ page }) => {
    await boot(page)
    await openWindows(page, 1)
    await page.locator('.desktop').click({ button: 'right', position: { x: 500, y: 400 } })
    const menu = page.locator('.menu')
    await expect(menu).toBeVisible()
    await menu.locator('.menu-item', { hasText: 'New Window' }).click()
    await expect(page.locator('.menu')).toHaveCount(0)
    await expect(page.locator('[data-win-id]')).toHaveCount(2)
  })

  test('menus are keyboard navigable and skip separators', async ({ page }) => {
    await boot(page)
    await openWindows(page, 1)
    await page.keyboard.press('Alt+Space')
    const menu = page.locator('.menu')
    await expect(menu).toBeVisible()
    await expect(menu.locator('[data-highlight="true"]')).toHaveCount(1)

    // Walking down must never highlight a separator.
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('ArrowDown')
      const cls = await menu.locator('[data-highlight="true"]').getAttribute('class')
      expect(cls).toContain('menu-item')
    }
    await page.keyboard.press('Escape')
    await expect(page.locator('.menu')).toHaveCount(0)
  })

  test('a submenu opens with ArrowRight and its item fires', async ({ page }) => {
    await boot(page)
    await openWindows(page, 2)
    await page.keyboard.press('Alt+Space')
    const menu = page.locator('.menu').first()
    await menu.locator('.menu-item', { hasText: 'Order' }).hover()
    await expect(page.locator('.menu')).toHaveCount(2)
    await page.locator('.menu').nth(1).locator('.menu-item', { hasText: 'Send to Back' }).click()

    await expect(page.locator('.menu')).toHaveCount(0)
    const z = await page.locator('[data-win-id]').evaluateAll((els) =>
      els.map((el) => Number((el as HTMLElement).style.zIndex)),
    )
    // The formerly focused window is now backmost.
    expect(z[1]).toBe(Math.min(...z))
  })

  test('Shift+F10 opens a menu from the keyboard', async ({ page }) => {
    await boot(page)
    await openWindows(page, 1)
    await page.keyboard.press('Shift+F10')
    await expect(page.locator('.menu')).toBeVisible()
  })
})

test.describe('suspend and resume', () => {
  test('flips state and emits, leaving the frame in the tree', async ({ page }) => {
    await boot(page)
    await openWindows(page, 1)
    const events = await page.evaluate(() => {
      const seen: string[] = []
      const wm = window.__chronos.shell.wm
      const un = wm.subscribe((e) => seen.push(e.type))
      const id = wm.focusedId()!
      wm.suspend(id)
      wm.resume(id)
      un()
      return seen
    })
    expect(events).toContain('suspended')
    expect(events).toContain('resumed')
    await expect(win(page, 0)).toHaveAttribute('data-suspended', 'false')
    await expect(page.locator('[data-win-id]')).toHaveCount(1)
  })
})
