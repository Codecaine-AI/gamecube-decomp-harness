## Particle runtime and resource banks

This unit prepares and registers serialized particle resources, initializes particle storage, creates particles, interprets their commands, advances motion, and retires particles and associated attachments. Effect and stage loaders distinguish fresh resources requiring relocation from previously prepared resources requiring registration only. Stage archive loading uses bank 0x40; Ground initialization also registers prepared stage resources at bank 0x1E.

`psInitDataBankLocate` rebases command, texture, palette and optional form pointers in place. Version 0 rebases every counted command-table entry; versions 0x40–0x43 rebase nonzero archive relocation entries. Palette relocation has separate single-palette, explicit-count and texture-count-sized branches. Unsupported command versions reach a traversal whose base and bounds were not initialized. `psInitDataBankLoad` publishes six logical per-bank values, with form-count validation before writes and unknown-version panic after common registry writes. `psInitDataBank` checks only `bank < 65`, not a lower bound, and relocates before registering. Registration retains resource pointers rather than copying resources or transferring archive ownership.

## Creation, interpretation and retirement

Initialization clears sixteen active lists, sixty-five bank slots, eight cached JObjs, callback state and particle accounting. It is a startup reset, not cleanup of existing live objects. `psGenerateParticle0` allocates and zeroes a particle, establishes defaults, publishes it through a supplied head or global link list, inherits optional generator identity/AppSRT state, increments child accounting, invokes `hookCreate`, clears the particle callback, and optionally interprets immediately. Life is stored as `(u16)(life + 1)`. Immediate interpretation may retire the allocation before the factory returns its pointer.

`hsd_80398F0C` forwards generator emission inputs with global-list insertion and immediate interpretation enabled, discarding the result. Ordinary emission supplies position/velocity vectors; tornado emission instead supplies zero initial position and angular/radial state interpreted by the tornado motion branch.

`hsd_8039930C` combines command execution with a simulation step. Kind bit 0x800 bypasses the step. Size and rotation interpolate incrementally; color, material, ambient and alpha-compare transitions use countdown/target state, with command handlers materializing intermediate values when needed. Commands modify motion and appearance, spawn particles and generators, propagate selected ownership and transform state, select callbacks, and maintain waits, loop targets and jump marks. Serialized indices and command streams are not generally bounds-validated. Cursor offsets and several counters narrow to their declared integer widths.

After command processing, life decrements once. Expiration calls the optional delete hook, repairs the list, decrements generator child accounting, removes AppSRT and cached-JObj state, frees the particle and decrements the live count. AppSRT final-release callbacks can change the list head, which the normal head-removal path may reread. Surviving particles execute ordinary gravity/friction motion or generator-dependent tornado motion, update an optional cached JObj, and invoke their callback. Callback result -1 jumps directly to deletion without another life decrement. The list driver uses skip bits 16–31 and retains the predecessor across removals.

Generator-specific teardown selects particles using both saved identity and generator-pointer equality. Generator lifetime extends while children or qualifying shared AppSRT users remain. AppSRT attachment counts, final-release callbacks and owner-backlink clearing are implemented in `psappsrt.c`; its population counters are not reset by particle/generator initialization alone.

## Numerical and attachment behavior

`hsd_80398F8C` implements a fixed angular offset with random azimuth around the prior velocity direction, intending to preserve speed. Its unscaled squared norm and unguarded trigonometric inputs do not guarantee that behavior for all finite velocities or nonfinite angles. `hsd_803991D8` uses a generator-typed overlay passed a particle by opcode 0xB8: displacement is target JObj translation minus effective particle position, and velocity receives `displacement * force / distance_squared` outside an inclusive capture radius. Positive force attracts; the increment magnitude is inversely proportional to distance, not distance squared.

The generator-following helper copies selected translation and extracted scale, not rotation. The eight-slot JObj setter preserves a notable source anomaly: when replacing a nonnull old entry, it unreferences the incoming JObj rather than the displaced one. The teardown overlay across separate globals is not validated as a compiled layout.

Other exceptional source behavior remains explicit rather than normalized: opcode 0xB2 updates position components sequentially using already-updated components; opcode 0xE9's alpha branch divides by timing without the RGB branch's zero-timing alternative; opcode 0xEC dereferences the generator before testing its user-function table; zero-count material/ambient setup copies RGB but not the corresponding alpha target.

## Semantic and rendered-name assessment

Supported baseline knowledge is explicitly retained in the checkpoint ledger. Five factual corrections are proposed: emitter input semantics, numerical spread limits, force subtraction direction, callback-directed deletion, and unsupported-version behavior in the combined bank initializer. Existing tentative function names remain behavioral hypotheses, not recovered identities. In particular, the rendered `psGenerateParticle` name collides with a different signature declared in `psstructs.h`.

All owned canonical and rendered pages, all 105 subjects, all 108 facts and all 26 links were restored and reviewed. The C renderer reports ten parse errors and suppresses substitutions in uncertain interpreter regions; the header reports shadowed bindings. The documentation file describes a foreign USB-server helper, not this particle implementation. Source declarations and literals do not establish compiled section extents, string pools, exception tables, or historical matching results; those claims remain unresolved.

Status: researched; no-change lead bypass; independent review and live promotion pending.
