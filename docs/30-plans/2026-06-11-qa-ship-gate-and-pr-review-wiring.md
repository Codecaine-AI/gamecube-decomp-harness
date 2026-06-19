# Implementation Plan: QA Ship Gate + PR-Review Agent Wiring

**Date:** 2026-06-11
**Trigger:** Maintainer review of PRs doldecomp/melee#2655–#2659 flagged 9 issues
(7 data-ordering regressions, 1 repeat of a previously rejected change). All
flagged patterns are explicitly prohibited in
`docs/20-implementation/knowledge/20-melee-pr-review-qa-standards.md`, but no
deterministic gate enforces them — standards exist only as LLM prompt guidance,
and every existing gate measures objdiff *score*, which is precisely the metric
these tricks inflate.

**Goal:** Make "maintainer-rejected pattern" a machine-detectable, ship-blocking
condition. Anything a maintainer has called a regression must be caught by code,
not by an LLM remembering.

---

## Architecture summary

Four layers, ordered by where they sit in the pipeline (earliest first):

```
worker attempt ──► [L1: worker-side lint]      change-validation.ts (shift-left)
       │
epoch commit ───► [L2: qa gate]                regression-check.ts (hard fail)
       │
PR slice prep ──► [L3: pre-ship review agent]  pr-review agent, adversarial mode
       │
PR shipped ─────► [L4: feedback loop]          maintainer comments → banned patterns
```

- **L1/L2 are deterministic** (regex + symbol-map rules in `review_lint`).
- **L3 is an LLM gate** for what regex can't express, prompted adversarially.
- **L4 closes the loop**: every maintainer rejection becomes a new L1/L2 rule
  or L3 prompt exhibit, so nothing is rejected twice (the particle.c failure).

---

## Phase 1 — Deterministic QA rules in `review_lint`

Extend `tools/source_editing/review_lint/api/scan.py`. The tool already has the
right shape: per-rule `rule_id` + findings JSON, `strip_comments_and_strings()`
for false-positive hygiene, and a tool-API contract workers can call.

### 1.1 New rules (text-scan, single file)

| Rule ID | Detects | Pattern sketch |
|---|---|---|
| `extern_literal_anchor` | extern-for-literal trick | added `extern const (f32\|f64\|float\|double) lbl_8[0-9A-Fa-f]{7}\s*;` — address-style name, no initializer, in a `.c` file |
| `packed_string_blob` | hand-packed string blobs | `static char lbl_8XXXXXXX[0xNN] =` followed by ≥2 concatenated string literals containing `\0` padding, OR any `#define NAME (lbl_8XXXXXXX + 0xNN)` pointer-offset macro |
| `unrolled_assert` | open-coded asserts | `__assert(` / `__assert_msg(` call sites in `src/melee/**` or `src/sysdolphin/**` outside the macro definitions themselves; the idiom must be `HSD_ASSERT*` |

Notes:

- `packed_string_blob` keys on **two independent signals** (the `\0`-padded
  blob and the offset macro) so either alone is reportable and together they
  are high-confidence.
- `unrolled_assert` is allowlist-driven: a small config of files where raw
  `__assert` is legitimate (the macro headers). Everything else fails.
- Keep rules data-driven: add a `RULES` table at module top so Phase 4's
  banned-pattern feed can append regex rules without code changes.

### 1.2 Diff-aware scanning — new `api/scan_diff.py`

The mncount/particle blobs and the externs are *additions*; scanning whole
files would flag pre-existing upstream code we don't own.

- Input: `--repo <melee-root> --base <merge-base-ref>` (default
  `upstream/master` merge-base) or `--diff-file <unified.patch>`.
- Behavior: parse unified diff, run rules against **added lines only** (with
  ±5 lines of context so multi-line blobs are caught), report
  `{rule_id, file, line, excerpt, standard_id}`.
- Each finding carries the matching `standard_id` from
  `knowledge/sources/injectable/decomp_standards/data/standards.jsonl`
  (`global_standard:literals-and-data-ownership`,
  `global_standard:no-string-literal-symbol-regression`,
  `global_standard:assert-report-macros`) so agent-facing errors cite the
  standard the worker already saw in its prompt.

### 1.3 The precision rule: `self_tu_extern` (symbol-map check)

Regex can't distinguish "extern referencing data genuinely owned by another
TU" (legitimate) from "extern dodging data this TU owns" (the cheat). The
symbol map can:

- Address-style names encode the address (`lbl_804DA60C` → `0x804DA60C`).
- `config/GALE01/splits.txt` in the melee repo gives each TU's section address
  ranges; `config/GALE01/symbols.txt` gives symbol→section ownership.
- Rule: **a newly added `extern` whose encoded address falls inside the
  current TU's own `.data`/`.sdata`/`.sdata2`/`.rodata` ranges is the cheat by
  definition** — the TU is referencing its own data as if it were external.
- This also correctly *passes* the ftcoll.c case (PR #2655): defining a real
  constant in binary order is the job; externing your own data is the dodge.

Implementation: `api/check_extern_ownership.py`, takes the melee repo root,
parses splits.txt once (cache under `review_lint/cache/`), evaluates findings
from `scan_diff.py` that matched `extern_literal_anchor`, and upgrades or
downgrades them (`confirmed_self_tu` / `cross_tu_ok`). `extern_literal_anchor`
alone = warn; `+ confirmed_self_tu` = hard fail.

### 1.4 Exit-code contract

`scan_diff.py --gate` exits 0 (clean), 1 (hard-fail findings), 2 (warnings
only). JSON to stdout always, human summary to stderr — same convention as
`regression-check.ts` (stdout stays parseable).

---

## Phase 2 — Wire the gate into the pipeline (L1 + L2)

### 2.1 L2: `regression-check.ts` (the ship gate)

`apps/cli/src/cli/commands/regression-check.ts` currently computes
`regressionGatePassed` (build + objdiff) and `promotionBlocked`. Add a third
gate:

- After the build step, run `scan_diff.py --repo <repoRoot> --base <merge-base> --gate`.
- Add to the summary JSON: `qaGateExitCode`, `qaFindings` (the parsed JSON),
  and fold into the verdict: `passed = regressionGatePassed && !promotionBlocked && qaGatePassed`.
- New flag `--skip-qa-gate` for emergencies, default ON (the gate runs unless
  explicitly skipped — never the reverse).
- Update `hint` strings so a QA failure tells the operator exactly which
  standard was violated and where.
- The dashboard server parses this JSON today; additive fields are safe, but
  verify the dashboard's `status` handling still renders `failed` correctly.

### 2.2 L1: worker-side enforcement in `change-validation.ts` (shift-left)

`packages/agents/src/worker/change-validation.ts` already snapshots pre/post
state and classifies attempts. Add:

- After a worker's edit passes build, run `scan_diff.py` scoped to the files
  the attempt touched (diff vs. the attempt's pre-edit snapshot).
- Any QA finding under strict automated validation, including warning-only
  findings, ⇒ attempt classified as **rejected with structured feedback** (not
  `tool_error` — these must not hit the quarantine path from the error-target
  policy). Feed the findings back into the worker's next iteration prompt
  verbatim: severity, rule, line, excerpt, the standard text, and the
  instruction "remove every QA lint finding; a lower match % without it is the
  correct outcome."
- This is the highest-leverage layer: findings die at attempt time instead of
  contaminating epoch commits, and the worker learns *in-context* why.

### 2.3 Epoch flow

`trigger-agent.ts` epoch mode commits validated work and runs the report
cycle. No new step needed if L1 and L2 are in place — but add the qa gate
summary fields to the epoch save_point record so the dashboard can show
"QA gate: clean" alongside regression counts.

---

## Phase 3 — PR-review agent in the ship flow (L3)

The agent at `packages/agents/src/pr-review/` (Pi runtime, `codex-lb`,
read/grep/find/ls tools) is currently postmortem-intake only, invoked manually
via `build_pr_postmortems.py --run-agent`. Keep that mode; add a second mode.

### 3.1 New mode: pre-ship adversarial review

- New template `templates/preship_user.md` + `preship_schema.json` alongside
  the existing ones. The runtime id stays `pr-review`; mode selected by
  prompt/template, mirroring how the agent is parameterized today.
- **Prompt stance is adversarial, and this is load-bearing:** the worker that
  wrote the code optimizes for score; the reviewer's only job is *"find every
  reason PsiLupan would reject this diff."* Inputs:
  - the PR slice diff (from `pr-split-plan` output),
  - `globalStandardsPromptXml()` (already exported from
    `packages/knowledge/src/decomp-context.ts`),
  - the L1/L2 lint findings (even warnings) for the slice,
  - **exhibits**: the most similar past maintainer rejections from the
    postmortem corpus (Phase 4 provides retrieval; until then, a static
    curated set seeded from PRs #2655–#2659 and the prior particle.c
    rejection).
- Output schema (per finding):
  `{file, line, standard_id, verdict: "reject"|"warn", rationale, suggested_fix}`
  plus a top-level `slice_verdict: "approve"|"reject"`.

### 3.2 Invocation points

- New CLI command `apps/cli/src/cli/commands/pr-preship-review.ts`:
  takes a slice (or `--all` planned slices from `pr-split-plan`), runs the
  agent per slice, writes
  `<state>/preship_reviews/<runId>/<slice>/review.json` + a human `review.md`.
- `melee-pr-workflow` SKILL.md handoff checklist: insert a mandatory step
  between regression-check and PR body drafting — *"run `pr-preship-review`;
  any `reject` finding blocks handoff."* The skill is the operator's runbook,
  so the gate must appear there to be real.
- Disposition of rejects: consistent with the existing promotion policy —
  affected symbols → `needs_rework`, requeued at repair priority; the slice
  ships without them or not at all.

### 3.3 Cost/latency posture

One agent call per PR slice (5 slices in the current batch = 5 calls), only at
handoff time — not per worker attempt. L1 handles the high-frequency path
cheaply; L3 is the expensive, low-frequency backstop.

---

## Phase 4 — Maintainer-feedback loop (L4): rejected once = blocked forever

The particle.c repeat happened because the prior rejection lived only in the
postmortem corpus as prose. Make rejections executable:

### 4.1 Banned-patterns store

- New injectable source:
  `knowledge/sources/injectable/banned_patterns/data/banned.jsonl`.
- Record shape:
  `{id, source_pr, comment_url, file, excerpt, standard_id, detector: {type: "regex"|"agent_exhibit", pattern?}, created}`.
- Seeded immediately with the 9 findings from PRs #2655–#2659 plus the earlier
  particle.c rejection.

### 4.2 Ingestion

- Extend the past-PR refresh path (the corpus fetch +
  `build_pr_postmortems.py` flow the skill already documents) to extract
  **inline review comments on our own PRs**, classify each as
  pattern-shaped (regexable) or judgment-shaped, and append to `banned.jsonl`.
  Classification can be agent-assisted, but a human approves new `regex`
  detectors before they gate (a bad regex blocking all ships is the failure
  mode to avoid).
- `review_lint` loads `regex`-type entries as additional rules at startup
  (the Phase 1 `RULES` table makes this a data append).
- `agent_exhibit`-type entries feed the L3 prompt as retrieval candidates.

### 4.3 Resubmission tombstones

- When a hunk is reverted due to maintainer rejection, store a normalized
  fuzzy hash of the rejected hunk (whitespace/identifier-insensitive token
  shingle) keyed by `(file, symbol)`.
- `scan_diff.py` checks new hunks against tombstones; similarity above
  threshold = hard fail citing the original PR comment URL.
- This is the direct, mechanical guarantee that "you submitted this change
  before" can never happen again.

---

## Phase 5 — Tests (the part that keeps this from regressing)

### 5.1 Golden corpus from the real rejections

`tools/source_editing/review_lint/tests/fixtures/` — one fixture diff per
maintainer finding, extracted from the actual PR branches:

| Fixture | From | Must fire |
|---|---|---|
| `extern_f32_gm1832.patch` | #2656 gm_1832.c:1919 | `extern_literal_anchor` + `self_tu_extern` |
| `extern_floats_grkongo.patch` | #2657 grkongo.c:1580 | `extern_literal_anchor` + `self_tu_extern` |
| `extern_string_tydisplay.patch` | #2658 tydisplay.c:1000 | `extern_literal_anchor` |
| `extern_char_grkongo.patch` | #2657 grkongo.c:662 | `extern_literal_anchor` |
| `string_blob_mncount.patch` | #2658 mncount.c:782 | `packed_string_blob` |
| `string_blob_particle.patch` | #2659 particle.c:1019 | `packed_string_blob` + tombstone |
| `unrolled_assert_gm1832.patch` | #2656 gm_1832.c:2387 | `unrolled_assert` |
| `unrolled_assert_gricemt.patch` | #2657 gricemt.c:1482 | `unrolled_assert` |

### 5.2 Negative fixtures (false-positive guard — equally important)

| Fixture | Must NOT fire | Why |
|---|---|---|
| `sdata2_decl_ftcoll.patch` (#2655) | anything | defining real data in binary order is the job |
| `cross_tu_extern_ok.patch` | `self_tu_extern` | extern to data another TU genuinely owns |
| `real_string_table.patch` | `packed_string_blob` | legitimate `static char* const names[] = {...}` tables |
| `assert_macro_header.patch` | `unrolled_assert` | the `HSD_ASSERT` macro definitions themselves |

Every false positive a future operator hits gets added here before the rule is
relaxed — same discipline as the golden corpus.

### 5.3 Harness

- Python: pytest in `review_lint/tests/` (the dir exists, currently
  README-only); each fixture test asserts exact `rule_id` + line; run via the
  repo's existing tooling test entrypoint.
- TypeScript: `bun test` for `regression-check` — feed a stubbed
  `scan_diff` JSON, assert `qaGateExitCode`, `passed`, and exit-code behavior
  for clean / warn / hard-fail.
- L1: `change-validation` test asserting a violating attempt is rejected with
  structured feedback and does **not** enter the tool_error/quarantine path.
- L3: schema-validation test on the preship review output; one canned-diff
  smoke test (agent mocked) asserting a `reject` blocks the slice.
- CI: all of the above in the orchestrator's default test run, so a rule or
  wiring regression fails the orchestrator's own build.

### 5.4 Acceptance criteria

- All 8 golden fixtures hard-fail; all 4 negative fixtures pass clean.
- Re-running the current 5 PR branches through `regression-check` with the
  gate produces exactly the 8 mechanical findings (the #2655 style note is
  correctly absent).
- A synthetic resubmission of the particle.c blob is blocked by tombstone with
  the original comment URL in the error.
- Worker simulation: an attempt that adds `extern const f32 lbl_…` gets
  rejected feedback citing `global_standard:literals-and-data-ownership`.

---

## Rollout order

| Step | Scope | Risk | Depends on |
|---|---|---|---|
| 1. Phase 1 rules + Phase 5.1/5.2 fixtures | review_lint only | none (no wiring) | — |
| 2. Phase 2.1 gate in regression-check | ship gate | low — additive JSON; verify dashboard | 1 |
| 3. Fix the 5 open PRs, re-gate them | melee branches | — | 2 |
| 4. Phase 2.2 worker-side L1 | worker loop | medium — watch rejection-feedback loop for thrash | 1 |
| 5. Phase 3 preship agent + CLI + skill step | handoff flow | low — additive step | 1 |
| 6. Phase 4 banned-pattern store + tombstones | knowledge + lint | medium — human-approved regexes | 1, 5 |

Steps 1–3 are the immediate priority: they make the current batch shippable
and guarantee the *known* patterns never pass a gate again. Steps 4–6 make the
system self-hardening against the *next* pattern.

## Non-goals

- Not attempting to detect every possible matching hack statically — that's
  what L3 + L4 are for. The deterministic layer only needs to cover patterns
  a maintainer has already named.
- Not changing the promotion policy (MATCHES-only shipping stands).
- Not auto-relaxing any rule: false positives loosen rules only via a negative
  fixture + human review.
