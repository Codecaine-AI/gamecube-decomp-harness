// `calibrate --engine live|replay|fake [--dry-run] [--write]` (plan §6.9).
// Scores each labelled item with a justification (one decision on the same
// state and question the adjudication core asks), selects thresholds on the
// selection split, evaluates them once on held-out groups, and reports the
// Clopper–Pearson bound and the qualification level.
// - `replay` reads committed probabilities (`runs/<model>/<iso>.jsonl`) and
//   constructs no model client; `fake` runs the kernel's fake classifier,
//   answering each item's `fixture_p`; `live` runs the production node kernel.
// - `--dry-run` prints the report JSON and writes nothing; otherwise the
//   scored run (live/fake) and `reports/<iso>.{json,md}` are written; `--write`
//   also records the result in the adjudication config, keeping every other
//   model's entry, and never raises `maxFalseAcceptUpper`.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  ADVISORY_ADJUDICATION_CONFIG_PATH,
  ENFORCEMENT_MIN_HELDOUT_NEGATIVE_GROUPS,
  ENFORCEMENT_MIN_HELDOUT_POSITIVE_GROUPS,
  parseAdvisoryAdjudicationConfig,
  readAdvisoryAdjudicationConfig,
  type AdvisoryThresholds,
} from "@server/core/agent-catalog/agents/running/worker/advisory-adjudication/config.js";
import { JUSTIFIED_QUESTION_ID, justifiedQuestions } from "@server/core/agent-catalog/agents/running/worker/advisory-adjudication/question.js";
import { buildAdvisoryState } from "@server/core/agent-catalog/agents/running/worker/advisory-adjudication/state.js";
import type { QaScanFinding } from "@server/core/validation/qa/scan-diff.js";

import {
  assertKnownFlags,
  engineFlag,
  integerFlag,
  numberFlag,
  stringFlag,
  switchFlag,
  type CalibrationArgs,
} from "./args.js";
import { evaluateHeldout, qualify, selectThresholds, type EvaluationItem, type HeldoutResult, type SelectionResult } from "./evaluate.js";
import { openCalibrationKernel } from "./kernels.js";
import { renderCalibrationReport } from "./report.js";
import { splitHash } from "./split.js";
import {
  canonicalJson,
  DEFAULT_CALIBRATION_DIR,
  effectiveHumanLabels,
  justificationOf,
  loadDataset,
  readJsonl,
  sha256Hex,
  writeJson,
  writeJsonl,
  type CalibrationDataset,
} from "./store.js";
import type { CalibrationEngine, CalibrationItem, HumanLabel, ProbabilityRow } from "./types.js";

export interface CalibrationReport {
  schema: "advisory_calibration_report_v1";
  model: string;
  engine: CalibrationEngine;
  maxFalseAcceptUpper: number;
  labelSetHash: string | null;
  splitHash: string | null;
  items: {
    total: number;
    evaluated: number;
    excluded: {
      /** No justification: the adjudication rejects these without a decision. */
      noJustification: number;
      unsplit: number;
      unlabelled: number;
      /** Synthetic items in held-out groups: never evaluated, never used for selection. */
      syntheticHeldout: number;
      unscored: number;
      /** The decision abstained for an engine error or refusal. */
      engineError: number;
      /** Scored by a model other than `model`: thresholds are keyed by the serving model. */
      servedModelMismatch: number;
    };
  };
  selection: SelectionResult;
  heldout: HeldoutResult;
  qualification: "exploratory" | "enforcement-qualified";
  qualificationReasons: string[];
}

/** An item that passed every filter except scoring. */
interface Scorable {
  item: CalibrationItem;
  justification: string;
  group: string;
  side: "selection" | "heldout";
  label: HumanLabel;
  labelSource: "human" | "synthetic-quality";
}

type Excluded = CalibrationReport["items"]["excluded"];

function emptyExcluded(): Excluded {
  return { noJustification: 0, unsplit: 0, unlabelled: 0, syntheticHeldout: 0, unscored: 0, engineError: 0, servedModelMismatch: 0 };
}

/** Items eligible for scoring, in id order; every exclusion is counted. */
export function scorableItems(dataset: CalibrationDataset, excluded: Excluded): Scorable[] {
  const humanLabels = effectiveHumanLabels(dataset.labels);
  const out: Scorable[] = [];
  for (const item of [...dataset.items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    const justification = justificationOf(item, dataset.extractions);
    if (justification === null) {
      excluded.noJustification += 1;
      continue;
    }
    const group = dataset.split?.items[item.id];
    const side = group === undefined ? undefined : dataset.split?.components[group];
    if (group === undefined || side === undefined) {
      excluded.unsplit += 1;
      continue;
    }
    if (side === "heldout" && item.synthetic) {
      excluded.syntheticHeldout += 1;
      continue;
    }
    const human = humanLabels.get(item.id);
    const label: HumanLabel | undefined =
      human ?? (item.synthetic && item.quality ? (item.quality === "good" ? "justified" : "unjustified") : undefined);
    if (label === undefined) {
      excluded.unlabelled += 1;
      continue;
    }
    out.push({ item, justification, group, side, label, labelSource: human ? "human" : "synthetic-quality" });
  }
  return out;
}

/** sha256 over the effective human labels of every item, sorted by id. */
export function labelSetHash(dataset: CalibrationDataset): string | null {
  const labels = [...effectiveHumanLabels(dataset.labels)].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return labels.length === 0 ? null : sha256Hex(canonicalJson(labels));
}

export function buildCalibrationReport(input: {
  dataset: CalibrationDataset;
  scorable: readonly Scorable[];
  excluded: Excluded;
  probabilities: ReadonlyMap<string, ProbabilityRow>;
  model: string;
  engine: CalibrationEngine;
  maxFalseAcceptUpper: number;
}): CalibrationReport {
  const excluded = { ...input.excluded };
  const evaluated: EvaluationItem[] = [];
  for (const entry of input.scorable) {
    const row = input.probabilities.get(entry.item.id);
    if (!row) {
      excluded.unscored += 1;
      continue;
    }
    if (row.probability === null) {
      excluded.engineError += 1;
      continue;
    }
    // In-process, the fake classifier stands in for the model; a recorded run must have been served by it.
    if (input.engine !== "fake" && row.served_model !== input.model) {
      excluded.servedModelMismatch += 1;
      continue;
    }
    evaluated.push({
      id: entry.item.id,
      group: entry.group,
      side: entry.side,
      synthetic: entry.item.synthetic,
      label: entry.label,
      labelSource: entry.labelSource,
      probability: row.probability,
    });
  }
  const selection = selectThresholds(evaluated.filter((item) => item.side === "selection"));
  const heldout = evaluateHeldout(
    evaluated.filter((item) => item.side === "heldout"),
    selection.thresholds,
  );
  const hashes = { labelSetHash: labelSetHash(input.dataset), splitHash: input.dataset.split ? splitHash(input.dataset.split) : null };
  const { qualification, reasons } = qualify(
    selection,
    heldout,
    {
      minNegativeGroups: ENFORCEMENT_MIN_HELDOUT_NEGATIVE_GROUPS,
      minPositiveGroups: ENFORCEMENT_MIN_HELDOUT_POSITIVE_GROUPS,
      maxFalseAcceptUpper: input.maxFalseAcceptUpper,
    },
    hashes,
  );
  return {
    schema: "advisory_calibration_report_v1",
    model: input.model,
    engine: input.engine,
    maxFalseAcceptUpper: input.maxFalseAcceptUpper,
    labelSetHash: hashes.labelSetHash,
    splitHash: hashes.splitHash,
    items: { total: input.dataset.items.length, evaluated: evaluated.length, excluded },
    selection,
    heldout,
    qualification,
    qualificationReasons: reasons,
  };
}

/** `runs/<model>/<name>.jsonl`, the lexicographically last unless `--run` names one. */
export function replayRunPath(runsDir: string, model: string, explicit?: string): string {
  if (explicit) return resolve(explicit);
  const dir = join(runsDir, ...model.split("/"));
  const files = existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith(".jsonl")).sort() : [];
  if (files.length === 0) throw new Error(`advisory-calibration calibrate: no recorded run for ${model} under ${dir}`);
  return join(dir, files.at(-1)!);
}

export function readProbabilityRows(path: string): Map<string, ProbabilityRow> {
  const rows = new Map<string, ProbabilityRow>();
  for (const row of readJsonl<ProbabilityRow>(path)) rows.set(row.id, row);
  return rows;
}

export function isoStamp(date = new Date()): string {
  return date.toISOString().replaceAll(":", "-").replace(/\.\d+Z$/, "Z");
}

/** Scores items through a kernel: one decision per item on the adjudication's state and question. */
async function scoreWithKernel(
  scorable: readonly Scorable[],
  opts: { engine: "live" | "fake"; model: string; thresholds: Pick<AdvisoryThresholds, "passAt" | "failAt">; dbPath?: string; print: (line: string) => void },
): Promise<ProbabilityRow[]> {
  const fixtureP = new Map(scorable.map((entry) => [entry.item.id, entry.item.fixture_p]));
  let current: string | null = null;
  const handle = await openCalibrationKernel({
    engine: opts.engine,
    label: "calibrate",
    ...(opts.dbPath !== undefined && { dbPath: opts.dbPath }),
    fake: { probability: () => fixtureP.get(current ?? "") ?? 0.5 },
  });
  const rows: ProbabilityRow[] = [];
  let failed = true;
  try {
    for (const entry of scorable) {
      if (opts.engine === "fake" && typeof entry.item.fixture_p !== "number") continue;
      current = entry.item.id;
      const state = buildAdvisoryState({
        finding: entry.item.finding as QaScanFinding,
        hunk: entry.item.hunk,
        justification: entry.justification,
        facts: entry.item.code_facts,
      });
      const outcome = await handle.kernel.decide(`JudgeAdvisory:${entry.item.id}`, state, {
        questions: justifiedQuestions(opts.thresholds),
        model: opts.model,
        parentRunId: handle.parentRunId,
        trigger: "judge",
        requestId: `calibration:${opts.model}:${entry.item.id}:${sha256Hex(canonicalJson(state)).slice(0, 16)}`,
      });
      const answer = outcome.answers[JUSTIFIED_QUESTION_ID]!;
      const answered = typeof answer.probability === "number" && answer.abstainReason !== "engine-error" && answer.abstainReason !== "refusal";
      rows.push({
        id: entry.item.id,
        probability: answered ? answer.probability! : null,
        served_model: outcome.model,
        ...(answer.abstainReason !== undefined && !answered && { abstain_reason: answer.abstainReason }),
      });
    }
    if (opts.engine === "live") opts.print(`calibrate: ${rows.length} decisions traced in ${handle.dbPath}`);
    failed = false;
  } finally {
    await handle.close(failed ? "error" : "done");
  }
  return rows;
}

/** Records one calibration in the config: only `thresholds[model]` changes; `maxFalseAcceptUpper` is never raised. */
export function applyCalibrationToConfig(rawConfig: unknown, report: CalibrationReport, calibratedAt: string): Record<string, unknown> {
  const current = parseAdvisoryAdjudicationConfig(rawConfig);
  if (report.selection.thresholds === null) throw new Error("advisory-calibration calibrate: no feasible thresholds; nothing written");
  if (report.maxFalseAcceptUpper > current.maxFalseAcceptUpper) {
    throw new Error("advisory-calibration calibrate: the report's maxFalseAcceptUpper exceeds the config's; the tool never raises it");
  }
  const heldout = report.heldout;
  const entry: AdvisoryThresholds = {
    passAt: report.selection.thresholds.passAt,
    failAt: report.selection.thresholds.failAt,
    qualification: report.qualification,
    ...(report.labelSetHash !== null && { labelSetHash: report.labelSetHash }),
    ...(report.splitHash !== null && { splitHash: report.splitHash }),
    heldout: {
      negatives: heldout.negativeGroups,
      positives: heldout.positiveGroups,
      falseAccepts: heldout.falseAccepts ?? 0,
      upper95: heldout.upper95 ?? 1,
    },
    calibratedAt,
  };
  const raw = rawConfig as Record<string, unknown>;
  const next = {
    ...raw,
    // Kept as configured: the owner may lower it; the tool never raises it.
    maxFalseAcceptUpper: current.maxFalseAcceptUpper,
    thresholds: { ...(raw.thresholds as Record<string, unknown>), [report.model]: entry },
  };
  parseAdvisoryAdjudicationConfig(next, "calibrated config");
  return next;
}

export async function calibrateCommand(args: CalibrationArgs, print: (line: string) => void = console.log): Promise<CalibrationReport> {
  assertKnownFlags(args, ["--engine", "--dir", "--dry-run", "--write", "--config", "--model", "--run", "--limit", "--db", "--max-false-accept-upper"]);
  const engine = engineFlag(args);
  const dryRun = switchFlag(args, "--dry-run");
  const write = switchFlag(args, "--write");
  if (dryRun && write) throw new Error("advisory-calibration calibrate: --dry-run and --write are exclusive");
  if (write && engine === "fake") throw new Error("advisory-calibration calibrate: --write needs --engine live or replay (a fake calibration is never recorded)");
  if (write && args.flags.has("--limit")) throw new Error("advisory-calibration calibrate: --write records complete calibrations only; drop --limit");
  const configPath = stringFlag(args, "--config") ?? ADVISORY_ADJUDICATION_CONFIG_PATH;
  const config = readAdvisoryAdjudicationConfig(configPath);
  const model = stringFlag(args, "--model") ?? config.model;
  const requestedCap = numberFlag(args, "--max-false-accept-upper");
  if (requestedCap !== undefined && (requestedCap <= 0 || requestedCap > config.maxFalseAcceptUpper)) {
    throw new Error(`advisory-calibration calibrate: --max-false-accept-upper may only lower the configured ${config.maxFalseAcceptUpper}`);
  }
  const maxFalseAcceptUpper = requestedCap ?? config.maxFalseAcceptUpper;

  const dataset = loadDataset(stringFlag(args, "--dir") ?? DEFAULT_CALIBRATION_DIR);
  if (!dataset.split) throw new Error(`advisory-calibration calibrate: ${dataset.paths.split} is missing; run split first`);
  const excluded = emptyExcluded();
  const scorable = scorableItems(dataset, excluded);

  let probabilities: Map<string, ProbabilityRow>;
  let scoredRows: ProbabilityRow[] | null = null;
  if (engine === "replay") {
    probabilities = readProbabilityRows(replayRunPath(dataset.paths.runs, model, stringFlag(args, "--run")));
  } else {
    const limit = integerFlag(args, "--limit");
    const toScore = limit === undefined ? scorable : scorable.slice(0, limit);
    const thresholds = config.thresholds[model] ?? { passAt: 0.85, failAt: 0.15 };
    const dbPath = stringFlag(args, "--db");
    scoredRows = await scoreWithKernel(toScore, { engine, model, thresholds, ...(dbPath !== undefined && { dbPath }), print });
    probabilities = new Map(scoredRows.map((row) => [row.id, row]));
  }

  const report = buildCalibrationReport({ dataset, scorable, excluded, probabilities, model, engine, maxFalseAcceptUpper });
  if (dryRun) {
    print(JSON.stringify(report, null, 2));
    return report;
  }

  const stamp = isoStamp();
  if (scoredRows) {
    // Filed under the model that served them: a fake run never lands among the real model's runs.
    const served = engine === "fake" ? (scoredRows[0]?.served_model ?? "fake") : model;
    const runPath = join(dataset.paths.runs, ...served.split("/"), `${stamp}.jsonl`);
    writeJsonl(runPath, scoredRows);
    print(`calibrate: ${scoredRows.length} scored items → ${runPath}`);
  }
  const reportBase = join(dataset.paths.reports, stamp);
  writeJson(`${reportBase}.json`, report);
  writeFileSync(`${reportBase}.md`, renderCalibrationReport(report, stamp));
  print(`calibrate: ${report.qualification}${report.qualificationReasons.length ? ` (${report.qualificationReasons.join("; ")})` : ""} → ${reportBase}.md`);
  if (write) {
    const next = applyCalibrationToConfig(JSON.parse(readFileSync(configPath, "utf8")), report, new Date().toISOString());
    writeJson(configPath, next);
    print(`calibrate: thresholds[${model}] recorded in ${configPath}`);
  }
  return report;
}
