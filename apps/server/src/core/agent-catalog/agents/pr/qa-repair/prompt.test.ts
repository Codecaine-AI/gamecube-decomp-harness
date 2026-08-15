import { describe, expect, test } from "bun:test";
import { buildQaRepairQueue, type QaRepairQueueItem } from "@server/core/validation/qa/repair-lane";
import type { QaScanFinding, QaScanResult } from "@server/core/validation/qa";
import type { WideningRequest } from "@server/core/cycle-runtime/run-state/write-set-categories";
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
	      finding_dispositions: [{ rule_id: "m2c_residue_names", line: 23, disposition: "fixed_source", evidence: "Renamed generated locals using nearby source context." }],
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
	      finding_dispositions: [{ rule_id: "m2c_residue_names", line: 23, disposition: "fixed_source", evidence: "Renamed generated locals using nearby source context." }],
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
	      finding_dispositions: [{ rule_id: "m2c_residue_names", line: 23, disposition: "fixed_by_minimal_revert", evidence: "Removed only the generated-name hunk after source repair did not preserve clean output." }],
	      remaining_findings: [],
	      risks: [],
    });

    expect(validated.errors).toEqual([]);
    expect(validated.result?.validation[0]?.status).toBe("passed");
  });

  test("preserves a valid widening request for runner policy", () => {
    const wideningRequest: WideningRequest = {
      schema_version: "write_set_widening_request_v1",
      paths: ["include/melee/gr/grsmoke.h"],
      category: "owning-header",
      rung: 3,
      evidence: {
        mismatched_declaration: {
          symbol: "grSmoke_801C57F0",
          current: "void grSmoke_801C57F0(void*);",
          required: "void grSmoke_801C57F0(HSD_GObj*);",
          expected_owner: "include/melee/gr/grsmoke.h",
        },
        objdiff: {
          unit: "melee/gr/grsmoke",
          score_without: 96.5,
          score_with: null,
          artifact_path: "artifacts/grsmoke.objdiff.json",
        },
        ladder_evidence: {
          rung1_in_slice: "Typed the call to the existing declaration; the argument setup still mismatched.",
          rung2_config: "The mismatch is a declaration issue, not address-range metadata.",
        },
      },
    };
    const validated = validateQaRepairAgentResult({
      schema_version: QA_REPAIR_AGENT_SCHEMA_VERSION,
      item_id: "src-melee-gr-grsmoke",
      source_path: "src/melee/gr/grsmoke.c",
      outcome: "needs_rework",
      score_impact: "unknown",
      summary: "Canonical repair requires the owning header.",
      edits: [],
      validation: [{ command: "objdiff", status: "passed", artifact_path: "artifacts/grsmoke.objdiff.json", notes: "Measured rung 1." }],
      finding_dispositions: [{ rule_id: "m2c_residue_names", line: 23, disposition: "left_with_evidence", evidence: "Awaiting write-set authorization." }],
      remaining_findings: [{ rule_id: "m2c_residue_names", line: 23, reason: "Owning declaration is mismatched." }],
      risks: [],
      widening_request: wideningRequest,
    });

    expect(validated.errors).toEqual([]);
    expect(validated.result?.widening_request).toEqual(wideningRequest);
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
	      finding_dispositions: {},
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
    const bundle = qaRepairPrompt({
      item,
      queueSummary: { queued_items: 1, files_with_errors: 1 },
      repoRoot: "/repo",
      stateDir: "/state",
    });
    const promptOnly = `${bundle.systemPrompt}\n${bundle.userPrompt}`;
    const injectedContext = bundle.kernelContext?.renderedContext ?? "";

    expect(promptOnly).toContain("Repair one PR-bound candidate file");
    // Requirement framing (Phase 4): findings are requirement violations; false_positive
    // demands evidence; llm_review findings kept as-is need justification.
    expect(promptOnly).toContain("requirement violation");
    expect(promptOnly.toLowerCase()).toContain("llm_review");
    expect(promptOnly).toContain("scanner error");
    expect(promptOnly).toContain("target translation unit is the motivation and review scope");
    expect(promptOnly).toContain("A widening_request is honored only when widening is enabled");
    expect(promptOnly).toContain("Rung 1 — target-source");
    expect(promptOnly).toContain("Rung 2 — config-metadata");
    expect(promptOnly).toContain("Rung 3 — owning-header");
    expect(promptOnly).toContain("Rung 4 — foreign-source");
    expect(promptOnly).toContain("typing the in-slice code to master's existing foreign declarations and types");
    expect(promptOnly).toContain("authorized_write_set");
    expect(promptOnly).toContain("Never add local shims");
    expect(promptOnly).toContain("widening-related blocked outcome");
    expect(promptOnly).toContain('"schema_version": "write_set_widening_request_v1"');
    expect(promptOnly).toContain('"mismatched_declaration"');
    expect(promptOnly).toContain('"objdiff"');
    expect(promptOnly).toContain('"expected_owner"');
    expect(promptOnly).toContain('"ladder_evidence"');
    expect(promptOnly).not.toContain("Do not edit headers");
    expect(promptOnly).not.toContain("Header edits are outside this repair lane and will be rolled back");
    expect(promptOnly).toContain("process those targets one at a time");
    expect(promptOnly).toContain("record its current source shape");
    expect(promptOnly).toContain("you MUST run the available compile tool and objdiff/checkdiff score tool scoped to that function");
    expect(promptOnly).toContain("was exact before this target's edit is no longer exact");
    expect(promptOnly).toContain("restore the prior source shape you recorded for this target");
    expect(promptOnly).toContain("record `left_with_evidence`");
    expect(promptOnly).toContain("measured before/after exact-match regression");
    expect(promptOnly).toContain("then continue to the next target");
    expect(promptOnly).toContain("file-scope findings such as data ordering, includes, and literals");
    expect(promptOnly).toContain("whole-file compile and whole-file objdiff/checkdiff score check");
    expect(promptOnly).not.toContain("src/melee/gr/grsmoke.c");
    expect(injectedContext).toContain("src/melee/gr/grsmoke.c");
    expect(injectedContext).toContain("m2c_residue_names");
    expect(promptOnly).toContain("lower_score");
    expect(injectedContext).toContain("<available_tools>");
    expect(injectedContext).toContain("<standard_examples");
    expect(injectedContext).toContain("naming-m2c-residue-local");
    expect(injectedContext).toContain(QA_REPAIR_AGENT_SCHEMA_VERSION);
    expect(`${promptOnly}\n${injectedContext}`).not.toMatch(/\{\{[A-Z0-9_]+\}\}/);
  });
});
