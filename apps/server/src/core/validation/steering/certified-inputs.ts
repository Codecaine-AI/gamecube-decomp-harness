import { readFile } from "node:fs/promises";
import type { WorkspaceExec } from "@server/infrastructure/shell";
import { unitVariants, type UnitKeyGame } from "@server/core/harness-runtime/run-state/unit-key.js";
import type { WorkerSteeringResult } from "./steering-check.js";

/**
 * The compile inputs a certificate was measured on, and the landing check
 * that binds the certificate to them (final review r2: a certificate gated
 * against header H0 must not land as certified over H1).
 *
 * The worker records on its checkpoint (`CERTIFIED_INPUTS_KEY`) what the
 * gate's candidate compile read: the unit's depfile from the gate's fidelity
 * record (`mwcc.fidelity.units[unit].builds.cand.deps`: every input path and
 * the sha256 of its bytes, plus the compile command identity), or, for a
 * restoration, the base-identity proof's inputs (git blobs). At integration
 * `compileInputsFresh` checks them against the integrated tree; anything it
 * cannot establish is not fresh.
 */
export const CERTIFIED_INPUTS_KEY = "certified_inputs";

/** A generated input's generating sources (repo-relative path -> sha256), or why they are unknown. */
export type GeneratedInput = { generators: Record<string, string> } | { error: string };

export type CertifiedInputs =
  | {
      kind: "depfile";
      unit: string;
      /** Repo-relative path (or `external:<abs>`) -> sha256 of the bytes the candidate compile read. */
      deps: Record<string, string>;
      compile: { mw_version: unknown; cflags: unknown; compiler_sha256: unknown };
      /**
       * Each generated input (`build/...`) among `deps`, bound to what
       * generated it, recorded in the sandbox right after the gate
       * (`sandboxGeneratedInputs`): every tracked file its edge read, through
       * generated intermediates, with the sha256 of its bytes, or why that
       * could not be established.
       */
      generated?: Record<string, GeneratedInput>;
    }
  | {
      kind: "base_identity";
      /** The restoration proof's inputs: tracked paths with their git blob, and generated ones. */
      inputs: Array<{ path: string; blob: string | null; generated?: boolean }>;
    }
  | { kind: "unavailable"; reason: string };

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

/** The gate's mwcc step output beside its artifact (`<prefix>.json` -> `<prefix>.mwcc.json`). */
export function steeringMwccPath(artifactPath: string | null | undefined): string | null {
  return artifactPath && artifactPath.endsWith(".json") ? `${artifactPath.slice(0, -".json".length)}.mwcc.json` : null;
}

/** The unit's candidate compile inputs from a mwcc report's fidelity record (any spelling of the unit). */
export function certifiedInputsFromMwcc(mwcc: unknown, unit: string, game: UnitKeyGame): CertifiedInputs {
  const units = asObject(asObject(asObject(mwcc).fidelity).units);
  const name = unitVariants(game, unit).find((variant) => variant in units);
  if (!name) return { kind: "unavailable", reason: `the gate's fidelity record has no unit ${unit}` };
  const record = asObject(units[name]);
  const candidate = asObject(asObject(record.builds).cand);
  const deps = asObject(candidate.deps);
  if (candidate.depfile !== "ok" || Object.keys(deps).length === 0) {
    return { kind: "unavailable", reason: `the candidate compile recorded no inputs (${typeof candidate.depfile === "string" ? candidate.depfile : "no depfile"})` };
  }
  if (Object.values(deps).some((digest) => typeof digest !== "string" || !/^[0-9a-f]{64}$/.test(digest))) {
    return { kind: "unavailable", reason: "the candidate compile's input hashes are malformed" };
  }
  const compile = asObject(record.compile);
  return {
    kind: "depfile",
    unit: name,
    deps: Object.fromEntries(Object.entries(deps).sort(([left], [right]) => (left < right ? -1 : 1))) as Record<string, string>,
    compile: { mw_version: compile.mw_version ?? null, cflags: compile.cflags ?? null, compiler_sha256: asObject(compile.compiler).sha256 ?? null },
  };
}

/**
 * What the gate's claim-base run compiled for the target unit; `unavailable`
 * with the reason otherwise. `resolveGenerated` binds every generated input
 * (`build/...`) to its generators in the sandbox the gate compiled in
 * (`sandboxGeneratedInputs`); without it they stay unbound (not fresh at
 * integration).
 */
export async function certifiedInputsFromGate(
  steering: WorkerSteeringResult | null | undefined,
  unit: string,
  game: UnitKeyGame,
  resolveGenerated?: GeneratedInputResolver,
): Promise<CertifiedInputs> {
  const path = steeringMwccPath(steering?.artifactPath);
  if (!path) return { kind: "unavailable", reason: "the steering gate left no artifact" };
  let inputs: CertifiedInputs;
  try {
    inputs = certifiedInputsFromMwcc(JSON.parse(await readFile(path, "utf8")) as unknown, unit, game);
  } catch (error) {
    return { kind: "unavailable", reason: `the gate's mwcc record is unreadable: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (inputs.kind !== "depfile" || !resolveGenerated) return inputs;
  const generated = Object.keys(inputs.deps).filter(isGeneratedPath);
  if (generated.length === 0) return inputs;
  let resolved: Record<string, GeneratedInput>;
  try {
    resolved = await resolveGenerated(generated);
  } catch (error) {
    const reason = `generators could not be recorded: ${error instanceof Error ? error.message : String(error)}`;
    resolved = Object.fromEntries(generated.map((path) => [path, { error: reason }]));
  }
  return { ...inputs, generated: Object.fromEntries(generated.map((path) => [path, resolved[path] ?? { error: "no generators recorded" }])) };
}

function isGeneratedPath(path: string): boolean {
  return path === "build" || path.startsWith("build/");
}

export type GeneratedInputResolver = (paths: string[]) => Promise<Record<string, GeneratedInput>>;

/**
 * Follows each generated input back to the tracked files that generated it,
 * in the checkout ninja built it in: the producing edge's explicit and
 * implicit inputs (`ninja -t query`, order-only excluded) and its recorded
 * depfile dependencies (`ninja -t deps`), through generated intermediates.
 * Every node must be up to date (`ninja -n` has no work: for a depfile edge
 * that also proves its dependencies are recorded). Leaves are hashed (sha256
 * of the bytes). A node without a producing edge, an input outside the
 * checkout, an unreadable leaf or a stale node is an error for that input.
 */
const GENERATORS_PY = `
import hashlib, json, os, subprocess, sys
root = os.getcwd()
def ninja(*args):
    return subprocess.run(["ninja", *args], capture_output=True, text=True)
def rel(name):
    name = name.strip()
    path = os.path.relpath(name, root) if os.path.isabs(name) else os.path.normpath(name)
    return None if path.startswith("..") or os.path.isabs(path) else path
def target(path):
    for name in (path, os.path.join(root, path)):
        query = ninja("-t", "query", name)
        if query.returncode == 0:
            return name, query.stdout
    return None, None
def sha(path):
    try:
        with open(path, "rb") as handle:
            return hashlib.sha256(handle.read()).hexdigest()
    except OSError:
        return None
def resolve(start):
    leaves, seen, stack = {}, set(), [start]
    while stack:
        node = stack.pop()
        if node in seen:
            continue
        seen.add(node)
        if len(seen) > 2000:
            return {"error": "more than 2000 generated intermediates"}
        name, query = target(node)
        if name is None:
            return {"error": f"ninja does not know {node}"}
        lines = query.splitlines()
        if not any(line.strip().startswith("input:") for line in lines):
            return {"error": f"{node} has no generating edge"}
        dry = ninja("-n", name)
        if dry.returncode != 0 or "no work to do" not in dry.stdout:
            return {"error": f"{node} is not up to date with its inputs"}
        inputs, section = [], None
        for line in lines[1:]:
            text = line.strip()
            if text.startswith("input:"):
                section = "input"; continue
            if text.startswith("outputs:"):
                section = "outputs"; continue
            if section == "input" and text and not text.startswith("||"):
                inputs.append(text[2:] if text.startswith("| ") else text)
        deps = ninja("-t", "deps", name)
        if deps.returncode == 0:
            inputs += [line.strip() for line in deps.stdout.splitlines() if line.startswith((" ", "\t")) and line.strip()]
        for item in inputs:
            path = rel(item)
            if path is None:
                return {"error": f"{node} reads {item} outside the checkout"}
            if path == "build" or path.startswith("build/"):
                stack.append(path)
                continue
            digest = sha(path)
            if digest is None:
                return {"error": f"{node} reads {path}, which is unreadable"}
            leaves[path] = digest
    if not leaves:
        return {"error": f"{start} has no recorded generators"}
    return {"generators": dict(sorted(leaves.items()))}
print(json.dumps({path: resolve(path) for path in sys.argv[1:]}))
`;

/** `GeneratedInputResolver` in the attempt's workspace (the checkout the gate's candidate compile ran in). */
export function sandboxGeneratedInputs(workspaceExec: WorkspaceExec): GeneratedInputResolver {
  return async (paths) => {
    const result = await workspaceExec.exec(["python3", "-c", GENERATORS_PY, ...paths], { timeoutMs: 300_000 });
    const parsed = result.exitCode === 0 ? JSON.parse(result.stdout) as Record<string, GeneratedInput> : null;
    if (!parsed) throw new Error(`the generator query exited ${result.exitCode}: ${result.stderr.trim().slice(-300)}`);
    return parsed;
  };
}

export interface CompileInputsFreshness {
  fresh: boolean;
  /** Inputs compared against the integrated tree. */
  checked: number;
  /** Inputs (or configuration paths) that differ from what was certified, or changed since the claim base. */
  changed: string[];
  reason: string | null;
}

type CommandRunner = (cwd: string, command: string[]) => Promise<{ exitCode: number; stdout: string; stderr: string }>;

/** Build configuration whose identity decides the compile command (flags, versions, wrappers). */
export const BUILD_CONFIGURATION_PATHS = ["configure.py", "config", "tools"] as const;

const HEADER_LIKE = /\.(?:h|hh|hpp|hxx|inc|inl|pch|ipp|tcc)$/i;

/**
 * sha256 of `<rev>:<path>` bytes for each path (null: absent), through `git
 * cat-file --batch` so binary and Shift-JIS content hashes byte for byte.
 */
const HASH_AT_REV_PY = `
import hashlib, json, subprocess, sys
rev, paths = sys.argv[1], sys.argv[2:]
proc = subprocess.Popen(["git", "cat-file", "--batch"], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
out = {}
for path in paths:
    proc.stdin.write(f"{rev}:{path}\\n".encode()); proc.stdin.flush()
    header = proc.stdout.readline().decode().split()
    if len(header) < 3 or header[1] != "blob":
        out[path] = None
        continue
    data = proc.stdout.read(int(header[2])); proc.stdout.read(1)
    out[path] = hashlib.sha256(data).hexdigest()
proc.stdin.close(); proc.wait()
print(json.dumps(out))
`;

function lines(stdout: string): string[] {
  return stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

/**
 * Was the certified build's every compile input the integrated tree's?
 *
 * 1. A compile-input record is required (`unavailable` or missing: not fresh).
 * 2. Every tracked input has, at `integratedRev`, exactly the recorded
 *    content: the depfile's sha256 of the bytes, or the restoration proof's
 *    git blob. An input outside the checkout (`external:`) cannot be bound to
 *    the tree and is not fresh.
 * 3. The build configuration (`configure.py`, `config/`, `tools/`) is the same
 *    tree between the claim base and the pre-apply revision: what others
 *    landed in between did not change the compile command. The attempt's own
 *    configuration edits land identically on both.
 *    A generated input (`build/...`, outside git) counts through its
 *    generators recorded at gate time (`generated`): each generating file is
 *    checked like a tracked input; a generated input without them is not
 *    fresh.
 * 4. Inputs a depfile does not name: headers that would shadow a recorded one
 *    (same file name), and, for a restoration whose generated inputs hide
 *    their headers, any header-like file. None may have changed between the
 *    claim base and the pre-apply revision.
 *
 * Every failed git query is not fresh. `changed` lists what differed.
 */
export async function compileInputsFresh(params: {
  inputs: unknown;
  claimBaseRev: string;
  preApplyRev: string;
  integratedRev: string;
  repoRoot: string;
  run: CommandRunner;
}): Promise<CompileInputsFreshness> {
  const stale = (reason: string, changed: string[] = [], checked = 0): CompileInputsFreshness => ({ fresh: false, checked, changed, reason });
  const record = asObject(params.inputs) as Partial<CertifiedInputs> & Record<string, unknown>;
  if (record.kind === "unavailable") return stale(`the certified build's compile inputs are unknown: ${String(record.reason ?? "unavailable")}`);
  if (record.kind !== "depfile" && record.kind !== "base_identity") return stale("no compile-input record for the certified build");
  if ([params.claimBaseRev, params.preApplyRev, params.integratedRev].some((rev) => !rev || rev.startsWith("-"))) {
    return stale("the landing has no usable claim base, pre-apply or integrated revision");
  }
  const git = (args: string[]) => params.run(params.repoRoot, ["git", "-C", params.repoRoot, ...args]);

  const tracked = new Map<string, { sha256?: string; blob?: string | null }>();
  // A restoration's generated inputs were regenerated from its (tracked) inputs; their unnamed headers are still guarded (4).
  let generated = false;
  if (record.kind === "depfile") {
    const deps = asObject(record.deps);
    if (Object.keys(deps).length === 0) return stale("the compile-input record lists no inputs");
    const external = Object.keys(deps).filter((key) => key.startsWith("external:"));
    if (external.length > 0) return stale(`compile inputs outside the checkout cannot be bound to the landing: ${external.slice(0, 3).join(", ")}`, external);
    const bindings = asObject(record.generated);
    const addTracked = (path: string, sha256: string): string | null => {
      const known = tracked.get(path);
      if (known && known.sha256 !== sha256) return path;
      tracked.set(path, { sha256 });
      return null;
    };
    const conflicts: string[] = [];
    for (const [path, sha256] of Object.entries(deps)) {
      if (!isGeneratedPath(path)) {
        const conflict = addTracked(path, String(sha256));
        if (conflict) conflicts.push(conflict);
        continue;
      }
      // A generated input counts only through its generators, checked like any other input.
      const binding = asObject(bindings[path]);
      const generators = asObject(binding.generators);
      if (Object.keys(generators).length === 0) {
        const why = typeof binding.error === "string" ? binding.error : "no generators recorded";
        return stale(`generated input ${path} is not bound to its generators: ${why}`, [path]);
      }
      for (const [source, digest] of Object.entries(generators)) {
        if (isGeneratedPath(source) || source.startsWith("external:") || typeof digest !== "string") {
          return stale(`generated input ${path} names an unverifiable generator ${source}`, [path]);
        }
        const conflict = addTracked(source, digest);
        if (conflict) conflicts.push(conflict);
      }
    }
    // One file read with two contents (directly and by a generator) cannot be one tree.
    if (conflicts.length > 0) return stale(`compile inputs recorded with conflicting contents: ${conflicts.slice(0, 3).join(", ")}`, conflicts);
  } else {
    const inputs = Array.isArray(record.inputs) ? record.inputs.map(asObject) : [];
    if (inputs.length === 0) return stale("the restoration proof lists no inputs");
    for (const input of inputs) {
      if (input.generated === true) generated = true;
      else if (typeof input.path === "string" && input.path) tracked.set(input.path, { blob: typeof input.blob === "string" ? input.blob : null });
    }
  }
  const paths = [...tracked.keys()].sort();

  // 2. The integrated tree's content of every tracked input.
  const changed: string[] = [];
  const shaPaths = paths.filter((path) => tracked.get(path)!.sha256 !== undefined);
  if (shaPaths.length > 0) {
    const hashed = await params.run(params.repoRoot, ["python3", "-c", HASH_AT_REV_PY, params.integratedRev, ...shaPaths]);
    let hashes: Record<string, string | null>;
    try {
      hashes = hashed.exitCode === 0 ? JSON.parse(hashed.stdout) as Record<string, string | null> : {};
    } catch {
      hashes = {};
    }
    if (hashed.exitCode !== 0 || Object.keys(hashes).length !== shaPaths.length) return stale(`could not hash the compile inputs at ${params.integratedRev}`);
    for (const path of shaPaths) if (hashes[path] !== tracked.get(path)!.sha256) changed.push(path);
  }
  const blobPaths = paths.filter((path) => tracked.get(path)!.sha256 === undefined);
  if (blobPaths.length > 0) {
    const tree = await git(["ls-tree", "-r", params.integratedRev, "--", ...blobPaths]);
    if (tree.exitCode !== 0) return stale(`could not read the compile inputs at ${params.integratedRev}`);
    const blobs = new Map<string, string>();
    for (const line of lines(tree.stdout)) {
      const match = /^\d+ blob ([0-9a-f]+)\t(.+)$/.exec(line);
      if (match) blobs.set(match[2]!, match[1]!);
    }
    for (const path of blobPaths) if ((blobs.get(path) ?? null) !== tracked.get(path)!.blob) changed.push(path);
  }

  // 3 and 4: what others landed between the claim base and the pre-apply revision.
  const since = await git(["diff", "--name-only", "--no-renames", params.claimBaseRev, params.preApplyRev]);
  if (since.exitCode !== 0) return stale(`could not list the changes between ${params.claimBaseRev} and ${params.preApplyRev}`, changed, paths.length);
  const basenames = new Set(paths.map((path) => path.slice(path.lastIndexOf("/") + 1)));
  for (const path of lines(since.stdout)) {
    const configuration = BUILD_CONFIGURATION_PATHS.some((root) => path === root || path.startsWith(`${root}/`));
    const shadow = basenames.has(path.slice(path.lastIndexOf("/") + 1)) && !tracked.has(path);
    const hidden = generated && HEADER_LIKE.test(path);
    if ((configuration || shadow || hidden) && !changed.includes(path)) changed.push(path);
  }
  changed.sort();
  if (changed.length > 0) {
    return stale(`compile inputs changed between certification and the landing: ${changed.slice(0, 5).join(", ")}${changed.length > 5 ? ` (+${changed.length - 5})` : ""}`, changed, paths.length);
  }
  return { fresh: true, checked: paths.length, changed: [], reason: null };
}
