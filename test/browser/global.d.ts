import type { Shell } from '../../src/shell/shell.js'
import type { WindowId } from '../../src/core/wm/types.js'

declare global {
  interface Window {
    __chronos: {
      shell: Shell
      openWindows(n: number): WindowId[]
      keymapUnknownKeys(): string[]
      reset(): Promise<void>
    }
  }
}
