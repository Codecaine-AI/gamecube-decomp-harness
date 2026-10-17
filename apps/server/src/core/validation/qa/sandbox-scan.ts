/**
 * Worker L1 QA lint placement: run `scan_diff.py` in the attempt's own worker
 * sandbox instead of an ephemeral Daytona build sandbox per attempt.
 *
 * Provisioning syncs the QA assets (standards trees, game descriptors, banned
 * patterns) into every worker sandbox under SANDBOX_QA_ROOT, with the same
 * layout the build path uploads (`validation/build/daytona.ts`, `task.kind ===
 * "qa"`), and writes SANDBOX_QA_STAMP_PATH once the sync completed. The
 * toolpack is the sandbox copy under SANDBOX_TOOLPACK_ROOT.
 *
 * `ORCH_QA_LINT_PLACEMENT` (default `sandbox`; `auto` is an alias of it):
 *   sandbox - worker sandbox only; missing assets, an unreproducible
 *             pre-attempt snapshot, a failed upload or scan is a tool failure
 *             recorded as the scan's toolError (L1 fails open on tool failures).
 *   build   - explicit opt-in to the build path (host diff, then a Daytona
 *             build sandbox, or the host when ORCH_BUILD_EXECUTION=local).
 * Nothing falls back to the host or a build sandbox automatically.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { resolveRegisteredTool, GAME_HOST_REPO_ROOT_ENV, SANDBOX_TOOLPACK_ROOT, type ResolvedRegisteredTool } from "@server/core/tools/resolver";
import { uploadThroughExec } from "@server/core/validation/steering/steering-check.js";
import type { WorkspaceExec } from "@server/infrastructure/shell";
import { remoteBuildsEnabled } from "../build/execution.js";
import {
  QA_SCAN_REQUIRES_GAME_ERROR,
  qaScanArgs,
  qaScanEnv,
  qaScanInvocationFromProcess,
  runQaScanDiff,
  type QaScanInvocation,
  type RunQaScanDiffOptions,
} from "./scan-diff.js";

// Root of the QA assets provisioning syncs into every worker sandbox, and the stamp written once that sync completed.
import { SANDBOX_QA_ROOT, SANDBOX_QA_STAMP_PATH } from "@server/core/job-queue/provisioning.js";
export { SANDBOX_QA_ROOT, SANDBOX_QA_STAMP_PATH };

export const QA_LINT_PLACEMENT_ENV = "ORCH_QA_LINT_PLACEMENT";
export type QaLintPlacement = "sandbox" | "build";

/** Per-exec ceiling for the scan itself; the scan reads a single attempt's diff. */
export const SANDBOX_QA_SCAN_TIMEOUT_MS = 10 * 60_000;
const SANDBOX_QA_PROBE_TIMEOUT_MS = 30_000;
const SANDBOX_QA_UPLOAD_TIMEOUT_MS = 60_000;

/** Host tool env that names host-only artifacts; never forwarded into the sandbox. */
const HOST_ONLY_QA_ENV = new Set(["MWCC_WIBO", GAME_HOST_REPO_ROOT_ENV]);

export function qaLintPlacement(env: Record<string, string | undefined> = process.env): QaLintPlacement {
  const raw = env[QA_LINT_PLACEMENT_ENV]?.trim() || "sandbox";
  if (raw === "auto" || raw === "sandbox") return "sandbox";
  if (raw === "build") return raw;
  throw new Error(`Invalid ${QA_LINT_PLACEMENT_ENV}: ${raw}`);
}

function under(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root.replace(/\/+$/, "")}/`);
}

/** First matching root wins; only whole-path prefixes are rewritten. */
function mapPath(value: string, mappings: Array<[string, string]>): string {
  for (const [from, to] of mappings) {
    if (under(value, from)) return `${to}${value.slice(from.replace(/\/+$/, "").length)}`;
  }
  return value;
}

export interface SandboxQaScanPlan {
  scriptPath: string;
  toolpackReadyPath: string;
  env: Record<string, string>;
}

/**
 * Sandbox script path and env equivalent to what the host/build path computes
 * (`resolveRegisteredTool(...).env` + `qaScanEnv`): toolpack paths map to the
 * sandbox toolpack copy, the game dir and orchestrator root to SANDBOX_QA_ROOT,
 * the host checkout to the sandbox workspace; host-only artifacts and any path
 * left outside the sandbox roots are dropped. ORCH_PACKAGE_ROOT points the
 * toolpack's default roots (global knowledge, Melee banned patterns) at the QA
 * root, as the build sandbox's package markers do.
 */
export function sandboxQaScanPlan(params: {
  resolved: ResolvedRegisteredTool;
  orchestratorRoot: string;
  /** Sandbox workspace root (the scanned checkout). */
  repoRoot: string;
  /** Host checkout of the game repo, when the host resolved paths against it. */
  hostRepoRoot?: string;
}): SandboxQaScanPlan {
  const { resolved } = params;
  const sandboxToolpackRoot = `${SANDBOX_TOOLPACK_ROOT}/${resolved.toolpackId}`;
  // Most specific first: the toolpack and the host checkout live under the
  // orchestrator root, the checkout usually under the game dir.
  const mappings: Array<[string, string]> = [
    [resolve(resolved.toolpackRoot), sandboxToolpackRoot],
    ...(params.hostRepoRoot ? [[resolve(params.hostRepoRoot), params.repoRoot] as [string, string]] : []),
    [resolve(resolved.gameDir), `${SANDBOX_QA_ROOT}/games/${resolved.gameId}`],
    [resolve(params.orchestratorRoot), SANDBOX_QA_ROOT],
  ];
  const sandboxRoots = [SANDBOX_QA_ROOT, SANDBOX_TOOLPACK_ROOT, params.repoRoot];
  const hostEnv = qaScanEnv({ orchestratorRoot: params.orchestratorRoot, gameId: resolved.gameId, toolEnv: resolved.env });
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(hostEnv)) {
    if (HOST_ONLY_QA_ENV.has(key)) continue;
    const mapped = mapPath(value, mappings);
    if (mapped.startsWith("/") && !sandboxRoots.some((root) => under(mapped, root))) continue;
    env[key] = mapped;
  }
  env.ORCH_PACKAGE_ROOT = SANDBOX_QA_ROOT;
  return {
    scriptPath: `${mapPath(resolve(resolved.apiRoot), mappings)}/scan_diff.py`,
    toolpackReadyPath: `${sandboxToolpackRoot}/.ready`,
    env,
  };
}

const readyProbes = new WeakMap<WorkspaceExec, Set<string>>();

/** One cheap exec: the QA stamp, the toolpack stamp and the scanner all exist. Positive results are cached per exec. */
export async function sandboxQaAssetsReady(exec: WorkspaceExec, plan: Pick<SandboxQaScanPlan, "scriptPath" | "toolpackReadyPath">): Promise<boolean> {
  const key = `${plan.toolpackReadyPath}\0${plan.scriptPath}`;
  if (readyProbes.get(exec)?.has(key)) return true;
  try {
    const probe = await exec.exec(
      ["test", "-f", SANDBOX_QA_STAMP_PATH, "-a", "-f", plan.toolpackReadyPath, "-a", "-f", plan.scriptPath],
      { timeoutMs: SANDBOX_QA_PROBE_TIMEOUT_MS },
    );
    if (probe.exitCode !== 0) return false;
  } catch {
    return false;
  }
  const cached = readyProbes.get(exec);
  if (cached) cached.add(key);
  else readyProbes.set(exec, new Set([key]));
  return true;
}

function sandboxToolError(command: string[], toolError: string): QaScanInvocation {
  return { exitCode: -1, result: null, stdout: "", stderr: "", toolError, command, executionSurface: "worker_sandbox" };
}

/**
 * Upload the host-written patch (`options.diffFile`) to `sandboxDiffPath`
 * (unless it was generated there) and run the scanner against the sandbox checkout. Lint policy files that the
 * rules read from the checkout (map, headers, post-edit sources) now come from
 * the sandbox checkout at the claim base plus the worker's edits, not from the
 * host checkout, which can lag the claim revision.
 */
export async function runSandboxQaScanDiff(exec: WorkspaceExec, params: {
  plan: SandboxQaScanPlan;
  /** Today's scan options; `repoRoot` is replaced by `sandboxRepoRoot`, `diffFile` by `sandboxDiffPath`. */
  options: RunQaScanDiffOptions;
  sandboxRepoRoot: string;
  sandboxDiffPath: string;
  /** The patch already sits at `sandboxDiffPath` (generated in the sandbox): skip the upload. */
  diffInSandbox?: boolean;
  timeoutMs?: number;
}): Promise<QaScanInvocation> {
  const { options, plan } = params;
  const command = ["python3", plan.scriptPath, ...qaScanArgs({ ...options, repoRoot: params.sandboxRepoRoot, diffFile: params.sandboxDiffPath })];
  if (!params.diffInSandbox) {
    if (!options.diffFile) return sandboxToolError(command, "worker sandbox QA scan requires a diff file");
    try {
      await uploadThroughExec(exec, params.sandboxDiffPath, await readFile(options.diffFile, "utf8"), SANDBOX_QA_UPLOAD_TIMEOUT_MS);
    } catch (error) {
      return sandboxToolError(command, `worker sandbox QA diff upload failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  let result: { exitCode: number; stdout: string; stderr: string };
  try {
    result = await exec.exec(command, { env: plan.env, timeoutMs: params.timeoutMs ?? SANDBOX_QA_SCAN_TIMEOUT_MS });
  } catch (error) {
    return sandboxToolError(command, `worker sandbox QA scan failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  return { ...qaScanInvocationFromProcess({ repoRoot: params.sandboxRepoRoot, baseRef: options.baseRef }, result, command), executionSurface: "worker_sandbox" };
}

/**
 * Copies the pre-attempt sources (raw bytes) into a sandbox snapshot dir: the
 * worker-sandbox twin of the host `pre_worker_source` snapshot. It also
 * records, per path, the commit (HEAD at capture) whose blob equals the
 * pre-attempt bytes, so a path missing from the twin can be rebuilt from git
 * later. argv: dir, JSON list of workspace-relative paths. Prints
 * {"copied": [...], "revs": {path: sha}}.
 */
const SANDBOX_SNAPSHOT_PY = [
  "import json, os, shutil, subprocess, sys",
  "root, paths = sys.argv[1], json.loads(sys.argv[2])",
  "shutil.rmtree(root, ignore_errors=True)",
  "head = subprocess.run(['git', 'rev-parse', '--verify', 'HEAD^{commit}'], capture_output=True)",
  "rev = head.stdout.decode().strip() if head.returncode == 0 else ''",
  "copied, revs = [], {}",
  "for rel in paths:",
  "    try:",
  "        data = open(rel, 'rb').read()",
  "    except OSError:",
  "        continue",
  "    if rev:",
  "        shown = subprocess.run(['git', 'show', rev + ':' + rel], capture_output=True)",
  "        if shown.returncode == 0 and shown.stdout == data:",
  "            revs[rel] = rev",
  "    dest = os.path.join(root, rel)",
  "    try:",
  "        os.makedirs(os.path.dirname(dest) or '.', exist_ok=True)",
  "        open(dest, 'wb').write(data)",
  "        copied.append(rel)",
  "    except OSError:",
  "        pass",
  "print(json.dumps({'copied': copied, 'revs': revs}))",
].join("\n");

/**
 * Writes `git show <rev>:<path>` into the sandbox snapshot (raw bytes), per
 * entry; `rev` is resolved to a commit first. argv: dir, JSON [{path, rev}].
 * Prints {"restored": {path: sha}} for the entries it wrote.
 */
const SANDBOX_SNAPSHOT_FROM_GIT_PY = [
  "import json, os, subprocess, sys",
  "root, entries = sys.argv[1], json.loads(sys.argv[2])",
  "restored = {}",
  "for entry in entries:",
  "    rel, rev = entry['path'], entry['rev']",
  "    commit = subprocess.run(['git', 'rev-parse', '--verify', rev + '^{commit}'], capture_output=True)",
  "    if commit.returncode != 0:",
  "        continue",
  "    sha = commit.stdout.decode().strip()",
  "    shown = subprocess.run(['git', 'show', sha + ':' + rel], capture_output=True)",
  "    if shown.returncode != 0:",
  "        continue",
  "    dest = os.path.join(root, rel)",
  "    try:",
  "        os.makedirs(os.path.dirname(dest) or '.', exist_ok=True)",
  "        open(dest, 'wb').write(shown.stdout)",
  "        restored[rel] = sha",
  "    except OSError:",
  "        pass",
  "print(json.dumps({'restored': restored}))",
].join("\n");

/**
 * The host L1 diff (`runWorkerQaLintScan`), run in the sandbox: per path, the
 * pre-attempt snapshot copy against a scratch copy of the current file via
 * `git diff --no-index --output`, headers rewritten to repo-relative a/ b/
 * paths exactly as `rewriteNoIndexDiffPaths` does (nothing before the first
 * `@@`, trailing blank lines dropped), sections joined with "\n" plus a final
 * newline. A path with no snapshot copy or no readable current file is skipped;
 * a git exit other than 0/1 is an error. argv: snapshot dir, scratch dir,
 * patch path, JSON paths. Prints {"sections": n, "patch": text} or {"error": text}.
 */
const SANDBOX_QA_DIFF_PY = [
  "import json, os, shutil, subprocess, sys",
  "snap, scratch, patch_path, paths = sys.argv[1], sys.argv[2], sys.argv[3], json.loads(sys.argv[4])",
  "shutil.rmtree(scratch, ignore_errors=True)",
  "os.makedirs(scratch, exist_ok=True)",
  "raw_path = os.path.join(scratch, 'raw.patch')",
  "def rewrite(raw, rel):",
  "    lines = raw.split(b'\\n')",
  "    start = next((i for i, line in enumerate(lines) if line.startswith(b'@@')), -1)",
  "    if start == -1:",
  "        return b''",
  "    while lines and lines[-1] == b'':",
  "        lines.pop()",
  "    name = rel.encode('utf-8')",
  "    return b'\\n'.join([b'diff --git a/' + name + b' b/' + name, b'--- a/' + name, b'+++ b/' + name] + lines[start:])",
  "sections = []",
  "for rel in paths:",
  "    pre = os.path.join(snap, rel)",
  "    if not os.path.exists(pre):",
  "        continue",
  "    current = os.path.join(scratch, 'current', rel)",
  "    try:",
  "        os.makedirs(os.path.dirname(current), exist_ok=True)",
  "        shutil.copyfile(rel, current)",
  "    except OSError:",
  "        continue",
  "    diff = subprocess.run(['git', 'diff', '--no-index', '--output=' + raw_path, pre, current], capture_output=True)",
  "    if diff.returncode not in (0, 1):",
  "        detail = diff.stderr.decode('utf-8', 'replace').strip()[:400]",
  "        print(json.dumps({'error': 'git diff --no-index exited %d for %s: %s' % (diff.returncode, rel, detail)}))",
  "        sys.exit(0)",
  "    try:",
  "        raw = open(raw_path, 'rb').read()",
  "    except OSError:",
  "        raw = b''",
  "    section = rewrite(raw, rel)",
  "    if section:",
  "        sections.append(section)",
  "patch = b'\\n'.join(sections) + b'\\n' if sections else b''",
  "if sections:",
  "    os.makedirs(os.path.dirname(patch_path) or '.', exist_ok=True)",
  "    open(patch_path, 'wb').write(patch)",
  "print(json.dumps({'sections': len(sections), 'patch': patch.decode('utf-8', 'replace')}))",
].join("\n");

const SANDBOX_QA_SNAPSHOT_TIMEOUT_MS = 60_000;

/** Workspace-relative sandbox QA scratch for one baseline (keyed by its host output dir, so two baselines never share it). */
export function sandboxQaWorkDir(hostOutputDir: string): string {
  return `build/qa/${createHash("sha256").update(hostOutputDir).digest("hex").slice(0, 12)}`;
}

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

/**
 * Copy the pre-attempt sources into the sandbox snapshot. Returns the paths
 * copied and, for paths whose bytes equal HEAD's blob, the HEAD commit (the
 * evidence that lets a lost copy be rebuilt from git). Fail-open: empty on any
 * failure.
 */
export async function snapshotSandboxQaSources(exec: WorkspaceExec, params: { dir: string; paths: string[] }): Promise<{ copied: string[]; revs: Record<string, string> }> {
  try {
    const result = await exec.exec(["python3", "-c", SANDBOX_SNAPSHOT_PY, params.dir, JSON.stringify(params.paths)], { timeoutMs: SANDBOX_QA_SNAPSHOT_TIMEOUT_MS });
    if (result.exitCode !== 0) return { copied: [], revs: {} };
    const parsed = JSON.parse(result.stdout) as { copied?: unknown; revs?: unknown };
    const copied = Array.isArray(parsed.copied) ? parsed.copied.filter((path): path is string => typeof path === "string") : [];
    return { copied, revs: stringRecord(parsed.revs) };
  } catch {
    return { copied: [], revs: {} };
  }
}

/** Write `git show <rev>:<path>` into the sandbox snapshot per entry; returns path → resolved commit for those written. */
export async function restoreSandboxQaSnapshotFromGit(exec: WorkspaceExec, params: { dir: string; entries: Array<{ path: string; rev: string }> }): Promise<Record<string, string>> {
  if (params.entries.length === 0) return {};
  try {
    const result = await exec.exec(["python3", "-c", SANDBOX_SNAPSHOT_FROM_GIT_PY, params.dir, JSON.stringify(params.entries)], { timeoutMs: SANDBOX_QA_SNAPSHOT_TIMEOUT_MS });
    if (result.exitCode !== 0) return {};
    return stringRecord((JSON.parse(result.stdout) as { restored?: unknown }).restored);
  } catch {
    return {};
  }
}

export type SandboxQaDiffResult =
  | { status: "ok"; sections: number; patchText: string }
  | { status: "error"; toolError: string };

/** Generate the attempt's L1 patch inside the sandbox and leave it at `patchPath` (written only when it has sections). */
export async function generateSandboxQaDiff(exec: WorkspaceExec, params: { snapshotDir: string; scratchDir: string; patchPath: string; paths: string[] }): Promise<SandboxQaDiffResult> {
  let result: { exitCode: number; stdout: string; stderr: string };
  try {
    result = await exec.exec(
      ["python3", "-c", SANDBOX_QA_DIFF_PY, params.snapshotDir, params.scratchDir, params.patchPath, JSON.stringify(params.paths)],
      { timeoutMs: SANDBOX_QA_SNAPSHOT_TIMEOUT_MS },
    );
  } catch (error) {
    return { status: "error", toolError: `sandbox QA diff failed: ${error instanceof Error ? error.message : String(error)}` };
  }
  let parsed: { sections?: unknown; patch?: unknown; error?: unknown };
  try {
    parsed = JSON.parse(result.stdout) as typeof parsed;
  } catch {
    return { status: "error", toolError: `sandbox QA diff exited ${result.exitCode}: ${result.stderr.trim().slice(0, 400)}` };
  }
  if (typeof parsed.error === "string") return { status: "error", toolError: parsed.error };
  if (result.exitCode !== 0 || typeof parsed.sections !== "number" || typeof parsed.patch !== "string") {
    return { status: "error", toolError: `sandbox QA diff exited ${result.exitCode}: ${result.stderr.trim().slice(0, 400)}` };
  }
  return { status: "ok", sections: parsed.sections, patchText: parsed.patch };
}

export type WorkerSandboxQaRoute =
  | { route: "sandbox"; plan: SandboxQaScanPlan }
  | { route: "build" }
  | { route: "failed"; invocation: QaScanInvocation };

/**
 * Where the worker L1 scan runs: `build` (today's path), `sandbox` (assets
 * provisioned), or `failed` (sandbox placement without assets, or no game).
 */
export async function routeWorkerQaScan(request: Pick<WorkerQaScanRequest, "exec" | "options" | "sandboxRepoRoot" | "placement">): Promise<WorkerSandboxQaRoute> {
  const { options } = request;
  const placement = request.placement ?? qaLintPlacement();
  if (placement === "build") return { route: "build" };
  // Same fail-closed result as runQaScanDiff, without touching either surface.
  if (!options.game?.gameId) return { route: "failed", invocation: sandboxToolError([], QA_SCAN_REQUIRES_GAME_ERROR) };
  let plan: SandboxQaScanPlan;
  try {
    const resolved = resolveRegisteredTool(
      { game: options.game, repoRoot: request.sandboxRepoRoot, hostRepoRoot: options.repoRoot, stateDir: options.stateDir, worktreeId: options.worktreeId },
      "review_lint",
    );
    plan = sandboxQaScanPlan({ resolved, orchestratorRoot: options.orchestratorRoot, repoRoot: request.sandboxRepoRoot, hostRepoRoot: options.repoRoot });
  } catch (error) {
    return { route: "failed", invocation: sandboxToolError([], `worker sandbox QA scan could not resolve review_lint: ${error instanceof Error ? error.message : String(error)}`) };
  }
  if (await sandboxQaAssetsReady(request.exec, plan)) return { route: "sandbox", plan };
  return {
    route: "failed",
    invocation: sandboxToolError(
      ["test", "-f", SANDBOX_QA_STAMP_PATH, "-a", "-f", plan.toolpackReadyPath, "-a", "-f", plan.scriptPath],
      `${QA_LINT_PLACEMENT_ENV}=sandbox but the worker sandbox has no QA assets (${SANDBOX_QA_STAMP_PATH}, ${plan.toolpackReadyPath} or ${plan.scriptPath} is missing)`,
    ),
  };
}

export interface WorkerQaScanRequest {
  exec: WorkspaceExec;
  /** Today's (host/build path) scan options; `repoRoot` is the host checkout and `diffFile` the host patch. */
  options: RunQaScanDiffOptions;
  /** The worker sandbox's workspace root. */
  sandboxRepoRoot: string;
  /** Where the patch is uploaded in the sandbox. */
  sandboxDiffPath: string;
  /** Defaults to `ORCH_QA_LINT_PLACEMENT`. */
  placement?: QaLintPlacement;
  /** Build-path runner; defaults to `runQaScanDiff` (tests inject a fake). */
  buildRunner?: (options: RunQaScanDiffOptions) => Promise<QaScanInvocation>;
}

/** Route the worker L1 scan per placement; every result records its execution surface. */
export async function runWorkerQaScan(request: WorkerQaScanRequest): Promise<QaScanInvocation> {
  const route = await routeWorkerQaScan(request);
  if (route.route === "failed") return route.invocation;
  if (route.route === "build") return runBuildQaScan(request.options, request.buildRunner);
  return runSandboxQaScanDiff(request.exec, { plan: route.plan, options: request.options, sandboxRepoRoot: request.sandboxRepoRoot, sandboxDiffPath: request.sandboxDiffPath });
}

/** Today's path (Daytona build sandbox, or the host under ORCH_BUILD_EXECUTION=local), labelled with its surface. */
export async function runBuildQaScan(
  options: RunQaScanDiffOptions,
  buildRunner?: (options: RunQaScanDiffOptions) => Promise<QaScanInvocation>,
): Promise<QaScanInvocation> {
  const invocation = await (buildRunner ?? runQaScanDiff)(options);
  return { ...invocation, executionSurface: invocation.executionSurface ?? (options.game?.gameId && remoteBuildsEnabled() ? "build_sandbox" : "host") };
}
