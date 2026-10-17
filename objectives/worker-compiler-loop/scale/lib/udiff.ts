/**
 * A minimal unified diff (one hunk spanning the changed region, 3 lines of
 * context). Enough for `git apply` on the host: the fake sandbox uses it for
 * `git diff` and the QA lint's `--no-index` diff.
 */
export function unifiedDiff(path: string, before: string, after: string): string {
  if (before === after) return "";
  const a = before.split("\n");
  const b = after.split("\n");
  const aHasEol = before.endsWith("\n");
  const bHasEol = after.endsWith("\n");
  if (aHasEol) a.pop();
  if (bHasEol) b.pop();
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA -= 1; endB -= 1; }
  const context = 3;
  const hunkStart = Math.max(0, start - context);
  const hunkEndA = Math.min(a.length, endA + context);
  const hunkEndB = Math.min(b.length, endB + context);
  const lines: string[] = [];
  for (let i = hunkStart; i < start; i += 1) lines.push(` ${a[i]}`);
  for (let i = start; i < endA; i += 1) lines.push(`-${a[i]}`);
  if (endA === a.length && !aHasEol && endA > start) lines.push("\\ No newline at end of file");
  for (let i = start; i < endB; i += 1) lines.push(`+${b[i]}`);
  if (endB === b.length && !bHasEol && endB > start) lines.push("\\ No newline at end of file");
  for (let i = endA; i < hunkEndA; i += 1) lines.push(` ${a[i]}`);
  const countA = hunkEndA - hunkStart;
  const countB = hunkStart + (hunkEndB - hunkStart) - hunkStart;
  const rangeA = `${countA === 0 ? hunkStart : hunkStart + 1},${countA}`;
  const rangeB = `${countB === 0 ? hunkStart : hunkStart + 1},${countB}`;
  return [
    `diff --git a/${path} b/${path}`,
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -${rangeA} +${rangeB} @@`,
    ...lines,
    "",
  ].join("\n");
}
