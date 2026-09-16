## Figure Get / Trophy Collector

The unit registers `Gr_Kind_FigureGet`, `/GrNFg.dat`, and two Ground callback records. Initialization caches the six-field yakumono parameter block, clears `stage_info.unk8C.b4`, sets `b5`, and requests objects 0 and 1. Object acquisition failure is reported and returned as NULL. Object 0 initializes its animation and otherwise has inert callbacks. Object 1 owns trophy selection, spawning, collection tracking, and result processing. Demo/load hooks are empty; start invokes the shared generator with a NULL descriptor and ignores its result. The line-touch query returns NULL and the shadow query returns true.

### Selection and spawning

The controller chooses a random starting slot among three, fills subsequent slots circularly, and requests the three model archives. The fallback selection loop excludes only the preceding selected ID; it does not establish three-way uniqueness. Initialization sets the countdown to the base delay plus an optional random delay, clears the spawned/captured/destruction counters and tracking arrays, and registers the collector callback on map joint 0.

The recurring update sets every fighter's `joint_id_skip` to zero. While the spawned count is below the configured limit, an exactly-zero countdown spawns the next indexed Coin item; every nonzero countdown takes the decrement branch. Position starts from the constant zero vector. Horizontal placement uses a randomly signed `20 + random(trunc(abs(x10-xC)/2-20))`, with a zero-range special case; vertical placement adds the configured height to the camera-top offset, and depth remains zero. Invalid negative ranges are not checked locally. The item constructor can return NULL, but this caller stores its result and immediately invokes the collision-joint setter without a null check.

### Collection and completion

The collision callback requires category bits equal to 5, a non-null item-class object of `It_Kind_Coin`, fewer than three captures, no matching pointer in the captured-object array, and an inclusive x position of [-4.5, 4.5]. Acceptance calls the Coin collection response, records the object and trophy ID, and increments the captured count. The response adjusts sound, velocity, and an item field; it does not itself destroy the object or clear its stage-owner reference.

Spawned Coin items retain the originating Ground GObj. Their destruction callback notifies `grFigureGet_80219C34` when the item's mode/index field is nonzero. The notifier ignores NULL and otherwise increments `xC`, without checking capture membership or deduplicating notifications. `grFigureGet_80219C50` is a side-effect-free query returning false for NULL and otherwise testing `x8 + xC >= 3`. Its rendered completion-oriented name remains useful, but unique-object accounting depends on external lifetime invariants.

After the configured spawn limit is reached, a true completion query causes collected IDs to be passed to `gm_8017E280`. The update ORs `0x20|0x100` for three captures, `0x100` for other nonzero capture counts, or `0x200` for none. There is no local completion latch: subsequent qualifying updates repeat this processing. The Coin renderer also consumes the completion query when selecting visible model branches.

### Semantic review

Existing callback-position names and the destruction/completion helper names fit canonical behavior. Two explanations merit correction: the update's exceptional and repeatable branches, and the notifier's unsupported exclusion of previously captured items. Other supported knowledge is explicitly retained through the inherited ledger. Compiled section membership, ordering, size, and padding remain unverified. Rendered names were treated as hypotheses, not evidence.

Status: synthesized; independent review and live promotion pending.
