# Banned Patterns Schema

This source is consumed directly by the QA ship gate:
`tools/source_editing/review_lint/api/_qa_rules.py` reads
`data/banned.jsonl` (`load_banned_pattern_rules()`) and
`data/tombstones.jsonl` (`load_tombstones()`). The data directory is
env-overridable there via `REVIEW_LINT_BANNED_DIR` (used by tests).
Field names below are the names those loaders expect — do not rename them.

## `banned.jsonl` — maintainer-rejected patterns

One JSON object per line:

- `schema_version`: `banned_pattern_v1`.
- `id`: stable slug, `pr<NNNN>-<short-description>`.
- `source_pr`: integer PR number on doldecomp/melee.
- `comment_url`: the inline review-comment URL that is the authority for the
  rejection (`https://github.com/doldecomp/melee/pull/N#discussion_rXXXX`).
- `file`: repo-relative path the comment was made on.
- `excerpt`: the offending code excerpt, compact.
- `standard_id`: the `global_standard:<slug>` the rejection enforces
  (see `injectable/decomp_standards`).
- `detector`: object describing how the record is enforced:
  - `type`: `"agent_exhibit"` or `"regex"`.
  - `pattern`: required when `type` is `"regex"` — a Python regex applied to
    added diff lines by review_lint.
- `comment`: the maintainer's words (verbatim or lightly trimmed). This is
  what the L3 preship reviewer is shown.
- `disposition`: one of:
  - `"rejected"` — maintainer rejected the change; resubmission is banned.
  - `"accepted_style_note"` — counter-exhibit: the maintainer disliked the
    style but explicitly accepted the change (removing it would be a
    regression). These records teach the reviewer what NOT to flag.
  - `"proposed"` — only valid inside `data/proposals/`, never in
    `banned.jsonl`.
- `created`: ISO date the record was added.

### Detector-type policy

All nine seed records use `detector.type: "agent_exhibit"`: the deterministic
coverage for these findings already lives in review_lint's built-in rules
(`extern_in_c`, `string_literal_to_symbol`, `packed_string_blob`,
`unrolled_assert`, plus the ownership checks in `scan_diff.py`).
`agent_exhibit` records feed the L3 preship review prompt as retrieval
exhibits; they do not add deterministic gate rules.

`regex`-type detectors are reserved for future rejections that need them and
**always require human approval before landing in `banned.jsonl`** — a bad
regex blocking all ships is the failure mode to avoid. The ingestion flow
(`build_pr_postmortems.py --extract-banned-patterns`) therefore writes only
`disposition: "proposed"` records into `data/proposals/`; a human (or the
curator flow, with operator review) promotes them.

## `tombstones.jsonl` — resubmission tombstones

One JSON object per line. A tombstone is a fuzzy fingerprint of a hunk a
maintainer already rejected; `scan_diff.py` compares every added hunk against
all tombstones and hard-fails on similarity >= `threshold`, citing
`comment_url`. Fields read by `_qa_rules.check_tombstones()`:

- `shingles` (required, non-empty): normalized 4-token shingle hashes of the
  rejected hunk's ADDED lines, produced by
  `python3 tools/source_editing/review_lint/api/_qa_rules.py
  --shingles-from-file <file-with-added-lines>`. Identifiers/numbers are
  normalized (`ID`/`NUM`); string-literal contents are kept verbatim.
- `threshold`: Jaccard similarity cutoff (default `0.7` when omitted).
- `id`: stable slug, `tombstone:pr<NNNN>-<short-description>`.
- `source_pr`: integer PR number of the rejection.
- `comment_url`: the maintainer rejection comment URL (quoted in the
  gate failure message).
- `standard_id`: the standard the rejection enforces.
- `file`: repo-relative path of the rejected hunk (informational; matching is
  content-based, so a moved/renamed resubmission still matches).
- `symbol`: primary symbol of the rejected hunk (informational).

Authoring metadata we additionally record (ignored by the loader):

- `schema_version`: `tombstone_v1`.
- `created`: ISO date.
- `branch`: the local branch the rejected hunk was extracted from.
- `hunk_note`: which hunk(s) the shingles were computed from.

### Matching constraints (inherited from `_qa_rules.py`)

- Matching is **per diff hunk** against the hunk's ADDED lines only.
- Hunks with fewer than `MIN_TOMBSTONE_TOKENS` (12) tokens are never checked,
  so one-line rejected hunks (e.g. a lone
  `extern const f32 lbl_804DA60C;`) cannot be tombstoned; those cases are
  covered by the deterministic rules (`extern_in_c`, etc.) instead.
- `scan_diff.py` ref mode diffs with `--unified=5`; compute shingles from
  hunks of a `git diff --unified=5` so hunk-merging behavior matches.

## `proposals/<pr>-<comment-id>.json` — proposed candidates

Written by
`knowledge/sources/code_context/past_prs/commands/build_pr_postmortems.py
--extract-banned-patterns`. Same shape as a `banned.jsonl` record plus:

- `disposition`: always `"proposed"`.
- `detector`: always `{"type": "agent_exhibit"}` (heuristics never propose
  regexes).
- `reviewer`: login of the comment author.
- `heuristic_matches`: which classifier phrases fired
  (`regression`, `do not`, `don't`, `should not`).
- `pr_head_repo`, `pr_author`, `pr_state`, `extracted_at`: provenance.

Promotion to `banned.jsonl` is a deliberate human/curator action: review the
comment, pick the final `disposition`, decide whether deterministic coverage
already exists (keep `agent_exhibit`) or a new `regex` detector is warranted
(human-approved), and add tombstones for the rejected hunks when the diff is
available.
