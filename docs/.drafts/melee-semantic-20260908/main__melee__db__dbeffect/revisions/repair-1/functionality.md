# Miscellaneous developer visual cycle

Pinned `c302741689bd67c361cd7faadb221df3193992c3`. All 22 canonical/rendered lines read; no owned header; render reports no parse errors or substitutions. Snapshots: `games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__db__dbeffect/pages/`.

The unit owns one signed selector and one unchecked player-index handler. It queries stored X-held and D-pad-down-pressed bits, increments the selector, resets values greater than 3 to 0, and writes the HUD hidden flag through ifAll calls. It does not consume a press edge or enforce once-per-frame dispatch. Normal values cycle 0 through 3. A negative external value can remain negative; signed overflow is not handled.

|Selector|HUD handler|Later camera/stage handling|
|---|---|---|
|0|Show|Stage shown; stage background reapplied|
|1|Hide if needed|Stage shown; stage background reapplied|
|2|Hide if needed|Stage hidden; white camera background|
|3|Hide if needed|Stage hidden; black camera background|

The later camera/stage writes require their own qualifying shortcut checks. They are not performed directly by this TU. The frame dispatcher calls all four visual handlers first, so simultaneous controller events can advance shared state several times before camera and stage handling observes the final selector. Hand-boss processing refreshes only two slots but invokes all four handlers, which can expose stale press bits.

`ifAll_HideHUD` and `ifAll_ShowHUD` merely set/clear a shared hidden flag; the HUD display callback tests it before rendering. This handler does not destroy HUD objects. No-input calls leave selector and HUD alone, including any externally introduced mismatch.

Canonical source declares `db_MiscVisualEffectsStatus` as a signed C int with static storage duration and implicit zero initialization. The existing object section headers report 4 bytes for the source artifact and 8 bytes for the target artifact. Those observations have unverified build provenance and do not establish pinned symbol extents, section membership, or the meaning of the additional bytes. Padding versus additional payload remains unresolved. The identical inferred alias is cleared because it adds no hypothesis beyond the source name; the variable name is not proof of the entire section identity.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbeffect.c#L4-L21, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L163-L229, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbinit.c#L247-L255, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L130-L144, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/db/dbcamera.c#L317-L328, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/if/ifall.c#L134-L157.

All 4 subjects, 16 inherited facts and 3 exact outgoing relationships are reviewed. Dry-run only; shared-KB application remains independent review work.

Repair 1 supersedes the held proposal and section-layout interpretation only. The original packet and independent review are archived; a fresh independent review is required. The section-target relationship is reviewed but unresolved.
