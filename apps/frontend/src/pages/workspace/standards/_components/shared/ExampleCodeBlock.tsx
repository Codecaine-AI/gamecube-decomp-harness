import type { ReactNode } from "react";
import { num } from "@/lib/format";

export function ExampleCodeBlock({ label, value }: { label: string; value: string }) {
  const text = value ?? "";
  const lines = text.length ? text.split(/\r\n|\r|\n/) : [""];
  const digits = String(lines.length).length;
  const variant = /^(fix|good|preferred)$/i.test(label) ? "fix" : "flag";
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
            const isComment = /^\s*(\/\/|\/\*|\*(?:[ /]|$)|;)/.test(line);
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

function renderCodeSyntax(line: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const tokenPattern =
    /("(?:\\.|[^"\\])*")|(\/\*.*?\*\/|\/\/.*$)|(#[A-Za-z_]\w*)|\b(static|extern|const|volatile|inline|void|for|while|do|if|else|switch|case|break|return|sizeof)\b|\b(s8|u8|s16|u16|s32|u32|s64|u64|f32|f64|bool|HSD_JObj|HSD_GObj|Vec3)\b|\b(0x[0-9A-Fa-f]+|\d+(?:\.\d+)?F?)\b|(\.\.\.)/g;
  let lastIndex = 0;
  for (const match of line.matchAll(tokenPattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) nodes.push(line.slice(lastIndex, index));
    const [raw, stringToken, commentToken, preprocToken, keywordToken, typeToken, numberToken, ellipsisToken] = match;
    const className = stringToken
      ? "cb-string-token"
      : commentToken
        ? "cb-comment-token"
        : preprocToken
          ? "cb-preproc-token"
          : keywordToken
            ? "cb-keyword-token"
            : typeToken
              ? "cb-type-token"
              : numberToken
                ? "cb-number-token"
                : ellipsisToken
                  ? "cb-ellipsis-token"
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
