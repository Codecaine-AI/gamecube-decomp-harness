import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
} from "@agent-kernel/kernel/pi-sdk";
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

function activeTool(session: Awaited<ReturnType<typeof createAgentSession>>["session"], name: string) {
  const tool = activeTools(session).find((candidate) => candidate.name === name);
  if (!tool) throw new Error(`${name} tool was not registered`);
  return tool;
}

async function executeBash(
  session: Awaited<ReturnType<typeof createAgentSession>>["session"],
  command: string,
): Promise<void> {
  await activeTool(session, "bash").execute("bash-proof", { command }, undefined, () => {});
}

function resultText(result: { content: Array<{ type: string; text?: string }> }): string {
  return result.content.map((part) => (part.type === "text" ? part.text ?? "" : "")).join("");
}

/**
 * Pi passes the session's host cwd to tools as `ctx.cwd`; relative paths must still resolve in
 * the sandbox workspace. Tools run from the session's active list, so Pi supplies that context.
 */
async function expectRelativeFileToolsUseSandbox(
  session: Awaited<ReturnType<typeof createAgentSession>>["session"],
  { provider, handle, hostRoot, workspaceRoot }: Awaited<ReturnType<typeof fixture>>,
): Promise<void> {
  const file = `${workspaceRoot}/src/test.c`;
  const sourceDir = `${workspaceRoot}/src`;
  await handle.writeFile(file, "int value = 1;\n");

  const read = await activeTool(session, "read").execute("read-proof", { path: "src/test.c" }, undefined, () => {});
  expect(resultText(read)).toContain("int value = 1;");

  await activeTool(session, "edit").execute(
    "edit-proof",
    { path: "src/test.c", edits: [{ oldText: "value = 1", newText: "value = 2" }] },
    undefined,
    () => {},
  );
  expect(await handle.readFile(file)).toBe("int value = 2;\n");

  const firstGlobCall = provider.execCalls.length;
  provider.scriptExec(
    { exitCode: 0, stdout: `${workspaceRoot}\n`, stderr: "" },
    { exitCode: 0, stdout: `${file}\n`, stderr: "" },
  );
  const glob = await activeTool(session, "glob").execute("glob-proof", { pattern: "*.c" }, undefined, () => {});
  expect(resultText(glob)).toBe("src/test.c");
  const globCalls = provider.execCalls.slice(firstGlobCall);
  expect(globCalls).toMatchObject([
    { command: ["find", workspaceRoot, "-maxdepth", "0", "-type", "d", "-print"], opts: { cwd: workspaceRoot } },
    { opts: { cwd: workspaceRoot } },
  ]);
  expect(globCalls[1]?.command[5]).toBe(workspaceRoot);

  const firstGrepCall = provider.execCalls.length;
  provider.scriptExec(
    { exitCode: 0, stdout: `${sourceDir}\n`, stderr: "" },
    {
      exitCode: 0,
      stdout: `${JSON.stringify({
        type: "match",
        data: { path: { text: "test.c" }, line_number: 1, lines: { text: "int value = 2;\n" } },
      })}\n`,
      stderr: "",
    },
  );
  const grep = await activeTool(session, "grep").execute(
    "grep-proof",
    { pattern: "value", path: "src" },
    undefined,
    () => {},
  );
  expect(resultText(grep)).toBe("test.c:1: int value = 2;");
  expect(provider.execCalls.slice(firstGrepCall)).toMatchObject([
    { command: ["find", sourceDir, "-maxdepth", "0", "-type", "d", "-print"] },
    { opts: { cwd: sourceDir } },
  ]);

  expect(JSON.stringify(provider.execCalls)).not.toContain(hostRoot);
}

describe("sandbox same-name agent tool wiring", () => {
  test("direct Pi custom tools replace builtins while write remains excluded", async () => {
    const sandbox = await fixture();
    const { hostRoot, provider, handle, workspaceRoot, fileTools } = sandbox;
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
      settingsManager: SettingsManager.inMemory({ cacheWarming: "off" }),
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

    await expectRelativeFileToolsUseSandbox(session, sandbox);
  });

  test("kernel extension factories replace the same-named Pi builtins", async () => {
    const sandbox = await fixture();
    const { hostRoot, provider, handle, workspaceRoot, fileTools } = sandbox;
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
    const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false }, cacheWarming: "off" });
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

    await expectRelativeFileToolsUseSandbox(session, sandbox);
  });
});
