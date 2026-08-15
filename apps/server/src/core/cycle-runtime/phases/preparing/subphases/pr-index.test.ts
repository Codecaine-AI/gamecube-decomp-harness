import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { PreparingRuntimeDeps, PreparingRuntimeGameContext } from "../runtime-shared.js";
import { pendingPrsFromDebt, runPrIndexForPrepare, scanPrIndexDebtForPrepare } from "./pr-index.js";

let tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "prepare-pr-index-"));
  tempDirs.push(dir);
  return dir;
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value)}\n`);
}

function writeRawSlice(dataRoot: string, number: number, state = "MERGED"): void {
  const rawRoot = resolve(dataRoot, "prs", `pr-${number}`, "raw");
  mkdirSync(rawRoot, { recursive: true });
  writeJson(resolve(rawRoot, "pr.json"), { number, state, merged_at: state === "MERGED" ? "2026-06-27T00:00:00Z" : null });
  writeJson(resolve(rawRoot, "issue_comments.json"), []);
  writeJson(resolve(rawRoot, "review_comments.json"), []);
  writeJson(resolve(rawRoot, "reviews.json"), []);
  writeFileSync(resolve(rawRoot, "diff.diff"), "diff --git a/file.c b/file.c\n");
}

function writePostmortem(dataRoot: string, number: number, agentStatus = "agent_completed"): void {
  writeJson(resolve(dataRoot, "prs", `pr-${number}`, "postmortem", "postmortem.json"), {
    schema_version: "melee_pr_postmortem_v1",
    agent_status: agentStatus,
  });
}

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { force: true, recursive: true });
  tempDirs = [];
});

describe("prepare PR index debt scan", () => {
  test("rejects direct preparation intake before commands or events run", async () => {
    const root = tempDir();
    let commands = 0;
    let events = 0;
    const deps = {
      runCli: async () => {
        commands += 1;
        return { exitCode: 0, stdout: "", stderr: "" };
      },
      submitWorkflowEvent: async () => {
        events += 1;
        return null;
      },
    } as unknown as PreparingRuntimeDeps;
    const paths = {
      repoRoot: resolve(root, "repo"),
      stateDir: resolve(root, "state"),
    } as PreparingRuntimeGameContext;

    await expect(runPrIndexForPrepare(deps, paths, [101], false, "cycle-1")).rejects.toThrow(
      "operator sync.start workflow",
    );
    expect(commands).toBe(0);
    expect(events).toBe(0);
  });

  test("counts agent postmortem debt separately from git-discovered PRs", () => {
    const root = tempDir();
    const sourceRoot = resolve(root, "past_prs");
    const dataRoot = resolve(sourceRoot, "data");
    writeRawSlice(dataRoot, 101);
    writePostmortem(dataRoot, 101);
    writeRawSlice(dataRoot, 102);
    writeRawSlice(dataRoot, 103, "CLOSED");
    writePostmortem(dataRoot, 103, "scaffolded");

    const deps = {
      sourceRoot: () => sourceRoot,
    } as unknown as PreparingRuntimeDeps;
    const paths = {
      game: { id: "melee" },
    } as unknown as PreparingRuntimeGameContext;

    const debt = scanPrIndexDebtForPrepare(deps, paths, [104]);

    expect(debt.status).toBe("available");
    expect(debt.knownPrs).toBe(4);
    expect(debt.knownMergedPrs).toBe(3);
    expect(debt.agentIndexedPrs).toBe(1);
    expect(debt.agentIndexedMergedPrs).toBe(1);
    expect(debt.pendingAgentPrs).toBe(3);
    expect(debt.pendingMergedAgentPrs).toBe(2);
    expect(debt.missingRawPrs).toBe(1);
    expect(debt.missingPostmortemPrs).toBe(2);
    expect(debt.stalePostmortemPrs).toBe(1);
    expect(debt.pendingPrs).toEqual([104, 103, 102]);
    expect(debt.pendingMergedPrs).toEqual([104, 102]);
    expect(debt.missingRawPrsList).toEqual([104]);
    expect(debt.missingPostmortemPrsList).toEqual([104, 102]);
    expect(debt.stalePostmortemPrsList).toEqual([103]);
    expect(debt.pendingMergedSamplePrs).toEqual([104, 102]);
    expect(pendingPrsFromDebt(debt, [105])).toEqual([105, 104, 103, 102]);
  });
});
