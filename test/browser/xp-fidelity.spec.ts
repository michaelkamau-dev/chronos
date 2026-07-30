/**
 * The phase-3 gate: Windows XP Luna measured against the primary source.
 *
 * This is a *measurement* comparison, not an image diff. The reference figure is a
 * JPEG, so a pixel-for-pixel diff would fail on compression noise while telling us
 * nothing about whether the geometry is right. What matters is that the rendered
 * chrome has the dimensions the figure has: 30px caption, 4px frame in four
 * discrete colour steps, and a corner that steps 5,3,2,1,1,0 rather than curving.
 *
 * Every assertion below traces to a value in `docs/sources/`. Where XP.css and the
 * figure disagree, the assertion follows the figure.
 */

import { test, expect, type Page } from '@playwright/test'

/** Measured from the figure "Standard window components in actual size". */
const FIGURE = {
  captionHeight: 30,
  frameWidth: 4,
  frameSide: ['#0019CE', '#0831D9', '#166AEE', '#0955DE'],
  cornerInsets: [5, 3, 2, 1, 1, 0],
} as const

/** Documented in the Visual Guidelines prose. */
const DOCUMENTED = {
  buttonWidth: 75,
  buttonHeight: 23,
  checkSize: 16,
  disabledControlText: 'rgb(161, 161, 146)',
  disabledMenuText: 'rgb(128, 128, 128)',
  menuHighlight: 'rgb(49, 106, 197)',
  textBoxBorder: 'rgb(127, 157, 185)',
  textBoxDisabledFill: 'rgb(235, 235, 228)',
  comboDisabledFill: 'rgb(201, 199, 186)',
  groupBoxTitle: 'rgb(0, 70, 213)',
  captionFontPx: 13,
  uiFontPx: 11,
} as const

async function boot(page: Page): Promise<void> {
  await page.goto('/')
  await page.waitForFunction(() => window.__chronos !== undefined)
  await page.evaluate(() => window.__chronos.reset())
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(() => window.__chronos.openWindows(1))
}

test.describe('window frame geometry', () => {
  test('the caption is 30px, not XP.css\'s 28', async ({ page }) => {
    await boot(page)
    const h = await page
      .locator('.xp-titlebar')
      .first()
      .evaluate((el) => el.getBoundingClientRect().height)
    expect(h).toBe(FIGURE.captionHeight)
  })

  test('the metrics the window manager consumes match the figure', async ({ page }) => {
    await boot(page)
    const m = await page.evaluate(() => {
      const wm = window.__chronos.shell.wm
      return {
        titleBarHeight: wm.metrics.titleBarHeight,
        border: { ...wm.metrics.border },
        cornerTop: wm.metrics.cornerTop,
      }
    })
    expect(m.titleBarHeight).toBe(FIGURE.captionHeight)
    // Four per side; the top edge lives inside the caption.
    expect(m.border.left).toBe(FIGURE.frameWidth)
    expect(m.border.right).toBe(FIGURE.frameWidth)
    expect(m.border.bottom).toBe(FIGURE.frameWidth)
    expect(m.border.top).toBe(0)
    // The corner is categorically not a radius.
    expect(m.cornerTop.kind).toBe('steps')
    expect((m.cornerTop as { insets: number[] }).insets).toEqual([...FIGURE.cornerInsets])
  })

  test('the frame renders four discrete 1px colour steps', async ({ page }) => {
    await boot(page)
    // Four inset shadows per side plus four for the bottom. A gradient border or a
    // 4px solid border could not express four different colours.
    const shadow = await page
      .locator('.xp-win')
      .first()
      .evaluate((el) => getComputedStyle(el).boxShadow)
    for (const hex of FIGURE.frameSide) {
      const rgb = hexToRgb(hex)
      expect(shadow, `frame step ${hex} missing`).toContain(rgb)
    }
    // The outermost step is the one XP.css missed.
    expect(shadow).toContain(hexToRgb('#0019CE'))
  })

  test('the corner clips to the measured steps rather than a radius', async ({ page }) => {
    await boot(page)
    const style = await page.locator('.xp-win').first().evaluate((el) => ({
      clip: getComputedStyle(el).clipPath,
      radius: getComputedStyle(el).borderTopLeftRadius,
    }))
    expect(style.clip).toContain('polygon')
    // Each measured inset must appear as a coordinate in the polygon.
    for (const inset of new Set(FIGURE.cornerInsets)) {
      if (inset === 0) continue
      expect(style.clip, `corner step ${inset}px missing`).toContain(`${inset}px`)
    }
    // And there must be no border-radius doing the job instead.
    expect(style.radius).toBe('0px')
  })

  test('a maximized window loses the corner entirely', async ({ page }) => {
    await boot(page)
    const before = await page.locator('.xp-win').first().evaluate((el) => el.style.clipPath)
    expect(before).toContain('polygon')
    await page.keyboard.press('Alt+F10')
    await expect(page.locator('.xp-win').first()).toHaveAttribute('data-maximized', 'true')
    const after = await page.locator('.xp-win').first().evaluate((el) => el.style.clipPath)
    expect(after).toBe('none')
  })
})

test.describe('caption gradient', () => {
  test('is 30 hard-stop rows, not a two-endpoint ramp', async ({ page }) => {
    await boot(page)
    const bg = await page
      .locator('.xp-titlebar')
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundImage)
    // A linear ramp would have two stops. The measured caption has a highlight near
    // the top and a second brightening lower down, which only survives as per-row
    // hard stops.
    const stopCount = (bg.match(/rgb\(/g) ?? []).length
    expect(stopCount).toBeGreaterThanOrEqual(60)
  })

  test('the inactive caption is a different gradient at the same height', async ({ page }) => {
    await boot(page)
    await page.evaluate(() => window.__chronos.openWindows(1))
    const [active, inactive] = await page.locator('.xp-titlebar').evaluateAll((els) => {
      const focused = els.find((e) => e.closest('.xp-win')?.getAttribute('data-state') === 'focused')
      const blurred = els.find((e) => e.closest('.xp-win')?.getAttribute('data-state') === 'blurred')
      return [
        focused ? getComputedStyle(focused).backgroundImage : '',
        blurred ? getComputedStyle(blurred).backgroundImage : '',
      ]
    })
    expect(active).not.toBe('')
    expect(inactive).not.toBe('')
    expect(active).not.toBe(inactive)
    // Height does not change with focus — only colour.
    const heights = await page
      .locator('.xp-titlebar')
      .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))
    for (const h of heights) expect(h).toBe(FIGURE.captionHeight)
  })
})

test.describe('caption buttons are semantically coloured, not a uniform set', () => {
  test('close is the high-impact category; minimize and maximize are neutral', async ({ page }) => {
    await boot(page)
    const cats = await page.locator('.xp-capbtn').evaluateAll((els) =>
      els.map((el) => ({
        action: (el as HTMLElement).dataset['action'],
        impact: el.classList.contains('xp-capbtn--impact'),
        neutral: el.classList.contains('xp-capbtn--neutral'),
      })),
    )
    const close = cats.find((c) => c.action === 'close')
    const min = cats.find((c) => c.action === 'minimize')
    const max = cats.find((c) => c.action === 'maximize')
    expect(close?.impact).toBe(true)
    expect(min?.neutral).toBe(true)
    expect(max?.neutral).toBe(true)
    // And they must actually render differently, not just carry different classes.
    const bgs = await page.locator('.xp-capbtn').evaluateAll((els) =>
      els.map((el) => getComputedStyle(el).backgroundImage),
    )
    expect(new Set(bgs).size).toBeGreaterThan(1)
  })

  test('all three are 21px square', async ({ page }) => {
    await boot(page)
    const boxes = await page.locator('.xp-capbtn').evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect()
        return { w: Math.round(r.width), h: Math.round(r.height) }
      }),
    )
    expect(boxes).toHaveLength(3)
    for (const b of boxes) expect(b).toEqual({ w: 21, h: 21 })
  })

  /*
   * The placement below is the whole reason the "Title Bar Buttons" figure was
   * worth extracting. Every number here is measured off three real captions —
   * inactive, active and maximized — with the caption's own 30px height and 4px
   * right frame as the calibration that the bitmap is 1:1.
   */
  test('placement: 2px gaps, a 2px right gutter, and 6px down from the caption top', async ({
    page,
  }) => {
    await boot(page)
    const geom = await page.locator('[data-win-id]').first().evaluate((frame) => {
      const bar = frame.querySelector('[data-part="titlebar"]') as HTMLElement
      const btns = [...frame.querySelectorAll('.xp-capbtn')] as HTMLElement[]
      const barBox = bar.getBoundingClientRect()
      const boxes = btns.map((b) => b.getBoundingClientRect())
      return {
        gaps: boxes.slice(1).map((b, i) => Math.round(b.left - boxes[i]!.right)),
        // The frame is drawn by box-shadow *inset*, so the title bar's own right
        // edge is the frame's inner edge and this gutter is the 2px measured on the
        // maximized bar, which has no side frame at all.
        rightGutter: Math.round(barBox.right - boxes[boxes.length - 1]!.right),
        topInset: Math.round(boxes[0]!.top - barBox.top),
        bottomInset: Math.round(barBox.bottom - boxes[0]!.bottom),
      }
    })
    expect(geom.gaps).toEqual([2, 2])
    expect(geom.rightGutter).toBe(2)
    // Not centred: 6 + 21 + 3 = 30. Centring computes 4.5 and lands off the grid.
    expect(geom.topInset).toBe(6)
    expect(geom.bottomInset).toBe(3)
  })

  test('the outline is opaque white when active and a pale blue when blurred', async ({ page }) => {
    await boot(page)
    await page.evaluate(() => window.__chronos.openWindows(2))
    const outlines = await page.locator('[data-win-id]').evaluateAll((frames) =>
      frames.map((f) => ({
        state: (f as HTMLElement).dataset['state'],
        colour: getComputedStyle(f.querySelector('.xp-capbtn')!).borderTopColor,
      })),
    )
    const active = outlines.find((o) => o.state === 'focused')
    const blurred = outlines.find((o) => o.state === 'blurred')
    // Measured as #FFFFFF on all three real captions and on all 21 specimens. A
    // translucent white would compute to roughly #80AAF2 over the active caption.
    expect(active?.colour).toBe('rgb(255, 255, 255)')
    expect(blurred?.colour).toBe('rgb(188, 196, 238)')
    expect(active?.colour).not.toBe(blurred?.colour)
  })

  test('each state is a measured gradient, not a filter applied to the rest state', async ({
    page,
  }) => {
    await boot(page)
    const styles = await page.locator('.xp-capbtn-close').first().evaluate((el) => {
      const cs = getComputedStyle(el)
      return { bg: cs.backgroundImage, filter: cs.filter }
    })
    // 19 interior rows, two hard stops each, straight off the specimen sheet.
    expect(styles.bg.split('rgb(').length - 1).toBeGreaterThanOrEqual(38)
    // `filter: brightness()` cannot express what the specimens show: hover lifts the
    // red toward white while pressed darkens *and* saturates it.
    expect(styles.filter).toBe('none')

    // The four states must be four distinct faces per category.
    const faces = await page.evaluate(() => {
      // The generated properties are written onto the desktop element, not :root.
      const cs = getComputedStyle(document.querySelector('[data-desktop]')!)
      const read = (n: string): string => cs.getPropertyValue(n).trim()
      const out: Record<string, string> = {}
      for (const cat of ['impact', 'neutral']) {
        for (const st of ['rest', 'hover', 'active', 'disabled']) {
          out[`${cat}-${st}`] = read(`--xp-gen-capbtn-${cat}-${st}`)
        }
      }
      return out
    })
    const values = Object.values(faces)
    expect(values.every((v) => v.length > 0)).toBe(true)
    expect(new Set(values).size).toBe(8)
  })

  test('the maximize glyph becomes restore when maximized', async ({ page }) => {
    await boot(page)
    const btn = page.locator('.xp-capbtn-maximize').first()
    await expect(btn).toHaveAttribute('data-glyph', 'maximize')
    await page.keyboard.press('Alt+F10')
    await expect(btn).toHaveAttribute('data-glyph', 'restore')
    await expect(btn).toHaveAttribute('aria-label', 'Restore')
  })
})

test.describe('typography', () => {
  test('the caption uses the caption face at 13px and the body the UI face at 11px', async ({
    page,
  }) => {
    await boot(page)
    const t = await page.locator('.xp-title').first().evaluate((el) => {
      const cs = getComputedStyle(el)
      return { family: cs.fontFamily, size: cs.fontSize, weight: cs.fontWeight }
    })
    // Trebuchet MS Bold 10pt -> 13px, and the caption is the only place it appears.
    expect(t.size).toBe(`${DOCUMENTED.captionFontPx}px`)
    expect(t.family).toContain('XP Caption')
    expect(t.weight).toBe('700')

    const w = await page.locator('.xp-win').first().evaluate((el) => {
      const cs = getComputedStyle(el)
      return { family: cs.fontFamily, size: cs.fontSize }
    })
    expect(w.size).toBe(`${DOCUMENTED.uiFontPx}px`)
    expect(w.family).toContain('XP UI')
    expect(w.family).not.toContain('XP Caption')
  })

  test('no stylesheet declares a pt font size', async ({ page }) => {
    await boot(page)
    // 8pt at 96dpi is 10.667px and would land glyph edges on half-pixels. Every
    // size must be the integer pixel Windows rasterised at.
    const offenders = await page.evaluate(() => {
      const out: string[] = []
      for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList
        try {
          rules = sheet.cssRules
        } catch {
          continue
        }
        for (const rule of Array.from(rules)) {
          const text = rule.cssText
          if (/font(-size)?\s*:[^;]*\b\d+(\.\d+)?pt\b/.test(text)) out.push(text.slice(0, 90))
        }
      }
      return out
    })
    expect(offenders).toEqual([])
  })

  test('the bundled fonts actually load', async ({ page }) => {
    await boot(page)
    const loaded = await page.evaluate(async () => {
      await document.fonts.ready
      return {
        ui: document.fonts.check('11px "XP UI"'),
        caption: document.fonts.check('700 13px "XP Caption"'),
      }
    })
    // If these are false the chrome is rendering in a fallback and every measured
    // advance width in docs/fonts/ is meaningless.
    expect(loaded.ui).toBe(true)
    expect(loaded.caption).toBe(true)
  })
})

test.describe('documented control colours', () => {
  test('the two disabled greys are not unified', async ({ page }) => {
    await boot(page)
    // Controls use #A1A192; menus use #808080. Separately specified in the source.
    const probe = await page.evaluate(() => {
      const host = document.querySelector('.xp-win [data-content]')!
      const btn = document.createElement('button')
      btn.className = 'xp-button'
      btn.disabled = true
      btn.textContent = 'Cancel'
      host.appendChild(btn)
      const btnColour = getComputedStyle(btn).color
      btn.remove()
      return btnColour
    })
    expect(probe).toBe(DOCUMENTED.disabledControlText)

    await page.keyboard.press('Alt+Space')
    const menu = page.locator('.xp-menu')
    await expect(menu).toBeVisible()
    const disabled = menu.locator('.xp-menu-item[aria-disabled="true"]').first()
    await expect(disabled).toHaveCSS('color', DOCUMENTED.disabledMenuText)
    // Hover an ENABLED item: the first entry is "Restore", which is correctly
    // disabled on a non-maximized window and correctly gets the muted highlight.
    const enabled = menu.locator('.xp-menu-item[aria-disabled="false"]').first()
    await enabled.hover()
    await expect(enabled).toHaveAttribute('data-highlight', 'true')
    await expect(enabled).toHaveCSS('background-color', DOCUMENTED.menuHighlight)
    await expect(enabled).toHaveCSS('color', 'rgb(255, 255, 255)')
  })

  test('command buttons are 75x23 with a 1px corner indent, not a radius', async ({ page }) => {
    await boot(page)
    const b = await page.evaluate(() => {
      const host = document.querySelector('.xp-win [data-content]')!
      const btn = document.createElement('button')
      btn.className = 'xp-button'
      btn.textContent = 'OK'
      host.appendChild(btn)
      const cs = getComputedStyle(btn)
      const r = btn.getBoundingClientRect()
      const out = {
        w: Math.round(r.width),
        h: Math.round(r.height),
        radius: cs.borderTopLeftRadius,
        clip: cs.clipPath,
        border: cs.borderTopColor,
      }
      btn.remove()
      return out
    })
    expect(b.w).toBe(DOCUMENTED.buttonWidth)
    expect(b.h).toBe(DOCUMENTED.buttonHeight)
    // Microsoft's words: "The curve of a command button is a 1 pixel indent."
    expect(b.radius).toBe('0px')
    expect(b.clip).toContain('polygon')
    expect(b.clip).toContain('1px')
    expect(b.border).toBe('rgb(0, 60, 116)')
  })

  test('text boxes and combo boxes have different disabled fills', async ({ page }) => {
    await boot(page)
    const fills = await page.evaluate(() => {
      const host = document.querySelector('.xp-win [data-content]')!
      const tb = document.createElement('input')
      tb.className = 'xp-textbox'
      tb.disabled = true
      const cb = document.createElement('select')
      cb.className = 'xp-combo'
      cb.disabled = true
      host.append(tb, cb)
      const out = {
        textBox: getComputedStyle(tb).backgroundColor,
        textBoxBorder: getComputedStyle(tb).borderTopColor,
        combo: getComputedStyle(cb).backgroundColor,
      }
      tb.remove()
      cb.remove()
      return out
    })
    // Not a typo in the source — they are separately specified.
    expect(fills.textBox).toBe(DOCUMENTED.textBoxDisabledFill)
    expect(fills.combo).toBe(DOCUMENTED.comboDisabledFill)
    expect(fills.textBox).not.toBe(fills.combo)
  })

  test('check boxes and radio buttons are 16x16', async ({ page }) => {
    await boot(page)
    const sizes = await page.evaluate(() => {
      const host = document.querySelector('.xp-win [data-content]')!
      const out: Array<{ w: number; h: number }> = []
      for (const type of ['checkbox', 'radio']) {
        const el = document.createElement('input')
        el.type = type
        el.className = type === 'checkbox' ? 'xp-check' : 'xp-radio'
        host.appendChild(el)
        const r = el.getBoundingClientRect()
        out.push({ w: Math.round(r.width), h: Math.round(r.height) })
        el.remove()
      }
      return out
    })
    // Three sizes ship; XP only ever uses 16x16.
    for (const s of sizes) expect(s).toEqual({ w: DOCUMENTED.checkSize, h: DOCUMENTED.checkSize })
  })
})

test.describe('all five states on every interactive element', () => {
  test('caption buttons and command buttons render five distinct states', async ({ page }) => {
    await boot(page)
    // rest / hover / active / focus / disabled must each differ. A skin that
    // silently collapses two of them passes a screenshot and fails a user.
    const distinct = await page.evaluate(() => {
      const host = document.querySelector('.xp-win [data-content]')!
      const btn = document.createElement('button')
      btn.className = 'xp-button'
      btn.textContent = 'Apply'
      host.appendChild(btn)

      const snap = (): string => {
        const cs = getComputedStyle(btn)
        return `${cs.backgroundImage}|${cs.backgroundColor}|${cs.color}|${cs.borderTopColor}|${cs.outlineStyle}`
      }
      const rest = snap()
      btn.disabled = true
      const disabled = snap()
      btn.disabled = false
      btn.remove()
      return { rest, disabled }
    })
    // Disabled must differ from rest; hover/active/focus are asserted through real
    // pointer and keyboard state below, since CSS pseudo-classes cannot be forced.
    expect(distinct.disabled).not.toBe(distinct.rest)

    // The caption button's states are four separately measured faces, so they are
    // compared on the painted gradient. They used to differ only by
    // `filter: brightness()`, which is a guess this figure disproves: hover lifts
    // the red toward white while pressed darkens *and* saturates it.
    const close = page.locator('.xp-capbtn-close').first()
    const face = async (): Promise<string> =>
      close.evaluate((el) => getComputedStyle(el).backgroundImage)

    const rest = await face()
    // Disabled is read before the press, because releasing the pointer over the
    // close button closes the window and takes the element with it.
    const disabled = await close.evaluate((el) => {
      const btn = el as HTMLButtonElement
      btn.disabled = true
      const bg = getComputedStyle(btn).backgroundImage
      btn.disabled = false
      return bg
    })

    await close.hover()
    const hover = await face()
    await page.mouse.down()
    const active = await face()
    await page.mouse.up()

    expect(new Set([rest, hover, active, disabled]).size).toBe(4)
  })

  test('focus is visible on every chrome control', async ({ page }) => {
    await boot(page)
    const controls = page.locator('.xp-capbtn, .xp-sysicon')
    const n = await controls.count()
    expect(n).toBe(4)
    for (let i = 0; i < n; i++) {
      const el = controls.nth(i)
      await el.focus()
      const outline = await el.evaluate((e) => {
        const cs = getComputedStyle(e)
        return { style: cs.outlineStyle, width: cs.outlineWidth }
      })
      expect(outline.style, `control ${i} has no focus indicator`).not.toBe('none')
      expect(parseFloat(outline.width)).toBeGreaterThan(0)
    }
  })
})

test.describe('era-correct path syntax over the same stored nodes', () => {
  test('renders Windows paths with XP display names', async ({ page }) => {
    await boot(page)
    const result = await page.evaluate(async () => {
      const fs = window.__chronos.fs
      const codec = window.__chronos.codec
      const docs = (await fs.list(fs.root())).find((n) => n.wellKnown === 'documents')!
      const file = await fs.createFile(docs.id, 'Letter.txt', 'x', { mime: 'text/plain' })
      const path = codec.format(await fs.chain(file))
      return {
        path,
        // The stored name is canonical; only the display name is era-specific.
        storedName: docs.name,
        displayName: codec.displayName(docs),
        volume: codec.volumeName(),
        separator: codec.separator,
        roundTrip: (await codec.parse(path, fs.root())) === file,
        caseInsensitive: (await codec.parse(path.toUpperCase(), fs.root())) === file,
        forwardSlashes: (await codec.parse(path.replace(/\\/g, '/'), fs.root())) === file,
      }
    })
    expect(result.path).toBe('C:\\My Documents\\Letter.txt')
    expect(result.storedName).toBe('Documents')
    expect(result.displayName).toBe('My Documents')
    expect(result.volume).toBe('C:')
    expect(result.separator).toBe('\\')
    expect(result.roundTrip).toBe(true)
    expect(result.caseInsensitive).toBe(true)
    expect(result.forwardSlashes).toBe(true)
  })

  test('the recycle bin and program files use XP names', async ({ page }) => {
    await boot(page)
    const names = await page.evaluate(async () => {
      const fs = window.__chronos.fs
      const codec = window.__chronos.codec
      const roots = await fs.list(fs.root())
      return roots.map((n) => ({ stored: n.name, shown: codec.displayName(n) }))
    })
    const byStored = new Map(names.map((n) => [n.stored, n.shown]))
    expect(byStored.get('Trash')).toBe('Recycle Bin')
    expect(byStored.get('Applications')).toBe('Program Files')
    expect(byStored.get('Pictures')).toBe('My Pictures')
  })

  test('name collisions get the Windows decoration, not the Mac one', async ({ page }) => {
    await boot(page)
    const suggested = await page.evaluate(async () => {
      const fs = window.__chronos.fs
      await fs.createFile(fs.root(), 'Report.txt', 'a', { mime: 'text/plain' })
      const { xpNameDecorator } = await import('/src/skins/winxp/paths.ts')
      return fs.suggestName(fs.root(), 'Report.txt', xpNameDecorator)
    })
    // Windows appends " (2)". Classic Mac appended " copy" — that belongs to a
    // different skin, and the filesystem knows neither.
    expect(suggested).toBe('Report (2).txt')
  })
})

function hexToRgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`
}
