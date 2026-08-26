import { randomUUID } from "node:crypto";
import { copyFileSync, existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { artifactTimestamp } from "@server/infrastructure/agent-runtime/runtime";
import {
  addSavePoint,
  ensureCampaign,
  listSavePoints,
  type SavePointTrigger,
} from "@server/core/cycle-runtime/phases/pr/state";
import { getLatestRun, openState } from "@server/core/cycle-runtime/run-state";
import { getActiveCycle, recordSavePointAnchor } from "@server/core/cycle";
import type { EventActor, JsonObject as GameEventJsonObject } from "@server/core/harness-state/events.js";
import { recordDashboardArtifact } from "@server/core/orchestrator-state";
import { loadTrustedReportFile } from "@server/core/validation/report";
import { booleanArg, numberArg, stringArg, type GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { COMMIT_EXCLUDES } from "../boundary-commit.js";

const SAVE_POINT_TRIGGERS: SavePointTrigger[] = [
  "manual",
  "init",
  "pause",
  "checkpoint",
  "qa",
  "ship",
  "sync",
  "fresh",
  "epoch",
  "baseline",
  "epoch_finish",
  "pr_sync",
];

interface GitResult {
  ok: boolean;
  text: string;
}

async function git(repoRoot: string, args: string[]): Promise<GitResult> {
  const proc = Bun.spawn(["git", "-C", repoRoot, ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { ok: exitCode === 0, text: exitCode === 0 ? stdout.trimEnd() : stderr.trim() };
}

function parseTrigger(value: string): SavePointTrigger {
  if ((SAVE_POINT_TRIGGERS as string[]).includes(value)) return value as SavePointTrigger;
  throw new Error(`--trigger must be one of: ${SAVE_POINT_TRIGGERS.join(", ")}`);
}

function parseActor(value: string): EventActor {
  if (value === "operator" || value === "runner" || value === "agent" || value === "guardian" || value === "external_observer") {
    return value;
  }
  throw new Error("--actor must be one of: operator, runner, agent, guardian, external_observer");
}

function excludedStatusLine(line: string, stateDirRelative: string | null): boolean {
  const path = statusPath(line);
  if (COMMIT_EXCLUDES.some((excluded) => path === excluded || path.startsWith(`${excluded}/`))) return true;
  if (stateDirRelative && (path === stateDirRelative || path.startsWith(`${stateDirRelative}/`))) return true;
  return false;
}

function statusPath(line: string): string {
  const path = line.slice(3).trim().replace(/^"|"$/g, "");
  const renameTarget = path.includes(" -> ") ? path.slice(path.lastIndexOf(" -> ") + 4) : path;
  return renameTarget.replace(/^"|"$/g, "");
}

function stateDirRelativeToRepo(repoRoot: string, stateDir: string): string | null {
  const rel = relative(repoRoot, stateDir);
  return rel && !rel.startsWith("..") ? rel : null;
}

async function dirtyStatusLines(repoRoot: string, stateDirRelative: string | null): Promise<string[]> {
  const status = await git(repoRoot, ["status", "--short", "--ignore-submodules=all"]);
  if (!status.ok) throw new Error(`save-point git status failed: ${status.text}`);
  return status.text
    .split("\n")
    .filter(Boolean)
    .filter((line) => !excludedStatusLine(line, stateDirRelative))
    .map(statusPath);
}

export async function savePoint(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  const store = openState(globals.stateDir);
  try {
    if (booleanArg(args, "--list")) {
      const limit = Math.max(1, Math.floor(numberArg(args, "--limit", 50)));
      console.log(JSON.stringify({ savePoints: listSavePoints(store, limit) }, null, 2));
      return;
    }

    const triggerKind = parseTrigger(stringArg(args, "--trigger", "manual"));
    const label = stringArg(args, "--label", "") || null;
    const commandId = stringArg(args, "--command-id", `command-save-point-${randomUUID()}`);
    const actor = parseActor(stringArg(args, "--actor", "operator"));
    const cycleUuid = stringArg(args, "--cycle-uuid", "").trim();
    if (!cycleUuid) throw new Error("--cycle-uuid is required");
    const baseRef = stringArg(args, "--base-ref", globals.game?.baseRef ?? "origin/master");
    const stateDirRelative = stateDirRelativeToRepo(globals.repoRoot, globals.stateDir);

    const branchResult = await git(globals.repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"]);
    const branch = branchResult.ok ? branchResult.text : null;
    const campaign = ensureCampaign(store, { gameId: globals.game?.gameId ?? globals.gameId ?? null, branch, baseRef });

    const dirtyPaths = await dirtyStatusLines(globals.repoRoot, stateDirRelative);
    const head = await git(globals.repoRoot, ["rev-parse", "HEAD"]);
    if (!head.ok || !head.text.trim()) throw new Error(`save-point HEAD resolution failed: ${head.text || "empty revision"}`);
    const base = await git(globals.repoRoot, ["rev-parse", baseRef]);
    const aheadOfBase = await git(globals.repoRoot, ["rev-list", "--count", `${baseRef}..HEAD`]);

    const artifactDir = resolve(globals.stateDir, "save_points", artifactTimestamp());
    await mkdir(artifactDir, { recursive: true });
    const reportSource = resolve(globals.repoRoot, "build/GALE01/report.json");
    const baselineSource = resolve(globals.repoRoot, "build/GALE01/baseline.json");
    const reportChangesSource = resolve(globals.repoRoot, "build/GALE01/report_changes.json");
    let reportPath: string | null = null;
    let reportChangesPath: string | null = null;
    let measuresSource: string | null = null;
    if (existsSync(reportSource)) {
      reportPath = resolve(artifactDir, "report.json");
      copyFileSync(reportSource, reportPath);
      measuresSource = "report";
    } else if (existsSync(baselineSource)) {
      // No fresh report; anchor to the saved baseline so the save point still
      // records the real repo position instead of nothing.
      reportPath = resolve(artifactDir, "baseline.json");
      copyFileSync(baselineSource, reportPath);
      measuresSource = "baseline";
    }
    if (existsSync(reportChangesSource)) {
      reportChangesPath = resolve(artifactDir, "report_changes.json");
      copyFileSync(reportChangesSource, reportChangesPath);
    }

    let matchedCodePercent: number | null = null;
    let measures: Record<string, unknown> = {};
    if (reportPath) {
      try {
        const parsed = JSON.parse(readFileSync(reportPath, "utf8")) as Record<string, unknown>;
        const rawMeasures = parsed.measures;
        if (rawMeasures && typeof rawMeasures === "object" && !Array.isArray(rawMeasures)) {
          measures = rawMeasures as Record<string, unknown>;
          const value = Number(measures.matched_code_percent);
          matchedCodePercent = Number.isFinite(value) ? value : null;
        }
      } catch {
        matchedCodePercent = null;
      }
    }
    const boardSnapshotPath = resolve(artifactDir, "board_snapshot.json");
    await writeFile(
      boardSnapshotPath,
      `${JSON.stringify(
        {
          generated_at: new Date().toISOString(),
          commit_sha: head.ok ? head.text : null,
          branch,
          base_ref: baseRef,
          measures,
        },
        null,
        2,
      )}\n`,
    );

    const latestRun = getLatestRun(store);
    const record = addSavePoint(store, {
      campaignId: campaign.id,
      runId: latestRun?.id ?? null,
      triggerKind,
      label,
      commitSha: head.ok ? head.text : null,
      branch,
      baseRef,
      baseSha: base.ok ? base.text : null,
      worktreeDirty: dirtyPaths.length > 0,
      committed: false,
      matchedCodePercent,
      reportPath,
      reportChangesPath,
      boardSnapshotPath,
      artifactDir,
      payload: {
        ahead_of_base: aheadOfBase.ok ? Number(aheadOfBase.text) : null,
        commit_reason: dirtyPaths.length > 0 ? "chose_not_to_commit" : "nothing_to_commit",
        dirty_paths: dirtyPaths.slice(0, 100),
        commit_warning: null,
        measures,
        measures_source: measuresSource,
      },
    });
    if (Object.keys(measures).length > 0) {
      recordDashboardArtifact(store, {
        runId: record.runId,
        gameId: globals.game?.gameId ?? globals.gameId ?? null,
        artifactType: "board_snapshot",
        artifactKey: "current",
        sourcePath: reportPath,
        sourceLabel: measuresSource ?? "save_point",
        payload: {
          generatedAt: record.createdAt,
          measures,
          candidates: [],
          reportPath,
          source: measuresSource ?? "save_point",
          savePointId: record.id,
          savePointSha: record.commitSha,
        },
        createdAt: record.createdAt,
      });
    }
    if (reportChangesPath) {
      const trustedReport = await loadTrustedReportFile(reportChangesPath, "build/GALE01/report_changes.json", 0);
      if (trustedReport.status === "ready") {
        recordDashboardArtifact(store, {
          runId: record.runId,
          gameId: globals.game?.gameId ?? globals.gameId ?? null,
          artifactType: "trusted_report",
          artifactKey: "current",
          sourcePath: reportChangesPath,
          sourceLabel: "build/GALE01/report_changes.json",
          payload: trustedReport as unknown as Record<string, unknown>,
          createdAt: trustedReport.generatedAt ?? record.createdAt,
        });
      }
    }

    const gameId = globals.game?.gameId ?? globals.gameId;
    const cycle = gameId ? getActiveCycle(store.db, gameId) : null;
    if (!cycle) throw new Error("Save-point recording requires an active game cycle");
    if (cycle.cycle_uuid !== cycleUuid) {
      throw new Error(`Save-point cycle mismatch: active cycle is ${cycle.cycle_uuid}, received ${cycleUuid}`);
    }
    recordSavePointAnchor(store, {
      gameId,
      cycleUuid: cycle.cycle_uuid,
      savePointId: record.id,
      commitSha: record.commitSha ?? "",
      triggerKind: record.triggerKind,
      headlineScore: record.matchedCodePercent,
      artifactPaths: [record.reportPath, record.reportChangesPath, record.boardSnapshotPath, record.artifactDir].filter(
        (path): path is string => Boolean(path),
      ),
      payload: record.payload as GameEventJsonObject,
      commandId,
      correlationId: cycleUuid,
      actor,
      occurredAt: record.createdAt,
    });

    console.log(JSON.stringify({ savePoint: record, campaign, warning: null }, null, 2));
  } finally {
    store.db.close();
  }
}
