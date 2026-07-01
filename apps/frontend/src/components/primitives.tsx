import type { ComponentProps, ReactNode } from "react";
import { Fragment } from "react";

type ButtonTone = "default" | "primary" | "warning" | "danger";
type ButtonProps = Omit<ComponentProps<"button">, "ref"> & { icon?: ReactNode; tone?: ButtonTone };
type FieldProps = Omit<ComponentProps<"input">, "ref"> & { label: string };
type SelectFieldOption = string | number | { label: string; value: string | number };
type SelectFieldProps = Omit<ComponentProps<"select">, "ref"> & { label: string; options: ReadonlyArray<SelectFieldOption> };
type CheckboxFieldProps = Omit<ComponentProps<"input">, "ref" | "type"> & { label: string };

const buttonTone: Record<ButtonTone, string> = {
  default: "border-line2 bg-raised text-soft hover:border-faint hover:text-fg",
  primary: "border-up/50 bg-up/10 text-up hover:bg-up/20",
  warning: "border-warn/50 bg-warn/10 text-warn hover:bg-warn/20",
  danger: "border-down/50 bg-down/10 text-down hover:bg-down/20",
};

function selectOptionValue(option: SelectFieldOption): string | number {
  return typeof option === "object" ? option.value : option;
}

function selectOptionLabel(option: SelectFieldOption): string | number {
  return typeof option === "object" ? option.label : option;
}

export function Button({
  children,
  className = "",
  icon,
  tone = "default",
  ...props
}: ButtonProps) {
  return (
    <button
      className={`inline-flex min-h-7 items-center justify-center gap-1.5 border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] disabled:cursor-not-allowed disabled:opacity-45 ${buttonTone[tone]} ${className}`}
      {...props}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}

export function PanelSection({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`border border-line bg-panel p-4 ${className}`}>{children}</section>;
}

export function PanelTitle({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`panel-heading ${className}`}>{children}</div>;
}

/**
 * Shared header zone for the top-bar sections: a fixed 28px title row, so
 * every section's first card starts at the same y.
 */
export function PanelHeader({ right, title }: { right?: ReactNode; title: ReactNode }) {
  return (
    <div className="flex h-7 items-center justify-between gap-2">
      <PanelTitle className="mb-0 min-w-0 flex-1">{title}</PanelTitle>
      {right}
    </div>
  );
}

export function Field({
  label,
  className = "",
  ...props
}: FieldProps) {
  return (
    <label className={`mb-3 block text-[10px] uppercase tracking-[0.08em] text-dim ${className}`} title={props.title}>
      <span>{label}</span>
      <input className="mt-1.5 text-[13px] normal-case tracking-normal" {...props} />
    </label>
  );
}

export function SelectField({
  label,
  options,
  className = "",
  ...props
}: SelectFieldProps) {
  return (
    <label className={`mb-3 block text-[10px] uppercase tracking-[0.08em] text-dim ${className}`} title={props.title}>
      <span>{label}</span>
      <select className="mt-1.5 text-[13px] normal-case tracking-normal" {...props}>
        {options.map((option) => (
          <option key={selectOptionValue(option)} value={selectOptionValue(option)}>
            {selectOptionLabel(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

export function CheckboxField({
  label,
  ...props
}: CheckboxFieldProps) {
  return (
    <label className="mt-2 flex items-center gap-2.5 text-xs text-dim" title={props.title}>
      <input className="min-h-4 w-4" type="checkbox" {...props} />
      <span>{label}</span>
    </label>
  );
}

export function EmptyState({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`border border-dashed border-line2 bg-card p-4 text-center text-dim ${className}`}>{children}</div>;
}

export function Pill({ state }: { state: string }) {
  const tone =
    state === "running" || state === "detached"
      ? "status-tag-live"
      : state === "stopping" || state === "draining"
        ? "status-tag-warn"
        : "";
  return (
    <span className={`status-tag ${tone}`}>
      <span className="lamp" />
      {state}
    </span>
  );
}

export function StackCell({ primary, secondary }: { primary: ReactNode; secondary?: ReactNode }) {
  return (
    <>
      <span className="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-fg">{primary}</span>
      {secondary ? <span className="mt-0.5 block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-dim">{secondary}</span> : null}
    </>
  );
}

export function StatCard({ label, tone = "text-soft", value }: { label: string; tone?: string; value: ReactNode }) {
  return (
    <div className="min-w-0 border border-line bg-card px-2.5 py-2">
      <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-dim">{label}</div>
      <div className={`mt-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-sm ${tone}`}>{value}</div>
    </div>
  );
}

export function PageHeader({ kicker, title }: { kicker: string; title: string }) {
  return (
    <header className="flex h-[68px] shrink-0 items-center gap-3 border-b border-line bg-panel px-4 py-3">
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-dim">{kicker}</div>
        <h2 className="m-0 mt-1 overflow-hidden text-ellipsis whitespace-nowrap text-[18px] font-bold tracking-normal text-fg">{title}</h2>
      </div>
    </header>
  );
}

export function InfoRows({ rows }: { rows: Array<[string, ReactNode, string?]> }) {
  return (
    <div className="overflow-hidden border border-line bg-card">
      {rows.map(([label, value, tone = "text-soft"]) => (
        <div className="grid min-h-8 grid-cols-[120px_minmax(0,1fr)] items-center gap-2 border-t border-line px-2.5 py-1.5 first:border-t-0" key={label}>
          <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-dim">{label}</span>
          <span className={`min-w-0 overflow-hidden text-ellipsis whitespace-nowrap ${tone}`}>{value}</span>
        </div>
      ))}
    </div>
  );
}

export function List({ empty, values }: { empty: string; values: string[] }) {
  if (values.length === 0) return <p className="m-0 text-xs text-dim">{empty}</p>;
  return (
    <ul className="m-0 grid gap-1.5 p-0 text-xs text-soft">
      {values.map((value) => (
        <li className="min-w-0 list-none overflow-hidden text-ellipsis whitespace-nowrap" key={value} title={value}>{value}</li>
      ))}
    </ul>
  );
}

export function NavItem({ active, description, icon, label, onClick }: { active: boolean; description: string; icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      aria-current={active ? "page" : undefined}
      className={`flex h-8 items-center gap-3 border pl-[34%] pr-2.5 ${
        active ? "border-up/60 bg-up/[0.03] text-fg" : "border-line bg-card text-soft hover:border-line2 hover:bg-raised"
      }`}
      onClick={onClick}
      title={description}
      type="button"
    >
      <span className={`flex h-5 w-5 shrink-0 items-center justify-center [&>svg]:block ${active ? "text-up" : "text-dim"}`}>{icon}</span>
      <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[11px] font-bold uppercase tracking-[0.1em]">{label}</span>
    </button>
  );
}

// Compact horizontal sub-navigation (used inside the active session page).
export function SubNav({ items }: { items: Array<{ active: boolean; id: string; label: string; onClick: () => void }> }) {
  return (
    <nav className="flex flex-wrap gap-x-3 gap-y-1.5" role="tablist">
      {items.map((item) => (
        <button
          aria-current={item.active ? "page" : undefined}
          aria-selected={item.active}
          className={`min-h-7 border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${
            item.active ? "border-line2 bg-raised text-fg" : "border-line bg-card text-dim hover:border-line2 hover:text-soft"
          }`}
          key={item.id}
          onClick={item.onClick}
          role="tab"
          type="button"
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}

// Horizontal phase stepper: Prepare -> Run -> PR -> Done.
export function PhaseStepperBar({
  current,
  onSelect,
  phases,
  workflowCurrent,
}: {
  current: string;
  onSelect?: (id: string) => void;
  phases: Array<{ id: string; label: string; state?: "done" | "current" | "todo" }>;
  workflowCurrent?: string;
}) {
  const resolved = phases.map((phase) => ({
    ...phase,
    state: phase.state ?? "todo",
  }));
  return (
    <div className="border border-line bg-card p-3">
      <ol className="m-0 flex flex-wrap items-center justify-center gap-2 p-0">
        {resolved.map((phase, index) => {
          const active = phase.id === current;
          const isWorkflowCurrent = phase.id === workflowCurrent;
          const content = (
            <>
              <span
                className={`grid h-5 w-5 shrink-0 place-items-center border text-[11px] font-bold ${
                  phase.state === "done"
                    ? "border-up bg-up text-ink"
                    : isWorkflowCurrent
                      ? "border-warn bg-warn/10 text-warn"
                      : active
                        ? "border-fg text-fg"
                        : "border-line2 text-dim"
                }`}
              >
                {phase.state === "done" ? "✓" : index + 1}
              </span>
              <span className={`text-[11px] font-bold uppercase tracking-[0.1em] ${isWorkflowCurrent ? "text-warn" : active ? "text-fg" : phase.state === "done" ? "text-soft" : "text-dim"}`}>{phase.label}</span>
            </>
          );
          return (
            <Fragment key={phase.id}>
              <li className="flex items-center gap-2">
                {onSelect ? (
                  <button
                    aria-current={active ? "step" : undefined}
                    className={`flex min-h-7 items-center gap-2 border px-1.5 py-1 text-left hover:border-line2 hover:bg-raised ${
                      isWorkflowCurrent ? "border-warn/60 bg-warn/10" : active ? "border-line2 bg-raised" : "border-transparent"
                    }`}
                    onClick={() => onSelect(phase.id)}
                    title={`Open ${phase.label}`}
                    type="button"
                  >
                    {content}
                  </button>
                ) : (
                  <div className={`flex min-h-7 items-center gap-2 border px-1.5 py-1 ${isWorkflowCurrent ? "border-warn/60 bg-warn/10" : active ? "border-line2 bg-raised" : "border-transparent"}`}>{content}</div>
                )}
              </li>
              {index < resolved.length - 1 ? <span aria-hidden="true" className="text-dim">→</span> : null}
            </Fragment>
          );
        })}
      </ol>
    </div>
  );
}
