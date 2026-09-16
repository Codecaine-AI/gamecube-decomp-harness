# Numbered Command Handlers

Draft source review at `c302741689bd67c361cd7faadb221df3193992c3`. This module dispatches one already-decoded command number against mutable `CommandInfo` state. It does not contain a stream execution loop. Independent root review accepted all ten proposed changes and applied them to the staged KB. Final rendering is complete; root has promoted those ten changes to the live KB.

## Dispatch and Public Declarations

`lbCommand_803B9840` is a writable 16-entry function-pointer array. Slots 0 through 9 initially hold `Command_00` through `Command_09`; six trailing slots are null. `Command_Execute` dispatches only unsigned command numbers below 10, forwarding the original `info` pointer and returning true after the call. Higher values return false without a callback. The true result means a handler was dispatched; it does not prove the stream is still active. No `info` null guard or table-entry null guard exists on the accepted path. [Canonical table and dispatcher](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcommand.c#L7-L11), [dispatch guard](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcommand.c#L91-L98).

The paired header declares all eleven defined functions and also `Command_14`. It supplies no definition or owned report target for `Command_14`; no behavior is assigned to that declaration. [Public declarations](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcommand.h#L8-L19).

## State Transitions

| Canonical Handler | Source Operation |
|---|---|
| Command_00 | Sets the stream pointer `u` to null. It does not reset timers or stack state. |
| Command_01 | Adds the current command value to timer, then advances. |
| Command_02 | Sets timer to the encoded value minus frame_count, then advances. |
| Command_03 | Pushes `u + 1`, then the encoded count cast as a command pointer, incrementing loop_count twice; advances. |
| Command_04 | Decrements a word through a cast of info; if the top event_return value remains nonzero, assigns through the ptr view and returns. Otherwise advances and subtracts two from loop_count. |
| Command_05 | Advances to a pointer operand, pushes the following command position, then installs the pointer operand as u. |
| Command_06 | Decrements loop_count once and installs that event_return entry as u. |
| Command_07 | Advances to a pointer operand, then installs that operand as u. |
| Command_08 | Advances and assigns F32_MAX to timer. |
| Command_09 | Passes the two current command parameters to lbBgFlash_80021C48, then advances. |

[Commands 0 through 4](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcommand.c#L13-L54) and [commands 5 through 9](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcommand.c#L56-L89) establish those writes and calls. In the included foreign `inlines.h`, NEXT_CMD increments `u` by one CmdUnion element. The shared definition is supplemental canonical context, not an owned-header claim. [Cursor macro](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/inlines.h#L16-L19).

## Names and Dependencies

Canonical comments attest the labels Reset, SynchronousTimer, AsynchronousTimer, SetLoop, Execute Loop, Subroutine, Return, Goto and SetTimerAnimation. Existing KB aliases embed these labels in C identifiers. Their behavior still needs the literal scope above: Reset only nulls u, and SetTimerAnimation directly assigns a large timer, with animation consequences left to callers. The rendered alias `lbBgFlash_StartColorAnim` is not proof of what the foreign function does. [Canonical comments and bodies](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcommand.c#L13-L89).

The foreign CommandInfo layout uses a union of `u` and a pointer-array view. Its source explicitly describes the array as a matching workaround and the event_return array size as provisional. Counted-loop interpretation is supported by the operation pattern, but this review does not certify safe bounds, maximum nesting, arbitrary host portability or shared layout correctness. Handlers have no local stack overflow/underflow or stream-operand bounds guards. [Shared layout context](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/types.h#L920-L927), [stack fields](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/types.h#L1011-L1018).

## Coverage and Pending Evidence

The TU lead read all 99 C lines and 22 header lines in separate canonical and rendered views. The renderer reports zero parse errors, 21 substitutions for C and 10 for the header. The final source line was returned in both files. The snapshots remain under campaign `units/main__melee__lb__lbcommand/pages/`, with reader-tagged receipts in `reads.jsonl`.

Section targets `.data` and `.sdata2` are reviewed separately from source declarations. Source semantics alone do not prove object-section membership, emitted constants or padding. Those archived claims remain unresolved until object/map evidence is assigned. Shared CommandInfo definitions, caller scheduling, and the background-flash callee remain family dependencies.

## Staged Acceptance

Proposal SHA-256 `ca32740b832427b6b0a925a6d04cf08dfbe7988e9c297523de0e2b0dc84b5756` passed independent root review. [Staged completion](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lbcommand/staged-completion.json) and [final rendering](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__lb__lbcommand/final-render.json) record ten applied changes and unchanged source.

Live promotion: [immutable live receipt](</Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/ca32740b832427b6b0a925a6d04cf08dfbe7988e9c297523de0e2b0dc84b5756/2026-09-08T14-38-02.381Z-ecbd0265-ed13-4e63-966e-88d0024a9919.receipt.json>).
