/**
 * Arithmetic and text the terminal formats for itself.
 *
 * Nothing era-shaped is here and nothing era-shaped belongs here: how a *name* is
 * spelled is `PathCodec.displayName`, and which *word* a command answers to is
 * `dialect.ts`. What is left is byte counts, timestamps and glob matching, none of
 * which differed between 1984 and 2035.
 */

import type { FsNode } from '../../core/fs/types.js'
import { isDir } from '../../core/fs/types.js'

/**
 * A byte count with thousands separators, which is what both families' listings
 * printed — `1,024` in a `dir` column and in `ls -l` alike. No unit suffix and no
 * rounding: a listing that says `1.0 KB` has thrown away the number the user asked
 * for, and the file manager's own column is where a rounded size belongs.
 */
export function bytes(n: number): string {
  return n.toLocaleString('en-US')
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0')
}

/**
 * A timestamp for a listing column.
 *
 * Fixed field widths and a fixed field order rather than a locale shorthand,
 * because a column whose width depends on the host's locale reflows the whole
 * listing — the same reason the file manager's date column spells its fields out.
 */
export function stamp(ms: number): string {
  const d = new Date(ms)
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** A file's kind for a listing, from what the filesystem actually stores. */
export function kindOf(node: FsNode): string {
  if (isDir(node)) return 'folder'
  const mime = node.mime
  const slash = mime.indexOf('/')
  if (mime.startsWith('text/')) return 'text'
  if (slash > 0) return mime.slice(0, slash)
  return 'data'
}

/**
 * Compiles a shell glob to a regular expression.
 *
 * `*` and `?` only. Both families had exactly these two and nothing else at the
 * command line, and every other metacharacter is escaped so a name containing a
 * dot or a bracket matches itself rather than becoming a pattern by accident.
 */
export function globToRegExp(pattern: string): RegExp {
  let out = ''
  for (const ch of pattern) {
    if (ch === '*') out += '.*'
    else if (ch === '?') out += '.'
    else out += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${out}$`, 'i')
}

/** Extensions worth naming, so a file created at the prompt gets a usable type. */
const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  html: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  json: 'application/json',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
}

/**
 * The MIME type a name implies, or plain text.
 *
 * Text is the default rather than `application/octet-stream` because everything
 * created at a command line here is typed by a person: `touch notes` and
 * `echo … > log` both produce something readable, and a file the terminal can
 * create but cannot then print back would be a strange thing to ship.
 */
export function mimeForName(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return 'text/plain'
  return MIME_BY_EXTENSION[name.slice(dot + 1).toLowerCase()] ?? 'text/plain'
}

/** Whether `cat` can print this without turning binary into mojibake. */
export function isPrintable(mime: string): boolean {
  return mime.startsWith('text/') || mime === 'application/json'
}
