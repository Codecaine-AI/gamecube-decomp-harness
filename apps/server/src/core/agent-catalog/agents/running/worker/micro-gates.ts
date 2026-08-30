import type { WorkspaceExec, CommandResult } from "@server/infrastructure/shell";
import { EXACT_SCORE } from "@server/core/validation/objdiff/constants.js";
import type { WorkerUnitScoreSnapshot } from "./change-validation.js";

export interface WorkerMicroGateFlags {
  sectionParity: boolean;
  undefinedSymbols: boolean;
  bannedIdioms: boolean;
}

export const DEFAULT_WORKER_MICRO_GATE_FLAGS: WorkerMicroGateFlags = {
  sectionParity: true,
  undefinedSymbols: true,
  bannedIdioms: true,
};

export type WorkerMicroGateName = "section_parity" | "undefined_symbols" | "banned_idioms";

export interface WorkerMicroGateResult {
  gate: WorkerMicroGateName;
  status: "passed" | "failed" | "skipped" | "tool_unavailable";
  reasons: string[];
  /** infrastructure failure detail when status is tool_unavailable; gate fails open but records it */
  toolError?: string | null;
}

export interface WorkerMicroGates {
  /** failed iff any gate failed; passed iff at least one gate ran and none failed; skipped otherwise */
  status: "passed" | "failed" | "skipped";
  results: WorkerMicroGateResult[];
  reasons: string[];
}

export function summarizeMicroGates(results: WorkerMicroGateResult[]): WorkerMicroGates {
  const failed = results.filter((result) => result.status === "failed");
  const ran = results.some((result) => result.status === "passed" || result.status === "failed");
  return {
    status: failed.length > 0 ? "failed" : ran ? "passed" : "skipped",
    results,
    reasons: failed.flatMap((result) => result.reasons.map((reason) => `micro_gate:${result.gate}: ${reason}`)),
  };
}

export function evaluateSectionParityGate(params: {
  enabled: boolean;
  before: WorkerUnitScoreSnapshot | null;
  after: WorkerUnitScoreSnapshot | null;
}): WorkerMicroGateResult {
  const gate = "section_parity" as const;
  if (!params.enabled) {
    return { gate, status: "skipped", reasons: ["section parity gate disabled by game validation config"] };
  }
  if (!params.before || !params.after) {
    const unavailable = [!params.before ? "before" : "", !params.after ? "after" : ""].filter(Boolean).join(" and ");
    return { gate, status: "skipped", reasons: [`${unavailable} section score snapshot unavailable`] };
  }

  const afterByName = new Map(params.after.sections.map((section) => [section.name, section]));
  const reasons: string[] = [];
  for (const before of params.before.sections) {
    if (before.name === ".text" || before.score < EXACT_SCORE) continue;
    const after = afterByName.get(before.name);
    if (!after) {
      reasons.push(`section ${before.name} was 100% before the change but is missing from the rebuilt object`);
      continue;
    }
    if (after.score >= EXACT_SCORE) continue;
    const size = Number.isFinite(after.size) ? after.size : Number.isFinite(before.size) ? before.size : undefined;
    const byteDetail = size === undefined
      ? ""
      : ` (~${Math.max(1, Math.round(size * (100 - after.score) / 100))} of ${size} bytes mismatched)`;
    reasons.push(`section ${before.name} regressed from ${formatScore(before.score)}% to ${formatScore(after.score)}%${byteDetail}`);
  }
  return { gate, status: reasons.length > 0 ? "failed" : "passed", reasons };
}

function formatScore(score: number): string {
  return score >= EXACT_SCORE ? "100" : String(Number(score.toFixed(5)));
}

const LIST_UNDEFINED_SYMBOLS_SCRIPT = `import struct,sys
p=sys.argv[1]
try:
 d=open(p,'rb').read()
 if len(d)<52 or d[:4]!=b'\\x7fELF' or d[4]!=1 or d[5]!=2: raise ValueError('expected a 32-bit big-endian ELF object')
 shoff=struct.unpack_from('>I',d,32)[0]; shentsize,shnum=struct.unpack_from('>HH',d,46)
 sections=[struct.unpack_from('>IIIIIIIIII',d,shoff+i*shentsize) for i in range(shnum)]
 symtab=next((s for s in sections if s[1]==2),None)
 if symtab is None: raise ValueError('ELF object has no symbol table')
 strtab=sections[symtab[6]]; strings=d[strtab[4]:strtab[4]+strtab[5]]
 for off in range(symtab[4],symtab[4]+symtab[5],16):
  name,_,_,_,_,shndx=struct.unpack_from('>IIIBBH',d,off)
  if shndx==0 and name:
   end=strings.find(b'\\0',name); value=strings[name:end if end>=0 else None].decode('utf-8','replace')
   if value: print(value)
except Exception as error:
 print(error,file=sys.stderr); sys.exit(2)`;

/** Newline-separated undefined global symbol names of a 32-bit big-endian PowerPC ELF object. */
export async function listUndefinedSymbols(params: {
  objectPath: string;
  workspaceExec: WorkspaceExec;
}): Promise<{ symbols: string[] | null; error: string | null }> {
  try {
    const result: CommandResult = await params.workspaceExec.exec(["python3", "-c", LIST_UNDEFINED_SYMBOLS_SCRIPT, params.objectPath]);
    if (result.exitCode !== 0) {
      return { symbols: null, error: result.stderr.trim() || `python3 exited with code ${result.exitCode}` };
    }
    return {
      symbols: [...new Set(result.stdout.split(/\r?\n/).map((name) => name.trim()).filter(Boolean))].sort(),
      error: null,
    };
  } catch (error) {
    return { symbols: null, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function evaluateUndefinedSymbolGate(params: {
  enabled: boolean;
  objectTarget: string | null;
  baselineUndefined: string[] | null;
  workspaceExec: WorkspaceExec;
  symbolsTxtPath?: string;
}): Promise<WorkerMicroGateResult> {
  const gate = "undefined_symbols" as const;
  if (!params.enabled) {
    return { gate, status: "skipped", reasons: ["undefined symbols gate disabled by game validation config"] };
  }
  if (!params.objectTarget) {
    return { gate, status: "skipped", reasons: ["rebuilt object target unavailable"] };
  }

  const listed = await listUndefinedSymbols({ objectPath: params.objectTarget, workspaceExec: params.workspaceExec });
  if (!listed.symbols) {
    return { gate, status: "tool_unavailable", reasons: [], toolError: listed.error };
  }

  const symbolsTxtPath = params.symbolsTxtPath ?? "config/GALE01/symbols.txt";
  let symbolsResult: CommandResult;
  try {
    symbolsResult = await params.workspaceExec.exec(["cat", symbolsTxtPath]);
  } catch (error) {
    return { gate, status: "tool_unavailable", reasons: [], toolError: error instanceof Error ? error.message : String(error) };
  }
  if (symbolsResult.exitCode !== 0) {
    return {
      gate,
      status: "tool_unavailable",
      reasons: [],
      toolError: symbolsResult.stderr.trim() || `cat ${symbolsTxtPath} exited with code ${symbolsResult.exitCode}`,
    };
  }

  const known = new Set([...params.baselineUndefined ?? [], ...parseSymbolsTxt(symbolsResult.stdout).all]);
  const unknown = listed.symbols.filter((name) => !known.has(name));
  const reasons = unknown.slice(0, 20).map(
    (name) => `undefined symbol '${name}' in ${params.objectTarget} does not exist in the link universe (${symbolsTxtPath}); calls to nonexistent functions only fail at CI link time`,
  );
  if (unknown.length > 20) reasons.push(`${unknown.length - 20} more undefined symbols omitted`);
  return { gate, status: reasons.length > 0 ? "failed" : "passed", reasons };
}

interface AddedCodeLine {
  body: string;
  stripped: string;
}

export interface BannedIdiomContext {
  symbolsTxt?: string;
  baselineSources?: ReadonlyMap<string, string>;
  postChangeSources?: ReadonlyMap<string, string>;
  targetFunction?: string;
}

export function parseSymbolsTxt(contents: string): { all: Set<string>; globals: Set<string> } {
  const all = new Set<string>();
  const globals = new Set<string>();
  for (const line of contents.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_$.@][^\s=]*)\s*=/.exec(line);
    if (!match?.[1]) continue;
    all.add(match[1]);
    if (/\bscope\s*:\s*global\b/.test(line)) globals.add(match[1]);
  }
  return { all, globals };
}

interface StaticDefinition extends AddedCodeLine {
  name: string;
}

const STATIC_FUNCTION_RE = /^\s*static\b[^=;(]*\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/;
const STATIC_DEFINITION_RE = /^\s*static\b[^=;]*\b([A-Za-z_][A-Za-z0-9_]*)\s*\([^;]*$/;
const KR_FUNCTION_RE = /^\s*(?:static\s+)?[A-Za-z_][A-Za-z0-9_]*(?:\s+[A-Za-z_][A-Za-z0-9_]*)*\s*\**\s*[A-Za-z_][A-Za-z0-9_]*\s*\(\s*[A-Za-z_][A-Za-z0-9_]*(?:\s*,\s*[A-Za-z_][A-Za-z0-9_]*)*\s*\)\s*$/;
const CONTROL_KEYWORDS = new Set(["if", "for", "while", "switch", "return", "else", "do", "goto", "case"]);

export function lintBannedIdioms(diffText: string, context: BannedIdiomContext = {}): WorkerMicroGateResult {
  const gate = "banned_idioms" as const;
  if (!diffText.trim()) return { gate, status: "skipped", reasons: ["empty write_set diff"] };
  const isSectionTarget = context.targetFunction?.startsWith(".") ?? false;

  const linesByPath = new Map<string, AddedCodeLine[]>();
  const removedByPath = new Map<string, AddedCodeLine[]>();
  let currentPath = "";
  for (const line of diffText.split(/\r?\n/)) {
    const fileMatch = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (fileMatch) {
      currentPath = /\.(?:c|h)$/i.test(fileMatch[2]) ? fileMatch[2] : "";
      continue;
    }
    if (!currentPath || (!line.startsWith("+") && !line.startsWith("-")) || line.startsWith("+++") || line.startsWith("---")) continue;
    const body = line.slice(1);
    const target = line.startsWith("+") ? linesByPath : removedByPath;
    const entries = target.get(currentPath) ?? [];
    entries.push({ body, stripped: stripLineCommentsAndStrings(body) });
    target.set(currentPath, entries);
  }

  const reasons: string[] = [];
  const globalSymbols = parseSymbolsTxt(context.symbolsTxt ?? "").globals;
  for (const [path, entries] of linesByPath) {
    if (!isSectionTarget) {
      reasons.push(...findSharedGlobalQualifierChanges({
        path,
        added: entries,
        removed: removedByPath.get(path) ?? [],
        baselineSource: context.baselineSources?.get(path),
        postChangeSource: context.postChangeSources?.get(path),
        targetFunction: context.targetFunction,
      }));
    }
    const definitions: StaticDefinition[] = [];
    for (const entry of entries) {
      const staticName = staticDeclarationName(entry.stripped);
      if (staticName) {
        const wasNonStatic = (removedByPath.get(path) ?? []).some((line) => isNonStaticDeclarationOf(line.stripped, staticName))
          || baselineDeclaresNonStatic(context.baselineSources?.get(path), staticName);
        const reason = globalSymbols.has(staticName)
          ? "symbols.txt global"
          : wasNonStatic
            ? "previously non-static"
            : null;
        if (reason && !isSectionTarget) reasons.push(`static_added_to_global_symbol: '${staticName}' gains static but is ${reason}: "${entry.body.trim().replaceAll('"', '\\"')}"`);
      }
      const staticFunction = STATIC_FUNCTION_RE.exec(entry.stripped);
      if (!isSectionTarget && staticFunction?.[1] && /order/i.test(staticFunction[1])) {
        reasons.push(findingReason("section-order-hack", entry.body));
      }
      const definition = STATIC_DEFINITION_RE.exec(entry.stripped);
      if (definition?.[1]) definitions.push({ ...entry, name: definition[1] });
      if (/\b(?:short|long)\b/.test(entry.stripped)) {
        reasons.push(findingReason("bare-short-or-long", entry.body));
      }
      if (isKrStyleHeader(entry.stripped)) {
        reasons.push(findingReason("kr-style-declaration", entry.body));
      }
    }
    for (const definition of definitions) {
      const declarationShape = new RegExp(`^\\s*static\\b[^=;]*\\b${escapeRegExp(definition.name)}\\s*\\(`);
      const referenced = entries.some((entry) => !declarationShape.test(entry.stripped) && new RegExp(`\\b${escapeRegExp(definition.name)}\\b`).test(entry.stripped));
      if (!referenced) reasons.push(findingReason("unused-static-function", definition.body));
    }
  }
  return { gate, status: reasons.length > 0 ? "failed" : "passed", reasons };
}

interface GlobalDeclaration {
  name: string;
  shape: string;
  line: string;
}

function findSharedGlobalQualifierChanges(params: {
  path: string;
  added: AddedCodeLine[];
  removed: AddedCodeLine[];
  baselineSource?: string;
  postChangeSource?: string;
  targetFunction?: string;
}): string[] {
  if (!params.baselineSource || !params.postChangeSource) return [];
  const beforeGlobals = fileScopeDeclarations(params.baselineSource);
  const afterGlobals = fileScopeDeclarations(params.postChangeSource);
  const addedNames = new Set(params.added.flatMap((entry) => declarationFromLine(entry.stripped)?.name ?? []));
  const removedNames = new Set(params.removed.flatMap((entry) => declarationFromLine(entry.stripped)?.name ?? []));
  const changedNames = [...addedNames].filter((name) => removedNames.has(name));
  const reasons: string[] = [];
  for (const name of changedNames) {
    const before = beforeGlobals.get(name);
    const after = afterGlobals.get(name);
    if (!before || !after || before.shape === after.shape) continue;
    const change = describeDeclarationChange(before.shape, after.shape);
    if (!change) continue;
    const otherReaders = functionsReferencing(params.postChangeSource, name)
      .filter((functionName) => !params.targetFunction || functionName !== params.targetFunction);
    if (params.targetFunction ? otherReaders.length === 0 : otherReaders.length < 2) continue;
    reasons.push(`qualifier_changed_on_shared_global: '${name}' ${change}; shared global referenced by ${otherReaders.length} other functions; changing its qualifiers alters their codegen`);
  }
  return reasons;
}

function fileScopeDeclarations(source: string): Map<string, GlobalDeclaration> {
  const declarations = new Map<string, GlobalDeclaration>();
  let depth = 0;
  for (const rawLine of source.split(/\r?\n/)) {
    const line = stripLineCommentsAndStrings(rawLine);
    if (depth === 0) {
      const declaration = declarationFromLine(line);
      if (declaration) declarations.set(declaration.name, { ...declaration, line: rawLine });
    }
    depth += braceDelta(line);
  }
  return declarations;
}

function declarationFromLine(line: string): { name: string; shape: string } | null {
  if (!line.includes(";") || /[{}]/.test(line) || /\([^)]*\)\s*;/.test(line)) return null;
  const declaration = line.slice(0, line.indexOf(";")).split("=")[0]!.trim();
  if (!declaration || /^(?:typedef|extern)\b/.test(declaration)) return null;
  const trailingAttribute = /\s+(__attribute__\s*\(\(.*\)\)|__declspec\s*\(.*\))\s*$/.exec(declaration)?.[1] ?? "";
  const declarator = trailingAttribute ? declaration.slice(0, declaration.lastIndexOf(trailingAttribute)).trim() : declaration;
  const match = /\b([A-Za-z_][A-Za-z0-9_]*)\s*(\[[^\]]*\])?\s*$/.exec(declarator);
  if (!match?.[1]) return null;
  const name = match[1];
  const shape = declarator
    .replace(new RegExp(`\\b${escapeRegExp(name)}\\b\\s*(?:\\[[^\\]]*\\])?\\s*$`), `@${match[2]?.replace(/\s+/g, "") ?? ""}`)
    .replace(/\s+/g, " ")
    .trim() + (trailingAttribute ? ` ${trailingAttribute.replace(/\s+/g, " ")}` : "");
  return { name, shape };
}

function functionsReferencing(source: string, symbol: string): string[] {
  const references: string[] = [];
  const symbolRe = new RegExp(`\\b${escapeRegExp(symbol)}\\b`);
  let currentFunction: string | null = null;
  let pendingFunction: string | null = null;
  let depth = 0;
  for (const rawLine of source.split(/\r?\n/)) {
    const line = stripLineCommentsAndStrings(rawLine);
    if (depth === 0) {
      const header = /^\s*(?:(?:static|inline)\s+)*(?:[A-Za-z_][A-Za-z0-9_]*\s+)+\**\s*([A-Za-z_][A-Za-z0-9_]*)\s*\([^;{}]*\)\s*\{/.exec(line);
      currentFunction = header?.[1] && !CONTROL_KEYWORDS.has(header[1]) ? header[1] : null;
      const headerWithoutBrace = /^\s*(?:(?:static|inline)\s+)*(?:[A-Za-z_][A-Za-z0-9_]*\s+)+\**\s*([A-Za-z_][A-Za-z0-9_]*)\s*\([^;{}]*\)\s*$/.exec(line);
      if (headerWithoutBrace?.[1] && !CONTROL_KEYWORDS.has(headerWithoutBrace[1])) pendingFunction = headerWithoutBrace[1];
      if (!currentFunction && pendingFunction && /^\s*\{/.test(line)) currentFunction = pendingFunction;
    }
    if (currentFunction && symbolRe.test(line) && !references.includes(currentFunction)) references.push(currentFunction);
    depth += braceDelta(line);
    if (depth === 0 && !pendingFunction) currentFunction = null;
    if (currentFunction && depth > 0) pendingFunction = null;
    if (currentFunction && depth === 0 && /}/.test(line)) currentFunction = null;
  }
  return references;
}

function braceDelta(line: string): number {
  return (line.match(/\{/g)?.length ?? 0) - (line.match(/\}/g)?.length ?? 0);
}

function describeDeclarationChange(before: string, after: string): string | null {
  const beforeArray = /@(\[[^\]]*\])/.exec(before)?.[1] ?? "";
  const afterArray = /@(\[[^\]]*\])/.exec(after)?.[1] ?? "";
  if (beforeArray !== afterArray) return `array size changed from '${beforeArray || "scalar"}' to '${afterArray || "scalar"}'`;
  const qualifiers = ["volatile", "const", "register"];
  for (const qualifier of qualifiers) {
    const beforeHas = objectHasQualifier(before, qualifier);
    const afterHas = objectHasQualifier(after, qualifier);
    if (beforeHas !== afterHas) return `${qualifier} ${afterHas ? "added" : "removed"}`;
  }
  const attributeChanged = /__(?:attribute|declspec)__?\b/.test(before) || /__(?:attribute|declspec)__?\b/.test(after);
  if (attributeChanged) return `alignment/section attribute changed from "${before}" to "${after}"`;
  // A leading const on a pointer qualifies the pointee, not the global object.
  const withoutPointeeConst = (shape: string) => shape.includes("*") ? shape.replace(/^const\s+/, "") : shape;
  if (withoutPointeeConst(before) === withoutPointeeConst(after)) return null;
  return `declared type changed from "${before}" to "${after}"`;
}

function objectHasQualifier(shape: string, qualifier: string): boolean {
  const beforeName = shape.slice(0, shape.indexOf("@"));
  if (qualifier === "const" && beforeName.includes("*") && new RegExp(`^${qualifier}\\b`).test(beforeName)) {
    return new RegExp(`\\*[^*]*\\b${qualifier}\\b`).test(beforeName);
  }
  return new RegExp(`\\b${qualifier}\\b`).test(beforeName);
}

function staticDeclarationName(line: string): string | null {
  if (!/^\s*static\b/.test(line)) return null;
  const matches = [...line.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s*(?=\[|=|;|\(|,)/g)];
  return matches.at(-1)?.[1] ?? null;
}

function isNonStaticDeclarationOf(line: string, name: string): boolean {
  if (/^\s*static\b/.test(line)) return false;
  return new RegExp(`\\b${escapeRegExp(name)}\\s*(?=\\[|=|;|\\(|,)`).test(line);
}

function baselineDeclaresNonStatic(source: string | undefined, name: string): boolean {
  if (!source) return false;
  return source.split(/\r?\n/).some((line) => /^\S/.test(line) && isNonStaticDeclarationOf(stripLineCommentsAndStrings(line), name));
}

function findingReason(pattern: string, line: string): string {
  return `${pattern}: "${line.trim().replaceAll('"', '\\"')}"`;
}

function isKrStyleHeader(body: string): boolean {
  if (!KR_FUNCTION_RE.test(body) || /[;{=]/.test(body)) return false;
  const beforeParen = body.slice(0, body.indexOf("("));
  const identifiers = beforeParen.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
  return identifiers.length >= 2 && !CONTROL_KEYWORDS.has(identifiers[0]!);
}

function stripLineCommentsAndStrings(source: string): string {
  return source
    .replace(/\/\*.*?(?:\*\/|$)/g, " ")
    .replace(/\/\/.*$/, " ")
    .replace(/"(?:\\.|[^"\\])*"/g, " ")
    .replace(/'(?:\\.|[^'\\])*'/g, " ");
}

function escapeRegExp(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

export function applyMicroGatesToValidation<T extends { status: string; reasons: string[] }>(
  validation: T,
  microGates: WorkerMicroGates,
): T & { microGates: WorkerMicroGates } {
  if (microGates.status !== "failed") return { ...validation, microGates };
  return {
    ...validation,
    status: validation.status === "passed" ? "failed" : validation.status,
    reasons: [...validation.reasons, ...microGates.reasons],
    microGates,
  };
}
