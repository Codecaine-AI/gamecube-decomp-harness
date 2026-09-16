import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { getHarnessState, transitionHarnessState } from "@server/core/harness-state/state.js";
import { immediateTransaction, type StateStore } from "@server/core/orchestrator-state";
import { addSavePoint, type SavePointTrigger } from "../state";

export interface HarnessSavePointInput {
  gameId: string; commandId: string; triggerKind: SavePointTrigger; label: string | null;
  reportPath: string; reportChangesPath: string; baseRef: string;
}
function hash(text: string | Buffer): string { return createHash("sha256").update(text).digest("hex"); }
function identity(input: Pick<HarnessSavePointInput, "gameId" | "commandId">): string { return `save-point-${hash(`${input.gameId}:${input.commandId}`)}`; }
async function git(root: string, args: string[]): Promise<string> {
  const proc = Bun.spawn(["git", "-C", root, ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (code !== 0) throw new Error(`save-point git ${args[0]} failed: ${stderr.trim()}`);
  return stdout.trimEnd();
}
export function recordHarnessSavePointFailure(store: StateStore, input: { gameId: string; commandId: string; message: string }): boolean {
  return immediateTransaction(store.db, () => {
    const state = getHarnessState(store.db, input.gameId);
    if (!state) return false;
    const eventId = `${identity(input)}:failure`;
    if (store.db.query("SELECT 1 FROM harness_timeline_entries WHERE game_id = ? AND event_id = ?").get(input.gameId, eventId)) return true;
    const blocker = { code: "save_point_capture_failed", source_kind: "save_point", source_id: input.commandId, message: input.message, recoverable: true };
    transitionHarnessState(store.db, {
      gameId: input.gameId, commandId: eventId, expectedRevision: state.identity.revision,
      patch: { readiness: { evidence: "blocked" }, execution: { blockers: [...state.execution.blockers.filter(item => !(item.code === blocker.code && item.source_id === blocker.source_id)), blocker] } },
      boundary: { eventId, kind: "failed", outcome: "save_point_capture_failed", recovery: { stage: "save_point_capture", command_id: input.commandId, message: input.message, retry: "same_command", prior_evidence_status: state.readiness.evidence, prior_blockers: state.execution.blockers } },
    });
    return true;
  });
}
/** Capture existing evidence only. Never builds, stages, commits, or changes accepted source. */
export async function captureHarnessSavePoint(store: StateStore, input: HarnessSavePointInput) {
  const state = getHarnessState(store.db, input.gameId);
  if (!state) throw new Error(`No harness for ${input.gameId}`);
  if (!input.commandId.trim()) throw new Error("Save-point command id is required");
  const id = identity(input);
  const request = JSON.stringify(input);
  const previous = store.db.query("SELECT payload_json FROM harness_timeline_entries WHERE game_id = ? AND event_id = ?").get(input.gameId, id) as { payload_json: string } | null;
  if (previous) {
    const evidence = JSON.parse(previous.payload_json).evidence;
    if (evidence.request !== request) throw new Error("Save-point command was reused with different input");
    return evidence.result;
  }
  try {
    const repoRoot = state.source.worktree;
    const head = (await git(repoRoot, ["rev-parse", "HEAD"])).trim();
    if (!state.source.head || head !== state.source.head) throw new Error("Save-point checkout HEAD differs from the accepted harness head");
    const branch = await git(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"]);
    const dirty = (await git(repoRoot, ["status", "--porcelain", "--untracked-files=all"])).length > 0;
    const sourceReport = resolve(repoRoot, input.reportPath);
    const sourceChanges = resolve(repoRoot, input.reportChangesPath);
    const reportBytes = existsSync(sourceReport) ? readFileSync(sourceReport) : null;
    const reportHash = reportBytes ? hash(reportBytes) : null;
    // A filename or mtime is not a build identity. Reuse only an immutable report
    // already anchored to this head and configuration by a validated boundary.
    const anchors = store.db.query("SELECT payload_json FROM harness_timeline_entries WHERE game_id = ? AND kind = 'save_point' ORDER BY id DESC").all(input.gameId) as Array<{ payload_json: string }>;
    let verified = false;
    for (const row of anchors) {
      const boundary = JSON.parse(row.payload_json);
      if (boundary.source?.resulting_head !== head || boundary.source?.configuration !== state.source.configuration_revision || boundary.evidence?.freshness !== "valid") continue;
      const saveId = boundary.evidence.save_point_id;
      const prior = store.db.query("SELECT s.report_path FROM save_points s JOIN campaigns c ON c.id = s.campaign_id WHERE s.id = ? AND s.commit_sha = ? AND c.game_id = ?").get(saveId ?? "", head, input.gameId) as { report_path: string | null } | null;
      if (prior?.report_path && resolve(prior.report_path) !== sourceReport && existsSync(prior.report_path) && reportHash === hash(readFileSync(prior.report_path))) { verified = true; break; }
    }
    let measures: Record<string, unknown> = {};
    let matchedCodePercent: number | null = null;
    const reasons: string[] = [];
    if (dirty) reasons.push("worktree_dirty");
    if (!reportBytes) reasons.push("report_missing");
    if (!verified) reasons.push("report_not_verified_for_head_and_configuration");
    if (state.readiness.build !== "ready") reasons.push("build_not_ready");
    if (reasons.length === 0 && reportBytes) {
      try {
        const report = JSON.parse(reportBytes.toString("utf8"));
        if (!report.measures || typeof report.measures !== "object" || Array.isArray(report.measures)) throw new Error("missing measures");
        measures = report.measures;
        const score = measures.matched_code_percent;
        if (typeof score !== "number" || !Number.isFinite(score)) throw new Error("invalid score");
        matchedCodePercent = score;
      } catch { reasons.push("invalid_report"); measures = {}; }
    }
    const freshness = reasons.length ? "unknown" : "valid";
    const artifactDir = resolve(dirname(store.stateDir), "evidence", "save-points", id);
    await mkdir(artifactDir, { recursive: true });
    const reportPath = reportBytes ? resolve(artifactDir, "report.json") : null;
    if (reportPath && reportBytes) await writeFile(reportPath, reportBytes);
    const reportChangesPath = existsSync(sourceChanges) ? resolve(artifactDir, "report_changes.json") : null;
    if (reportChangesPath) await writeFile(reportChangesPath, readFileSync(sourceChanges));
    const finalHead = (await git(repoRoot, ["rev-parse", "HEAD"])).trim();
    if (finalHead !== head || ((await git(repoRoot, ["status", "--porcelain", "--untracked-files=all"])).length > 0) !== dirty) throw new Error("Worktree changed during save-point capture");
    return immediateTransaction(store.db, () => {
      const concurrent = store.db.query("SELECT payload_json FROM harness_timeline_entries WHERE game_id = ? AND event_id = ?").get(input.gameId, id) as { payload_json: string } | null;
      if (concurrent) {
        const evidence = JSON.parse(concurrent.payload_json).evidence;
        if (evidence.request !== request) throw new Error("Save-point command was reused with different input");
        return evidence.result;
      }
      const current = getHarnessState(store.db, input.gameId)!;
      if (current.identity.revision !== state.identity.revision) throw new Error("Harness changed during save-point capture; retry the command");
      let campaign = store.db.query("SELECT id, game_id AS gameId, branch, base_ref AS baseRef, created_at AS createdAt FROM campaigns WHERE game_id = ? ORDER BY created_at LIMIT 1").get(input.gameId) as { id: string; gameId: string; branch: string | null; baseRef: string; createdAt: string } | null;
      if (!campaign) {
        campaign = { id: `harness-campaign-${hash(input.gameId)}`, gameId: input.gameId, branch, baseRef: input.baseRef, createdAt: new Date().toISOString() };
        store.db.query("INSERT INTO campaigns(id,game_id,branch,base_ref,created_at) VALUES(?,?,?,?,?)").run(campaign.id, input.gameId, branch, input.baseRef, campaign.createdAt);
      }
      const record = addSavePoint(store, { id, campaignId: campaign.id, runId: state.history.run_id, triggerKind: input.triggerKind, label: input.label,
        commitSha: head, branch, baseRef: input.baseRef, baseSha: state.source.upstream_revision, worktreeDirty: dirty, committed: false,
        matchedCodePercent, reportPath, reportChangesPath, artifactDir, payload: { freshness, unknown_reasons: reasons, measures, report_sha256: reportHash, configuration_revision: state.source.configuration_revision } });
      const ownFailure = (item: { code: string; source_id: string }) => (item.code === "save_point_capture_failed" || item.code === "save_point_evidence_unknown") && item.source_id === input.commandId;
      const blockers = current.execution.blockers.filter(item => !ownFailure(item));
      if (freshness === "unknown") blockers.push({ code: "save_point_evidence_unknown", source_kind: "save_point", source_id: input.commandId, message: reasons.join(", "), recoverable: true });
      const failed = store.db.query("SELECT payload_json FROM harness_timeline_entries WHERE game_id = ? AND event_id = ?").get(input.gameId, `${id}:failure`) as { payload_json: string } | null;
      const recovery = failed ? JSON.parse(failed.payload_json).recovery : null;
      const recoverOwnEvidence = freshness === "valid" && current.readiness.evidence === "blocked" &&
        recovery?.prior_evidence_status === "ready" && JSON.stringify(blockers) === JSON.stringify(recovery.prior_blockers);
      const result = { savePoint: record, campaign, warning: reasons.length ? reasons.join(", ") : null, freshness, blockerRaised: freshness === "unknown" };
      transitionHarnessState(store.db, { gameId: input.gameId, expectedRevision: current.identity.revision, commandId: id,
        patch: { history: { save_point_id: id }, ...(freshness === "unknown" ? { readiness: { evidence: "blocked" as const } } : recoverOwnEvidence ? { readiness: { evidence: "ready" as const } } : {}), execution: { blockers } },
        boundary: { eventId: id, kind: "save_point", outcome: freshness === "valid" ? "recorded" : "evidence_unknown", runId: state.history.run_id,
          evidence: { request, result, save_point_id: id, freshness, report_sha256: reportHash, unknown_reasons: reasons } },
      });
      return result;
    });
  } catch (error) {
    recordHarnessSavePointFailure(store, { gameId: input.gameId, commandId: input.commandId, message: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}
