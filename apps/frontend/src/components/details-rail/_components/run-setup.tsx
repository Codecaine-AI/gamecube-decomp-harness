import {
  text,
  type FormState,
} from "@/lib/format";
import {
  workerTimeoutMinutes,
  workerTimeoutSecondsFromMinutes,
} from "@/lib/workerConfig";
import {
  Field,
  SelectField,
} from "@/components/primitives";
import {
  schedulingForWorkers,
  workerCountOptions,
} from "@/pages/workspace/_lib/model";
import type {
  CycleView,
} from "@/pages/workspace/_lib/types";

import {
  ConfigCard,
  twoColumnConfigFieldClass,
} from "./config-card";

const providerOptions = ["codex-lb"] as const;
const modelOptions = ["gpt-5.6-sol", "gpt-5.6-terra"] as const;
const sandboxProfileOptions = [
  { label: "2 cores", value: "2-core" },
  { label: "4 cores", value: "4-core" },
] as const;

export function runSetupSummary(view: CycleView): string {
  const baselineStatus = text(view.prepareState.baseline.status);
  return view.prepareState.readyToStartRun
    ? "ready to start"
    : view.prepareState.baselineDone
      ? "baseline ready"
      : baselineStatus === "failed"
        ? "baseline failed"
        : "baseline pending";
}

export function RunSetupSection({
  form,
  setForm,
}: {
  form: FormState;
  setForm: (updates: Partial<FormState>) => void;
  view: CycleView;
}) {
  const timeoutMinutes = workerTimeoutMinutes(form.agentTimeoutSeconds);
  return (
    <div className="grid gap-3 p-3">
      <div className="grid gap-3">
        <ConfigCard label="Worker Config">
          <div className="grid gap-2">
            <div className="grid grid-cols-1 gap-2">
              <SelectField
                className={twoColumnConfigFieldClass}
                label="Num workers"
                onChange={(event) =>
                  setForm(
                    schedulingForWorkers(Number(event.currentTarget.value)),
                  )
                }
                options={[...workerCountOptions]}
                value={form.maxWorkers}
              />
              <Field
                className={twoColumnConfigFieldClass}
                label="Timeout (min)"
                min={1}
                onChange={(event) =>
                  setForm({
                    agentTimeoutSeconds:
                      workerTimeoutSecondsFromMinutes(
                        event.currentTarget.value,
                      ),
                  })
                }
                step={1}
                type="number"
                value={timeoutMinutes}
              />
              <SelectField
                className={twoColumnConfigFieldClass}
                label="Sandbox"
                onChange={(event) => setForm({ sandboxProfile: event.currentTarget.value })}
                options={sandboxProfileOptions}
                value={form.sandboxProfile}
              />
            </div>
          </div>
        </ConfigCard>
        <ConfigCard label="Worker Agent">
          <div className="grid grid-cols-1 gap-2">
            <SelectField
              className={twoColumnConfigFieldClass}
              label="Provider"
              onChange={(event) => setForm({ provider: event.currentTarget.value })}
              options={providerOptions}
              value={form.provider}
            />
            <SelectField
              className={twoColumnConfigFieldClass}
              label="Model"
              onChange={(event) => setForm({ model: event.currentTarget.value })}
              options={modelOptions}
              value={form.model}
            />
            <SelectField
              className={twoColumnConfigFieldClass}
              label="Thinking"
              onChange={(event) => setForm({ thinkingLevel: event.currentTarget.value })}
              options={["xhigh", "high", "medium", "low"]}
              value={form.thinkingLevel}
            />
          </div>
        </ConfigCard>
      </div>
    </div>
  );
}
