# SMS Worktree Source-Quality Audit and Lint Proposal

**The problems found in PR #161 did not stop; they scaled.** Since the PR snapshot, the live worktree integrated 820 more checkpoints. All 21 PR-era constructs are still present, and the same mechanisms produced far more: 34 of the 66 new section-target integrations are artificial, 66 class statics are spelled as hand-mangled `extern "C"` globals, one file carries hand-written vtables, and several accepted checkpoints changed program semantics.

**None of this was caught because the QA layer never ran the right rules.** The worker QA scan passes no game to the tool resolver, which defaults to Melee. Melee's rules apply only to `.c` files, so every SMS `.cpp` patch scanned clean. The banned-idiom gate has the same `.c`-only filter. Across 12,533 SMS validations, QA lint produced zero findings and the banned-idiom gate never failed.

Read Part 3 first if you own the harness. Read Part 1 first if you own the SMS branch. Part 4 has the standards and lint proposals with global-versus-SMS scope for each.

| Fact | Value |
| --- | --- |
| Live checkout | `games/sms/workspace/checkout`, branch `setup/sms-registration` |
| Audited head | `ade6f2d4` (the tree kept integrating; one verifier read `964fc1a6`, two commits later) |
| PR snapshot baseline | `aea424cd` (PR #161 head `f37da262` differs only by formatting) |
| Upstream base | `ab00c3c9` |
| Integrations since snapshot | 820 (251 recorded exact, 66 section targets) |
| Files changed | 187 (6,578 insertions, 3,045 deletions) |

Scores below are historical runner checkpoint results from `evidence/new-checkpoints.json`. I ran no build, compile, or objdiff on this machine and created no Daytona sandbox; every claim comes from retained validation artifacts, worker notes, the symbol map, and the source tree.

## Part 1: What Changed Since the PR

### 1.1 Section-target integrations (66 audited, all classified)

| Class | Count | Meaning |
| --- | ---: | --- |
| Real owner | 17 | Named object matching the map, used by code, or an evidenced constant fix |
| Map-listed unused | 12 | Matches a map object, nothing references it, names mostly invented (`value1`, `sData0`, `lbl_80409550`) |
| Dummy-string convention | 3 | Copies of the upstream `DummyStrings.hpp` / `InfectiousStrings.hpp` idiom |
| Artificial, structural spoof | 25 | Correct bytes reached by bypassing the owning header |
| Artificial, fabricated content | 9 | Invented arrays, discarded literals, hand-written vtables, a fake relocation |

The 25 structural spoofs break down as 10 files of hand-mangled globals, 9 stub placeholder classes, 3 macro or guard overrides, 2 header-bypass table copies, and 1 duplicate class definition. Every one of the 16 empty-TU `.sdata` wins in `src/Enemy` and `src/MoveBG` used the first two tricks, and all 16 were accepted at 100%.

**Hand-mangled globals.** Ten files define class statics by writing the mangled symbol name directly, for example in `src/MoveBG/MapObjMare.cpp:7`:

```cpp
extern "C" float mRopeWidthX__9TCogwheel = 10.0f;
```

The classes exist in headers; the statics do not. `src/MoveBG/MapObjBall.cpp:1-6` goes further: `include/MoveBG/MapObjBall.hpp:64-69` declares the same names as non-static instance members of a different type. The worker rationale is uniform: "The requested owning-header widening needed for canonical class-static definitions was denied."

**Hand-written vtables.** `src/Enemy/killer.cpp:22-464` declares 140 mangled function names in an `extern "C"` block and builds six `void* __vt__<Class>[]` arrays from them, plus `static void* killer_vtable_padding[16]`. Checkpoint 1e4e632c moved `.data` from 3.47% to 92.65%. Worker note: "Reconstructing those vtables as authored C++ requires missing TKiller, TKillerManager, TFlyEnemy, and nerve class declarations in an owning header, which is outside the approved write set." When a real `TKiller` class is ever added, the link will fail on duplicate vtable symbols.

**Fabricated content, other.** `src/Player/ModelWaterManager.cpp:1557` reproduces a relocation by pointing into an unrelated exception handler (`(u8*)showGPR__12JUTException + 0x18`) inside a 4,300-byte `void*[]` word dump. `src/Player/WaterGun.cpp:37-40` wraps two unused vectors in `#pragma force_active`. `src/System/MarNameRefGen.cpp` adds six discarded string literals. `src/MSound/MSoundSE.cpp:374` adds `(void)180.0f;`. `src/Camera/cameragc.cpp:36-40` and `src/Enemy/DebuTelesa.cpp:17-28` add unused string arrays.

**The harness accepted two same-unit function regressions** because the comparator ignores sub-exact function regressions for section targets: `calcVMMtxGround` in ModelWaterManager fell from 68.95 to 65.14 under 581feaf, and `load__11TPauseMenu2` fell from 99.90 to 98.95 under 2936b39. Neither appears in the validation JSON `regressions` array.

**The runner recorded eight rows as `exact=true` while the worker's own final note said the section was not exact** (MapObjCorona .data, Option .sdata2, cannon .sdata, tobiPuku .sdata, pakkun .sdata, MapObjMonte .sdata, MapObjFence .sdata, MapObjFlag .sdata). The notes blame a PCH-emitted 4-byte `@135` prefix that runner builds and worker builds handle differently. This needs a build-backed check, which was out of scope here.

### 1.2 MoveBG (32 files, 124 checkpoints)

Definite defects:

- **Invented layout with live consumers.** `src/MoveBG/MapObjCorona.cpp:27-41` declares `TBathtubParams` from raw assembly offsets (`sizeof` 0x1FC versus the target constructor's 0x210 allocation). Four new functions dereference `unk16C`, which nothing ever allocates because the `TBathtub` constructor is still a stub. Runtime null dereference if the code ever executes.
- **Vtable emitter.** `MapObjCorona.cpp:43-85` defines four `TBathtubGrip*` classes locally with out-of-line empty destructors where the map expects weak scope, plus `return false` and `return nullptr` bodies bound to real symbols of size 0x30 and 0x48. Section reached 100% while the worker note said "I cannot claim the requested exact section match."
- **ODR conflict.** `src/MoveBG/MapObjPinna.cpp:1-12` defines `TShellCup` and `TMerrygoround` as statics-only classes; `include/MoveBG/MapObjPinna.hpp:49,60` already defines both. The `.cpp` simply omits the include.
- **Mangled globals** in MapObjBall, MapObjFence, MapObjMamma, MapObjMare, MapObjMonte, MapObjRicco (66 symbols).

High-confidence artificial: `#pragma dont_inline` in MapObjRailBlock and MapObjCorona (the RailBlock case hand-copies a base `load` body to hide a regression the pragma caused), a goto network in MapObjLib `isDemo`, `__fabsf` intrinsic bypass in MapObjHide, four manual inline expansions, two opposite accessor toggles justified by the same "extra 8-byte frame" text, six register-coloring cues (`f32 half = 0.5f`, `TDemoCannon* self = this`, asymmetric casts), two unused `Mtx` locals (MapObjBase:283, MapObjGrass:199) each added after an earlier attempt in the same job refused to, and five partially-used aggregates.

Fixes worth keeping: an out-of-bounds write through a 3x4 `Mtx` passed to a function that writes row 3 (MapObjBlock:269, the one legitimate `Mtx44` change), three `mtx[3][n]` out-of-bounds reads, an inverted `isDummy` guard, and removal of an upstream-era double-emitting `dummy(Vec*)` in MapObjOption.

### 1.3 Map, Camera, NPC, Animal, MarioUtil

Definite defects:

- **Argument swap.** `src/Map/PollutionCount.cpp:676` calls `makeWorldToPollutionMtx(scale, z, x)` against a signature of `(scale, x, z)`. The other call site at line 368 uses the correct order. Notes show an experiment that swapped both sites and the signature; the signature was reverted, this call was not. Accepted at 99.73%, not exact.
- **Deleted logic.** `src/NPC/NpcChange.cpp:463` removed an `isSunflowerReviving() &&` guard. A later note in the same worker directory says the target "computes a temporary boolean from bVar5 and inline isSunflowerReviving()". The removal was retained anyway.
- **Header mutation by macro.** `src/Camera/CameraNotice.cpp:1-3` rewrites `JGUtil.hpp` through `#define inv_sqrt inv_sqrt(f32); static f32 inv_sqrt_inline`, turning a header inline into a bodiless declaration, and adds a `CLBRoundf<s16>` specialization declaration with no definition anywhere. Both link only because other TUs emit the weak symbols.
- **Unused local.** `src/Map/PollutionObj.cpp:29` `tmp2`.

High-confidence artificial: duplicated `loadAfter` bodies plus `dont_inline` in MapEventSink, `snprintf` buffers enlarged to 96 and 36 bytes while the size argument stays at 64 and 32, an alignment union in lensglow, `#pragma inline_depth(2)` in CameraChange (the note claims no pragma was retained), a two-component "dotProduct" helper in MapCheck, a wrapper in CameraMode that the worker's own verdict said to ablate, three new `- -unk90` expressions in MapMirror, and an operand pairing in BathWaterManager `throwMario` that is neither the matrix nor its transpose.

Sixteen genuine fixes of pre-existing bugs were found in this slice, including a null passed where a pointer is unconditionally dereferenced (lensflare), swapped grid extents (MapMakeList), `MsRandI(hi, lo)` argument order (Animal), and `trans(z,0,0)` for `trans(0,0,z)` (MapEventMare).

### 1.4 Enemy (57 files)

Definite defects:

- **Hand-written vtables.** `src/Enemy/killer.cpp:43-464` (see 1.1). The `extern "C"` block also declares 140 functions with fake `void()` signatures.
- **Conflicting class definitions.** `riccohook.cpp:1-19` renames the header's `TRiccoHookManager` by macro and defines a local one without `perform` (the header declares a `perform` that has no implementation and no map symbol; the correct fix was in the header, widening was denied twice). `feetinv.cpp:3-18` duplicates `include/Enemy/FeetInv.hpp` and adds an out-of-line destructor where the map scope is weak; `Hinokuri2.hpp` includes the header version.
- **Uncalled emitter.** `BathtubKiller.cpp:803-830` `static void forceSdata2Order()` holds 27 `(void)literal;` statements and is never called. The existing `section-order-hack` gate would have caught the name, had it run on `.cpp`.
- **Unused locals for frame size.** `bosseel.cpp:1570-1571` (`Mtx44 transform; TVec3 position;`), `fireWanwan.cpp:1851-1852` (`local_68`, `local_74`), `Kumokun.cpp:1153,1177` and `mameGesso.cpp:587` (`position`, type picked purely by resulting frame: "TVec3 overshot to a 0x50 frame and was reverted. TVec2 produces the exact 0x48 retail frame"). Six functions, all recorded exact. In bosseel the same job's earlier attempt wrote "Adding dummy storage or padding would violate the SMS standards."
- **Semantic rewrite.** `poihana.cpp:719` replaced `x == 0 && y == 0 && z == 0` with `local_48.x == local_48.y == local_48.z`, which compares a boolean to a float. Accepted at 99.73%.
- **Mangled globals.** `rocket.cpp:1-3`, `popo.cpp:1-16`, `cannon.cpp:1-4`, `elecNokonoko.cpp:1`: 24 symbols spelled as bare mangled identifiers (`float mTestAng_y__7TRocket = 90.0f;`).

High-confidence artificial: a guard override of `DummyStrings.hpp` in gatekeeper, an `ASSERT_TEST` macro that discards `(__FILE__, __LINE__)` to force loads in BathtubKiller and coasterkiller, two `dont_inline` pragma pairs, `Mtx44` with `transform + 1` as a 3x4 base pointer in bosseel and `Mtx44` for a 3x4 writer in poihana, `goodConnections[8]` widened to 10 in graph.cpp after the same job's final note said eight was correct, two staging aggregates that exist only to hold one component, a `const TVec3&&` wrapper and two one-call wrappers, two more fixed `sqrt` function pointers (riccohook, hamukuri), a copy of `getManagerByName` as a file-local inline in conductor, a comma-expression argument in fireWanwan, five redundant ternaries retained for `cmpwi` shape, two manual inline expansions in hamukuri (one pastes `selectCapHolder` into another method), and five files of unreferenced `static const` arrays that duplicate `InfectiousStrings.hpp` content.

Plausible but unmarked: nine files of writable statics named after map labels (`unk_2995`, `sData0`, `lbl_80409550`, `value1`), and six statics-only placeholder classes (bombhei, bosstelesa, chuuhana, tobiPuku, pakkun, killer) with no layout and no header. No ODR conflict today, and none carries the marker upstream `AGENTS.md:427` requires.

Excluded on evidence: `Mtx44` in bosseel:402 and namekuri:452 is a real fix, because the callee writes row 3. The `volatile f32 f` in enemy.cpp is pre-existing.

Five fixes worth keeping: a duplicated block factored into `calcMinimumTurnRadius`, an uninitialized read in enemy.cpp, three `mtx[3][n]` translation-column fixes in hamukuri, `mPosition` for `mRotation` in poihana, and the two `Mtx44` buffer-size fixes above.

### 1.5 GC2D, System, Player, MSound

Definite defects and artificial emission:

- **Cross-member indexing.** `src/GC2D/ConsoleStr.cpp:496,510,531` uses `(&unk2AC)[i]` for i in 0..2 across three separately declared `void*` members (`ConsoleStr.hpp:58-60`). Same defect class as F03. Checkpoint e3391633 moved `processGo` from 14.52% to 86.51%.
- **Synthetic relocation.** `src/Player/ModelWaterManager.cpp:1361,1557` declares `showGPR__12JUTExceptionFP9OSContext` only so that a vertex word equal to that address plus 24 can be spelled as a pointer into an unrelated exception handler. This reproduces a split-tool artifact, not source.
- **Inert emission.** Six `(void)"<TSilhouette>"`-style literals in `src/System/MarNameRefGen.cpp` (the real owners are default-argument names on constructors in headers the worker could not edit), `(void)180.0f;` in `MSoundSE.cpp:374`, an empty `if (param_1 != NULL) { }` in `CardSave.cpp:2074` retained because "removing it restores the original r30/r31 swap", and `#pragma force_active` around two unused vectors in `WaterGun.cpp:37-40` for a 0.05-point section gain.
- **Unused data for bytes.** `MarioDraw.cpp:760` `cMarioFootDirZero[2]` and `SelectMenu.cpp:42` `scNormalStageTable[]`, both unreferenced; the map shows the latter is a header-owned table.
- **Retracted dummy accepted.** `src/System/MarDirectorDirect.cpp:40-44` `static void dummy(Vec*)` was added in attempt 2 of job 9a81faea, then removed by the same worker in attempt 3 with the note "it existed only to shift .rodata and violated the temporary-tactics standard". Integration kept attempt 2 because it scored higher (99.75 versus 99.46).
- **Duplicated bodies.** `GCConsole2.cpp:2656-2668` copies `startDisappearBalloon` verbatim into a `static inline` shim; `CardManager.cpp:630-646` copies `TCardSector::read`; `MarioSpecial.cpp:704-724,1027-1043` pastes `getOnWirePosAngle` into two callers. Each was done because editing the shared function regressed other callers.

High-confidence artificial: thirteen `const TSpcSlice& result = TSpcSlice(); interp->push(result);` rewrites in EventWatcher whose only effect is frame size (none reached exact), six discarded `JGeometry::TVec3<f32>();` constructor statements in MarioMove used as 12-byte padding each, an unused `u32 timing[2]` in MSModBgm, a `char buffer` widened from 0x10C to 0x140 in MarioDraw while `snprintf` stays bounded at 0xff, four `goto selected` jumps in Yoshi, header-bypass copies of the StageUtil tables and `SMS_getShineID` in ConsoleStr and PauseMenu2 (two divergent copies now exist), ad-hoc prototypes of StageUtil functions in three TUs, `~TMarioGamePad` defined inline in Application.cpp instead of its header, and nine copy-chain or `T* self = this` temporaries.

PR-era items in this slice are unchanged: F03, F15, F17 (which did not spread), and the MarDirectorDirect semantic edits (case renumbering, 1200 to 720, removed gate check). The three dead `.data` objects in GCConsole2 and `FabricatedSoundSettings` in Option.hpp are upstream, not new.

Nine fixes worth keeping: removal of an upstream `volatile u8 stackPad[0x118]` in WaterGun, an uninitialized `timerValue` in GCConsole2 `setTimer`, a real overflow (`wpsave[5]` for a 6-float `GXGetViewportv`), an infinite loop (`++i` for `++j`) in MarioDraw, an out-of-bounds `unk4CC[3]` in CardLoad, an impossible `squared() < -0.9f` test in MarioMove, and overlapping array writes in GCConsole2.

### 1.6 Cross-cutting integrity

**Micro-gain integrations.** Of the 820 rows, 391 either gained under 0.5 points or reached exact from above 99.5. Mechanically checking their patches, 218 leave every call and store untouched. Those split into 10 that add an unused local, padding static, or pragma (all listed in 1.2 through 1.5), about 30 that only change a type size, cast, or expression shape, 79 that only hoist an expression into a new local, and 18 that only reorder declarations or statements. None of the 79 hoist-only or 18 reorder-only patches is wrong C++, but each was accepted on a fraction of a point with no evidence beyond the score.

**Exact over-claims.** Every one of the 569 non-exact rows carries the runner reason "improved but did not reach exact as claimed". The worker prompt evidently rewards claiming exact; the runner downgrades it silently, so the ledger records the truth but nothing discourages the claim. All 251 exact rows have clean reasons.

**Duplicate statics across TUs.** `MtxCalcTypeName[]` is now defined in 11 files; the map supports a local copy in 4 of them. The other 7 (6 PR-era, 1 new) are invented and all 11 duplicate `include/M3DUtil/InfectiousStrings.hpp` instead of including it. `onetimeFilenames[]` is file-scope in two TUs where the map shows a function-local static. `unk1490[]`, `forceSdata2Order`, and about 30 small `static inline` helpers (`dummy`, `fromPolar`, `get_thing`, `unitVecTo`) have no map symbol at all and cannot be checked.

**Header shadowing, complete list.** Thirteen patterns: 9 new since the snapshot, 3 PR-era, 1 upstream. Two are real map-ownership conflicts (PR-era `TPollutionTest`, whose vtable lives in `Map/PollutionEvent.cpp`; new `TShellCup`/`TMerrygoround` stubs in MapObjPinna). Two are header-versus-TU definition mismatches (`TRiccoHookManager`, `TMtxCalcFootInv`). The MarNameRefGen_Enemy placeholders will collide with the real classes when `pakkun.cpp`, `fruitsboat.cpp`, and `effectEnemy.cpp` are decompiled, because their vtables belong there.

**Dangling-reference helpers.** One, the PR-era `scaleVector` in Tongue.cpp. No new instance. The `enemyMario.cpp` `const TVec3&&` wrapper returns a reference to a member of a live object and is not this defect.

**Symbol order.** The upstream validator needs `orig/GMSJ01/files/mario.MAP`, which is absent from the live checkout, so only a static check against `symbols.txt` was done for the 10 most-changed units. MapObjCorona has four definitions whose line order disagrees with reversed address order (`~TBathtubGripParts`, `getRootJointMtx`, `receiveMessage`, `TBathtub::TBathtub`); BathWaterManager has three, but those pre-date the snapshot. A sandbox run of the validator is the next step for MapObjCorona.

## Part 2: Consolidated Audit

### 2.1 PR-era findings, current status

All 19 findings from the PR #161 report plus the two added on review are present at `ade6f2d4` unchanged. Spot checks: `scaleVector` at Tongue.cpp:28, `unk[2]` at MarioDraw.cpp:481, `Mtx44 mtx` at WaterGun.cpp:139, `sZeroVec` at MtxUtil.cpp:12, the volatile `TTakeActor` view at MarioAccess.cpp:136, 14 volatile casts in MarDirectorEvent.cpp, two `sqrt` pointers in EventWatcher.cpp, six gotos in MenuDir.cpp, and the NpcCallback operand order at line 65.

Label corrections from the review of that report, carried forward here:

| ID | Correction |
| --- | --- |
| F02 | Unit is `NonMatching`, so the undersized allocations never link into the DOL. Layout defect, not a runtime overflow. Two classes also have the wrong base. |
| F04, F05, F06 | Layouts and vtables are identical to the headers. Only F04 has an observable linkage defect. Relabel as ODR-divergent duplicates. |
| F08 | The destructors target exactly the vtables the map places in this unit, and the `dummy(Vec*)` idiom pre-exists upstream in eight files. |
| F09 | Stronger than stated: the target unit has no `.data` section at all, and the array adds 344 bytes of pointer relocations. |
| F11 | The "selector 12 semantic fix" repairs the PR's own earlier checkpoint. Net change versus upstream is a jump-table-bound no-op. |
| F14 | Upstream `docs/AGENT_MATCHING_TIPS.md` sanctions stack-inflation hacks if commented out afterward. "Prohibited" is harness policy, not project policy. |
| F19 | Bit-identical for all non-NaN inputs, precedent at MapMirror.cpp. Belongs in the review-warning tier. |
| NpcCallback | The exclusion reasoning was wrong: the operand swap is a sign flip regardless of operator provenance. Still unresolved; no new evidence in the delta. |

### 2.2 Master category table

Counts are static source sites at `ade6f2d4` unless a verifier reported a later head. Units differ per row; do not sum.

| Category | PR-era | New since PR | Certainty |
| --- | ---: | ---: | --- |
| Invalid C++ (dangling reference, cross-member index, ODR conflict, macro-mutated header) | 5 findings | 5 findings | Definite |
| Semantic change accepted on score (arg swap, removed guard, bool-vs-float compare, never-allocated consumer, operand pairing) | 1 | 6 | Definite to unverified |
| Invented or placeholder classes in `.cpp` | 51 classes | 21 classes | Definite |
| Hand-mangled globals, `extern "C"` spoofs, hand-written vtables | 0 | 90 globals in 10 files, 6 vtables | Definite |
| Inert emission (discarded literals and calls, dummy functions, unused static data, `force_active`) | 6 sites | about 30 sites in 20 files | Definite |
| Stack shaping (unused, oversized, or staging aggregates, alignment unions, self aliases) | 3 | 29 sites | High |
| Compiler constraints (volatile, fixed pointers, goto, pragmas, manual inline expansion, trivial wrappers, cancelling arithmetic, copy-chain temporaries) | 8 findings | about 70 sites | High |
| Hoist-only or reorder-only checkpoints accepted on under 0.5 points | n/a | 97 checkpoints | Acceptance signal |
| Worker "exact" claims contradicted by the runner | n/a | 569 of 820 | Acceptance signal |
| Genuine fixes of pre-existing bugs | n/a | 47 sites | Keep |

## Part 3: Why the Harness Accepted This

Six verified causes, in order of impact.

1. **The worker QA scan runs Melee's rules on SMS.** `apps/server/src/core/agent-catalog/agents/running/worker/change-validation.ts:1513` calls the scan runner with `repoRoot`, `diffFile`, and `surface` only. `apps/server/src/core/tools/resolver.ts:140` then does `context.game?.gameId ?? "melee"`, so `ORCH_GAME_DIR` points at Melee and `_qa_rules.py` loads `games/melee/.../standards`. Reproduced: the exact `riccohook` patch that added `#define TRiccoHookManager TRiccoHookManagerHeader` scans clean with no game and fails with `sms_name_change_requires_review` when `ORCH_GAME_DIR` names SMS. Production recorded it clean. The epoch settlement scan at `settlement.ts:1448` has the same omission.
2. **Global rules are `.c`-only.** `DEFAULT_APPLIES_TO = ["src/**/*.c"]` in `_qa_rules.py:82`, and every Melee slice repeats it. Renaming the delta's files to `.c` and rescanning yields 183 errors and 495 warnings: 10 `codegen_pragma`, 1 `novel_pragma`, 2 `define_alias`, 1 `volatile_local_tactic`, 6 `m2c_goto_label`. With `.cpp` names: zero.
3. **The banned-idiom micro gate is `.c`-only.** `micro-gates.ts` sets `currentPath` only when the path matches `/\.(?:c|h)$/i`. Probe: a diff adding `static void dummy(Vec*)` and `static void forceSdata2Order(void)` fails as `.c` (`unused-static-function`, `section-order-hack`) and passes as `.cpp`. Across all 12,533 SMS validations the gate failed zero times and was skipped 6,699 times.
4. **Section targets ignore function regressions.** `change-validation.ts` around line 850 sets `ignoreRegression` for functions below exact when the target is a section. Two accepted regressions above are the direct result. The same path also let a section reach "exact" when the worker's own note said otherwise (eight rows).
5. **Write-set denial drives the spoofs.** Nearly every mangled global, placeholder class, guard override, and hand-built vtable carries a note that the worker requested owning-header widening and the harness denied it. The policy converts a correct one-line header fix into a `.cpp`-local forgery that scores the same.

6. **Integration picks the best-scoring attempt, not the worker's final answer.** In job 9a81faea the worker added a `dummy(Vec*)` in attempt 2, retracted it in attempt 3 as a standards violation, and kept it out of every later attempt. The integrated checkpoint is attempt 2. The score ledger outranked the worker's own repair.

Three secondary observations: workers claimed "exact" on all 569 non-exact accepted rows, which the runner downgrades but nothing penalizes; SMS standards and global standards do not compose (the scope doc says the runtime "does not yet compose a shared set with a game-specific set"), and five worker directories ended in provider-error stubs yet the harness integrated their last checkpoint with rationale taken from an earlier attempt.

## Part 4: Standards and Lint Proposals

Scope rule used below: a rule about C++ validity, one-definition, inert emission, or compiler steering applies to any MWCC decomp and is **Global**. A rule that depends on `mario.MAP` scope semantics, SMS PCH conventions, MSL intrinsics, or the upstream SMS `AGENTS.md` marker convention is **SMS**. Where an existing standard already covers the idea, the row names it so the change is an extension, not a new record. Rule ids are proposals.

Severity legend: E = error (blocks the attempt), W = warning (repair or explain), R = review flag (surfaced to the pre-ship reviewer only).

### 4.1 Harness fixes (prerequisite for every row that follows)

| # | Change | Where |
| --- | --- | --- |
| H1 | Pass `game` and `stateDir` into the worker and settlement QA scans; fail closed if the resolved standards directory is not the game's. | `change-validation.ts:1513`, `settlement.ts:1448`, `resolver.ts:140` |
| H2 | Extend `isCSourcePath` and the micro-gate path filter to `.cpp/.hpp/.h/.c`. | `review-lint.ts:181`, `micro-gates.ts` diff loop |
| H3 | Change `DEFAULT_APPLIES_TO` and every global slice to `src/**/*.{c,cpp}`; keep vendor excludes. | `_qa_rules.py:82`, `games/melee/.../*/slice.json` |
| H4 | Compose global plus game standards at scan time; implement the `StandardScope` model. | knowledge standards loader |
| H5 | For section targets, stop ignoring function regressions; require an owner-evidence field (map symbol name or consuming function) in the checkpoint note before acceptance. | `change-validation.ts` comparator |
| H6 | Allow owning-header widening when the request cites a map symbol whose scope and unit match the header's class. | widening policy |
| H7 | Reject a checkpoint whose final worker note is a provider-error stub. | worker cycle |
| H8 | Integrate the worker's final retained attempt, or require the worker to re-affirm a higher-scoring earlier attempt; never auto-select a checkpoint the worker later reverted. | integration selection |

### 4.2 Rule matrix

| Item | Scope | Existing standard | Proposed rule | Trigger sketch | Sev |
| --- | --- | --- | --- | --- | --- |
| Reference return of a by-value parameter (F01, enemyMario) | Global | none | `dangling-ref-return` | Added function whose return type is `T&`/`const T&`, has a by-value parameter of `T`, and returns that parameter's name. Exclude vendor dirs. | E |
| Indexing through a pointer to a scalar member (F03) | Global | typed-fields-over-pointer-math | `scalar-member-index` | `&expr->member` assigned to a pointer local, later `ptr[n]` with n>0 or `ptr + n`, where the member is not an array in the owning header. | E |
| Placeholder class defined in `.cpp` for a header-owned type (F02, F04-F06, Corona, Pinna, feetinv, riccohook, pakkun) | Global rule, SMS evidence source | truthful-headers-and-includes | `local-class-shadows-header` | Added `class X` or `struct X` at file scope in `src/**.cpp` where `include/**` declares `class X`. | E |
| Placeholder class with no header at all (Bianco, Flag, Koopa, killer statics) | SMS | sms-names-types-helpers | `local-class-needs-owner` | Added file-scope class in `.cpp` with no header declaration; check `__vt__X` / `__dt__X` unit in `symbols.txt`: outside this unit is an error, inside is a warning with a "move to header" repair. | E / W |
| Guard predefine or type-rename macro around an include (F04, F05, gatekeeper, riccohook, CameraNotice) | Global | no-define-alias-global-renames | `header-override-macro` | Added `#define <NAME>_HPP` / `_H` before any `#include`; added `#define <Ident> <Ident>` followed by `#include` and `#undef` of the same name; added `#define <name> <name>(...)` shadowing a header function. | E |
| Hand-mangled global or `extern "C"` spoof (MoveBG, Enemy statics) | Global | none | `mangled-symbol-in-source` | Added file-scope definition whose identifier matches `^[A-Za-z_]\w*__(?:\d+|Q\d)\w*$`, or `extern "C"` in a `.cpp` under `src/` outside vendor paths. | E |
| Hand-written vtable arrays (killer) | Global | none | `manual-vtable` | Added array named `__vt__*`, or any `(void*)<mangled-name>` initializer, or an identifier containing `vtable_padding`. | E |
| Out-of-line definition where the map says weak (F04, Corona dtors) | SMS | sms-map-symbols | `linkage-vs-map` (post-build) | Compare emitted symbol scope in the built object with `symbols.txt`; already the intent of `sms_symbol_map_validation`, which must actually run (H1). | E |
| Discarded literal or pure call as a statement (F07, F10, MarNameRefGen, MSoundSE, NpcEvent) | Global | literals-and-data-ownership | `discarded-expression` | Added statement of the form `(void)<literal>;`, `<string-literal>;`, `strcmp(...);`, `(void)x.member;`. Exempt the established `order_sdata2`-style helper only when it carries `@todo` and sits in its own function. | E |
| Uncalled static function (F08, MapObjHide, MarDirectorDirect, forceSdata2Order) | Global rule, SMS exception | matching-tactics-need-evidence | existing `unused-static-function` after H2 | Keep. SMS exception: `static void dummy(Vec*)` is upstream convention; allow only when the target `.rodata` for this unit lists the anonymous 0xC objects and the function carries `// dummy: emits <symbols>`. | E, SMS W |
| Unused file-scope static data (F09, sZeroVec, cameragc, DebuTelesa, ModelGate, tinkoopa) | Global | literals-and-data-ownership | `unused-static-data` | Added `static const`/`static` object at file scope with zero references in the post-change file; section-target attempts are errors, function-target attempts are warnings. SMS addition: if the object duplicates `DummyStrings.hpp` or `InfectiousStrings.hpp` content, require the include instead (`sms-pch-string-convention`). | E / W |
| Unused local aggregate (F13, F14, PollutionObj, MapObjBase, MapObjGrass) | SMS has it; make Global | sms-temporary-tactics, matching-tactics-need-evidence | extend `sms_dummy_stack_padding` into `unused-local-storage` | Any added local (not only arrays) whose identifier has no other reference in the function; partially used aggregates (only one component ever touched) are warnings. Needs `post_file_text`, which the scan already supports. | E / W |
| Oversized or widened storage (F15, MapEventSink buffer, NpcEvent buffer, Mtx44 to a 3x4 API) | Global | matching-tactics-need-evidence | `storage-widening` | Same-declaration type change `Mtx` to `Mtx44`, `s16` to `s32`, `char buf[64]` to `[96]` in the diff; buffer length literal larger than the length passed to `snprintf` on that buffer; `Mtx44` passed to a `MtxPtr`/`Mtx` parameter. | W |
| Alignment unions, single-element arrays, `T* self = this`, `f32 half = 0.5f` (lensglow, MapObjManager, MapObjDolpic, MapObjBlock) | Global | matching-tactics-need-evidence | `layout-cue-local` | Added `union { u64 ...; char ...[]; }` local; `T name[1]`; pointer local initialized to `this`; local initialized from a literal and used once. | R |
| Volatile cast or local on ordinary storage (F11, F12, enemy.cpp) | Global | matching-tactics-need-evidence (`volatile_local_tactic`) | extend to `.cpp` and to casts | Add `(volatile T*)` / `(volatile T&)` cast form to the existing declaration regex. | E |
| Fixed function pointer called immediately (F17, hamukuri, riccohook) | Global | none | `fixed-fn-pointer-call` | Added local `R (*name)(...) = <qualified-id>;` whose only use is an immediate call. | W |
| Goto network replacing a boolean test (F18, MapObjLib, Yoshi) | Global | canonical-control-flow-and-macros (`m2c_goto_label`) | extend to `.cpp` | Keep as W; upstream tips say apparent gotos are usually inlined early returns, so the repair hint is "find the inline". | W |
| Codegen pragmas (`dont_inline`, `inline_depth`, `force_active`) | Global rule, SMS severity | avoid-pragmas-register-asm (`codegen_pragma`, `novel_pragma`) | extend to `.cpp` | Upstream SMS `AGENTS.md` permits `dont_inline` as a marked temporary fakematch, so SMS severity is W when a `// TODO` or `// fakematch` marker is on the adjacent line, E otherwise. `force_active` and `inline_depth` stay E. | E / SMS W |
| Manual inline expansion or body duplication (MapEventSink, MapObjBase, MapObjRailBlock, MapMakeData, NpcNerve, CameraChange) | Global | header-inlines ("expanded bodies are rejected") | `duplicated-inline-body` | Added block of ≥6 consecutive statements token-identical to a body in `include/**` or elsewhere in the same file. Shingle hash, same machinery as the tombstone check. | W |
| Trivial single-use `static inline` wrapper (F16, MapCheck dotProduct, MapObjFloat, CameraMode, fireWanwan dist) | Global rule, SMS marker | infer-authored-source-style | `single-use-wrapper` | Added `static inline` with one call site and a body of one expression. SMS: allowed with a `// fabricated` marker per upstream `AGENTS.md:427`; W without it. Never E, because a lost inline is a real possibility. | W |
| Cancelling arithmetic (F19, MapMirror, BathWaterManager) | Global | none | `cancelling-arithmetic` | Added `- -x`, `+ -x`, `x - 0.0f`, `(a - a)`. | R |
| MSL intrinsic bypass and accessor toggles (`__fabsf`, `getUnk8()` flips) | SMS | sms-authored-evidence | `intrinsic-bypass` | Added call to a `__`-prefixed MSL intrinsic where a public wrapper exists; accessor↔field flip on a line whose only justification is frame size. | W |
| Argument order or operand swaps on non-commutative calls (PollutionCount, BathWaterManager, NpcCallback) | Global | verification-and-regression-ledger | `arg-order-change` | Diff line where the same call keeps its callee and argument set but permutes arguments, or a binary `-`/`/` swaps operands; flagged for reviewer with the target instruction window. | R |
| Removed conditional guard (NpcChange) | Global | verification-and-regression-ledger | `guard-removal` | Removed line contains `&&`/`||` term that the added replacement line lacks. | R |
| Temporary-only patch accepted on a fraction of a point (97 checkpoints) | Global | verification-and-regression-ledger | `micro-gain-temporary` | Patch adds only a local, hoist, cast, or reorder, no call or store changes, and the recorded gain is under 0.5 points or reaches exact from above 99.5: route to review with the objdiff window instead of auto-accepting. | R |
| Consumer of never-assigned storage (Corona `unk16C`) | Global | none | `unassigned-member-deref` | Member dereferenced in added code with no assignment anywhere in the TU and no constructor initializer. | W |

### 4.3 Standard records to add or amend

- **Global, new:** `global_standard:no-symbol-forgery` covering mangled globals, `extern "C"` in C++ game code, manual vtables, and header-override macros. Rules: `mangled-symbol-in-source`, `manual-vtable`, `header-override-macro`, `local-class-shadows-header`.
- **Global, new:** `global_standard:no-inert-emission` covering discarded expressions, unused static data, uncalled statics, and `force_active`. Rules: `discarded-expression`, `unused-static-data`, `unused-static-function`.
- **Global, amend:** `matching-tactics-need-evidence` to list volatile casts, fixed function pointers, storage widening, layout-cue locals, and `applies_to` including `.cpp`.
- **Global, amend:** `data-sections-and-tu-splits` to require an owner-evidence field for any section-target acceptance and to forbid section-only acceptance that regresses a function.
- **SMS, amend:** `sms-temporary-tactics` to cover any unreferenced local, not only named padding arrays, and to reference the upstream comment-out convention.
- **SMS, new:** `sms-pch-string-convention` requiring `DummyStrings.hpp` / `InfectiousStrings.hpp` includes instead of hand copies, and documenting the `dummy(Vec*)` exception with its evidence requirement.
- **SMS, new:** `sms-fabricated-marker` making the upstream `AGENTS.md` marker rule enforceable: pragmas, fabricated helpers, and hand-expanded inlines carry `// fabricated` or `// TODO` on the adjacent line.

### 4.4 What to do with the existing tree

1. Revert the nine fabricated-content section rows and the killer vtables outright; the bytes are not evidence of source.
2. Convert the 25 structural spoofs to proper declarations once H6 lands: each mangled global becomes `float TClass::mMember = value;` in the owner, each placeholder class becomes the header include. The values are map-verified and can be kept.
3. Fix the two semantic defects (PollutionCount argument order, NpcChange guard) and re-validate the affected functions.
4. Re-run the three PR-era class substitutions and the new ones against the map once header widening is possible.
5. Leave stack-shaping and compiler-constraint sites in place but mark them per the SMS marker rule, so they are visible debt rather than silent style.

## Evidence

- `evidence/new-checkpoints.json`: index of all 820 integrations with patch paths, validation paths, and target scores.
- `evidence/delta.diff.gz`: full `aea424cd..ade6f2d4` diff of `src`, `include`, `tools`, `configure.py`.
- `evidence/probe.diff`, `evidence/gate-probe.ts`: the synthetic patches used to demonstrate the `.c`-only gaps.
- `evidence/head.txt`: audited head.
- Prior audit and its review: `../sms-pr161-source-quality-2026-09-15/`.
