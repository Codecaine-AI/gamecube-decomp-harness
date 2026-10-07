// `bootstrap-labels` (plan §6.9, bootstrap steps 2 and 3):
// - a label proposal for every extracted real item: LabelAdvisoryJustification
//   on the manifest's model (codex-lb/gpt-6.1-sol) at reasoning "high"; an
//   item without a justification is proposed `unjustified` with no call;
// - with --synthesize <n>, one GOOD and one BAD SynthesizeJustification for
//   each of n real hunks, appended to synthetic.jsonl as synthetic items. The
//   hunks come from selection groups first and never from held-out groups, so
//   no held-out hunk shapes threshold selection.
// Proposals only help the human reviewer; they never count as labels.
import { resolve } from "node:path";

import type { FakeCallRequest } from "@agent-kernel/kernel/model-nodes/testing";
import type {
  AdvisoryCase,
  AdvisoryLabelProposal,
  JustificationQuality,
  SynthesizedJustification,
} from "@server/generated/baml_client/types";
import { LABEL_ADVISORY_MODEL, LABEL_ADVISORY_REASONING } from "@server/infrastructure/kernel/nodes/functions.js";
import type { NodeCalls } from "@server/infrastructure/kernel/nodes/node-kernel.js";

import { advisoryCaseOf } from "./advisory-case.js";
import { assertKnownFlags, engineFlag, integerFlag, stringFlag, type CalibrationArgs } from "./args.js";
import { openCalibrationKernel, seededParentIds, type CalibrationKernel } from "./kernels.js";
import { callRequestId, nodePromptHash } from "./request-ids.js";
import { appendJsonl, DEFAULT_CALIBRATION_DIR, justificationOf, loadDataset, sha256Hex, type CalibrationDataset } from "./store.js";
import type { CalibrationItem, ProposalRecord, ProposedLabel } from "./types.js";

const LABEL_FUNCTION = "LabelAdvisoryJustification";
const SYNTHESIZE_FUNCTION = "SynthesizeJustification";
/** The kernel's default call reasoning, passed explicitly so the requestId digest names it. */
const SYNTHESIZE_REASONING = "low";
export const NO_JUSTIFICATION_RATIONALE = "No justification was extracted from the note.";
/** `model` of a proposal made without a model call. */
const NO_MODEL = "none";
const QUALITIES = ["good", "bad"] as const;
type Quality = (typeof QUALITIES)[number];
const PROPOSED_LABELS: readonly ProposedLabel[] = ["justified", "unjustified", "unclear"];
/** What the fake labeller treats as a concrete matching reason. */
const FAKE_EVIDENCE = /objdiff|register|offset|instruction|stack|checkdiff/i;

export interface BootstrapSummary {
  proposals: number;
  synthetic: number;
  /** Model calls made (0 for replay). */
  calls: number;
  failed: number;
}

export function syntheticItemId(sourceId: string, quality: Quality): string {
  return `syn-${sha256Hex(`${sourceId}\n${quality}`).slice(0, 20)}`;
}

function byId(a: CalibrationItem, b: CalibrationItem): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function isCallError(error: unknown): error is Error & { runId: string; failure: { kind: string } } {
  return (
    error instanceof Error &&
    error.name === "KernelCallError" &&
    typeof (error as { failure?: { kind?: unknown } }).failure?.kind === "string"
  );
}

/**
 * The real items to synthesize for, in order: with a hunk, sorted by id; once
 * split.json exists, items of selection groups first, then items the split has
 * not seen yet, and never an item of a held-out group.
 */
export function synthesisSources(dataset: CalibrationDataset): CalibrationItem[] {
  const candidates = dataset.items.filter((item) => !item.synthetic && item.hunk !== null).sort(byId);
  const split = dataset.split;
  if (!split) return candidates;
  const sideOf = (item: CalibrationItem) => {
    const group = split.items[item.id];
    return group === undefined ? undefined : split.components[group];
  };
  return [
    ...candidates.filter((item) => sideOf(item) === "selection"),
    ...candidates.filter((item) => sideOf(item) === undefined),
  ];
}

function fakeSynthesis(advisory: AdvisoryCase, quality: Quality): SynthesizedJustification {
  const { finding } = advisory;
  if (quality === "good") {
    return {
      justification:
        `Kept the ${finding.rule_id} code at ${finding.file}:${finding.line}: objdiff shows the cleaner form ` +
        "reorders the load instruction and shifts the stack offset, so the original codegen needs it.",
      rationale: "Fake: cites a concrete objdiff, instruction and stack-offset reason.",
    };
  }
  return {
    justification: `Kept the ${finding.rule_id} code at line ${finding.line} because it reads more naturally this way.`,
    rationale: "Fake: a style preference with no reason tied to matching the binary.",
  };
}

async function fakeRespond() {
  const testing = await import("@agent-kernel/kernel/model-nodes/testing");
  return (request: FakeCallRequest<NodeCalls>) => {
    if (request.name === LABEL_FUNCTION) {
      const [advisory] = request.args as [AdvisoryCase];
      const justified = FAKE_EVIDENCE.test(advisory.justification ?? "");
      return testing.fakeOk({
        label: justified ? "JUSTIFIED" : "UNJUSTIFIED",
        rationale: justified
          ? "Fake: the justification names a concrete matching reason."
          : "Fake: the justification names no concrete matching reason.",
      });
    }
    if (request.name === SYNTHESIZE_FUNCTION) {
      const [advisory, quality] = request.args as [AdvisoryCase, JustificationQuality];
      return testing.fakeOk(fakeSynthesis(advisory, String(quality) === "GOOD" ? "good" : "bad"));
    }
    return testing.fakeFailure({ kind: "other", message: `bootstrap-labels does not call ${request.name}` });
  };
}

function proposedLabel(proposal: AdvisoryLabelProposal | null | undefined): ProposedLabel | null {
  const label = typeof proposal?.label === "string" ? (proposal.label as string).toLowerCase() : "";
  return PROPOSED_LABELS.includes(label as ProposedLabel) ? (label as ProposedLabel) : null;
}

export async function bootstrapLabelsCommand(args: CalibrationArgs, print: (line: string) => void = console.log): Promise<BootstrapSummary> {
  assertKnownFlags(args, ["--engine", "--dir", "--limit", "--synthesize", "--db"]);
  const engine = engineFlag(args);
  const limit = integerFlag(args, "--limit");
  const synthesize = integerFlag(args, "--synthesize") ?? 0;
  const dbPath = stringFlag(args, "--db");
  const dataset = loadDataset(stringFlag(args, "--dir") ?? DEFAULT_CALIBRATION_DIR);

  const unproposed = dataset.items
    .filter((item) => !item.synthetic && dataset.extractions.has(item.id) && !dataset.proposals.has(item.id))
    .sort(byId);
  const toPropose = limit === undefined ? unproposed : unproposed.slice(0, limit);
  const toSynthesize = synthesisSources(dataset)
    .slice(0, synthesize)
    .flatMap((item) => QUALITIES.map((quality) => ({ item, quality, id: syntheticItemId(item.id, quality) })))
    .filter((job) => !dataset.byId.has(job.id));
  const labelCalls = toPropose.filter((item) => justificationOf(item, dataset.extractions) !== null).length;

  if (engine === "replay") {
    print(
      `bootstrap-labels (replay): ${dataset.proposals.size} proposals recorded; ${unproposed.length} extracted real items unproposed ` +
        `(${labelCalls} would need a model call in this run); ${toSynthesize.length} synthetic items would be written; nothing written`,
    );
    return { proposals: 0, synthetic: 0, calls: 0, failed: 0 };
  }

  let proposals = 0;
  let synthetic = 0;
  let calls = 0;
  let failed = 0;
  const propose = (row: ProposalRecord) => {
    appendJsonl(dataset.paths.proposals, row);
    proposals += 1;
  };
  const report = (what: string, error: Error & { runId: string }) => {
    failed += 1;
    print(`${what}: ${error.message} (run ${error.runId}); not recorded`);
  };

  for (const item of toPropose) {
    if (justificationOf(item, dataset.extractions) !== null) continue;
    propose({ id: item.id, label: "unjustified", rationale: NO_JUSTIFICATION_RATIONALE, model: NO_MODEL, proposed_at: new Date().toISOString() });
  }

  if (labelCalls > 0 || toSynthesize.length > 0) {
    const calibration: CalibrationKernel = await openCalibrationKernel({
      engine,
      label: "bootstrap-labels",
      ...(dbPath !== undefined && { dbPath }),
      parent: seededParentIds("bootstrap-labels", `${resolve(dataset.paths.dir)}\n${engine}`),
      ...(engine === "fake" && { fake: { respond: await fakeRespond() } }),
    });
    try {
      for (const item of toPropose) {
        const justification = justificationOf(item, dataset.extractions);
        if (justification === null) continue;
        let runId: string | undefined;
        let proposal: AdvisoryLabelProposal;
        calls += 1;
        const args: [AdvisoryCase] = [advisoryCaseOf(item, justification)];
        try {
          proposal = await calibration.kernel.call(LABEL_FUNCTION, args, {
            parentRunId: calibration.parentRunId,
            trigger: "system",
            reasoning: LABEL_ADVISORY_REASONING,
            requestId: callRequestId("calibration-label", item.id, {
              engine,
              parentRunId: calibration.parentRunId,
              name: LABEL_FUNCTION,
              args,
              reasoning: LABEL_ADVISORY_REASONING,
              promptHash: await nodePromptHash(),
            }),
            onNodeStarted: (ids) => {
              runId = ids.runId;
            },
          });
        } catch (error) {
          if (!isCallError(error)) throw error;
          report(`propose ${item.id}`, error);
          continue;
        }
        const label = proposedLabel(proposal);
        if (label === null) {
          failed += 1;
          print(`propose ${item.id}: unknown label ${String(proposal?.label)}; not recorded`);
          continue;
        }
        propose({
          id: item.id,
          label,
          rationale: typeof proposal.rationale === "string" ? proposal.rationale : "",
          model: LABEL_ADVISORY_MODEL,
          ...(runId !== undefined && { run_id: runId }),
          proposed_at: new Date().toISOString(),
        });
      }

      for (const { item, quality, id } of toSynthesize) {
        let generated: SynthesizedJustification;
        calls += 1;
        try {
          const args: [AdvisoryCase, JustificationQuality] = [advisoryCaseOf(item, null), quality.toUpperCase() as unknown as JustificationQuality];
          generated = await calibration.kernel.call(SYNTHESIZE_FUNCTION, args, {
            parentRunId: calibration.parentRunId,
            trigger: "system",
            reasoning: SYNTHESIZE_REASONING,
            requestId: callRequestId("calibration-synthesize", `${item.id}:${quality}`, {
              engine,
              parentRunId: calibration.parentRunId,
              name: SYNTHESIZE_FUNCTION,
              args,
              reasoning: SYNTHESIZE_REASONING,
              promptHash: await nodePromptHash(),
            }),
          });
        } catch (error) {
          if (!isCallError(error)) throw error;
          report(`synthesize ${id} (${quality}, from ${item.id})`, error);
          continue;
        }
        if (typeof generated?.justification !== "string" || !generated.justification.trim()) {
          failed += 1;
          print(`synthesize ${id} (${quality}, from ${item.id}): empty justification; not recorded`);
          continue;
        }
        const { fixture_p: _fixture, ...source } = item;
        const row: CalibrationItem = {
          ...source,
          id,
          source: "synthetic",
          synthetic: true,
          source_item_id: item.id,
          quality,
          justification: generated.justification,
          rationale: typeof generated.rationale === "string" ? generated.rationale : "",
        };
        appendJsonl(dataset.paths.synthetic, row);
        synthetic += 1;
      }
    } finally {
      await calibration.close();
    }
    if (engine === "live" && dbPath === undefined) print(`kernel database: ${calibration.dbPath}`);
  }

  print(
    `bootstrap-labels (${engine}): ${calls} model calls (${failed} failed); ${proposals} proposals and ` +
      `${synthetic} synthetic items written; ${unproposed.length - proposals} extracted real items still unproposed`,
  );
  return { proposals, synthetic, calls, failed };
}
