import { createHash } from "node:crypto";
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import type { PreshipAggregate } from "./pr-preship-review.js";
import type { DraftPrQaDeps } from "./pr-draft-qa.js";
import type { GlobalArgs } from "../args.js";
import type { QaScanFinding, QaScanInvocation, QaScanResult } from "@decomp-orchestrator/core/qa";
import type { QaRepairQueue } from "@decomp-orchestrator/core/qa/repair-lane";
import { runDraftPrQa } from "./pr-draft-qa.js";

const tempDirs: string[] = [];

function tempDir(prefix: string): string {
  const dir = mkdtempSync(resolve(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function globals(repoRoot: string, stateDir: string): GlobalArgs {
  return {
    repoRoot,
    stateDir,
    dryRunAgents: false,
    provider: "codex-lb",
    model: "gpt-5.5",
    thinkingLevel: "medium",
  };
}

function prViewJson(): string {
  return JSON.stringify({
    number: 2704,
    url: "https://github.com/doldecomp/melee/pull/2704",
    title: "1/14 gm work in progress",
    state: "OPEN",
    isDraft: true,
    baseRefName: "master",
    baseRefOid: "base-sha",
    headRefName: "decomp-gm",
    headRefOid: "head-sha",
    headRepositoryOwner: { login: "fork-owner" },
    author: { login: "Ford" },
  });
}

function scanResult(findings: QaScanFinding[] = []): QaScanResult {
  const errors = findings.filter((finding) => finding.severity === "error").length;
  const warnings = findings.filter((finding) => finding.severity === "warning").length;
  return {
    tool: "review_lint",
    operation: "review_lint:scan_diff",
    status: errors > 0 ? "failed" : warnings > 0 ? "warned" : "passed",
    repo: "/repo",
    base: null,
    findings,
    counts: { errors, warnings },
  };
}

function scanInvocation(findings: QaScanFinding[] = []): QaScanInvocation {
  const result = scanResult(findings);
  return {
    exitCode: result.counts.errors > 0 ? 1 : result.counts.warnings > 0 ? 2 : 0,
    result,
    stdout: JSON.stringify(result),
    stderr: "",
    toolError: null,
    command: ["python3", "scan_diff.py"],
  };
}

function qaFinding(overrides: Partial<QaScanFinding> = {}): QaScanFinding {
  return {
    rule_id: "type_erasing_cast",
    severity: "warning",
    file: "src/melee/gm/gmresult.c",
    line: 12,
    excerpt: "(u8*) data",
    message: "Added type-erasing cast.",
    standard_id: "global_standard:typed-access",
    ...overrides,
  };
}

function emptyQueue(runId: string, repoRoot: string): QaRepairQueue {
  return {
    schema_version: "qa_repair_queue_v1",
    run_id: runId,
    created_at: "2026-06-15T00:00:00.000Z",
    repo_root: repoRoot,
    base_ref: "base-sha",
    head_sha: "head-sha",
    dry_run: false,
    candidate_files: [],
    items: [],
    ignored_findings: [],
    all_findings: [],
    scan: { status: "passed", base: null, counts: { errors: 0, warnings: 0 } },
  };
}

async function writeQaArtifacts(outputDir: string, queue: QaRepairQueue): Promise<{ queuePath: string; summaryPath: string; reportPath: string; shipStatusPath: string }> {
  await mkdir(outputDir, { recursive: true });
  const queuePath = resolve(outputDir, "queue.json");
  const summaryPath = resolve(outputDir, "summary.json");
  const reportPath = resolve(outputDir, "report.md");
  const shipStatusPath = resolve(outputDir, "ship_status.json");
  await writeFile(queuePath, `${JSON.stringify(queue, null, 2)}\n`);
  await writeFile(summaryPath, `${JSON.stringify({ recommendation: "clean", counts: { queued_items: queue.items.length } }, null, 2)}\n`);
  await writeFile(reportPath, "clean\n");
  await writeFile(shipStatusPath, `${JSON.stringify({ status: "qa_repair_clean" }, null, 2)}\n`);
  return { queuePath, summaryPath, reportPath, shipStatusPath };
}

function baseDeps(repoRoot: string): DraftPrQaDeps & { commands: string[][] } {
  const commands: string[][] = [];
  return {
    now: () => new Date("2026-06-15T12:00:00.000Z"),
    orchestratorRoot: tempDir("draft-qa-no-tools-"),
    commands,
    commandRunner: async (_cwd, command) => {
      commands.push(command);
      if (command.join(" ") === "git remote get-url origin") {
        return { exitCode: 0, stdout: "https://github.com/doldecomp/melee.git\n", stderr: "" };
      }
      if (command[0] === "gh" && command[1] === "pr" && command[2] === "view") {
        return { exitCode: 0, stdout: prViewJson(), stderr: "" };
      }
      if (command[0] === "git" && command[1] === "fetch") {
        return { exitCode: 0, stdout: "", stderr: "" };
      }
      if (command[0] === "git" && command[1] === "diff" && command[2] === "--name-only") {
        return { exitCode: 0, stdout: "src/melee/gm/gmresult.c\n", stderr: "" };
      }
      if (command[0] === "git" && command[1] === "diff" && command.some((part) => part.startsWith("--output="))) {
        const output = command.find((part) => part.startsWith("--output="))?.slice("--output=".length);
        if (output) await writeFile(output, "diff --git a/src/melee/gm/gmresult.c b/src/melee/gm/gmresult.c\n");
        return { exitCode: 0, stdout: "", stderr: "" };
      }
      if (command[0] === "gh" && command[1] === "api" && command[2] === "--paginate") {
        return { exitCode: 0, stdout: "[]\n", stderr: "" };
      }
      if (command[0] === "gh" && command[1] === "pr" && command[2] === "checks") {
        return { exitCode: 0, stdout: "build\tpass\n", stderr: "" };
      }
      return { exitCode: 0, stdout: "", stderr: "" };
    },
    preshipReview: async () => ({
      aggregate: {
        runId: "test",
        dryRun: false,
        allApproved: true,
        slices: [{ id: "pr-2704", verdict: "approve", rejectFindings: 0, warnFindings: 0, reviewPath: null }],
      },
      exitCode: 0,
    }),
    scanDiff: async () => scanInvocation(),
    qaRepair: async (repairGlobals, repairArgs) => {
      const outputDir = String(repairArgs.get("--output-dir"));
      const queue = emptyQueue(String(repairArgs.get("--run-id")), repairGlobals.repoRoot);
      return { queue, artifacts: await writeQaArtifacts(outputDir, queue), outputDir };
    },
  };
}

async function rejectPreshipDeps(repoRoot: string, reviewPath: string): Promise<Partial<DraftPrQaDeps>> {
  await mkdir(resolve(reviewPath, ".."), { recursive: true });
  await writeFile(
    reviewPath,
    `${JSON.stringify(
      {
        review: {
          schema_version: "melee_pr_preship_review_v1",
          slice_id: "pr-2704",
          slice_verdict: "reject",
          findings: [
            {
              file: "src/melee/gm/gmresult.c",
              line: 12,
              standard_id: "global_standard:literals-and-data-ownership",
              verdict: "reject",
              rationale: "extern anchor remains in a matching diff.",
              suggested_fix: "Inline the value or finish data ordering instead of adding the extern.",
            },
          ],
          summary: "reject",
          confidence: 0.9,
        },
      },
      null,
      2,
    )}\n`,
  );
  return {
    preshipReview: async (): Promise<{ aggregate: PreshipAggregate; exitCode: number }> => ({
      aggregate: {
        runId: "test",
        dryRun: false,
        allApproved: false,
        slices: [{ id: "pr-2704", verdict: "reject", rejectFindings: 1, warnFindings: 0, reviewPath }],
      },
      exitCode: 1,
    }),
    qaRepair: async (repairGlobals, repairArgs) => {
      const outputDir = String(repairArgs.get("--output-dir"));
      const queue = emptyQueue(String(repairArgs.get("--run-id")), repairGlobals.repoRoot);
      return { queue, artifacts: await writeQaArtifacts(outputDir, queue), outputDir };
    },
    scanDiff: async () => scanInvocation(),
  };
}

function markerForPreshipReject(): string {
  const material = [
    "preship",
    "reject",
    "src/melee/gm/gmresult.c",
    "12",
    "",
    "global_standard:literals-and-data-ownership",
    "extern anchor remains in a matching diff.",
  ].join("\0");
  return `<!-- decomp-orchestrator:pr-draft-qa:${createHash("sha256").update(material).digest("hex").slice(0, 16)} -->`;
}

describe("pr-draft-qa lifecycle", () => {
  test("clean draft PR exits ready after preship, scan, repair queue, and CI pass", async () => {
    const repoRoot = tempDir("draft-qa-repo-");
    const stateDir = tempDir("draft-qa-state-");
    const deps = baseDeps(repoRoot);

    const summary = await runDraftPrQa(
      globals(repoRoot, stateDir),
      new Map<string, string | true>([
        ["--pr", "2704"],
        ["--run-id", "test-run"],
      ]),
      deps,
    );

    expect(summary.status).toBe("ready_for_human_review");
    expect(summary.exitCode).toBe(0);
    expect(summary.counts.changedFiles).toBe(1);
    expect(summary.ci.status).toBe("passed");
    expect(await readFile(summary.artifacts.reportPath, "utf8")).toContain("Status: **ready_for_human_review**");
  });

  test("preship rejects are posted as deduped PR comments and route to manual review", async () => {
    const repoRoot = tempDir("draft-qa-repo-");
    const stateDir = tempDir("draft-qa-state-");
    const reviewPath = resolve(stateDir, "review.json");
    const deps = { ...baseDeps(repoRoot), ...(await rejectPreshipDeps(repoRoot, reviewPath)) };
    deps.commandRunner = async (_cwd, command) => {
      deps.commands.push(command);
      if (command[0] === "gh" && command[1] === "api" && String(command[2]).includes("/pulls/2704/comments") && command.includes("-f")) {
        return { exitCode: 0, stdout: JSON.stringify({ html_url: "https://github.com/doldecomp/melee/pull/2704#discussion_r1" }), stderr: "" };
      }
      return baseDeps(repoRoot).commandRunner!(_cwd, command);
    };

    const summary = await runDraftPrQa(
      globals(repoRoot, stateDir),
      new Map<string, string | true>([
        ["--pr", "2704"],
        ["--run-id", "test-run"],
        ["--comment-unresolved", true],
      ]),
      deps,
    );

    expect(summary.status).toBe("manual_review_required");
    expect(summary.exitCode).toBe(0);
    expect(summary.counts.commentsPosted).toBe(1);
    const comments = JSON.parse(await readFile(summary.artifacts.commentsPath, "utf8")) as Record<string, any>;
    expect(comments.comments[0].status).toBe("posted_inline");
    expect(comments.comments[0].marker).toBe(markerForPreshipReject());
  });

  test("strict draft QA treats warning-only scan findings as repair-required", async () => {
    const repoRoot = tempDir("draft-qa-repo-");
    const stateDir = tempDir("draft-qa-state-");
    const deps = baseDeps(repoRoot);
    const repairArgsSeen: Array<Map<string, string | true>> = [];
    deps.scanDiff = async () => scanInvocation([qaFinding()]);
    deps.qaRepair = async (repairGlobals, repairArgs) => {
      repairArgsSeen[0] = repairArgs;
      const outputDir = String(repairArgs.get("--output-dir"));
      const queue = emptyQueue(String(repairArgs.get("--run-id")), repairGlobals.repoRoot);
      return { queue, artifacts: await writeQaArtifacts(outputDir, queue), outputDir };
    };

    const summary = await runDraftPrQa(
      globals(repoRoot, stateDir),
      new Map<string, string | true>([
        ["--pr", "2704"],
        ["--run-id", "test-run"],
      ]),
      deps,
    );

	    expect(summary.status).toBe("needs_repair");
	    expect(summary.exitCode).toBe(1);
	    expect(summary.counts.qaWarnings).toBe(1);
    expect(repairArgsSeen[0]?.get("--repair-warnings")).toBe(true);
  });

  test("lower-score repair dispositions block ready status by default", async () => {
    const repoRoot = tempDir("draft-qa-repo-");
    const stateDir = tempDir("draft-qa-state-");
    const deps = baseDeps(repoRoot);
    deps.qaRepair = async (repairGlobals, repairArgs) => {
      const outputDir = String(repairArgs.get("--output-dir"));
      const queue: QaRepairQueue = {
        ...emptyQueue(String(repairArgs.get("--run-id")), repairGlobals.repoRoot),
        candidate_files: [
          {
            sourcePath: "src/melee/gm/gmresult.c",
            lane: "match",
            proofs: [],
            errorCount: 1,
            warningCount: 0,
            ruleCounts: { self_tu_extern: 1 },
            status: "needs_qa_repair",
          },
        ],
        items: [
          {
            schema_version: "qa_repair_queue_item_v1",
            id: "src-melee-gm-gmresult",
            status: "clean_lower_score",
            source_path: "src/melee/gm/gmresult.c",
            lane: "match",
            base_ref: "base-sha",
            head_sha: "head-sha",
            proofs: [],
            findings: [qaFinding({ severity: "error", rule_id: "self_tu_extern", message: "Self-TU extern remains." })],
            warnings: [],
            repair_warnings: false,
            rule_counts: { self_tu_extern: 1 },
            created_at: "2026-06-15T00:00:00.000Z",
            validation: {
              qa_scan: "review_lint scan_diff --gate for src/melee/gm/gmresult.c",
              target_check: "score",
              ship_set_check: "ship",
            },
            attempts: [],
          },
        ],
      };
      return { queue, artifacts: await writeQaArtifacts(outputDir, queue), outputDir };
    };

    const summary = await runDraftPrQa(
      globals(repoRoot, stateDir),
      new Map<string, string | true>([
        ["--pr", "2704"],
        ["--run-id", "test-run"],
      ]),
      deps,
    );

    expect(summary.status).toBe("needs_repair");
    expect(summary.exitCode).toBe(1);
    expect(summary.counts.repairLowerScore).toBe(1);
  });

  test("existing lifecycle markers suppress duplicate GitHub comments", async () => {
    const repoRoot = tempDir("draft-qa-repo-");
    const stateDir = tempDir("draft-qa-state-");
    const reviewPath = resolve(stateDir, "review.json");
    const deps = { ...baseDeps(repoRoot), ...(await rejectPreshipDeps(repoRoot, reviewPath)) };
    const marker = markerForPreshipReject();
    deps.commandRunner = async (_cwd, command) => {
      deps.commands.push(command);
      if (command[0] === "gh" && command[1] === "api" && command[2] === "--paginate") {
        return { exitCode: 0, stdout: JSON.stringify([{ body: `${marker}\nAlready commented.` }]), stderr: "" };
      }
      if (command[0] === "gh" && command[1] === "api" && command.includes("-f")) {
        throw new Error("duplicate comment should not be posted");
      }
      return baseDeps(repoRoot).commandRunner!(_cwd, command);
    };

    const summary = await runDraftPrQa(
      globals(repoRoot, stateDir),
      new Map<string, string | true>([
        ["--pr", "2704"],
        ["--run-id", "test-run"],
        ["--comment-unresolved", true],
      ]),
      deps,
    );

    expect(summary.status).toBe("manual_review_required");
    expect(summary.counts.commentsAlreadyPresent).toBe(1);
    expect(summary.counts.commentsPosted).toBe(0);
  });
});
