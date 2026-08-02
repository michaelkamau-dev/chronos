/**
 * The no-flat-grey probe, shared by every app that renders into the 1-bit era.
 *
 * The claim `system1-fidelity.spec.ts` makes — every pixel's luma below 40 or above
 * 208 — is derived from Chromium's LCD fringes on *black text on white*, the only
 * polarity that suite's own surfaces render. Anything that inverts fringes to a
 * different set: measured on a selected file-list row at lumas 51, 54, 81, 91, 126,
 * 163, 168 and 189, squarely inside the band. Widening the band until those pass is
 * exactly the "loosen a threshold until a false assertion passes" failure
 * `CLAUDE.md` names, so the claim is restated to the one that is true and is the
 * actual point: **no region is flat grey.**
 *
 * A grey *fill* has interior pixels surrounded entirely by other non-pure pixels; an
 * antialiased or subpixel-fringed *edge* is always one or two pixels sitting against
 * ink or paper. "A non-pure pixel with no pure neighbour" separates the two, is
 * independent of polarity, and is what the integer-scaled viewport genuinely
 * guarantees.
 *
 * **It lives here rather than in one app's suite** because more than one app now has
 * to make it, and `CLAUDE.md` records what happens to the second copy: it drifts, and
 * the one that drifted is the one nobody looks at. Same reason `measureParity` moved
 * out of the two fidelity suites that both needed it.
 *
 * Per the project's own rule — run a candidate you expect to fail before trusting the
 * instrument — every caller pairs its assertion with one that injects a real grey fill
 * and watches the probe catch it.
 */

import type { Page } from '@playwright/test'

export interface NonPureRegion {
  /** Device pixels captured, so a caller can prove it screenshotted something. */
  total: number
  /** The largest connected run of non-pure pixels, in device pixels. */
  biggest: number
  /** Where that run starts, for a failure message that can be looked at. */
  where: string
}

/**
 * The instrument: the largest connected region of non-pure pixels.
 *
 * Subpixel fringing is confined to the edges of a *single glyph*, so its components
 * cannot exceed one character cell. A flat fill spans a row or a control. Measured
 * across the two apps that use it: the largest fringe component is in the low
 * hundreds of device pixels and an injected `#808080` row is tens of thousands — two
 * orders of magnitude apart, with the bound derived from the era's own type rather
 * than picked to make a number pass.
 */
const COMPONENT_PROBE = `
  (async (bytes) => {
    const blob = new Blob([new Uint8Array(bytes)], { type: 'image/png' })
    const bmp = await createImageBitmap(blob)
    const c = new OffscreenCanvas(bmp.width, bmp.height)
    const ctx = c.getContext('2d')
    ctx.drawImage(bmp, 0, 0)
    const d = ctx.getImageData(0, 0, bmp.width, bmp.height).data
    const W = bmp.width, H = bmp.height
    const pure = (i) => {
      const r = d[i], g = d[i + 1], b = d[i + 2]
      return (r === 0 && g === 0 && b === 0) || (r === 255 && g === 255 && b === 255)
    }
    const seen = new Uint8Array(W * H)
    let biggest = 0
    let where = ''
    for (let p = 0; p < W * H; p++) {
      if (seen[p] || pure(p * 4)) continue
      let n = 0
      const stack = [p]
      seen[p] = 1
      while (stack.length) {
        const q = stack.pop()
        n++
        const qx = q % W, qy = (q / W) | 0
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = qx + dx, ny = qy + dy
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue
          const r = ny * W + nx
          if (seen[r] || pure(r * 4)) continue
          seen[r] = 1
          stack.push(r)
        }
      }
      if (n > biggest) { biggest = n; where = (p % W) + ',' + ((p / W) | 0) }
    }
    return { total: W * H, biggest, where }
  })
`

export async function largestNonPureRegion(
  page: Page,
  selector: string,
): Promise<NonPureRegion> {
  const shot = [...(await page.locator(selector).screenshot())]
  return page.evaluate(
    ({ bytes, src }) => (eval(src) as (b: number[]) => Promise<NonPureRegion>)(bytes),
    { bytes: shot, src: COMPONENT_PROBE },
  )
}

/**
 * One character cell in device pixels.
 *
 * The bound comes from the era's own type — the font size the surface actually
 * renders at, multiplied by the display scale — rather than from a number chosen to
 * make a measurement pass. Fringing cannot exceed a single glyph; a fill always does.
 */
export async function characterCellArea(page: Page, selector: string): Promise<number> {
  return page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(sel)
    if (!el) throw new Error(`no element matches ${sel}`)
    const px = parseFloat(getComputedStyle(el).fontSize)
    const scale = window.__chronos.shell.display.scale()
    return (px * scale) ** 2
  }, selector)
}
