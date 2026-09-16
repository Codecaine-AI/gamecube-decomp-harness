## JumpAerialF1

This unit implements input acceptance, entry, and animation/IASA/physics/collision callbacks for successive aerial jumps. The rendered names `ftCo_JumpAerialF1_CheckInput` and `ftCo_JumpAerialF1_Enter` are reasonable hypotheses supported by canonical behavior, not recovered original names.

### Input and exceptional paths
`ftCo_800D730C` tests motion `0x9B` first. That path uses `ft_did_jump` and directly enters the ordinary jump, bypassing the item branch. Otherwise, `jumpsUsed == 1` also uses the shared predicate, then either constructs a velocity for ItemScrewAir when holding ScBall or performs common setup and ordinary entry. The shared predicate checks remaining capacity, timed upward-stick or pressed X/Y input, and an optional timing guard. The remaining branch—literally every count other than one—uses capacity, a motion-range/command-variable gate, and upward-stick or held `0xC00` input instead. It does not use the Boolean timing mode. Successful dispatch returns true; rejection returns false.

The item initializer scales the supplied vector's x/y components, performs common setup, and calls shared aerial-jump entry with stick-timer reset enabled. These behaviors are established by canonical `ftCo_ItemScrew.c` lines 53–62 rather than its rendered name.

### Entry and cross-file lifetime
`ftCo_800D74A4` clears command variable zero and computes motion as selected base plus pre-entry used-jump count minus one. The base selector is called twice and delegates specially for Kirby. Vertical velocity uses the computed motion minus the second selected base; simplifying this to `jumpsUsed - 1` assumes both selector results agree. Horizontal velocity is stick x times `x2D0->x8`, and z is zero.

Shared `ftCo_800CBAC4` copies the stack vector into fighter self velocity, changes motion, increments used jumps once, and performs common bookkeeping and sound calls. It does not retain the vector pointer. This ordinary entry passes false, leaving the stick timer unreset. Entry then writes `x2D0->x0` or zero through the integer-cast move-state member according to reverse stick input and invokes the turn updater immediately. The shared updater consumes a move-state timer, rotates the model, and reverses facing at its midpoint. The exact union-member alias is not established here by compiled layout evidence.

### Callback behavior
Animation invokes the turn updater before checking remaining frames. When animation ends, used jumps at or above maximum select `ftCo_FallAerial_Enter`; otherwise it calls `ftCo_Fall_Enter`.

IASA forwards the object unchanged to `ftCo_JumpAerial_IASA`, whose ordered early-return predicates include command-variable gates. This is not an unconditional evaluation of every action category.

Physics scales ordinary air-drift acceleration and target-speed coefficients with `x2D0->xC` and `x10`. The delegated helper checks fast fall, otherwise applies gravity and terminal velocity, then applies thresholded horizontal steering and aerial friction. Neutral input requests zero drift and target velocity.

Collision forwards to `ft_80082F28`: accepted floor contact selects a vertical-velocity-dependent response and returns; otherwise wall-jump processing precedes cliff processing.

### Evidence boundaries
All 150 owned canonical and rendered lines were reviewed, along with all subject and link pages. No compiled section, constant placement, register assignment, or binary-layout conclusion is made for `.sdata2` or parameter identities. Duplicate historical links remain separate frozen records.

Checkpoint citation correction: the IASA retained-fact group's first locator accidentally omitted `cd` within the revision. The correct locator is `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_JumpAerialF1.c#L131-L134`; this is the owned canonical evidence read in this pass.

Status: synthesized; independent review and live promotion pending.
