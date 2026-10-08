import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "bun:test";
import { meleeKernelAgent, type KernelAgentId } from "@server/core/agent-catalog/kernel-catalog";
import { createMeleeKernelBridgeConfig } from "@server/infrastructure/kernel/bridge/config";
import type { MeleeKernelPipelineSpawnAgent } from "@server/infrastructure/kernel/bridge/spawn-agent";
import {
  createMeleeKernelPiAgentRunner,
  createPiChildProcessReaper,
  type MeleeKernelPiRunOptions,
} from "./kernel-pi-runner.js";

function dryRunOptions(
  overrides: Partial<MeleeKernelPiRunOptions> = {},
): MeleeKernelPiRunOptions {
  return {
    role: "worker",
    cwd: "/repo",
    outputDir: "/out",
    dryRun: true,
    autoInitializeKernelRuntime: false,
    prompt: {
      systemPrompt: "system prompt",
      userPrompt: "user prompt",
      systemTemplatePath: "/templates/system.ts",
      userTemplatePath: "/templates/user.ts",
    },
    ...overrides,
  };
}

describe("Melee kernel Pi agent resolution", () => {
  test("prefers catalogAgentId when it differs from the runtime role", async () => {
    const resolvedNames: string[] = [];
    const runner = createMeleeKernelPiAgentRunner({
      resolveKernelAgent(role, catalogAgentId) {
        return meleeKernelAgent(catalogAgentId ?? (role as KernelAgentId));
      },
      toKernelParsedAgentFromBundle(entry, bundle) {
        resolvedNames.push(entry.name);
        return {
          parsed: {
            config: {
              name: entry.name,
              description: "test agent",
              model: "test-model",
              tools: [],
              variables: {},
            },
            body: bundle.systemPrompt,
          },
          userPrompt: bundle.userPrompt,
        };
      },
      runPiAgent: async () => ({
        sessionId: "session-1",
        sessionDir: "/sessions/pr-reviewer",
        outputPath: "/out/result.txt",
        systemPromptPath: "/out/system.md",
        userPromptPath: "/out/user.md",
        rawText: "summary",
        dryRun: true,
      }),
    });

    await runner(dryRunOptions({
      role: "pr-reviewer",
      catalogAgentId: "worker-summarizer",
    }));

    expect(resolvedNames).toEqual(["worker-summarizer"]);
  });

  test("keeps role-based catalog resolution without catalogAgentId", async () => {
    const resolvedNames: string[] = [];
    const runner = createMeleeKernelPiAgentRunner({
      resolveKernelAgent(role, catalogAgentId) {
        return meleeKernelAgent(catalogAgentId ?? (role as KernelAgentId));
      },
      toKernelParsedAgentFromBundle(entry, bundle) {
        resolvedNames.push(entry.name);
        return {
          parsed: {
            config: {
              name: entry.name,
              description: "test agent",
              model: "test-model",
              tools: [],
              variables: {},
            },
            body: bundle.systemPrompt,
          },
          userPrompt: bundle.userPrompt,
        };
      },
      runPiAgent: async () => ({
        sessionId: "session-2",
        sessionDir: "/sessions/pr-reviewer",
        outputPath: "/out/result.txt",
        systemPromptPath: "/out/system.md",
        userPromptPath: "/out/user.md",
        rawText: "review",
        dryRun: true,
      }),
    });

    await runner(dryRunOptions());

    expect(resolvedNames).toEqual(["worker"]);
  });
});

describe("Melee kernel spawn run identity", () => {
  const appSessionId = "11111111-1111-5111-8111-111111111111";
  const containerId = "melee:run-ids:worker";
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  async function kernelSpawnOptions(): Promise<MeleeKernelPiRunOptions> {
    const tempDir = await mkdtemp(join(tmpdir(), "melee-kernel-run-ids-"));
    tempDirs.push(tempDir);
    return dryRunOptions({
      cwd: tempDir,
      outputDir: join(tempDir, "out"),
      dryRun: false,
      kernelSpawnStrategy: "kernel",
      kernelRuntime: {
        db: {},
        config: {
          markerConfig: createMeleeKernelBridgeConfig({ workingDir: tempDir }).markerConfig,
          piSessionsDir: join(tempDir, ".pi-sessions"),
        },
      },
      kernelContext: { appSessionId, containerId, workingDir: tempDir },
    });
  }

  function runnerWithKernelSpawn(spawn: MeleeKernelPipelineSpawnAgent) {
    return createMeleeKernelPiAgentRunner({ createKernelSpawnAgent: () => spawn });
  }

  test("PiRunResult carries kernel run ids on success and on spawn failure", async () => {
    // Both fakes behave like the kernel: onRunStarted fires before the session exists.
    const succeeded = await runnerWithKernelSpawn(async (_name, _prompt, _ctx, opts = {}) => {
      opts.onRunStarted?.({ runId: "run-succeeded", containerId: opts.containerId! });
      return {
        responseText: "done",
        aborted: false,
        session: { sessionId: "pi-session-succeeded", messages: [], dispose() {} } as any,
        runId: "run-succeeded",
        containerId: opts.containerId,
        piSessionId: "pi-session-succeeded",
      };
    })(await kernelSpawnOptions());

    expect(succeeded.failed).toBeUndefined();
    expect(succeeded.rawText).toBe("done");
    expect(succeeded.kernelRunId).toBe("run-succeeded");
    expect(succeeded.kernelContainerId).toBe(containerId);
    expect(succeeded.kernelPiSessionId).toBe("pi-session-succeeded");

    const failed = await runnerWithKernelSpawn(async (_name, _prompt, _ctx, opts = {}) => {
      opts.onRunStarted?.({ runId: "run-failed", containerId: opts.containerId! });
      throw new Error("provider connection reset");
    })(await kernelSpawnOptions());

    expect(failed.failed).toBe(true);
    expect(failed.providerError).toBe("provider connection reset");
    expect(failed.kernelRunId).toBe("run-failed");
    expect(failed.kernelContainerId).toBe(containerId);
    expect(failed.kernelPiSessionId).toBeUndefined();
  });

  test("dry runs never open a kernel run and carry no kernel ids", async () => {
    let kernelSpawns = 0;
    const runner = createMeleeKernelPiAgentRunner({
      createKernelSpawnAgent: () => async () => {
        kernelSpawns += 1;
        throw new Error("dry run reached the kernel spawn");
      },
      runPiAgent: async () => ({
        sessionId: "dry-session",
        outputPath: "/out/result.txt",
        systemPromptPath: "/out/system.md",
        userPromptPath: "/out/user.md",
        rawText: "",
        dryRun: true,
      }),
    });

    const result = await runner(dryRunOptions());

    expect(kernelSpawns).toBe(0);
    expect(result.dryRun).toBe(true);
    expect(result.kernelRunId).toBeUndefined();
    expect(result.kernelContainerId).toBeUndefined();
    expect(result.kernelPiSessionId).toBeUndefined();
  });
});

describe("Pi child process reaper", () => {
  test("SIGTERM reaps registered process groups before exiting", () => {
    const kills: Array<{ pid: number; signal: string }> = [];
    const exits: number[] = [];
    const scheduled: Array<{ callback: () => void; delayMs: number }> = [];
    const reaper = createPiChildProcessReaper({
      platform: "darwin",
      kill(pid, signal) {
        kills.push({ pid, signal });
      },
      schedule(callback, delayMs) {
        scheduled.push({ callback, delayMs });
      },
      exit(code) {
        exits.push(code);
      },
    });
    reaper.registerProcessGroup(1201);
    reaper.registerProcessGroup(1202);
    reaper.registerProcessGroup(1202);

    reaper.handleSignal("SIGTERM");

    expect(kills).toEqual([
      { pid: -1201, signal: "SIGTERM" },
      { pid: -1202, signal: "SIGTERM" },
    ]);
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]?.delayMs).toBe(5_000);
    expect(exits).toEqual([]);

    reaper.unregisterProcessGroup(1201);
    scheduled[0]!.callback();

    expect(kills).toEqual([
      { pid: -1201, signal: "SIGTERM" },
      { pid: -1202, signal: "SIGTERM" },
      { pid: -1201, signal: "SIGKILL" },
      { pid: -1202, signal: "SIGKILL" },
    ]);
    expect(reaper.processGroupCount()).toBe(0);
    expect(exits).toEqual([143]);
  });

  test("normal completion unregisters a process group", () => {
    const kills: Array<{ pid: number; signal: string }> = [];
    let scheduled = false;
    const reaper = createPiChildProcessReaper({
      platform: "darwin",
      kill(pid, signal) {
        kills.push({ pid, signal });
      },
      schedule() {
        scheduled = true;
      },
      exit() {},
    });
    reaper.registerProcessGroup(1301);
    reaper.unregisterProcessGroup(1301);

    expect(reaper.processGroupCount()).toBe(0);
    reaper.handleSignal("SIGTERM");

    expect(kills).toEqual([]);
    expect(scheduled).toBe(true);
  });
});
