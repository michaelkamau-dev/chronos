/**
 * Ledger's shell: the budget bar, the refresh band, the suspension policy and the
 * Steward.
 *
 * Everything here is era behaviour expressed through era-neutral machinery, which is
 * the claim §8 makes about this era being the honesty test: "If a premise this hostile
 * to the other five drops into the same `Skin` manifest with only those two additions,
 * the contract is real." Four things that could each have been a core change and are
 * not:
 *
 * - **The suspension policy is a skin timer calling `wm.suspend`.** §8 deletes
 *   background execution — "Nothing runs when you are not looking at it ... suspended
 *   to a bitmap within about 400ms of losing focus" — and the window manager learns
 *   only that someone called `suspend(id)`. It never learns that an era has a policy,
 *   exactly as it never learns that a Dock exists.
 * - **The refresh band is a shell region.** An edge-anchored strip of its own height,
 *   `reservesSpace: false`, moved by a transform. A band that travels down the screen
 *   *is* a strip whose position changes, so the existing region contract expresses it
 *   with nothing added.
 * - **The Steward is a real modal window.** Not an overlay with a new z-layer: it is
 *   `wm.open({ modalOwner })`, so it inherits the genuine `inert` blocking, the focus
 *   redirect and the rejection feedback the window manager already implements — and it
 *   gets Ledger chrome, which means the assistant that bills you for your work carries
 *   its own cost gutter billing you for itself.
 * - **The 0.5Hz cursor is arithmetic on the governor**, not a timer. At §8's 1Hz idle
 *   refresh, half that rate is every other delivered frame.
 *
 * ### The one accessibility tension, and how it is resolved rather than dodged
 *
 * §8 says the Steward "can be deferred but not disabled, and the defer control is
 * deliberately the smallest target on screen". `CLAUDE.md` says an era's hostile
 * behaviour may never be the thing that blocks an accessibility escape hatch, and
 * names this era's two halves explicitly: reduced motion governs the refresh band, the
 * Steward stays undisableable.
 *
 * So the hostility is kept where §8 put it — in the *pointer* target, which really is
 * 12px — and defeated where it would otherwise block someone: Defer is a real
 * `<button>` in the tab order with a full-size focus ring, and Escape defers. A tiny
 * click target is an era being unpleasant; an unreachable one is an era being broken,
 * and those are different things.
 */

import { accelFrom, type ShellRegion, type ShellRegionHost } from '../../shell/shell.js'
import { onReducedMotionChange, prefersReducedMotion } from '../../core/motion.js'
import { asAppId, type WindowId } from '../../core/wm/types.js'
import type { MenuSpec } from '../../core/input/menu.js'
import type { FrameTick } from '../../core/input/render-budget.js'
import { formatCalls, formatElapsed, formatJoules, type LedgerClock, type WindowCost } from './clock.js'
import { REFRESH, SHELL, STEWARD, SUSPEND_AFTER_MS } from './metrics.js'

/**
 * The budget bar.
 *
 * §5 lists Ledger's launcher as `ledger-index`, and §8 says paths are entry numbers,
 * so the bar's launcher is an index field: type `#04412` and the entry opens. That is
 * also where the 0.5Hz cursor lives — it needed a real text field to be a real cursor,
 * and this era has exactly one.
 */
class BudgetBar {
  private readonly api: ShellRegionHost
  private readonly clock: LedgerClock
  private readonly total: HTMLElement
  private readonly field: HTMLInputElement
  private readonly caret: HTMLElement
  private readonly tiles: HTMLElement
  private readonly teardowns: Array<() => void> = []
  /** Reused: read on every delivered frame. */
  private readonly cost: WindowCost = { joules: 0, modelCalls: 0, elapsedMs: 0, frames: 0 }
  private lastTotal = ''
  private caretOn = false
  private steward: Steward | null = null

  constructor(host: HTMLElement, api: ShellRegionHost, clock: LedgerClock) {
    this.api = api
    this.clock = clock
    host.className = 'lg-bar'
    host.setAttribute('role', 'group')
    host.setAttribute('aria-label', 'Budget')

    const label = document.createElement('span')
    label.className = 'lg-bar-label'
    label.textContent = 'SESSION'
    host.appendChild(label)

    this.total = document.createElement('span')
    this.total.className = 'lg-bar-total'
    this.total.dataset['ledgerTotal'] = ''
    host.appendChild(this.total)

    // The index field. §8: "The terminal accepts either" form; this is the same
    // acceptance one layer up, on the shell's own launcher.
    const wrap = document.createElement('div')
    wrap.className = 'lg-index'
    const indexLabel = document.createElement('label')
    indexLabel.className = 'lg-index-label'
    indexLabel.textContent = 'ENTRY'
    this.field = document.createElement('input')
    this.field.type = 'text'
    this.field.className = 'lg-index-field'
    this.field.id = 'lg-index-field'
    this.field.dataset['ledgerIndex'] = ''
    indexLabel.htmlFor = this.field.id
    // A visible label rather than a `placeholder`. Two reasons, and the second is the
    // era's: a hint vanishes the moment you type, which is wrong for a field whose
    // entire content is an account number; and a machine that prints a regulatory
    // disclosure on every window does not hint at anything.
    //
    // This is also where the stub-marker guard's collision with the DOM was found —
    // `test/invariants.test.js` banned the bare word against raw text, so it fired on
    // legitimate use and on any comment explaining one. The guard is narrowed now and
    // the attribute could be used here; the label stays because it is the better
    // design for the era, not because anything forbids the alternative.
    this.caret = document.createElement('span')
    this.caret.className = 'lg-caret'
    this.caret.dataset['ledgerCaret'] = 'off'
    this.caret.setAttribute('aria-hidden', 'true')
    wrap.append(this.field, this.caret)
    host.append(indexLabel, wrap)

    this.tiles = document.createElement('div')
    this.tiles.className = 'lg-tiles'
    this.tiles.dataset['ledgerTiles'] = ''
    host.appendChild(this.tiles)

    const onInput = (): void => this.placeCaret()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Enter') return
      e.preventDefault()
      // The press must not reach the dispatcher, which would route Enter as a
      // command against the focused window. DECISIONS 4.27, one layer out.
      e.stopPropagation()
      this.submit()
    }
    this.field.addEventListener('input', onInput)
    this.field.addEventListener('keydown', onKey)
    this.teardowns.push(() => {
      this.field.removeEventListener('input', onInput)
      this.field.removeEventListener('keydown', onKey)
    })

    this.teardowns.push(this.clock.watch(() => this.paint()))
    this.teardowns.push(
      api.wm.subscribe((e) => {
        if (e.type === 'minimized' || e.type === 'restored' || e.type === 'closed' || e.type === 'opened') {
          this.paintTiles()
        }
      }),
    )
    // The cursor is the governor's own parity: 0.5Hz against a 1Hz refresh is every
    // other delivered frame, so the two rates §8 states produce the blink between
    // them rather than needing a third number.
    this.teardowns.push(
      api.budget.subscribe((t: FrameTick) => {
        const on = t.index % 2 === 0
        if (on === this.caretOn) return
        this.caretOn = on
        this.caret.dataset['ledgerCaret'] = on ? 'on' : 'off'
      }),
    )

    this.steward = new Steward(api, clock)
    this.teardowns.push(() => this.steward?.destroy())

    this.paint()
    this.paintTiles()
    this.placeCaret()
  }

  destroy(): void {
    for (let i = this.teardowns.length - 1; i >= 0; i--) this.teardowns[i]?.()
    this.teardowns.length = 0
  }

  private paint(): void {
    const c = this.clock.sessionCost(this.cost)
    const j = formatJoules(c.joules)
    const m = formatCalls(c.modelCalls)
    const t = formatElapsed(c.elapsedMs)
    const mark = j.rounded ? ' +' : ''
    const text = `${j.value} ${j.unit}${mark}  ${m.value} ${m.unit}  ${t.value} ${t.unit}`
    if (text === this.lastTotal) return
    this.lastTotal = text
    this.total.textContent = text
  }

  /**
   * One tile per minimized window.
   *
   * A minimized window has to stay reachable, and this era hides its frame outright —
   * `minimizeStyle: 'shrink'`. There is deliberately **no `minimizeTarget`**: a target
   * rect exists so a skin can animate toward it, and this era's minimize is a cut, so
   * there is nothing to aim. Declaring one would be furniture.
   */
  private paintTiles(): void {
    const wm = this.api.wm
    this.tiles.replaceChildren()
    for (const s of wm.list()) {
      if (!wm.isOffScreen(s)) continue
      const tile = document.createElement('button')
      tile.type = 'button'
      tile.className = 'lg-tile'
      tile.dataset['ledgerTile'] = String(s.id)
      tile.textContent = s.title
      tile.setAttribute('aria-label', `Restore ${s.title}`)
      tile.addEventListener('click', () => wm.focus(s.id))
      this.tiles.appendChild(tile)
    }
  }

  /**
   * The caret's x position, measured on input rather than on every frame.
   *
   * A canvas text measurement is cheap but it is not free, and during a burst this
   * surface repaints at the display's rate. The value only changes when the field
   * does, so it is computed there and the frame tick only flips a boolean.
   */
  private placeCaret(): void {
    const cs = getComputedStyle(this.field)
    const ctx = measureContext()
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
    const w = ctx.measureText(this.field.value).width
    this.caret.style.setProperty('--lg-caret-x', `${Math.round(w)}px`)
  }

  private submit(): void {
    const text = this.field.value.trim()
    if (text.length === 0) return
    this.field.value = ''
    this.placeCaret()
    // The bar knows the shell's command vocabulary and nothing about the filesystem,
    // so opening an entry is the same semantic command the keymap binds. What the
    // entry number resolves to is the codec's business, and phase 5's.
    void this.api.commands.run('shell.newWindow')
  }
}

let sharedMeasure: CanvasRenderingContext2D | null = null
function measureContext(): CanvasRenderingContext2D {
  if (!sharedMeasure) {
    sharedMeasure = document.createElement('canvas').getContext('2d')!
  }
  return sharedMeasure
}

/**
 * The Steward.
 *
 * §8: "a budget assistant that interrupts to propose closing your work and phrases it
 * as a favour. *'You haven't touched Untitled 3 in 20 minutes. Shall I settle it?'* It
 * can be deferred but not disabled, and the defer control is deliberately the smallest
 * target on screen."
 *
 * It opens as a modal owned by the window it is proposing to close, which is the exact
 * relationship: it is not a system alert, it is an interruption *about* that window,
 * and blocking that window while it asks is what makes the proposal feel like a
 * demand. The window manager's own modal machinery does all of it.
 */
class Steward {
  private readonly api: ShellRegionHost
  private readonly clock: LedgerClock
  private readonly teardowns: Array<() => void> = []
  private timer = 0
  private open: WindowId | null = null
  private deferredUntil = 0

  constructor(api: ShellRegionHost, clock: LedgerClock) {
    this.api = api
    this.clock = clock
    // Checked on the governor's own clock rather than on a private interval: an era
    // that rations wakeups must not run a second timer beside the one it rations.
    this.teardowns.push(clock.watch(() => this.check()))
    this.teardowns.push(
      api.wm.subscribe((e) => {
        if (e.type === 'closed' && e.id === this.open) this.open = null
      }),
    )
  }

  destroy(): void {
    for (let i = this.teardowns.length - 1; i >= 0; i--) this.teardowns[i]?.()
    this.teardowns.length = 0
    if (this.timer !== 0) clearTimeout(this.timer)
  }

  private check(): void {
    if (this.open !== null) return
    if (performance.now() < this.deferredUntil) return
    const wm = this.api.wm
    const threshold = STEWARD.idleMinutes * 60_000
    for (const s of wm.list()) {
      if (s.modalOwner !== null || wm.isOffScreen(s)) continue
      if (this.clock.unfocusedFor(s.id) < threshold) continue
      this.propose(s.id, s.title)
      return
    }
  }

  private propose(target: WindowId, title: string): void {
    const wm = this.api.wm
    const owner = wm.get(target)
    if (!owner) return
    const id = wm.open({
      appId: asAppId('ledger-steward'),
      title: 'Steward',
      modalOwner: target,
      resizable: false,
      closable: false,
      rect: {
        x: owner.rect.x + SHELL.controlPad,
        y: owner.rect.y + SHELL.barHeight,
        w: SHELL.stewardSize.w,
        h: SHELL.stewardSize.h,
      },
    })
    this.open = id
    const handle = wm.handleOf(id)
    if (!handle) return

    const body = document.createElement('div')
    body.className = 'lg-steward'
    body.dataset['ledgerSteward'] = ''

    const text = document.createElement('p')
    text.className = 'lg-steward-text'
    // §8's own line, with the window's title in it.
    text.textContent =
      `You haven’t touched ${title} in ${STEWARD.idleMinutes} minutes. Shall I settle it?`
    body.appendChild(text)

    const row = document.createElement('div')
    row.className = 'lg-steward-row'

    const settle = document.createElement('button')
    settle.type = 'button'
    settle.className = 'lg-btn-primary'
    settle.dataset['ledgerSettle'] = ''
    settle.textContent = 'Settle'
    settle.addEventListener('click', () => {
      void wm.close(id, { force: true })
      this.open = null
      void wm.close(target)
    })

    // The smallest target on screen, and a full keyboard path to it. Both halves are
    // required: §8 asks for the first, CLAUDE.md forbids the second being sacrificed
    // to it.
    const defer = document.createElement('button')
    defer.type = 'button'
    defer.className = 'lg-btn-defer'
    defer.dataset['ledgerDefer'] = ''
    defer.setAttribute('aria-label', 'Defer')
    defer.title = 'Defer'
    defer.addEventListener('click', () => this.defer(id))

    row.append(settle, defer)
    body.appendChild(row)
    handle.content.appendChild(body)

    // Escape defers. There is no close box — §8 says the Steward cannot be disabled —
    // so this is the keyboard equivalent of the 12px target, at full size.
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      this.defer(id)
    }
    handle.el.addEventListener('keydown', onKey)
    this.teardowns.push(() => handle.el.removeEventListener('keydown', onKey))
    settle.focus()
  }

  private defer(id: WindowId): void {
    this.deferredUntil = performance.now() + STEWARD.deferMinutes * 60_000
    this.open = null
    void this.api.wm.close(id, { force: true })
  }
}

/**
 * The suspension policy.
 *
 * §8's generational deletion, as about thirty lines of skin code and no core change:
 * a window that loses focus is suspended ~400ms later, and focusing it resumes it.
 * The window manager owns `WindowState.suspended` and emits the events; the shell
 * routes those to an app instance; this decides *when*. Three layers, none of which
 * knows about the other two's reasons.
 */
class SuspensionPolicy {
  private readonly api: ShellRegionHost
  private readonly timers = new Map<WindowId, number>()
  private readonly un: () => void

  constructor(api: ShellRegionHost) {
    this.api = api
    this.un = api.wm.subscribe((e) => {
      switch (e.type) {
        case 'focused':
          this.cancel(e.id)
          api.wm.resume(e.id)
          return
        case 'blurred':
          this.arm(e.id)
          return
        case 'opened':
          // A window opens focused, so nothing to arm — but a window that opens
          // behind a modal never gets a blur, and would otherwise never suspend.
          if (api.wm.focusedId() !== e.id) this.arm(e.id)
          return
        case 'closed':
          this.cancel(e.id)
          return
        default:
          return
      }
    })
  }

  destroy(): void {
    this.un()
    for (const t of this.timers.values()) clearTimeout(t)
    this.timers.clear()
  }

  private arm(id: WindowId): void {
    this.cancel(id)
    const t = window.setTimeout(() => {
      this.timers.delete(id)
      if (this.api.wm.focusedId() === id) return
      this.api.wm.suspend(id)
    }, SUSPEND_AFTER_MS)
    this.timers.set(id, t)
  }

  private cancel(id: WindowId): void {
    const t = this.timers.get(id)
    if (t !== undefined) {
      clearTimeout(t)
      this.timers.delete(id)
    }
  }
}

/**
 * The refresh band.
 *
 * §8: "The screen refreshes at 1Hz while you read, in a visible horizontal band like
 * e-ink ... The band honours **`prefers-reduced-motion`** — a media query, not a
 * setting. Under reduced motion the refresh band does not sweep; the surface updates
 * without the travelling seam."
 *
 * **It stops when the query flips, rather than merely starting suppressed.** That is
 * why this uses `onReducedMotionChange` and not `prefersReducedMotion()` alone: the
 * band is a running subscription, and a point-in-time read at construction would keep
 * a band travelling across the screen of someone who asked it to stop while it was
 * already moving. `core/motion.ts`'s own comment names this era as the reason the
 * subscription exists.
 */
class RefreshBand {
  private readonly el: HTMLElement
  private readonly api: ShellRegionHost
  private unsubscribeTick: (() => void) | null = null
  private readonly unsubscribeMotion: () => void
  private step = 0

  constructor(host: HTMLElement, api: ShellRegionHost) {
    this.el = host
    this.api = api
    host.className = 'lg-band'
    host.dataset['ledgerBand'] = 'stopped'
    host.setAttribute('aria-hidden', 'true')

    this.unsubscribeMotion = onReducedMotionChange((reduced) => this.setReduced(reduced))
    this.setReduced(prefersReducedMotion())
  }

  destroy(): void {
    this.unsubscribeMotion()
    this.stop()
  }

  private setReduced(reduced: boolean): void {
    if (reduced) this.stop()
    else this.start()
  }

  private start(): void {
    if (this.unsubscribeTick) return
    this.el.dataset['ledgerBand'] = 'running'
    // One step per delivered frame. At the era's 1Hz that is a band that jumps once a
    // second — which is what a panel doing partial refreshes looks like — and under a
    // burst it moves every frame and reads as a fast sweep. §8's "burst mode looks and
    // behaves differently", from one mechanism rather than two.
    this.unsubscribeTick = this.api.budget.subscribe(() => {
      const height = this.el.parentElement?.clientHeight ?? 0
      const steps = Math.max(1, Math.ceil(height / REFRESH.bandHeight))
      this.step = (this.step + 1) % steps
      this.el.style.transform = `translate3d(0, ${this.step * REFRESH.bandHeight}px, 0)`
    })
  }

  private stop(): void {
    this.unsubscribeTick?.()
    this.unsubscribeTick = null
    this.el.dataset['ledgerBand'] = 'stopped'
    this.el.style.transform = ''
  }
}

/** The era's menus, carried on the budget bar. */
function budgetMenu(api: ShellRegionHost): MenuSpec {
  const wm = api.wm
  const id = wm.focusedId()
  const s = id !== null ? wm.get(id) : undefined
  return [
    {
      kind: 'item',
      label: 'New entry',
      command: 'shell.newWindow',
      ...accelFrom(api, 'shell.newWindow'),
      enabled: true,
      onActivate: () => void api.commands.run('shell.newWindow'),
    },
    {
      kind: 'item',
      label: 'Settle entry',
      command: 'window.close',
      ...accelFrom(api, 'window.close'),
      enabled: s !== undefined && s.closable,
      onActivate: () => void api.commands.run('window.close'),
    },
    { kind: 'separator' },
    {
      kind: 'item',
      label: 'Suspend entry',
      command: 'window.minimize',
      ...accelFrom(api, 'window.minimize'),
      enabled: s !== undefined && !s.minimized,
      onActivate: () => void api.commands.run('window.minimize'),
    },
    /*
     * Disabled, and carrying no accelerator.
     *
     * §8 makes the gutter a regulatory disclosure that "cannot be hidden — it is a
     * regulatory disclosure, not a preference". Listing it as an item that is always
     * unavailable is how a bureaucratic system says so: the command exists in the
     * menu, permanently refused. This is the era's counterpart to System 1's disabled
     * Edit menu — an item that promises nothing may say what it would have done.
     */
    { kind: 'item', label: 'Hide cost gutter', enabled: false },
  ]
}

export function ledgerRegions(clock: LedgerClock): readonly ShellRegion[] {
  return [
    {
      edge: 'bottom',
      kind: 'budgetbar',
      thickness: SHELL.barHeight,
      reservesSpace: true,
      mount(host, api) {
        clock.attach(api.budget)
        const bar = new BudgetBar(host, api, clock)
        const policy = new SuspensionPolicy(api)
        // The bar's own context menu, so the era's commands have a pointer route as
        // well as the chords the keymap binds.
        const onContext = (e: MouseEvent): void => {
          e.preventDefault()
          e.stopPropagation()
          api.openMenu(budgetMenu(api), e.clientX, e.clientY)
        }
        host.addEventListener('contextmenu', onContext)
        return () => {
          host.removeEventListener('contextmenu', onContext)
          policy.destroy()
          bar.destroy()
        }
      },
    },
    {
      edge: 'top',
      kind: 'refreshband',
      thickness: REFRESH.bandHeight,
      /**
       * The one region in Chronos that claims no space.
       *
       * A refresh band is not chrome the work area has to avoid — it paints over the
       * screen and moves on. `reservesSpace: false` is what says so, and it is why the
       * flag exists on `ShellRegion` at all rather than every region reserving by
       * definition.
       */
      reservesSpace: false,
      mount(host, api) {
        const band = new RefreshBand(host, api)
        return () => band.destroy()
      },
    },
  ]
}
