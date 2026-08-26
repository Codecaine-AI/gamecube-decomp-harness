import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCycle } from "@server/core/cycle";
import { openState } from "@server/core/orchestrator-state";
import { addSavePoint, ensureCampaign, listSavePoints, type SavePointTrigger } from "../state/index.js";
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
  test("stores the three epoch-flow marker kinds as typed triggers", () => {
    const stateDir = mkdtempSync(join(tmpdir(), "typed-save-point-state-"));
    cleanup.push(stateDir);
    const store = openState(stateDir);
    try {
      const campaign = ensureCampaign(store, { gameId: "melee", baseRef: "origin/master" });
      const triggers: SavePointTrigger[] = ["baseline", "epoch_finish", "pr_sync"];
      for (const triggerKind of triggers) {
        addSavePoint(store, { campaignId: campaign.id, triggerKind });
      }
      expect(listSavePoints(store, 3).map((savePoint) => savePoint.triggerKind).sort()).toEqual([...triggers].sort());
    } finally {
      store.db.close();
    }
  });

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
      createCycle(store.db, {
        actor: "operator",
        id: "cycle:cycle-1",
        gameId: "melee",
        cycleUuid: "cycle-1",
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
          gameId: "melee",
          dryRunAgents: true,
          provider: "test",
          model: "test",
          thinkingLevel: "low",
        },
        new Map([
          ["--trigger", "manual"],
          ["--label", "manual anchor"],
          ["--base-ref", "HEAD"],
          ["--cycle-uuid", "cycle-1"],
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
