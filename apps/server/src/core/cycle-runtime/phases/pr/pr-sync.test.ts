import { describe, expect, test } from "bun:test";

import { createPrSyncService, type PrSyncGameContext, type PrSyncServiceDeps } from "./pr-sync.js";

type JsonObject = Record<string, unknown>;

function createFixture() {
  let plan: JsonObject = {};
  let previous: JsonObject = { records: [] };
  let written: JsonObject = {};
  let cliResult = { exitCode: 1, stdout: "", stderr: "offline" };
  let cliHandler: ((command: string[]) => typeof cliResult) | null = null;
  let originUrl = "";
  const cliCommands: string[][] = [];
  const deps: PrSyncServiceDeps<PrSyncGameContext> = {
    latestPrSplitPlanSummary: () => plan,
    latestRunId: () => "run-1",
    outputTail: (value) => value,
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
    resolveDashboardGame: () => ({ repoRoot: "/repo", stateDir: "/state", game: { baseRef: "origin/master" } }),
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
  test("hydrates GitHub state without campaign machinery", async () => {
    const fixture = createFixture();
    fixture.setCliResult({
      exitCode: 0,
      stdout: JSON.stringify({
        comments: [{ id: "IC_123", body: "Please use the game typedef." }],
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
    );

    expect(record).toMatchObject({ status: "changes_requested", comments: 1 });
    expect(fixture.cliCommands).toEqual([[
      "gh", "pr", "view", "2850", "--repo", "doldecomp/melee", "--json", "comments,reviews,statusCheckRollup,files",
    ]]);
  });

  test("requests the PR record fields in the GitHub PR list query", async () => {
    const fixture = createFixture();
    fixture.setOriginUrl("git@github.com:doldecomp/melee.git");
    fixture.setCliResult({ exitCode: 0, stdout: "[]", stderr: "" });

    await fixture.service.syncPrRecords({ runId: "run-1" });

    expect(fixture.cliCommands).toEqual([[
      "gh", "pr", "list",
      "--repo", "doldecomp/melee",
      "--state", "all",
      "--limit", "100",
      "--json", "number,title,state,isDraft,url,headRefName,author,reviewDecision,updatedAt",
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
