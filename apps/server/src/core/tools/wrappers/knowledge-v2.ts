import {
  kv2AttemptSearch,
  kv2DiscordSearch,
  kv2EntityLookup,
  kv2PrSearch,
  kv2ResolveLocator,
  kv2SubjectRecord,
  kv2UnitContext,
  kv2WikiSearch,
} from "@server/core/knowledge-v2/tools.js";
import { openKnowledgeIndexDb, type KnowledgeIndexDb } from "@server/core/knowledge-v2/index/db.js";
import { openKnowledgeStore, type KnowledgeStore } from "@server/core/knowledge-v2/storage/store.js";
import { boundedLimit, jsonToolResult } from "../runtime/results.js";
import type { AgentToolRegistration, AgentToolRuntimeContext, PiToolDefinition } from "../types.js";

type SearchMode = "keyword" | "vector" | "hybrid";
type AttemptOutcome = "match" | "improvement" | "no_change" | "error";
type EntityKind = "translation_unit" | "struct" | "struct_field" | "parameter" | "game_concept" | "pattern";

interface KnowledgeV2Handles {
  store: KnowledgeStore;
  indexDb: KnowledgeIndexDb;
  gameId: string;
  stateDir?: string;
}

const searchModeProperty = {
  type: "string",
  enum: ["keyword", "vector", "hybrid"],
  description: "Search mode. Keyword is the default; vector and hybrid degrade to keyword when embeddings are unavailable.",
};

const limitProperty = {
  type: "number",
  description: "Maximum results to return. Values are clamped to a small safe bound.",
};

const discordSearchParameters = {
  type: "object",
  properties: {
    query: { type: "string", description: "Terms to find in archived Discord messages." },
    channel: { type: "string", description: "Optional Discord channel id or name filter." },
    author: { type: "string", description: "Optional author id or name filter." },
    after: { type: "string", description: "Optional inclusive lower timestamp bound." },
    before: { type: "string", description: "Optional inclusive upper timestamp bound." },
    limit: limitProperty,
    mode: searchModeProperty,
  },
  required: ["query"],
  additionalProperties: false,
};

const wikiSearchParameters = {
  type: "object",
  properties: {
    query: { type: "string", description: "Terms to find in the latest mirrored wiki revision." },
    page: { type: "string", description: "Optional page title filter." },
    limit: limitProperty,
    mode: searchModeProperty,
  },
  required: ["query"],
  additionalProperties: false,
};

const prSearchParameters = {
  type: "object",
  properties: {
    query: { type: "string", description: "Terms to find in archived pull request summaries and discussion." },
    limit: limitProperty,
    mode: searchModeProperty,
  },
  required: ["query"],
  additionalProperties: false,
};

const attemptSearchParameters = {
  type: "object",
  properties: {
    query: { type: "string", description: "Optional terms to find in attempt hypotheses and descriptions." },
    target_stable_key: { type: "string", description: "Optional exact target stable key." },
    outcome: {
      type: "string",
      enum: ["match", "improvement", "no_change", "error"],
      description: "Optional final worker-run outcome.",
    },
    limit: limitProperty,
  },
  additionalProperties: false,
};

const subjectRecordParameters = {
  type: "object",
  properties: {
    target_stable_key: { type: "string", description: "Exact target stable key." },
    entity_locator: { type: "string", description: "Exact entity locator." },
  },
  oneOf: [
    { required: ["target_stable_key"] },
    { required: ["entity_locator"] },
  ],
  additionalProperties: false,
};

const entityLookupParameters = {
  type: "object",
  properties: {
    kind: {
      type: "string",
      enum: ["translation_unit", "struct", "struct_field", "parameter", "game_concept", "pattern"],
      description: "Optional exact entity kind.",
    },
    locator_prefix: { type: "string", description: "Optional entity locator prefix." },
    limit: limitProperty,
  },
  additionalProperties: false,
};

const resolveLocatorParameters = {
  type: "object",
  properties: {
    locator: { type: "string", description: "Discord, wiki, PR, attempt, or code locator to read." },
  },
  required: ["locator"],
  additionalProperties: false,
};

const unitContextParameters = {
  type: "object",
  properties: {
    unit_locator: { type: "string", description: "Exact translation-unit entity locator." },
    target_stable_key: { type: "string", description: "Stable key for a target in the unit." },
    pr_limit: { type: "number", description: "Maximum recent pull requests to return. Values are clamped to a small safe bound." },
  },
  oneOf: [
    { required: ["unit_locator"] },
    { required: ["target_stable_key"] },
  ],
  additionalProperties: false,
};

function optionalString(value: unknown): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
}

function searchMode(value: unknown): SearchMode | undefined {
  return value === "keyword" || value === "vector" || value === "hybrid" ? value : undefined;
}

function attemptOutcome(value: unknown): AttemptOutcome | undefined {
  return value === "match" || value === "improvement" || value === "no_change" || value === "error" ? value : undefined;
}

function entityKind(value: unknown): EntityKind | undefined {
  return value === "translation_unit"
    || value === "struct"
    || value === "struct_field"
    || value === "parameter"
    || value === "game_concept"
    || value === "pattern"
    ? value
    : undefined;
}

async function withKnowledgeV2Handles<T extends object>(
  context: AgentToolRuntimeContext,
  invoke: (handles: KnowledgeV2Handles) => Promise<T> | T,
): Promise<T> {
  const gameId = context.game?.gameId ?? "melee";
  const store = openKnowledgeStore({ gameId });
  let indexDb: KnowledgeIndexDb | undefined;
  try {
    indexDb = openKnowledgeIndexDb({ gameId });
    return await invoke({
      store,
      indexDb,
      gameId,
      ...(context.stateDir === undefined ? {} : { stateDir: context.stateDir }),
    });
  } finally {
    indexDb?.close();
    store.close();
  }
}

/** Search archived Discord messages in the knowledge-v2 indexes. */
export const kv2DiscordSearchToolRegistration: AgentToolRegistration = {
  id: "discord_search",
  purpose: "Search archived Discord messages and return citeable message locators with compact context.",
  allowedRoles: ["librarian", "worker"],
  capabilities: ["knowledge_v2", "discord_search", "source_evidence"],
  create(context): PiToolDefinition {
    return {
      name: "discord_search",
      label: "Discord Search",
      description: "Search archived Discord messages by text, channel, author, and time bounds. Returns ranked snippets, thread context, and citeable locators, not current compiler facts. Use it after the first diff raises a historical or game-context question, then resolve relevant locators.",
      promptSnippet: "discord_search: find Discord evidence and cite its returned message locators.",
      promptGuidelines: ["Use keyword search first unless semantic matching is needed; resolve a locator before citing material you have not read."],
      parameters: discordSearchParameters,
      executionMode: "parallel",
      async execute(_toolCallId, params) {
        const payload = await withKnowledgeV2Handles(context, (handles) => kv2DiscordSearch(handles, {
          query: String(params.query ?? "").trim(),
          channel: optionalString(params.channel),
          author: optionalString(params.author),
          after: optionalString(params.after),
          before: optionalString(params.before),
          limit: boundedLimit(params.limit, 12),
          mode: searchMode(params.mode),
        }));
        return jsonToolResult("discord_search", { ...payload });
      },
    };
  },
};

/** Search the latest mirrored wiki revision in the knowledge-v2 indexes. */
export const kv2WikiSearchToolRegistration: AgentToolRegistration = {
  id: "wiki_search",
  purpose: "Search the latest mirrored wiki revision and return citeable section locators.",
  allowedRoles: ["librarian", "worker"],
  capabilities: ["knowledge_v2", "wiki_search", "source_evidence"],
  create(context): PiToolDefinition {
    return {
      name: "wiki_search",
      label: "Wiki Search",
      description: "Search the latest mirrored wiki revision, optionally within one page. Returns ranked section snippets and citeable locators, not current codegen evidence. Use it after the first diff raises a game-mechanics or documented-context question, then resolve relevant locators.",
      promptSnippet: "wiki_search: find current mirrored wiki sections and cite their returned locators.",
      promptGuidelines: ["Use this for game-mechanics evidence, then resolve the section locator before citing text you have not read."],
      parameters: wikiSearchParameters,
      executionMode: "parallel",
      async execute(_toolCallId, params) {
        const payload = await withKnowledgeV2Handles(context, (handles) => kv2WikiSearch(handles, {
          query: String(params.query ?? "").trim(),
          page: optionalString(params.page),
          limit: boundedLimit(params.limit, 8),
          mode: searchMode(params.mode),
        }));
        return jsonToolResult("wiki_search", { ...payload });
      },
    };
  },
};

/** Search archived pull requests in the knowledge-v2 indexes. */
export const kv2PrSearchToolRegistration: AgentToolRegistration = {
  id: "pr_search",
  purpose: "Search archived pull request summaries and discussions with subject and citation locators.",
  allowedRoles: ["librarian", "worker"],
  capabilities: ["knowledge_v2", "pull_request_search", "source_evidence"],
  create(context): PiToolDefinition {
    return {
      name: "pr_search",
      label: "PR Search",
      description: "Search archived pull request summaries and discussion for historical evidence. Returns ranked summary and discussion snippets with citeable locators, not proof that a past tactic fits the current checkout. Use it after classifying the first diff to check accepted tactics, rejected work, naming, or review history.",
      promptSnippet: "pr_search: find historical pull request evidence and its target or unit subject.",
      promptGuidelines: ["Use this for accepted tactics, rejected work, naming evidence, and review history; resolve locators before quoting details."],
      parameters: prSearchParameters,
      executionMode: "parallel",
      async execute(_toolCallId, params) {
        const payload = await withKnowledgeV2Handles(context, (handles) => kv2PrSearch(handles, {
          query: String(params.query ?? "").trim(),
          limit: boundedLimit(params.limit, 10),
          mode: searchMode(params.mode),
        }));
        return jsonToolResult("pr_search", { ...payload });
      },
    };
  },
};

/** Search structured worker attempts and their indexed text. */
export const kv2AttemptSearchToolRegistration: AgentToolRegistration = {
  id: "attempt_search",
  purpose: "Search prior worker runs and submissions by target stable key, text query, or outcome and return matching run narratives.",
  allowedRoles: ["librarian", "worker"],
  capabilities: ["knowledge_v2", "attempt_search", "worker_history"],
  create(context): PiToolDefinition {
    return {
      name: "attempt_search",
      label: "Attempt Search",
      description: "Search prior worker runs and submissions by target stable key, text, or outcome. Returns hits with run narratives, scores, summaries, observations, and locators, not per-instruction evidence or proof that an old result matches this checkout. Use it after the first diff to find prior hypotheses for the same target or residual.",
      promptSnippet: "attempt_search: search by target stable key or text query and read each hit's run summary and observations.",
      promptGuidelines: ["Pass target_stable_key for one target or query for text search; each hit includes its run summary and observations."],
      parameters: attemptSearchParameters,
      executionMode: "parallel",
      async execute(_toolCallId, params) {
        const payload = await withKnowledgeV2Handles(context, (handles) => kv2AttemptSearch(handles, {
          query: optionalString(params.query),
          target_stable_key: optionalString(params.target_stable_key),
          outcome: attemptOutcome(params.outcome),
          limit: boundedLimit(params.limit, 10),
        }));
        return jsonToolResult("attempt_search", { ...payload });
      },
    };
  },
};

/** Read the assembled record for one target or entity. */
export const kv2SubjectRecordToolRegistration: AgentToolRegistration = {
  id: "knowledge_record",
  purpose: "Read an assembled target or entity knowledge record, including capped target history when applicable.",
  allowedRoles: ["librarian", "worker"],
  capabilities: ["knowledge_v2", "subject_record", "target_history"],
  create(context): PiToolDefinition {
    return {
      name: "knowledge_record",
      label: "Knowledge Record",
      description: "Read the assembled knowledge record for exactly one target stable key or entity locator. Returns the record and capped target history, not live source or compiler state. Use it after the first diff when another target or known entity may already contain relevant facts.",
      promptSnippet: "knowledge_record: inspect another target or entity record and its cited facts.",
      promptGuidelines: ["Use this before proposing facts or entities that may already exist in another subject record."],
      parameters: subjectRecordParameters,
      executionMode: "parallel",
      async execute(_toolCallId, params) {
        const payload = await withKnowledgeV2Handles(context, (handles) => kv2SubjectRecord(handles, {
          target_stable_key: optionalString(params.target_stable_key),
          entity_locator: optionalString(params.entity_locator),
        }));
        return jsonToolResult("knowledge_record", { ...payload });
      },
    };
  },
};

/** Find existing knowledge-v2 entities without exposing internal ids. */
export const kv2EntityLookupToolRegistration: AgentToolRegistration = {
  id: "entity_lookup",
  purpose: "Find existing knowledge-v2 entities by kind or locator prefix before admitting duplicates.",
  allowedRoles: ["librarian"],
  capabilities: ["knowledge_v2", "entity_lookup", "identity_resolution"],
  create(context): PiToolDefinition {
    return {
      name: "entity_lookup",
      label: "Entity Lookup",
      description: "List matching entity locators, kinds, and identity status without internal database ids.",
      promptSnippet: "entity_lookup: find existing entities before proposing a duplicate pattern or game concept.",
      promptGuidelines: ["Search by kind or locator prefix before admitting a new curated entity."],
      parameters: entityLookupParameters,
      executionMode: "parallel",
      async execute(_toolCallId, params) {
        const payload = await withKnowledgeV2Handles(context, (handles) => kv2EntityLookup(handles, {
          kind: entityKind(params.kind),
          locator_prefix: optionalString(params.locator_prefix),
          limit: boundedLimit(params.limit, 20),
        }));
        return jsonToolResult("entity_lookup", { ...payload });
      },
    };
  },
};

/** Resolve a knowledge-v2 evidence locator to its source material. */
export const kv2ResolveLocatorToolRegistration: AgentToolRegistration = {
  id: "resolve_locator",
  purpose: "Read the source material addressed by a Discord, wiki, PR, attempt, or code locator.",
  allowedRoles: ["librarian", "worker"],
  capabilities: ["knowledge_v2", "locator_resolution", "source_evidence"],
  create(context): PiToolDefinition {
    return {
      name: "resolve_locator",
      label: "Resolve Locator",
      description: "Resolve one Discord, wiki, PR, attempt, or code locator to bounded source material. Returns locator-specific evidence, with code capped at 120 lines, but does not validate the cited tactic. Use it after a search hit and before relying on or quoting that hit in the diff-first loop.",
      promptSnippet: "resolve_locator: read the exact bounded material behind a knowledge-v2 locator.",
      promptGuidelines: ["Resolve every search-result locator before citing claims that are not already visible in the result snippet."],
      parameters: resolveLocatorParameters,
      executionMode: "parallel",
      async execute(_toolCallId, params) {
        const payload = await withKnowledgeV2Handles(context, (handles) => kv2ResolveLocator(handles, {
          locator: String(params.locator ?? "").trim(),
        }));
        return jsonToolResult("resolve_locator", { ...payload });
      },
    };
  },
};

/** Read capped translation-unit context for a unit or one of its targets. */
export const kv2UnitContextToolRegistration: AgentToolRegistration = {
  id: "unit_context",
  purpose: "Read a translation unit's aggregate match state, member targets, and recent pull requests.",
  allowedRoles: ["librarian"],
  capabilities: ["knowledge_v2", "unit_context", "pull_request_history"],
  create(context): PiToolDefinition {
    return {
      name: "unit_context",
      label: "Unit Context",
      description: "Read bounded unit context by unit locator or member target stable key.",
      promptSnippet: "unit_context: inspect unit members, match state, and recent pull request history.",
      promptGuidelines: ["Use this when a target's neighboring functions or unit-level pull requests affect the record."],
      parameters: unitContextParameters,
      executionMode: "parallel",
      async execute(_toolCallId, params) {
        const payload = await withKnowledgeV2Handles(context, (handles) => kv2UnitContext(handles, {
          unit_locator: optionalString(params.unit_locator),
          target_stable_key: optionalString(params.target_stable_key),
          pr_limit: boundedLimit(params.pr_limit, 15),
        }));
        return jsonToolResult("unit_context", { ...payload });
      },
    };
  },
};

/** All read-only knowledge-v2 tool registrations for librarian profiles. */
export const knowledgeV2ToolRegistrations = [
  kv2DiscordSearchToolRegistration,
  kv2WikiSearchToolRegistration,
  kv2PrSearchToolRegistration,
  kv2AttemptSearchToolRegistration,
  kv2SubjectRecordToolRegistration,
  kv2EntityLookupToolRegistration,
  kv2ResolveLocatorToolRegistration,
  kv2UnitContextToolRegistration,
] as const;
