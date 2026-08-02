/**
 * The scrollback: its model, and the view that projects it.
 *
 * **Why output is cells rather than padded text.** A terminal aligns its columns
 * because its face is monospaced. Not one of the six faces this project ships is:
 * measured advances for `i` and `W` in the era faces run 4.00/12.00, 6.00/9.00,
 * 3.61/12.85, 4.00/12.00, 4.00/12.00 and 5.13/18.19 — every one of them
 * proportional. Padding a name to a column with spaces would therefore align
 * nothing, in any era. And the alternative — a monospaced face per era — is a font
 * task with its own gate: `CLAUDE.md` forbids building on an unresolved font, and
 * six substitutes at six sizes are six unresolved fonts. `docs/apps/terminal.md`
 * records what that costs and what would settle it.
 *
 * So a row is a list of cells and the browser sizes the columns to their content.
 * That aligns exactly, at any face and any size, and it is the same answer the file
 * list arrived at one app earlier.
 *
 * **Every character is ASCII.** No era face carries the box-drawing set — measured:
 * `─ │ └ ├ ┼ ┐ ┘` are absent from all six, and `→ ▸` with them, while the classic
 * 1-bit face additionally lacks `… — •`. A missing glyph does not fail loudly; it
 * falls back to the browser's default face and antialiases, which is 1-bit windows
 * full of mid grey and a suite that never notices. `tree` therefore draws `+---`
 * and `\---`, which is exactly what `tree /a` printed, and its indentation is
 * structural rather than spaces.
 */

export type Tone = 'normal' | 'input' | 'error'
export type Align = 'start' | 'end'

export interface Row {
  readonly cells: readonly string[]
  /** Depth, for `tree`. Indentation is CSS, not padding. */
  readonly indent?: number
}

export interface Block {
  readonly tone: Tone
  readonly rows: readonly Row[]
  /** One entry per column; absent columns start-align. */
  readonly align?: readonly Align[]
}

/**
 * How many rows the scrollback keeps.
 *
 * A cap rather than unbounded growth, because every era's console had one and
 * because a full rebuild on resume is proportional to it. 1000 rows is the largest
 * of the six work areas many times over.
 */
export const SCROLLBACK_ROWS = 1000

/** A single line of ordinary output. The shape most callers want. */
export function line(text: string, tone: Tone = 'normal'): Block {
  return { tone, rows: [{ cells: [text] }] }
}

/** Several lines of ordinary output as one block. */
export function lines(texts: readonly string[], tone: Tone = 'normal'): Block {
  return { tone, rows: texts.map((text) => ({ cells: [text] })) }
}

export class ConsoleView {
  readonly el: HTMLElement
  private readonly doc: Document
  private readonly blocks: Block[] = []
  /** Rows currently in `blocks`, kept alongside so the cap costs no walk. */
  private rowCount = 0

  constructor(doc: Document) {
    this.doc = doc
    const el = doc.createElement('div')
    el.dataset['uiRole'] = 'console'
    // Not a tab stop — the command line is the app's one stop and a terminal that
    // needed two Tab presses to reach its input would be wrong in every era. It is
    // still programmatically focusable so a click on the scrollback can put the
    // caret back where typing belongs.
    el.tabIndex = -1
    this.el = el
  }

  /** The model, for the suspend round trip and for saving a transcript. */
  contents(): readonly Block[] {
    return this.blocks
  }

  rows(): number {
    return this.rowCount
  }

  /** Appends and renders in one step, which is the path every command takes. */
  append(block: Block): void {
    if (block.rows.length === 0) return
    this.blocks.push(block)
    this.rowCount += block.rows.length
    this.el.appendChild(this.renderBlock(block))
    this.trim()
  }

  clear(): void {
    this.blocks.length = 0
    this.rowCount = 0
    this.el.replaceChildren()
  }

  /**
   * Rebuilds every block from the model.
   *
   * Called on mount and on resume. The incremental `append` above and this share one
   * `renderBlock`, so the two paths cannot drift into rendering the same block
   * differently — which is the failure a second rendering path always eventually has.
   */
  rebuild(): void {
    const frag = this.doc.createDocumentFragment()
    for (const block of this.blocks) frag.appendChild(this.renderBlock(block))
    this.el.replaceChildren(frag)
  }

  scrollOffset(): number {
    return this.el.scrollTop
  }

  setScrollOffset(px: number): void {
    this.el.scrollTop = px
  }

  scrollToEnd(): void {
    this.el.scrollTop = this.el.scrollHeight
  }

  /** The scrollback as text, for a saved transcript. Cells join with a space. */
  toText(): string {
    const out: string[] = []
    for (const block of this.blocks) {
      for (const row of block.rows) {
        const indent = '  '.repeat(row.indent ?? 0)
        out.push(indent + row.cells.join(' ').trimEnd())
      }
    }
    return out.join('\n')
  }

  private trim(): void {
    while (this.rowCount > SCROLLBACK_ROWS && this.blocks.length > 1) {
      const oldest = this.blocks.shift()
      if (!oldest) break
      this.rowCount -= oldest.rows.length
      this.el.firstElementChild?.remove()
    }
  }

  private renderBlock(block: Block): HTMLElement {
    const el = this.doc.createElement('div')
    el.dataset['termBlock'] = ''
    el.dataset['tone'] = block.tone
    const columns = block.rows.reduce((n, row) => Math.max(n, row.cells.length), 0)
    // One column is prose and wraps; more than one is a table and the browser sizes
    // the columns to their content, which is what makes them line up under a
    // proportional face.
    if (columns > 1) {
      el.dataset['termTable'] = ''
      el.style.setProperty('--term-columns', String(columns))
    }
    for (const row of block.rows) el.appendChild(this.renderRow(row, block, columns))
    return el
  }

  private renderRow(row: Row, block: Block, columns: number): HTMLElement {
    const el = this.doc.createElement('div')
    el.dataset['termRow'] = ''
    if (row.indent !== undefined && row.indent > 0) {
      el.dataset['termIndent'] = String(row.indent)
      el.style.setProperty('--term-indent', String(row.indent))
    }
    if (columns <= 1) {
      // An empty line still has to occupy one, which an empty text node does not.
      el.textContent = row.cells[0] ?? ' '
      if ((row.cells[0] ?? '').length === 0) el.dataset['termBlank'] = ''
      return el
    }
    for (let i = 0; i < columns; i++) {
      const cell = this.doc.createElement('span')
      cell.dataset['termCell'] = ''
      const align = block.align?.[i]
      if (align === 'end') cell.dataset['align'] = 'end'
      cell.textContent = row.cells[i] ?? ''
      el.appendChild(cell)
    }
    return el
  }
}
