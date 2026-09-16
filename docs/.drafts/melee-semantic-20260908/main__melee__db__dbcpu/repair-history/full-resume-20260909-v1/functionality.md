# dbcpu Functionality Review

Frozen revision c302741689bd67c361cd7faadb221df3193992c3. The one owned source file is fully reviewed in canonical and rendered form through EOF, C1-67 with 66 nontrailing lines. Rendering succeeded with zero parser errors and zero substitutions. All 7 targets, 9 subjects, 40 inherited fact versions and 14 exact outgoing links were individually reviewed. Shared db.h declarations and foreign type/helper definitions were inspected separately. Independent review is pending.

## Setup and Resource Lifetime

fn_SetupCpuHandicapInfo clears the logical panel update bit, requests DevText id 6 at 20,20 with 60 columns and 7 rows, and stores the returned pointer. The DevText record comes from the subsystem's global pool. This TU supplies only the 844-byte text buffer. DevText_Create clears 840 bytes for the requested dimensions.

Successful creation adds the record to the global draw list, hides its cursor, sets transparent-black background and white text, and selects horizontal scale 9 and vertical scale 12. DevText_Show does not use its GObj argument. The update bit starts at zero, but text/background hide flags remain clear. Initial blank text and transparent background therefore must not be described as explicit hiding.

Repeated setup is not safe recreation. DevText_Create returns NULL for an existing id 6, overwriting the saved pointer while the old registered panel remains. Later enabled update and controller visibility calls dereference the saved pointer without checking it. The setup path checks creation success only for registration and styling.

## Six-Slot Statistics Table

fn_UpdateCpuHandicapInfo does nothing while the logical bit is clear. When enabled, it erases the panel, resets cursor to 0,0, prints the heading and reads slots 0 through 5 unconditionally. Player_GetPtrForSlot asserts a valid range and returns the address of static player storage. There is no active-slot or CPU-slot filter.

| Column | Source Field | Output |
|---|---|---|
| A | player_state | decimal integer |
| B | cpu_level | decimal integer |
| C | cpu_type | decimal integer, minimum width 2 |
| D | handicap | decimal integer |
| E | unk50 | fixed-point, two decimal places |
| F | attack_ratio | fixed-point, two decimal places |
| G | defense_ratio | fixed-point, two decimal places |

The three float conversions use %2.2f; width 2 is a minimum and does not impose a maximum. The unit only reads these fields. Their displayed values do not alter player configuration. player_state has a tentative foreign header comment about in-game state; unk50 remains unidentified. This packet makes no stronger gameplay interpretation of either field.

## Shared Input State

fn_CheckCpuHandicapInfo forwards its player argument unchanged to the held and pressed debug-button accessors, which index directly. Holding B and newly pressing D-pad Down XORs the one shared flag. Zero explicitly hides text/background and returns; one explicitly shows both. Holding the chord does not repeat without a new pressed edge.

The debug dispatcher calls the input handler for controllers 0 through 3 before one update. Two qualifying inputs in that pass can cancel by toggle parity. The six displayed records and four input controllers are different counts by construction. Debug setup and dispatch are gated by DbLevel at least DebugRom in their caller; this TU does not enforce that gate internally. Successful setup and a valid player argument are caller contracts.

## Compiled Data Attribution

| Section | Verified Existing Payload |
|---|---|
| .bss | 848 bytes: a four-byte DevText pointer and 844-byte backing buffer |
| .data | 56 bytes: heading at offset 0 with 21 bytes including NUL, three padding bytes, row format at offset 24 with 32 bytes including NUL |
| .sbss | One-byte UnkFlagStruct; split object has seven additional padding bytes |
| .sdata2 | 16 bytes: colors 00000000/FFFFFFFF followed by f32 scales 41100000/41400000 |

Source and split object bytes agree on .data and .sdata2. Their symbols identify the two colors followed by the two scale floats. This corrects the incomplete scalar-only pool description. The UnkFlagStruct union has a raw byte view and eight bitfields; only b0 is used here. Object paths, hashes, sections and symbols are saved in compiled-artifacts.json. No build or binary-parity assertion was made.

## Naming and Baseline Dispositions

Retain db_CpuHandicapInfo for .bss and db_ShowCpuHandicapInfo for .sbss. Each names the exact canonical object occupying its section and has one exact baseline naming assignment. The three existing canonical function names are already descriptive. No new alias or source rename is proposed.

There are 29 retained facts, 11 superseded facts and one new parameter fact. Every inherited fact ID and updated_at is recorded with old/new values and evidence. All 14 original outgoing links retain their exact records and receive an individual disposition. Current canonical code corroborates the wiki-backed relationship; the historical wiki revision was not reread. No link mutation is proposed.

See [proposal](proposal.json), [fact dispositions](fact-dispositions.json), [link dispositions](link-dispositions.json), [subjects](subjects.json), [naming](naming.md), [compiled artifacts](compiled-artifacts.json), [foreign canonical evidence](foreign-canonical.json) and [family follow-ups](family-followups.json).

Pinned owned evidence: [storage/setup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcpu.c#L6-L28), [table update](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcpu.c#L30-L50), [input toggle](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcpu.c#L52-L66).

Immutable canonical/rendered snapshot:

- [src__melee__db__dbcpu.c.1-67.json](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__db__dbcpu/pages/src__melee__db__dbcpu.c.1-67.json)
