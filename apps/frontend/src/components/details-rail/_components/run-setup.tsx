import { useEffect, useState } from "react";
import { postJson } from "@/lib/api";
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
  workerCountChoices,
} from "@/pages/workspace/_lib/model";
import { RUN_MODEL_OPTIONS } from "@/components/app/_lib/runSettings";
import type {
  HarnessView,
} from "@/pages/workspace/_lib/types";

import {
  ConfigCard,
  twoColumnConfigFieldClass,
} from "./config-card";

const providerOptions = ["codex-lb"] as const;
const sandboxProfileOptions = [
  { label: "2 cores", value: "2-core" },
  { label: "4 cores", value: "4-core" },
] as const;

export function runSetupSummary(view: HarnessView): string {
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
  view,
}: {
  form: FormState;
  setForm: (updates: Partial<FormState>) => void;
  view: HarnessView;
}) {
  const gameId = view.harnessState?.game_id;
  const [revision, setRevision] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const editable = view.runStatus === "ready" && view.harnessState?.state?.execution.desired === "paused";
  // Outside prepared editing, the worker count alone stays live on a ready, active, or paused Run.
  const liveWorkers = !editable && ["ready", "active", "paused"].includes(view.runStatus);
  useEffect(() => {
    setRevision(null);
    if (!gameId || !editable) return;
    let current = true;
    fetch(`/api/run/configuration?gameId=${encodeURIComponent(gameId)}`)
      .then(r => r.json()).then(data => { if (current) setRevision(data.run?.revision ?? null); })
      .catch(() => { if (current) setMessage("Could not load saved settings"); });
    return () => { current = false; };
  }, [gameId, editable]);
  async function saveSettings() {
    setSaving(true);
    try {
      const data = await postJson<{ run: { revision: number } }>("/api/run/configuration", {
        gameId, expectedRevision: revision,
        settings: { desired_workers: Number(form.maxWorkers), agent_timeout_seconds: Number(form.agentTimeoutSeconds),
          provider: form.provider, model: form.model, thinking_level: form.thinkingLevel, sandbox_profile: form.sandboxProfile },
      });
      setRevision(data.run.revision);
      setMessage("Settings saved. Run remains paused.");
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setSaving(false); }
  }
  async function applyWorkers() {
    setSaving(true);
    try {
      const data = await postJson<{ previousDesiredWorkers: number; desiredWorkers: number }>("/api/run/desired-workers", {
        gameId, workers: Number(form.maxWorkers),
      });
      setMessage(`Workers ${data.previousDesiredWorkers} → ${data.desiredWorkers}. The run applies it within seconds.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setSaving(false); }
  }
  const timeoutMinutes = workerTimeoutMinutes(form.agentTimeoutSeconds);
  return (
    <div className="grid gap-3 p-3">
      {editable && <button type="button" disabled={saving || revision === null} onClick={saveSettings} className="rounded border p-2">{saving ? "Saving…" : "Save Worker Settings"}</button>}
      {liveWorkers && <button type="button" disabled={saving || !gameId} onClick={applyWorkers} className="rounded border p-2">{saving ? "Applying…" : "Apply Worker Count"}</button>}
      {message && <p role="status">{message}</p>}
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
                options={workerCountChoices(form.maxWorkers)}
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
              options={RUN_MODEL_OPTIONS}
              value={form.model}
            />
            <SelectField
              className={twoColumnConfigFieldClass}
              label="Thinking"
              onChange={(event) => setForm({ thinkingLevel: event.currentTarget.value })}
              options={["low", "medium", "high", "xhigh", "max"]}
              value={form.thinkingLevel}
            />
          </div>
        </ConfigCard>
      </div>
    </div>
  );
}
