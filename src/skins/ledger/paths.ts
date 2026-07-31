/**
 * Ledger path codec — paths are ledger entries.
 *
 * §8: "**Paths are ledger entries.** Every node carries a stable entry number, so the
 * same file the other five eras call `Letter` is `#04412 letter`, and the hierarchical
 * form is `you/documents/#04412 letter`. The terminal accepts either."
 *
 * Four things follow from those three sentences, and all four are stated there rather
 * than chosen here:
 *
 * - **The entry number is `FsNodeBase.ordinal`**, which already exists and whose own
 *   doc comment already says why: "Ledger addresses files by entry number, so the
 *   ordinal is kept alongside — it is best-effort under concurrent tabs and must never
 *   carry behaviour." So this era needs no filesystem change at all. It is the only
 *   part of Ledger that was designed before Ledger.
 * - **Five digits, zero-padded.** §8's example is `#04412`, which fixes both.
 * - **Lower case.** §8 writes `#04412 letter` and `you/documents`, not `Letter` or
 *   `Documents`. An OS that prints everything on a receipt has one case, and it is not
 *   the one a person chose.
 * - **`parse` accepts either form**, stated outright. So a bare `#04412` resolves
 *   anywhere in the tree — which is what an entry number is *for*: a ledger reference
 *   is absolute by construction, and having to know a file's folder in order to name
 *   it by its account number would defeat the idea.
 *
 * The extension is kept. This era has no reason to hide it — that was the classic
 * Mac's type/creator convention — and a disclosure-minded system does not drop
 * information from a name it prints.
 */

import type { FsApi, FsNode, NodeId, PathCodec, WellKnown } from '../../core/fs/types.js'
import { isDir } from '../../core/fs/types.js'

/**
 * Well-known folders, in this era's own words.
 *
 * `you` rather than `Home` or `Users`, because §8's example path is
 * `you/documents/#04412 letter`. The rest follow its case.
 */
const DISPLAY_NAMES: Partial<Record<WellKnown, string>> = {
  root: 'you',
  documents: 'documents',
  pictures: 'pictures',
  desktop: 'desktop',
  trash: 'settled',
  applications: 'tools',
  system: 'system',
}

const SEP = '/'

/** `#04412`. Five digits, zero-padded, from §8's own example. */
export function entryNumber(node: FsNode): string {
  return `#${String(node.ordinal).padStart(5, '0')}`
}

/**
 * `#04412 letter` — the entry number, a space, then the name in lower case.
 *
 * A well-known folder shows its role name with no entry number: `you/documents`, per
 * §8's example, which numbers the file and not the folders above it.
 */
export function entryLabel(node: FsNode): string {
  if (node.wellKnown !== undefined) {
    const override = DISPLAY_NAMES[node.wellKnown]
    if (override !== undefined) return override
  }
  return `${entryNumber(node)} ${node.name.toLowerCase()}`
}

export function createLedgerCodec(fs: FsApi): PathCodec {
  return {
    separator: SEP,

    /**
     * There is no volume name.
     *
     * Every other era has one because every other era had a disk you could hold —
     * `C:`, `Macintosh HD`, `/`. A machine that rations joules and addresses files by
     * account number has no reason to name the medium, and inventing a brand here
     * would be exactly the "concept-render default" `CLAUDE.md` warns against. The
     * root's own display name, `you`, is what a path starts with.
     */
    volumeName(): string {
      return DISPLAY_NAMES.root ?? 'you'
    },

    displayName(node: FsNode): string {
      return entryLabel(node)
    },

    format(chain: readonly FsNode[]): string {
      const parts: string[] = []
      for (const node of chain) {
        if (!node) continue
        parts.push(this.displayName(node))
      }
      if (parts.length === 0) return this.volumeName()
      const last = chain[chain.length - 1]
      // A folder keeps its trailing separator, which is how a ledger marks an account
      // that has entries under it rather than being one.
      return parts.join(SEP) + (last && isDir(last) ? SEP : '')
    },

    async parse(input: string, cwd: NodeId): Promise<NodeId | null> {
      const text = input.trim()
      if (text.length === 0) return cwd

      // The entry-number form, accepted anywhere in the tree. §8: "The terminal
      // accepts either." An account number that only worked from the right folder
      // would not be an account number.
      const bare = /^#?(\d{1,9})$/.exec(text)
      if (bare) {
        const wanted = Number(bare[1])
        return await findByOrdinal(fs, fs.root(), wanted)
      }

      let cursor: NodeId = cwd
      let body = text
      const rootName = this.volumeName()
      if (text === rootName || text === `${rootName}${SEP}`) return fs.root()
      if (text.startsWith(`${rootName}${SEP}`)) {
        cursor = fs.root()
        body = text.slice(rootName.length + 1)
      } else if (text.startsWith(SEP)) {
        cursor = fs.root()
        body = text.slice(1)
      }

      for (const raw of body.split(SEP)) {
        if (raw.length === 0) continue
        if (raw === '..') {
          const node = await fs.stat(cursor)
          cursor = node.parent ?? fs.root()
          continue
        }
        if (raw === '.') continue

        // A component may itself be an entry number, so `you/#04412` works and so does
        // the full `#04412 letter` — matching on the number alone when one is present,
        // because the name after it is decoration a person may have mistyped.
        const numbered = /^#(\d{1,9})\b/.exec(raw)
        const children = await fs.list(cursor)
        if (numbered) {
          const wanted = Number(numbered[1])
          const hit = children.find((c) => c.ordinal === wanted)
          if (!hit) return null
          cursor = hit.id
          continue
        }

        const wanted = raw.toLowerCase()
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

/** Depth-first search for an entry number, used by the bare `#04412` form. */
async function findByOrdinal(fs: FsApi, from: NodeId, ordinal: number): Promise<NodeId | null> {
  const node = await fs.stat(from)
  if (node.ordinal === ordinal) return node.id
  if (!isDir(node)) return null
  for (const child of await fs.list(from)) {
    if (child.ordinal === ordinal) return child.id
    if (isDir(child)) {
      const hit = await findByOrdinal(fs, child.id, ordinal)
      if (hit) return hit
    }
  }
  return null
}

/**
 * The collision decoration.
 *
 * Not ` (2)` and not ` copy`. A ledger that already gives every entry a unique number
 * has no collision to decorate — two files may share a name because they can never
 * share an account. But the FS layer needs a distinct *stored* name, and the stored
 * name is what the other five eras display, so the suffix has to be something they can
 * all render: ` 2`, plain and unadorned, which is also what a printed list would do.
 *
 * **The suffix goes before the extension**, which the first version of this function
 * got wrong and a fidelity test caught. `Report.txt 2` is a name whose extension is no
 * longer at the end, and the extension is not this era's to break: Windows XP reads it
 * to pick an icon, Windows 3.1 coerces it to 8.3, and the classic Mac codecs hide it —
 * all from the same stored string. The era owns the decoration; it does not own the
 * shape of the name.
 */
export function ledgerNameDecorator(base: string, attempt: number): string {
  const dot = base.lastIndexOf('.')
  if (dot > 0) return `${base.slice(0, dot)} ${attempt + 1}${base.slice(dot)}`
  return `${base} ${attempt + 1}`
}
