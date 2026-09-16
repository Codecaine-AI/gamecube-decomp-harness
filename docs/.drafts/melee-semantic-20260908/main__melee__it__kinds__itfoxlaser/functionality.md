## Fox/Falco laser projectile module

The module defines a fallible common constructor, two fixed-state wrappers, a two-entry item-state table and projectile interaction callbacks. Inherited research establishes complete canonical/rendered coverage of the implementation and header; this lead independently restored and reviewed the targeted canonical and rendered evidence.

### Construction and state identity

`it_8029C504` accepts parent, requested position, motion-state ID, item kind, angle and speed. It repeatedly wraps the angle, derives facing, prepares a ray spawn request and invokes the common creator. Only a non-null result is initialized: the supplied motion state is installed with animation updates, article lifetime is set, scale is zeroed, angle/speed/spawn position are stored, and developer-display setup runs. Failure returns without dereferencing an item or reporting a result.

Angle normalization preserves inclusive endpoints 0 and 2π. Facing is positive below π/2 or above 3π/2, and negative at both boundaries and between them. NaN and non-progressing extreme values are not explicitly handled.

`it_8029C6A4` supplies state 0; `it_8029C6CC` supplies state 1. Inherited caller research identifies state 0 for ordinary Fox/Falco firing and Kirby copies. Back, up and down throw cases use state 1, while the throw callback default uses state 0. Shared callbacks do not prove identical external animation resources or all engine-level consequences. The constructor does not locally validate msid.

Evidence: [constructor and wrappers](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itfoxlaser.c#L34-L81), [ordinary firing](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftFox/ftfoxspecialn.c#L175-L208), [throw branches](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftFox/ftfoxspecialn.c#L689-L713), [Kirby copies](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftKirby/ftkirbyspecialfox.c#L240-L265).

### Updates and collision lifetime

Both states share animation, physics and collision callbacks. Animation supplies the article scale limit and divisor 11.25 to the shared helper. The helper derives XY velocity from stored speed and angle, zeros Z velocity, updates facing and orientation, grows scale by absolute speed divided by the divisor, applies bounds and returns the common update result. Physics only copies current position into the stored ray endpoint; it does not locally integrate motion.

The collision adapter ignores CollData and forwards stored/current position addresses, with a null Vec3 pointer as its fourth argument. Successful ground queries overwrite the current endpoint. FoxLaser saves that position beforehand, sets lifetime to 1.0 on contact, restores the saved position and always returns false. The inherited timer research identifies full and proportionally scaled half-life timer writes. Ray Gun reuses this adapter but forwards contact as a true collision result.

Evidence: [table and updates](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itfoxlaser.c#L20-L108), [ray animation](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/inlines.h#L139-L175), [ground query](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/itgroundcoll.c#L780-L793), [timers](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_2725.c#L1413-L1421), [Ray Gun consumer](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itlgunray.c#L77-L84).

### Interactions and reference lifetime

Clank, absorption and ordinary shield-hit callbacks return true without local state access or destruction calls. Reflection conditionally synchronizes facing with xC68 and Y rotation, then always resets scale and adds π to the wrapped trajectory angle; it returns false. Shield bounce mirrors velocity, resets scale, recomputes and wraps angle, and returns false. These callbacks do not select another local motion state.

The reference event forwards both objects to it_8026B894 and ignores its owner-match result. The helper independently clears matching owner, reflector, absorber, source-fighter, auxiliary-fighter and toucher references; clearing the source fighter also writes player sentinel 6. The notifying loop retains the old owner and can subsequently destroy flagged owned items. Local cleanup is not an unconditional survival guarantee.

Evidence: [callbacks](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itfoxlaser.c#L110-L146), [ray transformations](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/inlines.h#L177-L203), [notification and cleanup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/it_26B1.c#L474-L525).

### Semantic review outcome

Explicitly retain the inherited 75 facts and 33 links. Adopt four supported corrections: distinguish the common constructor from the colliding Spawn wrapper hypothesis, identify both physics slots, correct the null-pointer interpretation, and distinguish return policy from direct destruction. The rendered view suppresses both Spawn substitutions because of their collision; SpawnWithState provides a descriptive distinction, not recovered historical spelling.

Accept seven compiled-section fact deferrals and one constant-pool link deferral. Source establishes table and numerical behavior, not section sizes, padding, literal placement, relocations or reflection-only diagnostic provenance.

Status: synthesized; independent review and live promotion pending.
