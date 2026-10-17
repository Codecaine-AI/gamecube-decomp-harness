import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gamesRoot } from "@server/core/game-registry/resolver.js";

/**
 * One unit name per function, whichever side wrote it.
 *
 * objdiff reports name a unit after its module (`mario/Animal/AnimalBase`);
 * report-derived state (board candidates, epoch targets, claims, integration
 * target keys, PR entries) carries that name. The steering gate names units
 * after their build objects without the module (`Animal/AnimalBase`), and so
 * does every steering row it feeds (unverified matches, rollbacks, backfill,
 * coverage, observations, gate certificates). Comparing the two raw misses
 * every hold.
 *
 * The canonical unit is the name without a known module prefix: the game's
 * `matching.unitModulePrefixes` (SMS `["mario"]`). Only those exact leading
 * segments are removed, never another path component; a game without the key
 * (Melee) keeps its units as written. Canonicalisation is idempotent for any
 * unit whose first path component is not itself a module name.
 *
 * - `canonicalUnit` / `targetKey`: the key to store and to compare.
 * - `unitVariants` / `targetKeyVariants`: every spelling a row may carry, for
 *   SQL reads that must also find rows written before canonical writes.
 * - `withUnitKeys` / `unitKeyedHas` / `unitKeyedGet`: an index built for one
 *   game remembers how to look a raw key up, so code that holds only the
 *   index (measures, ranking, judgements) needs no game.
 */

/** A game id, or anything carrying one (and optionally its resolved `matching`). */
export type UnitKeyGame =
  | string
  | {
    gameId?: string | null;
    id?: string | null;
    matching?: { unitModulePrefixes?: readonly string[] | null } | null;
  }
  | null
  | undefined;

const prefixCache = new Map<string, readonly string[]>();
const NONE: readonly string[] = Object.freeze([]);

function validPrefixes(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return NONE;
  const prefixes = value.filter((prefix): prefix is string => typeof prefix === "string" && /^[A-Za-z0-9_.-]+$/.test(prefix));
  return prefixes.length > 0 ? Object.freeze([...new Set(prefixes)]) : NONE;
}

function prefixesForGameId(gameId: string): readonly string[] {
  const cached = prefixCache.get(gameId);
  if (cached) return cached;
  let prefixes = NONE;
  try {
    const path = resolve(gamesRoot(), gameId, "game.json");
    if (/^[A-Za-z0-9_.-]+$/.test(gameId) && existsSync(path)) {
      const descriptor = JSON.parse(readFileSync(path, "utf8")) as { matching?: { unitModulePrefixes?: unknown } };
      prefixes = validPrefixes(descriptor?.matching?.unitModulePrefixes);
    }
  } catch {
    prefixes = NONE;
  }
  prefixCache.set(gameId, prefixes);
  return prefixes;
}

/** The game's known module prefixes: its resolved `matching` when given, else its descriptor by id; none when unknown. */
export function unitModulePrefixes(game: UnitKeyGame): readonly string[] {
  if (!game) return NONE;
  if (typeof game === "string") return prefixesForGameId(game);
  if (game.matching && Array.isArray(game.matching.unitModulePrefixes)) return validPrefixes(game.matching.unitModulePrefixes);
  const id = game.gameId ?? game.id;
  return id ? prefixesForGameId(id) : NONE;
}

function stripPrefix(prefixes: readonly string[], unit: string): string {
  for (const prefix of prefixes) {
    if (unit.length > prefix.length + 1 && unit.startsWith(`${prefix}/`)) return unit.slice(prefix.length + 1);
  }
  return unit;
}

/** `unit` without the game's module prefix (`mario/Animal/AnimalBase` -> `Animal/AnimalBase` on SMS); unchanged otherwise. */
export function canonicalUnit(game: UnitKeyGame, unit: string): string {
  if (!unit) return unit;
  return stripPrefix(unitModulePrefixes(game), unit);
}

/** The canonical `unit::symbol` target key. */
export function targetKey(game: UnitKeyGame, unit: string, symbol: string): string {
  return `${canonicalUnit(game, unit)}::${symbol}`;
}

/** A `unit::symbol` key with its unit canonicalised (units never contain `::`; symbols may). */
export function canonicalTargetKey(game: UnitKeyGame, key: string): string {
  return keyNormalizer(unitModulePrefixes(game))(key);
}

/** The two names denote the same unit of this game. */
export function sameUnit(game: UnitKeyGame, left: string | null | undefined, right: string | null | undefined): boolean {
  if (left == null || right == null) return left === right;
  if (left === right) return true;
  const prefixes = unitModulePrefixes(game);
  return prefixes.length > 0 && stripPrefix(prefixes, left) === stripPrefix(prefixes, right);
}

/** Every spelling of the unit a row may carry: the canonical name first, then each module-prefixed one. */
export function unitVariants(game: UnitKeyGame, unit: string): string[] {
  if (!unit) return [unit];
  const prefixes = unitModulePrefixes(game);
  const canonical = stripPrefix(prefixes, unit);
  return [...new Set([canonical, ...prefixes.map((prefix) => `${prefix}/${canonical}`)])];
}

/** `unitVariants` as `unit::symbol` keys. */
export function targetKeyVariants(game: UnitKeyGame, unit: string, symbol: string): string[] {
  return unitVariants(game, unit).map((variant) => `${variant}::${symbol}`);
}

/** `?, ?, ...` for an `IN (...)` over `values`. */
export function sqlPlaceholders(values: readonly unknown[]): string {
  return values.map(() => "?").join(", ");
}

function keyNormalizer(prefixes: readonly string[]): (key: string) => string {
  if (prefixes.length === 0) return (key) => key;
  return (key) => {
    const split = key.indexOf("::");
    return split < 0 ? stripPrefix(prefixes, key) : `${stripPrefix(prefixes, key.slice(0, split))}${key.slice(split)}`;
  };
}

const UNIT_KEYS = Symbol.for("gamecube-decomp.unit-keys");

type KeyedIndex = ReadonlySet<string> | ReadonlyMap<string, unknown>;

/**
 * Marks an index of canonical `unit::symbol` keys (or bare units) as this
 * game's: `unitKeyedHas`/`unitKeyedGet` then canonicalise the key they are
 * asked for. Returns the same object. Without module prefixes it is a no-op.
 */
export function withUnitKeys<T extends KeyedIndex>(index: T, game: UnitKeyGame): T {
  const prefixes = unitModulePrefixes(game);
  if (prefixes.length === 0 || Object.isFrozen(index)) return index;
  Object.defineProperty(index, UNIT_KEYS, { value: keyNormalizer(prefixes), enumerable: false, configurable: true });
  return index;
}

/** The normaliser `withUnitKeys` attached, or null. */
export function unitKeyNormalizer(index: unknown): ((key: string) => string) | null {
  if (!index || typeof index !== "object") return null;
  const normalizer = (index as Record<symbol, unknown>)[UNIT_KEYS];
  return typeof normalizer === "function" ? normalizer as (key: string) => string : null;
}

/** `index.has(key)`, also under the key's canonical spelling when the index belongs to a game with module prefixes. */
export function unitKeyedHas(index: KeyedIndex | null | undefined, key: string): boolean {
  if (!index) return false;
  if (index.has(key)) return true;
  const normalize = unitKeyNormalizer(index);
  if (!normalize) return false;
  const canonical = normalize(key);
  return canonical !== key && index.has(canonical);
}

/** `map.get(key)`, preferring the key's canonical spelling when the map belongs to a game with module prefixes. */
export function unitKeyedGet<V>(map: ReadonlyMap<string, V> | null | undefined, key: string): V | undefined {
  if (!map) return undefined;
  const normalize = unitKeyNormalizer(map);
  if (normalize) {
    const canonical = normalize(key);
    if (canonical !== key && map.has(canonical)) return map.get(canonical);
  }
  return map.get(key);
}
