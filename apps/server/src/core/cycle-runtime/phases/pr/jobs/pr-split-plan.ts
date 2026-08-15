import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createMeleeKernelSpawnContext } from "@server/infrastructure/kernel/bridge/spawn-context";
import { runMeleeKernelPiAgent as runPiAgent, type MeleeKernelPiRunOptions } from "@server/infrastructure/agent-runtime/kernel-pi-runner";
import {
  prSplitterPrompt,
  validatePrSplitterPlan,
  type PrSplitterPlan as AgentPrSplitterPlan,
  type PrSplitterSlice,
} from "@server/core/agent-catalog/agents/pr/splitter";
import { artifactTimestamp, parseJsonObject } from "@server/infrastructure/agent-runtime/runtime";
import { readRegressionReport } from "@server/core/validation/objdiff/report";
import { runCommand } from "@server/infrastructure/shell";
import { addPiSession } from "@server/core/cycle-runtime/run-state";
import { openState } from "@server/core/cycle-runtime/run-state";
import type { PiRunResult } from "@server/core/shared/types";
import { booleanArg, numberArg, gameMetadata, stringArg, type GlobalArgs } from "@server/core/game-registry/runtime-options.js";

type ChangeSource = "branch" | "worktree";
type GroupMode = "melee-subsystem" | "top-dir";
type IndependenceKind = "independent" | "shared-prep" | "stacked" | "needs-merge";
type PrLane = "match" | "local";
type PrSplitPlanningStrategy = "deterministic" | "agent";

export type PrSplitterAgentRunner = (options: MeleeKernelPiRunOptions) => Promise<PiRunResult>;

export interface PrLaneSets {
  matchPaths: string[];
  improvementPaths: string[];
}

// The ship-set verification verdict (ship_status.json): which match-lane
// files survived the survivor loop and which were dropped, with reasons.
export interface PrShipFilter {
  shippedPaths: string[];
  droppedReasons: Record<string, string[]>;
}

export interface PrChangedFile {
  path: string;
  oldPath?: string;
  statuses: string[];
  sources: ChangeSource[];
}

export interface PrSupportAssignment {
  path: string;
  sliceId: string;
  reason?: string;
}

interface RawChangedFile {
  path: string;
  oldPath?: string;
  status: string;
  source: ChangeSource;
}

interface ChangeGroup {
  id: string;
  /** Deterministic source-group ids proven to have been merged into this group. */
  memberIds: string[];
  displayName: string;
  scope: string;
  category: "shared" | "subsystem" | "support";
  lane?: PrLane | null;
  laneWarnings?: string[];
  files: PrChangedFile[];
}

interface PrSliceIndependence {
  kind: IndependenceKind;
  verified: boolean;
  confidence: "medium" | "low";
  reasons: string[];
  requiredChecks: string[];
  possibleDependencies: string[];
}

export interface PrSplitSlice {
  id: string;
  displayName: string;
  title: string;
  branchName: string;
  lane: PrLane | null;
  scope: string;
  directories: string[];
  fileCount: number;
  files: PrChangedFile[];
  pathspecs: string[];
  supportFiles?: PrChangedFile[];
  supportPathspecs?: string[];
  statusCounts: Record<string, number>;
  sources: ChangeSource[];
  independence: PrSliceIndependence;
  commands: string[];
  isolationCommands: string[];
  warnings: string[];
}

export interface PrSplitPlan {
  repoRoot: string;
  baseRef: string;
  headRef: string;
  currentBranch: string;
  groupMode: GroupMode;
  maxFilesPerPr: number;
  planningStrategy: PrSplitPlanningStrategy;
  splitterApplied: boolean;
  splitterRationale?: string;
  splitterConfidence?: number;
  splitterArtifacts?: {
    outputDir: string;
    sessionId: string;
    sessionFile?: string;
    systemPromptPath: string;
    userPromptPath: string;
    outputPath: string;
    parsedOutputPath?: string;
    dryRun: boolean;
  };
  lanesApplied: boolean;
  shipFilterApplied: boolean;
  totalFiles: number;
  slices: PrSplitSlice[];
  warnings: string[];
}

interface BuildPlanOptions {
  repoRoot: string;
  baseRef: string;
  headRef: string;
  currentBranch: string;
  groupMode: GroupMode;
  maxFilesPerPr: number;
  /** Match slices below this size merge together (1 disables merging). */
  minFilesPerPr?: number;
  branchPrefix: string;
  titlePrefix: string;
  sliceCheckCommand: string;
  planningStrategy?: PrSplitPlanningStrategy;
  lanes?: PrLaneSets | null;
  shipFilter?: PrShipFilter | null;
  warnings?: string[];
  supportAssignments?: PrSupportAssignment[];
}

function splitZ(output: string): string[] {
  const parts = output.split("\0");
  if (parts.at(-1) === "") parts.pop();
  return parts;
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

// decomp-permuter scratch copies (.permute-<id>.c, .permute-pch-<id>.mch)
// that escape cleanup and land in the worktree, index, or a commit.
const SCRATCH_FILE_PATTERN = /(^|\/)\.permute-/;

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:=,@%+-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

function sanitizeId(value: string): string {
  return value
    .trim()
    .replaceAll("\\", "/")
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, "-")
    .replace(/^[-/]+|[-/]+$/g, "")
    .replace(/\/+/g, "-")
    .replace(/-+/g, "-");
}

function displayNameFor(id: string): string {
  if (/^[a-z]{2}$/.test(id)) return id.toUpperCase();
  if (id === "sysdolphin") return "SysDolphin";
  if (id === "runtime") return "Runtime";
  if (id === "msl") return "MSL";
  if (id === "metrotrk") return "MetroTRK";
  return id
    .split("-")
    .filter(Boolean)
    .map((part) => (/^[a-z]{2}$/.test(part) ? part.toUpperCase() : part.slice(0, 1).toUpperCase() + part.slice(1)))
    .join(" ");
}

function titleFor(prefix: string, displayName: string): string {
  return prefix ? `${prefix}: ${displayName}` : displayName;
}

function directoryForPath(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "." : path.slice(0, slash);
}

function extensionForPath(path: string): string {
  const basename = path.split("/").at(-1) ?? "";
  const dot = basename.lastIndexOf(".");
  return dot === -1 ? "" : basename.slice(dot + 1).toLowerCase();
}

function isBuildOrGeneratedPath(path: string): boolean {
  const normalized = normalizePath(path);
  const basename = normalized.split("/").at(-1) ?? "";
  return (
    normalized.startsWith("build/") ||
    normalized.startsWith(".github/") ||
    normalized.startsWith("config/") ||
    normalized.startsWith("tools/") ||
    basename === "objdiff.json" ||
    basename === "report.json" ||
    basename === "report_changes.json" ||
    basename === "configure.py" ||
    basename === "Makefile" ||
    basename.endsWith(".ld") ||
    basename.endsWith(".lcf") ||
    basename.endsWith(".lds") ||
    basename.includes("symbols") ||
    basename.includes("splits")
  );
}

function isScopedToMeleeSubsystem(path: string, sliceId: string): boolean {
  const parts = normalizePath(path).split("/").filter(Boolean);
  const meleeIndex = parts.indexOf("melee");
  return meleeIndex >= 0 && sanitizeId(parts[meleeIndex + 1] ?? "") === sliceId;
}

function isReviewableSourceLikePath(path: string): boolean {
  const extension = extensionForPath(path);
  return extension === "c" || extension === "h" || extension === "s" || extension === "inc";
}

function groupForPath(path: string, groupMode: GroupMode): Omit<ChangeGroup, "files" | "memberIds"> {
  const parts = normalizePath(path).split("/").filter(Boolean);
  if (groupMode === "top-dir") {
    const id = sanitizeId(parts[0] ?? "root") || "root";
    return {
      id,
      displayName: displayNameFor(id),
      scope: parts[0] ?? ".",
      category: id === "root" ? "shared" : "support",
    };
  }

  const meleeIndex = parts.indexOf("melee");
  if (meleeIndex >= 0 && parts[meleeIndex + 1]) {
    const subsystem = parts[meleeIndex + 1];
    const id = sanitizeId(subsystem);
    return {
      id,
      displayName: displayNameFor(id),
      scope: `melee/${subsystem}`,
      category: "subsystem",
    };
  }

  const supportRoots = ["sysdolphin", "Runtime", "MSL", "MetroTRK"];
  for (const root of supportRoots) {
    const index = parts.findIndex((part) => part.toLowerCase() === root.toLowerCase());
    if (index >= 0) {
      const id = sanitizeId(root);
      return {
        id,
        displayName: displayNameFor(id),
        scope: parts.slice(0, index + 1).join("/"),
        category: "support",
      };
    }
  }

  const id = sanitizeId(parts[0] ?? "shared") || "shared";
  return {
    id,
    displayName: displayNameFor(id),
    scope: parts[0] ?? ".",
    category: "shared",
  };
}

function refinementId(path: string, group: ChangeGroup): string {
  const parts = normalizePath(path).split("/").filter(Boolean);
  const scopeParts = group.scope.split("/").filter(Boolean);
  const anchor = scopeParts.length >= 2 ? parts.findIndex((part, index) => part === scopeParts[0] && parts[index + 1] === scopeParts[1]) : -1;
  const afterScope = anchor >= 0 ? parts.slice(anchor + scopeParts.length) : parts.slice(1);
  const directories = afterScope.filter((part) => !part.includes("."));
  if (directories.length === 0) return `${group.id}-root`;
  if (directories[0] === "chara" && directories[1]) return `${group.id}-chara-${sanitizeId(directories[1])}`;
  return `${group.id}-${sanitizeId(directories[0])}`;
}

function mergeChanges(changes: RawChangedFile[]): PrChangedFile[] {
  const byPath = new Map<string, PrChangedFile>();
  for (const change of changes) {
    const path = normalizePath(change.path);
    if (!path || path.startsWith(".git/")) continue;
    const existing = byPath.get(path);
    if (existing) {
      if (!existing.statuses.includes(change.status)) existing.statuses.push(change.status);
      if (!existing.sources.includes(change.source)) existing.sources.push(change.source);
      if (!existing.oldPath && change.oldPath) existing.oldPath = normalizePath(change.oldPath);
    } else {
      byPath.set(path, {
        path,
        oldPath: change.oldPath ? normalizePath(change.oldPath) : undefined,
        statuses: [change.status],
        sources: [change.source],
      });
    }
  }
  return Array.from(byPath.values()).sort((left, right) => left.path.localeCompare(right.path));
}

interface ResolvedSupportFile {
  assignment: PrSupportAssignment;
  file: PrChangedFile;
}

function supportAssignmentTarget<T extends { id: string; memberIds?: string[]; lane?: PrLane | null }>(
  targets: T[],
  assignment: PrSupportAssignment,
): T {
  const exact = targets.find((target) => target.id === assignment.sliceId);
  const provenMembers = targets.filter((target) => target.memberIds?.includes(assignment.sliceId));
  const shippingMembers = provenMembers.filter((target) => target.lane !== "local");
  const mergedMatches = exact ? [exact] : shippingMembers.length > 0 ? shippingMembers : provenMembers;
  if (mergedMatches.length === 1) return mergedMatches[0];
  if (mergedMatches.length > 1) {
    throw new Error(
      `Support file ${assignment.path} targets slice "${assignment.sliceId}", but that id matches multiple final slices: ${mergedMatches.map((target) => target.id).join(", ")}.`,
    );
  }
  throw new Error(
    `Support file ${assignment.path} targets unknown slice "${assignment.sliceId}"; final slice ids are: ${targets.map((target) => target.id).join(", ") || "(none)"}.`,
  );
}

function resolveSupportFilesForTargets<T extends { id: string; memberIds?: string[]; lane?: PrLane | null }>(
  targets: T[],
  files: PrChangedFile[],
  assignments: PrSupportAssignment[],
): Map<string, ResolvedSupportFile[]> {
  const filesByPath = new Map(files.map((file) => [normalizePath(file.path), file]));
  const seenAssignments = new Set<string>();
  const byTargetId = new Map<string, ResolvedSupportFile[]>();
  for (const rawAssignment of assignments) {
    const assignment = {
      ...rawAssignment,
      path: normalizePath(rawAssignment.path),
      sliceId: rawAssignment.sliceId.trim(),
      reason: rawAssignment.reason?.trim() || undefined,
    };
    if (!assignment.path || !assignment.sliceId) {
      throw new Error("Support assignments require non-empty path and sliceId values.");
    }
    const assignmentKey = `${assignment.path}\0${assignment.sliceId}`;
    if (seenAssignments.has(assignmentKey)) {
      throw new Error(`Support file ${assignment.path} is assigned to slice "${assignment.sliceId}" more than once.`);
    }
    seenAssignments.add(assignmentKey);
    const file = filesByPath.get(assignment.path);
    if (!file) {
      throw new Error(`Support file ${assignment.path} is not present in the collected changes.`);
    }
    const target = supportAssignmentTarget(targets, assignment);
    if (target.lane === "local") {
      throw new Error(
        `Support file ${assignment.path} targets local-only slice "${target.id}"; support files must attach to a shipping match slice.`,
      );
    }
    const resolved = byTargetId.get(target.id) ?? [];
    if (!resolved.some((entry) => entry.file.path === file.path)) resolved.push({ assignment, file });
    byTargetId.set(target.id, resolved);
  }
  for (const resolved of byTargetId.values()) {
    resolved.sort((left, right) => left.file.path.localeCompare(right.file.path));
  }
  return byTargetId;
}

function supportWarning(resolved: ResolvedSupportFile): string {
  return `Declared support file ${resolved.file.path} attached: ${resolved.assignment.reason ?? "operator-declared support for this slice's match"}`;
}

function addSupportIndependenceDetails(independence: PrSliceIndependence, supportFiles: PrChangedFile[]): PrSliceIndependence {
  if (supportFiles.length === 0) return independence;
  const paths = supportFiles.map((file) => file.path).sort();
  return {
    ...independence,
    reasons: [...independence.reasons, `carries ${supportFiles.length} declared support file(s): ${paths.join(", ")}`],
    requiredChecks: [
      ...independence.requiredChecks,
      "confirm each support edit's primary motivation is a match in this slice's target translation unit",
      "verify whole-unit objdiff shows zero codegen movement in every touched foreign translation unit",
      "confirm upstream CI parity for the slice with its support files",
      "verify merge-order safety (git merge-tree both orders) against any other open slice touching the same support file(s)",
    ],
  };
}

function statusCounts(files: PrChangedFile[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const file of files) {
    for (const status of file.statuses) counts[status] = (counts[status] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function sliceSources(files: PrChangedFile[]): ChangeSource[] {
  const sources = new Set<ChangeSource>();
  for (const file of files) for (const source of file.sources) sources.add(source);
  return Array.from(sources).sort();
}

function sortGroups(left: ChangeGroup, right: ChangeGroup): number {
  const categoryOrder = { shared: 0, subsystem: 1, support: 2 };
  return categoryOrder[left.category] - categoryOrder[right.category] || left.id.localeCompare(right.id);
}

// Subsystem grouping is a starting proposal, not the PR boundary: a slice
// only earns its own PR when it is big enough to justify one. Small
// match-lane subsystem slices pack together (first-fit decreasing, capped by
// maxFilesPerPr) so reviewers get the fewest comfortable PRs instead of a
// pile of one-file ones. Shared/support slices never merge — their risk
// class is the reason they are separate.
function mergeSmallMatchGroups(groups: ChangeGroup[], minFilesPerPr: number, maxFilesPerPr: number): ChangeGroup[] {
  if (minFilesPerPr <= 1) return groups;
  const small = groups.filter((group) => group.lane === "match" && group.category === "subsystem" && group.files.length < minFilesPerPr);
  if (small.length < 2) return groups;
  const rest = groups.filter((group) => !small.includes(group));
  const bins: ChangeGroup[][] = [];
  for (const group of [...small].sort((left, right) => right.files.length - left.files.length)) {
    const bin = bins.find((candidate) => candidate.reduce((total, member) => total + member.files.length, 0) + group.files.length <= maxFilesPerPr);
    if (bin) bin.push(group);
    else bins.push([group]);
  }
  const merged = bins.map((bin) => {
    if (bin.length === 1) return bin[0];
    const ordered = [...bin].sort(sortGroups);
    return {
      id: ordered.map((member) => member.id).join("-"),
      memberIds: [...new Set(ordered.flatMap((member) => member.memberIds))],
      displayName: ordered.map((member) => member.displayName).join(" + "),
      scope: ordered.map((member) => member.scope).join(", "),
      category: "subsystem" as const,
      lane: "match" as const,
      laneWarnings: [
        `Merged ${ordered.length} small subsystem slices (${ordered.map((member) => `${member.displayName}: ${member.files.length} file${member.files.length === 1 ? "" : "s"}`).join(", ")}) — each was below --min-files-per-pr=${minFilesPerPr}.`,
        ...new Set(ordered.flatMap((member) => member.laneWarnings ?? [])),
      ],
      files: ordered.flatMap((member) => member.files),
    };
  });
  return [...rest, ...merged];
}

function maybeSplitLargeGroup(group: ChangeGroup, maxFilesPerPr: number): ChangeGroup[] {
  if (group.files.length <= maxFilesPerPr) return [group];
  const buckets = new Map<string, PrChangedFile[]>();
  for (const file of group.files) {
    const id = refinementId(file.path, group);
    const bucket = buckets.get(id) ?? [];
    bucket.push(file);
    buckets.set(id, bucket);
  }
  if (buckets.size <= 1) return [group];
  return Array.from(buckets.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, files]) => ({
      ...group,
      id,
      displayName: displayNameFor(id),
      scope: `${group.scope}/${id.replace(`${group.id}-`, "")}`,
      files,
    }));
}

function commandsForSlice(slice: Omit<PrSplitSlice, "commands" | "isolationCommands">, baseRef: string, headRef: string): string[] {
  const pathspecs = [...slice.pathspecs, ...(slice.supportPathspecs ?? [])].map(shellQuote).join(" ");
  return [
    `git switch -c ${shellQuote(slice.branchName)} ${shellQuote(baseRef)}`,
    `git diff --binary ${shellQuote(`${baseRef}...${headRef}`)} -- ${pathspecs} | git apply --index`,
    `git commit -m ${shellQuote(slice.title)}`,
  ];
}

function checkCommandForSlice(slice: Omit<PrSplitSlice, "commands" | "isolationCommands">, repoRoot: string, sliceCheckCommand: string): string {
  return sliceCheckCommand
    .replaceAll("{slice_dir}", "$SLICE_DIR")
    .replaceAll("{slice_id}", slice.id)
    .replaceAll("{repo_root}", shellQuote(repoRoot));
}

function isolationCommandsForSlice(
  slice: Omit<PrSplitSlice, "commands" | "isolationCommands">,
  options: Pick<BuildPlanOptions, "baseRef" | "headRef" | "repoRoot" | "sliceCheckCommand">,
): string[] {
  const pathspecs = [...slice.pathspecs, ...(slice.supportPathspecs ?? [])].map(shellQuote).join(" ");
  const tempPrefix = `melee-pr-${sanitizeId(slice.id) || "slice"}-XXXXXX`;
  return [
    `SLICE_DIR="$(mktemp -d "\${TMPDIR:-/tmp}/${tempPrefix}")"`,
    `git worktree add --detach "$SLICE_DIR" ${shellQuote(options.baseRef)}`,
    `git diff --binary ${shellQuote(`${options.baseRef}...${options.headRef}`)} -- ${pathspecs} | git -C "$SLICE_DIR" apply --index`,
    `(cd "$SLICE_DIR" && ${checkCommandForSlice(slice, options.repoRoot, options.sliceCheckCommand)})`,
    `git worktree remove "$SLICE_DIR"`,
  ];
}

function classifyIndependence(group: ChangeGroup, files: PrChangedFile[], supportFiles: PrChangedFile[], maxFilesPerPr: number): PrSliceIndependence {
  const reasons: string[] = [];
  const requiredChecks = [
    "apply this slice to a fresh branch or worktree based on the selected base ref",
    "run configure/build for that isolated slice",
    "run the saved-baseline regression gate or equivalent local PR check",
    "promote to a true independent PR only if the isolated slice passes",
  ];
  const hasGeneratedOrBuildPath = files.some((file) => isBuildOrGeneratedPath(file.path));
  const hasUntracked = files.some((file) => file.statuses.some((status) => status.startsWith("??")));
  const hasWorktree = files.some((file) => file.sources.includes("worktree"));
  const hasDeletionOrRename = files.some((file) => file.statuses.some((status) => status.includes("D") || status.includes("R")));
  const subsystemId =
    group.category === "subsystem" ? sanitizeId(group.scope.split("/").filter(Boolean)[1] ?? "") || group.id : group.id;
  const allScopedSourceLike =
    group.category === "subsystem" &&
    files.every((file) => isScopedToMeleeSubsystem(file.path, subsystemId) && isReviewableSourceLikePath(file.path));
  const hasCrossCuttingHeader = files.some((file) => extensionForPath(file.path) === "h" && !isScopedToMeleeSubsystem(file.path, subsystemId));

  const result = (independence: PrSliceIndependence): PrSliceIndependence => addSupportIndependenceDetails(independence, supportFiles);

  const totalFileCount = files.length + supportFiles.length;
  if (totalFileCount > maxFilesPerPr) {
    reasons.push(
      supportFiles.length > 0
        ? `slice has ${totalFileCount} files including declared support, above --max-files-per-pr=${maxFilesPerPr}`
        : `slice has ${totalFileCount} files, above --max-files-per-pr=${maxFilesPerPr}`,
    );
    return result({ kind: "needs-merge", verified: false, confidence: "low", reasons, requiredChecks, possibleDependencies: [] });
  }

  if (hasGeneratedOrBuildPath) {
    reasons.push("contains build, generated, config, symbol, split, or CI-adjacent files");
    return result({ kind: "shared-prep", verified: false, confidence: "low", reasons, requiredChecks, possibleDependencies: [] });
  }

  if (group.category === "shared") {
    reasons.push("changes are outside a Melee subsystem directory");
    return result({ kind: "shared-prep", verified: false, confidence: "low", reasons, requiredChecks, possibleDependencies: [] });
  }

  if (group.category === "support") {
    reasons.push("support-library changes may affect multiple Melee subsystem slices");
    return result({ kind: "shared-prep", verified: false, confidence: "low", reasons, requiredChecks, possibleDependencies: [] });
  }

  if (hasCrossCuttingHeader) {
    reasons.push("contains headers or declarations outside this slice's Melee subsystem");
    return result({ kind: "stacked", verified: false, confidence: "low", reasons, requiredChecks, possibleDependencies: [] });
  }

  if (hasDeletionOrRename) {
    reasons.push("contains deletes or renames that may affect references outside the directory slice");
    return result({ kind: "stacked", verified: false, confidence: "low", reasons, requiredChecks, possibleDependencies: [] });
  }

  if (allScopedSourceLike) {
    reasons.push(`all files are source/header-like paths scoped to ${group.scope}`);
    if (hasWorktree) reasons.push("worktree changes still need to be committed or stashed before final isolation validation");
    if (hasUntracked) reasons.push("untracked files must be intentionally added before final isolation validation");
    return result({ kind: "independent", verified: false, confidence: "medium", reasons, requiredChecks, possibleDependencies: [] });
  }

  reasons.push("slice is subsystem-scoped but includes files outside the normal source/header isolation pattern");
  return result({ kind: "stacked", verified: false, confidence: "low", reasons, requiredChecks, possibleDependencies: [] });
}

function lanePathMatcher(paths: string[]): (changedPath: string) => boolean {
  const candidates = new Set(paths.map(normalizePath).filter(Boolean));
  return (changedPath) => {
    const path = normalizePath(changedPath);
    if (candidates.has(path)) return true;
    // Checkpoint source paths and git paths can differ by a repo-root prefix
    // (e.g. "melee/mn/mnnamenew.c" vs "src/melee/mn/mnnamenew.c").
    for (const candidate of candidates) {
      if (path.endsWith(`/${candidate}`) || candidate.endsWith(`/${path}`)) return true;
    }
    return false;
  };
}

// Splits one subsystem group into a match-lane group (what ships) and a
// local-only group (what stays on the branch). Only matches ship; support
// files (headers, declarations, build glue) ride the match lane when one
// exists because the matches need them to build, and otherwise stay local.
// When a ship filter is present (the survivor-loop verdict), files the
// verification dropped are demoted to the local lane with their drop reasons.
function splitGroupByLane(group: ChangeGroup, lanes: PrLaneSets, shipFilter: PrShipFilter | null): ChangeGroup[] {
  const isMatch = lanePathMatcher(lanes.matchPaths);
  const isImprovement = lanePathMatcher(lanes.improvementPaths);
  const matchFiles: PrChangedFile[] = [];
  const localFiles: PrChangedFile[] = [];
  const supportFiles: PrChangedFile[] = [];
  let mixedCount = 0;
  for (const file of group.files) {
    if (isMatch(file.path)) {
      matchFiles.push(file);
      if (isImprovement(file.path)) mixedCount += 1;
    } else if (isImprovement(file.path)) {
      localFiles.push(file);
    } else {
      supportFiles.push(file);
    }
  }

  // The ship filter is the verified survivor set: anything the survivor loop
  // dropped (or never verified) moves to the local lane instead of a PR.
  const droppedFromShip: string[] = [];
  if (shipFilter) {
    const isShipped = lanePathMatcher(shipFilter.shippedPaths);
    const isDropped = lanePathMatcher(Object.keys(shipFilter.droppedReasons));
    const keepShipped = (files: PrChangedFile[]): PrChangedFile[] =>
      files.filter((file) => {
        if (isShipped(file.path)) return true;
        if (isDropped(file.path)) {
          const reasonKey = Object.keys(shipFilter.droppedReasons).find(
            (dropped) => normalizePath(dropped) === normalizePath(file.path) || normalizePath(file.path).endsWith(`/${normalizePath(dropped)}`) || normalizePath(dropped).endsWith(`/${normalizePath(file.path)}`),
          );
          const reasons = reasonKey ? shipFilter.droppedReasons[reasonKey] ?? [] : [];
          droppedFromShip.push(`${file.path}${reasons.length > 0 ? ` (${reasons.join("; ")})` : ""}`);
          localFiles.push(file);
          return false;
        }
        droppedFromShip.push(`${file.path} (not in the verified ship set)`);
        localFiles.push(file);
        return false;
      });
    const survivedMatches = keepShipped(matchFiles);
    const survivedSupport = keepShipped(supportFiles);
    matchFiles.length = 0;
    matchFiles.push(...survivedMatches);
    supportFiles.length = 0;
    supportFiles.push(...survivedSupport);
  }

  const groups: ChangeGroup[] = [];
  if (matchFiles.length > 0) {
    const laneWarnings: string[] = [];
    if (mixedCount > 0) {
      laneWarnings.push(`${mixedCount} file(s) in this match slice also carry unshipped fuzzy improvements in other functions; call that out in the PR body.`);
    }
    if (supportFiles.length > 0) {
      laneWarnings.push(`${supportFiles.length} supporting file(s) are not checkpoint candidates; confirm each is required for the matches to build.`);
    }
    if (droppedFromShip.length > 0) {
      laneWarnings.push(`${droppedFromShip.length} file(s) dropped by ship-set verification moved to the local lane: ${droppedFromShip.join(", ")}`);
    }
    groups.push({ ...group, lane: "match", laneWarnings, files: [...matchFiles, ...supportFiles] });
  }
  if (localFiles.length > 0 || (matchFiles.length === 0 && supportFiles.length > 0)) {
    const files = matchFiles.length > 0 ? localFiles : [...localFiles, ...supportFiles];
    const laneWarnings = ["Local-only: improvements and support files that do not ship. They stay on the branch until the work becomes an exact match."];
    if (matchFiles.length === 0 && droppedFromShip.length > 0) {
      laneWarnings.push(`${droppedFromShip.length} file(s) dropped by ship-set verification: ${droppedFromShip.join(", ")}`);
    }
    groups.push({
      ...group,
      id: `local-${group.id}`,
      displayName: `${group.displayName} (local only)`,
      lane: "local",
      laneWarnings,
      files,
    });
  }
  if (groups.length === 0) {
    groups.push({ ...group, lane: null, laneWarnings: ["No files in this slice are checkpoint candidates; it likely predates the checkpoint or is shared prep."] });
  }
  return groups;
}

export function buildPrSplitPlanFromChanges(changes: RawChangedFile[], options: BuildPlanOptions): PrSplitPlan {
  const files = mergeChanges(changes);
  const supportAssignments = options.supportAssignments ?? [];
  const supportPaths = new Set(supportAssignments.map((assignment) => normalizePath(assignment.path)));
  const groups = new Map<string, ChangeGroup>();
  for (const file of files) {
    if (supportPaths.has(file.path)) continue;
    const groupKey = groupForPath(file.path, options.groupMode);
    const existing = groups.get(groupKey.id);
    if (existing) {
      existing.files.push(file);
    } else {
      groups.set(groupKey.id, { ...groupKey, memberIds: [groupKey.id], files: [file] });
    }
  }

  const warnings = [...(options.warnings ?? [])];
  const lanes = options.lanes ?? null;
  const shipFilter = options.shipFilter ?? null;
  const splitGroups = lanes ? Array.from(groups.values()).flatMap((group) => splitGroupByLane(group, lanes, shipFilter)) : Array.from(groups.values());
  const laneGroups = lanes ? mergeSmallMatchGroups(splitGroups, options.minFilesPerPr ?? 1, options.maxFilesPerPr) : splitGroups;
  const finalGroups = laneGroups
    .sort(sortGroups)
    .flatMap((group) => maybeSplitLargeGroup(group, options.maxFilesPerPr));
  const resolvedSupportBySlice = resolveSupportFilesForTargets(finalGroups, files, supportAssignments);
  const slicesWithoutCommands: Array<Omit<PrSplitSlice, "commands" | "isolationCommands">> = finalGroups.map((group) => {
    const resolvedSupport = resolvedSupportBySlice.get(group.id) ?? [];
    const supportFiles = resolvedSupport.map((entry) => entry.file);
    const allSliceFiles = [...group.files, ...supportFiles];
    const groupWarnings: string[] = [...(group.laneWarnings ?? [])];
    if (allSliceFiles.length > options.maxFilesPerPr) {
      groupWarnings.push(
        supportFiles.length > 0
          ? `This slice has ${allSliceFiles.length} files including declared support, above --max-files-per-pr=${options.maxFilesPerPr}; split it manually if review still feels heavy.`
          : `This slice has ${allSliceFiles.length} files, above --max-files-per-pr=${options.maxFilesPerPr}; split it manually if review still feels heavy.`,
      );
    }
    if (allSliceFiles.some((file) => file.sources.includes("worktree"))) {
      groupWarnings.push("This slice includes worktree changes; commit or stash them before using the patch workflow from HEAD.");
    }
    if (allSliceFiles.some((file) => file.statuses.some((status) => status.startsWith("??")))) {
      groupWarnings.push("This slice includes untracked files; add them intentionally before opening a PR.");
    }
    groupWarnings.push(...resolvedSupport.map(supportWarning));
    const directories = Array.from(new Set(allSliceFiles.map((file) => directoryForPath(file.path)))).sort();
    const pathspecs = group.files.map((file) => file.path).sort();
    const branchPart = sanitizeId(group.id) || "shared";
    const independence = classifyIndependence(group, group.files, supportFiles, options.maxFilesPerPr);
    return {
      id: group.id,
      displayName: group.displayName,
      title: titleFor(options.titlePrefix, group.displayName),
      branchName: `${options.branchPrefix.replace(/\/+$/g, "")}/${branchPart}`,
      lane: group.lane ?? null,
      scope: group.scope,
      directories,
      fileCount: allSliceFiles.length,
      files: group.files,
      pathspecs,
      ...(supportFiles.length > 0
        ? {
            supportFiles,
            supportPathspecs: supportFiles.map((file) => file.path),
          }
        : {}),
      statusCounts: statusCounts(allSliceFiles),
      sources: sliceSources(allSliceFiles),
      independence,
      warnings: groupWarnings,
    };
  });

  const slices = slicesWithoutCommands.map((slice) => ({
    ...slice,
    commands: commandsForSlice(slice, options.baseRef, options.headRef),
    isolationCommands: isolationCommandsForSlice(slice, options),
  }));

  if (files.some((file) => file.sources.includes("worktree"))) {
    warnings.push("Worktree changes are included in the plan, but generated patch commands only replay committed branch changes from HEAD.");
  }
  const sharedPrepIds = slices.filter((slice) => slice.independence.kind === "shared-prep").map((slice) => slice.id);
  for (const slice of slices) {
    if (slice.independence.kind === "stacked" && sharedPrepIds.length > 0) {
      slice.independence.possibleDependencies = sharedPrepIds;
    }
  }
  if (sharedPrepIds.length > 0) {
    warnings.push(`Shared-prep slices detected (${sharedPrepIds.join(", ")}); validate subsystem slices standalone first, then stack them only if they require shared-prep changes.`);
  }

  return {
    repoRoot: options.repoRoot,
    baseRef: options.baseRef,
    headRef: options.headRef,
    currentBranch: options.currentBranch,
    groupMode: options.groupMode,
    maxFilesPerPr: options.maxFilesPerPr,
    planningStrategy: options.planningStrategy ?? "deterministic",
    splitterApplied: false,
    lanesApplied: Boolean(lanes),
    shipFilterApplied: Boolean(lanes && shipFilter),
    totalFiles: files.length,
    slices,
    warnings,
  };
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function planFileMap(plan: PrSplitPlan): Map<string, PrChangedFile> {
  const files = new Map<string, PrChangedFile>();
  for (const slice of plan.slices) {
    for (const file of slice.files) files.set(normalizePath(file.path), file);
  }
  return files;
}

function planSupportFileMap(plan: PrSplitPlan): Map<string, PrChangedFile> {
  const files = new Map<string, PrChangedFile>();
  for (const slice of plan.slices) {
    for (const file of slice.supportFiles ?? []) files.set(normalizePath(file.path), file);
  }
  return files;
}

function planFileLaneMap(plan: PrSplitPlan): Map<string, PrLane | null> {
  const lanes = new Map<string, PrLane | null>();
  for (const slice of plan.slices) {
    for (const file of slice.files) lanes.set(normalizePath(file.path), slice.lane);
  }
  return lanes;
}

function seedWarningsForFiles(plan: PrSplitPlan, filePaths: string[]): string[] {
  const paths = new Set(filePaths.map(normalizePath));
  return uniqueStrings(plan.slices.filter((slice) => slice.files.some((file) => paths.has(normalizePath(file.path)))).flatMap((slice) => slice.warnings));
}

function splitterContextFromPlan(plan: PrSplitPlan): Record<string, unknown> {
  const laneByFile = planFileLaneMap(plan);
  const seedSliceByFile = new Map<string, string>();
  for (const slice of plan.slices) {
    for (const file of slice.files) seedSliceByFile.set(normalizePath(file.path), slice.id);
  }
  return {
    schema_version: "melee_pr_splitter_context_v1",
    plan_inputs: {
      repo_root: plan.repoRoot,
      base_ref: plan.baseRef,
      head_ref: plan.headRef,
      current_branch: plan.currentBranch,
      group_mode: plan.groupMode,
      max_files_per_pr: plan.maxFilesPerPr,
      lanes_applied: plan.lanesApplied,
      ship_filter_applied: plan.shipFilterApplied,
      total_files: plan.totalFiles,
    },
    invariants: {
      all_changed_files_must_be_assigned_exactly_once: true,
      preserve_file_lanes: true,
      do_not_mix_match_and_local_files: true,
      max_files_per_pr_is_hard_ceiling: plan.maxFilesPerPr,
      branch_creation_and_validation_remain_runner_owned: true,
    },
    changed_files: plan.slices.flatMap((slice) =>
      slice.files.map((file) => ({
        path: file.path,
        old_path: file.oldPath ?? null,
        statuses: file.statuses,
        sources: file.sources,
        deterministic_lane: laneByFile.get(normalizePath(file.path)) ?? null,
        deterministic_slice_id: seedSliceByFile.get(normalizePath(file.path)) ?? null,
        directory: directoryForPath(file.path),
      })),
    ),
    seed_slices: plan.slices.map((slice) => ({
      id: slice.id,
      display_name: slice.displayName,
      title: slice.title,
      lane: slice.lane,
      scope: slice.scope,
      directories: slice.directories,
      file_count: slice.fileCount,
      files: slice.files.map((file) => file.path),
      status_counts: slice.statusCounts,
      sources: slice.sources,
      independence: slice.independence,
      warnings: slice.warnings,
    })),
    warnings: plan.warnings,
  };
}

function validateSplitterProposalAgainstSeed(proposal: AgentPrSplitterPlan, seedPlan: PrSplitPlan): string[] {
  const errors: string[] = [];
  const seedFiles = planFileMap(seedPlan);
  const seedLanes = planFileLaneMap(seedPlan);
  const seenFiles = new Map<string, string>();
  const ids = new Set<string>();

  for (const slice of proposal.slices) {
    const id = sanitizeId(slice.id);
    if (!id || id !== slice.id) errors.push(`slice id "${slice.id}" must already be a sanitized id`);
    if (ids.has(slice.id)) errors.push(`duplicate slice id "${slice.id}"`);
    ids.add(slice.id);
    if (slice.files.length > seedPlan.maxFilesPerPr) {
      errors.push(`slice "${slice.id}" has ${slice.files.length} files, above --max-files-per-pr=${seedPlan.maxFilesPerPr}`);
    }
    const lanes = new Set<PrLane | null>();
    for (const rawPath of slice.files) {
      const path = normalizePath(rawPath);
      if (!seedFiles.has(path)) {
        errors.push(`slice "${slice.id}" references unknown file "${rawPath}"`);
        continue;
      }
      const owner = seenFiles.get(path);
      if (owner) errors.push(`file "${path}" appears in both "${owner}" and "${slice.id}"`);
      else seenFiles.set(path, slice.id);
      lanes.add(seedLanes.get(path) ?? null);
    }
    if (lanes.size > 1) {
      errors.push(`slice "${slice.id}" mixes deterministic lanes`);
    } else {
      const expectedLane = [...lanes][0] ?? null;
      if (slice.lane !== expectedLane) errors.push(`slice "${slice.id}" lane must be ${expectedLane ?? "null"} from deterministic evidence`);
    }
  }

  for (const path of seedFiles.keys()) {
    if (!seenFiles.has(path)) errors.push(`file "${path}" is missing from splitter output`);
  }
  for (const slice of proposal.slices) {
    for (const dependency of slice.depends_on) {
      if (dependency === slice.id) errors.push(`slice "${slice.id}" depends on itself`);
      else if (!ids.has(dependency)) errors.push(`slice "${slice.id}" depends on unknown slice "${dependency}"`);
    }
  }
  return errors;
}

function splitterArtifacts(result: PiRunResult, outputDir: string, parsedOutputPath?: string): NonNullable<PrSplitPlan["splitterArtifacts"]> {
  return {
    outputDir,
    sessionId: result.sessionId,
    sessionFile: result.sessionFile,
    systemPromptPath: result.systemPromptPath,
    userPromptPath: result.userPromptPath,
    outputPath: result.outputPath,
    parsedOutputPath,
    dryRun: result.dryRun,
  };
}

function fallbackFromSplitter(seedPlan: PrSplitPlan, artifacts: NonNullable<PrSplitPlan["splitterArtifacts"]>, warning: string): PrSplitPlan {
  return {
    ...seedPlan,
    planningStrategy: "agent",
    splitterApplied: false,
    splitterArtifacts: artifacts,
    warnings: uniqueStrings([...seedPlan.warnings, warning]),
  };
}

function fallbackFromSplitterLaunchError(seedPlan: PrSplitPlan, warning: string): PrSplitPlan {
  return {
    ...seedPlan,
    planningStrategy: "agent",
    splitterApplied: false,
    warnings: uniqueStrings([...seedPlan.warnings, warning]),
  };
}

function applySplitterProposalToPlan(
  seedPlan: PrSplitPlan,
  proposal: AgentPrSplitterPlan,
  artifacts: NonNullable<PrSplitPlan["splitterArtifacts"]>,
  options: Pick<BuildPlanOptions, "branchPrefix" | "sliceCheckCommand" | "supportAssignments">,
): PrSplitPlan {
  const fileMap = planFileMap(seedPlan);
  const supportFileMap = planSupportFileMap(seedPlan);
  const supportAssignments =
    options.supportAssignments ??
    seedPlan.slices.flatMap((slice) => (slice.supportFiles ?? []).map((file) => ({ path: file.path, sliceId: slice.id })));
  const resolvedSupportBySlice = resolveSupportFilesForTargets(proposal.slices, [...supportFileMap.values()], supportAssignments);
  const slicesWithoutCommands: Array<Omit<PrSplitSlice, "commands" | "isolationCommands">> = proposal.slices.map((slice) => {
    const files = slice.files
      .map((file) => fileMap.get(normalizePath(file)))
      .filter((file): file is PrChangedFile => Boolean(file))
      .sort((left, right) => left.path.localeCompare(right.path));
    const pathspecs = files.map((file) => file.path);
    const resolvedSupport = resolvedSupportBySlice.get(slice.id) ?? [];
    const supportFiles = resolvedSupport.map((entry) => entry.file);
    const allSliceFiles = [...files, ...supportFiles];
    let independence = addSupportIndependenceDetails({
      kind: slice.independence_kind,
      verified: false,
      confidence: proposal.confidence >= 0.75 ? "medium" : "low",
      reasons: uniqueStrings([slice.review_focus, slice.pr_body_summary, ...slice.risks]),
      requiredChecks: uniqueStrings([
        "apply this slice to a fresh branch or worktree based on the selected base ref",
        "run configure/build for that isolated slice",
        "run the saved-baseline regression gate or equivalent local PR check",
        "promote to a true independent PR only if the isolated slice passes",
        ...slice.validation_notes,
      ]),
      possibleDependencies: slice.depends_on,
    }, supportFiles);
    if (allSliceFiles.length > seedPlan.maxFilesPerPr) {
      independence = {
        ...independence,
        kind: "needs-merge",
        confidence: "low",
        reasons: uniqueStrings([
          `slice has ${allSliceFiles.length} files including declared support, above --max-files-per-pr=${seedPlan.maxFilesPerPr}`,
          ...independence.reasons,
        ]),
      };
    }
    return {
      id: slice.id,
      displayName: slice.display_name,
      title: slice.title,
      branchName: `${options.branchPrefix.replace(/\/+$/g, "")}/${sanitizeId(slice.id) || "slice"}`,
      lane: slice.lane,
      scope: slice.scope,
      directories: Array.from(new Set(allSliceFiles.map((file) => directoryForPath(file.path)))).sort(),
      fileCount: allSliceFiles.length,
      files,
      pathspecs,
      ...(supportFiles.length > 0
        ? {
            supportFiles,
            supportPathspecs: supportFiles.map((file) => file.path),
          }
        : {}),
      statusCounts: statusCounts(allSliceFiles),
      sources: sliceSources(allSliceFiles),
      independence,
      warnings: [...seedWarningsForFiles(seedPlan, pathspecs), ...resolvedSupport.map(supportWarning)],
    };
  });
  const slices = slicesWithoutCommands.map((slice) => ({
    ...slice,
    commands: commandsForSlice(slice, seedPlan.baseRef, seedPlan.headRef),
    isolationCommands: isolationCommandsForSlice(slice, {
      repoRoot: seedPlan.repoRoot,
      baseRef: seedPlan.baseRef,
      headRef: seedPlan.headRef,
      sliceCheckCommand: options.sliceCheckCommand,
    }),
  }));
  return {
    ...seedPlan,
    planningStrategy: "agent",
    splitterApplied: true,
    splitterRationale: proposal.rationale,
    splitterConfidence: proposal.confidence,
    splitterArtifacts: artifacts,
    slices,
    warnings: uniqueStrings([...seedPlan.warnings, ...proposal.warnings]),
  };
}

function recordPrSplitterCycle(globals: GlobalArgs, runId: string, result: PiRunResult): void {
  if (!runId) return;
  const store = openState(globals.stateDir);
  try {
    addPiSession({
      store,
      runId,
      role: "pr-splitter",
      sessionId: result.sessionId,
      sessionFile: result.sessionFile,
      provider: globals.provider,
      model: globals.model,
      thinkingLevel: globals.thinkingLevel,
      status: result.failed || result.providerError ? "failed" : result.dryRun ? "dry_run" : "succeeded",
      outputPath: result.outputPath,
    });
  } finally {
    store.db.close();
  }
}

async function applyPrSplitterStrategy(params: {
  globals: GlobalArgs;
  args: Map<string, string | true>;
  plan: PrSplitPlan;
  branchPrefix: string;
  sliceCheckCommand: string;
  supportAssignments?: PrSupportAssignment[];
  runner?: PrSplitterAgentRunner;
}): Promise<PrSplitPlan> {
  if ((params.supportAssignments?.length ?? 0) > 0) {
    return {
      ...params.plan,
      planningStrategy: "agent",
      splitterApplied: false,
      warnings: uniqueStrings([
        ...params.plan.warnings,
        "Agent regrouping skipped because explicit support-file ownership is pinned to deterministic slice provenance.",
      ]),
    };
  }
  const outputDirArg = stringArg(params.args, "--agent-output-dir", "");
  const outputDir = outputDirArg ? resolve(params.globals.repoRoot, outputDirArg) : resolve(params.globals.stateDir, "pr_splitter", artifactTimestamp());
  await mkdir(outputDir, { recursive: true });
  const context = splitterContextFromPlan(params.plan);
  const runId = stringArg(params.args, "--run-id", "");
  let result: PiRunResult;
  try {
    result = await (params.runner ?? runPiAgent)({
      role: "pr-splitter",
      cwd: params.globals.repoRoot,
      prompt: prSplitterPrompt({
        splitContext: context,
        repoRoot: params.globals.repoRoot,
        stateDir: params.globals.stateDir,
        game: gameMetadata(params.globals),
      }),
      outputDir,
      dryRun: params.globals.dryRunAgents,
      provider: params.globals.provider,
      model: params.globals.model,
      thinkingLevel: params.globals.thinkingLevel,
      timeoutMs: params.globals.agentTimeoutSeconds ? params.globals.agentTimeoutSeconds * 1000 : undefined,
      toolContext: {
        repoRoot: params.globals.repoRoot,
        stateDir: params.globals.stateDir,
        game: gameMetadata(params.globals),
      },
      kernelContext: createMeleeKernelSpawnContext({
        kind: "pr-split",
        gameId: params.globals.game?.gameId ?? params.globals.gameId,
        sessionId: runId || "pr-split",
        runId: runId || "pr-split",
        prId: runId || "manual",
        phase: "pr-split",
        workingDir: params.globals.repoRoot,
        metadata: {
          branchPrefix: params.branchPrefix,
          sliceCheckCommand: params.sliceCheckCommand,
          totalFiles: params.plan.totalFiles,
        },
      }),
    });
  } catch (error) {
    return fallbackFromSplitterLaunchError(params.plan, `PR splitter could not start; deterministic plan retained (${error instanceof Error ? error.message : String(error)}).`);
  }
  recordPrSplitterCycle(params.globals, runId, result);
  const parsedOutputPath = resolve(outputDir, "agent_plan.json");
  const artifacts = splitterArtifacts(result, outputDir, parsedOutputPath);
  if (result.dryRun) {
    await writeFile(parsedOutputPath, `${JSON.stringify({ dry_run: true, context }, null, 2)}\n`);
    return fallbackFromSplitter(params.plan, artifacts, "PR splitter dry run wrote prompt artifacts; deterministic plan retained.");
  }
  if (result.failed || result.providerError) {
    await writeFile(parsedOutputPath, `${JSON.stringify({ error: result.error ?? result.providerError ?? "unknown failure" }, null, 2)}\n`);
    return fallbackFromSplitter(params.plan, artifacts, `PR splitter failed; deterministic plan retained (${result.error ?? result.providerError ?? "unknown failure"}).`);
  }
  const parsed = parseJsonObject(result.rawText);
  if (!parsed.object) {
    await writeFile(parsedOutputPath, `${JSON.stringify({ parse_error: parsed.error ?? "unknown parse error" }, null, 2)}\n`);
    return fallbackFromSplitter(params.plan, artifacts, `PR splitter output was not parseable JSON; deterministic plan retained (${parsed.error ?? "unknown parse error"}).`);
  }
  const validated = validatePrSplitterPlan(parsed.object);
  const semanticErrors = validated.plan ? validateSplitterProposalAgainstSeed(validated.plan, params.plan) : [];
  await writeFile(
    parsedOutputPath,
    `${JSON.stringify(
      {
        parsed: parsed.object,
        schema_errors: validated.errors,
        semantic_errors: semanticErrors,
      },
      null,
      2,
    )}\n`,
  );
  if (!validated.plan) {
    return fallbackFromSplitter(params.plan, artifacts, `PR splitter output failed schema validation; deterministic plan retained (${validated.errors.join("; ")}).`);
  }
  if (semanticErrors.length > 0) {
    return fallbackFromSplitter(params.plan, artifacts, `PR splitter output violated deterministic invariants; deterministic plan retained (${semanticErrors.join("; ")}).`);
  }
  return applySplitterProposalToPlan(params.plan, validated.plan, artifacts, {
    branchPrefix: params.branchPrefix,
    sliceCheckCommand: params.sliceCheckCommand,
    supportAssignments: params.supportAssignments,
  });
}

function parseNameStatus(output: string): RawChangedFile[] {
  const fields = splitZ(output);
  const changes: RawChangedFile[] = [];
  for (let index = 0; index < fields.length; ) {
    const status = fields[index++] ?? "";
    if (!status) continue;
    if (status.startsWith("R") || status.startsWith("C")) {
      const oldPath = fields[index++] ?? "";
      const path = fields[index++] ?? "";
      changes.push({ path, oldPath, status, source: "branch" });
    } else {
      const path = fields[index++] ?? "";
      changes.push({ path, status, source: "branch" });
    }
  }
  return changes;
}

function parsePorcelainStatus(output: string, includeUntracked: boolean): RawChangedFile[] {
  const fields = splitZ(output);
  const changes: RawChangedFile[] = [];
  for (let index = 0; index < fields.length; ) {
    const entry = fields[index++] ?? "";
    if (entry.length < 4) continue;
    const status = entry.slice(0, 2);
    const path = entry.slice(3);
    if (status === "??" && !includeUntracked) continue;
    if (status.includes("R") || status.includes("C")) {
      const oldPath = fields[index++] ?? "";
      changes.push({ path, oldPath, status, source: "worktree" });
    } else {
      changes.push({ path, status, source: "worktree" });
    }
  }
  return changes;
}

async function git(repoRoot: string, args: string[], failureHint: string): Promise<string> {
  const result = await runCommand(repoRoot, ["git", ...args]);
  if (result.exitCode !== 0) {
    throw new Error(`${failureHint}\nCommand: git ${args.join(" ")}\n${result.stderr || result.stdout}`);
  }
  return result.stdout;
}

async function collectChanges(options: {
  repoRoot: string;
  baseRef: string;
  includeBranchDiff: boolean;
  includeWorktree: boolean;
  includeUntracked: boolean;
}): Promise<{ changes: RawChangedFile[]; currentBranch: string; headRef: string; warnings: string[] }> {
  const currentBranch = (await git(options.repoRoot, ["branch", "--show-current"], "Unable to read the current branch.")).trim() || "(detached)";
  const headRef = (await git(options.repoRoot, ["rev-parse", "--verify", "HEAD"], "Unable to read HEAD.")).trim();
  const changes: RawChangedFile[] = [];
  const warnings: string[] = [];

  if (options.includeBranchDiff) {
    const diff = await git(
      options.repoRoot,
      ["diff", "--name-status", "-z", "--find-renames", `${options.baseRef}...HEAD`],
      `Unable to diff against ${options.baseRef}. Fetch or pass --base-ref <ref>.`,
    );
    changes.push(...parseNameStatus(diff));
  }

  if (options.includeWorktree) {
    const status = await git(
      options.repoRoot,
      ["status", "--porcelain=v1", "-z", options.includeUntracked ? "--untracked-files=all" : "--untracked-files=no"],
      "Unable to inspect worktree status.",
    );
    changes.push(...parsePorcelainStatus(status, options.includeUntracked));
  }

  if (!options.includeBranchDiff) warnings.push("Branch diff was skipped; the plan only reflects worktree status.");
  if (!options.includeWorktree) warnings.push("Worktree status was skipped; the plan only reflects committed branch changes.");

  // Tooling scratch files (decomp-permuter work copies) are never plan
  // content, even when they leak into the index or a commit.
  const scratch = changes.filter((change) => SCRATCH_FILE_PATTERN.test(change.path));
  if (scratch.length > 0) {
    warnings.push(`Excluded ${scratch.length} permuter scratch file(s) (.permute-*) from the plan: ${scratch.map((change) => change.path).join(", ")}`);
  }
  return { changes: changes.filter((change) => !SCRATCH_FILE_PATTERN.test(change.path)), currentBranch, headRef, warnings };
}

function renderFileLine(file: PrChangedFile): string {
  const status = file.statuses.join("+");
  const rename = file.oldPath ? ` (from ${file.oldPath})` : "";
  const sources = file.sources.length > 1 ? ` [${file.sources.join(", ")}]` : "";
  return `- ${status} ${file.path}${rename}${sources}`;
}

export function renderPrSplitPlan(plan: PrSplitPlan): string {
  const lines: string[] = [
    "# PR Split Plan",
    "",
    `Repo: ${plan.repoRoot}`,
    `Base: ${plan.baseRef}`,
    `Source: ${plan.currentBranch} @ ${plan.headRef}`,
    `Grouping: ${plan.groupMode}`,
    `Files: ${plan.totalFiles}`,
    `Slices: ${plan.slices.length}`,
    `Max files per PR: ${plan.maxFilesPerPr} (hard ceiling, not a target — pack slices for easy review without producing a pile of PRs)`,
    `Planning strategy: ${plan.planningStrategy}${plan.splitterApplied ? " (splitter applied)" : ""}`,
  ];

  if (plan.splitterRationale) {
    lines.push(`Splitter rationale: ${plan.splitterRationale}`);
  }

  if (plan.lanesApplied) {
    const matchSlices = plan.slices.filter((slice) => slice.lane === "match").length;
    const localSlices = plan.slices.filter((slice) => slice.lane === "local").length;
    lines.push(
      `Lanes: ${matchSlices} match slice(s) ship, ${localSlices} local-only slice(s) stay on the branch. Only exact matches that survived the full build and regression gate go into PRs; improvements and other local work ship later, when they become matches.`,
    );
    if (plan.shipFilterApplied) {
      lines.push("Ship filter: match slices contain only files that survived ship-set verification; files the survivor loop dropped ride the local lane.");
    }
  }

  if (plan.warnings.length > 0) {
    lines.push("", "Warnings:");
    for (const warning of plan.warnings) lines.push(`- ${warning}`);
  }

  if (plan.slices.length === 0) {
    lines.push("", "No changed files were found for the selected branch/worktree scope.");
    return lines.join("\n");
  }

  lines.push(
    "",
    "Patch workflow assumes the full source branch is committed at the Source SHA above. Run each slice from a fresh branch based on Base.",
  );

  plan.slices.forEach((slice, index) => {
    lines.push(
      "",
      `## ${index + 1}. ${slice.displayName} (${slice.fileCount} ${slice.fileCount === 1 ? "file" : "files"})`,
      "",
      `Scope: ${slice.scope}`,
      ...(slice.lane ? [`Lane: ${slice.lane}`] : []),
      `Branch: ${slice.branchName}`,
      `Title: ${slice.title}`,
      `Directories: ${slice.directories.join(", ")}`,
      `Sources: ${slice.sources.join(", ")}`,
      `Statuses: ${Object.entries(slice.statusCounts)
        .map(([status, count]) => `${status}:${count}`)
        .join(", ")}`,
      `Independence: ${slice.independence.kind} (${slice.independence.verified ? "verified" : "unverified"}, confidence: ${slice.independence.confidence})`,
    );
    lines.push("Independence reasons:");
    for (const reason of slice.independence.reasons) lines.push(`- ${reason}`);
    if (slice.independence.possibleDependencies.length > 0) {
      lines.push(`Possible dependencies: ${slice.independence.possibleDependencies.join(", ")}`);
    }
    lines.push("Required checks:");
    for (const check of slice.independence.requiredChecks) lines.push(`- ${check}`);
    if (slice.warnings.length > 0) {
      lines.push("Warnings:");
      for (const warning of slice.warnings) lines.push(`- ${warning}`);
    }
    lines.push("Files:");
    for (const file of slice.files) lines.push(renderFileLine(file));
    if ((slice.supportFiles?.length ?? 0) > 0) {
      lines.push("Support files:");
      for (const file of slice.supportFiles ?? []) lines.push(renderFileLine(file));
    }
    lines.push("Commands:");
    for (const command of slice.commands) lines.push(`  ${command}`);
    lines.push("Isolation check:");
    for (const command of slice.isolationCommands) lines.push(`  ${command}`);
  });

  return lines.join("\n");
}

async function laneSetsFromCheckpoint(path: string): Promise<PrLaneSets> {
  const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
  const payload = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  const matchPaths: string[] = [];
  const improvementPaths: string[] = [];
  for (const value of Array.isArray(payload.items) ? payload.items : []) {
    const item = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
    const sourcePath = typeof item.sourcePath === "string" ? item.sourcePath : typeof item.source_path === "string" ? item.source_path : "";
    if (!sourcePath) continue;
    if (item.disposition === "pr_candidate") matchPaths.push(sourcePath);
    else if (item.disposition === "improvement_candidate") improvementPaths.push(sourcePath);
  }
  return { matchPaths, improvementPaths };
}

async function supportAssignmentsFromMap(path: string): Promise<PrSupportAssignment[]> {
  const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
  const payload = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  if (!payload || !Array.isArray(payload.assignments)) {
    throw new Error(`Support map ${path} must be a JSON object with an assignments array.`);
  }
  return payload.assignments.map((value, index) => {
    const assignment = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
    const assignmentPath = typeof assignment?.path === "string" ? normalizePath(assignment.path) : "";
    const sliceId =
      typeof assignment?.slice_id === "string"
        ? assignment.slice_id.trim()
        : typeof assignment?.sliceId === "string"
          ? assignment.sliceId.trim()
          : "";
    if (!assignmentPath || !sliceId) {
      throw new Error(`Support map ${path} assignment ${index + 1} requires non-empty path and slice_id (or sliceId) strings.`);
    }
    const reason = typeof assignment?.reason === "string" ? assignment.reason.trim() : "";
    return { path: assignmentPath, sliceId, ...(reason ? { reason } : {}) };
  });
}

export async function prSplitPlan(globals: GlobalArgs, args: Map<string, string | true>): Promise<void> {
  const baseRef = stringArg(args, "--base-ref", globals.game?.baseRef ?? "origin/master");
  const maxFilesPerPr = numberArg(args, "--max-files-per-pr", globals.game?.pr.maxFilesPerPr ?? 30);
  if (!Number.isInteger(maxFilesPerPr) || maxFilesPerPr < 1) {
    throw new Error("--max-files-per-pr must be a positive integer");
  }
  const minFilesPerPr = numberArg(args, "--min-files-per-pr", 4);
  if (!Number.isInteger(minFilesPerPr) || minFilesPerPr < 1 || minFilesPerPr > maxFilesPerPr) {
    throw new Error("--min-files-per-pr must be a positive integer no larger than --max-files-per-pr");
  }
  const groupMode = stringArg(args, "--group-mode", globals.game?.pr.groupMode ?? "melee-subsystem");
  if (groupMode !== "melee-subsystem" && groupMode !== "top-dir") {
    throw new Error("--group-mode must be melee-subsystem or top-dir");
  }
  const planningStrategy = stringArg(args, "--strategy", globals.game?.pr.splitStrategy ?? "deterministic");
  if (planningStrategy !== "deterministic" && planningStrategy !== "agent") {
    throw new Error("--strategy must be deterministic or agent");
  }

  const branchPrefix = stringArg(args, "--branch-prefix", globals.game?.pr.branchPrefix ?? "pr-split");
  const titlePrefix = stringArg(args, "--title-prefix", globals.game?.pr.titlePrefix ?? "Melee decomp");
  const sliceCheckCommand = stringArg(args, "--slice-check-command", "python3 configure.py --require-protos --wrapper build/tools/wibo && ninja changes_all");
  const includeBranchDiff = !booleanArg(args, "--worktree-only");
  const includeWorktree = !booleanArg(args, "--committed-only");
  const includeUntracked = !booleanArg(args, "--no-untracked");
  const checkpointPath = stringArg(args, "--checkpoint", "");
  let lanes = checkpointPath ? await laneSetsFromCheckpoint(resolve(checkpointPath)) : null;
  const supportMapArg = stringArg(args, "--support-map", "");
  const supportAssignments = supportMapArg
    ? await supportAssignmentsFromMap(resolve(globals.repoRoot, supportMapArg))
    : undefined;

  // The regression report is the build-level truth for what the branch ships:
  // every new exact match belongs in the match lane even when this run's
  // worker_state rows don't cover it (work from earlier cycles, manual fixes).
  // Improvements above the promotion floors are tagged so the local-only lane
  // can name them, but they never ship.
  // The ship-set verification verdict: when present, match slices are
  // restricted to the files that survived the survivor loop; dropped files
  // are demoted to the local lane with their drop reasons.
  const shipStatusArg = stringArg(args, "--ship-status", "");
  let shipFilter: PrShipFilter | null = null;
  if (shipStatusArg) {
    const parsed = JSON.parse(await readFile(resolve(globals.repoRoot, shipStatusArg), "utf8")) as unknown;
    const payload = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    const shippedPaths = (Array.isArray(payload.shippedFiles) ? payload.shippedFiles : []).filter((value): value is string => typeof value === "string");
    const droppedRaw = payload.droppedFiles && typeof payload.droppedFiles === "object" && !Array.isArray(payload.droppedFiles) ? (payload.droppedFiles as Record<string, unknown>) : {};
    const droppedReasons: Record<string, string[]> = {};
    for (const [path, reasons] of Object.entries(droppedRaw)) {
      droppedReasons[path] = (Array.isArray(reasons) ? reasons : []).filter((value): value is string => typeof value === "string");
    }
    if (shippedPaths.length === 0 && Object.keys(droppedReasons).length === 0) {
      throw new Error(`--ship-status ${shipStatusArg} has no shippedFiles or droppedFiles; run ship-set verification first or drop the flag.`);
    }
    shipFilter = { shippedPaths, droppedReasons };
  }

  const reportChangesArg = stringArg(args, "--report-changes", "");
  if (reportChangesArg) {
    const report = await readRegressionReport(resolve(globals.repoRoot, reportChangesArg), "pr split plan lanes", 0);
    const minGainPoints = globals.game?.pr.improvementMinGainPoints ?? 2;
    const minMatchedBytes = globals.game?.pr.improvementMinMatchedBytes ?? 64;
    const merged = lanes ?? { matchPaths: [], improvementPaths: [] };
    for (const entry of report.newMatches) {
      if (entry.sourcePath) merged.matchPaths.push(entry.sourcePath);
    }
    for (const entry of report.improvements) {
      if (!entry.sourcePath) continue;
      if (entry.toPercent - entry.fromPercent >= minGainPoints && entry.bytesDelta >= minMatchedBytes) {
        merged.improvementPaths.push(entry.sourcePath);
      }
    }
    lanes = merged;
  }

  const collected = await collectChanges({
    repoRoot: globals.repoRoot,
    baseRef,
    includeBranchDiff,
    includeWorktree,
    includeUntracked,
  });
  let plan = buildPrSplitPlanFromChanges(collected.changes, {
    repoRoot: globals.repoRoot,
    baseRef,
    headRef: collected.headRef,
    currentBranch: collected.currentBranch,
    groupMode,
    maxFilesPerPr,
    minFilesPerPr,
    branchPrefix,
    titlePrefix,
    sliceCheckCommand,
    planningStrategy,
    lanes,
    shipFilter,
    warnings: collected.warnings,
    supportAssignments,
  });
  if (planningStrategy === "agent" && plan.slices.length > 0) {
    plan = await applyPrSplitterStrategy({ globals, args, plan, branchPrefix, sliceCheckCommand, supportAssignments });
  }
  // The output file is always the human-readable plan; --json only changes
  // what stdout carries so callers can parse slice/lane data.
  const outputPath = args.get("--output");
  if (typeof outputPath === "string") {
    await writeFile(resolve(globals.repoRoot, outputPath), `${renderPrSplitPlan(plan)}\n`);
  }
  console.log(booleanArg(args, "--json") ? JSON.stringify(plan, null, 2) : renderPrSplitPlan(plan));
}
