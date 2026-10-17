# Load test scale-fake-200-kill

- Mode: dry-run (fake Daytona)
- Window: 2026-10-17T16:55:53.223Z to 2026-10-17T16:57:14.729Z
- Cost guard: {"limits":{"maxAlive":210,"maxSandboxMinutes":100000,"allowBuildSandboxes":false},"created":201,"created_by_purpose":{"worker":201},"alive":0,"peak_alive":200,"sandbox_minutes":227.31,"refused_creates":0,"build_creates_refused":0,"tripped":"--kill-after-s 75"}
- Kill switch: [{"run_id":"scale-fake-200-kill","found":198,"deleted":198,"errors":[],"remaining":0,"ms":6439.777999999991}]
- Fake Daytona: peak alive 200, created 201, alive at end 0

## Ramp

| concurrency | attempts ok/total | wall s | attempt p50/p95 s | provision p50/p95 ms | API calls | 429 | build sandboxes | placement failures | toolpack re-syncs | worker RSS p50/max MB | peak total RSS GB | sqlite waits >5ms (max ms) | integration items/min |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 200 | 2/2 | 69.96 | 50.2/55.4 | 9180.5/24663.1 | 31313 | 0 | 0 | 0 | 0 | 178/218.5 | 39.24 | 101 (309.1) |  |

## Step 200

Jobs {"failed":198,"succeeded":2}; integration outcomes {}; kinds {"clean_fix":70,"steering":52,"unverified_repair":70,"evidence_review":8}.

### Step latency and placement

| step | placement | n | p50 ms | p95 ms | max ms | non-zero exit |
| --- | --- | --- | --- | --- | --- | --- |
| attach_check | sandbox | 200 | 85.5 | 252.2 | 656.3 | 0 |
| build | sandbox | 521 | 4039.9 | 4133.2 | 4602.6 | 0 |
| compare_sources | sandbox | 200 | 12539 | 12562.2 | 12798.1 | 0 |
| diff_capture | sandbox | 800 | 64.9 | 110.6 | 834.1 | 0 |
| edit_scope | sandbox | 127 | 538.7 | 545.9 | 548.6 | 0 |
| format_check | sandbox | 260 | 190.3 | 205.7 | 263.6 | 0 |
| git_rev_parse | sandbox | 197 | 65.9 | 89.1 | 90.9 | 0 |
| mkdir | sandbox | 470 | 72.7 | 101.1 | 210.9 | 0 |
| native_decisions | sandbox | 200 | 5043.4 | 5318 | 5835.5 | 0 |
| objdiff | sandbox | 590 | 342.6 | 609 | 1026.4 | 0 |
| other:cp | sandbox | 200 | 73.6 | 194.1 | 381.5 | 0 |
| other:rm | sandbox | 400 | 64.2 | 110.6 | 689.2 | 0 |
| provision_checkout | sandbox | 200 | 391.8 | 508.3 | 508.6 | 0 |
| provision_git | sandbox | 400 | 292.4 | 845 | 930.4 | 0 |
| provision_link | sandbox | 400 | 77.2 | 140.6 | 343.2 | 0 |
| provision_verify | sandbox | 200 | 81.3 | 680.3 | 1251.9 | 0 |
| python:check-changed-symbol-order.py | sandbox | 127 | 63 | 70.4 | 86.4 | 0 |
| qa_diff | sandbox | 400 | 190 | 215.9 | 839.7 | 0 |
| qa_lint | sandbox | 200 | 1539.4 | 1560.1 | 1642.8 | 0 |
| qa_probe | sandbox | 200 | 65.2 | 81.7 | 106.7 | 0 |
| read_source | sandbox | 527 | 75.4 | 947.9 | 1698.1 | 0 |
| shell | sandbox | 654 | 65.1 | 160.2 | 1320.4 | 0 |
| source_query | sandbox | 256 | 139.9 | 162.4 | 181.4 | 0 |
| stack_check | sandbox | 502 | 790.5 | 901.8 | 1677.7 | 0 |
| steering_edits | sandbox | 65 | 789.5 | 806.5 | 817.9 | 0 |
| steering_placement_probe | sandbox | 123 | 239.2 | 250.1 | 268.7 | 0 |
| steering_reduce | sandbox | 10 | 10037.2 | 10038.5 | 10038.5 | 0 |
| symbol_baseline | sandbox | 196 | 74.4 | 115.2 | 793.5 | 0 |
| test | sandbox | 400 | 68.4 | 311.7 | 1303.3 | 0 |
| undefined_symbols | sandbox | 334 | 66.7 | 166.5 | 797.5 | 0 |
| upload_via_exec | sandbox | 65 | 64.4 | 86 | 142.3 | 0 |

Required-step coverage: 200 attempt sandboxes; missing {"steering_mwcc":200,"steering_decide":200,"steering_reduce":190,"steering_edits":135}.

### Host processes spawned (placement evidence)

| role:step | n | p50 ms | p95 ms | cpu ms total | example |
| --- | --- | --- | --- | --- | --- |
| orchestrator:git_show | 70 | 615.6 | 1209.6 | 3073.6 | git show 81248bdac58da1ff74128ba8c3a3798372fa5371:src/Enemy/igaiga.cpp |
| orchestrator:git_merge-base | 270 | 720.1 | 1731.3 | 12171.7 | git merge-base --is-ancestor 3b83dd4611ff59dcfdb521c11d780716aa25a124 |
| orchestrator:git_rev_parse | 70 | 817.4 | 890.2 | 3054.9 | git rev-parse --verify --quiet |
| orchestrator:git_update-ref | 4 | 57.2 | 1768.3 | 171.4 | git update-ref refs/decomp-orchestrator/sandbox-seeds/711b421e-dd0d-4880-9d49-b92669139a9a ff7baf7bc1f69c99be114188dc8ffccfbfc89695 |
| orchestrator:git_-c | 1 | 4821.8 | 4821.8 | 858 | git -c pack.threads=1 bundle |
| orchestrator:worker_child | 200 | 57378.7 | 61121.5 | 266127 | bun /Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop/objectives/worker-compiler-loop/scale/worker-child.ts --game sms |

### Daytona API

| op | calls | errors | 429 | p50 ms | p95 ms |
| --- | --- | --- | --- | --- | --- |
| sandbox.create | 200 | 0 | 0 | 1538.1 | 2399.1 |
| fs.upload | 1270 | 0 | 0 | 58.4 | 6526.3 |
| session.create | 9606 | 0 | 0 | 20 | 154.2 |
| session.exec | 9424 | 0 | 0 | 118.3 | 4114 |
| session.delete | 9408 | 0 | 0 | 20.4 | 142.4 |
| fs.download | 1200 | 0 | 0 | 52 | 200 |
| sandbox.get | 202 | 0 | 0 | 168.1 | 638.3 |
| sandbox.delete | 2 | 0 | 0 | 402.4 | 404.3 |
| sandbox.list | 1 | 0 | 0 | 479 | 479 |

Sandboxes: {"created":200,"create_failures":0,"deleted":2,"create_ms":{"n":200,"p50":1538.3,"p95":2413.4,"max":2466.8},"delete_ms":{"n":2,"p50":402.5,"p95":404.4,"max":404.4},"by_purpose":{"worker":200},"build_sandboxes":0,"build_sandboxes_per_attempt":0}

### Attempts

| kind | attempts | ok | verdicts | p50 s | p95 s |
| --- | --- | --- | --- | --- | --- |
| clean_fix | 2 | 2 | {"failed/no_gate":2} | 50.2 | 55.4 |

### Phases

| phase | n | p50 ms | p95 ms | max ms | failed |
| --- | --- | --- | --- | --- | --- |
| provision | 200 | 9180.5 | 24663.1 | 30730.7 | 0 |
| tool:native_decisions | 200 | 5433.9 | 6514.7 | 7794.2 | 0 |
| canned_edit | 200 | 42.8 | 278.3 | 777.9 | 0 |
| tool:compare_sources | 200 | 12682.8 | 13143 | 14762.9 | 0 |
| agent_turn | 200 | 18211.8 | 20070 | 20873.4 | 0 |
| child_import | 2 | 9252 | 9797.8 | 9797.8 | 0 |

Provision seed kinds (thin = ^baked bundle, full = whole history): {"thin":130,"full":70}

Host: {"worker_children":200,"worker_peak_rss_mb":{"n":200,"p50":178,"p95":197.2,"max":218.5},"worker_cpu_seconds":{"n":200,"p50":1.3,"p95":1.5,"max":1.7},"orchestrator_peak_rss_mb":4280.1,"orchestrator_cpu_seconds":11.8,"peak_total_rss_gb":39.24,"peak_concurrent_worker_children":200}

SQLite: {"waits_over_5ms":101,"busy_errors":0,"wait_ms":{"n":101,"p50":14.2,"p95":241.4,"max":309.1},"by_role":{"orchestrator":{"n":16,"p50":7.2,"p95":33.6,"max":33.6,"total_ms":170.4},"worker":{"n":85,"p50":18.8,"p95":244.6,"max":309.1,"total_ms":5956.6}}}

Integration: {"drains":0,"processed":0,"drain_ms_total":0,"per_item_ms":null,"items_per_minute":null}

### Failures by kind

| kind | count | examples |
| --- | --- | --- |
| worker_job | 198 | Unknown local process handle: 334e7f22-0610-412a-b0d4-872a4b8202d8 / Unknown local process handle: 0ed70980-6ecb-4da5-a38d-363b282d2ff2 / Unknown local process handle: c160dd85-02c8-4d29-8cc5-523ad4699fe8 |
