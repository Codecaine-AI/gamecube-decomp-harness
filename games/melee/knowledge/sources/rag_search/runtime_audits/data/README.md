# melee-runtime-audits

Runtime audits for [doldecomp/melee](https://github.com/doldecomp/melee)
documentation/semantics PRs.

The decomp's CI already proves byte-equivalence: any PR that still builds a
matching DOL cannot have changed behavior. What CI *cannot* check is renames
and documentation — claims like "this argument is the external stage ID" or
"this table maps external to internal stage IDs". These audits prove those
claims against the live game, in two mutually reinforcing ways:

1. **Machine audit** — a standalone Python script (stdlib only) that drives
   **any stock Dolphin** through its built-in GDB stub
   (`-C Dolphin.General.GDBPort=...`): boots the game headless, forces the
   relevant code paths, and reads back what the engine actually does. Results
   stream to JSONL and render to a markdown report.
2. **Human-verifiable Gecko artifact** — Gecko codes usable on any Dolphin,
   with reviewable assembly and a documented result block. Audits may also
   render the values on screen with the game's develop-mode text console.

Each audit lives in its own directory, self-contained:

- `pr2939/` — external vs internal stage IDs
  ([PR #2939](https://github.com/doldecomp/melee/pull/2939)).
- `venom-platform-links/` — the target object, ordered platform joints, and
  smash-taunt timer in Venom's platform controller
  ([refactor commit](https://github.com/MarkMcCaskey/melee/commit/079bee437e70819ac6932cae51cfc1b27dedcb82)).
- `grkind-stkind/` — which stage-id space the game's own `grkind` / `stkind`
  names refer to (PR #2939 follow-up). Also the one audit here whose main
  result needs no emulator: the claim is checkable against the stage archives
  on the disc.

## Requirements

- A stock Dolphin build recent enough to have the GDB stub config keys
  (mainline since ~2022). `dolphin-emu-nogui` is ideal for headless runs;
  the GUI build works for the interactive overlay.
- An SSBM NTSC 1.02 (GALE01 rev2) ISO.
- Python 3.9+ (stdlib only).
- Rebuilding the overlay payloads additionally needs powerpc-eabi binutils
  and a doldecomp/melee checkout, but the built artifacts are committed.
