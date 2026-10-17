# Daytona Melee sandbox image manifest

This is the acceptance manifest for the dedicated-CPU Linux x86 image used by
GameCube decompilation workers. The image is a warm build environment, not a
generic development container: a newly created sandbox must be able to edit one
translation unit, run Ninja, and score the resulting object without downloading
tools or performing a cold build.

## Target and required layout

- Linux x86 (`x86_64` host with i686 execution support), on dedicated vCPUs.
- A complete Melee checkout at a stable image path, referred to below as
  `$MELEE_ROOT`.
- The Melee checkout must be a shallow clone at the baked revision with real
  commit SHAs, not synthetic or squashed history. Per-claim workspace seeds are
  Git bundles spanning baked-rev to claim-base-rev and must fetch cleanly into
  the image clone. Periodic image re-bakes are expected as upstream head drifts.
- Optional extra commits baked depth-1 beside HEAD under `refs/baked-extra/<sha>`
  (`build_image_bundle.sh --extra-revs-file FILE`, or `EXTRA_BAKED_REVS_FILE`;
  `bake_extra_revs.sh` fetches them and fails on any the host lacks), recorded in
  `provenance/baked-extra-revs.txt`. List them with `bun extra-baked-revs.ts
  --state-db <orchestrator.sqlite> --game <id> --out FILE [--repo <checkout>]`
  (read-only: open unverified matches' trusted bases, non-terminal runs' bases,
  active claims' and unfinished worker jobs' base revs). Provisioning probes the
  sandbox once and neither bundles nor fetches a wanted revision the image holds,
  so a trusted base older than the baked commit no longer forces a full bundle.
- `$MELEE_ROOT/build.ninja`, every generated object, and
  `$MELEE_ROOT/build/GALE01/report.json` must already exist. Build the image's
  Linux tree through `ninja build/GALE01/report.json` (and the normal all-object target) before
  taking the snapshot. This changes sandbox startup from a cold configure/build
  (about 80–150 seconds) to the intended incremental path (about 1–5 seconds).
- Do not copy a macOS-built `build/` directory into the final image. Generated
  Ninja paths and native dtk, objdiff, and binutils binaries must all be produced
  or installed for Linux before the snapshot is accepted.

## Toolchain contents

| Image location | Required artifact | Why |
| --- | --- | --- |
| `$MELEE_ROOT/build/tools/wibo` before cache-shim installation; `$MELEE_ROOT/build/tools/wibo-real` afterward | `games/melee/state/tools/wibo-1.2.0-opt1/wibo-linux-i686` | Static i686 ELF used to run the Windows MWCC and sjiswrap binaries. It is golden-verified; provenance and the optimization patch are in that directory's `README.md` and `wibo-opt-vs-upstream-e8f4795.patch`. |
| `$MELEE_ROOT/build/tools/wibo-qemu` | `games/melee/state/tools/wibo-1.2.0-stock/wibo-i686` (stock upstream wibo 1.2.0, SHA-256 `2575d3b0a2f408b2c2b0850db56f1af5d005a138394a6774eba77b6708ecc304`) | The optimized wibo crashes under qemu-user, so `mwcc_alloc_capture.py` prefers this unmodified build when driving MWCC through the qemu gdbstub. Never install it as `wibo` or `wibo-real`. |
| `$MELEE_ROOT/build/tools/objdiff-cli` | Linux x86_64 static objdiff-cli v3.6.1 with the local `score` server patch | Keeps permuter scoring in one process. The current artifact at `games/melee/state/tools/objdiff-cli-3.6.1-score/objdiff-cli` is macOS arm64 and must not be installed in the Linux image. Linux build TODO: from the patched v3.6.1 checkout described by that directory's `README.md`, run `cargo build --release --target x86_64-unknown-linux-musl`, then install the resulting binary here. |
| `$MELEE_ROOT/build/compilers` | `games/melee/checkout/build/compilers` (compiler bundle `20251118`) | The Metrowerks compiler/linker Windows PE files are the canonical matching toolchain and are platform-neutral when executed through wibo. |
| `$MELEE_ROOT/build/tools/sjiswrap.exe` | `games/melee/checkout/build/tools/sjiswrap.exe` (`v1.2.2`) | Windows PE wrapper used by generated compile commands; platform-neutral through wibo. |
| `$MELEE_ROOT/build/tools/dtk` | Linux x86_64 dtk `v1.8.3` | Generates and checks decompilation artifacts. A macOS checkout contains a Mach-O binary here; replace it with the Linux release. |
| `$MELEE_ROOT/build/binutils` | Linux x86_64 gc-wii-binutils `2.42-2` | Supplies the `powerpc-eabi-*` assembler, linker, and inspection tools used by Ninja. A macOS build directory is not reusable. |
| `PATH` | Ninja `>=1.3`, Python `>=3.8`, and Git | Ninja executes `build.ninja`; Python runs configure and harness/cache tools; Git applies worker revisions. The checkout declares `ninja_required_version = 1.3`, and its Python tools contain a Python 3.8+ requirement. The upstream files do not pin exact Ninja, Python, or Git releases, so the base-image digest or package lock must pin the selected Linux packages. |
| `PATH` | Apt package `gdb-multiarch` with GDB Python support | Runs the stock Windows MWCC under a qemu gdbstub for register-allocator snapshots in `toolpacks/gamecube-decomp/compiler/mwcc_alloc`; the stock Debian/Ubuntu package includes Python support. |
| `PATH` | Apt package `qemu-user` | Provides `qemu-i386`, which runs the stock Windows MWCC under a qemu gdbstub for register-allocator snapshots in `toolpacks/gamecube-decomp/compiler/mwcc_alloc`. |
| `PATH` | Apt package `python3` | Runs the register-allocator snapshot scripts in `toolpacks/gamecube-decomp/compiler/mwcc_alloc`; this is the Python requirement already listed above. |
| `$MELEE_ROOT/build/tools/mwcc-alloc/` | `allocator_snapshot.py`, `gdb_allocator_snapshot.py`, `compare_coloring_snapshots.py`, and `mwcc_alloc_capture.py` | `build_image_bundle.sh` copies these from `toolpacks/gamecube-decomp/compiler/mwcc_alloc/sandbox/`. Run the capture CLI from `$MELEE_ROOT`; it requires the real ELF at `build/tools/wibo-real` and refuses the Python cache shim by design. |
| `PATH` | `clang-21` from apt.llvm.org (`llvm-toolchain-bookworm-21`), every package pinned to `1:21.1.8~++20251221032947+2078da43e25a-1~exp1~20251221153113.67` | The IR oracle (`ir_oracle.py`) compiles with the PowerPC target; `ORCH_IR_ORACLE_CLANG=/usr/bin/clang-21`. Debian bookworm ships no clang-21. The repository key is accepted only with fingerprint `6084F3CF814B57C1CF12EFD515CF4D18AF4F7421` (a throwaway stage fetches it, so gnupg and curl stay out of the image). Pinned: `clang-21`, `libllvm21`, `libclang-cpp21`, `libclang1-21`, `libclang-common-21-dev`, `llvm-21-linker-tools` (clang's own dependencies) and `llvm-21` with `llvm-21-runtime`, kept only because `llvm-cxxfilt-21` ships in `llvm-21`. The Dockerfile's `clang-oracle` stage holds only this toolchain (about 540 MB over the 117 MB base), so `docker build --target clang-oracle -f Dockerfile <empty dir>` reproduces the gate's compiler without a build context; the worker stage adds the other apt and pip packages on top (about 430 MB). |
| `/usr/local/bin/llvm-cxxfilt` | Link to `/usr/bin/llvm-cxxfilt-21` | `ir_oracle.demangle` looks for `c++filt` or `llvm-cxxfilt` on `PATH`. |
| Python 3 | Pip `pyelftools==0.32`, `graphviz==0.20.3`, `pcpp==1.30` | The vendored m2c fork (`_impl/gamecube/m2c`, run by `tools/decomp.py`) imports `elftools`; m2c imports `graphviz`; Melee's `m2ctx.py --preprocessor` uses `pcpp`. |
| `$MELEE_ROOT/build/compilers-traced/GC/<ver>/mwcceppc.exe` (with its `lmgr326b.dll`) and `CAPABILITIES.json` | Traced MWCC builds of `1.1p1`, `1.2.5` and `1.2.5n` (`compiler/mwcc_alloc/native`) | The Dockerfile's `traced-compilers` stage uses the binaries (with `lmgr326b.dll` and the `validation/` evidence) the bundle staged from `games/<id>/runtime/tool-data/mwcc_native/<ver>/` when every version is present (checked against the bundle's `SHA256SUMS`), else runs the toolpack's `native/build.sh`; with neither the build fails, and `--build-arg TRACED_COMPILERS=optional` writes an empty capability file for local test images only. `gate_traced_capabilities.py` then advertises a version only when the staged exe's SHA-1 equals its `traced_sha1`, `validation/presence-<ver>.json` names that SHA-1 and passed, every game that requires the version has a full `validate/byte_identity.py` sweep filed as `validation/byte-identity/<game>/*.json` that names that SHA-1, and every sweep naming it passes (positive compared count, tracing off and on identical on exactly the compared units, no mismatch or traced failure, stock failures only from the game's `stock_exclusions`); any other version keeps its files but lists no points, with the reason in `disabled` and `unavailable`. A source build carries no sweep, so its versions are disabled (`no byte-identity evidence`). The bundle runs the same gate as a preview and fails when it would disable a version the game lists in `worker-image.json` `traced_compilers.required` (SMS and Melee: `1.2.5`, `1.2.5n`; 1.1p1 fails its sweep and is not required), unless `--allow-disabled-traced`; see "Traced compilers" below. Never under `/opt/toolpacks` (that would change the toolpack `.ready` stamp); never in git. |
| `/opt/mwcc`, plus `<checkout>/../mwcc` and `/work/mwcc` linking to it | rayanht/mwcc `src/` and `include/` at the commit in `_impl/gamecube/tools/mwcc_ref.lock.json` | `real_code_evidence compiler` (`compiler_ref.py`) searches it. The image's `pinned-sources` stage runs `tools/fetch_mwcc_ref.sh --strip-git`: a depth-1, blob-filtered sparse checkout that refuses any other commit, with no `.git` and a `.mwcc-ref` stamp. |
| `/opt/refs/jsystem/{tp,tww}` | Twilight Princess and Wind Waker JSystem sources at the commits in `_impl/gamecube/tools/refs.lock.json` | `real_code_evidence jsystem`. `sandbox-image/fetch_pinned_sources.py` does the same fetch, with no `.git` and a `.pinned-ref` stamp per game. |
| `/opt/build-orchestrator` | The worker QA-lint assets and their `.qa-ready` stamp | See "Worker QA-lint assets" below. |
| `/opt/tool-data/type_layout_lookup/indexes/type_layout_index.json` | The project-wide type-layout index, built in the image from the checkout's headers | Required. `prepare_linux_image.py` runs the game's `type_index` recipe from `worker-image.json` after the build: an optional sorted umbrella source (one `#include` per header matching `umbrella.root`/`umbrella.glob`), the game's `ctx_command` (SMS: `tools/decompctx.py` over the umbrella with the include roots; Melee: `tools/m2ctx/m2ctx.py --quiet --preprocessor`, writing `build/ctx.c`), then `research/type_layout_lookup/runners/build_type_index.py --ctx <ctx> --lang <lang> --skip-casts --project <id> --clang $ORCH_IR_ORACLE_CLANG`. The image build fails when the runner fails or the index has 0 records; clang's partial-error count is printed, not fatal. The game's `verification_commands` check the file with `test -s`. |
| `/opt/tool-data/asm_window_search/indexes/{functions.jsonl,windows.meta.jsonl,windows.vec.bin,manifest.json}` and `/opt/tool-data/asm_window_search/.ready` | The game's asm-window index from its shared data root (`games/<id>/runtime/tool-data/asm_window_search/`, as the tool resolver resolves it) | Optional. Provisioning (`ensureSandboxToolData`) otherwise uploads the index to every worker sandbox (SMS 37 MB, Melee 54 MB). The bundle copies exactly those four files (mode 0644; the host keeps them 0600) and writes `.ready` with `content_stamp.sh` over them, paths `./indexes/...` relative to the tool's data root, so the host stamp matches and the upload is skipped; `provenance/asm_window_search-stamp.txt` records it. A missing index only warns: provisioning still uploads it when the host has it, else the sandbox tool reports its prerequisite missing. No `worker-image.json` check, since it is optional. A rebuilt index changes the stamp, and provisioning resyncs until the next rebake. |

The authoritative Melee pins are in `games/melee/checkout/configure.py`:
binutils `2.42-2`, compilers `20251118`, dtk `v1.8.3`, objdiff `v3.6.1`,
sjiswrap `v1.2.2`, and wibo `0.7.0`. URL/platform selection is implemented by
`games/melee/checkout/tools/download_tool.py`. The `wibo_tag = "0.7.0"` pin
must **not** be used: install the optimized `wibo-linux-i686` above and prevent
configure from re-downloading or replacing it (preinstall the executable and
pass the explicit wrapper/tool path when configuring).

## MWCC object cache

Copy these two files into the image together:

- `toolpacks/gamecube-decomp/_impl/gamecube/tools/mwcc_objcache.py`
- `toolpacks/gamecube-decomp/_impl/gamecube/tools/install_mwcc_cache.py`

After placing optimized wibo at `$MELEE_ROOT/build/tools/wibo`, run
`python3 install_mwcc_cache.py "$MELEE_ROOT"`. The installer moves the real
binary to `build/tools/wibo-real` and puts the cache shim at the original
`build/tools/wibo` path, so existing Ninja commands remain unchanged.

Set `MWCC_CACHE_DIR` to sandbox-local disk inside the sandbox filesystem, not a
mounted persistent volume; S3-FUSE latency is unacceptable on this hottest
path. Bake the image with the cache already populated by the image's full build.
The per-sandbox cache lives and dies with the sandbox.

## Runtime environment

```sh
export ORCH_TOOL_PLATFORM=linux-i686
export MWCC_CACHE_DIR=$MELEE_ROOT/build/mwcc-objcache
```

Daytona fixes CPU, memory, and disk when it creates a snapshot. Its API rejects
a `resources` field when creating a sandbox from that snapshot. The current
resource class is 2 vCPU, 4 GiB memory, and 5 GiB disk. Moving to 4 vCPU requires
baking and registering a new snapshot. The permuter's automatic job count will
scale to the new CPU count.

## Toolpack + Python runtime

The image must contain `/opt/toolpacks/gamecube-decomp` and its `.ready` content
stamp. The Python 3 environment must have the pinned `tree-sitter`,
`tree-sitter-c`, and `libclang` packages installed by the Dockerfile.

The image also carries the review_lint standards it was baked with: the global
set at `/opt/knowledge/global/sources/injectable/decomp_standards/standards` and
the game's slice at `/opt/games/<id>/knowledge/sources/injectable/decomp_standards/standards`
(plus `/opt/games/<id>/game.json`). `ORCH_PACKAGE_ROOT=/opt` makes the toolpack's
default root resolution work in-sandbox. Job-time uploads under
`/opt/build-orchestrator` still take precedence through
`REVIEW_LINT_GLOBAL_STANDARDS_DIR` and `ORCH_GAME_DIR`.

### Worker QA-lint assets

The bundle stages the tree `validation/build/daytona.ts` uploads for QA tasks
and the image copies it to `/opt/build-orchestrator`: the global standards
(`knowledge/global/sources/injectable/decomp_standards/standards/`), and for
the game `games/<id>/game.json`, `games/<id>/config/`, its
`decomp_standards/standards/` and `banned_patterns/data/`, plus always
`games/melee/game.json` and Melee's `banned_patterns/data/`. Symlinks are
dereferenced through `copy_tree_within.py`, which inventories every file it
would follow (nested directory links included) and refuses one whose real path
leaves the harness root, or a link loop, before copying; the standards under
`/opt/knowledge` and `/opt/games` go through it too. `*.env`, `local.env`, `__pycache__` and `*.pyc` are skipped; a
missing optional tree is skipped. `/opt/build-orchestrator/.qa-ready` holds the
stamp `content_stamp.sh` computes (the toolpack `.ready` scheme: the SHA-256 of
the `LC_ALL=C`-sorted `<sha256>  ./<path>` listing of every other file), and
`provenance/qa-stamp.txt` records it. Provisioning computes the same stamp over
the host tree and skips the QA sync when they match, so nothing else may live
under `/opt/build-orchestrator`. The snapshot script bakes the `sandbox.json` it
is about to write and restamps, so a successful rebake keeps the stamps equal.

Run these checks against a snapshot candidate:

1. `python3 -c "import tree_sitter, tree_sitter_c, clang"` exits 0.
2. `python3 /opt/toolpacks/gamecube-decomp/validation/checkdiff/api/status.py --repo-root /opt/melee --json` reports `ok`.
3. `python3 /opt/toolpacks/gamecube-decomp/source_editing/source_permuter/api/run.py --repo-root /opt/melee --function <any exact fn> --max-iters 2 --timeout-seconds 60 --json` returns a structured payload without `missing_python_deps`.

## Snapshot acceptance checks

0. `git status --porcelain --untracked-files=no` in `$MELEE_ROOT` is empty: the
   baked shallow clone carries a populated index (the Dockerfile runs
   `git reset --mixed HEAD`), so per-claim `git checkout --force <rev>` removes
   files the target revision no longer tracks. Tracked symlinks are links, and
   untracked `orig/*/sys/*` links are dereferenced to real disc files.
1. `file build/tools/wibo-real` reports a statically linked i386/i686 Linux ELF,
   and `build/tools/wibo` is the installed Python cache shim.
2. `file build/tools/objdiff-cli` and `file build/tools/dtk` report Linux x86-64
   ELF binaries; every executable in `build/binutils` is Linux-compatible.
3. `build/compilers`, `build/tools/sjiswrap.exe`, `build.ninja`, object files,
   and `build/GALE01/report.json` exist. For games with `validation.symbolCheck`,
   the configured linker map exists too (SMS: `orig/GMSJ01/files/mario.MAP`) and
   `NM=build/binutils/powerpc-eabi-nm python3 tools/check-changed-symbol-order.py <a tracked .cpp>`
   runs to a `RESULT:` line.
4. With networking disabled, touching one Melee source and running its Ninja
   object target succeeds under wibo, then the objdiff score server returns
   `READY` and scores that object.
5. A no-op `ninja build/GALE01/report.json` succeeds, and a representative one-TU edit,
   rebuild, and score completes on the incremental path.
6. `gdb-multiarch --version` succeeds.
7. `qemu-i386 --version` succeeds.
8. `gdb-multiarch --batch -ex "python print(1)"` prints `1`.
9. With networking disabled, run the following from `$MELEE_ROOT`, substituting
   a small matched translation unit and its smallest function. Require
   `"status": "ok"` and at least one coloring snapshot file that validates.

   ```sh
   python3 build/tools/mwcc-alloc/mwcc_alloc_capture.py --unit <small matched TU> --function <its smallest function> --capture coloring --timeout-seconds 900 --json
   ```
10. `clang-21 -print-targets` lists `ppc32`, `ORCH_IR_ORACLE_CLANG` is
    `/usr/bin/clang-21`, and `llvm-cxxfilt _ZN3Foo3barEv` prints `Foo::bar()`.
11. `build/compilers-traced/GC/{1.1p1,1.2.5,1.2.5n}/mwcceppc.exe` and
    `build/compilers-traced/CAPABILITIES.json` exist. Byte identity of the traced
    builds is `compiler/mwcc_alloc/native`'s own gate, not an image check.
12. `/opt/mwcc/src`, `../mwcc/src` (from the checkout), `/opt/refs/jsystem/tp`
    and `/opt/refs/jsystem/tww` exist, and
    `PYTHONPATH=/opt/toolpacks/gamecube-decomp/_impl/gamecube/m2c python3 -c "import m2c.main, elftools, graphviz, pcpp"` succeeds.
13. `/opt/build-orchestrator/.qa-ready` is non-empty and equals
    `provenance/qa-stamp.txt`; `/opt/toolpacks/gamecube-decomp/.ready` equals
    `provenance/toolpack-stamp.txt`.

Checks 10 to 12 and the `.qa-ready` presence in 13 also run inside the image
build, from the game's `worker-image.json` `verification_commands` (cwd =
checkout), after `prepare_linux_image.py` configures and builds the tree.

Sandboxes created from snapshots that predate these requirements return
`{"status": "debug_tools_not_provisioned"}` from the tool instead of erroring;
operators must rebake the snapshot rather than patch a live sandbox.

`build_image_bundle.sh` packages the current checkout plus the required local
overlays for transfer into an image build context. It does not make macOS native
binaries Linux-compatible; the Linux image build must install the pinned Linux
dtk/binutils and complete the objdiff TODO before passing these checks.

### Per-game image inputs

`--game` is required. The bundle resolves the same game descriptor and named
sandbox profile as the runtime, including config file references and local
overrides. `--profile` defaults to the game's default profile (normally `2-core`);
unknown profiles fail. An optional `4-core` profile may use its own snapshot.
`--checkout` overrides the resolved checkout when preparing a Linux-specific tree.
The game's configured report path selects its build version; no Melee report is
required for another game.

### Linker map for the symbol-check task

Games whose `validation.symbolCheck` names a linker map (SMS:
`orig/GMSJ01/files/mario.MAP`) get exactly that file baked at the same
checkout-relative path. Upstream CI reads it from its build container's
`/orig`; `build_image_bundle.sh` extracts it from the disc image in
`orig/<version>/` with the checkout's `build/tools/dtk disc extract` into a
temporary directory and copies only the map (the disc image and the other
extracted files stay out of the bundle, as before). The bundle records the
map's SHA-256 next to the other artifacts, and the game's
`worker-image.json` `verification_commands` asserts the file inside the
image build. The sandbox `symbol-check` task and the worker
`symbol_validation` micro gate refuse to run (`tool_unavailable`, recorded)
when the map is absent, so a snapshot without it must be rebaked.

The archive contains `daytona-<game-id>-image/checkout`, the shared toolpack,
Dockerfile, `traced-compilers/`, `build-orchestrator/` and `provenance/`
(`image-plan.json`, `baked-head.txt`, `baked-extra-revs.txt` (empty without
`--extra-revs-file`), `toolpack-stamp.txt`, `qa-stamp.txt`, and
`traced-compilers.sha256` when binaries were staged). The plan records the game, selected
profile, resource class, intended snapshot and workspace root; `baked-head.txt`
records the actual packaged checkout HEAD. Pass its game ID and workspace root
and report path as Docker build arguments. The Docker image does not set Daytona CPU limits:
register its snapshot with the recorded resource class. Tools resolve from
`games/<id>/runtime/tools`, with existing legacy state tools accepted during
migration. Root `local.env`, `.env` files and local Pi session directories are excluded
from checkout packaging.

This is a GameCube/MWCC image recipe: the prepared checkout still needs
`configure.py`, `build.ninja`, compilers, binutils, `sjiswrap.exe`, and built
objects. Other build systems need their own image recipe. Platform-specific
build products must be prepared and verified on Linux before publishing.

### Traced compilers

The bundle's default traced input is the game's untracked tool data,
`games/<id>/runtime/tool-data/mwcc_native/` (`--traced-compilers DIR` points
elsewhere). It needs S4's frozen output plus the full sweep reports for those
exact binaries, filed per game (the directory names the game; a report
anywhere else is not evidence):

```sh
DEST=games/<id>/runtime/tool-data/mwcc_native
NATIVE=toolpacks/gamecube-decomp/compiler/mwcc_alloc/native
bash $NATIVE/build.sh --out "$DEST"            # <ver>/{mwcceppc.exe,lmgr326b.dll}, CAPABILITIES.json, validation/presence-<ver>.json
# or copy an existing freeze: cp -R <frozen out>/. "$DEST/"
python3 $NATIVE/validate/byte_identity.py --checkout games/sms/workspace/checkout --traced-root "$DEST" \
  --wibo games/melee/workspace/repository/build/tools/wibo --out /tmp/bi-sms
python3 $NATIVE/validate/byte_identity.py --checkout games/melee/workspace/repository --traced-root "$DEST" --out /tmp/bi-melee
mkdir -p "$DEST/validation/byte-identity/sms" "$DEST/validation/byte-identity/melee"
cp /tmp/bi-sms/byte_identity.json "$DEST/validation/byte-identity/sms/one-fn.json"
cp /tmp/bi-melee/byte_identity.json "$DEST/validation/byte-identity/melee/one-fn.json"
# optional: --trace-all sweeps as all-fns.json beside them; every sweep present must pass
```

Each game's policy is `traced_compilers` in `games/<id>/config/worker-image.json`:
`required` (versions the image must enable) and `stock_exclusions`
(`{<ver>: [<unit>...]}`, the units the stock compiler itself cannot build; the
list in each game's `worker-image.json` is the source of truth). The
bundle collects every game's policy into `traced-compilers/requirements.json`:
traced binaries are shared, so a version two games require needs passing
evidence from both. An unlisted stock failure, a sweep that compared nothing,
or off/on counts that disagree with the compared units disable the version.

Nothing pins the current hashes: the gate binds whatever is staged to the
reports staged with it, so a re-frozen binary needs its own presence file,
`CAPABILITIES.json` and sweep reports. The bundle prints each version as
`enabled` or `disabled (<reason>)`.

### Rebake runbook

`snapshot.ts` automates the rebake. It is a dry run unless `--apply` is given:

```sh
SANDBOX_IMAGE=toolpacks/gamecube-decomp/_impl/gamecube/sandbox-image
bun "$SANDBOX_IMAGE/snapshot.ts" --game sms                 # dry run: every profile in sandbox.json
bun "$SANDBOX_IMAGE/snapshot.ts" --game melee --profile 4-core --apply
bun "$SANDBOX_IMAGE/snapshot.ts" --game sms --traced-compilers /path/to/mwcc_native   # passed to the bundle
```

`--traced-compilers`, `--allow-disabled-traced` and `--extra-revs-file` pass
through to `build_image_bundle.sh`.

Per game it runs `build_image_bundle.sh` once per distinct workspace root,
extracts the bundle under `--work-dir` (default `$TMPDIR/decomp-snapshots`),
pins the Dockerfile ARG defaults (`GAME_ID`, `WORKSPACE_ROOT`, `REPORT_PATH`,
`SNAPSHOT_BAKED_REV`; the Daytona Dockerfile build takes no build arguments),
bakes the updated `sandbox.json` into the QA copy and restamps `.qa-ready`, then
runs `daytona snapshot create <game>-sandbox-<YYYYMMDD>-<shortrev>-<profile>
--dockerfile <Dockerfile> --context <payload> --cpu N --memory N --disk N` per
profile from its `resource_class`. After each snapshot it records
`snapshot_name` and `snapshot_baked_rev` in the profile (2-space JSON, other keys
kept; profiles that inherit a top-level `snapshot_baked_rev` keep inheriting when
all of them are rebaked). Last, it replaces
`games/<id>/runtime/images/context/daytona-<id>-image/` with the pinned payload.
The dry run prints the exact commands and the `sandbox.json` diff. A packaged
HEAD that differs from the checkout's HEAD aborts the run before any snapshot.
Local overrides belong in `games/<id>/config/local.json`.

Manual fallback (one profile):

```sh
bash "$SANDBOX_IMAGE/build_image_bundle.sh" --harness-root "$PWD" --game melee --profile 2-core --out /tmp/daytona-melee-image.tar.zst
mkdir -p /tmp/daytona-melee-image
tar --use-compress-program=unzstd -xf /tmp/daytona-melee-image.tar.zst -C /tmp/daytona-melee-image
# Pin ARG GAME_ID/WORKSPACE_ROOT/REPORT_PATH/SNAPSHOT_BAKED_REV defaults in the extracted Dockerfile.
daytona snapshot create <snapshot_name> --dockerfile /tmp/daytona-melee-image/daytona-melee-image/Dockerfile \
  --context /tmp/daytona-melee-image/daytona-melee-image --cpu 2 --memory 4 --disk 5
# Then set snapshot_name and snapshot_baked_rev (provenance/baked-head.txt) in games/melee/config/sandbox.json.
```

A local size check builds the extracted payload with
`docker build --platform linux/amd64 <payload dir>`.

### Modern MWCC Capture and Analysis

The bundle also includes `build/tools/mwcc-alloc/mwcc_alloc_analyze.py` and
`build/tools/mwcc-alloc/vendor/mwcc-decomp/`. The vendor is pinned by its
`PIN.json` to `0f0e1dbc7496d1a0bdf00798ff6752e813e0d0d0`, CC0-1.0.
It contains Python capture/analysis modules, register-site catalogs and the
license, with no compiler binaries or captured artifacts.

The local `gdb_modern_capture.py` shim selects the stage or full profile without
editing the pinned vendor. For acceptance, run `--capture trace` on a known
function in the Linux sandbox. The default stage profile must return `ok`,
all nine PCode stages, allocator, GPR/FPR coloring and `capture.o`. Its result
must explain the numeric symbol-order fallback when compiler names are absent.
Also run `--trace-detail full` on a small function and require its creation,
stack/local-object artifacts plus any emitted home-list artifacts. Stage
results must label these omitted event classes. Timeouts retain partial JSON,
objects and GDB/qemu logs for diagnosis.
Check that qemu and GDB are gone before sleeping the sandbox. A failed or timed
out capture is not acceptance evidence.

Run the installed `mwcc_alloc_analyze.py --repo-root "$MELEE_ROOT" --mode
provenance --input <saved allocator JSON> --output <provenance JSON> --json`,
then `--mode explain --input <provenance JSON> --register gpr:<N> --json`.
For inverse/source-rank, require baseline replay agreement before interpreting
any witness. Complete analysis remains inside its 45-second internal deadline.

New sandbox seeds synchronize the current host toolpack to
`/opt/toolpacks/gamecube-decomp/`. Trace and analysis dispatch use that synced
suite immediately; legacy captures can use the baked scripts. Image acceptance
must verify both synced execution and the new bundle layout. Analysis returns
a bounded summary and a complete workspace artifact, not an inline PCode dump.

### Shared scoring path bindings

The tool resolver sets `ORCH_GAME_REPORT_PATH` from the selected game's build
configuration. Checkdiff, its readiness check, and direct compilation use this
path. Reference objects default to `obj/` next to the report; a tool binding can
set `ORCH_GAME_REFERENCE_OBJECT_ROOT` for a different reference layout. Paths
may be checkout-relative so the same binding works on the host and Daytona.
A selected game without a report binding fails instead of scoring Melee objects.
The image records the report binding in its environment for direct tool use.
