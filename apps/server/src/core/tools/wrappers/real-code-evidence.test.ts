import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { packageRoot } from "@server/core/knowledge/paths.js";
import { FakeSandboxProvider, type SandboxCreateParams } from "@server/core/job-queue/sandbox.js";
import { agent as workerAgent } from "@server/core/agent-catalog/agents/running/worker/agent.js";
import { parsedAgentForMeleeKernelSpawn } from "@server/infrastructure/kernel/bridge/spawn-agent.js";
import type { PiRunOptions } from "@server/infrastructure/agent-runtime/runtime";
import { codeGraphWorkerToolProfile, defaultWorkerToolProfile, steeringGateWorkerToolProfile } from "../profiles/defaults.js";
import { buildAgentTools, resolveAgentToolIdsForContext } from "../profiles/index.js";
import { capabilityToolPromptMetadata } from "../metadata/capabilities.js";
import { registeredToolIdsForContext } from "../resolver.js";
import type { AgentToolRuntimeContext } from "../types.js";
import { capabilityToolRegistrations, realCodeEvidenceToolRegistration } from "./capabilities.js";

const SANDBOX_REPO = "/sandbox/workspace";

/**
 * The rule, not a snapshot: every worker gets the static profile; games with a
 * code graph (both have Ghidra xrefs) add the read-only graph tools; games with
 * an active steering gate (SMS) also add the steering tools.
 */
const STATIC_WORKER_TOOL_IDS: string[] = [...defaultWorkerToolProfile];
const STEERING_TOOL_IDS: string[] = [...steeringGateWorkerToolProfile];
const GRAPH_TOOL_IDS: string[] = [...codeGraphWorkerToolProfile];
const MELEE_WORKER_TOOL_IDS = [...STATIC_WORKER_TOOL_IDS, ...GRAPH_TOOL_IDS];
const SMS_WORKER_TOOL_IDS = [...STATIC_WORKER_TOOL_IDS, ...STEERING_TOOL_IDS, ...GRAPH_TOOL_IDS];

function gameMetadata(gameId: "melee" | "sms") {
  return { gameId, descriptorPath: resolve(packageRoot(), `games/${gameId}/game.json`) };
}
const MAP = [
  "Link map of __start",
  "  1] __start (func,weak) found in os.a __start.c",
  "   2] __vt__19TNerveHanaSamboHide (object,global) found in Enemy.a hanasambo.cpp",
  "    3] execute__19TNerveHanaSamboHideCFP24TSpineBase<10TLiveActor> (func,global) found in Enemy.a hanasambo.cpp",
  "     4] @3510 (object,local) found in Enemy.a hanasambo.cpp",
  "",
  ".text section layout",
  "  00000000 000294 802f44c4  4 execute__19TNerveHanaSamboHideCFP24TSpineBase<10TLiveActor> \tEnemy.a hanasambo.cpp",
  "  UNUSED   000064 ........ theNerve__19TNerveHanaSamboHideFv Enemy.a hanasambo.cpp",
  "",
].join("\n");

const createParams: SandboxCreateParams = {
  snapshot: "real-code-evidence-test",
  labels: { game_id: "sms", claim_id: "claim-1" },
  resources: { cpu: 2, memoryGiB: 4, diskGiB: 5 },
  ttlMinutes: 30,
};

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function write(root: string, path: string, text: string): void {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text);
}

/** A host checkout and state dir; the worker context's repoRoot stays a sandbox path. */
function hostFixture(options: { withMap?: boolean } = {}): { hostRepo: string; stateDir: string } {
  const base = mkdtempSync(join(tmpdir(), "real-code-evidence-"));
  tempDirs.push(base);
  const hostRepo = join(base, "host-checkout");
  const stateDir = join(base, "state");
  write(hostRepo, "config/GMSJ01/symbols.txt", "");
  if (options.withMap !== false) write(hostRepo, "orig/GMSJ01/files/mario.MAP", MAP);
  write(hostRepo, "libs/JSystem/include/JSystem/JGeometry/JGVec3.hpp", "namespace JGeometry {\ntemplate <> class TVec3<f32> {\npublic:\n\tvoid scale(f32 s) { x *= s; }\n};\n}\n");
  write(stateDir, "refs/jsystem/tww/include/JSystem/JParticle/JPAEmitter.h", "void setGlobalSRTMatrix(const MtxP mtx) {\n}\n");
  return { hostRepo, stateDir };
}

/** A worker context; `sandbox: false` is a host-side caller (no attached sandbox). */
async function workerContext(hostRepo: string, stateDir: string, options: { sandbox?: boolean } = {}) {
  const provider = new FakeSandboxProvider();
  const sandboxHandle = options.sandbox === false ? undefined : await provider.create(createParams);
  const context: AgentToolRuntimeContext = {
    role: "worker",
    cwd: SANDBOX_REPO,
    repoRoot: SANDBOX_REPO,
    hostRepoRoot: hostRepo,
    stateDir,
    game: {
      gameId: "sms",
      repoRoot: SANDBOX_REPO,
      stateDir,
      descriptorPath: resolve(packageRoot(), "games/sms/game.json"),
    },
    worktreeId: "claim-1",
    claimId: "claim-1",
    ...(sandboxHandle ? { sandboxHandle } : {}),
  };
  return { provider, context };
}

async function run(context: AgentToolRuntimeContext, params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const tool = realCodeEvidenceToolRegistration.create(context);
  const result = await tool.execute("call-1", params);
  const block = result.content[0] as { type: string; text: string };
  return JSON.parse(block.text) as Record<string, unknown>;
}

describe("real_code_evidence registered tool", () => {
  test("is registered, advertised to workers, and described", () => {
    expect(registeredToolIdsForContext({ game: { gameId: "sms", descriptorPath: resolve(packageRoot(), "games/sms/game.json") } }).has("real_code_evidence")).toBe(true);
    expect(capabilityToolRegistrations).toContain(realCodeEvidenceToolRegistration);
    expect(realCodeEvidenceToolRegistration.allowedRoles).toContain("worker");
    expect(capabilityToolPromptMetadata.real_code_evidence?.provider).toBe("real_code_evidence");
  });

  test("Melee workers get the static profile plus graph tools; steering-gate games (SMS) also get the steering tools", () => {
    // The steering tools are SMS-only and never part of the static list.
    expect(STEERING_TOOL_IDS).toEqual(["real_code_evidence", "unused_stub_test"]);
    expect(GRAPH_TOOL_IDS).toEqual(["graph_related_functions", "code_graph_file_card"]);
    for (const id of [...STEERING_TOOL_IDS, ...GRAPH_TOOL_IDS]) expect(STATIC_WORKER_TOOL_IDS).not.toContain(id);
    expect(workerAgent.coreTools).toEqual(STATIC_WORKER_TOOL_IDS);

    const melee = { role: "worker" as const, cwd: SANDBOX_REPO, repoRoot: SANDBOX_REPO, game: gameMetadata("melee") };
    const sms = { ...melee, game: gameMetadata("sms") };
    expect(resolveAgentToolIdsForContext(melee)).toEqual(MELEE_WORKER_TOOL_IDS);
    expect(resolveAgentToolIdsForContext(sms)).toEqual(SMS_WORKER_TOOL_IDS);
    // Built tools: the gated ones materialise (every id here has a registration).
    const meleeTools = buildAgentTools(melee).map((tool) => tool.name);
    const smsTools = buildAgentTools(sms).map((tool) => tool.name);
    for (const id of GRAPH_TOOL_IDS) expect(meleeTools).toContain(id);
    for (const id of STEERING_TOOL_IDS) expect(meleeTools).not.toContain(id);
    for (const id of [...STEERING_TOOL_IDS, ...GRAPH_TOOL_IDS]) expect(smsTools).toContain(id);
    expect(resolveAgentToolIdsForContext(sms, { disable: ["real_code_evidence"] })).toEqual(SMS_WORKER_TOOL_IDS.filter((id) => id !== "real_code_evidence"));
    expect(resolveAgentToolIdsForContext({ ...sms, role: "reconcile" })).not.toContain("real_code_evidence");

    // The kernel allowlist follows the same rule.
    const parsed = {
      config: { name: "worker", description: "", model: "m", tools: [...STATIC_WORKER_TOOL_IDS], disallowedTools: [], variables: {} },
      body: "",
    };
    const spawnTools = (game: ReturnType<typeof gameMetadata>) => parsedAgentForMeleeKernelSpawn(
      parsed as never,
      { role: "worker", toolContext: { game } } as unknown as PiRunOptions,
    ).config.tools ?? [];
    for (const id of STEERING_TOOL_IDS) {
      expect(spawnTools(gameMetadata("melee"))).not.toContain(id);
      expect(spawnTools(gameMetadata("sms"))).toContain(id);
    }
    for (const id of GRAPH_TOOL_IDS) expect(spawnTools(gameMetadata("melee"))).toContain(id);
  });

  test("without a sandbox, runs host-side against the host checkout when host and sandbox roots differ", async () => {
    const { hostRepo, stateDir } = hostFixture();
    const { provider, context } = await workerContext(hostRepo, stateDir, { sandbox: false });

    const calls = await run(context, { command: "map-calls", symbol: "TNerveHanaSamboHide::execute" });
    const parsed = calls.parsed as Record<string, unknown>;
    expect(calls.exit_code).toBe(0);
    expect(parsed.status).toBe("ok");
    expect(parsed.repo).toBe(hostRepo);
    expect(parsed.object).toBe("Enemy.a hanasambo.cpp");
    expect((parsed.callees as Array<{ name: string }>).map((callee) => callee.name)).toEqual(["@3510"]);
    expect((calls.resolved_tool as Record<string, unknown>).tool_id).toBe("real_code_evidence");

    const unit = (await run(context, { command: "map-unit", unit: "hanasambo" })).parsed as Record<string, unknown>;
    expect((unit.functions as Array<{ unused: boolean }>).map((fn) => fn.unused)).toEqual([false, true]);

    const inline = (await run(context, { command: "inlines", type: "JGeometry::TVec3", member: "scale" })).parsed as Record<string, unknown>;
    expect((inline.results as Array<{ name: string }>).map((row) => row.name)).toEqual(["TVec3<f32>::scale"]);

    const refs = (await run(context, { command: "jsystem", query: "setGlobalSRTMatrix", game: "tww" })).parsed as Record<string, unknown>;
    expect(refs.total).toBe(1);

    // Nothing ran inside the sandbox.
    expect(provider.execCalls).toHaveLength(0);
  });

  test("reports unavailable instead of failing when the map is missing", async () => {
    const { hostRepo, stateDir } = hostFixture({ withMap: false });
    const { context } = await workerContext(hostRepo, stateDir, { sandbox: false });
    const result = await run(context, { command: "map-calls", symbol: "anything" });
    expect(result.exit_code).toBe(0);
    expect((result.parsed as Record<string, unknown>).status).toBe("unavailable");
  });

  test("rejects calls missing the command's required parameter without running", async () => {
    const { hostRepo, stateDir } = hostFixture();
    const { context } = await workerContext(hostRepo, stateDir);
    expect(await run(context, { command: "map-calls" })).toMatchObject({ status: "missing_symbol" });
    expect(await run(context, { command: "grep", query: "x" })).toMatchObject({ status: "invalid_command" });
  });
});

describe("real_code_evidence in the worker sandbox", () => {
  /** Answers every sandbox exec: the refs probe from `refsPresent`, the tool run with a JSON payload. */
  function scriptSandbox(provider: FakeSandboxProvider, options: { refsPresent: boolean }) {
    for (let index = 0; index < 8; index += 1) {
      provider.scriptExec((call) => {
        if (call.command[0] === "test" && call.command[1] === "-d") return { exitCode: options.refsPresent ? 0 : 1, stdout: "", stderr: "" };
        if (call.command[0] === "test") return { exitCode: 0, stdout: "", stderr: "" };
        return { exitCode: 0, stdout: JSON.stringify({ status: "ok", surface: "sandbox" }), stderr: "" };
      });
    }
  }
  const toolRuns = (provider: FakeSandboxProvider) => provider.execCalls.filter((call) => call.command[0] === "bash");

  test("runs in the sandbox against the sandbox checkout, without the host repo root", async () => {
    const { hostRepo, stateDir } = hostFixture();
    const { provider, context } = await workerContext(hostRepo, stateDir);
    scriptSandbox(provider, { refsPresent: true });

    const result = await run(context, { command: "usage", inline: "TVec3::scale" });
    expect(result.parsed).toEqual({ status: "ok", surface: "sandbox" });
    expect((result.resolved_tool as Record<string, unknown>).execution_surface).toBe("sandbox_workspace");
    const [call] = toolRuns(provider);
    expect(call?.command.slice(4)).toEqual([
      "/opt/toolpacks/gamecube-decomp/research/real_code_evidence/api/real_code_evidence.py",
      "usage", "--inline", "TVec3::scale", "--json",
    ]);
    expect(call?.opts.cwd).toBe(SANDBOX_REPO);
    expect(call?.opts.env?.ORCH_GAME_REPO_ROOT).toBe(SANDBOX_REPO);
    expect(call?.opts.env).not.toHaveProperty("ORCH_GAME_HOST_REPO_ROOT");
    expect(JSON.stringify(call)).not.toContain(hostRepo);

    // compiler (and every other command) is routed as-is; /opt/mwcc is the tool's sandbox default.
    await run(context, { command: "compiler", query: "MaxDegree" });
    expect(toolRuns(provider)[1]?.command.slice(5)).toEqual(["compiler", "--query", "MaxDegree", "--json"]);
  });

  test("jsystem reads the image's refs, appending --refs-root", async () => {
    const { hostRepo, stateDir } = hostFixture();
    const { provider, context } = await workerContext(hostRepo, stateDir);
    scriptSandbox(provider, { refsPresent: true });

    await run(context, { command: "jsystem", query: "setGlobalSRTMatrix", game: "tww" });
    expect(provider.execCalls.find((call) => call.command[1] === "-d")?.command).toEqual(["test", "-d", "/opt/refs/jsystem"]);
    expect(toolRuns(provider)[0]?.command.slice(5)).toEqual([
      "jsystem", "--query", "setGlobalSRTMatrix", "--game", "tww", "--json", "--refs-root", "/opt/refs/jsystem",
    ]);
  });

  test("jsystem on an image without refs answers prerequisite-missing (no host run); other commands stay in the sandbox", async () => {
    const { hostRepo, stateDir } = hostFixture();
    const { provider, context } = await workerContext(hostRepo, stateDir);
    scriptSandbox(provider, { refsPresent: false });

    const refs = await run(context, { command: "jsystem", query: "setGlobalSRTMatrix", game: "tww" });
    expect(refs).toMatchObject({ status: "sandbox_prerequisite_missing", tool: "real_code_evidence", missing: "/opt/refs/jsystem" });
    expect(refs).not.toHaveProperty("parsed");
    expect(toolRuns(provider)).toHaveLength(0);

    await run(context, { command: "map-calls", symbol: "TNerveHanaSamboHide::execute" });
    expect(toolRuns(provider)).toHaveLength(1);
    // The refs probe ran once for this sandbox.
    expect(provider.execCalls.filter((call) => call.command[1] === "-d")).toHaveLength(1);
  });
});
