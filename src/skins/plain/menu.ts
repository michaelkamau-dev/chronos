/**
 * The phase-1 menu renderer.
 *
 * Menus are a tier-2 widget: their structure genuinely differs between eras
 * (checkmark gutters, accelerator columns, submenu arrows, separator styling),
 * so each skin supplies its own template against the controller's contract
 * rather than sharing one DOM shape.
 */

import type { MenuRenderer, MenuSpec, MenuView } from '../../core/input/menu.js'

export class PlainMenuRenderer implements MenuRenderer {
  createMenu(spec: MenuSpec): MenuView {
    const el = document.createElement('div')
    el.className = 'menu'
    el.setAttribute('role', 'menu')

    const entryEls: HTMLElement[] = []
    for (const entry of spec) {
      if (entry.kind === 'separator') {
        const sep = document.createElement('div')
        sep.className = 'menu-separator'
        sep.setAttribute('role', 'separator')
        el.appendChild(sep)
        entryEls.push(sep)
        continue
      }

      const item = document.createElement('div')
      item.className = 'menu-item'
      item.setAttribute('role', entry.kind === 'submenu' ? 'menuitem' : 'menuitem')
      item.setAttribute('aria-disabled', entry.enabled ? 'false' : 'true')
      if (entry.kind === 'submenu') item.setAttribute('aria-haspopup', 'true')

      const check = document.createElement('span')
      check.className = 'menu-check'
      check.textContent = entry.kind === 'item' && entry.checked ? '✓' : ''
      item.appendChild(check)

      const label = document.createElement('span')
      label.className = 'menu-label'
      label.textContent = entry.label
      item.appendChild(label)

      const trail = document.createElement('span')
      trail.className = 'menu-trail'
      if (entry.kind === 'submenu') trail.textContent = '▶'
      else if (entry.accel) trail.textContent = entry.accel
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
