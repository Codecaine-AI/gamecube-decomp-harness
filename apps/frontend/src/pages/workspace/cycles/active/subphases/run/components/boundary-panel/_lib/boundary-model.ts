import { formatElapsed } from "@/components/details-rail/_lib/time";
import type { BoundaryAttempt, BoundaryStep, BoundaryStepState, BoundaryView, Dashboard } from "@/lib/format";

const LABELS: Record<string, string> = {
  integration_drain: "Integration drain", snapshot_commit: "Snapshot commit", worktree_prepare: "Worktree prepare",
  configure: "Configure", report_build: "Report build", report_read: "Report read", confirmation_pass: "Confirmation pass",
  qa_scan: "QA scan", report_publish: "Report publish", regression_repair: "Regression repair", save_point: "Save point",
  boundary_sync: "Boundary sync", master_breakage_gate: "Master breakage gate", ci_parity_gate: "CI parity gate",
  pre_commit_gate: "Pre-commit gate", draft_pr_publish: "Draft PR publish", knowledge_maintenance: "Knowledge maintenance",
  typed_close: "Typed close", admission: "Next-epoch admission", link_complete_units: "Link complete units",
  report_build_fixer: "Report build fixer",
};

export function stepLabel(key: string): string { return LABELS[key] ?? key.replaceAll("_", " "); }

export const STEP_GLYPHS: Record<BoundaryStepState, { className: string; glyph: string }> = {
  done: { className: "text-up", glyph: "✓" }, running: { className: "text-fg", glyph: "▸" },
  failed: { className: "text-down", glyph: "✕" }, warning: { className: "text-warn", glyph: "!" },
  skipped: { className: "text-dim", glyph: "–" }, pending: { className: "text-dim", glyph: "·" },
};

export interface ExpansionSection { label: string; values: string[]; remaining: number }
export interface BoundaryStepRow extends BoundaryStep {
  label: string;
  duration: string;
  tone: string;
  expandable: boolean;
  expansion: { facts: Array<[string, string]>; sections: ExpansionSection[]; errorText: string | null } | null;
}
export interface PriorAttemptModel {
  attempt: number; outcome: string; duration: string; startedAt: string | null; finishedAt: string | null;
  error: string | null; failedStep: string | null; failedStepLabel: string | null; rows: BoundaryStepRow[];
}
export interface BoundaryPanelModel {
  view: BoundaryView;
  attempt: BoundaryAttempt;
  status: string;
  attemptBadge: string | null;
  rows: BoundaryStepRow[];
  priorAttempts: PriorAttemptModel[];
  reconciledBanner: string | null;
  errorBanner: { error: string; failingTu: string | null; retry: string; failedStepLabel: string | null } | null;
}

type StepWithError = BoundaryStep & { error?: string | null };
type AttemptWithDetail = BoundaryAttempt & { failedStep?: string | null; artifactDir?: string | null };
type ViewWithDetail = BoundaryView & {
  error?: string | null;
  retry?: { attemptCount: number; maxAttempts: number | null; nextAttemptAt: string | null; exhausted: boolean } | null;
};

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => typeof item === "string" ? item : JSON.stringify(item)).filter(Boolean);
}

function objectStrings(value: unknown, fields: string[]): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    if (!item || typeof item !== "object") return String(item);
    const record = item as Record<string, unknown>;
    return fields.map((field) => record[field]).filter((part) => part !== null && part !== undefined && part !== "").join(" · ");
  }).filter(Boolean);
}

function capped(label: string, values: string[]): ExpansionSection | null {
  return values.length ? { label, values: values.slice(0, 12), remaining: Math.max(0, values.length - 12) } : null;
}

export function expansionForStep(step: BoundaryStep): BoundaryStepRow["expansion"] {
  const payload = step.payload;
  const errorText = (step as StepWithError).error?.trim() ? (step as StepWithError).error! : null;
  const facts: Array<[string, string]> = [];
  const sections: ExpansionSection[] = [];
  const consumed = new Set(["breakages", "reasons", "errors", "qa_errors"]);
  if (payload && step.key === "boundary_sync") {
    ["anchor_before", "anchor_after", "merge_commit_sha", "displaced_count", "displaced"].forEach((key) => consumed.add(key));
    const before = String(payload.anchor_before ?? "-");
    const after = String(payload.anchor_after ?? "-");
    facts.push(["Anchor", `${before} → ${after}`]);
    if (payload.merge_commit_sha) facts.push(["Merge SHA", String(payload.merge_commit_sha)]);
    const displaced = objectStrings(payload.displaced, ["target_key", "unit", "symbol", "prior_kind", "prior_score", "upstream_landed_sha"]);
    facts.push(["Displaced", String(payload.displaced_count ?? displaced.length)]);
    const section = capped("Displaced targets", displaced); if (section) sections.push(section);
  }
  for (const [key, label, fields] of payload ? [
    ["breakages", "Breakages", ["unit", "symbol", "target_key"]], ["reasons", "Reasons", []],
    ["errors", "QA errors", ["file", "unit", "message"]], ["qa_errors", "QA errors", ["file", "unit", "message"]],
  ] as const : []) {
    const values = fields.length ? objectStrings(payload?.[key], [...fields]) : strings(payload?.[key]);
    const section = capped(label, values); if (section) sections.push(section);
  }
  const ignored = new Set(["status", "phase", "message", "label", "created_by"]);
  for (const [key, value] of Object.entries(payload ?? {})) {
    if (consumed.has(key) || ignored.has(key) || value === null || value === undefined) continue;
    const label = LABELS[key] ?? key.replaceAll("_", " ");
    if (["string", "number", "boolean"].includes(typeof value)) facts.push([label, truncate(String(value))]);
    else if (Array.isArray(value)) { const section = capped(label, strings(value)); if (section) sections.push(section); }
    else if (typeof value === "object") facts.push([label, truncate(JSON.stringify(value))]);
  }
  return facts.length || sections.length || errorText ? { facts, sections, errorText } : null;
}

function truncate(value: string): string { return value.length > 200 ? `${value.slice(0, 200)}…` : value; }

export function failingTranslationUnit(error: string | null): string | null {
  if (!error) return null;
  const match = error.match(/(?:^|[\s'"`:(])([^\s'"`():]+\.(?:o|c))(?=$|[\s'"`),:])/i);
  return match?.[1] ?? null;
}

export function stepRows(attempt: BoundaryAttempt): BoundaryStepRow[] {
  return attempt.steps.map((step) => {
    const expansion = expansionForStep(step);
    return {
      ...step, label: LABELS[step.key] ?? step.key.replaceAll("_", " "),
      duration: step.state === "running" ? formatElapsed(step.startedAt) : step.durationMs !== null ? durationFromMs(step.durationMs) : formatElapsed(step.startedAt, step.finishedAt),
      tone: STEP_GLYPHS[step.state].className, expandable: Boolean(expansion) || step.state === "failed" || step.state === "warning", expansion,
    };
  });
}

function durationFromMs(milliseconds: number): string {
  return formatElapsed("1970-01-01T00:00:00.000Z", new Date(Math.max(0, milliseconds)).toISOString());
}

function attemptEnd(attempt: BoundaryAttempt): string | null {
  if (attempt.finishedAt) return attempt.finishedAt;
  const candidates = attempt.steps.flatMap((step) => [step.finishedAt, step.startedAt]).filter((value): value is string => Boolean(value));
  return candidates.reduce<string | null>((latest, value) => !latest || Date.parse(value) > Date.parse(latest) ? value : latest, null);
}

function attemptDuration(attempt: BoundaryAttempt): string {
  const end = attemptEnd(attempt);
  return end ? formatElapsed(attempt.startedAt, end) || "—" : "—";
}

function outcome(attempt: BoundaryAttempt): string {
  if (attempt.reconciled) return "reconciled";
  if (attempt.error || attempt.steps.some((step) => step.state === "failed")) return "error";
  if (attempt.steps.some((step) => step.state === "running")) return "running";
  if (attempt.steps.some((step) => step.state === "warning")) return "warning";
  return attempt.finishedAt ? "success" : "pending";
}

export function selectBoundaryView(dashboard: Dashboard | null): BoundaryView | null {
  return dashboard?.boundary?.current ?? null;
}

export function boundaryPanelModel(dashboard: Dashboard | null, schedulerBoundary = false): BoundaryPanelModel | null {
  const view = selectBoundaryView(dashboard);
  if (!view || view.attempts.length === 0) return null;
  const attempt = view.attempts[view.attempts.length - 1];
  const detailedView = view as ViewWithDetail;
  const detailedAttempt = attempt as AttemptWithDetail;
  const error = attempt.error ?? detailedView.error ?? null;
  const retry = detailedView.retry;
  const failedStep = detailedAttempt.failedStep ?? attempt.steps.find((step) => step.state === "failed")?.key ?? null;
  const status = attempt.reconciled ? "reconciled" : view.epochStatus === "error" ? "error" : (view.active || schedulerBoundary) ? "running" : view.boundaryStatus ?? view.epochStatus;
  return {
    view, attempt, status, attemptBadge: retry?.maxAttempts ? `attempt ${attempt.attempt} of ${retry.maxAttempts}` : view.attempts.length > 1 ? `attempt ${attempt.attempt}` : null, rows: stepRows(attempt),
    priorAttempts: priorAttemptModels(view.attempts.slice(0, -1)),
    reconciledBanner: attempt.reconciled ? "reconciled: report/gates/PR/pr_sync skipped" : null,
    errorBanner: view.epochStatus === "error" ? {
      error: error ?? "Epoch boundary failed.", failingTu: failingTranslationUnit(error), failedStepLabel: failedStep ? labelForStep(failedStep) : null,
      retry: retry ? retry.exhausted ? `retries exhausted after ${retry.attemptCount} attempt(s); run parked for operator recovery` : `retry ${retry.attemptCount + 1}${retry.maxAttempts ? `/${retry.maxAttempts}` : ""} scheduled${retry.nextAttemptAt ? ` for ${retry.nextAttemptAt}` : " on next scheduler tick"}` : "boundary will retry on next scheduler tick",
    } : null,
  };
}

function labelForStep(key: string): string { return stepLabel(key); }

function priorAttemptModel(item: BoundaryAttempt): PriorAttemptModel {
  const detailed = item as AttemptWithDetail;
  const failedStep = detailed.failedStep ?? item.steps.find((step) => step.state === "failed")?.key ?? null;
  return {
    attempt: item.attempt, outcome: outcome(item), duration: attemptDuration(item), startedAt: item.startedAt, finishedAt: item.finishedAt,
    error: item.error, failedStep, failedStepLabel: failedStep ? labelForStep(failedStep) : null, rows: stepRows(item),
  };
}

export function priorAttemptModels(attempts: BoundaryAttempt[]): PriorAttemptModel[] {
  return attempts.map(priorAttemptModel);
}

export function boundaryViewSummary(view: BoundaryView): { attempts: number; lastOutcome: string; failedStepLabel: string | null; error: string | null; durationTotal: string } {
  const last = view.attempts.at(-1);
  const detailedView = view as ViewWithDetail;
  const detailedAttempt = last as AttemptWithDetail | undefined;
  const failedStep = detailedAttempt?.failedStep ?? last?.steps.find((step) => step.state === "failed")?.key ?? null;
  const durations = view.attempts.map((item) => {
    const start = Date.parse(item.startedAt ?? ""); const end = Date.parse(attemptEnd(item) ?? "");
    return Number.isFinite(start) && Number.isFinite(end) && end >= start ? end - start : null;
  }).filter((value): value is number => value !== null);
  return {
    attempts: view.attempts.length, lastOutcome: last ? outcome(last) : "pending", failedStepLabel: failedStep ? labelForStep(failedStep) : null,
    error: last?.error ?? detailedView.error ?? null, durationTotal: durations.length ? durationFromMs(durations.reduce((sum, value) => sum + value, 0)) : "—",
  };
}

export function recentBoundaries(dashboard: Dashboard | null): BoundaryView[] {
  return dashboard?.boundary?.recent ?? [];
}
