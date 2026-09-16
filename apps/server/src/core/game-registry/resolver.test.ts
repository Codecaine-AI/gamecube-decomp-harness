import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { resolveGame, sandboxRuntimeOptions } from "./resolver.js";

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

describe("game registry layout resolution", () => {
  test("new games use grouped paths and referenced configuration with game-root local overrides", () => {
    const root = mkdtempSync(join(tmpdir(), "game-registry-grouped-"));
    const gameDir = join(root, "games", "example");
    mkdirSync(join(gameDir, "config"), { recursive: true });
    writeJson(join(gameDir, "game.json"), {
      id: "example", config: { build: "./config/build.json", sandbox: "./config/sandbox.json" },
    });
    writeJson(join(gameDir, "config/build.json"), { reportPath: "build/EXAMPLE/report.json" });
    writeJson(join(gameDir, "config/sandbox.json"), {
      profiles: { "2-core": { snapshot_name: "example", workspace_root: "/work/example" } },
    });
    writeJson(join(gameDir, "config/local.json"), { graphDb: "./knowledge/graph/custom.sqlite" });
    const game = resolveGame({ orchestratorRoot: root, gameId: "example" });
    expect(game.repoRoot).toBe(join(gameDir, "workspace/checkout"));
    expect(game.stateDir).toBe(join(gameDir, "runtime/state"));
    expect(game.graphDbPath).toBe(join(gameDir, "knowledge/graph/custom.sqlite"));
    expect(game.localEnvPath).toBe(join(gameDir, "config/local.env"));
    expect(game.validation.reportPath).toBe("build/EXAMPLE/report.json");
    expect(game.validation.reportChangesPath).toBe("build/EXAMPLE/report_changes.json");
    expect(sandboxRuntimeOptions(game).snapshot_name).toBe("example");
    expect(() => sandboxRuntimeOptions(game, "4-core")).toThrow("not defined");
  });

  test("uses canonical state and local override paths regardless of old files", () => {
    const root = mkdtempSync(join(tmpdir(), "game-registry-canonical-store-"));
    const gameDir = join(root, "games", "example");
    mkdirSync(join(gameDir, "state"), { recursive: true });
    writeJson(join(gameDir, "game.json"), { id: "example" });
    writeJson(join(gameDir, "local.game.json"), { displayName: "ignored old config" });
    const game = resolveGame({ orchestratorRoot: root, gameId: "example" });
    expect(game.stateDir).toBe(join(gameDir, "runtime/state"));
    expect(game.displayName).toBe("example");
  });

  test("rejects invalid sandbox resources", () => {
    const root = mkdtempSync(join(tmpdir(), "game-registry-invalid-resources-"));
    const gameDir = join(root, "games", "example");
    mkdirSync(gameDir, { recursive: true });
    writeJson(join(gameDir, "game.json"), { id: "example", sandbox: { resource_class: { cpu: 0 } } });
    expect(() => resolveGame({ orchestratorRoot: root, gameId: "example" })).toThrow("invalid cpu");
  });

  test("resolves games/<id>/game.json and config/local.json", () => {
    const root = mkdtempSync(join(tmpdir(), "game-registry-primary-"));
    const gameDir = join(root, "games", "melee");
    mkdirSync(gameDir, { recursive: true });
    writeJson(join(gameDir, "game.json"), {
      id: "melee",
      displayName: "Primary",
      repoRoot: "./checkout",
      knowledge: { gameSources: ["code_graph"] },
    });
    mkdirSync(join(gameDir, "config"));
    writeJson(join(gameDir, "config/local.json"), { id: "melee", displayName: "Local game" });

    const game = resolveGame({ orchestratorRoot: root, gameId: "melee" });

    expect(game.displayName).toBe("Local game");
    expect(game.gameDir).toBe(gameDir);
    expect(game.descriptorPath).toBe(join(gameDir, "game.json"));
    expect(game.localOverridePath).toBe(join(gameDir, "config/local.json"));
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

  test("enables worker micro-gates by default", () => {
    const root = mkdtempSync(join(tmpdir(), "game-registry-validation-defaults-"));
    const gameDir = join(root, "games", "melee");
    mkdirSync(gameDir, { recursive: true });
    writeJson(join(gameDir, "game.json"), { id: "melee" });

    const game = resolveGame({ orchestratorRoot: root, gameId: "melee" });

    expect(game.validation.workerSectionParityGate).toBe(true);
    expect(game.validation.workerUndefinedSymbolGate).toBe(true);
    expect(game.validation.workerBannedIdiomGate).toBe(true);
    expect(game.validation.epochAdmissionFreshReportGate).toBe(true);
    expect(game.validation.epochAdmissionCandidateMultiple).toBe(4);
    expect(game.validation.epochAdmissionCandidateCap).toBe(500);
    expect(game.validation.epochBoundaryRetryEnabled).toBe(true);
    expect(game.validation.epochBoundaryRetryMaxAttempts).toBe(5);
    expect(game.validation.epochBoundaryRetryBaseMs).toBe(120_000);
    expect(game.validation.epochBoundaryRetryMaxMs).toBe(1_800_000);
    expect(game.validation.addressNamedStaticDataAllowlist).toEqual([]);
  });

  test("validates and normalizes address-named static data exceptions", () => {
    const root = mkdtempSync(join(tmpdir(), "game-registry-qa-allowlist-"));
    const gameDir = join(root, "games", "melee");
    mkdirSync(gameDir, { recursive: true });
    writeJson(join(gameDir, "game.json"), {
      id: "melee",
      validation: {
        addressNamedStaticDataAllowlist: [
          "lbl_8046E1B0",
          { file: "src/melee/gm/gmresultplayer.c", symbol: "lbl_8046E1B4", reason: "intentional overlay" },
        ],
      },
    });

    expect(resolveGame({ orchestratorRoot: root, gameId: "melee" }).validation.addressNamedStaticDataAllowlist).toEqual([
      { symbol: "lbl_8046E1B0" },
      { file: "src/melee/gm/gmresultplayer.c", symbol: "lbl_8046E1B4", reason: "intentional overlay" },
    ]);
  });

  test("rejects malformed address-named static data exceptions", () => {
    const root = mkdtempSync(join(tmpdir(), "game-registry-bad-qa-allowlist-"));
    const gameDir = join(root, "games", "melee");
    mkdirSync(gameDir, { recursive: true });
    writeJson(join(gameDir, "game.json"), {
      id: "melee",
      validation: { addressNamedStaticDataAllowlist: [{ file: "src/x.c" }] },
    });

    expect(() => resolveGame({ orchestratorRoot: root, gameId: "melee" })).toThrow(".symbol must be a non-empty string");
  });

  test("allows overriding epoch admission gates", () => {
    const root = mkdtempSync(join(tmpdir(), "game-registry-epoch-admission-"));
    const gameDir = join(root, "games", "melee");
    mkdirSync(gameDir, { recursive: true });
    writeJson(join(gameDir, "game.json"), {
      id: "melee",
      validation: {
        epochAdmissionFreshReportGate: false,
        epochAdmissionCandidateMultiple: 3,
        epochAdmissionCandidateCap: 250,
        epochBoundaryRetryEnabled: false,
        epochBoundaryRetryMaxAttempts: 3,
        epochBoundaryRetryBaseMs: 10_000,
        epochBoundaryRetryMaxMs: 60_000,
      },
    });

    const game = resolveGame({ orchestratorRoot: root, gameId: "melee" });

    expect(game.validation.epochAdmissionFreshReportGate).toBe(false);
    expect(game.validation.epochAdmissionCandidateMultiple).toBe(3);
    expect(game.validation.epochAdmissionCandidateCap).toBe(250);
    expect(game.validation.epochBoundaryRetryEnabled).toBe(false);
    expect(game.validation.epochBoundaryRetryMaxAttempts).toBe(3);
    expect(game.validation.epochBoundaryRetryBaseMs).toBe(10_000);
    expect(game.validation.epochBoundaryRetryMaxMs).toBe(60_000);
  });

  test("allows disabling only the worker banned-idiom gate", () => {
    const root = mkdtempSync(join(tmpdir(), "game-registry-validation-override-"));
    const gameDir = join(root, "games", "melee");
    mkdirSync(gameDir, { recursive: true });
    writeJson(join(gameDir, "game.json"), {
      id: "melee",
      validation: { workerBannedIdiomGate: false },
    });

    const game = resolveGame({ orchestratorRoot: root, gameId: "melee" });

    expect(game.validation.workerSectionParityGate).toBe(true);
    expect(game.validation.workerUndefinedSymbolGate).toBe(true);
    expect(game.validation.workerBannedIdiomGate).toBe(false);
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
      workspace_root: "/work/game",
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
    mkdirSync(join(gameDir, "config"));
    writeJson(join(gameDir, "config/local.json"), {
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

  test("selects named sandbox profiles with fixed snapshot resources", () => {
    const root = mkdtempSync(join(tmpdir(), "game-registry-sandbox-profiles-"));
    const gameDir = join(root, "games", "melee");
    mkdirSync(gameDir, { recursive: true });
    writeJson(join(gameDir, "game.json"), {
      id: "melee",
      sandbox: {
        default_profile: "2-core",
        snapshot_baked_rev: "baked-rev",
        workspace_root: "/workspace/melee",
        profiles: {
          "2-core": {
            snapshot_name: "melee-2c",
            resource_class: { cpu: 2, memory_gib: 4, disk_gib: 5 },
          },
          "4-core": {
            snapshot_name: "melee-4c",
            resource_class: { cpu: 4, memory_gib: 8, disk_gib: 5 },
          },
        },
      },
    });

    const game = resolveGame({ orchestratorRoot: root, gameId: "melee" });

    expect(sandboxRuntimeOptions(game)).toEqual({
      resource_class: { cpu: 2, memory_gib: 4, disk_gib: 5 },
      snapshot_name: "melee-2c",
      snapshot_baked_rev: "baked-rev",
      workspace_root: "/workspace/melee",
    });
    expect(sandboxRuntimeOptions(game, "4-core")).toEqual({
      resource_class: { cpu: 4, memory_gib: 8, disk_gib: 5 },
      snapshot_name: "melee-4c",
      snapshot_baked_rev: "baked-rev",
      workspace_root: "/workspace/melee",
    });
  });
});
