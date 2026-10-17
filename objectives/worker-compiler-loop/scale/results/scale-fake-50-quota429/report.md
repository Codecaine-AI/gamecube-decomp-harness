# Load test scale-fake-50-quota429

- Mode: dry-run (fake Daytona)
- Window: 2026-10-17T17:02:48.113Z to 2026-10-17T17:03:21.946Z
- Cost guard: {"limits":{"maxAlive":60,"maxSandboxMinutes":100000,"allowBuildSandboxes":false},"created":31,"created_by_purpose":{"worker":31},"alive":0,"peak_alive":30,"sandbox_minutes":8.787,"refused_creates":0,"build_creates_refused":0,"tripped":null}
- Kill switch: [{"run_id":"scale-fake-50-quota429","found":0,"deleted":0,"errors":[],"remaining":0,"ms":22.992749999997613},{"run_id":"scale-fake-50-quota429","found":0,"deleted":0,"errors":[],"remaining":0,"ms":24.4004999999961}]
- Fake Daytona: peak alive 30, created 31, alive at end 0

## Ramp

| concurrency | attempts ok/total | wall s | attempt p50/p95 s | provision p50/p95 ms | API calls | 429 | build sandboxes | placement failures | toolpack re-syncs | worker RSS p50/max MB | peak total RSS GB | sqlite waits >5ms (max ms) | integration items/min |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 50 | 50/50 | 32.22 | 17.6/21.6 | 1063/5464.8 | 10078 | 0 | 0 | 0 | 0 | 173.7/202.5 | 9.56 | 12 (53.3) | 40.7 |
| 50 | 30/30 | 32.22 | 16.5/16.8 | 714.9/967.3 | 5870 | 20 | 0 | 0 | 0 | 170.2/195.6 | 5.49 | 5 (29.3) | 40.9 |

## Step 50

Jobs {"failed":20,"succeeded":30}; integration outcomes {"applied":10}; kinds {"clean_fix":14,"steering":14,"unverified_repair":14,"evidence_review":8}.

### Step latency and placement

| step | placement | n | p50 ms | p95 ms | max ms | non-zero exit |
| --- | --- | --- | --- | --- | --- | --- |
| attach_check | sandbox | 50 | 15.6 | 67.3 | 92.8 | 0 |
| build | sandbox | 164 | 807.8 | 821.9 | 859.4 | 0 |
| compare_sources | sandbox | 50 | 2507.5 | 2508.6 | 2509.7 | 0 |
| diff_capture | sandbox | 200 | 12.5 | 24.9 | 58.9 | 0 |
| edit_scope | sandbox | 50 | 107.5 | 108.4 | 108.5 | 0 |
| format_check | sandbox | 100 | 37.4 | 37.9 | 38.6 | 0 |
| git_rev_parse | sandbox | 64 | 12.4 | 13.4 | 15.6 | 0 |
| mkdir | sandbox | 127 | 13.2 | 24.8 | 54.5 | 0 |
| native_decisions | sandbox | 50 | 1009.2 | 1020.8 | 1032.1 | 0 |
| objdiff | sandbox | 150 | 67.5 | 79.3 | 94.8 | 0 |
| other:cp | sandbox | 63 | 14 | 29.3 | 42.3 | 0 |
| other:rm | sandbox | 100 | 12.4 | 21.6 | 49.1 | 0 |
| provision_checkout | sandbox | 50 | 67.4 | 70.1 | 70.1 | 0 |
| provision_git | sandbox | 100 | 66.7 | 92.6 | 105.8 | 0 |
| provision_link | sandbox | 100 | 13.5 | 31.8 | 81.1 | 0 |
| provision_verify | sandbox | 50 | 17.5 | 28.5 | 32.5 | 0 |
| python_inline | sandbox | 150 | 12.6 | 19.3 | 28.7 | 0 |
| python:check-changed-symbol-order.py | sandbox | 50 | 12.5 | 13.3 | 13.5 | 0 |
| qa_diff | sandbox | 100 | 37.6 | 41.6 | 51.8 | 0 |
| qa_lint | sandbox | 50 | 307.7 | 308.7 | 314.1 | 0 |
| qa_probe | sandbox | 50 | 12.4 | 13.2 | 13.6 | 0 |
| read_source | sandbox | 100 | 14.5 | 17.6 | 43 | 0 |
| shell | sandbox | 200 | 12.7 | 29.5 | 79.6 | 0 |
| source_query | sandbox | 50 | 27.4 | 27.8 | 28.2 | 0 |
| stack_check | sandbox | 150 | 157.6 | 164.9 | 166.8 | 0 |
| steering_decide | sandbox | 64 | 607.8 | 608.7 | 620.6 | 0 |
| steering_edits | sandbox | 64 | 157.6 | 158.6 | 159.1 | 0 |
| steering_mwcc | sandbox | 64 | 2508.5 | 2512.5 | 2513.6 | 0 |
| steering_placement_probe | sandbox | 50 | 47.5 | 48.3 | 48.6 | 0 |
| steering_reduce | sandbox | 64 | 2008.3 | 2011.9 | 2016.4 | 0 |
| symbol_baseline | sandbox | 50 | 14.6 | 25.8 | 50.9 | 0 |
| test | sandbox | 100 | 13.1 | 37.5 | 115.7 | 0 |
| undefined_symbols | sandbox | 100 | 12.5 | 21.4 | 71 | 0 |
| upload_via_exec | sandbox | 164 | 12.5 | 13.4 | 14.3 | 0 |

Required-step coverage: 50 attempt sandboxes; missing {}.

### Host processes spawned (placement evidence)

| role:step | n | p50 ms | p95 ms | cpu ms total | example |
| --- | --- | --- | --- | --- | --- |
| orchestrator:git_show | 27 | 50.8 | 72.8 | 1044.1 | git show 81248bdac58da1ff74128ba8c3a3798372fa5371:src/Enemy/igaiga.cpp |
| orchestrator:git_merge-base | 64 | 110.2 | 248.9 | 2863.5 | git merge-base --is-ancestor 3b83dd4611ff59dcfdb521c11d780716aa25a124 |
| orchestrator:git_rev_parse | 53 | 36.1 | 143.3 | 1855.9 | git rev-parse --verify --quiet |
| orchestrator:git_update-ref | 4 | 56.6 | 73.2 | 161.8 | git update-ref refs/decomp-orchestrator/sandbox-seeds/ca6f1fad-fd13-4fa8-8ba0-ae7f06da5403 ff7baf7bc1f69c99be114188dc8ffccfbfc89695 |
| orchestrator:git_-c | 1 | 3472.3 | 3472.3 | 806.2 | git -c pack.threads=1 bundle |
| orchestrator:worker_child | 50 | 17659.5 | 21597.1 | 64460.5 | bun /Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop/objectives/worker-compiler-loop/scale/worker-child.ts --game sms |
| orchestrator:git_apply | 39 | 36.9 | 68.8 | 1324.7 | git apply --check /var/folders/hd/5sskjbf10bl2v1tx3jsvg_200000gn/T/scale-load-test/scale-fake-50-quota429/step-50/state/runs/37a357aa-07c7-4c0b-a005-3c0a2c339611/worker_state/07c |
| orchestrator:git_read-tree | 13 | 44.5 | 88.7 | 518.5 | git read-tree ff7baf7bc1f69c99be114188dc8ffccfbfc89695 |
| orchestrator:diff_capture | 39 | 39.5 | 42 | 1383.8 | git diff --cached --name-status |
| orchestrator:edit_scope | 13 | 902.9 | 1243.8 | 11171 | python3 /Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop/toolpacks/gamecube-decomp/_impl/gamecube/tools/edit_scope.py check --repo |
| orchestrator:git_cat-file | 13 | 39.6 | 53.6 | 467.8 | git cat-file -e ff7baf7bc1f69c99be114188dc8ffccfbfc89695:src/Enemy/chuuhana.cpp |
| orchestrator:git_add | 13 | 41.5 | 44.3 | 488.2 | git add -- src/Enemy/chuuhana.cpp |
| orchestrator:git_commit | 13 | 72.2 | 80 | 874.4 | git commit --no-verify -m |

### Daytona API

| op | calls | errors | 429 | p50 ms | p95 ms |
| --- | --- | --- | --- | --- | --- |
| sandbox.create | 50 | 0 | 0 | 227.1 | 317.4 |
| fs.upload | 314 | 0 | 0 | 8.5 | 127.3 |
| session.create | 3088 | 0 | 0 | 3.5 | 17.8 |
| session.exec | 3088 | 0 | 0 | 18.6 | 2007.9 |
| session.delete | 3088 | 0 | 0 | 3.5 | 12.2 |
| fs.download | 300 | 0 | 0 | 9.6 | 34.4 |
| sandbox.get | 100 | 0 | 0 | 6 | 90.9 |
| sandbox.delete | 50 | 0 | 0 | 81.3 | 88.7 |

Sandboxes: {"created":50,"create_failures":0,"deleted":50,"create_ms":{"n":50,"p50":227.3,"p95":317.6,"max":330.7},"delete_ms":{"n":50,"p50":81.4,"p95":88.7,"max":88.8},"by_purpose":{"worker":50},"build_sandboxes":0,"build_sandboxes_per_attempt":0}

### Attempts

| kind | attempts | ok | verdicts | p50 s | p95 s |
| --- | --- | --- | --- | --- | --- |
| evidence_review | 8 | 8 | {"steering_located/steering_located":8} | 17.3 | 17.7 |
| clean_fix | 14 | 14 | {"passed/pass":14} | 17.5 | 17.8 |
| steering | 14 | 14 | {"steering_located/steering_located":14} | 17.3 | 17.7 |
| unverified_repair | 14 | 14 | {"target_regressed/pass":14} | 21.5 | 21.6 |

### Phases

| phase | n | p50 ms | p95 ms | max ms | failed |
| --- | --- | --- | --- | --- | --- |
| provision | 50 | 1063 | 5464.8 | 5491 | 0 |
| tool:native_decisions | 50 | 1066.5 | 1240.9 | 1308.3 | 0 |
| canned_edit | 50 | 8.6 | 11.9 | 55.1 | 0 |
| tool:compare_sources | 50 | 2536.3 | 2541.3 | 2611.2 | 0 |
| agent_turn | 50 | 3614.4 | 3826.7 | 3853.9 | 0 |
| child_import | 50 | 2932.1 | 3351.7 | 3424.8 | 0 |

Provision seed kinds (thin = ^baked bundle, full = whole history): {"thin":36,"full":14}

Host: {"worker_children":44,"worker_peak_rss_mb":{"n":44,"p50":173.7,"p95":188.4,"max":202.5},"worker_cpu_seconds":{"n":44,"p50":1.3,"p95":1.4,"max":1.4},"orchestrator_peak_rss_mb":1173.7,"orchestrator_cpu_seconds":3.6,"peak_total_rss_gb":9.56,"peak_concurrent_worker_children":50}

SQLite: {"waits_over_5ms":12,"busy_errors":0,"wait_ms":{"n":12,"p50":10.7,"p95":53.3,"max":53.3},"by_role":{"orchestrator":{"n":2,"p50":5,"p95":9.1,"max":9.1,"total_ms":14.1},"worker":{"n":10,"p50":12.3,"p95":53.3,"max":53.3,"total_ms":182.6}}}

Integration: {"drains":1,"processed":13,"drain_ms_total":19168.6,"per_item_ms":1474.5,"items_per_minute":40.7}

### Failures by kind

None.

## Step 50

Jobs {"failed":20,"succeeded":30}; integration outcomes {"applied":10}; kinds {"clean_fix":14,"steering":14,"unverified_repair":14,"evidence_review":8}.

### Step latency and placement

| step | placement | n | p50 ms | p95 ms | max ms | non-zero exit |
| --- | --- | --- | --- | --- | --- | --- |
| attach_check | sandbox | 30 | 17.6 | 41 | 88.6 | 0 |
| build | sandbox | 90 | 808 | 811.6 | 822.4 | 0 |
| compare_sources | sandbox | 30 | 2507.5 | 2508.6 | 2509.7 | 0 |
| diff_capture | sandbox | 120 | 12.6 | 17.1 | 43.3 | 0 |
| edit_scope | sandbox | 30 | 107.7 | 109.5 | 109.5 | 0 |
| format_check | sandbox | 60 | 37.6 | 38.9 | 44.6 | 0 |
| git_rev_parse | sandbox | 30 | 12.5 | 14.2 | 14.2 | 0 |
| mkdir | sandbox | 70 | 13.1 | 14.7 | 16.5 | 0 |
| native_decisions | sandbox | 30 | 1008.3 | 1014.3 | 1023.6 | 0 |
| objdiff | sandbox | 90 | 67.1 | 78.8 | 81.6 | 0 |
| other:cp | sandbox | 40 | 12.9 | 14.2 | 15.3 | 0 |
| other:rm | sandbox | 60 | 12.7 | 14.7 | 19.2 | 0 |
| provision_checkout | sandbox | 30 | 66.6 | 67.2 | 67.3 | 0 |
| provision_git | sandbox | 60 | 57.7 | 62.4 | 64.7 | 0 |
| provision_link | sandbox | 60 | 14.6 | 24.5 | 40 | 0 |
| provision_verify | sandbox | 30 | 13.4 | 22.5 | 22.6 | 0 |
| python_inline | sandbox | 90 | 12.8 | 14.4 | 20.7 | 0 |
| python:check-changed-symbol-order.py | sandbox | 30 | 12.7 | 13.2 | 13.3 | 0 |
| qa_diff | sandbox | 60 | 37.7 | 39.3 | 43.4 | 0 |
| qa_lint | sandbox | 30 | 307.8 | 309.5 | 309.5 | 0 |
| qa_probe | sandbox | 30 | 12.5 | 13.3 | 13.4 | 0 |
| read_source | sandbox | 60 | 14.8 | 19.5 | 27.5 | 0 |
| shell | sandbox | 120 | 13 | 19 | 37.7 | 0 |
| source_query | sandbox | 30 | 27.5 | 28.2 | 28.6 | 0 |
| stack_check | sandbox | 90 | 157.6 | 158.5 | 168.3 | 0 |
| steering_decide | sandbox | 30 | 607.9 | 610.3 | 618.5 | 0 |
| steering_edits | sandbox | 30 | 157.8 | 159.6 | 159.7 | 0 |
| steering_mwcc | sandbox | 30 | 2508.5 | 2511.4 | 2511.8 | 0 |
| steering_placement_probe | sandbox | 30 | 47.8 | 49.7 | 49.8 | 0 |
| steering_reduce | sandbox | 30 | 2009.5 | 2013.1 | 2013.2 | 0 |
| symbol_baseline | sandbox | 30 | 12.6 | 15.3 | 18.7 | 0 |
| test | sandbox | 60 | 12.8 | 25 | 32.2 | 0 |
| undefined_symbols | sandbox | 60 | 12.9 | 19.3 | 21.1 | 0 |
| upload_via_exec | sandbox | 90 | 12.6 | 14.3 | 20.2 | 0 |

Required-step coverage: 30 attempt sandboxes; missing {}.

### Host processes spawned (placement evidence)

| role:step | n | p50 ms | p95 ms | cpu ms total | example |
| --- | --- | --- | --- | --- | --- |
| orchestrator:git_show | 24 | 41.9 | 68 | 921.7 | git show 81248bdac58da1ff74128ba8c3a3798372fa5371:src/Enemy/igaiga.cpp |
| orchestrator:git_merge-base | 30 | 95.4 | 125.3 | 1271.7 | git merge-base --is-ancestor 3b83dd4611ff59dcfdb521c11d780716aa25a124 |
| orchestrator:worker_child | 30 | 16609.9 | 16849.4 | 37813.5 | bun /Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop/objectives/worker-compiler-loop/scale/worker-child.ts --game sms |
| orchestrator:git_apply | 30 | 36.5 | 56.1 | 1011.1 | git apply --check /var/folders/hd/5sskjbf10bl2v1tx3jsvg_200000gn/T/scale-load-test/scale-fake-50-quota429/step-50/state/runs/6d99a0c3-3091-4623-812b-4ac0d1abf606/worker_state/053 |
| orchestrator:git_rev_parse | 30 | 35 | 54.4 | 977.1 | git rev-parse HEAD |
| orchestrator:git_read-tree | 10 | 41.3 | 50.3 | 388.8 | git read-tree ff7baf7bc1f69c99be114188dc8ffccfbfc89695 |
| orchestrator:diff_capture | 30 | 38.3 | 49.8 | 1061.6 | git diff --cached --name-status |
| orchestrator:edit_scope | 10 | 888 | 1205.2 | 8536.6 | python3 /Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop/toolpacks/gamecube-decomp/_impl/gamecube/tools/edit_scope.py check --repo |
| orchestrator:git_cat-file | 10 | 38.9 | 48.1 | 355.4 | git cat-file -e ff7baf7bc1f69c99be114188dc8ffccfbfc89695:src/Enemy/bossManta.cpp |
| orchestrator:git_add | 10 | 40.1 | 43.1 | 369.5 | git add -- src/Enemy/bossManta.cpp |
| orchestrator:git_commit | 10 | 70.9 | 107.4 | 679.8 | git commit --no-verify -m |

### Daytona API

| op | calls | errors | 429 | p50 ms | p95 ms |
| --- | --- | --- | --- | --- | --- |
| sandbox.create | 50 | 20 | 20 | 130.4 | 231.8 |
| fs.upload | 180 | 0 | 0 | 9.5 | 49.7 |
| session.create | 1790 | 0 | 0 | 3.6 | 9.5 |
| session.exec | 1790 | 0 | 0 | 16 | 2007.4 |
| session.delete | 1790 | 0 | 0 | 3.7 | 7.8 |
| fs.download | 180 | 0 | 0 | 9.9 | 25.6 |
| sandbox.get | 60 | 0 | 0 | 6.7 | 27.1 |
| sandbox.delete | 30 | 0 | 0 | 82.6 | 83.8 |

Sandboxes: {"created":30,"create_failures":20,"deleted":30,"create_ms":{"n":30,"p50":158.2,"p95":236.5,"max":242.7},"delete_ms":{"n":30,"p50":82.7,"p95":83.9,"max":83.9},"by_purpose":{"worker":30},"build_sandboxes":0,"build_sandboxes_per_attempt":0}

### Attempts

| kind | attempts | ok | verdicts | p50 s | p95 s |
| --- | --- | --- | --- | --- | --- |
| evidence_review | 8 | 8 | {"steering_located/steering_located":8} | 16.6 | 16.8 |
| steering | 11 | 11 | {"steering_located/steering_located":11} | 16.4 | 16.6 |
| clean_fix | 11 | 11 | {"passed/pass":11} | 16.7 | 16.8 |

### Phases

| phase | n | p50 ms | p95 ms | max ms | failed |
| --- | --- | --- | --- | --- | --- |
| provision | 50 | 714.9 | 967.3 | 967.6 | 20 |
| tool:native_decisions | 30 | 1061.6 | 1136.1 | 1193.7 | 0 |
| canned_edit | 30 | 8.7 | 10.6 | 10.6 | 0 |
| tool:compare_sources | 30 | 2536.8 | 2540.9 | 2542.2 | 0 |
| agent_turn | 30 | 3609.3 | 3682.9 | 3742.3 | 0 |
| child_import | 30 | 2638.3 | 2881.3 | 2993.3 | 0 |

Provision seed kinds (thin = ^baked bundle, full = whole history): {"thin":30}

Host: {"worker_children":29,"worker_peak_rss_mb":{"n":29,"p50":170.2,"p95":190.9,"max":195.6},"worker_cpu_seconds":{"n":29,"p50":1.3,"p95":1.4,"max":1.4},"orchestrator_peak_rss_mb":541.7,"orchestrator_cpu_seconds":2.7,"peak_total_rss_gb":5.49,"peak_concurrent_worker_children":30}

SQLite: {"waits_over_5ms":5,"busy_errors":0,"wait_ms":{"n":5,"p50":16.2,"p95":29.3,"max":29.3},"by_role":{"worker":{"n":5,"p50":16.2,"p95":29.3,"max":29.3,"total_ms":89.4}}}

Integration: {"drains":1,"processed":10,"drain_ms_total":14657.5,"per_item_ms":1465.8,"items_per_minute":40.9}

### Failures by kind

| kind | count | examples |
| --- | --- | --- |
| provision | 20 | Request failed with status code 429: Total CPU quota exceeded: 30 sandboxes |
| worker_job | 20 | Sandbox provisioning failed before worker execution: Request failed with status code 429: Total CPU quota exceeded: 30 sandboxes |
