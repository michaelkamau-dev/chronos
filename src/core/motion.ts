/**
 * The reduced-motion escape hatch, in one place.
 *
 * `CLAUDE.md`: accessibility obligations are media queries, not user preferences,
 * and an era's hostile behaviour may never be the thing that blocks the escape
 * hatch. A media query answers per-viewer without any stored state, which is why
 * there is no setter here and no preference to override it.
 *
 * This lives in core rather than in each skin because it was in each skin, four
 * copies of the same `matchMedia` string across two chrome renderers, on its way to
 * twelve copies at six skins. A skin that forgot one shipped an era whose minimize
 * animation ignored the query — the exact failure the rule exists to prevent — and
 * nothing would have caught it, because the only symptom is motion that a viewer
 * asked not to see.
 *
 * The window manager consults this before calling a skin's minimize or restore
 * animation at all, so honouring the query is no longer something a skin can get
 * wrong. Skins are free to read it for their own effects; they are not required to.
 */

/**
 * True when the viewer has asked for reduced motion.
 *
 * Read at call time rather than cached: the query can flip while the page is open
 * — a viewer changing the OS setting, or a test driving `Emulation.setEmulatedMedia`
 * — and a cached answer would keep animating after they asked it to stop.
 */
export function prefersReducedMotion(): boolean {
  return matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Subscribes to changes in the query.
 *
 * Ledger needs this rather than a point-in-time read: its refresh band is a running
 * timer, so it has to stop when the query flips, not merely start suppressed.
 */
export function onReducedMotionChange(fn: (reduced: boolean) => void): () => void {
  const mq = matchMedia('(prefers-reduced-motion: reduce)')
  const handler = (e: MediaQueryListEvent): void => fn(e.matches)
  mq.addEventListener('change', handler)
  return () => mq.removeEventListener('change', handler)
}
