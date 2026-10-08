import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runTraceDoctor } from "@agent-kernel/kernel/doctor";

import { MELEE_KERNEL_ID } from "../bridge/config.js";
import { upsertMeleeContainer } from "../bridge/database.js";
import { closeDefaultMeleeKernelRuntime, getDefaultMeleeKernelRuntime } from "../bridge/runtime.js";
import { startMockResponsesServer, type MockResponsesServer } from "./__fixtures__/mock-responses-server";
import { NODE_CALL_MODEL } from "./functions";
import { closeNodeKernel, getNodeKernel } from "./node-kernel";

// Variables that would point the kernel runtime or Pi somewhere other than the temp dirs.
const ISOLATED_ENV = [
  "ORCH_AGENT_KERNEL_DB_PATH",
  "AGENT_KERNEL_DB_PATH",
  "ORCH_AGENT_KERNEL_DATABASE_URL",
  "AGENT_KERNEL_DATABASE_URL",
  "ORCH_AGENT_KERNEL_DISABLED",
  "ORCH_AGENT_KERNEL_DISABLE",
  "ORCH_AGENT_KERNEL_REQUIRED",
  "PI_CODING_AGENT_DIR",
] as const;

const realFetch = globalThis.fetch;
let server: MockResponsesServer;
let savedEnv: Array<[string, string | undefined]> = [];
const tempDirs: string[] = [];

function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

/** A Pi agent dir whose codex-lb provider points at the mock server's stream-only route, like production. */
function writePiAgentDir(apiKey: string): string {
  const dir = tempDir("mn-pi-agent-");
  mkdirSync(dir, { recursive: true });
  const model = (id: string) => ({
    id,
    name: id,
    reasoning: true,
    input: ["text"],
    contextWindow: 372_000,
    maxTokens: 128_000,
  });
  writeFileSync(
    join(dir, "models.json"),
    JSON.stringify({
      providers: {
        "codex-lb": {
          baseUrl: server.url("/backend-api/codex"),
          api: "openai-responses",
          apiKey,
          models: [model("gpt-5.6-sol"), model("gpt-6.1-sol")],
        },
      },
    }),
  );
  return dir;
}

function databaseFiles(path: string): Buffer[] {
  return [path, `${path}-wal`, `${path}-shm`].filter((file) => existsSync(file)).map((file) => readFileSync(file));
}

beforeAll(() => {
  globalThis.fetch = (async () => {
    throw new Error("network disabled in tests");
  }) as unknown as typeof fetch;
  server = startMockResponsesServer();
});

afterAll(async () => {
  globalThis.fetch = realFetch;
  await server.stop();
});

beforeEach(() => {
  savedEnv = ISOLATED_ENV.map((name) => [name, process.env[name]]);
  for (const name of ISOLATED_ENV) delete process.env[name];
  server.requests.length = 0;
});

afterEach(async () => {
  await closeNodeKernel();
  await closeDefaultMeleeKernelRuntime();
  for (const [name, value] of savedEnv) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("node kernel", () => {
  test("node-kernel.ts loads the kernel, BAML and the generated client only on first use", () => {
    // job-runner imports closeNodeKernel on every job start; these stay out of that import graph.
    const source = readFileSync(join(import.meta.dir, "node-kernel.ts"), "utf8");
    const staticValueImports = [...source.matchAll(/^import\s+(?!type\b)[^;]*?from\s+"([^"]+)"/gms)].map((match) => match[1]);
    expect(staticValueImports).toContain("../bridge/runtime.js");
    for (const specifier of staticValueImports) {
      expect(specifier).not.toMatch(/^(@boundaryml\/baml|@server\/generated\/baml_client|@agent-kernel\/kernel)/);
    }
    for (const lazy of ["@agent-kernel/kernel", "@agent-kernel/kernel/baml-engine", "@boundaryml/baml", "@server/generated/baml_client"]) {
      expect(source).toContain(`import("${lazy}")`);
    }
  });

  test("getNodeKernel returns null when the kernel runtime is disabled, and does not cache the null", async () => {
    const stateDir = tempDir("mn-state-");
    process.env.ORCH_AGENT_KERNEL_DISABLED = "1";

    expect(await getNodeKernel({ stateDir })).toBeNull();
    expect(existsSync(join(stateDir, "agent-kernel.sqlite"))).toBe(false);

    delete process.env.ORCH_AGENT_KERNEL_DISABLED;
    expect(await getNodeKernel({ stateDir })).not.toBeNull();
  });

  test("getNodeKernel shares the melee kernel DB; a call through the codex-lb route persists no credential", async () => {
    const stateDir = tempDir("mn-state-");
    const apiKey = `sk-key-marker-${randomUUID()}`;
    process.env.PI_CODING_AGENT_DIR = writePiAgentDir(apiKey);
    server.reply({
      kind: "output",
      text: JSON.stringify({
        advisories: [
          { finding_id: "A1", kept: true, justification: "MWCC folds the const initializer otherwise.", evidence: ["checkdiff PASS (100%)"] },
        ],
        structured_field_used: false,
      }),
      echo: apiKey,
    });

    const kernel = await getNodeKernel({ stateDir });
    expect(kernel).not.toBeNull();
    expect(await getNodeKernel({ stateDir })).toBe(kernel);

    // The node kernel writes into the default melee runtime's database.
    const runtime = await getDefaultMeleeKernelRuntime();
    const databasePath = join(stateDir, "agent-kernel.sqlite");
    expect(runtime?.databasePath).toBe(databasePath);
    const containerId = `melee:test-${randomUUID()}:session`;
    const now = new Date().toISOString();
    await upsertMeleeContainer(runtime!.db, {
      id: containerId,
      kernelId: MELEE_KERNEL_ID,
      kind: "session",
      appKey: [containerId],
      parentContainerId: null,
      label: containerId,
      status: "running",
      workingDir: null,
      phase: null,
      phaseVocabulary: [],
      metadata: {},
      createdAt: now,
      startedAt: now,
    });

    let runId = "";
    const value = await kernel!.call(
      "ExtractCheckpointKnowledge",
      [
        "review_justification: MWCC folds the const initializer otherwise.",
        [
          {
            id: "A1",
            rule_id: "type_erasing_cast",
            severity: "warning",
            file: "src/melee/gm/gmtoulib.c",
            line: 1869,
            excerpt: "templates_800[0] = *(char**) &lbl_804DA6C4;",
            message: "Added type-erasing cast `(char**)`.",
          },
        ],
      ],
      { containerId, onNodeStarted: (ids) => (runId = ids.runId) },
    );
    expect(value.advisories[0]?.justification).toBe("MWCC folds the const initializer otherwise.");
    expect(value.structured_field_used).toBe(false);

    // Production route shape: the manifest model, codex-lb's stream-only path, the credential from Pi.
    expect(server.requests).toHaveLength(1);
    expect(server.requests[0]!.path).toBe("/backend-api/codex/responses");
    expect(server.requests[0]!.body.model).toBe(NODE_CALL_MODEL.split("/")[1]);
    expect(server.requests[0]!.body.stream).toBe(true);
    expect(server.requests[0]!.headers.authorization).toBe(`Bearer ${apiKey}`);

    const db = new Database(databasePath, { readonly: true });
    try {
      expect(db.query("SELECT status FROM agent_runs WHERE id = ?").get(runId)).toEqual({ status: "done" });
      expect(
        db.query("SELECT s.kind FROM pi_agent_sessions s JOIN agent_runs r ON r.pi_session_id = s.id WHERE r.id = ?").get(runId),
      ).toEqual({ kind: "call" });
      const types = (db.query("SELECT type FROM trace_events WHERE run_id = ?").all(runId) as Array<{ type: string }>).map((row) => row.type);
      expect(types).toEqual(expect.arrayContaining(["call_start", "pi_turn_end", "call_end"]));
    } finally {
      db.close();
    }
    expect((await runTraceDoctor(runtime!.db as Parameters<typeof runTraceDoctor>[0])).ok).toBe(true);

    await closeNodeKernel();
    await closeDefaultMeleeKernelRuntime();
    const files = databaseFiles(databasePath);
    // Positive control: the scan finds what the call did persist (its output blob).
    expect(files.some((bytes) => bytes.includes(Buffer.from("MWCC folds the const initializer otherwise.")))).toBe(true);
    for (const bytes of files) expect(bytes.includes(Buffer.from(apiKey))).toBe(false);

    // Closing dropped the singleton: the next caller gets a fresh kernel.
    const reopened = await getNodeKernel({ stateDir });
    expect(reopened).not.toBeNull();
    expect(reopened).not.toBe(kernel);
  });
});
