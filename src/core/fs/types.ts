/**
 * The virtual filesystem schema.
 *
 * This is the spine of the whole project: one stored tree that six eras render
 * with different path syntax, different display names and different metadata
 * conventions, over byte-identical content.
 *
 * Two rules shape the schema:
 *
 * - **Nothing era-specific is stored.** A node has a canonical name and a
 *   `wellKnown` tag; whether it renders as `Documents` or `My Documents`, with or
 *   without a file extension, is the active skin's `PathCodec` decision. Storing
 *   the era's spelling would make the cross-era spine a lie.
 * - **Metadata and content are separate records.** Listing a directory of 200
 *   files must not pull 200 PNGs into memory, so content lives under its own key
 *   and is fetched only when read.
 */

export type NodeId = string & { readonly __nodeBrand: unique symbol }

export function asNodeId(s: string): NodeId {
  return s as NodeId
}

/**
 * Folders the system knows about by role rather than by name. The skin maps these
 * to era-correct display names — the same node is `Documents` on a Mac and
 * `My Documents` under Windows XP.
 */
export type WellKnown =
  | 'root'
  | 'documents'
  | 'pictures'
  | 'desktop'
  | 'trash'
  | 'system'
  | 'applications'

export type NodeKind = 'dir' | 'file'

export interface FsNodeBase {
  readonly id: NodeId
  parent: NodeId | null
  /** Canonical name. No era decoration, no forced case, no 8.3 truncation. */
  name: string
  kind: NodeKind
  created: number
  modified: number
  accessed: number
  /**
   * Display-only monotonic entry number.
   *
   * Ids are UUIDs so two tabs writing at once cannot collide, which a shared
   * counter could not guarantee. Ledger addresses files by entry number, so the
   * ordinal is kept alongside — it is best-effort under concurrent tabs and must
   * never carry behaviour.
   */
  ordinal: number
  wellKnown?: WellKnown
  locked: boolean
  /** Where this node lived before it was trashed, so restore is exact. */
  trashedFrom?: NodeId
  trashedAt?: number
}

export interface FsDir extends FsNodeBase {
  kind: 'dir'
  /** Ordered, so a skin can present insertion order where its era did. */
  childIds: NodeId[]
}

export interface FsFile extends FsNodeBase {
  kind: 'file'
  size: number
  /** Canonical MIME type. Extension policy is the skin's business. */
  mime: string
  /** Classic Mac four-character OSType, surfaced in the Properties dialog. */
  typeCode?: string
  creatorCode?: string
}

export type FsNode = FsDir | FsFile

export function isDir(node: FsNode): node is FsDir {
  return node.kind === 'dir'
}

export function isFile(node: FsNode): node is FsFile {
  return node.kind === 'file'
}

export interface FsMeta {
  schemaVersion: number
  rootId: NodeId
  trashId: NodeId
  nextOrdinal: number
}

export type FsEventType =
  | 'created'
  | 'removed'
  | 'renamed'
  | 'moved'
  | 'changed'
  | 'trashed'
  | 'restored'

export interface FsEvent {
  type: FsEventType
  id: NodeId
  /** The directory affected. Both parents are notified on a move. */
  parent: NodeId | null
  /** Set when the change arrived from another tab rather than this one. */
  remote: boolean
}

export type Unsubscribe = () => void

/**
 * How a node's chain of ancestors renders as a path string, and how a typed path
 * resolves back to a node.
 *
 * Every path string anywhere in Chronos comes from here. The filesystem API is
 * entirely id-based, which is what lets `HD:Documents:Letter` and
 * `C:\My Documents\Letter.txt` be two views of one stored record.
 */
export interface PathCodec {
  /** `chain` runs root-first and ends at the node being formatted. */
  format(chain: readonly FsNode[]): string
  /** Resolve a typed path. `cwd` anchors relative paths. */
  parse(input: string, cwd: NodeId): Promise<NodeId | null>
  /** Era-correct display name: well-known folder naming plus extension policy. */
  displayName(node: FsNode): string
  /** The volume as this era names it — `Macintosh HD`, `C:`, `/`. */
  volumeName(): string
  /** Separator between path components, for callers that need to join manually. */
  separator: string
}

export interface FsApi {
  root(): NodeId
  trash(): NodeId
  stat(id: NodeId): Promise<FsNode>
  list(dir: NodeId): Promise<FsNode[]>
  chain(id: NodeId): Promise<FsNode[]>
  read(file: NodeId): Promise<Blob>
  readBytes(file: NodeId): Promise<ArrayBuffer>
  readText(file: NodeId): Promise<string>
  write(file: NodeId, data: Blob | string | ArrayBuffer): Promise<void>
  createFile(
    parent: NodeId,
    name: string,
    data?: Blob | string | ArrayBuffer,
    opts?: { mime?: string; typeCode?: string; creatorCode?: string },
  ): Promise<NodeId>
  createDir(parent: NodeId, name: string): Promise<NodeId>
  rename(id: NodeId, name: string): Promise<void>
  move(id: NodeId, newParent: NodeId): Promise<void>
  moveToTrash(id: NodeId): Promise<void>
  restoreFromTrash(id: NodeId): Promise<void>
  purge(id: NodeId): Promise<void>
  exists(parent: NodeId, name: string): Promise<boolean>
  suggestName(parent: NodeId, name: string, decorate: NameDecorator): Promise<string>
  watch(dir: NodeId, cb: (e: FsEvent) => void): Unsubscribe
  watchAll(cb: (e: FsEvent) => void): Unsubscribe
}

/**
 * Produces the nth alternative for a colliding name. Supplied by the caller
 * because the convention is era-specific — classic Mac appended ` copy`, Windows
 * appended ` (2)` — and the filesystem layer must not know which era is running.
 */
export type NameDecorator = (base: string, attempt: number) => string
