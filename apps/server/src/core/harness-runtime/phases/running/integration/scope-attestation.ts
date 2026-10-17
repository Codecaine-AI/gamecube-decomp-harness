import { createHash } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import type { runCommand } from "@server/infrastructure/shell";
import {
  EDIT_SCOPE_REJECT_VERDICTS,
  editScopePolicyJson,
  type EditScopeInputs,
  type EditScopeOrderingPolicy,
  type EditScopeResult,
} from "@server/core/validation/edit-scope/edit-scope.js";

/**
 * Sandbox scope attestation (scale fix S11), advisory only. The worker ran
 * `edit_scope.py` in its sandbox at validation time, and the checkpoint
 * carries that verdict bound to the exact patch. Integration never skips its
 * own host check because of it: every input of a sandbox verdict is
 * worker-writable (the checker code, the target objects behind readiness, the
 * readiness cache under `/tmp/orch-readiness-cache`), so a worker can forge a
 * pass with genuine patch hashes. Nothing the sandbox computed is re-derivable
 * from git on the host without running the check itself.
 *
 * What the attestation still buys: when the host check rejects a patch the
 * sandbox attested as a pass over the very same inputs, integration records
 * the disagreement (a forged or broken sandbox checker). "Same inputs" is
 * re-verified on the host with a few git calls:
 *
 * - the patch bytes (sha256) are the ones the worker banked;
 * - the patch's in-scope files over HEAD have exactly the before/after git
 *   blobs the sandbox classified (same file set, same texts);
 * - the ordering policy and target unit are the integration's own;
 * - nothing under the indexed sources (`src`, `include`, `libs`) changed
 *   between the claim base and HEAD: any such file can change the type index
 *   (a typedef in an unrelated `.cpp`), class definitions or readiness.
 *
 * A missing, malformed or stale attestation is "not comparable", never a pass.
 */

export const EDIT_SCOPE_ATTESTATION_KEY = "edit_scope_attestation";

export interface EditScopeAttestation {
  version: 1;
  /** Full claim base revision the sandbox classified against. */
  base_rev: string;
  /** sha256 of the checkpoint patch file's bytes. */
  patch_sha256: string;
  policy_json: string;
  target_unit: string | null;
  verdict: "pass";
  files: EditScopeInputs["files"];
  owner_sources: string[];
  /** The checker's own canonical patch hash (provenance only). */
  report_patch_sha256: string | null;
  hunk_count: number;
}

type CommandRunner = typeof runCommand;

const ZERO_BLOB = /^0{40}$/;
const UNUSED_VERDICTS: readonly string[] = ["dead_unused", "unused_unverified"];

export function sha256Text(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** `edit_scope.py in_scope`: src/**, include/**, libs/<lib>/include/**. */
export function editScopeInScope(path: string): boolean {
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "src" || parts[0] === "include") return parts.length > 1;
  return parts[0] === "libs" && parts.length > 3 && parts[2] === "include";
}

/**
 * The attestation a checkpoint carries, or null when the sandbox verdict
 * cannot be reused: no pass, a checker error, no `scope_inputs` (an older
 * toolpack), UNUSED evidence involved, or no claim base.
 */
export function buildEditScopeAttestation(params: {
  result: EditScopeResult | null | undefined;
  /** The post-steering UNUSED re-check: its certificates make the verdict host-only. */
  unusedResult?: EditScopeResult | null;
  /** The pre-steering check got a previous attempt's UNUSED certificates. */
  usedUnusedChecks?: boolean;
  policy: EditScopeOrderingPolicy | null | undefined;
  baseRev: string | null | undefined;
  targetUnit: string | null;
  patchText: string;
}): EditScopeAttestation | null {
  const report = params.result?.report;
  if (!params.policy || !params.result || params.result.error || !report || report.verdict !== "pass") return null;
  if (params.unusedResult || params.usedUnusedChecks || !report.scope_inputs) return null;
  if (report.hunks.some((hunk) => EDIT_SCOPE_REJECT_VERDICTS.includes(hunk.verdict) || UNUSED_VERDICTS.includes(hunk.verdict))) return null;
  const base = report.identity.base_rev;
  if (!base || !/^[0-9a-f]{40}$/.test(base) || !params.baseRev || !base.startsWith(params.baseRev)) return null;
  if (!params.patchText.trim()) return null;
  return {
    version: 1,
    base_rev: base,
    patch_sha256: sha256Text(params.patchText),
    policy_json: editScopePolicyJson(params.policy),
    target_unit: params.targetUnit || null,
    verdict: "pass",
    files: report.scope_inputs.files,
    owner_sources: report.scope_inputs.owner_sources,
    report_patch_sha256: report.identity.patch_sha256,
    hunk_count: report.hunks.length,
  };
}

function readAttestation(value: unknown): EditScopeAttestation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.version !== 1 || record.verdict !== "pass") return null;
  if (typeof record.base_rev !== "string" || !/^[0-9a-f]{40}$/.test(record.base_rev)) return null;
  if (typeof record.patch_sha256 !== "string" || typeof record.policy_json !== "string") return null;
  if (record.target_unit !== null && typeof record.target_unit !== "string") return null;
  if (!Array.isArray(record.files) || !Array.isArray(record.owner_sources)) return null;
  for (const file of record.files) {
    if (!file || typeof file !== "object" || typeof (file as Record<string, unknown>).path !== "string") return null;
  }
  if (record.owner_sources.some((source) => typeof source !== "string")) return null;
  return record as unknown as EditScopeAttestation;
}

export type AttestationCheck =
  | { ok: true; headRev: string; baseRev: string; changedPaths: string[]; durationMs: number }
  | { ok: false; reason: string; durationMs: number };

function filesKey(rows: EditScopeInputs["files"]): string {
  return JSON.stringify([...rows]
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map((row) => [row.path, row.before_blob ?? null, row.after_blob ?? null]));
}

/**
 * Whether a checkpoint's attestation was made over exactly the inputs the
 * host check sees at the current HEAD (see the module comment); `ok` never
 * means the patch is in scope. Uses a throwaway index under `dir`; never touches the
 * repo's index or working tree. Never throws.
 */
export async function verifyEditScopeAttestation(params: {
  attestation: unknown;
  patchText: string;
  patchPath: string;
  policy: EditScopeOrderingPolicy;
  targetUnit: string | null;
  commandRunner: CommandRunner;
  repoRoot: string;
  dir: string;
}): Promise<AttestationCheck> {
  const started = Date.now();
  const fail = (reason: string): AttestationCheck => ({ ok: false, reason, durationMs: Date.now() - started });
  const attestation = readAttestation(params.attestation);
  if (!attestation) return fail(params.attestation == null ? "no sandbox scope attestation" : "malformed sandbox scope attestation");
  if (sha256Text(params.patchText) !== attestation.patch_sha256) return fail("the patch differs from the one the sandbox checked");
  if (attestation.policy_json !== editScopePolicyJson(params.policy)) return fail("the ordering policy changed since the sandbox check");
  if ((attestation.target_unit ?? null) !== (params.targetUnit || null)) {
    return fail(`the sandbox checked target unit ${attestation.target_unit ?? "(none)"}, not ${params.targetUnit ?? "(none)"}`);
  }
  const env = { GIT_INDEX_FILE: resolve(params.dir, "attest-index") };
  const git = async (args: string[], label: string, withIndex = false): Promise<string> => {
    const result = await params.commandRunner(params.repoRoot, ["git", ...args], withIndex ? { env } : undefined);
    if (result.exitCode !== 0) throw new Error(`${label} exited ${result.exitCode}: ${(result.stderr || result.stdout).trim().slice(-300)}`);
    return result.stdout;
  };
  try {
    await rm(params.dir, { recursive: true, force: true });
    await mkdir(params.dir, { recursive: true });
    const headRev = (await git(["rev-parse", "HEAD"], "git rev-parse HEAD")).trim();
    await git(["read-tree", headRev], "git read-tree", true);
    await git(["apply", "--cached", params.patchPath], "git apply --cached", true);
    const raw = await git(["diff", "--cached", "--raw", "--no-renames", "--no-abbrev", headRev], "git diff --cached --raw", true);
    const actual: EditScopeInputs["files"] = [];
    const changedPaths: string[] = [];
    for (const line of raw.split("\n")) {
      const [meta, path] = line.split("\t");
      if (!meta || !path) continue;
      changedPaths.push(path);
      if (!editScopeInScope(path)) continue;
      const fields = meta.split(" ");
      const before = fields[2] ?? "";
      const after = fields[3] ?? "";
      actual.push({ path, before_blob: ZERO_BLOB.test(before) ? null : before, after_blob: ZERO_BLOB.test(after) ? null : after });
    }
    if (filesKey(actual) !== filesKey(attestation.files)) return fail("the patch's files over HEAD are not the texts the sandbox checked");
    if (headRev !== attestation.base_rev) {
      // Any indexed-source change can alter the verdict (type index, class definitions, readiness).
      const drift = (await git(["diff", "--name-only", "--no-renames", attestation.base_rev, headRev, "--", "src", "include", "libs"], "git diff --name-only"))
        .split("\n").filter(Boolean);
      if (drift.length > 0) {
        return fail(`indexed sources changed since ${attestation.base_rev.slice(0, 12)}: ${drift.slice(0, 5).join(", ")}${drift.length > 5 ? ` +${drift.length - 5} more` : ""}`);
      }
    }
    return { ok: true, headRev, baseRev: attestation.base_rev, changedPaths, durationMs: Date.now() - started };
  } catch (error) {
    return fail(`attestation re-verification failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await rm(params.dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
