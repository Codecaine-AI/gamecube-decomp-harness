import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WorkerSteeringResult } from "@server/core/validation/steering/steering-check.js";
import {
  checkpointUnusedChecks,
  evidenceInlinedTrailers,
  loadBoundUnusedChecks,
  partitionUnusedChecksByContent,
  unitInputsSha256,
  type BoundUnusedCheck,
} from "./unused-evidence.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const rawInlined = {
  unit: "Enemy/chuuhana", file: "src/Enemy/chuuhana.cpp", function: "TChuuHana::rolling", mangled: "rolling__9TChuuHanaFv",
  status: "inlined", stub: "{ }",
  changed: [{ function: "TNerveChuuHanaRoll::execute(TSpineBase<TLiveActor>*) const", before: { status: "exact", match_percent: 86 }, after: { status: "mismatch", match_percent: 45 } }],
  callers: [{ function: "TNerveChuuHanaRoll::execute(TSpineBase<TLiveActor>*) const", before: { status: "exact", match_percent: 86 }, after: { status: "mismatch", match_percent: 45 }, delta: -41 }],
  reason: "1 function(s) of this unit get worse", line: 12, base_rev: "base-from-python", edits_hash: null, body_sha256: "body",
};

function steering(artifactPath: string | null, unused: unknown[] = []): WorkerSteeringResult {
  return {
    mode: "shadow",
    decision: { attempt: "pass", reasons: [], functions: [], removable_noncosmetic: [], probes: [], unused_checks: unused as never },
    error: null,
    artifactPath,
    durationMs: 1,
  };
}

describe("UNUSED evidence binding", () => {
  test("keeps the raw decide row and fills missing binding fields", async () => {
    const dir = mkdtempSync(join(tmpdir(), "unused-evidence-"));
    dirs.push(dir);
    writeFileSync(join(dir, "attempt-0.steering.json"), "{}");
    writeFileSync(join(dir, "attempt-0.steering.decision.json"), JSON.stringify({ unused_checks: [rawInlined, { bogus: true }] }));
    writeFileSync(join(dir, "attempt-0.steering.edits.json"), JSON.stringify({ edits_hash: "edits-from-step" }));

    const checks = await loadBoundUnusedChecks(steering(join(dir, "attempt-0.steering.json")), { baseRev: "claim-base" });

    expect(checks).toHaveLength(1);
    expect(checks![0]).toMatchObject({ base_rev: "base-from-python", edits_hash: "edits-from-step", body_sha256: "body", callers: rawInlined.callers, line: 12 });
  });

  test("falls back to the parsed decision bound to the claim base; no decision means no evidence", async () => {
    const parsed = { unit: "u", file: "src/u.c", function: "f", status: "dead" as const, changed: [] };
    expect(await loadBoundUnusedChecks(steering(null, [parsed]), { baseRev: "claim-base" }))
      .toEqual([{ ...parsed, base_rev: "claim-base", edits_hash: null, body_sha256: null }]);
    expect(await loadBoundUnusedChecks({ ...steering(null), decision: null }, { baseRev: "b" })).toBeNull();
    expect(await loadBoundUnusedChecks(null, { baseRev: "b" })).toBeNull();
    expect(checkpointUnusedChecks({})).toBeNull();
    expect(checkpointUnusedChecks({ unused_checks: [parsed, 1] })).toEqual([parsed as BoundUnusedCheck]);
  });

  test("one trailer per worsened caller of inlined checks only", () => {
    const fromChanged = { ...rawInlined, function: "TChuuHana::other", callers: [] } as BoundUnusedCheck;
    const dead = { ...rawInlined, status: "dead" } as BoundUnusedCheck;
    expect(evidenceInlinedTrailers([rawInlined as BoundUnusedCheck, fromChanged, dead])).toEqual([
      "Evidence-Inlined: TChuuHana::rolling -> TNerveChuuHanaRoll::execute (86.0% -> 45.0% when emptied)",
      "Evidence-Inlined: TChuuHana::other -> TNerveChuuHanaRoll::execute (86.0% -> 45.0% when emptied)",
    ]);
    expect(evidenceInlinedTrailers(null)).toEqual([]);
  });
});

describe("unit-content binding", () => {
  const SRC = "src/Enemy/chuuhana.cpp";
  const HDR = "include/Enemy/chuuhana.hpp";
  const texts: Record<string, string | null> = { [SRC]: "void TChuuHana::rolling() { a(); }\nvoid TNerveChuuHanaRoll::execute() { rolling(); }\n", [HDR]: "class TChuuHana;\n" };
  const certified = (inputs: string[]) => ({
    unit: "mario/Enemy/chuuhana", file: SRC, function: "TChuuHana::rolling", status: "inlined" as const, changed: [],
    unit_inputs: inputs, unit_inputs_sha256: unitInputsSha256(inputs.map((path) => ({ path, text: texts[path] ?? null }))),
  }) as BoundUnusedCheck;

  test("the hash is order-independent, length-delimited and distinguishes a missing file from an empty one", () => {
    const a = unitInputsSha256([{ path: SRC, text: "x" }, { path: HDR, text: "y" }]);
    expect(unitInputsSha256([{ path: HDR, text: "y" }, { path: SRC, text: "x" }])).toBe(a);
    expect(unitInputsSha256([{ path: SRC, text: "xy" }, { path: HDR, text: "" }])).not.toBe(a);
    expect(unitInputsSha256([{ path: HDR, text: null }])).not.toBe(unitInputsSha256([{ path: HDR, text: "" }]));
    // Contract with the Python side: sha256(path NUL len NUL bytes) per sorted path.
    expect(unitInputsSha256([{ path: "a", text: "b" }])).toBe(createHash("sha256").update("a\u00001\u0000b").digest("hex"));
    expect(unitInputsSha256([{ path: "a", text: null }])).toBe(createHash("sha256").update("a\u0000-1\u0000").digest("hex"));
  });

  test("a certificate survives a moved base but not a change to a caller in the same unit source", async () => {
    const check = certified([SRC, HDR]);
    const same = await partitionUnusedChecksByContent([check], (path) => texts[path] ?? null);
    expect(same.fresh).toEqual([check]);
    expect(same.stale).toEqual([]);
    const callerChanged: Record<string, string | null> = { ...texts, [SRC]: texts[SRC]!.replace("rolling(); }", "rolling(); b(); }") };
    const stale = await partitionUnusedChecksByContent([check], (path) => callerChanged[path] ?? null);
    expect(stale.fresh).toEqual([]);
    expect(stale.stale[0]?.reason).toContain("re-certify");
    expect(stale.stale[0]?.reason).toContain(SRC);
  });

  test("rows without a content binding pass through; a hash without inputs is stale", async () => {
    const legacy = { ...certified([SRC]), unit_inputs: undefined, unit_inputs_sha256: undefined } as BoundUnusedCheck;
    expect((await partitionUnusedChecksByContent([legacy], () => null)).fresh).toEqual([legacy]);
    const noInputs = { ...certified([SRC]), unit_inputs: [] } as BoundUnusedCheck;
    expect((await partitionUnusedChecksByContent([noInputs], () => null)).stale).toHaveLength(1);
  });
});

describe("unit_inputs_sha256 cross-language vector", () => {
  /** Written by the Python toolpack tests: steering_check.unit_inputs_sha256 reproduces every case. */
  const vector = JSON.parse(readFileSync(join(import.meta.dir, "../steering/__fixtures__/unit-inputs-vector.json"), "utf8")) as {
    cases: Array<{ name: string; files: Array<{ path: string; text: string | null }>; sha256: string }>;
  };

  test("TS reproduces every Python case", () => {
    expect(vector.cases.length).toBeGreaterThan(0);
    for (const vectorCase of vector.cases) expect([vectorCase.name, unitInputsSha256(vectorCase.files)]).toEqual([vectorCase.name, vectorCase.sha256]);
  });
});
