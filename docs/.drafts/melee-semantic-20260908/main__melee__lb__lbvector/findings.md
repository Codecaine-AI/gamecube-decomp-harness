# Vector Findings

Key corrections: Lerp output aliasing, line-distance output aliasing, projection finite-result/depth assumptions, invalid rotation selectors, and identified small-data diagnostic text.

## Fact Dispositions

### main/melee/lb/lbvector:.data

Source filename and coordinate-range assertion diagnostics.

- `fact:87472f56-1eee-441d-abaa-1feea9f3d779` at `2026-09-04T21:14:57.030Z`: retain data_flow. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.
- `fact:2573b27e-fb5b-44bc-baae-9c778bf5f812` at `2026-09-04T21:14:57.030Z`: supersede inferred_type. Separates the observed object sections and their padding; object hashes are attached to the review.
- `fact:ac606b1d-98b5-4aec-abd8-f39167f6364f` at `2026-09-04T21:14:57.030Z`: supersede purpose. Correct the inherited inclusion of pointer-assertion text in .data.

### main/melee/lb/lbvector:.sdata

The pos3d pointer-assertion string, identified in existing object bytes.

- `fact:567868ba-c147-4bd4-94e1-3cbc3b2ff782` at `2026-09-04T23:40:57.082Z`: supersede inferred_type. Existing object bytes resolve the formerly unknown small-data payload.
- `fact:d5605d9d-50de-4cf5-96b4-2f0488fc214f` at `2026-09-04T23:40:57.082Z`: supersede purpose. The macro stringifies the source condition and existing object bytes identify this section.

### main/melee/lb/lbvector:.sdata2

Pooled scalar coefficients, tolerances and projection literals.

- `fact:1a4ba8c3-8f98-4007-bad4-c2ffb7201b09` at `2026-09-04T23:40:57.082Z`: retain data_flow. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.
- `fact:bd6bcedf-c364-462d-9314-b5f68bcefc0c` at `2026-09-02T05:08:23.570Z`: retain inferred_type. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.
- `fact:bf09fedd-2ac5-47c8-9556-d8b157ce3c91` at `2026-09-04T23:40:57.082Z`: retain purpose. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.

### main/melee/lb/lbvector:lbVector_8000DE38

Evaluate the quadratic through three packed Vec3 samples at parameters0,0.5,1; clamp ordered inputs to0..1.

- `fact:a6ce0dee-6f9c-496a-9083-0019d74e93fa` at `2026-09-04T23:40:57.082Z`: retain data_flow. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.
- `fact:185f6875-cf47-488c-9c59-80515167e68b` at `2026-09-04T21:14:57.030Z`: unresolved game_mapping. Stock animation use is verified, but raised-midpoint construction and transfer-between-player semantics were not independently read.
- `fact:656bf412-6a3d-4e50-b6d8-f7bf61edc8c4` at `2026-09-06T02:34:38.472Z`: retain inferred_name. Retain descriptive hypothesis supported by the arithmetic; canonical symbol remains unchanged.
- `fact:dd045eef-6fe5-4087-82c0-4f48f1e3e2b8` at `2026-09-04T23:40:57.082Z`: retain inferred_type. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.
- `fact:cb20ef36-d5db-42fb-9b99-830a49246aae` at `2026-09-02T05:09:07.030Z`: retain purpose. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.
- `fact:27fc0ca4-9fe4-4e00-9f7c-7f3affe87bce` at `2026-09-04T21:14:57.030Z`: retain state_behavior. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.

### main/melee/lb/lbvector:lbVector_8000E838

Project onto an infinite line, return residual length and write closest point; tiny direction falls back to a.

- `fact:2d881b03-7dc0-4cc4-8abc-535530bf1658` at `2026-09-02T05:12:16.254Z`: supersede data_flow. The inherited unconditional no-input-mutation claim overlooks output aliasing and the late c read.
- `fact:15a6b4ec-8aa4-4871-8743-69a7fd38fee5` at `2026-09-04T23:40:57.082Z`: retain inferred_name. Retain descriptive hypothesis supported by the arithmetic; canonical symbol remains unchanged.
- `fact:39486ad6-a8fc-4740-8d0c-c47cb214a6c6` at `2026-09-04T23:40:57.082Z`: retain inferred_type. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.
- `fact:0b8097e8-7bcb-48d0-9f5a-03b549116600` at `2026-09-02T05:12:16.254Z`: retain purpose. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.
- `fact:9a771e08-4098-4e79-90dc-26a044b12669` at `2026-09-02T05:12:16.254Z`: retain state_behavior. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.

### main/melee/lb/lbvector:lbVector_Add

Accumulate XYZ and return the first pointer.

- `fact:35c6f320-3346-4499-a3b8-0887bab9cfd0` at `2026-09-02T01:03:22.243Z`: retain data_flow. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.
- `fact:6304c2f3-d972-4660-bcdc-9cb2876902cb` at `2026-09-02T01:03:22.243Z`: retain inferred_type. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.
- `fact:14d2863e-30d2-48d2-b44d-965a3d704354` at `2026-09-02T01:03:22.243Z`: retain purpose. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.

### main/melee/lb/lbvector:lbVector_Add_xy

Accumulate XY without reading or changing Z.

- `fact:25917119-a9a2-4463-81e8-5d5f0a82d502` at `2026-09-02T01:03:24.766Z`: retain data_flow. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.
- `fact:09fbb7a7-4ada-4c3f-9162-8058b896953a` at `2026-09-02T01:03:24.766Z`: retain inferred_type. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.
- `fact:e0b22da0-fbd7-48ff-ab1f-99387b69fc4b` at `2026-09-02T01:03:24.766Z`: retain purpose. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.

### main/melee/lb/lbvector:lbVector_Angle

Unsigned 3D angle; length product must exceed 1e-10, otherwise zero; clamp cosine before acos.

- `fact:1092600c-c200-491e-99a4-56dbb3bcdb92` at `2026-09-02T01:03:15.883Z`: retain data_flow. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.
- `fact:2453050e-d3ba-436b-9a66-375d2a70f41a` at `2026-09-02T01:03:15.883Z`: retain inferred_type. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.
- `fact:d5a37a1b-1987-4e53-a6a3-eb33dc589a89` at `2026-09-02T01:03:15.883Z`: retain purpose. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.
- `fact:eff86dfe-f41e-4c0c-b416-80c48f73a355` at `2026-09-02T01:03:15.883Z`: retain state_behavior. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.

### main/melee/lb/lbvector:lbVector_AngleXY

Unsigned XY angle; only exact zero product is rejected, unlike Angle threshold.

- `fact:f9669aa9-e65b-442c-ad83-9e070f298c91` at `2026-09-04T21:14:57.030Z`: retain data_flow. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.
- `fact:76035ebb-2dc6-43c8-8ae6-605e8eb1b7be` at `2026-09-04T23:40:57.082Z`: retain inferred_type. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.
- `fact:0e57a31f-82dd-40cc-8b49-9f4f6f9bcdbd` at `2026-09-04T21:14:57.030Z`: retain purpose. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.
- `fact:9206c938-b397-49b2-8f07-128dcbf95e73` at `2026-09-04T21:14:57.030Z`: retain state_behavior. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.

### main/melee/lb/lbvector:lbVector_ApplyEulerRotation

Rotate v successively about X,Y,Z; angles are read between mutations.

- `fact:4eb40c63-a63d-456b-bd5f-969f94caaccd` at `2026-09-04T21:14:57.030Z`: retain data_flow. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.
- `fact:0f8d2553-4082-4754-8ba8-1ee2a4a9f2c2` at `2026-09-04T23:40:57.082Z`: retain inferred_type. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.
- `fact:325a5218-b1fa-4fc8-b824-b338d0fc112e` at `2026-09-04T21:14:57.030Z`: retain purpose. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.

### main/melee/lb/lbvector:lbVector_CosAngle

XY cosine ratio with no zero check or clamp.

- `fact:d80c8da2-d755-488b-9b80-6146f6ce1bde` at `2026-09-02T01:03:06.578Z`: retain data_flow. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.
- `fact:25e14107-a5e6-4d80-81e8-b8fe9da5b700` at `2026-09-02T01:03:06.578Z`: retain inferred_type. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.
- `fact:cae33e91-763f-4d42-9f0f-7e4ed2e0c60c` at `2026-09-02T01:03:06.578Z`: retain purpose. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.

### main/melee/lb/lbvector:lbVector_CreateEulerMatrix

Construct approximate Rz Ry Rx linear matrix and clear translation; Quaternion.w is unused.

- `fact:aebfb130-64f7-40a6-ada8-a9fb06f9091c` at `2026-09-04T21:14:57.030Z`: retain data_flow. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.
- `fact:8784cf4b-2441-41da-81ea-d7d907c1b460` at `2026-09-04T21:14:57.030Z`: retain inferred_type. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.
- `fact:ef3a56ab-21cc-4efa-b3fb-98443ae3d9b2` at `2026-09-04T21:14:57.030Z`: retain purpose. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.

### main/melee/lb/lbvector:lbVector_CrossprodNormalized

Compute a cross b and normalize the output; a zero cross product remains zero.

- `fact:8099e4bd-81d0-4aa6-8e4f-1fb9adaa9d5f` at `2026-09-04T23:40:57.082Z`: retain data_flow. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.
- `fact:25543405-ff5d-4a60-b540-4b3d9528bdff` at `2026-09-02T01:03:16.415Z`: retain inferred_type. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.
- `fact:42de769e-64ff-4a14-b589-80e3160c87b5` at `2026-09-04T23:40:57.082Z`: retain purpose. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.

### main/melee/lb/lbvector:lbVector_Diff

Write a minus b componentwise; exact alias with either input is supported.

- `fact:ca70eed7-692a-440c-bb8b-103ee431ed57` at `2026-09-02T01:03:22.466Z`: retain data_flow. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.
- `fact:e525caf9-83a0-4302-ade9-f0d34ce00e3a` at `2026-09-02T01:03:22.466Z`: retain inferred_type. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.
- `fact:8add5236-c8fc-4421-989e-89cc16696c96` at `2026-09-02T01:03:22.466Z`: retain purpose. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.

### main/melee/lb/lbvector:lbVector_EulerAnglesFromONB

Extract XYZ Euler angles from basis arranged b,c,a; exact b.z endpoints choose singular branches.

- `fact:b2a17ecd-7d63-4ce4-be0e-4de10c928ead` at `2026-09-02T01:04:34.310Z`: supersede data_flow. The inherited flow omitted singular formulas and overstated input preservation under aliasing.
- `fact:2a4d6e2e-8fe6-4d88-bf39-9fc911a718ae` at `2026-09-04T21:14:57.030Z`: retain inferred_type. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.
- `fact:312890b0-fc10-4893-8038-da1435f9f01d` at `2026-09-02T01:04:34.310Z`: retain purpose. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.
- `fact:db0a5eb3-0d59-4aba-862d-9037db7f3e35` at `2026-09-02T01:04:34.310Z`: retain state_behavior. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.

### main/melee/lb/lbvector:lbVector_EulerAnglesFromPartialONB

Normalize c cross a as b, then extract Euler angles; a and c are not normalized or orthogonalized.

- `fact:4d7d5ba5-dd5b-401a-bb48-40978f148160` at `2026-09-04T21:14:57.030Z`: retain data_flow. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.
- `fact:33cbaa89-0e37-4c1d-a72d-7c0559078c8a` at `2026-09-04T21:14:57.030Z`: supersede inferred_type. Qualify input preservation by output aliasing.
- `fact:b4ebb758-233c-4407-a231-fbd9c532c7a5` at `2026-09-04T21:14:57.030Z`: retain purpose. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.
- `fact:ea8e98ad-2337-4a91-bdbe-55cfd37944f2` at `2026-09-04T23:40:57.082Z`: retain state_behavior. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.

### main/melee/lb/lbvector:lbVector_Lerp

Unclamped affine interpolation when result does not alias the first endpoint; destructive intermediate writes matter.

- `fact:c393125a-dc1f-410b-9a46-fd85bb856bf2` at `2026-09-02T01:03:25.304Z`: supersede data_flow. Sequential writes expose an alias restriction omitted from the inherited generic interpolation account.
- `fact:0cd0f26f-3189-4072-9141-b3d428b7177f` at `2026-09-02T01:03:25.304Z`: retain inferred_type. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.
- `fact:e376b005-8725-4825-a7dd-e0304668e585` at `2026-09-02T01:03:25.304Z`: retain purpose. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.

### main/melee/lb/lbvector:lbVector_Mirror

Planar reflection update using a supplied unit XY normal; Z preserved.

- `fact:2acf512f-7211-40b7-87bd-2391e0ab9155` at `2026-09-02T01:03:19.899Z`: retain data_flow. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.
- `fact:34a1ae82-a583-4acc-b5a1-f4dd1f6c19ec` at `2026-09-02T01:03:19.899Z`: unresolved game_mapping. Specific external gameplay consumers were not independently read; preserve this inherited caller claim pending family review.
- `fact:8fe857fb-1560-4015-84eb-e3921e140151` at `2026-09-02T01:03:19.899Z`: retain inferred_type. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.
- `fact:0359d037-c59b-4ff1-bf0c-4e2b9ca3afd9` at `2026-09-02T01:03:19.899Z`: retain purpose. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.

### main/melee/lb/lbvector:lbVector_Normalize

Normalize XYZ in place unless computed length equals zero; return the computed original length.

- `fact:2854585f-85db-424b-a5b7-565853757062` at `2026-09-02T01:03:06.002Z`: retain data_flow. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.
- `fact:f99c7bfd-5743-412d-a556-098220724d88` at `2026-09-02T01:03:06.002Z`: retain inferred_type. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.
- `fact:ec9dbfc8-47ad-42cc-aeb6-248bb1b94467` at `2026-09-02T01:03:06.002Z`: retain purpose. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.
- `fact:4eaca818-391f-4a7c-a6a8-8189289f9dc1` at `2026-09-02T01:03:06.002Z`: retain state_behavior. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.

### main/melee/lb/lbvector:lbVector_NormalizeXY

Normalize XY and preserve Z; exact computed-zero check.

- `fact:7feca76f-6679-4be1-b4f3-f4f208e9c670` at `2026-09-02T01:03:06.796Z`: retain data_flow. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.
- `fact:484d252a-af4b-4c9c-9bb6-22e82f8596da` at `2026-09-02T01:03:06.796Z`: retain inferred_type. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.
- `fact:66363cd2-df52-4442-b657-ac41dd90c99f` at `2026-09-02T01:03:06.796Z`: retain purpose. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.
- `fact:5840ecc7-7cb7-41df-803f-53451218f118` at `2026-09-02T01:03:06.796Z`: retain state_behavior. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.

### main/melee/lb/lbvector:lbVector_Rotate

Principal-axis approximate rotation for selectors exactly 1,2,4. Other selectors leave local outputs uninitialized.

- `fact:1268923b-49f1-48ab-a4a3-3d5599803c0a` at `2026-09-04T21:14:57.030Z`: retain data_flow. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.
- `fact:e2a90e4c-a613-44d9-af03-57243ff31058` at `2026-09-04T23:40:57.082Z`: retain inferred_type. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.
- `fact:f42f25b6-f554-4447-9772-f74392ed9833` at `2026-09-04T21:14:57.030Z`: retain purpose. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.

### main/melee/lb/lbvector:lbVector_RotateAboutUnitAxis

In-place approximate rotation about an assumed unit axis, with a near-X alignment shortcut.

- `fact:11dff30c-e063-4f28-9fa7-43718cd87e8b` at `2026-09-04T21:11:56.543Z`: retain data_flow. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.
- `fact:c4c799bc-370f-4e2e-afdd-d2e9765be0ef` at `2026-09-04T21:11:56.543Z`: unresolved game_mapping. Specific external gameplay consumers were not independently read; preserve this inherited caller claim pending family review.
- `fact:19e64259-408b-4435-9e62-8ce0b236fed3` at `2026-09-04T21:11:56.543Z`: retain inferred_type. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.
- `fact:69acc47f-1408-4a48-a183-f3a92818b37f` at `2026-09-04T21:11:56.543Z`: retain purpose. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.
- `fact:39f31773-172c-4669-b761-84ee4db42499` at `2026-09-04T21:11:56.543Z`: retain state_behavior. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.

### main/melee/lb/lbvector:lbVector_Sub

Subtract XYZ in place and return the first pointer.

- `fact:aad80b5e-0700-4d44-8398-0a0f84637aee` at `2026-09-02T01:03:34.847Z`: supersede data_flow. Clarify the alias-dependent preservation statement.
- `fact:7ff5972d-9d1b-40b8-bb01-6460b0517cc4` at `2026-09-02T01:03:34.847Z`: retain inferred_type. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.
- `fact:9818f140-23bf-4d11-8980-c0a346211199` at `2026-09-02T01:03:34.847Z`: retain purpose. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.

### main/melee/lb/lbvector:lbVector_WorldToScreen

Project through perspective or orthographic HSD camera; unsupported modes return NULL; near-depth adjustment precedes GXProject.

- `fact:70afade0-12e5-4202-8ddc-7676faa85b77` at `2026-09-02T01:03:20.724Z`: supersede data_flow. Remove an unconditional exact-depth claim while retaining the full local data path.
- `fact:8ed26cc0-eb27-4178-bd5d-4728b887510f` at `2026-09-02T01:03:20.724Z`: unresolved game_mapping. Specific external gameplay consumers were not independently read; preserve this inherited caller claim pending family review.
- `fact:1a34f36d-8f2d-40eb-904a-b04b13bc6a17` at `2026-09-02T01:03:20.724Z`: retain inferred_type. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.
- `fact:53e24a5f-e450-4132-970a-948c36504cb5` at `2026-09-02T01:03:20.724Z`: supersede purpose. The position assertions do not validate camera parameters or establish finite output.
- `fact:7346659b-be50-42df-b52d-a56eb776dfac` at `2026-09-02T01:03:20.724Z`: supersede state_behavior. Qualify the inherited exact depth result by the mathematical matrix invariant.

### main/melee/lb/lbvector:lbVector_sqrtf_accurate

Delegate scalar sqrt to the configured math helper.

- `fact:3c8af682-6cfb-4628-b712-e857e0547fc6` at `2026-09-02T01:05:21.046Z`: retain data_flow. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.
- `fact:7b1b22ad-8e30-4b31-b130-fe900ca41bc6` at `2026-09-02T01:05:21.046Z`: retain inferred_type. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.
- `fact:aa33f6d4-3070-4781-ad8d-c594f2bcea1d` at `2026-09-02T01:05:21.046Z`: supersede purpose. The higher-refinement behavior is target-configuration-specific.

### main/melee/lb/lbvector:sqrtf__Ff

Emitted ordinary sqrtf helper used by inline vector length; canonical implementation resides in math_ppc.h.

- `fact:67ebe5b9-bf8b-40c2-ba4e-80bc0d4f5413` at `2026-09-04T23:40:57.082Z`: supersede data_flow. Record the actual target helper branches and refinements.
- `fact:395858a3-273e-4a31-93b4-3a5545bef57e` at `2026-09-04T23:40:57.082Z`: retain inferred_name. sqrtf is attested in the included target math header; retain as source spelling for the emitted mangled symbol, not a rename of the canonical target key.
- `fact:205ec608-a7cf-44bd-8029-8ea051dd85c9` at `2026-09-04T23:40:57.082Z`: supersede inferred_type. Restrict mathematical square-root semantics to the positive-input branch.
- `fact:afe34788-7a92-4155-96e9-94f39954c8b5` at `2026-09-04T23:40:57.082Z`: supersede purpose. Independent header read limits the inherited all-input square-root claim.

### src/melee/lb/lbvector.c

Caller-owned vector and matrix arithmetic, planar and spatial geometry, orientation conversion and projection.

- `fact:f0fa3fdf-96ee-42a3-acb1-98d47fb274fe` at `2026-09-06T03:50:58.751Z`: retain data_flow. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.
- `fact:7d265182-9969-4c14-87f1-fdc01239e175` at `2026-09-06T03:50:58.751Z`: retain inferred_type. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.
- `fact:0a551544-3fef-4ee4-a1a1-3b034f03c073` at `2026-09-06T03:50:58.751Z`: retain purpose. Current complete canonical arithmetic and independently read helper evidence support the stated normal-input behavior.

### main/melee/lb/lbvector:lbVector_8000DE38#r3

Evaluate the quadratic through three packed Vec3 samples at parameters0,0.5,1; clamp ordered inputs to0..1.

No existing facts. Canonical parameter slot reviewed in its function signature; input/output roles follow the parent function account. No new entity claims.


### main/melee/lb/lbvector:lbVector_8000DE38#r4

Evaluate the quadratic through three packed Vec3 samples at parameters0,0.5,1; clamp ordered inputs to0..1.

No existing facts. Canonical parameter slot reviewed in its function signature; input/output roles follow the parent function account. No new entity claims.


### main/melee/lb/lbvector:lbVector_8000DE38#r5

Evaluate the quadratic through three packed Vec3 samples at parameters0,0.5,1; clamp ordered inputs to0..1.

No existing facts. Canonical parameter slot reviewed in its function signature; input/output roles follow the parent function account. No new entity claims.


### main/melee/lb/lbvector:lbVector_8000E838#r3

Project onto an infinite line, return residual length and write closest point; tiny direction falls back to a.

No existing facts. Canonical parameter slot reviewed in its function signature; input/output roles follow the parent function account. No new entity claims.


### main/melee/lb/lbvector:lbVector_8000E838#r4

Project onto an infinite line, return residual length and write closest point; tiny direction falls back to a.

No existing facts. Canonical parameter slot reviewed in its function signature; input/output roles follow the parent function account. No new entity claims.


### main/melee/lb/lbvector:lbVector_8000E838#r5

Project onto an infinite line, return residual length and write closest point; tiny direction falls back to a.

No existing facts. Canonical parameter slot reviewed in its function signature; input/output roles follow the parent function account. No new entity claims.


### main/melee/lb/lbvector:lbVector_8000E838#r6

Project onto an infinite line, return residual length and write closest point; tiny direction falls back to a.

No existing facts. Canonical parameter slot reviewed in its function signature; input/output roles follow the parent function account. No new entity claims.


### main/melee/lb/lbvector:lbVector_Add#r3

Accumulate XYZ and return the first pointer.

No existing facts. Canonical parameter slot reviewed in its function signature; input/output roles follow the parent function account. No new entity claims.


### main/melee/lb/lbvector:lbVector_Add#r4

Accumulate XYZ and return the first pointer.

No existing facts. Canonical parameter slot reviewed in its function signature; input/output roles follow the parent function account. No new entity claims.


### main/melee/lb/lbvector:lbVector_Add_xy#r3

Accumulate XY without reading or changing Z.

No existing facts. Canonical parameter slot reviewed in its function signature; input/output roles follow the parent function account. No new entity claims.


### main/melee/lb/lbvector:lbVector_Add_xy#r4

Accumulate XY without reading or changing Z.

No existing facts. Canonical parameter slot reviewed in its function signature; input/output roles follow the parent function account. No new entity claims.


### main/melee/lb/lbvector:lbVector_Angle#r3

Unsigned 3D angle; length product must exceed 1e-10, otherwise zero; clamp cosine before acos.

No existing facts. Canonical parameter slot reviewed in its function signature; input/output roles follow the parent function account. No new entity claims.


### main/melee/lb/lbvector:lbVector_Angle#r4

Unsigned 3D angle; length product must exceed 1e-10, otherwise zero; clamp cosine before acos.

No existing facts. Canonical parameter slot reviewed in its function signature; input/output roles follow the parent function account. No new entity claims.


### main/melee/lb/lbvector:lbVector_AngleXY#r3

Unsigned XY angle; only exact zero product is rejected, unlike Angle threshold.

No existing facts. Canonical parameter slot reviewed in its function signature; input/output roles follow the parent function account. No new entity claims.


### main/melee/lb/lbvector:lbVector_AngleXY#r4

Unsigned XY angle; only exact zero product is rejected, unlike Angle threshold.

No existing facts. Canonical parameter slot reviewed in its function signature; input/output roles follow the parent function account. No new entity claims.


### main/melee/lb/lbvector:lbVector_ApplyEulerRotation#r3

Rotate v successively about X,Y,Z; angles are read between mutations.

No existing facts. Canonical parameter slot reviewed in its function signature; input/output roles follow the parent function account. No new entity claims.


### main/melee/lb/lbvector:lbVector_ApplyEulerRotation#r4

Rotate v successively about X,Y,Z; angles are read between mutations.

No existing facts. Canonical parameter slot reviewed in its function signature; input/output roles follow the parent function account. No new entity claims.


### main/melee/lb/lbvector:lbVector_CosAngle#r3

XY cosine ratio with no zero check or clamp.

No existing facts. Canonical parameter slot reviewed in its function signature; input/output roles follow the parent function account. No new entity claims.


### main/melee/lb/lbvector:lbVector_CosAngle#r4

XY cosine ratio with no zero check or clamp.

No existing facts. Canonical parameter slot reviewed in its function signature; input/output roles follow the parent function account. No new entity claims.


### main/melee/lb/lbvector:lbVector_CreateEulerMatrix#r3

Construct approximate Rz Ry Rx linear matrix and clear translation; Quaternion.w is unused.

No existing facts. Canonical parameter slot reviewed in its function signature; input/output roles follow the parent function account. No new entity claims.


### main/melee/lb/lbvector:lbVector_CreateEulerMatrix#r4

Construct approximate Rz Ry Rx linear matrix and clear translation; Quaternion.w is unused.

No existing facts. Canonical parameter slot reviewed in its function signature; input/output roles follow the parent function account. No new entity claims.


### main/melee/lb/lbvector:lbVector_CrossprodNormalized#r3

Compute a cross b and normalize the output; a zero cross product remains zero.

No existing facts. Canonical parameter slot reviewed in its function signature; input/output roles follow the parent function account. No new entity claims.


### main/melee/lb/lbvector:lbVector_CrossprodNormalized#r4

Compute a cross b and normalize the output; a zero cross product remains zero.

No existing facts. Canonical parameter slot reviewed in its function signature; input/output roles follow the parent function account. No new entity claims.


### main/melee/lb/lbvector:lbVector_CrossprodNormalized#r5

Compute a cross b and normalize the output; a zero cross product remains zero.

No existing facts. Canonical parameter slot reviewed in its function signature; input/output roles follow the parent function account. No new entity claims.


### main/melee/lb/lbvector:lbVector_Diff#r3

Write a minus b componentwise; exact alias with either input is supported.

No existing facts. Canonical parameter slot reviewed in its function signature; input/output roles follow the parent function account. No new entity claims.


### main/melee/lb/lbvector:lbVector_Diff#r4

Write a minus b componentwise; exact alias with either input is supported.

No existing facts. Canonical parameter slot reviewed in its function signature; input/output roles follow the parent function account. No new entity claims.


### main/melee/lb/lbvector:lbVector_Diff#r5

Write a minus b componentwise; exact alias with either input is supported.

No existing facts. Canonical parameter slot reviewed in its function signature; input/output roles follow the parent function account. No new entity claims.


### main/melee/lb/lbvector:lbVector_EulerAnglesFromONB#r3

Extract XYZ Euler angles from basis arranged b,c,a; exact b.z endpoints choose singular branches.

No existing facts. Canonical parameter slot reviewed in its function signature; input/output roles follow the parent function account. No new entity claims.


### main/melee/lb/lbvector:lbVector_EulerAnglesFromONB#r4

Extract XYZ Euler angles from basis arranged b,c,a; exact b.z endpoints choose singular branches.

No existing facts. Canonical parameter slot reviewed in its function signature; input/output roles follow the parent function account. No new entity claims.


### main/melee/lb/lbvector:lbVector_EulerAnglesFromONB#r5

Extract XYZ Euler angles from basis arranged b,c,a; exact b.z endpoints choose singular branches.

No existing facts. Canonical parameter slot reviewed in its function signature; input/output roles follow the parent function account. No new entity claims.


### main/melee/lb/lbvector:lbVector_EulerAnglesFromONB#r6

Extract XYZ Euler angles from basis arranged b,c,a; exact b.z endpoints choose singular branches.

No existing facts. Canonical parameter slot reviewed in its function signature; input/output roles follow the parent function account. No new entity claims.


### main/melee/lb/lbvector:lbVector_EulerAnglesFromPartialONB#r3

Normalize c cross a as b, then extract Euler angles; a and c are not normalized or orthogonalized.

No existing facts. Canonical parameter slot reviewed in its function signature; input/output roles follow the parent function account. No new entity claims.


### main/melee/lb/lbvector:lbVector_EulerAnglesFromPartialONB#r4

Normalize c cross a as b, then extract Euler angles; a and c are not normalized or orthogonalized.

No existing facts. Canonical parameter slot reviewed in its function signature; input/output roles follow the parent function account. No new entity claims.


### main/melee/lb/lbvector:lbVector_EulerAnglesFromPartialONB#r5

Normalize c cross a as b, then extract Euler angles; a and c are not normalized or orthogonalized.

No existing facts. Canonical parameter slot reviewed in its function signature; input/output roles follow the parent function account. No new entity claims.


### main/melee/lb/lbvector:lbVector_Lerp#r3

Unclamped affine interpolation when result does not alias the first endpoint; destructive intermediate writes matter.

No existing facts. Canonical parameter slot reviewed in its function signature; input/output roles follow the parent function account. No new entity claims.


### main/melee/lb/lbvector:lbVector_Lerp#r4

Unclamped affine interpolation when result does not alias the first endpoint; destructive intermediate writes matter.

No existing facts. Canonical parameter slot reviewed in its function signature; input/output roles follow the parent function account. No new entity claims.


### main/melee/lb/lbvector:lbVector_Lerp#r5

Unclamped affine interpolation when result does not alias the first endpoint; destructive intermediate writes matter.

No existing facts. Canonical parameter slot reviewed in its function signature; input/output roles follow the parent function account. No new entity claims.


### main/melee/lb/lbvector:lbVector_Lerp#r6

Unclamped affine interpolation when result does not alias the first endpoint; destructive intermediate writes matter.

No existing facts. Canonical parameter slot reviewed in its function signature; input/output roles follow the parent function account. No new entity claims.


### main/melee/lb/lbvector:lbVector_Mirror#r3

Planar reflection update using a supplied unit XY normal; Z preserved.

No existing facts. Canonical parameter slot reviewed in its function signature; input/output roles follow the parent function account. No new entity claims.


### main/melee/lb/lbvector:lbVector_Mirror#r4

Planar reflection update using a supplied unit XY normal; Z preserved.

No existing facts. Canonical parameter slot reviewed in its function signature; input/output roles follow the parent function account. No new entity claims.


### main/melee/lb/lbvector:lbVector_Normalize#r3

Normalize XYZ in place unless computed length equals zero; return the computed original length.

No existing facts. Canonical parameter slot reviewed in its function signature; input/output roles follow the parent function account. No new entity claims.


### main/melee/lb/lbvector:lbVector_NormalizeXY#r3

Normalize XY and preserve Z; exact computed-zero check.

No existing facts. Canonical parameter slot reviewed in its function signature; input/output roles follow the parent function account. No new entity claims.


### main/melee/lb/lbvector:lbVector_Rotate#r3

Principal-axis approximate rotation for selectors exactly 1,2,4. Other selectors leave local outputs uninitialized.

No existing facts. Canonical parameter slot reviewed in its function signature; input/output roles follow the parent function account. No new entity claims.


### main/melee/lb/lbvector:lbVector_Rotate#r4

Principal-axis approximate rotation for selectors exactly 1,2,4. Other selectors leave local outputs uninitialized.

No existing facts. Canonical parameter slot reviewed in its function signature; input/output roles follow the parent function account. No new entity claims.


### main/melee/lb/lbvector:lbVector_Rotate#r5

Principal-axis approximate rotation for selectors exactly 1,2,4. Other selectors leave local outputs uninitialized.

No existing facts. Canonical parameter slot reviewed in its function signature; input/output roles follow the parent function account. No new entity claims.


### main/melee/lb/lbvector:lbVector_RotateAboutUnitAxis#r3

In-place approximate rotation about an assumed unit axis, with a near-X alignment shortcut.

No existing facts. Canonical parameter slot reviewed in its function signature; input/output roles follow the parent function account. No new entity claims.


### main/melee/lb/lbvector:lbVector_RotateAboutUnitAxis#r4

In-place approximate rotation about an assumed unit axis, with a near-X alignment shortcut.

No existing facts. Canonical parameter slot reviewed in its function signature; input/output roles follow the parent function account. No new entity claims.


### main/melee/lb/lbvector:lbVector_RotateAboutUnitAxis#r5

In-place approximate rotation about an assumed unit axis, with a near-X alignment shortcut.

No existing facts. Canonical parameter slot reviewed in its function signature; input/output roles follow the parent function account. No new entity claims.


### main/melee/lb/lbvector:lbVector_Sub#r3

Subtract XYZ in place and return the first pointer.

No existing facts. Canonical parameter slot reviewed in its function signature; input/output roles follow the parent function account. No new entity claims.


### main/melee/lb/lbvector:lbVector_Sub#r4

Subtract XYZ in place and return the first pointer.

No existing facts. Canonical parameter slot reviewed in its function signature; input/output roles follow the parent function account. No new entity claims.


### main/melee/lb/lbvector:lbVector_WorldToScreen#r3

Project through perspective or orthographic HSD camera; unsupported modes return NULL; near-depth adjustment precedes GXProject.

No existing facts. Canonical parameter slot reviewed in its function signature; input/output roles follow the parent function account. No new entity claims.


### main/melee/lb/lbvector:lbVector_WorldToScreen#r4

Project through perspective or orthographic HSD camera; unsupported modes return NULL; near-depth adjustment precedes GXProject.

No existing facts. Canonical parameter slot reviewed in its function signature; input/output roles follow the parent function account. No new entity claims.


### main/melee/lb/lbvector:lbVector_WorldToScreen#r5

Project through perspective or orthographic HSD camera; unsupported modes return NULL; near-depth adjustment precedes GXProject.

No existing facts. Canonical parameter slot reviewed in its function signature; input/output roles follow the parent function account. No new entity claims.


### main/melee/lb/lbvector:lbVector_WorldToScreen#r6

Project through perspective or orthographic HSD camera; unsupported modes return NULL; near-depth adjustment precedes GXProject.

No existing facts. Canonical parameter slot reviewed in its function signature; input/output roles follow the parent function account. No new entity claims.


### main/melee/lb/lbvector:lbVector_sqrtf_accurate#r3

Delegate scalar sqrt to the configured math helper.

No existing facts. Canonical parameter slot reviewed in its function signature; input/output roles follow the parent function account. No new entity claims.


