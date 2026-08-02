/**
 * Turning a typed line into a command, its flags and its operands.
 *
 * Two things here are era-shaped and both arrive as data rather than as a branch.
 *
 * **The flag prefix is the shell's**, and it has to be: on a slash-separated era
 * `/Users/chronos` is an absolute path, and a parser that treated a leading slash as
 * a switch would make half the filesystem unreachable in the one era whose paths look
 * like that. On the backslash side `/w` is a switch and `-r` is a filename. So the
 * parser is told which, and never guesses.
 *
 * **Quoting is not era-shaped.** Every one of the six eras allows spaces in a name —
 * `My Documents`, `System Folder`, `Read Me` — so quoted operands are a requirement of
 * the *filesystem*, not of any shell, and both families supported them. Single and
 * double quotes are both accepted; a backslash is never an escape, because on two of
 * the six eras it is the path separator.
 */

import type { CommandId, FlagId, Shell } from './dialect.js'
import { commandFor } from './dialect.js'

export interface ParsedLine {
  /** The word as typed, for an error message that quotes the user back. */
  readonly word: string
  readonly command: CommandId | null
  readonly flags: ReadonlySet<FlagId>
  /** Switches that carried the right prefix and no known meaning. */
  readonly unknownFlags: readonly string[]
  readonly operands: readonly string[]
}

/**
 * Splits a line into words, honouring quotes and collapsing runs of whitespace.
 *
 * An unterminated quote takes the rest of the line, which is what every shell in
 * both families did — it is a name someone stopped typing, not a syntax error worth
 * refusing.
 */
export function tokenize(line: string): string[] {
  const out: string[] = []
  let current = ''
  let quote: string | null = null
  let started = false

  for (const ch of line) {
    if (quote !== null) {
      if (ch === quote) quote = null
      else current += ch
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      started = true
      continue
    }
    if (ch === ' ' || ch === '\t') {
      if (started) out.push(current)
      current = ''
      started = false
      continue
    }
    current += ch
    started = true
  }
  if (started) out.push(current)
  return out
}

export function parseLine(shell: Shell, line: string): ParsedLine | null {
  const words = tokenize(line)
  const word = words[0]
  if (word === undefined) return null

  const flags = new Set<FlagId>()
  const unknownFlags: string[] = []
  const operands: string[] = []

  for (const token of words.slice(1)) {
    if (!isFlagToken(shell, token)) {
      operands.push(token)
      continue
    }
    const body = token.slice(shell.flagPrefix.length)
    // Bundled single letters — `-rl` — are one token in the Unix family and were
    // never a thing in the other, where each switch is its own `/x`. Splitting
    // per character serves both, because a DOS switch is a single letter too.
    for (const letter of body) {
      const id = flagFor(shell, letter)
      if (id === null) unknownFlags.push(`${shell.flagPrefix}${letter}`)
      else flags.add(id)
    }
  }

  return { word, command: commandFor(shell, word), flags, unknownFlags, operands }
}

/**
 * A token is a switch when it carries the shell's prefix and something after it.
 *
 * The bare prefix is not a switch: on a slash era `/` is the root directory, and on
 * a backslash era `\` is the root of the current volume. Both are operands.
 */
function isFlagToken(shell: Shell, token: string): boolean {
  return token.length > shell.flagPrefix.length && token.startsWith(shell.flagPrefix)
}

function flagFor(shell: Shell, letter: string): FlagId | null {
  for (const [id, spellings] of Object.entries(shell.flags)) {
    if (spellings?.includes(letter)) return id as FlagId
  }
  return null
}
