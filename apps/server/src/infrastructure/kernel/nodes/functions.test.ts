import { beforeAll, describe, expect, test } from "bun:test";

import { bamlEngine } from "@agent-kernel/kernel/baml-engine";

import { LABEL_ADVISORY_MODEL, NODE_CALL_MANIFESTS, NODE_CALL_MODEL } from "./functions";
import type { NodeCalls } from "./node-kernel";

// Imported dynamically: a static import of the generated client stalls bun:test (see node-kernel.ts).
let baml: typeof import("@boundaryml/baml");
let client: NodeCalls;
let types: typeof import("@server/generated/baml_client/types");
let sources: Record<string, string>;

beforeAll(async () => {
  baml = await import("@boundaryml/baml");
  client = (await import("@server/generated/baml_client")).b;
  types = await import("@server/generated/baml_client/types");
  sources = (await import("@server/generated/baml_client/inlinedbaml")).getBamlFiles();
});

/** What the kernel's BAML engine treats as function names: capitalized methods of the client's prototype. */
function generatedFunctionNames(): string[] {
  const proto = Object.getPrototypeOf(client) as Record<string, unknown>;
  return Object.getOwnPropertyNames(proto)
    .filter((name) => /^[A-Z]/.test(name) && typeof proto[name] === "function")
    .sort();
}

/** A one-leaf registry that is never sent to: b.request renders without HTTP. */
function renderOptions() {
  const registry = new baml.ClientRegistry();
  registry.addLlmClient("KernelRender", "openai-responses", {
    base_url: "http://render.invalid/v1",
    api_key: "render-only",
    model: "render",
  });
  registry.setPrimary("KernelRender");
  return { clientRegistry: registry, env: { BAML_LOG: "error" } };
}

async function renderedText(request: Promise<{ body: { json(): any } }>): Promise<string> {
  const body = (await request).body.json();
  return body.input.flatMap((message: any) => message.content.map((part: any) => part.text)).join("\n");
}

describe("node call manifests", () => {
  test("engine manifests match generated functions", () => {
    const names = generatedFunctionNames();
    expect(names).toEqual([
      "ContractProbe",
      "ExtractCheckpointKnowledge",
      "ExtractConfirmedCheckpointKnowledge",
      "JudgeAdvisoryWithRationale",
      "LabelAdvisoryJustification",
      "SynthesizeJustification",
    ]);
    expect(Object.keys(NODE_CALL_MANIFESTS).sort()).toEqual(names);
    for (const [key, manifest] of Object.entries(NODE_CALL_MANIFESTS)) {
      expect(manifest.$schema).toBe("agent-kernel/call-v1");
      expect(manifest.name).toBe(key);
      expect(manifest.description.length).toBeGreaterThan(0);
      expect(manifest.model).toBe(key === "LabelAdvisoryJustification" ? LABEL_ADVISORY_MODEL : NODE_CALL_MODEL);
    }

    // The engine accepts the manifests and sees the same function set.
    const engine = bamlEngine({ client, baml, sources, manifests: NODE_CALL_MANIFESTS, retryPolicy: "KernelCallRetry" });
    const engineNames: string[] = [...engine.functionNames()].sort();
    expect(engineNames).toEqual(names);
    for (const name of engine.functionNames()) expect(engine.manifest(name)).toEqual(NODE_CALL_MANIFESTS[name]);
  });

  test("every prompt renders each input field it is given", async () => {
    const finding = {
      id: "F_ID_1",
      rule_id: "RULE_ID_1",
      severity: "warning" as const,
      file: "FILE_1.c",
      line: 4242,
      excerpt: "EXCERPT_1",
      message: "MESSAGE_1",
    };
    const advisory = {
      finding,
      detail: "DETAIL_1",
      hunk: "HUNK_1",
      justification: "JUSTIFICATION_1",
      code_facts: { exact: true, old_score: 12.5, new_score: 99.5 },
    };
    const findingMarkers = ["F_ID_1", "RULE_ID_1", "warning", "FILE_1.c:4242", "EXCERPT_1", "MESSAGE_1"];
    const subjectMarkers = ["RULE_ID_1", "FILE_1.c:4242", "EXCERPT_1", "MESSAGE_1", "DETAIL_1", "HUNK_1", "12.5", "99.5", "exact match"];

    const cases: Array<[string, Promise<{ body: { json(): any } }>, string[], string[]]> = [
      [
        "ExtractCheckpointKnowledge",
        client.request.ExtractCheckpointKnowledge("NOTE_1", [finding], renderOptions()),
        [...findingMarkers, "NOTE_1"],
        [],
      ],
      [
        "ExtractConfirmedCheckpointKnowledge",
        client.request.ExtractConfirmedCheckpointKnowledge(
          {
            unit: "UNIT_1",
            function_name: "FUNCTION_1",
            target_key: "TARGET_1",
            old_score: 12.5,
            new_score: 99.5,
            exact: true,
            note: "NOTE_1",
            hunks: ["HUNK_1", "HUNK_2"],
            advisories: [finding],
            prior_adjudication: "PRIOR_1",
          },
          renderOptions(),
        ),
        [...findingMarkers, "UNIT_1", "FUNCTION_1", "TARGET_1", "12.5", "99.5", "exact match", "NOTE_1", "HUNK_1", "HUNK_2", "PRIOR_1"],
        [],
      ],
      ["JudgeAdvisoryWithRationale", client.request.JudgeAdvisoryWithRationale(advisory, renderOptions()), [...subjectMarkers, "JUSTIFICATION_1"], []],
      ["LabelAdvisoryJustification", client.request.LabelAdvisoryJustification(advisory, renderOptions()), [...subjectMarkers, "JUSTIFICATION_1"], []],
      [
        "SynthesizeJustification",
        client.request.SynthesizeJustification(advisory, types.JustificationQuality.BAD, renderOptions()),
        [...subjectMarkers, "BAD"],
        // Synthesis writes the justification; the existing one must not leak into the prompt.
        ["JUSTIFICATION_1"],
      ],
    ];

    for (const [name, request, present, absent] of cases) {
      const text = await renderedText(request);
      for (const marker of present) expect(text.includes(marker), `${name} renders ${marker}`).toBe(true);
      for (const marker of absent) expect(text.includes(marker), `${name} leaves out ${marker}`).toBe(false);
    }
  });
});
