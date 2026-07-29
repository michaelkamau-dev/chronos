import type { Shell } from '../../src/shell/shell.js'
import type { WindowId } from '../../src/core/wm/types.js'
import type { Filesystem } from '../../src/core/fs/fs.js'
import type { NodeId, PathCodec } from '../../src/core/fs/types.js'

declare global {
  interface Window {
    __chronos: {
      shell: Shell
      fs: Filesystem
      codec: PathCodec
      openDirectoryWindow(startAt?: NodeId): WindowId
      openWindows(n: number): WindowId[]
      keymapUnknownKeys(): string[]
      reset(): Promise<void>
      wipeStorage(): Promise<void>
      diag: {
        setSchemaVersion(v: number): Promise<void>
        orphanContent(id: NodeId): Promise<void>
      }
    }
  }
}
