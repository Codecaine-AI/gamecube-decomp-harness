# Post-Sweep Analysis

Run this pass after each sweep batch and before planning the next matrix. The goal is to convert raw candidate rows into decomp hypotheses, not just rank a winner.

## Required Outputs

Create or update:

```text
artifacts/analysis/sweep_analysis.md
artifacts/analysis/next_sweep_plan.md
artifacts/analysis/next_config_seeds.csv
artifacts/learned_patterns.csv
notes/rejected_candidates.md
current_state.md
```

Use the helper for a first-pass report:

```bash
python decomp-orchestrator/knowledge/tools/sweeps/analyze_sweep_results.py \
  decomp-runs/<run>
```

Then do a human/agent interpretation pass over the generated report, the compact diff text, and any run notes.

## Analysis Questions

Answer these every time:

- Which candidate families improved score, frame shape, register allocation, branch shape, relocation accuracy, or data-section stability?
- Which changes were optimized away and therefore provided negative evidence?
- Which changes created worse stack traffic, extra instructions, data damage, or neighbor regressions?
- Which mismatch class remains after the best candidate?
- Which hypothesis explains the best improvement?
- Which hypothesis was falsified?
- Which near-miss defines the next search boundary?
- What should the next sweep vary, hold fixed, ablate, or avoid?

## Narrative Style

Write analysis in the same concrete style as iteration logs:

```text
- Duplicate attributes pointer was optimized away. Treat duplicate pointer locals as low-priority unless paired with a later observable use.
- Volatile stored-result preserved the local but added stack traffic. Use volatile only as a diagnostic anchor, not a promotion path.
- Assignment-in-condition still emitted the unwanted register move, so the issue is not just syntactic comparison placement.
- Keeping `ip` live corrected the first compare but changed saved-register assignment. Next sweep should hold direct compare fixed and vary padding/local lifetime around `ip`.
```

Prefer source-shape cause and objdiff effect over generic statements like "candidate was worse."

## Learned Pattern Rows

Append durable findings to `artifacts/learned_patterns.csv`:

```text
pattern_id,search_pass,family,observation,evidence_configs,effect,next_action,confidence,notes
```

Examples:

```text
lp_001,coarse,temp_lifetime,stored bool later-use creates extra live range,ok_late_use_001,adds save slot but emits bad mr,try non-bool live range anchors,medium,
lp_002,coarse,stack_shape,PAD_STACK(16) fixes frame in ip-live family,ip_live_pad16_004,frame fixed but register assignment remains,hold pad16 and vary local allocation pressure,high,
```

## Next Sweep Plan

`artifacts/analysis/next_sweep_plan.md` must include:

- fixed anchors to preserve;
- families to expand;
- families to suppress;
- ablation rows to add;
- near-miss rows to retest;
- expected mismatch class for the next batch;
- stop conditions.

## Decision Gate

Do not start the next sweep until the analysis names at least:

- one thing that worked;
- one thing that failed or was optimized away;
- one hypothesis for why;
- one concrete next candidate family;
- one validation or rejection gate.
