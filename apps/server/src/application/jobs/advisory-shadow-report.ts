// `advisory-shadow-report` (plan §5 M9-D task 2, owner D5): how often enforce
// WOULD have accepted the shadow-adjudicated advisories. Reads the
// orchestrator store read-only; never writes, never calls a model.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Database } from "bun:sqlite";

import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";

const USAGE = "Usage: advisory-shadow-report [--run <id>] [--since <iso>] [--thresholds <file>]";
/** `p` histogram bin width. */
export const SHADOW_REPORT_BIN_WIDTH = 0.05;
const BIN_COUNT = Math.round(1 / SHADOW_REPORT_BIN_WIDTH);
/** The reason `runPostReturnCheck` records when no post-return command is configured (worker-cycle.ts). */
const POST_RETURN_NOT_CONFIGURED = "no --post-return-check-command configured";

export interface ShadowReportFilters {
  runId?: string;
  /** ISO timestamp; checkpoints validated at or after it. */
  since?: string;
}

/** An alternative threshold pair; `model` limits it to adjudications that requested that model. */
export interface ShadowReportThresholds {
  label: string;
  passAt: number;
  failAt: number;
  model?: string;
}

export interface ShadowWouldAccept {
  label: string;
  /** "recorded": each adjudication's own thresholds (the configuration the lane ran with). */
  source: "recorded" | "alternative";
  passAt: number | null;
  failAt: number | null;
  model: string | null;
  /** Adjudications the thresholds apply to. */
  evaluated: number;
  count: number;
  rate: number | null;
  /** Would-accepts whose post-return check never ran (a configured check could still reject them). */
  unknown_post_return_check_not_run: number;
}

export interface AdvisoryShadowReport {
  schema: "advisory_shadow_report_v1";
  filters: { run: string | null; since: string | null };
  eligible: number;
  adjudicated: number;
  pending: number;
  extraction: Record<"ok" | "error" | "skipped" | "unknown", number>;
  verdicts: Record<"pass" | "fail" | "abstain" | "error" | "unknown", number>;
  decisions: {
    /** Warning advisories that reached a decision node. */
    count: number;
    abstain: number;
    abstain_rate: number | null;
    /** Abstained decisions by `abstain_reason`. */
    abstain_reasons: Record<string, number>;
    engine_error: number;
    engine_error_rate: number | null;
    histogram: Array<{ from: number; to: number; count: number }>;
  };
  /** Distinct thresholds recorded on the adjudications. */
  recorded_thresholds: Array<{ passAt: number; failAt: number; qualification: string | null; count: number }>;
  would_accept: ShadowWouldAccept[];
}

interface ShadowCheckpointRow {
  id: string;
  post_return_check: string | null;
  post_return_meta: string | null;
  adjudication: string | null;
}

interface AdvisoryView {
  severity: string | null;
  result: string | null;
  probability: number | null;
  abstainReason: string | null;
  /** The decision node ran (an answer, an abstain, or an engine error). */
  decided: boolean;
  /** The outcome came from comparing `probability` with the thresholds, so other thresholds can change it. */
  thresholdBound: boolean;
  readableLine: boolean;
}

interface AdjudicationView {
  verdict: string | null;
  extraction: string | null;
  modelRequested: string | null;
  thresholds: { passAt: number; failAt: number; qualification: string | null } | null;
  advisories: AdvisoryView[];
}

interface CheckpointView {
  postReturnNotRun: boolean;
  adjudication: AdjudicationView | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function parseJson(raw: string | null): unknown {
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function adjudicationView(raw: unknown): AdjudicationView | null {
  if (!isRecord(raw)) return null;
  const thresholds = isRecord(raw.thresholds) ? raw.thresholds : null;
  const passAt = finite(thresholds?.passAt);
  const failAt = finite(thresholds?.failAt);
  const advisories = Array.isArray(raw.advisories) ? raw.advisories.filter(isRecord) : [];
  return {
    verdict: text(raw.verdict),
    extraction: isRecord(raw.extraction) ? text(raw.extraction.status) : null,
    modelRequested: isRecord(raw.model) ? text(raw.model.requested) : null,
    thresholds: passAt !== null && failAt !== null ? { passAt, failAt, qualification: text(thresholds?.qualification) } : null,
    advisories: advisories.map((advisory) => {
      const probability = finite(advisory.probability);
      const result = text(advisory.result);
      const abstainReason = text(advisory.abstain_reason);
      return {
        severity: text(advisory.severity),
        result,
        probability,
        abstainReason,
        decided: probability !== null || isRecord(advisory.decision),
        thresholdBound: probability !== null && (
          result === "pass"
          || (result === "abstain" && abstainReason === "low-confidence")
          || (result === "fail" && advisory.fail_reason === "judged-unjustified")),
        readableLine: typeof advisory.fingerprint === "string" && advisory.fingerprint.length > 0,
      };
    }),
  };
}

/** True unless the checkpoint shows that no post-return command was configured (nothing would have run). */
function postReturnConfigured(raw: unknown): boolean {
  if (!isRecord(raw)) return true;
  const reasons = Array.isArray(raw.reasons) ? raw.reasons : [];
  return !(raw.status === "skipped" && reasons.includes(POST_RETURN_NOT_CONFIGURED));
}

function checkpointView(row: ShadowCheckpointRow): CheckpointView {
  return {
    postReturnNotRun: row.post_return_check === "not-run" && postReturnConfigured(parseJson(row.post_return_meta)),
    adjudication: row.adjudication === null ? null : adjudicationView(parseJson(row.adjudication)),
  };
}

/**
 * Enforce accepts a checkpoint only when extraction succeeded and every
 * warning was accepted with a readable flagged line (the fold, §6.5). Only
 * outcomes that came from the thresholds (pass, low-confidence abstain,
 * judged unjustified) are re-evaluated at `passAt`; a missing justification,
 * an engine error, an unverified served model or an unreadable line rejects
 * at any thresholds. Info advisories never block.
 */
function wouldAcceptAt(view: AdjudicationView, passAt: number): boolean {
  if (view.extraction !== "ok" || view.verdict === "error") return false;
  const warnings = view.advisories.filter((advisory) => advisory.severity === "warning");
  return warnings.length > 0 && warnings.every((advisory) =>
    advisory.thresholdBound && advisory.readableLine && advisory.probability !== null && advisory.probability >= passAt);
}

function rate(count: number, total: number): number | null {
  return total === 0 ? null : Math.round((count / total) * 10_000) / 10_000;
}

/** Bin index for `p` in [0, 1]; integer arithmetic so 0.15 lands in [0.15, 0.20). */
function binOf(p: number): number {
  const micro = Math.round(Math.min(1, Math.max(0, p)) * 1_000_000);
  return Math.min(BIN_COUNT - 1, Math.floor(micro / Math.round(SHADOW_REPORT_BIN_WIDTH * 1_000_000)));
}

function bump<K extends string>(counts: Record<K, number>, key: string | null, fallback: K): void {
  const slot = (key !== null && key in counts ? key : fallback) as K;
  counts[slot] += 1;
}

function wouldAcceptFor(
  views: CheckpointView[],
  set: { label: string; source: ShadowWouldAccept["source"]; passAt: number | null; failAt: number | null; model: string | null },
  passAtOf: (view: AdjudicationView) => number | null,
): ShadowWouldAccept {
  let evaluated = 0;
  let count = 0;
  let unknown = 0;
  for (const view of views) {
    const adjudication = view.adjudication;
    if (!adjudication) continue;
    if (set.model !== null && adjudication.modelRequested !== set.model) continue;
    const passAt = passAtOf(adjudication);
    if (passAt === null) continue;
    evaluated += 1;
    if (!wouldAcceptAt(adjudication, passAt)) continue;
    count += 1;
    if (view.postReturnNotRun) unknown += 1;
  }
  return { ...set, evaluated, count, rate: rate(count, evaluated), unknown_post_return_check_not_run: unknown };
}

/** Builds the report from an open orchestrator database. Read-only: SELECTs only. */
export function buildAdvisoryShadowReport(
  db: Database,
  filters: ShadowReportFilters = {},
  alternatives: ShadowReportThresholds[] = [],
): AdvisoryShadowReport {
  const rows = db.query<ShadowCheckpointRow, [string | null, string | null]>(`
    SELECT c.id,
      json_extract(c.metadata_json, '$.llm_review_candidate.post_return_check') AS post_return_check,
      json_extract(c.metadata_json, '$.post_return_check') AS post_return_meta,
      json_extract(c.metadata_json, '$.llm_review_adjudication') AS adjudication
    FROM worker_checkpoints c
    WHERE c.qa_status = 'warnings'
      AND CASE WHEN json_valid(c.metadata_json)
            THEN json_extract(c.metadata_json, '$.llm_review_candidate.eligible') = 1
             AND json_extract(c.metadata_json, '$.llm_review_candidate.mode') = 'shadow'
            ELSE 0 END
      AND (?1 IS NULL OR c.run_id = ?1)
      AND (?2 IS NULL OR c.validation_time >= ?2)
    ORDER BY c.validation_time, c.id`).all(filters.runId ?? null, filters.since ?? null);
  const views = rows.map(checkpointView);
  const adjudications = views.flatMap((view) => (view.adjudication ? [view.adjudication] : []));

  const extraction = { ok: 0, error: 0, skipped: 0, unknown: 0 };
  const verdicts = { pass: 0, fail: 0, abstain: 0, error: 0, unknown: 0 };
  const histogram = Array.from({ length: BIN_COUNT }, (_, index) => ({
    from: Math.round(index * SHADOW_REPORT_BIN_WIDTH * 100) / 100,
    to: Math.round((index + 1) * SHADOW_REPORT_BIN_WIDTH * 100) / 100,
    count: 0,
  }));
  const recorded = new Map<string, AdvisoryShadowReport["recorded_thresholds"][number]>();
  const abstainReasons: Record<string, number> = {};
  let decided = 0;
  let abstain = 0;
  let engineError = 0;
  for (const adjudication of adjudications) {
    bump(extraction, adjudication.extraction, "unknown");
    bump(verdicts, adjudication.verdict, "unknown");
    if (adjudication.thresholds) {
      const { passAt, failAt, qualification } = adjudication.thresholds;
      const key = JSON.stringify([passAt, failAt, qualification]);
      const entry = recorded.get(key) ?? { passAt, failAt, qualification, count: 0 };
      entry.count += 1;
      recorded.set(key, entry);
    }
    for (const advisory of adjudication.advisories) {
      if (advisory.severity !== "warning" || !advisory.decided) continue;
      decided += 1;
      if (advisory.result === "abstain") {
        abstain += 1;
        const reason = advisory.abstainReason ?? "unknown";
        abstainReasons[reason] = (abstainReasons[reason] ?? 0) + 1;
      }
      if (advisory.abstainReason === "engine-error") engineError += 1;
      if (advisory.probability !== null) histogram[binOf(advisory.probability)]!.count += 1;
    }
  }

  return {
    schema: "advisory_shadow_report_v1",
    filters: { run: filters.runId ?? null, since: filters.since ?? null },
    eligible: views.length,
    adjudicated: adjudications.length,
    pending: views.length - adjudications.length,
    extraction,
    verdicts,
    decisions: {
      count: decided,
      abstain,
      abstain_rate: rate(abstain, decided),
      abstain_reasons: abstainReasons,
      engine_error: engineError,
      engine_error_rate: rate(engineError, decided),
      histogram,
    },
    recorded_thresholds: [...recorded.values()],
    would_accept: [
      wouldAcceptFor(
        views,
        { label: "configured", source: "recorded", passAt: null, failAt: null, model: null },
        (view) => view.thresholds?.passAt ?? null,
      ),
      ...alternatives.map((set) => wouldAcceptFor(
        views,
        { label: set.label, source: "alternative", passAt: set.passAt, failAt: set.failAt, model: set.model ?? null },
        () => set.passAt,
      )),
    ],
  };
}

function thresholdPair(raw: unknown, where: string): { passAt: number; failAt: number } {
  const passAt = isRecord(raw) ? finite(raw.passAt) : null;
  const failAt = isRecord(raw) ? finite(raw.failAt) : null;
  if (passAt === null || failAt === null || passAt < 0 || passAt > 1 || failAt < 0 || failAt > passAt) {
    throw new Error(`${where} needs numeric passAt and failAt with 0 <= failAt <= passAt <= 1`);
  }
  return { passAt, failAt };
}

/**
 * Alternative thresholds from a JSON file: one `{ passAt, failAt }` pair, an
 * array of `{ label?, passAt, failAt }`, or an advisory-adjudication
 * `config.json` (`{ thresholds: { "<model>": { passAt, failAt, ... } } }`),
 * whose entries apply only to adjudications that requested that model.
 */
export function parseShadowReportThresholds(raw: unknown, source = "--thresholds"): ShadowReportThresholds[] {
  if (Array.isArray(raw)) {
    if (raw.length === 0) throw new Error(`${source} lists no thresholds`);
    return raw.map((entry, index) => ({
      label: isRecord(entry) && typeof entry.label === "string" && entry.label ? entry.label : `alternative-${index + 1}`,
      ...thresholdPair(entry, `${source}[${index}]`),
    }));
  }
  if (isRecord(raw) && isRecord(raw.thresholds)) {
    const entries = Object.entries(raw.thresholds);
    if (entries.length === 0) throw new Error(`${source} config has no thresholds`);
    return entries.map(([model, entry]) => ({ label: model, model, ...thresholdPair(entry, `${source} thresholds.${model}`) }));
  }
  return [{ label: "alternative", ...thresholdPair(raw, source) }];
}

function optionalString(args: Map<string, string | true>, name: string): string | undefined {
  const raw = args.get(name);
  if (raw === true) throw new Error(`Missing value for ${name}. ${USAGE}`);
  return typeof raw === "string" && raw.trim() ? raw.trim() : undefined;
}

export async function advisoryShadowReport(
  globals: GlobalArgs,
  args: Map<string, string | true>,
  dependencies: { print?: (report: AdvisoryShadowReport) => void } = {},
): Promise<void> {
  const runId = optionalString(args, "--run");
  const sinceArg = optionalString(args, "--since");
  const since = sinceArg === undefined ? undefined : Date.parse(sinceArg);
  if (since !== undefined && Number.isNaN(since)) throw new Error(`--since must be an ISO timestamp. ${USAGE}`);
  const thresholdsPath = optionalString(args, "--thresholds");
  const alternatives = thresholdsPath === undefined
    ? []
    : parseShadowReportThresholds(JSON.parse(readFileSync(resolve(thresholdsPath), "utf8")), thresholdsPath);

  const databasePath = resolve(globals.stateDir, "orchestrator.sqlite");
  if (!existsSync(databasePath)) throw new Error(`Orchestrator state database not found: ${databasePath}`);
  const db = new Database(databasePath, { readonly: true, strict: true });
  let report: AdvisoryShadowReport;
  try {
    report = buildAdvisoryShadowReport(db, {
      ...(runId !== undefined ? { runId } : {}),
      ...(since !== undefined ? { since: new Date(since).toISOString() } : {}),
    }, alternatives);
  } finally {
    db.close();
  }
  (dependencies.print ?? ((value) => console.log(JSON.stringify(value, null, 2))))(report);
}
