# Load test s11-fake-200-c

- Mode: dry-run (fake Daytona)
- Window: 2026-10-17T17:39:09.852Z to 2026-10-17T17:40:41.237Z
- Cost guard: {"limits":{"maxAlive":210,"maxSandboxMinutes":100000,"allowBuildSandboxes":false},"created":201,"created_by_purpose":{"worker":201},"alive":0,"peak_alive":200,"sandbox_minutes":95.673,"refused_creates":0,"build_creates_refused":0,"tripped":null}
- Kill switch: [{"run_id":"s11-fake-200-c","found":0,"deleted":0,"errors":[],"remaining":0,"ms":16.543332999994163}]
- Fake Daytona: peak alive 200, created 201, alive at end 0

## Ramp

| concurrency | attempts ok/total | wall s | attempt p50/p95 s | provision p50/p95 ms | API calls | API calls/attempt | 429 | build sandboxes | placement failures | toolpack re-syncs | worker RSS p50/max MB | peak total RSS GB | sqlite waits >5ms (max ms) | integration items/min |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 200 | 200/200 | 90.33 | 20.8/23.4 | 7169.5/9022.7 | 16347 | 81.7 | 0 | 0 | 0 | 0 | 175.7/255.1 | 27.75 | 341 (546.2) | 55.7 |

## Step 200

Jobs {"succeeded":200}; integration outcomes {"applied":69}; kinds {"clean_fix":70,"steering":52,"unverified_repair":70,"evidence_review":8}.

### Step latency and placement

| step | placement | n | p50 ms | p95 ms | max ms | non-zero exit |
| --- | --- | --- | --- | --- | --- | --- |
| attach_check | sandbox | 200 | 17.5 | 103.7 | 172 | 0 |
| build | sandbox | 666 | 172.5 | 235.7 | 443.3 | 0 |
| compare_sources | sandbox | 200 | 510.3 | 560.9 | 596.6 | 0 |
| diff_capture | sandbox | 800 | 8.1 | 75.7 | 296 | 0 |
| edit_scope | sandbox | 200 | 24.2 | 77.6 | 126.5 | 0 |
| format_check | sandbox | 400 | 9.9 | 49.4 | 256.5 | 0 |
| git_rev_parse | sandbox | 266 | 6.4 | 28.6 | 105.2 | 0 |
| mkdir | sandbox | 539 | 10.2 | 137.9 | 148.8 | 0 |
| native_decisions | sandbox | 200 | 227 | 337.6 | 429.8 | 0 |
| objdiff | sandbox | 600 | 22.1 | 74.2 | 184.7 | 0 |
| other:cp | sandbox | 269 | 7.6 | 51.3 | 125.4 | 0 |
| other:rm | sandbox | 400 | 7.6 | 75.7 | 275.3 | 0 |
| provision_checkout | sandbox | 200 | 37.9 | 217.4 | 218.6 | 0 |
| provision_git | sandbox | 400 | 71.4 | 552.1 | 554.5 | 0 |
| provision_link | sandbox | 400 | 13.3 | 171.7 | 504.4 | 0 |
| provision_verify | sandbox | 200 | 854.7 | 1578.4 | 1709.5 | 0 |
| python_inline | sandbox | 600 | 6.8 | 49.2 | 214.9 | 0 |
| python:check-changed-symbol-order.py | sandbox | 196 | 3.9 | 53.1 | 128.2 | 0 |
| qa_diff | sandbox | 400 | 15.1 | 81.5 | 268.5 | 0 |
| qa_lint | sandbox | 200 | 72.4 | 180.4 | 301.2 | 0 |
| qa_probe | sandbox | 200 | 4.9 | 41 | 216.1 | 0 |
| read_source | sandbox | 396 | 10.4 | 115.3 | 290.9 | 0 |
| shell | sandbox | 992 | 13.6 | 216.3 | 522.9 | 0 |
| source_query | sandbox | 200 | 8.7 | 43.7 | 138.3 | 0 |
| stack_check | sandbox | 600 | 38.2 | 90.4 | 220.9 | 0 |
| steering_decide | sandbox | 270 | 122.5 | 140.6 | 153.1 | 0 |
| steering_edits | sandbox | 270 | 34.1 | 84.2 | 169.8 | 0 |
| steering_mwcc | sandbox | 270 | 502.5 | 522.6 | 553 | 0 |
| steering_placement_probe | sandbox | 200 | 11.1 | 50.8 | 100.6 | 0 |
| steering_reduce | sandbox | 270 | 402.7 | 443.5 | 512.9 | 0 |
| symbol_baseline | sandbox | 196 | 9.4 | 66.5 | 122.1 | 0 |
| test | sandbox | 400 | 13.5 | 195.7 | 524.6 | 0 |
| undefined_symbols | sandbox | 400 | 8.7 | 51.3 | 177.5 | 0 |
| upload_via_exec | sandbox | 673 | 4.3 | 38.2 | 202.6 | 0 |

Required-step coverage: 200 attempt sandboxes; missing {}.

### Host processes spawned (placement evidence)

| role:step | n | p50 ms | p95 ms | cpu ms total | example |
| --- | --- | --- | --- | --- | --- |
| orchestrator:git_show | 70 | 263.5 | 419 | 2911.8 | git show 81248bdac58da1ff74128ba8c3a3798372fa5371:src/Enemy/gatekeeper.cpp |
| orchestrator:git_merge-base | 200 | 325.7 | 791.7 | 8643.8 | git merge-base --is-ancestor 3b83dd4611ff59dcfdb521c11d780716aa25a124 |
| orchestrator:git_rev_parse | 277 | 55.7 | 622.5 | 10946.9 | git rev-parse --verify --quiet |
| orchestrator:worker_child | 200 | 21266.1 | 24374.7 | 238709.8 | bun /Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop/objectives/worker-compiler-loop/scale/worker-child.ts --game sms |
| orchestrator:git_apply | 207 | 43.9 | 88.5 | 8364.2 | git apply --check /var/folders/hd/5sskjbf10bl2v1tx3jsvg_200000gn/T/scale-load-test/s11-fake-200-c/step-200/state/runs/97a3a7e0-712d-485f-8089-938115d99d3b/worker_state/af02b06c-0 |
| orchestrator:git_read-tree | 69 | 49.5 | 110.1 | 3202.1 | git read-tree ff7baf7bc1f69c99be114188dc8ffccfbfc89695 |
| orchestrator:diff_capture | 343 | 44.4 | 96.2 | 14827 | git diff --cached --raw |
| orchestrator:git_cat-file | 69 | 42.9 | 86.3 | 2851.7 | git cat-file -e ff7baf7bc1f69c99be114188dc8ffccfbfc89695:src/Enemy/bossManta.cpp |
| orchestrator:git_add | 69 | 47 | 90.6 | 3082.1 | git add -- src/Enemy/bossManta.cpp |
| orchestrator:git_commit | 69 | 84.5 | 191.1 | 5676.2 | git commit --no-verify -m |

### Daytona API

| op | calls | errors | 429 | p50 ms | p95 ms |
| --- | --- | --- | --- | --- | --- |
| sandbox.create | 200 | 0 | 0 | 89 | 281.9 |
| session.create | 400 | 0 | 0 | 31.9 | 99.2 |
| session.exec | 12673 | 0 | 0 | 18.4 | 501.3 |
| fs.upload | 1270 | 0 | 0 | 13.8 | 1900.9 |
| fs.download | 1200 | 0 | 0 | 10.2 | 1545.4 |
| sandbox.get | 404 | 4 | 0 | 20.8 | 412.4 |
| sandbox.delete | 200 | 0 | 0 | 25.8 | 1679.1 |

Sandboxes: {"created":200,"create_failures":0,"deleted":200,"create_ms":{"n":200,"p50":89,"p95":283,"max":290},"delete_ms":{"n":200,"p50":25.8,"p95":1679.1,"max":2596.6},"by_purpose":{"worker":200},"build_sandboxes":0,"build_sandboxes_per_attempt":0}

Create admission (cumulative in this process): {"concurrency":200,"admitted":201,"queued":184,"quotaRefusals":0,"rateRefusals":0,"timeouts":0,"maxQueued":175}

### Attempts

| kind | attempts | ok | verdicts | p50 s | p95 s |
| --- | --- | --- | --- | --- | --- |
| steering | 52 | 52 | {"steering_located/steering_located":52} | 21.1 | 24 |
| clean_fix | 70 | 70 | {"passed/pass":70} | 20.8 | 23.3 |
| evidence_review | 8 | 8 | {"steering_located/steering_located":8} | 21.4 | 22.6 |
| unverified_repair | 70 | 70 | {"target_regressed/pass":70} | 20.4 | 23.3 |

### Phases

| phase | n | p50 ms | p95 ms | max ms | failed |
| --- | --- | --- | --- | --- | --- |
| provision | 200 | 7169.5 | 9022.7 | 9441.5 | 0 |
| tool:native_decisions | 200 | 310.3 | 649.1 | 848.9 | 0 |
| canned_edit | 200 | 10.3 | 55.3 | 118 | 0 |
| tool:compare_sources | 200 | 530.3 | 652.9 | 822 | 0 |
| agent_turn | 200 | 890.8 | 1226.9 | 1544.4 | 0 |
| child_import | 200 | 13983.4 | 15874.3 | 17122.4 | 0 |

Provision seed kinds (thin = ^baked bundle, full = whole history): {"thin":200}

Host: {"worker_children":179,"worker_peak_rss_mb":{"n":179,"p50":175.7,"p95":203.2,"max":255.1},"worker_cpu_seconds":{"n":179,"p50":1.1,"p95":1.3,"max":1.5},"orchestrator_peak_rss_mb":1549.1,"orchestrator_cpu_seconds":9.3,"peak_total_rss_gb":27.75,"peak_concurrent_worker_children":196}

SQLite: {"waits_over_5ms":341,"busy_errors":0,"wait_ms":{"n":341,"p50":33.6,"p95":289.4,"max":546.2},"by_role":{"orchestrator":{"n":44,"p50":35.5,"p95":253.7,"max":295.7,"total_ms":2898.2},"worker":{"n":297,"p50":33.1,"p95":307,"max":546.2,"total_ms":22807}}}

Integration: {"drains":2,"processed":69,"drain_ms_total":74314.3,"per_item_ms":1077,"items_per_minute":55.7}

### Failures by kind

None.
