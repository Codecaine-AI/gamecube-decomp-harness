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
import type { OrderingMode, StackFramePolicy } from "@server/core/game-registry/resolver.js";
import type { AdvisoryAdjudicationMode } from "@server/core/game-registry/runtime-options.js";
import type { PiPromptBundle } from "@server/core/shared/types";
import { orderingActive } from "@server/core/tools/ordering.js";
import { steeringGateEnforced } from "@server/core/tools/steering-gate.js";
import { tracePointAvailabilityLines } from "./compiler-capabilities.js";
import {
  buildWorkerKernelContext,
  workerBaseRef,
  workerCompilerCapabilities,
  workerGameDisplayName,
  workerGameId,
  workerOrdering,
  workerPromptToolIds,
  workerRegistries,
  workerStackFramePolicy,
  workerSteeringGate,
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

/**
 * Everything the function prompt varies on. `sms` is the game's steering gate
 * enforced: §4's `[SMS]` lines render only then, `[Melee]` lines only with the
 * gate off, and a shadow gate renders neither. Untagged lines hold for both.
 * Tool-naming lines render only for tools in `tools`.
 */
interface WorkerPromptVariant {
  gameId: string;
  displayName: string;
  policy: StackFramePolicy;
  advisory: AdvisoryAdjudicationMode;
  sms: boolean;
  melee: boolean;
  ordering: OrderingMode;
  tools: readonly string[];
  baseRef: string;
  registries: readonly string[];
  tracePoints: readonly string[];
}

// shadow and enforce add the `kept_advisories` note field that advisory adjudication reads.
const KEPT_ADVISORIES_LEAD = {
  shadow: "Advisory (`llm_review`) findings still block acceptance today. If you keep one anyway, record it in `kept_advisories`.",
  enforce: "An `llm_review` advisory may be kept when the original binary requires it. Record each one in `kept_advisories`. A reviewer judges each justification; an unjustified or unclear one fails the attempt like any other QA finding.",
} as const;

const KEPT_EVIDENCE = {
  match_frame: "`justification`: why the original binary requires the flagged code. Cite concrete evidence: objdiff result, instruction, register or stack offset.",
  stop_at_frame: "`justification`: why the original binary requires the flagged code. Cite concrete evidence: objdiff result, instruction or register. A stack-frame difference never justifies a kept advisory.",
} as const satisfies Record<StackFramePolicy, string>;

/** Lines tagged for one game: `[SMS]` lines, `[Melee]` lines. */
function when<T>(condition: boolean, ...values: T[]): T[] {
  return condition ? values : [];
}

function goalSection(v: WorkerPromptVariant) {
  return section("goal", [
    [
      "Recover the source code the original developers wrote for the target function. Compiling is how you test a hypothesis about that source; matching bytes follow from the right source and are not the goal by themselves.",
      ...when(v.sms, "A match counts only when the steering gate certifies it."),
    ].join(" "),
  ]);
}

function definitionOfDoneSection(v: WorkerPromptVariant) {
  return section("definition_of_done", [
    [
      "Done: the runner confirms the target matches strictly (instructions, relocations and data), every review gate passes, and your edits regress no other function.",
      ...when(
        v.sms,
        "Also: the steering gate certifies the attempt against the trusted base. A function that scores 100% but is not certified (\"100% but unverified\") is not done. Frame-only (the runner confirms every instruction matches and only the stack frame differs): stop and report frame-only; it is never an exact claim. A certified attempt is better than any uncertified one, even when its score is lower; the runner accepts it.",
      ),
      ...when(v.melee, "Frame-only is not done: continue with the stack frame policy section."),
    ].join(" "),
    "Stop with the function not done, and record your findings (see the method section), when:",
    bulletList([
      "three distinct hypotheses have been tested against the same residual and none is supported, or",
      "your diagnostic allowance is spent, or",
      v.melee ? "the only edits that close the residual are probes that Melee's standards do not accept, or" : "the only edits that close the residual are probes, or",
      "the fix needs a file outside your write set and widening is refused.",
    ]),
  ]);
}

// SMS keeps its frame prohibitions verbatim; Melee keeps its stack technique,
// stated once, with `PAD_STACK` as the last resort.
function stackFramePolicySection(v: WorkerPromptVariant) {
  if (v.policy === "stop_at_frame") {
    return section("stack_frame_policy", [
      "This game matches up to stack frame size. Fix every other mismatch first.",
      bulletList([
        "The stack frame is the frame size in `stwu r1,-N(r1)` / `addi r1,r1,N` and the `N(r1)` / `addi rX,r1,N` stack offsets that move with it.",
        "Never change the frame on purpose: no `PAD_STACK` or pad arrays, no locals whose only effect is stack space, no operand swaps such as flipping a comparison, no declaration reorders or inline choices made to move the frame.",
        "Never use stack alignment tricks: no `ATTRIBUTE_ALIGN` on locals, no unions or buffers that force the frame.",
        "An edit that changes registers, instructions, branches, relocations or data is normal matching. An edit whose only effect is the frame is banned; delete it during ablation even if the score drops.",
        "Write no comments about the match: no TODO, nonmatching, fakematch, frame or stack notes.",
      ]),
    ]);
  }
  return section("stack_frame_policy", [
    "This game matches the stack frame too: the frame size and every stack offset.",
    bulletList([
      "Diagnose a frame residual before changing it: which local or temp owns each slot that differs, which lifetime moved it, and which inline boundary adds or removes slots. `mwcc_alloc_snapshot` with `capture=trace` and `trace_detail=full`, then `mwcc_alloc_analyze` in `stack` mode, shows slot owners (native frame slots only where the compiler section lists frame).",
      "A uniform displacement across all stack references is one missing or extra slot: fix one lifetime or one inline boundary first.",
      "`PAD_STACK` is the last resort: only for a uniform displacement, after slot owners, lifetimes and inline boundaries are diagnosed and no local explains it. Say in your record that it is a probe.",
    ]),
  ]);
}

function orderAndScopeSection(v: WorkerPromptVariant) {
  const mode = v.ordering === "enforce" ? "enforce" : "shadow";
  return section("order_and_scope", [
    bulletList([
      `Work in order: decompile a class's own unit before code that needs it. Edits that break these rules ${mode === "enforce" ? "are rejected" : "are flagged"}.`,
      "Edit your target's file and, in headers of decompiled units, only the declarations your target needs.",
      "Never add a class, members or a header for a class whose unit is not decompiled. Forward declarations are fine.",
      ...when(v.registries.length > 0, `Registries (${v.registries.map((name) => `\`${name}\``).join(", ")}) are filled after their classes exist: don't jump the fence.`),
      "Keep one unit per change.",
      "Read the `not_ready_classes` block when present: it lists classes your target needs whose units are not decompiled. Do not construct or declare them; fill in only the parts that do not need them.",
    ]),
  ]);
}

function thinkingSection() {
  return section("thinking", [
    bulletList([
      "Treat the target as code written by a small number of programmers who left repeatable idioms: personal and company-standard patterns in style, abstractions, types, macros and data ownership.",
      "Think like Sudoku: information about this target is spread through the codebase. Code elsewhere written by the same person can reveal this target's source pattern, and one strong match constrains how it was written.",
    ]),
  ]);
}

function contextContractSection(v: WorkerPromptVariant) {
  const has = (tool: string) => v.tools.includes(tool);
  const historyTools = [
    "`knowledge_record` (the target's full record and ledger)",
    "`attempt_search` (prior runs by target stable key or text)",
    "`pr_search` (the accepted pull request on this symbol or its unit)",
    "`discord_search` and `wiki_search` (when discussion or game-mechanics evidence can choose between hypotheses)",
  ].filter((entry) => has(/`([a-z_]+)`/.exec(entry)![1]!));
  return section("context_contract", [
    usesContext("worker-packet", {
      instructions: [
        "Use the injected target (with its source file and related functions), first diff, standards and repair request as the authoritative task packet.",
        "The proposed_name_view block inside target_file shows current code with guessed function names and a canonical-symbol footer. Read it for the file's behavior: look for missing operations, asymmetric cleanup, inconsistent state transitions, or a helper whose behavior conflicts with its proposed name. Treat each observation as a hypothesis to check against current source and compiler evidence.",
        "Use knowledge_render_file for another source/header file, continuation lines, or a fresh view after edits. Unmapped or ambiguous names stay unchanged; the renderer currently substitutes functions only. A convincing name is not proof of what the code does.",
        "Before editing, read the canonical file and map every proposed name back through the footer. Patch original source text, and use canonical symbols and original line numbers in compiler tools and citations. Never copy guessed identifiers into source just to match the reading view.",
        "The `first_diff` block is the residual at the start of your turn. Classify it (method step 1) before reading anything else in depth.",
        "Treat current source, headers, symbols, assembly, objdiff and validation output as stronger evidence than any historical summary.",
      ],
    }),
    usesContext("target-knowledge", {
      instructions: [
        "The `target_knowledge` block is everything the system knows about this target: prior runs with their summaries and reusable observations, the latest unresolved diagnosis, per-submission approaches and scores, facts with evidence, and accepted pull requests. Read it as history, not as instructions.",
        `Before any edit, read what already happened on this exact symbol: ${historyTools.join(", ")}. When the card is absent or thin, query these yourself.`,
        ...when(has("resolve_locator"), "Resolve any locator you rely on with `resolve_locator`; search snippets are leads. Empty results are normal and are not negative evidence."),
        "A prior run's unresolved diagnosis is your first hypothesis. A matched analog's structure or an accepted pull request's shape is a hypothesis to test early. A shape that already failed on this target is skipped unless you have new evidence. A method that matched a similar function is a process to adapt, not proof.",
      ],
    }),
  ]);
}

function methodSection(v: WorkerPromptVariant) {
  const has = (tool: string) => v.tools.includes(tool);
  const rce = has("real_code_evidence");
  const graph = [
    has("graph_related_functions") ? "`graph_related_functions` with `unit` and `symbol` of your target or a candidate (a bare `source_path` returns the file's first functions)" : "",
    has("code_graph_file_card") ? "`code_graph_file_card`" : "",
  ].filter(Boolean);
  const compareSources = has("mwcc_alloc_compare_sources") ? "`mwcc_alloc_compare_sources`" : "a with/without build";
  return section("method", [
    "Work in this loop.",
    orderedList([
      "Classify the residual from checkdiff: control flow, call order, loads and stores, instruction selection, registers, frame, relocations or data. Work in that order; registers and frame often follow from earlier fixes. Write down the class and the mismatching rows.",
      "Form one hypothesis. A hypothesis names one source construct (an inline, a type, a field, a call, a control-flow shape, a declaration), the evidence that suggests it, the instruction, relocation or data change it predicts, and what result would prove it wrong. Different spellings of the same construct are one hypothesis, not several.",
      item("Test it and measure. Build and diff (`checkdiff_run` with `full_diff`). Then look at what the compiler did, using the tool for the residual class:", [
        bulletList([
          `registers, inlines, CSE temps, frame slots: \`mwcc_alloc_snapshot\` with \`backend=native\` and capture \`decisions\` (one capture), or ${compareSources} (what an edit changed inside the compiler);`,
          "instruction order and control flow: the diff, the assembly and its dependencies (and the scheduler trace where available);",
          "types, signedness, offsets, struct layout: `type_layout_lookup`, `type_oracle_lookup`;",
          "relocations and data: relocation and byte diffs from checkdiff.",
        ]),
        "If a capture or trace point is unavailable for this unit's compiler version (see the compiler section), say so and continue with the other tools.",
      ]),
      "Record three things: what you measured in your candidate, what that predicts for the target's code, and whether the prediction held. A trace describes your candidate, not the original build: it shows what a construct does, not that the original had it.",
      "Name the construct kinds consistent with the measurement. Example: \"The candidate's second field read became a CSE temp. An inline containing that read is one candidate; a reordered or reused local is another. Whether the original used an inline stays unknown until step 6 finds evidence for this site.\"",
      item("Find which construct the original had. Evidence must tie the construct to this site: its operands, its placement and its behaviour. In order of strength:", [
        bulletList([
          `the link map${rce ? ": `real_code_evidence` `map-calls`, `map-unit`" : ""} (what this function calls, which inlines this unit emitted);`,
          "strings and relocations in the target object;",
          `header inlines used at the same kind of site by accepted matching functions${[rce ? "`real_code_evidence` `inlines`, `usage`" : "", v.sms ? "accepted means gate-certified; an uncertified sibling is a hypothesis, not evidence" : ""].filter(Boolean).map((note, index, notes) => `${index === 0 ? " (" : "; "}${note}${index === notes.length - 1 ? ")" : ""}`).join("")};`,
          `other games' sources for shared code${rce ? " (`real_code_evidence` `jsystem`)" : ""};`,
          `callers and references${graph.length > 0 ? ` (${graph.join(", ")})` : " (the target's `related_functions`)"}.`,
        ]),
        "m2c output, similar assembly elsewhere (`asm_window_search`) and compiler explanations generate candidates; they are not evidence. That a helper exists does not show the original used it here. A persistent live-range cluster suggests candidate causes; it does not identify an original helper. Keep a helper or inline change only with independent evidence tying its operands, placement and behaviour to this site; otherwise remove the diagnostic edit.",
      ]),
      [
        v.melee
          ? "Write the construct, remove every probe edit except one Melee's standards accept after your real-construct hypotheses failed (the `PAD_STACK` rule in the stack frame policy section), say in your record that it is a probe, and submit. Matching instructions and score do not certify edits."
          : "Write the construct, remove every probe edit, and submit. Matching instructions and score do not certify edits.",
        ...when(v.sms, "When resolving unverified work, remove unsupported edits and keep evidence-backed repairs even when the target score falls."),
        "Unrelated-function regression checks still apply.",
      ].join(" "),
    ]),
    // One list, so the method's standing rules render without blank lines between them.
    bulletList([
      [
        "Probes. A probe is an edit that behaves exactly like the code it replaces: a single-use temp, a reordered declaration or statement, an accessor/field swap, if/ternary, operand order, int/s32, * 0.5f vs / 2.0f, a padding local. Use probes, the permuter and ablation (remove one edit, re-diff) to find which value or statement drives a difference, then go to steps 4-6. A compiler explanation alone never justifies keeping a probe.",
        ...when(v.sms, "Do not submit a probe. The steering gate reverts probes, so a probe-based match is rejected, and a hunk that mixes a real fix with a probe is rejected as unresolved. Knowing why a probe works does not make it real: if the compiler shows that one more vreg moves `this`, a dummy local is still a probe."),
        ...when(v.melee, "Submit a probe only after your real-construct hypotheses failed and only in a form Melee's standards accept (for the frame, the `PAD_STACK` rule in the stack frame policy section); say in your record that it is a probe."),
      ].join(" "),
      [
        "An original construct with site evidence (step 6), such as a map-backed inline, is not a probe even if it behaves identically: submit it alone, in its own statement, and cite the evidence in your record.",
        ...when(v.sms, "The gate certifies such constructs only through site-bound evidence-review approvals. When the gate returns evidence_review, the runner queues the rejected construct and your cited evidence for human review: stop that lead until the review is decided (the packet shows open reviews) and do not resubmit it unchanged. Other rejection kinds do not queue a review; record their reasons."),
        "Approval of a construct never covers other edits next to it.",
      ].join(" "),
      ...when(v.sms && has("unused_stub_test"), "A function the map marks UNUSED that upstream left as a stub gets a body only if the original inlined it into another function in the same TU: run `unused_stub_test`; if emptying the body changes no target function, the body is dead code and is rejected."),
      `Diagnostic allowance. Per hypothesis: at most 6 build-or-capture runs and at most 6 compiler-source reads or searches. Per attempt: at most three hypotheses, and leave enough of the attempt to validate and submit. A supported hypothesis continues only within these limits. A residual counts as new only when its measured diff (instructions, relocations or data) changed because of a non-probe edit; probes never reset the allowance.${has("mwcc_alloc_compare_sources") ? " A `mwcc_alloc_compare_sources` call counts as one run." : ""} The permuter is a locator: at most one \`source_permuter_run\` per hypothesis, \`max_iters\` at most 200, counted as one run; explain any hit (steps 4-6) before using it.`,
      "When you stop without done, record: the residual, what you measured, the construct kinds it points to, the candidates you checked and why each failed, and untried leads (the submission note's `residual`, `hypotheses` and `untried_leads`). That record is the next worker's starting point.",
      ...when(
        v.sms,
        `\`previous_attempt variant="unverified_match"\`: the code scores 100% but is not certified. The block is a short summary, not a list of approved code: nothing in the current source is certified, including edits it omits (it gives total_edits and omitted_edits). Read full_report_locator and the source at trusted_base_rev; if either is unavailable, record that and do not treat omitted edits as approved. Compare the whole candidate against the trusted base first (${compareSources}). Attribute a compiler change to one edit only after an isolated with/without comparison of that edit; report edits that interact (through CSE or allocation) as interacting. Then find the real construct for each (step 6) or remove the edit. Submit for fresh certification; a lower score that certifies is accepted. Any other \`previous_attempt\`: an earlier match on this function was rolled back because it relied on probes, a dead UNUSED body or an out-of-order fill; it lists what was removed and the rule it broke: do not repeat it.`,
        `\`steering_probe\`: the probe edits the gate found, the match without them, and compiler_delta when available (what those edits changed inside the compiler). Check that its function and revision match your target. If compiler_delta is missing or stale, run ${compareSources} yourself when this unit's compiler supports it. If it is marked unavailable, record the reason and continue from the assembly and other evidence; do not retry a known unsupported capture. Missing compiler data is not evidence that a construct is absent.`,
      ),
    ]),
  ]);
}

function compilerSection(v: WorkerPromptVariant) {
  const search = v.tools.includes("real_code_evidence")
    ? "search it with `real_code_evidence`, command `compiler`"
    : "search it with the sandbox grep and read tools under ../mwcc";
  return section("compiler", [
    `The compiler is decompiled (rayanht/mwcc). The pinned source is at ../mwcc; ${search}. Measured facts for this compiler are in the decomp standards. Start at these entry points and follow references your written hypothesis needs, within the diagnostic allowance:`,
    bulletList([
      "registers: src/backend/Coloring.c, InterferenceGraph.c, Registers.c, CodeGen.c",
      "instruction selection: src/backend/InstrSelection.c, Peephole.c",
      "inlining: src/frontend/CInline.c",
      "loads, CSE, propagation: src/optimizer/IroCSE.c, IroPropagate.c",
      "instruction order: src/backend/Scheduler.c",
      "frame: src/backend/StackFrameEABI.c",
    ]),
    "Native trace points by compiler version (an unlisted point is unavailable, never empty):",
    bulletList([...v.tracePoints]),
  ]);
}

function toolNotesSection(v: WorkerPromptVariant) {
  const has = (tool: string) => v.tools.includes(tool);
  return section("tool_notes", [
    bulletList([
      item("Reading a diff:", [
        bulletList([
          "`checkdiff_run` with `full_diff` compiles the owning translation unit and returns up to 24 mismatching rows, each with a kind (argument mismatch, opcode change, missing or extra instruction) and both sides: left is the target, right is your compile. Classify from the rows, not from the percent: above 99.9% can be one register swap that needs restructuring; below 95% can be one struct fix away.",
          "`checkdiff_summary` returns PASS/FAIL for the target and its neighbors without rows, to confirm neighbors after an edit. `direct_compile_tu` compiles without comparing, to separate does-not-build from builds-but-differs; pass exactly one of `function` or `unit`.",
        ]),
      ]),
      item("Relocations and data:", [
        bulletList([
          "When instruction rows match but the strict score does not, the residual is a symbol, a `.sdata2` constant identity or order, a binding, or section ownership. Use `direct_compile_tu`, then objdump or readelf on the object; `review_lint_sdata2_order_helper` only for pure `.sdata2` ordering. Allocator experiments cannot move a relocation.",
          "For data layout, account for exact bytes, offsets, binding, alignment, strings, generated tables and relocations first; reconstruct the whole layout, make one coordinated edit, and verify raw bytes, relocations, consumers and neighbors.",
        ]),
      ]),
      item("Compiler captures:", [
        bulletList([
          ...when(has("mwcc_alloc_compare_sources"), "`mwcc_alloc_compare_sources` compiles two variants (your working tree, the trusted base, or with/without one edit) with the traced compiler and lists decision changes (nodes, degrees, coalescing, colour order, registers, spills, inline verdicts, CSE temps, frame slots); it reports a mismatch instead of a diff when the traced object differs from the stock one."),
          "`mwcc_alloc_compare` compares two coloring snapshots; `pair` captures are two stages of one compile, not candidate versus target.",
          "`mwcc_alloc_analyze` modes `provenance`, `explain`, `inverse`, `source-rank`, `stack` and `origins` read `capture=trace` (qemu backend; full detail can take minutes). Require baseline replay agreement; a modeled solver witness does not prove a source match.",
        ]),
      ]),
      item("The permuter:", [
        bulletList([
          "Limit `source_permuter_run`'s `mutate_functions` to the hypothesis' region. It returns a scalar score and one source diff, no rows: replay the candidate with `source_permuter_replay`, then read its instruction delta with `checkdiff_run` and `full_diff`. Never adopt a candidate on score alone; a search that finds nothing better is not a reason to run a bigger one. `source_mutation_preview` shows what a mutation pass would change without compiling.",
        ]),
      ]),
      item("Read payloads, not envelopes:", [
        bulletList([
          "Several tools return an outer `status: ok` around a nested `exit_code: 1`, `file_not_found`, `unknown function`, `unavailable` or an empty result. Read the payload before drawing a conclusion.",
          "A permuter \"function not found at its source path\" is a bad invocation; a stale checkdiff result after an edit means the service did not recompile: fix or rerun before reasoning.",
        ]),
      ]),
      item("References:", [
        bulletList([
          `Callers, callees and instruction-shape analogs arrive in the target block's \`related_functions\`${has("graph_related_functions") ? "; `graph_related_functions` (pass `unit` and `symbol`) returns them, data references and cross-references for any function" : ""}${has("code_graph_file_card") ? ", and `code_graph_file_card` the file's match status and history" : ""}.`,
          "`asm_window_search` finds a function with a similar 32-instruction construct; similarity is not provenance. `m2c_decompile` is a reading scaffold.",
        ]),
      ]),
    ]),
  ]);
}

function keptAdvisoriesItem(mode: keyof typeof KEPT_ADVISORIES_LEAD, policy: StackFramePolicy) {
  return item(KEPT_ADVISORIES_LEAD[mode], [
    bulletList([
      "`kept_advisories`: array of `{ rule_id, file, line, justification }`.",
      "Write one entry per finding, copying its `rule_id`, `file`, and `line`. Each entry is matched only to the finding at its own `file` and `line`, so when one reason covers several findings, repeat it in each entry.",
      KEPT_EVIDENCE[policy],
    ]),
  ]);
}

function submissionSection(v: WorkerPromptVariant) {
  return section("submission", [
    "Submit by ending your turn with a JSON note: when the target is done, when you have a validated improvement to checkpoint, or when you stop (see the definition of done). The runner validates the submission against the target and its neighbors, checkpoints it, and returns the result to you. The note is not a report; it is the validation input. Use plain fields such as `summary`: Here is what I tried. When you discover a required path outside your approved write set, call `request_write_set_widening` with `paths`, `reason`, and optional `evidence` before editing it. The tool immediately returns `approved_paths`, denials with guidance, `write_set_after`, and the mode. Continue only with approved paths present in `write_set_after`; a shadow-mode decision is not applied.",
    bulletList([
      item("Also include these fields; they are joined into the target's history and shown to whoever works on this target next:", [
        bulletList([
          "`residual`: `{ class, rows, mechanism, resolved }` — the residual class (method step 1), the mismatching rows, the compiler decision you measured (or `unknown`), and whether it is resolved.",
          "`hypotheses`: array of `{ construct, evidence, prediction, measured, held }` — each hypothesis you tested, what you measured, and whether its prediction held.",
          "`untried_leads`: string array — what the next worker should try first.",
          `\`best_checkpoint\`: \`{ score, description }\` — the state worth restoring${v.sms ? " (the certified one, when there is one)" : ""}.`,
          "`evidence_locators`: string array — the `attempt://`, `pr://`, and `code://` locators your findings rest on.",
        ]),
      ]),
      ...(v.advisory === "off" ? [] : [keptAdvisoriesItem(v.advisory, v.policy)]),
      item("When widening is enabled and the approved write set is insufficient, add a `widening_request` object to the submission JSON with this shape:", [
        bulletList([
          "`schema_version`: `write_set_widening_request_v1`",
          "`paths`: repo-relative string array containing paths from one requested category",
          "`category`: `config-metadata`, `owning-header`, or `foreign-source`",
          "`rung`: `2`, `3`, or `4`, matching the requested category",
          item("`evidence`:", [
            bulletList([
              "`mismatched_declaration`: `{ symbol, current, required, expected_owner }`",
              "`objdiff`: `{ unit, score_without, score_with, artifact_path? }`, where `score_with` may be null when it could not be measured",
              "`ladder_evidence`: `{ rung1_in_slice, rung2_config?, rung3_header? }`, explaining what each lower rung tried and why it failed",
            ]),
          ]),
          "A `widening_request` is only honored when write-set widening is enabled. Requested paths remain unauthorized unless the runner approves them.",
        ]),
      ]),
    ]),
    "After a submission, the runner tells you what it established: validated and checkpointed, or rejected with reasons. A repair request only comes for validation/lint failures or for an exact match that failed hard gates.",
  ]);
}

function contractedInRulesSection(v: WorkerPromptVariant) {
  return section("contracted_in_rules", [
    orderedList([
      "Work only on the current claimed target; the target translation unit is your motivation and review scope.",
      'Edit only paths in your approved write set, which initially contains only the target_file block\'s `path`.',
      `Before requesting any widening, first try typing the in-slice code to the foreign types already present on \`${v.baseRef}\`.`,
      "If that measurably fails and a canonical fix elsewhere is required, call `request_write_set_widening` before editing that path. The submission note's `widening_request` remains available and takes the mismatched declaration, objdiff evidence, expected owner, and evidence explaining why each lower rung failed.",
      "Never add local shims—aliases, local prototypes, or include-macro rewrites—as a substitute for the canonical fix.",
      "Preserve pre-existing dirty work. Undo only your own failed attempt hunks.",
      item("Do not use destructive commands:", [
        bulletList([
          "Whole-file reset, restore, checkout, or clean",
          "Repo-level reset, restore, checkout, or clean",
          "Equivalent commands with the same effect",
        ]),
      ]),
      "Validate retained edits with narrow build/objdiff/checkdiff/review evidence. Use `checkdiff_run` or `checkdiff_summary` for function diff evidence; do not run raw `tools/asm-differ/diff.py` from shell.",
      "`powerpc-eabi-objdump`, `powerpc-eabi-nm`, `powerpc-eabi-readelf`, `dtk`, `objdiff-cli`, `wibo`, and the compilers are on PATH in your sandbox; call them by name and do not search the filesystem for tools.",
      "Do not run broad filesystem `find` sweeps such as `find /`, `find /Users`, `find /opt`, `find /Applications`, or upward `find ../../..`; use narrow searches inside the worker checkout (and ../mwcc) only.",
      "`m2c_decompile` is a live scaffold generator, not a changing fact lookup. Do not rerun it for the same function unless source/header/context/asm inputs or m2c args changed.",
      "`source_permuter_run` runs inside the claim sandbox, defaults to all sandbox cores, and has no cross-worker queue.",
      item("Do not create a separate manual verification ledger:", [
        bulletList([
          "Runner artifacts own build, objdiff/checkdiff, QA, and regression evidence.",
          "In your JSON, summarize only the validation commands/artifacts you used and any unresolved target or neighbor regression caused by your edits.",
          "Never ask the runner to validate an unresolved local regression caused by your edits.",
        ]),
      ]),
      "Do not run global progress-report refreshes from a worker.",
    ]),
  ]);
}

function functionPrompt(v: WorkerPromptVariant) {
  return definePrompt({
    id: `${v.gameId}.worker.system`,
    title: `${v.displayName} Worker System Prompt`,
    archetype: "workflow",
    nodes: [
      goalSection(v),
      definitionOfDoneSection(v),
      stackFramePolicySection(v),
      ...(orderingActive(v.ordering) ? [orderAndScopeSection(v)] : []),
      thinkingSection(),
      contextContractSection(v),
      methodSection(v),
      compilerSection(v),
      toolNotesSection(v),
      submissionSection(v),
      contractedInRulesSection(v),
    ],
  });
}

function sectionTargetPrompt(gameId: string, displayName: string) {
  return definePrompt({
    id: `${gameId}.worker.section.system`,
    title: `${displayName} Worker Section Target System Prompt`,
    archetype: "workflow",
    nodes: [
      section("goal", [
        bulletList([
          "Bring the named section of this translation unit to an exact match by defining or completing the remaining data symbols in its C file.",
          "The target symbol is the section name, and `fuzzy_match_percent` is that section's match percent.",
        ]),
      ]),
      section("definition_of_done", [
        bulletList([
          "The runner validates the claimed section as exact.",
          "Already-exact functions and sibling sections do not regress.",
        ]),
      ]),
      section("context_contract", [
        usesContext("worker-packet", {
          instructions: [
            "Use the injected target (with its source file and related functions), first diff, standards and repair request as the authoritative task packet.",
            "The proposed_name_view block is current source with guessed function names and a canonical-symbol footer. Use it to notice missing or inconsistent behavior, then verify the hypothesis in canonical source and compiler output. Data-section labels and fields are not substituted.",
            "Use knowledge_render_file to read other source/header files or refresh after edits. Before patching, read the canonical file; use original symbols in edits, tool arguments, and citations. Guessed names are reading aids, not recovered identifiers.",
            "Treat current source, headers, symbols, assembly, objdiff, and validation output as stronger evidence than any historical summary.",
          ],
        }),
        usesContext("target-knowledge", {
          instructions: [
            "Use the knowledge card for nearby solved data, prior runs on this section, and data-layout clues.",
            "Verify every historical clue against the target object, local source, or validation output.",
          ],
        }),
      ]),
      section("workflow_context", [
        section(
          "phase",
          [
            bulletList([
              "Read the target object's data with the available diff tools and the repository's disassembly or reference material.",
              "Account for exact bytes, offsets, binding, alignment, strings, generated tables, and relocations before editing; reconstruct the whole layout, then make one coordinated edit.",
              "Transcribe initializers for `.data`, `.rodata`, `.sdata`, and `.sdata2` into the translation unit's C file.",
              "Order float and double constants to match the `.sdata2` pool order.",
              "For `.bss`, declare the correct symbols with the correct types, sizes, and order. `.bss` has no initializers.",
              "Build and compare after focused edits. Use checkdiff or the objdiff summary at unit level, and verify raw bytes and relocations, not only the percent.",
            ]),
          ],
          { attrs: { id: "1", name: "data_matching" } },
        ),
      ]),
      section("contracted_in_rules", [
        orderedList([
          "Work only on the claimed section and edit only paths in the approved write set.",
          "Do not regress already-exact functions or sibling sections.",
          "Preserve storage class and qualifiers. Changing `static` versus global declarations can change section placement.",
          "Do not use m2c decompile, the permuter, or the compiler allocator tools for section targets. Those tools are function-oriented.",
          "Rely on direct file editing plus build-and-compare evidence from checkdiff or the objdiff summary at unit level.",
        ]),
      ]),
    ],
  });
}

type VariantOptions = Pick<
  WorkerPromptOptions,
  "game" | "advisoryAdjudication" | "stackFramePolicy" | "steeringGate" | "ordering" | "toolIds" | "baseRef" | "registries" | "compilerCapabilities"
>;

function promptVariant(options: VariantOptions): WorkerPromptVariant {
  const steering = workerSteeringGate(options);
  return {
    gameId: workerGameId(options),
    displayName: workerGameDisplayName(options),
    policy: workerStackFramePolicy(options),
    advisory: options.advisoryAdjudication ?? "off",
    sms: steeringGateEnforced(steering),
    melee: steering === "off",
    ordering: workerOrdering(options),
    tools: workerPromptToolIds(options),
    baseRef: workerBaseRef(options),
    registries: workerRegistries(options),
    tracePoints: tracePointAvailabilityLines(workerCompilerCapabilities(options)),
  };
}

type WorkerPromptDocument = ReturnType<typeof functionPrompt>;

const functionPrompts = new Map<string, WorkerPromptDocument>();
const sectionPrompts = new Map<string, WorkerPromptDocument>();

function functionPromptFor(options: VariantOptions): WorkerPromptDocument {
  const variant = promptVariant(options);
  const key = JSON.stringify(variant);
  let selected = functionPrompts.get(key);
  if (!selected) {
    selected = functionPrompt(variant);
    functionPrompts.set(key, selected);
  }
  return selected;
}

function sectionPromptFor(options: Pick<WorkerPromptOptions, "game">): WorkerPromptDocument {
  const gameId = workerGameId(options);
  let selected = sectionPrompts.get(gameId);
  if (!selected) {
    selected = sectionTargetPrompt(gameId, workerGameDisplayName(options));
    sectionPrompts.set(gameId, selected);
  }
  return selected;
}

/** The typed default: Melee's worker prompt (the catalog's game), resolved from its descriptor. */
export const prompt = functionPromptFor({ game: { gameId: "melee" } });

function isSectionTarget(packet: Record<string, unknown>): boolean {
  const target = packet.target;
  if (!target || typeof target !== "object" || Array.isArray(target)) return false;
  const targetRecord = target as Record<string, unknown>;
  if (targetRecord.kind === "section") return true;
  if (targetRecord.kind === "function") return false;
  return String(targetRecord.symbol ?? "").startsWith(".");
}

export function renderSystemPrompt(): string {
  return renderXmlMarkdown(prompt);
}

/**
 * The system prompt document a worker gets: the section-target prompt, or the
 * function prompt for the game's stack frame policy, the advisory mode, the
 * game's steering gate and ordering modes, its tools, base ref, registries and
 * the traced compiler's trace points.
 */
export function workerSystemPromptDocument(
  options: Pick<WorkerPromptOptions, "packet"> & VariantOptions,
): WorkerPromptDocument {
  return isSectionTarget(options.packet) ? sectionPromptFor(options) : functionPromptFor(options);
}

export function workerPrompt(options: WorkerPromptOptions): PiPromptBundle {
  return {
    systemPrompt: renderXmlMarkdown(workerSystemPromptDocument(options)),
    userPrompt: "",
    systemTemplatePath: agentFilePath(),
    userTemplatePath: promptFilePath(),
    kernelContext: buildWorkerKernelContext(options),
  };
}
