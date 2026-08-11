import { describe, expect, test } from "bun:test";
import { createPiChildProcessReaper } from "./kernel-pi-runner.js";

describe("Pi child process reaper", () => {
  test("SIGTERM reaps registered process groups before exiting", () => {
    const kills: Array<{ pid: number; signal: string }> = [];
    const exits: number[] = [];
    const scheduled: Array<{ callback: () => void; delayMs: number }> = [];
    const reaper = createPiChildProcessReaper({
      platform: "darwin",
      kill(pid, signal) {
        kills.push({ pid, signal });
      },
      schedule(callback, delayMs) {
        scheduled.push({ callback, delayMs });
      },
      exit(code) {
        exits.push(code);
      },
    });
    reaper.registerProcessGroup(1201);
    reaper.registerProcessGroup(1202);
    reaper.registerProcessGroup(1202);

    reaper.handleSignal("SIGTERM");

    expect(kills).toEqual([
      { pid: -1201, signal: "SIGTERM" },
      { pid: -1202, signal: "SIGTERM" },
    ]);
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]?.delayMs).toBe(5_000);
    expect(exits).toEqual([]);

    reaper.unregisterProcessGroup(1201);
    scheduled[0]!.callback();

    expect(kills).toEqual([
      { pid: -1201, signal: "SIGTERM" },
      { pid: -1202, signal: "SIGTERM" },
      { pid: -1201, signal: "SIGKILL" },
      { pid: -1202, signal: "SIGKILL" },
    ]);
    expect(reaper.processGroupCount()).toBe(0);
    expect(exits).toEqual([143]);
  });

  test("normal completion unregisters a process group", () => {
    const kills: Array<{ pid: number; signal: string }> = [];
    let scheduled = false;
    const reaper = createPiChildProcessReaper({
      platform: "darwin",
      kill(pid, signal) {
        kills.push({ pid, signal });
      },
      schedule() {
        scheduled = true;
      },
      exit() {},
    });
    reaper.registerProcessGroup(1301);
    reaper.unregisterProcessGroup(1301);

    expect(reaper.processGroupCount()).toBe(0);
    reaper.handleSignal("SIGTERM");

    expect(kills).toEqual([]);
    expect(scheduled).toBe(true);
  });
});
