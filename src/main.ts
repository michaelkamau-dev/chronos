/**
 * Phase-3 entry point.
 *
 * Boots the filesystem, then the shell with the Windows XP Luna skin — the
 * reference implementation every other era is measured against — then opens a
 * directory view. Every status-strip control does its job.
 *
 * `window.__chronos` is the handle the browser tests drive. It is a test surface,
 * not an app API: phase 5 replaces the directory-view harness with the real Files
 * app and this shrinks to the app registry.
 */

import { winxpSkin } from './skins/winxp/index.js'
import { Shell } from './shell/shell.js'
import { asAppId, type WindowId } from './core/wm/types.js'
import { Filesystem } from './core/fs/fs.js'
import { FsStore, nodeKey } from './core/fs/store.js'
import { createXpCodec, xpNameDecorator } from './skins/winxp/paths.js'
import { DirectoryView } from './harness/directory-view.js'
import type { NodeId, PathCodec } from './core/fs/types.js'

const root = document.getElementById('chronos-root')
if (!root) throw new Error('Chronos: #chronos-root is missing from the document')

const store = new FsStore()
const fs = new Filesystem(store)
await fs.open()

const codec: PathCodec = createXpCodec(fs)

const shell = new Shell(root, {
  id: winxpSkin.id,
  chrome: winxpSkin.chrome,
  menu: winxpSkin.menu,
  keymap: winxpSkin.keymap,
  viewport: { mode: 'native' },
  generatedProperties: winxpSkin.generatedProperties,
})
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
    decorate: xpNameDecorator,
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
