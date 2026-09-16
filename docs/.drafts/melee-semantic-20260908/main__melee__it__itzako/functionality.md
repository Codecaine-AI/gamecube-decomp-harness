## Shared Zako item utilities

`itzako.c` supplies construction, initialization, damage movement, terrain-relative orientation, collision completion, reward spawning, and generator notifications for item-backed stage actors. It also contains a separate Game & Watch article-configuration helper.

### Construction and initialization
`it_8027B5B0` prefers an explicit position, otherwise transforms a supplied joint. With neither, it reports an error and loops indefinitely. Optional velocity defaults to zero; `use_init == 1` selects `Item_80268B18`, otherwise `Item_80268B5C`. Successful creation retains the supplied joint and initializes the generator index to -1. Generator registration subsequently replaces that sentinel. `it_8027B730` is a distinct shared reset that clears the joint, restores the upward orientation vector, and zeroes the three auxiliary fields.

### Movement and orientation
The damage-vector calculator implements the special angle-361 ground/air behavior. Its true result identifies only the grounded branch whose candidate velocity forms an acute angle with the floor normal; airborne output returns false. The reaction-velocity helper selects calculated knockback or collision response, then normalizes and scales the result. The camera-launch helper writes a randomized camera-directed vector but retains an `int` declaration without a return statement; its original return contract remains uncertain.

The Euler helper applies X, Y, then Z rotations in place. Surface orientation tracks a target normal and integer interpolation countdown, requires the selected floor or ceiling contact, and reconstructs JObj rotation from a basis. The optional-direction variant remains floor-gated and uses world-up when its vector argument is NULL, not the current floor normal. Rotation reset establishes a quarter-turn-scaled yaw and clears interpolation state. Tangent velocity uses the incoming three-dimensional magnitude and an approximately perpendicular XY transform of the supplied normal; speed preservation requires an approximately unit-length XY normal.

### Collision and lifetime distinctions
The constant-false helper has no side effects. The repeated-impact callback responds to low-nibble collision results, selects a non-repeating sound, updates reaction velocity, and returns true after the impact counter strictly exceeds its configured limit. It attempts a reward but does not directly notify the generator. The optional-callback collision helper attempts the reward before invoking the callback: a zero callback result suppresses completion notification, not the preceding reward attempt.

Thrown and dropped preparation are distinct. Both consume owner facing; thrown preparation additionally establishes source-player attribution. Neither directly chooses an actor-specific motion state. Reset clears planar velocity and owner, without explicitly clearing Z velocity.

Ordinary destruction and defeat notifications invoke different generator handlers. Defeat first attempts KO attribution, then handles Coin entries or clears a valid indexed actor entry, applies respawn policy, and invalidates the actor index. That invalidation protects later indexed cleanup, but does not itself prevent repeated scoring calls. Numeric item event categories 6/7 and 9 select different damage increments; their more specific meanings remain unassigned.

### Rewards and articles
Trophy spawning is gated by 1P mode, randomness, stage selection, and a shared counter. Only successful creation starts the counter at one. Nonzero counter advancement occurs only on calls that pass the outer gates. An empty candidate list retains the original ground identifier. The created variant-0 Coin stores the selected display identifier.

Game & Watch article attachment occurs in the calling inline before `it_8027CE64`. This helper applies fighter-derived configuration and retains the attribute pointer. Visual queries use the explicit fighter argument, while controller lookup uses `item->owner`; these inputs should not be conflated.

### Semantic review
Existing supported explanations and names are explicitly retained in the checkpoint ledger. Two changes are proposed: narrow the fighter-capture predicate name to its enemy-capture subset, and qualify tangent-velocity speed preservation. Five compiled-section claims remain unresolved because source expressions cannot establish section membership, byte extent, or alignment gaps. All owned canonical and rendered pages, all 80 subjects, and all 26 links were enumerated. Header rendering reports `shadowed_binding` for the spawn and trophy-spawn declarations; this is a renderer issue rather than contrary semantic evidence.

Status: synthesized; independent review and live promotion pending.
