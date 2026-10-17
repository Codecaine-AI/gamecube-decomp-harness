import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DAYTONA_SESSION_REUSE_ENV,
  DaytonaSandboxProvider,
  FakeSandboxProvider,
  SANDBOX_CREATE_ATTEMPT_LABEL,
  SANDBOX_CREATE_REQUEST_LABEL,
  type DaytonaClientFactory,
  type SandboxCreateParams,
} from "./sandbox.js";
import { SandboxCreateAdmission, SandboxCreateTimeoutError, sandboxCreateAdmissionOptionsFromEnv } from "./sandbox-create-admission.js";
import { reconcileSandboxes } from "./sandbox-lifecycle.js";
import { openState } from "@server/core/orchestrator-state";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
  delete process.env[DAYTONA_SESSION_REUSE_ENV];
});

const createParams: SandboxCreateParams = {
  snapshot: "melee-worker-v1",
  labels: { game_id: "melee", job_id: "job-1" },
  resources: { cpu: 2, memoryGiB: 4, diskGiB: 5 },
  ttlMinutes: 90,
};

/** The command a reused session ran, without its command-id claim prefix. */
const withoutSentinel = (command: string) => command.replace(/^\(mkdir '[^']*' 2>\/dev\/null \|\| \{ [^}]*\}; /, "(");

describe("FakeSandboxProvider", () => {
  test("records lifecycle, labels, scripted execs, and required timeouts", async () => {
    const provider = new FakeSandboxProvider().scriptExec(
      { exitCode: 3, stdout: "out", stderr: "err" },
      (call) => ({ exitCode: 0, stdout: call.command.join(" "), stderr: "" }),
    );
    const first = await provider.create(createParams);
    await provider.create({
      ...createParams,
      labels: { game_id: "melee", job_id: "job-2" },
    });

    expect(await first.exec(["ninja", "changes_all"], {
      cwd: "/workspace",
      env: { MWCC_CACHE_DIR: "/cache" },
      timeoutMs: 120_000,
    })).toEqual({ exitCode: 3, stdout: "out", stderr: "err" });
    expect(await first.exec(["git", "status"], { timeoutMs: 5_000 })).toEqual({
      exitCode: 0,
      stdout: "git status",
      stderr: "",
    });
    expect(provider.execCalls).toEqual([
      {
        sandboxId: "sandbox-1",
        command: ["ninja", "changes_all"],
        opts: {
          cwd: "/workspace",
          env: { MWCC_CACHE_DIR: "/cache" },
          timeoutMs: 120_000,
        },
      },
      {
        sandboxId: "sandbox-1",
        command: ["git", "status"],
        opts: { timeoutMs: 5_000, env: undefined },
      },
    ]);
    expect(await provider.listByLabels({ job_id: "job-1" })).toEqual([
      { sandboxId: "sandbox-1", labels: createParams.labels },
    ]);

    await provider.delete(first.sandboxId, "settlement");
    expect(await provider.get(first.sandboxId)).toBeNull();
    expect(provider.deletedSandboxes).toEqual([
      {
        sandboxId: "sandbox-1",
        labels: createParams.labels,
        params: createParams,
        reason: "settlement",
      },
    ]);
    await expect(first.exec(["true"], { timeoutMs: 1_000 })).rejects.toThrow("sandbox-1 is deleted");
  });

  test("round-trips in-memory and local files", async () => {
    const root = mkdtempSync(join(tmpdir(), "fake-sandbox-"));
    roots.push(root);
    const localSource = join(root, "source.bin");
    const localDownload = join(root, "download.bin");
    writeFileSync(localSource, Buffer.from([0, 1, 2, 255]));
    const provider = new FakeSandboxProvider();
    const sandbox = await provider.create(createParams);

    await sandbox.uploadFile(localSource, "/workspace/source.bin");
    await sandbox.downloadFile("/workspace/source.bin", localDownload);
    expect(readFileSync(localDownload)).toEqual(Buffer.from([0, 1, 2, 255]));
    await sandbox.writeFile("/workspace/note.txt", "hello");
    expect(await sandbox.readFile("/workspace/note.txt")).toBe("hello");
    expect(provider.uploadCalls).toEqual([
      { sandboxId: "sandbox-1", localPath: localSource, remotePath: "/workspace/source.bin" },
    ]);
    expect(provider.downloadCalls).toEqual([
      { sandboxId: "sandbox-1", remotePath: "/workspace/source.bin", localPath: localDownload },
    ]);
  });

  test("propagates scripted exec errors", async () => {
    const provider = new FakeSandboxProvider().scriptExec(new Error("timed out"));
    const sandbox = await provider.create(createParams);
    await expect(sandbox.exec(["sleep", "60"], { timeoutMs: 10_000 })).rejects.toThrow("timed out");
    expect(provider.execCalls[0]?.opts.timeoutMs).toBe(10_000);
  });

  test("stops and starts sandboxes with transition scripting and operation tripwires", async () => {
    let finishStop!: () => void;
    const stopDelay = new Promise<void>((resolve) => { finishStop = resolve; });
    const wakeFailure = new Error("wake failed");
    const provider = new FakeSandboxProvider()
      .scriptStop(() => stopDelay)
      .scriptStart(wakeFailure);
    const sandbox = await provider.create(createParams);

    const stopping = sandbox.stop();
    expect(provider.sandboxState(sandbox.sandboxId)).toBe("started");
    expect(provider.stopCalls).toEqual([{ sandboxId: "sandbox-1" }]);
    finishStop();
    await stopping;
    expect(provider.sandboxState(sandbox.sandboxId)).toBe("stopped");

    await expect(sandbox.exec(["true"], { timeoutMs: 1_000 })).rejects.toThrow("sandbox-1 is stopped");
    await expect(sandbox.uploadFile("/unused", "/unused")).rejects.toThrow("sandbox-1 is stopped");
    await expect(sandbox.downloadFile("/unused", "/unused")).rejects.toThrow("sandbox-1 is stopped");
    await expect(sandbox.readFile("/unused")).rejects.toThrow("sandbox-1 is stopped");
    await expect(sandbox.writeFile("/unused", "unused")).rejects.toThrow("sandbox-1 is stopped");

    await expect(sandbox.start()).rejects.toBe(wakeFailure);
    expect(provider.sandboxState(sandbox.sandboxId)).toBe("stopped");
    await sandbox.start();
    await sandbox.exec(["true"], { timeoutMs: 1_000 });
    expect(provider.startCalls).toEqual([
      { sandboxId: "sandbox-1" },
      { sandboxId: "sandbox-1" },
    ]);
    expect(provider.operationCalls.map((call) => call.operation)).toEqual([
      "stop",
      "start",
      "start",
      "exec",
    ]);

    await sandbox.stop();
    await provider.delete(sandbox.sandboxId, "reconciliation");
    expect(await provider.get(sandbox.sandboxId)).toBeNull();
    expect(provider.deletedSandboxes).toHaveLength(1);
  });
});

describe("DaytonaSandboxProvider", () => {
  test("reads credentials lazily and maps creation, exec, files, list, get, and delete", async () => {
    const createCalls: unknown[] = [];
    const listCalls: unknown[] = [];
    const sessionCalls: Array<{ sessionId: string; request: unknown; timeoutSeconds: number }> = [];
    const deletedSessions: string[] = [];
    const uploads: Array<{ source: string | Buffer; remotePath: string }> = [];
    const downloads: Array<{ remotePath: string; localPath?: string }> = [];
    const remoteFiles = new Map<string, Buffer>([["/workspace/read.txt", Buffer.from("remote")]]);
    let keyReads = 0;
    let clientCreates = 0;
    let deleted = false;
    const stopTimeouts: Array<number | undefined> = [];
    const startTimeouts: Array<number | undefined> = [];

    function downloadFile(remotePath: string): Promise<Buffer>;
    function downloadFile(remotePath: string, localPath: string): Promise<void>;
    async function downloadFile(remotePath: string, localPath?: string): Promise<Buffer | void> {
      downloads.push({ remotePath, localPath });
      const content = remoteFiles.get(remotePath) ?? Buffer.alloc(0);
      if (localPath) {
        writeFileSync(localPath, content);
        return;
      }
      return content;
    }

    const sdkSandbox = {
      id: "daytona-1",
      labels: { game_id: "melee", job_id: "job-1" },
      process: {
        createSession: async (_sessionId: string) => undefined,
        executeSessionCommand: async (
          sessionId: string,
          request: { command: string; runAsync: false; suppressInputEcho: true },
          timeoutSeconds: number,
        ) => {
          sessionCalls.push({ sessionId, request, timeoutSeconds });
          return { exitCode: 7, stdout: "stdout", stderr: "stderr" };
        },
        deleteSession: async (sessionId: string) => {
          deletedSessions.push(sessionId);
        },
      },
      fs: {
        uploadFile: async (source: string | Buffer, remotePath: string) => {
          uploads.push({ source, remotePath });
          if (Buffer.isBuffer(source)) remoteFiles.set(remotePath, source);
        },
        downloadFile,
      },
      stop: async (timeoutSeconds?: number) => {
        stopTimeouts.push(timeoutSeconds);
      },
      start: async (timeoutSeconds?: number) => {
        startTimeouts.push(timeoutSeconds);
      },
      delete: async (timeoutSeconds?: number, wait?: boolean) => {
        expect({ timeoutSeconds, wait }).toEqual({ timeoutSeconds: 60, wait: true });
        deleted = true;
      },
    };
    const clientFactory: DaytonaClientFactory = ({ apiKey }) => {
      clientCreates += 1;
      expect(apiKey).toBe("test-key");
      return {
        create: async (params) => {
          createCalls.push(params);
          return sdkSandbox;
        },
        get: async () => sdkSandbox,
        list: (query) => {
          listCalls.push(query);
          return (async function* () { yield sdkSandbox; })();
        },
      };
    };
    const provider = new DaytonaSandboxProvider({
      readApiKey: () => {
        keyReads += 1;
        return " test-key ";
      },
      clientFactory,
    });
    expect({ keyReads, clientCreates }).toEqual({ keyReads: 0, clientCreates: 0 });

    const sandbox = await provider.create(createParams);
    expect({ keyReads, clientCreates }).toEqual({ keyReads: 1, clientCreates: 1 });
    expect(createCalls).toEqual([{
      snapshot: "melee-worker-v1",
      labels: { ...createParams.labels, [SANDBOX_CREATE_REQUEST_LABEL]: expect.stringMatching(/^[0-9a-f-]{36}$/), [SANDBOX_CREATE_ATTEMPT_LABEL]: expect.stringMatching(/^[0-9a-f-]{36}$/) },
      autoStopInterval: 0,
      ttlMinutes: 90,
    }]);
    expect(await sandbox.exec(["printf", "a'b"], {
      cwd: "/work dir",
      env: { FLAG: "x y" },
      timeoutMs: 10_001,
    })).toEqual({ exitCode: 7, stdout: "stdout", stderr: "stderr" });
    expect(sessionCalls).toHaveLength(1);
    expect(sessionCalls[0]).toMatchObject({
      request: {
        command: expect.stringMatching(/^\(mkdir '\/tmp\/orch-exec-[0-9a-f-]{36}' 2>\/dev\/null \|\| \{ echo 'orch-exec-claimed [0-9a-f-]{36}' >&2; exit 75; \}; cd '\/work dir' && env 'FLAG=x y' 'printf' 'a'\\''b'\) <\/dev\/null$/),
        runAsync: false,
        suppressInputEcho: true,
      },
      timeoutSeconds: 11,
    });
    // The session stays open for the handle's next command.
    expect(deletedSessions).toEqual([]);
    await sandbox.stop();
    await sandbox.start();
    expect(stopTimeouts).toEqual([60]);
    expect(startTimeouts).toEqual([60]);

    const root = mkdtempSync(join(tmpdir(), "daytona-sandbox-"));
    roots.push(root);
    const localPath = join(root, "download.txt");
    await sandbox.uploadFile("/host/file", "/workspace/upload.bin");
    await sandbox.downloadFile("/workspace/read.txt", localPath);
    expect(readFileSync(localPath, "utf8")).toBe("remote");
    expect(await sandbox.readFile("/workspace/read.txt")).toBe("remote");
    await sandbox.writeFile("/workspace/write.txt", "written");
    expect(remoteFiles.get("/workspace/write.txt")?.toString()).toBe("written");
    expect(uploads).toHaveLength(2);
    expect(downloads).toHaveLength(2);

    expect((await provider.get("daytona-1"))?.sandboxId).toBe("daytona-1");
    expect(await provider.listByLabels({ job_id: "job-1" })).toEqual([
      { sandboxId: "daytona-1", labels: sdkSandbox.labels },
    ]);
    expect(listCalls).toEqual([{ labels: { job_id: "job-1" } }]);
    await provider.delete("daytona-1", "reap");
    expect(deleted).toBeTrue();
    expect({ keyReads, clientCreates }).toEqual({ keyReads: 1, clientCreates: 1 });
    await provider.create({ ...createParams, ephemeral: true });
    expect(createCalls.at(-1)).toMatchObject({ autoStopInterval: 90, autoDeleteInterval: 0, ttlMinutes: 90 });
  });

  test("retries idempotent calls through gateway failures but never re-runs a command", async () => {
    const failures = new Map<string, number>([["createSession", 1], ["deleteSession", 2], ["downloadFile", 1]]);
    const calls: string[] = [];
    const flaky = async (name: string) => {
      calls.push(name);
      const remaining = failures.get(name) ?? 0;
      if (remaining > 0) {
        failures.set(name, remaining - 1);
        throw new Error("Request failed with status code 502");
      }
    };
    function flakyDownload(remotePath: string): Promise<Buffer>;
    function flakyDownload(remotePath: string, localPath: string): Promise<void>;
    async function flakyDownload(_remotePath: string, localPath?: string): Promise<Buffer | void> {
      await flaky("downloadFile");
      if (!localPath) return Buffer.from("remote");
    }
    const sdkSandbox = {
      id: "daytona-flaky",
      labels: {},
      process: {
        createSession: () => flaky("createSession"),
        executeSessionCommand: async () => {
          await flaky("executeSessionCommand");
          return { exitCode: 0, stdout: "ok", stderr: "" };
        },
        deleteSession: () => flaky("deleteSession"),
      },
      fs: {
        uploadFile: async (_source: string | Buffer, remotePath: string) => {
          await flaky("uploadFile");
          if (remotePath === "/denied") throw new Error("permission denied");
        },
        downloadFile: flakyDownload,
      },
      stop: async () => undefined,
      start: async () => undefined,
      delete: async () => undefined,
    };
    const provider = new DaytonaSandboxProvider({
      readApiKey: () => "test-key",
      clientFactory: () => ({ create: async () => sdkSandbox, get: async () => sdkSandbox, list: () => [] }),
      transientRetryDelaysMs: [0, 0],
    });
    const sandbox = await provider.create(createParams);
    // A session per command, so the delete path is exercised too.
    process.env[DAYTONA_SESSION_REUSE_ENV] = "0";

    expect(await sandbox.exec(["true"], { timeoutMs: 1_000 })).toEqual({ exitCode: 0, stdout: "ok", stderr: "" });
    expect(await sandbox.readFile("/workspace/read.txt")).toBe("remote");
    expect(calls.filter((name) => name === "createSession")).toHaveLength(2);
    expect(calls.filter((name) => name === "executeSessionCommand")).toHaveLength(1);
    expect(calls.filter((name) => name === "deleteSession")).toHaveLength(3);
    expect(calls.filter((name) => name === "downloadFile")).toHaveLength(2);

    await expect(sandbox.writeFile("/denied", "x")).rejects.toThrow("permission denied");
    expect(calls.filter((name) => name === "uploadFile")).toHaveLength(1);
  });

  test("retries ephemeral creation through a gateway HTML error page, never worker creation", async () => {
    const gatewayPage = "<html>\r\n<head><title>502 Bad Gateway</title></head>\r\n</html>";
    let creates = 0;
    const sdkSandbox = { id: "daytona-build", labels: {} };
    const provider = new DaytonaSandboxProvider({
      readApiKey: () => "test-key",
      clientFactory: () => ({
        create: async () => {
          creates += 1;
          if (creates % 2 === 1) throw new Error(gatewayPage);
          return sdkSandbox as never;
        },
        get: async () => sdkSandbox as never,
        list: () => [],
      }),
      transientRetryDelaysMs: [0, 0],
    });

    expect((await provider.create({ ...createParams, ephemeral: true })).sandboxId).toBe("daytona-build");
    expect(creates).toBe(2);
    await expect(provider.create(createParams)).rejects.toThrow("502 Bad Gateway");
    expect(creates).toBe(3);
  });

  test("retries an ephemeral create that timed out starting, never worker creation", async () => {
    let creates = 0;
    const sdkSandbox = { id: "daytona-build", labels: {} };
    const provider = new DaytonaSandboxProvider({
      readApiKey: () => "test-key",
      clientFactory: () => ({
        create: async () => {
          creates += 1;
          if (creates % 2 === 1) throw new Error("Failed to create and start sandbox within 180 seconds. Operation timed out.");
          return sdkSandbox as never;
        },
        get: async () => sdkSandbox as never,
        list: () => [],
      }),
      transientRetryDelaysMs: [0, 0],
    });

    expect((await provider.create({ ...createParams, ephemeral: true })).sandboxId).toBe("daytona-build");
    expect(creates).toBe(2);
    await expect(provider.create(createParams)).rejects.toThrow("within 180 seconds");
    expect(creates).toBe(3);
  });

  test("throws a clear missing-key error only when first used", async () => {
    const provider = new DaytonaSandboxProvider({
      readApiKey: () => undefined,
      clientFactory: () => {
        throw new Error("must not construct client");
      },
    });
    await expect(provider.listByLabels({})).rejects.toThrow(
      "DAYTONA_API_KEY is required to use DaytonaSandboxProvider",
    );
  });

  test("reuses one session for sequential commands, isolated per command, and a session per concurrent command", async () => {
    const live = new Set<string>();
    const calls: Array<{ op: string; sessionId: string; command?: string }> = [];
    let release!: () => void;
    let gate: Promise<void> | null = null;
    const sdkSandbox = {
      id: "daytona-reuse",
      labels: {},
      process: {
        createSession: async (sessionId: string) => { calls.push({ op: "create", sessionId }); live.add(sessionId); },
        executeSessionCommand: async (sessionId: string, request: { command: string }) => {
          calls.push({ op: "exec", sessionId, command: request.command });
          if (!live.has(sessionId)) throw new Error(`session ${sessionId} not found`);
          if (gate) await gate;
          return { exitCode: 0, stdout: request.command, stderr: "" };
        },
        deleteSession: async (sessionId: string) => { calls.push({ op: "delete", sessionId }); live.delete(sessionId); },
      },
      fs: { uploadFile: async () => undefined, downloadFile: async () => Buffer.alloc(0) },
      stop: async () => { live.clear(); },
      start: async () => undefined,
      delete: async () => undefined,
    };
    const provider = new DaytonaSandboxProvider({
      readApiKey: () => "test-key",
      clientFactory: () => ({ create: async () => sdkSandbox as never, get: async () => sdkSandbox as never, list: () => [] }),
      createAdmission: null,
    });
    const sandbox = await provider.create(createParams);

    const first = await sandbox.exec(["pwd"], { cwd: "/work/sms", timeoutMs: 1_000 });
    const second = await sandbox.exec(["pwd"], { timeoutMs: 1_000 });
    await sandbox.exec(["git", "status"], { env: { A: "1" }, timeoutMs: 1_000 });
    expect(calls.filter((call) => call.op === "create")).toHaveLength(1);
    expect(calls.filter((call) => call.op === "exec")).toHaveLength(3);
    expect(calls.filter((call) => call.op === "delete")).toHaveLength(0);
    // The cwd and env live in a subshell, so they never leak into the next command.
    expect(withoutSentinel(first.stdout)).toBe("(cd '/work/sms' && 'pwd') </dev/null");
    expect(withoutSentinel(second.stdout)).toBe("('pwd') </dev/null");

    // Concurrent commands never share a session.
    gate = new Promise<void>((resolve) => { release = resolve; });
    const running = [sandbox.exec(["a"], { timeoutMs: 1_000 }), sandbox.exec(["b"], { timeoutMs: 1_000 })];
    await Bun.sleep(5);
    const concurrent = calls.filter((call) => call.op === "exec").slice(-2).map((call) => call.sessionId);
    expect(new Set(concurrent).size).toBe(2);
    release();
    gate = null;
    await Promise.all(running);

    // A stopped sandbox loses its sessions; the handle starts fresh after start().
    await sandbox.stop();
    await sandbox.start();
    const createsBefore = calls.filter((call) => call.op === "create").length;
    await sandbox.exec(["true"], { timeoutMs: 1_000 });
    expect(calls.filter((call) => call.op === "create")).toHaveLength(createsBefore + 1);
  });

  test("retries a vanished reused session once, never a command that may have run", async () => {
    const live = new Set<string>();
    const executed: string[] = [];
    let failNext: Error | null = null;
    const sdkSandbox = {
      id: "daytona-vanish",
      labels: {},
      process: {
        createSession: async (sessionId: string) => { live.add(sessionId); },
        executeSessionCommand: async (sessionId: string, request: { command: string }) => {
          if (!live.has(sessionId)) throw Object.assign(new Error(`Session ${sessionId} not found`), { statusCode: 404 });
          if (failNext) { const error = failNext; failNext = null; throw error; }
          executed.push(request.command);
          return { exitCode: 0, stdout: "", stderr: "" };
        },
        deleteSession: async (sessionId: string) => { live.delete(sessionId); },
      },
      fs: { uploadFile: async () => undefined, downloadFile: async () => Buffer.alloc(0) },
      stop: async () => undefined,
      start: async () => undefined,
      delete: async () => undefined,
    };
    const provider = new DaytonaSandboxProvider({
      readApiKey: () => "test-key",
      clientFactory: () => ({ create: async () => sdkSandbox as never, get: async () => sdkSandbox as never, list: () => [] }),
      createAdmission: null,
    });
    const sandbox = await provider.create(createParams);
    await sandbox.exec(["one"], { timeoutMs: 1_000 });
    live.clear(); // the daemon restarted: the idle session is gone
    await sandbox.exec(["two"], { timeoutMs: 1_000 });
    expect(executed.map(withoutSentinel)).toEqual(["('one') </dev/null", "('two') </dev/null"]);

    failNext = new Error("Request failed with status code 502");
    await expect(sandbox.exec(["three"], { timeoutMs: 1_000 })).rejects.toThrow("502");
    expect(executed).toHaveLength(2);
    // The failed session was discarded: the next command opens a new one and succeeds.
    await sandbox.exec(["four"], { timeoutMs: 1_000 });
    expect(withoutSentinel(executed.at(-1)!)).toBe("('four') </dev/null");
  });

  /**
   * A sandbox whose sessions run commands the way a shell would: the `mkdir`
   * id claim succeeds once per id, a delivery that loses it exits 75 without
   * running. `closeAfterRun` closes the session after the mutation, before the
   * response; `delayOriginal` accepts the request, reports the session closed,
   * and holds the delivery to run later (`runDelayed`).
   */
  function claimingSandbox() {
    const live = new Set<string>();
    const claimed = new Set<string>();
    const mutations: string[] = [];
    const delayed: string[] = [];
    const state = { closeAfterRun: false, delayOriginal: false };
    const run = (command: string) => {
      const claim = /^\(mkdir '([^']+)' 2>\/dev\/null \|\| \{ echo '([^']+)' >&2; exit 75; \}; /.exec(command);
      if (!claim) throw new Error(`unclaimed command ${command}`);
      if (claimed.has(claim[1]!)) return { exitCode: 75, stdout: "", stderr: `${claim[2]}\n` };
      claimed.add(claim[1]!);
      mutations.push(withoutSentinel(command));
      return { exitCode: 0, stdout: "", stderr: "" };
    };
    const sdkSandbox = {
      id: "daytona-claim",
      labels: {},
      process: {
        createSession: async (sessionId: string) => { live.add(sessionId); },
        executeSessionCommand: async (sessionId: string, request: { command: string }) => {
          if (!live.has(sessionId)) throw Object.assign(new Error(`Session ${sessionId} not found`), { statusCode: 404 });
          if (state.delayOriginal) {
            state.delayOriginal = false;
            live.delete(sessionId);
            delayed.push(request.command);
            throw new Error(`session ${sessionId} closed`);
          }
          const result = run(request.command);
          if (state.closeAfterRun) {
            state.closeAfterRun = false;
            live.delete(sessionId);
            throw new Error(`session ${sessionId} closed`);
          }
          return result;
        },
        deleteSession: async (sessionId: string) => { live.delete(sessionId); },
      },
      fs: { uploadFile: async () => undefined, downloadFile: async () => Buffer.alloc(0) },
      stop: async () => undefined,
      start: async () => undefined,
      delete: async () => undefined,
    };
    const provider = new DaytonaSandboxProvider({
      readApiKey: () => "test-key",
      clientFactory: () => ({ create: async () => sdkSandbox as never, get: async () => sdkSandbox as never, list: () => [] }),
      createAdmission: null,
      transientRetryDelaysMs: [0],
    });
    const runDelayed = () => delayed.splice(0).map(run);
    return { provider, mutations, state, runDelayed };
  }

  test("a session that closes after the command mutated, before its response, never runs it twice", async () => {
    const { provider, mutations, state } = claimingSandbox();
    const sandbox = await provider.create(createParams);
    await sandbox.exec(["warm"], { timeoutMs: 1_000 });
    state.closeAfterRun = true;
    // The replay loses the id claim: the command already ran in the closed session.
    await expect(sandbox.exec(["append-once"], { timeoutMs: 1_000 })).rejects.toThrow("not re-run");
    expect(mutations.filter((command) => command.includes("append-once"))).toHaveLength(1);
  });

  test("a delayed original and its replay run the command exactly once", async () => {
    const { provider, mutations, state, runDelayed } = claimingSandbox();
    const sandbox = await provider.create(createParams);
    await sandbox.exec(["warm"], { timeoutMs: 1_000 });
    state.delayOriginal = true;
    // The original was accepted but reported closed before starting: the replay claims the id and runs.
    expect(await sandbox.exec(["append-once"], { timeoutMs: 1_000 })).toMatchObject({ exitCode: 0 });
    // The original starts afterwards, loses the claim and exits without running.
    expect(runDelayed()).toEqual([{ exitCode: 75, stdout: "", stderr: expect.stringContaining("orch-exec-claimed") }]);
    expect(mutations.filter((command) => command.includes("append-once"))).toHaveLength(1);
  });

  /**
   * The installed SDK's `create`: `createSandbox` allocates, then the proxy
   * lookup / start wait may answer 429 (`failAfterAllocation` times), after
   * the sandbox already exists under the request's labels.
   */
  function allocatingClient(options: { failAfterAllocation: number; listFailures?: number; maxAlive?: number; retryBaseMs?: number; terminal?: boolean; now?: () => number; holdMaxAgeMs?: number; maxWaitMs?: number; listDelayMs?: number }) {
    const world = new Map<string, { id: string; labels: Record<string, string>; delete: () => Promise<void> }>();
    let next = 1;
    let failures = options.failAfterAllocation;
    let listFailures = options.listFailures ?? 0;
    let maxPhysical = 0;
    let stall: Promise<void> | null = null;
    const client = {
      create: async (request: { labels: Record<string, string> }) => {
        const sandbox = { id: `alloc-${next++}`, labels: { ...request.labels }, delete: async () => { world.delete(sandbox.id); } };
        world.set(sandbox.id, sandbox);
        maxPhysical = Math.max(maxPhysical, world.size);
        await Bun.sleep(1);
        if (failures > 0) {
          failures -= 1;
          // `terminal`: a startup failure after allocation that is not a refusal (never retried).
          if (options.terminal) throw new Error("Failed to create and start sandbox within 180 seconds");
          throw Object.assign(new Error("Too Many Requests"), { statusCode: 429, name: "DaytonaRateLimitError" });
        }
        return sandbox as never;
      },
      get: async (id: string) => world.get(id) as never,
      list: async ({ labels }: { labels: Record<string, string> }) => {
        if (listFailures > 0) {
          listFailures -= 1;
          throw new Error("list unavailable");
        }
        if (options.listDelayMs) await Bun.sleep(options.listDelayMs);
        // A stalled list answers with the world as it is when it resumes.
        if (stall) {
          const gate = stall;
          stall = null;
          await gate;
        }
        return [...world.values()].filter((sandbox) => Object.entries(labels).every(([key, value]) => sandbox.labels[key] === value));
      },
    };
    const admission = new SandboxCreateAdmission(() => ({
      ...sandboxCreateAdmissionOptionsFromEnv({}), retryBaseMs: options.retryBaseMs ?? 1, retryMaxMs: Math.max(2, (options.retryBaseMs ?? 1) * 2), maxWaitMs: options.maxWaitMs ?? 5_000, maxRateRetries: 3, maxAlive: options.maxAlive ?? 0,
      holdProbeMs: 5, holdMaxAgeMs: options.holdMaxAgeMs ?? 60_000,
    }), options.now ? { now: options.now } : {});
    const provider = new DaytonaSandboxProvider({ readApiKey: () => "test-key", clientFactory: () => client as never, createAdmission: admission, transientRetryDelaysMs: [0] });
    return {
      world, admission, provider, maxPhysical: () => maxPhysical, allocations: () => next - 1, failList: (count: number) => { listFailures = count; },
      /** The next list call stalls until the returned function is called. */
      stallNextList: () => { let resume!: () => void; stall = new Promise<void>((resolve) => { resume = resolve; }); return resume; },
    };
  }

  test("maxAlive 1: a post-allocation 429 is cleaned up before its slot frees, so a create during its backoff never makes two sandboxes", async () => {
    const { world, admission, provider, maxPhysical } = allocatingClient({ failAfterAllocation: 1, maxAlive: 1, retryBaseMs: 30 });
    const done: string[] = [];
    const a = provider.create(createParams).then((sandbox) => { done.push(`A:${sandbox.sandboxId}`); return sandbox; });
    await Bun.sleep(2);
    const b = provider.create(createParams).then((sandbox) => { done.push(`B:${sandbox.sandboxId}`); return sandbox; });
    // B gets the slot during A's backoff; A waits for it.
    for (let i = 0; i < 200 && done.length < 1; i += 1) await Bun.sleep(5);
    expect(done).toEqual(["B:alloc-2"]);
    expect(world.size).toBe(1);
    await provider.delete("alloc-2", "settlement");
    await Promise.all([a, b]);
    expect(maxPhysical()).toBe(1);
    expect(admission.snapshot().alive).toBe(1);
  });

  test("maxAlive 1: an allocation whose cleanup failed keeps its quota slot until it is confirmed deleted", async () => {
    const { world, admission, provider, maxPhysical } = allocatingClient({ failAfterAllocation: 1, listFailures: 1, maxAlive: 1, retryBaseMs: 30 });
    const a = provider.create(createParams);
    await Bun.sleep(2);
    const b = provider.create(createParams);
    // While A's allocation is unconfirmed, it holds the only slot: B waits.
    await Bun.sleep(10);
    expect(admission.snapshot().alive).toBe(1);
    const first = await Promise.race([a, b]);
    expect(world.size).toBe(1);
    await provider.delete(first.sandboxId, "settlement");
    await Promise.all([a, b]);
    expect(maxPhysical()).toBe(1);
    expect(admission.snapshot().alive).toBe(1);
  });

  test("maxAlive 1: a terminal failure whose cleanup failed holds a slot until reconciliation confirms the allocation gone; then the next create succeeds", async () => {
    // listFailures 2: the in-slot cleanup and the create's final cleanup both fail.
    const { world, admission, provider } = allocatingClient({ failAfterAllocation: 1, terminal: true, listFailures: 2, maxAlive: 1 });
    await expect(provider.create(createParams)).rejects.toThrow("Failed to create and start sandbox");
    // The allocation exists and could not be confirmed deleted: it holds the only slot.
    expect(world.size).toBe(1);
    expect(admission.snapshot()).toMatchObject({ alive: 1, heldAllocations: 1 });
    // Reconciliation by the job labels deletes the physical sandbox; that alone does not touch the hold...
    await provider.delete([...world.keys()][0]!, "reconciliation");
    expect(admission.snapshot()).toMatchObject({ alive: 1, heldAllocations: 1 });
    // ...the held-allocation reconciliation lists by the request label, finds nothing left, and releases it.
    const reconciled = await provider.reconcileHeldAllocations();
    expect(reconciled).toMatchObject({ released: [expect.any(String)], held: [], expired: [] });
    expect(admission.snapshot()).toMatchObject({ alive: 0, heldAllocations: 0 });
    const next = await provider.create(createParams);
    expect([...world.keys()]).toEqual([next.sandboxId]);
    expect(admission.snapshot().alive).toBe(1);
  });

  test("maxAlive 1: a create blocked behind a held allocation reconciles it itself and proceeds", async () => {
    const { world, admission, provider } = allocatingClient({ failAfterAllocation: 1, terminal: true, listFailures: 2, maxAlive: 1 });
    await expect(provider.create(createParams)).rejects.toThrow("Failed to create and start sandbox");
    expect(admission.snapshot().heldAllocations).toBe(1);
    // The next create first confirms the leftover allocation deleted (listing now works), then runs.
    const next = await provider.create(createParams);
    expect([...world.keys()]).toEqual([next.sandboxId]);
    expect(admission.snapshot()).toMatchObject({ alive: 1, heldAllocations: 0 });
  });

  test("maxAlive 1: the run loop's sandbox reconciliation deletes the leftover and releases its hold; the next create succeeds", async () => {
    const { world, admission, provider } = allocatingClient({ failAfterAllocation: 1, terminal: true, listFailures: 2, maxAlive: 1 });
    await expect(provider.create(createParams)).rejects.toThrow("Failed to create and start sandbox");
    expect(admission.snapshot()).toMatchObject({ alive: 1, heldAllocations: 1 });
    const root = mkdtempSync(join(tmpdir(), "held-allocation-reconcile-"));
    roots.push(root);
    const store = openState(join(root, "state"));
    try {
      const result = await reconcileSandboxes(store, { gameId: "melee" }, { sandboxProvider: provider, warn: () => undefined, retryDelay: async () => undefined });
      // Its job row is missing, so the label sweep deletes it; then the hold is confirmed gone.
      expect(result).toMatchObject({ scanned: 1, deleted: 1, held_allocations: { released: [expect.any(String)], held: [], expired: [] } });
    } finally {
      store.db.close();
    }
    expect(world.size).toBe(0);
    expect(admission.snapshot()).toMatchObject({ alive: 0, heldAllocations: 0 });
    const next = await provider.create(createParams);
    expect([...world.keys()]).toEqual([next.sandboxId]);
  });

  test("a stalled reconciler resuming after the create's own retry succeeded never deletes the successful sandbox", async () => {
    // Attempt 1 allocates, gets a 429, and its in-slot cleanup list fails: it is held by its attempt label.
    const { world, admission, provider, stallNextList } = allocatingClient({ failAfterAllocation: 1, listFailures: 1, maxAlive: 1, retryBaseMs: 40 });
    const creating = provider.create(createParams);
    for (let i = 0; i < 200 && admission.snapshot().heldAllocations === 0; i += 1) await Bun.sleep(1);
    expect(admission.snapshot().heldAllocations).toBe(1);
    // A reconciler starts on the hold and stalls on its list.
    const resume = stallNextList();
    const reconciling = provider.reconcileHeldAllocations();
    // The create's own retry confirms attempt 1 gone, releases the hold, and succeeds with attempt 2.
    const sandbox = await creating;
    expect(sandbox.sandboxId).toBe("alloc-2");
    expect([...world.keys()]).toEqual(["alloc-2"]);
    expect(admission.snapshot()).toMatchObject({ alive: 1, heldAllocations: 0 });
    // The stalled list resumes: it lists by attempt 1's label only, so the successful sandbox survives.
    resume();
    await reconciling;
    expect([...world.keys()]).toEqual(["alloc-2"]);
    expect(world.get("alloc-2")!.labels[SANDBOX_CREATE_REQUEST_LABEL]).toBeDefined();
    expect(admission.snapshot()).toMatchObject({ alive: 1, heldAllocations: 0 });
    await provider.delete("alloc-2", "settlement");
    expect(admission.snapshot().alive).toBe(0);
  });

  test("maxWaitMs 10 with slow retry cleanup times out with no second allocation", async () => {
    // Attempt 1 allocates and is refused; its in-slot cleanup list fails, so the retry must clean up first,
    // and that cleanup (a slow list) runs past the 10 ms deadline.
    const { world, admission, provider, allocations } = allocatingClient({ failAfterAllocation: 1, listFailures: 1, maxWaitMs: 10, listDelayMs: 100 });
    await expect(provider.create(createParams)).rejects.toBeInstanceOf(SandboxCreateTimeoutError);
    expect(allocations()).toBe(1);
    expect(world.size).toBe(0);
    expect(admission.stats.timeouts).toBe(1);
    expect(admission.snapshot()).toMatchObject({ alive: 0, creating: 0, heldAllocations: 0 });
  });

  test("a hold that stays unconfirmed past its max age is released and reported as an error", async () => {
    let now = 0;
    const { admission, provider, failList } = allocatingClient({ failAfterAllocation: 1, terminal: true, listFailures: 2, maxAlive: 1, now: () => now, holdMaxAgeMs: 60_000 });
    await expect(provider.create(createParams)).rejects.toThrow("Failed to create and start sandbox");
    failList(1_000);
    expect(await provider.reconcileHeldAllocations()).toMatchObject({ released: [], held: [expect.any(String)], expired: [] });
    expect(admission.snapshot().heldAllocations).toBe(1);
    now = 61_000;
    const errors: string[] = [];
    const originalError = console.error;
    console.error = (message: string) => { errors.push(message); };
    try {
      expect(await provider.reconcileHeldAllocations()).toMatchObject({ released: [], held: [], expired: [expect.any(String)] });
    } finally {
      console.error = originalError;
    }
    expect(errors.join("\n")).toContain("ALLOCATION HOLD EXPIRED");
    expect(admission.snapshot()).toMatchObject({ alive: 0, heldAllocations: 0 });
    expect(admission.stats.holdsExpired).toBe(1);
  });

  test("a refusal after allocation never duplicates: the retry first deletes what the request allocated", async () => {
    const { world, admission, provider } = allocatingClient({ failAfterAllocation: 2 });
    const sandbox = await provider.create(createParams);

    // Three allocations happened; the two refused ones were deleted before each retry.
    expect([...world.keys()]).toEqual([sandbox.sandboxId]);
    expect(sandbox.sandboxId).toBe("alloc-3");
    expect(admission.snapshot().alive).toBe(1);
    // Two concurrent creates carry distinct request ids, so one never deletes the other's sandbox.
    const both = await Promise.all([provider.create(createParams), provider.create(createParams)]);
    expect(new Set(both.map((handle) => handle.sandboxId)).size).toBe(2);
    expect(world.size).toBe(3);
  });

  test("a create that finally fails leaves none of its allocations behind", async () => {
    const { world, admission, provider } = allocatingClient({ failAfterAllocation: 10 });
    await expect(provider.create(createParams)).rejects.toThrow("Too Many Requests");
    expect(world.size).toBe(0);
    expect(admission.snapshot().alive).toBe(0);
  });

  test("returns null only for Daytona not-found failures", async () => {
    const notFound = new Error("missing");
    notFound.name = "DaytonaNotFoundError";
    const provider = new DaytonaSandboxProvider({
      readApiKey: () => "test-key",
      clientFactory: () => ({
        create: async () => { throw new Error("unused"); },
        get: async () => { throw notFound; },
        list: () => [],
      }),
    });
    expect(await provider.get("missing")).toBeNull();
    await expect(provider.delete("missing", "reconciliation")).resolves.toBeUndefined();
  });
});
