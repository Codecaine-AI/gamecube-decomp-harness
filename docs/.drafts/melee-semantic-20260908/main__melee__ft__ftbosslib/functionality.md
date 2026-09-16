# ftbosslib Functionality Review

Reviewed and applied to the root-owned staged KB. Revision `c302741689bd67c361cd7faadb221df3193992c3`. Root applied all 93 accepted changes to staged storage and regenerated the complete final reading view. Canonical source is unchanged; live promotion has not occurred.

## Purpose and Entry Points

`ftbosslib` supplies shared helpers for Master Hand and Crazy Hand. Its 31 public functions validate slot kinds, calculate movement, search active fighters, inspect Hand state, expose Master Hand attributes, choose sounds, and dispatch player, item and camera operations. The header declares the public API at [canonical lines 12–43](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftbosslib.h#L12-L43). The `.dox` companion repeats declarations and includes private inline prototypes; it adds no runtime behavior.

## State and Data Flow

Movement commands write supplied Fighter state. `8015BE40` reports zero distance inside the threshold but still copies the raw displacement into X/Y self velocity. Outside the threshold it normalizes and scales by distance times the caller factor. It never writes Z self velocity. `8015BF74` adds capped horizontal displacement while `8015C010` replaces horizontal velocity. Facing updates both fighter facing and root joint rotation. Boundary clamping uses floor index zero and stops horizontal velocity only when position is corrected. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftbosslib.c#L57-L144).

`GetFighterGObj` returns the first matching FighterKind in the linked fighter list, or NULL. `GetMotionId` returns that fighter's motion or `ftCo_MS_DeadDown` when absent. `IsMasterHandEntry` compares the current motion against `ftMh_MS_Entry`. `ReportGObjSlotType` accepts Human, Boss and Cpu slot kinds even though the diagnostic string mentions only human and boss. These four current upstream names remain authoritative. [Lookup evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftbosslib.c#L219-L245), [entry evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftbosslib.c#L158-L165), [assertion evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftbosslib.c#L42-L50).

The later helpers retrieve a Crazy Hand private field, select one of six Master Hand attribute fields from a CPU level, choose one of four sound IDs, and return five integer attribute fields. Attribute lookup guards missing GObj, user_data and ext_attr; it does not guard every pointer on the path. Getter defaults distinguish NULL, zero and minus one. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftbosslib.c#L247-L396).

The final commands forward a scalar to player zero and present Hand fighters before an item operation, dispatch the paired item operation, set camera inputs from player coordinates with an attribute-based Z adjustment, and restore standard camera mode. Their local call sequence is clear; deeper meanings of foreign unnamed functions require separately cited foreign source. [Evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftbosslib.c#L398-L447).

## Ownership and Limits

No module-owned progression state or named file-scope gameplay aggregate appears in the complete source. Independent object and relocation review resolves the four linker sections. `.data` combines diagnostic strings with a seven-entry CPU-selection jump table. `.rodata` stores the zero Quaternion initializer. `.sdata` holds inline joint-assertion strings, while `.sdata2` holds numeric literals. Seven inherited facts receive replacement writes; initial source-only clears were rejected. The empty `.sdata2` fact inventory stays empty. See `data-review.md` and its evidence JSON for object and frozen-report hashes. [Literal and assertion evidence](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftbosslib.c#L23-L50).

Shared Fighter, Master Hand attributes and camera/item/player type meanings remain outside this TU's writable ownership. Cluster findings distinguish local behavior from family followups. No new entity, merge or shared-type changes are proposed.

## Review Artifacts

`movement/findings.md` and `state/findings.md` contain per-target behavior and naming decisions. Their coverage files plus `lead/coverage.json` account for every writable subject and existing fact. `proposal.json` is the combined dry-run candidate. Canonical and frozen-baseline rendered snapshots are stored under `games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__ftbosslib/pages/`; `reads.jsonl` records distinct readers and ranges. Renderer substitutions are hypotheses and are never evidence for their own meaning.

## Live Acceptance

The accepted proposal SHA-256 is `8a01794b17b4a3ee5b8a265180f39661680e57f178cf8beffea263ddd5df4131`. Independent decisions are in [review.json](review.json). Root completion and complete staged render are [staged-completion.json](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__ftbosslib/staged-completion.json) and [final-render.json](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__ftbosslib/final-render.json). The 62 unresolved prior facts remain explicitly deferred.

## Live Promotion Receipt

Root promoted 93 reviewed operations to the live KB. Source files are unchanged. See [completion](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__ftbosslib/staged-completion.json) and [complete final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__ftbosslib/final-render.json). Proposal and review hashes are preserved.

Live application evidence: [promotion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/8a01794b17b4a3ee5b8a265180f39661680e57f178cf8beffea263ddd5df4131/2026-09-08T14-32-30.135Z-e56bb165-4551-40e7-9c5a-cf032119fa27.receipt.json). Final source view: [final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__ftbosslib/final-render.json).
