// Child process for baml-native-output.test.ts. It runs real ContractProbe
// calls with the real BAML module and generated client and prints exactly one
// line, `RESULT <json>`, holding only ok flags and failure kinds, never an
// outcome itself. So any prompt or credential in its output came from BAML's
// own native logging.
//
// argv: mode ("adapter" | "control"). Env: MN_CLOSED_URL (nothing listens),
// MN_HTTP_URL (answers 500), MN_PARSE_URL (answers unparsable text),
// MN_PROMPT_MARKER, MN_KEY_MARKER, MN_HEADER_MARKER.
import * as baml from "@boundaryml/baml";
import { bamlEngine } from "@agent-kernel/kernel/baml-engine";
import type { CallEngine, PiTransport, ResolvedRoute } from "@agent-kernel/kernel/model-nodes";
import { b } from "@server/generated/baml_client";
import { getBamlFiles } from "@server/generated/baml_client/inlinedbaml";

import { NODE_CALL_MANIFESTS } from "../functions";
import { NODE_CALL_RETRY_POLICY, type NodeCalls } from "../node-kernel";

const mode = process.argv[2];
const env = (name: string) => process.env[name] ?? "";
const promptMarker = env("MN_PROMPT_MARKER");
const apiKey = env("MN_KEY_MARKER");
const headerToken = env("MN_HEADER_MARKER");
const markers = [promptMarker, apiKey, headerToken];
const prompt = `is this empty? ${promptMarker}`;

function route(baseUrl: string): ResolvedRoute {
  return {
    modelRef: "codex-lb/gpt-mock",
    provider: "codex-lb",
    modelId: "gpt-mock",
    api: "openai-responses",
    baseUrl,
    apiKey,
    headers: { "x-api-key": headerToken },
    reasoning: "low",
  };
}

// For the Pi path: a model reply that echoes every marker and does not parse.
const echoingTransport: PiTransport = {
  async complete() {
    return {
      attempt: {
        transport: "pi",
        clientName: "pi",
        provider: "codex-lb",
        startedAtMs: Date.now(),
        durationMs: 1,
        selected: true,
        status: 200,
        usage: null,
        request: null,
        response: null,
      },
      text: `not json: ${markers.join(" ")}`,
      secrets: [apiKey, headerToken],
    };
  },
};

async function invoke(engine: CallEngine<NodeCalls>, baseUrl: string) {
  const outcome = await engine.invoke({
    name: "ContractProbe",
    args: [prompt],
    route: route(baseUrl),
    transport: echoingTransport,
    timeoutMs: 10_000,
    tags: { runId: "child-run", containerId: "child-container", functionName: "ContractProbe" },
    secrets: [apiKey, headerToken],
  });
  const serialized = JSON.stringify(outcome);
  return {
    ok: outcome.ok,
    kind: outcome.ok ? null : outcome.failure.kind,
    credentialInOutcome: serialized.includes(apiKey) || serialized.includes(headerToken),
  };
}

if (mode === "control") {
  // BAML without the adapter's settings: proves the parent's scan can see a leak.
  const registry = new baml.ClientRegistry();
  registry.addLlmClient("Control", "openai-responses", { base_url: env("MN_HTTP_URL"), api_key: apiKey, model: "gpt-mock" });
  registry.setPrimary("Control");
  await b.ContractProbe(prompt, { clientRegistry: registry }).catch(() => undefined);
  console.log(`RESULT ${JSON.stringify({ mode })}`);
} else {
  const engineFor = (transport: "baml-http" | "pi") =>
    bamlEngine({ client: b, baml, sources: getBamlFiles(), manifests: NODE_CALL_MANIFESTS, retryPolicy: NODE_CALL_RETRY_POLICY, transport });
  const native = engineFor("baml-http");
  const closedStreamUrl = env("MN_CLOSED_URL").replace(/\/v1$/, "/backend-api/codex");
  const results = [
    { name: "native-connection", ...(await invoke(native, env("MN_CLOSED_URL"))) },
    { name: "stream-connection", ...(await invoke(native, closedStreamUrl)) },
    { name: "native-http", ...(await invoke(native, env("MN_HTTP_URL"))) },
    { name: "native-parse", ...(await invoke(native, env("MN_PARSE_URL"))) },
    { name: "pi-parse", ...(await invoke(engineFor("pi"), "http://unused.invalid/v1")) },
  ];
  console.log(`RESULT ${JSON.stringify({ mode, ambientAfter: process.env.BAML_LOG ?? null, results })}`);
}
