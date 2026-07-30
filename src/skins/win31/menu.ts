/**
 * Windows 3.1 menu renderer.
 *
 * Menus are a tier-2 widget — the structure genuinely differs per era — so this
 * supplies its own template against the controller's contract, and emits the
 * `data-menu*` vocabulary so nothing downstream has to know a class name.
 *
 * Two things are 3.1-specific and measured. A separator is 7px tall with its 1px rule
 * as the fourth row, and that rule spans the popup's *full outer width*, replacing the
 * frame pixel at each end. And a disabled item's label is a 50% checkerboard knocked
 * out of the black glyph rather than a grey fill — the same GrayString mechanism as a
 * disabled button label, and the same idea as System 1's `notPatBic`.
 *
 * The accelerator column is right-aligned with a 15px gutter. That is a standard-
 * behaviour assumption rather than a measurement: the capture's two accelerators are
 * `Ctrl+F4` and `Ctrl+F6`, which are the same width, so right-aligned and fixed-left
 * produce identical pixels and cannot be distinguished.
 */

import type { MenuRenderer, MenuSpec, MenuView } from '../../core/input/menu.js'

export class Win31MenuRenderer implements MenuRenderer {
  createMenu(spec: MenuSpec): MenuView {
    const el = document.createElement('div')
    el.className = 'w31-menu'
    el.dataset['menu'] = ''
    el.setAttribute('role', 'menu')

    const entryEls: HTMLElement[] = []
    for (const entry of spec) {
      if (entry.kind === 'separator') {
        const sep = document.createElement('div')
        sep.className = 'w31-menu-separator'
        sep.dataset['menuSeparator'] = ''
        sep.setAttribute('role', 'separator')
        el.appendChild(sep)
        entryEls.push(sep)
        continue
      }

      const item = document.createElement('div')
      item.className = 'w31-menu-item'
      item.dataset['menuItem'] = ''
      if (entry.kind === 'submenu') item.dataset['menuSubmenu'] = ''
      item.setAttribute('role', 'menuitem')
      item.setAttribute('aria-disabled', entry.enabled ? 'false' : 'true')
      if (entry.kind === 'submenu') item.setAttribute('aria-haspopup', 'true')

      const check = document.createElement('span')
      check.className = 'w31-menu-check'
      // 3.1's checked-item mark is a bullet-ish dot, not a tick.
      check.textContent = entry.kind === 'item' && entry.checked ? '•' : ''
      item.appendChild(check)

      const label = document.createElement('span')
      label.className = 'w31-menu-label'
      label.textContent = entry.label
      item.appendChild(label)

      const accel = document.createElement('span')
      accel.className = 'w31-menu-trail'
      accel.textContent = entry.kind === 'item' && entry.accel ? entry.accel : ''
      item.appendChild(accel)

      const sub = document.createElement('span')
      sub.className = 'w31-menu-sub'
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
