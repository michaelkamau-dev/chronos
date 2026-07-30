/**
 * Mac OS X Tiger path codec.
 *
 * `/Users/chronos/Documents/Letter.txt` over exactly the same stored nodes that the
 * XP codec renders as `C:\My Documents\Letter.txt`. The filesystem is id-based; every
 * path string in the era comes from here.
 *
 * Tiger is the era where the cross-era spine is most visible, because it is the one
 * whose paths look nothing like either of the others: POSIX separators, a `/Users`
 * home directory that no other era has, a volume that is the empty string rather than
 * `C:` or `Macintosh HD:`, and case-sensitive matching where Windows is not.
 *
 * **The home directory is a display concern, not a stored one.** `/Users/chronos` is
 * not a pair of real nodes — the stored tree has a root with `documents` and
 * `pictures` under it, exactly as every other era sees it. Inventing two filesystem
 * levels so one era's paths look right would put era knowledge in the FS layer, which
 * `test/invariants.test.js` forbids and which would corrupt the other five eras'
 * paths. So the prefix is added by `format` and stripped by `parse`.
 */

import type { FsApi, FsNode, NodeId, PathCodec, WellKnown } from '../../core/fs/types.js'
import { isDir } from '../../core/fs/types.js'

/**
 * Tiger's names for the folders the system knows by role.
 *
 * Mac OS X capitalises them the way the Finder shows them, and unlike Windows XP it
 * does *not* prefix "My". `trash` is the one that diverges most: it is a real
 * directory called `.Trash` on disk and "Trash" in the Finder, and the Finder name is
 * what a path in this era should read.
 */
const DISPLAY_NAMES: Partial<Record<WellKnown, string>> = {
  documents: 'Documents',
  pictures: 'Pictures',
  desktop: 'Desktop',
  trash: 'Trash',
  applications: 'Applications',
  system: 'System',
}

/** The short user name Tiger's home directory carries. */
const USER = 'chronos'

/**
 * Folders that live inside the user's home rather than at the volume root.
 *
 * `/Applications` and `/System` are volume-level on Mac OS X; `Documents`,
 * `Pictures` and `Desktop` are inside `/Users/<user>`. Getting this wrong is the
 * single most visible way a Mac path recreation reads as fake.
 */
const IN_HOME: ReadonlySet<WellKnown> = new Set<WellKnown>([
  'documents',
  'pictures',
  'desktop',
])

const HOME = `/Users/${USER}`

export function createTigerCodec(fs: FsApi): PathCodec {
  return {
    separator: '/',

    /**
     * A POSIX path has no volume component — the boot volume *is* `/`. Every other
     * era in the project spells a volume (`C:`, `Macintosh HD:`), which is exactly
     * why the codec owns this rather than the formatter assuming one.
     */
    volumeName(): string {
      return ''
    },

    displayName(node: FsNode): string {
      if (node.wellKnown !== undefined) {
        const override = DISPLAY_NAMES[node.wellKnown]
        if (override !== undefined) return override
      }
      return node.name
    },

    format(chain: readonly FsNode[]): string {
      const parts: string[] = []
      let inHome = false
      for (let i = 0; i < chain.length; i++) {
        const node = chain[i]
        if (!node) continue
        // The root contributes the leading slash, not a component.
        if (i === 0 && node.wellKnown === 'root') continue
        if (node.wellKnown !== undefined && IN_HOME.has(node.wellKnown)) inHome = true
        parts.push(this.displayName(node))
      }
      const last = chain[chain.length - 1]
      const trailing = last && isDir(last) && parts.length > 0 ? '/' : ''
      if (parts.length === 0) return '/'
      const prefix = inHome ? HOME : ''
      return `${prefix}/${parts.join('/')}${trailing}`
    },

    async parse(input: string, cwd: NodeId): Promise<NodeId | null> {
      let text = input.trim()
      if (text.length === 0) return cwd

      // `~` is Tiger's own shorthand and the terminal in this era will use it.
      if (text === '~' || text.startsWith('~/')) text = HOME + text.slice(1)

      let cursor: NodeId = cwd
      if (text.startsWith('/')) {
        cursor = fs.root()
        // The home prefix is presentation, so it is removed rather than walked:
        // there are no `Users` or `chronos` nodes in the stored tree to find.
        if (text === HOME || text.startsWith(`${HOME}/`)) text = text.slice(HOME.length)
        else if (text === '/Users' || text === `/Users/`) return fs.root()
      }

      for (const part of text.split('/')) {
        if (part.length === 0 || part === '.') continue
        if (part === '..') {
          const node = await fs.stat(cursor)
          cursor = node.parent ?? fs.root()
          continue
        }
        const children = await fs.list(cursor)
        // HFS+ is case-insensitive by default on Mac OS X, so a path read off the
        // screen can be typed back in any case — but the display name has to match
        // too, since that is what the screen showed.
        const wanted = part.toLowerCase()
        const match = children.find(
          (c) => c.name.toLowerCase() === wanted || this.displayName(c).toLowerCase() === wanted,
        )
        if (!match) return null
        cursor = match.id
      }
      return cursor
    },
  }
}

/**
 * The Finder appends " copy", then " copy 2" — not Windows' " (2)".
 *
 * Classic Mac and Mac OS X agree on the word and differ on the extension: the Finder
 * puts the suffix before the extension when there is one, so `Letter.txt` duplicates
 * to `Letter copy.txt`.
 */
export function tigerNameDecorator(base: string, attempt: number): string {
  const suffix = attempt === 1 ? ' copy' : ` copy ${attempt}`
  const dot = base.lastIndexOf('.')
  if (dot > 0) return `${base.slice(0, dot)}${suffix}${base.slice(dot)}`
  return `${base}${suffix}`
}
