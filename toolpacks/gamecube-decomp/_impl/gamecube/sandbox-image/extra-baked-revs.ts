/**
 * List the revisions a snapshot should bake beside its baked HEAD, so worker
 * provisioning finds them in the image instead of shipping a full-history
 * seed bundle (a trusted base older than the baked commit cannot travel in a
 * thin `^baked` bundle).
 *
 *   bun extra-baked-revs.ts --state-db <orchestrator.sqlite | state dir> --game <id> --out <file> [--repo <checkout>]
 *
 * Opens the state DB read-only (no default path: pass a copy or the live file
 * explicitly) and collects, for the game:
 *
 * - `unverified`: `steering_unverified_matches.base_rev` of active rows
 *   (`cleared_at IS NULL`): the trusted base a claim on that target must carry
 *   (`requiredRevs` in provisioning);
 * - `run`: `runs.head_revision` and `inputs_json.base_revision` of
 *   non-terminal runs (`draft`, `ready`, `active`, `paused`);
 * - `claim`: `target_claims.base_rev` of `active` claims of the game's runs;
 * - `job`: `payload_json.base_rev` of worker jobs not yet finished (`queued`,
 *   `claimed`, `running`, `waiting`): the claim-time base provisioning seeds.
 *
 * Anything else (cleared rows, terminal runs, closed claims, finished jobs) is
 * left out. A table or column the store does not have yet contributes nothing.
 * The output is sorted and de-duplicated, one revision per line after `#`
 * comment lines. With `--repo` every revision resolves to its full SHA in that
 * checkout and one it does not hold is dropped with a warning on stderr;
 * without it short SHAs pass through (build_image_bundle.sh resolves them and
 * fails on any the host lacks). Values that are not hex SHAs are dropped with
 * a warning.
 */
import { Database } from "bun:sqlite";
import { existsSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export type ExtraRevSource = "unverified" | "run" | "claim" | "job";

export interface ExtraBakedRevs {
  /** Sorted, de-duplicated revisions (as stored, lower-cased). */
  revs: string[];
  /** Which sources named each revision. */
  sources: Record<string, ExtraRevSource[]>;
  /** Values dropped because they are not hex SHAs. */
  invalid: string[];
}

const NON_TERMINAL_RUN_STATUSES = ["draft", "ready", "active", "paused"];
const UNFINISHED_JOB_STATUSES = ["queued", "claimed", "running", "waiting"];
const SHA_PATTERN = /^[0-9a-f]{4,64}$/;

function columns(db: Database, table: string): Set<string> {
  return new Set((db.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map(({ name }) => name));
}

function placeholders(values: string[]): string {
  return values.map(() => "?").join(", ");
}

function inputsBaseRevision(text: unknown): string | null {
  try {
    const value = (JSON.parse(String(text ?? "")) as { base_revision?: unknown } | null)?.base_revision;
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

/** Collect the game's in-use revisions from an open (read-only) state DB. */
export function collectExtraBakedRevs(db: Database, gameId: string): ExtraBakedRevs {
  const sources = new Map<string, Set<ExtraRevSource>>();
  const invalid = new Set<string>();
  const add = (value: unknown, source: ExtraRevSource) => {
    if (typeof value !== "string" || !value.trim()) return;
    const rev = value.trim().toLowerCase();
    if (!SHA_PATTERN.test(rev)) {
      invalid.add(value);
      return;
    }
    if (!sources.has(rev)) sources.set(rev, new Set());
    sources.get(rev)!.add(source);
  };

  const unverified = columns(db, "steering_unverified_matches");
  if (unverified.has("base_rev") && unverified.has("cleared_at")) {
    for (const row of db.query("SELECT DISTINCT base_rev FROM steering_unverified_matches WHERE game_id = ? AND cleared_at IS NULL").all(gameId) as Array<{ base_rev: unknown }>) {
      add(row.base_rev, "unverified");
    }
  }

  const runs = columns(db, "runs");
  if (runs.has("game_id") && runs.has("status")) {
    const rows = db.query(
      `SELECT ${runs.has("head_revision") ? "head_revision" : "NULL AS head_revision"}, ${runs.has("inputs_json") ? "inputs_json" : "NULL AS inputs_json"}
         FROM runs WHERE game_id = ? AND status IN (${placeholders(NON_TERMINAL_RUN_STATUSES)})`,
    ).all(gameId, ...NON_TERMINAL_RUN_STATUSES) as Array<{ head_revision: unknown; inputs_json: unknown }>;
    for (const row of rows) {
      add(row.head_revision, "run");
      add(inputsBaseRevision(row.inputs_json), "run");
    }
    const claims = columns(db, "target_claims");
    if (claims.has("base_rev") && claims.has("run_id") && claims.has("status")) {
      for (const row of db.query(
        `SELECT DISTINCT target_claims.base_rev AS base_rev FROM target_claims JOIN runs ON runs.id = target_claims.run_id
          WHERE runs.game_id = ? AND target_claims.status = 'active'`,
      ).all(gameId) as Array<{ base_rev: unknown }>) {
        add(row.base_rev, "claim");
      }
    }
  }

  const jobs = columns(db, "jobs");
  if (jobs.has("payload_json") && jobs.has("game_id") && jobs.has("kind") && jobs.has("status")) {
    for (const row of db.query(
      `SELECT DISTINCT json_extract(payload_json, '$.base_rev') AS base_rev FROM jobs
        WHERE game_id = ? AND kind = 'worker' AND status IN (${placeholders(UNFINISHED_JOB_STATUSES)}) AND json_valid(payload_json)`,
    ).all(gameId, ...UNFINISHED_JOB_STATUSES) as Array<{ base_rev: unknown }>) {
      add(row.base_rev, "job");
    }
  }

  const revs = [...sources.keys()].sort();
  return {
    revs,
    sources: Object.fromEntries(revs.map((rev) => [rev, [...sources.get(rev)!].sort()])),
    invalid: [...invalid].sort(),
  };
}

/** The full SHA of `rev` in `repo`, or null when the checkout does not hold that commit. */
export function resolveInRepo(repo: string, rev: string): string | null {
  const result = Bun.spawnSync(["git", "-C", repo, "rev-parse", "--verify", "--quiet", `${rev}^{commit}`], { stdout: "pipe", stderr: "pipe" });
  const sha = result.stdout.toString().trim();
  return result.exitCode === 0 && /^[0-9a-f]{40,64}$/.test(sha) ? sha : null;
}

/** Open the state DB read-only: a file path, or a state dir holding `orchestrator.sqlite`. */
export function openStateDbReadonly(path: string): Database {
  const resolved = resolve(path);
  const file = existsSync(resolved) && statSync(resolved).isDirectory() ? join(resolved, "orchestrator.sqlite") : resolved;
  if (!existsSync(file)) throw new Error(`state DB not found: ${file}`);
  return new Database(file, { readonly: true });
}

export function renderExtraRevsFile(params: { gameId: string; stateDb: string; revs: string[]; sources: Record<string, ExtraRevSource[]> }): string {
  const counts = new Map<ExtraRevSource, number>();
  for (const rev of params.revs) for (const source of params.sources[rev] ?? []) counts.set(source, (counts.get(source) ?? 0) + 1);
  const summary = (["unverified", "run", "claim", "job"] as const).map((source) => `${source}=${counts.get(source) ?? 0}`).join(" ");
  return [
    `# Extra baked revisions for ${params.gameId} (extra-baked-revs.ts)`,
    `# state DB: ${params.stateDb}`,
    `# sources: ${summary}`,
    ...params.revs,
    "",
  ].join("\n");
}

interface CliOptions { stateDb?: string; gameId?: string; out?: string; repo?: string }

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]!;
    const value = () => { const v = argv[++i]; if (v === undefined) throw new Error(`${flag} needs a value`); return v; };
    switch (flag) {
      case "--state-db": options.stateDb = value(); break;
      case "--game": options.gameId = value(); break;
      case "--out": options.out = resolve(value()); break;
      case "--repo": options.repo = resolve(value()); break;
      case "-h": case "--help":
        console.log("Usage: bun extra-baked-revs.ts --state-db <orchestrator.sqlite | state dir> --game <id> --out <file> [--repo <checkout>]");
        process.exit(0);
      default: throw new Error(`unknown argument: ${flag}`);
    }
  }
  if (!options.stateDb) throw new Error("--state-db is required (opened read-only)");
  if (!options.gameId) throw new Error("--game is required");
  if (!options.out) throw new Error("--out is required");
  return options;
}

export function runExtraBakedRevs(options: CliOptions, warn: (line: string) => void = (line) => console.error(line)): string[] {
  const db = openStateDbReadonly(options.stateDb!);
  let collected: ExtraBakedRevs;
  try {
    collected = collectExtraBakedRevs(db, options.gameId!);
  } finally {
    db.close();
  }
  for (const value of collected.invalid) warn(`WARNING: dropping ${JSON.stringify(value)}: not a commit SHA`);
  const final = new Map<string, ExtraRevSource[]>();
  for (const rev of collected.revs) {
    const from = collected.sources[rev]!;
    if (!options.repo) {
      if (rev.length < 40) warn(`WARNING: ${rev} is a short SHA; pass --repo to resolve it now`);
      final.set(rev, from);
      continue;
    }
    const full = resolveInRepo(options.repo, rev);
    if (!full) {
      warn(`WARNING: dropping ${rev} (${from.join(", ")}): not a commit in ${options.repo}`);
      continue;
    }
    final.set(full, [...new Set([...(final.get(full) ?? []), ...from])].sort());
  }
  const revs = [...final.keys()].sort();
  writeFileSync(options.out!, renderExtraRevsFile({ gameId: options.gameId!, stateDb: resolve(options.stateDb!), revs, sources: Object.fromEntries(final) }));
  return revs;
}

if (import.meta.main) {
  try {
    const revs = runExtraBakedRevs(parseArgs(process.argv.slice(2)));
    console.error(`wrote ${revs.length} revision(s)`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
