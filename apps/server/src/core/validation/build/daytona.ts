/** Disposable build workspaces. The host owns Git/state; Daytona owns toolchains.
 * Transfer source and small evidence only, never host binaries, object caches,
 * credentials, or databases. A failed/changed-source build cannot publish results.
 */
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { listGames, resolveGame, sandboxRuntimeOptions, type ResolvedGame } from "@server/core/game-registry/resolver.js";
import { DaytonaSandboxProvider, type SandboxHandle, type SandboxProvider } from "@server/core/job-queue/sandbox.js";
import { ensureSandboxToolpack } from "@server/core/job-queue/provisioning.js";
import { runCommand } from "@server/infrastructure/shell/run-command.js";
import type { BuildTask } from "./execution.js";
import { GLOBAL_STANDARDS_SLICES_RELATIVE_PATH } from "../qa/scan-diff.js";

const REMOTE_ORCHESTRATOR = "/opt/build-orchestrator";
const REMOTE_RUNNER = `${REMOTE_ORCHESTRATOR}/apps/server/src/core/knowledge/build-worker.mjs`;
const DEFAULT_TIMEOUT = 60 * 60_000;
const digest = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const within = (root: string, path: string) => isAbsolute(path) && (resolve(path) === resolve(root) || resolve(path).startsWith(`${resolve(root)}${sep}`));

async function git(root: string, args: string[]): Promise<string> {
  const result = await runCommand(root, ["git", ...args], { timeoutMs: 300_000 });
  if (result.exitCode !== 0) throw new Error(`Build source git ${args[0]} failed: ${result.stderr || result.stdout}`);
  return result.stdout;
}

const FINDER_METADATA = /(?:^|\/)\.DS_Store$/;

type BuildSourceIdentity = { head: string; patch: string; files: Array<{ path: string; bytes: Buffer; executable: boolean }>; digest: string; tree: string };

/**
 * Host integrations keep writing and committing into the shared checkout, so a
 * single capture can straddle one: its patch and its tree then describe
 * different checkouts and the sandbox tree never matches. Accept a capture only
 * once two consecutive reads agree.
 */
export async function buildSourceIdentity(repoRoot: string, attempts = 5): Promise<BuildSourceIdentity> {
  let previous = await captureSourceIdentity(repoRoot);
  for (let attempt = 1; attempt < attempts; attempt += 1) {
    const current = await captureSourceIdentity(repoRoot);
    if (current.digest === previous.digest) return current;
    previous = current;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
  throw new Error(`Build source kept changing across ${attempts} captures; refusing an inconsistent snapshot`);
}

async function captureSourceIdentity(repoRoot: string): Promise<BuildSourceIdentity> {
  const head = (await git(repoRoot, ["rev-parse", "HEAD"])).trim();
  // Pin every later read to this commit: an integration can move HEAD while the
  // identity is captured, and a tree from one commit with a patch against another
  // never matches the sandbox checkout.
  const patch = await git(repoRoot, ["diff", "--binary", "--no-ext-diff", head]);
  const submodules = await git(repoRoot, ["submodule", "status", "--recursive"]);
  if (submodules.trim()) throw new Error("Remote build source capture requires explicit submodule bundles; refusing an incomplete source snapshot");
  // macOS rewrites Finder metadata at will; it is never build input and would churn the identity.
  const names = (await git(repoRoot, ["ls-files", "--others", "--exclude-standard", "-z"])).split("\0").filter(Boolean)
    .filter((path) => !FINDER_METADATA.test(path)).sort();
  const files: Array<{ path: string; bytes: Buffer; executable: boolean }> = [];
  for (const path of names) {
    if (!within(repoRoot, resolve(repoRoot, path))) throw new Error(`Invalid build input: ${path}`);
    if (!(await lstat(resolve(repoRoot, path))).isFile()) throw new Error(`Build input must be a regular file: ${path}`);
    files.push({ path, bytes: await readFile(resolve(repoRoot, path)), executable: !!((await lstat(resolve(repoRoot, path))).mode & 0o111) });
  }
  const indexDir = await mkdtemp(resolve(tmpdir(), "build-index-"));
  let tree: string;
  try {
    for (const args of [["read-tree", head], ["add", "-A", "--", ".", ":(exclude,glob)**/.DS_Store"], ["write-tree"]]) {
      const result = await runCommand(repoRoot, ["git", ...args], { env: { GIT_INDEX_FILE: resolve(indexDir, "index") } });
      if (result.exitCode !== 0) throw new Error(`Build input tree capture failed: ${result.stderr}`);
      if (args[0] === "write-tree") tree = result.stdout.trim();
    }
  } finally { await rm(indexDir, { recursive: true, force: true }); }
  return { head, patch, files, tree: tree!, digest: digest(JSON.stringify([head, tree!, patch, files.map(file => [file.path, file.executable, digest(file.bytes)])])) };
}

async function gameForCheckout(repoRoot: string): Promise<ResolvedGame> {
  const common = (await git(repoRoot, ["rev-parse", "--path-format=absolute", "--git-common-dir"])).trim();
  for (const entry of listGames()) {
    const game = resolveGame({ gameId: entry.id });
    if (!existsSync(game.repoRoot)) continue;
    const gameCommon = (await git(game.repoRoot, ["rev-parse", "--path-format=absolute", "--git-common-dir"])).trim();
    if (common === gameCommon) return game;
  }
  throw new Error(`No registered game's checkout owns ${repoRoot}; remote build refused. ORCH_BUILD_EXECUTION=local is an explicit development override.`);
}

export function mapBuildPaths<T>(value: T, mappings: Array<[string, string]>): T {
  if (typeof value === "string") return mappings.reduce<string>((text, [from, to]) => text.replaceAll(from, to), value) as T;
  if (Array.isArray(value)) return value.map(item => mapBuildPaths(item, mappings)) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, mapBuildPaths(item, mappings)])) as T;
  return value;
}

async function buildWorker(path: string): Promise<void> {
  const result = await Bun.build({ entrypoints: [resolve(import.meta.dir, "task-worker.ts")], target: "bun", format: "esm", minify: false });
  if (!result.success) throw new Error(`Build worker bundle failed: ${result.logs.join("\n")}`);
  await writeFile(path, new Uint8Array(await result.outputs[0]!.arrayBuffer()));
}

async function uploadTree(sandbox: SandboxHandle, local: string, remote: string, allowedRoot: string): Promise<void> {
  if (!existsSync(local)) return;
  await sandbox.exec(["mkdir", "-p", remote], { timeoutMs: 30_000 });
  for (const entry of await readdir(local, { withFileTypes: true })) {
    if (entry.name.endsWith(".env") || entry.name === "local.env" || entry.name === "__pycache__") continue;
    if (entry.isDirectory()) await uploadTree(sandbox, resolve(local, entry.name), `${remote}/${entry.name}`, allowedRoot);
    else if (entry.isFile()) await sandbox.uploadFile(resolve(local, entry.name), `${remote}/${entry.name}`);
    else if (entry.isSymbolicLink()) {
      const target = await realpath(resolve(local, entry.name));
      if (!within(allowedRoot, target) || !(await lstat(target)).isFile()) throw new Error(`Unsupported QA asset symlink: ${entry.name}`);
      await sandbox.uploadFile(target, `${remote}/${entry.name}`);
    }
  }
}

interface BuildResponse { value?: unknown; failure?: { message: string; [key: string]: unknown }; artifacts: string[]; sourcePatch?: string }
export interface BuildDependencies { provider?: SandboxProvider; game?: ResolvedGame; bundleWorker?: typeof buildWorker }

export async function executeDaytonaBuild<T>(checkout: string, task: BuildTask, dependencies: BuildDependencies = {}): Promise<T> {
  const repoRoot = resolve(checkout);
  const game = dependencies.game ?? await gameForCheckout(repoRoot);
  const profile = sandboxRuntimeOptions(game);
  if (!profile.snapshot_name) throw new Error(`No Daytona snapshot configured for ${game.gameId}; refusing local build fallback`);
  const source = await buildSourceIdentity(repoRoot);
  const id = `build-${randomUUID()}`;
  const evidenceDir = resolve(game.stateDir, "builds", id);
  await mkdir(evidenceDir, { recursive: true });
  const temp = await mkdtemp(resolve(tmpdir(), "daytona-build-"));
  const provider = dependencies.provider ?? new DaytonaSandboxProvider();
  let sandbox: SandboxHandle | undefined;
  const record: Record<string, unknown> = { id, gameId: game.gameId, task: task.kind, pid: process.pid, sourceHead: source.head, sourceDigest: source.digest, snapshot: profile.snapshot_name, createdAt: new Date().toISOString(), status: "provisioning" };
  const persist = () => writeFile(resolve(evidenceDir, "execution.json"), JSON.stringify(record, null, 2) + "\n");
  await persist();
  const remoteRoot = profile.workspace_root;
  const remoteLog = "/tmp/build-task-logs";
  const toRemote: Array<[string, string]> = [[repoRoot, remoteRoot], [game.orchestratorRoot, REMOTE_ORCHESTRATOR]];
  const toHost: Array<[string, string]> = [[remoteLog, resolve(evidenceDir, "logs")], [remoteRoot, repoRoot], [REMOTE_ORCHESTRATOR, game.orchestratorRoot]];
  const exec = async (command: string[], timeoutMs = 600_000) => {
    const result = await sandbox!.exec(command, { cwd: remoteRoot, timeoutMs });
    if (result.exitCode !== 0) throw new Error(`Daytona build setup failed (${result.exitCode}): ${result.stderr || result.stdout}`);
    return result;
  };
  const heartbeat = setInterval(() => console.error(`[build] ${id}: ${record.status} in Daytona ${sandbox?.sandboxId ?? "provisioning"}`), 30_000);
  heartbeat.unref();
  try {
    sandbox = await provider.create({ snapshot: profile.snapshot_name, resources: {
      cpu: profile.resource_class.cpu, memoryGiB: profile.resource_class.memory_gib, diskGiB: profile.resource_class.disk_gib,
    }, labels: { game_id: game.gameId, purpose: "harness-build", build_id: id }, ttlMinutes: 90, ephemeral: true });
    record.sandboxId = sandbox.sandboxId;
    await persist();
    const bundlePath = resolve(temp, "source.bundle");
    // The image clone is shallow at the baked revision, so a symbol-check
    // baseline below that boundary must travel in the bundle as its own head
    // (git bundle only records refs, never raw ids).
    const baselineRevision = task.kind === "symbol-check" && typeof task.input.baselineRevision === "string" ? task.input.baselineRevision : null;
    const baselineRef = baselineRevision ? `refs/decomp-orchestrator/symbol-baseline/${id}` : null;
    if (baselineRef) await git(repoRoot, ["update-ref", baselineRef, baselineRevision!]);
    try {
      await git(repoRoot, ["-c", "pack.threads=1", "bundle", "create", bundlePath, "HEAD", ...(baselineRef ? [baselineRef] : [])]);
    } finally {
      if (baselineRef) await git(repoRoot, ["update-ref", "-d", baselineRef]).catch(() => undefined);
    }
    await sandbox.uploadFile(bundlePath, "/tmp/build-source.bundle");
    await exec(["git", "fetch", "/tmp/build-source.bundle", source.head]);
    if (baselineRef) await exec(["git", "fetch", "/tmp/build-source.bundle", `${baselineRef}:${baselineRef}`]);
    await exec(["git", "checkout", "--force", "--detach", source.head]);
    // Snapshots can bake untracked junk (e.g. a macOS .DS_Store) that `git add -A`
    // would fold into the remote tree. Drop untracked, non-ignored files only;
    // ignored toolchains, orig assets, and build caches stay. Host inputs follow.
    await exec(["git", "clean", "-fd"]);
    // Discard only artifacts in this disposable sandbox, retaining its Linux
    // compiler/tool/original assets. Never upload host build caches.
    await exec(["python3", "-c", "from pathlib import Path\nfor p in Path('build').rglob('*.json'):\n if p.name in ('report.json','report_changes.json','baseline.json'): p.unlink()"]);
    if (source.patch) {
      await sandbox.writeFile("/tmp/build-input.patch", source.patch);
      await exec(["git", "apply", "--binary", "/tmp/build-input.patch"]);
    }
    for (const file of source.files) {
      const path = `${remoteRoot}/${file.path}`;
      await exec(["mkdir", "-p", dirname(path)]);
      const local = resolve(temp, digest(file.path)); await writeFile(local, file.bytes);
      await sandbox.uploadFile(local, path);
      await exec(["chmod", file.executable ? "755" : "644", path]);
    }
    await exec(["git", "add", "-A"]);
    const remoteTree = (await exec(["git", "write-tree"])).stdout.trim();
    if (remoteTree !== source.tree) throw new Error(`Sandbox source tree mismatch: expected ${source.tree}, received ${remoteTree}`);
    for (const name of ["baseline.json", "report.json", "report_changes.json"]) {
      const local = resolve(repoRoot, dirname(game.validation.reportPath), name);
      if (existsSync(local)) {
        const remote = `${remoteRoot}/${relative(repoRoot, local)}`;
        await exec(["mkdir", "-p", dirname(remote)]);
        await sandbox.uploadFile(local, remote);
      }
    }
    if (task.kind === "qa") {
      await ensureSandboxToolpack(sandbox, { hostToolpackRoot: resolve(game.orchestratorRoot, "toolpacks/gamecube-decomp"), toolpackId: "gamecube-decomp" });
      await exec(["mkdir", "-p", `${REMOTE_ORCHESTRATOR}/toolpacks`]);
      await exec(["cp", "-a", "/opt/toolpacks/gamecube-decomp", `${REMOTE_ORCHESTRATOR}/toolpacks/gamecube-decomp`]);
      await sandbox.writeFile(`${REMOTE_ORCHESTRATOR}/package.json`, JSON.stringify({ name: "harness-build-runner", private: true }));
      // Global standards live in the platform-level knowledge root; the scan
      // composes them with the game's own tree (Melee's is an empty shell).
      // Banned-pattern data is still Melee review-corpus data, so its game dir
      // is uploaded alongside the scanned game's.
      await uploadTree(sandbox, resolve(game.orchestratorRoot, GLOBAL_STANDARDS_SLICES_RELATIVE_PATH), `${REMOTE_ORCHESTRATOR}/${GLOBAL_STANDARDS_SLICES_RELATIVE_PATH}`, game.orchestratorRoot);
      for (const gameId of new Set([game.gameId, "melee"])) {
        const dir = resolve(game.orchestratorRoot, "games", gameId);
        await exec(["mkdir", "-p", `${REMOTE_ORCHESTRATOR}/games/${gameId}`]);
        await sandbox.uploadFile(resolve(dir, "game.json"), `${REMOTE_ORCHESTRATOR}/games/${gameId}/game.json`);
        const parts = gameId === game.gameId
          ? ["config", "knowledge/sources/injectable/decomp_standards/standards", "knowledge/sources/injectable/banned_patterns/data"]
          : ["knowledge/sources/injectable/banned_patterns/data"];
        for (const part of parts) await uploadTree(sandbox, resolve(dir, part), `${REMOTE_ORCHESTRATOR}/games/${gameId}/${part}`, game.orchestratorRoot);
      }
      const diffFile = task.input.diffFile;
      if (typeof diffFile === "string") {
        const remote = "/tmp/qa-input.diff";
        await sandbox.uploadFile(diffFile, remote);
        task = { ...task, input: { ...task.input, diffFile: remote } };
      }
    }
    // Worker images predate the host task runner. Bootstrap its pinned Linux
    // runtime remotely; no native host binary or toolchain is transferred.
    const bunPath = `${REMOTE_ORCHESTRATOR}/bin/bun`;
    await exec(["python3", "-c", [
      "import io, os, urllib.request, zipfile",
      "root = '/opt/build-orchestrator/bin'",
      "os.makedirs(root, exist_ok=True)",
      "data = urllib.request.urlopen('https://github.com/oven-sh/bun/releases/download/bun-v1.3.10/bun-linux-x64-baseline.zip').read()",
      "archive = zipfile.ZipFile(io.BytesIO(data))",
      "open(root + '/bun', 'wb').write(archive.read('bun-linux-x64-baseline/bun'))",
      "os.chmod(root + '/bun', 0o755)",
    ].join("\n")]);
    const bundle = resolve(temp, "worker.mjs");
    await (dependencies.bundleWorker ?? buildWorker)(bundle);
    await exec(["mkdir", "-p", dirname(REMOTE_RUNNER)]);
    await sandbox.uploadFile(bundle, REMOTE_RUNNER);
    const input = mapBuildPaths(task.input, toRemote);
    const extraOutputs = new Map<string, string>();
    const keys = task.kind === "report-changes" ? ["baselinePath", "reportPath", "changesPath"] : task.kind === "report" ? ["baselinePath", "reportPath", "reportChangesPath"] : [];
    for (const key of keys) {
      if (typeof task.input[key] !== "string") continue;
      const local = resolve(repoRoot, task.input[key] as string);
      const remote = within(repoRoot, local) ? `${remoteRoot}/${relative(repoRoot, local)}` : `/tmp/build-files/${key}.json`;
      input[key] = remote;
      extraOutputs.set(remote, local);
      await exec(["mkdir", "-p", dirname(remote)]);
      toHost.unshift([remote, local]);
      if (existsSync(local) && key !== "changesPath" && key !== "reportChangesPath") {
        await exec(["mkdir", "-p", dirname(remote)]);
        await sandbox.uploadFile(local, remote);
      }
    }
    if (task.kind === "report") delete input.toolPlatform;
    if (["precommit", "autofix"].includes(task.kind)) input.cacheDir = "/tmp/build-precommit-cache";
    const timeoutMs = typeof task.input.timeoutMs === "number" ? task.input.timeoutMs : DEFAULT_TIMEOUT;
    const request = { repoRoot: remoteRoot, sourceTree: source.tree, gameKind: game.kind, reportOptions: { reportPath: game.validation.reportPath, reportChangesPath: game.validation.reportChangesPath }, task: { ...task, input }, logDir: remoteLog, resultPath: "/tmp/build-result.json", artifactRoots: [`${remoteRoot}/build`, `${remoteRoot}/build-ci`], extraArtifacts: [...extraOutputs.keys()].filter(path => task.kind !== "report-changes" || path === input.changesPath) };
    await sandbox.writeFile("/tmp/build-request.json", JSON.stringify(request));
    record.status = "running"; await persist();
    console.error(`[build] ${task.kind} ${source.head.slice(0, 10)} -> Daytona ${sandbox.sandboxId}`);
    const result = await sandbox.exec(["timeout", "--signal=TERM", "--kill-after=30", String(Math.ceil(timeoutMs / 1000)), bunPath, REMOTE_RUNNER, "/tmp/build-request.json"], {
      cwd: remoteRoot, timeoutMs: timeoutMs + 60_000, env: { ORCH_BUILD_EXECUTION: "local", ORCH_GLOBAL_COMPILE_SLOTS: String(profile.resource_class.cpu) },
    });
    await writeFile(resolve(evidenceDir, "worker.stdout.log"), result.stdout);
    await writeFile(resolve(evidenceDir, "worker.stderr.log"), result.stderr);
    if (result.exitCode !== 0) throw new Error(`Daytona build runner failed (${result.exitCode}): ${result.stderr || result.stdout}`);
    const response: BuildResponse = JSON.parse(await sandbox.readFile("/tmp/build-result.json"));
    await writeFile(resolve(evidenceDir, "result.json"), JSON.stringify(response, null, 2));
    const checkoutMoved = (await captureSourceIdentity(repoRoot)).digest !== source.digest;
    // A QA scan reads lint policy from the checkout and scans a diff file; its
    // verdict holds for the snapshot it ran on even when integrations move the
    // shared checkout meanwhile. It still never publishes into a moved checkout.
    const stale = checkoutMoved && task.kind !== "qa";
    // format-apply returns its diff in the value for the caller to apply on the host; the sandbox edit itself is expected.
    const unexpectedEdit = !!response.sourcePatch?.trim() && !["autofix", "precommit", "format-apply"].includes(task.kind);
    const value = response.value as { exitCode?: number; status?: string; ok?: boolean } | undefined;
    const failed = !!response.failure || stale || unexpectedEdit || (value?.exitCode !== undefined && value.exitCode !== 0) || value?.ok === false || ["error", "failed", "blocked"].includes(value?.status ?? "");
    const stagedArtifacts: Array<[string, string]> = [];
    for (const remote of response.artifacts) {
      if (resolve(remote) !== remote) throw new Error(`Invalid build artifact: ${remote}`);
      const log = within(remoteLog, remote);
      if ((failed || checkoutMoved) && !log) continue;
      const relativePath = relative(remoteRoot, remote);
      const allowed = /^(?:build|build-ci)\/[^\n]*\/(?:report(?:_changes)?|baseline)\.json$/.test(relativePath)
        || ["build.ninja", "objdiff.json", "compile_commands.json"].includes(relativePath);
      if (!log && !allowed && !extraOutputs.has(remote)) throw new Error(`Unexpected build artifact: ${remote}`);
      const local = extraOutputs.get(remote) ?? mapBuildPaths(remote, toHost);
      if (!extraOutputs.has(remote) && !within(repoRoot, local) && !within(evidenceDir, local)) throw new Error(`Invalid build artifact destination: ${local}`);
      await mkdir(dirname(local), { recursive: true });
      // Never follow a source-controlled symlink out of the checkout.
      if (within(repoRoot, local) && !within(await realpath(repoRoot), await realpath(dirname(local)))) throw new Error(`Artifact parent escapes checkout: ${local}`);
      const staged = resolve(temp, digest(remote));
      await sandbox.downloadFile(remote, staged);
      if (remote.endsWith(".json")) await writeFile(staged, mapBuildPaths(await readFile(staged, "utf8"), toHost));
      stagedArtifacts.push([staged, local]);
    }
    try {
      const movedDuringTransfer = !failed && !checkoutMoved && (await captureSourceIdentity(repoRoot)).digest !== source.digest;
      // Same rule as the post-build check: a QA verdict stands, its artifacts are not published.
      if (movedDuringTransfer && task.kind !== "qa") throw new Error("Checkout changed during artifact transfer; rejecting stale artifacts");
      for (const [staged, local] of movedDuringTransfer ? [] : stagedArtifacts) {
        const adjacent = `${local}.${id}.tmp`;
        try { await copyFile(staged, adjacent); await rename(adjacent, local); }
        finally { await rm(adjacent, { force: true }); }
      }
    } finally { for (const [staged] of stagedArtifacts) await rm(staged, { force: true }); }
    if (stale) throw new Error("Checkout changed during Daytona build; rejecting stale artifacts");
    if (unexpectedEdit) throw new Error("Build task changed source unexpectedly; refusing to publish tool edits");
    if (response.failure) throw Object.assign(new Error(response.failure.message), mapBuildPaths(response.failure, toHost));
    if (task.kind === "autofix" && response.sourcePatch?.trim()) {
      const patch = resolve(temp, "autofix.patch"); await writeFile(patch, response.sourcePatch);
      await git(repoRoot, ["apply", "--check", patch]);
      await git(repoRoot, ["apply", patch]);
    }
    record.status = failed ? "rejected" : "completed"; await persist();
    return mapBuildPaths(response.value, toHost) as T;
  } catch (error) {
    record.status = "failed"; record.error = error instanceof Error ? error.message : String(error); await persist();
    throw error;
  } finally {
    clearInterval(heartbeat);
    if (sandbox) {
      try { await provider.delete(sandbox.sandboxId, "settlement"); record.cleanedUp = true; }
      catch (error) { record.cleanupError = String(error); console.error(`[build] cleanup required for ${sandbox.sandboxId}: ${String(error)}`); }
    }
    record.finishedAt = new Date().toISOString(); await persist();
    await rm(temp, { recursive: true, force: true });
  }
}
