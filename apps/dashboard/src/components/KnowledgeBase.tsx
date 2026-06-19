import { useEffect, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  FileCode2,
  Gauge,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Wrench,
  X,
} from "lucide-react";
import {
  num,
  type FormState,
  type StandardExampleRecord,
  type StandardRecord,
  type StandardsPayload,
} from "@decomp-orchestrator/ui-contract";
import { fetchStandards, saveStandard } from "../lib/api";
import { type AppRoute, type StandardsView, STANDARDS_VIEWS } from "../routing";
import { SubNav, PanelSection, PanelTitle, PanelHeader, PageHeader, Button, EmptyState, List, Field, SelectField, CheckboxField, StatCard } from "./primitives";

interface StandardsPageProps {
  form: FormState;
  projectName: string;
  route: Extract<AppRoute, { kind: "workspace" }>;
  onNavigate: (route: AppRoute) => void;
}

// Standards sidebar section. Two top-level tabs: Edit (the editor) and
// Rendered (the effective prompt viewer). Standards used to share a Knowledge
// section with the graph; they're split out now so each is its own sidebar
// destination.
export function StandardsPage({ form, projectName, route, onNavigate }: StandardsPageProps) {
  const activeView: StandardsView = route.standardsView ?? "edit";
  function goToView(view: StandardsView) {
    onNavigate({ kind: "workspace", section: "standards", standardsView: view, projectId: route.projectId });
  }
  return (
    <>
      <PageHeader kicker={projectName} title="Standards" />
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-line bg-card px-4 py-2">
          <SubNav
            items={STANDARDS_VIEWS.map((view) => ({
              active: view.id === activeView,
              id: view.id,
              label: view.label,
              onClick: () => goToView(view.id),
            }))}
          />
        </div>
        {/* The editor is a full-bleed, height-filling surface (its own panes
            scroll); the other sub-views are centered reading columns. */}
        {activeView === "edit" ? (
          <StandardsEditor form={form} />
        ) : (
          <div className="min-h-0 flex-1 overflow-auto">
            <div className="mx-auto grid w-full max-w-7xl gap-4 p-4">
              <RenderedStandardsPanel form={form} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// Knowledge sidebar section. The graph sources and health panel live here on
// their own now that Standards is a separate destination.
export function KnowledgeGraphPage({ form, projectName }: { form: FormState; projectName: string }) {
  return (
    <>
      <PageHeader kicker={projectName} title="Knowledge" />
      <div className="@container grid min-h-0 flex-1 content-start gap-4 overflow-auto p-4">
        <KnowledgeGraphPanel form={form} />
      </div>
    </>
  );
}

interface StandardsState {
  loading: boolean;
  payload: StandardsPayload | null;
  error: string;
}

const STANDARD_STATUS_OPTIONS = ["accepted", "proposed", "superseded", "merged", "workflow_only"];
const STANDARD_FAMILY_OPTIONS = [
  "",
  "authored_source_shape",
  "typed_access_and_pointer_math",
  "asserts_reports_and_header_inlines",
  "literals_data_and_externs",
  "codegen_tactics",
  "names_defines_headers_and_prototypes",
  "pipeline_owned_verification",
];
const STANDARD_DISPOSITION_OPTIONS = ["", "active", "merged", "workflow_only"];
const STANDARD_SEVERITY_OPTIONS = ["", "repair_required", "review_required", "evidence_required", "workflow_context", "workflow_only"];
const STANDARD_QA_OPTIONS = [
  "",
  "hard_lint",
  "hard_lint_plus_warning",
  "partial_hard_lint_plus_warning",
  "partial_hard_lint_plus_repair_hints",
  "partial_lint_plus_pre_ship_review",
  "pre_ship_review",
  "pipeline_owned",
  "pipeline_owned_plus_data_lint",
];

const FAMILY_ORDER = STANDARD_FAMILY_OPTIONS.filter(Boolean);
const FAMILY_LABELS: Record<string, string> = {
  authored_source_shape: "Authored Source",
  typed_access_and_pointer_math: "Typed Access",
  asserts_reports_and_header_inlines: "Asserts & Inlines",
  literals_data_and_externs: "Literals & Data",
  codegen_tactics: "Codegen Tactics",
  names_defines_headers_and_prototypes: "Names & Headers",
  pipeline_owned_verification: "Pipeline Verification",
};

function statusTone(status: string): string {
  if (status === "accepted") return "text-up";
  if (status === "proposed") return "text-warn";
  if (status === "merged") return "text-cyan";
  if (status === "workflow_only") return "text-purple";
  return "text-dim";
}

function statusDotClass(status: string): string {
  if (status === "accepted") return "bg-up";
  if (status === "proposed") return "bg-warn";
  if (status === "merged") return "bg-cyan";
  if (status === "workflow_only") return "bg-purple";
  return "bg-faint";
}

function shortStandardId(id: string): string {
  return id.replace(/^global_standard:/, "");
}

// Format a standard slug ("natural-loops") as a readable title ("Natural Loops"):
// dashes become spaces and each word is capitalized. Used as the list title so
// rows stay short and scannable instead of showing the full prose title.
function prettySlug(id: string): string {
  const slug = shortStandardId(id);
  return slug
    .split("-")
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(" ")
    .trim() || slug || id;
}

function labelize(value: string): string {
  return value
    .replace(/^global_standard:/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function familyLabel(family?: string): string {
  if (!family) return "Unassigned";
  return FAMILY_LABELS[family] ?? labelize(family);
}

// Compact monochrome label:value tag. Reads like a reference doc (LABEL
// value) instead of a row of differently-colored pills, so dense metadata
// stays scannable without competing for attention.
function MetadataChip({ label, value }: { label?: string; value?: string | number | boolean | null }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <span className="inline-flex min-h-[22px] max-w-full items-center gap-1.5 border border-line bg-card px-1.5 py-px text-[10px] leading-snug" title={String(value)}>
      {label ? <span className="uppercase tracking-[0.06em] text-faint">{label}</span> : null}
      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-semibold text-soft">{String(value)}</span>
    </span>
  );
}

function useStandardsPayloadState(form: FormState): StandardsState {
  const [state, setState] = useState<StandardsState>({ loading: true, payload: null, error: "" });
  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, payload: null, error: "" });
    void fetchStandards(form)
      .then((payload) => {
        if (!cancelled) setState({ loading: false, payload, error: "" });
      })
      .catch((error) => {
        if (!cancelled) setState({ loading: false, payload: null, error: error instanceof Error ? error.message : String(error) });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.projectId, form.stateDir, form.repoRoot, form.graphDbPath, form.usePathOverrides]);
  return state;
}

function StandardsLoading({ title }: { title: string }) {
  return (
    <PanelSection>
      <PanelTitle>{title}</PanelTitle>
      <p className="m-0 text-xs text-dim">Loading standards…</p>
    </PanelSection>
  );
}

function StandardsError({ error, title }: { error: string; title: string }) {
  return (
    <PanelSection className="border-down/50">
      <PanelTitle>{title}</PanelTitle>
      <div className="flex items-start gap-2 text-xs text-down">
        <AlertTriangle className="mt-0.5 shrink-0" size={14} />
        <span className="min-w-0">{error}</span>
      </div>
    </PanelSection>
  );
}

function StandardsOverviewPanel({ form }: { form: FormState }) {
  const state = useStandardsPayloadState(form);
  if (state.loading) return <StandardsLoading title="Standards Overview" />;
  if (state.error) return <StandardsError error={state.error} title="Standards Overview" />;
  if (!state.payload) return <EmptyState>No standards payload loaded.</EmptyState>;

  const records = state.payload.records;
  const examples = state.payload.examples ?? [];
  const accepted = records.filter((record) => record.status === "accepted");
  const workerFacing = records.filter((record) => record.workerFacing !== false && record.status === "accepted");
  const merged = records.filter((record) => record.status === "merged" || record.disposition === "merged");
  const workflowOnly = records.filter((record) => record.status === "workflow_only" || record.disposition === "workflow_only");
  const qaRules = unique(records.flatMap((record) => record.qaRuleIds ?? []));
  const familyRows = familySummaries(records, examples);

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-5 gap-3 max-[1180px]:grid-cols-2 max-[720px]:grid-cols-1">
        <StatCard label="Active" value={num(accepted.length)} tone="text-up" />
        <StatCard label="Worker Facing" value={num(workerFacing.length)} tone="text-up" />
        <StatCard label="Merged" value={num(merged.length)} tone="text-cyan" />
        <StatCard label="Workflow Only" value={num(workflowOnly.length)} tone="text-purple" />
        <StatCard label="QA Rules" value={num(qaRules.length)} tone="text-warn" />
      </div>
      <PanelSection>
        <PanelHeader title="Code-Quality Families" right={<BarChart3 className="text-dim" size={15} />} />
        <div className="mt-3 overflow-auto border border-line">
          <table>
            <thead>
              <tr>
                <th>Family</th>
                <th>Standards</th>
                <th>Worker</th>
                <th>QA Rules</th>
                <th>Examples</th>
                <th>Enforcement</th>
              </tr>
            </thead>
            <tbody>
              {familyRows.map((row) => (
                <tr key={row.family}>
                  <td title={row.family}><span className="font-semibold text-fg">{familyLabel(row.family)}</span></td>
                  <td>{num(row.total)}</td>
                  <td>{num(row.workerFacing)}</td>
                  <td>{num(row.qaRules.length)}</td>
                  <td>{num(row.examples)}</td>
                  <td title={row.enforcement.join(", ")}>{row.enforcement.map((value) => labelize(value)).join(", ") || "None"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PanelSection>
      <div className="grid grid-cols-2 gap-4 max-[1180px]:grid-cols-1">
        <StandardsDispositionPanel records={records} />
        <StandardsSourcePanel payload={state.payload} />
      </div>
    </div>
  );
}

function StandardsDispositionPanel({ records }: { records: StandardRecord[] }) {
  const nonWorker = records.filter((record) => record.workerFacing === false || record.status !== "accepted");
  return (
    <PanelSection>
      <PanelHeader title="Retired, Merged, And Non-Worker Standards" right={<ShieldCheck className="text-dim" size={15} />} />
      {nonWorker.length === 0 ? (
        <p className="m-0 mt-3 text-xs text-dim">No non-worker standards recorded.</p>
      ) : (
        <div className="mt-3 grid gap-2">
          {nonWorker.map((record) => (
            <article className="border border-line bg-card p-3" key={record.id}>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-bold text-fg" title={record.title}>{prettySlug(record.id)}</span>
                <MetadataChip value={record.status} />
                <MetadataChip label="disposition" value={record.disposition} />
                <MetadataChip label="worker" value={record.workerFacing === false ? "not injected" : "injected"} />
              </div>
              {record.retiredInto ? <p className="m-0 mt-2 text-xs text-dim">retired into: <code>{record.retiredInto}</code></p> : null}
            </article>
          ))}
        </div>
      )}
    </PanelSection>
  );
}

function StandardsSourcePanel({ payload }: { payload: StandardsPayload }) {
  return (
    <PanelSection>
      <PanelHeader title="Source Files" right={<FileCode2 className="text-dim" size={15} />} />
      <div className="mt-3 grid gap-2 text-xs">
        <PathRow label="standards" value={payload.sourcePath} />
        <PathRow label="examples" value={payload.examplesPath ?? ""} />
      </div>
      {payload.warnings.length ? <p className="mb-0 mt-3 text-xs text-warn">{payload.warnings.join(" ")}</p> : null}
    </PanelSection>
  );
}

function PathRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-2 border border-line bg-card px-2.5 py-2">
      <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-dim">{label}</span>
      <code className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-path" title={value}>{value || "(not available)"}</code>
    </div>
  );
}

function StandardsQaPanel({ form }: { form: FormState }) {
  const state = useStandardsPayloadState(form);
  if (state.loading) return <StandardsLoading title="QA Coverage" />;
  if (state.error) return <StandardsError error={state.error} title="QA Coverage" />;
  if (!state.payload) return <EmptyState>No standards payload loaded.</EmptyState>;

  const rules = qaRuleSummaries(state.payload.records, state.payload.examples ?? []);
  const enforcementRows = enforcementSummaries(state.payload.records);
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-4 gap-3 max-[980px]:grid-cols-2 max-[620px]:grid-cols-1">
        {enforcementRows.map((row) => (
          <StatCard key={row.enforcement} label={labelize(row.enforcement)} value={num(row.count)} tone={/hard|error/.test(row.enforcement) ? "text-up" : /pipeline/.test(row.enforcement) ? "text-purple" : "text-warn"} />
        ))}
      </div>
      <PanelSection>
        <PanelHeader title="Deterministic And Routed QA Rules" right={<Gauge className="text-dim" size={15} />} />
        <div className="mt-3 overflow-auto border border-line">
          <table>
            <thead>
              <tr>
                <th>Rule</th>
                <th>Severity</th>
                <th>Family</th>
                <th>Standards</th>
                <th>Examples</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.ruleId}>
                  <td title={rule.ruleId}><code className="text-path">{rule.ruleId}</code></td>
                  <td title={rule.severities.join(", ")}>{rule.severities.map((value) => labelize(value)).join(", ") || "Unspecified"}</td>
                  <td title={rule.families.join(", ")}>{rule.families.map((family) => familyLabel(family)).join(", ") || "Unassigned"}</td>
                  <td title={rule.standards.join(", ")}>{rule.standards.map(shortStandardId).join(", ")}</td>
                  <td>{num(rule.examples)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PanelSection>
    </div>
  );
}

function StandardsExamplesPanel({ form }: { form: FormState }) {
  const state = useStandardsPayloadState(form);
  const [query, setQuery] = useState("");
  if (state.loading) return <StandardsLoading title="Repair Examples" />;
  if (state.error) return <StandardsError error={state.error} title="Repair Examples" />;
  if (!state.payload) return <EmptyState>No standards payload loaded.</EmptyState>;

  const standardsById = new Map(state.payload.records.map((record) => [record.id, record]));
  const examples = state.payload.examples ?? [];
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? examples.filter((example) => {
        const record = standardsById.get(example.standardId);
        const haystack = `${example.id} ${example.standardId} ${example.qaRuleId ?? ""} ${example.severity} ${example.badPattern} ${example.preferredShape} ${example.description.join(" ")} ${record?.title ?? ""}`.toLowerCase();
        return haystack.includes(normalizedQuery);
      })
    : examples;

  return (
    <div className="grid gap-4">
      <PanelSection className="p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <BookOpen className="shrink-0 text-dim" size={15} />
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-dim">{num(examples.length)} examples</span>
          </div>
          <div className="relative min-w-[260px] max-w-md flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-dim" size={13} />
            <input className="pl-7" onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Filter examples…" value={query} />
          </div>
        </div>
      </PanelSection>
      {filtered.length === 0 ? (
        <EmptyState>No examples match this filter.</EmptyState>
      ) : (
        <div className="grid grid-cols-2 gap-4 max-[1180px]:grid-cols-1">
          {filtered.map((example) => (
            <StandardExampleCard example={example} key={example.id} standard={standardsById.get(example.standardId)} />
          ))}
        </div>
      )}
    </div>
  );
}

function StandardExampleCard({ example, standard }: { example: StandardExampleRecord; standard?: StandardRecord }) {
  return (
    <article className="border border-line bg-panel p-4">
      <div className="mb-3 flex min-w-0 flex-wrap items-center gap-2">
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-bold text-fg" title={example.id}>{labelize(example.id)}</span>
        <MetadataChip value={example.severity} />
        {example.qaRuleId ? <MetadataChip label="rule" value={example.qaRuleId} /> : <MetadataChip value="pre-ship" />}
      </div>
      <p className="m-0 mb-3 text-xs leading-5 text-dim" title={example.standardId}>{standard ? standard.title : shortStandardId(example.standardId)}</p>
      <ExampleCodeBlock label="Flag" value={example.badPattern} />
      <ExampleCodeBlock label="Fix" value={example.preferredShape} />
      <DescriptionBullets items={example.description} />
      {example.evidenceRef ? <p className="m-0 mt-3 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-dim" title={example.evidenceRef}>evidence: <code>{example.evidenceRef}</code></p> : null}
    </article>
  );
}

function DescriptionBullets({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul aria-label="Description" className="example-description-list">
      {items.map((item, index) => (
        <li key={`${item.slice(0, 48)}-${index}`}>
          <span aria-hidden="true" className="example-description-bullet">•</span>
          <span className="example-description-text">{item}</span>
        </li>
      ))}
    </ul>
  );
}

// Code block for example Flag/Fix snippets. Examples are intentionally
// multi-line source snippets, so the block always renders a line-number gutter
// and a small syntax pass for C-ish code.
function ExampleCodeBlock({ label, value }: { label: string; value: string }) {
  const text = value ?? "";
  const lines = text.length ? text.split(/\r\n|\r|\n/) : [""];
  const digits = String(lines.length).length;
  const variant = /^fix$/i.test(label) ? "fix" : "flag";
  return (
    <div className={`example-code example-code-${variant}`}>
      <div className="example-code-header">
        <span className="example-code-label">{label}</span>
        <span className="example-code-count">{num(lines.length)} lines</span>
      </div>
      <div className="code-block overflow-x-auto">
        <div className="font-mono text-[12px] leading-[1.5]">
          {lines.map((line, index) => {
            const lineNumber = index + 1;
            const isComment = /^\s*(\/\/|\/\*|\*(?:[ \/]|$)|;)/.test(line);
            return (
              <div className="cb-line" key={lineNumber} style={{ gridTemplateColumns: `calc(${digits}ch + 1.5rem) minmax(0,1fr)` }}>
                <span className="cb-gutter">{lineNumber}</span>
                <span className={`cb-content${isComment ? " cb-comment" : ""}`}>{line ? renderCodeSyntax(line, `example-${label}-${lineNumber}`) : "\u00a0"}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function renderCodeSyntax(line: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const tokenPattern =
    /("(?:\\.|[^"\\])*")|(\/\*.*?\*\/|\/\/.*$)|(#[A-Za-z_]\w*)|\b(static|extern|const|volatile|inline|void|for|while|do|if|else|switch|case|break|return|sizeof)\b|\b(s8|u8|s16|u16|s32|u32|s64|u64|f32|f64|bool|HSD_JObj|HSD_GObj|Vec3)\b|\b(0x[0-9A-Fa-f]+|\d+(?:\.\d+)?F?)\b|(\.\.\.)/g;
  let lastIndex = 0;
  for (const match of line.matchAll(tokenPattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) nodes.push(line.slice(lastIndex, index));
    const [raw, stringToken, commentToken, preprocToken, keywordToken, typeToken, numberToken, ellipsisToken] = match;
    const className =
      stringToken ? "cb-string-token"
      : commentToken ? "cb-comment-token"
      : preprocToken ? "cb-preproc-token"
      : keywordToken ? "cb-keyword-token"
      : typeToken ? "cb-type-token"
      : numberToken ? "cb-number-token"
      : ellipsisToken ? "cb-ellipsis-token"
      : "";
    nodes.push(
      <span className={className} key={`${keyPrefix}-${index}`}>
        {raw}
      </span>,
    );
    lastIndex = index + raw.length;
  }
  if (lastIndex < line.length) nodes.push(line.slice(lastIndex));
  return nodes;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function familySummaries(records: StandardRecord[], examples: StandardExampleRecord[]) {
  const examplesByStandard = new Map<string, number>();
  for (const example of examples) examplesByStandard.set(example.standardId, (examplesByStandard.get(example.standardId) ?? 0) + 1);
  const families = unique([...FAMILY_ORDER, ...records.map((record) => record.family ?? "unassigned")]);
  return families
    .map((family) => {
      const familyRecords = records.filter((record) => (record.family ?? "unassigned") === family);
      return {
        family,
        total: familyRecords.length,
        workerFacing: familyRecords.filter((record) => record.workerFacing !== false && record.status === "accepted").length,
        qaRules: unique(familyRecords.flatMap((record) => record.qaRuleIds ?? [])),
        examples: familyRecords.reduce((sum, record) => sum + (examplesByStandard.get(record.id) ?? 0), 0),
        enforcement: unique(familyRecords.map((record) => record.qaEnforcement ?? "")),
      };
    })
    .filter((row) => row.total > 0 || row.family !== "unassigned");
}

function qaRuleSummaries(records: StandardRecord[], examples: StandardExampleRecord[]) {
  const rules = new Map<string, { ruleId: string; standards: string[]; families: string[]; severities: string[]; examples: number }>();
  function ensure(ruleId: string) {
    let current = rules.get(ruleId);
    if (!current) {
      current = { ruleId, standards: [], families: [], severities: [], examples: 0 };
      rules.set(ruleId, current);
    }
    return current;
  }
  for (const record of records) {
    for (const ruleId of record.qaRuleIds ?? []) {
      const current = ensure(ruleId);
      current.standards.push(record.id);
      if (record.family) current.families.push(record.family);
      if (record.severity) current.severities.push(record.severity);
    }
  }
  for (const example of examples) {
    if (!example.qaRuleId) continue;
    const current = ensure(example.qaRuleId);
    current.examples += 1;
    current.standards.push(example.standardId);
    current.severities.push(example.severity);
    const record = records.find((candidate) => candidate.id === example.standardId);
    if (record?.family) current.families.push(record.family);
  }
  return Array.from(rules.values())
    .map((rule) => ({
      ...rule,
      standards: unique(rule.standards),
      families: unique(rule.families),
      severities: unique(rule.severities),
    }))
    .sort((a, b) => a.ruleId.localeCompare(b.ruleId));
}

function enforcementSummaries(records: StandardRecord[]) {
  const counts = new Map<string, number>();
  for (const record of records) {
    const key = record.qaEnforcement || "unassigned";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts, ([enforcement, count]) => ({ enforcement, count })).sort((a, b) => b.count - a.count || a.enforcement.localeCompare(b.enforcement));
}

function StandardsEditor({ form }: { form: FormState }) {
  const [state, setState] = useState<StandardsState>({ loading: true, payload: null, error: "" });
  const [selectedId, setSelectedId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<StandardRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  // Explorer state: which families are collapsed in the tree, and whether the
  // examples dock is expanded. The dock auto-syncs to the selected standard.
  const [collapsedFamilies, setCollapsedFamilies] = useState<Set<string>>(new Set());
  const [dockOpen, setDockOpen] = useState(false);

  const load = async () => {
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const payload = await fetchStandards(form);
      setState({ loading: false, payload, error: "" });
      const first = payload.records[0]?.id ?? "";
      setSelectedId((current) => (current && payload.records.some((record) => record.id === current) ? current : first));
    } catch (error) {
      setState({ loading: false, payload: null, error: error instanceof Error ? error.message : String(error) });
    }
  };

  useEffect(() => {
    void load();
    // load is stable enough for this form-driven mount; form identity changes
    // when the operator switches project/path context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.projectId, form.stateDir, form.repoRoot, form.graphDbPath, form.usePathOverrides]);

  const records = state.payload?.records ?? [];
  const filtered = records.filter((record) => {
    if (!query.trim()) return true;
    const haystack = `${record.id} ${record.title} ${record.summary.join(" ")} ${record.family ?? ""} ${record.disposition ?? ""} ${record.severity ?? ""} ${record.qaEnforcement ?? ""} ${(record.qaRuleIds ?? []).join(" ")}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });
  const selected = records.find((record) => record.id === selectedId) ?? null;
  const editing = draft ?? selected;
  const dirty = draft !== null;

  const examples = state.payload?.examples ?? [];
  const selectedExamples = selected ? examples.filter((example) => example.standardId === selected.id) : [];
  const selectedRepairs = selected?.preferredRepairs ?? [];
  // Repairs dock (Preferred Repairs + Flag/Fix examples): auto-expand when the
  // selected standard has either, collapse to a rail when it has neither. The
  // operator can still toggle manually.
  useEffect(() => {
    setDockOpen(selectedExamples.length > 0 || selectedRepairs.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // Family-grouped tree (file-tree feel). Known families keep their declared
  // order; anything unmapped lands in an "Unassigned" group at the end.
  const orderedFamilies = (() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const family of FAMILY_ORDER) {
      seen.add(family);
      out.push(family);
    }
    for (const record of filtered) {
      const family = record.family ?? "unassigned";
      if (!seen.has(family)) {
        seen.add(family);
        out.push(family);
      }
    }
    return out;
  })();
  const groups = orderedFamilies
    .map((family) => ({ family, items: filtered.filter((record) => (record.family ?? "unassigned") === family) }))
    .filter((group) => group.items.length > 0);

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
    const slug = `new-standard-${Date.now().toString(36)}`;
    const record: StandardRecord = {
      id: `global_standard:${slug}`,
      title: "",
      summary: [],
      status: "accepted",
      family: "authored_source_shape",
      disposition: "active",
      severity: "review_required",
      qaEnforcement: "pre_ship_review",
      workerFacing: true,
      qaRuleIds: [],
      examplePolicy: "summary_in_worker_targeted_examples_for_repair_and_preship",
      preferredRepairs: [],
      do: [],
      doNot: [],
      evidenceRefs: [],
    };
    setDraft(record);
    setSelectedId(record.id);
  }

  function revert() {
    setDraft(null);
    setSaveError("");
    setValidationErrors([]);
  }

  function validateDraft(record: StandardRecord): string[] {
    const errors: string[] = [];
    if (!/^global_standard:[a-z0-9-]+$/.test(record.id)) errors.push("id must match global_standard:<slug> (lowercase, dashes).");
    if (!record.title.trim()) errors.push("title is required.");
    if (record.summary.map((item) => item.trim()).filter(Boolean).length === 0) errors.push("summary is required.");
    if (!STANDARD_STATUS_OPTIONS.includes(record.status)) errors.push("status must be accepted, proposed, superseded, merged, or workflow_only.");
    return errors;
  }

  async function save() {
    if (!draft) return;
    const errors = validateDraft(draft);
    setValidationErrors(errors);
    if (errors.length > 0) return;
    setSaving(true);
    setSaveError("");
    try {
      const result = await saveStandard(form, {
        id: draft.id.trim(),
        title: draft.title.trim(),
        summary: draft.summary.map((item) => item.trim()).filter(Boolean),
        status: draft.status,
        family: draft.family?.trim() || undefined,
        disposition: draft.disposition?.trim() || undefined,
        severity: draft.severity?.trim() || undefined,
        qaEnforcement: draft.qaEnforcement?.trim() || undefined,
        workerFacing: draft.workerFacing !== false,
        retiredInto: draft.retiredInto?.trim() || undefined,
        qaRuleIds: (draft.qaRuleIds ?? []).map((item) => item.trim()).filter(Boolean),
        examplePolicy: draft.examplePolicy?.trim() || undefined,
        preferredRepairs: (draft.preferredRepairs ?? []).map((item) => item.trim()).filter(Boolean),
        do: draft.do.map((item) => item.trim()).filter(Boolean),
        doNot: draft.doNot.map((item) => item.trim()).filter(Boolean),
        evidenceRefs: draft.evidenceRefs.map((item) => item.trim()).filter(Boolean),
      });
      if (!result.ok) {
        setValidationErrors(result.errors ?? ["Save failed."]);
        setSaving(false);
        return;
      }
      setDraft(null);
      setSaving(false);
      await load();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error));
      setSaving(false);
    }
  }

  if (state.loading) {
    return <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-xs text-dim">Loading standards…</div>;
  }
  if (state.error) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        <div className="max-w-md border border-down/40 bg-card p-4">
          <div className="flex items-start gap-2 text-xs text-down">
            <AlertTriangle className="mt-0.5 shrink-0" size={14} />
            <span className="min-w-0">{state.error}</span>
          </div>
          <div className="mt-3"><Button icon={<RotateCcw size={13} />} onClick={() => void load()} type="button">Retry</Button></div>
        </div>
      </div>
    );
  }

  // Shared tree (file-tree feel): family-grouped, collapsible, with a square
  // status lamp per standard. Rendered in both the inspect and edit layouts so
  // the operator never loses their place when they start editing.
  const tree = (
    <aside className="flex min-h-0 flex-col bg-inset">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-3 py-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-dim" title={state.payload?.sourcePath}>
          Standards<span className="ml-1 text-faint tabular-nums">{num(records.length)}</span>
        </span>
        <Button icon={<Plus size={13} />} onClick={newRecord} title="Draft a new standard record." type="button">New</Button>
      </div>
      <div className="relative shrink-0 border-b border-line px-2 py-2">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" size={13} />
        <input className="pl-7" onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Filter…" value={query} />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {groups.length === 0 ? (
          <div className="px-3 py-3 text-xs text-dim">No standards match this filter.</div>
        ) : (
          groups.map((group, index) => {
            const collapsed = collapsedFamilies.has(group.family);
            const alt = index % 2 === 1;
            const isFirst = index === 0;
            return (
              <div className={`${alt ? "bg-raised/50" : "bg-inset"} ${isFirst ? "" : "border-t border-section"}`} key={group.family}>
                <button
                  className="flex w-full items-center gap-1.5 border-l-2 border-l-transparent bg-card/60 px-2.5 py-2 text-left hover:bg-card"
                  onClick={() => toggleFamily(group.family)}
                  type="button"
                >
                  {collapsed ? <ChevronRight className="shrink-0 text-dim" size={12} /> : <ChevronDown className="shrink-0 text-dim" size={12} />}
                  <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.12em] text-soft" title={group.family}>
                    {familyLabel(group.family === "unassigned" ? undefined : group.family)}
                  </span>
                  <span className="shrink-0 text-[10px] tabular-nums text-faint">{num(group.items.length)}</span>
                </button>
                {!collapsed && group.items.length > 0
                  ? group.items.map((record, itemIndex) => {
                      const isLast = itemIndex === group.items.length - 1;
                      return (
                        <button
                          className={`flex w-full items-center border-l-2 border-t border-line py-1.5 pl-[30px] pr-2 text-left hover:bg-card ${selectedId === record.id ? "border-l-accent bg-card" : "border-l-transparent"} ${isLast ? "border-b border-section" : ""}`}
                          key={record.id}
                          onClick={() => selectRecord(record.id)}
                          type="button"
                        >
                          <span
                            className={`min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] ${selectedId === record.id ? "font-bold text-fg" : "text-soft"}`}
                            title={record.title || prettySlug(record.id)}
                          >
                            {prettySlug(record.id)}
                          </span>
                        </button>
                      );
                    })
                  : null}
              </div>
            );
          })
        )}
      </div>
    </aside>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {editing && dirty ? (
        // Edit-in-place: the tree stays put and the editor takes the full
        // content width so the long form (id/title/summary + string lists)
        // isn't cramped into a narrow column.
        <div className="grid min-h-0 flex-1 grid-cols-[340px_minmax(0,1fr)] gap-px bg-line">
          {tree}
          <div className="min-h-0 overflow-y-auto bg-panel">
            <StandardEditForm
              draft={editing}
              saving={saving}
              saveError={saveError}
              validationErrors={validationErrors}
              onRevert={revert}
              onSave={save}
              onValidate={() => setValidationErrors(validateDraft(editing))}
              setDraft={setDraft}
            />
          </div>
        </div>
      ) : (
        // Inspect: tree → identity + Do/Don't (the main thing) → repairs dock
        // (Preferred Repairs + Flag/Fix examples). The dock is wider than the
        // tree so the code examples breathe; it auto-opens when the selected
        // standard has repairs or examples and collapses to a rail otherwise.
        // Each pane fills the available height and scrolls independently.
        <div
          className={`grid min-h-0 flex-1 gap-px bg-line ${
            dockOpen
              ? "grid-cols-[340px_minmax(360px,1fr)_minmax(420px,480px)]"
              : "grid-cols-[340px_minmax(360px,1fr)_44px]"
          }`}
        >
          {tree}
          {selected ? (
            <div className="min-h-0 overflow-y-auto bg-panel">
              <StandardDetail onEdit={beginEdit} record={selected} />
            </div>
          ) : (
            <div className="flex items-center justify-center bg-panel p-6 text-xs text-dim">Select a standard to inspect or edit it.</div>
          )}
          {dockOpen ? (
            <StandardRepairsColumn preferredRepairs={selectedRepairs} examples={selectedExamples} onClose={() => setDockOpen(false)} />
          ) : (
            <button
              className="flex flex-col items-center justify-center gap-2 bg-inset text-faint hover:bg-card hover:text-soft"
              onClick={() => setDockOpen(true)}
              title={`Expand repairs (${num(selectedRepairs.length + selectedExamples.length)} for this standard)`}
              type="button"
            >
              <Wrench size={15} />
              <span className="border border-line px-1 text-[10px] font-bold tabular-nums">{num(selectedRepairs.length + selectedExamples.length)}</span>
            </button>
          )}
        </div>
      )}
      {state.payload?.warnings.length ? (
        <div className="shrink-0 border-t border-warn/30 bg-warn/5 px-4 py-1.5 text-[11px] text-warn">{state.payload.warnings.join(" ")}</div>
      ) : null}
    </div>
  );
}

// Examples dock for the selected standard: a compact, independently-scrolling
// rail showing each repair example (flag/fix/description). Reuses
// ExampleCodeBlock so the look matches the dedicated Examples tab. onClose
// collapses back to the rail; when there are no examples it shows an
// explanatory empty state.
// Repairs dock (right sidebar): the "preferred repair" portion of a standard.
// Holds two stacked sections — Preferred Repairs (the routes this standard
// prefers) and Examples (Flag/Fix snippets) — so everything about *how to
// fix* lives together, while the center pane stays focused on what the rule
// is (description, Do/Don't). The whole pane scrolls; each section has its
// own sub-header so they read as distinct but related.
function StandardRepairsColumn({ preferredRepairs, examples, onClose }: { preferredRepairs: string[]; examples: StandardExampleRecord[]; onClose?: () => void }) {
  const hasRepairs = preferredRepairs.length > 0;
  const hasExamples = examples.length > 0;
  const total = preferredRepairs.length + examples.length;
  return (
    <aside className="flex h-full min-h-0 flex-col bg-inset">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-3 py-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Wrench className="shrink-0 text-dim" size={13} />
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-dim">Repairs<span className="ml-1 text-faint tabular-nums">{num(total)}</span></span>
        </div>
        {onClose ? (
          <button className="inline-flex h-6 w-6 items-center justify-center text-faint hover:text-fg" onClick={onClose} title="Collapse repairs" type="button">
            <ChevronRight size={14} />
          </button>
        ) : null}
      </div>
      {!hasRepairs && !hasExamples ? (
        <p className="m-0 px-3 py-4 text-xs text-faint">No repairs or examples recorded for this standard.</p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {hasRepairs ? (
            <section className="border-t border-line first:border-t-0">
              <div className="flex items-center justify-between bg-card px-3 py-1.5">
                <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-dim">Preferred Repairs</span>
                <span className="text-[10px] tabular-nums text-faint">{num(preferredRepairs.length)}</span>
              </div>
              <ul aria-label="Preferred repairs" className="preferred-repair-list">
                {preferredRepairs.map((item, index) => (
                  <li key={`${item.slice(0, 40)}-${index}`}>
                    <span aria-hidden="true" className="preferred-repair-bullet">•</span>
                    <span className="preferred-repair-text">{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {hasExamples ? (
            <section className="border-t border-line first:border-t-0">
              <div className="flex items-center justify-between bg-card px-3 py-1.5">
                <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-dim">Examples</span>
                <span className="text-[10px] tabular-nums text-faint">{num(examples.length)}</span>
              </div>
              {examples.map((example) => (
                <div className="border-t border-line px-3 py-3 first:border-t-0" key={example.id}>
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    <MetadataChip value={example.severity} />
                    {example.qaRuleId ? <MetadataChip label="rule" value={example.qaRuleId} /> : null}
                  </div>
                  <ExampleCodeBlock label="Flag" value={example.badPattern} />
                  <ExampleCodeBlock label="Fix" value={example.preferredShape} />
                  <DescriptionBullets items={example.description} />
                </div>
              ))}
            </section>
          ) : null}
        </div>
      )}
    </aside>
  );
}

// Rendered tab of the Standards section: loads the standards payload and shows
// the effective prompt viewer (Rendered / Standards toggle). Separate from the
// editor so the editor's save/reload flow stays self-contained.
function RenderedStandardsPanel({ form }: { form: FormState }) {
  const [state, setState] = useState<{ loading: boolean; payload: StandardsPayload | null; error: string }>({
    loading: true,
    payload: null,
    error: "",
  });
  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, payload: null, error: "" });
    void fetchStandards(form)
      .then((payload) => {
        if (!cancelled) setState({ loading: false, payload, error: "" });
      })
      .catch((error) => {
        if (!cancelled) setState({ loading: false, payload: null, error: error instanceof Error ? error.message : String(error) });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.projectId, form.stateDir, form.repoRoot, form.graphDbPath, form.usePathOverrides]);

  if (state.loading) {
    return (
      <PanelSection>
        <PanelTitle>Effective Prompt</PanelTitle>
        <p className="m-0 text-xs text-dim">Loading rendered prompt…</p>
      </PanelSection>
    );
  }
  if (state.error) {
    return (
      <PanelSection className="border-down/50">
        <PanelTitle>Effective Prompt</PanelTitle>
        <div className="flex items-start gap-2 text-xs text-down">
          <AlertTriangle className="mt-0.5 shrink-0" size={14} />
          <span className="min-w-0">{state.error}</span>
        </div>
      </PanelSection>
    );
  }
  return <EffectivePreview payload={state.payload} />;
}

// Read-only documentation view. Standards read as rules, not form fields, so
// browsing stays light; the form only appears when the operator clicks Edit.
function StandardDetail({ onEdit, record }: { onEdit: () => void; record: StandardRecord }) {
  // Reference table for the right rail. Only rows with a value render, so
  // empty fields don't clutter the table (matches the old chip behavior). QA
  // Rules get their own wrapping row since a standard can carry several.
  const rows: Array<{ label: string; value?: string; tone?: string; title?: string }> = [
    { label: "Status", value: record.status, tone: statusTone(record.status) },
    { label: "Family", value: record.family ? familyLabel(record.family) : undefined, title: record.family ?? undefined },
    { label: "Disposition", value: record.disposition },
    { label: "Severity", value: record.severity },
    { label: "QA", value: record.qaEnforcement },
    { label: "Worker", value: record.workerFacing === false ? "not injected" : "injected" },
    { label: "Retired Into", value: record.retiredInto ?? undefined },
  ].filter((row) => row.value);

  return (
    <div className="p-5 lg:p-6">
      {/* Title + Edit: no flex-wrap, so the Edit button stays pinned in the
          top-right corner and never drops to a second line; the title
          ellipsizes instead. The raw ID is no longer shown as a subheader. */}
      <div className="flex items-start justify-between gap-3">
        <h3
          className="m-0 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[18px] font-bold leading-snug text-fg"
          title={record.title || shortStandardId(record.id)}
        >
          {record.title || shortStandardId(record.id)}
        </h3>
        <Button className="shrink-0" icon={<Pencil size={13} />} onClick={onEdit} type="button">Edit</Button>
      </div>
      {/* Row 1: summary bullets (~5/8) + metadata table (~3/8). Whatever
          the table's natural height is, this is a single row/div; on narrow
          panes it stacks so the table stays legible. */}
      <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,3fr)]">
        <div className="min-w-0">
          <StandardSummaryList items={record.summary} />
        </div>
        <div className="min-w-0">
          <div className="overflow-hidden border border-line bg-card">
            {rows.map((row, index) => (
              <div className={`grid grid-cols-[92px_minmax(0,1fr)] items-center gap-2 px-2.5 py-1.5 ${index === 0 ? "" : "border-t border-line"}`} key={row.label}>
                <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.1em] text-dim" title={row.label}>{row.label}</span>
                <span className={`min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[12px] font-semibold ${row.tone ?? "text-soft"}`} title={row.title ?? row.value}>{row.value}</span>
              </div>
            ))}
            {record.qaRuleIds?.length ? (
              <div className="grid grid-cols-[92px_minmax(0,1fr)] items-start gap-2 border-t border-line px-2.5 py-1.5">
                <span className="mt-px overflow-hidden text-ellipsis whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.1em] text-dim" title="QA Rules">QA Rules</span>
                <div className="flex flex-wrap gap-1">
                  {record.qaRuleIds.map((ruleId) => <MetadataChip key={ruleId} value={ruleId} />)}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {/* Row 2: Do / Don't side by side, full width (stacks on narrow panes). */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DoDoNotList items={record.do} label="Do" empty="No positive checks recorded." tone="do" />
        <DoDoNotList items={record.doNot} label="Do Not" empty="No forbidden shortcuts recorded." tone="do-not" />
      </div>
    </div>
  );
}

// Do / Do Not rendered as structured bullet lists. The items are authored as
// string-list descriptions, so the read-only view should preserve that shape
// directly instead of converting each entry into an action row.
function StandardSummaryList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul aria-label="Summary" className="standard-summary-list">
      {items.map((item, index) => (
        <li key={`${item.slice(0, 48)}-${index}`}>
          <span aria-hidden="true" className="standard-summary-bullet">•</span>
          <span className="standard-summary-text">{item}</span>
        </li>
      ))}
    </ul>
  );
}

function DoDoNotList({ empty, items, label, tone }: { empty: string; items: string[]; label: string; tone: "do" | "do-not" }) {
  return (
    <div className="overflow-hidden border border-line bg-card">
      <div className="flex items-center gap-1.5 bg-raised px-3 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-dim">
        {label}
      </div>
      {items.length === 0 ? (
        <p className="m-0 px-3 py-3 text-[13px] text-faint">{empty}</p>
      ) : (
        <ul className={`standard-description-list standard-description-list-${tone} standard-description-list-divided`}>
          {items.map((item, index) => (
            <li key={`${item.slice(0, 40)}-${index}`}>
              <span aria-hidden="true" className="standard-description-bullet">•</span>
              <span className="standard-description-text">{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// List-of-strings editor for Do / Do Not / evidence refs. Each item is its
// own input with a remove control plus an Add button, so the operator edits
// structured entries directly instead of wrangling a "one per line" textarea.
function StringListField({
  label,
  items,
  onChange,
  placeholder,
  mono = false,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  mono?: boolean;
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
        <Button icon={<Plus size={13} />} onClick={add} title={`Add a ${label} item.`} type="button">Add</Button>
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

function StandardEditForm({
  draft,
  saving,
  saveError,
  validationErrors,
  onRevert,
  onSave,
  onValidate,
  setDraft,
}: {
  draft: StandardRecord;
  saving: boolean;
  saveError: string;
  validationErrors: string[];
  onRevert: () => void;
  onSave: () => void;
  onValidate: () => void;
  setDraft: (record: StandardRecord) => void;
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
      <StringListField
        label="Summary"
        items={draft.summary}
        onChange={(items) => setList("summary", items)}
        placeholder="One summary bullet for this standard."
      />
      <div className="grid grid-cols-2 gap-3 max-[900px]:grid-cols-1">
        <SelectField label="Status" onChange={(event) => update({ status: event.currentTarget.value })} options={STANDARD_STATUS_OPTIONS} value={draft.status} />
        <SelectField label="Family" onChange={(event) => update({ family: event.currentTarget.value || undefined })} options={STANDARD_FAMILY_OPTIONS} value={draft.family ?? ""} />
        <SelectField label="Disposition" onChange={(event) => update({ disposition: event.currentTarget.value || undefined })} options={STANDARD_DISPOSITION_OPTIONS} value={draft.disposition ?? ""} />
        <SelectField label="Severity" onChange={(event) => update({ severity: event.currentTarget.value || undefined })} options={STANDARD_SEVERITY_OPTIONS} value={draft.severity ?? ""} />
        <SelectField label="QA Enforcement" onChange={(event) => update({ qaEnforcement: event.currentTarget.value || undefined })} options={STANDARD_QA_OPTIONS} value={draft.qaEnforcement ?? ""} />
        <Field label="Retired Into" onChange={(event) => update({ retiredInto: event.currentTarget.value })} spellCheck={false} value={draft.retiredInto ?? ""} />
      </div>
      <CheckboxField checked={draft.workerFacing !== false} label="Worker-facing standard" onChange={(event) => update({ workerFacing: event.currentTarget.checked })} />
      <Field label="Example Policy" onChange={(event) => update({ examplePolicy: event.currentTarget.value })} spellCheck={false} value={draft.examplePolicy ?? ""} />
      <StringListField
        label="QA rule ids"
        items={draft.qaRuleIds ?? []}
        onChange={(items) => setList("qaRuleIds", items)}
        placeholder="e.g. pointer_offset_arithmetic"
        mono
      />
      <StringListField
        label="Preferred repairs"
        items={draft.preferredRepairs ?? []}
        onChange={(items) => setList("preferredRepairs", items)}
        placeholder="Concrete repair route this standard prefers."
      />
      <div className="grid gap-4">
        <StringListField
          label="Do"
          items={draft.do}
          onChange={(items) => setList("do", items)}
          placeholder="Positive check, e.g. 'Match the original instruction order.'"
        />
        <StringListField
          label="Do Not"
          items={draft.doNot}
          onChange={(items) => setList("doNot", items)}
          placeholder="Forbidden shortcut, e.g. 'Do not reorder volatile reads.'"
        />
      </div>
      <StringListField
        label="Evidence refs"
        items={draft.evidenceRefs}
        onChange={(items) => setList("evidenceRefs", items)}
        placeholder="e.g. evidence:PR-123#diff-..."
        mono
      />
      {validationErrors.length > 0 ? (
        <ul className="m-0 grid gap-1 p-0 text-xs text-down">
          {validationErrors.map((error) => <li className="list-none" key={error}>{error}</li>)}
        </ul>
      ) : null}
      {saveError ? <p className="m-0 text-xs text-down">{saveError}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button disabled={saving} icon={<RotateCcw size={13} />} onClick={onRevert} title="Discard edits and reload the saved record." type="button">Revert</Button>
        <Button disabled={saving} icon={<Check size={13} />} onClick={onValidate} title="Run field validation without saving." type="button">Validate</Button>
        <Button disabled={saving} icon={<Save size={13} />} onClick={onSave} tone="primary" type="button">{saving ? "Saving…" : "Save"}</Button>
      </div>
    </div>
  );
}

// Rendered <decomp_standards> prompt preview — the effective XML worker and
// QA prompts receive. Just the rendered prompt field, styled to match the
// rest of the dashboard; the Agent Viewer still has the full annotated prompt.
function EffectivePreview({ payload }: { payload: StandardsPayload | null }) {
  const [copied, setCopied] = useState(false);
  if (!payload) return null;
  const accepted = payload.records.filter((record) => record.status === "accepted" && record.workerFacing !== false);
  const xml = payload.effectiveXml || "";

  async function copyXml() {
    if (!xml) return;
    try {
      await navigator.clipboard.writeText(xml);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <PanelSection>
      <PanelHeader
        title={
          <>
            Effective Prompt{" "}
            <span className="font-normal text-dim">— {num(accepted.length)} accepted standard{accepted.length === 1 ? "" : "s"} injected</span>
          </>
        }
        right={
          <Button icon={copied ? <Check size={13} /> : <Copy size={13} />} onClick={() => void copyXml()} title="Copy the rendered XML to the clipboard." type="button">
            {copied ? "Copied" : "Copy XML"}
          </Button>
        }
      />
      <div className="mt-3">
        <PromptXmlViewer xml={xml} />
      </div>
    </PanelSection>
  );
}

// Prompt rendering: numbered lines in a sticky gutter, XML element lines
// picked out, markdown headings emphasized, and `inline code` chipped. Styled
// to match the surrounding dashboard.
function PromptXmlViewer({ xml }: { xml: string }) {
  if (!xml.trim()) {
    return <p className="m-0 text-xs text-faint">(no rendered XML)</p>;
  }
  const lines = xml.split(/\r\n|\r|\n/);
  return (
    <div className="effective-viewer">
      <article className="ev-rendered">
        {lines.map((line, index) => {
          const lineNumber = index + 1;
          const trimmed = line.trim();
          let className = "ev-line";
          let content: React.ReactNode = renderInlineCode(line, `ev-${lineNumber}`);
          if (!trimmed) {
            className += " ev-line-blank";
            content = "\u00a0";
          } else if (isXmlLine(trimmed)) {
            className += " ev-line-xml";
          } else if (/^#{1,6}\s/.test(trimmed)) {
            className += " ev-line-heading";
          }
          return (
            <div className={className} key={lineNumber}>
              <div className="ev-line-number">{lineNumber}</div>
              <div className="ev-line-content">{content}</div>
            </div>
          );
        })}
      </article>
    </div>
  );
}

function isXmlLine(line: string): boolean {
  return /^<\/?[A-Za-z0-9_:-]+(?:\s[^>]*)?>$/.test(line.trim());
}

function renderInlineCode(value: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern = /`([^`]+)`/g;
  let lastIndex = 0;
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) nodes.push(value.slice(lastIndex, index));
    nodes.push(
      <code className="ev-inline-code" key={`${keyPrefix}-code-${index}`}>
        {match[1]}
      </code>,
    );
    lastIndex = index + match[0].length;
  }
  if (lastIndex < value.length) nodes.push(value.slice(lastIndex));
  return nodes;
}

function useStandardsInventory(form: FormState): StandardsPayload | null {
  const [payload, setPayload] = useState<StandardsPayload | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetchStandards(form)
      .then((loaded) => {
        if (!cancelled) setPayload(loaded);
      })
      .catch(() => {
        if (!cancelled) setPayload(null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.projectId, form.stateDir, form.repoRoot, form.graphDbPath, form.usePathOverrides]);
  return payload;
}

function KnowledgeGraphPanel({ form }: { form: FormState }) {
  const payload = useStandardsInventory(form);
  const inventory = payload?.inventory;
  return (
    <PanelSection>
      <PanelTitle>Knowledge Graph &amp; Sources</PanelTitle>
      <div className="grid grid-cols-1 gap-4 @[760px]:grid-cols-2">
        <PanelSection className="p-3">
          <PanelTitle>Global Sources</PanelTitle>
          <List values={inventory?.globalSources ?? []} empty="No global knowledge sources configured." />
        </PanelSection>
        <PanelSection className="p-3">
          <PanelTitle>Project Sources</PanelTitle>
          <List values={inventory?.projectSources ?? []} empty="No project knowledge sources configured." />
        </PanelSection>
      </div>
      <p className="mb-0 mt-3 text-xs text-dim">
        The graph rebuilds on Sync and Prepare. Run <code>bun run kg:status</code> or <code>kg:rebuild</code> from the CLI for detailed graph health.
      </p>
    </PanelSection>
  );
}
