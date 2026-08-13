import { describe, expect, test } from "bun:test";

import { createPrSyncService, type PrSyncProjectContext, type PrSyncServiceDeps } from "./pr-sync.js";

type JsonObject = Record<string, unknown>;

function createFixture() {
  let plan: JsonObject = {};
  let previous: JsonObject = { records: [] };
  let written: JsonObject = {};
  let cliResult = { exitCode: 1, stdout: "", stderr: "offline" };
  const campaignObservations: JsonObject[] = [];
  const deps: PrSyncServiceDeps<PrSyncProjectContext> = {
    appendLog: () => {},
    latestPrSplitPlanSummary: () => plan,
    latestRunId: () => "run-1",
    outputTail: (value) => value,
    observeCampaignPr: (_stateDir, input) => {
      campaignObservations.push(input as unknown as JsonObject);
      return { feedbackItemIds: [], ignored: true, series: null };
    },
    records: {
      deriveReviewSubState: (review) => review,
      normalizePrRecord: (record) => record,
      normalizePrRecordsPayload: (payload) => payload,
      prRecordContext: () => ({ runId: "run-1", baseSha: "base-sha" }),
      readPrRecords: () => previous,
      writePrRecords: (_stateDir, payload) => {
        written = payload;
        return payload;
      },
    },
    resolveDashboardProject: () => ({ repoRoot: "/repo", stateDir: "/state", project: { baseRef: "origin/master" } }),
    runCli: async () => cliResult,
    runGitQuiet: (_repoRoot, args) => {
      if (args[0] === "remote") return { exitCode: 1, stdout: "", stderr: "no remote" };
      if (args[0] === "for-each-ref") return { exitCode: 1, stdout: "", stderr: "no branches" };
      return { exitCode: 0, stdout: "base-sha\n", stderr: "" };
    },
  };
  const service = createPrSyncService(deps);
  return {
    service,
    setCliResult(value: typeof cliResult) { cliResult = value; },
    setPlan(value: JsonObject) { plan = value; },
    setPrevious(value: JsonObject) { previous = value; },
    written: () => written,
    campaignObservations,
  };
}

function matchPlan(supportPathspecs?: string[]): JsonObject {
  return {
    slices: [{
      id: "gm",
      displayName: "GM",
      branchName: "pr-split/gm",
      title: "Melee decomp: GM",
      scope: "melee/gm",
      lane: "match",
      pathspecs: ["src/melee/gm/gmtest.c"],
      ...(supportPathspecs?.length ? { supportPathspecs } : {}),
    }],
  };
}

describe("PR sync support manifests", () => {
  test("forwards GitHub state and feedback to additive campaign observation", async () => {
    const fixture = createFixture();
    fixture.setCliResult({
      exitCode: 0,
      stdout: JSON.stringify({
        comments: [{ id: "IC_123", body: "Please use the project typedef." }],
        files: [],
        statusCheckRollup: [],
      }),
      stderr: "",
    });

    const record = await fixture.service.hydratePrRecordFromGithub(
      { branch: "codex/split-01-alpha" },
      {
        headRefName: "codex/split-01-alpha",
        number: 2850,
        reviewDecision: "CHANGES_REQUESTED",
        state: "OPEN",
        updatedAt: "2026-08-13T12:00:00.000Z",
      },
      "doldecomp/melee",
      "/repo",
      "/state",
    );

    expect(record).toMatchObject({ status: "changes_requested", comments: 1 });
    expect(fixture.campaignObservations).toEqual([{
      branch: "codex/split-01-alpha",
      commandId: "pr-sync:2850:2026-08-13T12:00:00.000Z",
      feedback: [{ sourceKind: "issue_comment", sourceId: "IC_123", summary: "Please use the project typedef." }],
      mergedUpstreamRevision: "",
      occurredAt: "2026-08-13T12:00:00.000Z",
      reviewDecision: "CHANGES_REQUESTED",
      state: "OPEN",
      upstreamPrNumber: 2850,
    }]);
  });

  test("persists declared support files, then removes and invalidates them on re-plan", async () => {
    const fixture = createFixture();
    const support = ["include/melee/gr/ground.h"];
    fixture.setPlan(matchPlan(support));
    fixture.setPrevious({
      records: [{
        branch: "pr-split/gm",
        runId: "run-1",
        baseSha: "base-sha",
        files: ["src/melee/gm/gmtest.c"],
        supportFiles: support,
        status: "planned",
        local: { status: "ready", commitSha: "old-sha" },
        validation: { status: "passed" },
      }],
    });

    await fixture.service.syncPrRecords({ runId: "run-1" });
    expect((fixture.written().records as JsonObject[])[0]).toMatchObject({
      supportFiles: support,
      local: { status: "ready" },
      validation: { status: "passed" },
    });

    fixture.setPrevious(fixture.written());
    fixture.setPlan(matchPlan());
    await fixture.service.syncPrRecords({ runId: "run-1" });
    const replanned = (fixture.written().records as JsonObject[])[0];
    expect("supportFiles" in replanned).toBe(false);
    expect(replanned.local).toMatchObject({ status: "not_prepared" });
    expect(replanned.validation).toMatchObject({ status: "not_run" });
  });

  test("keeps primary and support files disjoint after GitHub hydration", async () => {
    const fixture = createFixture();
    fixture.setCliResult({
      exitCode: 0,
      stdout: JSON.stringify({
        comments: [],
        statusCheckRollup: [],
        files: [
          { path: "src/melee/gm/gmtest.c" },
          { path: "include/melee/gr/ground.h" },
        ],
      }),
      stderr: "",
    });

    const hydrated = await fixture.service.hydratePrRecordFromGithub(
      {
        branch: "pr-split/gm",
        files: ["src/melee/gm/gmtest.c"],
        supportFiles: ["include/melee/gr/ground.h"],
      },
      { number: 123, state: "OPEN", headRefName: "pr-split/gm", author: { login: "dev" } },
      "doldecomp/melee",
      "/repo",
    );

    expect(hydrated.files).toEqual(["src/melee/gm/gmtest.c"]);
    expect(hydrated.supportFiles).toEqual(["include/melee/gr/ground.h"]);
  });
});
