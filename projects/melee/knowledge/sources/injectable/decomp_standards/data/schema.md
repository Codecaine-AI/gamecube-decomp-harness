# Decomp Standards Schema

Records live in `data/standards.jsonl`. Each row is a JSON object with:

- `schema_version`: `global_standard_v1`.
- `id`: stable `global_standard:<slug>` identifier.
- `kind`: `global_standard`.
- `status`: `accepted` for records that may be injected.
- `title`: short rule title.
- `summary`: renderable bullet-point strings usable in a worker or QA packet.
- `do`: actionable positive checks.
- `do_not`: review failures and forbidden shortcuts.
- `evidence_refs`: source documents, corpus audits, or review-corpus artifacts that
  justify the rule.
- `superseded_by`: evidence classes that outrank the standard.
- `curator_update_policy`: `target_source_id: decomp_standards`,
  `update_kind: global_standard`, and `mutation_policy:
  proposal_only_until_validated`.

Runtime rules:

- Worker/writer packets load a bounded accepted subset from this source.
- QA and review contexts load accepted global standards without path facts.
- Example order is meaningful. The first `examples.jsonl` record for a
  `standard_id` is the canonical example used by compact standards context;
  additional examples are for targeted repair/review injections.
- Search APIs return JSON with evidence references.
- Curator output may propose new or changed global standards, but applying a
  proposal requires source-specific validation or operator review.
