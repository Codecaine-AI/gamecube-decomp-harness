import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { openKnowledgeStore } from "../storage/store.js";
import { openKnowledgeIndexDb } from "../index/db.js";
import { rebuildSearchIndexes } from "../index/rebuild.js";
import { createEmptyPrArchive, createPastPrsArchive } from "../index/pr-archive.js";
import { importPrs } from "./prs.js";
import { importDiscord } from "./discord.js";
import { importWiki } from "./wiki.js";
import { configuredSourcePath, loadGameSources, sourceConfigPath } from "./source-config.js";
import { runSourcePipeline, type SourceAdapter, type SourceDefinition, type SourcePipelineOptions } from "./source-pipeline.js";

function files(root: string, prefix = ""): string[] {
  return readdirSync(join(root, prefix), { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const path = join(prefix, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Capture contains a symlink: ${path}`);
    return entry.isDirectory() ? files(root, path) : entry.isFile() ? [path] : [];
  });
}
export interface GameSourcePipelineOptions {
  gameId: string;
  gameRoot: string;
  knowledgeRoot: string;
  stateRoot: string;
  operationId: string;
  mode: "bootstrap" | "sync";
  /** Network acquisition is supplied by the caller; absent adapters only capture existing mirrors. */
  acquisitionAdapters?: Record<string, NonNullable<SourceAdapter["acquisition"]>>;
  runCommand?: (command: string[], cwd: string) => Promise<void>;
}
/** Captures local mirrors immutably, imports archival records, and builds local FTS.
 * Network refresh and semantic curation are separate adapter capabilities.
 */
export async function runGameSourcePipeline(options: GameSourcePipelineOptions) {
  const sources = loadGameSources(options.gameRoot, options.gameId);
  sourceConfigPath(options.gameRoot, relative(options.gameRoot, options.knowledgeRoot));
  mkdirSync(options.knowledgeRoot, { recursive: true });
  const ownerPath = join(options.knowledgeRoot, "source-owner.json");
  const owner = JSON.stringify({ game_id: options.gameId });
  if (existsSync(ownerPath)) {
    if (JSON.parse(readFileSync(ownerPath, "utf8")).game_id !== options.gameId) throw new Error("Knowledge source store belongs to another game");
  } else writeFileSync(ownerPath, owner, { flag: "wx" });
  for (const kind of ["pr", "discord", "wiki"]) {
    if (sources.filter(source => source.configuration.enabled && source.identity.kind === kind).length > 1) {
      throw new Error(`Multiple ${kind} sources need namespaced archival storage before import`);
    }
  }
  const adapters: SourcePipelineOptions["adapters"] = {};
  const evidenceRoot = join(options.stateRoot, "source-captures", options.gameId);
  const captureRoot = (source: SourceDefinition, manifest: string) => {
    if (!/^[a-f0-9]{64}$/.test(manifest)) throw new Error("Invalid immutable capture manifest identity");
    return join(evidenceRoot, source.identity.source_id, manifest);
  };
  for (const source of sources) {
    const key = `${source.configuration.adapter}@${source.configuration.adapter_version}`;
    const supported = { pr: "github-prs@1", discord: "discord-cli@1", wiki: "mediawiki@1" };
    if (key !== supported[source.identity.kind] && key !== "local-mirror@1") continue;
    adapters[key] = {
      acquisition: options.acquisitionAdapters?.[key] ?? (async ({ source }) => {
        const root = configuredSourcePath(options.gameRoot, source, "capture_root");
        const upstreamRefresh = source.configuration.adapter !== "local-mirror";
        if (upstreamRefresh) {
          const script = configuredSourcePath(options.gameRoot, source, "acquisition_script");
          const command = ["python3", script];
          if (source.identity.kind === "pr") {
            command.push("--repo", source.identity.upstream, "--dump-root", root, "--postmortem-mode", "off", "--fetch-jobs", "4", "--activity", "updated", "--refresh-existing");
            if (options.mode === "bootstrap") command.push("--all-prs");
          } else if (source.identity.kind === "discord") {
            command.push("--source-root", dirname(dirname(root)), "--config", configuredSourcePath(options.gameRoot, source, "channels_config"), "--raw-root", root);
            if (options.mode === "bootstrap") command.push("--bootstrap");
          } else return { status: "unavailable", reason: "Network wiki acquisition is not implemented; configure local-mirror with an explicit export" };
          await (options.runCommand ?? runSourceCommand)(command, options.gameRoot);
        }
        if (!existsSync(root)) return { status: "unavailable", reason: `Capture input is missing: ${root}` };
        const hashes: Record<string, string> = {};
        for (const path of files(root)) hashes[path] = createHash("sha256").update(readFileSync(join(root, path))).digest("hex");
        if (source.identity.kind === "wiki" && !Object.hasOwn(hashes, "index.jsonl")) return { status: "unavailable", reason: "Wiki mirror is missing index.jsonl" };
        const channelConfig = source.identity.kind === "discord" ? configuredSourcePath(options.gameRoot, source, "channels_config") : undefined;
        if (channelConfig) hashes["_channels.json"] = createHash("sha256").update(readFileSync(channelConfig)).digest("hex");
        const completenessPath = join(root, "capture-manifest.json");
        const completeness = existsSync(completenessPath) ? JSON.parse(readFileSync(completenessPath, "utf8")) : undefined;
        const authoritativeEmpty = completeness?.complete === true && completeness?.item_count === 0
          && completeness?.identity?.game_id === source.identity.game_id
          && completeness?.identity?.source_id === source.identity.source_id
          && completeness?.identity?.upstream === source.identity.upstream;
        if (source.identity.kind === "pr") {
          const prsRoot = sourceConfigPath(root, String(source.configuration.scope.prs_subdir ?? "."));
          const prs = existsSync(prsRoot) ? readdirSync(prsRoot, { withFileTypes: true }).filter(entry => entry.isDirectory() && /^pr-\d+$/.test(entry.name)) : [];
          if (!prs.length && !authoritativeEmpty) return { status: "unavailable", reason: "PR capture has no records or authoritative empty manifest" };
          for (const pr of prs) {
            if (!existsSync(join(prsRoot, pr.name, "raw/pr.json")) && !existsSync(join(prsRoot, pr.name, "counts.json"))) return { status: "unavailable", reason: `Incomplete PR capture: ${pr.name}` };
          }
        }
        if (source.identity.kind === "discord") {
          const channels = JSON.parse(readFileSync(channelConfig!, "utf8")).channels?.filter((channel: { enabled?: boolean }) => channel.enabled !== false) ?? [];
          if (!channels.length && !authoritativeEmpty) return { status: "unavailable", reason: "Discord capture has no configured channels or authoritative empty manifest" };
          for (const channel of channels) {
            const exports = Object.keys(hashes).filter(path => path.startsWith(`${channel.id}/`) && /\/\d{4}-\d{2}\.jsonl$/.test(path));
            const hasMessages = exports.some(path => readFileSync(join(root, path), "utf8").trim().length > 0);
            if (!hasMessages && !authoritativeEmpty) return { status: "unavailable", reason: `Discord channel ${channel.id} has no messages or authoritative empty manifest` };
          }
        }
        const manifest = createHash("sha256").update(JSON.stringify([source.identity, hashes])).digest("hex");
        const destination = captureRoot(source, manifest);
        if (!existsSync(destination)) {
          mkdirSync(dirname(destination), { recursive: true });
          const staging = `${destination}.tmp`;
          try {
            cpSync(root, join(staging, "data"), { recursive: true });
            if (channelConfig) cpSync(channelConfig, join(staging, "channels.json"));
            const copiedPaths = files(join(staging, "data"));
            if (JSON.stringify(copiedPaths.sort()) !== JSON.stringify(Object.keys(hashes).filter(path => path !== "_channels.json").sort())) throw new Error("Source file set changed during capture");
            // Refuse a mirror changed during copying instead of publishing mixed input.
            for (const [path, expected] of Object.entries(hashes)) {
              const copied = path === "_channels.json" ? join(staging, "channels.json") : join(staging, "data", path);
              if (createHash("sha256").update(readFileSync(copied)).digest("hex") !== expected) throw new Error(`Source changed during capture: ${path}`);
            }
            writeFileSync(join(staging, "manifest.json"), JSON.stringify({ identity: source.identity, content_hashes: hashes }));
            renameSync(staging, destination);
          } finally { rmSync(staging, { recursive: true, force: true }); }
        }
        return { status: "complete", capture: { manifest, content_hashes: hashes, revisions: [], cursor: {}, acquisition_origin: upstreamRefresh ? "upstream" : "local_mirror", upstream_refreshed: upstreamRefresh }, counts: { files: Object.keys(hashes).length } };
      }),
      import: async ({ source, capture }) => {
        if (!capture) throw new Error("Import requires an immutable capture");
        const snapshot = captureRoot(source, capture.manifest);
        const root = join(snapshot, "data");
        const store = openKnowledgeStore({ knowledgeRoot: options.knowledgeRoot });
        try {
          let result;
          if (source.identity.kind === "pr") result = importPrs(store, { prsRoot: sourceConfigPath(root, String(source.configuration.scope.prs_subdir ?? ".")), sourceIdentity: { ...source.identity, kind: "pr" } });
          else if (source.identity.kind === "discord") result = importDiscord(store, { rawRoot: root, channelsConfigPath: join(snapshot, "channels.json") });
          else {
            // A partial wiki download must fail, retaining its old citations and cursor.
            for (const line of readFileSync(join(root, "index.jsonl"), "utf8").split(/\r?\n/).filter(Boolean)) {
              const page = JSON.parse(line);
              if (typeof page.path !== "string" || !existsSync(join(root, "pages", page.path.split("/").at(-1)))) throw new Error(`Missing wiki page: ${page.path}`);
            }
            result = importWiki(store, { dataRoot: root });
          }
          return { status: "complete", counts: { inserted: result.inserted, skipped: result.skipped } };
        } finally { store.close(); }
      },
      search_index: async ({ source, capture }) => {
        if (!capture) throw new Error("Search indexing requires a capture");
        const store = openKnowledgeStore({ knowledgeRoot: options.knowledgeRoot });
        const index = openKnowledgeIndexDb({ knowledgeRoot: options.knowledgeRoot });
        try {
          const archive = source.identity.kind === "pr" ? createPastPrsArchive(join(captureRoot(source, capture.manifest), "data"), source.identity.upstream) : createEmptyPrArchive();
          const result = await rebuildSearchIndexes(store, index, { fts: true, embeddings: false, sources: [source.identity.kind], prArchive: archive });
          return { status: "complete", counts: { indexed: result.fts?.[source.identity.kind] ?? 0 } };
        } finally { index.close(); store.close(); }
      },
    };
  }
  return runSourcePipeline({ ...options, sources, adapters });
}

async function runSourceCommand(command: string[], cwd: string): Promise<void> {
  const child = Bun.spawn(command, { cwd, stdout: "ignore", stderr: "pipe" });
  const timer = setTimeout(() => child.kill("SIGKILL"), 30 * 60 * 1000);
  try {
    const [code, error] = await Promise.all([child.exited, new Response(child.stderr).text()]);
    if (code !== 0) throw new Error(`Source acquisition exited ${code}: ${error.slice(-4000)}`);
  } finally { clearTimeout(timer); }
}
