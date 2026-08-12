import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProjectSession } from "@server/core/project-session";
import { openState } from "@server/core/orchestrator-state";
import { listSavePoints } from "../state/index.js";
import { savePoint } from "./save-point.js";

const cleanup: string[] = [];

function git(repoRoot: string, args: string[]): string {
  const result = Bun.spawnSync(["git", "-C", repoRoot, ...args], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr));
  return new TextDecoder().decode(result.stdout).trim();
}

afterEach(() => {
  for (const path of cleanup.splice(0).reverse()) rmSync(path, { recursive: true, force: true });
});

describe("save-point evidence capture", () => {
  test("anchors the current HEAD without staging or committing dirty work", async () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "save-point-repo-"));
    const stateDir = mkdtempSync(join(tmpdir(), "save-point-state-"));
    cleanup.push(repoRoot, stateDir);
    git(repoRoot, ["init", "-q"]);
    writeFileSync(join(repoRoot, "tracked.txt"), "clean\n");
    git(repoRoot, ["add", "tracked.txt"]);
    git(repoRoot, ["-c", "user.name=Save Point Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "fixture"]);
    const headBefore = git(repoRoot, ["rev-parse", "HEAD"]);
    writeFileSync(join(repoRoot, "tracked.txt"), "dirty\n");

    const store = openState(stateDir);
    try {
      createProjectSession(store.db, {
        id: "project-session:session-1",
        projectId: "melee",
        sessionUuid: "session-1",
        baseSha: headBefore,
      });
    } finally {
      store.db.close();
    }

    const log = spyOn(console, "log").mockImplementation(() => undefined);
    try {
      await savePoint(
        {
          repoRoot,
          stateDir,
          projectId: "melee",
          dryRunAgents: true,
          provider: "test",
          model: "test",
          thinkingLevel: "low",
        },
        new Map([
          ["--trigger", "manual"],
          ["--label", "manual anchor"],
          ["--base-ref", "HEAD"],
        ]),
      );
    } finally {
      log.mockRestore();
    }

    expect(git(repoRoot, ["rev-parse", "HEAD"])).toBe(headBefore);
    expect(git(repoRoot, ["status", "--short"])).toContain("tracked.txt");
    const savedStore = openState(stateDir);
    try {
      expect(listSavePoints(savedStore, 1)[0]).toMatchObject({
        commitSha: headBefore,
        committed: false,
        worktreeDirty: true,
        payload: {
          commit_reason: "chose_not_to_commit",
          commit_warning: null,
          dirty_paths: ["tracked.txt"],
        },
      });
    } finally {
      savedStore.db.close();
    }
  });
});
