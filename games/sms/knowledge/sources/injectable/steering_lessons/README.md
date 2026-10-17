# Steering lessons

Curated SMS data for the steering gate (objective `sms-real-codegen`, contract §2.6).
Not a registered knowledge source: there is no `source.json` and no entry in
`../../registry.json`, so the document builders do not ingest this directory.

- `lessons.jsonl`: one JSON object per line,
  `{"id","function","pr","steering":{"shapes","summary","example"},"real_cause":{"kind","summary","evidence"},"outcome","reviewed_by"}`.
  `outcome` is `real`, `mixed` or `loop_confirmed`. Seeded from the 6 real and
  6 mixed functions of the `sms-pr189-split/temp-audit` audit.
  Read by the `steering_diagnose.py` probe and seeded into knowledge by
  `apps/server/src/core/knowledge-v2/steering-lessons/seed.ts`.
- `evidence_approvals.jsonl`: one site-bound approval per line (schema
  `steering-approval-v2`, documented in `steering_approvals.py`):
  `{"game","unit","target","base_rev","site_file","site_lines","group_digest","callee","symbol","approved_by","provenance",...}`.
  The steering gate certifies an `evidence_review` construct only when every
  field matches the edit group exactly (same game, unit, mangled target, claim
  base, file, line range and normalized group digest). Rows are written by an
  operator's approval of an evidence-review request (dashboard Reviews page),
  never by workers. Legacy `{"symbol","function",...}` rows never certify;
  `steering_approvals.py migrate` converts the ones a gate report can bind.

- `review_rulings.jsonl`: one JSON object per line, maintainer review rulings on
  SMS PRs: `{"id","date","pr","reviewer","quote","quotes","ruling","rule",
  "enforced_by","examples","source"}`. `quote` is the reviewer's exact words
  (copied read-only from `gh pr view <n> -R doldecomp/sms --comments` or the
  inline review comments via `gh api repos/doldecomp/sms/pulls/<n>/comments`);
  `enforced_by` lists the lint rule ids and gate checks that apply the rule
  (`steering_gate`, `steering_gate:unused_check`, `steering_gate:out_of_order`,
  `edit_scope`, `pr_scope_check`). Seeded: #330 (fakematch steering), #342
  (UNUSED reconstruction) and #347/#348 (decompile in order). The
  `steering_diagnose.py` probe lists the rulings whose `enforced_by` matches
  the probe's rules, and the seed CLI admits each ruling as a `pattern`
  entity `review-ruling:<id>` with a `purpose` fact.

Seeding the live SMS store opens and migrates it, so it is left to the operator:

    bun apps/server/src/core/knowledge-v2/steering-lessons/seed.ts --game sms          # dry run
    bun apps/server/src/core/knowledge-v2/steering-lessons/seed.ts --game sms --apply

All three files are append-only. Loop-confirmed lesson pairs, new approvals and new rulings
are appended only after an independent review confirms the retained change is a
real, evidence-backed fix and not a disguised steering edit.
