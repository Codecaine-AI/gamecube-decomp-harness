# Load test s11b-fake-50-quota30-r4G

- Mode: dry-run (fake Daytona)
- Window: 2026-10-17T18:40:54.862Z to 2026-10-17T18:41:21.184Z
- Cost guard: {"limits":{"maxAlive":60,"maxSandboxMinutes":100000,"allowBuildSandboxes":false},"created":51,"failed_creates":{"allocated":0,"allocated_nothing":2,"unconfirmed":0},"created_by_purpose":{"worker":51},"alive":0,"peak_alive":30,"sandbox_minutes":4.899,"refused_creates":0,"build_creates_refused":0,"tripped":null}
- Kill switch: [{"run_id":"s11b-fake-50-quota30-r4G","found":0,"deleted":0,"errors":[],"remaining":0,"ms":5.162875000001804}]
- Fake Daytona: peak alive 30, created 51, alive at end 0

## Ramp

| concurrency | attempts ok/total | wall s | attempt p50/p95 s | provision p50/p95 ms | API calls | API calls/attempt | 429 | build sandboxes | placement failures | toolpack re-syncs | worker RSS p50/max MB | peak total RSS GB | sqlite waits >5ms (max ms) | integration items/min |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 50 | 50/50 | 25.42 | 5.4/5.7 | 393.9/6705 | 4058 | 81.2 | 2 | 0 | 0 | 0 | 178.1/192.1 | 5.59 | 8 (11.9) | 39.2 |

## Step 50

Jobs {"succeeded":50}; integration outcomes {"applied":13}; kinds {"clean_fix":14,"steering":14,"unverified_repair":14,"evidence_review":8}.

### Step latency and placement

| step | placement | n | p50 ms | p95 ms | max ms | non-zero exit |
| --- | --- | --- | --- | --- | --- | --- |
| attach_check | sandbox | 50 | 3.7 | 14.8 | 30 | 0 |
| build | sandbox | 164 | 161.5 | 166.1 | 171.8 | 0 |
| compare_sources | sandbox | 50 | 502.8 | 506.2 | 517.8 | 0 |
| diff_capture | sandbox | 200 | 2.5 | 6.4 | 18.1 | 0 |
| edit_scope | sandbox | 50 | 21.5 | 22.5 | 26.9 | 0 |
| format_check | sandbox | 100 | 7.3 | 9.9 | 14.4 | 0 |
| git_rev_parse | sandbox | 64 | 2.5 | 8.2 | 13.2 | 0 |
| mkdir | sandbox | 127 | 2.5 | 10.2 | 132 | 0 |
| native_decisions | sandbox | 50 | 202.3 | 210.2 | 214.4 | 0 |
| objdiff | sandbox | 150 | 13.8 | 23.5 | 74 | 0 |
| other:cp | sandbox | 63 | 2.5 | 8.4 | 11 | 0 |
| other:rm | sandbox | 100 | 2.5 | 6.2 | 14.4 | 0 |
| provision_checkout | sandbox | 50 | 13.4 | 133.6 | 142 | 0 |
| provision_git | sandbox | 100 | 11.7 | 17.8 | 23 | 0 |
| provision_link | sandbox | 100 | 2.7 | 8.8 | 70.1 | 0 |
| provision_verify | sandbox | 50 | 7.3 | 36.1 | 36.8 | 0 |
| python_inline | sandbox | 150 | 2.6 | 14.5 | 61.6 | 0 |
| python:check-changed-symbol-order.py | sandbox | 50 | 2.4 | 3.2 | 3.9 | 0 |
| qa_diff | sandbox | 100 | 7.7 | 11.6 | 17.6 | 0 |
| qa_lint | sandbox | 50 | 61.5 | 64.9 | 67 | 0 |
| qa_probe | sandbox | 50 | 2.4 | 6.3 | 7 | 0 |
| read_source | sandbox | 100 | 4.5 | 8.5 | 14 | 0 |
| shell | sandbox | 250 | 2.6 | 10.4 | 92.2 | 0 |
| source_query | sandbox | 50 | 5.4 | 11.1 | 14 | 0 |
| stack_check | sandbox | 150 | 31.5 | 38.7 | 118.9 | 0 |
| steering_decide | sandbox | 64 | 122.1 | 123.1 | 126.9 | 0 |
| steering_edits | sandbox | 64 | 31.5 | 32.6 | 33 | 0 |
| steering_mwcc | sandbox | 64 | 502.3 | 504.3 | 505.6 | 0 |
| steering_placement_probe | sandbox | 50 | 9.4 | 10.2 | 11.1 | 0 |
| steering_reduce | sandbox | 64 | 402.2 | 403.4 | 414.3 | 0 |
| symbol_baseline | sandbox | 50 | 2.5 | 7.1 | 9.8 | 0 |
| test | sandbox | 100 | 3 | 18.9 | 64.2 | 0 |
| undefined_symbols | sandbox | 100 | 2.6 | 10.8 | 13.4 | 0 |
| upload_via_exec | sandbox | 164 | 2.5 | 4.1 | 7.8 | 0 |

Required-step coverage: 50 attempt sandboxes; missing {}.

### Host processes spawned (placement evidence)

| role:step | n | p50 ms | p95 ms | cpu ms total | example |
| --- | --- | --- | --- | --- | --- |
| orchestrator:git_show | 27 | 57.8 | 103.1 | 972.2 | git show 81248bdac58da1ff74128ba8c3a3798372fa5371:src/Enemy/igaiga.cpp |
| orchestrator:worker_child | 50 | 5490.3 | 5772.1 | 57153 | bun /Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop/objectives/worker-compiler-loop/scale/worker-child.ts --game sms |
| orchestrator:git_apply | 39 | 36.3 | 54.2 | 1305.8 | git apply --check /var/folders/hd/5sskjbf10bl2v1tx3jsvg_200000gn/T/scale-load-test/s11b-fake-50-quota30-r4G/step-50/state/runs/7e749497-3183-4259-a857-07802e239955/worker_state/e |
| orchestrator:git_rev_parse | 40 | 34.3 | 82.1 | 1263.3 | git rev-parse HEAD |
| orchestrator:git_read-tree | 13 | 42.8 | 75.1 | 515.3 | git read-tree ff7baf7bc1f69c99be114188dc8ffccfbfc89695 |
| orchestrator:diff_capture | 39 | 37.8 | 69.9 | 1354.9 | git diff --cached --name-status |
| orchestrator:edit_scope | 13 | 862.7 | 1173.2 | 10919.4 | python3 /Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop/toolpacks/gamecube-decomp/_impl/gamecube/tools/edit_scope.py check --repo |
| orchestrator:git_cat-file | 13 | 38.3 | 120.3 | 458.5 | git cat-file -e ff7baf7bc1f69c99be114188dc8ffccfbfc89695:src/Enemy/BathtubKiller.cpp |
| orchestrator:git_add | 13 | 38.8 | 125.1 | 478.5 | git add -- src/Enemy/BathtubKiller.cpp |
| orchestrator:git_commit | 13 | 69.7 | 251.7 | 841.3 | git commit --no-verify -m |

### Daytona API

| op | calls | errors | 429 | p50 ms | p95 ms |
| --- | --- | --- | --- | --- | --- |
| sandbox.create | 52 | 2 | 2 | 26.9 | 61.4 |
| session.create | 100 | 0 | 0 | 2.1 | 10.7 |
| session.exec | 3138 | 0 | 0 | 5.8 | 401.8 |
| sandbox.list | 4 | 0 | 0 | 2.8 | 10.7 |
| fs.upload | 314 | 0 | 0 | 2 | 33.4 |
| fs.download | 300 | 0 | 0 | 2.1 | 12.6 |
| sandbox.get | 100 | 0 | 0 | 2.9 | 26.9 |
| sandbox.delete | 50 | 0 | 0 | 17.4 | 33.7 |

Sandboxes: {"created":50,"create_failures":2,"deleted":50,"create_ms":{"n":50,"p50":27,"p95":61.5,"max":61.9},"delete_ms":{"n":50,"p50":17.5,"p95":33.8,"max":70.2},"by_purpose":{"worker":50},"build_sandboxes":0,"build_sandboxes_per_attempt":0}

Create admission (cumulative in this process): {"concurrency":50,"admitted":53,"queued":36,"quotaRefusals":2,"rateRefusals":0,"timeouts":0,"maxQueued":24}

### Attempts

| kind | attempts | ok | verdicts | p50 s | p95 s |
| --- | --- | --- | --- | --- | --- |
| clean_fix | 14 | 14 | {"passed/pass":14} | 5.3 | 5.8 |
| steering | 14 | 14 | {"steering_located/steering_located":14} | 5.3 | 5.6 |
| evidence_review | 8 | 8 | {"steering_located/steering_located":8} | 5.5 | 5.8 |
| unverified_repair | 14 | 14 | {"target_regressed/pass":14} | 5.5 | 5.7 |

### Phases

| phase | n | p50 ms | p95 ms | max ms | failed |
| --- | --- | --- | --- | --- | --- |
| provision | 50 | 393.9 | 6705 | 6713.2 | 0 |
| tool:native_decisions | 50 | 211 | 244 | 269 | 0 |
| canned_edit | 50 | 1.5 | 6 | 10.5 | 0 |
| tool:compare_sources | 50 | 507.3 | 518.5 | 542.9 | 0 |
| agent_turn | 50 | 725 | 767.2 | 792.9 | 0 |
| child_import | 50 | 2257.2 | 2710.3 | 2746.4 | 0 |

Provision seed kinds (thin = ^baked bundle, full = whole history): {"thin":50}

Native measurements (ok = nested status ok with its schema): {"native_decisions":{"calls":50,"ok":50,"failed":0,"by_reason":{}},"compare_sources":{"calls":50,"ok":50,"failed":0,"by_reason":{}}}

Host: {"worker_children":49,"worker_peak_rss_mb":{"n":49,"p50":178.1,"p95":190.6,"max":192.1},"worker_cpu_seconds":{"n":49,"p50":1.1,"p95":1.2,"max":1.2},"orchestrator_peak_rss_mb":503.1,"orchestrator_cpu_seconds":3.1,"peak_total_rss_gb":5.59,"peak_concurrent_worker_children":30}

SQLite: {"waits_over_5ms":8,"busy_errors":0,"wait_ms":{"n":8,"p50":6.9,"p95":11.9,"max":11.9},"by_role":{"worker":{"n":7,"p50":6.9,"p95":11.9,"max":11.9,"total_ms":52.1},"orchestrator":{"n":1,"p50":6.2,"p95":6.2,"max":6.2,"total_ms":6.2}}}

Integration: {"drains":1,"processed":13,"drain_ms_total":19887,"per_item_ms":1529.8,"items_per_minute":39.2}

### Failures by kind

None.
