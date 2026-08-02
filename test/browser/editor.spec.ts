/**
 * The Editor app.
 *
 * **The phase-5 gate is the reason this file exists.** ARCHITECTURE.md §11 names
 * exactly what this app has to survive — "the editor's cursor and selection" — and
 * §13 item 9 says in its own words that one harness implementation "proves the
 * contract is wireable and nothing more". The suspend suite below is the test that
 * fails when it stops being true, and it asserts the *hard* half deliberately: not
 * the word-wrap flag and the undo depth, which are plain fields and would survive
 * by accident, but the four things that live in the DOM and are destroyed by the
 * write `resume()` itself performs — the caret, the selection range, the scroll
 * offset and a search term the user is part-way through typing.
 *
 * To make that a real test and not a hopeful one, the suite writes to the file
 * *while the editor is suspended*. A suspended app must not follow the change, and
 * the change is what forces `resume()` to write the surface — which is the write
 * that throws the caret away. A round trip over an unchanged document would pass
 * with the capture deleted.
 *
 * **Behaviour in every era.** A widget that looks right in one skin and breaks in
 * another is the app's bug, so the round trip runs against all six.
 */

import { test, expect, type Page, type Locator } from '@playwright/test'
import type { EditorInstance } from '../../src/apps/editor/index.js'
import type { WindowId } from '../../src/core/wm/types.js'

const ERAS = ['winxp', 'win31', 'tiger', 'system1', 'macos8', 'ledger'] as const

declare global {
  interface Window {
    __editor: {
      app(id: WindowId): EditorInstance
      /** The window the editor is mounted in, so a test can suspend exactly it. */
      id: WindowId
    }
  }
}

async function boot(page: Page, era = 'winxp'): Promise<void> {
  await page.goto(`/?era=${era}`)
  await page.waitForFunction(() => window.__chronos !== undefined)
  await page.evaluate(() => window.__chronos.wipeStorage())
  await page.evaluate(() => window.__chronos.reset())
  // Without this a suite passes vacuously against whichever era is default, which
  // is how four suites silently tested XP in phase 3.
  expect(await page.evaluate(() => window.__chronos.era)).toBe(era)
}

/** Creates a text file in the root and returns its node id. */
async function seedFile(page: Page, name: string, body: string): Promise<string> {
  return page.evaluate(
    async ({ name, body }) => {
      const fs = window.__chronos.fs
      const id = await fs.createFile(fs.root(), name, body)
      return id as string
    },
    { name, body },
  )
}

/** Opens the editor, optionally onto a file, and records the window it landed in. */
async function openEditor(page: Page, file?: string): Promise<WindowId> {
  const id = await page.evaluate((f) => {
    const wid =
      f === undefined
        ? window.__chronos.openEditorWindow()
        : window.__chronos.openEditorWindow(f as never)
    window.__editor = {
      id: wid,
      app(target) {
        const instance = window.__chronos.shell.appFor(target)
        if (!instance) throw new Error(`no app mounted in window ${String(target)}`)
        return instance as unknown as EditorInstance
      },
    }
    return wid
  }, file)
  await expect(surface(page)).toBeVisible()
  return id
}

function surface(page: Page): Locator {
  return page.locator('[data-app="editor"] [data-ui="textarea"]')
}

function findBar(page: Page): Locator {
  return page.locator('[data-app="editor"] [data-ui-role="findbar"]')
}

function toolButton(page: Page, label: string): Locator {
  return page
    .locator('[data-app="editor"] [data-ui="toolbar"] [data-ui="button"]')
    .filter({ hasText: new RegExp(`^${label}$`) })
}

function findButton(page: Page, label: string): Locator {
  return page
    .locator('[data-app="editor"] [data-ui-role="findbar"] [data-ui="button"]')
    .filter({ hasText: new RegExp(`^${label}$`) })
}

function dialog(page: Page): Locator {
  return page.locator('[data-ui="dialog"]')
}

function dialogButton(page: Page, label: string): Locator {
  return dialog(page).locator('[data-ui="button"]').filter({ hasText: new RegExp(`^${label}$`) })
}

/** What the app believes, read live rather than from any cache. */
async function snapshot(page: Page) {
  return page.evaluate(() => window.__editor.app(window.__editor.id).snapshotForTest())
}

/** Sets the caret without the keyboard, so a test can pin an exact offset. */
async function setCaret(page: Page, start: number, end: number): Promise<void> {
  await page.evaluate(
    ({ start, end }) => {
      const el = document.querySelector<HTMLTextAreaElement>(
        '[data-app="editor"] [data-ui="textarea"]',
      )
      if (!el) throw new Error('no text surface')
      el.focus()
      el.setSelectionRange(start, end)
    },
    { start, end },
  )
}

async function fileText(page: Page, id: string): Promise<string> {
  return page.evaluate((f) => window.__chronos.fs.readText(f as never), id)
}

/**
 * Open the find bar and wait until its field actually holds the caret.
 *
 * `openFind` renders asynchronously — it awaits a filesystem read for the title
 * before it builds the bar — so a test that presses the chord and types
 * immediately puts the search term into the *document*. It is a race the test wins
 * most of the time, which is the worst kind: one assertion in ten failed with a
 * document four characters longer than it started and an empty search field.
 */
async function openFindBar(page: Page, replacing = false): Promise<void> {
  await page.keyboard.press(replacing ? 'Control+h' : 'Control+f')
  await expect(findBar(page)).toBeVisible()
  await expect
    .poll(async () =>
      page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? null),
    )
    .toBe('Find what')
}

// --------------------------------------------------------------- editing

test.describe('editor: editing and the dirty flag', () => {
  test('typing marks the window dirty and the buffer follows the keystrokes', async ({ page }) => {
    await boot(page)
    const id = await openEditor(page)

    expect(await page.evaluate((w) => window.__chronos.shell.wm.get(w)?.dirty, id)).toBe(false)

    await surface(page).click()
    await page.keyboard.type('hello')

    expect((await snapshot(page)).text).toBe('hello')
    expect((await snapshot(page)).dirty).toBe(true)
    // The era's own dirty indicator, not the app's idea of it: `setDirty` on the
    // window handle is what drives it, and a guard that never reached the window
    // manager would look identical from inside the app.
    expect(await page.evaluate((w) => window.__chronos.shell.wm.get(w)?.dirty, id)).toBe(true)
  })

  test('undo coalesces a run of typing and redo puts it back', async ({ page }) => {
    await boot(page)
    await openEditor(page)
    await surface(page).click()

    /*
     * Two words, two undo steps. The run breaks where a word *starts* rather than
     * where the space is typed, so the space belongs to the word before it — which
     * is what makes undo remove `two` and not just the `t`.
     */
    await page.keyboard.type('one two')
    expect((await snapshot(page)).undo.undo).toBe(2)

    await page.keyboard.press('Control+z')
    expect((await snapshot(page)).text).toBe('one ')
    await page.keyboard.press('Control+z')
    expect((await snapshot(page)).text).toBe('')
    expect((await snapshot(page)).undo).toEqual({ undo: 0, redo: 2 })

    await page.keyboard.press('Control+y')
    expect((await snapshot(page)).text).toBe('one ')
    await page.keyboard.press('Control+Shift+z')
    expect((await snapshot(page)).text).toBe('one two')
  })

  test('a new edit after an undo discards the redo path', async ({ page }) => {
    await boot(page)
    await openEditor(page)
    await surface(page).click()
    await page.keyboard.type('alpha beta')
    await page.keyboard.press('Control+z')
    expect((await snapshot(page)).undo.redo).toBe(1)

    await page.keyboard.type('gamma')
    expect((await snapshot(page)).undo.redo).toBe(0)
  })

  test('word wrap toggles the surface between folding and scrolling', async ({ page }) => {
    await boot(page)
    await openEditor(page)

    await expect(surface(page)).toHaveAttribute('data-wrap', 'on')
    expect(await surface(page).evaluate((el) => getComputedStyle(el).whiteSpace)).toBe('pre-wrap')

    await toolButton(page, 'Word Wrap').click()
    await expect(surface(page)).toHaveAttribute('data-wrap', 'off')
    expect(await surface(page).evaluate((el) => getComputedStyle(el).whiteSpace)).toBe('pre')
    expect(await surface(page).evaluate((el) => getComputedStyle(el).overflowX)).toBe('auto')
    expect((await snapshot(page)).wordWrap).toBe(false)
  })
})

// ------------------------------------------------------ save, save as, revert

test.describe('editor: save, save as and revert', () => {
  test('Save on an untitled document asks for a name and writes through FsApi', async ({
    page,
  }) => {
    await boot(page)
    await openEditor(page)
    await surface(page).click()
    await page.keyboard.type('first draft')

    await toolButton(page, 'Save').click()
    await expect(dialog(page)).toBeVisible()
    const nameField = dialog(page).locator('[data-ui="field"]')
    await nameField.fill('Letter.txt')
    await dialogButton(page, 'Save').click()
    await expect(dialog(page)).toHaveCount(0)

    // The dialog's own close resolves before the write it triggered, so this polls
    // rather than reading once: a single read races the `createFile` behind it.
    await expect
      .poll(async () =>
        page.evaluate(async () => {
          const fs = window.__chronos.fs
          const kids = await fs.list(fs.root())
          const node = kids.find((n) => n.name === 'Letter.txt')
          return node ? await fs.readText(node.id) : null
        }),
      )
      .toBe('first draft')
    await expect.poll(async () => (await snapshot(page)).dirty).toBe(false)
  })

  test('Save on a named document writes with no dialog at all', async ({ page }) => {
    await boot(page)
    const file = await seedFile(page, 'Notes.txt', 'original')
    await openEditor(page, file)
    await expect(surface(page)).toHaveValue('original')

    await surface(page).click()
    await page.keyboard.press('End')
    await page.keyboard.type(' plus more')
    await page.keyboard.press('Control+s')

    await expect
      .poll(async () => await fileText(page, file))
      .toBe('original plus more')
    expect(await dialog(page).count()).toBe(0)
  })

  test('Revert asks, then reloads the saved version and stays undoable', async ({ page }) => {
    await boot(page)
    const file = await seedFile(page, 'Draft.txt', 'saved copy')
    await openEditor(page, file)
    await surface(page).click()
    await page.keyboard.press('End')
    await page.keyboard.type(' edited')
    expect((await snapshot(page)).text).toBe('saved copy edited')

    await toolButton(page, 'Revert').click()
    await expect(dialog(page)).toBeVisible()
    await dialogButton(page, 'Revert').click()
    await expect(dialog(page)).toHaveCount(0)

    await expect.poll(async () => (await snapshot(page)).text).toBe('saved copy')
    expect((await snapshot(page)).dirty).toBe(false)

    // A whole-buffer replacement the undo stack cannot reach is the one edit that
    // can lose an afternoon, so Revert is recorded like any other.
    await surface(page).click()
    await page.keyboard.press('Control+z')
    await expect.poll(async () => (await snapshot(page)).text).toBe('saved copy edited')
  })

  test('Revert cancelled changes nothing', async ({ page }) => {
    await boot(page)
    const file = await seedFile(page, 'Draft.txt', 'saved copy')
    await openEditor(page, file)
    await surface(page).click()
    await page.keyboard.press('End')
    await page.keyboard.type('!')

    await toolButton(page, 'Revert').click()
    await dialogButton(page, 'Cancel').click()
    await expect(dialog(page)).toHaveCount(0)
    expect((await snapshot(page)).text).toBe('saved copy!')
    expect((await snapshot(page)).dirty).toBe(true)
  })

  /**
   * The file chooser's category marks.
   *
   * This is a core fix rather than an app one, and it lives here because the Editor
   * is what put a file dialog on screen and looked at it. `core/ui/dialogs.ts` was
   * passing `▸` and `·` as `ListRow.glyph`, which is documented as a *category* and
   * not a character — so the kit wrote `data-glyph="▸"`, every skin's rule missed,
   * and the chooser drew an empty box in front of every row in all six eras. The
   * assertion is on the contract vocabulary, so it holds for a new era without
   * being rewritten.
   */
  test('the file chooser marks rows with a category the skins actually draw', async ({ page }) => {
    await boot(page)
    await seedFile(page, 'Openable.txt', 'text')
    await openEditor(page)

    await toolButton(page, 'Open').click()
    await expect(dialog(page)).toBeVisible()
    // The chooser fills itself from an async filesystem read, so a visible dialog
    // is not a populated one — reading straight away wins the race often enough to
    // pass alone and lose it in a full run.
    await expect(dialog(page).locator('[data-ui="listrow"]').first()).toBeVisible()
    const glyphs = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('[data-ui="dialog"] [data-ui-glyph]')].map(
        (el) => ({
          category: el.dataset['glyph'] ?? null,
          text: el.textContent,
          width: Math.round(el.getBoundingClientRect().width),
        }),
      ),
    )
    expect(glyphs.length, 'the chooser listed something').toBeGreaterThan(0)
    for (const g of glyphs) {
      expect(['folder', 'document', 'image', 'sound', 'trash']).toContain(g.category)
      // No text at all: an app may not spell a character its era's face might lack.
      expect(g.text).toBe('')
      expect(g.width, 'the skin gave the mark a box to draw in').toBeGreaterThan(0)
    }
    await dialogButton(page, 'Cancel').click()
  })

  test('Save As over an existing name asks before replacing', async ({ page }) => {
    await boot(page)
    await seedFile(page, 'Taken.txt', 'the old contents')
    await openEditor(page)
    await surface(page).click()
    await page.keyboard.type('the new contents')

    await toolButton(page, 'Save As').click()
    await dialog(page).locator('[data-ui="field"]').fill('Taken.txt')
    await dialogButton(page, 'Save').click()

    // The chooser closed and the confirmation took its place.
    await expect(dialog(page)).toBeVisible()
    await expect(dialogButton(page, 'Replace')).toBeVisible()
    await dialogButton(page, 'Replace').click()
    await expect(dialog(page)).toHaveCount(0)

    await expect
      .poll(async () =>
        page.evaluate(async () => {
          const fs = window.__chronos.fs
          const kids = await fs.list(fs.root())
          const node = kids.find((n) => n.name === 'Taken.txt')
          return node ? await fs.readText(node.id) : null
        }),
      )
      .toBe('the new contents')
  })
})

// ---------------------------------------------------------- the close guard

test.describe('editor: the unsaved-changes guard', () => {
  test('Cancel blocks the close and the window stays open', async ({ page }) => {
    await boot(page)
    const id = await openEditor(page)
    await surface(page).click()
    await page.keyboard.type('unsaved work')

    await page.evaluate((w) => {
      void window.__chronos.shell.wm.close(w)
    }, id)
    await expect(dialog(page)).toBeVisible()
    await dialogButton(page, 'Cancel').click()

    await expect(dialog(page)).toHaveCount(0)
    expect(await page.evaluate((w) => window.__chronos.shell.wm.get(w) !== undefined, id)).toBe(true)
    expect((await snapshot(page)).text).toBe('unsaved work')
  })

  test("Don't Save closes and discards", async ({ page }) => {
    await boot(page)
    const id = await openEditor(page)
    await surface(page).click()
    await page.keyboard.type('throwaway')

    await page.evaluate((w) => {
      void window.__chronos.shell.wm.close(w)
    }, id)
    await expect(dialog(page)).toBeVisible()
    await dialogButton(page, "Don't Save").click()

    await expect
      .poll(async () => page.evaluate((w) => window.__chronos.shell.wm.get(w) === undefined, id))
      .toBe(true)
  })

  test('Save from the guard writes the file and then closes', async ({ page }) => {
    await boot(page)
    const file = await seedFile(page, 'Guarded.txt', 'before')
    const id = await openEditor(page, file)
    await expect(surface(page)).toHaveValue('before')
    await surface(page).click()
    await page.keyboard.press('End')
    await page.keyboard.type(' after')

    await page.evaluate((w) => {
      void window.__chronos.shell.wm.close(w)
    }, id)
    await expect(dialog(page)).toBeVisible()
    await dialogButton(page, 'Save').click()

    await expect.poll(async () => await fileText(page, file)).toBe('before after')
    await expect
      .poll(async () => page.evaluate((w) => window.__chronos.shell.wm.get(w) === undefined, id))
      .toBe(true)
  })

  test('a clean document closes with no dialog', async ({ page }) => {
    await boot(page)
    const id = await openEditor(page)
    await page.evaluate((w) => {
      void window.__chronos.shell.wm.close(w)
    }, id)
    await expect
      .poll(async () => page.evaluate((w) => window.__chronos.shell.wm.get(w) === undefined, id))
      .toBe(true)
    expect(await dialog(page).count()).toBe(0)
  })

  test('a Save cancelled at the chooser cancels the close too', async ({ page }) => {
    await boot(page)
    const id = await openEditor(page)
    await surface(page).click()
    await page.keyboard.type('never named')

    await page.evaluate((w) => {
      void window.__chronos.shell.wm.close(w)
    }, id)
    await dialogButton(page, 'Save').click()
    // Now the file chooser, because the document has no name yet.
    await expect(dialog(page)).toBeVisible()
    await dialogButton(page, 'Cancel').click()

    await expect(dialog(page)).toHaveCount(0)
    expect(await page.evaluate((w) => window.__chronos.shell.wm.get(w) !== undefined, id)).toBe(true)
  })
})

// ------------------------------------------------------------ find/replace

test.describe('editor: find and replace', () => {
  const BODY = 'alpha Beta gamma beta delta'

  test('Find Next steps forward and wraps back to the first match', async ({ page }) => {
    await boot(page)
    const file = await seedFile(page, 'Body.txt', BODY)
    await openEditor(page, file)
    await expect(surface(page)).toHaveValue(BODY)

    await openFindBar(page)
    await page.keyboard.type('beta')

    await findButton(page, 'Next').click()
    expect((await snapshot(page)).caret).toEqual({ start: 6, end: 10 })

    await findButton(page, 'Next').click()
    expect((await snapshot(page)).caret).toEqual({ start: 17, end: 21 })

    // Past the last match, wrap is on: it comes back to the first.
    await findButton(page, 'Next').click()
    expect((await snapshot(page)).caret).toEqual({ start: 6, end: 10 })
  })

  test('wrap off stops at the end instead of coming round', async ({ page }) => {
    await boot(page)
    const file = await seedFile(page, 'Body.txt', BODY)
    await openEditor(page, file)
    await openFindBar(page)
    await page.keyboard.type('beta')
    await findButton(page, 'Wrap Around').click()
    await expect(findButton(page, 'Wrap Around')).toHaveAttribute('data-pressed', 'false')

    await findButton(page, 'Next').click()
    await findButton(page, 'Next').click()
    expect((await snapshot(page)).caret).toEqual({ start: 17, end: 21 })
    await findButton(page, 'Next').click()
    expect((await snapshot(page)).caret).toEqual({ start: 17, end: 21 })
  })

  test('match case narrows the matches and the counter says so', async ({ page }) => {
    await boot(page)
    const file = await seedFile(page, 'Body.txt', BODY)
    await openEditor(page, file)
    await openFindBar(page)
    await page.keyboard.type('beta')

    const status = page.locator('[data-app="editor"] [data-ui="statusbar"]')
    await expect(status).toContainText('2 matches')

    await findButton(page, 'Match Case').click()
    await expect(status).toContainText('match')
    await findButton(page, 'Next').click()
    // Only the lower-case one now.
    expect((await snapshot(page)).caret).toEqual({ start: 17, end: 21 })
    await findButton(page, 'Next').click()
    expect((await snapshot(page)).caret).toEqual({ start: 17, end: 21 })
  })

  test('Find Previous walks back and wraps to the last match', async ({ page }) => {
    await boot(page)
    const file = await seedFile(page, 'Body.txt', BODY)
    await openEditor(page, file)
    await openFindBar(page)
    await page.keyboard.type('beta')

    await setCaret(page, 0, 0)
    await findButton(page, 'Previous').click()
    expect((await snapshot(page)).caret).toEqual({ start: 17, end: 21 })
    await findButton(page, 'Previous').click()
    expect((await snapshot(page)).caret).toEqual({ start: 6, end: 10 })
  })

  test('Replace All replaces every match and is one undo step', async ({ page }) => {
    await boot(page)
    const file = await seedFile(page, 'Body.txt', BODY)
    await openEditor(page, file)
    await openFindBar(page, true)
    await page.keyboard.type('beta')
    await findBar(page).locator('[data-ui="field"]').nth(1).fill('ZZ')

    await findButton(page, 'Replace All').click()
    await expect.poll(async () => (await snapshot(page)).text).toBe('alpha ZZ gamma ZZ delta')

    await surface(page).click()
    await page.keyboard.press('Control+z')
    await expect.poll(async () => (await snapshot(page)).text).toBe(BODY)
  })

  test('Replace changes the current match and moves to the next', async ({ page }) => {
    await boot(page)
    const file = await seedFile(page, 'Body.txt', BODY)
    await openEditor(page, file)
    await openFindBar(page, true)
    await page.keyboard.type('beta')
    await findBar(page).locator('[data-ui="field"]').nth(1).fill('X')

    await findButton(page, 'Next').click()
    await findButton(page, 'Replace').click()
    await expect.poll(async () => (await snapshot(page)).text).toBe('alpha X gamma beta delta')
    // And it landed on the remaining match rather than staying put.
    expect((await snapshot(page)).caret).toEqual({ start: 14, end: 18 })
  })

  test('Escape closes the bar and returns the caret to the document', async ({ page }) => {
    await boot(page)
    const file = await seedFile(page, 'Body.txt', BODY)
    await openEditor(page, file)
    await openFindBar(page)
    await page.keyboard.press('Escape')
    await expect(findBar(page)).toBeHidden()
    await expect
      .poll(async () =>
        page.evaluate(() => document.activeElement?.getAttribute('data-ui') ?? null),
      )
      .toBe('textarea')
  })

  test('Enter in the search field finds the next match and keeps the caret there', async ({
    page,
  }) => {
    await boot(page)
    const file = await seedFile(page, 'Body.txt', BODY)
    await openEditor(page, file)
    await openFindBar(page)
    await page.keyboard.type('beta')

    await page.keyboard.press('Enter')
    expect((await snapshot(page)).caret).toEqual({ start: 6, end: 10 })
    // The second Enter must find the next one rather than typing a newline into
    // the document, which is what happens if the first one moved focus.
    await page.keyboard.press('Enter')
    expect((await snapshot(page)).caret).toEqual({ start: 17, end: 21 })
    expect((await snapshot(page)).text).toBe(BODY)
  })

  test('a sibling window changing the file does not eat the search term', async ({ page }) => {
    await boot(page)
    const file = await seedFile(page, 'Body.txt', BODY)
    await openEditor(page, file)
    await openFindBar(page)
    await page.keyboard.type('bet')
    // Caret in the middle of the term, not at its end: a rebuilt field defaults to
    // the end of its value, so an end-of-term caret would be restored by accident
    // and the assertion below would pass with nothing restoring anything.
    await page.evaluate(() => {
      document
        .querySelector<HTMLInputElement>('[data-ui-role="findbar"] [data-ui="field"]')
        ?.setSelectionRange(1, 1)
    })

    // Exactly the shape of the bug the Files rename hit: an unrelated filesystem
    // event re-renders, the bar is rebuilt, and the half-typed term is destroyed
    // unless it was captured first.
    await page.evaluate(
      ({ f }) => window.__chronos.fs.write(f as never, 'alpha Beta gamma beta delta!'),
      { f: file },
    )
    await expect.poll(async () => (await snapshot(page)).text).toBe(BODY + '!')

    const state = (await snapshot(page)).find
    expect(state?.query).toBe('bet')
    expect(state?.querySel).toEqual({ start: 1, end: 1 })
    await expect
      .poll(async () =>
        page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? null),
      )
      .toBe('Find what')
  })
})

// ------------------------------------------------------------ the phase-5 gate

test.describe('editor: suspend and resume', () => {
  const LONG = Array.from({ length: 60 }, (_, i) => `line ${i} of the document`).join('\n')

  /**
   * The round trip, with every DOM-resident piece pinned to a value that a lazy
   * restore would get wrong.
   *
   * The caret is a *range* in the middle of the buffer, so a restore that selects
   * everything, collapses to zero, or jumps to an end fails. The scroll offset is
   * non-zero. The search term has its caret at offset 2 of 3 — neither end. And the
   * file is rewritten while the editor is suspended, which is what forces `resume()`
   * to write the surface and destroy all of it.
   */
  async function roundTrip(page: Page, era: string): Promise<void> {
    const file = await seedFile(page, 'Long.txt', LONG)
    const id = await openEditor(page, file)
    await expect(surface(page)).toHaveValue(LONG)

    /*
     * Type, then **save**.
     *
     * The save is not tidiness — it is what makes this test capable of failing. A
     * dirty buffer is never overwritten from disk, so a round trip over one leaves
     * the surface untouched, `render()` writes no value, and the caret is never
     * destroyed in the first place: every assertion below would pass with the
     * capture and the re-mount both deleted. Verified by deleting them. Saving
     * leaves the buffer clean *and* the undo stack loaded, so the external write
     * further down is genuinely adopted and the surface genuinely rewritten.
     */
    await surface(page).click()
    await page.keyboard.type('EDIT')
    await page.keyboard.press('Control+s')
    await expect.poll(async () => (await snapshot(page)).dirty).toBe(false)
    const saved = (await snapshot(page)).text

    await openFindBar(page)
    await page.keyboard.type('line')
    // Caret in the middle of the search term, not at an end.
    await page.evaluate(() => {
      const el = document.querySelector<HTMLInputElement>(
        '[data-ui-role="findbar"] [data-ui="field"]',
      )
      el?.setSelectionRange(2, 2)
    })

    await setCaret(page, 40, 52)
    await surface(page).evaluate((el) => {
      el.scrollTop = 60
    })

    const before = await snapshot(page)
    expect(before.caret, `${era}: the caret was actually placed`).toEqual({ start: 40, end: 52 })
    expect(before.scroll.top, `${era}: the surface was actually scrolled`).toBeGreaterThan(0)
    expect(before.undo.undo, `${era}: there is an undo stack to lose`).toBeGreaterThan(0)

    await page.evaluate((w) => window.__chronos.shell.wm.suspend(w), id)
    expect(await page.evaluate(() => window.__editor.app(window.__editor.id).isSuspended())).toBe(
      true,
    )

    /*
     * Write to the file while suspended. Two things ride on this and both matter:
     * a suspended app must do *no work*, so the buffer must not move; and the
     * change is what makes `resume()`'s re-read produce a different string, which
     * is what forces the write to the surface that destroys the caret.
     *
     * Upper case rather than a shorter string, so the replacement is the same
     * length: offset 40 and a `scrollTop` of 60 have to still mean something on the
     * other side, or the assertion is about clamping rather than about restoring.
     */
    const replaced = saved.toUpperCase()
    await page.evaluate(({ f, body }) => window.__chronos.fs.write(f as never, body), {
      f: file,
      body: replaced,
    })
    await page.waitForTimeout(50)
    const during = await snapshot(page)
    expect(during.text, `${era}: a suspended app follows nothing`).toBe(before.text)

    await page.evaluate((w) => window.__chronos.shell.wm.resume(w), id)
    await expect
      .poll(async () => page.evaluate(() => window.__editor.app(window.__editor.id).isSuspended()))
      .toBe(false)
    // The re-read happened and the surface was genuinely rewritten — which is the
    // write everything below has to survive.
    await expect.poll(async () => (await snapshot(page)).text).toBe(replaced)

    const after = await snapshot(page)
    expect(after.caret, `${era}: caret and selection range`).toEqual({ start: 40, end: 52 })
    expect(after.scroll.top, `${era}: scroll offset`).toBe(before.scroll.top)
    expect(after.undo, `${era}: the undo stack`).toEqual(before.undo)
    expect(after.wordWrap, `${era}: the word wrap setting`).toBe(before.wordWrap)
    expect(after.find?.query, `${era}: the search term`).toBe('line')
    expect(after.find?.querySel, `${era}: the caret inside the search field`).toEqual({
      start: 2,
      end: 2,
    })

    // And it is really back on screen rather than only remembered in a field.
    await expect(findBar(page), `${era}: the bar is visible`).toBeVisible()
    expect(
      await page.evaluate(
        () =>
          document.querySelector<HTMLInputElement>('[data-ui-role="findbar"] [data-ui="field"]')
            ?.value,
      ),
      `${era}: the field really holds it`,
    ).toBe('line')
    expect(
      await page.evaluate(
        () =>
          document.querySelector<HTMLTextAreaElement>('[data-app="editor"] [data-ui="textarea"]')
            ?.selectionStart,
      ),
      `${era}: the surface really holds the caret`,
    ).toBe(40)
  }

  test('cursor, selection, scroll, undo stack and an open find bar all survive', async ({
    page,
  }) => {
    await boot(page)
    await roundTrip(page, 'winxp')
  })

  test('an edited buffer is not overwritten by a change made while suspended', async ({ page }) => {
    await boot(page)
    const file = await seedFile(page, 'Contested.txt', 'on disk')
    const id = await openEditor(page, file)
    await expect(surface(page)).toHaveValue('on disk')
    await surface(page).click()
    await page.keyboard.press('End')
    await page.keyboard.type(' and edited')

    await page.evaluate((w) => window.__chronos.shell.wm.suspend(w), id)
    await page.evaluate(({ f }) => window.__chronos.fs.write(f as never, 'written elsewhere'), {
      f: file,
    })
    await page.evaluate((w) => window.__chronos.shell.wm.resume(w), id)
    await expect
      .poll(async () => page.evaluate(() => window.__editor.app(window.__editor.id).isSuspended()))
      .toBe(false)

    // Unsaved work outranks the disk copy — that is the entire point of the dirty
    // flag, and adopting the file here would destroy exactly what it protects.
    await page.waitForTimeout(50)
    expect((await snapshot(page)).text).toBe('on disk and edited')
    expect((await snapshot(page)).dirty).toBe(true)
    // And the app says so rather than staying silent about a divergence.
    await expect(page.locator('[data-app="editor"] [data-ui="statusbar"]')).toContainText(
      'changed on disk',
    )
  })

  test('a suspended editor arms no watcher, and resume re-reads once', async ({ page }) => {
    await boot(page)
    const file = await seedFile(page, 'Watched.txt', 'first')
    const id = await openEditor(page, file)
    await expect(surface(page)).toHaveValue('first')

    await page.evaluate((w) => window.__chronos.shell.wm.suspend(w), id)
    await page.evaluate(({ f }) => window.__chronos.fs.write(f as never, 'second'), { f: file })
    await page.waitForTimeout(50)
    // Clean, but suspended: the change is real and the app must not have seen it.
    expect((await snapshot(page)).text).toBe('first')

    await page.evaluate((w) => window.__chronos.shell.wm.resume(w), id)
    // Clean on resume, so the disk copy is adopted — one read, on the way up.
    await expect.poll(async () => (await snapshot(page)).text).toBe('second')
  })

  test('the round trip holds in every era', async ({ page }) => {
    for (const era of ERAS) {
      await boot(page, era)
      await roundTrip(page, era)
    }
  })
})

// -------------------------------------------------- rendering in every era

test.describe('editor: the widget contract in every era', () => {
  test('the text surface and the find bar are styled by every skin', async ({ page }) => {
    for (const era of ERAS) {
      await boot(page, era)
      const file = await seedFile(page, 'Styled.txt', 'some text')
      await openEditor(page, file)
      await expect(surface(page)).toHaveValue('some text')
      await openFindBar(page)

      const styled = await surface(page).evaluate((el) => {
        const cs = getComputedStyle(el)
        return {
          font: cs.fontFamily,
          size: cs.fontSize,
          background: cs.backgroundColor,
          border: cs.borderTopWidth,
        }
      })
      /*
       * A `<textarea>` does not inherit type, and the browser's default for one is
       * `monospace` at 13.333px. Either value appearing here means a skin wrote no
       * rule and the document is being set in neither the era's face nor its size —
       * silent, and exactly the class of failure a missing glyph already caused
       * once in this project.
       */
      expect(styled.font, `${era}: not the browser's default textarea face`).not.toBe('monospace')
      expect(styled.size, `${era}: not the browser's default textarea size`).not.toBe('13.3333px')
      expect(styled.background, `${era}: the skin painted a fill`).not.toBe('rgba(0, 0, 0, 0)')

      const states = await page.evaluate(() =>
        [
          ...document.querySelectorAll<HTMLElement>(
            '[data-app="editor"] [data-ui="button"], [data-app="editor"] [data-ui="textarea"], [data-app="editor"] [data-ui="field"]',
          ),
        ].map((el) => el.dataset['state'] ?? null),
      )
      expect(states.length, `${era}: widgets present`).toBeGreaterThan(0)
      for (const state of states) {
        expect(
          ['rest', 'hover', 'active', 'focus', 'disabled'],
          `${era}: data-state is from the closed set`,
        ).toContain(state)
      }
    }
  })

  /**
   * The app's menus, which a menu-bar era renders on the app's behalf.
   *
   * Two things are asserted and the second is the one with a rule behind it.
   * DECISIONS 4.47: an *enabled* item's accelerator must come from the active
   * keymap, and `AppHost` deliberately exposes no route to it — so every item this
   * app offers is bare. A chord that works and is not advertised is the safe
   * direction; a menu advertising a chord nothing binds is not.
   */
  test('the app offers its menus with no invented accelerators', async ({ page }) => {
    for (const era of ERAS) {
      await boot(page, era)
      const id = await openEditor(page)
      const spec = await page.evaluate((w) => window.__chronos.shell.appMenuFor(w), id)
      expect(spec, `${era}: the app offers menus`).not.toBeNull()

      const titles = (spec ?? [])
        .filter((e) => e.kind === 'submenu')
        .map((e) => (e as { label: string }).label)
      expect(titles, `${era}: the three menus`).toEqual(['File', 'Edit', 'Format'])

      const items = (spec ?? [])
        .filter((e) => e.kind === 'submenu')
        .flatMap((e) => (e as { items: Array<{ kind: string; accel?: string; label?: string }> }).items)
      for (const item of items) {
        expect(item.accel, `${era}: "${item.label ?? ''}" advertises no chord`).toBeUndefined()
      }

      // Word Wrap is a checkable item and reports its own state, so the menu and
      // the toolbar toggle cannot disagree about it.
      const wrap = items.find((i) => i.label === 'Word Wrap') as { checked?: boolean } | undefined
      expect(wrap?.checked, `${era}: Word Wrap reports its state`).toBe(true)
    }
  })

  test('the era renders a disabled control rather than a dead-looking one', async ({ page }) => {
    for (const era of ERAS) {
      await boot(page, era)
      await openEditor(page)
      // Nothing to revert on an untitled, unedited document.
      await expect(toolButton(page, 'Revert')).toHaveAttribute('data-state', 'disabled')
      await openFindBar(page)
      // And nothing to find with an empty search term.
      await expect(findButton(page, 'Next')).toHaveAttribute('data-state', 'disabled')
    }
  })
})

// ------------------------------------------------ no grey in a 1-bit era

/**
 * The no-grey claim, applied to this app's pixels.
 *
 * The reasoning and the instrument are `files.spec.ts`'s and the argument is
 * recorded there in full: the era's own fidelity suite screenshots the desktop and
 * a menu, so it would pass whatever this window rendered, and its luma band cannot
 * be borrowed because that band came from black-on-white fringes while an inverted
 * selection fringes straight through it. The claim that is true and testable is
 * **no region is flat grey**, measured as the largest connected run of non-pure
 * pixels against a bound of one character cell.
 *
 * This app's surface is the one that most needs it: a `<textarea>` is the widget a
 * browser most wants to give a default border, a default face and a resize grip to,
 * and every one of those would arrive as grey.
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
      (eval(src) as (b: number[]) => Promise<{ total: number; biggest: number; where: string }>)(
        bytes,
      ),
    { bytes: shot, src: COMPONENT_PROBE },
  )
}

async function characterCellArea(page: Page): Promise<number> {
  return page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('[data-app="editor"] [data-ui="textarea"]')!
    const px = parseFloat(getComputedStyle(el).fontSize)
    const scale = window.__chronos.shell.display.scale()
    return (px * scale) ** 2
  })
}

test.describe('editor: no grey in a 1-bit era', () => {
  test('the Editor window has no flat non-pure region', async ({ page }) => {
    await boot(page, 'system1')
    const file = await seedFile(page, 'Bitmap.txt', 'alpha beta gamma\nbeta delta\nbeta')
    await openEditor(page, file)
    await expect(surface(page)).toHaveValue(/alpha/)

    // A selection, an open find bar, a pressed toggle and a disabled button are the
    // four places a recreation reaches for a grey, so all four are on screen.
    await openFindBar(page)
    await setCaret(page, 0, 10)
    await expect(findButton(page, 'Next')).toHaveAttribute('data-state', 'disabled')

    const stats = await largestNonPureRegion(page, '[data-app="editor"]')
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
    const file = await seedFile(page, 'Probe.txt', 'alpha beta gamma')
    await openEditor(page, file)
    await expect(surface(page)).toHaveValue(/alpha/)

    await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('[data-app="editor"] [data-ui="textarea"]')
      if (el) el.style.background = '#808080'
    })

    const stats = await largestNonPureRegion(page, '[data-app="editor"]')
    const cell = await characterCellArea(page)
    expect(stats.biggest, 'the probe sees an injected grey fill').toBeGreaterThan(cell)
  })
})
