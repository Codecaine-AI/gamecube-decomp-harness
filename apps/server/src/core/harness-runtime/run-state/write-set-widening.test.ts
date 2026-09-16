import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openState, type StateStore } from "@server/core/orchestrator-state";
import { cancelJob, claimNextJob } from "@server/core/job-queue/kernel.js";
import type { TargetCandidate } from "@server/core/shared/types/index.js";
import { seedRunHarness } from "./test-harness.js";
import { admitEpochTargets, startSchedulerEpoch } from "./epochs.js";
import { createRun } from "./runs.js";
import { activeClaimsForRun, claimNextEpochTarget } from "./worker-state.js";
import type { WideningRequest } from "./write-set-categories.js";
import {
  buildInSessionWideningRequests,
  createRequestWriteSetWideningHandler,
  createWriteSetWidening,
  declarationSymbolForWorkerTarget,
  decideWidening,
  draftWideningRequestFromOutOfWriteSet,
  executeWriteSetWidening,
  getWriteSetWidening,
  parseWideningRequest,
  recordWriteSetWideningDecision,
  recordWriteSetWideningValidation,
  writeSetWideningsForClaim,
} from "./write-set-widening.js";

const SOURCE_PATH = "src/melee/gr/ground.c";

function requestFor(rung: 2 | 3 | 4): WideningRequest {
  const details = {
    2: { path: "config/GALE01/symbols.txt", category: "config-metadata" as const },
    3: { path: "src/melee/gr/ground.h", category: "owning-header" as const },
    4: { path: "src/melee/ft/fighter.c", category: "foreign-source" as const },
  }[rung];
  return {
    schema_version: "write_set_widening_request_v1",
    paths: [details.path],
    category: details.category,
    rung,
    evidence: {
      mismatched_declaration: {
        symbol: "Ground_801C57F0",
        current: "void Ground_801C57F0(void);",
        required: "int Ground_801C57F0(int arg);",
        expected_owner: details.path,
      },
      objdiff: {
        unit: "melee/gr/ground",
        score_without: 98.4,
        score_with: 100,
      },
      ladder_evidence: {
        rung1_in_slice: "Typing the call to the existing declaration moved the target away from the expected codegen.",
        ...(rung >= 3 ? { rung2_config: "No symbol or split metadata change can alter this declaration." } : {}),
        ...(rung >= 4 ? { rung3_header: "The owner has no usable public declaration to correct." } : {}),
      },
    },
  };
}

function decide(request: WideningRequest, overrides: Partial<Parameters<typeof decideWidening>[0]> = {}) {
  return decideWidening({
    request,
    sourcePath: SOURCE_PATH,
    wideningId: "widening-1",
    allowOwningHeader: false,
    headerDeclaresEvidenceSymbol: false,
    ...overrides,
  });
}

describe("decideWidening", () => {
  test("approves rung 2 config metadata automatically", () => {
    expect(decide(requestFor(2))).toEqual({
      schema_version: "write_set_widening_decision_v1",
      wideningId: "widening-1",
      status: "approved",
      approvedPaths: ["config/GALE01/symbols.txt"],
      validationTier: 2,
      reason: "Approved rung-2 config-metadata widening for scoped validation.",
      decidedBy: "runner-policy",
    });
  });

  test("approves rung 3 only when enabled and the header declares the evidence symbol", () => {
    const request = requestFor(3);
    expect(decide(request, { allowOwningHeader: true, headerDeclaresEvidenceSymbol: true })).toMatchObject({
      status: "approved",
      approvedPaths: ["src/melee/gr/ground.h"],
      validationTier: 3,
    });
    expect(decide(request, { allowOwningHeader: false, headerDeclaresEvidenceSymbol: true })).toMatchObject({
      status: "denied",
      approvedPaths: [],
    });
    expect(decide(request, { allowOwningHeader: true, headerDeclaresEvidenceSymbol: false })).toMatchObject({
      status: "denied",
      approvedPaths: [],
    });
  });

  test("routes rung 4 to the cross-module lane without approving paths", () => {
    expect(decide(requestFor(4))).toMatchObject({
      status: "routed_cross_module",
      approvedPaths: [],
      validationTier: 4,
      decidedBy: "runner-policy",
    });
  });

  test("denies a request without rung-1 necessity evidence", () => {
    const request = requestFor(2);
    request.evidence.ladder_evidence.rung1_in_slice = "  ";
    const decision = decide(request);
    expect(decision.status).toBe("denied");
    expect(decision.reason).toContain("rung-1");
  });

  test("denies missing intermediate ladder evidence", () => {
    const header = requestFor(3);
    delete header.evidence.ladder_evidence.rung2_config;
    expect(decide(header, { allowOwningHeader: true, headerDeclaresEvidenceSymbol: true }).reason).toContain("rung-2");

    const foreign = requestFor(4);
    delete foreign.evidence.ladder_evidence.rung3_header;
    expect(decide(foreign).reason).toContain("rung-3");
  });

  test("denies multi-category and category-rung mismatches", () => {
    const mixed = requestFor(2);
    mixed.paths.push("src/melee/gr/ground.h");
    expect(decide(mixed).reason).toContain("one write-set category");

    const mismatched = requestFor(2);
    mismatched.rung = 3;
    expect(decide(mismatched).reason).toContain("belongs to rung 2");
  });

  test("denies target-source and other paths even when the request claims a widenable category", () => {
    const target = requestFor(2);
    target.paths = [SOURCE_PATH];
    target.evidence.mismatched_declaration.expected_owner = SOURCE_PATH;
    expect(decide(target).reason).toContain("target-source");

    const other = requestFor(2);
    other.paths = ["Makefile"];
    other.evidence.mismatched_declaration.expected_owner = "Makefile";
    expect(decide(other).reason).toContain("other");
  });

  test("denies an evidence owner outside the requested paths", () => {
    const request = requestFor(2);
    request.evidence.mismatched_declaration.expected_owner = "config/GALE01/splits.txt";
    expect(decide(request).reason).toContain("evidence owner");
  });
});

describe("request parsing and surfaced telemetry drafts", () => {
  test("maps CodeWarrior C++ targets to the declaration spelling used in owning headers", () => {
    expect(declarationSymbolForWorkerTarget("execute__15TPollutionEventFv")).toBe("execute");
    expect(declarationSymbolForWorkerTarget("__ct__15TPollutionEventFv")).toBe("TPollutionEvent");
    expect(declarationSymbolForWorkerTarget("TPollutionEvent::execute() ")).toBe("execute");
  });

  test("builds tool requests per path and denies other paths with rung guidance", () => {
    const drafts = buildInSessionWideningRequests({
      paths: ["include/Map/PollutionEvent.hpp", "Makefile"],
      reason: "The target source edit cannot correct the canonical declaration.",
      evidence: "The owning header declares PollutionEvent::execute.",
      sourcePath: "src/Map/PollutionEvent.cpp",
      symbol: "PollutionEvent::execute",
      unit: "Map/PollutionEvent",
      scoreWithout: 99.8,
    });

    expect(drafts[0]).toMatchObject({
      path: "include/Map/PollutionEvent.hpp",
      category: "owning-header",
      denied: null,
      request: {
        schema_version: "write_set_widening_request_v1",
        paths: ["include/Map/PollutionEvent.hpp"],
        category: "owning-header",
        rung: 3,
      },
    });
    expect(drafts[1]).toEqual({
      path: "Makefile",
      category: "other",
      request: null,
      denied: {
        path: "Makefile",
        reason: "Widening denied: category other is never widenable.",
        rung_guidance:
          "No widening rung covers category other. Keep the fix in the target source or request a canonical config, owning-header, or foreign-source path.",
      },
    });
  });

  test("parses the versioned request shape and rejects malformed input", () => {
    const request = requestFor(2);
    expect(parseWideningRequest(request)).toEqual(request);
    expect(parseWideningRequest({ ...request, schema_version: "v2" })).toBeNull();
    expect(parseWideningRequest({ ...request, paths: [42] })).toBeNull();
  });

  test("drafts one homogeneous widening request that policy denies until evidence is filled", () => {
    const draft = draftWideningRequestFromOutOfWriteSet(
      [
        { path: "config/GALE01/symbols.txt", category: "config-metadata" },
        { path: "config/GALE01/splits.txt", category: "config-metadata" },
      ],
      SOURCE_PATH,
    );
    expect(draft).toMatchObject({ category: "config-metadata", rung: 2 });
    expect(draft?.paths).toEqual(["config/GALE01/symbols.txt", "config/GALE01/splits.txt"]);
    expect(decide(draft!)).toMatchObject({ status: "denied" });
  });

  test("does not draft other, target-source, mixed, or category-disagreeing telemetry", () => {
    expect(draftWideningRequestFromOutOfWriteSet([{ path: "Makefile", category: "other" }], SOURCE_PATH)).toBeNull();
    expect(draftWideningRequestFromOutOfWriteSet([{ path: SOURCE_PATH, category: "target-source" }], SOURCE_PATH)).toBeNull();
    expect(
      draftWideningRequestFromOutOfWriteSet(
        [
          { path: "config/GALE01/symbols.txt", category: "config-metadata" },
          { path: "src/melee/gr/ground.h", category: "owning-header" },
        ],
        SOURCE_PATH,
      ),
    ).toBeNull();
    expect(
      draftWideningRequestFromOutOfWriteSet(
        [{ path: "src/melee/gr/ground.h", category: "foreign-source" }],
        SOURCE_PATH,
      ),
    ).toBeNull();
  });
});

const databases: Database[] = [];
const tempDirs: string[] = [];

function wideningStore(): StateStore {
  const db = new Database(":memory:");
  databases.push(db);
  db.exec(`
    CREATE TABLE write_set_widenings (
      id TEXT PRIMARY KEY, run_id TEXT NOT NULL, epoch_id TEXT NOT NULL,
      target_claim_id TEXT NOT NULL, worker_state_id TEXT NOT NULL,
      attempt_index INTEGER NOT NULL, category TEXT NOT NULL, rung INTEGER NOT NULL,
      requested_paths_json TEXT NOT NULL DEFAULT '[]', approved_paths_json TEXT NOT NULL DEFAULT '[]',
      evidence_json TEXT NOT NULL DEFAULT '{}', status TEXT NOT NULL,
      decided_by TEXT, decision_reason TEXT, validation_tier INTEGER,
      validation_evidence_json TEXT NOT NULL DEFAULT '{}', conflict_group_id TEXT,
      created_at TEXT NOT NULL, decided_at TEXT, validated_at TEXT
    )
  `);
  return { db } as StateStore;
}

afterEach(() => {
  for (const db of databases.splice(0)) db.close();
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function activeClaimFixture() {
  const dir = mkdtempSync(join(tmpdir(), "execute-write-set-widening-"));
  tempDirs.push(dir);
  const store = openState(dir);
  databases.push(store.db);
  seedRunHarness(store);
  const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "test" }, { baseRevision: "base-test" });
  const epoch = startSchedulerEpoch(store, run.id, { workerPoolSize: 1 });
  const candidate: TargetCandidate = {
    kind: "function",
    unit: "melee/gr/ground",
    symbol: "Ground_801C57F0",
    sourcePath: SOURCE_PATH,
    size: 64,
    fuzzy: 98.4,
  };
  admitEpochTargets(store, {
    epochId: epoch.id,
    runId: run.id,
    candidates: [candidate],
    workerPoolSize: 1,
  });
  const job = claimNextJob(store, { kind: "worker", concurrencyLimit: 1, leaseMs: 60_000 });
  if (!job) throw new Error("expected worker job claim");
  const claim = claimNextEpochTarget({
    store,
    runId: run.id,
    workerId: "worker-1",
    baseRev: "base-test",
    ttlSeconds: 1_800,
  });
  if (!claim) throw new Error("expected target claim");
  return { store, run, epoch, claim, token: job.token };
}

describe("executeWriteSetWidening", () => {
  test("approves an owning header under claim authority and deduplicates an identical request", async () => {
    const { store, run, epoch, claim, token } = activeClaimFixture();
    const input = {
      store,
      runId: run.id,
      epochId: epoch.id,
      targetClaimId: claim.claimId,
      workerStateId: claim.workerStateId,
      attemptIndex: 0,
      sourcePath: SOURCE_PATH,
      mode: "header" as const,
      request: requestFor(3),
      authority: token,
      headerDeclaresEvidenceSymbol: true,
    };

    const first = await executeWriteSetWidening(input);
    const repeated = await executeWriteSetWidening(input);

    expect(first).toMatchObject({
      decision: { status: "approved", approvedPaths: ["src/melee/gr/ground.h"] },
      applied: true,
      writeSetAfter: [SOURCE_PATH, "src/melee/gr/ground.h"],
      idempotent: false,
    });
    expect(repeated).toMatchObject({
      wideningId: first.wideningId,
      decision: { status: "approved", approvedPaths: ["src/melee/gr/ground.h"] },
      applied: true,
      writeSetAfter: [SOURCE_PATH, "src/melee/gr/ground.h"],
      idempotent: true,
    });
    expect(writeSetWideningsForClaim(store, claim.claimId)).toHaveLength(1);
  });

  test("reports an owning-header approval in shadow mode without changing the write set", async () => {
    const { store, run, epoch, claim, token } = activeClaimFixture();

    const result = await executeWriteSetWidening({
      store,
      runId: run.id,
      epochId: epoch.id,
      targetClaimId: claim.claimId,
      workerStateId: claim.workerStateId,
      attemptIndex: 0,
      sourcePath: SOURCE_PATH,
      mode: "shadow",
      request: requestFor(3),
      authority: token,
      headerDeclaresEvidenceSymbol: true,
    });

    expect(result).toMatchObject({
      decision: { status: "approved", approvedPaths: ["src/melee/gr/ground.h"] },
      applied: false,
      writeSetAfter: [SOURCE_PATH],
    });
    expect(activeClaimsForRun(store, run.id)[0]?.writeSet).toEqual([SOURCE_PATH]);
  });

  test("rejects a stale claim write-authority token", () => {
    const { store, run, epoch, claim, token } = activeClaimFixture();
    cancelJob(store, { jobId: token.jobId, reason: "stale widening tool test" });

    expect(() => executeWriteSetWidening({
      store,
      runId: run.id,
      epochId: epoch.id,
      targetClaimId: claim.claimId,
      workerStateId: claim.workerStateId,
      attemptIndex: 0,
      sourcePath: SOURCE_PATH,
      mode: "header",
      request: requestFor(3),
      authority: token,
      headerDeclaresEvidenceSymbol: true,
    })).toThrow("stale claim token");
  });
});

describe("request_write_set_widening handler", () => {
  test("returns immediate owning-header approval and per-path denial guidance", async () => {
    const { store, run, epoch, claim, token } = activeClaimFixture();
    const handler = createRequestWriteSetWideningHandler({
      store,
      runId: run.id,
      epochId: epoch.id,
      targetClaimId: claim.claimId,
      workerStateId: claim.workerStateId,
      attemptIndex: 0,
      sourcePath: SOURCE_PATH,
      symbol: "Ground_801C57F0",
      unit: "melee/gr/ground",
      scoreWithout: 98.4,
      mode: "header",
      authority: token,
      headerDeclaresEvidenceSymbol: async () => true,
    });

    const approved = await handler({
      paths: ["src/melee/gr/ground.h"],
      reason: "The target-source edit cannot correct the canonical declaration.",
      evidence: "The owning header declares Ground_801C57F0.",
    });
    const denied = await handler({
      paths: ["Makefile"],
      reason: "The build metadata would need to change.",
    });

    expect(approved).toEqual({
      approved_paths: ["src/melee/gr/ground.h"],
      denied: [],
      write_set_after: [SOURCE_PATH, "src/melee/gr/ground.h"],
      mode: "header",
      applied: true,
    });
    expect(denied).toEqual({
      approved_paths: [],
      denied: [{
        path: "Makefile",
        reason: "Widening denied: category other is never widenable.",
        rung_guidance:
          "No widening rung covers category other. Keep the fix in the target source or request a canonical config, owning-header, or foreign-source path.",
      }],
      write_set_after: [SOURCE_PATH, "src/melee/gr/ground.h"],
      mode: "header",
      applied: false,
    });
  });
});

describe("write-set widening audit rows", () => {
  test("creates, reads, decides, validates, and lists a widening", () => {
    const store = wideningStore();
    const request = requestFor(2);
    const created = createWriteSetWidening(store, {
      id: "widening-crud",
      runId: "run-1",
      epochId: "epoch-1",
      targetClaimId: "claim-1",
      workerStateId: "worker-state-1",
      attemptIndex: 2,
      request,
    });
    expect(created).toMatchObject({ id: "widening-crud", status: "requested", requestedPaths: request.paths });
    expect(getWriteSetWidening(store, created.id)).toEqual(created);

    const decision = decide(request, { wideningId: created.id });
    const decided = recordWriteSetWideningDecision(store, created.id, decision);
    expect(decided).toMatchObject({ status: "approved", validationTier: 2, approvedPaths: request.paths });

    const validated = recordWriteSetWideningValidation(store, created.id, {
      status: "validated",
      evidence: { checked_units: ["melee/gr/ground"] },
    });
    expect(validated).toMatchObject({ status: "validated", validationEvidence: { checked_units: ["melee/gr/ground"] } });
    expect(writeSetWideningsForClaim(store, "claim-1")).toHaveLength(1);
  });

  test("rejects a decision carrying another widening id", () => {
    const store = wideningStore();
    const request = requestFor(2);
    const created = createWriteSetWidening(store, {
      id: "widening-a",
      runId: "run-1",
      epochId: "epoch-1",
      targetClaimId: "claim-1",
      workerStateId: "worker-state-1",
      attemptIndex: 1,
      request,
    });
    expect(() => recordWriteSetWideningDecision(store, created.id, decide(request, { wideningId: "widening-b" }))).toThrow(
      "does not match",
    );
  });
});
