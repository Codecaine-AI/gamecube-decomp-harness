import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { KnowledgeStoreHandle } from "../records/index.js";
import { insertEntitiesIfMissing, type EntityRowInput } from "../records/index.js";
import type { EntityExtractResult, LaneOptions } from "./types.js";

export interface EntityExtractOptions extends LaneOptions {
  reportPath: string;
  checkoutRoot: string;
}

interface ParsedStruct {
  name: string;
  fields: string[];
}

interface ReportUnit {
  name?: string;
  metadata?: { source_path?: string };
  functions?: Array<{ name?: string }>;
}

interface ParsedParameter {
  name: string;
  declaredType: string;
  abiSlot: string;
}

function headerPaths(root: string): string[] {
  const paths: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && entry.name.endsWith(".h")) paths.push(path);
    }
  };
  visit(join(root, "src", "melee"));
  return paths.sort();
}

function matchingBrace(source: string, opening: number): number | null {
  let depth = 0;
  for (let index = opening; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return null;
}

function matchingDelimiter(source: string, opening: number, open: string, close: string): number | null {
  let depth = 0;
  for (let index = opening; index < source.length; index += 1) {
    if (source[index] === open) depth += 1;
    else if (source[index] === close) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return null;
}

function splitParameters(source: string): string[] | null {
  const parameters: string[] = [];
  let start = 0;
  let parentheses = 0;
  let brackets = 0;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === "(") parentheses += 1;
    else if (character === ")") parentheses -= 1;
    else if (character === "[") brackets += 1;
    else if (character === "]") brackets -= 1;
    else if (character === "," && parentheses === 0 && brackets === 0) {
      parameters.push(source.slice(start, index).trim());
      start = index + 1;
    }
    if (parentheses < 0 || brackets < 0) return null;
  }
  if (parentheses !== 0 || brackets !== 0) return null;
  parameters.push(source.slice(start).trim());
  return parameters;
}

function parseParameters(source: string): { parameters: ParsedParameter[]; skipped: number } {
  const declarations = splitParameters(source);
  if (declarations === null) return { parameters: [], skipped: 1 };
  if (declarations.length === 1 && declarations[0] === "void") return { parameters: [], skipped: 0 };

  const parameters: ParsedParameter[] = [];
  let skipped = 0;
  let gpr = 3;
  for (const declaration of declarations) {
    if (!declaration || declaration === "void" || declaration === "...") {
      skipped += declaration === "void" ? 0 : 1;
      continue;
    }
    if (/\(\s*\*\s*(?:const\s+|volatile\s+)*[A-Za-z_]\w*\s*\)/.test(declaration)) {
      skipped += 1;
      gpr += 1;
      continue;
    }

    const withoutArrays = declaration.replace(/(?:\s*\[[^\]]*\]\s*)+$/, "").trim();
    const nameMatch = /([A-Za-z_]\w*)$/.exec(withoutArrays);
    const declaredType = nameMatch === null ? "" : withoutArrays.slice(0, nameMatch.index).trim();
    if (nameMatch === null || !declaredType || /[()]/.test(declaredType)) {
      skipped += 1;
      gpr += 1;
      continue;
    }

    parameters.push({ name: nameMatch[1], declaredType, abiSlot: `r${gpr}` });
    gpr += 1;
  }
  return { parameters, skipped };
}

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findDefinitionParameters(source: string, symbol: string): { parameters: ParsedParameter[]; skipped: number } | null {
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  const pattern = new RegExp(`\\b${escapePattern(symbol)}\\s*\\(`, "g");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(withoutComments)) !== null) {
    const opening = withoutComments.indexOf("(", match.index + symbol.length);
    const closing = matchingDelimiter(withoutComments, opening, "(", ")");
    if (closing === null) return null;
    const following = withoutComments.slice(closing + 1);
    const definition = /^\s*(?:__attribute__\s*\(\([\s\S]*?\)\)\s*)*\{/.exec(following);
    if (definition !== null) return parseParameters(withoutComments.slice(opening + 1, closing));
    pattern.lastIndex = closing + 1;
  }
  return null;
}

function parseHeader(source: string): { structs: ParsedStruct[]; skipped: number } {
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  const startPattern = /\btypedef\s+struct(?:\s+[A-Za-z_]\w*)?\s*\{|\bstruct\s+([A-Za-z_]\w*)\s*\{/g;
  const structs: ParsedStruct[] = [];
  let skipped = 0;
  let match: RegExpExecArray | null;

  while ((match = startPattern.exec(withoutComments)) !== null) {
    const opening = withoutComments.indexOf("{", match.index);
    const closing = matchingBrace(withoutComments, opening);
    if (closing === null) {
      skipped += 1;
      break;
    }

    const body = withoutComments.slice(opening + 1, closing);
    const suffix = withoutComments.slice(closing + 1);
    const typedefName = match[0].startsWith("typedef")
      ? /^\s*([A-Za-z_]\w*)\s*;/.exec(suffix)?.[1]
      : undefined;
    const name = typedefName ?? match[1];
    const hasNestedBraces = body.includes("{") || body.includes("}");
    const hasConditional = /^\s*#\s*(?:if|ifdef|ifndef|elif|else|endif)\b/m.test(body);
    const fieldLines = body.split(";").map((part) => part.trim()).filter(Boolean);
    const fields: string[] = [];
    let uncertain = !name || hasNestedBraces || hasConditional;

    for (const line of fieldLines) {
      if (/[(),:]/.test(line) || /^\s*#/.test(line)) {
        uncertain = true;
        break;
      }
      const field = /(?:^|[\s*])([A-Za-z_]\w*)\s*(?:\[\s*\d+\s*\])?$/.exec(line);
      const type = field ? line.slice(0, field.index + 1).trim() : "";
      if (!field || !type || !/^[A-Za-z_][\w\s*]*$/.test(type)) {
        uncertain = true;
        break;
      }
      fields.push(field[1]);
    }

    if (uncertain) skipped += 1;
    else structs.push({ name, fields });

    startPattern.lastIndex = closing + 1;
  }

  return { structs, skipped };
}

export function extractEntities(store: KnowledgeStoreHandle, options: EntityExtractOptions): EntityExtractResult {
  const parsedByName = new Map<string, ParsedStruct>();
  let skippedConstructs = 0;
  for (const path of headerPaths(options.checkoutRoot)) {
    const parsed = parseHeader(readFileSync(path, "utf8"));
    skippedConstructs += parsed.skipped;
    for (const struct of parsed.structs) {
      const existing = parsedByName.get(struct.name);
      if (!existing) parsedByName.set(struct.name, struct);
      else {
        const fields = new Set([...existing.fields, ...struct.fields]);
        parsedByName.set(struct.name, { name: struct.name, fields: [...fields] });
      }
    }
  }

  const rows: EntityRowInput[] = [];
  let fields = 0;
  for (const struct of [...parsedByName.values()].sort((a, b) => a.name.localeCompare(b.name))) {
    const structId = `struct:${struct.name}`;
    rows.push({ id: structId, kind: "struct", locator: structId });
    for (const field of struct.fields) {
      const fieldId = `${structId}#${field}`;
      rows.push({ id: fieldId, kind: "struct_field", locator: fieldId, parentEntityId: structId });
      fields += 1;
    }
  }

  const report = JSON.parse(readFileSync(options.reportPath, "utf8")) as { units?: ReportUnit[] };
  let parameters = 0;
  let skippedParameters = 0;
  for (const unit of report.units ?? []) {
    const sourcePath = unit.metadata?.source_path;
    if (!unit.name || !sourcePath) continue;
    let source: string;
    try {
      source = readFileSync(join(options.checkoutRoot, sourcePath), "utf8");
    } catch {
      continue;
    }
    for (const fn of unit.functions ?? []) {
      if (!fn.name) continue;
      const parsed = findDefinitionParameters(source, fn.name);
      if (parsed === null) continue;
      skippedParameters += parsed.skipped;
      for (const parameter of parsed.parameters) {
        const locator = `${unit.name}:${fn.name}#${parameter.abiSlot}`;
        rows.push({ id: `parameter:${locator}`, kind: "parameter", locator });
        parameters += 1;
      }
    }
  }

  const result = {
    structs: parsedByName.size,
    fields,
    parameters,
    skippedParameters,
    skippedConstructs,
    inserted: 0,
  };
  if (!options.dryRun) result.inserted = insertEntitiesIfMissing(store, rows);
  return result;
}
