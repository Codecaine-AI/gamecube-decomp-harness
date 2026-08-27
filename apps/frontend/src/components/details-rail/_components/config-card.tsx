import type { ReactNode } from "react";

import { Settings } from "@/icons";

export const twoColumnConfigFieldClass =
  "mb-0 grid grid-cols-[minmax(8rem,0.75fr)_minmax(0,1.25fr)] items-center gap-4 [&>span]:text-[11px] [&>span]:font-semibold [&>span]:tracking-[0.1em] [&>span]:text-soft [&>input]:mt-0 [&>select]:mt-0";

export function ConfigCard({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <section className="grid min-w-0 gap-4 border border-line2 bg-card p-4 text-fg">
      <div className="flex min-w-0 items-center gap-2 text-soft">
        <Settings size={15} />
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs font-bold uppercase tracking-[0.12em] text-fg">
          {label}
        </span>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
