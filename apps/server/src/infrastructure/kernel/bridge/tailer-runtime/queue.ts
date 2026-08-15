import type { TraceEvent } from "@agent-kernel/protocol";

import type { TailerConfig } from "./config.js";

export interface QueueCallbacks {
  onPressure?: () => void;
  onRelease?: () => void;
}

export interface EventQueueDeps {
  config: Pick<
    TailerConfig,
    "batchSize" | "flushIntervalMs" | "queueMax" | "maxRetries" | "maxRetryDelayMs"
  >;
  insertEvents: (events: TraceEvent[]) => Promise<void>;
  callbacks?: QueueCallbacks;
  sleep?: (ms: number) => Promise<void>;
}

export class EventQueue {
  private buffer: TraceEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private flushTail: Promise<void> = Promise.resolve();
  private pressured = false;
  private readonly config: EventQueueDeps["config"];
  private readonly insertEvents: EventQueueDeps["insertEvents"];
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly onPressure?: () => void;
  private readonly onRelease?: () => void;

  constructor(deps: EventQueueDeps) {
    this.config = deps.config;
    this.insertEvents = deps.insertEvents;
    this.sleep = deps.sleep ?? ((ms) => Bun.sleep(ms));
    this.onPressure = deps.callbacks?.onPressure;
    this.onRelease = deps.callbacks?.onRelease;
  }

  push(events: TraceEvent[]): boolean {
    this.buffer.push(...events);

    if (!this.pressured && this.buffer.length >= this.config.queueMax) {
      this.pressured = true;
      console.warn(`Queue backpressure ON (${this.buffer.length} events)`);
      this.onPressure?.();
    }

    if (this.buffer.length >= this.config.batchSize) {
      void this.flush().catch((error) => {
        console.error(
          `[queue] background flush failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
    }

    return this.pressured;
  }

  flush(): Promise<void> {
    const requested = this.flushTail.then(() => this.flushOnce());
    this.flushTail = requested.catch(() => {});
    return requested;
  }

  private async flushOnce(): Promise<void> {
    const batch = this.buffer;
    this.buffer = [];

    if (batch.length === 0) {
      this.checkRelease();
      return;
    }

    await this.flushBatch(batch);
    this.checkRelease();
  }

  private async flushBatch(batch: TraceEvent[]): Promise<void> {
    if (batch.length === 0) return;

    let lastError: unknown = null;
    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        await this.insertEvents(batch);
        console.log(`Flushed ${batch.length} events`);
        return;
      } catch (error: unknown) {
        lastError = error;
        const message = error instanceof Error ? error.message : String(error);
        const delay = Math.min(1000 * Math.pow(2, attempt), this.config.maxRetryDelayMs);
        console.error(
          `Flush failed (attempt ${attempt + 1}/${this.config.maxRetries}, size=${batch.length}): ${message}. Retrying in ${delay}ms`,
        );
        await this.sleep(delay);
      }
    }

    if (batch.length === 1) {
      const bad = batch[0];
      const message = lastError instanceof Error ? lastError.message : String(lastError);
      const appSessionId = (bad as TraceEvent & { appSessionId?: string }).appSessionId;
      console.error(
        `[queue] quarantining bad event ${bad.eventId} (type=${bad.type}, session=${appSessionId}): ${message}`,
      );
      return;
    }

    const mid = Math.ceil(batch.length / 2);
    const left = batch.slice(0, mid);
    const right = batch.slice(mid);
    console.error(
      `[queue] bisecting batch of ${batch.length} into ${left.length}+${right.length} to isolate bad row`,
    );
    await this.flushBatch(left);
    await this.flushBatch(right);
  }

  start(): void {
    this.flushTimer = setInterval(() => {
      if (this.buffer.length > 0) {
        void this.flush().catch((error) => {
          console.error(
            `[queue] periodic flush failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
      }
    }, this.config.flushIntervalMs);
  }

  async stop(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }

  get queueSize(): number {
    return this.buffer.length;
  }

  get isPressured(): boolean {
    return this.pressured;
  }

  private checkRelease(): void {
    if (this.pressured && this.buffer.length < this.config.queueMax * 0.5) {
      this.pressured = false;
      console.log(`Queue backpressure OFF (${this.buffer.length} events)`);
      this.onRelease?.();
    }
  }
}
