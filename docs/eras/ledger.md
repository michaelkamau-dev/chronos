# Ledger (2035) — the authored era

Everything decided, derived or left open for `era/ledger`. The shared docs keep the
cross-era rules; this file keeps what belongs to one era.

**Reproduce it all:**

```
npm run fonts:ledger -- /path/to/candidate/fonts docs/fonts/ledger-font-grotesque.png
npx playwright test test/browser/ledger-fidelity.spec.ts
```

---

## This era's source is a specification, not a document

The other five eras are archaeology. Their numbers are `documented` when a vendor wrote
them down, `measured` when they were read off a vendor's pixels, and `unverified` when
neither was available. Ledger has no vendor. `docs/ARCHITECTURE.md` §8 is its source, and
§8 says so itself:

> It gets an authored spec sheet — the one place in Chronos where a number is normative
> because I wrote it rather than uncertain because I found it.

That is a genuinely different epistemic status from the existing four levels, so
`ProvenanceLevel` gained a fifth: **`authored`**. It means *§8 states this value*. It
does **not** mean "I chose this value" — a number §8 does not state is `derived`, with
the arithmetic in the note, because the moment `authored` starts absorbing free choices
it stops carrying any signal and provenance has exactly one job.

| Level | Count | What it covers here |
|---|---|---|
| `authored` | the 40px gutter, ~400ms suspend, 1Hz refresh, 0.5Hz cursor, the three inks, ordered-Bayer tone, the title-bar cost format, the Steward's 20 minutes | §8 states it |
| `derived` | almost everything else — the whole geometry table | follows by arithmetic from an authored value |
| `unverified` | one: the Steward's re-ask interval | §8 states neither the value nor anything that determines it |

Nothing here is `documented` or `measured`, and that is the honest shape: there is no
document outside §8 and there are no pixels to measure.

---

## The four questions that were raised rather than invented

`CLAUDE.md`: *"A speculative era needs a premise, not a style."* §8 supplies the premise
and most of the consequences. Four things it does not supply are load-bearing enough
that inventing them would have been designing a style, so they were raised and signed
off before any chrome was built:

| Question | Answer | Why it could not be derived |
|---|---|---|
| The face | **Public Sans Black** | §8 states a category ("chunky grotesque at generous sizes") and a reason (physics), not a face |
| The three inks | `#F2EFE6` / `#1B1714` / `#C25E00` | §8 names them in words — "paper white, carbon black, and one amber ink" — and gives no values |
| Disabled text | **a voided ledger line** | the stipple is forbidden and the obvious alternative is provably indistinguishable from it — see below |
| Provenance policy | `authored` + `derived`, arithmetic shown | decides what every other number in the table means |

---

## The face: chosen by §8's own physics, on an instrument that had to be fixed first

§8 does not choose a face; it states a constraint and says the constraint is what
chooses:

> Type is heavy. Thin strokes do not survive dithering, so Ledger's face is a chunky
> grotesque at generous sizes. **The physics picks the type, not taste.**

So `tools/font-compare/ledger-publicsans.mjs` does not measure similarity — there is no
original to be similar to. It measures the claim: render the strings the skin actually
uses, apply the era's own bleach, and ask whether the strokes survive.

### The first instrument could not fail, and that is the finding

The first version counted ink runs that retained zero pixels after the first bleach
band. **Every candidate passed at every size** — six faces from Inter 700 to Archivo
Black, ten sizes each, sixty rows of zero. `CLAUDE.md` names this exactly: *a guard that
cannot fail is not a guard.*

The cause is arithmetic, not typographic. At band 1 the ordered threshold knocks out
four of sixteen cells and no Bayer row loses more than two of its four columns, so *any*
run three pixels wide or more keeps ink in every row it occupies. The instrument was
measuring the matrix rather than the face.

### What discriminates, and the derivation it produces

A run dies only when **every** one of its Bayer columns falls below the threshold, so
what matters is a stroke's width *along a row* — and for a vertical stem, every row of
the stem is a run exactly one stem wide. The tool now runs that as a proof over the
matrix itself rather than asserting it in a comment:

```
  level  width  severable
      4      1  YES        8      1  YES       10      1  YES       12      1  YES
      4      2  no         8      2  no        10      2  YES       12      2  YES
      4      3  no         8      3  no        10      3  YES       12      3  YES
      4      4  no         8      4  no        10      4  no        12      4  YES
```

Each Bayer row keeps one value at or above 10, so a four-pixel run covers all four
column residues and cannot be severed at any level the era uses. **The gate is
`stem >= cell`** — four pixels — and it is a derivation from the matrix rather than a
rule of thumb.

### The verdicts

Smallest size reaching a one-cell rasterised stem, over nine real chrome strings:

| Face | Licence | Passes at | Verdict |
|---|---|---|---|
| Archivo Black | OFL | **15px** | rejected on stability — see below |
| **Public Sans Black** | OFL | **18px** | **accepted** |
| Work Sans 800 | OFL | 18px | rejected: no advantage, and the register is generic |
| Bricolage Grotesque 800 | OFL | 20px | rejected: 2px larger for the same job |
| Inter 700 | OFL | 22px | rejected — the control, and it failed on the number as well as the register |
| Public Sans **Bold** | OFL | 26px | **rejected, and this is what proves the gate can fail** |

Three things worth keeping:

- **The gate does fail.** Public Sans Bold needs 26px to reach a 4px stem. That settles
  empirically that §8's "type is heavy" means **Black** rather than merely bold, instead
  of leaving it to taste.
- **Archivo Black passes 3px earlier and was still rejected.** Its rasterised stem is
  4, 4, 4, **3**, 4 across 15–19px — a hole at exactly 18px. Public Sans Black has no
  hole at or above its passing size. The stem measurement is of the *rasterisation*,
  which is what actually gets dithered, so non-monotonicity is a real property rather
  than a defect of the tool — and a face with a hole in its passing range is one bad
  size away from failing.
- **`thin` is the number you expect to matter and does not.** The apex of `o` is
  horizontally long, so its rows are wide runs and they survive however few of them
  there are. It is reported to show why it is not the gate.

### The register argument, which the number cannot make

Public Sans is the **US Web Design System** face. §8 calls the cost gutter "a regulatory
disclosure, not a preference", and the only candidate whose *origin* is the thing this
era satirises is the one designed for government forms. That is not measurable, which is
why it was a question rather than a derivation.

### Coverage, checked before the chrome rather than after

`CLAUDE.md`, from ChiKareGo2: a missing glyph does not fail loudly — it falls back to the
browser's default face, whose fractional advance takes every glyph *after* it off the
pixel grid. So the subset's coverage was checked first, and it changed a design decision:

| Character | In Public Sans? | Consequence |
|---|---|---|
| U+2014 em dash | **yes** | §8's `Letter — 3.1 kJ — 14 min` works as written |
| U+2026, U+2019, U+00B7 | yes | — |
| **U+25B2 up triangle** | **no** | the rounding mark is `+`, not `▲` |
| U+25B6, modifier symbols | no | submenu indicator is `>`; accelerators are spelled out |

The subset is 11.1 KB WOFF2 against a 30 KB per-era budget, Latin-1 plus the punctuation
the skin renders, with name IDs 0/13/14 retained — the copyright notice stays in the
subset because it is what a licence audit reads.

---

## The dither is the root, and it generates the geometry

§8: *"Tone comes from **ordered (Bayer) dither**, not from alpha, because low-power
display modes quantise."*

The base cell is **4** and it is `derived`, not chosen: §8 says the dither gets *coarser*
as a window ages, which means the base must be the finer of at least two cells. 2×2 gives
five tone levels, too few for a bleach whose job is to say how long; 8×8 is the coarse end
and starting there leaves nowhere to coarsen to. Four gives seventeen levels and an 8×8 to
age into.

Two rules fall out and between them they generate almost the whole table:

1. **Every box dimension is a multiple of the cell.** A tone boundary off the cell grid
   puts two dithered surfaces out of phase and the seam reads as a defect in the pattern.
   `ledger-fidelity.spec.ts` asserts this over the entire metrics table at once — a test
   of a *derivation*, which is only possible in an era whose numbers are reasoned rather
   than found.
2. **No hairlines.** Every rule is 4px. A 2px line is a thin stroke, and §8's reason for
   the heavy type applies to a line exactly as it applies to a stem.

Measured on the running desktop: **exactly two colours, `#F2EFE6` (432px) and `#1B1714`
(144px) in a 24×24 sample — 25.0%, which is Bayer level 4 of 16 exactly.** No third value
anywhere. That is System 1's strongest test arrived at from a different premise: there,
the display was 1-bit; here, the display quantises.

### The bleach is two axes because §8 names two

> Suspended windows fade like thermal paper. The longer a window sits unfocused, the
> further it bleaches toward the paper colour **and the coarser its dither gets**.

`level` is how much paper is printed back over the window; `cell` is how blocky the
pattern doing it is. A single "fade" number cannot express the coarsening, and `opacity`
is alpha, which §8 rules out. Five bands, on doubling times — a linear ramp would spend
its whole range on the first minute and say nothing for the next twenty.

---

## Disabled text, and a trap the parity discriminator could not see

`CLAUDE.md` settles the history: the stipple governs **System 1 and Windows 3.1 only**,
Mac OS 8 already dropped it, and an era fifty years later inheriting it would be a
costume. So Ledger needed something else — and the obvious something else is wrong in a
way nothing would have caught.

**Bayer's lower half is exactly the even `(x + y)` sublattice, at every cell size.** The
recursion places `4v`, `4v+2`, `4v+3`, `4v+1` at the four corners of each quadrant, and
the two even-parity corners always take the two lower values. For a 4×4 matrix, values
`0..7` sit on even parity and `8..15` on odd:

```
 0  8  2 10        even parity holds 0,2,4,6,3,1,7,5  =  the low 8
12  4 14  6        odd  parity holds 8,10,12,14,11,9,15,13
 3 11  1  9
15  7 13  5
```

So **an ordered dither at or below 50% ink is pixel-for-pixel a checkerboard**, and
`measureParity` — the instrument that proves `notPatBic` on Apple's own bitmap and
`GrayString` on Microsoft's — would have reported a 2035 era as wearing a 1984 mechanism.
It would have passed the stipple test while being the wrong construction by fifty years,
and the test would have been *agreeing* with the mistake.

A tone *above* 50% does break parity, but at that ink level it barely reads as
unavailable, which trades a real signal for a technicality.

**What ships is a voided ledger line**: the label in carbon, struck with a 4px amber rule.
A voided line item on a receipt, which is what an unavailable command is in an OS that
presents itself as an account. `ledger-fidelity.spec.ts` runs `measureParity` against it
and requires it to **fail** to find a checkerboard — proving a negative with the
instrument that proves the positive twice.

---

## The cost gutter, and why the OS rounds up

§8 states the strip and states the rounding, and does not connect them:

> a permanent **40px** itemised strip down the right edge of *every window* … It cannot
> be hidden — it is a regulatory disclosure, not a preference.

> the OS **rounds every cost up** and tells you it did, in the gutter, every time.

They are the same fact. Forty pixels less the 4px frame rule leaves 36, and 36px of 18px
Public Sans Black holds **three glyphs and no more**. So every value is squeezed to three
characters — and squeezing upward is the choice a billing authority makes. The pettiness
§8 asks for turns out to be what a machine does when its own disclosure column is too
narrow for its numbers. A construction rather than a flourish.

The gutter is declared to the window manager as **`border.right`** — 4px frame + 40px
strip — which is what makes §8's *"it makes every layout in the OS 40px narrower than it
wants to be"* true through the existing contract. `chromeExtra()` already subtracts the
border from the content area; nothing was added for this.

### The accounting is real; its scale is invented

| Quantity | Status |
|---|---|
| Frames painted | **real** — `RenderBudget.stats()`, measured |
| Elapsed | **real** — wall clock |
| Joules-per-frame coefficient | **invented** — no browser can measure a device's draw |
| Model calls | **really zero** |

A window accrues frame cost only while it holds focus, which is §8's deletion written out
as arithmetic rather than approximated: *"Only the focused window computes."*

**Model calls read `0` and that is deliberate.** §8's premise is that every search and
every autocomplete is a model call; phase 4 has no apps and therefore nothing that would
call one. Inventing a climbing number would have been the one place this era lied about
its own accounting, in the strip whose entire purpose is disclosure.

The two coefficients are calibrated against §8's own example — `Letter — 3.1 kJ — 14 min`
— which is the closest thing this era has to a source figure. 840 seconds at 2.5W of panel
baseline is 2100 J, leaving 1000 J of frame cost, which at 0.12 J/frame is about 8300
frames: roughly 10fps averaged over a mostly-idle 1Hz session with typing bursts. A session
that looks like §8's example produces §8's number.

---

## The refresh band, and the one accessibility obligation in the era

§8: *"The screen refreshes at 1Hz while you read, in a visible horizontal band like
e-ink. Typing forces a burst mode that looks and behaves differently."*

**The band steps; it does not sweep.** At 1Hz the governor delivers one frame per second,
so the band can only be drawn once per second — it moves one band-height per delivered
frame. That is what a panel doing partial refreshes looks like, and it makes the band a
direct readout of the governor: one delivered frame, one step. Under a burst it moves
every frame and reads as a fast sweep, which is §8's "looks and behaves differently"
without a second mechanism.

**The cursor is arithmetic, not a timer.** 0.5Hz against a 1Hz refresh is `index % 2`, so
the two rates §8 states produce the blink between them.

**The band stops when the query flips, not merely starts suppressed.** That is why the
skin uses `onReducedMotionChange` rather than `prefersReducedMotion()` alone — a
point-in-time read at construction would keep a band travelling across the screen of
someone who asked it to stop while it was already moving. The fidelity test flips the
query in both directions, because a one-way transition would pass a weaker test and be
broken.

Throttling is **not** stopped by reduced motion. Throttling is a power policy and reduced
motion is an accessibility obligation; they answer different questions.

---

## The Steward

A modal window owned by the window it proposes to close — `wm.open({ modalOwner })` —
not a bespoke overlay. It inherits the window manager's real `inert` blocking, focus
redirect and rejection feedback, and it gets Ledger chrome, **which means it carries its
own cost gutter and bills you for interrupting you.** That is the satire made structural
rather than written into a string.

§8 asks for the defer control to be "deliberately the smallest target on screen".
`CLAUDE.md` forbids an era's hostile behaviour from being what blocks an accessibility
escape hatch. Both are satisfied, and the split is the point:

- The **pointer** target is 12px, and a test asserts nothing else on screen is smaller.
- The **keyboard** path is full size: a real button in the tab order, the era's full 4px
  amber focus ring, and Escape defers.

A target that is merely small is an era being unpleasant. One that is unreachable is an
era being broken.

The 20-minute threshold is driven in the suite with Playwright's clock rather than waited
out, so the era's most specified behaviour is verified rather than assumed.

---

## Knowing divergences

| Divergence | Why |
|---|---|
| **Model calls read zero** | Nothing in phase 4 calls a model. Faking the number would be a lie in the disclosure strip. |
| **The joule scale is invented** | No browser can measure device draw. The counts are real and the coefficient is not, and both are stated. |
| **The Steward's re-ask interval** | §8 says "deferred but not disabled" and gives no interval. The only `unverified` value in the era. |
| **The index field opens a new entry rather than resolving the number** | The bar routes through `shell.newWindow`, the semantic command that exists. Resolving an entry number to an app window is phase 5's, and pretending otherwise would put app knowledge in a skin. |
| **`dragGrabMargin` protects the gutter in one direction only** | `geometry.ts` applies the margin symmetrically, so dragging off the left keeps the whole disclosure visible and dragging off the right does not. Recorded as a bound rather than dressed as a guarantee. |

---

## What is still open

1. **The joules-per-frame coefficient** would be settled by any real measurement of
   device draw. There is none available from a browser tab, so it stays calibrated
   against §8's example rather than against hardware.
2. **The Steward's re-ask interval** needs a number from §8, or a stated decision that
   five minutes is it.
3. **The model-call line** starts counting when phase 5 gives the era something that
   would call a model. Until then its zero is the honest reading.
