import { gameConfigurationRevision } from "../game-registry/config-revision.js";
import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { resolveGame } from "../game-registry/resolver.js";
import { openState, type StateStore } from "../orchestrator-state/index.js";
import { FakeSandboxProvider } from "../job-queue/sandbox.js";
import { runCommand } from "../../infrastructure/shell/index.js";
import { getHarnessState, getHarnessTimeline, initializeHarnessState, transitionHarnessState } from "./state.js";
import { getDispatchState } from "./lease.js";
import { sandboxReportProjection, validateHarnessSandbox } from "./sandbox-validation.js";
const roots: string[] = [];
const stores: StateStore[] = [];
afterEach(async () => { for (const store of stores.splice(0)) store.db.close(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const report = JSON.stringify({ units: [{ name: "unit", functions: [{ name: "fn", size: 4, fuzzy_match_percent: 70 }] }] });
async function fixture(remote = report) {
  const root = await mkdtemp(resolve(tmpdir(), "sandbox-readiness-")); roots.push(root);
  const gameDir = resolve(root, "games/test"); const checkout = resolve(gameDir, "workspace/checkout");
  await mkdir(checkout, { recursive: true });
  for (const args of [["init"], ["config", "user.email", "fixture@example.invalid"], ["config", "user.name", "Fixture"], ["commit", "--allow-empty", "-m", "Fixture"]]) {
    const result = await runCommand(checkout, ["git", ...args]); if (result.exitCode) throw new Error(result.stderr);
  }
  const head = (await runCommand(checkout, ["git", "rev-parse", "HEAD"])).stdout.trim();
  await writeFile(resolve(gameDir, "game.json"), JSON.stringify({ id: "test", validation: { reportPath: "build/TEST/report.json" }, sandbox: { default_profile: "2-core", profiles: { "2-core": { snapshot_name: "fixture-image", snapshot_baked_rev: head, workspace_root: "/opt/test", resource_class: { cpu: 2, memory_gib: 4, disk_gib: 10 } } } } }));
  const game = resolveGame({ gameId: "test", orchestratorRoot: root })!;
  const store = openState(game.stateDir); stores.push(store);
  const initial = initializeHarnessState(store.db, { gameId: "test", worktree: checkout, configurationRevision: gameConfigurationRevision(game), commandId: "init" });
  transitionHarnessState(store.db, { gameId: "test", expectedRevision: initial.identity.revision, commandId: "sync", patch: { source: { head }, readiness: { build: "ready", sources: "ready", evidence: "ready" }, execution: { status: "paused" } } });
  const provider = new FakeSandboxProvider();
  for (let i = 0; i < 15; i++) provider.scriptExec(async call => {
    if (call.command.includes('if [ ! -f build.ninja ]; then python3 configure.py || exit; fi; rm -f -- "$1"; ninja -k 0 "$1"')) {
      await (await provider.get(call.sandboxId))!.writeFile("/opt/test/build/TEST/report.json", remote);
    }
    return { exitCode: 0, stdout: call.command[0] === "git" && call.command[1] === "rev-parse" ? `${head}\n` : "", stderr: "" };
  });
  const buildHost = async () => {
    const reportPath = resolve(checkout, "build/TEST/report.json"); await mkdir(resolve(reportPath, ".."), { recursive: true }); await writeFile(reportPath, report);
    return { reportPath, baselinePath: "", reportChangesPath: "", resetBaseline: false, steps: [], timestamps: {} };
  };
  return { game, store, provider, buildHost, checkout };
}
test("real provisioning plus matching reports satisfies readiness and preserves paused intent", async () => {
  const f = await fixture();
  const result = await validateHarnessSandbox(f);
  expect(result.ready).toBe(true);
  expect(getHarnessState(f.store.db, "test")?.readiness.sandbox).toBe("ready");
  expect(getHarnessState(f.store.db, "test")?.execution.desired).toBe("paused");
  expect(getDispatchState(f.store, "test")?.active_workflow).toBeNull();
  expect(f.provider.deletedSandboxes).toHaveLength(1);
  expect(f.provider.createdSandboxes[0]?.params.snapshot).toBe("fixture-image");
  expect(getHarnessTimeline(f.store.db, "test").at(-1)?.kind).toBe("initial_sync_accepted");
});
test("report mismatch blocks readiness and releases sandbox and dispatch", async () => {
  const f = await fixture(report.replace("70", "71"));
  await expect(validateHarnessSandbox(f)).rejects.toThrow("differs");
  expect(getHarnessState(f.store.db, "test")?.readiness.sandbox).toBe("blocked");
  expect(getDispatchState(f.store, "test")?.active_workflow).toBeNull();
  expect(f.provider.deletedSandboxes).toHaveLength(1);
});
test("empty reports cannot pass validation", () => { expect(() => sandboxReportProjection('{"units":[]}')).toThrow("no scored functions"); });
test("configuration drift while building cannot certify readiness", async () => {
  const f = await fixture();
  await expect(validateHarnessSandbox({ ...f, reloadGame: () => ({ ...f.game, displayName: "changed" }) })).rejects.toThrow("configuration changed");
  expect(getHarnessState(f.store.db, "test")?.readiness.sandbox).toBe("blocked");
  expect(f.provider.createdSandboxes).toHaveLength(0);
});
test("concurrent validator is rejected by exclusive dispatch lease", async () => {
  const f = await fixture(); let rejected = false;
  await validateHarnessSandbox({ ...f, buildHost: async (...args) => {
    await expect(validateHarnessSandbox(f)).rejects.toThrow("active work"); rejected = true;
    return f.buildHost();
  } });
  expect(rejected).toBe(true);
});
test("accepted head change during remote build cannot certify readiness", async () => {
  const f = await fixture();
  const originalGet = f.provider.get.bind(f.provider);
  let changed = false;
  f.provider.get = async (id) => {
    const handle = await originalGet(id);
    if (!handle) return null;
    const read = handle.readFile.bind(handle);
    handle.readFile = async path => {
      const content = await read(path);
      if (path.endsWith("report.json") && !changed) {
        changed = true;
        const state = getHarnessState(f.store.db, "test")!;
        transitionHarnessState(f.store.db, { gameId: "test", expectedRevision: state.identity.revision, commandId: "head-drift", patch: { source: { head: "changed" } } });
      }
      return content;
    };
    return handle;
  };
  await expect(validateHarnessSandbox(f)).rejects.toThrow("head or configuration changed");
  expect(f.provider.deletedSandboxes).toHaveLength(1);
  expect(getHarnessState(f.store.db, "test")?.readiness.sandbox).toBe("blocked");
});
test("unknown profile fails before provisioning", async () => {
  const f = await fixture();
  await expect(validateHarnessSandbox({ ...f, profile: "unknown" })).rejects.toThrow();
  expect(f.provider.createdSandboxes).toHaveLength(0);
});

test("successful validation clears its readiness blocker but retains unrelated blockers", async () => {
  const f = await fixture();
  const current = getHarnessState(f.store.db, "test")!;
  transitionHarnessState(f.store.db, { gameId: "test", expectedRevision: current.identity.revision, commandId: "block", patch: { execution: { status: "blocked", blockers: [{ code: "harness_sandbox_pending", message: "Validate sandbox", source_kind: "harness", source_id: "test", recoverable: true }, { code: "operator_hold", message: "Review required", source_kind: "operator", source_id: "test", recoverable: true }] } } });
  const result = await validateHarnessSandbox(f);
  expect(result.ready).toBe(false);
  expect(getHarnessState(f.store.db, "test")?.execution.blockers.map(b => b.code)).toEqual(["operator_hold"]);
  expect(getHarnessState(f.store.db, "test")?.execution.status).toBe("blocked");
});
test("successful validation clears sandbox-only blockers and becomes paused", async () => {
  const f = await fixture();
  const current = getHarnessState(f.store.db, "test")!;
  transitionHarnessState(f.store.db, { gameId: "test", expectedRevision: current.identity.revision, commandId: "block", patch: { execution: { status: "blocked", blockers: [{ code: "harness_sandbox_pending", message: "Validate sandbox", source_kind: "harness", source_id: "test", recoverable: true }] } } });
  expect((await validateHarnessSandbox(f)).ready).toBe(true);
  expect(getHarnessState(f.store.db, "test")?.execution.blockers).toEqual([]);
  expect(getHarnessState(f.store.db, "test")?.execution.status).toBe("paused");
});
