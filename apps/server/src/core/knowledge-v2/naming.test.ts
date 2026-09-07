import { describe, expect, test } from "bun:test";
import { inferredNameProblem } from "./naming.js";

describe("inferred names", () => {
  test("accepts identifiers and refuses sentence or alternative substitutions", () => {
    const subject = { targetKind: "function" as const, symbol: "fn_80001234" };
    expect(inferredNameProblem("ftLk_RemoveBow", subject)).toBeNull();
    for (const value of ["Likely ftLk_RemoveBow.", "`ftLk_RemoveBow`", "ftLk_RemoveBow or ftLk_ClearBow", " ftLk_RemoveBow", "return", "", "ftLk_RemoveBow()"] ) {
      expect(inferredNameProblem(value, subject)).toBe("invalid_inferred_name");
    }
    expect(inferredNameProblem(subject.symbol, subject)).toBe("redundant_inferred_name");
  });

  test("keeps entity member identifiers distinct from aggregate and module labels", () => {
    for (const entityKind of ["struct", "struct_field", "parameter"]) {
      expect(inferredNameProblem("bow_gobj", { entityKind })).toBeNull();
      expect(inferredNameProblem("Bow object", { entityKind })).toBe("invalid_inferred_name");
    }
    expect(inferredNameProblem("Tournament menu state", { targetKind: "data" })).toBeNull();
    expect(inferredNameProblem("ftCo_DownReflect.c", { entityKind: "translation_unit" })).toBeNull();
    expect(inferredNameProblem("Shield break", { entityKind: "game_concept" })).toBeNull();
    for (const value of ["Likely TournamentState", "The original name was TournamentState", "`TournamentState`", "TournamentState."]) {
      expect(inferredNameProblem(value, { targetKind: "data" })).toBe("invalid_inferred_name");
    }
  });
});
