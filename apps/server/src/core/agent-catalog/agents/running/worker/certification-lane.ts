import { isAbsolute, normalize, relative } from "node:path";
import { runCommand, type CommandResult, type WorkspaceExec } from "@server/infrastructure/shell";
import { baseIdentityProofHash, type BaseIdentityInput, type BaseIdentityProof } from "@server/core/harness-runtime/run-state/certification.js";
import { steeringGateEnforced } from "@server/core/tools/steering-gate.js";
import type { WorkerRunnerValidation } from "./runner-validation.js";
import type { UnitKeyGame } from "@server/core/harness-runtime/run-state/unit-key.js";
import { trustedBaselineCertifiesTarget, unverifiedTargetCertified, type UnverifiedTargetRef } from "./steering-validation.js";

/**
 * The certification lane (plan §3.1: "real code over score"). For a target
 * whose verification is open, an `unverified_match` or a target whose latest
 * enforced gate run located steering, an attempt that does not raise the
 * target score is not rejected for that reason alone:
 *
 * 1. `compareWorkerUnitSnapshots` sets the score verdict aside
 *    (`certificationLane.outcome = "pending"`, status `passed`) when nothing
 *    else regressed: the target's own row and the unit's code totals it moves
 *    are not regressions there, any other function or the data still is;
 * 2. every other gate runs as usual (build, micro-gates, QA/review lint, the
 *    order-and-scope fence), then the steering gate (against the trusted base
 *    for an unverified target, as today);
 * 3. `resolveCertificationLane` keeps the attempt only when the gate certified
 *    the target (`certified`), or, for an unverified target, when a
 *    revision-bound base-identity proof shows the attempt restored the trusted
 *    base (`restored`: no exact completion, no budget grant). Anything else
 *    gets its score verdict back (`rejected`).
 *
 * Only enforced games (SMS) open the lane; Melee never does.
 */
export interface CertificationLaneOptions {
  reason: "unverified_match" | "steering_located";
  /** The run's game: gate rows (no module prefix) then match a report-named target (`UnverifiedTargetRef.game`). */
  game?: UnitKeyGame;
  /** Unverified targets only: what a base-identity proof needs. Absent: no restoration is considered. */
  restoration?: {
    trustedBaseRev: string | null;
    claimBaseRev: string | null;
    sourcePath: string;
    prove: BaseIdentityProver;
  } | null;
}

type LaneTarget = UnverifiedTargetRef;

/**
 * Establishes (or refuses, with the reason) that the candidate's target file
 * and every compile input equal the trusted base. `changedPaths` are the
 * repo-relative paths the attempt changed.
 */
export type BaseIdentityProver = (params: {
  trustedBaseRev: string;
  claimBaseRev: string;
  sourcePath: string;
  objectTarget: string | null;
  changedPaths: string[];
}) => Promise<BaseIdentityProof | string>;

/** The unit totals a target's own score moves: not a separate regression on the lane. */
const TARGET_DRIVEN_UNIT_METRICS = new Set(["fuzzy_match_percent", "matched_code_percent", "matched_functions_percent"]);

/**
 * On the lane, the regressions the target's own score change explains: its
 * function row, the unit's code totals and `.text`. Data metrics and sections,
 * and every other function, still count.
 */
export function laneTargetDrivenRegression(kind: "unit" | "function" | "section", item: string, symbol: string): boolean {
  if (kind === "function") return item === symbol;
  if (kind === "unit") return TARGET_DRIVEN_UNIT_METRICS.has(item);
  return item === ".text";
}

export const CERTIFICATION_LANE_REASON_PREFIX = "certification lane:";

/**
 * The enforced gate certified this attempt for the target: for an
 * `unverified_match` target both the claim-base run and the trusted-base run
 * (`unverifiedTargetCertified`); for any other target the claim-base run, with
 * the target's own rows `pass`, complete and touched, and its unit covered.
 * Requires a `passed` validation.
 */
export function attemptCertifiesTarget(
  validation: Pick<WorkerRunnerValidation, "status" | "steering" | "unverifiedTarget">,
  target: LaneTarget,
  options: { unverified: boolean },
): boolean {
  if (validation.status !== "passed" || !validation.steering || !steeringGateEnforced(validation.steering.mode)) return false;
  return options.unverified
    ? unverifiedTargetCertified(validation.steering, validation.unverifiedTarget, target)
    : trustedBaselineCertifiesTarget(validation.steering, target);
}

/** Restoration overrides only a gate verdict on the removal edits: an attempt any other gate rejected keeps that rejection. */
function restorationOverrides(status: WorkerRunnerValidation["status"]): boolean {
  return status === "passed" || status === "steering_located";
}

type LaneRestoration = NonNullable<CertificationLaneOptions["restoration"]>;

/** Runs the base-identity prover for an unverified target; a string is why identity was not established. */
async function proveRestoration(
  validation: Pick<WorkerRunnerValidation, "objectTarget">,
  restoration: LaneRestoration,
  changedPaths: string[],
): Promise<BaseIdentityProof | string> {
  if (!restoration.trustedBaseRev) return "no trusted base revision recorded for the unverified target";
  if (!restoration.claimBaseRev) return "no claim base revision";
  try {
    return await restoration.prove({
      trustedBaseRev: restoration.trustedBaseRev,
      claimBaseRev: restoration.claimBaseRev,
      sourcePath: restoration.sourcePath,
      objectTarget: validation.objectTarget ?? null,
      changedPaths,
    });
  } catch (error) {
    return `base identity could not be established: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function restored<T extends WorkerRunnerValidation>(
  validation: T,
  lane: NonNullable<WorkerRunnerValidation["certificationLane"]>,
  proof: BaseIdentityProof,
  symbol: string,
): T {
  return {
    ...validation,
    status: "passed",
    certificationLane: { ...lane, outcome: "restored", restoration: proof },
    reasons: [
      ...validation.reasons,
      `${CERTIFICATION_LANE_REASON_PREFIX} ${symbol} restored the trusted base ${proof.trustedBaseRev} (base-identity proof ${proof.proofHash.slice(0, 12)}): its unverified state clears at integration; not an exact completion`,
    ],
  };
}

/**
 * Restoration independent of the score rule: an unverified target whose
 * attempt kept its score (100 -> 100, so no lane was pending) and that the
 * gate could not certify, because removing the unexplained edits left no
 * edit group to certify, still gets the base-identity proof. Only for an
 * attempt the gate (or the unverified-target rule) rejected; anything a
 * proof cannot establish leaves the rejection, with the reason added.
 */
async function restoreAtEqualScore<T extends WorkerRunnerValidation>(
  validation: T,
  params: { lane: CertificationLaneOptions | null | undefined; target: LaneTarget; changedPaths: string[] },
): Promise<T> {
  const options = params.lane;
  if (validation.certificationLane || options?.reason !== "unverified_match" || !options.restoration) return validation;
  if (validation.status !== "steering_located") return validation;
  const target = { ...params.target, game: params.target.game ?? options.game };
  if (attemptCertifiesTarget({ ...validation, status: "passed" }, target, { unverified: true })) return validation;
  const proof = await proveRestoration(validation, options.restoration, params.changedPaths);
  if (typeof proof === "string") {
    return { ...validation, reasons: [...validation.reasons, `${CERTIFICATION_LANE_REASON_PREFIX} restoration of the trusted base not proven: ${proof}`] };
  }
  const lane = { reason: "unverified_match" as const, scoreStatus: "no_official_score_change" as const, scoreReasons: [], outcome: "pending" as const };
  return restored(validation, lane, proof, params.target.symbol);
}

/**
 * Resolves a pending lane after every gate ran. Returns the validation
 * unchanged when there is no pending lane.
 */
export async function resolveCertificationLane<T extends WorkerRunnerValidation>(
  validation: T,
  params: {
    lane: CertificationLaneOptions | null | undefined;
    target: LaneTarget;
    changedPaths: string[];
  },
): Promise<T> {
  const lane = validation.certificationLane;
  if (!lane || lane.outcome !== "pending") return restoreAtEqualScore(validation, params);
  const unverified = lane.reason === "unverified_match";
  const target = { ...params.target, game: params.target.game ?? params.lane?.game };
  if (attemptCertifiesTarget(validation, target, { unverified })) {
    return {
      ...validation,
      certificationLane: { ...lane, outcome: "certified" },
      reasons: [...validation.reasons, `${CERTIFICATION_LANE_REASON_PREFIX} the steering gate certified ${params.target.symbol}; accepted without a score gain`],
    };
  }
  let restorationRefused: string | undefined;
  const restoration = unverified ? params.lane?.restoration : null;
  if (restoration && restorationOverrides(validation.status)) {
    const proof = await proveRestoration(validation, restoration, params.changedPaths);
    if (typeof proof !== "string") return restored(validation, lane, proof, params.target.symbol);
    restorationRefused = proof;
  }
  const notCertified = `${CERTIFICATION_LANE_REASON_PREFIX} ${params.target.symbol} did not raise its score and the steering gate did not certify it; only a certified result is accepted without a score gain`;
  const rejected = { ...lane, outcome: "rejected" as const, ...(restorationRefused ? { restorationRefused } : {}) };
  if (validation.status !== "passed") {
    return { ...validation, certificationLane: rejected, reasons: [...validation.reasons, ...lane.scoreReasons, notCertified] };
  }
  return {
    ...validation,
    status: lane.scoreStatus,
    certificationLane: rejected,
    reasons: [...validation.reasons, ...lane.scoreReasons, notCertified],
  };
}

/** Every path a `git diff` touches (both sides of a rename or delete). */
export function diffChangedPaths(diffText: string): string[] {
  const paths = new Set<string>();
  for (const line of diffText.split(/\r?\n/)) {
    const match = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (match) {
      paths.add(match[1]!);
      paths.add(match[2]!);
    }
  }
  return [...paths];
}

function repoRelative(path: string, workspaceRoot: string): string | null {
  const trimmed = path.trim();
  if (!trimmed) return null;
  const rel = isAbsolute(trimmed) ? relative(workspaceRoot, trimmed) : normalize(trimmed);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) return null;
  return rel.replaceAll("\\", "/");
}

/** `ninja -t deps <target>`: the recorded dependencies as ninja names them, or null when none are recorded (or stale). */
export function parseNinjaDeps(stdout: string): string[] | null {
  const lines = stdout.split(/\r?\n/);
  const header = lines.find((line) => line.trim() && !/^\s/.test(line));
  if (!header || /#deps 0\b/.test(header) || /\(STALE\)|\(MISSING\)/.test(header)) return null;
  const deps = lines.filter((line) => /^\s+\S/.test(line)).map((line) => line.trim());
  return deps.length > 0 ? [...new Set(deps)] : null;
}

function outputLines(stdout: string): string[] {
  return stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

/** Build outputs: generated, so verified through their own inputs, never against a tracked blob. */
function generatedPath(rel: string): boolean {
  return rel === "build" || rel.startsWith("build/");
}

/** At most this many generated inputs are followed back to their sources; more refuses the proof. */
const MAX_GENERATED_INPUTS = 64;
const HASH_CHUNK = 100;

/**
 * Build-tool binaries the sandbox image provides (downloaded compilers and
 * tools, not built from this repository): environment, like a system
 * toolchain outside the checkout. They must be up to date for ninja; they
 * are never regenerated (that would need the network).
 */
const TOOLCHAIN_OUTPUT = /^build\/(?:tools|compilers|binutils)\//;

/**
 * The default prover: the candidate in the attempt's workspace against the
 * trusted base in the host checkout (which has the history). Every compile
 * input of the unit is checked, whatever git says changed:
 *
 * - the inputs are the object's recorded dependencies (`ninja -t deps`), its
 *   build inputs (`ninja -t inputs`: compiler, wrappers, dependency
 *   transforms) and the build definition's inputs (`ninja -t inputs
 *   build.ninja`: configure script and config, so the compile flags too);
 * - a generated input (under `build/`, such as a precompiled header) is
 *   followed back to its own recorded dependencies and inputs, then
 *   regenerated from them (after they are verified) and must match the
 *   workspace's copy byte for byte; build-tool binaries the image provides
 *   (`TOOLCHAIN_OUTPUT`) are environment and must only be up to date;
 * - every tracked input must exist at the trusted base with the same blob
 *   (`git hash-object` in the workspace against `git ls-tree` on the host);
 *   paths outside the checkout (system toolchain) are environment, identical
 *   for both;
 * - the attempt may change only those inputs.
 *
 * Anything unanswerable refuses: no recorded dependencies, an input ninja
 * cannot describe, a generated input that does not match its regeneration
 * (or cannot be regenerated), a stale build tool, an input absent from the trusted
 * base, or a hash that cannot be read.
 */
export function workspaceBaseIdentityProver(params: {
  workspaceExec: WorkspaceExec;
  workspaceRoot: string;
  hostRepoRoot: string;
  hostGit?: (args: string[]) => Promise<CommandResult>;
}): BaseIdentityProver {
  const hostGit = params.hostGit ?? ((args: string[]) => runCommand(params.hostRepoRoot, ["git", "-C", params.hostRepoRoot, ...args], { timeoutMs: 60_000 }));
  const ninja = async (args: string[]): Promise<CommandResult | null> => {
    try {
      return await params.workspaceExec.exec(["ninja", ...args], { timeoutMs: 120_000 });
    } catch {
      return null;
    }
  };
  return async ({ trustedBaseRev, claimBaseRev, sourcePath, objectTarget, changedPaths }) => {
    if ([trustedBaseRev, claimBaseRev].some((rev) => rev.startsWith("-"))) return "unusable revision";
    const source = repoRelative(sourcePath, params.workspaceRoot);
    if (!source) return "the target has no repo-relative source path";
    if (!objectTarget) return "the unit's object is unknown, so its compile inputs are unknown";
    const deps = await ninja(["-t", "deps", objectTarget]);
    const recorded = deps?.exitCode === 0 ? parseNinjaDeps(deps.stdout) : null;
    if (!recorded) return `no recorded compile dependencies for ${objectTarget}`;
    const objectInputs = await ninja(["-t", "inputs", objectTarget]);
    if (objectInputs?.exitCode !== 0) return `ninja cannot list the build inputs of ${objectTarget}`;
    const definition = await ninja(["-t", "inputs", "build.ninja"]);
    if (definition?.exitCode !== 0) return "ninja cannot list the build definition's inputs (configure script and config)";

    const tracked = new Set<string>([source]);
    const generated = new Map<string, string>();
    const pending: string[] = [];
    const add = (name: string) => {
      const rel = repoRelative(name, params.workspaceRoot);
      if (!rel) return;
      if (!generatedPath(rel)) tracked.add(rel);
      else if (!generated.has(rel)) {
        generated.set(rel, name);
        pending.push(name);
      }
    };
    for (const name of [...recorded, ...outputLines(objectInputs.stdout), ...outputLines(definition.stdout)]) add(name);
    while (pending.length > 0) {
      if (generated.size > MAX_GENERATED_INPUTS) return `more than ${MAX_GENERATED_INPUTS} generated compile inputs to follow`;
      const name = pending.shift()!;
      const rel = repoRelative(name, params.workspaceRoot)!;
      const inputs = await ninja(["-t", "inputs", name]);
      if (inputs?.exitCode !== 0) return `ninja cannot list the inputs of generated ${rel}`;
      const own = await ninja(["-t", "deps", name]);
      for (const input of [...outputLines(inputs.stdout), ...(own?.exitCode === 0 ? parseNinjaDeps(own.stdout) ?? [] : [])]) add(input);
    }

    const changed = changedPaths.map((path) => repoRelative(path, params.workspaceRoot)).filter((path): path is string => path !== null);
    const outside = changed.filter((path) => !tracked.has(path));
    if (outside.length > 0) return `the attempt changes files outside the target's compile inputs: ${outside.slice(0, 5).join(", ")}`;

    const paths = [...tracked].sort();
    const trusted = new Map<string, string>();
    for (let index = 0; index < paths.length; index += HASH_CHUNK) {
      const tree = await hostGit(["ls-tree", "-r", trustedBaseRev, "--", ...paths.slice(index, index + HASH_CHUNK)]);
      if (tree.exitCode !== 0) return `could not read the trusted base ${trustedBaseRev}`;
      for (const line of tree.stdout.split(/\r?\n/)) {
        const match = /^\d+ blob ([0-9a-f]+)\t(.+)$/.exec(line);
        if (match) trusted.set(match[2]!, match[1]!);
      }
    }
    const missing = paths.find((path) => !trusted.has(path));
    if (missing) return `compile input ${missing} is not in the trusted base ${trustedBaseRev}`;
    /**
     * Regenerates every source-derived generated input from the (verified)
     * trusted-base inputs and compares content, so a tampered output with a
     * fresh timestamp cannot pass. The candidates are moved to a scratch
     * directory, ninja rebuilds them in one run (a whole chain, prerequisites
     * first), their hashes are compared, and the candidates are put back
     * whatever happened: the workspace is left as found. ninja's build
     * definition names absolute output paths, so the rebuild cannot be
     * redirected into a separate root.
     */
    const regenerate = async (outputs: Array<{ rel: string; name: string }>): Promise<Map<string, string> | string> => {
      if (outputs.length === 0) return new Map();
      const run = async (command: string[]): Promise<CommandResult | null> => {
        try {
          return await params.workspaceExec.exec(command, { timeoutMs: 600_000 });
        } catch {
          return null;
        }
      };
      const scratch = (await run(["mktemp", "-d"]))?.stdout.trim();
      if (!scratch) return "could not create a scratch directory to regenerate the generated compile inputs";
      const saved: Array<{ name: string; copy: string }> = [];
      try {
        for (const [index, output] of outputs.entries()) {
          const copy = `${scratch}/${index}`;
          if ((await run(["cp", "-p", output.name, copy]))?.exitCode !== 0) return `could not set aside generated input ${output.rel}`;
          saved.push({ name: output.name, copy });
        }
        const candidates = await hashOf(saved.map(({ copy }) => copy));
        if (typeof candidates === "string") return candidates;
        for (const output of outputs) {
          if ((await run(["rm", "-f", output.name]))?.exitCode !== 0) return `could not remove generated input ${output.rel} to regenerate it`;
        }
        const rebuilt = await run(["ninja", ...outputs.map(({ name }) => name)]);
        if (rebuilt?.exitCode !== 0) return `could not regenerate the generated compile inputs from the trusted-base inputs: ${(rebuilt?.stderr || rebuilt?.stdout || "ninja failed").trim().slice(-300)}`;
        const fresh = await hashOf(outputs.map(({ name }) => name));
        if (typeof fresh === "string") return fresh;
        const hashes = new Map<string, string>();
        for (const [index, output] of outputs.entries()) {
          const blob = fresh.get(output.name)!;
          if (blob !== candidates.get(saved[index]!.copy)) return `generated input ${output.rel} does not match its regeneration from the trusted-base inputs`;
          hashes.set(output.rel, blob);
        }
        return hashes;
      } finally {
        for (const { name, copy } of saved) await run(["mv", "-f", copy, name]);
        await run(["rm", "-rf", scratch]);
      }
    };
    const hashOf = async (list: string[]): Promise<Map<string, string> | string> => {
      const hashes = new Map<string, string>();
      for (let index = 0; index < list.length; index += HASH_CHUNK) {
        const chunk = list.slice(index, index + HASH_CHUNK);
        let result: CommandResult;
        try {
          result = await params.workspaceExec.exec(["git", "hash-object", "--", ...chunk], { timeoutMs: 120_000 });
        } catch (error) {
          return `could not hash the compile inputs in the attempt's workspace: ${error instanceof Error ? error.message : String(error)}`;
        }
        const lines = outputLines(result.stdout);
        if (result.exitCode !== 0 || lines.length !== chunk.length) return "could not hash the compile inputs in the attempt's workspace";
        chunk.forEach((path, offset) => hashes.set(path, lines[offset]!));
      }
      return hashes;
    };
    const actual = await hashOf(paths);
    if (typeof actual === "string") return actual;
    const differs = paths.find((path) => actual.get(path) !== trusted.get(path));
    if (differs) return `${differs} differs from the trusted base ${trustedBaseRev}`;
    const generatedPaths = [...generated.keys()].sort();
    const toolchain = generatedPaths.filter((rel) => TOOLCHAIN_OUTPUT.test(rel));
    for (const rel of toolchain) {
      const dryRun = await ninja(["-n", generated.get(rel)!]);
      if (dryRun?.exitCode !== 0 || !/no work to do/i.test(dryRun.stdout)) return `build tool ${rel} is not up to date`;
    }
    const derived = generatedPaths.filter((rel) => !TOOLCHAIN_OUTPUT.test(rel));
    const regenerated = await regenerate(derived.map((rel) => ({ rel, name: generated.get(rel)! })));
    if (typeof regenerated === "string") return regenerated;
    const toolchainHashes = await hashOf(toolchain);
    if (typeof toolchainHashes === "string") return toolchainHashes;
    const generatedHashes = new Map([...regenerated, ...toolchainHashes]);
    const inputs: BaseIdentityInput[] = [
      ...paths.map((path) => ({ path, blob: trusted.get(path)! })),
      ...generatedPaths.map((path) => ({ path, blob: generatedHashes.get(path)!, generated: true })),
    ].sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
    const proof = { trustedBaseRev, claimBaseRev, sourcePath: source, inputs, dependenciesKnown: true };
    return { ...proof, proofHash: baseIdentityProofHash(proof) };
  };
}
