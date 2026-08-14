import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GlobalArgs } from "@server/core/project-registry/runtime-options.js";
import { initializeProjectState, requestDispatch } from "@server/core/project-state";
import { createProjectSession } from "@server/core/project-session";
import { recordSavePointAnchor } from "@server/core/project-session/timeline.js";
import { openPrCampaign } from "@server/core/session-runtime/phases/pr/campaign";
import { addSavePoint, ensureCampaign } from "@server/core/session-runtime/phases/pr/state";
import {
  activeClaimsForRun,
  admitEpochTargets,
  claimNextEpochTarget as claimNextEpochTargetRaw,
  createRun,
  openState,
  recordWorkerCheckpoint,
  schedulerEpochProgress,
  startSchedulerEpoch,
  type StateStore,
} from "@server/core/session-runtime/run-state";
import { recoverActiveClaims } from "./recover-claims.js";

const tempDirs: string[] = [];
const TEST_WORKER_TIMEOUT_SECONDS = 1800;

function tempState(): { dir: string; store: StateStore } {
  const dir = mkdtempSync(join(tmpdir(), "recover-claims-state-"));
  tempDirs.push(dir);
  return { dir, store: openState(dir) };
}

function globalsFor(dir: string): GlobalArgs {
  return {
    repoRoot: dir,
    stateDir: dir,
    dryRunAgents: true,
    provider: "test",
    model: "test",
    thinkingLevel: "low",
  };
}

function claimNextEpochTarget(params: Omit<Parameters<typeof claimNextEpochTargetRaw>[0], "ttlSeconds"> & { ttlSeconds?: number }) {
  return claimNextEpochTargetRaw({ ...params, ttlSeconds: params.ttlSeconds ?? TEST_WORKER_TIMEOUT_SECONDS });
}

function git(repo: string, args: string[]): string {
  const result = Bun.spawnSync(["git", "-C", repo, ...args], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString() || result.stdout.toString());
  return result.stdout.toString().trim();
}

function setupRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), "recover-claims-repo-"));
  tempDirs.push(repo);
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "src/a.c"), "int value = 0;\n");
  git(repo, ["init"]);
  git(repo, ["config", "user.email", "test@example.com"]);
  git(repo, ["config", "user.name", "Test User"]);
  git(repo, ["add", "src/a.c"]);
  git(repo, ["commit", "-m", "baseline"]);
  return repo;
}

function writePatch(dir: string): string {
  const patchPath = join(dir, "worker.patch");
  writeFileSync(
    patchPath,
    [
      "diff --git a/src/a.c b/src/a.c",
      "--- a/src/a.c",
      "+++ b/src/a.c",
      "@@ -1 +1 @@",
      "-int value = 0;",
      "+int value = 1;",
      "",
    ].join("\n"),
  );
  return patchPath;
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

describe("recoverActiveClaims", () => {
  test("closes a failed worker process claim and re-admits targets without checkpoints", async () => {
    const { dir, store } = tempState();
    try {
      const run = createRun(store, "matched_code_percent", 100, 1, { projectId: "test" }, { baseRevision: "base-test" });
      const epoch = startSchedulerEpoch(store, run.id, {
        size: { mode: "fixed", value: 1 },
        workerPoolSize: 1,
        candidateWindow: 1,
      });
      admitEpochTargets(store, {
        epochId: epoch.id,
        runId: run.id,
        candidates: [{ unit: "unit", symbol: "fn", sourcePath: "src/a.c", size: 64, fuzzy: 99, priority: 1, reason: "test" }],
        size: { mode: "fixed", value: 1 },
        workerPoolSize: 1,
      });
      const claim = claimNextEpochTarget({ store, runId: run.id, workerId: "worker-1", baseRev: "base" });
      expect(claim).not.toBeNull();

      const result = await recoverActiveClaims({
        globals: globalsFor(dir),
        store,
        runId: run.id,
        repoRoot: dir,
        force: true,
        workerIdFilter: "worker-1",
        reason: "unit test failed process",
        processIntegrations: false,
      });

      expect(result.recoveredClaims).toBe(1);
      expect(activeClaimsForRun(store, run.id)).toHaveLength(0);
      expect(schedulerEpochProgress(store, epoch.id)).toMatchObject({ available: 1, claimed: 0, finished: 0, remaining: 1 });
      const worker = store.db.query("SELECT lifecycle_status FROM worker_state WHERE id = ?").get(claim?.workerStateId ?? "") as
        | Record<string, unknown>
        | undefined;
      expect(worker?.lifecycle_status).toBe("error");
    } finally {
      store.db.close();
    }
  });

  test("leaves checkpoint integration queued when another workflow owns dispatch", async () => {
    const { dir, store } = tempState();
    try {
      const repo = setupRepo();
      const patchPath = writePatch(dir);
      const run = createRun(store, "matched_code_percent", 100, 1, { projectId: "test" }, { baseRevision: "base-test" });
      const epoch = startSchedulerEpoch(store, run.id, {
        size: { mode: "fixed", value: 1 },
        workerPoolSize: 1,
        candidateWindow: 1,
      });
      admitEpochTargets(store, {
        epochId: epoch.id,
        runId: run.id,
        candidates: [{ unit: "unit", symbol: "fn", sourcePath: "src/a.c", size: 64, fuzzy: 99, priority: 1, reason: "test" }],
        size: { mode: "fixed", value: 1 },
        workerPoolSize: 1,
      });
      const claim = claimNextEpochTarget({ store, runId: run.id, workerId: "worker-1", baseRev: "base" });
      if (!claim) throw new Error("expected worker claim");
      recordWorkerCheckpoint(store, {
        workerStateId: claim.workerStateId,
        runId: run.id,
        epochId: claim.epochId,
        epochTargetId: claim.epochTargetId,
        targetClaimId: claim.claimId,
        attemptIndex: 0,
        oldScore: 99,
        newScore: 100,
        exactMatch: true,
        hardGatesPassed: true,
        validationStatus: "passed",
        patchPath,
        diffPath: patchPath,
        writeSet: ["src/a.c"],
      });
      createProjectSession(store.db, {
        actor: "operator",
        baseSha: "base-test",
        id: "project-session:session-pr",
        projectId: "test",
        sessionUuid: "session-pr",
      });
      const legacyCampaign = ensureCampaign(store, { projectId: "test" });
      const savePoint = addSavePoint(store, {
        campaignId: legacyCampaign.id,
        triggerKind: "manual",
        label: "stable PR handoff",
        commitSha: "base-test",
        committed: true,
      });
      recordSavePointAnchor(store, {
        actor: "operator",
        commandId: "command-anchor-pr",
        correlationId: "session-pr",
        commitSha: "base-test",
        projectId: "test",
        savePointId: savePoint.id,
        triggerKind: "manual",
      });
      const campaign = openPrCampaign(store, {
        actor: "operator",
        campaignId: "campaign-recover-claims",
        commandId: "command-open-pr",
        correlationId: "campaign-recover-claims",
        namedSavePointId: savePoint.id,
        projectId: "test",
        series: [{ batchIndex: 0, branch: "codex/test-pr", seriesId: "series-recover-claims", targetUnits: ["src/a.c"] }],
        sessionUuid: "session-pr",
      });
      initializeProjectState(store, { projectId: "test", traceId: "trace-test" });
      const prDispatch = requestDispatch(store, {
        actor: "operator",
        commandId: "command-pr-1",
        correlationId: campaign.campaign_id,
        kind: "pr",
        projectId: "test",
        reason: "PR owns checkout",
        workflowId: campaign.campaign_id,
      });
      if (prDispatch.queued) throw new Error("expected PR dispatch lease");

      const result = await recoverActiveClaims({
        globals: globalsFor(dir),
        store,
        runId: run.id,
        repoRoot: repo,
        force: true,
        reason: "recover failed run while PR is active",
      });

      const itemId = String(result.recovered[0]?.workerOutputIntegrationItemId ?? "");
      expect(itemId).not.toBe("");
      expect(result.workerOutputIntegration).toEqual({ queued: [itemId], processed: [] });
      expect(result.blockers).toEqual([
        expect.objectContaining({
          code: "worker_output_integration_lease_unavailable",
          message: expect.stringContaining(itemId),
          source_id: itemId,
        }),
      ]);
      expect(
        (store.db.query("SELECT status FROM worker_output_integrations WHERE id = ?").get(itemId) as Record<string, unknown>).status,
      ).toBe("queued");
      expect(readFileSync(join(repo, "src/a.c"), "utf8")).toBe("int value = 0;\n");
      expect(Number(git(repo, ["rev-list", "--count", "HEAD"]))).toBe(1);
    } finally {
      store.db.close();
    }
  });
});
