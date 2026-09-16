## Special Messages history

`mninfo.c` implements the Data menu's Special Messages leaf screen. The independently inspected Data-menu caller invokes `mnInfo_80252758` for `SEL_DATA_SPECIAL` and requests destruction of the outgoing menu GObj. The constructor owns its screen setup and process registration rather than relying on a table callback.

### Records and presentation

The availability predicate always excludes ID `0x3E`, excludes `0x34` under the US setting and `0x35` under the JP setting, and otherwise returns `gmMainLib_8015D94C` unchanged. Its result is not locally normalized. Counting scans all 66 candidate IDs, but that does not make 66 an attainable count.

Sorting initializes the first 66 bytes of the 0x48-byte workspace, partitions available entries first, and orders them by ascending timestamp. Equal timestamps do not directly trigger the strict comparison; the exchange algorithm does not establish stable ordering of ties. Scrolling reuses the prepared permutation while recomputing availability bounds.

Each visible window contains up to four paired rows. The left helper replaces a date/time text object, converts the supplied timestamp, and chooses month/day/year versus year/month/day using the saved-language US predicate. Its message-ID argument is unused, and it returns the final time append result. The right helper replaces authored-message text using `un_802FE3F8` with base `0x4BD`. Neither helper checks row bounds internally.

### Input and lifecycle

Entry sets a five-invocation input cooldown, initializes the display timer to ten, creates description text immediately, and registers separate display and input processes. The startup process checks departure before its timer. Ten nonzero-timer invocations decrement and return; activation occurs on a subsequent invocation observing zero. It constructs available initial rows, attaches the animated model, initializes arrows, and installs the recurring display callback.

Input priority is Back, Up, then Down. Accepted vertical movement advances one row, destroys and clears both columns, and rebuilds the visible window. Boundary attempts do not redraw or play the movement sound. Arrow children 2 and 1 reflect the upper and lower scrolling bounds, followed by a model-animation update.

Both startup and recurring display processes handle departure by replacing their process with the terminal GObj callback and releasing text. Row slots are cleared, but the description pointer and global display pointer are not cleared here. The generic destructor, independently inspected, supports deferred destruction of the tracked active GObj as well as immediate teardown. The independently scheduled input process has no local current-menu guard; its lifetime relative to the retained display pointer remains a cross-file concern.

### Semantic review

Existing function names and explanations generally fit canonical behavior. The proposed count name collides with an existing canonical inline helper and is replaced with a more precise, distinct name. Corrections also distinguish the actual filtered count bound, explicit gap storage from assumed padding, and text destruction from pointer clearing. The heterogeneous data overlay is supported as a source-level interpretation; no compiled section size, placement, alignment, or constant-pool envelope is certified.

Status: synthesized; independent review and live promotion pending.
