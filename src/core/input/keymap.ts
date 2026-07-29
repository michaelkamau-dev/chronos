/**
 * Chord parsing and matching.
 *
 * A chord is written `Mod+Mod+Key`, e.g. `Alt+F4`, `Meta+Shift+W`, `Ctrl+Escape`.
 * Modifiers are `Ctrl`, `Alt`, `Shift`, `Meta`, in any order. The key part is
 * matched against `KeyboardEvent.key` case-insensitively, or against
 * `KeyboardEvent.code` when prefixed with `code:` — which is how a skin binds a
 * physical key position rather than the character it produces.
 *
 * Chords are parsed once into a packed integer + key string so matching a
 * keydown is two comparisons and allocates nothing.
 */

import type { Command } from './commands.js'

const MOD_CTRL = 1
const MOD_ALT = 2
const MOD_SHIFT = 4
const MOD_META = 8

/**
 * Chord spellings that do not match `KeyboardEvent.key` directly.
 *
 * The space bar reports `key === ' '`, so a chord written `Alt+Space` has to be
 * normalised or it silently never fires — which is exactly the kind of dead
 * binding that survives review because nothing errors.
 */
const KEY_ALIASES: Readonly<Record<string, string>> = {
  space: ' ',
  spacebar: ' ',
  esc: 'escape',
  return: 'enter',
  del: 'delete',
  ins: 'insert',
  plus: '+',
  minus: '-',
  up: 'arrowup',
  down: 'arrowdown',
  left: 'arrowleft',
  right: 'arrowright',
  pgup: 'pageup',
  pgdn: 'pagedown',
  pagedn: 'pagedown',
}

function normaliseKey(name: string): string {
  return KEY_ALIASES[name] ?? name
}

export interface Binding {
  chord: string
  command: Command
}

interface Parsed {
  mods: number
  /** Lowercased `key`, or a `code` value when `byCode` is true. */
  key: string
  byCode: boolean
  command: Command
}

export class Keymap {
  private readonly parsed: Parsed[] = []

  constructor(bindings: readonly Binding[] = []) {
    for (const b of bindings) this.add(b.chord, b.command)
  }

  add(chord: string, command: Command): void {
    const parts = chord.split('+')
    let mods = 0
    let key = ''
    let byCode = false
    for (const raw of parts) {
      const part = raw.trim()
      if (part.length === 0) continue
      const lower = part.toLowerCase()
      if (lower === 'ctrl' || lower === 'control') mods |= MOD_CTRL
      else if (lower === 'alt' || lower === 'option') mods |= MOD_ALT
      else if (lower === 'shift') mods |= MOD_SHIFT
      else if (lower === 'meta' || lower === 'cmd' || lower === 'command') mods |= MOD_META
      else if (lower.startsWith('code:')) {
        byCode = true
        key = part.slice(5)
      } else key = normaliseKey(lower)
    }
    if (key.length === 0) {
      throw new Error(`Keymap: chord "${chord}" has no key`)
    }
    this.parsed.push({ mods, key, byCode, command })
  }

  /** The command bound to this event, or null. Allocation-free. */
  match(e: KeyboardEvent): Command | null {
    let mods = 0
    if (e.ctrlKey) mods |= MOD_CTRL
    if (e.altKey) mods |= MOD_ALT
    if (e.shiftKey) mods |= MOD_SHIFT
    if (e.metaKey) mods |= MOD_META

    for (let i = 0; i < this.parsed.length; i++) {
      const p = this.parsed[i]
      if (p === undefined || p.mods !== mods) continue
      if (p.byCode) {
        if (p.key === e.code) return p.command
      } else if (p.key === e.key.toLowerCase()) return p.command
    }
    return null
  }

  get size(): number {
    return this.parsed.length
  }

  /**
   * Chords whose key part can never match a real `KeyboardEvent.key`.
   *
   * A misspelled chord fails silently — nothing throws, the binding simply never
   * fires — so this is asserted in the test suite for every skin's keymap rather
   * than left to be discovered by a user pressing the key.
   */
  unknownKeys(): string[] {
    const bad: string[] = []
    for (const p of this.parsed) {
      if (p.byCode) continue
      // Single characters are always plausible: 'a', ' ', '+', '/'.
      if (p.key.length === 1) continue
      if (NAMED_KEYS.has(p.key)) continue
      if (/^f([1-9]|1[0-9]|2[0-4])$/.test(p.key)) continue
      bad.push(p.key)
    }
    return bad
  }
}

/** Lowercased `KeyboardEvent.key` values that are longer than one character. */
const NAMED_KEYS: ReadonlySet<string> = new Set([
  'alt',
  'arrowdown',
  'arrowleft',
  'arrowright',
  'arrowup',
  'audiovolumedown',
  'audiovolumemute',
  'audiovolumeup',
  'backspace',
  'capslock',
  'clear',
  'contextmenu',
  'control',
  'copy',
  'cut',
  'delete',
  'end',
  'enter',
  'escape',
  'help',
  'home',
  'insert',
  'mediaplaypause',
  'mediastop',
  'mediatracknext',
  'mediatrackprevious',
  'meta',
  'numlock',
  'pagedown',
  'pageup',
  'paste',
  'pause',
  'printscreen',
  'scrolllock',
  'shift',
  'tab',
])

/**
 * An ordered stack of keymaps. Resolution runs from the top down, so a modal or
 * an app layer shadows the shell, and the era keymap sits at the bottom as the
 * default.
 */
export class KeymapStack {
  private readonly stack: Keymap[] = []

  push(map: Keymap): () => void {
    this.stack.push(map)
    return () => {
      const i = this.stack.indexOf(map)
      if (i >= 0) this.stack.splice(i, 1)
    }
  }

  resolve(e: KeyboardEvent): Command | null {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const cmd = this.stack[i]?.match(e)
      if (cmd) return cmd
    }
    return null
  }
}
