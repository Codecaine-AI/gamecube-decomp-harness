import { existsSync, readFileSync, statSync } from "node:fs";
import { getHarnessState } from "@server/core/harness-state/state.js";
import { completionIndexUnknown, isUnverifiedTarget, type UnverifiedIndex } from "@server/core/harness-runtime/phases/running/board/candidates.js";
import {
  completionIndexAt,
  isRevisionCompletionIndex,
  withholdUnverifiedStoredMeasures,
  type CompletionIndexSource,
} from "@server/core/harness-runtime/phases/running/board/unverified-measures.js";
import {
  targetKeyVariants,
  unitKeyedHas,
  unitKeyNormalizer,
  withUnitKeys,
  type UnitKeyGame,
} from "@server/core/harness-runtime/run-state/unit-key.js";
import type { StateStore } from "@server/core/orchestrator-state";
import { buildRegressionReport, type ReportEntry } from "@server/core/validation/objdiff/report.js";
import { judgeMasterBreakages } from "@server/core/harness-runtime/phases/running/epochs/certified-regression.js";
import { gitRevAncestry } from "@server/core/validation/steering/unverified-certification.js";

export type ScoreTierState = "in_branch" | "in_upstream";
export type ScoreTimelineKind = "baseline" | "epoch_finish" | "pr_sync" | "legacy";

export interface ScoreTierMatch {
  targetKey: string;
  unit: string;
  symbol: string;
  score: number;
  oldScore: number;
  newScore: number;
  delta: number;
  bytesDelta?: number;
  kind?: "function" | "section";
  state: ScoreTierState;
}

export interface ScoreTierImprovement {
  targetKey: string;
  unit: string;
  symbol: string;
  delta: number;
  oldScore: number;
  newScore: number;
  bytesDelta?: number;
  kind?: "function" | "section";
  state: ScoreTierState;
  /** A 100% function still `unverified_match`: not a match, listed with the improvements. */
  verification?: "unverified_match";
}

export interface ScoreTierPoint {
  savePointId: string;
  commitSha: string | null;
  score: number | null;
  measures: Record<string, unknown>;
  kind: ScoreTimelineKind;
  label: string | null;
  createdAt: string;
}

export interface DashboardScoreTiers {
  baseline: {
    score: number | null;
    measures: Record<string, unknown>;
    anchorRevision: string | null;
    savePointId: string | null;
  };
  confirmed: {
    score: number | null;
    measures: Record<string, unknown>;
    delta: number | null;
    savePointId: string | null;
    anchorRevision: string | null;
    comparisonStatus: "vs_upstream" | "baseline_unavailable";
    matches: ScoreTierMatch[];
    improvements: ScoreTierImprovement[];
    breakages: ScoreTierImprovement[];
  };
  tentative: {
    matches: ScoreTierMatch[];
    improvements: ScoreTierImprovement[];
  };
  timeline: ScoreTierPoint[];
}

interface SavePointRow {
  id: string;
  trigger_kind: string;
  label: string | null;
  commit_sha: string | null;
  matched_code_percent: number | null;
  report_path: string | null;
  payload_json: string;
  created_at: string;
}

function parseObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export interface SavePointProgressRow {
  matched_code_percent: number | null;
  /** The saved revision: a revision-aware index withholds the figures under its own holds. */
  commit_sha?: string | null;
  report_path?: string | null;
  payload_json: string;
}

/** Re-derived stored progress per `report_path` + mtime + active rows: archived reports are immutable but large. */
const progressCache = new Map<string, Record<string, unknown>>();
const PROGRESS_CACHE_LIMIT = 512;

const signatures = new WeakMap<UnverifiedIndex, string>();

function unverifiedSignature(unverified: UnverifiedIndex): string {
  let signature = signatures.get(unverified);
  if (signature === undefined) {
    signature = completionIndexUnknown(unverified) ? "\0unknown" : [...unverified.keys()].sort().join("\n");
    signatures.set(unverified, signature);
  }
  // A game-keyed index (`withUnitKeys`) also withholds the report spelling of its keys.
  return unitKeyNormalizer(unverified) ? `${signature}\0keyed` : signature;
}

function storedMeasures(row: SavePointProgressRow): Record<string, unknown> {
  return parseObject(parseObject(row.payload_json).measures);
}

/**
 * A save point's progress measures and score. Without an index (Melee, gate
 * off) they are as stored. With one, they are re-derived from the save
 * point's raw archived report under the active `unverified_match` rows (each
 * row withheld exactly once, whatever the stored figures withheld), and a
 * missing report leaves the score unknown rather than raw. A revision-aware
 * index withholds under the save point's own `commit_sha` (its rollback
 * holds there), and an unknown one leaves the score unknown.
 */
export function savePointProgress(
  row: SavePointProgressRow,
  source?: CompletionIndexSource,
): { score: number | null; measures: Record<string, unknown> } {
  const stored = storedMeasures(row);
  const unverified = completionIndexAt(source, row.commit_sha);
  if (!unverified) return { score: finiteNumber(row.matched_code_percent) ?? finiteNumber(stored.matched_code_percent), measures: stored };
  const reportPath = row.report_path ?? null;
  let key: string | null = null;
  try {
    if (reportPath && existsSync(reportPath)) {
      const stat = statSync(reportPath);
      key = `${reportPath}\0${stat.mtimeMs}\0${stat.size}\0${JSON.stringify(stored)}\0${unverifiedSignature(unverified)}`;
    }
  } catch {
    key = null;
  }
  let measures = key ? progressCache.get(key) : undefined;
  if (!measures) {
    measures = withholdUnverifiedStoredMeasures(stored, reportPath, unverified);
    if (key) {
      if (progressCache.size >= PROGRESS_CACHE_LIMIT) progressCache.delete(progressCache.keys().next().value as string);
      progressCache.set(key, measures);
    }
  }
  // Missing evidence or a report without a denominator leaves the score unknown, never the raw column.
  if (measures.unverified_unbounded === true) return { score: null, measures };
  return { score: finiteNumber(measures.matched_code_percent), measures };
}

function reportItem(entry: ReportEntry): ScoreTierImprovement {
  return {
    targetKey: `${entry.unitName}::${entry.itemName}`,
    unit: entry.unitName,
    symbol: entry.itemName,
    oldScore: entry.fromPercent,
    newScore: entry.toPercent,
    delta: entry.toPercent - entry.fromPercent,
    bytesDelta: entry.bytesDelta,
    kind: entry.itemName.startsWith(".") ? "section" : "function",
    state: "in_branch",
  };
}

function comparisonReport(fromPath: string, toPath: string): Record<string, unknown> | null {
  if (!existsSync(fromPath) || !existsSync(toPath)) return null;
  try {
    const from = parseObject(readFileSync(fromPath, "utf8"));
    const to = parseObject(readFileSync(toPath, "utf8"));
    const units = new Map<string, { from?: Record<string, unknown>; to?: Record<string, unknown> }>();
    for (const [side, report] of [["from", from], ["to", to]] as const) {
      for (const rawUnit of Array.isArray(report.units) ? report.units : []) {
        const unit = parseObject(rawUnit);
        const name = typeof unit.name === "string" ? unit.name : "";
        if (!name) continue;
        const pair = units.get(name) ?? {};
        pair[side] = unit;
        units.set(name, pair);
      }
    }
    const pairedUnits = [...units.entries()].map(([name, pair]) => {
      const result: Record<string, unknown> = { name, metadata: pair.to?.metadata ?? pair.from?.metadata };
      for (const kind of ["functions", "sections"] as const) {
        const rows = new Map<string, { from?: Record<string, unknown>; to?: Record<string, unknown> }>();
        for (const side of ["from", "to"] as const) {
          const unit = pair[side];
          for (const rawRow of unit && Array.isArray(unit[kind]) ? unit[kind] : []) {
            const row = parseObject(rawRow);
            const rowName = typeof row.name === "string" ? row.name : "";
            if (!rowName) continue;
            const rowPair = rows.get(rowName) ?? {};
            rowPair[side] = row;
            rows.set(rowName, rowPair);
          }
        }
        result[kind] = [...rows.entries()].map(([rowName, rowPair]) => ({
          name: rowName,
          ...(rowPair.from ? { from: rowPair.from } : {}),
          ...(rowPair.to ? { to: rowPair.to } : {}),
          metadata: rowPair.to?.metadata ?? rowPair.from?.metadata,
        }));
      }
      return result;
    });
    return { from: parseObject(from.measures), to: parseObject(to.measures), units: pairedUnits };
  } catch {
    return null;
  }
}

function confirmedComparison(baseline: SavePointRow | null, confirmed: SavePointRow | null) {
  const unavailable = { comparisonStatus: "baseline_unavailable" as const, matches: [], improvements: [], breakages: [] };
  if (!baseline?.report_path || !confirmed?.report_path) return unavailable;
  const changes = comparisonReport(baseline.report_path, confirmed.report_path);
  if (!changes) return unavailable;
  const report = buildRegressionReport(changes, "Dashboard confirmed comparison", 0);
  return {
    comparisonStatus: "vs_upstream" as const,
    matches: report.newMatches.map((entry) => ({ ...reportItem(entry), score: entry.toPercent })),
    improvements: report.improvements.map(reportItem),
    breakages: report.brokenMatches.map(reportItem),
  };
}

/**
 * The vs-upstream breakages of open-verification targets (a certified repair
 * that holds its certified baseline, or a function still unverified) are not
 * breakages (certified-regression.ts `judgeMasterBreakages`).
 */
async function judgeConfirmedBreakages<T extends { breakages: ScoreTierImprovement[] }>(
  store: StateStore,
  gameId: string,
  tier: T,
  provenance: { measuredRev: string | null; repoRoot: string | null },
): Promise<T> {
  if (tier.breakages.length === 0) return tier;
  const rows = tier.breakages.map((row) => ({ row, unitName: row.unit, itemName: row.symbol, toPercent: row.newScore, kind: row.kind }));
  // Only landings proven to be in the measured save point's commit excuse a row (no repo: none).
  if (!provenance.repoRoot || !provenance.measuredRev) return tier;
  const { kept } = await judgeMasterBreakages(rows, { store, gameId, measuredRev: provenance.measuredRev, isAncestor: gitRevAncestry(provenance.repoRoot) });
  return kept.length === rows.length ? tier : { ...tier, breakages: kept.map(({ row }) => row) };
}

/**
 * Matches of functions still held (`unverified_match`, an uncertified
 * rollback, or unknown state) are not done: each moves to the improvements
 * (its score delta still counts), flagged `unverified_match` when `labels`
 * (the active rows) holds it or no labels are given. Identity without an
 * index.
 */
export function withholdUnverifiedMatches<T extends { matches: ScoreTierMatch[]; improvements: ScoreTierImprovement[] }>(
  tier: T,
  unverified: UnverifiedIndex | undefined,
  labels?: UnverifiedIndex,
  /** The game the rows belong to: report rows name units with the objdiff module prefix, holds without it. */
  game?: UnitKeyGame,
): T {
  if (!unverified || (unverified.size === 0 && !completionIndexUnknown(unverified))) return tier;
  // Every spelling of the row's unit (identity without module prefixes, Melee).
  const keys = (row: { unit: string; symbol: string }) => targetKeyVariants(game, row.unit, row.symbol);
  const withheld = tier.matches.filter((row) => keys(row).some((key) => isUnverifiedTarget(unverified, key)));
  if (withheld.length === 0) return tier;
  // Flagged only for an active row: a rollback hold or unknown state is withheld, not labelled.
  const flagged = (row: { unit: string; symbol: string }) => !labels || keys(row).some((key) => unitKeyedHas(labels, key));
  return {
    ...tier,
    matches: tier.matches.filter((row) => !withheld.includes(row)),
    improvements: [
      ...withheld.map(({ score: _score, ...row }) => flagged(row) ? { ...row, verification: "unverified_match" as const } : row),
      ...tier.improvements,
    ],
  } as T;
}

/** Normalize saved evidence labels for the score chart. */
export function scoreTimelineKind(triggerKind: string, label: string | null): ScoreTimelineKind {
  if (triggerKind === "baseline" || triggerKind === "init") return "baseline";
  if (triggerKind === "pr_sync" || triggerKind === "sync") return "pr_sync";
  if (triggerKind === "epoch_finish" || triggerKind === "epoch" || /epoch[\s_-]*(?:finish|boundary|\d+)/i.test(label ?? "")) {
    return "epoch_finish";
  }
  return "legacy";
}

function tentativeWins(store: StateStore, runId: string | null): DashboardScoreTiers["tentative"] {
  if (!runId) return { matches: [], improvements: [] };
  const activeRun = store.db.query("SELECT id FROM runs WHERE id = ? AND status = 'active'").get(runId) as { id: string } | null;
  if (!activeRun) return { matches: [], improvements: [] };
  const epoch = store.db.query(
    "SELECT id FROM epochs WHERE run_id = ? AND status = 'active' ORDER BY ordinal DESC LIMIT 1",
  ).get(activeRun.id) as { id: string } | null;
  if (!epoch) return { matches: [], improvements: [] };
  const rows = store.db.query(
    `SELECT worker_checkpoints.id, worker_checkpoints.old_score, worker_checkpoints.new_score, worker_checkpoints.delta,
            worker_checkpoints.exact_match, worker_checkpoints.improved_over_baseline,
            epoch_targets.target_key, epoch_targets.unit, epoch_targets.symbol
       FROM worker_checkpoints
       JOIN epoch_targets ON epoch_targets.id = worker_checkpoints.epoch_target_id
       LEFT JOIN checkpoint_items ON checkpoint_items.worker_checkpoint_id = worker_checkpoints.id
      WHERE worker_checkpoints.run_id = ? AND worker_checkpoints.epoch_id = ?
        AND worker_checkpoints.selected = 1 AND worker_checkpoints.hard_gates_passed = 1
        AND (worker_checkpoints.exact_match = 1 OR worker_checkpoints.improved_over_baseline = 1)
      ORDER BY worker_checkpoints.validation_time DESC`,
  ).all(activeRun.id, epoch.id) as Record<string, unknown>[];
  const seen = new Set<string>();
  const matches: ScoreTierMatch[] = [];
  const improvements: ScoreTierImprovement[] = [];
  for (const row of rows) {
    const targetKey = String(row.target_key ?? "");
    if (!targetKey || seen.has(targetKey)) continue;
    seen.add(targetKey);
    const unit = String(row.unit ?? targetKey.split("::", 1)[0] ?? "");
    const symbol = String(row.symbol ?? targetKey.split("::", 2)[1] ?? "");
    const oldScore = finiteNumber(row.old_score);
    const newScore = finiteNumber(row.new_score);
    const delta = finiteNumber(row.delta);
    if (Boolean(row.exact_match) && oldScore !== null && newScore !== null && delta !== null) {
      matches.push({ targetKey, unit, symbol, score: newScore, oldScore, newScore, delta, state: "in_branch" });
    } else if (Boolean(row.improved_over_baseline) && oldScore !== null && newScore !== null && delta !== null && delta > 0) {
      improvements.push({ targetKey, unit, symbol, oldScore, newScore, delta, state: "in_branch" });
    }
  }
  return { matches, improvements };
}

/**
 * The holds keyed for the game (`withUnitKeys`): stored figures are withheld
 * by report unit names, which carry the objdiff module prefix the steering
 * rows lack. Identity for games without module prefixes (Melee).
 */
function keyedCompletionSource(source: CompletionIndexSource | undefined, game: UnitKeyGame): CompletionIndexSource | undefined {
  const keyed = (index: UnverifiedIndex) => completionIndexUnknown(index) ? index : withUnitKeys(index, game);
  if (!source) return source;
  if (!isRevisionCompletionIndex(source)) return keyed(source);
  return { ...source, at: (rev) => keyed(source.at(rev)) };
}

export async function scoreTiersProjection(
  store: StateStore,
  gameId: string,
  options: {
    sourceState?: { head: string | null; dirty: boolean | null };
    /**
     * Steering-gated games: the completion holds (active `unverified_match`
     * rows; a revision-aware index adds the rollback holds of each save
     * point's own commit). Every score, measure and timeline point withholds
     * them and their matches list as improvements. Omitted (Melee, gate
     * off): the stored figures.
     */
    unverified?: CompletionIndexSource;
    /** Active rows that flag withheld matches (default: every withheld match is flagged). */
    labels?: UnverifiedIndex;
  } = {},
): Promise<DashboardScoreTiers> {
  const empty: DashboardScoreTiers = {
    baseline: { score: null, measures: {}, anchorRevision: null, savePointId: null },
    confirmed: {
      score: null, measures: {}, delta: null, savePointId: null, anchorRevision: null,
      comparisonStatus: "baseline_unavailable", matches: [], improvements: [], breakages: [],
    },
    tentative: { matches: [], improvements: [] },
    timeline: [],
  };
  const canonicalState = getHarnessState(store.db, gameId);
  if (canonicalState) {
    const unverified = keyedCompletionSource(options.unverified, gameId);
    const progress = new Map<string, { score: number | null; measures: Record<string, unknown> }>();
    const rowProgress = (row: SavePointRow) => {
      let value = progress.get(row.id);
      if (!value) progress.set(row.id, value = savePointProgress(row, unverified));
      return value;
    };
    const score = (row: SavePointRow) => rowProgress(row).score;
    const measures = (row: SavePointRow) => rowProgress(row).measures;
    const savePoints = store.db.query(`
      SELECT DISTINCT s.id, s.trigger_kind, s.label, s.commit_sha, s.matched_code_percent,
             s.report_path, s.payload_json, s.created_at
      FROM save_points s JOIN harness_timeline_entries t
        ON s.id = json_extract(t.payload_json, '$.evidence.save_point_id')
        -- Sync publication anchors its save point as the boundary event itself.
        OR (t.kind = 'save_point' AND s.id = t.event_id)
      WHERE t.game_id = ? ORDER BY s.created_at ASC, s.id ASC
    `).all(gameId) as SavePointRow[];
    const run = canonicalState.history.run_id
      ? store.db.query("SELECT created_at, inputs_json FROM runs WHERE id = ?").get(canonicalState.history.run_id) as { created_at: string; inputs_json: string } | null
      : null;
    const baseRevision = typeof parseObject(run?.inputs_json).base_revision === "string"
      ? String(parseObject(run?.inputs_json).base_revision)
      : null;
    const runBaseline = baseRevision
      ? savePoints.find((row) => row.commit_sha === baseRevision) ?? null
      : null;
    const acceptedHeadAtRunCreation = run
      ? store.db.query(`SELECT json_extract(payload_json, '$.source.resulting_head') AS head
          FROM harness_timeline_entries
         WHERE game_id = ? AND occurred_at <= ?
         ORDER BY occurred_at DESC, id DESC LIMIT 1`).get(gameId, run.created_at) as { head: string | null } | null
      : null;
    const acceptedSyncBaseline = run && acceptedHeadAtRunCreation?.head
      ? [...savePoints].reverse().find((row) => row.trigger_kind === "sync" && row.created_at <= run.created_at &&
        row.commit_sha === acceptedHeadAtRunCreation.head) ?? null
      : null;
    const upstreamBaseline = savePoints.find((row) => row.commit_sha === canonicalState.source.upstream_revision) ?? null;
    const baseline = runBaseline ?? acceptedSyncBaseline ?? upstreamBaseline;
    const latest = [...savePoints].reverse().find((row) => row.id === canonicalState.history.save_point_id) ?? null;
    const baselineReportRow = baseline && latest
      ? [...savePoints].reverse().find((row) => row.id !== latest.id && row.commit_sha === baseline.commit_sha &&
        row.created_at <= latest.created_at && row.report_path != null) ?? baseline
      : baseline;
    const fresh = canonicalState.readiness.evidence === "ready" && options.sourceState?.dirty === false &&
      options.sourceState.head === canonicalState.source.head && latest?.commit_sha === canonicalState.source.head;
    const withheldComparison = withholdUnverifiedMatches(confirmedComparison(baselineReportRow, latest),
      latest ? completionIndexAt(unverified, latest.commit_sha) : undefined, options.labels, gameId);
    // Steering-gated games: an open-verification target is judged against its certified baseline, not the uncertified upstream score.
    const comparison = options.unverified
      ? await judgeConfirmedBreakages(store, gameId, withheldComparison, { measuredRev: latest?.commit_sha ?? null, repoRoot: canonicalState.source.worktree || null })
      : withheldComparison;
    return {
      ...empty,
      baseline: { score: baseline ? score(baseline) : null, measures: baseline ? measures(baseline) : {}, anchorRevision: baseline?.commit_sha ?? canonicalState.source.upstream_revision, savePointId: baseline?.id ?? null },
      // A scalar comparison needs matching metric/build scope. Keep delta unknown
      // until the boundary evidence carries that proof; never rebuild in a read.
      confirmed: {
        ...empty.confirmed,
        score: fresh && latest ? score(latest) : null,
        measures: fresh && latest ? measures(latest) : {},
        delta: fresh && comparison.comparisonStatus === "vs_upstream" && baseline && latest && score(baseline) !== null && score(latest) !== null
          ? score(latest)! - score(baseline)!
          : null,
        savePointId: latest?.id ?? null,
        anchorRevision: baseline?.commit_sha ?? canonicalState.source.upstream_revision,
        ...comparison,
      },
      // Not yet saved: held as at the live source head.
      tentative: withholdUnverifiedMatches(tentativeWins(store, canonicalState.history.run_id),
        completionIndexAt(unverified, options.sourceState?.head ?? canonicalState.source.head), options.labels, gameId),
      timeline: savePoints.map((row) => ({ savePointId: row.id, commitSha: row.commit_sha, score: score(row), measures: measures(row), kind: scoreTimelineKind(row.trigger_kind, row.label), label: row.label, createdAt: row.created_at })),
    };
  }
  return empty;
}
