import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

export const REVIEW_LEDGER_SCHEMA_VERSION = "pr_review_ledger_v2";
export const LEGACY_REVIEW_LEDGER_SCHEMA_VERSION = "pr_review_ledger_v1";

export type LedgerEntrySource = "review_lint" | "llm_qa";
export type LedgerEntrySeverity = "error" | "warning";
export type LedgerEntryDisposition = "unresolved" | "left_with_evidence" | "false_positive";
export type LedgerEntryTier = 1 | 2 | 3;

export interface LedgerMatchContext {
  function: string | null;
  fuzzy_percent: number | null;
  exact: boolean | null;
  repair_reverted: string | null;
}

export interface LedgerEntry {
  source: LedgerEntrySource;
  severity: LedgerEntrySeverity;
  file: string;
  line: number;
  ruleId: string | null;
  standardId: string | null;
  message: string;
  suggestedFix: string | null;
  disposition: LedgerEntryDisposition;
  evidence: string | null;
  tier?: LedgerEntryTier;
  match_context?: LedgerMatchContext | null;
}

export interface ReviewLedgerSummary {
  files_scanned: number;
  files_repaired: number;
  entries: number;
  by_severity: Partial<Record<LedgerEntrySeverity, number>>;
}

export interface ReviewLedger {
  schema_version: typeof REVIEW_LEDGER_SCHEMA_VERSION | typeof LEGACY_REVIEW_LEDGER_SCHEMA_VERSION;
  run_id: string;
  created_at: string;
  head_sha: string;
  worktree_dirty: boolean;
  base_ref: string;
  entries: LedgerEntry[];
  summary: ReviewLedgerSummary;
}

interface LedgerCandidate {
  path: string;
  mtimeMs: number;
  stable: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function ledgerCandidate(path: string, stable: boolean): LedgerCandidate | null {
  try {
    const stat = statSync(path);
    return stat.isFile() ? { path, mtimeMs: stat.mtimeMs, stable } : null;
  } catch {
    return null;
  }
}

function normalizeFindingPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/^\/+/, "");
}

const TIER_ONE_STANDARD_IDS = new Set([
  "literals-and-data-ownership",
  "no-string-literal-symbol-regression",
  "canonical-control-flow-and-macros",
  "assert-report-macros",
  "header-inlines",
  "avoid-pragmas-register-asm",
  "no-define-alias-global-renames",
  "data-sections-and-tu-splits",
  "text-before-data-matching",
]);

const ALWAYS_TIER_THREE_STANDARD_IDS = new Set([
  "matching-tactics-need-evidence",
  "truthful-headers-and-includes",
  "infer-authored-source-style",
  "typed-fields-over-pointer-math",
  "conservative-naming",
  "natural-loops",
]);

function normalizedPolicyId(value: string | null): string {
  const suffix = (value ?? "").trim().toLowerCase().split(/[:/]/).at(-1) ?? "";
  return suffix.replace(/_/g, "-");
}

/** Apply the owner-approved posting tiers to both new and legacy ledger entries. */
export function computeLedgerEntryTier(entry: Pick<LedgerEntry, "source" | "severity" | "ruleId" | "standardId" | "disposition">): LedgerEntryTier {
  const policyIds = [normalizedPolicyId(entry.ruleId), normalizedPolicyId(entry.standardId)].filter(Boolean);
  if (policyIds.some((id) => ALWAYS_TIER_THREE_STANDARD_IDS.has(id))) return 3;
  if (entry.disposition === "left_with_evidence") return 2;
  if (entry.severity !== "error" || entry.disposition !== "unresolved") return 3;
  return entry.source === "review_lint" || policyIds.some((id) => TIER_ONE_STANDARD_IDS.has(id)) ? 1 : 3;
}

function normalizeLedgerEntry(entry: LedgerEntry): LedgerEntry {
  return {
    ...entry,
    tier: computeLedgerEntryTier(entry),
    match_context: entry.match_context ?? null,
  };
}

export function loadReviewLedger(path: string): ReviewLedger {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (
    !isRecord(parsed)
    || (parsed.schema_version !== REVIEW_LEDGER_SCHEMA_VERSION && parsed.schema_version !== LEGACY_REVIEW_LEDGER_SCHEMA_VERSION)
  ) {
    const actual = isRecord(parsed) && typeof parsed.schema_version === "string" ? parsed.schema_version : "missing";
    throw new Error(
      `Unsupported review ledger schema_version ${actual}; expected ${LEGACY_REVIEW_LEDGER_SCHEMA_VERSION} or ${REVIEW_LEDGER_SCHEMA_VERSION}.`,
    );
  }
  const ledger = parsed as unknown as ReviewLedger;
  return {
    ...ledger,
    entries: Array.isArray(ledger.entries) ? ledger.entries.map(normalizeLedgerEntry) : [],
  };
}

export function findLatestLedger(stateDir: string): string | null {
  const root = resolve(stateDir, "pr_session_review");
  if (!existsSync(root)) return null;

  const candidates: LedgerCandidate[] = [];
  try {
    for (const runEntry of readdirSync(root, { withFileTypes: true })) {
      if (!runEntry.isDirectory()) continue;
      const runRoot = resolve(root, runEntry.name);
      const stable = ledgerCandidate(resolve(runRoot, "ledger.json"), true);
      if (stable) candidates.push(stable);

      for (const invocationEntry of readdirSync(runRoot, { withFileTypes: true })) {
        if (!invocationEntry.isDirectory()) continue;
        const artifact = ledgerCandidate(resolve(runRoot, invocationEntry.name, "ledger.json"), false);
        if (artifact) candidates.push(artifact);
      }
    }
  } catch {
    return null;
  }

  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs || Number(right.stable) - Number(left.stable) || right.path.localeCompare(left.path));
  return candidates[0]?.path ?? null;
}

export function ledgerEntriesForFiles(ledger: ReviewLedger, files: string[]): LedgerEntry[] {
  const normalizedFiles = new Set(files.map(normalizeFindingPath).filter(Boolean));
  return ledger.entries.flatMap((entry) => {
    const file = normalizeFindingPath(entry.file);
    return normalizedFiles.has(file) ? [{ ...entry, file }] : [];
  });
}

export function ledgerAnchorsReliable(ledgerHeadSha: string, sessionHeadSha: string): boolean {
  const ledgerSha = ledgerHeadSha.trim().toLowerCase();
  const currentSha = sessionHeadSha.trim().toLowerCase();
  return Boolean(ledgerSha && currentSha && ledgerSha === currentSha);
}
