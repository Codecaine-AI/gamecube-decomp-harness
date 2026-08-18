import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { resolveGame, sandboxRuntimeOptions } from "./resolver.js";

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

describe("game registry layout resolution", () => {
  test("resolves games/<id>/game.json and local.game.json", () => {
    const root = mkdtempSync(join(tmpdir(), "game-registry-primary-"));
    const gameDir = join(root, "games", "melee");
    mkdirSync(gameDir, { recursive: true });
    writeJson(join(gameDir, "game.json"), {
      id: "melee",
      displayName: "Primary",
      repoRoot: "./checkout",
      knowledge: { gameSources: ["code_graph"] },
    });
    writeJson(join(gameDir, "local.game.json"), { id: "melee", displayName: "Local game" });

    const game = resolveGame({ orchestratorRoot: root, gameId: "melee" });

    expect(game.displayName).toBe("Local game");
    expect(game.gameDir).toBe(gameDir);
    expect(game.descriptorPath).toBe(join(gameDir, "game.json"));
    expect(game.localOverridePath).toBe(join(gameDir, "local.game.json"));
    expect(game.knowledge.gameSources).toEqual(["code_graph"]);
  });

  test("uses games/config.json defaultGame", () => {
    const root = mkdtempSync(join(tmpdir(), "game-registry-config-"));
    const gameDir = join(root, "games", "sunshine");
    mkdirSync(gameDir, { recursive: true });
    writeJson(join(root, "games", "config.json"), { defaultGame: "sunshine" });
    writeJson(join(gameDir, "game.json"), { id: "sunshine" });

    expect(resolveGame({ orchestratorRoot: root, useDefaultGame: true }).gameId).toBe("sunshine");
  });

  test("provides sandbox defaults", () => {
    const root = mkdtempSync(join(tmpdir(), "game-registry-sandbox-defaults-"));
    const gameDir = join(root, "games", "melee");
    mkdirSync(gameDir, { recursive: true });
    writeJson(join(gameDir, "game.json"), { id: "melee" });

    expect(sandboxRuntimeOptions(resolveGame({ orchestratorRoot: root, gameId: "melee" }))).toEqual({
      resource_class: { cpu: 2, memory_gib: 4, disk_gib: 5 },
      snapshot_name: "",
      snapshot_baked_rev: "",
      workspace_root: "/opt/melee",
    });
  });

  test("merges sandbox descriptor and local resource overrides", () => {
    const root = mkdtempSync(join(tmpdir(), "game-registry-sandbox-overrides-"));
    const gameDir = join(root, "games", "melee");
    mkdirSync(gameDir, { recursive: true });
    writeJson(join(gameDir, "game.json"), {
      id: "melee",
      sandbox: {
        resource_class: { cpu: 4, memory_gib: 8 },
        snapshot_name: "melee-base",
        snapshot_baked_rev: "baked-rev",
        workspace_root: "/workspace/melee",
      },
    });
    writeJson(join(gameDir, "local.game.json"), {
      sandbox: {
        resource_class: { disk_gib: 20 },
        snapshot_name: "melee-local",
        snapshot_baked_rev: "local-baked-rev",
      },
    });

    expect(sandboxRuntimeOptions(resolveGame({ orchestratorRoot: root, gameId: "melee" }))).toEqual({
      resource_class: { cpu: 4, memory_gib: 8, disk_gib: 20 },
      snapshot_name: "melee-local",
      snapshot_baked_rev: "local-baked-rev",
      workspace_root: "/workspace/melee",
    });
  });
});
