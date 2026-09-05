import type { AgentToolPromptMetadata } from "../types.js";

/** Prompt metadata for read-only knowledge-v2 tools. */
export const knowledgeV2ToolPromptMetadata: Record<string, AgentToolPromptMetadata> = {
  discord_search: {
    provider: "knowledge_v2",
    type: "discord_search",
    useWhen: "Search archived Discord messages by text, channel, author, or time range.",
  },
  wiki_search: {
    provider: "knowledge_v2",
    type: "wiki_search",
    useWhen: "Search the latest mirrored wiki revision for game-mechanics evidence.",
  },
  pr_search: {
    provider: "knowledge_v2",
    type: "pull_request_search",
    useWhen: "Search archived pull request summaries and discussion for historical evidence.",
  },
  attempt_search: {
    provider: "knowledge_v2",
    type: "attempt_search",
    useWhen: "Accept either a target stable key or a text query and return hits with run narratives, including summaries and observations.",
  },
  knowledge_record: {
    provider: "knowledge_v2",
    type: "subject_record",
    useWhen: "Inspect the assembled record for another target or entity before proposing changes.",
  },
  entity_lookup: {
    provider: "knowledge_v2",
    type: "entity_lookup",
    useWhen: "Find existing entities by kind or locator prefix before admitting a duplicate.",
  },
  resolve_locator: {
    provider: "knowledge_v2",
    type: "locator_resolution",
    useWhen: "Read the exact source material behind a Discord, wiki, PR, attempt, or code locator.",
  },
  unit_context: {
    provider: "knowledge_v2",
    type: "unit_context",
    useWhen: "Inspect a unit's member targets, aggregate match state, and recent pull requests.",
  },
};
