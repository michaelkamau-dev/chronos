/**
 * Windows 3.1 path codec.
 *
 * `C:\DOCS\LETTER.TXT` over exactly the same stored nodes that XP renders as
 * `C:\My Documents\Letter.txt` and the classic Mac codec will render as
 * `Macintosh HD:Documents:Letter`. Nothing about the node changes — the whole point
 * of the cross-era spine is that the presentation is the only thing that differs.
 *
 * Three things vary and all three live here, exactly as they do for XP: the separator
 * and volume syntax, the well-known folder display names, and the extension policy.
 * 3.1's extension policy is the aggressive one — **8.3 uppercase** — and it is the
 * only codec in the project that has to *lose* information to render a name.
 *
 * The 8.3 coercion is display-only and is deliberately not reversible. A file called
 * `Quarterly Report.markdown` shows as `QUARTER.MAR`, and `parse` accepts both the
 * stored name and the coerced form so a path read off the screen can be typed back —
 * which is the same rule the XP codec follows for its display names, just doing much
 * more work.
 */

import type { FsApi, FsNode, NodeId, PathCodec, WellKnown } from '../../core/fs/types.js'
import { isDir } from '../../core/fs/types.js'

/**
 * 3.1's names for the folders the system knows by role.
 *
 * Every one is 8 characters or fewer because it had to be. There is no Recycle Bin —
 * that arrives with Windows 95 — so `trash` becomes `WASTE`, and a deleted file in
 * 3.1 was simply gone. The name is ours; the behaviour (a real trash the FS can
 * restore from) is the project's, and the era gets the closest label it can carry.
 */
const DISPLAY_NAMES: Partial<Record<WellKnown, string>> = {
  documents: 'DOCS',
  pictures: 'PICS',
  desktop: 'DESKTOP',
  trash: 'WASTE',
  applications: 'PROGRAMS',
  system: 'WINDOWS',
}

const VOLUME = 'C:'

/** Characters MS-DOS would not accept in a name, plus space. */
const ILLEGAL = /[^A-Z0-9_^$~!#%&\-{}()@']/g

/**
 * Coerces a name to 8.3 uppercase, the way a 3.1 file manager displayed a long name
 * it had been handed.
 *
 * This is lossy by design. Two different stored names can coerce to the same 8.3
 * form, so `parse` matches the stored name first and falls back to the coerced form,
 * and a directory listing shows the coerced name while the FS keeps the real one.
 */
export function to83(name: string): string {
  const dot = name.lastIndexOf('.')
  const hasExt = dot > 0 && dot < name.length - 1
  const stem = (hasExt ? name.slice(0, dot) : name).toUpperCase().replace(ILLEGAL, '')
  const ext = hasExt ? name.slice(dot + 1).toUpperCase().replace(ILLEGAL, '') : ''
  const left = (stem || 'FILE').slice(0, 8)
  return ext ? `${left}.${ext.slice(0, 3)}` : left
}

export function createWin31Codec(fs: FsApi): PathCodec {
  return {
    separator: '\\',

    volumeName(): string {
      return VOLUME
    },

    displayName(node: FsNode): string {
      if (node.wellKnown !== undefined) {
        const override = DISPLAY_NAMES[node.wellKnown]
        if (override !== undefined) return override
      }
      // Directories in 3.1 conventionally carried no extension, but the 8-character
      // limit applied to them just the same.
      return to83(node.name)
    },

    format(chain: readonly FsNode[]): string {
      const parts: string[] = []
      for (let i = 0; i < chain.length; i++) {
        const node = chain[i]
        if (!node) continue
        // The root contributes the volume, not a path component.
        if (i === 0 && node.wellKnown === 'root') continue
        parts.push(this.displayName(node))
      }
      const last = chain[chain.length - 1]
      if (parts.length === 0) return `${VOLUME}\\`
      const body = parts.join('\\')
      return `${VOLUME}\\${body}${last && isDir(last) ? '\\' : ''}`
    },

    async parse(input: string, cwd: NodeId): Promise<NodeId | null> {
      let text = input.trim()
      if (text.length === 0) return cwd
      text = text.replace(/\//g, '\\')

      let cursor: NodeId = cwd
      if (/^[A-Za-z]:/.test(text)) {
        if (text.slice(0, 2).toUpperCase() !== VOLUME) return null
        cursor = fs.root()
        text = text.slice(2)
      } else if (text.startsWith('\\')) {
        cursor = fs.root()
      }

      for (const part of text.split('\\')) {
        if (part.length === 0 || part === '.') continue
        if (part === '..') {
          const node = await fs.stat(cursor)
          cursor = node.parent ?? fs.root()
          continue
        }
        const children = await fs.list(cursor)
        const wanted = part.toLowerCase()
        // Stored name first, then the era's coerced display form. Matching the
        // coerced form is what lets a user type back a path they read off the
        // screen, which is otherwise impossible when the display is lossy.
        const match =
          children.find((c) => c.name.toLowerCase() === wanted) ??
          children.find((c) => this.displayName(c).toLowerCase() === wanted)
        if (!match) return null
        cursor = match.id
      }
      return cursor
    },
  }
}

/**
 * 3.1's collision decoration.
 *
 * There is no room for XP's " (2)" inside eight characters, so the digit replaces the
 * stem's last character — which is what a 3.1-era tool did when it had to fit. The
 * stored name is untouched; this only affects what a new file is called.
 */
export function win31NameDecorator(base: string, attempt: number): string {
  const coerced = to83(base)
  const dot = coerced.lastIndexOf('.')
  const stem = dot > 0 ? coerced.slice(0, dot) : coerced
  const ext = dot > 0 ? coerced.slice(dot) : ''
  const digit = String(attempt + 1)
  const room = Math.max(0, 8 - digit.length)
  return `${stem.slice(0, room)}${digit}${ext}`
}
