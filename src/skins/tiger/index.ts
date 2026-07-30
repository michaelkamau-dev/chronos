/**
 * The Mac OS X Tiger skin manifest.
 *
 * The third era, and the first to need anything of core that phase 3 did not already
 * provide. Both additions are era-neutral and both were anticipated by the
 * architecture rather than invented here:
 *
 * - **Shell regions** (§5's `ShellLayout`). Tiger's shell is a menu bar plus a Dock,
 *   both reserving space. The window manager learns only that the work area is 22px
 *   shorter at the top and 68px at the bottom — never that either exists.
 * - **A minimize-target provider** (§2's "XP shrinks toward the taskbar button, Tiger
 *   genies to the Dock"). Only the Dock knows where a given window's tile ended up, so
 *   the WM asks rather than guessing at the work area's corner.
 *
 * Four things this era does that neither Windows era did, none of which needed a
 * contract change:
 *
 * - **Buttons on the left**, and the third one is *zoom* rather than maximize. It sits
 *   in the WM's `maximize` slot because that vocabulary names the slot; the behaviour
 *   comes from `metrics.maximizeSemantics: 'zoom'`, which the WM already implemented
 *   for the classic Mac eras and which nothing had exercised until now.
 * - **A global menu bar** rather than a menu bar inside each window. Same `MenuSpec`,
 *   different placement — §4's "one spec, six placements".
 * - **Modal dialogs with no title bar buttons at all**, which Apple requires (HIG
 *   p174) and which is the same structural move Windows 3.1 makes by emitting no close
 *   button.
 * - **Antialiased type, at a native 1:1 viewport.** Tiger is the first era where soft
 *   text is correct rather than a defect, so it takes `mode: 'native'` and none of the
 *   pixel-crisp machinery the bitmap eras need.
 */

import { Keymap, type Binding } from '../../core/input/keymap.js'
import { TigerChrome } from './chrome.js'
import { TigerMenuRenderer } from './menu.js'
import { tigerRegions } from './shell.js'
import { TIGER, TIGER_METRICS, TIGER_PROVENANCE } from './metrics.js'
import './skin.css'

/**
 * Measured values carried into the stylesheet as custom properties.
 *
 * Every gradient is written as a full `linear-gradient` built from the measured
 * per-row list, because an Aqua gradient is not linear — the title bar has a bright
 * first row and a plateau, the menu bar has two highlights and a trough, and the
 * traffic lights brighten toward the bottom. Interpolating between two endpoints
 * would be visibly wrong and would also discard the measurement.
 */
function rowsToGradient(rows: readonly string[]): string {
  // One hard band per measured row: `to bottom, #a 0px, #a 1px, #b 1px, #b 2px, …`.
  // Hard stops rather than a smooth ramp so what ships is exactly what was measured,
  // one row per row, with no interpolation inventing values between them.
  const parts: string[] = []
  for (let i = 0; i < rows.length; i++) {
    parts.push(`${rows[i]} ${i}px`, `${rows[i]} ${i + 1}px`)
  }
  return `linear-gradient(to bottom, ${parts.join(', ')})`
}

function rowsToHorizontal(rows: readonly string[]): string {
  const parts: string[] = []
  for (let i = 0; i < rows.length; i++) {
    parts.push(`${rows[i]} ${i}px`, `${rows[i]} ${i + 1}px`)
  }
  return `linear-gradient(to right, ${parts.join(', ')})`
}

/** A 4px-period horizontal pinstripe from two measured greys. */
function pinstripe(p: { a: string; b: string; period: number }): string {
  const half = p.period / 2
  return (
    `repeating-linear-gradient(to bottom, ${p.a} 0px, ${p.a} ${half}px, ` +
    `${p.b} ${half}px, ${p.b} ${p.period}px)`
  )
}

export function tigerGeneratedProperties(): Record<string, string> {
  const L = TIGER.lights
  return {
    /* ---- window frame ---- */
    '--tg-titlebar-h': `${TIGER_METRICS.titleBarHeight}px`,
    '--tg-titlebar': rowsToGradient(TIGER.titleBar.rows),
    '--tg-titlebar-line': TIGER.titleBar.frameLine,
    '--tg-titlebar-sep': TIGER.titleBar.separator,
    '--tg-titlebar-ink': TIGER.titleBar.ink,
    '--tg-titlebar-inactive': rowsToGradient(TIGER.titleBarInactive.rows),
    '--tg-titlebar-line-inactive': TIGER.titleBarInactive.frameLine,
    '--tg-titlebar-sep-inactive': TIGER.titleBarInactive.separator,
    '--tg-titlebar-ink-inactive': TIGER.titleBarInactive.ink,
    '--tg-corner': `${TIGER_METRICS.cornerTop.kind === 'radius' ? TIGER_METRICS.cornerTop.px : 0}px`,
    '--tg-frame': TIGER.titleBar.separator,
    /**
     * The hairline width, one value because every measured frame edge is 1px: the
     * left, right and bottom of the window, and the title bar's own top frame line.
     *
     * It exists as a property because the traffic lights' insets are measured from
     * the window's *outer* edge while the elements are positioned inside the frame,
     * so the CSS has to subtract it — and subtracting a literal `1px` there would
     * put a second copy of a measurement in the stylesheet.
     */
    '--tg-hairline': `${TIGER_METRICS.border.left}px`,
    '--tg-body': pinstripe(TIGER.bodyPinstripe),

    /* ---- traffic lights ---- */
    '--tg-light-d': `${L.diameter}px`,
    '--tg-light-pitch': `${L.pitch}px`,
    '--tg-light-inset-left': `${L.insetLeft}px`,
    '--tg-light-inset-top': `${L.insetTop}px`,
    '--tg-light-close': rowsToGradient(L.rows.close),
    '--tg-light-minimize': rowsToGradient(L.rows.minimize),
    '--tg-light-zoom': rowsToGradient(L.rows.zoom),
    '--tg-light-off': rowsToGradient(L.rows.disabled),
    '--tg-ring-close': L.ring.close,
    '--tg-ring-minimize': L.ring.minimize,
    '--tg-ring-zoom': L.ring.zoom,
    '--tg-ring-off': L.ring.disabled,

    /* ---- menu bar ---- */
    '--tg-menubar-h': `${TIGER.menuBar.height}px`,
    '--tg-menubar': rowsToGradient(TIGER.menuBar.rows),
    '--tg-menubar-rule': TIGER.menuBar.rule,
    '--tg-menubar-shadow': TIGER.menuBar.shadow,
    '--tg-menubar-pad': `${TIGER.menuBar.titlePadding}px`,
    '--tg-menubar-inset': `${TIGER.menuBar.firstTitleInset}px`,

    /* ---- menus ---- */
    '--tg-menu-bg': pinstripe(TIGER.menu.pinstripe),
    '--tg-menu-border': TIGER.menu.border,
    '--tg-menu-item-h': `${TIGER.menu.itemHeight}px`,
    '--tg-menu-sep-h': `${TIGER.menu.separatorHeight}px`,
    '--tg-menu-sep': TIGER.menu.separatorRule,
    '--tg-menu-hl': TIGER.menu.highlight,
    '--tg-menu-hl-ink': TIGER.menu.highlightText,
    '--tg-menu-ink': TIGER.menu.ink,
    '--tg-menu-off': TIGER.menu.disabledInk,
    '--tg-menu-gutter': `${TIGER.menu.labelGutter}px`,
    '--tg-menu-accel': `${TIGER.menu.accelGutter}px`,
    '--tg-menu-radius': `${TIGER.menu.radius}px`,

    /* ---- Dock ---- */
    '--tg-dock-h': `${TIGER.dock.height}px`,
    '--tg-dock-icon': `${TIGER.dock.iconSize}px`,
    '--tg-dock-fill': TIGER.dock.fill,
    '--tg-dock-edge': TIGER.dock.edge,
    '--tg-dock-divider': TIGER.dock.divider,
    '--tg-dock-gap': `${TIGER.dock.gap}px`,
    '--tg-dock-running': TIGER.dock.indicator,

    /* ---- shared ---- */
    '--tg-focus-0': TIGER.focusRing[0],
    '--tg-focus-1': TIGER.focusRing[1],
    '--tg-focus-2': TIGER.focusRing[2],
    '--tg-scroll-w': `${TIGER.scrollBar.width}px`,
    '--tg-scroll-track': rowsToHorizontal(TIGER.scrollBar.track),
    '--tg-scroll-thumb': rowsToHorizontal(TIGER.scrollBar.scroller),
    '--tg-font': TIGER.font.family,
    '--tg-font-system': `${TIGER.font.system}px`,
    '--tg-font-small': `${TIGER.font.small}px`,
    '--tg-font-mini': `${TIGER.font.mini}px`,
    '--tg-font-view': `${TIGER.font.view}px`,
    '--tg-font-label': `${TIGER.font.label}px`,
  }
}

/**
 * Tiger's chords.
 *
 * Command rather than Alt, which is the whole point of keymaps being data: `Meta+W`
 * and `Alt+F4` reach the identical `window.close` path with no era conditional in the
 * window manager.
 *
 * `Meta+M` for minimize and `Meta+Alt+H` for hide-others are real Mac OS X chords.
 * `Meta+Tab` is Mac's application switcher rather than a window switcher, and Chronos
 * has one application, so it drives the window cycle — a knowing simplification,
 * recorded rather than hidden.
 */
export const TIGER_KEYMAP: readonly Binding[] = [
  { chord: 'Meta+W', command: 'window.close' },
  { chord: 'Meta+M', command: 'window.minimize' },
  { chord: 'Meta+Tab', command: 'window.cycleNext' },
  { chord: 'Meta+Shift+Tab', command: 'window.cyclePrev' },
  { chord: 'Meta+N', command: 'shell.newWindow' },
  // Cmd+` cycles a single application's windows on Mac OS X, which is exactly what
  // Chronos's window cycle is.
  { chord: 'Meta+`', command: 'window.cycleNext' },
  { chord: 'Meta+Shift+`', command: 'window.cyclePrev' },
  // Keyboard move and resize have no Mac OS X chord — the OS had no such mode — but
  // `CLAUDE.md` requires every mouse interaction to have a keyboard path, so they get
  // Control-modified chords that collide with nothing in the era.
  { chord: 'Control+Meta+M', command: 'window.beginKeyboardMove' },
  { chord: 'Control+Meta+R', command: 'window.beginKeyboardResize' },
  // Mac OS X has no title-bar chrome menu; the Window menu in the menu bar is its
  // equivalent, and Control+F2 is the real "move focus to the menu bar" chord.
  { chord: 'Control+F2', command: 'window.openChromeMenu' },
  { chord: 'Escape', command: 'shell.closeTransient' },
]

// Parsed at load and checked against the key names a real KeyboardEvent can produce.
// A misspelled chord fails silently otherwise, and a dead keyboard path is a fidelity
// bug — this is how `Alt+Space` was caught in phase 2.
const unreachable = new Keymap(TIGER_KEYMAP).unknownKeys()
if (unreachable.length > 0) {
  throw new Error(`tiger keymap has unreachable chords: ${unreachable.join(', ')}`)
}

export const tigerSkin = {
  id: 'tiger',
  chrome: new TigerChrome(),
  menu: new TigerMenuRenderer(),
  metrics: TIGER_METRICS,
  provenance: TIGER_PROVENANCE,
  keymap: TIGER_KEYMAP,
  regions: tigerRegions(),
  generatedProperties: tigerGeneratedProperties,
  /**
   * Native 1:1. Tiger is the first era that does not want the integer-scaled
   * viewport: Apple documents that all interface text is antialiased, so there is no
   * pixel grid to preserve and nothing to gain from a fixed logical resolution.
   */
  viewport: { mode: 'native' as const },
} as const
