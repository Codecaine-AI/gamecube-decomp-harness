# Mario Fireball Item

Reviewed semantic record at `c302741689bd67c361cd7faadb221df3193992c3`. All 133 C lines and 26 header lines were read in canonical and proposed-name rendered views. Independent review and live promotion are complete.

## Spawn and Initial State

`it_8029B6F8` builds a SpawnItem request from the caller's kind, facing and parent object. The supplied position becomes prev_pos with Z forced to zero; a separate helper fills the actual spawn position. Velocity and damage are initially zero, both parent fields reference the supplied object, and the request sets its flag and x40 fields before calling Item_80268B18. The result is passed straight to initialization and follow-up helpers without a null-result guard. The helper calls are documented by canonical names; their rendered aliases alone do not establish their side effects. [Spawn construction](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itmariofireball.c#L23-L44).

`it_8029B7C0` reads special attributes, sets initial velocity, passes an attribute to it_80275158, and selects state 0 through Item_80268E5C with ITEM_ANIM_UPDATE. X velocity is facing_dir times speed times cos(angle), Y is speed times sin(angle), and Z is zero. The speed and angle come from x0_float and x4_float, with x8 sent to the timer helper. [Initialization](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itmariofireball.c#L46-L59).

## State Callbacks

The one-entry ItemStateTable uses animation ID 0 in state index 0 and the animation, physics and collision callbacks. Animation decrements xD44_lifeTimer and returns whether the result is at most zero. Physics delegates to Item_ApplyFallingPhysics. These callbacks do not themselves remove the item or contain scheduling logic. [State table](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itmariofireball.c#L18-L21), [animation and physics](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itmariofireball.c#L61-L71).

Collision calls it_8026D9A0 and then tests it_8027781C. Only when the latter returns true does it compare a two-dimensional velocity magnitude with the special-attribute cutoff x10. Below the cutoff it returns true immediately. Otherwise it chooses an effect from the item-kind branch, then returns false. The exact threshold uses a strict less-than comparison; equality follows the effect path. The local calc_dist_2d_accurate helper calls sqrtf_accurate on VEC2_SQ_LEN and has no separate report target. [Collision and magnitude helper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itmariofireball.c#L73-L97).

Mario-kind items call Item_8026AE84 with the bitwise-complement sound argument and spawn effect 1147; other kinds spawn effect 1184. The source does not justify assigning a human effect name from those numbers.

## Interaction Callbacks

DmgDealt, Clanked, HitShield and Absorbed return true without reading the object. Reflected forwards the object to it_80273030 and returns that result. ShieldBounced forwards to itColl_BounceOffShield. EvtUnk forwards the object and referenced object to it_8026B894. Item removal, reflection math, shield response and reference cleanup belong to the caller or shared helper review. [Callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itmariofireball.c#L99-L132).

## Ownership and Naming

The canonical symbols remain source identities. Existing inferred spawn/init/physics names are hypotheses reviewed against these bodies. General item fields and special attributes belong to shared headers; field names and family meanings must not be promoted as owned entities here. Source declaration of the state table does not independently establish complete .data membership or .sdata2 emitted constants.

The header declares EvtUnk with Item_GObj pointers while the definition spells its second parameter HSD_GObj*. Type-alias ownership must resolve whether those spellings are equivalent; this is not evidence of an ABI mismatch. [Header](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itmariofireball.h#L1-L26).

## Review Artifacts

The librarian directory contains function-level findings, all prior-fact dispositions, proposal evidence and range receipts. Campaign unit pages preserve both owned files in canonical and rendered form. The renderer reports zero parse errors. C/header substitutions are 12/3; substituted names are not used as proof. Source-only helper and section uncertainties remain explicit in coverage and unresolved artifacts.

## Verified Live Promotion

6 proposal operations were independently reviewed and promoted. The completion receipt records unchanged source.

[Promotion receipt](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__it__kinds__itmariofireball/staged-completion.json) · [Final rendered source](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__it__kinds__itmariofireball/final-render.json)

Live promotion: [immutable live receipt](</Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/85b26f0fd3f217b011411fbb8c3a22254179b6132cecfd9f85d55d18580bb2a5/2026-09-08T14-45-22.922Z-55efda0a-a30a-46a6-9246-572f557c71bf.receipt.json>).
