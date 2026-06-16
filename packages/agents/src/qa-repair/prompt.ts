import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { QaRepairQueueItem } from "@decomp-orchestrator/core/qa/repair-lane";
import type { PiPromptBundle, RunProjectMetadata } from "@decomp-orchestrator/core/types";
import { globalStandardsPromptXml } from "@decomp-orchestrator/knowledge";
import { readTemplate, renderTemplate, stableJson } from "../runtime/index.js";
import { availableToolsPromptXml, type AgentToolRuntimeContext } from "../tools/index.js";

export const QA_REPAIR_AGENT_SCHEMA_VERSION = "melee_qa_repair_result_v1";

export type QaRepairAgentOutcome = "fixed" | "needs_rework" | "blocked" | "false_positive";
export type QaRepairScoreImpact = "same_match" | "lower_score" | "unknown";
export type QaRepairFindingDisposition = "fixed_source" | "fixed_by_minimal_revert" | "left_with_evidence" | "false_positive";

export interface QaRepairAgentResult {
  schema_version: typeof QA_REPAIR_AGENT_SCHEMA_VERSION;
  item_id: string;
  source_path: string;
  outcome: QaRepairAgentOutcome;
  score_impact: QaRepairScoreImpact;
  summary: string;
  edits: string[];
  validation: Array<{
    command: string;
    status: "passed" | "failed" | "not_run";
    artifact_path: string | null;
    notes: string;
  }>;
  finding_dispositions: Array<{
    rule_id: string;
    line: number | null;
    disposition: QaRepairFindingDisposition;
    evidence: string;
  }>;
  remaining_findings: Array<{
    rule_id: string;
    line: number | null;
    reason: string;
  }>;
  risks: string[];
}

export interface QaRepairPromptOptions {
  item: QaRepairQueueItem;
  queueSummary?: unknown;
  repoRoot?: string;
  stateDir?: string;
  project?: RunProjectMetadata;
}

function templatePath(name: "system" | "initial_user" | "schema"): string {
  return fileURLToPath(new URL(name === "schema" ? "./schema.json" : `./templates/${name}.md`, import.meta.url));
}

function toolContext(options: QaRepairPromptOptions): AgentToolRuntimeContext {
  const repoRoot = options.repoRoot ?? ".";
  return {
    role: "qa-repair",
    cwd: repoRoot,
    repoRoot,
    stateDir: options.stateDir,
    project: options.project,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberOrNull(value: unknown): number | null {
  if (value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function scoreImpactValue(value: unknown): QaRepairScoreImpact | null {
  const raw = stringValue(value);
  if (raw === "same_match" || raw === "lower_score" || raw === "unknown") return raw;
  if (raw === "not_checked" || raw === "not_measured" || raw === "not_run") return "unknown";
  return null;
}

function validationRows(value: unknown): QaRepairAgentResult["validation"] | null {
  if (!Array.isArray(value)) return null;
  const rows: QaRepairAgentResult["validation"] = [];
  for (const raw of value) {
    if (!isRecord(raw)) return null;
    const rawStatus = stringValue(raw.status);
    const status = rawStatus === "warned" || rawStatus === "warning_only" ? "passed" : rawStatus === "skipped" ? "not_run" : rawStatus;
    if (status !== "passed" && status !== "failed" && status !== "not_run") return null;
    rows.push({
      command: stringValue(raw.command),
      status,
      artifact_path: raw.artifact_path === null ? null : stringValue(raw.artifact_path) || null,
      notes: stringValue(raw.notes),
    });
  }
  return rows;
}

function remainingFindings(value: unknown): QaRepairAgentResult["remaining_findings"] | null {
  if (!Array.isArray(value)) return null;
  const rows: QaRepairAgentResult["remaining_findings"] = [];
  for (const raw of value) {
    if (!isRecord(raw)) return null;
    rows.push({
      rule_id: stringValue(raw.rule_id),
      line: numberOrNull(raw.line),
      reason: stringValue(raw.reason),
    });
  }
  return rows;
}

function findingDispositions(value: unknown): QaRepairAgentResult["finding_dispositions"] | null {
  if (!Array.isArray(value)) return null;
  const rows: QaRepairAgentResult["finding_dispositions"] = [];
  for (const raw of value) {
    if (!isRecord(raw)) return null;
    const disposition = stringValue(raw.disposition);
    if (disposition !== "fixed_source" && disposition !== "fixed_by_minimal_revert" && disposition !== "left_with_evidence" && disposition !== "false_positive") return null;
    rows.push({
      rule_id: stringValue(raw.rule_id),
      line: numberOrNull(raw.line),
      disposition,
      evidence: stringValue(raw.evidence),
    });
  }
  return rows;
}

export function validateQaRepairAgentResult(value: unknown): { result: QaRepairAgentResult | null; errors: string[] } {
  if (!isRecord(value)) return { result: null, errors: ["result is not an object"] };
  const errors: string[] = [];
  if (value.schema_version !== QA_REPAIR_AGENT_SCHEMA_VERSION) errors.push(`schema_version must be ${QA_REPAIR_AGENT_SCHEMA_VERSION}`);
  const outcome = stringValue(value.outcome);
  if (!["fixed", "needs_rework", "blocked", "false_positive"].includes(outcome)) errors.push("outcome is not a valid QA repair outcome");
  const scoreImpact = scoreImpactValue(value.score_impact);
  if (!scoreImpact) errors.push("score_impact is not valid");
  const validation = validationRows(value.validation);
  if (!validation) errors.push("validation must be an array of command/status rows");
  const remaining = remainingFindings(value.remaining_findings);
  if (!remaining) errors.push("remaining_findings must be an array");
  const dispositions = findingDispositions(value.finding_dispositions);
  if (!dispositions) errors.push("finding_dispositions must be an array");
  const edits = stringArray(value.edits);
  if (!Array.isArray(value.edits)) errors.push("edits must be an array");
  const risks = stringArray(value.risks);
  if (!Array.isArray(value.risks)) errors.push("risks must be an array");
  const itemId = stringValue(value.item_id);
  const sourcePath = stringValue(value.source_path);
  const summary = stringValue(value.summary);
  if (!itemId) errors.push("item_id is required");
  if (!sourcePath) errors.push("source_path is required");
  if (!summary) errors.push("summary is required");
  if (errors.length > 0 || !validation || !remaining || !dispositions) return { result: null, errors };
  return {
    result: {
      schema_version: QA_REPAIR_AGENT_SCHEMA_VERSION,
      item_id: itemId,
      source_path: sourcePath,
      outcome: outcome as QaRepairAgentOutcome,
      score_impact: scoreImpact!,
      summary,
      edits,
      validation,
      finding_dispositions: dispositions,
      remaining_findings: remaining,
      risks,
    },
    errors: [],
  };
}

export function qaRepairPrompt(options: QaRepairPromptOptions): PiPromptBundle {
  const systemTemplatePath = templatePath("system");
  const userTemplatePath = templatePath("initial_user");
  const values = {
    AVAILABLE_TOOLS_XML: availableToolsPromptXml(toolContext(options)),
    DECOMP_STANDARDS_XML: globalStandardsPromptXml(),
    QA_REPAIR_ITEM_JSON: stableJson(options.item),
    QA_REPAIR_QUEUE_SUMMARY_JSON: stableJson(options.queueSummary ?? {}),
    QA_REPAIR_OUTPUT_SCHEMA_JSON: stableJson(JSON.parse(readFileSync(templatePath("schema"), "utf8"))),
  };
  return {
    systemPrompt: renderTemplate(readTemplate(systemTemplatePath), values),
    userPrompt: renderTemplate(readTemplate(userTemplatePath), values),
    systemTemplatePath,
    userTemplatePath,
  };
}
