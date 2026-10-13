import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildLibrarianV2KernelContext } from "./librarian-v2/context.js";
import { renderSystemPrompt as librarianSystemPrompt } from "./librarian-v2/prompt.js";
import { buildWorkerSummarizerKernelContext } from "./worker-summarizer/context.js";
import { renderSystemPrompt as summarizerSystemPrompt } from "./worker-summarizer/prompt.js";

const summarizerOptions = (gameId: string) => ({
  transcript: [],
  checkpointSubmissionDigest: { submissions: [] },
  targetCardReference: { id: "t", stable_key: "GMSJ01:MActor:calc" },
  game: { gameId },
});

const librarianOptions = (gameId: string) => ({
  task: { pathway: "run_closed", instruction: "Review the run." },
  object: {},
  touchedSubjects: [],
  supportingSubjects: [],
  decompStandards: [],
  game: { gameId },
});

describe("history-writing prompts under a stop_at_frame game", () => {
  test("worker summarizer context carries the stack policy block for SMS only", () => {
    const sms = buildWorkerSummarizerKernelContext(summarizerOptions("sms")).renderedContext;
    const melee = buildWorkerSummarizerKernelContext(summarizerOptions("melee")).renderedContext;
    expect(sms).toContain(`<stack_frame_policy value="stop_at_frame">`);
    expect(sms).toContain("record it only as rejected");
    expect(melee).not.toContain("stack_frame_policy");
    for (const text of [sms, melee]) expect(text).not.toMatch(/\{\{[A-Z_]+\}\}/);
    expect(summarizerSystemPrompt()).toContain("&lt;stack_frame_policy&gt; block");
  });

  test("librarian context carries the stack policy block for SMS only", () => {
    const sms = buildLibrarianV2KernelContext(librarianOptions("sms")).renderedContext;
    const melee = buildLibrarianV2KernelContext(librarianOptions("melee")).renderedContext;
    expect(sms).toContain(`<stack_frame_policy value="stop_at_frame">`);
    expect(melee).not.toContain("stack_frame_policy");
    for (const text of [sms, melee]) expect(text).not.toMatch(/\{\{[A-Z_]+\}\}/);
    expect(librarianSystemPrompt()).toContain("&lt;stack_frame_policy&gt; block");
  });

  test("pr-indexer routes stop_at_frame stack tactics to rejection notes", () => {
    const system = readFileSync(fileURLToPath(new URL("./pr-indexer/templates/system.md", import.meta.url)), "utf8");
    expect(system).toContain("stop_at_frame");
    expect(system).toContain("curator_handoff.rejection_notes");
  });
});
