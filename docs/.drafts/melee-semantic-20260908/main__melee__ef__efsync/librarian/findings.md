# Efsync librarian review

Revision `c302741689bd67c361cd7faadb221df3193992c3`. All673 owned canonical/rendered lines read. C view returned122 parse diagnostics on each page with parse_uncertain symbols,0 substitutions; header0 diagnostics and shadowed_binding. No missing source text. Exact hashes/timing in coverage.json.

## Routing and state

Resets AnimCount and LoadKind to0. Remaps0x479 to0x506 only when efAsync_DatEntries[1].data is NULL. Signed gfx_id<0x250 (including negatives) or integer quotient gfx_id/1000==30 routes to generator creation with Vec3*. Remaining0x250..0x477 delegates to efAsync_Dispatch;0x478..0x4B9 delegates to efAlt_Spawn. Other values set sync mode and enter the local switch;0x4BA and unsupported values return NULL after its epilogue.

The comment table is stale: alternate branch is0x478..0x4B9, not0x479..0x4BA. Decimal quotient30 corresponds30000..30999 (0x7530..0x7917). Fallback0x479 becomes0x506 only if data bank1 is absent, leading to generator definition0x4658 with a Vec3 pointer. No signed lower bound is enforced. All88 local labels0x4BB..0x512 are present.0x4BA and values beyond the local range not caught by generator routing reach no case, drain any newly queued entries and returnNULL.

Entry writes LoadKind=ASYNC and AnimCount=0; it does not clear queue storage or preserve prior globals. Local dispatch changes modeSYNC. Delegates return directly, bypassing local drain and va_end; efAlt itself setsSYNC and efAsync containsSYNC cases, so delegated return mode is not guaranteedASYNC. These names designate library mode values, not proof of a particular external loading schedule.

Queue storage is declared EF_ParamEntry[16] but producer writes HSD_JObj* slots and consumer advances u32 words before reading the first pointer. This is reverse pointer-slot order, not sixteen EF_ParamEntry-sized entries. Producer increments and writes before checking count>=32. No reentrant/global-state safety is inferred. Local branch explicitly animates4C8/4C9 roots before the shared queued animation drain, so a root may be animated there and again if queued.

## Recipe contracts

All88 labels, ordered direct va_arg types, callee names and exact canonical recipe bodies are recorded in coverage.json. Grouped4CF/4D0 and4FF/500 labels share following bodies;4F4 jumps to shared4F5 scaling. Scalars are passed as f32*, not by-value variadic doubles. Several argument reads occur only after primary allocation succeeds. Delegated va_list contracts are owned by their dispatchers; local forwarded helpers use JObj* or JObj* then f32* as recorded in eflib791–834.

Model constructor helpers named Scale generally copy parent Y scale to every axis. Selected local4CC/4D9/4F4/4F5 operations copy complete owner scale;4D8/504/505 use uniformY AppSRT scale, and4D8 sets rot.y=pi/2.4E1 stores attachment/callback, finds root joint, copies params and scales onlyY. Facing sign tests map negative to-pi/2 and zero/nonnegative to+pi/2.4FF/500/501 use fighter parts1 without variadic attachment;501 replaces follow attachment with parts85, callback and lifetime6. These require fighter-shaped owner data.

4CF/4D0 select two model variants, random X/Y rotations and magnitude2 motion params, lifetime50 and offset callback.4CF takes an additional scale pointer;4D0 uses1. Loop reaches at most12 successes and stops at first failure, keeping any partial chain.4BB/4BC/4DA/50B build at mosttwo linked effects;4DA only installs its special callback if second creation succeeds.4BF and507 always attempt unreturned secondary generators after their primary call, even when ret_obj isNULL.4D3 attempts its unreturned second generator only on primary success. No all-or-nothing rollback exists.

## Inventory and evidence limits

One owned function target has two fixed parameter entities plus an uncatalogued variadic tail; two source-only inline helpers are pointer identities. Header is one public prototype with arg_gobj spelling. The sole file-scope declaration is external efAsync_DatEntries[51]; no owned concrete arrays or jump tables appear in C. Data-section literal/table claims remain unresolved without compiled evidence. No new names or layouts are proposed.

All19 facts reviewed: {'retain': 4, 'supersede': 5, 'reject': 0, 'unresolved': 10}. Five operations drafted; exact4-link ledger retained verbatim with dispositions{'retain': 1, 'reject': 2, 'unresolved': 1}. No source/shared KB/Git/UI or matching changes.
