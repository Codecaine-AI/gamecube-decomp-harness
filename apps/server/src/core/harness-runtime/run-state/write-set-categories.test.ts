import { describe, expect, test } from "bun:test";
import { categorizePath } from "./write-set-categories.js";

describe("categorizePath", () => {
  const sourcePath = "src/melee/gr/ground.c";

  test("categorizes the claim source as target-source before extension rules", () => {
    expect(categorizePath(sourcePath, sourcePath)).toBe("target-source");
    expect(categorizePath("./src/melee/gr/ground.c", sourcePath)).toBe("target-source");
    expect(categorizePath("src\\melee\\gr\\ground.c", sourcePath)).toBe("target-source");
  });

  test("categorizes only game config symbols and splits files as config-metadata", () => {
    expect(categorizePath("config/GALE01/symbols.txt", sourcePath)).toBe("config-metadata");
    expect(categorizePath("config/GALE01/generated/splits.txt", sourcePath)).toBe("config-metadata");
    expect(categorizePath("config/GALE01/labels.txt", sourcePath)).toBe("other");
    expect(categorizePath("notes/symbols.txt", sourcePath)).toBe("other");
  });

  test("categorizes headers under include or src as owning-header", () => {
    expect(categorizePath("include/dolphin/types.h", sourcePath)).toBe("owning-header");
    expect(categorizePath("src/melee/gr/ground.h", sourcePath)).toBe("owning-header");
    expect(categorizePath("include/Map/PollutionEvent.hpp", sourcePath)).toBe("owning-header");
    expect(categorizePath("tools/ground.h", sourcePath)).toBe("other");
  });

  test("categorizes non-target C files under src as foreign-source", () => {
    expect(categorizePath("src/melee/ft/fighter.c", sourcePath)).toBe("foreign-source");
    expect(categorizePath("tools/fighter.c", sourcePath)).toBe("other");
  });

  test("C++ sources and libs/*/include headers (SMS layout)", () => {
    const cppSource = "src/MarioUtil/Mario.cpp";
    expect(categorizePath(cppSource, cppSource)).toBe("target-source");
    expect(categorizePath("src/Enemy/BossGesso.cpp", cppSource)).toBe("foreign-source");
    expect(categorizePath("libs/JSystem/include/JSystem/J3D/J3DModel.hpp", cppSource)).toBe("owning-header");
    expect(categorizePath("libs/dolphin/include/dolphin/os.h", cppSource)).toBe("owning-header");
    expect(categorizePath("libs/JSystem/src/J3D/J3DModel.cpp", cppSource)).toBe("other");
    expect(categorizePath("include/Enemy/BossGesso.HPP", cppSource)).toBe("owning-header");
  });

  test("categorizes every unsupported path as other", () => {
    expect(categorizePath("Makefile", sourcePath)).toBe("other");
    expect(categorizePath("", sourcePath)).toBe("other");
  });
});
