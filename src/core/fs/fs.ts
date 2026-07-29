/**
 * The filesystem.
 *
 * The single source of truth. Apps hold no duplicate state: they read from here
 * and re-read on the change events `watch()` delivers. Two windows open on the
 * same folder stay in step because neither one owns the folder — that is the
 * invariant, and it is demonstrable rather than asserted.
 *
 * Every mutation that touches more than one record batches those records into one
 * `writeMany`, so a crash cannot leave a directory entry pointing at a node that
 * was never written. Content is written before the metadata that references it,
 * which means the only possible inconsistency is an unreferenced blob — and the
 * boot-time sweep reclaims those.
 */

import { FsError, validateName } from './errors.js'
import {
  FsStore,
  blobIdFromKey,
  blobKey,
  nodeIdFromKey,
  nodeKey,
  type WriteEntry,
} from './store.js'
import { CURRENT_SCHEMA_VERSION, migrate } from './migrations.js'
import {
  isDir,
  type FsApi,
  type FsDir,
  type FsEvent,
  type FsEventType,
  type FsFile,
  type FsMeta,
  type FsNode,
  type NameDecorator,
  type NodeId,
  type Unsubscribe,
  type WellKnown,
} from './types.js'

const CHANNEL_NAME = 'chronos-fs'
const DEFAULT_MIME = 'application/octet-stream'

interface RemoteMessage {
  type: FsEventType
  id: string
  parent: string | null
  origin: string
}

/** Folders seeded on a first boot, in creation order. */
const SEED: Array<{ name: string; wellKnown: WellKnown }> = [
  { name: 'System', wellKnown: 'system' },
  { name: 'Applications', wellKnown: 'applications' },
  { name: 'Documents', wellKnown: 'documents' },
  { name: 'Pictures', wellKnown: 'pictures' },
  { name: 'Desktop', wellKnown: 'desktop' },
  { name: 'Trash', wellKnown: 'trash' },
]

export class Filesystem implements FsApi {
  private readonly store: FsStore
  private meta!: FsMeta
  private ready = false

  private readonly dirWatchers = new Map<NodeId, Set<(e: FsEvent) => void>>()
  private readonly globalWatchers = new Set<(e: FsEvent) => void>()

  private channel: BroadcastChannel | null = null
  /** Distinguishes our own broadcasts from another tab's. */
  private readonly originId = crypto.randomUUID()

  /** Reused so a burst of mutations does not allocate an event per notification. */
  private readonly event: FsEvent = {
    type: 'created',
    id: '' as NodeId,
    parent: null,
    remote: false,
  }

  constructor(store: FsStore = new FsStore()) {
    this.store = store
  }

  /**
   * Opens the filesystem: runs migrations, seeds a first boot, reclaims orphaned
   * blobs, and joins the cross-tab channel.
   */
  async open(): Promise<void> {
    if (this.ready) return
    const existing = await this.store.readMeta()
    this.meta = existing ? await migrate(this.store, existing) : await this.seed()
    await this.sweepOrphanBlobs()
    this.joinChannel()
    this.ready = true
  }

  /**
   * Re-runs migration and the orphan sweep against the stored data.
   *
   * Used after a factory reset and, in later phases, after an era switch — the
   * filesystem outlives the shell that renders it, so reopening has to be a
   * first-class operation rather than a page reload. Watchers survive: they are
   * keyed by node id, and node ids do not change across a reopen.
   */
  async reopen(): Promise<void> {
    this.ready = false
    const existing = await this.store.readMeta()
    this.meta = existing ? await migrate(this.store, existing) : await this.seed()
    await this.sweepOrphanBlobs()
    this.ready = true
  }

  close(): void {
    this.channel?.close()
    this.channel = null
    this.dirWatchers.clear()
    this.globalWatchers.clear()
    this.ready = false
  }

  /**
   * Live watcher count.
   *
   * A diagnostic with a real job: a view that forgets to unsubscribe keeps
   * re-rendering into detached DOM on every change, and this is how that leak is
   * observed rather than guessed at.
   */
  watcherCount(): number {
    let total = this.globalWatchers.size
    for (const set of this.dirWatchers.values()) total += set.size
    return total
  }

  /** Stored content records. Pairs with `watcherCount` as a disk diagnostic. */
  async blobCount(): Promise<number> {
    const keys = await this.store.allKeys()
    let count = 0
    for (const key of keys) if (blobIdFromKey(key) !== null) count++
    return count
  }

  root(): NodeId {
    this.assertReady()
    return this.meta.rootId
  }

  trash(): NodeId {
    this.assertReady()
    return this.meta.trashId
  }

  schemaVersion(): number {
    this.assertReady()
    return this.meta.schemaVersion
  }

  /**
   * Advisory storage headroom. `null` when the browser declines to report.
   *
   * Advisory because Chrome's quota is a fraction of free disk and moves; the
   * authoritative signal is a failed write, which the store turns into a
   * `quota-exceeded` FsError for the era's disk-full dialog to act on.
   */
  async storageHeadroom(): Promise<{ usage: number; quota: number } | null> {
    return this.store.headroom()
  }

  /**
   * Destroys everything and reseeds a fresh tree.
   *
   * This is the factory reset, and the test suite's way of starting from a known
   * state. It goes through the same seed path as a first boot so the two cannot
   * drift apart.
   */
  async wipeAndReseed(): Promise<void> {
    await this.store.wipe()
    this.meta = await this.seed()
    this.ready = true
    this.notify('changed', this.meta.rootId, null)
  }

  // -------------------------------------------------------------------- reads

  async stat(id: NodeId): Promise<FsNode> {
    this.assertReady()
    const node = await this.store.readNode(id)
    if (!node) throw new FsError('not-found', `No node ${id}`)
    return node
  }

  async list(dir: NodeId): Promise<FsNode[]> {
    const node = await this.stat(dir)
    if (!isDir(node)) throw new FsError('not-a-directory', `${node.name} is not a directory`)
    if (node.childIds.length === 0) return []
    const children = await this.store.readNodes(node.childIds)
    const out: FsNode[] = []
    for (let i = 0; i < children.length; i++) {
      const child = children[i]
      // A missing child would mean a torn write; the batched writes make that
      // impossible, so skipping is a defensive measure rather than a routine path.
      if (child) out.push(child)
    }
    return out
  }

  /** Root-first ancestor chain ending at `id`. The path codec's input. */
  async chain(id: NodeId): Promise<FsNode[]> {
    this.assertReady()
    const out: FsNode[] = []
    let cursor: NodeId | null = id
    const seen = new Set<NodeId>()
    while (cursor !== null) {
      if (seen.has(cursor)) throw new FsError('cycle', 'The node chain contains a cycle')
      seen.add(cursor)
      const node = await this.stat(cursor)
      out.push(node)
      cursor = node.parent
    }
    out.reverse()
    return out
  }

  async read(file: NodeId): Promise<Blob> {
    const node = await this.stat(file)
    if (isDir(node)) throw new FsError('not-a-file', `${node.name} is a directory`)
    const blob = await this.store.readBlob(file)
    if (!blob) throw new FsError('corrupt', `Content for ${node.name} is missing`)
    await this.touchAccessed(node)
    return blob
  }

  async readBytes(file: NodeId): Promise<ArrayBuffer> {
    return (await this.read(file)).arrayBuffer()
  }

  async readText(file: NodeId): Promise<string> {
    return (await this.read(file)).text()
  }

  async exists(parent: NodeId, name: string): Promise<boolean> {
    const siblings = await this.list(parent)
    return siblings.some((s) => s.name === name)
  }

  /**
   * A non-colliding name, decorated by the caller's era convention.
   *
   * The filesystem enforces uniqueness but does not know how an era spells the
   * alternative — classic Mac appended ` copy`, Windows ` (2)` — so the decorator
   * comes in from the skin layer.
   */
  async suggestName(parent: NodeId, name: string, decorate: NameDecorator): Promise<string> {
    const siblings = new Set((await this.list(parent)).map((s) => s.name))
    if (!siblings.has(name)) return name
    for (let attempt = 1; attempt < 1000; attempt++) {
      const candidate = decorate(name, attempt)
      if (!siblings.has(candidate)) return candidate
    }
    throw new FsError('name-conflict', `Could not find a free name for "${name}"`)
  }

  // ---------------------------------------------------------------- mutations

  async createDir(parent: NodeId, name: string): Promise<NodeId> {
    validateName(name)
    const parentNode = await this.requireDir(parent)
    await this.assertNameFree(parentNode, name)

    const now = Date.now()
    const id = crypto.randomUUID() as NodeId
    const dir: FsDir = {
      id,
      parent,
      name,
      kind: 'dir',
      created: now,
      modified: now,
      accessed: now,
      ordinal: this.takeOrdinal(),
      locked: false,
      childIds: [],
    }
    parentNode.childIds = [...parentNode.childIds, id]
    parentNode.modified = now

    await this.store.writeMany([
      [nodeKey(id), dir],
      [nodeKey(parent), parentNode],
      ...this.metaEntry(),
    ])
    this.notify('created', id, parent)
    return id
  }

  async createFile(
    parent: NodeId,
    name: string,
    data: Blob | string | ArrayBuffer = '',
    opts: { mime?: string; typeCode?: string; creatorCode?: string } = {},
  ): Promise<NodeId> {
    validateName(name)
    const parentNode = await this.requireDir(parent)
    await this.assertNameFree(parentNode, name)

    const blob = toBlob(data, opts.mime)
    const now = Date.now()
    const id = crypto.randomUUID() as NodeId
    const file: FsFile = {
      id,
      parent,
      name,
      kind: 'file',
      created: now,
      modified: now,
      accessed: now,
      ordinal: this.takeOrdinal(),
      locked: false,
      size: blob.size,
      mime: blob.type || opts.mime || DEFAULT_MIME,
      ...(opts.typeCode !== undefined ? { typeCode: opts.typeCode } : {}),
      ...(opts.creatorCode !== undefined ? { creatorCode: opts.creatorCode } : {}),
    }

    // Content first. If this succeeds and the metadata write does not, the result
    // is an unreferenced blob that the boot sweep reclaims — never a directory
    // entry pointing at content that was never stored.
    await this.store.writeMany([[blobKey(id), blob]])

    parentNode.childIds = [...parentNode.childIds, id]
    parentNode.modified = now
    await this.store.writeMany([
      [nodeKey(id), file],
      [nodeKey(parent), parentNode],
      ...this.metaEntry(),
    ])
    this.notify('created', id, parent)
    return id
  }

  async write(file: NodeId, data: Blob | string | ArrayBuffer): Promise<void> {
    const node = await this.stat(file)
    if (isDir(node)) throw new FsError('not-a-file', `${node.name} is a directory`)
    if (node.locked) throw new FsError('locked', `${node.name} is locked`)

    const blob = toBlob(data, node.mime)
    const next: FsFile = {
      ...node,
      size: blob.size,
      mime: blob.type || node.mime,
      modified: Date.now(),
    }
    await this.store.writeMany([
      [blobKey(file), blob],
      [nodeKey(file), next],
    ])
    this.notify('changed', file, node.parent)
  }

  async rename(id: NodeId, name: string): Promise<void> {
    validateName(name)
    const node = await this.stat(id)
    if (node.locked) throw new FsError('locked', `${node.name} is locked`)
    if (node.name === name) return
    if (node.parent !== null) {
      const parentNode = await this.requireDir(node.parent)
      await this.assertNameFree(parentNode, name, id)
    }
    await this.store.writeMany([[nodeKey(id), { ...node, name, modified: Date.now() }]])
    this.notify('renamed', id, node.parent)
  }

  async move(id: NodeId, newParent: NodeId): Promise<void> {
    const node = await this.stat(id)
    if (node.locked) throw new FsError('locked', `${node.name} is locked`)
    if (node.parent === newParent) return
    if (id === newParent) throw new FsError('cycle', 'A node cannot contain itself')

    const target = await this.requireDir(newParent)
    // Moving a directory into its own subtree would detach the whole branch.
    if (isDir(node)) {
      const targetChain = await this.chain(newParent)
      if (targetChain.some((a) => a.id === id)) {
        throw new FsError('cycle', `Cannot move ${node.name} into itself`)
      }
    }
    await this.assertNameFree(target, node.name, id)

    const now = Date.now()
    const writes: WriteEntry[] = []
    const oldParentId = node.parent
    if (oldParentId !== null) {
      const oldParent = await this.requireDir(oldParentId)
      oldParent.childIds = oldParent.childIds.filter((c) => c !== id)
      oldParent.modified = now
      writes.push([nodeKey(oldParentId), oldParent])
    }
    target.childIds = [...target.childIds, id]
    target.modified = now
    writes.push([nodeKey(newParent), target])

    const moved = { ...node, parent: newParent, modified: now }
    delete (moved as { trashedFrom?: NodeId }).trashedFrom
    delete (moved as { trashedAt?: number }).trashedAt
    writes.push([nodeKey(id), moved])

    await this.store.writeMany(writes)
    // Both directories changed, so both sets of watchers have to hear about it.
    this.notify('moved', id, oldParentId)
    if (oldParentId !== newParent) this.notify('moved', id, newParent)
  }

  /** Move to the trash folder, remembering where it came from. */
  async moveToTrash(id: NodeId): Promise<void> {
    const node = await this.stat(id)
    if (node.wellKnown !== undefined) {
      throw new FsError('locked', `${node.name} is a system folder`)
    }
    const from = node.parent
    await this.move(id, this.meta.trashId)
    const moved = await this.stat(id)
    await this.store.writeMany([
      [
        nodeKey(id),
        { ...moved, ...(from !== null ? { trashedFrom: from } : {}), trashedAt: Date.now() },
      ],
    ])
    this.notify('trashed', id, this.meta.trashId)
  }

  async restoreFromTrash(id: NodeId): Promise<void> {
    const node = await this.stat(id)
    const target = node.trashedFrom ?? this.meta.rootId
    // The original folder may itself have been deleted since.
    const exists = await this.store.readNode(target)
    await this.move(id, exists ? target : this.meta.rootId)
    this.notify('restored', id, exists ? target : this.meta.rootId)
  }

  /** Permanent deletion, including every descendant and its content. */
  async purge(id: NodeId): Promise<void> {
    const node = await this.stat(id)
    if (node.wellKnown !== undefined) {
      throw new FsError('locked', `${node.name} is a system folder`)
    }
    if (node.locked) throw new FsError('locked', `${node.name} is locked`)

    const doomed: FsNode[] = []
    await this.collectSubtree(node, doomed)

    const keys: string[] = []
    for (const n of doomed) {
      keys.push(nodeKey(n.id))
      if (!isDir(n)) keys.push(blobKey(n.id))
    }

    const parentId = node.parent
    if (parentId !== null) {
      const parent = await this.requireDir(parentId)
      parent.childIds = parent.childIds.filter((c) => c !== id)
      parent.modified = Date.now()
      // Detach from the parent first: after this the subtree is unreachable, so a
      // crash mid-delete leaves orphaned records rather than a dangling entry.
      await this.store.writeMany([[nodeKey(parentId), parent]])
    }
    await this.store.deleteMany(keys)
    this.notify('removed', id, parentId)
    // A window showing one of the deleted folders is watching that folder, not
    // its parent, so notifying only the parent leaves it rendering a directory
    // that no longer exists. Every removed directory tells its own watchers.
    for (const n of doomed) {
      if (isDir(n)) this.notify('removed', n.id, n.id)
    }
  }

  // ----------------------------------------------------------------- watching

  watch(dir: NodeId, cb: (e: FsEvent) => void): Unsubscribe {
    let set = this.dirWatchers.get(dir)
    if (!set) {
      set = new Set()
      this.dirWatchers.set(dir, set)
    }
    set.add(cb)
    return () => {
      const current = this.dirWatchers.get(dir)
      if (!current) return
      current.delete(cb)
      if (current.size === 0) this.dirWatchers.delete(dir)
    }
  }

  watchAll(cb: (e: FsEvent) => void): Unsubscribe {
    this.globalWatchers.add(cb)
    return () => this.globalWatchers.delete(cb)
  }

  // ------------------------------------------------------------------ private

  private assertReady(): void {
    if (!this.ready) throw new FsError('corrupt', 'The filesystem is not open')
  }

  private async requireDir(id: NodeId): Promise<FsDir> {
    const node = await this.stat(id)
    if (!isDir(node)) throw new FsError('not-a-directory', `${node.name} is not a directory`)
    return node
  }

  private async assertNameFree(parent: FsDir, name: string, ignore?: NodeId): Promise<void> {
    const children = await this.store.readNodes(parent.childIds)
    for (const child of children) {
      if (child && child.name === name && child.id !== ignore) {
        throw new FsError('name-conflict', `"${name}" already exists in ${parent.name}`)
      }
    }
  }

  private takeOrdinal(): number {
    return this.meta.nextOrdinal++
  }

  private metaEntry(): WriteEntry[] {
    // Batched with the node write so the ordinal counter cannot advance without
    // the node that consumed it also landing.
    return [['fs:meta', this.meta]]
  }

  private async collectSubtree(node: FsNode, out: FsNode[]): Promise<void> {
    out.push(node)
    if (!isDir(node)) return
    const children = await this.store.readNodes(node.childIds)
    for (const child of children) {
      if (child) await this.collectSubtree(child, out)
    }
  }

  /**
   * Updates `accessed` without emitting a change event.
   *
   * Reading a file must not make watchers re-render — otherwise a directory
   * listing that reads thumbnails would trigger itself in a loop.
   */
  private async touchAccessed(node: FsNode): Promise<void> {
    await this.store.writeMany([[nodeKey(node.id), { ...node, accessed: Date.now() }]])
  }

  private notify(type: FsEventType, id: NodeId, parent: NodeId | null, remote = false): void {
    const e = this.event
    e.type = type
    e.id = id
    e.parent = parent
    e.remote = remote
    if (parent !== null) {
      const watchers = this.dirWatchers.get(parent)
      if (watchers) for (const cb of watchers) cb(e)
    }
    for (const cb of this.globalWatchers) cb(e)
    if (!remote) this.broadcast(type, id, parent)
  }

  /**
   * Cross-tab change notification.
   *
   * Two tabs share one IndexedDB, so without this the filesystem would be the
   * single source of truth only within a tab. Payloads carry ids, never content:
   * the receiving tab re-reads, which keeps the "no duplicate state" rule intact.
   */
  private joinChannel(): void {
    if (typeof BroadcastChannel === 'undefined') return
    this.channel = new BroadcastChannel(CHANNEL_NAME)
    this.channel.onmessage = (ev: MessageEvent<RemoteMessage>) => {
      const msg = ev.data
      if (!msg || msg.origin === this.originId) return
      this.notify(msg.type, msg.id as NodeId, (msg.parent as NodeId | null) ?? null, true)
    }
  }

  private broadcast(type: FsEventType, id: NodeId, parent: NodeId | null): void {
    this.channel?.postMessage({ type, id, parent, origin: this.originId } satisfies RemoteMessage)
  }

  private async seed(): Promise<FsMeta> {
    const now = Date.now()
    const rootId = crypto.randomUUID() as NodeId
    let ordinal = 1

    const root: FsDir = {
      id: rootId,
      parent: null,
      name: 'Chronos',
      kind: 'dir',
      created: now,
      modified: now,
      accessed: now,
      ordinal: ordinal++,
      wellKnown: 'root',
      locked: true,
      childIds: [],
    }

    const writes: WriteEntry[] = []
    let trashId: NodeId | null = null
    for (const spec of SEED) {
      const id = crypto.randomUUID() as NodeId
      if (spec.wellKnown === 'trash') trashId = id
      const dir: FsDir = {
        id,
        parent: rootId,
        name: spec.name,
        kind: 'dir',
        created: now,
        modified: now,
        accessed: now,
        ordinal: ordinal++,
        wellKnown: spec.wellKnown,
        locked: true,
        childIds: [],
      }
      root.childIds.push(id)
      writes.push([nodeKey(id), dir])
    }
    if (trashId === null) throw new FsError('corrupt', 'The seed tree has no Trash folder')

    const meta: FsMeta = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      rootId,
      trashId,
      nextOrdinal: ordinal,
    }
    writes.push([nodeKey(rootId), root])
    writes.push(['fs:meta', meta])
    // The entire initial tree in one transaction: a first boot either produces a
    // complete filesystem or none at all.
    await this.store.writeMany(writes)
    return meta
  }

  /**
   * Reclaims content whose node no longer exists.
   *
   * The only inconsistency the write ordering permits, and the reason it is the
   * one permitted: an orphaned blob wastes space and nothing else.
   */
  private async sweepOrphanBlobs(): Promise<number> {
    const keys = await this.store.allKeys()
    const nodeIds = new Set<string>()
    const blobIds: NodeId[] = []
    for (const key of keys) {
      const n = nodeIdFromKey(key)
      if (n !== null) {
        nodeIds.add(n)
        continue
      }
      const b = blobIdFromKey(key)
      if (b !== null) blobIds.push(b)
    }
    const orphans = blobIds.filter((id) => !nodeIds.has(id)).map((id) => blobKey(id))
    if (orphans.length > 0) await this.store.deleteMany(orphans)
    return orphans.length
  }
}

function toBlob(data: Blob | string | ArrayBuffer, mime?: string): Blob {
  if (data instanceof Blob) return data
  if (typeof data === 'string') return new Blob([data], { type: mime ?? 'text/plain' })
  return new Blob([data], { type: mime ?? DEFAULT_MIME })
}
