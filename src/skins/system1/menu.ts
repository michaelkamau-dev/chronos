/**
 * Macintosh System 1 menu renderer.
 *
 * Menus are a tier-2 widget — the structure genuinely differs per era — so this
 * supplies its own template against the controller's contract and emits the
 * `data-menu*` vocabulary, so nothing downstream depends on a class name.
 *
 * Four things here are measured from Apple's own File menu bitmap and are what a
 * classic-Mac recreation usually gets wrong:
 *
 * 1. **A separator is a full 16px item**, not a thin rule. Its ninth row carries a
 *    1px 50% pattern spanning the menu's whole interior width. The arithmetic closes
 *    exactly: nine items plus three separators at 16px is 192px against a measured
 *    192px interior.
 * 2. **The divider is a grey line, which on 1-bit hardware means alternating pixels.**
 *    Measured 56 ink pixels across a 111px interior, every one on the same parity.
 * 3. **A disabled item is a 50% checkerboard knocked out of the drawn glyph** —
 *    `notPatBic`. Proven by parity: `Revert` is 77 ink pixels with 77 on one
 *    `(x + y)` parity, against `Save As...` at 179 split 91/88. The construction is
 *    Windows 3.1's knockout overlay, reused unchanged, because `GrayString` and
 *    `notPatBic` are the same mechanism.
 * 4. **The accelerator is drawn, not typeset.** `U+2318` is absent from every Chicago
 *    substitute that holds the pixel grid, so the command symbol is the measured 9x9
 *    bitmap from the figure, rendered as a `box-shadow` glyph.
 */

import type { MenuRenderer, MenuSpec, MenuView } from '../../core/input/menu.js'

/**
 * Splits a chord into its Command-key form, or returns null.
 *
 * The accelerator column can only show what the era could print. The Macintosh 128K
 * keyboard has **no Control, Option, Escape or arrow keys** — they arrive with later
 * keyboards — so there is no era glyph for those modifiers, and inventing one to
 * decorate a menu would be exactly the kind of plausible fabrication the fidelity
 * rules exist to stop. A chord the era cannot spell therefore renders as nothing; it
 * still works from the keyboard, it just is not advertised in Chicago 12.
 */
function commandChord(chord: string): string | null {
  const parts = chord.split('+').map((p) => p.trim()).filter((p) => p.length > 0)
  const key = parts[parts.length - 1]
  if (key === undefined) return null
  const mods = parts.slice(0, -1).map((m) => m.toLowerCase())
  if (mods.length !== 1) return null
  if (mods[0] !== 'meta' && mods[0] !== 'cmd' && mods[0] !== 'command') return null
  return key.length === 1 ? key.toUpperCase() : key
}

export class System1MenuRenderer implements MenuRenderer {
  createMenu(spec: MenuSpec): MenuView {
    const el = document.createElement('div')
    el.className = 's1-menu'
    el.dataset['menu'] = ''
    el.setAttribute('role', 'menu')

    const entryEls: HTMLElement[] = []
    for (const entry of spec) {
      if (entry.kind === 'separator') {
        const sep = document.createElement('div')
        sep.className = 's1-menu-separator'
        sep.dataset['menuSeparator'] = ''
        sep.setAttribute('role', 'separator')
        el.appendChild(sep)
        entryEls.push(sep)
        continue
      }

      const item = document.createElement('div')
      item.className = 's1-menu-item'
      item.dataset['menuItem'] = ''
      if (entry.kind === 'submenu') item.dataset['menuSubmenu'] = ''
      item.setAttribute('role', 'menuitem')
      item.setAttribute('aria-disabled', entry.enabled ? 'false' : 'true')
      if (entry.kind === 'submenu') item.setAttribute('aria-haspopup', 'true')

      // The mark column. A checked item carries the measured 9x8 checkmark; the
      // glyph is a box-shadow bitmap so every pixel is on the era's grid.
      const mark = document.createElement('span')
      mark.className = 's1-menu-mark'
      if (entry.kind === 'item' && entry.checked) mark.dataset['glyph'] = 'check'
      item.appendChild(mark)

      const label = document.createElement('span')
      label.className = 's1-menu-label'
      label.textContent = entry.label
      item.appendChild(label)

      const trail = document.createElement('span')
      trail.className = 's1-menu-trail'
      if (entry.kind === 'submenu') {
        trail.dataset['glyph'] = 'submenu'
      } else if (entry.accel) {
        const key = commandChord(entry.accel)
        if (key !== null) {
          const cmd = document.createElement('span')
          cmd.className = 's1-menu-cmd'
          cmd.dataset['glyph'] = 'command'
          trail.appendChild(cmd)
          const letter = document.createElement('span')
          letter.className = 's1-menu-key'
          letter.textContent = key
          trail.appendChild(letter)
        }
      }
      item.appendChild(trail)

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
