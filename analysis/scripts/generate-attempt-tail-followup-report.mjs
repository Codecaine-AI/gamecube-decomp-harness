import { Database } from "bun:sqlite";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const dbPath = "projects/melee/state/orchestrator.sqlite";
const outDir = "analysis/reports";
const generatedAt = new Date().toISOString();
const today = generatedAt.slice(0, 10);
const htmlPath = resolve(outDir, `epoch-followup-gain-${today}.html`);
const jsonPath = resolve(outDir, `epoch-followup-gain-${today}.stats.json`);
const EPSILON = 0.000001;

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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

function quantile(values, q) {
  const sorted = values.filter((value) => Number.isFinite(value)).slice().sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const index = (sorted.length - 1) * q;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function average(values) {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length === 0) return null;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function sum(values) {
  return values.filter((value) => Number.isFinite(value)).reduce((total, value) => total + value, 0);
}

function humanAttempt(attemptIndex) {
  return Number(attemptIndex) + 1;
}

function checkpointFromRow(row) {
  return {
    id: String(row.id),
    workerStateId: String(row.worker_state_id),
    attemptIndex: Number(row.attempt_index),
    validationTime: String(row.validation_time),
    oldScore: number(row.old_score),
    newScore: number(row.new_score),
    delta: number(row.delta),
    exactMatch: Number(row.exact_match) === 1,
    hardGatesPassed: Number(row.hard_gates_passed) === 1,
    improvedOverBaseline: Number(row.improved_over_baseline) === 1,
    selectable: Number(row.selectable) === 1,
    qaStatus: row.qa_status == null ? null : String(row.qa_status),
    validationStatus: String(row.validation_status),
  };
}

function normalFuzzySuccess(checkpoint) {
  return checkpoint.selectable && checkpoint.hardGatesPassed && checkpoint.improvedOverBaseline && !checkpoint.exactMatch && checkpoint.newScore != null;
}

function failedGateExact(checkpoint) {
  return checkpoint.exactMatch && !checkpoint.hardGatesPassed;
}

function acceptedExact(checkpoint) {
  return checkpoint.selectable && checkpoint.hardGatesPassed && checkpoint.exactMatch;
}

function checkpointScore(checkpoint) {
  if (checkpoint.newScore == null) return null;
  return acceptedExact(checkpoint) ? 100 : checkpoint.newScore;
}

function describeNormalPath(worker, checkpoints) {
  const first = checkpoints.find(normalFuzzySuccess) ?? null;
  if (!first) return null;
  const followups = checkpoints.filter((checkpoint) => checkpoint.attemptIndex > first.attemptIndex);
  const terminal = worker.lifecycleStatus !== "running";
  let bestNonExact = first.newScore ?? 0;
  let bestIncludingExact = first.newScore ?? 0;
  let firstLaterNewBest = null;
  let firstLaterAcceptedExact = null;
  let failedGateExactAfterFirst = 0;
  const incrementsByFollowup = [];
  const cumulativeByFollowup = [];
  const failedGateExactFollowups = [];

  followups.forEach((checkpoint, index) => {
    let incrementalNonExactGain = 0;
    if (failedGateExact(checkpoint)) {
      failedGateExactAfterFirst += 1;
      failedGateExactFollowups.push(checkpoint);
    }
    if (normalFuzzySuccess(checkpoint) && checkpoint.newScore != null && checkpoint.newScore > bestNonExact + EPSILON) {
      incrementalNonExactGain = checkpoint.newScore - bestNonExact;
      bestNonExact = checkpoint.newScore;
      if (!firstLaterNewBest) firstLaterNewBest = checkpoint;
    }
    if (acceptedExact(checkpoint)) {
      if (!firstLaterAcceptedExact) firstLaterAcceptedExact = checkpoint;
      bestIncludingExact = Math.max(bestIncludingExact, 100);
    } else {
      const score = checkpointScore(checkpoint);
      if (checkpoint.selectable && score != null) bestIncludingExact = Math.max(bestIncludingExact, score);
    }
    incrementsByFollowup.push({
      followupIndex: index + 1,
      attemptIndex: checkpoint.attemptIndex,
      humanAttempt: humanAttempt(checkpoint.attemptIndex),
      incrementalNonExactGain,
      producedNonExactNewBest: incrementalNonExactGain > EPSILON,
      failedGateExact: failedGateExact(checkpoint),
      acceptedExact: acceptedExact(checkpoint),
    });
    cumulativeByFollowup.push({
      followupIndex: index + 1,
      cumulativeNonExactGain: Math.max(0, bestNonExact - (first.newScore ?? 0)),
    });
  });

  const firstScore = first.newScore ?? 0;
  const additionalNonExactGain = Math.max(0, bestNonExact - firstScore);
  const additionalIncludingExactGain = Math.max(0, bestIncludingExact - firstScore);
  return {
    workerStateId: worker.id,
    lifecycleStatus: worker.lifecycleStatus,
    terminal,
    unit: worker.unit,
    symbol: worker.symbol,
    sourcePath: worker.sourcePath,
    firstAttempt: humanAttempt(first.attemptIndex),
    firstAttemptIndex: first.attemptIndex,
    firstOldScore: first.oldScore,
    firstScore,
    firstDelta: first.delta,
    followupCount: followups.length,
    failedGateExactAfterFirst,
    failedGateExactFollowups,
    laterNonExactNewBest: Boolean(firstLaterNewBest),
    laterAcceptedExact: Boolean(firstLaterAcceptedExact),
    firstLaterNewBestAttempt: firstLaterNewBest ? humanAttempt(firstLaterNewBest.attemptIndex) : null,
    firstLaterAcceptedExactAttempt: firstLaterAcceptedExact ? humanAttempt(firstLaterAcceptedExact.attemptIndex) : null,
    bestNonExactScore: bestNonExact,
    bestIncludingExactScore: bestIncludingExact,
    additionalNonExactGain,
    additionalIncludingExactGain,
    incrementsByFollowup,
    cumulativeByFollowup,
  };
}

function summarizeGains(paths, options = {}) {
  const source = options.requireFollowup ? paths.filter((path) => path.followupCount > 0) : paths;
  const gains = source.map((path) => path.additionalNonExactGain);
  const positive = source.filter((path) => path.additionalNonExactGain > EPSILON);
  return {
    workers: source.length,
    positiveWorkers: positive.length,
    positiveRate: pct(positive.length, source.length),
    totalGain: Number(sum(gains).toFixed(6)),
    averageGainIncludingZero: average(gains),
    medianGain: quantile(gains, 0.5),
    p75Gain: quantile(gains, 0.75),
    p90Gain: quantile(gains, 0.9),
    maxGain: gains.length ? Math.max(...gains) : null,
    averagePositiveGain: average(positive.map((path) => path.additionalNonExactGain)),
    laterAcceptedExactWorkers: source.filter((path) => path.laterAcceptedExact).length,
  };
}

function byFollowupIndex(paths, maxIndex = 5) {
  const rows = [];
  for (let index = 1; index <= maxIndex; index += 1) {
    const eligible = paths.filter((path) => path.followupCount >= index);
    const increments = eligible.map((path) => path.incrementsByFollowup[index - 1]?.incrementalNonExactGain ?? 0);
    const cumulative = eligible.map((path) => path.cumulativeByFollowup[index - 1]?.cumulativeNonExactGain ?? 0);
    const hits = eligible.filter((path) => path.incrementsByFollowup[index - 1]?.producedNonExactNewBest).length;
    const failedGateExact = eligible.filter((path) => path.incrementsByFollowup[index - 1]?.failedGateExact).length;
    const acceptedExact = eligible.filter((path) => path.incrementsByFollowup[index - 1]?.acceptedExact).length;
    rows.push({
      followupIndex: index,
      eligible: eligible.length,
      nonExactNewBest: hits,
      nonExactNewBestRate: pct(hits, eligible.length),
      averageIncrementalGainIncludingZero: average(increments),
      averageCumulativeGainIncludingZero: average(cumulative),
      medianCumulativeGain: quantile(cumulative, 0.5),
      p75CumulativeGain: quantile(cumulative, 0.75),
      failedGateExact,
      acceptedExact,
    });
  }
  return rows;
}

function byFirstAttempt(paths) {
  const groups = new Map();
  for (const path of paths) {
    const key = path.firstAttempt <= 3 ? `attempt_${path.firstAttempt}` : "attempt_4_plus";
    const group = groups.get(key) ?? [];
    group.push(path);
    groups.set(key, group);
  }
  return [...groups.entries()].map(([key, values]) => ({
    key,
    label: key === "attempt_4_plus" ? "First normal improvement attempt 4+" : `First normal improvement attempt ${key.split("_")[1]}`,
    ...summarizeGains(values, { requireFollowup: true }),
    allFirstSuccessWorkers: values.length,
    continuedWorkers: values.filter((path) => path.followupCount > 0).length,
  }));
}

function staleAfterNewBest(paths, maxStale = 5) {
  const rows = [];
  for (let stale = 1; stale <= maxStale; stale += 1) {
    let eligible = 0;
    let laterNewBest = 0;
    let symbols = [];
    for (const path of paths) {
      let best = path.firstScore;
      let staleRun = 0;
      for (const step of path.incrementsByFollowup) {
        if (step.producedNonExactNewBest) {
          best += step.incrementalNonExactGain;
          staleRun = 0;
          continue;
        }
        staleRun += 1;
        if (staleRun === stale) {
          const later = path.incrementsByFollowup
            .filter((candidate) => candidate.followupIndex > step.followupIndex)
            .some((candidate) => candidate.producedNonExactNewBest);
          eligible += 1;
          if (later) {
            laterNewBest += 1;
            symbols.push(path.symbol);
          }
          break;
        }
      }
      void best;
    }
    rows.push({ staleFollowups: stale, eligible, laterNewBest, rate: pct(laterNewBest, eligible), symbols });
  }
  return rows;
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

function renderEpochSection(report) {
  const s = report.normalFollowupSummary;
  const continued = report.normalFollowupContinuedSummary;
  const followupRows = table(
    [
      "Follow-up #",
      "Eligible",
      "New fuzzy best",
      "Hit rate",
      "Avg incremental gain",
      "Avg cumulative gain",
      "Median cumulative",
      "P75 cumulative",
      "Failed-gate exacts",
      "Accepted exacts",
    ],
    report.byFollowupIndex.map((item) =>
      row([
        { value: item.followupIndex, className: "num" },
        { value: item.eligible, className: "num" },
        { value: item.nonExactNewBest, className: "num" },
        { value: fmtPct(item.nonExactNewBestRate), className: "num" },
        scoreCell(item.averageIncrementalGainIncludingZero),
        scoreCell(item.averageCumulativeGainIncludingZero),
        scoreCell(item.medianCumulativeGain),
        scoreCell(item.p75CumulativeGain),
        { value: item.failedGateExact, className: "num" },
        { value: item.acceptedExact, className: "num" },
      ]),
    ),
  );
  const cohortRows = table(
    ["Cohort", "First-success workers", "Continued", "Later fuzzy-best rate", "Avg extra gain", "Median extra", "P75 extra", "Max extra", "Later accepted exact"],
    report.byFirstAttempt.map((item) =>
      row([
        { value: item.label },
        { value: item.allFirstSuccessWorkers, className: "num" },
        { value: item.continuedWorkers, className: "num" },
        { value: fmtPct(item.positiveRate), className: "num" },
        scoreCell(item.averageGainIncludingZero),
        scoreCell(item.medianGain),
        scoreCell(item.p75Gain),
        scoreCell(item.maxGain),
        { value: item.laterAcceptedExactWorkers, className: "num" },
      ]),
    ),
  );
  const staleRows = table(
    ["No-new-best follow-ups", "Eligible", "Later fuzzy new best", "Rate"],
    report.staleAfterNewBest.map((item) =>
      row([
        { value: item.staleFollowups, className: "num" },
        { value: item.eligible, className: "num" },
        { value: item.laterNewBest, className: "num" },
        { value: fmtPct(item.rate), className: "num" },
      ]),
    ),
  );
  const topRows = table(
    ["Symbol", "Unit", "First", "Best fuzzy", "Extra gain", "First later best", "Follow-ups", "Status"],
    report.topAdditionalGains.map((path) =>
      row([
        { value: path.symbol },
        { value: path.unit },
        scoreCell(path.firstScore),
        scoreCell(path.bestNonExactScore),
        scoreCell(path.additionalNonExactGain),
        { value: path.firstLaterNewBestAttempt ?? "", className: "num" },
        { value: path.followupCount, className: "num" },
        { value: path.lifecycleStatus },
      ]),
    ),
  );

  return `
    <section class="band">
      <h2>Epoch ${report.ordinal}: follow-up gain after normal fuzzy success</h2>
      <p class="muted">${htmlEscape(report.statusLabel)}</p>
      <div class="card-grid">
        <section class="card"><div class="ct">Normal fuzzy successes</div><div class="cv">${s.workers}</div><div class="cn">terminal workers with first selectable non-exact improvement</div></section>
        <section class="card"><div class="ct">Continued after success</div><div class="cv">${continued.workers}</div><div class="cn">${fmtPct(pct(continued.workers, s.workers))} of normal successes</div></section>
        <section class="card"><div class="ct">Later fuzzy new best</div><div class="cv">${continued.positiveWorkers}</div><div class="cn">${fmtPct(continued.positiveRate)} of continued workers</div></section>
        <section class="card"><div class="ct">Avg extra fuzzy score</div><div class="cv">${fmt(continued.averageGainIncludingZero)}</div><div class="cn">score points, zeros included</div></section>
      </div>
      <div class="grid-two">
        <section>
          <h3>Headline</h3>
          <table class="dense"><tbody>
            ${row([{ value: "Median extra fuzzy gain after continuing" }, scoreCell(continued.medianGain)])}
            ${row([{ value: "P75 extra fuzzy gain after continuing" }, scoreCell(continued.p75Gain)])}
            ${row([{ value: "P90 extra fuzzy gain after continuing" }, scoreCell(continued.p90Gain)])}
            ${row([{ value: "Average positive extra gain" }, scoreCell(continued.averagePositiveGain)])}
            ${row([{ value: "Accepted exact after first fuzzy success" }, { value: continued.laterAcceptedExactWorkers, className: "num" }])}
            ${row([{ value: "Failed-gate exact checkpoints excluded from fuzzy-gain math" }, { value: report.failedGateExactCheckpoints, className: "num" }])}
          </tbody></table>
        </section>
        <section>
          <h3>Interpretation</h3>
          <p>${htmlEscape(report.interpretation)}</p>
        </section>
      </div>
      <h3>Gain by follow-up checkpoint</h3>
      ${followupRows}
      <h3>By first improvement attempt</h3>
      ${cohortRows}
      <h3>Staleness after first improvement</h3>
      ${staleRows}
      <h3>Largest extra fuzzy gains after first success</h3>
      ${topRows}
    </section>
  `;
}

const db = new Database(dbPath, { readonly: true });
const run = db.query("SELECT * FROM runs ORDER BY created_at DESC LIMIT 1").get();
const allEpochs = db.query("SELECT * FROM epochs ORDER BY ordinal DESC").all();
const resultEpochs = allEpochs.filter((epoch) => Number(epoch.admitted_count ?? 0) > 0);
const primaryEpoch = resultEpochs[0];
const comparisonEpoch = resultEpochs.find((epoch) => String(epoch.id) !== String(primaryEpoch.id) && Number(epoch.admitted_count ?? 0) > 0);
const selectedEpochs = [primaryEpoch, comparisonEpoch].filter(Boolean);

const epochReports = selectedEpochs.map((epoch) => {
  const workers = db
    .query(
      `
        SELECT
          worker_state.*,
          epoch_targets.unit,
          epoch_targets.symbol,
          epoch_targets.source_path,
          epoch_targets.size,
          epoch_targets.baseline_score AS target_baseline_score,
          epoch_targets.status AS target_status
        FROM worker_state
        JOIN epoch_targets ON epoch_targets.id = worker_state.epoch_target_id
        WHERE worker_state.epoch_id = ?
        ORDER BY worker_state.started_at ASC
      `,
    )
    .all(epoch.id)
    .map((worker) => ({
      id: String(worker.id),
      lifecycleStatus: String(worker.lifecycle_status),
      unit: String(worker.unit ?? ""),
      symbol: String(worker.symbol ?? ""),
      sourcePath: String(worker.source_path ?? ""),
      targetStatus: String(worker.target_status ?? ""),
    }));
  const checkpointsByWorker = new Map(workers.map((worker) => [worker.id, []]));
  const checkpoints = db.query("SELECT * FROM worker_checkpoints WHERE epoch_id = ? ORDER BY worker_state_id ASC, attempt_index ASC, validation_time ASC").all(epoch.id).map(checkpointFromRow);
  for (const checkpoint of checkpoints) {
    const list = checkpointsByWorker.get(checkpoint.workerStateId);
    if (list) list.push(checkpoint);
  }

  const paths = workers
    .map((worker) => describeNormalPath(worker, checkpointsByWorker.get(worker.id) ?? []))
    .filter(Boolean);
  const terminalPaths = paths.filter((path) => path.terminal);
  const terminalContinuedPaths = terminalPaths.filter((path) => path.followupCount > 0);
  const failedGateExactCheckpoints = checkpoints.filter(failedGateExact);
  const failedGateExactWorkers = new Set(failedGateExactCheckpoints.map((checkpoint) => checkpoint.workerStateId));
  const acceptedExactWorkers = new Set(checkpoints.filter(acceptedExact).map((checkpoint) => checkpoint.workerStateId));
  const targetCounts = db.query("SELECT status, COUNT(*) AS count FROM epoch_targets WHERE epoch_id = ? GROUP BY status").all(epoch.id);
  const workerCounts = db.query("SELECT lifecycle_status AS status, COUNT(*) AS count FROM worker_state WHERE epoch_id = ? GROUP BY lifecycle_status").all(epoch.id);
  const finishedTargets = targetCounts.find((row) => row.status === "finished")?.count ?? 0;
  const claimedTargets = targetCounts.find((row) => row.status === "claimed")?.count ?? 0;
  const statusLabel =
    epoch.status === "active"
      ? `${finishedTargets}/${epoch.admitted_count} targets finished; ${claimedTargets} still claimed/running, so terminal rates censor live workers.`
      : `${epoch.status}; ${finishedTargets}/${epoch.admitted_count} targets finished.`;
  const continuedSummary = summarizeGains(terminalPaths, { requireFollowup: true });
  const interpretation =
    continuedSummary.workers === 0
      ? "No terminal workers in this epoch both found a normal fuzzy improvement and continued afterward."
      : `Among terminal workers that continued after a normal fuzzy improvement, ${fmtPct(continuedSummary.positiveRate)} found a later fuzzy new best. The average extra fuzzy score was ${fmt(continuedSummary.averageGainIncludingZero)} points with zeros included; the median was ${fmt(continuedSummary.medianGain)}. Failed-gate exact checkpoints are counted separately and do not inflate this fuzzy-gain estimate.`;

  return {
    epochId: String(epoch.id),
    ordinal: Number(epoch.ordinal),
    status: String(epoch.status),
    boundaryStatus: epoch.boundary_status == null ? null : String(epoch.boundary_status),
    admittedCount: Number(epoch.admitted_count ?? 0),
    finishedCount: Number(epoch.finished_count ?? 0),
    createdAt: String(epoch.created_at),
    closedAt: epoch.closed_at == null ? null : String(epoch.closed_at),
    statusLabel,
    targetCounts,
    workerCounts,
    checkpointCount: checkpoints.length,
    selectableCheckpointCount: checkpoints.filter((checkpoint) => checkpoint.selectable).length,
    acceptedExactWorkers: acceptedExactWorkers.size,
    failedGateExactCheckpoints: failedGateExactCheckpoints.length,
    failedGateExactWorkers: failedGateExactWorkers.size,
    failedGateExactByQaStatus: Object.fromEntries(
      [...failedGateExactCheckpoints.reduce((map, checkpoint) => map.set(checkpoint.qaStatus ?? "unknown", (map.get(checkpoint.qaStatus ?? "unknown") ?? 0) + 1), new Map()).entries()].sort(),
    ),
    normalFirstSuccessWorkers: paths.length,
    terminalNormalFirstSuccessWorkers: terminalPaths.length,
    liveNormalFirstSuccessWorkers: paths.length - terminalPaths.length,
    normalFollowupSummary: summarizeGains(terminalPaths),
    normalFollowupContinuedSummary: continuedSummary,
    byFollowupIndex: byFollowupIndex(terminalPaths, 5),
    byFirstAttempt: byFirstAttempt(terminalPaths),
    staleAfterNewBest: staleAfterNewBest(terminalContinuedPaths, 5),
    topAdditionalGains: terminalContinuedPaths
      .filter((path) => path.additionalNonExactGain > EPSILON)
      .sort((left, right) => right.additionalNonExactGain - left.additionalNonExactGain)
      .slice(0, 16),
    paths: terminalPaths,
    livePaths: paths.filter((path) => !path.terminal),
    interpretation,
  };
});

const primary = epochReports[0];
const recommendation = {
  summary:
    primary.normalFollowupContinuedSummary.averageGainIncludingZero != null && primary.normalFollowupContinuedSummary.averageGainIncludingZero < 0.75
      ? "The new epoch supports keeping the short follow-up window, not expanding it. Most post-success fuzzy follow-ups add little score; useful extra movement is concentrated in a minority of workers."
      : "The new epoch still supports bounded follow-up, but the gain distribution has enough positive tail to keep the current three-follow-up window.",
  policy:
    "Keep saving the first normal fuzzy improvement immediately. Continue at most three follow-up checkpoints for fuzzy improvements, stopping sooner on exact. Keep failed-gate 100% cases in the separate gate-repair lane.",
};

const report = {
  generatedAt,
  dbPath,
  run: run
    ? {
        id: String(run.id),
        status: String(run.status),
        goalKind: String(run.goal_kind),
        goalValue: Number(run.goal_value),
      }
    : null,
  selectedEpochOrdinals: epochReports.map((epoch) => epoch.ordinal),
  recommendation,
  epochReports,
  method:
    "Normal fuzzy success is a selectable, hard-gate-passing, non-exact checkpoint that improved over baseline. Failed-gate exact checkpoints are counted separately and excluded from fuzzy score-gain calculations. Terminal rates exclude running workers.",
};

mkdirSync(outDir, { recursive: true });
writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Epoch Follow-up Gain Report</title>
<style>
:root{--bg:#f7f8f6;--ink:#172126;--muted:#607077;--line:#d8e0dd;--panel:#fff;--teal:#087f83;--green:#268b45;--blue:#2b679a}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.45}
main{max-width:1240px;margin:0 auto;padding:28px 24px 48px}header{border-bottom:1px solid var(--line);padding-bottom:18px;margin-bottom:22px}
h1{font-size:30px;line-height:1.1;margin:0 0 8px;letter-spacing:0}h2{font-size:20px;margin:0 0 10px}h3{font-size:15px;margin:18px 0 8px}
.subtitle,.small,.muted{color:var(--muted)}.band{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:18px;margin:16px 0}
.card-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:14px 0}.card{background:#fbfcfc;border:1px solid var(--line);border-radius:8px;padding:14px;min-height:112px}
.ct{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.04em}.cv{font-size:28px;font-weight:700;margin-top:8px;font-variant-numeric:tabular-nums}.cn{font-size:13px;color:var(--muted);margin-top:6px}
.callout{border-left:4px solid var(--teal);background:#f0faf9;padding:12px 14px;border-radius:6px;margin:12px 0}.callout strong{color:var(--teal)}
.grid-two{display:grid;grid-template-columns:1fr 1fr;gap:14px}table{width:100%;border-collapse:collapse;font-size:13px}th,td{border-bottom:1px solid var(--line);padding:8px 9px;text-align:left;vertical-align:top}
th{background:#f1f4f3;color:#32434d;font-weight:650}.dense th,.dense td{padding:6px 7px}.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
code{background:#eef1f0;border:1px solid #dde4e2;border-radius:4px;padding:1px 4px}@media(max-width:900px){.card-grid,.grid-two{grid-template-columns:1fr}main{padding:18px 14px 36px}}
</style>
</head>
<body>
<main>
  <header>
    <h1>Epoch Follow-up Gain After Normal Fuzzy Success</h1>
    <div class="subtitle">Generated ${htmlEscape(generatedAt)} from <code>${htmlEscape(dbPath)}</code>.</div>
    <div class="callout"><strong>Recommendation:</strong> ${htmlEscape(recommendation.summary)} ${htmlEscape(recommendation.policy)}</div>
  </header>
  <section class="band">
    <h2>Scope</h2>
    <p>${htmlEscape(report.method)}</p>
    <p>Selected epochs: ${epochReports.map((epoch) => `epoch ${epoch.ordinal}`).join(", ")}. Epoch 13 is not included because it was an empty manual-discard boundary.</p>
    <p>Companion machine-readable stats: <code>${htmlEscape(jsonPath)}</code>.</p>
  </section>
  ${epochReports.map(renderEpochSection).join("\n")}
</main>
</body>
</html>
`;

writeFileSync(htmlPath, html);
console.log(JSON.stringify({ htmlPath, jsonPath, selectedEpochOrdinals: report.selectedEpochOrdinals }, null, 2));
