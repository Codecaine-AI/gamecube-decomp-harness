import { resolve } from "node:path";
import { packageRoot } from "@server/core/knowledge";
import { editScopePolicyJson, type EditScopeOrderingPolicy } from "@server/core/validation/edit-scope/edit-scope.js";
import { runCommand, type CommandResult } from "@server/infrastructure/shell";
import type { HeaderReadinessResolver, HeaderReadinessVerdict } from "./write-set-widening.js";

/**
 * Default `HeaderReadinessResolver` for widening rung 3 (plan v3 section 3).
 * Runs `readiness.py index` once per (repo, rev), reads the contract's
 * `classes` map, finds the classes each header defines in its working-tree
 * text, and maps their `declare` level: `not_ready` → not_ready;
 * `unresolved` or a class missing from the map → unresolved; `ready` /
 * `shared` → ready. A header is as ready as its worst class; a header that
 * defines no class is ready.
 *
 * An index that cannot load yields no verdicts (the widening is decided as
 * today): the edit-scope gate is the fail-closed enforcement point.
 */
export const READINESS_TOOLPACK_PATH = "_impl/gamecube/tools/readiness.py";
export const READINESS_INDEX_TIMEOUT_MS = 180_000;

export interface ReadinessClassRow {
  class: string;
  owner_unit: string | null;
  provenance?: string;
  started?: boolean;
  construct?: string;
  declare?: string;
}

export type ReadinessIndexRunner = (args: string[]) => Promise<CommandResult>;

const indexCache = new Map<string, Promise<Map<string, ReadinessClassRow> | null>>();

/** Test hook: forget cached indexes. */
export function clearHeaderReadinessCache(): void {
  indexCache.clear();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** The contract's `classes` map from `readiness.py index --json` output; null when malformed. */
export function parseReadinessClasses(json: unknown): Map<string, ReadinessClassRow> | null {
  if (!isRecord(json) || !isRecord(json.classes)) return null;
  const classes = new Map<string, ReadinessClassRow>();
  for (const [key, value] of Object.entries(json.classes)) {
    if (!isRecord(value)) continue;
    classes.set(key, {
      class: typeof value.class === "string" ? value.class : key,
      owner_unit: typeof value.owner_unit === "string" ? value.owner_unit : null,
      ...(typeof value.provenance === "string" ? { provenance: value.provenance } : {}),
      ...(typeof value.started === "boolean" ? { started: value.started } : {}),
      ...(typeof value.construct === "string" ? { construct: value.construct } : {}),
      ...(typeof value.declare === "string" ? { declare: value.declare } : {}),
    });
  }
  return classes;
}

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

/**
 * Classes a header defines: `class|struct Name [: bases] {` heads (not
 * forward declarations, not `enum class`) and `Name::member(` out-of-class
 * member definitions. Qualified names keep their `A::B` form.
 */
export function headerDefinedClasses(text: string): string[] {
  const source = stripComments(text);
  const names = new Set<string>();
  const head = /(?<!\benum\s)\b(?:class|struct)\s+(?:__attribute__\s*\(\([^)]*\)\)\s*)?([A-Za-z_]\w*(?:\s*::\s*[A-Za-z_]\w*)*)\s*(?:final\s*)?(?::[^;{}()]*)?\{/g;
  for (const match of source.matchAll(head)) names.add(match[1]!.replace(/\s+/g, ""));
  const member = /\b([A-Za-z_]\w*(?:::[A-Za-z_]\w*)*)::~?[A-Za-z_]\w*\s*\([^;{}]*\)\s*(?:const\s*)?\{/g;
  for (const match of source.matchAll(member)) {
    const name = match[1]!;
    if (name !== "std") names.add(name);
  }
  return [...names];
}

function lookupClass(classes: Map<string, ReadinessClassRow>, name: string): ReadinessClassRow | null {
  const exact = classes.get(name);
  if (exact) return exact;
  const suffix = `::${name}`;
  const matches = [...classes.entries()].filter(([key]) => key.endsWith(suffix));
  return matches.length === 1 ? matches[0]![1] : null;
}

function declareState(row: ReadinessClassRow | null): HeaderReadinessVerdict["state"] {
  if (!row) return "unresolved";
  if (row.declare === "not_ready") return "not_ready";
  if (row.declare === "ready" || row.declare === "shared") return "ready";
  return "unresolved";
}

/** One header's verdict from its text and the readiness classes. */
export function headerReadinessVerdict(text: string, classes: Map<string, ReadinessClassRow>): HeaderReadinessVerdict {
  const rows = headerDefinedClasses(text).map((name) => {
    const row = lookupClass(classes, name);
    return { class: row?.class ?? name, owner_unit: row?.owner_unit ?? null, state: declareState(row) };
  });
  const state: HeaderReadinessVerdict["state"] = rows.some((row) => row.state === "not_ready")
    ? "not_ready"
    : rows.some((row) => row.state === "unresolved") ? "unresolved" : "ready";
  return { state, classes: rows };
}

/** `readiness.py index` on the host for the orchestrator's toolpack copy. */
export function hostReadinessIndexRunner(
  policy: EditScopeOrderingPolicy,
  options: { scriptPath?: string; cwd?: string; timeoutMs?: number } = {},
): ReadinessIndexRunner {
  const scriptPath = options.scriptPath ?? resolve(packageRoot(), "toolpacks/gamecube-decomp", READINESS_TOOLPACK_PATH);
  return async (args) => {
    try {
      return await runCommand(options.cwd ?? packageRoot(), ["python3", scriptPath, ...args], {
        timeoutMs: options.timeoutMs ?? READINESS_INDEX_TIMEOUT_MS,
        env: { ORCH_ORDERING_MODE: policy.mode },
      });
    } catch (error) {
      return { exitCode: 127, stdout: "", stderr: error instanceof Error ? error.message : String(error) };
    }
  };
}

async function loadClasses(params: {
  repoRoot: string;
  rev: string;
  policy: EditScopeOrderingPolicy;
  runner: ReadinessIndexRunner;
}): Promise<Map<string, ReadinessClassRow> | null> {
  const key = `${params.repoRoot}\0${params.rev}\0${editScopePolicyJson(params.policy)}`;
  let cached = indexCache.get(key);
  if (!cached) {
    cached = (async () => {
      const result = await params.runner([
        "index", "--repo", params.repoRoot, "--rev", params.rev, "--policy-json", editScopePolicyJson(params.policy), "--json",
      ]);
      if (result.exitCode !== 0) return null;
      try {
        return parseReadinessClasses(JSON.parse(result.stdout));
      } catch {
        return null;
      }
    })();
    indexCache.set(key, cached);
    // A failed load is not cached: the next widening request retries.
    void cached.then((classes) => {
      if (!classes) indexCache.delete(key);
    });
  }
  return cached;
}

/**
 * The default resolver: readiness at (`repoRoot`, `rev`), header text from
 * `readHeader` (the worker's working tree). Unreadable headers get no verdict.
 */
export function createHeaderReadinessResolver(params: {
  repoRoot: string;
  rev: string | null | undefined;
  policy: EditScopeOrderingPolicy;
  readHeader: (path: string) => Promise<string | null>;
  runner?: ReadinessIndexRunner;
}): HeaderReadinessResolver {
  return async (headerPaths) => {
    const verdicts = new Map<string, HeaderReadinessVerdict>();
    if (!params.rev || headerPaths.length === 0) return verdicts;
    const classes = await loadClasses({
      repoRoot: params.repoRoot,
      rev: params.rev,
      policy: params.policy,
      runner: params.runner ?? hostReadinessIndexRunner(params.policy),
    });
    if (!classes) return verdicts;
    for (const path of headerPaths) {
      let text: string | null = null;
      try {
        text = await params.readHeader(path);
      } catch {
        text = null;
      }
      // Keyed by the normalized repo path `applyHeaderReadiness` looks up.
      const key = path.trim().replaceAll("\\", "/").replace(/^\.\/+/, "").replace(/\/{2,}/g, "/");
      if (text !== null) verdicts.set(key, headerReadinessVerdict(text, classes));
    }
    return verdicts;
  };
}
