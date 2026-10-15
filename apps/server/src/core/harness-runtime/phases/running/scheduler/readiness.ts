import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { packageRoot } from "@server/core/knowledge/paths.js";
import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import type { GameOrderingConfig } from "@server/core/game-registry/resolver.js";
import { createHash } from "node:crypto";
import type {
  BlockedCandidate,
  BoardSnapshot,
  ReadinessClassRef,
  ReadinessFunctionState,
  TargetReadiness,
} from "@server/core/shared/types/index.js";
import {
  latestDashboardArtifact,
  now,
  recordDashboardArtifact,
  type StateStore,
} from "@server/core/orchestrator-state";
import { addEvent, markEventHandled } from "@server/core/harness-runtime/run-state/events.js";
import { gameOrdering, orderingActive, orderingPolicyJson } from "@server/core/tools/ordering.js";
import { runCommand, type CommandResult } from "@server/infrastructure/shell";
import {
  READINESS_IDENTITY_FIELDS,
  type BoardReadinessOptions,
  type ReadinessIdentity,
  type ReadinessIndex,
  type ReadinessSummaryCounts,
} from "../board/readiness.js";

export type { BoardReadinessOptions, ReadinessIdentity, ReadinessIndex } from "../board/readiness.js";

/**
 * Scheduler side of class readiness (order-and-scope plan section 2). The
 * index comes from `toolpacks/gamecube-decomp/_impl/gamecube/tools/readiness.py
 * index` on the host checkout, once per epoch at the epoch-start revision,
 * BEFORE the admission transaction (`ensureSchedulerEpochFromBoard` is
 * synchronous and never loads readiness itself). Loads are cached per
 * request identity (repo, rev, version, policy); every failure is a value,
 * never a throw.
 */
export const READINESS_TOOLPACK_PATH = "_impl/gamecube/tools/readiness.py";
export const READINESS_TIMEOUT_MS = 120_000;

export type ReadinessFailureKind =
  | "missing_objects"
  | "missing_map"
  | "bad_rev"
  | "timeout"
  | "malformed"
  | "identity_mismatch"
  | "tool_failed"
  | "no_revision";

export type ReadinessLoad =
  | { ok: true; index: ReadinessIndex; cached?: boolean }
  | { ok: false; error: string; kind: ReadinessFailureKind };

export type ReadinessRunner = (args: string[], options: { timeoutMs: number }) => Promise<CommandResult>;

/** Runs `readiness.py` with python3 on the host checkout. */
export function hostReadinessRunner(scriptPath: string = defaultReadinessScript(), cwd?: string): ReadinessRunner {
  return async (args, options) => {
    try {
      return await runCommand(cwd ?? process.cwd(), ["python3", scriptPath, ...args], { timeoutMs: options.timeoutMs });
    } catch (error) {
      return { exitCode: 127, stdout: "", stderr: error instanceof Error ? error.message : String(error) };
    }
  };
}

export function defaultReadinessScript(): string {
  return resolve(packageRoot(), "toolpacks/gamecube-decomp", READINESS_TOOLPACK_PATH);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseClassRefs(value: unknown): ReadinessClassRef[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return null;
  const refs: ReadinessClassRef[] = [];
  for (const row of value) {
    if (!isRecord(row) || typeof row.class !== "string" || !row.class) return null;
    if (row.owner_unit !== undefined && row.owner_unit !== null && typeof row.owner_unit !== "string") return null;
    if (row.kind !== undefined && typeof row.kind !== "string") return null;
    refs.push({ class: row.class, owner_unit: typeof row.owner_unit === "string" ? row.owner_unit : null, kind: typeof row.kind === "string" ? row.kind : "construct" });
  }
  return refs;
}

function functionState(value: unknown): ReadinessFunctionState | null {
  return value === "ready" || value === "deferred" || value === "blocked" ? value : null;
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Parses `readiness.py index --json`; null when the shape does not match the contract. */
export function parseReadinessIndex(json: unknown): ReadinessIndex | null {
  if (!isRecord(json) || !isRecord(json.identity) || !isRecord(json.functions)) return null;
  const identity = json.identity;
  // Every identity field is required: a missing one could not be checked against the inputs.
  for (const key of READINESS_IDENTITY_FIELDS) {
    if (typeof identity[key] !== "string" || !identity[key]) return null;
  }
  const functions = new Map<string, TargetReadiness>();
  for (const [key, row] of Object.entries(json.functions)) {
    if (!key.includes("::") || !isRecord(row)) return null;
    const state = functionState(row.state);
    const unmet = parseClassRefs(row.unmet);
    const unresolved = parseClassRefs(row.unresolved);
    if (!state || !unmet || !unresolved) return null;
    functions.set(key, { state, unmet, unresolved });
  }
  const summary = isRecord(json.summary) ? json.summary : {};
  const counts: ReadinessSummaryCounts = {
    blocked: count(summary.blocked),
    deferred: count(summary.deferred),
    ready: count(summary.ready),
    unresolved_classes: count(summary.unresolved_classes),
  };
  const parsedIdentity = Object.fromEntries(READINESS_IDENTITY_FIELDS.map((key) => [key, identity[key] as string])) as unknown as ReadinessIdentity;
  return { identity: parsedIdentity, functions, summary: counts };
}

/** Python `json.dumps(value, sort_keys=True, separators=(",", ":"))` (ensure_ascii), for `policy_hash`. */
function pythonCanonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(pythonCanonicalJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${pythonCanonicalJson(key)}:${pythonCanonicalJson(value[key])}`).join(",")}}`;
  }
  if (typeof value === "string") return JSON.stringify(value).replace(/[\u0080-\uffff]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
  return JSON.stringify(value ?? null);
}

/** `readiness.policy_hash`: first 16 hex of sha256 over the canonical policy JSON. */
export function readinessPolicyHash(policy: unknown): string {
  return createHash("sha256").update(pythonCanonicalJson(policy ?? {})).digest("hex").slice(0, 16);
}

type IdentityProbe = { ok: true; identity: ReadinessIdentity } | { ok: false; kind: ReadinessFailureKind; error: string };

interface ObjdiffUnit { name: string; target_path: string }

function objdiffUnits(repo: string): ObjdiffUnit[] | null {
  try {
    const raw = JSON.parse(readFileSync(join(repo, "objdiff.json"), "utf8")) as { units?: unknown };
    if (!Array.isArray(raw.units)) return [];
    return raw.units
      .filter((unit): unit is Record<string, unknown> => isRecord(unit) && typeof unit.name === "string" && !!unit.name && typeof unit.target_path === "string" && !!unit.target_path)
      .map((unit) => ({ name: unit.name as string, target_path: unit.target_path as string }));
  } catch {
    return null;
  }
}

/** `unit_progress.find_map`: the first sorted match of the version's link-map patterns. */
function findMap(repo: string, version: string): string | null {
  for (const [dir, ext] of [["files", ".MAP"], ["files", ".map"], ["", ".MAP"], ["", ".map"]] as const) {
    const base = join(repo, "orig", version, dir);
    let entries: string[];
    try {
      entries = readdirSync(base);
    } catch {
      continue;
    }
    const found = entries.filter((name) => name.endsWith(ext) && name.length > ext.length).sort();
    if (found.length) return join(base, found[0]!);
  }
  return null;
}

/** `readiness.target_stamp`: sha1 over sorted `target_path:mtime_ns:size` lines of present objects. */
function targetStamp(repo: string, units: ObjdiffUnit[]): { stamp: string; present: number } {
  const hash = createHash("sha1");
  let present = 0;
  for (const unit of [...units].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    try {
      const stat = statSync(join(repo, unit.target_path), { bigint: true });
      hash.update(`${unit.target_path}:${stat.mtimeNs}:${stat.size}\n`);
      if (stat.isFile()) present += 1;
    } catch {
      // Missing objects do not enter the stamp, as in readiness.py.
    }
  }
  return { stamp: hash.digest("hex").slice(0, 16), present };
}

const mapShaMemo = new Map<string, { key: string; sha: string }>();

function mapSha(path: string): string {
  const stat = statSync(path, { bigint: true });
  const key = `${stat.mtimeNs}:${stat.size}`;
  const memo = mapShaMemo.get(path);
  if (memo?.key === key) return memo.sha;
  const sha = createHash("sha256").update(readFileSync(path)).digest("hex");
  mapShaMemo.set(path, { key, sha });
  return sha;
}

function gitCommit(repo: string, rev: string): string | null {
  const result = Bun.spawnSync(["git", "-C", repo, "rev-parse", "--verify", "--quiet", `${rev}^{commit}`], { stdout: "pipe", stderr: "pipe" });
  return result.exitCode === 0 ? result.stdout.toString().trim() || null : null;
}

/**
 * The identity a correct index for this request must carry, recomputed from
 * the inputs exactly as `readiness.py load` does: resolved repo, full commit,
 * build version, target-object stamp, link-map sha256 and policy hash.
 */
export function expectedReadinessIdentity(params: { repoRoot: string; rev: string; version: string | null; policy: unknown }): IdentityProbe {
  let repo: string;
  try {
    repo = realpathSync(resolve(params.repoRoot));
  } catch {
    return { ok: false, kind: "missing_objects", error: `missing_objects: ${params.repoRoot}: no such checkout` };
  }
  const rev = gitCommit(repo, params.rev);
  if (!rev) return { ok: false, kind: "bad_rev", error: `bad_rev: ${params.rev}: not a commit in ${repo}` };
  const units = objdiffUnits(repo);
  if (!units) return { ok: false, kind: "missing_objects", error: `missing_objects: ${join(repo, "objdiff.json")}: missing or unreadable` };
  const version = params.version ?? units.map((unit) => unit.target_path.split("/")).find((parts) => parts.length > 2 && parts[0] === "build")?.[1] ?? null;
  if (!version) return { ok: false, kind: "missing_objects", error: "missing_objects: cannot detect the build version" };
  const map = findMap(repo, version);
  if (!map) return { ok: false, kind: "missing_map", error: `missing_map: no link map under ${repo}/orig/${version}` };
  const { stamp, present } = targetStamp(repo, units);
  if (present === 0) return { ok: false, kind: "missing_objects", error: `missing_objects: no target objects under ${repo}/build/${version}/obj` };
  let mapDigest: string;
  try {
    mapDigest = mapSha(map);
  } catch (error) {
    return { ok: false, kind: "missing_map", error: `missing_map: ${map}: ${error instanceof Error ? error.message : String(error)}` };
  }
  return { ok: true, identity: { repo, rev, version, target_stamp: stamp, map_sha: mapDigest, policy_hash: readinessPolicyHash(params.policy) } };
}

/** Fields of `actual` that differ from `expected`. */
export function readinessIdentityMismatches(expected: ReadinessIdentity, actual: ReadinessIdentity): Array<keyof ReadinessIdentity> {
  return READINESS_IDENTITY_FIELDS.filter((key) => expected[key] !== actual[key]);
}

/** `build/<version>/report.json` -> `<version>`; null when the report path names no version. */
export function readinessVersion(globals: Pick<GlobalArgs, "game">): string | null {
  const reportPath = globals.game?.validation?.reportPath ?? "";
  return /(?:^|\/)build\/([^/]+)\/report\.json$/.exec(reportPath.replaceAll("\\", "/"))?.[1] ?? null;
}

const CACHE_LIMIT = 8;
const readinessCache = new Map<string, ReadinessIndex>();
const inFlight = new Map<string, Promise<ReadinessLoad>>();
/** Failed loads are remembered briefly so a parked run-loop does not rerun a failing tool every iteration. */
export const READINESS_FAILURE_TTL_MS = 60_000;
const failureCache = new Map<string, { load: ReadinessLoad; at: number }>();

/** Test hook: forget cached indexes. */
export function clearReadinessCache(): void {
  readinessCache.clear();
  inFlight.clear();
  failureCache.clear();
  mapShaMemo.clear();
}

function remember(key: string, index: ReadinessIndex): void {
  readinessCache.delete(key);
  readinessCache.set(key, index);
  while (readinessCache.size > CACHE_LIMIT) readinessCache.delete(readinessCache.keys().next().value!);
}

function failure(kind: ReadinessFailureKind, error: string): ReadinessLoad {
  return { ok: false, kind, error: `${kind}: ${error}` };
}

function toolFailure(result: CommandResult): ReadinessLoad {
  if (result.exitCode === 124) return failure("timeout", result.stderr.trim() || "readiness index timed out");
  if (result.exitCode === 2) {
    try {
      const parsed = JSON.parse(result.stderr.trim().split(/\r?\n/).at(-1) ?? "");
      if (isRecord(parsed) && typeof parsed.error === "string") {
        const kind = (["missing_objects", "missing_map", "bad_rev", "timeout", "malformed"] as const).find((value) => value === parsed.error) ?? "tool_failed";
        return failure(kind, typeof parsed.detail === "string" ? parsed.detail : JSON.stringify(parsed.detail ?? null));
      }
    } catch {
      // Fall through to the generic failure.
    }
  }
  return failure("tool_failed", `exit ${result.exitCode}: ${(result.stderr || result.stdout).trim().slice(0, 500) || "no output"}`);
}

async function withTimeout(promise: Promise<CommandResult>, timeoutMs: number): Promise<CommandResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<CommandResult>((resolveTimeout) => {
    timer = setTimeout(() => resolveTimeout({ exitCode: 124, stdout: "", stderr: `readiness index timed out after ${timeoutMs}ms` }), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface LoadReadinessParams {
  globals: Pick<GlobalArgs, "repoRoot" | "stateDir" | "game">;
  /** The epoch-start revision. */
  rev: string;
  timeoutMs?: number;
  runner?: ReadinessRunner;
  /** Override the ordering policy (defaults to the game's). */
  ordering?: GameOrderingConfig | null;
}

/**
 * Loads the readiness index for one revision. Never throws: missing objects
 * or map, bad revision, timeout, malformed output and a response for another
 * revision all come back as `{ ok: false }`. Successful loads are cached per
 * (repo, rev, version, policy); concurrent loads of one identity share a run.
 */
export async function loadReadinessForEpoch(params: LoadReadinessParams): Promise<ReadinessLoad> {
  if (!params.rev.trim()) return failure("no_revision", "no epoch-start revision");
  const ordering = params.ordering === undefined ? gameOrdering(params.globals.game) : params.ordering;
  const policyJson = ordering ? orderingPolicyJson(ordering) : JSON.stringify({ gatedPaths: [] });
  const version = readinessVersion(params.globals);
  const repo = resolve(params.globals.repoRoot);
  // The identity a correct answer must carry, from the inputs themselves (not from the tool).
  const probe = expectedReadinessIdentity({ repoRoot: repo, rev: params.rev, version, policy: JSON.parse(policyJson) });
  if (!probe.ok) return { ok: false, kind: probe.kind, error: probe.error };
  const expected = probe.identity;
  const key = JSON.stringify(READINESS_IDENTITY_FIELDS.map((field) => expected[field]));
  const cached = readinessCache.get(key);
  if (cached) return { ok: true, index: cached, cached: true };
  const pending = inFlight.get(key);
  if (pending) return pending;
  const failed = failureCache.get(key);
  if (failed && Date.now() - failed.at < READINESS_FAILURE_TTL_MS) return failed.load;

  const load = (async (): Promise<ReadinessLoad> => {
    const timeoutMs = params.timeoutMs ?? READINESS_TIMEOUT_MS;
    const runner = params.runner ?? hostReadinessRunner(defaultReadinessScript(), expected.repo);
    const args = [
      "index", "--repo", expected.repo, "--rev", expected.rev,
      "--version", expected.version,
      "--policy-json", policyJson,
      "--cache-dir", resolve(params.globals.stateDir, "readiness-cache"),
      "--json",
    ];
    const result = await withTimeout(runner(args, { timeoutMs }), timeoutMs);
    if (result.exitCode !== 0) return toolFailure(result);
    let json: unknown;
    try {
      json = JSON.parse(result.stdout);
    } catch {
      return failure("malformed", "readiness index output is not JSON");
    }
    const index = parseReadinessIndex(json);
    if (!index) return failure("malformed", "readiness index output does not match the contract (identity fields are all required)");
    // Identity recheck after the await: an index for other inputs never decides admission.
    const mismatched = readinessIdentityMismatches(expected, index.identity);
    if (mismatched.length) {
      return failure("identity_mismatch", mismatched.map((field) => `${field} expected ${expected[field]}, index has ${index.identity[field]}`).join("; "));
    }
    remember(key, index);
    return { ok: true, index };
  })();
  inFlight.set(key, load);
  try {
    const result = await load;
    // A response for other inputs is not a property of this identity; retry it immediately.
    if (!result.ok && result.kind !== "identity_mismatch") failureCache.set(key, { load: result, at: Date.now() });
    else failureCache.delete(key);
    return result;
  } finally {
    inFlight.delete(key);
  }
}

/** One epoch's readiness: the game's ordering mode plus the load at the epoch-start revision. */
export interface EpochReadiness {
  mode: "shadow" | "enforce";
  gatedPaths: string[];
  rev: string | null;
  load: ReadinessLoad;
}

export interface PrepareEpochReadinessParams extends Omit<LoadReadinessParams, "rev"> {
  rev: string | null | undefined;
  /**
   * The current epoch-start revision, read again after the load. If it moved
   * while the load was in flight (an integration landed), the load is redone
   * at the new revision once; a second move makes readiness unavailable.
   */
  currentRev?: () => string | null | undefined;
}

/**
 * Readiness for the next admission, or undefined when the game has no active
 * ordering (Melee, `off`): those games keep their admission unchanged.
 */
export async function prepareEpochReadiness(params: PrepareEpochReadinessParams): Promise<EpochReadiness | undefined> {
  const ordering = params.ordering === undefined ? gameOrdering(params.globals.game) : params.ordering;
  if (!ordering || !orderingActive(ordering.mode)) return undefined;
  const base = { mode: ordering.mode, gatedPaths: [...ordering.gatedPaths] };
  let rev: string = params.rev?.trim() ?? "";
  if (!rev) return { ...base, rev: null, load: failure("no_revision", "no epoch-start revision") };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const load = await loadReadinessForEpoch({ ...params, ordering, rev });
    const current: string = params.currentRev?.()?.trim() || rev;
    if (current === rev) return { ...base, rev, load };
    rev = current;
  }
  return { ...base, rev, load: failure("identity_mismatch", `epoch-start revision kept moving during the readiness load (now ${rev})`) };
}

/** Board options for one epoch's readiness; undefined for games without active ordering. */
export function boardReadinessOptions(readiness: EpochReadiness | undefined): BoardReadinessOptions | undefined {
  if (!readiness) return undefined;
  return {
    readinessMode: readiness.mode,
    readinessGatedPaths: readiness.gatedPaths,
    ...(readiness.rev ? { readinessRev: readiness.rev } : {}),
    ...(readiness.load.ok ? { readiness: readiness.load.index } : { readinessUnavailable: readiness.load.error }),
  };
}

/** `git rev-parse HEAD` of the checkout, or null. */
export function readinessRevision(repoRoot: string): string | null {
  const result = Bun.spawnSync(["git", "-C", repoRoot, "rev-parse", "--verify", "HEAD^{commit}"], { stdout: "pipe", stderr: "pipe" });
  return result.exitCode === 0 ? result.stdout.toString().trim() || null : null;
}

/** A not-ready target as the readiness artifact and dashboard carry it. */
export interface ReadinessTargetRow {
  key: string;
  unit: string;
  symbol: string;
  sourcePath: string;
  size: number;
  fuzzy: number;
  reason: BlockedCandidate["reason"] | "deferred";
  unmet: ReadinessClassRef[];
  unresolved: ReadinessClassRef[];
}

export const READINESS_ARTIFACT_TYPE = "readiness";

function blockedRow(row: BlockedCandidate): ReadinessTargetRow {
  return { ...row, unresolved: [] };
}

function deferredRows(board: BoardSnapshot, keys: string[] | undefined): ReadinessTargetRow[] {
  if (!keys?.length) return [];
  const wanted = new Set(keys);
  return board.candidates
    .filter((candidate) => wanted.has(`${candidate.unit}::${candidate.symbol}`))
    .map((candidate) => ({
      key: `${candidate.unit}::${candidate.symbol}`,
      unit: candidate.unit,
      symbol: candidate.symbol,
      sourcePath: candidate.sourcePath,
      size: candidate.size,
      fuzzy: candidate.fuzzy,
      reason: "deferred" as const,
      unmet: candidate.readiness?.unmet ?? [],
      unresolved: candidate.readiness?.unresolved ?? [],
    }));
}

/**
 * Revision-bound readiness artifact payload for one board (enforce:
 * blocked/deferred; shadow: wouldBlock/wouldDefer). Null when the board was
 * loaded without readiness.
 */
export function readinessArtifactPayload(board: BoardSnapshot, params: { parked?: boolean; epochId?: string | null } = {}): Record<string, unknown> | null {
  if (!board.readiness) return null;
  const body = {
    mode: board.readiness.mode,
    rev: board.readiness.rev,
    identity: board.readiness.identity,
    unavailable: board.readiness.unavailable,
    parked: Boolean(params.parked),
    epochId: params.epochId ?? null,
    blocked: (board.blocked ?? []).map(blockedRow),
    deferred: deferredRows(board, board.deferred),
    wouldBlock: (board.wouldBlock ?? []).map(blockedRow),
    wouldDefer: deferredRows(board, board.wouldDefer),
  };
  const fingerprint = createHash("sha256").update(JSON.stringify(body)).digest("hex");
  return { ...body, fingerprint, generatedAt: board.generatedAt };
}

/** Writes the run's current readiness artifact unless the latest one is identical. */
export function recordReadinessArtifact(
  store: StateStore,
  params: { runId: string; gameId?: string | null; board: BoardSnapshot; parked?: boolean; epochId?: string | null },
): boolean {
  const payload = readinessArtifactPayload(params.board, params);
  if (!payload) return false;
  const latest = latestDashboardArtifact(store, { runId: params.runId, artifactType: READINESS_ARTIFACT_TYPE, artifactKey: "current" });
  if (latest?.payload.fingerprint === payload.fingerprint) return false;
  recordDashboardArtifact(store, {
    runId: params.runId,
    gameId: params.gameId ?? null,
    artifactType: READINESS_ARTIFACT_TYPE,
    artifactKey: "current",
    sourceLabel: `readiness@${String(payload.rev ?? "unknown")}`,
    payload,
  });
  return true;
}

/** The run's latest readiness artifact payload, or null. */
export function latestReadinessArtifact(store: StateStore, runId: string): Record<string, unknown> | null {
  return latestDashboardArtifact(store, { runId, artifactType: READINESS_ARTIFACT_TYPE, artifactKey: "current" })?.payload ?? null;
}

/**
 * Blocked-only parking: no epoch is created and no settlement runs. Records
 * the parked state (readiness artifact with `parked: true`, plus one handled
 * `epoch_admission_parked` event per distinct blocked set and revision).
 */
export function recordReadinessParked(
  store: StateStore,
  params: { runId: string; gameId?: string | null; board: BoardSnapshot; producer: string },
): void {
  const changed = recordReadinessArtifact(store, { ...params, parked: true });
  if (!changed) return;
  const blocked = params.board.blocked ?? [];
  const eventId = addEvent(store, params.runId, "epoch_admission_parked", params.producer, {
    reason: "readiness_blocked_only",
    rev: params.board.readiness?.rev ?? null,
    unavailable: params.board.readiness?.unavailable ?? null,
    blocked_count: blocked.length,
    blocked: blocked.slice(0, 50).map((row) => row.key),
    parked_at: now(),
    created_by: params.producer,
  });
  // Informational: parking must not wake the scheduler tick into another admission.
  markEventHandled(store, eventId);
}

function ownerLabel(ref: ReadinessClassRef): string {
  return ref.owner_unit ? ref.owner_unit.replace(/^main\//, "") : "owner unknown";
}

/** Dashboard label: `waiting on: TKoopa (Enemy/Koopa, not decompiled)`. */
export function readinessWaitingLabel(row: Pick<ReadinessTargetRow, "reason" | "unmet" | "unresolved">): string {
  if (row.reason === "readiness_unavailable") return "waiting on: class readiness (index unavailable)";
  if (row.reason === "not_in_index") return "waiting on: class readiness (not in the readiness index)";
  const parts = [
    ...row.unmet.map((ref) => `${ref.class} (${ownerLabel(ref)}, not decompiled)`),
    ...row.unresolved.map((ref) => `${ref.class} (${ownerLabel(ref)}, unresolved)`),
  ];
  return parts.length ? `waiting on: ${parts.join(", ")}` : "waiting on: class readiness";
}

/** Board fields for the settlement's current-board artifact so its counts agree with admission. */
export function readinessBoardFields(store: StateStore, runId: string): Record<string, unknown> {
  const artifact = latestReadinessArtifact(store, runId);
  if (!artifact) return {};
  return {
    readiness: { mode: artifact.mode, rev: artifact.rev, identity: artifact.identity, unavailable: artifact.unavailable, parked: artifact.parked },
    ...(artifact.mode === "enforce"
      ? { blocked: artifact.blocked ?? [], deferred: artifact.deferred ?? [] }
      : { wouldBlock: artifact.wouldBlock ?? [], wouldDefer: artifact.wouldDefer ?? [] }),
  };
}
