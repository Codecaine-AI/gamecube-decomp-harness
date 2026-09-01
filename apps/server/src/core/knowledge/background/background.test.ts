import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  claimNextJob,
  enqueueJob,
} from "@server/core/job-queue/kernel.js";
import { openState, type StateStore } from "@server/core/orchestrator-state";

import { queryBackgroundKnowledgeSummary } from "./index.js";

const fixtures: Array<{ dir: string; store: StateStore }> = [];

function fixture(): StateStore {
  const dir = mkdtempSync(join(tmpdir(), "background-knowledge-"));
  const store = openState(dir);
  fixtures.push({ dir, store });
  return store;
}

afterEach(() => {
  for (const item of fixtures.splice(0)) {
    item.store.db.close();
    rmSync(item.dir, { recursive: true, force: true });
  }
});

describe("background knowledge summary", () => {
  test("derives publication, queue, lease, retry, and failure state", () => {
    const store = fixture();
    const seeded = [
      ["processing", "2026-08-14T00:01:00.000Z"],
      ["queued", "2026-08-14T00:02:00.000Z"],
      ["waiting", "2026-08-14T00:03:00.000Z"],
      ["failed", "2026-08-14T00:04:00.000Z"],
    ] as const;
    for (const [dedupeKey, at] of seeded) {
      enqueueJob(store, {
        kind: "knowledge_absorption",
        dedupeKey,
        gameId: "melee",
        payload: {},
        at,
      });
    }
    claimNextJob(store, {
      kind: "knowledge_absorption",
      concurrencyLimit: 2,
      leaseMs: 60_000,
      at: "2026-08-14T00:04:30.000Z",
    });
    store.db
      .query(
        `UPDATE jobs SET status = 'waiting', attempts = 2,
          next_attempt_at = '2026-08-14T00:05:00.000Z', error_json = '{"message":"retry me"}'
        WHERE kind = 'knowledge_absorption' AND dedupe_key = 'waiting'`,
      )
      .run();
    store.db
      .query(
        `UPDATE jobs SET status = 'failed', attempts = 3, error_json = '{"message":"terminal failure"}'
        WHERE kind = 'knowledge_absorption' AND dedupe_key = 'failed'`,
      )
      .run();
    store.db
      .query(
        `INSERT INTO knowledge_revisions
          (game_id, digest, sync_id, caused_by_event_id, created_at)
        VALUES ('melee', 'digest-1', NULL, 'event-1', '2026-08-14T00:06:00.000Z')`,
      )
      .run();

    const summary = queryBackgroundKnowledgeSummary(store, "melee");

    expect(summary).toMatchObject({
      publishedRevision: "knowledge-1",
      queued: 1,
      processing: 1,
      waiting: 1,
      failed: 1,
      oldestPendingAt: "2026-08-14T00:01:00.000Z",
      retry: { nextAttemptAt: "2026-08-14T00:05:00.000Z", attempts: 2 },
    });
    expect(summary.activeLease?.id).toStartWith("lease-");
    expect(summary.recentFailures.map((failure) => failure.workerStateId)).toEqual([
      "failed",
      "waiting",
    ]);
    expect(summary.recentFailures.map((failure) => failure.error)).toEqual([
      "terminal failure",
      "retry me",
    ]);
  });
});
