# Load test scale-fake-200-a

- Mode: dry-run (fake Daytona)
- Window: 2026-10-17T16:46:17.041Z to 2026-10-17T16:55:29.533Z
- Cost guard: {"limits":{"maxAlive":210,"maxSandboxMinutes":100000,"allowBuildSandboxes":false},"created":361,"created_by_purpose":{"worker":361},"alive":0,"peak_alive":200,"sandbox_minutes":546.383,"refused_creates":0,"build_creates_refused":0,"tripped":null}
- Kill switch: [{"run_id":"scale-fake-200-a","found":0,"deleted":0,"errors":[],"remaining":0,"ms":23.95908300008159}]
- Fake Daytona: peak alive 200, created 361, alive at end 0

## Ramp

| concurrency | attempts ok/total | wall s | attempt p50/p95 s | provision p50/p95 ms | API calls | 429 | build sandboxes | placement failures | toolpack re-syncs | worker RSS p50/max MB | peak total RSS GB | sqlite waits >5ms (max ms) | integration items/min |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | 10/10 | 22.78 | 14.8/20.2 | 826.6/2013.8 | 1902 | 0 | 0 | 0 | 0 | 197.3/211.7 | 2.2 | 0 (0) | 35.6 |
| 50 | 50/50 | 48.74 | 17.6/23.3 | 15201.7/17090.3 | 10022 | 0 | 0 | 0 | 50 | 188/215.5 | 10.1 | 0 (0) | 40 |
| 100 | 100/100 | 128.84 | 21.5/26.5 | 31829.7/33802.9 | 20094 | 0 | 0 | 0 | 100 | 184/216.3 | 17.91 | 4 (14.2) | 20.8 |
| 200 | 200/200 | 350.29 | 27.4/35.5 | 99344.5/110557.4 | 41405 | 0 | 0 | 0 | 200 | 179.6/222 | 34.6 | 121 (437.4) | 16.8 |

## Step 10

Jobs {"succeeded":10}; integration outcomes {"applied":2}; kinds {"clean_fix":3,"steering":3,"unverified_repair":2,"evidence_review":2}.

### Step latency and placement

| step | placement | n | p50 ms | p95 ms | max ms | non-zero exit |
| --- | --- | --- | --- | --- | --- | --- |
| attach_check | sandbox | 10 | 13.5 | 18.9 | 18.9 | 0 |
| build | sandbox | 32 | 809.6 | 818.4 | 823.5 | 0 |
| compare_sources | sandbox | 10 | 2508.3 | 2512.1 | 2512.1 | 0 |
| diff_capture | sandbox | 40 | 12.7 | 14.3 | 14.7 | 0 |
| edit_scope | sandbox | 10 | 109.3 | 110.2 | 110.2 | 0 |
| format_check | sandbox | 20 | 37.3 | 43.5 | 45.6 | 0 |
| git_rev_parse | sandbox | 12 | 13.2 | 20.4 | 20.4 | 0 |
| mkdir | sandbox | 24 | 13.7 | 16.2 | 16.4 | 0 |
| native_decisions | sandbox | 10 | 1008.1 | 1010.6 | 1010.6 | 0 |
| objdiff | sandbox | 30 | 67.5 | 70.6 | 77.7 | 0 |
| other:cp | sandbox | 12 | 12.5 | 14.4 | 14.4 | 0 |
| other:rm | sandbox | 20 | 12.5 | 13.6 | 14.9 | 0 |
| provision_checkout | sandbox | 10 | 67.4 | 68.4 | 68.4 | 0 |
| provision_git | sandbox | 20 | 62.9 | 130.5 | 156.2 | 0 |
| provision_link | sandbox | 20 | 13.3 | 16.3 | 20.8 | 0 |
| provision_verify | sandbox | 10 | 12.6 | 15.9 | 15.9 | 0 |
| python:check-changed-symbol-order.py | sandbox | 10 | 13.2 | 14.9 | 14.9 | 0 |
| qa_diff | sandbox | 20 | 38.1 | 40.2 | 41 | 0 |
| qa_lint | sandbox | 10 | 307.6 | 308.7 | 308.7 | 0 |
| qa_probe | sandbox | 10 | 12.5 | 16.5 | 16.5 | 0 |
| read_source | sandbox | 30 | 15.2 | 28.2 | 28.3 | 0 |
| shell | sandbox | 40 | 12.9 | 14.5 | 21.3 | 0 |
| source_query | sandbox | 20 | 27.4 | 28.3 | 28.7 | 0 |
| stack_check | sandbox | 30 | 157.9 | 166.2 | 167.9 | 0 |
| steering_decide | sandbox | 12 | 607.8 | 609.6 | 609.6 | 0 |
| steering_edits | sandbox | 12 | 158.4 | 159.9 | 159.9 | 0 |
| steering_mwcc | sandbox | 12 | 2509.3 | 2511.2 | 2511.2 | 0 |
| steering_placement_probe | sandbox | 10 | 47.9 | 54.5 | 54.5 | 0 |
| steering_reduce | sandbox | 12 | 2009.6 | 2013.5 | 2013.5 | 0 |
| symbol_baseline | sandbox | 10 | 12.7 | 23 | 23 | 0 |
| test | sandbox | 20 | 12.6 | 21.7 | 24.3 | 0 |
| undefined_symbols | sandbox | 20 | 12.4 | 13.3 | 13.3 | 0 |
| upload_via_exec | sandbox | 12 | 14.2 | 16.8 | 16.8 | 0 |

Required-step coverage: 10 attempt sandboxes; missing {}.

### Host processes spawned (placement evidence)

| role:step | n | p50 ms | p95 ms | cpu ms total | example |
| --- | --- | --- | --- | --- | --- |
| orchestrator:git_show | 4 | 37.1 | 38.7 | 137.5 | git show 81248bdac58da1ff74128ba8c3a3798372fa5371:src/Enemy/igaiga.cpp |
| orchestrator:git_merge-base | 12 | 47.7 | 92.5 | 486.8 | git merge-base --is-ancestor 3b83dd4611ff59dcfdb521c11d780716aa25a124 |
| orchestrator:git_rev_parse | 8 | 35.4 | 65.4 | 274.8 | git rev-parse --verify --quiet |
| orchestrator:git_update-ref | 24 | 52.6 | 82 | 935 | git update-ref refs/decomp-orchestrator/sandbox-seeds/ddd1808e-3445-47a6-b0ee-ff04cb02ec25 ff7baf7bc1f69c99be114188dc8ffccfbfc89695 |
| orchestrator:provision_git | 10 | 123 | 821.7 | 2621.1 | git bundle create /var/folders/hd/5sskjbf10bl2v1tx3jsvg_200000gn/T/melee-sandbox-bundle-arkIsx/claim.bundle |
| orchestrator:worker_child | 10 | 14791.1 | 20248.5 | 13880.7 | bun /Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop/objectives/worker-compiler-loop/scale/worker-child.ts --game sms |
| orchestrator:git_apply | 6 | 36.8 | 42.9 | 208.3 | git apply --check /var/folders/hd/5sskjbf10bl2v1tx3jsvg_200000gn/T/scale-load-test/scale-fake-200-a/step-10/state/runs/73d9bb36-d305-4af8-9812-0ab0666d80f0/worker_state/6927ff32- |
| orchestrator:git_read-tree | 2 | 40.7 | 44.7 | 79.7 | git read-tree ff7baf7bc1f69c99be114188dc8ffccfbfc89695 |
| orchestrator:diff_capture | 6 | 39.1 | 62.6 | 218.9 | git diff --cached --name-status |
| orchestrator:edit_scope | 2 | 910.2 | 1258.5 | 2084.6 | python3 /Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop/toolpacks/gamecube-decomp/_impl/gamecube/tools/edit_scope.py check --repo |
| orchestrator:git_cat-file | 2 | 36.9 | 38 | 68.4 | git cat-file -e ff7baf7bc1f69c99be114188dc8ffccfbfc89695:src/Enemy/BathtubKiller.cpp |
| orchestrator:git_add | 2 | 40.6 | 41 | 75.7 | git add -- src/Enemy/BathtubKiller.cpp |
| orchestrator:git_commit | 2 | 68.1 | 69.2 | 131.5 | git commit --no-verify -m |

### Daytona API

| op | calls | errors | 429 | p50 ms | p95 ms |
| --- | --- | --- | --- | --- | --- |
| sandbox.create | 10 | 0 | 0 | 125.5 | 136.7 |
| fs.upload | 62 | 0 | 0 | 8.9 | 21.9 |
| session.create | 580 | 0 | 0 | 3.5 | 4.7 |
| session.exec | 580 | 0 | 0 | 20.8 | 2009.5 |
| session.delete | 580 | 0 | 0 | 3.5 | 5 |
| fs.download | 60 | 0 | 0 | 9 | 17.7 |
| sandbox.get | 20 | 0 | 0 | 5.8 | 11.1 |
| sandbox.delete | 10 | 0 | 0 | 81.3 | 84.4 |

Sandboxes: {"created":10,"create_failures":0,"deleted":10,"create_ms":{"n":10,"p50":125.5,"p95":136.8,"max":136.8},"delete_ms":{"n":10,"p50":81.3,"p95":84.5,"max":84.5},"by_purpose":{"worker":10},"build_sandboxes":0,"build_sandboxes_per_attempt":0}

### Attempts

| kind | attempts | ok | verdicts | p50 s | p95 s |
| --- | --- | --- | --- | --- | --- |
| steering | 3 | 3 | {"steering_located/steering_located":3} | 14.7 | 14.7 |
| clean_fix | 3 | 3 | {"passed/pass":3} | 14.8 | 14.8 |
| evidence_review | 2 | 2 | {"steering_located/steering_located":2} | 14.8 | 14.8 |
| unverified_repair | 2 | 2 | {"target_regressed/pass":2} | 20.2 | 20.2 |

### Phases

| phase | n | p50 ms | p95 ms | max ms | failed |
| --- | --- | --- | --- | --- | --- |
| provision | 10 | 826.6 | 2013.8 | 2013.8 | 0 |
| tool:native_decisions | 10 | 1040.4 | 1083.5 | 1083.5 | 0 |
| canned_edit | 10 | 8.5 | 9.4 | 9.4 | 0 |
| tool:compare_sources | 10 | 2537.6 | 2544.8 | 2544.8 | 0 |
| agent_turn | 10 | 3588.6 | 3630 | 3630 | 0 |
| child_import | 10 | 1091.7 | 1150.3 | 1150.3 | 0 |

Provision seed kinds (thin = ^baked bundle, full = whole history): {"thin":8,"full":2}

Host: {"worker_children":9,"worker_peak_rss_mb":{"n":9,"p50":197.3,"p95":211.7,"max":211.7},"worker_cpu_seconds":{"n":9,"p50":1.4,"p95":1.5,"max":1.5},"orchestrator_peak_rss_mb":323.4,"orchestrator_cpu_seconds":4.5,"peak_total_rss_gb":2.2,"peak_concurrent_worker_children":10}

SQLite: {"waits_over_5ms":0,"busy_errors":0,"wait_ms":{"n":0,"p50":null,"p95":null,"max":null},"by_role":{}}

Integration: {"drains":1,"processed":2,"drain_ms_total":3369.5,"per_item_ms":1684.8,"items_per_minute":35.6}

### Failures by kind

None.

## Step 50

Jobs {"succeeded":50}; integration outcomes {"applied":13}; kinds {"clean_fix":14,"steering":14,"unverified_repair":14,"evidence_review":8}.

### Step latency and placement

| step | placement | n | p50 ms | p95 ms | max ms | non-zero exit |
| --- | --- | --- | --- | --- | --- | --- |
| attach_check | sandbox | 50 | 17.5 | 105.5 | 128 | 0 |
| build | sandbox | 164 | 808.2 | 816.7 | 853.6 | 0 |
| cleanup | sandbox | 50 | 24.9 | 101.9 | 155.5 | 0 |
| compare_sources | sandbox | 50 | 2507.6 | 2517.4 | 2519.3 | 0 |
| diff_capture | sandbox | 200 | 13 | 26.1 | 73.2 | 0 |
| edit_scope | sandbox | 50 | 107.9 | 110 | 112.8 | 0 |
| format_check | sandbox | 100 | 37.7 | 40 | 42.1 | 0 |
| git_rev_parse | sandbox | 64 | 13 | 16.5 | 46.9 | 0 |
| mkdir | sandbox | 127 | 14.1 | 27.1 | 67.8 | 0 |
| native_decisions | sandbox | 50 | 1009.4 | 1037.8 | 1049.1 | 0 |
| objdiff | sandbox | 150 | 67.1 | 87.1 | 119.6 | 0 |
| other:cp | sandbox | 63 | 13.2 | 29.3 | 44.4 | 0 |
| other:rm | sandbox | 100 | 12.9 | 28.5 | 61.8 | 0 |
| provision_checkout | sandbox | 50 | 71.8 | 94.5 | 103.3 | 0 |
| provision_git | sandbox | 100 | 62 | 73.2 | 103.3 | 0 |
| provision_link | sandbox | 100 | 16.3 | 41.4 | 117.7 | 0 |
| provision_verify | sandbox | 50 | 22.6 | 126.7 | 126.8 | 0 |
| python:check-changed-symbol-order.py | sandbox | 50 | 13.2 | 17.2 | 18.7 | 0 |
| qa_diff | sandbox | 100 | 38.1 | 54 | 96.1 | 0 |
| qa_lint | sandbox | 50 | 307.7 | 310.9 | 326.7 | 0 |
| qa_probe | sandbox | 50 | 12.5 | 13.7 | 25.9 | 0 |
| read_source | sandbox | 150 | 15.9 | 32.3 | 82.4 | 0 |
| shell | sandbox | 200 | 13.5 | 32.3 | 109.9 | 0 |
| source_query | sandbox | 98 | 27.8 | 31.6 | 33.9 | 0 |
| stack_check | sandbox | 150 | 157.7 | 167.7 | 248.5 | 0 |
| steering_decide | sandbox | 64 | 608.6 | 610.7 | 620.7 | 0 |
| steering_edits | sandbox | 64 | 157.9 | 160.3 | 161.1 | 0 |
| steering_mwcc | sandbox | 64 | 2509.4 | 2513.5 | 2514.3 | 0 |
| steering_placement_probe | sandbox | 50 | 48.1 | 50.1 | 53.4 | 0 |
| steering_reduce | sandbox | 64 | 2009.5 | 2013.1 | 2013.8 | 0 |
| symbol_baseline | sandbox | 50 | 12.9 | 22.1 | 43.4 | 0 |
| test | sandbox | 100 | 13.1 | 38.1 | 71.2 | 0 |
| toolpack_sync | sandbox | 50 | 27.6 | 131.5 | 155.5 | 0 |
| undefined_symbols | sandbox | 100 | 13 | 23.2 | 45.1 | 0 |
| upload_via_exec | sandbox | 64 | 12.7 | 16.2 | 17.2 | 0 |

Required-step coverage: 50 attempt sandboxes; missing {}.

### Host processes spawned (placement evidence)

| role:step | n | p50 ms | p95 ms | cpu ms total | example |
| --- | --- | --- | --- | --- | --- |
| orchestrator:git_show | 27 | 45 | 64 | 1049.3 | git show 81248bdac58da1ff74128ba8c3a3798372fa5371:src/Enemy/igaiga.cpp |
| orchestrator:git_merge-base | 64 | 230.5 | 366.7 | 2890.9 | git merge-base --is-ancestor 3b83dd4611ff59dcfdb521c11d780716aa25a124 |
| orchestrator:git_rev_parse | 53 | 36.4 | 310.8 | 1860.2 | git rev-parse --verify --quiet |
| orchestrator:git_update-ref | 128 | 145.4 | 416.8 | 5460 | git update-ref refs/decomp-orchestrator/sandbox-seeds/4d8135f2-d98e-4ad8-a73d-ceade932f721 ff7baf7bc1f69c99be114188dc8ffccfbfc89695 |
| orchestrator:provision_git | 50 | 448.4 | 2012.5 | 16595.6 | git bundle create /var/folders/hd/5sskjbf10bl2v1tx3jsvg_200000gn/T/melee-sandbox-bundle-MgVyYJ/claim.bundle |
| orchestrator:other:tar | 50 | 8059.3 | 8897 | 57778.8 | tar -cf /var/folders/hd/5sskjbf10bl2v1tx3jsvg_200000gn/T/sandbox-toolpack-V9oJWV/toolpack-gamecube-decomp.tar --exclude=toolpacks/gamecube-decomp/_impl/gamecube/mwcc_debug |
| orchestrator:worker_child | 50 | 17712.7 | 23416.8 | 68609.7 | bun /Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop/objectives/worker-compiler-loop/scale/worker-child.ts --game sms |
| orchestrator:git_apply | 39 | 37.6 | 44.1 | 1353.3 | git apply --check /var/folders/hd/5sskjbf10bl2v1tx3jsvg_200000gn/T/scale-load-test/scale-fake-200-a/step-50/state/runs/dca3e165-8798-44b2-8c45-043cf880c679/worker_state/7dffdde9- |
| orchestrator:git_read-tree | 13 | 44.7 | 90.2 | 529.3 | git read-tree ff7baf7bc1f69c99be114188dc8ffccfbfc89695 |
| orchestrator:diff_capture | 39 | 39.3 | 58.1 | 1413.2 | git diff --cached --name-status |
| orchestrator:edit_scope | 13 | 898.7 | 1245.1 | 11267 | python3 /Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop/toolpacks/gamecube-decomp/_impl/gamecube/tools/edit_scope.py check --repo |
| orchestrator:git_cat-file | 13 | 38.4 | 42.9 | 461.8 | git cat-file -e ff7baf7bc1f69c99be114188dc8ffccfbfc89695:src/Enemy/Kumokun.cpp |
| orchestrator:git_add | 13 | 42.5 | 74.1 | 513.4 | git add -- src/Enemy/Kumokun.cpp |
| orchestrator:git_commit | 13 | 74 | 78.6 | 897.8 | git commit --no-verify -m |

### Daytona API

| op | calls | errors | 429 | p50 ms | p95 ms |
| --- | --- | --- | --- | --- | --- |
| sandbox.create | 50 | 0 | 0 | 165.9 | 212.6 |
| fs.upload | 414 | 0 | 0 | 13.9 | 120.3 |
| session.create | 3036 | 0 | 0 | 3.8 | 16.9 |
| session.exec | 3036 | 0 | 0 | 27.4 | 2008.8 |
| session.delete | 3036 | 0 | 0 | 3.8 | 16.8 |
| fs.download | 300 | 0 | 0 | 10.4 | 37.2 |
| sandbox.get | 100 | 0 | 0 | 6.6 | 44.6 |
| sandbox.delete | 50 | 0 | 0 | 82.5 | 126.4 |

Sandboxes: {"created":50,"create_failures":0,"deleted":50,"create_ms":{"n":50,"p50":166,"p95":212.6,"max":238.8},"delete_ms":{"n":50,"p50":82.6,"p95":126.4,"max":131.7},"by_purpose":{"worker":50},"build_sandboxes":0,"build_sandboxes_per_attempt":0}

### Attempts

| kind | attempts | ok | verdicts | p50 s | p95 s |
| --- | --- | --- | --- | --- | --- |
| evidence_review | 8 | 8 | {"steering_located/steering_located":8} | 17.3 | 17.7 |
| clean_fix | 14 | 14 | {"passed/pass":14} | 17.7 | 18.1 |
| steering | 14 | 14 | {"steering_located/steering_located":14} | 17.5 | 17.7 |
| unverified_repair | 14 | 14 | {"target_regressed/pass":14} | 22.9 | 23.6 |

### Phases

| phase | n | p50 ms | p95 ms | max ms | failed |
| --- | --- | --- | --- | --- | --- |
| provision | 50 | 15201.7 | 17090.3 | 17160.8 | 0 |
| tool:native_decisions | 50 | 1054.5 | 1154.6 | 1212.2 | 0 |
| canned_edit | 50 | 8.8 | 23 | 49.5 | 0 |
| tool:compare_sources | 50 | 2537.6 | 2604.4 | 2660.1 | 0 |
| agent_turn | 50 | 3609.4 | 3754.3 | 3906.7 | 0 |
| child_import | 50 | 3062.1 | 3772.3 | 4233 | 0 |

Provision seed kinds (thin = ^baked bundle, full = whole history): {"thin":36,"full":14}

Host: {"worker_children":44,"worker_peak_rss_mb":{"n":44,"p50":188,"p95":202.4,"max":215.5},"worker_cpu_seconds":{"n":44,"p50":1.4,"p95":1.5,"max":1.6},"orchestrator_peak_rss_mb":970.7,"orchestrator_cpu_seconds":24,"peak_total_rss_gb":10.1,"peak_concurrent_worker_children":50}

SQLite: {"waits_over_5ms":0,"busy_errors":0,"wait_ms":{"n":0,"p50":null,"p95":null,"max":null},"by_role":{}}

Integration: {"drains":1,"processed":13,"drain_ms_total":19479.5,"per_item_ms":1498.4,"items_per_minute":40}

### Failures by kind

None.

## Step 100

Jobs {"succeeded":100}; integration outcomes {"applied":30}; kinds {"clean_fix":31,"steering":31,"unverified_repair":30,"evidence_review":8}.

### Step latency and placement

| step | placement | n | p50 ms | p95 ms | max ms | non-zero exit |
| --- | --- | --- | --- | --- | --- | --- |
| attach_check | sandbox | 100 | 20.6 | 67.5 | 97.3 | 0 |
| build | sandbox | 329 | 808.1 | 827.1 | 852.4 | 0 |
| cleanup | sandbox | 100 | 19.5 | 65.7 | 260.5 | 0 |
| compare_sources | sandbox | 100 | 2507.6 | 2518.3 | 2534.7 | 0 |
| diff_capture | sandbox | 400 | 13.1 | 36.7 | 150.7 | 0 |
| edit_scope | sandbox | 100 | 107.6 | 129.3 | 229.9 | 0 |
| format_check | sandbox | 200 | 37.5 | 49 | 146.8 | 0 |
| git_rev_parse | sandbox | 129 | 12.7 | 24.5 | 82.9 | 0 |
| mkdir | sandbox | 260 | 15.9 | 36 | 125.5 | 0 |
| native_decisions | sandbox | 100 | 1010.2 | 1023.9 | 1028.9 | 0 |
| objdiff | sandbox | 300 | 68.1 | 87.1 | 142.4 | 0 |
| other:cp | sandbox | 130 | 14.1 | 23.3 | 39.9 | 0 |
| other:rm | sandbox | 200 | 12.9 | 33.8 | 111.2 | 0 |
| provision_checkout | sandbox | 100 | 71.2 | 86.3 | 162 | 0 |
| provision_git | sandbox | 200 | 67.6 | 115.4 | 231 | 0 |
| provision_link | sandbox | 200 | 16.9 | 46.7 | 156.7 | 0 |
| provision_verify | sandbox | 100 | 50.6 | 186.2 | 487 | 0 |
| python:check-changed-symbol-order.py | sandbox | 99 | 12.5 | 28 | 161.3 | 0 |
| qa_diff | sandbox | 200 | 38.2 | 62 | 177.3 | 0 |
| qa_lint | sandbox | 100 | 307.7 | 318.4 | 395 | 0 |
| qa_probe | sandbox | 100 | 12.4 | 19.8 | 95.2 | 0 |
| read_source | sandbox | 299 | 16.4 | 40.8 | 76 | 0 |
| shell | sandbox | 398 | 13 | 44.7 | 135.2 | 0 |
| source_query | sandbox | 195 | 27.5 | 36 | 221.6 | 0 |
| stack_check | sandbox | 300 | 157.8 | 172.6 | 230.8 | 0 |
| steering_decide | sandbox | 130 | 608.4 | 610.7 | 619.9 | 0 |
| steering_edits | sandbox | 130 | 157.7 | 170.6 | 296.8 | 0 |
| steering_mwcc | sandbox | 130 | 2509.4 | 2513.6 | 2528.9 | 0 |
| steering_placement_probe | sandbox | 100 | 47.6 | 66.3 | 103.7 | 0 |
| steering_reduce | sandbox | 130 | 2009.5 | 2019.8 | 2038.9 | 0 |
| symbol_baseline | sandbox | 99 | 14.4 | 32.9 | 67.2 | 0 |
| test | sandbox | 200 | 14.5 | 34.2 | 96.4 | 0 |
| toolpack_sync | sandbox | 100 | 19.8 | 80.9 | 256.1 | 0 |
| undefined_symbols | sandbox | 200 | 13.4 | 26.5 | 139.9 | 0 |
| upload_via_exec | sandbox | 130 | 12.8 | 22.9 | 38.6 | 0 |

Required-step coverage: 100 attempt sandboxes; missing {}.

### Host processes spawned (placement evidence)

| role:step | n | p50 ms | p95 ms | cpu ms total | example |
| --- | --- | --- | --- | --- | --- |
| orchestrator:git_show | 60 | 119.6 | 237.9 | 2557.3 | git show 81248bdac58da1ff74128ba8c3a3798372fa5371:src/Enemy/igaiga.cpp |
| orchestrator:git_merge-base | 130 | 497.6 | 729.6 | 5968.1 | git merge-base --is-ancestor 3b83dd4611ff59dcfdb521c11d780716aa25a124 |
| orchestrator:git_update-ref | 260 | 316.4 | 745.9 | 11127.9 | git update-ref refs/decomp-orchestrator/sandbox-seeds/e96ee497-98dc-4b79-a021-7663e7960925 ff7baf7bc1f69c99be114188dc8ffccfbfc89695 |
| orchestrator:git_rev_parse | 120 | 51.2 | 552.8 | 4691.2 | git rev-parse --verify --quiet |
| orchestrator:provision_git | 100 | 819.7 | 3251.5 | 34460.1 | git bundle create /var/folders/hd/5sskjbf10bl2v1tx3jsvg_200000gn/T/melee-sandbox-bundle-MPHIjE/claim.bundle |
| orchestrator:other:tar | 100 | 15703 | 17174.7 | 127625.4 | tar -cf /var/folders/hd/5sskjbf10bl2v1tx3jsvg_200000gn/T/sandbox-toolpack-9FIGCR/toolpack-gamecube-decomp.tar --exclude=toolpacks/gamecube-decomp/_impl/gamecube/mwcc_debug |
| orchestrator:worker_child | 100 | 21562.8 | 26650.8 | 127191.4 | bun /Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop/objectives/worker-compiler-loop/scale/worker-child.ts --game sms |
| orchestrator:git_apply | 90 | 44.6 | 106.2 | 3576 | git apply --check /var/folders/hd/5sskjbf10bl2v1tx3jsvg_200000gn/T/scale-load-test/scale-fake-200-a/step-100/state/runs/eed3c030-c6d4-4f2a-9c4c-2dd5944a0a51/worker_state/9592e01b |
| orchestrator:git_read-tree | 30 | 59.4 | 112.8 | 1392.3 | git read-tree ff7baf7bc1f69c99be114188dc8ffccfbfc89695 |
| orchestrator:diff_capture | 90 | 49.8 | 116.6 | 3795.5 | git diff --cached --name-status |
| orchestrator:edit_scope | 30 | 1417.9 | 4372.1 | 28603.6 | python3 /Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop/toolpacks/gamecube-decomp/_impl/gamecube/tools/edit_scope.py check --repo |
| orchestrator:git_cat-file | 30 | 51.5 | 294.8 | 1229 | git cat-file -e ff7baf7bc1f69c99be114188dc8ffccfbfc89695:src/Enemy/tobiPuku.cpp |
| orchestrator:git_add | 30 | 54.4 | 83.1 | 1341.9 | git add -- src/Enemy/tobiPuku.cpp |
| orchestrator:git_commit | 30 | 108.6 | 204.2 | 2459.1 | git commit --no-verify -m |

### Daytona API

| op | calls | errors | 429 | p50 ms | p95 ms |
| --- | --- | --- | --- | --- | --- |
| sandbox.create | 100 | 0 | 0 | 229.3 | 323.1 |
| fs.upload | 830 | 0 | 0 | 19.7 | 497.5 |
| session.create | 6088 | 0 | 0 | 3.9 | 26.4 |
| session.exec | 6088 | 0 | 0 | 29.2 | 2009.1 |
| session.delete | 6088 | 0 | 0 | 4 | 26.6 |
| fs.download | 600 | 0 | 0 | 12.1 | 124.2 |
| sandbox.get | 200 | 0 | 0 | 9 | 62 |
| sandbox.delete | 100 | 0 | 0 | 82.2 | 127.2 |

Sandboxes: {"created":100,"create_failures":0,"deleted":100,"create_ms":{"n":100,"p50":229.4,"p95":323.2,"max":331.8},"delete_ms":{"n":100,"p50":82.2,"p95":127.3,"max":127.7},"by_purpose":{"worker":100},"build_sandboxes":0,"build_sandboxes_per_attempt":0}

### Attempts

| kind | attempts | ok | verdicts | p50 s | p95 s |
| --- | --- | --- | --- | --- | --- |
| steering | 31 | 31 | {"steering_located/steering_located":31} | 20.8 | 21.8 |
| clean_fix | 31 | 31 | {"passed/pass":31} | 21.1 | 21.8 |
| evidence_review | 8 | 8 | {"steering_located/steering_located":8} | 20.4 | 21.8 |
| unverified_repair | 30 | 30 | {"target_regressed/pass":30} | 26.3 | 26.5 |

### Phases

| phase | n | p50 ms | p95 ms | max ms | failed |
| --- | --- | --- | --- | --- | --- |
| provision | 100 | 31829.7 | 33802.9 | 33916.4 | 0 |
| tool:native_decisions | 100 | 1065.8 | 1220.6 | 1372.9 | 0 |
| canned_edit | 100 | 9.1 | 23.8 | 35.4 | 0 |
| tool:compare_sources | 100 | 2539.1 | 2596.1 | 2619.1 | 0 |
| agent_turn | 100 | 3626 | 3787.6 | 3994 | 0 |
| child_import | 100 | 6145.2 | 7134.6 | 7421 | 0 |

Provision seed kinds (thin = ^baked bundle, full = whole history): {"thin":70,"full":30}

Host: {"worker_children":97,"worker_peak_rss_mb":{"n":97,"p50":184,"p95":207.3,"max":216.3},"worker_cpu_seconds":{"n":97,"p50":1.2,"p95":1.4,"max":1.6},"orchestrator_peak_rss_mb":1406.1,"orchestrator_cpu_seconds":71.1,"peak_total_rss_gb":17.91,"peak_concurrent_worker_children":100}

SQLite: {"waits_over_5ms":4,"busy_errors":0,"wait_ms":{"n":4,"p50":7.9,"p95":14.2,"max":14.2},"by_role":{"worker":{"n":3,"p50":10,"p95":14.2,"max":14.2,"total_ms":32.1},"orchestrator":{"n":1,"p50":6.5,"p95":6.5,"max":6.5,"total_ms":6.5}}}

Integration: {"drains":2,"processed":30,"drain_ms_total":86372.8,"per_item_ms":2879.1,"items_per_minute":20.8}

### Failures by kind

None.

## Step 200

Jobs {"succeeded":200}; integration outcomes {"applied":67}; kinds {"clean_fix":70,"steering":52,"unverified_repair":70,"evidence_review":8}.

### Step latency and placement

| step | placement | n | p50 ms | p95 ms | max ms | non-zero exit |
| --- | --- | --- | --- | --- | --- | --- |
| attach_check | sandbox | 200 | 33.3 | 135.4 | 380.1 | 0 |
| build | sandbox | 666 | 812.9 | 842.6 | 977.2 | 0 |
| cleanup | sandbox | 200 | 61.7 | 1318.9 | 1569.9 | 0 |
| compare_sources | sandbox | 200 | 2511.8 | 2538.7 | 2587.5 | 0 |
| diff_capture | sandbox | 800 | 21 | 76.2 | 218.1 | 0 |
| edit_scope | sandbox | 200 | 111.5 | 138 | 274.8 | 0 |
| format_check | sandbox | 400 | 41 | 83.8 | 183.7 | 0 |
| git_rev_parse | sandbox | 266 | 16 | 71 | 98.7 | 0 |
| mkdir | sandbox | 537 | 25.1 | 761.9 | 766.4 | 0 |
| native_decisions | sandbox | 200 | 1017.3 | 1060.9 | 1216.1 | 0 |
| objdiff | sandbox | 600 | 74.9 | 151.2 | 518.6 | 0 |
| other:cp | sandbox | 267 | 18.5 | 63.4 | 144.5 | 0 |
| other:rm | sandbox | 400 | 20.1 | 83.8 | 179.6 | 0 |
| provision_checkout | sandbox | 200 | 318.1 | 1179.3 | 1180.6 | 0 |
| provision_git | sandbox | 400 | 1569.2 | 1615.9 | 2149.1 | 0 |
| provision_link | sandbox | 400 | 30.9 | 154.3 | 387.4 | 0 |
| provision_verify | sandbox | 200 | 37.3 | 1298.8 | 1309.6 | 0 |
| python:check-changed-symbol-order.py | sandbox | 196 | 15.7 | 39.8 | 110.6 | 0 |
| qa_assets_sync | sandbox | 200 | 53.7 | 1159.5 | 1230.2 | 0 |
| qa_diff | sandbox | 400 | 48.4 | 111.1 | 271.6 | 0 |
| qa_lint | sandbox | 200 | 313.5 | 371.8 | 433.9 | 0 |
| qa_probe | sandbox | 200 | 17.1 | 58.7 | 113.9 | 0 |
| read_source | sandbox | 596 | 26.1 | 108 | 348.4 | 0 |
| shell | sandbox | 792 | 19.8 | 99.2 | 489.4 | 0 |
| source_query | sandbox | 391 | 31.2 | 81.5 | 364.7 | 0 |
| stack_check | sandbox | 600 | 163 | 205.2 | 402.6 | 0 |
| steering_decide | sandbox | 268 | 609.8 | 617.7 | 661.5 | 0 |
| steering_edits | sandbox | 268 | 160.5 | 194.6 | 427.5 | 0 |
| steering_mwcc | sandbox | 268 | 2510.4 | 2522.7 | 2594 | 0 |
| steering_placement_probe | sandbox | 198 | 51.1 | 88.8 | 153.7 | 0 |
| steering_reduce | sandbox | 268 | 2010.8 | 2027.3 | 2096.4 | 0 |
| symbol_baseline | sandbox | 196 | 20 | 54.1 | 174.1 | 0 |
| test | sandbox | 400 | 22 | 116.2 | 395.9 | 0 |
| toolpack_sync | sandbox | 200 | 112.1 | 848.5 | 1440.2 | 0 |
| undefined_symbols | sandbox | 400 | 18.7 | 65.5 | 209.8 | 0 |
| upload_via_exec | sandbox | 268 | 15.4 | 39.1 | 104.1 | 0 |

Required-step coverage: 200 attempt sandboxes; missing {"steering_edits":2,"steering_reduce":2,"steering_mwcc":2,"steering_decide":2}.

### Host processes spawned (placement evidence)

| role:step | n | p50 ms | p95 ms | cpu ms total | example |
| --- | --- | --- | --- | --- | --- |
| orchestrator:git_show | 137 | 195.3 | 1061.6 | 6252.2 | git show 81248bdac58da1ff74128ba8c3a3798372fa5371:src/Enemy/igaiga.cpp |
| orchestrator:git_merge-base | 270 | 1387.1 | 2349.5 | 12043.8 | git merge-base --is-ancestor 3b83dd4611ff59dcfdb521c11d780716aa25a124 |
| orchestrator:git_rev_parse | 271 | 65.9 | 562.7 | 11464.7 | git rev-parse --verify --quiet |
| orchestrator:git_update-ref | 540 | 1042.3 | 2128.9 | 22713.8 | git update-ref refs/decomp-orchestrator/sandbox-seeds/724afb4a-4473-4949-8b0e-3707a942ad9f ff7baf7bc1f69c99be114188dc8ffccfbfc89695 |
| orchestrator:provision_git | 200 | 1609.2 | 6789.5 | 77542 | git bundle create /var/folders/hd/5sskjbf10bl2v1tx3jsvg_200000gn/T/melee-sandbox-bundle-bjTN1V/claim.bundle |
| orchestrator:other:tar | 400 | 8431.3 | 31644.1 | 251060 | tar -cf /var/folders/hd/5sskjbf10bl2v1tx3jsvg_200000gn/T/sandbox-toolpack-xlYodh/toolpack-gamecube-decomp.tar --exclude=toolpacks/gamecube-decomp/_impl/gamecube/mwcc_debug |
| orchestrator:worker_child | 200 | 27760.8 | 35705.8 | 271510.1 | bun /Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop/objectives/worker-compiler-loop/scale/worker-child.ts --game sms |
| orchestrator:git_apply | 201 | 60.8 | 155.9 | 8965.4 | git apply --check /var/folders/hd/5sskjbf10bl2v1tx3jsvg_200000gn/T/scale-load-test/scale-fake-200-a/step-200/state/runs/0032f704-d312-4d7e-9645-5ec5a4a0e12b/worker_state/58812177 |
| orchestrator:git_read-tree | 67 | 68.1 | 133.5 | 3419.3 | git read-tree ff7baf7bc1f69c99be114188dc8ffccfbfc89695 |
| orchestrator:diff_capture | 201 | 62.1 | 127.4 | 9441.7 | git diff --cached --name-status |
| orchestrator:edit_scope | 67 | 2242.3 | 3560.4 | 63529.8 | python3 /Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop/toolpacks/gamecube-decomp/_impl/gamecube/tools/edit_scope.py check --repo |
| orchestrator:git_cat-file | 67 | 61.2 | 120 | 3022.3 | git cat-file -e ff7baf7bc1f69c99be114188dc8ffccfbfc89695:src/System/EventWatcher.cpp |
| orchestrator:git_add | 67 | 67.3 | 147.6 | 3389.3 | git add -- src/System/EventWatcher.cpp |
| orchestrator:git_commit | 67 | 137.9 | 268.3 | 6240.3 | git commit --no-verify -m |

### Daytona API

| op | calls | errors | 429 | p50 ms | p95 ms |
| --- | --- | --- | --- | --- | --- |
| sandbox.create | 200 | 0 | 0 | 1045.4 | 1624.6 |
| fs.upload | 2070 | 0 | 0 | 69.7 | 1481.1 |
| session.create | 12445 | 0 | 0 | 8.5 | 164.5 |
| session.exec | 12445 | 0 | 0 | 44.6 | 2010.5 |
| session.delete | 12445 | 0 | 0 | 8.8 | 107.2 |
| fs.download | 1200 | 0 | 0 | 15.1 | 61.9 |
| sandbox.get | 400 | 0 | 0 | 13.3 | 151 |
| sandbox.delete | 200 | 0 | 0 | 83.8 | 187.5 |

Sandboxes: {"created":200,"create_failures":0,"deleted":200,"create_ms":{"n":200,"p50":1045.5,"p95":1624.7,"max":1679.5},"delete_ms":{"n":200,"p50":83.9,"p95":187.5,"max":850.7},"by_purpose":{"worker":200},"build_sandboxes":0,"build_sandboxes_per_attempt":0}

### Attempts

| kind | attempts | ok | verdicts | p50 s | p95 s |
| --- | --- | --- | --- | --- | --- |
| steering | 52 | 52 | {"steering_located/steering_located":52} | 25.5 | 29.3 |
| clean_fix | 70 | 70 | {"passed/pass":68,"failed/no_gate":2} | 25 | 29.3 |
| unverified_repair | 70 | 70 | {"target_regressed/pass":70} | 32.4 | 36 |
| evidence_review | 8 | 8 | {"steering_located/steering_located":8} | 28.8 | 30 |

### Phases

| phase | n | p50 ms | p95 ms | max ms | failed |
| --- | --- | --- | --- | --- | --- |
| provision | 200 | 99344.5 | 110557.4 | 115800.4 | 0 |
| tool:native_decisions | 200 | 1154.2 | 1561.6 | 2046.3 | 0 |
| canned_edit | 200 | 14.6 | 44.2 | 77 | 0 |
| tool:compare_sources | 200 | 2586.3 | 2785.8 | 3110.5 | 0 |
| agent_turn | 200 | 3793.2 | 4393.5 | 4889.5 | 0 |
| child_import | 200 | 8581.7 | 10579.9 | 11574.1 | 0 |

Provision seed kinds (thin = ^baked bundle, full = whole history): {"thin":130,"full":70}

Host: {"worker_children":186,"worker_peak_rss_mb":{"n":186,"p50":179.6,"p95":199.4,"max":222},"worker_cpu_seconds":{"n":186,"p50":1.3,"p95":1.6,"max":1.6},"orchestrator_peak_rss_mb":3542.9,"orchestrator_cpu_seconds":162.3,"peak_total_rss_gb":34.6,"peak_concurrent_worker_children":190}

SQLite: {"waits_over_5ms":121,"busy_errors":0,"wait_ms":{"n":121,"p50":14,"p95":115,"max":437.4},"by_role":{"worker":{"n":103,"p50":14.4,"p95":115,"max":437.4,"total_ms":3792.8},"orchestrator":{"n":18,"p50":11.7,"p95":121.9,"max":121.9,"total_ms":514.2}}}

Integration: {"drains":2,"processed":67,"drain_ms_total":239422.2,"per_item_ms":3573.5,"items_per_minute":16.8}

### Failures by kind

None.
