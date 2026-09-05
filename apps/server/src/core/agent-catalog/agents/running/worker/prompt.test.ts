import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  insertWorkerRun,
  openKnowledgeStore,
  writeFactWithEvidence,
} from "../../../../knowledge-v2/index.js";
import { renderSystemPrompt, workerPrompt } from "./prompt.js";
import { targetPacketTarget } from "./packet.js";
import {
  WORKER_COMPACT_TARGET_FILE_INLINE_CHAR_LIMIT,
  WORKER_MINIMAL_TARGET_FILE_INLINE_CHAR_LIMIT,
  WORKER_TARGET_FILE_INLINE_CHAR_LIMIT,
} from "./context.js";
import { renderKernelContextInputsPreview } from "../../../kernel-context.js";

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
      first_diff: {
        status: "available",
        score: 91.25,
        rows: [
          {
            side: "left",
            address: "8272",
            kind: "DIFF_ARG_MISMATCH",
            text: "lfs f3, lbl_804DA824@sda21",
          },
        ],
        row_counts_by_kind: {
          DIFF_ARG_MISMATCH: 1,
        },
        truncated: false,
      },
      knowledge_context: {
        status: "ready",
        related_functions: {
          callers: [{ symbol: "caller_fn", unit: "GALE01:caller", matched: true }],
          callees: [{ symbol: "callee_fn", unit: "GALE01:callee", matched: false }],
          analogs: [{
            symbol: "analog_fn",
            unit: "GALE01:analog",
            fuzzy_match_percent: 96.5,
            score: 0.98,
            exact_match: true,
          }],
        },
        file_card: {
          source_path: "src/melee/test/missing.c",
          editability: {
            mode: "editable",
            reason: "Target source is in the approved write set.",
          },
          functions: [
            {
              symbol: "test_symbol",
              unit: "GALE01:test",
              fuzzy: 91.25,
            },
            ...Array.from({ length: 13 }, (_, index) => ({
              symbol: `same_file_symbol_${index}`,
              unit: "GALE01:test",
              fuzzy: 100,
            })),
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
  test("renders unavailable v2 context deterministically when the knowledge database is absent", async () => {
    const previous = process.env.ORCH_GAME_KNOWLEDGE_ROOT;
    const knowledgeRoot = await mkdtemp(resolve(tmpdir(), "worker-prompt-v2-empty-"));
    try {
      process.env.ORCH_GAME_KNOWLEDGE_ROOT = knowledgeRoot;
      const first = sampleWorkerPrompt();
      const second = sampleWorkerPrompt();
      const renderedContext = first.kernelContext?.renderedContext ?? "";

      expect(renderedContext).toMatch(
        /<target_knowledge[^>]*unavailable="true"[^>]*reason="[^"]+"\s*\/>/,
      );
      expect(first.kernelContext?.inputs.map((input) => input.loaderKind)).toEqual([
        "worker-packet",
      ]);
      expect(second.kernelContext?.renderedContext).toBe(renderedContext);
    } finally {
      if (previous === undefined) delete process.env.ORCH_GAME_KNOWLEDGE_ROOT;
      else process.env.ORCH_GAME_KNOWLEDGE_ROOT = previous;
      await rm(knowledgeRoot, { recursive: true, force: true });
    }
  });

  test("prefers and reprojects the runner-precomputed v2 card", () => {
    const bundle = workerPrompt({
      packet: {
        target: {
          unit: "GALE01:test",
          symbol: "test_symbol",
          source_path: "src/melee/test/missing.c",
        },
        baseline: { fuzzy_match_percent: 91.25 },
        first_diff: {
          status: "unavailable",
          reason: "build_failed",
          score: null,
          rows: [],
          row_counts_by_kind: {},
          truncated: false,
        },
        knowledge_context: {
          knowledge_card_v2: {
            stable_key: "GALE01:test:test_symbol",
            target: {
              kind: "function",
              unit: "GALE01:test",
              symbol: "test_symbol",
              source_path: "src/melee/test/missing.c",
              identity_status: "current",
            },
            context_budget: "full",
            ledger: {
              runs: [],
              entries: Array.from({ length: 10 }, (_, index) => ({
                type: "submission",
                seq: index + 1,
                description: `precomputed-card-entry-${index}`,
                score: 90 + index,
                run_outcome: "improvement",
                integration: "integrated",
              })),
            },
            status: null,
            facts: { naming_note: "fixture", by_type: {} },
            links: [],
            prior_runs: [],
            accepted_prs: [],
          },
        },
      },
      repoRoot: "/repo",
      stateDir: "/state",
      initialBoardPath: "/state/board.json",
      workerLogDir: "/state/workers",
      contextBudget: "compact",
    });
    const renderedContext = bundle.kernelContext?.renderedContext ?? "";

    expect(renderedContext).toContain(
      '<target_knowledge context_budget="compact">',
    );
    expect(renderedContext).toContain("precomputed-card-entry-7");
    expect(renderedContext).not.toContain("precomputed-card-entry-8");
    expect(renderedContext).not.toContain("precomputed-card-entry-9");
  });

  test("loads v2 context without emitting a legacy graph card", async () => {
    const previous = process.env.ORCH_GAME_KNOWLEDGE_ROOT;
    const knowledgeRoot = await mkdtemp(resolve(tmpdir(), "worker-prompt-v2-card-"));
    const store = openKnowledgeStore({ knowledgeRoot });
    try {
      store.db.query(`INSERT INTO entity
        (id, kind, locator, identity_status)
        VALUES ('unit-entity', 'translation_unit', 'src/test.c', 'active')`).run();
      store.db.query(`INSERT INTO target
        (id, kind, unit, unit_entity_id, symbol, stable_key, address, identity_status, report_revision)
        VALUES ('target', 'function', 'GALE01:test', 'unit-entity', 'test_symbol',
          'GALE01:test:test_symbol', '0x80000000', 'current', 'rev')`).run();
      writeFactWithEvidence(store, {
        id: "fact", targetId: "target", type: "purpose", value: "Fixture purpose",
        rationale: "Fixture rationale", confidence: 0.9,
      }, []);
      insertWorkerRun(store, {
        id: "run", targetId: "target", goal: "Improve", baseline: "{}",
        finalOutcome: "improvement", integration: "integrated",
        startedAt: "2026-01-01T00:00:00.000Z", closedAt: "2026-01-01T00:01:00.000Z",
      }, [{
        id: "submission", seq: 1, description: "Changed branch", score: 95,
        submittedAt: "2026-01-01T00:00:30.000Z",
      }]);
      process.env.ORCH_GAME_KNOWLEDGE_ROOT = knowledgeRoot;

      const bundle = sampleWorkerPrompt();
      const renderedContext = bundle.kernelContext?.renderedContext ?? "";
      expect(renderedContext).toContain("<target_knowledge");
      expect(renderedContext).not.toContain("<target_graph_file_card");
      expect(bundle.kernelContext?.inputs.map((input) => input.loaderKind)).toEqual([
        "worker-packet",
      ]);
    } finally {
      store.close();
      if (previous === undefined) delete process.env.ORCH_GAME_KNOWLEDGE_ROOT;
      else process.env.ORCH_GAME_KNOWLEDGE_ROOT = previous;
      await rm(knowledgeRoot, { recursive: true, force: true });
    }
  });

  test("renders data-matching guidance for a section target packet", () => {
    const target = targetPacketTarget({
      target_id: "section-target",
      unit: "GALE01:test",
      symbol: ".sdata2",
      source_path: "src/melee/test/data.c",
      size: 24,
      fuzzy: 87.5,
    });
    const bundle = workerPrompt({
      packet: {
        target,
        baseline: { fuzzy_match_percent: target.fuzzy_match_percent },
        first_diff: {
          status: "unavailable",
          reason: "dry_run",
          score: null,
          rows: [],
          row_counts_by_kind: {},
          truncated: false,
        },
      },
      repoRoot: "/repo",
      stateDir: "/state",
      initialBoardPath: "/state/board.json",
      workerLogDir: "/state/workers",
    });

    expect(target).toMatchObject({
      kind: "section",
      symbol: ".sdata2",
      fuzzy_match_percent: 87.5,
    });
    expect(bundle.systemPrompt).toContain("named section of this translation unit");
    expect(bundle.systemPrompt).toContain("remaining data symbols");
    expect(bundle.systemPrompt).toContain("Order float and double constants to match the `.sdata2` pool order");
    expect(bundle.systemPrompt).toContain("`.bss` has no initializers");
    expect(bundle.systemPrompt).toContain("Changing `static` versus global declarations can change section placement");
    expect(bundle.systemPrompt).toContain("Do not use m2c decompile, the permuter, or MWCC debug tools");
    expect(bundle.systemPrompt).toContain("build-and-compare evidence from checkdiff or the objdiff summary");
    expect(bundle.systemPrompt).not.toContain("holistic_file_understanding");
    expect(bundle.systemPrompt).not.toContain("hypothesis_generation");
    expect(bundle.kernelContext?.renderedContext).toContain(
      '<first_diff status="unavailable" reason="dry_run"/>',
    );
  });

  test("keeps dynamic packet in kernel context instead of system or user prompt", () => {
    const bundle = sampleWorkerPrompt();

    expect(bundle.systemPrompt).toContain('<context_usage context_id="worker-packet">');
    expect(bundle.systemPrompt).toContain('<context_usage context_id="target-knowledge">');
    expect(bundle.systemPrompt).not.toContain("knowledge-graph-file-card");
    expect(bundle.systemPrompt).not.toContain("<decomp_standards>");
    expect(bundle.systemPrompt).not.toContain("<target_file");
    expect(bundle.kernelContext?.turnPrompt).toBe("Use the injected worker context for this run. Complete the task described there, follow the system prompt, and return the required output.");
    expect(bundle.userPrompt).toBe("");
    expect(bundle.userPrompt).not.toContain("<decomp_standards>");
    expect(bundle.userPrompt).not.toContain("<target_file");
    const renderedContext = bundle.kernelContext?.renderedContext ?? "";

    expect(bundle.kernelContext?.inputs.map((input) => input.loaderKind)).toEqual([
      "worker-packet",
    ]);
    const inputContent = bundle.kernelContext?.inputs.map((input) => input.content).join("\n") ?? "";
    expect(inputContent.match(/<target_knowledge\b/g)).toHaveLength(1);
    expect(renderedContext.match(/<target_knowledge\b/g)).toHaveLength(1);
    const inputsPreview = renderKernelContextInputsPreview(bundle.kernelContext?.inputs ?? []);
    expect(inputsPreview.match(/<target_knowledge\b/g)).toHaveLength(1);
    expect(inputsPreview).toStartWith('<worker-packet ref="worker-packet">');
    expect(inputsPreview).not.toContain('<target-knowledge ref="target-knowledge">');
    expect(renderedContext).toContain("<decomp_standards>");
    expect(renderedContext).not.toContain("<context_budget");
    expect(renderedContext).toContain("<target_file");
    expect(renderedContext).not.toContain("<canonical_tool_paths>");
    expect(renderedContext).not.toContain('relative_path="build/binutils');
    expect(renderedContext).not.toContain("Broad find roots");
    expect(renderedContext).toContain('<first_diff status="available" score="91.25" rows="1" truncated="false">');
    expect(renderedContext).toContain(
      "left 8272: DIFF_ARG_MISMATCH lfs f3, lbl_804DA824@sda21",
    );
    expect(renderedContext).toContain(
      "row_counts_by_kind: DIFF_ARG_MISMATCH=1",
    );
    expect(renderedContext).toContain('<editability mode="editable"');
    expect(renderedContext).toContain(
      'reason="Target source is in the approved write set."',
    );
    expect(renderedContext).toContain("same_file_symbol_11");
    expect(renderedContext).not.toContain("same_file_symbol_12");
    expect(renderedContext).toContain("<related_functions>");
    expect(renderedContext).toContain('<caller symbol="caller_fn" unit="GALE01:caller" matched="true"/>');
    expect(renderedContext).toContain('<callee symbol="callee_fn" unit="GALE01:callee" matched="false"/>');
    expect(renderedContext).toContain('<analog symbol="analog_fn" unit="GALE01:analog" fuzzy_match_percent="96.5" score="0.98" exact_match="true"/>');
    expect(renderedContext).not.toContain("<target_graph_file_card");
    expect(renderedContext).not.toContain('"top_opseq_analog"');
    expect(renderedContext).not.toContain("follow_up_queries");
    expect(renderedContext).not.toContain("search_leads");
    expect(renderedContext).not.toContain(["kv2", "_"].join(""));
    expect(renderedContext).not.toContain('"tool": "ledger_search"');
    expect(renderedContext).not.toContain("opseq_similar_functions");
    expect(renderedContext).not.toContain("mismatch_db_search");
    expect(renderedContext).not.toContain("<baseline>");
    expect(renderedContext).not.toContain("<available_tools");
    const blockOrder = ["<target ", "<first_diff", "<target_knowledge", "<decomp_standards"]
      .map((tag) => renderedContext.indexOf(tag));
    expect(blockOrder.every((position) => position >= 0)).toBeTrue();
    expect(blockOrder).toEqual([...blockOrder].sort((left, right) => left - right));
    expect(renderedContext).toContain('baseline_fuzzy_match_percent="91.25"');
    expect(renderedContext).toContain("<canonical_example");
    expect(renderedContext).toContain("<bad_code>");
    expect(renderedContext).toContain("<preferred_code>");
    expect(renderedContext).not.toContain("<standard_examples");
    expect(renderedContext).not.toContain("<bad_pattern>");
    expect(renderedContext).not.toContain("<preferred_shape>");
    expect(`${bundle.systemPrompt}\n${bundle.userPrompt}\n${renderedContext}`).not.toMatch(/\{\{[A-Z0-9_]+\}\}/);
  });

  test("caps first-diff text for every context budget and keeps six minimal rows", () => {
    const packet = {
      target: {
        unit: "GALE01:test",
        symbol: "test_symbol",
        source_path: "src/melee/test/missing.c",
      },
      baseline: { fuzzy_match_percent: 91.25 },
      first_diff: {
        status: "available",
        score: 91.25,
        rows: Array.from({ length: 40 }, (_, index) => ({
          side: index % 2 === 0 ? "left" : "right",
          address: String(8272 + index * 4),
          kind: "DIFF_ARG_MISMATCH",
          text: `row-${index}-${"operand".repeat(30)}`,
        })),
        row_counts_by_kind: { DIFF_ARG_MISMATCH: 40 },
        truncated: false,
      },
    };
    const renderBlock = (contextBudget: "full" | "compact" | "minimal") => {
      const rendered = workerPrompt({
        packet,
        repoRoot: "/repo",
        stateDir: "/state",
        initialBoardPath: "/state/board.json",
        workerLogDir: "/state/workers",
        contextBudget,
      }).kernelContext?.renderedContext ?? "";
      return rendered.match(/<first_diff[\s\S]*?<\/first_diff>/)?.[0] ?? "";
    };

    const full = renderBlock("full");
    const compact = renderBlock("compact");
    const minimal = renderBlock("minimal");
    expect(full.length).toBeLessThanOrEqual(4_000);
    expect(compact.length).toBeLessThanOrEqual(2_000);
    expect(minimal.length).toBeLessThanOrEqual(800);
    expect(minimal.match(/^\s*(?:left|right)\s/gm)).toHaveLength(6);
    expect(minimal).toContain('truncated="true"');
    expect(minimal).toContain("row_counts_by_kind: DIFF_ARG_MISMATCH=40");
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
      expect(fullContext).not.toContain("<available_tools");
      expect(compactContext).not.toContain("<available_tools");
      expect(minimalContext).not.toContain("<available_tools");
      expect(minimalContext).toContain('<decomp_standards context_budget="minimal" compacted="true">');
      expect(minimalContext).toContain('note="compact retry budget: read local files for full source"');
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  test("renders sandbox-prefetched source without reading the host workspace path", () => {
    const bundle = workerPrompt({
      packet: {
        target: {
          unit: "GALE01:test",
          symbol: "sandbox_symbol",
          source_path: "src/melee/test/sandbox.c",
        },
        baseline: { fuzzy_match_percent: 80 },
      },
      repoRoot: "/remote/workspace/that-is-not-on-the-host",
      stateDir: "/state",
      initialBoardPath: "/state/board.json",
      workerLogDir: "/state/workers",
      targetSourceText: "int sandbox_prefetched_marker;\n",
    });

    const renderedContext = bundle.kernelContext?.renderedContext ?? "";
    expect(renderedContext).toContain("int sandbox_prefetched_marker;");
    expect(renderedContext).not.toContain('content unavailable="true"');
  });

  test("organizes the system prompt around goal, workflow context, and contracted rules", () => {
    const systemPrompt = renderSystemPrompt();
    const goal = systemPrompt.indexOf("<goal>");
    const definitionOfDone = systemPrompt.indexOf("<definition_of_done>");
    const thinking = systemPrompt.indexOf("<thinking>");
    const workflowContext = systemPrompt.indexOf("<workflow_context>");
    const advancedTechniques = systemPrompt.indexOf("<advanced_techniques>");
    const rules = systemPrompt.indexOf("<contracted_in_rules>");
    const orient = systemPrompt.indexOf('<phase id="1" name="orient">');
    const exactSymbolHistory = systemPrompt.indexOf('<phase id="2" name="exact_symbol_history">');
    const nameTheMechanism = systemPrompt.indexOf('<phase id="3" name="name_the_mechanism">');
    const oneEditThenDiff = systemPrompt.indexOf('<phase id="4" name="one_edit_then_diff">');
    const escalate = systemPrompt.indexOf('<phase id="5" name="escalate">');
    const originalProgrammerLens = systemPrompt.indexOf("Understand how the original programmers wrote this code");
    const sudokuLens = systemPrompt.indexOf("Think like Sudoku:");

    expect(goal).toBeGreaterThanOrEqual(0);
    expect(definitionOfDone).toBeGreaterThan(goal);
    expect(thinking).toBeGreaterThan(definitionOfDone);
    expect(workflowContext).toBeGreaterThan(thinking);
    expect(advancedTechniques).toBeGreaterThan(workflowContext);
    expect(rules).toBeGreaterThan(advancedTechniques);
    expect(originalProgrammerLens).toBeGreaterThan(thinking);
    expect(sudokuLens).toBeGreaterThan(originalProgrammerLens);
    expect(systemPrompt).toContain("<submission>");
    expect(systemPrompt).toContain("Treat the target as code likely written by a small number of programmers.");
    expect(systemPrompt).toContain("high-signal personal preference patterns and company-standard patterns");
    expect(systemPrompt).toContain("Something elsewhere may have been written by the same person");
    expect(systemPrompt).toContain("Finding one strong matching pattern can strongly constrain how this target was likely written.");
    expect(systemPrompt).toContain("Assume a small original author pool left repeatable idioms");
    expect(systemPrompt).toContain("Read the target, the `first_diff`, the `target_knowledge` prior runs, and the standards.");
    expect(systemPrompt).toContain("Before any edit, read what already happened on this exact symbol.");
    expect(systemPrompt).toContain("`knowledge_record` for the full record and ledger of the target");
    expect(systemPrompt).toContain("`pr_search` for the accepted pull request on this symbol or its unit");
    expect(systemPrompt).toContain("Resolve any locator you rely on with `resolve_locator`");
    expect(systemPrompt).not.toContain(["kv2", "_"].join(""));
    expect(systemPrompt).not.toContain("graph_related_functions");
    expect(systemPrompt).not.toContain("past_prs_search");
    expect(systemPrompt).not.toContain("ledger_search");
    expect(systemPrompt).toContain("name the compiler mechanism that produces it");
    expect(systemPrompt).toContain("A hypothesis is ready to test only when it states:");
    expect(systemPrompt).toContain("Stop rule for a variant family:");
    expect(systemPrompt).toContain(
      "When two or three variants in one family reproduce the same residual rows, that family is exhausted.",
    );
    expect(systemPrompt).toContain("Permuter as a probe, not a finder");
    expect(systemPrompt).toContain("Run `source_permuter_run` only after you have named the function and the bounded region or helper that owns the residual.");
    expect(systemPrompt).toContain("Treat the result as evidence about which source region controls the residual, then hand-write the final edit.");
    expect(systemPrompt).not.toContain("Use opseq similarity leads");
    expect(systemPrompt).not.toContain("last resort");
    expect(systemPrompt).not.toContain("Develop a few concrete hypotheses");
    expect(systemPrompt).not.toContain("Test the hypotheses with targeted deeper analysis.");
    expect(systemPrompt).toContain("are on PATH in your sandbox; call them by name");
    expect(systemPrompt).not.toContain("canonical_tool_paths");
    expect(systemPrompt).toContain("Do not run broad filesystem `find` sweeps");
    expect(systemPrompt).toContain("Do not rerun it for the same function unless source/header/context/asm inputs or m2c args changed");
    expect(systemPrompt).toContain(
      "`source_permuter_run` runs inside the claim sandbox, defaults to all sandbox cores, and has no cross-worker queue",
    );
    expect(systemPrompt).toContain("Submit a verified improvement so it is validated and checkpointed, then continue toward exact.");
    expect(systemPrompt).toContain("Here is what I tried.");
    expect(systemPrompt).toContain("the target translation unit is your motivation and review scope");
    expect(systemPrompt).toContain("Edit only paths in your approved write set");
    expect(systemPrompt).toContain("initially contains only the `&lt;target_file");
    expect(systemPrompt).toContain("first try typing the in-slice code to the foreign types already present on master");
    expect(systemPrompt).toContain("`widening_request` object");
    expect(systemPrompt).toContain("`write_set_widening_request_v1`");
    expect(systemPrompt).toContain("`category`: `config-metadata`, `owning-header`, or `foreign-source`");
    expect(systemPrompt).toContain("`rung`: `2`, `3`, or `4`");
    expect(systemPrompt).toContain("`mismatched_declaration`: `{ symbol, current, required, expected_owner }`");
    expect(systemPrompt).toContain("`objdiff`: `{ unit, score_without, score_with, artifact_path? }`");
    expect(systemPrompt).toContain("`ladder_evidence`: `{ rung1_in_slice, rung2_config?, rung3_header? }`");
    expect(systemPrompt).toContain("only honored when write-set widening is enabled");
    expect(systemPrompt).toContain("Requested paths remain unauthorized unless the runner approves them");
    expect(systemPrompt).toContain("Never add local shims—aliases, local prototypes, or include-macro rewrites");
    expect(systemPrompt).not.toContain("Edit only the path named by");
    expect(systemPrompt).toContain("A repair request only comes for validation/lint failures or for an exact match that failed hard gates");
    expect(systemPrompt).toContain('<context_usage context_id="worker-packet">');
    expect(systemPrompt).toContain('<context_usage context_id="target-knowledge">');
    expect(systemPrompt).not.toContain("knowledge-graph-file-card");
    expect(systemPrompt).not.toContain("holistic_file_understanding");
    expect(systemPrompt).not.toContain("hypothesis_generation");
    expect(systemPrompt).not.toContain("<checkpoint_note>");
    expect(systemPrompt).not.toContain("handoff");
    expect(systemPrompt).not.toContain("turn budget");
    expect(systemPrompt).not.toContain("later epoch");
    expect(systemPrompt).not.toContain("attempt budget");
    expect(orient).toBeGreaterThanOrEqual(0);
    expect(exactSymbolHistory).toBeGreaterThan(orient);
    expect(nameTheMechanism).toBeGreaterThan(exactSymbolHistory);
    expect(oneEditThenDiff).toBeGreaterThan(nameTheMechanism);
    expect(escalate).toBeGreaterThan(oneEditThenDiff);
  });
});
