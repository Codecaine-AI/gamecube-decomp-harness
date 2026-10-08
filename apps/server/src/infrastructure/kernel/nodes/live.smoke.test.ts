// Opt-in live smoke (plan §7.3): MODEL_NODES_LIVE=1 runs one ContractProbe and
// one ExtractCheckpointKnowledge call through codex-lb with the real generated
// client and the production node-kernel config, on a temp kernel database,
// then scans that database for credential values. Never part of verify.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

import { runTraceDoctor } from "@agent-kernel/kernel/doctor";

import { MELEE_KERNEL_ID } from "../bridge/config.js";
import { upsertMeleeContainer } from "../bridge/database.js";
import { closeDefaultMeleeKernelRuntime, getDefaultMeleeKernelRuntime } from "../bridge/runtime.js";
import { closeNodeKernel, getNodeKernel } from "./node-kernel";

const CODEX_LB = { hostname: "127.0.0.1", port: 2455 };
const LIVE = process.env.MODEL_NODES_LIVE === "1";
const DB_ENV = ["ORCH_AGENT_KERNEL_DB_PATH", "AGENT_KERNEL_DB_PATH", "ORCH_AGENT_KERNEL_DATABASE_URL", "AGENT_KERNEL_DATABASE_URL"];

function piAgentDir(): string {
  const configured = process.env.PI_CODING_AGENT_DIR;
  if (!configured) return join(homedir(), ".pi", "agent");
  return configured.startsWith("~/") ? join(homedir(), configured.slice(2)) : configured;
}

/** Credential values the database must never hold. Read here, never printed. */
function credentialValues(): string[] {
  const values = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value === "string" && value.length >= 8 && !/^[A-Z][A-Z0-9_]*$/.test(value)) values.add(value);
  };
  for (const file of ["models.json", "auth.json"]) {
    const path = join(piAgentDir(), file);
    if (!existsSync(path)) continue;
    const visit = (node: unknown, key = ""): void => {
      if (Array.isArray(node)) node.forEach((item) => visit(item, key));
      else if (node && typeof node === "object") for (const [k, v] of Object.entries(node)) visit(v, k);
      else if (/api[-_]?key|token|secret|authorization|access|refresh/i.test(key)) add(node);
    };
    visit(JSON.parse(readFileSync(path, "utf8")));
  }
  for (const name of ["TYPESAFE_API_KEY", "CODEX_LB_API_KEY", "OPENAI_API_KEY"]) add(process.env[name]);
  return [...values];
}

async function codexLbReachable(): Promise<boolean> {
  try {
    const socket = await Bun.connect({ ...CODEX_LB, socket: { data() {} } });
    socket.end();
    return true;
  } catch {
    return false;
  }
}

let skipReason: string | null = LIVE ? null : "MODEL_NODES_LIVE is not 1";
let stateDir = "";
const savedDbEnv = DB_ENV.map((name) => [name, process.env[name]] as const);

beforeAll(async () => {
  if (skipReason === null && !(await codexLbReachable())) skipReason = `codex-lb is not reachable at ${CODEX_LB.hostname}:${CODEX_LB.port}`;
  if (skipReason !== null) {
    console.log(`[live.smoke] skipped: ${skipReason}`);
    return;
  }
  // Isolated store: the kernel DB lands in a temp state dir, never a configured one.
  stateDir = mkdtempSync(join(tmpdir(), "mn-live-nodes-"));
  for (const name of DB_ENV) delete process.env[name];
});

afterAll(async () => {
  if (!stateDir) return;
  await closeNodeKernel();
  await closeDefaultMeleeKernelRuntime();
  for (const [name, value] of savedDbEnv) if (value !== undefined) process.env[name] = value;
  rmSync(stateDir, { recursive: true, force: true });
});

describe.skipIf(!LIVE)("node kernel live smoke", () => {
  test(
    "ContractProbe and ExtractCheckpointKnowledge through codex-lb leave no credential in the kernel DB",
    async () => {
      if (skipReason !== null) return;
      const kernel = await getNodeKernel({ stateDir });
      const runtime = await getDefaultMeleeKernelRuntime();
      expect(kernel).not.toBeNull();
      const containerId = `melee:live-smoke-${randomUUID()}:session`;
      const now = new Date().toISOString();
      await upsertMeleeContainer(runtime!.db, {
        id: containerId,
        kernelId: MELEE_KERNEL_ID,
        kind: "session",
        appKey: [containerId],
        parentContainerId: null,
        label: containerId,
        status: "running",
        workingDir: null,
        phase: null,
        phaseVocabulary: [],
        metadata: {},
        createdAt: now,
        startedAt: now,
      });

      const probe = await kernel!.call("ContractProbe", ["The quick brown fox."], { containerId });
      expect(typeof probe.ok).toBe("boolean");

      const knowledge = await kernel!.call(
        "ExtractCheckpointKnowledge",
        [
          JSON.stringify({
            summary: "Matched fn_8018F00C exactly by reading the four const pointer objects through pointer lvalues.",
            review_justification:
              "The four type-erasing casts read pointer-valued objects at their declared width. They are required because the declarations are `char* const`, so MWCC folds the null initializers and breaks codegen; making them mutable regresses the data sections.",
          }),
          [
            {
              id: "A1",
              rule_id: "type_erasing_cast",
              severity: "warning",
              file: "src/melee/gm/gmtoulib.c",
              line: 1869,
              excerpt: "templates_800[0] = *(char**) &lbl_804DA6C4;",
              message: "Added type-erasing cast `(char**)`.",
            },
          ],
        ],
        { containerId },
      );
      expect(knowledge.advisories).toHaveLength(1);
      expect(knowledge.advisories[0]?.finding_id).toBe("A1");
      expect(knowledge.advisories[0]?.justification ?? "").not.toBe("");

      expect((await runTraceDoctor(runtime!.db as Parameters<typeof runTraceDoctor>[0])).ok).toBe(true);
      const databasePath = runtime!.databasePath!;
      await closeNodeKernel();
      await closeDefaultMeleeKernelRuntime();

      const secrets = credentialValues();
      const files = [databasePath, `${databasePath}-wal`, `${databasePath}-shm`].filter(existsSync).map((file) => readFileSync(file));
      // Boolean assertions only, so a failure never prints a credential.
      const leaked = secrets.filter((secret) => files.some((bytes) => bytes.includes(Buffer.from(secret)))).length;
      expect(leaked).toBe(0);
    },
    180_000,
  );
});
