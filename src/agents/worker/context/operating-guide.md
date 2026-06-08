# Worker Operating Guide

Default worker context. Use this as the compact operating contract for one
leased Melee decomp target.

## Work Shape

1. Confirm the lease: target, unit, symbol, source path, write set, budget, stop
   rule, and worker log directory.
2. Build a small evidence packet before editing: local source, sibling matched
   functions, relevant headers/macros, symbols/splits, report metadata, first
   mismatch shape, any useful PR/resource hits, and knowledge-tool lookups when
   the source path, symbol, opcode pattern, or compiler-shape question is
   concrete.
3. Edit one source dimension at a time. Keep attempts small enough that a bad
   hunk can be removed without touching unrelated dirty work.
4. Verify with the narrowest relevant command after every attempt. Keep a local
   regression ledger for the target and cheap affected-neighbor checks.
5. Keep verified improvements and continue while evidence-backed nearby
   hypotheses remain. Stop before random guessing.
6. Return a durable report: retained patch status, validation evidence, local
   regression state, useful facts, negative evidence, and blockers.

## Hard Rules

- Edit only files in `current_state.lease.write_set`.
- Treat files already known to be exact 100% complete as read-only references.
  If a packet asks you to edit only complete files, report a scheduling blocker.
- Never run whole-file or repo-level destructive reset/restore/clean commands.
- Never run global progress-report refresh commands from a worker.
- Preserve pre-existing dirty work. Undo only hunks introduced by the current
  failed attempt.
- Do not report `progress` or `score_candidate` with an unresolved local
  regression caused by retained worker edits.

## Source Quality

- Treat matching as reconstruction of likely original authored source. Infer
  local developer conventions from matched sibling functions, nearby files,
  headers, macros, naming habits, and historical PR evidence before preserving
  generated, permuter-shaped, or data-driven source.
- Recover natural loops from repeated generated blocks before keeping unrolled
  or goto-heavy source.
- Prefer real structs, fields, accessors, and union arms over raw pointer
  arithmetic. Use `M2C_FIELD` only as a temporary evidence-backed bridge.
- Map `__assert("jobj.h", line, ...)` back to existing `jobj.h` inlines when
  the line number identifies one.
- Prefer project assert/report macros and local idioms over hand-expanded
  asserts or fake helper shapes.
- Prioritize text-section matches. Do not add or move data, literals, symbols,
  or splits solely to quiet data diffs before the translation unit's text
  section is complete.
- Keep string literals inline; do not replace asset names, table labels,
  assert/report text, or resource names with data-symbol identifiers unless
  data ownership is explicitly in scope and evidenced.
- Do not rename globals by adding identifier-to-identifier `#define` aliases or
  by keeping duplicate address-commented extern declarations for one data
  address.
- Scope pragmas tightly and keep them only when natural source forms have failed
  and objdiff evidence justifies the tradeoff.
- Treat m2c, Ghidra, AI, permuter output, and knowledge-tool pattern notes as
  candidate material, never as trusted source. Keep edits only after local
  source review and narrow objdiff/checkdiff validation.

## Stop Conditions

Stop and report a blocker when progress requires a missing type, field, data
owner, symbol, verifier, or broader scheduling decision. Stop as
`stalled_no_useful_guess` when remaining options are speculative or would be
broad mechanical search without a named source-shape axis. If tool lookups only
return broad register/allocation hints, stale notes, or fallback metadata, and no
bounded source-shape axis remains, preserve the negative evidence and stop
instead of perturbing source randomly.
