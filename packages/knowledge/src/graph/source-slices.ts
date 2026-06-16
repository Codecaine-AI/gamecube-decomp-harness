import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, relative, resolve } from "node:path";
import { sourceDataRoot, sourceRoot } from "../paths.js";
import { fileEntityId } from "./code-graph.js";
import type { GraphEdge, GraphEntity, GraphFact, GraphRecords, SearchChunk, TrustTier } from "./types.js";
import { filesFingerprint, shortHash, stableJson, truncate } from "./util.js";

interface IndexedSliceRecord {
  id: string;
  title: string;
  text: string;
  evidenceRef: string;
  payload: Record<string, unknown>;
  linkedFilePaths?: string[];
  entityType?: string;
  entityKey?: string;
  trustTier?: TrustTier;
}

interface SourceBuildOptions {
  sourceId: string;
  trustTier: TrustTier;
  indexFileName: string;
  inputPaths: string[];
  records: IndexedSliceRecord[];
  defaultEntityType: string;
  factType: string;
  edgeType?: string;
}

const DOCUMENT_EXTENSIONS = new Set([".md", ".txt", ".text"]);
const SEARCHABLE_TEXT_EXTENSIONS = new Set([".md", ".txt", ".text", ".c", ".h", ".py", ".yml", ".yaml", ".ini"]);
const FILE_MENTION_RE = /(?:^|[\s`"'(])((?:src|include|asm|config)\/[A-Za-z0-9_./+@-]+)\b/g;
const ADDRESS_RE = /\b0x[0-9A-Fa-f]{6,8}\b/;

export function buildDiscordKnowledgeGraphRecords(): GraphRecords | null {
  return buildDocumentSource({
    sourceId: "discord_knowledge",
    trustTier: "historical",
    dataRoot: sourceDataRoot("discord_knowledge"),
    indexFileName: "chunks.jsonl",
    defaultEntityType: "discord_knowledge_chunk",
  });
}

export function buildSsbmDataSheetGraphRecords(): GraphRecords | null {
  const sourceId = "ssbm_data_sheet";
  const dataRoot = sourceDataRoot(sourceId);
  const csvRoot = resolve(dataRoot, "csv");
  const generatedRoot = resolve(dataRoot, "generated");
  const csvFiles = [...new Set([...recursiveFiles(csvRoot), ...recursiveFiles(generatedRoot)])].filter((path) => extname(path).toLowerCase() === ".csv");
  const sourceFiles = recursiveFiles(resolve(dataRoot, "source"));
  const inputPaths = [...csvFiles, ...sourceFiles];
  const records: IndexedSliceRecord[] = [];

  for (const file of csvFiles) {
    const relPath = relative(dataRoot, file);
    const rows = readCsvObjects(file);
    rows.forEach((row, index) => {
      const sheet = stringField(row, "sheet_name") || basename(file, ".csv");
      const cell = stringField(row, "cell");
      const address = firstAddress(rowText(row));
      const rowTitle = [sheet, cell, address].filter(Boolean).join(" ");
      records.push({
        id: `${relPath}:row:${index + 1}`,
        title: `SSBM data sheet: ${rowTitle || `${relPath} row ${index + 1}`}`,
        text: compactText([relPath, sheet, cell, stringField(row, "value"), stringField(row, "row_label"), stringField(row, "nearest_above"), stringField(row, "row_text"), rowText(row)]),
        evidenceRef: `${file}#row=${index + 1}`,
        payload: {
          source_id: sourceId,
          source_csv: relPath,
          row_number: index + 1,
          row,
          address,
        },
        linkedFilePaths: extractLinkedFilePaths(rowText(row)),
        entityType: address ? "address_reference" : "data_sheet_row",
        entityKey: address || `${relPath}:${index + 1}`,
        trustTier: ssbmDataSheetRowTrustTier(relPath, row),
      });
    });
  }

  return buildIndexBackedGraphRecords({
    sourceId,
    trustTier: "external_hint",
    indexFileName: "cells.jsonl",
    inputPaths,
    records,
    defaultEntityType: "data_sheet_row",
    factType: "data_sheet_reference",
    edgeType: "HAS_DATA_SHEET_REFERENCE",
  });
}

function ssbmDataSheetRowTrustTier(relPath: string, row: Record<string, string>): TrustTier {
  if (!relPath.startsWith("generated/")) return "external_hint";
  const sourceType = stringField(row, "source_type");
  if (sourceType === "codebase_function" || sourceType === "data_symbol") return "canonical";
  return "local";
}

export function buildPowerpcDocsGraphRecords(): GraphRecords | null {
  const sourceId = "powerpc_docs";
  const dataRoot = sourceDataRoot(sourceId);
  const pageIndex = resolve(dataRoot, "indexes/powerpc_pdf_pages.csv");
  if (!existsSync(pageIndex)) return null;
  const inputPaths = [pageIndex, ...recursiveFiles(resolve(dataRoot, "pdfs"))];
  const records: IndexedSliceRecord[] = [];

  for (const row of readCsvObjects(pageIndex)) {
    const documentId = stringField(row, "document_id") || stringField(row, "title") || "powerpc";
    const title = stringField(row, "title") || documentId;
    const page = stringField(row, "page");
    const text = stringField(row, "text");
    splitLongText(text, 3200).forEach((chunk, index) => {
      records.push({
        id: `${documentId}:page:${page}:chunk:${index + 1}`,
        title: `${title}: page ${page}${index ? ` chunk ${index + 1}` : ""}`,
        text: compactText([documentId, title, `page ${page}`, chunk]),
        evidenceRef: `${stringField(row, "pdf_path") || pageIndex}#page=${page}`,
        payload: {
          source_id: sourceId,
          document_id: documentId,
          title,
          pdf_path: stringField(row, "pdf_path"),
          page,
          chunk: index + 1,
          word_count: stringField(row, "word_count"),
        },
        linkedFilePaths: extractLinkedFilePaths(chunk),
        entityType: "powerpc_doc_page",
        entityKey: `${documentId}:${page}:${index + 1}`,
      });
    });
  }

  return buildIndexBackedGraphRecords({
    sourceId,
    trustTier: "reference",
    indexFileName: "pages.jsonl",
    inputPaths,
    records,
    defaultEntityType: "powerpc_doc_page",
    factType: "powerpc_reference",
    edgeType: "HAS_POWERPC_REFERENCE",
  });
}

export function buildExternalMirrorsGraphRecords(): GraphRecords | null {
  const sourceId = "external_mirrors";
  const dataRoot = sourceDataRoot(sourceId);
  const inputPaths: string[] = [];
  const records: IndexedSliceRecord[] = [];

  addCsvIndexRecords({
    sourceId,
    dataRoot,
    inputPaths,
    records,
    path: resolve(dataRoot, "m_ex/indexes/header_symbols.csv"),
    titlePrefix: "m-ex header symbol",
    idPrefix: "m_ex_header_symbol",
    entityType: "external_header_symbol",
    textFields: ["header_path", "kind", "name", "context"],
    keyFields: ["name", "header_path", "line"],
  });
  addCsvIndexRecords({
    sourceId,
    dataRoot,
    inputPaths,
    records,
    path: resolve(dataRoot, "training_mode/indexes/gtme01_map_symbols.csv"),
    titlePrefix: "Training Mode map symbol",
    idPrefix: "training_mode_map_symbol",
    entityType: "external_map_symbol",
    textFields: ["source_file", "section", "address", "virtual_address", "size", "name", "is_placeholder"],
    keyFields: ["name", "virtual_address", "line"],
  });
  addCsvIndexRecords({
    sourceId,
    dataRoot,
    inputPaths,
    records,
    path: resolve(dataRoot, "ppc2cpp/indexes/source_files.csv"),
    titlePrefix: "ppc2cpp source file",
    idPrefix: "ppc2cpp_source_file",
    entityType: "external_source_file",
    textFields: ["path", "extension", "size_bytes", "line_count"],
    keyFields: ["path"],
  });

  const compilerIndex = resolve(dataRoot, "tockdom/indexes/compiler_page.csv");
  if (existsSync(compilerIndex)) {
    inputPaths.push(compilerIndex);
    for (const row of readCsvObjects(compilerIndex)) {
      splitLongText(stringField(row, "text"), 3200).forEach((chunk, index) => {
        records.push({
          id: `tockdom_compiler:chunk:${index + 1}`,
          title: `Tockdom compiler page${index ? ` chunk ${index + 1}` : ""}`,
          text: compactText([stringField(row, "title"), stringField(row, "url"), chunk]),
          evidenceRef: stringField(row, "url") || compilerIndex,
          payload: {
            source_id: sourceId,
            source_file: stringField(row, "source_file"),
            text_file: stringField(row, "text_file"),
            title: stringField(row, "title"),
            url: stringField(row, "url"),
            chunk: index + 1,
          },
          linkedFilePaths: extractLinkedFilePaths(chunk),
          entityType: "external_document_chunk",
          entityKey: `tockdom_compiler:${index + 1}`,
        });
      });
    }
  }

  const selectedPpc2cppFiles = recursiveFiles(resolve(dataRoot, "ppc2cpp/mips_to_c_ppc2cpp_branch"))
    .filter((path) => SEARCHABLE_TEXT_EXTENSIONS.has(extname(path).toLowerCase()))
    .filter((path) => !path.includes("/tests/") && !path.includes("/.git/"));
  inputPaths.push(...selectedPpc2cppFiles);
  for (const file of selectedPpc2cppFiles) {
    const relPath = relative(dataRoot, file);
    splitLongText(readFileSync(file, "utf8"), 3200).forEach((chunk, index) => {
      records.push({
        id: `${relPath}:chunk:${index + 1}`,
        title: `External mirror: ${relPath}${index ? ` chunk ${index + 1}` : ""}`,
        text: compactText([relPath, chunk]),
        evidenceRef: `${file}#chunk=${index + 1}`,
        payload: { source_id: sourceId, path: relPath, chunk: index + 1 },
        linkedFilePaths: extractLinkedFilePaths(chunk),
        entityType: "external_document_chunk",
        entityKey: `${relPath}:${index + 1}`,
      });
    });
  }

  return buildIndexBackedGraphRecords({
    sourceId,
    trustTier: "external_hint",
    indexFileName: "external_file_mentions.jsonl",
    inputPaths,
    records,
    defaultEntityType: "external_mirror_record",
    factType: "external_mirror_reference",
    edgeType: "HAS_EXTERNAL_MIRROR_REFERENCE",
  });
}

export function buildDecompStandardsGraphRecords(): GraphRecords | null {
  const sourceId = "decomp_standards";
  const dataRoot = sourceDataRoot(sourceId);
  const dataFile = resolve(dataRoot, "standards.jsonl");
  const records = readJsonlObjects(dataFile).map((row) => {
    const text = compactText([
      stringField(row, "title"),
      stringField(row, "summary"),
      arrayField(row, "do").join(" "),
      arrayField(row, "do_not").join(" "),
      arrayField(row, "evidence_refs").join(" "),
    ]);
    return {
      id: stringField(row, "id") || shortHash(text),
      title: `Decomp standard: ${stringField(row, "title") || stringField(row, "id")}`,
      text,
      evidenceRef: arrayField(row, "evidence_refs").join(";") || dataFile,
      payload: { source_id: sourceId, record: row },
      linkedFilePaths: extractLinkedFilePaths(text),
      entityType: "decomp_standard",
      entityKey: stringField(row, "id") || shortHash(text),
    };
  });
  return buildIndexBackedGraphRecords({
    sourceId,
    trustTier: "reference",
    indexFileName: "standards.jsonl",
    inputPaths: [dataFile],
    records,
    defaultEntityType: "decomp_standard",
    factType: "decomp_standard",
    edgeType: "HAS_DECOMP_STANDARD",
  });
}

export function buildPathFactsGraphRecords(): GraphRecords | null {
  const sourceId = "path_facts";
  const dataRoot = sourceDataRoot(sourceId);
  const factsRoot = resolve(dataRoot, "path_facts");
  const factFiles = recursiveFiles(factsRoot).filter((path) => extname(path).toLowerCase() === ".jsonl");
  const sliceFiles = recursiveFiles(resolve(dataRoot, "slices")).filter((path) => DOCUMENT_EXTENSIONS.has(extname(path).toLowerCase()));
  const inputPaths = [...factFiles, ...sliceFiles];
  const records: IndexedSliceRecord[] = [];
  for (const file of factFiles) {
    for (const row of readJsonlObjects(file)) {
      const text = compactText([
        stringField(row, "title"),
        stringField(row, "directory"),
        stringField(row, "summary"),
        arrayField(row, "scope_globs").join(" "),
        arrayField(row, "applies_when").join(" "),
        arrayField(row, "do").join(" "),
        arrayField(row, "do_not").join(" "),
        arrayField(row, "evidence_refs").join(" "),
        arrayField(row, "watched_paths").join(" "),
        stringField(row, "slice_ref"),
      ]);
      records.push({
        id: stringField(row, "id") || shortHash(text),
        title: `Path fact: ${stringField(row, "title") || stringField(row, "id")}`,
        text,
        evidenceRef: arrayField(row, "evidence_refs").join(";") || file,
        payload: { source_id: sourceId, source_file: relative(dataRoot, file), record: row },
        linkedFilePaths: [...new Set([...extractLinkedFilePaths(text), ...representativePathFactPaths(row)])].sort(),
        entityType: "path_fact",
        entityKey: stringField(row, "id") || shortHash(text),
      });
    }
  }
  return buildIndexBackedGraphRecords({
    sourceId,
    trustTier: "historical",
    indexFileName: "path_facts.jsonl",
    inputPaths,
    records,
    defaultEntityType: "path_fact",
    factType: "path_scoped_hint",
    edgeType: "HAS_PATH_FACT",
  });
}

function buildDocumentSource(options: {
  sourceId: string;
  trustTier: TrustTier;
  dataRoot: string;
  indexFileName: string;
  defaultEntityType: string;
}): GraphRecords | null {
  const files = recursiveFiles(options.dataRoot)
    .filter((path) => DOCUMENT_EXTENSIONS.has(extname(path).toLowerCase()) || basename(path) === "SKILL.md")
    .filter((path) => !path.includes("/indexes/") && !path.includes("/tools/"));
  const records: IndexedSliceRecord[] = [];
  for (const file of files) {
    const relPath = relative(options.dataRoot, file);
    const text = readFileSync(file, "utf8");
    splitLongText(text, 3200).forEach((chunk, index) => {
      const heading = firstHeading(chunk);
      records.push({
        id: `${relPath}:chunk:${index + 1}`,
        title: `${sourceTitle(options.sourceId)}: ${relPath}${heading ? `: ${heading}` : ""}`,
        text: compactText([relPath, heading, chunk]),
        evidenceRef: `${file}#chunk=${index + 1}`,
        payload: { source_id: options.sourceId, path: relPath, chunk: index + 1, heading },
        linkedFilePaths: extractLinkedFilePaths(chunk),
        entityType: options.defaultEntityType,
        entityKey: `${relPath}:${index + 1}`,
      });
    });
  }
  return buildIndexBackedGraphRecords({
    sourceId: options.sourceId,
    trustTier: options.trustTier,
    indexFileName: options.indexFileName,
    inputPaths: files,
    records,
    defaultEntityType: options.defaultEntityType,
    factType: "document_reference",
    edgeType: "HAS_DOCUMENT_REFERENCE",
  });
}

function buildIndexBackedGraphRecords(options: SourceBuildOptions): GraphRecords | null {
  if (options.records.length === 0 || options.inputPaths.length === 0) {
    writeSourceIndex(options.sourceId, options.indexFileName, []);
    return null;
  }
  const sourceVersionId = `source-version:${options.sourceId}:${shortHash(filesFingerprint(options.inputPaths))}`;
  const entities: GraphEntity[] = [];
  const facts: GraphFact[] = [];
  const edges: GraphEdge[] = [];
  const chunks: SearchChunk[] = [];
  const indexRows: Array<Record<string, unknown>> = [];

  for (const record of options.records) {
    const resourceEntityId = resourceEntityIdFor(options.sourceId, record);
    const linkedFilePaths = [...new Set(record.linkedFilePaths ?? [])].sort();
    entities.push({
      id: resourceEntityId,
      entityType: record.entityType || options.defaultEntityType,
      stableKey: record.entityKey || record.id,
      payload: {
        source_id: options.sourceId,
        title: record.title,
        evidence_ref: record.evidenceRef,
        ...record.payload,
      },
    });
    facts.push({
      id: `fact:${options.sourceId}:${shortHash(record.id)}`,
      entityId: resourceEntityId,
      factType: options.factType,
      payload: {
        source_id: options.sourceId,
        title: record.title,
        evidence_ref: record.evidenceRef,
        linked_file_paths: linkedFilePaths,
        ...record.payload,
      },
      confidence: 0.55,
      trustTier: record.trustTier ?? options.trustTier,
      evidenceRef: record.evidenceRef,
      sourceVersionId,
    });
    for (const sourcePath of linkedFilePaths) {
      const fileEntity = fileEntityId(sourcePath);
      entities.push({
        id: fileEntity,
        entityType: "source_file",
        stableKey: sourcePath,
        payload: { source_path: sourcePath },
        replace: false,
      });
      edges.push({
        id: `edge:${options.edgeType ?? "HAS_RESOURCE_EVIDENCE"}:${shortHash(`${sourcePath}:${record.id}`)}`,
        fromEntityId: fileEntity,
        edgeType: options.edgeType ?? "HAS_RESOURCE_EVIDENCE",
        toEntityId: resourceEntityId,
        weight: 0.55,
        evidenceRef: record.evidenceRef,
        sourceVersionId,
      });
    }
    const chunkId = `chunk:${options.sourceId}:${shortHash(record.id)}`;
    const chunkEntityId = linkedFilePaths.length ? fileEntityId(linkedFilePaths[0]) : resourceEntityId;
    chunks.push({
      id: chunkId,
      sourceId: options.sourceId,
      sourceVersionId,
      entityId: chunkEntityId,
      title: record.title,
      text: truncate(record.text, 8000),
      evidenceRef: record.evidenceRef,
      payload: {
        source_id: options.sourceId,
        record_id: record.id,
        resource_entity_id: resourceEntityId,
        linked_file_paths: linkedFilePaths,
        ...record.payload,
      },
    });
    indexRows.push({
      id: record.id,
      source_id: options.sourceId,
      title: record.title,
      text: record.text,
      evidence_ref: record.evidenceRef,
      entity_id: chunkEntityId,
      resource_entity_id: resourceEntityId,
      linked_file_paths: linkedFilePaths,
      payload: record.payload,
    });
  }

  writeSourceIndex(options.sourceId, options.indexFileName, indexRows);
  return {
    sourceVersion: {
      id: sourceVersionId,
      sourceId: options.sourceId,
      contentHash: shortHash(filesFingerprint(options.inputPaths)),
      sourcePaths: options.inputPaths,
    },
    entities,
    facts,
    edges,
    chunks,
  };
}

function addCsvIndexRecords(options: {
  sourceId: string;
  dataRoot: string;
  inputPaths: string[];
  records: IndexedSliceRecord[];
  path: string;
  titlePrefix: string;
  idPrefix: string;
  entityType: string;
  textFields: string[];
  keyFields: string[];
}): void {
  if (!existsSync(options.path)) return;
  options.inputPaths.push(options.path);
  const relPath = relative(options.dataRoot, options.path);
  readCsvObjects(options.path).forEach((row, index) => {
    const key = options.keyFields.map((field) => stringField(row, field)).filter(Boolean).join(":") || `${index + 1}`;
    const text = compactText([relPath, ...options.textFields.map((field) => stringField(row, field)), rowText(row)]);
    options.records.push({
      id: `${options.idPrefix}:${key}:${index + 1}`,
      title: `${options.titlePrefix}: ${key}`,
      text,
      evidenceRef: `${options.path}#row=${index + 1}`,
      payload: { source_id: options.sourceId, source_csv: relPath, row_number: index + 1, row },
      linkedFilePaths: extractLinkedFilePaths(text),
      entityType: options.entityType,
      entityKey: key,
    });
  });
}

function writeSourceIndex(sourceId: string, fileName: string, rows: Array<Record<string, unknown>>): void {
  const path = resolve(sourceRoot(sourceId), "indexes", fileName);
  mkdirSync(dirname(path), { recursive: true });
  const body = rows.map((row) => JSON.stringify(row)).join("\n");
  writeFileSync(path, body ? `${body}\n` : "", "utf8");
}

function recursiveFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    if (!current || !existsSync(current)) continue;
    const stat = statSync(current);
    if (stat.isDirectory()) {
      if (basename(current) === ".git" || basename(current) === "node_modules") continue;
      for (const child of readdirSync(current)) stack.push(resolve(current, child));
    } else if (stat.isFile()) {
      out.push(current);
    }
  }
  return out.sort();
}

function directoryChildren(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .map((child) => resolve(root, child))
    .filter((path) => existsSync(path) && statSync(path).isDirectory())
    .sort();
}

function readCsvObjects(path: string): Array<Record<string, string>> {
  const rows = parseCsv(readFileSync(path, "utf8"));
  if (rows.length === 0) return [];
  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header || `column_${index + 1}`] = row[index] ?? "";
    });
    return record;
  });
}

function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];
    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((csvRow) => csvRow.some((value) => value.trim()));
}

function readJsonlObjects(path: string): Array<Record<string, unknown>> {
  if (!existsSync(path)) return [];
  const rows: Array<Record<string, unknown>> = [];
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) rows.push(parsed as Record<string, unknown>);
    } catch {
      // Ignore malformed JSONL rows; source and tool smoke checks expose bad indexes.
    }
  }
  return rows;
}

function splitLongText(input: string, maxChars: number): string[] {
  const text = input.replace(/\u0000/g, "").trim();
  if (!text) return [];
  const chunks: string[] = [];
  let current = "";
  const parts = text.split(/(\n#{1,6}\s+[^\n]+|\n\s*\n)/g).filter((part) => part.length > 0);
  for (const part of parts) {
    if (current && current.length + part.length > maxChars) {
      chunks.push(current.trim());
      current = "";
    }
    if (part.length > maxChars) {
      for (let index = 0; index < part.length; index += maxChars) chunks.push(part.slice(index, index + maxChars).trim());
    } else {
      current += part;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

function compactText(values: unknown[]): string {
  return values
    .map((value) => String(value ?? ""))
    .filter(Boolean)
    .join("\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function rowText(row: Record<string, unknown>): string {
  return Object.values(row)
    .map((value) => String(value ?? ""))
    .filter(Boolean)
    .join(" | ");
}

function stringField(row: Record<string, unknown>, field: string): string {
  const value = row[field];
  return typeof value === "string" ? value : "";
}

function arrayField(row: Record<string, unknown>, field: string): string[] {
  const value = row[field];
  return Array.isArray(value) ? value.map((item) => String(item)) : [];
}

function representativePathFactPaths(row: Record<string, unknown>): string[] {
  const values = [...arrayField(row, "watched_paths"), ...arrayField(row, "scope_globs")];
  return values
    .map((value) => value.replace(/^\.\//, "").replace(/^\.\.\//, ""))
    .filter((value) => !value.includes("*"))
    .filter((value) => value.startsWith("src/") || value.startsWith("include/"))
    .slice(0, 12);
}

function firstAddress(text: string): string {
  return ADDRESS_RE.exec(text)?.[0] ?? "";
}

function extractLinkedFilePaths(text: string): string[] {
  const matches = [...text.matchAll(FILE_MENTION_RE)].map((match) => match[1]);
  return [...new Set(matches.map((path) => path.replace(/[),.;:]+$/, "")))].sort();
}

function firstHeading(text: string): string {
  const match = text.match(/^#{1,6}\s+(.+)$/m);
  return match ? match[1].trim() : "";
}

function sourceTitle(sourceId: string): string {
  return sourceId
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function resourceEntityIdFor(sourceId: string, record: IndexedSliceRecord): string {
  return `resource:${sourceId}:${shortHash(`${record.entityType ?? ""}:${record.entityKey ?? record.id}`)}`;
}
