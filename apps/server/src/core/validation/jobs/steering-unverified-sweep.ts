import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { booleanArg, stringArg, type GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { packageRoot } from "@server/core/knowledge";
import { openState } from "@server/core/harness-runtime/run-state";
import type { StateStore } from "@server/core/orchestrator-state";
import { liveSweepExplainJob, queueSteeringExplainJob } from "@server/core/harness-runtime/run-state/steering-explain.js";
import { recordSteeringObservation } from "@server/core/harness-runtime/run-state/steering.js";
import { listUnverifiedMatches, type UnverifiedMatchRecord } from "@server/core/harness-runtime/run-state/unverified-matches.js";
import { sameUnit } from "@server/core/harness-runtime/run-state/unit-key.js";
import { steeringGateActive } from "@server/core/tools/steering-gate.js";
import type { SteeringProbe } from "@server/core/validation/steering/steering-check.js";
import { steeringExplainToolHash } from "@server/core/harness-runtime/run-state/steering-explain-tool-hash.js";

/**
 * `steering-unverified-sweep` (worker-compiler-loop plan 3.4.3): the
 * inventory of active `unverified_match` rows, and optionally the explain
 * jobs for them. Host only, pure JSON: it reads each row's backfill check
 * report (`report.check`: `{edits, reduce, mwcc, decision}`), never builds.
 *
 * Each row is classed by its decide row's fidelity record:
 * - `unavailable` (with a reason): no readable report, no decide or mwcc row
 *   for the function, no fidelity record, an incomplete one (its problems),
 *   or a compiler version without a validated traced build
 *   (`CAPABILITIES.json`: `coloring` missing from the version's points);
 * - `identical`: the verdict's S* object is the candidate object (no delta
 *   exists);
 * - `distinct`: otherwise.
 *
 * `ablations` lists the S* variants the gate built for the function besides
 * the one its verdict used. `--queue` records one shadow observation per
 * `distinct` row and queues its `gate` explain job (source `sweep`);
 * `--ablations` also queues each ablation (label `ablation`, input hash
 * `sha256("<input_hash>:<variant>")`). A sweep job already queued, running or
 * done for the same target, inputs and tool is not queued again. An
 * `unavailable` row is never queued and never shown as an empty delta.
 */
export const STEERING_UNVERIFIED_INVENTORY_SCHEMA = "steering-unverified-inventory-v1";

export type SteeringUnverifiedClass = "distinct" | "identical" | "unavailable";

export interface SteeringUnverifiedInventoryRow {
  unit: string;
  symbol: string;
  class: SteeringUnverifiedClass;
  reason?: string;
  /** The S* variant the gate's verdict used. */
  variant: string | null;
  ablations: Array<{ variant: string; label: "ablation" }>;
  /** `--queue` only: whether the gate job was queued this run, and how many ablations. */
  queued?: { gate: boolean; ablations: number };
}

export interface SteeringUnverifiedInventory {
  schema: typeof STEERING_UNVERIFIED_INVENTORY_SCHEMA;
  gameId: string;
  total: number;
  counts: Record<SteeringUnverifiedClass, number>;
  rows: SteeringUnverifiedInventoryRow[];
}

type JsonObject = Record<string, unknown>;

const SSTAR_VARIANTS = ["global", "evidence_sstar", "steering_sstar"] as const;

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** The report row of one function: the row's (canonical) unit matches a report unit spelled either way. */
function functionRow(section: unknown, gameId: string, unit: string, symbol: string): JsonObject | null {
  const found = asArray(isObject(section) ? section.functions : undefined)
    .find((row) => isObject(row) && typeof row.unit === "string" && sameUnit(gameId, row.unit, unit) && row.name === symbol);
  return isObject(found) ? found : null;
}

/** Null when the version has a validated traced build for `coloring`; else why not. */
function tracedBuildProblem(capabilities: JsonObject | null, mwVersion: unknown): string | null {
  if (typeof mwVersion !== "string" || !mwVersion) return "no compiler version in the fidelity record";
  const version = mwVersion.replace(/^GC\//, "");
  const entry = isObject(capabilities?.versions) ? capabilities.versions[version] : undefined;
  if (isObject(entry) && asArray(entry.points).includes("coloring")) return null;
  const unavailable = isObject(entry) && isObject(entry.unavailable) ? entry.unavailable.coloring : undefined;
  return typeof unavailable === "string" && unavailable ? unavailable : `no validated traced build for ${version}`;
}

interface Classified {
  row: SteeringUnverifiedInventoryRow;
  /** Set for `distinct` rows: what queueing needs. */
  queue?: { checkPath: string; decisionRow: JsonObject; fidelity: JsonObject; inputHash: string };
}

function classify(match: UnverifiedMatchRecord, readReport: (path: string) => JsonObject | null, capabilities: JsonObject | null): Classified {
  const base = { unit: match.unit, symbol: match.symbol };
  const unavailable = (reason: string, variant: string | null = null, ablations: SteeringUnverifiedInventoryRow["ablations"] = []): Classified =>
    ({ row: { ...base, class: "unavailable", reason, variant, ablations } });
  const checkPath = match.report.check;
  if (typeof checkPath !== "string" || !checkPath) return unavailable("no check report recorded");
  const report = readReport(checkPath);
  if (!report) return unavailable(`check report missing or unreadable: ${checkPath}`);
  const decisionRow = functionRow(report.decision, match.gameId, match.unit, match.symbol);
  if (!decisionRow) return unavailable("function row missing from the check report's decision");
  const mwccRow = functionRow(report.mwcc, match.gameId, match.unit, match.symbol);
  const fidelity = isObject(decisionRow.fidelity) ? decisionRow.fidelity : null;
  const variant = typeof decisionRow.sstar_variant === "string" ? decisionRow.sstar_variant
    : typeof fidelity?.variant === "string" ? fidelity.variant : "global";
  if (!mwccRow) return unavailable("function row missing from the check report's mwcc step", variant);
  const ablations = SSTAR_VARIANTS
    .filter((other) => other !== variant && (other === "global" || isObject(mwccRow[other])))
    .map((other) => ({ variant: other, label: "ablation" as const }));
  if (!fidelity) return unavailable("no fidelity record", variant, ablations);
  if (fidelity.complete !== true) {
    const problems = asArray(fidelity.problems).filter((problem): problem is string => typeof problem === "string");
    return unavailable(problems.length > 0 ? problems.join("; ") : "fidelity record incomplete", variant, ablations);
  }
  const traced = tracedBuildProblem(capabilities, isObject(fidelity.compiler) ? fidelity.compiler.mw_version : undefined);
  if (traced) return unavailable(traced, variant, ablations);
  if (typeof fidelity.input_hash !== "string" || !fidelity.input_hash) return unavailable("fidelity record has no input_hash", variant, ablations);
  const candidate = isObject(fidelity.candidate) ? fidelity.candidate : {};
  const sstar = isObject(fidelity.sstar) ? fidelity.sstar : {};
  const identical = sstar.same_as_candidate === true
    || (typeof candidate.obj_sha256 === "string" && candidate.obj_sha256 !== "" && candidate.obj_sha256 === sstar.obj_sha256);
  if (identical) return { row: { ...base, class: "identical", variant, ablations } };
  return {
    row: { ...base, class: "distinct", variant, ablations },
    queue: { checkPath, decisionRow, fidelity, inputHash: fidelity.input_hash },
  };
}

/** Records the observation and queues the gate job (and ablations) for one `distinct` row. */
function queueDistinct(
  store: StateStore,
  params: { gameId: string; match: UnverifiedMatchRecord; classified: Required<Classified>; toolHash: string; ablations: boolean },
): { gate: boolean; ablations: number } {
  const { match, classified, toolHash } = params;
  const { checkPath, decisionRow, fidelity, inputHash } = classified.queue;
  const target = { gameId: params.gameId, unit: match.unit, symbol: match.symbol, toolHash };
  const gateJob = liveSweepExplainJob(store, { ...target, inputHash });
  const pending = params.ablations
    ? classified.row.ablations
      .map(({ variant }) => ({ variant, inputHash: createHash("sha256").update(`${inputHash}:${variant}`).digest("hex") }))
      .filter((ablation) => !liveSweepExplainJob(store, { ...target, inputHash: ablation.inputHash, label: "ablation" }))
    : [];
  if (gateJob && pending.length === 0) return { gate: false, ablations: 0 };
  const probe = isObject(match.report.probe) && typeof match.report.probe.function === "string" && typeof match.report.probe.unit === "string"
    ? match.report.probe as SteeringProbe : null;
  // Ablations queued on a later run attach to the gate job's observation.
  const observationId = gateJob?.observationId ?? recordSteeringObservation(store, {
    gameId: params.gameId,
    unit: match.unit,
    symbol: match.symbol,
    attemptRef: `unverified-sweep:${match.analyzedRev}`,
    baseRev: typeof match.report.base_rev === "string" ? match.report.base_rev : match.baseRev,
    functionSourceSha: match.functionSourceSha,
    verdict: "unresolved",
    analysis: typeof decisionRow.analysis === "string" ? decisionRow.analysis : null,
    scores: { match: isObject(decisionRow.match) ? decisionRow.match : match.match, source: "unverified-sweep" },
    probe,
    mode: "shadow",
  });
  if (observationId == null) return { gate: false, ablations: 0 };
  const common = {
    observationId, gameId: params.gameId, unit: match.unit, symbol: match.symbol, toolHash,
    source: "sweep" as const, fidelity, inputs: { check: checkPath, baseRev: match.report.base_rev ?? match.baseRev },
  };
  const gate = gateJob ? false : queueSteeringExplainJob(store, { ...common, inputHash, label: "gate", variant: classified.row.variant }).queued;
  let ablations = 0;
  for (const ablation of pending) {
    if (queueSteeringExplainJob(store, { ...common, inputHash: ablation.inputHash, label: "ablation", variant: ablation.variant }).queued) ablations += 1;
  }
  return { gate, ablations };
}

export function defaultCapabilitiesPath(): string {
  return resolve(packageRoot(), "toolpacks/gamecube-decomp/compiler/mwcc_alloc/native/CAPABILITIES.json");
}

function readJsonObject(path: string): JsonObject | null {
  try {
    const parsed = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) as unknown : null;
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function runSteeringUnverifiedSweep(params: {
  store: StateStore;
  gameId: string;
  queue?: boolean;
  ablations?: boolean;
  capabilitiesPath?: string;
  /** Toolpack root the explain jobs' tool hash is computed over. */
  toolpackRoot?: string;
}): SteeringUnverifiedInventory {
  const capabilities = readJsonObject(params.capabilitiesPath ?? defaultCapabilitiesPath());
  // Many functions share one check report: read each once.
  const reports = new Map<string, JsonObject | null>();
  const readReport = (path: string) => {
    if (!reports.has(path)) reports.set(path, readJsonObject(path));
    return reports.get(path) ?? null;
  };
  const toolHash = params.queue ? (params.toolpackRoot ? steeringExplainToolHash(params.toolpackRoot) : steeringExplainToolHash()) : "";
  const counts: Record<SteeringUnverifiedClass, number> = { distinct: 0, identical: 0, unavailable: 0 };
  const rows: SteeringUnverifiedInventoryRow[] = [];
  for (const match of listUnverifiedMatches(params.store, params.gameId)) {
    const classified = classify(match, readReport, capabilities);
    counts[classified.row.class] += 1;
    if (params.queue && classified.queue) {
      classified.row.queued = queueDistinct(params.store, {
        gameId: params.gameId, match, classified: classified as Required<Classified>, toolHash, ablations: params.ablations === true,
      });
    }
    rows.push(classified.row);
  }
  return { schema: STEERING_UNVERIFIED_INVENTORY_SCHEMA, gameId: params.gameId, total: rows.length, counts, rows };
}

/** CLI: `steering-unverified-sweep [--queue] [--ablations] [--out PATH] [--capabilities PATH] [--force]`. */
export async function steeringUnverifiedSweepJob(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  const game = globals.game;
  const gameId = game?.gameId ?? globals.gameId ?? "";
  if (!gameId) throw new Error("steering-unverified-sweep needs a game (--game)");
  const mode = game?.matching?.steeringGate ?? "off";
  if (!steeringGateActive(mode) && !booleanArg(args, "--force")) {
    throw new Error(`steering-unverified-sweep only applies to games with matching.steeringGate shadow or enforce; ${gameId} is ${mode} (pass --force to run anyway)`);
  }
  const out = resolve(stringArg(args, "--out", resolve(globals.stateDir, "steering-explain", `unverified-inventory-${gameId}-${new Date().toISOString().replaceAll(":", "-")}.json`)));
  const capabilitiesPath = stringArg(args, "--capabilities", "").trim();
  const store = openState(globals.stateDir);
  try {
    const inventory = runSteeringUnverifiedSweep({
      store,
      gameId,
      queue: booleanArg(args, "--queue"),
      ablations: booleanArg(args, "--ablations"),
      ...(capabilitiesPath ? { capabilitiesPath: resolve(capabilitiesPath) } : {}),
    });
    mkdirSync(dirname(out), { recursive: true });
    const text = JSON.stringify(inventory, null, 2);
    writeFileSync(out, `${text}\n`);
    console.log(text);
  } finally {
    store.db.close();
  }
}
