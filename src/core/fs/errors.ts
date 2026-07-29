/**
 * Filesystem errors.
 *
 * These are typed rather than bare `Error`s because the shell has to react
 * differently to each: a name collision is resolved with the era's naming policy,
 * a quota failure surfaces the era's authentic disk-full dialog, and a missing
 * node is a bug that should reach the failure state rather than be swallowed.
 */

export type FsErrorCode =
  | 'not-found'
  | 'not-a-directory'
  | 'not-a-file'
  | 'name-conflict'
  | 'invalid-name'
  | 'locked'
  | 'cycle'
  | 'quota-exceeded'
  | 'corrupt'

export class FsError extends Error {
  readonly code: FsErrorCode

  constructor(code: FsErrorCode, message: string) {
    super(message)
    this.name = 'FsError'
    this.code = code
  }
}

export function isFsError(e: unknown, code?: FsErrorCode): e is FsError {
  return e instanceof FsError && (code === undefined || e.code === code)
}

/** Names no era could store, regardless of its own stricter conventions. */
export function validateName(name: string): void {
  if (name.length === 0) throw new FsError('invalid-name', 'A name cannot be empty')
  if (name === '.' || name === '..') {
    throw new FsError('invalid-name', `"${name}" is reserved`)
  }
  // Path separators from any of the six eras: POSIX slash, Windows backslash,
  // classic Mac colon. Storing one would make some era's path unparseable.
  if (/[/\\:]/.test(name)) {
    throw new FsError('invalid-name', 'A name cannot contain / \\ or :')
  }
  // Escaped rather than literal so the range survives any file re-encoding.
  if (/[\u0000-\u001f\u007f]/.test(name)) {
    throw new FsError('invalid-name', 'A name cannot contain control characters')
  }
  if (name.length > 255) {
    throw new FsError('invalid-name', 'A name cannot exceed 255 characters')
  }
}
