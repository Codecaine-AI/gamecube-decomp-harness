export function artifactTimestamp(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, "-");
}
