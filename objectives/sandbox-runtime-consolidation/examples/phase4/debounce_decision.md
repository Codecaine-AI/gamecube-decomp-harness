# Sandbox sleep debounce decision

## Method

The decision uses recorded-session replay over 53 complete sweep sessions' `merged_tool_bursts`, parameterized by a live 10-cycle stop/start benchmark on `melee-sandbox-poc-20260818-trimmed`. This replaced per-candidate live claims; the method deviation is recorded in the objective's `current_state.md`.

The live measurements come from `sleep_latency_bench.json`:

| Measurement | Median |
| --- | ---: |
| Stop complete | 1,014 ms |
| Start complete | 561 ms |
| Start to first exec | 1,022 ms |

The replay used 1,014 ms stop latency and 1,022 ms wake latency. Results below are for the complete-session cohort in `debounce_replay_results.json`.

| Debounce T | Savings vs always-run | Added wall | Wakes/session | Billed vs always-run |
| ---: | ---: | ---: | ---: | ---: |
| 0 ms | 73.25% | 8.34% | 36.36 | 26.75% |
| 100 ms | 72.41% | 8.34% | 36.36 | 27.59% |
| 250 ms | 71.16% | 8.34% | 36.36 | 28.84% |
| 500 ms | 69.06% | 8.34% | 36.36 | 30.94% |
| 1,000 ms | 64.87% | 8.33% | 36.35 | 35.13% |
| 2,000 ms | 56.94% | 8.00% | 34.91 | 43.06% |
| 3,000 ms | 50.07% | 7.17% | 31.29 | 49.93% |

The 1,945 inter-burst gaps have a minimum of 1.968 s and p1 of 2.464 s. No gaps are under 1 s, and only one is under 2 s.

## Decision

Set the default debounce to **250 ms**. Recorded inter-burst gaps never undercut 250 ms, so it has no wake-count loss versus T=0.

The debounce also protects activity the replay cannot see: sequential `SandboxHandle` calls within one tool, such as exec followed by readFile, with milliseconds of host processing between awaited calls. At T=0, a roughly 1 s stop can begin mid-tool and force the next call to wait for stop plus start, adding about 1.6 s.

This protection costs 2.1 percentage points of modeled savings, from 73.25% to 71.16%. The resulting billed cost is approximately 28.8% of always-run, inside the phase-5 gate of at most 30%, with the noted target headroom of approximately 11–27%.
