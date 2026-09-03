import type { AgentToolPromptMetadata } from "../types.js";

/** Prompt metadata for read-only knowledge-v2 tools. */
export const knowledgeV2ToolPromptMetadata: Record<string, AgentToolPromptMetadata> = {
  kv2_discord_search: {
    provider: "knowledge_v2",
    type: "discord_search",
    useWhen: "Search archived Discord messages by text, channel, author, or time range.",
  },
  kv2_wiki_search: {
    provider: "knowledge_v2",
    type: "wiki_search",
    useWhen: "Search the latest mirrored wiki revision for game-mechanics evidence.",
  },
  kv2_pr_search: {
    provider: "knowledge_v2",
    type: "pull_request_search",
    useWhen: "Search archived pull request summaries and discussion for historical evidence.",
  },
  kv2_attempt_search: {
    provider: "knowledge_v2",
    type: "attempt_search",
    useWhen: "Read structured prior worker attempts, then narrow by hypothesis text when needed.",
  },
  kv2_subject_record: {
    provider: "knowledge_v2",
    type: "subject_record",
    useWhen: "Inspect the assembled record for another target or entity before proposing changes.",
  },
  kv2_entity_lookup: {
    provider: "knowledge_v2",
    type: "entity_lookup",
    useWhen: "Find existing entities by kind or locator prefix before admitting a duplicate.",
  },
  kv2_resolve_locator: {
    provider: "knowledge_v2",
    type: "locator_resolution",
    useWhen: "Read the exact source material behind a Discord, wiki, PR, attempt, or code locator.",
  },
  kv2_unit_context: {
    provider: "knowledge_v2",
    type: "unit_context",
    useWhen: "Inspect a unit's member targets, aggregate match state, and recent pull requests.",
  },
};
