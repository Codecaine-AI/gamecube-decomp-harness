#!/usr/bin/env bun
/**
 * Fake Daytona for the dry-run load test: one HTTP process that the
 * orchestrator and every worker child share (see lib/daytona.ts
 * `httpFakeClient`). It models what the harness depends on:
 *
 * - control plane: create/get/list/delete/stop/start with latency, an account
 *   quota (concurrent sandboxes) and a request-rate limit, both answered with
 *   HTTP 429 like the real API, plus optional random 429/502 injection;
 * - toolbox: sessions, exec and file transfer with per-step latency;
 * - sandbox semantics: a per-sandbox file map over the scratch checkout (the
 *   claim base), so `git diff`, `cat`, uploads and the QA/steering python
 *   snippets behave consistently with the canned edit;
 * - tool outputs: objdiff, steering_check edits/reduce/mwcc/decide, scan_diff,
 *   mwcc_alloc decisions and compare_sources, shaped like the real tools
 *   (steering outputs come from the harness's own real-output fixtures).
 *
 * Latencies are modelled seconds for the SMS 1-core 2 GiB profile, multiplied
 * by --time-scale. They are assumptions, not measurements: the live run
 * replaces them.
 *
 * Usage: bun fake-daytona-server.ts --port-file <path> --seed-root <checkout>
 *          --workspace-root /work/sms --targets <targets.json> [--time-scale 0.02]
 *          [--quota 250] [--rate-limit-rps 0] [--inject-429 0] [--inject-502 0]
 */
import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { posix, resolve } from "node:path";
import { classifyCommand, parseSandboxCommand } from "./lib/commands.js";
import { envEventSink } from "./lib/events.js";
import { unifiedDiff } from "./lib/udiff.js";

export interface FakeTarget {
  kind: string;
  unit: string;
  symbol: string;
  sourcePath: string;
  baseScore: number;
  afterScore: number;
  expectedVerdict: string;
}

export interface FakeWorldOptions {
  seedRoot: string;
  workspaceRoot: string;
  targets: FakeTarget[];
  timeScale: number;
  quota: number;
  rateLimitRps: number;
  inject429: number;
  inject502: number;
  /** Fraction of native decisions captures answered `status: "unavailable"` (tests the measurement gate). */
  nativeUnavailable?: number;
  random?: () => number;
}

/** Modelled seconds per step on the 1-core profile (scaled by --time-scale). */
export const STEP_SECONDS: Record<string, number> = {
  "sandbox.create": 1.2,
  "sandbox.delete": 0.8,
  "sandbox.get": 0.05,
  "sandbox.list": 0.1,
  "session": 0.03,
  "fs": 0.08,
  exec_overhead: 0.07,
  build: 8,
  objdiff: 0.6,
  format_check: 0.3,
  qa_lint: 3,
  steering_placement_probe: 0.4,
  steering_edits: 1.5,
  qa_diff: 0.3,
  stack_check: 1.5,
  edit_scope: 1,
  source_query: 0.2,
  steering_reduce: 20,
  steering_mwcc: 25,
  steering_decide: 6,
  native_decisions: 10,
  compare_sources: 25,
  unused_stub_test: 15,
  provision_git: 0.5,
  provision_checkout: 0.6,
};

interface FakeSandbox {
  id: string;
  labels: Record<string, string>;
  files: Map<string, Buffer>;
  deleted: Set<string>;
  createdAt: number;
  deletedAt: number | null;
  state: "started" | "stopped";
  sessions: Set<string>;
  /** Revision the provisioning checkout detached to (the claim base). */
  head: string;
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

const sha256 = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");

export class FakeWorld {
  readonly sandboxes = new Map<string, FakeSandbox>();
  /** Files every new sandbox starts with: the snapshot image (filled by `bake`). */
  readonly image = new Map<string, Buffer>();
  /** Commits the image's .git holds besides the checkout (baked trusted bases, provisioning's revision probe). */
  readonly imageRevs = new Set<string>();
  readonly counters: Record<string, number> = {};
  readonly stepCounts: Record<string, number> = {};
  peakAlive = 0;
  private readonly seedCache = new Map<string, Buffer | null>();
  private readonly targetsBySymbol = new Map<string, FakeTarget>();
  private readonly targetsByPath = new Map<string, FakeTarget[]>();
  private readonly targetsByUnit = new Map<string, FakeTarget>();
  private windowStart = Date.now();
  private windowCount = 0;
  private nextId = 1;
  private readonly random: () => number;
  private readonly sink = envEventSink("fake-daytona");

  constructor(readonly options: FakeWorldOptions) {
    this.random = options.random ?? Math.random;
    for (const target of options.targets) {
      this.targetsBySymbol.set(target.symbol, target);
      this.targetsByUnit.set(target.unit, target);
      const list = this.targetsByPath.get(target.sourcePath) ?? [];
      list.push(target);
      this.targetsByPath.set(target.sourcePath, list);
    }
  }

  private count(key: string): void { this.counters[key] = (this.counters[key] ?? 0) + 1; }

  alive(): number {
    let n = 0;
    for (const sandbox of this.sandboxes.values()) if (sandbox.deletedAt === null) n += 1;
    return n;
  }

  sandboxMinutes(): number {
    const now = Date.now();
    let ms = 0;
    for (const sandbox of this.sandboxes.values()) ms += (sandbox.deletedAt ?? now) - sandbox.createdAt;
    return ms / 60_000;
  }

  async sleep(seconds: number): Promise<void> {
    const ms = seconds * this.options.timeScale * 1000;
    if (ms > 0) await new Promise((r) => setTimeout(r, ms));
  }

  /** Request-rate limit and injected faults; called for every API request. */
  admit(op: string): void {
    this.count(`api:${op}`);
    const now = Date.now();
    if (now - this.windowStart >= 1000) { this.windowStart = now; this.windowCount = 0; }
    this.windowCount += 1;
    if (this.options.rateLimitRps > 0 && this.windowCount > this.options.rateLimitRps) {
      this.count("http:429:rate");
      throw new HttpError(429, "Too Many Requests: rate limit");
    }
    if (this.options.inject429 > 0 && this.random() < this.options.inject429) { this.count("http:429:injected"); throw new HttpError(429, "Too Many Requests (injected)"); }
    if (this.options.inject502 > 0 && this.random() < this.options.inject502) { this.count("http:502:injected"); throw new HttpError(502, "502 Bad Gateway (injected)"); }
  }

  sandbox(id: string): FakeSandbox {
    const sandbox = this.sandboxes.get(id);
    if (!sandbox || sandbox.deletedAt !== null) throw new HttpError(404, `Sandbox with ID ${id} not found`);
    return sandbox;
  }

  async create(params: { labels?: Record<string, string> }): Promise<{ id: string; labels: Record<string, string> }> {
    // Creates in flight hold quota too, as Daytona reserves the resources at request time.
    const inflight = this.counters.create_inflight ?? 0;
    if (this.alive() + inflight >= this.options.quota) {
      this.count("http:429:quota");
      throw new HttpError(429, `Total CPU quota exceeded: ${this.options.quota} sandboxes`);
    }
    // Create latency grows with concurrent creates in flight (runner contention).
    this.counters.create_inflight = inflight + 1;
    try {
      await this.sleep(STEP_SECONDS["sandbox.create"]! * (1 + inflight / 100));
    } finally {
      this.counters.create_inflight = (this.counters.create_inflight ?? 1) - 1;
    }
    const id = `fake-${this.nextId++}-${randomUUID().slice(0, 8)}`;
    this.sandboxes.set(id, { id, labels: { ...(params.labels ?? {}) }, files: new Map(this.image), deleted: new Set(), createdAt: Date.now(), deletedAt: null, state: "started", sessions: new Set(), head: "HEAD" });
    this.peakAlive = Math.max(this.peakAlive, this.alive());
    return { id, labels: { ...(params.labels ?? {}) } };
  }

  async remove(id: string): Promise<void> {
    const sandbox = this.sandbox(id);
    await this.sleep(STEP_SECONDS["sandbox.delete"]!);
    sandbox.deletedAt = Date.now();
    sandbox.files.clear();
  }

  list(labels: Record<string, string>): Array<{ id: string; labels: Record<string, string> }> {
    return [...this.sandboxes.values()]
      .filter((s) => s.deletedAt === null && Object.entries(labels).every(([k, v]) => s.labels[k] === v))
      .map((s) => ({ id: s.id, labels: { ...s.labels } }));
  }

  /** Copies the named files of one sandbox into the image (the "baked snapshot"). */
  bake(id: string, paths: string[], revs: string[] = []): string[] {
    const sandbox = this.sandbox(id);
    const baked: string[] = [];
    for (const path of paths) {
      const content = sandbox.files.get(path);
      if (content) { this.image.set(path, content); baked.push(path); }
    }
    for (const rev of revs) this.imageRevs.add(rev);
    return baked;
  }

  // ---- sandbox file semantics -------------------------------------------------

  private seed(rel: string): Buffer | null {
    if (this.seedCache.has(rel)) return this.seedCache.get(rel)!;
    const path = resolve(this.options.seedRoot, rel);
    const content = existsSync(path) ? readFileSync(path) : null;
    this.seedCache.set(rel, content);
    return content;
  }

  private abs(cwd: string | null, path: string): string {
    return posix.resolve(cwd ?? this.options.workspaceRoot, path);
  }

  private workspaceRel(abs: string): string | null {
    const root = this.options.workspaceRoot;
    return abs === root ? "" : abs.startsWith(`${root}/`) ? abs.slice(root.length + 1) : null;
  }

  read(sandbox: FakeSandbox, abs: string): Buffer | null {
    if (sandbox.deleted.has(abs)) return null;
    const own = sandbox.files.get(abs);
    if (own) return own;
    const rel = this.workspaceRel(abs);
    return rel !== null && rel !== "" ? this.seed(rel) : null;
  }

  write(sandbox: FakeSandbox, abs: string, content: Buffer): void {
    sandbox.deleted.delete(abs);
    sandbox.files.set(abs, content);
  }

  /** Paths image-backed directories answer for (`test -f /opt/toolpacks/...` once the toolpack is baked). */
  private exists(sandbox: FakeSandbox, abs: string): boolean {
    if (this.read(sandbox, abs)) return true;
    if (abs.startsWith("/opt/toolpacks/")) return [...sandbox.files.keys()].some((p) => p.startsWith("/opt/toolpacks/") && p.endsWith("/.ready"));
    if (abs.startsWith("/opt/build-orchestrator/")) return sandbox.files.has("/opt/build-orchestrator/.qa-ready");
    if (abs === "/opt/mwcc" || abs.startsWith("/opt/refs") || abs.startsWith("/usr/bin/clang-21")) return true;
    const rel = this.workspaceRel(abs);
    if (rel?.startsWith("build/tools/")) return true;
    return false;
  }

  /** Workspace files changed against the claim base (the canned edit and anything the gate wrote under src/include/libs). */
  changedSources(sandbox: FakeSandbox): Array<{ rel: string; before: string; after: string }> {
    const out: Array<{ rel: string; before: string; after: string }> = [];
    for (const [abs, content] of sandbox.files) {
      const rel = this.workspaceRel(abs);
      if (!rel || !/^(src|include|libs)\//.test(rel)) continue;
      const before = this.seed(rel);
      if (before && before.equals(content)) continue;
      out.push({ rel, before: before?.toString("utf8") ?? "", after: content.toString("utf8") });
    }
    return out.sort((a, b) => a.rel.localeCompare(b.rel));
  }

  private targetFor(argv: string[], sandbox: FakeSandbox): FakeTarget | null {
    for (const arg of argv) {
      for (const piece of arg.split(",")) {
        const target = this.targetsBySymbol.get(piece);
        if (target) return target;
      }
    }
    for (const arg of argv) {
      const target = this.targetsByUnit.get(arg) ?? this.targetsByPath.get(arg)?.[0];
      if (target) return target;
    }
    for (const changed of this.changedSources(sandbox)) {
      const list = this.targetsByPath.get(changed.rel);
      if (list?.length) return list[0]!;
    }
    return null;
  }

  // ---- exec -------------------------------------------------------------------

  async exec(id: string, command: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    const sandbox = this.sandbox(id);
    if (sandbox.state !== "started") throw new HttpError(409, `sandbox ${id} is stopped`);
    const parsed = parseSandboxCommand(command);
    const step = classifyCommand(parsed.argv);
    this.stepCounts[step] = (this.stepCounts[step] ?? 0) + 1;
    await this.sleep(STEP_SECONDS.exec_overhead! + (STEP_SECONDS[step] ?? 0.05));
    let result: { exitCode: number; stdout: string; stderr: string };
    try {
      result = this.respond(sandbox, parsed.argv, parsed.cwd, step);
    } catch (error) {
      result = { exitCode: 1, stdout: "", stderr: `fake-daytona: ${error instanceof Error ? error.message : String(error)}` };
    }
    if (process.env.SCALE_FAKE_TRACE) {
      appendFileSync(process.env.SCALE_FAKE_TRACE, `${JSON.stringify({ id, step, cwd: parsed.cwd, argv: parsed.argv.map((a) => a.slice(0, 400)), exitCode: result.exitCode, stdout: result.stdout.slice(0, 400), stderr: result.stderr.slice(0, 200) })}\n`);
    }
    return result;
  }

  private ok(stdout = ""): { exitCode: number; stdout: string; stderr: string } {
    return { exitCode: 0, stdout, stderr: "" };
  }

  private respond(sandbox: FakeSandbox, argv: string[], cwd: string | null, step: string): { exitCode: number; stdout: string; stderr: string } {
    const [cmd = "", a1 = "", a2 = ""] = argv;
    const base = cmd.split("/").at(-1) ?? cmd;
    const abs = (path: string) => this.abs(cwd, path);
    if (base === "test") {
      const paths = argv.slice(1).filter((arg, i, all) => arg !== "-a" && !arg.startsWith("-") && (i === 0 || all[i - 1]!.startsWith("-")));
      return paths.every((path) => path === "." || this.exists(sandbox, abs(path))) ? this.ok() : { exitCode: 1, stdout: "", stderr: "" };
    }
    if (base === "cat") {
      const content = this.read(sandbox, abs(a1));
      return content ? this.ok(content.toString("utf8")) : { exitCode: 1, stdout: "", stderr: `cat: ${a1}: No such file or directory` };
    }
    if (base === "mkdir" || base === "rm" || base === "ln") return this.ok();
    if (base === "git") return this.git(sandbox, argv, cwd);
    if (base === "ninja") return this.ok("ninja: no work to do.\n");
    if (base === "objdiff-cli") return this.objdiff(sandbox, argv);
    if (base.startsWith("clang-format")) return this.ok(argv.includes("--version") ? "Ubuntu clang-format version 21.1.8 (++20250101)\n" : "");
    if (base === "python3" || base === "python") return this.python(sandbox, argv, cwd, step);
    if (base === "bash" || base === "sh" || cmd.startsWith("/bin/sh")) {
      if (a2.includes("ninja")) return this.ok("ninja: no work to do.\n");
      if (a2.includes("git cat-file -e")) {
        // provisioning's probe: which wanted revisions the image already holds
        const dash = argv.indexOf("--");
        const revs = dash >= 0 ? argv.slice(dash + 1) : [];
        return this.ok(revs.filter((rev) => this.imageRevs.has(rev)).map((rev) => `${rev}\n`).join(""));
      }
      if (a2.includes("python3")) {
        // `bash -lc 'mkdir -p ... && exec python3 "$@"' -- <script> args` (workspace-tool-exec.ts).
        const dash = argv.indexOf("--");
        if (dash >= 0) return this.python(sandbox, ["python3", ...argv.slice(dash + 1)], cwd, classifyCommand(["python3", ...argv.slice(dash + 1)]));
      }
      return this.ok();
    }
    return this.ok();
  }

  private git(sandbox: FakeSandbox, argv: string[], cwd: string | null): { exitCode: number; stdout: string; stderr: string } {
    const sub = argv[1];
    const rest = argv.slice(2);
    const pathsAfterDash = () => { const i = rest.indexOf("--"); return i >= 0 ? rest.slice(i + 1) : rest.filter((a) => !a.startsWith("-")); };
    const diffText = (paths: string[] | null) => this.changedSources(sandbox)
      .filter((c) => !paths?.length || paths.some((p) => c.rel === p || c.rel.startsWith(`${p.replace(/\/$/, "")}/`)))
      .map((c) => unifiedDiff(c.rel, c.before, c.after)).join("");
    if (sub === "rev-parse") {
      const rev = (rest.find((a) => !a.startsWith("-")) ?? "HEAD").replace(/\^\{commit\}$/, "");
      return this.ok(`${rev === "HEAD" ? sandbox.head : rev}\n`);
    }
    if (sub === "bundle") return this.read(sandbox, "/tmp/melee-claim-seed.bundle") ? this.ok("The bundle is okay\n") : { exitCode: 1, stdout: "", stderr: "error: could not open bundle" };
    if (sub === "checkout") { const rev = rest.filter((a) => !a.startsWith("-")).at(-1); if (rev) sandbox.head = rev; return this.ok(); }
    if (sub === "fetch" || sub === "cat-file" || sub === "update-index" || sub === "add" || sub === "reset") return this.ok();
    if (sub === "show") {
      const spec = rest.find((a) => a.includes(":")) ?? "";
      const content = this.seedRel(spec.slice(spec.indexOf(":") + 1));
      return content ? this.ok(content.toString("utf8")) : { exitCode: 128, stdout: "", stderr: `fatal: path '${spec}' does not exist` };
    }
    if (sub === "status") return this.ok(this.changedSources(sandbox).map((c) => ` M ${c.rel}\n`).join(""));
    if (sub === "diff") {
      if (rest.includes("--name-only")) return this.ok(this.changedSources(sandbox).map((c) => `${c.rel}\n`).join(""));
      if (rest.includes("--quiet")) return { exitCode: this.changedSources(sandbox).length ? 1 : 0, stdout: "", stderr: "" };
      const output = rest.find((a) => a.startsWith("--output="));
      const text = diffText(pathsAfterDash().filter((p) => !p.startsWith("--")));
      if (output) { this.write(sandbox, this.abs(cwd, output.slice("--output=".length)), Buffer.from(text)); return this.ok(); }
      return { exitCode: rest.includes("--exit-code") && text ? 1 : 0, stdout: text, stderr: "" };
    }
    return this.ok();
  }

  private seedRel(rel: string): Buffer | null { return this.seed(rel); }

  private objdiff(sandbox: FakeSandbox, argv: string[]): { exitCode: number; stdout: string; stderr: string } {
    const target = this.targetFor(argv, sandbox);
    const changed = target ? this.changedSources(sandbox).some((c) => c.rel === target.sourcePath) : false;
    const score = target ? (changed ? target.afterScore : target.baseScore) : 100;
    const name = target?.symbol ?? "unknown";
    return this.ok(JSON.stringify({
      left: {
        sections: [{ name: ".text", fuzzy_match_percent: score, size: 256 }],
        symbols: [{ name, fuzzy_match_percent: score, size: 256, instructions: [] }],
      },
      right: { sections: [{ name: ".text", size: 256 }], symbols: [{ name, size: 256 }] },
    }));
  }

  private python(sandbox: FakeSandbox, argv: string[], cwd: string | null, step: string): { exitCode: number; stdout: string; stderr: string } {
    const abs = (path: string) => this.abs(cwd, path);
    if (argv[1] === "-c") {
      const script = argv[2] ?? "";
      const args = argv.slice(3);
      if (script.includes("ORCH_IR_ORACLE_CLANG")) {
        return this.ok(JSON.stringify({ clang: "/usr/bin/clang-21", executable: true, version: "Ubuntu clang version 21.1.8 (++20250101)", macros: { __clang_major__: "21" }, demangler: "/usr/bin/llvm-cxxfilt" }));
      }
      if (script.includes("json.loads(sys.argv[1]).items()")) {
        const files = JSON.parse(args[0] ?? "{}") as Record<string, string>;
        const out: Record<string, string> = {};
        for (const [path, b64] of Object.entries(files)) { const bytes = Buffer.from(b64, "base64"); this.write(sandbox, abs(path), bytes); out[path] = sha256(bytes); }
        return this.ok(JSON.stringify(out));
      }
      if (script.includes("base64.b64decode(sys.argv[3])")) {
        const [path = "", mode = "wb", chunk = ""] = args;
        const bytes = Buffer.from(chunk, "base64");
        const prior = mode === "ab" ? this.read(sandbox, abs(path)) ?? Buffer.alloc(0) : Buffer.alloc(0);
        this.write(sandbox, abs(path), Buffer.concat([prior, bytes]));
        return this.ok();
      }
      if (script.includes("hashlib.sha256(open(sys.argv[1]")) {
        const content = this.read(sandbox, abs(args[0] ?? ""));
        return content ? this.ok(`${sha256(content)}\n`) : { exitCode: 1, stdout: "", stderr: "FileNotFoundError" };
      }
      if (script.includes("subprocess.run(command + ['-o', report_path]")) return this.unitReportJob(sandbox, args);
      if (script.includes("'copied': copied, 'revs': revs")) {
        // SANDBOX_SNAPSHOT_PY (sandbox-scan.ts): pre-attempt copies plus the HEAD rev of unchanged files.
        const [root = "", pathsJson = "[]"] = args;
        const copied: string[] = [];
        const revs: Record<string, string> = {};
        for (const rel of JSON.parse(pathsJson) as string[]) {
          const content = this.read(sandbox, abs(rel));
          if (!content) continue;
          if (this.seed(rel)?.equals(content)) revs[rel] = sandbox.head;
          this.write(sandbox, posix.join(abs(root), rel), content);
          copied.push(rel);
        }
        return this.ok(JSON.stringify({ copied, revs }));
      }
      if (script.includes("snapshotted %d baseline object")) return this.ok(`snapshotted 0 baseline object(s) into ${args[0] ?? ""}\n`);
      if (script.includes("request['fullPaths']")) {
        const request = JSON.parse(args[0] ?? "{}") as { paths: string[]; fullPaths: string[]; snapshotDir: string | null; snapshotPaths: string[] };
        const post: Record<string, unknown> = {};
        const baseFiles: Record<string, unknown> = {};
        for (const rel of request.paths ?? []) {
          const current = this.read(sandbox, abs(rel));
          if (current) post[rel] = { full: current.toString("utf8") };
          const pre = request.snapshotDir && request.snapshotPaths?.includes(rel) ? this.read(sandbox, posix.join(abs(request.snapshotDir), rel)) : null;
          if (pre) baseFiles[rel] = { full: pre.toString("utf8") };
        }
        return this.ok(JSON.stringify({ post, base: baseFiles, globals: [] }));
      }
      if (script.includes("'all': present, 'globals': globals_")) return this.ok(JSON.stringify({ all: [], globals: [] }));
      if (script.includes("import struct,sys")) return this.ok("");
      if (script.includes("shutil.copyfile(rel, dest)")) {
        // SANDBOX_SNAPSHOT_PY: copy the pre-attempt sources into a snapshot dir.
        const [root = "", pathsJson = "[]"] = args;
        const copied: string[] = [];
        for (const rel of JSON.parse(pathsJson) as string[]) {
          const content = this.read(sandbox, abs(rel));
          if (content) { this.write(sandbox, posix.join(abs(root), rel), content); copied.push(rel); }
        }
        return this.ok(JSON.stringify(copied));
      }
      if (script.includes("'git', 'show', 'HEAD:' + rel")) {
        const [root = "", rel = ""] = args;
        const content = this.seed(rel);
        if (!content) return { exitCode: 128, stdout: "", stderr: `fatal: path '${rel}' does not exist in 'HEAD'` };
        this.write(sandbox, posix.join(abs(root), rel), content);
        return this.ok();
      }
      if (script.includes("'--no-index'")) {
        // SANDBOX_QA_DIFF_PY: snapshot copy vs current file, repo-relative headers.
        const [snap = "", , patchPath = "", pathsJson = "[]"] = args;
        const sections: string[] = [];
        for (const rel of JSON.parse(pathsJson) as string[]) {
          const pre = this.read(sandbox, posix.join(abs(snap), rel));
          const current = this.read(sandbox, abs(rel));
          if (!pre || !current) continue;
          const diff = unifiedDiff(rel, pre.toString("utf8"), current.toString("utf8"));
          if (diff) sections.push(diff.replace(/\n$/, ""));
        }
        const patch = sections.length ? `${sections.join("\n")}\n` : "";
        if (patch) this.write(sandbox, abs(patchPath), Buffer.from(patch));
        return this.ok(JSON.stringify({ sections: sections.length, patch }));
      }
      return this.ok();
    }
    const target = this.targetFor(argv, sandbox);
    switch (step) {
      case "steering_edits": return this.ok(JSON.stringify(this.steeringEdits(sandbox, argv)));
      case "steering_reduce": {
        const out = this.steeringReduce(sandbox, target);
        const outPath = argv[argv.indexOf("--out") + 1];
        if (argv.includes("--out") && outPath) this.write(sandbox, abs(outPath), Buffer.from(JSON.stringify(out)));
        return this.ok(JSON.stringify(out));
      }
      case "steering_mwcc": return this.ok(JSON.stringify(this.steeringMwcc(target)));
      case "steering_decide": return this.ok(JSON.stringify(this.steeringDecide(target)));
      case "qa_lint": return this.ok(JSON.stringify({ tool: "review_lint", operation: "review_lint:scan_diff", status: "passed", repo: cwd ?? this.options.workspaceRoot, base: null, findings: [], counts: { errors: 0, warnings: 0 } }));
      case "native_decisions": {
        if ((this.options.nativeUnavailable ?? 0) > 0 && this.random() < this.options.nativeUnavailable!) {
          this.count("native:unavailable:injected");
          return this.ok(JSON.stringify({ backend: "native", capture: "decisions", status: "unavailable", unavailable: "trace-overflow (injected)" }));
        }
        // snapshot.py --capture decisions: a capture envelope; the decisions document is the decisions.json it names.
        const doc = this.decisions(target, argv);
        const outDir = `build/mwcc_alloc/native/${String(doc.function)}`;
        this.write(sandbox, abs(`${outDir}/decisions.json`), Buffer.from(JSON.stringify(doc)));
        return this.ok(JSON.stringify(this.captureEnvelope(doc, outDir)));
      }
      case "compare_sources": {
        // compare_sources.py: the diff on stdout, the whole diff saved at full_report.
        const diff = this.compareSources(target, argv);
        const fullReport = `build/mwcc_alloc/compare/${String(diff.function)}/decision-diff.json`;
        this.write(sandbox, abs(fullReport), Buffer.from(JSON.stringify(diff)));
        return this.ok(JSON.stringify({ ...diff, full_report: fullReport, changes_truncated: false }));
      }
      case "edit_scope": {
        // scope_inputs as edit_scope.py writes them: the changed files as git blob ids (what integration re-verifies).
        // edit_scope.py in_scope: src/**, include/**, libs/<lib>/include/** (never libs/<lib>/src).
        const inScope = (rel: string) => { const parts = rel.split("/"); return parts[0] === "src" || parts[0] === "include" || (parts[0] === "libs" && parts.length > 3 && parts[2] === "include"); };
        const changed = this.changedSources(sandbox).filter((c) => inScope(c.rel));
        const blob = (bytes: Buffer | null) => (bytes ? createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex") : null);
        return this.ok(JSON.stringify({
          verdict: "pass",
          hunks: changed.map((c) => ({ file: c.rel, line: 1, class: null, verdict: "own_class", reason: "load test" })),
          warnings: [],
          identity: { base_rev: sandbox.head, patch_sha256: null, readiness: null },
          scope_inputs: { files: changed.map((c) => ({ path: c.rel, before_blob: blob(this.seed(c.rel)), after_blob: blob(this.read(sandbox, posix.join(this.options.workspaceRoot, c.rel))) })), owner_sources: changed.map((c) => c.rel) },
        }));
      }
      case "unused_stub_test": return this.ok(JSON.stringify({ status: "ok", verdict: "inconclusive", function: target?.symbol ?? null }));
      default: return this.ok(JSON.stringify({ status: "ok" }));
    }
  }

  // ---- tool output models -------------------------------------------------------

  private fixture(name: string): Record<string, unknown> {
    return JSON.parse(readFileSync(resolve(import.meta.dir, "../../../apps/server/src/core/validation/steering/__fixtures__", name), "utf8"));
  }

  /** UNIT_REPORT_JOB_PY (unit-report-summary.ts): objdiff to a sandbox file, bounded summary on stdout. */
  private unitReportJob(sandbox: FakeSandbox, args: string[]): { exitCode: number; stdout: string; stderr: string } {
    const [mode = "rows", reportPath = "", commandJson = "[]"] = args;
    const command = JSON.parse(commandJson) as string[];
    const target = this.targetFor(command, sandbox);
    const changed = target ? this.changedSources(sandbox).some((c) => c.rel === target.sourcePath) : false;
    const score = target ? (changed ? target.afterScore : target.baseScore) : 100;
    const name = target?.symbol ?? "unknown";
    const size = String(target ? 256 : 0);
    const base = { schema: "worker-unit-report-summary-v2", exit_code: 0, stdout: "", stderr: "", report_path: reportPath, report_error: null, is_object: true };
    if (mode === "first_diff") {
      return this.ok(JSON.stringify({ ...base, first_diff: { targets: [{ side: "left", match_percent: score }, { side: "right", match_percent: score }], rows: [], counts: {}, total: 0 } }));
    }
    const side = { sections: [{ name: ".text", size, match_percent: score, fuzzy_match_percent: score }], symbols: [{ name, size, match_percent: score, fuzzy_match_percent: score, instructions: [] }] };
    return this.ok(JSON.stringify({ ...base, report: { left: side, right: { sections: [{ name: ".text", size }], symbols: [{ name, size, instructions: [] }] } } }));
  }

  private steeringEdits(sandbox: FakeSandbox, argv: string[]): Record<string, unknown> {
    const changes = this.changedSources(sandbox);
    const editsHash = sha256(changes.map((c) => `${c.rel}\0${c.after}`).join("\n"));
    return {
      tool: "steering_check", version: 1, edits_hash: editsHash, base_rev: argv[argv.indexOf("--base-ref") + 1] ?? null,
      changed_files: changes.map((c) => c.rel),
      edits: changes.map((c, i) => ({ id: `${c.rel}#${i}.0`, file: c.rel, line: 1, base_lines: [], cand_lines: [] })),
    };
  }

  private steeringReduce(sandbox: FakeSandbox, target: FakeTarget | null): Record<string, unknown> {
    const name = target?.kind === "clean_fix" ? "reduce-real-pass.json" : "reduce-real.json";
    const reduce = this.fixture(name);
    const files = this.changedSources(sandbox).map((c) => c.rel);
    return { ...reduce, changed_files: files.length ? files : reduce.changed_files };
  }

  private steeringMwcc(target: FakeTarget | null): Record<string, unknown> {
    return {
      tool: "steering_check", version: 1,
      functions: target ? [{ unit: target.unit, name: target.symbol, match: { base: target.baseScore, candidate: target.afterScore, real_only: target.kind === "steering" ? target.baseScore : target.afterScore } }] : [],
    };
  }

  private steeringDecide(target: FakeTarget | null): Record<string, unknown> {
    const verdict = target?.expectedVerdict ?? "pass";
    const decide = this.fixture(verdict === "pass" || verdict === "certified" ? "decide-real-pass.json" : "decide-real.json");
    const functions = (decide.functions as Array<Record<string, unknown>>).map((row) => ({
      ...row,
      unit: target?.unit ?? row.unit,
      name: target?.symbol ?? row.name,
      demangled: target?.symbol ?? row.demangled,
      decision: verdict === "steering_located" ? "steering_located" : verdict === "evidence_review" ? "steering_located" : "pass",
      match: target ? { base: target.baseScore, candidate: target.afterScore, real_only: verdict === "steering_located" ? target.baseScore : target.afterScore } : row.match,
    })).slice(0, 1);
    const reviews = verdict === "evidence_review" && target ? [{
      group: `${target.sourcePath}@0.0`, game: "sms", base_rev: null, units: [target.unit], targets: [{ unit: target.unit, name: target.symbol }],
      functions: [target.symbol], site_file: target.sourcePath, site_lines: [1, 1], group_digest: sha256(`${target.symbol}:review`),
      callee: "accessor", symbol: target.symbol, provenance: "fake-daytona", patch: null, edit_ids: [`${target.sourcePath}#0.0`],
      shapes: ["accessor_swap"], real_shapes: [], reason: "map-backed construct needs a site-bound approval",
    }] : [];
    return {
      ...decide,
      attempt: verdict === "pass" || verdict === "certified" ? "pass" : "steering_located",
      functions,
      ...(reviews.length ? { evidence_reviews: reviews } : {}),
      probes: verdict === "steering_located" && target ? [{ function: target.symbol, unit: target.unit, steering_edits: [{ file: target.sourcePath, line: 1, shapes: ["temp_alias"] }] }] : [],
    };
  }

  private decisions(target: FakeTarget | null, argv: string[]): Record<string, unknown> {
    const fn = argv[argv.indexOf("--function") + 1] ?? target?.symbol ?? "unknown";
    return {
      status: "ok", schema: "mwcc-decisions-v1", function: fn, unit: argv[argv.indexOf("--unit") + 1] ?? null, version: "1.2.5", backend: "native",
      available_points: ["vreg_identity", "interference", "coloring", "coalescing", "inlining", "cse", "frame"], unavailable_points: [],
      vregs: [{ vreg: 32, kind: "arg", object: "this", decl_file: target?.sourcePath ?? null, decl_line: 10, web: 0 }],
      inlines: [], cse: [], frame_slots: [], coloring: { gpr: { colored: 12, spilled: 0 }, fpr: { colored: 2, spilled: 0 } },
      provenance: { backend: "native", traced_sha1: "fake", stock_identity: "GC/1.2.5", version: "1.2.5" },
    };
  }

  /** The envelope snapshot.py run_native prints for a decisions capture (mwcc_alloc/api/snapshot.py). */
  private captureEnvelope(doc: Record<string, unknown>, outDir: string): Record<string, unknown> {
    return {
      backend: "native", capture: "decisions", unit: doc.unit, requested_function: doc.function, version: doc.version,
      provenance: doc.provenance, compile_seconds: 0.2, status: "ok", format: "mwcc-alloc-native-capture-v1",
      function: doc.function, display: doc.function, traced_object_matches_stock: true,
      available_points: doc.available_points, unavailable_points: doc.unavailable_points, out_dir: outDir,
      files: [
        { path: `${outDir}/trace.jsonl`, kind: "trace" },
        { path: `${outDir}/capture.o`, kind: "compiled_object" },
        { path: `${outDir}/decisions.json`, kind: "decisions" },
      ],
      replay: [],
      decisions_summary: { vregs: (doc.vregs as unknown[]).length, inlines: 0, cse: 0, frame_slots: 0, coloring: {} },
      duration_seconds: 0.3,
    };
  }

  private compareSources(target: FakeTarget | null, argv: string[]): Record<string, unknown> {
    const fn = argv[argv.indexOf("--function") + 1] ?? target?.symbol ?? "unknown";
    return {
      status: "ok", schema: "mwcc-decision-diff-v1", function: fn, unit: argv[argv.indexOf("--unit") + 1] ?? null, version: "1.2.5",
      available_points: ["vreg_identity", "interference", "coloring", "coalescing", "inlining", "cse", "frame"], unavailable_points: [],
      stock: { a_obj_sha: sha256(`${fn}:a`), b_obj_sha: sha256(`${fn}:b`), code_class: "code_changed" },
      changes: [{ kind: "node_added", summary: "+1 node: single-use temp of this", a: null, b: { vreg: 41 }, match: "by_site" }],
      summary_lines: ["+1 node: single-use temp of `this`; this degree 28->29; r28->r31"],
    };
  }

  stats(): Record<string, unknown> {
    return {
      alive: this.alive(), peak_alive: this.peakAlive, created: this.sandboxes.size,
      sandbox_minutes: Number(this.sandboxMinutes().toFixed(3)), counters: this.counters, step_counts: this.stepCounts,
      image_files: [...this.image.keys()],
    };
  }
}

/** HTTP front of a FakeWorld. Returns the bound port. */
export function serveFakeDaytona(world: FakeWorld, port = 0): { port: number; stop(): void } {
  const handle = async (path: string, body: Record<string, any>): Promise<unknown> => {
    switch (path) {
      case "/sandbox/create": world.admit("sandbox.create"); return world.create(body);
      case "/sandbox/get": world.admit("sandbox.get"); await world.sleep(STEP_SECONDS["sandbox.get"]!); { const s = world.sandbox(body.id); return { id: s.id, labels: s.labels }; }
      case "/sandbox/list": world.admit("sandbox.list"); await world.sleep(STEP_SECONDS["sandbox.list"]!); return { items: world.list(body.labels ?? {}) };
      case "/sandbox/delete": world.admit("sandbox.delete"); await world.remove(body.id); return {};
      case "/sandbox/stop": world.admit("sandbox.stop"); world.sandbox(body.id).state = "stopped"; return {};
      case "/sandbox/start": world.admit("sandbox.start"); world.sandbox(body.id).state = "started"; return {};
      case "/session/create": world.admit("session.create"); await world.sleep(STEP_SECONDS.session!); world.sandbox(body.id).sessions.add(body.sessionId); return {};
      case "/session/delete": world.admit("session.delete"); await world.sleep(STEP_SECONDS.session!); world.sandbox(body.id).sessions.delete(body.sessionId); return {};
      case "/session/exec": {
        world.admit("session.exec");
        const sandbox = world.sandbox(body.id);
        if (!sandbox.sessions.has(body.sessionId)) throw new HttpError(404, `session ${body.sessionId} not found`);
        return world.exec(body.id, String(body.command));
      }
      case "/fs/upload": world.admit("fs.upload"); await world.sleep(STEP_SECONDS.fs!); { const s = world.sandbox(body.id); world.write(s, String(body.remotePath), Buffer.from(String(body.content), "base64")); return {}; }
      case "/fs/download": {
        world.admit("fs.download");
        await world.sleep(STEP_SECONDS.fs!);
        const content = world.read(world.sandbox(body.id), String(body.remotePath));
        if (!content) throw new HttpError(404, `File not found: ${body.remotePath}`);
        return { content: content.toString("base64") };
      }
      case "/admin/bake": return { baked: world.bake(body.id, body.paths ?? [], body.revs ?? []) };
      default: throw new HttpError(404, `unknown endpoint ${path}`);
    }
  };
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port,
    idleTimeout: 0,
    async fetch(request) {
      const path = new URL(request.url).pathname;
      if (request.method === "GET" && path === "/admin/stats") return Response.json(world.stats());
      try {
        const body = request.method === "POST" ? await request.json() as Record<string, any> : {};
        return Response.json(await handle(path, body));
      } catch (error) {
        const status = error instanceof HttpError ? error.status : 500;
        return new Response(error instanceof Error ? error.message : String(error), { status });
      }
    },
  });
  return { port: server.port!, stop: () => server.stop(true) };
}

function arg(argv: string[], name: string, fallback?: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const targetsPath = arg(argv, "--targets");
  const world = new FakeWorld({
    seedRoot: arg(argv, "--seed-root") ?? process.cwd(),
    workspaceRoot: arg(argv, "--workspace-root", "/work/sms")!,
    targets: targetsPath ? JSON.parse(readFileSync(targetsPath, "utf8")) as FakeTarget[] : [],
    timeScale: Number(arg(argv, "--time-scale", "0.02")),
    quota: Number(arg(argv, "--quota", "250")),
    rateLimitRps: Number(arg(argv, "--rate-limit-rps", "0")),
    inject429: Number(arg(argv, "--inject-429", "0")),
    inject502: Number(arg(argv, "--inject-502", "0")),
    nativeUnavailable: Number(arg(argv, "--native-unavailable", "0")),
  });
  const served = serveFakeDaytona(world, Number(arg(argv, "--port", "0")));
  const portFile = arg(argv, "--port-file");
  if (portFile) writeFileSync(portFile, String(served.port));
  console.error(`[fake-daytona] listening on 127.0.0.1:${served.port}`);
  const statsFile = arg(argv, "--stats-file");
  const flush = () => { if (statsFile) writeFileSync(statsFile, `${JSON.stringify(world.stats(), null, 2)}\n`); };
  const timer = setInterval(flush, 2_000);
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => { clearInterval(timer); flush(); served.stop(); process.exit(0); });
}
