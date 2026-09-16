## Item animation commands

`itanimlist.c` implements the item animation-command interpreter, its 16 item-specific handlers, and adapters for the item's separate color-overlay interpreter. The header declares those interfaces and the primary callback table.

### Main command stream

`it_802799E4` copies the cached animation frame into the embedded command context and clears `xDBC_itcmd_var4_word` before checking for a null stream. For a live stream, it subtracts animation speed only from timers other than `F32_MAX`. It executes due commands repeatedly, first through `Command_Execute`, then through `it_803F22A8[opcode - 10]` when the common executor declines the opcode. The fallback has no local bounds check. The sentinel path waits when `frame_count >= animFrameSpeed`; otherwise it sets the timer to `-frame_count` and continues.

The primary table maps opcodes 10–25 to effect spawning, hitbox creation, damage and size updates, indexed/all-hitbox removal, sound commands, variable setters, rumble requests, and overlay start/reset operations. Effect decoding consumes five words total; hitbox creation consumes six. Geometry uses the literal `0.003906f`, approximately—not exactly—1/256.

### Hitboxes and transient state

Creation reinitializes a capsule only when it is disabled or its group changes. Nonzero attachment bones require a dynamic bone table and report an assertion if it is absent. Damage passes through item modifiers and owner-sensitive collision processing. Scale adjustment skips disabled capsules. The final `s_link > 11` branch updates capsule positions/history and numeric states; it is not debug registration. The downstream states `HitCapsule_Unk2`, `HitCapsule_Unk3`, and `HitCapsule_Unk4` remain numerically distinguished rather than receiving speculative meanings.

Variables 0–2 are not cleared by this interpreter's per-update initialization. Variable-4 bit 0 is a transient command-processing signal; its downstream gameplay interpretation remains unknown.

### Effects, sound and rumble

The effect handler forwards a joint selector, effect ID, scalar, base offset and spread to `it_80278800` with mode zero. Effect-specific branches can bypass spread or spawn synchronously; the default placement path applies centered random displacement. The mode does not establish one universal spawning policy.

The sound selector is an unsigned eight-bit packed field promoted to `s32`. Selectors 0–2 play through general or independently managed item sound paths; 10–11 stop managed slots. Recognized selectors consume three words; other selectors perform no audio operation and consume two. Managed sound requests retain distinct ordinary, no-op-sentinel and stop-sentinel behavior.

Rumble commands distinguish owner-specific start/stop from roster-wide start. The downstream fighter routines use request ID 1, controller routing and eligibility guards. Start requests additionally honor two fighter suppression flags; stopping uses the eligibility predicate without those start-only guards.

### Color-overlay lifetime

Overlay requests forward a profile index and completion countdown. The shared initializer compares priorities in the profile table, accepts equal-or-higher-priority requests, and leaves rejected requests unchanged. The item wrapper discards acceptance, so the main command stream always advances.

The overlay dispatcher maps owner opcodes 21 and 22 to effect and sound adapters without bounds checking. `it_80279BE0` resets the embedded overlay after each true completion result and rechecks it; this does not restart the old stream. Shared overlay processing can advance enabled blends and a nonzero countdown even without a command pointer. `x4_pri` is used as that countdown, not as the profile-table priority.

Cross-file callers preserve separate lifetimes: main commands follow model-animation advancement, while overlay processing remains outside the main-animation skip branch on surviving item updates. Construction resets the overlay at two stages, but later construction logic can intentionally install profile 3. The external `xD40` countdown can also terminate an overlay.

### Semantic review

All owned canonical and rendered pages, all 74 subjects, all 144 facts and all 43 links were reviewed. Checkpointed dispositions retain 131 facts and all 43 links, with 13 supported factual corrections proposed below. Existing inferred function names remain useful and are not rewritten merely for capitalization or stylistic consistency. The rendered view reports an external `Item_PlaySFX` name collision for two distinct item audio helpers. No compiled section extent, padding, placement or emitted literal order is established by this source-only review.

Status: synthesized; independent review and live promotion pending.
