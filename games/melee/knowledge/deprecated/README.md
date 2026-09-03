# Deprecated knowledge artifacts

Everything under this directory is retired input. Nothing here is a knowledge source
for workers or librarians; the live store is `../knowledge.sqlite` (knowledge V2) with its
search index in `../knowledge-index.sqlite`.

## ledger-v1/

The V1 knowledge ledger (`learnings.jsonl`, 22,114 append-only records, plus its FTS
mirror `learnings-fts.sqlite`). Frozen 2026-08-31. Kept as an immutable audit archive.

Disposition, decided 2026-09-02 after the V2 backfill (run `backfill-01-20260901`)
stamped all 22,237 targets:

| Records | Bin | Where it went |
| ---: | --- | --- |
| 19,975 | attempt | Superseded by `worker_run` / `submission` rows migrated from run state (5,378 runs, 14,791 submissions) and 4,592 summarizer narratives in V2 |
| 1,171 | lineage | Boundary / upstream-override wrappers with no claim text. Not imported |
| 487 | operational | Operator and run-operator messages. Never imported by design |
| 481 | semantic candidate | Old past-PR librarian claims. 166 symbol-scoped ones map to targets that V2 re-derived from PRs, code, and Discord with code citations; 61 name symbols no longer in the report; 254 are area/file/general coding notes with no V2 subject. Not imported: the "full semantic reset" outcome of the migration plan |

No runtime reader or writer opens these files. They remain here only as a frozen audit
archive; Knowledge V2 serves all live knowledge reads and writes.
