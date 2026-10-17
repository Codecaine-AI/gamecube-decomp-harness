import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { resolveRegisteredTool } from "@server/core/tools/resolver";
import type { WorkspaceExec, WorkspaceExecOptions } from "@server/infrastructure/shell";
import {
  QA_LINT_PLACEMENT_ENV,
  SANDBOX_QA_ROOT,
  SANDBOX_QA_STAMP_PATH,
  qaLintPlacement,
  runWorkerQaScan,
  sandboxQaScanPlan,
} from "./sandbox-scan.js";
import { QA_SCAN_REQUIRES_GAME_ERROR, REVIEW_LINT_GLOBAL_STANDARDS_DIR_ENV, type QaScanInvocation, type RunQaScanDiffOptions } from "./scan-diff.js";

const orchestratorRoot = resolve(import.meta.dir, "../../../../../..");
const sandboxRepoRoot = "/home/daytona/workspace/sms";
const hostRepoRoot = resolve(orchestratorRoot, "games/sms/workspace/checkout");
const sandboxScript = "/opt/toolpacks/gamecube-decomp/source_editing/review_lint/api/scan_diff.py";
const sandboxDiffPath = `${sandboxRepoRoot}/build/qa/attempt-0.qa_diff.patch`;

const errorFinding = { rule_id: "extern_in_c", severity: "error", file: "src/a.c", line: 2, excerpt: "extern int x;", message: "extern", standard_id: null };
const failedStdout = JSON.stringify({
  tool: "review_lint", operation: "review_lint:scan_diff", status: "failed", repo: sandboxRepoRoot, base: null,
  findings: [errorFinding], counts: { errors: 1, warnings: 0 },
});

type ExecResult = { exitCode: number; stdout: string; stderr: string };

/** A worker sandbox reached only through exec: stamp probe, python3 chunk uploads with sha256 read-back, and the scanner. */
function fakeSandbox(options: { ready: boolean; scan?: (command: string[], env: Record<string, string>) => ExecResult }) {
  const files = new Map<string, Buffer>();
  const calls: Array<{ command: string[]; options?: WorkspaceExecOptions }> = [];
  const exec: WorkspaceExec["exec"] = async (command, execOptions) => {
    calls.push({ command, options: execOptions });
    if (command[0] === "test") return { exitCode: options.ready ? 0 : 1, stdout: "", stderr: "" };
    if (command[0] === "python3" && command[1] === "-c" && command.length === 6) {
      const [, , , path, mode, chunk] = command;
      const previous = mode === "ab" ? files.get(path) ?? Buffer.alloc(0) : Buffer.alloc(0);
      files.set(path, Buffer.concat([previous, Buffer.from(chunk, "base64")]));
      return { exitCode: 0, stdout: "", stderr: "" };
    }
    if (command[0] === "python3" && command[1] === "-c" && command.length === 4) {
      return { exitCode: 0, stdout: `${createHash("sha256").update(files.get(command[3]) ?? Buffer.alloc(0)).digest("hex")}\n`, stderr: "" };
    }
    if (command[0] === "python3" && command[1]?.endsWith("scan_diff.py") && options.scan) {
      return options.scan(command, (execOptions?.env ?? {}) as Record<string, string>);
    }
    return { exitCode: 127, stdout: "", stderr: `unexpected command: ${command.join(" ")}` };
  };
  return { workspaceExec: { exec } as WorkspaceExec, files, calls };
}

async function hostPatch(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "qa-sandbox-scan-"));
  const path = join(dir, "attempt-0.qa_diff.patch");
  await writeFile(path, "diff --git a/src/a.c b/src/a.c\n--- a/src/a.c\n+++ b/src/a.c\n@@ -1 +1,2 @@\n int a;\n+extern int x;\n");
  return path;
}

function scanOptions(diffFile: string, gameId: string | null = "sms"): RunQaScanDiffOptions {
  return { repoRoot: hostRepoRoot, orchestratorRoot, game: gameId ? { gameId } : undefined, diffFile, surface: "worker" };
}

function recordingBuildRunner() {
  const seen: RunQaScanDiffOptions[] = [];
  const runner = async (options: RunQaScanDiffOptions): Promise<QaScanInvocation> => {
    seen.push(options);
    return { exitCode: 0, result: null, stdout: "", stderr: "", toolError: null, command: ["build"] };
  };
  return { seen, runner };
}

describe("sandboxQaScanPlan", () => {
  test("maps the host tool env onto the sandbox QA root, toolpack and workspace", () => {
    const resolved = resolveRegisteredTool({ game: { gameId: "sms" }, repoRoot: sandboxRepoRoot, hostRepoRoot }, "review_lint");
    const plan = sandboxQaScanPlan({ resolved, orchestratorRoot, repoRoot: sandboxRepoRoot, hostRepoRoot });
    expect(plan.scriptPath).toBe(sandboxScript);
    expect(plan.toolpackReadyPath).toBe("/opt/toolpacks/gamecube-decomp/.ready");
    expect(plan.env.ORCH_GAME_DIR).toBe(`${SANDBOX_QA_ROOT}/games/sms`);
    expect(plan.env.ORCH_GAME_ID).toBe("sms");
    expect(plan.env.ORCH_GAME_REPO_ROOT).toBe(sandboxRepoRoot);
    expect(plan.env.ORCH_TOOL_API_ROOT).toBe("/opt/toolpacks/gamecube-decomp/source_editing/review_lint/api");
    expect(plan.env.ORCH_TOOLPACK_ROOT).toBe("/opt/toolpacks/gamecube-decomp");
    expect(plan.env[REVIEW_LINT_GLOBAL_STANDARDS_DIR_ENV]).toBe(`${SANDBOX_QA_ROOT}/knowledge/global/sources/injectable/decomp_standards/standards`);
    expect(plan.env.ORCH_PACKAGE_ROOT).toBe(SANDBOX_QA_ROOT);
    expect(plan.env.MWCC_WIBO).toBeUndefined();
    expect(plan.env.ORCH_GAME_HOST_REPO_ROOT).toBeUndefined();
    // No host path survives the mapping.
    for (const value of Object.values(plan.env)) expect(value.includes(orchestratorRoot)).toBe(false);
  });
});

describe("runWorkerQaScan placement", () => {
  const savedPlacement = process.env[QA_LINT_PLACEMENT_ENV];
  afterEach(() => {
    if (savedPlacement === undefined) delete process.env[QA_LINT_PLACEMENT_ENV];
    else process.env[QA_LINT_PLACEMENT_ENV] = savedPlacement;
  });

  test("placement defaults to sandbox (auto is its alias) and rejects unknown values", () => {
    expect(qaLintPlacement({})).toBe("sandbox");
    expect(qaLintPlacement({ [QA_LINT_PLACEMENT_ENV]: "auto" })).toBe("sandbox");
    expect(qaLintPlacement({ [QA_LINT_PLACEMENT_ENV]: "build" })).toBe("build");
    expect(qaLintPlacement({ [QA_LINT_PLACEMENT_ENV]: "sandbox" })).toBe("sandbox");
    expect(() => qaLintPlacement({ [QA_LINT_PLACEMENT_ENV]: "daytona" })).toThrow(`Invalid ${QA_LINT_PLACEMENT_ENV}: daytona`);
  });

  test("the default placement with QA assets uploads the patch and scans in the worker sandbox, never the build path", async () => {
    const diffFile = await hostPatch();
    let seenEnv: Record<string, string> = {};
    const sandbox = fakeSandbox({ ready: true, scan: (_command, env) => { seenEnv = env; return { exitCode: 1, stdout: failedStdout, stderr: "" }; } });
    const build = recordingBuildRunner();
    const invocation = await runWorkerQaScan({ exec: sandbox.workspaceExec, options: scanOptions(diffFile), sandboxRepoRoot, sandboxDiffPath, buildRunner: build.runner });

    expect(build.seen).toHaveLength(0);
    expect(sandbox.calls[0].command).toEqual(["test", "-f", SANDBOX_QA_STAMP_PATH, "-a", "-f", "/opt/toolpacks/gamecube-decomp/.ready", "-a", "-f", sandboxScript]);
    expect(sandbox.files.get(sandboxDiffPath)?.toString("utf8")).toContain("+extern int x;");
    expect(invocation.command).toEqual(["python3", sandboxScript, "--repo", sandboxRepoRoot, "--json", "--gate", "--diff-file", sandboxDiffPath, "--surface", "worker"]);
    expect(invocation.executionSurface).toBe("worker_sandbox");
    expect(invocation.exitCode).toBe(1);
    expect(invocation.toolError).toBeNull();
    expect(invocation.result?.findings).toEqual([errorFinding as never]);
    expect(seenEnv.ORCH_GAME_DIR).toBe(`${SANDBOX_QA_ROOT}/games/sms`);
    expect(seenEnv[REVIEW_LINT_GLOBAL_STANDARDS_DIR_ENV]).toBe(`${SANDBOX_QA_ROOT}/knowledge/global/sources/injectable/decomp_standards/standards`);
  });

  test("the sandbox scan keeps the exit-code contract: clean exit 0 and tool failures", async () => {
    const diffFile = await hostPatch();
    const clean = await runWorkerQaScan({
      exec: fakeSandbox({ ready: true, scan: () => ({ exitCode: 0, stdout: "", stderr: "review_lint scan_diff: passed (0 error(s), 0 warning(s), 1 scanned file(s))\n" }) }).workspaceExec,
      options: scanOptions(diffFile), sandboxRepoRoot, sandboxDiffPath, placement: "sandbox",
    });
    expect(clean.toolError).toBeNull();
    expect(clean.result?.status).toBe("passed");
    expect(clean.result?.repo).toBe(sandboxRepoRoot);

    const crashed = await runWorkerQaScan({
      exec: fakeSandbox({ ready: true, scan: () => ({ exitCode: 3, stdout: failedStdout, stderr: "boom" }) }).workspaceExec,
      options: scanOptions(diffFile), sandboxRepoRoot, sandboxDiffPath, placement: "sandbox",
    });
    expect(crashed.toolError).toBe("scan_diff.py failed with exit 3");

    const garbled = await runWorkerQaScan({
      exec: fakeSandbox({ ready: true, scan: () => ({ exitCode: 2, stdout: "", stderr: "python3: can't open file" }) }).workspaceExec,
      options: scanOptions(diffFile), sandboxRepoRoot, sandboxDiffPath, placement: "sandbox",
    });
    expect(garbled.toolError).toBe("scan_diff.py did not return parseable JSON (exit 2)");
  });

  test("the default placement without the QA stamp is a tool failure, never the build path", async () => {
    const diffFile = await hostPatch();
    const sandbox = fakeSandbox({ ready: false });
    const build = recordingBuildRunner();
    delete process.env[QA_LINT_PLACEMENT_ENV];
    const invocation = await runWorkerQaScan({ exec: sandbox.workspaceExec, options: scanOptions(diffFile), sandboxRepoRoot, sandboxDiffPath, buildRunner: build.runner });
    expect(build.seen).toHaveLength(0);
    expect(invocation.executionSurface).toBe("worker_sandbox");
    expect(invocation.toolError).toContain("has no QA assets");
    expect(sandbox.calls.map((call) => call.command[0])).toEqual(["test"]);
  });

  test("sandbox placement without QA assets is a tool failure, not a build", async () => {
    const diffFile = await hostPatch();
    const sandbox = fakeSandbox({ ready: false });
    const build = recordingBuildRunner();
    process.env[QA_LINT_PLACEMENT_ENV] = "sandbox";
    const invocation = await runWorkerQaScan({ exec: sandbox.workspaceExec, options: scanOptions(diffFile), sandboxRepoRoot, sandboxDiffPath, buildRunner: build.runner });
    expect(build.seen).toHaveLength(0);
    expect(invocation.executionSurface).toBe("worker_sandbox");
    expect(invocation.result).toBeNull();
    expect(invocation.toolError).toContain(`${QA_LINT_PLACEMENT_ENV}=sandbox but the worker sandbox has no QA assets`);
    expect(invocation.toolError).toContain(SANDBOX_QA_STAMP_PATH);
  });

  test("build placement never touches the sandbox; a missing game still fails closed", async () => {
    const diffFile = await hostPatch();
    const sandbox = fakeSandbox({ ready: true });
    const build = recordingBuildRunner();
    await runWorkerQaScan({ exec: sandbox.workspaceExec, options: scanOptions(diffFile), sandboxRepoRoot, sandboxDiffPath, placement: "build", buildRunner: build.runner });
    expect(sandbox.calls).toHaveLength(0);
    expect(build.seen).toHaveLength(1);

    const noGame = await runWorkerQaScan({ exec: sandbox.workspaceExec, options: scanOptions(diffFile, null), sandboxRepoRoot, sandboxDiffPath, placement: "sandbox" });
    expect(noGame.toolError).toBe(QA_SCAN_REQUIRES_GAME_ERROR);
    expect(sandbox.calls).toHaveLength(0);
  });

  test("a positive asset probe is cached per workspace exec", async () => {
    const diffFile = await hostPatch();
    const sandbox = fakeSandbox({ ready: true, scan: () => ({ exitCode: 1, stdout: failedStdout, stderr: "" }) });
    for (let index = 0; index < 2; index += 1) {
      await runWorkerQaScan({ exec: sandbox.workspaceExec, options: scanOptions(diffFile), sandboxRepoRoot, sandboxDiffPath });
    }
    expect(sandbox.calls.filter((call) => call.command[0] === "test")).toHaveLength(1);
  });

  test("a failed upload is recorded on the sandbox surface without falling back", async () => {
    const diffFile = await hostPatch();
    const build = recordingBuildRunner();
    const exec: WorkspaceExec["exec"] = async (command) => command[0] === "test"
      ? { exitCode: 0, stdout: "", stderr: "" }
      : { exitCode: 1, stdout: "", stderr: "disk full" };
    const invocation = await runWorkerQaScan({ exec: { exec } as WorkspaceExec, options: scanOptions(diffFile), sandboxRepoRoot, sandboxDiffPath, buildRunner: build.runner });
    expect(build.seen).toHaveLength(0);
    expect(invocation.executionSurface).toBe("worker_sandbox");
    expect(invocation.toolError).toContain("worker sandbox QA diff upload failed");
  });
});
