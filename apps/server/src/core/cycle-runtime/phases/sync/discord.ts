import { randomUUID } from "node:crypto";
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";

import { stableJson } from "@server/core/knowledge/graph/util";
import {
  defaultBackfillManifestPath,
  discordPayload,
  loadBackfillManifest,
  planDiscordIncrementalBatches,
  type DiscordDescriptor,
} from "@server/core/knowledge/jobs/librarian-backfill.js";
import { sourceDataRoot, sourceStorageRoot } from "@server/core/knowledge/paths.js";
import { uiLog } from "@server/infrastructure/logging/ui-log";

const DEFAULT_REFRESH_TIMEOUT_MS = 5 * 60 * 1_000;

function logOutput(stream: "stdout" | "stderr", output: string): void {
  for (const line of output.split(/\r?\n/)) {
    if (line.trim()) uiLog(stream, line);
  }
}

export async function refreshDiscordMirror(options: {
  timeoutMs?: number;
}): Promise<{ ok: boolean; detail: string }> {
  const cwd = sourceStorageRoot("discord_raw");
  const timeoutMs = Math.max(1, Math.floor(options.timeoutMs ?? DEFAULT_REFRESH_TIMEOUT_MS));

  try {
    return await new Promise((resolveResult) => {
      let settled = false;
      let timedOut = false;
      let stdout = "";
      let stderr = "";
      let child: ReturnType<typeof spawn>;

      const finish = (result: { ok: boolean; detail: string }): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        logOutput("stdout", stdout);
        logOutput("stderr", stderr);
        resolveResult(result);
      };

      try {
        child = spawn("python3", ["commands/sync_via_discord_cli.py"], {
          cwd,
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (error) {
        resolveResult({
          ok: false,
          detail: `Discord mirror refresh could not start: ${error instanceof Error ? error.message : String(error)}`,
        });
        return;
      }

      child.stdout?.setEncoding("utf8");
      child.stderr?.setEncoding("utf8");
      child.stdout?.on("data", (chunk: string) => { stdout += chunk; });
      child.stderr?.on("data", (chunk: string) => { stderr += chunk; });

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, timeoutMs);

      child.once("error", (error) => {
        finish({ ok: false, detail: `Discord mirror refresh failed: ${error.message}` });
      });
      child.once("close", (code, signal) => {
        if (timedOut) {
          finish({ ok: false, detail: `Discord mirror refresh timed out after ${timeoutMs}ms` });
          return;
        }
        if (code !== 0) {
          const reason = stderr.trim() || stdout.trim() || `signal ${signal ?? "unknown"}`;
          finish({ ok: false, detail: `Discord mirror refresh exited with code ${String(code)}: ${reason}` });
          return;
        }
        finish({ ok: true, detail: "Discord mirror refresh completed" });
      });
    });
  } catch (error) {
    return {
      ok: false,
      detail: `Discord mirror refresh failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function writeJsonAtomically(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporaryPath, `${stableJson(value)}\n`, "utf8");
    renameSync(temporaryPath, path);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}

export function stageDiscordSyncBatches(options: {
  stateDir: string;
}): {
  corpusBatchIds: string[];
  staged: number;
  messageCount: number;
  days: number;
  channels: number;
  firstMessageAt: string | null;
  lastMessageAt: string | null;
} {
  const manifest = loadBackfillManifest(defaultBackfillManifestPath(options.stateDir, "discord"));
  const batches = planDiscordIncrementalBatches({
    rawRoot: resolve(sourceDataRoot("discord_raw"), "raw"),
    manifest,
  });
  const stagedRoot = resolve(options.stateDir, "staged_corpora");
  const dates = new Set<string>();
  const channelIds = new Set<string>();
  let firstTimestamp: number | null = null;
  let lastTimestamp: number | null = null;

  for (const batch of batches) {
    const payload = discordPayload(batch);
    for (const message of payload.messages) {
      if (typeof message.channel_id === "string") channelIds.add(message.channel_id);
      if (typeof message.timestamp !== "string") continue;
      const timestamp = Date.parse(message.timestamp);
      if (!Number.isFinite(timestamp)) continue;
      dates.add(new Date(timestamp).toISOString().slice(0, 10));
      firstTimestamp = firstTimestamp === null ? timestamp : Math.min(firstTimestamp, timestamp);
      lastTimestamp = lastTimestamp === null ? timestamp : Math.max(lastTimestamp, timestamp);
    }
    writeJsonAtomically(resolve(stagedRoot, `discord-${batch.batch_id}.json`), {
      batch,
      payload,
    });
  }

  return {
    corpusBatchIds: batches.map((batch) => `discord-${batch.batch_id}`),
    staged: batches.length,
    messageCount: batches.reduce(
      (total, batch) => total + (batch.descriptor as DiscordDescriptor).message_count,
      0,
    ),
    days: dates.size,
    channels: channelIds.size,
    firstMessageAt: firstTimestamp === null ? null : new Date(firstTimestamp).toISOString(),
    lastMessageAt: lastTimestamp === null ? null : new Date(lastTimestamp).toISOString(),
  };
}
