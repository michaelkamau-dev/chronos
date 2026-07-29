/**
 * The `plain` skin manifest.
 *
 * Phase 1's "one era, unstyled boxes". It is not an era — it is the neutral
 * harness that proves the Skin contract is sufficient before any fidelity work
 * begins. It exports the same shape an era skin must: chrome, metrics,
 * provenance and a keymap.
 *
 * The keymap is the important part. Even the harness expresses its bindings as
 * chord-to-semantic-command data rather than as code, so the dispatcher never
 * learns which chord belongs to which era.
 */

import { Keymap, type Binding } from '../../core/input/keymap.js'
import { PlainChrome } from './chrome.js'
import { PlainMenuRenderer } from './menu.js'
import { PLAIN_METRICS, PLAIN_PROVENANCE } from './metrics.js'
import './skin.css'

export const PLAIN_KEYMAP: readonly Binding[] = [
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

/**
 * Every chord in this table is parsed at module load and checked against the set
 * of key names a real KeyboardEvent can produce. A misspelled chord — `Alt+Space`
 * written expecting `key === 'space'` when the space bar actually reports `' '` —
 * fails silently otherwise, and a dead keyboard path is a fidelity bug.
 */
const unknown = new Keymap(PLAIN_KEYMAP).unknownKeys()
if (unknown.length > 0) {
  throw new Error(`plain skin keymap has unreachable chords: ${unknown.join(', ')}`)
}

export const plainSkin = {
  id: 'plain',
  chrome: new PlainChrome(),
  menu: new PlainMenuRenderer(),
  metrics: PLAIN_METRICS,
  provenance: PLAIN_PROVENANCE,
  keymap: PLAIN_KEYMAP,
} as const
