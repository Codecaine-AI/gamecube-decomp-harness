import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readdirSync, statSync, symlinkSync } from "node:fs";
import { copyFile, cp, mkdir, mkdtemp, readFile, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, posix, resolve } from "node:path";
import type { StateStore } from "@server/core/orchestrator-state";
import { installMwccCacheShim } from "@server/core/tools/mwcc-cache.js";
import { isHostToolPlatform, TOOL_PLATFORMS, type ToolPlatform } from "@server/core/tools/platform.js";
import { runCommand } from "@server/infrastructure/shell";
import {
  emitSandboxCreatedEvent,
  emitSandboxDeletedEvent,
  type SandboxCreatedEventInput,
} from "./sandbox-events.js";
import type { SandboxHandle, SandboxProvider, SandboxResourceClass } from "./sandbox.js";

export interface WorkerReportArtifactSource { relativePath: string; sourcePath: string }
export interface WorkerToolArtifactSource { platform: ToolPlatform; relativePath: string; sourcePath: string }
interface WorkerConfigureToolPaths { wrapper?: string; binutils?: string; compilers?: string; dtk?: string; objdiff?: string; sjiswrap?: string }
export interface ProvisionCommandResult { exitCode: number; stdout: string; stderr: string }
export type ProvisionCommandRunner = (cwd: string, command: string[], options?: { timeoutMs?: number }) => Promise<ProvisionCommandResult>;

const REPORT_PATHS = ["build/GALE01/report.json", "build/GALE01/report_changes.json", "build/GALE01/baseline.json"];
const TOOL_ARTIFACTS = [
  { relativePath: "build/tools", mode: "copy" },
  { relativePath: "build/compilers", mode: "link" },
  { relativePath: "build/binutils", mode: "link" },
] as const;
const TOOL_PATHS = TOOL_ARTIFACTS.map((artifact) => artifact.relativePath);
const LOCK_STALE_MS = 10 * 60 * 1000;
const LOCK_MISSING_OWNER_STALE_MS = 30 * 1000;
const SETUP_TIMEOUT_MS = 20 * 60 * 1000;
const SANDBOX_BUNDLE_PATH = "/tmp/melee-claim-seed.bundle";

const defaultRunner: ProvisionCommandRunner = async (cwd, command, options) => runCommand(cwd, command, options);
const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));
const outputTail = (text: string, maxChars = 2000) => text.length <= maxChars ? text : text.slice(-maxChars);

function linkMissingTree(sourceDir: string, targetDir: string): number {
  let linked = 0;
  mkdirSync(targetDir, { recursive: true });
  for (const entry of readdirSync(sourceDir)) {
    const sourcePath = resolve(sourceDir, entry);
    const targetPath = resolve(targetDir, entry);
    if (statSync(sourcePath).isDirectory()) linked += linkMissingTree(sourcePath, targetPath);
    else if (!existsSync(targetPath)) { symlinkSync(sourcePath, targetPath); linked += 1; }
  }
  return linked;
}

function existsOrSymlink(path: string): boolean { try { lstatSync(path); return true; } catch { return false; } }
async function touchTreeMtime(path: string, at = new Date()): Promise<void> {
  let stats: ReturnType<typeof statSync>;
  try { stats = statSync(path); } catch { return; }
  if (stats.isDirectory()) for (const entry of await readdir(path, { withFileTypes: true })) await touchTreeMtime(resolve(path, entry.name), at);
  await utimes(path, at, at).catch(() => {});
}

function lockDir(workerRepoRoot: string): string { return resolve(dirname(dirname(workerRepoRoot)), ".git-worktree-add.lock"); }
async function lockLooksStale(path: string): Promise<boolean> {
  const ageMs = (() => { try { return Date.now() - statSync(path).mtimeMs; } catch { return LOCK_STALE_MS + 1; } })();
  try {
    const owner = JSON.parse(await readFile(resolve(path, "owner.json"), "utf8")) as { pid?: unknown };
    const pid = typeof owner.pid === "number" ? owner.pid : 0;
    if (pid > 0) { try { process.kill(pid, 0); return false; } catch { return true; } }
  } catch { return ageMs > LOCK_MISSING_OWNER_STALE_MS; }
  return ageMs > LOCK_STALE_MS;
}
async function acquireLock(path: string, owner: Record<string, unknown>): Promise<() => Promise<void>> {
  const startedAt = Date.now();
  for (;;) {
    try {
      await mkdir(path);
      await writeFile(resolve(path, "owner.json"), JSON.stringify({ ...owner, pid: process.pid, acquiredAt: new Date().toISOString() }, null, 2));
      return async () => { await rm(path, { recursive: true, force: true }); };
    } catch (error) {
      if ((error as { code?: string }).code !== "EEXIST") throw error;
      if (await lockLooksStale(path)) { await rm(path, { recursive: true, force: true }); continue; }
      if (Date.now() - startedAt > LOCK_STALE_MS) throw new Error(`Timed out waiting for worker git worktree lock at ${path}`);
      await sleep(200 + Math.floor(Math.random() * 300));
    }
  }
}

async function seedReports(params: { workerRepoRoot: string; outputDir: string; sources: WorkerReportArtifactSource[] }): Promise<void> {
  const seeded: Array<Record<string, string>> = []; const existing: string[] = [];
  const sourceByPath = new Map(params.sources.map((source) => [source.relativePath, source.sourcePath]));
  for (const relativePath of REPORT_PATHS) {
    const targetPath = resolve(params.workerRepoRoot, relativePath);
    if (existsSync(targetPath)) { existing.push(relativePath); continue; }
    const sourcePath = sourceByPath.get(relativePath);
    if (!sourcePath || !existsSync(sourcePath)) continue;
    await mkdir(dirname(targetPath), { recursive: true }); await copyFile(sourcePath, targetPath); seeded.push({ relativePath, sourcePath, targetPath });
  }
  await writeFile(resolve(params.outputDir, "worker_worktree_report_artifacts.json"), JSON.stringify({ seeded, existing, missing: REPORT_PATHS.filter((p) => !existing.includes(p) && !seeded.some((x) => x.relativePath === p)) }, null, 2));
}

async function seedTools(params: { workerRepoRoot: string; outputDir: string; sources: WorkerToolArtifactSource[]; toolPlatform: ToolPlatform }): Promise<void> {
  await mkdir(params.outputDir, { recursive: true });
  const linked: Array<Record<string, string>> = []; const copied: Array<Record<string, string>> = []; const existing: string[] = [];
  const sourceByPath = new Map(params.sources.filter((s) => s.platform === params.toolPlatform && existsSync(s.sourcePath)).map((s) => [s.relativePath, s.sourcePath]));
  const crossPlatform = !isHostToolPlatform(params.toolPlatform);
  if (crossPlatform) { const missing = TOOL_PATHS.filter((p) => !sourceByPath.has(p)); if (missing.length) throw new Error(`Required worker tool artifact source(s) for execution target ${params.toolPlatform} are missing: ${missing.join(", ")}`); }
  for (const artifact of TOOL_ARTIFACTS) {
    const targetPath = resolve(params.workerRepoRoot, artifact.relativePath);
    if (crossPlatform && existsOrSymlink(targetPath)) await rm(targetPath, { recursive: true, force: true });
    if (existsOrSymlink(targetPath)) {
      if (!existsSync(targetPath)) await rm(targetPath, { recursive: true, force: true });
      else {
        const shared = lstatSync(targetPath).isSymbolicLink();
        if (artifact.mode === "copy" && !shared) { const sourcePath = sourceByPath.get(artifact.relativePath); if (sourcePath && existsSync(sourcePath)) { await cp(sourcePath, targetPath, { recursive: true, dereference: true, force: true }); await touchTreeMtime(targetPath); copied.push({ relativePath: artifact.relativePath, sourcePath, targetPath }); } else existing.push(artifact.relativePath); continue; }
        if (artifact.mode === "link" && shared) { existing.push(artifact.relativePath); continue; }
        await rm(targetPath, { recursive: true, force: true });
      }
    }
    const sourcePath = sourceByPath.get(artifact.relativePath); if (!sourcePath || !existsSync(sourcePath)) continue;
    await mkdir(dirname(targetPath), { recursive: true });
    if (artifact.mode === "copy") { await cp(sourcePath, targetPath, { recursive: true, dereference: true }); await touchTreeMtime(targetPath); copied.push({ relativePath: artifact.relativePath, sourcePath, targetPath }); }
    else { symlinkSync(sourcePath, targetPath, statSync(sourcePath).isDirectory() ? "dir" : "file"); linked.push({ relativePath: artifact.relativePath, sourcePath, targetPath }); }
  }
  if (existsSync(resolve(params.workerRepoRoot, "build/tools/wibo"))) installMwccCacheShim(params.workerRepoRoot);
  await writeFile(resolve(params.outputDir, "worker_worktree_tool_artifacts.json"), JSON.stringify({ copied, linked, existing, missing: TOOL_PATHS.filter((p) => !existing.includes(p) && !copied.some((x) => x.relativePath === p) && !linked.some((x) => x.relativePath === p)) }, null, 2));
}

const shellQuote = (value: string) => `'${value.replace(/'/g, "'\\''")}'`;
function hasFlag(command: string, flag: string): boolean { const escaped = flag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); return new RegExp(`(?:^|\\s)${escaped}(?:\\s|=|$)`).test(command); }
function setFlag(command: string, flag: string, value: string): string { const escaped = flag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); const pattern = new RegExp(`(^|\\s)${escaped}(?:\\s+|=)(?:"[^"]*"|'[^']*'|\\S+)`); const replacement = `${flag} ${shellQuote(value)}`; return pattern.test(command) ? command.replace(pattern, (_m, prefix: string) => `${prefix}${replacement}`) : `${command} ${replacement}`; }
function configureCommand(command: string, paths: WorkerConfigureToolPaths): string {
  if (!/\bconfigure\.py\b/.test(command)) return command; let next = command;
  if (paths.wrapper) next = setFlag(next, "--wrapper", paths.wrapper);
  const additions: string[] = []; const append = (flag: string, value?: string) => { if (value && !hasFlag(next, flag)) additions.push(flag, shellQuote(value)); };
  append("--binutils", paths.binutils); append("--compilers", paths.compilers); append("--dtk", paths.dtk); append("--objdiff", paths.objdiff); append("--sjiswrap", paths.sjiswrap);
  return additions.length ? `${next} ${additions.join(" ")}` : next;
}
function localToolPaths(root: string, platform: ToolPlatform): WorkerConfigureToolPaths {
  const paths: Record<keyof WorkerConfigureToolPaths, string> = { wrapper: "build/tools/wibo", binutils: "build/binutils", compilers: "build/compilers", dtk: "build/tools/dtk", objdiff: "build/tools/objdiff-cli", sjiswrap: "build/tools/sjiswrap.exe" };
  const result: WorkerConfigureToolPaths = {};
  for (const [key, path] of Object.entries(paths) as Array<[keyof WorkerConfigureToolPaths, string]>) { if (key !== "wrapper" || TOOL_PLATFORMS.includes(platform)) if (existsSync(resolve(root, path))) result[key] = path; }
  return result;
}
function buildNeedsReconfigure(text: string, paths: WorkerConfigureToolPaths): boolean {
  if (paths.wrapper && /(?:^|\n)\s*command\s*=\s*wine(?:\s|$)/.test(text)) return true;
  if (paths.wrapper && !text.includes(`--wrapper ${paths.wrapper}`)) return true;
  return ([ ["compilers", "build/compilers"], ["binutils", "build/binutils"], ["dtk", "build/tools/dtk"], ["objdiff", "build/tools/objdiff-cli"], ["sjiswrap", "build/tools/sjiswrap.exe"] ] as const).some(([tool, output]) => paths[tool] && new RegExp(`(?:^|\\n)build\\s+${output.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s+download_tool(?:\\s|$)`).test(text));
}
async function loggedCommand(runner: ProvisionCommandRunner, params: { workerRepoRoot: string; outputDir: string; logPrefix: string; command: string[]; label: string }): Promise<void> {
  const result = await runner(params.workerRepoRoot, params.command, { timeoutMs: SETUP_TIMEOUT_MS });
  await writeFile(resolve(params.outputDir, `${params.logPrefix}.stdout.txt`), result.stdout); await writeFile(resolve(params.outputDir, `${params.logPrefix}.stderr.txt`), result.stderr);
  if (result.exitCode !== 0) throw new Error(`${params.label} failed (${result.exitCode}): ${outputTail(result.stderr || result.stdout)}`);
}
async function runConfigure(runner: ProvisionCommandRunner, params: { workerRepoRoot: string; outputDir: string; command: string; toolPaths: WorkerConfigureToolPaths }): Promise<void> {
  const ninja = resolve(params.workerRepoRoot, "build.ninja"); const objdiff = resolve(params.workerRepoRoot, "build/tools/objdiff-cli"); let reconfigure = false;
  if (existsSync(ninja) && params.command.trim()) { const text = await readFile(ninja, "utf8"); reconfigure = buildNeedsReconfigure(text, params.toolPaths) || (hasFlag(params.command, "--wrapper") && /(?:^|\n)\s*command\s*=\s*wine(?:\s|$)/.test(text)); }
  if (existsSync(ninja) && existsSync(objdiff) && !reconfigure) return;
  if ((!existsSync(ninja) || reconfigure) && params.command.trim()) await loggedCommand(runner, { ...params, logPrefix: "worker_worktree_configure", command: ["/bin/sh", "-c", configureCommand(params.command, params.toolPaths)], label: "worker worktree configure" });
  if (!existsSync(objdiff)) await loggedCommand(runner, { ...params, logPrefix: "worker_worktree_tools", command: ["ninja", "build/tools/objdiff-cli"], label: "worker worktree objdiff-cli bootstrap" });
  if (!existsSync(objdiff)) throw new Error(`worker worktree tools bootstrap did not create ${objdiff}`);
}
function disposable(path: string): boolean { const resolved = resolve(path); const parts = resolved.split(/[\\/]+/); return basename(resolved) === "source" && ["worktrees", "cycles", "epochs", "workers"].every((part) => parts.includes(part)); }
function linkLogs(root: string, output: string): void { const path = resolve(dirname(root), "logs"); if (existsSync(path)) return; try { symlinkSync(output, path); } catch { if (!existsSync(path)) throw new Error(`Unable to link worker logs at ${path}`); } }

export async function provisionWorkerWorktree(params: {
  sourceRepoRoot: string; workerRepoRoot: string; baseRev: string; outputDir: string; configureCommand: string;
  reportArtifactSources: WorkerReportArtifactSource[]; toolArtifactSources: WorkerToolArtifactSource[]; toolPlatform: ToolPlatform; dryRun: boolean;
  commandRunner?: ProvisionCommandRunner;
}): Promise<void> {
  const runner = params.commandRunner ?? defaultRunner;
  await mkdir(params.outputDir, { recursive: true });
  if (params.dryRun) { await mkdir(params.workerRepoRoot, { recursive: true }); linkMissingTree(params.sourceRepoRoot, params.workerRepoRoot); linkLogs(params.workerRepoRoot, params.outputDir); await seedReports({ workerRepoRoot: params.workerRepoRoot, outputDir: params.outputDir, sources: params.reportArtifactSources }); await seedTools({ workerRepoRoot: params.workerRepoRoot, outputDir: params.outputDir, sources: params.toolArtifactSources, toolPlatform: params.toolPlatform }); return; }
  if (!existsSync(resolve(params.workerRepoRoot, ".git"))) {
    if (existsSync(params.workerRepoRoot)) { if (!disposable(params.workerRepoRoot)) throw new Error(`Worker worktree path exists but is not a Git worktree: ${params.workerRepoRoot}`); await rm(params.workerRepoRoot, { recursive: true, force: true }); }
    await mkdir(dirname(params.workerRepoRoot), { recursive: true }); const release = await acquireLock(lockDir(params.workerRepoRoot), { workerRepoRoot: params.workerRepoRoot, sourceRepoRoot: params.sourceRepoRoot, baseRev: params.baseRev });
    try { await runner(params.sourceRepoRoot, ["git", "worktree", "prune"]); const add = await runner(params.sourceRepoRoot, ["git", "worktree", "add", "--detach", params.workerRepoRoot, params.baseRev]); if (add.exitCode !== 0) throw new Error(`git worktree add failed for worker checkout: ${outputTail(add.stderr || add.stdout)}`); } finally { await release(); }
  }
  if (existsSync(resolve(params.workerRepoRoot, ".git")) && disposable(params.workerRepoRoot)) { await loggedCommand(runner, { workerRepoRoot: params.workerRepoRoot, outputDir: params.outputDir, logPrefix: "worker_worktree_reset", command: ["git", "reset", "--hard", params.baseRev], label: "worker worktree reset" }); await loggedCommand(runner, { workerRepoRoot: params.workerRepoRoot, outputDir: params.outputDir, logPrefix: "worker_worktree_clean", command: ["git", "clean", "-fd"], label: "worker worktree clean" }); }
  const origSource = resolve(params.sourceRepoRoot, "orig"); if (existsSync(origSource)) linkMissingTree(origSource, resolve(params.workerRepoRoot, "orig"));
  await seedTools({ workerRepoRoot: params.workerRepoRoot, outputDir: params.outputDir, sources: params.toolArtifactSources, toolPlatform: params.toolPlatform });
  await runConfigure(runner, { workerRepoRoot: params.workerRepoRoot, outputDir: params.outputDir, command: params.configureCommand, toolPaths: localToolPaths(params.workerRepoRoot, params.toolPlatform) });
  await seedReports({ workerRepoRoot: params.workerRepoRoot, outputDir: params.outputDir, sources: params.reportArtifactSources }); linkLogs(params.workerRepoRoot, params.outputDir);
}

export interface SandboxProvisionLabels extends Record<string, string> {
  game_id: string;
  run_id: string;
  claim_id: string;
  job_id: string;
  job_lease_id: string;
  dispatch_lease_id: string;
  worker_state_id: string;
  trace_id: string;
}

export interface ProvisionSandboxWorkspaceResult {
  sandboxId: string;
  workspaceRoot: string;
}

export type SandboxCreatedEventContext = Omit<
  SandboxCreatedEventInput,
  "sandboxId" | "snapshot" | "cpu" | "memoryGiB" | "diskGiB"
>;

async function checkedSandboxExec(
  sandbox: SandboxHandle,
  command: string[],
  workspaceRoot: string,
  label: string,
): Promise<void> {
  const result = await sandbox.exec(command, { cwd: workspaceRoot, timeoutMs: SETUP_TIMEOUT_MS });
  if (result.exitCode !== 0) {
    throw new Error(`${label} failed (${result.exitCode}): ${outputTail(result.stderr || result.stdout)}`);
  }
}

export async function provisionSandboxWorkspace(params: {
  provider: SandboxProvider;
  sourceRepoRoot: string;
  baseRev: string;
  snapshotBakedRev: string;
  workspaceRoot: string;
  snapshot: string;
  resources: SandboxResourceClass;
  ttlSeconds: number;
  labels: SandboxProvisionLabels;
  reportArtifactSources: WorkerReportArtifactSource[];
  event: { store: StateStore; context: SandboxCreatedEventContext };
  commandRunner?: ProvisionCommandRunner;
}): Promise<ProvisionSandboxWorkspaceResult> {
  const runner = params.commandRunner ?? defaultRunner;
  let sandbox: SandboxHandle | undefined;
  try {
    sandbox = await params.provider.create({
      snapshot: params.snapshot,
      labels: { ...params.labels },
      resources: { ...params.resources },
      ttlMinutes: Math.ceil(params.ttlSeconds / 60) + 30,
    });
    emitSandboxCreatedEvent(params.event.store, {
      ...params.event.context,
      sandboxId: sandbox.sandboxId,
      snapshot: params.snapshot,
      cpu: params.resources.cpu,
      memoryGiB: params.resources.memoryGiB,
      diskGiB: params.resources.diskGiB,
    });
    if (params.snapshotBakedRev === params.baseRev) {
      await checkedSandboxExec(
        sandbox,
        ["git", "rev-parse", "--verify", `${params.baseRev}^{commit}`],
        params.workspaceRoot,
        "sandbox baked revision verification",
      );
    } else {
      const bundleDir = await mkdtemp(resolve(tmpdir(), "melee-sandbox-bundle-"));
      const bundlePath = resolve(bundleDir, "claim.bundle");
      const bundleRef = `refs/decomp-orchestrator/sandbox-seeds/${randomUUID()}`;
      let bundleRefCreated = false;
      let seedError: unknown;
      try {
        const advertise = await runner(
          params.sourceRepoRoot,
          ["git", "update-ref", bundleRef, params.baseRev],
          { timeoutMs: SETUP_TIMEOUT_MS },
        );
        if (advertise.exitCode !== 0) {
          throw new Error(`sandbox git bundle ref creation failed (${advertise.exitCode}): ${outputTail(advertise.stderr || advertise.stdout)}`);
        }
        bundleRefCreated = true;
        const bundle = await runner(
          params.sourceRepoRoot,
          ["git", "bundle", "create", bundlePath, `${params.snapshotBakedRev}..${params.baseRev}`, bundleRef],
          { timeoutMs: SETUP_TIMEOUT_MS },
        );
        if (bundle.exitCode !== 0) {
          throw new Error(`sandbox git bundle creation failed (${bundle.exitCode}): ${outputTail(bundle.stderr || bundle.stdout)}`);
        }
        await sandbox.uploadFile(bundlePath, SANDBOX_BUNDLE_PATH);
      } catch (error) {
        seedError = error;
        throw error;
      } finally {
        let refCleanupError: Error | undefined;
        if (bundleRefCreated) {
          try {
            const cleanup = await runner(
              params.sourceRepoRoot,
              ["git", "update-ref", "-d", bundleRef],
              { timeoutMs: SETUP_TIMEOUT_MS },
            );
            if (cleanup.exitCode !== 0) {
              refCleanupError = new Error(`sandbox git bundle ref cleanup failed (${cleanup.exitCode}): ${outputTail(cleanup.stderr || cleanup.stdout)}`);
            }
          } catch (error) {
            refCleanupError = error instanceof Error ? error : new Error(String(error));
          }
        }
        await rm(bundleDir, { recursive: true, force: true });
        if (!seedError && refCleanupError) throw refCleanupError;
      }
      await checkedSandboxExec(
        sandbox,
        ["git", "bundle", "verify", SANDBOX_BUNDLE_PATH],
        params.workspaceRoot,
        "sandbox git bundle verification",
      );
      await checkedSandboxExec(
        sandbox,
        ["git", "fetch", SANDBOX_BUNDLE_PATH, params.baseRev],
        params.workspaceRoot,
        "sandbox git bundle fetch",
      );
    }

    await checkedSandboxExec(
      sandbox,
      ["git", "checkout", "--detach", params.baseRev],
      params.workspaceRoot,
      "sandbox detached checkout",
    );
    for (const source of params.reportArtifactSources) {
      await sandbox.uploadFile(source.sourcePath, posix.resolve(params.workspaceRoot, source.relativePath));
    }
    await checkedSandboxExec(
      sandbox,
      [
        "/bin/sh",
        "-c",
        "test -x build/tools/wibo-real && test -x build/tools/objdiff-cli && test -x build/tools/dtk",
      ],
      params.workspaceRoot,
      "sandbox canonical tool verification",
    );
    return { sandboxId: sandbox.sandboxId, workspaceRoot: params.workspaceRoot };
  } catch (error) {
    if (sandbox) {
      let deleted = false;
      try {
        await params.provider.delete(sandbox.sandboxId, "provision_failure");
        deleted = true;
      } catch {}
      if (deleted) {
        const eventContext = params.event.context;
        try {
          emitSandboxDeletedEvent(params.event.store, {
            gameId: eventContext.gameId,
            sandboxId: sandbox.sandboxId,
            correlationId: eventContext.correlationId,
            causationId: eventContext.causationId,
            traceId: eventContext.traceId,
            actor: eventContext.actor,
            occurredAt: eventContext.occurredAt,
            parentSpanId: eventContext.parentSpanId,
            reason: "provision_failure",
            jobId: eventContext.jobId,
            claimId: eventContext.claimId,
          });
        } catch {}
      }
    }
    throw error;
  }
}
