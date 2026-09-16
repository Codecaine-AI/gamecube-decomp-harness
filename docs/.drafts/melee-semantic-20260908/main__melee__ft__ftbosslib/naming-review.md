# Independent Canonical Naming Review

Accept all four inherited-name clears. Retain all four current canonical names. This approves naming cleanup only; it does not approve other movement/state proposals.

Campaign `semantic-sweep-20260908`, TU `main/melee/ft/ftbosslib`, pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Reviewer `ftbosslib_naming_review`. Local commit `8601952486303d4d911a041c1b48b6ae441c7c55`, titled `Update ftBossLib function names and address some TODOs (#3413)`, changes each of the four address names to the current canonical spelling in both source and header. Its patch also replaces the Master Hand Entry literal with `ftMh_MS_Entry`. Current pinned source/header independently confirm those spellings.

| Canonical Name | Inherited Fact and Version | Decision and Evidence |
|---|---|---|
| `ftBossLib_GetFighterGObj` | `fact:48dc8885-1476-41a4-94ef-03bc9da851f6`, updated `2026-09-02T12:12:06.010Z`; `ftBossLib_GetFighterGObj` | Retain canonical; accept clear. Traverses HSD_GObj_Entities->fighters in list order and returns the first object with matching FighterKind, or NULL. No local state writes or callbacks. Identical inferred name is redundant. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftbosslib.c#L219-L232`, `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftbosslib.h#L29-L29` |
| `ftBossLib_GetMotionId` | `fact:9fc9721f-6a25-4359-b5ca-1f30b5c06ea2`, updated `2026-09-02T12:25:47.365Z`; `ftBossLib_GetMotionId` | Retain canonical; accept clear. Looks up the requested FighterKind, returns ftLib_GetMotionId for an existing object, otherwise ftCo_MS_DeadDown. No local state writes or callbacks. Identical inferred name is redundant. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftbosslib.c#L234-L245`, `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftbosslib.h#L30-L30` |
| `ftBossLib_IsMasterHandEntry` | `fact:42f4b66d-6046-4a1e-9134-b7aa7604de0c`, updated `2026-09-04T18:52:54.431Z`; `ftBossLib_IsMasterHandInEntry` | Retain canonical; accept clear. Compares the Master Hand motion query with ftMh_MS_Entry and returns the Boolean result. No local state writes or callbacks. The InEntry variant adds no behavior beyond the attested canonical predicate. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftbosslib.c#L158-L165`, `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftbosslib.h#L23-L23` |
| `ftBossLib_ReportGObjSlotType` | `fact:d74050bd-dea1-4cad-82b4-867570d744db`, updated `2026-09-06T02:34:38.472Z`; `ftBossLib_AssertValidPlayerSlotType` | Retain canonical; accept clear. Reads player_id from the supplied fighter object and applies HSD_ASSERTREPORT to a Human/Boss/Cpu slot-kind predicate. No local state writes. AssertValidPlayerSlotType describes the check, but is an inferred alternative to an attested upstream name. The assertion text omits Cpu even though the condition accepts it; preserve that detail in semantics. Evidence: `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftbosslib.c#L42-L50`, `code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftbosslib.h#L14-L14` |

## Read Coverage

Canonical and frozen-baseline rendered text were independently read for `.c` lines 31–270, complete `.h` lines 1–46, and complete `.dox` lines 1–53. All four assigned bodies are complete inside the source page. This is 339 lines per view, not a full 448-line source review. No empty or failed renders. Source/header/dox render statuses were `ok`, parse errors were zero, substitutions were 17/16/16. The source renderer labels the identical GetMotionId/GetFighterGObj hypotheses `invalid_guess`; the header labels GetFighterGObj `shadowed_binding`. These are renderer outcomes, not semantic contradictions.

| Input | SHA-256 |
|---|---|
| `src/melee/ft/ftbosslib.c` | `d2566aae453293db3a298e34b37a7b7dbe49d24ed271cd6de2e5226a110fd33c` |
| `src/melee/ft/ftbosslib.h` | `aa726285e6ee3bb7fb4a583f7378c5e37fd91df48dd90d9e11476c170d3169f4` |
| `src/melee/ft/ftbosslib.dox` | `35578b175c7cd94d7d11afad14edc2feee126d2fcebe74c09f80eaf995a37b95` |

Exact receipts and immutable page paths are in `naming-review.json`. The helper checked each source hash against the manifest before returning canonical and rendered text. Baseline inferred-name rows were read through a read-only SQLite connection. No explicit integer version is available in the queried fact rows; `updated_at` records the reviewed version.

## Limits

The inherited alternatives are behaviorally reasonable. Canonical precedence, rather than evidence that those aliases describe wrong behavior, justifies clearing them. Clearing identical hypotheses removes redundant knowledge. Clearing the other two restores attested names in rendered reading views. No new symbol is introduced, so these approvals add no naming collision.

The `.dox` file already uses all four canonical names at lines 13, 17, 21 and 34. Its action-state wording at lines 15–16 does not override the source return expression. Cross-file dependencies are `ftLib_GetKind`, `ftLib_GetMotionId`, fighter list storage, player slot lookup, enum constants, and `HSD_ASSERTREPORT`. Their implementations were not independently reviewed for this bounded naming decision. PR discussion was not fetched; the local Git patch suffices to attest the names. Four targets reviewed, four clears accepted, zero rejected, zero deferred. Shared KB and source remain unchanged.
