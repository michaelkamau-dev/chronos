/**
 * The tier-1 widget kit.
 *
 * ARCHITECTURE.md §5 specifies two tiers. **Tier 1 is "same DOM, skin CSS
 * differs"**: the kit emits a stable vocabulary and each skin's stylesheet paints
 * all five states era-correctly. An app writes `ui.button({ label, onActivate })`
 * and never a class name, so a skin never sees app code and an app never sees a
 * skin. Tier 2 — a widget whose *structure* genuinely differs per era — is a
 * `WidgetRenderer` on the skin manifest and is not implemented here; see the note
 * at the bottom of this comment for what that costs and what was left out.
 *
 * **The vocabulary.** Every widget carries `data-ui="<kind>"`, and every
 * interactive one additionally carries `data-state`, one of
 * `rest | hover | active | focus | disabled`. Those two attributes are the entire
 * structural coupling between an app and a skin, exactly as `FramePart`'s
 * attributes are the entire coupling between the window manager and a skin. A
 * test asserts the active skin styles them.
 *
 * **Why `data-state` is written rather than left to `:hover` / `:active`.**
 * CSS could infer four of the five, and that is what makes writing them
 * worthwhile: `CLAUDE.md` requires all five states on every interactive element,
 * and a pseudo-class is something a skin can simply not write a rule for with
 * nothing failing. An attribute with a closed set of values can be asserted —
 * the same reasoning that put the five states into the type system in §5 and put
 * `data-minimized` on the window manager instead of in each skin's `applyState`.
 *
 * **One delegated listener per event type**, on the kit's root, not one per
 * widget — `CLAUDE.md`'s performance rule, and the reason a window with two
 * hundred rows in it costs six listeners rather than twelve hundred.
 *
 * **What is deliberately not here.** §5 lists tabs among the tier-1 widgets and
 * this kit has none: Files does not use them, and shipping a widget that cannot
 * be verified against six skins is worse than not shipping it. Scrollbars and the
 * icon view remain tier-2 candidates and are unbuilt for the same reason — they
 * are a contract change, and a contract change is raised rather than taken. The
 * list widget here is tier 1 *by construction*: it emits rows and cells into the
 * same data-attribute vocabulary and each skin paints them, which is what let the
 * file list ship without six skins each exporting a template first.
 */

/**
 * The five interactive states, in precedence order when more than one applies.
 *
 * `disabled` wins over everything: a disabled control that reported `hover`
 * because the pointer was over it would let a skin paint a hover face on a
 * control that cannot be activated.
 */
export type WidgetState = 'rest' | 'hover' | 'active' | 'focus' | 'disabled'

/** Every widget kind the kit emits, as it appears in `data-ui`. */
export type WidgetKind =
  | 'button'
  | 'label'
  | 'field'
  | 'checkbox'
  | 'radio'
  | 'group'
  | 'toolbar'
  | 'statusbar'
  | 'list'
  | 'listheader'
  | 'listrow'
  | 'listcell'
  | 'dialog'
  | 'dialogbody'
  | 'dialogbuttons'

export interface Widget {
  readonly el: HTMLElement
  destroy(): void
}

export interface ControlWidget extends Widget {
  setEnabled(on: boolean): void
  isEnabled(): boolean
  focus(): void
}

// ------------------------------------------------------------------- specs

export interface ButtonSpec {
  label: string
  onActivate(): void
  enabled?: boolean
  /** Accessible description, and the era's tooltip where it had one. */
  title?: string
  /**
   * The action Enter takes in a dialog. Skins paint it — Luna's heavier outline,
   * Aqua's pulsing blue, Platinum's double ring — so it is vocabulary, not styling.
   */
  isDefault?: boolean
  /**
   * A button that stays in when pressed, for an exclusive set like a view switch.
   *
   * `undefined` means an ordinary momentary button and emits no ARIA state at all;
   * a boolean makes it a toggle. This exists rather than a radio because a radio's
   * mark is a *circle*, and a circle drawn with `border-radius` antialiases — which
   * is a grey in an era that has none, and a real one: three of them put 2,569
   * mid-grey pixels into a 1-bit window. Every one of the six eras shipped its view
   * switch as a set of toolbar buttons anyway, so this is the more faithful control
   * uniformly rather than a concession to one era.
   */
  pressed?: boolean
}

export interface ButtonWidget extends ControlWidget {
  setLabel(text: string): void
  /** Only meaningful on a button that declared `pressed` when it was created. */
  setPressed(on: boolean): void
}

export interface LabelSpec {
  text: string
  /** Associates the label with a control, so clicking it focuses the control. */
  forWidget?: ControlWidget
}

export interface LabelWidget extends Widget {
  setText(text: string): void
}

export interface TextFieldSpec {
  /** Accessible name. A *visible* caption is a separate `label` widget. */
  label: string
  value?: string
  /** In-box hint text, shown while the field is empty. */
  hint?: string
  enabled?: boolean
  readOnly?: boolean
  onInput?(value: string): void
  /** Enter. */
  onCommit?(value: string): void
  /** Escape. */
  onCancel?(): void
  onBlur?(value: string): void
}

export interface TextFieldWidget extends ControlWidget {
  value(): string
  setValue(v: string): void
  /** Selects a range, or the whole value when called with no arguments. */
  select(start?: number, end?: number): void
  selection(): { start: number; end: number }
}

export interface CheckboxSpec {
  label: string
  checked?: boolean
  enabled?: boolean
  onChange(checked: boolean): void
}

export interface CheckboxWidget extends ControlWidget {
  checked(): boolean
  setChecked(on: boolean): void
}

export interface RadioSpec {
  label: string
  /** Radios sharing a group name are mutually exclusive and share arrow-key nav. */
  group: string
  checked?: boolean
  enabled?: boolean
  onChange(checked: boolean): void
}

export type RadioWidget = CheckboxWidget

export interface GroupSpec {
  /** The group's caption. Empty renders an unlabelled box, which some eras used. */
  label: string
}

export interface GroupWidget extends Widget {
  readonly body: HTMLElement
  setLabel(text: string): void
}

export interface ContainerWidget extends Widget {
  readonly body: HTMLElement
}

// -------------------------------------------------------------- list widget

export interface ListColumn {
  key: string
  label: string
  /** Logical era pixels. Omit to let the column take the remaining space. */
  width?: number
  align?: 'start' | 'end'
}

export interface ListRow {
  /** Stable identity across re-renders. Files uses the `NodeId`. */
  id: string
  /**
   * One entry per column for a `rows` list; for a `grid` list only the first is
   * shown as the item's caption.
   */
  cells: readonly string[]
  /**
   * The item's *category*, drawn before the first cell — `folder`, `document`,
   * `image`, `sound`, `trash`.
   *
   * **A category, never a character.** The first version of this passed a glyph
   * like `▸` and it was wrong in a way that is silent and total: an era's face is
   * a subset, `ChiKareGo2` carries no such codepoint, and a missing glyph does not
   * fail loudly — it falls back to the browser's default face, which antialiases in
   * greys. In a 1-bit era that is 2,569 mid-grey pixels in a window whose entire
   * thesis is that it has none, and nothing in the app would ever have reported it.
   * `CLAUDE.md` records the same trap for U+2014 in a window title.
   *
   * So the kit emits `data-glyph="<category>"` and no text at all, and the skin
   * paints it. An app cannot spell a character its era's face lacks if it never
   * spells a character.
   */
  glyph?: string
  /** Marks a row the era should draw as unavailable — a locked or system node. */
  disabled?: boolean
}

export interface ListSpec {
  /** Accessible name for the whole list. */
  label: string
  /**
   * `rows` is one item per line, optionally with columns. `grid` wraps items into
   * a flow, which is what an icon view is. Both emit the same row vocabulary, so a
   * skin styles one set of attributes and gets both.
   */
  layout: 'rows' | 'grid'
  /** A header row. Only meaningful for `rows`, and only when there is more than one column. */
  columns?: readonly ListColumn[]
  multiSelect?: boolean
  onSelectionChange?(ids: readonly string[]): void
  /** Double-click, or Enter on the focused row. */
  onActivate?(id: string): void
  /** Sort request from a click on a column header. */
  onSortColumn?(key: string): void
}

export interface ListWidget extends ControlWidget {
  setRows(rows: readonly ListRow[]): void
  setColumns(columns: readonly ListColumn[]): void
  setLayout(layout: 'rows' | 'grid'): void
  selection(): readonly string[]
  setSelection(ids: readonly string[]): void
  /** The row the keyboard is on. Also the anchor for shift-extension. */
  cursor(): string | null
  setCursor(id: string | null): void
  scrollOffset(): number
  setScrollOffset(px: number): void
  rowElement(id: string): HTMLElement | null
  /** The row under a client point, for hit-testing a context menu or a drop. */
  rowAt(clientX: number, clientY: number): string | null
}

// -------------------------------------------------------------------- kit

export interface UiKit {
  button(spec: ButtonSpec): ButtonWidget
  label(spec: LabelSpec): LabelWidget
  textField(spec: TextFieldSpec): TextFieldWidget
  checkbox(spec: CheckboxSpec): CheckboxWidget
  radio(spec: RadioSpec): RadioWidget
  group(spec: GroupSpec): GroupWidget
  toolbar(): ContainerWidget
  statusBar(): ContainerWidget
  list(spec: ListSpec): ListWidget
  /** Releases the kit's delegated listeners. Widgets are torn down with the DOM. */
  destroy(): void
}

/** Widgets whose `data-state` the kit maintains. */
const INTERACTIVE: ReadonlySet<string> = new Set([
  'button',
  'field',
  'checkbox',
  'radio',
  'list',
])

function isDisabled(el: HTMLElement): boolean {
  if (el instanceof HTMLButtonElement || el instanceof HTMLInputElement) return el.disabled
  return el.getAttribute('aria-disabled') === 'true'
}

/**
 * The kit's implementation.
 *
 * One instance per app host, rooted at that app's content element. The six
 * delegated listeners it attaches are the only listeners the kit adds, however
 * many widgets an app creates — a directory of two hundred files costs the same
 * six as an empty one.
 */
class Kit implements UiKit {
  private readonly root: HTMLElement
  private readonly doc: Document

  private hovered: HTMLElement | null = null
  private pressed: HTMLElement | null = null
  private focused: HTMLElement | null = null
  private readonly teardowns: Array<() => void> = []
  /** Radio groups, so exclusivity and arrow-key navigation stay inside the kit. */
  private readonly radioGroups = new Map<string, Set<HTMLInputElement>>()

  constructor(root: HTMLElement) {
    this.root = root
    this.doc = root.ownerDocument

    const on = <K extends keyof HTMLElementEventMap>(
      type: K,
      fn: (e: HTMLElementEventMap[K]) => void,
    ): void => {
      root.addEventListener(type, fn as EventListener)
      this.teardowns.push(() => root.removeEventListener(type, fn as EventListener))
    }

    on('pointerover', (e) => {
      const next = this.target(e.target)
      if (next === this.hovered) return
      const prev = this.hovered
      this.hovered = next
      if (prev) this.paint(prev)
      if (next) this.paint(next)
    })
    on('pointerout', (e) => {
      // `pointerout` fires when moving onto a descendant too; only clear when the
      // pointer has genuinely left the widget.
      const from = this.target(e.target)
      if (from !== this.hovered) return
      const to = e.relatedTarget instanceof Node ? this.target(e.relatedTarget) : null
      if (to === this.hovered) return
      const prev = this.hovered
      this.hovered = to
      if (prev) this.paint(prev)
      if (to) this.paint(to)
    })
    on('pointerdown', (e) => {
      const next = this.target(e.target)
      if (!next || isDisabled(next)) return
      this.pressed = next
      this.paint(next)
    })
    // The release can land anywhere, including outside the window, so the
    // pressed state is cleared from the document rather than from the root.
    const release = (): void => {
      const prev = this.pressed
      if (!prev) return
      this.pressed = null
      this.paint(prev)
    }
    this.doc.addEventListener('pointerup', release)
    this.doc.addEventListener('pointercancel', release)
    this.teardowns.push(() => {
      this.doc.removeEventListener('pointerup', release)
      this.doc.removeEventListener('pointercancel', release)
    })

    on('focusin', (e) => {
      const next = this.target(e.target)
      const prev = this.focused
      this.focused = next
      if (prev) this.paint(prev)
      if (next) this.paint(next)
    })
    on('focusout', () => {
      const prev = this.focused
      this.focused = null
      if (prev) this.paint(prev)
    })
  }

  destroy(): void {
    for (let i = this.teardowns.length - 1; i >= 0; i--) this.teardowns[i]?.()
    this.teardowns.length = 0
    this.radioGroups.clear()
    this.hovered = null
    this.pressed = null
    this.focused = null
  }

  // ------------------------------------------------------------- state machine

  private target(node: EventTarget | null): HTMLElement | null {
    if (!(node instanceof Element)) return null
    const el = node.closest<HTMLElement>('[data-ui]')
    if (!el || !this.root.contains(el)) return null
    return INTERACTIVE.has(el.dataset['ui'] ?? '') ? el : null
  }

  /** Writes `data-state`, applying the precedence in `WidgetState`'s doc comment. */
  private paint(el: HTMLElement): void {
    let state: WidgetState = 'rest'
    if (isDisabled(el)) state = 'disabled'
    else if (el === this.pressed) state = 'active'
    // Focus outranks hover so a keyboard user's position is never masked by where
    // the pointer happens to be resting.
    else if (el === this.focused) state = 'focus'
    else if (el === this.hovered) state = 'hover'
    el.dataset['state'] = state
  }

  /** Re-reads a control after its enabled or checked state changed under us. */
  private repaint(el: HTMLElement): void {
    if (isDisabled(el)) {
      if (this.hovered === el) this.hovered = null
      if (this.pressed === el) this.pressed = null
    }
    this.paint(el)
  }

  private make(kind: WidgetKind, tag = 'div'): HTMLElement {
    const el = this.doc.createElement(tag)
    el.dataset['ui'] = kind
    if (INTERACTIVE.has(kind)) el.dataset['state'] = 'rest'
    return el
  }

  // ----------------------------------------------------------------- widgets

  button(spec: ButtonSpec): ButtonWidget {
    const el = this.make('button', 'button') as HTMLButtonElement
    el.type = 'button'
    el.textContent = spec.label
    if (spec.title !== undefined) {
      el.title = spec.title
      el.setAttribute('aria-label', spec.title)
    }
    if (spec.isDefault === true) el.dataset['default'] = 'true'
    if (spec.pressed !== undefined) {
      el.setAttribute('aria-pressed', spec.pressed ? 'true' : 'false')
      el.dataset['pressed'] = spec.pressed ? 'true' : 'false'
    }
    el.disabled = spec.enabled === false
    const onClick = (): void => {
      if (!el.disabled) spec.onActivate()
    }
    el.addEventListener('click', onClick)
    this.paint(el)

    return {
      el,
      setLabel: (text) => {
        el.textContent = text
      },
      setPressed: (on) => {
        el.setAttribute('aria-pressed', on ? 'true' : 'false')
        el.dataset['pressed'] = on ? 'true' : 'false'
      },
      setEnabled: (on) => {
        el.disabled = !on
        this.repaint(el)
      },
      isEnabled: () => !el.disabled,
      focus: () => el.focus(),
      destroy: () => {
        el.removeEventListener('click', onClick)
        el.remove()
      },
    }
  }

  label(spec: LabelSpec): LabelWidget {
    const el = this.make('label', 'label') as HTMLLabelElement
    el.textContent = spec.text
    if (spec.forWidget) {
      const target = spec.forWidget.el
      if (!target.id) target.id = uniqueId(this.doc)
      el.htmlFor = target.id
    }
    return {
      el,
      setText: (text) => {
        el.textContent = text
      },
      destroy: () => el.remove(),
    }
  }

  textField(spec: TextFieldSpec): TextFieldWidget {
    const el = this.make('field', 'input') as HTMLInputElement
    el.type = 'text'
    el.setAttribute('aria-label', spec.label)
    el.spellcheck = false
    // The autocomplete opt-out matters here: a browser dropdown over an era's own
    // chrome is the one thing in this project no skin can style.
    el.autocomplete = 'off'
    el.value = spec.value ?? ''
    if (spec.hint !== undefined) el.placeholder = spec.hint
    el.disabled = spec.enabled === false
    el.readOnly = spec.readOnly === true

    const onInput = (): void => spec.onInput?.(el.value)
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Enter') {
        // The commit must not also reach a dialog's default button, or a rename
        // and an OK fire from one keystroke.
        e.stopPropagation()
        e.preventDefault()
        spec.onCommit?.(el.value)
        return
      }
      if (e.key === 'Escape') {
        e.stopPropagation()
        e.preventDefault()
        spec.onCancel?.()
      }
    }
    const onBlur = (): void => spec.onBlur?.(el.value)
    el.addEventListener('input', onInput)
    el.addEventListener('keydown', onKeyDown)
    el.addEventListener('blur', onBlur)
    this.paint(el)

    return {
      el,
      value: () => el.value,
      setValue: (v) => {
        el.value = v
      },
      select: (start, end) => {
        if (start === undefined) el.select()
        else el.setSelectionRange(start, end ?? start)
      },
      selection: () => ({
        start: el.selectionStart ?? 0,
        end: el.selectionEnd ?? 0,
      }),
      setEnabled: (on) => {
        el.disabled = !on
        this.repaint(el)
      },
      isEnabled: () => !el.disabled,
      focus: () => el.focus(),
      destroy: () => {
        el.removeEventListener('input', onInput)
        el.removeEventListener('keydown', onKeyDown)
        el.removeEventListener('blur', onBlur)
        el.remove()
      },
    }
  }

  checkbox(spec: CheckboxSpec): CheckboxWidget {
    return this.toggle('checkbox', spec.label, spec.checked === true, spec.enabled !== false, (on) =>
      spec.onChange(on),
    )
  }

  radio(spec: RadioSpec): RadioWidget {
    const widget = this.toggle(
      'radio',
      spec.label,
      spec.checked === true,
      spec.enabled !== false,
      (on) => {
        if (on) this.clearGroup(spec.group, widget.el as HTMLInputElement)
        spec.onChange(on)
      },
      spec.group,
    )
    let set = this.radioGroups.get(spec.group)
    if (!set) {
      set = new Set()
      this.radioGroups.set(spec.group, set)
    }
    const input = widget.el.querySelector('input') ?? (widget.el as HTMLInputElement)
    if (input instanceof HTMLInputElement) set.add(input)
    return widget
  }

  private clearGroup(group: string, keep: HTMLInputElement): void {
    const set = this.radioGroups.get(group)
    if (!set) return
    for (const input of set) {
      if (input !== keep) input.checked = false
    }
  }

  /**
   * Checkbox and radio share every line except the input type and the exclusivity,
   * so they share an implementation. The wrapper carries `data-ui` and the input
   * carries the semantics, which is what lets a skin draw an era's own box or
   * diamond over a hidden native control without losing the accessibility tree.
   */
  private toggle(
    kind: 'checkbox' | 'radio',
    label: string,
    checked: boolean,
    enabled: boolean,
    onChange: (checked: boolean) => void,
    group?: string,
  ): CheckboxWidget {
    const el = this.make(kind, 'label') as HTMLLabelElement
    const input = this.doc.createElement('input')
    input.type = kind
    if (group !== undefined) input.name = group
    input.checked = checked
    input.disabled = !enabled
    input.dataset['uiInput'] = 'true'
    const text = this.doc.createElement('span')
    text.dataset['uiText'] = 'true'
    text.textContent = label
    el.append(input, text)
    el.setAttribute('aria-disabled', enabled ? 'false' : 'true')

    const onInputChange = (): void => onChange(input.checked)
    input.addEventListener('change', onInputChange)
    this.paint(el)

    return {
      el,
      checked: () => input.checked,
      setChecked: (on) => {
        input.checked = on
      },
      setEnabled: (on) => {
        input.disabled = !on
        el.setAttribute('aria-disabled', on ? 'false' : 'true')
        this.repaint(el)
      },
      isEnabled: () => !input.disabled,
      focus: () => input.focus(),
      destroy: () => {
        input.removeEventListener('change', onInputChange)
        this.radioGroups.get(input.name)?.delete(input)
        el.remove()
      },
    }
  }

  group(spec: GroupSpec): GroupWidget {
    const el = this.make('group', 'fieldset') as HTMLFieldSetElement
    const legend = this.doc.createElement('legend')
    legend.textContent = spec.label
    const body = this.doc.createElement('div')
    body.dataset['uiBody'] = 'true'
    el.append(legend, body)
    return {
      el,
      body,
      setLabel: (text) => {
        legend.textContent = text
      },
      destroy: () => el.remove(),
    }
  }

  toolbar(): ContainerWidget {
    const el = this.make('toolbar')
    el.setAttribute('role', 'toolbar')
    return { el, body: el, destroy: () => el.remove() }
  }

  statusBar(): ContainerWidget {
    const el = this.make('statusbar')
    el.setAttribute('role', 'status')
    return { el, body: el, destroy: () => el.remove() }
  }

  list(spec: ListSpec): ListWidget {
    return new ListImpl(this, this.doc, spec)
  }

  /** Internal hooks the list needs, kept off the public `UiKit` surface. */
  internal(): {
    make(kind: WidgetKind, tag?: string): HTMLElement
    repaint(el: HTMLElement): void
  } {
    return {
      make: (kind, tag) => this.make(kind, tag),
      repaint: (el) => this.repaint(el),
    }
  }
}

let idCounter = 0
function uniqueId(doc: Document): string {
  let id = ''
  do {
    idCounter++
    id = `ui-${idCounter}`
  } while (doc.getElementById(id) !== null)
  return id
}

/**
 * The list.
 *
 * Rows are rebuilt from the caller's data on every `setRows`, because the app that
 * owns this list renders from filesystem reads and holds no duplicate state — so
 * the list holds none either, beyond the selection and cursor that are genuinely
 * view state and have nowhere else to live.
 *
 * Selection and cursor are *identity*-based rather than index-based, which is what
 * keeps them correct when a sibling window renames a file and the sort order moves
 * a row out from under the keyboard.
 */
class ListImpl implements ListWidget {
  readonly el: HTMLElement

  private readonly doc: Document
  private readonly spec: ListSpec
  private readonly headerEl: HTMLElement
  private readonly bodyEl: HTMLElement
  private readonly rowEls = new Map<string, HTMLElement>()

  private columns: readonly ListColumn[]
  private layout: 'rows' | 'grid'
  private rows: readonly ListRow[] = []
  private selected: string[] = []
  private cursorId: string | null = null
  /** Shift-extension anchors here, so a run grows and shrinks from one end. */
  private anchorId: string | null = null
  private enabled = true

  constructor(kit: Kit, doc: Document, spec: ListSpec) {
    this.doc = doc
    this.spec = spec
    this.columns = spec.columns ?? []
    this.layout = spec.layout

    const api = kit.internal()
    this.el = api.make('list')
    this.el.tabIndex = 0
    this.el.setAttribute('role', spec.multiSelect === true ? 'listbox' : 'listbox')
    if (spec.multiSelect === true) this.el.setAttribute('aria-multiselectable', 'true')
    this.el.setAttribute('aria-label', spec.label)
    this.el.dataset['layout'] = this.layout

    this.headerEl = api.make('listheader')
    this.headerEl.setAttribute('role', 'row')
    this.bodyEl = doc.createElement('div')
    this.bodyEl.dataset['uiBody'] = 'true'
    this.el.append(this.headerEl, this.bodyEl)

    this.el.addEventListener('keydown', (e) => this.onKeyDown(e))
    this.el.addEventListener('pointerdown', (e) => this.onPointerDown(e))
    this.el.addEventListener('dblclick', (e) => this.onDoubleClick(e))
    this.renderHeader()
  }

  // --------------------------------------------------------------- public API

  setColumns(columns: readonly ListColumn[]): void {
    this.columns = columns
    this.renderHeader()
    this.renderRows()
  }

  setLayout(layout: 'rows' | 'grid'): void {
    if (this.layout === layout) return
    this.layout = layout
    this.el.dataset['layout'] = layout
    this.renderHeader()
    this.renderRows()
  }

  setRows(rows: readonly ListRow[]): void {
    this.rows = rows
    // A selection that survives a re-render must not include ids that no longer
    // exist, or "3 items selected" counts files a sibling window deleted.
    const present = new Set(rows.map((r) => r.id))
    const keptSelection = this.selected.filter((id) => present.has(id))
    const selectionChanged = keptSelection.length !== this.selected.length
    this.selected = keptSelection
    if (this.cursorId !== null && !present.has(this.cursorId)) this.cursorId = null
    if (this.anchorId !== null && !present.has(this.anchorId)) this.anchorId = null
    this.renderRows()
    if (selectionChanged) this.spec.onSelectionChange?.(this.selected)
  }

  selection(): readonly string[] {
    return this.selected
  }

  setSelection(ids: readonly string[]): void {
    const present = new Set(this.rows.map((r) => r.id))
    this.selected = ids.filter((id) => present.has(id))
    if (this.selected.length > 0) {
      const last = this.selected[this.selected.length - 1]
      this.anchorId = last ?? null
      if (this.cursorId === null) this.cursorId = last ?? null
    }
    this.applySelectionAttributes()
  }

  cursor(): string | null {
    return this.cursorId
  }

  setCursor(id: string | null): void {
    this.cursorId = id
    this.applySelectionAttributes()
  }

  scrollOffset(): number {
    return this.el.scrollTop
  }

  setScrollOffset(px: number): void {
    this.el.scrollTop = px
  }

  rowElement(id: string): HTMLElement | null {
    return this.rowEls.get(id) ?? null
  }

  rowAt(clientX: number, clientY: number): string | null {
    const node = this.doc.elementFromPoint(clientX, clientY)
    if (!(node instanceof Element)) return null
    const row = node.closest<HTMLElement>('[data-ui="listrow"]')
    if (!row || !this.el.contains(row)) return null
    return row.dataset['rowId'] ?? null
  }

  setEnabled(on: boolean): void {
    this.enabled = on
    this.el.setAttribute('aria-disabled', on ? 'false' : 'true')
    this.el.dataset['state'] = on ? 'rest' : 'disabled'
    this.el.tabIndex = on ? 0 : -1
  }

  isEnabled(): boolean {
    return this.enabled
  }

  focus(): void {
    this.el.focus()
  }

  destroy(): void {
    this.rowEls.clear()
    this.el.remove()
  }

  // ----------------------------------------------------------------- private

  private renderHeader(): void {
    this.headerEl.textContent = ''
    // A header is meaningless in a grid, and meaningless with nothing to label.
    const show = this.layout === 'rows' && this.columns.length > 1
    this.headerEl.hidden = !show
    if (!show) return
    for (const col of this.columns) {
      const cell = this.doc.createElement('div')
      cell.dataset['ui'] = 'listcell'
      cell.dataset['columnKey'] = col.key
      cell.setAttribute('role', 'columnheader')
      cell.textContent = col.label
      if (col.width !== undefined) cell.style.flex = `0 0 ${col.width}px`
      if (col.align === 'end') cell.dataset['align'] = 'end'
      if (this.spec.onSortColumn) {
        cell.tabIndex = 0
        const sort = (): void => this.spec.onSortColumn?.(col.key)
        cell.addEventListener('click', sort)
        cell.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            sort()
          }
        })
      }
      this.headerEl.appendChild(cell)
    }
  }

  private renderRows(): void {
    this.bodyEl.textContent = ''
    this.rowEls.clear()
    for (const row of this.rows) {
      const el = this.doc.createElement('div')
      el.dataset['ui'] = 'listrow'
      el.dataset['rowId'] = row.id
      el.setAttribute('role', 'option')
      el.tabIndex = -1
      if (row.disabled === true) el.setAttribute('aria-disabled', 'true')

      if (row.glyph !== undefined) {
        const glyph = this.doc.createElement('span')
        glyph.dataset['uiGlyph'] = 'true'
        glyph.dataset['glyph'] = row.glyph
        // No text content: see `ListRow.glyph`. The shape is the skin's.
        glyph.setAttribute('aria-hidden', 'true')
        el.appendChild(glyph)
      }

      const cellCount = this.layout === 'grid' ? 1 : Math.max(1, this.columns.length)
      for (let i = 0; i < cellCount; i++) {
        const cell = this.doc.createElement('div')
        cell.dataset['ui'] = 'listcell'
        const col = this.columns[i]
        if (col) {
          cell.dataset['columnKey'] = col.key
          if (col.width !== undefined) cell.style.flex = `0 0 ${col.width}px`
          if (col.align === 'end') cell.dataset['align'] = 'end'
        }
        cell.textContent = row.cells[i] ?? ''
        el.appendChild(cell)
      }

      this.rowEls.set(row.id, el)
      this.bodyEl.appendChild(el)
    }
    this.applySelectionAttributes()
  }

  private applySelectionAttributes(): void {
    const chosen = new Set(this.selected)
    for (const [id, el] of this.rowEls) {
      el.setAttribute('aria-selected', chosen.has(id) ? 'true' : 'false')
      if (id === this.cursorId) el.dataset['cursor'] = 'true'
      else delete el.dataset['cursor']
    }
    // The active-descendant pointer is what makes a single-tab-stop list readable
    // to a screen reader: the list keeps focus, the cursor row is announced.
    const cursorEl = this.cursorId !== null ? this.rowEls.get(this.cursorId) : undefined
    if (cursorEl) {
      if (!cursorEl.id) cursorEl.id = uniqueId(this.doc)
      this.el.setAttribute('aria-activedescendant', cursorEl.id)
    } else {
      this.el.removeAttribute('aria-activedescendant')
    }
  }

  private index(id: string | null): number {
    if (id === null) return -1
    return this.rows.findIndex((r) => r.id === id)
  }

  private onPointerDown(e: PointerEvent): void {
    if (!this.enabled) return
    const target = e.target
    if (!(target instanceof Element)) return
    const rowEl = target.closest<HTMLElement>('[data-ui="listrow"]')
    if (!rowEl || !this.bodyEl.contains(rowEl)) return
    const id = rowEl.dataset['rowId']
    if (id === undefined) return
    // Keep focus on the list rather than letting it land on the row, so one tab
    // stop covers the whole control in every era.
    e.preventDefault()
    this.el.focus()
    this.clickSelect(id, e.shiftKey, e.ctrlKey || e.metaKey)
  }

  private onDoubleClick(e: MouseEvent): void {
    if (!this.enabled) return
    const target = e.target
    if (!(target instanceof Element)) return
    const rowEl = target.closest<HTMLElement>('[data-ui="listrow"]')
    const id = rowEl?.dataset['rowId']
    if (id !== undefined) this.spec.onActivate?.(id)
  }

  private clickSelect(id: string, shift: boolean, toggle: boolean): void {
    const multi = this.spec.multiSelect === true
    if (multi && shift && this.anchorId !== null) {
      this.selectRange(this.anchorId, id)
    } else if (multi && toggle) {
      const at = this.selected.indexOf(id)
      if (at >= 0) this.selected.splice(at, 1)
      else this.selected.push(id)
      this.anchorId = id
    } else {
      this.selected = [id]
      this.anchorId = id
    }
    this.cursorId = id
    this.applySelectionAttributes()
    this.spec.onSelectionChange?.(this.selected)
  }

  private selectRange(fromId: string, toId: string): void {
    const a = this.index(fromId)
    const b = this.index(toId)
    if (a < 0 || b < 0) return
    const lo = Math.min(a, b)
    const hi = Math.max(a, b)
    const run: string[] = []
    for (let i = lo; i <= hi; i++) {
      const row = this.rows[i]
      if (row) run.push(row.id)
    }
    this.selected = run
  }

  /**
   * Keyboard navigation.
   *
   * Every mouse interaction above has a path here, which `CLAUDE.md` requires and
   * `a11y.spec.ts` checks across the vocabulary: arrows move, Enter activates,
   * Home and End jump, Shift extends, Ctrl+A takes everything, and typing jumps to
   * the next matching name — the type-ahead every one of the six eras had.
   */
  private onKeyDown(e: KeyboardEvent): void {
    if (!this.enabled || this.rows.length === 0) return
    /*
     * A key pressed inside a control the list is *hosting* is not a key pressed on
     * the list. The list is the only tab stop — rows carry `tabIndex = -1` and are
     * never focused — so anything else that reports focus is a descendant widget,
     * and a rename editor is exactly that.
     *
     * Without this the type-ahead below reads every printable character typed into
     * a rename field and calls `preventDefault()` on it, so the character never
     * reaches the input: the name comes out as whichever few keystrokes happened to
     * lose the race. Same shape as DECISIONS 1.9 — the surface that owns an event
     * must not also consume the events belonging to what it opened.
     */
    if (e.target !== this.el) return
    const current = this.index(this.cursorId)
    const step = (delta: number): void => {
      const next = current < 0 ? (delta > 0 ? 0 : this.rows.length - 1) : current + delta
      const clamped = Math.max(0, Math.min(this.rows.length - 1, next))
      const row = this.rows[clamped]
      if (!row) return
      this.moveCursor(row.id, e.shiftKey)
      e.preventDefault()
    }

    switch (e.key) {
      case 'ArrowDown':
        step(1)
        return
      case 'ArrowUp':
        step(-1)
        return
      case 'Home':
        step(-this.rows.length)
        return
      case 'End':
        step(this.rows.length)
        return
      case 'Enter': {
        if (this.cursorId !== null) {
          e.preventDefault()
          this.spec.onActivate?.(this.cursorId)
        }
        return
      }
      case ' ': {
        if (this.cursorId !== null) {
          e.preventDefault()
          this.clickSelect(this.cursorId, false, this.spec.multiSelect === true)
        }
        return
      }
      case 'a':
      case 'A': {
        if ((e.ctrlKey || e.metaKey) && this.spec.multiSelect === true) {
          e.preventDefault()
          this.selected = this.rows.map((r) => r.id)
          this.applySelectionAttributes()
          this.spec.onSelectionChange?.(this.selected)
        }
        return
      }
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          this.typeAhead(e.key)
          e.preventDefault()
        }
    }
  }

  private moveCursor(id: string, extend: boolean): void {
    this.cursorId = id
    if (extend && this.spec.multiSelect === true && this.anchorId !== null) {
      this.selectRange(this.anchorId, id)
    } else {
      this.selected = [id]
      this.anchorId = id
    }
    this.applySelectionAttributes()
    this.rowEls.get(id)?.scrollIntoView({ block: 'nearest' })
    this.spec.onSelectionChange?.(this.selected)
  }

  private typeAheadBuffer = ''
  private typeAheadAt = 0

  private typeAhead(ch: string): void {
    const now = performance.now()
    // One second matches the classic Finder and Explorer behaviour closely enough
    // that neither feels wrong; it is a shared default, not an era value.
    this.typeAheadBuffer = now - this.typeAheadAt > 1000 ? ch : this.typeAheadBuffer + ch
    this.typeAheadAt = now
    const needle = this.typeAheadBuffer.toLowerCase()
    const start = Math.max(0, this.index(this.cursorId))
    for (let n = 0; n < this.rows.length; n++) {
      // Start one past the cursor when repeating a single character, so pressing
      // the same letter walks through every match instead of sticking on the first.
      const offset = this.typeAheadBuffer.length === 1 ? n + 1 : n
      const row = this.rows[(start + offset) % this.rows.length]
      if (!row) continue
      if ((row.cells[0] ?? '').toLowerCase().startsWith(needle)) {
        this.moveCursor(row.id, false)
        return
      }
    }
  }
}

export function createUiKit(root: HTMLElement): UiKit {
  return new Kit(root)
}
