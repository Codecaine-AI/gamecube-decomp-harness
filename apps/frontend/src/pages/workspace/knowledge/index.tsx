import { PageHeader } from "@/components/primitives";
import type { FormState } from "@/lib/format";
import type { AppRoute } from "@/routing";

import { KnowledgeExplorer } from "./explorer";

export function KnowledgePage({ form, gameName, route }: {
  form: FormState;
  gameName: string;
  route: Extract<AppRoute, { kind: "workspace" }>;
}) {
  return <>
    <PageHeader kicker={gameName} title="Knowledge" />
    <div className="flex min-h-0 flex-1 flex-col">
      <KnowledgeExplorer game={route.gameId ?? form.gameId} />
    </div>
  </>;
}
