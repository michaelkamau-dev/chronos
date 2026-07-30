/**
 * The Mac OS 8 Platinum skin manifest.
 *
 * The fourth era, and the first to exercise three things the contract had carried
 * without ever being asked to perform them:
 *
 * - **`minimizeStyle: 'collapse'`.** A windowshade hides the content region and leaves
 *   the title bar visible and active. The window manager had been written for the two
 *   styles that existed and hid the frame, moved focus off it and re-expanded it on
 *   focus — all correct for `shrink` and `genie`, all wrong here. Fixed in core.
 * - **`data-action="collapse"`.** The vocabulary listed it; the dispatcher routed it to
 *   `toggleMaximize` because no era had used it. A collapse box is a windowshade
 *   toggle, and on this title bar it sits next to a zoom box that *is* the maximize
 *   slot — two boxes, two behaviours.
 * - **`maximizeSemantics: 'zoom'`.** Declared by Tiger, and this era's zoom box is the
 *   same gesture: toggle to the content's natural size rather than fill the screen.
 *
 * The generated properties are the whole reason this file is longer than a manifest
 * needs to be. Every number in `skin.css` arrives from `./metrics.ts` through here, so
 * a measurement exists once in the tree — which is exactly what the two Windows skins
 * broke by *also* declaring their variables in a `:root` block.
 */

import { Keymap, type Binding } from '../../core/input/keymap.js'
import { Macos8Chrome } from './chrome.js'
import { Macos8MenuRenderer } from './menu.js'
import { macos8Regions } from './shell.js'
import { MACOS8, MACOS8_METRICS, MACOS8_PROVENANCE } from './metrics.js'
import './skin.css'

/**
 * Written onto the **shell root**, not the desktop.
 *
 * Custom properties inherit, and menus, the switcher and every overlay are hosted on
 * the root — outside the desktop element. Setting them on the desktop leaves every
 * overlay with undefined variables, and the failure is silent and total: no background,
 * no border colour, the browser's default serif. The shell handles the placement; this
 * only has to supply the values.
 */
export function macos8GeneratedProperties(): Record<string, string> {
  const ramp = MACOS8.box.interior
  return {
    /* palette */
    '--m8-white': MACOS8.palette.white,
    '--m8-ink': MACOS8.palette.ink,
    '--m8-title-face': MACOS8.palette.titleFace,
    '--m8-menu-face': MACOS8.palette.menuFace,
    '--m8-shadow': MACOS8.palette.shadow,
    '--m8-dim': MACOS8.palette.dim,
    '--m8-stripe-hi': MACOS8.stripes.highlight,
    '--m8-stripe-lo': MACOS8.stripes.shadow,
    '--m8-inactive-ink': MACOS8.palette.inactiveInk,
    '--m8-inactive-face': MACOS8.palette.inactiveFace,
    '--m8-inactive-text': MACOS8.palette.inactiveText,
    '--m8-box-body': MACOS8.palette.boxBody,
    /* Flat, and unverified: no extracted figure shows the desktop. See skin.css. */
    '--m8-desktop': MACOS8.palette.menuFace,

    /* frame */
    '--m8-frame': `${MACOS8_METRICS.border.left}px`,
    '--m8-frame-line': '1px',
    '--m8-shadow-w': `${MACOS8_METRICS.shadowInsets.bottom}px`,
    /* Both free ends of the shadow are pulled in by this much. */
    '--m8-shadow-notch': `${MACOS8.shadowNotch}px`,
    '--m8-shadow-colour': MACOS8.palette.ink,

    /* title bar */
    '--m8-title-h': `${MACOS8_METRICS.titleBarHeight}px`,
    '--m8-title-clear': `${MACOS8.stripes.textClearance}px`,
    /* The stripe field's phase and extent, so the pattern starts on the measured row
     * rather than wherever a repeat happens to land. */
    '--m8-stripe-top': `${MACOS8.stripes.firstRow}px`,
    '--m8-stripe-band': `${MACOS8.stripes.count * 2}px`,

    /* boxes */
    '--m8-box': `${MACOS8.box.size - 2}px`,
    '--m8-box-gap': `${MACOS8.box.gap}px`,
    '--m8-box-edge': `${MACOS8.box.edgeInset - 1}px`,
    /* The body's top, one further in than the footprint's measured 3px inset. */
    '--m8-box-top': `${MACOS8.box.topInset + 1}px`,
    '--m8-box-chisel-dark': MACOS8.box.chiselDark,
    '--m8-box-chisel-light': MACOS8.box.chiselLight,
    '--m8-box-inner-dark': MACOS8.box.innerBevelDark,
    '--m8-box-inner-light': MACOS8.box.innerBevelLight,
    '--m8-glyph-inset': `${(MACOS8.box.body - MACOS8.box.core) / 2 + 1}px`,
    '--m8-ramp-1': ramp[0] ?? MACOS8.palette.shadow,
    '--m8-ramp-2': ramp[1] ?? MACOS8.palette.shadow,
    '--m8-ramp-3': ramp[2] ?? MACOS8.palette.shadow,
    '--m8-ramp-4': ramp[3] ?? MACOS8.palette.shadow,
    '--m8-ramp-5': ramp[4] ?? MACOS8.palette.shadow,
    '--m8-ramp-6': ramp[5] ?? MACOS8.palette.shadow,
    '--m8-ramp-7': ramp[6] ?? MACOS8.palette.white,

    /* size box and resize */
    '--m8-sizebox': `${MACOS8.sizeBox.size}px`,
    '--m8-resize-grab': `${MACOS8_METRICS.resizeGrab}px`,

    /* menu bar and menus */
    '--m8-menubar-h': `${MACOS8.menuBar.height}px`,
    '--m8-menubar-gap': `${MACOS8.menu.barTitleGap}px`,
    '--m8-menubar-inset': `${MACOS8.menu.barTitleGap}px`,
    '--m8-menu-item-h': `${MACOS8.menu.itemHeight}px`,
    '--m8-menu-sep-h': `${MACOS8.menu.separatorHeight}px`,
    '--m8-menu-sep-off': `${MACOS8.menu.separatorRuleOffset}px`,
    '--m8-menu-sep-rule': MACOS8.menu.separatorRule,
    '--m8-menu-sep-engrave': MACOS8.menu.separatorEngrave,
    '--m8-menu-text-inset': `${MACOS8.menu.textInset}px`,
    '--m8-menu-pad': `${MACOS8.menu.textInset / 2}px`,
    '--m8-menu-accel-gap': `${MACOS8.menu.textInset}px`,
    '--m8-menu-shadow-w': `${MACOS8.menu.shadow}px`,
    '--m8-menu-shadow': MACOS8.menu.shadowColor,
    '--m8-menu-title-hi': MACOS8.menu.titleHighlight,
    '--m8-menu-title-hi-top': MACOS8.menu.titleHighlightTop,
    '--m8-menu-title-hi-bottom': MACOS8.menu.titleHighlightBottom,
    '--m8-menu-title-hi-text': MACOS8.menu.titleHighlightText,

    /* accent — a user variable, not a constant. Lavender is the documented default. */
    '--m8-accent-highlight': MACOS8.accent.lavender.highlight,
    '--m8-accent-face': MACOS8.accent.lavender.face,
    '--m8-accent-grip': MACOS8.accent.lavender.grip,
    '--m8-accent-shadow': MACOS8.accent.lavender.shadow,
    /* The focus ring takes the accent too (p66), which is why it is not a literal. */
    '--m8-focus': MACOS8.accent.lavender.face,
    '--m8-focus-w': '2px',

    /* type */
    '--m8-font': MACOS8.font.family,
    '--m8-font-size': `${MACOS8.font.size}px`,
    '--m8-line-box': `${MACOS8.font.lineBox}px`,
  }
}

/**
 * Mac OS 8's chords.
 *
 * Command rather than Alt, which is the point of keymaps being data: `Meta+W` and
 * `Alt+F4` reach the identical `window.close` path with no era conditional anywhere.
 *
 * `Meta+M` is the era's own collapse chord and it reaches `window.minimize`, which for
 * this era's `minimizeStyle` *is* the windowshade — so the menu item, the collapse box
 * and the chord are provably the same action.
 */
export const MACOS8_KEYMAP: readonly Binding[] = [
  { chord: 'Meta+W', command: 'window.close' },
  { chord: 'Meta+M', command: 'window.minimize' },
  { chord: 'Meta+N', command: 'shell.newWindow' },
  // Mac OS 8 had no application switcher chord — MultiFinder cycling was Cmd+Tab only
  // from 8.5 — so Cmd+` drives the window cycle, which is the closest real chord.
  { chord: 'Meta+`', command: 'window.cycleNext' },
  { chord: 'Meta+Shift+`', command: 'window.cyclePrev' },
  { chord: 'Meta+Tab', command: 'window.cycleNext' },
  { chord: 'Meta+Shift+Tab', command: 'window.cyclePrev' },
  // No classic-Mac chord exists for keyboard move and resize — the OS had no such mode
  // — but CLAUDE.md requires every mouse interaction to have a keyboard path, so they
  // take Control-modified chords that collide with nothing in the era.
  { chord: 'Control+Meta+M', command: 'window.beginKeyboardMove' },
  { chord: 'Control+Meta+R', command: 'window.beginKeyboardResize' },
  // The classic Mac had no title-bar chrome menu; the menu bar is its equivalent.
  { chord: 'Control+F2', command: 'window.openChromeMenu' },
  { chord: 'Escape', command: 'shell.closeTransient' },
]

// Parsed at load and checked against the key names a real KeyboardEvent can produce.
// A misspelled chord fails silently otherwise, and a dead keyboard path is a fidelity
// bug — this is how Alt+Space was caught in phase 2.
const unreachable = new Keymap(MACOS8_KEYMAP).unknownKeys()
if (unreachable.length > 0) {
  throw new Error(`macos8 keymap has unreachable chords: ${unreachable.join(', ')}`)
}

export const macos8Skin = {
  id: 'macos8',
  chrome: new Macos8Chrome(),
  menu: new Macos8MenuRenderer(),
  metrics: MACOS8_METRICS,
  provenance: MACOS8_PROVENANCE,
  keymap: MACOS8_KEYMAP,
  regions: macos8Regions(),
  generatedProperties: macos8GeneratedProperties,
  /**
   * Native 1:1.
   *
   * Mac OS 8 shipped on colour displays at whatever resolution the monitor offered,
   * and its chrome is 1px lines rather than a dither that a fractional scale would
   * average away — so unlike System 1 and Windows 3.1 there is no fixed logical
   * resolution to preserve. The one 1px pattern that *is* load-bearing, the racing
   * stripes, is drawn at integer offsets and survives 1:1 rendering intact.
   */
  viewport: { mode: 'native' as const },
} as const
