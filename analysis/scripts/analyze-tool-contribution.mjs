import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const dbPath = "projects/melee/state/orchestrator.sqlite";
const outDir = "analysis/reports";
const generatedAt = new Date().toISOString();
const today = generatedAt.slice(0, 10);
const htmlPath = resolve(outDir, `tool-contribution-checkpoints-${today}.html`);
const jsonPath = resolve(outDir, `tool-contribution-checkpoints-${today}.stats.json`);
const EPSILON = 0.000001;

function parseArgs(argv) {
  const runIds = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--run" && argv[i + 1]) {
      runIds.push(argv[i + 1]);
      i += 1;
    }
  }
  return { runIds };
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

function pct(numerator, denominator, digits = 1) {
  if (!denominator) return null;
  return Number(((100 * numerator) / denominator).toFixed(digits));
}

function fmt(value, digits = 3) {
  if (value == null || !Number.isFinite(Number(value))) return "";
  return Number(value).toFixed(digits);
}

function fmtPct(value) {
  return value == null ? "" : `${fmt(value, 1)}%`;
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

function addCounts(target, source) {
  for (const [key, value] of Object.entries(source)) {
    target[key] = (target[key] ?? 0) + value;
  }
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
    total: Number(values.reduce((sum, value) => sum + value, 0).toFixed(6)),
    average: average(values),
    median: quantile(values, 0.5),
    p75: quantile(values, 0.75),
    p90: quantile(values, 0.9),
    max: values.length ? Math.max(...values) : null,
  };
}

function htmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function row(cells) {
  return `<tr>${cells.map((cell) => `<td${cell.className ? ` class="${cell.className}"` : ""}>${cell.html ?? htmlEscape(cell.value)}</td>`).join("")}</tr>`;
}

function table(headers, rows) {
  return `<table><thead><tr>${headers.map((header) => `<th>${htmlEscape(header)}</th>`).join("")}</tr></thead><tbody>${rows.join("") || `<tr><td colspan="${headers.length}" class="muted">No rows.</td></tr>`}</tbody></table>`;
}

function scoreCell(value) {
  return { value: fmt(value), className: "num" };
}

function toolRowsForWorkerSummary(toolRows, filter, limit = 24) {
  return toolRows
    .filter(filter)
    .sort((left, right) => {
      const lift = (right.successLift ?? -1) - (left.successLift ?? -1);
      if (Math.abs(lift) > 0.0001) return lift;
      return right.winWorkers - left.winWorkers;
    })
    .slice(0, limit);
}

const args = parseArgs(process.argv.slice(2));
const db = new Database(dbPath, { readonly: true });
const checkpointRunIds = db.query("SELECT DISTINCT session_id AS run_id FROM worker_checkpoints ORDER BY session_id").all().map((row) => String(row.run_id));
const runIds = args.runIds.length ? args.runIds : checkpointRunIds;
const placeholders = runIds.map(() => "?").join(", ");

if (runIds.length === 0) {
  throw new Error("No checkpoint-backed run IDs found.");
}

const availablePiRuns = db
  .query(
    `
      SELECT run_id, COUNT(*) AS sessions, COUNT(target_claim_id) AS with_claim, COUNT(DISTINCT target_claim_id) AS claims, MIN(created_at) AS first_seen, MAX(created_at) AS last_seen
      FROM pi_sessions
      WHERE role = 'worker'
      GROUP BY run_id
      ORDER BY MAX(created_at) DESC
    `,
  )
  .all()
  .map((row) => ({
    runId: String(row.run_id),
    sessions: Number(row.sessions ?? 0),
    withClaim: Number(row.with_claim ?? 0),
    claims: Number(row.claims ?? 0),
    firstSeen: row.first_seen == null ? null : String(row.first_seen),
    lastSeen: row.last_seen == null ? null : String(row.last_seen),
    checkpointBacked: checkpointRunIds.includes(String(row.run_id)),
  }));

const checkpointRows = db
  .query(
    `
      SELECT
        wc.*,
        ws.lifecycle_status,
        ws.started_at AS worker_started_at,
        ws.ended_at AS worker_ended_at,
        et.unit,
        et.symbol,
        et.source_path,
        et.size,
        e.ordinal AS epoch_ordinal
      FROM worker_checkpoints wc
      JOIN worker_state ws ON ws.id = wc.worker_state_id
      JOIN epoch_targets et ON et.id = wc.epoch_target_id
      JOIN epochs e ON e.id = wc.epoch_id
      WHERE wc.session_id IN (${placeholders})
      ORDER BY wc.worker_state_id ASC, wc.attempt_index ASC, wc.validation_time ASC
    `,
  )
  .all(...runIds)
  .map((row) => ({
    id: String(row.id),
    runId: String(row.session_id),
    workerStateId: String(row.worker_state_id),
    targetClaimId: String(row.target_claim_id),
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
    lifecycleStatus: String(row.lifecycle_status),
    workerStartedAt: String(row.worker_started_at),
    workerStartedMs: parseTime(row.worker_started_at),
    workerEndedAt: row.worker_ended_at == null ? null : String(row.worker_ended_at),
    unit: String(row.unit ?? ""),
    symbol: String(row.symbol ?? ""),
    sourcePath: String(row.source_path ?? ""),
    size: number(row.size),
    epochOrdinal: Number(row.epoch_ordinal),
  }));

const sessionRows = db
  .query(
    `
      SELECT run_id, target_claim_id, session_id, session_file, thinking_level, status, created_at
      FROM pi_sessions
      WHERE role = 'worker'
        AND run_id IN (${placeholders})
        AND target_claim_id IS NOT NULL
      ORDER BY created_at ASC
    `,
  )
  .all(...runIds)
  .map((row) => ({
    runId: String(row.run_id),
    targetClaimId: String(row.target_claim_id),
    sessionId: String(row.session_id),
    sessionFile: row.session_file == null ? null : String(row.session_file),
    thinkingLevel: row.thinking_level == null ? null : String(row.thinking_level),
    status: String(row.status),
    createdAt: String(row.created_at),
    createdMs: parseTime(row.created_at),
  }));

const transcriptCache = new Map();
function transcriptFor(session) {
  if (!session.sessionFile) return { exists: false, durationMin: null, tools: {}, advertisedTools: [], assistantMessages: 0 };
  if (!transcriptCache.has(session.sessionFile)) transcriptCache.set(session.sessionFile, parseTranscript(session.sessionFile));
  return transcriptCache.get(session.sessionFile);
}

const sessionsByKey = new Map();
for (const session of sessionRows) {
  const key = `${session.runId}:${session.targetClaimId}`;
  const list = sessionsByKey.get(key) ?? [];
  list.push(session);
  sessionsByKey.set(key, list);
}

const checkpointsByWorker = new Map();
for (const checkpoint of checkpointRows) {
  const list = checkpointsByWorker.get(checkpoint.workerStateId) ?? [];
  list.push(checkpoint);
  checkpointsByWorker.set(checkpoint.workerStateId, list);
}

const attemptRecords = [];
const workerRecords = [];
const advertisedTools = new Set();
let missingTranscriptSessions = 0;
let parsedTranscriptSessions = 0;

for (const [workerStateId, checkpoints] of checkpointsByWorker.entries()) {
  checkpoints.sort((left, right) => left.attemptIndex - right.attemptIndex || left.validationMs - right.validationMs);
  let previousBoundaryMs = checkpoints[0]?.workerStartedMs ?? null;
  let bestFuzzy = -Infinity;
  let hadFuzzyWin = false;
  const workerToolsThroughOutcome = {};
  const allWorkerTools = {};
  let firstWinAttempt = null;
  let firstWinKind = null;
  let firstWinScoreDelta = null;
  let acceptedExact = false;
  const workerAttemptRecords = [];

  for (const checkpoint of checkpoints) {
    const key = `${checkpoint.runId}:${checkpoint.targetClaimId}`;
    const sessions = (sessionsByKey.get(key) ?? []).filter((session) => {
      if (session.createdMs == null || checkpoint.validationMs == null) return false;
      const afterPrevious = previousBoundaryMs == null || session.createdMs > previousBoundaryMs;
      const beforeCheckpoint = session.createdMs <= checkpoint.validationMs + 120000;
      return afterPrevious && beforeCheckpoint;
    });
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
        for (const tool of parsed.advertisedTools) advertisedTools.add(tool);
        addCounts(tools, parsed.tools);
      } else if (session.sessionFile) {
        missingTranscriptSessions += 1;
      }
    }
    totalToolCalls = Object.values(tools).reduce((sum, value) => sum + value, 0);

    const kind = checkpointKind(checkpoint);
    const fuzzyNewBest = kind === "normal_fuzzy" && checkpoint.newScore != null && checkpoint.newScore > bestFuzzy + EPSILON;
    const fuzzyGain = fuzzyNewBest ? checkpoint.newScore - (Number.isFinite(bestFuzzy) ? bestFuzzy : (checkpoint.oldScore ?? checkpoint.newScore)) : 0;
    const winKind = kind === "accepted_exact" ? "accepted_exact" : fuzzyNewBest ? (hadFuzzyWin ? "later_fuzzy_new_best" : "first_fuzzy_new_best") : null;
    const producedWin = Boolean(winKind);
    const record = {
      ...checkpoint,
      kind,
      producedWin,
      winKind,
      fuzzyNewBest,
      fuzzyGain,
      sessionsInWindow: sessions.length,
      parsedSessions,
      durationMin,
      tools,
      totalToolCalls,
    };
    attemptRecords.push(record);
    workerAttemptRecords.push(record);
    addCounts(allWorkerTools, tools);

    if (!firstWinAttempt) addCounts(workerToolsThroughOutcome, tools);
    if (producedWin && !firstWinAttempt) {
      firstWinAttempt = record.humanAttempt;
      firstWinKind = winKind;
      firstWinScoreDelta = winKind === "accepted_exact" ? Math.max(0, 100 - (record.oldScore ?? record.newScore ?? 100)) : fuzzyGain;
    }
    if (kind === "accepted_exact") acceptedExact = true;
    if (fuzzyNewBest && checkpoint.newScore != null) {
      bestFuzzy = checkpoint.newScore;
      hadFuzzyWin = true;
    }
    previousBoundaryMs = checkpoint.validationMs ?? previousBoundaryMs;
  }

  const first = checkpoints[0];
  const wins = workerAttemptRecords.filter((record) => record.producedWin);
  const fuzzyWins = wins.filter((record) => record.winKind !== "accepted_exact");
  workerRecords.push({
    workerStateId,
    runId: first.runId,
    epochOrdinal: first.epochOrdinal,
    lifecycleStatus: first.lifecycleStatus,
    targetClaimId: first.targetClaimId,
    symbol: first.symbol,
    unit: first.unit,
    sourcePath: first.sourcePath,
    attempts: checkpoints.length,
    hasWin: wins.length > 0,
    firstWinAttempt,
    firstWinKind,
    firstWinScoreDelta,
    acceptedExact,
    fuzzyWinCount: fuzzyWins.length,
    winCount: wins.length,
    totalFuzzyGain: fuzzyWins.reduce((sum, record) => sum + record.fuzzyGain, 0),
    toolsThroughOutcome: firstWinAttempt ? workerToolsThroughOutcome : allWorkerTools,
    allTools: allWorkerTools,
  });
}

const winAttempts = attemptRecords.filter((record) => record.producedWin);
const fuzzyWinAttempts = winAttempts.filter((record) => record.winKind !== "accepted_exact");
const exactWinAttempts = winAttempts.filter((record) => record.winKind === "accepted_exact");
const failedGateExactAttempts = attemptRecords.filter((record) => record.kind === "failed_gate_exact");
const workerWins = workerRecords.filter((worker) => worker.hasWin);
const workerNoWins = workerRecords.filter((worker) => !worker.hasWin);
const exactWorkers = workerRecords.filter((worker) => worker.acceptedExact);
const fuzzyOnlyWorkers = workerRecords.filter((worker) => worker.hasWin && !worker.acceptedExact);

const allTools = [...new Set(attemptRecords.flatMap((record) => Object.keys(record.tools)))].sort();
const workerToolRows = allTools.map((tool) => {
  const used = workerRecords.filter((worker) => worker.toolsThroughOutcome[tool] > 0);
  const notUsed = workerRecords.filter((worker) => !(worker.toolsThroughOutcome[tool] > 0));
  const winUsed = used.filter((worker) => worker.hasWin);
  const winNotUsed = notUsed.filter((worker) => worker.hasWin);
  const exactUsed = used.filter((worker) => worker.acceptedExact);
  const fuzzyOnlyUsed = used.filter((worker) => worker.hasWin && !worker.acceptedExact);
  const totalCalls = used.reduce((sum, worker) => sum + (worker.toolsThroughOutcome[tool] ?? 0), 0);
  const successIfUsed = pct(winUsed.length, used.length);
  const successIfNot = pct(winNotUsed.length, notUsed.length);
  return {
    tool,
    workersUsed: used.length,
    totalCalls,
    winWorkers: winUsed.length,
    exactWorkers: exactUsed.length,
    fuzzyOnlyWorkers: fuzzyOnlyUsed.length,
    adoptionWin: pct(winUsed.length, workerWins.length),
    adoptionNoWin: pct(used.length - winUsed.length, workerNoWins.length),
    adoptionExact: pct(exactUsed.length, exactWorkers.length),
    adoptionFuzzyOnly: pct(fuzzyOnlyUsed.length, fuzzyOnlyWorkers.length),
    successIfUsed,
    successIfNot,
    successLift: successIfUsed == null || successIfNot == null ? null : Number((successIfUsed - successIfNot).toFixed(1)),
    averageFirstWinDeltaWhenUsed: average(winUsed.map((worker) => worker.firstWinScoreDelta).filter((value) => value != null)),
    totalFuzzyGainWhenUsed: used.reduce((sum, worker) => sum + worker.totalFuzzyGain, 0),
  };
});

const attemptToolRows = allTools.map((tool) => {
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
    totalCalls: used.reduce((sum, record) => sum + (record.tools[tool] ?? 0), 0),
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

const topWorkerRows = toolRowsForWorkerSummary(
  workerToolRows,
  (tool) => tool.workersUsed >= 10 && tool.winWorkers >= 3 && tool.successLift != null,
  30,
);
const negativeWorkerRows = workerToolRows
  .filter((tool) => tool.workersUsed >= 10 && tool.successLift != null)
  .sort((left, right) => left.successLift - right.successLift)
  .slice(0, 20);
const exactToolRows = workerToolRows
  .filter((tool) => tool.exactWorkers > 0)
  .sort((left, right) => right.exactWorkers - left.exactWorkers || right.workersUsed - left.workersUsed)
  .slice(0, 24);
const attemptRows = attemptToolRows
  .filter((tool) => tool.attemptsUsed >= 20)
  .sort((left, right) => right.winRateLift - left.winRateLift || right.winAttempts - left.winAttempts)
  .slice(0, 30);

const report = {
  generatedAt,
  dbPath,
  runIds,
  availablePiRuns,
  sourceSummary: {
    checkpointBackedRunIds: checkpointRunIds,
    piWorkerSessionsForRunIds: sessionRows.length,
    parsedTranscriptSessions,
    missingTranscriptSessions,
    advertisedTools: [...advertisedTools].sort(),
    legacyToolOutputNote:
      "Older Pi tool-output runs are present in .pi-sessions/worker and pi_sessions, but they predate target_claim_id/checkpoint wiring. Use analysis/scripts/analyze-pi-agent-tools.py plus analysis/scripts/render-pi-agent-tool-report.py to replay those legacy lease-level reports.",
  },
  method:
    "Checkpoint-backed analysis assigns worker Pi sessions to the attempt window ending at each worker_checkpoints row. A win is an accepted exact checkpoint or a selectable hard-gate-passing fuzzy checkpoint that is a new best for that worker. Failed-gate 100% exact checkpoints are tracked separately and do not count as wins.",
  attemptsSummary: {
    attempts: attemptRecords.length,
    attemptsWithToolCalls: attemptRecords.filter((record) => record.totalToolCalls > 0).length,
    winAttempts: winAttempts.length,
    fuzzyWinAttempts: fuzzyWinAttempts.length,
    exactWinAttempts: exactWinAttempts.length,
    failedGateExactAttempts: failedGateExactAttempts.length,
    fuzzyGain: summarizeValues(fuzzyWinAttempts.map((record) => record.fuzzyGain)),
  },
  workerSummary: {
    workers: workerRecords.length,
    workersWithWins: workerWins.length,
    workersWithWinsRate: pct(workerWins.length, workerRecords.length),
    exactWorkers: exactWorkers.length,
    fuzzyOnlyWorkers: fuzzyOnlyWorkers.length,
    noWinWorkers: workerNoWins.length,
    totalFuzzyGain: Number(workerRecords.reduce((sum, worker) => sum + worker.totalFuzzyGain, 0).toFixed(6)),
    firstWinDelta: summarizeValues(workerWins.map((worker) => worker.firstWinScoreDelta).filter((value) => value != null)),
  },
  toolWorkerRows: workerToolRows,
  toolAttemptRows: attemptToolRows,
  topWorkerRows,
  negativeWorkerRows,
  exactToolRows,
  attemptRows,
  topWinningWorkers: workerRecords
    .filter((worker) => worker.hasWin)
    .sort((left, right) => right.totalFuzzyGain - left.totalFuzzyGain || (right.firstWinScoreDelta ?? 0) - (left.firstWinScoreDelta ?? 0))
    .slice(0, 20),
};

mkdirSync(outDir, { recursive: true });
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);

const workerToolTable = table(
  ["Tool", "Workers used", "Win workers", "Exact workers", "P(win | used)", "P(win | not)", "Lift", "Avg first-win delta", "Calls"],
  topWorkerRows.map((tool) =>
    row([
      { value: tool.tool },
      { value: tool.workersUsed, className: "num" },
      { value: tool.winWorkers, className: "num" },
      { value: tool.exactWorkers, className: "num" },
      { value: fmtPct(tool.successIfUsed), className: "num" },
      { value: fmtPct(tool.successIfNot), className: "num" },
      { value: fmt(tool.successLift, 1), className: "num" },
      scoreCell(tool.averageFirstWinDeltaWhenUsed),
      { value: tool.totalCalls, className: "num" },
    ]),
  ),
);

const exactToolTable = table(
  ["Tool", "Exact workers", "Fuzzy-only workers", "Workers used", "Adoption in exacts", "Calls"],
  exactToolRows.map((tool) =>
    row([
      { value: tool.tool },
      { value: tool.exactWorkers, className: "num" },
      { value: tool.fuzzyOnlyWorkers, className: "num" },
      { value: tool.workersUsed, className: "num" },
      { value: fmtPct(tool.adoptionExact), className: "num" },
      { value: tool.totalCalls, className: "num" },
    ]),
  ),
);

const attemptToolTable = table(
  ["Tool", "Attempt windows", "Win attempts", "Fuzzy wins", "Exact wins", "Failed-gate exacts", "P(win | used)", "Lift", "Avg fuzzy gain"],
  attemptRows.map((tool) =>
    row([
      { value: tool.tool },
      { value: tool.attemptsUsed, className: "num" },
      { value: tool.winAttempts, className: "num" },
      { value: tool.fuzzyWinAttempts, className: "num" },
      { value: tool.exactWinAttempts, className: "num" },
      { value: tool.failedGateExactAttempts, className: "num" },
      { value: fmtPct(tool.winRateUsed), className: "num" },
      { value: fmt(tool.winRateLift, 1), className: "num" },
      scoreCell(tool.averageFuzzyGainWhenUsedOnWin),
    ]),
  ),
);

const negativeToolTable = table(
  ["Tool", "Workers used", "Win workers", "P(win | used)", "P(win | not)", "Lift", "Calls"],
  negativeWorkerRows.map((tool) =>
    row([
      { value: tool.tool },
      { value: tool.workersUsed, className: "num" },
      { value: tool.winWorkers, className: "num" },
      { value: fmtPct(tool.successIfUsed), className: "num" },
      { value: fmtPct(tool.successIfNot), className: "num" },
      { value: fmt(tool.successLift, 1), className: "num" },
      { value: tool.totalCalls, className: "num" },
    ]),
  ),
);

const sourceRows = table(
  ["Run ID", "Worker sessions", "Claims", "Checkpoint-backed", "First seen", "Last seen"],
  availablePiRuns.map((run) =>
    row([
      { value: run.runId },
      { value: run.sessions, className: "num" },
      { value: run.claims, className: "num" },
      { value: run.checkpointBacked ? "yes" : "legacy lease-level" },
      { value: run.firstSeen },
      { value: run.lastSeen },
    ]),
  ),
);

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Tool Contribution By Checkpoint Outcome</title>
<style>
:root{--bg:#f7f8f6;--ink:#172126;--muted:#607077;--line:#d8e0dd;--panel:#fff;--teal:#087f83;--green:#268b45;--red:#b23b3b}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.45}
main{max-width:1240px;margin:0 auto;padding:28px 24px 48px}header{border-bottom:1px solid var(--line);padding-bottom:18px;margin-bottom:22px}
h1{font-size:30px;line-height:1.1;margin:0 0 8px;letter-spacing:0}h2{font-size:20px;margin:0 0 10px}h3{font-size:15px;margin:18px 0 8px}
.subtitle,.small,.muted{color:var(--muted)}.band{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:18px;margin:16px 0}
.card-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:14px 0}.card{background:#fbfcfc;border:1px solid var(--line);border-radius:8px;padding:14px;min-height:112px}
.ct{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.04em}.cv{font-size:28px;font-weight:700;margin-top:8px;font-variant-numeric:tabular-nums}.cn{font-size:13px;color:var(--muted);margin-top:6px}
.callout{border-left:4px solid var(--teal);background:#f0faf9;padding:12px 14px;border-radius:6px;margin:12px 0}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{border-bottom:1px solid var(--line);padding:8px 9px;text-align:left;vertical-align:top}
th{background:#f1f4f3;color:#32434d;font-weight:650}.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
code{background:#eef1f0;border:1px solid #dde4e2;border-radius:4px;padding:1px 4px}@media(max-width:900px){.card-grid{grid-template-columns:1fr}main{padding:18px 14px 36px}}
</style>
</head>
<body>
<main>
  <header>
    <h1>Tool Contribution By Checkpoint Outcome</h1>
    <div class="subtitle">Generated ${htmlEscape(generatedAt)} from <code>${htmlEscape(dbPath)}</code>.</div>
    <div class="callout">${htmlEscape(report.method)}</div>
  </header>
  <section class="band">
    <h2>Headline</h2>
    <div class="card-grid">
      <section class="card"><div class="ct">Workers analyzed</div><div class="cv">${report.workerSummary.workers}</div><div class="cn">${fmtPct(report.workerSummary.workersWithWinsRate)} found an accepted exact or new fuzzy best</div></section>
      <section class="card"><div class="ct">Win attempts</div><div class="cv">${report.attemptsSummary.winAttempts}</div><div class="cn">${report.attemptsSummary.exactWinAttempts} exact, ${report.attemptsSummary.fuzzyWinAttempts} fuzzy new-best</div></section>
      <section class="card"><div class="ct">Fuzzy gain</div><div class="cv">${fmt(report.workerSummary.totalFuzzyGain)}</div><div class="cn">score points across worker new-bests</div></section>
      <section class="card"><div class="ct">Failed 100%</div><div class="cv">${report.attemptsSummary.failedGateExactAttempts}</div><div class="cn">tracked separately from wins</div></section>
    </div>
  </section>
  <section class="band">
    <h2>Tools Most Associated With Worker Wins</h2>
    <p class="muted">Worker-level view: tools used up to the first win, or through all attempts for no-win workers. Lift is correlational, but this is the closest read to "was this tool present before the useful checkpoint happened?"</p>
    ${workerToolTable}
  </section>
  <section class="band">
    <h2>Exact-Match Tool Surface</h2>
    ${exactToolTable}
  </section>
  <section class="band">
    <h2>Attempt Window Read</h2>
    <p class="muted">Attempt-level view: tools assigned to the Pi sessions that ended immediately before each checkpoint.</p>
    ${attemptToolTable}
  </section>
  <section class="band">
    <h2>Low Or Negative Lift</h2>
    ${negativeToolTable}
  </section>
  <section class="band">
    <h2>Found Tool Output Sources</h2>
    <p>The current checkpoint-backed run is ${runIds.map((runId) => `<code>${htmlEscape(runId)}</code>`).join(", ")}. Older Pi worker transcripts are still available, but those runs predate checkpoint-level target-claim wiring, so they are replayed with the legacy lease-level analyzer.</p>
    ${sourceRows}
    <p class="muted">Legacy replay scripts: <code>analysis/scripts/analyze-pi-agent-tools.py</code> and <code>analysis/scripts/render-pi-agent-tool-report.py</code>.</p>
    <p class="muted">Companion stats: <code>${htmlEscape(jsonPath)}</code>.</p>
  </section>
</main>
</body>
</html>
`;

writeFileSync(htmlPath, html);
console.log(JSON.stringify({ htmlPath, jsonPath, runIds, workers: workerRecords.length, attempts: attemptRecords.length }, null, 2));
