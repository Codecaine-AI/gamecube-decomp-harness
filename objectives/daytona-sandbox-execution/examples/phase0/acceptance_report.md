# Daytona Melee sandbox-image MANIFEST acceptance report

Date: 2026-08-18 (America/Chicago)  
Scratch root: `/tmp/melee-acceptance` (host canonical path `/private/tmp/melee-acceptance`)  
Bundle: `/tmp/melee-image-bundle/daytona-melee-image.tar.zst`  
Authority: `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/toolpacks/gamecube-decomp/_impl/gamecube/sandbox-image/MANIFEST.md`  
Overall result: **FAIL — Snapshot acceptance check 5**

The authority file was read in full before the bundle was changed. The reference repository was read only; nothing was written under `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness`.

## Result summary

| Check | Result | Evidence |
|---|---|---|
| 1. wibo real binary and cache shim | PASS | `wibo-real` is a static i386 Linux ELF; `wibo` is the installed Python shim with `/usr/bin/python3` shebang and installer marker. |
| 2. Linux native tools | PASS | objdiff and dtk are x86-64 Linux ELFs; binutils has 15 static x86-64 Linux ELFs plus one Linux-compatible POSIX shell script. |
| 3. Warm-tree contents | PASS | Compiler directory, sjiswrap, build.ninja, 2,179 object files, and report.json exist. |
| 4. Offline touch/rebuild/score | PASS | `--network none`; one-object rebuild succeeded under the wibo shim in 0.35 s; score server returned `READY` and a valid two-field response. |
| 5. Offline no-op/edit/rebuild/score | **FAIL** | The literal required command `ninja report.json` fails with `unknown target 'report.json'`. The concrete generated target is warm/no-op, and the representative edit/rebuild/score subtest passes, but no alias was added to force acceptance. |

## Bundle preparation and provenance

The archive had a single wrapper directory. It was extracted with preserved permissions and mtimes, then its three payload directories were moved to the scratch root:

```sh
zstd -dc /tmp/melee-image-bundle/daytona-melee-image.tar.zst | tar -xpf -
mv daytona-melee-image/melee ./melee
mv daytona-melee-image/image-tools ./image-tools
mv daytona-melee-image/provenance ./provenance
cp -p melee/build.ninja evidence/build.ninja.macos-shipped
```

Shipped/backup evidence:

```text
melee/build.ninja size=1356444 mtime=2026-08-11T11:43:31-0500
evidence/build.ninja.macos-shipped size=1356444 mtime=2026-08-11T11:43:31-0500
ca4341c067148c5c8098f45a8e6c9b174d46d927c76a674078a8a1be387f570f  evidence/build.ninja.macos-shipped
evidence/dtk.macos-shipped: Mach-O 64-bit executable x86_64
evidence/binutils.macos-shipped/powerpc-eabi-as: Mach-O universal binary with x86_64 and arm64
```

`configure.py` pins dtk `v1.8.3`, binutils `2.42-2`, compilers `20251118`, objdiff `v3.6.1`, and sjiswrap `v1.2.2`. `tools/download_tool.py` produced these Linux URLs:

```sh
curl -fL --retry 3 --connect-timeout 20 \
  -o tool-downloads.IQV3vL/dtk-linux-x86_64 \
  https://github.com/encounter/decomp-toolkit/releases/download/v1.8.3/dtk-linux-x86_64
curl -fL --retry 3 --connect-timeout 20 \
  -o tool-downloads.IQV3vL/linux-x86_64.zip \
  https://github.com/encounter/gc-wii-binutils/releases/download/2.42-2/linux-x86_64.zip
```

Downloaded hashes and installation:

```text
97c60d797aa6d87093c367d7667c77c03204e91b825b6fdd6361e29468865d76  dtk-linux-x86_64
64e4bf7aee5c06075d8fa818ebd2a0a3a72e0eeef3896bdec2f198b0e950fe63  linux-x86_64.zip
```

```sh
mv melee/build/tools/dtk evidence/dtk.macos-shipped
install -m 0755 tool-downloads.IQV3vL/dtk-linux-x86_64 melee/build/tools/dtk
mv melee/build/binutils evidence/binutils.macos-shipped
mkdir melee/build/binutils
unzip -q tool-downloads.IQV3vL/linux-x86_64.zip -d melee/build/binutils
chmod 0755 melee/build/binutils/*
```

No repository checksum constants exist for these downloads. The hashes above are hashes of the fetched release bytes.

## Container and configuration

The test runtime was an amd64 Debian container on an arm64 OrbStack Docker daemon, always invoked with `--platform linux/amd64`. Inside the container, `uname -m` returned `x86_64`.

```text
base digest: debian@sha256:813017f3d62be4b5891a7acca6a01bdcd4b8513daa81b1ab99d3a50385b26931
base image ID: sha256:a97c45fa72171d55c288623cfb1b66e14c9ef5bb3c7c179bc7dd75ad6f1cb73c
test image ID: sha256:5ff3871e5387f90687f2f3821a398cde1148009be9313fce12500950ff0f7a5d
architecture: amd64
coreutils 9.1-1
file 1:5.44-3
git 1:2.39.5-0+deb12u3
ninja-build 1.11.1-2~deb12u1
python3 3.11.2-1+b1
```

The extracted scratch root was mounted at `/work`, making the checkout `/work/melee`. Exact regeneration command, run from `/work/melee`:

```sh
python3 configure.py \
  --wrapper /work/melee/build/tools/wibo \
  --dtk /work/melee/build/tools/dtk \
  --objdiff /work/melee/build/tools/objdiff-cli \
  --sjiswrap /work/melee/build/tools/sjiswrap.exe \
  --binutils /work/melee/build/binutils \
  --compilers /work/melee/build/compilers
```

Output:

```text
real 0.58
user 0.50
sys 0.08
```

The generated file contains explicit `/work/melee` paths and no bare `wine`. Its SHA-256 is:

```text
eace8cad3f2ec79b1cdc0a7e76ddb115ef84078b5c988ba4366e12e139989a3c  melee/build.ninja
```

Cache shim installation command:

```sh
DOCKER_CONFIG=/private/tmp/melee-acceptance/.docker \
docker run --platform linux/amd64 --rm \
  -v /private/tmp/melee-acceptance:/work -w /work \
  melee-acceptance:bookworm-amd64 \
  sh -c '/usr/bin/time -p python3 image-tools/install_mwcc_cache.py /work/melee'
```

Output:

```text
Renamed real wibo: /work/melee/build/tools/wibo -> /work/melee/build/tools/wibo-real
Installed MWCC object-cache shim: /work/image-tools/mwcc_objcache.py -> /work/melee/build/tools/wibo (copy)
Pinned shim interpreter: /usr/bin/python3
real 0.13
user 0.11
sys 0.02
```

Build containers exported:

```sh
export ORCH_TOOL_PLATFORM=linux-i686
export ORCH_GLOBAL_COMPILE_SLOTS=12
export MWCC_CACHE_DIR=/work/melee/build/mwcc-objcache
```

The main cache is sandbox-local, contains 6,452 files, and occupies 93 MiB. No volume was used for it.

Regeneration caused `dtk split` to rewrite 1,075 split objects, so Ninja rebuilt 1,075 TUs offline with all 12 cores and warmed the cache. It completed rather than approaching the multi-hour stop condition:

```text
[1/2] SPLIT config/GALE01/config.yml
[2/2] RUN configure.py
[1/1076] ...
...
[1075/1076] ...
[1076/1076] /work/melee/build/tools/objdiff-cli report generate --config functionRelocDiffs=data_value -o build/GALE01/report.json
 INFO Loading project .
 INFO Generating report for 1075 units (using 12 threads)
 INFO Report generated in 3.352s
 INFO Writing to build/GALE01/report.json
real 166.98
user 1596.41
sys 224.91
```

## Check 1 — PASS

Exact inner command, executed in a `--network none`, `--platform linux/amd64` container from `/work/melee`:

```sh
file build/tools/wibo-real build/tools/wibo
head -n 2 build/tools/wibo
```

Output:

```text
build/tools/wibo-real: ELF 32-bit LSB executable, Intel 80386, version 1 (SYSV), statically linked, for GNU/Linux 3.2.0, BuildID[sha1]=39d7744661d416001bc6f9d1fbf398d7cad251f1, not stripped
build/tools/wibo:      Python script, ASCII text executable
#!/usr/bin/python3
# Installed by install_mwcc_cache.py (MWCC object cache).
```

Final hashes:

```text
52b55c0990218a1476bb9d9c947e8847b58c849e214e26fcedabf99d542cbec7  build/tools/wibo-real
abf5e5e55f34cf2028069eeac748f2febf6eb126bf4ac0f14a7c15e54134600a  build/tools/wibo
```

## Check 2 — PASS

Exact inner command:

```sh
file build/tools/objdiff-cli build/tools/dtk
find build/binutils -maxdepth 1 -type f -perm /111 -print0 | sort -z | xargs -0 file
```

Output:

```text
build/tools/objdiff-cli: ELF 64-bit LSB pie executable, x86-64, version 1 (SYSV), static-pie linked, BuildID[sha1]=202ec42d60b74919ea1ded4a8113a6fd0ce06077, not stripped
build/tools/dtk:         ELF 64-bit LSB executable, x86-64, version 1 (SYSV), statically linked, stripped
build/binutils/powerpc-eabi-addr2line: ELF 64-bit LSB executable, x86-64, version 1 (SYSV), statically linked, stripped
build/binutils/powerpc-eabi-ar:        ELF 64-bit LSB executable, x86-64, version 1 (SYSV), statically linked, stripped
build/binutils/powerpc-eabi-as:        ELF 64-bit LSB executable, x86-64, version 1 (SYSV), statically linked, stripped
build/binutils/powerpc-eabi-c++filt:   ELF 64-bit LSB executable, x86-64, version 1 (SYSV), statically linked, stripped
build/binutils/powerpc-eabi-elfedit:   ELF 64-bit LSB executable, x86-64, version 1 (SYSV), statically linked, stripped
build/binutils/powerpc-eabi-embedspu:  POSIX shell script, ASCII text executable
build/binutils/powerpc-eabi-ld:        ELF 64-bit LSB executable, x86-64, version 1 (SYSV), statically linked, stripped
build/binutils/powerpc-eabi-ld.bfd:    ELF 64-bit LSB executable, x86-64, version 1 (SYSV), statically linked, stripped
build/binutils/powerpc-eabi-nm:        ELF 64-bit LSB executable, x86-64, version 1 (SYSV), statically linked, stripped
build/binutils/powerpc-eabi-objcopy:   ELF 64-bit LSB executable, x86-64, version 1 (SYSV), statically linked, stripped
build/binutils/powerpc-eabi-objdump:   ELF 64-bit LSB executable, x86-64, version 1 (SYSV), statically linked, stripped
build/binutils/powerpc-eabi-ranlib:    ELF 64-bit LSB executable, x86-64, version 1 (SYSV), statically linked, stripped
build/binutils/powerpc-eabi-readelf:   ELF 64-bit LSB executable, x86-64, version 1 (SYSV), statically linked, stripped
build/binutils/powerpc-eabi-size:      ELF 64-bit LSB executable, x86-64, version 1 (SYSV), statically linked, stripped
build/binutils/powerpc-eabi-strings:   ELF 64-bit LSB executable, x86-64, version 1 (SYSV), statically linked, stripped
build/binutils/powerpc-eabi-strip:     ELF 64-bit LSB executable, x86-64, version 1 (SYSV), statically linked, stripped
```

Hashes:

```text
2f9a820543c39feead53b799b6d4a441cdb43c20b5f0034dd14f449528f2d91a  build/tools/objdiff-cli
97c60d797aa6d87093c367d7667c77c03204e91b825b6fdd6361e29468865d76  build/tools/dtk
```

## Check 3 — PASS

Exact inner command:

```sh
test -d build/compilers && printf 'build/compilers: EXISTS directory\n'
test -f build/tools/sjiswrap.exe && printf 'build/tools/sjiswrap.exe: EXISTS file\n'
test -f build.ninja && printf 'build.ninja: EXISTS file\n'
obj_count=$(find build/GALE01 -name '*.o' -type f | wc -l)
printf 'object files: %s EXIST\n' "$obj_count"
test -f build/GALE01/report.json && printf 'build/GALE01/report.json: EXISTS file\n'
```

Output:

```text
build/compilers: EXISTS directory
build/tools/sjiswrap.exe: EXISTS file
build.ninja: EXISTS file
object files: 2179 EXIST
build/GALE01/report.json: EXISTS file
```

Supplementary clone evidence:

```text
head=1e28b4203bf5b53d9399e90c22bd287de0d64657
head_type=commit
shallow=true
```

## Check 4 — PASS

Exact outer command:

```sh
DOCKER_CONFIG=/private/tmp/melee-acceptance/.docker \
docker run --platform linux/amd64 --rm --network none \
  -v /private/tmp/melee-acceptance:/work -w /work/melee \
  melee-acceptance:bookworm-amd64 /work/run_check4.sh
```

The invoked script touched the source, ran the exact Ninja object target, then piped the rebuilt candidate path to the requested score-server baseline and function:

```sh
touch src/melee/lb/lbmemory.c
/usr/bin/time -p ninja -v build/GALE01/src/melee/lb/lbmemory.o
printf '%s\n' build/GALE01/src/melee/lb/lbmemory.o | \
  build/tools/objdiff-cli score \
  build/GALE01/obj/melee/lb/lbmemory.o lbMemory_80014FC8
```

Output:

```text
[1/1] /work/melee/build/tools/wibo /work/melee/build/tools/sjiswrap.exe /work/melee/build/compilers/GC/1.2.5n/mwcceppc.exe -nowraplines -cwd source -Cpp_exceptions off -proc gekko -fp hardware -align powerpc -nosyspath -fp_contract on -O4,p -multibyte -enum int -nodefaults -inline auto -pragma "cats off" -pragma "warn_notinlined off" -RTTI off -str reuse -DBUILD_VERSION=0 -DVERSION_GALE01 -maxerrors 1 -msgstyle std -warn off -i src -i src/MSL -i src/Runtime -i extern/dolphin/include -i src/melee -i src/melee/ft/chara -i src/sysdolphin -lang=c -sym on -MMD -c src/melee/lb/lbmemory.c -o build/GALE01/src/melee/lb && "/usr/bin/python3" tools/transform_dep.py build/GALE01/src/melee/lb/lbmemory.d build/GALE01/src/melee/lb/lbmemory.d
real 0.35
user 0.30
sys 0.05
READY
675674 05a2692e7c8fbcf505de568af257b7e8204dfb2b4b05d6c77400586e0e9973ed
score_protocol=VALID two_fields wall_ns=68102391
```

The response after `READY` has exactly two fields: a decimal score and a 64-character lowercase hexadecimal digest.

The prompt's absolute binary path was also run verbatim in an offline container:

```sh
printf '%s\n' build/GALE01/src/melee/lb/lbmemory.o | \
  /work/melee/build/tools/objdiff-cli score \
  build/GALE01/obj/melee/lb/lbmemory.o lbMemory_80014FC8
```

```text
READY
675674 05a2692e7c8fbcf505de568af257b7e8204dfb2b4b05d6c77400586e0e9973ed
```

## Check 5 — FAIL

### Required literal no-op target — FAIL

Exact command, run offline from `/work/melee`:

```sh
DOCKER_CONFIG=/private/tmp/melee-acceptance/.docker \
docker run --platform linux/amd64 --rm --network none \
  -v /private/tmp/melee-acceptance:/work -w /work/melee \
  -e ORCH_TOOL_PLATFORM=linux-i686 \
  -e ORCH_GLOBAL_COMPILE_SLOTS=12 \
  -e MWCC_CACHE_DIR=/work/melee/build/mwcc-objcache \
  melee-acceptance:bookworm-amd64 \
  sh -c '/usr/bin/time -p ninja report.json'
```

Output and exit result:

```text
ninja: error: unknown target 'report.json'
real 0.06
user 0.04
sys 0.01
exit: nonzero
```

Generated-target evidence:

```sh
rg -n '^build .*report\.json' melee/build.ninja
ninja -t targets all | grep 'report.json'
```

```text
26814:build build/GALE01/report.json: report | $
build/GALE01/report.json: report
```

There is no `report.json` alias. The concrete target is warm and no-op:

```sh
ninja build/GALE01/report.json
```

```text
ninja: no work to do.
real 0.05
user 0.04
sys 0.01
```

No alias or other bundle change was added to force a pass.

### Representative edit/rebuild/score — PASS

The unique source token at `src/melee/lb/lbmemory.c:126` was changed with an explicit patch:

```diff
-    least_leftover = 0x40000000U;
+    least_leftover = 0x40000001U;
```

Exact offline rebuild and score commands:

```sh
ninja -v build/GALE01/src/melee/lb/lbmemory.o
printf '%s\n' build/GALE01/src/melee/lb/lbmemory.o | \
  build/tools/objdiff-cli score \
  build/GALE01/obj/melee/lb/lbmemory.o lbMemory_80014FC8
```

Output:

```text
[1/1] /work/melee/build/tools/wibo /work/melee/build/tools/sjiswrap.exe /work/melee/build/compilers/GC/1.2.5n/mwcceppc.exe -nowraplines -cwd source -Cpp_exceptions off -proc gekko -fp hardware -align powerpc -nosyspath -fp_contract on -O4,p -multibyte -enum int -nodefaults -inline auto -pragma "cats off" -pragma "warn_notinlined off" -RTTI off -str reuse -DBUILD_VERSION=0 -DVERSION_GALE01 -maxerrors 1 -msgstyle std -warn off -i src -i src/MSL -i src/Runtime -i extern/dolphin/include -i src/melee -i src/melee/ft/chara -i src/sysdolphin -lang=c -sym on -MMD -c src/melee/lb/lbmemory.c -o build/GALE01/src/melee/lb && "/usr/bin/python3" tools/transform_dep.py build/GALE01/src/melee/lb/lbmemory.d build/GALE01/src/melee/lb/lbmemory.d
real 0.69
user 0.62
sys 0.06
READY
5824326 349ad6d395859c047e798f322aa1362e25be4508cf5beb0b69d04e9a8ad66264
score_protocol=VALID two_fields wall_ns=68897885
```

The edit was reversed. Final source and object evidence:

```text
3c3b5558f34a9fc5ed1f5e20b6e6da4a558972148183971b711cbb09b7282138  src/melee/lb/lbmemory.c
source_diff_lines=0
b15da0f8b9996d126bbcd02e1846c83d52affb0dce25a4fc4a3093e17800fece  build/GALE01/src/melee/lb/lbmemory.o
```

## Fresh-cache byte-identity evidence

This test used `/work/melee/build/mwcc-objcache-identity-fresh`, asserted that it did not exist before compilation, touched all three sources, and rebuilt all three objects concurrently under the wibo shim in a `--network none` container:

```sh
test ! -e /work/melee/build/mwcc-objcache-identity-fresh
export MWCC_CACHE_DIR=/work/melee/build/mwcc-objcache-identity-fresh
sha256sum \
  build/GALE01/src/melee/lb/lbmemory.o \
  build/GALE01/src/Runtime/runtime.o \
  build/GALE01/src/MSL/errno.o
touch src/melee/lb/lbmemory.c src/Runtime/runtime.c src/MSL/errno.c
ninja -v -j 3 \
  build/GALE01/src/melee/lb/lbmemory.o \
  build/GALE01/src/Runtime/runtime.o \
  build/GALE01/src/MSL/errno.o
sha256sum \
  build/GALE01/src/melee/lb/lbmemory.o \
  build/GALE01/src/Runtime/runtime.o \
  build/GALE01/src/MSL/errno.o
```

Because the cache directory did not exist, all three shim lookups were misses and real MWCC executions occurred. The new cache contained 20 files (132 KiB) afterward.

| Translation unit | Shipped SHA-256 | Rebuilt SHA-256 | Result |
|---|---|---|---|
| `src/melee/lb/lbmemory.c` | `b15da0f8b9996d126bbcd02e1846c83d52affb0dce25a4fc4a3093e17800fece` | `b15da0f8b9996d126bbcd02e1846c83d52affb0dce25a4fc4a3093e17800fece` | IDENTICAL |
| `src/Runtime/runtime.c` | `df6bb9cbeca083768b9e3147a92bede8b1c91931438d3022ff931620067808fe` | `df6bb9cbeca083768b9e3147a92bede8b1c91931438d3022ff931620067808fe` | IDENTICAL |
| `src/MSL/errno.c` | `e90a87f754068c3025b13f4676ae9c1c329512dfee07ebee73b13497fd72cc51` | `e90a87f754068c3025b13f4676ae9c1c329512dfee07ebee73b13497fd72cc51` | IDENTICAL |

Build timing/output tail:

```text
[1/3] ... src/MSL/errno.c ...
[2/3] ... src/Runtime/runtime.c ...
[3/3] ... src/melee/lb/lbmemory.c ...
real 0.73
user 1.63
sys 0.17
fresh_cache_files=20
```

## Wall-clock timings

Times labeled “instrumented” are `/usr/bin/time -p` or nanosecond measurements from inside the container. Harness-observed times include command startup/teardown.

| Step | Wall time |
|---|---:|
| Read full 95-line MANIFEST | 0.2 s harness-observed |
| Decompress/extract bundle and discover wrapper directory | 29.0 s harness-observed |
| Move payload dirs and preserve macOS build.ninja | 0.1 s harness-observed |
| Fetch dtk | 2.54 s instrumented |
| Fetch binutils | 2.66 s instrumented |
| Replace stale macOS dtk/binutils | 0.3 s harness-observed |
| Pull amd64 Debian base | 13.3 s harness-observed |
| Install container packages | 57.3 s harness-observed |
| Regenerate build.ninja | 0.58 s instrumented |
| Install MWCC cache shim | 0.13 s instrumented |
| Checks 1–3 plus initial dry-run | 4.3 s harness-observed |
| Offline warm rebuild/report | 166.98 s instrumented |
| Check 4 touch/object rebuild | 0.35 s instrumented |
| Check 4 score request | 0.068102391 s instrumented |
| Three-TU fresh-cache rebuild | 0.73 s instrumented |
| Refresh report after identity test | 3.51 s instrumented |
| Check 5 concrete-target no-op | 0.05 s instrumented |
| Check 5 edited-TU rebuild | 0.69 s instrumented |
| Check 5 edited-TU score | 0.068897885 s instrumented |
| Revert source and restore warm object/report | 3.75 s instrumented |
| Literal `ninja report.json` failure | 0.06 s instrumented |

## Failure classification

No wibo or MWCC misbehavior was observed: 1,075 warm-up TUs compiled successfully, the required touched object compiled, the representative edited object compiled, and three fresh-cache MWCC recompiles were byte-identical.

No local amd64/Rosetta-emulation limitation was observed: the amd64 container reported `x86_64`, the static i686 wibo executed successfully, Linux x86-64 dtk/binutils/objdiff executed successfully, and all offline build/score operations completed.

The sole failure is independent of compiler execution and emulation: generated `build.ninja` exposes only `build/GALE01/report.json`, while the MANIFEST requires the literal alias `report.json`.

ACCEPTANCE: FAIL check 5
