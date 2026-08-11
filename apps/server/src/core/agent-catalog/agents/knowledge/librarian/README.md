# Librarian Agent

The librarian is the single knowledge kernel agent. It enters through one of
three context doors and returns one shared `librarian_v1` output contract.

## Doors

### `condense`

Accepts `librarianBatch`, whose items are explicitly typed with `kind`. Supported
kinds are `checkpoint`, `transcript_span`, `activity_event`, `pr`, `pr_comment`,
`postmortem`, `discord_message`, and `curated_record`. Mixed batches are grouped
by kind and each group follows its kind-specific handling rules. The door returns
evidence-backed `learnings`, worker `attempt_overlays`, verdicts on supplied
existing learnings, and rejected material. Omitting `door` selects `condense`.

### `curation`

Accepts `curatorContext`. Maintenance batches contain `enrichment_path`,
`deterministic_record_count`, `batch_index`, `batch_count`, and
`sampled_records`. PR-intake batches use mode `prepare_pr_knowledge_intake` and
include `postmortem_path`, `deterministic_records`,
`deterministic_source_update_proposals`, and `curator_handoff`.

The door reviews the supplied batch into top-level `accepted_records`,
`source_update_proposals`, and `rejected_records`. Accepted records are
graph-owned reusable knowledge. Source-owned mutations remain
`proposal_only` for owner review.

### `pr_indexing`

Accepts `prContext`, including the raw PR metadata, diff, comments, extracted
evidence, and local slice paths supplied by the PR intake job. It normalizes one
PR into a searchable postmortem, key files, learnings, naming and matching
tactics, review feedback, search terms, evidence quality, and curation handoff.
The complete `melee_pr_postmortem_v1` record is nested under `pr_index`.

## Tool surface

All three doors advertise the same tool set: `code_graph_search`,
`past_prs_search`, `decomp_standards_context`, `decomp_standards_proposals`,
`review_lint_scan`, `smashwiki_search`, `smashwiki_get_page`, and
`ledger_search`.

The SmashWiki tools ground claims about game mechanics, moves, hitboxes, and
techniques. `ledger_search` supports corroboration-by-judgment: candidate
learnings are compared with existing ledger learnings before they are emitted,
while the librarian still judges whether the evidence confirms or refutes them.

## Shared output contract

Every door returns `schema_version: "librarian_v1"`, `agent_status`, `summary`,
and `confidence`. Door-specific sections are optional in practice:

- `condense`: `learnings`, `attempt_overlays`, `verdicts`, and `rejected`
- `curation`: `accepted_records`, `source_update_proposals`, and
  `rejected_records`
- `pr_indexing`: `pr_index`

All claims must stay within the supplied packet and cite available evidence.
The librarian may verify targeted questions through its tools, but it does not
mutate source corpora, tool caches, indexes, graph databases, or source files.
