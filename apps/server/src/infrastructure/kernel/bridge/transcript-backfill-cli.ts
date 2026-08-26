import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { resolveGame } from "@server/core/game-registry";

import { getDefaultMeleeKernelRuntime } from "./runtime.js";
import { runMeleeTranscriptBackfill } from "./transcript-backfill.js";

function usage(): never {
  throw new Error([
    "Usage: bun transcript-backfill-cli.ts [--root <dir> ...] [--batch-size N] [--dry-run]",
    "With no --root, scans <stateDir>/runs, <repoRoot>/.pi-sessions, and the default game checkout's .pi-sessions when those directories exist.",
  ].join("\n"));
}

export function resolveDefaultTranscriptBackfillRoots(options: {
  orchestratorRoot?: string;
  pathExists?: (path: string) => boolean;
  resolveGamePaths?: (orchestratorRoot: string) => { stateDir: string; repoRoot: string };
} = {}): string[] {
  const orchestratorRoot = resolve(options.orchestratorRoot ?? resolve(import.meta.dir, "../../../../../.."));
  const game = options.resolveGamePaths?.(orchestratorRoot)
    ?? resolveGame({ orchestratorRoot, useDefaultGame: true });
  const pathExists = options.pathExists ?? existsSync;
  return [
    resolve(game.stateDir, "runs"),
    resolve(orchestratorRoot, ".pi-sessions"),
    resolve(game.repoRoot, ".pi-sessions"),
  ].filter(pathExists);
}

export function parseArgs(argv: string[], defaultRoots = resolveDefaultTranscriptBackfillRoots()): {
  roots: string[];
  batchSize?: number;
  dryRun: boolean;
} {
  const roots: string[] = [];
  let batchSize: number | undefined;
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--root") {
      const root = argv[++i];
      if (!root) usage();
      roots.push(root);
    } else if (arg === "--batch-size") {
      const value = Number(argv[++i]);
      if (!Number.isInteger(value) || value <= 0) usage();
      batchSize = value;
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else {
      usage();
    }
  }
  return { roots: roots.length > 0 ? roots : defaultRoots, batchSize, dryRun };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const runtime = await getDefaultMeleeKernelRuntime();
  if (!runtime) throw new Error("Melee kernel runtime is unavailable");
  try {
    const summary = await runMeleeTranscriptBackfill({ db: runtime.db, ...args });
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await runtime.close();
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
