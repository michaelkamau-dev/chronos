/**
 * Windows XP path codec.
 *
 * `C:\My Documents\Letter.txt` over exactly the same stored nodes that the classic
 * Mac codec will render as `Macintosh HD:Documents:Letter`. The filesystem is
 * id-based; every path string in the era comes from here.
 *
 * Three things differ from the harness codec and all three live in this file:
 * the separator and volume syntax, the well-known folder display names — XP calls
 * `documents` "My Documents" — and the extension policy, which XP shows.
 */

import type { FsApi, FsNode, NodeId, PathCodec, WellKnown } from '../../core/fs/types.js'
import { isDir } from '../../core/fs/types.js'

/**
 * XP's names for the folders the system knows by role. This map is the only place
 * the difference between `Documents` and `My Documents` exists — the stored node
 * keeps its canonical name so every other era renders its own.
 */
const DISPLAY_NAMES: Partial<Record<WellKnown, string>> = {
  documents: 'My Documents',
  pictures: 'My Pictures',
  trash: 'Recycle Bin',
  applications: 'Program Files',
  system: 'WINDOWS',
}

const VOLUME = 'C:'

export function createXpCodec(fs: FsApi): PathCodec {
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
      return node.name
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
      const body = parts.join('\\')
      if (parts.length === 0) return `${VOLUME}\\`
      // A trailing separator marks a directory, as Explorer's address bar did.
      return `${VOLUME}\\${body}${last && isDir(last) ? '\\' : ''}`
    },

    async parse(input: string, cwd: NodeId): Promise<NodeId | null> {
      let text = input.trim()
      if (text.length === 0) return cwd
      // Accept either separator on input: users type both, and Windows did too.
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
        // Windows paths are case-insensitive, and match either the stored name or
        // the era's display name so a path read off the screen can be typed back.
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

/** Windows appends " (2)"; classic Mac appended " copy". Era knowledge, so it lives here. */
export function xpNameDecorator(base: string, attempt: number): string {
  const dot = base.lastIndexOf('.')
  if (dot > 0) return `${base.slice(0, dot)} (${attempt + 1})${base.slice(dot)}`
  return `${base} (${attempt + 1})`
}
