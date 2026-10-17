/**
 * Command parsing and step classification shared by the fake Daytona server,
 * the instrumented clients and the report.
 *
 * `DaytonaSandboxHandle.exec` (apps/server/src/core/job-queue/sandbox.ts)
 * sends one shell string: `cd '<cwd>' && env 'K=V' ... '<arg>' ...`, every
 * word single-quoted with `'\''` for embedded quotes, wrapped as
 * `(...) </dev/null` when the session is reused. `parseSandboxCommand` turns
 * that back into cwd, env and argv.
 */

export interface ParsedSandboxCommand {
  cwd: string | null;
  env: Record<string, string>;
  argv: string[];
}

/** Splits a POSIX shell string into words (single/double quotes, backslash escapes) and bare `&&` tokens. */
export function shellWords(text: string): string[] {
  const words: string[] = [];
  let current = "";
  let inWord = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (ch === "'") {
      const end = text.indexOf("'", i + 1);
      if (end < 0) throw new Error("unterminated single quote");
      current += text.slice(i + 1, end);
      inWord = true;
      i = end;
    } else if (ch === "\\" && i + 1 < text.length) {
      current += text[i + 1];
      inWord = true;
      i += 1;
    } else if (ch === "\"") {
      let j = i + 1;
      for (; j < text.length && text[j] !== "\""; j += 1) {
        if (text[j] === "\\" && j + 1 < text.length) { current += text[j + 1]; j += 1; } else current += text[j];
      }
      inWord = true;
      i = j;
    } else if (ch === " " || ch === "\t" || ch === "\n") {
      if (inWord) words.push(current);
      current = "";
      inWord = false;
    } else {
      current += ch;
      inWord = true;
    }
  }
  if (inWord) words.push(current);
  return words;
}

/** A reused-session command (sandbox.ts `isolatedShellCommand`): `(mkdir '<claim>' 2>/dev/null || { ...; }; <command>) </dev/null`. */
const ISOLATED_COMMAND = /^\(([\s\S]*)\) <\/dev\/null$/;
/** The command-id claim `isolatedShellCommand` puts before the command. */
const START_SENTINEL = /^mkdir '[^']*' 2>\/dev\/null \|\| \{ [^}]*\}; /;

export function parseSandboxCommand(command: string): ParsedSandboxCommand {
  const isolated = ISOLATED_COMMAND.exec(command);
  let words = shellWords(isolated ? isolated[1]!.replace(START_SENTINEL, "") : command);
  let cwd: string | null = null;
  if (words[0] === "cd" && words[2] === "&&") {
    cwd = words[1] ?? null;
    words = words.slice(3);
  }
  const env: Record<string, string> = {};
  if (words[0] === "env") {
    words = words.slice(1);
    while (words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0]!)) {
      const [key, ...rest] = words.shift()!.split("=");
      env[key!] = rest.join("=");
    }
  }
  return { cwd, env, argv: words };
}

/**
 * The validation/provisioning step a command belongs to. Names are stable:
 * the report keys latency, placement and failures on them.
 */
export function classifyCommand(argv: string[]): string {
  const [cmd = "", a1 = "", a2 = ""] = argv;
  const joined = argv.join(" ");
  const base = cmd.split("/").at(-1) ?? cmd;
  if (base === "python3" || base === "python") {
    if (a1 === "-c") {
      if (a2.includes("ORCH_IR_ORACLE_CLANG")) return "steering_placement_probe";
      if (a2.includes("subprocess.run(command + ['-o', report_path]")) return "objdiff";
      if (a2.includes("'copied': copied, 'revs': revs") || a2.includes("'--no-index'")) return "qa_diff";
      if (a2.includes("request['fullPaths']") || a2.includes("'all': present")) return "source_query";
      if (a2.includes("snapshotted %d baseline")) return "symbol_baseline";
      if (a2.includes("import struct,sys")) return "undefined_symbols";
      if (a2.includes("base64.b64decode") || a2.includes("hashlib.sha256")) return "upload_via_exec";
      return "python_inline";
    }
    const script = a1.split("/").at(-1) ?? a1;
    if (script === "steering_check.py") return `steering_${a2 || "unknown"}`;
    if (script === "scan_diff.py") return "qa_lint";
    if (script === "snapshot.py") {
      const capture = argv[argv.indexOf("--capture") + 1];
      return capture === "decisions" ? "native_decisions" : `mwcc_alloc_${capture ?? "snapshot"}`;
    }
    if (script === "compare_sources.py") return "compare_sources";
    if (script === "unused_test.py") return "unused_stub_test";
    if (script === "stack_check.py") return "stack_check";
    if (script === "edit_scope.py") return "edit_scope";
    if (script === "real_code_evidence.py") return "real_code_evidence";
    if (script === "decompile.py") return "m2c";
    if (script.endsWith(".py")) return `python:${script}`;
    return "python";
  }
  if (base === "ninja") return "build";
  if (base === "bun" && joined.includes("worker-child.ts")) return "worker_child";
  if (base === "objdiff-cli") return "objdiff";
  if (base === "clang-format" || base.startsWith("clang-format")) return "format_check";
  if (base === "git") {
    if (a1 === "bundle" || a1 === "fetch") return "provision_git";
    if (a1 === "checkout") return "provision_checkout";
    if (a1 === "rev-parse") return "git_rev_parse";
    if (a1 === "diff" || a1 === "status") return "diff_capture";
    return `git_${a1}`;
  }
  if (base === "cat") return "read_source";
  if (base === "test") {
    if (joined.includes(".qa-ready")) return "qa_probe";
    if (a1 === "-d") return "attach_check";
    return "test";
  }
  if (base === "mkdir") return "mkdir";
  if ((base === "bash" || base === "sh") && (a1 === "-lc" || a1 === "-c")) {
    if (a2.includes("/opt/toolpacks") && a2.includes("tar")) return "toolpack_sync";
    if (a2.includes("ln -sfn")) return "provision_link";
    if (a2.includes("/opt/build-orchestrator") || joined.includes("/opt/build-orchestrator")) return "qa_assets_sync";
    if (a2.includes("build/tools/wibo-real")) return "provision_verify";
    if (a2.includes("ninja")) return "build";
    if (a2.includes("python3")) return "python_wrapped";
    if (a2.includes("rm -f")) return "cleanup";
    return "shell";
  }
  if (cmd.startsWith("/bin/sh") && a1 === "-c" && a2.includes("build/tools/wibo-real")) return "provision_verify";
  if (cmd.startsWith("/bin/sh")) return "post_return_check";
  return `other:${base}`;
}

/** Steps the plan requires per attempt (plan 3.6); the report checks each ran in the sandbox. */
export const REQUIRED_ATTEMPT_STEPS = [
  "build",
  "objdiff",
  "qa_lint",
  "steering_edits",
  "steering_reduce",
  "steering_mwcc",
  "steering_decide",
  "native_decisions",
  "compare_sources",
] as const;

/** Host commands that are orchestration by design (not a placement failure). */
export function hostCommandIsOrchestration(argv: string[]): boolean {
  const [cmd = "", a1 = ""] = argv;
  const base = cmd.split("/").at(-1) ?? cmd;
  if (base === "git") return true;
  if (base === "tar") return true;
  if (base === "bun") return true;
  return false;
}
