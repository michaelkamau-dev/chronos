/**
 * The persistence boundary.
 *
 * This is the only module in Chronos allowed to reference `idb-keyval` or
 * `indexedDB` — `test/invariants.test.js` fails the build if anything else does.
 * Everything above it deals in nodes and blobs, not keys and transactions.
 *
 * Key layout:
 *
 *   fs:meta          schema version, root and trash ids, ordinal counter
 *   fs:node:<id>     one node record — small, structured-cloneable
 *   fs:blob:<id>     one file's content as a Blob, fetched only on read
 *   sys:prefs        shell preferences: era, wallpaper, volume, display scale
 *
 * Metadata and content are deliberately separate keys so `list()` never loads
 * content. Multi-key writes go through `writeMany`, which idb-keyval executes in
 * a single IndexedDB transaction — verified against its source, where `setMany`
 * opens one `readwrite` transaction and issues every `put` against it. That is
 * what makes "a crash can orphan a blob but can never leave a directory entry
 * pointing at nothing" true rather than hopeful.
 */

import {
  clear,
  createStore,
  del,
  delMany,
  entries,
  get,
  getMany,
  set,
  setMany,
  type UseStore,
} from 'idb-keyval'
import { FsError } from './errors.js'
import type { FsMeta, FsNode, NodeId } from './types.js'

const DB_NAME = 'chronos'
const STORE_NAME = 'fs'

export const KEY_META = 'fs:meta'
export const KEY_PREFS = 'sys:prefs'

export function nodeKey(id: NodeId): string {
  return `fs:node:${id}`
}

export function blobKey(id: NodeId): string {
  return `fs:blob:${id}`
}

/** Extracts a node id from a `fs:node:<id>` key, or null for other keys. */
export function nodeIdFromKey(key: unknown): NodeId | null {
  if (typeof key !== 'string' || !key.startsWith('fs:node:')) return null
  return key.slice('fs:node:'.length) as NodeId
}

export function blobIdFromKey(key: unknown): NodeId | null {
  if (typeof key !== 'string' || !key.startsWith('fs:blob:')) return null
  return key.slice('fs:blob:'.length) as NodeId
}

export type WriteEntry = [string, unknown]

export class FsStore {
  private readonly store: UseStore

  constructor(dbName = DB_NAME, storeName = STORE_NAME) {
    this.store = createStore(dbName, storeName)
  }

  async readMeta(): Promise<FsMeta | undefined> {
    return get<FsMeta>(KEY_META, this.store)
  }

  async writeMeta(meta: FsMeta): Promise<void> {
    await this.guard(set(KEY_META, meta, this.store))
  }

  async readNode(id: NodeId): Promise<FsNode | undefined> {
    return get<FsNode>(nodeKey(id), this.store)
  }

  async readNodes(ids: readonly NodeId[]): Promise<Array<FsNode | undefined>> {
    if (ids.length === 0) return []
    return getMany<FsNode>(
      ids.map((id) => nodeKey(id)),
      this.store,
    )
  }

  async readBlob(id: NodeId): Promise<Blob | undefined> {
    return get<Blob>(blobKey(id), this.store)
  }

  /**
   * One transaction for every entry. Callers batch a node write together with its
   * parent's updated child list so the pair cannot be torn apart by a crash.
   */
  async writeMany(entriesToWrite: readonly WriteEntry[]): Promise<void> {
    if (entriesToWrite.length === 0) return
    await this.guard(setMany(entriesToWrite as Array<[string, unknown]>, this.store))
  }

  async deleteMany(keys: readonly string[]): Promise<void> {
    if (keys.length === 0) return
    await delMany([...keys], this.store)
  }

  async deleteKey(key: string): Promise<void> {
    await del(key, this.store)
  }

  /** Every key currently stored. Used by the boot-time orphan sweep. */
  async allKeys(): Promise<string[]> {
    const all = await entries(this.store)
    return all.map(([k]) => String(k))
  }

  async readPrefs<T>(): Promise<T | undefined> {
    return get<T>(KEY_PREFS, this.store)
  }

  async writePrefs<T>(prefs: T): Promise<void> {
    await this.guard(set(KEY_PREFS, prefs, this.store))
  }

  /** Wipes the store. Only the test harness and a factory reset use this. */
  async wipe(): Promise<void> {
    await clear(this.store)
  }

  /**
   * Storage headroom, when the browser will tell us.
   *
   * Chrome reports a quota that is a fraction of free disk, so this is advisory:
   * the authoritative signal is a failed write, which `guard` translates.
   */
  async headroom(): Promise<{ usage: number; quota: number } | null> {
    if (!navigator.storage?.estimate) return null
    const est = await navigator.storage.estimate()
    if (est.usage === undefined || est.quota === undefined) return null
    return { usage: est.usage, quota: est.quota }
  }

  /**
   * Translates a browser quota failure into a typed FsError.
   *
   * The disk-full path has to be reachable, not theoretical: it drives each era's
   * authentic out-of-space dialog, so it must arrive as a value the shell can act
   * on rather than as a raw DOMException.
   */
  private async guard<T>(op: Promise<T>): Promise<T> {
    try {
      return await op
    } catch (e) {
      if (
        e instanceof DOMException &&
        (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')
      ) {
        throw new FsError('quota-exceeded', 'The disk is full')
      }
      throw e
    }
  }
}
