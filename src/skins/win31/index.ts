/**
 * The Windows 3.1 skin manifest.
 *
 * The second era, and the first test of whether the phase-3 contract holds against
 * something structurally different. Three things it does that XP does not, none of
 * which needed a core change:
 *
 * - **No close button.** 3.1 closes through the system menu, so the frame emits
 *   `data-action="menu"` and no `data-action="close"` element exists. The WM's
 *   `close()` path is reached from the menu and from Ctrl+F4 instead.
 * - **A fixed 640x480 viewport**, integer-scaled, because the era's chrome is 1px
 *   bitmaps and the disabled-text checkerboard is a 1-logical-pixel pattern. At a
 *   fractional scale the stipple aliases into the grey fill it exists to avoid.
 * - **Alt+F4 is not the close chord.** 3.1 used Alt+F4 to exit *Windows itself*;
 *   Ctrl+F4 closed a document window and Alt+F4 closed an application. Both are
 *   bound, to the same semantic command, because Chronos has no "exit Windows".
 */

import { Keymap, type Binding } from '../../core/input/keymap.js'
import { Win31Chrome } from './chrome.js'
import { Win31MenuRenderer } from './menu.js'
import { WIN31, WIN31_METRICS, WIN31_PROVENANCE } from './metrics.js'
import './skin.css'

/** Written onto the desktop element so the stylesheet reads the measurements. */
export function win31GeneratedProperties(): Record<string, string> {
  return {
    '--w31-window': WIN31.palette.window,
    '--w31-face': WIN31.palette.face,
    '--w31-ink': WIN31.palette.ink,
    '--w31-shadow': WIN31.palette.shadow,
    '--w31-caption-active': WIN31.palette.captionActive,
    '--w31-caption-inactive': WIN31.palette.captionInactive,
    '--w31-caption-text-active': WIN31.palette.captionTextActive,
    '--w31-caption-text-inactive': WIN31.palette.captionTextInactive,
    '--w31-caption-h': `${WIN31_METRICS.titleBarHeight}px`,
    '--w31-menu-item-h': `${WIN31.menu.itemHeight}px`,
    '--w31-menu-sep-h': `${WIN31.menu.separatorHeight}px`,
    '--w31-menu-gutter': `${WIN31.menu.labelGutter}px`,
    '--w31-menu-accel': `${WIN31.menu.accelGutter}px`,
    '--w31-btn-w': `${WIN31.button.width}px`,
    '--w31-btn-h': `${WIN31.button.height}px`,
    '--w31-check': `${WIN31.checkSize}px`,
    /* The stipple cell, in logical pixels. Doubling it is the mask tile size. */
    '--w31-stipple': `${WIN31.disabledText.cell * 2}px`,
  }
}

export const WIN31_KEYMAP: readonly Binding[] = [
  // Ctrl+F4 closed a document window; Alt+F4 closed the application. Chronos has
  // no "exit Windows", so both reach the same command.
  { chord: 'Ctrl+F4', command: 'window.close' },
  { chord: 'Alt+F4', command: 'window.close' },
  { chord: 'Alt+Tab', command: 'window.cycleNext' },
  { chord: 'Alt+Shift+Tab', command: 'window.cyclePrev' },
  // 3.1's system menu accelerators, which is where minimize and maximize lived.
  { chord: 'Alt+F9', command: 'window.minimize' },
  { chord: 'Alt+F10', command: 'window.toggleMaximize' },
  { chord: 'Alt+F7', command: 'window.beginKeyboardMove' },
  { chord: 'Alt+F8', command: 'window.beginKeyboardResize' },
  // Alt+Space opened the system menu of a top-level window; Alt+Hyphen opened an
  // MDI child's. Both are real 3.1 chords and both reach the chrome menu.
  { chord: 'Alt+Space', command: 'window.openChromeMenu' },
  { chord: 'Alt+-', command: 'window.openChromeMenu' },
  { chord: 'Ctrl+N', command: 'shell.newWindow' },
  { chord: 'Escape', command: 'shell.closeTransient' },
]

// Parsed at load and checked against the key names a real KeyboardEvent can
// produce. A misspelled chord fails silently otherwise, and a dead keyboard path
// is a fidelity bug — this is how Alt+Space was caught in phase 2.
const unreachable = new Keymap(WIN31_KEYMAP).unknownKeys()
if (unreachable.length > 0) {
  throw new Error(`win31 keymap has unreachable chords: ${unreachable.join(', ')}`)
}

export const win31Skin = {
  id: 'win31',
  chrome: new Win31Chrome(),
  menu: new Win31MenuRenderer(),
  metrics: WIN31_METRICS,
  provenance: WIN31_PROVENANCE,
  keymap: WIN31_KEYMAP,
  generatedProperties: win31GeneratedProperties,
  /** VGA. Integer-scaled, so the 1px stipple survives. */
  viewport: { mode: 'fixed' as const, logical: { w: 640, h: 480 } },
} as const
