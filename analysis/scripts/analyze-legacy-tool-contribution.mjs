import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const dbPath = "projects/melee/state/orchestrator.sqlite";
const outDir = "analysis/reports";
const generatedAt = new Date().toISOString();
const today = generatedAt.slice(0, 10);
const EPSILON = 0.000001;

function parseArgs(argv) {
  const runIds = [];
  let outPrefix = null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--run" && argv[i + 1]) {
      runIds.push(argv[i + 1]);
      i += 1;
    } else if (argv[i] === "--out" && argv[i + 1]) {
      outPrefix = argv[i + 1];
      i += 1;
    }
  }
  return { runIds, outPrefix };
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

function fmt(value, digits = 1) {
  if (value == null || !Number.isFinite(Number(value))) return "";
  return Number(value).toFixed(digits);
}

function fmtPct(value) {
  return value == null ? "" : `${fmt(value, 1)}%`;
}

function htmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function table(headers, rows, empty = "No rows.") {
  return `<table><thead><tr>${headers.map((header) => `<th>${htmlEscape(header)}</th>`).join("")}</tr></thead><tbody>${rows.join("") || `<tr><td colspan="${headers.length}" class="muted">${htmlEscape(empty)}</td></tr>`}</tbody></table>`;
}

function cell(value, className = "") {
  return `<td${className ? ` class="${className}"` : ""}>${htmlEscape(value)}</td>`;
}

function resolveTranscriptPath(path) {
  if (!path) return null;
  if (existsSync(path)) return path;
  if (path.includes(".pi-sessions/worker/")) {
    const fallback = resolve(".pi-sessions/worker", basename(path));
    if (existsSync(fallback)) return fallback;
  }
  return path;
}

function parseTranscript(path) {
  const resolved = resolveTranscriptPath(path);
  if (!resolved || !existsSync(resolved)) {
    return { exists: false, durationMin: null, tools: {}, advertisedTools: [] };
  }

  let firstTs = null;
  let lastTs = null;
  const tools = {};
  const advertisedTools = new Set();

  for (const line of readFileSync(resolved, "utf8").split(/\n/)) {
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
  };
}

function classifyEvent(event) {
  if (!event) return "in_flight";
  if (event.eventType === "worker_finished" && event.result === "exact" && event.rvStatus === "passed") {
    return "confirmed_exact";
  }
  if (event.eventType === "worker_finished" && event.result === "improved" && event.rvStatus === "passed") {
    return "confirmed_improved";
  }
  if (event.rvExact) return "exact_rejected";
  if (event.rvImproved && event.rvStatus !== "skipped") return "improved_rejected";
  if (event.eventType === "worker_error" || event.eventType === "worker_provider_error") return "error";
  return "no_change";
}

function addCounts(target, source) {
  for (const [key, value] of Object.entries(source)) {
    target[key] = (target[key] ?? 0) + value;
  }
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function average(values) {
  const finite = values.filter((value) => Number.isFinite(value));
  return finite.length ? sum(finite) / finite.length : null;
}

function outcomeLabel(outcome) {
  return {
    confirmed_exact: "confirmed exact",
    confirmed_improved: "confirmed improved",
    exact_rejected: "exact rejected",
    improved_rejected: "improved rejected",
    no_change: "no change",
    error: "error",
    aborted: "aborted",
    in_flight: "in flight",
  }[outcome] ?? outcome;
}

function renderReport(report, htmlPath) {
  const runRows = report.runs.map((run) => {
    const counts = report.outcomeByRun[run.runId] ?? {};
    const terminal = run.leases - (counts.in_flight ?? 0);
    const wins = (counts.confirmed_exact ?? 0) + (counts.confirmed_improved ?? 0);
    return `<tr>${[
      cell(run.runId.slice(0, 8), "mono"),
      cell(`${run.firstSeen?.slice(0, 10) ?? ""} to ${run.lastSeen?.slice(0, 10) ?? ""}`),
      cell(run.sessions, "num"),
      cell(run.leases, "num"),
      cell(terminal, "num"),
      cell(wins, "num"),
      cell(fmtPct(pct(wins, terminal)), "num"),
      cell(counts.confirmed_exact ?? 0, "num"),
      cell(counts.confirmed_improved ?? 0, "num"),
      cell(counts.exact_rejected ?? 0, "num"),
      cell(counts.no_change ?? 0, "num"),
    ].join("")}</tr>`;
  });

  const toolRows = report.toolRows
    .filter((row) => row.workersUsed >= 5)
    .slice(0, 32)
    .map((row) => `<tr>${[
      cell(row.tool, "mono"),
      cell(row.workersUsed, "num"),
      cell(row.winWorkers, "num"),
      cell(row.exactWorkers, "num"),
      cell(row.improvedWorkers, "num"),
      cell(row.exactRejectedWorkers, "num"),
      cell(fmtPct(row.successIfUsed), "num"),
      cell(fmtPct(row.successIfNot), "num"),
      cell(`${fmt(row.successLift, 1)} pts`, row.successLift >= 5 ? "num pos" : row.successLift < 0 ? "num neg" : "num"),
      cell(row.totalCalls, "num"),
    ].join("")}</tr>`);

  const exactRows = report.toolRows
    .filter((row) => row.exactWorkers > 0)
    .sort((left, right) => right.exactWorkers - left.exactWorkers || right.workersUsed - left.workersUsed)
    .slice(0, 24)
    .map((row) => `<tr>${[
      cell(row.tool, "mono"),
      cell(row.exactWorkers, "num"),
      cell(fmtPct(row.exactAdoption), "num"),
      cell(row.winWorkers, "num"),
      cell(row.workersUsed, "num"),
      cell(row.totalCalls, "num"),
    ].join("")}</tr>`);

  const failedGateRows = report.toolRows
    .filter((row) => row.exactRejectedWorkers > 0)
    .sort((left, right) => right.exactRejectedWorkers - left.exactRejectedWorkers || right.workersUsed - left.workersUsed)
    .slice(0, 24)
    .map((row) => `<tr>${[
      cell(row.tool, "mono"),
      cell(row.exactRejectedWorkers, "num"),
      cell(row.exactWorkers, "num"),
      cell(row.winWorkers, "num"),
      cell(row.workersUsed, "num"),
    ].join("")}</tr>`);

  const topExactDetails = report.exactDetails.slice(0, 40).map((row) => `<tr>${[
    cell(row.runId.slice(0, 8), "mono"),
    cell(row.symbol ?? "", "mono"),
    cell(String(row.unit ?? "").replace("main/", ""), "small"),
    cell(row.startFuzzy ?? "", "num"),
    cell(row.durationMin == null ? "" : fmt(row.durationMin, 0), "num"),
    cell(row.totalCalls, "num"),
    cell(row.topTools.join(", "), "small mono"),
  ].join("")}</tr>`);

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Legacy Pi Tool Contribution</title>
<style>
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { margin: 0; background: #f6f8fb; color: #111827; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.45; }
.wrap { max-width: 1180px; margin: 0 auto; padding: 28px 22px 70px; }
header { background: #fff; border-bottom: 1px solid #dbe3ef; }
h1 { margin: 0 0 4px; font-size: 24px; }
h2 { margin: 30px 0 10px; font-size: 17px; }
.sub, .muted { color: #64748b; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; margin: 16px 0; }
.card { background: #fff; border: 1px solid #dbe3ef; border-radius: 8px; padding: 13px 15px; }
.value { font-size: 25px; font-weight: 700; }
.label { color: #64748b; font-size: 12px; margin-top: 2px; }
table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #dbe3ef; border-radius: 8px; overflow: hidden; font-size: 13px; }
th { text-align: left; padding: 8px 9px; color: #475569; background: #f8fafc; border-bottom: 1px solid #dbe3ef; white-space: nowrap; }
td { padding: 7px 9px; border-bottom: 1px solid #edf2f7; vertical-align: top; }
tr:last-child td { border-bottom: 0; }
.num { text-align: right; font-variant-numeric: tabular-nums; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
.small { font-size: 12px; }
.note { background: #fff; border: 1px solid #dbe3ef; border-left: 3px solid #64748b; border-radius: 6px; padding: 12px 14px; color: #475569; font-size: 13px; margin: 12px 0; }
.pos { color: #15803d; font-weight: 650; }
.neg { color: #b91c1c; font-weight: 650; }
code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; }
</style></head><body>
<header><div class="wrap">
<h1>Legacy Pi Tool Contribution</h1>
<div class="sub">Generated ${htmlEscape(report.generatedAt)} from old worker transcript JSONL files and runner-validation events. Failed-gate exacts are tracked separately from accepted wins.</div>
</div></header>
<main class="wrap">
<section class="cards">
<div class="card"><div class="value">${report.summary.leases}</div><div class="label">parsed xhigh leases</div></div>
<div class="card"><div class="value">${report.summary.terminalLeases}</div><div class="label">terminal leases</div></div>
<div class="card"><div class="value pos">${report.summary.winWorkers}</div><div class="label">accepted wins (${fmtPct(report.summary.winRate)})</div></div>
<div class="card"><div class="value">${report.summary.exactWorkers}</div><div class="label">accepted exact matches</div></div>
<div class="card"><div class="value">${report.summary.improvedWorkers}</div><div class="label">accepted improvements</div></div>
<div class="card"><div class="value neg">${report.summary.exactRejectedWorkers}</div><div class="label">100% / exact candidates rejected by gates</div></div>
</section>

<h2>Runs Found In Old Tool Outputs</h2>
${table(["Run", "Dates", "Sessions", "Leases", "Terminal", "Wins", "Win rate", "Exact", "Improved", "Exact rejected", "No change"], runRows)}
<div class="note">Default run selection includes worker runs without checkpoint-backed target-claim wiring. These are replayed at lease level, so they can show which tools correlate with accepted exact/improved outcomes, but they cannot answer checkpoint-level follow-up questions like "after attempt 2, did this same worker improve again?".</div>

<h2>Tool Contribution, Lease Level</h2>
${table(["Tool", "Leases used", "Win leases", "Exact", "Improved", "Exact rejected", "P(win | used)", "P(win | not)", "Lift", "Calls"], toolRows)}

<h2>Exact-Match Tool Surface</h2>
${table(["Tool", "Exact leases", "% of exacts", "Win leases", "Leases used", "Calls"], exactRows)}

<h2>Failed-Gate Exact Surface</h2>
${table(["Tool", "Exact rejected", "Accepted exact", "Win leases", "Leases used"], failedGateRows)}
<div class="note">Exact rejected means runner validation saw an exact candidate, but gates did not pass. These are intentionally not counted as wins, matching the current epoch logic.</div>

<h2>Accepted Exacts, Fastest First</h2>
${table(["Run", "Symbol", "Unit", "Start fuzzy", "Duration min", "Calls", "Top tools"], topExactDetails)}

<h2>Method</h2>
<div class="note">Sources: <code>${htmlEscape(dbPath)}</code>, <code>events</code>, <code>pi_sessions</code>, and worker JSONL transcripts. Runner validation is canonical. Missing historical paths from the old checkout are remapped by JSONL basename into <code>.pi-sessions/worker/</code>. Medium-thinking leases are excluded to keep this comparable to the xhigh worker fleet. Tool lift is correlational, not causal.</div>
</main></body></html>`;

  writeFileSync(htmlPath, html);
}

const args = parseArgs(process.argv.slice(2));
mkdirSync(outDir, { recursive: true });

const outPrefix = args.outPrefix ?? resolve(outDir, `legacy-tool-contribution-${today}`);
const htmlPath = outPrefix.endsWith(".html") ? outPrefix : `${outPrefix}.html`;
const jsonPath = htmlPath.replace(/\.html$/, ".stats.json");
const db = new Database(dbPath, { readonly: true });

const checkpointRunIds = new Set(
  db.query("SELECT DISTINCT session_id AS run_id FROM worker_checkpoints ORDER BY session_id")
    .all()
    .map((row) => String(row.run_id)),
);

const availableRuns = db
  .query(
    `
      SELECT run_id, COUNT(*) AS sessions, COUNT(session_file) AS with_file,
             COUNT(target_claim_id) AS with_claim, MIN(created_at) AS first_seen,
             MAX(created_at) AS last_seen
      FROM pi_sessions
      WHERE role = 'worker'
      GROUP BY run_id
      ORDER BY MIN(created_at)
    `,
  )
  .all()
  .map((row) => ({
    runId: String(row.run_id),
    sessions: Number(row.sessions ?? 0),
    withFile: Number(row.with_file ?? 0),
    withClaim: Number(row.with_claim ?? 0),
    firstSeen: row.first_seen == null ? null : String(row.first_seen),
    lastSeen: row.last_seen == null ? null : String(row.last_seen),
    checkpointBacked: checkpointRunIds.has(String(row.run_id)),
  }));

const runIds = args.runIds.length
  ? args.runIds
  : availableRuns
      .filter((run) => !run.checkpointBacked && run.withClaim === 0 && run.withFile > 0)
      .map((run) => run.runId);

if (runIds.length === 0) {
  throw new Error("No legacy worker runs found.");
}

const placeholders = runIds.map(() => "?").join(", ");
const runMeta = new Map(availableRuns.filter((run) => runIds.includes(run.runId)).map((run) => [run.runId, run]));

const latestEventByLease = new Map();
for (const row of db
  .query(
    `
      SELECT run_id, event_type, payload_json, created_at
      FROM events
      WHERE run_id IN (${placeholders}) AND event_type LIKE 'worker_%'
      ORDER BY created_at
    `,
  )
  .all(...runIds)) {
  const payload = JSON.parse(String(row.payload_json ?? "{}"));
  const leaseId = payload.lease_id;
  if (!leaseId) continue;
  const rv = payload.runner_validation ?? {};
  const target = rv.target ?? {};
  latestEventByLease.set(String(leaseId), {
    runId: String(row.run_id),
    eventType: String(row.event_type),
    result: payload.result == null ? null : String(payload.result),
    stopReason: payload.stop_reason == null ? null : String(payload.stop_reason),
    rvStatus: rv.status == null ? null : String(rv.status),
    rvReasons: Array.isArray(rv.reasons) ? rv.reasons.map(String) : [],
    rvExact: Boolean(target.exact),
    rvImproved: Boolean(target.improved),
    before: target.before == null ? null : Number(target.before),
    after: target.after == null ? null : Number(target.after),
    symbol: payload.target?.symbol == null ? null : String(payload.target.symbol),
    unit: payload.target?.unit == null ? null : String(payload.target.unit),
    size: payload.target?.size == null ? null : Number(payload.target.size),
    startFuzzy: payload.target?.fuzzy_match_percent == null ? null : Number(payload.target.fuzzy_match_percent),
    createdAt: String(row.created_at),
  });
}

const sessionsByLease = new Map();
for (const row of db
  .query(
    `
      SELECT run_id, lease_id, session_file, thinking_level, status, created_at
      FROM pi_sessions
      WHERE role = 'worker' AND run_id IN (${placeholders}) AND lease_id IS NOT NULL
      ORDER BY created_at
    `,
  )
  .all(...runIds)) {
  const leaseId = String(row.lease_id);
  const list = sessionsByLease.get(leaseId) ?? [];
  list.push({
    runId: String(row.run_id),
    file: row.session_file == null ? null : String(row.session_file),
    thinking: String(row.thinking_level ?? "").replace("x-high", "xhigh"),
    status: String(row.status ?? ""),
    createdAt: String(row.created_at),
  });
  sessionsByLease.set(leaseId, list);
}

const advertisedToolsByRun = new Map(runIds.map((runId) => [runId, new Set()]));
let parsedTranscriptSessions = 0;
let missingTranscriptSessions = 0;
let skippedMediumLeases = 0;
const leases = [];

for (const [leaseId, sessions] of sessionsByLease.entries()) {
  const tools = {};
  let durationMin = 0;
  let parsedSessions = 0;
  const thinkingCounts = {};

  for (const session of sessions) {
    const parsed = parseTranscript(session.file);
    if (!parsed.exists) {
      missingTranscriptSessions += 1;
      continue;
    }
    parsedTranscriptSessions += 1;
    parsedSessions += 1;
    if (Number.isFinite(parsed.durationMin)) durationMin += parsed.durationMin;
    addCounts(tools, parsed.tools);
    thinkingCounts[session.thinking] = (thinkingCounts[session.thinking] ?? 0) + 1;
    const advertised = advertisedToolsByRun.get(session.runId);
    if (advertised) {
      for (const tool of parsed.advertisedTools) advertised.add(tool);
    }
  }

  if (!parsedSessions) continue;
  const topThinking = Object.entries(thinkingCounts).sort((left, right) => right[1] - left[1])[0]?.[0] ?? "";
  if (topThinking && topThinking !== "xhigh") {
    skippedMediumLeases += 1;
    continue;
  }

  const event = latestEventByLease.get(leaseId);
  let outcome = classifyEvent(event);
  const totalCalls = sum(Object.values(tools));
  if ((outcome === "error" || outcome === "no_change" || outcome === "in_flight") && totalCalls === 0) {
    outcome = "aborted";
  }
  const delta = event?.before != null && event?.after != null ? event.after - event.before : null;
  leases.push({
    leaseId,
    runId: sessions[0].runId,
    outcome,
    durationMin: Number(durationMin.toFixed(3)),
    tools,
    totalCalls,
    parsedSessions,
    thinking: topThinking,
    symbol: event?.symbol ?? null,
    unit: event?.unit ?? null,
    size: event?.size ?? null,
    startFuzzy: event?.startFuzzy ?? null,
    before: event?.before ?? null,
    after: event?.after ?? null,
    delta: delta == null || Math.abs(delta) < EPSILON ? delta : Number(delta.toFixed(6)),
    rvStatus: event?.rvStatus ?? null,
    rvReasons: event?.rvReasons ?? [],
    eventType: event?.eventType ?? null,
  });
}

const terminalLeases = leases.filter((lease) => lease.outcome !== "in_flight");
const winOutcomes = new Set(["confirmed_exact", "confirmed_improved"]);
const winLeases = terminalLeases.filter((lease) => winOutcomes.has(lease.outcome));
const exactLeases = terminalLeases.filter((lease) => lease.outcome === "confirmed_exact");
const improvedLeases = terminalLeases.filter((lease) => lease.outcome === "confirmed_improved");
const exactRejectedLeases = terminalLeases.filter((lease) => lease.outcome === "exact_rejected");

const outcomeByRun = {};
for (const lease of leases) {
  outcomeByRun[lease.runId] ??= {};
  outcomeByRun[lease.runId][lease.outcome] = (outcomeByRun[lease.runId][lease.outcome] ?? 0) + 1;
}

const allTools = [...new Set(leases.flatMap((lease) => Object.keys(lease.tools)))].sort();
const toolRows = allTools.map((tool) => {
  const users = terminalLeases.filter((lease) => lease.tools[tool] != null);
  const nonUsers = terminalLeases.filter((lease) => lease.tools[tool] == null);
  const winUsers = users.filter((lease) => winOutcomes.has(lease.outcome));
  const pUsed = pct(winUsers.length, users.length);
  const pNot = pct(nonUsers.filter((lease) => winOutcomes.has(lease.outcome)).length, nonUsers.length);
  return {
    tool,
    workersUsed: users.length,
    totalCalls: sum(leases.map((lease) => lease.tools[tool] ?? 0)),
    winWorkers: winUsers.length,
    exactWorkers: users.filter((lease) => lease.outcome === "confirmed_exact").length,
    improvedWorkers: users.filter((lease) => lease.outcome === "confirmed_improved").length,
    exactRejectedWorkers: users.filter((lease) => lease.outcome === "exact_rejected").length,
    successIfUsed: pUsed,
    successIfNot: pNot,
    successLift: pUsed == null || pNot == null ? null : Number((pUsed - pNot).toFixed(1)),
    exactAdoption: pct(users.filter((lease) => lease.outcome === "confirmed_exact").length, exactLeases.length),
    averageDeltaWhenImproved: average(users.filter((lease) => lease.outcome === "confirmed_improved").map((lease) => lease.delta).filter((value) => value != null)),
  };
}).sort((left, right) => {
  const lift = (right.successLift ?? -999) - (left.successLift ?? -999);
  if (Math.abs(lift) > 0.001) return lift;
  return right.winWorkers - left.winWorkers;
});

const runs = runIds.map((runId) => {
  const meta = runMeta.get(runId) ?? { runId, sessions: 0, firstSeen: null, lastSeen: null };
  return {
    ...meta,
    leases: leases.filter((lease) => lease.runId === runId).length,
    terminalLeases: terminalLeases.filter((lease) => lease.runId === runId).length,
  };
});

const report = {
  generatedAt,
  dbPath,
  runIds,
  runs,
  sourceSummary: {
    availableRuns,
    parsedTranscriptSessions,
    missingTranscriptSessions,
    skippedMediumLeases,
    advertisedToolsByRun: Object.fromEntries([...advertisedToolsByRun.entries()].map(([runId, tools]) => [runId, [...tools].sort()])),
    legacyTranscriptLocation: ".pi-sessions/worker/",
  },
  summary: {
    leases: leases.length,
    terminalLeases: terminalLeases.length,
    winWorkers: winLeases.length,
    winRate: pct(winLeases.length, terminalLeases.length),
    exactWorkers: exactLeases.length,
    improvedWorkers: improvedLeases.length,
    exactRejectedWorkers: exactRejectedLeases.length,
    noChangeWorkers: terminalLeases.filter((lease) => lease.outcome === "no_change").length,
    errorWorkers: terminalLeases.filter((lease) => lease.outcome === "error").length,
    abortedWorkers: terminalLeases.filter((lease) => lease.outcome === "aborted").length,
  },
  outcomeByRun,
  outcomeLabels: Object.fromEntries(["confirmed_exact", "confirmed_improved", "exact_rejected", "improved_rejected", "no_change", "error", "aborted", "in_flight"].map((outcome) => [outcome, outcomeLabel(outcome)])),
  toolRows,
  exactDetails: exactLeases
    .map((lease) => ({
      runId: lease.runId,
      symbol: lease.symbol,
      unit: lease.unit,
      startFuzzy: lease.startFuzzy,
      durationMin: lease.durationMin,
      totalCalls: lease.totalCalls,
      topTools: Object.entries(lease.tools).sort((left, right) => right[1] - left[1]).slice(0, 6).map(([tool]) => tool),
    }))
    .sort((left, right) => (left.durationMin ?? 999999) - (right.durationMin ?? 999999)),
};

writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
renderReport(report, htmlPath);

console.log(JSON.stringify({
  htmlPath: resolve(htmlPath),
  jsonPath: resolve(jsonPath),
  runIds,
  leases: report.summary.leases,
  terminalLeases: report.summary.terminalLeases,
  wins: report.summary.winWorkers,
}, null, 2));
