import { describe, expect, test } from "bun:test";
import type { QaScanFinding, QaScanResult } from "./scan-diff.js";
import {
  buildQaRepairQueue,
  qaRepairShipStatus,
  summarizeQaRepairQueue,
  validateQaRepairOutcome,
  type QaRepairQueueItem,
} from "./repair-lane.js";

function finding(overrides: Partial<QaScanFinding> = {}): QaScanFinding {
  return {
    rule_id: "m2c_residue_names",
    severity: "error",
    file: "src/melee/gr/grsmoke.c",
    line: 24,
    excerpt: "s32 temp_r30 = var_r4;",
    message: "Generated m2c local name remains in source.",
    standard_id: "global_standard:conservative-naming",
    ...overrides,
  };
}

function hardenedFindings(): QaScanFinding[] {
  return [
    finding({ rule_id: "fake_assert_macro", line: 35, excerpt: "#define VENOM_JOBJ_ASSERTMSG(line, cond, msg) \\", message: "Added local assert/report macro." }),
    finding({ rule_id: "assert_idiom_downgrade", line: 21, excerpt: 'OSReport("obj");', message: "File diff removes HSD_ASSERT* and adds raw assert/report code." }),
    finding({ rule_id: "register_keyword", line: 25, excerpt: "register s32 flag;", message: "Added register storage-class steering." }),
    finding({ rule_id: "inline_asm", line: 32, excerpt: 'asm volatile ("nop");', message: "Added inline assembly in normal source." }),
    finding({ rule_id: "m2c_residue_names", line: 23, excerpt: "s32 temp_r30 = var_r4 + phi_f1;", message: "Generated m2c local names remain in source." }),
    finding({ rule_id: "m2c_goto_label", line: 28, excerpt: "goto block_30;", message: "Generated block label/goto remains in source." }),
    finding({ rule_id: "m2c_field_use", line: 26, excerpt: "M2C_FIELD(obj, s32*, 0x14) = flag;", message: "Added M2C_FIELD bridge code." }),
    finding({ rule_id: "define_alias", line: 37, excerpt: "#define tm ((TmData*) arg0)", message: "Added expression define alias." }),
    finding({ rule_id: "novel_pragma", severity: "warning", line: 42, excerpt: "#pragma inline_depth(4)", message: "Added novel pragma directive." }),
  ];
}

function scanResult(findings: QaScanFinding[]): QaScanResult {
  const errors = findings.filter((entry) => entry.severity === "error").length;
  const warnings = findings.filter((entry) => entry.severity === "warning").length;
  return {
    tool: "review_lint",
    operation: "review_lint:scan_diff",
    status: errors > 0 ? "failed" : warnings > 0 ? "warned" : "passed",
    repo: "/tmp/melee",
    base: "origin/master",
    findings,
    counts: { errors, warnings },
  };
}

describe("buildQaRepairQueue", () => {
  test("hardened-rule scanner findings become one queued file item", () => {
    const payload = scanResult(hardenedFindings());
    const queue = buildQaRepairQueue({
      runId: "test-run",
      repoRoot: "/repo",
      baseRef: "origin/master",
      scanResult: payload,
      candidateFiles: ["src/melee/gr/grsmoke.c"],
      createdAt: "2026-06-13T00:00:00.000Z",
      dryRun: true,
    });

    expect(queue.items).toHaveLength(1);
    const item = queue.items[0] as QaRepairQueueItem;
    expect(item.source_path).toBe("src/melee/gr/grsmoke.c");
    expect(item.status).toBe("queued");
    const errorRules = new Set(item.findings.map((entry) => entry.rule_id));
    for (const rule of [
      "fake_assert_macro",
      "assert_idiom_downgrade",
      "register_keyword",
      "inline_asm",
      "m2c_residue_names",
      "m2c_goto_label",
      "m2c_field_use",
      "define_alias",
    ]) {
      expect(errorRules.has(rule)).toBe(true);
    }
    expect(summarizeQaRepairQueue(queue).counts.files_with_errors).toBe(1);
  });

  test("candidate filtering records outside hard findings as ignored, not silently dropped", () => {
    const queue = buildQaRepairQueue({
      runId: "test-run",
      repoRoot: "/repo",
      scanResult: scanResult([finding(), finding({ file: "src/melee/gm/gm_1832.c", rule_id: "new_data_anchor" })]),
      candidateFiles: ["src/melee/gr/grsmoke.c"],
      createdAt: "2026-06-13T00:00:00.000Z",
    });

    expect(queue.items).toHaveLength(1);
    expect(queue.ignored_findings).toHaveLength(1);
    expect(queue.ignored_findings[0]?.reason).toBe("outside_candidate_set");
  });

  test("warning-only files become repair items when warnings are required", () => {
    const queue = buildQaRepairQueue({
      runId: "test-run",
      repoRoot: "/repo",
      scanResult: scanResult([finding({ severity: "warning", rule_id: "type_erasing_cast", excerpt: "(u8*) data", message: "Added type-erasing cast." })]),
      candidateFiles: ["src/melee/gr/grsmoke.c"],
      repairWarnings: true,
      createdAt: "2026-06-13T00:00:00.000Z",
    });

    expect(queue.candidate_files[0]?.status).toBe("warning_only");
    expect(queue.items).toHaveLength(1);
    expect(queue.items[0]?.findings).toEqual([]);
    expect(queue.items[0]?.warnings[0]?.rule_id).toBe("type_erasing_cast");
    expect(queue.items[0]?.repair_warnings).toBe(true);
    expect(summarizeQaRepairQueue(queue).recommendation).toBe("repair_required");
  });
});

describe("validateQaRepairOutcome", () => {
  test("dirty mocked repairs cannot pass validation", () => {
    const queue = buildQaRepairQueue({
      runId: "test-run",
      repoRoot: "/repo",
      scanResult: scanResult([finding()]),
      candidateFiles: ["src/melee/gr/grsmoke.c"],
      createdAt: "2026-06-13T00:00:00.000Z",
    });
    const result = validateQaRepairOutcome({
      item: queue.items[0] as QaRepairQueueItem,
      postScan: scanResult([finding({ line: 25 })]),
      buildPassed: true,
      regressionPassed: true,
    });

    expect(result.status).toBe("needs_rework");
    expect(result.remainingFindings).toHaveLength(1);
    expect(result.reasons[0]).toContain("still has 1 error");
  });

  test("clean lower-score repairs route as clean_lower_score and demote from ship status", () => {
    const queue = buildQaRepairQueue({
      runId: "test-run",
      repoRoot: "/repo",
      scanResult: scanResult([finding()]),
      checkpoint: {
        items: [
          {
            id: "checkpoint-item",
            sourcePath: "src/melee/gr/grsmoke.c",
            disposition: "pr_candidate",
            exactMatch: true,
            symbol: "grSmoke",
          },
        ],
      },
      createdAt: "2026-06-13T00:00:00.000Z",
    });
    const result = validateQaRepairOutcome({
      item: queue.items[0] as QaRepairQueueItem,
      postScan: scanResult([]),
      preTargetScore: 100,
      postTargetScore: 96.5,
      buildPassed: true,
      regressionPassed: true,
    });

    expect(result.status).toBe("clean_lower_score");
    const nextQueue = { ...queue, items: [{ ...(queue.items[0] as QaRepairQueueItem), status: result.status, routing_reason: result.reasons.join("; ") }] };
	    const shipStatus = qaRepairShipStatus(nextQueue);
	    expect(shipStatus.status).toBe("qa_repair_blocked");
	    expect(shipStatus.shippedFiles).toEqual([]);
    expect(shipStatus.cleanLowerScoreFiles).toEqual(["src/melee/gr/grsmoke.c"]);
    expect(shipStatus.droppedFiles["src/melee/gr/grsmoke.c"]?.[0]).toContain("lowered match score");
  });

  test("failed score validation prevents a clean post-scan from passing", () => {
    const queue = buildQaRepairQueue({
      runId: "test-run",
      repoRoot: "/repo",
      scanResult: scanResult([finding()]),
      candidateFiles: ["src/melee/gr/grsmoke.c"],
      createdAt: "2026-06-13T00:00:00.000Z",
    });
    const result = validateQaRepairOutcome({
      item: queue.items[0] as QaRepairQueueItem,
      postScan: scanResult([]),
      scorePassed: false,
      buildPassed: true,
      regressionPassed: true,
    });

    expect(result.status).toBe("needs_rework");
    expect(result.reasons).toContain("post-repair score validation failed");
  });

	  test("explicit score impact can route clean repairs as clean_lower_score", () => {
    const queue = buildQaRepairQueue({
      runId: "test-run",
      repoRoot: "/repo",
      scanResult: scanResult([finding()]),
      candidateFiles: ["src/melee/gr/grsmoke.c"],
      createdAt: "2026-06-13T00:00:00.000Z",
    });
    const result = validateQaRepairOutcome({
      item: queue.items[0] as QaRepairQueueItem,
      postScan: scanResult([]),
      scoreImpact: "lower_score",
      buildPassed: true,
      regressionPassed: true,
    });

	    expect(result.status).toBe("clean_lower_score");
	  });

  test("required warning findings block validation until warnings are gone", () => {
    const queue = buildQaRepairQueue({
      runId: "test-run",
      repoRoot: "/repo",
      scanResult: scanResult([finding({ severity: "warning", rule_id: "m2c_goto_label", excerpt: "goto done;", message: "Added goto." })]),
      candidateFiles: ["src/melee/gr/grsmoke.c"],
      repairWarnings: true,
      createdAt: "2026-06-13T00:00:00.000Z",
    });
    const result = validateQaRepairOutcome({
      item: queue.items[0] as QaRepairQueueItem,
      postScan: scanResult([finding({ severity: "warning", rule_id: "m2c_goto_label", excerpt: "goto done;", message: "Added goto." })]),
      buildPassed: true,
      regressionPassed: true,
    });

    expect(result.status).toBe("needs_rework");
    expect(result.remainingFindings).toHaveLength(1);
    expect(result.reasons[0]).toContain("required warning");
  });
});
