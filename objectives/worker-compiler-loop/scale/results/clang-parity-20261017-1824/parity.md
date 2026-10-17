# clang-21 verdict parity in the built image (clang-parity-20261017-1824)

Gate (readiness item 5, LIVE-RUNBOOK step 4): **PASS**: 137/137 group verdicts equal; analysis outcome equal on both manifests: yes.

| Manifest | Verdicts equal | Host analysis | Sandbox analysis | Host mix | Sandbox mix | Host reduce s | Sandbox reduce s (exec wall) |
|---|---|---|---|---|---|---|---|
| 1 | 76/76 (sandbox groups 76) | incomplete | incomplete | {'removable': 73, 'unresolved': 2, 'real': 1} | {'removable': 73, 'unresolved': 2, 'real': 1} | 21.6 | 35.7 (36) |
| 2 | 61/61 (sandbox groups 61) | complete | complete | {'removable': 61} | {'removable': 61} | 18.9 | 28.0 (28) |

Mismatches: none

- Sandbox: `23614d18-2433-442d-9b8b-22d1f2dbeb7a`, snapshot `sms-sandbox-20261018-a5778b1-4-core` (baked `a5778b1f`), profile 4-core.
- Sandbox clang: `Debian clang version 21.1.8 (++20251221032947+2078da43e25a-1~exp1~20251221153113.67)`. Host clang: `Apple clang version 21.0.0 (clang-2100.1.1.101)`.
- Wall time: provision 12 s, reduce 36 s / 28 s, total 80 s.
- Cleanup: sandbox deleted in `finally`; the kill switch found 1, deleted 1 (`remaining: 1` was the sandbox still in DESTROYING). A recheck of `daytona sandbox list` a minute later: no sandboxes.
- Inputs: the note's original manifests and host reports were not archived, so both were rebuilt host-side in a `git clone --shared` scratch of the SMS checkout at `2372fda6` (base `fa5d5210`), with `build/GMSJ01/{config.json,include}` copied in and no `compile_commands.json` (flags from `ir_oracle_flags/sms.json`). Host `reduce` with `/usr/bin/clang` reproduced the note's host results exactly: 76 groups (73 removable, 2 unresolved, 1 real; incomplete on `src/Map/BathWaterManager.cpp@0.0`) and 61 groups (61 removable, complete).
- Files in this directory: `manifest{1,2}.json`, `host-reduce{1,2}.json`, `sandbox-reduce{1,2}.json`, `run.json`.
