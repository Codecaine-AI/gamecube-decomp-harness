import { initializeHarnessState, transitionHarnessState } from "@server/core/harness-state/state.js";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { latestDashboardArtifactPayload, openState, type StateStore } from "@server/core/orchestrator-state";
import type { EditScopeOrderingPolicy, EditScopeRunner } from "@server/core/validation/edit-scope/edit-scope.js";
import {
  HARNESS_DRAFT_PR_ARTIFACT_KEY,
  HARNESS_DRAFT_PR_ARTIFACT_TYPE,
  publishHarnessDraftPr,
  type HarnessDraftPrCommandResult,
  type HarnessDraftPrCommandRunner,
} from "./harness-draft-pr.js";

// The order-and-scope fence on publication: `edit_scope.py pr` runs on the exact
// head SHA immediately before the push, and only that SHA is pushed.

const SHA = "a".repeat(40);
const MOVED = "b".repeat(40);
const BRANCH = "orchestrator/cycle/12345678-abcd";
const LOOKUP = "gh api repos/doldecomp/melee/pulls?head=Ford%3Aorchestrator%2Fcycle%2F12345678-abcd&state=open";
const ENFORCE: EditScopeOrderingPolicy = { mode: "enforce", gatedPaths: ["src/*"] };
const SHADOW: EditScopeOrderingPolicy = { mode: "shadow", gatedPaths: ["src/*"] };

const ok = (stdout = ""): HarnessDraftPrCommandResult => ({ exitCode: 0, stdout, stderr: "" });
const fail = (stderr = "failed", exitCode = 1): HarnessDraftPrCommandResult => ({ exitCode, stdout: "", stderr });

function report(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    identity: { base_rev: "origin/master", patch_sha256: "p", readiness: {}, head_rev: SHA },
    verdict: "pass",
    hunks: [],
    warnings: [],
    limits: { foreign_headers: 0, foreign_header_lines: 0 },
    pr_size: { units: 2, files: 3, changed_lines: 40, warnings: [] },
    same_pr_prerequisites: [],
    ...overrides,
  });
}

const REJECT = report({
  verdict: "reject",
  hunks: [{ file: "src/a.cpp", line: 3, class: "TFoo", verdict: "not_ready", reason: "owner not decompiled", owner_unit: "unit_b" }],
});

function scopeRunner(result: HarnessDraftPrCommandResult | (() => HarnessDraftPrCommandResult)): { calls: string[][]; runner: EditScopeRunner } {
  const calls: string[][] = [];
  return {
    calls,
    runner: async (args) => {
      calls.push(args);
      const out = typeof result === "function" ? result() : result;
      return { ...out, exitCode: out.exitCode ?? 1 };
    },
  };
}

describe("publishHarnessDraftPr scope check", () => {
  const stores: StateStore[] = [];
  afterEach(() => {
    for (const store of stores.splice(0)) store.db.close();
  });

  function setup(existingPr = false) {
    const stateDir = mkdtempSync(join(tmpdir(), "harness-draft-pr-scope-state-"));
    const store = openState(stateDir);
    stores.push(store);
    const repoRoot = mkdtempSync(join(tmpdir(), "harness-draft-pr-scope-repo-"));
    initializeHarnessState(store.db, { gameId: "sms", harnessId: "12345678-abcd", worktree: repoRoot, configurationRevision: "test", commandId: "init" });
    transitionHarnessState(store.db, { gameId: "sms", expectedRevision: 0, commandId: "run", patch: { history: { run_id: "run-1" } } });
    const bodyPath = join(stateDir, "harness_draft_pr", "run-1", "draft_body.md");
    const title = "GameCube Decomp Harness Session 12345678";
    let head = SHA;
    const calls: string[] = [];
    const handlers: Record<string, () => HarnessDraftPrCommandResult> = {
      "git rev-parse --abbrev-ref HEAD": () => ok(`${BRANCH}\n`),
      "git rev-parse --verify HEAD^{commit}": () => ok(`${head}\n`),
      [`git rev-parse --verify ${SHA}^{commit}`]: () => ok(`${SHA}\n`),
      "git diff --quiet origin/master...HEAD": () => fail("", 1),
      [`git diff --quiet origin/master...${SHA}`]: () => fail("", 1),
      "git remote get-url origin": () => ok("https://github.com/doldecomp/melee.git\n"),
      "git remote get-url fork": () => ok("git@github.com:Ford/melee.git\n"),
      [`git push --force-with-lease -u fork HEAD:${BRANCH}`]: () => ok(),
      [`git push --force-with-lease fork ${SHA}:refs/heads/${BRANCH}`]: () => ok(),
      [LOOKUP]: () => ok(existingPr ? JSON.stringify([{ number: 456, html_url: "https://github.com/doldecomp/melee/pull/456", draft: true, state: "open" }]) : "[]\n"),
      [`gh pr create --repo doldecomp/melee --head Ford:${BRANCH} --base master --draft --title ${title} --body-file ${bodyPath}`]:
        () => ok("https://github.com/doldecomp/melee/pull/123\n"),
      [`gh pr edit 456 --repo doldecomp/melee --title ${title} --body-file ${bodyPath}`]: () => ok(),
    };
    const runCommand: HarnessDraftPrCommandRunner = async (_cwd, command) => {
      const key = command.join(" ");
      calls.push(key);
      const handler = handlers[key];
      return handler ? handler() : fail(`unexpected command: ${key}`, 127);
    };
    const input = { gameId: "sms", repoRoot, runId: "run-1", stateDir, store };
    return { calls, runCommand, input, store, moveHead: (sha: string) => { head = sha; } };
  }

  const pushes = (calls: string[]) => calls.filter((call) => call.startsWith("git push"));
  const github = (calls: string[]) => calls.filter((call) => call.startsWith("gh "));

  for (const existingPr of [false, true]) {
    test(`enforce: a rejected range is refused before push on ${existingPr ? "update" : "initial publish"}`, async () => {
      const { calls, runCommand, input, store } = setup(existingPr);
      const scope = scopeRunner(ok(REJECT));
      const result = await publishHarnessDraftPr({ ...input, commitSha: SHA, ordering: ENFORCE }, { runCommand, editScopeRunner: scope.runner });

      expect(result.status).toBe("scope_refused");
      expect(result.commitSha).toBe(SHA);
      expect(result.reason).toContain("TFoo (not_ready, owner unit_b) at src/a.cpp:3");
      expect(result.scopeCheck).toMatchObject({ mode: "enforce", headSha: SHA, verdict: "reject" });
      expect(result.scopeCheck?.rejected_hunks.map((hunk) => hunk.class)).toEqual(["TFoo"]);
      expect(pushes(calls)).toEqual([]);
      expect(github(calls)).toEqual([]);
      expect(scope.calls).toHaveLength(1);
      expect(scope.calls[0]!.slice(0, 7)).toEqual(["pr", "--repo", input.repoRoot, "--base", "origin/master", "--head", SHA]);
      // The checker refuses to run without a policy: the publisher always passes the game's.
      expect(scope.calls[0]!.slice(-3)).toEqual(["--policy-json", JSON.stringify({ gatedPaths: ENFORCE.gatedPaths, ...(ENFORCE.scope ? { scope: ENFORCE.scope } : {}) }), "--json"]);
      const artifact = latestDashboardArtifactPayload(store, { artifactType: HARNESS_DRAFT_PR_ARTIFACT_TYPE, artifactKey: HARNESS_DRAFT_PR_ARTIFACT_KEY, runId: "run-1" });
      expect(artifact.status).toBe("scope_refused");
    });
  }

  for (const [label, outcome] of [
    ["exits non-zero", fail("ReadinessError missing_map", 2)],
    ["returns malformed output", ok("{not json")],
    ["reports a different head", ok(report({ identity: { head_rev: MOVED } }))],
  ] as const) {
    test(`enforce: a checker that ${label} refuses without push or GitHub calls`, async () => {
      const { calls, runCommand, input } = setup(true);
      const scope = scopeRunner(outcome);
      const result = await publishHarnessDraftPr({ ...input, commitSha: SHA, ordering: ENFORCE }, { runCommand, editScopeRunner: scope.runner });
      expect(result.status).toBe("scope_refused");
      expect(result.reason).toContain("could not run");
      expect(result.scopeCheck?.error).toBeTruthy();
      expect(pushes(calls)).toEqual([]);
      expect(github(calls)).toEqual([]);
    });
  }

  test("a HEAD that moves after the check does not change what is pushed", async () => {
    const { calls, runCommand, input, moveHead } = setup();
    const scope = scopeRunner(() => {
      moveHead(MOVED);
      return ok(report());
    });
    const result = await publishHarnessDraftPr({ ...input, ordering: ENFORCE }, { runCommand, editScopeRunner: scope.runner });

    expect(result.status).toBe("created");
    expect(result.commitSha).toBe(SHA);
    expect(scope.calls[0]).toContain(SHA);
    expect(calls.filter((call) => call.startsWith("git rev-parse --verify"))).toEqual(["git rev-parse --verify HEAD^{commit}"]);
    expect(pushes(calls)).toEqual([`git push --force-with-lease fork ${SHA}:refs/heads/${BRANCH}`]);
    // The check runs after the diff and remotes, immediately before the push.
    expect(calls.at(calls.indexOf(pushes(calls)[0]!) - 1)).toBe("git remote get-url fork");
  });

  test("passes the evidence file and the policy to the checker and records stale certificates", async () => {
    const { runCommand, input } = setup();
    const scope = scopeRunner(ok(report()));
    const result = await publishHarnessDraftPr({
      ...input, commitSha: SHA, ordering: ENFORCE,
      unusedChecksPath: "/artifacts/pr_unused_checks.json", unusedChecksStale: ["stale certificate for TBar::b (unit inputs changed: src/b.cpp); re-certify"],
    }, { runCommand, editScopeRunner: scope.runner });
    expect(result.status).toBe("created");
    expect(scope.calls[0]).toEqual([
      "pr", "--repo", input.repoRoot, "--base", "origin/master", "--head", SHA, "--unused-checks", "/artifacts/pr_unused_checks.json",
      "--policy-json", JSON.stringify({ gatedPaths: ["src/*"] }), "--json",
    ]);
    expect(result.scopeCheck?.unusedChecksPath).toBe("/artifacts/pr_unused_checks.json");
    expect(result.scopeCheck?.warnings).toContain("stale certificate for TBar::b (unit inputs changed: src/b.cpp); re-certify");
  });

  test("enforce: same-PR prerequisites are split warnings, never refusals", async () => {
    const { calls, runCommand, input } = setup(true);
    const scope = scopeRunner(ok(report({ same_pr_prerequisites: [{ class: "TBar", reason: "made ready earlier in this branch" }] })));
    const result = await publishHarnessDraftPr({ ...input, commitSha: SHA, ordering: ENFORCE }, { runCommand, editScopeRunner: scope.runner });
    expect(result.status).toBe("updated");
    expect(result.scopeCheck?.warnings).toEqual(["split suggested: TBar: made ready earlier in this branch"]);
    expect(pushes(calls)).toEqual([`git push --force-with-lease fork ${SHA}:refs/heads/${BRANCH}`]);
  });

  test("shadow: a rejected range publishes normally with the report and warnings recorded", async () => {
    const { calls, runCommand, input, store } = setup();
    const scope = scopeRunner(ok(report({
      verdict: "reject",
      hunks: [{ file: "src/a.cpp", line: 3, class: "TFoo", verdict: "not_ready", reason: "" }],
      warnings: ["foreign header include/b.h"],
      pr_size: { units: 30, files: 60, changed_lines: 4000, warnings: ["larger than 95% of human PRs"] },
      same_pr_prerequisites: ["TBar"],
    })));
    const result = await publishHarnessDraftPr({ ...input, commitSha: SHA, ordering: SHADOW }, { runCommand, editScopeRunner: scope.runner });

    expect(result.status).toBe("created");
    expect(result.scopeCheck).toMatchObject({ mode: "shadow", headSha: SHA, verdict: "reject", pr_size: { units: 30, files: 60, changed_lines: 4000 } });
    expect(result.scopeCheck?.problem).toContain("TFoo");
    expect(result.scopeCheck?.warnings).toEqual(["foreign header include/b.h", "larger than 95% of human PRs", "split suggested: TBar"]);
    expect(pushes(calls)).toEqual([`git push --force-with-lease fork ${SHA}:refs/heads/${BRANCH}`]);
    expect(github(calls).some((call) => call.startsWith("gh pr create"))).toBe(true);
    const artifact = latestDashboardArtifactPayload(store, { artifactType: HARNESS_DRAFT_PR_ARTIFACT_TYPE, artifactKey: HARNESS_DRAFT_PR_ARTIFACT_KEY, runId: "run-1" });
    expect((artifact.scopeCheck as { verdict: string }).verdict).toBe("reject");
  });

  test("shadow: a failing checker still publishes, with the error recorded", async () => {
    const { calls, runCommand, input } = setup(true);
    const scope = scopeRunner(fail("boom", 2));
    const result = await publishHarnessDraftPr({ ...input, commitSha: SHA, ordering: SHADOW }, { runCommand, editScopeRunner: scope.runner });
    expect(result.status).toBe("updated");
    expect(result.scopeCheck?.error).toContain("exited 2");
    expect(pushes(calls)).toHaveLength(1);
  });

  for (const ordering of [undefined, null, { mode: "off", gatedPaths: ["src/*"] } as EditScopeOrderingPolicy]) {
    test(`off (${ordering === undefined ? "absent" : ordering === null ? "null" : "mode off"}): today's commands, no scope check`, async () => {
      const { calls, runCommand, input } = setup();
      const scope = scopeRunner(ok(REJECT));
      const result = await publishHarnessDraftPr({ ...input, commitSha: "abc123", ordering }, { runCommand, editScopeRunner: scope.runner });

      expect(result.status).toBe("created");
      expect(result.commitSha).toBe("abc123");
      expect("scopeCheck" in result).toBe(false);
      expect(scope.calls).toEqual([]);
      expect(calls).toEqual([
        "git rev-parse --abbrev-ref HEAD",
        "git diff --quiet origin/master...HEAD",
        "git remote get-url origin",
        "git remote get-url fork",
        `git push --force-with-lease -u fork HEAD:${BRANCH}`,
        LOOKUP,
        expect.stringMatching(/^gh pr create /),
      ]);
    });
  }
});
