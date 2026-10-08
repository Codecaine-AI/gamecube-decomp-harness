import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openState } from "@server/core/orchestrator-state";
import { prepareEpochBaseline, readBaselineSourceCommit, writeBaselineSource } from "./epoch-baseline.js";

const OLD_HEAD = "964fc1a68d0000000000000000000000000000aa";
const START_HEAD = "72b90a1090d9b1d1c0d4b8e96492cf0a6858fad1";
const cleanup: string[] = [];

afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

function report(matched: number): string {
  return `${JSON.stringify({ measures: { matched_code_percent: matched } })}\n`;
}

function setup() {
  const root = mkdtempSync(join(tmpdir(), "epoch-baseline-"));
  cleanup.push(root);
  const stateDir = join(root, "state");
  const baselinePath = join(root, "epoch_worktree", "build", "GMSJ01", "baseline.json");
  mkdirSync(join(root, "epoch_worktree", "build", "GMSJ01"), { recursive: true });
  const store = openState(stateDir);
  const admitEpoch = (epochId: string, head: string) => store.db.query(`
    INSERT INTO harness_timeline_entries (game_id, harness_id, event_id, command_id, kind, occurred_at, payload_json)
    VALUES ('sms', 'harness-sms', ?, ?, 'epoch_admitted', '2026-10-08T02:02:11.611Z', ?)
  `).run(`epoch-admitted:${epochId}`, `epoch-admitted:${epochId}`, JSON.stringify({ evidence: { accepted_head: head } }));
  const addSavePoint = (id: string, commit: string, reportPath: string, createdAt: string) => store.db.query(`
    INSERT INTO save_points (id, campaign_id, trigger_kind, commit_sha, report_path, payload_json, created_at)
    VALUES (?, 'campaign', 'pr_sync', ?, ?, '{}', ?)
  `).run(id, commit, reportPath, createdAt);
  return { root, stateDir, baselinePath, store, admitEpoch, addSavePoint };
}

describe("prepareEpochBaseline", () => {
  test("replaces a persisted baseline from an older commit with the epoch-start report", async () => {
    const env = setup();
    try {
      // Sep-16 rolling baseline left in the persistent epoch worktree.
      writeFileSync(env.baselinePath, report(42.48));
      await writeBaselineSource(env.baselinePath, OLD_HEAD, null);
      const startReport = join(env.stateDir, "pr_sync_reports", "epoch-prev", "report.json");
      mkdirSync(join(env.stateDir, "pr_sync_reports", "epoch-prev"), { recursive: true });
      writeFileSync(startReport, report(49.17));
      env.addSavePoint("sp-start", START_HEAD, startReport, "2026-10-07T18:36:56.838Z");
      env.admitEpoch("epoch-1", START_HEAD);

      const decision = await prepareEpochBaseline({
        store: env.store, stateDir: env.stateDir, epochId: "epoch-1", gameId: "sms", baselinePath: env.baselinePath,
      });

      expect(decision).toMatchObject({ status: "seeded", startHead: START_HEAD, resetBaseline: false, staleCommit: OLD_HEAD, savePointId: "sp-start" });
      expect(readFileSync(env.baselinePath, "utf8")).toBe(report(49.17));
      expect(readBaselineSourceCommit(env.baselinePath)).toBe(START_HEAD);
    } finally {
      env.store.db.close();
    }
  });

  test("keeps a baseline already recorded at the epoch start head", async () => {
    const env = setup();
    try {
      writeFileSync(env.baselinePath, report(49.17));
      await writeBaselineSource(env.baselinePath, START_HEAD, null);
      env.admitEpoch("epoch-1", START_HEAD);

      const decision = await prepareEpochBaseline({
        store: env.store, stateDir: env.stateDir, epochId: "epoch-1", gameId: "sms", baselinePath: env.baselinePath,
      });

      expect(decision).toEqual({ status: "verified", startHead: START_HEAD, resetBaseline: false });
      expect(readFileSync(env.baselinePath, "utf8")).toBe(report(49.17));
    } finally {
      env.store.db.close();
    }
  });

  test("resets instead of diffing when the start head has only a live-checkout report", async () => {
    const env = setup();
    try {
      writeFileSync(env.baselinePath, report(42.48));
      const liveReport = join(env.root, "checkout", "build", "GMSJ01", "report.json");
      mkdirSync(join(env.root, "checkout", "build", "GMSJ01"), { recursive: true });
      writeFileSync(liveReport, report(51.0));
      env.addSavePoint("sp-sync", START_HEAD, liveReport, "2026-10-07T18:36:56.838Z");
      env.admitEpoch("epoch-1", START_HEAD);

      const decision = await prepareEpochBaseline({
        store: env.store, stateDir: env.stateDir, epochId: "epoch-1", gameId: "sms", baselinePath: env.baselinePath,
      });

      expect(decision).toMatchObject({ status: "unverified", startHead: START_HEAD, resetBaseline: true, staleCommit: null });
      expect(readFileSync(env.baselinePath, "utf8")).toBe(report(42.48));
    } finally {
      env.store.db.close();
    }
  });
});
