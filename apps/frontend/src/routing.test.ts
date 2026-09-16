import { afterEach, describe, expect, test } from "bun:test";
import { routeFromUrl, routeToUrl } from "./routing";

const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
function locationAt(path: string) {
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: new URL(path, "http://localhost:3000") } });
}
afterEach(() => {
  if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
  else Reflect.deleteProperty(globalThis, "window");
});

describe("harness routes", () => {
  test("current navigation needs only a game and workflow, including detail links", () => {
    locationAt("/");
    const route = { kind: "workspace", section: "harness", harnessSub: "run", harnessDetail: { kind: "epoch", id: "epoch/2" }, gameId: "melee" } as const;
    expect(routeToUrl(route)).toBe("/harness/run/epoch/epoch%2F2?gameId=melee");
    locationAt(routeToUrl(route));
    expect(routeFromUrl()).toEqual(route);
  });
  test("history opens boundary evidence", () => {
    locationAt("/harness/history?gameId=melee");
    expect(routeFromUrl()).toMatchObject({ section: "harness", harnessSub: "artifacts" });
  });
  test("retired cycle routes and query aliases are not recognized", () => {
    locationAt("/cycles/legacy-1/run?gameId=melee");
    expect(routeFromUrl()).toEqual({ kind: "dashboard" });
    locationAt("/?page=cycle");
    expect(routeFromUrl()).toEqual({ kind: "dashboard" });
  });
});
