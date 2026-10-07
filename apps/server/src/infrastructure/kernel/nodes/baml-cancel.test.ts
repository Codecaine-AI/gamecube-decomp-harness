// Native request and retry cancellation with the real BAML module (plan
// §4.6): kernel.call through the production bamlEngine config stops its
// in-flight request when the caller aborts, stops a pending retry when the
// caller aborts or the operation deadline fires during backoff, and records
// the run aborted. A control shows KernelCallRetry does retry when nothing
// cancels it. The calls run in a child process, which keeps the generated
// client out of this file (a static import stalls bun:test, see node-kernel.ts).
import { describe, expect, test } from "bun:test";
import { join, resolve } from "node:path";

import type { CancelScenarioResult } from "./__fixtures__/baml-cancel-child";

const CHILD = join(import.meta.dir, "__fixtures__/baml-cancel-child.ts");
const REPO_ROOT = resolve(import.meta.dir, "../../../../../..");

describe("BAML native cancellation", () => {
  test(
    "an abort during the request or the retry backoff, and the deadline during backoff, stop BAML and end the run aborted",
    async () => {
      // No inherited credentials or BAML settings.
      const env: Record<string, string> = { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "" };
      if (process.env.TMPDIR) env.TMPDIR = process.env.TMPDIR;
      const child = Bun.spawn([process.execPath, CHILD], { cwd: REPO_ROOT, env, stdout: "pipe", stderr: "pipe" });
      const [stdout, stderr, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      const line = stdout.split("\n").find((l) => l.startsWith("RESULT "));
      if (!line) throw new Error(`child printed no RESULT line (exit ${code}): ${stderr.slice(0, 2_000)}`);
      expect(code).toBe(0);
      const byName = Object.fromEntries(
        (JSON.parse(line.slice("RESULT ".length)) as CancelScenarioResult[]).map((result) => [result.name, result]),
      );

      // KernelCallRetry retries a 500 once when nothing cancels it.
      expect(byName["retry-control"]).toMatchObject({ outcome: "http", runStatus: "error", requests: 2, doctorOk: true });

      // Abort while the request is in flight: the connection closes and nothing is retried.
      expect(byName["abort-during-request"]).toMatchObject({
        outcome: "aborted",
        runStatus: "aborted",
        endStatus: "aborted",
        endKind: "aborted",
        requests: 1,
        clientClosed: true,
        doctorOk: true,
      });

      // Abort, and the operation deadline, while the retry policy waits: the retry never goes out.
      expect(byName["abort-during-backoff"]).toMatchObject({
        outcome: "aborted",
        runStatus: "aborted",
        endStatus: "aborted",
        endKind: "aborted",
        requests: 1,
        doctorOk: true,
      });
      expect(byName["deadline-during-backoff"]).toMatchObject({
        outcome: "timeout",
        runStatus: "aborted",
        endStatus: "aborted",
        endKind: "timeout",
        requests: 1,
        doctorOk: true,
      });

      for (const name of ["abort-during-request", "abort-during-backoff", "deadline-during-backoff"]) {
        expect({ name, bounded: byName[name]!.settleMs < 1_000 }).toEqual({ name, bounded: true });
      }
    },
    60_000,
  );
});
