# Slice 5 — Events + Tracing (implementation spec)

Authority: docs/10-system-design/03-state-and-events/40-project-events (render
it), 10-authority-and-actions (envelope), 80-operator-view (recent_events).
Input inventory: the event-catalog coverage matrix in this directory's
inventory.md (verbatim from the read-only audit — findings referenced below
by its numbering). Slices 1-4 primitives in force. Contract wins.

Ground rules unchanged: one event per accepted durable revision; loud
failure; no timers; manual control; temp dirs; explicit bun test paths;
never touch live state (coordinator migrates); no git state ops.

## Deliverable E1 — convention unification + payload registry (single owner)

1. Correlation: correlation_id is REQUIRED and explicit at every emitter —
   it names the user-visible workflow (run id, sync id, campaign id, session
   uuid for session-lifecycle, command id ONLY for pure project-level
   operator commands with no workflow). Remove all defaulting chains
   (inventory #7.1). The PR emitters honor caller-supplied correlation
   (dead-field fix). Lease handoffs: the release and the successor's
   acquisition/activation share the handoff causation chain — successor's
   first event carries causation_id = the release event id and its OWN
   workflow correlation (fix the settlePausedRun break, #7.2).
2. Causation: event-id causation when caused by a durable event; command-id
   causation for operator/system commands; ONE command id minted per
   operator action and shared by all its events (fix runs.ts per-call
   minting); sub-steps use span structure, not command-id suffix strings.
3. Spans: add parent_span_id column (idempotent migration 016) and a single
   span scheme: span-<uuid> leaf spans with parent_span_id linking to the
   action's root span; the composite-string span ids (knowledge.ts) and
   deterministic stableId spans convert to the scheme (deterministic ids
   stay deterministic, prefixed consistently).
4. Actor: fix actorForProducer (supervisor/dashboard producer ≠ operator —
   map producers explicitly; guardian for babysit/guardian paths, runner for
   scheduler/supervisor, operator only for authenticated operator commands);
   one operator action yields ONE actor across all its events (fix
   sync publish operator/runner mix, #7.7).
5. Payload registry: a shared registry mapping event_type → required payload
   facts (from the contract table + derived status events), enforced in
   appendProjectEvent for EVERY domain (dispatch/run/session included);
   schema_version bumps when a payload shape changes (start: all 1, registry
   carries the version). Unknown event types are rejected (the registry IS
   the catalog; extra events from #3 of the inventory get registered
   explicitly with a documented rationale or removed).
6. Transition-vs-progress honesty: non-status revisions get their own event
   types (sync.staging_progressed instead of repeated sync.reconciling,
   #7.6); status-named events fire exactly once per status entry.
7. Gap fills (#4): session closing/blocked/complete transitions emit named
   events; the save-point failure spool replays into project_events on next
   successful open (marked replayed, no duplicates); dispatch
   handoff_snapshot_id implemented minimally (the release records the
   handoff evidence snapshot id it already writes — or the field + docs are
   removed via a dated decision if genuinely superfluous: implement, don't
   remove, unless implementation proves circular); event payloads stop
   serving as durable state (getSyncBlockedOriginStatus and
   validationEvidence read from sync_state columns added in migration 016,
   not event payloads).
8. subject_kind registry documented in code; dispatch drain/blocked events
   keep workflow subjects but the read API (E2) exposes the project dispatch
   stream as a join — no double events.

## Deliverable E2 — event read API + reconstruction

- /api/events: query by correlation_id, subject (kind+id), event_type
  prefix, sequence range; paginated; plus /api/events/reconstruct?
  correlation_id= returning the ordered lifecycle with caused_by links
  resolved (the trace demo as an endpoint).
- projectState.recent_events in the read model (contract 80-operator-view)
  from the same query layer.

## Deliverable E3 — kernel-trace linkage

- Bridge enrichment: workflow-trace submissions carry correlation_id,
  project event_id, and caused_by_event_id in eventData metadata; the
  kernel appSessionId/containerId is recorded on ProjectState.trace cursor
  (or session kernel_trace_json extension) so event→kernel-span joins are
  durable both directions. No kernel schema changes (packages/agent-kernel
  is pinned — bridge-side only).

## Deliverable E4 — frontend trace surface

- Trace page gains a project-event timeline: pick a workflow (run/sync/
  campaign/session), render the reconstruction endpoint's lifecycle with
  event type, actor, payload summary, caused-by links, and kernel-trace
  deep links where the metadata joins. Server projections only.

## Deliverable E5 — docs absorption (events contract → system-design)

- docs/10-system-design/03-state-and-events/40-project-events plus its child
  bundles absorb the events contract content as present-state truth: envelope, emission
  rule, correlation/causation/span/actor conventions (as unified by E1),
  the registered catalog, per-series subjects, recovery events. Structure
  rule: parent stays compact; content in children (add children if the
  handshake page would exceed one concept area). Dated decision callouts
  mirrored (one-event-per-transition 2026-08-12). After this lands, the
  70-events page's facts must ALL exist here (absorption checklist in the
  report). Render+audit 0/0 + links check.

## Verification (coordinator)

Full suites; migration dry-run on real melee copy then live (016); the
reconstruction endpoint walked against a seeded lifecycle spanning
run drain → sync publish → campaign activation (cross-workflow causation
chain intact); adversarial review + repairs; absorption checklist for
70-events.
