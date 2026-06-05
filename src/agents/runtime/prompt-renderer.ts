import { readFileSync } from "node:fs";

export interface PromptTemplateValues {
  CURRENT_STATE_JSON: string;
  FILES_TO_READ_JSON: string;
  RESOURCES_JSON: string;
  PRIMARY_SOURCE_PATH?: string;
}

export function readTemplate(path: string): string {
  return readFileSync(path, "utf8").trimEnd();
}

export function stableJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function renderTemplate(template: string, values: PromptTemplateValues): string {
  return template.replace(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g, (match, key: keyof PromptTemplateValues) => {
    const value = values[key];
    return typeof value === "string" ? value : match;
  });
}
