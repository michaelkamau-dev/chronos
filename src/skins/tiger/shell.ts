/**
 * Tiger's two shell regions: the menu bar at the top and the Dock at the bottom.
 *
 * Both reserve space, so the window manager learns only that the work area is 22px
 * shorter at the top and 68px shorter at the bottom. It never learns that a menu bar
 * or a Dock exists, which is the §5 claim this era is the first to actually exercise —
 * Windows XP's phase-3 shell had neither, and Windows 3.1 deliberately has no taskbar
 * at all.
 *
 * Everything era-specific is here or in `skin.css`. The shell builds the elements,
 * positions them, subtracts them from the work area and routes minimize targets; it
 * has no idea what goes inside them.
 */

import { accelFrom, type ShellRegion, type ShellRegionHost } from '../../shell/shell.js'
import type { MenuSpec } from '../../core/input/menu.js'
import type { WindowId, WindowState } from '../../core/wm/types.js'
import { rect, type Rect } from '../../core/geometry.js'
import { TIGER } from './metrics.js'

/* ------------------------------------------------------------------ menu bar */

/**
 * The menu bar.
 *
 * Mac menu bars are the "one spec, six placements" case from §4: the same `MenuSpec`
 * type a Windows era renders *inside* a window is rendered here at the top of the
 * screen. The controller owns keyboard navigation, type-ahead and submenu timing; all
 * this does is decide where a title's menu opens.
 *
 * Two behaviours that are genuinely Mac and not decoration:
 *
 * - **A menu title stays undimmed even when every item in it is unavailable.** Apple
 *   states this twice (HIG p144, p154). So a title is never disabled — the user can
 *   always open it and see why nothing applies.
 * - **Once a menu is open, moving across the bar switches menus.** Handled by
 *   reopening on pointer-enter while the controller reports a menu is open.
 */
class MenuBar {
  private readonly host: HTMLElement
  private readonly api: ShellRegionHost
  private readonly titles: HTMLElement[] = []
  private readonly unsubscribe: () => void
  private readonly unwatchMenus: () => void

  constructor(host: HTMLElement, api: ShellRegionHost) {
    this.host = host
    this.api = api
    host.className = 'tg-menubar'
    host.setAttribute('role', 'menubar')

    // The open title's highlight has to clear however the menu closed — Escape, an
    // activated item, a click on the desktop. That is what MenuController.subscribe
    // is for; polling or clearing on the next pointerdown both leave it stale.
    this.unwatchMenus = api.menus.subscribe((open) => {
      if (!open) for (const t of this.titles) delete t.dataset['open']
    })

    // The Apple menu is a glyph rather than a word, and it is the one title whose
    // width is set by its artwork.
    this.addTitle('', 'apple', () => this.appleMenu())
    this.addTitle('Finder', 'app', () => this.fileMenu())
    this.addTitle('Window', 'window', () => this.windowMenu())

    // Window titles change and windows come and go, so the Window menu's contents
    // are rebuilt on every open rather than cached — and the bar redraws its
    // active-application name when focus moves.
    this.unsubscribe = api.wm.subscribe((e) => {
      if (e.type === 'focused' || e.type === 'closed' || e.type === 'titled') this.refresh()
    })
    this.refresh()
  }

  destroy(): void {
    this.unsubscribe()
    this.unwatchMenus()
    this.titles.length = 0
  }

  private addTitle(label: string, kind: string, spec: () => MenuSpec): void {
    const el = document.createElement('button')
    el.type = 'button'
    el.className = 'tg-menubar-title'
    el.dataset['menubarTitle'] = kind
    el.textContent = label
    // Every mouse path needs a keyboard path: the titles are real buttons, so Tab
    // reaches them and Enter or Space opens the menu the pointer would.
    const open = () => {
      const box = el.getBoundingClientRect()
      // The highlight is set *after* the menu opens, never before: MenuController.open
      // closes any existing menu first, and that close notifies the watcher above,
      // which would clear the attribute we had just written.
      const shown = this.api.openMenu(spec(), box.left, box.bottom)
      if (!shown) return
      for (const t of this.titles) delete t.dataset['open']
      el.dataset['open'] = 'true'
    }
    el.addEventListener('pointerdown', (ev) => {
      ev.preventDefault()
      /*
       * The press must not reach the dispatcher.
       *
       * The dispatcher listens on the root in the bubble phase, so without this the
       * same pointerdown that opened the menu arrives at the capture layer the menu
       * just pushed, lands outside the menu box, and dismisses it — the menu opened
       * and closed within one event. That is DECISIONS 1.9's right-click flash in a
       * new form, and it is why the release afterwards is safe: `sawPointerDown`
       * stays false, so the menu controller correctly ignores the matching pointerup.
       */
      ev.stopPropagation()
      // Clicking the open title closes it, rather than reopening it.
      if (el.dataset['open'] === 'true') {
        this.api.menus.closeAll()
        return
      }
      open()
    })
    el.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'ArrowDown') {
        ev.preventDefault()
        /*
         * Same trap as the pointerdown above, in the keyboard path.
         *
         * The dispatcher listens for keydown on `window`, so without this the Enter
         * that opened the menu keeps bubbling, reaches the capture layer the menu
         * just pushed, and is read as "activate the highlighted item" — the menu
         * opens and immediately fires its first entry. It cost a hung test to find,
         * and it would have been a menu bar that could not be used from the keyboard.
         */
        ev.stopPropagation()
        open()
        this.api.menus.highlightFirst()
      }
    })
    // Sliding across the bar with a menu open switches menus, as it always did.
    el.addEventListener('pointerenter', () => {
      if (this.api.menus.isOpen) open()
    })
    this.host.appendChild(el)
    this.titles.push(el)
  }

  private refresh(): void {
    const id = this.api.wm.focusedId()
    const s = id !== null ? this.api.wm.get(id) : undefined
    const appTitle = this.titles.find((t) => t.dataset['menubarTitle'] === 'app')
    // The application menu carries the active application's name, which is the
    // Finder when nothing else is frontmost.
    if (appTitle) appTitle.textContent = s ? 'Chronos' : 'Finder'
  }

  private appleMenu(): MenuSpec {
    const wm = this.api.wm
    return [
      { kind: 'item', label: 'About This Mac', enabled: false },
      { kind: 'separator' },
      /*
       * No accelerator, and its absence is the point.
       *
       * This item used to read `Cmd+Opt+Esc`, which is the real Mac OS X chord and is
       * bound to nothing here — the command vocabulary has no force-close, and the
       * chord is intercepted by the host OS before a page could ever see it. An
       * **enabled** item's accelerator has to come from the keymap, so an item with no
       * command has none to show. Give it a command and a binding and
       * `accelFrom` will print it.
       */
      {
        kind: 'item',
        label: 'Force Quit…',
        enabled: wm.focusedId() !== null,
        onActivate: () => {
          const id = wm.focusedId()
          if (id !== null) void wm.close(id, { force: true })
        },
      },
      { kind: 'separator' },
      { kind: 'item', label: 'Sleep', enabled: false },
      { kind: 'item', label: 'Restart…', enabled: false },
      { kind: 'item', label: 'Shut Down…', enabled: false },
    ]
  }

  private fileMenu(): MenuSpec {
    const wm = this.api.wm
    const id = wm.focusedId()
    const s = id !== null ? wm.get(id) : undefined
    return [
      {
        kind: 'item',
        label: 'New Finder Window',
        command: 'shell.newWindow',
        ...accelFrom(this.api, 'shell.newWindow'),
        enabled: true,
        // Through the command registry, not by reaching for the shell: a menu item
        // and its accelerator have to be provably the same action.
        onActivate: () => void this.api.commands.run('shell.newWindow'),
      },
      { kind: 'separator' },
      {
        kind: 'item',
        label: 'Close Window',
        command: 'window.close',
        ...accelFrom(this.api, 'window.close'),
        enabled: s !== undefined && s.closable,
        onActivate: () => {
          if (id !== null) void wm.close(id)
        },
      },
      {
        kind: 'item',
        label: 'Minimize',
        command: 'window.minimize',
        ...accelFrom(this.api, 'window.minimize'),
        enabled: s !== undefined && !s.minimized,
        onActivate: () => {
          if (id !== null) void wm.minimize(id)
        },
      },
      {
        kind: 'item',
        label: 'Zoom',
        command: 'window.toggleMaximize',
        ...accelFrom(this.api, 'window.toggleMaximize'),
        enabled: s !== undefined && s.resizable,
        onActivate: () => {
          if (id !== null) wm.toggleMaximize(id)
        },
      },
    ]
  }

  /**
   * The Window menu lists every open window and ticks the active one — the Mac
   * equivalent of a taskbar, and the reason a Mac never needed one.
   */
  private windowMenu(): MenuSpec {
    const wm = this.api.wm
    const focused = wm.focusedId()
    const spec: MenuSpec = [
      {
        kind: 'item',
        label: 'Minimize',
        command: 'window.minimize',
        ...accelFrom(this.api, 'window.minimize'),
        enabled: focused !== null,
        onActivate: () => {
          if (focused !== null) void wm.minimize(focused)
        },
      },
      {
        kind: 'item',
        label: 'Bring All to Front',
        enabled: wm.list().length > 0,
        onActivate: () => {
          for (const s of wm.list()) if (s.minimized) wm.restore(s.id)
        },
      },
    ]
    const windows = wm.list()
    if (windows.length > 0) spec.push({ kind: 'separator' })
    for (const s of windows) {
      spec.push({
        kind: 'item',
        label: s.title,
        enabled: true,
        checked: s.id === focused,
        onActivate: () => {
          if (s.minimized) wm.restore(s.id)
          wm.focus(s.id)
        },
      })
    }
    return spec
  }
}

/* ----------------------------------------------------------------------- Dock */

/**
 * The Dock — a **flat 2D shelf**, which is one of the two corrections §7 records for
 * this era. The 3D glass shelf everyone remembers is 10.5 Leopard, two years later.
 *
 * It owns the minimize target: a minimized window genies into its own tile, and only
 * the Dock knows where that tile ended up, which is why `ShellRegion.minimizeTarget`
 * exists rather than the window manager guessing.
 *
 * Magnification is deliberately not implemented. Apple documents the magnified icon
 * at 128px and §7 records it, but it is a preference that defaults *off* in Tiger,
 * and building an animation on an unmeasured curve would be inventing rather than
 * reproducing.
 */
class Dock {
  private readonly host: HTMLElement
  private readonly api: ShellRegionHost
  private readonly strip: HTMLElement
  private readonly trash: HTMLElement
  private readonly tiles = new Map<WindowId, HTMLElement>()
  private readonly unsubscribe: () => void

  constructor(host: HTMLElement, api: ShellRegionHost) {
    this.host = host
    this.api = api
    host.className = 'tg-dock'

    const shelf = document.createElement('div')
    shelf.className = 'tg-dock-shelf'
    host.appendChild(shelf)

    this.strip = document.createElement('div')
    this.strip.className = 'tg-dock-strip'
    shelf.appendChild(this.strip)

    const divider = document.createElement('div')
    divider.className = 'tg-dock-divider'
    shelf.appendChild(divider)

    this.trash = document.createElement('div')
    this.trash.className = 'tg-dock-tile tg-dock-trash'
    this.trash.dataset['dockTile'] = 'trash'
    this.trash.title = 'Trash'
    shelf.appendChild(this.trash)

    this.unsubscribe = api.wm.subscribe(() => this.sync())
    this.sync()
  }

  destroy(): void {
    this.unsubscribe()
    this.tiles.clear()
  }

  /**
   * The rect a window's genie lands on, in the window manager's logical coordinates.
   *
   * Converted from client coordinates by subtracting the desktop's own origin,
   * because the WM works in logical era pixels and the Dock is measured in client
   * ones — the same conversion the dispatcher does for pointer events.
   */
  minimizeTarget(id: WindowId): Rect | null {
    const tile = this.tiles.get(id) ?? this.trash
    const box = tile.getBoundingClientRect()
    const origin = this.api.wm.root.getBoundingClientRect()
    if (box.width === 0) return null
    return rect(
      Math.round(box.left - origin.left),
      Math.round(box.top - origin.top),
      Math.round(box.width),
      Math.round(box.height),
    )
  }

  private sync(): void {
    const windows = this.api.wm.list()
    const seen = new Set<WindowId>()

    for (const s of windows) {
      seen.add(s.id)
      let tile = this.tiles.get(s.id)
      if (!tile) {
        tile = this.createTile(s)
        this.tiles.set(s.id, tile)
        this.strip.appendChild(tile)
      }
      tile.title = s.title
      tile.dataset['minimized'] = s.minimized ? 'true' : 'false'
      tile.dataset['active'] = s.focused ? 'true' : 'false'
      const label = tile.querySelector('.tg-dock-label')
      if (label) label.textContent = s.title
    }

    for (const [id, tile] of this.tiles) {
      if (seen.has(id)) continue
      tile.remove()
      this.tiles.delete(id)
    }
  }

  private createTile(s: WindowState): HTMLElement {
    const tile = document.createElement('button')
    tile.type = 'button'
    tile.className = 'tg-dock-tile'
    tile.dataset['dockTile'] = String(s.id)
    // Apple: "Clicking an application icon in the Dock should always result in a
    // window becoming active" — including un-minimizing it (HIG p56).
    tile.addEventListener('click', () => {
      const state = this.api.wm.get(s.id)
      if (!state) return
      if (state.minimized) this.api.wm.restore(s.id)
      this.api.wm.focus(s.id)
    })

    const icon = document.createElement('span')
    icon.className = 'tg-dock-icon'
    tile.appendChild(icon)

    const label = document.createElement('span')
    label.className = 'tg-dock-label'
    label.textContent = s.title
    tile.appendChild(label)

    // The running-application indicator: a small mark under the tile. Every window
    // in the Dock here is by definition running.
    const dot = document.createElement('span')
    dot.className = 'tg-dock-running'
    tile.appendChild(dot)

    return tile
  }
}

/* -------------------------------------------------------------------- exports */

export function tigerRegions(): readonly ShellRegion[] {
  let dock: Dock | null = null
  return [
    {
      edge: 'top',
      kind: 'menubar',
      thickness: TIGER.menuBar.height,
      reservesSpace: true,
      mount(host, api) {
        const bar = new MenuBar(host, api)
        return () => bar.destroy()
      },
    },
    {
      edge: 'bottom',
      kind: 'dock',
      thickness: TIGER.dock.height,
      reservesSpace: true,
      mount(host, api) {
        dock = new Dock(host, api)
        return () => {
          dock?.destroy()
          dock = null
        }
      },
      minimizeTarget(id) {
        return dock?.minimizeTarget(id) ?? null
      },
    },
  ]
}
