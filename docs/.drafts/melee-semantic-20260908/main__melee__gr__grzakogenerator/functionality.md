# grzakogenerator semantic review

## Two independent generation facilities

The configuration path allocates a configuration and a separate working segment array, retaining the caller's descriptor pointer and callback. Outer-allocation failure returns NULL; working-array failure frees the configuration. Successful construction initializes `gen` to NULL and `x18` to zero without invoking the callback. Descriptor lifetime must therefore extend through subsequent configuration use.

The height-update routine transforms both endpoints of every descriptor through the supplied JObj. Segments whose endpoints are not both strictly above or below the requested height are eligible. It computes an intersection when the absolute vertical difference exceeds 0.0001, otherwise samples along the segment and forces the requested Y. Nonnegative control values apply a random threshold before callback invocation. Negative values maintain one shared generator pointer across the ordered segment loop: an eligible segment creates or moves it, while a noncrossing segment removes it. Consequently, a later segment can remove a generator positioned by an earlier segment. The return counts accepted placements, not successful allocations. Corneria independently supplies two configurations with threshold 0.3 and distinct particle callbacks; these are separate from the enemy registry.

## Shared actor registry

The allocator initializes entries 0–79 with markers 0x20–0x6F, zero timers and null objects, and entry 80 with marker -1. It does not initialize entry payload `x8`. It also enables updates and resets the scan index before manager-GObj creation. Manager creation publishes the borrowed descriptor pointer and allocated registry only on success. Failure frees the fresh registry but does not roll back the enable/index writes. Repeated creation has no local cleanup of an earlier registry or manager.

Registry updates require both a registry pointer and the enable bit. A valid starting index produces one complete 81-entry pass and returns to the same index; the 0xFF iteration budget is not an index-validation mechanism. Marker -1, occupied entries and timer -1 are skipped. Positive timers are decremented without spawning during that visit. Zero reaches position resolution; literally, other negative timers also reach it, although no reviewed producer establishes those values as intended states.

Candidates must lie strictly inside the blast rectangle. Ordinary mode additionally excludes the strict interior of the rectangle halfway between camera and blast bounds; points on that inner rectangle's boundary are not excluded. Mode 1 bypasses only this camera exclusion. Ordinary actors are selected by descriptor kind and receive a reciprocal registry index on successful creation. Markers 0xDC–0xFB instead use the payload through Ground's special constructor, independently verified to create a trophy-bearing Coin. Failed constructors leave entries vacant for later retries.

## Registration and lifecycle corrections

Reserved-entry registration tests marker -1, then stores `(s16)arg1`, the payload, and NULL occupancy without resetting the timer. These stores do not guarantee activation: a stored marker of -1 leaves the entry unused. Ground's marker selector can return -1, and reviewed route callers forward it without checking. A non--1 marker alone also does not guarantee a valid or spawnable entry.

The ordinary destruction handler clears occupancy and writes timer 2 without invalidating the item's index. Its Coin branch only clears matching reserved occupancy. The terminal handler first attempts KO reporting, then clears a matching Coin marker and object, or assigns an ordinary timer of 0x708 when `respawn == 1`, otherwise -1, and invalidates the item's index. Downstream scoring checks player and item kind; invocation does not guarantee awarded credit.

The enable setter gates registry-update invocations only. It does not freeze the registry: registration and lifecycle handlers remain ungated. Cleanup first disables updates, then traverses the global item list, saving the next pointer before destruction. Kinds in [0x2B,0x30) and [0xD0,0xE8) require the no-grab-victim/no-active-owner-link predicate; Coins bypass that predicate. This is kind-filtered global cleanup, not a registry-membership sweep. Destruction invokes item callbacks while the registry remains available. The routine neither frees the registry nor removes the manager process, and route controllers later re-enable updates.

## Names, rendering and evidence limits

Supported existing function names are retained. `SetSentinelEntry` is replaced with a reserved-entry configuration name because the tail entry is usable storage, not an iteration terminator. `Shutdown` is replaced with an explicit disable-and-cleanup name because the operation is reversible and is not manager teardown. Both requested state-behavior defects have corresponding replacement writes, separate from purpose corrections.

All owned canonical and rendered lines, all 32 subjects and all 20 links were reviewed. The header renderer leaves three pointer-returning declarations unchanged as `shadowed_binding`; these are rendering limitations, not evidence against their names. The header's `UNK_RET` for the enable setter contrasts with the definition's explicit void return. Compiled section membership, extents, ordering and padding remain unverified; source literals do not establish those claims. The legacy .sdata2 gameplay explanation also conflates segment effects with registry enemy placement and is explicitly deferred rather than retained.

Status: synthesized; independent review and live promotion pending.
