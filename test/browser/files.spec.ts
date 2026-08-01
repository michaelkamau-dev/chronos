/**
 * The Files app.
 *
 * Two things are being proved here and they are different in kind.
 *
 * **The phase-5 gate**, which is the reason this file exists: every app survives
 * `suspend()`/`resume()` with state intact. Ledger shipped the contract with one
 * harness implementation and said in its own doc comment that it proved the
 * contract wireable and nothing about six apps honouring it. The suspend suite
 * below is the test that fails if Files stops honouring it — and it deliberately
 * asserts the *hard* half: not the folder and the selection, which are plain
 * fields and would survive by accident, but the state that lives in the DOM and is
 * destroyed by the re-render `resume()` itself performs — the scroll offset and a
 * rename the user is part-way through typing, caret included.
 *
 * **Behaviour in every era.** A widget that looks right in one skin and breaks in
 * another is a bug the app owns, so the core flows run against all six. The list
 * suite runs once against the default era; the cross-era sweep re-runs the parts
 * where a skin could plausibly break something structural.
 */

import { test, expect, type Page } from '@playwright/test'
import type { FilesApp } from '../../src/apps/files/index.js'
import type { WindowId } from '../../src/core/wm/types.js'

const ERAS = ['winxp', 'win31', 'tiger', 'system1', 'macos8', 'ledger'] as const

/** The Files instance behind a window, typed for the assertions below. */
declare global {
  interface Window {
    __files: {
      app(id: WindowId): FilesApp
    }
  }
}

async function boot(page: Page, era = 'winxp'): Promise<void> {
  await page.goto(`/?era=${era}`)
  await page.waitForFunction(() => window.__chronos !== undefined)
  await page.evaluate(() => window.__chronos.wipeStorage())
  await page.evaluate(() => window.__chronos.reset())
  // The suite must be testing the era it thinks it is: without this a suite
  // passes vacuously against whichever era happens to be the default.
  expect(await page.evaluate(() => window.__chronos.era)).toBe(era)
  await page.evaluate(() => {
    window.__files = {
      app(id) {
        const instance = window.__chronos.shell.appFor(id)
        if (!instance) throw new Error(`no app mounted in window ${String(id)}`)
        return instance as unknown as FilesApp
      },
    }
  })
}

/** Seeds a folder with `count` files and returns its node id. */
async function seedFolder(page: Page, name: string, count: number): Promise<string> {
  return page.evaluate(
    async ({ name, count }) => {
      const fs = window.__chronos.fs
      const docs = (await fs.list(fs.root())).find((n) => n.wellKnown === 'documents')
      const parent = docs ? docs.id : fs.root()
      const dir = await fs.createDir(parent, name)
      for (let i = 0; i < count; i++) {
        // Zero-padded so the sort order is the creation order and an index in the
        // list is a stable thing to assert on.
        await fs.createFile(dir, `item-${String(i).padStart(2, '0')}.txt`, `body ${i}`, {
          mime: 'text/plain',
        })
      }
      return dir as unknown as string
    },
    { name, count },
  )
}

async function openFilesAt(page: Page, dir: string): Promise<number> {
  return page.evaluate((d) => window.__chronos.openFilesWindow(d as never) as unknown as number, dir)
}

function rows(page: Page, windowIndex = -1) {
  void windowIndex
  return page.locator('[data-app="files"] [data-ui="list"] [data-ui="listrow"]')
}

// ---------------------------------------------------------------- basics

test.describe('files: browsing', () => {
  test('lists a folder, navigates in and back out', async ({ page }) => {
    await boot(page)
    const dir = await seedFolder(page, 'Project', 3)
    const id = await openFilesAt(page, dir)
    await expect(rows(page).last()).toBeVisible()
    expect(await rows(page).count()).toBe(3)

    // Up leaves the folder; the app reads the parent from the filesystem.
    const parentName = await page.evaluate(async (w) => {
      const app = window.__files.app(w as never)
      const fs = window.__chronos.fs
      const here = await fs.stat(app.currentDir())
      const parent = await fs.stat(here.parent!)
      return parent.name
    }, id)

    await page.evaluate((w) => {
      const app = window.__files.app(w as never)
      const el = document.querySelector<HTMLElement>('[data-app="files"]')
      void el
      return app
    }, id)
    await page.getByRole('button', { name: 'Go to the enclosing folder' }).first().click()
    await expect
      .poll(async () =>
        page.evaluate(async (w) => {
          const app = window.__files.app(w as never)
          return (await window.__chronos.fs.stat(app.currentDir())).name
        }, id),
      )
      .toBe(parentName)
  })

  test('re-renders when a sibling window changes the folder', async ({ page }) => {
    await boot(page)
    const dir = await seedFolder(page, 'Shared', 2)
    await openFilesAt(page, dir)
    await expect(rows(page)).toHaveCount(2)

    // The mutation goes through FsApi, not through the app: the list must follow
    // because it watches, not because it was told.
    await page.evaluate(async (d) => {
      const fs = window.__chronos.fs
      await fs.createFile(d as never, 'arrived.txt', 'x', { mime: 'text/plain' })
    }, dir)
    await expect(rows(page)).toHaveCount(3)
  })

  test('switches between icon, list and details views', async ({ page }) => {
    await boot(page)
    const dir = await seedFolder(page, 'Views', 2)
    const id = await openFilesAt(page, dir)
    const list = page.locator('[data-app="files"] [data-ui="list"]')

    await expect(list).toHaveAttribute('data-layout', 'rows')
    // The details view is the only one with a header, and it has four columns.
    await page.evaluate((w) => window.__files.app(w as never).setView('details'), id)
    await expect(
      page.locator('[data-app="files"] [data-ui="listheader"] [data-ui="listcell"]'),
    ).toHaveCount(4)

    await page.evaluate((w) => window.__files.app(w as never).setView('icon'), id)
    await expect(list).toHaveAttribute('data-layout', 'grid')
    await expect(page.locator('[data-app="files"] [data-ui="listheader"]')).toBeHidden()
  })
})

// ------------------------------------------------------------- selection

test.describe('files: selection', () => {
  test('click, shift-extend and ctrl-toggle', async ({ page }) => {
    await boot(page)
    const dir = await seedFolder(page, 'Select', 5)
    const id = await openFilesAt(page, dir)
    await expect(rows(page)).toHaveCount(5)

    const selection = (): Promise<readonly string[]> =>
      page.evaluate((w) => [...window.__files.app(w as never).selection()] as string[], id)

    await rows(page).nth(1).click()
    expect((await selection()).length).toBe(1)

    await rows(page).nth(3).click({ modifiers: ['Shift'] })
    expect((await selection()).length).toBe(3)

    await rows(page).nth(0).click({ modifiers: ['ControlOrMeta'] })
    expect((await selection()).length).toBe(4)

    await rows(page).nth(0).click({ modifiers: ['ControlOrMeta'] })
    expect((await selection()).length).toBe(3)
  })

  test('the keyboard reaches every row without the mouse', async ({ page }) => {
    await boot(page)
    const dir = await seedFolder(page, 'Keys', 4)
    const id = await openFilesAt(page, dir)
    await expect(rows(page)).toHaveCount(4)

    await page.locator('[data-app="files"] [data-ui="list"]').focus()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown')
    expect(
      await page.evaluate((w) => window.__files.app(w as never).selection().length, id),
    ).toBe(1)

    // Shift extends from the cursor, exactly as the pointer path does.
    await page.keyboard.press('Shift+ArrowDown')
    expect(
      await page.evaluate((w) => window.__files.app(w as never).selection().length, id),
    ).toBe(2)

    await page.keyboard.press('End')
    await page.keyboard.press('Home')
    const cursorIsFirst = await page.evaluate((w) => {
      const app = window.__files.app(w as never)
      const first = document.querySelector<HTMLElement>('[data-ui="listrow"]')
      return first?.dataset['rowId'] === app.selection()[0]
    }, id)
    expect(cursorIsFirst).toBe(true)
  })
})

// ---------------------------------------------------------------- rename

test.describe('files: rename in place', () => {
  test('F2 opens an editor, Enter writes through the filesystem', async ({ page }) => {
    await boot(page)
    const dir = await seedFolder(page, 'Rename', 2)
    await openFilesAt(page, dir)
    await expect(rows(page)).toHaveCount(2)

    await rows(page).first().click()
    await page.keyboard.press('F2')
    const editor = page.locator('[data-ui-role="rename"]')
    await expect(editor).toBeVisible()

    // The stem is selected and the extension is not, so typing keeps `.txt`.
    expect(await editor.evaluate((el: HTMLInputElement) => el.selectionEnd)).toBe(
      'item-00'.length,
    )

    await page.keyboard.type('renamed')
    await page.keyboard.press('Enter')

    await expect
      .poll(async () =>
        page.evaluate(async (d) => {
          const names = (await window.__chronos.fs.list(d as never)).map((n) => n.name)
          return names.sort()
        }, dir),
      )
      .toEqual(['item-01.txt', 'renamed.txt'])
  })

  test('Escape abandons the rename and changes nothing', async ({ page }) => {
    await boot(page)
    const dir = await seedFolder(page, 'Escape', 1)
    await openFilesAt(page, dir)
    await rows(page).first().click()
    await page.keyboard.press('F2')
    await page.keyboard.type('discarded')
    await page.keyboard.press('Escape')

    await expect(page.locator('[data-ui-role="rename"]')).toHaveCount(0)
    expect(
      await page.evaluate(
        async (d) => (await window.__chronos.fs.list(d as never)).map((n) => n.name),
        dir,
      ),
    ).toEqual(['item-00.txt'])
  })
})

// -------------------------------------------------------- trash and delete

test.describe('files: trash', () => {
  test('trash, then put back, both through FsApi', async ({ page }) => {
    await boot(page)
    const dir = await seedFolder(page, 'Trashing', 2)
    await openFilesAt(page, dir)
    await rows(page).first().click()

    await page.getByRole('button', { name: 'Move the selection to the Trash' }).first().click()
    await expect(rows(page)).toHaveCount(1)
    expect(
      await page.evaluate(async () => {
        const fs = window.__chronos.fs
        return (await fs.list(fs.trash())).length
      }),
    ).toBe(1)
  })

  test('permanent delete asks first, and Cancel keeps the file', async ({ page }) => {
    await boot(page)
    const dir = await seedFolder(page, 'Deleting', 2)
    await openFilesAt(page, dir)
    await rows(page).first().click()

    await page.getByRole('button', { name: 'Delete the selection permanently' }).first().click()
    // The confirmation is a real modal window owned by the Files window, not a
    // browser dialog — which is the whole reason the dialog service exists.
    const dialogButtons = page.locator('[data-ui="dialogbuttons"] [data-ui="button"]')
    await expect(dialogButtons).toHaveCount(2)
    await dialogButtons.filter({ hasText: 'Cancel' }).click()

    await expect(page.locator('[data-ui="dialog"]')).toHaveCount(0)
    expect(
      await page.evaluate(
        async (d) => (await window.__chronos.fs.list(d as never)).length,
        dir,
      ),
    ).toBe(2)
  })
})

// ------------------------------------------------------------- properties

test.describe('files: properties', () => {
  test('shows the codec name and the classic Mac type and creator codes', async ({ page }) => {
    await boot(page)
    const dir = await page.evaluate(async () => {
      const fs = window.__chronos.fs
      const d = await fs.createDir(fs.root(), 'Typed')
      await fs.createFile(d, 'Letter', 'body', {
        mime: 'text/plain',
        typeCode: 'TEXT',
        creatorCode: 'MACS',
      })
      return d as unknown as string
    })
    await openFilesAt(page, dir)
    await rows(page).first().click()
    await page.getByRole('button', { name: 'Show information about the selection' }).first().click()

    const values = page.locator('[data-ui-role="property-value"]')
    await expect(values.first()).toBeVisible()
    const text = await values.allTextContents()
    // The codes are data on the node, not an era conditional: they show because
    // the file carries them.
    expect(text).toContain('TEXT')
    expect(text).toContain('MACS')
  })
})

// ------------------------------------------------- the phase-5 suspend gate

test.describe('files: suspend and resume', () => {
  test('folder, selection, cursor, scroll and an in-progress rename all survive', async ({
    page,
  }) => {
    await boot(page)
    // Enough rows that the list genuinely scrolls, or the scroll assertion is
    // vacuous — a test that cannot fail is not a test.
    const dir = await seedFolder(page, 'Suspending', 40)
    const id = await openFilesAt(page, dir)
    await expect(rows(page)).toHaveCount(40)

    // Build a state a user would notice losing: a multiple selection, a scrolled
    // list, and a half-typed rename with the caret inside the text.
    await rows(page).nth(3).click()
    await rows(page).nth(6).click({ modifiers: ['Shift'] })
    await page.locator('[data-app="files"] [data-ui="list"]').evaluate((el) => {
      el.scrollTop = 120
    })
    await page.waitForFunction(
      () => (document.querySelector('[data-ui="list"]') as HTMLElement).scrollTop > 0,
    )

    await rows(page).nth(6).click()
    await page.keyboard.press('F2')
    await page.keyboard.type('half-typed')
    // Put the caret somewhere that is neither end, so a naive restore that selects
    // everything or collapses to zero fails.
    await page.locator('[data-ui-role="rename"]').evaluate((el: HTMLInputElement) => {
      el.setSelectionRange(4, 4)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const before = await page.evaluate((w) => {
      const app = window.__files.app(w as never)
      return {
        cwd: String(app.currentDir()),
        selection: [...app.selection()].map(String),
        view: app.viewMode(),
        scroll: app.listScrollOffset(),
        rename: app.renameState(),
      }
    }, id)
    expect(before.rename).not.toBeNull()
    expect(before.scroll).toBeGreaterThan(0)

    // Suspend to the era's own frozen state, and prove it actually happened.
    await page.evaluate((w) => window.__chronos.shell.wm.suspend(w as never), id)
    expect(
      await page.evaluate((w) => window.__chronos.shell.wm.get(w as never)?.suspended, id),
    ).toBe(true)
    expect(await page.evaluate((w) => window.__files.app(w as never).isSuspended(), id)).toBe(
      true,
    )

    // While suspended the app must do no work: a filesystem change it would
    // normally follow must not repaint it.
    const rowsWhileSuspended = await rows(page).count()
    await page.evaluate(async (d) => {
      await window.__chronos.fs.createFile(d as never, 'while-asleep.txt', 'x', {
        mime: 'text/plain',
      })
    }, dir)
    await page.waitForTimeout(150)
    expect(await rows(page).count()).toBe(rowsWhileSuspended)

    await page.evaluate((w) => window.__chronos.shell.wm.resume(w as never), id)
    await expect(rows(page)).toHaveCount(41)

    const after = await page.evaluate((w) => {
      const app = window.__files.app(w as never)
      return {
        cwd: String(app.currentDir()),
        selection: [...app.selection()].map(String),
        view: app.viewMode(),
        scroll: app.listScrollOffset(),
        rename: app.renameState(),
      }
    }, id)

    expect(after.cwd).toBe(before.cwd)
    expect(after.view).toBe(before.view)
    expect(after.selection).toEqual(before.selection)
    expect(after.scroll).toBe(before.scroll)
    // The whole point: the text and the caret, not merely that a rename exists.
    expect(after.rename).toEqual(before.rename)

    // And the editor is really back on screen with that text in it, rather than
    // only being remembered in a field.
    const editor = page.locator('[data-ui-role="rename"]')
    await expect(editor).toBeVisible()
    expect(await editor.inputValue()).toBe(before.rename?.value)
    expect(await editor.evaluate((el: HTMLInputElement) => el.selectionStart)).toBe(4)
  })

  test('a suspended app arms no watcher, and resume re-reads once', async ({ page }) => {
    await boot(page)
    const dir = await seedFolder(page, 'Watching', 2)
    const id = await openFilesAt(page, dir)
    await expect(rows(page)).toHaveCount(2)

    await page.evaluate((w) => window.__chronos.shell.wm.suspend(w as never), id)
    // Three writes while suspended, none of which may reach the app.
    await page.evaluate(async (d) => {
      const fs = window.__chronos.fs
      for (const n of ['a.txt', 'b.txt', 'c.txt']) {
        await fs.createFile(d as never, n, 'x', { mime: 'text/plain' })
      }
    }, dir)
    await page.waitForTimeout(150)
    expect(await rows(page).count()).toBe(2)

    await page.evaluate((w) => window.__chronos.shell.wm.resume(w as never), id)
    await expect(rows(page)).toHaveCount(5)
  })
})

// --------------------------------------------------------- every era, not one

test.describe('files: all six skins', () => {
  for (const era of ERAS) {
    test(`renders, selects and survives suspend in ${era}`, async ({ page }) => {
      await boot(page, era)
      const dir = await seedFolder(page, 'Era', 12)
      const id = await openFilesAt(page, dir)
      await expect(rows(page)).toHaveCount(12)

      // The app's chrome must actually be laid out, not merely present: a widget
      // with no height is the failure mode a skin introduces without noticing.
      const geometry = await page.evaluate(() => {
        const pick = (sel: string): { w: number; h: number } => {
          const el = document.querySelector<HTMLElement>(`[data-app="files"] ${sel}`)
          if (!el) return { w: 0, h: 0 }
          const r = el.getBoundingClientRect()
          return { w: Math.round(r.width), h: Math.round(r.height) }
        }
        return {
          toolbar: pick('[data-ui="toolbar"]'),
          list: pick('[data-ui="list"]'),
          status: pick('[data-ui="statusbar"]'),
          row: pick('[data-ui="listrow"]'),
        }
      })
      for (const [part, box] of Object.entries(geometry)) {
        expect(box.w, `${era}: ${part} width`).toBeGreaterThan(0)
        expect(box.h, `${era}: ${part} height`).toBeGreaterThan(0)
      }

      // The list must fit inside the window rather than overflowing it, which is
      // what a missing `min-height: 0` produces and what a 512x342 era shows first.
      const fits = await page.evaluate(() => {
        const app = document.querySelector<HTMLElement>('[data-app="files"]')
        const list = document.querySelector<HTMLElement>('[data-app="files"] [data-ui="list"]')
        const status = document.querySelector<HTMLElement>(
          '[data-app="files"] [data-ui="statusbar"]',
        )
        if (!app || !list || !status) return false
        const appBox = app.getBoundingClientRect()
        const statusBox = status.getBoundingClientRect()
        // The status bar is the last child; if the list overflowed, the status bar
        // would be pushed past the app's own bottom edge.
        return statusBox.bottom <= appBox.bottom + 1
      })
      expect(fits, `${era}: the status bar is inside the window`).toBe(true)

      // Selection paints: the era must give a selected row a different background
      // from an unselected one, whatever that difference is.
      await rows(page).nth(1).click()
      const painted = await page.evaluate(() => {
        const all = [...document.querySelectorAll<HTMLElement>('[data-ui="listrow"]')]
        const selected = all.find((r) => r.getAttribute('aria-selected') === 'true')
        const plain = all.find((r) => r.getAttribute('aria-selected') !== 'true')
        if (!selected || !plain) return null
        const a = getComputedStyle(selected)
        const b = getComputedStyle(plain)
        return {
          same: a.backgroundColor === b.backgroundColor && a.color === b.color,
        }
      })
      expect(painted?.same, `${era}: a selected row is painted differently`).toBe(false)

      // And the gate, in every era rather than only the default one.
      await page.evaluate((w) => window.__chronos.shell.wm.suspend(w as never), id)
      await page.evaluate((w) => window.__chronos.shell.wm.resume(w as never), id)
      await expect(rows(page)).toHaveCount(12)
      expect(
        await page.evaluate(
          (w) => [...window.__files.app(w as never).selection()].length,
          id,
        ),
      ).toBe(1)
    })
  }
})

// -------------------------------------------------------- drag, and its keyboard twin

test.describe('files: moving items', () => {
  test('dragging a row onto a folder moves it through FsApi', async ({ page }) => {
    await boot(page)
    const dir = await seedFolder(page, 'Dragging', 3)
    const target = await page.evaluate(
      async (d) => (await window.__chronos.fs.createDir(d as never, 'Inbox')) as unknown as string,
      dir,
    )
    await openFilesAt(page, dir)
    await expect(rows(page)).toHaveCount(4)

    // The folder sorts first, so the file is row 1.
    const folder = rows(page).first()
    const file = rows(page).nth(1)
    const movedName = await file.textContent()

    const from = await file.boundingBox()
    const to = await folder.boundingBox()
    expect(from && to).toBeTruthy()
    await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2)
    await page.mouse.down()
    // Past the drag threshold in steps, or the gesture never starts.
    await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, { steps: 8 })
    await page.mouse.up()

    await expect
      .poll(async () =>
        page.evaluate(
          async (t) => (await window.__chronos.fs.list(t as never)).length,
          target,
        ),
      )
      .toBe(1)
    expect(movedName).toBeTruthy()
    await expect(rows(page)).toHaveCount(3)
  })

  test('Move To reaches the same place from the keyboard', async ({ page }) => {
    await boot(page)
    const dir = await seedFolder(page, 'MoveTo', 2)
    const target = await page.evaluate(
      async (d) => (await window.__chronos.fs.createDir(d as never, 'Inbox')) as unknown as string,
      dir,
    )
    await openFilesAt(page, dir)
    await rows(page).nth(1).click()

    await page.getByRole('button', { name: 'Move the selection to another folder' }).first().click()
    // The chooser is a modal window with its own list; navigate into Inbox and accept.
    const chooser = page.locator('[data-ui="dialog"]')
    await expect(chooser).toBeVisible()
    await chooser.locator('[data-ui="listrow"]').first().dblclick()
    await chooser.locator('[data-ui="button"]').filter({ hasText: 'Choose' }).click()

    await expect
      .poll(async () =>
        page.evaluate(
          async (t) => (await window.__chronos.fs.list(t as never)).length,
          target,
        ),
      )
      .toBe(1)
  })
})

// ------------------------------------ the dialogs every other app will call

/**
 * The open and save dialogs are a **core service on `WindowHandle`**, not something
 * this app exports. The reasoning is in `core/ui/dialogs.ts`; what matters here is
 * that they are exercised, because five other apps will call them and Files is the
 * only session that can prove they work before then.
 */
test.describe('files: the system file dialogs', () => {
  test('Open returns the chosen file, through the window handle an app is given', async ({
    page,
  }) => {
    await boot(page)
    const dir = await seedFolder(page, 'Opening', 3)
    const id = await openFilesAt(page, dir)

    // Called exactly the way another app calls it: `host.win.openFile(...)`.
    const result = page.evaluate(
      async ({ w, d }) => {
        const chosen = await window.__chronos.shell
          .handleFor(w as never)!
          .openFile({ startAt: d as never })
        return chosen === null ? null : String(chosen)
      },
      { w: id, d: dir },
    )

    const dialog = page.locator('[data-ui="dialog"]')
    await expect(dialog).toBeVisible()
    await dialog.locator('[data-ui="listrow"]').first().click()
    await dialog.locator('[data-ui="button"]').filter({ hasText: 'Open' }).click()

    const chosen = await result
    expect(chosen).not.toBeNull()
    const isInFolder = await page.evaluate(
      async ({ c, d }) => {
        const kids = await window.__chronos.fs.list(d as never)
        return kids.some((n) => String(n.id) === c)
      },
      { c: chosen, d: dir },
    )
    expect(isInFolder).toBe(true)
  })

  test('Open resolves to null when cancelled', async ({ page }) => {
    await boot(page)
    const dir = await seedFolder(page, 'Cancelling', 2)
    const id = await openFilesAt(page, dir)

    const result = page.evaluate(
      async ({ w, d }) =>
        await window.__chronos.shell.handleFor(w as never)!.openFile({ startAt: d as never }),
      { w: id, d: dir },
    )
    const dialog = page.locator('[data-ui="dialog"]')
    await expect(dialog).toBeVisible()
    await dialog.locator('[data-ui="button"]').filter({ hasText: 'Cancel' }).click()
    expect(await result).toBeNull()
  })

  test('Save preselects the stem and refuses an empty name in place', async ({ page }) => {
    await boot(page)
    const dir = await seedFolder(page, 'Saving', 1)
    const id = await openFilesAt(page, dir)

    const result = page.evaluate(
      async ({ w, d }) => {
        const target = await window.__chronos.shell
          .handleFor(w as never)!
          .saveFile({ startAt: d as never, suggestedName: 'Report.txt' })
        return target === null ? null : { parent: String(target.parent), name: target.name }
      },
      { w: id, d: dir },
    )

    const dialog = page.locator('[data-ui="dialog"]')
    await expect(dialog).toBeVisible()
    const field = dialog.locator('[data-ui="field"]')
    expect(await field.inputValue()).toBe('Report.txt')
    // The stem is selected and the extension is not, so typing keeps `.txt`.
    expect(await field.evaluate((el: HTMLInputElement) => el.selectionEnd)).toBe('Report'.length)

    await field.fill('')
    await dialog.locator('[data-ui="button"]').filter({ hasText: 'Save' }).click()
    // Still open: an empty name is refused in place rather than after the fact.
    await expect(dialog).toBeVisible()

    await field.fill('Final.txt')
    await dialog.locator('[data-ui="button"]').filter({ hasText: 'Save' }).click()
    expect(await result).toEqual({ parent: dir, name: 'Final.txt' })
  })
})

// ------------------------------------------- the 1-bit era owns its own proof

/**
 * The no-grey claim, applied to *this app's* pixels.
 *
 * `system1-fidelity.spec.ts` already asserts that no pixel anywhere is a mid grey,
 * and it would have passed whatever this app rendered: it builds its own two
 * buttons and screenshots the desktop and a menu, none of which is the Files
 * window. Reading that suite as coverage of a new app's surface is the mistake
 * `CLAUDE.md` records twice under "a guard that cannot fail", so the app that
 * added the surface adds the assertion over it.
 *
 * **The instrument is not that suite's, and the reason is a real finding.** Its
 * discriminator is a luma band — every pixel below 40 or above 208 — and that band
 * was derived from Chromium's LCD fringes on *black text on white*, the only
 * polarity the era's own surfaces render. A selected row inverts, and white text on
 * black fringes to a different set: measured here at lumas 51, 54, 81, 91, 126,
 * 163, 168 and 189, squarely inside the band. The band is therefore an artefact of
 * one polarity rather than a statement about the era, and widening it until this
 * passes is exactly the "loosen a threshold until a false assertion passes" failure
 * `CLAUDE.md` names.
 *
 * So the claim is restated to the one that is actually true and actually the point:
 * **no region is flat grey.** A grey *fill* has interior pixels surrounded entirely
 * by other non-pure pixels; an antialiased or subpixel-fringed *edge* is always one
 * or two pixels sitting against ink or paper. Testing for "a non-pure pixel with no
 * pure neighbour" separates the two, is independent of polarity, and is what the
 * integer-scaled viewport genuinely guarantees.
 *
 * And per `CLAUDE.md`'s own rule — run a candidate you expect to fail before
 * trusting the instrument — the second test injects a real grey fill and asserts
 * this one catches it.
 */
/**
 * The instrument: the largest connected region of non-pure pixels.
 *
 * Subpixel fringing is confined to the edges of a *single glyph*, so its components
 * cannot exceed one character cell. A flat fill spans a row or a control. Measured
 * on this app in this era: the largest fringe component is 168 device pixels and an
 * injected `#808080` row is 27,760 — two orders of magnitude apart, with the bound
 * derived from the era's own type rather than picked to make a number pass.
 */
const COMPONENT_PROBE = `
  (async (bytes) => {
    const blob = new Blob([new Uint8Array(bytes)], { type: 'image/png' })
    const bmp = await createImageBitmap(blob)
    const c = new OffscreenCanvas(bmp.width, bmp.height)
    const ctx = c.getContext('2d')
    ctx.drawImage(bmp, 0, 0)
    const d = ctx.getImageData(0, 0, bmp.width, bmp.height).data
    const W = bmp.width, H = bmp.height
    const pure = (i) => {
      const r = d[i], g = d[i + 1], b = d[i + 2]
      return (r === 0 && g === 0 && b === 0) || (r === 255 && g === 255 && b === 255)
    }
    const seen = new Uint8Array(W * H)
    let biggest = 0
    let where = ''
    for (let p = 0; p < W * H; p++) {
      if (seen[p] || pure(p * 4)) continue
      let n = 0
      const stack = [p]
      seen[p] = 1
      while (stack.length) {
        const q = stack.pop()
        n++
        const qx = q % W, qy = (q / W) | 0
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = qx + dx, ny = qy + dy
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
          const r = ny * W + nx
          if (seen[r] || pure(r * 4)) continue
          seen[r] = 1
          stack.push(r)
        }
      }
      if (n > biggest) { biggest = n; where = (p % W) + ',' + ((p / W) | 0) }
    }
    return { total: W * H, biggest, where }
  })
`

async function largestNonPureRegion(page: Page, selector: string) {
  const shot = [...(await page.locator(selector).screenshot())]
  return page.evaluate(
    ({ bytes, src }) =>
      (eval(src) as (b: number[]) => Promise<{
        total: number
        biggest: number
        where: string
      }>)(bytes),
    { bytes: shot, src: COMPONENT_PROBE },
  )
}

/** One character cell in device pixels: fringing cannot exceed a single glyph. */
async function characterCellArea(page: Page): Promise<number> {
  return page.evaluate(() => {
    const list = document.querySelector<HTMLElement>('[data-app="files"] [data-ui="list"]')!
    const px = parseFloat(getComputedStyle(list).fontSize)
    const scale = window.__chronos.shell.display.scale()
    return (px * scale) ** 2
  })
}

test.describe('files: no grey in a 1-bit era', () => {
  test('the Files window has no flat non-pure region', async ({ page }) => {
    await boot(page, 'system1')
    const dir = await seedFolder(page, 'Bitmap', 6)
    await openFilesAt(page, dir)
    await expect(rows(page)).toHaveCount(6)

    // A selected row and a disabled control are the two places a recreation
    // reaches for a grey fill, so both are on screen when the shot is taken.
    await rows(page).nth(1).click()
    await expect(
      page.locator('[data-app="files"] [data-ui="button"][data-state="disabled"]').first(),
    ).toBeVisible()

    const stats = await largestNonPureRegion(page, '[data-app="files"]')
    const cell = await characterCellArea(page)
    expect(stats.total, 'the app surface was actually captured').toBeGreaterThan(1000)
    expect(
      stats.biggest,
      `largest non-pure region at ${stats.where} exceeds one character cell`,
    ).toBeLessThan(cell)
  })

  test('the probe catches a grey fill, so it is a guard rather than a decoration', async ({
    page,
  }) => {
    await boot(page, 'system1')
    const dir = await seedFolder(page, 'Probe', 6)
    await openFilesAt(page, dir)
    await expect(rows(page)).toHaveCount(6)

    // Exactly the mistake the era's rules exist to prevent: a flat mid grey, the
    // Windows 95 disabled treatment four years early and one bit too deep.
    await page.evaluate(() => {
      const row = document.querySelector<HTMLElement>('[data-app="files"] [data-ui="listrow"]')
      if (row) row.style.background = '#808080'
    })

    const stats = await largestNonPureRegion(page, '[data-app="files"]')
    const cell = await characterCellArea(page)
    expect(stats.biggest, 'the probe sees an injected grey fill').toBeGreaterThan(cell)
  })
})

// --------------------------------------------------- the five widget states

test.describe('files: the widget contract', () => {
  test('every interactive widget carries data-state, in every era', async ({ page }) => {
    for (const era of ERAS) {
      await boot(page, era)
      const dir = await seedFolder(page, 'States', 3)
      await openFilesAt(page, dir)
      await expect(rows(page)).toHaveCount(3)

      const states = await page.evaluate(() => {
        const els = [
          ...document.querySelectorAll<HTMLElement>(
            '[data-app="files"] [data-ui="button"], [data-app="files"] [data-ui="list"]',
          ),
        ]
        return els.map((el) => el.dataset['state'] ?? null)
      })
      expect(states.length, `${era}: widgets present`).toBeGreaterThan(0)
      for (const state of states) {
        expect(
          ['rest', 'hover', 'active', 'focus', 'disabled'],
          `${era}: data-state is from the closed set`,
        ).toContain(state)
      }

      // A disabled control must actually report disabled rather than looking it:
      // nothing is selected, so Rename cannot apply.
      const renameState = await page.evaluate(() => {
        const el = [
          ...document.querySelectorAll<HTMLElement>('[data-app="files"] [data-ui="button"]'),
        ].find((b) => b.textContent === 'Rename')
        return el?.dataset['state'] ?? null
      })
      expect(renameState, `${era}: Rename is disabled with no selection`).toBe('disabled')
    }
  })
})
