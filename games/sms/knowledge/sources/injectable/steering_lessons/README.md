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
- `evidence_approvals.jsonl`: one JSON object per line,
  `{"symbol","function","provenance","approved_by","edits_example"}`.
  Read by `evidence_search` as approved evidence. Starts empty.

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
