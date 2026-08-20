import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, relative, resolve } from "node:path";
import { knowledgeSourcesRoot, packageRoot } from "../../paths.js";
import type { GraphEntity, GraphFact, GraphRecords, SearchChunk, SourceDescriptor } from "../types.js";
import { filesFingerprint, shortHash, truncate } from "../util.js";

const MAX_FILE_SIZE = 512 * 1024;
const TEXT_CHUNK_SIZE = 2400;
const SUPPORTED_EXTENSIONS = new Set([".md", ".txt", ".json", ".jsonl"]);

interface DocumentFile {
  absPath: string;
  relPath: string;
  fileKind: string;
}

interface MarkdownSection {
  chunkKey: string;
  headingPath: string;
  text: string;
  titleText: string;
}

/** Build graph records for a registry-backed document source. */
export function buildDocumentSourceGraphRecords(
  source: SourceDescriptor,
  options: { sourcesRoot?: string } = {},
): GraphRecords | null {
  const root = resolve(options.sourcesRoot ?? knowledgeSourcesRoot(), source.path ?? source.id);
  const files = candidateFiles(root);
  if (files.length === 0) return null;

  const sourcePaths = files.map((file) => file.absPath);
  const contentHash = shortHash(filesFingerprint(sourcePaths));
  const sourceVersionId = `source-version:${source.id}:${contentHash}`;
  const entities: GraphEntity[] = [];
  const facts: GraphFact[] = [];
  const chunks: SearchChunk[] = [];

  for (const file of files) {
    const evidenceRef = fileEvidenceRef(file.absPath);
    const entityId = `resource:${source.id}:${shortHash(file.relPath)}`;
    const payload = {
      source_id: source.id,
      rel_path: file.relPath,
      evidence_ref: evidenceRef,
      file_kind: file.fileKind,
    };

    entities.push({
      id: entityId,
      entityType: "source_document",
      stableKey: `${source.id}:${file.relPath}`,
      payload,
    });
    facts.push({
      id: `fact:${source.id}:${shortHash(file.relPath)}`,
      entityId,
      factType: "source_document",
      payload,
      confidence: 0.8,
      trustTier: source.trust_tier,
      evidenceRef,
      sourceVersionId,
    });
    chunks.push(...fileChunks(source, file, entityId, evidenceRef, sourceVersionId));
  }

  return {
    sourceVersion: {
      id: sourceVersionId,
      sourceId: source.id,
      contentHash,
      sourcePaths,
    },
    entities,
    facts,
    edges: [],
    chunks,
  };
}

function candidateFiles(root: string): DocumentFile[] {
  if (!existsSync(root)) return [];
  const paths: string[] = [];
  const readmePath = resolve(root, "README.md");
  if (isCandidateFile(readmePath)) paths.push(readmePath);

  const dataRoot = resolve(root, "data");
  if (existsSync(dataRoot) && statSync(dataRoot).isDirectory()) walkDataFiles(dataRoot, paths);

  return paths
    .map((absPath) => ({
      absPath,
      relPath: relative(root, absPath),
      fileKind: extname(absPath).slice(1).toLowerCase(),
    }))
    .sort((left, right) => left.relPath.localeCompare(right.relPath));
}

function walkDataFiles(directory: string, paths: string[]): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      walkDataFiles(path, paths);
    } else if (entry.isFile() && isCandidateFile(path)) {
      paths.push(path);
    }
  }
}

function isCandidateFile(path: string): boolean {
  if (!existsSync(path)) return false;
  const name = path.slice(Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1);
  if (name.startsWith(".") || name === "source.json" || name.startsWith("LICENSE")) return false;
  if (!SUPPORTED_EXTENSIONS.has(extname(name).toLowerCase())) return false;
  const stat = statSync(path);
  return stat.isFile() && stat.size <= MAX_FILE_SIZE;
}

function fileEvidenceRef(absPath: string): string {
  const packageRelative = relative(packageRoot(), absPath);
  return packageRelative.startsWith("..") ? absPath : packageRelative;
}

function fileChunks(
  source: SourceDescriptor,
  file: DocumentFile,
  entityId: string,
  evidenceRef: string,
  sourceVersionId: string,
): SearchChunk[] {
  if (file.fileKind === "md") {
    return markdownChunks(source, file, entityId, evidenceRef, sourceVersionId);
  }
  if (file.fileKind === "txt") {
    return textChunks(source, file, entityId, evidenceRef, sourceVersionId);
  }
  return [jsonSummaryChunk(source, file, entityId, evidenceRef, sourceVersionId)];
}

function markdownChunks(
  source: SourceDescriptor,
  file: DocumentFile,
  entityId: string,
  evidenceRef: string,
  sourceVersionId: string,
): SearchChunk[] {
  const sections = splitMarkdown(readFileSync(file.absPath, "utf8"), file.relPath);
  return sections.map((section) => makeChunk(
    source,
    file,
    entityId,
    evidenceRef,
    sourceVersionId,
    section.chunkKey,
    `${source.title}: ${section.titleText}`,
    section.text,
    { heading_path: section.headingPath },
  ));
}

function splitMarkdown(text: string, relPath: string): MarkdownSection[] {
  const lines = text.split(/\r?\n/);
  const firstH1 = lines
    .map(parseHeading)
    .find((heading) => heading?.level === 1)?.title;
  const sections: MarkdownSection[] = [];
  const preamble: string[] = [];
  const headingStack: string[] = [];
  let current: { headingLine: string; headingPath: string; body: string[] } | null = null;

  const finishCurrent = (): void => {
    if (!current || !current.body.some((line) => line.trim().length > 0)) return;
    sections.push({
      chunkKey: current.headingPath,
      headingPath: current.headingPath,
      text: [current.headingLine, ...current.body].join("\n"),
      titleText: current.headingPath,
    });
  };

  for (const line of lines) {
    const heading = parseHeading(line);
    if (!heading) {
      if (current) current.body.push(line);
      else preamble.push(line);
      continue;
    }

    finishCurrent();
    headingStack.length = heading.level - 1;
    headingStack[heading.level - 1] = heading.title;
    current = {
      headingLine: line,
      headingPath: headingStack.filter(Boolean).join(" > "),
      body: [],
    };
  }
  finishCurrent();

  if (preamble.some((line) => line.trim().length > 0)) {
    sections.unshift({
      chunkKey: "preamble",
      headingPath: "preamble",
      text: preamble.join("\n"),
      titleText: firstH1 || relPath,
    });
  }
  return sections;
}

function parseHeading(line: string): { level: number; title: string } | null {
  const match = /^(#{1,6})\s+(.*)$/.exec(line);
  if (!match) return null;
  return {
    level: match[1].length,
    title: match[2].replace(/\s+#+\s*$/, "").trim(),
  };
}

function textChunks(
  source: SourceDescriptor,
  file: DocumentFile,
  entityId: string,
  evidenceRef: string,
  sourceVersionId: string,
): SearchChunk[] {
  const paragraphs = readFileSync(file.absPath, "utf8")
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const grouped: string[] = [];
  let current = "";
  for (const paragraph of paragraphs) {
    const combined = current ? `${current}\n\n${paragraph}` : paragraph;
    if (current && combined.length > TEXT_CHUNK_SIZE) {
      grouped.push(current);
      current = paragraph;
    } else {
      current = combined;
    }
  }
  if (current) grouped.push(current);

  return grouped.map((text, index) => {
    const part = index + 1;
    const suffix = grouped.length === 1 ? "" : ` (part ${part})`;
    return makeChunk(
      source,
      file,
      entityId,
      evidenceRef,
      sourceVersionId,
      `part-${part}`,
      `${source.title}: ${file.relPath}${suffix}`,
      text,
    );
  });
}

function jsonSummaryChunk(
  source: SourceDescriptor,
  file: DocumentFile,
  entityId: string,
  evidenceRef: string,
  sourceVersionId: string,
): SearchChunk {
  const contents = readFileSync(file.absPath, "utf8");
  let rowCount: number | "object";
  let firstValue: unknown;
  if (file.fileKind === "jsonl") {
    const lines = contents.split(/\r?\n/).filter((line) => line.trim().length > 0);
    rowCount = lines.length;
    firstValue = lines.length > 0 ? JSON.parse(lines[0]) : undefined;
  } else {
    const parsed = JSON.parse(contents) as unknown;
    rowCount = Array.isArray(parsed) ? parsed.length : "object";
    firstValue = Array.isArray(parsed) ? parsed[0] : parsed;
  }
  const keys = topLevelKeys(firstValue);
  const summary = [
    `Path: ${file.relPath}`,
    `Format: ${file.fileKind}`,
    `Row count: ${rowCount}`,
    `Top-level keys: ${keys.length > 0 ? keys.join(", ") : "none"}`,
    `File size: ${statSync(file.absPath).size} bytes`,
    "Ground-truth data file; see the sibling README/REPORT chunks from this source for interpretation.",
  ].join("\n");
  return makeChunk(
    source,
    file,
    entityId,
    evidenceRef,
    sourceVersionId,
    "summary",
    `${source.title}: data file ${file.relPath}`,
    summary,
  );
}

function topLevelKeys(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.keys(value as Record<string, unknown>).sort().slice(0, 25);
}

function makeChunk(
  source: SourceDescriptor,
  file: DocumentFile,
  entityId: string,
  evidenceRef: string,
  sourceVersionId: string,
  chunkKey: string,
  title: string,
  text: string,
  extraPayload: Record<string, unknown> = {},
): SearchChunk {
  return {
    id: `chunk:${source.id}:${shortHash(`${file.relPath}#${chunkKey}`)}`,
    sourceId: source.id,
    sourceVersionId,
    entityId,
    title: truncate(title, 200),
    text: truncate(text, 8000),
    evidenceRef,
    payload: {
      source_id: source.id,
      rel_path: file.relPath,
      evidence_ref: evidenceRef,
      chunk_key: chunkKey,
      ...extraPayload,
    },
  };
}
