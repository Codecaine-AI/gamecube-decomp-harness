// Bundled for Daytona. No database or lifecycle authority is sent to this worker.
import { readFile, readdir, stat, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { forceReportRun } from "../report/run.js";
import { runCiParityGate, runPreCommitGate, runPreCommitAutofix } from "../ci-parity/run.js";
import { buildObjectForSource, captureUnitMatchSnapshot } from "../qa/repair-checks.js";
import { runQaScanDiff } from "../qa/scan-diff.js";
import { runCommand } from "@server/infrastructure/shell/run-command.js";
import { baseConfigureCommand, configureCommandWithWrapper } from "@server/core/game-registry/configure-command.js";
import type { BuildTask } from "./execution.js";

interface Request { repoRoot: string; sourceTree: string; task: BuildTask; reportOptions: { reportPath: string; reportChangesPath: string }; gameKind: string; logDir: string; resultPath: string; artifactRoots: string[]; extraArtifacts: string[] }
const request: Request = JSON.parse(await readFile(process.argv[2]!, "utf8"));
process.env.ORCH_BUILD_EXECUTION = "local";
delete process.env.ORCH_REPORT_REUSE;
await mkdir(request.logDir, { recursive: true });
let value: unknown;
let failure: Record<string, unknown> | undefined;
const input = request.task.input;
try {
  // Configure on Linux even if a baked build.ninja exists. Host binaries and
  // platform-specific build files are never uploaded.
  if (input.skipConfigure !== true && !["precommit", "autofix", "report-changes"].includes(request.task.kind)) {
    const configured = await runCommand(request.repoRoot, ["/bin/sh", "-c",
      typeof input.configureCommand === "string" ? input.configureCommand : configureCommandWithWrapper(baseConfigureCommand({ kind: request.gameKind }), "build/tools/wibo")], { timeoutMs: 600_000 });
    await writeFile(resolve(request.logDir, "configure.stdout.log"), configured.stdout);
    await writeFile(resolve(request.logDir, "configure.stderr.log"), configured.stderr);
    if (configured.exitCode !== 0) throw Object.assign(new Error(`Sandbox configure failed (${configured.exitCode}): ${configured.stderr || configured.stdout}`), { buildFixerDiagnostics: configured.stderr || configured.stdout });
    // MWCC timestamps outputs to whole seconds. Download/extraction changes the
    // compiler directory at nanosecond precision, so compiling in that same
    // second leaves PCH output older than its input even after success.
    const toolchain = await runCommand(request.repoRoot, ["ninja", "build/compilers"], { timeoutMs: 600_000 });
    await writeFile(resolve(request.logDir, "toolchain.log"), toolchain.stdout + "\n" + toolchain.stderr);
    if (toolchain.exitCode !== 0) throw new Error(`Sandbox toolchain preparation failed: ${toolchain.stderr || toolchain.stdout}`);
    await new Promise(resolveDelay => setTimeout(resolveDelay, 1100));
  }
  switch (request.task.kind) {
    case "report": value = await forceReportRun(request.repoRoot, { ...input, kind: request.gameKind, logDir: request.logDir, toolPlatform: "linux-x86_64" }); break;
    case "ci": value = await runCiParityGate(input as Parameters<typeof runCiParityGate>[0]); break;
    case "precommit": value = await runPreCommitGate(input as Parameters<typeof runPreCommitGate>[0]); break;
    case "autofix": value = await runPreCommitAutofix(input as Parameters<typeof runPreCommitAutofix>[0]); break;
    case "object": value = await buildObjectForSource(input as Parameters<typeof buildObjectForSource>[0]); break;
    case "unit-snapshot": value = await captureUnitMatchSnapshot(input as Parameters<typeof captureUnitMatchSnapshot>[0]); break;
    case "qa":
      // Map/order QA invokes Ninja freshness and object inspection. Keep its
      // prerequisites in the same sandbox as the scan.
      await forceReportRun(request.repoRoot, { ...request.reportOptions, kind: request.gameKind, generateChanges: false, logDir: request.logDir });
      value = await runQaScanDiff(input as unknown as Parameters<typeof runQaScanDiff>[0]);
      if ((value as { exitCode: number }).exitCode !== 0) {
        const check = await runCommand(request.repoRoot, ["ninja", "-n", "-d", "explain", request.reportOptions.reportPath]);
        await writeFile(resolve(request.logDir, "qa-freshness.log"), check.stdout + "\n" + check.stderr);
      }
      break;
    case "report-changes": value = await runCommand(request.repoRoot, ["build/tools/objdiff-cli", "report", "changes", "-o", input.changesPath as string, input.baselinePath as string, input.reportPath as string]); break;
    case "command": value = await runCommand(request.repoRoot, input.command as string[], input.options as Parameters<typeof runCommand>[2]); break;
  }
} catch (error) {
  const e = error as Error & Record<string, unknown>;
  failure = { message: e.message, stack: e.stack, buildFixerDiagnostics: e.buildFixerDiagnostics, logPaths: e.logPaths };
}
const artifacts: string[] = [];
async function collect(root: string, logs = false): Promise<void> {
  for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory() && !["tools", "compilers", ".git"].includes(entry.name)) await collect(path, logs);
    else if (entry.isFile() && (logs || /^(?:report(?:_changes)?|baseline)\.json$/.test(entry.name))) artifacts.push(path);
  }
}
if (input.skipConfigure !== true && ["report", "command", "ci"].includes(request.task.kind)) {
  for (const root of request.artifactRoots) await collect(root);
}
await collect(request.logDir, true);
const metadata = input.skipConfigure !== true && ["report", "command"].includes(request.task.kind) ? ["build.ninja", "objdiff.json", "compile_commands.json"] : [];
for (const name of [...metadata, ...request.extraArtifacts]) {
  const path = resolve(request.repoRoot, name);
  if (await stat(path).catch(() => null)) artifacts.push(path);
}
// Compare the full resulting tree to the verified input, including hook-staged
// edits and newly created source files. Build caches stay ignored.
await runCommand(request.repoRoot, ["git", "add", "-A"]);
const changed = await runCommand(request.repoRoot, ["git", "diff", "--binary", "--no-ext-diff", request.sourceTree, "--"]);
await writeFile(request.resultPath, JSON.stringify({ value, failure, artifacts: [...new Set(artifacts)], sourcePatch: changed.stdout }));
console.log(JSON.stringify({ task: request.task.kind, success: !failure, artifacts: artifacts.length }));
