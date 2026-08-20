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
export ORCH_GLOBAL_COMPILE_SLOTS=<sandbox-vCPU-count>
export MWCC_CACHE_DIR=$MELEE_ROOT/build/mwcc-objcache
```

Size `ORCH_GLOBAL_COMPILE_SLOTS` to the sandbox's allocated vCPU count. The
filesystem admission locks described in
`docs/40-new-features/10-daytona-sandbox-execution` are only VM-local in this
deployment; they do not coordinate separate Daytona VMs. Dedicated CPU
allocation and the per-VM slot count are therefore the compile admission limit.

## Snapshot acceptance checks

1. `file build/tools/wibo-real` reports a statically linked i386/i686 Linux ELF,
   and `build/tools/wibo` is the installed Python cache shim.
2. `file build/tools/objdiff-cli` and `file build/tools/dtk` report Linux x86-64
   ELF binaries; every executable in `build/binutils` is Linux-compatible.
3. `build/compilers`, `build/tools/sjiswrap.exe`, `build.ninja`, object files,
   and `build/GALE01/report.json` exist.
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

Sandboxes created from snapshots that predate these requirements return
`{"status": "debug_tools_not_provisioned"}` from the tool instead of erroring;
operators must rebake the snapshot rather than patch a live sandbox.

`build_image_bundle.sh` packages the current checkout plus the required local
overlays for transfer into an image build context. It does not make macOS native
binaries Linux-compatible; the Linux image build must install the pinned Linux
dtk/binutils and complete the objdiff TODO before passing these checks.
