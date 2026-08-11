import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createHandoffRuntime, type HandoffRuntimeDeps } from "./runtime.js";
import type { RegressionReport } from "@server/core/validation/objdiff/report.js";

const cleanupPaths: string[] = [];

function tempDir(prefix: string): string {
  const path = mkdtempSync(join(tmpdir(), prefix));
  cleanupPaths.push(path);
  return path;
}

function cleanReport(): RegressionReport {
  return {
    regressions: [],
    brokenMatches: [],
    fuzzyRegressions: [],
    newMatches: [{ name: "gmMatch" }],
    summary: { matchedCodeBytesDelta: 16 },
  } as unknown as RegressionReport;
}

afterEach(() => {
  for (const path of cleanupPaths.reverse()) rmSync(path, { recursive: true, force: true });
  cleanupPaths.length = 0;
});

function runtimeFixture(
  supportFiles?: string[],
  peers: Array<Record<string, unknown>> = [],
  hasLocalSource = true,
) {
  const repoRoot = process.cwd();
  const stateDir = tempDir("pr-runtime-state-");
  const baselineWorktree = tempDir("pr-runtime-baseline-");
  mkdirSync(join(baselineWorktree, "build/GALE01"), { recursive: true });
  writeFileSync(join(baselineWorktree, "build/GALE01/baseline.json"), "{}\n");
  mkdirSync(join(stateDir, "pr_handoff"), { recursive: true });
  const shipPatchPath = join(stateDir, "pr_handoff/ship_set.patch");
  writeFileSync(shipPatchPath, "patch\n");
  writeFileSync(join(stateDir, "pr_handoff/ship_status.json"), JSON.stringify({ status: "pr_ready", baseSha: "base-sha", patchPath: shipPatchPath }));
  writeFileSync(join(stateDir, "pr_handoff/baseline_status.json"), JSON.stringify({ baseSha: "base-sha", worktreeDir: baselineWorktree }));
  const files = ["src/melee/gm/gmtest.c"];
  const branch = "pr-split/gm";
  const record = {
    branch,
    sliceId: "gm",
    displayName: "GM",
    title: "Melee decomp: GM",
    runId: "run-1",
    baseSha: "base-sha",
    files,
    ...(supportFiles?.length ? { supportFiles } : {}),
    status: "planned",
    local: { status: "local_only" },
  };
  const records = [record, ...peers];
  const calls: {
    ready?: Record<string, unknown>;
    verify?: Record<string, unknown>;
    mergeArgs?: Record<string, unknown>;
    events: Array<Record<string, unknown>>;
    merge: number;
    order: string[];
    publish: number;
  } = { events: [], merge: 0, order: [], publish: 0 };

  const deps = {
    appendLog: () => {},
    hasActiveProcess: () => ({ active: false }),
    operationState: {
      failOperationStep: () => {},
      operationNextHint: () => {},
      operationStep: () => {},
      operationStepDetail: () => {},
      withOperation: async (_name: string, _label: string, _steps: string[], fn: () => Promise<unknown>) => fn(),
    },
    outputTail: (value: string) => value,
    prRecords: {
      buildPrRecordsView: () => ({ records }),
      normalizePrRecord: (value: Record<string, unknown>) => value,
      normalizePrRecordsPayload: (value: Record<string, unknown>) => value,
      prHandoffArtifactPath: (_stateDir: string, savedPath: string) => savedPath,
      prRecordContext: () => ({ runId: "run-1", baseSha: "base-sha" }),
      prRecordMatchesRun: (candidate: Record<string, unknown>, runId: string) => candidate.runId === runId,
      readPrRecords: () => ({ records }),
      updatePrRecord: () => record,
      writePrRecords: (_stateDir: string, value: Record<string, unknown>) => value,
    },
    prSync: {
      isLocalBranchPrRecord: () => true,
      syncPrRecords: async () => ({ records: [{ ...record, prNumber: 123, url: "https://example.test/pr/123" }] }),
    },
    prWorktrees: {
      assertSliceVerificationClean: () => {},
      ensureOpenPrBaseline: async () => ({ baseSha: "base-sha", worktreeDir: baselineWorktree }),
      prepareLocalPrWorkspace: async (params: Record<string, unknown>) => {
        calls.order.push("materialize");
        return { ...(params.record as Record<string, unknown>), local: { status: "ready", commitSha: "candidate-sha" } };
      },
      publishPatchToFork: async () => { calls.publish += 1; },
      readyLocalPrSource: async (params: Record<string, unknown>) => {
        calls.ready = params;
        return hasLocalSource
          ? { commitSha: "head-sha", patchPath: "/tmp/local.patch", source: "local_branch", worktreePath: "" }
          : null;
      },
      rebuildProductionBaseline: async () => ({}),
      remoteOwner: () => "fork-owner",
      sliceValidationSummary: () => ({ status: "passed", issuesCheck: "clean", newMatches: 1 }),
      verifyPrSliceInBaseline: async (params: Record<string, unknown>) => {
        calls.order.push("isolate");
        calls.verify = params;
        return { issues: { status: "clean" as const, output: "", files: [] }, report: cleanReport() };
      },
      verifySupportMergeOrder: async (params: Record<string, unknown>) => {
        calls.order.push("merge-order");
        calls.merge += 1;
        calls.mergeArgs = params;
        return {};
      },
      verifyShipSet: async () => ({}),
    },
    processControl: { drainManaged: async () => ({}) },
    projectToSummary: () => ({}),
    resolveDashboardProject: () => ({
      repoRoot,
      stateDir,
      project: { projectId: "melee", baseRef: "origin/master" },
    }),
    runCli: async (command: string[]) => command[0] === "gh"
      ? { exitCode: 0, stdout: "https://example.test/pr/123\n", stderr: "" }
      : { exitCode: 0, stdout: "", stderr: "" },
    runGit: async () => ({ exitCode: 0, stdout: "head-sha\n", stderr: "" }),
    savePoints: {
      boundarySavePoint: async () => null,
      createSavePoint: async () => ({}),
      parseCliJsonOutput: () => ({}),
    },
    serverJobPath: "/server-job.ts",
    submitWorkflowEvent: async (_paths: unknown, event: Record<string, unknown>) => {
      calls.events.push(event);
      return null;
    },
    syncMergedPrIntakeForPrepare: async () => ({}) as never,
  } as unknown as HandoffRuntimeDeps;

  return { branch, calls, runtime: createHandoffRuntime(deps) };
}

describe("openPrForSlice support manifests", () => {
  test("passes declared support files through local source capture and isolation", async () => {
    const supportFiles = ["include/melee/gr/ground.h"];
    const { branch, calls, runtime } = runtimeFixture(supportFiles);

    await runtime.openPrForSlice({ prBranch: branch, postLedgerComments: false });

    expect(calls.ready?.supportFiles).toEqual(supportFiles);
    expect(calls.verify?.supportFiles).toEqual(supportFiles);
    expect(calls.merge).toBe(0);
    expect(calls.events.map((event) => (event.metadata as Record<string, unknown>).supportFiles)).toEqual([
      supportFiles,
      supportFiles,
    ]);
  });

  test("keeps the legacy call and event shape when no support files are declared", async () => {
    const { branch, calls, runtime } = runtimeFixture();

    await runtime.openPrForSlice({ prBranch: branch, postLedgerComments: false });

    expect("supportFiles" in calls.ready!).toBe(false);
    expect("supportFiles" in calls.verify!).toBe(false);
    expect(calls.merge).toBe(0);
    for (const event of calls.events) {
      expect("supportFiles" in (event.metadata as Record<string, unknown>)).toBe(false);
    }
  });

  test("materializes the current branch before merge-order checking a prepared overlapping peer", async () => {
    const supportFiles = ["include/melee/gr/ground.h"];
    const peer = {
      branch: "pr-split/gr",
      sliceId: "gr",
      runId: "run-1",
      baseSha: "base-sha",
      files: supportFiles,
      status: "planned",
      local: { status: "ready", commitSha: "peer-sha" },
    };
    const { branch, calls, runtime } = runtimeFixture(supportFiles, [peer]);

    await runtime.prepareLocalPr({ prBranch: branch, runId: "run-1" });

    expect(calls.order).toEqual(["isolate", "materialize", "merge-order"]);
    expect(calls.mergeArgs).toMatchObject({
      branch,
      sliceId: "gm",
      supportFiles,
      others: [{ branch: "pr-split/gr", sliceId: "gr", files: supportFiles, supportFiles: [] }],
    });
  });

  test("blocks direct ship-set opening when an already-published peer overlaps support", async () => {
    const supportFiles = ["include/melee/gr/ground.h"];
    const publishedPeer = {
      branch: "pr-split/gr",
      sliceId: "gr",
      runId: "run-1",
      baseSha: "base-sha",
      files: supportFiles,
      status: "draft",
      prNumber: 321,
      local: { status: "not_prepared" },
    };
    const { branch, calls, runtime } = runtimeFixture(supportFiles, [publishedPeer], false);

    await expect(
      runtime.openPrForSlice({ prBranch: branch, postLedgerComments: false }),
    ).rejects.toThrow("requires a materialized local branch before opening because a prepared sibling overlaps its support files");
    expect(calls.verify).toBeUndefined();
    expect(calls.merge).toBe(0);
    expect(calls.publish).toBe(0);
  });
});
