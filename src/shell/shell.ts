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
import { RenderBudget, type RenderBudgetSpec } from '../core/input/render-budget.js'
import { asAppId, type ChromeRenderer, type WindowId } from '../core/wm/types.js'
import type { AppHost, AppInstance, AppModule, LaunchOptions, WindowHandle } from '../core/app/types.js'
import { createUiKit } from '../core/ui/kit.js'
import { DialogService } from '../core/ui/dialogs.js'
import type { FsApi, NameDecorator, PathCodec } from '../core/fs/types.js'
import type { Rect } from '../core/geometry.js'

/**
 * What a shell region needs in order to be useful, and deliberately nothing more.
 *
 * A menu bar has to open menus and read the window list; a Dock has to list
 * windows, minimize and restore them, and report where a window's tile sits. All of
 * that is era-neutral vocabulary — the shell hands it over and never learns what the
 * region does with it.
 */
export interface ShellRegionHost {
  readonly wm: WindowManager
  readonly menus: MenuController
  /**
   * The system's frame clock.
   *
   * Era-neutral: any region that needs to repaint on a schedule subscribes here
   * rather than taking its own `requestAnimationFrame`, so the frames it costs are
   * counted and its rate obeys whatever target the skin declared. A region that
   * repaints only on events never touches it and the clock never starts.
   */
  readonly budget: RenderBudget
  /**
   * The command registry, so a region's menu entries route through the same
   * semantic commands the keymap does rather than reaching for the shell directly.
   * That is what keeps a menu item and its accelerator provably the same action —
   * which `test/browser/a11y.spec.ts` asserts across the whole vocabulary.
   */
  readonly commands: CommandRegistry
  /**
   * The chord the active skin binds to a command, for a region's accelerator column.
   *
   * `Shell.accelFor` with the same contract, exposed here because a region's menus
   * are the most visible place an accelerator label can disagree with the keyboard.
   * Without it a menu bar has to write chords as literals, which is right for the era
   * that wrote them and wrong for every other — Tiger's bar carries `Meta+N` and
   * `Meta+W` for exactly that reason.
   */
  accelFor(command: Command): string | undefined
  /** Open a menu with its top-left at these client coordinates. */
  openMenu(spec: MenuSpec, clientX: number, clientY: number): boolean
  /** Ask the shell to re-read every region's minimize targets and geometry. */
  invalidate(): void
}

/**
 * A menu entry's accelerator, spread into the entry, or nothing when the active skin
 * binds no chord to the command.
 *
 * A three-line helper with a reason to exist. `exactOptionalPropertyTypes` forbids
 * `accel: undefined`, so an unbound command has to contribute no key *at all* rather
 * than an absent one — which is exactly the behaviour that makes a skin binding nothing
 * show nothing. Written out at each call site that is one more place a literal can
 * creep back in, and written out per skin it is one more copy to drift, so it lives
 * here beside the interface it reads.
 *
 *     { kind: 'item', label: 'Close', command: 'window.close',
 *       ...accelFrom(api, 'window.close'), enabled: true, onActivate }
 */
export function accelFrom(api: ShellRegionHost, command: Command): { accel?: string } {
  const chord = api.accelFor(command)
  return chord === undefined ? {} : { accel: chord }
}

/**
 * One edge-anchored strip of shell chrome: a menu bar, a taskbar, a Dock, Ledger's
 * budget bar.
 *
 * `reservesSpace` is the whole point of the abstraction. The shell subtracts every
 * reserving region from the work area and hands the window manager a plain rect, so
 * the WM knows a Dock exists only as "the work area is 68px shorter" — never as
 * "this is Tiger". ARCHITECTURE.md §5.
 */
export interface ShellRegion {
  edge: 'top' | 'bottom' | 'left' | 'right'
  /** A label for CSS and tests, not behaviour. `menubar`, `taskbar`, `dock`, … */
  kind: string
  /** Extent along the perpendicular axis, in logical era pixels. */
  thickness: number
  /** Does it shrink the window work area? */
  reservesSpace: boolean
  /**
   * Fill the region's element. Returns a teardown, or nothing if there is none.
   * Called once, after the window manager and menu controller exist.
   */
  mount(host: HTMLElement, api: ShellRegionHost): (() => void) | void
  /**
   * Where a window shrinks to when minimized, if this region owns that answer.
   * Consulted at minimize time so a moving Dock tile or taskbar button is current.
   */
  minimizeTarget?(id: WindowId): Rect | null
}

export interface SkinManifest {
  id: string
  chrome: ChromeRenderer
  menu: MenuRenderer
  keymap: readonly Binding[]
  viewport?: ViewportSpec
  /**
   * Edge-anchored shell chrome. Omit for an era with none — Windows 3.1 had no
   * taskbar at all, and its skin declares no regions rather than declaring an
   * empty one.
   */
  regions?: readonly ShellRegion[]
  /**
   * The rate this era holds the display to, if it holds it to one at all.
   *
   * Omit for the display's own rate, which is what five of the six eras want. The
   * shell passes this straight to the governor and neither it nor `core/input` ever
   * learns why the number is what it is — the same shape of fact as a region's
   * `thickness`.
   */
  renderBudget?: RenderBudgetSpec
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

/**
 * What the shell needs before it can launch an app.
 *
 * Optional on the constructor because the window manager, the switcher and the
 * whole of phase 1–4 work without a filesystem, and a required argument would
 * make every window-manager test construct one. `launchApp` is the only thing
 * that needs them and it says so.
 */
export interface AppServices {
  fs: FsApi
  codec: PathCodec
  decorate: NameDecorator
}

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
  /**
   * The single animation clock. Public because a skin's regions drive their own
   * repaints from it and the fidelity suites measure what it delivered.
   */
  readonly budget = new RenderBudget()
  /** The active skin's chord table, kept for the keyboard-completeness gate. */
  readonly skinKeymap: readonly Binding[]

  private readonly activeKeymap: Keymap
  private readonly teardowns: Array<() => void> = []
  private readonly providers: ContextMenuProvider[] = []
  private readonly regionEls = new Map<string, HTMLElement>()
  private regions: readonly ShellRegion[] = []
  /** Edges claimed by the skin's reserving regions. */
  private regionReserved = { top: 0, right: 0, bottom: 0, left: 0 }
  /** Edges claimed by anything else, currently the harness status strip. */
  private extraReserved = { top: 0, right: 0, bottom: 0, left: 0 }
  private untitledCount = 0
  private readonly services: AppServices | null
  private readonly dialogs: DialogService | null
  /** Mounted app instances, so a right-click can reach the app that owns the window. */
  private readonly apps = new Map<WindowId, AppInstance>()
  private readonly appHandles = new Map<WindowId, WindowHandle>()

  constructor(root: HTMLElement, skin: SkinManifest, services?: AppServices) {
    this.display = new Display(root, skin.viewport ?? { mode: 'native' })
    this.teardowns.push(this.display.attach())

    // The skin id lets era CSS scope itself to the desktop; the generated properties
    // carry measured values into the stylesheet from the root, which every surface
    // inherits from including the menus hosted there.
    this.display.desktop.dataset['skin'] = skin.id
    if (skin.generatedProperties) {
      // Written on the shell root rather than on the desktop, because custom
      // properties inherit and menus, the switcher and any other overlay are hosted
      // on the root — *outside* the desktop. Setting them on the desktop leaves every
      // overlay with undefined variables, which fails silently and completely: a menu
      // renders with no background, no border colour and the browser's default serif.
      for (const [prop, value] of Object.entries(skin.generatedProperties())) {
        root.style.setProperty(prop, value)
      }
    }

    if (skin.renderBudget) this.budget.setSpec(skin.renderBudget)

    this.wm = new WindowManager(this.display.desktop, skin.chrome, this.display.workArea())
    this.gestures = new GestureController(this.wm, this.budget)
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
      budget: this.budget,
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

    this.services = services ?? null
    this.dialogs =
      services === undefined
        ? null
        : new DialogService({
            wm: this.wm,
            fs: services.fs,
            codec: services.codec,
            decorate: services.decorate,
          })

    this.skinKeymap = skin.keymap
    this.activeKeymap = new Keymap(skin.keymap)
    this.keymaps.push(this.activeKeymap)
    // Defaults first: providers are consulted most-recently-registered first, so
    // an app's own menu for a click inside its content outranks the chrome menu.
    this.registerDefaultContextMenus()
    this.registerAppContextMenus()
    this.teardowns.push(this.registerCommands())
    this.mountRegions(skin.regions ?? [])
    this.teardowns.push(this.dispatcher.attach())
  }

  /** The region elements, keyed by `kind`, for tests and for a skin's own lookups. */
  regionElement(kind: string): HTMLElement | null {
    return this.regionEls.get(kind) ?? null
  }

  /**
   * Reserve edge space on top of whatever the skin's regions already claim.
   *
   * The harness status strip is not a skin region — it is scaffolding that every era
   * shows — so it needs to add to the reservation rather than replace it. Writing
   * `display.setReservedEdges` directly would silently discard a menu bar or a Dock,
   * which is exactly the bug this method exists to make impossible.
   */
  addReservedEdges(extra: { top?: number; right?: number; bottom?: number; left?: number }): void {
    this.extraReserved = {
      top: (this.extraReserved.top ?? 0) + (extra.top ?? 0),
      right: (this.extraReserved.right ?? 0) + (extra.right ?? 0),
      bottom: (this.extraReserved.bottom ?? 0) + (extra.bottom ?? 0),
      left: (this.extraReserved.left ?? 0) + (extra.left ?? 0),
    }
    this.applyReservedEdges()
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

  /**
   * Bind a mounted app instance to its window.
   *
   * This is the whole of the `suspend()`/`resume()` wiring, and where it lives is the
   * point. §2's first invariant is that the window manager knows nothing about apps,
   * so the WM owns `WindowState.suspended` and emits `suspended`/`resumed` — a fact
   * about a *window* — and the shell is what turns that into a call on an *instance*.
   * Putting the instance on the WM instead would have been one field and would have
   * broken the invariant the whole architecture is built on.
   *
   * The close guard is registered from the same place for the same reason: `canClose`
   * belongs to the app, `close()` belongs to the window manager, and the shell is the
   * only layer that may know both.
   *
   * **Scope, stated plainly.** Phase 5's gate is that every app survives the round
   * trip with state intact — Paint's undo stack, the editor's cursor and selection,
   * the terminal's scrollback — verified per app. There are no apps yet. What this
   * routing has is one harness implementation, which proves the contract is wireable
   * and proves nothing about six apps honouring it.
   */
  registerApp(id: WindowId, instance: AppInstance): () => void {
    this.wm.setCloseGuard(id, () => instance.canClose())
    const un = this.wm.subscribe((e) => {
      if (e.id !== id) return
      switch (e.type) {
        case 'suspended':
          instance.suspend()
          return
        case 'resumed':
          instance.resume()
          return
        case 'focused':
          instance.onFocus?.()
          return
        case 'blurred':
          instance.onBlur?.()
          return
        case 'resized': {
          const s = this.wm.get(id)
          if (s) instance.onResize?.(s.rect.w, s.rect.h)
          return
        }
        case 'closed':
          instance.destroy()
          un()
          return
        default:
          return
      }
    })
    this.teardowns.push(un)
    return un
  }

  /**
   * Open a window and mount an app into it.
   *
   * The shell is the layer that may know both halves — §2's first invariant is
   * that the window manager knows nothing about apps, and §5's is that an app
   * knows core and nothing else, so the wiring between them belongs to neither
   * and has to live here. What an app receives is an `AppHost` and no route back
   * to the window manager, the skin, or any other window.
   *
   * Every teardown is registered against the window's own `closed` event rather
   * than against the shell's, because an app window outliving its kit's delegated
   * listeners is a leak that only shows up after a few hundred opens.
   */
  launchApp(module: AppModule, opts: LaunchOptions = {}): WindowId {
    const services = this.services
    const dialogs = this.dialogs
    if (!services || !dialogs) {
      throw new Error('Shell.launchApp needs AppServices; construct the shell with them')
    }

    const id = this.wm.open({
      appId: module.id,
      title: opts.title ?? module.title,
      minSize: module.minSize,
      resizable: module.resizable,
      rect: this.cascadeRect(module.defaultSize),
    })
    const frame = this.wm.handleOf(id)
    if (!frame) return id

    const ui = createUiKit(frame.content)
    const win: WindowHandle = {
      id,
      setTitle: (title) => this.wm.setTitle(id, title),
      setDirty: (dirty) => this.wm.setDirty(id, dirty),
      requestClose: () => void this.wm.close(id),
      openDialog: (spec) => dialogs.open(id, spec),
      message: (spec) => dialogs.message(id, spec),
      openFile: (spec) => dialogs.openFile(id, spec),
      saveFile: (spec) => dialogs.saveFile(id, spec),
      chooseFolder: (spec) => dialogs.chooseFolder(id, spec),
    }
    const host: AppHost = {
      root: frame.content,
      fs: services.fs,
      codec: services.codec,
      decorate: services.decorate,
      win,
      ui,
    }

    const instance = module.mount(host)
    this.apps.set(id, instance)
    this.appHandles.set(id, win)
    const unregister = this.registerApp(id, instance)

    const un = this.wm.subscribe((e) => {
      if (e.id !== id || e.type !== 'closed') return
      // `registerApp` already called `destroy()` on the instance; this releases
      // the kit's listeners and the shell's own reference to the app.
      this.apps.delete(id)
      this.appHandles.delete(id)
      ui.destroy()
      un()
    })
    this.teardowns.push(() => {
      un()
      unregister()
      this.apps.delete(id)
      this.appHandles.delete(id)
      ui.destroy()
    })
    return id
  }

  /** The app instance mounted in a window, or undefined if the window hosts none. */
  appFor(id: WindowId): AppInstance | undefined {
    return this.apps.get(id)
  }

  /**
   * The window handle an app was given.
   *
   * Public because the dialogs on it are a *service*: anything that legitimately
   * acts on behalf of a window — a menu bar item, a shell command — needs the same
   * route to them that the app has, and rebuilding a second handle would mean two
   * objects claiming to speak for one window.
   */
  handleFor(id: WindowId): WindowHandle | undefined {
    return this.appHandles.get(id)
  }

  /** The app mounted in a window, for a menu bar that renders the app's own menus. */
  appMenuFor(id: WindowId): MenuSpec | null {
    const spec = this.apps.get(id)?.menu()
    return spec && spec.length > 0 ? spec : null
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
    this.budget.destroy()
    for (let i = this.teardowns.length - 1; i >= 0; i--) this.teardowns[i]?.()
    this.teardowns.length = 0
  }

  // ------------------------------------------------------------------ private

  /**
   * Build each declared region, reserve the edges they claim, and route minimize
   * targets to whichever region owns one.
   *
   * Regions live inside the desktop element rather than beside it, so they are
   * inside the display transform: a 512x342 era's menu bar scales with its
   * integer-scaled viewport instead of floating at device scale beside it.
   */
  private mountRegions(regions: readonly ShellRegion[]): void {
    this.regions = regions
    if (regions.length === 0) return

    const api: ShellRegionHost = {
      wm: this.wm,
      menus: this.menus,
      budget: this.budget,
      commands: this.commands,
      accelFor: (command) => this.accelFor(command),
      openMenu: (spec, x, y) => this.menus.open(spec, x, y),
      invalidate: () => this.wm.setWorkArea(this.display.workArea()),
    }

    const reserved = { top: 0, right: 0, bottom: 0, left: 0 }
    for (const region of regions) {
      const el = document.createElement('div')
      el.dataset['shellRegion'] = region.kind
      el.dataset['edge'] = region.edge
      // The thickness is the skin's measurement, so it is written from the
      // manifest rather than duplicated in a stylesheet where it could drift.
      if (region.edge === 'top' || region.edge === 'bottom') {
        el.style.height = `${region.thickness}px`
      } else {
        el.style.width = `${region.thickness}px`
      }
      this.display.desktop.appendChild(el)
      this.regionEls.set(region.kind, el)

      const teardown = region.mount(el, api)
      this.teardowns.push(() => {
        teardown?.()
        el.remove()
        this.regionEls.delete(region.kind)
      })

      if (region.reservesSpace) reserved[region.edge] += region.thickness
    }

    this.regionReserved = reserved
    this.applyReservedEdges()

    const owners = regions.filter((r) => r.minimizeTarget !== undefined)
    if (owners.length > 0) {
      this.wm.setMinimizeTarget((id) => {
        for (const r of owners) {
          const target = r.minimizeTarget?.(id)
          if (target) return target
        }
        return null
      })
      this.teardowns.push(() => this.wm.setMinimizeTarget(null))
    }
  }

  private applyReservedEdges(): void {
    /*
     * Two different quantities, and they are not interchangeable.
     *
     * A region is inside the desktop, so its claim is in logical era pixels and only
     * the work area shrinks. The harness status strip is anchored to the host in CSS
     * pixels, so on top of shrinking the work area it has to move the desktop clear of
     * itself — otherwise it paints over a fixed-mode era's bottom rows.
     */
    this.display.setHostInsets(this.extraReserved)
    this.display.setReservedEdges({
      top: this.regionReserved.top + this.extraReserved.top,
      right: this.regionReserved.right + this.extraReserved.right,
      bottom: this.regionReserved.bottom + this.extraReserved.bottom,
      left: this.regionReserved.left + this.extraReserved.left,
    })
    // A region sits inside whatever else has already claimed its edge, so the Dock
    // lands above the harness status strip rather than underneath it. Without this
    // the work area is right and the pixels are wrong, which is the worst of both.
    for (const region of this.regions) {
      const el = this.regionEls.get(region.kind)
      if (!el) continue
      el.style[region.edge] = `${this.extraReserved[region.edge]}px`
    }
    this.wm.setWorkArea(this.display.workArea())
  }

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

  /**
   * A cascaded rect at the app's declared size, clamped into the work area.
   *
   * The clamp is what keeps an app honest on a 512x342 screen: a 640px default
   * size is not a reason to open a window wider than the display, and an app is
   * not allowed to know which era would do that to it.
   */
  private cascadeRect(size: { w: number; h: number }): Rect {
    const work = this.wm.workArea()
    const step = this.wm.metrics.cascadeStep * (this.wm.list().length % 8)
    const w = Math.min(size.w, work.w)
    const h = Math.min(size.h, work.h)
    return {
      x: Math.min(work.x + step, work.x + work.w - w),
      y: Math.min(work.y + step, work.y + work.h - h),
      w,
      h,
    }
  }

  /** Right-click inside an app's content reaches that app, and nothing else does. */
  private registerAppContextMenus(): void {
    this.addContextMenuProvider((hit) => {
      if (hit.kind !== 'content' || hit.windowId === null) return null
      return this.apps.get(hit.windowId)?.contextMenu(hit) ?? null
    })
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
