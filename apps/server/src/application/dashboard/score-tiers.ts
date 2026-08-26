import type { StateStore } from "@server/core/orchestrator-state";
import type { CycleRecord } from "@server/core/cycle";
import { quietGit } from "@server/core/cycle-runtime/phases/pr/pr-sync.js";
import { parseWorkerIntegrationSubject } from "@server/core/cycle-runtime/phases/running/epochs/boundary-sync.js";

export type ScoreTierState = "in_branch" | "in_upstream";
export type ScoreTimelineKind = "baseline" | "epoch_finish" | "pr_sync" | "legacy";

export interface ScoreTierMatch {
  targetKey: string;
  unit: string;
  symbol: string;
  score: number;
  state: ScoreTierState;
}

export interface ScoreTierImprovement {
  targetKey: string;
  unit: string;
  symbol: string;
  delta: number;
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
    matches: ScoreTierMatch[];
    improvements: ScoreTierImprovement[];
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
  payload_json: string;
  created_at: string;
}

interface IntegrationCommit {
  commitSha: string;
  targetKey: string;
  checkpointPrefix: string;
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
            save_points.commit_sha, save_points.matched_code_percent,
            save_points.payload_json, save_points.created_at
       FROM cycle_timeline_entries
       JOIN save_points ON save_points.id = cycle_timeline_entries.entry_id
      WHERE cycle_timeline_entries.cycle_uuid = ?
        AND cycle_timeline_entries.entry_kind = 'save_point'
      ORDER BY cycle_timeline_entries.occurred_at ASC, cycle_timeline_entries.id ASC`,
  ).all(cycleUuid) as SavePointRow[];
}

function gitHistory(repoRoot: string, range: string): IntegrationCommit[] {
  if (!repoRoot || !range) return [];
  const result = quietGit(repoRoot, ["log", "--format=%H%x09%s", range]);
  if (result.exitCode !== 0) return [];
  const commits: IntegrationCommit[] = [];
  for (const line of result.stdout.split(/\r?\n/)) {
    const tab = line.indexOf("\t");
    if (tab < 0) continue;
    const parsed = parseWorkerIntegrationSubject(line.slice(tab + 1));
    if (parsed) commits.push({ commitSha: line.slice(0, tab), ...parsed });
  }
  return commits;
}

function cycleCheckpointEvidence(store: StateStore, cycleUuid: string): Map<string, Record<string, unknown>[]> {
  const rows = store.db.query(
    `SELECT worker_checkpoints.id, worker_checkpoints.new_score, worker_checkpoints.delta,
            worker_checkpoints.exact_match, worker_checkpoints.improved_over_baseline,
            epoch_targets.unit, epoch_targets.symbol, epoch_targets.target_key
       FROM worker_checkpoints
       JOIN runs ON runs.id = worker_checkpoints.run_id
       JOIN epoch_targets ON epoch_targets.id = worker_checkpoints.epoch_target_id
      WHERE runs.cycle_uuid = ?
      ORDER BY worker_checkpoints.validation_time DESC`,
  ).all(cycleUuid) as Record<string, unknown>[];
  const byTarget = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const targetKey = String(row.target_key ?? "");
    const entries = byTarget.get(targetKey) ?? [];
    entries.push(row);
    byTarget.set(targetKey, entries);
  }
  return byTarget;
}

function confirmedWins(
  store: StateStore,
  cycleUuid: string,
  repoRoot: string,
  firstCycleCommit: string | null,
  anchorRevision: string | null,
  confirmedCommit: string | null,
): Pick<DashboardScoreTiers["confirmed"], "matches" | "improvements"> {
  if (!firstCycleCommit || !confirmedCommit) return { matches: [], improvements: [] };
  const all = gitHistory(repoRoot, `${firstCycleCommit}..${confirmedCommit}`);
  const branchShas = new Set(
    anchorRevision ? gitHistory(repoRoot, `${anchorRevision}..${confirmedCommit}`).map((commit) => commit.commitSha) : [],
  );
  const byTarget = new Map<string, IntegrationCommit>();
  for (const commit of all) if (!byTarget.has(commit.targetKey)) byTarget.set(commit.targetKey, commit);
  const checkpointRows = cycleCheckpointEvidence(store, cycleUuid);
  const matches: ScoreTierMatch[] = [];
  const improvements: ScoreTierImprovement[] = [];
  for (const commit of byTarget.values()) {
    const evidence = checkpointRows.get(commit.targetKey)?.find((row) => String(row.id).startsWith(commit.checkpointPrefix));
    if (!evidence) continue;
    const targetKey = String(evidence.target_key ?? commit.targetKey);
    const [targetUnit = "", targetSymbol = ""] = targetKey.split("::", 2);
    const unit = String(evidence.unit ?? targetUnit);
    const symbol = String(evidence.symbol ?? targetSymbol);
    const state: ScoreTierState = branchShas.has(commit.commitSha) ? "in_branch" : "in_upstream";
    const newScore = finiteNumber(evidence.new_score);
    const delta = finiteNumber(evidence.delta);
    if (Boolean(evidence.exact_match) && newScore !== null) matches.push({ targetKey, unit, symbol, score: newScore, state });
    else if (Boolean(evidence.improved_over_baseline) && delta !== null && delta > 0) improvements.push({ targetKey, unit, symbol, delta, state });
  }
  const compare = (left: { unit: string; symbol: string }, right: { unit: string; symbol: string }) =>
    left.unit.localeCompare(right.unit) || left.symbol.localeCompare(right.symbol);
  return { matches: matches.sort(compare), improvements: improvements.sort(compare) };
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
    `SELECT worker_checkpoints.id, worker_checkpoints.new_score, worker_checkpoints.delta,
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
    const newScore = finiteNumber(row.new_score);
    const delta = finiteNumber(row.delta);
    if (Boolean(row.exact_match) && newScore !== null) matches.push({ targetKey, unit, symbol, score: newScore, state: "in_branch" });
    else if (Boolean(row.improved_over_baseline) && delta !== null && delta > 0) improvements.push({ targetKey, unit, symbol, delta, state: "in_branch" });
  }
  return { matches, improvements };
}

export function scoreTiersProjection(
  store: StateStore,
  gameId: string,
  cycle: CycleRecord | null,
  repoRoot: string,
): DashboardScoreTiers {
  const empty: DashboardScoreTiers = {
    baseline: { score: null, measures: {}, anchorRevision: null, savePointId: null },
    confirmed: { score: null, measures: {}, delta: null, savePointId: null, matches: [], improvements: [] },
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
    (row) => (row.trigger_kind === "epoch_finish" || row.trigger_kind === "pr_sync") && score(row) !== null,
  );
  const confirmedRow = typedConfirmed ?? [...savePoints].reverse().find((row) => score(row) !== null) ?? null;
  const baselineScore = baselineRow ? score(baselineRow) : null;
  const confirmedScore = confirmedRow ? score(confirmedRow) : null;
  const wins = confirmedWins(
    store,
    cycle.cycle_uuid,
    repoRoot,
    savePoints.find((row) => row.commit_sha)?.commit_sha ?? cycle.base_sha ?? null,
    anchorRevision,
    confirmedRow?.commit_sha ?? cycle.head_revision ?? null,
  );
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
      ...wins,
    },
    tentative: tentativeWins(store, cycle),
    timeline,
  };
}
