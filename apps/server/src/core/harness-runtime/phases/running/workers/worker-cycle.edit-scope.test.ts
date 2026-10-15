import { describe, expect, test } from "bun:test";
import type { WorkerChangeValidation } from "@server/core/agent-catalog/agents/running/worker/change-validation";
import { EDIT_SCOPE_INSTRUCTION, type EditScopeResult, type OrderingMode } from "@server/core/validation/edit-scope/edit-scope.js";
import { UNUSED_BODY_INSTRUCTION } from "@server/core/validation/steering/steering-check.js";
import { epochTargetReadinessReason, type StateStore } from "@server/core/harness-runtime/run-state";
import { workerCheckpointHardGatesPassed, workerPacketReadinessFields, workerRepairInstruction } from "./worker-cycle.js";

const REASON = "edit_scope: TBossGesso (not_ready, owner enemy/BossGesso) at include/Enemy/BossGesso.hpp:12";

function scope(mode: OrderingMode): EditScopeResult {
  return {
    mode,
    error: null,
    durationMs: 4,
    report: {
      identity: { base_rev: "base-abc", patch_sha256: "p1", readiness: null },
      verdict: "reject",
      hunks: [{ file: "include/Enemy/BossGesso.hpp", line: 12, class: "TBossGesso", verdict: "not_ready", reason: "", owner_unit: "enemy/BossGesso" }],
      warnings: [],
      limits: { foreign_headers: 1, foreign_header_lines: 3 },
    },
  };
}

function rejected(mode: OrderingMode = "enforce"): WorkerChangeValidation {
  return { status: "edit_scope_rejected", reasons: [REASON], qaLint: null, editScope: scope(mode) };
}

describe("worker cycle: edit-scope rejection", () => {
  test("the repair instruction carries the reasons and the fence instruction, never the exact-gate one", () => {
    const validation = rejected();
    const instruction = workerRepairInstruction({
      runnerValidation: validation,
      latestCheckpoint: { exactMatch: true, hardGatesPassed: false },
      repairReasons: validation.reasons,
      scoreText: " at 100%",
      stopAtFrame: true,
    });
    expect(instruction).toStartWith(`Your last submission was rejected: ${REASON}.`);
    expect(instruction).toContain(EDIT_SCOPE_INSTRUCTION);
    expect(instruction).not.toContain("hard gates failed");
    expect(instruction).toEndWith("do not use whole-file destructive reset/restore/checkout/clean commands.");
  });

  test("an UNUSED rejection carries the UNUSED instruction instead of the class-order one", () => {
    const base = scope("enforce");
    const deadReport = { ...base.report!, hunks: [{ file: "src/MarioUtil/Mario.cpp", line: 40, class: null, verdict: "dead_unused" as const, reason: "dead" }] };
    const validation: WorkerChangeValidation = {
      status: "edit_scope_rejected",
      reasons: [`edit_scope (UNUSED): dead_unused at src/MarioUtil/Mario.cpp:40: dead. ${UNUSED_BODY_INSTRUCTION}`],
      qaLint: null,
      editScope: { ...base, report: { ...deadReport, hunks: [{ ...deadReport.hunks[0]!, verdict: "unused_unverified" as const }] } },
      editScopeUnused: { ...base, report: deadReport },
    };
    const instruction = workerRepairInstruction({ runnerValidation: validation, latestCheckpoint: null, repairReasons: validation.reasons, scoreText: "", stopAtFrame: true });
    expect(instruction).toContain(`. ${UNUSED_BODY_INSTRUCTION} Submit each verified improvement.`);
    expect(instruction).not.toContain(EDIT_SCOPE_INSTRUCTION);
  });

  test("a scope rejection fails the checkpoint hard gates", () => {
    expect(workerCheckpointHardGatesPassed({
      runnerValidation: rejected(),
      reviewLint: { status: "passed", reasons: [], findings: [] },
      outOfWriteSetChanges: [],
    })).toBe(false);
  });

  test("a shadow result on a passing attempt keeps today's instruction", () => {
    const validation: WorkerChangeValidation = { status: "passed", reasons: [], qaLint: null, editScope: scope("shadow") };
    const instruction = workerRepairInstruction({ runnerValidation: validation, latestCheckpoint: null, repairReasons: [], scoreText: " at 98%", stopAtFrame: false });
    expect(instruction).not.toContain(EDIT_SCOPE_INSTRUCTION);
    expect(instruction).toStartWith("Your last submission was validated and checkpointed at 98%.");
  });
});

describe("worker packet: not-ready classes", () => {
  const KOOPA = { class: "TKoopa", owner_unit: "mario/Enemy/Koopa", kind: "construct" };
  /** A store whose epoch_targets row carries `reason`, as admission writes it. */
  const storeWith = (reason: string | null) => ({ db: { query: () => ({ get: () => ({ reason }) }) } }) as unknown as StateStore;
  const deferred = epochTargetReadinessReason({ state: "deferred", unmet: [KOOPA], unresolved: [] } as Parameters<typeof epochTargetReadinessReason>[0]);

  test("shadow and enforce attach the admitted target's unmet classes; off and ready targets attach nothing", () => {
    expect(workerPacketReadinessFields(storeWith(deferred), "et-1", "shadow")).toEqual({ not_ready_classes: [KOOPA] });
    expect(workerPacketReadinessFields(storeWith(deferred), "et-1", "enforce")).toEqual({ not_ready_classes: [KOOPA] });
    expect(workerPacketReadinessFields(storeWith(deferred), "et-1", "off")).toEqual({});
    expect(workerPacketReadinessFields(storeWith(deferred), "et-1", undefined)).toEqual({});
    expect(workerPacketReadinessFields(storeWith(null), "et-1", "enforce")).toEqual({});
  });
});
