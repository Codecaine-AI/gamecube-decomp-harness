import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { syncStagingPaths } from "./git.js";
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
test("grouped game state always stages under workspace", () => {
  const root = mkdtempSync(resolve(tmpdir(), "sync-layout-")); roots.push(root);
  const state = resolve(root, "runtime/state");
  const canonical = resolve(root, "workspace/staging/sync-1");
  const legacy = resolve(state, "sync_staging/sync-1");
  expect(syncStagingPaths(state, "sync-1").root).toBe(canonical);
  mkdirSync(legacy, { recursive: true });
  expect(syncStagingPaths(state, "sync-1").root).toBe(canonical);
  mkdirSync(canonical, { recursive: true });
  expect(syncStagingPaths(state, "sync-1").root).toBe(canonical);
});
test("custom state paths use their own staging directory", () => {
  expect(syncStagingPaths("/tmp/fixture/state", "sync-2").root).toBe("/tmp/fixture/state/staging/sync-2");
});
