/**
 * Mac OS 8's one shell region: the menu bar.
 *
 * It reserves space, so the window manager learns only that the work area is 20px
 * shorter at the top. It never learns that a menu bar exists — §5's claim, and the
 * mechanism is Tiger's `ShellRegion`, used rather than reinvented.
 *
 * No Dock and no taskbar: Mac OS 8 had neither. The Application menu at the right of
 * the bar was the era's window switcher, and a collapsed window stayed on the desktop
 * as its own title bar rather than travelling anywhere — which is why this skin
 * declares no `minimizeTarget`. A windowshade has no destination.
 *
 * Three behaviours here are Mac and measured rather than decoration:
 *
 * - **A menu title is never dimmed**, even when every item in it is unavailable. Apple
 *   states it twice (classic HIG p144, p154), and it is why `enabled` is not computed
 *   for titles.
 * - **Sliding across the bar with a menu open switches menus.**
 * - **The pulled-down title inverts to `#333399`**, with `#6666CC` above and `#000088`
 *   below — not a flat inversion, and measured from Figure 4-1.
 */

import { accelFrom, type ShellRegion, type ShellRegionHost } from '../../shell/shell.js'
import type { MenuSpec } from '../../core/input/menu.js'
import { MACOS8 } from './metrics.js'

class MenuBar {
  private readonly host: HTMLElement
  private readonly api: ShellRegionHost
  private readonly titles: HTMLElement[] = []
  private readonly unsubscribe: () => void
  private readonly unwatchMenus: () => void

  constructor(host: HTMLElement, api: ShellRegionHost) {
    this.host = host
    this.api = api
    host.className = 'm8-menubar'
    host.setAttribute('role', 'menubar')

    // The open title's highlight has to clear however the menu closed — Escape, an
    // activated item, a click on the desktop, another menu opening. That is what
    // MenuController.subscribe is for; clearing on the next pointerdown leaves it
    // stale after five of the six routes.
    this.unwatchMenus = api.menus.subscribe((open) => {
      if (!open) for (const t of this.titles) delete t.dataset['open']
    })

    // The Apple menu is a glyph rather than a word — Chicago's own, from the private
    // use area, since ChicagoFLF has no U+F8FF.
    this.addTitle(MACOS8.font.symbols.apple, 'apple', () => this.appleMenu())
    this.addTitle('File', 'file', () => this.fileMenu())
    this.addTitle('Edit', 'edit', () => this.editMenu())
    this.addTitle('Special', 'special', () => this.specialMenu())

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
    el.className = 'm8-menubar-title'
    el.dataset['menubarTitle'] = kind
    el.textContent = label

    const open = (): void => {
      const rect = el.getBoundingClientRect()
      // The highlight is set *after* the menu opens, never before: MenuController.open
      // closes any existing menu first, and that close notifies the watcher above,
      // which would clear an attribute written earlier in this same call.
      const shown = this.api.openMenu(spec(), rect.left, rect.bottom)
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
       * just pushed, lands outside the menu box and dismisses it — opened and closed
       * within one event. DECISIONS 1.9's right-click flash in a new form.
       */
      ev.stopPropagation()
      if (el.dataset['open'] === 'true') {
        this.api.menus.closeAll()
        return
      }
      open()
    })

    el.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ' || ev.key === 'ArrowDown') {
        ev.preventDefault()
        // Same trap in the keyboard path: the dispatcher listens for keydown on the
        // window, so an un-stopped Enter reaches the capture layer the menu just
        // pushed and is read as "activate the highlighted item" — the menu opens and
        // immediately fires its first entry.
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
    // Nothing about a menu bar title changes with focus in this era — titles are never
    // dimmed — but the Special menu's contents depend on the focused window, and they
    // are rebuilt on open rather than cached.
  }

  private appleMenu(): MenuSpec {
    return [
      { kind: 'item', label: 'About This Computer', enabled: false },
      { kind: 'separator' },
      { kind: 'item', label: 'Chooser', enabled: false },
      { kind: 'item', label: 'Control Panels', enabled: false },
      { kind: 'item', label: 'Key Caps', enabled: false },
    ]
  }

  private fileMenu(): MenuSpec {
    const wm = this.api.wm
    const id = wm.focusedId()
    const s = id !== null ? wm.get(id) : undefined
    return [
      {
        kind: 'item',
        label: 'New Window',
        command: 'shell.newWindow',
        ...accelFrom(this.api, 'shell.newWindow'),
        enabled: true,
        // Through the command registry, not by reaching for the shell: a menu item and
        // its accelerator have to be provably the same action.
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
      { kind: 'item', label: 'Print…', enabled: false },
    ]
  }

  private editMenu(): MenuSpec {
    // Every item unavailable, and the title stays undimmed anyway — which is the Mac
    // behaviour Apple states twice and the reason a user can always look inside.
    return [
      { kind: 'item', label: 'Undo', enabled: false },
      { kind: 'separator' },
      { kind: 'item', label: 'Cut', enabled: false },
      { kind: 'item', label: 'Copy', enabled: false },
      { kind: 'item', label: 'Paste', enabled: false },
      { kind: 'item', label: 'Clear', enabled: false },
    ]
  }

  /**
   * The Special menu, which is where the Finder kept window commands.
   *
   * `Collapse` is a toggle and says which way it will go, because the collapse box is
   * the same control in both directions.
   */
  private specialMenu(): MenuSpec {
    const wm = this.api.wm
    const id = wm.focusedId()
    const s = id !== null ? wm.get(id) : undefined
    const shaded = s?.minimized === true
    return [
      {
        kind: 'item',
        label: shaded ? 'Expand Window' : 'Collapse Window',
        command: 'window.minimize',
        ...accelFrom(this.api, 'window.minimize'),
        enabled: s !== undefined,
        onActivate: () => {
          if (id === null) return
          if (shaded) wm.restore(id)
          else void wm.minimize(id)
        },
      },
      {
        kind: 'item',
        label: 'Zoom Window',
        command: 'window.toggleMaximize',
        enabled: s !== undefined && s.resizable,
        onActivate: () => {
          if (id !== null) wm.toggleMaximize(id)
        },
      },
      { kind: 'separator' },
      {
        kind: 'item',
        label: 'Next Window',
        command: 'window.cycleNext',
        ...accelFrom(this.api, 'window.cycleNext'),
        enabled: wm.list().length > 1,
        onActivate: () => void this.api.commands.run('window.cycleNext'),
      },
    ]
  }
}

export function macos8Regions(): readonly ShellRegion[] {
  return [
    {
      edge: 'top',
      kind: 'menubar',
      thickness: MACOS8.menuBar.height,
      reservesSpace: true,
      mount(host, api) {
        const bar = new MenuBar(host, api)
        return () => bar.destroy()
      },
      // No minimizeTarget: a windowshade has no destination. It collapses in place, and
      // the window manager's fallback is never consulted because the collapse style
      // never travels.
    },
  ]
}
