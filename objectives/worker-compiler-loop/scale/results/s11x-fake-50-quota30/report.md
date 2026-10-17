# Load test s11x-fake-50-quota30

- Mode: dry-run (fake Daytona)
- Window: 2026-10-17T17:41:25.653Z to 2026-10-17T17:41:44.468Z
- Cost guard: {"limits":{"maxAlive":60,"maxSandboxMinutes":100000,"allowBuildSandboxes":false},"created":51,"created_by_purpose":{"worker":51},"alive":0,"peak_alive":30,"sandbox_minutes":5.641,"refused_creates":0,"build_creates_refused":0,"tripped":null}
- Kill switch: [{"run_id":"s11x-fake-50-quota30","found":0,"deleted":0,"errors":[],"remaining":0,"ms":5.363000000001193}]
- Fake Daytona: peak alive 30, created 51, alive at end 0

## Ramp

| concurrency | attempts ok/total | wall s | attempt p50/p95 s | provision p50/p95 ms | API calls | API calls/attempt | 429 | build sandboxes | placement failures | toolpack re-syncs | worker RSS p50/max MB | peak total RSS GB | sqlite waits >5ms (max ms) | integration items/min |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 50 | 50/50 | 17.72 | 5.7/6.9 | 520.6/7521.4 | 4054 | 81.1 | 2 | 0 | 0 | 0 | 179.7/203 | 5.58 | 16 (27.6) | 68.7 |

## Step 50

Jobs {"succeeded":50}; integration outcomes {"applied":13}; kinds {"clean_fix":14,"steering":14,"unverified_repair":14,"evidence_review":8}.

### Step latency and placement

| step | placement | n | p50 ms | p95 ms | max ms | non-zero exit |
| --- | --- | --- | --- | --- | --- | --- |
| attach_check | sandbox | 50 | 4.2 | 17.6 | 24.1 | 0 |
| build | sandbox | 164 | 161.7 | 175 | 211.2 | 0 |
| compare_sources | sandbox | 50 | 503.1 | 506.3 | 508.8 | 0 |
| diff_capture | sandbox | 200 | 3.1 | 9 | 45.6 | 0 |
| edit_scope | sandbox | 50 | 21.5 | 22.5 | 23.4 | 0 |
| format_check | sandbox | 100 | 7.4 | 9.2 | 10.9 | 0 |
| git_rev_parse | sandbox | 64 | 2.6 | 5.1 | 8.4 | 0 |
| mkdir | sandbox | 127 | 2.9 | 8.9 | 30.6 | 0 |
| native_decisions | sandbox | 50 | 203.5 | 224.3 | 240.1 | 0 |
| objdiff | sandbox | 150 | 14.1 | 20.8 | 67.3 | 0 |
| other:cp | sandbox | 63 | 2.9 | 10.3 | 17.8 | 0 |
| other:rm | sandbox | 100 | 2.8 | 9.5 | 31.4 | 0 |
| provision_checkout | sandbox | 50 | 13.5 | 17.2 | 17.7 | 0 |
| provision_git | sandbox | 100 | 12 | 15.5 | 32.5 | 0 |
| provision_link | sandbox | 100 | 2.9 | 10.7 | 24.4 | 0 |
| provision_verify | sandbox | 50 | 8.4 | 35.6 | 159.5 | 0 |
| python_inline | sandbox | 150 | 2.7 | 9 | 19 | 0 |
| python:check-changed-symbol-order.py | sandbox | 50 | 2.4 | 3.3 | 4.2 | 0 |
| qa_diff | sandbox | 100 | 8.1 | 13.1 | 35.1 | 0 |
| qa_lint | sandbox | 50 | 61.6 | 65.1 | 66.6 | 0 |
| qa_probe | sandbox | 50 | 2.5 | 4.2 | 5.1 | 0 |
| read_source | sandbox | 100 | 4.7 | 8.6 | 24.5 | 0 |
| shell | sandbox | 250 | 3.2 | 27.6 | 73.3 | 0 |
| source_query | sandbox | 50 | 5.4 | 6.6 | 7.5 | 0 |
| stack_check | sandbox | 150 | 31.6 | 37.7 | 57.4 | 0 |
| steering_decide | sandbox | 64 | 122.4 | 129.1 | 131.4 | 0 |
| steering_edits | sandbox | 64 | 31.6 | 32.7 | 33.9 | 0 |
| steering_mwcc | sandbox | 64 | 502.4 | 511.4 | 519.4 | 0 |
| steering_placement_probe | sandbox | 50 | 9.5 | 10.5 | 15.4 | 0 |
| steering_reduce | sandbox | 64 | 402.5 | 404.6 | 416.8 | 0 |
| symbol_baseline | sandbox | 50 | 3.4 | 14.2 | 159.5 | 0 |
| test | sandbox | 100 | 3.1 | 27.2 | 63.5 | 0 |
| undefined_symbols | sandbox | 100 | 2.6 | 6.6 | 20.1 | 0 |
| upload_via_exec | sandbox | 164 | 2.5 | 3.4 | 4.8 | 0 |

Required-step coverage: 50 attempt sandboxes; missing {}.

### Host processes spawned (placement evidence)

| role:step | n | p50 ms | p95 ms | cpu ms total | example |
| --- | --- | --- | --- | --- | --- |
| orchestrator:git_show | 14 | 90.8 | 111.6 | 553.2 | git show 81248bdac58da1ff74128ba8c3a3798372fa5371:src/Enemy/gatekeeper.cpp |
| orchestrator:git_merge-base | 50 | 95.1 | 139.7 | 2113.8 | git merge-base --is-ancestor 3b83dd4611ff59dcfdb521c11d780716aa25a124 |
| orchestrator:worker_child | 50 | 5790.5 | 6999.8 | 59211.7 | bun /Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop/objectives/worker-compiler-loop/scale/worker-child.ts --game sms |
| orchestrator:git_apply | 39 | 42.1 | 177.7 | 1462.5 | git apply --check /var/folders/hd/5sskjbf10bl2v1tx3jsvg_200000gn/T/scale-load-test/s11x-fake-50-quota30/step-50/state/runs/28b19cc9-d75e-4796-9eab-b68b5d025b6d/worker_state/b464b |
| orchestrator:git_rev_parse | 53 | 38.9 | 149.8 | 1959.2 | git rev-parse HEAD |
| orchestrator:git_read-tree | 13 | 47.2 | 368.8 | 549.3 | git read-tree ff7baf7bc1f69c99be114188dc8ffccfbfc89695 |
| orchestrator:diff_capture | 63 | 41.9 | 110.4 | 2433.4 | git diff --cached --raw |
| orchestrator:git_cat-file | 13 | 41.3 | 177.8 | 503.9 | git cat-file -e ff7baf7bc1f69c99be114188dc8ffccfbfc89695:src/System/EventWatcher.cpp |
| orchestrator:git_add | 13 | 44.2 | 97.4 | 532.7 | git add -- src/System/EventWatcher.cpp |
| orchestrator:git_commit | 13 | 77.2 | 290.9 | 955.4 | git commit --no-verify -m |

### Daytona API

| op | calls | errors | 429 | p50 ms | p95 ms |
| --- | --- | --- | --- | --- | --- |
| sandbox.create | 52 | 2 | 2 | 48.2 | 66.8 |
| session.create | 100 | 0 | 0 | 3.3 | 14.8 |
| session.exec | 3138 | 0 | 0 | 6.2 | 402.1 |
| fs.upload | 314 | 0 | 0 | 2.4 | 27.2 |
| fs.download | 300 | 0 | 0 | 2.3 | 13 |
| sandbox.get | 100 | 0 | 0 | 3.7 | 27.3 |
| sandbox.delete | 50 | 0 | 0 | 19.6 | 24.6 |

Sandboxes: {"created":50,"create_failures":2,"deleted":50,"create_ms":{"n":50,"p50":48.6,"p95":66.9,"max":67.3},"delete_ms":{"n":50,"p50":19.7,"p95":24.6,"max":34.1},"by_purpose":{"worker":50},"build_sandboxes":0,"build_sandboxes_per_attempt":0}

Create admission (cumulative in this process): {"concurrency":50,"admitted":53,"queued":36,"quotaRefusals":2,"rateRefusals":0,"timeouts":0,"maxQueued":24}

### Attempts

| kind | attempts | ok | verdicts | p50 s | p95 s |
| --- | --- | --- | --- | --- | --- |
| steering | 14 | 14 | {"steering_located/steering_located":14} | 5.5 | 5.8 |
| evidence_review | 8 | 8 | {"steering_located/steering_located":8} | 5.7 | 5.8 |
| clean_fix | 14 | 14 | {"passed/pass":14} | 5.6 | 5.9 |
| unverified_repair | 14 | 14 | {"target_regressed/pass":14} | 6.6 | 7 |

### Phases

| phase | n | p50 ms | p95 ms | max ms | failed |
| --- | --- | --- | --- | --- | --- |
| provision | 50 | 520.6 | 7521.4 | 7672.3 | 0 |
| tool:native_decisions | 50 | 215.9 | 264.6 | 313.5 | 0 |
| canned_edit | 50 | 1.7 | 8.8 | 20 | 0 |
| tool:compare_sources | 50 | 508.8 | 526.8 | 549.1 | 0 |
| agent_turn | 50 | 732.2 | 785.3 | 876.7 | 0 |
| child_import | 50 | 2485.3 | 2821.3 | 2862.2 | 0 |

Provision seed kinds (thin = ^baked bundle, full = whole history): {"thin":50}

Host: {"worker_children":44,"worker_peak_rss_mb":{"n":44,"p50":179.7,"p95":188.9,"max":203},"worker_cpu_seconds":{"n":44,"p50":1.2,"p95":1.3,"max":1.3},"orchestrator_peak_rss_mb":517.7,"orchestrator_cpu_seconds":3,"peak_total_rss_gb":5.58,"peak_concurrent_worker_children":30}

SQLite: {"waits_over_5ms":16,"busy_errors":0,"wait_ms":{"n":16,"p50":10.7,"p95":27.6,"max":27.6},"by_role":{"worker":{"n":13,"p50":10.7,"p95":27.2,"max":27.2,"total_ms":180.7},"orchestrator":{"n":3,"p50":25.7,"p95":27.6,"max":27.6,"total_ms":60.4}}}

Integration: {"drains":1,"processed":13,"drain_ms_total":11351.4,"per_item_ms":873.2,"items_per_minute":68.7}

### Failures by kind

None.
