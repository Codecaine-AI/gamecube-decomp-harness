import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { getWatermark } from "../records/index.js";
import { openKnowledgeStore, type KnowledgeStore } from "../storage/store.js";
import { importAttempts, type AttemptsImportOptions } from "./attempts.js";
import { importDiscord, type DiscordImportOptions } from "./discord.js";
import { importPrs, type ImportPrsResult, type PrImportOptions } from "./prs.js";
import { reconcileReport, type ReconcileOptions } from "./reconcile.js";
import type {
  AttemptsImportResult,
  DiscordImportResult,
  PrImportResult,
  ReconcileResult,
} from "./types.js";

export const KNOWLEDGE_INTAKE_SYNC_LANES = ["reconcile", "prs", "discord", "attempts"] as const;

export type KnowledgeIntakeLane = (typeof KNOWLEDGE_INTAKE_SYNC_LANES)[number];

export interface RunKnowledgeIntakeInput {
  knowledgeRoot: string;
  checkoutRoot: string;
  reportPath: string;
  /** Short git HEAD for the checkout revision that produced reportPath. */
  expectedHead: string;
  prNumbers: readonly number[];
  /** Root of the past_prs source. The fetch script lives under its commands directory. */
  sourceRoot: string;
  fetch: {
    enabled: boolean;
  };
  /** Ordered subset of the sync lanes. */
  lanes: readonly KnowledgeIntakeLane[];
  dryRun: boolean;
  log: (message: string) => void;
}

export interface KnowledgeIntakeIngestResult {
  reconcile?: ReconcileResult;
  prs?: ImportPrsResult;
  discord?: DiscordImportResult;
  attempts?: AttemptsImportResult;
}

export interface KnowledgeIntakeResult {
  fetched_prs: number[];
  skipped_prs: number[];
  repaired_prs?: number[];
  ingest: KnowledgeIntakeIngestResult;
}

export interface KnowledgeIntakeDependencies {
  checkoutHead(checkoutRoot: string): Promise<string>;
  runFetch(command: readonly string[]): Promise<void>;
  prWatermark(store: KnowledgeStore): string | null;
  openStore(options: { knowledgeRoot: string }): KnowledgeStore;
  reconcile(store: KnowledgeStore, options: ReconcileOptions): ReconcileResult;
  prs(store: KnowledgeStore, options: PrImportOptions): ImportPrsResult;
  discord(store: KnowledgeStore, options: DiscordImportOptions): DiscordImportResult;
  attempts(store: KnowledgeStore, options: AttemptsImportOptions): AttemptsImportResult;
}

interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

async function runProcess(command: readonly string[]): Promise<ProcessResult> {
  const process = Bun.spawn([...command], { stdout: "pipe", stderr: "pipe" });
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

async function checkoutHead(checkoutRoot: string): Promise<string> {
  const result = await runProcess(["git", "-C", checkoutRoot, "rev-parse", "--short", "HEAD"]);
  if (result.exitCode !== 0) {
    throw new Error(
      `Knowledge intake could not read checkout HEAD for ${checkoutRoot}: ${result.stderr.trim() || `git exited ${result.exitCode}`}`,
    );
  }
  return result.stdout.trim();
}

async function runFetch(command: readonly string[]): Promise<void> {
  const result = await runProcess(command);
  if (result.exitCode !== 0) {
    throw new Error(
      `Knowledge intake PR fetch failed with exit ${result.exitCode}: ${result.stderr.trim() || command.join(" ")}`,
    );
  }
}

const defaultDependencies: KnowledgeIntakeDependencies = {
  checkoutHead,
  runFetch,
  prWatermark: (store) => getWatermark(store, "pr"),
  openStore: (options) => openKnowledgeStore(options),
  reconcile: (store, options) => reconcileReport(store, options),
  prs: (store, options) => importPrs(store, options),
  discord: (store, options) => importDiscord(store, options),
  attempts: (store, options) => importAttempts(store, options),
};

interface RepairPrMetadata {
  number?: unknown;
  title?: unknown;
  merge_commit_sha?: unknown;
}

interface RepairedChangedFile {
  pr: number;
  title: string;
  file: string;
  added: number;
  deleted: number;
  hunks: number;
}

function archivedPrNumbersAboveWatermark(prsRoot: string, watermark: string | null): number[] {
  if (!existsSync(prsRoot)) return [];
  const parsedWatermark = watermark === null ? -1 : Number(watermark);
  const watermarkNumber = Number.isFinite(parsedWatermark) ? parsedWatermark : -1;
  return readdirSync(prsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^pr-\d+$/.test(entry.name))
    .map((entry) => Number(entry.name.slice(3)))
    .filter((prNumber) => prNumber > watermarkNumber);
}

function countDiffHunksByFile(diff: string): number[] {
  const counts: number[] = [];
  let currentIndex = -1;
  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith("diff --git ")) {
      counts.push(0);
      currentIndex += 1;
    } else if (currentIndex >= 0 && line.startsWith("@@ ")) {
      counts[currentIndex] += 1;
    }
  }
  return counts;
}

function renamedPath(path: string): string {
  const braceRename = path.replace(/\{[^{}]* => ([^{}]*)\}/g, "$1");
  const renameMarker = " => ";
  const markerIndex = braceRename.lastIndexOf(renameMarker);
  return markerIndex === -1 ? braceRename : braceRename.slice(markerIndex + renameMarker.length);
}

function parseNumstat(
  prNumber: number,
  title: string,
  numstat: string,
  hunksByFile: readonly number[],
): RepairedChangedFile[] {
  const files: RepairedChangedFile[] = [];
  for (const line of numstat.split(/\r?\n/)) {
    if (line.trim() === "") continue;
    const fields = line.split("\t");
    if (fields.length < 3) continue;
    const [added, deleted, ...pathFields] = fields;
    files.push({
      pr: prNumber,
      title,
      file: renamedPath(pathFields.join("\t")),
      added: added === "-" ? 0 : Number(added),
      deleted: deleted === "-" ? 0 : Number(deleted),
      hunks: hunksByFile[files.length] ?? 0,
    });
  }
  return files;
}

async function repairPrArchives(options: {
  prsRoot: string;
  checkoutRoot: string;
  prNumbers: readonly number[];
  log: (message: string) => void;
}): Promise<number[]> {
  const repaired: number[] = [];
  for (const prNumber of options.prNumbers) {
    const prRoot = resolve(options.prsRoot, `pr-${prNumber}`);
    const metadataPath = resolve(prRoot, "raw/pr.json");
    if (!existsSync(metadataPath)) continue;

    const diffPath = resolve(prRoot, "raw/diff.diff");
    const changedFilesPath = resolve(prRoot, "extracted/changed_files.jsonl");
    const needsDiff = !existsSync(diffPath) || statSync(diffPath).size === 0;
    const needsChangedFiles = !existsSync(changedFilesPath);
    if (!needsDiff && !needsChangedFiles) continue;

    let metadata: RepairPrMetadata;
    try {
      metadata = JSON.parse(readFileSync(metadataPath, "utf8")) as RepairPrMetadata;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      options.log(`[knowledge-intake] PR #${prNumber} repair skipped: ${detail}`);
      continue;
    }
    const sha = typeof metadata.merge_commit_sha === "string" ? metadata.merge_commit_sha.trim() : "";
    if (sha === "") continue;

    let commit = await runProcess(["git", "-C", options.checkoutRoot, "cat-file", "-e", `${sha}^{commit}`]);
    if (commit.exitCode !== 0) {
      await runProcess(["git", "-C", options.checkoutRoot, "fetch", "origin", sha]);
      commit = await runProcess(["git", "-C", options.checkoutRoot, "cat-file", "-e", `${sha}^{commit}`]);
    }
    if (commit.exitCode !== 0) {
      options.log(
        `[knowledge-intake] PR #${prNumber} repair skipped: merge commit ${sha} is unavailable locally after git fetch origin`,
      );
      continue;
    }

    const [diff, numstat] = await Promise.all([
      runProcess(["git", "-C", options.checkoutRoot, "show", "--format=", "--no-color", sha]),
      runProcess(["git", "-C", options.checkoutRoot, "show", "--format=", "--numstat", "-M", sha]),
    ]);
    if (diff.exitCode !== 0 || numstat.exitCode !== 0) {
      const detail = diff.stderr.trim() || numstat.stderr.trim() || `git show exited ${diff.exitCode || numstat.exitCode}`;
      options.log(`[knowledge-intake] PR #${prNumber} repair skipped: ${detail}`);
      continue;
    }

    const number = typeof metadata.number === "number" ? metadata.number : prNumber;
    const title = typeof metadata.title === "string" ? metadata.title : "";
    const changedFiles = parseNumstat(number, title, numstat.stdout, countDiffHunksByFile(diff.stdout));
    mkdirSync(resolve(prRoot, "raw"), { recursive: true });
    mkdirSync(resolve(prRoot, "extracted"), { recursive: true });
    writeFileSync(diffPath, diff.stdout);
    const jsonLines = changedFiles.map((file) => JSON.stringify(file)).join("\n");
    writeFileSync(changedFilesPath, jsonLines + (jsonLines === "" ? "" : "\n"));
    repaired.push(prNumber);
  }
  return repaired;
}

function validateLanes(lanes: readonly KnowledgeIntakeLane[]): void {
  let previousIndex = -1;
  for (const lane of lanes) {
    const index = KNOWLEDGE_INTAKE_SYNC_LANES.indexOf(lane);
    if (index <= previousIndex) {
      throw new Error(
        `Knowledge intake lanes must be a unique ordered subset of ${KNOWLEDGE_INTAKE_SYNC_LANES.join(", ")}`,
      );
    }
    previousIndex = index;
  }
}

function isArchivedPr(prsRoot: string, prNumber: number): boolean {
  const path = resolve(prsRoot, `pr-${prNumber}`);
  return existsSync(path) && statSync(path).isDirectory();
}

function laneLog(lane: KnowledgeIntakeLane, result: ReconcileResult | PrImportResult | DiscordImportResult | AttemptsImportResult): string {
  if (lane === "reconcile") {
    const reconcile = result as ReconcileResult;
    return `[knowledge-intake] reconcile: report=${reconcile.reportRevision} renames=${reconcile.renames.applied}`;
  }
  const counts = result as PrImportResult | DiscordImportResult | AttemptsImportResult;
  return `[knowledge-intake] ${lane}: inserted=${counts.inserted} skipped=${counts.skipped} tasks_enqueued=${counts.tasksEnqueued}`;
}

/**
 * Fetches missing merged PR archives, then imports the requested V2 sync lanes.
 * `expectedHead` identifies the checkout revision that produced `reportPath`.
 */
export async function runKnowledgeIntake(
  input: RunKnowledgeIntakeInput,
  dependencyOverrides: Partial<KnowledgeIntakeDependencies> = {},
): Promise<KnowledgeIntakeResult> {
  const dependencies: KnowledgeIntakeDependencies = { ...defaultDependencies, ...dependencyOverrides };
  validateLanes(input.lanes);
  const knowledgeRoot = resolve(input.knowledgeRoot);
  const checkoutRoot = resolve(input.checkoutRoot);
  const reportPath = resolve(input.reportPath);
  const sourceRoot = resolve(input.sourceRoot);

  if (!existsSync(reportPath)) {
    throw new Error(`Knowledge intake report is missing: ${reportPath}. Rebuild the report for checkout ${checkoutRoot} first.`);
  }
  const actualHead = await dependencies.checkoutHead(checkoutRoot);
  if (actualHead !== input.expectedHead) {
    throw new Error(
      `Knowledge intake report ${reportPath} was built for ${input.expectedHead}, but checkout ${checkoutRoot} is at ${actualHead}. Rebuild the report first.`,
    );
  }

  const dataRoot = resolve(knowledgeRoot, "sources/code_context/past_prs/data");
  const prsRoot = resolve(dataRoot, "prs");
  const prNumbers = [...new Set(input.prNumbers)].sort((left, right) => left - right);
  const skippedPrs = prNumbers.filter((prNumber) => isArchivedPr(prsRoot, prNumber));
  const missingPrs = prNumbers.filter((prNumber) => !isArchivedPr(prsRoot, prNumber));
  const fetchedPrs = input.fetch.enabled && !input.dryRun ? missingPrs : [];

  if (input.fetch.enabled && missingPrs.length > 0) {
    const command = [
      "python3",
      resolve(sourceRoot, "commands/fetch_recent_pr_dump.py"),
      "--dump-root",
      dataRoot,
      "--postmortem-mode",
      "off",
      "--fetch-jobs",
      "4",
      ...missingPrs.flatMap((prNumber) => ["--pr", String(prNumber)]),
      ...(input.dryRun ? ["--dry-run"] : []),
    ];
    await dependencies.runFetch(command);
  }

  let temporaryStoreRoot: string | undefined;
  const storeRoot = input.dryRun && !existsSync(resolve(knowledgeRoot, "knowledge.sqlite"))
    ? (temporaryStoreRoot = mkdtempSync(resolve(tmpdir(), "knowledge-intake-")))
    : knowledgeRoot;
  const store = dependencies.openStore({ knowledgeRoot: storeRoot });
  const ingest: KnowledgeIntakeIngestResult = {};
  let repairedPrs: number[] = [];

  try {
    if (!input.dryRun && input.lanes.includes("prs")) {
      const repairNumbers = new Set(prNumbers);
      for (const prNumber of archivedPrNumbersAboveWatermark(prsRoot, dependencies.prWatermark(store))) {
        repairNumbers.add(prNumber);
      }
      repairedPrs = await repairPrArchives({
        prsRoot,
        checkoutRoot,
        prNumbers: [...repairNumbers].sort((left, right) => left - right),
        log: input.log,
      });
    }
    for (const lane of input.lanes) {
      if (lane === "reconcile") {
        const result = dependencies.reconcile(store, {
          reportPath,
          headRevision: input.expectedHead,
          dryRun: input.dryRun,
        });
        ingest.reconcile = result;
        input.log(laneLog(lane, result));
      } else if (lane === "prs") {
        const result = dependencies.prs(store, { prsRoot, dryRun: input.dryRun });
        ingest.prs = result;
        input.log(laneLog(lane, result));
      } else if (lane === "discord") {
        const result = dependencies.discord(store, {
          rawRoot: resolve(knowledgeRoot, "sources/rag_search/discord_raw/data/raw"),
          channelsConfigPath: resolve(knowledgeRoot, "sources/rag_search/discord_raw/config/channels.json"),
          dryRun: input.dryRun,
        });
        ingest.discord = result;
        input.log(laneLog(lane, result));
      } else {
        const result = dependencies.attempts(store, {
          orchestratorDbPath: resolve(dirname(knowledgeRoot), "state/orchestrator.sqlite"),
          dryRun: input.dryRun,
        });
        ingest.attempts = result;
        input.log(laneLog(lane, result));
      }
    }
  } finally {
    store.close();
    if (temporaryStoreRoot) rmSync(temporaryStoreRoot, { recursive: true, force: true });
  }

  return { fetched_prs: fetchedPrs, skipped_prs: skippedPrs, repaired_prs: repairedPrs, ingest };
}
