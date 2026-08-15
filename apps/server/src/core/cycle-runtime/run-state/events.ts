import { randomUUID } from "node:crypto";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { EventType } from "@server/core/shared/types/index.js";
import { events, immediateTransaction, now, type StateStore } from "@server/core/orchestrator-state";

export function insertEvent(store: StateStore, runId: string, eventType: EventType, producer: string, payload: unknown): string {
  const id = randomUUID();
  store.orm
    .insert(events)
    .values({
      id,
      runId,
      eventType,
      producer,
      payloadJson: payload as Record<string, unknown>,
      createdAt: now(),
    })
    .run();
  return id;
}

export function addEvent(store: StateStore, runId: string, eventType: EventType, producer: string, payload: unknown): string {
  return immediateTransaction(store.db, () => insertEvent(store, runId, eventType, producer, payload));
}

export function nextUnhandledEvent(store: StateStore, runId: string): Record<string, unknown> | null {
  return (
    store.orm
      .select()
      .from(events)
      .where(and(eq(events.runId, runId), isNull(events.handledAt)))
      .orderBy(sql`CASE WHEN ${events.eventType} = 'pool_below_target' THEN 0 ELSE 1 END`, asc(events.createdAt))
      .limit(1)
      .get() ?? null
  );
}

export function markEventHandled(store: StateStore, eventId: string): void {
  immediateTransaction(store.db, () => {
    store.orm.update(events).set({ handledAt: now() }).where(eq(events.id, eventId)).run();
  });
}
