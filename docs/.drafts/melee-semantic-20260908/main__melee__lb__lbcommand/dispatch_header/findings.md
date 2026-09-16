# Dispatch and Header Review

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Canonical and rendered source lines 1-99 and header lines 1-22 are complete. Source SHA-256 is `d0cd96443c3bb1f71fbcd1ae0094c0d323a249e04282db441485c260467529c8`; header SHA-256 is `335ef852e160e23de93d62ccc506dc7736133ed0efe9ffebd62dd57464dd5b69`. Both renders report zero parse errors, with 21 source and 10 header substitutions. Aliases aid reading only.

## Dispatch Contract

`Command_Execute` accepts `CommandInfo* info` and unsigned `u32 command`. IDs 0 through 9 index `lbCommand_803B9840`, pass info unchanged to exactly one void callback, and return true after it returns. IDs 10 and above return false without touching info or calling a handler. True means dispatch occurred, not that the script finished or the handler reported success. The dispatcher performs no null-context guard and does not advance a cursor itself.

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcommand.c#L91-L98

The writable 16-entry source table initializes slots 0 through 9 with Command_00 through Command_09 and six remaining slots with NULL. The dispatch guard avoids those six slots under the source initializer. No mutation of the table appears in the 99-line source. Section target `.data` cannot be equated with this one symbol without compiled ownership evidence, so its five existing facts, including lbCommand_HandlerTable, remain unresolved as section facts. The proposed name is a reasonable table description but no exact original spelling is established.

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcommand.c#L7-L11

## Whole-File Context

Commands 00 through 09 visibly modify cursor, timer, or loop/return storage; Command_09 also invokes lbBgFlash_80021C48. Command_00 clears the cursor. Command_01 adds a command value to timer; Command_02 assigns command value minus frame_count. Command_08 assigns F32_MAX after NEXT_CMD. Loop and subroutine field relationships require the shared layout/macro context reviewed by the handler sibling; this leaf makes no independent layout claim.

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcommand.c#L13-L89

The file entity's purpose is narrowed to cover termination as well as state updates. Its other three broad source-supported facts are retained for TU synthesis. The four Command_Execute facts remain accurate and its canonical name is retained. Two parameter entities currently have no facts and receive purpose proposals.

## Header Review

The complete header imports Runtime/platform.h and melee/lb/forward.h, declares Command_00 through Command_09 and Command_Execute, and additionally declares Command_14. There is no Command_14 definition in this source, target in the frozen TU inventory, or populated table slot for ID 14. This is a local declaration/inventory discrepancy, not proof that no implementation exists elsewhere. No shared type is defined by this header.

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcommand.h#L1-L22

## Unresolved Constant Pool

The three `.sdata2` facts rely on archived assembly and section descriptions for address 0x804D79E0, an integer-to-double conversion bias, a 16-byte contribution, and padding. Canonical C attests timer arithmetic and F32_MAX use only. No compiled map/object was reviewed, so all three facts remain unresolved rather than accepted from archived assertions. No matching or source edits were performed.

code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcommand.c#L20-L30
code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lbcommand.c#L78-L82

## Coverage

Six assigned subjects reviewed: three targets, the file entity, and two parameter entities. All 16 existing facts have explicit IDs and frozen updated_at revisions in dispositions.json: seven retain, one supersede, eight unresolved. The proposal contains one corrected file purpose and two parameter purposes. Shared-header and compiled-section followups remain outside the proposal envelope.
