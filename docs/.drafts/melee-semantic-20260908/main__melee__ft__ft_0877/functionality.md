## Fighter runtime utilities

The unit provides read-only held-button and pending-press mask predicates; fighter flag, item-possession, parasol-status, smash-attribute and used-jump queries; visibility and miscellaneous field setters; live CPU-configuration wrappers; and active fighter-kind enumeration. The header declares these interfaces. The documentation file contains historical annotations and a playback prototype whose volume/pan types differ from the C definition and header.

Input queries do not consume events. Pressed bits are produced upstream and can be OR-latched, so repeated true results are possible. The death-related eligibility predicate preserves the literal motion-ID-zero test and exclusions 0x23–0x25 without assigning unsupported action names. Item predicates distinguish possession from action-state entry. Parasol eligibility accepts normalized statuses 4 and 5 and leaves input checks and transitions to callers.

Visibility stores the logical inverse of its argument in `invisible`; the temporary read of `x221E_b7` has no lasting effect. The dominant-velocity classifier compares squared XY magnitudes and returns a category rather than a magnitude. For ordinary finite values, ties favor attack/shield knockback, then ordinary knockback over self velocity. CPU type and level updates rerun the common initializer, retaining the other configuration arguments but rebuilding transient AI state; Nana still receives forced type 6. The opaque `x1988` getter/setter participates in a cross-file save/override/restore sequence during Crazy Hand arrival. The fighter-kind mask collapses duplicate kinds and excludes kinds at or after `FTKIND_MASTERH`.

## Fighter audio

The size helper selects offsets 0, 1 or 2 using its full selector/flag table. The broader resolver first remaps the requested ID, classifies its bank, and applies designated size, metal and Ice Climbers costume-dependent rules. Bank 0 uses explicit ID lists, including the exceptional literal 290051. Bank 13 performs its paired-range translation and then falls through to the shared metadata-gated size adjustment; it is not an isolated terminal branch.

`ft_PlaySFX` stores the audio-start result in `x2160`, then supplies a fresh adjustment from -100 through 99 for adapted IDs 332–370, or zero otherwise. It neither stops the previous handle nor branches on playback failure locally. The auxiliary `ft_8008805C` path submits an adapted ID to a bounded audio-library table rather than immediately starting another sound. Entries can be refreshed, expire, or be replayed by a later audio update.

Two independent fighter-local counters account for Star and Hammer audio contributions. Acquisition increments local/global accounting and refreshes a global timeout. Release forwards the entire local contribution, performs positive-only saturating subtraction globally, and clears the local field. Star threshold release is distinct from status expiration; death and transformation paths also matter. Hammer cleanup occurs on lifetime expiration or removal, with LightGet skipping its normal countdown. Global audio timeout can clear global accounting independently of outstanding local contributions.

## Semantic review

The inherited research accounts for all owned canonical and rendered pages, all 82 subjects, all 179 baseline facts and all 39 links. This distinct lead independently checked every proposed fact's canonical citations and both upstream factual contradictions. Supported existing names, explanations and links are retained. Two factual explanations need correction: once-per-press wording and omission of bank-13 fallthrough. A useful missing explanation describes the auxiliary SFX table lifetime. No compiled section or layout conclusions are made.

Status: synthesized; independent review and live promotion pending.
