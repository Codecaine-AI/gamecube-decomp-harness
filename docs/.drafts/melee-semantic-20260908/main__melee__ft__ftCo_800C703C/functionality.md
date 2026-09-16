# Fighter Item-Contact Response

The TU contains one straight-line initializer, `ftCo_800C703C`, and its public declaration. It obtains the Fighter from the supplied Fighter_GObj, copies self_vel.x into xA4_unk_vel.x, writes common-data x6D0 into its Y component, clears Z, and assigns common-data x6CC to both dmg.x1948 and dmg.x194C. It returns no status, invokes no callbacks and performs no local validation or motion-state transition.

Canonical evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftCo_800C703C.c#L6-L13 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftCo_800C703C.h#L1-L9.

The reviewed caller scans eligible items and tests contact geometry. Each accepted contact records the fighter in item xCFC, records source player and sets Fighter.dmg.x1950. After scanning, a set trigger invokes the initializer once, clears x1950 and returns true. Separately, item code checks xCFC and dispatches its canonical jumped_on callback. These two bodies support the generic item-contact response interpretation without relying on rendered aliases or old shell examples.

Caller evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_0819.c#L49-L92. Item callback evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/item.c#L1439-L1451.

The helper preserves horizontal self velocity in a separate response vector. It does not itself assign self_vel or prove the later meaning of the two damage-state fields. Shared Fighter layouts and downstream consumption remain family-owned. The source parameter entity #r3 has zero facts and corresponds to the sole Fighter_GObj* input.

## Constant Section

The frozen report matches the manifest report SHA-256 and records one 52-byte function and an 8-byte .sdata2 section. Existing reference object bytes are eight zero bytes; the existing compiled object has a four-byte .sdata2. Existing assembly identifies a four-byte float zero at 0x804D8DE8 followed by a separate four-byte gap. The load at function offset0x18 uses that zero and the next instruction stores it to Fighter offset0xAC, consistent with the canonical Z assignment.

This supports one semantic float-zero constant, not two independently meaningful constants. `object-evidence.json` records artifact hashes and the exact report unit. No source, build or matching operation was performed. The source evidence for the assignment is code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftCo_800C703C.c#L9-L12.

## Reviewed final render

Root promoted 2 reviewed facts. [Final render](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__ftCo_800C703C/final-render.json), [staged completion](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__ftCo_800C703C/staged-completion.json), and [live promotion receipt](../../../../games/melee/state/knowledge_v2/semantic-sweep-20260908/promotions/ad461ede9af7e0ea5ef3e3e4c21c017255d8790c85a2cdb1171419904efc7abf/2026-09-08T15-01-05.808Z-71ce551c-f561-47ae-90d9-6ba2845ad18d.receipt.json). Final-render SHA256: `79f267870e6c56bf263496033de2af83c62324c891f9282e5a6ddbd8deda37f8`. Canonical source unchanged.
