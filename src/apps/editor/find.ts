/**
 * Search over a plain-text buffer.
 *
 * Pure functions over strings, deliberately: every one of them is decidable from
 * its arguments alone, so the wrap rule and the case rule can be asserted without
 * a window, a filesystem or an era. The app above holds the state; this holds none.
 *
 * **Literal search, not regular expressions.** None of the six eras' text editors
 * offered a pattern search — Notepad, MacWrite, SimpleText and TextEdit all
 * matched a literal string — and offering one here would be a 2005 feature in a
 * 1984 window. It also makes `matchCase` mean exactly one thing.
 */

export interface FindOptions {
  matchCase: boolean
  /** Continue from the other end when the search runs off the buffer. */
  wrap: boolean
}

export interface Match {
  start: number
  end: number
}

/**
 * Fold for comparison.
 *
 * `toLowerCase` rather than `toLocaleLowerCase`: the era-correct behaviour is a
 * byte-wise fold, and a locale-sensitive one would make the same document match
 * differently depending on a setting no era in this project has.
 */
function fold(s: string, matchCase: boolean): string {
  return matchCase ? s : s.toLowerCase()
}

/**
 * The first match at or after `from`, wrapping to the start of the buffer when
 * `wrap` is set and nothing follows.
 *
 * A wrapped search must not walk past where it began, or an absent needle in a
 * long document is scanned forever. `indexOf` from 0 finds the earliest match,
 * which is at or before `from` by construction, so the search terminates after
 * exactly two probes whatever the buffer contains.
 */
export function findNext(
  text: string,
  needle: string,
  from: number,
  opts: FindOptions,
): Match | null {
  if (needle.length === 0) return null
  const hay = fold(text, opts.matchCase)
  const pin = fold(needle, opts.matchCase)
  const at = hay.indexOf(pin, Math.max(0, Math.min(from, text.length)))
  if (at >= 0) return { start: at, end: at + needle.length }
  if (!opts.wrap) return null
  const wrapped = hay.indexOf(pin)
  if (wrapped < 0) return null
  return { start: wrapped, end: wrapped + needle.length }
}

/**
 * The last match ending at or before `before`, wrapping to the end of the buffer.
 *
 * `lastIndexOf`'s argument is the *start* offset it may return, so a search for
 * the match ending at or before `before` looks from `before - needle.length`.
 * Off-by-one here is what makes a backwards Find Next find the match it is
 * already sitting on and never move.
 */
export function findPrevious(
  text: string,
  needle: string,
  before: number,
  opts: FindOptions,
): Match | null {
  if (needle.length === 0) return null
  const hay = fold(text, opts.matchCase)
  const pin = fold(needle, opts.matchCase)
  const limit = Math.max(0, Math.min(before, text.length)) - needle.length
  if (limit >= 0) {
    const at = hay.lastIndexOf(pin, limit)
    if (at >= 0) return { start: at, end: at + needle.length }
  }
  if (!opts.wrap) return null
  const wrapped = hay.lastIndexOf(pin)
  if (wrapped < 0) return null
  return { start: wrapped, end: wrapped + needle.length }
}

/**
 * Every non-overlapping match, left to right.
 *
 * Used for the match counter and for Replace All, so both report the same number
 * — a counter that counted overlaps while Replace All replaced non-overlapping
 * runs would say "4 matches" and change three.
 */
export function findAll(text: string, needle: string, matchCase: boolean): Match[] {
  const out: Match[] = []
  if (needle.length === 0) return out
  const hay = fold(text, matchCase)
  const pin = fold(needle, matchCase)
  let at = hay.indexOf(pin)
  while (at >= 0) {
    out.push({ start: at, end: at + needle.length })
    at = hay.indexOf(pin, at + needle.length)
  }
  return out
}

/** Which match, if any, the current selection is sitting exactly on. */
export function indexOfMatch(matches: readonly Match[], start: number, end: number): number {
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]
    if (m && m.start === start && m.end === end) return i
  }
  return -1
}

export interface ReplaceAllResult {
  text: string
  count: number
}

/**
 * Replace every non-overlapping match.
 *
 * Built by slicing rather than by `String.replaceAll`, because the needle is a
 * literal and `replaceAll` would read `$&` and `$1` in the *replacement* as
 * substitution patterns — so replacing `x` with `$&$&` would double the match
 * instead of writing four characters. An era that had no regular-expression
 * search certainly had no replacement patterns.
 */
export function replaceAll(
  text: string,
  needle: string,
  replacement: string,
  matchCase: boolean,
): ReplaceAllResult {
  const matches = findAll(text, needle, matchCase)
  if (matches.length === 0) return { text, count: 0 }
  let out = ''
  let cursor = 0
  for (const m of matches) {
    out += text.slice(cursor, m.start) + replacement
    cursor = m.end
  }
  out += text.slice(cursor)
  return { text: out, count: matches.length }
}
