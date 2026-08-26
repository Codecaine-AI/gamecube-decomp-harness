export function uiLog(stream: "stdout" | "stderr" | "ui", text: string): void {
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    process.stderr.write(`[${stream}] ${line}\n`);
  }
}
