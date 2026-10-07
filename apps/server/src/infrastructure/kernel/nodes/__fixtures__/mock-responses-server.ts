// Local mock of an OpenAI Responses endpoint (plan §7.1) for real-BAML tests.
// Serves POST <any base>/responses: a JSON response, or an SSE stream when
// the request body sets `stream: true` (the codex-lb /backend-api/ route).
// Every request is recorded so a test can check what was actually sent.

export type MockResponsesReply =
  | {
      kind: "output";
      /** The assistant's output text. */
      text: string;
      /** Served model id; defaults to the requested model. */
      model?: string;
      usage?: { input_tokens: number; output_tokens: number; reasoning_tokens?: number; cached_tokens?: number };
      /** Copied into the response's `metadata.echo`, e.g. to echo a credential back. */
      echo?: string;
    }
  | { kind: "status"; status: number; body: unknown };

export interface MockResponsesRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: any;
}

export interface MockResponsesServer {
  readonly port: number;
  /** Base URL for a client, e.g. url("/v1") or url("/backend-api/codex"). */
  url(basePath: string): string;
  readonly requests: MockResponsesRequest[];
  /** Sets the reply for every following request. */
  reply(next: MockResponsesReply | ((request: MockResponsesRequest) => MockResponsesReply)): void;
  stop(): Promise<void>;
}

const DEFAULT_USAGE = { input_tokens: 42, output_tokens: 7, reasoning_tokens: 3, cached_tokens: 0 };

function responseObject(request: MockResponsesRequest, reply: Extract<MockResponsesReply, { kind: "output" }>) {
  const usage = reply.usage ?? DEFAULT_USAGE;
  return {
    id: "resp_mock_1",
    object: "response",
    created_at: 1_791_000_000,
    status: "completed",
    model: reply.model ?? request.body?.model ?? "mock-model",
    store: false,
    ...(reply.echo !== undefined && { metadata: { echo: reply.echo } }),
    output: [
      {
        type: "message",
        id: "msg_mock_1",
        status: "completed",
        role: "assistant",
        content: [{ type: "output_text", text: reply.text, annotations: [] }],
      },
    ],
    usage: {
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      total_tokens: usage.input_tokens + usage.output_tokens,
      input_tokens_details: { cached_tokens: usage.cached_tokens ?? 0 },
      output_tokens_details: { reasoning_tokens: usage.reasoning_tokens ?? 0 },
    },
  };
}

function sse(events: Array<Record<string, unknown> & { type: string }>): Response {
  const text = events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join("");
  return new Response(text, { headers: { "content-type": "text/event-stream" } });
}

function streamReply(response: ReturnType<typeof responseObject>, text: string): Response {
  const message = response.output[0]!;
  const inProgress = { ...response, status: "in_progress", output: [], usage: null };
  return sse([
    { type: "response.created", sequence_number: 0, response: inProgress },
    {
      type: "response.output_item.added",
      sequence_number: 1,
      output_index: 0,
      item: { ...message, status: "in_progress", content: [] },
    },
    {
      type: "response.content_part.added",
      sequence_number: 2,
      item_id: message.id,
      output_index: 0,
      content_index: 0,
      part: { type: "output_text", text: "", annotations: [] },
    },
    {
      type: "response.output_text.delta",
      sequence_number: 3,
      item_id: message.id,
      output_index: 0,
      content_index: 0,
      delta: text,
    },
    {
      type: "response.output_text.done",
      sequence_number: 4,
      item_id: message.id,
      output_index: 0,
      content_index: 0,
      text,
    },
    { type: "response.output_item.done", sequence_number: 5, output_index: 0, item: message },
    { type: "response.completed", sequence_number: 6, response },
  ]);
}

export function startMockResponsesServer(initial: MockResponsesReply = { kind: "output", text: '{"ok": true}' }): MockResponsesServer {
  const requests: MockResponsesRequest[] = [];
  let next: MockResponsesReply | ((request: MockResponsesRequest) => MockResponsesReply) = initial;

  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(req) {
      const url = new URL(req.url);
      const raw = await req.text();
      let body: any = null;
      try {
        body = raw ? JSON.parse(raw) : null;
      } catch {
        body = raw;
      }
      const request: MockResponsesRequest = {
        method: req.method,
        path: url.pathname,
        headers: Object.fromEntries(req.headers.entries()),
        body,
      };
      requests.push(request);
      if (req.method !== "POST" || !url.pathname.endsWith("/responses")) {
        return Response.json({ error: { message: `unexpected ${req.method} ${url.pathname}` } }, { status: 404 });
      }
      const reply = typeof next === "function" ? next(request) : next;
      if (reply.kind === "status") return Response.json(reply.body, { status: reply.status });
      const response = responseObject(request, reply);
      return body?.stream === true ? streamReply(response, reply.text) : Response.json(response);
    },
  });

  return {
    get port() {
      return server.port!;
    },
    url: (basePath) => `http://127.0.0.1:${server.port}${basePath}`,
    requests,
    reply(value) {
      next = value;
    },
    async stop() {
      await server.stop(true);
    },
  };
}
