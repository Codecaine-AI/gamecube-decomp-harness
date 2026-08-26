const FALLBACK_TRACE_ORIGIN = "http://trace.local";

interface TraceUrlSelection {
  sessionId: string | null;
  traceId: string | null;
  containerId: string | null;
}

export function traceSelectionUrl(currentHref: string, selection: TraceUrlSelection): string {
  const url = new URL(currentHref, FALLBACK_TRACE_ORIGIN);
  const identities = [
    ["sessionId", selection.sessionId],
    ["traceId", selection.traceId],
    ["containerId", selection.containerId],
  ] as const;
  for (const [name, value] of identities) {
    if (value) url.searchParams.set(name, value);
    else url.searchParams.delete(name);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}
