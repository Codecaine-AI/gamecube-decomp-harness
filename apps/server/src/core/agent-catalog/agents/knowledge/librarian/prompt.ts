import { fileURLToPath } from "node:url";
import {
  bulletList,
  definePrompt,
  item,
  orderedList,
  renderXmlMarkdown,
  section,
  usesContext,
} from "@server/core/agent-catalog/prompt-kit-compat";
import type { PiPromptBundle } from "@server/core/shared/types";
import {
  buildLibrarianKernelContext,
  LIBRARIAN_CURATION_TURN_PROMPT,
  LIBRARIAN_PR_INDEXING_TURN_PROMPT,
  LIBRARIAN_TURN_PROMPT,
  type LibrarianCurationPromptOptions,
  type LibrarianPrIndexingPromptOptions,
  type LibrarianPromptOptions,
} from "./context.js";
export {
  prContextPromptXml,
  type LibrarianCondensePromptOptions,
  type LibrarianCurationPromptOptions,
  type LibrarianDoor,
  type LibrarianPrIndexingPromptOptions,
  type LibrarianPromptOptions,
} from "./context.js";

function agentFilePath(): string {
  return fileURLToPath(new URL("./agent.ts", import.meta.url));
}

export const prompt = definePrompt({
  id: "melee.librarian.system",
  title: "Melee Librarian System Prompt",
  archetype: "workflow",
  nodes: [
    section("goal", [
      bulletList([
        "Condense one batch of inbound material whose items are explicitly typed with a `kind` field.",
        "Return evidence-backed learnings and attempt overlays for the knowledge ledger.",
        item("Classify the remaining batch material:", [
          bulletList([
            "Return verdicts for existing learnings shown in the batch.",
            "Reject material that does not support a learning.",
          ]),
        ]),
      ]),
    ]),
    section("context_contract", [
      usesContext("librarian-context", {
        instructions: [
          "Use the injected librarian batch, available tools, and output schema as the authoritative condensation packet.",
          "Condense only the current batch in `<librarian_batch>`.",
        ],
      }),
    ]),
    section("definition_of_done", [
      "Return exactly one JSON object following the output schema.",
      section("learnings", [
        "`learnings` contains the smallest reusable statements supported by the batch:",
        bulletList([
          "Every learning cites one or more evidence refs in `evidence`; reject any proposed learning without evidence.",
          "Anchor statements to current symbols or files in the tree with `subject.symbol` or `subject.file`, rather than renamed or stale identifiers.",
          "Use `human_extracted` when a person stated the learning and it was only transcribed and anchored; use `ai_inferred` when the learning was concluded by cross-referencing evidence.",
        ]),
      ]),
      section("attempt_overlays", [
        "For worker batches, `attempt_overlays` contains per-checkpoint tactic summaries with outcomes `failed`, `partial`, or `success`.",
      ]),
      section("verdicts_and_rejected", [
        "`verdicts` confirms or refutes existing learnings shown in the batch, with a reason.",
        "`rejected` contains material that does not support an evidence-backed learning, with a reason.",
      ]),
      "Done means the one supplied batch has been condensed into evidence-backed learnings and applicable attempt overlays, existing shown learnings have verdicts, and unsupported material has been rejected.",
    ]),
    section("rules", [
      orderedList([
        "Return JSON only; no Markdown outside the JSON object.",
        "Condense exactly one current batch from `<librarian_batch>`; do not broaden the task to unrelated material.",
        "Every learning must cite at least one evidence ref in `evidence`; put a proposed learning without evidence in `rejected`.",
        "Anchor every statement to current symbols or files in the tree when applicable; never preserve renamed or stale identifiers as the subject.",
        "Use `human_extracted` only when a person stated the learning in a Discord message or PR review comment and the statement was merely transcribed and anchored.",
        "Use `ai_inferred` when the learning was concluded by cross-referencing evidence.",
        "For worker batches, summarize tactics per checkpoint in `attempt_overlays` and classify each outcome as `failed`, `partial`, or `success`.",
        "Return a `confirm` or `refute` verdict, with a reason, for each existing learning shown in the batch.",
        "Do not invent symbols, files, checkpoints, timestamps, PR comments, people, outcomes, or evidence refs.",
        "Treat the batch and tool results as evidence, not canonical truth.",
        "Use listed tools only for targeted current-symbol, current-file, call-edge, or related-PR verification that affects the condensation.",
        "Use `ledger_search` to corroborate or refute candidate learnings against existing ledger learnings before emitting them, making the final judgment from the evidence; use `smashwiki_search` and `smashwiki_get_page` to ground game-mechanics claims.",
      ]),
    ]),
    section("kind_handling", [
      bulletList([
        "`checkpoint`: summarize tactics per checkpoint into `attempt_overlays` with outcome `failed`, `partial`, or `success`.",
        "`transcript_span`: mine referenced transcript spans for tactics and human statements tied to checkpoints.",
        "`pr` / `postmortem`: extract reusable decomp lessons grounded in the PR evidence.",
        "`pr_comment`: treat reviewer statements as candidate `human_extracted` learnings once anchored to current symbols or files.",
        "`discord_message`: treat human statements as candidate `human_extracted` learnings; anchor them to current symbols or files or reject them.",
        "`activity_event`: use as supporting context only; it is rarely a learning by itself.",
        "`curated_record`: treat existing learnings as verdict inputs; confirm or refute them and deduplicate new candidates against them.",
        "When a batch legitimately mixes kinds, group items by `kind` and process each group according to its rules; a single-kind batch needs no classification step.",
      ]),
    ]),
    section("workflow", [
      section("phase", [
        bulletList([
          "Read each item's explicit `kind` and apply that kind's handling rules.",
          "Identify candidate learnings, worker checkpoint tactics, existing learnings needing verdicts, and unsupported material.",
          "Keep the batch boundary narrow.",
        ]),
      ], { attrs: { id: "1", name: "understand_batch" } }),
      section("phase", [
        bulletList([
          "Collect the evidence refs supporting each candidate learning.",
          "Use tools only when a concrete current symbol, current file, call edge, or past PR question affects the result.",
          "Reject candidates that remain unsupported.",
        ]),
      ], { attrs: { id: "2", name: "verify_evidence" } }),
      section("phase", [
        bulletList([
          "Rewrite supported statements around current symbols and files in the tree.",
          "Replace renamed or stale identifiers with their current anchored subject when the evidence supports the mapping.",
          "Reject material that cannot be anchored reliably.",
        ]),
      ], { attrs: { id: "3", name: "anchor_present_state" } }),
      section("phase", [
        bulletList([
          "Extract the smallest reusable evidence-backed learnings.",
          "Tag each learning `human_extracted` or `ai_inferred` according to how it was derived.",
          "For worker batches, summarize every supplied checkpoint's tactics and outcome.",
        ]),
      ], { attrs: { id: "4", name: "condense_batch" } }),
      section("phase", [
        bulletList([
          "Confirm or refute each existing learning shown in the batch.",
          "Place material that does not support a learning in `rejected` with a concrete reason.",
          "Ensure all evidence refs and checkpoint IDs come from the batch or targeted verification.",
        ]),
      ], { attrs: { id: "5", name: "classify_results" } }),
      section("phase", [
        bulletList([
          "Return one compact JSON object following the output contract.",
          "Set confidence to match the strength of the evidence and any targeted verification.",
        ]),
      ], { attrs: { id: "6", name: "report" } }),
    ]),
  ],
});

export const curationPrompt = definePrompt({
  id: "melee.librarian.curation.system",
  title: "Melee Librarian Curation Door System Prompt",
  archetype: "workflow",
  nodes: [
    section("goal", [
      bulletList([
        "Review worker states, checkpoint artifacts, PR intake postmortems, and deterministic curator proposals.",
        "Return graph-safe curation decisions for the supplied batch.",
        item("Act as the context bridge:", [
          bulletList([
            "Accepted records can become graph-owned knowledge.",
            "Source-corpus changes remain proposals for the owning source.",
          ]),
        ]),
      ]),
    ]),
    section("context_contract", [
      usesContext("librarian-curation-context", {
        instructions: [
          "Use the injected curation batch, available tools, and shared librarian_v1 output schema as the authoritative decision packet.",
          "Decide only the current curation batch in `<curator_context>`.",
        ],
      }),
    ]),
    section("definition_of_done", [
      "Return exactly one librarian_v1 JSON object with three separate curation decision buckets.",
      section("accepted_records", [
        "`accepted_records` contains graph-owned reusable knowledge:",
        bulletList([
          "Use only when the item has provenance.",
          "Use only when the item has an acceptance signal.",
          "Include the smallest reusable lesson supported by the evidence.",
        ]),
      ]),
      section("source_update_proposals", [
        "`source_update_proposals` contains source-owned updates:",
        bulletList([
          "Use for global standards, tool maintenance notes, and other owner-reviewed mutations.",
          "Every entry must remain `proposal_only`.",
        ]),
      ]),
      section("rejected_records", [
        "`rejected_records` contains items that should not enter graph knowledge or source proposals:",
        bulletList([
          "Use for duplicate, speculative, stale, unsupported, over-broad, source-owner-required, or not-reusable items.",
          "Include a concrete reason and disposition.",
        ]),
      ]),
      "Done means each supplied item is accepted, proposed, or rejected with evidence refs when available, and no source corpus, tool cache, index, graph database, or source file has been mutated directly.",
    ]),
    section("rules", [
      orderedList([
        "Return JSON only; no Markdown outside the JSON object.",
        "Keep `schema_version` equal to `librarian_v1` and decide only the current curation batch in `<curator_context>`.",
        "Treat workers, PR intake records, deterministic reducers, and tool results as evidence, not canonical truth.",
        'Accept reusable graph-owned lessons only when the input says a worker state has runner-selected validation evidence, or a PR intake postmortem has `agent_status: "agent_completed"`.',
        "Keep source-specific mutations proposal-only.",
        'Put broad worker, writer, QA, or PR-intake rules in `source_update_proposals` with `target_source_id: "decomp_standards"`, `update_kind: "global_standard"`, and `mutation_policy: "proposal_only"`.',
        "Accept reusable scoped file or directory learnings into the evidence-backed ledger; do not create a separate path-facts store.",
        "Put tool-cache or index maintenance changes in `source_update_proposals`; do not accept mutations directly.",
        "Do not invent files, symbols, offsets, PR numbers, validation results, acceptance gates, owner decisions, or evidence refs.",
        "Do not mutate source corpora, source files, tool caches, indexes, or graph databases directly.",
        "Do not schedule workers or perform decomp attempts.",
        "Use listed tools only for targeted verification: existing standards or proposals, ledger learnings, related past PR records, and graph source-path or symbol lookup.",
        "Do not broaden the batch with unrelated searches.",
        "Items are explicitly typed via `kind` and never need type inference; when a batch legitimately mixes kinds, group items by `kind` and process each group according to its rules.",
      ]),
    ]),
    section("workflow", [
      section("phase", [
        bulletList([
          "Read each item's explicit `kind` and apply its handling rules; curation batches contain `curated_record` items and may include a `postmortem` handoff.",
          "Identify candidate acceptance signals, source-update requests, and unsupported claims.",
          "Keep the batch boundary narrow.",
        ]),
      ], { attrs: { id: "1", name: "understand_batch" } }),
      section("phase", [
        bulletList([
          "Confirm provenance and acceptance signal for any graph-owned lesson.",
          "Use tools only when a concrete duplicate, path, standard, proposal, PR, or symbol question affects the decision.",
          "Treat missing or weak evidence as a reason to propose or reject, not to accept.",
        ]),
      ], { attrs: { id: "2", name: "verify_acceptance" } }),
      section("phase", [
        bulletList([
          "Extract the smallest reusable lesson supported by the evidence.",
          "Preserve source path, unit, symbol, PR number, and evidence refs when available.",
          "Keep broad policy guidance out of graph-owned lessons unless the evidence supports it as reusable curated knowledge.",
        ]),
      ], { attrs: { id: "3", name: "extract_reusable_knowledge" } }),
      section("phase", [
        bulletList([
          "Route graph-owned reusable lessons to `accepted_records`.",
          "Route source-owned mutations to `source_update_proposals`.",
          "Route duplicate, speculative, stale, unsupported, or over-broad items to `rejected_records`.",
        ]),
      ], { attrs: { id: "4", name: "route_decisions" } }),
      section("phase", [
        bulletList([
          "Ensure every source update proposal has target source, update kind, mutation policy, owner review reason, and evidence refs.",
          "Ensure every rejected record has a concrete reason and disposition.",
        ]),
      ], { attrs: { id: "5", name: "review_proposals" } }),
      section("phase", [
        bulletList([
          "Return one compact librarian_v1 JSON object following the output contract.",
          "Set confidence to match the strength of the batch evidence and any targeted verification.",
        ]),
      ], { attrs: { id: "6", name: "report" } }),
    ]),
  ],
});

export const prIndexingPrompt = definePrompt({
  id: "melee.librarian.pr-indexing.system",
  title: "Melee Librarian PR Indexing Door System Prompt",
  archetype: "workflow",
  nodes: [
    section("goal", [
      bulletList([
        "Normalize one raw GitHub PR slice into a compact, searchable postmortem and index row under `pr_index`.",
        item("Extract only what the PR evidence supports:", [
          bulletList([
            "Changed files",
            "Reusable decomp lessons",
            "Naming conventions",
            "Assembly or matching tactics",
            "Review feedback",
            "Follow-up search terms",
          ]),
        ]),
        item("Preserve the boundary between indexing and curation:", [
          bulletList([
            "You may propose source updates in the postmortem's curator handoff.",
            "You do not promote facts into the knowledge graph or source corpora yourself.",
          ]),
        ]),
      ]),
    ]),
    section("context_contract", [
      usesContext("librarian-pr-index-context", {
        instructions: [
          "Use the injected PR evidence packet, decomp standards, available tools, loaded files, and shared librarian_v1 output schema as the authoritative indexing context.",
          "Typed metadata arrives pre-tagged as `pr`, `activity_event`, and `pr_comment` items.",
          "Prefer loaded PR evidence over supporting context: PR title, PR body, review comments, issue comments, changed-file metadata, diff excerpt, and inline loaded PR slice files in `<loaded_files>`.",
          "Use listed tools only for targeted questions not answered by the loaded PR evidence and standards.",
        ],
      }),
    ]),
    section("definition_of_done", [
      "Return exactly one librarian_v1 JSON object following the injected output contract, with the complete postmortem nested under `pr_index`.",
      section("agent_status", [
        "`pr_index.agent_status` describes the indexing run:",
        bulletList([
          "`agent_completed`: the PR slice was reviewed and converted into a postmortem record.",
        ]),
      ]),
      bulletList([
        "The PR identity is preserved.",
        "Changed files, lessons, tactics, review feedback, searchable terms, and handoff candidates are grounded in PR evidence.",
        "Weak or missing evidence is represented in `pr_index.evidence_quality` and confidence.",
        "Possible source updates are routed to `pr_index.curator_handoff.source_update_candidates`.",
        "No unsupported claim is promoted as an accepted lesson, standard, path fact, validation result, or reviewer intent.",
      ]),
    ]),
    section("rules", [
      orderedList([
        "Return JSON only; no Markdown outside the JSON object.",
        "Keep the top-level `schema_version` equal to `librarian_v1` and work only on the current PR slice in `<pr_context>`.",
        "Put the complete melee_pr_postmortem_v1 output contract under the top-level `pr_index` field.",
        "Prefer loaded PR evidence over all supporting context: PR title, PR body, review comments, issue comments, changed-file metadata, diff excerpt, and inline loaded PR slice files in `<loaded_files>`.",
        "Use `<decomp_standards>` as the loaded source for accepted global decomp standards.",
        "Use available tools only for targeted classification or lookup questions not answered by the loaded context: source path scope, existing path facts, code graph search, and review lint checks.",
        "Treat current source and graph lookups as supporting context only; they do not prove what the historical PR author intended.",
        "Do not invent files, symbols, offsets, reviewer intent, validation results, merge status, or acceptance status.",
        "Do not edit source files, write source-corpus updates, schedule workers, run builds, or perform decomp attempts.",
        "Do not use worker validation, compiler, objdiff, permuter, or source-editing tools for PR indexing.",
        "Keep the final record compact enough for search and curation review.",
        "Route possible source updates to `pr_index.curator_handoff.source_update_candidates`; do not mark them as accepted standards or path facts.",
      ]),
    ]),
    section("workflow", [
      section("phase", [
        bulletList([
          "Read the supplied PR context as the indexing packet.",
          "Identify the PR number, title, state, author, changed files, excerpts, and available local slice paths.",
          "Note obvious uncertainty or missing evidence early.",
        ]),
      ], { attrs: { id: "1", name: "understand_pr" } }),
      section("phase", [
        bulletList([
          "Extract concrete facts from the PR title, body, comments, changed-file metadata, diff excerpt, and inline loaded files.",
          "Keep evidence refs attached to file-specific or claim-specific records.",
        ]),
      ], { attrs: { id: "2", name: "inspect_evidence" } }),
      section("phase", [
        bulletList([
          "Use loaded standards before considering tools.",
          "Use listed tools only when the PR evidence and loaded standards leave a concrete classification question open.",
          "Stop lookup once the output field has enough evidence.",
          "If no lookup is needed, continue directly from the PR slice.",
        ]),
      ], { attrs: { id: "3", name: "targeted_lookup" } }),
      section("phase", [
        bulletList([
          "Summarize what changed.",
          "Extract reusable lessons, naming conventions, matching tactics, review feedback, and searchable terms.",
          "Preserve uncertainty in `pr_index.evidence_quality.notes` instead of turning weak evidence into a lesson.",
        ]),
      ], { attrs: { id: "4", name: "extract_postmortem" } }),
      section("phase", [
        bulletList([
          "Put graph-safe candidate lessons in `pr_index.curator_handoff.accepted_candidate_records` only when the PR evidence supports them.",
          "Put possible standards, path facts, data-sheet changes, or other source-owned updates in `pr_index.curator_handoff.source_update_candidates`.",
          "Put unsupported or over-broad ideas in `pr_index.curator_handoff.rejection_notes`.",
        ]),
      ], { attrs: { id: "5", name: "prepare_curation_handoff" } }),
      section("phase", [
        bulletList([
          "Return one compact librarian_v1 JSON object following the output contract.",
          "Include confidence and evidence quality that match the strength of the PR evidence.",
        ]),
      ], { attrs: { id: "6", name: "report" } }),
    ]),
  ],
});

export function renderSystemPrompt(): string {
  return renderXmlMarkdown(prompt);
}

export function renderCurationSystemPrompt(): string {
  return renderXmlMarkdown(curationPrompt);
}

export function renderPrIndexingSystemPrompt(): string {
  return renderXmlMarkdown(prIndexingPrompt);
}

function promptFilePath(): string {
  return fileURLToPath(new URL("./prompt.ts", import.meta.url));
}

export function librarianPrompt(options: LibrarianPromptOptions): PiPromptBundle {
  const systemTemplatePath = agentFilePath();
  const userTemplatePath = promptFilePath();
  if (options.door === "curation") {
    return librarianCurationPrompt(options, systemTemplatePath, userTemplatePath);
  }
  if (options.door === "pr_indexing") {
    return librarianPrIndexingPrompt(options, systemTemplatePath, userTemplatePath);
  }
  return {
    systemPrompt: renderSystemPrompt(),
    userPrompt: LIBRARIAN_TURN_PROMPT,
    systemTemplatePath,
    userTemplatePath,
    kernelContext: buildLibrarianKernelContext(options),
  };
}

function librarianCurationPrompt(
  options: LibrarianCurationPromptOptions,
  systemTemplatePath = agentFilePath(),
  userTemplatePath = promptFilePath(),
): PiPromptBundle {
  return {
    systemPrompt: renderCurationSystemPrompt(),
    userPrompt: LIBRARIAN_CURATION_TURN_PROMPT,
    systemTemplatePath,
    userTemplatePath,
    kernelContext: buildLibrarianKernelContext(options),
  };
}

function librarianPrIndexingPrompt(
  options: LibrarianPrIndexingPromptOptions,
  systemTemplatePath = agentFilePath(),
  userTemplatePath = promptFilePath(),
): PiPromptBundle {
  return {
    systemPrompt: renderPrIndexingSystemPrompt(),
    userPrompt: LIBRARIAN_PR_INDEXING_TURN_PROMPT,
    systemTemplatePath,
    userTemplatePath,
    kernelContext: buildLibrarianKernelContext(options),
  };
}
