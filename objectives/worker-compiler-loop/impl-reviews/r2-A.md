1. R1-A-1 **RESOLVED** — `worker-cycle.ts:838–845` replaces score-chasing continuation text and makes SMS frame-only a stop, never an exact claim. Combined prompt/repair tests pass.

2. R1-A-2 **RESOLVED** — `previous-attempt.ts:577` defaults to persisted review lookup; `worker-cycle.ts:2111–2127` delivers standalone reviews when no `previous_attempt` exists.

3. [BLOCKING] **Fifth pending review silently disappears** — `apps/server/src/core/agent-catalog/agents/running/worker/previous-attempt.ts:450`. `openReviewRows` caps both delivery paths at four reviews without an omitted count or readable full-list locator. With five pending constructs, the worker cannot identify the fifth as pending and can resubmit it contrary to §4. Reproduced: five input reviews deliver only reviews 1–4. Fix: render every pending review compactly, or provide the full list through a readable locator with explicit omission guidance. Cover both packet variants with five persisted reviews.

Validation: 19 focused prompt/repair tests and 24 catalog tests passed. Persistence tests were blocked by sandbox filesystem permissions.

1 blocking findings.