export interface WorkerReviewLintFinding {
  ruleId: string;
  severity: "error";
  path: string;
  evidence: string;
  message: string;
}

export interface WorkerReviewLint {
  status: "passed" | "failed" | "skipped";
  reasons: string[];
  findings: WorkerReviewLintFinding[];
}

const DIFF_FILE_RE = /^diff --git a\/(.+?) b\/(.+)$/;
const ADDED_DEFINE_ALIAS_RE = /^\+\s*#\s*define\s+([A-Za-z_][A-Za-z0-9_]*)\b(?!\s*\()\s+([A-Za-z_][A-Za-z0-9_]*)\b\s*(?:$|\/\/|\/\*)/;
const ADDED_FUNCTION_DEFINE_RE = /^\+\s*#\s*define\s+([A-Za-z_][A-Za-z0-9_]*)\(([^)]*)\)\s*(.*)$/;
const ADDRESS_STYLE_GLOBAL_RE = /\b[A-Za-z_][A-Za-z0-9_]*_8[0-9A-Fa-f]{7}\b/g;
const ADDRESS_EXTERN_RE = /^([ +])\s*\/\*\s*(?:0x)?([0-9A-Fa-f]{6,8})\s*\*\/\s*extern\b.*?\b([A-Za-z_][A-Za-z0-9_]*)\s*(?:\[.*\])?\s*;/;
const C_STRING_LITERAL_RE = /"(?:(?:\\.)|[^"\\])*"/g;
const IDENTIFIER_EXPR_RE = "(?:\\(\\s*(?:const\\s+)?(?:char|void)\\s*\\*+\\s*\\)\\s*)?([A-Za-z_][A-Za-z0-9_]*)";

interface AddressExtern {
  address: string;
  name: string;
  added: boolean;
  evidence: string;
}

interface RemovedStringLine {
  body: string;
  evidence: string;
}

interface PendingFunctionDefine {
  name: string;
  params: string;
  body: string;
  evidence: string;
  reported: boolean;
}

export function lintWorkerReviewDiff(diffText: string): WorkerReviewLint {
  if (!diffText.trim()) {
    return { status: "skipped", reasons: ["empty write_set diff"], findings: [] };
  }

  const findings: WorkerReviewLintFinding[] = [];
  const externsByPath = new Map<string, AddressExtern[]>();
  let removedStringLines: RemovedStringLine[] = [];
  let currentPath = "";
  let pendingFunctionDefine: PendingFunctionDefine | null = null;

  for (const line of diffText.split(/\r?\n/)) {
    const fileMatch = DIFF_FILE_RE.exec(line);
    if (fileMatch) {
      currentPath = fileMatch[2];
      removedStringLines = [];
      pendingFunctionDefine = null;
      continue;
    }
    if (!currentPath) continue;
    if (line.startsWith("@@")) {
      removedStringLines = [];
      pendingFunctionDefine = null;
      continue;
    }

    const isAddedLine = line.startsWith("+") && !line.startsWith("+++");
    if (!isAddedLine) pendingFunctionDefine = null;

    if (line.startsWith("-") && !line.startsWith("---")) {
      const body = line.slice(1);
      if (isCSourcePath(currentPath) && bodyHasStringLiteral(body)) {
        removedStringLines.push({ body, evidence: body.trim() });
      }
      continue;
    }

    if (isAddedLine) {
      if (pendingFunctionDefine) {
        const continuation = line.slice(1);
        pendingFunctionDefine.body += `\n${continuation}`;
        pendingFunctionDefine.evidence += `\n${continuation.trim()}`;
        const target = functionLikeMacroTarget(pendingFunctionDefine.name, pendingFunctionDefine.params, pendingFunctionDefine.body);
        if (target && !pendingFunctionDefine.reported) {
          findings.push(functionLikeMacroFinding(currentPath, pendingFunctionDefine.name, target, pendingFunctionDefine.evidence));
          pendingFunctionDefine.reported = true;
        }
        if (!line.trimEnd().endsWith("\\")) pendingFunctionDefine = null;
      } else {
        const functionDefineMatch = ADDED_FUNCTION_DEFINE_RE.exec(line);
        if (functionDefineMatch && !isFunctionLikeMacroExempt(functionDefineMatch[1])) {
          const name = functionDefineMatch[1];
          const evidence = line.slice(1).trim();
          const params = functionDefineMatch[2];
          const target = functionLikeMacroTarget(name, params, functionDefineMatch[3]);
          const reported = Boolean(target);
          if (target) {
            findings.push(functionLikeMacroFinding(currentPath, name, target, evidence));
          }
          if (line.trimEnd().endsWith("\\")) {
            pendingFunctionDefine = { name, params, body: functionDefineMatch[3], evidence, reported };
          }
        }
      }
    }

    const defineMatch = ADDED_DEFINE_ALIAS_RE.exec(line);
    if (defineMatch && (looksLikeVariableIdentifier(defineMatch[1]) || looksLikeVariableIdentifier(defineMatch[2]))) {
      findings.push({
        ruleId: "no-define-alias-global-renames",
        severity: "error",
        path: currentPath,
        evidence: line.slice(1).trim(),
        message: `Avoid renaming variables with #define aliases: ${defineMatch[1]} -> ${defineMatch[2]}.`,
      });
    }

    if (line.startsWith("+") && !line.startsWith("+++")) {
      const addedBody = line.slice(1);
      for (const removedLine of removedStringLines) {
        const replacement = stringLiteralReplacement(removedLine.body, addedBody);
        if (!replacement) continue;
        findings.push({
          ruleId: "no-string-literal-symbol-regression",
          severity: "error",
          path: currentPath,
          evidence: `${removedLine.evidence} -> ${addedBody.trim()}`,
          message: `Keep string literal ${replacement.literal} inline instead of replacing it with ${replacement.identifier}.`,
        });
      }
    } else if (line.startsWith(" ")) {
      removedStringLines = [];
    }

    const externMatch = ADDRESS_EXTERN_RE.exec(line);
    if (externMatch) {
      const entries = externsByPath.get(currentPath) ?? [];
      entries.push({
        address: externMatch[2].toUpperCase(),
        name: externMatch[3],
        added: externMatch[1] === "+",
        evidence: line.slice(1).trim(),
      });
      externsByPath.set(currentPath, entries);
    }
  }

  for (const [path, entries] of externsByPath) {
    const byAddress = new Map<string, AddressExtern[]>();
    for (const entry of entries) {
      const grouped = byAddress.get(entry.address) ?? [];
      grouped.push(entry);
      byAddress.set(entry.address, grouped);
    }
    for (const [address, grouped] of byAddress) {
      const names = [...new Set(grouped.map((entry) => entry.name))].sort();
      if (names.length <= 1 || !grouped.some((entry) => entry.added)) continue;
      findings.push({
        ruleId: "duplicate-address-extern-alias",
        severity: "error",
        path,
        evidence: grouped.map((entry) => entry.evidence).join(" | "),
        message: `Address-commented extern 0x${address} appears under multiple names: ${names.join(", ")}.`,
      });
    }
  }

  return {
    status: findings.length ? "failed" : "passed",
    reasons: findings.map((finding) => `${finding.ruleId}: ${finding.message}`),
    findings,
  };
}

function looksLikeVariableIdentifier(identifier: string): boolean {
  return /^[a-z]/.test(identifier) || /^(?:fn|lbl|un)_[0-9A-Fa-f_]+$/.test(identifier) || /_[0-9A-Fa-f]{6,8}$/.test(identifier);
}

function isCSourcePath(path: string): boolean {
  return /\.(?:c|h)$/i.test(path);
}

function bodyHasStringLiteral(body: string): boolean {
  C_STRING_LITERAL_RE.lastIndex = 0;
  return C_STRING_LITERAL_RE.test(body);
}

function stringLiteralReplacement(removedBody: string, addedBody: string): { literal: string; identifier: string } | null {
  C_STRING_LITERAL_RE.lastIndex = 0;
  for (const match of removedBody.matchAll(C_STRING_LITERAL_RE)) {
    const literal = match[0];
    const prefix = removedBody.slice(0, match.index);
    const suffix = removedBody.slice((match.index ?? 0) + literal.length);
    const replacementMatch = new RegExp(`^\\s*${codeFragmentPattern(prefix)}\\s*${IDENTIFIER_EXPR_RE}\\s*${codeFragmentPattern(suffix)}\\s*$`).exec(addedBody);
    const identifier = replacementMatch?.[1];
    if (identifier && looksLikeVariableIdentifier(identifier)) {
      return { literal, identifier };
    }
  }
  return null;
}

function codeFragmentPattern(fragment: string): string {
  let pattern = "";
  for (const char of fragment.trim()) {
    pattern += /\s/.test(char) ? "\\s*" : escapeRegExp(char);
  }
  return pattern;
}

function escapeRegExp(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

function isFunctionLikeMacroExempt(name: string): boolean {
  return name === "M2C_FIELD" || /_(?:ABS|MIN|MAX|CLAMP)$/.test(name);
}

function functionLikeMacroTarget(name: string, params: string, body: string): string | null {
  const code = stripCommentsAndStrings(body);
  if (new RegExp(`\\b${escapeRegExp(name)}\\b`).test(code)) return name;
  ADDRESS_STYLE_GLOBAL_RE.lastIndex = 0;
  for (const match of code.matchAll(ADDRESS_STYLE_GLOBAL_RE)) {
    if (match[0] !== name) return match[0];
  }
  const paramNames = new Set(
    params
      .split(",")
      .map((param) => param.trim())
      .filter((param) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(param)),
  );
  for (const match of code.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)) {
    const target = match[1];
    if (target !== name && !paramNames.has(target) && !C_KEYWORDS.has(target)) return target;
  }
  return null;
}

const C_KEYWORDS = new Set(["if", "for", "while", "switch", "sizeof", "return"]);

function stripCommentsAndStrings(source: string): string {
  const chars = source.split("");
  for (let index = 0; index < source.length; ) {
    const char = source[index];
    const next = source[index + 1] ?? "";
    if (char === "/" && next === "/") {
      let end = source.indexOf("\n", index);
      if (end < 0) end = source.length;
      for (let cursor = index; cursor < end; cursor += 1) chars[cursor] = " ";
      index = end;
    } else if (char === "/" && next === "*") {
      const close = source.indexOf("*/", index + 2);
      const end = close < 0 ? source.length : close + 2;
      for (let cursor = index; cursor < end; cursor += 1) {
        if (source[cursor] !== "\n") chars[cursor] = " ";
      }
      index = end;
    } else if (char === '"' || char === "'") {
      const quote = char;
      index += 1;
      while (index < source.length && source[index] !== quote) {
        if (source[index] === "\\" && index + 1 < source.length) {
          if (source[index] !== "\n") chars[index] = " ";
          if (source[index + 1] !== "\n") chars[index + 1] = " ";
          index += 2;
        } else {
          if (source[index] !== "\n") chars[index] = " ";
          index += 1;
        }
      }
      index += 1;
    } else {
      index += 1;
    }
  }
  return chars.join("");
}

function functionLikeMacroFinding(path: string, name: string, target: string, evidence: string): WorkerReviewLintFinding {
  return {
    ruleId: "no-define-alias-global-renames",
    severity: "error",
    path,
    evidence,
    message: `Function-like macro ${name} re-declares/aliases global symbol ${target} (prototype-shim shape); fix the owning header instead.`,
  };
}
