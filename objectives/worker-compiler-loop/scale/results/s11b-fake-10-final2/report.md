# Load test s11b-fake-10-final2

- Mode: dry-run (fake Daytona)
- Window: 2026-10-17T21:17:16.081Z to 2026-10-17T21:17:24.256Z
- Cost guard: {"limits":{"maxAlive":20,"maxSandboxMinutes":100000,"allowBuildSandboxes":false},"created":11,"failed_creates":{"allocated":0,"allocated_nothing":0,"unconfirmed":0},"created_by_purpose":{"worker":11},"alive":0,"peak_alive":10,"sandbox_minutes":0.756,"refused_creates":0,"build_creates_refused":0,"tripped":null}
- Kill switch: [{"run_id":"s11b-fake-10-final2","found":0,"deleted":0,"errors":[],"remaining":0,"ms":5.942291999999725}]
- Fake Daytona: peak alive 10, created 11, alive at end 0

## Ramp

| concurrency | attempts ok/total | wall s | attempt p50/p95 s | provision p50/p95 ms | API calls | API calls/attempt | 429 | build sandboxes | placement failures | toolpack re-syncs | worker RSS p50/max MB | peak total RSS GB | sqlite waits >5ms (max ms) | integration items/min |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | 10/10 | 7.19 | 3.8/4.8 | 165.9/371 | 822 | 82.2 | 0 | 0 | 0 | 0 | 179.8/211.4 | 2.03 | 0 (0) | 42.3 |

## Step 10

Jobs {"succeeded":10}; integration outcomes {"applied":2}; kinds {"clean_fix":3,"steering":3,"unverified_repair":2,"evidence_review":2}.

### Step latency and placement

| step | placement | n | p50 ms | p95 ms | max ms | non-zero exit |
| --- | --- | --- | --- | --- | --- | --- |
| attach_check | sandbox | 10 | 3.4 | 7.9 | 7.9 | 0 |
| build | sandbox | 32 | 161.7 | 163.6 | 165.4 | 0 |
| compare_sources | sandbox | 10 | 501.9 | 506.3 | 506.3 | 0 |
| diff_capture | sandbox | 40 | 2.7 | 4.8 | 5.6 | 0 |
| edit_scope | sandbox | 10 | 21.6 | 23.5 | 23.5 | 0 |
| format_check | sandbox | 20 | 7.6 | 8.5 | 8.5 | 0 |
| git_rev_parse | sandbox | 12 | 2.7 | 5.6 | 5.6 | 0 |
| mkdir | sandbox | 24 | 2.7 | 7 | 7 | 0 |
| native_decisions | sandbox | 10 | 202.8 | 205.2 | 205.2 | 0 |
| objdiff | sandbox | 30 | 13.9 | 17.2 | 27.2 | 0 |
| other:cp | sandbox | 12 | 2.6 | 7.7 | 7.7 | 0 |
| other:rm | sandbox | 20 | 2.4 | 4.3 | 6 | 0 |
| provision_checkout | sandbox | 10 | 15.6 | 15.6 | 15.6 | 0 |
| provision_git | sandbox | 20 | 12.2 | 20.5 | 20.6 | 0 |
| provision_link | sandbox | 20 | 3.2 | 6.7 | 7 | 0 |
| provision_verify | sandbox | 10 | 4.6 | 6.7 | 6.7 | 0 |
| python_inline | sandbox | 30 | 2.7 | 3.7 | 3.8 | 0 |
| python:check-changed-symbol-order.py | sandbox | 10 | 2.7 | 2.8 | 2.8 | 0 |
| qa_diff | sandbox | 20 | 7.6 | 9.2 | 11.9 | 0 |
| qa_lint | sandbox | 10 | 62.4 | 63.6 | 63.6 | 0 |
| qa_probe | sandbox | 10 | 2.7 | 2.8 | 2.8 | 0 |
| read_source | sandbox | 20 | 4.5 | 6 | 6.7 | 0 |
| shell | sandbox | 50 | 2.8 | 11.5 | 14 | 0 |
| source_query | sandbox | 10 | 5.6 | 6.7 | 6.7 | 0 |
| stack_check | sandbox | 30 | 31.6 | 33.5 | 33.5 | 0 |
| steering_decide | sandbox | 12 | 123.7 | 124.5 | 124.5 | 0 |
| steering_edits | sandbox | 12 | 32.6 | 33.8 | 33.8 | 0 |
| steering_mwcc | sandbox | 12 | 503.5 | 505.6 | 505.6 | 0 |
| steering_placement_probe | sandbox | 10 | 9.8 | 11.4 | 11.4 | 0 |
| steering_reduce | sandbox | 12 | 404.5 | 415.5 | 415.5 | 0 |
| symbol_baseline | sandbox | 10 | 2.5 | 3 | 3 | 0 |
| test | sandbox | 20 | 3 | 23.8 | 29.4 | 0 |
| undefined_symbols | sandbox | 20 | 2.5 | 5 | 5.2 | 0 |
| upload_via_exec | sandbox | 32 | 2.7 | 3.2 | 3.6 | 0 |

Required-step coverage: 10 attempt sandboxes; missing {}.

### Host processes spawned (placement evidence)

| role:step | n | p50 ms | p95 ms | cpu ms total | example |
| --- | --- | --- | --- | --- | --- |
| orchestrator:git_show | 4 | 39.8 | 59.2 | 143.5 | git show 81248bdac58da1ff74128ba8c3a3798372fa5371:src/Enemy/igaiga.cpp |
| orchestrator:git_rev_parse | 7 | 37.2 | 40.1 | 238.3 | git rev-parse --verify --quiet |
| orchestrator:worker_child | 10 | 3813.4 | 4868 | 12145 | bun /Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop/objectives/worker-compiler-loop/scale/worker-child.ts --game sms |
| orchestrator:git_apply | 6 | 37.9 | 42.6 | 212.9 | git apply --check /var/folders/hd/5sskjbf10bl2v1tx3jsvg_200000gn/T/scale-load-test/s11b-fake-10-final2/step-10/state/runs/81df2587-1bdb-4c95-a425-1a550c5627a3/worker_state/77a755 |
| orchestrator:git_read-tree | 2 | 42.7 | 44.2 | 79.9 | git read-tree ff7baf7bc1f69c99be114188dc8ffccfbfc89695 |
| orchestrator:diff_capture | 6 | 41.1 | 82.8 | 224.2 | git diff --cached --name-status |
| orchestrator:edit_scope | 2 | 368.2 | 1228.8 | 1551.1 | python3 /Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop/toolpacks/gamecube-decomp/_impl/gamecube/tools/edit_scope.py check --repo |
| orchestrator:git_cat-file | 2 | 40.8 | 41 | 74.5 | git cat-file -e ff7baf7bc1f69c99be114188dc8ffccfbfc89695:src/Enemy/BathtubKiller.cpp |
| orchestrator:git_add | 2 | 42.9 | 43.4 | 79.8 | git add -- src/Enemy/BathtubKiller.cpp |
| orchestrator:git_commit | 2 | 73.9 | 75 | 141.6 | git commit --no-verify -m |

### Daytona API

| op | calls | errors | 429 | p50 ms | p95 ms |
| --- | --- | --- | --- | --- | --- |
| sandbox.create | 10 | 0 | 0 | 49.3 | 50 |
| session.create | 20 | 0 | 0 | 2.5 | 4.6 |
| session.exec | 620 | 0 | 0 | 4.7 | 403.6 |
| fs.upload | 62 | 0 | 0 | 1.6 | 15.2 |
| fs.download | 80 | 0 | 0 | 1.5 | 6.5 |
| sandbox.get | 20 | 0 | 0 | 2.2 | 14 |
| sandbox.delete | 10 | 0 | 0 | 18.5 | 18.8 |

Sandboxes: {"created":10,"create_failures":0,"deleted":10,"create_ms":{"n":10,"p50":49.3,"p95":50,"max":50},"delete_ms":{"n":10,"p50":18.5,"p95":18.8,"max":18.8},"by_purpose":{"worker":10},"build_sandboxes":0,"build_sandboxes_per_attempt":0}

Create admission (cumulative in this process): {"concurrency":10,"admitted":11,"queued":0,"quotaRefusals":0,"rateRefusals":0,"timeouts":0,"maxQueued":0,"holds":0,"holdsReleased":0,"holdsExpired":0}

### Attempts

| kind | attempts | ok | verdicts | p50 s | p95 s |
| --- | --- | --- | --- | --- | --- |
| steering | 3 | 3 | {"steering_located/steering_located":3} | 3.7 | 3.8 |
| clean_fix | 3 | 3 | {"passed/pass":3} | 3.8 | 3.8 |
| evidence_review | 2 | 2 | {"steering_located/steering_located":2} | 3.8 | 3.8 |
| unverified_repair | 2 | 2 | {"target_regressed/pass":2} | 4.8 | 4.8 |

### Phases

| phase | n | p50 ms | p95 ms | max ms | failed |
| --- | --- | --- | --- | --- | --- |
| provision | 10 | 165.9 | 371 | 371 | 0 |
| tool:native_decisions | 10 | 213.3 | 245.2 | 245.2 | 0 |
| canned_edit | 10 | 1.5 | 1.7 | 1.7 | 0 |
| tool:compare_sources | 10 | 508.2 | 512.7 | 512.7 | 0 |
| agent_turn | 10 | 725.2 | 755.7 | 755.7 | 0 |
| child_import | 10 | 907.2 | 957.8 | 957.8 | 0 |

Provision seed kinds (thin = ^baked bundle, full = whole history): {"thin":10}

Native measurements (ok = nested status ok with its schema): {"native_decisions":{"calls":10,"ok":10,"failed":0,"by_reason":{}},"compare_sources":{"calls":10,"ok":10,"failed":0,"by_reason":{}}}

Host: {"worker_children":10,"worker_peak_rss_mb":{"n":10,"p50":179.8,"p95":211.4,"max":211.4},"worker_cpu_seconds":{"n":10,"p50":1.2,"p95":1.3,"max":1.3},"orchestrator_peak_rss_mb":248.3,"orchestrator_cpu_seconds":1.4,"peak_total_rss_gb":2.03,"peak_concurrent_worker_children":10}

SQLite: {"waits_over_5ms":0,"busy_errors":0,"wait_ms":{"n":0,"p50":null,"p95":null,"max":null},"by_role":{}}

Integration: {"drains":1,"processed":2,"drain_ms_total":2839.2,"per_item_ms":1419.6,"items_per_minute":42.3}

### Failures by kind

None.
