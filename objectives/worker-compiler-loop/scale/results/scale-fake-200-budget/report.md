# Load test scale-fake-200-budget

- Mode: dry-run (fake Daytona)
- Window: 2026-10-17T16:57:57.589Z to 2026-10-17T16:58:48.865Z
- Cost guard: {"limits":{"maxAlive":150,"maxSandboxMinutes":100,"allowBuildSandboxes":false},"created":151,"created_by_purpose":{"worker":151},"alive":0,"peak_alive":150,"sandbox_minutes":106.321,"refused_creates":50,"build_creates_refused":0,"tripped":"sandbox-minutes 100.1 reached the limit 100"}
- Kill switch: [{"run_id":"scale-fake-200-budget","found":150,"deleted":150,"errors":[],"remaining":0,"ms":4641.300709000003},{"run_id":"scale-fake-200-budget","found":0,"deleted":0,"errors":[],"remaining":0,"ms":103.03050000000076}]
- Fake Daytona: peak alive 150, created 151, alive at end 0

## Ramp

| concurrency | attempts ok/total | wall s | attempt p50/p95 s | provision p50/p95 ms | API calls | 429 | build sandboxes | placement failures | toolpack re-syncs | worker RSS p50/max MB | peak total RSS GB | sqlite waits >5ms (max ms) | integration items/min |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 200 | 0/0 | 43.3 | null/null | 9140.2/19690.2 | 14764 | 0 | 0 | 0 | 0 | 179.5/242.8 | 28.48 | 13 (17.3) |  |

## Step 200

Jobs {"failed":200}; integration outcomes {}; kinds {"clean_fix":70,"steering":52,"unverified_repair":70,"evidence_review":8}.

### Step latency and placement

| step | placement | n | p50 ms | p95 ms | max ms | non-zero exit |
| --- | --- | --- | --- | --- | --- | --- |
| attach_check | sandbox | 150 | 87 | 174.3 | 234.1 | 0 |
| build | sandbox | 157 | 4043.6 | 4071.5 | 4098.6 | 0 |
| compare_sources | sandbox | 29 | 12539.3 | 12567.3 | 12568.5 | 0 |
| diff_capture | sandbox | 347 | 69.4 | 119.7 | 205.1 | 0 |
| git_rev_parse | sandbox | 20 | 349.7 | 387.5 | 387.5 | 0 |
| mkdir | sandbox | 320 | 64.5 | 245.1 | 245.7 | 0 |
| native_decisions | sandbox | 150 | 5037.6 | 5067.1 | 5155.6 | 0 |
| objdiff | sandbox | 305 | 342.8 | 367.3 | 529 | 0 |
| other:cp | sandbox | 150 | 65.5 | 104.9 | 186.8 | 0 |
| other:rm | sandbox | 171 | 67.7 | 125.5 | 195.4 | 0 |
| provision_checkout | sandbox | 150 | 350.1 | 395.2 | 396 | 0 |
| provision_git | sandbox | 300 | 299.5 | 711.5 | 711.8 | 0 |
| provision_link | sandbox | 300 | 71.3 | 119.4 | 248.4 | 0 |
| provision_verify | sandbox | 150 | 179.9 | 506.2 | 2039.9 | 0 |
| qa_diff | sandbox | 169 | 192.6 | 237.2 | 295 | 0 |
| qa_lint | sandbox | 11 | 1536.6 | 1538.5 | 1538.5 | 0 |
| qa_probe | sandbox | 19 | 62.4 | 68.7 | 68.7 | 0 |
| read_source | sandbox | 300 | 80 | 176.5 | 236.5 | 0 |
| shell | sandbox | 300 | 79.4 | 184.4 | 344.5 | 0 |
| stack_check | sandbox | 151 | 795.6 | 868.7 | 900.4 | 0 |
| symbol_baseline | sandbox | 146 | 69.9 | 130.9 | 188.3 | 0 |
| test | sandbox | 300 | 64.8 | 141 | 209 | 0 |
| undefined_symbols | sandbox | 150 | 66.2 | 99.9 | 125 | 0 |

Required-step coverage: 150 attempt sandboxes; missing {"steering_edits":150,"steering_reduce":150,"steering_mwcc":150,"steering_decide":150,"qa_lint":139,"compare_sources":121}.

### Host processes spawned (placement evidence)

| role:step | n | p50 ms | p95 ms | cpu ms total | example |
| --- | --- | --- | --- | --- | --- |
| orchestrator:git_show | 70 | 502.5 | 664.2 | 2900.5 | git show 81248bdac58da1ff74128ba8c3a3798372fa5371:src/Enemy/igaiga.cpp |
| orchestrator:git_merge-base | 170 | 478.1 | 1092.4 | 7684.6 | git merge-base --is-ancestor 3b83dd4611ff59dcfdb521c11d780716aa25a124 |
| orchestrator:git_rev_parse | 20 | 275.7 | 318.4 | 844.8 | git rev-parse --verify --quiet |
| orchestrator:git_update-ref | 4 | 87.5 | 595.7 | 179.3 | git update-ref refs/decomp-orchestrator/sandbox-seeds/15244a91-6e12-42d6-b1e3-2370ad96eab8 ff7baf7bc1f69c99be114188dc8ffccfbfc89695 |
| orchestrator:git_-c | 1 | 2690.7 | 2690.7 | 881.1 | git -c pack.threads=1 bundle |
| orchestrator:worker_child | 150 | 30726.3 | 35283.7 | 180649.9 | bun /Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop/objectives/worker-compiler-loop/scale/worker-child.ts --game sms |

### Daytona API

| op | calls | errors | 429 | p50 ms | p95 ms |
| --- | --- | --- | --- | --- | --- |
| sandbox.create | 150 | 0 | 0 | 1378.9 | 2356.3 |
| fs.upload | 798 | 0 | 0 | 55.7 | 715.5 |
| session.create | 4386 | 0 | 0 | 22 | 239.8 |
| session.exec | 4245 | 0 | 0 | 89.8 | 4050.4 |
| session.delete | 4245 | 0 | 0 | 21.3 | 146.8 |
| fs.download | 773 | 0 | 0 | 54.7 | 374.7 |
| sandbox.get | 166 | 0 | 0 | 59 | 215.7 |
| sandbox.list | 1 | 0 | 0 | 192.3 | 192.3 |

Sandboxes: {"created":150,"create_failures":0,"deleted":0,"create_ms":{"n":150,"p50":1378.9,"p95":2356.5,"max":2406.4},"delete_ms":{"n":0,"p50":null,"p95":null,"max":null},"by_purpose":{"worker":150},"build_sandboxes":0,"build_sandboxes_per_attempt":null}

### Attempts

| kind | attempts | ok | verdicts | p50 s | p95 s |
| --- | --- | --- | --- | --- | --- |

### Phases

| phase | n | p50 ms | p95 ms | max ms | failed |
| --- | --- | --- | --- | --- | --- |
| provision | 200 | 9140.2 | 19690.2 | 20352.6 | 50 |
| tool:native_decisions | 150 | 5235.6 | 5460.7 | 5946.9 | 0 |
| canned_edit | 150 | 41.8 | 56.3 | 124.2 | 0 |
| tool:compare_sources | 29 | 12747.4 | 12849.6 | 12883.7 | 0 |
| agent_turn | 29 | 18094.1 | 18351 | 18808.1 | 0 |

Provision seed kinds (thin = ^baked bundle, full = whole history): {"thin":130,"full":20}

Host: {"worker_children":150,"worker_peak_rss_mb":{"n":150,"p50":179.5,"p95":200.8,"max":242.8},"worker_cpu_seconds":{"n":150,"p50":1.2,"p95":1.3,"max":1.5},"orchestrator_peak_rss_mb":1902.8,"orchestrator_cpu_seconds":7.6,"peak_total_rss_gb":28.48,"peak_concurrent_worker_children":150}

SQLite: {"waits_over_5ms":13,"busy_errors":0,"wait_ms":{"n":13,"p50":8.1,"p95":17.3,"max":17.3},"by_role":{"orchestrator":{"n":4,"p50":6.7,"p95":8.6,"max":8.6,"total_ms":28.7},"worker":{"n":9,"p50":9.4,"p95":17.3,"max":17.3,"total_ms":96.7}}}

Integration: {"drains":0,"processed":0,"drain_ms_total":0,"per_item_ms":null,"items_per_minute":null}

### Failures by kind

| kind | count | examples |
| --- | --- | --- |
| provision | 50 | cost guard: max alive sandboxes 150 reached |
| worker_job | 200 | Sandbox provisioning failed before worker execution: cost guard: max alive sandboxes 150 reached / Unknown local process handle: 4beb4bae-7f82-45e1-9d3a-35a511455352 / Unknown local process handle: e0ae3751-cc53-4986-9d4d-a15170589351 |
