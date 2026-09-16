# Independent Round 2 Review

## Verdict

No blocking defect found in the accepted round-2 changes represented by the frozen patch, excluding the rejected BathWaterManager experiment.
The four-method BathWaterManager relocation in this snapshot must not be included in the accepted result.
It has measured matching regressions; the parent confirmed rejection and restoration.
Any later clearHeightMap-only proposal is outside this review.

Reviewed snapshot: `round2-review.patch`.
SHA-256: `a366b4ac7e88ecb5352228b9b1c2fe8459712d809d3f72164f9d59d9e2ea5b0e`.
This review reads the frozen patch, original map, saved object/disassembly evidence, decisions, strict logs, complete matching reports, and build logs.
No builds or source edits were performed by the reviewer.
The reviewer originally proposed the two Player ordering edits, so that portion is a second check rather than an independent author review.
All other changes were authored by other agents or the parent.

## Evidence by Change

| Change | Assessment |
| --- | --- |
| fishoid destructor moved into class | Map line 25547 explicitly marks the destructor weak; text entry 72553 is 0x64 bytes. Existing empty body and virtual declaration are preserved. Pre-change disassembly already matches all destructor instructions. fishoid strict passes, and its complete report equals the upstream baseline. Build log includes fishoid, Butterfly, and MarNameRefGen_Enemy header consumers. |
| Coaster setNormalFlyAnm moved into class | Map line 22957 explicitly marks weak; line 71997 is four bytes. Existing body contains only a comment and compiles to the original blr. Virtual position/signature and setWalkAnm call remain unchanged. Linkage is fixed, three missing symbols remain, and complete report equals baseline. Both known header consumers rebuilt. |
| CubeManagerFast isInOtherCube loses explicit inline | Map line 72446 records this existing UNUSED helper at 0xa4. Body is untouched, emitted size now agrees, and complete report equals baseline. UNUSED binding is unknown, so this establishes a plausible emitting source form, not proof that the original spelling omitted inline. Existing JGeometry ordering failure and another missing symbol remain. |
| intersectLineList loses explicit inline | Map line 66102 records 0x78 UNUSED bytes. Existing body is untouched; strict passes with matching sizes. Complete report equals the immediately preceding accepted report, including all caller scores. Same historical-spelling uncertainty applies as for CubeManagerFast. No force-emission calls or pragmas were added. |
| MapObjCorona order | Existing definitions and stub bodies are moved into reverse original map order, lines 65831 through 65884. This fixes structure but does not implement these functions. Accepted strict log has no order failure; complete report equals baseline. |
| TBathtub getWaterMtx signature | Map line 65868 specifies Fi, int; the prior Fl symbol corresponds to s32, which is typedef signed long in dolphin/types.h. Source and declaration change together. Existing null-return stub is preserved. This fixes one symbol identity and does not claim its behavior or UNUSED size is correct. |
| TBathtub destructor | Map line 39014 explicitly says global. Prior compiler-generated destructor is weak yet already matches all 132 original bytes, including base destruction and conditional deletion. An explicit empty out-of-line destructor preserves that behavior and produces global binding. Its base already has a virtual destructor, so no new virtual slot is introduced. Complete report equals baseline after affected header consumers rebuild. |
| Both getObjAppearPos methods become const | Map lines 36712 and 39311 explicitly use CFv and weak linkage. Text lines 64886 and 65977 give 8 and 12 bytes. Saved original/current disassemblies establish identical getter instructions before changing the mangled names. Base and derived signatures change together, maintaining their override relationship and virtual slots. Both original-named getters now match 100%, and both containing data sections now match 100%. All 16 header consumers appear in the build log. |
| Player order swaps | Original map lines 62930 through 62933 and 63012 through 63018 support the two adjacent source relocations under deferred reverse emission. Existing bodies are unchanged, including the existing checkJumpingThrowStart stub. Both ordering categories clear with whole-report equality against baseline; 17 missing symbols remain across the two units. |

## Independent Verification of Saved Results

Parsed and compared complete JSON reports directly rather than relying only on aggregate measures or the verification summaries.
The fishoid, mariodraw, mariojump, cube, coaster, corona-order, corona-signature, and corona-destructor saved reports each equal the entire upstream baseline report.
The mapcheck-emission report equals the entire mapobj-const report.
Relative to the upstream baseline, those reports change exactly two units: MapObjSirena and MapObjHide.
Their only function changes are the two newly named const getters at 100%.
Their text/data section scores improve; no function, section, or unit regresses.

Read direct strict logs for accepted cases and checked the CubeManagerBase remaining ordering failure against its pre-round-2 log.
The same JGeometry set<float> ordering failure existed before the change; it is not a new regression.
The accepted cases in this snapshot resolve defects even when their translation units remain strict failures for unrelated missing symbols.

## Rejected Experiment and Reporting Limits

The snapshot contains the rejected four-method BathWaterManager relocation because it was frozen during that experiment.
Its verification file records makeHeightMap and calcCoord losing their matches through disappearance, makeNormalMap disappearing, and render falling from 93.83205% to 51.297237%.
Matched code falls by 1,348 bytes.
Excluding that change is necessary to preserve the claimed absence of matching regressions.
CameraMultiPlayer's rejected inline experiment is absent from the snapshot, as expected.

The getter corrections increase the tool's matched-data total by 8,784 bytes because two entire data sections become fully matched.
This must not be described as reconstructing 8,784 previously unknown bytes of data.
The improvement comes from corrected symbol references in existing data.
Likewise, MapObjCorona source reordering and its int signature correction do not implement its existing stubs.

The frozen patch does not alter middleware, SDK, runtime, THPPlayer, build flags, validator code, or baseline exemptions.
Final full strict inventory remains the parent's acceptance step because shared-header changes can affect translation units beyond the directly audited strict logs.
