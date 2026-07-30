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

function eraOf(name) {
  return /^skin-([^.-]+)/.exec(name)?.[1] ?? name
}

/**
 * Which era each font belongs to, read out of the stylesheet that references it.
 *
 * Necessary because Vite flattens asset filenames, so `system-sub.woff2` carries no
 * trace of having come from `src/skins/win31/fonts/`. Attributing fonts by filename
 * convention would work until two eras picked similar names; reading the @font-face
 * URLs out of each skin's compiled CSS is exact.
 *
 * This matters because only ONE era ever loads. Summing every era's fonts into the
 * critical path would fail the budget for a reason that cannot happen in a browser,
 * and would keep failing harder with each era added.
 */
function fontsByEra() {
  const map = new Map()
  for (const { name, path } of assets()) {
    if (!/^skin-.*\.css$/.test(name)) continue
    const css = readFileSync(path, 'utf8')
    const era = eraOf(name)
    for (const m of css.matchAll(/url\(\s*["']?[^"')]*?([\w.-]+\.woff2?)["']?\s*\)/g)) {
      const file = m[1]
      if (!map.has(file)) map.set(file, new Set())
      map.get(file).add(era)
    }
  }
  return map
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
      skinTotals.set(eraOf(name), (skinTotals.get(eraOf(name)) ?? 0) + size)
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
  const owners = fontsByEra()
  let core = 0
  const perEra = new Map()

  const add = (era, n) => perEra.set(era, (perEra.get(era) ?? 0) + n)

  for (const { name, path } of assets()) {
    const kind = classify(name)
    const size = gz(path)
    if (kind === 'core') core += size
    else if (kind === 'skin') add(eraOf(name), size)
    else if (kind === 'font') {
      // Every critical-path font for one era loads together, so they sum within
      // that era. Windows XP needs four faces because Microsoft specifies four;
      // two of them are deferred and excluded above.
      for (const era of owners.get(name) ?? ['unattributed']) add(era, size)
    }
  }

  const worst = [...perEra.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['none', 0]
  const total = html + core + worst[1]

  assert.ok(
    total <= BUDGETS.criticalPath,
    `critical path ${(total / KB).toFixed(1)}KB > ${(BUDGETS.criticalPath / KB).toFixed(0)}KB ` +
      `(html ${(html / KB).toFixed(1)} + core ${(core / KB).toFixed(1)} + ` +
      `worst era "${worst[0]}" ${(worst[1] / KB).toFixed(1)} incl. its fonts)`,
  )
})

test('each era\'s critical-path fonts fit their share', () => {
  // Per era, not across all of them: one era loads, so one era's faces sum.
  const owners = fontsByEra()
  const perEra = new Map()
  for (const { name, path } of assets()) {
    if (classify(name) !== 'font') continue
    for (const era of owners.get(name) ?? ['unattributed']) {
      if (!perEra.has(era)) perEra.set(era, { total: 0, faces: [] })
      const e = perEra.get(era)
      e.total += gz(path)
      e.faces.push(name)
    }
  }
  const failures = []
  for (const [era, e] of perEra) {
    if (e.total > BUDGETS.font) {
      failures.push(
        `${era}: ${(e.total / KB).toFixed(1)}KB > ${(BUDGETS.font / KB).toFixed(0)}KB ` +
          `across ${e.faces.length} faces (${e.faces.join(', ')})`,
      )
    }
  }
  assert.deepEqual(failures, [], 'Over the font budget:\n' + failures.join('\n'))
})

test('every shipped font is attributable to an era', () => {
  // An unattributed font means a stylesheet stopped referencing a face that is
  // still being emitted, or the URL pattern above stopped matching. Either way the
  // per-era budgets silently become wrong, so this fails loudly instead.
  const owners = fontsByEra()
  const orphans = assets()
    .map((a) => a.name)
    .filter((n) => /\.(woff2?)$/.test(n) && !owners.has(n))
  assert.deepEqual(orphans, [], `fonts no skin stylesheet references: ${orphans.join(', ')}`)
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
