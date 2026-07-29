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

**Phase 1 complete: window manager and focus model, one era, unstyled boxes.**

The `plain` skin is a neutral harness, not an era — its job is to prove the skin
contract is sufficient before any fidelity work starts. The six era skins land in
phases 3 and 4.

Working now: real z-order, click-to-focus with inactive chrome, eight-handle
resize with per-app minimum sizes, double-click-to-maximize (with both `fill` and
classic-Mac `zoom` semantics), Alt+Tab with a live switcher overlay, Alt+F4,
era-delegated minimize animation, modal dialogs that genuinely block their owner
via native `inert`, unsaved-changes close guards, context menus everywhere with
separators, submenus and real disabled entries, and full keyboard operation
including keyboard window move and resize.

### Phase 1 gate evidence

Measured with 20 windows open, under 4x CPU throttling, over a ~6s continuous
drag along a direction-changing path — reproduce with `npm run test:perf`:

```
frames=361  median=16.70ms  p95=16.70ms  p99=16.80ms  max=16.80ms
over50ms=0  longTasks=0  layouts=1  retainedHeapDelta=126KB
```

Zero dropped frames, one layout for the whole drag, and a flat retained heap
after a forced collection. Transfer budget: 11.4KB gzipped core against a 60KB
allowance, ~15KB total critical path against 250KB.

The architecture invariants are enforced by tests rather than by discipline —
era-identifier leakage into `core/`, `apps/` or `shell/`, persistence outside the
filesystem layer, `top`/`left` writes in the window manager, layout reads in the
drag hot path, placeholder markers, missing metric provenance, and duplicate root
listeners all fail the build.
