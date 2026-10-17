# Load test s11b-fake-ramp

- Mode: dry-run (fake Daytona)
- Window: 2026-10-17T17:51:33.635Z to 2026-10-17T17:53:43.811Z
- Cost guard: {"limits":{"maxAlive":210,"maxSandboxMinutes":100000,"allowBuildSandboxes":false},"created":364,"created_by_purpose":{"worker":364},"alive":0,"peak_alive":200,"sandbox_minutes":111.08,"refused_creates":0,"build_creates_refused":0,"tripped":null}
- Kill switch: [{"run_id":"s11b-fake-ramp","found":0,"deleted":0,"errors":[],"remaining":0,"ms":5.798832999993465}]
- Fake Daytona: peak alive 200, created 364, alive at end 0

## Ramp

| concurrency | attempts ok/total | wall s | attempt p50/p95 s | provision p50/p95 ms | API calls | API calls/attempt | 429 | build sandboxes | placement failures | toolpack re-syncs | worker RSS p50/max MB | peak total RSS GB | sqlite waits >5ms (max ms) | integration items/min |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | 10/10 | 5.71 | 3.6/4.7 | 164.4/384.3 | 802 | 80.2 | 0 | 0 | 0 | 0 | 188.2/229.7 | 2.16 | 0 (0) | 101.4 |
| 50 | 50/50 | 15.95 | 7.8/8.9 | 491.5/743.1 | 4052 | 81 | 0 | 0 | 0 | 0 | 189.9/216 | 9.04 | 1 (6.5) | 86.8 |
| 100 | 100/100 | 33.84 | 13.4/14.1 | 1499/2909.5 | 8124 | 81.2 | 0 | 0 | 0 | 0 | 182.4/222.2 | 16.45 | 28 (74.6) | 68.4 |
| 200 | 200/200 | 72.93 | 16.5/18.9 | 7786.4/19580.7 | 16350 | 81.8 | 0 | 0 | 0 | 0 | 177.5/253.7 | 19.99 | 219 (607.7) | 64.8 |

## Step 10

Jobs {"succeeded":10}; integration outcomes {"applied":2}; kinds {"clean_fix":3,"steering":3,"unverified_repair":2,"evidence_review":2}.

### Step latency and placement

| step | placement | n | p50 ms | p95 ms | max ms | non-zero exit |
| --- | --- | --- | --- | --- | --- | --- |
| attach_check | sandbox | 10 | 2.9 | 11.2 | 11.2 | 0 |
| build | sandbox | 32 | 161.5 | 163 | 165.3 | 0 |
| compare_sources | sandbox | 10 | 502.4 | 503.6 | 503.6 | 0 |
| diff_capture | sandbox | 40 | 2.7 | 6.3 | 13.1 | 0 |
| edit_scope | sandbox | 10 | 21.6 | 22.4 | 22.4 | 0 |
| format_check | sandbox | 20 | 7.3 | 7.9 | 8 | 0 |
| git_rev_parse | sandbox | 12 | 2.4 | 7.9 | 7.9 | 0 |
| mkdir | sandbox | 24 | 2.6 | 7.9 | 8.1 | 0 |
| native_decisions | sandbox | 10 | 204.6 | 210.4 | 210.4 | 0 |
| objdiff | sandbox | 30 | 13.5 | 18.9 | 24.7 | 0 |
| other:cp | sandbox | 12 | 2.4 | 4.2 | 4.2 | 0 |
| other:rm | sandbox | 20 | 2.4 | 7.1 | 11.6 | 0 |
| provision_checkout | sandbox | 10 | 14.4 | 14.5 | 14.5 | 0 |
| provision_git | sandbox | 20 | 11.8 | 18.2 | 18.3 | 0 |
| provision_link | sandbox | 20 | 2.4 | 10.3 | 18 | 0 |
| provision_verify | sandbox | 10 | 5.3 | 7.9 | 7.9 | 0 |
| python_inline | sandbox | 30 | 2.4 | 3.9 | 4.1 | 0 |
| python:check-changed-symbol-order.py | sandbox | 10 | 2.3 | 2.6 | 2.6 | 0 |
| qa_diff | sandbox | 20 | 7.9 | 10.5 | 11.1 | 0 |
| qa_lint | sandbox | 10 | 61.5 | 64.6 | 64.6 | 0 |
| qa_probe | sandbox | 10 | 2.4 | 3.8 | 3.8 | 0 |
| read_source | sandbox | 20 | 4.2 | 5.5 | 7.4 | 0 |
| shell | sandbox | 50 | 2.5 | 6.9 | 8.7 | 0 |
| source_query | sandbox | 10 | 5.3 | 5.8 | 5.8 | 0 |
| stack_check | sandbox | 30 | 31.4 | 32.3 | 51.3 | 0 |
| steering_decide | sandbox | 12 | 122.6 | 122.6 | 122.6 | 0 |
| steering_edits | sandbox | 12 | 31.9 | 32.5 | 32.5 | 0 |
| steering_mwcc | sandbox | 12 | 501.7 | 502.7 | 502.7 | 0 |
| steering_placement_probe | sandbox | 10 | 9.7 | 10.4 | 10.4 | 0 |
| steering_reduce | sandbox | 12 | 402.5 | 402.8 | 402.8 | 0 |
| symbol_baseline | sandbox | 10 | 2.4 | 4.1 | 4.1 | 0 |
| test | sandbox | 20 | 2.7 | 4.3 | 9.4 | 0 |
| undefined_symbols | sandbox | 20 | 2.3 | 3.1 | 3.6 | 0 |
| upload_via_exec | sandbox | 32 | 2.4 | 2.9 | 3.2 | 0 |

Required-step coverage: 10 attempt sandboxes; missing {}.

### Host processes spawned (placement evidence)

| role:step | n | p50 ms | p95 ms | cpu ms total | example |
| --- | --- | --- | --- | --- | --- |
| orchestrator:git_show | 2 | 56.7 | 60.1 | 70.8 | git show 81248bdac58da1ff74128ba8c3a3798372fa5371:src/Enemy/igaiga.cpp |
| orchestrator:git_rev_parse | 7 | 34.6 | 39.6 | 225.9 | git rev-parse --verify --quiet |
| orchestrator:worker_child | 10 | 3643.7 | 4735.1 | 11974 | bun /Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop/objectives/worker-compiler-loop/scale/worker-child.ts --game sms |
| orchestrator:git_apply | 6 | 38.6 | 41.5 | 212.9 | git apply --check /var/folders/hd/5sskjbf10bl2v1tx3jsvg_200000gn/T/scale-load-test/s11b-fake-ramp/step-10/state/runs/f6d383c7-f635-46c6-81fc-4dd7a9325361/worker_state/7029dc1d-26 |
| orchestrator:git_read-tree | 2 | 40.6 | 43.3 | 77 | git read-tree ff7baf7bc1f69c99be114188dc8ffccfbfc89695 |
| orchestrator:diff_capture | 8 | 39.1 | 73.9 | 285.8 | git diff --cached --raw |
| orchestrator:git_cat-file | 2 | 37 | 41.3 | 71.4 | git cat-file -e ff7baf7bc1f69c99be114188dc8ffccfbfc89695:src/Enemy/BathtubKiller.cpp |
| orchestrator:git_add | 2 | 39.8 | 42.5 | 73.9 | git add -- src/Enemy/BathtubKiller.cpp |
| orchestrator:git_commit | 2 | 67.3 | 69.4 | 126.4 | git commit --no-verify -m |

### Daytona API

| op | calls | errors | 429 | p50 ms | p95 ms |
| --- | --- | --- | --- | --- | --- |
| sandbox.create | 10 | 0 | 0 | 50.5 | 51.2 |
| session.create | 20 | 0 | 0 | 2.5 | 4.5 |
| session.exec | 620 | 0 | 0 | 4.7 | 402.3 |
| fs.upload | 62 | 0 | 0 | 1.9 | 17.6 |
| fs.download | 60 | 0 | 0 | 1.5 | 7.7 |
| sandbox.get | 20 | 0 | 0 | 1.7 | 8.6 |
| sandbox.delete | 10 | 0 | 0 | 16.6 | 17.5 |

Sandboxes: {"created":10,"create_failures":0,"deleted":10,"create_ms":{"n":10,"p50":50.5,"p95":51.2,"max":51.2},"delete_ms":{"n":10,"p50":16.6,"p95":17.8,"max":17.8},"by_purpose":{"worker":10},"build_sandboxes":0,"build_sandboxes_per_attempt":0}

Create admission (cumulative in this process): {"concurrency":10,"admitted":11,"queued":0,"quotaRefusals":0,"rateRefusals":0,"timeouts":0,"maxQueued":0}

### Attempts

| kind | attempts | ok | verdicts | p50 s | p95 s |
| --- | --- | --- | --- | --- | --- |
| steering | 3 | 3 | {"steering_located/steering_located":3} | 3.5 | 3.6 |
| clean_fix | 3 | 3 | {"passed/pass":3} | 3.6 | 3.7 |
| evidence_review | 2 | 2 | {"steering_located/steering_located":2} | 3.7 | 3.7 |
| unverified_repair | 2 | 2 | {"target_regressed/pass":2} | 4.7 | 4.7 |

### Phases

| phase | n | p50 ms | p95 ms | max ms | failed |
| --- | --- | --- | --- | --- | --- |
| provision | 10 | 164.4 | 384.3 | 384.3 | 0 |
| tool:native_decisions | 10 | 210.6 | 216 | 216 | 0 |
| canned_edit | 10 | 1.9 | 6.9 | 6.9 | 0 |
| tool:compare_sources | 10 | 507.9 | 520.3 | 520.3 | 0 |
| agent_turn | 10 | 722.4 | 736.3 | 736.3 | 0 |
| child_import | 10 | 709.3 | 916.3 | 916.3 | 0 |

Provision seed kinds (thin = ^baked bundle, full = whole history): {"thin":10}

Host: {"worker_children":10,"worker_peak_rss_mb":{"n":10,"p50":188.2,"p95":229.7,"max":229.7},"worker_cpu_seconds":{"n":10,"p50":1.2,"p95":1.3,"max":1.3},"orchestrator_peak_rss_mb":281.3,"orchestrator_cpu_seconds":1.3,"peak_total_rss_gb":2.16,"peak_concurrent_worker_children":10}

SQLite: {"waits_over_5ms":0,"busy_errors":0,"wait_ms":{"n":0,"p50":null,"p95":null,"max":null},"by_role":{}}

Integration: {"drains":1,"processed":2,"drain_ms_total":1183,"per_item_ms":591.5,"items_per_minute":101.4}

### Failures by kind

None.

## Step 50

Jobs {"succeeded":50}; integration outcomes {"applied":13}; kinds {"clean_fix":14,"steering":14,"unverified_repair":14,"evidence_review":8}.

### Step latency and placement

| step | placement | n | p50 ms | p95 ms | max ms | non-zero exit |
| --- | --- | --- | --- | --- | --- | --- |
| attach_check | sandbox | 50 | 3.8 | 30.2 | 74.6 | 0 |
| build | sandbox | 164 | 162.7 | 179.7 | 253.9 | 0 |
| compare_sources | sandbox | 50 | 503.3 | 511.1 | 520 | 0 |
| diff_capture | sandbox | 200 | 3 | 12.2 | 127 | 0 |
| edit_scope | sandbox | 50 | 21.7 | 28.5 | 31.9 | 0 |
| format_check | sandbox | 100 | 8.2 | 14.2 | 23.1 | 0 |
| git_rev_parse | sandbox | 64 | 2.7 | 7.4 | 10.5 | 0 |
| mkdir | sandbox | 127 | 3.1 | 9.8 | 22.8 | 0 |
| native_decisions | sandbox | 50 | 205.1 | 240 | 247.3 | 0 |
| objdiff | sandbox | 150 | 14.5 | 24.5 | 34.9 | 0 |
| other:cp | sandbox | 63 | 3 | 10 | 14.8 | 0 |
| other:rm | sandbox | 100 | 2.8 | 9.6 | 30.8 | 0 |
| provision_checkout | sandbox | 50 | 14.2 | 22 | 22.1 | 0 |
| provision_git | sandbox | 100 | 12.2 | 19.4 | 19.5 | 0 |
| provision_link | sandbox | 100 | 2.7 | 13 | 22.9 | 0 |
| provision_verify | sandbox | 50 | 13.7 | 70.8 | 78.7 | 0 |
| python_inline | sandbox | 150 | 3.2 | 8 | 11 | 0 |
| python:check-changed-symbol-order.py | sandbox | 50 | 2.5 | 4.3 | 5.2 | 0 |
| qa_diff | sandbox | 100 | 8.1 | 17.2 | 67.4 | 0 |
| qa_lint | sandbox | 50 | 62.4 | 70.7 | 79.2 | 0 |
| qa_probe | sandbox | 50 | 2.8 | 11.1 | 14 | 0 |
| read_source | sandbox | 100 | 4.8 | 14.8 | 22.5 | 0 |
| shell | sandbox | 250 | 3 | 15.1 | 73.7 | 0 |
| source_query | sandbox | 50 | 6.4 | 12 | 17.2 | 0 |
| stack_check | sandbox | 150 | 32.4 | 40.8 | 47.8 | 0 |
| steering_decide | sandbox | 64 | 121.5 | 124.1 | 126.6 | 0 |
| steering_edits | sandbox | 64 | 31.5 | 34.4 | 48.4 | 0 |
| steering_mwcc | sandbox | 64 | 501.7 | 504.3 | 507.1 | 0 |
| steering_placement_probe | sandbox | 50 | 9.6 | 16 | 22.8 | 0 |
| steering_reduce | sandbox | 64 | 401.9 | 406.8 | 419.5 | 0 |
| symbol_baseline | sandbox | 50 | 3.3 | 11.3 | 15.6 | 0 |
| test | sandbox | 100 | 4.3 | 22.5 | 43.3 | 0 |
| undefined_symbols | sandbox | 100 | 3.1 | 10.8 | 18.5 | 0 |
| upload_via_exec | sandbox | 164 | 2.7 | 8.5 | 15.2 | 0 |

Required-step coverage: 50 attempt sandboxes; missing {}.

### Host processes spawned (placement evidence)

| role:step | n | p50 ms | p95 ms | cpu ms total | example |
| --- | --- | --- | --- | --- | --- |
| orchestrator:git_show | 14 | 87.3 | 106 | 551.6 | git show 81248bdac58da1ff74128ba8c3a3798372fa5371:src/Enemy/igaiga.cpp |
| orchestrator:worker_child | 50 | 7839 | 9017.5 | 60579.7 | bun /Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop/objectives/worker-compiler-loop/scale/worker-child.ts --game sms |
| orchestrator:git_apply | 39 | 40.4 | 79.2 | 1386.4 | git apply --check /var/folders/hd/5sskjbf10bl2v1tx3jsvg_200000gn/T/scale-load-test/s11b-fake-ramp/step-50/state/runs/9825e0f7-936c-4991-bf7e-7389919f0b52/worker_state/6581d184-de |
| orchestrator:git_rev_parse | 39 | 36.5 | 45.3 | 1288.6 | git rev-parse HEAD |
| orchestrator:git_read-tree | 13 | 43.9 | 83.5 | 520.9 | git read-tree ff7baf7bc1f69c99be114188dc8ffccfbfc89695 |
| orchestrator:diff_capture | 63 | 40.8 | 70.1 | 2326.6 | git diff --cached --raw |
| orchestrator:git_cat-file | 13 | 39.4 | 111.9 | 466.5 | git cat-file -e ff7baf7bc1f69c99be114188dc8ffccfbfc89695:src/Enemy/bossManta.cpp |
| orchestrator:git_add | 13 | 43 | 51.8 | 502.4 | git add -- src/Enemy/bossManta.cpp |
| orchestrator:git_commit | 13 | 75.2 | 96.2 | 893 | git commit --no-verify -m |

### Daytona API

| op | calls | errors | 429 | p50 ms | p95 ms |
| --- | --- | --- | --- | --- | --- |
| sandbox.create | 50 | 0 | 0 | 28 | 63.2 |
| session.create | 100 | 0 | 0 | 2.5 | 16.3 |
| session.exec | 3138 | 0 | 0 | 7.2 | 401.5 |
| fs.upload | 314 | 0 | 0 | 2.4 | 42.6 |
| fs.download | 300 | 0 | 0 | 2.4 | 84.4 |
| sandbox.get | 100 | 0 | 0 | 2.9 | 25.2 |
| sandbox.delete | 50 | 0 | 0 | 17 | 23.5 |

Sandboxes: {"created":50,"create_failures":0,"deleted":50,"create_ms":{"n":50,"p50":28,"p95":63.2,"max":63.5},"delete_ms":{"n":50,"p50":17,"p95":23.6,"max":55.3},"by_purpose":{"worker":50},"build_sandboxes":0,"build_sandboxes_per_attempt":0}

Create admission (cumulative in this process): {"concurrency":50,"admitted":62,"queued":34,"quotaRefusals":0,"rateRefusals":0,"timeouts":0,"maxQueued":23}

### Attempts

| kind | attempts | ok | verdicts | p50 s | p95 s |
| --- | --- | --- | --- | --- | --- |
| clean_fix | 14 | 14 | {"passed/pass":14} | 7.8 | 8.1 |
| evidence_review | 8 | 8 | {"steering_located/steering_located":8} | 7.4 | 7.8 |
| unverified_repair | 14 | 14 | {"target_regressed/pass":14} | 8.6 | 9 |
| steering | 14 | 14 | {"steering_located/steering_located":14} | 7.5 | 8.1 |

### Phases

| phase | n | p50 ms | p95 ms | max ms | failed |
| --- | --- | --- | --- | --- | --- |
| provision | 50 | 491.5 | 743.1 | 744.4 | 0 |
| tool:native_decisions | 50 | 225.1 | 295.3 | 381.3 | 0 |
| canned_edit | 50 | 2.3 | 15.7 | 21.4 | 0 |
| tool:compare_sources | 50 | 510 | 525.9 | 539.1 | 0 |
| agent_turn | 50 | 745.7 | 806.2 | 904 | 0 |
| child_import | 50 | 4101.8 | 4531 | 4731.5 | 0 |

Provision seed kinds (thin = ^baked bundle, full = whole history): {"thin":50}

Host: {"worker_children":49,"worker_peak_rss_mb":{"n":49,"p50":189.9,"p95":210.3,"max":216},"worker_cpu_seconds":{"n":49,"p50":1.2,"p95":1.3,"max":1.3},"orchestrator_peak_rss_mb":577.9,"orchestrator_cpu_seconds":3.4,"peak_total_rss_gb":9.04,"peak_concurrent_worker_children":50}

SQLite: {"waits_over_5ms":1,"busy_errors":0,"wait_ms":{"n":1,"p50":6.5,"p95":6.5,"max":6.5},"by_role":{"worker":{"n":1,"p50":6.5,"p95":6.5,"max":6.5,"total_ms":6.5}}}

Integration: {"drains":2,"processed":13,"drain_ms_total":8987,"per_item_ms":691.3,"items_per_minute":86.8}

### Failures by kind

None.

## Step 100

Jobs {"succeeded":100}; integration outcomes {"applied":30}; kinds {"clean_fix":31,"steering":31,"unverified_repair":30,"evidence_review":8}.

### Step latency and placement

| step | placement | n | p50 ms | p95 ms | max ms | non-zero exit |
| --- | --- | --- | --- | --- | --- | --- |
| attach_check | sandbox | 100 | 8.5 | 90.6 | 135 | 0 |
| build | sandbox | 329 | 164.4 | 205.3 | 371.6 | 0 |
| compare_sources | sandbox | 100 | 503.3 | 515.3 | 553.1 | 0 |
| diff_capture | sandbox | 400 | 4.4 | 33.7 | 272.1 | 0 |
| edit_scope | sandbox | 100 | 23.1 | 31.8 | 39.3 | 0 |
| format_check | sandbox | 200 | 8.5 | 19 | 43.8 | 0 |
| git_rev_parse | sandbox | 129 | 3.4 | 11.5 | 36.3 | 0 |
| mkdir | sandbox | 260 | 3.4 | 15.6 | 35.9 | 0 |
| native_decisions | sandbox | 100 | 212.7 | 274.1 | 376.9 | 0 |
| objdiff | sandbox | 300 | 16.8 | 41.2 | 113.2 | 0 |
| other:cp | sandbox | 130 | 3.8 | 16 | 32 | 0 |
| other:rm | sandbox | 200 | 3.5 | 22 | 252.9 | 0 |
| provision_checkout | sandbox | 100 | 14.2 | 18.4 | 18.9 | 0 |
| provision_git | sandbox | 200 | 12.8 | 17 | 18 | 0 |
| provision_link | sandbox | 200 | 4.5 | 66.9 | 148.5 | 0 |
| provision_verify | sandbox | 100 | 12 | 60.7 | 439.9 | 0 |
| python_inline | sandbox | 300 | 4.2 | 18.9 | 380.9 | 0 |
| python:check-changed-symbol-order.py | sandbox | 99 | 3.5 | 11.6 | 18 | 0 |
| qa_diff | sandbox | 200 | 10.4 | 39.1 | 406.9 | 0 |
| qa_lint | sandbox | 100 | 63.9 | 82.2 | 181.3 | 0 |
| qa_probe | sandbox | 100 | 4.1 | 12.6 | 73.8 | 0 |
| read_source | sandbox | 199 | 6.4 | 32.5 | 170.6 | 0 |
| shell | sandbox | 498 | 4.5 | 33.5 | 137.3 | 0 |
| source_query | sandbox | 100 | 6.4 | 12.4 | 103.8 | 0 |
| stack_check | sandbox | 300 | 33.9 | 53.8 | 122.8 | 0 |
| steering_decide | sandbox | 130 | 123.5 | 130.5 | 145.8 | 0 |
| steering_edits | sandbox | 130 | 32.9 | 44.3 | 76.3 | 0 |
| steering_mwcc | sandbox | 130 | 503.5 | 514.5 | 538.6 | 0 |
| steering_placement_probe | sandbox | 100 | 10.3 | 17.9 | 45.5 | 0 |
| steering_reduce | sandbox | 130 | 402.6 | 411.7 | 429.1 | 0 |
| symbol_baseline | sandbox | 99 | 6.4 | 25.4 | 30.1 | 0 |
| test | sandbox | 200 | 7 | 50.7 | 337.3 | 0 |
| undefined_symbols | sandbox | 200 | 4.4 | 22.8 | 102.2 | 0 |
| upload_via_exec | sandbox | 331 | 3.6 | 10.6 | 27.1 | 0 |

Required-step coverage: 100 attempt sandboxes; missing {}.

### Host processes spawned (placement evidence)

| role:step | n | p50 ms | p95 ms | cpu ms total | example |
| --- | --- | --- | --- | --- | --- |
| orchestrator:git_show | 30 | 149 | 186.4 | 1272.3 | git show 81248bdac58da1ff74128ba8c3a3798372fa5371:src/Enemy/igaiga.cpp |
| orchestrator:worker_child | 100 | 13552.4 | 14139.5 | 120923.6 | bun /Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop/objectives/worker-compiler-loop/scale/worker-child.ts --game sms |
| orchestrator:git_apply | 90 | 39.2 | 91.8 | 3236.6 | git apply --check /var/folders/hd/5sskjbf10bl2v1tx3jsvg_200000gn/T/scale-load-test/s11b-fake-ramp/step-100/state/runs/c410e736-a8f2-43e5-8187-94104c0e9778/worker_state/450baf14-7 |
| orchestrator:git_rev_parse | 90 | 37.2 | 84 | 3059.2 | git rev-parse HEAD |
| orchestrator:git_read-tree | 30 | 45.4 | 112.5 | 1243.4 | git read-tree ff7baf7bc1f69c99be114188dc8ffccfbfc89695 |
| orchestrator:diff_capture | 148 | 41.6 | 62 | 5607.4 | git diff --cached --raw |
| orchestrator:git_cat-file | 30 | 40.9 | 67.7 | 1110.4 | git cat-file -e ff7baf7bc1f69c99be114188dc8ffccfbfc89695:src/Enemy/tobiPuku.cpp |
| orchestrator:git_add | 30 | 41.9 | 82 | 1162 | git add -- src/Enemy/tobiPuku.cpp |
| orchestrator:git_commit | 30 | 75.3 | 251.7 | 2100.1 | git commit --no-verify -m |

### Daytona API

| op | calls | errors | 429 | p50 ms | p95 ms |
| --- | --- | --- | --- | --- | --- |
| sandbox.create | 100 | 0 | 0 | 28.5 | 111.2 |
| session.create | 200 | 0 | 0 | 4.2 | 45.1 |
| session.exec | 6294 | 0 | 0 | 9.2 | 402.3 |
| fs.upload | 630 | 0 | 0 | 3.4 | 80.6 |
| fs.download | 600 | 0 | 0 | 3.4 | 836.7 |
| sandbox.get | 200 | 0 | 0 | 6 | 90.1 |
| sandbox.delete | 100 | 0 | 0 | 17.8 | 22 |

Sandboxes: {"created":100,"create_failures":0,"deleted":100,"create_ms":{"n":100,"p50":28.5,"p95":111.2,"max":112.7},"delete_ms":{"n":100,"p50":17.9,"p95":22,"max":23.8},"by_purpose":{"worker":100},"build_sandboxes":0,"build_sandboxes_per_attempt":0}

Create admission (cumulative in this process): {"concurrency":100,"admitted":163,"queued":118,"quotaRefusals":0,"rateRefusals":0,"timeouts":0,"maxQueued":68}

### Attempts

| kind | attempts | ok | verdicts | p50 s | p95 s |
| --- | --- | --- | --- | --- | --- |
| clean_fix | 31 | 31 | {"passed/pass":31} | 13.3 | 13.9 |
| unverified_repair | 30 | 30 | {"target_regressed/pass":30} | 13.5 | 14.1 |
| evidence_review | 8 | 8 | {"steering_located/steering_located":8} | 13.3 | 14.2 |
| steering | 31 | 31 | {"steering_located/steering_located":31} | 13.3 | 14.1 |

### Phases

| phase | n | p50 ms | p95 ms | max ms | failed |
| --- | --- | --- | --- | --- | --- |
| provision | 100 | 1499 | 2909.5 | 2914.7 | 0 |
| tool:native_decisions | 100 | 240.1 | 449.1 | 699.4 | 0 |
| canned_edit | 100 | 4.3 | 36.2 | 73.9 | 0 |
| tool:compare_sources | 100 | 512.8 | 555.5 | 646.3 | 0 |
| agent_turn | 100 | 776.9 | 1005.8 | 1246 | 0 |
| child_import | 100 | 8345.5 | 9380.9 | 9612.5 | 0 |

Provision seed kinds (thin = ^baked bundle, full = whole history): {"thin":100}

Host: {"worker_children":89,"worker_peak_rss_mb":{"n":89,"p50":182.4,"p95":198.9,"max":222.2},"worker_cpu_seconds":{"n":89,"p50":1.2,"p95":1.3,"max":1.4},"orchestrator_peak_rss_mb":781.7,"orchestrator_cpu_seconds":7.1,"peak_total_rss_gb":16.45,"peak_concurrent_worker_children":100}

SQLite: {"waits_over_5ms":28,"busy_errors":0,"wait_ms":{"n":28,"p50":8.3,"p95":48.7,"max":74.6},"by_role":{"worker":{"n":28,"p50":8.3,"p95":48.7,"max":74.6,"total_ms":432.1}}}

Integration: {"drains":1,"processed":30,"drain_ms_total":26301.3,"per_item_ms":876.7,"items_per_minute":68.4}

### Failures by kind

None.

## Step 200

Jobs {"succeeded":200}; integration outcomes {"applied":69}; kinds {"clean_fix":70,"steering":52,"unverified_repair":70,"evidence_review":8}.

### Step latency and placement

| step | placement | n | p50 ms | p95 ms | max ms | non-zero exit |
| --- | --- | --- | --- | --- | --- | --- |
| attach_check | sandbox | 200 | 14.3 | 92.2 | 395.6 | 0 |
| build | sandbox | 666 | 174.3 | 246.5 | 406.8 | 0 |
| compare_sources | sandbox | 200 | 511 | 541.9 | 648.4 | 0 |
| diff_capture | sandbox | 800 | 10.3 | 87.4 | 434.8 | 0 |
| edit_scope | sandbox | 200 | 28.6 | 62 | 128.9 | 0 |
| format_check | sandbox | 400 | 12.3 | 65 | 141.8 | 0 |
| git_rev_parse | sandbox | 266 | 6.3 | 39.3 | 150.1 | 0 |
| mkdir | sandbox | 539 | 6.1 | 43.1 | 217.8 | 0 |
| native_decisions | sandbox | 200 | 226.2 | 390.8 | 574.8 | 0 |
| objdiff | sandbox | 600 | 24.4 | 89.4 | 194.9 | 0 |
| other:cp | sandbox | 269 | 10.5 | 52 | 175.9 | 0 |
| other:rm | sandbox | 400 | 9.8 | 77.4 | 237.6 | 0 |
| provision_checkout | sandbox | 200 | 14.8 | 24.5 | 26.6 | 0 |
| provision_git | sandbox | 400 | 12.9 | 22.3 | 26.4 | 0 |
| provision_link | sandbox | 400 | 5.7 | 67.3 | 229.9 | 0 |
| provision_verify | sandbox | 200 | 10.4 | 1158.8 | 1529.6 | 0 |
| python_inline | sandbox | 600 | 8.7 | 57.7 | 314.4 | 0 |
| python:check-changed-symbol-order.py | sandbox | 196 | 6.4 | 51.3 | 102.7 | 0 |
| qa_diff | sandbox | 400 | 15.6 | 103.8 | 408.6 | 0 |
| qa_lint | sandbox | 200 | 73.1 | 148.8 | 307.7 | 0 |
| qa_probe | sandbox | 200 | 7.3 | 85.6 | 343.5 | 0 |
| read_source | sandbox | 396 | 11.3 | 103.1 | 194 | 0 |
| shell | sandbox | 992 | 8.1 | 90.7 | 438.6 | 0 |
| source_query | sandbox | 200 | 11.7 | 51.1 | 130.4 | 0 |
| stack_check | sandbox | 600 | 41.5 | 105.2 | 305.7 | 0 |
| steering_decide | sandbox | 270 | 123.4 | 143.8 | 166 | 0 |
| steering_edits | sandbox | 270 | 34.6 | 92 | 210.9 | 0 |
| steering_mwcc | sandbox | 270 | 503.6 | 524.4 | 587.9 | 0 |
| steering_placement_probe | sandbox | 200 | 15.4 | 76.6 | 236.8 | 0 |
| steering_reduce | sandbox | 270 | 404.4 | 434.3 | 512.8 | 0 |
| symbol_baseline | sandbox | 196 | 12.7 | 78.6 | 134.5 | 0 |
| test | sandbox | 400 | 12.3 | 204 | 438.8 | 0 |
| undefined_symbols | sandbox | 400 | 10.6 | 64.8 | 198.1 | 0 |
| upload_via_exec | sandbox | 673 | 6.9 | 52.4 | 148.6 | 0 |

Required-step coverage: 200 attempt sandboxes; missing {}.

### Host processes spawned (placement evidence)

| role:step | n | p50 ms | p95 ms | cpu ms total | example |
| --- | --- | --- | --- | --- | --- |
| orchestrator:git_show | 70 | 232.9 | 384.4 | 2718.7 | git show 81248bdac58da1ff74128ba8c3a3798372fa5371:src/Enemy/igaiga.cpp |
| orchestrator:worker_child | 200 | 17067.5 | 19341.9 | 233865.6 | bun /Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop/objectives/worker-compiler-loop/scale/worker-child.ts --game sms |
| orchestrator:git_apply | 207 | 39.1 | 70.1 | 7379 | git apply --check /var/folders/hd/5sskjbf10bl2v1tx3jsvg_200000gn/T/scale-load-test/s11b-fake-ramp/step-200/state/runs/d017fdfe-0c99-4072-85de-1cfd27f07795/worker_state/1c1d4e41-e |
| orchestrator:git_rev_parse | 207 | 37.1 | 54.5 | 6895.6 | git rev-parse HEAD |
| orchestrator:git_read-tree | 69 | 43.4 | 82.5 | 2789 | git read-tree ff7baf7bc1f69c99be114188dc8ffccfbfc89695 |
| orchestrator:diff_capture | 343 | 41.7 | 69.5 | 13274 | git diff --cached --raw |
| orchestrator:git_cat-file | 69 | 40.8 | 58.3 | 2555.7 | git cat-file -e ff7baf7bc1f69c99be114188dc8ffccfbfc89695:src/Enemy/chuuhana.cpp |
| orchestrator:git_add | 69 | 42.8 | 88.1 | 2704.6 | git add -- src/Enemy/chuuhana.cpp |
| orchestrator:git_commit | 69 | 75.2 | 110 | 4791.7 | git commit --no-verify -m |

### Daytona API

| op | calls | errors | 429 | p50 ms | p95 ms |
| --- | --- | --- | --- | --- | --- |
| sandbox.create | 200 | 0 | 0 | 29.1 | 122.2 |
| session.create | 400 | 0 | 0 | 5.4 | 68.1 |
| session.exec | 12673 | 0 | 0 | 15.6 | 404.9 |
| fs.upload | 1270 | 0 | 0 | 6.7 | 197.6 |
| fs.download | 1200 | 0 | 0 | 8.2 | 87.7 |
| sandbox.get | 406 | 5 | 0 | 15.5 | 1022.9 |
| sandbox.delete | 201 | 1 | 0 | 19.2 | 791.6 |

Sandboxes: {"created":200,"create_failures":0,"deleted":200,"create_ms":{"n":200,"p50":29.2,"p95":122.3,"max":124},"delete_ms":{"n":200,"p50":19.4,"p95":791.6,"max":1536.1},"by_purpose":{"worker":200},"build_sandboxes":0,"build_sandboxes_per_attempt":0}

Create admission (cumulative in this process): {"concurrency":200,"admitted":364,"queued":302,"quotaRefusals":0,"rateRefusals":0,"timeouts":0,"maxQueued":177}

### Attempts

| kind | attempts | ok | verdicts | p50 s | p95 s |
| --- | --- | --- | --- | --- | --- |
| steering | 52 | 52 | {"steering_located/steering_located":52} | 16.8 | 19.6 |
| clean_fix | 70 | 70 | {"passed/pass":70} | 17 | 18.9 |
| evidence_review | 8 | 8 | {"steering_located/steering_located":8} | 16 | 19.4 |
| unverified_repair | 70 | 70 | {"target_regressed/pass":70} | 14.3 | 18 |

### Phases

| phase | n | p50 ms | p95 ms | max ms | failed |
| --- | --- | --- | --- | --- | --- |
| provision | 200 | 7786.4 | 19580.7 | 21159 | 0 |
| tool:native_decisions | 200 | 279.3 | 632.9 | 1040.6 | 0 |
| canned_edit | 200 | 10.9 | 80.4 | 289.5 | 0 |
| tool:compare_sources | 200 | 529.7 | 616.7 | 935.3 | 0 |
| agent_turn | 200 | 846.7 | 1269.7 | 1587.1 | 0 |
| child_import | 200 | 9086 | 11502.5 | 12081.6 | 0 |

Provision seed kinds (thin = ^baked bundle, full = whole history): {"thin":200}

Host: {"worker_children":152,"worker_peak_rss_mb":{"n":152,"p50":177.5,"p95":200.8,"max":253.7},"worker_cpu_seconds":{"n":152,"p50":1.1,"p95":1.3,"max":1.4},"orchestrator_peak_rss_mb":966.7,"orchestrator_cpu_seconds":15.3,"peak_total_rss_gb":19.99,"peak_concurrent_worker_children":155}

SQLite: {"waits_over_5ms":219,"busy_errors":0,"wait_ms":{"n":219,"p50":37.3,"p95":331.2,"max":607.7},"by_role":{"worker":{"n":198,"p50":41.5,"p95":336.5,"max":607.7,"total_ms":17195.4},"orchestrator":{"n":21,"p50":12,"p95":102.7,"max":121.1,"total_ms":581.5}}}

Integration: {"drains":2,"processed":69,"drain_ms_total":63931.4,"per_item_ms":926.5,"items_per_minute":64.8}

### Failures by kind

None.
