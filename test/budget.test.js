/**
 * Transfer-size budget.
 *
 * The brief's "cold load under 2s on 4G" is the constraint that forces skins to
 * be lazily-loaded chunks. Slow 4G is roughly 1.6 Mbps with 150ms RTT, so the
 * critical path has about 250 KB to work with. This test holds each chunk class
 * to its share, and it runs from phase 1 so a regression fails the build rather
 * than being discovered when all six eras are in the bundle.
 *
 * Sizes are gzipped, because that is what crosses the wire.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'

const ROOT = new URL('..', import.meta.url).pathname
const DIST = join(ROOT, 'dist')

const KB = 1024
const BUDGETS = {
  /** Core: window manager, filesystem, input, shell. */
  core: 60 * KB,
  /** One era skin: templates plus CSS plus icons. */
  skin: 40 * KB,
  /** One era's font subset. */
  font: 30 * KB,
  /** One app, loaded on first open. */
  app: 20 * KB,
  /** Everything the browser must fetch before the desktop is interactive. */
  criticalPath: 250 * KB,
}

function gz(file) {
  return gzipSync(readFileSync(file)).length
}

function assets() {
  const dir = join(DIST, 'assets')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .map((name) => ({ name, path: join(dir, name) }))
    .filter((f) => statSync(f.path).isFile())
}

function classify(name) {
  if (/\.(woff2?|ttf|otf)$/.test(name)) {
    // A `-defer` face is declared but not on the critical path: a browser only
    // fetches an @font-face when rendered text uses it, and floating palette
    // captions or 14pt+ headers do not exist on first paint.
    return /-defer[.-]/.test(name) ? 'font-deferred' : 'font'
  }
  if (/^skin-/.test(name)) return 'skin'
  if (/^app-/.test(name)) return 'app'
  return 'core'
}

test('dist exists — run the build first', () => {
  assert.ok(existsSync(DIST), 'dist/ is missing; run `npm run build`')
  assert.ok(existsSync(join(DIST, 'index.html')), 'dist/index.html is missing')
})

test('each chunk is inside its class budget', () => {
  const failures = []
  // Skin chunks are per-era; CSS and JS for one era share that era's budget.
  const skinTotals = new Map()

  for (const { name, path } of assets()) {
    const kind = classify(name)
    const size = gz(path)
    if (kind === 'skin') {
      const era = /^skin-([^.-]+)/.exec(name)?.[1] ?? name
      skinTotals.set(era, (skinTotals.get(era) ?? 0) + size)
      continue
    }
    if (kind === 'font-deferred') continue
    const budget = BUDGETS[kind]
    if (size > budget) {
      failures.push(`${name} (${kind}) ${(size / KB).toFixed(1)}KB > ${(budget / KB).toFixed(0)}KB`)
    }
  }

  for (const [era, size] of skinTotals) {
    if (size > BUDGETS.skin) {
      failures.push(
        `skin "${era}" ${(size / KB).toFixed(1)}KB > ${(BUDGETS.skin / KB).toFixed(0)}KB`,
      )
    }
  }

  assert.deepEqual(failures, [], 'Over budget:\n' + failures.join('\n'))
})

test('the critical path fits the 4G budget', () => {
  // Critical path is the document plus core plus exactly one era skin and its
  // font — never all six, which is the whole point of splitting them.
  const html = gz(join(DIST, 'index.html'))
  let core = 0
  const perSkin = new Map()
  const perFont = new Map()

  for (const { name, path } of assets()) {
    const kind = classify(name)
    const size = gz(path)
    if (kind === 'core') core += size
    else if (kind === 'skin') {
      const era = /^skin-([^.-]+)/.exec(name)?.[1] ?? name
      perSkin.set(era, (perSkin.get(era) ?? 0) + size)
    } else if (kind === 'font') perFont.set(name, size)
  }

  const worstSkin = Math.max(0, ...perSkin.values())
  // Every critical-path font loads together, so they sum. Windows XP needs four
  // faces because Microsoft specifies four; two of them are deferred and excluded.
  const fontTotal = [...perFont.values()].reduce((a, b) => a + b, 0)
  const total = html + core + worstSkin + fontTotal

  assert.ok(
    total <= BUDGETS.criticalPath,
    `critical path ${(total / KB).toFixed(1)}KB > ${(BUDGETS.criticalPath / KB).toFixed(0)}KB ` +
      `(html ${(html / KB).toFixed(1)} + core ${(core / KB).toFixed(1)} + ` +
      `skin ${(worstSkin / KB).toFixed(1)} + fonts ${(fontTotal / KB).toFixed(1)})`,
  )
})

test('the critical-path fonts fit their share', () => {
  // The per-class font budget applies to everything that loads on first paint,
  // summed — not to the largest single file.
  let total = 0
  const loaded = []
  for (const { name, path } of assets()) {
    if (classify(name) !== 'font') continue
    total += gz(path)
    loaded.push(name)
  }
  assert.ok(
    total <= BUDGETS.font,
    `critical-path fonts ${(total / KB).toFixed(1)}KB > ${(BUDGETS.font / KB).toFixed(0)}KB ` +
      `across ${loaded.length} faces: ${loaded.join(', ')}`,
  )
})

test('skins are split out of core rather than bundled into it', () => {
  // If this fails, every era ships on first load and the 4G budget is a fiction.
  const names = assets().map((a) => a.name)
  assert.ok(
    names.some((n) => /^skin-/.test(n)),
    'no skin-* chunk found: skins must be separately loadable',
  )
})

test('runtime dependencies are limited to idb-keyval', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
  assert.deepEqual(
    Object.keys(pkg.dependencies ?? {}),
    ['idb-keyval'],
    'the only permitted runtime dependency is idb-keyval',
  )
})
