import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { openState } from "@server/core/orchestrator-state";
import { createSavePointRuntime } from "./save-points-runtime.js";

const cleanup: string[] = [];

afterEach(() => {
  for (const path of cleanup.splice(0).reverse()) rmSync(path, { recursive: true, force: true });
});

test("harness manual capture passes canonical checkout and stable command without cycle argument", async () => {
  const { initializeHarnessState, getHarnessState } = await import("@server/core/harness-state");
  const stateDir = mkdtempSync(join(tmpdir(), "save-point-harness-runtime-")); cleanup.push(stateDir);
  const store = openState(stateDir);
  initializeHarnessState(store.db, { gameId: "example", commandId: "initialize", worktree: "/canonical/checkout", configurationRevision: "config" });
  store.db.close();
  const commands: string[][] = [];
  const paths = { game: { gameId: "example" } as never, repoRoot: "/obsolete/checkout", stateDir, graphDbPath: "/graph.sqlite", usePathOverrides: true };
  const runtime = createSavePointRuntime({ invalidateCampaignCache: () => {}, outputTail: text => text, resolveDashboardGame: () => paths,
    runCli: async command => { commands.push(command); return { exitCode: 0, stdout: JSON.stringify({ savePoint: { id: "save-1" }, blockerRaised: true }), stderr: "" }; }, serverJobPath: "/job.ts" });
  expect(await runtime.createSavePoint({ commandId: "stable-command" })).toEqual({ ok: true, savePointId: "save-1", blockerRaised: true });
  await runtime.createSavePoint({ commandId: "stable-command" });
  expect(commands[0]).toEqual(commands[1]); expect(commands[0]).not.toContain("--cycle-uuid");
  expect(commands[0]?.[commands[0]!.indexOf("--repo-root") + 1]).toBe("/canonical/checkout");
  expect(commands[0]?.[commands[0]!.indexOf("--command-id") + 1]).toBe("stable-command");
  const failedRuntime = createSavePointRuntime({ invalidateCampaignCache: () => {}, outputTail: text => text, resolveDashboardGame: () => paths,
    runCli: async () => ({ exitCode: 1, stdout: "", stderr: "capture process failed" }), serverJobPath: "/job.ts" });
  await expect(failedRuntime.createSavePoint({ commandId: "failed-command" })).rejects.toThrow("save-point failed");
  const verify = openState(stateDir);
  try { expect(getHarnessState(verify.db, "example")!.execution.blockers).toContainEqual(expect.objectContaining({ code: "save_point_capture_failed", source_id: "failed-command" })); }
  finally { verify.db.close(); }
});

for (const mode of ["missing-id", "throws"] as const) test(`capture failure ${mode} records a canonical blocker once`, async () => {
  const { initializeHarnessState, getHarnessState, getHarnessTimeline } = await import("@server/core/harness-state");
  const stateDir = mkdtempSync(join(tmpdir(), "save-point-failure-")); cleanup.push(stateDir);
  const store = openState(stateDir);
  initializeHarnessState(store.db, { gameId: "example", commandId: "initialize", worktree: "/canonical/checkout", configurationRevision: "config" });
  const paths = { game: { gameId: "example" } as never, repoRoot: "/obsolete/checkout", stateDir, graphDbPath: "/graph.sqlite", usePathOverrides: true };
  const runtime = createSavePointRuntime({ invalidateCampaignCache: () => {}, outputTail: text => text, resolveDashboardGame: () => paths,
    runCli: async () => { if (mode === "throws") throw new Error("process unavailable"); return { exitCode: 0, stdout: "{}", stderr: "" }; }, serverJobPath: "/job.ts" });
  try {
    for (let retry = 0; retry < 2; retry++) expect(await runtime.boundarySavePoint(paths, "manual", "capture", "same-command")).toEqual({ ok: false, savePointId: null, blockerRaised: true });
    expect(getHarnessState(store.db, "example")!.readiness.evidence).toBe("blocked");
    expect(getHarnessTimeline(store.db, "example").filter(entry => entry.kind === "failed")).toHaveLength(1);
  } finally { store.db.close(); }
});

test("missing canonical harness rejects before spawning a capture process", async () => {
  const stateDir = mkdtempSync(join(tmpdir(), "save-point-no-harness-")); cleanup.push(stateDir);
  let called = false;
  const paths = { game: { gameId: "example" } as never, repoRoot: "/repo", stateDir, graphDbPath: "/graph.sqlite", usePathOverrides: true };
  const runtime = createSavePointRuntime({ invalidateCampaignCache: () => {}, outputTail: text => text, resolveDashboardGame: () => paths,
    runCli: async () => { called = true; return { exitCode: 0, stdout: "{}", stderr: "" }; }, serverJobPath: "/job.ts" });
  await expect(runtime.createSavePoint({ commandId: "capture" })).rejects.toThrow("No harness");
  expect(called).toBe(false);
});
