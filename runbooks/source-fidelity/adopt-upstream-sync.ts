import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { resolveGame } from "../../apps/server/src/core/game-registry/resolver.ts";
import { gameConfigurationRevision } from "../../apps/server/src/core/game-registry/config-revision.ts";
import { immediateTransaction, openState } from "../../apps/server/src/core/orchestrator-state/index.ts";
import { getHarnessState, transitionHarnessState } from "../../apps/server/src/core/harness-state/state.ts";
import { addSavePoint, ensureCampaign } from "../../apps/server/src/core/harness-runtime/phases/pr/state/index.ts";
import { withholdUnverifiedMeasures } from "../../apps/server/src/core/harness-runtime/phases/running/board/snapshot.ts";
import { steeringCompletionIndex } from "../../apps/server/src/core/harness-runtime/phases/pr/checkpoint/completion-index.ts";
import { sectionMeasuresFromReport } from "../../apps/server/src/core/validation/objdiff/section-measures.ts";

// Record an upstream Sync that an operator merged outside the harness and
// fast-forwarded into the game checkout. Mirrors publishHarnessEpochSync
// (harness head + upstream + pr_sync save point + run head in one transaction)
// without an epoch, and advances game_upstream_anchors like Sync publication.
// It never touches git, the snapshot, sandbox.json, or a run's lifecycle.
const ROOT = "/Users/Ford/workspace/codebases/harnesses/gamecube-decomp-harness";
const argOf = (k: string) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : undefined; };
const need = (k: string) => { const v = argOf(k); if (!v) throw new Error(`missing ${k}`); return v; };
const GAME = argOf("--game") ?? "sms";
const NEW_HEAD = need("--new");
const PRIOR_HEAD = need("--prior");
const UPSTREAM = need("--upstream");
const PRIOR_UPSTREAM = need("--prior-upstream");
const REPORT = need("--report");
const EVIDENCE = need("--evidence");
const REASON = need("--reason");
const dryRun = process.argv.includes("--dry-run");
const FULL = /^[0-9a-f]{40}$/;
for (const [k, v] of [["--new", NEW_HEAD], ["--prior", PRIOR_HEAD], ["--upstream", UPSTREAM], ["--prior-upstream", PRIOR_UPSTREAM]]) {
  if (!FULL.test(v)) throw new Error(`${k} must be a full 40-char sha`);
}

function git(root: string, args: string[]): { code: number; out: string } {
  const p = Bun.spawnSync(["git", "-C", root, ...args], { stdout: "pipe", stderr: "pipe" });
  return { code: p.exitCode ?? -1, out: p.stdout.toString().trim() };
}

const game = resolveGame({ gameId: GAME, orchestratorRoot: ROOT });
const repo = game.repoRoot;
const syncId = `operator-sync:upstream-${UPSTREAM}`;
const savePointId = `operator-pr-sync-save-point-${UPSTREAM}`;
const artifactDir = resolve(game.stateDir, "pr_sync_reports", `operator-sync-${UPSTREAM.slice(0, 12)}`);
const archivedReport = resolve(artifactDir, "report.json");

// Git preconditions: the checkout already sits at the published head.
const head = git(repo, ["rev-parse", "HEAD"]).out;
if (head !== NEW_HEAD) throw new Error(`checkout HEAD is ${head}, expected ${NEW_HEAD}`);
if (git(repo, ["status", "--porcelain", "--untracked-files=all"]).out) throw new Error("checkout is dirty");
for (const [a, b] of [[PRIOR_HEAD, NEW_HEAD], [UPSTREAM, NEW_HEAD], [PRIOR_UPSTREAM, UPSTREAM]]) {
  if (git(repo, ["merge-base", "--is-ancestor", a, b]).code !== 0) throw new Error(`${a} is not an ancestor of ${b}`);
}
const branch = git(repo, ["rev-parse", "--abbrev-ref", "HEAD"]).out;
const upstreamRefHead = game.baseRef ? git(repo, ["rev-parse", game.baseRef]).out : null;

const reportText = readFileSync(REPORT, "utf8");
const report = JSON.parse(reportText) as Record<string, unknown>;
if (!report.measures || typeof report.measures !== "object") throw new Error(`${REPORT} has no measures`);

const store = openState(game.stateDir, { migrate: false });
try {
  const state = getHarnessState(store.db, GAME);
  if (!state) throw new Error(`no harness state for ${GAME}`);
  const replayed = store.db.query("SELECT payload_json FROM harness_timeline_entries WHERE game_id = ? AND event_id = ?").get(GAME, syncId) as { payload_json: string } | null;
  if (replayed) {
    const prior = JSON.parse(replayed.payload_json);
    if (prior.source?.resulting_head !== NEW_HEAD || prior.source?.accepted_upstream !== UPSTREAM) throw new Error(`conflicting replay of ${syncId}`);
    console.log(`already recorded as ${syncId}; no change`);
    process.exit(0);
  }
  const runId = state.history.run_id;
  if (!runId) throw new Error("harness has no run");
  const run = store.db.query("SELECT game_id, head_revision, revision, status FROM runs WHERE id = ?").get(runId) as { game_id: string; head_revision: string | null; revision: number; status: string } | null;
  console.log("before:", { revision: state.identity.revision, head: state.source.head, upstream: state.source.upstream_revision, readiness: state.readiness, execution: state.execution, history: state.history, run: run && { id: runId, status: run.status, head: run.head_revision, revision: run.revision } });
  if (state.source.head !== PRIOR_HEAD) throw new Error(`accepted head is ${state.source.head}, expected ${PRIOR_HEAD}`);
  if (state.source.upstream_revision !== PRIOR_UPSTREAM) throw new Error(`accepted upstream is ${state.source.upstream_revision}, expected ${PRIOR_UPSTREAM}`);
  if (state.execution.desired !== "paused" || state.execution.workflow !== "none" || state.execution.status !== "paused") throw new Error("harness must be paused with no workflow");
  if (state.execution.blockers.length) throw new Error("harness has blockers");
  if (!run || run.game_id !== GAME || run.head_revision !== PRIOR_HEAD) throw new Error(`run ${runId} head disagrees with ${PRIOR_HEAD}`);
  if (run.status === "active" || run.status === "running") throw new Error(`run ${runId} is ${run.status}`);
  const anchor = store.db.query("SELECT upstream_revision FROM game_upstream_anchors WHERE game_id = ?").get(GAME) as { upstream_revision: string } | null;
  const config = gameConfigurationRevision(game);
  console.log("upstream anchor:", anchor?.upstream_revision ?? null, "| baseRef", game.baseRef, "=", upstreamRefHead, "| config now", config.slice(0, 8), config === state.source.configuration_revision ? "(matches accepted)" : `(accepted ${state.source.configuration_revision.slice(0, 8)}; not changed here)`);

  // Measures as Sync publishes them: steering-gated games withhold unverified matches at this HEAD.
  const holds = await steeringCompletionIndex(store, { gameId: GAME, steeringGate: game.matching.steeringGate }, repo);
  const measures = withholdUnverifiedMeasures(report as never, holds) as Record<string, unknown>;
  const score = Number(measures.matched_code_percent);
  const dataScore = Number(measures.matched_data_percent);
  const sectionMeasures = sectionMeasuresFromReport(REPORT);
  console.log("measures (raw → published):", (report.measures as Record<string, unknown>).matched_code_percent, "→", measures.matched_code_percent, `| withheld holds: ${holds?.size ?? 0}`);
  if (!Number.isFinite(score)) throw new Error("invalid matched_code_percent");
  if (dryRun) { console.log("dry run: no change", { syncId, savePointId, archivedReport }); process.exit(0); }

  mkdirSync(artifactDir, { recursive: true });
  if (!existsSync(archivedReport)) copyFileSync(REPORT, archivedReport);
  if (readFileSync(archivedReport, "utf8") !== reportText) throw new Error(`${archivedReport} exists with different content`);

  const result = immediateTransaction(store.db, () => {
    const current = getHarnessState(store.db, GAME)!;
    if (current.identity.revision !== state.identity.revision) throw new Error("harness changed; retry");
    const campaign = ensureCampaign(store, { gameId: GAME, baseRef: game.baseRef });
    addSavePoint(store, {
      id: savePointId, campaignId: campaign.id, runId, triggerKind: "pr_sync", label: "operator-upstream-sync-pr-sync",
      commitSha: NEW_HEAD, branch, baseRef: game.baseRef, baseSha: UPSTREAM, matchedCodePercent: score, reportPath: archivedReport, artifactDir,
      payload: { kind: "pr_sync", epoch_id: null, operator: true, measures, matched_data_percent: Number.isFinite(dataScore) ? dataScore : null,
        section_measures: sectionMeasures, prior_anchor: PRIOR_UPSTREAM, source_manifests: [], source_report: REPORT, evidence: EVIDENCE },
    });
    const next = transitionHarnessState(store.db, {
      gameId: GAME, expectedRevision: current.identity.revision, commandId: syncId,
      patch: {
        source: { head: NEW_HEAD, upstream_revision: UPSTREAM },
        readiness: { build: "ready", evidence: "ready", sources: "ready" },
        execution: { workflow: "none", status: "paused", blockers: [] },
        history: { sync_id: syncId, save_point_id: savePointId },
      },
      boundary: {
        eventId: syncId, kind: "sync_completed", outcome: "source_changed", runId, epochId: null, syncId,
        evidence: { save_point_id: savePointId, report: archivedReport, freshness: "valid", measures, section_measures: sectionMeasures,
          source_manifests: [], operator: { reason: REASON, evidence: EVIDENCE, source_report: REPORT } },
      },
    });
    const changed = store.db.query("UPDATE runs SET head_revision = ?, revision = revision + 1 WHERE id = ? AND revision = ? AND head_revision = ?")
      .run(NEW_HEAD, runId, run.revision, PRIOR_HEAD);
    if (changed.changes !== 1) throw new Error(`run publication conflict for ${runId}`);
    const occurredAt = new Date().toISOString();
    store.db.query(`INSERT INTO game_upstream_anchors (game_id, upstream_revision, sync_id, caused_by_event_id, updated_at)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(game_id) DO UPDATE SET upstream_revision = excluded.upstream_revision,
      sync_id = excluded.sync_id, caused_by_event_id = excluded.caused_by_event_id, updated_at = excluded.updated_at`)
      .run(GAME, UPSTREAM, syncId, syncId, occurredAt);
    return next;
  });
  const runAfter = store.db.query("SELECT head_revision, revision FROM runs WHERE id = ?").get(runId);
  console.log("after:", { revision: result.identity.revision, head: result.source.head, upstream: result.source.upstream_revision, readiness: result.readiness, execution: result.execution, history: result.history, run: runAfter });
} finally { store.db.close(); }
