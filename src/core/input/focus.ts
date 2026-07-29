/**
 * DOM focus containment.
 *
 * WM focus (which window is active) and DOM focus (which element takes
 * keystrokes) are separate concerns. This module keeps the second inside the
 * first: Tab cycles within the active window and wraps rather than escaping into
 * another window or the browser chrome.
 *
 * Modal containment is handled by the window manager applying the native `inert`
 * attribute to the owner frame, which removes it from tab order at the platform
 * level. This module only has to handle the wrap at the ends of a scope.
 */

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(',')

function isVisible(el: HTMLElement): boolean {
  if (el.hidden) return false
  // offsetParent is null for display:none subtrees, which is the only
  // invisibility that matters for tab order here.
  return el.offsetParent !== null || el.getClientRects().length > 0
}

export function focusableWithin(root: HTMLElement, out: HTMLElement[]): HTMLElement[] {
  out.length = 0
  const found = root.querySelectorAll<HTMLElement>(FOCUSABLE)
  for (let i = 0; i < found.length; i++) {
    const el = found[i]
    if (el && !el.inert && isVisible(el)) out.push(el)
  }
  return out
}

export class FocusScope {
  /** Reused buffer so Tab handling does not allocate an array per keystroke. */
  private readonly buffer: HTMLElement[] = []

  /**
   * Move focus to the next or previous focusable element inside `root`, wrapping
   * at both ends. Returns true if focus was moved.
   */
  cycle(root: HTMLElement, dir: 1 | -1): boolean {
    const items = focusableWithin(root, this.buffer)
    if (items.length === 0) {
      // Nothing focusable inside: park focus on the frame so keystrokes still
      // route to this window rather than escaping to the document.
      if (root.tabIndex < 0) root.tabIndex = -1
      root.focus({ preventScroll: true })
      return true
    }
    const active = document.activeElement
    let index = -1
    for (let i = 0; i < items.length; i++) {
      if (items[i] === active) {
        index = i
        break
      }
    }
    const next =
      index < 0 ? (dir === 1 ? 0 : items.length - 1) : (index + dir + items.length) % items.length
    items[next]?.focus({ preventScroll: true })
    return true
  }

  /** Put focus on the first focusable element inside `root`. */
  focusFirst(root: HTMLElement): void {
    const items = focusableWithin(root, this.buffer)
    const first = items[0]
    if (first) {
      first.focus({ preventScroll: true })
    } else {
      if (root.tabIndex < 0) root.tabIndex = -1
      root.focus({ preventScroll: true })
    }
  }

  /** True when DOM focus currently sits inside `root`. */
  contains(root: HTMLElement): boolean {
    const active = document.activeElement
    return active instanceof Node && root.contains(active)
  }
}
