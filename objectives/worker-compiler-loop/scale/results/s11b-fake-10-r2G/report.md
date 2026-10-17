# Load test s11b-fake-10-r2G

- Mode: dry-run (fake Daytona)
- Window: 2026-10-17T18:20:27.964Z to 2026-10-17T18:20:37.824Z
- Cost guard: {"limits":{"maxAlive":20,"maxSandboxMinutes":100000,"allowBuildSandboxes":false},"created":11,"created_by_purpose":{"worker":11},"alive":0,"peak_alive":10,"sandbox_minutes":0.853,"refused_creates":0,"build_creates_refused":0,"tripped":null}
- Kill switch: [{"run_id":"s11b-fake-10-r2G","found":0,"deleted":0,"errors":[],"remaining":0,"ms":5.614999999999782}]
- Fake Daytona: peak alive 10, created 11, alive at end 0

## Ramp

| concurrency | attempts ok/total | wall s | attempt p50/p95 s | provision p50/p95 ms | API calls | API calls/attempt | 429 | build sandboxes | placement failures | toolpack re-syncs | worker RSS p50/max MB | peak total RSS GB | sqlite waits >5ms (max ms) | integration items/min |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | 10/10 | 8.18 | 4.4/5.4 | 180.9/484.2 | 802 | 80.2 | 0 | 0 | 0 | 0 | 181.5/206.7 | 2.05 | 0 (0) | 35.3 |

## Step 10

Jobs {"succeeded":10}; integration outcomes {"applied":2}; kinds {"clean_fix":3,"steering":3,"unverified_repair":2,"evidence_review":2}.

### Step latency and placement

| step | placement | n | p50 ms | p95 ms | max ms | non-zero exit |
| --- | --- | --- | --- | --- | --- | --- |
| attach_check | sandbox | 10 | 2.8 | 7.4 | 7.4 | 0 |
| build | sandbox | 32 | 162.1 | 165.2 | 169.2 | 0 |
| compare_sources | sandbox | 10 | 503.9 | 525.9 | 525.9 | 0 |
| diff_capture | sandbox | 40 | 2.8 | 5.7 | 19 | 0 |
| edit_scope | sandbox | 10 | 21.7 | 22.6 | 22.6 | 0 |
| format_check | sandbox | 20 | 7.4 | 9.2 | 9.4 | 0 |
| git_rev_parse | sandbox | 12 | 2.4 | 13.6 | 13.6 | 0 |
| mkdir | sandbox | 24 | 2.7 | 8.2 | 8.5 | 0 |
| native_decisions | sandbox | 10 | 202.6 | 212.1 | 212.1 | 0 |
| objdiff | sandbox | 30 | 14.6 | 31 | 31 | 0 |
| other:cp | sandbox | 12 | 2.6 | 5.1 | 5.1 | 0 |
| other:rm | sandbox | 20 | 2.8 | 6.4 | 9.7 | 0 |
| provision_checkout | sandbox | 10 | 14.7 | 27.1 | 27.1 | 0 |
| provision_git | sandbox | 20 | 12 | 12.5 | 12.6 | 0 |
| provision_link | sandbox | 20 | 3 | 3.6 | 4.6 | 0 |
| provision_verify | sandbox | 10 | 8.9 | 24.5 | 24.5 | 0 |
| python_inline | sandbox | 30 | 2.7 | 6.6 | 9.5 | 0 |
| python:check-changed-symbol-order.py | sandbox | 10 | 2.5 | 2.9 | 2.9 | 0 |
| qa_diff | sandbox | 20 | 8.3 | 19 | 30.7 | 0 |
| qa_lint | sandbox | 10 | 62.2 | 64.4 | 64.4 | 0 |
| qa_probe | sandbox | 10 | 2.8 | 17.7 | 17.7 | 0 |
| read_source | sandbox | 20 | 4.5 | 6.6 | 6.8 | 0 |
| shell | sandbox | 50 | 2.6 | 7.7 | 15 | 0 |
| source_query | sandbox | 10 | 5.5 | 6.8 | 6.8 | 0 |
| stack_check | sandbox | 30 | 31.8 | 35.2 | 38.3 | 0 |
| steering_decide | sandbox | 12 | 122.6 | 123 | 123 | 0 |
| steering_edits | sandbox | 12 | 32.1 | 34.2 | 34.2 | 0 |
| steering_mwcc | sandbox | 12 | 502.5 | 504.3 | 504.3 | 0 |
| steering_placement_probe | sandbox | 10 | 9.6 | 10.5 | 10.5 | 0 |
| steering_reduce | sandbox | 12 | 403 | 431.4 | 431.4 | 0 |
| symbol_baseline | sandbox | 10 | 2.8 | 5 | 5 | 0 |
| test | sandbox | 20 | 2.8 | 6.3 | 9.3 | 0 |
| undefined_symbols | sandbox | 20 | 2.5 | 5.6 | 9.1 | 0 |
| upload_via_exec | sandbox | 32 | 2.6 | 3.6 | 3.6 | 0 |

Required-step coverage: 10 attempt sandboxes; missing {}.

### Host processes spawned (placement evidence)

| role:step | n | p50 ms | p95 ms | cpu ms total | example |
| --- | --- | --- | --- | --- | --- |
| orchestrator:git_show | 4 | 40.5 | 44.7 | 152.2 | git show 81248bdac58da1ff74128ba8c3a3798372fa5371:src/Enemy/igaiga.cpp |
| orchestrator:git_rev_parse | 7 | 37.2 | 48 | 242 | git rev-parse --verify --quiet |
| orchestrator:worker_child | 10 | 4386.8 | 5406.8 | 12480.5 | bun /Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop/objectives/worker-compiler-loop/scale/worker-child.ts --game sms |
| orchestrator:git_apply | 6 | 42.9 | 49.3 | 224.8 | git apply --check /var/folders/hd/5sskjbf10bl2v1tx3jsvg_200000gn/T/scale-load-test/s11b-fake-10-r2G/step-10/state/runs/80b1c855-ab33-4571-a898-9109cf0d5500/worker_state/a52c2232- |
| orchestrator:git_read-tree | 2 | 57.4 | 71.2 | 96 | git read-tree ff7baf7bc1f69c99be114188dc8ffccfbfc89695 |
| orchestrator:diff_capture | 6 | 40.7 | 47.4 | 225.5 | git diff --cached --name-status |
| orchestrator:edit_scope | 2 | 984.6 | 1035.4 | 1650.7 | python3 /Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop/toolpacks/gamecube-decomp/_impl/gamecube/tools/edit_scope.py check --repo |
| orchestrator:git_cat-file | 2 | 43.1 | 43.5 | 77.3 | git cat-file -e ff7baf7bc1f69c99be114188dc8ffccfbfc89695:src/Enemy/hamukuri.cpp |
| orchestrator:git_add | 2 | 42.8 | 43.4 | 79 | git add -- src/Enemy/hamukuri.cpp |
| orchestrator:git_commit | 2 | 87.7 | 114 | 180.1 | git commit --no-verify -m |

### Daytona API

| op | calls | errors | 429 | p50 ms | p95 ms |
| --- | --- | --- | --- | --- | --- |
| sandbox.create | 10 | 0 | 0 | 26.5 | 27.7 |
| session.create | 20 | 0 | 0 | 1.5 | 2.1 |
| session.exec | 620 | 0 | 0 | 3.7 | 402 |
| fs.upload | 62 | 0 | 0 | 1.8 | 18.9 |
| fs.download | 60 | 0 | 0 | 1.9 | 8.1 |
| sandbox.get | 20 | 0 | 0 | 2.4 | 10.5 |
| sandbox.delete | 10 | 0 | 0 | 17.5 | 18.9 |

Sandboxes: {"created":10,"create_failures":0,"deleted":10,"create_ms":{"n":10,"p50":26.5,"p95":27.7,"max":27.7},"delete_ms":{"n":10,"p50":17.5,"p95":19,"max":19},"by_purpose":{"worker":10},"build_sandboxes":0,"build_sandboxes_per_attempt":0}

Create admission (cumulative in this process): {"concurrency":10,"admitted":11,"queued":0,"quotaRefusals":0,"rateRefusals":0,"timeouts":0,"maxQueued":0}

### Attempts

| kind | attempts | ok | verdicts | p50 s | p95 s |
| --- | --- | --- | --- | --- | --- |
| clean_fix | 3 | 3 | {"passed/pass":3} | 4.4 | 4.4 |
| steering | 3 | 3 | {"steering_located/steering_located":3} | 4.3 | 4.3 |
| evidence_review | 2 | 2 | {"steering_located/steering_located":2} | 4.4 | 4.4 |
| unverified_repair | 2 | 2 | {"target_regressed/pass":2} | 5.4 | 5.4 |

### Phases

| phase | n | p50 ms | p95 ms | max ms | failed |
| --- | --- | --- | --- | --- | --- |
| provision | 10 | 180.9 | 484.2 | 484.2 | 0 |
| tool:native_decisions | 10 | 213.9 | 225.5 | 225.5 | 0 |
| canned_edit | 10 | 1.5 | 2 | 2 | 0 |
| tool:compare_sources | 10 | 510.9 | 531.1 | 531.1 | 0 |
| agent_turn | 10 | 729.4 | 745.3 | 745.3 | 0 |
| child_import | 10 | 1425.3 | 1492.1 | 1492.1 | 0 |

Provision seed kinds (thin = ^baked bundle, full = whole history): {"thin":10}

Host: {"worker_children":10,"worker_peak_rss_mb":{"n":10,"p50":181.5,"p95":206.7,"max":206.7},"worker_cpu_seconds":{"n":10,"p50":1.2,"p95":1.3,"max":1.3},"orchestrator_peak_rss_mb":302.5,"orchestrator_cpu_seconds":1.7,"peak_total_rss_gb":2.05,"peak_concurrent_worker_children":10}

SQLite: {"waits_over_5ms":0,"busy_errors":0,"wait_ms":{"n":0,"p50":null,"p95":null,"max":null},"by_role":{}}

Integration: {"drains":1,"processed":2,"drain_ms_total":3400.4,"per_item_ms":1700.2,"items_per_minute":35.3}

### Failures by kind

None.
