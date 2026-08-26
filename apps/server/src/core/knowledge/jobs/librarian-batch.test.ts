import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { loadBackfillManifest, type BatchOutcome, type PlannedBatch } from "./librarian-backfill.js";
import { kgLibrarianBatch } from "./librarian-batch.js";

const roots: string[] = [];

afterEach(() => {
  process.exitCode = 0;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "librarian-batch-"));
  roots.push(root);
  const batch: PlannedBatch = {
    batch_id: "discord-batch-1",
    source: "discord",
    descriptor: {
      channel_id: "channel-1", file: join(root, "2026-08.jsonl"), month: "2026-08",
      start_line: 0, end_line: 1, message_count: 1,
    },
  };
  const batchFile = join(root, "batch.json");
  const manifestPath = join(root, "manifest.jsonl");
  writeFileSync(batchFile, JSON.stringify({ batch, payload: { kind: "discord_backfill", messages: [] } }));
  const globals: GlobalArgs = {
    repoRoot: root, stateDir: root, dryRunAgents: true,
    provider: "test", model: "test", thinkingLevel: "low",
  };
  const args = new Map<string, string>([
    ["--batch-file", batchFile], ["--output-dir", join(root, "output")],
    ["--ledger-path", join(root, "ledger.jsonl")], ["--manifest-path", manifestPath],
  ]);
  return { args, batch, globals, manifestPath };
}

function outcome(batch: PlannedBatch, failed: boolean): BatchOutcome {
  return {
    batch, failed, records: [], validationErrors: failed ? ["invalid report"] : [],
    parseError: failed ? "agent failed" : null, result: null,
    outputCounts: { learnings: 0, validation_errors: failed ? 1 : 0 },
  };
}

describe("kg-librarian-batch", () => {
  test("does not create a manifest during a dry run", async () => {
    const current = fixture();
    await kgLibrarianBatch(current.globals, current.args, {
      runBatch: async () => outcome(current.batch, false),
    });
    expect(existsSync(current.manifestPath)).toBe(false);
  });

  test("appends a failed manifest row and sets a nonzero exit code", async () => {
    const current = fixture();
    current.globals.dryRunAgents = false;
    await kgLibrarianBatch(current.globals, current.args, {
      runBatch: async () => outcome(current.batch, true),
    });
    expect(loadBackfillManifest(current.manifestPath).get(current.batch.batch_id)).toMatchObject({
      status: "failed", attempts: 1, error: "agent failed",
    });
    expect(process.exitCode).toBe(1);
    expect(readFileSync(current.manifestPath, "utf8")).toContain("discord-batch-1");
  });
});
