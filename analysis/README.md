# Attempt and tool analysis

This folder keeps the repeatable analysis scripts and generated reports for the
current attempt-tail and Pi worker tool-contribution work.

## Layout

- `scripts/` contains the runnable analysis and report generators.
- `reports/` contains generated reports and companion `.stats.json` files.
  Some analyses also write row-level `.dataset.csv` audit tables.

## Data Sources

- Current epoch / checkpoint-backed analysis reads
  `projects/melee/state/orchestrator.sqlite`, especially
  `worker_checkpoints`, `worker_state`, `epoch_targets`, and `pi_sessions`.
- Historical Pi tool-output analysis reads the same SQLite database plus the
  old worker transcript JSONL files in `.pi-sessions/worker/`.
- Some historical `pi_sessions.session_file` rows point at the previous
  `decomp-orchestrator` checkout. `analyze-pi-agent-tools.py` remaps those
  missing legacy paths by filename into `.pi-sessions/worker/`.

## Reports

- `reports/epoch-followup-gain-2026-06-30.html`: attempt-tail and follow-up
  gain analysis across the current and prior epochs.
- `reports/tool-contribution-checkpoints-2026-06-30.html`: checkpoint-aware
  current-run tool contribution analysis, including accepted exacts, fuzzy
  wins, failed-gate exacts, and tool lift.
- `reports/fresh-tool-distribution-15-epoch-2026-06-30.html`: fresh session-flow
  tool distribution for the closed 15-epoch run, excluding the active follow-on
  epoch.
- `reports/fresh-tool-distribution-xhigh-epochs20-21-snapshot-2026-07-01.html`:
  xhigh-only tool distribution plus exact-match and fuzzy-improvement timing
  for the new epoch 20/21 sweep, including early-kill threshold tables by
  no-win attempt count and elapsed time. The epoch 21 rows are an active-run
  snapshot.
- `reports/legacy-tool-contribution-2026-06-30.html`: all replayable legacy
  worker transcript runs, analyzed with the newer contribution framing at lease
  level.
- `reports/pi-agent-tool-analysis-legacy-2026-06-30.html`: legacy replay of the
  original June 10-12 two-run Pi worker report. These runs predate
  checkpoint-level target-claim wiring, so the report is lease-level rather than
  checkpoint-level.
- `reports/q-priority-outcome-analysis-2026-06-30.md`: queue/epoch priority
  score versus confirmed outcome analysis, including row-level model scores in
  the companion `.dataset.csv`.

## Commands

Refresh the current checkpoint-backed tool contribution report:

```bash
bun analysis/scripts/analyze-tool-contribution.mjs
```

Refresh the fresh closed-epoch tool distribution report:

```bash
bun analysis/scripts/analyze-fresh-tool-distribution.mjs --max-epoch 15
```

Refresh the xhigh-only epoch 20/21 tool and timing snapshot:

```bash
bun analysis/scripts/analyze-fresh-tool-distribution.mjs \
  --run 53d5b342-c066-48fc-aa49-dd78b69dc2ac \
  --min-epoch 20 \
  --max-epoch 21 \
  --include-active \
  --thinking-level xhigh \
  --out analysis/reports/fresh-tool-distribution-xhigh-epochs20-21-snapshot-$(date +%F).html
```

Refresh the legacy Pi worker replay:

```bash
OUT=analysis/reports/legacy-tool-contribution-$(date +%F)
bun analysis/scripts/analyze-legacy-tool-contribution.mjs --out "${OUT}.html"
```

Refresh the original two-run legacy Pi worker replay:

```bash
OUT=analysis/reports/pi-agent-tool-analysis-legacy-$(date +%F)
python3 analysis/scripts/analyze-pi-agent-tools.py "${OUT}.stats.json"
python3 analysis/scripts/render-pi-agent-tool-report.py "${OUT}.stats.json" "${OUT}.html"
```

Refresh the attempt-tail / follow-up gain report:

```bash
bun analysis/scripts/generate-attempt-tail-followup-report.mjs
```

Refresh the queue/epoch priority outcome analysis:

```bash
python3 analysis/scripts/analyze-q-priority-outcomes.py
```

Validate generated artifacts:

```bash
for f in analysis/reports/*.stats.json; do python3 -m json.tool "$f" >/dev/null; done
rg -n "\\{\\{|TODO|Traceback|nan" analysis/reports/*.html
```

`rg` returning no rows for the HTML check is expected.
