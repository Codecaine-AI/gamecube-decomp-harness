import { type ReactNode, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Database, FolderTree, RotateCcw } from "@/icons";
import { Button } from "@/components/primitives";
import { saveStandard } from "@/lib/api";
import {
  type FormState,
  type StandardExampleRecord,
  type StandardRecord,
  type StandardsPayload,
} from "@/lib/format";
import { useStandardsPayload } from "../data/useStandardsPayload";
import { StandardDetail } from "./StandardDetail";
import { StandardEditForm } from "./StandardEditForm";
import { StandardsTree } from "./StandardsTree";
import {
  createStandardDraft,
  groupStandardsByFamily,
  standardSaveEdit,
  validateStandardDraft,
} from "../shared/standards-model";

const EMPTY_RECORDS: StandardRecord[] = [];
const EMPTY_EXAMPLES: StandardExampleRecord[] = [];

function KnowledgeRootsStrip({
  payload,
}: {
  payload: StandardsPayload | null;
}) {
  const roots = payload?.inventory.roots;
  if (!roots) return null;
  const rawItems = [
    {
      icon: <FolderTree size={13} />,
      label: "Knowledge",
      value: roots.projectKnowledgeRoot,
    },
    {
      icon: <FolderTree size={13} />,
      label: "Sources",
      value: roots.sourcesRoot,
    },
    {
      icon: <Database size={13} />,
      label: "Graph",
      value: roots.graphDbPath ?? roots.resourceGraphRoot,
    },
  ];
  const items: Array<{ icon: ReactNode; label: string; value: string }> =
    rawItems.flatMap((item) =>
      item.value ? [{ ...item, value: item.value }] : [],
    );

  return (
    <div className="grid shrink-0 grid-cols-1 gap-px border-b border-line bg-line text-[11px] md:grid-cols-3">
      {items.map((item) => (
        <div
          className="flex min-w-0 items-center gap-2 bg-panel px-3 py-1.5"
          key={item.label}
          title={item.value}
        >
          <span className="shrink-0 text-dim">{item.icon}</span>
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.1em] text-dim">
            {item.label}
          </span>
          <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-soft">
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export function StandardsEditor({ form }: { form: FormState }) {
  const { reload, state } = useStandardsPayload(form);
  const [selectedId, setSelectedId] = useState<string>("");
  const [draft, setDraft] = useState<StandardRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [collapsedFamilies, setCollapsedFamilies] = useState<Set<string>>(
    new Set(),
  );

  const records = state.payload?.records ?? EMPTY_RECORDS;
  const examples = state.payload?.examples ?? EMPTY_EXAMPLES;
  const groups = useMemo(() => groupStandardsByFamily(records), [records]);
  const selected = useMemo(
    () => records.find((record) => record.id === selectedId) ?? null,
    [records, selectedId],
  );
  const editing = draft ?? selected;
  const dirty = draft !== null;
  const selectedExamples = useMemo(
    () =>
      selected
        ? examples.filter((example) => example.standardId === selected.id)
        : EMPTY_EXAMPLES,
    [examples, selected],
  );

  useEffect(() => {
    setSelectedId((current) =>
      current && records.some((record) => record.id === current)
        ? current
        : (records[0]?.id ?? ""),
    );
  }, [records]);

  function toggleFamily(family: string) {
    setCollapsedFamilies((current) => {
      const next = new Set(current);
      if (next.has(family)) next.delete(family);
      else next.add(family);
      return next;
    });
  }

  function selectRecord(id: string) {
    setSelectedId(id);
    setDraft(null);
    setSaveError("");
    setValidationErrors([]);
  }

  function beginEdit() {
    if (selected) setDraft({ ...selected });
  }

  function newRecord() {
    const record = createStandardDraft();
    setDraft(record);
    setSelectedId(record.id);
  }

  function revert() {
    setDraft(null);
    setSaveError("");
    setValidationErrors([]);
  }

  async function save() {
    if (!draft) return;
    const errors = validateStandardDraft(draft);
    setValidationErrors(errors);
    if (errors.length > 0) return;
    setSaving(true);
    setSaveError("");
    try {
      const result = await saveStandard(form, standardSaveEdit(draft));
      if (!result.ok) {
        setValidationErrors(result.errors ?? ["Save failed."]);
        setSaving(false);
        return;
      }
      setDraft(null);
      setSaving(false);
      await reload();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
      setSaving(false);
    }
  }

  if (state.loading) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-xs text-dim">
        Loading standards…
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="max-w-md border border-down/40 bg-card p-4">
          <div className="flex items-start gap-2 text-xs text-down">
            <AlertTriangle className="mt-0.5 shrink-0" size={14} />
            <span className="min-w-0">{state.error}</span>
          </div>
          <div className="mt-3">
            <Button
              icon={<RotateCcw size={13} />}
              onClick={() => void reload()}
              type="button"
            >
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const tree = (
    <StandardsTree
      collapsedFamilies={collapsedFamilies}
      groups={groups}
      onNewRecord={newRecord}
      onSelectRecord={selectRecord}
      onToggleFamily={toggleFamily}
      records={records}
      selectedId={selectedId}
      sourcePath={state.payload?.sourcePath}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {editing && dirty ? (
        <div className="grid min-h-0 flex-1 grid-cols-[340px_minmax(0,1fr)] gap-px bg-line ">
          {tree}
          <div className="min-h-0 overflow-y-auto bg-panel">
            <StandardEditForm
              draft={editing}
              saving={saving}
              saveError={saveError}
              validationErrors={validationErrors}
              onRevert={revert}
              onSave={save}
              onValidate={() =>
                setValidationErrors(validateStandardDraft(editing))
              }
              setDraft={(record) => setDraft(record)}
            />
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[340px_minmax(360px,1fr)] gap-px bg-line">
          {tree}
          {selected ? (
            <div className="min-h-0 overflow-y-auto bg-panel">
              <StandardDetail
                examples={selectedExamples}
                onEdit={beginEdit}
                record={selected}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center bg-panel p-6 text-xs text-dim">
              Select a standard to inspect or edit it.
            </div>
          )}
        </div>
      )}
      {state.payload?.warnings.length ? (
        <div className="shrink-0 border-t border-warn/30 bg-warn/5 px-4 py-1.5 text-[11px] text-warn">
          {state.payload.warnings.join(" ")}
        </div>
      ) : null}
    </div>
  );
}
