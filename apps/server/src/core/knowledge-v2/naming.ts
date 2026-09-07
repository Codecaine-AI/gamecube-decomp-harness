/** Direct inferred-name values shared by librarian validation and maintenance. */
export interface NamingSubject {
  targetKind?: "function" | "data";
  symbol?: string | null;
  entityKind?: string;
}

const C_KEYWORDS = new Set("auto break case char const continue default do double else enum extern float for goto if int long register return short signed sizeof static struct switch typedef union unsigned void volatile while inline restrict _Bool _Complex _Imaginary".split(" "));
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const PROSE = /^(?:(?:a|an|the)\s+)?(?:likely|possibly|possible|plausible|plausibly|probably|original(?:-style)?\s+name|suggested\s+name|proposed\s+name|name\s+is|no\s+(?:name|independent|original))\b|\b(?:is|was|would|could|should)\b/i;

export function inferredNameProblem(value: string, subject: NamingSubject): "invalid_inferred_name" | "redundant_inferred_name" | null {
  if (!value || value !== value.trim() || value.length > 160) return "invalid_inferred_name";
  const codeIdentifier = subject.targetKind === "function"
    || ["struct", "struct_field", "parameter"].includes(subject.entityKind ?? "");
  if (codeIdentifier) {
    if (!IDENTIFIER.test(value) || C_KEYWORDS.has(value)) return "invalid_inferred_name";
  } else {
    // Labels can describe a whole data section or unit; they are never code substitutions.
    if (!/^[A-Za-z_][A-Za-z0-9_ .\/-]*$/.test(value)
      || /[.\s]$/.test(value) || value.split(/\s+/).length > 12 || PROSE.test(value)) {
      return "invalid_inferred_name";
    }
  }
  if (subject.symbol === value) return "redundant_inferred_name";
  return null;
}
