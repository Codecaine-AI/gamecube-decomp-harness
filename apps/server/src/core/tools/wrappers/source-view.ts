/** Read the worker's current sandbox file, then apply a host-side read-only KB projection. */
import { readFileSync, realpathSync, statSync } from "node:fs";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { resolveKnowledgeCheckout } from "@server/core/knowledge-v2/checkout.js";
import { formatSourceView, SOURCE_VIEW_MAX_BYTES, sourceViewForText } from "@server/core/knowledge-v2/source-view.js";
import type { AgentToolRegistration, AgentToolRuntimeContext } from "../types.js";
import { jsonToolResult } from "../runtime/results.js";

const EXTENSIONS = new Set([".c", ".h", ".cc", ".cpp", ".cxx", ".hpp", ".inc"]);
const SANDBOX_READ = `import json,pathlib,sys
root=pathlib.Path(sys.argv[1]).resolve()
path=(root/sys.argv[2]).resolve()
if not path.is_relative_to(root): raise ValueError('path_outside_checkout')
if path.stat().st_size>int(sys.argv[3]): raise ValueError('file_too_large')
with path.open('rb') as f: data=f.read(int(sys.argv[3])+1)
if len(data)>int(sys.argv[3]): raise ValueError('file_too_large')
print(json.dumps({'source':data.decode('utf-8')}))`;

export async function readSourceViewFile(context: AgentToolRuntimeContext, path: string): Promise<{ path: string; source: string }> {
  const root = context.role === "worker" ? context.cwd : context.knowledgeCheckoutRoot ?? resolveKnowledgeCheckout({
    gameId: context.game?.gameId ?? "melee", stateDir: context.stateDir,
  }).checkoutRoot;
  const resolved = resolve(root, path);
  const rel = relative(root, resolved);
  if (!path || !rel || rel === ".." || rel.startsWith("../") || isAbsolute(rel) || path.includes("\0")) throw new Error("path_outside_checkout");
  if (!EXTENSIONS.has(extname(rel).toLowerCase())) throw new Error("expected_c_source_file");
  if (context.sandboxHandle) {
    // Read in the claim sandbox, never the host's possibly stale copy. Python resolves symlinks there.
    const result = await context.sandboxHandle.exec(["python3", "-c", SANDBOX_READ, root, rel, String(SOURCE_VIEW_MAX_BYTES)], { cwd: root, timeoutMs: 10_000 });
    if (result.exitCode !== 0) throw new Error(result.stderr.includes("path_outside_checkout") ? "path_outside_checkout"
      : result.stderr.includes("file_too_large") ? "file_too_large" : "file_unavailable");
    const payload = JSON.parse(result.stdout);
    if (typeof payload.source !== "string" || Buffer.byteLength(payload.source) > SOURCE_VIEW_MAX_BYTES) throw new Error("invalid_source_response");
    return { path: rel, source: payload.source };
  }
  const realRoot = realpathSync(root);
  const realFile = realpathSync(resolved);
  const realRel = relative(realRoot, realFile);
  if (realRel === ".." || realRel.startsWith("../") || isAbsolute(realRel)) throw new Error("path_outside_checkout");
  if (statSync(realFile).size > SOURCE_VIEW_MAX_BYTES) throw new Error("file_too_large");
  return { path: rel, source: readFileSync(realFile, "utf8") };
}

export const sourceViewToolRegistration: AgentToolRegistration = {
  id: "knowledge_render_file",
  purpose: "Read current C source with proposed KB function names and a canonical-symbol footer.",
  allowedRoles: ["worker", "librarian"],
  capabilities: ["knowledge_v2", "source_reading"],
  create(context) {
    return {
      name: "knowledge_render_file", label: "Read With Proposed Names",
      description: "Read a current C/C++ source or header file using proposed KB function names. Reads the worker sandbox when present. Returns a bounded reading view with original line numbers, a content hash, and canonical-to-proposed symbol mappings. Use it to understand behavior and notice missing or inconsistent operations. It does not edit files or establish that guessed names are correct. Read canonical source before patching; use canonical symbols in compiler tools and citations.",
      promptSnippet: "knowledge_render_file: read current code using proposed names, with canonical mappings and continuation lines.",
      parameters: {
        type: "object", properties: {
          path: { type: "string", description: "Source/header path inside the current checkout." },
          start_line: { type: "integer", minimum: 1, description: "First original source line. Use next_line to continue." },
          max_lines: { type: "integer", minimum: 1, maximum: 2000 },
        }, required: ["path"], additionalProperties: false,
      },
      executionMode: "parallel",
      async execute(_id, params) {
        try {
          const file = await readSourceViewFile(context, String(params.path ?? ""));
          const view = sourceViewForText(file.path, file.source, {
            gameId: context.game?.gameId,
            startLine: typeof params.start_line === "number" ? params.start_line : undefined,
            maxLines: typeof params.max_lines === "number" ? params.max_lines : undefined,
          });
          return jsonToolResult("knowledge_render_file", {
            status: view.status, path: view.path, source_sha256: view.source_sha256,
            start_line: view.start_line, end_line: view.end_line, next_line: view.next_line,
            content: formatSourceView(view),
          });
        } catch (error) {
          return jsonToolResult("knowledge_render_file", { status: "unavailable", reason: error instanceof Error ? error.message : String(error) });
        }
      },
    };
  },
};
