# Task I: The worker never hears about its attempt budget

Repo: `/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness`. Do NOT edit `apps/server/src/core/agent-catalog/agents/running/worker/prompt.ts` (planner-owned; already updated: `goal` is one line, the section is now `submission`, and all turn/epoch/budget language is gone). Do not touch `games/melee/**`.

## Why
The worker's job is "get to 100%; submit every verified improvement". The runner keeps an attempt budget (5 base + 2 per new-best improvement) and stops on exact, deadline, or exhaustion — that stays exactly as is — but the worker must not see it. Today the runner's continuation message says: "This is attempt N of budget M (base 5, +2 for every new-best improvement)… each new best extends the budget. An accepted exact closes the worker immediately." and the exact-but-gates-failed message says "Reaching exact granted bonus attempts, and the remaining attempt budget is available…".

## Change (apps/server/src/core/cycle-runtime/phases/running/workers/worker-cycle.ts, ~lines 2130–2150, plus any helper that builds `repair_request` text)
Rewrite both `repairInstruction` strings so they state only what the last submission established and what to do next, with no attempt numbers, budgets, bonuses, epochs, or "closes the worker":
- Normal continuation: "Your last submission was validated and checkpointed at <score>%." (or "…was rejected: <reasons>." when there are repair reasons) + "Continue toward exact from the current source. Submit each verified improvement. Preserve pre-existing dirty work, return a compact validation-ready JSON note, and do not use whole-file destructive reset/restore/checkout/clean commands." Use the latest checkpoint's `newScore` (or the measured score in the return gate) for `<score>`; omit the score clause if unavailable.
- Exact-but-gates-failed: keep all the substantive guidance (hard gates win over match %; compliant idiom inside the write set; cross-file canonical fix cannot ship — state it in blockers; remove a banned pattern and return the best gate-clean version; never resubmit an unchanged diff) but delete the sentence about bonus attempts / remaining budget.
Also scan the rest of `worker-cycle.ts` and `change-validation.ts` for any other text that reaches the worker (repair_request fields, `paths_note`, continuation reasons rendered into the packet) and remove budget/attempt-count wording from anything the worker sees. Internal logs, events, dashboard summaries, and `continuationDecision` fields keep their numbers — only worker-facing text changes.

## Tests
- Update worker-cycle tests that assert the old continuation wording (grep for "attempt budget", "of budget", "bonus attempts", "new-best").
- `prompt.test.ts`: remove/replace assertions for `"A single worker turn may end before 100%"`, `"return a handoff JSON"`, `"This handoff is not a worker report"`, `"banks a validated, gate-clean improvement"`, `"Continue after a verified improvement while"`; add assertions that the rendered system prompt contains `<submission>` and does not contain `handoff`, `turn budget`, `later epoch`, or `attempt budget`.
- Run `cd apps/server && bun test src/core/agent-catalog src/core/cycle-runtime/phases/running/workers` — all green. Print the two new strings and DONE.
