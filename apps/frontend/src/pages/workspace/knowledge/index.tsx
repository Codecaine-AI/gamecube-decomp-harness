import type { FormState } from "@/lib/format";
import type { AppRoute } from "@/routing";

import { KnowledgeBrowser } from "./browser";

export function KnowledgePage({ form, gameName, route }: {
  form: FormState;
  gameName: string;
  route: Extract<AppRoute, { kind: "workspace" }>;
}) {
  return <div className="flex min-h-0 flex-1 flex-col" aria-label={`${gameName} knowledge`}>
    <KnowledgeBrowser game={route.gameId ?? form.gameId} />
  </div>;
}
