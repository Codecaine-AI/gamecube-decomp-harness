/**
 * Banned stack-frame tactic detector for `stop_at_frame` games (SMS).
 *
 * SMS maintainers ban edits whose only effect is the stack frame (PAD_STACK,
 * padding locals, alignment unions, inline forcing, frame-only operand swaps
 * or declaration reorders) and agent-written TODO/nonmatching/fakematch
 * comments. Past PRs and past worker attempts still contain those tactics, so
 * everything that replays history to an agent for such a game passes through
 * this module: read-time redaction for cards and search tools, the prompt
 * block for summarizer/librarian write paths, and the stored-item prune job.
 * Melee (`match_frame`) is never filtered.
 *
 * Games whose steering gate is not `off` (SMS) also get steering
 * recommendations relabelled as diagnostic probes; `applyKnowledgePolicies`
 * composes both for every read path.
 */
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { resolveGame, type SteeringGateMode, type StackFramePolicy } from "../game-registry/resolver.js";
import { gameSteeringGate, steeringGateActive } from "../tools/steering-gate.js";

/**
 * Agent-comment vocabulary. A copy of `AGENT_COMMENT_TERMS` in
 * `toolpacks/gamecube-decomp/_impl/gamecube/tools/agent_comments.py`; a test
 * keeps the two lists identical.
 */
export const AGENT_COMMENT_TERMS = [
  String.raw`\bTODO\b`,
  String.raw`\bFIXME\b`,
  String.raw`\bXXX\b`,
  String.raw`\bHACK\b`,
  String.raw`\bnon[- ]?matching\b`,
  String.raw`\bnot\s+matching\b`,
  String.raw`\bdo(?:es)?n'?t\s+match\b`,
  String.raw`\bdoes\s+not\s+match\b`,
  String.raw`\bfake[- ]?match`,
  String.raw`\bfabricated\b`,
  String.raw`\bframe[- ]only\b`,
  String.raw`\bframe\s+size\b`,
  String.raw`\bstack\s+frame\b`,
  String.raw`\bstack\s+(?:size|pad(?:ding)?|slot|offset|layout|alignment)\b`,
  String.raw`\bregalloc\b`,
  String.raw`\bregister\s+alloc`,
  String.raw`\bregswap\b`,
  String.raw`\bmatches\s+except\b`,
  String.raw`\bobjdiff\b`,
  String.raw`\binline[_ ]depth\b`,
  String.raw`\bdont_inline\b`,
  String.raw`\b\d{1,3}(?:\.\d+)?\s*%\s*match`,
] as const;

const AGENT_COMMENT_RE = new RegExp(AGENT_COMMENT_TERMS.join("|"), "i");

export type StackTacticRule =
  | "pad_stack"
  | "padding_local"
  | "frame_tactic"
  | "alignment_trick"
  | "inline_forcing"
  | "frame_reorder"
  | "agent_comment";

export interface StackTacticFinding {
  rule: StackTacticRule;
  excerpt: string;
}

/** One line carried next to filtered history so the agent knows why text is missing. */
export const STACK_POLICY_NOTE =
  "This game stops at the stack frame: PAD_STACK, padding/dummy/trash locals, frame-size or alignment tricks, inline forcing, frame-only swaps or reorders, and agent TODO/nonmatching/fakematch comments are banned; history recommending them was redacted.";

export const STACK_POLICY_REDACTION = "[redacted: banned stack-frame tactic]";

// --- Code-line rules -------------------------------------------------------

const PAD_STACK_RE = /\bPAD_STACK\b/i;
/** `char trash[8];`, `volatile u8 pad[0x10];`, `int dummy[2];`, `u8 stack_pad[4];` */
const TRASH_LOCAL_RE = /\b(?:trash|stack_?pad\w*|dummy_?(?:stack|pad|frame)\w*)\s*\[/i;
const VOLATILE_ARRAY_LOCAL_RE = /^\s+volatile\s+[\w:<>* ]+?\s+\w+\s*\[[^\]]*\]\s*;/;
const INLINE_PRAGMA_RE = /#\s*pragma\s+(?:dont_inline|inline_depth|always_inline|auto_inline)\b/i;
const LOCAL_ALIGN_RE = /^\s+(?!static\b|extern\b)[^=()]*\bATTRIBUTE_ALIGN\s*\(/;
const ALIGN_UNION_LOCAL_RE = /^\s+union\s*\{[^}]*\b(?:u64|s64|f64|double|long\s+long)\b[^}]*\[[^\]]*\][^}]*\}\s*\w+\s*;/;

// --- Prose rules (sentence co-occurrence) ----------------------------------

/** Mentions of the frame itself; "stack" alone (event stacks, call stacks) is not enough. */
const FRAME_TERM_RE = /\b(?:stack[- ]?frame|frame[- ]?size|frame[- ]only|frame[- ]padding|stack\s+(?:size|pad(?:ding)?|slot|offset|layout|alignment|space|usage)|stwu\b|r1\s+offsets?|\d+\(r1\)|(?:fix|match|grow|shrink|pad|bump)(?:es|ed|ing|s)?\s+the\s+(?:stack|frame)\b)/i;
const PADDING_LOCAL_RE = /\b(?:padding|pad|dummy|filler|trash|unused|extra|volatile|spare|scratch)\s+(?:local|stack|variable|var|array|buffer|char|byte)s?\b|\btrash\s*\[|\bpad\s*\[|\bchar\s+\w+\s*\[\s*(?:0x)?[0-9a-f]+\s*\]/i;
const INLINE_TERM_RE = /\b(?:dont_inline|inline_depth|auto_inline|(?:force|forcing|forced|selective(?:ly)?|un|de|out[- ]of[- ]line)[- ]?inlin\w*|inlin\w*\s+to\s+(?:fix|match|grow|shrink|force))/i;
const ALIGN_TERM_RE = /\b(?:ATTRIBUTE_ALIGN|__attribute__\s*\(\(\s*aligned|alignment\s+union|align(?:ed|ment)?\s+(?:local|union|buffer|array))/i;
const REORDER_TERM_RE = /\b(?:swap(?:s|ped|ping)?|reorder(?:s|ed|ing)?|re-order\w*|flip(?:s|ped|ping)?|revers(?:e|ed|ing))\b[^.]{0,80}\b(?:declarations?|locals?|operands?|order|comparison|compare)\b|\b(?:declaration|local|operand)\s+order\b|\b0\s*<=\s*\w+/i;
const RECOMMEND_COMMENT_RE = /\b(?:annotat\w*|mark(?:ed|s|ing)?|leave|leaves|left|leaving|add(?:ed|s|ing)?|tag(?:ged)?|keep(?:s|ing)?|kept|retain(?:s|ed|ing)?|insert(?:s|ed|ing)?|writ(?:e|es|ing|ten))\b/i;
const AGENT_COMMENT_PROSE_RE = /\b(?:TODO|FIXME|non[- ]?matching|fake[- ]?match\w*|frame[- ]only)\b/i;

function codeComments(line: string): string[] {
  const texts: string[] = [];
  const block = /\/\*([\s\S]*?)\*\//g;
  for (const match of line.matchAll(block)) texts.push(match[1] ?? "");
  const stripped = line.replace(block, "");
  const tail = /\/\/(.*)$/.exec(stripped);
  if (tail) texts.push(tail[1] ?? "");
  return texts;
}

/** A text is a diff when it carries hunk or file headers; only then are `+`/`-` markers. */
function isDiffText(text: string): boolean {
  return /^(?:@@ |\+\+\+ |--- |diff --git )/m.test(text);
}

/** Strip a unified-diff marker. Removed lines (`-`) are not recommendations. */
function diffPayload(line: string, diff: boolean): string | null {
  if (!diff) return line;
  if (/^(?:---|\+\+\+|@@)\s/.test(line)) return null;
  if (line.startsWith("-")) return null;
  if (line.startsWith("+")) return line.slice(1);
  return line;
}

function looksLikeCode(line: string): boolean {
  const trimmed = line.trim();
  return /^#\s*pragma\b/.test(trimmed)
    || /[;{}]\s*(?:\/\/.*|\/\*.*)?$/.test(trimmed)
    || /^\/\/|^\/\*/.test(trimmed);
}

function codeLineFindings(line: string): StackTacticRule[] {
  const rules = new Set<StackTacticRule>();
  if (PAD_STACK_RE.test(line)) rules.add("pad_stack");
  if (TRASH_LOCAL_RE.test(line) || VOLATILE_ARRAY_LOCAL_RE.test(line)) rules.add("padding_local");
  if (INLINE_PRAGMA_RE.test(line)) rules.add("inline_forcing");
  if (LOCAL_ALIGN_RE.test(line) || ALIGN_UNION_LOCAL_RE.test(line)) rules.add("alignment_trick");
  if (codeComments(line).some((text) => AGENT_COMMENT_RE.test(text))) rules.add("agent_comment");
  return [...rules];
}

/** Prose that forbids or reports removing a tactic is policy, not a recommendation. */
const NEGATION_RE = /\b(?:no|never|don'?t|do\s+not|(?:did|does|would|could|should)\s*n(?:o|')t|cannot|can'?t|banned|ban|bans|prohibit\w*|forbid\w*|disallow\w*|violat\w*|illegal|declin\w*|ablat\w*|refus\w*|avoid(?:s|ed)?|remov(?:e|ed|es|ing)|strip(?:s|ped|ping)?|revert(?:s|ed|ing)?|rejected|drop(?:s|ped)?)\b/i;

function sentenceFindings(sentence: string): StackTacticRule[] {
  const rules = new Set<StackTacticRule>();
  if (NEGATION_RE.test(sentence)) return [];
  if (PAD_STACK_RE.test(sentence)) rules.add("pad_stack");
  if (/\btrash\s*\[|\bchar\s+trash\b/i.test(sentence)) rules.add("padding_local");
  if (/#\s*pragma\s+(?:dont_inline|inline_depth)/i.test(sentence)) rules.add("inline_forcing");
  if (RECOMMEND_COMMENT_RE.test(sentence) && AGENT_COMMENT_PROSE_RE.test(sentence) && /\b(?:comments?|markers?)\b|\/\/|\/\*/i.test(sentence)) {
    rules.add("agent_comment");
  }
  if (FRAME_TERM_RE.test(sentence)) {
    if (PADDING_LOCAL_RE.test(sentence)) rules.add("padding_local");
    if (INLINE_TERM_RE.test(sentence)) rules.add("inline_forcing");
    if (ALIGN_TERM_RE.test(sentence) || /\bunion\b/i.test(sentence)) rules.add("alignment_trick");
    if (REORDER_TERM_RE.test(sentence)) rules.add("frame_reorder");
    if (rules.size === 0 && /\b(?:tactic|trick|hack|workaround|technique|(?:fix|match|grow|shrink|pad|bump)(?:es|ed|ing|s)?\s+the\s+(?:stack|frame))\b/i.test(sentence)) {
      rules.add("frame_tactic");
    }
  } else if (/\b(?:dont_inline|inline_depth)\b/i.test(sentence) && /\b(?:match|matching|force|forces|forcing|needed|required|use|used|using|add|added)\b/i.test(sentence)) {
    rules.add("inline_forcing");
  }
  return [...rules];
}

/** Split prose into sentences without breaking `0x10`, `1.5`, or file extensions. */
function sentences(line: string): string[] {
  return line.split(/(?<=[.!?;])\s+(?=[A-Z`*(\-\d])/).filter((part) => part.trim() !== "");
}

interface Segment {
  text: string;
  rules: StackTacticRule[];
  /** Separator that followed the segment in the original text. */
  sep: string;
}

function segmentLine(rawLine: string, diff: boolean): Segment[] {
  const payload = diffPayload(rawLine, diff);
  if (payload === null) return [{ text: rawLine, rules: [], sep: "" }];
  if (looksLikeCode(payload)) return [{ text: rawLine, rules: codeLineFindings(payload), sep: "" }];
  const parts = sentences(rawLine);
  return parts.map((part, index) => ({
    text: part,
    rules: sentenceFindings(part),
    sep: index < parts.length - 1 ? " " : "",
  }));
}

function excerptOf(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= 160 ? flat : `${flat.slice(0, 159)}…`;
}

/** Every banned-tactic recommendation in a text or diff excerpt. */
export function detectBannedStackTactics(text: string): StackTacticFinding[] {
  const findings: StackTacticFinding[] = [];
  const diff = isDiffText(text);
  for (const line of text.split(/\r?\n/)) {
    for (const segment of segmentLine(line, diff)) {
      for (const rule of segment.rules) findings.push({ rule, excerpt: excerptOf(segment.text) });
    }
  }
  return findings;
}

export function hasBannedStackTactic(text: string): boolean {
  return detectBannedStackTactics(text).length > 0;
}

export interface StackPolicyRedaction {
  text: string;
  findings: StackTacticFinding[];
  /** True when nothing but redaction markers and whitespace is left. */
  emptied: boolean;
}

/** Replace flagged lines (code) or sentences (prose) with one marker each run. */
export function redactBannedStackTactics(text: string): StackPolicyRedaction {
  const findings: StackTacticFinding[] = [];
  const out: string[] = [];
  let lastWasMarker = false;
  const diff = isDiffText(text);
  for (const line of text.split(/\r?\n/)) {
    let rendered = "";
    for (const segment of segmentLine(line, diff)) {
      if (segment.rules.length === 0) {
        rendered += segment.text + segment.sep;
        if (segment.text.trim() !== "") lastWasMarker = false;
        continue;
      }
      for (const rule of segment.rules) findings.push({ rule, excerpt: excerptOf(segment.text) });
      if (!lastWasMarker) rendered += STACK_POLICY_REDACTION + segment.sep;
      lastWasMarker = true;
    }
    if (rendered === "" && lastWasMarker && line.trim() !== "") continue;
    out.push(rendered.trimEnd());
  }
  if (findings.length === 0) return { text, findings, emptied: false };
  const redacted = out.join("\n");
  const emptied = redacted.split(STACK_POLICY_REDACTION).join("").replace(/[\s.,;:…-]+/g, "") === "";
  return { text: redacted, findings, emptied };
}

// --- Game policy -------------------------------------------------------------

const policyCache = new Map<string, StackFramePolicy>();

/** The game's stack-frame policy; unknown games and resolution errors fall back to `match_frame`. */
export function stackFramePolicyForGame(gameId: string | undefined): StackFramePolicy {
  const id = gameId ?? "melee";
  const cached = policyCache.get(id);
  if (cached) return cached;
  let policy: StackFramePolicy = "match_frame";
  try {
    policy = resolveGame({ gameId: id }).matching.stackFramePolicy;
  } catch {
    policy = "match_frame";
  }
  policyCache.set(id, policy);
  return policy;
}

export function filtersStackTactics(policy: StackFramePolicy | undefined): boolean {
  return policy === "stop_at_frame";
}

/** Keys whose values are identities or citations; never rewritten. */
const PROTECTED_KEY_RE = /(?:^|_)(?:id|ids|locator|locators|stable_key|pr_ref|ref|refs|subject|kind|status|path|paths|unit|symbol)$/i;

export interface PayloadRedactionResult<T> {
  value: T;
  redactions: number;
}

/**
 * Deep-redact every narrative string in a JSON payload. Identity and citation
 * fields are kept verbatim so locators stay resolvable.
 */
export function redactStackTacticsInPayload<T>(payload: T): PayloadRedactionResult<T> {
  let redactions = 0;
  const walk = (value: unknown, key: string | undefined): unknown => {
    if (typeof value === "string") {
      if (key !== undefined && PROTECTED_KEY_RE.test(key)) return value;
      const result = redactBannedStackTactics(value);
      if (result.findings.length > 0) redactions += 1;
      return result.text;
    }
    if (Array.isArray(value)) return value.map((item) => walk(item, key));
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([entryKey, entry]) => [entryKey, walk(entry, entryKey)]));
    }
    return value;
  };
  const value = walk(payload, undefined) as T;
  return { value, redactions };
}

/**
 * Prompt block for agents that write history (worker summarizer, librarian)
 * so a stop_at_frame game never records a banned tactic as reusable. Empty for
 * every other policy.
 */
export function stackFramePolicyPromptBlock(policy: StackFramePolicy | undefined): string {
  if (!filtersStackTactics(policy)) return "";
  return [
    "",
    "",
    `<stack_frame_policy value="stop_at_frame">`,
    "This game stops matching at the stack frame. A function whose only difference from the target is frame size (`stwu r1,-N(r1)`) or the r1 stack offsets that move with it is done; edits whose only effect is the frame are banned.",
    "",
    "- Never record any of these as a reusable or matching tactic, observation, fact, or pattern: PAD_STACK or similar macros; padding, dummy, volatile, `trash` or `pad[` locals added for frame size; frame-size or stack-alignment tricks (alignment unions, ATTRIBUTE_ALIGN on locals); `#pragma dont_inline`/`inline_depth` or selective inlining used to force the frame; operand swaps (`0 <= x`) or declaration reorders whose only effect is the frame; agent TODO, nonmatching, fakematch or frame-only comments.",
    "- When the material shows one of them, record it only as rejected: say the approach is banned in this game and is not to be repeated.",
    "- Swaps, reorders, extra locals or inlines that change registers, instructions, branches or relocations are ordinary matching and may be recorded.",
    "</stack_frame_policy>",
  ].join("\n");
}

/** Quarantine ledger written by the stack-prune job beside a game's knowledge store. */
export function stackPolicyQuarantinePath(storePath: string): string {
  return resolve(dirname(storePath), "stack-policy-quarantine.jsonl");
}

/** A marked store belongs to a stop_at_frame game: index builders redact its history. */
export function stackPolicyQuarantined(storePath: string): boolean {
  return existsSync(stackPolicyQuarantinePath(storePath));
}

// --- Steering relabel (steering gate != off) ---------------------------------
//
// A steering edit changes the source form but not the program's behaviour
// (single-use temps and aliases, split expressions, accessor<->field swaps,
// if<->ternary, operand order, `int`<->`s32`, declaration or statement
// reorders). It moves register choice or instruction order and can look like a
// fix. History recommending one is not deleted: it is evidence of what codegen
// the original needs. It is relabelled in place so an agent reads it as a
// probe, never as the fix.

export type SteeringTacticRule = "steering_temp" | "steering_accessor" | "steering_form";

export interface SteeringTacticFinding {
  rule: SteeringTacticRule;
  excerpt: string;
}

export const STEERING_PROBE_LABEL = "[diagnostic probe: shows what codegen the original needs; not a fix]";

/** One line carried next to relabelled history. */
export const STEERING_POLICY_NOTE =
  "This game runs the steering gate: rewrites that behave exactly like the code they replace (single-use temps or aliases, split expressions, accessor/field swaps, if/ternary, operand order, int/s32, declaration or statement reorders) are never fixes; history recommending them is labelled as a diagnostic probe.";

/** A local whose name says it only exists to hold a value once: `f32 tmp = a->b;`, `s32 temp2 = x;`. */
const TEMP_DECL_RE = /^\s*(?:const\s+)?(?:(?:unsigned|signed|struct|class)\s+)?[A-Za-z_][\w:<>]*\s*[*&]*\s*\b(?:tmp|temp|_tmp|_temp)\w*\s*=(?!=)/;

const TEMP_TERM_RE = /\b(?:single[- ]use|temp(?:orar(?:y|ies))?s?\b|tmp\w*|alias(?:es|ed|ing)?\b|intermediate\s+(?:locals?|variables?|values?)|(?:extra|new|separate|additional|dedicated)\s+(?:locals?|variables?|vars?)\b|(?:into|in|to)\s+(?:a|an|its\s+own|their\s+own)\s+(?:(?:separate|new|extra|local)\s+)?(?:local|temp|variable)s?\b|split(?:s|ting)?\s+(?:the\s+|this\s+|that\s+|an?\s+)?(?:expressions?|computations?|calculations?|statements?|conditions?)|cach(?:e|es|ed|ing)\s+[^.]{0,40}\bin\s+a\s+local)/i;
const ACCESSOR_TERM_RE = /\b(?:(?:accessors?|getters?|setters?)\b[^.]{0,80}\b(?:instead\s+of|rather\s+than|swap\w*|replac\w*|switch\w*|direct(?:ly)?|fields?|members?)\b|(?:fields?|members?)\b[^.]{0,80}\b(?:instead\s+of|rather\s+than)\b[^.]{0,40}\b(?:accessors?|getters?|setters?|inlines?)\b|direct\s+(?:field|member)\s+access|access(?:es|ed|ing)?\s+(?:the\s+)?(?:field|member)s?\s+directly|inline\s+hop|\w+->\s*get\w*\(\)[^.]{0,40}\b(?:instead\s+of|rather\s+than|with|to|->|→)\b[^.]{0,20}->\s*m[A-Z]\w*|->\s*m[A-Z]\w*[^.]{0,40}\b(?:instead\s+of|rather\s+than|with|to|->|→)\b[^.]{0,20}->\s*get\w*\(\))/i;
const FORM_TERM_RE = /\b(?:ternar(?:y|ies)|conditional\s+(?:operator|expression)|operand\s+order|(?:swap|flip|revers|reorder|re-order|switch)\w*\b[^.]{0,60}\b(?:operands?|sides?\s+of\s+the\s+(?:comparison|compare|addition|multiplication))|commut\w*|(?:reorder|re-order|swap|mov(?:e|ed|es|ing)|hoist|sink|permut)\w*\b[^.]{0,80}\b(?:declarations?|statements?|assignments?|lines?|locals?|stores?|loads?)\b|(?:declaration|statement|assignment)\s+order|(?:int|s32|u32|s16|u16|s8|u8|unsigned|signed)\s+(?:instead\s+of|rather\s+than|vs\.?|versus|->|→|to)\s+(?:int|s32|u32|s16|u16|s8|u8|unsigned|signed)\b|(?:\*\s*0\.5f?|\/\s*2(?:\.0)?f?)\b[^.]{0,40}\b(?:instead\s+of|rather\s+than|vs\.?|->|→)\b|compound\s+assign\w*|(?:if|if\/else|if-else)\s+(?:statement\s+)?(?:instead\s+of|rather\s+than|into|to|->|→|vs\.?)\s+(?:a\s+)?(?:ternary|\?:)|\?:\s+(?:instead\s+of|rather\s+than|into|to|->|→)\s+(?:an?\s+)?if)/i;

/** A steering tactic is only relabelled when it is offered as the thing that matched or fixed something. */
const FIX_CONTEXT_RE = /\b(?:match\w*|fix\w*|codegen|regalloc|register\w*|r\d{1,2}\b|f\d{1,2}\b|instructions?|scheduling|load\s+order|help(?:s|ed)?|forc\w*|works?|worked|needed|needs|required|requires|gets?|got|yields?|produc\w*|emit\w*|tr(?:y|ied|ies)|use[sd]?|using|swap(?:s|ped)?\s+r\d|closer|improv\w*|recover\w*)\b|%/i;

function sentenceSteeringFindings(sentence: string): SteeringTacticRule[] {
  if (NEGATION_RE.test(sentence) || !FIX_CONTEXT_RE.test(sentence)) return [];
  const rules: SteeringTacticRule[] = [];
  if (TEMP_TERM_RE.test(sentence)) rules.push("steering_temp");
  if (ACCESSOR_TERM_RE.test(sentence)) rules.push("steering_accessor");
  if (FORM_TERM_RE.test(sentence)) rules.push("steering_form");
  return rules;
}

function codeLineSteeringFindings(line: string): SteeringTacticRule[] {
  const rules = new Set<SteeringTacticRule>();
  if (TEMP_DECL_RE.test(line)) rules.add("steering_temp");
  for (const comment of codeComments(line)) {
    for (const rule of sentenceSteeringFindings(comment)) rules.add(rule);
  }
  return [...rules];
}

interface SteeringSegment {
  text: string;
  rules: SteeringTacticRule[];
  sep: string;
}

function steeringSegments(rawLine: string, diff: boolean): SteeringSegment[] {
  const payload = diffPayload(rawLine, diff);
  if (payload === null || rawLine.includes(STEERING_PROBE_LABEL)) return [{ text: rawLine, rules: [], sep: "" }];
  if (looksLikeCode(payload)) return [{ text: rawLine, rules: codeLineSteeringFindings(payload), sep: "" }];
  // Stack redaction markers are their own sentence, so a neighbour is judged alone.
  const parts = rawLine.split(/(?<=[.!?;\]])\s+(?=[A-Z`*(\-\d[])/).filter((part) => part.trim() !== "");
  return parts.map((part, index) => ({
    text: part,
    rules: sentenceSteeringFindings(part),
    sep: index < parts.length - 1 ? " " : "",
  }));
}

/** Every steering-tactic recommendation in a text or diff excerpt. */
export function detectSteeringTactics(text: string): SteeringTacticFinding[] {
  const findings: SteeringTacticFinding[] = [];
  const diff = isDiffText(text);
  for (const line of text.split(/\r?\n/)) {
    for (const segment of steeringSegments(line, diff)) {
      for (const rule of segment.rules) findings.push({ rule, excerpt: excerptOf(segment.text) });
    }
  }
  return findings;
}

export interface SteeringRelabel {
  text: string;
  findings: SteeringTacticFinding[];
}

/**
 * Append {@link STEERING_PROBE_LABEL} to every code line or prose sentence
 * that recommends a steering tactic as a fix. Nothing is removed; text that
 * already carries the label is left alone, so relabelling is idempotent.
 */
export function relabelSteeringTactics(text: string): SteeringRelabel {
  const findings: SteeringTacticFinding[] = [];
  const diff = isDiffText(text);
  const out = text.split(/\r?\n/).map((line) => {
    let rendered = "";
    for (const segment of steeringSegments(line, diff)) {
      if (segment.rules.length === 0) {
        rendered += segment.text + segment.sep;
        continue;
      }
      for (const rule of segment.rules) findings.push({ rule, excerpt: excerptOf(segment.text) });
      rendered += `${segment.text.trimEnd()} ${STEERING_PROBE_LABEL}${segment.sep}`;
    }
    return rendered;
  });
  if (findings.length === 0) return { text, findings };
  return { text: out.join("\n"), findings };
}

// --- Composed knowledge policies ------------------------------------------------

/** The two read-time knowledge policies of a game. */
export interface KnowledgePolicy {
  stackFramePolicy: StackFramePolicy;
  steeringGate: SteeringGateMode;
}

const steeringGateCache = new Map<string, SteeringGateMode>();

/** The game's steering gate; unknown games and resolution errors fall back to `off`. */
export function steeringGateForGame(gameId: string | undefined): SteeringGateMode {
  const id = gameId ?? "melee";
  const cached = steeringGateCache.get(id);
  if (cached) return cached;
  const mode = gameSteeringGate({ gameId: id });
  steeringGateCache.set(id, mode);
  return mode;
}

export function knowledgePolicyForGame(gameId: string | undefined): KnowledgePolicy {
  return { stackFramePolicy: stackFramePolicyForGame(gameId), steeringGate: steeringGateForGame(gameId) };
}

/** True when the policy rewrites anything; Melee's default policy is a no-op. */
export function knowledgePolicyActive(policy: Partial<KnowledgePolicy>): boolean {
  return filtersStackTactics(policy.stackFramePolicy) || steeringGateActive(policy.steeringGate);
}

/** Narrative-string rewrite for one policy: stack redaction first, then steering relabel. */
export function knowledgePolicyText(policy: Partial<KnowledgePolicy>): (text: string) => string {
  const stack = filtersStackTactics(policy.stackFramePolicy);
  const steering = steeringGateActive(policy.steeringGate);
  if (!stack && !steering) return (text) => text;
  return (text) => {
    const redacted = stack ? redactBannedStackTactics(text).text : text;
    return steering ? relabelSteeringTactics(redacted).text : redacted;
  };
}

function walkNarrative<T>(payload: T, rewrite: (text: string) => { text: string; changed: boolean }): { value: T; changed: number } {
  let changed = 0;
  const walk = (value: unknown, key: string | undefined): unknown => {
    if (typeof value === "string") {
      if (key !== undefined && PROTECTED_KEY_RE.test(key)) return value;
      const result = rewrite(value);
      if (result.changed) changed += 1;
      return result.text;
    }
    if (Array.isArray(value)) return value.map((item) => walk(item, key));
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([entryKey, entry]) => [entryKey, walk(entry, entryKey)]));
    }
    return value;
  };
  return { value: walk(payload, undefined) as T, changed };
}

/** Deep-relabel every narrative string; identity and citation fields stay verbatim. */
export function relabelSteeringTacticsInPayload<T>(payload: T): { value: T; relabels: number } {
  const { value, changed } = walkNarrative(payload, (text) => {
    const result = relabelSteeringTactics(text);
    return { text: result.text, changed: result.findings.length > 0 };
  });
  return { value, relabels: changed };
}

/** Steering relabel for a gate mode: identity when the gate is off. */
export function applySteeringPolicy<T>(value: T, mode: SteeringGateMode | undefined): T {
  if (!steeringGateActive(mode)) return value;
  return relabelSteeringTacticsInPayload(value).value;
}

export interface KnowledgePolicyNotes {
  stack_policy_note?: string;
  stack_policy_redactions?: number;
  steering_policy_note?: string;
  steering_policy_relabels?: number;
}

/**
 * Apply a policy to a JSON payload: stack redaction, then steering relabel.
 * Each active policy adds its note and count; with neither active the payload
 * itself is returned.
 */
export function applyKnowledgePolicy<T extends object>(policy: Partial<KnowledgePolicy>, payload: T): T & KnowledgePolicyNotes {
  if (!knowledgePolicyActive(policy)) return payload;
  let value = payload;
  const notes: KnowledgePolicyNotes = {};
  if (filtersStackTactics(policy.stackFramePolicy)) {
    const redacted = redactStackTacticsInPayload(value);
    value = redacted.value;
    notes.stack_policy_note = STACK_POLICY_NOTE;
    notes.stack_policy_redactions = redacted.redactions;
  }
  if (steeringGateActive(policy.steeringGate)) {
    const relabelled = relabelSteeringTacticsInPayload(value);
    value = relabelled.value;
    notes.steering_policy_note = STEERING_POLICY_NOTE;
    notes.steering_policy_relabels = relabelled.relabels;
  }
  return { ...value, ...notes };
}

/**
 * History payload replayed to an agent of the given game. Melee is unchanged;
 * SMS loses banned stack tactics (stop_at_frame) and, while its steering gate
 * is not off, has steering recommendations labelled as diagnostic probes.
 */
export function applyKnowledgePolicies<T extends object>(gameId: string | undefined, payload: T): T & KnowledgePolicyNotes {
  return applyKnowledgePolicy(knowledgePolicyForGame(gameId), payload);
}
