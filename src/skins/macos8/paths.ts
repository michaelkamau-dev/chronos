/**
 * Mac OS 8 path codec.
 *
 * `Macintosh HD:Documents:Letter` over exactly the same stored nodes that XP renders
 * as `C:\My Documents\Letter.txt` and Windows 3.1 renders as `C:\DOCS\LETTER.TXT`.
 * Nothing about the node changes; the presentation is the only thing that differs.
 *
 * Three things vary and all three live here, as they do for every codec: the
 * separator and volume syntax, the well-known folder display names, and the
 * extension policy. Classic Mac is the interesting case on all three counts.
 *
 * **The separator is a colon, and that has a consequence no other codec has.** HFS
 * allowed `/` in a file name and forbade `:`, which is the exact inverse of every
 * Unix-descended system. So this codec's illegal character is the one the others use
 * as a separator, and a name containing a colon cannot be represented at all — which
 * is why `displayName` substitutes rather than truncating.
 *
 * **A leading colon means relative, not absolute** — the opposite of a leading `/`.
 * `:Documents:Letter` is relative to the current folder; `Documents:Letter` with no
 * colon at all is a bare name resolved in the current folder; and a path is absolute
 * only when it starts with a volume name. There is no "root" to lead with, because
 * classic Mac had no single root: the volume *is* the top.
 *
 * **Extensions are hidden, and type/creator codes carry the type instead.** The FS
 * already stores `typeCode`/`creatorCode` per §3, which exists for exactly this
 * era — so `Letter.txt` displays as `Letter` and its type comes from `TEXT`/`ttxt`
 * rather than from the name. `parse` accepts both forms so a path read off the screen
 * can be typed back, the same rule the other codecs follow.
 */

import type { FsApi, FsNode, NodeId, PathCodec, WellKnown } from '../../core/fs/types.js'
import { isDir } from '../../core/fs/types.js'

/**
 * Mac OS 8's names for the folders the system knows by role.
 *
 * `Trash` rather than `Recycle Bin`, and it is a real folder on the desktop rather
 * than a shell namespace object. `System Folder` is two words and capitalised that
 * way; `Applications` had no special status in OS 8 but the folder existed by
 * convention, and the well-known role maps onto it cleanly.
 */
const DISPLAY_NAMES: Partial<Record<WellKnown, string>> = {
  documents: 'Documents',
  pictures: 'Pictures',
  desktop: 'Desktop Folder',
  trash: 'Trash',
  applications: 'Applications',
  system: 'System Folder',
}

const VOLUME = 'Macintosh HD'
const SEP = ':'

/**
 * Extensions the era hid.
 *
 * Classic Mac did not use extensions to determine type — the Finder read the
 * four-character `typeCode` — so a name that happens to end in a known extension
 * displays without it. The list is deliberately closed rather than "strip anything
 * after the last dot": `Mac OS 8.1` is a legitimate name and stripping `.1` from it
 * would be wrong, which is exactly the trap a generic rule falls into.
 */
const HIDDEN_EXTENSIONS = new Set([
  'txt', 'text', 'rtf', 'doc', 'md',
  'png', 'jpg', 'jpeg', 'gif', 'pict', 'pct', 'bmp', 'tiff', 'tif',
  'aiff', 'aif', 'wav', 'mp3', 'au', 'snd',
  'html', 'htm', 'json', 'xml', 'css', 'js', 'ts',
  'sit', 'hqx', 'bin', 'zip', 'gz',
])

/**
 * Strips a hidden extension for display.
 *
 * Exported because the name decorator has to append its suffix to the *stem* rather
 * than after the extension, and both need the same notion of where the stem ends.
 */
export function hideExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot <= 0 || dot === name.length - 1) return name
  const ext = name.slice(dot + 1).toLowerCase()
  return HIDDEN_EXTENSIONS.has(ext) ? name.slice(0, dot) : name
}

/**
 * A colon cannot appear in an HFS name, so a stored name carrying one is displayed
 * with a hyphen in its place.
 *
 * This is the one lossy step in this codec and it is much narrower than the 8.3
 * coercion Windows 3.1 needs. It matters because the FS is shared: a file created in
 * a Unix-pathed era can legally be called `12:30 notes`, and this era has to show it
 * something. `parse` matches the stored name first, so the substitution never
 * prevents the file being reached.
 */
function colonSafe(name: string): string {
  return name.includes(SEP) ? name.split(SEP).join('-') : name
}

export function createMacos8Codec(fs: FsApi): PathCodec {
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
      // Folders never carried extensions to hide, but they can carry a colon.
      if (isDir(node)) return colonSafe(node.name)
      return colonSafe(hideExtension(node.name))
    },

    format(chain: readonly FsNode[]): string {
      const parts: string[] = []
      for (let i = 0; i < chain.length; i++) {
        const node = chain[i]
        if (!node) continue
        // The volume replaces the root as the first component rather than being a
        // prefix in front of it — `Macintosh HD:Documents`, not `Macintosh HD::…`.
        if (i === 0 && node.wellKnown === 'root') {
          parts.push(VOLUME)
          continue
        }
        parts.push(this.displayName(node))
      }
      if (parts.length === 0) return `${VOLUME}${SEP}`
      const last = chain[chain.length - 1]
      // A trailing colon marks a folder, and the volume on its own always takes one.
      const trailing = parts.length === 1 || (last && isDir(last)) ? SEP : ''
      return parts.join(SEP) + trailing
    },

    async parse(input: string, cwd: NodeId): Promise<NodeId | null> {
      const text = input.trim()
      if (text.length === 0) return cwd

      let cursor: NodeId
      let body: string

      if (text === VOLUME || text === `${VOLUME}${SEP}`) return fs.root()

      if (text.startsWith(`${VOLUME}${SEP}`)) {
        cursor = fs.root()
        body = text.slice(VOLUME.length + 1)
      } else if (text.startsWith(SEP)) {
        // A LEADING colon is relative on classic Mac — the inverse of `/`. Getting
        // this backwards would make every relative path resolve from the volume.
        cursor = cwd
        body = text.slice(1)
      } else if (text.includes(SEP)) {
        // Contains a colon but does not start with the volume: a path relative to
        // the current folder, e.g. `Documents:Letter`.
        cursor = cwd
        body = text
      } else {
        cursor = cwd
        body = text
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

      for (const part of body.split(SEP)) {
        // An empty component from `::` means "up one", the era's parent syntax.
        if (part.length === 0) {
          const node = await fs.stat(cursor)
          cursor = node.parent ?? fs.root()
          continue
        }
        const children = await fs.list(cursor)
        const wanted = part.toLowerCase()
        // Stored name first, then the era's display form. Matching the display form
        // is what lets a user type back `Letter` for a file stored as `Letter.txt`.
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
 * The Finder's collision decoration.
 *
 * Classic Mac appended ` copy`, then ` copy 2`, ` copy 3` — not XP's ` (2)`. The
 * suffix goes on the stem so a stored `Letter.txt` becomes `Letter copy.txt` and
 * still displays as `Letter copy`, which is what the era showed.
 */
export function macos8NameDecorator(base: string, attempt: number): string {
  const dot = base.lastIndexOf('.')
  const hasExt = dot > 0 && dot < base.length - 1
  const stem = hasExt ? base.slice(0, dot) : base
  const ext = hasExt ? base.slice(dot) : ''
  const suffix = attempt <= 1 ? ' copy' : ` copy ${attempt}`
  return `${stem}${suffix}${ext}`
}
