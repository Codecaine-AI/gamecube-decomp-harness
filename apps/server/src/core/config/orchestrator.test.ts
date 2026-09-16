import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readOrchestratorConfig, resolveLocalEnvPath, resolveOrchestratorLayout } from "./orchestrator.js";

const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "orchestrator-layout-"));
  roots.push(root);
  return root;
}
function put(root: string, path: string, contents = "fixture") {
  const target = join(root, path);
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(target, contents);
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("global orchestrator layout", () => {
  test("fresh installs select grouped state without creating it or moving pi sessions", () => {
    const root = fixture();
    const layout = resolveOrchestratorLayout(root);
    expect(layout.stateDir).toBe(join(root, "runtime/state"));
    expect(layout.piSessionsDir).toBe(join(root, ".pi-sessions"));
    expect(existsSync(layout.stateDir)).toBe(false);
  });

  test("legacy state never changes the canonical runtime location", () => {
    const root = fixture();
    put(root, ".decomp-orchestrator-state/cursors.json");
    mkdirSync(join(root, "runtime/state"), { recursive: true });
    expect(resolveOrchestratorLayout(root).stateDir).toBe(join(root, "runtime/state"));
  });

  test("explicit config and caller locations override the canonical default", () => {
    const root = fixture();
    put(root, ".decomp-orchestrator-state/cursors.json");
    put(root, "runtime/state/cursors.json");
    expect(resolveOrchestratorLayout(root).stateDir).toBe(join(root, "runtime/state"));
    put(root, "config/orchestrator.json", JSON.stringify({ schemaVersion: 1, stateDir: "runtime/state" }));
    expect(resolveOrchestratorLayout(root).stateDir).toBe(join(root, "runtime/state"));
    expect(resolveOrchestratorLayout(root, ".decomp-orchestrator-state").stateDir).toBe(join(root, ".decomp-orchestrator-state"));
  });

  test("config validates fields instead of silently accepting mistyped paths", () => {
    const root = fixture();
    put(root, "config/orchestrator.json", JSON.stringify({ schemaVersion: 1, stateDirectory: "elsewhere" }));
    expect(() => readOrchestratorConfig(root)).toThrow("Unknown orchestrator config field");
    put(root, "config/orchestrator.json", JSON.stringify({ schemaVersion: 1, stateDir: " " }));
    expect(() => readOrchestratorConfig(root)).toThrow("Invalid orchestrator stateDir");
  });

  test("local env always uses the canonical config folder", () => {
    const root = fixture();
    put(root, "local.env");
    expect(resolveLocalEnvPath(root)).toBe(join(root, "config/local.env"));
    put(root, "config/local.env");
    expect(resolveLocalEnvPath(root)).toBe(join(root, "config/local.env"));
  });
});
