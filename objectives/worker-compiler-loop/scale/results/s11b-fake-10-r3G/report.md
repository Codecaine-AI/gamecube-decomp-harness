# Load test s11b-fake-10-r3G

- Mode: dry-run (fake Daytona)
- Window: 2026-10-17T18:27:50.043Z to 2026-10-17T18:27:58.563Z
- Cost guard: {"limits":{"maxAlive":20,"maxSandboxMinutes":100000,"allowBuildSandboxes":false},"created":11,"created_by_purpose":{"worker":11},"alive":0,"peak_alive":10,"sandbox_minutes":0.746,"refused_creates":0,"build_creates_refused":0,"tripped":null}
- Kill switch: [{"run_id":"s11b-fake-10-r3G","found":0,"deleted":0,"errors":[],"remaining":0,"ms":5.396875000000364}]
- Fake Daytona: peak alive 10, created 11, alive at end 0

## Ramp

| concurrency | attempts ok/total | wall s | attempt p50/p95 s | provision p50/p95 ms | API calls | API calls/attempt | 429 | build sandboxes | placement failures | toolpack re-syncs | worker RSS p50/max MB | peak total RSS GB | sqlite waits >5ms (max ms) | integration items/min |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | 10/10 | 7.46 | 3.8/4.9 | 165.8/327.7 | 802 | 80.2 | 0 | 0 | 0 | 0 | 181.7/212.9 | 2 | 1 (7.1) | 37.6 |

## Step 10

Jobs {"succeeded":10}; integration outcomes {"applied":2}; kinds {"clean_fix":3,"steering":3,"unverified_repair":2,"evidence_review":2}.

### Step latency and placement

| step | placement | n | p50 ms | p95 ms | max ms | non-zero exit |
| --- | --- | --- | --- | --- | --- | --- |
| attach_check | sandbox | 10 | 2.6 | 4 | 4 | 0 |
| build | sandbox | 32 | 161.6 | 162.5 | 174 | 0 |
| compare_sources | sandbox | 10 | 503.2 | 506 | 506 | 0 |
| diff_capture | sandbox | 40 | 2.4 | 3.4 | 5 | 0 |
| edit_scope | sandbox | 10 | 21.7 | 22.4 | 22.4 | 0 |
| format_check | sandbox | 20 | 7.3 | 8.1 | 8.2 | 0 |
| git_rev_parse | sandbox | 12 | 2.4 | 5.6 | 5.6 | 0 |
| mkdir | sandbox | 24 | 2.5 | 3.4 | 3.6 | 0 |
| native_decisions | sandbox | 10 | 202 | 205.3 | 205.3 | 0 |
| objdiff | sandbox | 30 | 13.6 | 19.4 | 33.2 | 0 |
| other:cp | sandbox | 12 | 2.3 | 2.5 | 2.5 | 0 |
| other:rm | sandbox | 20 | 2.4 | 2.8 | 3.5 | 0 |
| provision_checkout | sandbox | 10 | 14.3 | 14.4 | 14.4 | 0 |
| provision_git | sandbox | 20 | 12 | 21.3 | 21.4 | 0 |
| provision_link | sandbox | 20 | 2.5 | 4.7 | 8.6 | 0 |
| provision_verify | sandbox | 10 | 5.5 | 6.5 | 6.5 | 0 |
| python_inline | sandbox | 30 | 2.5 | 6.9 | 24.9 | 0 |
| python:check-changed-symbol-order.py | sandbox | 10 | 2.5 | 3.4 | 3.4 | 0 |
| qa_diff | sandbox | 20 | 7.6 | 9 | 12.5 | 0 |
| qa_lint | sandbox | 10 | 61.6 | 62.4 | 62.4 | 0 |
| qa_probe | sandbox | 10 | 2.5 | 3 | 3 | 0 |
| read_source | sandbox | 20 | 2.9 | 4.9 | 5.2 | 0 |
| shell | sandbox | 50 | 2.5 | 4.2 | 8.7 | 0 |
| source_query | sandbox | 10 | 5.4 | 6.3 | 6.3 | 0 |
| stack_check | sandbox | 30 | 31.4 | 34.2 | 50.4 | 0 |
| steering_decide | sandbox | 12 | 122.3 | 124.3 | 124.3 | 0 |
| steering_edits | sandbox | 12 | 31.6 | 32.5 | 32.5 | 0 |
| steering_mwcc | sandbox | 12 | 502.5 | 503 | 503 | 0 |
| steering_placement_probe | sandbox | 10 | 9.4 | 10.6 | 10.6 | 0 |
| steering_reduce | sandbox | 12 | 402.6 | 403.7 | 403.7 | 0 |
| symbol_baseline | sandbox | 10 | 2.5 | 5.3 | 5.3 | 0 |
| test | sandbox | 20 | 2.5 | 21.5 | 27.7 | 0 |
| undefined_symbols | sandbox | 20 | 2.4 | 3.4 | 5.2 | 0 |
| upload_via_exec | sandbox | 32 | 2.5 | 3.1 | 4 | 0 |

Required-step coverage: 10 attempt sandboxes; missing {}.

### Host processes spawned (placement evidence)

| role:step | n | p50 ms | p95 ms | cpu ms total | example |
| --- | --- | --- | --- | --- | --- |
| orchestrator:git_show | 4 | 39.5 | 59.8 | 141.5 | git show 81248bdac58da1ff74128ba8c3a3798372fa5371:src/Enemy/igaiga.cpp |
| orchestrator:git_rev_parse | 7 | 37.1 | 40.1 | 234.4 | git rev-parse --verify --quiet |
| orchestrator:worker_child | 10 | 3827.6 | 4935.3 | 11813.3 | bun /Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop/objectives/worker-compiler-loop/scale/worker-child.ts --game sms |
| orchestrator:git_apply | 6 | 38 | 85.7 | 216.8 | git apply --check /var/folders/hd/5sskjbf10bl2v1tx3jsvg_200000gn/T/scale-load-test/s11b-fake-10-r3G/step-10/state/runs/ff0fef2f-b95f-4300-9c08-df39a8224b75/worker_state/0ca8896b- |
| orchestrator:git_read-tree | 2 | 59.8 | 76.1 | 82.7 | git read-tree ff7baf7bc1f69c99be114188dc8ffccfbfc89695 |
| orchestrator:diff_capture | 6 | 40.5 | 41.2 | 219 | git diff --cached --name-status |
| orchestrator:edit_scope | 2 | 531.3 | 1324.7 | 1575.6 | python3 /Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop/toolpacks/gamecube-decomp/_impl/gamecube/tools/edit_scope.py check --repo |
| orchestrator:git_cat-file | 2 | 41 | 41.1 | 74.2 | git cat-file -e ff7baf7bc1f69c99be114188dc8ffccfbfc89695:src/Enemy/BathtubKiller.cpp |
| orchestrator:git_add | 2 | 44.4 | 61.7 | 77.6 | git add -- src/Enemy/BathtubKiller.cpp |
| orchestrator:git_commit | 2 | 74.6 | 85.4 | 144.3 | git commit --no-verify -m |

### Daytona API

| op | calls | errors | 429 | p50 ms | p95 ms |
| --- | --- | --- | --- | --- | --- |
| sandbox.create | 10 | 0 | 0 | 49.6 | 50.3 |
| session.create | 20 | 0 | 0 | 2.3 | 3.9 |
| session.exec | 620 | 0 | 0 | 3.4 | 402 |
| fs.upload | 62 | 0 | 0 | 1.5 | 14.4 |
| fs.download | 60 | 0 | 0 | 1.4 | 4.7 |
| sandbox.get | 20 | 0 | 0 | 1.6 | 10.7 |
| sandbox.delete | 10 | 0 | 0 | 17.2 | 17.3 |

Sandboxes: {"created":10,"create_failures":0,"deleted":10,"create_ms":{"n":10,"p50":49.6,"p95":50.4,"max":50.4},"delete_ms":{"n":10,"p50":17.3,"p95":17.4,"max":17.4},"by_purpose":{"worker":10},"build_sandboxes":0,"build_sandboxes_per_attempt":0}

Create admission (cumulative in this process): {"concurrency":10,"admitted":11,"queued":0,"quotaRefusals":0,"rateRefusals":0,"timeouts":0,"maxQueued":0}

### Attempts

| kind | attempts | ok | verdicts | p50 s | p95 s |
| --- | --- | --- | --- | --- | --- |
| steering | 3 | 3 | {"steering_located/steering_located":3} | 3.8 | 3.8 |
| evidence_review | 2 | 2 | {"steering_located/steering_located":2} | 3.8 | 3.8 |
| clean_fix | 3 | 3 | {"passed/pass":3} | 3.8 | 3.8 |
| unverified_repair | 2 | 2 | {"target_regressed/pass":2} | 4.9 | 4.9 |

### Phases

| phase | n | p50 ms | p95 ms | max ms | failed |
| --- | --- | --- | --- | --- | --- |
| provision | 10 | 165.8 | 327.7 | 327.7 | 0 |
| tool:native_decisions | 10 | 207.5 | 235.5 | 235.5 | 0 |
| canned_edit | 10 | 1.5 | 2.3 | 2.3 | 0 |
| tool:compare_sources | 10 | 507.2 | 510.2 | 510.2 | 0 |
| agent_turn | 10 | 716.5 | 744.4 | 744.4 | 0 |
| child_import | 10 | 994.5 | 1098.3 | 1098.3 | 0 |

Provision seed kinds (thin = ^baked bundle, full = whole history): {"thin":10}

Host: {"worker_children":8,"worker_peak_rss_mb":{"n":8,"p50":181.7,"p95":212.9,"max":212.9},"worker_cpu_seconds":{"n":8,"p50":1.2,"p95":1.3,"max":1.3},"orchestrator_peak_rss_mb":252.8,"orchestrator_cpu_seconds":1.4,"peak_total_rss_gb":2,"peak_concurrent_worker_children":10}

SQLite: {"waits_over_5ms":1,"busy_errors":0,"wait_ms":{"n":1,"p50":7.1,"p95":7.1,"max":7.1},"by_role":{"worker":{"n":1,"p50":7.1,"p95":7.1,"max":7.1,"total_ms":7.1}}}

Integration: {"drains":1,"processed":2,"drain_ms_total":3188.2,"per_item_ms":1594.1,"items_per_minute":37.6}

### Failures by kind

None.
