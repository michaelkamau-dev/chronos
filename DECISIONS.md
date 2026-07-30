# Decisions

Every judgement call made without stopping to ask, with the reasoning and the
tiebreaker used. `docs/ARCHITECTURE.md` is the tiebreaker of record; where a call
departs from it, that is stated explicitly and the doc is updated.

Newest phase last. Nothing is deleted from this log.

## Picking this up cold

Read **`docs/ARCHITECTURE.md` §13, "State of play"** first — it is written for a session
with none of the preceding conversation and it carries what is merged, what the contract
additions were, where the font sheets live, how the perf gate is instrumented now, and
what is still open. Then `CLAUDE.md`'s mistake log, which is the accumulated list of
things that cost time to learn and must not be re-learned.

This file is the reasoning behind individual calls. If a decision looks arbitrary, the
entry explaining it is here; if a *rule* looks arbitrary, it is in `CLAUDE.md`.

Where the entries are, by phase:

| Entries | Phase |
|---|---|
| 1.1 – 1.14 | window manager, focus model, the `plain` harness skin |
| 2.1 – 2.16 | filesystem, persistence, reload survival |
| 3.1 – 3.14 | phase-3 preconditions: fonts, figure extraction, source conflicts |
| 3.15 – 3.21 | Windows XP Luna |
| 4.1 – 4.6 | phase-4 preparation: the caption-button figure, the base.css and test-suite audits, the reduced-motion contract fix |
| 4.7 – 4.10 | Windows 3.1 measurement, and the font gate that blocked its chrome |
| 4.11 – 4.16 | Windows 3.1 chrome, era selection, the budget and perf instruments |

The next entries are **4.17 onward**, for System 1.

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

---

## Phase 3 preparation — the XP substitute faces

### 3.1 Point sizes are resolved to integer pixels, never written as `pt`

**Call.** Every XP font size ships as an integer pixel value: Tahoma 8/9/11pt
becomes 11/12/15px, Trebuchet MS Bold 10pt becomes 13px, Verdana Bold 8pt becomes
11px, Franklin Gothic Medium 14/21pt becomes 19/28px.

**Reasoning.** At 96 DPI `8pt` is 10.667px, and CSS `font-size: 8pt` resolves to
exactly that — every glyph edge lands on a half-pixel and the whole UI softens.
Windows rasterised Tahoma 8pt at 11px. Only 9pt and 21pt happen to land on whole
pixels; the rest are rounding decisions, and writing `pt` would make a different
one silently.

**Tiebreaker.** §7's pixel-crisp rule: font sizes are integers, never derived
fractions. It was written for the bitmap eras and applies just as hard here.

### 3.2 Wine's Tahoma is used as a metric target, not shipped

**Call.** Advance widths parsed from `wine/fonts/tahoma.sfd` are the numeric
target the Tahoma candidates are ranked against. The font itself is not shipped.

**Reasoning.** Wine ships a face named `WineTahoma` whose `FullName` is `Tahoma`,
a Bitstream Vera derivative whose advances were matched to the real Tahoma so
Windows applications lay out correctly under Wine. That makes it the closest thing
to an authoritative Tahoma metric table that is freely available, and it turns
"which of these looks closest" into a measurable question. `Cancel` at 11px is
31.90px; the extraction is committed as `docs/fonts/tahoma-metric-target.json`.

Shipping the font itself would be better still, but converting the `.sfd` needs
FontForge: `sfdLib` parses the outlines and then fails on the file's TrueType
hinting data, and FontForge is not installed here. Recorded as an escalation
rather than dropped.

### 3.3 Source Sans 3 for Tahoma, over the marginally closer PT Sans

**Call.** Source Sans 3 (−3.2% from target) rather than PT Sans (−2.6%).

**Reasoning.** The 0.6 percentage point difference is a tie. Two things break it:
Microsoft also specifies **Tahoma Bold 8pt** for folder task-box headers, so the
row needs regular and bold — Source Sans 3 is variable and covers both from one
file where PT Sans needs two, which matters against a 250KB critical path. And
Tahoma's letterforms are plainly humanist without much personality, where PT Sans
carries a distinctive `a` and narrower proportions that read as "not Tahoma"
rather than as a near miss.

**Rejected outright: DejaVu Sans**, at +16.8%. It is a *Verdana* substitute, and
Verdana is the wider face. Using it as the system default would push every dialog
label and button caption out of its documented box. Worth recording because DejaVu
is the obvious reach for a permissive sans and here it is the wrong one — while
remaining correct for the Verdana Bold row.

### 3.4 Cabin for Trebuchet MS Bold, accepting a wrong `g`

**Call.** Cabin, despite its single-storey `g` where Trebuchet MS has a
double-storey one.

**Reasoning.** No metric target exists for this row — Wine ships no Trebuchet
substitute and no advance table was reachable — so it is judged on character and
plausible width. Cabin has the closest overall humanist feel and a sensible caption
width (142.7px against Source Sans 3's 144.3px and Open Sans's 164.1px), and its
variable weight axis means one file.

The `g` is a real divergence on the most character-bearing glyph in the face.
Source Sans 3 has the correct double-storey form and would additionally serve both
the Tahoma and Trebuchet rows from one file, saving about 13KB. I did not take that
because **caption text and body text being different faces is visible on every
window in the era** — collapsing them trades a two-or-three-pixel glyph detail for
a system-wide one. Flagged for override rather than decided quietly.

### 3.5 The mirror was fetched from the backing repo, not the site

**Call.** The Controls chapter was fetched from
`raw.githubusercontent.com/windowsdevops/windowsdevops.github.io/master/docs/controls.htm`.

**Reasoning.** `docs/sources/winxp-luna-metrics.md` states that `github.io` is
reachable from the build sandbox. It is not — `windowsdevops.github.io` is refused
at the proxy with a 403 on CONNECT, like every other non-allowlisted host. But
`raw.githubusercontent.com` is allowlisted and a `*.github.io` site is served from
a repository, so the same file is reachable by another route. The extraction was
confirmed verbatim, including both flagged conflicts.

### 3.6 Command button corner: built to the primary source

**Call.** 75×23px with a 1px corner indent, not a 3px radius.

**Reasoning.** Microsoft's exact words are *"The curve of a command button is a 1
pixel indent."* §7's radius came from XP.css, which is a recreation. Directed by
the repo owner and independently confirmed against the mirror.

### 3.7 Caption gradient left tagged contested rather than resolved either way

**Call.** §7 now marks the eight XP.css gradient stops `contested` instead of
replacing them with the published palette.

**Reasoning.** Neither endpoint (`#0997ff`, `#003dd7`) appears in Microsoft's
window-frame set (`#0062EA`, `#14A5F4`, `#081BCB`, `#4977B4`) — but Microsoft
explicitly calls its own list a *sample*, because Luna is gradient-heavy and the
running UI carries the full range. So the published set does not disprove the
measured stops; it just fails to corroborate them. Swapping one unverified set for
another would be motion without progress. `luna.msstyles` `[SysMetrics]` resolves
it.

**Tiebreaker.** CLAUDE.md: an unverifiable value is commented as unverified rather
than invented — and that applies to *replacing* a value as much as to adding one.

### 3.8 The comparison tool fails loudly when fonts do not load

**Call.** `tools/font-compare/build.mjs` throws if every candidate in a role
measures identically.

**Reasoning.** The first run reported all six Tahoma candidates at exactly 30.5px,
which reads as "these fonts are very similar" and actually meant none of them had
loaded. Canvas `measureText` and `fillText` do not trigger a CSS `@font-face`
fetch, so everything fell back to one default. The fix is the FontFace API; the
guard is so that failure mode can never be published as a comparison again.

---

## Phase 3 preparation — figure extraction

### 3.9 Figures are extracted as embedded bitmaps, never rendered from the page

**Call.** `tools/pdf-extract/` pulls image XObjects at native size rather than
rasterising pages.

**Reasoning.** "Standard window components in actual size" is only 1:1 in the
embedded bitmap. Rendering the page at any DPI resamples it, which destroys exactly
the measurement being sought. A corollary that cost some confusion first: the
page-placement scale is irrelevant — XP's figure is placed at 1.38 px/pt and
Tiger's at 1.538 and 1.25, none of them 96/72, and none of that changes the bitmap.

### 3.10 Tiger's scale is argued from a documented element, not assumed

**Call.** Tiger's Figure 13-2 measurements are reported as `measured` with the
calibration argument stated in full, rather than as `documented`.

**Reasoning.** Figure 13-2 contains no element whose size Apple published, so it
cannot be self-calibrated. What can be shown is that the same document embeds 1:1
bitmaps: Figure 14-1's three push buttons measure 16/22/19px including their drop
shadows against documented heights of 15/20/17px "not including the shadow" —
three independent matches once the shadow is excluded. That is evidence for the
window figure, not proof, and the difference is recorded rather than smoothed over.

Two things corroborate it anyway: the measured 22px title bar matches the
independent `NSStatusBar.system.thickness == 22` datum, and 15px matches the classic
Aqua scroll bar.

### 3.11 The XP caption gradient stays contested even though it is now measured

**Call.** The measured 30-row gradient is recorded in
`docs/sources/figures/README.md` as structure, and §7 keeps the gradient tagged
contested.

**Reasoning.** The figure is a JPEG, so every sampled value carries lossy error,
and the measured values match neither XP.css's endpoints nor Microsoft's published
palette. What the measurement *does* establish is the shape — two highlights rather
than a linear ramp, a plateau around `#0055E4`, two dark closing rows — which is
enough to build a faithful caption. Presenting JPEG-derived hex values as resolving
a colour question would be a worse error than leaving it open.

**Tiebreaker.** Same rule as 3.7: an unverifiable value is marked unverified rather
than invented, and that applies to replacing a value as much as to adding one.

### 3.12 Gradients are sampled as a per-row median, not down a column

**Call.** `measure-xp-titlebars.py` takes the median of caption-blue pixels per row.

**Reasoning.** The first version sampled a fixed column and produced `#B18719` —
orange — in the middle of a blue caption, because the column ran through the folder
icon. Rows near the title text reported near-white for the same reason. A per-row
median over pixels that pass a blue test discards both automatically.

### 3.13 Corrected: no candidate has Trebuchet's double-storey `g`

**Attribution, at the repo owner's instruction:** the Fira Sans double-storey claim
and the earlier Source Sans 3 one were both the owner's, not mine. Recorded here
because the log's purpose is that a decision can be revisited on its merits, and
that needs the provenance of the belief that drove it to be accurate.

**Call.** Cabin stands for the Trebuchet row, and my earlier claim that Source Sans
3 has the correct double-storey `g` is withdrawn.

**Reasoning.** Fira Sans Medium was added to the sheet to test the hypothesis that
it carries a double-storey `g`. It does not, and at 148.4px it is 5.7px wider than
Cabin, so it fails on both counts. Rendering all candidates at 150px and inspecting
them showed **every one is single-storey**, including Source Sans 3 — which I had
previously asserted was double-storey. That was wrong.

The consequence is that the compromise is unavoidable rather than a choice: no
reachable OFL face reproduces Trebuchet's `g`, so the decision reduces to width and
overall character, where Cabin wins.

**How the error happened, recorded so it does not repeat:** counting closed contours
in the glyph outline reports three for Cabin, Source Sans 3 and Open Sans versus two
for Fira Sans, which looks like a double-versus-single-storey signal. It is not — a
single-storey `g` can close its tail terminal as a separate contour. The structural
proxy was misleading and only rendering settled it.

### 3.14 The Trebuchet `g` is recorded as a permanent fidelity loss

**Call.** `docs/fonts/README.md` now lists the missing double-storey `g` in the same
table as Charcoal and Lucida Grande — losses with no available fix — rather than
describing Cabin as a close-enough compromise.

**Reasoning.** A compromise implies a better candidate might exist. This one does
not: Trebuchet's double-storey `g` is the face's signature, it is unusual enough in
a humanist sans to be its identifying mark, and no reachable OFL face has it. It
shows on every XP caption containing a `g` — `Programs`, `Settings`, `Log Off`. The
honest framing is a stated loss with a named cause, which is also the only framing
that leaves a future fix findable.

**Tiebreaker.** CLAUDE.md's fidelity rule: an unverifiable or unreachable value is
recorded as such rather than papered over. A missing glyph form is the same class of
fact as a missing measurement.

---

## Phase 3 — Windows XP Luna

### 3.15 The corner is a discriminated union in the contract, not a number

**Call.** `ChromeMetrics.cornerTop` is now
`{ kind: 'radius'; px } | { kind: 'steps'; insets }`.

**Reasoning.** XP's corner is a five-row arc with per-row x-insets 5,3,2,1,1,0 — a
hand-drawn corner bitmap. No `border-radius` value reproduces it, so a numeric
`cornerRadiusTop` field could only ever hold an approximation and would quietly
invite one. A union makes "this era's corner is categorically not a radius" a fact
the type system carries, and Tiger and Ledger can still say `radius` honestly.

Implemented as a `clip-path` polygon generated from the insets. Every segment is
axis-aligned on an integer pixel boundary, so there is no partial coverage and
therefore no antialiasing — the steps stay hard, which is the entire point. The
fidelity test asserts `border-radius` is `0px` so a future edit cannot quietly
swap the mechanism back.

### 3.16 Base layout moved out of the skin layer

**Call.** New `src/shell/base.css` carries the reset, `html/body/#chronos-root`
sizing, `.desktop` positioning and the frame transform-origin rule.

**Reasoning.** The XP skin was written without those rules and **every window
landed at y = −30**: `#chronos-root` had no height, so the work area computed to
zero and `constrainToWorkArea` clamped every window above the top edge. That is a
structural requirement masquerading as styling, and duplicating it into six
stylesheets would have reproduced the bug five more times.

The transform-origin rule is keyed off `[data-win-id]` — the attribute the window
manager itself sets — rather than off a skin class, so it holds regardless of what
a skin names its frame element. A skin can no longer forget it.

### 3.17 Behaviour tests assert the contract vocabulary, not skin classes

**Call.** `wm`, `a11y`, `perf` and `fs` specs select on `[data-win-id]`,
`[data-action]`, `[data-part]` and `[data-resize]` rather than `.win`,
`.win-button` and friends.

**Reasoning.** Making XP the active skin hung four suites outright: they were
waiting on `.win`, which only the harness skin emits. The tests are meant to assert
the *window manager contract*, which is exactly the data-attribute vocabulary — so
keying them to one skin's class names was wrong on its own terms, and it would have
broken again at every era in phase 4.

The same applies to their assertions: one test identified chrome buttons by
`className.includes('win-button')` and silently found none under XP. It now reads
`dataset.action`.

### 3.18 Filesystem tests are era-agnostic; era syntax is asserted per skin

**Call.** `fs.spec.ts` asserts path *properties* — round-trip, `..` resolution, a
trailing separator on directories — using the active codec's own `separator`. The
concrete `C:\My Documents\Letter.txt` spelling is asserted in `xp-fidelity.spec.ts`.

**Reasoning.** Those tests hardcoded `/Documents/...`, which is the harness codec's
syntax, so they failed the moment a real era became active. A filesystem test that
depends on one era's path spelling is testing the wrong layer — and the cross-era
spine is precisely the claim that the same stored node renders differently per era.

### 3.19 Font subsetting keeps the licence records, and axes are fully pinned

**Call.** `pyftsubset --name-IDs='0,1,2,3,4,5,6,7,13,14'`, and every variable axis
pinned before subsetting.

**Reasoning.** Two separate findings. First, pyftsubset drops name records by
default **including nameID 0 (copyright) and 13 (licence)** — both the OFL and the
Bitstream Vera licence require the notice to travel with the font, so the default
would have shipped four licence violations. `LICENCES.md` records how to verify
they survived.

Second, `varLib.instancer` with a partial pin keeps the `gvar`/`HVAR` machinery: the
four faces came to 65KB partially instanced and 47.6KB fully pinned. Source Sans 3
ships at wght 400 only, so nothing in the skin may ask for bold until the folder
task-box chrome lands and a second instance is added — a synthetic browser bold
would look wrong.

### 3.20 Two of the four faces are deferred, and the budget test knows it

**Call.** `palette-defer.woff2` and `header-defer.woff2` are declared in CSS but
excluded from the critical-path font budget.

**Reasoning.** Microsoft specifies four faces, which is inherently more than the
30KB single-era font budget assumed. But floating palette captions and 14pt+
headers do not exist on first paint, and a browser only fetches an `@font-face`
when rendered text uses it — so they are lazy for free, with no machinery.

The budget test now sums the critical-path faces rather than taking the largest,
because they load together. Critical path is 24.5KB of fonts against 30KB, and
~48KB total against 250KB.

### 3.21 `shadowInsets: 0` is recorded as a finding, not a gap

**Call.** XP's `shadowInsets` is tagged `unverified` with a note saying zero is a
positive finding.

**Reasoning.** Luna windows have no drop shadow — visible in the figure and
consistent with the Visual Guidelines. But "we measured zero" and "we have no value"
are different states, and a bare `0` would be indistinguishable from a default. The
note says which it is, and flags that menu drop shadows are a separate unmeasured
case.

## Phase 4 preparation — the caption-button figure and two audits

### 4.1 The caption-button geometry came from a second figure, not from `luna.msstyles`

**Call.** Caption button placement is now `measured` from the "Title Bar Buttons"
figure. 21×21, 2px gaps, a 2px gutter to the frame's inner edge, 6px down from the
caption top and 3px clear of its bottom. XP.css's `rightInset: 5` is dropped.

**Reasoning.** Phase 3 recorded this as blocked because the magnifier callout in
"Standard window components in actual size" covers the buttons. That was true of that
figure and not of the document: a separate figure in the same chapter shows three real
captions — inactive, active and maximized — with nothing drawn over any of the nine
buttons.

The calibration argument is the one from the mistake log rather than the placement
scale. This bitmap reproduces the 30px caption and the 4px right frame, both already
measured twice from a different bitmap, so it is 1:1. Twenty-seven button instances
across this figure and the states specimen sheet all measure 21×21 with a 1px outline,
which no non-integer resampling could produce. And the placement divides exactly:
6 + 21 + 3 = 30.

The 6px-against-2px difference between a restored and a maximized window is what
decomposes the inset: 4px of frame plus a 2px gutter, with the gutter showing alone
when there is no side frame. One CSS value is therefore right for both cases, because
the frame is drawn outside the title bar's box.

Reproducible via `tools/pdf-extract/measure-xp-capbuttons.py`.

### 4.2 The four button states ship as measured artwork, not as brightness filters

**Call.** `rest`, `hover`, `active` and `disabled` are each a 19-row measured
gradient per category. The `filter: brightness(1.18)` / `brightness(0.82)` pair is
gone. `disabled` is tagged `contested`.

**Reasoning.** The states figure exists to show exactly this, so leaving it unread and
shipping a multiplier was inventing a value with the source in hand. And the
multiplier is disprovable: hover lifts the close button's red toward white
(`#E55F3A` → `#FF836D`, per-channel ratios 1.11 / 1.38 / 1.88), pressed both darkens
and saturates it (`#C2401D`), and disabled removes the hue entirely (`#7578BD`). No
single brightness value is all three.

`disabled` is contested for the same reason the caption gradient is, and the evidence
is specific: the disabled specimens are drawn partly transparent over the figure's own
blue panel. Solving for one alpha gives 0.23 on the red and 1.57 on the blue, and an
alpha above 1 is not a compositing operation — so it is separate artwork over an
unknown background rather than the rest artwork at reduced opacity. The structure is
what ships; `luna.msstyles` resolves the values.

### 4.3 Six more structural rules left the skin layer

**Call.** `contain`, the title bar's `touch-action`/`user-select`, resize-handle
positioning, handle suppression on non-resizable and maximized windows, pointer-event
suppression mid-gesture, and the overlay z-index constants all moved to
`src/shell/base.css`, keyed off contract attributes.

**Reasoning.** The `base.css` extraction in phase 3 was reactive — a response to
windows landing at y=-30 — so the audit asked what else was structural. Six more, and
one had already diverged: the XP skin suppressed resize handles on a maximized window
and the plain skin did not, so the same window offered a resize cursor in one era and
not the other over an edge that `GestureController.begin` refuses to resize in both.
That is the failure mode the extraction exists to prevent, already present.

The z-index constants are now `--layer-menu` and `--layer-switcher` in base, because
the *ordering* is a contract and two skins picking different numbers would surface as
a bug in one era only. Seven new tests in `wm.spec.ts` assert all of it against the
contract vocabulary, so they hold for the five eras that follow without being
rewritten per skin.

Left in the skins deliberately: handle sizes and cursors (a 1px System 1 border needs
different grab slop from a 4px Luna frame), the suspended-window treatment (Ledger
bleaches rather than dims), and everything about appearance.

### 4.4 Reduced motion is enforced by the window manager, not by each skin

**Call.** New `src/core/motion.ts`. The WM skips `minimizeTo`/`restoreFrom` entirely
when the query matches; the per-skin checks are deleted.

**Reasoning.** This is the contract bug §11 asks to be told about rather than
absorbed. The check was duplicated in four places across two chrome renderers, on its
way to twelve at six skins, and a skin that omitted it would ship an era whose
minimize animation ignores the query with no test failing — the only symptom is motion
a viewer asked not to see. `CLAUDE.md` requires that an era's behaviour may never be
what blocks an accessibility escape hatch, so the enforcement point has to be
somewhere an era cannot reach.

The module also exports `onReducedMotionChange`, which Ledger's refresh band needs:
a running 1Hz timer has to stop when the query flips, not merely start suppressed.

### 4.5 Menus carry contract attributes, so tests stop depending on a skin's classes

**Call.** `data-menu`, `data-menu-item`, `data-menu-separator` and
`data-menu-submenu`, emitted by both skins and documented in the vocabulary table in
`core/wm/types.ts`. The switcher gets `data-switcher`.

**Reasoning.** The test-suite audit found the same reactive pattern as `base.css`.
`.menu` and `.menu-item` are the *plain* skin's class names, and the XP skin only kept
those tests passing because I made it emit `class="xp-menu menu"` — a second class
whose sole purpose was to satisfy a selector. Nothing enforced it, each new skin could
drop it, and the symptom would be a hanging suite rather than an error, which is
exactly how four suites failed when XP became the default.

Core was already clean: `MenuView` addresses entries by index into `entryEls`, never
by selector. This is a test-coupling problem, so the fix is a vocabulary plus a test
that the active skin emits it.

Not changed: the `.dirview-*` selectors in `fs.spec.ts`. Those belong to
`src/harness/directory-view.ts`, which is era-neutral harness code, not a skin — no
skin can change them, so there is nothing to decouple.

### 4.6 The perf gate asserts on long tasks rather than on raw frame gaps

**Call.** `expect(stats.over50).toBe(0)` becomes `expect(stats.longTasks).toBe(0)`,
plus a new `p95 <= 17.5` bound. `over50` stays in the reported diagnostics.

**Reasoning.** The gate went intermittent. Three consecutive runs gave 16.70ms
medians; one of them carried a single 483ms gap with `longTasks=0` and `layouts=1`. A
gap in rAF delivery with no long task means the renderer process was not scheduled at
all — the container's CPU was contended from outside the page — and no change to the
drag loop can prevent that.

So the instrument was wrong, not the threshold. "Our code never blocks the main
thread" is measured directly by the long-task count: a stall we caused is by
definition a task that occupied the main thread. Adding the p95 bound makes the gate
strictly stronger in the direction that matters — a drag hitting vsync only half the
time would have passed a median bound — while no longer failing on host noise. Four
subsequent runs: median 16.70, p95 16.70–16.80, p99 16.80, over50 0.

## Phase 4, era/win31 — measurement

### 4.7 Windows 3.1's disabled text is a stipple, and it is proven by parity

**Call.** `WIN31.disabledText = { mode: 'checkerboard', cell: 1 }`. Disabled menu
items and disabled button labels both render as a 50% checkerboard knocked out of the
black glyph. No grey fill anywhere.

**Reasoning.** The captures show it and a parity test proves it: ink on only one
`(x + y)` parity is a checkerboard, ink on both is a solid glyph. The disabled OK
label is 37 pixels with all 37 on one parity; the Cancel label beside it is 140 split
71/69. That is not a judgement call, and it is in the measurement script so it stays
checkable.

This is the fifth correction to the assumption that 3.1 is Windows 95 with a
different palette. The grey-fill-plus-white-shadow disabled style is a 95 feature, as
are the sunken edit field, the gradient caption, the grey menu bar and the grey
inactive caption.

It also constrains the implementation. CSS cannot knock a pattern out of live text, so
this ships as a 1-logical-pixel `repeating-conic-gradient` mask — which only survives
at an integer display scale. That is already the phase-1 decision for the bitmap eras,
and this is the first place it becomes load-bearing rather than merely correct.

### 4.8 The 3.1 bevel is 2px, correcting §7

**Call.** `bevel: { outline: 1, highlight: 2, shadow: 2 }`.

**Reasoning.** §7 has the construction right — three colours, no `COLOR_3DDKSHADOW`
— and the widths wrong. Both buttons in the Run dialog measure 2px of `#FCFCFC` on the
top and left and 2px of `#84888C` on the bottom and right. The outline's corners are
also notched, so it is not expressible as a `border` and ships as a clip path, the
same construction XP's 1px command-button indent uses.

### 4.9 The Run dialog's OK button is disabled, not pressed

**Call.** The 1px-label-shift-on-depress claim for Windows 3.1 stays `unverified`.

**Reasoning.** The capture was taken to settle it, and it does not: 3.1 disables OK
until the Run dialog's command line has content, so what looks like a pressed button
is a disabled one. Reporting this as settled because a button looked unusual would
have been exactly the invention the fidelity rules exist to prevent. The capture is
still valuable — it is where the disabled state came from. A capture with the mouse
held down on Cancel closes the remaining gap.

### 4.10 Windows 3.1 needs the System font, and W95FA is the wrong face

**Call.** `era/win31` stops at measurement. No chrome is built, because
`CLAUDE.md` forbids building on an unresolved font, and the font this era needs is
unresolved. §7's substitution row is split and corrected.

**Reasoning.** Measurement showed 3.1 uses **one** face for the whole era — captions,
menu bar, menu items, dialog labels, button labels — bold, 2px stems, 9px cap height.
That is `SYSTEM.FON`. §7 lists "Win 3.1 System / MS Sans Serif → W95FA" as a single
row, which collapses two different faces into one need: 3.1 shipped MS Sans Serif too,
as the lighter dialog face, and our chrome never uses it.

W95FA is an OFL recreation by Alina Sava of the **Windows 95** MS Sans Serif bitmap.
The licence is clean, unlike 98.css's converted binary, but the face is wrong and the
era is one step late — the same lineage mistake §7 already warns about, made
differently.

So this is the XP four-face gate again, and the phase-3 precedent applies: name a
specific face, show a rendered comparison at the sizes the era uses, then build. The
target is measured and objective — per-glyph ink widths and ink-start deltas for
`Minimize` and `Cancel`, plus the 2px stem, which is the constraint that rules out
most pixel fonts regardless of how well their widths match.

Everything that does not depend on the font is finished and committed: the metrics
module with full provenance, the reproducible measurement script, and the source doc.

## Phase 4, era/win31 — the chrome

### 4.11 Pixel Operator Bold accepted, with two quantified losses

**Call.** Pixel Operator Bold at `font-size: 16px` is the Windows 3.1 System font
substitute. Subset to 3.0KB. Two losses are recorded in the substitution table rather
than absorbed.

**Reasoning.** Every structural property verifies independently: 1600 upm as ascent
1300 plus descent 300, so exactly a 16px cell at 16px; `sCapHeight` 900, so exactly a
9px cap with no fraction; rendered at 16px it produces **2** distinct grey levels, pure
black and pure white, so it holds the pixel grid without the canvas escape hatch; bold;
proportional. That 9px-at-an-integer-size property is precisely what Pixelify Sans,
Handjet and VT323 failed on.

The losses, measured rather than estimated:

- **Advance widths diverge per glyph, in both directions.** Pixel Operator's caps are
  narrower than the era's — `M` advances 9px against 12 — and its lowercase are 1px
  wider. So string lengths land within about ±16% and the sign depends on the string:
  `Minimize` measures **58px against a 58px target**, exactly right, because two wide
  caps and six tight lowercase cancel out; `Cancel` measures **44px against 38px**,
  +16%. Reporting this as "16% wide" would be wrong — it is per-glyph divergence that
  nets out differently per string. `Cancel` at 44px still fits the measured 70px button
  with 10px each side, so nothing overflows; menus simply run wider than the era's.
- **The descender is 2px deep against the era's 4px.** `g`, `y`, `p` and `q` sit higher,
  so the 12px menu-item text block renders 11px.

Same category as Trebuchet's double-storey `g`: a real, permanent, stated loss rather
than a silent compromise.

### 4.12 The disabled stipple is a knockout overlay, not a CSS mask

**Call.** Disabled text paints a checkerboard of the *background* colour over the glyph
via an `::after` layer, inset past the bevel. The `mask` approach it replaced is kept
only for the chrome-box glyphs, which are already pseudo-elements.

**Reasoning.** The mask was wrong twice. It stippled the button's bevel along with its
label, so the workaround was to mask a `.w31-label` child — and a button whose label is
a bare text node then had **no disabled state at all**. The five-states test caught it:
disabled compared byte-identical to rest.

The overlay is also the actual historical mechanism. `GrayString` did not lighten the
glyph; it painted the background through a 50% pattern. Implementing what the OS did
turned out to be the only construction that works on arbitrary text content.

The knockout colour is a variable, so a highlighted disabled menu item knocks out
against the navy rather than against white — which is what the capture shows, the
surviving pixels of the disabled `Restore` being white on navy.

### 4.13 The era is selected by `?era=`, and skins load with `import()`

**Call.** `src/main.ts` gains an `ERAS` registry of thunks; the era comes from the query
string, defaulting to `winxp`. `main.ts` is the only module that names an era.

**Reasoning.** Two eras exist now, so something has to choose. Thunks rather than static
imports because the §6 transfer budget depends on exactly one era reaching the browser —
the build confirms it, emitting `skin-winxp` and `skin-win31` as separate chunks. An
unknown era warns and falls back rather than showing nothing, because a typo in a URL is
not a reason for a blank screen.

`window.__chronos.era` is exposed so a fidelity suite can assert it is testing the era
it thinks it is. Without that, `win31-fidelity.spec.ts` would pass vacuously against XP.

### 4.14 Vite's asset inlining is off

**Call.** `assetsInlineLimit: 0`.

**Reasoning.** The default 4KB threshold base64'd the 3.0KB Win 3.1 font into
`skin-win31.css`. That is wrong twice: it makes the font a render-blocking part of the
stylesheet rather than something the browser fetches only when text uses the face, and
it hides the bytes from the per-class font budget. Caught by noticing the font missing
from the build output.

### 4.15 The font budget is per era, and every font must be attributable

**Call.** `test/budget.test.js` attributes each font to the era whose compiled stylesheet
references it, by reading the `@font-face` URLs out of `skin-*.css`. The critical path is
now core plus the worst *single* era including its fonts. A new test fails if any shipped
font is referenced by no skin.

**Reasoning.** The old test summed every era's critical-path fonts, which was harmless at
one era and wrong at two: only one era loads, so summing them fails the budget for a
condition that cannot happen in a browser — and it would fail harder with each era added.
Filename convention would work until two eras picked similar names; reading the URLs is
exact. The attribution test exists because if the URL pattern ever stops matching, the
per-era budgets silently become wrong rather than failing.

### 4.16 The perf gate measures per-frame cost, not frame-interval percentiles

**Call.** `p95`, `p99` and `over50` are reported diagnostics. The assertions are
`ScriptDuration / frames < 3ms`, `LayoutDuration / frames < 0.5ms`, one style recalc per
frame, `longTasks === 0`, and the median at vsync.

**Reasoning.** The gate went from intermittent to consistently failing: p95 33.40ms,
p99 50.00ms, frame count down from ~360 to ~270, on every run. Diagnosed by running it
on `170f1ce` — the commit before any of this work — where it reproduces identically.
The container generation changed; the bundle did not.

An intermediate fix was tried and discarded, and the discard is the useful part.
"Every long interval must be a whole multiple of the vsync period" seems like the exact
discriminator between a frame the host skipped and a frame we delayed. It is useless:
the compositor delivers rAF only on vsync boundaries, so every interval is a multiple
whichever caused it. Verified by injecting a deliberate 7ms block per frame and
measuring zero off-grid intervals. A guard that cannot fail is not a guard, so it went
in the bin rather than into the suite.

CDP's duration counters are the honest instrument. Frame count and the percentiles fall
when the host is busy; `ScriptDuration / frames` does not, because it measures how long
our JavaScript ran rather than when it was allowed to run. Measured 0.55–0.69ms under 4x
throttling against a 3ms bound, and `LayoutDuration / frames` at 0.001ms against 0.5ms.
A regression that adds a per-frame allocation or forces a reflow moves both; a busy
container moves neither.

---

## Handoff at the Windows 3.1 merge

Not a decision — a marker, so the next session knows exactly where the boundary is.

`era/win31` merged to `main` via pull request #1. `claude/new-session-aej4gm`, carrying
phases 1–3, was already merged. `main` is the trunk and the next era branches off it.

Green at the merge: **137** — 11 invariant, 7 budget, 119 browser.

Two eras are built. Four remain, in this order and for these reasons:

1. **System 1** — fully sourced from Apple's shipped `StandardWDEF.a` listing, cross-checked
   against Executor. It also reuses the Windows 3.1 stipple assertion verbatim, since
   `notPatBic` and `GrayString` are the same construction (§7). Two flagged conflicts to
   resolve at build time, both already reasoned through in §12: System 1 had no
   application switching and no minimize, and it had no terminal.
2. **Mac OS 8** — the Platinum gap narrowed considerably once `macintosh-hig.pdf` arrived,
   because the OS 8 addendum defers window, scroll bar and text field specs to it by
   name. §7 records what that closed and what is still open.
3. **Tiger** — chrome geometry from the measured figures, since Apple published no window
   specification at all. The calibration argument is in §7 and must be restated in the
   skin's provenance, not assumed.
4. **Ledger** — last, deliberately. It is the era most hostile to the contract, and it is
   the only one that needs the render-budget governor built and `suspend()`/`resume()`
   made visible. If a premise that hostile drops into the same `Skin` manifest with only
   those additions, the contract is real. That is the test, and it is worth keeping until
   the end rather than softening by doing it early.

Nothing is half-finished at this boundary. The two open external items — `luna.msstyles`
and a pressed-button Windows 3.1 capture — are recorded in §13 with notes, and neither
blocks a skin.

## Phase 4, era/tiger — measurement

### 4.17 Five more figures were found, and they corrected §7 twice

**Call.** `ARCHITECTURE.md` §7's Tiger table is corrected: the first traffic light is
**9px** from the window's left edge, not 13px, and a light is **14px** including its
ring, not 12px. `tools/pdf-extract/measure-tiger-window.py` is fixed.

**Reasoning.** Both errors had one cause, and it was in the instrument rather than in
the reading. The script located the window's edges with *the first step greater than
30 in channel sum*, and an Aqua window sits on a soft drop shadow that ramps in
30-to-40-unit steps — so it stopped on the shadow, three pixels outside the window.
The real frame line is the **largest** step in the row by a factor of five: 217
against the shadow's 40. Measuring from it gives 9px, and Figures 13-3, 13-19 and
13-22 independently agree.

The 12px diameter is a different instrument failing differently: a saturation test
finds a light's coloured core and stops at its 1px dark ring — and cannot see a
*grey* light at all, which is why the disabled state had been recorded as
unmeasurable. Testing for "materially darker than this row runs at the bar's right
end" finds every state and gives 14px on 40+ instances.

**The unblock was the Luna caption-button lesson, applied again.** The mistake log
records: *before recording something as unresolvable pending an external file, check
whether another figure in the same source shows it.* Figure 13-3, "Title bar buttons
for standard windows", is **fifteen separate embedded bitmaps** rather than one, each
placed at exactly `px/pt = 1.000`. It is the Tiger analogue of Microsoft's specimen
sheet and it settled the traffic lights in one pass. Four more figures came with it:
13-19 (an inactive window), 13-22 (scroll bars and the resize control), 12-11 (a menu
with a dimmed item, a highlight and two separators) and 12-12 (the menu bar).

### 4.18 The title bar gradient is resolved rather than contested

**Call.** The active title bar ships as 21 measured neutral rows, `#F9F9F9` →
`#CACACA`, tagged `measured` rather than `contested`.

**Reasoning.** This looked like it was going to be Luna's caption gradient again.
Figures 13-2 and 13-19 read the bar with a consistent 4-to-9 unit **cool cast**, which
could plausibly have been Aqua Blue's real tint — and by the standard set in 3.7 and
3.11 that would have had to ship unresolved.

Three of Figure 13-3's fifteen specimens settle it. Cropped and compressed separately,
they give the same 23 rows to within one unit, and **every row is exactly neutral**
(R = G = B). A source carrying any tint cannot produce R = G = B on 23 rows in three
independent crops. The cast belongs to those two larger, busier bitmaps.

Worth recording because it is the opposite outcome to XP's: the rule is not "when
figures disagree, ship contested", it is "find the reading that explains the
disagreement". Here one existed.

### 4.19 The corner ships as a radius, and that is a decision

**Call.** `cornerTop: { kind: 'radius', px: 6 }`.

**Reasoning.** The measured arc profile is 4,3,2,1,1,0 — structurally the same object
as Luna's 5,3,2,1,1,0, which 3.15 made a `steps` union *because* no `border-radius`
reproduces it. The difference is that Tiger's arc is **antialiased** where Luna's is
hard 1-bit steps. A `clip-path` polygon would throw away the partial coverage, which
here is part of the artwork rather than an artefact of measuring it. A 6px radius
predicts 3.6, 2.0, 1.1, 0.6, 0.2, 0.0 against the measurement; the 1px excess at rows
1–2 is the antialiasing the measurement cannot exclude.

3.15 anticipated exactly this — "Tiger and Ledger can still say `radius` honestly" —
so this is the union being used as designed rather than a weakening of it.

### 4.20 Three light states have no source, and say so rather than being invented

**Call.** `rest` and `disabled` are measured artwork. `hover` and `active` are
`unverified` with notes; `focus` uses the measured Aqua ring.

**Reasoning.** Figure 13-3 has fifteen states and **not one shows a glyph** — no ×, no
−, no +. Searching the HIG for "rollover", "pointer is over" and "symbols appear"
returns nothing about title bar buttons. `CLAUDE.md` requires all five states on every
interactive element, so all five ship; the two with no source are tagged rather than
presented as measurements, which is the same treatment Luna's `disabled` caption
buttons got in 4.2.

Focus is deliberately *not* a glyph trigger, and that separation is the point: focus
has a source (Figure 7-1, plus Apple's prose at p99) and the other two do not, so
they are kept visibly distinct. It also matches the era — Apple documents that in
default keyboard access mode "focus moves only between fields that receive keyboard
input", so a Tiger light showing its glyph merely because the window was activated
would be wrong twice over.

### 4.21 The Dock's fill is unverified, with the cause named

**Call.** `TIGER.dock.fill` and `height` are tagged `unverified`.

**Reasoning.** Figure 10-1 *is* the Dock and it does confirm §7's correction — a flat
2D shelf, not the 3D glass shelf, which is 10.5 Leopard. What it cannot give is the
shelf itself: the crop places the Dock on the document's white page and Tiger's shelf
is translucent, so it composited against the paper. The median above and below the
icons is `#FEFEFE`, which is the page. Only the 1px divider (`#DFDFDF`), the 1px
edging (`#DEDEDE`) and the 47px icon survive — and that icon, against Apple's
documented 48px, is what calibrates the figure as 1:1.

A derived value ships so the era has a Dock, and it is labelled as derived. A 1:1
Tiger desktop screenshot resolves it in one shot.

### 4.22 Aqua's pinstripe is real, and a lossless PNG proves it

**Call.** Menus render a 4px-period pinstripe — 2px `#F3F3F3`, 2px `#EFEFEF` — rather
than a flat fill.

**Reasoning.** A 4-unit alternation in a JPEG is exactly the kind of thing that should
be dismissed as compression noise, and dismissing it is what every flat-fill
recreation effectively does. Two things say otherwise. JPEG works in 8×8 blocks, so it
produces an 8px period and a spread of values; this is a **2-row** period with
**exactly two** distinct greys over a menu's whole height. And Figure 7-1 is a
**lossless PNG** — the only one in the book — whose window body alternates `#E1E3E7` /
`#E4E6EA` on the identical 2-row period. The lossless file is what licenses reading
the construction out of the lossy one.

## Phase 4, era/tiger — the build

### 4.23 Shell regions, and the window manager still knows nothing

**Call.** New `ShellRegion` and `ShellRegionHost` in `src/shell/shell.ts`, plus
`SkinManifest.regions`. The shell builds each region's element, positions it at its
edge, subtracts the reserving ones from the work area, and routes minimize targets.

**Reasoning.** This is `ARCHITECTURE.md` §5's `ShellLayout` being implemented rather
than invented — the doc specified `regions[]` with `edge`, `kind`, `thickness` and
`reservesSpace` from the start, and nothing had needed it: XP's phase-3 shell has no
taskbar and Windows 3.1 deliberately has none at all. Tiger is the first era whose
shell is two regions, so it is the first to exercise the claim that the WM learns only
"the work area is 22px shorter at the top and 68px at the bottom".

Regions live **inside** the desktop element rather than beside it, so they sit inside
the display transform: System 1's menu bar will scale with its integer-scaled 512×342
viewport instead of floating beside it at device scale.

**Flagged to the repo owner immediately**, per §11 — the other two parallel sessions
cannot see it until it merges, and both System 1 and Mac OS 8 need it for their menu
bars.

### 4.24 The window manager asks where a minimized window should go

**Call.** New `WindowManager.setMinimizeTarget(fn)`. `ShellRegion.minimizeTarget` is
consulted per window at minimize time.

**Reasoning.** §2 already requires "XP shrinks toward the taskbar button, Tiger genies
to the Dock", and neither destination is knowable by the window manager: only the Dock
knows where a given window's tile ended up, and a tile moves as windows open and
close. The WM had a `defaultMinimizeTarget()` returning the work area's bottom-left
corner, which was a stand-in nobody had replaced.

Asked at minimize time rather than cached, and era-neutral by construction — the WM
never learns *why* the rect is where it is, exactly as it never learns why the work
area is shorter. XP's taskbar will use the identical hook.

### 4.25 The menu controller notifies on open and close

**Call.** New `MenuController.subscribe(fn: (open: boolean) => void)`.

**Reasoning.** A menu bar highlights the title whose menu is open, and the menu can
close by six routes the bar never sees: Escape, activating an item, a click on the
desktop, a click on a window, losing the capture layer, or another menu opening.
Without a notification the highlight goes stale after every one of them, and the
symptom is a title that looks open when nothing is.

Era-neutral: the Windows eras render their menu bar inside a window and have the
identical problem. This is the third core change and the smallest.

### 4.26 Generated properties move to the shell root, because menus live there

**Call.** `skin.generatedProperties()` is written on `#chronos-root` rather than on
`.desktop`.

**Reasoning.** Menus, the switcher and every other overlay are hosted on the **root**,
outside the desktop element — and custom properties inherit, so writing them on the
desktop leaves every overlay with undefined variables. The failure is silent and
total: Tiger's first menu rendered with no background, no border colour, the browser's
default serif at 16px, a 0px separator and unstyled items.

Windows 3.1 and XP masked it by *also* declaring their variables in a `:root` block,
so the desktop values were an override and `:root` was the fallback. That works and it
means every measured value exists twice in the tree, which is precisely what the
generated-properties mechanism was built to prevent. Writing them once, where
everything inherits from, removes the need for the duplicate rather than adding a
third copy.

### 4.27 The opening event must not reach the layer it just created

**Call.** The menu bar's `pointerdown` and `keydown` handlers both call
`stopPropagation()`.

**Reasoning.** This is DECISIONS 1.9's right-click flash, twice more, in a new shape.
The dispatcher listens on the root for pointer events and on `window` for keys, both
in the bubble phase. A press on a menu bar title opens a menu, which pushes a capture
layer — and then the *same* pointerdown continues bubbling, reaches that new layer,
lands outside the menu box and dismisses it. The menu opened and closed inside one
event.

The keyboard case is worse and was found by a hung test: Enter opens the menu and
highlights its first entry, then the same keydown reaches the layer and is read as
"activate the highlighted item", so the menu fires its first command instead of
opening. A menu bar that cannot be used from the keyboard would have failed
`CLAUDE.md`'s keyboard rule while looking correct in every screenshot.

Stopping the opening event is also what makes the *release* safe: `sawPointerDown`
stays false, so the controller correctly ignores the matching pointerup — the same
mechanism 1.9 introduced, now load-bearing in the other direction.

### 4.28 The traffic lights' insets are measured from the outer edge, and the CSS says so

**Call.** `top`/`left` on `.tg-lights` subtract one hairline from the measured inset.

**Reasoning.** Apple's insets are measured from the window's **outer** edge — the frame
line's own row and column — and the element is positioned inside the frame, so each
inset loses one border width. The first render put every light 1px right and 1px low,
which is a silent error in the most-looked-at ornament in the era and would have
passed any test written against the rendered output rather than against the source.

The subtraction is written as `calc(var(--tg-light-inset-left) - var(--tg-hairline))`
rather than as a literal `8px`, so the measurement stays the measurement and the frame
width stays a single value.

### 4.29 The harness status strip adds to the reservation instead of replacing it

**Call.** New `Shell.addReservedEdges()`. `main.ts` calls it instead of writing
`display.setReservedEdges` directly.

**Reasoning.** The status strip claimed the bottom 24px by calling the display
directly, which silently discarded whatever the skin's regions had reserved — Tiger's
menu bar and Dock both vanished from the work area. The shell now owns the total, and
region elements are offset by the extra claim so the Dock lands *above* the strip
rather than underneath it. Without that second half the work area is right and the
pixels are wrong, which is the worst of both.

The strip also gained `data-edge="bottom"`. It already carried
`data-shell-region="status"`, and that attribute now has structural meaning in
`base.css` — without an edge it landed at the origin with a region's z-index and
covered the menu bar.

### 4.30 DejaVu Sans is a bad Tahoma substitute and a good Lucida Grande one

**Call.** DejaVu Sans ships for Lucida Grande, subset to 10.3KB, regular weight only.

**Reasoning.** §7 named the face and the repo owner confirmed it is not to be
revisited: Luxi Sans is the obvious relative, by the same designers, and its licence
**prohibits modification**, which blocks subsetting. What was missing was
`CLAUDE.md`'s other half — the rendered comparison at the sizes the era uses.

Tiger gets a better metric target than XP did. XP's Tahoma row was ranked against
advance widths parsed from Wine's purpose-built substitute; Tiger's figures are 1:1,
so they contain **Mac OS X's own rasterisation** of known strings at 13px. Measured
ink width, first inked column to last, on both sides: `Back` +3.4%, `Enclosing
Folder` −3.6%, `Recent Folders` −2.1%, `Main but not Key` −2.9%, `Scroll Bars` +6.3%.

That inverts 3.3 without contradicting it. DejaVu was rejected for XP's system font at
+16.8% *because it is a Verdana substitute and Verdana is the wider face*. Lucida
Grande is itself wide, so the same excess is what fits here.

**The window title's weight was measured, not assumed.** Apple documents no
window-title font. Regular lands inside the ±6% band; bold is 18–22% out. One trap on
the way, recorded because it nearly produced the wrong answer: the first pass measured
`Scroll Bars` at 78px and concluded *bold*, because the ink span it found began at the
**proxy icon** sitting left of the title rather than at the first letter. Splitting the
span into runs separated by more than two blank columns gives the text 63px.

Bold is deferred — the two bold roles are alert message text and the About window
title, and neither exists in phase 4. The precedent is 3.19, and the consequence is
stated in the skin: nothing may ask for `font-weight: bold` until the bold subset
exists, or the browser synthesises one by smearing the regular outlines. A fidelity
test asserts the chrome stays at 400.

### 4.31 Tiger is the first era that does not want the integer-scaled viewport

**Call.** `viewport: { mode: 'native' }`, and none of the pixel-crisp machinery.

**Reasoning.** Apple documents it: *"All user-visible text in your application should
be anti-aliased"* (HIG p120). Tiger is the first era in the project where soft type is
the era's own behaviour rather than a defect, so there is no pixel grid to preserve
and nothing to gain from a fixed logical resolution. The §7 rules about integer font
sizes and `scale × devicePixelRatio` exist for the bitmap eras and are noted in the
skin as not applying here.

The type rule that *does* carry over is the one about points: `13pt` in CSS is
17.33px, so the stylesheet writes `13px`. Mac OS X's 72 DPI makes the conversion the
identity, which is the inverse of the Windows trap rather than an exception to it.
---

## Phase 4, era/system1 — measurement

### 4.32 The HIG's two-tone bitmaps are 1:1 by construction, so this era needs no calibration argument

**Call.** `tools/pdf-extract/extract-mac-figures.py` pulls eight image XObjects out of
`macintosh-hig.pdf` and verifies each one. Five of the eight contain exactly `#000000`
and `#FFFFFF`; the other three contain those plus **one** flat illustrator tone
(`#F1F3F2` on p204, `#BEBEBE` on p077) under 5% coverage, reported with its bounding
box. Anything else fails the extraction rather than being measured.

**Reasoning.** XP's window figure needed an argument for why its bitmap is 1:1 (page
placement at 1.38 px/pt, which is not 96/72) and Tiger's needed a calibration against
three documented push-button widths. This era needs neither, and the reason is stronger
than either of those arguments: **a two-colour bitmap cannot have been resampled.** Any
scale factor other than 1 blends edge pixels and introduces a third value. There is no
third value. One of the figures is 512×342 — precisely the framebuffer of a Macintosh
128K/512K/Plus — so it is not merely unresampled, it is a whole screen at native size.

The single-extra-tone allowance is the part worth defending, because it looks like a
loosened gate. It is not: resampling produces *dozens* of blend values spread along
every edge, while an illustrator's callout box produces one flat tone in one rectangle.
The script distinguishes them by count and by coverage, prints the bbox so the tone can
be identified by eye, and p077 additionally gets a region-scoped check over
`(0, 0, 512, 20)` so the menu-bar band it is used for is proven two-tone on its own.

### 4.33 Five values in §7's System 1 table are corrected by measurement

**Call.** `src/skins/system1/metrics.ts` ships measured values where they disagree with
the `StandardWDEF.a` + Executor table §7 carried before the build. Every number is
reproduced by `tools/pdf-extract/measure-mac-system1.py`, which prints the run-length
profiles rather than asserting silently.

1. **Racing stripes start at `left+2`, not `left+1`.** Row 4 of the 512×342 screen runs
   `(0,0) (2,7) (9,19) (21,96) (242,333) (335,335)`: frame line at 0, then ink from 2.
2. **The close box is 9px in from the frame line, not 10px.** The gaps at 8 and 20 in
   that same profile are its 1px paper surround knocking the stripes out.
3. **The size box is 16×16, not 14×14.** The icon inside it is 11×11 at inset 3/3. The
   14 was the icon's bounding box read as the box, and 16 is what makes the corner line
   up with the 16px scroll bars.
4. **The scroll bar trough is 25%, not 50%.** Two distinct QuickDraw patterns: the
   desktop is the 50% checkerboard (measured 50.0%, all ink on one parity), the trough
   is `ltGray` on a 4×2 cell (measured 25.2%, ink at cell offsets `(0,0)` and `(2,1)`).
5. **Both shadow corners are notched, not only the top-right.** The shadow is the
   frame's right column and bottom row translated (+1, +1), which leaves a hole at each
   end of the L.

**Reasoning.** The prior table was labelled `confirmed` on the strength of two sources
agreeing — Apple's shipped assembly listing and a clean-room reimplementation of it. That
is a real corroboration and it was still wrong in five places, because both sources
describe the *drawing code*, and a reader reconstructing geometry from drawing code fills
gaps with plausible arithmetic. `left+1` is what you write down if you assume the stripes
abut the frame. 14×14 is what you write down if you measure the icon. The figures are the
output of that code actually running, which is the thing being reproduced.

The fifth correction paid for itself immediately: `box-shadow: 1px 1px 0 0` is exactly
"the edges translated (+1, +1)", so it produces both notches for free. A `border-right`
plus `border-bottom` would have produced neither, and the version of the frame that used
borders had square corners nobody would have questioned.

### 4.34 One measurement did not resolve, and it ships as recorded variance

**Call.** `border`'s provenance note states the disagreement in full: the two genuine
screen dumps put a 1px notch at the bottom-left, the two book-cropped 1-bit figures
differ from each other (0px and 2px), and the 512×342 screen cannot settle it because the
desktop checkerboard's parity paints the same pixel. The dumps are what ships.

**Reasoning.** Three figures and a fourth that is structurally incapable of answering is
not a measurement, it is a majority vote. Writing `measured` with no note would claim a
precision that does not exist, and picking the value that matched the code already written
would be the failure mode this project exists to avoid. §7's figure rules already say a
JPEG-derived hex is `measured`, never `documented`; this is the same distinction applied
to a geometry value whose sources conflict. The note is the deliverable — a later session
with `luna.msstyles`-grade material for the Mac can close it in one pass, and until then
nobody re-derives the disagreement from scratch.

### 4.35 Chicago is ChiKareGo2, with three documented rejections and one unconfirmed licence

**Call.** `src/skins/system1/fonts/chicago-sub.woff2`, subset to `0020-00FF`. The target
is the measured cell rather than a name: 16px cell, 9px cap height, 3px descender, 14
distinct advances, 13 ink widths, at `font-size: 16px` / `line-height: 15px`.
`tools/font-compare/system1-chicago.mjs` renders all four candidates at 16px magnified 4×
into `docs/fonts/system1-font-chicago.png` and records each verdict.

**Reasoning.** §7's rule is that an unresolved font blocks the chrome that depends on it,
and the rule specifically requires naming the substitute *and* showing a rendered
comparison at the sizes the era uses — not choosing on metrics alone. Three candidates
were rejected on the render: the full rejections and per-candidate numbers are in
`docs/eras/system1.md` rather than here, because they are era findings.

The 1024 upm / 64-units-per-pixel requirement is the non-obvious constraint. A bitmap face
whose em square is not a whole multiple of the pixel grid puts every glyph edge on a
fraction at *some* size, and this era's whole viewport strategy exists to keep the 1px
checkerboard from averaging into grey. A font that fails it fails the same way the
checkerboard does.

One item is open and it is a licence question, not a design one: ChiKareGo2 ships under a
free-use grant whose exact variant could not be confirmed from inside the sandbox — every
primary source for it is 403 at the proxy. It needs one fetch from outside. Recorded in
`docs/eras/system1.md` and in §13 rather than resolved by assumption, because "probably CC"
is not an attribution and `test/budget.test.js` requires every shipped font to be
attributable.

### 4.36 `notPatBic` reuses Windows 3.1's knockout construction unchanged

**Call.** `measureParity` moved out of `test/browser/win31-fidelity.spec.ts` into
`test/browser/stipple.ts`, and both eras' suites import it. The System 1 assertion is the
same numbers against the same instrument: parity share ≥0.95 on a disabled label, <0.7 on
an enabled one.

**Reasoning.** §7 records the stipple under its own heading precisely so it is built once,
and the brief said to use Windows 3.1's construction unchanged. Copying the helper into a
second spec would have satisfied that in letter and broken it in fact: two copies drift,
and the one that drifts is the one nobody looks at. The extraction is the whole change —
no CSS was written for this. Apple's `notPatBic` and Microsoft's `GrayString` render from
the same rules in `skin.css`'s knockout overlay, eight years and two vendors apart, which
is the claim §7 makes and now the code makes too.

The proof on Apple's own bitmap: the File menu's disabled `Revert` is 77 ink pixels with
**all 77 on one `(x+y)` parity**; `Save As…` beside it is 179 split 91/88.

---

## Phase 4, era/system1 — the chrome

### 4.37 `maximizeSemantics: 'none'` is a core addition, because an absent button is not a refused command

**Call.** `MaximizeSemantics` in `src/core/wm/types.ts` gains a third member, `'none'`,
and `WindowManager.toggleMaximize` returns immediately when the active chrome declares it.
`Shell` gates its Restore and Maximize menu items on `wm.metrics.maximizeSemantics !==
'none'`.

**Reasoning.** Reported as a contract bug under §11 the moment it surfaced. System 1's
`documentProc` has no zoom box at all — zoom arrives with `zoomDocProc` in 1987 — so the
skin emits no button. That is necessary and not sufficient: `toggleMaximize` is reachable
from the keymap, from the window chrome menu, and from any app that calls it, and every one
of those paths would have produced a maximized System 1 window with no way back. A skin
cannot fix that by omitting DOM.

This is exactly the shape §7's "structural rules do not belong to a skin" heading
describes, one level up: the question to ask is *would a skin that omitted this be wrong*,
and here the honest answer is that a skin **cannot** express it. The declaration belongs in
`ChromeMetrics` next to `minimizeStyle`, which already worked this way. `'fill'` and
`'zoom'` are unchanged, so XP and Win 3.1 are untouched.

### 4.38 Menu accelerators come from the active skin's keymap, not from literals in the shell

**Call.** `Shell.accelFor(command)` reads the active skin's keymap and returns the chord
bound to that command. The six hardcoded `accel: 'Alt+F7'`-style literals in the window
chrome menu are gone.

**Reasoning.** Those literals were Windows chords written into shared code, and they were
already a latent lie — the menu said `Alt+F7` in every era while only one era bound it. In
System 1 they are a visible one: the 1984 keyboard has no Control, no Option, no Escape, no
arrows and no function keys, so `Alt+F7` is not merely wrong for the era, it names keys that
do not physically exist. Deriving the label from the binding means the menu cannot disagree
with the keyboard, in any era, and a skin that binds nothing shows nothing rather than
showing a fiction. `exactOptionalPropertyTypes` forbids `accel: undefined`, hence the
spread helper rather than an assignment.

Era-specific consequence, in the skin where it belongs: `System1MenuRenderer.commandChord`
returns a key only for a single-`Meta` chord and renders nothing for anything else. The
drawn `⌘` is a measured 9×9 bitmap, not a character.

### 4.39 Menus scale on the shell root, and the re-parenting fix was the wrong one

**Call.** `src/shell/display.ts` publishes `--display-scale` on the shell root.
`src/shell/base.css` gives `[data-menu]` `transform: scale(var(--display-scale))` with
origin `0 0`. Menus stay parented to the root, where Tiger put them.

**Reasoning.** A menu rendered at logical pixels inside an integer-scaled viewport comes out
at 1/scale — half size at 2×. The first fix re-parented menus into `.desktop` so they
inherited the scale transform, and it was wrong for a reason worth recording: `.desktop` is
inside the scaled, clipped viewport, so a menu that overhangs the screen edge gets clipped by
it, and a menu opened from a shell region that lives *outside* the viewport would have been
positioned in the wrong coordinate space entirely. Scaling in place keeps one parent and one
coordinate system.

`MenuController.position()` was also edited during the first attempt, to divide by the scale.
That is reverted in full — the file is byte-identical to main. Positioning stays in root
coordinates and the transform handles the rest, which is the only version that composes with
Tiger's `ShellRegion` without either session having to know about the other.

Both sessions independently moved generated properties to the root — 4.26 is Tiger's
account and owns the decision; this branch reached it from the same symptom and the two
diffs merged textually. What is System 1's own is the consequence for the skin: `skin.css`
has **no** `:root` block. The properties arrive from `system1GeneratedProperties()` at
runtime, and a `:root` fallback would have masked exactly the bug being fixed. There is a
comment in the file saying so, because the absence otherwise reads as an omission.

The two mechanisms are not redundant, and it is worth being precise about why, because at a
glance the region transform looks like it should have covered the menus too. A region is a
child of `.desktop` and inherits the display transform. A menu is a child of the root and
cannot. Same scale factor, two routes to it, decided by parentage — and 4.42's menu bar is
the first surface that exercises both at once: the bar is scaled by inheritance, the menu it
opens is scaled by this rule.

### 4.40 The two-tones test asserts no mid grey, because Chromium's LCD antialiasing is not defeatable

**Call.** `test/browser/system1-fidelity.spec.ts` asserts that **no pixel anywhere in the
rendered screen is a mid grey** — every pixel has luma <40 or >208 — and that the remaining
edge fringe is under 2% of pixels. It does not assert that exactly two colours exist.

**Reasoning.** The first version asserted two colours and failed on 632 pixels of one window
title. Three fixes narrowed the cause and none of them removed it: integer `Math.floor`
centring (which was a real bug and is kept — see 4.41), moving the white behind the string
into the title bar as an erase rectangle, and a `clip-path`ped `::before`. What is left is
Chromium's LCD subpixel text path, which tints the edge pixels of glyphs that are already
exactly on the pixel grid. `-webkit-font-smoothing: antialiased`, `-webkit-font-smoothing:
none`, `font-smooth: never` and `text-rendering: optimizeSpeed` are all no-ops on it.

So the two-colour claim is false in this renderer and no amount of CSS makes it true. The
temptation is to keep the assertion and loosen the threshold until it passes, which produces
a test that asserts nothing. The claim that *is* both true and load-bearing is the one the
whole era rests on: **there is no grey in a 1-bit UI.** A flat grey fill lands at luma ~128
and fails. A 50% checkerboard sampled at a fractional scale averages to ~128 and fails —
which is the exact failure the integer viewport exists to prevent, so the test now guards the
thing it was always trying to guard. The 2% fringe bound is separate and is what stops a
regression from turning edge tinting into a look. Both numbers are asserted; neither was
chosen to make a red test green.

### 4.41 The title is centred by the renderer, with truncating division

**Call.** `System1Chrome.centreTitle` computes `Math.floor((bar.clientWidth - width) / 2)`
and writes it as `left`, publishing the box to CSS as `--s1-title-x` / `--s1-title-w` so the
erase rectangle and the string are placed by one calculation. Called on title, rect and focus
changes only.

**Reasoning.** CSS centring distributes free space without rounding, so a title whose width
has the opposite parity to its bar lands on a half pixel — and a half-pixel glyph edge in a
1-bit era is the one thing the integer-scaled viewport exists to prevent. `Math.floor` rather
than `Math.round` because that is what the era did: `StandardWDEF` positions the title with
`(left + right - titleWidth) / 2` in integer arithmetic, which truncates.

Reading layout here is deliberate and bounded. `core/wm/drag.ts` remains the only place a
layout read is forbidden outright; this runs on discrete state changes and never inside a
gesture loop. The alternative — measuring text width in JS — would have needed a font metrics
table in the skin, which is a second source of truth for something the browser already knows.

### 4.42 What System 1 deliberately does not ship in this pass

**Call.** No menu bar, and no scroll bars. Both are measured, recorded in
`metrics.ts` with provenance, and asserted by `measure-mac-system1.py`. Neither is rendered.

**Reasoning.** The menu bar is System 1's defining chrome and it is the one piece that
*must* be built on Tiger's `ShellRegion` / `SkinManifest.regions` rather than beside it.
That landed on `claude/chronos-tiger-phase-4-tm4o09` and is not in `main` yet, and building
a second mechanism for the same contract to avoid waiting is worse than waiting — the brief
says so and it is right. The measurements are done, so it is a rendering pass and not a
research one once the merge happens.

Scroll bars are phase 5 for every era, not a System 1 exception, and are recorded here only
because the trough pattern finding (4.33) reads as if a scroll bar exists. The 25%/50%
distinction is in `metrics.ts` and in the measurement script now, so phase 5 inherits it
rather than rediscovering it.

Stating both here rather than leaving them as gaps: a missing feature that is written down
is a plan, and a missing feature that is not is a bug nobody has found yet.

---

## Phase 4, era/system1 — the menu bar

### 4.43 The bar is built on Tiger's `ShellRegion`, and it is the era's only region

**Call.** `src/skins/system1/shell.ts` declares one region: `edge: 'top'`,
`kind: 'menubar'`, `thickness: 20`, `reservesSpace: true`, and **no** `minimizeTarget`.
No Dock, no taskbar, no window list.

**Reasoning.** Waiting for `ShellRegion` to reach main rather than building an
equivalent was the right call and cost nothing: the region API fit without a single
change to it. What it did surface is that a region's *needs* were one short — see 4.44.

The absences are the era rather than a reduced scope. There is no multitasking to list,
so a Window menu would be a Mac OS 8 idea three eras early; there is no minimize, so
there is nothing for a Dock to receive. `minimizeStyle: 'none'` means the window
manager never calls the minimize-target provider, and the region declaring one anyway
would be dead code that reads as a feature.

### 4.44 A region host needs `accelFor`, or its menus write chords as literals

**Call.** `ShellRegionHost` gains `accelFor(command)`, wired to `Shell.accelFor`.

**Reasoning.** Reported under §11. 4.38 removed the hardcoded `Alt+F7`-style
accelerators from the shell's own chrome menu; the region host was built without the
equivalent, so Tiger's menu bar carries `accel: 'Meta+N'` and `accel: 'Meta+W'` as
literals. That is right for Tiger and would have been wrong here the moment the chord
moved — which it then did, in 4.46. A region's menus are the most visible place in the
product where a label can disagree with the keyboard, so the accessor belongs there.
Four lines, additive, and Tiger's literals can become calls whenever that branch wants
them to.

### 4.45 The title box and the title stride are both measured and do not reconcile

**Call.** `padding: 0 10px` and `margin-right: -5px` on a title, reproducing the box
(string + 10px either side) and the stride (string + 15px) exactly. The 5px overlap
they imply is recorded, not resolved.

**Reasoning.** Rects that partition a menu bar cannot overlap, so one of the two must be
wrong — and neither is. Both come off the figures cleanly: the box from the two figures
that have a menu pulled down (41px around a 21px string, 65px around a 44px one), the
stride from the one figure whose whole bar is unobstructed, exact on four of its five
transitions and off by 2px on the fifth from side bearings.

Every attempt to solve it produced a half pixel. Adjacent boxes with the highlight equal
to the box gives a margin of 7.5px from two independent directions. A highlight outset
by a constant gives 5px on one figure and 6px on the other. A 1984 Toolbox did not use
either.

No figure can settle it, because only one title is ever highlighted, and the Menu
Manager's own title-rect arithmetic is not in `docs/sources/`. So both ship exactly and
the overlap is derived — it is unobservable, since the later title wins the shared
pixels for hit-testing. Splitting the difference would have made both visible
measurements wrong in order to hide one invisible inconsistency, which is the same call
4.34 made on the shadow corner and 4.19's predecessors made before it.

### 4.46 `shell.newWindow` moves to `Meta+O`, because ⌘N made a folder

**Call.** System 1's keymap binds `Meta+O`, and the File menu's item reads `Open`.

**Reasoning.** ⌘O is the chord that produced a window in 1984 — you opened a disk or a
folder. ⌘N was New Folder, which makes no window and which Chronos has nothing to make.
The old binding was harmless while nothing displayed it and became a visible lie the
moment the menu bar existed, which is 4.38's point arriving from the other direction:
`accelFor` guarantees the label matches the binding, so a wrong binding now prints
itself.

Absent from the File menu for the same reason: Get Info, Duplicate, Page Setup and
Eject. Listing them means either showing ⌘I, ⌘D and ⌘E, which nothing binds, or
stripping the chords the era gave them. Both misrepresent the menu; omission does not.

The one relaxation, stated: the era's Open required a selection, and the harness has no
icon layer until phase 5, so here it is unconditional.

### 4.47 A disabled item may carry its historical accelerator; an enabled one may not

**Call.** The Edit menu ships Undo, Cut, Copy, Paste and Clear — all disabled, all
carrying ⌘Z ⌘X ⌘C ⌘V. A test asserts that every **enabled** item's accelerator equals
`Shell.accelFor(command)`.

**Reasoning.** The rule 4.38 established is that a label must not advertise a chord the
keymap does not bind. A disabled item advertises nothing — it is the era telling you
what the menu would offer if there were something to edit — so the historical chord is
information rather than a promise. Drawing the line at `enabled` makes it testable
instead of a matter of judgement, and it is what lets the era keep the four chords it
made famous without binding any of them to a harness that has no clipboard.

### 4.48 Chrome outside the desktop needs its own inset, separate from a region's reservation

**Call.** `Display.setHostInsets(edges)` in CSS pixels, applied only in `fixed` mode.
`Shell.applyReservedEdges` feeds it `extraReserved` while `setReservedEdges` keeps
receiving the sum.

**Reasoning.** Reported under §11. Found by this era's one-bit gate, which started
failing on the merge with main and passed on the commit before it — diagnosed by
running it there rather than by adjusting the number, as 4.16 requires.

The cause is that "reserved" was one number doing two jobs. A shell region is a child of
the desktop, so it is inside the display transform and its claim is in logical era
pixels: it shrinks the work area and must not move the desktop, which is already around
it. The harness status strip is anchored to the host in CSS pixels and is *outside* the
desktop, so on top of shrinking the work area it has to move the desktop clear of
itself. Summing them cannot express either — and before Tiger the strip was `static` and
painted underneath the desktop, so the collision only appeared when it was correctly
positioned at the bottom.

Measured: three device rows of antialiased status-strip text bleeding into a 512×342
desktop and reading as grey in an era that has none. Windows 3.1 has the same viewport
mode and the same latent overlap; Tiger is `native`, where the desktop is the host area
and `workArea()` already handles it, which is why the insets apply in `fixed` mode only.

### 4.49 A substitute face's coverage is part of verifying it

**Call.** A test runs `document.fonts.check('16px "S1 Chicago"', …)` over every string
the skin renders. The Apple menu says `About the Finder...` with three periods.

**Reasoning.** ChiKareGo2 has no U+2026 and no U+2014. 4.35's comparison could not have
found that: it rendered the target strings and measured their shapes and widths, so a
character none of them contained was invisible to it. Coverage is a different question
from fidelity and needs its own instrument.

The failure is silent, which is what makes it worth a test. A missing glyph falls back to
the browser's default face, whose fractional advance takes every glyph after it in the
run off the pixel grid — the text still appears, it is just no longer 1-bit. Measured on
the harness's own title: `Files — Macintosh HD:` is 311.28px wide, `Files - Macintosh HD:`
is 306px.

The second instance was raised rather than changed quietly, and raising it was what
found the real answer: `src/main.ts` built every window title with an em dash, which
looked like harness text that only this era had trouble with. It is not. **No** era in
this project used U+2014 in a window title — the classic Mac, Windows 3.1 and XP all
used " - " or nothing — so the em dash was wrong in all six and its removal is a harness
correction, not five eras narrowed to suit one. It happens to remove this era's last
fallback.

The useful part is the shape of the mistake: "this is shared, so changing it is
narrowing" was a claim about *ownership* standing in for a claim about *correctness*.
Ownership decides who changes it; whether every era wanted the character decides whether
it should change at all, and that question had not been asked.

### 4.50 Tiger's menu bar reads its accelerators from the keymap, and one of them was wrong

**Call.** `accelFrom(api, command)` is exported from `src/shell/shell.ts` beside
`ShellRegionHost`. Tiger's five literal accelerators become calls; System 1's local copy
of the helper is deleted in favour of it. `Force Quit…` loses its accelerator.

**Reasoning.** 4.44 added `ShellRegionHost.accelFor` and left Tiger's bar on the literals
it already had, because they were correct for Tiger. Correct-today is not the property
the accessor exists to provide: four of those five strings were right only for as long
as nobody moved a binding, which 4.46 then did in the era next door.

The fifth was already wrong. `Force Quit… ⌘⌥Esc` is an **enabled** item, and by 4.47's
split an enabled item's accelerator must come from the keymap. It has no `command` at
all — it calls `wm.close(id, { force: true })` directly, because the vocabulary has no
force-close and `commands.ts` says in as many words that it lists only what is
implemented and bound. So there was nothing to look up, and the chord it advertised was
bound to nothing and is intercepted by the host OS before a page could ever see it. It
now shows no accelerator, which is the honest state; giving it a command and a binding
would print one again with no further change here.

`Zoom` gains a call that resolves to nothing, and that is the point of routing it: Tiger
binds no chord for `window.toggleMaximize`, so the blank is now derived rather than an
omission that happened to look the same.

The helper moved out of the skin for the reason the stipple instrument did. Written per
skin it is one more copy to drift, and what it encodes is not era knowledge — it is that
`exactOptionalPropertyTypes` forbids `accel: undefined`, so an unbound command has to
contribute no key at all. That is the mechanism by which a skin binding nothing shows
nothing, and it should have exactly one implementation.

A test in Tiger's suite now asserts the split, mirroring System 1's. Both eras' bars are
held to one rule instead of one era's suite happening to check it.

Mac OS 8's bar arrived on main mid-change already reading `accelFor` — and with its own
third copy of the same four-line helper, which is the duplication this entry is about
arriving independently in a third era. It points at the shared one too. Three copies of
a rule is how the rule stops being one.
