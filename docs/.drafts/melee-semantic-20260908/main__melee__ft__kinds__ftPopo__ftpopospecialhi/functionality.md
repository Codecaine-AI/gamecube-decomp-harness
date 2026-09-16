# Popo SpecialHi semantic reconciliation

## Scope and retained knowledge

The hash-bound distributed research establishes complete canonical/rendered coverage of the owned C file and header, all 130 subjects, 349 baseline facts, and 103 links. This lead independently inspected the proposed fact citations and contradiction evidence. Supported inherited facts and structural links are retained without equivalent rewrites. Shard-local statements that a body or table was not read describe those shards, not a gap in the combined coverage.

## Entry and startup

Ground entry divides ground velocity by x84; air entry divides horizontal and vertical velocity by x84/x88 and marks jumps used. Both initialize startup motion and clear command/tracking fields. Division alone does not establish attenuation.

Start_0 consumes cmd_vars[2] before checking the second player entity. Success requires existence, distance strictly below x7C, and success of ftNn_Init_8012300C. Failure selects current-frame Start_1 states 0x15E/0x163. Ordinary animation completion instead invokes 80121DA0/80121DD8, entering Throw_0 states 0x15C/0x161 at frame zero. The existing rendered Start_1 entry names for these completion helpers are incorrect. See code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPopo/ftpopospecialhi.c#L205-L266 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPopo/ftpopo.c#L99-L185.

Start_0 IASA consumes a separate command and conditionally changes facing/rotation when horizontal-stick magnitude exceeds x80. Attributes are read, not mutated. Start_1's aerial animation consumes a command to assign xA4 to vertical velocity; the configured sign is not established here.

## Throw progression and entry naming

Throw_0 animation checks exhaustion independently of its later command processing; exhaustion does not itself return. A successful command-triggered second-entity check invokes 8012280C and returns. Otherwise it increments move storage and calls maintenance.

80122380 is the minimal frame-zero entry to 0x164, registered with SpecialAirHiThrow_1 callbacks. It is not the Throw2 entry. 8012280C conditionally performs ground/jump setup, computes relative velocity, enters 0x162, and installs x21F8. Correcting 80122380 to the descriptive hypothesis ftPp_SpecialAirHiThrow_1_Enter resolves the rendered collision without conflating these distinct bodies. The actual Throw_1 animation callback requests the common exit on exhaustion and does not run Throw2's counter/string-update branch. See code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPopo/ftpopospecialhi.c#L676-L770, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPopo/ftpopospecialhi.c#L875-L888, and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftNana/ftnana.c#L191-L201.

## Movement, tracking, and collision

Ground physics commonly delegates to ft_80084F3C: it reads ground_friction, scales it by friction_when_above_walk_speed only when absolute ground speed exceeds walk_max_vel, applies friction, then applies ground movement. The proposal updates two stale field descriptions, not this algorithm.

Several physics callbacks overwrite x2240 with zero or a joint-query output from entity index 1, guarded by the SpecialHi_0 through SpecialHi_5 motion interval. A string-item consumer uses that cache when x or y is nonzero. This establishes a producer/consumer connection, not every anatomical or public gameplay interpretation.

Air physics uses distinct attribute pairs. Start_1 and Throw_1 apply an additional helper only after vertical velocity is negative. Throw2 instead prioritizes threshold-dependent horizontal movement, with a descending fallback when that input threshold is not exceeded.

Collision callbacks preserve current animation position in their local continuation helpers or delegate to air-to-ground, landing, and cliff processing. Throw2 collision prioritizes ground, then cliff, then mutually exclusive environment-mask responses. Its final 0x6000 branch clears vertical velocity without reading or testing its sign. Numeric masks and transition policies are not assigned unverified physical or preservation semantics.

## Article lifetime and exceptional paths

ftPp_SpecialS_80120FE0 reads speciallw.x0, creates an article at command 8, and dispatches attribute-selected events during commands 9 through 0x53. Creation failure invokes ft_8008A2BC and returns true. A missing article during the latter interval reaches the end without a Boolean value. Callers discard the result; an active-animation maintenance path therefore cannot be described as unconditionally preserving state.

Creation retains the item in x2238 and heldItemSpec and installs damage/death callbacks. Fighter-side clearing resets x2238 and those callbacks but does not itself destroy the item or explicitly clear heldItemSpec. Guarded removal and item-side cleanup span files; item cleanup notifies the fighter, clears ownership references, and unlinks item links. See code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftPopo/ftpopospecialhi.c#L86-L158 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itclimbersstring.c#L258-L297.

## Evidence boundaries

The public Belay mapping, comparative solo recovery strength, complete common-helper effects, detailed landing interruption contract, and some tracking interpretations remain deferred. FallSpecial entry has an alternate x2224_b2 branch before its normal state change. Empty IASA callbacks establish local inactivity, not global non-interruptibility.

No compiled .sdata2 layout, move-variable aliasing, or register allocation is established. The six parameter proposals record only explicit canonical C pointer types. The header's SpecialLw cleanup substitution remains a cross-family hypothesis pending implementation-owner review.

The final proposal preserves all 15 supported research changes and repairs incorrect table locators: aerial Throw_0 is ftpopo.c:154-163, and aerial Throw_1 is ftnana.c:191-201.

Status: synthesized; independent review and live promotion pending.
