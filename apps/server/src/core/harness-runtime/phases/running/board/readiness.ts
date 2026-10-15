import type {
  BlockedCandidate,
  BoardReadinessSummary,
  ReadinessClassRef,
  TargetCandidate,
  TargetReadiness,
} from "@server/core/shared/types/index.js";
import { orderingGatedPath } from "@server/core/tools/ordering.js";

/**
 * `readiness.py index` identity: the checkout, revision, build version,
 * target objects (stat stamp), link map (sha256) and ordering policy the
 * index was computed from. Every field is required and checked.
 */
export interface ReadinessIdentity {
  repo: string;
  rev: string;
  version: string;
  target_stamp: string;
  map_sha: string;
  policy_hash: string;
}

export const READINESS_IDENTITY_FIELDS = ["repo", "rev", "version", "target_stamp", "map_sha", "policy_hash"] as const;

export interface ReadinessSummaryCounts {
  blocked: number;
  deferred: number;
  ready: number;
  unresolved_classes: number;
}

/** Parsed `readiness.py index --json`, keyed by `unit::symbol`. */
export interface ReadinessIndex {
  identity: ReadinessIdentity;
  functions: Map<string, TargetReadiness>;
  summary: ReadinessSummaryCounts;
}

/** What admission needs from the epoch's readiness load. */
export interface BoardReadinessOptions {
  /** The loaded index; absent when the load failed (`readinessUnavailable`). */
  readiness?: ReadinessIndex;
  readinessMode?: "shadow" | "enforce";
  /** `ordering.gatedPaths`; needed to block gated functions when readiness is unavailable. */
  readinessGatedPaths?: string[];
  /** Loader failure: enforce blocks gated-path functions and admits the rest. */
  readinessUnavailable?: string;
  /** Epoch-start revision the readiness was requested at. */
  readinessRev?: string;
}

export interface ReadinessFrontier {
  candidates: TargetCandidate[];
  blocked?: BlockedCandidate[];
  deferred?: string[];
  wouldBlock?: BlockedCandidate[];
  wouldDefer?: string[];
  readiness?: BoardReadinessSummary;
}

function candidateKey(candidate: Pick<TargetCandidate, "unit" | "symbol">): string {
  return `${candidate.unit}::${candidate.symbol}`;
}

function blockedCandidate(candidate: TargetCandidate, reason: BlockedCandidate["reason"], unmet: ReadinessClassRef[]): BlockedCandidate {
  return {
    key: candidateKey(candidate),
    unit: candidate.unit,
    symbol: candidate.symbol,
    sourcePath: candidate.sourcePath,
    size: candidate.size,
    fuzzy: candidate.fuzzy,
    reason,
    unmet,
  };
}

function hasReadinessOptions(options: BoardReadinessOptions): options is BoardReadinessOptions & { readinessMode: "shadow" | "enforce" } {
  return options.readinessMode === "shadow" || options.readinessMode === "enforce";
}

/**
 * Applies class readiness to the board's candidates (plan section 2).
 *
 * Enforce: blocked candidates (order-gated with unmet classes, or gated while
 * readiness is unavailable) are removed; deferred candidates (unmet or
 * unresolved classes elsewhere) follow every ready candidate in report order.
 * Shadow: candidates keep their order; `wouldBlock`/`wouldDefer` record what
 * enforce would do. Both modes attach each not-ready candidate's classes so
 * the worker packet can list them. No readiness options: candidates as-is.
 */
export function applyReadinessFrontier(candidates: TargetCandidate[], options: BoardReadinessOptions): ReadinessFrontier {
  if (!hasReadinessOptions(options)) return { candidates };
  const unavailable = options.readiness ? null : options.readinessUnavailable ?? "readiness index not loaded";
  const gatedPaths = options.readinessGatedPaths ?? [];
  const inOrder: TargetCandidate[] = [];
  const ready: TargetCandidate[] = [];
  const deferred: TargetCandidate[] = [];
  const blocked: BlockedCandidate[] = [];

  for (const candidate of candidates) {
    if (candidate.kind !== "function") {
      inOrder.push(candidate);
      ready.push(candidate);
      continue;
    }
    if (unavailable) {
      inOrder.push(candidate);
      if (orderingGatedPath(candidate.sourcePath, gatedPaths)) blocked.push(blockedCandidate(candidate, "readiness_unavailable", []));
      else ready.push(candidate);
      continue;
    }
    const entry = options.readiness!.functions.get(candidateKey(candidate));
    if (!entry) {
      // Absent from a loaded index: unknown, never silently ready. Gated → blocked, otherwise deferred.
      inOrder.push(candidate);
      if (orderingGatedPath(candidate.sourcePath, gatedPaths)) blocked.push(blockedCandidate(candidate, "not_in_index", []));
      else deferred.push(candidate);
      continue;
    }
    if (entry.state === "ready") {
      inOrder.push(candidate);
      ready.push(candidate);
      continue;
    }
    const annotated: TargetCandidate = { ...candidate, readiness: { state: entry.state, unmet: entry.unmet, unresolved: entry.unresolved } };
    inOrder.push(annotated);
    if (entry.state === "blocked") blocked.push(blockedCandidate(candidate, "not_ready", entry.unmet));
    else deferred.push(annotated);
  }

  const readiness: BoardReadinessSummary = {
    mode: options.readinessMode,
    identity: options.readiness ? { ...options.readiness.identity } : null,
    rev: options.readinessRev ?? options.readiness?.identity.rev ?? null,
    unavailable,
  };
  if (options.readinessMode === "enforce") {
    return { candidates: [...ready, ...deferred], blocked, deferred: deferred.map(candidateKey), readiness };
  }
  // Shadow: nothing is held back or reordered; record what enforce would do.
  return { candidates: inOrder, wouldBlock: blocked, wouldDefer: deferred.map(candidateKey), readiness };
}
