import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
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
