import type { ReactNode } from "react";

export function TabButton({
  active,
  children,
  className = "",
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  className?: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-selected={active}
      className={`min-h-7 border px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${active ? "border-line2 bg-raised text-fg" : "border-line bg-card text-dim hover:border-line2 hover:text-soft"} ${className}`}
      onClick={onClick}
      role="tab"
      type="button"
    >
      {children}
    </button>
  );
}
