# Load test s11b-fake-200-r1G

- Mode: dry-run (fake Daytona)
- Window: 2026-10-17T18:10:53.999Z to 2026-10-17T18:13:16.031Z
- Cost guard: {"limits":{"maxAlive":210,"maxSandboxMinutes":100000,"allowBuildSandboxes":false},"created":201,"created_by_purpose":{"worker":201},"alive":0,"peak_alive":200,"sandbox_minutes":90.5,"refused_creates":0,"build_creates_refused":0,"tripped":null}
- Kill switch: [{"run_id":"s11b-fake-200-r1G","found":0,"deleted":0,"errors":[],"remaining":0,"ms":5.4542079999810085}]
- Fake Daytona: peak alive 200, created 201, alive at end 0

## Ramp

| concurrency | attempts ok/total | wall s | attempt p50/p95 s | provision p50/p95 ms | API calls | API calls/attempt | 429 | build sandboxes | placement failures | toolpack re-syncs | worker RSS p50/max MB | peak total RSS GB | sqlite waits >5ms (max ms) | integration items/min |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 200 | 200/200 | 140.71 | 21.3/23.5 | 6249.5/9930.7 | 16353 | 81.8 | 0 | 0 | 0 | 0 | 177.5/258.3 | 26.49 | 352 (640.4) | 31.4 |

## Step 200

Jobs {"succeeded":200}; integration outcomes {"applied":69}; kinds {"clean_fix":70,"steering":52,"unverified_repair":70,"evidence_review":8}.

### Step latency and placement

| step | placement | n | p50 ms | p95 ms | max ms | non-zero exit |
| --- | --- | --- | --- | --- | --- | --- |
| attach_check | sandbox | 200 | 17 | 120.1 | 198.7 | 0 |
| build | sandbox | 666 | 175.7 | 252.6 | 572.2 | 0 |
| compare_sources | sandbox | 200 | 511.1 | 556.1 | 637.3 | 0 |
| diff_capture | sandbox | 800 | 9.6 | 77.6 | 369.1 | 0 |
| edit_scope | sandbox | 200 | 25.2 | 73 | 158.9 | 0 |
| format_check | sandbox | 400 | 11.1 | 54.4 | 140.9 | 0 |
| git_rev_parse | sandbox | 266 | 6.6 | 53.2 | 172.7 | 0 |
| mkdir | sandbox | 539 | 5.8 | 43.8 | 153.2 | 0 |
| native_decisions | sandbox | 200 | 233.1 | 400.2 | 555.4 | 0 |
| objdiff | sandbox | 600 | 24.3 | 87 | 254.8 | 0 |
| other:cp | sandbox | 269 | 8.9 | 58.6 | 207.4 | 0 |
| other:rm | sandbox | 400 | 8.5 | 71.9 | 269.5 | 0 |
| provision_checkout | sandbox | 200 | 14.4 | 17.5 | 19.2 | 0 |
| provision_git | sandbox | 400 | 12.5 | 15.8 | 27 | 0 |
| provision_link | sandbox | 400 | 5.8 | 79.3 | 276.2 | 0 |
| provision_verify | sandbox | 200 | 204.7 | 1450.2 | 1622.9 | 0 |
| python_inline | sandbox | 600 | 8 | 58.6 | 257.2 | 0 |
| python:check-changed-symbol-order.py | sandbox | 196 | 5.6 | 34.6 | 135.5 | 0 |
| qa_diff | sandbox | 400 | 16.1 | 114.4 | 609.7 | 0 |
| qa_lint | sandbox | 200 | 72.5 | 192.4 | 301.7 | 0 |
| qa_probe | sandbox | 200 | 7.1 | 49.6 | 95.4 | 0 |
| read_source | sandbox | 396 | 13.8 | 127.7 | 291.9 | 0 |
| shell | sandbox | 992 | 7.2 | 67.9 | 416.3 | 0 |
| source_query | sandbox | 200 | 9.2 | 53.6 | 148.5 | 0 |
| stack_check | sandbox | 600 | 39.7 | 93 | 233 | 0 |
| steering_decide | sandbox | 270 | 122.4 | 150.4 | 487.8 | 0 |
| steering_edits | sandbox | 270 | 32.9 | 85.5 | 621.9 | 0 |
| steering_mwcc | sandbox | 270 | 502.3 | 520.3 | 567.1 | 0 |
| steering_placement_probe | sandbox | 200 | 13.7 | 76.9 | 202 | 0 |
| steering_reduce | sandbox | 270 | 403.1 | 432.3 | 559.8 | 0 |
| symbol_baseline | sandbox | 196 | 16 | 96.4 | 216.5 | 0 |
| test | sandbox | 400 | 13 | 201.7 | 712.6 | 0 |
| undefined_symbols | sandbox | 400 | 10.3 | 64 | 217.3 | 0 |
| upload_via_exec | sandbox | 673 | 4.4 | 46.1 | 201.1 | 0 |

Required-step coverage: 200 attempt sandboxes; missing {}.

### Host processes spawned (placement evidence)

| role:step | n | p50 ms | p95 ms | cpu ms total | example |
| --- | --- | --- | --- | --- | --- |
| orchestrator:git_show | 139 | 151 | 423.5 | 5496.8 | git show 81248bdac58da1ff74128ba8c3a3798372fa5371:src/Enemy/igaiga.cpp |
| orchestrator:git_rev_parse | 208 | 37.8 | 59 | 7141.4 | git rev-parse --verify --quiet |
| orchestrator:worker_child | 200 | 21726.7 | 23728.1 | 241404.8 | bun /Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop/objectives/worker-compiler-loop/scale/worker-child.ts --game sms |
| orchestrator:git_apply | 207 | 40.4 | 65.7 | 7613.5 | git apply --check /var/folders/hd/5sskjbf10bl2v1tx3jsvg_200000gn/T/scale-load-test/s11b-fake-200-r1G/step-200/state/runs/192c3994-8d00-49c5-8600-a91f48ed972c/worker_state/3492376 |
| orchestrator:git_read-tree | 69 | 45.3 | 80.9 | 2900 | git read-tree ff7baf7bc1f69c99be114188dc8ffccfbfc89695 |
| orchestrator:diff_capture | 207 | 41.4 | 66.4 | 7893.4 | git diff --cached --name-status |
| orchestrator:edit_scope | 69 | 872.8 | 2299.4 | 55388.6 | python3 /Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop/toolpacks/gamecube-decomp/_impl/gamecube/tools/edit_scope.py check --repo |
| orchestrator:git_cat-file | 69 | 41.5 | 69.3 | 2662.5 | git cat-file -e ff7baf7bc1f69c99be114188dc8ffccfbfc89695:src/Enemy/chuuhana.cpp |
| orchestrator:git_add | 69 | 43.3 | 75.4 | 2757.2 | git add -- src/Enemy/chuuhana.cpp |
| orchestrator:git_commit | 69 | 80.6 | 152.3 | 5092.5 | git commit --no-verify -m |

### Daytona API

| op | calls | errors | 429 | p50 ms | p95 ms |
| --- | --- | --- | --- | --- | --- |
| sandbox.create | 200 | 0 | 0 | 28.2 | 118.1 |
| session.create | 400 | 0 | 0 | 5.5 | 63.8 |
| session.exec | 12673 | 0 | 0 | 15.5 | 410.1 |
| fs.upload | 1270 | 0 | 0 | 6.4 | 1428.5 |
| fs.download | 1200 | 0 | 0 | 13.6 | 723.1 |
| sandbox.get | 405 | 0 | 0 | 16.7 | 1147.7 |
| sandbox.delete | 205 | 5 | 0 | 20.7 | 1159.3 |

Sandboxes: {"created":200,"create_failures":0,"deleted":200,"create_ms":{"n":200,"p50":28.2,"p95":118.1,"max":120.3},"delete_ms":{"n":200,"p50":20.7,"p95":1159.4,"max":1814.2},"by_purpose":{"worker":200},"build_sandboxes":0,"build_sandboxes_per_attempt":0}

Create admission (cumulative in this process): {"concurrency":200,"admitted":201,"queued":184,"quotaRefusals":0,"rateRefusals":0,"timeouts":0,"maxQueued":171}

### Attempts

| kind | attempts | ok | verdicts | p50 s | p95 s |
| --- | --- | --- | --- | --- | --- |
| clean_fix | 70 | 70 | {"passed/pass":70} | 21.7 | 23.2 |
| steering | 52 | 52 | {"steering_located/steering_located":52} | 22.3 | 24.3 |
| evidence_review | 8 | 8 | {"steering_located/steering_located":8} | 16.1 | 18.6 |
| unverified_repair | 70 | 70 | {"target_regressed/pass":70} | 20.9 | 21.8 |

### Phases

| phase | n | p50 ms | p95 ms | max ms | failed |
| --- | --- | --- | --- | --- | --- |
| provision | 200 | 6249.5 | 9930.7 | 11644 | 0 |
| tool:native_decisions | 200 | 310.9 | 702.3 | 1766.8 | 0 |
| canned_edit | 200 | 10.6 | 83.9 | 272 | 0 |
| tool:compare_sources | 200 | 535.1 | 670 | 956.7 | 0 |
| agent_turn | 200 | 915.2 | 1330.4 | 2388.5 | 0 |
| child_import | 200 | 14028.9 | 16352.2 | 17515.5 | 0 |

Provision seed kinds (thin = ^baked bundle, full = whole history): {"thin":200}

Host: {"worker_children":140,"worker_peak_rss_mb":{"n":140,"p50":177.5,"p95":200.2,"max":258.3},"worker_cpu_seconds":{"n":140,"p50":1.2,"p95":1.3,"max":1.5},"orchestrator_peak_rss_mb":1289.8,"orchestrator_cpu_seconds":9.6,"peak_total_rss_gb":26.49,"peak_concurrent_worker_children":178}

SQLite: {"waits_over_5ms":352,"busy_errors":0,"wait_ms":{"n":352,"p50":40.6,"p95":363.4,"max":640.4},"by_role":{"orchestrator":{"n":31,"p50":14,"p95":140.4,"max":640.4,"total_ms":1613},"worker":{"n":321,"p50":45.1,"p95":363.4,"max":604.2,"total_ms":33161.9}}}

Integration: {"drains":2,"processed":69,"drain_ms_total":131858.9,"per_item_ms":1911,"items_per_minute":31.4}

### Failures by kind

None.
