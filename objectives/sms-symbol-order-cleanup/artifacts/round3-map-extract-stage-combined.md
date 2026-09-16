# Combined stage helper extraction candidate

Patch: `round3-map-extract-stage-combined.patch`.
Scratch source: `round3-map-scratch/round3-map-extract-stage-combined/src/Map/Map.cpp`.
`git apply --check` passes against the current independent checkout.
No shared sources were edited or candidate compilations performed by this audit agent.
The parent subsequently compiled this candidate; measured disposition appears below.

## Correction of rejected first version

The first combined patch was incorrect: global replacement of small diff fragments matched unrelated closing braces and the Ricco case.
Parent review rejected it before application.
The corrected patch was rebuilt by replacing the complete brace-matched initStage function and inserting complete helper definitions at unique anchors.
Every diff hunk was inspected: only four helper additions and the four intended case replacements remain.
The resulting initStage has exactly the original case sequence; Ricco, Mare, Monte and PinnaParco case blocks remain byte-for-byte unchanged.
Original initMonte, initMare, initPinnaParco and initStageCommon bodies remain byte-for-byte unchanged.
A reverse transformation removing the four complete helper definitions and restoring the complete initStage function reproduces the starting file exactly.
These checks are recorded in `round3-map-extract-stage-combined-structural-review.json`.
`git apply --check` was repeated on the corrected patch.
This checks source structure and patch application only; parent compilation and matching checks are still required.

## Independent review

The four helper bodies reproduce only existing initStage case statements.
Bianco and PinnaBeach early `break` guards become `return` guards in their helpers; returning to the case reaches its unchanged terminating break.
Sirena and Option contain the exact existing operations and arguments.
No default case, Ricco case, case order, constants, or existing helper bodies were changed.
The existing PinnaParco pragma block remains byte-for-byte unchanged; no pragmas were added.
No declaration/header changes are needed because each helper is defined before initStage.

The combined source helper order is checked by script:
`Option, Sirena, Monte, Mare, PinnaParco, PinnaBeach, Bianco, StageCommon, Stage`.
This is reverse original map order for the existing and four restored helpers under this TU's deferred-inline flags.
Original `initDolpic` is still absent, and no speculative body was supplied.

## Original byte-size constraints

| Helper | Map line | Original size | PPC instructions |
| --- | ---: | ---: | ---: |
| initOption | 66091 | 0x5c / 92 bytes | 23 |
| initSirena | 66090 | 0x48 / 72 bytes | 18 |
| initPinnaBeach | 66086 | 0x58 / 88 bytes | 22 |
| initBianco | 66085 | 0x64 / 100 bytes | 25 |

Exact parsed map evidence is in `round3-map-extract-stage-combined-sizes.json`.
All four entries are UNUSED, so their original binding and raw opcodes are unavailable.
These were the acceptance constraints before the parent compiler run; measured sizes are recorded below.

## Caller evidence and acceptance

`round3-map-evidence-6.txt` contains the full original/current initStage comparison.
Before extraction it already reproduces all 108 instructions modulo stack-frame/save offsets; original frame is 0x70 and current frame 0x38.
The reconstructed helper calls must inline back into those existing case operations without semantic or instruction regressions.
The larger original frame provides independent support for missing inline helper boundaries; it is not sufficient proof by itself.

Accept only if the emitted four helper sizes match the original constraints, strict validation has no new missing/order/linkage defects, and the full matching comparison reports no regression.
If the compiler leaves a real call to one of these UNUSED helpers or changes the caller badly, retain only separately verified individual extractions or revert.
The Sirena body continues to use the pre-existing game helper SMS_LoadParticle; its historical spelling remains separately marked fabricated in the existing header.

## Measured parent trial and subsequent size audit

Parent compiled the corrected combined candidate and found an identical whole matching report.
Strict ordering and linkage also pass, with only the three previously absent functions still missing.
However three of the four extracted helper sizes differ from the map:

| Helper | Original | Trial | Disposition |
| --- | ---: | ---: | --- |
| initOption | 0x5c | 0x5c | Retain only this extraction after individual parent verification |
| initBianco | 0x64 | 0x70 | Reject this boundary |
| initPinnaBeach | 0x58 | 0x48 | Reject this boundary |
| initSirena | 0x48 | 0x58 | Reject this boundary |

Raw strict measurement is `round3-stage-helpers-mario__Map__Map-strict.log`.
The combined-trial object disassembly was read without recompiling; its symbol sizes agreed with the parent measurements.
A subsequent durable capture occurred after the parent had restored the Option-only source/object, so `round3-map-stage-size-audit-disassembly.txt` contains only Option and explicitly records that timing.
The combined-trial sizes remain durably recorded in the strict trial log.

No obviously correct alternate boundary was established.
Bianco's extra 12 bytes coincide with the cost of one part of its compound early-return condition, but the UNUSED map cannot determine whether either stage guard belonged outside the original helper, and both guards are present in the original caller.
Moving a guard across the helper boundary solely to reach its size would therefore be speculative.
PinnaBeach needs 16 more bytes; the trial already contains the complete one-warp case and its stage guard, so no missing operation is evident from the caller.
Sirena needs 16 fewer bytes; its trial contains the particle-loaded check, resource load and flag write present in the original caller.
The shared SMS_LoadParticle implementation is marked fabricated, which is a known source of uncertainty, but changing it or deleting operations cannot be justified by this size alone.

No new patch is proposed for these three size mismatches.
The combined patch remains a rejected trial artifact, and the independent Option patch is the only supported extraction from this experiment.

Observed combined-trial instruction detail from the direct tool read:
Bianco has lwz/lbz stage load, compare 5/beq, compare 9/bne plus unconditional exit branch, followed by both factory calls and virtual setup calls.
PinnaBeach has the stage load and compare-zero/branch, then one factory call and virtual setup.
Sirena saves r31 for the loaded-flag address, tests the flag, loads the resource, stores true, then restores r31.
These operations account for the current sizes; there is no extraneous algorithmic operation to remove on evidence presently available.
