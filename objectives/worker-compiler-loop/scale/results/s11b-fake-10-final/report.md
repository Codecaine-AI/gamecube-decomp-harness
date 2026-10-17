# Load test s11b-fake-10-final

- Mode: dry-run (fake Daytona)
- Window: 2026-10-17T20:56:00.354Z to 2026-10-17T20:56:09.546Z
- Cost guard: {"limits":{"maxAlive":20,"maxSandboxMinutes":100000,"allowBuildSandboxes":false},"created":11,"failed_creates":{"allocated":0,"allocated_nothing":0,"unconfirmed":0},"created_by_purpose":{"worker":11},"alive":0,"peak_alive":10,"sandbox_minutes":0.841,"refused_creates":0,"build_creates_refused":0,"tripped":null}
- Kill switch: [{"run_id":"s11b-fake-10-final","found":0,"deleted":0,"errors":[],"remaining":0,"ms":6.149499999999534}]
- Fake Daytona: peak alive 10, created 11, alive at end 0

## Ramp

| concurrency | attempts ok/total | wall s | attempt p50/p95 s | provision p50/p95 ms | API calls | API calls/attempt | 429 | build sandboxes | placement failures | toolpack re-syncs | worker RSS p50/max MB | peak total RSS GB | sqlite waits >5ms (max ms) | integration items/min |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | 10/10 | 7.99 | 4.3/5.3 | 149.7/396.2 | 822 | 82.2 | 0 | 0 | 0 | 0 | 181.4/205.6 | 2.05 | 0 (0) | 37.5 |

## Step 10

Jobs {"succeeded":10}; integration outcomes {"applied":2}; kinds {"clean_fix":3,"steering":3,"unverified_repair":2,"evidence_review":2}.

### Step latency and placement

| step | placement | n | p50 ms | p95 ms | max ms | non-zero exit |
| --- | --- | --- | --- | --- | --- | --- |
| attach_check | sandbox | 10 | 3.1 | 9.5 | 9.5 | 0 |
| build | sandbox | 32 | 162 | 164.3 | 167.1 | 0 |
| compare_sources | sandbox | 10 | 503.1 | 505.6 | 505.6 | 0 |
| diff_capture | sandbox | 40 | 2.8 | 5.8 | 9.8 | 0 |
| edit_scope | sandbox | 10 | 21.8 | 22.8 | 22.8 | 0 |
| format_check | sandbox | 20 | 7.5 | 9 | 9 | 0 |
| git_rev_parse | sandbox | 12 | 2.7 | 6.9 | 6.9 | 0 |
| mkdir | sandbox | 24 | 3.1 | 8.9 | 9 | 0 |
| native_decisions | sandbox | 10 | 204.8 | 211.5 | 211.5 | 0 |
| objdiff | sandbox | 30 | 13.9 | 29.4 | 49.5 | 0 |
| other:cp | sandbox | 12 | 3.2 | 4.5 | 4.5 | 0 |
| other:rm | sandbox | 20 | 2.6 | 3.9 | 8.7 | 0 |
| provision_checkout | sandbox | 10 | 15.6 | 15.9 | 15.9 | 0 |
| provision_git | sandbox | 20 | 13.1 | 14 | 14.1 | 0 |
| provision_link | sandbox | 20 | 2.6 | 13.7 | 17.8 | 0 |
| provision_verify | sandbox | 10 | 6.3 | 7.5 | 7.5 | 0 |
| python_inline | sandbox | 30 | 2.5 | 3.5 | 4.1 | 0 |
| python:check-changed-symbol-order.py | sandbox | 10 | 2.6 | 3 | 3 | 0 |
| qa_diff | sandbox | 20 | 7.8 | 9.7 | 13.3 | 0 |
| qa_lint | sandbox | 10 | 61.7 | 64.7 | 64.7 | 0 |
| qa_probe | sandbox | 10 | 2.5 | 3.5 | 3.5 | 0 |
| read_source | sandbox | 20 | 4.5 | 5.8 | 6.3 | 0 |
| shell | sandbox | 50 | 2.8 | 11.4 | 28.9 | 0 |
| source_query | sandbox | 10 | 5.8 | 6.6 | 6.6 | 0 |
| stack_check | sandbox | 30 | 31.7 | 33.4 | 36.9 | 0 |
| steering_decide | sandbox | 12 | 122.2 | 123.9 | 123.9 | 0 |
| steering_edits | sandbox | 12 | 32.5 | 33.7 | 33.7 | 0 |
| steering_mwcc | sandbox | 12 | 503.2 | 504.3 | 504.3 | 0 |
| steering_placement_probe | sandbox | 10 | 9.6 | 11.8 | 11.8 | 0 |
| steering_reduce | sandbox | 12 | 403.6 | 404.1 | 404.1 | 0 |
| symbol_baseline | sandbox | 10 | 2.7 | 4.7 | 4.7 | 0 |
| test | sandbox | 20 | 2.8 | 28 | 56.1 | 0 |
| undefined_symbols | sandbox | 20 | 2.7 | 18.5 | 18.9 | 0 |
| upload_via_exec | sandbox | 32 | 2.7 | 3.5 | 4.6 | 0 |

Required-step coverage: 10 attempt sandboxes; missing {}.

### Host processes spawned (placement evidence)

| role:step | n | p50 ms | p95 ms | cpu ms total | example |
| --- | --- | --- | --- | --- | --- |
| orchestrator:git_show | 4 | 38.6 | 46 | 142.2 | git show 81248bdac58da1ff74128ba8c3a3798372fa5371:src/Enemy/igaiga.cpp |
| orchestrator:git_rev_parse | 7 | 37.4 | 40.5 | 234.4 | git rev-parse --verify --quiet |
| orchestrator:worker_child | 10 | 4358.4 | 5322.7 | 11986.2 | bun /Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop/objectives/worker-compiler-loop/scale/worker-child.ts --game sms |
| orchestrator:git_apply | 6 | 41.1 | 69.6 | 211 | git apply --check /var/folders/hd/5sskjbf10bl2v1tx3jsvg_200000gn/T/scale-load-test/s11b-fake-10-final/step-10/state/runs/27b02c6a-e7d1-435d-b111-0e13ded38621/worker_state/d2f9ed1 |
| orchestrator:git_read-tree | 2 | 43.6 | 48.6 | 80.3 | git read-tree ff7baf7bc1f69c99be114188dc8ffccfbfc89695 |
| orchestrator:diff_capture | 6 | 42.4 | 189 | 235.5 | git diff --cached --name-status |
| orchestrator:edit_scope | 2 | 705.5 | 1030.3 | 1572.5 | python3 /Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop/toolpacks/gamecube-decomp/_impl/gamecube/tools/edit_scope.py check --repo |
| orchestrator:git_cat-file | 2 | 42.3 | 86.2 | 72 | git cat-file -e ff7baf7bc1f69c99be114188dc8ffccfbfc89695:src/Enemy/hamukuri.cpp |
| orchestrator:git_add | 2 | 41.6 | 43 | 76 | git add -- src/Enemy/hamukuri.cpp |
| orchestrator:git_commit | 2 | 72.1 | 97.4 | 140.9 | git commit --no-verify -m |

### Daytona API

| op | calls | errors | 429 | p50 ms | p95 ms |
| --- | --- | --- | --- | --- | --- |
| sandbox.create | 10 | 0 | 0 | 26.7 | 27.6 |
| session.create | 20 | 0 | 0 | 1.5 | 3.4 |
| session.exec | 620 | 0 | 0 | 5.3 | 403.3 |
| fs.upload | 62 | 0 | 0 | 2 | 12.4 |
| fs.download | 80 | 0 | 0 | 1.9 | 8.9 |
| sandbox.get | 20 | 0 | 0 | 1.5 | 11 |
| sandbox.delete | 10 | 0 | 0 | 17.8 | 18.5 |

Sandboxes: {"created":10,"create_failures":0,"deleted":10,"create_ms":{"n":10,"p50":26.7,"p95":27.7,"max":27.7},"delete_ms":{"n":10,"p50":17.8,"p95":18.5,"max":18.5},"by_purpose":{"worker":10},"build_sandboxes":0,"build_sandboxes_per_attempt":0}

Create admission (cumulative in this process): {"concurrency":10,"admitted":11,"queued":0,"quotaRefusals":0,"rateRefusals":0,"timeouts":0,"maxQueued":0,"holds":0,"holdsReleased":0,"holdsExpired":0}

### Attempts

| kind | attempts | ok | verdicts | p50 s | p95 s |
| --- | --- | --- | --- | --- | --- |
| clean_fix | 3 | 3 | {"passed/pass":3} | 4.2 | 4.3 |
| steering | 3 | 3 | {"steering_located/steering_located":3} | 4.3 | 4.3 |
| evidence_review | 2 | 2 | {"steering_located/steering_located":2} | 4.2 | 4.4 |
| unverified_repair | 2 | 2 | {"target_regressed/pass":2} | 5.3 | 5.3 |

### Phases

| phase | n | p50 ms | p95 ms | max ms | failed |
| --- | --- | --- | --- | --- | --- |
| provision | 10 | 149.7 | 396.2 | 396.2 | 0 |
| tool:native_decisions | 10 | 218.9 | 273.2 | 273.2 | 0 |
| canned_edit | 10 | 1.5 | 2.9 | 2.9 | 0 |
| tool:compare_sources | 10 | 509.9 | 512.5 | 512.5 | 0 |
| agent_turn | 10 | 731.1 | 786.3 | 786.3 | 0 |
| child_import | 10 | 1287.1 | 1366.1 | 1366.1 | 0 |

Provision seed kinds (thin = ^baked bundle, full = whole history): {"thin":10}

Native measurements (ok = nested status ok with its schema): {"native_decisions":{"calls":10,"ok":10,"failed":0,"by_reason":{}},"compare_sources":{"calls":10,"ok":10,"failed":0,"by_reason":{}}}

Host: {"worker_children":10,"worker_peak_rss_mb":{"n":10,"p50":181.4,"p95":205.6,"max":205.6},"worker_cpu_seconds":{"n":10,"p50":1.2,"p95":1.3,"max":1.3},"orchestrator_peak_rss_mb":274.4,"orchestrator_cpu_seconds":1.5,"peak_total_rss_gb":2.05,"peak_concurrent_worker_children":10}

SQLite: {"waits_over_5ms":0,"busy_errors":0,"wait_ms":{"n":0,"p50":null,"p95":null,"max":null},"by_role":{}}

Integration: {"drains":1,"processed":2,"drain_ms_total":3199.6,"per_item_ms":1599.8,"items_per_minute":37.5}

### Failures by kind

None.
