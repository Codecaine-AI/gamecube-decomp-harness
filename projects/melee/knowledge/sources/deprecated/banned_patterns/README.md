# Maintainer-Banned Patterns

Phase 4 (L4) of the QA ship gate flow
(`docs/10-system-design/60-score-and-pr-handoff.md`): make
maintainer rejections executable so "rejected once" means "blocked forever".

This source owns three data sets (shapes documented in `data/schema.md`):

- `data/banned.jsonl` — one record per maintainer finding, seeded from
  doldecomp/melee PRs #2655–#2659 (reviewer PsiLupan). `agent_exhibit`
  records feed the L3 preship review prompt; human-approved `regex` records
  become additional deterministic review_lint rules.
- `data/tombstones.jsonl` — normalized token-shingle fingerprints of rejected
  hunks. `scan_diff.py` hard-fails any new hunk that is >= 70% similar to a
  tombstone, citing the original rejection comment URL.
- `data/proposals/` — machine-extracted candidates from inline review
  comments on our own PRs, written by
  `projects/melee/knowledge/sources/code_context/past_prs/commands/build_pr_postmortems.py
  --extract-banned-patterns`. Proposals are never auto-promoted.

Consumers:

- `toolpacks/gamecube-decomp/source_editing/review_lint/api/_qa_rules.py`
  reads `projects/melee/knowledge/sources/injectable/banned_patterns/data`
  directly (override the directory with `REVIEW_LINT_BANNED_DIR` for tests).
- L3 preship review retrieves `agent_exhibit` records (including the
  `accepted_style_note` counter-exhibit, which teaches what NOT to flag).

Trust rules:

- A record's authority is its `comment_url`; the maintainer's words win over
  any paraphrase.
- New `regex` detectors require human approval before they gate — a bad regex
  blocking all ships is the failure mode to avoid.
- Tombstones are content-based: do not delete one without maintainer evidence
  that the change is now acceptable.

```bash
python3 projects/melee/knowledge/sources/injectable/banned_patterns/api/status.py --json
python3 projects/melee/knowledge/sources/injectable/banned_patterns/api/search.py --query "extern" --limit 10 --json
python3 projects/melee/knowledge/sources/injectable/banned_patterns/commands/build_index.py
```
