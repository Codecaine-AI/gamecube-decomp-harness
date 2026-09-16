# Camera Setup Review

Pinned revision `c302741689bd67c361cd7faadb221df3193992c3`. Reviewed assigned C lines 1-48 and full header lines 1-15 in both canonical and frozen rendered form. C49-95 was also read in both forms to compare initialization with UpdateCameraBox. Independently read canonical ft_0D4D.c299-382 to verify the inherited Rebirth claim. Hashes, ranges and every baseline fact ID/version appear in coverage.json.

## Scaling

ftCamera_80076018 multiplies all six x0/xC components by mul. Exact in-place use works component by component. Neither scalar validation nor a temporary whole-structure copy exists. Retain ftCamera_ScaleCameraData as an inferred name. Canonical declarations remain authoritative.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcamera.c#L10-L18 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcamera.h#L7-L8.

Ordinary init/update consume scaled offsets and extents; ftCo_Rebirth_Cam consumes x0.x as an offset added to its stored destination Y. Retain the existing Rebirth-purpose and data-flow claims after independently checking the current callback. Replace inferred_type with the exact signature and pointer roles, leaving shared-layout size claims to family review.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcamera.c#L21-L47, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcamera.c#L51-L87, code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ft_0D4D.c#L372-L382.

## Initialization

ftCamera_80076064 activates an existing subject and synchronizes target/current extents and pos/bone_pos. It uses the +1 branch only for exact facing == 1.0f. Every other value takes the -1 branch. Retain ftCamera_InitCameraBox as an inferred name, without implying allocation or an enforced one-time call.

The named update refreshes horizontal target extents and position, clears on_ledge, and delegates bone_pos computation to ftLib_800866DC. Initialization instead sets vertical target/current extents and copies pos to bone_pos. Initialization does not clear on_ledge. This difference supports the InitCameraBox name.

Evidence: code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcamera.c#L21-L47 and code://c302741689bd67c361cd7faadb221df3193992c3/src/melee/ft/ftcamera.c#L51-L87.

## Coverage

Two targets and four parameter entities reviewed. Eleven existing facts receive nine retain and two supersede decisions with timestamps and old-value hashes. Parameter entities have no existing facts. Seven category-specific proposed facts cover the two corrections, scaling state behavior and four parameter roles. No names, source files or shared KB records were changed.
