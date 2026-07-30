/**
 * System 1's one shell region: the menu bar.
 *
 * One, not two. There is no Dock, no taskbar and no window list, because there is no
 * multitasking to list — MultiFinder is three years away — and the era's answer to
 * "where are my other windows" is that you click one. `minimizeTarget` is therefore
 * not implemented here at all, which is the honest shape: `minimizeStyle: 'none'`
 * means the window manager never asks.
 *
 * The bar reserves its 20px through `ShellRegion.reservesSpace`, so the window
 * manager learns only that the work area starts 20px down. It never learns that a
 * menu bar exists — and the shell, not this file, is what sums the reservations, so
 * the harness status strip's own claim on the bottom edge composes with this one
 * (ARCHITECTURE.md §13: `Shell.addReservedEdges`, never the display directly).
 *
 * Three geometry facts drive everything below, all in metrics.ts with their
 * provenance:
 *
 * 1. The bar is 20px including its 1px rule, and its **first row is the screen's own
 *    border line**. That is what makes 2 + 16 + 1 + 1 close, and it is why the region
 *    sits at `top: 0` inside the desktop rather than below a border.
 * 2. A title's box is rows 1..18 with 10px of box either side of the string, and the
 *    stride is the string + 15px. Those two do not reconcile; see the note on
 *    `menuBar` in metrics.ts.
 * 3. A menu drops with its **left border on the title box's left edge and its top
 *    border on the bar's rule**, so the highlight, the rule and the menu's left
 *    border form one continuous run of ink. Measured on both figures that have a
 *    menu pulled down.
 */

import type { ShellRegion, ShellRegionHost } from '../../shell/shell.js'
import type { MenuSpec } from '../../core/input/menu.js'
import type { Command } from '../../core/input/commands.js'
import { SYSTEM1 } from './metrics.js'

/**
 * The menu bar.
 *
 * The Macintosh menu bar is §4's "one spec, six placements" case: the same `MenuSpec`
 * a Windows era renders inside a window is rendered here at the top of the screen.
 * The controller owns navigation, type-ahead and dismissal; this decides only what is
 * in each menu and where it opens.
 *
 * Two behaviours are genuinely Mac rather than decoration, and both are Apple's own
 * words in the HIG:
 *
 * - **A menu title is never dimmed**, even when every item in it is unavailable
 *   (p144, p154). You can always open it and see why nothing applies. So there is no
 *   disabled state on a title, and the era's stipple lives on the *items*.
 * - **Once a menu is open, moving along the bar switches menus.** Reopening on
 *   pointer-enter while the controller reports a menu open is the whole mechanism.
 */
class MenuBar {
  private readonly host: HTMLElement
  private readonly api: ShellRegionHost
  private readonly titles: HTMLElement[] = []
  private readonly unwatchMenus: () => void
  private readonly unsubscribe: () => void

  constructor(host: HTMLElement, api: ShellRegionHost) {
    this.host = host
    this.api = api
    host.className = 's1-menubar'
    host.setAttribute('role', 'menubar')

    // The open title's inversion has to clear however the menu closed — Escape, an
    // activated item, a click on the desktop, another menu opening. That is what
    // MenuController.subscribe is for; clearing on the next pointerdown leaves it
    // stale after five of the six routes.
    this.unwatchMenus = api.menus.subscribe((open) => {
      if (!open) for (const t of this.titles) delete t.dataset['open']
    })

    // The Finder's bar, as it stood in 1984. `Label` is a System 7 menu and is not
    // here; the figures show it because macintosh-hig.pdf is the 1992 edition.
    this.addTitle('', 'apple', () => this.appleMenu())
    this.addTitle('File', 'file', () => this.fileMenu())
    this.addTitle('Edit', 'edit', () => this.editMenu())
    this.addTitle('View', 'view', () => this.viewMenu())
    this.addTitle('Special', 'special', () => this.specialMenu())

    // Menu contents depend on what is frontmost, so they are built on every open
    // rather than cached. The subscription exists only to close an open menu when
    // the window under it goes away, which would otherwise leave a menu describing
    // a window that no longer exists.
    this.unsubscribe = api.wm.subscribe((e) => {
      if (e.type === 'closed' && api.menus.isOpen) api.menus.closeAll()
    })
  }

  destroy(): void {
    this.unwatchMenus()
    this.unsubscribe()
    this.titles.length = 0
  }

  private addTitle(label: string, kind: string, spec: () => MenuSpec): void {
    const el = document.createElement('button')
    el.type = 'button'
    el.className = 's1-menubar-title'
    el.dataset['menubarTitle'] = kind
    if (label === '') {
      // The Apple title is artwork, not a string, so it carries its own advance and
      // an accessible name the glyph cannot supply.
      el.dataset['glyph'] = 'apple'
      el.setAttribute('aria-label', 'Apple')
    } else {
      el.textContent = label
    }

    const open = (): void => {
      const box = el.getBoundingClientRect()
      /*
       * `box.bottom`, not the bar's bottom.
       *
       * The title box is rows 1..18 of a 20px bar, so its bottom edge is row 19 —
       * which is the bar's rule. Opening there puts the menu's own 1px top border
       * exactly on the rule, and its left border on the box's left edge, which is
       * what both figures show: one continuous run of ink from the inverted title,
       * through the rule, down the menu's left side.
       */
      const shown = this.api.openMenu(spec(), box.left, box.bottom)
      if (!shown) return
      // Set the inversion *after* opening: `MenuController.open` closes any existing
      // menu first, and that close notifies the watcher above, which would clear an
      // attribute written beforehand.
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
       * inside one event. DECISIONS 4.27 records it for Tiger; it is the same trap
       * for any region that opens a menu, and it is why the release afterwards is
       * safe: `sawPointerDown` stays false, so the controller ignores the pointerup.
       */
      ev.stopPropagation()
      // Clicking the open title closes it rather than reopening it.
      if (el.dataset['open'] === 'true') {
        this.api.menus.closeAll()
        return
      }
      open()
    })

    el.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter' && ev.key !== ' ' && ev.key !== 'ArrowDown') return
      ev.preventDefault()
      // Same trap in the keyboard path: the dispatcher listens for keydown on
      // `window`, so an un-stopped Enter reaches the menu's own capture layer and is
      // read as "activate the highlighted item".
      ev.stopPropagation()
      open()
      this.api.menus.highlightFirst()
    })

    // Sliding along the bar with a menu open switches menus, as it always did.
    el.addEventListener('pointerenter', () => {
      if (this.api.menus.isOpen) open()
    })

    this.host.appendChild(el)
    this.titles.push(el)
  }

  /**
   * The Apple menu: an About item and the desk accessories.
   *
   * The accessories are disabled because none of them is built — there is no Puzzle
   * and no Note Pad in Chronos — and a disabled item is the correct way to say so in
   * this era rather than a missing one. It is also where the era's disabled-text
   * stipple is most visible, which is the point: `notPatBic` is the single most
   * distinctive thing about a 1984 menu and almost every recreation renders it as
   * flat grey.
   *
   * None of them carries an accelerator, because none of them had one.
   *
   * `About the Finder...` is three periods and not U+2026. ChiKareGo2 has no ellipsis
   * glyph — Mac Roman had one at 0xC9 and the substitute simply does not carry it — so
   * the character would fall back to the browser's default face, whose fractional
   * advance takes every glyph after it in the string off the pixel grid. A fidelity
   * test asserts the substitute covers every character this skin renders, because that
   * failure is silent: the text still appears, it is just no longer 1-bit.
   */
  private appleMenu(): MenuSpec {
    return [
      { kind: 'item', label: 'About the Finder...', enabled: false },
      { kind: 'separator' },
      { kind: 'item', label: 'Alarm Clock', enabled: false },
      { kind: 'item', label: 'Calculator', enabled: false },
      { kind: 'item', label: 'Control Panel', enabled: false },
      { kind: 'item', label: 'Key Caps', enabled: false },
      { kind: 'item', label: 'Note Pad', enabled: false },
      { kind: 'item', label: 'Puzzle', enabled: false },
      { kind: 'item', label: 'Scrapbook', enabled: false },
    ]
  }

  /**
   * File: the two commands that exist, and nothing that does not.
   *
   * The era's File menu also had Get Info, Duplicate, Page Setup and Eject on ⌘I,
   * ⌘D and ⌘E. They are absent rather than present-and-disabled because listing them
   * would mean either showing their historical chords — which nothing binds, the
   * exact lie `Shell.accelFor` exists to prevent — or showing them stripped of the
   * chords the era gave them, which misrepresents the menu just as badly. They arrive
   * with the icon and selection layer.
   */
  private fileMenu(): MenuSpec {
    const wm = this.api.wm
    const id = wm.focusedId()
    const s = id !== null ? wm.get(id) : undefined
    const shell = this.api
    return [
      {
        kind: 'item',
        label: 'Open',
        command: 'shell.newWindow',
        ...accel(this.api, 'shell.newWindow'),
        enabled: true,
        // Through the command registry rather than reaching for the window manager,
        // so a menu item and its accelerator are provably the same action.
        onActivate: () => void shell.commands.run('shell.newWindow'),
      },
      {
        kind: 'item',
        label: 'Close',
        command: 'window.close',
        ...accel(this.api, 'window.close'),
        enabled: s !== undefined && s.closable,
        onActivate: () => {
          if (id !== null) void wm.close(id)
        },
      },
    ]
  }

  /**
   * Edit: the five items that made ⌘Z ⌘X ⌘C ⌘V famous, all disabled.
   *
   * They carry their historical chords even though nothing binds them, and that is
   * not the lie `accelFor` was built to stop. A **disabled** item promises nothing —
   * it is the era telling you what this menu would offer if there were something to
   * edit. An *enabled* item's accelerator must come from the keymap, and every
   * enabled item here does; a fidelity test asserts exactly that split.
   *
   * The harness has no editable content, so the whole menu is unavailable, which is
   * precisely the state a 1984 Finder showed when a Finder window was frontmost.
   */
  private editMenu(): MenuSpec {
    return [
      { kind: 'item', label: 'Undo', accel: 'Meta+Z', enabled: false },
      { kind: 'separator' },
      { kind: 'item', label: 'Cut', accel: 'Meta+X', enabled: false },
      { kind: 'item', label: 'Copy', accel: 'Meta+C', enabled: false },
      { kind: 'item', label: 'Paste', accel: 'Meta+V', enabled: false },
      { kind: 'item', label: 'Clear', enabled: false },
    ]
  }

  /**
   * View: the five sort orders, with the current one checked.
   *
   * Checked *and* disabled, which looks contradictory and is exactly right: the
   * Finder kept the current view ticked while the commands themselves were
   * unavailable. They are unavailable here because there is no icon layer to sort.
   * The checkmark is a measured 9x8 bitmap, so this is also where it is visible.
   */
  private viewMenu(): MenuSpec {
    return [
      { kind: 'item', label: 'by Icon', enabled: false, checked: true },
      { kind: 'item', label: 'by Name', enabled: false },
      { kind: 'item', label: 'by Date', enabled: false },
      { kind: 'item', label: 'by Size', enabled: false },
      { kind: 'item', label: 'by Kind', enabled: false },
    ]
  }

  /** Special: the Finder's disk and desktop commands, none of which exist yet. */
  private specialMenu(): MenuSpec {
    return [
      { kind: 'item', label: 'Clean Up', enabled: false },
      { kind: 'item', label: 'Empty Trash', enabled: false },
      { kind: 'separator' },
      { kind: 'item', label: 'Erase Disk', enabled: false },
      { kind: 'item', label: 'Set Startup', enabled: false },
    ]
  }
}

/**
 * `exactOptionalPropertyTypes` forbids `accel: undefined`, so an unbound command has
 * to contribute no key at all. A skin that binds nothing therefore shows nothing,
 * which is the behaviour `Shell.accelFor` exists to guarantee.
 */
function accel(api: ShellRegionHost, command: Command): { accel?: string } {
  const chord = api.accelFor(command)
  return chord === undefined ? {} : { accel: chord }
}

export function system1Regions(): readonly ShellRegion[] {
  return [
    {
      edge: 'top',
      kind: 'menubar',
      thickness: SYSTEM1.menuBar.height,
      reservesSpace: true,
      mount(host, api) {
        const bar = new MenuBar(host, api)
        return () => bar.destroy()
      },
    },
  ]
}
