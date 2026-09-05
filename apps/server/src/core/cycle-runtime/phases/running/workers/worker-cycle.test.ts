import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { QA_LINT_REPAIR_INSTRUCTION, type WorkerChangeValidation, type WorkerQaLint } from "@server/core/agent-catalog/agents/running/worker/change-validation";
import type { QaScanFinding } from "@server/core/validation/qa";
import type { PiRunResult } from "@server/core/shared/types";
import { FakeSandboxProvider } from "@server/core/job-queue/sandbox.js";
import {
  classifyOutOfWriteSetPath,
  classifyWorkerError,
  collectOutOfWriteSetChanges,
  buildRepairRequestInlineArtifacts,
  isReworkErrorKind,
  isRetryableWorkerPiSessionFailure,
  isWorkerPiContextLengthFailure,
  isWorkerSessionTimeoutFailure,
  shouldRunRunnerValidationForWorkerSession,
  WORKER_ATTEMPT_BUDGET_POLICY,
  WORKER_PI_CONTEXT_RETRY_POLICY,
  WORKER_PI_SESSION_RETRY_POLICY,
  workerContinuationDecision,
  workerAgentToolEnvironment,
  outOfWriteSetCategoryCounts,
  outOfWriteSetRepairReason,
  workerAttemptRepairReasons,
  workerPiContextRetryDecision,
  workerPiSessionRetryDecision,
  workerFacingRepairRequest,
  probeExistingWorkerCanonicalToolPaths,
  WORKER_CANONICAL_TOOL_PATH_PROBE_TIMEOUT_MS,
  REPAIR_REQUEST_DIFF_INLINE_LIMIT,
  REPAIR_REQUEST_OUTPUT_TAIL_LIMIT,
} from "@server/core/cycle-runtime/phases/running/workers/worker-cycle.js";

function finding(overrides: Partial<QaScanFinding> = {}): QaScanFinding {
  return {
    rule_id: "packed_string_blob",
    severity: "error",
    file: "src/melee/mn/mncount.c",
    line: 782,
    excerpt: 'static char lbl_803EE888[0x18] = "a\\0b";',
    message: "hand-packed string blob",
    standard_id: "global_standard:literals-and-data-ownership",
    ...overrides,
  };
}

function violationsQaLint(findings: QaScanFinding[] = [finding()]): WorkerQaLint {
  return { status: "violations", exitCode: 1, findings, scanPath: "/tmp/attempt-0.qa_diff.patch", toolError: null };
}

function warningsQaLint(findings: QaScanFinding[] = [finding({ severity: "warning" })]): WorkerQaLint {
  return { status: "warnings", exitCode: 2, findings, scanPath: "/tmp/attempt-0.qa_diff.patch", toolError: null };
}

function piResult(): PiRunResult {
  return {
    sessionId: "cycle-1",
    outputPath: "/tmp/worker.out",
    systemPromptPath: "/tmp/worker.system.md",
    userPromptPath: "/tmp/worker.user.md",
    rawText: "{}",
    dryRun: false,
  };
}

function continuationCheckpoint(
  attemptIndex: number,
  overrides: Partial<{ exactMatch: boolean; hardGatesPassed: boolean; selectable: boolean; newScore: number | null }> = {},
) {
  return {
    attemptIndex,
    exactMatch: false,
    hardGatesPassed: false,
    selectable: false,
    newScore: null,
    ...overrides,
  };
}

function rejectedValidation(qaLint: WorkerQaLint): WorkerChangeValidation {
  // What applyQaLintToValidation produces from a score-improving attempt with violations.
  return {
    status: "failed",
    reasons: [`qa lint found 1 QA finding(s) requiring repair (gate exit ${qaLint.exitCode ?? "unknown"})`],
    target: { unit: "melee/mn/mncount.c", symbol: "mnCount_803EE888", before: 80, after: 99.999999, improved: true, exact: true },
    qaLint,
  };
}

function passedValidation(qaLint: WorkerQaLint | null): WorkerChangeValidation {
  return {
    status: "passed",
    reasons: [],
    target: { unit: "melee/mn/mncount.c", symbol: "mnCount_803EE888", before: 80, after: 99.999999, improved: true, exact: true },
    qaLint,
  };
}

describe("buildRepairRequestInlineArtifacts", () => {
  test("inlines small return-gate, diff, and agent output files", async () => {
    expect(REPAIR_REQUEST_DIFF_INLINE_LIMIT).toBe(30_000);
    expect(REPAIR_REQUEST_OUTPUT_TAIL_LIMIT).toBe(10_000);
    const dir = await mkdtemp(join(tmpdir(), "worker-repair-inline-"));
    const returnGatePath = join(dir, "return-gate.json");
    const postAttemptDiffPath = join(dir, "post-attempt.diff");
    const agentOutputPath = join(dir, "agent-output.txt");
    await writeFile(returnGatePath, JSON.stringify({ status: "failed", reasons: ["lint"] }));
    await writeFile(postAttemptDiffPath, "diff --git a/file.c b/file.c\n");
    await writeFile(agentOutputPath, "agent output\n");

    const artifacts = await buildRepairRequestInlineArtifacts({ agentOutputPath, returnGatePath, postAttemptDiffPath });

    expect(artifacts.previous_return_gate).toEqual({ status: "failed", reasons: ["lint"] });
    expect(artifacts.previous_post_attempt_diff).toBe("diff --git a/file.c b/file.c\n");
    expect(artifacts.previous_agent_output_tail).toBe("agent output\n");
  });

  test("keeps the first 30000 diff characters and appends the original length", async () => {
    const dir = await mkdtemp(join(tmpdir(), "worker-repair-inline-"));
    const postAttemptDiffPath = join(dir, "post-attempt.diff");
    const diff = `${"a".repeat(REPAIR_REQUEST_DIFF_INLINE_LIMIT)}truncated`;
    await writeFile(postAttemptDiffPath, diff);

    const artifacts = await buildRepairRequestInlineArtifacts({
      agentOutputPath: join(dir, "missing-output"),
      returnGatePath: join(dir, "missing-gate"),
      postAttemptDiffPath,
    });
    const inlined = artifacts.previous_post_attempt_diff as string;

    expect(inlined.startsWith(diff.slice(0, REPAIR_REQUEST_DIFF_INLINE_LIMIT))).toBe(true);
    expect(inlined.endsWith(`[truncated: showing first 30000 of ${diff.length} characters]`)).toBe(true);
    expect(inlined.slice(0, inlined.indexOf("\n[truncated:"))).toHaveLength(REPAIR_REQUEST_DIFF_INLINE_LIMIT);
  });

  test("keeps the last 10000 agent-output characters and prefixes the original length", async () => {
    const dir = await mkdtemp(join(tmpdir(), "worker-repair-inline-"));
    const agentOutputPath = join(dir, "agent-output.txt");
    const output = `truncated${"z".repeat(REPAIR_REQUEST_OUTPUT_TAIL_LIMIT)}`;
    await writeFile(agentOutputPath, output);

    const artifacts = await buildRepairRequestInlineArtifacts({
      agentOutputPath,
      returnGatePath: join(dir, "missing-gate"),
      postAttemptDiffPath: join(dir, "missing-diff"),
    });
    const inlined = artifacts.previous_agent_output_tail as string;

    expect(inlined.startsWith(`[truncated: showing last 10000 of ${output.length} characters]\n`)).toBe(true);
    expect(inlined.endsWith(output.slice(-REPAIR_REQUEST_OUTPUT_TAIL_LIMIT))).toBe(true);
  });

  test("omits each missing artifact without affecting files that are present", async () => {
    const dir = await mkdtemp(join(tmpdir(), "worker-repair-inline-"));
    const returnGatePath = join(dir, "return-gate.json");
    const postAttemptDiffPath = join(dir, "post-attempt.diff");
    const agentOutputPath = join(dir, "agent-output.txt");
    await writeFile(returnGatePath, JSON.stringify({ status: "failed" }));
    await writeFile(postAttemptDiffPath, "diff");
    await writeFile(agentOutputPath, "output");

    const cases = [
      { missing: "previous_return_gate", paths: { agentOutputPath, returnGatePath: join(dir, "missing-gate"), postAttemptDiffPath } },
      { missing: "previous_post_attempt_diff", paths: { agentOutputPath, returnGatePath, postAttemptDiffPath: join(dir, "missing-diff") } },
      { missing: "previous_agent_output_tail", paths: { agentOutputPath: join(dir, "missing-output"), returnGatePath, postAttemptDiffPath } },
    ];

    for (const { missing, paths } of cases) {
      const artifacts = await buildRepairRequestInlineArtifacts(paths);
      expect(artifacts).not.toHaveProperty(missing);
      expect(Object.keys(artifacts)).toHaveLength(2);
    }
  });

  test("omits invalid return-gate JSON while retaining the other artifacts", async () => {
    const dir = await mkdtemp(join(tmpdir(), "worker-repair-inline-"));
    const returnGatePath = join(dir, "return-gate.json");
    const postAttemptDiffPath = join(dir, "post-attempt.diff");
    const agentOutputPath = join(dir, "agent-output.txt");
    await writeFile(returnGatePath, "not json");
    await writeFile(postAttemptDiffPath, "diff");
    await writeFile(agentOutputPath, "output");

    const artifacts = await buildRepairRequestInlineArtifacts({ agentOutputPath, returnGatePath, postAttemptDiffPath });

    expect(artifacts).not.toHaveProperty("previous_return_gate");
    expect(artifacts.previous_post_attempt_diff).toBe("diff");
    expect(artifacts.previous_agent_output_tail).toBe("output");
  });
});

describe("workerFacingRepairRequest", () => {
  test("removes attempt-budget metadata and host audit paths from the worker packet", () => {
    const request = workerFacingRepairRequest({
      attempt: 4,
      continuation_policy: { attemptBudget: 7, humanAttempt: 4 },
      paths_note: "host paths",
      previous_agent_output_path: "/tmp/attempt-3.output",
      previous_return_gate_path: "/tmp/attempt-3.return_gate.json",
      previous_post_attempt_diff_path: "/tmp/attempt-3.diff",
      previous_return_gate: {
        attempt_index: 3,
        agent_output_path: "/tmp/attempt-3.output",
        repair_policy: { base_attempts: 5, bonus_attempts_per_improvement: 2 },
        repair_reasons: ["lint"],
      },
      reasons: ["lint"],
      instruction: "Repair the lint failure.",
    });

    expect(request).toEqual({
      previous_return_gate: { repair_reasons: ["lint"] },
      reasons: ["lint"],
      instruction: "Repair the lint failure.",
    });
  });
});

describe("worker shell tool environment", () => {
  test("uses only sandbox tool and standard Linux paths", () => {
    const env = workerAgentToolEnvironment({ workerRepoRoot: "/workspace/melee" });

    expect(env.PATH.split(delimiter)).toEqual([
      "/workspace/melee/build/binutils",
      "/workspace/melee/build/tools",
      "/usr/local/sbin",
      "/usr/local/bin",
      "/usr/sbin",
      "/usr/bin",
      "/sbin",
      "/bin",
    ]);
    expect(env.ORCH_REAL_FIND).toBe("/usr/bin/find");
    expect(env.ORCH_WORKER_TOOL_POWERPC_EABI_OBJDUMP).toBe("build/binutils/powerpc-eabi-objdump");
    expect(env.ORCH_WORKER_TOOL_DTK).toBe("build/tools/dtk");
    expect(env.ORCH_WORKER_CANONICAL_TOOL_PATHS).toContain("powerpc-eabi-objdump");
  });
});

describe("canonical worker tool path probe", () => {
  test("issues one batched sandbox exec and parses the existing relative paths", async () => {
    const provider = new FakeSandboxProvider().scriptExec({
      exitCode: 0,
      stdout: [
        "build/binutils/powerpc-eabi-objdump",
        "build/tools/dtk",
        "not-a-canonical-path",
        "",
      ].join("\n"),
      stderr: "",
    });
    const sandbox = await provider.create({
      snapshot: "worker-test",
      labels: {},
      resources: { cpu: 1, memoryGiB: 1, diskGiB: 1 },
      ttlMinutes: 5,
    });

    const existing = await probeExistingWorkerCanonicalToolPaths(sandbox, "/opt/melee");

    expect([...existing]).toEqual([
      "build/binutils/powerpc-eabi-objdump",
      "build/tools/dtk",
    ]);
    expect(provider.execCalls).toHaveLength(1);
    expect(provider.execCalls[0].command.slice(0, 4)).toEqual([
      "bash",
      "-lc",
      'for path in "$@"; do if test -e "$path"; then printf \'%s\\n\' "$path"; fi; done',
      "--",
    ]);
    expect(provider.execCalls[0].command.slice(4)).toEqual([
      "build/binutils/powerpc-eabi-objdump",
      "build/binutils/powerpc-eabi-nm",
      "build/binutils/powerpc-eabi-readelf",
      "build/tools/dtk",
      "build/tools/objdiff-cli",
      "build/tools/sjiswrap.exe",
      "build/tools/wibo",
      "build/binutils",
      "build/tools",
      "build/compilers",
    ]);
    expect(provider.execCalls[0].opts).toEqual({
      cwd: "/opt/melee",
      env: undefined,
      timeoutMs: WORKER_CANONICAL_TOOL_PATH_PROBE_TIMEOUT_MS,
    });
  });
});

describe("workerAttemptRepairReasons", () => {
  test("violations append one verbatim qa_lint_finding reason per finding plus the instruction", () => {
    const validation = rejectedValidation(violationsQaLint());
    const reasons = workerAttemptRepairReasons({ runnerValidation: validation });
    expect(reasons).toContain(
      'qa_lint_finding: error packed_string_blob at src/melee/mn/mncount.c:782 — hand-packed string blob [standard: global_standard:literals-and-data-ownership] excerpt: static char lbl_803EE888[0x18] = "a\\0b";',
    );
    expect(reasons[reasons.length - 1]).toBe(QA_LINT_REPAIR_INSTRUCTION);
    // The runner-validation summary reason also rides along (status is failed).
    expect(reasons.some((reason) => reason.startsWith("runner validation: qa lint found"))).toBe(true);
  });

  test("warnings append repair reasons too", () => {
    const validation = rejectedValidation(warningsQaLint());
    const reasons = workerAttemptRepairReasons({ runnerValidation: validation });
    expect(reasons).toContain(
      'qa_lint_finding: warning packed_string_blob at src/melee/mn/mncount.c:782 — hand-packed string blob [standard: global_standard:literals-and-data-ownership] excerpt: static char lbl_803EE888[0x18] = "a\\0b";',
    );
    expect(reasons[reasons.length - 1]).toBe(QA_LINT_REPAIR_INSTRUCTION);
  });

  test("tool_unavailable contributes no rejection reasons: a passed attempt stays accepted", () => {
    const qaLint: WorkerQaLint = { status: "tool_unavailable", exitCode: -1, findings: [], scanPath: null, toolError: "scan_diff.py not found" };
    const reasons = workerAttemptRepairReasons({ runnerValidation: passedValidation(qaLint) });
    expect(reasons).toEqual([]);
  });

  test("clean qaLint on a passed attempt yields no repair reasons", () => {
    const qaLint: WorkerQaLint = { status: "clean", exitCode: 0, findings: [], scanPath: null, toolError: null };
    expect(workerAttemptRepairReasons({ runnerValidation: passedValidation(qaLint) })).toEqual([]);
  });

  test("skipped runner validation does not request repair for a changed diff", () => {
    const validation: WorkerChangeValidation = {
      status: "skipped",
      reasons: ["worker cycle failed before runner validation"],
      qaLint: null,
    };
    expect(workerAttemptRepairReasons({ runnerValidation: validation })).toEqual([]);
  });
});

describe("out-of-write-set change detection", () => {
  test("classifies paths into owning-header, config-metadata, foreign-source, and other", () => {
    expect(classifyOutOfWriteSetPath("src/melee/ft/chara/ftCommon/types.h")).toBe("owning-header");
    expect(classifyOutOfWriteSetPath("config/GALE01/symbols.txt")).toBe("config-metadata");
    expect(classifyOutOfWriteSetPath("config/GALE01/splits.txt")).toBe("config-metadata");
    expect(classifyOutOfWriteSetPath("src/melee/gr/ground.c")).toBe("foreign-source");
    expect(classifyOutOfWriteSetPath("Makefile")).toBe("other");
  });

  test("collects only new tracked changes outside the write set", () => {
    const changes = collectOutOfWriteSetChanges({
      changedPaths: [
        "src/melee/ft/ftcoll.c", // write set
        "src/melee/ft/ftcoll.h",
        "config/GALE01/symbols.txt",
        "src/melee/gr/ground.c",
        "build/report.json", // pre-attempt modification (seeded artifact)
      ],
      preAttemptChangedPaths: ["build/report.json"],
      writeSet: ["src/melee/ft/ftcoll.c"],
    });
    expect(changes).toEqual([
      { path: "src/melee/ft/ftcoll.h", category: "owning-header" },
      { path: "config/GALE01/symbols.txt", category: "config-metadata" },
      { path: "src/melee/gr/ground.c", category: "foreign-source" },
    ]);
    expect(outOfWriteSetCategoryCounts(changes)).toEqual({
      "owning-header": 1,
      "config-metadata": 1,
      "foreign-source": 1,
      other: 0,
    });
  });

  test("no out-of-set edits yields an empty list and no repair reason", () => {
    const changes = collectOutOfWriteSetChanges({
      changedPaths: ["src/melee/ft/ftcoll.c"],
      preAttemptChangedPaths: [],
      writeSet: ["src/melee/ft/ftcoll.c"],
    });
    expect(changes).toEqual([]);
    expect(outOfWriteSetRepairReason(changes)).toBeNull();
    expect(workerAttemptRepairReasons({ runnerValidation: passedValidation(null), outOfWriteSetChanges: changes })).toEqual([]);
  });

  test("out-of-set edits produce one repair reason naming the dropped paths and categories", () => {
    const changes = collectOutOfWriteSetChanges({
      changedPaths: ["src/melee/ft/ftcoll.c", "src/melee/ft/ftcoll.h", "config/GALE01/symbols.txt"],
      preAttemptChangedPaths: [],
      writeSet: ["src/melee/ft/ftcoll.c"],
    });
    const reasons = workerAttemptRepairReasons({ runnerValidation: passedValidation(null), outOfWriteSetChanges: changes });
    expect(reasons).toHaveLength(1);
    expect(reasons[0].startsWith("out_of_write_set_edit:")).toBe(true);
    expect(reasons[0]).toContain("src/melee/ft/ftcoll.h (owning-header)");
    expect(reasons[0]).toContain("config/GALE01/symbols.txt (config-metadata)");
    expect(reasons[0]).toContain("dropped at patch capture");
    expect(reasons[0]).toContain('state "exact requires cross-file edit to <path>" in your note\'s blockers');
  });

  test("the out-of-set reason rides with QA lint reasons and keeps the standing instruction last", () => {
    const validation = rejectedValidation(violationsQaLint());
    const changes = [{ path: "src/melee/ft/ftcoll.h", category: "owning-header" as const }];
    const reasons = workerAttemptRepairReasons({ runnerValidation: validation, outOfWriteSetChanges: changes });
    expect(reasons.some((reason) => reason.startsWith("out_of_write_set_edit:"))).toBe(true);
    expect(reasons[reasons.length - 1]).toBe(QA_LINT_REPAIR_INSTRUCTION);
  });
});

describe("shouldRunRunnerValidationForWorkerSession", () => {
  test("runs validation for returned worker cycles regardless of agent-authored tool notes", () => {
    const agentToolErrors = classifyWorkerError({
      result: piResult(),
      agentNote: { status: "tool_error", blockers: [{ kind: "validation_tool_error" }] },
      runnerValidation: { status: "skipped", reasons: ["not evaluated yet"], qaLint: null },
    });

    expect(agentToolErrors?.kind).toBe("agent_noted_tool_error");
    expect(shouldRunRunnerValidationForWorkerSession(piResult())).toBe(true);
  });

  test("builds and validates the checkout after a Pi cycle timeout", () => {
    const timeoutResult = { ...piResult(), failed: true, error: "worker Pi cycle timed out after 1800s" };

    expect(isWorkerSessionTimeoutFailure(timeoutResult)).toBe(true);
    expect(shouldRunRunnerValidationForWorkerSession(timeoutResult)).toBe(true);
  });

  test("skips validation when non-timeout Pi failures or provider failures prevent a usable return", () => {
    expect(shouldRunRunnerValidationForWorkerSession({ ...piResult(), failed: true })).toBe(false);
    expect(shouldRunRunnerValidationForWorkerSession({ ...piResult(), providerError: "context_length_exceeded" })).toBe(false);
  });
});

describe("workerPiSessionRetryDecision", () => {
  const streamIncompleteResult = {
    ...piResult(),
    failed: true,
    error: "stream_incomplete: Upstream websocket closed before response.completed: no close frame received or sent",
  };

  test("retries a transient websocket stream failure inside the same worker attempt", () => {
    const decision = workerPiSessionRetryDecision({
      result: streamIncompleteResult,
      transientRetryCount: 0,
      dryRun: false,
      claimDeadlineMs: Date.now() + 60_000,
    });

    expect(isRetryableWorkerPiSessionFailure(streamIncompleteResult)).toBe(true);
    expect(decision.shouldRetry).toBe(true);
    expect(decision.reason).toBe("transient_transport_failure");
    expect(decision.nextRetryIndex).toBe(1);
    expect(decision.maxTransientRetries).toBe(WORKER_PI_SESSION_RETRY_POLICY.maxTransientRetries);
  });

  test("retries codex-lb upstream timeout provider failures inside the same worker attempt", () => {
    const result = {
      ...piResult(),
      providerError: "upstream_unavailable: Request to upstream timed out",
    };
    const decision = workerPiSessionRetryDecision({
      result,
      transientRetryCount: 0,
      dryRun: false,
      claimDeadlineMs: Date.now() + 60_000,
    });

    expect(isRetryableWorkerPiSessionFailure(result)).toBe(true);
    expect(decision.shouldRetry).toBe(true);
    expect(decision.reason).toBe("transient_transport_failure");
  });

  test("retries codex-lb stream idle timeout failures inside the same worker attempt", () => {
    const result = {
      ...piResult(),
      failed: true,
      error: "stream_idle_timeout: Upstream stream idle timeout",
    };

    expect(isRetryableWorkerPiSessionFailure(result)).toBe(true);
  });

  test("does not retry context-window provider failures", () => {
    const result = {
      ...piResult(),
      providerError: "context_length_exceeded: Your input exceeds the context window of this model",
    };
    const decision = workerPiSessionRetryDecision({
      result,
      transientRetryCount: 0,
      dryRun: false,
      claimDeadlineMs: Date.now() + 60_000,
    });

    expect(isRetryableWorkerPiSessionFailure(result)).toBe(false);
    expect(decision.shouldRetry).toBe(false);
    expect(decision.reason).toBe("non_retryable_failure");
  });

  test("stops retrying after the transient retry budget is spent", () => {
    const decision = workerPiSessionRetryDecision({
      result: streamIncompleteResult,
      transientRetryCount: WORKER_PI_SESSION_RETRY_POLICY.maxTransientRetries,
      dryRun: false,
      claimDeadlineMs: Date.now() + 60_000,
    });

    expect(decision.retryable).toBe(true);
    expect(decision.shouldRetry).toBe(false);
    expect(decision.reason).toBe("transient_retry_budget_exhausted");
  });

  test("does not start a retry after the claim deadline expires", () => {
    const decision = workerPiSessionRetryDecision({
      result: streamIncompleteResult,
      transientRetryCount: 0,
      dryRun: false,
      claimDeadlineMs: Date.now() - 1,
    });

    expect(decision.retryable).toBe(true);
    expect(decision.shouldRetry).toBe(false);
    expect(decision.reason).toBe("claim_deadline");
  });
});

describe("workerPiContextRetryDecision", () => {
  const contextLengthResult = {
    ...piResult(),
    failed: true,
    error: "context_length_exceeded: Your input exceeds the context window of this model",
  };

  test("retries context-window failures with the next smaller prompt budget", () => {
    const decision = workerPiContextRetryDecision({
      result: contextLengthResult,
      contextRetryIndex: 0,
      dryRun: false,
      claimDeadlineMs: Date.now() + 60_000,
    });

    expect(isWorkerPiContextLengthFailure(contextLengthResult)).toBe(true);
    expect(isRetryableWorkerPiSessionFailure(contextLengthResult)).toBe(false);
    expect(decision.shouldRetry).toBe(true);
    expect(decision.currentBudget).toBe("full");
    expect(decision.nextBudget).toBe("compact");
    expect(decision.reason).toBe("context_length_retry_with_smaller_prompt");
  });

  test("allows one more minimal-budget retry after compact is rejected", () => {
    const decision = workerPiContextRetryDecision({
      result: contextLengthResult,
      contextRetryIndex: 1,
      dryRun: false,
      claimDeadlineMs: Date.now() + 60_000,
    });

    expect(decision.shouldRetry).toBe(true);
    expect(decision.currentBudget).toBe("compact");
    expect(decision.nextBudget).toBe("minimal");
  });

  test("stops after the minimal budget is rejected", () => {
    const decision = workerPiContextRetryDecision({
      result: contextLengthResult,
      contextRetryIndex: WORKER_PI_CONTEXT_RETRY_POLICY.budgets.length - 1,
      dryRun: false,
      claimDeadlineMs: Date.now() + 60_000,
    });

    expect(decision.retryable).toBe(true);
    expect(decision.shouldRetry).toBe(false);
    expect(decision.reason).toBe("context_budget_exhausted");
  });
});

describe("workerContinuationDecision", () => {
  const futureDeadline = Date.now() + 60_000;

  test("stops at the base budget when no checkpoint improves", () => {
    const checkpoints = [0, 1, 2, 3, 4].map((attempt) => continuationCheckpoint(attempt));
    const decision = workerContinuationDecision({
      attemptIndex: 4,
      checkpoints,
      repairReasons: ["runner validation: build failed"],
      dryRun: false,
      claimDeadlineMs: futureDeadline,
    });

    expect(decision.shouldContinue).toBe(false);
    expect(decision.exhausted).toBe(true);
    expect(decision.stopReason).toBe("attempt_budget_exhausted");
    expect(decision.humanAttempt).toBe(WORKER_ATTEMPT_BUDGET_POLICY.baseAttempts);
    expect(decision.policy).toBe("attempt_budget_v3");
    expect(decision.improvementGrants).toBe(0);
    expect(decision.attemptBudget).toBe(5);
  });

  test("continues while the base budget remains", () => {
    const checkpoints = [0, 1, 2, 3].map((attempt) => continuationCheckpoint(attempt));
    const decision = workerContinuationDecision({
      attemptIndex: 3,
      checkpoints,
      repairReasons: ["runner validation: build failed"],
      dryRun: false,
      claimDeadlineMs: futureDeadline,
    });

    expect(decision.shouldContinue).toBe(true);
    expect(decision.continueReason).toBe("attempt_budget_available");
    expect(decision.attemptBudget).toBe(5);
  });

  test("adds two attempts for each strictly better selectable checkpoint", () => {
    const checkpoints = [
      continuationCheckpoint(0, { hardGatesPassed: true, selectable: true, newScore: 81 }),
      continuationCheckpoint(3, { hardGatesPassed: true, selectable: true, newScore: 82 }),
    ];
    const decision = workerContinuationDecision({
      attemptIndex: 4,
      checkpoints,
      repairReasons: [],
      dryRun: false,
      claimDeadlineMs: futureDeadline,
    });

    expect(decision.shouldContinue).toBe(true);
    expect(decision.improvementGrants).toBe(2);
    expect(decision.attemptBudget).toBe(9);
    expect(decision.latestBestAttemptIndex).toBe(3);
    expect(decision.latestBestScore).toBe(82);
  });

  test("a selectable score below the running best does not grant more budget", () => {
    const checkpoints = [
      continuationCheckpoint(0, { hardGatesPassed: true, selectable: true, newScore: 81 }),
      continuationCheckpoint(1, { hardGatesPassed: true, selectable: true, newScore: 80 }),
    ];
    const decision = workerContinuationDecision({
      attemptIndex: 4,
      checkpoints,
      repairReasons: [],
      dryRun: false,
      claimDeadlineMs: futureDeadline,
    });

    expect(decision.shouldContinue).toBe(true);
    expect(decision.improvementGrants).toBe(1);
    expect(decision.attemptBudget).toBe(7);
    expect(decision.latestBestAttemptIndex).toBe(0);
  });

  test("a gate-failed exact grants budget once even when repeated", () => {
    const checkpoints = [
      continuationCheckpoint(4, { exactMatch: true, hardGatesPassed: false, selectable: false, newScore: 100 }),
      continuationCheckpoint(5, { exactMatch: true, hardGatesPassed: false, selectable: false, newScore: 100 }),
    ];
    const decision = workerContinuationDecision({
      attemptIndex: 5,
      checkpoints,
      repairReasons: [],
      dryRun: false,
      claimDeadlineMs: futureDeadline,
    });

    expect(decision.shouldContinue).toBe(true);
    expect(decision.improvementGrants).toBe(1);
    expect(decision.attemptBudget).toBe(7);
    expect(decision.latestBestAttemptIndex).toBeNull();
  });

  test("accepted exact stops even when the budget is exhausted", () => {
    const decision = workerContinuationDecision({
      attemptIndex: 8,
      checkpoints: [continuationCheckpoint(8, { exactMatch: true, hardGatesPassed: true, selectable: true, newScore: 100 })],
      repairReasons: ["runner validation: build failed"],
      dryRun: false,
      claimDeadlineMs: futureDeadline,
    });

    expect(decision.shouldContinue).toBe(false);
    expect(decision.exhausted).toBe(false);
    expect(decision.stopReason).toBe("accepted_exact");
  });

  test("an expired claim deadline stops even without repair reasons", () => {
    const decision = workerContinuationDecision({
      attemptIndex: 0,
      checkpoints: [],
      repairReasons: [],
      dryRun: false,
      claimDeadlineMs: Date.now() - 1,
    });

    expect(decision.shouldContinue).toBe(false);
    expect(decision.exhausted).toBe(false);
    expect(decision.stopReason).toBe("claim_deadline");
    expect(decision.stoppedByDeadline).toBe(true);
  });

  test("dry run stops before checking the remaining budget", () => {
    const decision = workerContinuationDecision({
      attemptIndex: 0,
      checkpoints: [],
      repairReasons: [],
      dryRun: true,
      claimDeadlineMs: futureDeadline,
    });

    expect(decision.shouldContinue).toBe(false);
    expect(decision.exhausted).toBe(false);
    expect(decision.stopReason).toBe("dry_run");
  });
});

describe("classifyWorkerError with QA lint violations", () => {
  test("final-attempt violations classify as runner_validation_qa_lint_failed with the finding details", () => {
    const classification = classifyWorkerError({
      result: piResult(),
      agentNote: { status: "validation_ready" },
      runnerValidation: rejectedValidation(violationsQaLint()),
    });
    expect(classification).not.toBeNull();
    expect(classification?.kind).toBe("runner_validation_qa_lint_failed");
    expect(classification?.summary).toContain("QA lint rejected the attempt");
    expect(classification?.reasons.some((reason) => reason.startsWith("qa_lint_finding: error packed_string_blob"))).toBe(true);
  });

  test("warning findings also classify as runner_validation_qa_lint_failed", () => {
    const classification = classifyWorkerError({
      result: piResult(),
      agentNote: { status: "validation_ready" },
      runnerValidation: rejectedValidation(warningsQaLint()),
    });
    expect(classification?.kind).toBe("runner_validation_qa_lint_failed");
    expect(classification?.summary).toContain("1 QA finding(s) requiring repair");
    expect(classification?.reasons.some((reason) => reason.startsWith("qa_lint_finding: warning packed_string_blob"))).toBe(true);
  });

  test("the kind is a rework kind and routes to needs_rework, never the tool_error quarantine path", () => {
    const classification = classifyWorkerError({
      result: piResult(),
      agentNote: { status: "validation_ready" },
      runnerValidation: rejectedValidation(violationsQaLint()),
    });
    expect(classification?.kind).toBe("runner_validation_qa_lint_failed");
    expect(isReworkErrorKind("runner_validation_qa_lint_failed")).toBe(true);
  });

  test("tool_unavailable qaLint does not reject an otherwise passed attempt", () => {
    const qaLint: WorkerQaLint = { status: "tool_unavailable", exitCode: -1, findings: [], scanPath: null, toolError: "scan_diff.py not found" };
    const classification = classifyWorkerError({
      result: piResult(),
      agentNote: { status: "validation_ready" },
      runnerValidation: passedValidation(qaLint),
    });
    expect(classification).toBeNull();
  });

  test("provider errors classify as infrastructure failures without requiring parser errors", () => {
    const classification = classifyWorkerError({
      result: {
        ...piResult(),
        providerError: "context_length_exceeded: Your input exceeds the context window of this model",
      },
      agentNote: null,
      runnerValidation: { status: "skipped", reasons: [], qaLint: null },
    });

    expect(classification?.kind).toBe("provider_error");
    expect(classification?.summary).toContain("LLM provider failed");
    expect(classification?.reasons).toEqual(["context_length_exceeded: Your input exceeds the context window of this model"]);
  });

  test("clean qaLint on a passed attempt produces no error classification", () => {
    const qaLint: WorkerQaLint = { status: "clean", exitCode: 0, findings: [], scanPath: "/tmp/attempt-0.qa_diff.patch", toolError: null };
    const classification = classifyWorkerError({
      result: piResult(),
      agentNote: { status: "validation_ready" },
      runnerValidation: passedValidation(qaLint),
    });
    expect(classification).toBeNull();
  });

  test("violations outrank the generic runner_validation_<status> kind", () => {
    const validation: WorkerChangeValidation = {
      status: "no_official_score_change",
      reasons: ["target did not improve", "qa lint found 1 QA finding(s) requiring repair (gate exit 1)"],
      qaLint: violationsQaLint(),
    };
    const classification = classifyWorkerError({
      result: piResult(),
      agentNote: { status: "validation_ready" },
      runnerValidation: validation,
    });
    expect(classification?.kind).toBe("runner_validation_qa_lint_failed");
    expect(classification?.reasons).toContain("target did not improve");
  });
});
