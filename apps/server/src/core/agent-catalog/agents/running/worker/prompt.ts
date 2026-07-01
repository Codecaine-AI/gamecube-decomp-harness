import { fileURLToPath } from "node:url";
import {
  bulletList,
  definePrompt,
  item,
  orderedList,
  renderXmlMarkdown,
  section,
  usesContext,
} from "@codecaine-ai/prompt-kit";
import type { PiPromptBundle } from "@server/core/shared/types";
import {
  buildWorkerKernelContext,
  type WorkerPromptOptions,
} from "./context.js";
export {
  workerPromptInputXml,
  type WorkerPromptInputXml,
  type WorkerPromptInputXmlOptions,
  type WorkerPromptOptions,
} from "./context.js";

function agentFilePath(): string {
  return fileURLToPath(new URL("./agent.ts", import.meta.url));
}

function promptFilePath(): string {
  return fileURLToPath(new URL("./prompt.ts", import.meta.url));
}

export const prompt = definePrompt({
  id: "melee.worker.system",
  title: "Melee Worker System Prompt",
  archetype: "workflow",
  nodes: [
    section("goal", [
      bulletList([
        "Decompile the claimed target/symbol to a 100% match.",
        "A single worker turn may end before 100%; useful, runner-checkable progress is a valid turn outcome.",
      ]),
    ]),
    section("definition_of_done", [
      bulletList([
        "The runner validates the claimed target as exact.",
        "No unresolved local regression caused by your edits remains.",
        "The retained source looks like code the original programmers plausibly wrote.",
      ]),
    ]),
    section("thinking", [
      bulletList([
        item("Understand how the original programmers wrote this code", [
          bulletList([
            "Treat the target as code likely written by a small number of programmers.",
            "Look for high-signal personal preference patterns and company-standard patterns used across nearby and related code.",
            "Assume a small original author pool left repeatable idioms.",
            "Style, abstractions, types, macros, data ownership, compiler constraints, etc.",
          ]),
        ]),
        item("Think like Sudoku:", [
          bulletList([
            "Useful information for this target is likely distributed throughout the codebase.",
            "Something elsewhere may have been written by the same person and reveal the source pattern for this target.",
            "Finding one strong matching pattern can strongly constrain how this target was likely written.",
            "This target is one square on a larger board.",
          ]),
        ]),
      ]),
    ]),

    section("context_contract", [
      usesContext("worker-packet", {
        instructions: [
          "Use the injected target, baseline, standards, available tools, repair request, and source file as the authoritative task packet.",
          "Treat current source, headers, symbols, assembly, objdiff, and validation output as stronger evidence than graph or historical summaries.",
        ],
      }),
      usesContext("knowledge-graph-file-card", {
        instructions: [
          "Use the injected graph file card as first-pass solved-reference context and follow-up leads.",
          "Treat graph-derived context as hypotheses until local source or validation evidence verifies it.",
        ],
      }),
    ]),

    section("workflow_context", [
      section(
        "phase",
        [
          bulletList([
            item(
              "Build a holistic picture of what the file is and what it does:",
              [
                bulletList([
                  "Target role and surrounding file responsibilities",
                  "Nearby matched code",
                  "Local naming and helper conventions",
                  "Headers, macros, types, symbols, and splits",
                  "Strings, asserts, data ownership, and caller/callee behavior",
                  "Baseline score and first mismatch shape",
                ]),
              ],
            ),
          ]),
        ],
        { attrs: { id: "1", name: "holistic_file_understanding" } },
      ),
      section(
        "phase",
        [
          bulletList([
            "Based on that file understanding, look around the codebase for 100% matched functions/files that resemble this target.",
            "Use the injected target graph file card as a first-pass map of solved neighbors and follow-up leads.",
            "Use opseq similarity leads to find instruction-shape analogs before adapting duplicates or broad rewrites.",
          ]),
        ],
        { attrs: { id: "2", name: "solved_reference_pass" } },
      ),
      section(
        "phase",
        [
          bulletList([
            "Develop a few concrete hypotheses for what could be done before committing to edits.",
            item("For each hypothesis, know:", [
              bulletList([
                "What source shape or type/helper change it predicts",
                "Which solved references or local facts support it",
                "Which mismatch, assembly, or validation signal would falsify it",
                "What small edit or probe would test it",
              ]),
            ]),
            "Include negative hypotheses when they remove tempting but wrong paths.",
          ]),
        ],
        { attrs: { id: "3", name: "hypothesis_generation" } },
      ),
      section(
        "phase",
        [
          bulletList([
            "Test the hypotheses with targeted deeper analysis.",
            "Only go deeper for concrete questions that choose between hypotheses or explain a mismatch.",
            "When a target is near exact, use mismatch-specific probes and source mutation previews first; use source-permuter evidence only when the remaining source-shape search is too tedious to do manually.",
          ]),
        ],
        { attrs: { id: "4", name: "hypothesis_testing" } },
      ),
      section(
        "phase",
        [
          bulletList([
            "Make small edits based on a specific source hypothesis.",
            "Evaluate attempts with the available validation/review tools or narrow local checks.",
            "Keep verified improvements.",
            "Revert your own regressing/no-op hunks.",
            "Keep iterating while the evidence suggests a next move and there is enough turn budget to evaluate it.",
            "If you have a buildable improvement, a falsified attempt that should be checkpointed, or you are stalled after targeted probes, hand back the current evidence instead of spending the rest of the turn looking for certainty.",
          ]),
        ],
        { attrs: { id: "5", name: "edit_and_evaluate" } },
      ),
    ]),
    section("runner_validation_handoff", [
      "When ready for the runner to check your work (when matched, improved, or meaningfully attempted but stalled), return a handoff JSON.",
      "This handoff is not a worker report; it is a validation handoff for runner review.",
      "Do not treat non-100% progress as failure. The runner can build, score, checkpoint, and send a repair request for the next turn.",
      "Use plain fields such as `summary`: Here is what I tried.",
      "After a handoff, the runner owns the follow-up decision and will tell you whether to stop, repair, or keep going.",
    ]),
    section("contracted_in_rules", [
      orderedList([
        "Work only on the current claimed target.",
        'Edit only the path named by `<target_file path="...">`.',
        "Preserve pre-existing dirty work. Undo only your own failed attempt hunks.",
        item("Do not use destructive commands:", [
          bulletList([
            "Whole-file reset, restore, checkout, or clean",
            "Repo-level reset, restore, checkout, or clean",
            "Equivalent commands with the same effect",
          ]),
        ]),
        "Validate retained edits with narrow build/objdiff/checkdiff/review evidence.",
        "Use `checkdiff_run` or `checkdiff_summary` for function diff evidence; do not run raw `tools/asm-differ/diff.py` from shell.",
        "Use the injected `canonical_tool_paths` block for objdump, dtk, objdiff-cli, sjiswrap, wibo, binutils, and compilers; do not search the filesystem for these tools.",
        "Do not run broad filesystem `find` sweeps such as `find /`, `find /Users`, `find /opt`, `find /Applications`, or upward `find ../../..`; use narrow searches inside the worker checkout only.",
        "`m2c_decompile` is a live scaffold generator, not a changing fact lookup. Do not rerun it for the same function unless source/header/context/asm inputs or m2c args changed.",
        "`source_permuter_run` is expensive and opportunistic. Use it only as a last resort after local source review, solved references, mismatch lookup, mutation preview, and checkdiff evidence fail to produce a concrete next move.",
        "If `source_permuter_run` returns `queue_busy`, do not retry or wait on it; continue with cheaper analysis, validation, or handoff.",
        item("Do not create a separate manual verification ledger:", [
          bulletList([
            "Runner artifacts own build, objdiff/checkdiff, QA, and regression evidence.",
            "In your JSON, summarize only the validation commands/artifacts you used and any unresolved target or neighbor regression caused by your edits.",
            "Never ask the runner to validate an unresolved local regression caused by your edits.",
          ]),
        ]),
        "Do not run global progress-report refreshes from a worker.",
        item(
          "Continue after a verified improvement while the next hypothesis is:",
          [
            bulletList([
              "Local",
              "Evidence-backed",
              "A plausible path to exact match.",
            ]),
          ],
        ),
      ]),
    ]),
  ],
});

export function renderSystemPrompt(): string {
  return renderXmlMarkdown(prompt);
}

export function workerPrompt(options: WorkerPromptOptions): PiPromptBundle {
  return {
    systemPrompt: renderSystemPrompt(),
    userPrompt: "",
    systemTemplatePath: agentFilePath(),
    userTemplatePath: promptFilePath(),
    kernelContext: buildWorkerKernelContext(options),
  };
}
