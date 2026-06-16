# Epoch Scheduler Flag Shape

This example is a target shape for implementation, not a confirmed current
command contract.

```sh
bun run orch -- \
  --project melee \
  run-loop \
  --epoch-size 128 \
  --epoch-ready-queue-size 64 \
  --candidate-window 1024 \
  --fast-kg-maintenance-interval-ms 180000 \
  --fast-kg-maintenance-report-count 16 \
  --full-kg-maintenance-mode full
```

Expected behavior:

- admit at most 128 targets into the active epoch;
- keep at most 64 immediately leaseable queued targets from that admission set;
- scan up to 1024 ranked board candidates, expanding for `full` mode until the
  board is exhausted;
- coalesce fast run-evidence refresh by time or completed-report count;
- run full report rebuild and full maintenance only at the epoch boundary;
- never call the LM director to choose targets.
