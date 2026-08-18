import { posix as path } from "node:path";
import {
  createEditToolDefinition,
  createFindToolDefinition,
  createGrepToolDefinition,
  createReadToolDefinition,
  DEFAULT_MAX_BYTES,
  formatSize,
  truncateHead,
  truncateLine,
  type BashOperations,
} from "@earendil-works/pi-coding-agent";
import type { SandboxExecResult, SandboxHandle } from "@server/core/job-queue/sandbox.js";
import { withGlobalCompileJobserverSlot } from "@server/infrastructure/shell/global-compile-jobserver.js";

export const DEFAULT_SANDBOX_BASH_TIMEOUT_MS = 30 * 60 * 1_000;
export const DEFAULT_SANDBOX_FILE_TOOL_TIMEOUT_MS = 60 * 1_000;

const MAX_TIMEOUT_MS = 2_147_483_647;
const MAX_TIMEOUT_SECONDS = MAX_TIMEOUT_MS / 1_000;
const DEFAULT_SEARCH_LIMIT = 100;
const GREP_MAX_LINE_LENGTH = 500;
const BOUNDED_RIPGREP_SCRIPT = `
max_matches=$1
shift
rg "$@" | awk -v max_matches="$max_matches" '
  index($0, "{\\"type\\":\\"match\\"") == 1 {
    matches++
    print
    if (matches >= max_matches) exit 0
    next
  }
  { print }
'
pipeline_status=("\${PIPESTATUS[@]}")
rg_status=\${pipeline_status[0]}
awk_status=\${pipeline_status[1]}
if [ "$awk_status" -ne 0 ]; then exit "$awk_status"; fi
if [ "$rg_status" -ne 0 ] && [ "$rg_status" -ne 1 ] && [ "$rg_status" -ne 141 ]; then
  exit "$rg_status"
fi
exit 0
`.trim();
const BOUNDED_FIND_SCRIPT = `
max_results=$1
shift
find "$@" | head -n "$max_results"
pipeline_status=("\${PIPESTATUS[@]}")
find_status=\${pipeline_status[0]}
head_status=\${pipeline_status[1]}
if [ "$head_status" -ne 0 ]; then exit "$head_status"; fi
if [ "$find_status" -ne 0 ] && [ "$find_status" -ne 141 ]; then exit "$find_status"; fi
exit 0
`.trim();

export interface SandboxBashOperationsOptions {
  withCompileSlot?: <T>(run: () => Promise<T>) => Promise<T>;
}

function normalizedWorkspaceRoot(workspaceRoot: string): string {
  return path.resolve(workspaceRoot);
}

function workspaceCwd(cwd: string, workspaceRoot: string): string {
  const root = normalizedWorkspaceRoot(workspaceRoot);
  const normalizedCwd = path.isAbsolute(cwd) ? path.resolve(cwd) : path.resolve(root, cwd);
  return normalizedCwd === root || normalizedCwd.startsWith(`${root}/`) ? normalizedCwd : root;
}

function definedEnvironment(env: NodeJS.ProcessEnv | undefined): Record<string, string> | undefined {
  if (!env) return undefined;
  const entries = Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === "string");
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function bashTimeoutMs(timeoutSeconds: number | undefined): number {
  if (timeoutSeconds === undefined) return DEFAULT_SANDBOX_BASH_TIMEOUT_MS;
  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
    throw new Error("Invalid timeout: must be a finite number of seconds");
  }
  const timeoutMs = timeoutSeconds * 1_000;
  if (timeoutMs > MAX_TIMEOUT_MS) {
    throw new Error(`Invalid timeout: maximum is ${MAX_TIMEOUT_SECONDS} seconds`);
  }
  return timeoutMs;
}

async function execWithAbort(
  handle: SandboxHandle,
  command: string[],
  opts: { cwd: string; env?: Record<string, string>; timeoutMs: number },
  signal: AbortSignal | undefined,
  abortMessage: string,
): Promise<SandboxExecResult> {
  if (signal?.aborted) throw new Error(abortMessage);
  if (!signal) return handle.exec(command, opts);

  let onAbort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(new Error(abortMessage));
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([handle.exec(command, opts), aborted]);
  } finally {
    if (onAbort) signal.removeEventListener("abort", onAbort);
  }
}

/**
 * Run Pi bash commands in a sandbox workspace.
 *
 * SandboxHandle does not expose the underlying Daytona session, so an abort cannot delete that
 * session directly. Abort is best-effort: reject promptly, ignore a late result, and rely on the
 * explicit remote timeout to terminate the command/session.
 */
export function sandboxBashOperations(
  handle: SandboxHandle,
  workspaceRoot: string,
  options: SandboxBashOperationsOptions = {},
): BashOperations {
  const withCompileSlot = options.withCompileSlot ?? withGlobalCompileJobserverSlot;
  return {
    async exec(command, cwd, { onData, signal, timeout, env }) {
      const run = () => execWithAbort(
        handle,
        ["/bin/bash", "-lc", command],
        {
          cwd: workspaceCwd(cwd, workspaceRoot),
          env: definedEnvironment(env),
          timeoutMs: bashTimeoutMs(timeout),
        },
        signal,
        "aborted",
      );
      const invokesNinja = /(?:^|[\s;&|()])(?:[^\s;&|()]*\/)?ninja(?=$|[\s;&|()])/.test(command);
      const result = invokesNinja ? await withCompileSlot(run) : await run();
      if (signal?.aborted) throw new Error("aborted");
      if (result.stdout) onData(Buffer.from(result.stdout));
      if (result.stderr) onData(Buffer.from(result.stderr));
      return { exitCode: result.exitCode };
    },
  };
}

function sandboxReadOperations(handle: SandboxHandle) {
  return {
    async access(absolutePath: string): Promise<void> {
      await handle.readFile(absolutePath);
    },
    async readFile(absolutePath: string): Promise<Buffer> {
      return Buffer.from(await handle.readFile(absolutePath), "utf8");
    },
  };
}

function sandboxEditOperations(handle: SandboxHandle) {
  return {
    async access(absolutePath: string): Promise<void> {
      await handle.readFile(absolutePath);
    },
    async readFile(absolutePath: string): Promise<Buffer> {
      return Buffer.from(await handle.readFile(absolutePath), "utf8");
    },
    async writeFile(absolutePath: string, content: string): Promise<void> {
      await handle.writeFile(absolutePath, content);
    },
  };
}

export function createSandboxReadToolDefinition(handle: SandboxHandle, workspaceRoot: string) {
  return createReadToolDefinition(normalizedWorkspaceRoot(workspaceRoot), {
    autoResizeImages: false,
    operations: sandboxReadOperations(handle),
  });
}

export function createSandboxEditToolDefinition(handle: SandboxHandle, workspaceRoot: string) {
  return createEditToolDefinition(normalizedWorkspaceRoot(workspaceRoot), {
    operations: sandboxEditOperations(handle),
  });
}

async function sandboxPathKind(
  handle: SandboxHandle,
  absolutePath: string,
  workspaceRoot: string,
  signal?: AbortSignal,
): Promise<"directory" | "file"> {
  const result = await execWithAbort(
    handle,
    ["find", absolutePath, "-maxdepth", "0", "-type", "d", "-print"],
    { cwd: normalizedWorkspaceRoot(workspaceRoot), timeoutMs: DEFAULT_SANDBOX_FILE_TOOL_TIMEOUT_MS },
    signal,
    "Operation aborted",
  );
  if (result.exitCode !== 0) throw new Error(`Path not found: ${absolutePath}`);
  return result.stdout.trim().length > 0 ? "directory" : "file";
}

interface RipgrepMatch {
  filePath: string;
  lineNumber: number;
  lineText: string;
}

function parseRipgrepMatches(stdout: string, cwd: string, limit: number): RipgrepMatch[] {
  const matches: RipgrepMatch[] = [];
  for (const line of stdout.split("\n")) {
    if (!line.trim() || matches.length >= limit) continue;
    let event: {
      type?: unknown;
      data?: { path?: { text?: unknown }; line_number?: unknown; lines?: { text?: unknown } };
    };
    try {
      event = JSON.parse(line) as typeof event;
    } catch {
      continue;
    }
    if (event.type !== "match") continue;
    const rawPath = event.data?.path?.text;
    const lineNumber = event.data?.line_number;
    const lineText = event.data?.lines?.text;
    if (typeof rawPath !== "string" || typeof lineNumber !== "number" || typeof lineText !== "string") continue;
    matches.push({
      filePath: path.isAbsolute(rawPath) ? rawPath : path.resolve(cwd, rawPath),
      lineNumber,
      lineText,
    });
  }
  return matches;
}

function grepDisplayPath(filePath: string, searchPath: string, isDirectory: boolean): string {
  if (!isDirectory) return path.basename(filePath);
  const relativePath = path.relative(searchPath, filePath);
  return relativePath && !relativePath.startsWith("..") ? relativePath : filePath;
}

async function formatGrepMatch(
  handle: SandboxHandle,
  match: RipgrepMatch,
  searchPath: string,
  isDirectory: boolean,
  context: number,
): Promise<{ lines: string[]; truncated: boolean }> {
  const displayPath = grepDisplayPath(match.filePath, searchPath, isDirectory);
  if (context === 0) {
    const sanitized = match.lineText.replace(/\r\n/g, "\n").replace(/\r/g, "").replace(/\n$/, "");
    const line = truncateLine(sanitized);
    return { lines: [`${displayPath}:${match.lineNumber}: ${line.text}`], truncated: line.wasTruncated };
  }

  let content: string;
  try {
    content = await handle.readFile(match.filePath);
  } catch {
    return { lines: [`${displayPath}:${match.lineNumber}: (unable to read file)`], truncated: false };
  }
  const fileLines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const start = Math.max(1, match.lineNumber - context);
  const end = Math.min(fileLines.length, match.lineNumber + context);
  const lines: string[] = [];
  let truncated = false;
  for (let lineNumber = start; lineNumber <= end; lineNumber++) {
    const line = truncateLine(fileLines[lineNumber - 1] ?? "");
    truncated ||= line.wasTruncated;
    const separator = lineNumber === match.lineNumber ? ":" : "-";
    lines.push(`${displayPath}${separator}${lineNumber}${separator} ${line.text}`);
  }
  return { lines, truncated };
}

export function createSandboxGrepToolDefinition(handle: SandboxHandle, workspaceRoot: string) {
  const root = normalizedWorkspaceRoot(workspaceRoot);
  const base = createGrepToolDefinition(root);
  const definition: typeof base = {
    ...base,
    async execute(_toolCallId, params, signal) {
      const searchPath = path.resolve(root, params.path ?? ".");
      const pathKind = await sandboxPathKind(handle, searchPath, root, signal);
      const isDirectory = pathKind === "directory";
      const commandCwd = isDirectory ? searchPath : path.dirname(searchPath);
      const target = isDirectory ? "." : path.basename(searchPath);
      const effectiveLimit = Math.max(1, params.limit ?? DEFAULT_SEARCH_LIMIT);
      const rgArgs = ["--json", "--line-number", "--color=never", "--hidden"];
      if (params.ignoreCase) rgArgs.push("--ignore-case");
      if (params.literal) rgArgs.push("--fixed-strings");
      if (params.glob) rgArgs.push("--glob", params.glob);
      rgArgs.push("--", params.pattern, target);
      const command = [
        "/bin/bash",
        "-lc",
        BOUNDED_RIPGREP_SCRIPT,
        "sandbox-grep",
        String(effectiveLimit + 1),
        ...rgArgs,
      ];

      const result = await execWithAbort(
        handle,
        command,
        { cwd: commandCwd, timeoutMs: DEFAULT_SANDBOX_FILE_TOOL_TIMEOUT_MS },
        signal,
        "Operation aborted",
      );
      if (result.exitCode !== 0 && result.exitCode !== 1) {
        throw new Error(result.stderr.trim() || `ripgrep exited with code ${result.exitCode}`);
      }

      const boundedMatches = parseRipgrepMatches(result.stdout, commandCwd, effectiveLimit + 1);
      if (boundedMatches.length === 0) {
        return { content: [{ type: "text", text: "No matches found" }], details: undefined };
      }
      const matchLimitReached = boundedMatches.length > effectiveLimit;
      const matches = boundedMatches.slice(0, effectiveLimit);

      const context = params.context && params.context > 0 ? params.context : 0;
      const outputLines: string[] = [];
      let linesTruncated = false;
      for (const match of matches) {
        if (signal?.aborted) throw new Error("Operation aborted");
        const formatted = await formatGrepMatch(handle, match, searchPath, isDirectory, context);
        outputLines.push(...formatted.lines);
        linesTruncated ||= formatted.truncated;
      }

      const truncation = truncateHead(outputLines.join("\n"), { maxLines: Number.MAX_SAFE_INTEGER });
      let output = truncation.content;
      const notices: string[] = [];
      if (matchLimitReached) {
        notices.push(`${effectiveLimit} matches limit reached. Use limit=${effectiveLimit * 2} for more, or refine pattern`);
      }
      if (truncation.truncated) notices.push(`${formatSize(DEFAULT_MAX_BYTES)} limit reached`);
      if (linesTruncated) {
        notices.push(`Some lines truncated to ${GREP_MAX_LINE_LENGTH} chars. Use read tool to see full lines`);
      }
      if (notices.length > 0) output += `\n\n[${notices.join(". ")}]`;
      const details = {
        ...(matchLimitReached ? { matchLimitReached: effectiveLimit } : {}),
        ...(truncation.truncated ? { truncation } : {}),
        ...(linesTruncated ? { linesTruncated: true as const } : {}),
      };
      return {
        content: [{ type: "text", text: output }],
        details: Object.keys(details).length > 0 ? details : undefined,
      };
    },
  };
  return definition;
}

export function createSandboxGlobToolDefinition(handle: SandboxHandle, workspaceRoot: string) {
  const root = normalizedWorkspaceRoot(workspaceRoot);
  const base = createFindToolDefinition(root, {
    operations: {
      async exists(absolutePath) {
        try {
          await sandboxPathKind(handle, absolutePath, root);
          return true;
        } catch {
          return false;
        }
      },
      async glob(pattern, cwd, options) {
        const remoteLimit = Math.max(1, Math.trunc(options.limit));
        const patternArgs = pattern.includes("/")
          ? ["-path", pattern.startsWith("/") ? pattern : `*/${pattern}`]
          : ["-name", pattern];
        const result = await handle.exec(
          [
            "/bin/bash",
            "-lc",
            BOUNDED_FIND_SCRIPT,
            "sandbox-find",
            String(remoteLimit),
            cwd,
            "-type",
            "f",
            "-not",
            "-path",
            "*/node_modules/*",
            "-not",
            "-path",
            "*/.git/*",
            ...patternArgs,
            "-print",
          ],
          { cwd, timeoutMs: DEFAULT_SANDBOX_FILE_TOOL_TIMEOUT_MS },
        );
        if (result.exitCode !== 0) throw new Error(result.stderr.trim() || `find exited with code ${result.exitCode}`);
        return result.stdout
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .slice(0, options.limit);
      },
    },
  });
  return { ...base, name: "glob", label: "glob" };
}

export function createSandboxFileToolDefinitions(handle: SandboxHandle, workspaceRoot: string) {
  return [
    createSandboxReadToolDefinition(handle, workspaceRoot),
    createSandboxEditToolDefinition(handle, workspaceRoot),
    createSandboxGrepToolDefinition(handle, workspaceRoot),
    createSandboxGlobToolDefinition(handle, workspaceRoot),
  ] as const;
}
