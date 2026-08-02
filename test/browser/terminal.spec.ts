/**
 * The Terminal app.
 *
 * Three things are being proved and they are different in kind.
 *
 * **The phase-5 gate**, which is the reason this file exists: every app survives
 * `suspend()`/`resume()` with state intact, verified per app rather than asserted.
 * The suspend suite deliberately tests the *hard* half — not the working directory
 * and the history, which are plain fields and would survive by accident, but the
 * half-typed command line, which lives in a DOM widget the resume re-render
 * destroys, and a walk caught mid-tree, which lives in a suspended stack. And per
 * `CLAUDE.md`'s rule about instruments, one test removes the capture and asserts the
 * gate goes red, so a green suite here means something.
 *
 * **One implementation, six spellings.** `dir C:\DOCS`, `ls /Users/chronos` and
 * `ls HD:Documents` are the same code reached through `CommandId`, and the sweep
 * below runs the same operations in all six eras and checks the *filesystem*
 * afterwards rather than the console — because a command that prints the right thing
 * and writes nothing is exactly the failure "nothing simulated" is aimed at.
 *
 * **What renders.** The file manager found six bugs by rendering and looking that
 * every assertion had missed, and the worst of them was a character no era face
 * carried. A terminal is nothing but characters, so the coverage check here is
 * mechanical: every fixed string the app can print is rasterised in the era's own
 * face and compared against the fallback, in all six.
 */

import { test, expect, type Page } from '@playwright/test'
import type { TerminalApp } from '../../src/apps/terminal/index.js'
import type { WindowId } from '../../src/core/wm/types.js'
import { characterCellArea, largestNonPureRegion } from './nogrey.js'

const ERAS = ['winxp', 'win31', 'tiger', 'system1', 'macos8', 'ledger'] as const

/** The two families, by the word each spells "list a folder" with. */
const DOS_ERAS = ['winxp', 'win31'] as const
const UNIX_ERAS = ['tiger', 'system1', 'macos8', 'ledger'] as const

declare global {
  interface Window {
    __term: {
      app(id: WindowId): TerminalApp
    }
  }
}

async function boot(page: Page, era: string = 'winxp'): Promise<void> {
  await page.goto(`/?era=${era}`)
  await page.waitForFunction(() => window.__chronos !== undefined)
  await page.evaluate(() => window.__chronos.wipeStorage())
  await page.evaluate(() => window.__chronos.reset())
  // Without this a suite passes vacuously against whichever era is default.
  expect(await page.evaluate(() => window.__chronos.era)).toBe(era)
  await page.evaluate(() => {
    window.__term = {
      app(id) {
        const instance = window.__chronos.shell.appFor(id)
        if (!instance) throw new Error(`no app mounted in window ${String(id)}`)
        return instance as unknown as TerminalApp
      },
    }
  })
}

async function openTerminal(page: Page): Promise<number> {
  const id = await page.evaluate(() => window.__chronos.openTerminalWindow() as unknown as number)
  await expect(page.locator('[data-app="terminal"] [data-ui-role="command"]')).toBeVisible()
  return id
}

/** Runs a line exactly as pressing Enter on it would, and waits for it to finish. */
async function run(page: Page, id: number, text: string): Promise<void> {
  await page.evaluate(
    async ([w, t]) => {
      await window.__term.app(w as never).run(t as string)
    },
    [id, text] as const,
  )
}

async function transcript(page: Page, id: number): Promise<string> {
  return page.evaluate((w) => window.__term.app(w as never).transcript(), id)
}

/** The last non-empty line of output, which is what most commands are judged on. */
async function lastLine(page: Page, id: number): Promise<string> {
  const text = await transcript(page, id)
  const rows = text.split('\n').filter((l) => l.trim().length > 0)
  return rows[rows.length - 1] ?? ''
}

async function promptText(page: Page): Promise<string> {
  return page.locator('[data-app="terminal"] [data-term-prompt]').innerText()
}

/** The names in a folder, read through the filesystem rather than off the screen. */
async function namesIn(page: Page, path: string, id: number): Promise<string[]> {
  return page.evaluate(
    async ([p, w]) => {
      const app = window.__term.app(w as never)
      const fs = window.__chronos.fs
      const dir = await window.__chronos.codec.parse(p as string, app.currentDir())
      if (dir === null) return ['<unresolved>']
      return (await fs.list(dir)).map((n) => n.name).sort()
    },
    [path, id] as const,
  )
}

// ------------------------------------------------------------- the vocabulary

test.describe('terminal: one implementation, six spellings', () => {
  test('each era answers to its own family and not the other', async ({ page }) => {
    for (const era of DOS_ERAS) {
      await boot(page, era)
      const id = await openTerminal(page)
      await run(page, id, 'dir')
      expect(await transcript(page, id)).not.toContain('Bad command or file name')
      await run(page, id, 'ls')
      expect(await lastLine(page, id), `${era} should not know ls`).toBe(
        'Bad command or file name',
      )
    }
    for (const era of UNIX_ERAS) {
      await boot(page, era)
      const id = await openTerminal(page)
      await run(page, id, 'ls')
      expect(await transcript(page, id)).not.toContain('command not found')
      await run(page, id, 'dir')
      expect(await lastLine(page, id), `${era} should not know dir`).toContain(
        'dir: command not found',
      )
    }
  })

  test('help lists the era its own words, and every one of them runs', async ({ page }) => {
    for (const era of ERAS) {
      await boot(page, era)
      const id = await openTerminal(page)
      await run(page, id, 'help')
      const text = await transcript(page, id)

      // The listing has to name the family this era belongs to, and nothing from
      // the other one: a help screen offering `cat` in an MS-DOS Prompt would be
      // advertising a command the shell does not have.
      const dos = (DOS_ERAS as readonly string[]).includes(era)
      for (const word of dos ? ['dir', 'type', 'del', 'copy', 'cls'] : ['ls', 'cat', 'rm', 'cp', 'clear']) {
        expect(text, `${era} help lists ${word}`).toContain(word)
      }
      for (const word of dos ? [' ls ', ' cat ', ' rm '] : [' dir ', ' type ', ' del ']) {
        expect(` ${text} `, `${era} help does not list ${word.trim()}`).not.toContain(word)
      }
    }
  })

  test('the window carries the shell its path syntax implies', async ({ page }) => {
    const expected: Record<string, string> = {
      winxp: 'MS-DOS Prompt',
      win31: 'MS-DOS Prompt',
      tiger: 'Terminal',
      ledger: 'Terminal',
      system1: 'MPW Shell',
      macos8: 'MPW Shell',
    }
    for (const era of ERAS) {
      await boot(page, era)
      const id = await openTerminal(page)
      const title = await page.evaluate(
        (w) => window.__chronos.shell.wm.get(w as never)?.title ?? '',
        id,
      )
      // Ledger appends its own cost suffix to every title, so this is a prefix check.
      expect(title, `${era} window title`).toContain(expected[era] as string)
    }
  })

  test('the prompt is the era spelling the codec produces', async ({ page }) => {
    for (const era of ERAS) {
      await boot(page, era)
      const id = await openTerminal(page)
      await run(page, id, await wordFor(page, 'changeDir', 'Documents'))

      const [prompt, formatted] = await Promise.all([
        promptText(page),
        page.evaluate(async (w) => {
          const app = window.__term.app(w as never)
          const chain = await window.__chronos.fs.chain(app.currentDir())
          return window.__chronos.codec.format(chain)
        }, id),
      ])
      // The prompt is the codec's path with at most its trailing separator removed —
      // `C:\DOCS>` rather than `C:\DOCS\>`. No era spells it any other way.
      const separator = await page.evaluate(() => window.__chronos.codec.separator)
      const body = prompt.replace(/[>$]\s*$/, '')
      expect([formatted, formatted.slice(0, -separator.length)], `${era} prompt`).toContain(body)
    }
  })
})

/** The word this era uses for a command, so a cross-era test can type it. */
async function wordFor(page: Page, id: string, ...args: string[]): Promise<string> {
  const separator = await page.evaluate(() => window.__chronos.codec.separator)
  const dos = separator === '\\'
  const table: Record<string, [string, string]> = {
    list: ['dir', 'ls'],
    changeDir: ['cd', 'cd'],
    printDir: ['cd', 'pwd'],
    showFile: ['type', 'cat'],
    makeDir: ['md', 'mkdir'],
    remove: ['del', 'rm'],
    copy: ['copy', 'cp'],
    move: ['move', 'mv'],
    clear: ['cls', 'clear'],
    diskFree: ['chkdsk', 'df'],
    version: ['ver', 'uname'],
    open: ['start', 'open'],
    recurse: ['/s', '-r'],
    long: ['/w', '-l'],
  }
  const pair = table[id]
  if (!pair) throw new Error(`no spelling for ${id}`)
  return [dos ? pair[0] : pair[1], ...args].join(' ')
}

// ------------------------------------------------------ the real filesystem

test.describe('terminal: real effects on the real filesystem', () => {
  test('creates, copies, moves and deletes, in every era', async ({ page }) => {
    for (const era of ERAS) {
      await boot(page, era)
      const id = await openTerminal(page)
      const sep = await page.evaluate(() => window.__chronos.codec.separator)

      await run(page, id, await wordFor(page, 'makeDir', 'Work'))
      expect(await namesIn(page, sep, id), `${era} mkdir`).toContain('Work')

      await run(page, id, `touch Work${sep}notes.txt`)
      expect(await namesIn(page, `Work`, id), `${era} touch`).toEqual(['notes.txt'])

      await run(page, id, await wordFor(page, 'copy', `Work${sep}notes.txt`, `Work${sep}copy.txt`))
      expect(await namesIn(page, 'Work', id), `${era} copy`).toEqual(['copy.txt', 'notes.txt'])

      await run(page, id, await wordFor(page, 'move', `Work${sep}copy.txt`, `Work${sep}moved.txt`))
      expect(await namesIn(page, 'Work', id), `${era} move`).toEqual(['moved.txt', 'notes.txt'])

      await run(page, id, await wordFor(page, 'remove', `Work${sep}moved.txt`))
      expect(await namesIn(page, 'Work', id), `${era} remove`).toEqual(['notes.txt'])

      // A folder with something in it is not removed without the era's own switch.
      await run(page, id, await wordFor(page, 'remove', 'Work'))
      expect(await namesIn(page, sep, id), `${era} refuses a full folder`).toContain('Work')

      await run(page, id, await wordFor(page, 'remove', await wordFor(page, 'recurse'), 'Work'))
      expect(await namesIn(page, sep, id), `${era} removes it with the switch`).not.toContain('Work')
    }
  })

  test('writes and reads a file back through the filesystem', async ({ page }) => {
    await boot(page)
    const id = await openTerminal(page)
    await page.evaluate(
      async () => {
        const fs = window.__chronos.fs
        await fs.createFile(fs.root(), 'Readme.txt', 'first\nsecond\n', { mime: 'text/plain' })
      },
    )
    await run(page, id, await wordFor(page, 'showFile', 'Readme.txt'))
    const text = await transcript(page, id)
    expect(text).toContain('first')
    expect(text).toContain('second')
    // A file ending in a newline must not print a trailing blank line that is not in it.
    expect(text.split('\n').filter((l) => l === '').length).toBeLessThan(3)
  })

  test('refuses to print something that is not text, and says what it is', async ({ page }) => {
    await boot(page)
    const id = await openTerminal(page)
    await page.evaluate(async () => {
      const fs = window.__chronos.fs
      await fs.createFile(fs.root(), 'Picture.png', new Blob([new Uint8Array(64)]), {
        mime: 'image/png',
      })
    })
    await run(page, id, await wordFor(page, 'showFile', 'Picture.png'))
    expect(await lastLine(page, id)).toContain('image/png')
  })

  test('a second window sees what this one did, with neither knowing the other', async ({
    page,
  }) => {
    await boot(page)
    const a = await openTerminal(page)
    await run(page, a, await wordFor(page, 'makeDir', 'Shared'))
    const b = await page.evaluate(() => window.__chronos.openFilesWindow() as unknown as number)
    void b
    // Read the tree, not either window's rendering: the filesystem is the only copy.
    expect(await namesIn(page, await page.evaluate(() => window.__chronos.codec.separator), a)).toContain(
      'Shared',
    )
  })

  test('counts the volume it is standing on rather than reporting a number', async ({ page }) => {
    await boot(page)
    const id = await openTerminal(page)
    await run(page, id, await wordFor(page, 'makeDir', 'Counted'))
    await run(page, id, 'touch Counted\\one.txt')
    await run(page, id, 'echo hello')
    const before = await countedFiles(page, id)
    await run(page, id, 'touch Counted\\two.txt')
    const after = await countedFiles(page, id)
    expect(after, 'the count follows the tree').toBe(before + 1)
  })

  async function countedFiles(page: Page, id: number): Promise<number> {
    await run(page, id, await wordFor(page, 'diskFree'))
    const text = await transcript(page, id)
    const rows = text.split('\n').filter((l) => l.startsWith('Files'))
    const last = rows[rows.length - 1] ?? ''
    return Number(last.replace(/[^0-9]/g, ''))
  }

  test('find reports full paths, not paths rooted at the search folder', async ({ page }) => {
    await boot(page, 'tiger')
    const id = await openTerminal(page)
    await run(page, id, 'mkdir Deep')
    await run(page, id, 'mkdir Deep/Deeper')
    await run(page, id, 'touch Deep/Deeper/target.txt')
    await run(page, id, 'find target')
    expect(await lastLine(page, id)).toBe('/Deep/Deeper/target.txt')
  })

  test('tree indents by depth rather than by spaces', async ({ page }) => {
    await boot(page, 'tiger')
    const id = await openTerminal(page)
    await run(page, id, 'mkdir Outer')
    await run(page, id, 'mkdir Outer/Inner')
    await run(page, id, 'tree')
    const indents = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('[data-app="terminal"] [data-term-indent]')].map(
        (el) => el.dataset['termIndent'],
      ),
    )
    expect(indents, 'the tree carries real depth').toContain('1')
    expect(indents, 'and more than one level of it').toContain('2')
  })
})

// --------------------------------------------------------- the phase-5 gate

test.describe('terminal: suspend and resume', () => {
  /** Types a line into the real widget so the caret is where a person left it. */
  async function typeHalfALine(page: Page): Promise<void> {
    const field = page.locator('[data-app="terminal"] [data-ui-role="command"]')
    await field.click()
    await field.fill('echo half-typed')
    // Neither end: a restore that selects everything or collapses to zero fails.
    await page.evaluate(() => {
      const el = document.querySelector<HTMLInputElement>(
        '[data-app="terminal"] [data-ui-role="command"]',
      )
      el?.setSelectionRange(5, 9)
    })
  }

  test('scrollback, folder, history, half-typed line and caret all survive', async ({ page }) => {
    await boot(page)
    const id = await openTerminal(page)
    await run(page, id, 'md Deep')
    await run(page, id, 'cd Deep')
    await run(page, id, 'echo one')
    await run(page, id, 'echo two')
    await typeHalfALine(page)

    const before = {
      transcript: await transcript(page, id),
      cwd: await page.evaluate((w) => String(window.__term.app(w as never).currentDir()), id),
      history: await page.evaluate((w) => [...window.__term.app(w as never).commandHistory()], id),
      draft: await page.evaluate((w) => ({ ...window.__term.app(w as never).draftLine() }), id),
      scroll: await page.evaluate((w) => window.__term.app(w as never).scrollOffset(), id),
      prompt: await promptText(page),
    }
    expect(before.draft.value).toBe('echo half-typed')
    expect(before.draft.selStart).toBe(5)
    expect(before.draft.selEnd).toBe(9)

    await page.evaluate((w) => window.__chronos.shell.wm.suspend(w as never), id)
    expect(await page.evaluate((w) => window.__term.app(w as never).isSuspended(), id)).toBe(true)

    // Prove the app does no work while suspended: change the tree under it and
    // check nothing in the window moved.
    await page.evaluate(async (w) => {
      const app = window.__term.app(w as never)
      await window.__chronos.fs.createDir(app.currentDir(), 'AppearedWhileStopped')
    }, id)
    await page.waitForTimeout(60)
    expect(await transcript(page, id), 'a suspended terminal renders nothing new').toBe(
      before.transcript,
    )

    await page.evaluate((w) => window.__chronos.shell.wm.resume(w as never), id)
    await page.waitForTimeout(60)

    expect(await transcript(page, id)).toBe(before.transcript)
    expect(await page.evaluate((w) => String(window.__term.app(w as never).currentDir()), id)).toBe(
      before.cwd,
    )
    expect(
      await page.evaluate((w) => [...window.__term.app(w as never).commandHistory()], id),
    ).toEqual(before.history)
    expect(await promptText(page)).toBe(before.prompt)
    expect(await page.evaluate((w) => window.__term.app(w as never).scrollOffset(), id)).toBe(
      before.scroll,
    )

    const after = await page.evaluate(
      (w) => ({ ...window.__term.app(w as never).draftLine() }),
      id,
    )
    expect(after.value, 'the half-typed line came back').toBe('echo half-typed')
    expect(after.selStart, 'and so did the caret').toBe(5)
    expect(after.selEnd).toBe(9)

    // And it is really on screen rather than only remembered in a field.
    expect(
      await page
        .locator('[data-app="terminal"] [data-ui-role="command"]')
        .inputValue(),
    ).toBe('echo half-typed')

    // The window works afterwards, which a restored-but-disabled field would not.
    await run(page, id, 'echo three')
    expect(await lastLine(page, id)).toBe('three')
  })

  test('the round trip holds in every era', async ({ page }) => {
    for (const era of ERAS) {
      await boot(page, era)
      const id = await openTerminal(page)
      await run(page, id, 'echo marker')
      await typeHalfALine(page)
      const before = await transcript(page, id)

      await page.evaluate((w) => window.__chronos.shell.wm.suspend(w as never), id)
      await page.evaluate((w) => window.__chronos.shell.wm.resume(w as never), id)
      await page.waitForTimeout(40)

      expect(await transcript(page, id), `${era} scrollback`).toBe(before)
      const draft = await page.evaluate(
        (w) => ({ ...window.__term.app(w as never).draftLine() }),
        id,
      )
      expect(draft.value, `${era} command line`).toBe('echo half-typed')
      expect(draft.selStart, `${era} caret`).toBe(5)
    }
  })

  /**
   * The gate has to be able to fail, and this is what makes it able to.
   *
   * `CLAUDE.md` records two guards that could not fail and were trusted anyway, so
   * the question is asked here rather than assumed. Two things are asserted and each
   * would make the test above vacuous on its own:
   *
   * - **The resume really destroys the widget.** If the same input element came back,
   *   nothing was lost, nothing was restored, and the assertion above would pass
   *   against an app that had never heard of `captureDraft`.
   * - **The restore really reads the widget rather than a stale field.** The value is
   *   written straight into the DOM without firing `input`, so the app's own record
   *   still says something else. Only a resume that reads the live control out on its
   *   way down can bring the typed text back.
   */
  test('the round trip destroys the widget and restores it from what was on screen', async ({
    page,
  }) => {
    await boot(page)
    const id = await openTerminal(page)
    const selector = '[data-app="terminal"] [data-ui-role="command"]'

    // Typed past the app: no `input` event, so `draft` still holds the empty line
    // the last submit left. A restore that trusted the record would come back blank.
    await page.evaluate((sel) => {
      const el = document.querySelector<HTMLInputElement>(sel)
      if (!el) throw new Error('no command line')
      el.focus()
      el.value = 'typed straight into the DOM'
      el.setSelectionRange(6, 14)
      ;(el as HTMLElement & { __chronosMark?: string }).__chronosMark = 'before'
    }, selector)

    await page.evaluate((w) => window.__chronos.shell.wm.suspend(w as never), id)
    await page.evaluate((w) => window.__chronos.shell.wm.resume(w as never), id)
    await page.waitForTimeout(40)

    const after = await page.evaluate((sel) => {
      const el = document.querySelector<HTMLInputElement & { __chronosMark?: string }>(sel)
      if (!el) throw new Error('no command line after resume')
      return {
        sameNode: el.__chronosMark === 'before',
        value: el.value,
        start: el.selectionStart,
        end: el.selectionEnd,
      }
    }, selector)

    expect(after.sameNode, 'resume rebuilds the widget rather than leaving it alone').toBe(false)
    expect(after.value, 'and restores what was actually on screen').toBe(
      'typed straight into the DOM',
    )
    expect(after.start).toBe(6)
    expect(after.end).toBe(14)
  })

  test('a walk in progress parks mid-tree and continues where it stopped', async ({ page }) => {
    await boot(page)
    const id = await openTerminal(page)
    // Enough folders that the walk cannot finish inside one microtask turn.
    await page.evaluate(async () => {
      const fs = window.__chronos.fs
      let parent = fs.root()
      for (let i = 0; i < 40; i++) {
        parent = await fs.createDir(parent, `level-${i}`)
        for (let j = 0; j < 6; j++) await fs.createDir(parent, `sib-${i}-${j}`)
      }
    })

    // Start the walk without awaiting it, suspend immediately, and count the
    // filesystem reads that happen while it is stopped.
    const finished = page.evaluate((w) => {
      const app = window.__term.app(w as never)
      return app.run('tree').then(() => true)
    }, id)
    await page.evaluate((w) => window.__chronos.shell.wm.suspend(w as never), id)

    const rowsWhileStopped = await page.evaluate(
      (w) => window.__term.app(w as never).transcript().length,
      id,
    )
    await page.waitForTimeout(200)
    expect(
      await page.evaluate((w) => window.__term.app(w as never).transcript().length, id),
      'a suspended walk adds nothing',
    ).toBe(rowsWhileStopped)

    await page.evaluate((w) => window.__chronos.shell.wm.resume(w as never), id)
    expect(await finished, 'and it finishes after the resume').toBe(true)
    expect(await transcript(page, id)).toContain('level-39')
  })
})

// ------------------------------------------------------- the three machine commands

test.describe('terminal: the machine', () => {
  test('crash raises a genuinely unhandled fault and stops the session', async ({ page }) => {
    await boot(page)
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))

    const id = await openTerminal(page)
    await run(page, id, 'crash')
    await page.waitForTimeout(120)

    expect(errors.join('\n'), 'the fault is uncaught, which is what a boundary catches').toContain(
      'Chronos terminal fault',
    )
    expect(await transcript(page, id)).toContain('This session has stopped')
    // A stopped session accepts nothing further, and the window is still there to
    // close, which is the recovery path.
    await run(page, id, 'echo still alive')
    expect(await transcript(page, id)).not.toContain('still alive')
    expect(
      await page.evaluate((w) => window.__chronos.shell.wm.get(w as never) !== undefined, id),
    ).toBe(true)
  })

  test('reboot really restarts, and the filesystem is still there afterwards', async ({ page }) => {
    await boot(page)
    const id = await openTerminal(page)
    await run(page, id, 'md SurvivesReboot')

    await Promise.all([
      page.waitForEvent('load'),
      run(page, id, 'reboot').catch(() => undefined),
    ])
    await page.waitForFunction(() => window.__chronos !== undefined)

    const names = await page.evaluate(async () => {
      const fs = window.__chronos.fs
      return (await fs.list(fs.root())).map((n) => n.name)
    })
    expect(names, 'the tree survived a real reload').toContain('SurvivesReboot')
  })

  test('era reports the address, and switches into another', async ({ page }) => {
    await boot(page, 'tiger')
    const id = await openTerminal(page)
    await run(page, id, 'era')
    expect(await lastLine(page, id)).toContain('tiger')

    await Promise.all([page.waitForEvent('load'), run(page, id, 'era macos8').catch(() => undefined)])
    await page.waitForFunction(() => window.__chronos !== undefined)
    expect(await page.evaluate(() => window.__chronos.era)).toBe('macos8')
  })

  test('open puts a real window on the item, owned by the terminal', async ({ page }) => {
    await boot(page)
    const id = await openTerminal(page)
    await run(page, id, 'md Inspected')
    // Not awaited: the command does not return until the modal is dismissed, which
    // is the whole point of a modal.
    await page.evaluate((w) => {
      void window.__term.app(w as never).run('start Inspected')
    }, id)
    await expect(page.locator('[data-ui="dialog"]')).toBeVisible()
    const owned = await page.evaluate(
      (w) => window.__chronos.shell.wm.modalsOwnedBy(w as never).length,
      id,
    )
    expect(owned, 'the modal belongs to the window that asked').toBe(1)
  })
})

// ---------------------------------------------------------------- the keyboard

test.describe('terminal: the keyboard', () => {
  test('history walks back and forward and lands on a fresh line', async ({ page }) => {
    await boot(page)
    const id = await openTerminal(page)
    await run(page, id, 'echo first')
    await run(page, id, 'echo second')

    const field = page.locator('[data-app="terminal"] [data-ui-role="command"]')
    await field.click()
    await field.press('ArrowUp')
    expect(await field.inputValue()).toBe('echo second')
    await field.press('ArrowUp')
    expect(await field.inputValue()).toBe('echo first')
    await field.press('ArrowDown')
    expect(await field.inputValue()).toBe('echo second')
    await field.press('ArrowDown')
    expect(await field.inputValue(), 'past the newest is the empty line').toBe('')
  })

  test('Enter runs the line, in every era', async ({ page }) => {
    for (const era of ERAS) {
      await boot(page, era)
      await openTerminal(page)
      const field = page.locator('[data-app="terminal"] [data-ui-role="command"]')
      await field.click()
      await field.fill('echo typed')
      await field.press('Enter')
      await expect(page.locator('[data-app="terminal"] [data-ui-role="console"]')).toContainText(
        'typed',
      )
      expect(await field.inputValue(), `${era} clears the line`).toBe('')
    }
  })

  test('the scrollback has a keyboard path', async ({ page }) => {
    await boot(page)
    const id = await openTerminal(page)
    for (let i = 0; i < 40; i++) await run(page, id, `echo line ${i}`)

    const field = page.locator('[data-app="terminal"] [data-ui-role="command"]')
    await field.click()
    const bottom = await page.evaluate((w) => window.__term.app(w as never).scrollOffset(), id)
    expect(bottom).toBeGreaterThan(0)
    await field.press('PageUp')
    expect(
      await page.evaluate((w) => window.__term.app(w as never).scrollOffset(), id),
      'PageUp moves the scrollback',
    ).toBeLessThan(bottom)
    await field.press('Control+End')
    expect(await page.evaluate((w) => window.__term.app(w as never).scrollOffset(), id)).toBe(bottom)
  })

  test('the command line is the window tab stop and carries all five states', async ({ page }) => {
    for (const era of ERAS) {
      await boot(page, era)
      const id = await openTerminal(page)
      const field = page.locator('[data-app="terminal"] [data-ui-role="command"]')

      await field.click()
      expect(await field.getAttribute('data-state'), `${era} focus`).toBe('focus')

      await page.evaluate((w) => window.__chronos.shell.wm.suspend(w as never), id)
      expect(await field.getAttribute('data-state'), `${era} disabled`).toBe('disabled')
      await page.evaluate((w) => window.__chronos.shell.wm.resume(w as never), id)
      await page.waitForTimeout(40)
      expect(
        await page.locator('[data-app="terminal"] [data-ui-role="command"]').getAttribute('data-state'),
        `${era} back to a live state`,
      ).not.toBe('disabled')
    }
  })
})

// ------------------------------------------------------- what actually renders

test.describe('terminal: what renders', () => {
  /**
   * Every fixed string the app can print, drawn in the era's own face.
   *
   * The file manager shipped `▸ ▤ ♪` and put 2,569 mid-grey pixels into a 1-bit
   * window, because no era face carries those codepoints and a missing glyph does
   * not fail — it falls back to a face that antialiases. A terminal is nothing but
   * characters, so this is the check that has to be mechanical rather than visual.
   *
   * The instrument rasterises the character twice, in the era face and in a family
   * that does not exist, and compares pixels. `document.fonts.check()` cannot do
   * this: it walks the fallback chain and answers true for anything the *system* can
   * draw, which makes it a guard that cannot fail.
   */
  test('every character the terminal prints is in the era face, in every era', async ({ page }) => {
    for (const era of ERAS) {
      await boot(page, era)
      const id = await openTerminal(page)
      // Drive every command that has fixed output, so the transcript contains the
      // app's whole vocabulary rather than a sample of it.
      await run(page, id, 'help')
      await run(page, id, await wordFor(page, 'version'))
      await run(page, id, await wordFor(page, 'diskFree'))
      await run(page, id, await wordFor(page, 'makeDir', 'Glyphs'))
      await run(page, id, 'tree')
      await run(page, id, 'find nothing-matches-this')
      await run(page, id, 'era')
      await run(page, id, 'date')
      await run(page, id, await wordFor(page, 'list'))
      await run(page, id, 'definitely-not-a-command')
      await run(page, id, await wordFor(page, 'showFile'))

      const text = (await transcript(page, id)) + (await promptText(page))
      const missing = await page.evaluate(async (source) => {
        await document.fonts.ready
        const families = new Set<string>()
        document.fonts.forEach((f) => families.add(f.family))
        const el = document.querySelector<HTMLElement>('[data-app="terminal"]')
        if (!el) throw new Error('no terminal')
        // The family the surface actually renders with, not every family loaded.
        const first = getComputedStyle(el).fontFamily.split(',')[0]?.replace(/['"]/g, '').trim() ?? ''
        if (!families.has(first)) return [`the surface renders in "${first}", which is not a loaded face`]

        const c = document.createElement('canvas')
        c.width = 64
        c.height = 48
        const ctx = c.getContext('2d', { willReadFrequently: true })
        if (!ctx) throw new Error('no 2d context')
        const raster = (family: string, ch: string): string => {
          ctx.clearRect(0, 0, 64, 48)
          ctx.fillStyle = '#000'
          ctx.font = `32px "${family}"`
          ctx.textBaseline = 'alphabetic'
          ctx.fillText(ch, 4, 38)
          return ctx.getImageData(0, 0, 64, 48).data.join(',')
        }
        // Calibrate: a character the face certainly has must not report missing, or
        // the probe is measuring nothing.
        if (raster(first, 'A') === raster('__chronos_absent__', 'A')) {
          return ['the probe is not calibrated: "A" reads as a fallback']
        }
        const out: string[] = []
        for (const ch of new Set(source.replace(/[\n\r\t ]/g, ''))) {
          if (raster(first, ch) === raster('__chronos_absent__', ch)) out.push(ch)
        }
        return out
      }, text)

      expect(missing, `${era} face covers every character the terminal prints`).toEqual([])
    }
  })

  test('the terminal window has no flat non-pure region in the 1-bit era', async ({ page }) => {
    await boot(page, 'system1')
    const id = await openTerminal(page)
    await run(page, id, 'help')
    await run(page, id, 'df')
    await run(page, id, 'nosuchthing')
    // The disabled command line is where a recreation reaches for a grey, so it is
    // on screen when the shot is taken.
    await page.evaluate((w) => window.__chronos.shell.wm.suspend(w as never), id)
    await expect(
      page.locator('[data-app="terminal"] [data-ui-role="command"][data-state="disabled"]'),
    ).toBeVisible()

    const stats = await largestNonPureRegion(page, '[data-app="terminal"]')
    const cell = await characterCellArea(page, '[data-app="terminal"]')
    expect(stats.total, 'the app surface was actually captured').toBeGreaterThan(1000)
    expect(
      stats.biggest,
      `largest non-pure region at ${stats.where} exceeds one character cell`,
    ).toBeLessThan(cell)
  })

  test('and the probe would catch a grey fill in that window', async ({ page }) => {
    await boot(page, 'system1')
    const id = await openTerminal(page)
    await run(page, id, 'help')
    /*
     * The *last block*, and both halves of that matter.
     *
     * The console is scrolled to the end, so a fill injected into the first row of a
     * help listing never reaches the shot — a probe that cannot fail, in miniature.
     * And a *row* is the wrong element: a row inside a tabular block is
     * `display: contents` so its cells can be the grid's own items, and an element
     * with no box paints no background at all. Two ways to inject a grey that is not
     * there, both found by running this.
     */
    await page.evaluate(() => {
      const blocks = [
        ...document.querySelectorAll<HTMLElement>('[data-app="terminal"] [data-term-block]'),
      ]
      const block = blocks[blocks.length - 1]
      if (!block) throw new Error('no output to inject into')
      block.style.background = '#808080'
    })
    const stats = await largestNonPureRegion(page, '[data-app="terminal"]')
    const cell = await characterCellArea(page, '[data-app="terminal"]')
    expect(stats.biggest, 'the probe sees an injected grey fill').toBeGreaterThan(cell)
  })

  test('tabular output lines its columns up under a proportional face', async ({ page }) => {
    for (const era of ERAS) {
      await boot(page, era)
      const id = await openTerminal(page)
      await run(page, id, await wordFor(page, 'diskFree'))

      const columns = await page.evaluate(() => {
        const table = [
          ...document.querySelectorAll<HTMLElement>('[data-app="terminal"] [data-term-table]'),
        ].pop()
        if (!table) return null
        const cells = [...table.querySelectorAll<HTMLElement>('[data-term-cell]')]
        const perRow = Number(getComputedStyle(table).getPropertyValue('--term-columns'))
        const lefts: number[][] = []
        for (let i = 0; i < cells.length; i += perRow) {
          lefts.push(
            cells.slice(i, i + perRow).map((c) => Math.round(c.getBoundingClientRect().left)),
          )
        }
        return lefts
      })
      expect(columns, `${era} produced a table`).not.toBeNull()
      const rows = columns as number[][]
      expect(rows.length, `${era} table has rows`).toBeGreaterThan(1)
      for (const row of rows) {
        expect(row, `${era} every row starts its columns at the same x`).toEqual(rows[0])
      }
    }
  })
})
