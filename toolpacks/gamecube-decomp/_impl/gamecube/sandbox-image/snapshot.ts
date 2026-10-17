/**
 * Rebake Daytona sandbox snapshots for a game: bundle -> extract -> pin the
 * Dockerfile ARG defaults -> `daytona snapshot create` per profile -> record
 * the snapshot in games/<id>/config/sandbox.json -> refresh the game's stale
 * build context at games/<id>/runtime/images/context/daytona-<id>-image/.
 *
 * The image bakes games/<id>/config/ into /opt/build-orchestrator, whose
 * .qa-ready stamp provisioning compares with the host tree. The script bakes the
 * sandbox.json it is about to write and restamps, so a fully successful run
 * leaves host and image stamps equal (a partial run only costs a QA resync).
 *
 * Dry run by default: prints the exact commands and the sandbox.json diff and
 * runs only read-only commands (`git rev-parse`). `--apply` executes.
 *
 *   bun snapshot.ts --game sms [--profile 1-core,4-core] [--checkout PATH]
 *     [--traced-compilers DIR] [--allow-disabled-traced] [--extra-revs-file FILE]
 *     [--work-dir DIR] [--date YYYYMMDD] [--harness-root PATH] [--apply]
 *
 * --traced-compilers and --allow-disabled-traced pass through to
 * build_image_bundle.sh (prebuilt traced MWCC plus validation evidence; default
 * games/<id>/runtime/tool-data/mwcc_native). --extra-revs-file passes through
 * too: commits baked depth-1 beside HEAD (extra-baked-revs.ts writes the list).
 *
 * Every external command goes through a CommandRunner so tests never run
 * bash, tar, git or daytona.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { bundlePlan } from "./bundle-plan";

export interface CommandResult { exitCode: number; stdout: string; stderr: string }
/** `stream` hands the terminal to long commands (bundle, daytona); their output is not captured. */
export type CommandRunner = (argv: string[], options?: { cwd?: string; stream?: boolean }) => Promise<CommandResult>;

export interface SnapshotOptions {
  harnessRoot: string;
  games: string[];
  /** Profiles to bake; default every profile in the game's sandbox.json. */
  profiles?: string[];
  checkout?: string;
  /** Prebuilt traced MWCC with its evidence; default the game's tool-data mwcc_native. */
  tracedCompilers?: string;
  /** Warn instead of failing when the evidence gate disables a version the game requires. */
  allowDisabledTraced?: boolean;
  /** Revisions to bake beside HEAD (build_image_bundle.sh --extra-revs-file). */
  extraRevsFile?: string;
  apply: boolean;
  workDir: string;
  /** YYYYMMDD stamped into snapshot names; default today (local time). */
  date?: string;
  runner: CommandRunner;
  log?: (line: string) => void;
}

export interface SnapshotUpdate { profile: string; snapshotName: string; bakedRev: string }

/** Dockerfile build arguments the snapshot pins as defaults (Daytona builds take no --build-arg). */
const PINNED_ARGS = ["GAME_ID", "WORKSPACE_ROOT", "REPORT_PATH", "SNAPSHOT_BAKED_REV"] as const;

/** Set `ARG NAME=value` defaults; every named ARG must appear exactly once. */
export function pinDockerfileArgs(text: string, values: Record<string, string>): string {
  let out = text;
  for (const [name, value] of Object.entries(values)) {
    if (!/^[A-Za-z0-9_./:+~-]+$/.test(value)) throw new Error(`Refusing to pin ARG ${name} to ${JSON.stringify(value)}`);
    const pattern = new RegExp(`^ARG ${name}(=.*)?$`, "gm");
    const matches = out.match(pattern) ?? [];
    if (matches.length !== 1) throw new Error(`Dockerfile must declare ARG ${name} exactly once (found ${matches.length})`);
    out = out.replace(pattern, `ARG ${name}=${value}`);
  }
  return out;
}

/** Insert or replace `key`, keeping key order (a new key goes right after `after`). */
function withKey(object: Record<string, unknown>, key: string, value: unknown, after: string): Record<string, unknown> {
  if (key in object || !(after in object)) return { ...object, [key]: value };
  return Object.fromEntries(Object.entries(object).flatMap(([k, v]) => (k === after ? [[k, v], [key, value]] : [[k, v]])));
}

/**
 * Record new snapshots in sandbox.json text (2-space JSON, key order kept).
 * A profile that inherits a top-level snapshot_baked_rev keeps inheriting when
 * every inheriting profile is rebaked in this run; otherwise it gets its own.
 */
export function updateSandboxConfig(text: string, updates: SnapshotUpdate[]): string {
  const config = JSON.parse(text) as Record<string, unknown>;
  const profiles = { ...(config.profiles as Record<string, Record<string, unknown>> | undefined) };
  const revs = new Set(updates.map((u) => u.bakedRev));
  const inheriting = Object.keys(profiles).filter((name) => !("snapshot_baked_rev" in profiles[name]!));
  const rebaked = new Set(updates.map((u) => u.profile));
  const shareTopLevel = "snapshot_baked_rev" in config && revs.size === 1 && inheriting.every((name) => rebaked.has(name));
  let next: Record<string, unknown> = config;
  for (const update of updates) {
    const current = profiles[update.profile];
    if (!current) throw new Error(`sandbox.json has no profile ${update.profile}`);
    let profile = withKey(current, "snapshot_name", update.snapshotName, "");
    if ("snapshot_baked_rev" in current || !shareTopLevel) {
      profile = withKey(profile, "snapshot_baked_rev", update.bakedRev, "snapshot_name");
    }
    profiles[update.profile] = profile;
  }
  if (shareTopLevel && inheriting.length > 0) next = { ...next, snapshot_baked_rev: [...revs][0] };
  return `${JSON.stringify({ ...next, profiles }, null, 2)}\n`;
}

/** Minimal line diff (LCS) for the dry-run sandbox.json preview. */
export function lineDiff(before: string, after: string): string[] {
  const a = before.split("\n"), b = after.split("\n");
  const lcs = a.map(() => new Array<number>(b.length + 1).fill(0));
  lcs.push(new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
  }
  const out: string[] = [];
  let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { i++; j++; }
    else if (j < b.length && (i === a.length || lcs[i]![j + 1]! >= lcs[i + 1]![j]!)) out.push(`+${b[j++]}`);
    else out.push(`-${a[i++]}`);
  }
  return out;
}

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
}

function shellQuote(argv: string[]): string {
  return argv.map((arg) => (/^[A-Za-z0-9_./:=@%+,-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", "'\\''")}'`)).join(" ");
}

/** The game's sandbox config file, as referenced by game.json `config.sandbox`. */
function sandboxConfigPath(harnessRoot: string, gameId: string): string {
  const gameDir = join(harnessRoot, "games", gameId);
  const descriptor = JSON.parse(readFileSync(join(gameDir, "game.json"), "utf8")) as { config?: { sandbox?: unknown } };
  const ref = descriptor.config?.sandbox;
  const path = resolve(gameDir, typeof ref === "string" ? ref : "config/sandbox.json");
  if (!existsSync(path)) throw new Error(`${gameId}: sandbox config file not found: ${path}`);
  return path;
}

export async function runSnapshots(options: SnapshotOptions): Promise<{ updates: Record<string, SnapshotUpdate[]> }> {
  const log = options.log ?? ((line: string) => console.log(line));
  const harnessRoot = resolve(options.harnessRoot);
  const date = options.date ?? today();
  if (!/^\d{8}$/.test(date)) throw new Error(`--date must be YYYYMMDD, got ${date}`);
  if (options.checkout && options.games.length !== 1) throw new Error("--checkout applies to exactly one --game");
  const bundleScript = join(import.meta.dir, "build_image_bundle.sh");
  const stampScript = join(import.meta.dir, "content_stamp.sh");
  const mode = options.apply ? "APPLY" : "DRY RUN";
  const exec = async (argv: string[], stream = false): Promise<string> => {
    log(`${options.apply ? "$" : "would run:"} ${shellQuote(argv)}`);
    if (!options.apply) return "";
    const result = await options.runner(argv, { stream });
    if (result.exitCode !== 0) throw new Error(`command failed (${result.exitCode}): ${shellQuote(argv)}\n${result.stderr.trim()}`);
    return result.stdout;
  };
  const allUpdates: Record<string, SnapshotUpdate[]> = {};

  for (const gameId of options.games) {
    const sandboxPath = sandboxConfigPath(harnessRoot, gameId);
    const original = readFileSync(sandboxPath, "utf8");
    const declared = Object.keys((JSON.parse(original) as { profiles?: Record<string, unknown> }).profiles ?? {});
    const profiles = options.profiles?.length ? options.profiles : declared;
    if (profiles.length === 0) throw new Error(`${gameId}: ${sandboxPath} declares no profiles`);
    for (const profile of profiles) if (!declared.includes(profile)) throw new Error(`${gameId}: unknown profile ${profile}`);

    // Profiles that share Dockerfile arguments share one bundle and context.
    const groups = new Map<string, { plan: ReturnType<typeof bundlePlan>; profiles: string[]; bakedRev: string }>();
    for (const profile of profiles) {
      const plan = bundlePlan({ harnessRoot, gameId, profile, checkout: options.checkout });
      const key = `${plan.workspaceRoot}\0${plan.reportPath}`;
      const group = groups.get(key) ?? { plan, profiles: [], bakedRev: "" };
      group.profiles.push(profile);
      groups.set(key, group);
    }
    // Names are known before anything is built, so every bundle can bake the final sandbox.json.
    const planned: SnapshotUpdate[] = [];
    for (const group of groups.values()) {
      const head = await options.runner(["git", "-C", group.plan.checkout, "rev-parse", "--verify", "HEAD^{commit}"]);
      if (head.exitCode !== 0) throw new Error(`${gameId}: cannot read checkout HEAD at ${group.plan.checkout}: ${head.stderr.trim()}`);
      group.bakedRev = head.stdout.trim();
      for (const profile of group.profiles) {
        planned.push({ profile, snapshotName: `${gameId}-sandbox-${date}-${group.bakedRev.slice(0, 7)}-${profile}`, bakedRev: group.bakedRev });
      }
    }
    const finalConfig = updateSandboxConfig(original, planned);
    const bakedConfigPath = relative(join(harnessRoot, "games", gameId), sandboxPath);

    log(`== ${gameId} (${mode}): profiles ${profiles.join(", ")}`);
    const updates: SnapshotUpdate[] = [];
    let current = original;
    let contextSource: string | undefined;
    let groupIndex = 0;
    for (const { plan, profiles: groupProfiles, bakedRev } of groups.values()) {
      const suffix = groups.size > 1 ? `-${++groupIndex}` : "";
      const bundle = join(options.workDir, `${plan.payloadDirectory}-${bakedRev.slice(0, 7)}${suffix}.tar.zst`);
      const extractDir = join(options.workDir, `${plan.payloadDirectory}-${bakedRev.slice(0, 7)}${suffix}`);
      const payload = join(extractDir, plan.payloadDirectory);
      const dockerfile = join(payload, "Dockerfile");

      if (options.apply) mkdirSync(options.workDir, { recursive: true });
      await exec(["bash", bundleScript, "--harness-root", harnessRoot, "--game", gameId, "--profile", groupProfiles[0]!,
        ...(options.checkout ? ["--checkout", options.checkout] : []),
        ...(options.tracedCompilers ? ["--traced-compilers", options.tracedCompilers] : []),
        ...(options.allowDisabledTraced ? ["--allow-disabled-traced"] : []),
        ...(options.extraRevsFile ? ["--extra-revs-file", options.extraRevsFile] : []), "--out", bundle], true);
      if (options.apply) { rmSync(extractDir, { recursive: true, force: true }); mkdirSync(extractDir, { recursive: true }); }
      await exec(["tar", "--use-compress-program=unzstd", "-xf", bundle, "-C", extractDir]);
      if (options.apply) {
        const packaged = readFileSync(join(payload, "provenance", "baked-head.txt"), "utf8").trim();
        if (packaged !== bakedRev) throw new Error(`${gameId}: checkout moved during bundling (${bakedRev} -> ${packaged}); re-run`);
      }
      const args = { GAME_ID: gameId, WORKSPACE_ROOT: plan.workspaceRoot, REPORT_PATH: plan.reportPath, SNAPSHOT_BAKED_REV: bakedRev };
      log(`${options.apply ? "pin" : "would pin"} ${dockerfile}: ${PINNED_ARGS.map((name) => `${name}=${args[name]}`).join(" ")}`);
      if (options.apply) writeFileSync(dockerfile, pinDockerfileArgs(readFileSync(dockerfile, "utf8"), args));
      const qaRoot = join(payload, "build-orchestrator");
      const bakedConfig = join(qaRoot, "games", gameId, bakedConfigPath);
      log(`${options.apply ? "bake" : "would bake"} the updated ${bakedConfigPath} into ${bakedConfig} and restamp ${qaRoot}/.qa-ready`);
      if (options.apply) {
        if (!existsSync(bakedConfig)) throw new Error(`${gameId}: bundle has no QA copy of ${bakedConfigPath} at ${bakedConfig}`);
        writeFileSync(bakedConfig, finalConfig);
      }
      const stamp = (await exec(["bash", stampScript, qaRoot, ".qa-ready"])).trim();
      if (options.apply) {
        if (!/^[0-9a-f]{64}$/.test(stamp)) throw new Error(`${gameId}: content_stamp.sh returned ${JSON.stringify(stamp)}`);
        writeFileSync(join(qaRoot, ".qa-ready"), `${stamp}\n`);
        writeFileSync(join(payload, "provenance", "qa-stamp.txt"), `${stamp}\n`);
      }

      for (const profile of groupProfiles) {
        const resources = bundlePlan({ harnessRoot, gameId, profile, checkout: options.checkout }).resourceClass;
        const snapshotName = planned.find((update) => update.profile === profile)!.snapshotName;
        await exec(["daytona", "snapshot", "create", snapshotName, "--dockerfile", dockerfile, "--context", payload,
          ...(resources.cpu ? ["--cpu", String(resources.cpu)] : []),
          ...(resources.memory_gib ? ["--memory", String(resources.memory_gib)] : []),
          ...(resources.disk_gib ? ["--disk", String(resources.disk_gib)] : [])], true);
        // Record each snapshot as soon as it exists, so a later failure leaves sandbox.json truthful.
        updates.push({ profile, snapshotName, bakedRev });
        current = updateSandboxConfig(original, updates);
        if (options.apply) writeFileSync(sandboxPath, current);
      }
      contextSource ??= payload;
    }

    const diff = lineDiff(original, current).filter((line) => line.startsWith("+") || line.startsWith("-"));
    log(`${options.apply ? "updated" : "would update"} ${sandboxPath}:`);
    for (const line of diff) log(`  ${line}`);
    const context = join(harnessRoot, "games", gameId, "runtime", "images", "context", `daytona-${gameId}-image`);
    log(`${options.apply ? "refresh" : "would refresh"} ${context} from ${contextSource}`);
    if (options.apply && contextSource) {
      rmSync(context, { recursive: true, force: true });
      mkdirSync(dirname(context), { recursive: true });
      cpSync(contextSource, context, { recursive: true, verbatimSymlinks: true });
    }
    allUpdates[gameId] = updates;
  }
  if (!options.apply) log("Dry run: nothing executed. Re-run with --apply to bake.");
  return { updates: allUpdates };
}

/** Real runner: piped output by default, the terminal for streamed commands. */
export const spawnRunner: CommandRunner = async (argv, options = {}) => {
  const child = Bun.spawn(argv, {
    cwd: options.cwd,
    stdout: options.stream ? "inherit" : "pipe",
    stderr: options.stream ? "inherit" : "pipe",
  });
  const [stdout, stderr] = options.stream
    ? ["", ""]
    : await Promise.all([new Response(child.stdout as ReadableStream).text(), new Response(child.stderr as ReadableStream).text()]);
  return { exitCode: await child.exited, stdout, stderr };
};

function parseArgs(argv: string[]): SnapshotOptions {
  const list = (value: string) => value.split(",").map((s) => s.trim()).filter(Boolean);
  const options: SnapshotOptions = {
    harnessRoot: resolve(import.meta.dir, "../../../../.."),
    games: [],
    apply: false,
    workDir: join(tmpdir(), "decomp-snapshots"),
    runner: spawnRunner,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]!;
    const value = () => { const v = argv[++i]; if (v === undefined) throw new Error(`${flag} needs a value`); return v; };
    switch (flag) {
      case "--game": options.games.push(...list(value())); break;
      case "--profile": options.profiles = [...(options.profiles ?? []), ...list(value())]; break;
      case "--checkout": options.checkout = resolve(value()); break;
      case "--traced-compilers": options.tracedCompilers = resolve(value()); break;
      case "--allow-disabled-traced": options.allowDisabledTraced = true; break;
      case "--extra-revs-file": options.extraRevsFile = resolve(value()); break;
      case "--work-dir": options.workDir = resolve(value()); break;
      case "--date": options.date = value(); break;
      case "--harness-root": options.harnessRoot = resolve(value()); break;
      case "--apply": options.apply = true; break;
      case "-h": case "--help":
        console.log([
          "Usage: bun snapshot.ts --game ID[,ID] [--profile NAME[,NAME]] [--checkout PATH]",
          "  [--traced-compilers DIR] [--allow-disabled-traced] [--extra-revs-file FILE] [--work-dir DIR] [--date YYYYMMDD] [--harness-root PATH] [--apply]",
          "Dry run unless --apply. --traced-compilers (default games/<id>/runtime/tool-data/mwcc_native) holds",
          "<ver>/{mwcceppc.exe,lmgr326b.dll}, CAPABILITIES.json and validation/*.json; the bundle fails when the",
          "evidence gate disables a version worker-image.json requires, unless --allow-disabled-traced.",
        ].join("\n"));
        process.exit(0);
      default: throw new Error(`unknown argument: ${flag}`);
    }
  }
  if (options.games.length === 0) throw new Error("--game is required");
  return options;
}

if (import.meta.main) {
  try {
    await runSnapshots(parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
