# PR #189 synced onto upstream doldecomp/sms f8542190 (local only)

Nothing was pushed. No PR was opened or changed. The harness checkout (`games/sms/workspace/checkout`, branch `setup/sms-registration` at 3b83dd46) was not moved.

## Commits

| What | SHA | Branch |
|---|---|---|
| Upstream `upstream/main` | f8542190f3869958cf5c2966941760355cb4892c | |
| Our PR head tree (04f33b75 squash) | fede613d20430ba723690d273279dea7fe5816d2 | `harness/pr189-upstream-8a4612b7` |
| Merge (parents fede613d, f8542190) | bd2fb08cb3f8f7030cb159d23db2793e5e29423f | `harness/pr189-upstream-f8542190` |
| Squash (tree = merge, parent f8542190) | 0978fc7a45850b33e0fb3c8ea655507c33b655ab | `harness/pr189-squash-f8542190` |

- The merge branch's worktree is `games/sms/workspace/pr189-sync`.
- Upstream was 26 commits past 8a4612b7. The squash changes 301 files against upstream.

## Scores (Daytona, GMSJ01, objdiff report)

| Tree | Matched functions (of 12881) | Matched code | Matched data | Fuzzy |
|---|---:|---:|---:|---:|
| Ours fede613d (= 04f33b75 tree) | 10604 | 57.830% | 87.264% | 91.565% |
| Upstream f8542190 | 9933 | 48.868% | 85.548% | 92.499% |
| **Merge bd2fb08c** | **10715** | **58.336%** | **88.803%** | **93.212%** |

- **Lost exacts versus max(ours, upstream):** none. The 10715 exact matches are exactly the union of the 10604 ours and 9933 upstream exacts, of which 111 are upstream-only.
- **Functions below max(ours, upstream):** 0. See `merge-vs-max.json` and `merge-vs-max.txt`.
- **Broken matches** (exact in either base, not exact in the merge): 0.
- Reports are in this folder: `report-merge-bd2fb08c.json`, `report-ours-fede613d.json` and `report-upstream-f8542190.json`.

## Checks

- **clang-format 21** (`ghcr.io/jidicula/clang-format:21 --dry-run --Werror`): clean on all 299 C/C++ files that the merge tree adds or changes versus upstream.
- **Symbol order** (harness `symbol-check` task in Daytona: `tools/check-changed-symbol-order.py`, baseline f8542190, map `orig/GMSJ01/files/mario.MAP`):
  - Result: clean, 36 of 36 units passed, 0 new errors. See `symbol-check.json`.
  - Scope: the 34 co-modified and conflicted .cpp units, plus pakkun.cpp, GCConsole2.cpp, Kumokun.cpp and BathWaterManager.cpp.

## Build path and a Daytona issue found

- **Issue:** synchronous Daytona session exec now fails with `DaytonaConnectionError: socket hang up` after about 60 s, so the normal `executeDaytonaBuild` report run died mid-build twice.
- **Workaround:** `tools/daytona-report.ts` injects a provider whose `exec` runs `runAsync: true` and polls `getSessionCommand`. A build takes about 108 s.
- **Impact on the live harness:** its own Daytona builds use the same synchronous exec (`apps/server/src/core/job-queue/sandbox.ts`, `DaytonaSandboxHandle.exec`), so they will likely hit this too.

## Builds

- **Baselines:** ours and upstream.
- **M0:** compile failure. Our pakkun.cpp and GCConsole2.cpp used the removed `mEmitParams`.
- **M1:** 10713 functions, 2 lost exacts, 12 functions below max.
- **3 parallel fixer tracks:** 13 builds.
- **M2 / final:** clean. bd2fb08c rebuilt with 0 function differences from M2.

## Per-file resolution decisions (20 conflicted files)

**Add/add files, upstream taken whole:** `include/Enemy/BossTelesa.hpp`, `include/Enemy/TinKoopa.hpp`, `src/Enemy/bosstelesa.cpp`, `src/Enemy/tinkoopa.cpp`.
- Ours were declaration stubs. Upstream's full decomp keeps the statics, class sizes (0x38C and 0x1FC) and the `(const char*)` constructors that MarNameRefGen uses.

**`src/Enemy/BathtubKiller.cpp`:** upstream's file (200bdb09, f161c7ba) for 9 functions, plus 3 of ours ported to upstream member names:
- `isAboided`
- `generateItemBathtubKiller` (100; the auto-merge had taken upstream's 99.86)
- `moveChasing` (98.50)

**`src/Player/WaterGun.cpp`:** upstream's file, plus our `TNozzleDeform::emit` and `TNozzleDeform::animation` ported to the new names.
- `include/Player/WaterGun.hpp` keeps upstream's API, plus three fabricated helpers so our sites keep their codegen:
  - `getCurrentNozzleInline()`
  - `getCurrentNozzleRef() const`
  - `hasFlagBool(u16)`
- These restore `triggerPressureMovement` (100), `TWaterGun::emit` (99.96) and `TCameraMarioData::calcAndSetMarioData` (100).

**`src/Player/MarioSpecial.cpp`:** the higher side per function.
- Ours: `barWait` and the `wire*`, `bar*`, `roof*`, `hanging` and `pulling` functions.
- Upstream: `fenceMove` and `wireMove`.
- `wireMove` is wrapped in `#pragma dont_inline on` with `clean == TRUE`. That stops it inlining into wireHanging, wireRolling and wireWait, so all four score at least max. wireMove is 99.77, above upstream's 99.69.

**`src/Player/MarioDraw.cpp`:**
- Upstream: `isFootAdjustable` replaces our `CheckMarioFootPosCtrl` (same code), plus `MarioFootDir*Ctrl` and `calcBaseMtx`.
- Ours: `MarioWaistCtrl`, `initModel`, `considerWaist` and `boxDrawPrepare`.

**`src/Player/MarioCheckCol.cpp`:** ours (`hitNormal` 100), with `mEmittedWaterCount`.

**Hanachan headers and Koopa:**
- `DemoBossHanachan.hpp` and `SleepBossHanachan.hpp`: upstream's inline constructors (42880801).
- `Koopa.hpp`: combined. Upstream's `effectsTumble()`, plus our size padding and `TKoopaManager`.
- `MarNameRefGen_BossEnemy.cpp`: ours, `new TSleepBossHanachan("?")`, at 97.02.
- `enemy.cpp`: the hunk is comment-only, upstream taken.

**GC2D:**
- `BoundPane.cpp`: upstream's file (7aa52425), with the new `JUTPoint` layout.
- `ConsoleStr.cpp`: combined, our form with upstream's names.

**MoveBG:**
- `MapObjBianco`, `MapObjMare` and `MapObjMonte`: our cast forms with upstream's `mEmittedWaterCount`.
- `MapObjGeneral`: our `recovering` (100) and upstream's `calcRootMatrix` (bb595acb; both sides exact).

**Fixes outside the conflict list:**
- `src/Enemy/pakkun.cpp`, `src/GC2D/GCConsole2.cpp`: `mEmitParams.mAmountMax` becomes `mAmountMax`. pakkun.cpp was also re-aligned by clang-format.
- `src/Map/PollutionCount.cpp`: our call-site argument swap plus upstream's fixed `makeWorldToPollutionMtx` (dfc81f77) swapped twice, so it was undone. drawJointObjStamp is now 99.79, above both sides.
- `src/Map/BathWaterManager.cpp`: a file-local `concatPrerender` keeps the pre-a7c53f9f `TMatrix34::concat` element order for `prerender` only (86.09). It is score-only and reproduces the old concat bug.
- `src/Camera/cameragc.cpp`: `calcPosAndAt_` keeps our max form (92.74). Upstream's min (3978ae4b) scores 92.73.
- `src/Enemy/Kumokun.cpp`: `rotateGoalDirToLocal` takes upstream's body (97.73). A file-local `rotateGoalDirToLocalCopy` with the old ASSIGN_COPY return keeps `TNerveKumokunWait::execute` at 98.37.

The score-only forms (`concatPrerender`, cameragc max, the fabricated WaterGun helpers) follow the keep-the-higher-score rule. Drop them if the PR should prefer upstream's semantics; each costs at most 0.6 points in one function.

## PAL (GMSP01) notes

The Daytona snapshot has no PAL DOL, so GMSP01 cannot be fully reported. Instead, an object-level compare compiled the units with the GMSJ01 ninja commands retargeted to GMSP01, for three trees: merge, ours and upstream. It then compared each function's code bytes and relocations, with local `@N` and `$N` names normalized. See `pal-object-compare.txt` and `tools/pal-units.sh`.

- **All 36 resolution units compiled for PAL.** The full-set totals are from the earlier run, before the `$N` statics were normalized. That run inflated the "neither" count with nerve-singleton guard names.
- **Focus run on both versions:** 9 units, the ones with functions identical to neither side. The 14 such functions are the same in GMSP01 and GMSJ01, with identical diff sizes against each side. There is no PAL-only divergence (unlike the earlier resetNozzleBoxesModel case). Every PAL difference mirrors a GMSJ01 difference that the GMSJ01 report scores at or above max(ours, upstream).
- **Unchanged:** `src/MoveBG/ItemManager.cpp` (the `#ifdef VERSION_GMSP01` resetNozzleBoxesModel fix) is untouched by this merge.
- **Not measurable here:** the 5 known PAL-only 0-1 byte fuzzy drops from 04f33b75 are outside the merge and still need a PAL DOL in the snapshot to measure.

## Tools in `tools/`

- **Daytona builds:** `daytona-report.ts` (report build with the async-exec workaround), `daytona-probe.ts` (command probe), `symbol-check.ts`.
- **Comparison:** `mvsmax.py` (per-function compare against max(ours, upstream)), `fnscore.py`.
- **PAL:** `pal-units.sh`.
- **Worktree snapshot and build:** `snap.sh`, `build.sh`.
