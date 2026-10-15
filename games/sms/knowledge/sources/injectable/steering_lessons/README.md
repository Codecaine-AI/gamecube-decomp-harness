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

Both files are append-only. Loop-confirmed lesson pairs and new approvals are
appended only after an independent review confirms the retained change is a
real, evidence-backed fix and not a disguised steering edit.
