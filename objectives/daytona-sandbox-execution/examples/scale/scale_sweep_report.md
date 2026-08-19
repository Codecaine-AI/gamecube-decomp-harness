# Parallel-worker scale and cost sweep

**Operator-directed experiment, 2026-08-19.** This sweep followed the completed sandbox-execution objective and tested whether the all-sandbox worker path could scale from 5 to 32 concurrent claims without introducing provider, quota, compile, or teardown contention. The result was positive at the infrastructure layer: Daytona provisioned the full 32-worker fleet cleanly, claim durations did not worsen with width, and the shared compile jobserver did not saturate. The limiting behavior was instead in the host run loop, where serialized knowledge-librarian condensation blocked final job settlement after workers had finished.

The observed always-running cost was approximately **$0.08–$0.09 per claim** at real claim lengths. A 32-sandbox fleet reserves approximately **$5.30 per hot hour**. The companion [thinking-time analysis](./thinking_time_analysis.md) found that about 90% of worker-session time is model-idle; stopping sandboxes while the model thinks is projected to reduce sandbox cost by about 89% for about 7.8% additional wall time. That optimization was ruled as the next task and was not part of this sweep.

## Experimental setup

The sweep used a disposable orchestrator state directory and the trimmed `melee-sandbox-poc-20260818-trimmed` snapshot. The snapshot image was 1.05 GB. Every claim ran in a Daytona sandbox with 2 vCPU, 4 GiB RAM, and 5 GiB storage. Storage was free at that allocation. The rate card was $0.000014 per vCPU-second and $0.0000045 per GiB-second of RAM, yielding:

`(2 × $0.000014 + 4 × $0.0000045) × 3,600 = $0.1656`, or **$0.166 per running sandbox-hour**.

All runs used sandbox execution for every worker, following the operator's run-scoped execution-class ruling. Because the run-level selector is not yet exposed, the experiment applied the setting with a SQL flip. After the N=5 host-sleep incident, the host loop was kept caffeinated for the remaining rungs.

## Rung results

| Rung | Run / model | Concurrency and outcome | Claim or sandbox lifetime | Usage and cost | Checkpoints / improvements |
|---:|---|---|---|---|---|
| 5 | `65be0e90` / `gpt-5.6-sol` | True 5-wide start; 4/5 claims settled cleanly in about 52 min. One claim was lost when overnight host sleep killed its child process. | Clean lifetimes: 462, 380, 2,698, and 3,117 s. The lost claim's sandbox was capped at 90 min by platform TTL. | About 3.35 sandbox-h; **about $0.55**. | 15 checkpoints. |
| 10 | `f13977f9` / `gpt-5.6-sol` | Clean sweep: 10/10 settled in 42 min wall time. All teardown matched settlement 1:1; zero quota errors at 20 vCPU. | 392–2,503 s; median about 1,908 s. | 4.88 sandbox-h; **$0.81 total, $0.081/claim**. | 4 targets improved. |
| 32 | `d134d110` / `gpt-5.6-terra` | Full 32-wide ignition at about 64 vCPU; all sandboxes were up within about 2.5 min. Zero quota or provider errors. 30/32 settled cleanly. The final two workers finished, but their jobs did not settle before operator force-close. | Clean settlements: min 379 s, median 1,733 s, max 2,705 s. The final two sandboxes reached the 90-min TTL. | Clean portion: 14.17 sandbox-h, **$2.35**. TTL tail: 3.0 sandbox-h, **about $0.50**. **Rung total: about $2.85**. | 118 checkpoints; 4 targets passed improvement. |

Run creation timestamps from the orchestrator state were `2026-08-19T02:33:16.427Z` for N=5, `2026-08-19T13:40:59.861Z` for N=10, and `2026-08-19T14:23:48.847Z` for N=32.

The N=5 failure was not a sandbox leak. Host sleep killed the executor's child while the executor continued lease heartbeats, leaving a zombie claim. Daytona's 90-minute platform TTL destroyed the sandbox and bounded the incident cost.

At N=32, the two exceptional claims were also not worker failures. Both reached `FINISHED` at the worker level through routine timeout closure. Their job settlement then waited behind the run loop's serialized knowledge-librarian condensation. A single librarian LLM call hung for more than 25 minutes, so the loop never advanced to settle those jobs or perform normal teardown. The platform TTL destroyed both sandboxes at 90 minutes, and the operator session force-closed the remaining jobs.

## Cost summary

| Measure | Observed or derived cost |
|---|---:|
| One running 2-vCPU / 4-GiB sandbox | $0.1656/h, rounded to **$0.166/h** |
| N=5 rung | **about $0.55** |
| N=10 rung | **$0.81 total; $0.081/claim** |
| N=32 cleanly settled portion | **$2.35** |
| N=32 TTL tail for two sandboxes | **about $0.50** |
| N=32 rung total | **about $2.85** |
| Real-length, always-running claim | **about $0.08–$0.09/claim** |
| 32-sandbox fleet held hot | **about $5.30/h** |
| Projected stop-while-thinking result | **about 89% lower sandbox cost; about 7.8% wall-time overhead** |

The rung totals include incident time where stated and therefore answer the operator-cost question, not just the productive-worker-cost question. In particular, the N=32 total includes the additional 3.0 sandbox-hours imposed by the stalled settlement path. The TTL converted what otherwise had no host-side bound into an approximately $0.50 tail.

## Scaling behavior

Claim-length distributions were effectively unchanged across the 1-, 5-, 10-, and 32-worker observations. There was no evidence of contention in Daytona provisioning, `codex-lb`, or the shared 10-slot compile jobserver. Tool bursts averaged about 1.2 seconds, so compile requests were brief enough that the FIFO never saturated. Sandbox provisioning parallelized cleanly: even the 32-wide fleet was fully running within about 2.5 minutes.

When the run loop remained healthy, teardown tracked job settlement 1:1. The N=10 clean sweep demonstrated this across all ten claims. The N=32 tail demonstrated the inverse: when settlement stopped behind librarian work, normal teardown stopped with it even though the workers themselves had finished. Infrastructure capacity was therefore not the limiting factor at 32-wide; host orchestration was.

## Fleet findings and required follow-up

1. **Remove librarian condensation from the job-settlement critical path.** Job completion and teardown must not wait behind serialized knowledge condensation. Decouple or parallelize condensation, and enforce an LLM-call timeout. One hung call blocked settlement indefinitely at N=32.

2. **Make lease heartbeats verify child liveness.** After host sleep at N=5, the executor lost its worker child but continued heartbeating the lease. A heartbeat must not preserve a claim whose child process is gone.

3. **Retain the 90-minute platform TTL backstop.** Decision 7 was exercised in both incident modes: the host-sleep zombie and the N=32 settlement stall. It capped cost and left zero orphaned sandboxes.

4. **Add the run-level `execution_class` selector.** This experiment required an SQL flip to enforce the operator's all-sandbox ruling. The selection belongs in normal run configuration.

5. **Make the shared compile jobserver class-aware before larger fleets.** It was not a bottleneck at 32 workers, but larger or more compile-heavy fleets should not depend on a single undifferentiated queue.

## Conclusion

The sandbox worker plane scaled cleanly to 32 concurrent claims and approximately 64 vCPU. Provisioning, provider capacity, and compilation remained healthy, with no quota errors and no measurable widening of claim duration. The sweep's capacity limit was the serialized host settlement path, not Daytona.

At the tested allocation and real claim lengths, always-running sandboxes cost about $0.08–$0.09 per claim. That is acceptable for the demonstrated scale, but keeping 32 sandboxes hot costs about $5.30 per hour. The measured model-idle fraction makes stop-while-thinking the highest-leverage cost follow-up, while settlement decoupling and child-liveness heartbeats are the highest-priority correctness fixes.
