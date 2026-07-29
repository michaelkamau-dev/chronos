/**
 * The `plain` harness path codec.
 *
 * Path syntax is presentation, not storage: the filesystem is entirely id-based
 * and every path string in Chronos is produced here. That is what lets
 * `Macintosh HD:Documents:Letter` and `C:\My Documents\Letter.txt` be two views of
 * one record.
 *
 * The harness uses neutral POSIX-ish syntax and shows extensions. It is not an
 * era — it exists so the codec contract is exercised before any era commits to a
 * spelling. The six era codecs replace it wholesale.
 */

import type { FsApi, FsNode, NodeId, PathCodec, WellKnown } from '../../core/fs/types.js'
import { isDir } from '../../core/fs/types.js'

/**
 * Era-correct names for the folders the system knows by role. The harness keeps
 * canonical names; Windows XP will map `documents` to `My Documents` here, and
 * that override is the only place the difference exists.
 */
const DISPLAY_NAMES: Partial<Record<WellKnown, string>> = {}

export function createPlainCodec(fs: FsApi): PathCodec {
  return {
    separator: '/',

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
      // The root contributes the volume, not a name component, so a path reads
      // `/Documents/Letter.txt` rather than `/Chronos/Documents/Letter.txt`.
      const parts: string[] = []
      for (let i = 0; i < chain.length; i++) {
        const node = chain[i]
        if (!node) continue
        if (i === 0 && node.wellKnown === 'root') continue
        parts.push(this.displayName(node))
      }
      const joined = parts.join('/')
      const last = chain[chain.length - 1]
      const trailing = last && isDir(last) && parts.length > 0 ? '/' : ''
      return `/${joined}${trailing}`
    },

    async parse(input: string, cwd: NodeId): Promise<NodeId | null> {
      const trimmed = input.trim()
      if (trimmed.length === 0) return cwd

      const absolute = trimmed.startsWith('/')
      let cursor: NodeId = absolute ? fs.root() : cwd
      const parts = trimmed.split('/').filter((p) => p.length > 0)

      for (const part of parts) {
        if (part === '.') continue
        if (part === '..') {
          const node = await fs.stat(cursor)
          cursor = node.parent ?? fs.root()
          continue
        }
        const children = await fs.list(cursor)
        // Match the stored name or the era's display name, so a path a user reads
        // off the screen is a path they can type back in.
        const match = children.find((c) => c.name === part || this.displayName(c) === part)
        if (!match) return null
        cursor = match.id
      }
      return cursor
    },
  }
}

/**
 * Neutral collision naming. Era decorators differ — classic Mac appended ` copy`,
 * Windows ` (2)` — so the filesystem takes this as a parameter rather than
 * knowing any of them.
 */
export function plainNameDecorator(base: string, attempt: number): string {
  const dot = base.lastIndexOf('.')
  if (dot > 0) {
    return `${base.slice(0, dot)} ${attempt + 1}${base.slice(dot)}`
  }
  return `${base} ${attempt + 1}`
}
