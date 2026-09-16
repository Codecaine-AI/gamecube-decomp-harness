# Fighter Camera Update Review

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Source canonical/rendered L49-115 and full header L1-15 read.

## Behavior

The ordinary updater scales six metadata floats but consumes only the first triplet. Facing exactly +1 chooses one horizontal arrangement; all other values choose the negated mirror and store -1. It copies the current position with a vertical metadata offset, clears on_ledge, and refreshes bone_pos. It assumes valid Fighter, camera subject and metadata pointers.

The bone-only helper updates bone_pos using the configured camera joint and co_attrs.x170 offset. A null selected joint yields the offset itself. It leaves subject position, extents, facing and ledge fields alone. Warp Star callbacks always use it; throw callbacks select it using explicit Kirby and motion conditions.

The DeadUp helper first performs the full update, then replaces subject X using the boundary-height ratio and pins Y to the top blast-zone offset. It preserves the full updater's Z and other writes. The assertion rejects a zero denominator. It does not subtract the stage camera X offset, and no local invariant guarantees horizontal compression.

## Naming

`ftCamera_UpdateCameraBox` is canonical and has no inherited alias. Retain inferred `ftCamera_UpdateCameraBonePosition` and `ftCamera_UpdateDeadUpCameraBox`; the two latter canonical symbols remain address-based. The DeadUpStar and DeadUpFall callback names independently establish the specialized role. No source renames proposed.

## Fact Dispositions

### main/melee/ft/ftcamera:ftCamera_800762F4

- `fact:27e7b78b-53c5-47db-88c5-27bfb4b69ed7` at `2026-09-04T18:51:45.281Z`: supersede data_flow. Adds independently read joint selection and local-offset behavior, including the null-joint fallback.
- `fact:49e27895-3f45-4a5c-90d6-2eff9afc68f1` at `2026-09-04T18:51:45.281Z`: supersede game_mapping. Replace an inferred offscreen condition with the exact callback selection conditions.
- `fact:40072cd3-f436-4378-86c8-417f00157f6f` at `2026-09-06T02:34:38.472Z`: retain inferred_name. Retain as inferred only. Canonical symbol is unchanged; current local behavior and named callers support this descriptive alias.
- `fact:7bd8de03-52ff-4ce0-91ad-396baafdfd41` at `2026-09-04T18:51:45.281Z`: retain inferred_type. Current canonical definition and independently read helper/callers support the existing claim.
- `fact:85014ac7-d2c0-41e6-9cf5-625231f31bc2` at `2026-09-04T18:51:45.281Z`: retain purpose. Current canonical definition and independently read helper/callers support the existing claim.
- `fact:235bb628-4806-4c76-9a7c-5f03559bd7bf` at `2026-09-04T18:51:45.281Z`: retain state_behavior. Current canonical definition and independently read helper/callers support the existing claim.

### main/melee/ft/ftcamera:ftCamera_80076320

- `fact:cc3fde83-d0fe-457e-ba94-7e2fc61bd551` at `2026-09-04T18:51:45.281Z`: retain data_flow. Current canonical definition and independently read helper/callers support the existing claim.
- `fact:39eb551c-c2ba-451d-809d-3f63c4227ac6` at `2026-09-04T18:51:45.281Z`: supersede game_mapping. Named callers support DeadUp. The source establishes a ratio but does not guarantee its magnitude is below one, so the inherited compression assertion is removed.
- `fact:85d63cea-54b9-4230-a256-a1b80eb4b547` at `2026-09-06T02:34:38.472Z`: retain inferred_name. Retain as inferred only. Canonical symbol is unchanged; current local behavior and named callers support this descriptive alias.
- `fact:6409d008-8024-4682-9c60-941d19292fcf` at `2026-09-04T18:51:45.281Z`: retain inferred_type. Current canonical definition and independently read helper/callers support the existing claim.
- `fact:d4f92335-d435-43a3-995a-2dcfb3cfc56a` at `2026-09-04T18:51:45.281Z`: retain purpose. Current canonical definition and independently read helper/callers support the existing claim.
- `fact:63de7d44-7a40-4df7-8fb7-588b69726fe5` at `2026-09-04T18:51:45.281Z`: retain state_behavior. Current canonical definition and independently read helper/callers support the existing claim.

### main/melee/ft/ftcamera:ftCamera_UpdateCameraBox

- `fact:77266c65-6496-4e2d-a741-d443ba1e4b78` at `2026-09-04T18:51:45.281Z`: retain data_flow. Current canonical definition and independently read helper/callers support the existing claim.
- `fact:eff2bebe-b5f9-4ba9-97da-530f6df3c2e5` at `2026-09-04T18:51:45.281Z`: retain game_mapping. Current canonical definition and independently read helper/callers support the existing claim.
- `fact:ff82863f-72d3-4154-8717-15b11d0f12c1` at `2026-09-04T18:51:45.281Z`: retain inferred_type. Current canonical definition and independently read helper/callers support the existing claim.
- `fact:3a53ec01-77bb-4304-a0e5-8a9a9ad2cf90` at `2026-09-04T18:51:45.281Z`: retain purpose. Current canonical definition and independently read helper/callers support the existing claim.
- `fact:f808b8fc-4e02-4934-a623-a7b69ed96be1` at `2026-09-04T18:51:45.281Z`: retain state_behavior. Current canonical definition and independently read helper/callers support the existing claim.

### main/melee/ft/ftcamera:ftCamera_800762F4#r3

r3 is the HSD_GObj* gobj input; valid Fighter userdata and attached camera subject are required. No new entity or field-type claim.
No existing facts.


### main/melee/ft/ftcamera:ftCamera_80076320#r3

r3 is the HSD_GObj* gobj input; valid Fighter userdata and attached camera subject are required. No new entity or field-type claim.
No existing facts.


### main/melee/ft/ftcamera:ftCamera_UpdateCameraBox#r3

r3 is the HSD_GObj* gobj input; valid Fighter userdata and attached camera subject are required. No new entity or field-type claim.
No existing facts.


## Review Boundary

Three category-specific proposals extend bone data flow and narrow two game mappings. All 17 existing facts have explicit ID and timestamp dispositions in coverage.json. Shared type naming remains outside this cluster. No canonical or shared-KB writes occurred.
