# Load test scale-fake-200-clean

- Mode: dry-run (fake Daytona)
- Window: 2026-10-17T16:59:00.835Z to 2026-10-17T17:01:24.303Z
- Cost guard: {"limits":{"maxAlive":210,"maxSandboxMinutes":100000,"allowBuildSandboxes":false},"created":201,"created_by_purpose":{"worker":201},"alive":0,"peak_alive":200,"sandbox_minutes":168.96,"refused_creates":0,"build_creates_refused":0,"tripped":null}
- Kill switch: [{"run_id":"scale-fake-200-clean","found":0,"deleted":0,"errors":[],"remaining":0,"ms":43.40891600001487}]
- Fake Daytona: peak alive 200, created 201, alive at end 0

## Ramp

| concurrency | attempts ok/total | wall s | attempt p50/p95 s | provision p50/p95 ms | API calls | 429 | build sandboxes | placement failures | toolpack re-syncs | worker RSS p50/max MB | peak total RSS GB | sqlite waits >5ms (max ms) | integration items/min |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 200 | 200/200 | 138.91 | 38.8/46.4 | 4476/19981.4 | 40689 | 0 | 0 | 0 | 0 | 176.6/253.2 | 39.47 | 129 (119.5) | 42.9 |

## Step 200

Jobs {"succeeded":200}; integration outcomes {"applied":69}; kinds {"clean_fix":70,"steering":52,"unverified_repair":70,"evidence_review":8}.

### Step latency and placement

| step | placement | n | p50 ms | p95 ms | max ms | non-zero exit |
| --- | --- | --- | --- | --- | --- | --- |
| attach_check | sandbox | 200 | 38.5 | 145.1 | 265.4 | 0 |
| build | sandbox | 666 | 1617.5 | 1657.8 | 1845.7 | 0 |
| compare_sources | sandbox | 200 | 5029 | 5140.6 | 5155.9 | 0 |
| diff_capture | sandbox | 800 | 32.7 | 95.6 | 260.2 | 0 |
| edit_scope | sandbox | 200 | 217.8 | 232.8 | 307.5 | 0 |
| format_check | sandbox | 400 | 75.2 | 104.3 | 183.2 | 0 |
| git_rev_parse | sandbox | 266 | 27.3 | 148.7 | 580.8 | 0 |
| mkdir | sandbox | 539 | 26 | 184.8 | 188.3 | 0 |
| native_decisions | sandbox | 200 | 2030.1 | 2116.7 | 2199.6 | 0 |
| objdiff | sandbox | 600 | 137.7 | 192.9 | 331.2 | 0 |
| other:cp | sandbox | 269 | 26.3 | 54.4 | 246.9 | 0 |
| other:rm | sandbox | 400 | 33.5 | 139.6 | 329.4 | 0 |
| provision_checkout | sandbox | 200 | 134.6 | 159.5 | 163.8 | 0 |
| provision_git | sandbox | 400 | 124.2 | 220.4 | 582.6 | 0 |
| provision_link | sandbox | 400 | 27.8 | 137.9 | 292.1 | 0 |
| provision_verify | sandbox | 200 | 247.7 | 458.5 | 7328.5 | 0 |
| python_inline | sandbox | 600 | 26.1 | 59.5 | 250.4 | 0 |
| python:check-changed-symbol-order.py | sandbox | 196 | 26.9 | 46.9 | 119.1 | 0 |
| qa_diff | sandbox | 400 | 83.7 | 151.9 | 329 | 0 |
| qa_lint | sandbox | 200 | 620.9 | 687.8 | 754.6 | 0 |
| qa_probe | sandbox | 200 | 32.6 | 108 | 192.1 | 0 |
| read_source | sandbox | 396 | 30.9 | 80.5 | 314.6 | 0 |
| shell | sandbox | 792 | 30.9 | 156.5 | 330.2 | 0 |
| source_query | sandbox | 200 | 55.9 | 111.3 | 124.8 | 0 |
| stack_check | sandbox | 600 | 317.6 | 358.9 | 493.9 | 0 |
| steering_decide | sandbox | 270 | 1215.1 | 1217 | 1236.1 | 0 |
| steering_edits | sandbox | 270 | 315.6 | 330.1 | 349.5 | 0 |
| steering_mwcc | sandbox | 270 | 5015.5 | 5021.3 | 5037.5 | 0 |
| steering_placement_probe | sandbox | 200 | 96.5 | 113.8 | 217 | 0 |
| steering_reduce | sandbox | 270 | 4015.8 | 4030.5 | 4046.9 | 0 |
| symbol_baseline | sandbox | 196 | 27.3 | 60.8 | 135.3 | 0 |
| test | sandbox | 400 | 33.7 | 126.6 | 333.9 | 0 |
| undefined_symbols | sandbox | 400 | 28.3 | 70.9 | 269.2 | 0 |
| upload_via_exec | sandbox | 673 | 25.6 | 45.1 | 133.4 | 0 |

Required-step coverage: 200 attempt sandboxes; missing {}.

### Host processes spawned (placement evidence)

| role:step | n | p50 ms | p95 ms | cpu ms total | example |
| --- | --- | --- | --- | --- | --- |
| orchestrator:git_show | 139 | 221.7 | 1623.3 | 5475.5 | git show 81248bdac58da1ff74128ba8c3a3798372fa5371:src/Enemy/igaiga.cpp |
| orchestrator:git_merge-base | 270 | 368.3 | 1020.3 | 11910.4 | git merge-base --is-ancestor 3b83dd4611ff59dcfdb521c11d780716aa25a124 |
| orchestrator:git_rev_parse | 277 | 36.8 | 387.7 | 9623.3 | git rev-parse --verify --quiet |
| orchestrator:git_update-ref | 4 | 210.5 | 2781 | 170.7 | git update-ref refs/decomp-orchestrator/sandbox-seeds/52c3c267-9fb4-4bf0-87c6-3fa7f6158fd3 ff7baf7bc1f69c99be114188dc8ffccfbfc89695 |
| orchestrator:git_-c | 1 | 942.5 | 942.5 | 781.3 | git -c pack.threads=1 bundle |
| orchestrator:worker_child | 200 | 38901.4 | 46516.8 | 262614.6 | bun /Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop/objectives/worker-compiler-loop/scale/worker-child.ts --game sms |
| orchestrator:git_apply | 207 | 37.5 | 45.4 | 7093.8 | git apply --check /var/folders/hd/5sskjbf10bl2v1tx3jsvg_200000gn/T/scale-load-test/scale-fake-200-clean/step-200/state/runs/851a87c7-9f5d-4e58-850a-8a42afe076be/worker_state/59f8 |
| orchestrator:git_read-tree | 69 | 43 | 61 | 2720.2 | git read-tree ff7baf7bc1f69c99be114188dc8ffccfbfc89695 |
| orchestrator:diff_capture | 207 | 39.4 | 46.4 | 7454.1 | git diff --cached --name-status |
| orchestrator:edit_scope | 69 | 830.9 | 1037.4 | 52949.8 | python3 /Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop/toolpacks/gamecube-decomp/_impl/gamecube/tools/edit_scope.py check --repo |
| orchestrator:git_cat-file | 69 | 39.1 | 43.9 | 2464.7 | git cat-file -e ff7baf7bc1f69c99be114188dc8ffccfbfc89695:src/MoveBG/MapObjTrap.cpp |
| orchestrator:git_add | 69 | 41.1 | 58.9 | 2610 | git add -- src/MoveBG/MapObjTrap.cpp |
| orchestrator:git_commit | 69 | 72.8 | 86 | 4667.9 | git commit --no-verify -m |

### Daytona API

| op | calls | errors | 429 | p50 ms | p95 ms |
| --- | --- | --- | --- | --- | --- |
| sandbox.create | 200 | 0 | 0 | 809.5 | 1156.7 |
| fs.upload | 1270 | 0 | 0 | 32.3 | 7338.6 |
| session.create | 12473 | 0 | 0 | 9.3 | 71.5 |
| session.exec | 12473 | 0 | 0 | 66.8 | 4015.6 |
| session.delete | 12473 | 0 | 0 | 9.5 | 76.1 |
| fs.download | 1200 | 0 | 0 | 23.7 | 101.1 |
| sandbox.get | 400 | 0 | 0 | 13.9 | 236.4 |
| sandbox.delete | 200 | 0 | 0 | 161.2 | 169 |

Sandboxes: {"created":200,"create_failures":0,"deleted":200,"create_ms":{"n":200,"p50":809.7,"p95":1159.6,"max":1190.5},"delete_ms":{"n":200,"p50":161.3,"p95":169,"max":228},"by_purpose":{"worker":200},"build_sandboxes":0,"build_sandboxes_per_attempt":0}

### Attempts

| kind | attempts | ok | verdicts | p50 s | p95 s |
| --- | --- | --- | --- | --- | --- |
| steering | 52 | 52 | {"steering_located/steering_located":52} | 37.8 | 39.5 |
| clean_fix | 70 | 70 | {"passed/pass":70} | 37.4 | 39.5 |
| evidence_review | 8 | 8 | {"steering_located/steering_located":8} | 38.2 | 38.8 |
| unverified_repair | 70 | 70 | {"target_regressed/pass":70} | 46 | 46.7 |

### Phases

| phase | n | p50 ms | p95 ms | max ms | failed |
| --- | --- | --- | --- | --- | --- |
| provision | 200 | 4476 | 19981.4 | 20066.6 | 0 |
| tool:native_decisions | 200 | 2193.3 | 2442.5 | 2768.8 | 0 |
| canned_edit | 200 | 28.7 | 115.1 | 268.8 | 0 |
| tool:compare_sources | 200 | 5169.9 | 5434.3 | 5638.8 | 0 |
| agent_turn | 200 | 7473.9 | 7849.7 | 8000.3 | 0 |
| child_import | 200 | 5995.8 | 8526.9 | 8856.9 | 0 |

Provision seed kinds (thin = ^baked bundle, full = whole history): {"thin":130,"full":70}

Host: {"worker_children":196,"worker_peak_rss_mb":{"n":196,"p50":176.6,"p95":199.1,"max":253.2},"worker_cpu_seconds":{"n":196,"p50":1.3,"p95":1.4,"max":1.6},"orchestrator_peak_rss_mb":4633,"orchestrator_cpu_seconds":12.9,"peak_total_rss_gb":39.47,"peak_concurrent_worker_children":200}

SQLite: {"waits_over_5ms":129,"busy_errors":0,"wait_ms":{"n":129,"p50":10.7,"p95":59.3,"max":119.5},"by_role":{"orchestrator":{"n":25,"p50":7.8,"p95":44.7,"max":119.5,"total_ms":433.5},"worker":{"n":104,"p50":10.8,"p95":59.3,"max":85.8,"total_ms":2009.4}}}

Integration: {"drains":2,"processed":69,"drain_ms_total":96443.1,"per_item_ms":1397.7,"items_per_minute":42.9}

### Failures by kind

None.
