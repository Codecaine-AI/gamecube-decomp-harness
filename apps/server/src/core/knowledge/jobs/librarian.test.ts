import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { openState } from "@server/core/orchestrator-state";
import { kgLibrarianCondense } from "./librarian.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("librarian condense", () => {
  test("throws when the model runner hangs", async () => {
    const stateDir = mkdtempSync(join(tmpdir(), "librarian-timeout-"));
    tempDirs.push(stateDir);
    const store = openState(stateDir);
    store.db
      .query(
        `INSERT INTO runs (id, goal_kind, goal_value, desired_workers, status, created_at, game_id, revision, trace_id)
        VALUES ('run-1', 'matched_percent', 100, 1, 'active', '2026-08-19T00:00:00.000Z', 'melee', 0, 'trace-run-1')`,
      )
      .run();
    store.db
      .query(
        `INSERT INTO worker_state (id, run_id, epoch_id, epoch_target_id, target_claim_id, worker_id,
          target_key, lifecycle_status, started_at, ended_at, summary_json)
        VALUES ('worker-state-1', 'run-1', 'epoch-1', 'target-1', 'claim-1', 'worker-1',
          'unit::symbol', 'finished', '2026-08-19T00:00:00.000Z', '2026-08-19T00:01:00.000Z', '{}')`,
      )
      .run();
    store.db.close();
    const globals: GlobalArgs = {
      repoRoot: resolve(stateDir, "repo"),
      stateDir,
      gameId: "melee",
      dryRunAgents: false,
      provider: "test-provider",
      model: "test-model",
      thinkingLevel: "medium",
      agentTimeoutSeconds: 0.05,
    };

    const startedAt = Date.now();
    await expect(
      kgLibrarianCondense(
        globals,
        new Map([
          ["--worker-state-id", "worker-state-1"],
          ["--run-id", "run-1"],
          ["--ledger-path", resolve(stateDir, "ledger.jsonl")],
        ]),
        { runPiAgent: async () => new Promise<never>(() => {}) },
      ),
    ).rejects.toThrow("librarian timed out after 50ms");

    expect(Date.now() - startedAt).toBeLessThan(2_000);
  });
});
