# Luigi Fireball Item

Reviewed semantic record at `c302741689bd67c361cd7faadb221df3193992c3`. All 133 C lines and 24 header lines were read in canonical and proposed-name rendered views. Independent review and live promotion are complete.

## Spawn and Initial State

`it_802C01AC` builds a SpawnItem request from the caller's kind, facing and parent object. The supplied position becomes prev_pos with Z forced to zero; a separate helper fills the actual spawn position. Velocity and damage are initially zero, both parent fields reference the supplied object, and the request sets its flag and x40 fields before calling Item_80268B18. Initialization and follow-up helpers run only if the spawn result is non-null. The helper calls are documented by canonical names; their rendered aliases alone do not establish their side effects. [Spawn construction](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itluigifireball.c#L28-L51).

`it_802C027C` reads special attributes, sets initial velocity, passes an attribute to it_80275158, and selects state 0 through Item_80268E5C with ITEM_ANIM_UPDATE. X velocity is x0_float times facing_dir; Y and Z are zero. x4_float is sent to the timer helper. [Initialization](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itluigifireball.c#L53-L61).

## State Callbacks

The one-entry ItemStateTable uses animation ID 0 in state index 0 and the animation, physics and collision callbacks. Animation decrements xD44_lifeTimer and returns whether the result is at most zero. Physics delegates to Item_ApplyFallingPhysics. These callbacks do not themselves remove the item or contain scheduling logic. [State table](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itluigifireball.c#L23-L26), [animation and physics](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itluigifireball.c#L63-L73).

Collision calls it_8026D9A0 and then tests it_8027781C. Only when the latter returns true does it compare a two-dimensional velocity magnitude with the special-attribute cutoff xC. Below the cutoff it returns true immediately. Otherwise it chooses an effect from the item-kind branch, then returns false. The exact threshold uses a strict less-than comparison; equality follows the effect path. The local calc_dist_2d_accurate helper calls sqrtf_accurate on VEC2_SQ_LEN and has no separate report target. [Collision and magnitude helper](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itluigifireball.c#L75-L97).

Luigi-kind items spawn effect 1288; other kinds spawn effect 1202. No sound helper is called in this collision body. The source does not justify assigning a human effect name from those numbers.

## Interaction Callbacks

DmgDealt, Clanked, HitShield and Absorbed return true without reading the object. Reflected forwards the object to it_80273030 and returns that result. ShieldBounced forwards to itColl_BounceOffShield. EvtUnk forwards the object and referenced object to it_8026B894. Item removal, reflection math, shield response and reference cleanup belong to the caller or shared helper review. [Callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itluigifireball.c#L99-L132).

## Ownership and Naming

The canonical symbols remain source identities. Existing inferred spawn/init/physics names are hypotheses reviewed against these bodies. General item fields and special attributes belong to shared headers; field names and family meanings must not be promoted as owned entities here. Source declaration of the state table does not independently establish complete .data membership or .sdata2 emitted constants.

The four initialization/state callbacks have static forward declarations in the C file. Their later definitions omit static but retain the earlier internal linkage. The paired header exposes the spawn and interaction entry points plus the state table. [Header](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itluigifireball.h#L1-L24).

## Review Artifacts

The librarian directory contains function-level findings, all prior-fact dispositions, proposal evidence and range receipts. Campaign unit pages preserve both owned files in canonical and rendered form. The renderer reports zero parse errors. C/header substitutions are 13/1; substituted names are not used as proof. Source-only helper and section uncertainties remain explicit in coverage and unresolved artifacts.

## Verified Live Promotion

7 proposal operations were independently reviewed and promoted. The completion receipt records unchanged source.

[Promotion receipt](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__it__kinds__itluigifireball/staged-completion.json) · [Final rendered source](/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__it__kinds__itluigifireball/final-render.json)

Live promotion: [immutable live receipt](</Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/25bebba70fc0e2745ede820eea253f4f2fb36cb9ad37befbc7b7dac9fad636e1/2026-09-08T14-46-37.519Z-fdb9a371-742e-4b43-b6c0-4c9ac698dd2f.receipt.json>).
