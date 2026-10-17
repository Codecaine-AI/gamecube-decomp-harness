/**
 * Canned edits for the load test, all from real SMS history. The run's claim
 * base is a synthetic commit in a scratch clone (never the live checkout):
 *
 * - clean_fix: a real accepted worker integration (`worker-integration(...)`
 *   commits). The synthetic base reverts it; the canned edit re-applies it.
 * - steering: an edit group the steering gate located and the backfill reverted
 *   (fa5d5210, d9a205de). The canned edit re-introduces it (single-use temps,
 *   accessor swaps): what a steering worker submits.
 * - unverified_repair: the synthetic base re-introduces such a group, the state
 *   DB records the function as "100% but unverified" against the real trusted
 *   base (upstream 81248bda), and the canned edit removes the group again (the
 *   repair lane: lower score, fresh certification).
 * - evidence_review: a re-introduced group whose shape is an accessor/field
 *   swap, the construct kind that ends in `evidence_review` when cited.
 *
 * Each target gets its own source file: the scheduler never runs two claims on
 * one source path, so 200 concurrent workers need 200 distinct files.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export type TargetKind = "clean_fix" | "steering" | "unverified_repair" | "evidence_review";
export const TARGET_KINDS: TargetKind[] = ["clean_fix", "steering", "unverified_repair", "evidence_review"];

export interface ScaleTarget {
  kind: TargetKind;
  /** Report unit (e.g. `mario/Enemy/chuuhana`). */
  unit: string;
  symbol: string;
  sourcePath: string;
  /** Full file text the canned edit writes. */
  editedContent: string;
  /** Fake-model scores (the live run measures its own). */
  baseScore: number;
  afterScore: number;
  /** What the fake gate answers; the live gate decides for itself. */
  expectedVerdict: "pass" | "steering_located" | "evidence_review";
  size: number;
  /** unverified_repair: the trusted base the state DB records. */
  trustedBaseRev?: string;
  /** Where the edit comes from (commit and file), for the report. */
  provenance: string;
}

/** Steering revert commits on the SMS integration branch (sms-real-codegen backfill). */
export const STEERING_REVERT_RANGE = { from: "fa5d5210^", to: "d9a205de" };
/** Trusted base the backfill measured "100% but unverified" against. */
export const SMS_TRUSTED_BASE = "81248bdac58da1ff74128ba8c3a3798372fa5371";

export function git(cwd: string, args: string[], input?: string): string {
  const result = Bun.spawnSync(["git", ...args], { cwd, stdin: input === undefined ? "ignore" : Buffer.from(input), stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(`git ${args.join(" ")} failed (${result.exitCode}): ${result.stderr.toString().slice(-500)}`);
  return result.stdout.toString();
}

function gitOk(cwd: string, args: string[], input?: string): boolean {
  return Bun.spawnSync(["git", ...args], { cwd, stdin: input === undefined ? "ignore" : Buffer.from(input), stdout: "ignore", stderr: "ignore" }).exitCode === 0;
}

/** A clone sharing the live checkout's objects (`--shared`): the live checkout is only read. */
export function prepareScratchRepo(params: { source: string; dir: string; rev?: string }): string {
  if (!existsSync(resolve(params.dir, ".git"))) {
    mkdirSync(resolve(params.dir, ".."), { recursive: true });
    git(resolve(params.dir, ".."), ["clone", "--quiet", "--shared", "--no-checkout", params.source, params.dir]);
  }
  const rev = params.rev ?? git(params.source, ["rev-parse", "HEAD"]).trim();
  // The live checkout may have moved since the clone: fetch its HEAD (read-only on the source).
  git(params.dir, ["fetch", "--quiet", params.source, "HEAD"]);
  git(params.dir, ["checkout", "--quiet", "--force", "--detach", rev]);
  git(params.dir, ["config", "user.email", "scale-load-test@localhost"]);
  git(params.dir, ["config", "user.name", "scale load test"]);
  return rev;
}

interface ReportFunction { unit: string; name: string; fuzzy: number; size: number; demangled: string | null }

function readReport(reportPath: string): ReportFunction[] {
  const report = JSON.parse(readFileSync(reportPath, "utf8")) as { units: Array<{ name: string; functions?: Array<Record<string, any>> }> };
  const out: ReportFunction[] = [];
  for (const unit of report.units) {
    for (const fn of unit.functions ?? []) {
      out.push({ unit: unit.name, name: String(fn.name), fuzzy: Number(fn.fuzzy_match_percent ?? 0), size: Number(fn.size ?? 0), demangled: fn.metadata?.demangled_name ?? null });
    }
  }
  return out;
}

/** `mario/Enemy/chuuhana` <-> `src/Enemy/chuuhana.cpp` by basename and directory. */
function unitForPath(units: Set<string>, path: string): string | null {
  const stem = path.replace(/\.(c|cpp|cp|cxx)$/, "");
  const candidates = [...units].filter((unit) => stem.endsWith(unit.split("/").slice(1).join("/")) || stem.endsWith(`/${unit.split("/").at(-1)}`));
  candidates.sort((a, b) => b.length - a.length);
  return candidates[0] ?? null;
}

function fileDiff(repo: string, from: string, to: string, path: string): string {
  return git(repo, ["diff", "--no-color", from, to, "--", path]);
}

/** A revert that turned a field read back into its accessor (`mPosition` -> `getPosition()`): an accessor swap. */
export function isAccessorSwap(revertDiff: string): boolean {
  const accessors = new Set<string>();
  const fields = new Set<string>();
  for (const line of revertDiff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) for (const m of line.matchAll(/\bget([A-Z]\w*)\(\)/g)) accessors.add(m[1]!);
    if (line.startsWith("-") && !line.startsWith("---")) for (const m of line.matchAll(/\bm([A-Z]\w*)\b/g)) fields.add(m[1]!);
  }
  return [...accessors].some((name) => fields.has(name));
}

export interface FixtureSet {
  baseRev: string;
  headRev: string;
  targets: ScaleTarget[];
  /** Kinds that could not reach their share (not enough applicable history). */
  shortfalls: Record<string, number>;
}

/**
 * Builds the synthetic claim base in `scratch` and returns `count` targets,
 * a quarter per kind (when history allows), every one on its own file.
 */
export function buildFixtureSet(params: {
  scratch: string;
  reportPath: string;
  backfillReportPath: string;
  count: number;
  cacheFile?: string;
}): FixtureSet {
  const repo = params.scratch;
  const headRev = git(repo, ["rev-parse", "HEAD"]).trim();
  const report = readReport(params.reportPath);
  const units = new Set(report.map((fn) => fn.unit));
  const byKey = new Map(report.map((fn) => [`${fn.unit}::${fn.name}`, fn]));
  const used = new Set<string>();
  const perKind = Math.ceil(params.count / 4) + 2;
  const targets: ScaleTarget[] = [];
  /** Diffs the synthetic base applies in reverse to HEAD. */
  const baseEdits: Array<{ path: string; reverseDiff: string }> = [];
  /** Diffs the canned edit applies in reverse to HEAD (keyed by target). */
  const editReverse = new Map<ScaleTarget, string>();
  const counts: Record<TargetKind, number> = { clean_fix: 0, steering: 0, unverified_repair: 0, evidence_review: 0 };
  const add = (target: ScaleTarget, reverseForEdit?: string) => {
    targets.push(target);
    counts[target.kind] += 1;
    used.add(target.sourcePath);
    if (reverseForEdit) editReverse.set(target, reverseForEdit);
  };

  // steering / evidence_review: reverted steering groups (the canned edit re-introduces them).
  const backfill = JSON.parse(readFileSync(params.backfillReportPath, "utf8")) as { rows: Array<{ unit: string; name: string; decision: string; files?: string[] }> };
  const steeringFiles = git(repo, ["diff", "--name-only", STEERING_REVERT_RANGE.from, STEERING_REVERT_RANGE.to]).trim().split("\n").filter(Boolean);
  const rowsByFile = new Map<string, Array<{ unit: string; name: string }>>();
  for (const row of backfill.rows) {
    if (row.decision !== "steering_located" || !row.files?.[0]) continue;
    const list = rowsByFile.get(row.files[0]) ?? [];
    list.push({ unit: row.unit, name: row.name });
    rowsByFile.set(row.files[0], list);
  }
  for (const path of steeringFiles) {
    if (used.has(path)) continue;
    const unit = unitForPath(units, path);
    if (!unit) continue;
    const fn = (rowsByFile.get(path) ?? []).map((row) => byKey.get(`${unit}::${row.name}`)).find((value): value is ReportFunction => Boolean(value));
    if (!fn) continue;
    // The revert diff (steering -> real). Reverse = re-introduce the steering group.
    const revert = fileDiff(repo, STEERING_REVERT_RANGE.from, STEERING_REVERT_RANGE.to, path);
    if (!revert.trim() || !gitOk(repo, ["apply", "--reverse", "--check", "-"], revert)) continue;
    const kind: TargetKind | undefined = isAccessorSwap(revert) && counts.evidence_review < perKind ? "evidence_review" : counts.steering < perKind ? "steering" : undefined;
    if (!kind) continue;
    add({ kind, unit, symbol: fn.name, sourcePath: path, editedContent: "", baseScore: fn.fuzzy, afterScore: 100, expectedVerdict: kind === "steering" ? "steering_located" : "evidence_review", size: fn.size, provenance: `re-introduce ${STEERING_REVERT_RANGE.from}..${STEERING_REVERT_RANGE.to} (${path})` }, revert);
  }

  // clean_fix / unverified_repair / evidence_review: accepted worker integrations that still reverse-apply at HEAD.
  const integrations = git(repo, ["log", "--format=%h%x09%s", "--grep=worker-integration", headRev]).trim().split("\n");
  for (const line of integrations) {
    // Accessor swaps are rare in history: once the two lanes are full and the count is met, stop looking for more.
    if (targets.length >= params.count + 8 && counts.clean_fix >= perKind && counts.unverified_repair >= perKind) break;
    const [commit, subject = ""] = line.split("\t");
    const match = /worker-integration\([^)]*\): (\S+)::(\S+) \[/.exec(subject);
    if (!commit || !match) continue;
    const [, unit, symbol] = match;
    const fn = byKey.get(`${unit}::${symbol}`);
    if (!fn) continue;
    const files = git(repo, ["diff", "--name-only", `${commit}^`, commit]).trim().split("\n").filter(Boolean);
    // The unit's own file (multi-file integrations keep only that file's hunks).
    const path = files.length === 1 ? files[0]! : files.find((file) => unitForPath(units, file) === unit);
    if (!path || used.has(path)) continue;
    const diff = fileDiff(repo, `${commit}^`, commit, path);
    if (!gitOk(repo, ["apply", "--reverse", "--check", "-"], diff)) continue;
    const accessor = isAccessorSwap(diff.split("\n").map((l) => l.startsWith("+") ? `-${l.slice(1)}` : l.startsWith("-") ? `+${l.slice(1)}` : l).join("\n"));
    const kind: TargetKind | undefined = accessor && counts.evidence_review < perKind ? "evidence_review"
      : counts.clean_fix <= counts.unverified_repair && counts.clean_fix < perKind ? "clean_fix"
      : counts.unverified_repair < perKind ? "unverified_repair"
      : counts.clean_fix < perKind ? "clean_fix"
      // Too few accessor swaps for a full evidence_review share: overflow into the two lanes.
      : targets.length < params.count + 8 ? (counts.clean_fix <= counts.unverified_repair ? "clean_fix" : "unverified_repair") : undefined;
    if (!kind) continue;
    if (kind === "unverified_repair") {
      // HEAD holds the integration (the "unexplained" code); the repair removes it.
      add({ kind, unit: unit!, symbol: symbol!, sourcePath: path, editedContent: "", baseScore: 100, afterScore: Math.max(0, Number((fn.fuzzy - 3).toFixed(3))), expectedVerdict: "pass", size: fn.size, trustedBaseRev: SMS_TRUSTED_BASE, provenance: `remove ${commit} (${path}); trusted base ${SMS_TRUSTED_BASE.slice(0, 8)}` }, diff);
    } else {
      // The synthetic base undoes the integration; the canned edit re-applies it.
      baseEdits.push({ path, reverseDiff: diff });
      add({ kind, unit: unit!, symbol: symbol!, sourcePath: path, editedContent: "", baseScore: Math.max(0, Number((Math.min(fn.fuzzy, 100) - 3).toFixed(3))), afterScore: 100, expectedVerdict: kind === "clean_fix" ? "pass" : "evidence_review", size: fn.size, provenance: `re-apply ${commit} (${path})` });
    }
  }

  // Not enough distinct files: the remaining steering groups fill in as steering targets.
  for (const path of steeringFiles) {
    if (targets.length >= params.count + 8) break;
    if (used.has(path)) continue;
    const unit = unitForPath(units, path);
    const fn = unit ? (rowsByFile.get(path) ?? []).map((row) => byKey.get(`${unit}::${row.name}`)).find((value): value is ReportFunction => Boolean(value)) : undefined;
    if (!unit || !fn) continue;
    const revert = fileDiff(repo, STEERING_REVERT_RANGE.from, STEERING_REVERT_RANGE.to, path);
    if (!revert.trim() || !gitOk(repo, ["apply", "--reverse", "--check", "-"], revert)) continue;
    add({ kind: "steering", unit, symbol: fn.name, sourcePath: path, editedContent: "", baseScore: fn.fuzzy, afterScore: 100, expectedVerdict: "steering_located", size: fn.size, provenance: `re-introduce ${STEERING_REVERT_RANGE.from}..${STEERING_REVERT_RANGE.to} (${path})` }, revert);
  }

  // Synthetic base: HEAD with the re-applied integrations undone.
  for (const edit of baseEdits) git(repo, ["apply", "--reverse", "-"], edit.reverseDiff);
  git(repo, ["add", "--all", "--", ...baseEdits.map((edit) => edit.path)]);
  git(repo, ["commit", "--quiet", "--allow-empty", "-m", "scale load test: synthetic claim base"]);
  const baseRev = git(repo, ["rev-parse", "HEAD"]).trim();

  // Edited contents: re-applied integrations = the HEAD file; the others = HEAD with a diff reversed.
  mkdirSync(resolve(repo, ".git", "scale-apply"), { recursive: true });
  for (const target of targets) {
    const headText = git(repo, ["show", `${headRev}:${target.sourcePath}`]);
    const reverse = editReverse.get(target);
    target.editedContent = reverse ? applyReverseToText(repo, target.sourcePath, headText, reverse) : headText;
  }

  const shortfalls: Record<string, number> = {};
  for (const kind of TARGET_KINDS) {
    const have = targets.filter((t) => t.kind === kind).length;
    if (have < Math.ceil(params.count / 4)) shortfalls[kind] = Math.ceil(params.count / 4) - have;
  }
  const set: FixtureSet = { baseRev, headRev, targets, shortfalls };
  if (params.cacheFile) writeFileSync(params.cacheFile, `${JSON.stringify({ ...set, count: params.count }, null, 2)}\n`);
  return { ...set, targets: pickBalanced(targets, params.count) };
}

/** Reverse-applies `diff` to `text` (a file's HEAD content) via a throwaway index; returns the result. */
function applyReverseToText(repo: string, path: string, text: string, diff: string): string {
  const indexFile = resolve(repo, ".git", "scale-apply", "index");
  const env = { ...process.env, GIT_INDEX_FILE: indexFile };
  const run = (args: string[], input?: string) => {
    const result = Bun.spawnSync(["git", ...args], { cwd: repo, env, stdin: input === undefined ? "ignore" : Buffer.from(input), stdout: "pipe", stderr: "pipe" });
    if (result.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr.toString().slice(-300)}`);
    return result.stdout.toString();
  };
  const blob = run(["hash-object", "-w", "--stdin"], text).trim();
  run(["read-tree", "--empty"]);
  run(["update-index", "--add", "--cacheinfo", `100644,${blob},${path}`]);
  run(["apply", "--reverse", "--cached", "-"], diff);
  return run(["show", `:${path}`]);
}

/**
 * The fixture set for `count` targets: the cached one when it is large enough
 * and its base commit still exists in the scratch clone, otherwise a fresh
 * scratch clone (reset to the live checkout's HEAD) and a fresh build.
 */
export function loadOrBuildFixtures(params: {
  smsCheckout: string;
  scratch: string;
  cacheFile: string;
  count: number;
  backfillReportPath: string;
}): FixtureSet {
  if (existsSync(params.cacheFile) && existsSync(resolve(params.scratch, ".git"))) {
    const cached = JSON.parse(readFileSync(params.cacheFile, "utf8")) as FixtureSet & { count: number };
    if (cached.count >= params.count && gitOk(params.scratch, ["cat-file", "-e", `${cached.baseRev}^{commit}`])) {
      git(params.scratch, ["checkout", "--quiet", "--force", "--detach", cached.baseRev]);
      return { ...cached, targets: pickBalanced(cached.targets, params.count) };
    }
  }
  prepareScratchRepo({ source: params.smsCheckout, dir: params.scratch });
  return buildFixtureSet({ scratch: params.scratch, reportPath: resolve(params.smsCheckout, "build/GMSJ01/report.json"), backfillReportPath: params.backfillReportPath, count: params.count, cacheFile: params.cacheFile });
}

/** Round-robin over kinds so any prefix of the list stays balanced. */
export function pickBalanced(targets: ScaleTarget[], count: number): ScaleTarget[] {
  const queues = TARGET_KINDS.map((kind) => targets.filter((t) => t.kind === kind));
  const out: ScaleTarget[] = [];
  while (out.length < count && queues.some((q) => q.length)) {
    for (const queue of queues) {
      const next = queue.shift();
      if (next && out.length < count) out.push(next);
    }
  }
  return out;
}
