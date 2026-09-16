import { test, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openState } from "../harness-runtime/run-state/index.js";
import { resolveGame } from "../game-registry/resolver.js";
import { gameConfigurationRevision } from "../game-registry/config-revision.js";
import { captureSandboxProvenance } from "../game-registry/sandbox-provenance.js";
import { initializeHarnessState, transitionHarnessState, getHarnessState } from "./state.js";
import { assertSandboxAdmission } from "./sandbox-admission.js";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "sandbox-admission-"));
  const gameDir = join(root, "games/test"); mkdirSync(gameDir, { recursive: true });
  writeFileSync(join(gameDir, "game.json"), JSON.stringify({ id: "test", sandbox: { default_profile: "2-core", profiles: {
    "2-core": { snapshot_name: "test-2c", snapshot_baked_rev: "image-base", workspace_root: "/work/game", resource_class: { cpu: 2, memory_gib: 4, disk_gib: 5 } },
    "4-core": { snapshot_name: "test-4c", snapshot_baked_rev: "image-base", workspace_root: "/work/game", resource_class: { cpu: 4, memory_gib: 8, disk_gib: 5 } },
  } } }));
  const game = resolveGame({ orchestratorRoot: root, gameId: "test" });
  const store = openState(join(root, "state"));
  const revision = gameConfigurationRevision(game);
  initializeHarnessState(store.db, { gameId: "test", worktree: root, configurationRevision: revision, commandId: "init" });
  const profile = captureSandboxProvenance(game);
  const path = join(root, "validation.json");
  writeFileSync(path, JSON.stringify({ status: "passed", game_id: "test", configuration_revision: revision, sandbox: profile }));
  const state = getHarnessState(store.db, "test")!;
  transitionHarnessState(store.db, { gameId: "test", expectedRevision: state.identity.revision, commandId: "validated",
    patch: { readiness: { sandbox: "ready" } },
    boundary: { eventId: "validated", kind: "sandbox_validated", outcome: "sandbox_validated", evidence: { path, sandbox: profile, configuration_revision: revision } } });
  return { root, game, store, profile, path, close() { store.db.close(); rmSync(root, { recursive: true, force: true }); } };
}
test("validation of 2-core authorizes that profile but never an untested 4-core image", () => {
  const f = fixture(); try {
    expect(assertSandboxAdmission(f.store, { game: f.game }).profile).toBe("2-core");
    expect(() => assertSandboxAdmission(f.store, { game: f.game, profile: "4-core" })).toThrow("no successful validation");
    expect(() => assertSandboxAdmission(f.store, { game: f.game, provenance: { ...f.profile, snapshot_name: "unvalidated" } })).toThrow("image differs");
  } finally { f.close(); }
});
test("changed image or configuration requires new validation even if boolean readiness is ready", () => {
  const f = fixture(); try {
    const changed = structuredClone(f.game); changed.sandbox.profiles["2-core"]!.snapshot_baked_rev = "new-image";
    const state = getHarnessState(f.store.db, "test")!;
    transitionHarnessState(f.store.db, { gameId: "test", expectedRevision: state.identity.revision, commandId: "changed",
      patch: { source: { configuration_revision: gameConfigurationRevision(changed) }, readiness: { sandbox: "ready" } } });
    expect(() => assertSandboxAdmission(f.store, { game: changed })).toThrow("no successful validation");
    expect(() => assertSandboxAdmission(f.store, { game: f.game })).toThrow("configuration changed");
  } finally { f.close(); }
});
test("missing or failed validation artifacts cannot grant admission", () => {
  const f = fixture(); try {
    writeFileSync(f.path, JSON.stringify({ status: "failed", game_id: "test", configuration_revision: gameConfigurationRevision(f.game), sandbox: f.profile }));
    expect(() => assertSandboxAdmission(f.store, { game: f.game })).toThrow("no successful validation");
    rmSync(f.path);
    expect(() => assertSandboxAdmission(f.store, { game: f.game })).toThrow("no successful validation");
  } finally { f.close(); }
});
