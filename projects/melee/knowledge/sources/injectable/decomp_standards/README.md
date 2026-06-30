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
- Standards are review policy and cleanup guidance, not proof that a specific
  source change is correct.
- Updates come through `source_update_proposal` records that target
  `decomp_standards`; model agents do not mutate this source directly.

APIs are kept for status checks, proposal review, and focused follow-up. This
source is primarily injected into prompts rather than treated as a broad RAG
store.

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
- `severity` and `qa_enforcement`: describe whether the rule is hard lint,
  warning lint, pre-ship review, or pipeline-owned workflow policy.
- `qa_rule_ids`: deterministic `review_lint` rule ids that implement or
  partially cover the standard.
- `example_policy` and `preferred_repairs`: compact routing/repair hints.
  Detailed examples live in the example catalog and are rendered next to the
  standard in the dashboard.

`data/examples.jsonl` stores targeted bad/preferred examples for QA repair and
pre-ship review. Each record is lookupable by `standard_id` and optional
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
