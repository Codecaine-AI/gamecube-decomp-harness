## Vi0402 scene

Entry loads `visual0402Scene` from `Vi0402.dat` into a module-static `SceneDesc*`, constructs lighting and the first animated camera, then constructs one JObj-backed GObj per null-terminated model descriptor. Model and camera animations are requested at frame zero and evaluated immediately before recurring processes are registered. Model processes use priority `0x17`; the camera process uses priority 0. Audio configuration follows model construction even when the model list is empty. Entry also initializes effects and players.

`un_8031D6E4` forwards the attached model root to hierarchy animation. Traversal honors the engine's instance-descendant exclusion and eligible DObj handling. `vi_8031D80C` advances camera animation before testing exact `curr_frame == end_frame`; equality calls `lb_800145F4` and then `gm_801A4B60`. It has no null guards, greater-than fallback, or local completion latch. The scene manager's state 1 stops subsequent updates while permitting the current rendering path, unlike state 2.

The separate scene-level `vi0402_Scene_OnFrame` delegates to the shared Start-trigger handler. That handler conditionally makes two audio calls, calls `lb_800145F4`, and requests exit. Thus skipping and camera completion are distinct paths, not interchangeable frame callbacks.

The loaded descriptor is shared across setup helpers. This unit does not show archive release, GObj teardown, or descriptor clearing; their lifetime must not be inferred from the exit request. Entry assumes valid archive contents, first-camera animation, and successful construction.

The rendered model-setup name fits. The rendered `vi0402_RunFrame` name is unnecessarily ambiguous beside the actual scene-frame callback; a camera-specific name is proposed. External rendered callee names were not used to establish their behavior. Both owned rendered files parsed without issues. Existing Brinstar Explosion/Exit associations are retained as externally attributed baseline knowledge, not independently derived gameplay identification. No compiled section layout is established by this pass.

Status: synthesized; independent review and live promotion pending.
