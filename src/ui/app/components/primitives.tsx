import type { ComponentProps, ReactNode } from "react";

type ButtonTone = "default" | "primary" | "warning" | "danger";

const buttonTone: Record<ButtonTone, string> = {
  default: "border-[#363a38] bg-[#2a2d2b] hover:bg-[#343835]",
  primary: "border-[#1f8c42] bg-[#1f6f35] hover:bg-[#278640]",
  warning: "border-[#8b6d32] bg-[#5f4b24] hover:bg-[#725b2c]",
  danger: "border-[#8d3838] bg-[#693030] hover:bg-[#803b3b]",
};

export function Button({
  children,
  className = "",
  icon,
  tone = "default",
  ...props
}: ComponentProps<"button"> & { icon?: ReactNode; tone?: ButtonTone }) {
  return (
    <button
      className={`inline-flex min-h-7 items-center justify-center gap-1.5 rounded-[5px] border px-2.5 py-1 text-[#e2e5e2] disabled:cursor-not-allowed disabled:opacity-55 ${buttonTone[tone]} ${className}`}
      {...props}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}

export function PanelSection({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`border-b border-[#292d2b] p-3 ${className}`}>{children}</section>;
}

export function PanelTitle({ children }: { children: ReactNode }) {
  return <div className="mb-2 text-xs font-bold uppercase text-[#c0c5c1]">{children}</div>;
}

export function Field({
  label,
  className = "",
  ...props
}: ComponentProps<"input"> & { label: string }) {
  return (
    <label className={`mb-2 block text-xs text-[#969b97] ${className}`} title={props.title}>
      <span>{label}</span>
      <input className="mt-1" {...props} />
    </label>
  );
}

export function SelectField({
  label,
  options,
  className = "",
  ...props
}: ComponentProps<"select"> & { label: string; options: Array<string | number> }) {
  return (
    <label className={`mb-2 block text-xs text-[#969b97] ${className}`} title={props.title}>
      <span>{label}</span>
      <select className="mt-1" {...props}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

export function CheckboxField({
  label,
  ...props
}: Omit<ComponentProps<"input">, "type"> & { label: string }) {
  return (
    <label className="mt-1 flex items-center gap-2 text-xs text-[#969b97]" title={props.title}>
      <input className="min-h-4 w-4" type="checkbox" {...props} />
      <span>{label}</span>
    </label>
  );
}

export function EmptyState({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-md border border-dashed border-[#363a38] bg-[#151615] p-4 text-center text-[#969b97] ${className}`}>{children}</div>;
}

export function Pill({ state }: { state: string }) {
  const tone =
    state === "running" || state === "detached"
      ? "border-[#2a7d38] text-[#45e05e]"
      : state === "stopping" || state === "draining"
        ? "border-[#8b6d32] text-[#d7a64b]"
        : "border-[#363a38] text-[#969b97]";
  return <span className={`min-w-[72px] rounded-full border bg-black px-2.5 py-1 text-center ${tone}`}>{state}</span>;
}

export function StackCell({ primary, secondary }: { primary: ReactNode; secondary?: ReactNode }) {
  return (
    <>
      <span className="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[#e2e5e2]">{primary}</span>
      {secondary ? <span className="mt-0.5 block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-[#969b97]">{secondary}</span> : null}
    </>
  );
}
