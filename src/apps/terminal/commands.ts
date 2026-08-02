/**
 * The commands.
 *
 * One implementation per job, keyed by `CommandId`. Which *word* reaches which
 * handler is settled in `dialect.ts` and is invisible from here — nothing in this
 * file spells `dir` or `ls`, so the claim that `dir C:\DOCS` and `ls HD:Documents`
 * run the same code is structural rather than a promise.
 *
 * Three rules hold throughout:
 *
 * - **Every filesystem effect goes through `FsApi`.** No command builds a storage
 *   key, caches a listing or holds a node between runs.
 * - **Every walk yields at each directory.** `ctx.gate()` is the suspension point,
 *   so a `find` over a deep tree stops when the window is suspended and continues
 *   from where it stopped — which is the era thesis that nothing computes while you
 *   are not looking at it, applied to the one app that can genuinely be caught in
 *   the middle of something.
 * - **Nothing is simulated.** `crash` raises a real unhandled fault, `reboot`
 *   really reloads the session, and `chkdsk`/`df` counts the tree it is standing on
 *   rather than reporting a number nobody measured.
 */

import type { AppHost } from '../../core/app/types.js'
import type { FsNode, NodeId } from '../../core/fs/types.js'
import { isDir, isFile } from '../../core/fs/types.js'
import type { DialogSpec } from '../../core/ui/dialogs.js'
import type { UiKit } from '../../core/ui/kit.js'
import type { CommandId, FlagId, Shell } from './dialect.js'
import { COMMAND_ORDER, nameOf } from './dialect.js'
import type { Block } from './console.js'
import { line, lines } from './console.js'
import { bytes, globToRegExp, isPrintable, kindOf, mimeForName, stamp } from './format.js'
import type { PathContext } from './paths.js'
import { TerminalError, pathOf, resolve, resolveDir, splitTarget } from './paths.js'

export interface CommandContext extends PathContext {
  readonly host: AppHost
  readonly shell: Shell
  readonly flags: ReadonlySet<FlagId>
  readonly operands: readonly string[]
  /** Write a block to the scrollback. */
  out(block: Block): void
  /** Move the working directory, which re-reads and re-renders the prompt. */
  chdir(id: NodeId): Promise<void>
  /** Discard the scrollback. */
  clearScreen(): void
  /**
   * The suspension point.
   *
   * Resolves immediately while the window is live and blocks until `resume()` while
   * it is not, so a long walk costs nothing at all during a suspension instead of
   * quietly finishing it.
   */
  gate(): Promise<void>
  /** True once the app has been destroyed under a running command. */
  gone(): boolean
  /** Raise a genuinely unhandled fault, outside any handler that could catch it. */
  raiseFault(reason: string): void
  /** Reload the session. */
  rebootSession(): void
  /** Move the session to a named era, which reboots. */
  switchEra(name: string): void
  /** The era the address selects, or null when it names none. */
  eraSelection(): string | null
}

export type CommandHandler = (ctx: CommandContext) => Promise<void>

/**
 * A bound on any recursive command.
 *
 * A cap rather than an unbounded walk, and reported when it bites, because silent
 * truncation reads as "that is the whole tree" when it is not.
 */
const WALK_LIMIT = 4000

// ------------------------------------------------------------------- listing

const listCmd: CommandHandler = async (ctx) => {
  const target = ctx.operands[0]
  const id = target === undefined ? ctx.cwd : await resolve(ctx, target)
  const node = await ctx.stat(id)

  // A path naming a file lists that file, which both families did.
  const entries = isDir(node) ? sortEntries(ctx, await ctx.host.fs.list(id)) : [node]
  if (entries.length === 0) {
    ctx.out(line(isDir(node) ? 'The folder is empty' : ''))
    return
  }

  const long = ctx.flags.has('long') || (ctx.shell.listLongByDefault && !ctx.flags.has('wide'))
  ctx.out(long ? longListing(ctx, entries) : shortListing(ctx, entries))
  if (long && isDir(node)) ctx.out(listingFooter(entries))
}

function sortEntries(ctx: CommandContext, nodes: readonly FsNode[]): FsNode[] {
  return [...nodes].sort((a, b) => {
    if (ctx.shell.listDirsFirst && isDir(a) !== isDir(b)) return isDir(a) ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

function longListing(ctx: CommandContext, entries: readonly FsNode[]): Block {
  const { codec } = ctx
  return {
    tone: 'normal',
    align: ['start', 'end', 'start', 'start'],
    rows: entries.map((node) => ({
      cells: [
        codec.displayName(node),
        isDir(node) ? '<DIR>' : bytes(node.size),
        kindOf(node),
        stamp(node.modified),
      ],
    })),
  }
}

/**
 * The short listing, packed into columns.
 *
 * Four columns rather than a count derived from the window width: measuring the
 * console and the face to fit names into it is what a monospaced terminal does with
 * arithmetic, and with six proportional faces the arithmetic has no character cell
 * to work in. Four is enough to read as a listing and the console scrolls when a
 * name is long, which is what a narrow terminal did too.
 */
function shortListing(ctx: CommandContext, entries: readonly FsNode[]): Block {
  const columns = Math.max(1, Math.min(4, entries.length))
  const names = entries.map((node) => ctx.codec.displayName(node))
  const rows: Array<{ cells: string[] }> = []
  for (let i = 0; i < names.length; i += columns) {
    rows.push({ cells: names.slice(i, i + columns) })
  }
  return { tone: 'normal', rows }
}

function listingFooter(entries: readonly FsNode[]): Block {
  const files = entries.filter(isFile)
  const dirs = entries.length - files.length
  const total = files.reduce((n, f) => n + f.size, 0)
  return {
    tone: 'normal',
    align: ['end', 'start'],
    rows: [
      { cells: [String(files.length), `file${files.length === 1 ? '' : 's'}, ${bytes(total)} bytes`] },
      { cells: [String(dirs), `folder${dirs === 1 ? '' : 's'}`] },
    ],
  }
}

// ------------------------------------------------------------- getting around

const changeDirCmd: CommandHandler = async (ctx) => {
  const target = ctx.operands[0]
  if (target === undefined) {
    // The two families disagree about the bare form and both are authentic: one
    // prints where you are, the other takes you home.
    if (ctx.shell.bareChangeDir === 'print') await printDirCmd(ctx)
    else await ctx.chdir(ctx.host.fs.root())
    return
  }
  await ctx.chdir(await resolveDir(ctx, target))
}

const printDirCmd: CommandHandler = async (ctx) => {
  ctx.out(line(await pathOf(ctx, ctx.cwd)))
}

// -------------------------------------------------------------------- reading

const showFileCmd: CommandHandler = async (ctx) => {
  if (ctx.operands.length === 0) throw new TerminalError('a file is required')
  for (const operand of ctx.operands) {
    const id = await resolve(ctx, operand)
    const node = await ctx.stat(id)
    if (isDir(node)) throw new TerminalError(`${operand}: is a directory`)
    if (!isPrintable(node.mime)) {
      throw new TerminalError(
        `${operand}: ${node.mime}, ${bytes(node.size)} bytes — not text`,
      )
    }
    const text = await ctx.host.fs.readText(id)
    // A file ending in a newline would otherwise print a trailing blank line that
    // is not in it.
    const body = text.endsWith('\n') ? text.slice(0, -1) : text
    ctx.out(lines(body.split('\n')))
  }
}

// ------------------------------------------------------------------- creating

const makeDirCmd: CommandHandler = async (ctx) => {
  if (ctx.operands.length === 0) throw new TerminalError('a name is required')
  for (const operand of ctx.operands) {
    const { parent, name } = await splitTarget(ctx, operand)
    await ctx.host.fs.createDir(parent, name)
  }
}

const touchCmd: CommandHandler = async (ctx) => {
  if (ctx.operands.length === 0) throw new TerminalError('a name is required')
  for (const operand of ctx.operands) {
    const existing = await ctx.codec.parse(operand, ctx.cwd)
    if (existing !== null) {
      const node = await ctx.stat(existing)
      if (isDir(node)) throw new TerminalError(`${operand}: is a directory`)
      // Rewriting the same bytes is what updates the stored timestamp, and going
      // through `write` keeps the change on the one path every watcher sees.
      await ctx.host.fs.write(existing, await ctx.host.fs.read(existing))
      continue
    }
    const { parent, name } = await splitTarget(ctx, operand)
    await ctx.host.fs.createFile(parent, name, '', { mime: mimeForName(name) })
  }
}

const echoCmd: CommandHandler = async (ctx) => {
  ctx.out(line(ctx.operands.join(' ')))
  await Promise.resolve()
}

// ------------------------------------------------------------------- removing

const removeCmd: CommandHandler = async (ctx) => {
  if (ctx.operands.length === 0) throw new TerminalError('a path is required')
  const recurse = ctx.flags.has('recurse')
  for (const operand of ctx.operands) {
    const id = await resolve(ctx, operand)
    const node = await ctx.stat(id)
    if (isDir(node) && node.childIds.length > 0 && !recurse) {
      throw new TerminalError(
        `${operand}: the folder is not empty — use ${ctx.shell.flagPrefix}${firstFlag(ctx.shell, 'recurse')}`,
      )
    }
    await ctx.host.fs.purge(id)
  }
}

function firstFlag(shell: Shell, id: FlagId): string {
  return shell.flags[id]?.[0] ?? ''
}

// -------------------------------------------------------------- copy and move

const copyCmd: CommandHandler = async (ctx) => {
  const [from, to] = twoOperands(ctx)
  const sourceId = await resolve(ctx, from)
  const source = await ctx.stat(sourceId)

  if (isDir(source) && !ctx.flags.has('recurse')) {
    throw new TerminalError(
      `${from}: is a folder — use ${ctx.shell.flagPrefix}${firstFlag(ctx.shell, 'recurse')}`,
    )
  }

  const target = await destinationFor(ctx, to, source.name)
  if (isDir(source) && (await contains(ctx, sourceId, target.parent))) {
    throw new TerminalError(`${to}: cannot copy a folder into itself`)
  }
  const name = await ctx.host.fs.suggestName(target.parent, target.name, ctx.host.decorate)
  await copyNode(ctx, source, target.parent, name)
}

async function copyNode(
  ctx: CommandContext,
  source: FsNode,
  parent: NodeId,
  name: string,
): Promise<void> {
  await ctx.gate()
  if (ctx.gone()) return
  if (isFile(source)) {
    await ctx.host.fs.createFile(parent, name, await ctx.host.fs.read(source.id), {
      mime: source.mime,
      ...(source.typeCode !== undefined ? { typeCode: source.typeCode } : {}),
      ...(source.creatorCode !== undefined ? { creatorCode: source.creatorCode } : {}),
    })
    return
  }
  const copyId = await ctx.host.fs.createDir(parent, name)
  for (const child of await ctx.host.fs.list(source.id)) {
    await copyNode(ctx, child, copyId, child.name)
  }
}

const moveCmd: CommandHandler = async (ctx) => {
  const [from, to] = twoOperands(ctx)
  const sourceId = await resolve(ctx, from)
  const source = await ctx.stat(sourceId)
  const target = await destinationFor(ctx, to, source.name)

  if (target.parent !== source.parent) await ctx.host.fs.move(sourceId, target.parent)
  if (target.name !== source.name) await ctx.host.fs.rename(sourceId, target.name)
}

/**
 * Where a second operand points.
 *
 * An existing folder takes the item inside it and keeps its name; anything else is
 * the new name and its parent. That is what both families' `copy`/`cp` and
 * `move`/`mv` did, and it is one rule rather than a per-command special case.
 */
async function destinationFor(
  ctx: CommandContext,
  operand: string,
  fallbackName: string,
): Promise<{ parent: NodeId; name: string }> {
  const existing = await ctx.codec.parse(operand, ctx.cwd)
  if (existing !== null) {
    const node = await ctx.stat(existing)
    if (isDir(node)) return { parent: existing, name: fallbackName }
  }
  return splitTarget(ctx, operand)
}

/** True when `ancestor` is on `node`'s chain — the cycle a recursive copy would make. */
async function contains(
  ctx: CommandContext,
  ancestor: NodeId,
  node: NodeId,
): Promise<boolean> {
  for (const link of await ctx.chain(node)) {
    if (link.id === ancestor) return true
  }
  return false
}

function twoOperands(ctx: CommandContext): [string, string] {
  const from = ctx.operands[0]
  const to = ctx.operands[1]
  if (from === undefined || to === undefined) {
    throw new TerminalError('a source and a destination are required')
  }
  return [from, to]
}

// -------------------------------------------------------------- walking a tree

const findCmd: CommandHandler = async (ctx) => {
  const pattern = ctx.operands[0]
  if (pattern === undefined) throw new TerminalError('a name or pattern is required')
  const startInput = ctx.operands[1]
  const start = startInput === undefined ? ctx.cwd : await resolveDir(ctx, startInput)

  const match = globToRegExp(pattern.includes('*') || pattern.includes('?') ? pattern : `*${pattern}*`)
  const hits: string[] = []
  const budget = { left: WALK_LIMIT }

  // Seeded with the chain down to the starting folder, because a hit is reported as
  // a *full* path. Without the seed the walk only knows the ancestors it has pushed
  // itself, and every result comes out rooted at the search folder instead of at the
  // volume — which reads as a real path and is not one.
  const seed = await ctx.chain(start)
  await descend(
    ctx,
    start,
    budget,
    async (node, ancestors) => {
      if (match.test(node.name) || match.test(ctx.codec.displayName(node))) {
        hits.push(ctx.codec.format([...ancestors, node]))
      }
    },
    seed,
  )

  if (hits.length === 0) ctx.out(line(`${pattern}: nothing found`))
  else ctx.out(lines(hits))
  if (budget.left <= 0) ctx.out(line(`stopped after ${WALK_LIMIT} entries`, 'error'))
}

const treeCmd: CommandHandler = async (ctx) => {
  const target = ctx.operands[0]
  const start = target === undefined ? ctx.cwd : await resolveDir(ctx, target)
  const showFiles = ctx.shell.treeFilesByDefault || ctx.flags.has('files')

  const rows: Array<{ cells: string[]; indent: number }> = [
    { cells: [ctx.codec.format(await ctx.chain(start))], indent: 0 },
  ]
  const budget = { left: WALK_LIMIT }
  await descend(ctx, start, budget, async (node, ancestors, last) => {
    if (!showFiles && !isDir(node)) return
    // `+---` and `\---` rather than `├──` and `└──`: not one of the six era faces
    // carries a box-drawing character, and a glyph a face lacks falls back to a
    // face that antialiases — mid grey, in eras that have none. This is what
    // `tree /a` printed, for the same reason one codepage down.
    rows.push({
      cells: [`${last ? '\\---' : '+---'} ${ctx.codec.displayName(node)}`],
      indent: ancestors.length + 1,
    })
  })
  ctx.out({ tone: 'normal', rows })
  if (budget.left <= 0) ctx.out(line(`stopped after ${WALK_LIMIT} entries`, 'error'))
}

/** What a walk hands its visitor: the node, its ancestors below the start, and
 *  whether it is the last child of its folder — which only `tree` uses and which
 *  is cheaper to pass than to recompute. */
type Visitor = (
  node: FsNode,
  ancestors: readonly FsNode[],
  last: boolean,
) => Promise<void>

/**
 * Depth-first descent with a budget and a suspension point at every folder.
 *
 * `ancestors` is both the seed and the running stack. A caller that reports full
 * paths seeds it with the chain down to `dir`; a caller that reports depth leaves it
 * empty, and its length is then the depth below the start.
 */
async function descend(
  ctx: CommandContext,
  dir: NodeId,
  budget: { left: number },
  visit: Visitor,
  ancestors: FsNode[] = [],
): Promise<void> {
  await ctx.gate()
  if (ctx.gone() || budget.left <= 0) return
  const children = [...(await ctx.host.fs.list(dir))].sort((a, b) => {
    if (isDir(a) !== isDir(b)) return isDir(a) ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  for (let i = 0; i < children.length; i++) {
    const child = children[i]
    if (!child) continue
    if (budget.left <= 0) return
    budget.left--
    await visit(child, ancestors, i === children.length - 1)
    if (isDir(child)) {
      ancestors.push(child)
      await descend(ctx, child.id, budget, visit, ancestors)
      ancestors.pop()
    }
  }
}

// -------------------------------------------------------------------- opening

const openCmd: CommandHandler = async (ctx) => {
  const operand = ctx.operands[0]
  if (operand === undefined) throw new TerminalError('a path is required')
  const id = await resolve(ctx, operand)
  const [node, chain] = await Promise.all([ctx.stat(id), ctx.chain(id)])
  await ctx.host.win.openDialog(itemDialog(node, chain, ctx))
}

/**
 * What "open" can honestly do today.
 *
 * There is no registry mapping a file's type to an app and no route from an app to
 * the launcher — `AppHost` has neither, deliberately, and the file manager raised
 * the same gap one app earlier. So this opens a real window onto the item: a modal
 * owned by the terminal, drawn in the era's own widgets, showing what the
 * filesystem actually stores. When a type registry exists this becomes a launch,
 * and nothing else here changes.
 */
function itemDialog(
  node: FsNode,
  chain: readonly FsNode[],
  ctx: CommandContext,
): DialogSpec {
  const { codec } = ctx
  return {
    title: codec.displayName(node),
    size: { w: 320, h: 230 },
    buttons: [{ label: 'OK', isDefault: true, isCancel: true }],
    build: (body: HTMLElement, ui: UiKit) => {
      const rows: Array<readonly [string, string]> = [
        ['Name', codec.displayName(node)],
        ['Kind', kindOf(node)],
        ['Where', codec.format(chain.slice(0, -1))],
      ]
      if (isDir(node)) {
        rows.push(['Contains', `${node.childIds.length} item${node.childIds.length === 1 ? '' : 's'}`])
      } else {
        rows.push(['Size', `${bytes(node.size)} bytes`])
        rows.push(['Format', node.mime])
        if (node.typeCode !== undefined) rows.push(['Type', node.typeCode])
        if (node.creatorCode !== undefined) rows.push(['Creator', node.creatorCode])
      }
      rows.push(['Created', stamp(node.created)])
      rows.push(['Modified', stamp(node.modified)])

      const grid = body.ownerDocument.createElement('div')
      grid.dataset['uiRole'] = 'properties'
      for (const [caption, value] of rows) {
        const captionEl = ui.label({ text: caption })
        captionEl.el.dataset['uiRole'] = 'property-name'
        const valueEl = ui.label({ text: value })
        valueEl.el.dataset['uiRole'] = 'property-value'
        grid.append(captionEl.el, valueEl.el)
      }
      body.appendChild(grid)
    },
  }
}

// ---------------------------------------------------------------- the machine

const clearCmd: CommandHandler = async (ctx) => {
  ctx.clearScreen()
  await Promise.resolve()
}

/**
 * Volume usage, counted rather than reported.
 *
 * There is no free-space figure, and its absence is deliberate: `FsApi` exposes no
 * storage estimate — `Filesystem.storageHeadroom()` exists and is not on the
 * app-facing contract — and a capacity nobody measured is exactly the kind of number
 * this project tags rather than invents. Everything below is a real count of the
 * real tree, which is what `chkdsk` did before it printed a total.
 */
const diskFreeCmd: CommandHandler = async (ctx) => {
  const budget = { left: Number.MAX_SAFE_INTEGER }
  let folders = 0
  let files = 0
  let used = 0
  await descend(ctx, ctx.host.fs.root(), budget, async (node: FsNode) => {
    if (isDir(node)) folders++
    else {
      files++
      used += node.size
    }
  })
  ctx.out({
    tone: 'normal',
    align: ['start', 'end'],
    rows: [
      { cells: ['Volume', ctx.codec.volumeName() || ctx.codec.separator] },
      { cells: ['Folders', String(folders)] },
      { cells: ['Files', String(files)] },
      { cells: ['Bytes used', bytes(used)] },
    ],
  })
}

const dateCmd: CommandHandler = async (ctx) => {
  ctx.out(line(ctx.shell.formatNow(new Date())))
  await Promise.resolve()
}

/**
 * What system this is.
 *
 * No version number, and that is the honest answer rather than a missing one:
 * nothing an app can reach at runtime carries one, and a string typed here would be
 * a number nobody can check that drifts the first time the real one moves. What is
 * printed is four things the app can genuinely observe — the system's name, the
 * shell its path syntax implies, the volume the codec names, and the era the
 * address selects.
 */
const versionCmd: CommandHandler = async (ctx) => {
  const selection = ctx.eraSelection()
  ctx.out({
    tone: 'normal',
    rows: [
      { cells: ['Chronos'] },
      { cells: ['Shell', ctx.shell.title] },
      { cells: ['Volume', ctx.codec.volumeName() || ctx.codec.separator] },
      { cells: ['Era', selection ?? 'chosen by the system'] },
    ],
  })
  await Promise.resolve()
}

const helpCmd: CommandHandler = async (ctx) => {
  const rows: Array<{ cells: string[] }> = []
  for (const id of COMMAND_ORDER) {
    const name = nameOf(ctx.shell, id)
    if (name === undefined) continue
    rows.push({ cells: [usage(ctx.shell, id, name), SUMMARIES[id]] })
  }
  ctx.out({ tone: 'normal', rows })
  // The one command with no name of its own in this shell still has a job, and the
  // shell that lacks the word does the work somewhere else.
  if (nameOf(ctx.shell, 'printDir') === undefined && ctx.shell.bareChangeDir === 'print') {
    ctx.out(line(`${nameOf(ctx.shell, 'changeDir') ?? ''} with no path shows the current folder`))
  }
  await Promise.resolve()
}

/** The operand shape each command takes, spelled in the shell's own switches. */
function usage(shell: Shell, id: CommandId, name: string): string {
  const p = shell.flagPrefix
  const recurse = `${p}${firstFlag(shell, 'recurse')}`
  switch (id) {
    case 'list':
      return `${name} [${p}${shell.listLongByDefault ? firstFlag(shell, 'wide') : firstFlag(shell, 'long')}] [path]`
    case 'changeDir':
      return `${name} [path]`
    case 'showFile':
      return `${name} <file>`
    case 'makeDir':
      return `${name} <name>`
    case 'remove':
      return `${name} [${recurse}] <path>`
    case 'copy':
      return `${name} [${recurse}] <from> <to>`
    case 'move':
      return `${name} <from> <to>`
    case 'echo':
      return `${name} <text>`
    case 'touch':
      return `${name} <name>`
    case 'find':
      return `${name} <pattern> [path]`
    case 'tree':
      return shell.treeFilesByDefault
        ? `${name} [path]`
        : `${name} [${p}${firstFlag(shell, 'files')}] [path]`
    case 'open':
      return `${name} <path>`
    case 'era':
      return `${name} [name]`
    default:
      return name
  }
}

const SUMMARIES: Readonly<Record<CommandId, string>> = {
  list: 'list a folder',
  changeDir: 'change the current folder',
  printDir: 'show the current folder',
  showFile: 'print a text file',
  makeDir: 'create a folder',
  remove: 'delete permanently',
  copy: 'copy a file or folder',
  move: 'move or rename',
  echo: 'print its arguments',
  touch: 'create a file, or update its date',
  find: 'search names below a folder',
  tree: 'draw the folder tree',
  open: 'open a window onto an item',
  clear: 'clear the screen',
  diskFree: 'count what the volume holds',
  date: 'show the date and time',
  version: 'show the system, shell and era',
  help: 'this list',
  crash: 'raise a real unhandled fault',
  reboot: 'restart the session',
  era: 'show the era, or restart into another',
}

/**
 * A genuinely unhandled fault.
 *
 * §10 lists the terminal's `crash` as one of three routes into the era's failure
 * state, the other two being an app-level error boundary and the storage-quota path.
 * Those are phase 6 and none of them exists yet, so this raises the *real* thing an
 * error boundary will catch — an exception thrown outside any handler, from a task
 * of its own — rather than drawing something that looks like a crash. The session
 * this window hosts really does stop, which is what makes closing the window the
 * recovery path §10 requires it to have.
 */
const crashCmd: CommandHandler = async (ctx) => {
  ctx.raiseFault(ctx.operands.join(' ') || 'fault raised from the command line')
  await Promise.resolve()
}

/**
 * Three ASCII dots, not U+2026.
 *
 * The 1-bit face carries no ellipsis, and a codepoint a face lacks does not fail —
 * it falls back to the browser's default and antialiases, which is grey in an era
 * whose whole claim is that it has none. The same trap cost this project a window
 * title once already.
 */
const rebootCmd: CommandHandler = async (ctx) => {
  ctx.out(line('Restarting...'))
  ctx.rebootSession()
  await Promise.resolve()
}

/**
 * The era, read from and written to the address.
 *
 * An app cannot enumerate the eras and must not: naming even one of them here is
 * what `test/invariants.test.js` forbids, and the list belongs to the entry point
 * that owns the registry. So this reports the selection the address carries and
 * hands a name straight back to it — the system resolves it, and falls back to its
 * own default when the name is not one it knows.
 */
const eraCmd: CommandHandler = async (ctx) => {
  const wanted = ctx.operands[0]
  if (wanted === undefined) {
    const selection = ctx.eraSelection()
    ctx.out(
      line(
        selection === null
          ? 'The address names no era, so the system chose its own.'
          : `The address selects "${selection}".`,
      ),
    )
    await Promise.resolve()
    return
  }
  ctx.switchEra(wanted)
  await Promise.resolve()
}

export const HANDLERS: Readonly<Record<CommandId, CommandHandler>> = {
  list: listCmd,
  changeDir: changeDirCmd,
  printDir: printDirCmd,
  showFile: showFileCmd,
  makeDir: makeDirCmd,
  remove: removeCmd,
  copy: copyCmd,
  move: moveCmd,
  echo: echoCmd,
  touch: touchCmd,
  find: findCmd,
  tree: treeCmd,
  open: openCmd,
  clear: clearCmd,
  diskFree: diskFreeCmd,
  date: dateCmd,
  version: versionCmd,
  help: helpCmd,
  crash: crashCmd,
  reboot: rebootCmd,
  era: eraCmd,
}
