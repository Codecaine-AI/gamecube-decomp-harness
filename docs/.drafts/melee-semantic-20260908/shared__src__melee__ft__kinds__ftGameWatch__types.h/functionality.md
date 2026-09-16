## Game & Watch shared types

`src/melee/ft/kinds/ftGameWatch/types.h` declares fighter-specific storage, special-move attributes, and motion-local state; it contains no executable behavior.

- `ftGameWatch_FighterVars` contains Judge, Oil Panic, and Chef scalar fields and ten `HSD_GObj*` fields named for move-associated objects. These declarations do not establish object ownership, destruction, or persistence across motion changes. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGameWatch/types.h#L12-L30)
- `ftGameWatchChef` and `ftGameWatchJudge` declare six-element integer and nine-element signed-integer arrays, respectively. Their indexing and update rules are not specified here. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGameWatch/types.h#L32-L38)
- `ftGameWatchAttributes` groups model width and colors with Chef, Judge, Fire Rescue, and Oil Panic parameters, including a nine-entry Judge roll array and an `AbsorbDesc`. The canonical comment describes excluded Judge outcomes and a panic when fewer than two outcomes are enabled; this header does not independently demonstrate that exceptional path. Fire Rescue influence/angle and Oil Panic terminal-velocity comments explicitly remain tentative. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGameWatch/types.h#L40-L112)
- `ftGameWatch_MotionVars` is a union of Attack11, SpecialN, and SpecialLw structures. Its fields include a tentative unused flag, Chef loop-disable and sausage-limit state, and Oil Panic release and turn-frame state. No transition, initialization, or lifetime behavior is implemented here. [Source](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/kinds/ftGameWatch/types.h#L114-L134)

The entire canonical and rendered file was reviewed. The rendered view has no substitutions or parse errors; its unchanged names and comments provide no independent behavioral confirmation. There are no frozen baseline subjects, facts, or links to retain or correct. No supported semantic correction or useful evidence-backed proposal was identified. Offset comments are not treated as compiled-layout evidence.

Status: synthesized; independent review and live promotion pending.
