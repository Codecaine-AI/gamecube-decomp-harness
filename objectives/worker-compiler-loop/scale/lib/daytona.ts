/**
 * Daytona client layer for the load test.
 *
 * The harness's own `DaytonaSandboxProvider` (job-queue/sandbox.ts) stays the
 * code under test: the runner only replaces its `clientFactory`. In dry-run
 * the client talks HTTP to `fake-daytona-server.ts` (one process, shared by the
 * orchestrator and every worker child); with `--live` it is the real SDK
 * client. Either way `instrumentClient` wraps it to count every API call,
 * label every sandbox with the load-test run id, and ask the cost guard before
 * any create.
 */
import type { DaytonaClientFactory } from "@server/core/job-queue/sandbox.js";
import { classifyCommand, parseSandboxCommand } from "./commands.js";
import { errorStatus, errorText, type EventSink } from "./events.js";

/** Structural copies of the provider's private SDK shapes (sandbox.ts). */
export interface ExecResponse { exitCode?: number; stdout?: string; stderr?: string }
export interface ClientSandbox {
  id: string;
  labels?: Record<string, string>;
  process: {
    createSession(sessionId: string): Promise<void>;
    executeSessionCommand(sessionId: string, request: { command: string; runAsync: false; suppressInputEcho: true }, timeoutSeconds: number): Promise<ExecResponse>;
    deleteSession(sessionId: string): Promise<void>;
  };
  fs: {
    uploadFile(source: string | Buffer, remotePath: string): Promise<void>;
    downloadFile(remotePath: string, localPath?: string): Promise<Buffer | void>;
  };
  stop(timeoutSeconds?: number): Promise<void>;
  start(timeoutSeconds?: number): Promise<void>;
  delete?(timeoutSeconds?: number, wait?: boolean): Promise<void>;
}
export interface ClientShape {
  create(params: { snapshot: string; labels: Record<string, string>; autoStopInterval: number; autoDeleteInterval?: number; ttlMinutes: number }, options?: { timeout?: number }): Promise<ClientSandbox>;
  get(sandboxId: string): Promise<ClientSandbox>;
  list(query: { labels: Record<string, string> }): unknown;
  delete?(sandbox: ClientSandbox, timeoutSeconds?: number, wait?: boolean): Promise<void>;
}

/** Label keys the load test adds to every sandbox it creates (kill switch selector). */
export const SCALE_RUN_LABEL = "scale_run_id";
export const SCALE_PURPOSE_LABEL = "scale_purpose";

export class HttpStatusError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = status === 404 ? "DaytonaNotFoundError" : "DaytonaError";
  }
}

async function post<T>(baseUrl: string, path: string, body: unknown): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const text = await response.text();
  if (!response.ok) throw new HttpStatusError(response.status, `Request failed with status code ${response.status}: ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

/** A DaytonaClient that talks to the fake server. Behaves like the SDK at the provider's call sites. */
export function httpFakeClient(baseUrl: string): ClientShape {
  const sandboxObject = (id: string, labels: Record<string, string>): ClientSandbox => ({
    id,
    labels,
    process: {
      createSession: async (sessionId) => { await post(baseUrl, "/session/create", { id, sessionId }); },
      executeSessionCommand: async (sessionId, request, timeoutSeconds) =>
        post<ExecResponse>(baseUrl, "/session/exec", { id, sessionId, command: request.command, timeoutSeconds }),
      deleteSession: async (sessionId) => { await post(baseUrl, "/session/delete", { id, sessionId }); },
    },
    fs: {
      uploadFile: async (source, remotePath) => {
        const bytes = typeof source === "string" ? Buffer.from(await Bun.file(source).arrayBuffer()) : source;
        await post(baseUrl, "/fs/upload", { id, remotePath, content: bytes.toString("base64") });
      },
      downloadFile: (async (remotePath: string, localPath?: string) => {
        const { content } = await post<{ content: string }>(baseUrl, "/fs/download", { id, remotePath });
        const bytes = Buffer.from(content, "base64");
        if (localPath) { await Bun.write(localPath, bytes); return; }
        return bytes;
      }) as ClientSandbox["fs"]["downloadFile"],
    },
    stop: async () => { await post(baseUrl, "/sandbox/stop", { id }); },
    start: async () => { await post(baseUrl, "/sandbox/start", { id }); },
    delete: async () => { await post(baseUrl, "/sandbox/delete", { id }); },
  });
  return {
    create: async (params) => {
      const created = await post<{ id: string; labels: Record<string, string> }>(baseUrl, "/sandbox/create", params);
      return sandboxObject(created.id, created.labels);
    },
    get: async (sandboxId) => {
      const found = await post<{ id: string; labels: Record<string, string> }>(baseUrl, "/sandbox/get", { id: sandboxId });
      return sandboxObject(found.id, found.labels);
    },
    list: async (query) => {
      const { items } = await post<{ items: Array<{ id: string; labels: Record<string, string> }> }>(baseUrl, "/sandbox/list", query);
      return items.map((item) => sandboxObject(item.id, item.labels));
    },
  };
}

/** The real SDK client (live only). The import is dynamic so dry-runs never load it. */
export async function liveSdkClient(apiKey: string): Promise<ClientShape> {
  const moduleName = "@daytonaio/sdk";
  const sdk = await import(moduleName) as { Daytona: new (value: { apiKey: string }) => ClientShape };
  return new sdk.Daytona({ apiKey });
}

/**
 * Cost guard as seen by a client: admission before create, accounting after
 * create/delete. Sandbox-minutes count from admission (startup included).
 */
export interface CreateAdmission {
  /** Admits one create; the returned reservation id (if any) is passed back on `created`/`release`. */
  admitCreate(purpose: string, requestId?: string | null): Promise<string | void>;
  created(sandboxId: string, purpose: string, reservationId?: string | void): Promise<void>;
  deleted(sandboxId: string): Promise<void>;
  /**
   * A create that failed after admission. `allocations` are the sandbox ids
   * it left behind (found by its attempt label), `[]` when it provably left
   * none, null when unknown; they stay counted until deleted.
   */
  release?(reservationId?: string | void, allocations?: string[] | null): void | Promise<void>;
  /** A list by a failed attempt's label returned `ids`: an unknown allocation is now known (or gone). */
  allocationsListed?(requestId: string, ids: string[]): void | Promise<void>;
}

/** The provider's per-attempt label (job-queue/sandbox.ts SANDBOX_CREATE_ATTEMPT_LABEL): one failed allocation attempt, never a later one. */
const CREATE_ATTEMPT_LABEL = "orch_create_attempt";

async function listedSandboxes(value: unknown): Promise<ClientSandbox[]> {
  const resolved = await value;
  if (Array.isArray(resolved)) return resolved as ClientSandbox[];
  if (resolved && typeof resolved === "object" && Symbol.asyncIterator in resolved) {
    const out: ClientSandbox[] = [];
    for await (const item of resolved as AsyncIterable<ClientSandbox>) out.push(item);
    return out;
  }
  const items = (resolved as { items?: unknown } | null)?.items;
  return Array.isArray(items) ? items as ClientSandbox[] : [];
}

export interface InstrumentOptions {
  sink: EventSink;
  scaleRunId: string;
  admission: CreateAdmission;
  /** Worker children never provision worker sandboxes; a create from one is a build sandbox. */
  defaultPurpose: string;
}

/** Wraps a client so every call is measured and every created sandbox carries the run label. */
export function instrumentClient(client: ClientShape, options: InstrumentOptions): ClientShape {
  const { sink } = options;
  const measure = async <T>(op: string, sandboxId: string | undefined, work: () => Promise<T>): Promise<T> => {
    const started = performance.now();
    try {
      const value = await work();
      sink.emit({ kind: "api", op, ms: performance.now() - started, ok: true, sandboxId });
      return value;
    } catch (error) {
      sink.emit({ kind: "api", op, ms: performance.now() - started, ok: false, status: errorStatus(error), error: errorText(error).slice(0, 300), sandboxId });
      throw error;
    }
  };
  const wrapSandbox = (sandbox: ClientSandbox): ClientSandbox => ({
    id: sandbox.id,
    labels: sandbox.labels,
    process: {
      createSession: (sessionId) => measure("session.create", sandbox.id, () => sandbox.process.createSession(sessionId)),
      executeSessionCommand: async (sessionId, request, timeoutSeconds) => {
        let step = "unparsed";
        let argv0 = "";
        try {
          const parsed = parseSandboxCommand(request.command);
          step = classifyCommand(parsed.argv);
          argv0 = parsed.argv[0] ?? "";
        } catch {}
        const started = performance.now();
        try {
          const result = await measure("session.exec", sandbox.id, () => sandbox.process.executeSessionCommand(sessionId, request, timeoutSeconds));
          sink.emit({ kind: "exec", step, ms: performance.now() - started, exitCode: typeof result.exitCode === "number" ? result.exitCode : null, sandboxId: sandbox.id, argv0 });
          return result;
        } catch (error) {
          sink.emit({ kind: "exec", step, ms: performance.now() - started, exitCode: null, sandboxId: sandbox.id, argv0 });
          throw error;
        }
      },
      deleteSession: (sessionId) => measure("session.delete", sandbox.id, () => sandbox.process.deleteSession(sessionId)),
    },
    fs: {
      uploadFile: (source, remotePath) => measure("fs.upload", sandbox.id, () => sandbox.fs.uploadFile(source, remotePath)),
      downloadFile: ((remotePath: string, localPath?: string) =>
        measure("fs.download", sandbox.id, () => localPath === undefined ? sandbox.fs.downloadFile(remotePath) : sandbox.fs.downloadFile(remotePath, localPath))) as ClientSandbox["fs"]["downloadFile"],
    },
    stop: (timeoutSeconds) => measure("sandbox.stop", sandbox.id, () => sandbox.stop(timeoutSeconds)),
    start: (timeoutSeconds) => measure("sandbox.start", sandbox.id, () => sandbox.start(timeoutSeconds)),
    ...(sandbox.delete ? {
      delete: async (timeoutSeconds?: number, wait?: boolean) => {
        const started = performance.now();
        try {
          await measure("sandbox.delete", sandbox.id, () => sandbox.delete!(timeoutSeconds, wait));
          sink.emit({ kind: "sandbox", action: "delete", sandboxId: sandbox.id, ms: performance.now() - started, ok: true, purpose: sandbox.labels?.[SCALE_PURPOSE_LABEL] ?? "unknown" });
          await options.admission.deleted(sandbox.id);
        } catch (error) {
          sink.emit({ kind: "sandbox", action: "delete", sandboxId: sandbox.id, ms: performance.now() - started, ok: false, purpose: sandbox.labels?.[SCALE_PURPOSE_LABEL] ?? "unknown", error: errorText(error).slice(0, 300) });
          throw error;
        }
      },
    } : {}),
  });
  return {
    create: async (params, createOptions) => {
      // Build sandboxes carry purpose=harness-build (validation/build/daytona.ts); worker ones do not.
      const purpose = params.labels.purpose === "harness-build" ? "build" : options.defaultPurpose;
      const requestId = params.labels[CREATE_ATTEMPT_LABEL] ?? null;
      const reservation = await options.admission.admitCreate(purpose, requestId);
      const labels = { ...params.labels, [SCALE_RUN_LABEL]: options.scaleRunId, [SCALE_PURPOSE_LABEL]: purpose };
      const started = performance.now();
      try {
        const sandbox = await measure("sandbox.create", undefined, () => client.create({ ...params, labels }, createOptions));
        sink.emit({ kind: "sandbox", action: "create", sandboxId: sandbox.id, ms: performance.now() - started, ok: true, purpose });
        await options.admission.created(sandbox.id, purpose, reservation);
        return wrapSandbox({ ...sandbox, labels: sandbox.labels ?? labels } as ClientSandbox);
      } catch (error) {
        sink.emit({ kind: "sandbox", action: "create", sandboxId: "", ms: performance.now() - started, ok: false, purpose, error: errorText(error).slice(0, 300) });
        // The SDK allocates before its startup checks: what did this failed create leave behind?
        let allocations: string[] | null = null;
        if (requestId) {
          try {
            allocations = (await listedSandboxes(await measure("sandbox.list", undefined, async () => client.list({ labels: { [CREATE_ATTEMPT_LABEL]: requestId } }) as Promise<unknown>))).map((item) => item.id);
          } catch {}
        }
        await options.admission.release?.(reservation, allocations);
        throw error;
      }
    },
    get: async (sandboxId) => wrapSandbox(await measure("sandbox.get", sandboxId, () => client.get(sandboxId))),
    // Listed sandboxes are wrapped, so a delete of one (e.g. a failed create's allocation) reaches the guard.
    list: (query) => measure("sandbox.list", undefined, async () => {
      const items = (await listedSandboxes(client.list(query))).map(wrapSandbox);
      const requestId = query.labels?.[CREATE_ATTEMPT_LABEL];
      if (requestId) await options.admission.allocationsListed?.(requestId, items.map((item) => item.id));
      return items;
    }),
    ...(client.delete ? { delete: (sandbox: ClientSandbox, timeoutSeconds?: number, wait?: boolean) => measure("client.delete", sandbox.id, () => client.delete!(sandbox, timeoutSeconds, wait)) } : {}),
  };
}

/** A clientFactory for `new DaytonaSandboxProvider({ clientFactory })`. */
export function scaleClientFactory(base: () => Promise<ClientShape>, options: InstrumentOptions): DaytonaClientFactory {
  let client: Promise<ClientShape> | undefined;
  return (async () => {
    client ??= base().then((value) => instrumentClient(value, options));
    return client;
  }) as unknown as DaytonaClientFactory;
}
