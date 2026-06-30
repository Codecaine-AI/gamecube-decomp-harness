import { describe, expect, test } from "bun:test";
import { workerPrompt } from "./prompt.js";

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
    expect(bundle.kernelContext?.turnPrompt).toBeUndefined();
    expect(bundle.userPrompt).toBe("");
    expect(bundle.userPrompt).not.toContain("<decomp_standards>");
    expect(bundle.userPrompt).not.toContain("<target_file");
    const renderedContext = bundle.kernelContext?.renderedContext ?? "";

    expect(bundle.kernelContext?.inputs.map((input) => input.loaderKind)).toEqual([
      "worker-packet",
      "knowledge-graph-file-card",
    ]);
    expect(renderedContext).toContain("<decomp_standards>");
    expect(renderedContext).toContain("<target_file");
    expect(renderedContext).toContain("<canonical_tool_paths>");
    expect(renderedContext).toContain('relative_path="build/binutils/powerpc-eabi-objdump"');
    expect(renderedContext).toContain("Broad find roots");
    expect(renderedContext).toContain("<target_graph_file_card");
    expect(renderedContext).toContain("<canonical_example");
    expect(renderedContext).toContain("<bad_code>");
    expect(renderedContext).toContain("<preferred_code>");
    expect(renderedContext).not.toContain("<standard_examples");
    expect(renderedContext).not.toContain("<bad_pattern>");
    expect(renderedContext).not.toContain("<preferred_shape>");
    expect(`${bundle.systemPrompt}\n${bundle.userPrompt}\n${renderedContext}`).not.toMatch(/\{\{[A-Z0-9_]+\}\}/);
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
    expect(systemPrompt).toContain("Build a holistic picture of what the file is and what it does:");
    expect(systemPrompt).toContain("Treat the target as code likely written by a small number of programmers.");
    expect(systemPrompt).toContain("high-signal personal preference patterns and company-standard patterns");
    expect(systemPrompt).toContain("Something elsewhere may have been written by the same person");
    expect(systemPrompt).toContain("Finding one strong matching pattern can strongly constrain how this target was likely written.");
    expect(systemPrompt).toContain("Assume a small original author pool left repeatable idioms");
    expect(systemPrompt).toContain(
      "Based on that file understanding, look around the codebase for 100% matched functions/files",
    );
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
    expect(systemPrompt).toContain("This handoff is not a worker report");
    expect(systemPrompt).toContain("Here is what I tried.");
    expect(systemPrompt).not.toContain("<checkpoint_note>");
    expect(understandFile).toBeGreaterThanOrEqual(0);
    expect(referencePass).toBeGreaterThan(understandFile);
    expect(hypothesisGeneration).toBeGreaterThan(referencePass);
    expect(hypothesisTesting).toBeGreaterThan(hypothesisGeneration);
    expect(editAndEvaluate).toBeGreaterThan(hypothesisTesting);
  });
});
