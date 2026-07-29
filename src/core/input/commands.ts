/**
 * The semantic command vocabulary.
 *
 * Era keymaps bind chords to these names; the window manager and shell execute
 * them. This indirection is what lets Cmd+W and Alt+F4 coexist without a single
 * era conditional outside the skin layer — the skin maps a chord to
 * `window.close`, and only the skin knows which chord its era used.
 */

export const COMMANDS = [
  'window.close',
  'window.minimize',
  'window.toggleMaximize',
  'window.cycleNext',
  'window.cyclePrev',
  'window.raise',
  'window.lower',
  'window.beginKeyboardMove',
  'window.beginKeyboardResize',
  'window.openChromeMenu',
  'shell.closeTransient',
  'shell.newWindow',
] as const

/*
 * This vocabulary lists only commands that phase 1 actually implements and binds.
 * Later phases extend it — `app.quit` arrives with the app registry,
 * `shell.openLauncher` with the Start menu and Apple menu, `shell.focusDesktop`
 * with desktop icons. A name here with no handler, or a handler with no keyboard
 * path, fails `test/browser/a11y.spec.ts`.
 */

export type Command = (typeof COMMANDS)[number]

const COMMAND_SET: ReadonlySet<string> = new Set(COMMANDS)

export function isCommand(s: string): s is Command {
  return COMMAND_SET.has(s)
}

export type CommandHandler = () => void

/**
 * A layer of command handlers. Layers stack; the topmost layer that handles a
 * command wins, so a modal or an app can shadow a shell binding.
 */
export class CommandRegistry {
  private readonly layers: Array<Map<Command, CommandHandler>> = []

  pushLayer(handlers: Partial<Record<Command, CommandHandler>>): () => void {
    const map = new Map<Command, CommandHandler>()
    for (const key of Object.keys(handlers) as Command[]) {
      const fn = handlers[key]
      if (fn) map.set(key, fn)
    }
    this.layers.push(map)
    return () => {
      const i = this.layers.indexOf(map)
      if (i >= 0) this.layers.splice(i, 1)
    }
  }

  /** Returns true if a layer handled the command. */
  run(cmd: Command): boolean {
    for (let i = this.layers.length - 1; i >= 0; i--) {
      const fn = this.layers[i]?.get(cmd)
      if (fn) {
        fn()
        return true
      }
    }
    return false
  }

  has(cmd: Command): boolean {
    for (let i = this.layers.length - 1; i >= 0; i--) {
      if (this.layers[i]?.has(cmd)) return true
    }
    return false
  }

  /**
   * Every command with a live handler.
   *
   * The accessibility gate asserts that each of these is reachable from the
   * keyboard, so a command that only ever fires from a mouse gesture fails the
   * build rather than quietly becoming a mouse-only feature.
   */
  registered(): Command[] {
    const seen = new Set<Command>()
    for (const layer of this.layers) for (const key of layer.keys()) seen.add(key)
    return [...seen]
  }
}
