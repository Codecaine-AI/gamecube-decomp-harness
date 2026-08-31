import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { getContainer } from "@agent-kernel/db";
import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";

import {
  DEFAULT_AGENT_KERNEL_DB_PATH,
  ensureKernelObservabilitySchema,
  openMeleeKernelDatabase,
  resolveMeleeKernelDatabasePath,
  upsertMeleeContainer,
} from "./database.js";
import { getMeleeKernelTraceReadRows } from "./read-api.js";
import { resolveMeleeKernelTraceIdentity } from "./runtime.js";

const tempDirs: string[] = [];

function tempDir(): string {
  const path = mkdtempSync(join(tmpdir(), "melee-kernel-database-"));
  tempDirs.push(path);
  return path;
}

afterEach(() => {
  for (const path of tempDirs.splice(0)) {
    rmSync(path, { force: true, recursive: true });
  }
});

describe("Melee Agent Kernel SQLite database", () => {
  test("opens a file, bootstraps the schema, and round-trips a container", async () => {
    const root = tempDir();
    const databasePath = join(root, "nested", "agent-kernel.sqlite");
    const handle = await openMeleeKernelDatabase({ databasePath, env: {} });

    try {
      expect(handle.databasePath).toBe(databasePath);
      expect(handle.databaseUrl).toStartWith("file:");
      expect(existsSync(databasePath)).toBe(true);

      await ensureKernelObservabilitySchema(handle.db);
      const createdAt = "2026-08-31T12:00:00.000Z";
      const inserted = await upsertMeleeContainer(handle.db, {
        id: "melee:test:session",
        kernelId: "melee-decomp-orchestrator",
        kind: "session",
        appKey: ["melee", "test"],
        label: "SQLite bridge test",
        status: "active",
        parentContainerId: null,
        phase: "test",
        phaseVocabulary: ["test"],
        workingDir: root,
        metadata: {
          appSessionId: "sqlite-bridge-session",
          gameId: "melee",
          source: "database.test",
        },
        usageInputTokens: 7,
        usageOutputTokens: 3,
        usageCacheRead: 2,
        usageCacheWrite: 1,
        usageCostEstimate: 0.25,
        createdAt,
        startedAt: createdAt,
        endedAt: null,
      });
      const roundTrip = await getContainer(handle.db, inserted.id);

      expect(roundTrip).toEqual(inserted);
      expect(roundTrip).toMatchObject({
        appKey: ["melee", "test"],
        metadata: {
          appSessionId: "sqlite-bridge-session",
          gameId: "melee",
          source: "database.test",
        },
        usageInputTokens: 7,
      });
      expect(
        await resolveMeleeKernelTraceIdentity(handle.db, "sqlite-bridge-session"),
      ).toBe(inserted.id);
      expect(
        (await getMeleeKernelTraceReadRows(handle.db, inserted.id))?.rootContainer,
      ).toEqual(inserted);

      const native = new Database(databasePath, { readonly: true });
      try {
        expect(native.query("PRAGMA journal_mode").get()).toEqual({ journal_mode: "wal" });
        expect(
          native.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'containers'").get(),
        ).toEqual({ name: "containers" });
      } finally {
        native.close();
      }
    } finally {
      await handle.close();
    }
  });

  test("resolves explicit, environment, state-directory, and default paths in order", () => {
    const root = tempDir();
    const explicit = join(root, "explicit.sqlite");
    const fromEnv = join(root, "env.sqlite");
    const stateDir = join(root, "state");

    expect(resolveMeleeKernelDatabasePath({
      databasePath: explicit,
      stateDir,
      env: { ORCH_AGENT_KERNEL_DB_PATH: fromEnv },
    })).toBe(explicit);
    expect(resolveMeleeKernelDatabasePath({
      stateDir,
      env: { ORCH_AGENT_KERNEL_DB_PATH: fromEnv },
    })).toBe(fromEnv);
    expect(resolveMeleeKernelDatabasePath({ stateDir, env: {} })).toBe(
      join(stateDir, "agent-kernel.sqlite"),
    );
    expect(resolveMeleeKernelDatabasePath({ env: {} })).toBe(DEFAULT_AGENT_KERNEL_DB_PATH);
    expect(resolveMeleeKernelDatabasePath({
      databasePath: "relative-agent-kernel.sqlite",
      env: {},
    })).toBe(resolve("relative-agent-kernel.sqlite"));
  });

  test("rejects the removed Postgres compatibility path", () => {
    expect(() => resolveMeleeKernelDatabasePath({
      databaseUrl: "postgres://agent_kernel@127.0.0.1/agent_kernel",
      env: {},
    })).toThrow("Postgres Agent Kernel URLs are no longer supported");
  });
});
