import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolvePrComment } from "../ingest/prs.js";
import { parseLocator } from "../locator.js";
import type { KnowledgeStoreHandle, SourceKind } from "../records/index.js";

export type CodeFileReadResult =
  | { ok: true; lines: string[] }
  | { ok: false; reason: "code_revision_unresolvable" };

export interface CodeFileCache {
  read(revision: string, path: string): CodeFileReadResult;
}

export type CodeFileSpawnSync = (
  command: string[],
  options: { stdout: "pipe"; stderr: "pipe" },
) => { exitCode: number; stdout: { toString(): string } };

export interface CodeFileCacheDependencies {
  spawnSync?: CodeFileSpawnSync;
}

const CODE_FILE_CACHE_LIMIT = 512;

function splitLines(content: string): string[] {
  const lines = content.length === 0 ? [] : content.split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

function readCodeFileAtRevision(
  checkoutRoot: string,
  revision: string,
  path: string,
  spawnSync: CodeFileSpawnSync,
): CodeFileReadResult {
  try {
    const result = spawnSync(
      ["git", "-C", checkoutRoot, "show", `${revision}:${path}`],
      { stdout: "pipe", stderr: "pipe" },
    );
    return result.exitCode === 0
      ? { ok: true, lines: splitLines(result.stdout.toString()) }
      : { ok: false, reason: "code_revision_unresolvable" };
  } catch {
    return { ok: false, reason: "code_revision_unresolvable" };
  }
}

export function createCodeFileCache(
  checkoutRoot: string,
  dependencies: CodeFileCacheDependencies = {},
): CodeFileCache {
  const entries = new Map<string, CodeFileReadResult>();
  let headRevision: string | null | undefined;
  const spawnSync: CodeFileSpawnSync = dependencies.spawnSync
    ?? ((command, options) => Bun.spawnSync(command, options));

  const currentHeadRevision = (): string | null => {
    if (headRevision !== undefined) return headRevision;
    try {
      const result = spawnSync(
        ["git", "-C", checkoutRoot, "rev-parse", "--short", "HEAD"],
        { stdout: "pipe", stderr: "pipe" },
      );
      headRevision = result.exitCode === 0 ? result.stdout.toString().trim() || null : null;
    } catch {
      headRevision = null;
    }
    return headRevision;
  };

  const remember = (key: string, result: CodeFileReadResult): CodeFileReadResult => {
    entries.set(key, result);
    if (entries.size > CODE_FILE_CACHE_LIMIT) {
      const oldestKey = entries.keys().next().value;
      if (oldestKey !== undefined) entries.delete(oldestKey);
    }
    return result;
  };

  return {
    read(revision: string, path: string): CodeFileReadResult {
      const key = `${revision}:${path}`;
      const cached = entries.get(key);
      if (cached !== undefined) {
        entries.delete(key);
        entries.set(key, cached);
        return cached;
      }

      if (revision === currentHeadRevision()) {
        try {
          return remember(key, {
            ok: true,
            lines: splitLines(readFileSync(join(checkoutRoot, path), "utf8")),
          });
        } catch {
          // The path may be absent from the worktree but present at HEAD.
        }
      }

      return remember(key, readCodeFileAtRevision(checkoutRoot, revision, path, spawnSync));
    },
  };
}

export interface CitationInput {
  kind: SourceKind;
  locator: string;
}

export interface CitationResolveOptions {
  checkoutRoot: string;
  prsRoot?: string;
  codeFileCache?: CodeFileCache;
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
  | { ok: false; reason: CitationResolutionReason; lineCount?: number };

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
  cache?: CodeFileCache,
): CitationResolution {
  const file = cache?.read(revision, path) ?? readCodeFileAtRevision(
    checkoutRoot,
    revision,
    path,
    (command, options) => Bun.spawnSync(command, options),
  );
  if (!file.ok) return file;
  const lines = file.lines;
  if (startLine > endLine || endLine > lines.length) {
    return { ok: false, reason: "code_span_out_of_range", lineCount: lines.length };
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
        options.codeFileCache,
      );
  }
}
