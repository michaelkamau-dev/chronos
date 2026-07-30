/**
 * Entry point.
 *
 * Boots the filesystem, then the shell with the era named by `?era=`, then opens a
 * directory view. Every status-strip control does its job.
 *
 * The era is selected here and loaded with a dynamic `import()`, which is what keeps
 * skins out of the core chunk — the 4G transfer budget in §6 depends on exactly one
 * era reaching the browser, never six. `winxp` is the default because it is the
 * reference implementation the others are measured against.
 *
 * This module is the *only* place that names an era. Everything downstream receives a
 * `SkinManifest` and a `PathCodec` and cannot tell which one it got, which is the
 * invariant `test/invariants.test.ts` enforces by grepping core and apps for era
 * identifiers.
 *
 * `window.__chronos` is the handle the browser tests drive. It is a test surface,
 * not an app API: phase 5 replaces the directory-view harness with the real Files
 * app and this shrinks to the app registry.
 */

import { Shell, type SkinManifest } from './shell/shell.js'
import { asAppId, type WindowId } from './core/wm/types.js'
import { Filesystem } from './core/fs/fs.js'
import { FsStore, nodeKey } from './core/fs/store.js'
import { DirectoryView } from './harness/directory-view.js'
import type { FsApi, NodeId, PathCodec } from './core/fs/types.js'

/** A name decorator is era knowledge: Windows appends " (2)", classic Mac " copy". */
type NameDecorator = (base: string, attempt: number) => string

interface EraBundle {
  skin: SkinManifest
  codec: (fs: FsApi) => PathCodec
  decorate: NameDecorator
}

/**
 * The era registry.
 *
 * Each entry is a thunk so Vite emits one chunk per era and the browser fetches only
 * the selected one. Adding an era is adding a line here; nothing else in the tree
 * changes, which is the whole claim the skin architecture makes.
 */
const ERAS: Record<string, () => Promise<EraBundle>> = {
  winxp: async () => {
    const [{ winxpSkin }, paths] = await Promise.all([
      import('./skins/winxp/index.js'),
      import('./skins/winxp/paths.js'),
    ])
    return { skin: winxpSkin, codec: paths.createXpCodec, decorate: paths.xpNameDecorator }
  },
  win31: async () => {
    const [{ win31Skin }, paths] = await Promise.all([
      import('./skins/win31/index.js'),
      import('./skins/win31/paths.js'),
    ])
    return {
      skin: win31Skin,
      codec: paths.createWin31Codec,
      decorate: paths.win31NameDecorator,
    }
  },
  system1: async () => {
    const [{ system1Skin }, paths] = await Promise.all([
      import('./skins/system1/index.js'),
      import('./skins/system1/paths.js'),
    ])
    return {
      skin: system1Skin,
      codec: paths.createSystem1Codec,
      decorate: paths.system1NameDecorator,
    }
  },
}

const DEFAULT_ERA = 'winxp'

function requestedEra(): string {
  const asked = new URLSearchParams(location.search).get('era')
  if (asked !== null && Object.hasOwn(ERAS, asked)) return asked
  // An unknown era is a typo, not a reason to show nothing. Fall back and say so.
  if (asked !== null) console.warn(`Chronos: unknown era "${asked}", using ${DEFAULT_ERA}`)
  return DEFAULT_ERA
}

const root = document.getElementById('chronos-root')
if (!root) throw new Error('Chronos: #chronos-root is missing from the document')

const store = new FsStore()
const fs = new Filesystem(store)
await fs.open()

const eraId = requestedEra()
const era = await ERAS[eraId]!()
const codec: PathCodec = era.codec(fs)
const decorate: NameDecorator = era.decorate

const shell = new Shell(root, era.skin)
shell.bindFocusFollowing()

// The status strip reserves space at the bottom, which is how a taskbar, a Dock
// or Ledger's budget bar will shrink the work area in later phases.
const STATUS_HEIGHT = 24
shell.display.setReservedEdges({ bottom: STATUS_HEIGHT })
shell.wm.setWorkArea(shell.display.workArea())

/** Directory views keyed by the window hosting them, so they can be torn down. */
const views = new Map<WindowId, DirectoryView>()

function openDirectoryWindow(startAt?: NodeId): WindowId {
  const id = shell.wm.open({
    appId: asAppId('harness-files'),
    title: 'Files',
    minSize: { w: 320, h: 240 },
  })
  const handle = shell.wm.handleOf(id)
  if (!handle) return id

  const view = new DirectoryView({
    fs,
    codec,
    decorate,
    root: handle.content,
    ...(startAt !== undefined ? { startAt } : {}),
    onError: (message) => {
      lastError = message
      refresh()
    },
  })
  views.set(id, view)
  void view.start().then(() => {
    void fs.chain(view.currentDir()).then((chain) => {
      shell.wm.setTitle(id, `Files — ${codec.format(chain)}`)
    })
  })
  return id
}

// A window closing must release its watcher, or a closed view keeps re-rendering
// into detached DOM every time the folder changes.
shell.wm.subscribe((e) => {
  if (e.type !== 'closed') return
  const view = views.get(e.id)
  if (view) {
    view.destroy()
    views.delete(e.id)
  }
})

const status = document.createElement('div')
status.className = 'status'
status.dataset['shellRegion'] = 'status'
root.appendChild(status)

const counter = document.createElement('span')
status.appendChild(counter)

let lastError = ''

function button(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button')
  b.type = 'button'
  b.textContent = label
  b.addEventListener('click', onClick)
  status.appendChild(b)
  return b
}

button('New Files window', () => {
  openDirectoryWindow()
})

button('New modal', () => {
  const owner = shell.wm.focusedId()
  if (owner === null) return
  const ownerRect = shell.wm.get(owner)?.rect
  shell.wm.open({
    appId: asAppId('harness-modal'),
    title: 'Modal dialog',
    modalOwner: owner,
    resizable: false,
    minSize: { w: 220, h: 100 },
    rect: ownerRect
      ? { x: ownerRect.x + 40, y: ownerRect.y + 48, w: 260, h: 140 }
      : { x: 120, y: 120, w: 260, h: 140 },
  })
})

const dirtyButton = button('Toggle unsaved', () => {
  const id = shell.wm.focusedId()
  if (id === null) return
  const s = shell.wm.get(id)
  if (!s) return
  shell.wm.setDirty(id, !s.dirty)
})

const suspendButton = button('Toggle suspend', () => {
  const id = shell.wm.focusedId()
  if (id === null) return
  const s = shell.wm.get(id)
  if (!s) return
  if (s.suspended) shell.wm.resume(id)
  else shell.wm.suspend(id)
})

const guarded = new Set<WindowId>()

const guardButton = button('Toggle close guard', () => {
  const id = shell.wm.focusedId()
  if (id === null) return
  if (guarded.has(id)) {
    guarded.delete(id)
    shell.wm.setCloseGuard(id, null)
  } else {
    guarded.add(id)
    // A real guard, not a simulated one: it blocks the close and says so.
    shell.wm.setCloseGuard(id, (target) => {
      const s = shell.wm.get(target)
      if (!s?.dirty) return true
      return window.confirm(`"${s.title}" has unsaved changes. Close anyway?`)
    })
  }
  refresh()
})

const storageEl = document.createElement('span')
status.appendChild(storageEl)

function refresh(): void {
  const windows = shell.wm.list()
  const id = shell.wm.focusedId()
  const focused = id !== null ? shell.wm.get(id) : undefined
  counter.textContent =
    `${windows.length} window${windows.length === 1 ? '' : 's'}` +
    (focused ? ` · focus: ${focused.title}` : ' · no focus') +
    (lastError ? ` · ${lastError}` : '')
  const has = focused !== undefined
  dirtyButton.disabled = !has
  suspendButton.disabled = !has
  guardButton.disabled = !has
  suspendButton.textContent = focused?.suspended ? 'Resume' : 'Toggle suspend'
  guardButton.textContent =
    id !== null && guarded.has(id) ? 'Remove close guard' : 'Toggle close guard'
}

shell.wm.subscribe(() => refresh())
refresh()

/** Storage headroom, refreshed on every filesystem change. */
async function refreshStorage(): Promise<void> {
  const headroom = await fs.storageHeadroom()
  storageEl.textContent =
    headroom === null
      ? 'storage: unreported'
      : `storage: ${(headroom.usage / 1024).toFixed(0)}KB used`
}
fs.watchAll(() => void refreshStorage())
void refreshStorage()

openDirectoryWindow()

// Test surface for the browser suite.
declare global {
  interface Window {
    __chronos: {
      shell: Shell
      fs: Filesystem
      codec: PathCodec
      /** Which era is loaded. Fidelity suites assert against the right one. */
      era: string
      openDirectoryWindow(startAt?: NodeId): WindowId
      openWindows(n: number): WindowId[]
      keymapUnknownKeys(): string[]
      reset(): Promise<void>
      wipeStorage(): Promise<void>
      /**
       * Low-level pokes at the store, used to reach states the public API
       * deliberately cannot produce: a store written by a future schema, and
       * content whose metadata never landed. Both are real failure modes that
       * would otherwise be untestable, and neither belongs on FsApi.
       */
      diag: {
        setSchemaVersion(v: number): Promise<void>
        orphanContent(id: NodeId): Promise<void>
      }
    }
  }
}

window.__chronos = {
  shell,
  fs,
  codec,
  era: eraId,
  openDirectoryWindow,
  openWindows(n: number): WindowId[] {
    const ids: WindowId[] = []
    for (let i = 0; i < n; i++) ids.push(shell.openWindow())
    return ids
  },
  keymapUnknownKeys(): string[] {
    return shell.unreachableChords()
  },
  async reset(): Promise<void> {
    for (const s of [...shell.wm.list()]) await shell.wm.close(s.id, { force: true })
  },
  async wipeStorage(): Promise<void> {
    await fs.wipeAndReseed()
  },
  diag: {
    async setSchemaVersion(v: number): Promise<void> {
      const meta = await store.readMeta()
      if (!meta) throw new Error('no filesystem metadata to rewrite')
      await store.writeMeta({ ...meta, schemaVersion: v })
    },
    async orphanContent(id: NodeId): Promise<void> {
      // Delete the node record but leave its content: exactly the state a crash
      // between the two writes in createFile would produce.
      const node = await fs.stat(id)
      const parent = node.parent
      if (parent !== null) {
        const parentNode = await fs.stat(parent)
        if ('childIds' in parentNode) {
          await store.writeMany([
            [nodeKey(parent), { ...parentNode, childIds: parentNode.childIds.filter((c) => c !== id) }],
          ])
        }
      }
      await store.deleteKey(nodeKey(id))
      // Assert the premise: the content must still be there for the sweep to find.
      if (!(await store.readBlob(id))) throw new Error('content vanished with the node')
    },
  },
}
