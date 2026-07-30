/**
 * The Windows XP Luna skin manifest.
 *
 * Phase 3's reference implementation. Everything the other five eras will be
 * measured against is here, and it is built to the measured 1:1 figure rather than
 * to XP.css wherever the two disagree.
 *
 * The generated custom properties are the important mechanism: the caption
 * gradients and the frame steps are written from the arrays in `metrics.ts`, so a
 * measurement and the pixels on screen cannot drift apart. There is no second copy
 * of those numbers in the stylesheet.
 */

import { Keymap, type Binding } from '../../core/input/keymap.js'
import { XpChrome } from './chrome.js'
import { XpMenuRenderer } from './menu.js'
import { XP_LUNA, XP_METRICS, XP_PROVENANCE } from './metrics.js'
import './skin.css'

/**
 * A hard-stop gradient with one stop per measured row.
 *
 * Luna's caption is 30 rows of measured colour, not a smooth ramp between two
 * endpoints — it has a highlight near the top and a second brightening lower down.
 * Interpolating between endpoints would lose both. Each row gets an exact 1px band.
 */
function rowGradient(rows: readonly string[]): string {
  const stops: string[] = []
  for (let i = 0; i < rows.length; i++) {
    stops.push(`${rows[i]} ${i}px`, `${rows[i]} ${i + 1}px`)
  }
  return `linear-gradient(180deg, ${stops.join(', ')})`
}

/**
 * The 4px frame as stacked 1px inset shadows.
 *
 * Four steps per side, outermost first, with the bottom carrying its own measured
 * colours. A CSS gradient border cannot express discrete steps, and a 4px solid
 * border cannot express four different colours, so inset shadows are the only
 * construction that reproduces what the figure shows.
 */
function frameShadows(): string {
  const side = XP_LUNA.frameSide
  const bottom = XP_LUNA.frameBottom
  const parts: string[] = []
  for (let i = 0; i < side.length; i++) {
    const n = i + 1
    // Left, right and top edges of this step.
    parts.push(`inset ${n}px 0 0 0 ${side[i]}`)
    parts.push(`inset -${n}px 0 0 0 ${side[i]}`)
  }
  for (let i = 0; i < bottom.length; i++) {
    parts.push(`inset 0 -${i + 1}px 0 0 ${bottom[i]}`)
  }
  return parts.join(', ')
}

/**
 * The four caption-button state faces, per category, as generated properties.
 *
 * Named `--xp-gen-capbtn-<category>-<state>` so the stylesheet's five state rules
 * read a measured gradient each instead of applying a brightness filter to the rest
 * state. `filter: brightness()` cannot produce what the specimens show: hover lifts
 * the close button's red toward white while pressed both darkens *and* saturates it,
 * and disabled removes its hue altogether.
 */
function captionButtonFaces(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [category, states] of Object.entries(XP_LUNA.captionButtonFace)) {
    for (const [state, rows] of Object.entries(states)) {
      out[`--xp-gen-capbtn-${category}-${state}`] = rowGradient(rows)
    }
  }
  return out
}

/** Written onto the desktop element so the stylesheet can read the measurements. */
export function xpGeneratedProperties(): Record<string, string> {
  return {
    ...captionButtonFaces(),
    '--xp-gen-caption-active': rowGradient(XP_LUNA.captionActive),
    '--xp-gen-caption-inactive': rowGradient(XP_LUNA.captionInactive),
    '--xp-gen-frame': frameShadows(),
    '--xp-capbtn-size': `${XP_LUNA.captionButton.size}px`,
    '--xp-capbtn-gap': `${XP_LUNA.captionButton.gap}px`,
    '--xp-capbtn-right': `${XP_LUNA.captionButton.rightInset}px`,
    '--xp-capbtn-top': `${XP_LUNA.captionButton.topInset}px`,
    '--xp-capbtn-radius': `${XP_LUNA.captionButton.cornerRadius}px`,
    '--xp-capbtn-outline': XP_LUNA.captionButton.outline,
    '--xp-capbtn-outline-inactive': XP_LUNA.captionButton.outlineInactive,
  }
}

export const XP_KEYMAP: readonly Binding[] = [
  { chord: 'Alt+F4', command: 'window.close' },
  { chord: 'Ctrl+F4', command: 'window.close' },
  { chord: 'Alt+Tab', command: 'window.cycleNext' },
  { chord: 'Alt+Shift+Tab', command: 'window.cyclePrev' },
  { chord: 'Alt+F9', command: 'window.minimize' },
  { chord: 'Alt+F10', command: 'window.toggleMaximize' },
  { chord: 'Alt+F7', command: 'window.beginKeyboardMove' },
  { chord: 'Alt+F8', command: 'window.beginKeyboardResize' },
  { chord: 'Alt+Space', command: 'window.openChromeMenu' },
  { chord: 'Ctrl+N', command: 'shell.newWindow' },
  { chord: 'Escape', command: 'shell.closeTransient' },
]

// Every chord is parsed at load and checked against the key names a real
// KeyboardEvent can produce. A misspelled chord fails silently otherwise, and a
// dead keyboard path is a fidelity bug.
const unreachable = new Keymap(XP_KEYMAP).unknownKeys()
if (unreachable.length > 0) {
  throw new Error(`winxp keymap has unreachable chords: ${unreachable.join(', ')}`)
}

export const winxpSkin = {
  id: 'winxp',
  chrome: new XpChrome(),
  menu: new XpMenuRenderer(),
  metrics: XP_METRICS,
  provenance: XP_PROVENANCE,
  keymap: XP_KEYMAP,
  generatedProperties: xpGeneratedProperties,
} as const
