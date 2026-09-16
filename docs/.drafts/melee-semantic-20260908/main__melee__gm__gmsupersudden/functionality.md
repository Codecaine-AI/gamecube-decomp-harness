## Super Sudden Death mode

The owned C file implements the mode-state table, thin scene-boundary adapters, persistent-settings initialization, shared KO-counter reset, and ordinary-battle player customization. The header declares all thirteen functions consistently with their definitions. Inherited research covers both canonical and rendered files completely. The lead independently reviewed the canonical state table and implementations against the rendered names; those names fit the callback roles without establishing historical spellings.

### State flow and lifetimes

The source table maps local IDs 0–4 to CSS, SSS, ordinary VS, Sudden Death, and Results. Auxiliary IDs 0x80, 0x81, and 0xC0 select Approach, Approach VS, and Prize Interface; a {-1} record terminates the table. These local IDs are distinct from global scene kinds and from other numeric descriptor fields. Source evidence does not establish that the compiled aggregate `.data` subject consists exclusively of this table.

Persistent configuration resides at `gmMainLib_804D3EE0->modes.unk_6D0`. CSS entry copies it into the shared CSS payload with match-type argument 3 and shared KO storage. CSS cancellation requests GM_MENU and returns before committing selections; otherwise selections are copied back and character audio is preloaded. SSS entry copies persistent configuration into its payload. SSS exit commits configuration and prepares stage audio only when `start_game` is true; otherwise it schedules local CSS state 0.

Ordinary VS entry supplies no whole-match callback and installs `fn_801B8C5C` as its per-player callback. Shared setup copies all player records before invoking that callback for every slot. The callback ignores its second parameter and unconditionally sets destination `x12` to 0x12C, leaving persistent source records unchanged. This supports the 300-damage mechanic and existing semantic name. The downstream consumer uses nonzero `x10` instead of `x12` for initial HUD damage, so the mechanic should not be generalized into an unconditional assertion about arbitrary injected player records.

Ordinary VS exit performs shared match accounting and schedules Results state 4 when the match does not have multiple winners, including zero-winner outcomes; multiple winners select Sudden Death state 3. Tiebreak entry copies persistent rules and players with both custom callbacks null, then uses the preceding ordinary VS result for shared Sudden Death setup. Tiebreak exit merges its result into the shared ordinary VS result. Results entry delegates shared initialization and copies that shared result into the Results payload.

Results exit delegates post-match processing with ordinary destination 0. The shared handler guards some processing against canceled matches, updates KO counts, and may take human-player/auxiliary-state-gated challenger or prize routes with an early return instead of returning to CSS. OnInit applies shared rule/player defaults and three -1 bookkeeping assignments; it does not apply the 300 assignment. OnLoad unconditionally clears the shared Versus KO storage subsequently supplied to CSS.

### Review outcome

Supported existing facts and links are explicitly retained through the inherited research dispositions. All five facts and the one link attributing source-table behavior to aggregate `.data` remain unresolved pending compiled evidence; the lead independently inspected their cited canonical ranges and accepts these deferrals. The inherited link ledger contains fifteen retained IDs and one unresolved ID, each once; no full ledger is re-emitted. The functionality document and empty proposal agree: no equivalent wording or supported semantic names require replacement, and no new proposal is necessary.

Status: synthesized; independent review and live promotion pending.
