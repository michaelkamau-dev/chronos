/**
 * Schema migrations.
 *
 * The filesystem outlives the code that wrote it — that is the entire point of
 * the project's spine. A user who saved a document in an early build must find it
 * intact after an update, so schema changes are versioned and applied in order,
 * once, at open time.
 *
 * Each migration takes the store from `version` to `version + 1` and must be
 * idempotent in effect: it runs inside `open()` before anything reads a node, and
 * a failure leaves the recorded version unchanged so the next boot retries.
 */

import { FsError } from './errors.js'
import { FsStore, nodeIdFromKey, nodeKey, type WriteEntry } from './store.js'
import type { FsMeta, FsNode, NodeId } from './types.js'

export const CURRENT_SCHEMA_VERSION = 1

export interface Migration {
  /** The version this migration upgrades *from*. */
  from: number
  describe: string
  run(store: FsStore, meta: FsMeta): Promise<FsMeta>
}

/**
 * Reads every node record. Migrations that rewrite node shape use this rather
 * than walking the tree, so a node orphaned by an earlier bug is still upgraded
 * instead of being silently left in an old shape.
 */
export async function readAllNodes(store: FsStore): Promise<FsNode[]> {
  const keys = await store.allKeys()
  const ids: NodeId[] = []
  for (const key of keys) {
    const id = nodeIdFromKey(key)
    if (id !== null) ids.push(id)
  }
  const nodes = await store.readNodes(ids)
  const out: FsNode[] = []
  for (const node of nodes) if (node) out.push(node)
  return out
}

/** Rewrites a set of nodes in one transaction. */
export async function writeNodes(store: FsStore, nodes: readonly FsNode[]): Promise<void> {
  const writes: WriteEntry[] = nodes.map((n) => [nodeKey(n.id), n])
  await store.writeMany(writes)
}

/**
 * The migration list.
 *
 * Version 1 is the first shipped schema, so there is nothing to upgrade from yet.
 * Entries are appended here as the schema changes; `migrate` applies whichever
 * ones a given store needs. The mechanism is tested against a synthetic older
 * store in `test/browser/fs.spec.ts` so it is known to work before the first real
 * migration depends on it.
 */
export const MIGRATIONS: readonly Migration[] = []

export async function migrate(store: FsStore, meta: FsMeta): Promise<FsMeta> {
  let current = meta

  if (current.schemaVersion > CURRENT_SCHEMA_VERSION) {
    // A newer build wrote this store. Downgrading would corrupt it, so refuse.
    throw new FsError(
      'corrupt',
      `The stored filesystem is version ${current.schemaVersion}, ` +
        `but this build understands version ${CURRENT_SCHEMA_VERSION}`,
    )
  }

  while (current.schemaVersion < CURRENT_SCHEMA_VERSION) {
    const step = MIGRATIONS.find((m) => m.from === current.schemaVersion)
    if (!step) {
      throw new FsError(
        'corrupt',
        `No migration from filesystem version ${current.schemaVersion}`,
      )
    }
    current = await step.run(store, current)
    current = { ...current, schemaVersion: step.from + 1 }
    // The version is recorded only after the step's own writes have landed, so an
    // interrupted migration is retried rather than skipped.
    await store.writeMeta(current)
  }

  return current
}
