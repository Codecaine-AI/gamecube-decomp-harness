import {
  createDefaultCatalog,
  hashContent,
  type CreateDefaultCatalogOptions,
  type Loader,
  type LoaderCatalog,
  type LoaderResolveContext,
} from "@agent-kernel/kernel/context/loaders";

export const MELEE_SESSION_CONTEXT_LOADER_KIND = "melee-session-context";
export const MELEE_INLINE_CONTEXT_LOADER_KINDS = [
  "worker-packet",
  "knowledge-graph-file-card",
  "integration-conflict-item",
  "integration-queue-summary",
  "pr-index-context",
  "pr-slice-diff",
  "review-lint-findings",
  "pr-fixer-context",
  "standard-examples",
  "pr-split-context",
  "curator-context",
  "reconcile-context",
  "worker-summarizer-context",
  "librarian-v2-context",
  "backfill-librarian-context",
  "qa-repair-item",
  "qa-repair-queue-summary",
] as const;

export interface AppSessionContextLoaderDeclaration {
  kind: typeof MELEE_SESSION_CONTEXT_LOADER_KIND;
  label?: string;
  [key: string]: unknown;
}

export type AppInlineContextLoaderKind = (typeof MELEE_INLINE_CONTEXT_LOADER_KINDS)[number];

export interface AppInlineContextLoaderDeclaration {
  kind: AppInlineContextLoaderKind;
  ref?: string;
  label?: string;
  content?: string;
  [key: string]: unknown;
}

export interface CreateAppLoaderCatalogOptions extends CreateDefaultCatalogOptions {
  includeSessionContextLoader?: boolean;
  includeInlineContextLoaders?: boolean;
}

function renderSessionContext(ctx: LoaderResolveContext): string {
  const appSessionId = typeof ctx.sessionData?.appSessionId === "string"
    ? ctx.sessionData.appSessionId
    : null;
  return JSON.stringify(
    {
      appSessionId,
      containerId: ctx.containerId ?? null,
      activeSessionDir: ctx.activeSessionDir ?? null,
      sessionData: ctx.sessionData ?? null,
    },
    null,
    2,
  );
}

export function createAppSessionContextLoader(): Loader<AppSessionContextLoaderDeclaration> {
  return {
    kind: MELEE_SESSION_CONTEXT_LOADER_KIND,
    async resolve(_decl, ctx) {
      const content = renderSessionContext(ctx);
      return {
        status: content === "{}" ? "empty" : "ok",
        content,
        bytes: Buffer.byteLength(content, "utf8"),
        hash: hashContent(content),
      };
    },
  };
}

export function createAppInlineContextLoader(
  kind: AppInlineContextLoaderKind,
): Loader<AppInlineContextLoaderDeclaration> {
  return {
    kind,
    async resolve(decl) {
      const content = typeof decl.content === "string" ? decl.content : "";
      return {
        status: content ? "ok" : "empty",
        content,
        bytes: Buffer.byteLength(content, "utf8"),
        hash: hashContent(content),
      };
    },
  };
}

export function registerAppLoaders(catalog: LoaderCatalog): LoaderCatalog {
  if (!catalog.has(MELEE_SESSION_CONTEXT_LOADER_KIND)) {
    catalog.register(createAppSessionContextLoader());
  }
  for (const kind of MELEE_INLINE_CONTEXT_LOADER_KINDS) {
    if (!catalog.has(kind)) catalog.register(createAppInlineContextLoader(kind));
  }
  return catalog;
}

export function createAppLoaderCatalog(
  options: CreateAppLoaderCatalogOptions = {},
): LoaderCatalog {
  const catalog = createDefaultCatalog(options);
  if ((options.includeSessionContextLoader ?? true) || (options.includeInlineContextLoaders ?? true)) {
    registerAppLoaders(catalog);
  }
  return catalog;
}
