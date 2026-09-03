import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";
import type { NewAgentRun, NewPiAgentSession } from "@agent-kernel/db";

import {
  runAppTranscriptBackfill,
  type AppTranscriptBackfillIdentityStore,
} from "./transcript-backfill.js";
import {
  parseArgs,
  resolveDefaultTranscriptBackfillRoots,
} from "./transcript-backfill-cli.js";

const PI_SESSION_ID = "22222222-2222-5222-8222-222222222222";
const RUN_ID = "33333333-3333-5333-8333-333333333333";

function transcript(options: { sessionId?: string; runId?: string } = {}): string {
  const sessionId = options.sessionId ?? PI_SESSION_ID;
  const runId = options.runId ?? RUN_ID;
  return [
    { type: "session", version: 3, id: sessionId, timestamp: "2026-08-25T10:00:00.000Z", cwd: "/repo" },
    { type: "model_change", id: "model", parentId: null, timestamp: "2026-08-25T10:00:01.000Z", provider: "openai", modelId: "gpt-5.6" },
    {
      type: "custom", id: "binding", parentId: null, timestamp: "2026-08-25T10:00:02.000Z",
      customType: "agent-kernel:session-binding",
      data: { containerId: "melee:session:worker", agentName: "worker", displayLabel: "Worker A", phase: "worker", runId },
    },
    {
      type: "custom", id: "start", parentId: null, timestamp: "2026-08-25T10:00:03.000Z",
      customType: "agent-kernel:pi-lifecycle", data: { phase: "agent_start" },
    },
    {
      type: "custom", id: "end", parentId: null, timestamp: "2026-08-25T10:01:00.000Z",
      customType: "agent-kernel:pi-lifecycle", data: { phase: "agent_end", inputTokens: 12, outputTokens: 34 },
    },
  ].map((event) => JSON.stringify(event)).join("\n") + "\n";
}

function identityStore(existingSessions: string[] = [], existingRuns: string[] = []) {
  const sessionIds = new Set(existingSessions);
  const runIds = new Set(existingRuns);
  const sessions: NewPiAgentSession[] = [];
  const runs: NewAgentRun[] = [];
  const store: AppTranscriptBackfillIdentityStore = {
    hasPiSession: async (_db, id) => sessionIds.has(id),
    hasAgentRun: async (_db, id) => runIds.has(id),
    insertPiSession: async (_db, row) => {
      sessions.push(row);
      sessionIds.add(row.id);
      return true;
    },
    insertAgentRun: async (_db, row) => {
      runs.push(row);
      runIds.add(row.id);
      return true;
    },
  };
  return { store, sessions, runs };
}

const fakeBackfill = async (options: { files?: string[] }) => ({
  filesProcessed: options.files?.length ?? 0,
  eventsMapped: (options.files?.length ?? 0) * 5,
  eventsInserted: (options.files?.length ?? 0) * 5,
  eventsSkipped: 0,
  warnings: [],
});

describe("transcript backfill CLI", () => {
  test("resolves existing default roots without opening a database", () => {
    const orchestratorRoot = "/fake/orchestrator";
    const existing = new Set([
      "/fake/orchestrator/games/melee/state/runs",
      "/fake/orchestrator/.pi-sessions",
      "/fake/orchestrator/games/melee/checkout/.pi-sessions",
    ]);

    const roots = resolveDefaultTranscriptBackfillRoots({
      orchestratorRoot,
      pathExists: (path) => existing.has(path),
      resolveGamePaths: () => ({
        stateDir: "/fake/orchestrator/games/melee/state",
        repoRoot: "/fake/orchestrator/games/melee/checkout",
      }),
    });

    expect(parseArgs([], roots).roots).toEqual([...existing]);
    expect(parseArgs(["--root", "/explicit"], roots).roots).toEqual(["/explicit"]);
  });
});

describe("runAppTranscriptBackfill", () => {
  test("enumerates nested JSONL files across roots and skips missing roots", async () => {
    const base = await mkdtemp(join(tmpdir(), "melee-backfill-"));
    const rootA = join(base, "a");
    const rootB = join(base, "b");
    await mkdir(join(rootA, "nested"), { recursive: true });
    await mkdir(rootB, { recursive: true });
    await Promise.all([
      writeFile(join(rootA, "one.jsonl"), transcript()),
      writeFile(join(rootA, "nested", "two.jsonl"), transcript({ sessionId: "44444444-4444-5444-8444-444444444444", runId: "55555555-5555-5555-8555-555555555555" })),
      writeFile(join(rootB, "ignored.txt"), "not a transcript"),
    ]);
    const identities = identityStore();

    const result = await runAppTranscriptBackfill({
      db: {}, roots: [rootA, rootB, join(base, "missing")],
      ports: { backfill: fakeBackfill as any, identityStore: identities.store },
    });

    expect(result.files).toBe(2);
    expect(result.roots.map((root) => root.files)).toEqual([2, 0, 0]);
    expect(result.eventsInserted).toBe(10);
  });

  test("inserts missing Pi session and agent run identity rows", async () => {
    const root = await mkdtemp(join(tmpdir(), "melee-backfill-"));
    await writeFile(join(root, "session.jsonl"), transcript());
    const identities = identityStore();

    const result = await runAppTranscriptBackfill({
      db: {}, roots: [root], ports: { backfill: fakeBackfill as any, identityStore: identities.store },
    });

    expect(result.piSessionsInserted).toBe(1);
    expect(result.agentRunsInserted).toBe(1);
    expect(identities.sessions[0]).toMatchObject({
      id: PI_SESSION_ID, containerId: "melee:session:worker", agentName: "worker",
      model: "gpt-5.6", status: "ended", usageInputTokens: 12, usageOutputTokens: 34,
      endedAt: "2026-08-25T10:01:00.000Z",
    });
    expect(identities.runs[0]).toMatchObject({ id: RUN_ID, piSessionId: PI_SESSION_ID, status: "done" });
  });

  test("does not overwrite identity rows that already exist", async () => {
    const root = await mkdtemp(join(tmpdir(), "melee-backfill-"));
    await writeFile(join(root, "session.jsonl"), transcript());
    const identities = identityStore([PI_SESSION_ID], [RUN_ID]);

    const result = await runAppTranscriptBackfill({
      db: {}, roots: [root], ports: { backfill: fakeBackfill as any, identityStore: identities.store },
    });

    expect(result.piSessionsSkipped).toBe(1);
    expect(result.agentRunsSkipped).toBe(1);
    expect(identities.sessions).toHaveLength(0);
    expect(identities.runs).toHaveLength(0);
  });

  test("dry run parses and reports without writing", async () => {
    const root = await mkdtemp(join(tmpdir(), "melee-backfill-"));
    await writeFile(join(root, "session.jsonl"), transcript());
    const identities = identityStore();
    let backfillCalls = 0;

    const result = await runAppTranscriptBackfill({
      db: {}, roots: [root], dryRun: true,
      ports: {
        backfill: async () => { backfillCalls++; return fakeBackfill({ files: [] }); },
        identityStore: identities.store,
      },
    });

    expect(result.dryRun).toBeTrue();
    expect(result.eventsInserted).toBeGreaterThan(0);
    expect(result.piSessionsInserted).toBe(1);
    expect(result.agentRunsInserted).toBe(1);
    expect(backfillCalls).toBe(0);
    expect(identities.sessions).toHaveLength(0);
    expect(identities.runs).toHaveLength(0);
  });
});
