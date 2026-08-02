/**
 * Macintosh System 1 path codec.
 *
 * `Macintosh HD:Documents:Letter` over exactly the same stored nodes that the XP
 * codec renders as `C:\My Documents\Letter.txt` and the Windows 3.1 codec renders as
 * `C:\DOCS\LETTER.TXT`. Nothing about the node changes — that the presentation is the
 * only difference is the whole claim the cross-era spine makes.
 *
 * Three things vary and all three live here, as they do for every codec: the
 * separator and volume syntax, the well-known folder display names, and the extension
 * policy. This era's extension policy is the interesting one — **the classic Mac had
 * no extensions at all.** A file's type was carried in its four-character `typeCode`
 * and `creatorCode`, not in its name, so `Letter.txt` displays as `Letter` and the FS
 * keeps the stored name untouched. That is the same shape of lossy display the 3.1
 * codec performs with 8.3, arrived at from the opposite direction.
 *
 * Two syntax details are authentic rather than invented, and both are in `parse`:
 * a **leading colon means relative** to the current folder, and **`::` means the
 * parent**. That is how the classic Mac spelled a relative path, and it is why a
 * bare `Documents` and a leading-colon `:Documents` are not the same input.
 *
 * Unlike the 3.1 codec there is no length coercion. MFS, the filesystem System 1
 * shipped with, allowed names far longer than anything the FS layer will accept, so
 * there is nothing to truncate — inventing the later 31-character HFS limit here
 * would be borrowing a constraint from a filesystem this era did not have.
 */

import type { FsApi, FsNode, NodeId, PathCodec, WellKnown } from '../../core/fs/types.js'
import { isDir } from '../../core/fs/types.js'

/**
 * The classic Mac's names for the folders the system knows by role.
 *
 * `system` is `System Folder` — two words, capital F, which is what the volume
 * actually contained. There is no Recycle Bin and no Program Files; the Trash was an
 * icon on the desktop and applications simply sat on the volume, so `applications`
 * gets the plain English word rather than a system-imposed name.
 */
const DISPLAY_NAMES: Partial<Record<WellKnown, string>> = {
  documents: 'Documents',
  pictures: 'Pictures',
  desktop: 'Desktop',
  trash: 'Trash',
  applications: 'Applications',
  system: 'System Folder',
}

const VOLUME = 'Macintosh HD'
const SEP = ':'

/**
 * Strips a trailing extension for display.
 *
 * Deliberately conservative: only a short alphanumeric run after the last dot is
 * treated as an extension, so `Notes.1984` and `Read Me` survive intact while
 * `Letter.txt` shows as `Letter`. The coercion is display-only and `parse` accepts
 * both forms, which is the same rule the 3.1 codec follows for its 8.3 names.
 */
export function hideExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return name
  const ext = name.slice(dot + 1)
  if (!/^[A-Za-z][A-Za-z0-9]{0,4}$/.test(ext)) return name
  return name.slice(0, dot)
}

export function createSystem1Codec(fs: FsApi): PathCodec {
  return {
    separator: SEP,

    volumeName(): string {
      return VOLUME
    },

    displayName(node: FsNode): string {
      if (node.wellKnown !== undefined) {
        const override = DISPLAY_NAMES[node.wellKnown]
        if (override !== undefined) return override
      }
      return hideExtension(node.name)
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
      if (parts.length === 0) return `${VOLUME}${SEP}`
      // A trailing colon marks a folder, which is how the classic Mac wrote one.
      return `${VOLUME}${SEP}${parts.join(SEP)}${last && isDir(last) ? SEP : ''}`
    },

    async parse(input: string, cwd: NodeId): Promise<NodeId | null> {
      const text = input.trim()
      if (text.length === 0) return cwd

      let cursor: NodeId = cwd
      let body = text
      if (text.startsWith(`${VOLUME}${SEP}`)) {
        cursor = fs.root()
        body = text.slice(VOLUME.length + 1)
      } else if (text.startsWith(SEP)) {
        // A leading colon is the classic Mac's relative marker: stay at cwd and let
        // the empty first component fall through below.
        body = text.slice(1)
        // `::name` — two colons at the start — is the parent, so the empty component
        // that produces is handled by the `..` equivalent in the loop.
        if (body.startsWith(SEP)) body = `..${body}`
      } else if (text.includes(SEP)) {
        // `Something:else` with an unknown volume is not a path in this era.
        const volume = text.slice(0, text.indexOf(SEP))
        if (volume !== VOLUME) return null
        cursor = fs.root()
        body = text.slice(volume.length + 1)
      }

      /*
       * A *trailing* separator is not an empty component.
       *
       * The era's parent syntax is a colon *between* components — `::name` is the
       * parent, `:::name` the grandparent — and a folder path ends in a colon by
       * construction: `format` emits `Macintosh HD:Documents:` because that is how the
       * classic Mac wrote a folder. Reading that last colon as another step up made
       * `format` and `parse` disagree about the same folder, so the path the prompt
       * printed resolved to the volume root when it was typed back. Four of the six
       * codecs round-trip; these two did not, and every consumer wants them to.
       *
       * It also fixes the bare parent forms, which counted one level too many: `::`
       * split to two empty components and reached the grandparent.
       */
      if (body.endsWith(SEP)) body = body.slice(0, -SEP.length)

      for (const raw of body.split(SEP)) {
        // An empty component between colons is another step up, which is how `:::`
        // reaches a grandparent.
        if (raw.length === 0) {
          const node = await fs.stat(cursor)
          cursor = node.parent ?? fs.root()
          continue
        }
        if (raw === '..') {
          const node = await fs.stat(cursor)
          cursor = node.parent ?? fs.root()
          continue
        }
        const children = await fs.list(cursor)
        const wanted = raw.toLowerCase()
        // Stored name first, then this era's display form, so a path read off the
        // screen can be typed back even though the display drops the extension.
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
 * The classic Mac's collision decoration.
 *
 * The Finder appended ` copy`, then ` copy 2`, ` copy 3` — never XP's ` (2)`. The
 * suffix goes on the *stored* name, so it survives into every other era's display
 * exactly as the Finder left it.
 */
export function system1NameDecorator(base: string, attempt: number): string {
  return attempt <= 1 ? `${base} copy` : `${base} copy ${attempt}`
}
