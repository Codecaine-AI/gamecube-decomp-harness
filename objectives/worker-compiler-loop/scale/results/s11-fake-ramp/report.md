# Load test s11-fake-ramp

- Mode: dry-run (fake Daytona)
- Window: 2026-10-17T17:41:31.899Z to 2026-10-17T17:41:36.872Z
- Cost guard: {"limits":{"maxAlive":210,"maxSandboxMinutes":100000,"allowBuildSandboxes":false},"created":11,"created_by_purpose":{"worker":11},"alive":10,"peak_alive":10,"sandbox_minutes":0.633,"refused_creates":0,"build_creates_refused":0,"tripped":"received SIGTERM"}
- Kill switch: []
- Fake Daytona: peak alive 10, created 11, alive at end 10

## Ramp

| concurrency | attempts ok/total | wall s | attempt p50/p95 s | provision p50/p95 ms | API calls | API calls/attempt | 429 | build sandboxes | placement failures | toolpack re-syncs | worker RSS p50/max MB | peak total RSS GB | sqlite waits >5ms (max ms) | integration items/min |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | 0/0 | 3.75 | null/null | 657.3/1047.8 | 147 |  | 0 | 0 | 0 | 0 | 95.7/126.2 | 1.26 | 0 (0) |  |

## Step 10

Jobs {"failed":10}; integration outcomes {}; kinds {"clean_fix":3,"steering":3,"unverified_repair":2,"evidence_review":2}.

### Step latency and placement

| step | placement | n | p50 ms | p95 ms | max ms | non-zero exit |
| --- | --- | --- | --- | --- | --- | --- |
| git_rev_parse | sandbox | 2 | 6.7 | 7.4 | 7.4 | 0 |
| mkdir | sandbox | 12 | 3.2 | 8.9 | 8.9 | 0 |
| provision_checkout | sandbox | 10 | 15.5 | 18.3 | 18.3 | 0 |
| provision_git | sandbox | 20 | 13.5 | 15.7 | 17.6 | 0 |
| provision_link | sandbox | 10 | 4 | 8 | 8 | 0 |
| provision_verify | sandbox | 10 | 18 | 36.9 | 36.9 | 0 |
| shell | sandbox | 10 | 9.6 | 28 | 28 | 0 |

Required-step coverage: 0 attempt sandboxes; missing {}.

### Host processes spawned (placement evidence)

| role:step | n | p50 ms | p95 ms | cpu ms total | example |
| --- | --- | --- | --- | --- | --- |
| orchestrator:git_show | 2 | 43 | 86.5 | 83.4 | git show 81248bdac58da1ff74128ba8c3a3798372fa5371:src/Enemy/igaiga.cpp |
| orchestrator:git_merge-base | 10 | 68.3 | 86 | 440.4 | git merge-base --is-ancestor 3b83dd4611ff59dcfdb521c11d780716aa25a124 |
| orchestrator:git_rev_parse | 2 | 49 | 76 | 80.2 | git rev-parse --verify --quiet |
| orchestrator:other:bun | 1 | 4364.4 | 4364.4 | 100.9 | bun /Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop/objectives/worker-compiler-loop/scale/fake-daytona-server.ts --port-file /var/folders/hd/5sskjbf10bl2v1tx3jsvg_200000gn/T/scale-load-test/s11-fake-ramp/fake-daytona.port |
| orchestrator:worker_child | 10 | 2587.9 | 2671.4 | 8011.1 | bun /Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop/objectives/worker-compiler-loop/scale/worker-child.ts --game sms |

### Daytona API

| op | calls | errors | 429 | p50 ms | p95 ms |
| --- | --- | --- | --- | --- | --- |
| sandbox.create | 10 | 0 | 0 | 30.6 | 33 |
| session.create | 10 | 0 | 0 | 2.2 | 4.4 |
| session.exec | 74 | 0 | 0 | 12.5 | 25 |
| fs.upload | 32 | 0 | 0 | 5.5 | 57.2 |
| fs.download | 20 | 0 | 0 | 2.2 | 15.5 |
| sandbox.list | 1 | 1 | 0 | 0.5 | 0.5 |

Sandboxes: {"created":10,"create_failures":0,"deleted":0,"create_ms":{"n":10,"p50":30.8,"p95":33.1,"max":33.1},"delete_ms":{"n":0,"p50":null,"p95":null,"max":null},"by_purpose":{"worker":10},"build_sandboxes":0,"build_sandboxes_per_attempt":null}

Create admission (cumulative in this process): {"concurrency":10,"admitted":11,"queued":0,"quotaRefusals":0,"rateRefusals":0,"timeouts":0,"maxQueued":0}

### Attempts

| kind | attempts | ok | verdicts | p50 s | p95 s |
| --- | --- | --- | --- | --- | --- |

### Phases

| phase | n | p50 ms | p95 ms | max ms | failed |
| --- | --- | --- | --- | --- | --- |
| provision | 10 | 657.3 | 1047.8 | 1047.8 | 0 |

Provision seed kinds (thin = ^baked bundle, full = whole history): {"thin":10}

Host: {"worker_children":10,"worker_peak_rss_mb":{"n":10,"p50":95.7,"p95":126.2,"max":126.2},"worker_cpu_seconds":{"n":10,"p50":0.7,"p95":0.8,"max":0.8},"orchestrator_peak_rss_mb":292.2,"orchestrator_cpu_seconds":1.3,"peak_total_rss_gb":1.26,"peak_concurrent_worker_children":10}

SQLite: {"waits_over_5ms":0,"busy_errors":0,"wait_ms":{"n":0,"p50":null,"p95":null,"max":null},"by_role":{}}

Integration: {"drains":0,"processed":0,"drain_ms_total":0,"per_item_ms":null,"items_per_minute":null}

### Failures by kind

| kind | count | examples |
| --- | --- | --- |
| worker_job | 10 | Unknown local process handle: eba67743-eb5e-4f97-b212-1c279d490235 / Unknown local process handle: 246163d5-dafd-4b52-b7ab-86d224bf82bd / Unknown local process handle: 39cbf575-04be-4e88-a058-1513c13f494e |
