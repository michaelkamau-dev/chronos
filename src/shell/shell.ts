/**
 * The shell: wires the display, window manager, dispatcher, switcher, menus and
 * keyboard geometry together and registers the semantic command handlers.
 *
 * Every era-specific decision reaching this file arrives as data from the skin
 * manifest — the keymap, the chrome metrics, the menu renderer, the viewport
 * spec. The shell itself contains no era conditionals, which
 * `test/invariants.test.js` enforces.
 */

import './base.css'
import { Display, type ViewportSpec } from './display.js'
import { Switcher } from './switcher.js'
import { KeyboardGeometry } from './keyboard-geometry.js'
import { WindowManager } from '../core/wm/manager.js'
import { GestureController } from '../core/wm/drag.js'
import { Dispatcher, type HitTarget } from '../core/input/dispatcher.js'
import { CaptureStack } from '../core/input/capture.js'
import { CommandRegistry, type Command } from '../core/input/commands.js'
import { Keymap, KeymapStack, type Binding } from '../core/input/keymap.js'
import { MenuController, type MenuRenderer, type MenuSpec } from '../core/input/menu.js'
import { asAppId, type ChromeRenderer, type WindowId } from '../core/wm/types.js'

export interface SkinManifest {
  id: string
  chrome: ChromeRenderer
  menu: MenuRenderer
  keymap: readonly Binding[]
  viewport?: ViewportSpec
  /**
   * Custom properties derived from the skin's measured metrics, applied to the shell
   * root. This is how a stylesheet reads a measurement without keeping a second copy
   * of it that could drift — the XP caption gradient and frame steps are generated
   * from the arrays in its metrics file.
   *
   * The root rather than the desktop, because menus are hosted on the root and
   * inherit nothing written below it.
   */
  generatedProperties?: () => Record<string, string>
}

/** Supplies the MenuSpec for a right-click on a given target. */
export type ContextMenuProvider = (hit: HitTarget) => MenuSpec | null

export class Shell {
  readonly display: Display
  readonly wm: WindowManager
  readonly gestures: GestureController
  readonly capture = new CaptureStack()
  readonly commands = new CommandRegistry()
  readonly keymaps = new KeymapStack()
  readonly dispatcher: Dispatcher
  readonly switcher: Switcher
  readonly keyboardGeometry: KeyboardGeometry
  readonly menus: MenuController
  /** The active skin's chord table, kept for the keyboard-completeness gate. */
  readonly skinKeymap: readonly Binding[]

  private readonly activeKeymap: Keymap
  private readonly teardowns: Array<() => void> = []
  private readonly providers: ContextMenuProvider[] = []
  private untitledCount = 0

  constructor(root: HTMLElement, skin: SkinManifest) {
    this.display = new Display(root, skin.viewport ?? { mode: 'native' })
    this.teardowns.push(this.display.attach())

    // The skin id lets era CSS scope itself to the desktop; the generated properties
    // carry measured values into the stylesheet from the root, which every surface
    // inherits from including the menus hosted there.
    this.display.desktop.dataset['skin'] = skin.id
    if (skin.generatedProperties) {
      /*
       * On the shell root, not on the desktop. Menus live on the root so that the
       * display transform cannot clip them, which means anything written onto the
       * desktop is invisible to them — a menu got no background, no border and the
       * browser's default serif. Writing at the root is the one placement every
       * surface inherits from.
       */
      for (const [prop, value] of Object.entries(skin.generatedProperties())) {
        root.style.setProperty(prop, value)
      }
    }

    this.wm = new WindowManager(this.display.desktop, skin.chrome, this.display.workArea())
    this.gestures = new GestureController(this.wm)
    this.switcher = new Switcher(this.wm, this.capture, this.display.desktop)
    this.keyboardGeometry = new KeyboardGeometry(this.wm, this.capture)
    this.menus = new MenuController(skin.menu, this.capture, root)

    this.dispatcher = new Dispatcher({
      root,
      wm: this.wm,
      gestures: this.gestures,
      capture: this.capture,
      keymaps: this.keymaps,
      commands: this.commands,
      hooks: {
        onContextMenu: (hit, x, y) => this.openContextMenu(hit, x, y),
        onBlockedInteraction: (blocked, modal) => this.flashModal(blocked, modal),
      },
    })

    // Keep the dispatcher's coordinate conversion and the WM's work area in step
    // with the display, so a viewport resize needs no other coordination.
    this.teardowns.push(
      this.display.subscribe((s) => {
        this.dispatcher.setDisplayTransform({
          scale: s.scale,
          offsetX: s.offsetX,
          offsetY: s.offsetY,
        })
        this.wm.setWorkArea(this.display.workArea())
      }),
    )
    const initial = this.display.current()
    this.dispatcher.setDisplayTransform({
      scale: initial.scale,
      offsetX: initial.offsetX,
      offsetY: initial.offsetY,
    })
    this.wm.setWorkArea(this.display.workArea())

    this.skinKeymap = skin.keymap
    this.activeKeymap = new Keymap(skin.keymap)
    this.keymaps.push(this.activeKeymap)
    this.registerDefaultContextMenus()
    this.teardowns.push(this.registerCommands())
    this.teardowns.push(this.dispatcher.attach())
  }

  /** Chords in the active keymap that no real KeyboardEvent could match. */
  unreachableChords(): string[] {
    return this.activeKeymap.unknownKeys()
  }

  /**
   * The chord the active skin binds to a command, for a menu's accelerator column.
   *
   * The chrome menu used to carry the literal strings `Alt+F7`, `Alt+F4` and friends.
   * That is era knowledge in `shell/`: it happens to be right for Windows XP and
   * Windows 3.1 and is flatly wrong for a Macintosh menu, where the same items are
   * Command chords — so the label would have advertised a chord the active keymap
   * does not even bind. Reading it back out of the skin's own keymap means the label
   * and the binding cannot disagree.
   *
   * The chord is passed through verbatim. Formatting it is the skin's job, because
   * `Meta+W` renders as `Alt+F4`-style text on Windows and as a symbol on a Mac.
   */
  accelFor(command: Command): string | undefined {
    for (const b of this.skinKeymap) if (b.command === command) return b.chord
    return undefined
  }

  /**
   * The MenuSpec a given target would produce, without opening anything.
   * Providers are consulted most-recently-registered first.
   */
  menuSpecFor(hit: HitTarget): MenuSpec | null {
    for (let i = this.providers.length - 1; i >= 0; i--) {
      const spec = this.providers[i]?.(hit)
      if (spec && spec.length > 0) return spec
    }
    return null
  }

  /** Providers are consulted most-recently-registered first. */
  addContextMenuProvider(fn: ContextMenuProvider): () => void {
    this.providers.push(fn)
    return () => {
      const i = this.providers.indexOf(fn)
      if (i >= 0) this.providers.splice(i, 1)
    }
  }

  /** Focus DOM into the active window whenever WM focus changes. */
  bindFocusFollowing(): () => void {
    const un = this.wm.subscribe((e) => {
      if (e.type !== 'focused') return
      const handle = this.wm.handleOf(e.id)
      if (!handle) return
      if (!this.dispatcher.focusScope.contains(handle.el)) {
        this.dispatcher.focusScope.focusFirst(handle.el)
      }
    })
    this.teardowns.push(un)
    return un
  }

  openWindow(title?: string): WindowId {
    this.untitledCount++
    return this.wm.open({
      appId: asAppId('harness'),
      title: title ?? `Window ${this.untitledCount}`,
      minSize: { w: 160, h: 90 },
    })
  }

  destroy(): void {
    this.menus.closeAll()
    this.capture.releaseAll()
    for (let i = this.teardowns.length - 1; i >= 0; i--) this.teardowns[i]?.()
    this.teardowns.length = 0
  }

  // ------------------------------------------------------------------ private

  private openContextMenu(hit: HitTarget, logicalX: number, logicalY: number): boolean {
    const spec = this.menuSpecFor(hit)
    if (!spec) return false
    const t = this.dispatcher.displayTransform()
    return this.menus.open(spec, logicalX * t.scale + t.offsetX, logicalY * t.scale + t.offsetY)
  }

  /**
   * Era-correct rejection feedback for clicking a window blocked by its own
   * modal. Windows flashed the modal's caption three times; the harness does the
   * same, and respects reduced-motion by holding the highlight instead.
   */
  private flashModal(blockedId: WindowId, modalId: WindowId): void {
    void blockedId
    const handle = this.wm.handleOf(modalId)
    const bar = handle?.el.querySelector<HTMLElement>('[data-part="titlebar"]')
    if (!bar) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      bar.dataset['alert'] = 'true'
      window.setTimeout(() => delete bar.dataset['alert'], 360)
      return
    }
    bar.animate(
      [
        { filter: 'none' },
        { filter: 'invert(1)' },
        { filter: 'none' },
        { filter: 'invert(1)' },
        { filter: 'none' },
        { filter: 'invert(1)' },
        { filter: 'none' },
      ],
      { duration: 360, easing: 'steps(1, end)' },
    )
  }

  private registerDefaultContextMenus(): void {
    const wm = this.wm
    this.addContextMenuProvider((hit) => {
      // The title-bar / chrome menu: the same items Alt+Space produced.
      if (hit.kind === 'titlebar' || hit.kind === 'action') {
        const id = hit.windowId
        if (id === null) return null
        const s = wm.get(id)
        if (!s) return null
        const hasModal = wm.modalsOwnedBy(id).length > 0
        // An era that has no maximize gesture must not offer one here either. The WM
        // already refuses the command; leaving the items enabled would advertise a
        // control that does nothing, which is the same lie as a resize cursor on an
        // edge that will not resize.
        const canZoom = wm.metrics.maximizeSemantics !== 'none'
        return [
          {
            kind: 'item',
            label: 'Restore',
            command: 'window.toggleMaximize',
            enabled: canZoom && s.maximized && !hasModal,
            onActivate: () => wm.toggleMaximize(id),
          },
          {
            kind: 'item',
            label: 'Move',
            command: 'window.beginKeyboardMove',
            ...accel(this, 'window.beginKeyboardMove'),
            enabled: !s.maximized && !hasModal,
            onActivate: () => {
              wm.focus(id)
              this.keyboardGeometry.begin('move')
            },
          },
          {
            kind: 'item',
            label: 'Size',
            command: 'window.beginKeyboardResize',
            ...accel(this, 'window.beginKeyboardResize'),
            enabled: s.resizable && !s.maximized && !hasModal,
            onActivate: () => {
              wm.focus(id)
              this.keyboardGeometry.begin('resize')
            },
          },
          {
            kind: 'item',
            label: 'Minimize',
            command: 'window.minimize',
            ...accel(this, 'window.minimize'),
            enabled: wm.metrics.minimizeStyle !== 'none' && !s.minimized && !hasModal,
            onActivate: () => void wm.minimize(id),
          },
          {
            kind: 'item',
            label: 'Maximize',
            command: 'window.toggleMaximize',
            ...accel(this, 'window.toggleMaximize'),
            enabled: canZoom && s.resizable && !s.maximized && !hasModal,
            onActivate: () => wm.toggleMaximize(id),
          },
          { kind: 'separator' },
          {
            kind: 'submenu',
            label: 'Order',
            enabled: true,
            items: [
              {
                kind: 'item',
                label: 'Bring to Front',
                command: 'window.raise',
                enabled: true,
                onActivate: () => wm.raise(id),
              },
              {
                kind: 'item',
                label: 'Send to Back',
                command: 'window.lower',
                enabled: true,
                onActivate: () => wm.lower(id),
              },
            ],
          },
          { kind: 'separator' },
          {
            kind: 'item',
            label: 'Close',
            command: 'window.close',
            ...accel(this, 'window.close'),
            enabled: s.closable && !hasModal,
            onActivate: () => void wm.close(id),
          },
        ]
      }

      if (hit.kind === 'desktop') {
        return [
          {
            kind: 'item',
            label: 'New Window',
            command: 'shell.newWindow',
            ...accel(this, 'shell.newWindow'),
            enabled: true,
            onActivate: () => {
              this.openWindow()
            },
          },
          { kind: 'separator' },
          {
            kind: 'item',
            label: 'Close All Windows',
            enabled: wm.list().length > 0,
            onActivate: () => {
              for (const s of [...wm.list()]) void wm.close(s.id)
            },
          },
        ]
      }
      return null
    })
  }

  private registerCommands(): () => void {
    const wm = this.wm
    return this.commands.pushLayer({
      'window.close': () => {
        const id = wm.focusedId()
        if (id !== null) void wm.close(id)
      },
      'window.minimize': () => {
        const id = wm.focusedId()
        if (id !== null) void wm.minimize(id)
      },
      'window.toggleMaximize': () => {
        const id = wm.focusedId()
        if (id !== null) wm.toggleMaximize(id)
      },
      'window.cycleNext': () => this.switcher.cycle(1),
      'window.cyclePrev': () => this.switcher.cycle(-1),
      'window.raise': () => {
        const id = wm.focusedId()
        if (id !== null) wm.raise(id)
      },
      'window.lower': () => {
        const id = wm.focusedId()
        if (id !== null) wm.lower(id)
      },
      'window.beginKeyboardMove': () => this.keyboardGeometry.begin('move'),
      'window.beginKeyboardResize': () => this.keyboardGeometry.begin('resize'),
      'window.openChromeMenu': () => {
        const id = wm.focusedId()
        if (id === null) return
        const handle = wm.handleOf(id)
        const bar = handle?.el.querySelector<HTMLElement>('[data-part="titlebar"]')
        if (!bar) return
        const box = bar.getBoundingClientRect()
        const hit = this.dispatcher.resolve(bar)
        const t = this.dispatcher.displayTransform()
        if (
          this.openContextMenu(
            hit,
            (box.left - t.offsetX) / t.scale,
            (box.bottom - t.offsetY) / t.scale,
          )
        ) {
          this.menus.highlightFirst()
        }
      },
      'shell.closeTransient': () => {
        if (this.menus.isOpen) this.menus.closeAll()
      },
      'shell.newWindow': () => {
        this.openWindow()
      },
    })
  }
}

/**
 * `exactOptionalPropertyTypes` forbids writing `accel: undefined`, so the property is
 * spread in only when the active skin actually binds the command.
 */
function accel(shell: Shell, command: Command): { accel?: string } {
  const chord = shell.accelFor(command)
  return chord === undefined ? {} : { accel: chord }
}
