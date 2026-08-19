import { describe, expect, test } from "bun:test";
import type { RunInputs } from "@server/core/shared/types";
import {
  buildRunningProcessCommand,
  runningProcessConfigurationConflicts,
  runningScheduling,
} from "./process-command.js";

function runInputs(configuration: Record<string, unknown> = {}): RunInputs {
  return {
    base_revision: "base-test",
    policy_revision: "policy-test",
    starting_knowledge_revision: "kg-test",
    configuration_snapshot: {
      agent_timeout_seconds: 1800,
      candidate_rerank: "priority",
      candidate_window: 64,
      desired_workers: 4,
      dry_run_agents: false,
      epoch_configure_command: "",
      epoch_size: { mode: "fixed", value: 64 },
      goal_kind: "matched_code_percent",
      goal_value: 100,
      integration_resolver_concurrency: 4,
      model: "gpt-5.6-sol",
      provider: "codex-lb",
      thinking_level: "xhigh",
      worker_configure_command: "",
      ...configuration,
    },
  };
}

describe("running process command", () => {
  test("derives worker count from requested workers", () => {
    expect(runningScheduling(8)).toEqual({
      maxWorkers: 8,
    });
  });

  test("returns a typed blocker for request options that conflict with the stored snapshot", () => {
    const inputs = runInputs({ desired_workers: 4, model: "gpt-5.6-sol" });

    expect(runningProcessConfigurationConflicts({ maxWorkers: 8, model: "gpt-5.5" }, inputs, "run-1"))
      .toEqual([
        expect.objectContaining({
          field: "maxWorkers",
          requested: 8,
          stored: 4,
          blocker: expect.objectContaining({ code: "run_configuration_conflict", source_id: "run-1" }),
        }),
        expect.objectContaining({ field: "model", requested: "gpt-5.5", stored: "gpt-5.6-sol" }),
      ]);
  });

  test("matches scalar request epoch size against the stored structured snapshot", () => {
    expect(runningProcessConfigurationConflicts({ epochSize: "64" }, runInputs(), "run-1")).toEqual([]);
  });

  test("builds the run-loop command owned by the running phase", () => {
    const plan = buildRunningProcessCommand({
      body: {
        maxWorkers: 4,
        provider: "codex-lb",
        model: "gpt-5.5",
        thinkingLevel: "medium",
        dryRunAgents: true,
      },
      graphDbPath: "/state/graph.sqlite",
      noRefillBatch: false,
      game: { gameId: "melee", processName: "melee-live", dashboard: { epochSize: "64", candidateWindow: "128", candidateRerank: "opseq_hot_lane" } },
      repoRoot: "/repo",
      runId: "run-1",
      runInputs: runInputs({
        candidate_rerank: "opseq_hot_lane",
        candidate_window: 128,
        dry_run_agents: true,
        model: "gpt-5.5",
        thinking_level: "medium",
      }),
      serverJobPath: "/orch/apps/server/src/job-runner.ts",
      stateDir: "/state",
    });

    expect(plan.name).toBe("melee-live");
    expect(plan.maxWorkers).toBe(4);
    expect(plan.command).toContain("run-loop");
    expect(plan.command).not.toContain("babysit");
    expect(plan.command).not.toContain("--force-recover-claims");
    expect(plan.command).toContain("--dry-run-agents");
    expect(plan.command).toContain("--run-id");
    expect(plan.command).toContain("run-1");
    expect(plan.command).toContain("--epoch-size");
    expect(plan.command).toContain("64");
    expect(plan.command.slice(plan.command.indexOf("--candidate-window"), plan.command.indexOf("--candidate-window") + 2)).toEqual([
      "--candidate-window",
      "128",
    ]);
    expect(plan.command.slice(plan.command.indexOf("--candidate-rerank"), plan.command.indexOf("--candidate-rerank") + 2)).toEqual([
      "--candidate-rerank",
      "opseq_hot_lane",
    ]);
    expect(plan.command.slice(plan.command.indexOf("--integration-resolver-concurrency"), plan.command.indexOf("--integration-resolver-concurrency") + 2)).toEqual([
      "--integration-resolver-concurrency",
      "4",
    ]);
    expect(plan.command).not.toContain("--candidate-limit");
    expect(plan.command).not.toContain("--queue-target-size");
    expect(plan.command).not.toContain("--epoch-ready-queue-size");
    expect(plan.command).not.toContain("--fast-kg-maintenance-interval-ms");
  });

  test("passes configured worker timeout to run-loop", () => {
    const plan = buildRunningProcessCommand({
      body: {
        agentTimeoutSeconds: 3000,
        maxWorkers: 4,
      },
      graphDbPath: "/state/graph.sqlite",
      noRefillBatch: false,
      game: { gameId: "melee", processName: "melee-live" },
      repoRoot: "/repo",
      runId: "run-1",
      runInputs: runInputs({ agent_timeout_seconds: 3000 }),
      serverJobPath: "/orch/apps/server/src/job-runner.ts",
      stateDir: "/state",
    });

    const timeoutFlag = plan.command.indexOf("--agent-timeout-seconds");
    expect(plan.command.slice(timeoutFlag, timeoutFlag + 2)).toEqual(["--agent-timeout-seconds", "3000"]);
    expect(plan.command).not.toContain("--ttl-seconds");
  });

  test("defaults worker thinking to xhigh", () => {
    const plan = buildRunningProcessCommand({
      body: {
        maxWorkers: 4,
      },
      graphDbPath: "/state/graph.sqlite",
      noRefillBatch: false,
      game: { gameId: "melee", processName: "melee-live" },
      repoRoot: "/repo",
      runId: "run-1",
      runInputs: runInputs(),
      serverJobPath: "/orch/apps/server/src/job-runner.ts",
      stateDir: "/state",
    });

    const thinkingFlag = plan.command.indexOf("--thinking-level");
    expect(plan.command.slice(thinkingFlag, thinkingFlag + 2)).toEqual(["--thinking-level", "xhigh"]);
  });

  test("forwards configure command overrides to run-loop", () => {
    const plan = buildRunningProcessCommand({
      body: {
        epochConfigureCommand: "python3 configure.py --require-protos --wrapper /state/tools/wibo",
        maxWorkers: 4,
        workerConfigureCommand: "python3 configure.py --require-protos --wrapper /state/tools/wibo",
      },
      graphDbPath: "/state/graph.sqlite",
      noRefillBatch: false,
      game: { gameId: "melee", processName: "melee-live" },
      repoRoot: "/repo",
      runId: "run-1",
      runInputs: runInputs({
        epoch_configure_command: "python3 configure.py --require-protos --wrapper /state/tools/wibo",
        worker_configure_command: "python3 configure.py --require-protos --wrapper /state/tools/wibo",
      }),
      serverJobPath: "/orch/apps/server/src/job-runner.ts",
      stateDir: "/state",
    });

    expect(plan.command.slice(plan.command.indexOf("--worker-configure-command"), plan.command.indexOf("--worker-configure-command") + 2)).toEqual([
      "--worker-configure-command",
      "python3 configure.py --require-protos --wrapper /state/tools/wibo",
    ]);
    expect(plan.command.slice(plan.command.indexOf("--epoch-configure-command"), plan.command.indexOf("--epoch-configure-command") + 2)).toEqual([
      "--epoch-configure-command",
      "python3 configure.py --require-protos --wrapper /state/tools/wibo",
    ]);
  });

  test("forwards candidate window and rerank while ignoring deprecated queue overrides", () => {
    const plan = buildRunningProcessCommand({
      body: {
        candidateWindow: 256,
        candidateRerank: "opseq-hot-lane",
        epochReadyQueueSize: 64,
        maxWorkers: 64,
        queueLowWatermark: 64,
        queueTargetSize: 64,
      } as Record<string, unknown>,
      graphDbPath: "/state/graph.sqlite",
      noRefillBatch: false,
      game: { gameId: "melee", processName: "melee-live" },
      repoRoot: "/repo",
      runId: "run-1",
      runInputs: runInputs({ candidate_rerank: "opseq_hot_lane", candidate_window: 256, desired_workers: 64 }),
      serverJobPath: "/orch/apps/server/src/job-runner.ts",
      stateDir: "/state",
    });

    expect(plan.command).not.toContain("--queue-target-size");
    expect(plan.command).not.toContain("--queue-low-watermark");
    expect(plan.command).not.toContain("--epoch-ready-queue-size");
    expect(plan.command.slice(plan.command.indexOf("--candidate-window"), plan.command.indexOf("--candidate-window") + 2)).toEqual([
      "--candidate-window",
      "256",
    ]);
    expect(plan.command.slice(plan.command.indexOf("--candidate-rerank"), plan.command.indexOf("--candidate-rerank") + 2)).toEqual([
      "--candidate-rerank",
      "opseq_hot_lane",
    ]);
  });

  test("uses game dashboard worker timeout default", () => {
    const plan = buildRunningProcessCommand({
      body: {
        maxWorkers: 4,
      },
      graphDbPath: "/state/graph.sqlite",
      noRefillBatch: false,
      game: { gameId: "melee", processName: "melee-live", dashboard: { agentTimeoutSeconds: 2400 } },
      repoRoot: "/repo",
      runId: "run-1",
      runInputs: runInputs({ agent_timeout_seconds: 2400 }),
      serverJobPath: "/orch/apps/server/src/job-runner.ts",
      stateDir: "/state",
    });

    const timeoutFlag = plan.command.indexOf("--agent-timeout-seconds");
    expect(plan.command.slice(timeoutFlag, timeoutFlag + 2)).toEqual(["--agent-timeout-seconds", "2400"]);
    expect(plan.command).not.toContain("--ttl-seconds");
  });

  test("forwards configured integration resolver concurrency to run-loop", () => {
    const plan = buildRunningProcessCommand({
      body: {
        integrationResolverConcurrency: 8,
        maxWorkers: 4,
      },
      graphDbPath: "/state/graph.sqlite",
      noRefillBatch: false,
      game: { gameId: "melee", processName: "melee-live", dashboard: { integrationResolverConcurrency: 2 } },
      repoRoot: "/repo",
      runId: "run-1",
      runInputs: runInputs({ integration_resolver_concurrency: 8 }),
      serverJobPath: "/orch/apps/server/src/job-runner.ts",
      stateDir: "/state",
    });

    const resolverFlag = plan.command.indexOf("--integration-resolver-concurrency");
    expect(plan.command.slice(resolverFlag, resolverFlag + 2)).toEqual(["--integration-resolver-concurrency", "8"]);
  });

  test("uses no-refill mode for never-run repair batches", () => {
    const plan = buildRunningProcessCommand({
      body: { maxWorkers: 4 },
      graphDbPath: "/state/graph.sqlite",
      noRefillBatch: true,
      game: { gameId: "melee" },
      repoRoot: "/repo",
      runId: "run-1",
      runInputs: runInputs(),
      serverJobPath: "/orch/apps/server/src/job-runner.ts",
      stateDir: "/state",
    });

    expect(plan.command).toContain("--no-epoch-cycle");
    expect(plan.command).toContain("--no-blocked-queue-replan");
    const timeoutFlag = plan.command.indexOf("--agent-timeout-seconds");
    expect(plan.command.slice(timeoutFlag, timeoutFlag + 2)).toEqual(["--agent-timeout-seconds", "1800"]);
    expect(plan.command).not.toContain("--ttl-seconds");
  });
});
