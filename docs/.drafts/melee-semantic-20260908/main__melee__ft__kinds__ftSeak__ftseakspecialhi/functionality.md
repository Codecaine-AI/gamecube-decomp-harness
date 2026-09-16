# Sheik SpecialHi translation unit

## Scope and phase identity
This TU implements Sheik's SpecialHi/Vanish startup, invisible direction-selected travel, surface conversions and visible grounded/aerial endings. The active motion table associates states 355–360 (0x163–0x168) with grounded startup, grounded travel, grounded ending, aerial startup, aerial travel and aerial ending. Both travel states reuse their respective startup submotion. The header declares the two activation entries and six Anim/IASA/Phys/Coll callback families.

Canonical symbols remain authoritative. Rendered CreateStartGFX, GroundToAir, AirToGround and Lost_Enter names are hypotheses, not recovered originals. In particular, 8011374C continues invisible travel while 80113E40 continues the visible ending; their duplicate proposed GroundToAir name must not merge these functions. The startup aerial IASA alias renders inconsistently between C and header. The Physics_SheikUpBTravelAir comment precedes grounded physics and must not override the active table or function body.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftSeak/ftseak.c#L173-L238; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftSeak/ftseakspecialhi.h#L6-L31.

## Startup, presentation and ownership
Fresh entries clear cmd_vars[0] and specialhi.xC and enter startup at frame zero/rate one. Aerial entry also replaces self_vel.y with the character attribute. Neither entry locally arms accessory4_cb. Animation exhaustion selects travel; startup IASA callbacks are empty. Ground physics delegates to ft_80084F3C; aerial physics uses x30/x34 with ftCommon_Fall and then ftCommon_8007D268.

fn_80112ED8 conditionally invokes the Vanish item helper, effect 1284 helper and sound 115 when x2219_b0 is clear, then always clears accessory4_cb. The item helper derives HipN position, forces z=0 and ignores the nullable constructor return. Consequently item allocation failure does not stop the wrapper's effect/sound calls. The item constructor assigns the fighter owner and initializes a 60.0 lifetime; this TU stores no item handle and does not destroy it.

80112FA8 computes hip position before testing the latch, conditionally spawns 1284 and sets the latch, and always installs effect hitlag callbacks. fn_80113038 computes position only within its clear-latch branch, spawns 1285, sets the latch, installs hitlag callbacks and clears accessory4_cb. The shared latch is not a proven once-per-move counter; no spawn-success check protects its write. Numeric effects do not establish exact visual assets or a Deku Nut interpretation. The inherited callback-lifetime analysis remains applicable: motion changes reset accessory4_cb and engine invocation is gated, so self-retiring does not mean guaranteed execution on the next chronological frame.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftSeak/ftseakspecialhi.c#L47-L197; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/it/kinds/itseakvanish.c#L19-L55; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/fighter.c#L1370-L1389; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/fighter.c#L2552-L2568.

## Travel selection and numerical boundaries
Shared initialization loads signed timer x38, writes jumpsUsed from max_jumps through a u8 cast, sets x2223_b4, calls collision mode 2, enables invisibility and arms fn_80112ED8. The complete gameplay meanings of that bit and collision mode remain external questions.

The local square-root helper uses __frsqrte and three double-precision refinement steps for x>0, rounding through a volatile float; otherwise it returns x unchanged. It is not a checked general square root. Nonfinite values and overflow in stick squaring are not locally rejected.

Ground selection clamps magnitude only above one and requires !(magnitude<x40), !(floor/stick XY angle<pi/2), and ftCo_8009A134==0. Equality and unordered comparisons pass the negated-less-than tests. The platform helper updates floor-skip state when it returns true. Success updates facing, stores raw stick XY, computes ground speed from facing*(x44*magnitude+x48)*cos(atan2(stick_y,stick_x*facing)), enters 0x164 at frame 35, initializes animation, freezes its rate and performs shared initialization. Other paths convert airborne and invoke aerial selection.

Aerial selection instead requires magnitude>x40; equality or unordered comparison selects upward fallback. Directional facing updates require absolute stick X>0.001. Fallback stores (0,1), uses pi/2 and magnitude one. Self velocity uses speed=x44*magnitude+x48 with facing-adjusted cosine X and sine Y. It enters 0x167 at frame 35, initializes and freezes animation, then performs shared initialization. No attribute ranges prove positive speed or finite/nonnegative thresholds.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftSeak/ftseakspecialhi.c#L370-L510; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Pass.c#L64-L74; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcommon.c#L621-L637.

## Travel updates and collision
Ground travel decrements mv.sk.specialn.x0; aerial travel decrements mv.sk.specialhi.x0. Both test the post-decrement value for <=0 and enter ending. Source union declarations support intended overlapping timer use, not a compiled-layout claim. Signed overflow is not guarded. Ground travel physics applies ground movement; aerial travel physics and both IASA callbacks are empty. Empty local physics does not prove global velocity integration stops.

Grounded startup and travel collision compare ft_80082708(gobj)==GA_Ground before aerial conversion. The current callee returns fall_off_ledge ? GA_Air : GA_Ground. Preserve this literal discrepancy rather than silently converting it into a leaves-ground narrative. In travel, the GA_Ground branch with either wall converts airborne and enters aerial ending; without a wall it invokes 8011374C. The other query result with either wall enters grounded ending.

8011374C converts airborne, enters 0x167 at the current frame/rate zero and reasserts x2223_b4 and invisibility. 801137C8 performs grounded conversion, enters 0x164 at the current frame/rate zero and reasserts invisibility. Ground conversion resets jump/wall-jump counters, derives ground velocity and checks support; it is not merely a domain-bit change.

Aerial collision increments xC before ground/ledge testing. xC converted to float >=x3C accepts grounding without consulting the platform helper; otherwise that helper may update floor-skip and suppress grounding. NaN x3C follows the latter branch. Accepted grounding returns immediately. Otherwise cliff handling precedes teleport contacts. The shared helper independently tests ceiling, left and right walls against a strict angle threshold of 90 degrees plus integer x50. Equality does not trigger. Callbacks execute synchronously with no return between tests, so later tests may observe altered velocity/state and invoke ending again. These explicit tests do not establish arbitrary-surface coverage.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftSeak/ftseakspecialhi.c#L199-L368; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L392-L424; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcommon.c#L527-L594; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/inlines.h#L218-L242; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftSeak/types.h#L78-L122.

## Visible endings and common-engine exits
80113EAC enters grounded ending 0x165; 80113F68 enters ftSk_MS_SpecialAirHi. Both change motion and initialize animation before saving velocity. They snapshot self X/Y and ground velocity into common-union fields, clear live velocities, restore visibility and arm fn_80113038. Ground ending restores saved ground velocity*x54; aerial ending restores saved self XY*x54. No supplied range proves x54 reduces momentum or is a fraction. The snapshot is not necessarily untouched pre-transition velocity, and canonical walk/common field names do not imply walk gameplay here.

Ground animation exhaustion calls the common action-ending dispatcher. Wait is the normal path, not unconditional: common code includes kind, DownSpot and hammer alternatives. Aerial exhaustion forwards (1,0,1,x58,x5C) to ftCo_80096900. It normally enters FallSpecial and consumes jumps, but x2224_b2 selects another path. Its nonzero xC physics branch uses ordinary drift rather than the stored mobility limit, so forwarding x58 does not establish an effective drift cap.

Ending IASA callbacks are empty. Ground physics delegates to the shared friction/movement routine. Aerial physics checks cmd_vars[0] every invocation. Nonzero uses FallBasic and clamps X with x4C*air_drift_max; zero computes y-y/10 then invokes ftCommon_8007CEF4. This is approximately 90% retention for ordinary finite values, not a universal exact multiplication by 0.9. No local evidence establishes command-script timing or monotonic phase progression.

Ground ending collision converts through 80113E40 only when ft_800827A0 returns zero. That helper enters 0x168 at the current frame/rate one using 0x0C4C508A and rearms ending presentation. Aerial ending collision prioritizes ground handling and forwards false/x5C to LandingFallSpecial, otherwise checking cliff handling. Landing has a hammer alternative; its normal rate calculation divides (0.1+x2EC) by x5C without local finite/zero validation.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftSeak/ftseakspecialhi.c#L512-L640; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_08A1.c#L53-L108; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_FallSpecial.c#L28-L155; code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Landing.c#L103-L129.

## Evidence limits
Owned baseline function subjects use game-object pointer arguments and return void; local inline math helpers are separate implementation details. Source signatures do not independently prove compiled register allocation. Nonempty bodies assume valid fighter data, character attributes and required engine objects. Padding and float hacks are decompilation scaffolding. No compiled .sdata2 ownership, relocations, union offsets or opcode equivalence are established. Exact original helper names, effect assets, actual attribute ranges, script timing, complete latch/reset lifetimes and intended ground-query polarity remain unresolved.


Status: synthesized; independent review and live promotion pending.
