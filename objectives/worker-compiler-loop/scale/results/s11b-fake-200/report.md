# Load test s11b-fake-200

- Mode: dry-run (fake Daytona)
- Window: 2026-10-17T17:49:09.621Z to 2026-10-17T17:50:23.152Z
- Cost guard: {"limits":{"maxAlive":210,"maxSandboxMinutes":100000,"allowBuildSandboxes":false},"created":201,"created_by_purpose":{"worker":201},"alive":0,"peak_alive":200,"sandbox_minutes":72.877,"refused_creates":0,"build_creates_refused":0,"tripped":null}
- Kill switch: [{"run_id":"s11b-fake-200","found":0,"deleted":0,"errors":[],"remaining":0,"ms":5.6290830000070855}]
- Fake Daytona: peak alive 200, created 201, alive at end 0

## Ramp

| concurrency | attempts ok/total | wall s | attempt p50/p95 s | provision p50/p95 ms | API calls | API calls/attempt | 429 | build sandboxes | placement failures | toolpack re-syncs | worker RSS p50/max MB | peak total RSS GB | sqlite waits >5ms (max ms) | integration items/min |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 200 | 200/200 | 72.59 | 14/16 | 9730/15052.4 | 16346 | 81.7 | 0 | 0 | 0 | 0 | 179.8/254.8 | 16.17 | 137 (348) | 64.7 |

## Step 200

Jobs {"succeeded":200}; integration outcomes {"applied":69}; kinds {"clean_fix":70,"steering":52,"unverified_repair":70,"evidence_review":8}.

### Step latency and placement

| step | placement | n | p50 ms | p95 ms | max ms | non-zero exit |
| --- | --- | --- | --- | --- | --- | --- |
| attach_check | sandbox | 200 | 8.1 | 86 | 497 | 0 |
| build | sandbox | 666 | 167.2 | 243.5 | 527.9 | 0 |
| compare_sources | sandbox | 200 | 506.7 | 543.9 | 617.2 | 0 |
| diff_capture | sandbox | 800 | 5.1 | 46.6 | 380.7 | 0 |
| edit_scope | sandbox | 200 | 24.2 | 48.8 | 212.1 | 0 |
| format_check | sandbox | 400 | 9 | 35.2 | 143.3 | 0 |
| git_rev_parse | sandbox | 266 | 4.5 | 16.4 | 77.2 | 0 |
| mkdir | sandbox | 539 | 5.1 | 20.9 | 172.2 | 0 |
| native_decisions | sandbox | 200 | 219.1 | 352.9 | 562.9 | 0 |
| objdiff | sandbox | 600 | 17.2 | 50.7 | 329.5 | 0 |
| other:cp | sandbox | 269 | 5.2 | 29.5 | 212.2 | 0 |
| other:rm | sandbox | 400 | 4.2 | 34.2 | 140.3 | 0 |
| provision_checkout | sandbox | 200 | 15.5 | 24.4 | 32.8 | 0 |
| provision_git | sandbox | 400 | 13.6 | 17.4 | 34.3 | 0 |
| provision_link | sandbox | 400 | 4.9 | 53 | 574.4 | 0 |
| provision_verify | sandbox | 200 | 22.2 | 558.3 | 1004.8 | 0 |
| python_inline | sandbox | 600 | 4.6 | 34.2 | 177.6 | 0 |
| python:check-changed-symbol-order.py | sandbox | 196 | 3.8 | 35.9 | 68.4 | 0 |
| qa_diff | sandbox | 400 | 10.7 | 67.8 | 299.3 | 0 |
| qa_lint | sandbox | 200 | 65.4 | 152.1 | 375.5 | 0 |
| qa_probe | sandbox | 200 | 4.5 | 26.8 | 183.1 | 0 |
| read_source | sandbox | 396 | 7.1 | 86.6 | 321.1 | 0 |
| shell | sandbox | 992 | 5.2 | 49.4 | 270.7 | 0 |
| source_query | sandbox | 200 | 7.2 | 30.9 | 104.4 | 0 |
| stack_check | sandbox | 600 | 34.7 | 66.3 | 159.5 | 0 |
| steering_decide | sandbox | 270 | 122.4 | 138.8 | 177.9 | 0 |
| steering_edits | sandbox | 270 | 32.2 | 74.3 | 192.3 | 0 |
| steering_mwcc | sandbox | 270 | 502.4 | 524.2 | 535.1 | 0 |
| steering_placement_probe | sandbox | 200 | 11.6 | 70.1 | 211.9 | 0 |
| steering_reduce | sandbox | 270 | 402.6 | 432.9 | 506.5 | 0 |
| symbol_baseline | sandbox | 196 | 5.9 | 30.9 | 118.1 | 0 |
| test | sandbox | 400 | 9.6 | 188.1 | 523.7 | 0 |
| undefined_symbols | sandbox | 400 | 5.1 | 24.3 | 66.6 | 0 |
| upload_via_exec | sandbox | 673 | 3.5 | 27.1 | 263.1 | 0 |

Required-step coverage: 200 attempt sandboxes; missing {}.

### Host processes spawned (placement evidence)

| role:step | n | p50 ms | p95 ms | cpu ms total | example |
| --- | --- | --- | --- | --- | --- |
| orchestrator:git_show | 70 | 273.5 | 468.5 | 2915.3 | git show 81248bdac58da1ff74128ba8c3a3798372fa5371:src/Enemy/igaiga.cpp |
| orchestrator:git_rev_parse | 208 | 36.9 | 69 | 6903.9 | git rev-parse --verify --quiet |
| orchestrator:worker_child | 200 | 14313.5 | 16319.3 | 235194.3 | bun /Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop/objectives/worker-compiler-loop/scale/worker-child.ts --game sms |
| orchestrator:git_apply | 207 | 38.5 | 75.8 | 7290.1 | git apply --check /var/folders/hd/5sskjbf10bl2v1tx3jsvg_200000gn/T/scale-load-test/s11b-fake-200/step-200/state/runs/c53164eb-f408-4cc7-8a1f-a6811ad926f1/worker_state/300bd0ec-83 |
| orchestrator:git_read-tree | 69 | 44.7 | 69.6 | 2804.9 | git read-tree ff7baf7bc1f69c99be114188dc8ffccfbfc89695 |
| orchestrator:diff_capture | 343 | 41.2 | 66.6 | 13116.9 | git diff --cached --raw |
| orchestrator:git_cat-file | 69 | 40 | 80.8 | 2489.4 | git cat-file -e ff7baf7bc1f69c99be114188dc8ffccfbfc89695:src/System/EventWatcher.cpp |
| orchestrator:git_add | 69 | 42.4 | 51 | 2647.2 | git add -- src/System/EventWatcher.cpp |
| orchestrator:git_commit | 69 | 75 | 97.1 | 4701 | git commit --no-verify -m |

### Daytona API

| op | calls | errors | 429 | p50 ms | p95 ms |
| --- | --- | --- | --- | --- | --- |
| sandbox.create | 200 | 0 | 0 | 28.9 | 130.2 |
| session.create | 400 | 0 | 0 | 4.7 | 32.2 |
| session.exec | 12673 | 0 | 0 | 11.6 | 402.4 |
| fs.upload | 1270 | 0 | 0 | 5.2 | 219.5 |
| fs.download | 1200 | 0 | 0 | 4.5 | 112.2 |
| sandbox.get | 402 | 1 | 0 | 10 | 623.2 |
| sandbox.delete | 201 | 1 | 0 | 19.1 | 728.9 |

Sandboxes: {"created":200,"create_failures":0,"deleted":200,"create_ms":{"n":200,"p50":29,"p95":130.3,"max":132.8},"delete_ms":{"n":200,"p50":19.2,"p95":728.9,"max":1090.6},"by_purpose":{"worker":200},"build_sandboxes":0,"build_sandboxes_per_attempt":0}

Create admission (cumulative in this process): {"concurrency":200,"admitted":201,"queued":184,"quotaRefusals":0,"rateRefusals":0,"timeouts":0,"maxQueued":176}

### Attempts

| kind | attempts | ok | verdicts | p50 s | p95 s |
| --- | --- | --- | --- | --- | --- |
| steering | 52 | 52 | {"steering_located/steering_located":52} | 11.5 | 15.6 |
| clean_fix | 70 | 70 | {"passed/pass":70} | 12.6 | 15.3 |
| evidence_review | 8 | 8 | {"steering_located/steering_located":8} | 9.6 | 10.2 |
| unverified_repair | 70 | 70 | {"target_regressed/pass":70} | 14.9 | 16.3 |

### Phases

| phase | n | p50 ms | p95 ms | max ms | failed |
| --- | --- | --- | --- | --- | --- |
| provision | 200 | 9730 | 15052.4 | 17072.1 | 0 |
| tool:native_decisions | 200 | 261.5 | 600 | 987.7 | 0 |
| canned_edit | 200 | 6.6 | 55.8 | 147.2 | 0 |
| tool:compare_sources | 200 | 519.7 | 591.5 | 743.8 | 0 |
| agent_turn | 200 | 819.5 | 1156.7 | 1676.4 | 0 |
| child_import | 200 | 7588.8 | 10413.5 | 11201.5 | 0 |

Provision seed kinds (thin = ^baked bundle, full = whole history): {"thin":200}

Host: {"worker_children":155,"worker_peak_rss_mb":{"n":155,"p50":179.8,"p95":204.3,"max":254.8},"worker_cpu_seconds":{"n":155,"p50":1.1,"p95":1.3,"max":1.4},"orchestrator_peak_rss_mb":833,"orchestrator_cpu_seconds":9.6,"peak_total_rss_gb":16.17,"peak_concurrent_worker_children":131}

SQLite: {"waits_over_5ms":137,"busy_errors":0,"wait_ms":{"n":137,"p50":23.1,"p95":263.3,"max":348},"by_role":{"orchestrator":{"n":17,"p50":29.7,"p95":203.5,"max":203.5,"total_ms":944.6},"worker":{"n":120,"p50":21.8,"p95":263.3,"max":348,"total_ms":6790.9}}}

Integration: {"drains":2,"processed":69,"drain_ms_total":63974,"per_item_ms":927.2,"items_per_minute":64.7}

### Failures by kind

None.
