import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const dbPath = "projects/melee/state/orchestrator.sqlite";
const outDir = "analysis/reports";
const generatedAt = new Date().toISOString();
const today = generatedAt.slice(0, 10);
const EPSILON = 0.000001;

function parseArgs(argv) {
  const args = {
    runId: null,
    minEpoch: null,
    maxEpoch: null,
    includeActive: false,
    thinkingLevel: null,
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
    } else if ((arg === "--thinking-level" || arg === "--thinking") && argv[index + 1]) {
      const level = normalizeThinkingLevel(argv[index + 1]);
      args.thinkingLevel = level === "all" ? null : level;
      index += 1;
    } else if (arg === "--out" && argv[index + 1]) {
      args.out = argv[index + 1];
      index += 1;
    }
  }
  return args;
}

function number(value) {
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

function normalizeThinkingLevel(value) {
  if (value == null) return null;
  const normalized = String(value).trim().toLowerCase().replaceAll("_", "-");
  return normalized === "x-high" ? "xhigh" : normalized;
}

function pct(numerator, denominator, digits = 1) {
  if (!denominator) return null;
  return Number(((100 * numerator) / denominator).toFixed(digits));
}

function fmt(value, digits = 1) {
  if (value == null || !Number.isFinite(Number(value))) return "";
  return Number(value).toFixed(digits);
}

function fmtPct(value) {
  return value == null ? "" : `${fmt(value, 1)}%`;
}

function fmtMin(value) {
  return value == null ? "" : `${fmt(value, 1)} min`;
}

function average(values) {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return null;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function quantile(values, q) {
  const sorted = values.filter((value) => Number.isFinite(value)).slice().sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const index = (sorted.length - 1) * q;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function sum(values) {
  return values.filter((value) => Number.isFinite(value)).reduce((total, value) => total + value, 0);
}

function addCounts(target, source) {
  for (const [key, value] of Object.entries(source)) {
    target[key] = (target[key] ?? 0) + value;
  }
}

function htmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function parseTranscript(path) {
  if (!path || !existsSync(path)) {
    return { exists: false, durationMin: null, tools: {}, advertisedTools: [], assistantMessages: 0 };
  }

  const tools = {};
  const advertisedTools = new Set();
  let firstTs = null;
  let lastTs = null;
  let assistantMessages = 0;

  for (const line of readFileSync(path, "utf8").split(/\n/)) {
    if (!line) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }

    const ts = parseTime(event.timestamp);
    if (ts != null) {
      if (firstTs == null) firstTs = ts;
      lastTs = ts;
    }

    if (event.type !== "message") continue;
    const message = event.message ?? {};
    const content = Array.isArray(message.content) ? message.content : [];

    if (message.role === "user" && advertisedTools.size === 0) {
      for (const item of content) {
        if (item?.type !== "text" || typeof item.text !== "string") continue;
        const match = item.text.match(/<available_tools[^>]*>([\s\S]*?)<\/available_tools>/);
        if (!match) continue;
        for (const toolMatch of match[1].matchAll(/<tool name="([^"]+)"/g)) {
          advertisedTools.add(toolMatch[1]);
        }
      }
    }

    if (message.role !== "assistant") continue;
    assistantMessages += 1;
    for (const item of content) {
      const name = item?.type === "toolCall" || item?.type === "tool_call" ? item.name : null;
      if (name) tools[name] = (tools[name] ?? 0) + 1;
    }
  }

  return {
    exists: true,
    durationMin: firstTs != null && lastTs != null ? (lastTs - firstTs) / 60000 : null,
    tools,
    advertisedTools: [...advertisedTools].sort(),
    assistantMessages,
  };
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

function summarizeValues(values) {
  return {
    count: values.length,
    total: Number(sum(values).toFixed(6)),
    average: average(values),
    median: quantile(values, 0.5),
    p75: quantile(values, 0.75),
    p90: quantile(values, 0.9),
    max: values.length ? Math.max(...values) : null,
  };
}

function cell(value, className = "") {
  return `<td${className ? ` class="${className}"` : ""}>${htmlEscape(value)}</td>`;
}

function table(headers, rows, emptyText = "No rows.") {
  return `<table><thead><tr>${headers.map((header) => `<th>${htmlEscape(header)}</th>`).join("")}</tr></thead><tbody>${rows.join("") || `<tr><td colspan="${headers.length}" class="muted">${htmlEscape(emptyText)}</td></tr>`}</tbody></table>`;
}

function latestCheckpointRunId(db) {
  const row = db
    .query(
      `
        SELECT session_id AS run_id, MAX(validation_time) AS last_validation
        FROM worker_checkpoints
        GROUP BY session_id
        ORDER BY MAX(validation_time) DESC
        LIMIT 1
      `,
    )
    .get();
  return row?.run_id == null ? null : String(row.run_id);
}

const args = parseArgs(process.argv.slice(2));
const db = new Database(dbPath, { readonly: true });
const runId = args.runId ?? latestCheckpointRunId(db);

if (!runId) {
  throw new Error("No checkpoint-backed run found.");
}

const allEpochs = db
  .query(
    `
      SELECT id, session_id, ordinal, status, admitted_count, finished_count,
             worker_pool_size, candidate_window, created_at, closed_at
      FROM epochs
      WHERE session_id = ?
      ORDER BY ordinal
    `,
  )
  .all(runId)
  .map((row) => ({
    id: String(row.id),
    runId: String(row.session_id),
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
const epochById = new Map(includedEpochs.map((epoch) => [epoch.id, epoch]));

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
    runId: String(row.session_id),
    epochId: String(row.epoch_id),
    epochOrdinal: Number(row.epoch_ordinal),
    epochTargetId: String(row.epoch_target_id),
    targetClaimId: String(row.target_claim_id),
    workerId: String(row.worker_id),
    targetKey: String(row.target_key),
    lifecycleStatus: String(row.lifecycle_status),
    workerSessionIdsJson: String(row.worker_session_ids_json ?? "[]"),
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
        et.unit,
        et.symbol,
        et.source_path,
        et.size,
        e.ordinal AS epoch_ordinal
      FROM worker_checkpoints wc
      JOIN worker_state ws ON ws.id = wc.worker_state_id
      JOIN epoch_targets et ON et.id = wc.epoch_target_id
      JOIN epochs e ON e.id = wc.epoch_id
      WHERE wc.epoch_id IN (${placeholders})
      ORDER BY wc.worker_state_id ASC, wc.attempt_index ASC, wc.validation_time ASC
    `,
  )
  .all(...includedEpochIds)
  .map((row) => ({
    id: String(row.id),
    runId: String(row.session_id),
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
    qaStatus: row.qa_status == null ? null : String(row.qa_status),
    validationStatus: String(row.validation_status),
    failureReasonsJson: String(row.failure_reasons_json ?? "[]"),
    lifecycleStatus: String(row.lifecycle_status),
    workerStartedAt: String(row.worker_started_at),
    workerStartedMs: parseTime(row.worker_started_at),
    workerEndedAt: row.worker_ended_at == null ? null : String(row.worker_ended_at),
    baselineScore: number(row.baseline_score),
    unit: String(row.unit ?? ""),
    symbol: String(row.symbol ?? ""),
    sourcePath: String(row.source_path ?? ""),
    size: number(row.size),
  }));

const allSessionRows = db
  .query(
    `
      SELECT run_id, target_claim_id, session_id, session_file, thinking_level, status, created_at
      FROM pi_sessions
      WHERE role = 'worker'
        AND run_id = ?
        AND target_claim_id IS NOT NULL
      ORDER BY created_at ASC
    `,
  )
  .all(runId)
  .map((row) => ({
    runId: String(row.run_id),
    targetClaimId: String(row.target_claim_id),
    sessionId: String(row.session_id),
    sessionFile: row.session_file == null ? null : String(row.session_file),
    thinkingLevel: row.thinking_level == null ? null : String(row.thinking_level),
    normalizedThinkingLevel: normalizeThinkingLevel(row.thinking_level),
    status: String(row.status),
    createdAt: String(row.created_at),
    createdMs: parseTime(row.created_at),
  }));

const sessionRows = args.thinkingLevel
  ? allSessionRows.filter((session) => session.normalizedThinkingLevel === args.thinkingLevel)
  : allSessionRows;

const sessionsByClaim = new Map();
for (const session of sessionRows) {
  const list = sessionsByClaim.get(session.targetClaimId) ?? [];
  list.push(session);
  sessionsByClaim.set(session.targetClaimId, list);
}

const checkpointRowsByWorker = new Map();
for (const checkpoint of checkpointRows) {
  const list = checkpointRowsByWorker.get(checkpoint.workerStateId) ?? [];
  list.push(checkpoint);
  checkpointRowsByWorker.set(checkpoint.workerStateId, list);
}

const transcriptCache = new Map();
function transcriptFor(session) {
  if (!session.sessionFile) return { exists: false, durationMin: null, tools: {}, advertisedTools: [], assistantMessages: 0 };
  if (!transcriptCache.has(session.sessionFile)) {
    transcriptCache.set(session.sessionFile, parseTranscript(session.sessionFile));
  }
  return transcriptCache.get(session.sessionFile);
}

function sessionsInWindow(targetClaimId, startMs, endMs) {
  return (sessionsByClaim.get(targetClaimId) ?? []).filter((session) => {
    if (session.createdMs == null) return false;
    const afterStart = startMs == null || session.createdMs > startMs;
    const beforeEnd = endMs == null || session.createdMs <= endMs + 120000;
    return afterStart && beforeEnd;
  });
}

const workerRowsToAnalyze = args.thinkingLevel
  ? workerRows.filter((worker) => sessionsInWindow(worker.targetClaimId, worker.startedMs, worker.endedMs).length > 0)
  : workerRows;

const excludedWorkersByThinkingLevel = workerRows.length - workerRowsToAnalyze.length;

const advertisedTools = new Set();
let parsedTranscriptSessions = 0;
let missingTranscriptSessions = 0;
let assignedSessionCount = 0;

function parseSessionTools(sessions) {
  const tools = {};
  let totalToolCalls = 0;
  let durationMin = 0;
  let parsedSessions = 0;
  for (const session of sessions) {
    const parsed = transcriptFor(session);
    if (parsed.exists) {
      parsedTranscriptSessions += 1;
      parsedSessions += 1;
      durationMin += parsed.durationMin ?? 0;
      addCounts(tools, parsed.tools);
      for (const tool of parsed.advertisedTools) advertisedTools.add(tool);
    } else if (session.sessionFile) {
      missingTranscriptSessions += 1;
    }
  }
  totalToolCalls = Object.values(tools).reduce((total, count) => total + count, 0);
  return { tools, totalToolCalls, durationMin, parsedSessions };
}

const attemptRecords = [];
const workerRecords = [];

for (const worker of workerRowsToAnalyze) {
  const checkpoints = (checkpointRowsByWorker.get(worker.id) ?? []).sort(
    (left, right) => left.attemptIndex - right.attemptIndex || left.validationMs - right.validationMs,
  );
  let previousBoundaryMs = worker.startedMs;
  let bestFuzzy = worker.baselineScore ?? -Infinity;
  let hadFuzzyWin = false;
  let firstWinAttempt = null;
  let firstWinKind = null;
  let firstWinScoreDelta = null;
  let firstWinElapsedMin = null;
  let firstExactAttempt = null;
  let firstExactElapsedMin = null;
  let firstExactScoreDelta = null;
  let firstFuzzyWinAttempt = null;
  let firstFuzzyWinElapsedMin = null;
  let firstFuzzyWinScoreDelta = null;
  let acceptedExact = false;
  const toolsThroughOutcome = {};
  const allTools = {};
  const workerAttemptRecords = [];

  for (const checkpoint of checkpoints) {
    const sessions = sessionsInWindow(worker.targetClaimId, previousBoundaryMs, checkpoint.validationMs);
    assignedSessionCount += sessions.length;
    const parsed = parseSessionTools(sessions);
    addCounts(allTools, parsed.tools);
    if (!firstWinAttempt) addCounts(toolsThroughOutcome, parsed.tools);

    const kind = checkpointKind(checkpoint);
    const baselineForGain = Number.isFinite(bestFuzzy) ? bestFuzzy : (checkpoint.oldScore ?? checkpoint.newScore ?? 0);
    const fuzzyNewBest = kind === "normal_fuzzy" && checkpoint.newScore != null && checkpoint.newScore > bestFuzzy + EPSILON;
    const fuzzyGain = fuzzyNewBest ? Math.max(0, checkpoint.newScore - baselineForGain) : 0;
    const winKind = kind === "accepted_exact" ? "accepted_exact" : fuzzyNewBest ? (hadFuzzyWin ? "later_fuzzy_new_best" : "first_fuzzy_new_best") : null;
    const producedWin = Boolean(winKind);
    const elapsedFromWorkerStartMin =
      worker.startedMs != null && checkpoint.validationMs != null ? (checkpoint.validationMs - worker.startedMs) / 60000 : null;
    const windowDurationMin =
      previousBoundaryMs != null && checkpoint.validationMs != null ? (checkpoint.validationMs - previousBoundaryMs) / 60000 : null;

    const record = {
      ...checkpoint,
      kind,
      producedWin,
      winKind,
      fuzzyNewBest,
      fuzzyGain,
      sessionsInWindow: sessions.length,
      parsedSessions: parsed.parsedSessions,
      durationMin: parsed.durationMin,
      elapsedFromWorkerStartMin,
      windowDurationMin,
      tools: parsed.tools,
      totalToolCalls: parsed.totalToolCalls,
    };

    attemptRecords.push(record);
    workerAttemptRecords.push(record);

    if (producedWin && !firstWinAttempt) {
      firstWinAttempt = record.humanAttempt;
      firstWinKind = winKind;
      firstWinElapsedMin = elapsedFromWorkerStartMin;
      firstWinScoreDelta =
        winKind === "accepted_exact"
          ? Math.max(0, 100 - (record.oldScore ?? record.newScore ?? 100))
          : fuzzyGain;
    }
    if (kind === "accepted_exact") {
      acceptedExact = true;
      if (firstExactElapsedMin == null) {
        firstExactAttempt = record.humanAttempt;
        firstExactElapsedMin = elapsedFromWorkerStartMin;
        firstExactScoreDelta = Math.max(0, 100 - (record.oldScore ?? record.newScore ?? 100));
      }
    }
    if (winKind && winKind !== "accepted_exact" && firstFuzzyWinElapsedMin == null) {
      firstFuzzyWinAttempt = record.humanAttempt;
      firstFuzzyWinElapsedMin = elapsedFromWorkerStartMin;
      firstFuzzyWinScoreDelta = fuzzyGain;
    }
    if (fuzzyNewBest && checkpoint.newScore != null) {
      bestFuzzy = checkpoint.newScore;
      hadFuzzyWin = true;
    }
    previousBoundaryMs = checkpoint.validationMs ?? previousBoundaryMs;
  }

  if (checkpoints.length === 0) {
    const sessions = sessionsInWindow(worker.targetClaimId, worker.startedMs, worker.endedMs);
    assignedSessionCount += sessions.length;
    const parsed = parseSessionTools(sessions);
    addCounts(allTools, parsed.tools);
    addCounts(toolsThroughOutcome, parsed.tools);
  }

  const wins = workerAttemptRecords.filter((record) => record.producedWin);
  const fuzzyWins = wins.filter((record) => record.winKind !== "accepted_exact");
  const observedRuntimeMin =
    worker.startedMs != null
      ? ((worker.endedMs ?? parseTime(generatedAt)) - worker.startedMs) / 60000
      : null;
  const isCensored = worker.lifecycleStatus === "running" && worker.endedMs == null;
  workerRecords.push({
    workerStateId: worker.id,
    runId: worker.runId,
    epochId: worker.epochId,
    epochOrdinal: worker.epochOrdinal,
    lifecycleStatus: worker.lifecycleStatus,
    targetClaimId: worker.targetClaimId,
    symbol: worker.symbol,
    unit: worker.unit,
    sourcePath: worker.sourcePath,
    attempts: checkpoints.length,
    hasCheckpoint: checkpoints.length > 0,
    firstCheckpointKind: workerAttemptRecords[0]?.kind ?? null,
    firstCheckpointElapsedMin: workerAttemptRecords[0]?.elapsedFromWorkerStartMin ?? null,
    checkpointKinds: workerAttemptRecords.map((record) => record.kind),
    hasWin: wins.length > 0,
    firstWinAttempt,
    firstWinKind,
    firstWinScoreDelta,
    firstWinElapsedMin,
    firstExactAttempt,
    firstExactElapsedMin,
    firstExactScoreDelta,
    firstFuzzyWinAttempt,
    firstFuzzyWinElapsedMin,
    firstFuzzyWinScoreDelta,
    acceptedExact,
    fuzzyWinCount: fuzzyWins.length,
    winCount: wins.length,
    totalFuzzyGain: fuzzyWins.reduce((total, record) => total + record.fuzzyGain, 0),
    toolsThroughOutcome,
    allTools,
    totalToolCalls: Object.values(allTools).reduce((total, count) => total + count, 0),
    workerRuntimeMin: worker.startedMs != null && worker.endedMs != null ? (worker.endedMs - worker.startedMs) / 60000 : null,
    observedRuntimeMin,
    isCensored,
  });
}

const winAttempts = attemptRecords.filter((record) => record.producedWin);
const fuzzyWinAttempts = winAttempts.filter((record) => record.winKind !== "accepted_exact");
const exactWinAttempts = winAttempts.filter((record) => record.winKind === "accepted_exact");
const failedGateExactAttempts = attemptRecords.filter((record) => record.kind === "failed_gate_exact");
const rejectedImprovementAttempts = attemptRecords.filter((record) => record.kind === "rejected_improvement");
const workersWithCheckpoints = workerRecords.filter((worker) => worker.hasCheckpoint);
const workerWins = workerRecords.filter((worker) => worker.hasWin);
const workerNoWins = workerRecords.filter((worker) => !worker.hasWin);
const exactWorkers = workerRecords.filter((worker) => worker.acceptedExact);
const fuzzyOnlyWorkers = workerRecords.filter((worker) => worker.hasWin && !worker.acceptedExact);

const allToolNames = [...new Set(workerRecords.flatMap((worker) => Object.keys(worker.allTools)))].sort();
const workerToolRows = allToolNames.map((tool) => {
  const used = workerRecords.filter((worker) => worker.toolsThroughOutcome[tool] > 0);
  const notUsed = workerRecords.filter((worker) => !(worker.toolsThroughOutcome[tool] > 0));
  const winUsed = used.filter((worker) => worker.hasWin);
  const winNotUsed = notUsed.filter((worker) => worker.hasWin);
  const exactUsed = used.filter((worker) => worker.acceptedExact);
  const fuzzyOnlyUsed = used.filter((worker) => worker.hasWin && !worker.acceptedExact);
  const noWinUsed = used.filter((worker) => !worker.hasWin);
  const successIfUsed = pct(winUsed.length, used.length);
  const successIfNot = pct(winNotUsed.length, notUsed.length);
  return {
    tool,
    workersUsed: used.length,
    workerUseRate: pct(used.length, workerRecords.length),
    totalCallsThroughOutcome: used.reduce((total, worker) => total + (worker.toolsThroughOutcome[tool] ?? 0), 0),
    totalCallsAll: workerRecords.reduce((total, worker) => total + (worker.allTools[tool] ?? 0), 0),
    winWorkers: winUsed.length,
    exactWorkers: exactUsed.length,
    fuzzyOnlyWorkers: fuzzyOnlyUsed.length,
    noWinWorkers: noWinUsed.length,
    adoptionWin: pct(winUsed.length, workerWins.length),
    adoptionNoWin: pct(noWinUsed.length, workerNoWins.length),
    adoptionExact: pct(exactUsed.length, exactWorkers.length),
    adoptionFuzzyOnly: pct(fuzzyOnlyUsed.length, fuzzyOnlyWorkers.length),
    successIfUsed,
    successIfNot,
    successLift: successIfUsed == null || successIfNot == null ? null : Number((successIfUsed - successIfNot).toFixed(1)),
    averageFirstWinDeltaWhenUsed: average(winUsed.map((worker) => worker.firstWinScoreDelta).filter((value) => value != null)),
    totalFuzzyGainWhenUsed: used.reduce((total, worker) => total + worker.totalFuzzyGain, 0),
  };
});

const attemptToolRows = allToolNames.map((tool) => {
  const used = attemptRecords.filter((record) => record.tools[tool] > 0);
  const notUsed = attemptRecords.filter((record) => !(record.tools[tool] > 0));
  const winsUsed = used.filter((record) => record.producedWin);
  const winsNotUsed = notUsed.filter((record) => record.producedWin);
  const exactUsed = used.filter((record) => record.winKind === "accepted_exact");
  const fuzzyUsed = used.filter((record) => record.winKind && record.winKind !== "accepted_exact");
  const failedExactUsed = used.filter((record) => record.kind === "failed_gate_exact");
  const winRateUsed = pct(winsUsed.length, used.length);
  const winRateNot = pct(winsNotUsed.length, notUsed.length);
  return {
    tool,
    attemptsUsed: used.length,
    attemptUseRate: pct(used.length, attemptRecords.length),
    totalCalls: used.reduce((total, record) => total + (record.tools[tool] ?? 0), 0),
    winAttempts: winsUsed.length,
    fuzzyWinAttempts: fuzzyUsed.length,
    exactWinAttempts: exactUsed.length,
    failedGateExactAttempts: failedExactUsed.length,
    winRateUsed,
    winRateNot,
    winRateLift: winRateUsed == null || winRateNot == null ? null : Number((winRateUsed - winRateNot).toFixed(1)),
    averageFuzzyGainWhenUsedOnWin: average(fuzzyUsed.map((record) => record.fuzzyGain)),
  };
});

function summarizeAttemptTiming(records) {
  return {
    elapsedFromWorkerStartMin: summarizeValues(records.map((record) => record.elapsedFromWorkerStartMin).filter((value) => Number.isFinite(value))),
    attemptNumber: summarizeValues(records.map((record) => record.humanAttempt).filter((value) => Number.isFinite(value))),
    transcriptDurationMin: summarizeValues(records.map((record) => record.durationMin).filter((value) => Number.isFinite(value))),
  };
}

function groupedBy(values, keyFn) {
  const groups = new Map();
  for (const value of values) {
    const key = keyFn(value);
    const list = groups.get(key) ?? [];
    list.push(value);
    groups.set(key, list);
  }
  return groups;
}

function terminalDenominator(laterWins, noLaterWins) {
  return laterWins + noLaterWins;
}

const timingSummary = {
  firstWinMin: summarizeValues(workerWins.map((worker) => worker.firstWinElapsedMin).filter((value) => Number.isFinite(value))),
  acceptedExactMin: summarizeValues(exactWorkers.map((worker) => worker.firstExactElapsedMin).filter((value) => Number.isFinite(value))),
  fuzzyImprovementMin: summarizeValues(
    workerRecords.map((worker) => worker.firstFuzzyWinElapsedMin).filter((value) => Number.isFinite(value)),
  ),
  failedGateExactAttempts: summarizeAttemptTiming(failedGateExactAttempts),
  rejectedImprovementAttempts: summarizeAttemptTiming(rejectedImprovementAttempts),
};

function buildAttemptKillRows(workers) {
  const maxAttempts = Math.max(0, ...workers.map((worker) => worker.attempts));
  const thresholds = Array.from({ length: Math.min(maxAttempts, 8) }, (_, index) => index + 1);
  return thresholds.map((threshold) => {
    const reachedNoWin = workers.filter(
      (worker) => worker.attempts >= threshold && (worker.firstWinAttempt == null || worker.firstWinAttempt > threshold),
    );
    const laterWins = reachedNoWin.filter((worker) => worker.firstWinAttempt != null && worker.firstWinAttempt > threshold);
    const noLaterWins = reachedNoWin.filter((worker) => !worker.hasWin && !worker.isCensored);
    const censored = reachedNoWin.filter((worker) => !worker.hasWin && worker.isCensored);
    const denominator = terminalDenominator(laterWins.length, noLaterWins.length);
    return {
      thresholdAttempts: threshold,
      reachedNoWin: reachedNoWin.length,
      laterWins: laterWins.length,
      noLaterWins: noLaterWins.length,
      censored: censored.length,
      laterWinRate: pct(laterWins.length, denominator),
      exactLaterWins: laterWins.filter((worker) => worker.acceptedExact).length,
      fuzzyOnlyLaterWins: laterWins.filter((worker) => worker.hasWin && !worker.acceptedExact).length,
      shareOfWorkers: pct(reachedNoWin.length, workers.length),
    };
  });
}

function buildTimeKillRows(workers) {
  const thresholds = [10, 15, 20, 25, 30, 40, 50, 60];
  return thresholds.map((threshold) => {
    const reachedNoWin = workers.filter((worker) => {
      if (worker.firstWinElapsedMin != null) return worker.firstWinElapsedMin > threshold;
      return (worker.observedRuntimeMin ?? 0) >= threshold;
    });
    const laterWins = reachedNoWin.filter((worker) => worker.firstWinElapsedMin != null && worker.firstWinElapsedMin > threshold);
    const noLaterWins = reachedNoWin.filter((worker) => !worker.hasWin && !worker.isCensored);
    const censored = reachedNoWin.filter((worker) => !worker.hasWin && worker.isCensored);
    const denominator = terminalDenominator(laterWins.length, noLaterWins.length);
    return {
      thresholdMin: threshold,
      reachedNoWin: reachedNoWin.length,
      laterWins: laterWins.length,
      noLaterWins: noLaterWins.length,
      censored: censored.length,
      laterWinRate: pct(laterWins.length, denominator),
      exactLaterWins: laterWins.filter((worker) => worker.acceptedExact).length,
      fuzzyOnlyLaterWins: laterWins.filter((worker) => worker.hasWin && !worker.acceptedExact).length,
      shareOfWorkers: pct(reachedNoWin.length, workers.length),
    };
  });
}

function buildFirstCheckpointSignalRows(workers) {
  const checkpointWorkers = workers.filter((worker) => worker.firstCheckpointKind != null);
  const groups = [...groupedBy(checkpointWorkers, (worker) => worker.firstCheckpointKind).entries()];
  return groups
    .map(([kind, rows]) => {
      const wins = rows.filter((worker) => worker.hasWin);
      const exact = rows.filter((worker) => worker.acceptedExact);
      const terminalRows = rows.filter((worker) => !worker.isCensored);
      return {
        kind,
        workers: rows.length,
        shareOfCheckpointWorkers: pct(rows.length, checkpointWorkers.length),
        eventualWins: wins.length,
        eventualWinRate: pct(wins.length, terminalRows.length),
        exactWins: exact.length,
        medianFirstCheckpointMin: quantile(
          rows.map((worker) => worker.firstCheckpointElapsedMin).filter((value) => Number.isFinite(value)),
          0.5,
        ),
        medianFirstWinMin: quantile(
          wins.map((worker) => worker.firstWinElapsedMin).filter((value) => Number.isFinite(value)),
          0.5,
        ),
        censored: rows.filter((worker) => worker.isCensored && !worker.hasWin).length,
      };
    })
    .sort((left, right) => right.workers - left.workers || String(left.kind).localeCompare(String(right.kind)));
}

function hasNoWinAfterAttempts(worker, threshold) {
  return worker.attempts >= threshold && (worker.firstWinAttempt == null || worker.firstWinAttempt > threshold);
}

function hasNoWinAfterMinutes(worker, threshold) {
  if (worker.firstWinElapsedMin != null) return worker.firstWinElapsedMin > threshold;
  return (worker.observedRuntimeMin ?? 0) >= threshold;
}

function hasNoCheckpointByMinutes(worker, threshold) {
  if (worker.firstCheckpointElapsedMin != null) return worker.firstCheckpointElapsedMin > threshold;
  return (worker.observedRuntimeMin ?? 0) >= threshold;
}

function summarizeCandidateKillSignal(workers, key, label, predicate) {
  const atRisk = workers.filter(predicate);
  const laterWins = atRisk.filter((worker) => worker.hasWin);
  const noLaterWins = atRisk.filter((worker) => !worker.hasWin && !worker.isCensored);
  const censored = atRisk.filter((worker) => !worker.hasWin && worker.isCensored);
  const denominator = terminalDenominator(laterWins.length, noLaterWins.length);
  return {
    key,
    label,
    atRisk: atRisk.length,
    laterWins: laterWins.length,
    noLaterWins: noLaterWins.length,
    censored: censored.length,
    laterWinRate: pct(laterWins.length, denominator),
    exactLaterWins: laterWins.filter((worker) => worker.acceptedExact).length,
    fuzzyOnlyLaterWins: laterWins.filter((worker) => worker.hasWin && !worker.acceptedExact).length,
    shareOfWorkers: pct(atRisk.length, workers.length),
  };
}

function buildCandidateKillSignalRows(workers) {
  const specs = [
    ["no_checkpoint_20m", "No checkpoint by 20 min", (worker) => hasNoCheckpointByMinutes(worker, 20)],
    ["no_checkpoint_30m", "No checkpoint by 30 min", (worker) => hasNoCheckpointByMinutes(worker, 30)],
    ["no_checkpoint_40m", "No checkpoint by 40 min", (worker) => hasNoCheckpointByMinutes(worker, 40)],
    ["no_win_1_attempt", "No win after 1 attempt", (worker) => hasNoWinAfterAttempts(worker, 1)],
    ["no_win_2_attempts", "No win after 2 attempts", (worker) => hasNoWinAfterAttempts(worker, 2)],
    ["no_win_3_attempts", "No win after 3 attempts", (worker) => hasNoWinAfterAttempts(worker, 3)],
    ["no_win_4_attempts", "No win after 4 attempts", (worker) => hasNoWinAfterAttempts(worker, 4)],
    ["no_win_30m", "No win by 30 min", (worker) => hasNoWinAfterMinutes(worker, 30)],
    ["no_win_40m", "No win by 40 min", (worker) => hasNoWinAfterMinutes(worker, 40)],
    ["no_win_50m", "No win by 50 min", (worker) => hasNoWinAfterMinutes(worker, 50)],
    ["first_no_selectable", "First checkpoint: no selectable win", (worker) => worker.firstCheckpointKind === "no_selectable_win"],
    ["first_rejected_improvement", "First checkpoint: rejected improvement", (worker) => worker.firstCheckpointKind === "rejected_improvement"],
    ["first_failed_gate_exact", "First checkpoint: failed-gate exact", (worker) => worker.firstCheckpointKind === "failed_gate_exact"],
    [
      "two_attempts_no_failed_exact",
      "No win after 2 attempts, no failed-gate exact yet",
      (worker) => hasNoWinAfterAttempts(worker, 2) && !worker.checkpointKinds.slice(0, 2).includes("failed_gate_exact"),
    ],
    [
      "two_attempts_all_no_selectable",
      "Two no-win attempts, both no-selectable",
      (worker) => hasNoWinAfterAttempts(worker, 2) && worker.checkpointKinds.slice(0, 2).every((kind) => kind === "no_selectable_win"),
    ],
    [
      "two_attempts_latest_no_selectable_or_rejected",
      "No win after 2 attempts, latest no-selectable/rejected",
      (worker) =>
        hasNoWinAfterAttempts(worker, 2) &&
        ["no_selectable_win", "rejected_improvement"].includes(worker.checkpointKinds[1]),
    ],
  ];

  return specs
    .map(([key, label, predicate]) => summarizeCandidateKillSignal(workers, key, label, predicate))
    .filter((row) => row.atRisk > 0)
    .sort((left, right) => {
      const leftRate = left.laterWinRate ?? Number.POSITIVE_INFINITY;
      const rightRate = right.laterWinRate ?? Number.POSITIVE_INFINITY;
      if (Math.abs(leftRate - rightRate) > 0.0001) return leftRate - rightRate;
      return right.atRisk - left.atRisk;
    });
}

const terminalWorkerRecords = workerRecords.filter((worker) => !worker.isCensored);
const killSignalSummary = {
  candidateHeuristics: buildCandidateKillSignalRows(workerRecords),
  candidateHeuristicsTerminalOnly: buildCandidateKillSignalRows(terminalWorkerRecords),
  attempts: buildAttemptKillRows(workerRecords),
  attemptsTerminalOnly: buildAttemptKillRows(terminalWorkerRecords),
  time: buildTimeKillRows(workerRecords),
  timeTerminalOnly: buildTimeKillRows(terminalWorkerRecords),
  firstCheckpoint: buildFirstCheckpointSignalRows(workerRecords),
  terminalWorkers: terminalWorkerRecords.length,
  censoredWorkers: workerRecords.length - terminalWorkerRecords.length,
};

const epochRows = includedEpochs.map((epoch) => {
  const workers = workerRecords.filter((worker) => worker.epochId === epoch.id);
  const attempts = attemptRecords.filter((attempt) => attempt.epochId === epoch.id);
  const wins = attempts.filter((attempt) => attempt.producedWin);
  const exactTiming = workers.map((worker) => worker.firstExactElapsedMin).filter((value) => Number.isFinite(value));
  const fuzzyTiming = workers.map((worker) => worker.firstFuzzyWinElapsedMin).filter((value) => Number.isFinite(value));
  const firstWinTiming = workers.map((worker) => worker.firstWinElapsedMin).filter((value) => Number.isFinite(value));
  return {
    ordinal: epoch.ordinal,
    status: epoch.status,
    admittedCount: epoch.admittedCount,
    finishedCount: epoch.finishedCount,
    workers: workers.length,
    workersWithCheckpoints: workers.filter((worker) => worker.hasCheckpoint).length,
    workersWithWins: workers.filter((worker) => worker.hasWin).length,
    attempts: attempts.length,
    winAttempts: wins.length,
    exactWinAttempts: wins.filter((attempt) => attempt.winKind === "accepted_exact").length,
    fuzzyWinAttempts: wins.filter((attempt) => attempt.winKind !== "accepted_exact").length,
    failedGateExactAttempts: attempts.filter((attempt) => attempt.kind === "failed_gate_exact").length,
    firstWinMedianMin: quantile(firstWinTiming, 0.5),
    exactMedianMin: quantile(exactTiming, 0.5),
    fuzzyMedianMin: quantile(fuzzyTiming, 0.5),
    firstWinP90Min: quantile(firstWinTiming, 0.9),
    exactP90Min: quantile(exactTiming, 0.9),
    fuzzyP90Min: quantile(fuzzyTiming, 0.9),
    createdAt: epoch.createdAt,
    closedAt: epoch.closedAt,
  };
});

const distributionRows = workerToolRows
  .filter((tool) => tool.workersUsed > 0)
  .sort((left, right) => right.workersUsed - left.workersUsed || right.totalCallsAll - left.totalCallsAll);
const positiveLiftRows = workerToolRows
  .filter((tool) => tool.workersUsed >= 10 && tool.winWorkers >= 3 && tool.successLift != null)
  .sort((left, right) => right.successLift - left.successLift || right.winWorkers - left.winWorkers);
const exactSurfaceRows = workerToolRows
  .filter((tool) => tool.exactWorkers > 0)
  .sort((left, right) => right.exactWorkers - left.exactWorkers || right.workersUsed - left.workersUsed);
const attemptRows = attemptToolRows
  .filter((tool) => tool.attemptsUsed >= 10)
  .sort((left, right) => right.attemptsUsed - left.attemptsUsed || right.totalCalls - left.totalCalls);

const excludedEpochs = allEpochs.filter((epoch) => !includedEpochs.some((included) => included.id === epoch.id));
const report = {
  generatedAt,
  dbPath,
  runId,
  scope: {
    minEpoch: Math.min(...includedEpochs.map((epoch) => epoch.ordinal)),
    maxEpoch: Math.max(...includedEpochs.map((epoch) => epoch.ordinal)),
    includedEpochCount: includedEpochs.length,
    includedEpochOrdinals: includedEpochs.map((epoch) => epoch.ordinal),
    excludedEpochs: excludedEpochs.map((epoch) => ({
      ordinal: epoch.ordinal,
      status: epoch.status,
      closedAt: epoch.closedAt,
    })),
    includeActive: args.includeActive,
    thinkingLevel: args.thinkingLevel,
    excludedWorkersByThinkingLevel,
  },
  method:
    `Fresh session-flow analysis only. Pi worker sessions are assigned to the attempt window ending at each worker checkpoint. Worker-level tool rows use tools seen up to the first accepted exact or fuzzy new-best; no-win workers use all observed tools.${
      args.thinkingLevel
        ? ` Filtered to Pi worker sessions with thinking_level=${args.thinkingLevel}; workers without scoped sessions are excluded.`
        : ""
    }`,
  sourceSummary: {
    piWorkerSessionsBeforeThinkingFilter: allSessionRows.length,
    piWorkerSessionsForRun: sessionRows.length,
    assignedSessionCount,
    parsedTranscriptSessions,
    missingTranscriptSessions,
    advertisedTools: [...advertisedTools].sort(),
  },
  workerSummary: {
    workersStarted: workerRecords.length,
    workersWithCheckpoints: workersWithCheckpoints.length,
    workersWithWins: workerWins.length,
    workersWithWinsRate: pct(workerWins.length, workerRecords.length),
    exactWorkers: exactWorkers.length,
    fuzzyOnlyWorkers: fuzzyOnlyWorkers.length,
    noWinWorkers: workerNoWins.length,
    totalFuzzyGain: Number(workerRecords.reduce((total, worker) => total + worker.totalFuzzyGain, 0).toFixed(6)),
    firstWinDelta: summarizeValues(workerWins.map((worker) => worker.firstWinScoreDelta).filter((value) => value != null)),
  },
  timingSummary,
  killSignalSummary,
  attemptsSummary: {
    attempts: attemptRecords.length,
    attemptsWithToolCalls: attemptRecords.filter((record) => record.totalToolCalls > 0).length,
    winAttempts: winAttempts.length,
    fuzzyWinAttempts: fuzzyWinAttempts.length,
    exactWinAttempts: exactWinAttempts.length,
    failedGateExactAttempts: failedGateExactAttempts.length,
    rejectedImprovementAttempts: rejectedImprovementAttempts.length,
    fuzzyGain: summarizeValues(fuzzyWinAttempts.map((record) => record.fuzzyGain)),
  },
  epochRows,
  toolDistributionRows: distributionRows,
  positiveLiftRows,
  exactSurfaceRows,
  attemptToolRows: attemptRows,
  topWinningWorkers: workerRecords
    .filter((worker) => worker.hasWin)
    .sort((left, right) => right.totalFuzzyGain - left.totalFuzzyGain || (right.firstWinScoreDelta ?? 0) - (left.firstWinScoreDelta ?? 0))
    .slice(0, 24),
  fastestExactWorkers: workerRecords
    .filter((worker) => worker.firstExactElapsedMin != null)
    .sort((left, right) => left.firstExactElapsedMin - right.firstExactElapsedMin)
    .slice(0, 24),
  fastestFuzzyImprovementWorkers: workerRecords
    .filter((worker) => worker.firstFuzzyWinElapsedMin != null)
    .sort((left, right) => left.firstFuzzyWinElapsedMin - right.firstFuzzyWinElapsedMin)
    .slice(0, 24),
};

mkdirSync(outDir, { recursive: true });
const scopeSlug = args.thinkingLevel ? `${args.thinkingLevel}-` : "";
const defaultBase = `fresh-tool-distribution-${scopeSlug}${report.scope.includedEpochCount}-epoch-${today}`;
const htmlPath = resolve(args.out ?? `${outDir}/${defaultBase}.html`);
const jsonPath = htmlPath.replace(/\.html$/, ".stats.json");
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);

const epochTable = table(
  [
    "Epoch",
    "Status",
    "Workers",
    "With checkpoints",
    "Attempts",
    "Wins",
    "Exact",
    "Fuzzy",
    "Failed 100%",
    "First win med",
    "Exact med",
    "Improvement med",
    "Closed",
  ],
  epochRows.map((epoch) =>
    [
      cell(epoch.ordinal, "num"),
      cell(epoch.status),
      cell(epoch.workers, "num"),
      cell(epoch.workersWithCheckpoints, "num"),
      cell(epoch.attempts, "num"),
      cell(epoch.winAttempts, "num"),
      cell(epoch.exactWinAttempts, "num"),
      cell(epoch.fuzzyWinAttempts, "num"),
      cell(epoch.failedGateExactAttempts, "num"),
      cell(fmtMin(epoch.firstWinMedianMin), "num"),
      cell(fmtMin(epoch.exactMedianMin), "num"),
      cell(fmtMin(epoch.fuzzyMedianMin), "num"),
      cell(epoch.closedAt ?? ""),
    ].join("").replace(/^/, "<tr>").replace(/$/, "</tr>"),
  ),
);

const exactTimingTable = table(
  ["Epoch", "Symbol", "Source", "Attempt", "Minutes", "Delta to exact"],
  report.fastestExactWorkers.map((worker) =>
    [
      cell(worker.epochOrdinal, "num"),
      cell(worker.symbol),
      cell(worker.sourcePath, "mono"),
      cell(worker.firstExactAttempt, "num"),
      cell(fmtMin(worker.firstExactElapsedMin), "num"),
      cell(fmt(worker.firstExactScoreDelta, 3), "num"),
    ].join("").replace(/^/, "<tr>").replace(/$/, "</tr>"),
  ),
);

const improvementTimingTable = table(
  ["Epoch", "Symbol", "Source", "Attempt", "Minutes", "First gain"],
  report.fastestFuzzyImprovementWorkers.map((worker) =>
    [
      cell(worker.epochOrdinal, "num"),
      cell(worker.symbol),
      cell(worker.sourcePath, "mono"),
      cell(worker.firstFuzzyWinAttempt, "num"),
      cell(fmtMin(worker.firstFuzzyWinElapsedMin), "num"),
      cell(fmt(worker.firstFuzzyWinScoreDelta, 3), "num"),
    ].join("").replace(/^/, "<tr>").replace(/$/, "</tr>"),
  ),
);

const attemptKillTable = table(
  ["Kill after", "Workers at threshold", "Later wins missed", "No later win", "Censored", "Later-win rate", "Exact later", "Fuzzy later", "Worker share"],
  report.killSignalSummary.attempts.map((rowData) =>
    [
      cell(`${rowData.thresholdAttempts} no-win attempt${rowData.thresholdAttempts === 1 ? "" : "s"}`, "num"),
      cell(rowData.reachedNoWin, "num"),
      cell(rowData.laterWins, "num"),
      cell(rowData.noLaterWins, "num"),
      cell(rowData.censored, "num"),
      cell(fmtPct(rowData.laterWinRate), "num"),
      cell(rowData.exactLaterWins, "num"),
      cell(rowData.fuzzyOnlyLaterWins, "num"),
      cell(fmtPct(rowData.shareOfWorkers), "num"),
    ].join("").replace(/^/, "<tr>").replace(/$/, "</tr>"),
  ),
);

const candidateKillTable = table(
  ["Candidate signal", "Workers hit", "Later wins missed", "No later win", "Censored", "Later-win rate", "Exact later", "Fuzzy later", "Worker share"],
  report.killSignalSummary.candidateHeuristics.map((rowData) =>
    [
      cell(rowData.label),
      cell(rowData.atRisk, "num"),
      cell(rowData.laterWins, "num"),
      cell(rowData.noLaterWins, "num"),
      cell(rowData.censored, "num"),
      cell(fmtPct(rowData.laterWinRate), "num"),
      cell(rowData.exactLaterWins, "num"),
      cell(rowData.fuzzyOnlyLaterWins, "num"),
      cell(fmtPct(rowData.shareOfWorkers), "num"),
    ].join("").replace(/^/, "<tr>").replace(/$/, "</tr>"),
  ),
);

const timeKillTable = table(
  ["Kill after", "Workers at threshold", "Later wins missed", "No later win", "Censored", "Later-win rate", "Exact later", "Fuzzy later", "Worker share"],
  report.killSignalSummary.time.map((rowData) =>
    [
      cell(`${rowData.thresholdMin} min no win`, "num"),
      cell(rowData.reachedNoWin, "num"),
      cell(rowData.laterWins, "num"),
      cell(rowData.noLaterWins, "num"),
      cell(rowData.censored, "num"),
      cell(fmtPct(rowData.laterWinRate), "num"),
      cell(rowData.exactLaterWins, "num"),
      cell(rowData.fuzzyOnlyLaterWins, "num"),
      cell(fmtPct(rowData.shareOfWorkers), "num"),
    ].join("").replace(/^/, "<tr>").replace(/$/, "</tr>"),
  ),
);

const firstCheckpointSignalTable = table(
  ["First checkpoint", "Workers", "Share", "Eventual wins", "Win rate", "Exact wins", "Median first checkpoint", "Median first win", "Censored"],
  report.killSignalSummary.firstCheckpoint.map((rowData) =>
    [
      cell(rowData.kind, "mono"),
      cell(rowData.workers, "num"),
      cell(fmtPct(rowData.shareOfCheckpointWorkers), "num"),
      cell(rowData.eventualWins, "num"),
      cell(fmtPct(rowData.eventualWinRate), "num"),
      cell(rowData.exactWins, "num"),
      cell(fmtMin(rowData.medianFirstCheckpointMin), "num"),
      cell(fmtMin(rowData.medianFirstWinMin), "num"),
      cell(rowData.censored, "num"),
    ].join("").replace(/^/, "<tr>").replace(/$/, "</tr>"),
  ),
);

const distributionTable = table(
  ["Tool", "Workers", "Worker use", "Win workers", "Exact", "Fuzzy-only", "No-win", "Calls"],
  distributionRows.slice(0, 36).map((tool) =>
    [
      cell(tool.tool, "mono"),
      cell(tool.workersUsed, "num"),
      cell(fmtPct(tool.workerUseRate), "num"),
      cell(tool.winWorkers, "num"),
      cell(tool.exactWorkers, "num"),
      cell(tool.fuzzyOnlyWorkers, "num"),
      cell(tool.noWinWorkers, "num"),
      cell(tool.totalCallsAll, "num"),
    ].join("").replace(/^/, "<tr>").replace(/$/, "</tr>"),
  ),
);

const liftTable = table(
  ["Tool", "Workers", "Wins", "P(win | used)", "P(win | not)", "Lift", "Avg first-win delta", "Calls to outcome"],
  positiveLiftRows.slice(0, 30).map((tool) =>
    [
      cell(tool.tool, "mono"),
      cell(tool.workersUsed, "num"),
      cell(tool.winWorkers, "num"),
      cell(fmtPct(tool.successIfUsed), "num"),
      cell(fmtPct(tool.successIfNot), "num"),
      cell(`${fmt(tool.successLift, 1)} pts`, tool.successLift >= 10 ? "num pos" : "num"),
      cell(fmt(tool.averageFirstWinDeltaWhenUsed, 3), "num"),
      cell(tool.totalCallsThroughOutcome, "num"),
    ].join("").replace(/^/, "<tr>").replace(/$/, "</tr>"),
  ),
);

const exactTable = table(
  ["Tool", "Exact workers", "% of exacts", "Fuzzy-only", "Workers used", "Calls"],
  exactSurfaceRows.slice(0, 28).map((tool) =>
    [
      cell(tool.tool, "mono"),
      cell(tool.exactWorkers, "num"),
      cell(fmtPct(tool.adoptionExact), "num"),
      cell(tool.fuzzyOnlyWorkers, "num"),
      cell(tool.workersUsed, "num"),
      cell(tool.totalCallsAll, "num"),
    ].join("").replace(/^/, "<tr>").replace(/$/, "</tr>"),
  ),
);

const attemptTable = table(
  ["Tool", "Attempt windows", "Attempt use", "Win attempts", "Exact wins", "Fuzzy wins", "Failed 100%", "P(win | used)", "Calls"],
  attemptRows.slice(0, 36).map((tool) =>
    [
      cell(tool.tool, "mono"),
      cell(tool.attemptsUsed, "num"),
      cell(fmtPct(tool.attemptUseRate), "num"),
      cell(tool.winAttempts, "num"),
      cell(tool.exactWinAttempts, "num"),
      cell(tool.fuzzyWinAttempts, "num"),
      cell(tool.failedGateExactAttempts, "num"),
      cell(fmtPct(tool.winRateUsed), "num"),
      cell(tool.totalCalls, "num"),
    ].join("").replace(/^/, "<tr>").replace(/$/, "</tr>"),
  ),
);

const excludedText = excludedEpochs.length
  ? `Excluded epochs: ${excludedEpochs.map((epoch) => `${epoch.ordinal} (${epoch.status})`).join(", ")}.`
  : "No epochs excluded.";

const titleSuffix = args.thinkingLevel ? ` (${args.thinkingLevel})` : "";

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Fresh Tool Distribution${htmlEscape(titleSuffix)}</title>
<style>
:root{--bg:#f7f9fb;--ink:#172026;--muted:#65727c;--line:#d9e1e7;--panel:#fff;--green:#16803a;--teal:#087f83}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.45}
main{max-width:1240px;margin:0 auto;padding:30px 24px 56px}
header{border-bottom:1px solid var(--line);padding-bottom:18px;margin-bottom:22px}
h1{font-size:29px;margin:0 0 8px;letter-spacing:0;line-height:1.12}
h2{font-size:19px;margin:0 0 10px}
.subtitle,.muted{color:var(--muted)}
.band{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:18px;margin:16px 0}
.cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.card{background:#fbfcfd;border:1px solid var(--line);border-radius:8px;padding:14px;min-height:110px}
.ct{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted)}
.cv{font-size:27px;font-weight:720;margin-top:8px;font-variant-numeric:tabular-nums}
.cn{font-size:13px;color:var(--muted);margin-top:5px}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{border-bottom:1px solid var(--line);padding:8px 9px;text-align:left;vertical-align:top}
th{background:#f2f5f7;color:#32424d;font-weight:650}
.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.mono,code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}
code{background:#eef2f4;border:1px solid #dfe6ea;border-radius:4px;padding:1px 4px}
.callout{border-left:4px solid var(--teal);background:#eefafa;border-radius:6px;padding:12px 14px;margin:12px 0}
.pos{color:var(--green);font-weight:700}
@media(max-width:900px){main{padding:18px 14px 38px}.cards{grid-template-columns:1fr}}
</style>
</head>
<body>
<main>
  <header>
    <h1>Fresh Tool Distribution${htmlEscape(titleSuffix)}</h1>
    <div class="subtitle">Run <code>${htmlEscape(runId)}</code> · epochs ${report.scope.minEpoch}-${report.scope.maxEpoch} (${report.scope.includedEpochCount}${args.includeActive ? " scoped" : " closed"} epochs) · generated ${htmlEscape(generatedAt)}</div>
    <div class="callout">${htmlEscape(report.method)} ${htmlEscape(excludedText)}</div>
  </header>

  <section class="band">
    <h2>Headline</h2>
    <div class="cards">
      <section class="card"><div class="ct">Workers started</div><div class="cv">${report.workerSummary.workersStarted}</div><div class="cn">${report.workerSummary.workersWithCheckpoints} produced checkpoints</div></section>
      <section class="card"><div class="ct">Workers with wins</div><div class="cv">${report.workerSummary.workersWithWins}</div><div class="cn">${fmtPct(report.workerSummary.workersWithWinsRate)} of started workers</div></section>
      <section class="card"><div class="ct">Win attempts</div><div class="cv">${report.attemptsSummary.winAttempts}</div><div class="cn">${report.attemptsSummary.exactWinAttempts} exact, ${report.attemptsSummary.fuzzyWinAttempts} fuzzy</div></section>
      <section class="card"><div class="ct">Fuzzy gain</div><div class="cv">${fmt(report.workerSummary.totalFuzzyGain, 3)}</div><div class="cn">accepted score points from fuzzy new-bests</div></section>
      <section class="card"><div class="ct">Median exact time</div><div class="cv">${fmt(report.timingSummary.acceptedExactMin.median, 1)}</div><div class="cn">minutes from worker start to first accepted exact</div></section>
      <section class="card"><div class="ct">Median improvement time</div><div class="cv">${fmt(report.timingSummary.fuzzyImprovementMin.median, 1)}</div><div class="cn">minutes from worker start to first fuzzy new-best</div></section>
    </div>
  </section>

  <section class="band">
    <h2>Match And Improvement Timing</h2>
    <p class="muted">Timing is measured from each worker state's start time to the validation checkpoint that first produced the outcome. Exact matches and fuzzy improvements are separated because the first useful checkpoint can be either.</p>
    <div class="cards">
      <section class="card"><div class="ct">Exact matches</div><div class="cv">${report.timingSummary.acceptedExactMin.count}</div><div class="cn">median ${fmtMin(report.timingSummary.acceptedExactMin.median)} · p90 ${fmtMin(report.timingSummary.acceptedExactMin.p90)}</div></section>
      <section class="card"><div class="ct">Fuzzy improvements</div><div class="cv">${report.timingSummary.fuzzyImprovementMin.count}</div><div class="cn">median ${fmtMin(report.timingSummary.fuzzyImprovementMin.median)} · p90 ${fmtMin(report.timingSummary.fuzzyImprovementMin.p90)}</div></section>
      <section class="card"><div class="ct">Failed 100%</div><div class="cv">${report.timingSummary.failedGateExactAttempts.elapsedFromWorkerStartMin.count}</div><div class="cn">median ${fmtMin(report.timingSummary.failedGateExactAttempts.elapsedFromWorkerStartMin.median)}</div></section>
      <section class="card"><div class="ct">Rejected improvements</div><div class="cv">${report.timingSummary.rejectedImprovementAttempts.elapsedFromWorkerStartMin.count}</div><div class="cn">median ${fmtMin(report.timingSummary.rejectedImprovementAttempts.elapsedFromWorkerStartMin.median)}</div></section>
    </div>
    <h3>Fastest Exact Matches</h3>
    ${exactTimingTable}
    <h3>Fastest Fuzzy Improvements</h3>
    ${improvementTimingTable}
  </section>

  <section class="band">
    <h2>Early Kill Signals</h2>
    <p class="muted">A row means the worker reached that threshold without an accepted exact or fuzzy new-best yet. "Later wins missed" is the number of eventual wins that a kill at that threshold would have stopped. Censored rows are still running, so the later-win rate excludes them.</p>
    <h3>Candidate Heuristics</h3>
    ${candidateKillTable}
    <h3>Attempt Thresholds</h3>
    ${attemptKillTable}
    <h3>Elapsed-Time Thresholds</h3>
    ${timeKillTable}
    <h3>First Checkpoint Outcome</h3>
    ${firstCheckpointSignalTable}
  </section>

  <section class="band">
    <h2>Epoch Coverage</h2>
    ${epochTable}
  </section>

  <section class="band">
    <h2>Tool Distribution By Worker</h2>
    <p class="muted">Worker-level view. For winning workers this counts tools observed up to the first accepted exact or fuzzy new-best; for no-win workers it counts all observed tools.</p>
    ${distributionTable}
  </section>

  <section class="band">
    <h2>Tools Most Associated With Wins</h2>
    ${liftTable}
  </section>

  <section class="band">
    <h2>Exact-Match Surface</h2>
    ${exactTable}
  </section>

  <section class="band">
    <h2>Attempt Window Distribution</h2>
    <p class="muted">Attempt-level view. Tools are assigned to the Pi sessions ending immediately before each checkpoint.</p>
    ${attemptTable}
  </section>

  <section class="band">
    <h2>Method</h2>
    <p>Data source: <code>${htmlEscape(dbPath)}</code>, using <code>epochs</code>, <code>worker_state</code>, <code>worker_checkpoints</code>, <code>epoch_targets</code>, and <code>pi_sessions</code>. Checkpoint gates are canonical: failed-gate 100% exacts are tracked separately and do not count as wins.</p>
    <p class="muted">Pi worker sessions in run: ${report.sourceSummary.piWorkerSessionsBeforeThinkingFilter}. Scoped sessions: ${report.sourceSummary.piWorkerSessionsForRun}. Workers excluded by thinking-level scope: ${report.scope.excludedWorkersByThinkingLevel}. Parsed transcript sessions: ${report.sourceSummary.parsedTranscriptSessions}. Missing transcript sessions: ${report.sourceSummary.missingTranscriptSessions}. Companion stats: <code>${htmlEscape(jsonPath)}</code>.</p>
  </section>
</main>
</body>
</html>
`;

writeFileSync(htmlPath, html);
console.log(
  JSON.stringify(
    {
      htmlPath,
      jsonPath,
      runId,
      includedEpochs: report.scope.includedEpochOrdinals,
      workersStarted: report.workerSummary.workersStarted,
      attempts: report.attemptsSummary.attempts,
      wins: report.attemptsSummary.winAttempts,
    },
    null,
    2,
  ),
);
