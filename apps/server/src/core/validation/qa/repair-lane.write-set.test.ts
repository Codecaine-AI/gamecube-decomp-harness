import { describe, expect, test } from "bun:test";
import type { WideningRequest, WriteSetEntry } from "@server/core/session-runtime/run-state/write-set-categories";
import type { QaScanFinding, QaScanResult } from "./scan-diff.js";
import {
  buildQaRepairQueue,
  QA_REPAIR_QUEUE_ITEM_SCHEMA_VERSION,
  type QaRepairQueue,
  type QaRepairQueueItem,
} from "./repair-lane.js";

function scanResult(): QaScanResult {
  const finding: QaScanFinding = {
    rule_id: "m2c_residue_names",
    severity: "error",
    file: "src/melee/gr/grsmoke.c",
    line: 24,
    excerpt: "s32 temp_r30 = var_r4;",
    message: "Generated m2c local name remains in source.",
    standard_id: "global_standard:conservative-naming",
  };
  return {
    tool: "review_lint",
    operation: "review_lint:scan_diff",
    status: "failed",
    repo: "/repo",
    base: "origin/master",
    findings: [finding],
    counts: { errors: 1, warnings: 0 },
  };
}

function queueItem(): { queue: QaRepairQueue; item: QaRepairQueueItem } {
  const queue = buildQaRepairQueue({
    runId: "test-run",
    repoRoot: "/repo",
    scanResult: scanResult(),
    candidateFiles: ["src/melee/gr/grsmoke.c"],
    createdAt: "2026-08-11T00:00:00.000Z",
  });
  return { queue, item: queue.items[0] as QaRepairQueueItem };
}

describe("QA repair write-set queue fields", () => {
  test("new queue items use v2 while builders may omit widening state", () => {
    const { item } = queueItem();

    expect(item.schema_version).toBe(QA_REPAIR_QUEUE_ITEM_SCHEMA_VERSION);
    expect(item.authorized_write_set).toBeUndefined();
    expect(item.widening).toBeUndefined();
  });

  test("authorized write set and widening evidence survive artifact JSON round-trip", () => {
    const { queue, item } = queueItem();
    const authorizedWriteSet: WriteSetEntry[] = [
      {
        path: "src/melee/gr/grsmoke.c",
        category: "target-source",
        rung: 1,
        addedBy: "claim",
      },
      {
        path: "include/melee/gr/grsmoke.h",
        category: "owning-header",
        rung: 3,
        addedBy: "widening",
        wideningId: "widening-1",
      },
    ];
    const evidence: WideningRequest["evidence"] = {
      mismatched_declaration: {
        symbol: "grSmoke_801C57F0",
        current: "void grSmoke_801C57F0(void*);",
        required: "void grSmoke_801C57F0(HSD_GObj*);",
        expected_owner: "include/melee/gr/grsmoke.h",
      },
      objdiff: {
        unit: "melee/gr/grsmoke",
        score_without: 96.5,
        score_with: 100,
        artifact_path: "artifacts/grsmoke.objdiff.json",
      },
      ladder_evidence: {
        rung1_in_slice: "Typed the call to the existing declaration; the argument setup still mismatched.",
        rung2_config: "The mismatch is a C declaration issue, not an address-range ownership issue.",
      },
    };
    queue.items[0] = {
      ...item,
      authorized_write_set: authorizedWriteSet,
      widening: { rung: 3, evidence },
    };

    const roundTripped = JSON.parse(JSON.stringify(queue)) as QaRepairQueue;

    expect(roundTripped.items[0]?.schema_version).toBe("qa_repair_queue_item_v2");
    expect(roundTripped.items[0]?.authorized_write_set).toEqual(authorizedWriteSet);
    expect(roundTripped.items[0]?.widening).toEqual({ rung: 3, evidence });
  });
});
