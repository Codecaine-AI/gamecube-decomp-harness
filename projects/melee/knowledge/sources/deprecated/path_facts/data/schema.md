# Path Facts Schema

Accepted facts live in `data/path_facts/*.jsonl`. Each row is a JSON object
with:

- `schema_version`: `path_fact_v1`.
- `id`: stable `path_fact:<directory>:<slug>` identifier.
- `kind`: `path_fact`.
- `directory`: top-level Melee source directory such as `it` or `gr`.
- `status`: `accepted` for records eligible for packet injection.
- `strength`: `strong_hint`, `medium_hint`, or `weak_hint`.
- `title`: short fact title.
- `scope_globs`: source/header globs that determine resolver eligibility.
- `applies_when`: target conditions that make the fact useful.
- `summary`: compact runtime text.
- `do`: concrete source actions or evidence checks.
- `do_not`: known traps and forbidden shortcuts.
- `evidence_refs`: local source/header paths, docs, PR-corpus records, or
  operator examples that justify the fact.
- `watched_paths`: source/header paths that should invalidate or trigger review
  when changed.
- `slice_ref`: quality slice file/anchor for fuller pre-edit context.
- `superseded_by`: evidence classes that outrank the fact.
- `curator_update_policy`: `target_source_id: path_facts`, `update_kind:
  path_fact`, and `mutation_policy: proposal_only_until_validated`.

Directory dispositions are tracked in
`objectives/path-scoped-decomp-knowledge/artifacts/directory_inventory.json`.
Directories with thin reusable signal should be recorded there with
`status: no_fact_needed` and a concrete reason instead of receiving invented
facts.

Resolver ranking:

1. exact file or exact header glob;
2. narrow directory glob with more path components;
3. broader top-level directory glob;
4. higher strength;
5. stable id order.

The resolver returns a bounded packet. When a fact conflicts with current source,
headers, assembly, objdiff, or regression output, report the conflict and follow
the current evidence.

