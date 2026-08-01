/**
 * Presentation helpers for the file manager.
 *
 * Everything here is era-neutral by construction. The one place era knowledge
 * would be tempting — how a name is spelled, whether its extension shows — is not
 * here at all: that is `PathCodec.displayName`, which the skin supplies. What is
 * left is arithmetic and a MIME table, and neither differs between 1984 and 2035.
 */

import type { FsNode } from '../../core/fs/types.js'
import { isDir } from '../../core/fs/types.js'

/**
 * A size, in the units the file manager's own column shows.
 *
 * Binary multiples, because every one of the six eras counted a kilobyte as 1024
 * bytes — the decimal reading is a 2000s marketing convention that no era in this
 * project shipped, and using it would make a 1KB file read as 1,024 bytes in a
 * column whose whole purpose is to be scanned quickly.
 */
export function formatSize(bytes: number): string {
  if (bytes === 1) return '1 byte'
  if (bytes < 1024) return `${bytes} bytes`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`
  const mb = kb / 1024
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`
}

/**
 * A timestamp for the modified column.
 *
 * `toLocaleString` with an explicit field set rather than a locale-default
 * shorthand: the default varies by host locale in ways that would make the column
 * width unpredictable, and a file manager's date column that reflows is a bug in
 * every era.
 */
export function formatDate(ms: number): string {
  const d = new Date(ms)
  const date = d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  })
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  return `${date} ${time}`
}

/** MIME prefixes and exact types, longest match first. */
const KINDS: ReadonlyArray<readonly [string, string]> = [
  ['text/plain', 'Text Document'],
  ['text/', 'Text Document'],
  ['image/png', 'PNG Image'],
  ['image/jpeg', 'JPEG Image'],
  ['image/gif', 'GIF Image'],
  ['image/', 'Image'],
  ['audio/', 'Sound'],
  ['video/', 'Movie'],
  ['application/json', 'Data Document'],
  ['application/octet-stream', 'Document'],
]

/** A human-readable kind, from what the filesystem actually stores. */
export function formatKind(node: FsNode): string {
  if (isDir(node)) return 'Folder'
  for (const [prefix, label] of KINDS) {
    if (node.mime === prefix || node.mime.startsWith(prefix)) return label
  }
  return 'Document'
}

/**
 * The *category* of the mark shown before a name.
 *
 * Never a character. Six eras' icon sets are six different things, so the app
 * contributes a category and the skin draws it — and drawing it in CSS rather than
 * in type is what keeps it out of the era's font subset entirely. Returning `▸`
 * here instead put 2,569 mid-grey pixels into a 1-bit window, because no era face
 * carries that codepoint and a missing glyph silently falls back to a face that
 * antialiases. See `ListRow.glyph`.
 */
export function glyphFor(node: FsNode): string {
  if (isDir(node)) return node.wellKnown === 'trash' ? 'trash' : 'folder'
  if (node.mime.startsWith('image/')) return 'image'
  if (node.mime.startsWith('audio/') || node.mime.startsWith('video/')) return 'sound'
  return 'document'
}

/**
 * Splits a stored name into stem and extension.
 *
 * Shared rather than era-specific, and that distinction cost a bug once already:
 * the *stored* name belongs to all six eras, so inserting a collision suffix or
 * selecting a rename range has to respect the extension even in an era that hides
 * it. A leading dot is part of the stem — `.profile` has no extension.
 */
export function splitName(name: string): { stem: string; ext: string } {
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return { stem: name, ext: '' }
  return { stem: name.slice(0, dot), ext: name.slice(dot) }
}
