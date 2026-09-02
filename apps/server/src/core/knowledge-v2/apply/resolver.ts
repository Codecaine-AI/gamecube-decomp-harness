import { createHash } from "node:crypto";
import { resolvePrComment } from "../ingest/prs.js";
import { parseLocator } from "../locator.js";
import type { KnowledgeStoreHandle, SourceKind } from "../records/index.js";

export interface CitationInput {
  kind: SourceKind;
  locator: string;
}

export interface CitationResolveOptions {
  checkoutRoot: string;
  prsRoot?: string;
}

export type CitationResolutionReason =
  | "malformed_locator"
  | "kind_locator_mismatch"
  | "unresolved_locator"
  | "pr_comment_not_found"
  | "pr_comments_unavailable"
  | "submission_not_found"
  | "code_revision_unresolvable"
  | "code_span_out_of_range";

export type CitationResolution =
  | { ok: true; digest: string | null }
  | { ok: false; reason: CitationResolutionReason };

function exists(
  store: KnowledgeStoreHandle,
  sql: string,
  ...parameters: Array<string | number>
): boolean {
  return store.db.query<{ found: number }, Array<string | number>>(sql).get(...parameters) != null;
}

export function resolveCodeCitation(
  revision: string,
  path: string,
  startLine: number,
  endLine: number,
  checkoutRoot: string,
): CitationResolution {
  let content: string;
  try {
    const result = Bun.spawnSync(
      ["git", "-C", checkoutRoot, "show", `${revision}:${path}`],
      { stdout: "pipe", stderr: "pipe" },
    );
    if (result.exitCode !== 0) {
      return { ok: false, reason: "code_revision_unresolvable" };
    }
    content = result.stdout.toString();
  } catch {
    return { ok: false, reason: "code_revision_unresolvable" };
  }

  const lines = content.length === 0 ? [] : content.split("\n");
  if (lines.at(-1) === "") lines.pop();
  if (startLine > endLine || endLine > lines.length) {
    return { ok: false, reason: "code_span_out_of_range" };
  }

  const span = lines.slice(startLine - 1, endLine).join("\n");
  const digest = createHash("sha256").update(span).digest("hex").slice(0, 16);
  return { ok: true, digest: `sha256:${digest}` };
}

export function resolveCitation(
  store: KnowledgeStoreHandle,
  citation: CitationInput,
  options: CitationResolveOptions,
): CitationResolution {
  let parsed: ReturnType<typeof parseLocator>;
  try {
    parsed = parseLocator(citation.locator);
  } catch {
    return { ok: false, reason: "malformed_locator" };
  }

  if (parsed.kind !== citation.kind) {
    return { ok: false, reason: "kind_locator_mismatch" };
  }

  switch (parsed.kind) {
    case "discord":
      return exists(
        store,
        "SELECT 1 AS found FROM discord_message WHERE id = ? LIMIT 1",
        parsed.messageId,
      )
        ? { ok: true, digest: null }
        : { ok: false, reason: "unresolved_locator" };

    case "wiki":
      return exists(
        store,
        "SELECT 1 AS found FROM wiki_section WHERE id = ? LIMIT 1",
        parsed.sectionId,
      )
        ? { ok: true, digest: null }
        : { ok: false, reason: "unresolved_locator" };

    case "pr": {
      const matchingPr = exists(
        store,
        `SELECT 1 AS found FROM pull_request
          WHERE id = ? OR pr_ref = ? OR pr_ref LIKE ?
          LIMIT 1`,
        parsed.pullRequestId,
        parsed.pullRequestId,
        `%#${parsed.pullRequestId}`,
      );
      if (!matchingPr) return { ok: false, reason: "unresolved_locator" };
      if (parsed.commentNumber === undefined) return { ok: true, digest: null };
      if (options.prsRoot === undefined) {
        return { ok: false, reason: "pr_comments_unavailable" };
      }

      const prNumber = Number(parsed.pullRequestId);
      try {
        return resolvePrComment(options.prsRoot, prNumber, parsed.commentNumber) === null
          ? { ok: false, reason: "pr_comment_not_found" }
          : { ok: true, digest: null };
      } catch {
        return { ok: false, reason: "pr_comment_not_found" };
      }
    }

    case "attempt": {
      const run = store.db.query<{ id: string }, [string, string]>(
        "SELECT id FROM worker_run WHERE id = ? OR run_id = ? LIMIT 1",
      ).get(parsed.runId, parsed.runId);
      if (run == null) return { ok: false, reason: "unresolved_locator" };
      if (parsed.submissionSequence !== undefined && !exists(
        store,
        "SELECT 1 AS found FROM submission WHERE worker_run_id = ? AND seq = ? LIMIT 1",
        run.id,
        parsed.submissionSequence,
      )) {
        return { ok: false, reason: "submission_not_found" };
      }

      // Transcript spans have no durable row to resolve. The closed locator grammar is the check.
      return { ok: true, digest: null };
    }

    case "code":
      return resolveCodeCitation(
        parsed.revision,
        parsed.path,
        parsed.startLine,
        parsed.endLine,
        options.checkoutRoot,
      );
  }
}
