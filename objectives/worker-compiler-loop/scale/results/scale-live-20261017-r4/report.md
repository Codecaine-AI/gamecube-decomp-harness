# Load test scale-live-20261017-r4

- Mode: live
- Window: 2026-10-17T23:24:55.459Z to 2026-10-17T23:25:39.187Z
- Cost guard: {"limits":{"maxAlive":8,"maxSandboxMinutes":90,"allowBuildSandboxes":false},"created":4,"failed_creates":{"allocated":0,"allocated_nothing":0,"unconfirmed":0},"created_by_purpose":{"worker":4},"alive":0,"peak_alive":4,"sandbox_minutes":2.092,"refused_creates":0,"build_creates_refused":0,"tripped":null}
- Kill switch: [{"run_id":"scale-live-20261017-r4","found":1,"deleted":1,"errors":[],"remaining":1,"ms":229.07991700000275}]

## Ramp

| concurrency | attempts ok/total | wall s | attempt p50/p95 s | provision p50/p95 ms | API calls | API calls/attempt | 429 | build sandboxes | placement failures | toolpack re-syncs | worker RSS p50/max MB | peak total RSS GB | sqlite waits >5ms (max ms) | integration items/min |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 4 | 4/4 | 43.41 | 16.6/38.1 | 3766.4/4529.4 | 305 | 76.3 | 0 | 0 | 0 | 0 | 209.5/213.5 | 1.03 | 0 (0) |  |

## Step 4

Jobs {"succeeded":4}; integration outcomes {}; kinds {"clean_fix":1,"steering":1,"unverified_repair":1,"evidence_review":1}.

### Step latency and placement

| step | placement | n | p50 ms | p95 ms | max ms | non-zero exit |
| --- | --- | --- | --- | --- | --- | --- |
| attach_check | sandbox | 4 | 108.3 | 135.7 | 135.7 | 0 |
| build | sandbox | 12 | 210.3 | 1740.8 | 1740.8 | 0 |
| compare_sources | sandbox | 4 | 1249.8 | 1552.9 | 1552.9 | 0 |
| diff_capture | sandbox | 16 | 129.2 | 228.6 | 228.6 | 0 |
| edit_scope | sandbox | 4 | 530.8 | 1618.4 | 1618.4 | 0 |
| format_check | sandbox | 8 | 126.6 | 182 | 182 | 0 |
| git_rev_parse | sandbox | 5 | 127.6 | 134.7 | 134.7 | 0 |
| mkdir | sandbox | 9 | 127.1 | 140.6 | 140.6 | 0 |
| native_decisions | sandbox | 4 | 786 | 914.1 | 914.1 | 0 |
| objdiff | sandbox | 12 | 248.4 | 420 | 420 | 0 |
| other:cp | sandbox | 4 | 106.1 | 121.4 | 121.4 | 0 |
| other:rm | sandbox | 8 | 126.4 | 131.7 | 131.7 | 0 |
| provision_checkout | sandbox | 4 | 278 | 333.7 | 333.7 | 0 |
| provision_git | sandbox | 8 | 126.7 | 132.4 | 132.4 | 0 |
| provision_link | sandbox | 8 | 128.1 | 150.6 | 150.6 | 0 |
| provision_verify | sandbox | 4 | 123.5 | 129 | 129 | 0 |
| python_inline | sandbox | 12 | 125.8 | 188.7 | 188.7 | 0 |
| python:check-changed-symbol-order.py | sandbox | 4 | 362.3 | 392.3 | 392.3 | 0 |
| qa_diff | sandbox | 8 | 129.8 | 133.1 | 133.1 | 0 |
| qa_lint | sandbox | 4 | 3161.3 | 3259.6 | 3259.6 | 3 |
| qa_probe | sandbox | 4 | 107.2 | 130.2 | 130.2 | 0 |
| read_source | sandbox | 8 | 260.9 | 1673.3 | 1673.3 | 0 |
| shell | sandbox | 20 | 127 | 138.6 | 154.2 | 4 |
| source_query | sandbox | 4 | 116.3 | 188.6 | 188.6 | 0 |
| stack_check | sandbox | 14 | 257.9 | 20475.3 | 20475.3 | 0 |
| symbol_baseline | sandbox | 4 | 107.1 | 128.1 | 128.1 | 0 |
| test | sandbox | 8 | 126.7 | 139.6 | 139.6 | 0 |
| undefined_symbols | sandbox | 8 | 125.8 | 139.4 | 139.4 | 0 |
| upload_via_exec | sandbox | 8 | 126.7 | 132 | 132 | 0 |

Required-step coverage: 4 attempt sandboxes; missing {"steering_edits":4,"steering_reduce":4,"steering_mwcc":4,"steering_decide":4}.

### Host processes spawned (placement evidence)

| role:step | n | p50 ms | p95 ms | cpu ms total | example |
| --- | --- | --- | --- | --- | --- |
| orchestrator:git_show | 1 | 83.7 | 83.7 | 36.1 | git show 81248bdac58da1ff74128ba8c3a3798372fa5371:src/Enemy/gatekeeper.cpp |
| orchestrator:git_merge-base | 1 | 35.6 | 35.6 | 32.8 | git merge-base --is-ancestor a5778b1f154da5b67349f274cc52112f9bd13d14 |
| orchestrator:git_update-ref | 2 | 37.5 | 38.3 | 69 | git update-ref refs/decomp-orchestrator/sandbox-seeds/650bbda1-0a9a-4a6b-b45f-bfa265f226bd 292dbf676e73b229c4f123d981da3da3d36a83d0 |
| orchestrator:git_-c | 1 | 62.8 | 62.8 | 56.2 | git -c pack.threads=1 bundle |
| orchestrator:git_rev_parse | 1 | 39.6 | 39.6 | 36.3 | git rev-parse --verify --quiet |
| orchestrator:worker_child | 4 | 16597.7 | 38084.5 | 6399.1 | bun /Users/Ford/workspace/codebases/harnesses/gamecube-decomp-harness/objectives/worker-compiler-loop/scale/worker-child.ts --game sms |

### Daytona API

| op | calls | errors | 429 | p50 ms | p95 ms |
| --- | --- | --- | --- | --- | --- |
| sandbox.create | 4 | 0 | 0 | 964.3 | 1500.2 |
| session.create | 8 | 0 | 0 | 169.1 | 184.9 |
| session.exec | 220 | 0 | 0 | 130.4 | 1491.7 |
| fs.upload | 25 | 0 | 0 | 81.8 | 356.2 |
| fs.download | 36 | 0 | 0 | 76.4 | 99.1 |
| sandbox.get | 8 | 0 | 0 | 82.5 | 91.4 |
| sandbox.delete | 4 | 0 | 0 | 1086.1 | 3475.5 |

Sandboxes: {"created":4,"create_failures":0,"deleted":4,"create_ms":{"n":4,"p50":964.4,"p95":1500.2,"max":1500.2},"delete_ms":{"n":4,"p50":1086.4,"p95":3475.6,"max":3475.6},"by_purpose":{"worker":4},"build_sandboxes":0,"build_sandboxes_per_attempt":0}

Create admission (cumulative in this process): {"concurrency":4,"admitted":4,"queued":0,"quotaRefusals":0,"rateRefusals":0,"timeouts":0,"maxQueued":0,"holds":0,"holdsReleased":0,"holdsExpired":0}

### Attempts

| kind | attempts | ok | verdicts | p50 s | p95 s |
| --- | --- | --- | --- | --- | --- |
| steering | 1 | 1 | {"stack_only_perturbation/no_gate":1} | 13.1 | 13.1 |
| evidence_review | 1 | 1 | {"stack_only_perturbation/no_gate":1} | 16.6 | 16.6 |
| clean_fix | 1 | 1 | {"stack_only_perturbation/no_gate":1} | 34.6 | 34.6 |
| unverified_repair | 1 | 1 | {"failed/no_gate":1} | 38.1 | 38.1 |

### Phases

| phase | n | p50 ms | p95 ms | max ms | failed |
| --- | --- | --- | --- | --- | --- |
| provision | 4 | 3766.4 | 4529.4 | 4529.4 | 0 |
| tool:native_decisions | 4 | 996.1 | 1157.4 | 1157.4 | 0 |
| canned_edit | 4 | 66.3 | 82.5 | 82.5 | 0 |
| tool:compare_sources | 4 | 1471.4 | 1798.4 | 1798.4 | 0 |
| agent_turn | 4 | 2550.8 | 3023.5 | 3023.5 | 0 |
| child_import | 4 | 384.6 | 443.4 | 443.4 | 0 |

Provision seed kinds (thin = ^baked bundle, full = whole history): {"thin":4}

Native measurements (ok = nested status ok with its schema): {"native_decisions":{"calls":4,"ok":4,"failed":0,"by_reason":{}},"compare_sources":{"calls":4,"ok":4,"failed":0,"by_reason":{}}}

Host: {"worker_children":3,"worker_peak_rss_mb":{"n":3,"p50":209.5,"p95":213.5,"max":213.5},"worker_cpu_seconds":{"n":3,"p50":1.6,"p95":1.7,"max":1.7},"orchestrator_peak_rss_mb":252.1,"orchestrator_cpu_seconds":2,"peak_total_rss_gb":1.03,"peak_concurrent_worker_children":4}

SQLite: {"waits_over_5ms":0,"busy_errors":0,"wait_ms":{"n":0,"p50":null,"p95":null,"max":null},"by_role":{}}

Integration: {"drains":0,"processed":0,"drain_ms_total":0,"per_item_ms":null,"items_per_minute":null}

### Failures by kind

None.
