import { clock, type FormState, text } from "@/lib/format";
import { InfoRows, PanelSection, PanelTitle, Pill } from "@/components/primitives";
import { processName } from "@/pages/workspace/_lib/model";
import type { CycleView } from "@/pages/workspace/_lib/types";

export function ProcessCard({ form, view }: { form: FormState; view: CycleView }) {
  const selectedName = processName(form.processName);
  const display = view.process.display;
  return (
    <PanelSection>
      <PanelTitle>Process</PanelTitle>
      <div className="mb-3 flex items-center justify-between gap-2">
        <Pill state={view.process.pillState} />
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-xs text-dim">{text(display.name, selectedName)}</span>
      </div>
      <InfoRows
        rows={[
          ["PID", text(display.pid, "-")],
          ["Started", display.startedAt ? clock(display.startedAt) : "-"],
          ["Exit", String(display.exitCode ?? display.signal ?? "-")],
          ["Run", view.activeCycleLabel],
        ]}
      />
    </PanelSection>
  );
}
