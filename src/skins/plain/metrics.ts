/**
 * Phase-1 harness metrics.
 *
 * `plain` is not an era. It is the unstyled-boxes skin the brief's phase 1 calls
 * for: it exists to prove the window manager contract and the 60fps drag budget
 * without any era fidelity in play. Its numbers are chosen to exercise the
 * contract — an asymmetric border so per-side maths is tested, a non-zero corner
 * radius, a 1px-thin edge that forces `resizeGrab` to matter — and they are
 * deliberately not copied from any real operating system.
 *
 * The provenance record still has to be complete, because the type demands it.
 * That is the point: an era skin cannot quietly ship a number without a source,
 * and neither can the harness.
 */

import { insets } from '../../core/geometry.js'
import type { ChromeMetrics, Provenance } from '../../core/wm/types.js'

export const PLAIN_METRICS: ChromeMetrics = {
  titleBarHeight: 24,
  titleBarHeightInactive: 24,
  border: insets(0, 1, 1, 1),
  cornerRadiusTop: 0,
  resizeGrab: 4,
  shadowInsets: insets(0, 0, 0, 0),
  cascadeStep: 22,
  dragGrabMargin: 48,
  maximizeSemantics: 'fill',
  minimizeStyle: 'shrink',
}

const HARNESS =
  'Phase-1 neutral harness — not an era. Values exercise the WM contract and ' +
  'match no real OS; every era skin replaces them with measured values.'

export const PLAIN_PROVENANCE: Provenance<ChromeMetrics> = {
  titleBarHeight: { level: 'derived', source: HARNESS },
  titleBarHeightInactive: { level: 'derived', source: HARNESS },
  border: { level: 'derived', source: HARNESS },
  cornerRadiusTop: { level: 'derived', source: HARNESS },
  resizeGrab: { level: 'derived', source: HARNESS },
  shadowInsets: { level: 'derived', source: HARNESS },
  cascadeStep: { level: 'derived', source: HARNESS },
  dragGrabMargin: { level: 'derived', source: HARNESS },
  maximizeSemantics: { level: 'derived', source: HARNESS },
  minimizeStyle: { level: 'derived', source: HARNESS },
}
