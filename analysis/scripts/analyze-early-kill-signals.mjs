import { Database } from "bun:sqlite";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const dbPath = "games/melee/state/orchestrator.sqlite";
const outDir = "analysis/reports";
const generatedAt = new Date().toISOString();
const today = generatedAt.slice(0, 10);
const EPSILON = 0.000001;
const FAILURE_SIGNAL_MIN_SUPPORT = 50;
const NEAR_MATCH_SCORE = 99.9;

function parseArgs(argv) {
  const args = {
    runId: null,
    minEpoch: null,
    maxEpoch: null,
    includeActive: false,
    out: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--run" && argv[index + 1]) {
      args.runId = argv[index + 1];
      index += 1;
    } else if (arg === "--min-epoch" && argv[index + 1]) {
      args.minEpoch = Number(argv[index + 1]);
      index += 1;
    } else if (arg === "--max-epoch" && argv[index + 1]) {
      args.maxEpoch = Number(argv[index + 1]);
      index += 1;
    } else if (arg === "--include-active") {
      args.includeActive = true;
    } else if (arg === "--out" && argv[index + 1]) {
      args.out = argv[index + 1];
      index += 1;
    }
  }
  return args;
}

function number(value) {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function bool(value) {
  return Number(value) === 1;
}

function parseTime(value) {
  if (!value) return null;
  const ms = Date.parse(String(value));
  return Number.isFinite(ms) ? ms : null;
}

function pct(numerator, denominator, digits = 1) {
  if (!denominator) return null;
  return Number(((100 * numerator) / denominator).toFixed(digits));
}

function round(value, digits = 6) {
  if (!Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function sum(values) {
  return values.filter((value) => Number.isFinite(value)).reduce((total, value) => total + value, 0);
}

function quantile(values, q) {
  const sorted = values.filter((value) => Number.isFinite(value)).slice().sort((left, right) => left - right);
  if (sorted.length === 0) return null;
  const index = (sorted.length - 1) * q;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function summarizeValues(values) {
  const finite = values.filter((value) => Number.isFinite(value));
  return {
    count: finite.length,
    min: finite.length ? Math.min(...finite) : null,
    q20: quantile(finite, 0.2),
    median: quantile(finite, 0.5),
    q80: quantile(finite, 0.8),
    max: finite.length ? Math.max(...finite) : null,
  };
}

function fmt(value, digits = 1) {
  if (value == null || !Number.isFinite(Number(value))) return "";
  return Number(value).toFixed(digits);
}

function fmtPct(value) {
  return value == null ? "" : `${fmt(value, 1)}%`;
}

function fmtEfficiency(value, saved) {
  if (value != null) return fmt(value, 1);
  return saved > 0 ? "∞" : "";
}

function slug(value) {
  return String(value ?? "missing")
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "_")
    .replaceAll(/^_+|_+$/g, "") || "missing";
}

function parseStringArray(value) {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function failureCategory(reason) {
  const normalized = String(reason)
    .trim()
    .toLowerCase()
    .replaceAll(/`[^`]+`/g, "<value>")
    .replaceAll(/\b0x[0-9a-f]+\b/g, "<hex>")
    .replaceAll(/\b\d+(?:\.\d+)?\b/g, "<n>")
    .replaceAll(/\s+/g, " ");
  if (!normalized) return "empty reason";
  if (normalized.includes("timed out") || normalized.includes("timeout")) return "timeout";
  if (normalized.includes("review lint") || normalized.includes("qa lint")) return "qa_lint_findings";
  if (normalized.includes("pre-worker object build")) return "pre_worker_build_failed";
  if (normalized.includes("improved from") && normalized.includes("did not reach exact")) return "improved_but_claimed_exact";
  if (normalized.includes("did not reach exact")) return "did_not_reach_claimed_exact";
  if (normalized.includes("same-unit score regression")) return "same_unit_regression";
  if (normalized.includes("already-exact") && normalized.includes("regressed")) return "already_exact_regression";
  if (normalized.includes("target") && normalized.includes("regressed from")) return "target_regressed";
  if (normalized.includes("target symbol score unavailable")) return "target_score_unavailable";
  if (normalized.includes("compile") || normalized.includes("compiler") || normalized.includes("build")) return "build_or_snapshot_unavailable";
  if (normalized.includes("objdiff") || normalized.includes("target score")) return "objdiff_or_score_unavailable";
  if (normalized.includes("write set")) return "write_set_violation";
  if (normalized.includes("post-return") || normalized.includes("post return")) return "post_return_check";
  if (normalized.includes("validation")) return "validation_failure";
  return normalized.length > 96 ? `${normalized.slice(0, 93)}...` : normalized;
}

function checkpointKind(row) {
  const acceptedExact = row.selectable && row.hardGatesPassed && row.exactMatch;
  const normalFuzzy = row.selectable && row.hardGatesPassed && row.improvedOverBaseline && !row.exactMatch && row.newScore != null;
  const failedGateExact = row.exactMatch && !row.hardGatesPassed;
  const rejectedImprovement = !row.hardGatesPassed && !row.exactMatch && (row.improvedOverBaseline || (row.delta ?? 0) > EPSILON);
  if (acceptedExact) return "accepted_exact";
  if (normalFuzzy) return "normal_fuzzy";
  if (failedGateExact) return "failed_gate_exact";
  if (rejectedImprovement) return "rejected_improvement";
  return "no_selectable_win";
}

function latestCheckpointRunId(db) {
  const row = db
    .query(
      `
        SELECT run_id, MAX(validation_time) AS last_validation
        FROM worker_checkpoints
        GROUP BY run_id
        ORDER BY MAX(validation_time) DESC
        LIMIT 1
      `,
    )
    .get();
  return row?.run_id == null ? null : String(row.run_id);
}

const args = parseArgs(process.argv.slice(2));
const db = new Database(dbPath, { readonly: true });
db.exec("BEGIN");
const runId = args.runId ?? latestCheckpointRunId(db);

if (!runId) {
  throw new Error("No checkpoint-backed run found.");
}

const allEpochs = db
  .query(
    `
      SELECT id, run_id, ordinal, status, admitted_count, finished_count,
             worker_pool_size, candidate_window, created_at, closed_at
      FROM epochs
      WHERE run_id = ?
      ORDER BY ordinal
    `,
  )
  .all(runId)
  .map((row) => ({
    id: String(row.id),
    runId: String(row.run_id),
    ordinal: Number(row.ordinal),
    status: String(row.status),
    admittedCount: Number(row.admitted_count ?? 0),
    finishedCount: Number(row.finished_count ?? 0),
    workerPoolSize: Number(row.worker_pool_size ?? 0),
    candidateWindow: Number(row.candidate_window ?? 0),
    createdAt: String(row.created_at),
    closedAt: row.closed_at == null ? null : String(row.closed_at),
  }));

const includedEpochs = allEpochs.filter((epoch) => {
  if (args.minEpoch != null && epoch.ordinal < args.minEpoch) return false;
  if (args.maxEpoch != null && epoch.ordinal > args.maxEpoch) return false;
  if (!args.includeActive && epoch.closedAt == null) return false;
  return true;
});

if (includedEpochs.length === 0) {
  throw new Error("No epochs matched the requested scope.");
}

const includedEpochIds = includedEpochs.map((epoch) => epoch.id);
const placeholders = includedEpochIds.map(() => "?").join(", ");

const workerRows = db
  .query(
    `
      SELECT
        ws.*,
        e.ordinal AS epoch_ordinal,
        et.unit,
        et.symbol,
        et.source_path,
        et.size
      FROM worker_state ws
      JOIN epochs e ON e.id = ws.epoch_id
      JOIN epoch_targets et ON et.id = ws.epoch_target_id
      WHERE ws.epoch_id IN (${placeholders})
      ORDER BY e.ordinal ASC, ws.started_at ASC
    `,
  )
  .all(...includedEpochIds)
  .map((row) => ({
    id: String(row.id),
    runId: String(row.run_id),
    epochId: String(row.epoch_id),
    epochOrdinal: Number(row.epoch_ordinal),
    targetClaimId: String(row.target_claim_id),
    workerId: String(row.worker_id),
    targetKey: String(row.target_key),
    lifecycleStatus: String(row.lifecycle_status),
    startedAt: String(row.started_at),
    startedMs: parseTime(row.started_at),
    endedAt: row.ended_at == null ? null : String(row.ended_at),
    endedMs: parseTime(row.ended_at),
    baselineScore: number(row.baseline_score),
    bestScore: number(row.best_score),
    exact: bool(row.exact),
    unit: String(row.unit ?? ""),
    symbol: String(row.symbol ?? ""),
    sourcePath: String(row.source_path ?? ""),
    size: number(row.size),
  }));

const checkpointRows = db
  .query(
    `
      SELECT
        wc.*,
        ws.lifecycle_status,
        ws.started_at AS worker_started_at,
        ws.ended_at AS worker_ended_at,
        ws.baseline_score,
        e.ordinal AS epoch_ordinal
      FROM worker_checkpoints wc
      JOIN worker_state ws ON ws.id = wc.worker_state_id
      JOIN epochs e ON e.id = wc.epoch_id
      WHERE wc.epoch_id IN (${placeholders})
      ORDER BY wc.worker_state_id ASC, wc.attempt_index ASC, wc.validation_time ASC
    `,
  )
  .all(...includedEpochIds)
  .map((row) => ({
    id: String(row.id),
    runId: String(row.run_id),
    workerStateId: String(row.worker_state_id),
    targetClaimId: String(row.target_claim_id),
    epochId: String(row.epoch_id),
    epochOrdinal: Number(row.epoch_ordinal),
    attemptIndex: Number(row.attempt_index),
    humanAttempt: Number(row.attempt_index) + 1,
    validationTime: String(row.validation_time),
    validationMs: parseTime(row.validation_time),
    oldScore: number(row.old_score),
    newScore: number(row.new_score),
    delta: number(row.delta),
    exactMatch: bool(row.exact_match),
    hardGatesPassed: bool(row.hard_gates_passed),
    improvedOverBaseline: bool(row.improved_over_baseline),
    selectable: bool(row.selectable),
    selected: bool(row.selected),
    buildStatus: row.build_status == null ? null : String(row.build_status),
    qaStatus: row.qa_status == null ? null : String(row.qa_status),
    objdiffStatus: row.objdiff_status == null ? null : String(row.objdiff_status),
    validationStatus: String(row.validation_status),
    failureReasons: parseStringArray(row.failure_reasons_json),
  }));

const sessionRows = db
  .query(
    `
      SELECT run_id, target_claim_id, session_id, thinking_level, status, created_at
      FROM pi_sessions
      WHERE role = 'worker'
        AND run_id = ?
        AND target_claim_id IS NOT NULL
      ORDER BY created_at ASC
    `,
  )
  .all(runId)
  .map((row) => ({
    targetClaimId: String(row.target_claim_id),
    sessionId: String(row.session_id),
    thinkingLevel: row.thinking_level == null ? null : String(row.thinking_level),
    status: String(row.status),
    createdAt: String(row.created_at),
    createdMs: parseTime(row.created_at),
  }));

db.exec("COMMIT");
db.close();

const checkpointsByWorker = new Map();
for (const checkpoint of checkpointRows) {
  checkpoint.kind = checkpointKind(checkpoint);
  checkpoint.failureCategories = [...new Set(checkpoint.failureReasons.map(failureCategory))];
  const rows = checkpointsByWorker.get(checkpoint.workerStateId) ?? [];
  rows.push(checkpoint);
  checkpointsByWorker.set(checkpoint.workerStateId, rows);
}

const sessionsByClaim = new Map();
for (const session of sessionRows) {
  const rows = sessionsByClaim.get(session.targetClaimId) ?? [];
  rows.push(session);
  sessionsByClaim.set(session.targetClaimId, rows);
}

function sessionsInWindow(targetClaimId, startMs, endMs) {
  return (sessionsByClaim.get(targetClaimId) ?? []).filter((session) => {
    if (session.createdMs == null) return false;
    const afterStart = startMs == null || session.createdMs > startMs;
    const beforeEnd = endMs == null || session.createdMs <= endMs + 120000;
    return afterStart && beforeEnd;
  });
}

function bestScoreThrough(startingBaselineScore, checkpoints, attempt) {
  const scores = [startingBaselineScore, ...checkpoints.slice(0, attempt).map((checkpoint) => checkpoint.newScore)].filter(Number.isFinite);
  return scores.length ? Math.max(...scores) : null;
}

function hadPositiveProgress(worker, attempt) {
  if (!Number.isFinite(worker.startingBaselineScore)) return false;
  return worker.checkpoints
    .slice(0, attempt)
    .some((checkpoint) => checkpoint.newScore != null && checkpoint.newScore > worker.startingBaselineScore + EPSILON);
}

function stagnantAt(worker, attempt) {
  if (worker.checkpoints.length < attempt || attempt < 2) return false;
  const priorBest = bestScoreThrough(worker.startingBaselineScore, worker.checkpoints, attempt - 1);
  const currentBest = bestScoreThrough(worker.startingBaselineScore, worker.checkpoints, attempt);
  if (priorBest == null) return currentBest == null;
  return currentBest == null || currentBest <= priorBest + EPSILON;
}

const workerRecords = workerRows.map((worker) => {
  const allCheckpoints = (checkpointsByWorker.get(worker.id) ?? []).slice().sort(
    (left, right) => left.attemptIndex - right.attemptIndex || left.validationMs - right.validationMs,
  );
  const firstWinIndex = allCheckpoints.findIndex((checkpoint) =>
    ["accepted_exact", "normal_fuzzy"].includes(checkpoint.kind),
  );
  const firstWin = firstWinIndex >= 0 ? allCheckpoints[firstWinIndex] : null;
  const startingBaselineScore = worker.baselineScore ?? allCheckpoints.find((checkpoint) => checkpoint.oldScore != null)?.oldScore ?? null;
  const isCensored = worker.lifecycleStatus === "running" && worker.endedMs == null;
  const sessionWindow = sessionsInWindow(worker.targetClaimId, worker.startedMs, worker.endedMs);
  const bestScoresAfter = Object.fromEntries(
    [1, 2, 3].map((attempt) => [
      attempt,
      allCheckpoints.length >= attempt ? bestScoreThrough(startingBaselineScore, allCheckpoints, attempt) : null,
    ]),
  );
  return {
    ...worker,
    checkpoints: allCheckpoints,
    recordedCheckpointCount: allCheckpoints.length,
    postWinCheckpointCount: firstWinIndex >= 0 ? Math.max(0, allCheckpoints.length - firstWinIndex - 1) : 0,
    attempts: allCheckpoints.length,
    checkpointKinds: allCheckpoints.map((checkpoint) => checkpoint.kind),
    startingBaselineScore,
    bestScoresAfter,
    hasWin: firstWin != null,
    firstWinAttempt: firstWin?.humanAttempt ?? null,
    firstWinKind: firstWin?.kind ?? null,
    firstWinValidationTime: firstWin?.validationTime ?? null,
    firstWinValidationMs: firstWin?.validationMs ?? null,
    isCensored,
    outcomeKnown: firstWin != null || !isCensored,
    piSessionCount: sessionWindow.length,
    piThinkingLevels: [...new Set(sessionWindow.map((session) => session.thinkingLevel).filter(Boolean))].sort(),
  };
});

function hasNoWinAfter(worker, attempt) {
  return worker.attempts >= attempt && (worker.firstWinAttempt == null || worker.firstWinAttempt > attempt);
}

function safeAt(worker, attempt) {
  return !worker.checkpoints.slice(0, attempt).some((checkpoint) => checkpoint.kind === "failed_gate_exact");
}

function eligibleAt(worker, attempt) {
  return hasNoWinAfter(worker, attempt) && safeAt(worker, attempt);
}

function makeSpec(key, label, category, triggerAttempt, predicate, detail = null, deployable = true) {
  return { key, label, category, triggerAttempt, predicate, detail, deployable };
}

const rawBaselineSpecs = [1, 2, 3, 4, 5].map((attempt) =>
  makeSpec(
    `raw_no_win_after_${attempt}`,
    `Raw no-win after ${attempt} attempt${attempt === 1 ? "" : "s"} (comparison only)`,
    "attempt_count_raw",
    attempt,
    (worker) => hasNoWinAfter(worker, attempt),
    { failedGateSafety: false },
    false,
  ),
);

const baselineSpecs = [1, 2, 3, 4, 5].map((attempt) =>
  makeSpec(
    `no_win_after_${attempt}`,
    `No win after ${attempt} attempt${attempt === 1 ? "" : "s"}, no failed-gate exact`,
    "attempt_count",
    attempt,
    (worker) => hasNoWinAfter(worker, attempt),
  ),
);

const fixedSpecs = [
  ...rawBaselineSpecs,
  ...baselineSpecs,
  makeSpec("zero_progress_after_2", "Zero score progress after 2 attempts", "score_progress", 2, (worker) =>
    hasNoWinAfter(worker, 2) && !hadPositiveProgress(worker, 2),
  ),
  makeSpec("zero_progress_after_3", "Zero score progress after 3 attempts", "score_progress", 3, (worker) =>
    hasNoWinAfter(worker, 3) && !hadPositiveProgress(worker, 3),
  ),
  makeSpec("stagnant_pair_at_2", "Attempt 2 did not beat attempt 1 best", "score_progress", 2, (worker) =>
    hasNoWinAfter(worker, 2) && stagnantAt(worker, 2),
  ),
  makeSpec("stagnant_pair_at_3", "Attempt 3 did not beat the prior best", "score_progress", 3, (worker) =>
    hasNoWinAfter(worker, 3) && stagnantAt(worker, 3),
  ),
  makeSpec("first_2_all_no_selectable", "First 2 kinds all no_selectable_win", "kind_history", 2, (worker) =>
    hasNoWinAfter(worker, 2) && worker.checkpointKinds.slice(0, 2).every((kind) => kind === "no_selectable_win"),
  ),
  makeSpec("first_3_all_no_selectable", "First 3 kinds all no_selectable_win", "kind_history", 3, (worker) =>
    hasNoWinAfter(worker, 3) && worker.checkpointKinds.slice(0, 3).every((kind) => kind === "no_selectable_win"),
  ),
  ...[1, 2, 3].flatMap((attempt) => [
    makeSpec(`latest_rejected_after_${attempt}`, `Latest kind after ${attempt}: rejected_improvement`, "kind_history", attempt, (worker) =>
      hasNoWinAfter(worker, attempt) && worker.checkpointKinds[attempt - 1] === "rejected_improvement",
    ),
    makeSpec(`latest_no_selectable_after_${attempt}`, `Latest kind after ${attempt}: no_selectable_win`, "kind_history", attempt, (worker) =>
      hasNoWinAfter(worker, attempt) && worker.checkpointKinds[attempt - 1] === "no_selectable_win",
    ),
  ]),
  makeSpec(
    "latest_no_selectable_or_rejected_after_2",
    "After 2, latest kind is no-selectable/rejected",
    "kind_history",
    2,
    (worker) =>
      hasNoWinAfter(worker, 2) && ["no_selectable_win", "rejected_improvement"].includes(worker.checkpointKinds[1]),
  ),
];

function observedStatusSpecs(workers) {
  const fields = [
    ["buildStatus", "build"],
    ["qaStatus", "qa"],
    ["validationStatus", "validation"],
  ];
  const specs = [];
  const support = [];
  for (const [field, label] of fields) {
    for (const attempt of [1, 2]) {
      const values = [...new Set(workers.map((worker) => worker.checkpoints[attempt - 1]?.[field] ?? "missing"))].sort();
      for (const value of values) {
        const predicate = (worker) => hasNoWinAfter(worker, attempt) && (worker.checkpoints[attempt - 1]?.[field] ?? "missing") === value;
        const atRisk = workers.filter((worker) => safeAt(worker, attempt) && predicate(worker)).length;
        support.push({ field, attempt, value, atRisk });
        if (atRisk < FAILURE_SIGNAL_MIN_SUPPORT) continue;
        specs.push(
          makeSpec(
            `${label}_status_${slug(value)}_at_${attempt}`,
            `Attempt ${attempt} ${label} status = ${value}`,
            "failure_status",
            attempt,
            predicate,
          ),
        );
      }
    }
  }
  return { specs, support };
}

function observedFailureSpecs(workers) {
  const specs = [];
  const support = [];
  for (const attempt of [1, 2]) {
    const categories = [
      ...new Set(
        workers.flatMap((worker) => worker.checkpoints.slice(0, attempt).flatMap((checkpoint) => checkpoint.failureCategories)),
      ),
    ].sort();
    for (const category of categories) {
      const predicate = (worker) =>
        hasNoWinAfter(worker, attempt) &&
        worker.checkpoints.slice(0, attempt).some((checkpoint) => checkpoint.failureCategories.includes(category));
      const atRisk = workers.filter((worker) => safeAt(worker, attempt) && predicate(worker)).length;
      support.push({ category, throughAttempt: attempt, atRisk });
      if (atRisk < FAILURE_SIGNAL_MIN_SUPPORT) continue;
      specs.push(
        makeSpec(
          `failure_${slug(category)}_through_${attempt}`,
          `Failure category through attempt ${attempt}: ${category}`,
          "failure_reason",
          attempt,
          predicate,
        ),
      );
    }
  }
  return { specs, support };
}

function buildScoreBuckets(workers, attempt) {
  const eligible = workers.filter((worker) => eligibleAt(worker, attempt));
  const belowNear = eligible
    .map((worker) => worker.bestScoresAfter[attempt])
    .filter((score) => Number.isFinite(score) && score < NEAR_MATCH_SCORE);
  const boundaries = [...new Set([0.2, 0.4, 0.6, 0.8].map((q) => quantile(belowNear, q)).filter(Number.isFinite))].sort(
    (left, right) => left - right,
  );
  const buckets = [
    {
      key: "missing",
      label: "No numeric score",
      predicate: (score) => score == null,
      lowerExclusive: null,
      upperInclusive: null,
    },
  ];
  let lower = null;
  for (let index = 0; index < boundaries.length; index += 1) {
    const upper = boundaries[index];
    const bucketLower = lower;
    const label = bucketLower == null ? `≤ ${fmt(upper, 3)}` : `> ${fmt(bucketLower, 3)} to ≤ ${fmt(upper, 3)}`;
    buckets.push({
      key: `q${index + 1}`,
      label,
      predicate: (score) =>
        score != null && score < NEAR_MATCH_SCORE && (bucketLower == null || score > bucketLower) && score <= upper,
      lowerExclusive: bucketLower,
      upperInclusive: upper,
    });
    lower = upper;
  }
  buckets.push({
    key: "upper",
    label: lower == null ? `< ${fmt(NEAR_MATCH_SCORE, 1)}` : `> ${fmt(lower, 3)} to < ${fmt(NEAR_MATCH_SCORE, 1)}`,
    predicate: (score) => score != null && score < NEAR_MATCH_SCORE && (lower == null || score > lower),
    lowerExclusive: lower,
    upperInclusive: NEAR_MATCH_SCORE,
  });
  buckets.push({
    key: "near_match",
    label: `Near match ≥ ${fmt(NEAR_MATCH_SCORE, 1)}`,
    predicate: (score) => score != null && score >= NEAR_MATCH_SCORE,
    lowerExclusive: NEAR_MATCH_SCORE,
    upperInclusive: null,
  });
  const specs = buckets.map((bucket) =>
    makeSpec(
      `score_after_${attempt}_${bucket.key}`,
      `Best score after ${attempt}: ${bucket.label}`,
      "score_proximity",
      attempt,
      (worker) => hasNoWinAfter(worker, attempt) && bucket.predicate(worker.bestScoresAfter[attempt]),
      { lowerExclusive: bucket.lowerExclusive, upperInclusive: bucket.upperInclusive },
    ),
  );
  return {
    attempt,
    eligibleWorkers: eligible.length,
    finiteScores: belowNear.length + eligible.filter((worker) => (worker.bestScoresAfter[attempt] ?? -Infinity) >= NEAR_MATCH_SCORE).length,
    boundaries,
    median: quantile(eligible.map((worker) => worker.bestScoresAfter[attempt]), 0.5),
    specs,
  };
}

const statusSignals = observedStatusSpecs(workerRecords);
const failureSignals = observedFailureSpecs(workerRecords);
const scoreBuckets = [buildScoreBuckets(workerRecords, 1), buildScoreBuckets(workerRecords, 2)];
const scoreMedian2 = scoreBuckets.find((bucket) => bucket.attempt === 2)?.median ?? null;

const combinationSpecs = [
  makeSpec(
    "combo_2_zero_progress_below_median",
    "After 2: zero progress and best score below median",
    "combination",
    2,
    (worker) =>
      hasNoWinAfter(worker, 2) &&
      !hadPositiveProgress(worker, 2) &&
      worker.bestScoresAfter[2] != null &&
      scoreMedian2 != null &&
      worker.bestScoresAfter[2] < scoreMedian2,
    { medianScore: scoreMedian2 },
  ),
  makeSpec(
    "combo_3_zero_progress_stagnant",
    "After 3: zero progress and attempt 3 made no new best",
    "combination",
    3,
    (worker) => hasNoWinAfter(worker, 3) && !hadPositiveProgress(worker, 3) && stagnantAt(worker, 3),
  ),
  makeSpec(
    "combo_3_all_no_selectable_stagnant",
    "After 3: all no-selectable and attempt 3 made no new best",
    "combination",
    3,
    (worker) =>
      hasNoWinAfter(worker, 3) &&
      worker.checkpointKinds.slice(0, 3).every((kind) => kind === "no_selectable_win") &&
      stagnantAt(worker, 3),
  ),
  makeSpec(
    "combo_2_all_no_selectable_below_median",
    "After 2: both no-selectable and best score below median",
    "combination",
    2,
    (worker) =>
      hasNoWinAfter(worker, 2) &&
      worker.checkpointKinds.slice(0, 2).every((kind) => kind === "no_selectable_win") &&
      worker.bestScoresAfter[2] != null &&
      scoreMedian2 != null &&
      worker.bestScoresAfter[2] < scoreMedian2,
    { medianScore: scoreMedian2 },
  ),
];

const predicateSpecs = [
  ...fixedSpecs,
  ...statusSignals.specs,
  ...failureSignals.specs,
  ...combinationSpecs,
  ...scoreBuckets.flatMap((bucket) => bucket.specs),
];

const terminalNoWinUniverse = workerRecords.filter(
  (worker) => worker.outcomeKnown && hasNoWinAfter(worker, 1) && safeAt(worker, 1),
);

function summarizePredicate(spec) {
  const safetyPredicate = spec.deployable ? (worker) => safeAt(worker, spec.triggerAttempt) : () => true;
  const eligible = workerRecords.filter(
    (worker) => hasNoWinAfter(worker, spec.triggerAttempt) && safetyPredicate(worker),
  );
  const triggered = workerRecords.filter((worker) => safetyPredicate(worker) && spec.predicate(worker));
  const safetyExcluded = spec.deployable
    ? workerRecords.filter((worker) => !safeAt(worker, spec.triggerAttempt) && spec.predicate(worker))
    : [];
  const knownTriggered = triggered.filter((worker) => worker.outcomeKnown);
  const laterWins = triggered.filter((worker) => worker.hasWin);
  const noLaterWins = triggered.filter((worker) => !worker.hasWin && !worker.isCensored);
  const censored = triggered.filter((worker) => !worker.hasWin && worker.isCensored);
  const eligibleKnown = eligible.filter((worker) => worker.outcomeKnown);
  const savedAttempts = triggered.map((worker) => Math.max(0, worker.checkpoints.length - spec.triggerAttempt));
  const savedMinutes = triggered.map((worker) => {
    const triggerMs = worker.checkpoints[spec.triggerAttempt - 1]?.validationMs ?? null;
    const lastMs = worker.checkpoints.at(-1)?.validationMs ?? null;
    return triggerMs != null && lastMs != null ? Math.max(0, (lastMs - triggerMs) / 60000) : null;
  });
  const attemptsSaved = sum(savedAttempts);
  const workerMinutesSaved = sum(savedMinutes);
  const winsLost = laterWins.length;
  return {
    key: spec.key,
    label: spec.label,
    category: spec.category,
    deployable: spec.deployable,
    triggerAttempt: spec.triggerAttempt,
    atRisk: triggered.length,
    terminalAtRisk: knownTriggered.length,
    eligibleTerminalNoWin: eligibleKnown.length,
    shareOfTerminalNoWinUniversePct: pct(knownTriggered.length, terminalNoWinUniverse.length),
    coverageOfEligibleTerminalPct: pct(knownTriggered.length, eligibleKnown.length),
    laterWinRatePct: pct(laterWins.length, laterWins.length + noLaterWins.length),
    winsLost,
    laterExactWins: laterWins.filter((worker) => worker.firstWinKind === "accepted_exact").length,
    laterFuzzyWins: laterWins.filter((worker) => worker.firstWinKind === "normal_fuzzy").length,
    noLaterWins: noLaterWins.length,
    censored: censored.length,
    failedGateHistoriesExcluded: safetyExcluded.length,
    attemptsSaved,
    medianAttemptsSaved: quantile(savedAttempts, 0.5),
    workerMinutesSaved: round(workerMinutesSaved),
    medianWorkerMinutesSaved: quantile(savedMinutes, 0.5),
    attemptsSavedPerWinLost: winsLost ? round(attemptsSaved / winsLost) : null,
    minutesSavedPerWinLost: winsLost ? round(workerMinutesSaved / winsLost) : null,
    zeroWinLoss: winsLost === 0,
    frontier: false,
    dominatesAttemptBaselines: [],
  };
}

const predicateRows = predicateSpecs.map(summarizePredicate).filter((row) => row.atRisk > 0);

const deployablePredicateRows = predicateRows.filter((row) => row.deployable);
for (const row of predicateRows) {
  row.frontier = row.deployable && !deployablePredicateRows.some(
    (other) =>
      other.key !== row.key &&
      other.winsLost <= row.winsLost &&
      other.workerMinutesSaved >= row.workerMinutesSaved - EPSILON &&
      (other.winsLost < row.winsLost || other.workerMinutesSaved > row.workerMinutesSaved + EPSILON),
  );
}

const attemptBaselineRows = predicateRows.filter((row) => row.category === "attempt_count");
const rawAttemptBaselineRows = predicateRows.filter((row) => row.category === "attempt_count_raw");
for (const row of predicateRows) {
  if (!row.deployable) {
    row.dominatesAttemptBaselines = [];
    continue;
  }
  row.dominatesAttemptBaselines = attemptBaselineRows
    .filter(
      (baseline) =>
        baseline.key !== row.key &&
        row.winsLost <= baseline.winsLost &&
        row.workerMinutesSaved > baseline.workerMinutesSaved + EPSILON,
    )
    .map((baseline) => baseline.key);
}

const sortedPredicateRows = predicateRows.slice().sort(
  (left, right) =>
    left.winsLost - right.winsLost ||
    right.workerMinutesSaved - left.workerMinutesSaved ||
    right.attemptsSaved - left.attemptsSaved ||
    left.label.localeCompare(right.label),
);
const frontierRows = sortedPredicateRows.filter((row) => row.frontier);
const topFrontierRows = frontierRows
  .slice()
  .sort(
    (left, right) =>
      right.workerMinutesSaved - left.workerMinutesSaved || left.winsLost - right.winsLost || right.attemptsSaved - left.attemptsSaved,
  )
  .slice(0, 5);

const allScoreRows = checkpointRows.filter((checkpoint) => checkpoint.oldScore != null || checkpoint.newScore != null || checkpoint.delta != null);
const deltaConsistencyRows = allScoreRows.filter(
  (checkpoint) => checkpoint.oldScore != null && checkpoint.newScore != null && checkpoint.delta != null,
);
const baselineByWorkerState = new Map(workerRecords.map((worker) => [worker.id, worker.startingBaselineScore]));
const baselineConsistencyRows = allScoreRows.filter(
  (checkpoint) => checkpoint.oldScore != null && baselineByWorkerState.get(checkpoint.workerStateId) != null,
);
const scoreSanityRows = [
  ...allScoreRows.filter((row) => (row.delta ?? 0) > EPSILON).slice(0, 2),
  ...allScoreRows.filter((row) => (row.delta ?? 0) < -EPSILON).slice(0, 2),
  ...allScoreRows.filter((row) => row.exactMatch).slice(0, 2),
].filter((row, index, rows) => rows.findIndex((candidate) => candidate.id === row.id) === index).slice(0, 6);

const scoreSemantics = {
  direction: "higher_is_better",
  exactScore: 100,
  nearMatchThreshold: NEAR_MATCH_SCORE,
  oldScore: summarizeValues(allScoreRows.map((row) => row.oldScore)),
  newScore: summarizeValues(allScoreRows.map((row) => row.newScore)),
  delta: summarizeValues(allScoreRows.map((row) => row.delta)),
  deltaConsistency: {
    comparableRows: deltaConsistencyRows.length,
    consistentRows: deltaConsistencyRows.filter(
      (row) => Math.abs(row.newScore - row.oldScore - row.delta) <= EPSILON,
    ).length,
  },
  oldScoreBaselineConsistency: {
    comparableRows: baselineConsistencyRows.length,
    consistentRows: baselineConsistencyRows.filter(
      (row) => Math.abs(row.oldScore - baselineByWorkerState.get(row.workerStateId)) <= EPSILON,
    ).length,
  },
  positiveDeltaRows: allScoreRows.filter((row) => (row.delta ?? 0) > EPSILON).length,
  positiveDeltaMarkedImprovedRows: allScoreRows.filter(
    (row) => (row.delta ?? 0) > EPSILON && row.improvedOverBaseline,
  ).length,
  sanityRows: scoreSanityRows.map((row) => ({
    workerStateId: row.workerStateId,
    attempt: row.humanAttempt,
    oldScore: row.oldScore,
    newScore: row.newScore,
    delta: row.delta,
    improvedOverBaseline: row.improvedOverBaseline,
    kind: row.kind,
  })),
};

const lifecycleCounts = Object.fromEntries(
  [...new Set(workerRecords.map((worker) => worker.lifecycleStatus))]
    .sort()
    .map((status) => [status, workerRecords.filter((worker) => worker.lifecycleStatus === status).length]),
);
const postWinCheckpoints = sum(workerRecords.map((worker) => worker.postWinCheckpointCount));
const definitions = predicateSpecs
  .filter((spec) => predicateRows.some((row) => row.key === spec.key))
  .map((spec) => ({
    key: spec.key,
    label: spec.label,
    category: spec.category,
    deployable: spec.deployable,
    triggerAttempt: spec.triggerAttempt,
    detail: spec.detail,
  }));

function csvEscape(value) {
  if (value == null) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const datasetBaseColumns = [
  "worker_state_id",
  "worker_id",
  "target_claim_id",
  "epoch_ordinal",
  "lifecycle_status",
  "terminal_or_censored",
  "attempts",
  "recorded_checkpoints",
  "has_win",
  "first_win_attempt",
  "first_win_kind",
  "checkpoint_kinds",
  "starting_baseline_score",
  "best_score_after_1",
  "best_score_after_2",
  "best_score_after_3",
  "first_build_status",
  "first_qa_status",
  "first_validation_status",
  "first_failure_categories",
  "pi_session_count",
  "source_path",
  "symbol",
];
const triggerColumns = definitions.map((definition) => `trigger_${definition.key}`);
const datasetColumns = [...datasetBaseColumns, ...triggerColumns];
const specByKey = new Map(predicateSpecs.map((spec) => [spec.key, spec]));
const datasetRows = workerRecords.map((worker) => {
  const row = {
    worker_state_id: worker.id,
    worker_id: worker.workerId,
    target_claim_id: worker.targetClaimId,
    epoch_ordinal: worker.epochOrdinal,
    lifecycle_status: worker.lifecycleStatus,
    terminal_or_censored: worker.isCensored ? "censored" : "terminal",
    attempts: worker.attempts,
    recorded_checkpoints: worker.recordedCheckpointCount,
    has_win: worker.hasWin ? 1 : 0,
    first_win_attempt: worker.firstWinAttempt,
    first_win_kind: worker.firstWinKind,
    checkpoint_kinds: worker.checkpointKinds.join("|"),
    starting_baseline_score: worker.startingBaselineScore,
    best_score_after_1: worker.bestScoresAfter[1],
    best_score_after_2: worker.bestScoresAfter[2],
    best_score_after_3: worker.bestScoresAfter[3],
    first_build_status: worker.checkpoints[0]?.buildStatus ?? null,
    first_qa_status: worker.checkpoints[0]?.qaStatus ?? null,
    first_validation_status: worker.checkpoints[0]?.validationStatus ?? null,
    first_failure_categories: (worker.checkpoints[0]?.failureCategories ?? []).join("|"),
    pi_session_count: worker.piSessionCount,
    source_path: worker.sourcePath,
    symbol: worker.symbol,
  };
  for (const definition of definitions) {
    const spec = specByKey.get(definition.key);
    row[`trigger_${definition.key}`] =
      spec && (!spec.deployable || safeAt(worker, spec.triggerAttempt)) && spec.predicate(worker) ? 1 : 0;
  }
  return row;
});

function markdownEscape(value) {
  return String(value ?? "").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function markdownTable(headers, rows) {
  if (rows.length === 0) return "_No rows._";
  return [
    `| ${headers.map(markdownEscape).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(markdownEscape).join(" | ")} |`),
  ].join("\n");
}

function predicateTable(rows) {
  return markdownTable(
    [
      "Predicate",
      "At risk",
      "Terminal no-win share",
      "Later win",
      "Wins lost (E/F)",
      "Attempts saved",
      "Minutes saved (median)",
      "Attempts/win",
      "Minutes/win",
      "Censored",
      "Frontier",
      "Dominates baselines",
    ],
    rows.map((row) => [
      row.label,
      row.atRisk,
      fmtPct(row.coverageOfEligibleTerminalPct),
      fmtPct(row.laterWinRatePct),
      `${row.winsLost} (${row.laterExactWins}/${row.laterFuzzyWins})`,
      row.attemptsSaved,
      `${fmt(row.workerMinutesSaved, 1)} (${fmt(row.medianWorkerMinutesSaved, 1)})`,
      fmtEfficiency(row.attemptsSavedPerWinLost, row.attemptsSaved),
      fmtEfficiency(row.minutesSavedPerWinLost, row.workerMinutesSaved),
      row.censored,
      row.frontier ? "yes" : "",
      row.dominatesAttemptBaselines.map((key) => key.replace("no_win_after_", "k=")).join(", "),
    ]),
  );
}

const defaultBase = `early-kill-signals-epochs${Math.min(...includedEpochs.map((epoch) => epoch.ordinal))}-${Math.max(...includedEpochs.map((epoch) => epoch.ordinal))}-${today}`;
let markdownPath = resolve(args.out ?? `${outDir}/${defaultBase}.md`);
if (!markdownPath.endsWith(".md")) markdownPath = `${markdownPath}.md`;
const outputBase = markdownPath.slice(0, -3);
const statsPath = `${outputBase}.stats.json`;
const datasetPath = `${outputBase}.dataset.csv`;
mkdirSync(dirname(markdownPath), { recursive: true });

const report = {
  generatedAt,
  dbPath,
  runId,
  outputs: {
    markdown: markdownPath,
    statsJson: statsPath,
    datasetCsv: datasetPath,
  },
  scope: {
    minEpoch: Math.min(...includedEpochs.map((epoch) => epoch.ordinal)),
    maxEpoch: Math.max(...includedEpochs.map((epoch) => epoch.ordinal)),
    includedEpochOrdinals: includedEpochs.map((epoch) => epoch.ordinal),
    includeActive: args.includeActive,
    epochStatuses: includedEpochs.map((epoch) => ({
      ordinal: epoch.ordinal,
      status: epoch.status,
      closedAt: epoch.closedAt,
    })),
  },
  method: {
    winDefinition: "accepted_exact or normal_fuzzy from checkpoint flags; the first win finalizes the analyzed history",
    censoring: "lifecycle_status=running with no ended_at; no-win censored workers are excluded from later-win denominators",
    failedGateSafety: "a predicate is suppressed when a failed_gate_exact exists at or before its trigger checkpoint",
    savings: "recorded checkpoints and validation-time minutes strictly after the trigger checkpoint through the last recorded checkpoint",
    snapshot: "all SQLite reads ran in one read-only transaction",
  },
  sourceSummary: {
    workers: workerRecords.length,
    workersWithCheckpoints: workerRecords.filter((worker) => worker.attempts > 0).length,
    checkpoints: checkpointRows.length,
    piWorkerSessions: sessionRows.length,
    lifecycleCounts,
    censoredNoWinWorkers: workerRecords.filter((worker) => worker.isCensored && !worker.hasWin).length,
    terminalNoWinDecisionUniverse: terminalNoWinUniverse.length,
    postWinCheckpoints,
  },
  scoreSemantics,
  scoreBuckets: scoreBuckets.map((bucket) => ({
    attempt: bucket.attempt,
    eligibleWorkers: bucket.eligibleWorkers,
    finiteScores: bucket.finiteScores,
    boundaries: bucket.boundaries,
    median: bucket.median,
  })),
  signalSupport: {
    minimumFailureSignalSupport: FAILURE_SIGNAL_MIN_SUPPORT,
    statuses: statusSignals.support,
    failureCategories: failureSignals.support,
  },
  predicateDefinitions: definitions,
  predicateRows: sortedPredicateRows,
  frontierRows,
  topFrontierRows,
};

const mainRows = sortedPredicateRows.filter((row) => row.category !== "score_proximity");
const proximityRows = sortedPredicateRows.filter((row) => row.category === "score_proximity");
const rawBaseline4 = predicateRows.find((row) => row.key === "raw_no_win_after_4");
const rawBaseline5 = predicateRows.find((row) => row.key === "raw_no_win_after_5");
const safeBaseline4 = predicateRows.find((row) => row.key === "no_win_after_4");
const safeBaseline5 = predicateRows.find((row) => row.key === "no_win_after_5");
const baselineNote = rawBaseline4 && rawBaseline5 && safeBaseline4 && safeBaseline5
  ? `Raw comparison rows give ${fmtPct(rawBaseline4.laterWinRatePct)} after four no-win attempts and ${fmtPct(rawBaseline5.laterWinRatePct)} after five, reproducing the approximately 5.1% and 0.4% reference values. Deployable rows with the mandatory failed-gate safety guard give ${fmtPct(safeBaseline4.laterWinRatePct)} and ${fmtPct(safeBaseline5.laterWinRatePct)}, respectively.`
  : "The requested four/five-attempt baseline rows were not both observable in this snapshot.";
const dominantRows = sortedPredicateRows.filter((row) => row.deployable && row.dominatesAttemptBaselines.length > 0);
const bestEfficiencyNonBaseline = frontierRows
  .filter((row) => row.winsLost > 0 && !row.category.startsWith("attempt_count"))
  .slice()
  .sort((left, right) => (right.minutesSavedPerWinLost ?? 0) - (left.minutesSavedPerWinLost ?? 0))[0] ?? null;
const scoreAfter1Low = predicateRows.find((row) => row.key === "score_after_1_q1");
const scoreAfter1Near = predicateRows.find((row) => row.key === "score_after_1_near_match");
const zeroProgress2 = predicateRows.find((row) => row.key === "zero_progress_after_2");
const stagnant3 = predicateRows.find((row) => row.key === "stagnant_pair_at_3");
const failureSupportRows = failureSignals.support
  .slice()
  .sort((left, right) => right.atRisk - left.atRisk || left.throughAttempt - right.throughAttempt)
  .slice(0, 12);

const markdown = `# Early-Kill Signal Analysis

Generated: \`${generatedAt}\`

Run: \`${runId}\`<br>
Epochs: ${report.scope.minEpoch}–${report.scope.maxEpoch} (${args.includeActive ? "active epochs included" : "closed epochs only"})

## Method

This is a worker-level, read-only snapshot of \`${dbPath}\`. All SQLite reads ran inside one transaction. A win is the first checkpoint classified as \`accepted_exact\` or \`normal_fuzzy\` using the same flag logic as \`analyze-fresh-tool-distribution.mjs\`; later checkpoints do not change outcome attribution. A worker is censored when \`lifecycle_status\` is \`running\` and \`ended_at\` is absent. Censored no-win workers remain in trigger and savings counts but are excluded from later-win denominators.

Every deployable predicate is gated by the repair safety rule: it cannot trigger if the worker has a \`failed_gate_exact\` at or before the decision checkpoint. A later failed-gate exact is not retroactively observable. Raw attempt baselines are retained only to reproduce historical comparison rates and are not placed on the deployable frontier. Attempts saved are recorded checkpoints strictly after the trigger. Worker-minutes saved run from the trigger checkpoint's \`validation_time\` to the worker's last recorded checkpoint time.

The “terminal no-win share” is the fraction of outcome-known, safety-eligible workers at that predicate's trigger that the predicate selects. The machine-readable stats also include each row's share of a fixed ${terminalNoWinUniverse.length}-worker first-decision universe.

## Score Semantics

Higher scores are better, exact is 100, and \`delta = new_score - old_score\`. In this snapshot, new scores span ${fmt(scoreSemantics.newScore.min, 3)} to ${fmt(scoreSemantics.newScore.max, 3)}; ${scoreSemantics.deltaConsistency.consistentRows}/${scoreSemantics.deltaConsistency.comparableRows} rows with all three fields agree with that delta identity, and ${scoreSemantics.oldScoreBaselineConsistency.consistentRows}/${scoreSemantics.oldScoreBaselineConsistency.comparableRows} scored rows have \`old_score\` equal to the worker's fixed starting baseline. “Zero progress” means no numeric \`new_score\` in the prefix exceeds that baseline; a missing score does not count as progress. A pairwise plateau means the best of the baseline and scored attempts does not increase at the current attempt.

${markdownTable(
  ["Worker state", "Attempt", "Old", "New", "Delta", "Improved flag", "Kind"],
  scoreSemantics.sanityRows.map((row) => [
    row.workerStateId,
    row.attempt,
    fmt(row.oldScore, 3),
    fmt(row.newScore, 3),
    fmt(row.delta, 3),
    row.improvedOverBaseline ? "yes" : "no",
    row.kind,
  ]),
)}

## Pareto Frontier

A row is on the frontier when no other evaluated predicate loses no more wins while saving at least as many worker-minutes, with one strict improvement. Efficiency is guarded at zero wins lost: \`∞\` means positive savings with no observed terminal win loss. E/F is exact/fuzzy first wins.

${predicateTable(frontierRows)}

## Main Predicate Table

Sorted by wins lost ascending, then worker-minutes saved descending. Failure-status and reason predicates are included only with at least ${FAILURE_SIGNAL_MIN_SUPPORT} triggering workers.

${predicateTable(mainRows)}

## Score Proximity Buckets

Buckets use the best of the starting baseline and observed \`new_score\` values among safe no-win workers at each decision. Values below ${fmt(NEAR_MATCH_SCORE, 1)} are split at observed quintile boundaries; missing scores and near matches have dedicated buckets.

${predicateTable(proximityRows)}

## Failure-Mode Support

Failure reasons are parsed from \`failure_reasons_json\` and normalized into stable categories before worker-level prefix counting. Only categories/statuses with at least ${FAILURE_SIGNAL_MIN_SUPPORT} triggering workers enter the predicate table; the largest reason cohorts are shown here for auditability.

${markdownTable(
  ["Through attempt", "Failure category", "Safe no-win workers"],
  failureSupportRows.map((row) => [row.throughAttempt, row.category, row.atRisk]),
)}

## Frontier Callouts

${topFrontierRows.length ? topFrontierRows.map((row, index) => `${index + 1}. **${markdownEscape(row.label)}** — ${row.atRisk} workers, ${row.winsLost} wins lost (${row.laterExactWins} exact/${row.laterFuzzyWins} fuzzy), ${fmt(row.workerMinutesSaved, 1)} worker-minutes and ${row.attemptsSaved} attempts saved.`).join("\n") : "No supported frontier rows."}

${dominantRows.length ? `Predicates that strictly save more minutes with no more wins lost than at least one attempt baseline: ${dominantRows.map((row) => `**${markdownEscape(row.label)}**`).join(", ")}.` : "No richer predicate strictly dominates an attempt-count baseline on worker-minutes and wins lost in this snapshot."}

${bestEfficiencyNonBaseline ? `The strongest non-baseline frontier efficiency is **${markdownEscape(bestEfficiencyNonBaseline.label)}** at ${fmt(bestEfficiencyNonBaseline.minutesSavedPerWinLost, 1)} minutes saved per win lost, but it saves only ${fmt(bestEfficiencyNonBaseline.workerMinutesSaved, 1)} total worker-minutes.` : ""}

${scoreAfter1Low && scoreAfter1Near ? `Score proximity is predictive but not in the naive direction for any-win conversion: the lowest post-attempt-1 bucket converts later at ${fmtPct(scoreAfter1Low.laterWinRatePct)}, versus ${fmtPct(scoreAfter1Near.laterWinRatePct)} for the ≥${fmt(NEAR_MATCH_SCORE, 1)} near-match bucket. Near matches skew toward later exact wins (${scoreAfter1Near.laterExactWins}/${scoreAfter1Near.winsLost}); low-score workers have more room to earn a fuzzy win.` : ""}

${zeroProgress2 && stagnant3 ? `The richer progress rules narrow the cohort without beating their same-horizon baselines: zero progress after two attempts saves ${fmt(zeroProgress2.workerMinutesSaved, 1)} minutes for ${zeroProgress2.winsLost} lost wins, while the attempt-3 pairwise plateau saves ${fmt(stagnant3.workerMinutesSaved, 1)} minutes for ${stagnant3.winsLost} lost wins.` : ""}

## Attempt-Baseline Cross-Check

${baselineNote}

## Artifact Notes

- Workers: ${report.sourceSummary.workers}; checkpoints: ${report.sourceSummary.checkpoints}; censored no-win workers: ${report.sourceSummary.censoredNoWinWorkers}.
- Epoch 26 contributes ${report.sourceSummary.postWinCheckpoints} legacy checkpoints recorded after a first canonical win. First-win outcome attribution ignores them, while the requested literal last-checkpoint savings metric retains them.
- The active epoch is included when selected by the CLI; its unfinished workers are censored, not treated as failures.
- Companion stats: \`${statsPath}\`.
- Row-level audit dataset: \`${datasetPath}\`.
`;

const csv = [
  datasetColumns.map(csvEscape).join(","),
  ...datasetRows.map((row) => datasetColumns.map((column) => csvEscape(row[column])).join(",")),
].join("\n");

writeFileSync(markdownPath, markdown);
writeFileSync(statsPath, `${JSON.stringify(report, null, 2)}\n`);
writeFileSync(datasetPath, `${csv}\n`);

console.log(
  JSON.stringify(
    {
      markdownPath,
      statsPath,
      datasetPath,
      runId,
      includedEpochs: report.scope.includedEpochOrdinals,
      workers: report.sourceSummary.workers,
      censoredNoWinWorkers: report.sourceSummary.censoredNoWinWorkers,
      attemptBaselines: attemptBaselineRows.map((row) => ({
        key: row.key,
        laterWinRatePct: row.laterWinRatePct,
        winsLost: row.winsLost,
        workerMinutesSaved: row.workerMinutesSaved,
      })),
      rawAttemptBaselines: rawAttemptBaselineRows.map((row) => ({
        key: row.key,
        laterWinRatePct: row.laterWinRatePct,
        winsLost: row.winsLost,
        workerMinutesSaved: row.workerMinutesSaved,
      })),
      topFrontier: topFrontierRows.map((row) => ({
        key: row.key,
        atRisk: row.atRisk,
        winsLost: row.winsLost,
        attemptsSaved: row.attemptsSaved,
        workerMinutesSaved: row.workerMinutesSaved,
      })),
    },
    null,
    2,
  ),
);
