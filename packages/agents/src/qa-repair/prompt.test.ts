import { describe, expect, test } from "bun:test";
import { buildQaRepairQueue, type QaRepairQueueItem } from "@decomp-orchestrator/core/qa/repair-lane";
import type { QaScanFinding, QaScanResult } from "@decomp-orchestrator/core/qa";
import {
  QA_REPAIR_AGENT_SCHEMA_VERSION,
  qaRepairPrompt,
  validateQaRepairAgentResult,
} from "./prompt.js";

function finding(overrides: Partial<QaScanFinding> = {}): QaScanFinding {
  return {
    rule_id: "m2c_residue_names",
    severity: "error",
    file: "src/melee/gr/grsmoke.c",
    line: 23,
    excerpt: "s32 temp_r30 = var_r4 + phi_f1;",
    message: "Generated m2c local name remains in source.",
    standard_id: "global_standard:conservative-naming",
    ...overrides,
  };
}

function scanResult(findings: QaScanFinding[]): QaScanResult {
  return {
    tool: "review_lint",
    operation: "review_lint:scan_diff",
    status: "failed",
    repo: "/repo",
    base: "origin/master",
    findings,
    counts: { errors: findings.filter((entry) => entry.severity === "error").length, warnings: 0 },
  };
}

function queueItem(): QaRepairQueueItem {
  const queue = buildQaRepairQueue({
    runId: "test-run",
    repoRoot: "/repo",
    scanResult: scanResult([finding()]),
    candidateFiles: ["src/melee/gr/grsmoke.c"],
    createdAt: "2026-06-13T00:00:00.000Z",
  });
  return queue.items[0] as QaRepairQueueItem;
}

describe("validateQaRepairAgentResult", () => {
  test("accepts a valid qa-repair result", () => {
    const validated = validateQaRepairAgentResult({
      schema_version: QA_REPAIR_AGENT_SCHEMA_VERSION,
      item_id: "src-melee-gr-grsmoke",
      source_path: "src/melee/gr/grsmoke.c",
      outcome: "fixed",
      score_impact: "same_match",
      summary: "Removed generated local names.",
      edits: ["Renamed temp_r30 to count."],
      validation: [{ command: "review_lint scan_diff", status: "passed", artifact_path: "post_scan.json", notes: "clean" }],
      remaining_findings: [],
      risks: [],
    });

    expect(validated.errors).toEqual([]);
    expect(validated.result?.outcome).toBe("fixed");
  });

  test("normalizes unmeasured score aliases to unknown", () => {
    const validated = validateQaRepairAgentResult({
      schema_version: QA_REPAIR_AGENT_SCHEMA_VERSION,
      item_id: "src-melee-gr-grsmoke",
      source_path: "src/melee/gr/grsmoke.c",
      outcome: "fixed",
      score_impact: "not_measured",
      summary: "Removed generated local names.",
      edits: ["Renamed temp_r30 to count."],
      validation: [{ command: "review_lint scan_diff", status: "passed", artifact_path: "post_scan.json", notes: "clean" }],
      remaining_findings: [],
      risks: [],
    });

    expect(validated.errors).toEqual([]);
    expect(validated.result?.score_impact).toBe("unknown");
  });

  test("normalizes warning-only validation statuses to passed", () => {
    const validated = validateQaRepairAgentResult({
      schema_version: QA_REPAIR_AGENT_SCHEMA_VERSION,
      item_id: "src-melee-gr-grsmoke",
      source_path: "src/melee/gr/grsmoke.c",
      outcome: "fixed",
      score_impact: "lower_score",
      summary: "Removed generated local names.",
      edits: ["Renamed temp_r30 to count."],
      validation: [{ command: "review_lint scan_diff", status: "warning_only", artifact_path: "post_scan.json", notes: "warnings only" }],
      remaining_findings: [],
      risks: [],
    });

    expect(validated.errors).toEqual([]);
    expect(validated.result?.validation[0]?.status).toBe("passed");
  });

  test("rejects malformed result objects", () => {
    const validated = validateQaRepairAgentResult({
      schema_version: "wrong",
      item_id: "",
      source_path: "src/melee/gr/grsmoke.c",
      outcome: "clean",
      score_impact: "higher",
      summary: "",
      edits: "none",
      validation: [{ command: "x", status: "maybe" }],
      remaining_findings: {},
      risks: [],
    });

    expect(validated.result).toBeNull();
    expect(validated.errors.join("; ")).toContain("schema_version");
    expect(validated.errors.join("; ")).toContain("outcome");
    expect(validated.errors.join("; ")).toContain("score_impact");
  });
});

describe("qaRepairPrompt", () => {
  test("renders queue item, tools, standards, and schema without raw placeholders", () => {
    const item = queueItem();
    const prompt = qaRepairPrompt({
      item,
      queueSummary: { queued_items: 1, files_with_errors: 1 },
      repoRoot: "/repo",
      stateDir: "/state",
    });
    const combined = `${prompt.systemPrompt}\n${prompt.userPrompt}`;

    expect(combined).toContain("Repair one PR-bound candidate file");
    expect(combined).toContain("src/melee/gr/grsmoke.c");
    expect(combined).toContain("m2c_residue_names");
    expect(combined).toContain("lower_score");
    expect(combined).toContain("<available_tools>");
    expect(combined).toContain(QA_REPAIR_AGENT_SCHEMA_VERSION);
    expect(combined).not.toMatch(/\{\{[A-Z0-9_]+\}\}/);
  });
});
