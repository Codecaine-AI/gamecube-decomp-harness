import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  OUT_OF_ORDER_INSTRUCTION,
  UNUSED_BODY_INSTRUCTION,
  parseSteeringDecision,
  steeringCertificateContext,
  steeringCertificateProblems,
  steeringRejectionReason,
} from "./steering-check.js";

/** Real `steering_check.py reduce` / `decide` output written by the toolpack tests (cross-language contract). */
const fixture = (name: string): unknown => JSON.parse(readFileSync(join(import.meta.dir, "__fixtures__", name), "utf8"));

function certify(decideName: string, reduceName: string) {
  const decision = parseSteeringDecision(fixture(decideName));
  const certificate = steeringCertificateContext({ decision, reduce: fixture(reduceName), sourceChanged: true });
  return { decision, certificate, problems: steeringCertificateProblems(decision, certificate) };
}

describe("real Python decide/reduce output", () => {
  test("the pass case parses with literal-boolean unit coverage and certifies", () => {
    const { decision, certificate, problems } = certify("decide-real-pass.json", "reduce-real-pass.json");
    expect(decision?.attempt).toBe("pass");
    expect(decision?.units).toEqual([{ unit: "u1", built: true, compared: true }]);
    expect(certificate).toEqual({ sourceChanged: true, reduceAnalysis: "complete", unresolvedGroups: [] });
    expect(problems).toEqual([]);
    expect(steeringRejectionReason({ mode: "enforce", decision, error: null, artifactPath: null, durationMs: 1, certificate })).toBeNull();
  });

  test("the steering case is rejected; decide's promotions replace reduce's unresolved list", () => {
    const { decision, certificate, problems } = certify("decide-real.json", "reduce-real.json");
    expect(decision?.attempt).toBe("steering_located");
    // reduce left a group unresolved; decide's final statuses resolved it, so only the steering remains.
    expect(certificate.unresolvedGroups).toEqual([]);
    expect(problems.join("; ")).toContain("steering located in g");
    expect(problems.join("; ")).toContain("behaviour-identical edit groups left in the patch");
    expect(steeringRejectionReason({ mode: "enforce", decision, error: null, artifactPath: null, durationMs: 1, certificate })).toStartWith("steering_located: ");
  });

  test("the dead UNUSED body case is a rule violation enforce rejects with the UNUSED-body instruction", () => {
    const { decision, certificate, problems } = certify("decide-real-violation.json", "reduce-real-violation.json");
    expect(decision?.attempt).toBe("rule_violation");
    expect(decision?.violations).toEqual([{ kind: "dead_unused_body", unit: "u1", file: "src/a.c", function: "u(void)", line: 14 }]);
    // Every field decide emits survives parsing, binding included (integration and publication validate it).
    const raw = (fixture("decide-real-violation.json") as { unused_checks: unknown[] }).unused_checks;
    expect(decision?.unused_checks).toEqual(raw as never);
    expect(decision?.unused_checks?.[0]).toMatchObject({ status: "dead", line: 14, body_sha256: expect.any(String), base_rev: expect.any(String) });
    // Every function row passes; the violation alone rejects.
    expect(decision?.functions.every((fn) => fn.decision === "pass")).toBe(true);
    expect(problems).toEqual(["dead UNUSED body: u(void) (src/a.c:14) — UNUSED functions may only be reconstructed when inlined"]);
    const reason = steeringRejectionReason({ mode: "enforce", decision, error: null, artifactPath: null, durationMs: 1, certificate });
    expect(reason).toStartWith("steering_located: dead UNUSED body: ");
    expect(reason).toEndWith(UNUSED_BODY_INSTRUCTION);
  });

  test("the out-of-order registry fill is a rule violation enforce rejects with the out-of-order instruction", () => {
    const { decision, certificate, problems } = certify("decide-real-order.json", "reduce-real-order.json");
    expect(decision?.attempt).toBe("rule_violation");
    // decide names no unit: the function row whose groups touch the file supplies it.
    expect(decision?.violations).toEqual([{
      kind: "out_of_order", file: "src/System/MarNameRefGen_Enemy.cpp", line: 5, class: "TKoopa",
      owner_unit: "mario/Enemy/Koopa", owner_progress: 0,
      // The wording follows the Python readiness model; only its tail is contract.
      reason: expect.stringContaining("leave it until the class's own unit is decompiled"),
      unit: "u2",
    }]);
    expect(decision?.order_checks?.map((check) => [check.class, check.status])).toEqual([["TTinKoopa", "ok"], ["TKoopa", "out_of_order"]]);
    // The ok check adds nothing and the out_of_order one is covered by its violation.
    expect(problems).toEqual([
      "out of order: src/System/MarNameRefGen_Enemy.cpp:5 uses TKoopa (owner mario/Enemy/Koopa, not decompiled) — don't fill in code that needs classes whose units are not decompiled",
    ]);
    const reason = steeringRejectionReason({ mode: "enforce", decision, error: null, artifactPath: null, durationMs: 1, certificate });
    expect(reason).toStartWith("steering_located: out of order: ");
    expect(reason).toEndWith(OUT_OF_ORDER_INSTRUCTION);
    expect(reason).not.toContain(UNUSED_BODY_INSTRUCTION);
  });
});

describe("real no-change output through the backfill job", () => {
  test("a checkout with no change against the base records a clean run", async () => {
    const { mkdtempSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { openState } = await import("@server/core/orchestrator-state");
    const { latestCleanSteeringBackfillRun, steeringCoverageFor } = await import("@server/core/harness-runtime/run-state/steering.js");
    const { runSteeringBackfill } = await import("@server/core/validation/jobs/steering-gate.js");
    const dir = mkdtempSync(join(tmpdir(), "steering-nochange-"));
    const store = openState(join(dir, "state"));
    try {
      const report = { edits: { files: [] }, reduce: fixture("reduce-real-nochange.json"), decision: fixture("decide-real-nochange.json") };
      const runner = Object.assign(async (args: string[]) => {
        if (args[0] === "check") (await import("node:fs")).writeFileSync(args[args.indexOf("--out") + 1]!, JSON.stringify(report));
        return { exitCode: 0, stdout: "", stderr: "" };
      });
      const result = await runSteeringBackfill({
        store, gameId: "sms", repoRoot: dir, baseRev: "base", headRev: "head", record: true, apply: false, dryRun: false,
        runner, buildRunner: async () => ({ exitCode: 0, stdout: "", stderr: "" }), outputDir: join(dir, "out"),
        git: { changedPaths: () => [] },
      });
      expect(result).toMatchObject({ clean: true, problems: [], functions: [], units: [] });
      expect(latestCleanSteeringBackfillRun(store, "sms")?.baselineRev).toBe("head");
      expect(steeringCoverageFor(store, "sms", "u1")).toBeNull();
    } finally {
      store.db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
