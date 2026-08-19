import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { listGameEvents } from "@server/core/harness-state/events.js";
import { openState, type StateStore } from "@server/core/orchestrator-state";
import {
  provisionSandboxWorkspace,
  type ProvisionCommandRunner,
  type SandboxProvisionLabels,
} from "./provisioning.js";
import { FakeSandboxProvider } from "./sandbox.js";

const roots: string[] = [];
const stores: StateStore[] = [];
afterEach(async () => {
  for (const store of stores.splice(0)) store.db.close();
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

const sandboxLabels: SandboxProvisionLabels = {
  game_id: "melee",
  run_id: "run-1",
  claim_id: "claim-1",
  job_id: "job-1",
  job_lease_id: "job-lease-1",
  dispatch_lease_id: "dispatch-lease-1",
  worker_state_id: "worker-state-1",
  trace_id: "trace-worker-1",
};

async function sandboxFixture(prefix: string) {
  const root = await mkdtemp(resolve(tmpdir(), prefix));
  roots.push(root);
  const stateDir = resolve(root, "state");
  const store = openState(stateDir);
  stores.push(store);
  const sourceRepoRoot = resolve(root, "source");
  await mkdir(sourceRepoRoot, { recursive: true });
  return { root, store, sourceRepoRoot };
}

function sandboxEvent(store: StateStore) {
  return {
    store,
    context: {
      gameId: "melee",
      correlationId: "job-1",
      causationId: "job-claimed-1",
      traceId: "trace-worker-1",
      jobId: "job-1",
      claimId: "claim-1",
      workerStateId: "worker-state-1",
    },
  };
}

describe("provisionSandboxWorkspace", () => {
  test("creates, seeds, verifies, and emits with the complete provisioning contract", async () => {
    const { root, store, sourceRepoRoot } = await sandboxFixture("provision-sandbox-");
    const provider = new FakeSandboxProvider();
    const reportArtifactSources = await Promise.all([
      "build/GALE01/report.json",
      "build/GALE01/report_changes.json",
      "build/GALE01/baseline.json",
    ].map(async (relativePath) => {
      const sourcePath = resolve(root, "reports", relativePath.split("/").at(-1)!);
      await mkdir(resolve(root, "reports"), { recursive: true });
      await writeFile(sourcePath, relativePath);
      return { relativePath, sourcePath };
    }));
    const hostCalls: Array<{ cwd: string; command: string[]; timeoutMs?: number }> = [];
    const commandRunner: ProvisionCommandRunner = async (cwd, command, options) => {
      hostCalls.push({ cwd, command, timeoutMs: options?.timeoutMs });
      if (command[1] === "bundle") await writeFile(command[3]!, "bundle");
      return { exitCode: 0, stdout: "", stderr: "" };
    };

    const result = await provisionSandboxWorkspace({
      provider,
      sourceRepoRoot,
      baseRev: "base-rev",
      snapshotBakedRev: "baked-rev",
      workspaceRoot: "/opt/melee",
      snapshot: "melee-worker-v1",
      resources: { cpu: 2, memoryGiB: 4, diskGiB: 5 },
      ttlSeconds: 61,
      labels: sandboxLabels,
      reportArtifactSources,
      event: sandboxEvent(store),
      commandRunner,
    });

    expect(result).toEqual({ sandboxId: "sandbox-1", workspaceRoot: "/opt/melee" });
    expect(provider.createdSandboxes[0]?.params).toEqual({
      snapshot: "melee-worker-v1",
      labels: sandboxLabels,
      resources: { cpu: 2, memoryGiB: 4, diskGiB: 5 },
      ttlMinutes: 32,
    });
    expect(hostCalls).toHaveLength(3);
    expect(hostCalls.every((call) => call.cwd === sourceRepoRoot && call.timeoutMs === 1_200_000)).toBeTrue();
    const bundleRef = hostCalls[0]?.command[2];
    expect(bundleRef).toStartWith("refs/decomp-orchestrator/sandbox-seeds/");
    expect(hostCalls[0]?.command).toEqual(["git", "update-ref", bundleRef!, "base-rev"]);
    expect(hostCalls[1]?.command).toEqual(["git", "bundle", "create", expect.any(String), "baked-rev..base-rev", bundleRef!]);
    expect(hostCalls[2]?.command).toEqual(["git", "update-ref", "-d", bundleRef!]);
    expect(provider.execCalls.map(({ command, opts }) => ({ command, opts }))).toEqual([
      { command: ["git", "bundle", "verify", "/tmp/melee-claim-seed.bundle"], opts: { cwd: "/opt/melee", timeoutMs: 1_200_000, env: undefined } },
      { command: ["git", "fetch", "/tmp/melee-claim-seed.bundle", "base-rev"], opts: { cwd: "/opt/melee", timeoutMs: 1_200_000, env: undefined } },
      { command: ["git", "checkout", "--force", "--detach", "base-rev"], opts: { cwd: "/opt/melee", timeoutMs: 1_200_000, env: undefined } },
      { command: ["/bin/sh", "-c", "test -x build/tools/wibo-real && test -x build/tools/objdiff-cli && test -x build/tools/dtk"], opts: { cwd: "/opt/melee", timeoutMs: 1_200_000, env: undefined } },
    ]);
    expect(provider.uploadCalls.map(({ remotePath }) => remotePath)).toEqual([
      "/tmp/melee-claim-seed.bundle",
      "/opt/melee/build/GALE01/report.json",
      "/opt/melee/build/GALE01/report_changes.json",
      "/opt/melee/build/GALE01/baseline.json",
    ]);
    expect(listGameEvents(store.db).map((event) => ({ eventType: event.eventType, payload: event.payload }))).toEqual([{
      eventType: "sandbox.created",
      payload: {
        sandbox_id: "sandbox-1",
        snapshot: "melee-worker-v1",
        cpu: 2,
        memory_gib: 4,
        disk_gib: 5,
        job_id: "job-1",
        claim_id: "claim-1",
        worker_state_id: "worker-state-1",
      },
    }]);
  });

  test("skips an empty bundle range and verifies the baked revision exists", async () => {
    const { store, sourceRepoRoot } = await sandboxFixture("provision-sandbox-equal-");
    const provider = new FakeSandboxProvider();
    let hostCalled = false;

    await provisionSandboxWorkspace({
      provider,
      sourceRepoRoot,
      baseRev: "same-rev",
      snapshotBakedRev: "same-rev",
      workspaceRoot: "/workspace/game",
      snapshot: "snapshot",
      resources: { cpu: 4, memoryGiB: 8, diskGiB: 10 },
      ttlSeconds: 60,
      labels: sandboxLabels,
      reportArtifactSources: [],
      event: sandboxEvent(store),
      commandRunner: async () => { hostCalled = true; return { exitCode: 0, stdout: "", stderr: "" }; },
    });

    expect(hostCalled).toBe(false);
    expect(provider.uploadCalls).toEqual([]);
    expect(provider.execCalls.map((call) => call.command)).toEqual([
      ["git", "rev-parse", "--verify", "same-rev^{commit}"],
      ["git", "checkout", "--force", "--detach", "same-rev"],
      ["/bin/sh", "-c", "test -x build/tools/wibo-real && test -x build/tools/objdiff-cli && test -x build/tools/dtk"],
    ]);
    expect(provider.createdSandboxes[0]?.params.ttlMinutes).toBe(31);
  });

  test("deletes a partially provisioned sandbox and rethrows the original failure", async () => {
    const { store, sourceRepoRoot } = await sandboxFixture("provision-sandbox-failure-");
    const provider = new FakeSandboxProvider().scriptExec(new Error("remote verify failed"));

    await expect(provisionSandboxWorkspace({
      provider,
      sourceRepoRoot,
      baseRev: "same-rev",
      snapshotBakedRev: "same-rev",
      workspaceRoot: "/opt/melee",
      snapshot: "snapshot",
      resources: { cpu: 2, memoryGiB: 4, diskGiB: 5 },
      ttlSeconds: 300,
      labels: sandboxLabels,
      reportArtifactSources: [],
      event: sandboxEvent(store),
    })).rejects.toThrow("remote verify failed");

    expect(provider.deletedSandboxes).toHaveLength(1);
    expect(provider.deletedSandboxes[0]).toMatchObject({ sandboxId: "sandbox-1", reason: "provision_failure" });
    expect(listGameEvents(store.db).map((event) => event.eventType)).toEqual([
      "sandbox.created",
      "sandbox.deleted",
    ]);
    expect(listGameEvents(store.db)[1]?.payload).toMatchObject({
      sandbox_id: "sandbox-1",
      reason: "provision_failure",
      job_id: "job-1",
      claim_id: "claim-1",
    });
  });
});
