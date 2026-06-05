export function stripPiFailureTrailer(rawText: string): string {
  const marker = "\n\n[Pi session failed]\n";
  const markerAt = rawText.indexOf(marker);
  return (markerAt >= 0 ? rawText.slice(0, markerAt) : rawText).trim();
}

export function parseJsonObject(rawText: string): { object: Record<string, unknown> | null; error?: string } {
  const trimmed = stripPiFailureTrailer(rawText);
  if (!trimmed) return { object: null, error: "empty agent output" };

  const candidates = [trimmed];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced?.[1]) candidates.push(fenced[1].trim());

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) candidates.push(trimmed.slice(firstBrace, lastBrace + 1));

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return { object: parsed as Record<string, unknown> };
    } catch {
      // Try the next extraction strategy.
    }
  }
  return { object: null, error: "agent output did not contain a parseable JSON object" };
}

function findArrayStart(rawText: string, propertyName: string): number {
  const propertyAt = rawText.indexOf(`"${propertyName}"`);
  if (propertyAt < 0) return -1;
  return rawText.indexOf("[", propertyAt);
}

export function extractCompleteObjectsFromArray(rawText: string, propertyName: string): Record<string, unknown>[] {
  const text = stripPiFailureTrailer(rawText);
  const arrayAt = findArrayStart(text, propertyName);
  if (arrayAt < 0) return [];

  const objects: Record<string, unknown>[] = [];
  let objectStart = -1;
  let braceDepth = 0;
  let inString = false;
  let escaped = false;

  for (let index = arrayAt + 1; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") {
      if (braceDepth === 0) objectStart = index;
      braceDepth += 1;
      continue;
    }
    if (char === "}") {
      if (braceDepth === 0) continue;
      braceDepth -= 1;
      if (braceDepth === 0 && objectStart >= 0) {
        try {
          const parsed = JSON.parse(text.slice(objectStart, index + 1)) as unknown;
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            objects.push(parsed as Record<string, unknown>);
          }
        } catch {
          // Ignore this object and keep scanning for later complete objects.
        }
        objectStart = -1;
      }
      continue;
    }
    if (char === "]" && braceDepth === 0) break;
  }

  return objects;
}

export function numberField(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}
