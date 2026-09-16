import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { resolveGame } from "./resolver.js";
import { gameConfigurationRevision } from "./config-revision.js";
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture(legacyTools = false) {
  const root = mkdtempSync(resolve(tmpdir(), "game-config-revision-")); roots.push(root);
  const gameDir = resolve(root, "games/test");
  const tools = legacyTools ? "tool-bindings" : "config/tools";
  mkdirSync(resolve(gameDir, tools), { recursive: true });
  mkdirSync(resolve(gameDir, "config/sources"), { recursive: true });
  const write = (path: string, value: unknown) => writeFileSync(resolve(gameDir, path), JSON.stringify(value));
  write("game.json", { id: "test", config: { sources: ["config/sources/wiki.json"] } });
  write("config/sources/wiki.json", { kind: "wiki", enabled: true });
  write(`${tools}/checkdiff.json`, { command: "checkdiff", enabled: true });
  const game = resolveGame({ gameId: "test", orchestratorRoot: root })!;
  return { game, write, tools };
}
test("filesystem health warnings and JSON key order do not change configuration identity", () => {
  const f = fixture();
  const before = gameConfigurationRevision(f.game);
  f.write("game.json", { config: { sources: ["config/sources/wiki.json"] }, id: "test" });
  expect(gameConfigurationRevision({ ...f.game, warnings: ["graph database created"] })).toBe(before);
});
test("source definition and tool binding contents invalidate configuration identity", () => {
  const f = fixture();
  const first = gameConfigurationRevision(f.game);
  f.write("config/sources/wiki.json", { kind: "wiki", enabled: false });
  const second = gameConfigurationRevision(f.game);
  expect(second).not.toBe(first);
  f.write(`${f.tools}/checkdiff.json`, { command: "different", enabled: true });
  expect(gameConfigurationRevision(f.game)).not.toBe(second);
});
test("old unconfigured tool binding directories do not affect configuration identity", () => {
  const f = fixture(true);
  const before = gameConfigurationRevision(f.game);
  f.write(`${f.tools}/checkdiff.json`, { command: "different" });
  expect(gameConfigurationRevision(f.game)).toBe(before);
});
test("local credential values are not part of the fingerprint", () => {
  const f = fixture();
  const before = gameConfigurationRevision(f.game);
  writeFileSync(f.game.localEnvPath, "DAYTONA_API_KEY=fixture-value\n");
  expect(gameConfigurationRevision(f.game)).toBe(before);
});

test("creating local overrides invalidates a cached resolved configuration", () => {
  const f = fixture();
  const before = gameConfigurationRevision(f.game);
  f.write("config/local.json", { sandbox: { default_profile: "4-core" } });
  expect(gameConfigurationRevision(f.game)).not.toBe(before);
});
