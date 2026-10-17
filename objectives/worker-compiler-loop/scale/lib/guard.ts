/**
 * Hard cost guard. One `CostGuard` lives in the orchestrator process; worker
 * children reach it through the control server (`SCALE_CONTROL_URL`), so a
 * build sandbox a child creates counts against the same limits as the worker
 * sandboxes the orchestrator provisions.
 *
 * Limits:
 * - `maxAlive`: sandboxes created and not yet deleted. A create beyond it is refused.
 * - `maxSandboxMinutes`: summed alive time of every sandbox this run created,
 *   deleted or not, counted from admission (startup included). A create that
 *   fails after admission still counts: the sandboxes it allocated until they
 *   are deleted, its admitted time when it provably allocated nothing, and
 *   until a list by its attempt label settles it when that is unknown.
 *   Reaching it trips the guard: creates are refused and the orchestrator
 *   runs the kill switch.
 * - `allowBuildSandboxes`: worker attempts should need none (plan 3.6). When
 *   false, a build-sandbox create is refused and recorded as a failure.
 */
import { errorText, type EventSink } from "./events.js";
import type { CreateAdmission } from "./daytona.js";

export interface GuardLimits {
  maxAlive: number;
  maxSandboxMinutes: number;
  allowBuildSandboxes: boolean;
}

export class CostGuardError extends Error {
  constructor(message: string) {
    super(`cost guard: ${message}`);
    this.name = "CostGuardError";
  }
}

/** `sandbox`: created; `failed_allocation`: allocated by a create that failed; `failed_create`: an admitted create that allocated nothing; `unconfirmed`: a failed create whose allocations are unknown. */
type EntryKind = "sandbox" | "failed_allocation" | "failed_create" | "unconfirmed";
interface Entry { purpose: string; createdAt: number; deletedAt: number | null; kind: EntryKind }
interface Reservation { purpose: string; admittedAt: number; requestId: string | null }

export class CostGuard implements CreateAdmission {
  private readonly entries = new Map<string, Entry>();
  private readonly reservations = new Map<string, Reservation>();
  private nextReservation = 1;
  private trippedReason: string | null = null;
  private readonly onTrip: Array<(reason: string) => void> = [];
  peakAlive = 0;
  refusedCreates = 0;
  buildCreatesRefused = 0;

  constructor(readonly limits: GuardLimits, private readonly sink: EventSink, private readonly now: () => number = Date.now) {}

  get tripped(): string | null { return this.trippedReason; }

  whenTripped(listener: (reason: string) => void): void { this.onTrip.push(listener); }

  alive(): number {
    let count = 0;
    for (const entry of this.entries.values()) if (entry.deletedAt === null) count += 1;
    return count;
  }

  /** Admitted creates still in flight, counted from admission. */
  private get pending(): number { return this.reservations.size; }

  sandboxMinutes(): number {
    const at = this.now();
    let ms = 0;
    for (const entry of this.entries.values()) ms += (entry.deletedAt ?? at) - entry.createdAt;
    for (const reservation of this.reservations.values()) ms += at - reservation.admittedAt;
    return ms / 60_000;
  }

  /** Ids of every sandbox still alive (the kill switch's in-process view); unconfirmed allocations have no id. */
  aliveIds(): string[] {
    return [...this.entries].filter(([, entry]) => entry.deletedAt === null && entry.kind !== "unconfirmed").map(([id]) => id);
  }

  trip(reason: string): void {
    if (this.trippedReason) return;
    this.trippedReason = reason;
    this.sink.emit({ kind: "control", action: "guard_tripped", detail: { reason, alive: this.alive(), sandbox_minutes: this.sandboxMinutes() } });
    for (const listener of this.onTrip) {
      try { listener(reason); } catch (error) { console.error(`[scale] guard trip listener failed: ${errorText(error)}`); }
    }
  }

  /** Periodic budget check; returns the trip reason when it trips. */
  check(): string | null {
    if (!this.trippedReason && this.sandboxMinutes() >= this.limits.maxSandboxMinutes) {
      this.trip(`sandbox-minutes ${this.sandboxMinutes().toFixed(1)} reached the limit ${this.limits.maxSandboxMinutes}`);
    }
    return this.trippedReason;
  }

  async admitCreate(purpose: string, requestId?: string | null): Promise<string> {
    const refuse = (message: string): never => {
      this.refusedCreates += 1;
      this.sink.emit({ kind: "control", action: "create_refused", detail: { purpose, message } });
      throw new CostGuardError(message);
    };
    if (this.trippedReason) refuse(`tripped (${this.trippedReason})`);
    if (purpose === "build" && !this.limits.allowBuildSandboxes) {
      this.buildCreatesRefused += 1;
      this.sink.emit({ kind: "failure", failureKind: "build_sandbox_requested", detail: "a worker attempt asked for a build sandbox" });
      refuse("build sandboxes are not allowed in this run (--allow-build-sandboxes)");
    }
    if (this.alive() + this.pending >= this.limits.maxAlive) refuse(`max alive sandboxes ${this.limits.maxAlive} reached`);
    if (this.sandboxMinutes() >= this.limits.maxSandboxMinutes) {
      this.trip(`sandbox-minutes limit ${this.limits.maxSandboxMinutes} reached`);
      refuse("sandbox-minutes limit reached");
    }
    const id = `reservation-${this.nextReservation++}`;
    this.reservations.set(id, { purpose, admittedAt: this.now(), requestId: requestId ?? null });
    return id;
  }

  /** The reservation `id` names, else the oldest one for `purpose` (callers that keep no id). */
  private takeReservation(id: string | void, purpose?: string): [string, Reservation] | null {
    const key = id && this.reservations.has(id) ? id : [...this.reservations].find(([, r]) => purpose === undefined || r.purpose === purpose)?.[0];
    if (!key) return null;
    const reservation = this.reservations.get(key)!;
    this.reservations.delete(key);
    return [key, reservation];
  }

  async created(sandboxId: string, purpose: string, reservationId?: string | void): Promise<void> {
    const taken = this.takeReservation(reservationId, purpose);
    this.entries.set(sandboxId, { purpose, createdAt: taken?.[1].admittedAt ?? this.now(), deletedAt: null, kind: "sandbox" });
    this.peakAlive = Math.max(this.peakAlive, this.alive());
  }

  /** A create that failed after admission: see `CreateAdmission.release`. */
  release(reservationId?: string | void, allocations: string[] | null = []): void {
    const taken = this.takeReservation(reservationId);
    if (!taken) return;
    const [key, reservation] = taken;
    if (allocations === null) {
      this.entries.set(`unconfirmed:${reservation.requestId ?? key}`, { purpose: reservation.purpose, createdAt: reservation.admittedAt, deletedAt: null, kind: "unconfirmed" });
    } else if (allocations.length === 0) {
      this.entries.set(`failed-create:${key}`, { purpose: reservation.purpose, createdAt: reservation.admittedAt, deletedAt: this.now(), kind: "failed_create" });
    } else {
      for (const id of allocations) {
        if (!this.entries.has(id)) this.entries.set(id, { purpose: reservation.purpose, createdAt: reservation.admittedAt, deletedAt: null, kind: "failed_allocation" });
      }
    }
    this.peakAlive = Math.max(this.peakAlive, this.alive());
  }

  /** A list by a failed create attempt's label settles its unconfirmed entry: the listed ids stay counted from its admission. */
  allocationsListed(requestId: string, ids: string[]): void {
    const key = `unconfirmed:${requestId}`;
    const entry = this.entries.get(key);
    if (!entry || entry.deletedAt !== null) return;
    this.entries.delete(key);
    if (ids.length === 0) {
      this.entries.set(`failed-create:${requestId}`, { ...entry, deletedAt: this.now(), kind: "failed_create" });
      return;
    }
    for (const id of ids) {
      if (!this.entries.has(id)) this.entries.set(id, { ...entry, kind: "failed_allocation" });
    }
  }

  async deleted(sandboxId: string): Promise<void> {
    const entry = this.entries.get(sandboxId);
    if (entry && entry.deletedAt === null) entry.deletedAt = this.now();
  }

  summary(): Record<string, unknown> {
    const byPurpose: Record<string, number> = {};
    const byKind: Record<string, number> = {};
    for (const entry of this.entries.values()) {
      byKind[entry.kind] = (byKind[entry.kind] ?? 0) + 1;
      if (entry.kind === "sandbox") byPurpose[entry.purpose] = (byPurpose[entry.purpose] ?? 0) + 1;
    }
    return {
      limits: this.limits,
      created: byKind.sandbox ?? 0,
      failed_creates: { allocated: byKind.failed_allocation ?? 0, allocated_nothing: byKind.failed_create ?? 0, unconfirmed: byKind.unconfirmed ?? 0 },
      created_by_purpose: byPurpose,
      alive: this.alive(),
      peak_alive: this.peakAlive,
      sandbox_minutes: Number(this.sandboxMinutes().toFixed(3)),
      refused_creates: this.refusedCreates,
      build_creates_refused: this.buildCreatesRefused,
      tripped: this.trippedReason,
    };
  }
}

/** Child-side admission: the orchestrator's guard over HTTP. */
export function httpAdmission(controlUrl: string): CreateAdmission {
  const call = async (path: string, body: unknown) => {
    const response = await fetch(`${controlUrl}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const text = await response.text();
    if (!response.ok) throw new CostGuardError(text);
    return text;
  };
  return {
    admitCreate: (purpose, requestId) => call("/admit", { purpose, requestId }),
    created: (sandboxId, purpose, reservationId) => call("/created", { sandboxId, purpose, reservationId }).then(() => undefined),
    deleted: (sandboxId) => call("/deleted", { sandboxId }).then(() => undefined),
    release: (reservationId, allocations) => call("/release", { reservationId, allocations }).then(() => undefined),
    allocationsListed: (requestId, ids) => call("/listed", { requestId, ids }).then(() => undefined),
  };
}

/** The orchestrator's control server: the guard for children, plus a status endpoint. */
export function startControlServer(guard: CostGuard): { url: string; stop(): void } {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const path = new URL(request.url).pathname;
      try {
        if (request.method === "GET" && path === "/status") return Response.json(guard.summary());
        const body = await request.json() as { purpose?: string; sandboxId?: string; requestId?: string | null; reservationId?: string; allocations?: string[] | null; ids?: string[] };
        if (path === "/admit") return new Response(await guard.admitCreate(body.purpose ?? "build", body.requestId ?? null));
        if (path === "/created") { await guard.created(String(body.sandboxId), body.purpose ?? "build", body.reservationId); return new Response("ok"); }
        if (path === "/release") { guard.release(body.reservationId, body.allocations === undefined ? null : body.allocations); return new Response("ok"); }
        if (path === "/listed") { guard.allocationsListed(String(body.requestId), body.ids ?? []); return new Response("ok"); }
        if (path === "/deleted") { await guard.deleted(String(body.sandboxId)); return new Response("ok"); }
        return new Response("not found", { status: 404 });
      } catch (error) {
        return new Response(errorText(error), { status: 403 });
      }
    },
  });
  return { url: `http://127.0.0.1:${server.port}`, stop: () => server.stop(true) };
}
