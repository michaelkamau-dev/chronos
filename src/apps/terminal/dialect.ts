/**
 * The shell dialect — where the command names come from.
 *
 * This is the app's central design problem, stated in one place. `dir C:\DOCS`,
 * `ls /Users/chronos` and `ls HD:Documents` are three spellings of one
 * implementation, and the app may not ask which era is running: it knows core and
 * nothing else, and `test/invariants.test.js` enforces that mechanically.
 *
 * **The discriminator is `PathCodec.separator`, and it is not a proxy for the era.**
 * The backslash and the DOS command set are the same artefact: CP/M used `/` for
 * switches, so MS-DOS 2.0 had to put the directory separator somewhere else and took
 * `\`, and `dir`/`type`/`del`/`copy` came down the same line. The slash and `ls`,
 * `cat`, `rm`, `cp` arrived together from Unix. A colon is the classic Mac, whose
 * shell is settled by ARCHITECTURE.md §12 as MPW — so it takes the Unix vocabulary
 * with its own path syntax and its own window title, which is exactly the case the
 * brief names: `ls HD:Documents`.
 *
 * So the table below is keyed by separator rather than branched on, and a separator
 * the table does not know falls to the Unix shell — the majority spelling, and the
 * one whose flag prefix (`-`) cannot collide with an absolute path. If an era ever
 * arrives whose paths and whose commands disagree about their ancestry, that is the
 * point at which `PathCodec` needs to carry a dialect outright, and it would be a
 * contract change to raise rather than to take.
 *
 * Everything era-shaped about the terminal is in this file: the names, the flag
 * prefix, the prompt terminator, the window title, and the two behavioural splits
 * (`dir` lists folders first, `ls` does not; `cd` with no argument prints in one
 * family and goes home in the other). Nothing downstream of here knows there is more
 * than one.
 */

/**
 * A command's identity, independent of what it is called.
 *
 * The handler table is keyed by this; the spelling is looked up per shell. That is
 * what makes "the same implementation" literally true rather than a claim.
 */
export type CommandId =
  | 'list'
  | 'changeDir'
  | 'printDir'
  | 'showFile'
  | 'makeDir'
  | 'remove'
  | 'copy'
  | 'move'
  | 'echo'
  | 'touch'
  | 'find'
  | 'tree'
  | 'open'
  | 'clear'
  | 'diskFree'
  | 'date'
  | 'version'
  | 'help'
  | 'crash'
  | 'reboot'
  | 'era'

/** Every command, in the order `help` lists them. */
export const COMMAND_ORDER: readonly CommandId[] = [
  'list',
  'changeDir',
  'printDir',
  'showFile',
  'makeDir',
  'remove',
  'copy',
  'move',
  'echo',
  'touch',
  'find',
  'tree',
  'open',
  'clear',
  'diskFree',
  'date',
  'version',
  'help',
  'crash',
  'reboot',
  'era',
]

/**
 * One flag, in both spellings the two families use.
 *
 * A flag is looked up by `id`, so `rm -r` and `del /s` reach the same branch. The
 * prefix is never part of the id.
 */
export type FlagId = 'recurse' | 'long' | 'wide' | 'files' | 'all'

export interface Shell {
  /**
   * The window title.
   *
   * §12 settles the two that needed settling: the backslash family shows the MS-DOS
   * Prompt and the colon family gets MPW. One dialect serves two Windows eras, so
   * the later one's own name for the window is not reachable from here — recorded in
   * `docs/apps/terminal.md` rather than guessed at.
   */
  readonly title: string
  /**
   * What follows the path on the prompt line, trailing space included.
   *
   * `C:\DOCS>dir` has no space and `/Users/chronos $ ls` does, so the space is part
   * of the terminator rather than something the caller adds.
   */
  readonly promptSuffix: string
  /** `-` or `/`. Never both: on a slash-separated era `/Users` is a path, not a flag. */
  readonly flagPrefix: string
  /** Accepted spellings per command. The first is what `help` prints. */
  readonly names: Readonly<Partial<Record<CommandId, readonly string[]>>>
  /** Accepted spellings per flag, without the prefix. */
  readonly flags: Readonly<Partial<Record<FlagId, readonly string[]>>>
  /** `dir` puts directories first; `ls` is plain alphabetical. */
  readonly listDirsFirst: boolean
  /** `dir` is long by default and `/w` narrows it; `ls` is short and `-l` widens it. */
  readonly listLongByDefault: boolean
  /** `tree` shows only directories until `/f`; the Unix one shows everything. */
  readonly treeFilesByDefault: boolean
  /** `cd` alone prints the working directory on one side and goes home on the other. */
  readonly bareChangeDir: 'print' | 'home'
  /** `date`'s own spelling of now. */
  formatNow(at: Date): string
  /**
   * What the shell says to a word it does not know.
   *
   * COMMAND.COM never repeated the word back and a Unix shell always does, which is
   * a real difference in how the two families talk and costs one line to keep.
   */
  notFound(word: string): string
  /**
   * What marks a line as a complaint.
   *
   * Empty for the two families that had colour or a second attribute to say it with.
   * MPW had neither — its Worksheet was one ink on paper — so it wrote `###` in front
   * of every diagnostic, and that is the only thing that makes an error visible in a
   * 1-bit window. Rendering the alternative is what settled it: a tinted error in a
   * grey-ramp era reads as *unavailable*, which is the one thing grey already means.
   */
  readonly errorPrefix: string
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0')
}

function clock(at: Date): string {
  return `${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`
}

/**
 * The backslash family: MS-DOS and everything that inherited COMMAND.COM.
 *
 * `del` and `rd` are both listed against `remove` because a DOS user reaches for
 * whichever matches what they are deleting, and one implementation answers both —
 * `/s` is what distinguishes a recursive removal, exactly as `-r` does on the other
 * side. `ren` sits with `move` for the same reason: renaming is moving without
 * changing the parent, and DOS spelled the two differently while doing one thing.
 */
const DOS: Shell = {
  title: 'MS-DOS Prompt',
  promptSuffix: '>',
  flagPrefix: '/',
  names: {
    list: ['dir'],
    changeDir: ['cd', 'chdir'],
    showFile: ['type'],
    makeDir: ['md', 'mkdir'],
    remove: ['del', 'erase', 'rd', 'rmdir'],
    copy: ['copy'],
    move: ['move', 'ren', 'rename'],
    echo: ['echo'],
    touch: ['touch'],
    find: ['find'],
    tree: ['tree'],
    open: ['start'],
    clear: ['cls'],
    diskFree: ['chkdsk'],
    date: ['date'],
    version: ['ver'],
    help: ['help'],
    crash: ['crash'],
    reboot: ['reboot'],
    era: ['era'],
  },
  flags: {
    recurse: ['s'],
    wide: ['w'],
    files: ['f'],
  },
  listDirsFirst: true,
  listLongByDefault: true,
  treeFilesByDefault: false,
  bareChangeDir: 'print',
  formatNow(at: Date): string {
    return `${WEEKDAYS[at.getDay()]} ${pad(at.getMonth() + 1)}-${pad(at.getDate())}-${at.getFullYear()}  ${clock(at)}`
  },
  notFound(): string {
    return 'Bad command or file name'
  },
  errorPrefix: '',
}

/** The Unix vocabulary. Shared by the slash and colon shells; the wrappers differ. */
const UNIX_NAMES: Shell['names'] = {
  list: ['ls'],
  changeDir: ['cd'],
  printDir: ['pwd'],
  showFile: ['cat'],
  makeDir: ['mkdir'],
  remove: ['rm'],
  copy: ['cp'],
  move: ['mv'],
  echo: ['echo'],
  touch: ['touch'],
  find: ['find'],
  tree: ['tree'],
  open: ['open'],
  clear: ['clear'],
  diskFree: ['df'],
  date: ['date'],
  version: ['uname', 'ver'],
  help: ['help'],
  crash: ['crash'],
  reboot: ['reboot'],
  era: ['era'],
}

const UNIX_FLAGS: Shell['flags'] = {
  recurse: ['r', 'R'],
  long: ['l'],
  all: ['a'],
}

function unixShell(title: string, promptSuffix: string, errorPrefix = ''): Shell {
  return {
    title,
    promptSuffix,
    errorPrefix,
    flagPrefix: '-',
    names: UNIX_NAMES,
    flags: UNIX_FLAGS,
    listDirsFirst: false,
    listLongByDefault: false,
    treeFilesByDefault: true,
    bareChangeDir: 'home',
    formatNow(at: Date): string {
      const day = String(at.getDate()).padStart(2, ' ')
      return `${WEEKDAYS[at.getDay()]} ${MONTHS[at.getMonth()]} ${day} ${clock(at)} ${at.getFullYear()}`
    },
    notFound(word: string): string {
      return `${word}: command not found`
    },
  }
}

/**
 * The three shells, keyed by the separator the active codec spells paths with.
 *
 * The colon entry differs from the slash entry only in its window title and its
 * prompt terminator, because MPW's own Worksheet had no prompt at all: you typed a
 * command on any line and pressed Enter. A terminal with a fixed input line needs
 * *some* marker in front of it, so `>` is ours and is recorded as a choice rather
 * than a measurement. The path in front of it is what carries the era.
 */
const SHELLS: Readonly<Record<string, Shell>> = {
  '\\': DOS,
  '/': unixShell('Terminal', '$ '),
  ':': unixShell('MPW Shell', '> ', '### '),
}

/** The Unix shell, for a codec whose separator the table does not list. */
const FALLBACK = SHELLS['/'] as Shell

export function shellFor(separator: string): Shell {
  return SHELLS[separator] ?? FALLBACK
}

/** The spelling `help` prints, or undefined where this shell has no name for it. */
export function nameOf(shell: Shell, id: CommandId): string | undefined {
  return shell.names[id]?.[0]
}

/** Resolves a typed word to a command, case-insensitively as every era's shell was. */
export function commandFor(shell: Shell, word: string): CommandId | null {
  const wanted = word.toLowerCase()
  for (const id of COMMAND_ORDER) {
    const names = shell.names[id]
    if (names?.some((n) => n.toLowerCase() === wanted)) return id
  }
  return null
}
