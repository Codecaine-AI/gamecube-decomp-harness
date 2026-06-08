import type { JsonObject } from "../types.js";

export function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : {};
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function numberValue(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function pct(value: unknown): string {
  return Number.isFinite(Number(value)) ? `${Number(value).toFixed(3)}%` : "n/a";
}

export function num(value: unknown): string {
  return Number.isFinite(Number(value)) ? String(Number(value)) : "0";
}

export function whole(value: unknown): string {
  return Number.isFinite(Number(value)) ? String(Math.round(Number(value))) : "n/a";
}

export function signedWhole(value: unknown): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "n/a";
  return `${parsed >= 0 ? "+" : ""}${Math.round(parsed)}`;
}

export function score(value: unknown): string {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(3) : "n/a";
}

function finiteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function percentLike(value: unknown): boolean {
  const parsed = finiteNumber(value);
  return parsed !== null && parsed >= 0 && parsed <= 100;
}

export function scorePairLooksPercent(oldValue: unknown, newValue: unknown, deltaValue?: unknown): boolean {
  if (!percentLike(oldValue) || !percentLike(newValue)) return false;
  const oldScore = finiteNumber(oldValue);
  const newScore = finiteNumber(newValue);
  const deltaScore = finiteNumber(deltaValue);
  if (oldScore === null || newScore === null || deltaScore === null || Math.abs(deltaScore) < 0.0005) return true;
  const scoreMovement = newScore - oldScore;
  return Math.abs(scoreMovement) < 0.0005 || Math.sign(deltaScore) === Math.sign(scoreMovement);
}

export function scoreOrPercent(value: unknown, percent = true): string {
  return percent ? pct(value) : score(value);
}

export function delta(value: unknown): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "n/a";
  if (Math.abs(parsed) < 0.0005) return "+0.000";
  return `${parsed >= 0 ? "+" : ""}${parsed.toFixed(3)}`;
}

export function shortId(value: unknown): string {
  const raw = String(value ?? "");
  return raw.length > 8 ? raw.slice(0, 8) : raw || "-";
}

export function duration(ms: unknown): string {
  const seconds = Math.max(0, Math.round(numberValue(ms) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return `${hours}h ${remMinutes}m`;
}

export function ago(value: unknown): string {
  if (!value) return "-";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.round(minutes / 60)}h`;
}

export function clock(value: unknown): string {
  if (!value) return "-";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleTimeString();
}

export function until(value: unknown): string {
  if (!value) return "-";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  const ms = date.getTime() - Date.now();
  return ms >= 0 ? duration(ms) : "expired";
}

export function durationBetween(startValue: unknown, endValue: unknown): string {
  if (!startValue || !endValue) return "-";
  const start = new Date(String(startValue));
  const end = new Date(String(endValue));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "-";
  return duration(end.getTime() - start.getTime());
}
