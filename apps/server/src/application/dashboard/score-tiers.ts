import { existsSync, readFileSync } from "node:fs";
import { getHarnessState } from "@server/core/harness-state/state.js";
import type { StateStore } from "@server/core/orchestrator-state";
import { buildRegressionReport, type ReportEntry } from "@server/core/validation/objdiff/report.js";

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

function measures(row: SavePointRow): Record<string, unknown> {
  return parseObject(parseObject(row.payload_json).measures);
}

function score(row: SavePointRow): number | null {
  return finiteNumber(row.matched_code_percent) ?? finiteNumber(measures(row).matched_code_percent);
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

export async function scoreTiersProjection(
  store: StateStore,
  gameId: string,
  options: { sourceState?: { head: string | null; dirty: boolean | null } } = {},
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
    const comparison = confirmedComparison(baselineReportRow, latest);
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
      tentative: tentativeWins(store, canonicalState.history.run_id),
      timeline: savePoints.map((row) => ({ savePointId: row.id, commitSha: row.commit_sha, score: score(row), measures: measures(row), kind: scoreTimelineKind(row.trigger_kind, row.label), label: row.label, createdAt: row.created_at })),
    };
  }
  return empty;
}
