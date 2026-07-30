/**
 * The phase-2 gate: filesystem correctness and reload survival.
 *
 * The headline test creates a tree with binary content, reloads the page, and
 * asserts the content is byte-identical by SHA-256 — not "looks the same", not
 * "the right length". Everything else here defends the properties the rest of the
 * project will lean on: atomicity, the watch notification path, cycle safety,
 * trash round-trips, and the era-blind path codec.
 */

import { test, expect, type Page } from '@playwright/test'

async function boot(page: Page): Promise<void> {
  await page.goto('/')
  await page.waitForFunction(() => window.__chronos !== undefined)
  await page.evaluate(() => window.__chronos.wipeStorage())
  await page.evaluate(() => window.__chronos.reset())
}

/** Reopens the page without wiping, so stored state has to survive on its own. */
async function reload(page: Page): Promise<void> {
  await page.reload()
  await page.waitForFunction(() => window.__chronos !== undefined)
}

test.describe('reload survival', () => {
  test('a tree with binary content is byte-identical after a reload', async ({ page }) => {
    await boot(page)

    // Build a tree with content that is deliberately not text: a byte pattern
    // including nulls and high bytes, which a string round-trip would corrupt.
    const before = await page.evaluate(async () => {
      const fs = window.__chronos.fs
      const docs = (await fs.list(fs.root())).find((n) => n.wellKnown === 'documents')!
      const project = await fs.createDir(docs.id, 'Project')
      const nested = await fs.createDir(project, 'Assets')

      const bytes = new Uint8Array(4096)
      for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31 + 7) % 256
      const binary = await fs.createFile(nested, 'pattern.bin', bytes.buffer, {
        mime: 'application/octet-stream',
      })

      const textId = await fs.createFile(
        project,
        'notes.txt',
        'Saved before the reload — ünïcödé and a tab\there.',
        { mime: 'text/plain' },
      )

      // Classic Mac type/creator codes, which the Properties dialog will surface.
      const typed = await fs.createFile(project, 'Letter', 'typed', {
        mime: 'text/plain',
        typeCode: 'TEXT',
        creatorCode: 'MACS',
      })

      async function sha(id: string): Promise<string> {
        const buf = await fs.readBytes(id as never)
        const digest = await crypto.subtle.digest('SHA-256', buf)
        return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
      }

      return {
        binaryId: binary,
        textId,
        typedId: typed,
        projectId: project,
        binarySha: await sha(binary),
        textSha: await sha(textId),
        text: await fs.readText(textId),
        path: window.__chronos.codec.format(await fs.chain(binary)),
      }
    })

    expect(before.binarySha).toMatch(/^[0-9a-f]{64}$/)

    await reload(page)

    const after = await page.evaluate(async (ids) => {
      const fs = window.__chronos.fs
      async function sha(id: string): Promise<string> {
        const buf = await fs.readBytes(id as never)
        const digest = await crypto.subtle.digest('SHA-256', buf)
        return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
      }
      const typed = await fs.stat(ids.typedId as never)
      return {
        binarySha: await sha(ids.binaryId),
        textSha: await sha(ids.textId),
        text: await fs.readText(ids.textId as never),
        path: window.__chronos.codec.format(await fs.chain(ids.binaryId as never)),
        typeCode: 'typeCode' in typed ? typed.typeCode : undefined,
        creatorCode: 'creatorCode' in typed ? typed.creatorCode : undefined,
        projectChildren: (await fs.list(ids.projectId as never)).map((n) => n.name).sort(),
      }
    }, before)

    // The gate: byte-identical, by hash.
    expect(after.binarySha).toBe(before.binarySha)
    expect(after.textSha).toBe(before.textSha)
    expect(after.text).toBe(before.text)
    // Structure, paths and era metadata all survive too.
    expect(after.path).toBe(before.path)
    expect(after.typeCode).toBe('TEXT')
    expect(after.creatorCode).toBe('MACS')
    expect(after.projectChildren).toEqual(['Assets', 'Letter', 'notes.txt'])
  })

  test('an edit made after a reload persists across a second reload', async ({ page }) => {
    await boot(page)
    const id = await page.evaluate(async () => {
      const fs = window.__chronos.fs
      return fs.createFile(fs.root(), 'edited.txt', 'first', { mime: 'text/plain' })
    })

    await reload(page)
    await page.evaluate(async (fileId) => {
      await window.__chronos.fs.write(fileId as never, 'second')
    }, id)

    await reload(page)
    const text = await page.evaluate(
      async (fileId) => window.__chronos.fs.readText(fileId as never),
      id,
    )
    expect(text).toBe('second')
  })

  test('the seeded tree is created once, not on every boot', async ({ page }) => {
    await boot(page)
    const first = await page.evaluate(async () => {
      const fs = window.__chronos.fs
      return { root: fs.root(), children: (await fs.list(fs.root())).length }
    })
    await reload(page)
    const second = await page.evaluate(async () => {
      const fs = window.__chronos.fs
      return { root: fs.root(), children: (await fs.list(fs.root())).length }
    })
    // A reseed would mint a new root id and duplicate the well-known folders.
    expect(second.root).toBe(first.root)
    expect(second.children).toBe(first.children)
  })

  test('the schema version is recorded and stable', async ({ page }) => {
    await boot(page)
    const v1 = await page.evaluate(() => window.__chronos.fs.schemaVersion())
    await reload(page)
    const v2 = await page.evaluate(() => window.__chronos.fs.schemaVersion())
    expect(v1).toBeGreaterThanOrEqual(1)
    expect(v2).toBe(v1)
  })

  test('a store written by a newer build is refused rather than corrupted', async ({ page }) => {
    await boot(page)
    // Downgrading a schema would silently destroy data, so opening must fail loudly.
    const result = await page.evaluate(async () => {
      const fs = window.__chronos.fs
      const current = fs.schemaVersion()
      await window.__chronos.diag.setSchemaVersion(current + 99)
      try {
        await fs.reopen()
        return 'opened'
      } catch (e) {
        return e instanceof Error ? e.message : String(e)
      }
    })
    expect(result).toContain('version')
    expect(result).not.toBe('opened')
  })
})

test.describe('atomicity and consistency', () => {
  test('a created file and its parent entry land together', async ({ page }) => {
    await boot(page)
    const consistent = await page.evaluate(async () => {
      const fs = window.__chronos.fs
      const id = await fs.createFile(fs.root(), 'atomic.txt', 'x', { mime: 'text/plain' })
      const parent = await fs.stat(fs.root())
      const listed = await fs.list(fs.root())
      return {
        inParent: 'childIds' in parent ? parent.childIds.includes(id) : false,
        listable: listed.some((n) => n.id === id),
        readable: (await fs.readText(id)) === 'x',
      }
    })
    expect(consistent).toEqual({ inParent: true, listable: true, readable: true })
  })

  test('purging a tree removes every descendant and its content', async ({ page }) => {
    await boot(page)
    const result = await page.evaluate(async () => {
      const fs = window.__chronos.fs
      const top = await fs.createDir(fs.root(), 'Doomed')
      const mid = await fs.createDir(top, 'Middle')
      const leaf = await fs.createFile(mid, 'leaf.txt', 'bye', { mime: 'text/plain' })
      await fs.purge(top)
      const errors: string[] = []
      for (const id of [top, mid, leaf]) {
        try {
          await fs.stat(id)
          errors.push('still present')
        } catch {
          errors.push('gone')
        }
      }
      const rootChildren = (await fs.list(fs.root())).map((n) => n.name)
      return { errors, hasDoomed: rootChildren.includes('Doomed') }
    })
    expect(result.errors).toEqual(['gone', 'gone', 'gone'])
    expect(result.hasDoomed).toBe(false)
  })

  test('orphaned content is reclaimed at open', async ({ page }) => {
    await boot(page)
    const reclaimed = await page.evaluate(async () => {
      const fs = window.__chronos.fs
      const id = await fs.createFile(fs.root(), 'orphan.txt', 'abandoned', { mime: 'text/plain' })
      // Simulate the one inconsistency the write order permits: content stored,
      // metadata gone. A crash between the two writes produces exactly this.
      await window.__chronos.diag.orphanContent(id)
      const before = await fs.blobCount()
      await fs.reopen()
      const after = await fs.blobCount()
      return { before, after }
    })
    expect(reclaimed.after).toBe(reclaimed.before - 1)
  })

  test('name collisions are refused, and the decorator finds a free name', async ({ page }) => {
    await boot(page)
    const result = await page.evaluate(async () => {
      const fs = window.__chronos.fs
      await fs.createFile(fs.root(), 'dup.txt', 'a', { mime: 'text/plain' })
      let code = ''
      try {
        await fs.createFile(fs.root(), 'dup.txt', 'b', { mime: 'text/plain' })
      } catch (e) {
        code = (e as { code?: string }).code ?? ''
      }
      // The era supplies the decoration; the filesystem only enforces uniqueness.
      const suggested = await fs.suggestName(fs.root(), 'dup.txt', (base, n) => {
        const dot = base.lastIndexOf('.')
        return `${base.slice(0, dot)} ${n + 1}${base.slice(dot)}`
      })
      return { code, suggested }
    })
    expect(result.code).toBe('name-conflict')
    expect(result.suggested).toBe('dup 2.txt')
  })

  test('a directory cannot be moved into its own subtree', async ({ page }) => {
    await boot(page)
    const code = await page.evaluate(async () => {
      const fs = window.__chronos.fs
      const outer = await fs.createDir(fs.root(), 'Outer')
      const inner = await fs.createDir(outer, 'Inner')
      try {
        await fs.move(outer, inner)
        return 'allowed'
      } catch (e) {
        return (e as { code?: string }).code ?? 'unknown'
      }
    })
    expect(code).toBe('cycle')
  })

  test('names that no era could store are refused', async ({ page }) => {
    await boot(page)
    const codes = await page.evaluate(async () => {
      const fs = window.__chronos.fs
      const out: string[] = []
      for (const name of ['', '.', '..', 'a/b', 'a\\b', 'HD:thing']) {
        try {
          await fs.createFile(fs.root(), name, '', { mime: 'text/plain' })
          out.push('allowed')
        } catch (e) {
          out.push((e as { code?: string }).code ?? 'unknown')
        }
      }
      return out
    })
    expect(codes).toEqual([
      'invalid-name',
      'invalid-name',
      'invalid-name',
      'invalid-name',
      'invalid-name',
      'invalid-name',
    ])
  })

  test('well-known folders are protected from trashing and purging', async ({ page }) => {
    await boot(page)
    const codes = await page.evaluate(async () => {
      const fs = window.__chronos.fs
      const docs = (await fs.list(fs.root())).find((n) => n.wellKnown === 'documents')!
      const out: string[] = []
      for (const op of ['trash', 'purge'] as const) {
        try {
          if (op === 'trash') await fs.moveToTrash(docs.id)
          else await fs.purge(docs.id)
          out.push('allowed')
        } catch (e) {
          out.push((e as { code?: string }).code ?? 'unknown')
        }
      }
      return out
    })
    expect(codes).toEqual(['locked', 'locked'])
  })
})

test.describe('trash', () => {
  test('round-trips back to the exact original folder', async ({ page }) => {
    await boot(page)
    const result = await page.evaluate(async () => {
      const fs = window.__chronos.fs
      const home = await fs.createDir(fs.root(), 'Home')
      const file = await fs.createFile(home, 'thing.txt', 'content', { mime: 'text/plain' })

      await fs.moveToTrash(file)
      const inTrash = (await fs.list(fs.trash())).some((n) => n.id === file)
      const goneFromHome = (await fs.list(home)).length === 0

      await fs.restoreFromTrash(file)
      const backHome = (await fs.list(home)).some((n) => n.id === file)
      const trashEmpty = (await fs.list(fs.trash())).length === 0
      const content = await fs.readText(file)
      return { inTrash, goneFromHome, backHome, trashEmpty, content }
    })
    expect(result).toEqual({
      inTrash: true,
      goneFromHome: true,
      backHome: true,
      trashEmpty: true,
      content: 'content',
    })
  })

  test('restores to the root when the original folder is gone', async ({ page }) => {
    await boot(page)
    const parentName = await page.evaluate(async () => {
      const fs = window.__chronos.fs
      const home = await fs.createDir(fs.root(), 'Temporary')
      const file = await fs.createFile(home, 'orphaned.txt', 'x', { mime: 'text/plain' })
      await fs.moveToTrash(file)
      await fs.purge(home)
      await fs.restoreFromTrash(file)
      const node = await fs.stat(file)
      return (await fs.stat(node.parent!)).wellKnown
    })
    expect(parentName).toBe('root')
  })
})

test.describe('watch — the no-duplicate-state invariant', () => {
  test('two directory windows on the same folder stay in step', async ({ page }) => {
    await boot(page)

    // Two windows, both showing Documents. Neither knows the other exists.
    const docsId = await page.evaluate(async () => {
      const fs = window.__chronos.fs
      return (await fs.list(fs.root())).find((n) => n.wellKnown === 'documents')!.id
    })
    await page.evaluate((id) => {
      window.__chronos.openDirectoryWindow(id as never)
      window.__chronos.openDirectoryWindow(id as never)
    }, docsId)

    // boot() closes the window main.ts opens, so these two are all there is.
    const views = page.locator('.dirview')
    await expect(views).toHaveCount(2)
    const a = views.nth(0)
    const b = views.nth(1)
    await expect(a.locator('.dirview-empty')).toBeVisible()
    await expect(b.locator('.dirview-empty')).toBeVisible()

    // The two windows cascade and overlap, so raise A the way a user would
    // before reaching for its toolbar.
    await page
      .locator('[data-win-id]')
      .nth(0)
      .locator('[data-part="titlebar"]')
      .click({ position: { x: 30, y: 8 } })

    // Create through window A's own button; window B must follow.
    await a.locator('button', { hasText: 'New folder' }).click()
    await expect(a.locator('.dirview-row')).toHaveCount(1)
    await expect(b.locator('.dirview-row')).toHaveCount(1)
    await expect(b.locator('.dirview-name')).toHaveText('New Folder')

    // And a mutation from neither window — straight to the filesystem — reaches both.
    await page.evaluate(async (id) => {
      const fs = window.__chronos.fs
      await fs.createFile(id as never, 'from-outside.txt', 'x', { mime: 'text/plain' })
    }, docsId)
    await expect(a.locator('.dirview-row')).toHaveCount(2)
    await expect(b.locator('.dirview-row')).toHaveCount(2)
  })

  test('a deletion under a window redirects it rather than leaving it stale', async ({ page }) => {
    await boot(page)
    const dirId = await page.evaluate(async () => {
      const fs = window.__chronos.fs
      return fs.createDir(fs.root(), 'Vanishing')
    })
    await page.evaluate((id) => window.__chronos.openDirectoryWindow(id as never), dirId)

    // Expected strings come from the active codec rather than being hardcoded, so
    // this passes under any era's path syntax.
    const expected = await page.evaluate(async (id) => {
      const fs = window.__chronos.fs
      const codec = window.__chronos.codec
      return {
        dir: codec.format(await fs.chain(id as never)),
        root: codec.format(await fs.chain(fs.root())),
      }
    }, dirId)

    const view = page.locator('.dirview').nth(0)
    await expect(view.locator('.dirview-path')).toHaveText(expected.dir)

    await page.evaluate(async (id) => {
      await window.__chronos.fs.purge(id as never)
    }, dirId)

    // The window must recover to the root, not keep rendering a folder that is gone.
    await expect(view.locator('.dirview-path')).toHaveText(expected.root)
  })

  test('closing a window releases its watcher', async ({ page }) => {
    await boot(page)
    const before = await page.evaluate(() => window.__chronos.fs.watcherCount())
    const id = await page.evaluate(() => window.__chronos.openDirectoryWindow())
    const during = await page.evaluate(() => window.__chronos.fs.watcherCount())
    await page.evaluate(async (winId) => {
      await window.__chronos.shell.wm.close(winId as never, { force: true })
    }, id)
    const after = await page.evaluate(() => window.__chronos.fs.watcherCount())
    expect(during).toBeGreaterThan(before)
    expect(after).toBe(before)
  })

  test('reading a file does not emit a change event', async ({ page }) => {
    await boot(page)
    // Otherwise a listing that reads file contents would retrigger itself forever.
    const events = await page.evaluate(async () => {
      const fs = window.__chronos.fs
      const id = await fs.createFile(fs.root(), 'read-me.txt', 'x', { mime: 'text/plain' })
      const seen: string[] = []
      const un = fs.watchAll((e) => seen.push(e.type))
      await fs.readText(id)
      await fs.readBytes(id)
      un()
      return seen
    })
    expect(events).toEqual([])
  })
})

test.describe('path codec', () => {
  test('formats and parses back to the same node', async ({ page }) => {
    await boot(page)
    const result = await page.evaluate(async () => {
      const fs = window.__chronos.fs
      const codec = window.__chronos.codec
      const docs = (await fs.list(fs.root())).find((n) => n.wellKnown === 'documents')!
      const dir = await fs.createDir(docs.id, 'Round Trip')
      const file = await fs.createFile(dir, 'letter.txt', 'x', { mime: 'text/plain' })

      const path = codec.format(await fs.chain(file))
      const resolved = await codec.parse(path, fs.root())
      const relative = await codec.parse('letter.txt', dir)
      const dotdot = await codec.parse('../', dir)
      const missing = await codec.parse('/nope/at/all', fs.root())
      return {
        path,
        matches: resolved === file,
        relativeMatches: relative === file,
        dotdotMatches: dotdot === docs.id,
        missing,
      }
    })
    // Era-agnostic on purpose: this file tests the filesystem, and the path syntax
    // belongs to whichever skin is active. The concrete Windows spelling is
    // asserted in xp-fidelity.spec.ts.
    expect(result.path).toContain('Round Trip')
    expect(result.path).toContain('letter.txt')
    expect(result.matches).toBe(true)
    expect(result.relativeMatches).toBe(true)
    expect(result.dotdotMatches).toBe(true)
    expect(result.missing).toBeNull()
  })

  test('directories format with a trailing separator and files without', async ({ page }) => {
    await boot(page)
    const paths = await page.evaluate(async () => {
      const fs = window.__chronos.fs
      const codec = window.__chronos.codec
      const dir = await fs.createDir(fs.root(), 'Folder')
      const file = await fs.createFile(dir, 'f.txt', '', { mime: 'text/plain' })
      return {
        sep: codec.separator,
        root: codec.format(await fs.chain(fs.root())),
        dir: codec.format(await fs.chain(dir)),
        file: codec.format(await fs.chain(file)),
      }
    })
    // The rule, not the spelling: a directory path ends in the era's separator and
    // a file path does not. Whether that separator is / or \\ or : is the skin's.
    expect(paths.dir.endsWith(paths.sep)).toBe(true)
    expect(paths.file.endsWith(paths.sep)).toBe(false)
    expect(paths.dir).toContain('Folder')
    expect(paths.file).toContain('f.txt')
    expect(paths.root.endsWith(paths.sep)).toBe(true)
  })
})

test.describe('storage', () => {
  test('headroom is reported and grows with content', async ({ page }) => {
    await boot(page)
    const result = await page.evaluate(async () => {
      const fs = window.__chronos.fs
      const before = await fs.storageHeadroom()
      const bytes = new Uint8Array(512 * 1024)
      for (let i = 0; i < bytes.length; i += 7) bytes[i] = i % 251
      await fs.createFile(fs.root(), 'big.bin', bytes.buffer, {
        mime: 'application/octet-stream',
      })
      const after = await fs.storageHeadroom()
      return { before, after }
    })
    // Chrome reports an estimate; if it declines, the advisory path is still valid.
    if (result.before !== null && result.after !== null) {
      expect(result.after.usage).toBeGreaterThan(result.before.usage)
      expect(result.after.quota).toBeGreaterThan(0)
    } else {
      expect(result.after).toBeNull()
    }
  })
})

test.describe('cross-tab', () => {
  test('a write in one tab reaches a window in another', async ({ page, context }) => {
    // Two tabs share one IndexedDB, so without cross-tab notification the
    // filesystem would be the single source of truth only within a tab.
    await boot(page)
    const docsId = await page.evaluate(async () => {
      const fs = window.__chronos.fs
      return (await fs.list(fs.root())).find((n) => n.wellKnown === 'documents')!.id
    })
    await page.evaluate((id) => window.__chronos.openDirectoryWindow(id as never), docsId)
    const view = page.locator('.dirview').nth(0)
    await expect(view.locator('.dirview-empty')).toBeVisible()

    const other = await context.newPage()
    await other.goto('/')
    await other.waitForFunction(() => window.__chronos !== undefined)
    await other.evaluate(async (id) => {
      await window.__chronos.fs.createDir(id as never, 'From Other Tab')
    }, docsId)

    // The first tab re-reads on the broadcast; the payload carries ids only, so
    // it cannot be holding a stale copy of the content.
    await expect(view.locator('.dirview-row')).toHaveCount(1)
    await expect(view.locator('.dirview-name')).toHaveText('From Other Tab')
    await other.close()
  })

  test('a tab ignores the echo of its own broadcast', async ({ page }) => {
    await boot(page)
    const renders = await page.evaluate(async () => {
      const fs = window.__chronos.fs
      let remote = 0
      let local = 0
      const un = fs.watchAll((e) => (e.remote ? remote++ : local++))
      await fs.createDir(fs.root(), 'Local Only')
      await new Promise((r) => setTimeout(r, 120))
      un()
      return { remote, local }
    })
    // One local event, and no self-delivered remote duplicate.
    expect(renders.local).toBe(1)
    expect(renders.remote).toBe(0)
  })
})
