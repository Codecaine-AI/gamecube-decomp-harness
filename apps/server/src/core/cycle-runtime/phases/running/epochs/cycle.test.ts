import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRun } from "@server/core/cycle-runtime/run-state";
import { openState } from "@server/core/orchestrator-state";
import { sectionMeasuresFromReportJson } from "@server/core/validation/objdiff/section-measures.js";
import { commitEpochSnapshot } from "./cycle.js";

const cleanup: string[] = [];

afterEach(() => {
  for (const path of cleanup.splice(0).reverse()) rmSync(path, { recursive: true, force: true });
});

function git(repoRoot: string, args: string[]): string {
  const result = Bun.spawnSync(["git", "-C", repoRoot, ...args], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString() || result.stdout.toString());
  return result.stdout.toString().trim();
}

describe("commitEpochSnapshot", () => {
  test("removes tracked scratch from the snapshot while leaving scratch files on disk", async () => {
    const root = mkdtempSync(join(tmpdir(), "epoch-snapshot-"));
    cleanup.push(root);
    const repoRoot = join(root, "repo");
    const stateDir = join(root, "state");
    mkdirSync(join(repoRoot, "active_session", "integration_resolver", "job-x"), { recursive: true });
    mkdirSync(join(repoRoot, "src"), { recursive: true });
    git(repoRoot, ["init", "-b", "main"]);
    git(repoRoot, ["config", "user.email", "test@example.com"]);
    git(repoRoot, ["config", "user.name", "Epoch Test"]);
    writeFileSync(join(repoRoot, "active_session", "integration_resolver", "job-x", "unit_diff.json"), "{}\n");
    writeFileSync(join(repoRoot, "src", "a.c"), "int a = 1;\n");
    git(repoRoot, ["add", "."]);
    git(repoRoot, ["commit", "-m", "initial"]);

    writeFileSync(join(repoRoot, "src", "a.c"), "int a = 2;\n");
    writeFileSync(join(repoRoot, "active_session", "new.txt"), "scratch\n");
    mkdirSync(join(repoRoot, ".pi-sessions"), { recursive: true });
    writeFileSync(join(repoRoot, ".pi-sessions", "s.json"), "{}\n");

    const store = openState(stateDir);
    try {
      const run = createRun(
        store,
        "matched_code_percent",
        100,
        1,
        { gameId: "test", repoRoot },
        { baseRevision: git(repoRoot, ["rev-parse", "HEAD"]) },
      );
      const result = await commitEpochSnapshot({
        store,
        runId: run.id,
        epochId: "epoch-test",
        repoRoot,
        excludePaths: [],
        stateDirRelative: null,
        message: "epoch(test): snapshot",
        revalidateLease: () => {},
      });

      expect(result.committed).toBeTrue();
      const tree = git(repoRoot, ["ls-tree", "-r", "--name-only", "HEAD"]).split("\n");
      expect(tree).toContain("src/a.c");
      expect(tree.some((path) => path.startsWith("active_session/") || path.startsWith(".pi-sessions/"))).toBeFalse();
      expect(git(repoRoot, ["ls-files"])).not.toContain("active_session/");
      expect(existsSync(join(repoRoot, "active_session", "integration_resolver", "job-x", "unit_diff.json"))).toBeTrue();
      expect(existsSync(join(repoRoot, "active_session", "new.txt"))).toBeTrue();
      expect(existsSync(join(repoRoot, ".pi-sessions", "s.json"))).toBeTrue();
    } finally {
      store.db.close();
    }
  });
});

describe("sectionMeasuresFromReportJson", () => {
  test("aggregates section rows by size and counts exact rows", () => {
    expect(sectionMeasuresFromReportJson({
      units: [
        { sections: [{ name: ".data", size: 100, fuzzy_match_percent: 50 }, { name: ".text", size: 20, fuzzy_match_percent: 100 }] },
        { sections: [{ name: ".data", size: 300, fuzzy_match_percent: 100 }, { name: ".text", size: 0, fuzzy_match_percent: 90 }] },
      ],
    })).toEqual({
      ".data": { sizeBytes: 400, fuzzyMatchPercent: 87.5, exactRows: 1, totalRows: 2 },
      ".text": { sizeBytes: 20, fuzzyMatchPercent: 100, exactRows: 1, totalRows: 2 },
    });
  });

  test("returns an empty object for malformed input", () => {
    expect(sectionMeasuresFromReportJson(null)).toEqual({});
    expect(sectionMeasuresFromReportJson({ units: "invalid" })).toEqual({});
  });
});
