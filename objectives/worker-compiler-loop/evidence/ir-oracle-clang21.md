# IR oracle: host Apple clang vs the image's clang 21 (S8 part B, 2026-10-17)

Question: does the steering gate's `reduce` give the same verdicts in the worker sandbox, with the image's pinned clang, as on the host with `/usr/bin/clang`?

Answer: yes. The final image's clang 21.1.8 matched the host on all 137 group verdicts from real steering edits. It also produced the same analysis outcome on both manifests and parsed all 14 sample units. The earlier pin, clang 18.1.8, did not: 3 verdicts differed and 2 units could not be parsed. That is why the contract now pins clang 21 (this note replaces `ir-oracle-clang18.md`).

## Compilers

| Role | Compiler |
|---|---|
| Host (host gate and backfill until now) | Apple clang version 21.0.0 (clang-2100.1.1.101) |
| Sandbox, final image (`--target clang-oracle` of `sandbox-image/Dockerfile`, plus python3 and git on top) | `Debian clang version 21.1.8 (++20251221032947+2078da43e25a-1~exp1~20251221153113.67)` |
| Superseded pin | `Debian clang version 18.1.8 (++20240731024826+3b5b5c1ec4a3-1~exp1~20240731144843.145)` |

- Final image details:
  - Package `clang-21 1:21.1.8~++20251221032947+2078da43e25a-1~exp1~20251221153113.67`.
  - `ORCH_IR_ORACLE_CLANG=/usr/bin/clang-21`.
  - `/usr/local/bin/llvm-cxxfilt` resolves to `/usr/lib/llvm-21/bin/llvm-cxxfilt`.
- The image runs as `linux/amd64` (emulated under OrbStack).

## Method

- Checkout: a copy of the SMS checkout at `d9a205de` (the v4 backfill clone HEAD) under `/tmp`. It leaves out `orig/`, `build/` (except `build/GMSJ01/include` and the tools) and `compile_commands.json`. So flags come from `ir_oracle_flags/sms.json`, as they do in `reduce`'s archived base tree.
- Toolpack: a fresh copy of this worktree's `_impl/gamecube/tools`, the same copy for the host run and the container run.
- Fingerprints: `ir_oracle.unit_fingerprint` for 14 units from the v4 backfill pass list. The units span 8 directories and hold 140 audited pass functions: Enemy/bossgesso, System/MarNameRefGen_BossEnemy, Player/Yoshi, Camera/cameralib, MoveBG/MapObjPinna, MarioUtil/DrawUtil, GC2D/GCConsole2, Map/MapMirror, Camera/CubeManagerBase, System/FlagManager, Enemy/amiNoko, Enemy/mameGesso, GC2D/CardSave and MoveBG/MapObjLib.
- Verdicts: a full `reduce` on two `edits` manifests built from real steering edits. Base `fa5d5210` (the backfill's "revert steering edit groups" commit). Candidate: the files' texts at its parent `2372fda6`. The host gate had already judged these groups steering.
  - Manifest 1: cannon, BathWaterManager, DrawUtil, MtxUtil, MapObjLib, NpcAnm, MarioMove, MarioPhysics; 76 groups.
  - Manifest 2: gesso, MarioRun, NpcParts, Item, CameraDemo, MSound, bosspakkun, ModelWaterManager; 61 groups.

  `--budget-seconds 900`, no approvals.
- Demangling: 982 mangled names through host `c++filt` and the image's `llvm-cxxfilt`.

## Results

| Comparison | clang 21.1.8 (final image) | clang 18.1.8 (superseded) |
|---|---|---|
| Group verdicts matching host, manifest 1 | 76/76 | 75/76 |
| Group verdicts matching host, manifest 2 | 61/61 | 59/61 |
| Analysis matching host (incomplete / complete) | yes / yes | yes / no (incomplete) |
| Units fingerprinted (of 14) | 14 | 13 |
| Function fingerprints identical to host (of 1514) | 1423 (94%) | 1230 (81%) |
| Demangled names identical to host (of 982) | 982 | 982 (`llvm-cxxfilt-18`) |
| `reduce` wall time, manifest 1 / 2 (host 22 s / 20 s) | 67 s / 70 s | 655 s / 198 s |

- Wall times come from the emulated container, so they are not performance numbers.
- The host's verdicts are stable: a re-run of both manifests on the host reproduced the earlier run exactly (0 of 137 differ).
- Host verdict mix:
  - Manifest 1: 73 removable, 2 unresolved, 1 real. Manifest 1's analysis is incomplete on every compiler because of `BathWaterManager.cpp@0.0`.
  - Manifest 2: 61 removable, complete analysis.

### Why clang 21's 91 fingerprint differences do not change verdicts

- They are optimizer and metadata differences between Apple's pipeline and upstream 21.1.8. For example, in `CLBIsPointInCube`:
  - Apple folds a comparison into `fmul`/`fcmp`/`and` where upstream keeps a branch.
  - phi operand order differs.
  - Some loads carry TBAA tags on one side only.
- `reduce` only compares a base with its variants under one compiler, so a difference shared by base and variant cancels.

### Why clang 18 was dropped (findings from the superseded note)

- **Unparseable units.** clang 18 prints vtable-slot constant GEPs in the legacy form, `getelementptr inbounds ({...}, ptr @_ZTV…, i32 0, inrange i32 0, i32 21)`, inside `load` operands. `ir_oracle.py` stops on it with `ValueError: not a type at ['inrange', 'i32', '0']`, and the unit gets no fingerprints. This hit Player/Yoshi and Player/ModelWaterManager, which made manifest 2 incomplete. LLVM 19+ prints `inrange(-8, 172) (i8, ptr @…, i32 8)`, which the parser handles.
- **Structural IR differences.** clang 18 keeps struct-typed GEPs (`getelementptr inbounds %class.T, ptr %p, i32 0, i32 1`) where LLVM 19+ emits canonical byte offsets (`getelementptr inbounds nuw i8, ptr %p, i32 332`). Its attribute spellings also differ (`nocapture` against `captures(none)`). Typed GEPs carry type names and field indices, so a type-only rewrite to the same offset can hash as changed under one version and unchanged under the other. That can flip a verdict in either direction.
- **Verdict difference.** `src/MarioUtil/MtxUtil.cpp@16.0`: the host says removable ("reverting it keeps every IR fingerprint"). clang 18 says unresolved ("real and steering shapes in one group (temp_alias)").

### Other checks

- **Missing base commit.** With a `base_rev` absent from the repo (the unverified-target trusted-base case, when provisioning lacks the commit), `reduce` reports `analysis: incomplete` with `oracle unavailable: base_rev … not in checkout`, and every group is `unresolved`. It fails closed.
- **Demangler name.** `ir_oracle.demangle` looks only for `c++filt` or `llvm-cxxfilt` on PATH. apt installs only the versioned `llvm-cxxfilt-21`, hence the image's symlink. GNU binutils `c++filt` differs from LLVM only in `> >` spacing, which `normalize_name` strips. Without any demangler, IR names stay mangled and `ir_touch` stops attributing groups to functions.

## What the gate enforces

- The clang probe runs in the sandbox for the worker gate, and on the host for backfill's `--placement host` opt-in. It accepts only:
  - an explicit, executable `ORCH_IR_ORACLE_CLANG`;
  - LLVM major `STEERING_SANDBOX_CLANG_MAJOR = 21`, taken from `__clang_major__` and checked against the `--version` line;
  - no `__apple_build_version__` and no `Apple clang` version line, because Apple clang 21.0.0 is Apple's numbering, not LLVM 21;
  - a demangler on PATH.
- The probe fixtures in `validation/steering/__fixtures__/clang-probe.ts` are real outputs from this Mac's Xcode clang and from the clang 21 and clang 18 containers.
- Every gate artifact records `placement` (requested, where, reason, clang, clang_version, demangler). Every `reduce` report records `oracle.clang_version`.
- The host clang (`/usr/bin/clang`, Apple) now fails the probe. Backfill on the host therefore needs `ORCH_IR_ORACLE_CLANG` set to an LLVM 21 clang, for example Homebrew `llvm@21`.
