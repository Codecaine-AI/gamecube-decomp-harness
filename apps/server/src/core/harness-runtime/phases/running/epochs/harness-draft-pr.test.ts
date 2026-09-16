import { initializeHarnessState, transitionHarnessState } from "@server/core/harness-state/state.js";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { latestDashboardArtifactPayload, openState, type StateStore } from "@server/core/orchestrator-state";
import {
  DEFAULT_HARNESS_DRAFT_PR_BODY,
  DEFAULT_HARNESS_DRAFT_PR_TITLE,
  HARNESS_DRAFT_PR_ARTIFACT_KEY,
  HARNESS_DRAFT_PR_ARTIFACT_TYPE,
  publishHarnessDraftPr,
  type HarnessDraftPrCommandResult,
  type HarnessDraftPrCommandRunner,
} from "./harness-draft-pr.js";

function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function ok(stdout = ""): HarnessDraftPrCommandResult {
  return { exitCode: 0, stdout, stderr: "" };
}

function fail(stderr = "failed", exitCode = 1): HarnessDraftPrCommandResult {
  return { exitCode, stdout: "", stderr };
}

function commandKey(command: string[]): string {
  return command.join(" ");
}

function fakeRunner(
  handlers: Record<string, HarnessDraftPrCommandResult | ((command: string[]) => HarnessDraftPrCommandResult)>,
): { calls: string[]; runCommand: HarnessDraftPrCommandRunner } {
  const calls: string[] = [];
  return {
    calls,
    runCommand: async (_cwd, command) => {
      const key = commandKey(command);
      calls.push(key);
      const handler = handlers[key];
      if (!handler) return fail(`unexpected command: ${key}`, 127);
      return typeof handler === "function" ? handler(command) : handler;
    },
  };
}

describe("publishHarnessDraftPr", () => {
  const stores: StateStore[] = [];

  afterEach(() => {
    for (const store of stores.splice(0)) store.db.close();
  });

  function state(): { stateDir: string; store: StateStore } {
    const stateDir = tempDir("harness-draft-pr-state-");
    const store = openState(stateDir);
    stores.push(store);
    return { stateDir, store };
  }

  test("pushes the harness branch and creates a draft PR when none exists", async () => {
    const { stateDir, store } = state();
    const repoRoot = tempDir("harness-draft-pr-repo-");
    initializeHarnessState(store.db, { gameId: "melee", harnessId: "12345678-abcd", worktree: repoRoot, configurationRevision: "test", commandId: "init" });
    transitionHarnessState(store.db, { gameId: "melee", expectedRevision: 0, commandId: "run", patch: { history: { run_id: "run-1" } } });
    const branch = "orchestrator/cycle/12345678-abcd";
    const title = "GameCube Decomp Harness Session 12345678";
    const bodyPath = join(stateDir, "harness_draft_pr", "run-1", "draft_body.md");
    const { calls, runCommand } = fakeRunner({
      "git rev-parse --abbrev-ref HEAD": ok(`${branch}\n`),
      "git diff --quiet origin/master...HEAD": fail("", 1),
      "git remote get-url origin": ok("https://github.com/doldecomp/melee.git\n"),
      "git remote get-url fork": ok("git@github.com:Ford/melee.git\n"),
      [`git push --force-with-lease -u fork HEAD:${branch}`]: ok(),
      "gh api repos/doldecomp/melee/pulls?head=Ford%3Aorchestrator%2Fcycle%2F12345678-abcd&state=open": ok("[]\n"),
      [`gh pr create --repo doldecomp/melee --head Ford:${branch} --base master --draft --title ${title} --body-file ${bodyPath}`]:
        ok("https://github.com/doldecomp/melee/pull/123\n"),
    });

    const result = await publishHarnessDraftPr(
      {
        commitSha: "abc123",
        epochOrdinal: 3,
        matchedCodePercent: 83.4,
        gameId: "melee",
        repoRoot,
        runId: "run-1",
        savePointId: "save-1",
        stateDir,
        store,
      },
      { runCommand },
    );

    expect(result.status).toBe("created");
    expect(result.created).toBe(true);
    expect(result.prNumber).toBe(123);
    expect(result.url).toBe("https://github.com/doldecomp/melee/pull/123");
    expect(result.title).toBe(title);
    expect(calls).toContain(`git push --force-with-lease -u fork HEAD:${branch}`);
    const body = readFileSync(bodyPath, "utf8");
    expect(body).toBe(
      "Work in Progress AI Decomp Session\n\nPlease use this to improve upon other matches and whatnot for your work.\n\n**Note for users and AI agents:** Please mention this PR when pulling from it so there is a canonical record and maintainers know that any work came from this PR and are careful so slop code does not get merged in.\n",
    );

    const artifact = latestDashboardArtifactPayload(store, {
      artifactType: HARNESS_DRAFT_PR_ARTIFACT_TYPE,
      artifactKey: HARNESS_DRAFT_PR_ARTIFACT_KEY,
      runId: "run-1",
    });
    expect(artifact.status).toBe("created");
    expect(artifact.harnessId).toBe("12345678-abcd");
  });

  test("reuses an existing open PR for the harness branch", async () => {
    const { stateDir, store } = state();
    const repoRoot = tempDir("harness-draft-pr-repo-");
    initializeHarnessState(store.db, { gameId: "melee", harnessId: "harness2", worktree: repoRoot, configurationRevision: "test", commandId: "init" });
    transitionHarnessState(store.db, { gameId: "melee", expectedRevision: 0, commandId: "run", patch: { history: { run_id: "run-2" } } });
    const branch = "orchestrator/cycle/cycle-2";
    const title = `${DEFAULT_HARNESS_DRAFT_PR_TITLE} harness2`;
    const bodyPath = join(stateDir, "harness_draft_pr", "run-2", "draft_body.md");
    const { calls, runCommand } = fakeRunner({
      "git rev-parse --abbrev-ref HEAD": ok(`${branch}\n`),
      "git diff --quiet origin/master...HEAD": fail("", 1),
      "git remote get-url origin": ok("git@github.com:doldecomp/melee.git\n"),
      "git remote get-url fork": ok("https://github.com/Ford/melee.git\n"),
      [`git push --force-with-lease -u fork HEAD:${branch}`]: ok(),
      "gh api repos/doldecomp/melee/pulls?head=Ford%3Aorchestrator%2Fcycle%2Fcycle-2&state=open": ok(
        JSON.stringify([{ number: 456, html_url: "https://github.com/doldecomp/melee/pull/456", draft: true, state: "open" }]),
      ),
      [`gh pr edit 456 --repo doldecomp/melee --title ${title} --body-file ${bodyPath}`]: ok(),
    });

    const result = await publishHarnessDraftPr(
      {
        gameId: "melee",
        commitSha: "def456",
        epochLabel: "epoch-2",
        repoRoot,
        runId: "run-2",
        stateDir,
        store,
      },
      { runCommand },
    );

    expect(result.status).toBe("updated");
    expect(result.created).toBe(false);
    expect(result.prNumber).toBe(456);
    expect(calls.some((call) => call.startsWith("gh pr create"))).toBe(false);
    expect(calls).toContain(`gh pr edit 456 --repo doldecomp/melee --title ${title} --body-file ${bodyPath}`);
    expect(readFileSync(bodyPath, "utf8")).toBe(`${DEFAULT_HARNESS_DRAFT_PR_BODY}\n`);
  });

  test("skips non-harness branches without publishing", async () => {
    const { stateDir, store } = state();
    const repoRoot = tempDir("harness-draft-pr-repo-");
    const { calls, runCommand } = fakeRunner({
      "git rev-parse --abbrev-ref HEAD": ok("feature/manual\n"),
    });

    const result = await publishHarnessDraftPr(
      {
        commitSha: "abc123",
        repoRoot,
        runId: "run-3",
        stateDir,
        store,
      },
      { runCommand },
    );

    expect(result.status).toBe("failed");
    expect(result.error).toContain("selected game");
    expect(calls).toEqual(["git rev-parse --abbrev-ref HEAD"]);
  });
});
