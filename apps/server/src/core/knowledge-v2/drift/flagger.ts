import { formatLocator, parseLocator } from "../locator.js";
import type {
  FactType,
  KnowledgeStoreHandle,
  SubjectRef,
} from "../records/index.js";
import {
  createCodeFileCache,
  resolveCodeCitation,
  type CodeFileCache,
} from "../apply/resolver.js";
import { resolveKnowledgeCheckout } from "../checkout.js";

export type DriftEvidenceStatus = "unchanged" | "drifted" | "unresolvable";

export interface DriftEvidenceEntry {
  fact_id: string;
  fact_type: FactType;
  evidence_id: string;
  locator: string;
  status: DriftEvidenceStatus;
  head_digest?: string;
  head_locator?: string;
}

export interface DriftReport {
  subject: SubjectRef;
  head_revision: string;
  evidence: DriftEvidenceEntry[];
  drifted_count: number;
  unresolvable_count: number;
}

export interface FlagCodeDriftOptions {
  subject: SubjectRef;
  checkoutRoot?: string;
  gameId?: string;
  stateDir?: string;
  headRevision?: string;
  codeFileCache?: CodeFileCache;
}

interface CodeEvidenceRow {
  fact_id: string;
  fact_type: FactType;
  evidence_id: string;
  locator: string;
  digest: string;
}

export function checkoutRevision(checkoutRoot: string): string {
  try {
    const result = Bun.spawnSync(
      ["git", "-C", checkoutRoot, "rev-parse", "--short", "HEAD"],
      { stdout: "pipe", stderr: "pipe" },
    );
    if (result.exitCode !== 0) return "unknown";
    return result.stdout.toString().trim() || "unknown";
  } catch {
    return "unknown";
  }
}

export function codeEvidenceSql(subject: SubjectRef): string {
  const subjectColumn = subject.targetId !== undefined ? "target_id" : "entity_id";
  return `SELECT
      f.id AS fact_id,
      f.type AS fact_type,
      e.id AS evidence_id,
      e.locator,
      e.digest
    FROM fact f
    CROSS JOIN evidence e ON e.fact_id = f.id
    WHERE f.${subjectColumn} = ? AND e.kind = 'code'
    ORDER BY f.id, e.id`;
}

function codeEvidenceRows(
  store: KnowledgeStoreHandle,
  subject: SubjectRef,
): CodeEvidenceRow[] {
  if (subject.targetId !== undefined) {
    return store.db.query<CodeEvidenceRow, [string]>(codeEvidenceSql(subject)).all(subject.targetId);
  }
  return store.db.query<CodeEvidenceRow, [string]>(codeEvidenceSql(subject)).all(subject.entityId);
}

export function flagCodeDrift(
  store: KnowledgeStoreHandle,
  options: FlagCodeDriftOptions,
): DriftReport {
  const resolvedCheckout = options.checkoutRoot === undefined
    ? resolveKnowledgeCheckout({ gameId: options.gameId ?? "melee", stateDir: options.stateDir })
    : undefined;
  const checkoutRoot = options.checkoutRoot ?? resolvedCheckout!.checkoutRoot;
  const headRevision = options.headRevision?.trim()
    || resolvedCheckout?.headRevision
    || checkoutRevision(checkoutRoot);
  const codeFileCache = options.codeFileCache ?? createCodeFileCache(checkoutRoot);
  const evidence = codeEvidenceRows(store, options.subject).map((row): DriftEvidenceEntry => {
    let parsed: ReturnType<typeof parseLocator>;
    try {
      parsed = parseLocator(row.locator, "code");
    } catch {
      return {
        fact_id: row.fact_id,
        fact_type: row.fact_type,
        evidence_id: row.evidence_id,
        locator: row.locator,
        status: "unresolvable",
      };
    }
    if (parsed.kind !== "code") {
      return {
        fact_id: row.fact_id,
        fact_type: row.fact_type,
        evidence_id: row.evidence_id,
        locator: row.locator,
        status: "unresolvable",
      };
    }

    const headLocator = formatLocator({
      ...parsed,
      revision: headRevision,
    });
    const resolution = resolveCodeCitation(
      headRevision,
      parsed.path,
      parsed.startLine,
      parsed.endLine,
      checkoutRoot,
      codeFileCache,
    );
    if (!resolution.ok || resolution.digest === null) {
      return {
        fact_id: row.fact_id,
        fact_type: row.fact_type,
        evidence_id: row.evidence_id,
        locator: row.locator,
        status: "unresolvable",
        head_locator: headLocator,
      };
    }
    return {
      fact_id: row.fact_id,
      fact_type: row.fact_type,
      evidence_id: row.evidence_id,
      locator: row.locator,
      status: resolution.digest === row.digest ? "unchanged" : "drifted",
      head_digest: resolution.digest,
      head_locator: headLocator,
    };
  });

  return {
    subject: options.subject,
    head_revision: headRevision,
    evidence,
    drifted_count: evidence.filter(({ status }) => status === "drifted").length,
    unresolvable_count: evidence.filter(({ status }) => status === "unresolvable").length,
  };
}
