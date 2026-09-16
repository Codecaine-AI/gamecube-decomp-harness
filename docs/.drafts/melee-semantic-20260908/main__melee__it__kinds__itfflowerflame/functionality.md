## Fire Flower flame article

The translation unit defines a five-entry ItemStateTable, a fallible constructor, two model-control APIs, and Logic41 lifecycle callbacks. All five table rows store animation identifier zero; row indices and animation identifiers must not be conflated.

### Construction and persistent model state

`it_8029A748` constructs `It_Kind_F_Flower_Flame`, copies the supplied previous position while zeroing its Z component, obtains the spawn position through a shared helper, records facing and both parent references, and initializes zero damage and velocity. A NULL creation result skips every created-item dereference. Success initializes lifetime from the first special-attribute float, associates the article with the supplied parent and part, clears the shared x15 flag, and caches joint 2's translation.

`it_8029A89C` guards both the object and Item user data, caches a scalar, and immediately applies uniform XYZ scale to joint 1. `it_8029A8F4` has the same object guards but writes only joint 2's translation as cached base plus supplied offset; it does not update the cached base. States 0, 1, 3 and 4 restore that base translation, whereas held state 2 does not.

The inspected fighter caller stores the created article in `Fighter.x1980`, reuses an existing article, and calculates scale and offset from fighter-side progression and attributes. Clearing that fighter reference is a separate operation and is not itself proof of article destruction. The constructor's parent parameter remains spelled `Item_GObj*`, although this caller supplies a fighter GObj.

### State behavior

- **0:** Entry clears all velocity components and selects state 0. Animation restores scale and cached translation, then returns false. Physics is empty. Terrain processing updates collision position/floor and enters state 1 on loss of support. The shared helper also has a supported-floor branch calling `Item_8026ADC0`; the wrapper's false return does not negate delegated side effects.
- **1:** Entered by the local falling-state helper and explicitly by Dropped, which passes literal transition value 6. Animation restores model state and decrements article lifetime. Physics forwards fall attributes to the shared sign/speed-gated acceleration helper; this is not a hard clamp of newly computed velocity. Collision returns `it_8026DF34` unchanged.
- **2:** Selected by PickedUp. Its sole callback reapplies joint-1 scale and returns false. Physics and collision slots are NULL. It neither decrements lifetime nor restores joint-2 translation locally.
- **3:** Animation restores model state and decrements lifetime; physics forwards fall attributes; collision reports the result of `it_8026DA08`. No local entry selects state 3. Adjacency to Dropped does not establish a dropped-state identity.
- **4:** Selected by EnteredAir. Animation restores model state and decrements lifetime; physics is empty. Collision enters state 1 immediately when no floor is found. Supported-floor processing enters state 0 only when the shared x1F/xD5C guard permits it. The wrapper returns false.

Spawned only clears x15. EvtUnk forwards two object arguments to a shared handler; its precise triggering event remains unestablished here.

### Semantic review

Supported existing names and explanations are explicitly retained in the checkpoint ledger. Corrections remove the unsupported state-3 dropped identity, distinguish article lifetime from weapon power, and clarify the lifetime helper and held callback. The rendered C view suppresses both competing `itFFlowerFlame_Dropped_Phys` substitutions as name collisions. The header reports the Spawn substitution as `shadowed_binding`. Neither renderer behavior proves canonical semantics.

The prior attempt's proposed signature correction for `it_8029AA1C` was not adopted: its prototype spells `HSD_GObj*`, but its definition spells `Item_GObj*`, as the baseline states. State-4 physics has the same prototype/definition spelling distinction. No compiled section-size, record-layout, or literal-placement claim is made.

Status: synthesized; independent review and live promotion pending.
