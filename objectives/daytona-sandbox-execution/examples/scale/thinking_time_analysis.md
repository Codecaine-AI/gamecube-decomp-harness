# GameCube decomp worker: model-thinking vs tool-execution time

> **Verdict — Build it:** exact complete scale-run claims spend 89.2% of observed Pi-session time in MODEL, implying 89.2% sandbox runtime-cost savings for 7.8% wake-latency overhead.

## Source and method

The requested `/tmp/melee-acceptance/melee/.pi-sessions/` contains **zero worker transcripts** for these run IDs; its matching files are librarians. I recovered the preserved worker snapshots read-only from `/tmp/melee-sandbox-poc-state/runs/<run-id>/worker_state/.../host-cwd/.pi-sessions/`. Every selected binding is `phase=worker`, `agentName=worker`, `role=worker`.

Wall is the first-to-last outer event span of each Pi JSONL. TOOL is the union of each `stopReason=toolUse` assistant-response timestamp through its last matching tool-result timestamp; MODEL = wall − TOOL. The 56 JSONLs are Pi sessions; the economics groups initial/repair sessions into 16 sandbox claims and excludes host validation gaps between sessions.

**Approximation:** Pi lacks per-call scheduler-start timestamps. The assistant and last-result boundaries recover each continuous tool burst but include tiny scheduler gaps. Adjacent telemetry for 525 managed calls shows 0–7 ms boundary error (median 1 ms, p90 2 ms). Parallel batches are unioned, never summed twice.

**Missing data:** session `01a01815-0497…` ends after `turn_start` index 1. Missing are the second assistant/model-completion event, final `turn_end`, `agent_end`, and claim-finish event. Its wall/tool/model totals are right-censored and excluded from exact aggregates. All dispatched calls in all files have results. One error response contains an undispatched tool-call block; it is MODEL/wake time, not TOOL.

## Per Pi worker session

| Rung | Claim | Attempt | Session | Wall s | TOOL s | MODEL s | MODEL % | Turns |
|---|---|---:|---|---:|---:|---:|---:|---:|
| 5-worker | `126efc5c` | 0 | `01a017df` | 374.6 | 32.9 | 341.7 | 91.2% | 29 |
| 5-worker | `126efc5c` | 1 | `01a017e5` | 452.1 | 81.8 | 370.3 | 81.9% | 45 |
| 5-worker | `126efc5c` | 2 | `01a017ed` | 2539.1 | 39.0 | 2500.1 | 98.5% | 49 |
| 5-worker | `126efc5c` | 3 | `01a01815` | ≥15.3† | ≥0.8† | ≥14.5† | — | 1 |
| 5-worker | `17640267` | 0 | `01a017de` | 398.2 | 28.3 | 369.9 | 92.9% | 38 |
| 5-worker | `7fac0de7` | 0 | `01a017df` | 412.6 | 19.9 | 392.7 | 95.2% | 40 |
| 5-worker | `7fac0de7` | 1 | `01a017e6` | 319.7 | 23.8 | 295.9 | 92.6% | 22 |
| 5-worker | `7fac0de7` | 2 | `01a017ed` | 445.5 | 29.9 | 415.6 | 93.3% | 43 |
| 5-worker | `7fac0de7` | 3 | `01a017f4` | 931.1 | 262.4 | 668.7 | 71.8% | 52 |
| 5-worker | `7fac0de7` | 4 | `01a01804` | 564.1 | 128.6 | 435.5 | 77.2% | 45 |
| 5-worker | `9af936f3` | 0 | `01a017de` | 413.6 | 31.7 | 381.9 | 92.3% | 49 |
| 5-worker | `9af936f3` | 1 | `01a017e5` | 387.4 | 28.1 | 359.3 | 92.7% | 38 |
| 5-worker | `9af936f3` | 2 | `01a017eb` | 305.4 | 24.6 | 280.7 | 91.9% | 32 |
| 5-worker | `9af936f3` | 3 | `01a017f0` | 430.7 | 19.8 | 410.9 | 95.4% | 39 |
| 5-worker | `9af936f3` | 4 | `01a017f7` | 1009.7 | 21.0 | 988.8 | 97.9% | 47 |
| 5-worker | `d1d1e111` | 0 | `01a017df` | 266.8 | 13.2 | 253.6 | 95.1% | 27 |
| 10-worker | `1f48bc3a` | 0 | `01a01a44` | 261.3 | 23.1 | 238.2 | 91.2% | 35 |
| 10-worker | `1f48bc3a` | 1 | `01a01a49` | 417.6 | 34.7 | 382.8 | 91.7% | 40 |
| 10-worker | `1f48bc3a` | 2 | `01a01a50` | 440.5 | 43.9 | 396.6 | 90.0% | 57 |
| 10-worker | `1f48bc3a` | 3 | `01a01a58` | 427.2 | 80.4 | 346.7 | 81.2% | 43 |
| 10-worker | `1f48bc3a` | 4 | `01a01a5f` | 423.8 | 33.6 | 390.2 | 92.1% | 59 |
| 10-worker | `2622d185` | 0 | `01a01a42` | 299.3 | 41.7 | 257.6 | 86.1% | 33 |
| 10-worker | `2622d185` | 1 | `01a01a47` | 796.6 | 386.2 | 410.4 | 51.5% | 52 |
| 10-worker | `2622d185` | 2 | `01a01a54` | 336.9 | 28.8 | 308.1 | 91.5% | 35 |
| 10-worker | `2622d185` | 3 | `01a01a59` | 435.3 | 19.6 | 415.7 | 95.5% | 37 |
| 10-worker | `2622d185` | 4 | `01a01a60` | 370.9 | 21.0 | 349.9 | 94.3% | 46 |
| 10-worker | `28b86a9a` | 0 | `01a01a44` | 249.2 | 20.6 | 228.6 | 91.7% | 34 |
| 10-worker | `28b86a9a` | 1 | `01a01a48` | 893.5 | 42.6 | 850.9 | 95.2% | 43 |
| 10-worker | `28b86a9a` | 2 | `01a01a56` | 355.3 | 21.5 | 333.8 | 94.0% | 35 |
| 10-worker | `32500b39` | 0 | `01a01a42` | 523.2 | 99.4 | 423.7 | 81.0% | 47 |
| 10-worker | `32500b39` | 1 | `01a01a4a` | 287.6 | 14.1 | 273.5 | 95.1% | 29 |
| 10-worker | `32500b39` | 2 | `01a01a4f` | 350.2 | 24.5 | 325.7 | 93.0% | 32 |
| 10-worker | `3c0e9c59` | 0 | `01a01a43` | 324.6 | 34.4 | 290.1 | 89.4% | 40 |
| 10-worker | `3c0e9c59` | 1 | `01a01a49` | 402.9 | 32.2 | 370.6 | 92.0% | 33 |
| 10-worker | `3c0e9c59` | 2 | `01a01a50` | 376.5 | 34.3 | 342.2 | 90.9% | 57 |
| 10-worker | `3c0e9c59` | 3 | `01a01a56` | 260.5 | 19.9 | 240.7 | 92.4% | 30 |
| 10-worker | `3c0e9c59` | 4 | `01a01a5b` | 263.7 | 25.2 | 238.5 | 90.4% | 29 |
| 10-worker | `701d5883` | 0 | `01a01a43` | 395.2 | 39.2 | 356.0 | 90.1% | 39 |
| 10-worker | `85689491` | 0 | `01a01a44` | 355.1 | 35.9 | 319.2 | 89.9% | 37 |
| 10-worker | `85689491` | 1 | `01a01a4a` | 426.7 | 33.6 | 393.1 | 92.1% | 53 |
| 10-worker | `85689491` | 2 | `01a01a52` | 314.2 | 30.4 | 283.7 | 90.3% | 42 |
| 10-worker | `85689491` | 3 | `01a01a58` | 365.0 | 31.2 | 333.8 | 91.5% | 32 |
| 10-worker | `85689491` | 4 | `01a01a5e` | 478.5 | 29.5 | 449.0 | 93.8% | 54 |
| 10-worker | `8dc3ebae` | 0 | `01a01a44` | 400.4 | 28.2 | 372.2 | 93.0% | 30 |
| 10-worker | `8dc3ebae` | 1 | `01a01a4a` | 139.4 | 9.9 | 129.5 | 92.9% | 15 |
| 10-worker | `8dc3ebae` | 2 | `01a01a4d` | 915.7 | 38.6 | 877.1 | 95.8% | 43 |
| 10-worker | `8dc3ebae` | 3 | `01a01a5b` | 159.7 | 8.2 | 151.5 | 94.9% | 18 |
| 10-worker | `8dc3ebae` | 4 | `01a01a5d` | 97.7 | 9.2 | 88.5 | 90.6% | 16 |
| 10-worker | `d19574e8` | 0 | `01a01a41` | 366.0 | 68.5 | 297.4 | 81.3% | 37 |
| 10-worker | `d19574e8` | 1 | `01a01a47` | 361.2 | 36.3 | 324.9 | 89.9% | 28 |
| 10-worker | `d19574e8` | 2 | `01a01a4d` | 376.1 | 17.1 | 359.0 | 95.5% | 24 |
| 10-worker | `d19574e8` | 3 | `01a01a53` | 467.7 | 13.1 | 454.7 | 97.2% | 21 |
| 10-worker | `d19574e8` | 4 | `01a01a5a` | 331.7 | 28.5 | 303.2 | 91.4% | 36 |
| 10-worker | `f0435de6` | 0 | `01a01a42` | 296.1 | 47.4 | 248.8 | 84.0% | 39 |
| PoC | `ae525729` | 0 | `01a01783` | 258.3 | 35.9 | 222.4 | 86.1% | 31 |
| PoC | `ae525729` | 1 | `01a01787` | 265.4 | 23.1 | 242.3 | 91.3% | 25 |

† Observed first-to-last-event lower bound only; excluded from exact aggregates.

## Session aggregates

Means/medians are across complete Pi sessions. Duration means are pooled (`Σ duration / Σ events`). Ratio-of-sums MODEL % drives runtime cost.

| Cohort | Sessions | Mean wall s | Mean MODEL % | Median MODEL % | Ratio MODEL % | Mean turns | Mean model-turn s | Mean tool-burst s |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Scale runs combined | 53 | 452.7 | 90.3% | 92.0% | 90.1% | 37.8 | 10.8 | 1.2 |
| 5-worker rung | 15 | 616.7 | 90.7% | 92.7% | 91.5% | 39.7 | 14.2 | 1.4 |
| 10-worker rung | 38 | 388.0 | 90.1% | 91.6% | 89.2% | 37.1 | 9.3 | 1.2 |
| Single-worker PoC (reference) | 2 | 261.8 | 88.7% | 88.7% | 88.7% | 28.0 | 8.3 | 1.1 |

## Sandbox economics per claim

Running rate = 2 vCPU × $0.000014/s + 4 GiB × $0.0000045/s = **$0.000046/s**; stopped ≈ $0/s. Always-run cost = mean claim wall × rate. Stop cost = mean claim TOOL × rate. Wake latency is reported but not billed.

| Cohort | Claims | Always-run $/claim | Stop $/claim | Savings | Wake s/claim | Added wall |
|---|---:|---:|---:|---:|---:|---:|
| Scale runs, complete claims | 14 | $0.067776 | $0.007287 | 89.2% | 114.3 | 7.8% |
| 5-worker, complete claims | 4 | $0.067675 | $0.007260 | 89.3% | 100.3 | 6.8% |
| 10-worker, complete claims | 10 | $0.067816 | $0.007298 | 89.2% | 119.8 | 8.1% |
| Single-worker PoC (reference) | 1 | $0.024090 | $0.002713 | 88.7% | 47.6 | 9.1% |
| All 15 scale claims, observed lower bound† | 15 | $0.073627 | $0.007275 | 90.1% | 113.7 | 7.1% |

† Includes only the known event span of the right-censored claim; sensitivity only, not an exact cost estimate.

**Break-even:** with stopped cost ≈ $0 and wake latency unbilled, economic break-even is **0% MODEL time**; every positive stopped interval saves money. If wake time were billed at the running rate, complete scale claims break even at 7.8% MODEL time, versus the observed 89.2%.

## One-line verdict

**Build stop-while-thinking: 89.2% expected sandbox-cost savings per complete scale-run claim outweighs the 7.8% wake-latency overhead.**
