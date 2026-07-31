/**
 * Ledger menu renderer.
 *
 * The one place this era had to invent a mechanism rather than derive one, and the
 * reasoning is worth the space because the obvious answer is wrong in a way no test
 * would have caught.
 *
 * ### Why a dithered tone is not available for disabled text
 *
 * §8 says tone comes from ordered Bayer dither, so the obvious disabled treatment is
 * the label rendered at a reduced ink level. It cannot be, for two independent
 * reasons that arrive at the same place:
 *
 * 1. **Bayer's lower half is exactly the even `(x + y)` sublattice**, at every cell
 *    size — see the proof in `dither.ts`. So an ordered dither at or below 50% ink
 *    puts every inked pixel on one parity, which is pixel-for-pixel what
 *    `measureParity` identifies as System 1's `notPatBic` and Windows 3.1's
 *    `GrayString`. A 2035 era would be wearing a 1984 mechanism and the project's own
 *    discriminator would agree it was.
 * 2. `CLAUDE.md` settles the history independently: the stipple governs System 1 and
 *    Windows 3.1 only, Mac OS 8 already dropped it, and an era fifty years later
 *    inheriting it would read as a costume.
 *
 * A tone *above* 50% does break parity, but at that ink level it barely reads as
 * unavailable, so it trades a real signal for a technicality.
 *
 * ### What a disabled item is instead: a voided ledger line
 *
 * The label in carbon, struck through with a 4px amber rule. It is a voided line item
 * on a receipt, which is what an unavailable command is in an OS that presents itself
 * as an account — and it is unmistakably not a stipple by any instrument, which
 * `ledger-fidelity.spec.ts` asserts by running the parity test and requiring it to
 * *fail* to find a checkerboard.
 *
 * The rule is 4px because every rule in this era is: a stroke thinner than the dither
 * cell does not survive the bleach, which is §8's own reason for the heavy type
 * applied to lines instead of letters.
 *
 * ### Accelerators are written plainly
 *
 * No symbol notation. 2035 is not a Macintosh, there is no glyph tradition to
 * reproduce, and Public Sans carries no modifier symbols — the coverage check would
 * fail on the first `⌘`. So `Ctrl+W` renders as `Ctrl+W`, which is also what a
 * regulatory-disclosure aesthetic would do.
 */

import type { MenuRenderer, MenuSpec, MenuView } from '../../core/input/menu.js'

export class LedgerMenuRenderer implements MenuRenderer {
  createMenu(spec: MenuSpec): MenuView {
    const el = document.createElement('div')
    el.className = 'lg-menu'
    el.dataset['menu'] = ''
    el.setAttribute('role', 'menu')

    const entryEls: HTMLElement[] = []
    for (const entry of spec) {
      if (entry.kind === 'separator') {
        const sep = document.createElement('div')
        sep.className = 'lg-menu-separator'
        sep.dataset['menuSeparator'] = ''
        sep.setAttribute('role', 'separator')
        el.appendChild(sep)
        entryEls.push(sep)
        continue
      }

      const item = document.createElement('div')
      item.className = 'lg-menu-item'
      item.dataset['menuItem'] = ''
      if (entry.kind === 'submenu') item.dataset['menuSubmenu'] = ''
      item.setAttribute('role', 'menuitem')
      item.setAttribute('aria-disabled', entry.enabled ? 'false' : 'true')
      if (entry.kind === 'submenu') item.setAttribute('aria-haspopup', 'true')
      // The void is an attribute rather than a class so the fidelity suite asserts the
      // mechanism against the contract vocabulary rather than against a stylesheet.
      item.dataset['ledgerVoid'] = entry.enabled ? 'false' : 'true'

      const check = document.createElement('span')
      check.className = 'lg-menu-check'
      check.textContent = entry.kind === 'item' && entry.checked ? '×' : ''
      item.appendChild(check)

      const label = document.createElement('span')
      label.className = 'lg-menu-label'
      label.textContent = entry.label
      item.appendChild(label)

      // The strike is its own element rather than `text-decoration: line-through`,
      // which cannot be given a thickness reliably across the label's own box and
      // would be subject to the face's underline metrics rather than to the cell grid.
      const strike = document.createElement('span')
      strike.className = 'lg-menu-strike'
      strike.setAttribute('aria-hidden', 'true')
      item.appendChild(strike)

      const accel = document.createElement('span')
      accel.className = 'lg-menu-accel'
      accel.textContent = entry.kind === 'item' && entry.accel ? entry.accel : ''
      item.appendChild(accel)

      const sub = document.createElement('span')
      sub.className = 'lg-menu-sub'
      // A right-pointing chevron drawn from ASCII, because Public Sans carries no
      // U+25B6 and a missing glyph falls back to a face whose fractional advance takes
      // every glyph after it off the grid.
      sub.textContent = entry.kind === 'submenu' ? '>' : ''
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
