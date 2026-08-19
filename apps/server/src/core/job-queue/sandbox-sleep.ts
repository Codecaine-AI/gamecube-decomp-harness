import type { SandboxExecResult, SandboxHandle } from "./sandbox.js";

export interface SandboxSleepOptions {
  debounceMs: number;
  log?: (message: string) => void;
  now?: () => number;
}

export interface SandboxSleepStats {
  stopCount: number;
  startCount: number;
  stoppedMs: number;
  stopFailures: number;
  startFailures: number;
  lastTransitionAt: number;
}

export interface SleepingSandboxHandle extends SandboxHandle {
  close(): Promise<void>;
  stats(): SandboxSleepStats;
}

type SandboxSleepState =
  | "started"
  | "stopPending"
  | "stopping"
  | "stopped"
  | "starting"
  | "closed";

const START_RETRY_DELAY_MS = 25;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

class SandboxSleepController {
  private state: SandboxSleepState = "started";
  private activeOperations = 0;
  private debounceTimer?: ReturnType<typeof setTimeout>;
  private transitionPromise?: Promise<void>;
  private stoppedAt?: number;
  private closeRequested = false;
  private closePromise?: Promise<void>;
  private readonly idleWaiters = new Set<() => void>();
  private readonly now: () => number;
  private readonly log: (message: string) => void;
  private readonly counters: SandboxSleepStats;

  constructor(
    private readonly handle: SandboxHandle,
    private readonly debounceMs: number,
    options: Pick<SandboxSleepOptions, "log" | "now">,
  ) {
    this.now = options.now ?? Date.now;
    this.log = options.log ?? (() => undefined);
    this.counters = {
      stopCount: 0,
      startCount: 0,
      stoppedMs: 0,
      stopFailures: 0,
      startFailures: 0,
      lastTransitionAt: this.now(),
    };
  }

  private setState(state: SandboxSleepState, at = this.now()): void {
    this.state = state;
    this.counters.lastTransitionAt = at;
  }

  private closedError(): Error {
    return new Error(`sleeping sandbox handle ${this.handle.sandboxId} is closed`);
  }

  private assertOpen(): void {
    if (this.closeRequested || this.state === "closed") throw this.closedError();
  }

  private clearTransition(promise: Promise<void>): void {
    if (this.transitionPromise === promise) this.transitionPromise = undefined;
  }

  private cancelPendingStop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
    if (this.state === "stopPending") this.setState("started");
  }

  private armPendingStop(): void {
    if (this.closeRequested || this.activeOperations !== 0 || this.state !== "started") return;
    this.setState("stopPending");
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined;
      if (this.closeRequested || this.activeOperations !== 0 || this.state !== "stopPending") return;
      this.beginStop();
    }, this.debounceMs);
  }

  private beginStop(): Promise<void> {
    if (this.state === "stopping" && this.transitionPromise) return this.transitionPromise;
    if (this.state === "stopped") return Promise.resolve();
    if (this.state !== "started" && this.state !== "stopPending") {
      return Promise.reject(new Error(`cannot stop sandbox ${this.handle.sandboxId} while ${this.state}`));
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
    this.setState("stopping");
    const transition = (async () => {
      try {
        await this.handle.stop();
        this.counters.stopCount += 1;
        const at = this.now();
        this.stoppedAt = at;
        this.setState("stopped", at);
      } catch (error) {
        this.counters.stopFailures += 1;
        this.log(`sandbox sleep stop failed for ${this.handle.sandboxId}: ${errorMessage(error)}`);
        this.setState("started");
      }
    })();
    this.transitionPromise = transition;
    void transition.then(
      () => this.clearTransition(transition),
      () => this.clearTransition(transition),
    );
    return transition;
  }

  private beginStart(): Promise<void> {
    if (this.state === "starting" && this.transitionPromise) return this.transitionPromise;
    if (this.state === "started") return Promise.resolve();
    if (this.state !== "stopped") {
      return Promise.reject(new Error(`cannot start sandbox ${this.handle.sandboxId} while ${this.state}`));
    }

    const at = this.now();
    if (this.stoppedAt !== undefined) {
      this.counters.stoppedMs += Math.max(0, at - this.stoppedAt);
      this.stoppedAt = undefined;
    }
    this.setState("starting", at);
    const transition = (async () => {
      let lastError: unknown;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        if (attempt > 0) await delay(START_RETRY_DELAY_MS);
        try {
          await this.handle.start();
          this.counters.startCount += 1;
          this.setState("started");
          return;
        } catch (error) {
          lastError = error;
          this.counters.startFailures += 1;
          this.log(
            `sandbox sleep start attempt ${attempt + 1} failed for ${this.handle.sandboxId}: ${errorMessage(error)}`,
          );
        }
      }

      const stoppedAt = this.now();
      this.stoppedAt = stoppedAt;
      this.setState("stopped", stoppedAt);
      throw lastError;
    })();
    this.transitionPromise = transition;
    void transition.then(
      () => this.clearTransition(transition),
      () => this.clearTransition(transition),
    );
    return transition;
  }

  private async ensureStarted(): Promise<void> {
    this.cancelPendingStop();
    while (true) {
      this.assertOpen();
      if (this.state === "started") return;
      if (this.state === "stopPending") {
        this.cancelPendingStop();
        continue;
      }
      if (this.state === "stopping") {
        await this.transitionPromise;
        continue;
      }
      if (this.state === "stopped") {
        await this.beginStart();
        return;
      }
      if (this.state === "starting") {
        await this.transitionPromise;
        return;
      }
      throw this.closedError();
    }
  }

  private finishOperation(): void {
    this.activeOperations -= 1;
    if (this.activeOperations !== 0) return;
    for (const resolve of this.idleWaiters) resolve();
    this.idleWaiters.clear();
    this.armPendingStop();
  }

  private async operation<T>(run: () => Promise<T>): Promise<T> {
    this.assertOpen();
    this.cancelPendingStop();
    while (true) {
      await this.ensureStarted();
      this.assertOpen();
      if (this.state !== "started") continue;
      this.activeOperations += 1;
      break;
    }
    try {
      return await run();
    } finally {
      this.finishOperation();
    }
  }

  private waitUntilIdle(): Promise<void> {
    if (this.activeOperations === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.add(resolve));
  }

  async stop(): Promise<void> {
    this.assertOpen();
    this.cancelPendingStop();

    while (true) {
      await this.waitUntilIdle();
      this.assertOpen();
      this.cancelPendingStop();
      if (this.activeOperations !== 0) continue;
      if (this.state === "stopped") return;
      if (this.state === "stopping") {
        await this.transitionPromise;
        return;
      }
      if (this.state === "starting") {
        await this.transitionPromise;
        this.assertOpen();
        continue;
      }
      if (this.state === "started") {
        await this.beginStop();
        return;
      }
      if (this.state === "stopPending") {
        this.cancelPendingStop();
        continue;
      }
      throw this.closedError();
    }
  }

  async start(): Promise<void> {
    this.assertOpen();
    this.cancelPendingStop();
    await this.ensureStarted();
  }

  exec(
    command: string[],
    opts: { cwd?: string; env?: Record<string, string>; timeoutMs: number },
  ): Promise<SandboxExecResult> {
    return this.operation(() => this.handle.exec(command, opts));
  }

  uploadFile(localPath: string, remotePath: string): Promise<void> {
    return this.operation(() => this.handle.uploadFile(localPath, remotePath));
  }

  downloadFile(remotePath: string, localPath: string): Promise<void> {
    return this.operation(() => this.handle.downloadFile(remotePath, localPath));
  }

  readFile(remotePath: string): Promise<string> {
    return this.operation(() => this.handle.readFile(remotePath));
  }

  writeFile(remotePath: string, content: string): Promise<void> {
    return this.operation(() => this.handle.writeFile(remotePath, content));
  }

  close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    if (this.state === "closed") return Promise.resolve();
    this.closeRequested = true;
    this.cancelPendingStop();
    this.closePromise = (async () => {
      const transition = this.transitionPromise;
      if (transition) await transition.catch(() => undefined);
      this.setState("closed");
    })();
    return this.closePromise;
  }

  stats(): SandboxSleepStats {
    return { ...this.counters };
  }
}

export function wrapSandboxHandleWithSleep(
  handle: SandboxHandle,
  options: SandboxSleepOptions,
): SleepingSandboxHandle {
  if (!Number.isFinite(options.debounceMs) || options.debounceMs < 0) {
    throw new Error("sandbox sleep debounceMs must be a non-negative finite number");
  }
  const controller = new SandboxSleepController(handle, options.debounceMs, options);
  return {
    sandboxId: handle.sandboxId,
    stop: () => controller.stop(),
    start: () => controller.start(),
    exec: (command, opts) => controller.exec(command, opts),
    uploadFile: (localPath, remotePath) => controller.uploadFile(localPath, remotePath),
    downloadFile: (remotePath, localPath) => controller.downloadFile(remotePath, localPath),
    readFile: (remotePath) => controller.readFile(remotePath),
    writeFile: (remotePath, content) => controller.writeFile(remotePath, content),
    close: () => controller.close(),
    stats: () => controller.stats(),
  };
}
