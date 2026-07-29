# Decisions

Every judgement call made without stopping to ask, with the reasoning and the
tiebreaker used. `docs/ARCHITECTURE.md` is the tiebreaker of record; where a call
departs from it, that is stated explicitly and the doc is updated.

Newest phase last. Nothing is deleted from this log.

---

## Phase 1 — window manager and focus model

### 1.1 A neutral `plain` harness skin, not a real era first

**Call.** Phase 1 ships a skin called `plain` that is explicitly not one of the six
eras.

**Reasoning.** The brief's phase 1 is "one era, unstyled boxes", and the
architecture doc makes Windows XP the phase-3 reference implementation every other
era is measured against. Building phase 1 against a half-done XP would mean the
contract gets validated against a moving target, and any contract bug would be
indistinguishable from a fidelity bug. A deliberately neutral skin proves the
`Skin` manifest is sufficient with no fidelity in play.

**Consequence.** `plain` carries a full `Provenance<ChromeMetrics>` record marked
`derived`, with a source string saying it matches no real OS. That keeps the
provenance invariant honest rather than making the harness an exception to it.

### 1.2 Frame position lives in skin CSS, not inline JS

**Call.** `.win { left: 0; top: 0 }` is declared in the skin stylesheet; the window
manager writes only `transform`.

**Reasoning.** The first draft set `style.left = '0'` once at window creation. That
is harmless at runtime but it makes the "transform only, never top/left" rule
unenforceable — any mechanical check has to allow the creation-time write, and the
exception is exactly where a regression would hide. Moving the two declarations to
CSS means `test/invariants.test.js` can assert the window manager never writes
either property, with no carve-out.

**Tiebreaker.** CLAUDE.md performance rules: "Window movement uses transform only.
Never top/left."

### 1.3 Window manager state is intentionally stale during a gesture

**Call.** A drag writes `transform` directly to the frame element and commits to
window manager state once, on pointerup. `WindowState.rect` is stale for the
duration.

**Reasoning.** Committing per frame would fire a `moved` event and run
`updateFrame` sixty times a second, which is work the frame budget cannot afford
and which no observer needs. Pointer capture means nothing else can be hit-tested
mid-gesture, so nothing can observe the staleness. Escape reverts from the
captured start rect, so cancellation does not depend on committed state either.

**Documented at** `src/core/wm/drag.ts` module comment, so the next reader does
not "fix" it.

### 1.4 One per-frame string allocation is accepted and stated

**Call.** The rAF callback allocates exactly one string — the `translate3d(...)`
template — and nothing else.

**Reasoning.** CLAUDE.md says "No allocation inside rAF callbacks." Taken
literally that is unachievable through CSSOM: `style.transform = …` needs a
string, and the Typed OM alternative (`CSSTranslate` + `CSS.px`) allocates a
wrapper object per call, which is strictly worse. Rather than quietly violate the
rule or claim a zero that is not real, the loop eliminates every avoidable
allocation — no closures, no arrays, no objects, no listener churn, a preallocated
session object and a bound tick function — and the one unavoidable allocation is
named in a comment.

**Evidence it is enough.** 124KB retained heap growth after a forced collection
across 361 frames, which is flat.

### 1.5 Manual double-click tracking rather than the `dblclick` event

**Call.** The dispatcher tracks click timing and slop itself.

**Reasoning.** `dblclick` does not survive pointer capture on an element that is
moving under the cursor, which is exactly the title-bar case. Tracking it costs
five numbers on the dispatcher and works during a drag.

### 1.6 Chrome buttons act on pointerup, not pointerdown

**Call.** Close, minimize and maximize fire on release.

**Reasoning.** Every one of the six eras let you press a caption button, move off
it and release to abort. Firing on press would be a behavioural regression against
all of them.

### 1.7 Modal blocking via the native `inert` attribute

**Call.** A window that owns an open modal gets `inert`.

**Reasoning.** `inert` removes the subtree from tab order, from the accessibility
tree and from pointer targeting at the platform level. The usual alternative — a
pair of focus-sentinel elements plus a keydown trap — approximates one of those
three and gets the other two wrong. `inert` has been Baseline since 2023, so it
costs no dependency and no fallback.

### 1.8 Menu dismissal belongs to the capture layer, not the dispatcher

**Call.** `MenuController` owns its own dismissal; the dispatcher has no
menu-specific branch.

**Reasoning.** The first draft dismissed menus from the dispatcher on any
pointerdown. That also swallowed clicks *on* menu items, because the dispatcher
cannot tell inside-the-menu from outside without knowing about menus — which is
precisely the coupling the capture stack exists to avoid.

### 1.9 The opening gesture's own release must not dismiss the menu

**Call.** `MenuController` tracks whether a pointerdown has arrived since the menu
opened, and ignores a release that predates one.

**Reasoning.** Chrome fires `contextmenu` on mousedown, so a right-click's mouseup
lands while the menu is already up and read as a dismissing click — the menu
flashed and vanished on every right-click. The flag also makes press-drag-release
work for free: a release *over an entry* activates it, so the classic-Mac gesture
and the Windows click-then-click gesture are both correct under one rule.

### 1.10 Key-name aliases, plus a load-time check for unreachable chords

**Call.** The chord parser normalises names like `Space` to the value
`KeyboardEvent.key` actually reports, and each skin's keymap is validated at module
load.

**Reasoning.** `Alt+Space` silently never fired: the space bar reports `' '`, not
`'space'`. Nothing threw, nothing logged — a dead keyboard path is invisible until
someone presses the key. With six skins to come, each with its own chord table,
this needed a mechanical guard rather than vigilance.

### 1.11 Unbound commands removed rather than given invented chords

**Call.** `shell.openLauncher`, `shell.focusDesktop`, `shell.openContextMenu` and
`app.quit` were deleted from the command vocabulary.

**Reasoning.** The accessibility gate found two commands with handlers and no
keyboard path. Inventing chords to satisfy the test would be writing to the test
rather than to the requirement, and `shell.focusDesktop` has no user-facing
purpose until desktop icons exist. `shell.openContextMenu` was a duplicate of the
dispatcher's own Shift+F10 path. They return when they have a job.

**Tiebreaker.** CLAUDE.md: "If it can't be finished now, stop and tell me why" —
so an unreachable command is not left in place.

### 1.12 Perf measured under 4x CPU throttling

**Call.** The 60fps gate runs with `Emulation.setCPUThrottlingRate` at 4x, 20
windows open, over a ~6s drag along a direction-changing path.

**Reasoning.** The brief says "60fps on a 2019 laptop". Measuring unthrottled on a
server CPU would prove nothing. 4x is the standard mid-tier proxy, a
direction-changing path stops the compositor settling into an easy case, and the
assertion is on the p99 and the count of frames over 50ms rather than the mean,
because dropped frames hide in the tail.

**Also.** `--disable-frame-rate-limit` was removed from the launch flags: an
uncapped frame rate makes measured rAF intervals meaningless.

### 1.13 Playwright points at the pre-installed Chromium

**Call.** `launchOptions.executablePath` is set from `CHRONOS_CHROMIUM`, defaulting
to `/opt/pw-browsers/chromium`.

**Reasoning.** The installed browser revision does not match what this Playwright
version would fetch, and downloads are disabled in this environment. This is the
supported way to run against an existing build, and the env var keeps it portable.

### 1.14 Reduced-motion tests drive CDP directly and assert the emulation applied

**Call.** `setReducedMotion` sends `Emulation.setEmulatedMedia` and then asserts
`matchMedia` reports the expected value before testing behaviour.

**Reasoning.** Playwright's `reducedMotion` context option is silently a no-op
against this Chromium build — `matchMedia` still reported `no-preference`, so the
original tests passed while exercising the unreduced path. The pair is now tested
in both directions from one page, so it cannot pass for the wrong reason.

**Logged in** CLAUDE.md's mistake log, since the same trap will apply to Ledger's
1Hz refresh band.

---

## Phase 2 — filesystem and persistence

### 2.1 Node ids are UUIDs, not a monotonic counter — a documented departure

**Call.** `NodeId` is `crypto.randomUUID()`. A separate display-only `ordinal`
carries the monotonic number.

**Departs from** `docs/ARCHITECTURE.md` §3, which specified "monotonic".

**Reasoning.** A counter stored in `fs:meta` cannot be allocated safely from two
tabs: both read `nextId`, both write the same id, and one node overwrites the
other. There is no way to make that atomic through a key-value store without a
lock. UUIDs remove the failure mode entirely, and ordering — the only thing the
counter was providing — is available from `created`.

Ledger addresses files by entry number (`#04412`), so the ordinal is kept
alongside. It is explicitly documented as display-only and best-effort under
concurrent tabs: two tabs may mint the same ordinal, and because it carries no
behaviour that is cosmetic rather than corrupting.

**Tiebreaker.** The doc's own stated invariant — "Filesystem is the single source
of truth" — outranks the doc's incidental choice of id format. An id scheme that
can collide is not a single source of truth.

### 2.2 Content is written before the metadata that references it

**Call.** `createFile` writes the blob in one transaction, then the node record and
the parent's child list in a second.

**Reasoning.** Two transactions are needed because the blob write is what might hit
quota. Ordering them content-first means the only inconsistency a crash can
produce is content nobody references — which wastes space and nothing else. The
reverse order would produce a directory entry pointing at content that was never
stored, which is unrecoverable corruption.

A sweep at open reclaims orphaned content. That path is tested by deliberately
deleting a node record while leaving its blob, which is exactly the state a crash
between the two writes produces.

### 2.3 Multi-record mutations use one `setMany`, verified against source

**Call.** Every mutation touching more than one record batches into a single
`writeMany`.

**Reasoning.** The atomicity claim is load-bearing, so it was checked rather than
assumed: idb-keyval's `setMany` opens one `readwrite` transaction and issues every
`put` against it. Reading the implementation was cheaper than discovering later
that each `set` had its own transaction.

### 2.4 Cross-tab sync included, though it is beyond the gate

**Call.** A `BroadcastChannel` carries change notifications between tabs.

**Reasoning.** The gate only asks for two windows in one tab. But two tabs share
one IndexedDB, so without this the "single source of truth" invariant would be
true only within a tab — a second tab would show stale directory listings
indefinitely. The mechanism is about twenty lines, it is testable, and retrofitting
it after six skins and six apps depend on `watch` would be considerably worse.

Payloads carry ids only. The receiving tab re-reads, which keeps the no-duplicate-
state rule intact rather than making the channel a second source of truth.

### 2.5 Name-collision decoration is a parameter, not filesystem knowledge

**Call.** `suggestName(parent, name, decorate)` takes a `NameDecorator` from the
caller.

**Reasoning.** Classic Mac appended ` copy`; Windows appended ` (2)`. That is era
knowledge, and the filesystem sits in `core/`, where the invariant test forbids it.
The filesystem enforces uniqueness and refuses a collision with a typed error; the
skin supplies the spelling.

### 2.6 Name validation rejects all three eras' path separators

**Call.** `/`, `\` and `:` are refused in stored names, along with control
characters, `.`, `..` and empty strings.

**Reasoning.** A name legal in one era can make another era's path unparseable —
a file called `HD:thing` breaks the classic-Mac codec, and `a/b` breaks the POSIX
one. The stored name has to be safe for every codec that will ever read it, so
validation is the union of all six eras' restrictions rather than any one era's.

Stricter per-era conventions — Windows 3.1's 8.3 uppercase, for instance — are
display-time coercion in the codec, not storage restrictions. Otherwise saving in
Win 3.1 would permanently truncate a name that Tiger could have shown in full.

### 2.7 A purge notifies each removed directory's own watchers

**Call.** After deleting a subtree, `purge` notifies the parent *and* every removed
directory's own watcher set.

**Reasoning.** A window showing a folder watches that folder, not its parent. The
first implementation notified only the parent, so a window showing a folder that
got deleted never heard about it and kept rendering a directory that no longer
existed. Notifying the removed nodes lets the view recover to the root.

This is a contract decision, not just a bug fix: it establishes that a watcher on
a node is notified when that node is destroyed, which the Files app in phase 5 will
rely on.

### 2.8 Reading a file does not emit a change event

**Call.** `read` updates `accessed` through a direct write with no notification.

**Reasoning.** A directory listing that reads file contents — thumbnails, previews,
a text editor's initial load — would retrigger its own watcher and loop forever.
`accessed` is metadata about observation, not a change to observe.

### 2.9 Well-known folders are structurally protected

**Call.** Nodes carrying a `wellKnown` tag cannot be trashed or purged, and the
root and seeded folders are `locked`.

**Reasoning.** The Trash cannot be put in the Trash. More generally, every era's
shell assumes its well-known folders exist; letting a user delete Documents would
leave the file manager with no valid start location and every era's "Save As"
dialog pointing at nothing.

### 2.10 The directory view guards against overlapping renders

**Call.** Each render takes a monotonic token and abandons itself if a newer render
started while it was awaiting.

**Reasoning.** A change event can arrive while a listing read is in flight. Without
the token the older read finishes last and paints stale content over fresh — the
classic async-render race, and one that only shows up under exactly the rapid
mutation the sync test performs.

### 2.11 Test seams are real API where they can be, diagnostics where they cannot

**Call.** `reopen()`, `watcherCount()` and `blobCount()` are public `Filesystem`
methods with honest names. The two genuinely illegitimate pokes — forcing a future
schema version, orphaning content — live in `main.ts`'s already-declared test
surface and use the store directly.

**Reasoning.** `*ForTest` methods on shipped API are a smell, and CLAUDE.md forbids
code that exists only to satisfy a test. But three of the five seams have real
jobs: `reopen` is needed for factory reset and the phase-4 era switch,
`watcherCount` is how a subscription leak is observed rather than guessed at, and
`blobCount` is a disk diagnostic. The remaining two produce states the public API
must never be able to produce, so they belong outside it.

### 2.12 Migration refuses a newer schema rather than downgrading

**Call.** Opening a store whose `schemaVersion` exceeds the build's throws.

**Reasoning.** The filesystem is designed to outlive the code that wrote it. A
build that silently downgrades would destroy fields it does not know about, and the
user would discover it as missing work rather than as an error. Failing loudly is
recoverable; silent data loss is not.

The version is recorded only after a migration step's own writes land, so an
interrupted migration is retried on the next boot rather than skipped.

### 2.13 Schema version 1 ships with an empty migration list, mechanism tested

**Call.** `MIGRATIONS` is empty; the runner is tested against a synthetic
future-version store.

**Reasoning.** There is nothing to migrate from yet, and inventing a fake migration
to exercise the code would be a placeholder. But the mechanism must be known to
work *before* real data depends on it, so the refusal path and the version-ordering
logic are tested now via the diagnostic seam.

### 2.14 The root contributes the volume, not a path component

**Call.** `format()` skips the root node's name, so a path reads
`/Documents/Letter.txt` rather than `/Chronos/Documents/Letter.txt`.

**Reasoning.** Every one of the six eras spells the volume differently and none of
them spell it as an ordinary first component: Mac renders `Macintosh HD:`, Windows
renders `C:\`, Tiger renders `/`. Treating the root as a component would force
every codec to special-case it anyway.

### 2.15 A new `harness/` layer, added to the invariant scan

**Call.** The phase-2 directory view lives in `src/harness/`, and the era-leakage
and chrome-construction invariants now scan it.

**Reasoning.** It is a complete, working program but it is not the Files app — no
icon view, no Properties dialog, no drag and drop. Putting it in `apps/` would
misrepresent it as one of the six; leaving it unscanned would create a directory
where era knowledge could accumulate unchecked. A named harness layer inside the
invariant net is honest on both counts.

### 2.16 Two new invariants for the persistence boundary

**Call.** Nothing outside `src/core/fs` may construct a raw storage key or
reference `FsStore`.

**Reasoning.** The existing invariant caught direct `idb-keyval` and `indexedDB`
use, but a caller could still build `fs:node:<id>` and hand it to the store, which
would bypass both the batched-write atomicity guarantees and the `watch`
notification path — leaving every open view stale with nothing to detect it.

---

## Open items requiring input

Recorded here rather than acted on, because they need something only the repo owner
can supply. Neither blocks phases 1–2, which are complete.

1. **`docs/sources/` is empty.** Phase 3's gate is pixel comparison against 1:1
   references, and there are none yet. Expected: the Mac OS 8 Platinum HIG, a 1:1
   Windows 3.1 VGA capture, and a 1:1 Windows XP Luna capture. These also close the
   two verification gaps in `docs/ARCHITECTURE.md` §7 — Platinum is currently almost
   entirely `unverified`, and Windows 3.1's geometry is unsourced.

2. **The XP substitute face needs sign-off.** Neither Tahoma nor Trebuchet MS is
   redistributable. §11 records the agreed precondition: a rendered comparison at
   8pt and 11px, approved before any XP chrome is built. Not started, because the
   deliverable is a judgement the repo owner asked to make.
