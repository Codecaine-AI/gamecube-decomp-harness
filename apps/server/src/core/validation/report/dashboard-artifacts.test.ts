import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { latestDashboardArtifactPayload } from "@server/core/orchestrator-state";
import { openState } from "@server/core/harness-runtime/run-state";
import { recordSteeringBackfill, recordSteeringCoverage, recordSteeringRollback } from "@server/core/harness-runtime/run-state/steering.js";
import { recordUnverifiedMatch } from "@server/core/harness-runtime/run-state/unverified-matches.js";
import { recordReportRunDashboardArtifacts } from "./dashboard-artifacts.js";
import { compactReportMeasures, type ReportRunResult } from "./run.js";

const cleanup: string[] = [];

afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

// Unit A (incomplete): exact_a, an exact unverified function, partial at 90%.
// Unit B (complete): b_exact and an unverified function at 99.5%.
// Fuzzy: 32 * (100 + 100 + 90 + 100 + 99.5) / 160 = 97.9.
const MEASURES = {
  fuzzy_match_percent: 97.9,
  matched_code: 96,
  total_code: 160,
  matched_code_percent: 60,
  matched_functions: 3,
  total_functions: 5,
  matched_functions_percent: 60,
  complete_code: 64,
  complete_code_percent: 40,
  complete_units: 1,
  total_units: 2,
};

function git(repoRoot: string, args: string[]): string {
  const result = Bun.spawnSync(["git", "-C", repoRoot, ...args], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString().trim();
}

const HELD_FUNCTIONS = [["sms/A.o", "unverified"], ["sms/B.o", "b_unverified"]] as const;

function fixture(holdKind: "unverified" | "rollback" = "unverified") {
  const dir = mkdtempSync(join(tmpdir(), "report-artifacts-"));
  cleanup.push(dir);
  const reportPath = join(dir, "report.json");
  writeFileSync(reportPath, JSON.stringify({
    measures: MEASURES,
    units: [
      {
        name: "sms/A.o",
        measures: { total_code: 96, matched_code: 64, complete_units: 0 },
        functions: [
          { name: "exact_a", size: 32, fuzzy_match_percent: 100 },
          { name: "unverified", size: 32 },
          { name: "partial", size: 32, fuzzy_match_percent: 90 },
        ],
      },
      {
        name: "sms/B.o",
        measures: { total_code: 64, matched_code: 32, complete_code: 64, complete_units: 1 },
        functions: [
          { name: "b_exact", size: 32, fuzzy_match_percent: 100 },
          { name: "b_unverified", size: 32, fuzzy_match_percent: 99.5 },
        ],
      },
    ],
  }));
  const store = openState(join(dir, "state"));
  let repoRoot: string | undefined;
  let head = "rev-1";
  if (holdKind === "rollback") {
    repoRoot = join(dir, "checkout");
    mkdirSync(repoRoot);
    git(repoRoot, ["init", "-q"]);
    git(repoRoot, ["config", "user.email", "fixture@example.com"]);
    git(repoRoot, ["config", "user.name", "Fixture"]);
    writeFileSync(join(repoRoot, "source.c"), "int value = 1;\n");
    git(repoRoot, ["add", "."]);
    git(repoRoot, ["commit", "-qm", "report source"]);
    head = git(repoRoot, ["rev-parse", "HEAD"]);
  }
  for (const [unit, symbol] of HELD_FUNCTIONS) {
    if (holdKind === "unverified") {
      recordUnverifiedMatch(store, { gameId: "sms", unit, symbol, analyzedRev: head, match: { base: 40, candidate: 100, real_only: null }, reasons: ["no steering located"] });
    } else {
      const rollbackId = recordSteeringRollback(store, {
        gameId: "sms", unit, symbol, analyzedRev: head, baseRev: head,
        initialVerdict: "steering_located", finalVerdict: "pass", rules: ["steering"], report: {}, status: "reverified",
      });
      store.db.query("UPDATE steering_rollbacks SET recorded_at = ?, updated_at = ? WHERE id = ?")
        .run("2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z", rollbackId);
    }
  }
  const result: ReportRunResult = {
    baselinePath: join(dir, "baseline.json"),
    reportChangesPath: join(dir, "report_changes.json"),
    reportPath,
    resetBaseline: false,
    steps: [],
    summary: compactReportMeasures(MEASURES),
    timestamps: { report: new Date().toISOString() },
  };
  return { dir, store, result, repoRoot, head };
}

describe("recordReportRunDashboardArtifacts", () => {
  for (const holdKind of ["unverified", "rollback"] as const) test(`steering-gated game: ${holdKind} functions are withheld from published matched, fuzzy and complete metrics with separate held figures and the raw summary`, async () => {
    const { dir, store, result, repoRoot, head } = fixture(holdKind);
    try {
      const published = await recordReportRunDashboardArtifacts(store, { result, repoRoot, runId: null, gameId: "sms", steeringGate: "enforce" });

      // The 99.5% function costs its fuzzy share and its unit's completeness, not a matched function.
      expect(published.summary).toMatchObject({
        matchedFunctions: 2, matchedCodeBytes: 64, matchedCodePercent: 40, unmatchedTargets: 3,
        fuzzyMatchPercent: 58, completeUnits: 0, completeCodePercent: 0,
      });
      expect(published.reportSummary).toEqual(result.summary);
      expect(published.unverifiedMeasures).toMatchObject({ unverified_functions: 1, unverified_code_percent: 20, unverified_targets: 2, unverified_complete_units: 1 });
      const board = latestDashboardArtifactPayload(store, { gameId: "sms", artifactType: "board_snapshot", artifactKey: "current" });
      expect(board.measures).toMatchObject({ matched_code_percent: 40, fuzzy_match_percent: 58, complete_units: 0, unmatched_targets: 3, unverified_code_percent: 20 });
      const reportRun = latestDashboardArtifactPayload(store, { gameId: "sms", artifactType: "report_run", artifactKey: "report" });
      expect(reportRun.summary).toMatchObject({ matchedFunctions: 2, completeUnits: 0 });
      expect(reportRun.reportSummary).toMatchObject({ matchedFunctions: 3, completeUnits: 1 });
      expect(reportRun.unverifiedMeasures).toMatchObject({ unverified_functions: 1 });

      if (holdKind === "rollback") {
        // A later clean certificate releases report-run credit only when its checkout HEAD is known.
        for (const [unit, symbol] of HELD_FUNCTIONS) {
          recordSteeringBackfill(store, { gameId: "sms", unit, symbol, analyzedRev: head, verdict: "pass" });
          recordSteeringCoverage(store, { gameId: "sms", unit, analyzedRev: head, baselineRev: head, clean: true });
        }
        const certified = await recordReportRunDashboardArtifacts(store, { result, repoRoot, gameId: "sms", steeringGate: "enforce" });
        expect(certified.summary).toEqual(result.summary);
        expect(certified.reportSummary).toBeUndefined();
        // The board pins the HEAD the holds were judged at, so the dashboard re-scores there, not at an unknown revision.
        const certifiedBoard = latestDashboardArtifactPayload(store, { gameId: "sms", artifactType: "board_snapshot", artifactKey: "current" });
        expect(certifiedBoard.measuredRevision).toBe(head);
        for (const unavailableRepo of [undefined, join(dir, "missing-checkout")]) {
          const held = await recordReportRunDashboardArtifacts(store, { result, repoRoot: unavailableRepo, gameId: "sms", steeringGate: "enforce" });
          expect(held.summary).toMatchObject({ matchedFunctions: 2, matchedCodePercent: 40, completeUnits: 0 });
          expect(held.reportSummary).toEqual(result.summary);
        }
      }
    } finally {
      store.db.close();
    }
  });

  for (const unreadable of ["report", "steering state"] as const) test(`steering-gated game with unreadable ${unreadable}: completion metrics publish as unknown, never as the raw done counts`, async () => {
    const { store, result } = fixture();
    try {
      if (unreadable === "report") rmSync(result.reportPath);
      else store.db.exec("ALTER TABLE steering_rollbacks RENAME TO unreadable_rollbacks; CREATE TABLE steering_rollbacks (broken TEXT)");
      const published = await recordReportRunDashboardArtifacts(store, { result, runId: null, gameId: "sms", steeringGate: "enforce" });

      expect(published.summary).toMatchObject({ matchedFunctions: null, matchedCodePercent: null, fuzzyMatchPercent: null, completeUnits: null, unmatchedTargets: null, totalFunctions: 5 });
      expect(published.reportSummary).toEqual(result.summary);
      expect(published.unverifiedMeasures).toEqual({ unverified_unbounded: true });
      const board = latestDashboardArtifactPayload(store, { gameId: "sms", artifactType: "board_snapshot", artifactKey: "current" });
      expect(board.measures).toMatchObject({ matched_code_percent: null, complete_units: null, unverified_unbounded: true });
    } finally {
      store.db.close();
    }
  });

  for (const steeringGate of [undefined, "off"] as const) {
    test(`gate ${steeringGate ?? "absent"} (Melee): a stored unverified row is never read and the report's summary is published unchanged`, async () => {
      const { store, result } = fixture();
      try {
        const published = await recordReportRunDashboardArtifacts(store, { result, runId: null, gameId: "sms", steeringGate });

        expect(published.summary).toEqual(result.summary);
        expect(published.reportSummary).toBeUndefined();
        expect(published.unverifiedMeasures).toBeUndefined();
        const board = latestDashboardArtifactPayload(store, { gameId: "sms", artifactType: "board_snapshot", artifactKey: "current" });
        expect(board.measures).toMatchObject({ matched_code_percent: 60, complete_units: 1, unmatched_targets: 2 });
        expect(Object.keys(board.measures as object).some((key) => key.startsWith("unverified_"))).toBe(false);
        expect(board).not.toHaveProperty("measuredRevision");
        expect(published).not.toHaveProperty("measuredRevision");
      } finally {
        store.db.close();
      }
    });
  }
});
