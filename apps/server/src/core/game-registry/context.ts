import type { ResolvedGame } from "./resolver.js";

export interface GameRuntimeContext {
  game: ResolvedGame | null;
  repoRoot: string;
  stateDir: string;
  graphDbPath: string;
  usePathOverrides: boolean;
}
