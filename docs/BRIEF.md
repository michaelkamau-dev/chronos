Build "Chronos" — a browser OS that boots into six real desktop environments
across four decades, sharing one persistent filesystem underneath.

Eras: System 1 (1984), Windows 3.1, Mac OS 8, Windows XP, Mac OS X Tiger,
and one speculative 2035 OS of your own design.

Before writing code, enter plan mode. Produce an architecture doc covering:
the window manager contract, the virtual filesystem schema, how a single app
component renders under six different chrome skins, and the event/focus model.
Stop. Wait for my approval. Do not scaffold until approved.

NON-NEGOTIABLE CONSTRAINTS
- Production code. Not a demo, not an MVP, no TODOs, no placeholder handlers,
  no "in a real implementation this would." Every button does its job.
- Vanilla TS + Vite. No React, no UI libraries, no CSS frameworks. Zero runtime
  deps except idb-keyval.
- 60fps window drag on a 2019 laptop. Movement is transform-only, no layout
  thrash, no per-frame allocation. Cold load under 2s on 4G.
- Full keyboard operation. Every mouse action has a keyboard equivalent.

THE FIDELITY BAR — this is where the project is won or lost
Chrome is measured, not approximated. Title bar heights, border widths, bevel
geometry, corner radii, shadow spread, and system fonts must match the real OS
to the pixel. Windows XP is Tahoma 8pt with a 3px Luna gradient border.
System 1 is Chicago bitmap with 1px black outlines and no antialiasing anywhere.
Mac OS 8 has pinstripes and 2px chiseled bevels. If you cannot verify a value,
say so in a comment rather than inventing one.

Every interactive element has five distinct states: rest, hover, active,
focus, disabled — era-correct in each. A Windows XP button that doesn't
depress-and-shift-1px on mousedown is a bug.

Window manager: real z-order, click-to-focus with inactive-title-bar styling,
eight-handle resize with per-app min sizes, double-click-to-maximize,
Alt+Tab with a working switcher overlay, Alt+F4, era-correct minimize
animation, modal dialogs that genuinely trap focus and block their parent.
Right-click yields a real context menu everywhere — desktop, file, title bar,
taskbar — with correct items, separators, submenus, and disabled entries.

APPS — one implementation each, six skins
File manager, text editor, paint (canvas, real tools), terminal, media player,
settings. They are functional programs, not screenshots. Paint saves a PNG to
the filesystem. The terminal has a working command set operating on the real FS.
Text editor has find/replace and an unsaved-changes guard.

THE SPINE
The virtual filesystem is IndexedDB-backed and persists across eras and reloads.
Save a document in System 1, reboot into Windows XP, and it is there — correct
icon, correct metadata, correct Properties dialog, opening in the XP-skinned
editor. Path semantics change per era (HD:Documents:file vs C:\My Documents\file)
over identical stored data.

CHARACTER
Boot chimes and UI sounds synthesized via Web Audio — no audio files.
Era-authentic failure states, reachable, not decorative: Windows 3.1 GPF dialog,
XP bluescreen, Sad Mac with the death chime.

BUILD ORDER — verify each phase before advancing
1. Window manager + focus model, one era, unstyled boxes. Prove 60fps drag.
2. Filesystem layer + persistence. Prove reload survival.
3. Windows XP at full fidelity. This is the reference implementation.
4. Remaining five eras against that contract.
5. Apps.
6. Sound, failure states, boot sequences.

DONE MEANS
I can boot into any era, create files, open apps, drag and resize and stack
windows, right-click anything, run the whole thing from the keyboard, close
the tab, reopen it, and find my work exactly where I left it — and at no point
does it feel like a web page wearing an OS costume.
