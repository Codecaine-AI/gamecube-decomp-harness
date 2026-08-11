import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import type { StateStore } from "@server/core/orchestrator-state";
import type { WideningRequest } from "./write-set-categories.js";
import {
  createWriteSetWidening,
  decideWidening,
  draftWideningRequestFromOutOfWriteSet,
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

function wideningStore(): StateStore {
  const db = new Database(":memory:");
  databases.push(db);
  db.exec(`
    CREATE TABLE write_set_widenings (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL, epoch_id TEXT NOT NULL,
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
});

describe("write-set widening audit rows", () => {
  test("creates, reads, decides, validates, and lists a widening", () => {
    const store = wideningStore();
    const request = requestFor(2);
    const created = createWriteSetWidening(store, {
      id: "widening-crud",
      sessionId: "session-1",
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
      sessionId: "session-1",
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
