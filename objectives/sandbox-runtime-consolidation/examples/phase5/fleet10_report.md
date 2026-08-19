# Phase 5: Fleet-10 Validation Report

Measured on 2026-08-19, this validation exercised stop-while-thinking under a real concurrent worker fleet rather than a synthetic duty cycle. The run used disposable state at `/tmp/sleep-validation-state`, run `0966f77f`, a trimmed snapshot, and ten 2 vCPU / 4 GiB / 5 GiB sandboxes priced at $0.1656/hour. Sleep was active behind the 250 ms idle debounce.

The fleet ignited ten workers cleanly. Eight claims succeeded. Three claims reached the 3,600-second agent timeout at approximately 20:56Z, closed through the routine path, and returned to `waiting`. This was expected behavior: `--max-iterations` capped the validation session, so those requeued claims were not claimed again. Cost results below therefore use the eight succeeded claims and do not treat the three unfinished tail claims as completed cost samples.

## Cost result

The like-for-like comparison in `fleet10_cost_report.json` charges the same eight claims under measured sleeping behavior and an always-running counterfactual. Sleeping reduced their bill from $0.8516 to $0.2558, or 30.0% of always-run cost. The recorded-session replay predicted 28.8%, so the model tracked the measured fleet result closely.

| Measure | Fleet-10 result |
| --- | ---: |
| Succeeded claims | 8 |
| Total sandbox lifetime | 18,513.6 s |
| Time stopped | 5,748.1 s |
| Billed, sleep active | $0.2558 |
| Billed, always running | $0.8516 |
| Cost ratio / savings | 30.0% / 70.0% |
| Mean billed per claim | $0.0320 |
| Wake count | 766 total (~96/claim) |

The phase gate—measured cost at or below approximately 30% of the always-run baseline per claim—passes at 30.0% like-for-like. Mean billed cost was 0.395× the sweep's $0.081-per-claim always-run baseline even though mean lifetime was longer here: 1,851 seconds versus 1,756 seconds in the sweep.

The aspirational approximately 11% target was not reached. Several completed claims were long and tool-dense, which shortened the stoppable share and produced many wakes. The three timed-out tail claims are excluded because they did not complete. The authoritative per-claim distribution, including those differences, is in `fleet10_cost_report.json`.

## Close and teardown behavior

With a live consumer, settlement-driven deletes landed 2–7 seconds after worker close across the ten closes. The raw paired delays were 4, 2, 2, 3, 3, 7, 3, 4, and 3 seconds. Claims whose consumer had already exited were instead collected by reconciliation. After the run, the reconciliation sweep deleted the final `STOPPED` sandbox and the provider's remote sandbox list was empty: zero orphans remained.

Across the full validation day, every implemented teardown path was proven live: settlement deletion in 2–7 seconds, `provision_failure`, and reconciliation, including reconciliation of `STOPPED` sandboxes. The TTL path remains implemented as the final backstop but was not exercised in this validation.

## Host footprint and scaling read

The 62-minute footprint window combines `fleet10_footprint.jsonl`, `footprint-summary.py`, and one manual mid-run process snapshot. Host CPU, memory, and interface traffic are machine-wide figures from an already heavily loaded host; load average was approximately 15–19 before the fleet started. They are upper bounds, not fleet attribution.

| Footprint | Observation |
| --- | --- |
| Machine-wide CPU | 54.6% mean; 85.2% max |
| Machine-wide used memory | ~93.6 GB |
| Fleet processes, manual snapshot | 12 Bun processes; ~4.6 GB RSS; ~47% of one core |
| Worker children | 450–700 MB RSS each; 0.2–8% CPU each |
| TCP connections | 58 |
| Sandbox state samples | 8–9 of 10 `STOPPED` during thinking |
| Default-interface network | 3,224 MB in / 495 MB out; 6.9 / 1.1 Mbps mean |

RAM is the binding host dimension. At roughly 0.5–0.7 GB per worker child, 32 workers imply approximately 16–22 GB of worker-process memory. CPU and network were not constraints at fleet ten, even against the busy-host background.

The detached sampler logged empty per-process fields because of a `ps` parsing gap. The manual mid-run snapshot is therefore the source for process count, RSS, per-worker CPU, and TCP connection observations. Machine-wide time-series fields remain usable.

## Known issues

The report script's close-to-delete join can duplicate rows when a claim is requeued; this is cosmetic and does not change the raw event timing. A knowledge clone also hit `ModuleNotFoundError` for `pr_index` under the cloned knowledge root. That failure was non-fatal and confined to the decoupled knowledge lane.

Phase 5 validates the production shape: the 250 ms operation-gate debounce preserves tool sequences, sleeping cuts like-for-like sandbox cost by 70.0%, teardown converges to zero remote sandboxes, and host scaling is governed primarily by worker-child memory rather than sandbox CPU or network demand.
