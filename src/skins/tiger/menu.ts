/**
 * Mac OS X Tiger menu renderer.
 *
 * Menus are a tier-2 widget, so this supplies its own template against the
 * controller's contract and emits the `data-menu*` vocabulary so nothing downstream
 * depends on a class name.
 *
 * Three things are Tiger-specific and measured:
 *
 * - **The background is a pinstripe**, not a flat fill: two rows of `#F3F3F3` and two
 *   of `#EFEFEF` on a 4px period. Proven in a lossless PNG elsewhere in the same
 *   document (see metrics.ts), which is what licenses reading it out of the lossy
 *   menu figure.
 * - **Accelerators are modifier glyphs, not words.** A Mac menu draws `⌘W`, where
 *   Windows spells `Ctrl+W`. The mapping lives here because it is era spelling, the
 *   same way the path codec owns `C:\` versus `/`.
 * - **A dimmed item is not highlighted on hover.** Apple states this explicitly:
 *   "the item should appear dimmed (gray) in the menu and is not highlighted when the
 *   user moves the pointer over it" (HIG p146). The menu controller already refuses
 *   to activate a disabled entry, but it does highlight it — every Windows era did —
 *   so the not-highlighted half is enforced in this skin's CSS, keyed off
 *   `aria-disabled`.
 */

import type { MenuRenderer, MenuSpec, MenuView } from '../../core/input/menu.js'

/**
 * Chord spelling, Mac style. Chronos's chord strings are platform-neutral
 * (`Meta+W`); Tiger draws them as glyphs, and the glyph order is Apple's:
 * control, option, shift, command, then the key.
 */
const GLYPHS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bControl\+/gi, '\u2303'],
  [/\bCtrl\+/gi, '\u2303'],
  [/\bAlt\+/gi, '\u2325'],
  [/\bOption\+/gi, '\u2325'],
  [/\bShift\+/gi, '\u21E7'],
  [/\bMeta\+/gi, '\u2318'],
  [/\bCmd\+/gi, '\u2318'],
  [/\bCommand\+/gi, '\u2318'],
]

/** `Meta+Shift+W` → `⇧⌘W`, with the modifiers ordered as Apple orders them. */
export function macAccel(accel: string): string {
  let key = accel
  const mods: string[] = []
  for (const [pattern, glyph] of GLYPHS) {
    if (pattern.test(key)) {
      mods.push(glyph)
      key = key.replace(pattern, '')
    }
    pattern.lastIndex = 0
  }
  // Apple's order, regardless of how the chord was written.
  const order = ['\u2303', '\u2325', '\u21E7', '\u2318']
  mods.sort((a, b) => order.indexOf(a) - order.indexOf(b))
  return mods.join('') + key.replace(/\+/g, '')
}

export class TigerMenuRenderer implements MenuRenderer {
  createMenu(spec: MenuSpec): MenuView {
    const el = document.createElement('div')
    el.className = 'tg-menu'
    el.dataset['menu'] = ''
    el.setAttribute('role', 'menu')

    const entryEls: HTMLElement[] = []
    for (const entry of spec) {
      if (entry.kind === 'separator') {
        const sep = document.createElement('div')
        sep.className = 'tg-menu-separator'
        sep.dataset['menuSeparator'] = ''
        sep.setAttribute('role', 'separator')
        el.appendChild(sep)
        entryEls.push(sep)
        continue
      }

      const item = document.createElement('div')
      item.className = 'tg-menu-item'
      item.dataset['menuItem'] = ''
      if (entry.kind === 'submenu') item.dataset['menuSubmenu'] = ''
      item.setAttribute('role', 'menuitem')
      item.setAttribute('aria-disabled', entry.enabled ? 'false' : 'true')
      if (entry.kind === 'submenu') item.setAttribute('aria-haspopup', 'true')

      const check = document.createElement('span')
      check.className = 'tg-menu-check'
      // A Mac checked item is a tick, where Windows 3.1 used a bullet.
      check.textContent = entry.kind === 'item' && entry.checked ? '\u2713' : ''
      item.appendChild(check)

      const label = document.createElement('span')
      label.className = 'tg-menu-label'
      label.textContent = entry.label
      item.appendChild(label)

      const accel = document.createElement('span')
      accel.className = 'tg-menu-accel'
      accel.textContent = entry.kind === 'item' && entry.accel ? macAccel(entry.accel) : ''
      item.appendChild(accel)

      const sub = document.createElement('span')
      sub.className = 'tg-menu-sub'
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
