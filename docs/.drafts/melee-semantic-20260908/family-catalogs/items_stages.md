# Items and Stages Family Catalog

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Snapshot `2026-09-09T04:19:59.279830+00:00`.

Coverage indexes 260 TUs; 186 have an accepted review matching current proposal bytes. Seven functionality packets received close reading. This draft does not close pending research, review, reconciliation or rendering.

## Coverage and Evidence

All 260 inventory artifact paths hashed where present. Followups and unresolved entries indexed verbatim. Seven functionality packets close-read; selected canonical ranges independently checked with git show at manifest revision. One saved dynamic-attribute rendered body and metadata inspected. Keyword clusters overlap and include explicitly marked pending tasks; not a canonical rereview of all 260 TUs.

Inventory SHA-256 `b80d542654dd66ad5ee7cc463c53c96f2cc5e5f4504903c3f813ad30c243f578`. Task-state SHA-256 `9bcbd7e128ade35d17b37b32c937e46e3e166d2c3fb7ce8f0f148b6cb2aebc5d`. Manifest SHA-256 `1b5ad02d910c5ffb667eeca97079b786287ad02a7bb85945fd92865488e6eb9d`.

| Review status | TUs |
|---|---:|
| missing | 74 |
| accepted_for_staged_apply | 186 |

Exact artifact hashes, scheduler states, unresolved entries and accepted-review booleans are in [items_stages.json](items_stages.json). Missing files have explicit missing markers. Statuses can change after this snapshot.

## Functionality and Naming Patterns

### State indices and animation IDs are separate

Capsule and Heart state tables install animation, physics and collision callbacks. Shared callback rows do not imply distinct animations. The common state changer removes animations and clears the script for anim_id=-1, while still installing callbacks.

Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/item.c#L1180-L1242`, `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itheart.c#L28-L38`.

### Falling physics uses a pre-update threshold

it_80272860 compares velocity sign and magnitude before subtracting acceleration. It can step past the threshold; a strict terminal-velocity clamp is an inaccurate family description.

Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_2725.c#L176-L204`.

### Container dynamics count is not a visual effect ID

lb_800119DC copies position into a type-2 descriptor and stores argument 1 in unk_count0. Capsule documentation correctly treats 0x78 as that count. Do not infer smoke or a visual-effect identity from this argument.

Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/lb/lb_00F9.c#L1065-L1080`.

### Fighter articles have owner-dependent lifetimes

Fox Illusion final animation checks owner removal before decrementing the second timer. The article need not exhaust both configured lifetimes. Final physics updates only the optional secondary translation, according to the accepted functionality packet.

Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itfoxillusion.c#L197-L239`.

### Stage modules register data and delegate common setup

grtmario.c owns StageCallbacks and StageData linking Gr_Kind_TMario, /GrTMr.dat and lifecycle functions. Its factory delegates to common Ground setup. File names and resource identifiers aid navigation; shared helper effects require their own source evidence.

Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grtmario.c#L43-L117`.

### Dynamic stage region removal is asymmetric

Removing the head recycles it. Removing a matched non-head only unlinks it; an absent non-NULL node is inserted into the available list. Update decrements only positive lifetimes. Get returns the first connected region strictly inside its XY radius, including zero-valued attributes.

Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grdynamicattr.c#L53-L116`.

### Rendered names describe hypotheses

The saved dynamic-attribute rendering substitutes grDynamicAttr_Remove, Update and Get. Remove does not guarantee recycling for every node. Stage_SelectAndLoadData is the accepted stage packet proposal for one of two colliding Stage_Init aliases. Original spelling and rendering consistency remain distinct questions.

Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/gr/grdynamicattr.c#L53-L116`.

## Reconciliation and Unresolved Work

### Container Smoke

Capsule corrects dynamics-count versus smoke-ID wording; inspect sibling container packets before changing any foreign fact. No new specific sibling error was established here.

### Animation Clamp

Capsule and Heart both reject animation-update implies animation reload and strict fall-speed clamp wording. Common item owner review is absent in this snapshot; these canonical findings remain usable but are not common-owner acceptance.

### Renderer Collision

Stage packet reports colliding Stage_Init aliases and C/header inconsistency for stGetPlyDeadUp. Heart and Fox packets report shadowed_binding. These are existing packet findings, not newly reproduced renderer defects.

### Section Evidence

Most inspected item packets defer compiled layout. grdynamicattr supplies source/target object evidence and a saved final rendering. Its evidence does not establish sibling section layouts.

### Pending Footer

Several accepted functionality packets retain pending-review prose. Coverage records current review hash, proposal hash and scheduler status separately. No campaign-wide application or final-render claim is made.

No new contradictory accepted proposal was proven in this bounded family review. The concrete corrections above are already present in close-read packets; propagation to siblings and common owners remains open. Preserve owner links, runtime-attribute uncertainty, non-clamping physics, no-animation rows and callback exceptions when consolidating summaries.

## Rendered Evidence

The saved grdynamicattr final-render metadata targets the staged DB at the pinned revision. Its rendered Remove body preserves the non-head unlink branch and substitutes semantic names. The catalog hashes the inspected saved body and metadata; it does not rerender the campaign or infer live application from that metadata. Other renderer issues above are attributed to accepted task artifacts.

## Followup Index

| Discovery cluster | Distinct tasks |
|---|---:|
| animation_physics | 34 |
| ownership_lifetime | 68 |
| stage_camera_collision | 39 |
| compiled_layout | 75 |
| naming_renderer | 61 |

Clusters are keyword indexes, not adjudications. Each entry preserves its originating task and accepted-review flag. Start reconciliation with the common item transition and fall-physics owners, then check container dynamics wording against lb_800119DC.
