import type { CommandResult } from "@server/infrastructure/shell/run-command.js";

// The build-sandbox check that a steering `apply` (rollback) leaves every
// affected unit compiling. Dependency-free: the bundled build-task worker runs
// it in the sandbox. Rollback fa5d5210 reverted one side of a declaration/use
// pair in 5 SMS units; an apply whose units no longer compile is refused and
// returns no patch.

/** File -> the units (and their objects) compiling it: unit sources and the units including a header. */
export interface SteeringApplyVerify {
  owners: Record<string, Array<{ unit: string; object: string }>>;
}

export interface SteeringApplyCompileFailure {
  unit: string;
  object: string;
  /** The compile's output, bounded to its last `APPLY_COMPILE_OUTPUT_CHARS` characters. */
  output: string;
}

/** What the post-apply compile found. `ok` false refuses the apply. */
export interface SteeringApplyCompile {
  ok: boolean;
  /** Files the apply changed (repo-relative). */
  changed: string[];
  /** Objects compiled (or that would have been). */
  objects: string[];
  failures: SteeringApplyCompileFailure[];
  /** Changed source/header files no known unit compiles: refused, since nothing proves they still build. */
  unowned: string[];
  error?: string;
}

export const APPLY_COMPILE_OUTPUT_CHARS = 2_000;
const COMPILED_FILE = /\.(?:c|cc|cp|cpp|cxx|h|hh|hpp|hxx|inc|inl)$/i;

type Run = (command: string[], options?: { timeoutMs?: number }) => Promise<CommandResult>;

function tail(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > APPLY_COMPILE_OUTPUT_CHARS ? `…${trimmed.slice(-APPLY_COMPILE_OUTPUT_CHARS)}` : trimmed;
}

/**
 * Compiles every unit whose source, or an included header, the apply changed
 * (`git diff` against `sourceTree`, the tree the sandbox started from), with
 * `ninja -k 0` and then one object at a time to name each failing unit.
 */
export async function verifyApplyCompiles(run: Run, sourceTree: string, verify: SteeringApplyVerify, timeoutMs = 30 * 60_000): Promise<SteeringApplyCompile> {
  const refused = (fields: Partial<SteeringApplyCompile>): SteeringApplyCompile => ({ ok: false, changed: [], objects: [], failures: [], unowned: [], ...fields });
  const staged = await run(["git", "add", "-A"]);
  const diff = staged.exitCode === 0 ? await run(["git", "diff", "--cached", "--name-only", "--no-renames", sourceTree, "--"]) : staged;
  if (diff.exitCode !== 0) return refused({ error: `cannot list the files the apply changed: ${tail(diff.stderr || diff.stdout)}` });
  const changed = diff.stdout.split("\n").map((line) => line.trim()).filter(Boolean).sort();
  const units = new Map<string, string>();
  const unowned: string[] = [];
  for (const file of changed) {
    const owners = verify.owners[file] ?? [];
    if (owners.length === 0) {
      if (COMPILED_FILE.test(file)) unowned.push(file);
      continue;
    }
    for (const owner of owners) units.set(owner.object, owner.unit);
  }
  const objects = [...units.keys()].sort();
  if (unowned.length > 0) return refused({ changed, objects, unowned });
  if (objects.length === 0) return { ok: true, changed, objects, failures: [], unowned: [] };
  const all = await run(["ninja", "-k", "0", ...objects], { timeoutMs });
  if (all.exitCode === 0) return { ok: true, changed, objects, failures: [], unowned: [] };
  const failures: SteeringApplyCompileFailure[] = [];
  for (const object of objects) {
    const one = await run(["ninja", object], { timeoutMs });
    if (one.exitCode !== 0) failures.push({ unit: units.get(object)!, object, output: tail(`${one.stdout}\n${one.stderr}`) });
  }
  // The batch failed but no single object did: still refused, with the batch output.
  if (failures.length === 0) failures.push({ unit: "(batch)", object: objects.join(" "), output: tail(`${all.stdout}\n${all.stderr}`) });
  return refused({ changed, objects, failures });
}

/** One line naming the refusal, for stderr and problems. */
export function applyCompileSummary(compile: SteeringApplyCompile): string {
  if (compile.error) return `apply refused: ${compile.error}`;
  if (compile.unowned.length > 0) return `apply refused: it changed ${compile.unowned.join(", ")}, which no known unit compiles`;
  return `apply refused: ${compile.failures.length} unit(s) no longer compile after the revert: ${compile.failures.map((failure) => failure.unit).join(", ")}`;
}
