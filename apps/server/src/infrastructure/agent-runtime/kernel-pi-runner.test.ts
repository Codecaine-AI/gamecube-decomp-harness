import { describe, expect, test } from "bun:test";
import { appKernelAgent, type KernelAgentId } from "@server/core/agent-catalog/kernel-catalog";
import {
  createAppKernelPiAgentRunner,
  createPiChildProcessReaper,
  type AppKernelPiRunOptions,
} from "./kernel-pi-runner.js";

function dryRunOptions(
  overrides: Partial<AppKernelPiRunOptions> = {},
): AppKernelPiRunOptions {
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
    const runner = createAppKernelPiAgentRunner({
      resolveKernelAgent(role, catalogAgentId) {
        return appKernelAgent(catalogAgentId ?? (role as KernelAgentId));
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
    const runner = createAppKernelPiAgentRunner({
      resolveKernelAgent(role, catalogAgentId) {
        return appKernelAgent(catalogAgentId ?? (role as KernelAgentId));
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
