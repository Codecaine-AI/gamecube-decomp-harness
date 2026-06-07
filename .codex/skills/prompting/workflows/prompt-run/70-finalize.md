# Finalize

Write final deliverables to `outputs/` and update run state.

## Outputs

Use the applicable names:

- `outputs/system-prompt.md`
- `outputs/improved-prompt.md`
- `outputs/formatter.ts` or another language extension
- `outputs/rendered-user-message-example.md`
- `outputs/final-report.md`

## Final Report

`outputs/final-report.md` should include:

1. What the run produced.
2. Key design decisions.
3. What was included and cut.
4. Final evaluation table.
5. Remaining assumptions or open questions.
6. How to use the artifact.

## State

Set `state.json.status` to `complete` and `state.json.phase` to `finalize`.
