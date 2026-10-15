import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { buildSandboxRuntimeOptions, resolveGame, sandboxRuntimeOptions, sandboxTimeoutScale } from "./resolver.js";

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

  test("defaults stackFramePolicy to match_frame and reads stop_at_frame from game.json", () => {
    const root = mkdtempSync(join(tmpdir(), "game-registry-matching-"));
    for (const [id, matching] of [["plain", undefined], ["framed", { stackFramePolicy: "stop_at_frame" }]] as const) {
      const gameDir = join(root, "games", id);
      mkdirSync(gameDir, { recursive: true });
      writeJson(join(gameDir, "game.json"), matching ? { id, matching } : { id });
    }
    expect(resolveGame({ orchestratorRoot: root, gameId: "plain" }).matching.stackFramePolicy).toBe("match_frame");
    expect(resolveGame({ orchestratorRoot: root, gameId: "framed" }).matching.stackFramePolicy).toBe("stop_at_frame");
    const badDir = join(root, "games", "bad");
    mkdirSync(badDir, { recursive: true });
    writeJson(join(badDir, "game.json"), { id: "bad", matching: { stackFramePolicy: "pad_it" } });
    expect(() => resolveGame({ orchestratorRoot: root, gameId: "bad" })).toThrow(/stackFramePolicy/);
  });

  test("defaults steeringGate to off, reads shadow/enforce, and rejects unknown modes", () => {
    const root = mkdtempSync(join(tmpdir(), "game-registry-steering-"));
    const cases = [
      ["plain", undefined],
      ["framed", { stackFramePolicy: "stop_at_frame" }],
      ["shadowed", { steeringGate: "shadow" }],
      ["enforced", { stackFramePolicy: "stop_at_frame", steeringGate: "enforce" }],
    ] as const;
    for (const [id, matching] of cases) {
      const gameDir = join(root, "games", id);
      mkdirSync(gameDir, { recursive: true });
      writeJson(join(gameDir, "game.json"), matching ? { id, matching } : { id });
    }
    const resolved = (gameId: string) => resolveGame({ orchestratorRoot: root, gameId }).matching;
    expect(resolved("plain")).toEqual({ stackFramePolicy: "match_frame", steeringGate: "off" });
    expect(resolved("framed")).toEqual({ stackFramePolicy: "stop_at_frame", steeringGate: "off" });
    expect(resolved("shadowed").steeringGate).toBe("shadow");
    expect(resolved("enforced")).toEqual({ stackFramePolicy: "stop_at_frame", steeringGate: "enforce" });
    for (const [id, steeringGate] of [["bad", "strict"], ["typed", true]] as const) {
      const gameDir = join(root, "games", id);
      mkdirSync(gameDir, { recursive: true });
      writeJson(join(gameDir, "game.json"), { id, matching: { steeringGate } });
      expect(() => resolveGame({ orchestratorRoot: root, gameId: id })).toThrow(/steeringGate/);
    }
  });

  test("parses the optional ordering block strictly and leaves unconfigured games without the key", () => {
    const root = mkdtempSync(join(tmpdir(), "game-registry-ordering-"));
    const write = (id: string, body: Record<string, unknown>) => {
      const gameDir = join(root, "games", id);
      mkdirSync(gameDir, { recursive: true });
      writeJson(join(gameDir, "game.json"), { id, ...body });
    };
    write("plain", {});
    write("shadowed", { ordering: { mode: "shadow", gatedPaths: ["src/System/MarNameRefGen*.cpp"], scope: { maxForeignHeaders: 3, maxForeignHeaderLines: 25 } } });
    write("enforced", { matching: { steeringGate: "shadow" }, ordering: { mode: "enforce", gatedPaths: [] } });
    write("bare", { ordering: { mode: "off" } });
    const resolve = (gameId: string) => resolveGame({ orchestratorRoot: root, gameId });

    const plain = resolve("plain");
    expect("ordering" in plain).toBe(false);
    expect(resolve("shadowed").ordering).toEqual({ mode: "shadow", gatedPaths: ["src/System/MarNameRefGen*.cpp"], scope: { maxForeignHeaders: 3, maxForeignHeaderLines: 25 } });
    expect(resolve("enforced").ordering).toEqual({ mode: "enforce", gatedPaths: [] });
    expect(resolve("bare").ordering).toEqual({ mode: "off", gatedPaths: [] });

    const invalid: Array<[string, unknown, RegExp]> = [
      ["mode", { mode: "strict" }, /ordering\.mode/],
      ["nomode", { gatedPaths: [] }, /ordering\.mode/],
      ["unknown", { mode: "shadow", gated: [] }, /unknown key gated/],
      ["globs", { mode: "shadow", gatedPaths: ["ok", 3] }, /gatedPaths/],
      ["emptyglob", { mode: "shadow", gatedPaths: [" "] }, /gatedPaths/],
      ["fraction", { mode: "shadow", scope: { maxForeignHeaders: 2.5 } }, /maxForeignHeaders/],
      ["negative", { mode: "shadow", scope: { maxForeignHeaderLines: -1 } }, /maxForeignHeaderLines/],
      ["scopekey", { mode: "shadow", scope: { maxUnits: 1 } }, /unknown key maxUnits/],
      ["notobject", "shadow", /expected an object/],
    ];
    for (const [id, ordering, message] of invalid) {
      write(id, { ordering });
      expect(() => resolve(id)).toThrow(message);
    }
  });

  test("ordering enforce requires the steering gate on (checked on the effective config)", () => {
    const root = mkdtempSync(join(tmpdir(), "game-registry-ordering-gate-"));
    for (const [id, steeringGate] of [["off", undefined], ["shadow", "shadow"], ["enforce", "enforce"]] as const) {
      const gameDir = join(root, "games", id);
      mkdirSync(gameDir, { recursive: true });
      writeJson(join(gameDir, "game.json"), { id, ...(steeringGate ? { matching: { steeringGate } } : {}), ordering: { mode: "enforce", gatedPaths: [] } });
    }
    expect(() => resolveGame({ orchestratorRoot: root, gameId: "off" })).toThrow(/ordering\.mode enforce requires matching\.steeringGate/);
    expect(resolveGame({ orchestratorRoot: root, gameId: "shadow" }).ordering?.mode).toBe("enforce");
    expect(resolveGame({ orchestratorRoot: root, gameId: "enforce" }).ordering?.mode).toBe("enforce");
  });

  test("ships SMS ordering in shadow and Melee without an ordering block", () => {
    const melee = resolveGame({ gameId: "melee" });
    expect("ordering" in melee).toBe(false);
    expect(JSON.stringify(melee)).not.toContain("ordering");
    expect(resolveGame({ gameId: "sms" }).ordering).toEqual({
      mode: "shadow",
      gatedPaths: ["src/System/MarNameRefGen*.cpp"],
      scope: { maxForeignHeaders: 3, maxForeignHeaderLines: 25 },
    });
  });

  test("ships Melee with the steering gate off and SMS in shadow", () => {
    expect(resolveGame({ gameId: "melee" }).matching.steeringGate).toBe("off");
    expect(resolveGame({ gameId: "sms" }).matching.steeringGate).toBe("shadow");
  });

  test("parses the optional symbolCheck validator config and leaves unconfigured games unset", () => {
    const root = mkdtempSync(join(tmpdir(), "game-registry-symbol-check-"));
    const gameDir = join(root, "games", "sms");
    mkdirSync(join(gameDir, "config"), { recursive: true });
    writeJson(join(gameDir, "game.json"), { id: "sms", config: { build: "./config/build.json" } });
    writeJson(join(gameDir, "config/build.json"), { reportPath: "build/GMSJ01/report.json", symbolCheck: { script: "tools/check-changed-symbol-order.py", map: "orig/GMSJ01/files/mario.MAP" } });
    const game = resolveGame({ orchestratorRoot: root, gameId: "sms" });
    expect(game.validation.symbolCheck).toEqual({ script: "tools/check-changed-symbol-order.py", map: "orig/GMSJ01/files/mario.MAP" });
    expect(game.validation.workerSymbolValidationGate).toBe(true);

    writeJson(join(gameDir, "config/build.json"), { symbolCheck: { script: "/abs/check.py", map: "orig/GMSJ01/files/mario.MAP" } });
    expect(() => resolveGame({ orchestratorRoot: root, gameId: "sms" })).toThrow("symbolCheck.script must be a checkout-relative path");
    writeJson(join(gameDir, "config/build.json"), { symbolCheck: { script: "tools/check.py", map: "../mario.MAP" } });
    expect(() => resolveGame({ orchestratorRoot: root, gameId: "sms" })).toThrow("symbolCheck.map must be a checkout-relative path");
    writeJson(join(gameDir, "config/build.json"), { reportPath: "build/GMSJ01/report.json" });
    expect(resolveGame({ orchestratorRoot: root, gameId: "sms" }).validation.symbolCheck).toBeUndefined();
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

  test("selects a separate build profile and per-profile timeout scale", () => {
    const root = mkdtempSync(join(tmpdir(), "game-registry-build-profile-"));
    const gameDir = join(root, "games", "melee");
    mkdirSync(join(gameDir, "config"), { recursive: true });
    writeJson(join(gameDir, "game.json"), {
      id: "melee",
      sandbox: {
        default_profile: "2-core",
        build_profile: "8-core",
        profiles: {
          "2-core": { snapshot_name: "melee-2c", timeout_scale: 2 },
          "8-core": { snapshot_name: "melee-8c", resource_class: { cpu: 8, memory_gib: 16, disk_gib: 10 } },
        },
      },
    });
    const game = resolveGame({ orchestratorRoot: root, gameId: "melee" });
    expect(game.sandbox.build_profile).toBe("8-core");
    expect(buildSandboxRuntimeOptions(game)).toEqual(sandboxRuntimeOptions(game, "8-core"));
    expect(buildSandboxRuntimeOptions(game).resource_class.cpu).toBe(8);
    expect(sandboxRuntimeOptions(game)).not.toHaveProperty("timeout_scale");
    expect(sandboxTimeoutScale(game)).toBe(2);
    expect(sandboxTimeoutScale(game, "8-core")).toBe(1);
    expect(sandboxTimeoutScale(game, "missing")).toBe(1);

    writeJson(join(gameDir, "config/local.json"), { sandbox: { build_profile: "2-core" } });
    expect(buildSandboxRuntimeOptions(resolveGame({ orchestratorRoot: root, gameId: "melee" })).snapshot_name).toBe("melee-2c");
  });

  test("build profile defaults to the default profile", () => {
    const root = mkdtempSync(join(tmpdir(), "game-registry-build-profile-default-"));
    const gameDir = join(root, "games", "melee");
    mkdirSync(gameDir, { recursive: true });
    writeJson(join(gameDir, "game.json"), {
      id: "melee",
      sandbox: { default_profile: "2-core", profiles: { "2-core": { snapshot_name: "melee-2c" }, "4-core": { snapshot_name: "melee-4c" } } },
    });
    const game = resolveGame({ orchestratorRoot: root, gameId: "melee" });
    expect(game.sandbox.build_profile).toBe("2-core");
    expect(buildSandboxRuntimeOptions(game).snapshot_name).toBe("melee-2c");
    expect(sandboxTimeoutScale(game)).toBe(1);
  });

  test("rejects unknown build profiles and invalid timeout scales", () => {
    const root = mkdtempSync(join(tmpdir(), "game-registry-build-profile-invalid-"));
    const gameDir = join(root, "games", "melee");
    mkdirSync(gameDir, { recursive: true });
    writeJson(join(gameDir, "game.json"), {
      id: "melee",
      sandbox: { default_profile: "2-core", build_profile: "16-core", profiles: { "2-core": { snapshot_name: "melee-2c" } } },
    });
    expect(() => resolveGame({ orchestratorRoot: root, gameId: "melee" })).toThrow("Sandbox build profile 16-core is not defined");
    for (const timeout_scale of [0, -1, "2"]) {
      writeJson(join(gameDir, "game.json"), {
        id: "melee",
        sandbox: { profiles: { "2-core": { snapshot_name: "melee-2c", timeout_scale } } },
      });
      expect(() => resolveGame({ orchestratorRoot: root, gameId: "melee" })).toThrow("invalid timeout_scale");
    }
  });
});
