import { resolve } from "node:path";

import type { GlobalArgs } from "@server/core/game-registry/runtime-options.js";
import { gameKnowledgeRoot } from "@server/core/knowledge/paths.js";
import { openKnowledgeStore, type KnowledgeStore } from "../storage/store.js";
import { runLibrarianConsumer } from "./consumer.js";

const DEFAULT_CONCURRENCY = 4;
const DEFAULT_INTERVAL_MS = 5_000;
const DEFAULT_STOP_MAX_WAIT_MS = 15_000;

export interface LibrarianLaneOptions {
  runId: string;
  globals: GlobalArgs;
  gameId?: string;
  concurrency?: number;
  intervalMs?: number;
  shouldClaim?: () => boolean;
  openKnowledgeStore?: (gameId: string) => KnowledgeStore;
  runConsumer?: typeof runLibrarianConsumer;
  log?: (message: string) => void;
}

export function startLibrarianConsumerLane(
  options: LibrarianLaneOptions,
): (stopOptions?: { maxWaitMs?: number }) => Promise<void> {
  const gameId = options.gameId ?? options.globals.game?.gameId ?? options.globals.gameId ?? "melee";
  const store = (options.openKnowledgeStore ?? ((id) => openKnowledgeStore({ gameId: id })))(gameId);
  const consume = options.runConsumer ?? runLibrarianConsumer;
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const failedIds = new Set<string>();
  const controller = new AbortController();
  let stopped = false;
  let wakeSleep: (() => void) | null = null;

  const sleep = (delayMs: number): Promise<void> => {
    if (stopped) return Promise.resolve();
    return new Promise((done) => {
      const timer = setTimeout(finish, delayMs);
      function finish(): void {
        clearTimeout(timer);
        wakeSleep = null;
        done();
      }
      wakeSleep = finish;
    });
  };

  const loopPromise = (async () => {
    while (!stopped) {
      if (options.shouldClaim?.() === false) {
        await sleep(intervalMs);
        continue;
      }

      try {
        const summary = await consume(store, {
          runId: options.runId,
          globals: options.globals,
          concurrency: options.concurrency ?? DEFAULT_CONCURRENCY,
          signal: controller.signal,
          shouldClaim: options.shouldClaim,
          quiet: true,
          exclude: failedIds,
          prsRoot: resolve(gameKnowledgeRoot(gameId), "sources/code_context/past_prs/data/prs"),
        });
        for (const taskId of summary.failedTaskIds) failedIds.add(taskId);

        if (summary.passesRun > 0 || summary.tasksSplit > 0) {
          (options.log ?? console.log)(
            `[librarian-consumer] drained: ${summary.passesRun} passes (${summary.passesApplied} applied, ${summary.passesFailed} failed), ${summary.tasksSplit} split; ${summary.tasksRemaining} remaining`,
          );
        }

        if (summary.aborted) {
          console.warn("[librarian-consumer] librarian pass aborted; retrying after backoff");
          await sleep(intervalMs * 10);
        } else if ((summary.passesRun === 0 && summary.tasksSplit === 0) || summary.paused || summary.stopped) {
          await sleep(intervalMs);
        }
      } catch (error) {
        console.error("[librarian-consumer] librarian pass failed", error);
        await sleep(intervalMs * 10);
      }
    }
  })();

  return async (stopOptions = {}) => {
    stopped = true;
    controller.abort();
    wakeSleep?.();

    const maxWaitMs = stopOptions.maxWaitMs ?? DEFAULT_STOP_MAX_WAIT_MS;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const finished = await Promise.race([
      loopPromise.then(() => true),
      new Promise<false>((resolveDeadline) => {
        deadline = setTimeout(() => resolveDeadline(false), maxWaitMs);
      }),
    ]);
    if (deadline !== undefined) clearTimeout(deadline);

    if (finished) {
      store.close();
      return;
    }
    console.warn(
      `[librarian-consumer] shutdown abandoned an in-flight librarian pass after ${maxWaitMs}ms`,
    );
  };
}
