import { describe, expect, test } from "bun:test";
import { gameBuildLayout } from "./build-layout.js";

describe("gameBuildLayout", () => {
  test("defaults to the Melee build layout", () => {
    const layout = gameBuildLayout();

    expect(layout).toMatchObject({
      version: "GALE01",
      buildDir: "build/GALE01",
      configDir: "config/GALE01",
      symbolsTxtPath: "config/GALE01/symbols.txt",
      splitsTxtPath: "config/GALE01/splits.txt",
      objRoot: "build/GALE01/obj",
      asmRoot: "build/GALE01/asm",
    });
    expect(layout.objectPathForSource("src/melee/lb/lbrefract.c")).toBe("build/GALE01/src/melee/lb/lbrefract.o");
  });

  test("derives the Sunshine layout from its report path", () => {
    const layout = gameBuildLayout({ reportPath: "build/GMSJ01/report.json" });

    expect(layout).toMatchObject({
      version: "GMSJ01",
      buildDir: "build/GMSJ01",
      configDir: "config/GMSJ01",
      symbolsTxtPath: "config/GMSJ01/symbols.txt",
      splitsTxtPath: "config/GMSJ01/splits.txt",
      objRoot: "build/GMSJ01/obj",
      asmRoot: "build/GMSJ01/asm",
    });
    expect(layout.objectPathForSource("./src/MarioUtil/DrawUtil.cpp")).toBe("build/GMSJ01/src/MarioUtil/DrawUtil.o");
  });

  test("names objects after the report unit when configure remaps a source directory", () => {
    const sms = gameBuildLayout({ reportPath: "build/GMSJ01/report.json" });
    const melee = gameBuildLayout();

    // Sunshine's configure.py builds libs/THPPlayer/src/THPPlayer.c as src/THPPlayer/THPPlayer.o.
    expect(sms.objectPathForUnit("mario/THPPlayer/THPPlayer")).toBe("build/GMSJ01/src/THPPlayer/THPPlayer.o");
    // Melee's libs/dolphin/src/dolphin/... keeps the dolphin/ prefix once.
    expect(melee.objectPathForUnit("main/dolphin/amcstubs/AmcExi2Stubs")).toBe("build/GALE01/src/dolphin/amcstubs/AmcExi2Stubs.o");
    expect(sms.objectPathForUnit("mario")).toBeNull();
    expect(sms.objectPathForUnit("MarioUtil/DrawUtil.cpp")).toBeNull();
  });

  test("uses the directory containing an absolute report path", () => {
    const layout = gameBuildLayout({ reportPath: "/work/sms/build/GMSJ01/report.json" });

    expect(layout.version).toBe("GMSJ01");
    expect(layout.buildDir).toBe("build/GMSJ01");
  });

  test("normalizes backslashes in report and source paths", () => {
    const layout = gameBuildLayout({ reportPath: "C:\\work\\sms\\build\\GMSJ01\\report.json" });

    expect(layout.version).toBe("GMSJ01");
    expect(layout.objectPathForSource(".\\src\\MarioUtil\\DrawUtil.cpp")).toBe("build/GMSJ01/src/MarioUtil/DrawUtil.o");
  });

  test("falls back to Melee for an unparseable report path", () => {
    expect(gameBuildLayout({ reportPath: "build/GMSJ01/report_changes.json" }).version).toBe("GALE01");
  });
});
