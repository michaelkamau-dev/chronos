/**
 * Phase-1 entry point.
 *
 * Boots the shell with the `plain` harness skin and exposes a status strip whose
 * controls exercise every window manager capability the brief's phase 1 asks
 * for. Every control here does its job — there are no inert buttons.
 *
 * `window.__chronos` is the handle the browser tests and the drag perf harness
 * drive. It is a test surface, not an app API: phases 2 onward replace it with
 * the real filesystem and app registry.
 */

import { plainSkin } from './skins/plain/index.js'
import { Shell } from './shell/shell.js'
import { asAppId, type WindowId } from './core/wm/types.js'

const root = document.getElementById('chronos-root')
if (!root) throw new Error('Chronos: #chronos-root is missing from the document')

const shell = new Shell(root, {
  id: plainSkin.id,
  chrome: plainSkin.chrome,
  menu: plainSkin.menu,
  keymap: plainSkin.keymap,
  viewport: { mode: 'native' },
})
shell.bindFocusFollowing()

// The status strip reserves space at the bottom, which is how a taskbar, a Dock
// or Ledger's budget bar will shrink the work area in later phases.
const STATUS_HEIGHT = 24
shell.display.setReservedEdges({ bottom: STATUS_HEIGHT })
shell.wm.setWorkArea(shell.display.workArea())

const status = document.createElement('div')
status.className = 'status'
status.dataset['shellRegion'] = 'status'
root.appendChild(status)

const counter = document.createElement('span')
status.appendChild(counter)

function button(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button')
  b.type = 'button'
  b.textContent = label
  b.addEventListener('click', onClick)
  status.appendChild(b)
  return b
}

button('New window', () => {
  shell.openWindow()
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

const guarded = new Set<WindowId>()

function refresh(): void {
  const windows = shell.wm.list()
  const id = shell.wm.focusedId()
  const focused = id !== null ? shell.wm.get(id) : undefined
  counter.textContent =
    `${windows.length} window${windows.length === 1 ? '' : 's'}` +
    (focused ? ` · focus: ${focused.title}` : ' · no focus')
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

shell.openWindow('Window 1')

// Test surface for the browser suite and the drag perf harness.
declare global {
  interface Window {
    __chronos: {
      shell: Shell
      openWindows(n: number): WindowId[]
      reset(): Promise<void>
      keymapUnknownKeys(): string[]
    }
  }
}

window.__chronos = {
  shell,
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
}
