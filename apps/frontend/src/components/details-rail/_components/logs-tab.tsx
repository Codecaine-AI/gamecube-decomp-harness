import { asArray, asObject, text, type Dashboard } from "@/lib/format";

import { OperationActivity } from "./operation-activity";

function LogLines({ dashboard }: { dashboard: Dashboard | null }) {
  const logs = asArray(asObject(dashboard?.process).logs).map(asObject).slice(-120);
  if (logs.length === 0) return <pre className="min-h-[360px] max-h-[calc(100vh-132px)] overflow-auto rounded-none border border-line bg-inset p-2 text-soft whitespace-pre-wrap max-[1180px]:max-h-[540px]" />;
  return (
    <pre className="min-h-[360px] max-h-[calc(100vh-132px)] overflow-auto rounded-none border border-line bg-inset p-2 text-soft whitespace-pre-wrap max-[1180px]:max-h-[540px]">
      {logs.map((line, index) => (
        <span key={index}>
          <span className={line.stream === "stderr" ? "text-down" : line.stream === "stdout" ? "text-up/75" : "text-dim"}>[{text(line.stream)}]</span> {text(line.text)}
          {"\n"}
        </span>
      ))}
    </pre>
  );
}

export function OperationLogsTab({ dashboard }: { dashboard: Dashboard | null }) {
  return (
    <section className="p-3">
      <OperationActivity dashboard={dashboard} />
      <LogLines dashboard={dashboard} />
    </section>
  );
}
