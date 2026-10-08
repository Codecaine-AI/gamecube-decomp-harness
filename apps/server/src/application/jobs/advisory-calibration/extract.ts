// `extract` (plan §6.9, bootstrap step 1): the real justification of every
// real item, read from its checkpoint's note by ExtractCheckpointKnowledge, one
// call per checkpoint. Items without a note get a null justification and no
// call. Each finished checkpoint is appended to extractions.jsonl at once and
// a failed call records nothing, so a rerun resumes where the last one stopped.
import { resolve } from "node:path";

import type { FakeCallRequest } from "@agent-kernel/kernel/model-nodes/testing";
import type { CheckpointKnowledge } from "@server/generated/baml_client/types";
import { NODE_CALL_MANIFESTS, NODE_CALL_MODEL } from "@server/infrastructure/kernel/nodes/functions.js";
import type { NodeCalls } from "@server/infrastructure/kernel/nodes/node-kernel.js";

import { findingRefOf } from "./advisory-case.js";
import { assertKnownFlags, engineFlag, integerFlag, stringFlag, type CalibrationArgs } from "./args.js";
import { fakeExtractCheckpointKnowledge } from "./fake-extractor.js";
import { openCalibrationKernel, seededParentIds, type CalibrationKernel } from "./kernels.js";
import { callRequestId, nodePromptHash } from "./request-ids.js";
import { appendJsonl, DEFAULT_CALIBRATION_DIR, loadDataset } from "./store.js";
import type { CalibrationItem, ExtractionRecord, NoteRecord } from "./types.js";

const EXTRACT_FUNCTION = "ExtractCheckpointKnowledge";
/** The kernel's default call reasoning, passed explicitly so the requestId digest names it. */
const EXTRACT_REASONING = "low";

export interface ExtractSummary {
  /** Real items with an extraction after the run. */
  extracted: number;
  /** Real items still without one. */
  missing: number;
  /** Model calls made (0 for replay). */
  calls: number;
  failed: number;
  /** Extraction records appended. */
  written: number;
}

interface Checkpoint {
  note: NoteRecord;
  items: CalibrationItem[];
}

function isCallError(error: unknown): error is Error & { runId: string; failure: { kind: string } } {
  return (
    error instanceof Error &&
    error.name === "KernelCallError" &&
    typeof (error as { failure?: { kind?: unknown } }).failure?.kind === "string"
  );
}

async function fakeRespond() {
  const testing = await import("@agent-kernel/kernel/model-nodes/testing");
  return (request: FakeCallRequest<NodeCalls>) => {
    if (request.name !== EXTRACT_FUNCTION) {
      return testing.fakeFailure({ kind: "other", message: `extract does not call ${request.name}` });
    }
    const [note, findings] = request.args as Parameters<typeof fakeExtractCheckpointKnowledge>;
    return testing.fakeOk(fakeExtractCheckpointKnowledge(note, findings));
  };
}

export async function extractCommand(args: CalibrationArgs, print: (line: string) => void = console.log): Promise<ExtractSummary> {
  assertKnownFlags(args, ["--engine", "--dir", "--limit", "--db"]);
  const engine = engineFlag(args);
  const limit = integerFlag(args, "--limit");
  const dbPath = stringFlag(args, "--db");
  const dataset = loadDataset(stringFlag(args, "--dir") ?? DEFAULT_CALIBRATION_DIR);
  const real = dataset.items.filter((item) => !item.synthetic);
  const pending = real.filter((item) => !dataset.extractions.has(item.id));

  const withoutNote: CalibrationItem[] = [];
  const byNote = new Map<string, Checkpoint>();
  for (const item of pending) {
    const note = item.note_key === null ? undefined : dataset.notes.get(item.note_key);
    if (!note) {
      withoutNote.push(item);
      continue;
    }
    const checkpoint = byNote.get(note.key) ?? { note, items: [] };
    checkpoint.items.push(item);
    byNote.set(note.key, checkpoint);
  }
  const checkpoints = [...byNote.keys()].sort().map((key) => byNote.get(key)!);
  const planned = limit === undefined ? checkpoints : checkpoints.slice(0, limit);

  if (engine === "replay") {
    print(
      `extract (replay): ${real.length - pending.length}/${real.length} real items have extractions; ` +
        `${pending.length} lack one (${checkpoints.length} checkpoints with a note, ${withoutNote.length} items without a note); nothing written`,
    );
    return { extracted: real.length - pending.length, missing: pending.length, calls: 0, failed: 0, written: 0 };
  }

  let written = 0;
  const record = (row: ExtractionRecord) => {
    appendJsonl(dataset.paths.extractions, row);
    written += 1;
  };
  for (const item of withoutNote) {
    record({
      id: item.id,
      justification: null,
      evidence: [],
      kept: false,
      structured_field_used: false,
      source: "extract",
      extracted_at: new Date().toISOString(),
    });
  }

  let calls = 0;
  let failed = 0;
  if (planned.length > 0) {
    const calibration: CalibrationKernel = await openCalibrationKernel({
      engine,
      label: "extract",
      ...(dbPath !== undefined && { dbPath }),
      parent: seededParentIds("extract", `${resolve(dataset.paths.dir)}\n${engine}`),
      ...(engine === "fake" && { fake: { respond: await fakeRespond() } }),
    });
    // The live kernel has no aliases, so the manifest's model is the one the call runs on.
    const model = engine === "live" ? NODE_CALL_MANIFESTS[EXTRACT_FUNCTION].model ?? NODE_CALL_MODEL : undefined;
    try {
      for (const [index, { note, items }] of planned.entries()) {
        const sorted = [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
        let runId: string | undefined;
        let knowledge: CheckpointKnowledge;
        calls += 1;
        const args: [string, ReturnType<typeof findingRefOf>[]] = [note.text, sorted.map(findingRefOf)];
        try {
          knowledge = await calibration.kernel.call(EXTRACT_FUNCTION, args, {
            parentRunId: calibration.parentRunId,
            trigger: "post-run",
            reasoning: EXTRACT_REASONING,
            requestId: callRequestId("calibration-extract", note.key, {
              engine,
              parentRunId: calibration.parentRunId,
              name: EXTRACT_FUNCTION,
              args,
              reasoning: EXTRACT_REASONING,
              promptHash: await nodePromptHash(),
            }),
            onNodeStarted: (nodeIds) => {
              runId = nodeIds.runId;
            },
          });
        } catch (error) {
          if (!isCallError(error)) throw error;
          failed += 1;
          print(`[${index + 1}/${planned.length}] ${note.key}: ${error.message} (run ${error.runId}); not recorded`);
          continue;
        }
        const byFinding = new Map((knowledge.advisories ?? []).map((advisory) => [advisory.finding_id, advisory]));
        let justified = 0;
        for (const item of sorted) {
          const advisory = byFinding.get(item.id);
          const justification = typeof advisory?.justification === "string" && advisory.justification.trim() ? advisory.justification : null;
          if (justification !== null) justified += 1;
          record({
            id: item.id,
            justification,
            evidence: Array.isArray(advisory?.evidence) ? advisory.evidence : [],
            kept: advisory?.kept === true,
            structured_field_used: knowledge.structured_field_used === true,
            source: "extract",
            ...(model !== undefined && { model }),
            ...(runId !== undefined && { run_id: runId }),
            extracted_at: new Date().toISOString(),
          });
        }
        print(`[${index + 1}/${planned.length}] ${note.key}: ${justified}/${sorted.length} findings justified`);
      }
    } finally {
      await calibration.close();
    }
    if (engine === "live" && dbPath === undefined) print(`kernel database: ${calibration.dbPath}`);
  }

  const missing = pending.length - written;
  print(
    `extract (${engine}): ${calls} model calls (${failed} failed), ${written} extractions written` +
      ` (${withoutNote.length} without a note); ${real.length - missing}/${real.length} real items extracted, ${missing} remaining`,
  );
  return { extracted: real.length - missing, missing, calls, failed, written };
}
