import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import { packageRoot } from "@server/core/knowledge/paths.js";
import { FakeSandboxProvider, type FakeSandboxExecCall, type SandboxCreateParams } from "@server/core/job-queue/sandbox.js";
import { capabilityToolPromptMetadata } from "../metadata/capabilities.js";
import { maxToolOutputCharacters } from "../runtime/results.js";
import { registeredToolIdsForContext, runRegisteredToolApi } from "../resolver.js";
import type { AgentToolRuntimeContext } from "../types.js";
import { capabilityToolRegistrations, unusedStubTestToolRegistration } from "./capabilities.js";
import { UNUSED_STUB_TEST_MAX_ROWS, unusedStubTestArgs } from "./unused-stub-test.js";

const SANDBOX_REPO = "/sandbox/workspace";
const SCRIPT = "/opt/toolpacks/gamecube-decomp/validation/steering_check/api/unused_test.py";

const createParams: SandboxCreateParams = {
  snapshot: "unused-stub-test",
  labels: { game_id: "sms", claim_id: "claim-1" },
  resources: { cpu: 2, memoryGiB: 4, diskGiB: 5 },
  ttlMinutes: 30,
};

function game(gameId: "melee" | "sms") {
  return { gameId, repoRoot: SANDBOX_REPO, descriptorPath: resolve(packageRoot(), `games/${gameId}/game.json`) };
}

function context(gameId: "melee" | "sms", extra: Partial<AgentToolRuntimeContext> = {}): AgentToolRuntimeContext {
  return { role: "worker", cwd: SANDBOX_REPO, repoRoot: SANDBOX_REPO, game: game(gameId), worktreeId: "claim-1", claimId: "claim-1", ...extra };
}

async function run(ctx: AgentToolRuntimeContext, params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const result = await unusedStubTestToolRegistration.create(ctx).execute("call-1", params);
  return JSON.parse((result.content[0] as { text: string }).text) as Record<string, unknown>;
}

/** steering_check unused-test --json output with more rows than the wrapper keeps. */
function cliPayload(): Record<string, unknown> {
  const row = (i: number) => ({ function: `f${i}`, before: { status: "match", match_percent: 100 }, after: { status: "nonmatch", match_percent: 50 } });
  return {
    tool: "steering_check",
    status: "inlined",
    file: "src/Enemy/chuuhana.cpp",
    function: "TChuuHana::rolling",
    map: { available: true, unused: true, mangled: ["rolling__9TChuuHanaFv"] },
    checks: [{
      unit: "Enemy/chuuhana",
      status: "inlined",
      line: 120,
      stub: "{ }",
      changed: Array.from({ length: 20 }, (_, i) => row(i)),
      callers: Array.from({ length: 3 }, (_, i) => ({ ...row(i), delta: -50 })),
      unit_inputs: Array.from({ length: 300 }, (_, i) => `include/h${i}.h`),
      unit_inputs_sha256: "a".repeat(64),
    }],
  };
}

describe("unused_stub_test", () => {
  test("is a registered worker-only tool backed by steering_check", () => {
    expect(capabilityToolRegistrations).toContain(unusedStubTestToolRegistration);
    expect(unusedStubTestToolRegistration.allowedRoles).toEqual(["worker"]);
    expect(unusedStubTestToolRegistration.capabilities).toEqual(["registered_tool_api", "steering_check"]);
    expect(registeredToolIdsForContext({ game: game("sms") }).has("steering_check")).toBe(true);
    expect(capabilityToolPromptMetadata.unused_stub_test?.provider).toBe("steering_check");
    const tool = unusedStubTestToolRegistration.create(context("sms"));
    expect((tool.parameters as { required: string[] }).required).toEqual(["file", "function"]);
  });

  test("maps parameters to the unused-test CLI with one job and a bounded compile timeout", () => {
    expect(unusedStubTestArgs({ file: "src/Enemy/chuuhana.cpp", function: "TChuuHana::rolling" }, context("sms"))).toEqual([
      "--repo", SANDBOX_REPO, "--file", "src/Enemy/chuuhana.cpp", "--function", "TChuuHana::rolling", "--jobs", "1", "--timeout-seconds", "180",
    ]);
    const args = unusedStubTestArgs({ file: "src/a.cpp", function: "T::f(int)", base_ref: "upstream/main~2", timeout_seconds: 5000 }, context("sms")) as string[];
    expect(args.slice(-4)).toEqual(["--timeout-seconds", "900", "--base-ref", "upstream/main~2"]);
    expect((unusedStubTestArgs({ file: "src/a.cpp", function: "f", timeout_seconds: 1 }, context("sms")) as string[]).at(-1)).toBe("30");
    // A slower sandbox profile scales the default, not the cap.
    expect((unusedStubTestArgs({ file: "src/a.cpp", function: "f" }, context("sms", { timeoutScale: 2 })) as string[]).at(-1)).toBe("360");
  });

  test("rejects missing or unsafe parameters without running", () => {
    expect(unusedStubTestArgs({ function: "f" }, context("sms"))).toEqual({ status: "missing_file" });
    expect(unusedStubTestArgs({ file: "src/a.cpp" }, context("sms"))).toEqual({ status: "missing_function" });
    for (const file of ["/etc/passwd", "../outside.cpp", "src/../../x.cpp", "--overlay-dir"]) {
      expect(unusedStubTestArgs({ file, function: "f" }, context("sms"))).toMatchObject({ status: "rejected_arguments" });
    }
    expect(unusedStubTestArgs({ file: "src/a.cpp", function: "--out" }, context("sms"))).toMatchObject({ status: "rejected_arguments" });
    expect(unusedStubTestArgs({ file: "src/a.cpp", function: "f", base_ref: "--all" }, context("sms"))).toMatchObject({ status: "rejected_arguments" });
    expect(unusedStubTestArgs({ file: "src/a.cpp", function: "f", base_ref: "HEAD; rm" }, context("sms"))).toMatchObject({ status: "rejected_arguments" });
  });

  test("is unavailable for games without an active steering gate (Melee)", async () => {
    const provider = new FakeSandboxProvider();
    const sandboxHandle = await provider.create(createParams);
    const result = await run(context("melee", { sandboxHandle }), { file: "src/melee/lb/lbmemory.c", function: "lbMemory_Init" });
    expect(result.status).toBe("unavailable");
    expect(provider.execCalls).toHaveLength(0);
  });

  test("runs in the worker sandbox with cwd = the sandbox checkout and bounds the result", async () => {
    const provider = new FakeSandboxProvider();
    const sandboxHandle = await provider.create(createParams);
    // The toolpack .ready probe may be cached per sandbox id, so answer by command.
    const answer = (call: FakeSandboxExecCall) => ({ exitCode: 0, stdout: call.command[0] === "bash" ? JSON.stringify(cliPayload()) : "", stderr: "" });
    provider.scriptExec(answer, answer);

    const result = await run(context("sms", { sandboxHandle }), { file: "src/Enemy/chuuhana.cpp", function: "TChuuHana::rolling" });

    const exec = provider.execCalls.find((call) => call.command[0] === "bash");
    expect(exec).toBeDefined();
    expect(exec!.opts.cwd).toBe(SANDBOX_REPO);
    expect(exec!.command.slice(3)).toEqual([
      "--", SCRIPT, "--repo", SANDBOX_REPO, "--file", "src/Enemy/chuuhana.cpp", "--function", "TChuuHana::rolling",
      "--jobs", "1", "--timeout-seconds", "180", "--json",
    ]);
    // Exec timeout follows --timeout-seconds (+180 s), as for other sandbox tools.
    expect(exec!.opts.timeoutMs).toBe(360_000);
    expect(exec!.opts.env?.ORCH_STEERING_GATE).toBe("enforce");
    expect((result.resolved_tool as Record<string, unknown>).execution_surface).toBe("sandbox_workspace");

    const parsed = result.parsed as Record<string, unknown>;
    expect(parsed.status).toBe("inlined");
    const [check] = parsed.checks as Array<Record<string, unknown>>;
    expect(check.changed as unknown[]).toHaveLength(UNUSED_STUB_TEST_MAX_ROWS);
    expect(check.changed_omitted).toBe(20 - UNUSED_STUB_TEST_MAX_ROWS);
    expect(check.callers as unknown[]).toHaveLength(3);
    expect(check.unit_inputs).toBeUndefined();
    expect(check.unit_inputs_count).toBe(300);
    expect(check.unit_inputs_sha256).toBe("a".repeat(64));
  });

  test("a result past the output cap stays valid JSON with the verdict and true omission counts", async () => {
    // Six overload checks with 12 changed functions and 12 callers each:
    // about 50k characters before bounding (impl review r1-C item 3).
    const row = (unit: number, i: number) => ({
      function: `TChuuHana::overloadedHelperWithALongName${i}(const JGeometry::TVec3<f32>&, int, TLiveActor*)`,
      mangled: `overloadedHelperWithALongName${i}__9TChuuHanaFRCQ29JGeometry8TVec3<f>iP10TLiveActor_${unit}`,
      before: { status: "match", match_percent: 100, size: 0x1f4 },
      after: { status: "nonmatch", match_percent: 41.25, size: 0x1f4 },
    });
    const check = (unit: number) => ({
      unit: "Enemy/chuuhana", status: "inlined", line: 100 + unit, stub: "{ }",
      changed: Array.from({ length: 12 }, (_, i) => row(unit, i)),
      callers: Array.from({ length: 12 }, (_, i) => ({ ...row(unit, i), delta: -58.75 })),
      unit_inputs_sha256: "a".repeat(64),
    });
    const cli = { tool: "steering_check", status: "inlined", file: "src/Enemy/chuuhana.cpp", function: "TChuuHana::rolling",
      map: { available: true, unused: true }, checks: Array.from({ length: 6 }, (_, unit) => check(unit)) };
    expect(JSON.stringify({ tool: "unused_stub_test", parsed: cli }, null, 2).length).toBeGreaterThan(maxToolOutputCharacters);

    const provider = new FakeSandboxProvider();
    const sandboxHandle = await provider.create(createParams);
    const answer = (call: FakeSandboxExecCall) => ({ exitCode: 0, stdout: call.command[0] === "bash" ? JSON.stringify(cli) : "", stderr: "" });
    provider.scriptExec(answer, answer);
    const response = await unusedStubTestToolRegistration.create(context("sms", { sandboxHandle }))
      .execute("call-1", { file: "src/Enemy/chuuhana.cpp", function: "TChuuHana::rolling" });
    const text = (response.content[0] as { text: string }).text;

    // The final serialized response, not an intermediate object.
    expect(text.length).toBeLessThanOrEqual(maxToolOutputCharacters);
    const result = JSON.parse(text) as Record<string, unknown>;
    expect(result.truncated).toBe(true);
    const parsed = result.parsed as Record<string, unknown>;
    expect(parsed.status).toBe("inlined");
    const checks = parsed.checks as Array<Record<string, unknown>>;
    expect(checks.length + Number(parsed.checks_omitted ?? 0)).toBe(6);
    for (const shown of checks) {
      expect(shown.status).toBe("inlined");
      for (const key of ["changed", "callers"]) {
        const rows = shown[key] as unknown[];
        expect(rows.length).toBeGreaterThan(0);
        expect(rows.length + Number(shown[`${key}_omitted`] ?? 0)).toBe(12);
        expect(shown[`${key}_total`]).toBeUndefined();
      }
    }
  });

  test("never runs on the host: without a sandbox it reports sandbox_required", async () => {
    let hostCalls = 0;
    const result = await runRegisteredToolApi(
      { game: game("sms"), repoRoot: "/host/checkout" },
      "steering_check",
      "unused_test.py",
      ["--repo", "/host/checkout", "--file", "src/a.cpp", "--function", "f", "--json"],
      { runCommand: async () => { hostCalls += 1; return { exitCode: 0, stdout: "{}", stderr: "" }; } },
    );
    expect(result.status).toBe("sandbox_required");
    expect(hostCalls).toBe(0);
  });
});
