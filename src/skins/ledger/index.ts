/**
 * The Ledger skin manifest — 2035, and the only invented era in Chronos.
 *
 * ARCHITECTURE.md §8 is its source the way the Luna guidelines and the Macintosh HIG
 * are the others'. §13 calls it "the era most hostile to the contract", and it is the
 * honesty test: if a premise built to fight the other five drops into the same
 * `Skin` manifest, the abstraction was real rather than a description of what five
 * similar things had in common.
 *
 * It needed exactly the two additions §8 predicted — `AppInstance.suspend()/resume()`
 * and the render-budget governor — plus one that §8 did not: `authored` on
 * `ProvenanceLevel`, because a specification is a different kind of source from a
 * document or a bitmap and the existing four levels had nowhere to put it.
 *
 * Everything else went through the contract unchanged, and three of those are worth
 * naming because each looked at first like it would need a core change:
 *
 * - **The 40px cost gutter is `border.right`.** §8's "it makes every layout in the OS
 *   40px narrower than it wants to be" is enforced by `WindowManager.chromeExtra()`,
 *   which already subtracts the border from the content area.
 * - **The suspension policy is a skin timer** calling the era-neutral `wm.suspend`.
 * - **The Steward is `wm.open({ modalOwner })`** — a real modal window with real
 *   `inert` blocking, not a bespoke overlay layer.
 *
 * ### The viewport is native, and that is not the same reason Tiger's is
 *
 * Tiger declines the integer-scaled viewport because Apple documents its interface
 * text as anti-aliased, so pixel-crispness is not one of its requirements. Ledger's
 * type is anti-aliased too — it is a 2035 panel — but its *tone* is a one-pixel
 * ordered pattern, and a Bayer cell sampled at a fractional scale averages into
 * exactly the flat grey it exists to disprove. That is System 1's argument, and it is
 * satisfied here for free: `native` mode renders at scale 1, so every cell already
 * lands on a device pixel without a fixed logical resolution being imposed.
 */

import { Keymap, type Binding } from '../../core/input/keymap.js'
import { LedgerChrome } from './chrome.js'
import { LedgerClock } from './clock.js'
import { LedgerMenuRenderer } from './menu.js'
import { ledgerRegions } from './shell.js'
import { BLEACH_BANDS, CELL, ditherTile } from './dither.js'
import {
  FONT,
  GUTTER,
  INK,
  LEDGER_METRICS,
  LEDGER_PROVENANCE,
  REFRESH,
  SHELL,
} from './metrics.js'
import './skin.css'

/**
 * One clock, shared by the chrome and the shell.
 *
 * Constructed here rather than being a module singleton so the wiring is visible: the
 * window frames' gutters and the budget bar's total are two views of one ledger, and
 * two counters would eventually disagree about a number the era prints in both places.
 * The governor arrives later — the shell builds the chrome renderer before it mounts
 * regions — which is what `LedgerClock.attach` is for.
 */
const clock = new LedgerClock()

/**
 * Every measured value the stylesheet needs, written once on the shell root.
 *
 * On the root and not on `.desktop`: menus, the switcher and every overlay are hosted
 * there, outside the desktop element, and custom properties inherit downward only.
 * Writing them on the desktop leaves every overlay with undefined variables, which
 * fails silently and totally — Tiger's first menu rendered with no background, no
 * border colour and the browser's default serif at 16px.
 *
 * There is deliberately **no `:root` fallback block in skin.css**. A skin that also
 * declares its variables in CSS masks exactly this bug, and means every measured value
 * exists twice in the tree — which is what generating them was meant to prevent.
 */
export function ledgerGeneratedProperties(): Record<string, string> {
  const props: Record<string, string> = {
    '--lg-paper': INK.paper,
    '--lg-carbon': INK.carbon,
    '--lg-amber': INK.amber,

    '--lg-cell': `${CELL}px`,
    '--lg-rule': `${SHELL.rule}px`,

    '--lg-fs': `${FONT.size}px`,
    '--lg-fs-large': `${FONT.large}px`,
    '--lg-line': `${FONT.line}px`,
    '--lg-cap': `${FONT.capHeight}px`,

    '--lg-title-h': `${LEDGER_METRICS.titleBarHeight}px`,
    '--lg-frame': `${LEDGER_METRICS.border.bottom}px`,
    '--lg-gutter-w': `${GUTTER.width}px`,
    '--lg-gutter-entry-h': `${GUTTER.entryHeight}px`,
    '--lg-grab': `${LEDGER_METRICS.resizeGrab}px`,

    '--lg-bar-h': `${SHELL.barHeight}px`,
    '--lg-control-h': `${SHELL.controlHeight}px`,
    '--lg-control-pad': `${SHELL.controlPad}px`,
    '--lg-defer': `${SHELL.deferSize}px`,
    '--lg-band-h': `${REFRESH.bandHeight}px`,
  }

  /*
   * The dither tiles.
   *
   * Generated from the same `bayerMatrix` construction the face-selection tool and the
   * fidelity suite use, so the pattern in the stylesheet cannot drift from the pattern
   * the tests assert or the one the type was scored against. Three copies of a
   * sixteen-number grid would drift, and the copy that drifted would be the one nobody
   * looks at.
   */
  for (let i = 0; i < BLEACH_BANDS.length; i++) {
    const band = BLEACH_BANDS[i]!
    props[`--lg-tile-bleach-${i}`] = ditherTile(band.cell, band.level, INK.paper)
  }
  // Carbon tones for chrome fills: a pressed control, a gutter rule's ground, the
  // hover state. Ledger has no alpha, so these are the only greys it owns.
  for (const level of [4, 8, 12] as const) {
    props[`--lg-tile-ink-${level}`] = ditherTile(CELL, level, INK.carbon)
  }
  props['--lg-tile-amber-8'] = ditherTile(CELL, 8, INK.amber)

  return props
}

/**
 * Ledger's chords.
 *
 * 2035 inherits the PC lineage rather than the Macintosh one — there is no Command key
 * in this timeline — so the modifier is Control and the chords are the ones that
 * survived. Two are era-shaped rather than inherited:
 *
 * - **`Ctrl+M` is minimize**, and the menu calls it *Suspend entry*, because in an OS
 *   where an unfocused window is already frozen, putting one away is the one act that
 *   takes its cost to zero. The chord is on the verb the era cares about.
 * - **`F11` is maximize**, not a Windows-style `Super` chord: `maximizeSemantics` is
 *   `'fill'`, and F11 is the key that has meant "fill the screen" since before this
 *   project's first era shipped.
 *
 * `Escape` is bound as it is in every era, and here it does double duty — it dismisses
 * a menu, and it defers the Steward. §8 makes the Steward's defer control the smallest
 * target on screen; `CLAUDE.md` forbids an era's hostility from being what blocks an
 * accessibility escape hatch, so the keyboard route to it is full size.
 */
export const LEDGER_KEYMAP: readonly Binding[] = [
  { chord: 'Ctrl+W', command: 'window.close' },
  { chord: 'Ctrl+N', command: 'shell.newWindow' },
  { chord: 'Ctrl+M', command: 'window.minimize' },
  { chord: 'F11', command: 'window.toggleMaximize' },
  { chord: 'Escape', command: 'shell.closeTransient' },
  { chord: 'Ctrl+Tab', command: 'window.cycleNext' },
  { chord: 'Ctrl+Shift+Tab', command: 'window.cyclePrev' },
  { chord: 'Alt+Space', command: 'window.openChromeMenu' },
  { chord: 'Ctrl+F7', command: 'window.beginKeyboardMove' },
  { chord: 'Ctrl+F8', command: 'window.beginKeyboardResize' },
]

// Parsed at load and checked against the key names a real KeyboardEvent can produce.
// A misspelled chord fails silently otherwise, and a dead keyboard path is a fidelity
// bug — this is how Alt+Space was caught in phase 2.
const unreachable = new Keymap(LEDGER_KEYMAP).unknownKeys()
if (unreachable.length > 0) {
  throw new Error(`ledger keymap has unreachable chords: ${unreachable.join(', ')}`)
}

export const ledgerSkin = {
  id: 'ledger',
  chrome: new LedgerChrome(clock),
  menu: new LedgerMenuRenderer(),
  metrics: LEDGER_METRICS,
  provenance: LEDGER_PROVENANCE,
  keymap: LEDGER_KEYMAP,
  regions: ledgerRegions(clock),
  generatedProperties: ledgerGeneratedProperties,
  /**
   * §8: "The screen refreshes at 1Hz while you read ... Typing forces a burst mode
   * that looks and behaves differently — and ticks the gutter."
   *
   * Burst is `null`, meaning the display's own rate, rather than a third invented
   * number. §8 says the burst ticks the gutter, and running at the panel's rate is
   * what makes the cost visibly climb while you type — the era's thesis arriving on
   * the one surface you cannot look away from.
   */
  renderBudget: {
    idleHz: REFRESH.idleHz,
    burstHz: REFRESH.burstHz,
    burstMs: REFRESH.burstMs,
  },
  /** See the file header: native is scale 1, which is all the dither requires. */
  viewport: { mode: 'native' as const },
} as const
