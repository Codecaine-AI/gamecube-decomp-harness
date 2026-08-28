import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRun } from "@server/core/cycle-runtime/run-state";
import { openState } from "@server/core/orchestrator-state";
import { sectionMeasuresFromReportJson } from "@server/core/validation/objdiff/section-measures.js";
import { boundaryDeferredFindings, commitEpochSnapshot, discardBoundaryBuildFixer, propagateBoundaryBuildFixer, runPreCommitAutofixStep, runReportBuildWithFixer } from "./cycle.js";

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

describe("precommit_autofix epoch step", () => {
  function setupRepo(): { repoRoot: string; stateDir: string; store: ReturnType<typeof openState>; runId: string } {
    const root = mkdtempSync(join(tmpdir(), "epoch-autofix-"));
    cleanup.push(root);
    const repoRoot = join(root, "repo");
    const stateDir = join(root, "state");
    mkdirSync(join(repoRoot, "src"), { recursive: true });
    git(repoRoot, ["init", "-b", "main"]);
    git(repoRoot, ["config", "user.email", "test@example.com"]);
    git(repoRoot, ["config", "user.name", "Epoch Test"]);
    writeFileSync(join(repoRoot, "src", "a.c"), "int a=1;\n");
    git(repoRoot, ["add", "."]);
    git(repoRoot, ["commit", "-m", "initial"]);
    const store = openState(stateDir);
    const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "test", repoRoot }, { baseRevision: git(repoRoot, ["rev-parse", "HEAD"]) });
    return { repoRoot, stateDir, store, runId: run.id };
  }

  test("runs before snapshot and includes reformatted files in the commit", async () => {
    const value = setupRepo();
    try {
      writeFileSync(join(value.repoRoot, "src", "a.c"), "int a=2;\n");
      const order: string[] = [];
      await runPreCommitAutofixStep({
        ...value, label: "epoch-1", enabled: true,
        runPreCommitAutofix: async () => {
          order.push("precommit_autofix");
          writeFileSync(join(value.repoRoot, "src", "a.c"), "int a = 2;\n");
          return { status: "finished", reformattedFiles: ["src/a.c"], warnings: [], steps: [] };
        },
      });
      order.push("snapshot_commit");
      await commitEpochSnapshot({
        store: value.store, runId: value.runId, epochId: "epoch-1", repoRoot: value.repoRoot,
        excludePaths: [], stateDirRelative: null, message: "epoch test", revalidateLease: () => {},
      });
      expect(order).toEqual(["precommit_autofix", "snapshot_commit"]);
      expect(git(value.repoRoot, ["show", "HEAD:src/a.c"])).toBe("int a = 2;");
      const payloads = value.store.db.query("SELECT payload_json FROM events WHERE run_id = ? AND event_type = 'epoch_checkpoint_progress' ORDER BY created_at, id").all(value.runId) as Array<{ payload_json: string }>;
      expect(payloads.map((row) => JSON.parse(row.payload_json))).toEqual(expect.arrayContaining([
        expect.objectContaining({ phase: "precommit_autofix", status: "started" }),
        expect.objectContaining({ phase: "precommit_autofix", status: "finished", reformatted_file_count: 1 }),
      ]));
    } finally { value.store.db.close(); }
  });

  test("flag off skips without calling pre-commit", async () => {
    const value = setupRepo();
    try {
      let calls = 0;
      await runPreCommitAutofixStep({ ...value, label: null, enabled: false, runPreCommitAutofix: async () => { calls += 1; throw new Error("unexpected"); } });
      expect(calls).toBe(0);
      const row = value.store.db.query("SELECT payload_json FROM events WHERE run_id = ? AND event_type = 'epoch_checkpoint_progress'").get(value.runId) as { payload_json: string };
      expect(JSON.parse(row.payload_json)).toMatchObject({ phase: "precommit_autofix", status: "skipped", reformatted_file_count: 0 });
    } finally { value.store.db.close(); }
  });

  test("pre-commit unavailable emits a skipped event", async () => {
    const value = setupRepo();
    const errorLog = console.error;
    console.error = () => {};
    try {
      await runPreCommitAutofixStep({
        ...value, label: null, enabled: true,
        runPreCommitAutofix: async () => ({ status: "skipped", reformattedFiles: [], warnings: ["pre-commit is unavailable"], steps: [] }),
      });
      const rows = value.store.db.query("SELECT payload_json FROM events WHERE run_id = ? AND event_type = 'epoch_checkpoint_progress' ORDER BY created_at, id").all(value.runId) as Array<{ payload_json: string }>;
      expect(rows.map((row) => JSON.parse(row.payload_json))).toContainEqual(expect.objectContaining({ phase: "precommit_autofix", status: "skipped", message: "pre-commit is unavailable" }));
    } finally { console.error = errorLog; value.store.db.close(); }
  });
});

describe("runReportBuildWithFixer", () => {
  test("runs one fixer attempt and retries the report build once", async () => {
    const failure = new Error("report build failed: duplicate symbol");
    let reportCalls = 0;
    let fixerCalls = 0;

    const result = await runReportBuildWithFixer({
      enabled: true,
      runReport: async () => {
        reportCalls += 1;
        if (reportCalls === 1) throw failure;
        return { status: "green" as const };
      },
      runFixer: async (receivedFailure) => {
        fixerCalls += 1;
        expect(receivedFailure).toBe(failure);
        return { exitCode: 0, timedOut: false, output: "fixed duplicate symbol" };
      },
    });

    expect(result).toEqual({ status: "green" });
    expect(reportCalls).toBe(2);
    expect(fixerCalls).toBe(1);
  });

  test("preserves the original failure without a fixer or retry when disabled", async () => {
    const failure = new Error("report build failed: signature mismatch");
    let reportCalls = 0;
    let fixerCalls = 0;
    let caught: unknown;

    try {
      await runReportBuildWithFixer({
        enabled: false,
        runReport: async () => {
          reportCalls += 1;
          throw failure;
        },
        runFixer: async () => {
          fixerCalls += 1;
          return { exitCode: 0, timedOut: false, output: "unused" };
        },
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBe(failure);
    expect(reportCalls).toBe(1);
    expect(fixerCalls).toBe(0);
  });

  test("failed retry discards fixer edits without propagating them", async () => {
    const root = mkdtempSync(join(tmpdir(), "epoch-build-fixer-failure-"));
    cleanup.push(root);
    mkdirSync(join(root, "src"), { recursive: true });
    git(root, ["init", "-b", "main"]);
    git(root, ["config", "user.email", "test@example.com"]);
    git(root, ["config", "user.name", "Epoch Test"]);
    writeFileSync(join(root, "src", "a.c"), "int value = 1;\n");
    git(root, ["add", "."]);
    git(root, ["commit", "-m", "initial"]);
    let reportCalls = 0;
    let propagated = 0;
    await expect(runReportBuildWithFixer({
      enabled: true,
      runReport: async () => { reportCalls += 1; throw new Error("still broken"); },
      runFixer: async () => {
        writeFileSync(join(root, "src", "a.c"), "int value = 2;\n");
        return { exitCode: 0, timedOut: false, output: "edited source" };
      },
      onFixerRetrySucceeded: async () => { propagated += 1; },
      onFixerRetryFailed: async () => discardBoundaryBuildFixer(root, () => {}),
    })).rejects.toThrow("still broken");
    expect(reportCalls).toBe(2);
    expect(propagated).toBe(0);
    expect(readFileSync(join(root, "src", "a.c"), "utf8")).toBe("int value = 1;\n");
    expect(git(root, ["status", "--porcelain"])).toBe("");
  });
});

describe("propagateBoundaryBuildFixer", () => {
  function setup(): {
    root: string;
    repoRoot: string;
    worktreeDir: string;
    artifactDir: string;
    store: ReturnType<typeof openState>;
    runId: string;
  } {
    const root = mkdtempSync(join(tmpdir(), "epoch-build-fixer-"));
    cleanup.push(root);
    const repoRoot = join(root, "repo");
    const worktreeDir = join(root, "epoch");
    const stateDir = join(root, "state");
    const artifactDir = join(stateDir, "epochs", "test");
    mkdirSync(join(repoRoot, "src"), { recursive: true });
    git(repoRoot, ["init", "-b", "main"]);
    git(repoRoot, ["config", "user.email", "snapshot@example.com"]);
    git(repoRoot, ["config", "user.name", "Snapshot Author"]);
    writeFileSync(join(repoRoot, "src", "a.c"), "int value = 1;\n");
    git(repoRoot, ["add", "."]);
    git(repoRoot, ["commit", "-m", "initial"]);
    git(repoRoot, ["worktree", "add", "--detach", worktreeDir, "HEAD"]);
    const store = openState(stateDir);
    const run = createRun(store, "matched_code_percent", 100, 1, { gameId: "test", repoRoot }, { baseRevision: git(repoRoot, ["rev-parse", "HEAD"]) });
    return { root, repoRoot, worktreeDir, artifactDir, store, runId: run.id };
  }

  test("applies and commits the tracked fixer diff, updates HEAD, and re-syncs the epoch worktree", async () => {
    const value = setup();
    try {
      const before = git(value.repoRoot, ["rev-parse", "HEAD"]);
      writeFileSync(join(value.worktreeDir, "src", "a.c"), "int value = 2;\n");
      const result = await propagateBoundaryBuildFixer({
        ...value, label: "epoch-1", revalidateLease: () => {},
      });
      expect(result.commitSha).not.toBe(before);
      expect(result.commitSha).toBe(git(value.repoRoot, ["rev-parse", "HEAD"]));
      expect(git(value.repoRoot, ["show", "HEAD:src/a.c"])).toBe("int value = 2;");
      expect(git(value.repoRoot, ["show", "-s", "--format=%s", "HEAD"])).toBe("boundary build-fixer: src/a.c");
      expect(git(value.repoRoot, ["show", "-s", "--format=%an <%ae>", "HEAD"])).toBe("Snapshot Author <snapshot@example.com>");
      expect(git(value.worktreeDir, ["rev-parse", "HEAD"])).toBe(result.commitSha);
      const events = value.store.db.query("SELECT payload_json FROM events WHERE run_id = ? AND event_type = 'epoch_checkpoint_progress'").all(value.runId) as Array<{ payload_json: string }>;
      expect(events.map((row) => JSON.parse(row.payload_json))).toContainEqual(expect.objectContaining({
        phase: "report_build_fixer", status: "propagated", files: ["src/a.c"], commit_sha: result.commitSha,
      }));
    } finally { value.store.db.close(); }
  });

  test("apply conflict fails the boundary and keeps the patch artifact", async () => {
    const value = setup();
    try {
      writeFileSync(join(value.repoRoot, "src", "a.c"), "int value = 3;\n");
      git(value.repoRoot, ["add", "src/a.c"]);
      git(value.repoRoot, ["commit", "-m", "conflicting cycle edit"]);
      const conflictHead = git(value.repoRoot, ["rev-parse", "HEAD"]);
      writeFileSync(join(value.worktreeDir, "src", "a.c"), "int value = 2;\n");

      await expect(propagateBoundaryBuildFixer({
        ...value, label: "epoch-1", revalidateLease: () => {},
      })).rejects.toThrow("does not apply cleanly");
      expect(git(value.repoRoot, ["rev-parse", "HEAD"])).toBe(conflictHead);
      const patchPath = join(value.artifactDir, "boundary-build-fixer.patch");
      expect(readFileSync(patchPath, "utf8")).toContain("diff --git a/src/a.c b/src/a.c");
      const events = value.store.db.query("SELECT payload_json FROM events WHERE run_id = ? AND event_type = 'epoch_checkpoint_progress'").all(value.runId) as Array<{ payload_json: string }>;
      expect(events.map((row) => JSON.parse(row.payload_json))).toContainEqual(expect.objectContaining({
        phase: "report_build_fixer", status: "failed", files: ["src/a.c"], artifact_path: patchPath,
      }));
    } finally { value.store.db.close(); }
  });
});

describe("boundaryDeferredFindings", () => {
  test("turns regressions and QA findings into next-epoch ledger notes without repair admission", () => {
    const findings = boundaryDeferredFindings({
      paused: true,
      reasons: ["regression latch"],
      summary: { brokenMatches: 1, fuzzyRegressions: 0, metricRegressions: 0, regressedFunctions: 1, regressedSections: 0 },
      repairCandidates: [{
        unit: "src/unit.c", sourcePath: "src/unit.c", symbol: "fn", size: 32, fuzzy: 95, priority: 400,
        reason: "epoch regression repair: 100.00% -> 95.00% (-2 bytes)",
      }],
    }, {
      exitCode: 1, status: "failed", errors: 1, warnings: 0,
      findings: [{ rule_id: "mechanical", severity: "error", file: "src/unit.c", line: 12, excerpt: "bad", message: "finding", standard_id: null }],
    });

    expect(findings.map((finding) => finding.reason)).toEqual(["boundary_regression_deferred", "boundary_qa_deferred"]);
    expect(findings[0]).toMatchObject({ unit: "src/unit.c", symbol: "fn", sourcePath: "src/unit.c" });
    expect(findings[1]).toMatchObject({ sourcePath: "src/unit.c" });
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
