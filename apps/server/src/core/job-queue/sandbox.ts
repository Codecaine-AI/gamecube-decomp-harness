import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

export interface SandboxExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface SandboxResourceClass {
  cpu: number;
  memoryGiB: number;
  diskGiB: number;
}

export interface SandboxCreateParams {
  snapshot: string;
  labels: Record<string, string>;
  resources: SandboxResourceClass;
  ttlMinutes: number;
}

export interface SandboxHandle {
  readonly sandboxId: string;
  exec(
    command: string[],
    opts: { cwd?: string; env?: Record<string, string>; timeoutMs: number },
  ): Promise<SandboxExecResult>;
  uploadFile(localPath: string, remotePath: string): Promise<void>;
  downloadFile(remotePath: string, localPath: string): Promise<void>;
  readFile(remotePath: string): Promise<string>;
  writeFile(remotePath: string, content: string): Promise<void>;
}

export type SandboxDeleteReason = "settlement" | "reap" | "reconciliation" | "provision_failure";

export interface SandboxProvider {
  create(params: SandboxCreateParams): Promise<SandboxHandle>;
  get(sandboxId: string): Promise<SandboxHandle | null>;
  listByLabels(
    labels: Record<string, string>,
  ): Promise<Array<{ sandboxId: string; labels: Record<string, string> }>>;
  delete(sandboxId: string, reason: SandboxDeleteReason): Promise<void>;
}

interface DaytonaExecResponse {
  exitCode?: number;
  stdout?: string;
  stderr?: string;
}

interface DaytonaFileSystem {
  uploadFile(source: string | Buffer, remotePath: string): Promise<void>;
  downloadFile(remotePath: string): Promise<Buffer>;
  downloadFile(remotePath: string, localPath: string): Promise<void>;
}

interface DaytonaProcess {
  createSession(sessionId: string): Promise<void>;
  executeSessionCommand(
    sessionId: string,
    request: { command: string; runAsync: false; suppressInputEcho: true },
    timeoutSeconds: number,
  ): Promise<DaytonaExecResponse>;
  deleteSession(sessionId: string): Promise<void>;
}

interface DaytonaSandbox {
  id: string;
  labels?: Record<string, string>;
  process: DaytonaProcess;
  fs: DaytonaFileSystem;
  delete?(timeoutSeconds?: number, wait?: boolean): Promise<void>;
}

interface DaytonaClient {
  create(params: {
    snapshot: string;
    labels: Record<string, string>;
    resources: { cpu: number; memory: number; disk: number };
    autoStopInterval: 0;
    ttlMinutes: number;
  }): Promise<DaytonaSandbox>;
  get(sandboxId: string): Promise<DaytonaSandbox>;
  list(query: { labels: Record<string, string> }): unknown;
  delete?(sandbox: DaytonaSandbox, timeoutSeconds?: number, wait?: boolean): Promise<void>;
}

export type DaytonaClientFactory = (
  config: { apiKey: string },
) => DaytonaClient | Promise<DaytonaClient>;

export interface DaytonaSandboxProviderOptions {
  clientFactory?: DaytonaClientFactory;
  readApiKey?: () => string | undefined;
}

function shellQuote(value: string): string {
  if (value.includes("\0")) throw new Error("sandbox command arguments must not contain NUL bytes");
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function shellCommand(
  command: string[],
  opts: { cwd?: string; env?: Record<string, string> },
): string {
  if (!command.length) throw new Error("sandbox exec requires a non-empty command");
  const env = Object.entries(opts.env ?? {}).map(([key, value]) => shellQuote(`${key}=${value}`));
  const invocation = [env.length ? "env" : "", ...env, ...command.map(shellQuote)].filter(Boolean).join(" ");
  return opts.cwd ? `cd ${shellQuote(opts.cwd)} && ${invocation}` : invocation;
}

function timeoutSeconds(timeoutMs: number): number {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("sandbox exec timeoutMs must be a positive finite number");
  }
  return Math.max(1, Math.ceil(timeoutMs / 1_000));
}

function isNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    name?: unknown;
    status?: unknown;
    statusCode?: unknown;
    response?: { status?: unknown };
  };
  return candidate.name === "DaytonaNotFoundError"
    || candidate.status === 404
    || candidate.statusCode === 404
    || candidate.response?.status === 404;
}

async function defaultDaytonaClientFactory(config: { apiKey: string }): Promise<DaytonaClient> {
  const moduleName = "@daytonaio/sdk";
  const sdk = await import(moduleName) as { Daytona: new (value: { apiKey: string }) => DaytonaClient };
  return new sdk.Daytona(config);
}

class DaytonaSandboxHandle implements SandboxHandle {
  readonly sandboxId: string;

  constructor(private readonly sandbox: DaytonaSandbox) {
    this.sandboxId = sandbox.id;
  }

  async exec(
    command: string[],
    opts: { cwd?: string; env?: Record<string, string>; timeoutMs: number },
  ): Promise<SandboxExecResult> {
    const sessionId = `orch-exec-${randomUUID()}`;
    await this.sandbox.process.createSession(sessionId);
    let operationFailed = true;
    try {
      const result = await this.sandbox.process.executeSessionCommand(
        sessionId,
        {
          command: shellCommand(command, opts),
          runAsync: false,
          suppressInputEcho: true,
        },
        timeoutSeconds(opts.timeoutMs),
      );
      if (typeof result.exitCode !== "number") {
        throw new Error(`Daytona sandbox ${this.sandboxId} returned no exit code`);
      }
      operationFailed = false;
      return {
        exitCode: result.exitCode,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
      };
    } finally {
      const cleanup = this.sandbox.process.deleteSession(sessionId);
      if (operationFailed) await cleanup.catch(() => undefined);
      else await cleanup;
    }
  }

  async uploadFile(localPath: string, remotePath: string): Promise<void> {
    await this.sandbox.fs.uploadFile(localPath, remotePath);
  }

  async downloadFile(remotePath: string, localPath: string): Promise<void> {
    await this.sandbox.fs.downloadFile(remotePath, localPath);
  }

  async readFile(remotePath: string): Promise<string> {
    return (await this.sandbox.fs.downloadFile(remotePath)).toString("utf8");
  }

  async writeFile(remotePath: string, content: string): Promise<void> {
    await this.sandbox.fs.uploadFile(Buffer.from(content, "utf8"), remotePath);
  }
}

function handle(sandbox: DaytonaSandbox): SandboxHandle {
  return new DaytonaSandboxHandle(sandbox);
}

async function collectSandboxes(value: unknown): Promise<DaytonaSandbox[]> {
  const resolved = await value;
  if (resolved && typeof resolved === "object" && Symbol.asyncIterator in resolved) {
    const sandboxes: DaytonaSandbox[] = [];
    for await (const sandbox of resolved as AsyncIterable<DaytonaSandbox>) sandboxes.push(sandbox);
    return sandboxes;
  }
  if (Array.isArray(resolved)) return resolved as DaytonaSandbox[];
  if (resolved && typeof resolved === "object") {
    const record = resolved as { items?: unknown; sandboxes?: unknown };
    const items = record.items ?? record.sandboxes;
    if (Array.isArray(items)) return items as DaytonaSandbox[];
  }
  throw new Error("Daytona list returned an unsupported response");
}

export class DaytonaSandboxProvider implements SandboxProvider {
  private readonly clientFactory: DaytonaClientFactory;
  private readonly readApiKey: () => string | undefined;
  private clientPromise?: Promise<DaytonaClient>;

  constructor(options: DaytonaSandboxProviderOptions = {}) {
    this.clientFactory = options.clientFactory ?? defaultDaytonaClientFactory;
    this.readApiKey = options.readApiKey ?? (() => process.env.DAYTONA_API_KEY);
  }

  private client(): Promise<DaytonaClient> {
    if (this.clientPromise) return this.clientPromise;
    const apiKey = this.readApiKey()?.trim();
    if (!apiKey) {
      throw new Error("DAYTONA_API_KEY is required to use DaytonaSandboxProvider");
    }
    this.clientPromise = Promise.resolve(this.clientFactory({ apiKey }));
    return this.clientPromise;
  }

  async create(params: SandboxCreateParams): Promise<SandboxHandle> {
    const sandbox = await (await this.client()).create({
      snapshot: params.snapshot,
      labels: { ...params.labels },
      resources: {
        cpu: params.resources.cpu,
        memory: params.resources.memoryGiB,
        disk: params.resources.diskGiB,
      },
      autoStopInterval: 0,
      ttlMinutes: params.ttlMinutes,
    });
    return handle(sandbox);
  }

  async get(sandboxId: string): Promise<SandboxHandle | null> {
    try {
      return handle(await (await this.client()).get(sandboxId));
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async listByLabels(
    labels: Record<string, string>,
  ): Promise<Array<{ sandboxId: string; labels: Record<string, string> }>> {
    const sandboxes = await collectSandboxes((await this.client()).list({ labels: { ...labels } }));
    return sandboxes.map((sandbox) => ({
      sandboxId: sandbox.id,
      labels: { ...(sandbox.labels ?? {}) },
    }));
  }

  async delete(sandboxId: string, _reason: SandboxDeleteReason): Promise<void> {
    let sandbox: DaytonaSandbox;
    try {
      sandbox = await (await this.client()).get(sandboxId);
    } catch (error) {
      if (isNotFound(error)) return;
      throw error;
    }
    if (sandbox.delete) await sandbox.delete(60, true);
    else {
      const client = await this.client();
      if (!client.delete) throw new Error("Daytona SDK does not expose sandbox deletion");
      await client.delete(sandbox, 60, true);
    }
  }
}

export interface FakeSandboxExecCall {
  sandboxId: string;
  command: string[];
  opts: { cwd?: string; env?: Record<string, string>; timeoutMs: number };
}

export interface FakeSandboxRecord {
  sandboxId: string;
  labels: Record<string, string>;
  params: SandboxCreateParams;
}

export interface FakeSandboxDeletion extends FakeSandboxRecord {
  reason: SandboxDeleteReason;
}

type FakeExecScript =
  | SandboxExecResult
  | Error
  | ((call: FakeSandboxExecCall) => SandboxExecResult | Promise<SandboxExecResult>);

interface FakeSandboxState extends FakeSandboxRecord {
  files: Map<string, Buffer>;
  deleted: boolean;
}

function cloneCreateParams(params: SandboxCreateParams): SandboxCreateParams {
  return {
    snapshot: params.snapshot,
    labels: { ...params.labels },
    resources: { ...params.resources },
    ttlMinutes: params.ttlMinutes,
  };
}

export class FakeSandboxProvider implements SandboxProvider {
  readonly createdSandboxes: FakeSandboxRecord[] = [];
  readonly deletedSandboxes: FakeSandboxDeletion[] = [];
  readonly execCalls: FakeSandboxExecCall[] = [];
  readonly uploadCalls: Array<{ sandboxId: string; localPath: string; remotePath: string }> = [];
  readonly downloadCalls: Array<{ sandboxId: string; remotePath: string; localPath: string }> = [];
  private readonly sandboxes = new Map<string, FakeSandboxState>();
  private readonly execScripts: FakeExecScript[] = [];
  private nextSandboxId = 1;

  scriptExec(...scripts: FakeExecScript[]): this {
    this.execScripts.push(...scripts);
    return this;
  }

  async create(params: SandboxCreateParams): Promise<SandboxHandle> {
    const sandboxId = `sandbox-${this.nextSandboxId++}`;
    const saved = cloneCreateParams(params);
    const state: FakeSandboxState = {
      sandboxId,
      labels: { ...saved.labels },
      params: saved,
      files: new Map(),
      deleted: false,
    };
    this.sandboxes.set(sandboxId, state);
    this.createdSandboxes.push({ sandboxId, labels: { ...state.labels }, params: cloneCreateParams(saved) });
    return this.fakeHandle(state);
  }

  async get(sandboxId: string): Promise<SandboxHandle | null> {
    const state = this.sandboxes.get(sandboxId);
    return state && !state.deleted ? this.fakeHandle(state) : null;
  }

  async listByLabels(
    labels: Record<string, string>,
  ): Promise<Array<{ sandboxId: string; labels: Record<string, string> }>> {
    return [...this.sandboxes.values()]
      .filter((sandbox) => !sandbox.deleted)
      .filter((sandbox) => Object.entries(labels).every(([key, value]) => sandbox.labels[key] === value))
      .map((sandbox) => ({ sandboxId: sandbox.sandboxId, labels: { ...sandbox.labels } }));
  }

  async delete(sandboxId: string, reason: SandboxDeleteReason): Promise<void> {
    const state = this.sandboxes.get(sandboxId);
    if (!state || state.deleted) return;
    state.deleted = true;
    this.deletedSandboxes.push({
      sandboxId,
      labels: { ...state.labels },
      params: cloneCreateParams(state.params),
      reason,
    });
  }

  private assertLive(state: FakeSandboxState): void {
    if (state.deleted) throw new Error(`sandbox ${state.sandboxId} is deleted`);
  }

  private fakeHandle(state: FakeSandboxState): SandboxHandle {
    return {
      sandboxId: state.sandboxId,
      exec: async (command, opts) => {
        this.assertLive(state);
        const call: FakeSandboxExecCall = {
          sandboxId: state.sandboxId,
          command: [...command],
          opts: { ...opts, env: opts.env ? { ...opts.env } : undefined },
        };
        this.execCalls.push(call);
        const script = this.execScripts.shift() ?? { exitCode: 0, stdout: "", stderr: "" };
        if (script instanceof Error) throw script;
        const result = typeof script === "function" ? await script(call) : script;
        return { ...result };
      },
      uploadFile: async (localPath, remotePath) => {
        this.assertLive(state);
        this.uploadCalls.push({ sandboxId: state.sandboxId, localPath, remotePath });
        state.files.set(remotePath, await readFile(localPath));
      },
      downloadFile: async (remotePath, localPath) => {
        this.assertLive(state);
        this.downloadCalls.push({ sandboxId: state.sandboxId, remotePath, localPath });
        const content = state.files.get(remotePath);
        if (!content) throw new Error(`sandbox file not found: ${remotePath}`);
        await writeFile(localPath, content);
      },
      readFile: async (remotePath) => {
        this.assertLive(state);
        const content = state.files.get(remotePath);
        if (!content) throw new Error(`sandbox file not found: ${remotePath}`);
        return content.toString("utf8");
      },
      writeFile: async (remotePath, content) => {
        this.assertLive(state);
        state.files.set(remotePath, Buffer.from(content, "utf8"));
      },
    };
  }
}
