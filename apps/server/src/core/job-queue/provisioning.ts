import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, posix, relative, resolve, sep } from "node:path";
import { defaultToolpackId, packageRoot, toolpackRoot } from "@server/core/knowledge/paths.js";
import type { StateStore } from "@server/core/orchestrator-state";
import { runCommand } from "@server/infrastructure/shell";
import {
  emitSandboxCreatedEvent,
  emitSandboxDeletedEvent,
  type SandboxCreatedEventInput,
} from "./sandbox-events.js";
import type { SandboxHandle, SandboxProvider, SandboxResourceClass } from "./sandbox.js";

export interface WorkerReportArtifactSource { relativePath: string; sourcePath: string }
export interface ProvisionCommandResult { exitCode: number; stdout: string; stderr: string }
export type ProvisionCommandRunner = (cwd: string, command: string[], options?: { timeoutMs?: number }) => Promise<ProvisionCommandResult>;

const SETUP_TIMEOUT_MS = 20 * 60 * 1000;
const TOOLPACK_SETUP_TIMEOUT_MS = 180_000;
const SANDBOX_BUNDLE_PATH = "/tmp/melee-claim-seed.bundle";

const defaultRunner: ProvisionCommandRunner = async (cwd, command, options) => runCommand(cwd, command, options);
const outputTail = (text: string, maxChars = 2000) => text.length <= maxChars ? text : text.slice(-maxChars);

function excludedToolpackPath(path: string): boolean {
  const normalized = path.split(posix.sep).join("/");
  const segments = normalized.split("/");
  return normalized === "_impl/gamecube/mwcc_debug"
    || normalized.startsWith("_impl/gamecube/mwcc_debug/")
    || normalized === "_impl/gamecube/sandbox-image"
    || normalized.startsWith("_impl/gamecube/sandbox-image/")
    || segments.includes("tests")
    || segments.includes("__pycache__")
    || normalized.endsWith(".pyc");
}

async function payloadFiles(root: string, directory = root): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await payloadFiles(root, path));
    else if (entry.isFile()) files.push(`./${relative(root, path).split(posix.sep).join("/")}`);
  }
  return files;
}

async function toolpackContentStamp(payloadRoot: string): Promise<string> {
  const files = (await payloadFiles(payloadRoot)).filter((file) => file !== "./.ready");
  files.sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
  let listing = "";
  for (const file of files) {
    const digest = createHash("sha256").update(await readFile(resolve(payloadRoot, file.slice(2)))).digest("hex");
    listing += `${digest}  ${file}\n`;
  }
  return createHash("sha256").update(listing).digest("hex");
}

/** One stamped payload file: its payload-relative path and the host file holding its bytes. */
interface StampedFile {
  relativePath: string;
  sourcePath: string;
  size: number;
  mtimeMs: number;
  /** Changes on every content write, even one that restores the mtime. */
  ctimeMs: number;
  ino: number;
  dev: number;
}

function stampedFile(relativePath: string, sourcePath: string, info: { size: number; mtimeMs: number; ctimeMs: number; ino: number; dev: number }): StampedFile {
  return { relativePath, sourcePath, size: info.size, mtimeMs: info.mtimeMs, ctimeMs: info.ctimeMs, ino: info.ino, dev: info.dev };
}

/**
 * The `.ready` stamp over host files, byte-identical to `toolpackContentStamp`
 * (and `sandbox-image/build_image_bundle.sh`): sha256 of the sorted
 * `<sha256>  ./<path>` listing.
 */
async function stampedFilesContentStamp(files: StampedFile[]): Promise<string> {
  const sorted = files
    .map((file) => ({ name: `./${file.relativePath}`, sourcePath: file.sourcePath }))
    .sort((left, right) => Buffer.compare(Buffer.from(left.name), Buffer.from(right.name)));
  let listing = "";
  for (const file of sorted) {
    const digest = createHash("sha256").update(await readFile(file.sourcePath)).digest("hex");
    listing += `${digest}  ${file.name}\n`;
  }
  return createHash("sha256").update(listing).digest("hex");
}

/**
 * Cheap change detector for a stamped tree, no file contents: per file its
 * path, size, mtime, ctime and identity (inode, device). A write that keeps
 * the size and restores the mtime still moves the ctime; a replaced file has
 * a new inode.
 */
function stampedFilesFingerprint(files: StampedFile[]): string {
  const rows = files
    .map((file) => [file.relativePath, file.size, file.mtimeMs, file.ctimeMs, file.ino, file.dev, file.sourcePath].join("\0"))
    .sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
  return createHash("sha256").update(rows.join("\n")).digest("hex");
}

/** In-process stamp memo: a tree whose listing fingerprint is unchanged is not hashed again. */
const stampMemo = new Map<string, { fingerprint: string; stamp: string }>();

async function memoizedContentStamp(key: string, files: StampedFile[]): Promise<string> {
  const fingerprint = stampedFilesFingerprint(files);
  const cached = stampMemo.get(key);
  if (cached?.fingerprint === fingerprint) return cached.stamp;
  const stamp = await stampedFilesContentStamp(files);
  stampMemo.set(key, { fingerprint, stamp });
  return stamp;
}

/** The toolpack's payload files as `ensureSandboxToolpack` copies them (same exclusions, regular files only). */
async function hostToolpackFiles(root: string, directory = root): Promise<StampedFile[]> {
  const files: StampedFile[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    const relativePath = relative(root, path).split(sep).join("/");
    if (excludedToolpackPath(relativePath)) continue;
    if (entry.isDirectory()) files.push(...await hostToolpackFiles(root, path));
    else if (entry.isFile() && relativePath !== ".ready") {
      const info = await stat(path);
      files.push(stampedFile(relativePath, path, info));
    }
  }
  return files;
}

async function checkedToolpackExec(sandbox: SandboxHandle, command: string[], label: string): Promise<void> {
  const result = await sandbox.exec(command, { timeoutMs: TOOLPACK_SETUP_TIMEOUT_MS });
  if (result.exitCode !== 0) {
    throw new Error(`${label} failed (${result.exitCode}): ${outputTail(result.stderr || result.stdout)}`);
  }
}

async function remoteStampMatches(sandbox: SandboxHandle, path: string, stamp: string): Promise<boolean> {
  try {
    return (await sandbox.readFile(path)).trim() === stamp;
  } catch {
    return false;
  }
}

async function packToolpackTar(hostToolpackRoot: string, toolpackId: string): Promise<PackedTar> {
  const tempRoot = await mkdtemp(resolve(tmpdir(), "sandbox-toolpack-"));
  try {
    const payloadRoot = resolve(tempRoot, "payload");
    const payloadToolpackRoot = resolve(payloadRoot, "toolpacks", toolpackId);
    await cp(hostToolpackRoot, payloadToolpackRoot, {
      recursive: true,
      filter: (source) => {
        const path = relative(hostToolpackRoot, source).split(posix.sep).join("/");
        return path === "" || !excludedToolpackPath(path);
      },
    });
    // The stamp written is the uploaded copy's own, so a tree edited mid-sync never claims the newer content.
    const stamp = await toolpackContentStamp(payloadToolpackRoot);

    const tarPath = resolve(tempRoot, `toolpack-${toolpackId}.tar`);
    const tarResult = await runCommand(payloadRoot, [
      "tar",
      "-cf",
      tarPath,
      `--exclude=toolpacks/${toolpackId}/_impl/gamecube/mwcc_debug`,
      `--exclude=toolpacks/${toolpackId}/_impl/gamecube/sandbox-image`,
      "--exclude=*/tests",
      "--exclude=*/tests/*",
      "--exclude=*/__pycache__",
      "--exclude=*/__pycache__/*",
      "--exclude=*.pyc",
      "toolpacks",
    ], {
      timeoutMs: TOOLPACK_SETUP_TIMEOUT_MS,
    });
    if (tarResult.exitCode !== 0) {
      throw new Error(`sandbox toolpack archive creation failed (${tarResult.exitCode}): ${outputTail(tarResult.stderr || tarResult.stdout)}`);
    }
    // Only the tar is kept for reuse; the copied tree goes now.
    await rm(payloadRoot, { recursive: true, force: true });
    return { dir: tempRoot, tarPath, stamp };
  } catch (error) {
    await rm(tempRoot, { recursive: true, force: true });
    throw error;
  }
}

/** Env override for how long an unused packed toolpack or QA asset tar is kept for reuse (default 10 min). */
export const SANDBOX_TOOLPACK_TAR_TTL_ENV = "ORCH_SANDBOX_TOOLPACK_TAR_TTL_MS";
const DEFAULT_TOOLPACK_TAR_TTL_MS = 10 * 60_000;
/** Packed tars kept at once per kind (one per content stamp); the least recently used idle one goes first. */
const MAX_SHARED_TARS_PER_KIND = 2;

/** What a shared tar holds; each kind has its own bound. */
type SharedTarKind = "toolpack" | "qa" | "tool-data";

/** A packed tar and the stamp of exactly the tree it holds. */
interface PackedTar {
  dir: string;
  tarPath: string;
  stamp: string;
}

interface SharedTar {
  kind: SharedTarKind;
  ready: Promise<PackedTar>;
  users: number;
  lastUsed: number;
  expiry?: ReturnType<typeof setTimeout>;
}

/**
 * Sync tars shared by every provision of a drifted sandbox: one pack per
 * (kind, host root, content stamp), so 200 sandboxes on a stale image upload
 * one tar instead of copying and packing the tree 200 times. Concurrent
 * provisions await the same in-flight pack; an idle tar is kept for a TTL and
 * each kind holds at most `MAX_SHARED_TARS_PER_KIND` idle ones. A failed pack
 * is never reused, and neither is a pack whose own stamp differs from the
 * stamp it is keyed by (the tree changed between the probe and the copy): its
 * users upload it with its own stamp, and it is deleted after them.
 */
const sharedTars = new Map<string, SharedTar>();

async function deleteSharedTar(key: string, entry: SharedTar): Promise<void> {
  if (sharedTars.get(key) === entry) sharedTars.delete(key);
  if (entry.expiry) clearTimeout(entry.expiry);
  const packed = await entry.ready.catch(() => null);
  if (packed) await rm(packed.dir, { recursive: true, force: true });
}

function evictIdleSharedTars(kind: SharedTarKind): void {
  const ofKind = [...sharedTars.entries()].filter(([, entry]) => entry.kind === kind);
  const idle = ofKind.filter(([, entry]) => entry.users === 0).sort((a, b) => a[1].lastUsed - b[1].lastUsed);
  let excess = ofKind.length - MAX_SHARED_TARS_PER_KIND;
  for (const [key, entry] of idle) {
    if (excess <= 0) break;
    void deleteSharedTar(key, entry);
    excess -= 1;
  }
}

/** `expectedStamp` is the host stamp the key was computed from; only a pack holding exactly it is kept for reuse. */
async function withSharedTar<T>(
  kind: SharedTarKind,
  identity: string[],
  expectedStamp: string,
  pack: () => Promise<PackedTar>,
  use: (packed: PackedTar) => Promise<T>,
): Promise<T> {
  const key = JSON.stringify([kind, ...identity, expectedStamp]);
  let entry = sharedTars.get(key);
  if (entry) {
    entry.users += 1;
    if (entry.expiry) clearTimeout(entry.expiry);
    entry.expiry = undefined;
  } else {
    const created: SharedTar = { kind, ready: pack(), users: 1, lastUsed: Date.now() };
    sharedTars.set(key, created);
    const forget = () => {
      if (sharedTars.get(key) === created) sharedTars.delete(key);
    };
    created.ready.then((packed) => {
      if (packed.stamp !== expectedStamp) forget();
    }, forget);
    entry = created;
    evictIdleSharedTars(kind);
  }
  const active = entry;
  try {
    return await use(await active.ready);
  } finally {
    active.users -= 1;
    active.lastUsed = Date.now();
    if (active.users === 0) {
      const ttlMs = envCount(SANDBOX_TOOLPACK_TAR_TTL_ENV, DEFAULT_TOOLPACK_TAR_TTL_MS, 0);
      if (ttlMs === 0 || sharedTars.get(key) !== active) await deleteSharedTar(key, active);
      else {
        active.expiry = setTimeout(() => {
          if (active.users === 0) void deleteSharedTar(key, active);
        }, ttlMs);
        active.expiry.unref?.();
        // Concurrent packs of distinct stamps all join while busy; the bound holds once they go idle.
        evictIdleSharedTars(kind);
      }
    }
  }
}

function sharedTarCount(kind: SharedTarKind): number {
  return [...sharedTars.values()].filter((entry) => entry.kind === kind).length;
}

/** Packed toolpack tars currently cached (tests and the load-test report). */
export function sharedToolpackTarCount(): number {
  return sharedTarCount("toolpack");
}

/** Packed QA asset tars currently cached (tests and the load-test report). */
export function sharedQaAssetTarCount(): number {
  return sharedTarCount("qa");
}

export async function ensureSandboxToolpack(
  sandbox: SandboxHandle,
  params: { hostToolpackRoot: string; toolpackId: string },
): Promise<void> {
  const remoteToolpackRoot = `/opt/toolpacks/${params.toolpackId}`;
  const readyPath = `${remoteToolpackRoot}/.ready`;
  // A baked or already-synced toolpack costs one listing and one readFile.
  const hostStamp = await memoizedContentStamp(
    `toolpack:${resolve(params.hostToolpackRoot)}`,
    await hostToolpackFiles(resolve(params.hostToolpackRoot)),
  );
  if (await remoteStampMatches(sandbox, readyPath, hostStamp)) return;
  const hostRoot = resolve(params.hostToolpackRoot);
  const pack = () => packToolpackTar(params.hostToolpackRoot, params.toolpackId);
  await withSharedTar("toolpack", [hostRoot, params.toolpackId], hostStamp, pack, async ({ tarPath, stamp }) => {
    const remoteTarPath = `/tmp/toolpack-${params.toolpackId}.tar`;
    await sandbox.uploadFile(tarPath, remoteTarPath);
    await checkedToolpackExec(
      sandbox,
      [
        "bash",
        "-lc",
        // The archive goes with the extraction (one command, not two).
        'rm -rf "$1" && mkdir -p /opt/toolpacks && tar -xf "$2" -C /opt && rm -f "$2"',
        "--",
        remoteToolpackRoot,
        remoteTarPath,
      ],
      "sandbox toolpack extraction",
    );
    await sandbox.writeFile(readyPath, `${stamp}\n`);
  });
}

/** Orchestrator-relative root the QA lint (`scan_diff.py`) reads its policy assets from in a worker sandbox. */
export const SANDBOX_QA_ROOT = "/opt/build-orchestrator";
/** Written last by `ensureSandboxQaAssets`: the content stamp of the synced QA assets. */
export const SANDBOX_QA_STAMP_PATH = "/opt/build-orchestrator/.qa-ready";

// validation/qa/scan-diff.ts GLOBAL_STANDARDS_SLICES_RELATIVE_PATH (not imported: scan-diff imports this module).
const QA_GLOBAL_STANDARDS_PATH = "knowledge/global/sources/injectable/decomp_standards/standards";
const QA_GAME_STANDARDS_PATH = "knowledge/sources/injectable/decomp_standards/standards";
const QA_BANNED_PATTERNS_PATH = "knowledge/sources/injectable/banned_patterns/data";

/**
 * Orchestrator-relative QA asset paths, the layout `validation/build/daytona.ts`
 * uploads for a `qa` build task. Banned-pattern data is Melee review-corpus
 * data, so Melee's game.json and banned patterns always travel too.
 */
export function sandboxQaAssetPaths(gameId: string): string[] {
  const paths = [
    QA_GLOBAL_STANDARDS_PATH,
    `games/${gameId}/game.json`,
    `games/${gameId}/config`,
    `games/${gameId}/${QA_GAME_STANDARDS_PATH}`,
    `games/${gameId}/${QA_BANNED_PATTERNS_PATH}`,
    "games/melee/game.json",
    `games/melee/${QA_BANNED_PATTERNS_PATH}`,
  ];
  return [...new Set(paths)];
}

function excludedQaAssetName(name: string): boolean {
  return name.endsWith(".env") || name === "local.env" || name === "__pycache__" || name.endsWith(".pyc");
}

function withinRoot(root: string, path: string): boolean {
  const value = relative(root, path);
  return value === "" || (!!value && !isAbsolute(value) && value !== ".." && !value.startsWith(`..${sep}`));
}

/** QA asset files under `localPath`, symlinks inside the orchestrator root dereferenced. */
async function collectQaAssetFiles(realRoot: string, localPath: string, relativePath: string, out: StampedFile[]): Promise<void> {
  let sourcePath = localPath;
  if ((await lstat(localPath)).isSymbolicLink()) {
    sourcePath = await realpath(localPath);
    if (!withinRoot(realRoot, sourcePath)) throw new Error(`Unsupported QA asset symlink: ${relativePath}`);
  }
  const info = await stat(sourcePath);
  if (info.isDirectory()) {
    for (const entry of await readdir(sourcePath, { withFileTypes: true })) {
      if (excludedQaAssetName(entry.name)) continue;
      await collectQaAssetFiles(realRoot, resolve(sourcePath, entry.name), `${relativePath}/${entry.name}`, out);
    }
  } else if (info.isFile()) {
    out.push(stampedFile(relativePath, sourcePath, info));
  }
}

/**
 * Sync the QA lint's policy assets into the worker sandbox at `SANDBOX_QA_ROOT`
 * as one tar, skipped when the remote `.qa-ready` stamp already matches. A
 * missing optional directory is skipped.
 */
async function sandboxQaAssetFiles(params: { orchestratorRoot: string; gameId: string }): Promise<{ realRoot: string; files: StampedFile[] }> {
  const realRoot = await realpath(params.orchestratorRoot);
  const files: StampedFile[] = [];
  for (const assetPath of sandboxQaAssetPaths(params.gameId)) {
    const localPath = resolve(params.orchestratorRoot, assetPath);
    if (!existsSync(localPath)) continue;
    await collectQaAssetFiles(realRoot, localPath, assetPath, files);
  }
  return { realRoot, files };
}

/**
 * The `.qa-ready` stamp: the toolpack `.ready` scheme over exactly the synced
 * QA files, paths relative to `SANDBOX_QA_ROOT` (sha256 of the bytewise-sorted
 * `<sha256>  ./<path>` listing). An image that bakes the same tree writes the same stamp.
 */
export async function sandboxQaAssetsStamp(params: { orchestratorRoot: string; gameId: string }): Promise<string> {
  const { realRoot, files } = await sandboxQaAssetFiles(params);
  return memoizedContentStamp(`qa:${realRoot}:${params.gameId}`, files);
}

/**
 * Stage exactly `files` and pack them as one tar. The stamp is the staged
 * copy's own, so a tree edited mid-pack never claims the newer content.
 */
async function packQaAssetTar(files: StampedFile[]): Promise<PackedTar> {
  const tempRoot = await mkdtemp(resolve(tmpdir(), "sandbox-qa-assets-"));
  try {
    const stagingRoot = resolve(tempRoot, "payload");
    const staged: StampedFile[] = [];
    for (const file of files) {
      const target = resolve(stagingRoot, file.relativePath);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(file.sourcePath, target);
      staged.push({ ...file, sourcePath: target });
    }
    const stamp = await stampedFilesContentStamp(staged);
    const tarPath = resolve(tempRoot, "qa-assets.tar");
    const topLevel = [...new Set(files.map((file) => file.relativePath.split("/")[0]!))].sort();
    const tarResult = await runCommand(stagingRoot, ["tar", "-cf", tarPath, ...topLevel], { timeoutMs: TOOLPACK_SETUP_TIMEOUT_MS });
    if (tarResult.exitCode !== 0) {
      throw new Error(`sandbox QA asset archive creation failed (${tarResult.exitCode}): ${outputTail(tarResult.stderr || tarResult.stdout)}`);
    }
    // Only the tar is kept for reuse; the staged tree goes now.
    await rm(stagingRoot, { recursive: true, force: true });
    return { dir: tempRoot, tarPath, stamp };
  } catch (error) {
    await rm(tempRoot, { recursive: true, force: true });
    throw error;
  }
}

export async function ensureSandboxQaAssets(
  sandbox: SandboxHandle,
  params: { orchestratorRoot: string; gameId: string },
): Promise<void> {
  const assetPaths = sandboxQaAssetPaths(params.gameId);
  const { realRoot, files } = await sandboxQaAssetFiles(params);
  const hostStamp = await memoizedContentStamp(`qa:${realRoot}:${params.gameId}`, files);
  if (await remoteStampMatches(sandbox, SANDBOX_QA_STAMP_PATH, hostStamp)) return;

  const remoteTarPath = `/tmp/qa-assets-${params.gameId}.tar`;
  // Replace exactly the asset paths, so a deleted host file does not linger remotely.
  const extract = (tarPresent: boolean) => checkedToolpackExec(
    sandbox,
    [
      "bash",
      "-lc",
      'root="$1"; tar="$2"; shift 2; mkdir -p "$root" && cd "$root" && rm -rf -- "$@" && if [ -f "$tar" ]; then tar -xf "$tar" -C "$root" && rm -f "$tar"; fi',
      "--",
      SANDBOX_QA_ROOT,
      tarPresent ? remoteTarPath : "",
      ...assetPaths,
    ],
    "sandbox QA asset extraction",
  );
  if (files.length === 0) {
    await extract(false);
    await sandbox.writeFile(SANDBOX_QA_STAMP_PATH, `${hostStamp}\n`);
    return;
  }
  // One pack per (root, game, content stamp), shared by every drifted sandbox, like the toolpack tar.
  await withSharedTar("qa", [realRoot, params.gameId], hostStamp, () => packQaAssetTar(files), async ({ tarPath, stamp }) => {
    await sandbox.uploadFile(tarPath, remoteTarPath);
    await extract(true);
    await sandbox.writeFile(SANDBOX_QA_STAMP_PATH, `${stamp}\n`);
  });
}

/** Sandbox root of a tool's shared data (`runWorkspaceToolApi` exports it as ORCH_TOOL_SHARED_DATA_ROOT). */
export function sandboxToolDataRoot(toolId: string): string {
  return `/opt/tool-data/${toolId}`;
}

/** The stamp `ensureSandboxToolData` writes last, inside the tool's data root. */
export function sandboxToolDataStampPath(toolId: string): string {
  return `${sandboxToolDataRoot(toolId)}/.ready`;
}

/** A tool's prebuilt host data (e.g. a search index) the sandbox needs: `files` are relative to `hostRoot`. */
export interface SandboxToolDataTree {
  toolId: string;
  hostRoot: string;
  files: string[];
}

/**
 * Sync a tool's prebuilt data into `/opt/tool-data/<toolId>` as one gzipped
 * tar, skipped when the remote `.ready` stamp matches (the toolpack stamp
 * scheme over exactly `files`, paths relative to the data root, so an image
 * that bakes the same files skips it too). Returns false, uploading nothing,
 * when the host lacks any of the files; the tool then reports its
 * prerequisite missing in the sandbox.
 */
export async function ensureSandboxToolData(sandbox: SandboxHandle, tree: SandboxToolDataTree): Promise<boolean> {
  const files: StampedFile[] = [];
  for (const relativePath of tree.files) {
    const sourcePath = resolve(tree.hostRoot, relativePath);
    if (!existsSync(sourcePath)) return false;
    const info = await stat(sourcePath);
    if (!info.isFile()) return false;
    files.push(stampedFile(relativePath, sourcePath, info));
  }
  const remoteRoot = sandboxToolDataRoot(tree.toolId);
  const stampPath = sandboxToolDataStampPath(tree.toolId);
  const hostRoot = resolve(tree.hostRoot);
  const hostStamp = await memoizedContentStamp(`tool-data:${tree.toolId}:${hostRoot}`, files);
  if (await remoteStampMatches(sandbox, stampPath, hostStamp)) return true;
  const remoteTarPath = `/tmp/tool-data-${tree.toolId}.tar.gz`;
  // The tree may change after the probe: the tar and its stamp both come from one staged copy.
  await withSharedTar("tool-data", [hostRoot, tree.toolId], hostStamp, () => packToolDataTar(tree, files), async ({ tarPath, stamp }) => {
    await sandbox.uploadFile(tarPath, remoteTarPath);
    await checkedToolpackExec(
      sandbox,
      ["bash", "-lc", 'rm -rf "$1" && mkdir -p "$1" && tar -xzf "$2" -C "$1" && rm -f "$2"', "--", remoteRoot, remoteTarPath],
      `sandbox ${tree.toolId} data extraction`,
    );
    await sandbox.writeFile(stampPath, `${stamp}\n`);
  });
  return true;
}

/** Stage an immutable copy of the tool data, then stamp and archive that copy. */
async function packToolDataTar(tree: SandboxToolDataTree, files: StampedFile[]): Promise<PackedTar> {
  const tempRoot = await mkdtemp(resolve(tmpdir(), "sandbox-tool-data-"));
  try {
    const stagingRoot = resolve(tempRoot, "payload");
    const staged: StampedFile[] = [];
    for (const file of files) {
      const target = resolve(stagingRoot, file.relativePath);
      if (!withinRoot(stagingRoot, target)) throw new Error(`sandbox ${tree.toolId} data path leaves its root: ${file.relativePath}`);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(file.sourcePath, target);
      staged.push({ ...file, sourcePath: target });
    }
    const stamp = await stampedFilesContentStamp(staged);
    const tarPath = resolve(tempRoot, "tool-data.tar.gz");
    const tarResult = await runCommand(stagingRoot, ["tar", "-czf", tarPath, ...tree.files], { timeoutMs: TOOLPACK_SETUP_TIMEOUT_MS });
    if (tarResult.exitCode !== 0) {
      throw new Error(`sandbox ${tree.toolId} data archive creation failed (${tarResult.exitCode}): ${outputTail(tarResult.stderr || tarResult.stdout)}`);
    }
    await rm(stagingRoot, { recursive: true, force: true });
    return { dir: tempRoot, tarPath, stamp };
  } catch (error) {
    await rm(tempRoot, { recursive: true, force: true });
    throw error;
  }
}

/** Image path of the pinned MWCC compiler source; `<checkout>/../mwcc` links to it. */
export const SANDBOX_COMPILER_SOURCE_ROOT = "/opt/mwcc";

/**
 * Point `<dirname(workspaceRoot)>/mwcc` at `/opt/mwcc` when the image has it.
 * A no-op on images without `/opt/mwcc`, and it never replaces a real
 * directory. Safe to call again on a resumed sandbox.
 */
export async function ensureSandboxCompilerSourceLink(sandbox: SandboxHandle, workspaceRoot: string): Promise<void> {
  await checkedToolpackExec(
    sandbox,
    [
      "bash",
      "-lc",
      'if [ -d "$1" ] && { [ -L "$2" ] || [ ! -e "$2" ]; }; then ln -sfn "$1" "$2"; fi',
      "--",
      SANDBOX_COMPILER_SOURCE_ROOT,
      posix.join(posix.dirname(workspaceRoot), "mwcc"),
    ],
    "sandbox compiler source link",
  );
}

/** A file the server writes into the sandbox checkout after checkout (workspace-relative). */
export interface SandboxWorkspaceFile {
  relativePath: string;
  content: string;
}

function sandboxWorkspacePath(workspaceRoot: string, relativePath: string): string {
  const parts = relativePath.split("/");
  if (!relativePath || posix.isAbsolute(relativePath) || relativePath.includes("\\") || relativePath.includes("\0")
    || parts.some((part) => !part || part === "." || part === "..")) {
    throw new Error(`Sandbox file path must be a non-escaping workspace-relative path: ${relativePath}`);
  }
  return posix.join(workspaceRoot, relativePath);
}

/** How the claim's revisions reached the sandbox checkout. */
export type SandboxSeedKind = "baked" | "thin" | "full";

export interface SandboxSeedResult {
  kind: SandboxSeedKind;
  /** Set when a thin bundle failed `git bundle verify` in the sandbox and a full bundle replaced it. */
  thinFallback?: boolean;
  /** Required revisions verified in the sandbox (a host-missing one fails provisioning). */
  requiredRevs: string[];
  /** Wanted revisions besides the baked HEAD the image already held (baked extras); never bundled or fetched. */
  bakedExtra?: string[];
}

export interface SandboxProvisionLabels extends Record<string, string> {
  game_id: string;
  run_id: string;
  claim_id: string;
  job_id: string;
  job_lease_id: string;
  dispatch_lease_id: string;
  worker_state_id: string;
  trace_id: string;
}

export interface ProvisionSandboxWorkspaceResult {
  sandboxId: string;
  workspaceRoot: string;
  /** How the checkout was seeded (for the scale report); absent from test doubles. */
  seed?: SandboxSeedResult;
}

export type SandboxCreatedEventContext = Omit<
  SandboxCreatedEventInput,
  "sandboxId" | "snapshot" | "cpu" | "memoryGiB" | "diskGiB"
>;

async function checkedSandboxExec(
  sandbox: SandboxHandle,
  command: string[],
  workspaceRoot: string,
  label: string,
): Promise<void> {
  const result = await sandbox.exec(command, { cwd: workspaceRoot, timeoutMs: SETUP_TIMEOUT_MS });
  if (result.exitCode !== 0) {
    throw new Error(`${label} failed (${result.exitCode}): ${outputTail(result.stderr || result.stdout)}`);
  }
}

const SANDBOX_SEED_REF_PREFIX = "refs/decomp-orchestrator/sandbox-seeds";

const FULL_SHA = /^[0-9a-f]{40}$/;
const MAX_HOST_GIT_MEMO = 4_096;

/**
 * Host git answers about full commit ids that never change once definite:
 * whether a commit exists (only "yes" is kept: a later fetch can add it) and
 * whether one commit is an ancestor of another (both "yes" and "no" are kept;
 * the host checkouts are full clones, and on a shallow one a stale "no" only
 * costs a full bundle). Every provision of a ramp asks the same questions, so
 * concurrent provisions share one in-flight command per key and later ones
 * reuse its answer. An answer not kept (an error, a missing commit) is asked
 * again. Kept per runner, so a test double never sees another's answers, and
 * cleared when it reaches `MAX_HOST_GIT_MEMO` keys.
 */
const hostGitMemos = new WeakMap<ProvisionCommandRunner, Map<string, Promise<ProvisionCommandResult>>>();

function memoizedHostGit(
  runner: ProvisionCommandRunner,
  repoRoot: string,
  key: string[],
  command: string[],
  keep: (exitCode: number) => boolean,
): Promise<ProvisionCommandResult> {
  let memo = hostGitMemos.get(runner);
  if (!memo) {
    memo = new Map();
    hostGitMemos.set(runner, memo);
  }
  const memoKey = JSON.stringify([resolve(repoRoot), ...key]);
  const cached = memo.get(memoKey);
  if (cached) return cached;
  if (memo.size >= MAX_HOST_GIT_MEMO) memo.clear();
  const owner = memo;
  const forget = () => {
    if (owner.get(memoKey) === answer) owner.delete(memoKey);
  };
  const answer: Promise<ProvisionCommandResult> = runner(repoRoot, command, { timeoutMs: SETUP_TIMEOUT_MS }).then((result) => {
    if (!keep(result.exitCode)) forget();
    return result;
  }, (error: unknown) => {
    forget();
    throw error;
  });
  memo.set(memoKey, answer);
  return answer;
}

/** `git merge-base --is-ancestor`: false when not an ancestor and when either revision is missing on the host. */
async function hostIsAncestor(runner: ProvisionCommandRunner, repoRoot: string, ancestor: string, descendant: string): Promise<boolean> {
  const command = ["git", "merge-base", "--is-ancestor", ancestor, descendant];
  // Only a definite answer (0: ancestor, 1: not) is kept; an error (e.g. a revision not fetched yet) asks again.
  const result = FULL_SHA.test(ancestor) && FULL_SHA.test(descendant)
    ? await memoizedHostGit(runner, repoRoot, ["ancestor", ancestor, descendant], command, (code) => code === 0 || code === 1)
    : await runner(repoRoot, command, { timeoutMs: SETUP_TIMEOUT_MS });
  return result.exitCode === 0;
}

/** `git rev-parse --verify` of a commit on the host; a present full commit id is asked once per runner. */
function hostCommitPresent(runner: ProvisionCommandRunner, repoRoot: string, rev: string): Promise<ProvisionCommandResult> {
  const command = ["git", "rev-parse", "--verify", "--quiet", `${rev}^{commit}`];
  return FULL_SHA.test(rev)
    ? memoizedHostGit(runner, repoRoot, ["present", rev], command, (code) => code === 0)
    : runner(repoRoot, command, { timeoutMs: SETUP_TIMEOUT_MS });
}

/** Env override for how many seed bundles the host packs at once (default 4). */
export const SANDBOX_BUNDLE_CONCURRENCY_ENV = "ORCH_SANDBOX_BUNDLE_CONCURRENCY";
/** Env override for how long an unused packed seed bundle is kept for reuse (default 30 s). */
export const SANDBOX_BUNDLE_TTL_ENV = "ORCH_SANDBOX_BUNDLE_TTL_MS";
const DEFAULT_BUNDLE_CONCURRENCY = 4;
const DEFAULT_BUNDLE_TTL_MS = 30_000;

function envCount(name: string, fallback: number, min: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= min ? Math.floor(value) : fallback;
}

/** In-process bound on concurrent `git bundle create` packs (each one is a git pack of the repo). */
class PackSemaphore {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  async run<T>(work: () => Promise<T>): Promise<T> {
    while (this.active >= envCount(SANDBOX_BUNDLE_CONCURRENCY_ENV, DEFAULT_BUNDLE_CONCURRENCY, 1)) {
      await new Promise<void>((wake) => this.waiters.push(wake));
    }
    this.active += 1;
    try {
      return await work();
    } finally {
      this.active -= 1;
      this.waiters.shift()?.();
    }
  }
}

const packSemaphore = new PackSemaphore();

interface PackedBundle {
  dir: string;
  path: string;
}

interface SharedBundleEntry {
  ready: Promise<PackedBundle>;
  users: number;
  expiry?: ReturnType<typeof setTimeout>;
}

/**
 * Packed seed bundles shared by concurrent provisions: one pack per (source
 * repo, revisions, excluded baked rev). Waiters on the same key await the one
 * in-flight pack; a finished bundle stays for reuse while in use and for a
 * short TTL after its last user, then its temp dir is deleted. A failed pack
 * rejects every waiter and is not kept.
 */
const sharedBundles = new Map<string, SharedBundleEntry>();

async function deleteSharedBundle(key: string, entry: SharedBundleEntry): Promise<void> {
  if (sharedBundles.get(key) === entry) sharedBundles.delete(key);
  const bundle = await entry.ready.catch(() => null);
  if (bundle) await rm(bundle.dir, { recursive: true, force: true });
}

function releaseSharedBundle(key: string, entry: SharedBundleEntry): Promise<void> {
  entry.users -= 1;
  if (entry.users > 0) return Promise.resolve();
  const ttlMs = envCount(SANDBOX_BUNDLE_TTL_ENV, DEFAULT_BUNDLE_TTL_MS, 0);
  if (ttlMs === 0) return deleteSharedBundle(key, entry);
  entry.expiry = setTimeout(() => {
    if (entry.users === 0) void deleteSharedBundle(key, entry);
  }, ttlMs);
  entry.expiry.unref?.();
  return Promise.resolve();
}

/**
 * Pack `revs` (each advertised as its own temporary ref; git bundles record
 * refs, never raw ids), excluding `exclude`'s history when set. The refs live
 * exactly as long as the pack and are always removed. One pack thread
 * (`pack.threads=1`) and the host semaphore bound its CPU and memory.
 */
async function packSeedBundle(runner: ProvisionCommandRunner, sourceRepoRoot: string, revs: string[], exclude: string | null): Promise<PackedBundle> {
  return packSemaphore.run(async () => {
    const dir = await mkdtemp(resolve(tmpdir(), "melee-sandbox-bundle-"));
    const path = resolve(dir, "claim.bundle");
    const createdRefs: string[] = [];
    let seedError: unknown;
    try {
      for (const rev of revs) {
        const bundleRef = `${SANDBOX_SEED_REF_PREFIX}/${randomUUID()}`;
        const advertise = await runner(sourceRepoRoot, ["git", "update-ref", bundleRef, rev], { timeoutMs: SETUP_TIMEOUT_MS });
        if (advertise.exitCode !== 0) {
          throw new Error(`sandbox git bundle ref creation failed (${advertise.exitCode}): ${outputTail(advertise.stderr || advertise.stdout)}`);
        }
        createdRefs.push(bundleRef);
      }
      const bundle = await runner(
        sourceRepoRoot,
        ["git", "-c", "pack.threads=1", "bundle", "create", path, ...createdRefs, ...(exclude ? [`^${exclude}`] : [])],
        { timeoutMs: SETUP_TIMEOUT_MS },
      );
      if (bundle.exitCode !== 0) {
        throw new Error(`sandbox git bundle creation failed (${bundle.exitCode}): ${outputTail(bundle.stderr || bundle.stdout)}`);
      }
    } catch (error) {
      seedError = error;
    }
    let refCleanupError: Error | undefined;
    for (const bundleRef of createdRefs) {
      try {
        const cleanup = await runner(sourceRepoRoot, ["git", "update-ref", "-d", bundleRef], { timeoutMs: SETUP_TIMEOUT_MS });
        if (cleanup.exitCode !== 0) {
          refCleanupError ??= new Error(`sandbox git bundle ref cleanup failed (${cleanup.exitCode}): ${outputTail(cleanup.stderr || cleanup.stdout)}`);
        }
      } catch (error) {
        refCleanupError ??= error instanceof Error ? error : new Error(String(error));
      }
    }
    const failure = seedError ?? refCleanupError;
    if (failure) {
      await rm(dir, { recursive: true, force: true });
      throw failure;
    }
    return { dir, path };
  });
}

/** Pack (or join the shared pack of) the seed bundle and upload it to this sandbox; uploads stay per sandbox. Exported for tests. */
export async function uploadSeedBundle(params: {
  sandbox: SandboxHandle;
  runner: ProvisionCommandRunner;
  sourceRepoRoot: string;
  revs: string[];
  exclude: string | null;
}): Promise<void> {
  const key = JSON.stringify([resolve(params.sourceRepoRoot), [...params.revs].sort(), params.exclude]);
  let entry = sharedBundles.get(key);
  if (entry) {
    entry.users += 1;
    if (entry.expiry) clearTimeout(entry.expiry);
    entry.expiry = undefined;
  } else {
    const created: SharedBundleEntry = { ready: packSeedBundle(params.runner, params.sourceRepoRoot, params.revs, params.exclude), users: 1 };
    sharedBundles.set(key, created);
    // A failed pack is never reused: later provisions pack afresh.
    created.ready.catch(() => {
      if (sharedBundles.get(key) === created) sharedBundles.delete(key);
    });
    entry = created;
  }
  try {
    const bundle = await entry.ready;
    await params.sandbox.uploadFile(bundle.path, SANDBOX_BUNDLE_PATH);
  } finally {
    await releaseSharedBundle(key, entry);
  }
}

/**
 * Which of `revs` the sandbox checkout already holds as commits (one exec).
 * A probe that fails reports none, so everything is bundled as before.
 */
async function sandboxRevisionsPresent(sandbox: SandboxHandle, workspaceRoot: string, revs: string[]): Promise<Set<string>> {
  const probe = await sandbox.exec(
    ["sh", "-c", 'for r; do git cat-file -e "$r^{commit}" 2>/dev/null && echo "$r"; done; exit 0', "--", ...revs],
    { cwd: workspaceRoot, timeoutMs: SETUP_TIMEOUT_MS },
  );
  if (probe.exitCode !== 0) {
    console.warn(`[sandbox] ${sandbox.sandboxId}: revision probe failed (${probe.exitCode}: ${outputTail(probe.stderr || probe.stdout, 400)}); bundling every revision`);
    return new Set();
  }
  const listed = new Set(probe.stdout.split("\n").map((line) => line.trim()));
  return new Set(revs.filter((rev) => listed.has(rev)));
}

/**
 * Put `baseRev` and every required revision into the sandbox checkout. The
 * image is a depth-1 clone at `snapshotBakedRev`, plus any extra commits the
 * snapshot baked depth-1 beside it (`refs/baked-extra/*`, e.g. trusted bases
 * older than the baked HEAD). One probe finds the wanted revisions the image
 * already holds; those are neither bundled nor fetched, and when nothing else
 * is pending the seed is "baked". For the rest, when the baked commit is an
 * ancestor of every pending revision the bundle is thin (`^snapshotBakedRev`,
 * whose only prerequisite is the baked commit); otherwise it carries full
 * history. A thin bundle the sandbox cannot verify is replaced once by a full one.
 */
async function seedSandboxCheckout(params: {
  sandbox: SandboxHandle;
  runner: ProvisionCommandRunner;
  sourceRepoRoot: string;
  baseRev: string;
  snapshotBakedRev: string;
  workspaceRoot: string;
  requiredRevs: string[];
}): Promise<SandboxSeedResult> {
  const { sandbox, runner, sourceRepoRoot, baseRev, snapshotBakedRev: bakedRev, workspaceRoot } = params;
  const requiredRevs = [...new Set(params.requiredRevs.filter((value) => value && value !== baseRev))];
  // Fail closed: a claim whose required revision (e.g. its trusted base) cannot reach the sandbox is not provisioned.
  for (const rev of requiredRevs) {
    const present = await hostCommitPresent(runner, sourceRepoRoot, rev);
    if (present.exitCode !== 0) {
      throw new Error(`sandbox required revision ${rev} is not a commit in the host checkout ${sourceRepoRoot} (git rev-parse exited ${present.exitCode}${(present.stderr || present.stdout).trim() ? `: ${outputTail((present.stderr || present.stdout).trim(), 400)}` : ""}); the sandbox cannot be seeded with it`);
    }
  }
  const wanted = [baseRev, ...requiredRevs];
  const notBaked = wanted.filter((rev) => rev !== bakedRev);
  if (notBaked.length === 0) {
    await checkedSandboxExec(
      sandbox,
      ["git", "rev-parse", "--verify", `${baseRev}^{commit}`],
      workspaceRoot,
      "sandbox baked revision verification",
    );
    return { kind: "baked", requiredRevs };
  }
  const present = await sandboxRevisionsPresent(sandbox, workspaceRoot, notBaked);
  const bakedExtra = notBaked.filter((rev) => present.has(rev));
  const extra = bakedExtra.length > 0 ? { bakedExtra } : {};
  const pending = notBaked.filter((rev) => !present.has(rev));
  if (pending.length === 0) {
    for (const rev of wanted) {
      await checkedSandboxExec(
        sandbox,
        ["git", "rev-parse", "--verify", `${rev}^{commit}`],
        workspaceRoot,
        rev === baseRev ? "sandbox baked revision verification" : "sandbox required revision verification",
      );
    }
    return { kind: "baked", requiredRevs, ...extra };
  }
  // A full bundle carries every wanted revision the image does not already hold.
  const fullRevs = wanted.filter((rev) => !present.has(rev));

  let thin = Boolean(bakedRev);
  for (const rev of pending) {
    if (!thin) break;
    thin = await hostIsAncestor(runner, sourceRepoRoot, bakedRev, rev);
  }
  let kind: SandboxSeedKind = thin ? "thin" : "full";
  await uploadSeedBundle({ sandbox, runner, sourceRepoRoot, revs: thin ? pending : fullRevs, exclude: thin ? bakedRev : null });
  const verifyCommand = ["git", "bundle", "verify", SANDBOX_BUNDLE_PATH];
  let verify = await sandbox.exec(verifyCommand, { cwd: workspaceRoot, timeoutMs: SETUP_TIMEOUT_MS });
  let thinFallback = false;
  if (verify.exitCode !== 0 && kind === "thin") {
    console.warn(`[sandbox] ${sandbox.sandboxId}: thin bundle failed verification (${outputTail(verify.stderr || verify.stdout, 400)}); retrying with a full bundle`);
    kind = "full";
    thinFallback = true;
    await uploadSeedBundle({ sandbox, runner, sourceRepoRoot, revs: fullRevs, exclude: null });
    verify = await sandbox.exec(verifyCommand, { cwd: workspaceRoot, timeoutMs: SETUP_TIMEOUT_MS });
  }
  if (verify.exitCode !== 0) {
    throw new Error(`sandbox git bundle verification failed (${verify.exitCode}): ${outputTail(verify.stderr || verify.stdout)}`);
  }
  await checkedSandboxExec(
    sandbox,
    ["git", "fetch", SANDBOX_BUNDLE_PATH, ...(kind === "thin" ? pending : fullRevs)],
    workspaceRoot,
    "sandbox git bundle fetch",
  );
  for (const rev of requiredRevs) {
    await checkedSandboxExec(
      sandbox,
      ["git", "rev-parse", "--verify", `${rev}^{commit}`],
      workspaceRoot,
      "sandbox required revision verification",
    );
  }
  return { kind, ...(thinFallback ? { thinFallback } : {}), requiredRevs, ...extra };
}

/** Total provisions tried when the runner cannot exec the i386 wibo binary (default 3, min 1). */
export const SANDBOX_WIBO_EXEC_ATTEMPTS_ENV = "ORCH_SANDBOX_WIBO_EXEC_ATTEMPTS";
const DEFAULT_WIBO_EXEC_ATTEMPTS = 3;
const WIBO_ENOEXEC = /wibo-real cannot exec on (\S+) (\S+): \[Errno 8\]/;

/** The wibo exec probe failed with ENOEXEC: this runner's kernel cannot exec 32-bit i386 binaries. */
export class SandboxWiboExecError extends Error {
  constructor(message: string, readonly sandboxId: string, readonly kernel: string) {
    super(message);
    this.name = "SandboxWiboExecError";
  }
}

type ProvisionSandboxWorkspaceParams = {
  provider: SandboxProvider;
  sourceRepoRoot: string;
  baseRev: string;
  snapshotBakedRev: string;
  workspaceRoot: string;
  snapshot: string;
  resources: SandboxResourceClass;
  ttlSeconds: number;
  labels: SandboxProvisionLabels;
  reportArtifactSources: WorkerReportArtifactSource[];
  event: { store: StateStore; context: SandboxCreatedEventContext };
  commandRunner?: ProvisionCommandRunner;
  /** Revisions the sandbox must also contain (e.g. an unverified target's trusted base). */
  requiredRevs?: string[];
  /** Files written into the checkout after checkout (e.g. the unverified-matches evidence list). */
  sandboxFiles?: SandboxWorkspaceFile[];
  /** Prebuilt tool data synced under /opt/tool-data (e.g. the asm-window index). */
  toolData?: SandboxToolDataTree[];
};

/**
 * Creates and provisions one sandbox. Some Daytona runners cannot exec the
 * i386 wibo binary (ENOEXEC); that one failure is retried on a fresh sandbox
 * (each create goes through the provider, so create admission sees it), up to
 * ORCH_SANDBOX_WIBO_EXEC_ATTEMPTS total. Every other failure throws at once.
 */
export async function provisionSandboxWorkspace(params: ProvisionSandboxWorkspaceParams): Promise<ProvisionSandboxWorkspaceResult> {
  const attempts = envCount(SANDBOX_WIBO_EXEC_ATTEMPTS_ENV, DEFAULT_WIBO_EXEC_ATTEMPTS, 1);
  const kernels: string[] = [];
  for (let attempt = 1; ; attempt++) {
    try {
      return await provisionSandboxWorkspaceOnce(params);
    } catch (error) {
      if (!(error instanceof SandboxWiboExecError)) throw error;
      kernels.push(error.kernel);
      if (attempt >= attempts) {
        throw new Error(
          `sandbox provisioning failed: ${attempts} sandbox${attempts === 1 ? "" : "es"} in a row landed on Daytona runners that cannot exec the 32-bit i386 wibo binary (ENOEXEC; kernels ${kernels.join(", ")}); every MWCC compile needs it. Last: ${error.message}`,
          { cause: error },
        );
      }
      console.warn(`[sandbox] ${error.sandboxId}: runner cannot exec i386 wibo (${error.kernel}); retrying on a new sandbox (attempt ${attempt + 1}/${attempts})`);
    }
  }
}

async function provisionSandboxWorkspaceOnce(params: ProvisionSandboxWorkspaceParams): Promise<ProvisionSandboxWorkspaceResult> {
  const runner = params.commandRunner ?? defaultRunner;
  let sandbox: SandboxHandle | undefined;
  try {
    sandbox = await params.provider.create({
      snapshot: params.snapshot,
      labels: { ...params.labels },
      resources: { ...params.resources },
      ttlMinutes: Math.ceil(params.ttlSeconds / 60) + 30,
    });
    emitSandboxCreatedEvent(params.event.store, {
      ...params.event.context,
      sandboxId: sandbox.sandboxId,
      snapshot: params.snapshot,
      cpu: params.resources.cpu,
      memoryGiB: params.resources.memoryGiB,
      diskGiB: params.resources.diskGiB,
    });
    const seed = await seedSandboxCheckout({
      sandbox,
      runner,
      sourceRepoRoot: params.sourceRepoRoot,
      baseRev: params.baseRev,
      snapshotBakedRev: params.snapshotBakedRev,
      workspaceRoot: params.workspaceRoot,
      requiredRevs: params.requiredRevs ?? [],
    });
    console.log(`[sandbox] ${sandbox.sandboxId} seeded ${params.baseRev.slice(0, 12)} via ${seed.kind}${seed.thinFallback ? " (thin bundle failed verification)" : ""} bundle; required revisions ${seed.requiredRevs.length}`);

    // Baked workspaces may carry dirty tracked files; the claim's identity is baseRev.
    await checkedSandboxExec(
      sandbox,
      ["git", "checkout", "--force", "--detach", params.baseRev],
      params.workspaceRoot,
      "sandbox detached checkout",
    );
    for (const file of params.sandboxFiles ?? []) {
      const remotePath = sandboxWorkspacePath(params.workspaceRoot, file.relativePath);
      await checkedSandboxExec(sandbox, ["mkdir", "-p", posix.dirname(remotePath)], params.workspaceRoot, "sandbox file directory creation");
      await sandbox.writeFile(remotePath, file.content);
    }
    await ensureSandboxCompilerSourceLink(sandbox, params.workspaceRoot);
    const toolpackId = defaultToolpackId();
    await ensureSandboxToolpack(sandbox, {
      hostToolpackRoot: toolpackRoot(toolpackId),
      toolpackId,
    });
    await ensureSandboxQaAssets(sandbox, { orchestratorRoot: packageRoot(), gameId: params.labels.game_id });
    for (const tree of params.toolData ?? []) {
      if (!await ensureSandboxToolData(sandbox, tree)) {
        console.warn(`[sandbox] ${sandbox.sandboxId}: no ${tree.toolId} data at ${tree.hostRoot}; the tool reports it missing in this sandbox`);
      }
    }
    for (const source of params.reportArtifactSources) {
      await sandbox.uploadFile(source.sourcePath, posix.resolve(params.workspaceRoot, source.relativePath));
    }
    await checkedSandboxExec(
      sandbox,
      [
        "/bin/sh",
        "-c",
        "test -x build/tools/wibo-real && test -x build/tools/objdiff-cli && test -x build/tools/dtk",
      ],
      params.workspaceRoot,
      "sandbox canonical tool verification",
    );
    // wibo is a 32-bit i386 binary: some Daytona runners cannot exec it (ENOEXEC), and every MWCC
    // compile in this sandbox would fail. Python, not sh: sh retries an ENOEXEC file as a script.
    const wiboProbe = await sandbox.exec(
      [
        "python3",
        "-c",
        "import os,subprocess,sys\ntry: subprocess.run(['build/tools/wibo-real','--help'],capture_output=True,timeout=30)\nexcept OSError as e: sys.exit(f'wibo-real cannot exec on {os.uname().release} {os.uname().machine}: {e}')",
      ],
      { cwd: params.workspaceRoot, timeoutMs: SETUP_TIMEOUT_MS },
    );
    if (wiboProbe.exitCode !== 0) {
      const output = wiboProbe.stderr || wiboProbe.stdout;
      const message = `sandbox wibo exec probe failed (${wiboProbe.exitCode}): ${outputTail(output)}`;
      const enoexec = WIBO_ENOEXEC.exec(output);
      throw enoexec ? new SandboxWiboExecError(message, sandbox.sandboxId, enoexec[1]!) : new Error(message);
    }
    return { sandboxId: sandbox.sandboxId, workspaceRoot: params.workspaceRoot, seed };
  } catch (error) {
    if (sandbox) {
      let deleted = false;
      try {
        await params.provider.delete(sandbox.sandboxId, "provision_failure");
        deleted = true;
      } catch {}
      if (deleted) {
        const eventContext = params.event.context;
        try {
          emitSandboxDeletedEvent(params.event.store, {
            gameId: eventContext.gameId,
            sandboxId: sandbox.sandboxId,
            correlationId: eventContext.correlationId,
            causationId: eventContext.causationId,
            traceId: eventContext.traceId,
            actor: eventContext.actor,
            occurredAt: eventContext.occurredAt,
            parentSpanId: eventContext.parentSpanId,
            reason: "provision_failure",
            jobId: eventContext.jobId,
            claimId: eventContext.claimId,
          });
        } catch {}
      }
    }
    throw error;
  }
}
