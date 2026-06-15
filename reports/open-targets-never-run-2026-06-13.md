# Open Report Targets With No Worker Session

Generated: 2026-06-13

## Scope

- Primary report: `projects/melee/checkout/build/GALE01/report.json`
- Latest epoch cross-check: `projects/melee/state/epochs/2026-06-12T22-34-25-251Z/report.json`
- Open target definition: function target from `report.json` with `fuzzy_match_percent < 100`, matching `candidateFromReportFunction` in `packages/core/src/board/candidates.ts`.
- Run-history definition: a target has run if it has at least one worker row in `pi_sessions` joined through `leases -> queue -> targets`.
- Identity key: `(unit, symbol)`.

## Summary

- Current open function targets: 886
- Current open targets with no worker session: 485 (54.74%)
- Current open targets with no lease/event record at all: 476 (53.72%)
- Current open targets that have lease/event records but no worker session: 9
- Current report and latest epoch target set identical: True
- Latest epoch open function targets: 886

Full sortable CSV: `reports/open-targets-never-run-2026-06-13.csv`

## Status Buckets For Never-Session Targets

| Count | DB status bucket |
| ---: | --- |
| 310 | `no_db_target` |
| 108 | `queued:1` |
| 58 | `queued:2` |
| 9 | `stalled:1` |

## Top Source Files

| Count | Source path |
| ---: | --- |
| 37 | `src/sysdolphin/baselib/particle.c` |
| 28 | `src/melee/gm/gm_18A5.c` |
| 19 | `src/melee/mp/mplib.c` |
| 19 | `src/melee/ft/chara/ftCommon/ftCo_0A01.c` |
| 15 | `src/melee/ty/toy.c` |
| 14 | `src/melee/gr/grbigblue.c` |
| 13 | `src/melee/cm/camera.c` |
| 13 | `src/melee/lb/lbaudio_ax.c` |
| 10 | `src/melee/gm/gm_1832.c` |
| 9 | `src/melee/ty/tyfigupon.c` |
| 9 | `extern/dolphin/src/dolphin/thp/THPDec.c` |
| 9 | `src/melee/if/ifstock.c` |
| 9 | `src/melee/gm/gm_1601.c` |
| 8 | `src/melee/gr/grzebes.c` |
| 8 | `src/melee/gr/grgreens.c` |
| 7 | `src/melee/gr/grcorneria.c` |
| 7 | `src/melee/gm/gmcamera.c` |
| 7 | `src/melee/ft/chara/ftKirby/ftkirbyspecialn.c` |
| 6 | `src/sysdolphin/baselib/hsd_3B34.c` |
| 6 | `src/melee/it/itspawn.c` |
| 6 | `src/sysdolphin/baselib/hsd_3B5C.c` |
| 6 | `src/melee/mn/mnsnap.c` |
| 6 | `src/melee/mn/mnmainrule.c` |
| 5 | `src/melee/lb/lb_00F9.c` |
| 5 | `src/melee/gm/gmtou.c` |
| 5 | `src/sysdolphin/baselib/texpdag.c` |
| 5 | `src/melee/mn/mndatadel.c` |
| 5 | `src/melee/mn/mncharsel.c` |
| 5 | `src/melee/ft/ftcpuattack.c` |
| 5 | `src/melee/mn/mnname.c` |

## Highest-Priority Never-Session Targets

| Priority | Fuzzy | Size | Unit | Symbol | Source | Status bucket |
| ---: | ---: | ---: | --- | --- | --- | --- |
| 370677.54 | 99.98171 | 1312 | `main/melee/gr/grcorneria` | `grCorneria_801E1BF0` | `src/melee/gr/grcorneria.c` | `queued:2` |
| 159808.09 | 99.97000 | 800 | `main/melee/ty/tyfigupon` | `un_80317A60` | `src/melee/ty/tyfigupon.c` | `no_db_target` |
| 122911.44 | 99.92926 | 1244 | `main/melee/ft/chara/ftYoshi/ftYs_SpecialS` | `ftYs_SpecialAirSLoop_2_Coll` | `src/melee/ft/chara/ftYoshi/ftYs_SpecialS.c` | `no_db_target` |
| 91103.48 | 99.95180 | 664 | `main/melee/lb/lb_00F9` | `fn_80013614` | `src/melee/lb/lb_00F9.c` | `queued:1` |
| 82416.71 | 99.86595 | 1492 | `main/melee/ty/toy` | `un_803087F4` | `src/melee/ty/toy.c` | `queued:1` |
| 74987.91 | 99.95420 | 524 | `main/melee/it/items/itlinkhookshot` | `it_802A7B34` | `src/melee/it/items/itlinkhookshot.c` | `stalled:1` |
| 63223.06 | 99.86301 | 1168 | `main/melee/ft/ftmaterial` | `ftMaterial_800BF6BC` | `src/melee/ft/ftmaterial.c` | `no_db_target` |
| 34560.83 | 99.62060 | 1708 | `main/melee/vi/vi1201v2` | `un_80320A40_OnEnter` | `src/melee/vi/vi1201v2.c` | `stalled:1` |
| 25662.91 | 99.82550 | 596 | `main/melee/mn/mndiagram` | `mnDiagram_802437E8` | `src/melee/mn/mndiagram.c` | `queued:2` |
| 25553.92 | 98.80405 | 8084 | `main/melee/ef/efsync` | `efSync_Spawn` | `src/melee/ef/efsync.c` | `no_db_target` |
| 22255.05 | 99.71292 | 836 | `main/melee/gr/grkongo` | `grKongo_801D6668` | `src/melee/gr/grkongo.c` | `stalled:1` |
| 21983.42 | 99.38236 | 1768 | `main/melee/mn/mnitemsw` | `mnItemSw_8023453C` | `src/melee/mn/mnitemsw.c` | `no_db_target` |
| 17525.02 | 99.87013 | 308 | `main/melee/ft/chara/ftCommon/ftCo_WarpStar` | `ftCo_800C4724` | `src/melee/ft/chara/ftCommon/ftCo_WarpStar.c` | `no_db_target` |
| 8758.13 | 99.27536 | 828 | `main/melee/ty/toy` | `un_80310324` | `src/melee/ty/toy.c` | `queued:1` |
| 8734.14 | 98.71410 | 2980 | `main/melee/gm/gmtou` | `fn_8019D1BC` | `src/melee/gm/gmtou.c` | `queued:1` |
| 8008.85 | 99.87878 | 132 | `main/melee/gm/gm_16F1` | `gm_80173754` | `src/melee/gm/gm_16F1.c` | `stalled:1` |
| 6573.25 | 99.30000 | 600 | `main/sysdolphin/baselib/particle` | `hsd_80396A20` | `src/sysdolphin/baselib/particle.c` | `stalled:1` |
| 6508.05 | 99.36296 | 540 | `main/melee/ty/tyfigupon` | `fn_80316170` | `src/melee/ty/tyfigupon.c` | `queued:1` |
| 5480.48 | 99.40566 | 424 | `main/melee/gm/gmtou` | `gm_8019ECAC_OnEnter` | `src/melee/gm/gmtou.c` | `no_db_target` |
| 4101.99 | 98.49395 | 1652 | `main/melee/mp/mpcoll` | `mpColl_80046904` | `src/melee/mp/mpcoll.c` | `no_db_target` |
| 3747.60 | 97.95973 | 4172 | `main/melee/gm/gm_19EF` | `fn_8019F9C4` | `src/melee/gm/gm_19EF.c` | `no_db_target` |
| 3704.09 | 98.17982 | 1824 | `main/melee/mn/mnitemsw` | `mnItemSw_802351A0` | `src/melee/mn/mnitemsw.c` | `no_db_target` |
| 3361.14 | 99.32433 | 296 | `main/melee/lb/lbmemory` | `lbMemory_80014FC8` | `src/melee/lb/lbmemory.c` | `stalled:1` |
| 3212.95 | 98.95475 | 884 | `main/melee/it/items/itarwinglaser` | `it_802E7654` | `src/melee/it/items/itarwinglaser.c` | `queued:1` |
| 2948.35 | 98.84444 | 900 | `main/melee/mn/mndiagram` | `mnDiagram_802427B4` | `src/melee/mn/mndiagram.c` | `queued:2` |
| 2614.81 | 98.68122 | 916 | `main/melee/ft/chara/ftYoshi/ftYs_SpecialS` | `ftYs_SpecialAirSLanding_Anim` | `src/melee/ft/chara/ftYoshi/ftYs_SpecialS.c` | `no_db_target` |
| 2004.22 | 99.31111 | 180 | `main/melee/gr/grinishie1` | `fn_801FBEB8` | `src/melee/gr/grinishie1.c` | `no_db_target` |
| 1933.02 | 97.68831 | 2464 | `main/melee/ty/toy` | `un_80310B48` | `src/melee/ty/toy.c` | `no_db_target` |
| 1912.58 | 98.03921 | 1020 | `main/melee/mn/mnitemsw` | `fn_80234C24` | `src/melee/mn/mnitemsw.c` | `no_db_target` |
| 1800.81 | 98.30097 | 824 | `main/sysdolphin/baselib/hsd_3B34` | `hsd_803B4A2C` | `src/sysdolphin/baselib/hsd_3B34.c` | `no_db_target` |
| 1556.35 | 98.80488 | 492 | `main/melee/gr/grpstadium` | `grStadium_801D435C` | `src/melee/gr/grpstadium.c` | `queued:1` |
| 1418.57 | 97.29609 | 2148 | `main/melee/ft/chara/ftCommon/ftCo_09F7` | `ftCo_8009F834` | `src/melee/ft/chara/ftCommon/ftCo_09F7.c` | `no_db_target` |
| 1408.78 | 98.47222 | 576 | `main/melee/ty/toy` | `un_803075E8` | `src/melee/ty/toy.c` | `no_db_target` |
| 1308.75 | 98.64407 | 472 | `main/melee/ty/toy` | `un_80307F64` | `src/melee/ty/toy.c` | `no_db_target` |
| 1241.58 | 98.35767 | 548 | `main/melee/gr/grcorneria` | `grCorneria_801DDAC4` | `src/melee/gr/grcorneria.c` | `queued:1` |
| 1205.89 | 98.38168 | 524 | `main/melee/gm/gm_19EF` | `fn_8019EFC4` | `src/melee/gm/gm_19EF.c` | `no_db_target` |
| 1099.42 | 96.99573 | 1872 | `main/melee/mn/mnsound` | `mnSound_802492CC` | `src/melee/mn/mnsound.c` | `no_db_target` |
| 1055.75 | 97.13615 | 1704 | `main/melee/gm/gmtou` | `gm_8019DF8C_OnFrame` | `src/melee/gm/gmtou.c` | `no_db_target` |
| 892.75 | 97.55115 | 1212 | `main/melee/ty/tyfigupon` | `un_80316420` | `src/melee/ty/tyfigupon.c` | `no_db_target` |
| 872.12 | 95.55842 | 2328 | `main/melee/ty/tyfigupon` | `fn_80316C24` | `src/melee/ty/tyfigupon.c` | `no_db_target` |
| 827.38 | 97.72587 | 1036 | `main/sysdolphin/baselib/texpdag` | `SimplifySrc` | `src/sysdolphin/baselib/texpdag.c` | `no_db_target` |
| 781.73 | 97.05846 | 1300 | `main/melee/gr/grshrineroute` | `grShrineRoute_80209BEC` | `src/melee/gr/grshrineroute.c` | `queued:1` |
| 764.07 | 98.77419 | 248 | `main/melee/gr/grcorneria` | `grCorneria_801E1878` | `src/melee/gr/grcorneria.c` | `no_db_target` |
| 762.52 | 97.25938 | 1172 | `main/melee/mn/mnsound` | `mnSound_80249C08` | `src/melee/mn/mnsound.c` | `no_db_target` |
| 762.04 | 92.01978 | 8492 | `main/melee/ty/toy` | `fn_80309404` | `src/melee/ty/toy.c` | `no_db_target` |
| 671.81 | 98.50746 | 268 | `main/melee/mn/mndatadel` | `fn_8024FD40` | `src/melee/mn/mndatadel.c` | `queued:1` |
| 626.59 | 96.72449 | 1176 | `main/melee/gr/grcorneria` | `grCorneria_801DE024` | `src/melee/gr/grcorneria.c` | `no_db_target` |
| 623.62 | 97.97675 | 688 | `main/melee/gr/grcorneria` | `grCorneria_801E03C8` | `src/melee/gr/grcorneria.c` | `no_db_target` |
| 618.70 | 97.84153 | 732 | `main/melee/gr/grshrineroute` | `fn_80208A38` | `src/melee/gr/grshrineroute.c` | `no_db_target` |
| 614.88 | 97.72021 | 772 | `main/melee/gr/granime` | `grAnime_801C7228` | `src/melee/gr/granime.c` | `queued:1` |
| 614.68 | 96.73868 | 1148 | `main/melee/ty/toy` | `un_8030FE48` | `src/melee/ty/toy.c` | `no_db_target` |
| 580.42 | 97.35981 | 856 | `main/sysdolphin/baselib/hsd_3B34` | `hsd_803B46D4` | `src/sysdolphin/baselib/hsd_3B34.c` | `no_db_target` |
| 575.14 | 97.30415 | 868 | `main/sysdolphin/baselib/leak` | `HSD_Leak_80387DF8` | `src/sysdolphin/baselib/leak.c` | `no_db_target` |
| 558.59 | 93.39983 | 4852 | `main/sysdolphin/baselib/hsd_3A94` | `hsd_803A949C` | `src/sysdolphin/baselib/hsd_3A94.c` | `no_db_target` |
| 555.96 | 97.71429 | 700 | `main/melee/ty/toy` | `un_803078E4` | `src/melee/ty/toy.c` | `no_db_target` |
| 541.10 | 95.86446 | 1328 | `main/melee/ft/chara/ftYoshi/ftYs_SpecialS` | `ftYs_SpecialAirSLoop_1_Anim` | `src/melee/ft/chara/ftYoshi/ftYs_SpecialS.c` | `no_db_target` |
| 524.77 | 97.85714 | 616 | `main/melee/gm/gm_1A3F` | `gm_801A4014` | `src/melee/gm/gm_1A3F.c` | `no_db_target` |
| 497.14 | 87.04166 | 11232 | `main/melee/ty/toy` | `fn_8030B530` | `src/melee/ty/toy.c` | `no_db_target` |
| 488.85 | 97.19171 | 772 | `main/melee/gm/gm_16AE` | `fn_8016E2BC` | `src/melee/gm/gm_16AE.c` | `queued:1` |
| 487.19 | 95.30836 | 1388 | `main/sysdolphin/baselib/hsd_3B34` | `fn_803B376C` | `src/sysdolphin/baselib/hsd_3B34.c` | `no_db_target` |
| 486.32 | 96.95715 | 840 | `main/melee/it/items/itlinkhookshot` | `it_802A5AE0` | `src/melee/it/items/itlinkhookshot.c` | `queued:1` |
| 433.13 | 96.75622 | 804 | `main/melee/mn/mndatadel` | `mnDataDel_8024FE4C` | `src/melee/mn/mndatadel.c` | `no_db_target` |
| 418.14 | 96.39269 | 876 | `main/melee/cm/camera` | `Camera_8002B694` | `src/melee/cm/camera.c` | `no_db_target` |
| 405.92 | 97.43449 | 580 | `main/melee/ft/chara/ftCommon/ftCo_DamageIce` | `ftCo_DamageIce_HitWhileFrozen` | `src/melee/ft/chara/ftCommon/ftCo_DamageIce.c` | `no_db_target` |
| 395.47 | 94.83861 | 2528 | `main/melee/mn/mncharsel` | `fn_8025F0E0` | `src/melee/mn/mncharsel.c` | `queued:1` |
| 395.18 | 97.70400 | 500 | `main/melee/mn/mndatadel` | `fn_8024ECCC` | `src/melee/mn/mndatadel.c` | `no_db_target` |
| 393.56 | 98.55263 | 152 | `main/dolphin/thp/THPDec` | `THPDec_803313D0` | `extern/dolphin/src/dolphin/thp/THPDec.c` | `queued:1` |
| 385.86 | 97.70492 | 488 | `main/melee/cm/camera` | `Camera_800313E0` | `src/melee/cm/camera.c` | `no_db_target` |
| 382.52 | 98.03921 | 204 | `main/melee/gr/gronett` | `grOnett_801E40E4` | `src/melee/gr/gronett.c` | `queued:1` |
| 380.44 | 96.55556 | 756 | `main/melee/lb/lbaudio_ax` | `fn_80025FAC` | `src/melee/lb/lbaudio_ax.c` | `queued:1` |
| 368.36 | 96.35897 | 780 | `main/melee/if/ifstatus` | `ifStatus_802F61FC` | `src/melee/if/ifstatus.c` | `queued:2` |
| 367.95 | 95.08664 | 1108 | `main/melee/ty/tydisplay` | `un_80319540` | `src/melee/ty/tydisplay.c` | `stalled:1` |
| 357.09 | 97.61017 | 472 | `main/melee/ft/chara/ftYoshi/ftYs_SpecialS` | `fn_8012EDE8` | `src/melee/ft/chara/ftYoshi/ftYs_SpecialS.c` | `no_db_target` |
| 349.31 | 95.91943 | 844 | `main/melee/gm/gm_16AE` | `fn_8016CFE0` | `src/melee/gm/gm_16AE.c` | `no_db_target` |
| 347.95 | 95.80645 | 868 | `main/melee/lb/lbshadow` | `lbShadow_8000E9F0` | `src/melee/lb/lbshadow.c` | `no_db_target` |

## Lease/Event But No Worker Session

These are included in the main never-session count but excluded from the alternate never-lease/event count.

| Fuzzy | Size | Unit | Symbol | Source | Status bucket | Lease count |
| ---: | ---: | --- | --- | --- | --- | ---: |
| 99.95420 | 524 | `main/melee/it/items/itlinkhookshot` | `it_802A7B34` | `src/melee/it/items/itlinkhookshot.c` | `stalled:1` | 1 |
| 99.87878 | 132 | `main/melee/gm/gm_16F1` | `gm_80173754` | `src/melee/gm/gm_16F1.c` | `stalled:1` | 1 |
| 99.71292 | 836 | `main/melee/gr/grkongo` | `grKongo_801D6668` | `src/melee/gr/grkongo.c` | `stalled:1` | 1 |
| 99.62060 | 1708 | `main/melee/vi/vi1201v2` | `un_80320A40_OnEnter` | `src/melee/vi/vi1201v2.c` | `stalled:1` | 1 |
| 99.32433 | 296 | `main/melee/lb/lbmemory` | `lbMemory_80014FC8` | `src/melee/lb/lbmemory.c` | `stalled:1` | 1 |
| 99.30000 | 600 | `main/sysdolphin/baselib/particle` | `hsd_80396A20` | `src/sysdolphin/baselib/particle.c` | `stalled:1` | 1 |
| 95.08664 | 1108 | `main/melee/ty/tydisplay` | `un_80319540` | `src/melee/ty/tydisplay.c` | `stalled:1` | 1 |
| 95.08000 | 500 | `main/melee/gm/gmregclear` | `gm_8017DB88` | `src/melee/gm/gmregclear.c` | `stalled:1` | 1 |
| 91.27879 | 660 | `main/melee/gr/ground` | `Ground_801C20E0` | `src/melee/gr/ground.c` | `stalled:1` | 1 |

## Full Never-Session List

| # | Priority | Fuzzy | Size | Unit | Symbol | Source | Status bucket |
| ---: | ---: | ---: | ---: | --- | --- | --- | --- |
| 1 | 370677.54 | 99.98171 | 1312 | `main/melee/gr/grcorneria` | `grCorneria_801E1BF0` | `src/melee/gr/grcorneria.c` | `queued:2` |
| 2 | 159808.09 | 99.97000 | 800 | `main/melee/ty/tyfigupon` | `un_80317A60` | `src/melee/ty/tyfigupon.c` | `no_db_target` |
| 3 | 122911.44 | 99.92926 | 1244 | `main/melee/ft/chara/ftYoshi/ftYs_SpecialS` | `ftYs_SpecialAirSLoop_2_Coll` | `src/melee/ft/chara/ftYoshi/ftYs_SpecialS.c` | `no_db_target` |
| 4 | 91103.48 | 99.95180 | 664 | `main/melee/lb/lb_00F9` | `fn_80013614` | `src/melee/lb/lb_00F9.c` | `queued:1` |
| 5 | 82416.71 | 99.86595 | 1492 | `main/melee/ty/toy` | `un_803087F4` | `src/melee/ty/toy.c` | `queued:1` |
| 6 | 74987.91 | 99.95420 | 524 | `main/melee/it/items/itlinkhookshot` | `it_802A7B34` | `src/melee/it/items/itlinkhookshot.c` | `stalled:1` |
| 7 | 63223.06 | 99.86301 | 1168 | `main/melee/ft/ftmaterial` | `ftMaterial_800BF6BC` | `src/melee/ft/ftmaterial.c` | `no_db_target` |
| 8 | 34560.83 | 99.62060 | 1708 | `main/melee/vi/vi1201v2` | `un_80320A40_OnEnter` | `src/melee/vi/vi1201v2.c` | `stalled:1` |
| 9 | 25662.91 | 99.82550 | 596 | `main/melee/mn/mndiagram` | `mnDiagram_802437E8` | `src/melee/mn/mndiagram.c` | `queued:2` |
| 10 | 25553.92 | 98.80405 | 8084 | `main/melee/ef/efsync` | `efSync_Spawn` | `src/melee/ef/efsync.c` | `no_db_target` |
| 11 | 22255.05 | 99.71292 | 836 | `main/melee/gr/grkongo` | `grKongo_801D6668` | `src/melee/gr/grkongo.c` | `stalled:1` |
| 12 | 21983.42 | 99.38236 | 1768 | `main/melee/mn/mnitemsw` | `mnItemSw_8023453C` | `src/melee/mn/mnitemsw.c` | `no_db_target` |
| 13 | 17525.02 | 99.87013 | 308 | `main/melee/ft/chara/ftCommon/ftCo_WarpStar` | `ftCo_800C4724` | `src/melee/ft/chara/ftCommon/ftCo_WarpStar.c` | `no_db_target` |
| 14 | 8758.13 | 99.27536 | 828 | `main/melee/ty/toy` | `un_80310324` | `src/melee/ty/toy.c` | `queued:1` |
| 15 | 8734.14 | 98.71410 | 2980 | `main/melee/gm/gmtou` | `fn_8019D1BC` | `src/melee/gm/gmtou.c` | `queued:1` |
| 16 | 8008.85 | 99.87878 | 132 | `main/melee/gm/gm_16F1` | `gm_80173754` | `src/melee/gm/gm_16F1.c` | `stalled:1` |
| 17 | 6573.25 | 99.30000 | 600 | `main/sysdolphin/baselib/particle` | `hsd_80396A20` | `src/sysdolphin/baselib/particle.c` | `stalled:1` |
| 18 | 6508.05 | 99.36296 | 540 | `main/melee/ty/tyfigupon` | `fn_80316170` | `src/melee/ty/tyfigupon.c` | `queued:1` |
| 19 | 5480.48 | 99.40566 | 424 | `main/melee/gm/gmtou` | `gm_8019ECAC_OnEnter` | `src/melee/gm/gmtou.c` | `no_db_target` |
| 20 | 4101.99 | 98.49395 | 1652 | `main/melee/mp/mpcoll` | `mpColl_80046904` | `src/melee/mp/mpcoll.c` | `no_db_target` |
| 21 | 3747.60 | 97.95973 | 4172 | `main/melee/gm/gm_19EF` | `fn_8019F9C4` | `src/melee/gm/gm_19EF.c` | `no_db_target` |
| 22 | 3704.09 | 98.17982 | 1824 | `main/melee/mn/mnitemsw` | `mnItemSw_802351A0` | `src/melee/mn/mnitemsw.c` | `no_db_target` |
| 23 | 3361.14 | 99.32433 | 296 | `main/melee/lb/lbmemory` | `lbMemory_80014FC8` | `src/melee/lb/lbmemory.c` | `stalled:1` |
| 24 | 3212.95 | 98.95475 | 884 | `main/melee/it/items/itarwinglaser` | `it_802E7654` | `src/melee/it/items/itarwinglaser.c` | `queued:1` |
| 25 | 2948.35 | 98.84444 | 900 | `main/melee/mn/mndiagram` | `mnDiagram_802427B4` | `src/melee/mn/mndiagram.c` | `queued:2` |
| 26 | 2614.81 | 98.68122 | 916 | `main/melee/ft/chara/ftYoshi/ftYs_SpecialS` | `ftYs_SpecialAirSLanding_Anim` | `src/melee/ft/chara/ftYoshi/ftYs_SpecialS.c` | `no_db_target` |
| 27 | 2004.22 | 99.31111 | 180 | `main/melee/gr/grinishie1` | `fn_801FBEB8` | `src/melee/gr/grinishie1.c` | `no_db_target` |
| 28 | 1933.02 | 97.68831 | 2464 | `main/melee/ty/toy` | `un_80310B48` | `src/melee/ty/toy.c` | `no_db_target` |
| 29 | 1912.58 | 98.03921 | 1020 | `main/melee/mn/mnitemsw` | `fn_80234C24` | `src/melee/mn/mnitemsw.c` | `no_db_target` |
| 30 | 1800.81 | 98.30097 | 824 | `main/sysdolphin/baselib/hsd_3B34` | `hsd_803B4A2C` | `src/sysdolphin/baselib/hsd_3B34.c` | `no_db_target` |
| 31 | 1556.35 | 98.80488 | 492 | `main/melee/gr/grpstadium` | `grStadium_801D435C` | `src/melee/gr/grpstadium.c` | `queued:1` |
| 32 | 1418.57 | 97.29609 | 2148 | `main/melee/ft/chara/ftCommon/ftCo_09F7` | `ftCo_8009F834` | `src/melee/ft/chara/ftCommon/ftCo_09F7.c` | `no_db_target` |
| 33 | 1408.78 | 98.47222 | 576 | `main/melee/ty/toy` | `un_803075E8` | `src/melee/ty/toy.c` | `no_db_target` |
| 34 | 1308.75 | 98.64407 | 472 | `main/melee/ty/toy` | `un_80307F64` | `src/melee/ty/toy.c` | `no_db_target` |
| 35 | 1241.58 | 98.35767 | 548 | `main/melee/gr/grcorneria` | `grCorneria_801DDAC4` | `src/melee/gr/grcorneria.c` | `queued:1` |
| 36 | 1205.89 | 98.38168 | 524 | `main/melee/gm/gm_19EF` | `fn_8019EFC4` | `src/melee/gm/gm_19EF.c` | `no_db_target` |
| 37 | 1099.42 | 96.99573 | 1872 | `main/melee/mn/mnsound` | `mnSound_802492CC` | `src/melee/mn/mnsound.c` | `no_db_target` |
| 38 | 1055.75 | 97.13615 | 1704 | `main/melee/gm/gmtou` | `gm_8019DF8C_OnFrame` | `src/melee/gm/gmtou.c` | `no_db_target` |
| 39 | 892.75 | 97.55115 | 1212 | `main/melee/ty/tyfigupon` | `un_80316420` | `src/melee/ty/tyfigupon.c` | `no_db_target` |
| 40 | 872.12 | 95.55842 | 2328 | `main/melee/ty/tyfigupon` | `fn_80316C24` | `src/melee/ty/tyfigupon.c` | `no_db_target` |
| 41 | 827.38 | 97.72587 | 1036 | `main/sysdolphin/baselib/texpdag` | `SimplifySrc` | `src/sysdolphin/baselib/texpdag.c` | `no_db_target` |
| 42 | 781.73 | 97.05846 | 1300 | `main/melee/gr/grshrineroute` | `grShrineRoute_80209BEC` | `src/melee/gr/grshrineroute.c` | `queued:1` |
| 43 | 764.07 | 98.77419 | 248 | `main/melee/gr/grcorneria` | `grCorneria_801E1878` | `src/melee/gr/grcorneria.c` | `no_db_target` |
| 44 | 762.52 | 97.25938 | 1172 | `main/melee/mn/mnsound` | `mnSound_80249C08` | `src/melee/mn/mnsound.c` | `no_db_target` |
| 45 | 762.04 | 92.01978 | 8492 | `main/melee/ty/toy` | `fn_80309404` | `src/melee/ty/toy.c` | `no_db_target` |
| 46 | 671.81 | 98.50746 | 268 | `main/melee/mn/mndatadel` | `fn_8024FD40` | `src/melee/mn/mndatadel.c` | `queued:1` |
| 47 | 626.59 | 96.72449 | 1176 | `main/melee/gr/grcorneria` | `grCorneria_801DE024` | `src/melee/gr/grcorneria.c` | `no_db_target` |
| 48 | 623.62 | 97.97675 | 688 | `main/melee/gr/grcorneria` | `grCorneria_801E03C8` | `src/melee/gr/grcorneria.c` | `no_db_target` |
| 49 | 618.70 | 97.84153 | 732 | `main/melee/gr/grshrineroute` | `fn_80208A38` | `src/melee/gr/grshrineroute.c` | `no_db_target` |
| 50 | 614.88 | 97.72021 | 772 | `main/melee/gr/granime` | `grAnime_801C7228` | `src/melee/gr/granime.c` | `queued:1` |
| 51 | 614.68 | 96.73868 | 1148 | `main/melee/ty/toy` | `un_8030FE48` | `src/melee/ty/toy.c` | `no_db_target` |
| 52 | 580.42 | 97.35981 | 856 | `main/sysdolphin/baselib/hsd_3B34` | `hsd_803B46D4` | `src/sysdolphin/baselib/hsd_3B34.c` | `no_db_target` |
| 53 | 575.14 | 97.30415 | 868 | `main/sysdolphin/baselib/leak` | `HSD_Leak_80387DF8` | `src/sysdolphin/baselib/leak.c` | `no_db_target` |
| 54 | 558.59 | 93.39983 | 4852 | `main/sysdolphin/baselib/hsd_3A94` | `hsd_803A949C` | `src/sysdolphin/baselib/hsd_3A94.c` | `no_db_target` |
| 55 | 555.96 | 97.71429 | 700 | `main/melee/ty/toy` | `un_803078E4` | `src/melee/ty/toy.c` | `no_db_target` |
| 56 | 541.10 | 95.86446 | 1328 | `main/melee/ft/chara/ftYoshi/ftYs_SpecialS` | `ftYs_SpecialAirSLoop_1_Anim` | `src/melee/ft/chara/ftYoshi/ftYs_SpecialS.c` | `no_db_target` |
| 57 | 524.77 | 97.85714 | 616 | `main/melee/gm/gm_1A3F` | `gm_801A4014` | `src/melee/gm/gm_1A3F.c` | `no_db_target` |
| 58 | 497.14 | 87.04166 | 11232 | `main/melee/ty/toy` | `fn_8030B530` | `src/melee/ty/toy.c` | `no_db_target` |
| 59 | 488.85 | 97.19171 | 772 | `main/melee/gm/gm_16AE` | `fn_8016E2BC` | `src/melee/gm/gm_16AE.c` | `queued:1` |
| 60 | 487.19 | 95.30836 | 1388 | `main/sysdolphin/baselib/hsd_3B34` | `fn_803B376C` | `src/sysdolphin/baselib/hsd_3B34.c` | `no_db_target` |
| 61 | 486.32 | 96.95715 | 840 | `main/melee/it/items/itlinkhookshot` | `it_802A5AE0` | `src/melee/it/items/itlinkhookshot.c` | `queued:1` |
| 62 | 433.13 | 96.75622 | 804 | `main/melee/mn/mndatadel` | `mnDataDel_8024FE4C` | `src/melee/mn/mndatadel.c` | `no_db_target` |
| 63 | 418.14 | 96.39269 | 876 | `main/melee/cm/camera` | `Camera_8002B694` | `src/melee/cm/camera.c` | `no_db_target` |
| 64 | 405.92 | 97.43449 | 580 | `main/melee/ft/chara/ftCommon/ftCo_DamageIce` | `ftCo_DamageIce_HitWhileFrozen` | `src/melee/ft/chara/ftCommon/ftCo_DamageIce.c` | `no_db_target` |
| 65 | 395.47 | 94.83861 | 2528 | `main/melee/mn/mncharsel` | `fn_8025F0E0` | `src/melee/mn/mncharsel.c` | `queued:1` |
| 66 | 395.18 | 97.70400 | 500 | `main/melee/mn/mndatadel` | `fn_8024ECCC` | `src/melee/mn/mndatadel.c` | `no_db_target` |
| 67 | 393.56 | 98.55263 | 152 | `main/dolphin/thp/THPDec` | `THPDec_803313D0` | `extern/dolphin/src/dolphin/thp/THPDec.c` | `queued:1` |
| 68 | 385.86 | 97.70492 | 488 | `main/melee/cm/camera` | `Camera_800313E0` | `src/melee/cm/camera.c` | `no_db_target` |
| 69 | 382.52 | 98.03921 | 204 | `main/melee/gr/gronett` | `grOnett_801E40E4` | `src/melee/gr/gronett.c` | `queued:1` |
| 70 | 380.44 | 96.55556 | 756 | `main/melee/lb/lbaudio_ax` | `fn_80025FAC` | `src/melee/lb/lbaudio_ax.c` | `queued:1` |
| 71 | 368.36 | 96.35897 | 780 | `main/melee/if/ifstatus` | `ifStatus_802F61FC` | `src/melee/if/ifstatus.c` | `queued:2` |
| 72 | 367.95 | 95.08664 | 1108 | `main/melee/ty/tydisplay` | `un_80319540` | `src/melee/ty/tydisplay.c` | `stalled:1` |
| 73 | 357.09 | 97.61017 | 472 | `main/melee/ft/chara/ftYoshi/ftYs_SpecialS` | `fn_8012EDE8` | `src/melee/ft/chara/ftYoshi/ftYs_SpecialS.c` | `no_db_target` |
| 74 | 349.31 | 95.91943 | 844 | `main/melee/gm/gm_16AE` | `fn_8016CFE0` | `src/melee/gm/gm_16AE.c` | `no_db_target` |
| 75 | 347.95 | 95.80645 | 868 | `main/melee/lb/lbshadow` | `lbShadow_8000E9F0` | `src/melee/lb/lbshadow.c` | `no_db_target` |
| 76 | 345.32 | 92.64542 | 3452 | `main/melee/gr/grbigblueroute` | `grBigBlueRoute_8020CD20` | `src/melee/gr/grbigblueroute.c` | `queued:1` |
| 77 | 345.19 | 95.41841 | 956 | `main/sysdolphin/baselib/synth` | `HSD_Synth_80389334` | `src/sysdolphin/baselib/synth.c` | `queued:1` |
| 78 | 340.25 | 97.73585 | 424 | `main/melee/cm/camera` | `Camera_800304E0` | `src/melee/cm/camera.c` | `no_db_target` |
| 79 | 339.16 | 96.81818 | 616 | `main/melee/cm/camera` | `Camera_8002F4D4` | `src/melee/cm/camera.c` | `no_db_target` |
| 80 | 337.25 | 97.91666 | 384 | `main/melee/gr/grbigblue` | `grBigBlue_801E8B84` | `src/melee/gr/grbigblue.c` | `queued:1` |
| 81 | 315.68 | 97.84946 | 372 | `main/melee/lb/lbaudio_ax` | `fn_80025E38` | `src/melee/lb/lbaudio_ax.c` | `no_db_target` |
| 82 | 309.96 | 92.35049 | 3264 | `main/melee/mn/mncharsel` | `fn_802633B0` | `src/melee/mn/mncharsel.c` | `queued:1` |
| 83 | 282.59 | 96.09876 | 648 | `main/melee/cm/camera` | `Camera_8002BD88` | `src/melee/cm/camera.c` | `no_db_target` |
| 84 | 279.17 | 92.36562 | 2932 | `main/melee/mn/mnvibration` | `fn_80247510` | `src/melee/mn/mnvibration.c` | `no_db_target` |
| 85 | 273.04 | 88.75525 | 4952 | `main/melee/mn/mncharsel` | `mnCharSel_8025DB34` | `src/melee/mn/mncharsel.c` | `queued:1` |
| 86 | 271.06 | 92.23489 | 2912 | `main/melee/gr/grbigblue` | `grBigBlue_801E93D8` | `src/melee/gr/grbigblue.c` | `queued:1` |
| 87 | 270.43 | 96.34028 | 576 | `main/melee/it/itspawn` | `it_8026D018` | `src/melee/it/itspawn.c` | `no_db_target` |
| 88 | 265.92 | 86.43935 | 6464 | `main/melee/ty/toy` | `fn_8030E110` | `src/melee/ty/toy.c` | `no_db_target` |
| 89 | 256.62 | 97.07547 | 424 | `main/melee/ty/toy` | `un_803109A0` | `src/melee/ty/toy.c` | `no_db_target` |
| 90 | 247.54 | 95.20442 | 724 | `main/melee/if/ifstatus` | `ifStatus_802F5EC0` | `src/melee/if/ifstatus.c` | `no_db_target` |
| 91 | 247.16 | 97.41573 | 356 | `main/sysdolphin/baselib/synth` | `dropcallback` | `src/sysdolphin/baselib/synth.c` | `no_db_target` |
| 92 | 245.48 | 96.88074 | 436 | `main/melee/it/itspawn` | `it_8026CB9C` | `src/melee/it/itspawn.c` | `no_db_target` |
| 93 | 242.74 | 97.80822 | 292 | `main/sysdolphin/baselib/hsd_3B5C` | `hsd_803B5C4C` | `src/sysdolphin/baselib/hsd_3B5C.c` | `no_db_target` |
| 94 | 239.51 | 97.69737 | 304 | `main/sysdolphin/baselib/hsd_3B5C` | `hsd_803B5D70` | `src/sysdolphin/baselib/hsd_3B5C.c` | `no_db_target` |
| 95 | 235.88 | 91.45631 | 2884 | `main/melee/gr/grbigblue` | `grBigBlue_801ECB50` | `src/melee/gr/grbigblue.c` | `queued:1` |
| 96 | 234.05 | 94.42579 | 1644 | `main/sysdolphin/baselib/hsd_3B5C` | `fn_803B61B4` | `src/sysdolphin/baselib/hsd_3B5C.c` | `no_db_target` |
| 97 | 230.67 | 95.75343 | 584 | `main/melee/lb/lb_00F9` | `lb_8000FA94` | `src/melee/lb/lb_00F9.c` | `no_db_target` |
| 98 | 225.30 | 93.60426 | 1880 | `main/melee/ft/ftcpuattack` | `ftCo_800B5AB0` | `src/melee/ft/ftcpuattack.c` | `queued:1` |
| 99 | 224.57 | 91.06712 | 2920 | `main/melee/gr/grbigblue` | `grBigBlue_801EE398` | `src/melee/gr/grbigblue.c` | `queued:1` |
| 100 | 220.64 | 93.24089 | 1976 | `main/melee/ft/chara/ftCommon/ftCo_Damage` | `ftCo_8008DCE0` | `src/melee/ft/chara/ftCommon/ftCo_Damage.c` | `queued:1` |
| 101 | 216.58 | 91.31610 | 2708 | `main/melee/gr/grbigblue` | `grBigBlue_801EBAF8` | `src/melee/gr/grbigblue.c` | `queued:1` |
| 102 | 214.49 | 94.61496 | 1444 | `main/sysdolphin/baselib/synth` | `HSD_Synth_8038A000` | `src/sysdolphin/baselib/synth.c` | `no_db_target` |
| 103 | 200.55 | 86.32201 | 4944 | `main/sysdolphin/baselib/particle` | `hsd_8039DAD4` | `src/sysdolphin/baselib/particle.c` | `queued:1` |
| 104 | 198.08 | 96.11504 | 452 | `main/melee/gr/gronett` | `grOnett_801E5538` | `src/melee/gr/gronett.c` | `no_db_target` |
| 105 | 194.36 | 97.96296 | 216 | `main/melee/gm/gmcamera` | `gmCamera_801A26C0` | `src/melee/gm/gmcamera.c` | `queued:1` |
| 106 | 193.82 | 94.57751 | 1316 | `main/melee/ty/tyfigupon` | `un_8031753C` | `src/melee/ty/tyfigupon.c` | `no_db_target` |
| 107 | 192.42 | 95.95652 | 460 | `main/melee/mp/mplib` | `mpLineNextNonLeftWall` | `src/melee/mp/mplib.c` | `queued:2` |
| 108 | 192.42 | 95.95652 | 460 | `main/melee/mp/mplib` | `mpLineNextNonRightWall` | `src/melee/mp/mplib.c` | `queued:2` |
| 109 | 192.42 | 95.95652 | 460 | `main/melee/mp/mplib` | `mpLinePrevNonLeftWall` | `src/melee/mp/mplib.c` | `queued:2` |
| 110 | 192.42 | 95.95652 | 460 | `main/melee/mp/mplib` | `mpLinePrevNonRightWall` | `src/melee/mp/mplib.c` | `queued:2` |
| 111 | 188.55 | 94.23768 | 1380 | `main/melee/lb/lbaudio_ax` | `lbAudioAx_80027DF8` | `src/melee/lb/lbaudio_ax.c` | `no_db_target` |
| 112 | 180.10 | 96.10680 | 412 | `main/melee/lb/lbmemory` | `lbMemory_80015320` | `src/melee/lb/lbmemory.c` | `no_db_target` |
| 113 | 174.90 | 96.55173 | 348 | `main/melee/lb/lbarq` | `lbArq_80014BD0` | `src/melee/lb/lbarq.c` | `no_db_target` |
| 114 | 174.67 | 91.72603 | 2044 | `main/melee/ft/ftcpuattack` | `ftCo_800B4AB0` | `src/melee/ft/ftcpuattack.c` | `no_db_target` |
| 115 | 172.01 | 93.89941 | 1352 | `main/melee/ft/ftcpuattack` | `ftCo_800BB220` | `src/melee/ft/ftcpuattack.c` | `no_db_target` |
| 116 | 169.73 | 94.00920 | 1304 | `main/melee/gr/grbigblue` | `grBigBlue_801E6364` | `src/melee/gr/grbigblue.c` | `queued:1` |
| 117 | 165.77 | 95.08000 | 500 | `main/melee/gm/gmregclear` | `gm_8017DB88` | `src/melee/gm/gmregclear.c` | `stalled:1` |
| 118 | 164.11 | 96.80000 | 300 | `main/melee/it/itspawn` | `it_8026C530` | `src/melee/it/itspawn.c` | `no_db_target` |
| 119 | 162.65 | 96.10753 | 372 | `main/melee/gr/grcorneria` | `grCorneria_801E25C4` | `src/melee/gr/grcorneria.c` | `no_db_target` |
| 120 | 162.31 | 90.71454 | 2228 | `main/melee/ft/chara/ftCommon/ftCo_0A01` | `ftCo_800B2AFC` | `src/melee/ft/chara/ftCommon/ftCo_0A01.c` | `queued:1` |
| 121 | 161.88 | 95.28449 | 464 | `main/melee/if/ifstock` | `ifStock_802F9F48` | `src/melee/if/ifstock.c` | `queued:1` |
| 122 | 161.49 | 92.89119 | 1544 | `main/sysdolphin/baselib/particle` | `hsd_80394F48` | `src/sysdolphin/baselib/particle.c` | `queued:1` |
| 123 | 160.33 | 96.73333 | 300 | `main/melee/ty/toy` | `Toy_LoadLObjList` | `src/melee/ty/toy.c` | `no_db_target` |
| 124 | 160.00 | 95.44546 | 440 | `main/sysdolphin/baselib/particle` | `hsd_80393A5C` | `src/sysdolphin/baselib/particle.c` | `queued:1` |
| 125 | 159.14 | 91.12086 | 2052 | `main/melee/ft/ftcpuattack` | `ftCo_800B52AC` | `src/melee/ft/ftcpuattack.c` | `no_db_target` |
| 126 | 156.98 | 94.42029 | 1104 | `main/melee/it/items/itlinkhookshot` | `it_802A5320` | `src/melee/it/items/itlinkhookshot.c` | `no_db_target` |
| 127 | 156.61 | 90.34507 | 2272 | `main/melee/gr/grzebes` | `grZebes_801D881C` | `src/melee/gr/grzebes.c` | `no_db_target` |
| 128 | 154.64 | 95.82291 | 384 | `main/melee/mn/mnsnap` | `mnSnap_80253964` | `src/melee/mn/mnsnap.c` | `queued:1` |
| 129 | 154.20 | 96.94030 | 268 | `main/melee/lb/lbarq` | `lbArq_80014AC4` | `src/melee/lb/lbarq.c` | `no_db_target` |
| 130 | 152.46 | 95.04311 | 464 | `main/melee/mp/mplib` | `mpLib_80053A04_Ceiling` | `src/melee/mp/mplib.c` | `queued:2` |
| 131 | 152.46 | 95.04311 | 464 | `main/melee/mp/mplib` | `mpLib_80053BD4_Ceiling` | `src/melee/mp/mplib.c` | `queued:2` |
| 132 | 151.23 | 93.88590 | 1192 | `main/melee/gr/grbigblue` | `grBigBlue_801EB004` | `src/melee/gr/grbigblue.c` | `queued:1` |
| 133 | 149.20 | 94.66936 | 992 | `main/melee/mn/mnsoundtest` | `fn_8024AED0` | `src/melee/mn/mnsoundtest.c` | `queued:1` |
| 134 | 147.27 | 95.68421 | 380 | `main/melee/ty/toy` | `un_80306D70` | `src/melee/ty/toy.c` | `no_db_target` |
| 135 | 145.35 | 84.30266 | 4520 | `main/melee/lb/lb_00F9` | `lb_8001044C` | `src/melee/lb/lb_00F9.c` | `no_db_target` |
| 136 | 144.14 | 96.96774 | 248 | `main/melee/ft/chara/ftKirby/ftkirbyspecialmars` | `ftKb_MsSpecialAirNEnd_Anim` | `src/melee/ft/chara/ftKirby/ftkirbyspecialmars.c` | `no_db_target` |
| 137 | 143.67 | 95.09259 | 432 | `main/melee/gr/grmaterial` | `grMaterial_801C92C0` | `src/melee/gr/grmaterial.c` | `queued:1` |
| 138 | 143.33 | 88.98572 | 2520 | `main/melee/ft/ftafterimage` | `ftCo_800C2600` | `src/melee/ft/ftafterimage.c` | `no_db_target` |
| 139 | 141.06 | 95.56383 | 376 | `main/melee/ty/toy` | `un_80307470` | `src/melee/ty/toy.c` | `no_db_target` |
| 140 | 138.99 | 95.54839 | 372 | `main/sysdolphin/baselib/particle` | `hsd_80393EF4` | `src/sysdolphin/baselib/particle.c` | `queued:1` |
| 141 | 138.86 | 95.70786 | 356 | `main/melee/mp/mplib` | `mpCeilingGetLeft` | `src/melee/mp/mplib.c` | `queued:2` |
| 142 | 138.86 | 95.70786 | 356 | `main/melee/mp/mplib` | `mpCeilingGetRight` | `src/melee/mp/mplib.c` | `queued:2` |
| 143 | 138.86 | 95.70786 | 356 | `main/melee/mp/mplib` | `mpFloorGetLeft` | `src/melee/mp/mplib.c` | `queued:2` |
| 144 | 138.86 | 95.70786 | 356 | `main/melee/mp/mplib` | `mpFloorGetRight` | `src/melee/mp/mplib.c` | `queued:2` |
| 145 | 138.86 | 95.70786 | 356 | `main/melee/mp/mplib` | `mpLeftWallGetBottom` | `src/melee/mp/mplib.c` | `queued:2` |
| 146 | 138.86 | 95.70786 | 356 | `main/melee/mp/mplib` | `mpLeftWallGetTop` | `src/melee/mp/mplib.c` | `queued:2` |
| 147 | 138.86 | 95.70786 | 356 | `main/melee/mp/mplib` | `mpRightWallGetBottom` | `src/melee/mp/mplib.c` | `queued:2` |
| 148 | 138.86 | 95.70786 | 356 | `main/melee/mp/mplib` | `mpRightWallGetTop` | `src/melee/mp/mplib.c` | `queued:2` |
| 149 | 138.85 | 95.66666 | 360 | `main/melee/lb/lbmthp` | `lbMthp_8001F410` | `src/melee/lb/lbmthp.c` | `no_db_target` |
| 150 | 138.10 | 93.51877 | 1172 | `main/melee/gr/grhomerun` | `grHomeRun_8021E500` | `src/melee/gr/grhomerun.c` | `queued:1` |
| 151 | 137.99 | 90.03053 | 2096 | `main/melee/gr/grhomerun` | `grHomeRun_8021D680` | `src/melee/gr/grhomerun.c` | `no_db_target` |
| 152 | 137.91 | 96.40278 | 288 | `main/sysdolphin/baselib/particle` | `psInitDataBankLoad` | `src/sysdolphin/baselib/particle.c` | `queued:1` |
| 153 | 137.11 | 93.44746 | 1180 | `main/melee/lb/lbaudio_ax` | `lbAudioAx_80028690` | `src/melee/lb/lbaudio_ax.c` | `no_db_target` |
| 154 | 133.52 | 94.05512 | 1016 | `main/sysdolphin/baselib/particle` | `hsd_803962A8` | `src/sysdolphin/baselib/particle.c` | `queued:1` |
| 155 | 132.35 | 93.69742 | 1084 | `main/melee/ty/tyfigupon` | `un_80317D80_OnEnter` | `src/melee/ty/tyfigupon.c` | `no_db_target` |
| 156 | 131.29 | 95.71429 | 336 | `main/melee/mn/mnname` | `CompareNameStrings` | `src/melee/mn/mnname.c` | `queued:1` |
| 157 | 130.23 | 97.86842 | 152 | `main/sysdolphin/baselib/particle` | `fn_80394DF4` | `src/sysdolphin/baselib/particle.c` | `queued:1` |
| 158 | 128.70 | 91.32089 | 1608 | `main/melee/gr/grshrineroute` | `grShrineRoute_8020A21C` | `src/melee/gr/grshrineroute.c` | `no_db_target` |
| 159 | 128.16 | 96.58730 | 252 | `main/sysdolphin/baselib/particle` | `hsd_8039CF4C` | `src/sysdolphin/baselib/particle.c` | `queued:1` |
| 160 | 126.91 | 94.81373 | 816 | `main/melee/mp/mpisland` | `mpIsland_8005B004` | `src/melee/mp/mpisland.c` | `no_db_target` |
| 161 | 124.96 | 90.94444 | 1656 | `main/melee/gm/gmtou` | `gm_8019E634` | `src/melee/gm/gmtou.c` | `no_db_target` |
| 162 | 124.86 | 95.00000 | 384 | `main/melee/gm/gm_1B03` | `gm_801B0474` | `src/melee/gm/gm_1B03.c` | `no_db_target` |
| 163 | 124.75 | 91.29923 | 1564 | `main/melee/gm/gm_18A5` | `fn_8018AA74` | `src/melee/gm/gm_18A5.c` | `queued:2` |
| 164 | 121.64 | 92.01770 | 1356 | `main/melee/gr/grzebes` | `grZebes_801D99E0` | `src/melee/gr/grzebes.c` | `no_db_target` |
| 165 | 121.51 | 91.70028 | 1428 | `main/melee/gm/gm_1832` | `fn_80184AB8` | `src/melee/gm/gm_1832.c` | `queued:2` |
| 166 | 118.82 | 90.79157 | 1612 | `main/melee/gr/grbigblue` | `grBigBlue_801EB4AC` | `src/melee/gr/grbigblue.c` | `queued:1` |
| 167 | 118.15 | 92.95699 | 1116 | `main/melee/gm/gm_18A5` | `fn_8018A514` | `src/melee/gm/gm_18A5.c` | `queued:2` |
| 168 | 117.88 | 94.18807 | 872 | `main/melee/lb/lb_00F9` | `lb_8000FD48` | `src/melee/lb/lb_00F9.c` | `no_db_target` |
| 169 | 117.41 | 95.91549 | 284 | `main/melee/if/if_2F72` | `if_802F7D08` | `src/melee/if/if_2F72.c` | `no_db_target` |
| 170 | 115.79 | 96.32258 | 248 | `main/melee/ft/chara/ftKirby/ftkirbyspecialmars` | `ftKb_MsSpecialNEnd_Anim` | `src/melee/ft/chara/ftKirby/ftkirbyspecialmars.c` | `no_db_target` |
| 171 | 113.77 | 95.11764 | 340 | `main/melee/gm/gmcamera` | `gmCamera_801A2BF0` | `src/melee/gm/gmcamera.c` | `no_db_target` |
| 172 | 112.37 | 95.60811 | 296 | `main/melee/mp/mplib` | `mpLib_80053DA4_Floor` | `src/melee/mp/mplib.c` | `queued:2` |
| 173 | 111.38 | 92.12131 | 1220 | `main/melee/gr/grbigblueroute` | `grBigBlueRoute_8020C85C` | `src/melee/gr/grbigblueroute.c` | `no_db_target` |
| 174 | 111.32 | 91.51632 | 1348 | `main/melee/cm/camera` | `Camera_8002D318` | `src/melee/cm/camera.c` | `no_db_target` |
| 175 | 111.06 | 90.56154 | 1560 | `main/melee/mn/mndiagram3` | `mnDiagram3_80245BA4` | `src/melee/mn/mndiagram3.c` | `no_db_target` |
| 176 | 110.20 | 96.16129 | 248 | `main/sysdolphin/baselib/particle` | `hsd_80394950` | `src/sysdolphin/baselib/particle.c` | `no_db_target` |
| 177 | 107.92 | 95.09876 | 324 | `main/sysdolphin/baselib/particle` | `hsd_8039D0A0` | `src/sysdolphin/baselib/particle.c` | `no_db_target` |
| 178 | 104.64 | 93.98515 | 808 | `main/melee/mn/mnmainrule` | `fn_802309F0` | `src/melee/mn/mnmainrule.c` | `no_db_target` |
| 179 | 104.35 | 90.93931 | 1384 | `main/melee/cm/camera` | `Camera_8002D85C` | `src/melee/cm/camera.c` | `no_db_target` |
| 180 | 104.28 | 94.04020 | 796 | `main/melee/if/ifmagnify` | `ifMagnify_802FB8C0` | `src/melee/if/ifmagnify.c` | `no_db_target` |
| 181 | 104.01 | 90.11795 | 1560 | `main/melee/ft/chara/ftCommon/ftCo_0A01` | `ftCo_800A6FC4` | `src/melee/ft/chara/ftCommon/ftCo_0A01.c` | `queued:1` |
| 182 | 103.94 | 95.41666 | 288 | `main/melee/gr/grmutecity` | `grMuteCity_801F0F4C` | `src/melee/gr/grmutecity.c` | `queued:1` |
| 183 | 103.57 | 86.20866 | 2588 | `main/melee/mn/mnsnap` | `mnSnap_80257F24` | `src/melee/mn/mnsnap.c` | `queued:1` |
| 184 | 103.50 | 91.64169 | 1228 | `main/melee/if/ifstock` | `ifStock_802FAEC4` | `src/melee/if/ifstock.c` | `no_db_target` |
| 185 | 102.73 | 93.92039 | 804 | `main/sysdolphin/baselib/particle` | `hsd_80392E80` | `src/sysdolphin/baselib/particle.c` | `no_db_target` |
| 186 | 102.38 | 96.84782 | 184 | `main/melee/cm/camera` | `Camera_80031328` | `src/melee/cm/camera.c` | `no_db_target` |
| 187 | 101.65 | 93.39366 | 884 | `main/melee/if/ifstock` | `fn_802FA8C0` | `src/melee/if/ifstock.c` | `no_db_target` |
| 188 | 101.65 | 96.88889 | 180 | `main/sysdolphin/baselib/particle` | `hsd_80397520` | `src/sysdolphin/baselib/particle.c` | `no_db_target` |
| 189 | 101.60 | 95.27397 | 292 | `main/melee/ty/toy` | `un_803067BC` | `src/melee/ty/toy.c` | `no_db_target` |
| 190 | 96.32 | 92.22780 | 1036 | `main/melee/cm/camera` | `Camera_8002C1A8` | `src/melee/cm/camera.c` | `no_db_target` |
| 191 | 94.86 | 92.93333 | 900 | `main/melee/mp/mplib` | `mpLib_800581DC` | `src/melee/mp/mplib.c` | `queued:2` |
| 192 | 94.12 | 91.68953 | 1108 | `main/melee/gr/grbigblue` | `grBigBlue_801EDF44` | `src/melee/gr/grbigblue.c` | `no_db_target` |
| 193 | 92.94 | 88.99509 | 1632 | `main/melee/if/ifstock` | `ifStock_802F98E8` | `src/melee/if/ifstock.c` | `no_db_target` |
| 194 | 91.22 | 91.72285 | 1068 | `main/melee/lb/lb_00F9` | `lb_800122F0` | `src/melee/lb/lb_00F9.c` | `no_db_target` |
| 195 | 90.83 | 94.46835 | 632 | `main/melee/gm/gm_18A5` | `fn_80192938` | `src/melee/gm/gm_18A5.c` | `queued:2` |
| 196 | 88.85 | 91.35507 | 1104 | `main/melee/mn/mnstagesw` | `mnStageSw_80236548` | `src/melee/mn/mnstagesw.c` | `no_db_target` |
| 197 | 88.66 | 95.44262 | 244 | `main/melee/gm/gm_1832` | `fn_80188550` | `src/melee/gm/gm_1832.c` | `queued:2` |
| 198 | 88.34 | 86.14568 | 2224 | `main/melee/gr/grbigblue` | `grBigBlue_801ED694` | `src/melee/gr/grbigblue.c` | `no_db_target` |
| 199 | 88.10 | 82.93459 | 3180 | `main/melee/if/ifstatus` | `ifStatus_802F4EDC` | `src/melee/if/ifstatus.c` | `no_db_target` |
| 200 | 86.51 | 94.18750 | 640 | `main/melee/gm/gm_1BFA` | `gm_801BFCFC` | `src/melee/gm/gm_1BFA.c` | `no_db_target` |
| 201 | 85.82 | 87.49782 | 1832 | `main/melee/gm/gm_18A5` | `fn_801953C8` | `src/melee/gm/gm_18A5.c` | `queued:2` |
| 202 | 85.63 | 87.79773 | 1760 | `main/melee/gr/grkinokoroute` | `grKinokoRoute_80207C88` | `src/melee/gr/grkinokoroute.c` | `queued:1` |
| 203 | 85.26 | 93.02010 | 796 | `main/melee/gr/grgreens` | `grGreens_8021483C` | `src/melee/gr/grgreens.c` | `no_db_target` |
| 204 | 84.85 | 91.90456 | 964 | `main/melee/mn/mnname` | `mnName_MainInput` | `src/melee/mn/mnname.c` | `queued:1` |
| 205 | 84.72 | 88.09547 | 1676 | `main/melee/gm/gm_18A5` | `fn_80193FCC` | `src/melee/gm/gm_18A5.c` | `queued:2` |
| 206 | 84.03 | 94.69065 | 556 | `main/melee/gr/grmutecity` | `grMuteCity_801F0D20` | `src/melee/gr/grmutecity.c` | `no_db_target` |
| 207 | 82.76 | 89.66767 | 1324 | `main/melee/ty/tyfigupon` | `fn_80315C44` | `src/melee/ty/tyfigupon.c` | `no_db_target` |
| 208 | 82.16 | 89.15298 | 1412 | `main/melee/gr/grfourside` | `grFourside_801F3274` | `src/melee/gr/grfourside.c` | `queued:1` |
| 209 | 82.07 | 92.43192 | 852 | `main/melee/cm/camera` | `Camera_8002C5B4` | `src/melee/cm/camera.c` | `no_db_target` |
| 210 | 81.47 | 96.22222 | 180 | `main/melee/mn/mnsnap` | `mnSnap_80253F60` | `src/melee/mn/mnsnap.c` | `no_db_target` |
| 211 | 80.83 | 94.58394 | 548 | `main/melee/gr/gronett` | `grOnett_801E3A34` | `src/melee/gr/gronett.c` | `no_db_target` |
| 212 | 79.55 | 94.70992 | 524 | `main/melee/gm/gm_18A5` | `fn_801935B8` | `src/melee/gm/gm_18A5.c` | `queued:2` |
| 213 | 78.25 | 94.70543 | 516 | `main/melee/cm/camera` | `Camera_8002C908` | `src/melee/cm/camera.c` | `no_db_target` |
| 214 | 77.80 | 93.83226 | 620 | `main/melee/ft/chara/ftCommon/ftCo_ThrownKirby` | `ftCo_800BDB58` | `src/melee/ft/chara/ftCommon/ftCo_ThrownKirby.c` | `no_db_target` |
| 215 | 77.40 | 90.77947 | 1052 | `main/melee/gm/gm_1832` | `gm_80187F48_OnEnter` | `src/melee/gm/gm_1832.c` | `queued:2` |
| 216 | 77.22 | 94.78400 | 500 | `main/melee/gm/gm_18A5` | `fn_8019249C` | `src/melee/gm/gm_18A5.c` | `queued:2` |
| 217 | 75.51 | 90.81961 | 1020 | `main/melee/gr/groldpupupu` | `grOldPupupu_80210D10` | `src/melee/gr/groldpupupu.c` | `queued:1` |
| 218 | 75.47 | 86.19915 | 1888 | `main/melee/if/ifstock` | `ifStock_802F8298` | `src/melee/if/ifstock.c` | `no_db_target` |
| 219 | 75.35 | 85.62698 | 2016 | `main/melee/if/ifmagnify` | `ifMagnify_802FBBDC` | `src/melee/if/ifmagnify.c` | `no_db_target` |
| 220 | 73.81 | 91.98068 | 828 | `main/melee/ft/chara/ftKirby/ftkirbyspecialn` | `ftKb_SpecialHi_800F37EC` | `src/melee/ft/chara/ftKirby/ftkirbyspecialn.c` | `no_db_target` |
| 221 | 73.76 | 94.79832 | 476 | `main/melee/gm/gm_18A5` | `fn_80195AF0` | `src/melee/gm/gm_18A5.c` | `queued:2` |
| 222 | 73.74 | 90.35580 | 1068 | `main/melee/mp/mpisland` | `mpIsland_8005A728` | `src/melee/mp/mpisland.c` | `no_db_target` |
| 223 | 73.22 | 89.63946 | 1176 | `main/melee/mn/mnname` | `mnName_80239A24` | `src/melee/mn/mnname.c` | `queued:1` |
| 224 | 70.48 | 92.03061 | 784 | `main/sysdolphin/baselib/particle` | `hsd_80395A78` | `src/sysdolphin/baselib/particle.c` | `no_db_target` |
| 225 | 70.39 | 94.85714 | 448 | `main/melee/lb/lbaudio_ax` | `fn_80027488` | `src/melee/lb/lbaudio_ax.c` | `no_db_target` |
| 226 | 70.13 | 82.84351 | 2556 | `main/sysdolphin/baselib/hsd_3B34` | `hsd_803B3CD8` | `src/sysdolphin/baselib/hsd_3B34.c` | `no_db_target` |
| 227 | 70.04 | 92.71098 | 692 | `main/melee/gr/grkinokoroute` | `grKinokoRoute_80207634` | `src/melee/gr/grkinokoroute.c` | `no_db_target` |
| 228 | 69.95 | 91.36405 | 868 | `main/melee/if/ifstock` | `fn_802F8E08` | `src/melee/if/ifstock.c` | `no_db_target` |
| 229 | 69.67 | 94.21875 | 512 | `main/melee/gm/gm_1832` | `fn_80188B3C` | `src/melee/gm/gm_1832.c` | `queued:2` |
| 230 | 68.47 | 85.23800 | 1916 | `main/melee/mn/mnmainrule` | `mn_80231804` | `src/melee/mn/mnmainrule.c` | `no_db_target` |
| 231 | 68.23 | 90.11328 | 1024 | `main/sysdolphin/baselib/particle` | `hsd_80393440` | `src/sysdolphin/baselib/particle.c` | `no_db_target` |
| 232 | 67.80 | 93.40816 | 588 | `main/melee/mn/mnitemsw` | `fn_80233E10` | `src/melee/mn/mnitemsw.c` | `no_db_target` |
| 233 | 66.96 | 90.65086 | 928 | `main/sysdolphin/baselib/particle` | `DrawASCII` | `src/sysdolphin/baselib/particle.c` | `no_db_target` |
| 234 | 66.76 | 91.27619 | 840 | `main/melee/ft/chara/ftKirby/ftkirbyspecialn` | `ftKb_SpecialAirLw_Coll` | `src/melee/ft/chara/ftKirby/ftkirbyspecialn.c` | `no_db_target` |
| 235 | 66.64 | 88.08485 | 1320 | `main/melee/mn/mndatadel` | `fn_8024F318` | `src/melee/mn/mndatadel.c` | `no_db_target` |
| 236 | 66.30 | 90.05180 | 1004 | `main/melee/ft/chara/ftKirby/ftkirbyspecialn` | `ftKb_EatWait_IASA` | `src/melee/ft/chara/ftKirby/ftkirbyspecialn.c` | `no_db_target` |
| 237 | 65.80 | 90.73778 | 900 | `main/melee/gr/grpstadium` | `grStadium_801D3BBC` | `src/melee/gr/grpstadium.c` | `no_db_target` |
| 238 | 65.37 | 87.84132 | 1336 | `main/melee/mn/mndiagram` | `mnDiagram_8024227C` | `src/melee/mn/mndiagram.c` | `queued:2` |
| 239 | 64.83 | 92.20571 | 700 | `main/melee/gm/gm_18A5` | `fn_801913BC` | `src/melee/gm/gm_18A5.c` | `queued:2` |
| 240 | 64.79 | 89.92000 | 1000 | `main/sysdolphin/baselib/particle` | `hsd_8039254C` | `src/sysdolphin/baselib/particle.c` | `no_db_target` |
| 241 | 64.51 | 91.14976 | 828 | `main/melee/ft/chara/ftKirby/ftkirbyspecialn` | `ftKb_SpecialAirLwStart_Coll` | `src/melee/ft/chara/ftKirby/ftkirbyspecialn.c` | `no_db_target` |
| 242 | 64.48 | 87.29462 | 1412 | `main/melee/ft/ftcpuattack` | `ftCo_800B8A9C` | `src/melee/ft/ftcpuattack.c` | `no_db_target` |
| 243 | 63.97 | 94.72381 | 420 | `main/melee/gm/gm_1832` | `fn_80187910` | `src/melee/gm/gm_1832.c` | `queued:2` |
| 244 | 63.59 | 79.93095 | 3128 | `main/melee/gm/gm_18A5` | `fn_8018C8D4` | `src/melee/gm/gm_18A5.c` | `queued:2` |
| 245 | 63.54 | 91.78804 | 736 | `main/melee/ft/chara/ftCommon/ftCo_0A01` | `ftCo_800AE7AC` | `src/melee/ft/chara/ftCommon/ftCo_0A01.c` | `queued:1` |
| 246 | 63.34 | 93.57143 | 532 | `main/melee/lb/lbaudio_ax` | `lbAudioAx_80027648` | `src/melee/lb/lbaudio_ax.c` | `no_db_target` |
| 247 | 63.10 | 92.28571 | 672 | `main/melee/gr/gronett` | `grOnett_801E5214` | `src/melee/gr/gronett.c` | `no_db_target` |
| 248 | 61.54 | 93.30882 | 544 | `main/melee/cm/camera` | `Camera_8002DDC4` | `src/melee/cm/camera.c` | `no_db_target` |
| 249 | 61.10 | 93.98305 | 472 | `main/melee/gm/gm_1832` | `fn_80188738` | `src/melee/gm/gm_1832.c` | `queued:2` |
| 250 | 60.90 | 84.79688 | 1792 | `main/melee/gr/grzebes` | `grZebes_801DBB60` | `src/melee/gr/grzebes.c` | `no_db_target` |
| 251 | 60.19 | 94.03478 | 460 | `main/melee/gr/grbigblue` | `fn_801EF60C` | `src/melee/gr/grbigblue.c` | `no_db_target` |
| 252 | 59.63 | 91.88236 | 680 | `main/melee/mn/mncharsel` | `mnCharSel_8025FDEC` | `src/melee/mn/mncharsel.c` | `no_db_target` |
| 253 | 59.24 | 89.78541 | 932 | `main/melee/mn/mnsnap` | `mnSnap_8025329C` | `src/melee/mn/mnsnap.c` | `no_db_target` |
| 254 | 59.04 | 87.98987 | 1184 | `main/melee/ft/ft_0CDD` | `ftCo_800CE650` | `src/melee/ft/ft_0CDD.c` | `no_db_target` |
| 255 | 58.61 | 91.95757 | 660 | `main/melee/gm/gmregclear` | `fn_80182B5C` | `src/melee/gm/gmregclear.c` | `queued:1` |
| 256 | 58.47 | 89.18800 | 1000 | `main/melee/gm/gm_18A5` | `fn_80190ABC` | `src/melee/gm/gm_18A5.c` | `queued:2` |
| 257 | 57.41 | 94.59794 | 388 | `main/melee/mn/mnsnap` | `mnSnap_80254298` | `src/melee/mn/mnsnap.c` | `no_db_target` |
| 258 | 56.65 | 87.01558 | 1284 | `main/melee/gm/gm_18A5` | `fn_8018DF68` | `src/melee/gm/gm_18A5.c` | `queued:2` |
| 259 | 56.41 | 87.73972 | 1168 | `main/melee/gr/grbigblue` | `grBigBlue_801EC6C0` | `src/melee/gr/grbigblue.c` | `no_db_target` |
| 260 | 55.90 | 92.24000 | 600 | `main/melee/ft/chara/ftCommon/ftCo_ThrownKirby` | `ftCo_800BE000` | `src/melee/ft/chara/ftCommon/ftCo_ThrownKirby.c` | `no_db_target` |
| 261 | 55.80 | 92.86567 | 536 | `main/melee/gr/grzebes` | `grZebes_801DAE70` | `src/melee/gr/grzebes.c` | `no_db_target` |
| 262 | 55.36 | 93.88991 | 436 | `main/melee/it/itspawn` | `it_8026CD50` | `src/melee/it/itspawn.c` | `no_db_target` |
| 263 | 55.14 | 93.30328 | 488 | `main/melee/mp/mplib` | `mpLib_80058614_Floor` | `src/melee/mp/mplib.c` | `queued:2` |
| 264 | 54.63 | 93.87037 | 432 | `main/melee/gm/gmclassic` | `gmClassic_801B2BA4` | `src/melee/gm/gmclassic.c` | `no_db_target` |
| 265 | 54.22 | 94.10784 | 408 | `main/melee/cm/camera` | `Camera_8002C010` | `src/melee/cm/camera.c` | `no_db_target` |
| 266 | 54.11 | 86.76899 | 1264 | `main/melee/gr/gryorster` | `grYorster_8020266C` | `src/melee/gr/gryorster.c` | `queued:1` |
| 267 | 53.57 | 87.19192 | 1188 | `main/melee/ft/chara/ftCommon/ftCo_0A01` | `ftCo_800A8940` | `src/melee/ft/chara/ftCommon/ftCo_0A01.c` | `queued:1` |
| 268 | 52.47 | 91.27879 | 660 | `main/melee/gr/ground` | `Ground_801C20E0` | `src/melee/gr/ground.c` | `stalled:1` |
| 269 | 50.64 | 89.72139 | 804 | `main/melee/gm/gm_1832` | `gm_80189CDC` | `src/melee/gm/gm_1832.c` | `queued:2` |
| 270 | 49.36 | 92.98276 | 464 | `main/melee/ft/chara/ftCommon/ftCo_Shouldered` | `ftCo_Shouldered_Anim` | `src/melee/ft/chara/ftCommon/ftCo_Shouldered.c` | `no_db_target` |
| 271 | 48.54 | 92.20611 | 524 | `main/melee/ft/chara/ftNana/ftNn_Init` | `ftPp_SpecialS_1_Coll` | `src/melee/ft/chara/ftNana/ftNn_Init.c` | `no_db_target` |
| 272 | 47.16 | 94.80263 | 304 | `main/melee/it/itspawn` | `it_8026C75C` | `src/melee/it/itspawn.c` | `no_db_target` |
| 273 | 46.58 | 89.04926 | 812 | `main/melee/mn/mnname` | `mnName_SortNames` | `src/melee/mn/mnname.c` | `queued:1` |
| 274 | 46.35 | 91.31035 | 580 | `main/melee/gr/grfourside` | `grFourside_801F3CC8` | `src/melee/gr/grfourside.c` | `no_db_target` |
| 275 | 46.15 | 92.71053 | 456 | `main/melee/gm/gmregclear` | `fn_8017EE40` | `src/melee/gm/gmregclear.c` | `queued:1` |
| 276 | 45.81 | 87.97826 | 920 | `main/melee/ft/chara/ftCommon/ftCo_0A01` | `ftCo_800A6700` | `src/melee/ft/chara/ftCommon/ftCo_0A01.c` | `queued:1` |
| 277 | 45.14 | 88.49056 | 848 | `main/melee/gm/gm_18A5` | `fn_8018DC18` | `src/melee/gm/gm_18A5.c` | `queued:2` |
| 278 | 44.10 | 94.92754 | 276 | `main/melee/it/itspawn` | `it_8026CF04` | `src/melee/it/itspawn.c` | `no_db_target` |
| 279 | 44.06 | 94.98529 | 272 | `main/sysdolphin/baselib/particle` | `hsd_80394434` | `src/sysdolphin/baselib/particle.c` | `no_db_target` |
| 280 | 43.68 | 93.66666 | 360 | `main/melee/ft/chara/ftCommon/ftCo_Bury` | `ftCo_800C0B20` | `src/melee/ft/chara/ftCommon/ftCo_Bury.c` | `queued:1` |
| 281 | 43.19 | 86.67843 | 1020 | `main/melee/gm/gm_18A5` | `fn_80196FFC` | `src/melee/gm/gm_18A5.c` | `queued:2` |
| 282 | 43.00 | 79.75836 | 2152 | `main/sysdolphin/baselib/texpdag` | `SimplifyThis` | `src/sysdolphin/baselib/texpdag.c` | `no_db_target` |
| 283 | 42.52 | 91.84426 | 488 | `main/melee/gm/gm_1832` | `fn_80187AB4` | `src/melee/gm/gm_1832.c` | `queued:2` |
| 284 | 41.82 | 84.00595 | 1344 | `main/melee/gm/gmclassic` | `gmClassic_OnLoad` | `src/melee/gm/gmclassic.c` | `no_db_target` |
| 285 | 41.41 | 92.72549 | 408 | `main/melee/gm/gmregclear` | `fn_8017D9C0` | `src/melee/gm/gmregclear.c` | `queued:1` |
| 286 | 41.14 | 93.02084 | 384 | `main/melee/gm/gmcamera` | `gmCamera_801A292C` | `src/melee/gm/gmcamera.c` | `no_db_target` |
| 287 | 40.66 | 83.21629 | 1424 | `main/sysdolphin/baselib/particle` | `fn_80397814` | `src/sysdolphin/baselib/particle.c` | `no_db_target` |
| 288 | 40.48 | 89.53333 | 660 | `main/melee/ft/chara/ftCommon/ftCo_0A01` | `ftCo_800A6A98` | `src/melee/ft/chara/ftCommon/ftCo_0A01.c` | `queued:1` |
| 289 | 40.30 | 86.81624 | 936 | `main/melee/gm/gm_18A5` | `fn_80191FD4` | `src/melee/gm/gm_18A5.c` | `queued:2` |
| 290 | 40.17 | 81.92804 | 1612 | `main/sysdolphin/baselib/hsd_3B5C` | `hsd_803B6BE4` | `src/sysdolphin/baselib/hsd_3B5C.c` | `no_db_target` |
| 291 | 40.16 | 83.44607 | 1372 | `main/melee/gr/grgreens` | `grGreens_802166C4` | `src/melee/gr/grgreens.c` | `queued:1` |
| 292 | 40.00 | 89.44849 | 660 | `main/melee/ft/ftmetal` | `ft_800C85B8` | `src/melee/ft/ftmetal.c` | `no_db_target` |
| 293 | 39.74 | 90.30345 | 580 | `main/melee/gm/gm_18A5` | `fn_8018E618` | `src/melee/gm/gm_18A5.c` | `queued:2` |
| 294 | 39.54 | 92.35577 | 416 | `main/sysdolphin/baselib/hsd_3B2E` | `fn_803B302C` | `src/sysdolphin/baselib/hsd_3B2E.c` | `no_db_target` |
| 295 | 39.24 | 83.61702 | 1316 | `main/melee/gr/grbigblue` | `grBigBlue_801EEF00` | `src/melee/gr/grbigblue.c` | `no_db_target` |
| 296 | 39.24 | 58.05825 | 14488 | `main/sysdolphin/baselib/psdisp` | `psDispParticles` | `src/sysdolphin/baselib/psdisp.c` | `no_db_target` |
| 297 | 38.72 | 89.21212 | 660 | `main/melee/gm/gm_1B03` | `gm_801B1C24` | `src/melee/gm/gm_1B03.c` | `no_db_target` |
| 298 | 38.33 | 79.64536 | 1940 | `main/melee/gr/grzebes` | `grZebes_801DB3CC` | `src/melee/gr/grzebes.c` | `no_db_target` |
| 299 | 37.87 | 89.00603 | 664 | `main/melee/gr/grzebes` | `grZebes_801DC744` | `src/melee/gr/grzebes.c` | `no_db_target` |
| 300 | 37.60 | 91.61607 | 448 | `main/sysdolphin/baselib/particle` | `hsd_80393844` | `src/sysdolphin/baselib/particle.c` | `no_db_target` |
| 301 | 37.57 | 77.23794 | 2404 | `main/melee/ft/chara/ftCommon/ftCo_0A01` | `ftCo_800ADE48` | `src/melee/ft/chara/ftCommon/ftCo_0A01.c` | `queued:1` |
| 302 | 37.53 | 88.93976 | 664 | `main/melee/ft/chara/ftCommon/ftCo_0A01` | `ftCo_800A6D2C` | `src/melee/ft/chara/ftCommon/ftCo_0A01.c` | `queued:1` |
| 303 | 37.44 | 86.64414 | 888 | `main/melee/mn/mndiagram3` | `mnDiagram3_8024714C` | `src/melee/mn/mndiagram3.c` | `no_db_target` |
| 304 | 37.19 | 87.47739 | 796 | `main/melee/ty/tyfigupon` | `fn_803168DC` | `src/melee/ty/tyfigupon.c` | `no_db_target` |
| 305 | 37.03 | 86.36564 | 908 | `main/melee/gm/gm_18A5` | `fn_8019AF50` | `src/melee/gm/gm_18A5.c` | `queued:1` |
| 306 | 36.55 | 87.25871 | 804 | `main/melee/ft/chara/ftKirby/ftkirbyspecialn` | `ftKb_SpecialAirNCaptureWait_IASA` | `src/melee/ft/chara/ftKirby/ftkirbyspecialn.c` | `no_db_target` |
| 307 | 36.52 | 80.78883 | 1648 | `main/sysdolphin/baselib/particle` | `hsd_8039F05C` | `src/sysdolphin/baselib/particle.c` | `no_db_target` |
| 308 | 36.13 | 84.75655 | 1068 | `main/melee/gr/grrcruise` | `grRCruise_8020071C` | `src/melee/gr/grrcruise.c` | `queued:1` |
| 309 | 35.30 | 92.59551 | 356 | `main/melee/if/if_2F72` | `fn_802F7994` | `src/melee/if/if_2F72.c` | `no_db_target` |
| 310 | 34.89 | 84.24542 | 1092 | `main/melee/mn/mnname` | `mnName_8023AC40` | `src/melee/mn/mnname.c` | `queued:1` |
| 311 | 34.80 | 90.90517 | 464 | `main/melee/mp/mplib` | `mpLib_800536CC_Floor` | `src/melee/mp/mplib.c` | `queued:1` |
| 312 | 34.56 | 81.32791 | 1476 | `main/melee/gm/gm_18A5` | `fn_8019A158` | `src/melee/gm/gm_18A5.c` | `queued:1` |
| 313 | 34.24 | 78.08118 | 2020 | `main/melee/mn/mnruleplus` | `mn_80233218` | `src/melee/mn/mnruleplus.c` | `queued:1` |
| 314 | 33.95 | 83.60351 | 1140 | `main/melee/gm/gm_18A5` | `fn_80193B58` | `src/melee/gm/gm_18A5.c` | `queued:1` |
| 315 | 33.84 | 93.15585 | 308 | `main/melee/gr/grpushon` | `grPushOn_802190D0` | `src/melee/gr/grpushon.c` | `no_db_target` |
| 316 | 33.61 | 89.37857 | 560 | `main/melee/gm/gmmain_lib` | `gmMainLib_8015EA80` | `src/melee/gm/gmmain_lib.c` | `queued:1` |
| 317 | 33.57 | 88.81457 | 604 | `main/melee/mn/mninfo` | `mnInfo_80251AFC` | `src/melee/mn/mninfo.c` | `no_db_target` |
| 318 | 33.49 | 91.41747 | 412 | `main/sysdolphin/baselib/hsd_3B2E` | `fn_803B2E04` | `src/sysdolphin/baselib/hsd_3B2E.c` | `no_db_target` |
| 319 | 33.39 | 87.41666 | 720 | `main/melee/mn/mnvibration` | `fn_802487A8` | `src/melee/mn/mnvibration.c` | `no_db_target` |
| 320 | 32.55 | 85.73489 | 860 | `main/melee/gm/gm_18A5` | `fn_80194658` | `src/melee/gm/gm_18A5.c` | `queued:1` |
| 321 | 32.18 | 92.53658 | 328 | `main/melee/if/ifcoget` | `fn_802FF218` | `src/melee/if/ifcoget.c` | `queued:1` |
| 322 | 32.08 | 87.55294 | 680 | `main/melee/lb/lbaudio_ax` | `lbAudioAx_800233EC` | `src/melee/lb/lbaudio_ax.c` | `no_db_target` |
| 323 | 31.76 | 77.26035 | 2028 | `main/melee/gr/grgreens` | `grGreens_80215ED8` | `src/melee/gr/grgreens.c` | `no_db_target` |
| 324 | 31.53 | 74.47859 | 2616 | `main/sysdolphin/baselib/texpdag` | `SimplifyByMerge` | `src/sysdolphin/baselib/texpdag.c` | `no_db_target` |
| 325 | 31.45 | 88.12258 | 620 | `main/sysdolphin/baselib/particle` | `hsd_80391F28` | `src/sysdolphin/baselib/particle.c` | `no_db_target` |
| 326 | 31.30 | 80.79037 | 1412 | `main/melee/mn/mnmainrule` | `mn_80230274` | `src/melee/mn/mnmainrule.c` | `no_db_target` |
| 327 | 31.27 | 71.36964 | 3452 | `main/sysdolphin/baselib/hsd_3AA7` | `fn_803B0120` | `src/sysdolphin/baselib/hsd_3AA7.c` | `queued:2` |
| 328 | 31.15 | 84.53390 | 944 | `main/melee/gm/gmallstar` | `gm_801B5ACC` | `src/melee/gm/gmallstar.c` | `no_db_target` |
| 329 | 30.88 | 87.53658 | 656 | `main/melee/mn/mnstagesw` | `mnStageSw_802359C8` | `src/melee/mn/mnstagesw.c` | `no_db_target` |
| 330 | 30.81 | 90.63551 | 428 | `main/sysdolphin/baselib/hsd_3AA7` | `fn_803ACFC0` | `src/sysdolphin/baselib/hsd_3AA7.c` | `queued:2` |
| 331 | 30.03 | 90.59048 | 420 | `main/melee/ft/chara/ftKirby/ftkirbyspecialmars` | `ftKb_SpecialNMs_8010B2FC` | `src/melee/ft/chara/ftKirby/ftkirbyspecialmars.c` | `no_db_target` |
| 332 | 29.43 | 87.86000 | 600 | `main/melee/lb/lbaudio_ax` | `fn_800269AC` | `src/melee/lb/lbaudio_ax.c` | `no_db_target` |
| 333 | 29.37 | 84.12017 | 932 | `main/melee/gm/gmtou` | `fn_8019C048` | `src/melee/gm/gmtou.c` | `no_db_target` |
| 334 | 29.14 | 94.70834 | 192 | `main/sysdolphin/baselib/particle` | `hsd_80394128` | `src/sysdolphin/baselib/particle.c` | `no_db_target` |
| 335 | 29.09 | 86.91018 | 668 | `main/melee/mn/mncharsel` | `mnCharSel_8025FB50` | `src/melee/mn/mncharsel.c` | `no_db_target` |
| 336 | 28.94 | 84.62673 | 868 | `main/melee/mn/mndatadel` | `fn_8024F840` | `src/melee/mn/mndatadel.c` | `no_db_target` |
| 337 | 28.34 | 81.57288 | 1180 | `main/sysdolphin/baselib/hsd_3AA7` | `fn_803B0E9C` | `src/sysdolphin/baselib/hsd_3AA7.c` | `queued:2` |
| 338 | 28.27 | 82.32721 | 1088 | `main/melee/gm/gm_18A5` | `fn_80195CCC` | `src/melee/gm/gm_18A5.c` | `queued:1` |
| 339 | 27.88 | 90.15385 | 416 | `main/melee/mn/mninfo` | `mnInfo_80252758` | `src/melee/mn/mninfo.c` | `no_db_target` |
| 340 | 27.85 | 92.61429 | 280 | `main/melee/mn/mnsnap` | `mnSnap_80253184` | `src/melee/mn/mnsnap.c` | `no_db_target` |
| 341 | 27.66 | 92.25676 | 296 | `main/sysdolphin/baselib/hsd_3AA7` | `fn_803B26CC` | `src/sysdolphin/baselib/hsd_3AA7.c` | `queued:2` |
| 342 | 27.57 | 83.62337 | 924 | `main/melee/if/ifstock` | `ifStock_802F7EFC` | `src/melee/if/ifstock.c` | `no_db_target` |
| 343 | 27.45 | 89.52679 | 448 | `main/melee/gm/gmcamera` | `gmCamera_801A31FC` | `src/melee/gm/gmcamera.c` | `no_db_target` |
| 344 | 27.02 | 94.46809 | 188 | `main/melee/if/if_2F72` | `if_802F7AF8` | `src/melee/if/if_2F72.c` | `no_db_target` |
| 345 | 26.49 | 80.84849 | 1188 | `main/melee/gr/grcorneria` | `grCorneria_801DCE1C` | `src/melee/gr/grcorneria.c` | `no_db_target` |
| 346 | 26.35 | 88.84746 | 472 | `main/melee/mn/mninfo` | `fn_80252548` | `src/melee/mn/mninfo.c` | `no_db_target` |
| 347 | 26.15 | 79.57958 | 1332 | `main/melee/mn/mnsoundtest` | `fn_8024B2B0` | `src/melee/mn/mnsoundtest.c` | `no_db_target` |
| 348 | 25.83 | 93.13559 | 236 | `main/melee/if/if_2F72` | `fn_802F770C` | `src/melee/if/if_2F72.c` | `no_db_target` |
| 349 | 25.03 | 80.15282 | 1204 | `main/melee/ft/chara/ftCommon/ftCo_0A01` | `ftCo_800A2C80` | `src/melee/ft/chara/ftCommon/ftCo_0A01.c` | `queued:1` |
| 350 | 24.98 | 87.57576 | 528 | `main/melee/gm/gm_18A5` | `fn_801949B4` | `src/melee/gm/gm_18A5.c` | `queued:1` |
| 351 | 24.46 | 89.94681 | 376 | `main/sysdolphin/baselib/hsd_3B2E` | `hsd_803B31CC` | `src/sysdolphin/baselib/hsd_3B2E.c` | `no_db_target` |
| 352 | 24.03 | 83.27751 | 836 | `main/melee/gr/grzebes` | `grZebes_801DB088` | `src/melee/gr/grzebes.c` | `no_db_target` |
| 353 | 23.35 | 91.31507 | 292 | `main/sysdolphin/baselib/particle` | `hsd_80394544` | `src/sysdolphin/baselib/particle.c` | `no_db_target` |
| 354 | 23.15 | 70.92632 | 2660 | `main/sysdolphin/baselib/hsd_3B34` | `hsd_803B51C8` | `src/sysdolphin/baselib/hsd_3B34.c` | `no_db_target` |
| 355 | 22.87 | 89.70330 | 364 | `main/melee/ft/chara/ftKirby/ftkirbyspecialn` | `fn_800F9260` | `src/melee/ft/chara/ftKirby/ftkirbyspecialn.c` | `no_db_target` |
| 356 | 22.86 | 84.13812 | 724 | `main/melee/mn/mninfo` | `fn_80251FE4` | `src/melee/mn/mninfo.c` | `no_db_target` |
| 357 | 22.82 | 82.44240 | 868 | `main/melee/gm/gm_18A5` | `fn_8018ECA8` | `src/melee/gm/gm_18A5.c` | `queued:1` |
| 358 | 22.75 | 91.15069 | 292 | `main/melee/gr/grkinokoroute` | `grKinokoRoute_80207B5C` | `src/melee/gr/grkinokoroute.c` | `no_db_target` |
| 359 | 22.75 | 90.14117 | 340 | `main/melee/gm/gm_1832` | `fn_80189B88` | `src/melee/gm/gm_1832.c` | `queued:2` |
| 360 | 22.16 | 86.73077 | 520 | `main/melee/gm/gmcamera` | `gmCamera_801A2334` | `src/melee/gm/gmcamera.c` | `no_db_target` |
| 361 | 22.15 | 88.20370 | 432 | `main/melee/mn/mnmainrule` | `mn_8022FD18` | `src/melee/mn/mnmainrule.c` | `no_db_target` |
| 362 | 22.13 | 84.89441 | 644 | `main/melee/ft/chara/ftCommon/ftCo_0A01` | `ftCo_800B04DC` | `src/melee/ft/chara/ftCommon/ftCo_0A01.c` | `queued:1` |
| 363 | 21.39 | 86.89431 | 492 | `main/melee/mn/mnsound` | `fn_80249A1C` | `src/melee/mn/mnsound.c` | `no_db_target` |
| 364 | 21.00 | 82.37811 | 804 | `main/melee/mn/mnstagesw` | `fn_80236998` | `src/melee/mn/mnstagesw.c` | `no_db_target` |
| 365 | 20.81 | 82.77487 | 764 | `main/melee/gr/grvenom` | `grVenom_802053B0` | `src/melee/gr/grvenom.c` | `no_db_target` |
| 366 | 20.74 | 80.74468 | 940 | `main/melee/gm/gmresultplayer` | `fn_80179990` | `src/melee/gm/gmresultplayer.c` | `no_db_target` |
| 367 | 20.68 | 84.12195 | 656 | `main/sysdolphin/baselib/particle` | `fn_80392A3C` | `src/sysdolphin/baselib/particle.c` | `no_db_target` |
| 368 | 20.67 | 87.16522 | 460 | `main/melee/ft/chara/ftCommon/ftCo_WarpStar` | `ftCo_800C4C60` | `src/melee/ft/chara/ftCommon/ftCo_WarpStar.c` | `no_db_target` |
| 369 | 20.65 | 79.65517 | 1044 | `main/melee/gr/grmutecity` | `grMuteCity_801F1328` | `src/melee/gr/grmutecity.c` | `no_db_target` |
| 370 | 20.53 | 78.63066 | 1148 | `main/melee/ft/chara/ftCommon/ftCo_0A01` | `ftCo_800A229C` | `src/melee/ft/chara/ftCommon/ftCo_0A01.c` | `queued:1` |
| 371 | 20.48 | 84.89262 | 596 | `main/melee/lb/lbaudio_ax` | `fn_80026C04` | `src/melee/lb/lbaudio_ax.c` | `no_db_target` |
| 372 | 20.15 | 77.50955 | 1256 | `main/melee/gr/grvenom` | `grVenom_8020362C` | `src/melee/gr/grvenom.c` | `no_db_target` |
| 373 | 19.61 | 72.84144 | 1892 | `main/melee/ft/chara/ftCommon/ftCo_0A01` | `ftCo_800ABBA8` | `src/melee/ft/chara/ftCommon/ftCo_0A01.c` | `queued:1` |
| 374 | 19.48 | 88.95349 | 344 | `main/melee/gr/grflatzone` | `grFlatzone_802174EC` | `src/melee/gr/grflatzone.c` | `no_db_target` |
| 375 | 19.35 | 82.91428 | 700 | `main/melee/gr/grmutecity` | `grMuteCity_801F106C` | `src/melee/gr/grmutecity.c` | `no_db_target` |
| 376 | 19.09 | 81.75384 | 780 | `main/melee/gm/gm_1832` | `fn_80188EE8` | `src/melee/gm/gm_1832.c` | `queued:2` |
| 377 | 18.76 | 75.25691 | 1448 | `main/melee/mn/mnruleplus` | `mn_802327A4` | `src/melee/mn/mnruleplus.c` | `no_db_target` |
| 378 | 18.14 | 89.52702 | 296 | `main/melee/mp/mplib` | `mpLib_80053ECC_Floor` | `src/melee/mp/mplib.c` | `queued:1` |
| 379 | 18.09 | 87.37755 | 392 | `main/melee/ty/tyfigupon` | `un_803153EC` | `src/melee/ty/tyfigupon.c` | `no_db_target` |
| 380 | 18.07 | 87.45361 | 388 | `main/melee/gr/gryorster` | `grYorster_802022A4` | `src/melee/gr/gryorster.c` | `no_db_target` |
| 381 | 17.99 | 90.36923 | 260 | `main/melee/gm/gmcamera` | `gmCamera_801A2AAC` | `src/melee/gm/gmcamera.c` | `no_db_target` |
| 382 | 17.64 | 79.38428 | 916 | `main/melee/gm/gm_18A5` | `fn_801937C4` | `src/melee/gm/gm_18A5.c` | `queued:1` |
| 383 | 17.48 | 78.77593 | 964 | `main/melee/gm/gm_18A5` | `fn_8019B458` | `src/melee/gm/gm_18A5.c` | `queued:1` |
| 384 | 17.45 | 81.66111 | 720 | `main/melee/mn/mnmainrule` | `mn_8022FEC8` | `src/melee/mn/mnmainrule.c` | `no_db_target` |
| 385 | 16.85 | 83.70000 | 560 | `main/melee/ft/chara/ftCommon/ftCo_DownBound` | `ftCo_800976A4` | `src/melee/ft/chara/ftCommon/ftCo_DownBound.c` | `no_db_target` |
| 386 | 16.18 | 84.28571 | 504 | `main/melee/mn/mnstagesw` | `fn_80235F80` | `src/melee/mn/mnstagesw.c` | `no_db_target` |
| 387 | 16.17 | 85.09565 | 460 | `main/melee/gr/grgreens` | `grGreens_802159B8` | `src/melee/gr/grgreens.c` | `no_db_target` |
| 388 | 16.08 | 76.38351 | 1116 | `main/melee/ft/chara/ftCommon/ftCo_0A01` | `ftCo_800A8210` | `src/melee/ft/chara/ftCommon/ftCo_0A01.c` | `no_db_target` |
| 389 | 15.51 | 69.41487 | 2044 | `main/melee/mn/mnmainrule` | `mn_80230E38` | `src/melee/mn/mnmainrule.c` | `no_db_target` |
| 390 | 15.42 | 92.29269 | 164 | `main/melee/gr/grzakogenerator` | `grZakoGenerator_801CAC14` | `src/melee/gr/grzakogenerator.c` | `no_db_target` |
| 391 | 15.41 | 83.56154 | 520 | `main/melee/gr/grpura` | `grPura_80213250` | `src/melee/gr/grpura.c` | `queued:1` |
| 392 | 15.41 | 84.44068 | 472 | `main/melee/lb/lbrefract` | `lbRefract_800222A4` | `src/melee/lb/lbrefract.c` | `no_db_target` |
| 393 | 15.15 | 84.75000 | 448 | `main/melee/gm/gm_18A5` | `fn_80194BC4` | `src/melee/gm/gm_18A5.c` | `queued:1` |
| 394 | 14.91 | 83.04511 | 532 | `main/melee/gm/gmresult` | `fn_80175880` | `src/melee/gm/gmresult.c` | `queued:1` |
| 395 | 14.87 | 77.31780 | 944 | `main/melee/lb/lbaudio_ax` | `lbAudioAx_80023B24` | `src/melee/lb/lbaudio_ax.c` | `no_db_target` |
| 396 | 14.76 | 82.60145 | 552 | `main/dolphin/thp/THPDec` | `THPDec_803310CC` | `extern/dolphin/src/dolphin/thp/THPDec.c` | `queued:1` |
| 397 | 14.75 | 82.39007 | 564 | `main/melee/gm/gm_1601` | `fn_80162170` | `src/melee/gm/gm_1601.c` | `queued:2` |
| 398 | 14.71 | 87.14634 | 328 | `main/melee/ft/chara/ftNana/ftNn_Init` | `ftNn_Init_801230D0` | `src/melee/ft/chara/ftNana/ftNn_Init.c` | `no_db_target` |
| 399 | 13.69 | 80.88236 | 612 | `main/sysdolphin/baselib/particle` | `hsd_80397110` | `src/sysdolphin/baselib/particle.c` | `no_db_target` |
| 400 | 13.67 | 83.58261 | 460 | `main/melee/gr/grgreens` | `fn_80215B84` | `src/melee/gr/grgreens.c` | `no_db_target` |
| 401 | 13.62 | 76.17427 | 964 | `main/sysdolphin/baselib/hsd_3B5C` | `fn_803B6820` | `src/sysdolphin/baselib/hsd_3B5C.c` | `no_db_target` |
| 402 | 13.59 | 88.70968 | 248 | `main/melee/lb/lbaudio_ax` | `fn_800268B4` | `src/melee/lb/lbaudio_ax.c` | `no_db_target` |
| 403 | 13.22 | 78.79121 | 728 | `main/melee/gr/granime` | `grAnime_801C6C0C` | `src/melee/gr/granime.c` | `no_db_target` |
| 404 | 13.10 | 75.89496 | 952 | `main/melee/if/ifstock` | `ifStock_802F89F8` | `src/melee/if/ifstock.c` | `no_db_target` |
| 405 | 13.08 | 85.00000 | 376 | `main/sysdolphin/baselib/particle` | `hsd_803922FC` | `src/sysdolphin/baselib/particle.c` | `no_db_target` |
| 406 | 13.01 | 80.76871 | 588 | `main/melee/ft/chara/ftCommon/ftCo_DownBound` | `ftCo_80097AF4` | `src/melee/ft/chara/ftCommon/ftCo_DownBound.c` | `no_db_target` |
| 407 | 12.73 | 82.92174 | 460 | `main/melee/gr/grinishie1` | `grInishie1_801FBCEC` | `src/melee/gr/grinishie1.c` | `no_db_target` |
| 408 | 12.72 | 83.93204 | 412 | `main/melee/if/if_2F72` | `fn_802F77F8` | `src/melee/if/if_2F72.c` | `no_db_target` |
| 409 | 12.47 | 80.42466 | 584 | `main/sysdolphin/baselib/texpdag` | `order_dag` | `src/sysdolphin/baselib/texpdag.c` | `no_db_target` |
| 410 | 12.31 | 75.73568 | 908 | `main/sysdolphin/baselib/particle` | `psInitDataBankLocate` | `src/sysdolphin/baselib/particle.c` | `no_db_target` |
| 411 | 12.14 | 88.76363 | 220 | `main/sysdolphin/baselib/hsd_3AA7` | `hsd_803AC558` | `src/sysdolphin/baselib/hsd_3AA7.c` | `queued:2` |
| 412 | 11.78 | 80.19858 | 564 | `main/melee/gm/gmallstar` | `gm_801B60A4_OnLoad` | `src/melee/gm/gmallstar.c` | `no_db_target` |
| 413 | 11.72 | 80.43796 | 548 | `main/melee/gm/gm_1601` | `gm_80166A98` | `src/melee/gm/gm_1601.c` | `queued:2` |
| 414 | 11.69 | 59.65414 | 3724 | `main/melee/gm/gmmain_lib` | `gmMainLib_8015DBF4` | `src/melee/gm/gmmain_lib.c` | `no_db_target` |
| 415 | 11.53 | 85.86667 | 300 | `main/sysdolphin/baselib/particle` | `hsd_803941E8` | `src/sysdolphin/baselib/particle.c` | `no_db_target` |
| 416 | 11.04 | 81.07438 | 484 | `main/melee/gm/gm_18A5` | `fn_8018FBE0` | `src/melee/gm/gm_18A5.c` | `queued:1` |
| 417 | 10.87 | 77.71687 | 664 | `main/sysdolphin/baselib/particle` | `hsd_80396E40` | `src/sysdolphin/baselib/particle.c` | `no_db_target` |
| 418 | 10.67 | 79.49635 | 548 | `main/melee/ft/chara/ftCommon/ftCo_ItemThrow` | `ftCo_80095EFC` | `src/melee/ft/chara/ftCommon/ftCo_ItemThrow.c` | `no_db_target` |
| 419 | 10.12 | 81.88236 | 408 | `main/melee/lb/lbaudio_ax` | `fn_80023254` | `src/melee/lb/lbaudio_ax.c` | `no_db_target` |
| 420 | 9.30 | 74.52604 | 768 | `main/melee/gm/gmallstar` | `gm_801B5324` | `src/melee/gm/gmallstar.c` | `no_db_target` |
| 421 | 8.90 | 83.94444 | 288 | `main/sysdolphin/baselib/particle` | `hsd_80396188` | `src/sysdolphin/baselib/particle.c` | `no_db_target` |
| 422 | 8.85 | 81.27368 | 380 | `main/melee/gm/gm_18A5` | `fn_80191240` | `src/melee/gm/gm_18A5.c` | `queued:1` |
| 423 | 8.84 | 79.80909 | 440 | `main/melee/ft/chara/ftCommon/ftCo_0A01` | `ftCo_800A2718` | `src/melee/ft/chara/ftCommon/ftCo_0A01.c` | `no_db_target` |
| 424 | 8.72 | 79.95327 | 428 | `main/melee/gr/grinishie1` | `grInishie1_801FBAA0` | `src/melee/gr/grinishie1.c` | `no_db_target` |
| 425 | 8.70 | 89.62857 | 140 | `main/melee/gm/gmcamera` | `gmCamera_801A253C` | `src/melee/gm/gmcamera.c` | `no_db_target` |
| 426 | 8.65 | 80.25243 | 412 | `main/sysdolphin/baselib/particle` | `hsd_80396884` | `src/sysdolphin/baselib/particle.c` | `no_db_target` |
| 427 | 8.41 | 72.10599 | 868 | `main/sysdolphin/baselib/hsd_3B34` | `hsd_803B3408` | `src/sysdolphin/baselib/hsd_3B34.c` | `no_db_target` |
| 428 | 8.31 | 87.74419 | 172 | `main/melee/gr/grflatzone` | `grFlatzone_802181B4` | `src/melee/gr/grflatzone.c` | `no_db_target` |
| 429 | 8.23 | 73.54839 | 744 | `main/sysdolphin/baselib/particle` | `hsd_80394668` | `src/sysdolphin/baselib/particle.c` | `no_db_target` |
| 430 | 8.22 | 74.90243 | 656 | `main/melee/if/ifstock` | `fn_802FAC34` | `src/melee/if/ifstock.c` | `no_db_target` |
| 431 | 7.86 | 72.42640 | 788 | `main/sysdolphin/baselib/hsd_3B5C` | `hsd_803B5EA0` | `src/sysdolphin/baselib/hsd_3B5C.c` | `no_db_target` |
| 432 | 7.80 | 83.95238 | 252 | `main/melee/mn/mnnamenew` | `fn_8023DAEC` | `src/melee/mn/mnnamenew.c` | `queued:1` |
| 433 | 7.73 | 79.73196 | 388 | `main/melee/gr/grgreens` | `grGreens_80215D54` | `src/melee/gr/grgreens.c` | `no_db_target` |
| 434 | 7.71 | 86.95454 | 176 | `main/melee/gm/gm_1601` | `gm_80164A0C` | `src/melee/gm/gm_1601.c` | `queued:2` |
| 435 | 7.68 | 72.00000 | 800 | `main/melee/lb/lbaudio_ax` | `lbAudioAx_80027168` | `src/melee/lb/lbaudio_ax.c` | `no_db_target` |
| 436 | 7.50 | 73.84849 | 660 | `main/melee/gr/grgreens` | `grGreens_802150C4` | `src/melee/gr/grgreens.c` | `no_db_target` |
| 437 | 7.30 | 79.90000 | 360 | `main/melee/gr/grbigblue` | `grBigBlue_801E8A1C` | `src/melee/gr/grbigblue.c` | `no_db_target` |
| 438 | 6.95 | 65.02647 | 1360 | `main/melee/ft/chara/ftCommon/ftCo_0A01` | `ftCo_800B33B0` | `src/melee/ft/chara/ftCommon/ftCo_0A01.c` | `no_db_target` |
| 439 | 6.66 | 62.81407 | 1592 | `main/melee/ft/chara/ftCommon/ftCo_0A01` | `ftCo_800A7AAC` | `src/melee/ft/chara/ftCommon/ftCo_0A01.c` | `no_db_target` |
| 440 | 6.44 | 79.22353 | 340 | `main/melee/gr/grflatzone` | `grFlatzone_80218060` | `src/melee/gr/grflatzone.c` | `no_db_target` |
| 441 | 6.14 | 75.47414 | 464 | `main/melee/gm/gm_1601` | `fn_80169A84` | `src/melee/gm/gm_1601.c` | `queued:2` |
| 442 | 5.91 | 72.96454 | 564 | `main/melee/gm/gm_1601` | `fn_8016588C` | `src/melee/gm/gm_1601.c` | `queued:2` |
| 443 | 5.84 | 74.75423 | 472 | `main/melee/gm/gm_1601` | `gm_8016A22C` | `src/melee/gm/gm_1601.c` | `queued:1` |
| 444 | 5.75 | 72.43056 | 576 | `main/sysdolphin/baselib/particle` | `hsd_803975D4` | `src/sysdolphin/baselib/particle.c` | `no_db_target` |
| 445 | 5.63 | 77.01087 | 368 | `main/melee/gm/gm_1601` | `fn_80160DE8` | `src/melee/gm/gm_1601.c` | `queued:1` |
| 446 | 5.55 | 70.48193 | 664 | `main/melee/lb/lbrefract` | `lbRefract_PObjLoad` | `src/melee/lb/lbrefract.c` | `no_db_target` |
| 447 | 5.09 | 62.66559 | 1232 | `main/melee/ft/chara/ftCommon/ftCo_0A01` | `ftCo_800A75DC` | `src/melee/ft/chara/ftCommon/ftCo_0A01.c` | `no_db_target` |
| 448 | 5.04 | 75.84782 | 368 | `main/melee/mn/mnstagesw` | `mnStageSw_80235C58` | `src/melee/mn/mnstagesw.c` | `no_db_target` |
| 449 | 4.98 | 80.64912 | 228 | `main/melee/mn/mnnamenew` | `mnNameNew_8023DA08` | `src/melee/mn/mnnamenew.c` | `queued:1` |
| 450 | 4.78 | 79.06250 | 256 | `main/melee/mn/mnsoundtest` | `mnSoundTest_8024BEE0` | `src/melee/mn/mnsoundtest.c` | `no_db_target` |
| 451 | 4.73 | 67.75691 | 724 | `main/melee/ft/chara/ftCommon/ftCo_0A01` | `ftCo_800A866C` | `src/melee/ft/chara/ftCommon/ftCo_0A01.c` | `no_db_target` |
| 452 | 4.70 | 70.22222 | 576 | `main/melee/gm/gm_1601` | `fn_801695BC` | `src/melee/gm/gm_1601.c` | `queued:1` |
| 453 | 4.67 | 62.16216 | 1184 | `main/sysdolphin/baselib/texpdag` | `HSD_TExpMakeDag` | `src/sysdolphin/baselib/texpdag.c` | `no_db_target` |
| 454 | 4.63 | 79.74138 | 232 | `main/melee/gr/groldyoshi` | `grOldYoshi_8020F31C` | `src/melee/gr/groldyoshi.c` | `no_db_target` |
| 455 | 4.55 | 73.02778 | 432 | `main/sysdolphin/baselib/particle` | `hsd_803957C0` | `src/sysdolphin/baselib/particle.c` | `no_db_target` |
| 456 | 4.51 | 85.96551 | 116 | `main/melee/if/ifcoget` | `un_802FF4FC` | `src/melee/if/ifcoget.c` | `no_db_target` |
| 457 | 4.49 | 86.21429 | 112 | `main/melee/if/ifmagnify` | `ifMagnify_802FC750` | `src/melee/if/ifmagnify.c` | `no_db_target` |
| 458 | 4.40 | 79.22414 | 232 | `main/melee/gr/groldpupupu` | `grOldPupupu_8021119C` | `src/melee/gr/groldpupupu.c` | `no_db_target` |
| 459 | 4.30 | 74.26373 | 364 | `main/melee/gr/grflatzone` | `grFlatzone_80217EF0` | `src/melee/gr/grflatzone.c` | `no_db_target` |
| 460 | 4.17 | 73.92308 | 364 | `main/melee/ft/chara/ftKirby/ftkirbyspecialn` | `ftKb_SpecialHi_800F3570` | `src/melee/ft/chara/ftKirby/ftkirbyspecialn.c` | `no_db_target` |
| 461 | 4.14 | 76.97059 | 272 | `main/melee/gm/gmmain_lib` | `gmMainLib_8015F150` | `src/melee/gm/gmmain_lib.c` | `no_db_target` |
| 462 | 4.11 | 70.31200 | 500 | `main/melee/gm/gm_1601` | `gm_8016AC44` | `src/melee/gm/gm_1601.c` | `queued:1` |
| 463 | 4.01 | 69.10294 | 544 | `main/melee/gr/grpura` | `grPura_80212CD4` | `src/melee/gr/grpura.c` | `no_db_target` |
| 464 | 3.55 | 77.01724 | 232 | `main/melee/gr/grshrineroute` | `grShrineRoute_8020AF38` | `src/melee/gr/grshrineroute.c` | `no_db_target` |
| 465 | 3.37 | 72.87654 | 324 | `main/sysdolphin/baselib/particle` | `hsd_803921B8` | `src/sysdolphin/baselib/particle.c` | `no_db_target` |
| 466 | 3.23 | 68.75221 | 452 | `main/melee/gr/grgreens` | `grGreens_80216C20` | `src/melee/gr/grgreens.c` | `no_db_target` |
| 467 | 3.07 | 58.08127 | 1132 | `main/dolphin/thp/THPDec` | `THPDec_8032F8D4` | `extern/dolphin/src/dolphin/thp/THPDec.c` | `queued:1` |
| 468 | 2.71 | 62.73620 | 652 | `main/melee/gm/gmresultplayer` | `fn_8017AA78` | `src/melee/gm/gmresultplayer.c` | `no_db_target` |
| 469 | 2.67 | 63.26144 | 612 | `main/melee/ft/chara/ftCommon/ftCo_0A01` | `ftCo_800AEA8C` | `src/melee/ft/chara/ftCommon/ftCo_0A01.c` | `no_db_target` |
| 470 | 2.10 | 62.66929 | 508 | `main/sysdolphin/baselib/particle` | `hsd_80398A08` | `src/sysdolphin/baselib/particle.c` | `no_db_target` |
| 471 | 1.73 | 72.76190 | 168 | `main/melee/if/soundtest` | `un_802FF7DC` | `src/melee/if/soundtest.c` | `queued:1` |
| 472 | 1.49 | 81.25000 | 64 | `main/melee/gr/grzakogenerator` | `grZakoGenerator_801CAEB0` | `src/melee/gr/grzakogenerator.c` | `no_db_target` |
| 473 | 1.21 | 49.04887 | 1064 | `main/sysdolphin/baselib/synth` | `HSD_SynthSFXSampleLoadCallback` | `src/sysdolphin/baselib/synth.c` | `no_db_target` |
| 474 | 1.20 | 74.44000 | 100 | `main/melee/if/soundtest` | `un_80300AF4` | `src/melee/if/soundtest.c` | `no_db_target` |
| 475 | 1.10 | 50.86138 | 808 | `main/dolphin/thp/THPDec` | `THPVideoDecode` | `extern/dolphin/src/dolphin/thp/THPDec.c` | `queued:1` |
| 476 | 0.97 | 56.16822 | 428 | `main/melee/gr/grpura` | `grPura_802120E0` | `src/melee/gr/grpura.c` | `no_db_target` |
| 477 | 0.85 | 70.64000 | 100 | `main/melee/if/soundtest` | `un_80300B58` | `src/melee/if/soundtest.c` | `no_db_target` |
| 478 | 0.81 | 55.48421 | 380 | `main/melee/if/soundtest` | `un_802FF9DC` | `src/melee/if/soundtest.c` | `no_db_target` |
| 479 | 0.20 | 42.59302 | 344 | `main/dolphin/thp/THPDec` | `__THPReadScaneHeader` | `extern/dolphin/src/dolphin/thp/THPDec.c` | `queued:1` |
| 480 | 0.15 | 37.00000 | 520 | `main/dolphin/thp/THPDec` | `__THPReadFrameHeader` | `extern/dolphin/src/dolphin/thp/THPDec.c` | `queued:1` |
| 481 | 0.12 | 39.05128 | 312 | `main/melee/ft/chara/ftCommon/ftCo_Damage` | `ftCo_8008EB58` | `src/melee/ft/chara/ftCommon/ftCo_Damage.c` | `no_db_target` |
| 482 | 0.05 | 30.50000 | 400 | `main/melee/gr/grzebes` | `grZebes_801DA0C4` | `src/melee/gr/grzebes.c` | `no_db_target` |
| 483 | 0.03 | 26.92157 | 408 | `main/dolphin/thp/THPDec` | `__THPHuffGenerateSizeTable` | `extern/dolphin/src/dolphin/thp/THPDec.c` | `queued:1` |
| 484 | 0.01 | 22.94643 | 224 | `main/dolphin/thp/THPDec` | `__THPHuffGenerateCodeTable` | `extern/dolphin/src/dolphin/thp/THPDec.c` | `queued:1` |
| 485 | 0.00 | 10.60465 | 516 | `main/dolphin/thp/THPDec` | `THPInit` | `extern/dolphin/src/dolphin/thp/THPDec.c` | `queued:1` |
