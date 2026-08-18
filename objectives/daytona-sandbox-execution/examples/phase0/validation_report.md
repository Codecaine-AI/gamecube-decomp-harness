# objdiff-cli score-server validation report

**PASS — 98/98 exact response comparisons.**

The rebuilt macOS server matched the golden oracle in 49/49 cases. The static Linux musl server matched the same golden outputs in 49/49 cases under an amd64 container.

## Binary identities

| Artifact | Bytes | SHA-256 | Format |
|---|---:|---|---|
| Golden macOS arm64 oracle | 8674992 | `88aa2629032fa51889216df3ce821e585386dafbb0aec0a0f132908debdf67ae` | Mach-O 64-bit executable arm64 |
| Rebuilt macOS arm64 | 8677072 | `1d11e94f9e74d29c448cae1ca714fb90b2592e51707d1b6c16bb52abe9b2b60b` | Mach-O 64-bit executable arm64 |
| Linux x86_64 musl | 10556552 | `2f9a820543c39feead53b799b6d4a441cdb43c20b5f0034dd14f449528f2d91a` | ELF 64-bit LSB pie executable, x86-64, version 1 (SYSV), static-pie linked, BuildID[sha1]=202ec42d60b74919ea1ded4a8113a6fd0ce06077, not stripped |

Patch SHA-256: `965e790432a1e573a2b937d99c43abd640f4bea34c8abae3648b804ef0505f6b`; size: 5967 bytes.

## Contract checked

1. Startup emits and flushes exactly `READY`.
2. Each valid request emits exactly `<raw-score> <code-hash>`.
3. Errors emit one `ERR <single-line message>` response and the server continues.
4. Diff configuration is exactly `functionRelocDiffs=data_value`.
5. Raw score is `max(0, round((100.0 - match_percent) * 1_000_000))` with Python-compatible ties-to-even rounding.
6. Code hash is SHA-256 of the target-side symbol JSON with sorted keys and compact separators.

## Battery selection

| Unit | Symbol | Size | Target object | Different object |
|---|---|---:|---|---|
| `main/melee/lb/lbmemory` | `lbMemory_80014FC8` | 296 | `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/checkout/build/GALE01/obj/melee/lb/lbmemory.o` | `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/checkout/build/GALE01/obj/sysdolphin/baselib/jobj.o` |
| `main/melee/cm/camera` | `Camera_80028B9C` | 960 | `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/checkout/build/GALE01/obj/melee/cm/camera.o` | `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/checkout/build/GALE01/obj/dolphin/vi/vi.o` |
| `main/melee/pl/player` | `Player_GetPtrForSlot` | 108 | `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/checkout/build/GALE01/obj/melee/pl/player.o` | `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/checkout/build/GALE01/obj/melee/gr/grvenom.o` |
| `main/melee/ft/fighter` | `Fighter_800679B0` | 212 | `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/checkout/build/GALE01/obj/melee/ft/fighter.o` | `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/checkout/build/GALE01/obj/melee/lb/lbmemory.o` |
| `main/melee/gr/grvenom` | `grVenom_8020362C` | 1256 | `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/checkout/build/GALE01/obj/melee/gr/grvenom.o` | `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/checkout/build/GALE01/obj/dolphin/vi/vi.o` |
| `main/dolphin/vi/vi` | `__VIRetraceHandler` | 552 | `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/checkout/build/GALE01/obj/dolphin/vi/vi.o` | `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/checkout/build/GALE01/obj/melee/ft/fighter.o` |
| `main/sysdolphin/baselib/jobj` | `HSD_JObjCheckDepend` | 300 | `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/checkout/build/GALE01/obj/sysdolphin/baselib/jobj.o` | `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/checkout/build/GALE01/obj/melee/cm/camera.o` |

For each symbol, `perturb_one` XORs the low byte of the first instruction with `0x01`. `perturb_two` flips three instruction bytes with masks `0x20`, `0x04`, and `0x08`. ELF headers, section tables, symbol tables, and relocations are left intact.

Request order is deliberate: the missing path is followed immediately by `self_after_nonexistent`; the structurally different object is followed by `self_after_structural_error`. Both prove continued service after ERR.

## Handshake and framing

| Unit | macOS READY | Linux READY | macOS line count | Linux line count |
|---|---|---|---|---|
| `lbmemory` | PASS | PASS | PASS | PASS |
| `camera` | PASS | PASS | PASS | PASS |
| `player` | PASS | PASS | PASS | PASS |
| `fighter` | PASS | PASS | PASS | PASS |
| `grvenom` | PASS | PASS | PASS | PASS |
| `vi` | PASS | PASS | PASS | PASS |
| `jobj` | PASS | PASS | PASS | PASS |

## Full response matrix

### main/melee/lb/lbmemory — lbMemory_80014FC8

| Case | Candidate | Golden output | macOS rebuilt output | macOS | Linux musl output | Linux |
|---|---|---|---|---|---|---|
| `self` | `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/checkout/build/GALE01/obj/melee/lb/lbmemory.o` | `0 8182af2a1e69eff4bd094e8cab5b2e6e2f4e8473f1f3f4808c178df562297a5a` | `0 8182af2a1e69eff4bd094e8cab5b2e6e2f4e8473f1f3f4808c178df562297a5a` | PASS | `0 8182af2a1e69eff4bd094e8cab5b2e6e2f4e8473f1f3f4808c178df562297a5a` | PASS |
| `perturb_one` | `/private/tmp/objdiff-score-rebuild/work/lbmemory-perturb-one.o` | `810814 b9e8b46334b8eb017de4055c773c0d3ae7ea51a07a6b8da9fdf102e97164af38` | `810814 b9e8b46334b8eb017de4055c773c0d3ae7ea51a07a6b8da9fdf102e97164af38` | PASS | `810814 b9e8b46334b8eb017de4055c773c0d3ae7ea51a07a6b8da9fdf102e97164af38` | PASS |
| `nonexistent` | `/private/tmp/objdiff-score-rebuild/work/lbmemory-nonexistent.o` | `ERR Loading candidate /private/tmp/objdiff-score-rebuild/work/lbmemory-nonexistent.o: No such file or directory (os error 2)` | `ERR Loading candidate /private/tmp/objdiff-score-rebuild/work/lbmemory-nonexistent.o: No such file or directory (os error 2)` | PASS | `ERR Loading candidate /private/tmp/objdiff-score-rebuild/work/lbmemory-nonexistent.o: No such file or directory (os error 2)` | PASS |
| `self_after_nonexistent` | `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/checkout/build/GALE01/obj/melee/lb/lbmemory.o` | `0 8182af2a1e69eff4bd094e8cab5b2e6e2f4e8473f1f3f4808c178df562297a5a` | `0 8182af2a1e69eff4bd094e8cab5b2e6e2f4e8473f1f3f4808c178df562297a5a` | PASS | `0 8182af2a1e69eff4bd094e8cab5b2e6e2f4e8473f1f3f4808c178df562297a5a` | PASS |
| `perturb_two` | `/private/tmp/objdiff-score-rebuild/work/lbmemory-perturb-two.o` | `1635130 a2d8b5a94778038886b480048c8897dc0032fd023216fab3b0d2bef06632a59c` | `1635130 a2d8b5a94778038886b480048c8897dc0032fd023216fab3b0d2bef06632a59c` | PASS | `1635130 a2d8b5a94778038886b480048c8897dc0032fd023216fab3b0d2bef06632a59c` | PASS |
| `structurally_different` | `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/checkout/build/GALE01/obj/sysdolphin/baselib/jobj.o` | `ERR Symbol not found in candidate: lbMemory_80014FC8` | `ERR Symbol not found in candidate: lbMemory_80014FC8` | PASS | `ERR Symbol not found in candidate: lbMemory_80014FC8` | PASS |
| `self_after_structural_error` | `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/checkout/build/GALE01/obj/melee/lb/lbmemory.o` | `0 8182af2a1e69eff4bd094e8cab5b2e6e2f4e8473f1f3f4808c178df562297a5a` | `0 8182af2a1e69eff4bd094e8cab5b2e6e2f4e8473f1f3f4808c178df562297a5a` | PASS | `0 8182af2a1e69eff4bd094e8cab5b2e6e2f4e8473f1f3f4808c178df562297a5a` | PASS |

### main/melee/cm/camera — Camera_80028B9C

| Case | Candidate | Golden output | macOS rebuilt output | macOS | Linux musl output | Linux |
|---|---|---|---|---|---|---|
| `self` | `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/checkout/build/GALE01/obj/melee/cm/camera.o` | `0 68978b7f35381f2d661bc8870d336c4a6f073e3ffc25f0988f249dd3cd76f18c` | `0 68978b7f35381f2d661bc8870d336c4a6f073e3ffc25f0988f249dd3cd76f18c` | PASS | `0 68978b7f35381f2d661bc8870d336c4a6f073e3ffc25f0988f249dd3cd76f18c` | PASS |
| `perturb_one` | `/private/tmp/objdiff-score-rebuild/work/camera-perturb-one.o` | `250000 aa6839b5f1025bc16431d412be569410a1f975584d5613cc22d6ee64ec4cc1de` | `250000 aa6839b5f1025bc16431d412be569410a1f975584d5613cc22d6ee64ec4cc1de` | PASS | `250000 aa6839b5f1025bc16431d412be569410a1f975584d5613cc22d6ee64ec4cc1de` | PASS |
| `nonexistent` | `/private/tmp/objdiff-score-rebuild/work/camera-nonexistent.o` | `ERR Loading candidate /private/tmp/objdiff-score-rebuild/work/camera-nonexistent.o: No such file or directory (os error 2)` | `ERR Loading candidate /private/tmp/objdiff-score-rebuild/work/camera-nonexistent.o: No such file or directory (os error 2)` | PASS | `ERR Loading candidate /private/tmp/objdiff-score-rebuild/work/camera-nonexistent.o: No such file or directory (os error 2)` | PASS |
| `self_after_nonexistent` | `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/checkout/build/GALE01/obj/melee/cm/camera.o` | `0 68978b7f35381f2d661bc8870d336c4a6f073e3ffc25f0988f249dd3cd76f18c` | `0 68978b7f35381f2d661bc8870d336c4a6f073e3ffc25f0988f249dd3cd76f18c` | PASS | `0 68978b7f35381f2d661bc8870d336c4a6f073e3ffc25f0988f249dd3cd76f18c` | PASS |
| `perturb_two` | `/private/tmp/objdiff-score-rebuild/work/camera-perturb-two.o` | `520836 fb2e5c425e9dc686080274d1bcc72bd8fcbc62cb1adb13f35b957437f8112036` | `520836 fb2e5c425e9dc686080274d1bcc72bd8fcbc62cb1adb13f35b957437f8112036` | PASS | `520836 fb2e5c425e9dc686080274d1bcc72bd8fcbc62cb1adb13f35b957437f8112036` | PASS |
| `structurally_different` | `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/checkout/build/GALE01/obj/dolphin/vi/vi.o` | `ERR Symbol not found in candidate: Camera_80028B9C` | `ERR Symbol not found in candidate: Camera_80028B9C` | PASS | `ERR Symbol not found in candidate: Camera_80028B9C` | PASS |
| `self_after_structural_error` | `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/checkout/build/GALE01/obj/melee/cm/camera.o` | `0 68978b7f35381f2d661bc8870d336c4a6f073e3ffc25f0988f249dd3cd76f18c` | `0 68978b7f35381f2d661bc8870d336c4a6f073e3ffc25f0988f249dd3cd76f18c` | PASS | `0 68978b7f35381f2d661bc8870d336c4a6f073e3ffc25f0988f249dd3cd76f18c` | PASS |

### main/melee/pl/player — Player_GetPtrForSlot

| Case | Candidate | Golden output | macOS rebuilt output | macOS | Linux musl output | Linux |
|---|---|---|---|---|---|---|
| `self` | `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/checkout/build/GALE01/obj/melee/pl/player.o` | `0 bee5ef75ba8bca047c659a6dca2f08fee1088f01f09d5ee36e927752ba61e543` | `0 bee5ef75ba8bca047c659a6dca2f08fee1088f01f09d5ee36e927752ba61e543` | PASS | `0 bee5ef75ba8bca047c659a6dca2f08fee1088f01f09d5ee36e927752ba61e543` | PASS |
| `perturb_one` | `/private/tmp/objdiff-score-rebuild/work/player-perturb-one.o` | `2222220 2149c652ddc69a1ad531faf00ac4dbc561c1460a0a316efd16030d1805e62b71` | `2222220 2149c652ddc69a1ad531faf00ac4dbc561c1460a0a316efd16030d1805e62b71` | PASS | `2222220 2149c652ddc69a1ad531faf00ac4dbc561c1460a0a316efd16030d1805e62b71` | PASS |
| `nonexistent` | `/private/tmp/objdiff-score-rebuild/work/player-nonexistent.o` | `ERR Loading candidate /private/tmp/objdiff-score-rebuild/work/player-nonexistent.o: No such file or directory (os error 2)` | `ERR Loading candidate /private/tmp/objdiff-score-rebuild/work/player-nonexistent.o: No such file or directory (os error 2)` | PASS | `ERR Loading candidate /private/tmp/objdiff-score-rebuild/work/player-nonexistent.o: No such file or directory (os error 2)` | PASS |
| `self_after_nonexistent` | `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/checkout/build/GALE01/obj/melee/pl/player.o` | `0 bee5ef75ba8bca047c659a6dca2f08fee1088f01f09d5ee36e927752ba61e543` | `0 bee5ef75ba8bca047c659a6dca2f08fee1088f01f09d5ee36e927752ba61e543` | PASS | `0 bee5ef75ba8bca047c659a6dca2f08fee1088f01f09d5ee36e927752ba61e543` | PASS |
| `perturb_two` | `/private/tmp/objdiff-score-rebuild/work/player-perturb-two.o` | `4444440 8fc56154e386a12a1590c041ce27d9f4d3304a78ddb0ddc7bfee06378839073b` | `4444440 8fc56154e386a12a1590c041ce27d9f4d3304a78ddb0ddc7bfee06378839073b` | PASS | `4444440 8fc56154e386a12a1590c041ce27d9f4d3304a78ddb0ddc7bfee06378839073b` | PASS |
| `structurally_different` | `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/checkout/build/GALE01/obj/melee/gr/grvenom.o` | `ERR Symbol not found in candidate: Player_GetPtrForSlot` | `ERR Symbol not found in candidate: Player_GetPtrForSlot` | PASS | `ERR Symbol not found in candidate: Player_GetPtrForSlot` | PASS |
| `self_after_structural_error` | `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/checkout/build/GALE01/obj/melee/pl/player.o` | `0 bee5ef75ba8bca047c659a6dca2f08fee1088f01f09d5ee36e927752ba61e543` | `0 bee5ef75ba8bca047c659a6dca2f08fee1088f01f09d5ee36e927752ba61e543` | PASS | `0 bee5ef75ba8bca047c659a6dca2f08fee1088f01f09d5ee36e927752ba61e543` | PASS |

### main/melee/ft/fighter — Fighter_800679B0

| Case | Candidate | Golden output | macOS rebuilt output | macOS | Linux musl output | Linux |
|---|---|---|---|---|---|---|
| `self` | `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/checkout/build/GALE01/obj/melee/ft/fighter.o` | `0 9d53c99b41e054427bcf805f2e980ec08fe26ab64ee083cc1dfddd3b9576a08a` | `0 9d53c99b41e054427bcf805f2e980ec08fe26ab64ee083cc1dfddd3b9576a08a` | PASS | `0 9d53c99b41e054427bcf805f2e980ec08fe26ab64ee083cc1dfddd3b9576a08a` | PASS |
| `perturb_one` | `/private/tmp/objdiff-score-rebuild/work/fighter-perturb-one.o` | `1132070 0cf534fe9e8906d9c80642a9f04788c40cf3beae54704d02622f34bae9227e73` | `1132070 0cf534fe9e8906d9c80642a9f04788c40cf3beae54704d02622f34bae9227e73` | PASS | `1132070 0cf534fe9e8906d9c80642a9f04788c40cf3beae54704d02622f34bae9227e73` | PASS |
| `nonexistent` | `/private/tmp/objdiff-score-rebuild/work/fighter-nonexistent.o` | `ERR Loading candidate /private/tmp/objdiff-score-rebuild/work/fighter-nonexistent.o: No such file or directory (os error 2)` | `ERR Loading candidate /private/tmp/objdiff-score-rebuild/work/fighter-nonexistent.o: No such file or directory (os error 2)` | PASS | `ERR Loading candidate /private/tmp/objdiff-score-rebuild/work/fighter-nonexistent.o: No such file or directory (os error 2)` | PASS |
| `self_after_nonexistent` | `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/checkout/build/GALE01/obj/melee/ft/fighter.o` | `0 9d53c99b41e054427bcf805f2e980ec08fe26ab64ee083cc1dfddd3b9576a08a` | `0 9d53c99b41e054427bcf805f2e980ec08fe26ab64ee083cc1dfddd3b9576a08a` | PASS | `0 9d53c99b41e054427bcf805f2e980ec08fe26ab64ee083cc1dfddd3b9576a08a` | PASS |
| `perturb_two` | `/private/tmp/objdiff-score-rebuild/work/fighter-perturb-two.o` | `2283020 a4b1b8459a9660cb36cc176ecf7ec53de91425738c1d6161778c3e9c48c009d5` | `2283020 a4b1b8459a9660cb36cc176ecf7ec53de91425738c1d6161778c3e9c48c009d5` | PASS | `2283020 a4b1b8459a9660cb36cc176ecf7ec53de91425738c1d6161778c3e9c48c009d5` | PASS |
| `structurally_different` | `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/checkout/build/GALE01/obj/melee/lb/lbmemory.o` | `ERR Symbol not found in candidate: Fighter_800679B0` | `ERR Symbol not found in candidate: Fighter_800679B0` | PASS | `ERR Symbol not found in candidate: Fighter_800679B0` | PASS |
| `self_after_structural_error` | `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/checkout/build/GALE01/obj/melee/ft/fighter.o` | `0 9d53c99b41e054427bcf805f2e980ec08fe26ab64ee083cc1dfddd3b9576a08a` | `0 9d53c99b41e054427bcf805f2e980ec08fe26ab64ee083cc1dfddd3b9576a08a` | PASS | `0 9d53c99b41e054427bcf805f2e980ec08fe26ab64ee083cc1dfddd3b9576a08a` | PASS |

### main/melee/gr/grvenom — grVenom_8020362C

| Case | Candidate | Golden output | macOS rebuilt output | macOS | Linux musl output | Linux |
|---|---|---|---|---|---|---|
| `self` | `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/checkout/build/GALE01/obj/melee/gr/grvenom.o` | `0 cb57be0f56993fb3ce2580b4b2573c16aa2e72fac0ed67027f605933ae85af04` | `0 cb57be0f56993fb3ce2580b4b2573c16aa2e72fac0ed67027f605933ae85af04` | PASS | `0 cb57be0f56993fb3ce2580b4b2573c16aa2e72fac0ed67027f605933ae85af04` | PASS |
| `perturb_one` | `/private/tmp/objdiff-score-rebuild/work/grvenom-perturb-one.o` | `191086 4c26bdd4708e18a579a41859200e2284e96d1e7301af67e8cf86b683248a584a` | `191086 4c26bdd4708e18a579a41859200e2284e96d1e7301af67e8cf86b683248a584a` | PASS | `191086 4c26bdd4708e18a579a41859200e2284e96d1e7301af67e8cf86b683248a584a` | PASS |
| `nonexistent` | `/private/tmp/objdiff-score-rebuild/work/grvenom-nonexistent.o` | `ERR Loading candidate /private/tmp/objdiff-score-rebuild/work/grvenom-nonexistent.o: No such file or directory (os error 2)` | `ERR Loading candidate /private/tmp/objdiff-score-rebuild/work/grvenom-nonexistent.o: No such file or directory (os error 2)` | PASS | `ERR Loading candidate /private/tmp/objdiff-score-rebuild/work/grvenom-nonexistent.o: No such file or directory (os error 2)` | PASS |
| `self_after_nonexistent` | `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/checkout/build/GALE01/obj/melee/gr/grvenom.o` | `0 cb57be0f56993fb3ce2580b4b2573c16aa2e72fac0ed67027f605933ae85af04` | `0 cb57be0f56993fb3ce2580b4b2573c16aa2e72fac0ed67027f605933ae85af04` | PASS | `0 cb57be0f56993fb3ce2580b4b2573c16aa2e72fac0ed67027f605933ae85af04` | PASS |
| `perturb_two` | `/private/tmp/objdiff-score-rebuild/work/grvenom-perturb-two.o` | `398090 c2bec9bf80a29d0c912aa7b59638e4292ae61379195696170990ec72a5591dc7` | `398090 c2bec9bf80a29d0c912aa7b59638e4292ae61379195696170990ec72a5591dc7` | PASS | `398090 c2bec9bf80a29d0c912aa7b59638e4292ae61379195696170990ec72a5591dc7` | PASS |
| `structurally_different` | `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/checkout/build/GALE01/obj/dolphin/vi/vi.o` | `ERR Symbol not found in candidate: grVenom_8020362C` | `ERR Symbol not found in candidate: grVenom_8020362C` | PASS | `ERR Symbol not found in candidate: grVenom_8020362C` | PASS |
| `self_after_structural_error` | `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/checkout/build/GALE01/obj/melee/gr/grvenom.o` | `0 cb57be0f56993fb3ce2580b4b2573c16aa2e72fac0ed67027f605933ae85af04` | `0 cb57be0f56993fb3ce2580b4b2573c16aa2e72fac0ed67027f605933ae85af04` | PASS | `0 cb57be0f56993fb3ce2580b4b2573c16aa2e72fac0ed67027f605933ae85af04` | PASS |

### main/dolphin/vi/vi — __VIRetraceHandler

| Case | Candidate | Golden output | macOS rebuilt output | macOS | Linux musl output | Linux |
|---|---|---|---|---|---|---|
| `self` | `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/checkout/build/GALE01/obj/dolphin/vi/vi.o` | `0 26b8fbfba48963a447316130bbb5f397b1ed7f6bb177cbb3751b2c8e13eeaf6b` | `0 26b8fbfba48963a447316130bbb5f397b1ed7f6bb177cbb3751b2c8e13eeaf6b` | PASS | `0 26b8fbfba48963a447316130bbb5f397b1ed7f6bb177cbb3751b2c8e13eeaf6b` | PASS |
| `perturb_one` | `/private/tmp/objdiff-score-rebuild/work/vi-perturb-one.o` | `434784 0b91406cb9af9dd97be47f9e0cd1c6bd9fdb63b1f3f9e7d47cd6559247b231e5` | `434784 0b91406cb9af9dd97be47f9e0cd1c6bd9fdb63b1f3f9e7d47cd6559247b231e5` | PASS | `434784 0b91406cb9af9dd97be47f9e0cd1c6bd9fdb63b1f3f9e7d47cd6559247b231e5` | PASS |
| `nonexistent` | `/private/tmp/objdiff-score-rebuild/work/vi-nonexistent.o` | `ERR Loading candidate /private/tmp/objdiff-score-rebuild/work/vi-nonexistent.o: No such file or directory (os error 2)` | `ERR Loading candidate /private/tmp/objdiff-score-rebuild/work/vi-nonexistent.o: No such file or directory (os error 2)` | PASS | `ERR Loading candidate /private/tmp/objdiff-score-rebuild/work/vi-nonexistent.o: No such file or directory (os error 2)` | PASS |
| `self_after_nonexistent` | `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/checkout/build/GALE01/obj/dolphin/vi/vi.o` | `0 26b8fbfba48963a447316130bbb5f397b1ed7f6bb177cbb3751b2c8e13eeaf6b` | `0 26b8fbfba48963a447316130bbb5f397b1ed7f6bb177cbb3751b2c8e13eeaf6b` | PASS | `0 26b8fbfba48963a447316130bbb5f397b1ed7f6bb177cbb3751b2c8e13eeaf6b` | PASS |
| `perturb_two` | `/private/tmp/objdiff-score-rebuild/work/vi-perturb-two.o` | `869570 26b7a8489798981c3490dea6300814f2b8a504a6619bb04876785d436b75ac22` | `869570 26b7a8489798981c3490dea6300814f2b8a504a6619bb04876785d436b75ac22` | PASS | `869570 26b7a8489798981c3490dea6300814f2b8a504a6619bb04876785d436b75ac22` | PASS |
| `structurally_different` | `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/checkout/build/GALE01/obj/melee/ft/fighter.o` | `ERR Symbol not found in candidate: __VIRetraceHandler` | `ERR Symbol not found in candidate: __VIRetraceHandler` | PASS | `ERR Symbol not found in candidate: __VIRetraceHandler` | PASS |
| `self_after_structural_error` | `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/checkout/build/GALE01/obj/dolphin/vi/vi.o` | `0 26b8fbfba48963a447316130bbb5f397b1ed7f6bb177cbb3751b2c8e13eeaf6b` | `0 26b8fbfba48963a447316130bbb5f397b1ed7f6bb177cbb3751b2c8e13eeaf6b` | PASS | `0 26b8fbfba48963a447316130bbb5f397b1ed7f6bb177cbb3751b2c8e13eeaf6b` | PASS |

### main/sysdolphin/baselib/jobj — HSD_JObjCheckDepend

| Case | Candidate | Golden output | macOS rebuilt output | macOS | Linux musl output | Linux |
|---|---|---|---|---|---|---|
| `self` | `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/checkout/build/GALE01/obj/sysdolphin/baselib/jobj.o` | `0 c2763fa02fd3eea5969930028e7887c034c2a37e68ccb28b419466fcee4c83c8` | `0 c2763fa02fd3eea5969930028e7887c034c2a37e68ccb28b419466fcee4c83c8` | PASS | `0 c2763fa02fd3eea5969930028e7887c034c2a37e68ccb28b419466fcee4c83c8` | PASS |
| `perturb_one` | `/private/tmp/objdiff-score-rebuild/work/jobj-perturb-one.o` | `800000 93d45d779d2387d60db07dc80e1f206c8a9947d9de70d303142e208a1b3a8813` | `800000 93d45d779d2387d60db07dc80e1f206c8a9947d9de70d303142e208a1b3a8813` | PASS | `800000 93d45d779d2387d60db07dc80e1f206c8a9947d9de70d303142e208a1b3a8813` | PASS |
| `nonexistent` | `/private/tmp/objdiff-score-rebuild/work/jobj-nonexistent.o` | `ERR Loading candidate /private/tmp/objdiff-score-rebuild/work/jobj-nonexistent.o: No such file or directory (os error 2)` | `ERR Loading candidate /private/tmp/objdiff-score-rebuild/work/jobj-nonexistent.o: No such file or directory (os error 2)` | PASS | `ERR Loading candidate /private/tmp/objdiff-score-rebuild/work/jobj-nonexistent.o: No such file or directory (os error 2)` | PASS |
| `self_after_nonexistent` | `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/checkout/build/GALE01/obj/sysdolphin/baselib/jobj.o` | `0 c2763fa02fd3eea5969930028e7887c034c2a37e68ccb28b419466fcee4c83c8` | `0 c2763fa02fd3eea5969930028e7887c034c2a37e68ccb28b419466fcee4c83c8` | PASS | `0 c2763fa02fd3eea5969930028e7887c034c2a37e68ccb28b419466fcee4c83c8` | PASS |
| `perturb_two` | `/private/tmp/objdiff-score-rebuild/work/jobj-perturb-two.o` | `1666664 29ffea353f5d85bd67569a5c19226031de1cf06f18d4b25b834f5468e2df6246` | `1666664 29ffea353f5d85bd67569a5c19226031de1cf06f18d4b25b834f5468e2df6246` | PASS | `1666664 29ffea353f5d85bd67569a5c19226031de1cf06f18d4b25b834f5468e2df6246` | PASS |
| `structurally_different` | `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/checkout/build/GALE01/obj/melee/cm/camera.o` | `ERR Symbol not found in candidate: HSD_JObjCheckDepend` | `ERR Symbol not found in candidate: HSD_JObjCheckDepend` | PASS | `ERR Symbol not found in candidate: HSD_JObjCheckDepend` | PASS |
| `self_after_structural_error` | `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/checkout/build/GALE01/obj/sysdolphin/baselib/jobj.o` | `0 c2763fa02fd3eea5969930028e7887c034c2a37e68ccb28b419466fcee4c83c8` | `0 c2763fa02fd3eea5969930028e7887c034c2a37e68ccb28b419466fcee4c83c8` | PASS | `0 c2763fa02fd3eea5969930028e7887c034c2a37e68ccb28b419466fcee4c83c8` | PASS |

## Toolchain and commands

- Native: `rustc 1.88.0 (6b00bc388 2025-06-23)`, host `aarch64-apple-darwin`, LLVM 20.1.5.
- Cargo: `cargo 1.88.0 (873a06493 2025-05-10)`.
- Container compiler: Rust 1.88.0, host `x86_64-unknown-linux-gnu`; target `x86_64-unknown-linux-musl`.
- Docker: `Docker version 29.4.0, build 9d7ad9f`; builder image ID `sha256:e5c9a800822a5c92c37e1c6123d4564ad21d7967a3673ef89c936877370a39b0`.
- Runtime image: `alpine:3.22@sha256:14358309a308569c32bdc37e2e0e9694be33a9d99e68afb0f5ff33cc1f695dce`.

Exact build and validation commands:

```sh
cargo +1.88.0 build --release --bin objdiff-cli
docker build --platform linux/amd64 -f Dockerfile.musl -t objdiff-musl-rust-1.88 .
docker run --rm --platform linux/amd64 -v /private/tmp/objdiff-score-rebuild/objdiff:/work -w /work objdiff-musl-rust-1.88 cargo build --release --target x86_64-unknown-linux-musl --bin objdiff-cli
python3 validation_battery.py --mode native --output work/validation_native.json
python3 validation_battery.py --mode docker --output work/validation_linux.json
```

Additional checks passed:

- `git diff --check`
- `rustfmt +1.88.0 --check objdiff-cli/src/cmd/score.rs`
- Clean clone at commit `66c879a95d45c1170a0834071cab58655fd9773b`: `git apply --check out/score-server.patch`
- Both delivered binaries report objdiff-cli version `3.6.1`.

Validation date: **2026-08-18**.
