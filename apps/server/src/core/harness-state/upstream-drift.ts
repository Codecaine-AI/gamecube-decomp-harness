/**
 * Upstream drift: how far the fetched upstream default branch is ahead of the
 * accepted `source.upstream_revision`. It is a non-blocking notice on the
 * harness state (the boundary sync merges upstream on its own schedule; nothing
 * here merges anything) plus one timeline entry when drift first appears.
 */
import type { Database } from "bun:sqlite";
import { getHarnessState, transitionHarnessState, type HarnessNotice, type HarnessState } from "./state.js";

export const UPSTREAM_DRIFT_NOTICE_CODE = "upstream_drift";

export interface UpstreamDriftCommit { sha: string; subject: string }

export interface UpstreamDrift {
  upstream_ref: string;
  upstream_head: string;
  accepted_upstream: string;
  upstream_ahead_by: number;
  oldest: UpstreamDriftCommit | null;
  newest: UpstreamDriftCommit | null;
  observed_at: string;
}

interface GitOutput { exitCode: number | null; stdout: string }
type GitRunner = (repoRoot: string, args: string[]) => Promise<GitOutput>;

function commitRow(line: string | undefined): UpstreamDriftCommit | null {
  if (!line) return null;
  const tab = line.indexOf("\t");
  if (tab <= 0) return null;
  return { sha: line.slice(0, tab).trim(), subject: line.slice(tab + 1).trim() };
}

/** Pure assembly from `rev-list --count` and `log --reverse --format=%H%x09%s` output. */
export function upstreamDriftFromGit(input: {
  upstreamRef: string; upstreamHead: string; acceptedUpstream: string; countText: string; logText: string; now?: string;
}): UpstreamDrift {
  const count = Number.parseInt(input.countText.trim(), 10);
  const rows = input.logText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const aheadBy = Number.isFinite(count) && count >= 0 ? count : rows.length;
  return {
    upstream_ref: input.upstreamRef,
    upstream_head: input.upstreamHead,
    accepted_upstream: input.acceptedUpstream,
    upstream_ahead_by: aheadBy,
    oldest: aheadBy > 0 ? commitRow(rows[0]) : null,
    newest: aheadBy > 0 ? commitRow(rows[rows.length - 1]) : null,
    observed_at: input.now ?? new Date().toISOString(),
  };
}

/**
 * Compares the accepted upstream with the local upstream ref (already fetched
 * by the caller; nothing here touches the network). Null when either side is
 * unknown, so callers keep whatever notice they already have.
 */
export async function computeUpstreamDrift(input: {
  repoRoot: string; upstreamRef: string; acceptedUpstream: string | null | undefined; upstreamHead?: string | null; runGit: GitRunner; now?: string;
}): Promise<UpstreamDrift | null> {
  if (!input.acceptedUpstream) return null;
  let upstreamHead = input.upstreamHead ?? null;
  if (!upstreamHead) {
    const parsed = await input.runGit(input.repoRoot, ["rev-parse", "--verify", `${input.upstreamRef}^{commit}`]);
    upstreamHead = parsed.exitCode === 0 ? parsed.stdout.trim() || null : null;
  }
  if (!upstreamHead) return null;
  const range = `${input.acceptedUpstream}..${upstreamHead}`;
  const count = await input.runGit(input.repoRoot, ["rev-list", "--count", range]);
  if (count.exitCode !== 0) return null;
  const log = Number.parseInt(count.stdout.trim(), 10) > 0
    ? await input.runGit(input.repoRoot, ["log", "--reverse", "--format=%H%x09%s", range])
    : { exitCode: 0, stdout: "" };
  return upstreamDriftFromGit({ upstreamRef: input.upstreamRef, upstreamHead, acceptedUpstream: input.acceptedUpstream, countText: count.stdout, logText: log.exitCode === 0 ? log.stdout : "", now: input.now });
}

/** Synchronous read-path variant (API and dashboard payloads) using the local refs only. */
export function observeUpstreamDrift(input: { repoRoot: string; upstreamRef: string; acceptedUpstream: string | null | undefined; now?: string }): UpstreamDrift | null {
  if (!input.acceptedUpstream) return null;
  const git = (args: string[]): GitOutput => {
    try {
      const result = Bun.spawnSync(["git", "-C", input.repoRoot, ...args], { stdout: "pipe", stderr: "pipe" });
      return { exitCode: result.exitCode, stdout: result.stdout.toString() };
    } catch {
      return { exitCode: 1, stdout: "" };
    }
  };
  const parsed = git(["rev-parse", "--verify", `${input.upstreamRef}^{commit}`]);
  const upstreamHead = parsed.exitCode === 0 ? parsed.stdout.trim() : "";
  if (!upstreamHead) return null;
  const range = `${input.acceptedUpstream}..${upstreamHead}`;
  const count = git(["rev-list", "--count", range]);
  if (count.exitCode !== 0) return null;
  const log = Number.parseInt(count.stdout.trim(), 10) > 0 ? git(["log", "--reverse", "--format=%H%x09%s", range]) : { exitCode: 0, stdout: "" };
  return upstreamDriftFromGit({ upstreamRef: input.upstreamRef, upstreamHead, acceptedUpstream: input.acceptedUpstream, countText: count.stdout, logText: log.exitCode === 0 ? log.stdout : "", now: input.now });
}

function short(sha: string): string { return sha.slice(0, 10); }

/** The notice shown while upstream is ahead; null once the accepted upstream has caught up. */
export function upstreamDriftNotice(gameId: string, drift: UpstreamDrift): HarnessNotice | null {
  if (drift.upstream_ahead_by <= 0) return null;
  const span = drift.oldest && drift.newest
    ? drift.upstream_ahead_by === 1
      ? ` (${short(drift.newest.sha)} ${drift.newest.subject})`
      : ` (oldest ${short(drift.oldest.sha)} ${drift.oldest.subject}; newest ${short(drift.newest.sha)} ${drift.newest.subject})`
    : "";
  return {
    code: UPSTREAM_DRIFT_NOTICE_CODE,
    message: `Upstream ${drift.upstream_ref} is ${drift.upstream_ahead_by} commit(s) ahead of the accepted upstream ${short(drift.accepted_upstream)}${span}; the next epoch boundary merges it.`,
    source_kind: "game",
    source_id: gameId,
    observed_at: drift.observed_at,
    detail: { ...drift },
  };
}

/** Read-path merge: the live observation replaces any persisted drift notice for the same accepted upstream. */
export function withLiveUpstreamDrift(state: HarnessState, drift: UpstreamDrift | null): HarnessState {
  if (!drift || drift.accepted_upstream !== state.source.upstream_revision) return state;
  const notice = upstreamDriftNotice(state.identity.game_id, drift);
  const others = (state.notices ?? []).filter((entry) => entry.code !== UPSTREAM_DRIFT_NOTICE_CODE);
  return { ...state, notices: notice ? [...others, notice] : others };
}

/**
 * Persists the drift notice and logs an `upstream_drift` timeline entry when
 * the count crosses from 0 to positive. Unchanged observations do not touch
 * the state revision; a stale observation (different accepted upstream) is ignored.
 */
export function recordUpstreamDrift(db: Database, input: { gameId: string; drift: UpstreamDrift; now?: string }): HarnessState | null {
  const state = getHarnessState(db, input.gameId);
  if (!state) return null;
  if (state.source.upstream_revision !== input.drift.accepted_upstream) return state;
  const prior = (state.notices ?? []).find((entry) => entry.code === UPSTREAM_DRIFT_NOTICE_CODE);
  const priorAhead = typeof prior?.detail?.upstream_ahead_by === "number" ? prior.detail.upstream_ahead_by : 0;
  const priorHead = typeof prior?.detail?.upstream_head === "string" ? prior.detail.upstream_head : null;
  const notice = upstreamDriftNotice(input.gameId, input.drift);
  if ((notice ? notice.detail?.upstream_ahead_by : 0) === priorAhead && (notice ? input.drift.upstream_head : null) === priorHead) return state;
  const notices = [...(state.notices ?? []).filter((entry) => entry.code !== UPSTREAM_DRIFT_NOTICE_CODE), ...(notice ? [notice] : [])];
  const crossed = priorAhead === 0 && input.drift.upstream_ahead_by > 0;
  return transitionHarnessState(db, {
    gameId: input.gameId,
    expectedRevision: state.identity.revision,
    commandId: `upstream-drift:${state.identity.revision}`,
    now: input.now,
    patch: { notices },
    ...(crossed ? { boundary: {
      eventId: `upstream-drift:${input.drift.accepted_upstream}:${input.drift.upstream_head}`,
      kind: "upstream_drift" as const,
      outcome: "detected",
      runId: state.history.run_id,
      epochId: state.history.epoch_id,
      evidence: { ...input.drift },
    } } : {}),
  });
}
