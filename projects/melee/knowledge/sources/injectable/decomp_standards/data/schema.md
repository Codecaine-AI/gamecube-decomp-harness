# Decomp Standards Schema

Records live in per-family vertical slices under
`standards/<family>/standards.jsonl` (one JSON object per row). The active
families are `literals_data_and_externs`, `asserts_reports_and_header_inlines`,
`typed_access_and_pointer_math`, `codegen_tactics`,
`names_defines_headers_and_prototypes`, `authored_source_shape`, and
`pipeline_owned_verification`. Each standard row is stored in the slice named
by its `family` field. Each row is a JSON object with:

- `schema_version`: `global_standard_v1`.
- `id`: stable `global_standard:<slug>` identifier.
- `kind`: `global_standard`.
- `status`: `accepted` for records that may be injected.
- `title`: short rule title.
- `summary`: renderable bullet-point strings usable in a worker or QA packet.
- `do`: actionable positive checks.
- `do_not`: review failures and forbidden shortcuts.

## Requirement-template prose convention

`summary`, `do`, `do_not`, and `preferred_repairs` on active/accepted records
are written as requirements, not preferences. Each active record states, in
this order:

1. **Requirement** — what is required or not allowed, with the consequence
   ("X is required", "X is not allowed", "source that keeps X is rejected").
   The words `prefer`, `try`, `should usually`, `when possible`, and
   `consider` do not appear in active-record prose.
2. **Permitted exception** — the single exception class the rule allows (for
   example a maintainer-approved data-ownership case, an `llm_review`
   advisory surface, or an unrolled shape kept after recorded negative
   evidence), or an explicit "no exceptions" when none exists.
3. **Required evidence** — the evidence the exception demands (objdiff /
   regression output, recorded section-ownership or symbol metadata, or
   maintainer approval). Claiming a cleaner form does not exist requires
   recorded negative evidence, never a default assumption.

Merged and `workflow_only` records keep their historical prose; only their
`severity` follows the taxonomy below.

## Severity taxonomy

`severity` is a collapsed enum:

- `required` — a mandatory requirement enforced by lint and/or review. Every
  finding must be repaired before an attempt is accepted. (This value
  replaces the former `review_required`, `repair_required`, and
  `evidence_required` tiers; `qa_enforcement` still records the mechanism —
  hard lint, warning lint, or pre-ship review — so no enforcement detail is
  lost.)
- `workflow_context` — merged/historical policy retained for search and
  history, not injected into worker prompts.
- `workflow_only` — runner/pipeline-owned workflow policy, not a
  code-quality requirement injected into worker prompts.
- `evidence_refs`: source documents, corpus audits, or review-corpus artifacts that
  justify the rule.
- `superseded_by`: evidence classes that outrank the standard.
- `curator_update_policy`: `target_source_id: decomp_standards`,
  `update_kind: global_standard`, and `mutation_policy:
  proposal_only_until_validated`.

## Slice layout

Each `standards/<family>/` slice contains:

- `slice.json`: manifest listing the family, its deterministic `review_lint`
  rules (`rule_id`, `severity`, `standard_id`, `applies_to` — validated
  against `rules.py` by the rule engine), its post-scan `escalations`
  (rule ids produced by ownership/visibility analysis in scan_diff), and the
  `standards` ids the slice owns.
- `standards.jsonl`: the family's standard records.
- `examples.jsonl`: the family's example records (routed by the standard's
  family; see below).
- `rules.py`: the deterministic check implementations, loaded by
  `toolpacks/gamecube-decomp/source_editing/review_lint/api/_qa_rules.py`
  (env override `REVIEW_LINT_STANDARDS_DIR`).
- `tests/`: reserved for slice-local tests (currently empty; the review_lint
  suite lives with the engine).

`standards/order.json` preserves the record order of the former flat
`data/standards.jsonl` / `data/examples.jsonl` files: loaders read the union
of all slices and emit records in this explicit order (records missing from
the manifest are appended afterwards, in family order then file order).
Findings ordering for the lint gate is likewise pinned by the engine's
canonical rule-id list, never by directory glob order.

Runtime rules:

- Worker/writer packets load a bounded accepted subset from this source.
- QA and review contexts load accepted global standards without path facts.
- Example order is meaningful. The first `examples.jsonl` record for a
  `standard_id` (in `order.json` order) is the canonical example used by
  compact standards context; additional examples are for targeted
  repair/review injections.
- Search APIs return JSON with evidence references.
- Curator output may propose new or changed global standards, but applying a
  proposal requires source-specific validation or operator review. The apply
  path writes each standard to its owning family slice.
