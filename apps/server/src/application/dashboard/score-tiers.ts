import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { StateStore } from "@server/core/orchestrator-state";
import type { CycleRecord } from "@server/core/cycle";
import {
  runMasterBreakageGate,
  type MasterBreakageGateResult,
} from "@server/core/cycle-runtime/phases/running/epochs/breakage-gate.js";
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

/** Phase-2 backfill: legacy init/sync/epoch labels immediately become chart steps. */
export function scoreTimelineKind(triggerKind: string, label: string | null): ScoreTimelineKind {
  if (triggerKind === "baseline" || triggerKind === "init") return "baseline";
  if (triggerKind === "pr_sync" || triggerKind === "sync") return "pr_sync";
  if (triggerKind === "epoch_finish" || triggerKind === "epoch" || /epoch[\s_-]*(?:finish|boundary|\d+)/i.test(label ?? "")) {
    return "epoch_finish";
  }
  return "legacy";
}

function cycleSavePoints(store: StateStore, cycleUuid: string): SavePointRow[] {
  return store.db.query(
    `SELECT save_points.id, save_points.trigger_kind, save_points.label,
            save_points.commit_sha, save_points.matched_code_percent, save_points.report_path,
            save_points.payload_json, save_points.created_at
       FROM cycle_timeline_entries
       JOIN save_points ON save_points.id = cycle_timeline_entries.entry_id
      WHERE cycle_timeline_entries.cycle_uuid = ?
        AND cycle_timeline_entries.entry_kind = 'save_point'
      ORDER BY cycle_timeline_entries.occurred_at ASC, cycle_timeline_entries.id ASC`,
  ).all(cycleUuid) as SavePointRow[];
}

type MasterGate = typeof runMasterBreakageGate;

function reportItem(entry: ReportEntry): ScoreTierImprovement {
  const kind = entry.itemName.startsWith(".") ? "section" : "function";
  return {
    targetKey: `${entry.unitName}::${entry.itemName}`,
    unit: entry.unitName,
    symbol: entry.itemName,
    oldScore: entry.fromPercent,
    newScore: entry.toPercent,
    delta: entry.toPercent - entry.fromPercent,
    bytesDelta: entry.bytesDelta ?? 0,
    kind,
    state: "in_branch",
  };
}

async function confirmedVsMaster(input: {
  store: StateStore;
  cycleUuid: string;
  repoRoot: string;
  anchorRevision: string | null;
  confirmedRow: SavePointRow | null;
  gate: MasterGate;
}): Promise<Pick<DashboardScoreTiers["confirmed"], "comparisonStatus" | "matches" | "improvements" | "breakages">> {
  const unavailable = { comparisonStatus: "baseline_unavailable" as const, matches: [], improvements: [], breakages: [] };
  if (!input.anchorRevision || !input.confirmedRow) return unavailable;
  const savedReportPath = input.confirmedRow.report_path ?? "";
  const oursReportPath = savedReportPath && existsSync(savedReportPath)
    ? savedReportPath
    : resolve(input.repoRoot, "build/GALE01/report.json");
  const changesOutPath = resolve(
    input.store.stateDir,
    "dashboard_master_changes",
    `${input.cycleUuid}-${input.confirmedRow.id}.json`,
  );
  const gate = await input.gate({
    repoRoot: input.repoRoot,
    stateDir: input.store.stateDir,
    worktreeDir: null,
    oursReportPath,
    anchorSha: input.anchorRevision,
    reportRelPath: "build/GALE01/report.json",
    changesOutPath,
    prSyncFallbackReportPath: null,
  });
  if ((gate.status === "skipped" || gate.status === "error") || !gate.changesPath || !existsSync(gate.changesPath)) return unavailable;
  const report = buildRegressionReport(JSON.parse(readFileSync(gate.changesPath, "utf8")), "Dashboard vs upstream", 0);
  const breakages = gate.breakages.map((entry) => reportItem({
    unitName: entry.unitName,
    itemName: entry.itemName,
    sourcePath: "",
    size: 0,
    fromPercent: entry.fromPercent,
    toPercent: entry.toPercent,
    bytesDelta: entry.bytesDelta ?? 0,
  }));
  return {
    comparisonStatus: "vs_upstream",
    matches: report.newMatches.map((entry) => ({ ...reportItem(entry), score: entry.toPercent })),
    improvements: report.improvements.map(reportItem),
    breakages,
  };
}

function tentativeWins(store: StateStore, cycle: CycleRecord): DashboardScoreTiers["tentative"] {
  if (!cycle.active_run_id) return { matches: [], improvements: [] };
  const activeRun = store.db.query("SELECT id FROM runs WHERE id = ? AND status = 'active'").get(cycle.active_run_id) as { id: string } | null;
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
  cycle: CycleRecord | null,
  repoRoot: string,
  options: { runMasterBreakageGate?: MasterGate } = {},
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
  if (!cycle) return empty;
  const anchor = store.db.query(
    "SELECT upstream_revision FROM game_upstream_anchors WHERE game_id = ? AND cycle_uuid = ?",
  ).get(gameId, cycle.cycle_uuid) as { upstream_revision: string } | null;
  const savePoints = cycleSavePoints(store, cycle.cycle_uuid);
  const timeline = savePoints.map((row): ScoreTierPoint => ({
    savePointId: row.id,
    commitSha: row.commit_sha,
    score: score(row),
    measures: measures(row),
    kind: scoreTimelineKind(row.trigger_kind, row.label),
    label: row.label,
    createdAt: row.created_at,
  }));
  const anchorRevision = anchor?.upstream_revision ?? cycle.base_sha ?? null;
  const anchorPoints = savePoints.filter((row) => row.commit_sha === anchorRevision);
  const baselineRow = anchorPoints.find((row) => score(row) !== null) ?? anchorPoints[0] ?? null;
  const typedConfirmed = [...savePoints].reverse().find(
    (row) => row.trigger_kind === "epoch_finish" || row.trigger_kind === "pr_sync",
  );
  const confirmedRow = typedConfirmed ?? [...savePoints].reverse().find((row) => score(row) !== null) ?? null;
  const baselineScore = baselineRow ? score(baselineRow) : null;
  const confirmedScore = confirmedRow ? score(confirmedRow) : null;
  const wins = await confirmedVsMaster({
    store,
    cycleUuid: cycle.cycle_uuid,
    repoRoot,
    anchorRevision,
    confirmedRow,
    gate: options.runMasterBreakageGate ?? runMasterBreakageGate,
  });
  return {
    baseline: {
      score: baselineScore,
      measures: baselineRow ? measures(baselineRow) : {},
      anchorRevision,
      savePointId: baselineRow?.id ?? null,
    },
    confirmed: {
      score: confirmedScore,
      measures: confirmedRow ? measures(confirmedRow) : {},
      delta: baselineScore !== null && confirmedScore !== null ? confirmedScore - baselineScore : null,
      savePointId: confirmedRow?.id ?? null,
      anchorRevision,
      ...wins,
    },
    tentative: tentativeWins(store, cycle),
    timeline,
  };
}
