import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DaytonaSandboxProvider,
  FakeSandboxProvider,
  type DaytonaClientFactory,
  type SandboxCreateParams,
} from "./sandbox.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

const createParams: SandboxCreateParams = {
  snapshot: "melee-worker-v1",
  labels: { game_id: "melee", job_id: "job-1" },
  resources: { cpu: 2, memoryGiB: 4, diskGiB: 5 },
  ttlMinutes: 90,
};

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
      labels: createParams.labels,
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
        command: "cd '/work dir' && env 'FLAG=x y' 'printf' 'a'\\''b'",
        runAsync: false,
        suppressInputEcho: true,
      },
      timeoutSeconds: 11,
    });
    expect(deletedSessions).toEqual([sessionCalls[0]!.sessionId]);

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
