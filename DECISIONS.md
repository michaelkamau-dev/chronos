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
