/**
 * Tests candidate substitutes for the Windows 3.1 System font against the metric
 * target measured from the VGA captures.
 *
 * The target is in docs/sources/win31-metrics.md and is not a similarity judgement:
 * it is a cap height, a stem width, and per-glyph ink widths plus ink-start deltas for
 * two strings the captures contain. A candidate either reproduces those pixels at an
 * integer font size or it does not.
 *
 * Two ways to fail, and the second is the one that rules out most of the field:
 *
 * 1. **Wrong widths or weight.** Measurable directly.
 * 2. **Cannot reach a 9px cap height at all.** A pixel font designed on a different
 *    cell steps its cap height 8, 10, 12 … as the font size rises, with no size that
 *    yields 9. No amount of width similarity helps — the face is on the wrong grid,
 *    and forcing a fractional size reintroduces the antialiasing the whole
 *    integer-scale decision exists to avoid.
 *
 * The antialiasing check is the third signal: a face genuinely on the pixel grid
 * renders zero intermediate greys. Any grey count above zero means the outlines are
 * not landing on device pixels at that size, so the text will render soft however well
 * its widths match.
 *
 * Rendering and measurement was done with PIL's FreeType binding, which is what the
 * build sandbox has; the measured outcome per candidate is recorded below so the
 * verdicts stay reviewable without refetching five fonts. Re-measure with
 * `tools/captures/measure-win31.py` for the target side and a fresh render for the
 * candidate side if a new face becomes reachable.
 *
 *   node tools/font-compare/win31-system.mjs
 */

/** Measured from docs/sources/win31-*.png. See tools/captures/measure-win31.py. */
export const TARGET = {
  capHeight: 9,
  inkHeight: 13,
  stem: 2,
  strings: {
    Minimize: { widths: [10, 2, 6, 2, 10, 2, 6, 6], deltas: [12, 4, 8, 4, 12, 4, 8], total: 58 },
    Cancel: { widths: [7, 6, 6, 6, 6, 2], deltas: [8, 7, 7, 7, 7], total: 38 },
  },
}

/**
 * Results as of the era/win31 measurement pass, from the four candidates reachable
 * through the build sandbox's proxy. Recorded here rather than only in a doc so the
 * next person to run this can tell immediately whether anything changed.
 *
 * `raw.githubusercontent.com` is allowlisted and is how these were fetched;
 * `cdn.jsdelivr.net` and the GitHub API are not.
 */
export const RESULTS = [
  {
    face: 'DotGothic16 Regular',
    licence: 'OFL',
    capHeightAt: 10,
    stem: 1,
    verdict: 'reject',
    why: 'Reaches a 9px cap but with 1px stems — the System font is bold. Also far '
      + 'too narrow: Minimize measures 40px against 58, Cancel 28 against 38. '
      + '228 antialiased pixels, so it is not on the grid either.',
  },
  {
    face: 'Silkscreen Bold',
    licence: 'OFL',
    capHeightAt: 14,
    stem: 3,
    verdict: 'reject',
    why: 'Reaches a 9px cap but with 3px stems and far too wide: Minimize 81px '
      + 'against 58, Cancel 68 against 38. Silkscreen is a display face, not a UI '
      + 'face, and its proportions say so.',
  },
  {
    face: 'Pixelify Sans',
    licence: 'OFL',
    capHeightAt: null,
    stem: null,
    verdict: 'reject',
    why: 'Cannot reach a 9px cap height at any integer size — it steps 8 to 10.',
  },
  {
    face: 'Handjet',
    licence: 'OFL',
    capHeightAt: null,
    stem: null,
    verdict: 'reject',
    why: 'Cannot reach a 9px cap height at any integer size.',
  },
  {
    face: 'VT323 Regular',
    licence: 'OFL',
    capHeightAt: null,
    stem: null,
    verdict: 'reject',
    why: 'Cannot reach a 9px cap height at any integer size, and it is monospaced '
      + 'where the System font is proportional.',
  },
  {
    face: 'W95FA',
    licence: 'OFL',
    capHeightAt: null,
    stem: null,
    verdict: 'reject',
    why: 'Not tested on metrics because it is the wrong face by construction: an OFL '
      + 'recreation of the Windows *95* MS Sans Serif bitmap. 3.1 shipped MS Sans '
      + 'Serif as a separate dialog face our chrome never uses; its chrome is '
      + 'SYSTEM.FON throughout. Right licence, wrong face, one era late.',
  },
]

function report() {
  console.log('Windows 3.1 System font — substitution target')
  console.log(
    `  cap ${TARGET.capHeight}px, ink ${TARGET.inkHeight}px, stem ${TARGET.stem}px`,
  )
  for (const [s, t] of Object.entries(TARGET.strings)) {
    console.log(`  ${s}: widths [${t.widths}] deltas [${t.deltas}] total ${t.total}px`)
  }
  console.log('\nCandidates tested (all reachable OFL/CC0 faces found):')
  for (const r of RESULTS) {
    console.log(`  ${r.verdict.toUpperCase().padEnd(7)} ${r.face} (${r.licence})`)
    console.log(`          ${r.why}`)
  }
  const ok = RESULTS.filter((r) => r.verdict === 'accept')
  console.log(
    `\n${ok.length} of ${RESULTS.length} candidates match. `
      + (ok.length === 0
        ? 'No chrome may be built on this era until one does — CLAUDE.md forbids '
          + 'building on an unresolved font.'
        : `Use ${ok[0].face}.`),
  )
}

report()
