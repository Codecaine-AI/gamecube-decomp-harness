import { Check, Plus, RotateCcw, Save, X } from "@/icons";
import { Button, CheckboxField, Field, PanelTitle, SelectField } from "@/components/primitives";
import type { StandardRecord } from "@/lib/format";
import {
  STANDARD_DISPOSITION_OPTIONS,
  STANDARD_FAMILY_OPTIONS,
  STANDARD_QA_OPTIONS,
  STANDARD_SEVERITY_OPTIONS,
  STANDARD_STATUS_OPTIONS,
  statusDotClass,
  statusTone,
} from "../shared/standards-model";

export function StandardEditForm({
  draft,
  onRevert,
  onSave,
  onValidate,
  saveError,
  saving,
  setDraft,
  validationErrors,
}: {
  draft: StandardRecord;
  onRevert: () => void;
  onSave: () => void;
  onValidate: () => void;
  saveError: string;
  saving: boolean;
  setDraft: (record: StandardRecord) => void;
  validationErrors: string[];
}) {
  function update(patch: Partial<StandardRecord>) {
    setDraft({ ...draft, ...patch });
  }

  function setList(key: "summary" | "do" | "doNot" | "evidenceRefs" | "qaRuleIds" | "preferredRepairs", items: string[]) {
    update({ [key]: items } as Partial<StandardRecord>);
  }

  return (
    <div className="p-5 lg:p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <PanelTitle className="mb-0">Edit Standard</PanelTitle>
        <span className={`flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] ${statusTone(draft.status)}`}>
          <span className={`h-2 w-2 rounded-full ${statusDotClass(draft.status)}`} />
          {draft.status}
        </span>
      </div>
      <Field label="Id" onChange={(event) => update({ id: event.currentTarget.value })} spellCheck={false} value={draft.id} />
      <Field label="Title" onChange={(event) => update({ title: event.currentTarget.value })} value={draft.title} />
      <StringListField label="Summary" items={draft.summary} onChange={(items) => setList("summary", items)} placeholder="One summary bullet for this standard." />
      <div className="grid grid-cols-2 gap-3 max-[900px]:grid-cols-1">
        <SelectField label="Status" onChange={(event) => update({ status: event.currentTarget.value })} options={STANDARD_STATUS_OPTIONS} value={draft.status} />
        <SelectField label="Family" onChange={(event) => update({ family: event.currentTarget.value || undefined })} options={STANDARD_FAMILY_OPTIONS} value={draft.family ?? ""} />
        <SelectField
          label="Disposition"
          onChange={(event) => update({ disposition: event.currentTarget.value || undefined })}
          options={STANDARD_DISPOSITION_OPTIONS}
          value={draft.disposition ?? ""}
        />
        <SelectField label="Severity" onChange={(event) => update({ severity: event.currentTarget.value || undefined })} options={STANDARD_SEVERITY_OPTIONS} value={draft.severity ?? ""} />
        <SelectField label="QA Enforcement" onChange={(event) => update({ qaEnforcement: event.currentTarget.value || undefined })} options={STANDARD_QA_OPTIONS} value={draft.qaEnforcement ?? ""} />
        <Field label="Retired Into" onChange={(event) => update({ retiredInto: event.currentTarget.value })} spellCheck={false} value={draft.retiredInto ?? ""} />
      </div>
      <CheckboxField checked={draft.workerFacing !== false} label="Worker-facing standard" onChange={(event) => update({ workerFacing: event.currentTarget.checked })} />
      <Field label="Example Policy" onChange={(event) => update({ examplePolicy: event.currentTarget.value })} spellCheck={false} value={draft.examplePolicy ?? ""} />
      <StringListField label="QA rule ids" items={draft.qaRuleIds ?? []} onChange={(items) => setList("qaRuleIds", items)} placeholder="e.g. pointer_offset_arithmetic" mono />
      <StringListField label="Preferred repairs" items={draft.preferredRepairs ?? []} onChange={(items) => setList("preferredRepairs", items)} placeholder="Concrete repair route this standard prefers." />
      <div className="grid gap-4">
        <StringListField label="Preferred signals" items={draft.do} onChange={(items) => setList("do", items)} placeholder="Positive source shape or review signal." />
        <StringListField label="Rejected signals" items={draft.doNot} onChange={(items) => setList("doNot", items)} placeholder="Rejected shortcut or source shape." />
      </div>
      <StringListField label="Evidence refs" items={draft.evidenceRefs} onChange={(items) => setList("evidenceRefs", items)} placeholder="e.g. review_corpus:literal-cleanup" mono />
      {validationErrors.length > 0 ? (
        <ul className="m-0 grid gap-1 p-0 text-xs text-down">
          {validationErrors.map((error) => (
            <li className="list-none" key={error}>
              {error}
            </li>
          ))}
        </ul>
      ) : null}
      {saveError ? <p className="m-0 text-xs text-down">{saveError}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button disabled={saving} icon={<RotateCcw size={13} />} onClick={onRevert} title="Discard edits and reload the saved record." type="button">
          Revert
        </Button>
        <Button disabled={saving} icon={<Check size={13} />} onClick={onValidate} title="Run field validation without saving." type="button">
          Validate
        </Button>
        <Button disabled={saving} icon={<Save size={13} />} onClick={onSave} tone="primary" type="button">
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

function StringListField({
  items,
  label,
  mono = false,
  onChange,
  placeholder,
}: {
  items: string[];
  label: string;
  mono?: boolean;
  onChange: (items: string[]) => void;
  placeholder?: string;
}) {
  function update(index: number, value: string) {
    const next = items.slice();
    next[index] = value;
    onChange(next);
  }

  function remove(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  function add() {
    onChange([...items, ""]);
  }

  return (
    <div className="mb-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-[0.08em] text-dim">{label}</span>
        <Button icon={<Plus size={13} />} onClick={add} title={`Add a ${label} item.`} type="button">
          Add
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="m-0 text-xs text-faint">No items yet. Click Add to create one.</p>
      ) : (
        <div className="grid gap-1.5">
          {items.map((item, index) => (
            <div className="flex items-center gap-1.5" key={index}>
              <input
                className={`min-w-0 flex-1 ${mono ? "font-mono text-[12px]" : "text-[13px]"}`}
                onChange={(event) => update(index, event.currentTarget.value)}
                placeholder={placeholder}
                spellCheck={!mono}
                value={item}
              />
              <button
                className="inline-flex min-h-7 shrink-0 items-center justify-center border border-line2 bg-raised px-1.5 text-dim hover:border-faint hover:text-fg"
                onClick={() => remove(index)}
                title="Remove this item."
                type="button"
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
