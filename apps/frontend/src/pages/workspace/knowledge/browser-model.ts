import type { KnowledgeUnitTarget, SubjectIdentity } from "./api";

export type KnowledgeVersion = "source" | "atlas" | "guide";
export interface SourceFile { path: string; unit: string | null; targets: number; facts: number; lines: number }
export interface SourceManifest { revision: string; generatedAt: string; files: SourceFile[] }
export interface SourceSymbol { canonical: string; proposed: string | null; confidence: number | null; subject: string | null; status: string }
export interface SourceFileView extends SourceFile { revision: string; canonical: string; rendered: string; symbols: SourceSymbol[]; definitions: Record<string, number> }
export interface CodeToken { text: string; tone: string; subject?: string; canonical?: string; confidence?: number | null }

export const VERSION_OPTIONS: Array<{id: KnowledgeVersion; name: string; description: string}> = [
  { id: "source", name: "Source desk", description: "Read a file. Click a function. Inspect what we know." },
  { id: "atlas", name: "Target atlas", description: "Browse targets and follow their relationships." },
  { id: "guide", name: "Field guide", description: "Read the explanation, then inspect its evidence." },
];
export const FACT_LABELS: Record<string,string> = { purpose: "What it does", inferred_name: "Proposed name", inferred_type: "Type & layout", data_flow: "Inputs & outputs", state_behavior: "State & behavior", game_mapping: "In the game" };
export function label(subject: SubjectIdentity): string { return subject.subjectKind === "target" ? subject.symbol ?? subject.stableKey : subject.locator.split(/[/:]/).filter(Boolean).at(-1) ?? subject.locator; }
export function recordQuery(subject: SubjectIdentity) { return subject.subjectKind === "target" ? { target_stable_key: subject.stableKey } : { entity_locator: subject.locator }; }
export function asTarget(unit: string, target: KnowledgeUnitTarget): SubjectIdentity { return { subjectKind: "target", id: target.target_id, kind: target.kind, stableKey: target.stable_key, unit, symbol: target.symbol, address: target.address, identityStatus: "current" }; }
export function targetFromKey(key: string): Extract<SubjectIdentity, {subjectKind: "target"}> { const colon = key.lastIndexOf(":"); return { subjectKind: "target", id: key, kind: "function", stableKey: key, unit: key.slice(0,colon), symbol: key.slice(colon+1), address: null, identityStatus: "current" }; }
export function identityExplanation(subject: SubjectIdentity): string {
  if (subject.subjectKind === "target") return subject.kind === "function" ? "A target is one compiled function in a translation unit. Its canonical symbol identifies the code; a proposed name is a reading aid." : "A data target identifies compiled data, often a section containing several objects. Its knowledge can describe the whole section.";
  const descriptions: Record<string,string> = { translation_unit: "A translation unit is a source file compiled into an object file. It groups the functions and data that belong together.", struct: "A structure describes a type and its memory layout.", struct_field: "A field is one member of a structure.", parameter: "A parameter describes an input to a function.", game_concept: "A game concept connects code to a behavior or system in Melee.", pattern: "A pattern describes a recurring implementation technique." };
  return descriptions[subject.kind] ?? "An entity connects knowledge across code, types, and game behavior.";
}

/** Tokenize the full text first, preserving comment/string boundaries across page breaks. */
export function codeLines(content: string, symbols: SourceSymbol[], proposed: boolean): CodeToken[][] {
  const names = new Map<string,SourceSymbol>();
  for (const s of symbols) if (s.subject && ["substituted","no_guess","invalid_guess","name_collision"].includes(s.status)) {
    // Some occurrences remain canonical when the parser cannot safely substitute them.
    names.set(s.canonical,s);
    if(proposed && s.status==="substituted" && s.proposed)names.set(s.proposed,s);
  }

  const tokens = content.match(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b[A-Za-z_]\w*\b|\b(?:0x[\da-fA-F]+|\d+(?:\.\d+)?)\b|\s+|./g) ?? [];
  const lines: CodeToken[][] = [[]];
  for (const text of tokens) {
    const literal = /^(?:\/\/|\/\*|["'])/.test(text);
    const symbol = literal ? undefined : names.get(text);
    const tone = /^\//.test(text) && literal ? "comment" : /^["']/.test(text) ? "string" : /^(?:void|int|float|double|char|short|long|static|const|struct|typedef|enum|if|else|return|for|while|switch|case|break|NULL|true|false|bool|u32|s32|f32)$/.test(text) ? "keyword" : /^\d/.test(text) ? "number" : "";
    text.split("\n").forEach((part,index) => { if (index) lines.push([]); if (part) lines.at(-1)!.push({ text: part, tone, subject: symbol?.subject ?? undefined, canonical: symbol?.canonical, confidence: symbol?.confidence }); });
  }
  return lines;
}

export function proposalConfidence(value: number | null | undefined): string {
  return value == null ? "confidence not recorded" : `${Math.round(value * 100)}% confidence${value < 0.7 ? " · tentative" : ""}`;
}
