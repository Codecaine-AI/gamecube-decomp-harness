# Fighter Action Dispatch Review

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Full owned canonical and rendered coverage: C1-231, C1318-1422, H1-17. Start UTC `2026-09-08T14:32:41Z`.

## Runtime Dispatch

### `.data`

Parallel opcode tables for IDs 10 through 58, with normal, alternate and length-only consumers. The u8 entry stores a command-word count. The object includes additional compiler-local data objects beyond these three source arrays.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L174-L210, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L1318-L1421

### `.sdata2`

40-byte read-only pool corroborated by the existing report and object. Contents include 0.003906f, zero, plus/minus one, F32_MAX, two integer-conversion doubles and alignment padding.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L260-L269, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L323-L327, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L864-L877, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L1226-L1232, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L1252-L1310, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L1318-L1421

### `ftAction_80073240`

Updates frame_count even if no stream exists, decrements a non-F32_MAX timer by frame_speed_mul, and processes due commands. Command_Execute handles common commands; others dispatch through the normal table after subtracting 10. No explicit bounds check exists for opcode 59-63.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L1318-L1348

### `ftAction_80073354`

Uses the same timing rules with the alternate table. Clears throw_flags before checking stream existence and again when a callback changes timer to a nonpositive value. The caller uses this for a nonzero anim_start when Ft_MF_UpdateCmd is clear.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L1350-L1388, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/fighter.c#L1341-L1348

### `ftAction_8007349C`

Uses the same timing rules and common-command execution, but advances cmd->u by the length-table entry for fighter-specific commands. It is not globally side-effect-free: frame_count, timer, cursor and common-command state can change. The caller selects it with Ft_MF_UpdateCmd.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftaction.c#L1390-L1421, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/fighter.c#L1341-L1348

## Table Slots

The complete 49-slot mapping is in table-slot-mapping.json. Each record contains index, opcode, normal callback, alternate callback and command-word count. Index 0 maps opcode 10; index 48 maps opcode 58. Tables contain 23 identical callback pairs; an alternate-table label must not imply that every handler is skipped.

## Object and Report Corroboration

The existing report SHA-256 matches the frozen manifest: `dc38bdb51205241c2b638f057f8e34d932bbfafcff7c404170689aeb89585998`. It reports `.data` 528 bytes and `.sdata2` 40 bytes. No build or report generation ran.

Object SHA-256 `3169c0eb1bcf78df54a64040f5f78cebec1c4245b657b3b5ad191f9d23b9448f`. Symbols place ftAction_803C06E8 at .data+0x0, size 0xC4; ftAction_803C07AC at +0xC4, size 0xC4; ftAction_803C0870 at +0x188, size 0x31. Three additional 0x1C-byte objects @451, @712 and @785 appear at +0x1BC, +0x1D8 and +0x1F4. Their detailed source roles remain unassigned.

The .sdata2 object bytes and ELF section flags establish a 40-byte nonwritable constant section. Its recorded entries are 0.003906f, the conversion doubles 2^52 and 2^52+2^31, zero, 1, -1 and F32_MAX, with four alignment bytes at offset 4. See object-symbols.txt, object-metadata.json and sdata2-content.hex.

## Fact Decisions and Naming

26 existing facts: {'supersede': 3, 'retain': 23}. Only three incorrect or overbroad .data facts are rewritten; confirmed facts remain unchanged. All facts have IDs, updated_at versions and precise current evidence in fact-dispositions.json.

Retain ftAction_UpdateCmd as a hypothesis supported by the Ft_MF_UpdateCmd caller branch. Preserve the canonical address names of the two other dispatchers and canonical source table symbols. The section label Action command tables is descriptive, not a recovered identifier.

## Boundaries

The header is fully reviewed and declares all three dispatcher signatures. Shared Fighter and CommandInfo type ownership remains external. The common dispatcher handles opcodes below 10; this file does not guard table indices above 48. Handler-body leaves must reconcile individual command behavior and record lengths.

The shared type header rendering reports 33 parse errors; assigned ftaction pages parse without errors. Apple objdump could read symbols and bytes but lacked PowerPC disassembly support. Neither exception prevented the owned canonical/rendered review or section corroboration.

Completed UTC `2026-09-08T14:37:21Z`. Elapsed 280 seconds. Dry-run validated three writes with zero rejections; proposal hash `5a2afcddfff8465c8f2417052a8cdf5bd348a4e722051449418936d715d812ab`. No apply ran.

Independent-review ledger repair: packed operand widths and malformed random-selection outcomes must not be inferred from destination types. The final fact-dispositions.json supersedes any broader narrative here for the eight deferred retained claims. Consolidated final counts: 327 retain, 48 supersede, 88 unresolved; 49-write proposal unchanged.
