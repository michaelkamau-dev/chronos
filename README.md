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

## Running it

```
npm install
npm run dev      # http://localhost:5173
npm test         # typecheck, invariants, size budget, browser suite
```

Vanilla TypeScript and Vite. The only runtime dependency is `idb-keyval`.

## Status

**Phases 1–2 complete.** The window manager and focus model, and the filesystem
layer with proven reload survival.

The `plain` skin is a neutral harness, not an era — its job is to prove the skin
contract is sufficient before any fidelity work starts. The six era skins land in
phases 3 and 4.

### Phase 1 — window manager and focus model

Real z-order, click-to-focus with inactive chrome, eight-handle resize with
per-app minimum sizes, double-click-to-maximize (with both `fill` and classic-Mac
`zoom` semantics), Alt+Tab with a live switcher overlay, Alt+F4, era-delegated
minimize animation, modal dialogs that genuinely block their owner via native
`inert`, unsaved-changes close guards, context menus everywhere with separators,
submenus and real disabled entries, and full keyboard operation including
keyboard window move and resize.

Measured with 20 windows open, under 4x CPU throttling, over a ~6s continuous
drag along a direction-changing path — reproduce with `npm run test:perf`:

```
frames=361  median=16.70ms  p95=16.80ms  p99=16.80ms  max=16.80ms
over50ms=0  longTasks=0  layouts=1  retainedHeapDelta=124KB
```

Zero dropped frames, one layout for the whole drag, flat retained heap after a
forced collection.

### Phase 2 — filesystem and persistence

IndexedDB-backed, id-based, with metadata and content in separate records so
listing a folder never loads its files. Multi-record mutations go through a single
transaction, so the only inconsistency a crash can produce is unreferenced
content — reclaimed by a sweep at open.

Reload survival is proven by hash, not by inspection: a tree containing a 4KB
binary pattern, Unicode text and classic-Mac type/creator codes is written,
the page is reloaded, and every file's SHA-256 is compared. Two directory windows
open on the same folder stay in step through `fs.watch` without knowing about each
other, and so do two browser tabs, via a `BroadcastChannel` that carries ids
rather than content.

Path syntax is already era-blind: the filesystem is entirely id-based and every
path string comes from the active skin's `PathCodec`, so `HD:Documents:Letter` and
`C:\My Documents\Letter.txt` will be two views of one record.

### Enforced, not asserted

The architecture invariants are tests. Era-identifier leakage into `core/`,
`apps/`, `shell/` or `harness/`, persistence outside the filesystem layer, raw
storage-key construction, `top`/`left` writes in the window manager, layout reads
in the drag hot path, placeholder markers, missing metric provenance, duplicate
root listeners, and any command with a handler but no keyboard path all fail the
build.

83 tests: 11 architecture invariants, 5 size-budget checks, and 67 browser tests
driven with real pointer and keyboard input.

Transfer budget: 17.2KB gzipped core against a 60KB allowance, ~23KB total
critical path against 250KB.
