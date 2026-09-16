# Command Handlers

Revision `c302741689bd67c361cd7faadb221df3193992c3`. Canonical and rendered source lines 13-89 read fully. Shared-header reads are supporting evidence, not ownership claims.

## Operations

### Command_00
Handles command opcode 0x00 by terminating the current command stream: it clears the CommandInfo command cursor and does not advance to another command.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcommand.c#L13-L17

### Command_01
Executes command opcode 0x01 by adding the command's frame operand to the accumulated script timer and then advancing to the next command.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcommand.c#L19-L24

### Command_02
Executes opcode 0x02 by replacing the interpreter timer with the encoded target frame minus the current frame count, then advancing to the next command.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcommand.c#L26-L31

### Command_03
Begins a counted command-stream loop by pushing the loop body's starting cursor and requested iteration count as a two-entry frame, then advancing execution into the loop body for the paired ExecuteLoop command to manage.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcommand.c#L33-L40

### Command_04
Completes a counted script loop: it decrements the active loop counter, jumps the command cursor back to the saved loop-body start while the counter remains nonzero, and otherwise proceeds beyond the loop while removing that loop's two saved stack entries.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcommand.c#L42-L54

### Command_05
Enters a command-stream subroutine by saving the stream position immediately after the destination operand as a return continuation, then transferring execution to the encoded destination pointer.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcommand.c#L56-L62

### Command_06
Returns from a command-script subroutine by popping its saved continuation cursor and making that cursor the active command-stream position.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcommand.c#L64-L68

### Command_07
Implements the encoded command stream's unconditional goto operation by replacing the current command cursor with the destination pointer stored in the command's operand slot.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcommand.c#L70-L75

### Command_08
Executes command opcode 0x08 by advancing past the current command and replacing the command interpreter's timer with the maximum finite f32 value.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcommand.c#L77-L82

### Command_09
Executes command 0x09 by starting a background-flash effect with the command's two encoded operands, then advances command processing.
Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcommand.c#L84-L89

## Names

| Canonical | Existing hypothesis | Decision |
|---|---|---|
| Command_00 | Command_Reset | supersede: Command_ClearCursor |
| Command_01 | Command_SynchronousTimer | retain |
| Command_02 | Command_AsynchronousTimer | retain |
| Command_03 | Command_SetLoop | retain |
| Command_04 | Command_ExecuteLoop | retain |
| Command_05 | Command_Subroutine | retain |
| Command_06 | Command_Return | retain |
| Command_07 | Command_Goto | retain |
| Command_08 | Command_SetTimerAnimation | supersede: Command_SetMaxTimer |
| Command_09 | Command_BgFlash | retain |

Reset and SetTimerAnimation are comment labels, not full behavioral contracts. Proposed ClearCursor and SetMaxTimer remain hypotheses and require independent review. All canonical symbols remain unchanged.

## Loop and Subroutine Details

NEXT_CMD increments u by one CmdUnion element. Command_03 saves the next element and a numeric count in consecutive stack entries. In the intended 32-bit layout, event_return starts at byte 16. The u32 index loop_count+3 therefore addresses event_return[loop_count-1]. The ptr alias starts at byte 8, so ptr[loop_count] addresses the saved cursor at event_return[loop_count-2]. This explains Command_04 without mistaking the address expression for a fresh stream pointer. Zero count wraps on decrement; underflow and nesting bounds are unchecked. The one-element ptr array and provisional event_return size prevent a portable-C or safe-capacity claim.

Command_05 advances to the destination operand, saves the following element, and installs the operand pointer. Command_06 pops one continuation. Command_07 loads a destination without pushing a continuation. Loop frames and call continuations share loop_count and event_return; callers must keep stack contents balanced.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcommand.c#L33-L75; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/inlines.h#L16-L19; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/types.h#L920-L934; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/types.h#L1011-L1018.

## Parameters and Remaining Questions

All ten parameter entities have no existing facts. Each sole parameter is the mutable CommandInfo pointer used for state updates. No null guard exists in these handlers. No new register-mapping claims are proposed.

Command_09 has an 8-bit first field and 18-bit second field, forwarded in order. The canonical callee passes them onward with ColorOverlay state. Specific knockback or elemental-flash triggers are not shown. Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/types.h#L543-L547; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lb_0219.c#L119-L126.

The outer interpreter must establish what a cleared cursor or F32_MAX timer means for scheduling. This leaf does not prove animation completion or an automatic resume path. Shared type layout and stack capacity remain family followups.
