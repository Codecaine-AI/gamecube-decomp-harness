# Hardened QA Rule Dry Run — Open PR Delta

- Date: 2026-06-13
- Melee branch: `codex/split-up/mn` @ `ec038c4`
- Base: `origin/master` merge-base `a384731c3042`
- Scanner JSON: `reports/qa-scan-open-pr-hardened-2026-06-13.json`
- Scanner status: `failed` (800 errors, 327 warnings, 64 files with findings, 122 scanned files)

## Error Rule Counts

| Rule | Errors |
| --- | ---: |
| `m2c_residue_names` | 616 |
| `string_literal_to_symbol` | 47 |
| `unrolled_assert` | 46 |
| `assert_idiom_downgrade` | 35 |
| `self_tu_extern` | 25 |
| `extern_literal_anchor` | 9 |
| `m2c_goto_label` | 7 |
| `new_data_anchor` | 4 |
| `m2c_field_use` | 3 |
| `fake_assert_macro` | 3 |
| `define_alias` | 2 |
| `register_keyword` | 1 |
| `packed_string_blob` | 1 |
| `resubmission_tombstone` | 1 |

## Warning Rule Counts

| Rule | Warnings |
| --- | ---: |
| `type_erasing_cast` | 184 |
| `m2c_residue_names` | 77 |
| `m2c_goto_label` | 63 |
| `novel_pragma` | 2 |
| `define_alias` | 1 |

## Files With Error Findings

54 files have error-severity findings. Rule breakdowns count error findings only; warning counts are included for triage context.

| File | Errors | Warnings | Error rules | First error lines |
| --- | ---: | ---: | --- | --- |
| `src/melee/cm/camera.c` | 33 | 10 | `m2c_residue_names` x25, `assert_idiom_downgrade` x4, `unrolled_assert` x4 | 731, 777, 777, 782, 782, 811, 811, 815, ... |
| `src/melee/ft/chara/ftCommon/ftCo_0A01.c` | 76 | 18 | `m2c_residue_names` x65, `self_tu_extern` x11 | 4417, 4418, 4419, 4420, 4421, 4422, 4423, 4424, ... |
| `src/melee/ft/chara/ftCommon/ftCo_Guard.c` | 1 | 2 | `m2c_residue_names` x1 | 621 |
| `src/melee/ft/chara/ftCommon/ftCo_ItemThrow.c` | 1 | 0 | `m2c_field_use` x1 | 484 |
| `src/melee/ft/chara/ftKirby/ftkirbyspecialmars.c` | 2 | 0 | `unrolled_assert` x2 | 130, 160 |
| `src/melee/ft/chara/ftKirby/ftkirbyspecialn.c` | 1 | 0 | `extern_literal_anchor` x1 | 80 |
| `src/melee/ft/ftaction.c` | 25 | 1 | `m2c_residue_names` x25 | 904, 904, 904, 912, 912, 912, 922, 922, ... |
| `src/melee/ft/ftcpuattack.c` | 4 | 16 | `m2c_residue_names` x4 | 1559, 1607, 1655, 1776 |
| `src/melee/ft/ftdynamics.c` | 9 | 0 | `m2c_residue_names` x9 | 28, 32, 48, 48, 51, 59, 65, 67, ... |
| `src/melee/gm/gm_1601.c` | 97 | 14 | `m2c_residue_names` x95, `m2c_field_use` x2 | 811, 812, 828, 830, 832, 832, 839, 841, ... |
| `src/melee/gm/gm_16F1.c` | 3 | 1 | `m2c_residue_names` x3 | 1270, 1281, 1313 |
| `src/melee/gm/gm_18A5.c` | 4 | 6 | `m2c_residue_names` x3, `define_alias` x1 | 7364, 7415, 7419, 7427 |
| `src/melee/gm/gm_1A4C.c` | 2 | 0 | `unrolled_assert` x2 | 439, 443 |
| `src/melee/gm/gm_1B03.c` | 2 | 0 | `m2c_residue_names` x2 | 1849, 1849 |
| `src/melee/gm/gm_1BA8.c` | 17 | 59 | `m2c_residue_names` x16, `m2c_goto_label` x1 | 391, 399, 400, 425, 427, 433, 950, 992, ... |
| `src/melee/gm/gmregclear.c` | 13 | 10 | `m2c_residue_names` x10, `string_literal_to_symbol` x2, `extern_literal_anchor` x1 | 913, 922, 925, 927, 928, 929, 930, 931, ... |
| `src/melee/gm/gmresult.c` | 14 | 6 | `string_literal_to_symbol` x8, `assert_idiom_downgrade` x5, `m2c_residue_names` x1 | 1612, 1614, 1936, 1940, 1940, 1943, 1943, 1948, ... |
| `src/melee/gm/gmresultplayer.c` | 1 | 0 | `m2c_residue_names` x1 | 1458 |
| `src/melee/gm/gmstaffroll.c` | 6 | 0 | `extern_literal_anchor` x2, `assert_idiom_downgrade` x2, `unrolled_assert` x2 | 134, 135, 277, 277, 433, 433 |
| `src/melee/gm/gmtou.c` | 4 | 0 | `extern_literal_anchor` x2, `string_literal_to_symbol` x2 | 56, 57, 88, 1285 |
| `src/melee/gr/grbigblue.c` | 4 | 1 | `self_tu_extern` x2, `unrolled_assert` x2 | 47, 48, 1398, 1409 |
| `src/melee/gr/grgreens.c` | 2 | 3 | `assert_idiom_downgrade` x1, `unrolled_assert` x1 | 917, 917 |
| `src/melee/gr/grinishie1.c` | 18 | 1 | `assert_idiom_downgrade` x9, `string_literal_to_symbol` x5, `unrolled_assert` x3, `define_alias` x1 | 39, 39, 248, 304, 304, 466, 482, 490, ... |
| `src/melee/gr/grkongo.c` | 133 | 8 | `m2c_residue_names` x125, `self_tu_extern` x4, `m2c_goto_label` x2, `string_literal_to_symbol` x1, `unrolled_assert` x1 | 101, 102, 103, 104, 321, 333, 336, 341, ... |
| `src/melee/gr/grmaterial.c` | 4 | 1 | `m2c_residue_names` x4 | 339, 340, 359, 360 |
| `src/melee/gr/grmutecity.c` | 1 | 0 | `m2c_residue_names` x1 | 1615 |
| `src/melee/gr/groldkongo.c` | 144 | 6 | `m2c_residue_names` x140, `m2c_goto_label` x4 | 287, 288, 296, 297, 299, 300, 301, 302, ... |
| `src/melee/gr/ground.c` | 34 | 7 | `m2c_residue_names` x30, `string_literal_to_symbol` x2, `unrolled_assert` x2 | 570, 571, 572, 582, 582, 582, 587, 588, ... |
| `src/melee/gr/grpstadium.c` | 19 | 0 | `m2c_residue_names` x19 | 2187, 2187, 2188, 2188, 2189, 2201, 2202, 2204, ... |
| `src/melee/gr/grrcruise.c` | 12 | 0 | `assert_idiom_downgrade` x5, `unrolled_assert` x5, `self_tu_extern` x1, `m2c_residue_names` x1 | 88, 415, 415, 419, 419, 424, 424, 430, ... |
| `src/melee/gr/grshrineroute.c` | 5 | 0 | `self_tu_extern` x3, `assert_idiom_downgrade` x1, `unrolled_assert` x1 | 125, 126, 127, 416, 416 |
| `src/melee/gr/grvenom.c` | 13 | 33 | `unrolled_assert` x9, `extern_literal_anchor` x2, `register_keyword` x1, `fake_assert_macro` x1 | 313, 991, 992, 994, 995, 1325, 1328, 1535, ... |
| `src/melee/if/ifprize.c` | 4 | 2 | `string_literal_to_symbol` x4 | 305, 308, 349, 352 |
| `src/melee/if/textlib.c` | 3 | 0 | `string_literal_to_symbol` x2, `unrolled_assert` x1 | 104, 105, 105 |
| `src/melee/it/itcoll.c` | 11 | 1 | `m2c_residue_names` x11 | 794, 796, 799, 800, 801, 802, 803, 820, ... |
| `src/melee/it/items/itseakchain.c` | 1 | 0 | `self_tu_extern` x1 | 46 |
| `src/melee/lb/lb_00F9.c` | 3 | 0 | `self_tu_extern` x3 | 2161, 2162, 2163 |
| `src/melee/lb/lbaudio_ax.c` | 3 | 6 | `string_literal_to_symbol` x3 | 2540, 2544, 2554 |
| `src/melee/lb/lbbgflash.c` | 2 | 7 | `fake_assert_macro` x1, `unrolled_assert` x1 | 692, 693 |
| `src/melee/lb/lbcollision.c` | 7 | 0 | `m2c_residue_names` x7 | 467, 467, 468, 573, 574, 575, 576 |
| `src/melee/lb/lbmthp.c` | 2 | 0 | `m2c_residue_names` x1, `unrolled_assert` x1 | 58, 229 |
| `src/melee/mn/mncharsel.c` | 13 | 3 | `string_literal_to_symbol` x10, `m2c_residue_names` x3 | 175, 178, 181, 214, 229, 235, 247, 253, ... |
| `src/melee/mn/mndiagram.c` | 2 | 0 | `fake_assert_macro` x1, `unrolled_assert` x1 | 2285, 2286 |
| `src/melee/mn/mnevent.c` | 3 | 2 | `assert_idiom_downgrade` x2, `unrolled_assert` x1 | 383, 384, 384 |
| `src/melee/mn/mninfo.c` | 7 | 0 | `m2c_residue_names` x7 | 386, 387, 388, 388, 388, 392, 396 |
| `src/melee/mn/mnname.c` | 6 | 3 | `assert_idiom_downgrade` x4, `unrolled_assert` x2 | 921, 922, 922, 1478, 1479, 1479 |
| `src/melee/mn/mnnamenew.c` | 4 | 8 | `assert_idiom_downgrade` x2, `unrolled_assert` x1, `string_literal_to_symbol` x1 | 1741, 1742, 1742, 1856 |
| `src/melee/mn/mnsoundtest.c` | 2 | 1 | `m2c_residue_names` x2 | 813, 815 |
| `src/melee/mn/mnvibration.c` | 1 | 0 | `m2c_residue_names` x1 | 847 |
| `src/melee/mp/mplib.c` | 8 | 2 | `new_data_anchor` x4, `m2c_residue_names` x4 | 815, 816, 5707, 5708, 6602, 6603, 6603, 6604 |
| `src/melee/vi/vi1201v1.c` | 5 | 0 | `string_literal_to_symbol` x3, `unrolled_assert` x2 | 227, 230, 232, 286, 289 |
| `src/melee/vi/vi1201v2.c` | 2 | 7 | `unrolled_assert` x2 | 312, 315 |
| `src/sysdolphin/baselib/particle.c` | 6 | 13 | `string_literal_to_symbol` x4, `packed_string_blob` x1, `resubmission_tombstone` x1 | 1019, 1019, 1124, 1126, 1328, 1332 |
| `src/sysdolphin/baselib/sislib.c` | 1 | 24 | `extern_literal_anchor` x1 | 70 |

## Smoke-Test Coverage

The implementation includes `tools/source_editing/review_lint/tests/fixtures/hardened_rules_smoke.patch`, exercised by `test_hardened_rules_smoke_flags_real_gate_path`, which runs `scan_diff.py --gate` and asserts the hardened rules emit findings through the same gate path used by worker and ship validation.

## Command

```bash
python3 tools/source_editing/review_lint/api/scan_diff.py --repo projects/melee/checkout --base origin/master --gate --json > reports/qa-scan-open-pr-hardened-2026-06-13.json
```
