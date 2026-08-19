# Problem

## Where this comes from

The daytona-sandbox-execution objective (complete 2026-08-18, all four gates PASS) moved worker
command execution and workspaces into per-claim Daytona sandboxes: host agent + remote exec,
image + git-bundle seeds, per-attempt evidence download, settlement/reap/reconciliation teardown.
An operator-directed scale sweep followed on 2026-08-19 (rungs N=5/10/32, the 32-wide rung on
gpt-5.6-terra) — full record in objectives/daytona-sandbox-execution/examples/scale/.

## Measurements that motivate this objective

- ~90% of worker-session wall time is model thinking; tool bursts average 1.2 s
  (thinking_time_analysis.md, 53 complete sessions). Always-run sandboxes bill $0.166/h
  (2 vCPU / 4 GiB; disk within free tier) — so ~89% of sandbox spend buys idle time.
- Stopped sandboxes bill reserved disk only (free at our 5 GiB) => stopping during model turns
  is effectively free. Measured stop->start-to-first-exec latency: 0.78–0.86 s.
- Claim-length distribution was flat across 1/5/10/32-wide — no contention on Daytona, codex-lb,
  or the shared compile jobserver. The scaling limit found was HOST-side (below).

## Live defects found in the sweep (both bounded only by the platform TTL backstop)

1. Job settlement queues behind serialized knowledge-librarian condensation in the run loop, and
   one hung librarian LLM call blocked settlement for >25 min. Finished workers' sandboxes sat
   alive until the 90-min TTL destroyed them.
2. Zombie claims: the consumer keeps heartbeating a job lease after its worker child dies (seen
   after host sleep), so the lease never expires and reap never fires.

## Operator rulings (2026-08-19, recorded in docs/40-new-features/20-stop-while-thinking/)

1. Sandbox is the ONLY supported worker runtime; the local worker path is removed outright.
2. The sandbox is a transient CPU box: killed at worker close, never held through settlement or
   knowledge processing.
3. Knowledge/librarian is a host-side agent lane, decoupled from settlement/teardown, with an
   LLM-call timeout. It needs no sandbox tools (graph/ledger reads + file writes).
4. Worker tool-concurrency limits, slot mechanisms, and their settings UI are removed — each
   agent has an isolated runtime; no cross-agent tool contention exists.
5. Run-and-sleep: stopped during model turns, woken by tool calls. (Supersedes the 2026-08-18
   run-scoped execution-class ruling; with one class there is no selector.)

## Design authority

docs/40-new-features/20-stop-while-thinking/doc.json holds the full design narrative (lifecycle,
placement map, billing semantics, race/debounce considerations, open questions). This objective
implements it. The prior objective's context files remain the reference for the shipped seams.
