# Phase 3 Live-PoC Report

## Overview

The phase 3 live proof of concept passed its execution gate. A real worker claim ran end to end in a Daytona sandbox, produced runner-validated evidence, banked an official score improvement, applied that improvement to the disposable working tree, and settled the sandbox. A local-execution control run exercised the same target and evidence contract. A separate failure drill showed that loss of a live sandbox closes the claim fail-safe, requeues the job, and provisions a fresh sandbox for the retry.

All runs used the disposable state directory `/tmp/melee-sandbox-poc-state`, including its `orchestrator.sqlite`, and the disposable repository `/tmp/melee-acceptance/melee` with a private `graph.sqlite` copy. Production state and the production dashboard were untouched. Sandbox runs used snapshot `melee-sandbox-poc-20260818` with 2 vCPU, 4 GiB memory, and 10 GiB disk.

## Run inventory

| Run | Execution | Primary identifiers | Result |
| --- | --- | --- | --- |
| `b0f0beb6-7645-420a-ad31-6a87de2c16b9` | Daytona sandbox | Job `job-9ad03c95-919f-45f4-ba37-125a4ec4bcaa`; claim `9e1ac164-eba4-48dc-8499-9d2792ad4f4c`; sandbox `2be32e51-9f73-4be9-bf31-912c5d864803` | Provisioning shakeout exposed two defects. The remote pre-worker baseline build and objdiff scoring still crossed the host/remote seams successfully and recorded `99.65522`. The orphaned sandbox was reconciled on the next run-loop startup. |
| `0b662f7a-951f-45f3-b93b-ef1fe7194427` | Daytona sandbox | Job `job-3cd82994-f08a-4c9f-9b64-da3eba244b01`; claim `ae525729-6aa6-4959-be18-61d1bd8bca04`; sandbox `fc08e157-7bba-4293-af85-838ed227168e` | End-to-end claim passed after one runner-requested repair cycle. Checkpoint `b8517a4c-0f20-41d5-8bcd-cb70111e1de9` improved `99.65522` to `99.72665`; integration was applied and settlement deleted the sandbox. |
| `23b77d33-d279-4041-9834-12dc623b3dba` | Local worker | Job `job-ce61741c-dcb2-4217-bee5-291916b63a6d`; claim `d5259fab-ff37-4949-91c4-e1dafdddbb29` | Parity control passed in one cycle. Checkpoint `26d57eb3-fd9a-46a0-bb35-a796b2daac1a` improved `99.65522` to `99.68132` with the same evidence contract. |
| `1e74f937-117e-429a-8ab6-96e6099ce712` | Daytona sandbox failure drill | Job `job-965f0ce7-d041-43f4-ac42-08f3ae3d4d5f`; claim `a23c7748-eecb-42e9-b8e2-ba5b8b076a84`; sandboxes `710eaff1-4f29-418b-9126-27a418df2663`, then `2f5e3727-1341-4035-bb03-0a02b4db03ec` | External sandbox deletion was detected, the claim failed closed, and attempt 2 resumed in a fresh sandbox. The drill was then deliberately cancelled; cleanup left the remote sandbox list empty. |

## The end-to-end sandbox claim

Run `0b662f7a-951f-45f3-b93b-ef1fe7194427` is the gate claim. It targeted `main/melee/gr/grbigblue::grBigBlue_801E93D8`. The worker job was enqueued at `2026-08-19T00:53:14.073Z`, the claim opened at `00:53:22.784Z`, and `sandbox.created` recorded sandbox `fc08e157-7bba-4293-af85-838ed227168e` at `00:53:26.878Z` with the expected snapshot and resource class.

The real agent session took two cycles. Cycle 0 produced checkpoint `6bbcff80-9d07-4738-ac56-f6a8f7289cce`; runner validation rejected it as `no_official_score_change` at `99.65522`. The runner requested repair rather than accepting or terminating the session. Cycle 1 produced checkpoint `b8517a4c-0f20-41d5-8bcd-cb70111e1de9`, passed validation, and banked an improvement from `99.65522` to `99.72665` (`+0.07143`).

Evidence was downloaded from the sandbox after each attempt into the host artifact directory:

`/tmp/melee-sandbox-poc-state/runs/0b662f7a-951f-45f3-b93b-ef1fe7194427/worker_state/ea07aad8-52c4-42a3-9b0d-1a0de676bfd3/runner_validation/`

That directory contains `attempt-0.write_set.diff`, `attempt-1.write_set.diff`, and the corresponding runner-validation summaries and QA patch evidence. The selected attempt's integration outcome is `applied/clean_apply`; it modified `src/melee/gr/grbigblue.c` in the disposable working tree. The integration job `job-8232b9d2-f2ed-4393-a1f5-26efe0c8a910` and knowledge-absorption job `job-d38899c9-5585-4aac-b0d4-5c2adee006e7` both succeeded.

All command execution and file I/O for the worker claim occurred remotely. The sandbox was deleted at `2026-08-19T01:04:18.660Z`; the `sandbox.deleted` event recorded reason `settlement`. The post-run remote orphan sweep found zero sandboxes.

## Parity comparison

| Property | Daytona run `0b662f7a…` | Local run `23b77d33…` |
| --- | --- | --- |
| Target and baseline | `main/melee/gr/grbigblue::grBigBlue_801E93D8`, `99.65522` | Same target, `99.65522` |
| Agent cycles | Two: attempt 0 rejected for no official score change; attempt 1 passed | One: attempt 0 passed |
| Banked checkpoint | `b8517a4c-0f20-41d5-8bcd-cb70111e1de9`, `99.72665` | `26d57eb3-fd9a-46a0-bb35-a796b2daac1a`, `99.68132` |
| Evidence contract | Per-attempt host copy under `runner_validation/attempt-*.write_set.diff` | Same; `runner_validation/attempt-0.write_set.diff` |
| Integration | `applied/clean_apply`; integration job succeeded | Integration job succeeded; the recorded apply outcome was `conflict/apply_check_failed` because the shared disposable tree already contained Run 2's applied edit |
| Build identity | Daytona object matched the shipped and container objects | Fresh host Wine rebuild SHA-256 `df6bb9cb…` matched shipped, container, and Daytona objects |

The parity verdict is that local and sandbox workers use the same claim mechanism, runner-validation evidence, checkpoint selection, and integration contract. The different final scores reflect independent agent explorations, not an execution-surface difference. The Run 3 apply-check conflict is ordering contamination in the shared disposable tree after Run 2, not a divergence in worker or evidence behavior.

## Failure drill

Run `1e74f937-117e-429a-8ab6-96e6099ce712` tested sandbox death during an active claim. The first sandbox, `710eaff1-4f29-418b-9126-27a418df2663`, was created at `2026-08-19T01:21:54.079Z` and externally deleted at `01:23:16Z` while the agent session was mid-claim.

The orchestrator observed the loss and failed safe: it closed the claim with an error, released the worker job back to the queue with backoff, and incremented the job attempt count. Attempt 2 provisioned fresh sandbox `2f5e3727-1341-4035-bb03-0a02b4db03ec` at `01:24:38.833Z` and resumed work rather than treating the interrupted attempt as a success.

After that recovery behavior was observed, the drill was terminated deliberately. The job was cancelled, the replacement sandbox was deleted, and the test run was marked failed. The final Daytona sandbox list was empty. This establishes both the recovery path and the cleanup invariant without claiming successful work from the interrupted session.

## Defects found live

Run 1 exposed two provisioning defects and verified their fixes in the subsequent successful run.

First, Daytona rejects a `resources` field when creation is based on a snapshot. The sandbox provider was changed to omit `resources` for snapshot-based creation; the fix is present in commit history as `omit resources on snapshot-based sandbox creation`.

Second, the host Pi session inherited `/opt/melee`, an in-sandbox repository path, as its host current working directory. That failed with `EACCES`. Host-side session work now uses the safe directory `<artifact_dir>/host-cwd`.

Run 1's sandbox `2be32e51-9f73-4be9-bf31-912c5d864803` outlived the failed attempt. At the next run-loop startup, reconciliation swept it; `sandbox.deleted` was recorded at `2026-08-19T00:50:46.352Z` with reason `reconciliation`. Before the host-session failure, the remote baseline build and objdiff score had succeeded through the execution and transfer seams, recording the expected `99.65522` baseline.

## Open items

These items do not block the phase 3 gate:

1. The checkdiff tool-slot path `/opt/.worker-tool-slots` leaks a host/remote path assumption. The tool degraded gracefully during the claim, but the path should be made execution-surface aware.
2. Under a state-directory override, the knowledge librarian still references the production ledger path. The PoC observed zero appends to that ledger; the override should nevertheless propagate consistently before fleet rollout.
3. Epoch-boundary report generation remains host-side. It failed while the disposable repository was configured for container builds and worked after a Wine reconfiguration. Production repositories are always host-configured, so this was specific to the PoC setup.
4. `execution_class` has no operator selector. Jobs are enqueued as `local` at `epochs.ts:500`; the PoC used a SQL flip to select sandbox execution. Fleet rollout requires a supported selector.

Gate verdict: **pass**. The live sandbox claim, local parity control, remote byte-identity check, settlement cleanup, reconciliation cleanup, and sandbox-death recovery behavior were all demonstrated against disposable state without touching production state or the production dashboard.
