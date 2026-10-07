// The kernel's BAML engine against the real @boundaryml/baml module and the
// committed generated client (plan §5 M8-C tests). Network stays local: the
// native path talks to a mock Responses server on 127.0.0.1, and fetch throws.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import { bamlEngine } from "@agent-kernel/kernel/baml-engine";
import type { CallEngine, EngineAttempt, PiTransport, PiTransportRequest, ResolvedRoute } from "@agent-kernel/kernel/model-nodes";

import { startMockResponsesServer, type MockResponsesServer } from "./__fixtures__/mock-responses-server";
import { NODE_CALL_MANIFESTS } from "./functions";
import { NODE_CALL_RETRY_POLICY, type NodeCalls } from "./node-kernel";

// Imported dynamically: a static import of the generated client stalls bun:test (see node-kernel.ts).
let baml: typeof import("@boundaryml/baml");
let client: NodeCalls;
let sources: Record<string, string>;
let server: MockResponsesServer;

const realFetch = globalThis.fetch;
let fetchCalls = 0;

beforeAll(async () => {
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new Error("network disabled in tests");
  }) as unknown as typeof fetch;
  baml = await import("@boundaryml/baml");
  client = (await import("@server/generated/baml_client")).b;
  sources = (await import("@server/generated/baml_client/inlinedbaml")).getBamlFiles();
  server = startMockResponsesServer();
});

afterAll(async () => {
  globalThis.fetch = realFetch;
  await server.stop();
});

beforeEach(() => {
  fetchCalls = 0;
  server.requests.length = 0;
});

function engine(transport: "baml-http" | "pi" = "baml-http"): CallEngine<NodeCalls> {
  return bamlEngine({
    client,
    baml,
    sources,
    manifests: NODE_CALL_MANIFESTS,
    retryPolicy: NODE_CALL_RETRY_POLICY,
    transport,
  });
}

function route(baseUrl: string, apiKey: string): ResolvedRoute {
  return {
    modelRef: "codex-lb/gpt-mock",
    provider: "codex-lb",
    modelId: "gpt-mock",
    api: "openai-responses",
    baseUrl,
    apiKey,
    headers: {},
    reasoning: "low",
  };
}

const unusedTransport: PiTransport = {
  async complete() {
    throw new Error("the native path must not use the Pi transport");
  },
};

describe("real BAML engine", () => {
  test("real BAML module produces redacted attempts against a mock Responses server", async () => {
    const key = `sk-key-marker-${randomUUID()}`;
    // The provider echoes the key back in the response body; the engine must scrub it.
    server.reply({ kind: "output", text: '{"ok": true}', echo: `echo ${key}`, usage: { input_tokens: 42, output_tokens: 7, reasoning_tokens: 3 } });

    for (const base of ["/v1", "/backend-api/codex"]) {
      server.requests.length = 0;
      const outcome = await engine().invoke({
        name: "ContractProbe",
        args: ["is this empty?"],
        route: route(server.url(base), key),
        transport: unusedTransport,
        timeoutMs: 10_000,
        tags: { runId: "run-1", containerId: "container-1", functionName: "ContractProbe" },
        secrets: [key],
      });

      expect(outcome.ok, base).toBe(true);
      if (!outcome.ok) continue;
      expect(outcome.value.ok).toBe(true);

      // The key really went to the provider, the reasoning level too ...
      expect(server.requests).toHaveLength(1);
      expect(server.requests[0]!.headers.authorization).toBe(`Bearer ${key}`);
      expect(server.requests[0]!.body.reasoning).toEqual({ effort: "low" });
      expect(server.requests[0]!.body.stream === true).toBe(base === "/backend-api/codex");

      // ... and no attempt field carries it.
      expect(outcome.attempts).toHaveLength(1);
      const attempt: EngineAttempt = outcome.attempts[0]!;
      expect(attempt.transport).toBe("baml-http");
      expect(attempt.selected).toBe(true);
      expect(attempt.usage?.inputTokens).toBe(42);
      expect(attempt.usage?.outputTokens).toBe(7);
      expect(attempt.request?.url).toBe(`${server.url(base)}/responses`);
      expect(attempt.request?.headers.authorization).toBe("<redacted>");
      expect(attempt.reasoningTokens).toBe(3);
      if (base === "/backend-api/codex") {
        expect(attempt.response && "sse" in attempt.response && attempt.response.sse.length).toBeGreaterThan(0);
      } else {
        expect(attempt.response && "status" in attempt.response && attempt.response.status).toBe(200);
      }
      expect(JSON.stringify(outcome)).not.toContain(key);
    }
  });

  test("real generated client renders through the inert registry with no placeholder env and fetch disabled", async () => {
    const savedKernelEnv = Object.entries(process.env).filter(([name]) => name.startsWith("KERNEL_"));
    for (const [name] of savedKernelEnv) delete process.env[name];
    try {
      const marker = `prompt-marker-${randomUUID()}`;
      const sent: PiTransportRequest[] = [];
      const replies = ['{"ok": true}', "banana"];
      const transport: PiTransport = {
        async complete(req) {
          sent.push(req);
          const text = replies[sent.length - 1]!;
          const attempt: EngineAttempt = {
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
          };
          return { attempt, text, secrets: [] };
        },
      };
      const invoke = (text: string) =>
        engine("pi").invoke({
          name: "ContractProbe",
          args: [text],
          route: route("http://unused.invalid/v1", "sk-route-key-0123456789"),
          transport,
          timeoutMs: 10_000,
          tags: { runId: "run-2", containerId: "container-2", functionName: "ContractProbe" },
          secrets: ["sk-route-key-0123456789"],
        });

      const ok = await invoke(marker);
      expect(ok.ok).toBe(true);
      if (ok.ok) expect(ok.value.ok).toBe(true);
      // The real template was rendered (the input reached the transport) without any HTTP of BAML's own.
      expect(sent).toHaveLength(1);
      const rendered = [sent[0]!.systemPrompt ?? "", ...sent[0]!.messages.map((m) => m.text)].join("\n");
      expect(rendered).toContain(marker);
      expect(rendered).toContain("Reply whether the text below is non-empty.");

      const parseFailure = await invoke("second");
      expect(parseFailure.ok).toBe(false);
      if (!parseFailure.ok) {
        expect(parseFailure.failure.kind).toBe("parse");
        expect(parseFailure.failure.kind === "parse" && parseFailure.failure.rawOutput).toBe("banana");
      }

      expect(server.requests).toHaveLength(0);
      expect(fetchCalls).toBe(0);
    } finally {
      for (const [name, value] of savedKernelEnv) process.env[name] = value;
    }
  });
});

afterEach(() => {
  server.reply({ kind: "output", text: '{"ok": true}' });
});
