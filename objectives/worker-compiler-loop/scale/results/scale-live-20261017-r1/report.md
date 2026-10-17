# Load test scale-live-20261017-r1

- Mode: live
- Window: 2026-10-17T22:54:19.711Z to 2026-10-17T22:55:03.466Z
- Cost guard: {"limits":{"maxAlive":3,"maxSandboxMinutes":60,"allowBuildSandboxes":false},"created":1,"failed_creates":{"allocated":0,"allocated_nothing":0,"unconfirmed":0},"created_by_purpose":{"worker":1},"alive":0,"peak_alive":1,"sandbox_minutes":0.72,"refused_creates":0,"build_creates_refused":0,"tripped":null}
- Kill switch: [{"run_id":"scale-live-20261017-r1","found":1,"deleted":1,"errors":[],"remaining":1,"ms":302.7104580000014}]

## Ramp

| concurrency | attempts ok/total | wall s | attempt p50/p95 s | provision p50/p95 ms | API calls | API calls/attempt | 429 | build sandboxes | placement failures | toolpack re-syncs | worker RSS p50/max MB | peak total RSS GB | sqlite waits >5ms (max ms) | integration items/min |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1/1 | 43.32 | 30.9/30.9 | 11082.1/11082.1 | 74 | 74 | 0 | 0 | 0 | 0 | 209.5/209.5 | 0.4 | 0 (0) |  |

## Step 1

Jobs {"succeeded":1}; integration outcomes {}; kinds {"clean_fix":1}.

### Step latency and placement

| step | placement | n | p50 ms | p95 ms | max ms | non-zero exit |
| --- | --- | --- | --- | --- | --- | --- |
| attach_check | sandbox | 1 | 314.5 | 314.5 | 314.5 | 0 |
| build | sandbox | 3 | 605.4 | 2061.9 | 2061.9 | 0 |
| compare_sources | sandbox | 1 | 2023 | 2023 | 2023 | 0 |
| diff_capture | sandbox | 4 | 311.7 | 401.7 | 401.7 | 0 |
| edit_scope | sandbox | 1 | 343.4 | 343.4 | 343.4 | 1 |
| format_check | sandbox | 2 | 307.6 | 349.2 | 349.2 | 1 |
| git_rev_parse | sandbox | 1 | 299.9 | 299.9 | 299.9 | 0 |
| mkdir | sandbox | 2 | 308 | 317.3 | 317.3 | 0 |
| native_decisions | sandbox | 1 | 1201.6 | 1201.6 | 1201.6 | 0 |
| objdiff | sandbox | 3 | 1222.3 | 1262.5 | 1262.5 | 0 |
| other:cp | sandbox | 1 | 297.1 | 297.1 | 297.1 | 0 |
| other:rm | sandbox | 2 | 302.8 | 305.7 | 305.7 | 0 |
| provision_checkout | sandbox | 1 | 513.2 | 513.2 | 513.2 | 0 |
| provision_git | sandbox | 2 | 305.9 | 2604.3 | 2604.3 | 0 |
| provision_link | sandbox | 2 | 299.5 | 304.3 | 304.3 | 0 |
| provision_verify | sandbox | 1 | 304.8 | 304.8 | 304.8 | 0 |
| python_inline | sandbox | 2 | 305 | 420.7 | 420.7 | 0 |
| python:check-changed-symbol-order.py | sandbox | 1 | 619.6 | 619.6 | 619.6 | 0 |
| qa_diff | sandbox | 2 | 301.3 | 304.2 | 304.2 | 0 |
| qa_lint | sandbox | 1 | 1069.5 | 1069.5 | 1069.5 | 1 |
| qa_probe | sandbox | 1 | 304.6 | 304.6 | 304.6 | 0 |
| read_source | sandbox | 2 | 684 | 2443.4 | 2443.4 | 0 |
| shell | sandbox | 5 | 308.1 | 319.5 | 319.5 | 1 |
| source_query | sandbox | 1 | 477.9 | 477.9 | 477.9 | 0 |
| stack_check | sandbox | 3 | 869.7 | 921.4 | 921.4 | 0 |
| symbol_baseline | sandbox | 1 | 303.5 | 303.5 | 303.5 | 0 |
| test | sandbox | 2 | 299.9 | 302.2 | 302.2 | 0 |
| undefined_symbols | sandbox | 2 | 369.1 | 373.2 | 373.2 | 0 |
| upload_via_exec | sandbox | 2 | 303 | 305.6 | 305.6 | 0 |

Required-step coverage: 1 attempt sandboxes; missing {"steering_edits":1,"steering_reduce":1,"steering_mwcc":1,"steering_decide":1}.

### Host processes spawned (placement evidence)

| role:step | n | p50 ms | p95 ms | cpu ms total | example |
| --- | --- | --- | --- | --- | --- |
| orchestrator:git_merge-base | 1 | 55.7 | 55.7 | 38.1 | git merge-base --is-ancestor a5778b1f154da5b67349f274cc52112f9bd13d14 |
| orchestrator:git_update-ref | 2 | 34.2 | 37.8 | 65.8 | git update-ref refs/decomp-orchestrator/sandbox-seeds/b430bd8e-1bf0-44e3-afb2-139f7ea0700a ff7baf7bc1f69c99be114188dc8ffccfbfc89695 |
| orchestrator:git_-c | 1 | 796.8 | 796.8 | 738.9 | git -c pack.threads=1 bundle |
| orchestrator:worker_child | 1 | 31009.2 | 31009.2 | 1798.3 | bun /Users/Ford/workspace/codebases/harnesses/gamecube-decomp-harness/objectives/worker-compiler-loop/scale/worker-child.ts --game sms |

### Daytona API

| op | calls | errors | 429 | p50 ms | p95 ms |
| --- | --- | --- | --- | --- | --- |
| sandbox.create | 1 | 0 | 0 | 933.5 | 933.5 |
| session.create | 2 | 0 | 0 | 340.5 | 367.6 |
| session.exec | 53 | 0 | 0 | 314.2 | 2061.5 |
| fs.upload | 6 | 0 | 0 | 257.7 | 2206.1 |
| fs.download | 9 | 0 | 0 | 267.7 | 386.6 |
| sandbox.get | 2 | 0 | 0 | 91.6 | 110.6 |
| sandbox.delete | 1 | 0 | 0 | 928.7 | 928.7 |

Sandboxes: {"created":1,"create_failures":0,"deleted":1,"create_ms":{"n":1,"p50":933.6,"p95":933.6,"max":933.6},"delete_ms":{"n":1,"p50":928.9,"p95":928.9,"max":928.9},"by_purpose":{"worker":1},"build_sandboxes":0,"build_sandboxes_per_attempt":0}

Create admission (cumulative in this process): {"concurrency":1,"admitted":1,"queued":0,"quotaRefusals":0,"rateRefusals":0,"timeouts":0,"maxQueued":0,"holds":0,"holdsReleased":0,"holdsExpired":0}

### Attempts

| kind | attempts | ok | verdicts | p50 s | p95 s |
| --- | --- | --- | --- | --- | --- |
| clean_fix | 1 | 1 | {"stack_only_perturbation/no_gate":1} | 30.9 | 30.9 |

### Phases

| phase | n | p50 ms | p95 ms | max ms | failed |
| --- | --- | --- | --- | --- | --- |
| provision | 1 | 11082.1 | 11082.1 | 11082.1 | 0 |
| tool:native_decisions | 1 | 1823.8 | 1823.8 | 1823.8 | 0 |
| canned_edit | 1 | 384.2 | 384.2 | 384.2 | 0 |
| tool:compare_sources | 1 | 2660.7 | 2660.7 | 2660.7 | 0 |
| agent_turn | 1 | 4869.5 | 4869.5 | 4869.5 | 0 |
| child_import | 1 | 426 | 426 | 426 | 0 |

Provision seed kinds (thin = ^baked bundle, full = whole history): {"full":1}

Native measurements (ok = nested status ok with its schema): {"native_decisions":{"calls":1,"ok":1,"failed":0,"by_reason":{}},"compare_sources":{"calls":1,"ok":1,"failed":0,"by_reason":{}}}

Host: {"worker_children":1,"worker_peak_rss_mb":{"n":1,"p50":209.5,"p95":209.5,"max":209.5},"worker_cpu_seconds":{"n":1,"p50":1.8,"p95":1.8,"max":1.8},"orchestrator_peak_rss_mb":201.7,"orchestrator_cpu_seconds":1.3,"peak_total_rss_gb":0.4,"peak_concurrent_worker_children":1}

SQLite: {"waits_over_5ms":0,"busy_errors":0,"wait_ms":{"n":0,"p50":null,"p95":null,"max":null},"by_role":{}}

Integration: {"drains":0,"processed":0,"drain_ms_total":0,"per_item_ms":null,"items_per_minute":null}

### Failures by kind

None.
