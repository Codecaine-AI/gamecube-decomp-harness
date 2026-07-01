import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { latestDashboardArtifactPayload, openState, type StateStore } from "@server/core/orchestrator-state";
import {
  DEFAULT_SESSION_DRAFT_PR_BODY,
  DEFAULT_SESSION_DRAFT_PR_TITLE,
  SESSION_DRAFT_PR_ARTIFACT_KEY,
  SESSION_DRAFT_PR_ARTIFACT_TYPE,
  publishSessionDraftPr,
  type SessionDraftPrCommandResult,
  type SessionDraftPrCommandRunner,
} from "./session-draft-pr.js";

function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function ok(stdout = ""): SessionDraftPrCommandResult {
  return { exitCode: 0, stdout, stderr: "" };
}

function fail(stderr = "failed", exitCode = 1): SessionDraftPrCommandResult {
  return { exitCode, stdout: "", stderr };
}

function commandKey(command: string[]): string {
  return command.join(" ");
}

function fakeRunner(
  handlers: Record<string, SessionDraftPrCommandResult | ((command: string[]) => SessionDraftPrCommandResult)>,
): { calls: string[]; runCommand: SessionDraftPrCommandRunner } {
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

describe("publishSessionDraftPr", () => {
  const stores: StateStore[] = [];

  afterEach(() => {
    for (const store of stores.splice(0)) store.db.close();
  });

  function state(): { stateDir: string; store: StateStore } {
    const stateDir = tempDir("session-draft-pr-state-");
    const store = openState(stateDir);
    stores.push(store);
    return { stateDir, store };
  }

  test("pushes the session branch and creates a draft PR when none exists", async () => {
    const { stateDir, store } = state();
    const repoRoot = tempDir("session-draft-pr-repo-");
    const branch = "orchestrator/session/session-1";
    const { calls, runCommand } = fakeRunner({
      "git rev-parse --abbrev-ref HEAD": ok(`${branch}\n`),
      "git diff --quiet origin/master...HEAD": fail("", 1),
      "git remote get-url origin": ok("https://github.com/doldecomp/melee.git\n"),
      "git remote get-url fork": ok("git@github.com:Ford/melee.git\n"),
      [`git push --force-with-lease -u fork HEAD:${branch}`]: ok(),
      "gh api repos/doldecomp/melee/pulls?head=Ford%3Aorchestrator%2Fsession%2Fsession-1&state=open": ok("[]\n"),
      [`gh pr create --repo doldecomp/melee --head Ford:${branch} --base master --draft --title ${DEFAULT_SESSION_DRAFT_PR_TITLE} --body-file ${join(stateDir, "session_draft_pr", "run-1", "draft_body.md")}`]:
        ok("https://github.com/doldecomp/melee/pull/123\n"),
    });

    const result = await publishSessionDraftPr(
      {
        commitSha: "abc123",
        matchedCodePercent: 83.4,
        projectId: "melee",
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
    expect(calls).toContain(`git push --force-with-lease -u fork HEAD:${branch}`);
    expect(readFileSync(join(stateDir, "session_draft_pr", "run-1", "draft_body.md"), "utf8")).toBe(DEFAULT_SESSION_DRAFT_PR_BODY);

    const artifact = latestDashboardArtifactPayload(store, {
      artifactType: SESSION_DRAFT_PR_ARTIFACT_TYPE,
      artifactKey: SESSION_DRAFT_PR_ARTIFACT_KEY,
      runId: "run-1",
    });
    expect(artifact.status).toBe("created");
    expect(artifact.sessionUuid).toBe("session-1");
  });

  test("reuses an existing open PR for the session branch", async () => {
    const { stateDir, store } = state();
    const repoRoot = tempDir("session-draft-pr-repo-");
    const branch = "orchestrator/session/session-2";
    const { calls, runCommand } = fakeRunner({
      "git rev-parse --abbrev-ref HEAD": ok(`${branch}\n`),
      "git diff --quiet origin/master...HEAD": fail("", 1),
      "git remote get-url origin": ok("git@github.com:doldecomp/melee.git\n"),
      "git remote get-url fork": ok("https://github.com/Ford/melee.git\n"),
      [`git push --force-with-lease -u fork HEAD:${branch}`]: ok(),
      "gh api repos/doldecomp/melee/pulls?head=Ford%3Aorchestrator%2Fsession%2Fsession-2&state=open": ok(
        JSON.stringify([{ number: 456, html_url: "https://github.com/doldecomp/melee/pull/456", draft: true, state: "open" }]),
      ),
    });

    const result = await publishSessionDraftPr(
      {
        commitSha: "def456",
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
  });

  test("skips non-session branches without publishing", async () => {
    const { stateDir, store } = state();
    const repoRoot = tempDir("session-draft-pr-repo-");
    const { calls, runCommand } = fakeRunner({
      "git rev-parse --abbrev-ref HEAD": ok("feature/manual\n"),
    });

    const result = await publishSessionDraftPr(
      {
        commitSha: "abc123",
        repoRoot,
        runId: "run-3",
        stateDir,
        store,
      },
      { runCommand },
    );

    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("not_session_branch");
    expect(calls).toEqual(["git rev-parse --abbrev-ref HEAD"]);
  });
});
