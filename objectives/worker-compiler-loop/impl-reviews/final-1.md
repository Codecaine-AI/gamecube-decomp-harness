Fix the knowledge-credit leak before running workers.

1. **[BLOCKING] Cleared unverified state restores historical false matches.** [attempts.ts:191](/Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop/apps/server/src/core/knowledge-v2/ingest/attempts.ts:191). After a certified 95% repair clears the row, an older uncertified 100% checkpoint becomes `"match"` again and can teach knowledge. Reproduced in memory. **Fix:** judge each checkpoint against its own revision and certification, including cleared history. Pre-existing on `origin/main`.

2. **[NON-BLOCKING] Certified repair closes its continuation lane.** [worker-certification.ts:59](/Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop/apps/server/src/core/harness-runtime/phases/running/workers/worker-certification.ts:59). Starting at 99%, certified 95% is accepted; its `pass` observation closes the lane, so 96% is rejected against the original 99% baseline. **Fix:** retain repair eligibility through the claim or advance the certified baseline. Reproduced.

3. **[NON-BLOCKING] Equal-score restoration skips identity proof.** [change-validation.ts:1185](/Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop/apps/server/src/core/agent-catalog/agents/running/worker/change-validation.ts:1185). Restoring trusted-base source at 100→100 opens no lane; the zero-group gate cannot certify it, and the restoration prover never runs. **Fix:** dispatch restoration independently of score rejection. Reproduced; fails closed.

4. **[NON-BLOCKING] Real native captures fail scale classification.** [native-measurement.ts:39](/Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop/objectives/worker-compiler-loop/scale/lib/native-measurement.ts:39). The classifier expects a decisions document, but `snapshot.py` returns a capture envelope containing artifact paths. Successful captures become `malformed`; fake fixtures conceal this. **Fix:** load and validate `decisions.json` and test the actual envelope.

5. **[NON-BLOCKING] SMS type-layout fallback cannot build its index.** [type-layout-fetch.ts:158](/Users/Ford/.t3/worktrees/gamecube-decomp-harness/feat-worker-compiler-loop/apps/server/src/core/tools/wrappers/type-layout-fetch.ts:158). With no index or `build/ctx.c`, it passes no source to SMS’s source-required context generator. **Fix:** provision a project-wide index or support explicitly scoped contexts.

Both TypeScript checks passed. All three live prompt fixtures and requested packet variants rendered correctly. Focused checks passed: 23 prompt/tool-contract tests, 36 tool tests, 35 Python tests. Broader suites encountered read-only temporary-file/snapshot restrictions; baseline test comparison and real sandbox/200-worker execution remain unverified.

1 blocking findings.

