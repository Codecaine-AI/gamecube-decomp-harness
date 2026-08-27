import { formatElapsed } from "@/components/details-rail/_lib/time";
import type { BoundaryAttempt, BoundaryStep, BoundaryStepState, BoundaryView, Dashboard } from "@/lib/format";

const LABELS: Record<string, string> = {
  integration_drain: "Integration drain", snapshot_commit: "Snapshot commit", worktree_prepare: "Worktree prepare",
  configure: "Configure", report_build: "Report build", report_read: "Report read", confirmation_pass: "Confirmation pass",
  qa_scan: "QA scan", report_publish: "Report publish", regression_repair: "Regression repair", save_point: "Save point",
  boundary_sync: "Boundary sync", master_breakage_gate: "Master breakage gate", ci_parity_gate: "CI parity gate",
  pre_commit_gate: "Pre-commit gate", draft_pr_publish: "Draft PR publish", knowledge_maintenance: "Knowledge maintenance",
  typed_close: "Typed close", admission: "Next-epoch admission",
};

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
  expansion: { facts: Array<[string, string]>; sections: ExpansionSection[] } | null;
}
export interface AttemptSummary { attempt: number; outcome: string; duration: string }
export interface BoundaryPanelModel {
  view: BoundaryView;
  attempt: BoundaryAttempt;
  status: string;
  attemptBadge: string | null;
  rows: BoundaryStepRow[];
  priorAttempts: AttemptSummary[];
  reconciledBanner: string | null;
  errorBanner: { error: string; failingTu: string | null; retry: string } | null;
}

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
  if (!payload) return null;
  const facts: Array<[string, string]> = [];
  const sections: ExpansionSection[] = [];
  if (step.key === "boundary_sync") {
    const before = String(payload.anchor_before ?? "-");
    const after = String(payload.anchor_after ?? "-");
    facts.push(["Anchor", `${before} → ${after}`]);
    if (payload.merge_commit_sha) facts.push(["Merge SHA", String(payload.merge_commit_sha)]);
    const displaced = objectStrings(payload.displaced, ["target_key", "unit", "symbol", "prior_kind", "prior_score", "upstream_landed_sha"]);
    facts.push(["Displaced", String(payload.displaced_count ?? displaced.length)]);
    const section = capped("Displaced targets", displaced); if (section) sections.push(section);
  }
  for (const [key, label, fields] of [
    ["breakages", "Breakages", ["unit", "symbol", "target_key"]], ["reasons", "Reasons", []],
    ["errors", "QA errors", ["file", "unit", "message"]], ["qa_errors", "QA errors", ["file", "unit", "message"]],
  ] as const) {
    const values = fields.length ? objectStrings(payload[key], [...fields]) : strings(payload[key]);
    const section = capped(label, values); if (section) sections.push(section);
  }
  return facts.length || sections.length ? { facts, sections } : null;
}

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

function attemptDuration(attempt: BoundaryAttempt): string {
  return formatElapsed(attempt.startedAt, attempt.finishedAt);
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
  const error = attempt.error;
  const status = attempt.reconciled ? "reconciled" : view.epochStatus === "error" ? "error" : (view.active || schedulerBoundary) ? "running" : view.boundaryStatus ?? view.epochStatus;
  return {
    view, attempt, status, attemptBadge: view.attempts.length > 1 ? `attempt ${attempt.attempt}` : null, rows: stepRows(attempt),
    priorAttempts: view.attempts.slice(0, -1).map((item) => ({ attempt: item.attempt, outcome: outcome(item), duration: attemptDuration(item) })),
    reconciledBanner: attempt.reconciled ? "reconciled: report/gates/PR/pr_sync skipped" : null,
    errorBanner: view.epochStatus === "error" ? { error: error ?? "Epoch boundary failed.", failingTu: failingTranslationUnit(error), retry: "boundary will retry on next scheduler tick" } : null,
  };
}

export function recentBoundaries(dashboard: Dashboard | null): BoundaryView[] {
  return dashboard?.boundary?.recent ?? [];
}
