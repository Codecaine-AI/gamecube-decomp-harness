## Sound Test

The unit implements the Sound Test screen's configuration, presentation, input states and audio previews. Existing function names fit their canonical roles and are retained.

### Setup and ownership
`mnSoundTest_8024BEE0` sets menu ID `0x1B`, starts a five-tick cooldown, initializes two gain caches, raises the opening gate and resolves four `MenMainConTs_Top` archive exports. `mnSoundTest_8024BCA0` constructs the model GObj, attaches animations and explicitly initialized heap user data with an `HSD_Free` destructor, creates the heading and initializes selection visuals. Allocation failure reports and asserts. A separate GObj hosts the input process; the entry routine returns that process, not the model object.

### Input and audio
Mode 0 browses 80 music entries; mode 1 selects among 30 sound categories; mode 2 browses clips within a category. Music indices pass through `text_ids` and `data_2`; category ordinals pass through `data_3`, then directly index the first 30 elements of `data_4` for presentation. Clip lookup uses the selected category and clip index. The code does not guard a zero clip count before left-wrap subtraction.

Cooldown returns precede normal processing. Main-input Back and Up/Down handling precede fade advancement and the opening gate, so the gate is not a complete input lock. Music actions prioritize A, Start, Left, Right. Category A installs the specialized clip callback; its Back path restores mode 1 and the main callback. Two envelopes are armed at 0.98, decrease by 0.02 on eligible updates, then reset to 1.0 and stop their associated audio path. Gain updates multiply complements of all four controller slots' L or R triggers with the corresponding envelope and balance-derived gain. Attenuation is applied when the trigger product is below 0.9 or the envelope below 1.0; otherwise setters run only when the baseline differs from the cache.

### Presentation and departure
Music refresh replaces title and ordinal text. The mode-display helper shows clip-number text and child `0x13` only for mode 2; both modes 0 and 1 hide them. Child `0x14` independently uses frame 1 only for mode 1. Numeric text uses alignment value 1. Category-row updates normalize the local selection predicate but forward the original byte. Music-selector callers supply booleans, although its primary frame request uses the raw byte. Both alternative secondary selector endpoints currently equal zero.

The opening callback switches to steady presentation, refreshes music text and clears the gate at its primary joint's terminal frame. Both opening and steady callbacks remove nullable text objects when the menu changes, but only the steady departure path explicitly requests exit start frames. The exit callback updates three joints and requests model destruction when the primary result exactly equals frame 39. The steady callback's declared floating argument has no observable semantic role and is installed through a one-argument callback cast. Global-pointer clearing and the separate input object's ultimate teardown are not established by this file.

Evidence: [input and helper flow](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/mnsoundtest.c#L128-L644), [model lifecycle and setup](code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/mn/mnsoundtest.c#L646-L877).

Status: synthesized; independent review and live promotion pending.
