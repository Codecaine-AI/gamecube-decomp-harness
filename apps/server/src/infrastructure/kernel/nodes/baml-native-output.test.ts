// BAML's native logger writes to the process's own stdout and stderr, below
// any JS redaction, and at levels less strict than `error` it prints the
// rendered prompt (plan §4.2 rule 4, §4.7). This test runs real generated
// functions through the kernel's BAML engine in a child process and scans
// what the child actually printed.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";

import { startMockResponsesServer, type MockResponsesServer } from "./__fixtures__/mock-responses-server";

const CHILD = join(import.meta.dir, "__fixtures__/baml-native-output-child.ts");
const REPO_ROOT = resolve(import.meta.dir, "../../../../../..");
const NORMALIZED_NOTICE = "[agent-kernel] baml-engine set BAML_LOG to error: less strict BAML log levels print prompts";

const PROMPT_MARKER = `PROMPT_MARKER_${randomUUID()}`;
const KEY_MARKER = `sk-key-marker-${randomUUID()}`;
const HEADER_MARKER = `hdr-token-marker-${randomUUID()}`;
const MARKERS = [PROMPT_MARKER, KEY_MARKER, HEADER_MARKER];

let server: MockResponsesServer;
let closedPort: number;

beforeAll(async () => {
  // Both failing endpoints echo every marker back, so a logged response body would leak too.
  server = startMockResponsesServer();
  server.reply((request) =>
    request.path.startsWith("/http/")
      ? { kind: "status", status: 500, body: { error: { message: `upstream failed: ${MARKERS.join(" ")}` } } }
      : { kind: "output", text: `I will not answer in JSON. ${MARKERS.join(" ")}` },
  );
  const probe = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response("") });
  closedPort = probe.port!;
  await probe.stop(true);
});

afterAll(async () => {
  await server.stop();
});

interface ChildRun {
  code: number;
  stdout: string;
  stderr: string;
}

/** A minimal environment: no inherited credentials or BAML settings; `ambient` is the BAML_LOG under test. */
async function runChild(mode: "adapter" | "control", ambient?: string): Promise<ChildRun> {
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? "",
    HOME: process.env.HOME ?? "",
    MN_CLOSED_URL: `http://127.0.0.1:${closedPort}/v1`,
    MN_HTTP_URL: server.url("/http/v1"),
    MN_PARSE_URL: server.url("/parse/v1"),
    MN_PROMPT_MARKER: PROMPT_MARKER,
    MN_KEY_MARKER: KEY_MARKER,
    MN_HEADER_MARKER: HEADER_MARKER,
  };
  if (process.env.TMPDIR) env.TMPDIR = process.env.TMPDIR;
  if (ambient !== undefined) env.BAML_LOG = ambient;
  const child = Bun.spawn([process.execPath, CHILD, mode], { cwd: REPO_ROOT, env, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { code, stdout, stderr };
}

function resultOf(run: ChildRun): Record<string, unknown> {
  const line = run.stdout.split("\n").find((l) => l.startsWith("RESULT "));
  if (!line) throw new Error(`child printed no RESULT line (exit ${run.code}); stderr bytes: ${run.stderr.length}`);
  return JSON.parse(line.slice("RESULT ".length)) as Record<string, unknown>;
}

describe("BAML native output", () => {
  test(
    "BAML native output never carries prompts or credentials",
    async () => {
      const ambients = [undefined, "info", "warn", "debug", "trace", "error", "off"];
      const [control, ...runs] = await Promise.all([
        runChild("control"),
        ...ambients.map((ambient) => runChild("adapter", ambient)),
      ]);

      // Control: BAML without the engine's settings prints the prompt, so the scan below can see a leak.
      expect(control!.code).toBe(0);
      expect(resultOf(control!)).toEqual({ mode: "control" });
      expect((control!.stdout + control!.stderr).includes(PROMPT_MARKER)).toBe(true);

      for (const [index, run] of runs.entries()) {
        const ambient = ambients[index] ?? "unset";
        const output = run.stdout + run.stderr;
        expect({ ambient, code: run.code }).toEqual({ ambient, code: 0 });
        // Boolean shapes only, so a failure names the marker kind without printing it.
        for (const [name, marker] of [["prompt", PROMPT_MARKER], ["api key", KEY_MARKER], ["header token", HEADER_MARKER]] as const) {
          expect({ ambient, name, leaked: output.includes(marker) }).toEqual({ ambient, name, leaked: false });
        }
        expect({ ambient, promptDump: output.includes("---PROMPT---") }).toEqual({ ambient, promptDump: false });

        const kept = ambient === "error" || ambient === "off";
        expect(resultOf(run)).toEqual({
          mode: "adapter",
          ambientAfter: kept ? ambient : "error",
          results: [
            { name: "native-connection", ok: false, kind: "http", credentialInOutcome: false },
            { name: "stream-connection", ok: false, kind: "http", credentialInOutcome: false },
            { name: "native-http", ok: false, kind: "http", credentialInOutcome: false },
            { name: "native-parse", ok: false, kind: "parse", credentialInOutcome: false },
            { name: "pi-parse", ok: false, kind: "parse", credentialInOutcome: false },
          ],
        });
        // The only line the engine writes: its one-time notice, naming the variable only.
        const stderrLines = run.stderr.split("\n").filter((line) => line.trim().length > 0);
        expect({ ambient, stderrLines }).toEqual({ ambient, stderrLines: kept ? [] : [NORMALIZED_NOTICE] });
      }

      // The failing endpoints were really called (HTTP and parse cases in every adapter run).
      expect(server.requests.some((request) => request.path === "/http/v1/responses")).toBe(true);
      expect(server.requests.some((request) => request.path === "/parse/v1/responses")).toBe(true);
    },
    90_000,
  );
});
