/**
 * Architecture invariants.
 *
 * CLAUDE.md states these as rules. This file makes them mechanical, so a
 * violation fails the build instead of surviving until someone notices at
 * phase 4. Runs on the Node test runner with no dependencies.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const SRC = join(ROOT, 'src')

const ERA_IDS = ['system1', 'win31', 'macos8', 'winxp', 'tiger', 'ledger']

function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

function sources(subdir) {
  return walk(join(SRC, subdir)).filter((f) => f.endsWith('.ts') || f.endsWith('.css'))
}

/**
 * Strips comments but keeps string literals. Comments in core that *explain* era
 * neutrality are good; a string literal like `=== 'winxp'` is the violation we
 * are hunting, so stripping strings would hide exactly the wrong thing.
 */
function stripComments(src) {
  let out = ''
  let i = 0
  const n = src.length
  while (i < n) {
    const c = src[i]
    const next = src[i + 1]
    if (c === '/' && next === '/') {
      while (i < n && src[i] !== '\n') i++
      continue
    }
    if (c === '/' && next === '*') {
      i += 2
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++
      i += 2
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c
      out += c
      i++
      while (i < n) {
        if (src[i] === '\\') {
          out += src[i] + (src[i + 1] ?? '')
          i += 2
          continue
        }
        out += src[i]
        if (src[i] === quote) {
          i++
          break
        }
        i++
      }
      continue
    }
    out += c
    i++
  }
  return out
}

function rel(file) {
  return relative(ROOT, file).split(sep).join('/')
}

test('no era identifiers leak into core, apps or the harness', () => {
  const offences = []
  for (const dir of ['core', 'apps', 'harness']) {
    for (const file of sources(dir)) {
      const code = stripComments(readFileSync(file, 'utf8')).toLowerCase()
      for (const era of ERA_IDS) {
        // Word-boundary match so `tiger` does not fire on e.g. `integer`.
        const re = new RegExp(`\\b${era}\\b`)
        if (re.test(code)) offences.push(`${rel(file)} mentions era id "${era}"`)
      }
    }
  }
  assert.deepEqual(
    offences,
    [],
    'Era knowledge must live only in src/skins. Offences:\n' + offences.join('\n'),
  )
})

test('no era identifiers leak into the shell', () => {
  // The shell is parameterised by the skin manifest, so it must be era-blind too.
  const offences = []
  for (const file of sources('shell')) {
    const code = stripComments(readFileSync(file, 'utf8')).toLowerCase()
    for (const era of ERA_IDS) {
      const re = new RegExp(`\\b${era}\\b`)
      if (re.test(code)) offences.push(`${rel(file)} mentions era id "${era}"`)
    }
  }
  assert.deepEqual(offences, [], 'Shell offences:\n' + offences.join('\n'))
})

test('persistence is reachable only through the filesystem layer', () => {
  const offences = []
  for (const file of walk(SRC).filter((f) => f.endsWith('.ts'))) {
    const relPath = rel(file)
    if (relPath.startsWith('src/core/fs/')) continue
    const code = stripComments(readFileSync(file, 'utf8'))
    if (/\bidb-keyval\b/.test(code)) offences.push(`${relPath} imports idb-keyval directly`)
    if (/\bindexedDB\b/.test(code)) offences.push(`${relPath} touches indexedDB directly`)
  }
  assert.deepEqual(
    offences,
    [],
    'All persistence flows through src/core/fs. Offences:\n' + offences.join('\n'),
  )
})

test('the window manager never writes top or left', () => {
  const offences = []
  for (const file of sources('core/wm')) {
    const code = stripComments(readFileSync(file, 'utf8'))
    const re = /\.style\.(top|left)\s*=/g
    let m
    while ((m = re.exec(code)) !== null) {
      offences.push(`${rel(file)} assigns .style.${m[1]}`)
    }
    if (/setProperty\(\s*['"](top|left)['"]/.test(code)) {
      offences.push(`${rel(file)} sets top/left via setProperty`)
    }
  }
  assert.deepEqual(
    offences,
    [],
    'Window movement is transform-only. Offences:\n' + offences.join('\n'),
  )
})

test('the drag hot path reads no layout', () => {
  // getBoundingClientRect / offsetWidth / scrollTop inside the gesture module
  // would force a synchronous reflow every frame, which is the single easiest
  // way to lose the 60fps budget.
  const file = join(SRC, 'core/wm/drag.ts')
  const code = stripComments(readFileSync(file, 'utf8'))
  const banned = [
    'getBoundingClientRect',
    'getClientRects',
    'offsetWidth',
    'offsetHeight',
    'clientWidth',
    'clientHeight',
    'scrollWidth',
    'scrollHeight',
    'getComputedStyle',
  ]
  const found = banned.filter((b) => code.includes(b))
  assert.deepEqual(found, [], `drag.ts must not read layout. Found: ${found.join(', ')}`)
})

test('no placeholder markers anywhere in src', () => {
  const banned = /\b(TODO|FIXME|XXX|HACK)\b|placeholder|in a real implementation|for now, /i
  const offences = []
  for (const file of walk(SRC)) {
    const text = readFileSync(file, 'utf8')
    const lines = text.split('\n')
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (banned.test(line)) offences.push(`${rel(file)}:${i + 1}: ${line.trim()}`)
    }
  }
  assert.deepEqual(offences, [], 'Placeholder markers found:\n' + offences.join('\n'))
})

test('every skin ships metrics and a complete provenance record', () => {
  const skinsDir = join(SRC, 'skins')
  if (!existsSync(skinsDir)) return
  for (const skin of readdirSync(skinsDir)) {
    const dir = join(skinsDir, skin)
    if (!statSync(dir).isDirectory()) continue
    const metrics = join(dir, 'metrics.ts')
    assert.ok(existsSync(metrics), `skin "${skin}" has no metrics.ts`)
    const code = readFileSync(metrics, 'utf8')
    assert.match(
      code,
      /Provenance<ChromeMetrics>/,
      `skin "${skin}" must export a Provenance<ChromeMetrics> record`,
    )
    // An 'unverified' value is allowed to exist; an unexplained one is not.
    const entries = code.match(/\{[^{}]*level:\s*'unverified'[^{}]*\}/g) ?? []
    for (const entry of entries) {
      assert.match(
        entry,
        /note:/,
        `skin "${skin}" has an unverified metric with no note explaining what is unknown`,
      )
    }
  }
})

test('exactly one delegated listener per event type on the root', () => {
  // The rule is one listener per event type on the root, not one per window.
  // Counting addEventListener calls in the dispatcher catches a regression where
  // someone attaches per-frame handlers instead of extending the hit-test.
  const code = stripComments(readFileSync(join(SRC, 'core/input/dispatcher.ts'), 'utf8'))
  const counts = new Map()
  const re = /addEventListener\(\s*'([a-z]+)'/g
  let m
  while ((m = re.exec(code)) !== null) {
    counts.set(m[1], (counts.get(m[1]) ?? 0) + 1)
  }
  const duplicated = [...counts.entries()].filter(([, n]) => n > 1)
  assert.deepEqual(
    duplicated,
    [],
    `Duplicate root listeners: ${duplicated.map(([k, n]) => `${k}×${n}`).join(', ')}`,
  )
  assert.ok(counts.size >= 7, `expected the full delegated set, found ${counts.size} event types`)
})

test('chrome renderers are not constructed outside the skin layer', () => {
  // A window manager that news up a chrome renderer would be choosing an era.
  const offences = []
  for (const dir of ['core', 'shell', 'apps', 'harness']) {
    for (const file of sources(dir)) {
      const code = stripComments(readFileSync(file, 'utf8'))
      if (/new\s+\w*Chrome\s*\(/.test(code)) offences.push(rel(file))
    }
  }
  assert.deepEqual(offences, [], 'Chrome renderers come from the skin manifest:\n' + offences.join('\n'))
})

test('the filesystem is the only module that can construct storage keys', () => {
  // A caller that builds `fs:node:<id>` itself has reached around the API and
  // would not be covered by the batched-write atomicity guarantees.
  const offences = []
  for (const file of walk(SRC).filter((f) => f.endsWith('.ts'))) {
    const relPath = rel(file)
    if (relPath.startsWith('src/core/fs/')) continue
    const code = stripComments(readFileSync(file, 'utf8'))
    if (/['"`]fs:(node|blob|meta):?/.test(code)) {
      offences.push(`${relPath} builds a raw storage key`)
    }
  }
  assert.deepEqual(offences, [], 'Storage keys belong to src/core/fs:\n' + offences.join('\n'))
})

test('nothing outside the filesystem reads or writes node records directly', () => {
  // The harness and the shell must go through FsApi so `watch` stays the single
  // notification path — an out-of-band write would leave every view stale.
  const offences = []
  for (const dir of ['shell', 'harness', 'apps']) {
    for (const file of sources(dir)) {
      const code = stripComments(readFileSync(file, 'utf8'))
      if (/\bFsStore\b/.test(code) && !/type\s+\{[^}]*FsStore/.test(code)) {
        offences.push(`${rel(file)} uses FsStore directly`)
      }
    }
  }
  assert.deepEqual(offences, [], 'Use FsApi, not FsStore:\n' + offences.join('\n'))
})
