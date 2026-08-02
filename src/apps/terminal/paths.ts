/**
 * Resolving what the user typed, in whatever syntax the era spells paths.
 *
 * Every path string in this app comes from `PathCodec` and every path string goes
 * back through it. There is no string manipulation here that assumes a shape — the
 * one place a path is taken apart is `splitTarget`, and it splits on
 * `codec.separator` and hands each half straight back to `codec.parse`, which is
 * what makes it work identically for `C:\DOCS\NEW`, `/Users/chronos/New` and
 * `Documents:New`.
 */

import type { FsNode, NodeId, PathCodec } from '../../core/fs/types.js'
import { isDir } from '../../core/fs/types.js'

/** A failure with a message meant for the console rather than for a log. */
export class TerminalError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TerminalError'
  }
}

export interface PathContext {
  readonly codec: PathCodec
  readonly cwd: NodeId
  stat(id: NodeId): Promise<FsNode>
  chain(id: NodeId): Promise<FsNode[]>
  list(dir: NodeId): Promise<FsNode[]>
}

/**
 * Resolves an existing node, or fails with the path quoted back.
 *
 * **The shell accepts one grammar and it is a strict superset of the codec's.** The
 * codec is asked first and its answer always wins. When it declines the path whole,
 * the last component is split off and looked up in the folder the rest names — which
 * is exactly what `splitTarget` below does for something being *created*.
 *
 * That relaxation exists because without it the two halves disagree, and one era
 * showed it plainly: on the classic Mac a path is absolute only when it begins with
 * a volume name, so `Work:notes.txt` is read as "the volume Work" and refused —
 * while `touch Work:notes.txt` happily created the file, because creating only ever
 * resolved `Work`. A shell where you can make a file at a path and then cannot read
 * it back at that path is wrong in a way no amount of era fidelity excuses, and
 * shells have always been more forgiving than the API beneath them.
 *
 * The split is unambiguous in every era: `validateName` forbids `/`, `\` and `:` in
 * a stored name outright, so no name can contain any era's separator.
 */
export async function resolve(ctx: PathContext, input: string): Promise<NodeId> {
  const direct = await ctx.codec.parse(input, ctx.cwd)
  if (direct !== null) return direct

  const sep = ctx.codec.separator
  const cut = input.lastIndexOf(sep)
  if (cut > 0 && cut < input.length - sep.length) {
    const parent = await ctx.codec.parse(input.slice(0, cut), ctx.cwd)
    if (parent !== null) {
      const wanted = input.slice(cut + sep.length).toLowerCase()
      for (const child of await ctx.list(parent)) {
        // The stored name first, then the era's display form, which is the same
        // order every codec searches in — a path read off the screen can be typed
        // back even where the era hides an extension.
        if (
          child.name.toLowerCase() === wanted ||
          ctx.codec.displayName(child).toLowerCase() === wanted
        ) {
          return child.id
        }
      }
    }
  }
  throw new TerminalError(`${input}: no such file or directory`)
}

/** Resolves an existing directory, or fails saying which it is not. */
export async function resolveDir(ctx: PathContext, input: string): Promise<NodeId> {
  const id = await resolve(ctx, input)
  const node = await ctx.stat(id)
  if (!isDir(node)) throw new TerminalError(`${input}: not a directory`)
  return id
}

export interface Target {
  readonly parent: NodeId
  /**
   * The canonical stored name, exactly as typed.
   *
   * Not decorated and not coerced: the stored name belongs to all six eras and the
   * era's spelling of it is the codec's business on the way *out*. A name typed at a
   * prompt that stored itself in one era's convention would be a different file in
   * the other five.
   */
  readonly name: string
}

/**
 * Splits `<parent>/<new name>` into a resolved parent and a name to create.
 *
 * The empty head is the interesting case and it is why this is generic rather than
 * five special cases. `\NEW` on a backslash era, `/New` on a slash era and `:New` on
 * a colon era all split with nothing before the separator — and passing the bare
 * separator back to `parse` gets each codec's own answer: the volume root for the
 * first two, and the *current folder* for the third, because a leading colon means
 * relative on the classic Mac. The rule is one line and every era is right.
 */
export async function splitTarget(ctx: PathContext, input: string): Promise<Target> {
  const sep = ctx.codec.separator
  const trimmed = input.trim()
  if (trimmed.length === 0) throw new TerminalError('a name is required')

  const cut = trimmed.lastIndexOf(sep)
  if (cut < 0) return { parent: ctx.cwd, name: trimmed }

  const head = trimmed.slice(0, cut)
  const name = trimmed.slice(cut + sep.length)
  if (name.length === 0) throw new TerminalError(`${input}: a name is required`)
  return { parent: await resolveDir(ctx, head === '' ? sep : head), name }
}

/** The era's spelling of a node's full path. */
export async function pathOf(ctx: PathContext, id: NodeId): Promise<string> {
  return ctx.codec.format(await ctx.chain(id))
}

/**
 * The prompt's path.
 *
 * A codec marks a directory with a trailing separator — that is what an address bar
 * showed and what `format` is specified to produce. A *prompt* does not: `C:\DOCS>`,
 * not `C:\DOCS\>`. Stripping one separator when the result is still longer than the
 * volume plus its separator gets that right in every era without knowing any of
 * them: `C:\` and `/` and `Macintosh HD:` are each exactly at the threshold and keep
 * their terminator, and everything deeper loses one.
 */
export function promptPath(codec: PathCodec, chain: readonly FsNode[]): string {
  const formatted = codec.format(chain)
  const sep = codec.separator
  const floor = codec.volumeName().length + sep.length
  if (formatted.length > floor && formatted.endsWith(sep)) {
    return formatted.slice(0, -sep.length)
  }
  return formatted
}
