/**
 * The undo stack.
 *
 * **Why the app owns one at all.** A `<textarea>` has the browser's own undo, and
 * it is unusable here for two independent reasons. It is destroyed by any
 * programmatic write to `value`, which is what Replace All, Revert, Open and
 * `resume()` all do — so the one stack the user could reach would silently empty
 * itself at the moments an editor most needs it. And it cannot be read: phase 5's
 * gate is that the undo stack survives suspend and resume, and a claim nothing can
 * inspect is a claim nothing can test.
 *
 * It holds plain data and no DOM, so the round trip costs it nothing — which is
 * worth saying rather than leaving implied, because it is the *opposite* of the
 * caret and the scroll offset in the same app.
 */

/** A point the buffer can be restored to. */
export interface Snapshot {
  text: string
  selStart: number
  selEnd: number
}

/** One contiguous change, as recovered by diffing the buffer against itself. */
export interface Edit {
  /** Offset of the first changed character. */
  at: number
  removed: string
  inserted: string
}

/**
 * How many steps back the user can go.
 *
 * A cap, not a measurement: no era's documentation states a depth, and several of
 * these editors had exactly one level. 200 is chosen so the stack cannot grow
 * without bound on a long editing session, and it is stated here rather than left
 * as a bare number in the code.
 */
export const UNDO_LIMIT = 200

/**
 * Recover the single contiguous change between two versions of a buffer.
 *
 * A `<textarea>`'s `input` event is always one contiguous replacement — typing,
 * a paste, a delete, or a selection overwritten — so the common prefix and the
 * common suffix bracket it exactly. The two lengths are clamped so they cannot
 * overlap on a buffer that shrank, which is where a naive version reports a
 * negative-length removal.
 */
export function diff(before: string, after: string): Edit {
  const max = Math.min(before.length, after.length)
  let prefix = 0
  while (prefix < max && before[prefix] === after[prefix]) prefix++
  let suffix = 0
  while (
    suffix < max - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix++
  }
  return {
    at: prefix,
    removed: before.slice(prefix, before.length - suffix),
    inserted: after.slice(prefix, after.length - suffix),
  }
}

/**
 * Whether an edit continues a run of typing.
 *
 * Coalescing is **structural rather than timed**. A timer would make the same
 * keystrokes produce a different stack depending on how fast they arrived, which
 * is untestable, and a test that cannot pin the depth cannot assert that the stack
 * survived a suspension.
 *
 * **The run breaks where a word starts, not where a space is typed.** Breaking on
 * the space itself looks equivalent and is not: it makes the space its own undo
 * step, so `one two` is three steps rather than two and undo walks
 * `one two` → `one ` → `one` → ``. Breaking on the first non-space *after* a space
 * gives the word-plus-its-trailing-space granularity every one of these editors
 * had. A newline always breaks, and so does any deletion.
 */
function isSingleInsert(edit: Edit): boolean {
  return edit.removed.length === 0 && edit.inserted.length === 1
}

function continuesRun(before: Snapshot, edit: Edit, runEnd: number | null): boolean {
  if (runEnd !== edit.at) return false
  if (!isSingleInsert(edit)) return false
  const ch = edit.inserted
  if (ch === '\n') return false
  const previous = edit.at === 0 ? '' : (before.text[edit.at - 1] ?? '')
  const startsWord = /\S/.test(ch) && (previous === '' || /\s/.test(previous))
  return !startsWord
}

export class UndoStack {
  private readonly past: Snapshot[] = []
  private readonly future: Snapshot[] = []
  /** Offset just past the last coalesced character, or null when no run is open. */
  private runEnd: number | null = null

  /**
   * Record the state *before* an edit that has already been applied.
   *
   * Before rather than after, because undo restores what was there — a stack of
   * "after" states needs the current state pushed on every undo to be reversible,
   * and gets one entry out of step the first time an edit is coalesced.
   */
  record(before: Snapshot, edit: Edit): void {
    // Any new edit invalidates the redo path, coalesced or not: the future the
    // stack was holding is no longer reachable from here.
    this.future.length = 0

    if (continuesRun(before, edit, this.runEnd)) {
      this.runEnd = edit.at + 1
      return
    }

    this.past.push(before)
    if (this.past.length > UNDO_LIMIT) this.past.shift()
    this.runEnd = isSingleInsert(edit) && edit.inserted !== '\n' ? edit.at + 1 : null
  }

  /**
   * End the current run of typing.
   *
   * Called when the caret moves, when the surface loses focus, and before any
   * programmatic write — all three are points where the next character typed is
   * not a continuation of the last one.
   */
  breakRun(): void {
    this.runEnd = null
  }

  /** Record a whole-buffer replacement — Replace All, Revert, a reload from disk. */
  recordDiscrete(before: Snapshot): void {
    this.future.length = 0
    this.past.push(before)
    if (this.past.length > UNDO_LIMIT) this.past.shift()
    this.runEnd = null
  }

  undo(current: Snapshot): Snapshot | null {
    const entry = this.past.pop()
    if (!entry) return null
    this.future.push(current)
    this.runEnd = null
    return entry
  }

  redo(current: Snapshot): Snapshot | null {
    const entry = this.future.pop()
    if (!entry) return null
    this.past.push(current)
    this.runEnd = null
    return entry
  }

  canUndo(): boolean {
    return this.past.length > 0
  }

  canRedo(): boolean {
    return this.future.length > 0
  }

  /** Depth of each half, so a test can assert the stack itself survived a suspension. */
  depth(): { undo: number; redo: number } {
    return { undo: this.past.length, redo: this.future.length }
  }

  /** Discard everything — a new document, or one opened over the top of this one. */
  clear(): void {
    this.past.length = 0
    this.future.length = 0
    this.runEnd = null
  }
}
