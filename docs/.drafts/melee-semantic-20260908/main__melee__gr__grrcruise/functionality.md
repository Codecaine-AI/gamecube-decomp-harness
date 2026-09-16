# Rainbow Cruise semantic review

Rainbow Cruise registers seven Ground-object callback classes and constructs eight objects, including two class-3 instances linked as a hidden animation driver and scrolling presentation. The stage-local factory selects an indexed callback row, obtains a Ground object, delegates setup on success, and otherwise reports failure and returns NULL. Startup does not locally check several returned objects before using them.

The scrolling controller derives a camera-relative anchor from animated camera/interpolation joints, caches displacement as old anchor minus new anchor, and synchronizes available models for map objects 1, 2, 4, 5 and 6. Its motion getter returns this cached displacement or zero; it does not advance the animation or controller.

Ground object 1 coordinates three distinct mechanics after deferred collision registration clears its initialization gate: a load-responsive teeter platform, seventeen contact-triggered falling blocks, and camera-driven vanish geometry. Library processing, directional-field updates and collision refresh remain unconditional. The falling controller carries its contact-delay counter into the shaking state rather than starting a fresh shake timer. The teeter controller chooses unloaded return direction from the sign of its unwrapped angle, not by searching for the nearest level orientation.

Ground object 4 manages three animated contact-sensitive platforms. Loss of contact and animation completion under continued contact select different warning paths. Collision callbacks publish contact counts that the corresponding update routines clear. Numeric collision categories are preserved without assigning unsupported enum meanings.

The vanish system has twenty descriptors: eight participate in the camera-driven four-state cycle, while twelve fixed entries start in state 2 with active collision and are skipped by the updater. Camera entry activates collision and starts entrance animation; camera exit starts retirement. A shared collision joint is removed only after every entry using it has returned to state 0. Representation changes coordinate map objects 1 and 5. The hierarchy visitor visits JObj attachments, whereas the separate visibility helper walks every DObj directly attached to one JObj.

The ship initializer tolerates a missing archive or ship-flag dynamics export, and independently guards its four shared anchor registrations. Its process always requests dynamics and collision updates, with additional guards inside the delegated routines. The render wrapper short-circuits three external conditions before forwarding the unchanged object and render pass. Stage descriptor callbacks separately return NULL for the dynamics lookup interface and true for shadow eligibility; neither implies absence of ship dynamics or unconditional final rendering.

Canonical and rendered C/header pages, all 126 subjects, and all 88 links were reviewed. Supported existing knowledge is explicitly retained in the checkpoint. Eleven source-level name or explanation corrections are proposed. Eleven compiled-section facts and the .rodata dispatch-table link remain unresolved because source switches and historical matching totals do not establish emitted layout.

Status: synthesized; independent review and live promotion pending.
