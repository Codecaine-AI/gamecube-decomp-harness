import { describe, expect, test } from "bun:test";
import { buildRunningProcessCommand, runningScheduling } from "./process-command.js";

describe("running process command", () => {
  test("derives worker count from requested workers", () => {
    expect(runningScheduling(8)).toEqual({
      maxWorkers: 8,
    });
  });

  test("builds the babysit command owned by the running phase", () => {
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
      project: { projectId: "melee", processName: "melee-live", dashboard: { epochSize: "64", candidateWindow: "128", candidateRerank: "opseq_hot_lane" } },
      repoRoot: "/repo",
      runId: "run-1",
      serverJobPath: "/orch/apps/server/src/job-runner.ts",
      stateDir: "/state",
    });

    expect(plan.name).toBe("melee-live");
    expect(plan.maxWorkers).toBe(4);
    expect(plan.command).toContain("babysit");
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

  test("passes configured worker timeout to babysit", () => {
    const plan = buildRunningProcessCommand({
      body: {
        agentTimeoutSeconds: 3000,
        maxWorkers: 4,
      },
      graphDbPath: "/state/graph.sqlite",
      noRefillBatch: false,
      project: { projectId: "melee", processName: "melee-live" },
      repoRoot: "/repo",
      runId: "run-1",
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
      project: { projectId: "melee", processName: "melee-live" },
      repoRoot: "/repo",
      runId: "run-1",
      serverJobPath: "/orch/apps/server/src/job-runner.ts",
      stateDir: "/state",
    });

    const thinkingFlag = plan.command.indexOf("--thinking-level");
    expect(plan.command.slice(thinkingFlag, thinkingFlag + 2)).toEqual(["--thinking-level", "xhigh"]);
  });

  test("forwards configure command overrides to babysit", () => {
    const plan = buildRunningProcessCommand({
      body: {
        epochConfigureCommand: "python3 configure.py --require-protos --wrapper /state/tools/wibo",
        maxWorkers: 4,
        workerConfigureCommand: "python3 configure.py --require-protos --wrapper /state/tools/wibo",
      },
      graphDbPath: "/state/graph.sqlite",
      noRefillBatch: false,
      project: { projectId: "melee", processName: "melee-live" },
      repoRoot: "/repo",
      runId: "run-1",
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
      project: { projectId: "melee", processName: "melee-live" },
      repoRoot: "/repo",
      runId: "run-1",
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

  test("uses project dashboard worker timeout default", () => {
    const plan = buildRunningProcessCommand({
      body: {
        maxWorkers: 4,
      },
      graphDbPath: "/state/graph.sqlite",
      noRefillBatch: false,
      project: { projectId: "melee", processName: "melee-live", dashboard: { agentTimeoutSeconds: 2400 } },
      repoRoot: "/repo",
      runId: "run-1",
      serverJobPath: "/orch/apps/server/src/job-runner.ts",
      stateDir: "/state",
    });

    const timeoutFlag = plan.command.indexOf("--agent-timeout-seconds");
    expect(plan.command.slice(timeoutFlag, timeoutFlag + 2)).toEqual(["--agent-timeout-seconds", "2400"]);
    expect(plan.command).not.toContain("--ttl-seconds");
  });

  test("forwards configured integration resolver concurrency to babysit", () => {
    const plan = buildRunningProcessCommand({
      body: {
        integrationResolverConcurrency: 8,
        maxWorkers: 4,
      },
      graphDbPath: "/state/graph.sqlite",
      noRefillBatch: false,
      project: { projectId: "melee", processName: "melee-live", dashboard: { integrationResolverConcurrency: 2 } },
      repoRoot: "/repo",
      runId: "run-1",
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
      project: { projectId: "melee" },
      repoRoot: "/repo",
      runId: "run-1",
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
