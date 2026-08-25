import { useEffect, useRef, useState, type ReactNode } from "react";

import { ChevronDown, ChevronRight } from "@/icons";

export type RailSectionId = "config" | "logs" | "navigator" | "process" | "state";

function storageKey(id: RailSectionId): string {
  return `detailsRail.section.${id}`;
}

function initialOpen(id: RailSectionId, defaultOpen: boolean): boolean {
  try {
    const stored = localStorage.getItem(storageKey(id));
    return stored === null ? defaultOpen : stored !== "1";
  } catch {
    return defaultOpen;
  }
}

function saveOpen(id: RailSectionId, open: boolean): void {
  try {
    localStorage.setItem(storageKey(id), open ? "0" : "1");
  } catch {
    // The disclosure still works if storage is unavailable.
  }
}

export function RailSection({
  children,
  defaultOpen = false,
  hint,
  id,
  label,
  requestOpenNonce,
  scrollOnRequest = false,
}: {
  children: ReactNode;
  defaultOpen?: boolean;
  hint?: ReactNode;
  id: RailSectionId;
  label: string;
  requestOpenNonce?: number;
  scrollOnRequest?: boolean;
}) {
  const [open, setOpen] = useState(() => initialOpen(id, defaultOpen));
  const sectionRef = useRef<HTMLElement>(null);
  const contentId = `details-rail-section-${id}`;

  useEffect(() => {
    if (requestOpenNonce === undefined) return;
    setOpen(true);
    saveOpen(id, true);
    if (scrollOnRequest) {
      requestAnimationFrame(() => sectionRef.current?.scrollIntoView({ block: "nearest" }));
    }
  }, [id, requestOpenNonce, scrollOnRequest]);

  function toggle(): void {
    setOpen((current) => {
      saveOpen(id, !current);
      return !current;
    });
  }

  return (
    <section className="border-b border-line" ref={sectionRef}>
      <button
        aria-controls={contentId}
        aria-expanded={open}
        className="flex min-h-10 w-full items-center justify-between gap-3 bg-panel px-3 py-2 text-left hover:bg-raised"
        onClick={toggle}
        type="button"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-dim">{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</span>
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-soft">
            {label}
          </span>
        </span>
        {hint ? (
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-right text-[10px] font-bold uppercase tracking-[0.08em] text-dim" title={typeof hint === "string" ? hint : undefined}>
            {hint}
          </span>
        ) : null}
      </button>
      {open ? <div className="border-t border-line" id={contentId}>{children}</div> : null}
    </section>
  );
}
