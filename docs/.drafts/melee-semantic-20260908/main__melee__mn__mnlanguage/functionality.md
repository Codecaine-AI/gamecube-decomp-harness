## Language-selection menu

The unit implements menu state **23**, with separate visual-lifecycle and input GObjs. Entry records the previous menu, sets a five-tick input cooldown, assigns `hovered_selection = 0`, resolves four `MenMainConLa_Top` archive exports into `model_desc`, constructs the screen, and schedules input processing. Zero is retained as a numeric selection value, not interpreted as an unhovered sentinel.

Construction attaches the model and animations, allocates user data with `HSD_Free` as its destructor, initializes pending and original language bytes from the saved language, and initializes centered text with ID `0xBF`. The language enum is JP=0, US=1; the selector frame table maps those indices to 1.0 and 0.0 respectively. The constructor registers entrance processing before completing the selector and text setup.

Input uses the global `mn_gobj`, not its callback argument. During cooldown it decrements the counter, clears shared input fields, and returns. Afterwards, Back takes precedence over A, and A over navigation. Back requests transition `(4, 4, 3)` without committing the pending selection. A commits only a changed selection, invokes the card-time, audio and menu-transition helpers, and writes current menu and hovered selection to 4. An unchanged A press also suppresses navigation for that invocation. Navigation alone requires the user-data readiness byte; left takes precedence over right, and either toggles the binary selection and immediately applies its preview frame.

Entrance processing first handles departure from menu 23, including departure before entrance completion. Otherwise it calls the animation helper with `{0, 19, -0.1}` and transitions to the active watcher only when the reported frame equals 19. It then writes `menu->unk2 = 1`. The active watcher is inert while menu 23 remains current. Departure removes the current process, installs exit processing, and removes text. Exit processing uses `{20, 29, -0.1}` and invokes GObj destruction when the reported frame is at least 29.

The global visual handle is not explicitly cleared on destruction. The separately created input GObj has no local destruction path, so its shutdown and the retained archive's lifetime depend on surrounding menu/scene machinery. Saved-language assignment is demonstrated; synchronous memory-card persistence and the full effects of external audio/scene helpers are not established here.

All six existing rendered function names fit their canonical roles and are retained. Both owned files render without reported parse errors. Source establishes the data objects and constant consumers, but does not establish compiled section extents, exclusivity, ordering, or literal placement.

Status: synthesized; independent review and live promotion pending.
