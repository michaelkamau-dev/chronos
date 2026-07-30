# Chronos

A browser OS that boots into six real desktop environments across four decades,
sharing one persistent filesystem underneath.

Eras: System 1 (1984), Windows 3.1, Mac OS 8, Windows XP, Mac OS X Tiger, and
**Ledger**, a speculative 2035 OS built around a metered energy budget.

- The brief is in [`docs/BRIEF.md`](docs/BRIEF.md).
- The architecture — window manager contract, filesystem schema, the one-app /
  six-skins rendering model, the event and focus model, and the measured chrome
  tables with per-value provenance — is in
  [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
- Working rules and the running mistake log are in [`CLAUDE.md`](CLAUDE.md).
- Every judgement call made without stopping to ask, with its reasoning, is in
  [`DECISIONS.md`](DECISIONS.md).

## Running it

```
npm install
npm run dev      # http://localhost:5173
npm test         # typecheck, invariants, size budget, browser suite
```

Vanilla TypeScript and Vite. The only runtime dependency is `idb-keyval`.

## Status

**Phases 1–3 complete.** Window manager and focus model, the filesystem with proven
reload survival, and Windows XP Luna as the reference implementation.

### Phase 3 — Windows XP Luna, built to the primary source

The active skin. Built to Microsoft's own 1:1 figure rather than to XP.css, which is
wrong in four places:

| | Measured | XP.css |
|---|---|---|
| Caption height | **30px** | 28px |
| Sizing frame | **4px**, four discrete 1px steps | 3px, three steps |
| Outermost frame step | **`#0019CE`** | absent |
| Top corner | **5-row arc**, insets 5,3,2,1,1,0 | 8px radius |

The corner ships as an explicit `clip-path` polygon generated from those insets —
`border-radius` cannot reproduce a hand-drawn corner bitmap, and the fidelity test
asserts `border-radius: 0px` so the mechanism cannot quietly revert.

Documented from the Visual Guidelines and enforced by test: command buttons 75×23
with a **1px corner indent, not a radius**; two disabled greys that must never be
unified (controls `#A1A192`, menus `#808080`); different disabled fills for text
boxes and combo boxes; 16×16 check boxes; and caption buttons that are **not a
uniform set** — close is red *by category* under XP's semantic navigation-button
colours, minimize and maximize are blue.

The caption gradient is 30 measured hard-stop rows, not a two-endpoint ramp — it has
a highlight near the top and a second brightening lower down, and interpolating
would lose both. It remains tagged **contested**: the source figure is a JPEG, so
the structure is trustworthy and the exact values are not. `luna.msstyles` resolves
them.

Four substitute faces, since none of Microsoft's four is redistributable — see
[`docs/fonts/`](docs/fonts/README.md). One stated permanent fidelity loss: no
reachable OFL face reproduces Trebuchet MS's double-storey `g`, its signature glyph.

### Phase 1 — window manager and focus model

Real z-order, click-to-focus with inactive chrome, eight-handle resize with per-app
minimum sizes, double-click-to-maximize (both `fill` and classic-Mac `zoom`
semantics), Alt+Tab with a live switcher, Alt+F4, era-delegated minimize animation,
modal dialogs that genuinely block their owner via native `inert`, unsaved-changes
close guards, context menus everywhere, and full keyboard operation including
keyboard window move and resize.

Measured with 20 windows under 4x CPU throttling over a ~6s direction-changing drag
— `npm run test:perf`:

```
frames=360  median=16.70ms  p95=16.80ms  p99=16.80ms
over50ms=0  longTasks=0  layouts=1  retainedHeapDelta=124KB
```

Zero dropped frames and one layout for the whole drag — still true with Luna's
gradients and clip-path in place.

### Phase 2 — filesystem and persistence

IndexedDB-backed and id-based, with metadata and content in separate records so
listing a folder never loads its files. Multi-record mutations go through a single
transaction, so the only inconsistency a crash can produce is unreferenced content,
reclaimed by a sweep at open.

Reload survival is proven by hash: a tree with a 4KB binary pattern, Unicode text
and classic-Mac type/creator codes is written, the page reloaded, and every file's
SHA-256 compared. Two directory windows on one folder stay in step through
`fs.watch`, and so do two browser tabs.

Path syntax is era-blind — the same stored node renders `C:\My Documents\Letter.txt`
under XP and will render `Macintosh HD:Documents:Letter` under the classic Mac
skins. Only the codec changes.

### Enforced, not asserted

The architecture invariants are tests. Era leakage into `core/`, `apps/`, `shell/` or
`harness/`, persistence outside the filesystem layer, raw storage-key construction,
`top`/`left` writes in the window manager, layout reads in the drag hot path,
placeholder markers, missing metric provenance, duplicate root listeners, and any
command with a handler but no keyboard path all fail the build.

**106 tests**: 11 architecture invariants, 6 size-budget checks, and 89 browser tests
driven with real pointer and keyboard input.

Transfer budget: 17.2KB gzipped core against 60KB, 24.5KB of critical-path fonts
against 30KB, ~48KB total critical path against 250KB.

### Provenance is a type

Every skin ships `metrics.ts` beside a `Provenance<ChromeMetrics>` record that
TypeScript forces to be complete, tagging each value `documented`, `measured`,
`derived` or `unverified` with its source. An unverified value is allowed to exist;
an unexplained one fails the build. Sources and figure extractions are in
[`docs/sources/`](docs/sources/figures/README.md).
