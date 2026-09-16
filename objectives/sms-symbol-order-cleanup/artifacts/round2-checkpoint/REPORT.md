# SMS Strict Symbol Validation Cleanup

## Result

Twelve formerly failing translation units now pass the unchanged strict validator, and nine more have verified partial improvements.
Round 2 used five sub-agents for independent audits, followed by parent review and serial integration.
It adds three fully passing files and nine partial improvements: six missing-symbol fixes, five linkage fixes, and ordering fixes in three files.
Across both rounds, the cleanup fixes 20 linkage mismatches, nine missing symbols, and ordering in six files.
No strict failures increased anywhere in the 736-unit scan, and no previously reported function or section lost matching accuracy.
Three additional functions now match, adding 784 matched code bytes.
The final DOL passes the repository SHA-1 check.

Review the [source patch](artifacts/sms-symbol-order-cleanup.patch) and [736-file case ledger](artifacts/case-ledger.csv).
The [machine-readable comparison](artifacts/comparison.json) contains the counts and matching measures.
Changes remain uncommitted in the independent clone `/Users/Ford/sms-symbol-order-20260915`, on branch `cleanup/strict-symbol-order`.
No PR was opened or updated.

## Baseline and Final Inventory

Baseline is upstream `doldecomp/sms` commit `ab00c3c9a466152f6e6bc5b9c28aca959d1a8454`, fetched on 2026-09-15.
All 736 tracked source units have build configurations and were compiled.
There are no unconfigured tracked source files.
The original GMSJ01 map was extracted from a copied disc image.
Toolchain, assets, build output, and Wine prefix are independent of the live checkout.

| Strict measure | Upstream baseline | After round 1 | Final | Round 2 resolved |
|---|---:|---:|---:|---:|
| Passing files | 440 | 449 | 452 | +3 |
| Failing files | 281 | 272 | 269 | 3 |
| Could not validate | 15 | 15 | 15 | 0 |
| Missing symbols | 4,532 | 4,529 | 4,523 | 6 |
| Files with ordering errors | 20 | 17 | 14 | 3 |
| Linkage mismatches | 61 | 46 | 41 | 5 |

Categories overlap; missing and linkage figures count symbols, while ordering counts files.
These are raw strict results, including known generated-name limitations.
No CI exemptions from PR #162 were used.

Of the 382 editable game units, failures fell from 145 to 133 and passes rose from 235 to 247; two retain coverage errors.
The other 354 units include SDK/runtime, JSystem, and THPPlayer; all their results are unchanged.
The build's own “game” category includes five THPPlayer units, which this audit classifies as restricted under AGENTS.md.

## Fixed Cases

All paths below are relative to the SMS clone.
The round-1 rows below pass the direct upstream strict checker; existing advisory warnings may remain.
The map evidence is saved in [accepted-map-evidence.txt](artifacts/accepted-map-evidence.txt) and [linkage-map-evidence.txt](artifacts/linkage-map-evidence.txt).

| Translation unit | Change | Verification |
|---|---|---|
| `Strategic/liveinterp.cpp` | Make ten script callbacks `static`, matching the map's local binding | Byte-identical `.text`; strict pass |
| `Player/Yoshi.cpp` | Make `YoshiHeadCtrl` static | Byte-identical `.text`; strict pass |
| `Enemy/namekuri.cpp` | Make both NameKuri joint callbacks static | Byte-identical `.text`; strict pass |
| `System/ParamInst.cpp` | Restore explicit `u16`, `JDrama::TFlagT<u16>`, and `JDrama::TFlagT<u32>` specializations | All three emitted sizes equal the map's `0x54`; strict pass |
| `NPC/NpcEvent.cpp` | Swap the two existing force-talk callback definitions | Correct non-weak order; strict pass |
| `NPC/NpcManager.cpp` | Reposition four manager methods and the Mare base constructor | Exact symbol order; strict pass |
| `Enemy/bossManta.cpp` | Group singleton accessors before the execute definitions instead of interleaving them through `DEFINE_NERVE` | Same bodies; exact symbol order; strict pass |
| `MarioUtil/MtxUtil.cpp` | Move the existing empty `TRopePoint` constructor into its game-header class definition | Emits weak binding; affected consumers rebuilt; strict pass |
| `Enemy/hamukuri.cpp` | Move the existing `TDoroHamuKuri::onHaveCap` body into its class definition | Emits weak binding; affected consumers rebuilt; strict pass |

The combined patch changes 19 translation units and seven game headers.
Callback references were searched across source and headers and are confined to their defining files.
No function algorithms were invented or changed.
The ParamInst body contains a pre-existing, explicitly marked fakematch buffer; this cleanup leaves that body untouched and does not claim to validate its source authenticity.

## Accepted Round 2 Changes

Each change was reviewed against original-map evidence, compiled, checked with the unchanged strict validator, and compared through `ninja changes_all`.
All header consumers rebuilt.
A file listed as partially improved still has strict failures; these are not counted as fully fixed files.

| Unit | Accepted change | Final strict outcome |
|---|---|---|
| `Animal/fishoid` | Move unchanged, already-matching destructor into its class, producing map-required weak binding | Pass |
| `Map/MapCheck` | Remove explicit inline from existing `intersectLineList`; emitted size is map-exact 0x78 and caller matching is unchanged | Pass |
| `MoveBG/MapObjSirena` | Correct base virtual getter to const, preserving its exact instructions | Pass |
| `MoveBG/MapObjHide` | Correct matching getter override to const at the same time | One missing symbol remains |
| `Camera/CubeManagerBase` | Remove explicit inline from existing helper; emitted size is map-exact 0xa4 and caller matching is unchanged | One missing symbol and existing template-order error remain |
| `Enemy/coasterkiller` | Move existing empty, matching virtual callback into its class | Three missing symbols remain |
| `Map/Map` | Move existing matching destructor into its class; rebuild 61 source consumers | Seven missing symbols remain |
| `Map/BathWaterManager` | Move only existing `clearHeightMap` into its TU-local class | One missing symbol, three linkage mismatches, and ordering remain |
| `MoveBG/MapObjCorona` | Reorder existing definitions, correct int-versus-long signature, and explicitly define the already-matching destructor out of line | 39 missing symbols remain |
| `Player/MarioDraw` | Swap existing `loadAnm` and `loadBas` definitions | 14 missing symbols remain |
| `Player/MarioJump` | Relocate existing `checkJumpingThrowStart` definition | Three missing symbols remain |
| `System/MarNameRefGen` | Restore two existing game-header includes that produce the original 764-byte static initializer exactly | Five missing symbols, 15 linkage mismatches, and template ordering remain |

Evidence and dispositions are in [round2-decisions.json](artifacts/round2-decisions.json) and the six `round2-*.md` audit reports.
The [independent review](artifacts/round2-independent-review.md) covers a frozen intermediate snapshot and explicitly excludes the rejected four-method bath trial.
The parent additionally reviewed the final single-method bath change, TMap destructor, and exact initializer output.
The final full-scan and matching evidence covers every accepted change.

The method bodies and existing stubs are preserved.
The explicit destructor reproduces the compiler-generated destructor that already matched all 132 bytes.
Correcting the Corona signature does not implement its existing null-return stub; its map-size warning is now visible under the corrected name.
Removing explicit inline in CubeManagerBase and MapCheck is a plausible source form supported by emission size and unchanged callers, not proof of the original spelling.

## Rejected Trials

| Trial | Measured reason for rejection | Final disposition |
|---|---|---|
| CameraMultiPlayer helper emission | Strict pass, but matching caller falls from 100% to 14.4% | Fully reverted |
| Four bath-renderer methods moved in-class | Three emitted functions disappear; render falls from 93.8% to 51.3% | Reverted; independently accepted only clearHeightMap |
| Five explicit MarNameRefGen class instantiations | Linkage errors stay at 15, missing symbols rise from six to nine, and 1,360 matched code bytes are lost | Fully reverted |
| Sun helper moved into header | A missing conversion helper appears, but the moved method disappears and perform falls from 92.2% to 67.7% | Fully reverted |

Every rejected trial retains its patch, strict log, full report and changes_all output for future investigation.
None appears in the combined patch.

## Matching and Build Verification

`ninja baseline` completed before the first source edit.
Each logical change was rebuilt and checked with the strict validator, followed by `ninja changes_all` for regression checks.
Header changes rebuilt all affected consumers through Ninja.

The final report has no per-function, per-section, or per-unit matching regression against the preserved upstream baseline.
The three gained functions are the two const getters and the 764-byte static initializer.
All other function scores are unchanged.

| Measure | Baseline | Final | Gain |
|---|---:|---:|---:|
| Matched functions | 8,236 | 8,239 | 3 |
| Matched code bytes | 1,406,020 | 1,406,804 | 784 |
| Matched data bytes | 359,043 | 368,015 | 8,972 |

The data gain includes two existing data sections becoming fully matched through corrected symbol references, plus restored initializer BSS/ctors.
It does not mean 8,972 previously unknown data bytes were reconstructed.
Round 1 remains preserved in `artifacts/round1-checkpoint/`.
The comparison script now permits measured gains while asserting zero regressions for every target function and section; the upstream strict validator is unchanged.

The final `ninja -j4` link and SHA check pass.
DOL SHA-1: `9f5a8caf56f5356aeac9d3ed28bf8de976a03625`.
The strict comparison detects no new missing symbols, linkage mismatches, ordering errors, or execution errors.
`git diff --check` passes, and the patch was checked for application against the clean index and reverse application against the working tree.

Evidence is in [final-build.log](artifacts/final-build.log), [final-report_changes.json](artifacts/final-report_changes.json), and the complete `baseline-strict/` and `final-strict/` directories.
Batch logs use `batch1-`, `paraminst-`, `npc-event-`, `npc-manager-`, `boss-manta-`, `rope-point-`, and `doro-cap-` prefixes.

## Remaining Cases

The 269 remaining failing files comprise 136 restricted-library files, 59 empty game files, and 74 nonempty game files.
The 15 coverage errors are separate.
The [case ledger](artifacts/case-ledger.csv) records every file's baseline/final categories, scope, assessment, and raw log paths, distinguishing full fixes from partial improvements.
“Remaining” does not assert that every finding is a source defect; unaudited entries explicitly require map/compiler review.

1. **Empty sources:** 59 game files account for 3,321 missing symbols.
   These are unfinished decompilation, not ordering cleanup.
   The exact files are in [empty-source-baseline.json](artifacts/empty-source-baseline.json).
2. **Other incomplete bodies or emission:** `ToolData.cpp` has eleven absent UNUSED functions, and other files lack linked helpers or dead code.
   Map signatures and sizes alone do not justify fabricated bodies.
   Reconstruct each from caller behavior and original assembly where available.
3. **Restricted libraries:** 136 failing SDK/runtime, JSystem, or THPPlayer files remain unchanged, with 891 missing symbols, seven ordering failures, and 17 linkage mismatches.
   Autonomous edits are prohibited by SMS AGENTS.md.

Passing symbol validation is not proof that a function matches.
Existing placeholder bodies and UNUSED-size warnings remain outside these accepted corrections.

## Uncertain and Validator Findings

### Generated Local-Class Names in ShadowUtil

All twelve MISSING reports in `MarioUtil/ShadowUtil` have unique compiled counterparts.
`TCylinder` and `TSetup1` through `TSetup5` exist as local classes in the source.
Map IDs 2171, 2172, 2190, 2195, 2207, and 2216 correspond to compiled IDs 884, 885, 903, 908, 920, and 929: a uniform offset of 1287.
The IDs advanced by two after the game-header change; all twelve exact-size weak counterparts remain present.
The earlier audit is preserved under `round1-checkpoint/`.
Each class's destructor and `makeDL` method is emitted as a weak symbol.

This is a literal-name comparison limitation, not twelve absent implementations.
Evidence: [shadowutil-generated-name-audit.json](artifacts/shadowutil-generated-name-audit.json).
The raw strict counts retain these failures; no compiler-name normalization was added.
The unresolved validator question is how to identify generated local-class symbols without conflating different local classes; no normalization or exemption was added here.
Function-body accuracy is a separate matching question.

### Fifteen Unresolvable Map Units

The validator only resolves TUs in the map's `.text` layout.
Fifteen units cannot be resolved by that procedure, including the data-only game files `MarioUtil/RumbleData` and `Camera/CamShakeDefine`.
These are explicit coverage errors, not passes and not evidence of missing source functions.
The other thirteen are in restricted libraries.
Evidence: [map-resolution-audit.json](artifacts/map-resolution-audit.json) and the corresponding strict logs.
A future checker change should distinguish a verified absence of function entries from unresolved TU mapping; this cleanup does not alter that policy.

### Compiler-Controlled Template Emission

`Map/MapMirror` and `MoveBG/MapObjLib` report ordering errors involving the emitted JGeometry `set<f>` specialization.
Their ordinary source function order alone does not explain that position.
`GC2D/PauseMenu2` also has two map-weak methods currently emitted as global, combined with template ordering.
The unresolved question is which original inline or first-use context produced the map order, and whether moving method bodies preserves callers' code generation.
These files retain their strict failures; no arbitrary calls or pragmas were added to steer emission.
Evidence is in their full baseline/final strict logs.

### Guide and Platform Caveats

The guide contains contradictory statements about UNUSED binding.
The map does not encode deadstripped binding, and the current checker correctly skips UNUSED linkage.
The UNUSED marker alone does not justify forcing a function out of line.

On macOS, use the checker's supported `NM` override because its default path ends in `nm.exe`.
`main` and `JSystem/JSupport/JSUList` passed as setup controls.
A source-order screening script incorrectly flagged `MathUtil`; its actual compiled symbols passed, so no change was made there.

## Reproduction and Handoff

In `/Users/Ford/sms-symbol-order-20260915`:

```sh
export WINEPREFIX=/Users/Ford/sms-symbol-order-20260915/.wine-audit
export WINEDEBUG=-all
export NM="$PWD/build/binutils/powerpc-eabi-nm"
ninja -j4 changes_all
python3 tools/validate-symbol-order.py -u mario/System/ParamInst
```

Do not rerun `ninja baseline` on the patched tree unless intentionally replacing the reference.
The original report and objects are preserved under `artifacts/baseline-report.json` and `artifacts/baseline-objects/`.
The fixed head, map/tool/compiler hashes, configure arguments, and environment are in [environment.json](artifacts/environment.json).

From the harness root, rerun the full scan and regenerate the comparison:

```sh
python3 objectives/sms-symbol-order-cleanup/scripts/inventory.py \
  --output objectives/sms-symbol-order-cleanup/artifacts/final-strict
python3 objectives/sms-symbol-order-cleanup/scripts/summarize.py
```

The inventory saves one raw strict subprocess result and object/map/tool fingerprint per TU.
Rerunning skips identical objects and rechecks changed ones; `status.json` records progress.
`verify_batch.py <tag> [units...]` saves serial candidate build, strict, and full matching evidence.
Do not rerun it on an unreviewed candidate without first inspecting its source diff and evidence.
The audit-only `--wait-for-objects` option was used during the initial build, and final results were checked after all compilation completed.

Wine initialization initially left two Ninja output pipes open through background services.
The isolated build was paused, its Wine services restarted with output redirected to durable files, and the build resumed successfully.
Only this clone's Wine prefix was controlled and it was stopped at handoff.
Before a future rebuild, initialize Wine outside Ninja with output redirected to a file so its background services cannot inherit Ninja output pipes.

The live SMS checkout, worker checkouts, queues, runtime state, and configuration were not changed.
No code, configuration, or validator changes from PR #161 or #162 were imported.
The harness's unrelated working-tree changes remain untouched; this objective folder is the only new harness content.
