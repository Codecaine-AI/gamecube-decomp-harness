# Diagnose + evidence loop (validation 8.4)

Sample: 12 of the 43 audited-steering functions the gate labelled `steering_located`, stratified by audit change kind (5 temp, 2 form+temp, 2 inline_swap, 2 form, 1 inline_swap+temp). Four Opus workers, ~40 min per function, starting from upstream `7fed828b` with the gate probe, `evidence_search` (map, symbols, header inlines, usage, TP/TWW JSystem) and `steering_check check`. Raw rows: `loop-results.jsonl`. Brief: `loop-brief.md`.

## Result: 0 of 12 became gate-certified real matches

| PR | Function | Base % | Best real-looking % | Gate | Independent review |
| - | - | - | - | - | - |
| 04 | TGessoPolluteObj::getNowGravity | 98.13 | 100 | steering_located (IR-identical) | UNCERTAIN |
| 10 | TPollutionManager::cleanedAll | 96.43 | 100 | unresolved (header cap) | UNCERTAIN |
| 12 | TYoshiTongue::init | 99.29 | 100 | steering_located (IR-identical) | STEERING |
| 27 | TCogwheelScale::receiveMessage | 96.26 | 100 via an invented getter | steering_located | not reviewed (no evidence) |
| 03, 16, 17, 17, 05, 25, 14, 15 | 8 others | — | no gain from any non-steering change | — | — |

- `getNowGravity` and `cleanedAll` remove accessors that the upstream headers themselves label `// fabricated`, and use the field directly as sibling code does. That is the strongest "real cause" signal the loop found. Codex review: plausible but unproven, because inlined accessors leave no map trace. They are candidates for the curated `evidence_approvals.jsonl` only after a human decision.
- `TYoshiTongue::init` adopts an existing header inline used by matching siblings. This is the same edit the audit called steering; the reviewer agrees it is indistinguishable from the maintainer's `getColorChan` example.
- The other functions' residuals are register order, f-register swaps, argument evaluation order, or bool-expression spelling. When a real original differs from upstream only in spelling, no behaviour-changing fix exists, and the gate (by the maintainer's rule) cannot certify it.

## Probe usefulness
The probe located the steering edit precisely in every case; its hypotheses were usually generic and its evidence lists often empty. The two fabricated-accessor finds came from reading header comments, not from the probe. Follow-ups: surface `// fabricated` header labels and sibling direct-field use as probe evidence; search inlines on the types actually involved (e.g. `J3DModelData`, not the enclosing class).

## Gate issues the loop found (fixed or in progress)
- `stack_compare` ignored `addic.` with r1 base, so `TMarioGamePad::read` (r1-offset-only) was classed mismatch instead of stack-only.
- The 24-unit header-consumer cap made header-backed edits `unresolved` (raised to 96, budget-bounded).
- `--tmp` directory not created.
