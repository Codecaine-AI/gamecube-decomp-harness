import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  loadBackfillManifest,
  pendingPlannedBatches,
  planDiscordBatches,
  planPastPrsBatches,
  planWorkerHistoryBatches,
} from "./librarian-backfill.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function workerPlannerFixture(): Database {
  const db = new Database(":memory:");
  db.run("CREATE TABLE worker_state (id TEXT PRIMARY KEY, target_key TEXT)");
  db.run("CREATE TABLE worker_checkpoints (id TEXT PRIMARY KEY, worker_state_id TEXT)");

  db.run("INSERT INTO worker_state (id, target_key) VALUES ('worker-b', 'target-b')");
  db.run("INSERT INTO worker_state (id, target_key) VALUES ('worker-a2', 'target-a')");
  db.run("INSERT INTO worker_state (id, target_key) VALUES ('worker-unused', 'target-a')");
  db.run("INSERT INTO worker_state (id, target_key) VALUES ('worker-a1', 'target-a')");
  db.run("INSERT INTO worker_state (id, target_key) VALUES ('worker-null', NULL)");

  db.run("INSERT INTO worker_checkpoints (id, worker_state_id) VALUES ('checkpoint-b1', 'worker-b')");
  db.run("INSERT INTO worker_checkpoints (id, worker_state_id) VALUES ('checkpoint-a2-1', 'worker-a2')");
  db.run("INSERT INTO worker_checkpoints (id, worker_state_id) VALUES ('checkpoint-a1-2', 'worker-a1')");
  db.run("INSERT INTO worker_checkpoints (id, worker_state_id) VALUES ('checkpoint-a1-1', 'worker-a1')");
  db.run("INSERT INTO worker_checkpoints (id, worker_state_id) VALUES ('checkpoint-null', 'worker-null')");

  return db;
}

describe("librarian backfill batch planning", () => {
  test("groups checkpointed workers by target with deterministic ids and ordering", () => {
    const db = workerPlannerFixture();
    try {
      const first = planWorkerHistoryBatches(db);
      const second = planWorkerHistoryBatches(db);

      expect(first).toHaveLength(2);
      expect(first.map((batch) => batch.source)).toEqual(["worker_history", "worker_history"]);
      expect(first.map((batch) => batch.descriptor)).toEqual([
        { target_key: "target-a", worker_state_ids: ["worker-a1", "worker-a2"] },
        { target_key: "target-b", worker_state_ids: ["worker-b"] },
      ]);
      expect(first.map((batch) => batch.batch_id)).toEqual(second.map((batch) => batch.batch_id));
      expect(new Set(first.map((batch) => batch.batch_id)).size).toBe(2);
      expect(first.every((batch) => batch.batch_id.length > 0)).toBe(true);
    } finally {
      db.close();
    }
  });

  test("keeps a large past PR solo while grouping small PRs in file order", () => {
    const root = tempDir("librarian-backfill-prs-");
    const indexPath = join(root, "library", "index.jsonl");
    const prsRoot = join(root, "prs");
    mkdirSync(join(root, "library"), { recursive: true });

    const indexRows = [1, 2, 3, 4, 5].map((pr) => ({
      pr,
      summary: `Summary for PR ${pr}`,
      postmortem_json: `pr-${pr}/postmortem/postmortem.json`,
    }));
    writeFileSync(indexPath, `${indexRows.map((row) => JSON.stringify(row)).join("\n")}\n`);
    for (const pr of [1, 2, 3, 4, 5]) {
      const rawDir = join(prsRoot, `pr-${pr}`, "raw");
      mkdirSync(rawDir, { recursive: true });
      const diff = pr === 4 ? "x".repeat(200 * 1024 + 1) : `small diff for PR ${pr}\n`;
      writeFileSync(join(rawDir, "diff.diff"), diff);
    }

    const batches = planPastPrsBatches({ indexPath, prsRoot });

    expect(batches).toHaveLength(3);
    expect(batches.map((batch) => batch.source)).toEqual(["past_prs", "past_prs", "past_prs"]);
    expect(
      batches.map((batch) =>
        "prs" in batch.descriptor ? batch.descriptor.prs.map((entry) => entry.pr) : [],
      ),
    ).toEqual([[1, 2, 3], [4], [5]]);
    expect(batches[1]?.descriptor).toEqual({
      prs: [{ pr: 4, dir: join(prsRoot, "pr-4"), diff_bytes: 200 * 1024 + 1 }],
    });
  });

  test("splits a Discord month into consecutive message ranges", () => {
    const rawRoot = tempDir("librarian-backfill-discord-");
    const channelDir = join(rawRoot, "channel-123");
    const file = join(channelDir, "2026-07.jsonl");
    mkdirSync(channelDir, { recursive: true });
    writeFileSync(
      file,
      `${Array.from({ length: 950 }, (_, index) => JSON.stringify({ id: `message-${index}` })).join("\n")}\n`,
    );

    const batches = planDiscordBatches({ rawRoot });

    expect(batches).toHaveLength(3);
    expect(batches.map((batch) => batch.source)).toEqual(["discord", "discord", "discord"]);
    expect(batches.map((batch) => batch.descriptor)).toEqual([
      {
        channel_id: "channel-123",
        file,
        month: "2026-07",
        start_line: 0,
        end_line: 400,
        message_count: 400,
      },
      {
        channel_id: "channel-123",
        file,
        month: "2026-07",
        start_line: 400,
        end_line: 800,
        message_count: 400,
      },
      {
        channel_id: "channel-123",
        file,
        month: "2026-07",
        start_line: 800,
        end_line: 950,
        message_count: 150,
      },
    ]);
  });
});

describe("librarian backfill manifest", () => {
  test("loads the last row per batch and filters completed batches from pending work", () => {
    const root = tempDir("librarian-backfill-manifest-");
    const manifestPath = join(root, "worker_history", "manifest.jsonl");
    mkdirSync(join(root, "worker_history"), { recursive: true });

    const db = workerPlannerFixture();
    try {
      const planned = planWorkerHistoryBatches(db);
      const [completed, stillPending] = planned;
      if (!completed || !stillPending) throw new Error("worker fixture did not produce two planned batches");

      const rows = [
        {
          batch_id: completed.batch_id,
          source: completed.source,
          status: "pending",
          attempts: 1,
          updated_at: "2026-08-10T12:00:00.000Z",
          output_counts: null,
          descriptor: completed.descriptor,
        },
        {
          batch_id: stillPending.batch_id,
          source: stillPending.source,
          status: "pending",
          attempts: 1,
          updated_at: "2026-08-10T12:01:00.000Z",
          output_counts: null,
          descriptor: stillPending.descriptor,
        },
        {
          batch_id: completed.batch_id,
          source: completed.source,
          status: "done",
          attempts: 2,
          updated_at: "2026-08-10T12:02:00.000Z",
          output_counts: { learnings: 3, validation_errors: 0 },
          descriptor: completed.descriptor,
        },
      ];
      writeFileSync(manifestPath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);

      const manifest = loadBackfillManifest(manifestPath);
      const pending = pendingPlannedBatches(planned, manifest);

      expect(manifest.size).toBe(2);
      expect(manifest.get(completed.batch_id)).toMatchObject({
        status: "done",
        attempts: 2,
        output_counts: { learnings: 3, validation_errors: 0 },
      });
      expect(pending.map((batch) => batch.batch_id)).toEqual([stillPending.batch_id]);
    } finally {
      db.close();
    }
  });
});
