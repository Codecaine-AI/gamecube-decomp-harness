# Dash

Revision `c302741689bd67c361cd7faadb221df3193992c3`. The TU recognizes initial-dash input and supplies entry plus four active Dash callbacks.

## Input and Entry

A horizontal stick magnitude at least dash_smash_stick_threshold and tilt timer below dash_smash_window qualify. Opposite facing enters smash Turn with zero frames-to-turn; otherwise entry receives mode 1. There is no local ground guard. Entry clears command variable 0, selects Dash at frame zero and speed one, runs animation setup and writes tilt timer 0xFE. The velocity correction is facing times dash_initial_velocity when current velocity opposes facing, otherwise that value minus gr_vel. It is stored in dash.x0 and queued into secondary acceleration through a friction-sensitive helper; it is not an immediate replacement of gr_vel. Mode is stored in dash.x4; nonnull x197C triggers sound 0x118/127/64. [Entry](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Dash.c#L27-L72), [queued correction](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcommon.c#L1771-L1779).

## Animation and Interrupts

Animation expiry calls ft_8008A2BC, with boss-specific alternatives and ordinary Wait after exceptional checks. The active Dash table row installs all four callbacks.

IASA has three phase branches: mode nonzero through x44; otherwise through x4C; otherwise late phase. Early options include side special, eligible LightThrowF4, catch, forward smash and EscapeF through x48. Middle options include side special, catch, dash attack, opposite-facing qualifying Dash input and guard with integer frames remaining. Late options include catch, qualifying Dash input and guard. Shared fallback checks special appeal, relaxed jump, command variable 0 and Run input. Returns are selective: the damping footer runs only on paths actually reaching it, including some successful transitions. Ordinary no-transition fallback returns before damping. [IASA](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Dash.c#L81-L143).

## Physics and Moonwalking

Nonzero dash.x0 is cleared and skips steering for that call. Zero permits immediate steering, including the first callback if entry correction was zero. Signed stick input determines acceleration and target without facing. Opposite-velocity acceleration bypasses same-direction target correction, writes primary acceleration, and is integrated by the fighter update. Both branches apply ground-normal movement. These dependencies support the possibility of reversed velocity while facing remains unchanged when the input avoids dash-back guards; no trajectory was simulated. [Physics](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftCommon/ftCo_Dash.c#L145-L162), [stick calculation](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/inlines.h#L132-L140), [integration](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/fighter.c#L2292-L2297).

## Collision Contract Gap

Dash delegates to ft_800844EC. The map query synchronizes positions. Its wrapper returns GA_Air=1 for true underlying map result and GA_Ground=0 for false. The caller invokes StopWall checks on nonzero and Fall on zero. StopWall checks facing/wall flags and ABS(gr_vel)>walk_max_vel. This literal behavior conflicts with inherited physical ground/air descriptions. Three facts are narrowed to canonical predicates; one gameplay fact remains unresolved. The family followup joins the CargoLanding/HammerLanding query-contract review. No shared source fix is proposed. [Query](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L393-L404), [enum](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/forward.h#L442-L445), [caller](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_081B.c#L1129-L1137).

## Literal Data

Both existing objects contain eight bytes 000000003f800000, f32 zero then one. Split flags are ALLOC; source flags are ALLOC|WRITE. Code loads the literals without writes. The unchanged report records 1372 code bytes and eight data bytes matched. [Object evidence](data-corroboration.json).

## Review Sources

- [src/melee/ft/kinds/ftCommon/ftCo_Dash.c](</Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__kinds__ftCommon__ftCo_Dash/pages/src__melee__ft__kinds__ftCommon__ftCo_Dash.c.1-168.json>)
- [src/melee/ft/kinds/ftCommon/ftCo_Dash.h](</Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/games/melee/state/knowledge_v2/semantic-sweep-20260908/units/main__melee__ft__kinds__ftCommon__ftCo_Dash/pages/src__melee__ft__kinds__ftCommon__ftCo_Dash.h.1-14.json>)

[Supplemental reads](supplemental-canonical.json), [fact decisions](fact-dispositions.json), [exact outgoing relationships](link-dispositions.json). All 182 owned lines, seven targets and fifteen subjects are accounted for.
