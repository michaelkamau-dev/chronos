/**
 * Windows XP Luna menu renderer.
 *
 * Menus are a tier-2 widget: their structure genuinely differs between eras — the
 * checkmark gutter, accelerator column and submenu arrow are XP's arrangement, and
 * a classic Mac menu puts them elsewhere — so each skin supplies its own template
 * against the controller's contract.
 *
 * The disabled colour here is #808080, which is NOT the #A1A192 every control uses.
 * Two different disabled greys, separately specified in the Visual Guidelines.
 */

import type { MenuRenderer, MenuSpec, MenuView } from '../../core/input/menu.js'

export class XpMenuRenderer implements MenuRenderer {
  createMenu(spec: MenuSpec): MenuView {
    const el = document.createElement('div')
    el.className = 'xp-menu'
    el.dataset['menu'] = ''
    el.setAttribute('role', 'menu')

    const entryEls: HTMLElement[] = []
    for (const entry of spec) {
      if (entry.kind === 'separator') {
        const sep = document.createElement('div')
        sep.className = 'xp-menu-separator'
        sep.dataset['menuSeparator'] = ''
        sep.setAttribute('role', 'separator')
        el.appendChild(sep)
        entryEls.push(sep)
        continue
      }

      const item = document.createElement('div')
      item.className = 'xp-menu-item'
      item.dataset['menuItem'] = ''
      if (entry.kind === 'submenu') item.dataset['menuSubmenu'] = ''
      item.setAttribute('role', 'menuitem')
      item.setAttribute('aria-disabled', entry.enabled ? 'false' : 'true')
      if (entry.kind === 'submenu') item.setAttribute('aria-haspopup', 'true')

      const check = document.createElement('span')
      check.className = 'xp-menu-check'
      check.textContent = entry.kind === 'item' && entry.checked ? '\u2713' : ''
      item.appendChild(check)

      const label = document.createElement('span')
      label.className = 'xp-menu-label'
      label.textContent = entry.label
      item.appendChild(label)

      const accel = document.createElement('span')
      accel.className = 'xp-menu-trail'
      accel.textContent = entry.kind === 'item' && entry.accel ? entry.accel : ''
      item.appendChild(accel)

      const sub = document.createElement('span')
      sub.className = 'xp-menu-sub'
      sub.textContent = entry.kind === 'submenu' ? '\u25B6' : ''
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
