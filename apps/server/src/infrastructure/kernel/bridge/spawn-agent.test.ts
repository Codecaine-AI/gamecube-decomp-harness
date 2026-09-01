import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "bun:test";

import { createMeleeKernelBridgeConfig } from "./config.js";
import { createMeleeKernelSpawnAgent } from "./spawn-agent.js";

test("uses expectedAgentName for kernel spawn validation", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "melee-kernel-spawn-name-"));
  const spawnedNames: string[] = [];
  const spawn = createMeleeKernelSpawnAgent({
    piOptions: {
      role: "librarian",
      cwd: tempDir,
      outputDir: join(tempDir, "out"),
      dryRun: false,
      prompt: {
        systemPrompt: "system",
        userPrompt: "user",
        systemTemplatePath: "/system.ts",
        userTemplatePath: "/user.ts",
      },
    },
    expectedAgentName: "backfill-librarian",
    parsedAgent: {
      config: {
        name: "backfill-librarian",
        description: "test agent",
        model: "test-model",
        tools: [],
        variables: {},
      },
      body: "system",
    },
    runtime: {
      db: {},
      config: {
        markerConfig: createMeleeKernelBridgeConfig({ workingDir: tempDir }).markerConfig,
        piSessionsDir: join(tempDir, ".pi-sessions"),
      },
    },
    createSpawnAgent: () => async (name) => {
      spawnedNames.push(name);
      return {
        responseText: "ok",
        aborted: false,
        session: {
          sessionId: "22222222-2222-5222-8222-222222222222",
          messages: [],
          dispose() {},
        } as any,
      };
    },
  });
  const context = {
    appSessionId: "11111111-1111-5111-8111-111111111111",
    containerId: "melee:backfill-librarian",
    phase: "librarian",
    workingDir: tempDir,
  };

  const result = await spawn("backfill-librarian", "user", context);

  expect(result.rawText).toBe("ok");
  expect(spawnedNames).toEqual(["backfill-librarian"]);
  await expect(spawn("worker-summarizer", "user", context)).rejects.toThrow(
    "Melee kernel spawn mismatch: expected backfill-librarian, got worker-summarizer",
  );
  expect(spawnedNames).toEqual(["backfill-librarian"]);
});
