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
      era: string
      openDirectoryWindow(startAt?: NodeId): WindowId
      /** The real Files app, as opposed to the phase-2 harness directory view. */
      openFilesWindow(startAt?: NodeId): WindowId
      /** The Editor, empty or opened onto a document. */
      openEditorWindow(file?: NodeId): WindowId
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
