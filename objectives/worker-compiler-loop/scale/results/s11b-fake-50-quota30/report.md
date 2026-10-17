# Load test s11b-fake-50-quota30

- Mode: dry-run (fake Daytona)
- Window: 2026-10-17T17:53:49.315Z to 2026-10-17T17:54:05.901Z
- Cost guard: {"limits":{"maxAlive":60,"maxSandboxMinutes":100000,"allowBuildSandboxes":false},"created":51,"created_by_purpose":{"worker":51},"alive":0,"peak_alive":30,"sandbox_minutes":5.005,"refused_creates":0,"build_creates_refused":0,"tripped":null}
- Kill switch: [{"run_id":"s11b-fake-50-quota30","found":0,"deleted":0,"errors":[],"remaining":0,"ms":5.321541999997862}]
- Fake Daytona: peak alive 30, created 51, alive at end 0

## Ramp

| concurrency | attempts ok/total | wall s | attempt p50/p95 s | provision p50/p95 ms | API calls | API calls/attempt | 429 | build sandboxes | placement failures | toolpack re-syncs | worker RSS p50/max MB | peak total RSS GB | sqlite waits >5ms (max ms) | integration items/min |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 50 | 50/50 | 15.64 | 5.6/5.8 | 494.2/6652.8 | 4054 | 81.1 | 2 | 0 | 0 | 0 | 179.1/209.4 | 5.54 | 17 (59.5) | 77.8 |

## Step 50

Jobs {"succeeded":50}; integration outcomes {"applied":13}; kinds {"clean_fix":14,"steering":14,"unverified_repair":14,"evidence_review":8}.

### Step latency and placement

| step | placement | n | p50 ms | p95 ms | max ms | non-zero exit |
| --- | --- | --- | --- | --- | --- | --- |
| attach_check | sandbox | 50 | 4.4 | 10.6 | 33.3 | 0 |
| build | sandbox | 164 | 161.9 | 168.4 | 180.5 | 0 |
| compare_sources | sandbox | 50 | 502.3 | 506.2 | 514.2 | 0 |
| diff_capture | sandbox | 200 | 2.6 | 9.8 | 213.8 | 0 |
| edit_scope | sandbox | 50 | 21.5 | 24.4 | 28.5 | 0 |
| format_check | sandbox | 100 | 7.4 | 11.9 | 24.1 | 0 |
| git_rev_parse | sandbox | 64 | 2.8 | 5.2 | 6.8 | 0 |
| mkdir | sandbox | 127 | 3.5 | 9.9 | 25.9 | 0 |
| native_decisions | sandbox | 50 | 202.5 | 227.1 | 260.5 | 0 |
| objdiff | sandbox | 150 | 14.3 | 28.9 | 54.9 | 0 |
| other:cp | sandbox | 63 | 3 | 11.6 | 24.3 | 0 |
| other:rm | sandbox | 100 | 2.6 | 8.7 | 24.3 | 0 |
| provision_checkout | sandbox | 50 | 14.2 | 17.8 | 20 | 0 |
| provision_git | sandbox | 100 | 12.2 | 15.4 | 17.4 | 0 |
| provision_link | sandbox | 100 | 3.1 | 10.3 | 22 | 0 |
| provision_verify | sandbox | 50 | 9.7 | 69 | 71.7 | 0 |
| python_inline | sandbox | 150 | 2.7 | 6.7 | 44 | 0 |
| python:check-changed-symbol-order.py | sandbox | 50 | 2.5 | 6.6 | 6.8 | 0 |
| qa_diff | sandbox | 100 | 8 | 13.7 | 57 | 0 |
| qa_lint | sandbox | 50 | 61.6 | 66.3 | 70 | 0 |
| qa_probe | sandbox | 50 | 2.5 | 9 | 11.8 | 0 |
| read_source | sandbox | 100 | 4.7 | 14.3 | 21.6 | 0 |
| shell | sandbox | 250 | 3 | 10.1 | 78.4 | 0 |
| source_query | sandbox | 50 | 5.6 | 8.5 | 10.7 | 0 |
| stack_check | sandbox | 150 | 31.6 | 39.8 | 56.9 | 0 |
| steering_decide | sandbox | 64 | 122.5 | 126 | 129.3 | 0 |
| steering_edits | sandbox | 64 | 31.8 | 36.7 | 46.1 | 0 |
| steering_mwcc | sandbox | 64 | 502.4 | 505.3 | 509.9 | 0 |
| steering_placement_probe | sandbox | 50 | 9.5 | 14.2 | 19.1 | 0 |
| steering_reduce | sandbox | 64 | 402.5 | 405.3 | 411.7 | 0 |
| symbol_baseline | sandbox | 50 | 3.2 | 13.5 | 23.1 | 0 |
| test | sandbox | 100 | 3.3 | 30.3 | 78.4 | 0 |
| undefined_symbols | sandbox | 100 | 2.7 | 9.3 | 21.9 | 0 |
| upload_via_exec | sandbox | 164 | 2.6 | 5.4 | 10.2 | 0 |

Required-step coverage: 50 attempt sandboxes; missing {}.

### Host processes spawned (placement evidence)

| role:step | n | p50 ms | p95 ms | cpu ms total | example |
| --- | --- | --- | --- | --- | --- |
| orchestrator:git_show | 14 | 105.6 | 150.5 | 570.5 | git show 81248bdac58da1ff74128ba8c3a3798372fa5371:src/Enemy/igaiga.cpp |
| orchestrator:worker_child | 50 | 5638.8 | 5869.9 | 57809.5 | bun /Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop/objectives/worker-compiler-loop/scale/worker-child.ts --game sms |
| orchestrator:git_apply | 39 | 43.1 | 86.4 | 1438.7 | git apply --check /var/folders/hd/5sskjbf10bl2v1tx3jsvg_200000gn/T/scale-load-test/s11b-fake-50-quota30/step-50/state/runs/40147627-d258-49fd-beb1-18ce07794d11/worker_state/b824c |
| orchestrator:git_rev_parse | 40 | 37.7 | 68.1 | 1370.4 | git rev-parse HEAD |
| orchestrator:git_read-tree | 13 | 45.8 | 154 | 547.7 | git read-tree ff7baf7bc1f69c99be114188dc8ffccfbfc89695 |
| orchestrator:diff_capture | 63 | 42.4 | 90.6 | 2431.5 | git diff --cached --raw |
| orchestrator:git_cat-file | 13 | 40.7 | 95.3 | 488.4 | git cat-file -e ff7baf7bc1f69c99be114188dc8ffccfbfc89695:src/System/EventWatcher.cpp |
| orchestrator:git_add | 13 | 44.5 | 86.3 | 530 | git add -- src/System/EventWatcher.cpp |
| orchestrator:git_commit | 13 | 80.1 | 188.3 | 934 | git commit --no-verify -m |

### Daytona API

| op | calls | errors | 429 | p50 ms | p95 ms |
| --- | --- | --- | --- | --- | --- |
| sandbox.create | 52 | 2 | 2 | 26.2 | 66.2 |
| session.create | 100 | 0 | 0 | 2.4 | 12 |
| session.exec | 3138 | 0 | 0 | 6.3 | 402 |
| fs.upload | 314 | 0 | 0 | 2.1 | 26 |
| fs.download | 300 | 0 | 0 | 2.4 | 13.9 |
| sandbox.get | 100 | 0 | 0 | 3.3 | 16.9 |
| sandbox.delete | 50 | 0 | 0 | 17.3 | 23.7 |

Sandboxes: {"created":50,"create_failures":2,"deleted":50,"create_ms":{"n":50,"p50":26.3,"p95":66.2,"max":66.7},"delete_ms":{"n":50,"p50":17.3,"p95":23.8,"max":24},"by_purpose":{"worker":50},"build_sandboxes":0,"build_sandboxes_per_attempt":0}

Create admission (cumulative in this process): {"concurrency":50,"admitted":53,"queued":36,"quotaRefusals":2,"rateRefusals":0,"timeouts":0,"maxQueued":25}

### Attempts

| kind | attempts | ok | verdicts | p50 s | p95 s |
| --- | --- | --- | --- | --- | --- |
| clean_fix | 14 | 14 | {"passed/pass":14} | 5.6 | 5.8 |
| evidence_review | 8 | 8 | {"steering_located/steering_located":8} | 5.5 | 5.8 |
| steering | 14 | 14 | {"steering_located/steering_located":14} | 5.4 | 5.6 |
| unverified_repair | 14 | 14 | {"target_regressed/pass":14} | 5.7 | 5.8 |

### Phases

| phase | n | p50 ms | p95 ms | max ms | failed |
| --- | --- | --- | --- | --- | --- |
| provision | 50 | 494.2 | 6652.8 | 6909.5 | 0 |
| tool:native_decisions | 50 | 215.3 | 270.1 | 286.9 | 0 |
| canned_edit | 50 | 1.6 | 8.4 | 14.2 | 0 |
| tool:compare_sources | 50 | 507.7 | 522.2 | 532.8 | 0 |
| agent_turn | 50 | 732.8 | 793.7 | 796 | 0 |
| child_import | 50 | 2366.2 | 2699.7 | 2799.1 | 0 |

Provision seed kinds (thin = ^baked bundle, full = whole history): {"thin":50}

Host: {"worker_children":50,"worker_peak_rss_mb":{"n":50,"p50":179.1,"p95":194.7,"max":209.4},"worker_cpu_seconds":{"n":50,"p50":1.2,"p95":1.3,"max":1.3},"orchestrator_peak_rss_mb":497.3,"orchestrator_cpu_seconds":2.9,"peak_total_rss_gb":5.54,"peak_concurrent_worker_children":30}

SQLite: {"waits_over_5ms":17,"busy_errors":0,"wait_ms":{"n":17,"p50":16.9,"p95":59.5,"max":59.5},"by_role":{"worker":{"n":15,"p50":16.9,"p95":59.5,"max":59.5,"total_ms":340.5},"orchestrator":{"n":2,"p50":8.2,"p95":25.2,"max":25.2,"total_ms":33.5}}}

Integration: {"drains":2,"processed":13,"drain_ms_total":10025.6,"per_item_ms":771.2,"items_per_minute":77.8}

### Failures by kind

None.
