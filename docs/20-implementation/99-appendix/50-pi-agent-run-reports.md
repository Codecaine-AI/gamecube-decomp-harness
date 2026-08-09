---
concepts: [run-reports, tool-analysis, kill-threshold, runner-validation, lift, experiments]
---

# Pi Agent Run Reports

How to build and evaluate the Pi worker run-analysis reports (outcomes, durations, tool effectiveness).

The run report (e.g. `reports/pi-agent-tool-analysis-2026-06-12.html`) answers
three questions about a sweep: what outcomes did leases actually confirm, how
long did confirmed work take, and which tools correlate with success. It is the
evaluation instrument for worker-side experiments (tool surface changes, kill
thresholds, prompt changes).

## Data sources

Everything is joined per **lease** (repair sessions are summed into their
lease):

| Source | Provides |
| --- | --- |
| `projects/melee/state/orchestrator.sqlite` → `events` | Canonical outcome per lease: latest terminal `worker_*`, `needs_fact`, or `score_candidate` event, with `runner_validation` (the canonical gate) and `qaLint` payloads |
| `orchestrator.sqlite` → `pi_sessions` | Session → lease mapping, transcript file path, thinking level |
| `.pi-sessions/worker/*.jsonl` | Wall-clock duration (first→last timestamp), per-tool call counts (assistant `toolCall` blocks), advertised tool set (parsed from the `<available_tools>` block in the initial user prompt) |

"Confirmed" always means **runner-owned validation passed** (`result`
exact/improved + `rv_status: passed`), never the worker's local claim.

## Generator Status

The old report generator lived in root `scripts/` and was retired when
orchestration moved behind the server job/API surface. Treat existing reports as
historical experiment artifacts. If this analysis becomes operational again,
reintroduce it as a server-owned job or a tested report module instead of a
standalone root script.

### Analyzer behavior worth knowing

- **xhigh-only filter**: leases whose sessions ran a non-xhigh thinking level
  are dropped everywhere (historical medium-thinking noise).
- **Outcome classes**: `confirmed_exact`, `confirmed_improved`,
  `exact_rejected` (locally exact, failed gates), `improved_rejected`,
  `no_change`, `error`, `aborted`. A lease with an error/no-change outcome and
  **zero tool calls** is reclassified `aborted` (empty-return plague detector).
- **Tier lists were hardcoded in the retired renderer**
  (`PRIMARY_SURFACE_TOOLS`, `SPECIALIST_TOOLS`, etc.). Any replacement report
  module should keep those labels data-driven so surface changes do not silently
  misreport.
- The "advertised" tool set is whatever the prompt's `<available_tools>` block
  contained at lease time, so mixed-surface runs are visible per lease.

## Reading the report

- **Headline cards / funnel (§1)** — confirm rate per terminal lease is the
  primary number. Compare runs on rate, not raw counts.
- **Improvement magnitude (§2)** — confirmed-improved is inflated by sub-0.5pt
  gains; weigh exacts and ≥5pt gains when judging a change.
- **Durations (§3)** — where worker-hours actually went. The standing pattern:
  confirmed exacts are fast (median ~22 min); the long tail belongs to leases
  that never confirm.
- **Kill threshold (§4)** — survival read: `P(confirm | still running at T)` vs
  the fresh-lease base rate. When the conditional drops well below base rate,
  killing and re-leasing wins. This table is robust to confounding (unlike
  lift). Set via `--agent-timeout-seconds` (5400 ≈ 90 min nominal; use 5700 if
  the implementation kills exactly on the second).
- **Gate losses (§5)** — why locally-exact results died (QA lint, regressions,
  did-not-reproduce). The cheapest yield recovery usually lives here.
- **Tool surface / lift (§6–7)** — lift = `P(confirm | used) −
  P(confirm | not used)`. **Correlational, not causal**: hard targets drag
  tools used on hard targets negative, and "% of no-change coverage" near 100%
  means a tool is ambient, not discriminative. Use lift to pick exposure
  experiments, never to declare a tool good/bad by itself. Near-zero usage
  (the hide/prune tier) is the only safe removal signal.

## Evaluating an experiment

For a surface/prompt/threshold change, run a sweep, map control→`run1` and
experiment→`run2`, rebuild, and compare:

1. Confirm rate per terminal lease, and exacts per worker-hour.
2. No-change worker-hours share (the waste metric).
3. `exact_rejected` count and its QA-lint subset.
4. Guardrails: `tool_error` and `aborted` counts (spikes suggest the agent is
   reaching for removed/renamed tools or the harness broke).
5. Tool-mix shifts: time-to-first `checkdiff_run`, calls per confirmed success.

Differences under ~10pts of confirm rate on a few-hundred-lease sweep are weak
evidence; prefer one variable per sweep.

## History

- `2026-06-11` — first report (run 302fb981): found the empty-return abort
  plague and medium-vs-xhigh gap.
- `2026-06-12` — extended report (302fb981 + caa0dfd7, 749 leases): 90-min kill
  recommendation, QA-lint as top exact-killer, minimum-tool-surface analysis →
  the 35→26 worker profile prune.
