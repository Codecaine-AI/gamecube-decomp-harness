# Global Melee Decomp Standards

This source owns runtime-accessible global standards for Melee decomp workers,
writers, QA, and review. A standard is primarily an example-backed code
pattern: a short description plus bad/preferred source pairs that show the
repair shape. It is separate from path-scoped quick facts so broad rules can
always be loaded without bringing item, fighter, menu, or stage hints into
unrelated contexts.

Trust rule:

- Current source, headers, symbols, splits, assembly, objdiff/checkdiff, and
  regression output outrank these standards.
- Standards are mandatory requirements enforced by lint and review, not
  preferences. Every finding must be repaired before an attempt is accepted;
  the only exceptions are the two `llm_review` advisories, which must be
  justified in the attempt summary if kept.
- These standards are review policy, not proof that a specific source change is
  correct: the higher-authority evidence above still governs correctness.
- Updates come through `source_update_proposal` records that target
  `decomp_standards`; model agents do not mutate this source directly.

APIs are kept for status checks, proposal review, and focused follow-up. This
source is primarily injected into prompts rather than treated as a broad RAG
store.

## Slice Layout

Records live in per-family vertical slices under `standards/<family>/`:

- `slice.json`: manifest of the family's deterministic `review_lint` rules
  (`rule_id`, `severity`, `standard_id`, `applies_to`), post-scan
  `escalations`, and the `standards` ids it owns.
- `standards.jsonl` / `examples.jsonl`: the family's standard and example
  records (examples are routed by their standard's family).
- `rules.py`: the check implementations, loaded and validated against
  `slice.json` by
  `toolpacks/gamecube-decomp/source_editing/review_lint/api/_qa_rules.py`
  (env override `REVIEW_LINT_STANDARDS_DIR`).
- `tests/`: reserved for slice-local tests.

`standards/order.json` keeps the explicit record order of the former flat
`data/standards.jsonl` / `data/examples.jsonl` files; every loader reads the
union of the slices and emits records in that order, so order-dependent
consumers (canonical-example selection, prompt XML) are unchanged. The rule
engine likewise pins lint-finding order with a canonical rule-id list rather
than directory glob order.

## Record Fields

The stable identity fields remain `schema_version`, `id`, `kind`, `status`,
`title`, `summary`, `do`, `do_not`, and `evidence_refs`. `summary` is the quick
description shown before examples. `do` and `do_not` are compatibility signal
lists for search, editing, and older tooling; they are no longer the primary
human or injected prompt surface. Existing `global_standard:*` ids should be
preserved unless every consumer is migrated.

Current records also carry optional code-quality metadata:

- `family`: one of the active source-quality families, such as
  `authored_source_shape`, `typed_access_and_pointer_math`,
  `asserts_reports_and_header_inlines`, `literals_data_and_externs`,
  `codegen_tactics`, or `names_defines_headers_and_prototypes`.
- `disposition`: `active`, `merged`, or `workflow_only`.
- `worker_facing`: `false` keeps merged/workflow records searchable without
  injecting them into worker, repair, or pre-ship standards XML.
- `severity`: collapsed enum. `required` marks a mandatory requirement whose
  findings must all be repaired before an attempt is accepted (it replaces the
  former `review_required`, `repair_required`, and `evidence_required` tiers).
  `workflow_context` marks merged/historical policy and `workflow_only` marks
  runner/pipeline-owned policy; neither is injected into worker prompts.
- `qa_enforcement`: describes the enforcement mechanism (hard lint, warning
  lint, pre-ship review, or pipeline-owned workflow policy); it is unchanged by
  the severity collapse, so no enforcement detail is lost.
- `qa_rule_ids`: deterministic `review_lint` rule ids that implement or
  partially cover the standard.
- `example_policy` and `preferred_repairs`: compact routing/repair hints.
  Detailed examples live in the example catalog and are rendered next to the
  standard in the dashboard.

`standards/<family>/examples.jsonl` stores targeted bad/preferred examples for
QA repair and pre-ship review. Each record is lookupable by `standard_id` and optional
`qa_rule_id`; `description` is a list of bullet-point strings rendered in the
dashboard and prompt XML. Example order is intentional: the first example for a
standard is its canonical pair. The base `<decomp_standards>` injection includes
one canonical example pair per worker-facing standard, and unconstrained
standard-example injections render at most the canonical example for each
standard. `standardExamplesPromptXml()` renders additional relevant examples
when a repair item or lint finding identifies the rule.

```bash
python3 projects/melee/knowledge/sources/injectable/decomp_standards/api/status.py --json
python3 projects/melee/knowledge/sources/injectable/decomp_standards/api/search.py --query typed --limit 10 --json
python3 projects/melee/knowledge/sources/injectable/decomp_standards/api/proposals.py --json
```
