import { spawnSync } from "node:child_process";
import { latestSavePoint } from "@server/core/cycle-runtime/phases/pr/state";
import { openState } from "@server/core/cycle-runtime/run-state";
import { parseBaseRef } from "@server/core/cycle-runtime/phases/preparing/runtime";
import type { CliResult } from "@server/infrastructure/shell/ui-command-runner";

type JsonObject = Record<string, unknown>;

export interface CampaignStatusService {
  campaignStatus: (repoRoot: string, stateDir: string, baseRefFallback: string) => JsonObject;
  invalidateCampaignCache: () => void;
}

export interface CampaignStatusServiceDeps {
  appendLog: (stream: "stdout" | "stderr" | "ui", text: string) => void;
  outputTail: (textValue: string, maxLength?: number) => string;
  runGit: (repoRoot: string, args: string[], options?: { check?: boolean; failureHint?: string }) => Promise<CliResult>;
}

function gitText(repoRoot: string, args: string[]): string | null {
  const result = spawnSync("git", ["-C", repoRoot, ...args], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

function campaignDirtyPaths(statusShort: string): string[] {
  return statusShort
    .split("\n")
    .filter(Boolean)
    .filter((line) => {
      const path = line.slice(3).trim().replace(/^"|"$/g, "");
      return path !== "decomp-orchestrator" && !path.startsWith("decomp-orchestrator/") && !path.startsWith(".decomp-orchestrator-state");
    });
}

const UPSTREAM_FETCH_INTERVAL_MS = 10 * 60 * 1000;

export function createCampaignStatusService(deps: CampaignStatusServiceDeps): CampaignStatusService {
  let campaignCache: { key: string; at: number; value: JsonObject } | null = null;
  const upstreamFetches = new Map<string, { at: number; inFlight: boolean }>();

  function invalidateCampaignCache(): void {
    campaignCache = null;
  }

  function refreshUpstreamRefs(repoRoot: string, baseRef: string): number | null {
    const { remote } = parseBaseRef(baseRef);
    const key = `${repoRoot}\0${remote}`;
    const entry = upstreamFetches.get(key);
    const lastAt = entry?.at ?? 0;
    if (entry && (entry.inFlight || Date.now() - lastAt < UPSTREAM_FETCH_INTERVAL_MS)) return lastAt || null;
    upstreamFetches.set(key, { at: lastAt, inFlight: true });
    void deps.runGit(repoRoot, ["fetch", "--prune", "--quiet", remote], { check: false })
      .then((result) => {
        if (result.exitCode === 0) {
          upstreamFetches.set(key, { at: Date.now(), inFlight: false });
          invalidateCampaignCache();
        } else {
          upstreamFetches.set(key, { at: lastAt, inFlight: false });
          deps.appendLog("stderr", `background fetch ${remote} failed (${result.exitCode}): ${deps.outputTail(result.stderr || result.stdout, 400)}`);
        }
      })
      .catch((error) => {
        upstreamFetches.set(key, { at: lastAt, inFlight: false });
        deps.appendLog("stderr", `background fetch ${remote} failed: ${error instanceof Error ? error.message : String(error)}`);
      });
    return lastAt || null;
  }

  function campaignStatus(repoRoot: string, stateDir: string, baseRefFallback: string): JsonObject {
    const key = `${repoRoot}\0${stateDir}`;
    if (campaignCache && campaignCache.key === key && Date.now() - campaignCache.at < 10_000) return campaignCache.value;
    const store = openState(stateDir);
    let savePoint: ReturnType<typeof latestSavePoint> = null;
    try {
      savePoint = latestSavePoint(store);
    } finally {
      store.db.close();
    }
    const headSha = gitText(repoRoot, ["rev-parse", "HEAD"]);
    const branch = gitText(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"]);
    const dirtyPaths = campaignDirtyPaths(gitText(repoRoot, ["status", "--short", "--ignore-submodules=all"]) ?? "");
    const baseRef = savePoint?.baseRef ?? baseRefFallback;
    const upstreamFetchedAt = refreshUpstreamRefs(repoRoot, baseRef);
    const aheadText = gitText(repoRoot, ["rev-list", "--count", `${baseRef}..HEAD`]);
    const behindText = gitText(repoRoot, ["rev-list", "--count", `HEAD..${baseRef}`]);
    const baseSha = gitText(repoRoot, ["rev-parse", "--verify", baseRef]);
    const dirty = dirtyPaths.length > 0;
    const value: JsonObject = {
      savePoint: savePoint as unknown as JsonObject | null,
      head: { sha: headSha, branch, dirty, dirtyPaths: dirtyPaths.slice(0, 20) },
      baseRef,
      baseSha,
      aheadOfBase: aheadText === null ? null : Number(aheadText),
      behindBase: behindText === null ? null : Number(behindText),
      upstreamFetchedAt: upstreamFetchedAt ? new Date(upstreamFetchedAt).toISOString() : null,
      stale: Boolean(savePoint) && (savePoint?.commitSha !== headSha || dirty),
    };
    campaignCache = { key, at: Date.now(), value };
    return value;
  }

  return {
    campaignStatus,
    invalidateCampaignCache,
  };
}
