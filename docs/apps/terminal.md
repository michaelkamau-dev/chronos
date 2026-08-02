# Terminal — phase 5

Branch `app/terminal`. Base: `main` at `fb6e189` plus the Files app-layer merge.

**Verified:** `npm test` — 12 invariant, 7 budget, **322 browser**. The browser suite was
295 with Files merged, so this adds 27 and changes none. The perf gate is unmoved:
`scriptPerFrame` 0.814ms against a 3ms bound, `longTasks=0`, `layoutPerFrame=0.002ms`,
inside the 0.27–0.94ms band every previous run reported. Rendered and looked at in all
six eras — live, suspended, and with a dialog open.

---

## 1. The central design problem: one implementation, three shells

`dir C:\DOCS`, `ls /Users/chronos` and `ls HD:Documents` are the same code. Every
command has a `CommandId` and the handler table is keyed by it; the *word* is looked up
per shell, and the shell is chosen by **`PathCodec.separator`** — the one era-shaped
fact an app is given.

| separator | shell | title | prompt | switches | notes |
|---|---|---|---|---|---|
| `\` | DOS | MS-DOS Prompt | `C:\DOCS>` | `/s` `/w` `/f` | `dir` is long by default, folders first; `cd` alone prints |
| `/` | Unix | Terminal | `/Users/chronos $` | `-r` `-l` `-a` | `ls` is short by default, plain alphabetical; `cd` alone goes home |
| `:` | Unix, MPW wrapper | MPW Shell | `Macintosh HD:Documents> ` | `-r` `-l` `-a` | same vocabulary, own title, `###` in front of every diagnostic |

**The separator is not a proxy for the era.** The backslash and the DOS command set are
the same artefact: CP/M used `/` for switches, so MS-DOS 2.0 put the directory separator
on `\`, and `dir`/`type`/`del`/`copy` came down that line. The slash and `ls`/`cat`/`rm`
arrived together from Unix. A colon is the classic Mac, whose shell §12 settles as MPW —
so it takes the Unix vocabulary with its own path syntax, which is exactly the case the
brief names.

The table is keyed rather than branched, and there is no era identifier anywhere in
`src/apps/terminal/` — `test/invariants.test.js` enforces that mechanically. **If an era
ever arrives whose paths and whose commands disagree about their ancestry, that is the
point at which `PathCodec` needs to carry a dialect outright**, and it would be a
contract change to raise rather than take.

### The full command set

| Job | DOS | Unix / MPW |
|---|---|---|
| list a folder | `dir [/w] [path]` | `ls [-l] [path]` |
| change folder | `cd` / `chdir` | `cd` |
| show the folder | *(bare `cd`)* | `pwd` |
| print a text file | `type` | `cat` |
| create a folder | `md` / `mkdir` | `mkdir` |
| delete permanently | `del` / `erase` / `rd` / `rmdir` `[/s]` | `rm [-r]` |
| copy | `copy [/s]` | `cp [-r]` |
| move or rename | `move` / `ren` / `rename` | `mv` |
| print arguments | `echo` | `echo` |
| create or touch a file | `touch` | `touch` |
| search names | `find <pattern> [path]` | `find <pattern> [path]` |
| draw the tree | `tree [/f]` | `tree` |
| open a window on an item | `start` | `open` |
| clear the screen | `cls` | `clear` |
| count the volume | `chkdsk` | `df` |
| date and time | `date` | `date` |
| system, shell and era | `ver` | `uname` (`ver` also accepted) |
| the command list | `help` | `help` |
| the three machine commands | `crash` `reboot` `era` | same |

Three names in that table are choices rather than history, and they are choices because
the alternative was to omit a command the scope names:

1. **`touch` in the DOS column has no historical equivalent.** MS-DOS had no way to
   create an empty file or bump a timestamp without a utility; the idiomatic answer was
   `echo. > file`, which needs output redirection — authentic in *both* families and a
   larger feature than the scope asks for. Rather than ship a shell missing a scoped
   command, `touch` keeps its Unix spelling on both sides and is flagged here as the
   terminal's one non-authentic name.
2. **`find` searches names, in both families.** MS-DOS's `find` filtered *text*, and
   finding a file by name was `dir /s`. Ours is the Unix one uniformly, because the
   scope asks for one `find` and a shell with two unrelated meanings for the same word
   would be worse than one anachronism.
3. **`start` is XP's word, not 3.1's.** One dialect serves both Windows eras and only
   the later one had a launcher verb. The same applies to the window title: §12 settles
   Windows 3.1's window as the MS-DOS Prompt, so that is what the DOS shell carries, and
   XP's own "Command Prompt" is not reachable from a rule keyed on path syntax. Both are
   recorded rather than papered over.

---

## 2. The font question, and why this terminal is not a character grid

**Every one of the six era faces is proportional.** Measured advances for `i` against
`W`, in the face each skin actually renders with:

| Era face | `i` | `W` | |
|---|---|---|---|
| XP UI | 4.45 | 15.10 | proportional |
| W31 System | 6.00 | 9.00 | proportional |
| Lucida Sub | 3.61 | 12.85 | proportional |
| S1 Chicago | 4.00 | 12.00 | proportional |
| Chicago Sub | 4.00 | 12.00 | proportional |
| Public Sans Ledger | 5.13 | 18.19 | proportional |

So padding a listing out with spaces aligns nothing, in any era. The alternative — a
monospaced substitute face per era — is **six unresolved fonts**, and `CLAUDE.md` is
categorical: *do not build on an unresolved font; name the specific substitute face and
show a rendered comparison at the sizes the era actually uses before building any chrome
that depends on it.* The era faces are resolved, gated and shipped; a terminal face is
not, and resolving one is a `docs/fonts/` task with its own comparison sheet, not
something to slip in under an app.

**So the output model is cells, not padded text.** A block of tabular output is a grid
whose columns are `max-content`; the browser measures the type and the columns line up
exactly under any face at any size. `tree` carries a `depth` and is indented in `ch`
units rather than with leading spaces. `test/browser/terminal.spec.ts` asserts, in all
six eras, that every row of a table starts its columns at the same x.

**Stated loss.** The real windows were monospaced: the MS-DOS Prompt drew the VGA text
font, `cmd.exe` drew Terminal or Lucida Console, and MPW and Terminal.app both drew
Monaco. Ours draw the era's UI face. What that costs is the character-cell look; what it
buys is that every glyph is on the pixel grid in the bitmap eras and inside the fidelity
gates those eras already passed. **What would resolve it:** a monospaced face per era
through the existing gate in `docs/fonts/` — a licence, a metric or structural target,
a rendered comparison at the era's own sizes, and the rejected candidates recorded with
reasons, exactly as the Windows 3.1 and Ledger rows were done.

### Coverage: what the six faces do not have

Measured by rasterising each character twice — in the era face and in a family that does
not exist — and comparing pixels:

| Absent from | Characters |
|---|---|
| **all six faces** | `─ │ └ ├ ┼ ┐ ┘` (box drawing), `→ ▸` |
| the 1-bit classic Mac face | additionally `…` `—` `•` |
| the Windows 3.1 face | additionally `•` |

`document.fonts.check()` **cannot find this** and must not be used for it: it walks the
fallback chain and answers true for anything the *system* can draw, which makes it a
guard that cannot fail. The pixel comparison is calibrated on `A` and refuses to run if
that reads as a fallback.

Consequences, both load-bearing:

- **`tree` draws `+---` and `\---`**, which is what `tree /a` printed for the same
  reason one codepage down, and its indentation is structural rather than spaces.
- **Nothing prints U+2026.** `Restarting...` is three ASCII dots.

The suite drives every command with fixed output and asserts that *every character in
the resulting transcript, plus the prompt*, is drawn by the era's own face — in all six
eras. That is the mechanical form of the trap that cost the file manager 2,569 mid-grey
pixels.

---

## 3. The phase-5 gate

`suspend()` → `resume()` with state intact, per app, asserted rather than assumed.

| State | Kind |
|---|---|
| scrollback (up to 1000 rows), working directory, command history and its cursor | plain fields |
| **a half-typed command line — text and both caret offsets** | **in the DOM** |
| **a `find` or `tree` caught mid-tree** | **on a suspended stack** |
| scroll offset | in the DOM |

`suspend()` stops three things that are genuinely *work*: the filesystem watch, any walk
in progress — which parks on `gate()` between directories rather than quietly finishing —
and the command line, which goes into its **disabled** state so a suspended window cannot
be typed into. Disabled rather than removed: a control that says "not now" is one of the
five states every interactive element ships, and deleting it would be saying something
else.

`resume()` re-reads `fs.chain(cwd)` and rebuilds the prompt row. That rebuild is
unconditional, and the reason is not incidental: the watch was dropped, so anything could
have happened to the tree while the window was stopped — the working directory can have
been renamed, moved or purged by a file manager that was never suspended. (It is handled:
a working directory that has gone falls back to the volume root and says so.) The
watch-driven path *may* short-circuit on an unchanged path because an event tells it what
changed; resume has no such information.

The rebuild replaces the row that hosts the command line, so a half-typed line has to be
read out on the way down and put back on the way up.

**The gate can fail, and that is asserted.** `CLAUDE.md` records two guards that could
not fail and were trusted anyway, so this one is checked in the same way. One test writes
a value **straight into the DOM without firing `input`**, so the app's own record still
holds the empty line the last submit left, and then asserts two things after the round
trip: that the input element is *not the same node* (proving the resume really destroys
it, without which the main assertion would pass against an app that had never heard of
the capture), and that the restored text is what was on screen rather than what was in
the record. A third test starts a walk over a 280-node tree, suspends mid-walk, asserts
the transcript does not grow while stopped, resumes, and asserts the walk completes.

The round trip also runs in all six eras.

---

## 4. Bugs found by rendering it, not by testing it

Every one of these passed the assertions and was wrong on screen.

1. **`Bytes used0`.** A `max-content` grid puts columns edge to edge. A terminal always
   had at least one space between columns; the gap is `2ch` in `base.css`, structural
   rather than era styling, because columns that touch are unreadable rather than
   differently styled.
2. **The command line kept the era's field chrome.** `border: 0` was not enough in the
   era whose text box draws its box as two inset shadows — the prompt line rendered with
   a sunken rectangle round the cursor. Every skin clears `box-shadow` too.
3. **A tinted error line reads as *disabled* in a grey-ramp era.** The first Mac OS 8
   version coloured errors with a step of the documented grey ramp, which is lighter than
   the ink — and lighter is exactly what that era says "unavailable" with. There is no
   darker step than the ink. **MPW's own answer turned out to be the right one**: it
   prefixed diagnostics with `###`, which is the only way to mark an error in a window
   with one ink, and it now serves both classic Mac eras. The two Windows eras use their
   console's own bright-white attribute and Tiger uses the measured close-light red.
4. **The Ledger disabled treatment was invisible.** The bleach tile knocked 4.5% of the
   row's ink out at band 1 and 8.4% at band 2 — nothing anyone would read as "you cannot
   type here". The bleach is the frame's mechanism for *how long* a window has been
   ignored; "unavailable" is a different statement and the skin already had a mark for
   it, the amber dither it prints behind a disabled list row. Same property, same level,
   no second construction.
5. **`find` reported paths rooted at the search folder**, not at the volume: the walk
   only knew the ancestors it had pushed itself, so `find target` in `/Users/chronos/…`
   printed `/Notes/hello.txt` — which reads as a real path and is not one. The walk is
   seeded with the chain down to its starting folder.
6. **Two ways to inject a grey that is not there**, both found while making the no-grey
   probe fail on purpose. The console is scrolled to the end, so a fill injected into the
   *first* row of a listing never reaches the screenshot; and a row inside a tabular
   block is `display: contents` so its cells can be the grid's own items, and an element
   with no box paints no background at all. The probe now injects into the last block.

---

## 5. Two bugs outside this app, one fixed and one reported

### Fixed: the classic Mac codecs did not round-trip their own paths

`format` emits `Macintosh HD:Documents:` for a folder — correct, that is how the classic
Mac wrote one — and `parse` read the trailing colon as an *empty component*, which that
codec treats as "up one". So the path the prompt printed resolved to the volume root when
it was typed back. Measured before the fix:

| era | `format` | `parse` returns |
|---|---|---|
| `system1` | `Macintosh HD:Documents:` | **the volume root** |
| `macos8` | `Macintosh HD:Documents:` | **the volume root** |
| `winxp` `win31` `tiger` `ledger` | — | the same folder |

Four of six round-tripped and two did not. The era's parent syntax is a colon *between*
components — `::name` is the parent, `:::name` the grandparent — and a trailing colon is
not one of those, so both codecs now drop a single trailing separator before splitting.
It also fixes the bare parent forms, which counted one level too many: `::` split into two
empty components and reached the grandparent.

This is `src/skins/system1/paths.ts` and `src/skins/macos8/paths.ts` — two other sessions'
files, changed here because every consumer wants a path that round-trips and the same rule
that governed the em-dash correction applies: *"it is shared" answers who changes it, not
whether it should change.* One line each, with the reasoning in place.

### Reported, not fixed: the two classic Mac codecs disagree with each other

They implement different rules for a relative path with more than one component:

- `system1`: `Work:notes.txt` is **rejected** — a colon that is not leading and not after
  the volume means the first component *is* a volume name, and there is no volume called
  `Work`. This is the historically correct HFS rule.
- `macos8`: the same string is **accepted** as relative to the current folder.

Both are defensible as "what a user would expect" and only one is what HFS did. Changing
`macos8` would alter user-visible behaviour in another era on a point of historical detail
that nothing in `docs/sources/` settles, so it is raised rather than taken.

**What this app does about it** is stated once, in `paths.ts`: the shell accepts **one
grammar, a strict superset of the codec's**. The codec is asked first and its answer
always wins; when it declines a path whole, the last component is split off and looked up
in the folder the rest names — which is exactly what creating something already did. The
relaxation exists because without it the two halves disagreed and one era showed it
plainly: `touch Work:notes.txt` created the file and `cat Work:notes.txt` could not read
it back. A shell where you can make a file at a path and then cannot read it at that path
is wrong in a way no amount of era fidelity excuses, and shells have always been more
forgiving than the API beneath them. The split is unambiguous everywhere: `validateName`
forbids `/`, `\` and `:` in a stored name outright, so no name can contain any era's
separator.

---

## 6. Open, and not blocking

1. **`FsApi` exposes no storage estimate.** `Filesystem.storageHeadroom()` exists and is
   not on the app-facing contract, so `df`/`chkdsk` reports a real count of the real tree
   — volume, folders, files, bytes used — and no free-space figure. A capacity nobody
   measured is exactly the kind of number this project tags rather than invents. Adding
   `storageHeadroom` to `FsApi` is a one-line contract change and is *not* taken here.
2. **There is no launcher and no type registry, so `open`/`start` opens a window onto the
   item** rather than launching an app for it: a real modal owned by the terminal, drawn
   in the era's own widgets, showing what the filesystem stores. Files raised the same gap
   one app earlier. When a registry exists this becomes a launch and nothing else changes.
3. **`ver` prints no version number.** Nothing an app can reach at runtime carries one,
   and a string typed into the source would be a number nobody can check that drifts the
   first time the real one moves. It prints four things the app can genuinely observe: the
   system's name, the shell its path syntax implies, the volume the codec names, and the
   era the address selects.
4. **`era` cannot enumerate the eras**, and must not: the registry belongs to the entry
   point and naming even one era in an app is what the invariant scan forbids. `era` with
   no argument reports the selection the address carries; `era <name>` writes it and
   reboots, and the system falls back to its own default for a name it does not know. An
   app-visible era identity would need `AppHost` to carry it — a contract change, raised.
5. **`crash` raises a real unhandled fault and the session really stops.** §10 lists it as
   one of three routes into the era's failure state; the other two are phase 6 and none of
   the three failure states exists yet. So this throws the actual thing an error boundary
   will catch — an exception from a task of its own, outside any handler — rather than
   drawing something that looks like a crash. Closing the window is the recovery path §10
   requires, and the window is still there to close.
6. **`reboot` and `era` reach for `location`.** The only session-level handles an app has
   are `location.reload()` and the address. A session/power API on `AppHost` would be the
   contract answer; not taken.
7. **No scroll bar, and the era's own scroll bar is tier 2.** §5 puts scroll bars in tier
   2 — the skin supplies the structure — and a tier-2 addition is a contract change.
   Worth knowing before anyone relies on the CSS that is there: **in this Chromium build
   `::-webkit-scrollbar` has no effect at all.** A styled scroller and an unstyled one both
   reserve **0** layout pixels, and a screenshot of a scrolled element captures no
   scrollbar pixels in either case. So the two-tone scroll bar the file manager added for
   the 1-bit era is unverified here — there is also no grey exposure from it, for the same
   reason.
8. **No tab completion and no output redirection.** Neither is in the scope; both are the
   obvious next things a person would reach for. Redirection in particular would make
   `touch`'s DOS-column anachronism unnecessary.
9. **`open`/`start` takes one operand** and `cp`/`mv` take exactly two. Multi-operand
   moves into a folder are a small extension and are not built rather than half-built.

---

## 7. What is not covered

- **Six apps, one gate.** This file proves the terminal survives the round trip. It
  proves nothing about the other four apps, and a green suite here should not be read as
  phase-5 coverage — the same thing `AppInstance`'s own doc comment says about the
  harness implementation it replaced.
- **The command set is not exhaustive.** `type`/`cat` prints text and refuses anything
  else by MIME rather than by sniffing; `find` matches names with `*` and `?` and nothing
  else, which is what both families' command lines had; recursion is bounded at 4000
  entries and **says so in the output when the bound bites**, because silent truncation
  reads as "that is the whole tree".
- **No fidelity suite.** The terminal has no 1:1 source: no chapter of any of the four
  documents in `docs/sources/` shows a console window, so there is nothing to measure a
  metric against and nothing tagged `measured` here. The two console colour pairs are
  documented character attributes (`07` light grey on black, `0F` bright white), written
  as their own custom properties so nothing reads them as measured chrome values.
