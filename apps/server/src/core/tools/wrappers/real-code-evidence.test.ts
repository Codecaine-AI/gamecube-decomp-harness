import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { packageRoot } from "@server/core/knowledge/paths.js";
import { FakeSandboxProvider, type SandboxCreateParams } from "@server/core/job-queue/sandbox.js";
import { agent as workerAgent } from "@server/core/agent-catalog/agents/running/worker/agent.js";
import { parsedAgentForMeleeKernelSpawn } from "@server/infrastructure/kernel/bridge/spawn-agent.js";
import type { PiRunOptions } from "@server/infrastructure/agent-runtime/runtime";
import { defaultWorkerToolProfile } from "../profiles/defaults.js";
import { buildAgentTools, resolveAgentToolIdsForContext } from "../profiles/index.js";
import { capabilityToolPromptMetadata } from "../metadata/capabilities.js";
import { registeredToolIdsForContext } from "../resolver.js";
import type { AgentToolRuntimeContext } from "../types.js";
import { capabilityToolRegistrations, realCodeEvidenceToolRegistration } from "./capabilities.js";

const SANDBOX_REPO = "/sandbox/workspace";

/** The worker tool ids at HEAD before real_code_evidence existed; Melee must keep exactly these. */
const HEAD_WORKER_TOOL_IDS = [
  "request_write_set_widening", "knowledge_render_file", "knowledge_record", "pr_search", "discord_search",
  "wiki_search", "attempt_search", "resolve_locator", "mwcc_debug_lookup", "checkdiff_run", "checkdiff_summary",
  "direct_compile_tu", "objdiff_score_candidate", "mwcc_debug_dump_function", "mwcc_debug_diagnose_stack",
  "mwcc_debug_diagnose_regflow", "mwcc_debug_diagnose_inlines", "mwcc_alloc_snapshot", "mwcc_alloc_compare",
  "mwcc_alloc_analyze", "source_permuter_run", "source_permuter_replay", "source_mutation_preview",
  "type_oracle_lookup", "m2c_decompile", "asm_window_search", "type_layout_lookup", "review_lint_scan",
  "review_lint_sdata2_order_helper",
];

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

async function workerContext(hostRepo: string, stateDir: string) {
  const provider = new FakeSandboxProvider();
  const sandboxHandle = await provider.create(createParams);
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
    sandboxHandle,
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

  test("Melee workers keep the HEAD tool list; steering-gate games (SMS) add real_code_evidence", () => {
    // Static lists are game-independent and unchanged.
    expect([...defaultWorkerToolProfile] as string[]).toEqual(HEAD_WORKER_TOOL_IDS);
    expect(workerAgent.coreTools).toEqual(HEAD_WORKER_TOOL_IDS);

    const melee = { role: "worker" as const, cwd: SANDBOX_REPO, repoRoot: SANDBOX_REPO, game: gameMetadata("melee") };
    const sms = { ...melee, game: gameMetadata("sms") };
    expect(resolveAgentToolIdsForContext(melee)).toEqual(HEAD_WORKER_TOOL_IDS);
    expect(buildAgentTools(melee).map((tool) => tool.name)).not.toContain("real_code_evidence");
    expect(resolveAgentToolIdsForContext(sms)).toEqual([...HEAD_WORKER_TOOL_IDS, "real_code_evidence"]);
    expect(buildAgentTools(sms).map((tool) => tool.name)).toContain("real_code_evidence");
    expect(resolveAgentToolIdsForContext(sms, { disable: ["real_code_evidence"] })).toEqual(HEAD_WORKER_TOOL_IDS);
    expect(resolveAgentToolIdsForContext({ ...sms, role: "reconcile" })).not.toContain("real_code_evidence");

    // The kernel allowlist follows the same rule.
    const parsed = {
      config: { name: "worker", description: "", model: "m", tools: [...HEAD_WORKER_TOOL_IDS], disallowedTools: [], variables: {} },
      body: "",
    };
    const spawnTools = (game: ReturnType<typeof gameMetadata>) => parsedAgentForMeleeKernelSpawn(
      parsed as never,
      { role: "worker", toolContext: { game } } as unknown as PiRunOptions,
    ).config.tools ?? [];
    expect(spawnTools(gameMetadata("melee"))).not.toContain("real_code_evidence");
    expect(spawnTools(gameMetadata("sms"))).toContain("real_code_evidence");
  });

  test("runs host-side against the host checkout when host and sandbox roots differ", async () => {
    const { hostRepo, stateDir } = hostFixture();
    const { provider, context } = await workerContext(hostRepo, stateDir);

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
    const { context } = await workerContext(hostRepo, stateDir);
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
