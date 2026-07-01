import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { workerPrompt } from "./prompt.js";
import {
  WORKER_COMPACT_TARGET_FILE_INLINE_CHAR_LIMIT,
  WORKER_MINIMAL_TARGET_FILE_INLINE_CHAR_LIMIT,
  WORKER_TARGET_FILE_INLINE_CHAR_LIMIT,
} from "./context.js";

function sampleWorkerPrompt() {
  return workerPrompt({
    packet: {
      target: {
        unit: "GALE01:test",
        symbol: "test_symbol",
        source_path: "src/melee/test/missing.c",
      },
      baseline: {
        fuzzy_match_percent: 91.25,
      },
      knowledge_context: {
        status: "ready",
        file_card: {
          source_path: "src/melee/test/missing.c",
          functions: [
            {
              symbol: "test_symbol",
              unit: "GALE01:test",
              fuzzy: 91.25,
            },
          ],
          tool_hits: [
            {
              tool_id: "opseq",
              source_id: "opseq_similarity",
              symbol: "test_symbol",
              unit: "GALE01:test",
              analog_symbol: "test_symbol_matched",
              analog_unit: "GALE01:test_ref",
              analog_source_path: "src/melee/test/matched.c",
              score: 0.97,
              exact_match: true,
              matched: true,
              evidence_ref: "opseq:test",
            },
          ],
        },
      },
    },
    repoRoot: "/repo",
    stateDir: "/state",
    initialBoardPath: "/state/board.json",
    workerLogDir: "/state/workers",
  });
}

describe("workerPrompt", () => {
  test("keeps dynamic packet in kernel context instead of system or user prompt", () => {
    const bundle = sampleWorkerPrompt();

    expect(bundle.systemPrompt).toContain('<context_usage context_id="worker-packet">');
    expect(bundle.systemPrompt).toContain('<context_usage context_id="knowledge-graph-file-card">');
    expect(bundle.systemPrompt).not.toContain("<decomp_standards>");
    expect(bundle.systemPrompt).not.toContain("<target_file");
    expect(bundle.kernelContext?.turnPrompt).toBe("Use the injected worker context for this run. Complete the task described there, follow the system prompt, and return the required output.");
    expect(bundle.userPrompt).toBe("");
    expect(bundle.userPrompt).not.toContain("<decomp_standards>");
    expect(bundle.userPrompt).not.toContain("<target_file");
    const renderedContext = bundle.kernelContext?.renderedContext ?? "";

    expect(bundle.kernelContext?.inputs.map((input) => input.loaderKind)).toEqual([
      "worker-packet",
      "knowledge-graph-file-card",
    ]);
    expect(renderedContext).toContain("<decomp_standards>");
    expect(renderedContext).toContain('<context_budget mode="full"');
    expect(renderedContext).toContain("<target_file");
    expect(renderedContext).toContain("<canonical_tool_paths>");
    expect(renderedContext).toContain('relative_path="build/binutils/powerpc-eabi-objdump"');
    expect(renderedContext).toContain("Broad find roots");
    expect(renderedContext).toContain("<target_graph_file_card");
    expect(renderedContext).toContain("opseq_analogs");
    expect(renderedContext).toContain("opseq_similar_functions");
    expect(renderedContext).toContain("<canonical_example");
    expect(renderedContext).toContain("<bad_code>");
    expect(renderedContext).toContain("<preferred_code>");
    expect(renderedContext).not.toContain("<standard_examples");
    expect(renderedContext).not.toContain("<bad_pattern>");
    expect(renderedContext).not.toContain("<preferred_shape>");
    expect(`${bundle.systemPrompt}\n${bundle.userPrompt}\n${renderedContext}`).not.toMatch(/\{\{[A-Z0-9_]+\}\}/);
  });

  test("truncates oversized target source while keeping path metadata", async () => {
    const repoRoot = await mkdtemp(resolve(tmpdir(), "worker-prompt-"));
    try {
      const sourcePath = "src/melee/test/large.c";
      const absoluteSourcePath = resolve(repoRoot, sourcePath);
      await mkdir(resolve(repoRoot, "src/melee/test"), { recursive: true });
      const head = "int worker_prompt_head_marker = 1;\n";
      const middle = "int worker_prompt_middle_marker = 2;\n";
      const tail = "int worker_prompt_tail_marker = 3;\n";
      await writeFile(
        absoluteSourcePath,
        `${head}${"a".repeat(WORKER_TARGET_FILE_INLINE_CHAR_LIMIT)}${middle}${"b".repeat(WORKER_TARGET_FILE_INLINE_CHAR_LIMIT)}${tail}`,
      );

      const bundle = workerPrompt({
        packet: {
          target: {
            unit: "GALE01:test",
            symbol: "large_symbol",
            source_path: sourcePath,
          },
          baseline: {
            fuzzy_match_percent: 91.25,
          },
        },
        repoRoot,
        stateDir: "/state",
        initialBoardPath: "/state/board.json",
        workerLogDir: "/state/workers",
      });
      const renderedContext = bundle.kernelContext?.renderedContext ?? "";

      expect(renderedContext).toContain(`<target_file path="${sourcePath}"`);
      expect(renderedContext).toContain('context_budget="full"');
      expect(renderedContext).toContain('truncated="true"');
      expect(renderedContext).toContain("[target source truncated after");
      expect(renderedContext).toContain("worker_prompt_head_marker");
      expect(renderedContext).toContain("worker_prompt_tail_marker");
      expect(renderedContext).not.toContain("worker_prompt_middle_marker");
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  test("supports compact and minimal context budgets after provider context-window rejection", async () => {
    const repoRoot = await mkdtemp(resolve(tmpdir(), "worker-prompt-budget-"));
    try {
      const sourcePath = "src/melee/test/large.c";
      const absoluteSourcePath = resolve(repoRoot, sourcePath);
      await mkdir(resolve(repoRoot, "src/melee/test"), { recursive: true });
      await writeFile(
        absoluteSourcePath,
        `int worker_prompt_head_marker = 1;\n${"a".repeat(WORKER_TARGET_FILE_INLINE_CHAR_LIMIT * 2)}\nint worker_prompt_tail_marker = 3;\n`,
      );

      const baseOptions = {
        packet: {
          target: {
            unit: "GALE01:test",
            symbol: "large_symbol",
            source_path: sourcePath,
          },
          baseline: {
            fuzzy_match_percent: 91.25,
          },
        },
        repoRoot,
        stateDir: "/state",
        initialBoardPath: "/state/board.json",
        workerLogDir: "/state/workers",
      };
      const fullContext = workerPrompt(baseOptions).kernelContext?.renderedContext ?? "";
      const compactContext = workerPrompt({ ...baseOptions, contextBudget: "compact" }).kernelContext?.renderedContext ?? "";
      const minimalContext = workerPrompt({ ...baseOptions, contextBudget: "minimal" }).kernelContext?.renderedContext ?? "";

      expect(compactContext.length).toBeLessThan(fullContext.length);
      expect(minimalContext.length).toBeLessThan(compactContext.length);
      expect(compactContext).toContain(`inline_char_limit="${WORKER_COMPACT_TARGET_FILE_INLINE_CHAR_LIMIT}"`);
      expect(minimalContext).toContain(`inline_char_limit="${WORKER_MINIMAL_TARGET_FILE_INLINE_CHAR_LIMIT}"`);
      expect(compactContext).toContain('<available_tools context_budget="compact" compacted="true">');
      expect(minimalContext).toContain('<decomp_standards context_budget="minimal" compacted="true">');
      expect(minimalContext).toContain("Minimal retry budget");
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  test("organizes the system prompt around goal, workflow context, and contracted rules", () => {
    const systemPrompt = sampleWorkerPrompt().systemPrompt;
    const goal = systemPrompt.indexOf("<goal>");
    const definitionOfDone = systemPrompt.indexOf("<definition_of_done>");
    const thinking = systemPrompt.indexOf("<thinking>");
    const workflowContext = systemPrompt.indexOf("<workflow_context>");
    const rules = systemPrompt.indexOf("<contracted_in_rules>");
    const understandFile = systemPrompt.indexOf('<phase id="1" name="holistic_file_understanding">');
    const referencePass = systemPrompt.indexOf('<phase id="2" name="solved_reference_pass">');
    const hypothesisGeneration = systemPrompt.indexOf('<phase id="3" name="hypothesis_generation">');
    const hypothesisTesting = systemPrompt.indexOf('<phase id="4" name="hypothesis_testing">');
    const editAndEvaluate = systemPrompt.indexOf('<phase id="5" name="edit_and_evaluate">');
    const originalProgrammerLens = systemPrompt.indexOf("Understand how the original programmers wrote this code");
    const sudokuLens = systemPrompt.indexOf("Think like Sudoku:");

    expect(goal).toBeGreaterThanOrEqual(0);
    expect(definitionOfDone).toBeGreaterThan(goal);
    expect(thinking).toBeGreaterThan(definitionOfDone);
    expect(workflowContext).toBeGreaterThan(thinking);
    expect(rules).toBeGreaterThan(workflowContext);
    expect(originalProgrammerLens).toBeGreaterThan(thinking);
    expect(sudokuLens).toBeGreaterThan(originalProgrammerLens);
    expect(systemPrompt).toContain("A single worker turn may end before 100%");
    expect(systemPrompt).toContain("Build a holistic picture of what the file is and what it does:");
    expect(systemPrompt).toContain("Treat the target as code likely written by a small number of programmers.");
    expect(systemPrompt).toContain("high-signal personal preference patterns and company-standard patterns");
    expect(systemPrompt).toContain("Something elsewhere may have been written by the same person");
    expect(systemPrompt).toContain("Finding one strong matching pattern can strongly constrain how this target was likely written.");
    expect(systemPrompt).toContain("Assume a small original author pool left repeatable idioms");
    expect(systemPrompt).toContain(
      "Based on that file understanding, look around the codebase for 100% matched functions/files",
    );
    expect(systemPrompt).toContain("Use opseq similarity leads to find instruction-shape analogs before adapting duplicates or broad rewrites.");
    expect(systemPrompt).toContain("Develop a few concrete hypotheses for what could be done");
    expect(systemPrompt).toContain("Test the hypotheses with targeted deeper analysis.");
    expect(systemPrompt).toContain(
      "`source_permuter_run` is expensive and opportunistic. Use it only as a last resort",
    );
    expect(systemPrompt).toContain("Use the injected `canonical_tool_paths` block");
    expect(systemPrompt).toContain("Do not run broad filesystem `find` sweeps");
    expect(systemPrompt).toContain("Do not rerun it for the same function unless source/header/context/asm inputs or m2c args changed");
    expect(systemPrompt).toContain(
      "If `source_permuter_run` returns `queue_busy`, do not retry or wait on it",
    );
    expect(systemPrompt).toContain(
      "When a target is near exact, use mismatch-specific probes and source mutation previews first",
    );
    expect(systemPrompt).toContain("If you have a buildable improvement, a falsified attempt that should be checkpointed");
    expect(systemPrompt).toContain("return a handoff JSON");
    expect(systemPrompt).toContain("This handoff is not a worker report");
    expect(systemPrompt).toContain("Do not treat non-100% progress as failure");
    expect(systemPrompt).toContain("Here is what I tried.");
    expect(systemPrompt).toContain("the runner owns the follow-up decision");
    expect(systemPrompt).not.toContain("<checkpoint_note>");
    expect(understandFile).toBeGreaterThanOrEqual(0);
    expect(referencePass).toBeGreaterThan(understandFile);
    expect(hypothesisGeneration).toBeGreaterThan(referencePass);
    expect(hypothesisTesting).toBeGreaterThan(hypothesisGeneration);
    expect(editAndEvaluate).toBeGreaterThan(hypothesisTesting);
  });
});
