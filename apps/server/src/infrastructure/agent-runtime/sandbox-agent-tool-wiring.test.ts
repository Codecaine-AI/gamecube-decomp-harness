import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { FakeSandboxProvider } from "@server/core/job-queue/sandbox.js";
import { buildMeleeKernelToolFactories } from "./kernel-pi-runner.js";
import {
  createSandboxFileToolDefinitions,
  sandboxBashOperations,
} from "./sandbox-agent-tools.js";
import { buildPiToolRegistration } from "./runtime/pi-agent.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function fixture() {
  const hostRoot = await mkdtemp(join(tmpdir(), "sandbox-agent-tool-wiring-"));
  roots.push(hostRoot);
  const provider = new FakeSandboxProvider();
  const handle = await provider.create({
    snapshot: "test",
    labels: { test: "tool-wiring" },
    resources: { cpu: 2, memoryGiB: 4, diskGiB: 5 },
    ttlMinutes: 30,
  });
  const workspaceRoot = "/sandbox/workspace";
  const fileTools = createSandboxFileToolDefinitions(handle, workspaceRoot).map((tool) => ({
    ...tool,
    label: `sandbox-${tool.name}`,
  }));
  return { hostRoot, provider, handle, workspaceRoot, fileTools };
}

function activeTools(session: Awaited<ReturnType<typeof createAgentSession>>["session"]) {
  return session.agent.state.tools;
}

async function executeBash(
  session: Awaited<ReturnType<typeof createAgentSession>>["session"],
  command: string,
): Promise<void> {
  const bash = activeTools(session).find((tool) => tool.name === "bash");
  if (!bash) throw new Error("bash tool was not registered");
  await bash.execute("bash-proof", { command }, undefined, () => {});
}

describe("sandbox same-name agent tool wiring", () => {
  test("direct Pi custom tools replace builtins while write remains excluded", async () => {
    const { hostRoot, provider, handle, workspaceRoot, fileTools } = await fixture();
    provider.scriptExec({ exitCode: 0, stdout: "direct", stderr: "" });
    const registration = buildPiToolRegistration({
      cwd: hostRoot,
      toolContext: { cwd: workspaceRoot },
      customTools: fileTools,
      bashOperations: sandboxBashOperations(handle, workspaceRoot),
      bashEnvironment: { SANDBOX_PATH: "direct" },
      excludeBuiltinTools: ["write", "read", "edit", "grep", "glob", "bash"],
    }, []);

    const { session } = await createAgentSession({
      cwd: hostRoot,
      agentDir: hostRoot,
      sessionManager: SessionManager.create(hostRoot, join(hostRoot, "direct-sessions")),
      customTools: registration.customTools as never,
      excludeTools: registration.excludedTools,
    });
    const tools = activeTools(session);

    expect(registration.excludedTools).toEqual(["write"]);
    expect(Object.fromEntries(tools.map((tool) => [tool.name, tool.label]))).toMatchObject({
      read: "sandbox-read",
      edit: "sandbox-edit",
      grep: "sandbox-grep",
      glob: "sandbox-glob",
      bash: "bash",
    });
    expect(tools.some((tool) => tool.name === "write")).toBe(false);

    await executeBash(session, "printf direct");
    expect(provider.execCalls.at(-1)).toMatchObject({
      command: ["/bin/bash", "-lc", "printf direct"],
      opts: { cwd: workspaceRoot, env: { SANDBOX_PATH: "direct" } },
    });
  });

  test("kernel extension factories replace the same-named Pi builtins", async () => {
    const { hostRoot, provider, handle, workspaceRoot, fileTools } = await fixture();
    provider.scriptExec({ exitCode: 0, stdout: "kernel", stderr: "" });
    const extensionFactories = buildMeleeKernelToolFactories({
      role: "worker",
      cwd: hostRoot,
      prompt: {
        systemPrompt: "test",
        userPrompt: "test",
        systemTemplatePath: "test",
        userTemplatePath: "test",
      },
      outputDir: hostRoot,
      dryRun: true,
      toolContext: { cwd: workspaceRoot, repoRoot: workspaceRoot },
      customTools: fileTools,
      bashOperations: sandboxBashOperations(handle, workspaceRoot),
      bashEnvironment: { SANDBOX_PATH: "kernel" },
      excludeBuiltinTools: ["write", "read", "edit", "grep", "glob", "bash"],
    });
    const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false } });
    const resourceLoader = new DefaultResourceLoader({
      cwd: hostRoot,
      agentDir: hostRoot,
      settingsManager,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noExtensions: true,
      systemPromptOverride: () => "test",
      extensionFactories,
    });
    await resourceLoader.reload();
    const { session } = await createAgentSession({
      cwd: hostRoot,
      agentDir: hostRoot,
      settingsManager,
      sessionManager: SessionManager.create(hostRoot, join(hostRoot, "kernel-sessions")),
      resourceLoader,
    });
    const tools = activeTools(session);

    expect(Object.fromEntries(tools.map((tool) => [tool.name, tool.label]))).toMatchObject({
      read: "sandbox-read",
      edit: "sandbox-edit",
      grep: "sandbox-grep",
      glob: "sandbox-glob",
      bash: "bash",
    });

    await executeBash(session, "printf kernel");
    expect(provider.execCalls.at(-1)).toMatchObject({
      command: ["/bin/bash", "-lc", "printf kernel"],
      opts: { cwd: workspaceRoot, env: { SANDBOX_PATH: "kernel" } },
    });
  });
});
