/**
 * The stipple discriminator, shared by every era that has one.
 *
 * Two vendors arrived at the same construction for disabled text eight years apart —
 * Apple's `notPatBic` in 1984 and Microsoft's `GrayString` in 1992 — because on a
 * 1-bit or 4-bit display there is no lighter black, so the only way to say
 * "unavailable" is to remove half the pixels. Windows 95 replaced it with a grey fill
 * plus a white shadow the moment 8-bit colour was assumed, which is why nearly every
 * recreation of either era gets it wrong.
 *
 * The test is of the **mechanism**, not the appearance: ink on exactly one `(x + y)`
 * parity is a checkerboard; ink on both is a solid glyph. A grey fill fails it at any
 * grey value, which is the point.
 *
 * This function lives here rather than in either fidelity suite because the same
 * assertion has to hold for both, and a second copy is a second thing that can drift.
 * It is deliberately the same discriminator the measurement scripts apply to the
 * vendors' own bitmaps — `tools/captures/measure-win31.py` on Microsoft's pixels and
 * `tools/pdf-extract/measure-mac-system1.py` on Apple's — so the sources and the
 * implementations are held to one standard.
 */

import type { Locator, Page } from '@playwright/test'

export interface Parity {
  /** Ink pixels found, in logical era pixels. */
  ink: number
  /** Share of ink on whichever parity carries more. 1.0 is a perfect checkerboard. */
  oneParityShare: number
}

/**
 * Ink parity for an element, in logical era pixels.
 *
 * Screenshots the element's own box, reduces it by the display scale, and counts ink
 * on each `(x + y)` parity. Sampling is one device pixel per logical pixel, taken at
 * the centre of each block so the sample cannot land on a scaled edge.
 */
export async function measureParity(page: Page, locator: Locator): Promise<Parity> {
  const shot = await locator.screenshot()
  const scale = await page.evaluate(() => window.__chronos.shell.display.scale())
  return page.evaluate(
    async ({ bytes, scale: s }) => {
      const blob = new Blob([new Uint8Array(bytes)], { type: 'image/png' })
      const bmp = await createImageBitmap(blob)
      const c = new OffscreenCanvas(bmp.width, bmp.height)
      const ctx = c.getContext('2d')!
      ctx.drawImage(bmp, 0, 0)
      const data = ctx.getImageData(0, 0, bmp.width, bmp.height).data
      const off = Math.floor(s / 2)
      let even = 0
      let odd = 0
      for (let ly = 0; ly * s + off < bmp.height; ly++) {
        for (let lx = 0; lx * s + off < bmp.width; lx++) {
          const i = ((ly * s + off) * bmp.width + (lx * s + off)) * 4
          const r = data[i]!
          const g = data[i + 1]!
          const b = data[i + 2]!
          // Ink is anything materially darker than the surface behind the glyph.
          const dark = r < 160 && g < 160 && b < 200
          if (!dark) continue
          if ((lx + ly) % 2 === 0) even++
          else odd++
        }
      }
      const ink = even + odd
      return { ink, oneParityShare: ink === 0 ? 0 : Math.max(even, odd) / ink }
    },
    { bytes: [...shot], scale },
  )
}
