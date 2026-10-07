import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import { openState, type StateStore } from "@server/core/orchestrator-state";
import { evaluateQaGate } from "@server/core/validation/jobs/qa-gate.js";
import { l2AcceptedAdvisoryOptions, resolveAcceptedAdvisories } from "./accepted-advisories.js";
import { advisoryFingerprint, normalizeAdvisoryCode } from "./advisory-fingerprint.js";
import type { QaScanFinding, QaScanInvocation } from "./scan-diff.js";

const FILE = "src/lb/lbsnap.c";
/** A type-erasing cast line longer than the scanner's 240-character excerpt. */
const LONG_LINE = `    lbSnap_Apply((void*)&fighter->mv.ca.specialhi.${"segment_".repeat(30)}tail, 0x24);`;
const KEEP = Array.from({ length: 12 }, (_, index) => `int keep_${index};`);

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(resolve(tmpdir(), prefix));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function git(repo: string, ...args: string[]): string {
  const result = Bun.spawnSync(["git", ...args], { cwd: repo, stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString().trim();
}

function advisory(line: number, overrides: Partial<QaScanFinding> = {}): QaScanFinding {
  return {
    rule_id: "type_erasing_cast",
    severity: "warning",
    file: FILE,
    line,
    excerpt: LONG_LINE.trim().slice(0, 240),
    message: "New type-erasing pointer cast.",
    standard_id: "global_standard:typed-fields-over-pointer-math",
    detail: { llm_review: true, cast: "void*" },
    ...overrides,
  };
}

const FINGERPRINT = advisoryFingerprint(advisory(1), LONG_LINE);

interface Fixture {
  repo: string;
  stateDir: string;
  store: StateStore;
  /** Commit `lines` as the whole file; returns the new commit. */
  commit(lines: string[], message: string): string;
  run(runId: string): void;
  /** An integration outcome for `checkpointId` (metadata.integrated_rev omitted when null). */
  integration(runId: string, checkpointId: string, status: string, integratedRev: string | null): void;
  accept(runId: string, checkpointId: string, occurrences: number): void;
}

function fixture(): Fixture {
  const repo = tempDir("accepted-advisory-repo-");
  git(repo, "init", "-q");
  git(repo, "config", "user.email", "qa@example.test");
  git(repo, "config", "user.name", "QA Test");
  mkdirSync(resolve(repo, "src/lb"), { recursive: true });
  const commit = (lines: string[], message: string) => {
    writeFileSync(resolve(repo, FILE), `${lines.join("\n")}\n`);
    git(repo, "add", ".");
    git(repo, "commit", "-qm", message);
    return git(repo, "rev-parse", "HEAD");
  };
  commit(KEEP, "base");
  const stateDir = tempDir("accepted-advisory-state-");
  const store = openState(stateDir);
  cleanups.push(() => store.db.close());
  const at = "2026-10-07T00:00:00.000Z";
  return {
    repo,
    stateDir,
    store,
    commit,
    run(runId) {
      store.db
        .query("INSERT INTO runs (id, goal_kind, goal_value, desired_workers, status, created_at) VALUES (?, 'matched_percent', 100, 1, 'active', ?)")
        .run(runId, at);
    },
    integration(runId, checkpointId, status, integratedRev) {
      store.db
        .query(
          `INSERT INTO integration_outcomes (id, run_id, epoch_id, epoch_target_id, target_claim_id, worker_state_id, worker_checkpoint_id,
             status, write_set_json, conflict_paths_json, failure_reasons_json, metadata_json, created_at, updated_at)
           VALUES (?, ?, 'epoch-1', 'et-1', 'claim-1', 'ws-1', ?, ?, '[]', '[]', '[]', ?, ?, ?)`,
        )
        .run(`io-${checkpointId}`, runId, checkpointId, status, JSON.stringify(integratedRev === null ? {} : { integrated_rev: integratedRev }), at, at);
    },
    accept(runId, checkpointId, occurrences) {
      store.db
        .query(
          `INSERT INTO accepted_advisory (fingerprint, checkpoint_id, run_id, rule_id, file, full_line, occurrences, thresholds_json, accepted_at)
           VALUES (?, ?, ?, 'type_erasing_cast', ?, ?, ?, '{}', ?)`,
        )
        .run(FINGERPRINT, checkpointId, runId, FILE, normalizeAdvisoryCode(LONG_LINE), occurrences, at);
    },
  };
}

function warningScan(findings: QaScanFinding[]): QaScanInvocation {
  return {
    exitCode: 2,
    result: {
      tool: "review_lint",
      operation: "review_lint:scan_diff",
      status: "warned",
      repo: "/tmp/melee",
      base: "origin/master",
      findings,
      counts: { errors: 0, warnings: findings.filter((entry) => entry.severity === "warning").length },
    },
    stdout: "{}",
    stderr: "",
    toolError: null,
    command: ["python3", "scan_diff.py", "--gate", "--json"],
  };
}

describe("resolveAcceptedAdvisories", () => {
  test("each accepted row exempts at most `occurrences` physical lines; a repeated finding for one line reuses its credit", async () => {
    const f = fixture();
    // One integration commit adds two physical copies of the accepted line (lines 6 and 8).
    const integrated = f.commit([...KEEP.slice(0, 5), LONG_LINE, KEEP[5]!, LONG_LINE, ...KEEP.slice(6)], "integration");
    f.run("run-a");
    f.integration("run-a", "cp-1", "applied", integrated);
    f.accept("run-a", "cp-1", 1);
    const first = advisory(6);
    const repeated = advisory(6);
    const second = advisory(8);
    const untouched = [
      advisory(6, { severity: "error" }),
      advisory(6, { rule_id: "storage_widening", detail: {} }),
      advisory(8, { severity: "info" }),
    ];
    const findings = [first, repeated, second, ...untouched];

    const oneCredit = await resolveAcceptedAdvisories({ store: f.store, runId: "run-a", repoRoot: f.repo, headRev: integrated, findings });
    expect(oneCredit.exempt.map(({ finding, checkpointId, blame, fingerprint }) => [finding, checkpointId, blame, fingerprint])).toEqual([
      [first, "cp-1", { commit: integrated, origLine: 6 }, FINGERPRINT],
      [repeated, "cp-1", { commit: integrated, origLine: 6 }, FINGERPRINT],
    ]);
    expect(oneCredit.exempt[0]!.finding).toBe(first);
    expect(oneCredit.blocking).toEqual([{ fingerprint: FINGERPRINT, finding: second, reason: "credit-exhausted" }]);

    f.store.db.query("UPDATE accepted_advisory SET occurrences = 2").run();
    const twoCredits = await resolveAcceptedAdvisories({ store: f.store, runId: "run-a", repoRoot: f.repo, headRev: integrated, findings });
    expect(twoCredits.exempt.map(({ finding, blame }) => [finding, blame.origLine])).toEqual([[first, 6], [repeated, 6], [second, 8]]);
    expect(twoCredits.blocking).toEqual([]);
  });

  test("a checkpoint counts as integrated only through an applied or resolved outcome of the same run with an integrated_rev", async () => {
    const f = fixture();
    const integrated = f.commit([...KEEP.slice(0, 5), LONG_LINE, ...KEEP.slice(5)], "integration");
    f.run("run-a");
    f.run("run-b");
    const findings = [advisory(6)];
    const resolveRunA = () => resolveAcceptedAdvisories({ store: f.store, runId: "run-a", repoRoot: f.repo, headRev: integrated, findings });

    f.integration("run-a", "cp-conflict", "conflict", integrated);
    f.accept("run-a", "cp-conflict", 1);
    f.integration("run-a", "cp-no-rev", "applied", null);
    f.accept("run-a", "cp-no-rev", 1);
    f.integration("run-b", "cp-other-run", "applied", integrated);
    f.accept("run-a", "cp-other-run", 1);
    expect((await resolveRunA()).blocking.map(({ reason }) => reason)).toEqual(["not-integrated"]);

    f.integration("run-a", "cp-resolved", "resolved", integrated);
    f.accept("run-a", "cp-resolved", 1);
    const resolved = await resolveRunA();
    expect(resolved.blocking).toEqual([]);
    expect(resolved.exempt.map(({ checkpointId }) => checkpointId)).toEqual(["cp-resolved"]);
  });
});

describe("L2 run selection", () => {
  async function acceptedFixture(): Promise<{ f: Fixture; integrated: string; scan: QaScanInvocation }> {
    const f = fixture();
    const integrated = f.commit([...KEEP.slice(0, 5), LONG_LINE, ...KEEP.slice(5)], "integration");
    f.run("run-a");
    f.run("run-b");
    return { f, integrated, scan: warningScan([advisory(6)]) };
  }

  test("regression-check with no run id: today's verdict plus the operator message when accepted rows exist, no message when none exist", async () => {
    const { f, integrated, scan } = await acceptedFixture();
    const select = (stateDir: string, requestedRunId: string | null) =>
      l2AcceptedAdvisoryOptions({ stateDir, requestedRunId, repoRoot: f.repo, headRev: integrated, findings: scan.result!.findings });

    const noStore = tempDir("accepted-advisory-nostore-");
    expect(await select(noStore, null)).toBeUndefined();
    expect(existsSync(resolve(noStore, "orchestrator.sqlite"))).toBe(false);
    expect(await select(f.stateDir, null)).toBeUndefined();

    f.integration("run-a", "cp-a", "applied", integrated);
    f.accept("run-a", "cp-a", 1);
    f.accept("run-b", "cp-b", 1);
    const message =
      "2 accepted llm_review advisories exist (runs: run-a, run-b). No harness run was selected, so they are not honoured. " +
      "Rerun with RUN_ID=<run> make regression-check (or --run-id <run>).";
    for (const requestedRunId of [null, "manual"]) {
      const opts = await select(f.stateDir, requestedRunId);
      expect(opts).toEqual({ operatorMessage: message });
      expect(evaluateQaGate(scan, false, opts)).toEqual({ ...evaluateQaGate(scan, false), operatorMessage: message });
    }
  });

  test("regression-check with an unknown run id behaves like no run id", async () => {
    const { f, integrated, scan } = await acceptedFixture();
    f.integration("run-a", "cp-a", "applied", integrated);
    f.accept("run-a", "cp-a", 1);
    const opts = await l2AcceptedAdvisoryOptions({
      stateDir: f.stateDir,
      requestedRunId: "run-missing",
      repoRoot: f.repo,
      headRev: integrated,
      findings: scan.result!.findings,
    });
    expect(opts?.acceptedAdvisories).toBeUndefined();
    expect(opts?.operatorMessage).toStartWith("1 accepted llm_review advisories exist (runs: run-a). No harness run was selected");
    expect(evaluateQaGate(scan, false, opts).qaGatePassed).toBe(false);
  });

  test("regression-check with an explicit run id uses only that run's records", async () => {
    const { f, integrated, scan } = await acceptedFixture();
    f.integration("run-a", "cp-a", "applied", integrated);
    f.accept("run-a", "cp-a", 1);
    f.integration("run-b", "cp-b", "conflict", integrated);
    f.accept("run-b", "cp-b", 1);
    const gateFor = async (requestedRunId: string) => {
      const opts = await l2AcceptedAdvisoryOptions({
        stateDir: f.stateDir,
        requestedRunId,
        repoRoot: f.repo,
        headRev: integrated,
        findings: scan.result!.findings,
      });
      return evaluateQaGate(scan, false, opts);
    };

    const runA = await gateFor("run-a");
    expect(runA.qaGatePassed).toBe(true);
    expect(runA.exemptedAdvisories?.map(({ checkpointId, fingerprint }) => [checkpointId, fingerprint])).toEqual([["cp-a", FINGERPRINT]]);
    expect(runA.operatorMessage).toBeUndefined();

    const runB = await gateFor("run-b");
    expect(runB.qaGatePassed).toBe(false);
    expect(runB.exemptedAdvisories).toEqual([]);
    expect(runB.blockingAdvisories?.map(({ reason }) => reason)).toEqual(["not-integrated"]);
  });

  test("a selected run is not honoured when HEAD was unresolved or moved during the scan", async () => {
    const { f, integrated, scan } = await acceptedFixture();
    f.integration("run-a", "cp-a", "applied", integrated);
    f.accept("run-a", "cp-a", 1);
    const select = (headRev: string | null) =>
      l2AcceptedAdvisoryOptions({ stateDir: f.stateDir, requestedRunId: "run-a", repoRoot: f.repo, headRev, findings: scan.result!.findings });

    const unresolved = await select(null);
    expect(unresolved?.acceptedAdvisories).toBeUndefined();
    expect(unresolved?.operatorMessage).toContain("HEAD could not be resolved");

    const moved = f.commit([...KEEP.slice(0, 5), LONG_LINE, ...KEEP.slice(5), "int later;"], "later");
    const stale = await select(integrated);
    expect(stale?.acceptedAdvisories).toBeUndefined();
    expect(stale?.operatorMessage).toContain(`HEAD moved from ${integrated} to ${moved}`);
    expect(evaluateQaGate(scan, false, stale).qaGatePassed).toBe(false);
  });
});
