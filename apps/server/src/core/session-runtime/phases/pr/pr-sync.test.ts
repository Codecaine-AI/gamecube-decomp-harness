import { describe, expect, test } from "bun:test";

import { createPrSyncService, type PrSyncProjectContext, type PrSyncServiceDeps } from "./pr-sync.js";

type JsonObject = Record<string, unknown>;

function createFixture() {
  let plan: JsonObject = {};
  let previous: JsonObject = { records: [] };
  let written: JsonObject = {};
  let cliResult = { exitCode: 1, stdout: "", stderr: "offline" };
  let cliHandler: ((command: string[]) => typeof cliResult) | null = null;
  let originUrl = "";
  const cliCommands: string[][] = [];
  const campaignObservations: JsonObject[] = [];
  const campaignStateOpenAttempts: string[] = [];
  const deps: PrSyncServiceDeps<PrSyncProjectContext> = {
    appendLog: () => {},
    latestPrSplitPlanSummary: () => plan,
    latestRunId: () => "run-1",
    openCampaignState: (stateDir) => {
      campaignStateOpenAttempts.push(stateDir);
      throw new Error(`Unexpected campaign state open: ${stateDir}`);
    },
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
    runCli: async (command) => {
      cliCommands.push(command);
      return cliHandler ? cliHandler(command) : cliResult;
    },
    runGitQuiet: (_repoRoot, args) => {
      if (args[0] === "remote") {
        return originUrl
          ? { exitCode: 0, stdout: `${originUrl}\n`, stderr: "" }
          : { exitCode: 1, stdout: "", stderr: "no remote" };
      }
      if (args[0] === "for-each-ref") return { exitCode: 1, stdout: "", stderr: "no branches" };
      return { exitCode: 0, stdout: "base-sha\n", stderr: "" };
    },
  };
  const service = createPrSyncService(deps);
  return {
    service,
    setCliResult(value: typeof cliResult) { cliResult = value; },
    setCliHandler(value: (command: string[]) => typeof cliResult) { cliHandler = value; },
    setOriginUrl(value: string) { originUrl = value; },
    setPlan(value: JsonObject) { plan = value; },
    setPrevious(value: JsonObject) { previous = value; },
    written: () => written,
    campaignObservations,
    campaignStateOpenAttempts,
    cliCommands,
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
  test("forwards GitHub state and feedback through an injected campaign observer without opening state", async () => {
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
    expect(fixture.campaignStateOpenAttempts).toEqual([]);
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

  test("forwards reviews and inline review comments with stable source ids", async () => {
    const fixture = createFixture();
    fixture.setCliHandler((command) => command[1] === "api"
      ? {
          exitCode: 0,
          stdout: JSON.stringify([{ id: 991, body: "Please preserve the signed comparison." }]),
          stderr: "",
        }
      : {
          exitCode: 0,
          stdout: JSON.stringify({
            comments: [],
            reviews: [{ id: "PRR_88", body: "The overall direction needs revision." }],
            files: [],
            statusCheckRollup: [],
          }),
          stderr: "",
        });

    await fixture.service.hydratePrRecordFromGithub(
      { branch: "codex/split-01-alpha" },
      { headRefName: "codex/split-01-alpha", number: 2850, state: "OPEN" },
      "doldecomp/melee",
      "/repo",
      "/state",
    );

    expect(fixture.campaignObservations[0]?.feedback).toEqual([
      { sourceKind: "pull_request_review", sourceId: "PRR_88", summary: "The overall direction needs revision." },
      { sourceKind: "pull_request_review_comment", sourceId: "991", summary: "Please preserve the signed comparison." },
    ]);
  });

  test("forwards durable approval evidence from the latest approved GitHub review", async () => {
    const fixture = createFixture();
    fixture.setCliHandler((command) => command[1] === "api"
      ? { exitCode: 0, stdout: "[]", stderr: "" }
      : {
          exitCode: 0,
          stdout: JSON.stringify({
            comments: [],
            reviews: [
              {
                id: "PRR_41",
                author: { login: "earlier-reviewer" },
                body: "",
                state: "APPROVED",
                submittedAt: "2026-08-13T11:00:00.000Z",
              },
              {
                id: "PRR_42",
                author: { login: "octocat" },
                body: "",
                state: "APPROVED",
                submittedAt: "2026-08-13T12:00:00.000Z",
              },
              {
                id: "PRR_43",
                author: { login: "commenter" },
                body: "",
                state: "COMMENTED",
                submittedAt: "2026-08-13T13:00:00.000Z",
              },
            ],
            files: [],
            statusCheckRollup: [],
          }),
          stderr: "",
        });

    await fixture.service.hydratePrRecordFromGithub(
      { branch: "codex/split-01-alpha" },
      {
        author: { login: "pr-author" },
        headRefName: "codex/split-01-alpha",
        headRefOid: "head-sha-approved",
        number: 2850,
        reviewDecision: "APPROVED",
        state: "OPEN",
        updatedAt: "2026-08-13T13:30:00.000Z",
      },
      "doldecomp/melee",
      "/repo",
      "/state",
    );

    expect(fixture.campaignStateOpenAttempts).toEqual([]);
    expect(fixture.campaignObservations).toEqual([{
      approvalSourceIdentity: "github-review:PRR_42",
      approvedRevision: "head-sha-approved",
      approvingActor: "octocat",
      branch: "codex/split-01-alpha",
      commandId: "pr-sync:2850:2026-08-13T13:30:00.000Z",
      feedback: [],
      mergedUpstreamRevision: "",
      occurredAt: "2026-08-13T13:30:00.000Z",
      reviewDecision: "APPROVED",
      state: "OPEN",
      upstreamPrNumber: 2850,
    }]);
  });

  test("requests the observed head revision in the GitHub PR list query", async () => {
    const fixture = createFixture();
    fixture.setOriginUrl("git@github.com:doldecomp/melee.git");
    fixture.setCliResult({ exitCode: 0, stdout: "[]", stderr: "" });

    await fixture.service.syncPrRecords({ runId: "run-1" });

    expect(fixture.cliCommands).toEqual([[
      "gh", "pr", "list",
      "--repo", "doldecomp/melee",
      "--state", "all",
      "--limit", "100",
      "--json", "number,title,state,isDraft,url,headRefName,headRefOid,author,reviewDecision,updatedAt,mergeCommit",
    ]]);
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
