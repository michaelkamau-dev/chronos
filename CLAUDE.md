# Chronos — Working Rules

## Hard rules
- No new runtime dependencies. Ask first, always.
- No React, no Tailwind, no component libraries. Vanilla TS + CSS.
- Never write TODO, FIXME, placeholder, stub, or "in a real implementation."
  If it can't be finished now, stop and tell me why.
- Never simplify or remove existing behavior to make a new feature easier.
  Flag the conflict instead.
- Never claim something works without running it.

## Fidelity rules
- Chrome dimensions are measured values, not eyeballed. Unverifiable value →
  comment it as unverified rather than inventing a number.
- Every interactive element ships all five states: rest, hover, active,
  focus, disabled.
- Every mouse interaction has a keyboard path.
- Era styling lives only in the skin layer. Zero era conditionals inside app
  logic or the window manager.

## Performance rules
- Window movement uses transform only. Never top/left. Never layout-triggering
  properties in a drag loop.
- No allocation inside rAF callbacks.
- One delegated listener per event type on the root, not per window.

## Architecture invariants
- Window manager knows nothing about apps. Apps know nothing about eras.
- Filesystem is the single source of truth. No app holds duplicate state.
- All persistence flows through the FS layer. No direct IndexedDB calls
  outside it.

## Mistake log
Append every correction I make here as a permanent rule. Never delete entries.
