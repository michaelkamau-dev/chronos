/**
 * Mac OS 8 Platinum menu renderer.
 *
 * Menus are a tier-2 widget — the structure genuinely differs per era — so this
 * supplies its own template against the controller's contract and emits the
 * `data-menu*` vocabulary, so nothing downstream depends on a class name.
 *
 * Three things here are Platinum and measured rather than styled:
 *
 * - **A disabled item is a solid `#888888`, not a stipple.** System 1 and Windows 3.1
 *   both knock a 50% checkerboard out of the glyph; Mac OS 8 does not, and the parity
 *   counts that prove it are in `docs/eras/macos8.md` §6. Nothing to do here beyond
 *   letting the colour do the work — but it is worth saying, because a skin that
 *   copied System 1's stipple would be four years out of date and would look plausible.
 * - **The separator reuses Apple's 2px etch inside a 6px item**: two rows of face, the
 *   `#888888` rule, the `#FFFFFF` engrave, two rows of face.
 * - **Keyboard equivalents are drawn with Chicago's own command glyph**, `U+E003`.
 *   ChicagoFLF has no `U+2318`; it preserves Chicago's symbol set in the private use
 *   area at `U+E000` + the classic character code. Composing `⌘` from `U+2318` renders
 *   as tofu.
 *
 * The accelerator column's alignment is a standard-behaviour assumption, not a
 * measurement: every accelerator in Apple's figure is the command glyph plus a single
 * 6px capital, so right-aligned and fixed-left produce identical pixels — the same trap
 * `CLAUDE.md` records for Windows 3.1's `Ctrl+F4` / `Ctrl+F6`.
 */

import type { MenuRenderer, MenuSpec, MenuView } from '../../core/input/menu.js'
import { MACOS8 } from './metrics.js'

const CMD = MACOS8.font.symbols.command

/**
 * Rewrites a chord into the era's own notation.
 *
 * `Meta+W` is how the keymap spells it; `⌘W` is how a Mac drew it, with Chicago's own
 * command glyph rather than the word.
 *
 * **ChicagoFLF has no shift, option or control glyph** — its private use area carries
 * only command, check, diamond and Apple, verified by rasterising each. So those three
 * modifiers fall back to the Unicode symbols, which resolve from the fallback face and
 * will not match Chicago's weight. That is a stated loss rather than a hidden one, and
 * it is why this era's keymap keeps menu accelerators to plain command chords: the
 * fallback exists for correctness, not to be rendered.
 */
const FALLBACK_MODIFIERS: ReadonlyArray<readonly [string, string]> = [
  ['Control', '⌃'],
  ['Alt', '⌥'],
  ['Shift', '⇧'],
]

export function macos8Accel(chord: string): string {
  const parts = chord.split('+')
  const key = parts[parts.length - 1] ?? ''
  let out = ''
  for (const [name, glyph] of FALLBACK_MODIFIERS) {
    if (parts.includes(name)) out += glyph
  }
  if (parts.includes('Meta')) out += CMD
  return out + key.toUpperCase()
}

export class Macos8MenuRenderer implements MenuRenderer {
  createMenu(spec: MenuSpec): MenuView {
    const el = document.createElement('div')
    el.className = 'm8-menu'
    el.dataset['menu'] = ''
    el.setAttribute('role', 'menu')

    const entryEls: HTMLElement[] = []
    for (const entry of spec) {
      if (entry.kind === 'separator') {
        const sep = document.createElement('div')
        sep.className = 'm8-menu-separator'
        sep.dataset['menuSeparator'] = ''
        sep.setAttribute('role', 'separator')
        el.appendChild(sep)
        entryEls.push(sep)
        continue
      }

      const item = document.createElement('div')
      item.className = 'm8-menu-item'
      item.dataset['menuItem'] = ''
      if (entry.kind === 'submenu') item.dataset['menuSubmenu'] = ''
      item.setAttribute('role', 'menuitem')
      item.setAttribute('aria-disabled', entry.enabled ? 'false' : 'true')
      if (entry.kind === 'submenu') item.setAttribute('aria-haspopup', 'true')

      const check = document.createElement('span')
      check.className = 'm8-menu-check'
      // Chicago's own check glyph, not a Unicode tick — same private-use reasoning as
      // the command key.
      check.textContent =
        entry.kind === 'item' && entry.checked ? MACOS8.font.symbols.check : ''
      item.appendChild(check)

      const label = document.createElement('span')
      label.className = 'm8-menu-label'
      label.textContent = entry.label
      item.appendChild(label)

      const accel = document.createElement('span')
      accel.className = 'm8-menu-accel'
      accel.textContent =
        entry.kind === 'item' && entry.accel ? macos8Accel(entry.accel) : ''
      item.appendChild(accel)

      const sub = document.createElement('span')
      sub.className = 'm8-menu-sub'
      sub.textContent = entry.kind === 'submenu' ? '▶' : ''
      item.appendChild(sub)

      el.appendChild(item)
      entryEls.push(item)
    }

    return { el, entryEls }
  }

  setHighlight(view: MenuView, index: number | null): void {
    for (let i = 0; i < view.entryEls.length; i++) {
      const el = view.entryEls[i]
      if (!el) continue
      if (i === index) el.dataset['highlight'] = 'true'
      else delete el.dataset['highlight']
    }
  }

  destroyMenu(view: MenuView): void {
    view.entryEls.length = 0
  }
}
