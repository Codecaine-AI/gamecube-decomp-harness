# Current Unmatched Target Distribution

Generated: 2026-06-15
Source report: `projects/melee/checkout/build/GALE01/report.json`
Report timestamp: `2026-06-15 11:18:47 CDT`

Definition: an unmatched target is a function row that is not exact `100%`. `Fuzzy-equivalent code bytes` sums `function_size * fuzzy_match_percent`; unknown fuzzy rows are counted as zero fuzzy credit.

## Code Byte Progress

| Metric | Bytes | Percent of total code |
|---|---:|---:|
| Total code | 3,882,032 | 100.000% |
| Exact matched code | 2,936,684 | 75.648% |
| Fuzzy-equivalent code | 3,826,331 | 98.565% |
| Exact-match gap | 945,348 | 24.352% |
| Fuzzy-equivalent gap | 55,701 | 1.435% |
| Fuzzy credit inside non-exact code | 889,647 | 22.917% |

## Function Summary

| Metric | Count |
|---|---:|
| Total functions | 19,829 |
| Exact matched functions | 19,005 |
| Non-exact functions | 824 |
| Partial fuzzy rows | 823 |
| Fully unmatched 0% rows | 0 |
| Unknown-score non-exact rows | 1 |
| Files with non-exact targets | 159 |
| Non-exact code bytes | 945,348 |

## File Concentration

| File bucket | Files |
|---|---:|
| 20+ non-exact targets | 6 |
| 10-19 non-exact targets | 13 |
| 5-9 non-exact targets | 37 |
| 2-4 non-exact targets | 61 |
| 1 non-exact targets | 42 |

| File set | Targets | Target share | Non-exact bytes | Byte share | Fuzzy gap bytes | Fuzzy-gap share |
|---|---:|---:|---:|---:|---:|---:|
| Top 6 files | 190 | 23.1% | 177,412 | 18.8% | 11,237 | 20.2% |
| Top 10 files | 256 | 31.1% | 274,000 | 29.0% | 16,355 | 29.4% |
| Top 20 files | 370 | 44.9% | 434,912 | 46.0% | 27,319 | 49.0% |
| Top 40 files | 521 | 63.2% | 605,832 | 64.1% | 36,280 | 65.1% |
| Top 50 files | 577 | 70.0% | 658,336 | 69.6% | 38,794 | 69.6% |
| Remaining 109 files | 247 | 30.0% | 287,012 | 30.4% | 16,907 | 30.4% |

## Current Live-Tail Files

| Source file | Non-exact targets | Non-exact bytes | Fuzzy gap bytes | Min fuzzy |
|---|---:|---:|---:|---:|
| `src/melee/gm/gm_18A5.c` | 45 | 50,340 | 3,980 | 79.93% |
| `src/sysdolphin/baselib/particle.c` | 40 | 42,884 | 3,091 | 80.79% |
| `src/melee/mp/mplib.c` | 31 | 19,164 | 417 | 93.53% |
| `src/melee/gm/gm_1601.c` | 26 | 17,280 | 1,061 | 72.96% |
| `src/melee/ft/chara/ftCommon/ftCo_0A01.c` | 26 | 30,704 | 2,105 | 71.06% |
| `extern/dolphin/src/dolphin/thp/THPDec.c` | 7 | 15,980 | 460 | 88.43% |

## Top Directories

| Directory | Files | Non-exact targets | Non-exact bytes | Fuzzy gap bytes |
|---|---:|---:|---:|---:|
| `src/melee/gm` | 21 | 183 | 179,408 | 9,774 |
| `src/melee/gr` | 29 | 131 | 152,692 | 6,232 |
| `src/melee/mn` | 20 | 104 | 150,960 | 7,096 |
| `src/sysdolphin/baselib` | 15 | 95 | 138,340 | 18,357 |
| `src/melee/lb` | 14 | 48 | 44,168 | 2,179 |
| `src/melee/ft/chara/ftCommon` | 10 | 47 | 46,816 | 2,765 |
| `src/melee/ty` | 4 | 41 | 61,736 | 3,559 |
| `src/melee/mp` | 3 | 34 | 22,700 | 478 |
| `src/melee/if` | 9 | 31 | 23,892 | 1,641 |
| `src/melee/ft` | 9 | 28 | 34,052 | 1,405 |
| `src/melee/it/items` | 9 | 24 | 18,020 | 226 |
| `src/melee/ft/chara/ftKirby` | 3 | 17 | 8,740 | 660 |
| `src/melee/cm` | 1 | 15 | 12,220 | 469 |
| `src/melee/it` | 2 | 8 | 3,908 | 93 |
| `extern/dolphin/src/dolphin/thp` | 1 | 7 | 15,980 | 460 |
| `src/melee/vi` | 4 | 4 | 5,308 | 36 |
| `src/melee/ef` | 2 | 2 | 22,784 | 248 |
| `src/melee/pl` | 1 | 2 | 1,252 | 14 |
| `src/melee/ft/chara/ftNana` | 1 | 2 | 1,044 | 1 |
| `src/melee/ft/chara/ftYoshi` | 1 | 1 | 1,328 | 6 |

## Top Files By Target Count

| Rank | Source file | Targets | Partial | 0% | Unknown | Non-exact bytes | Avg fuzzy | Min fuzzy | Fuzzy gap bytes |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | `src/melee/gm/gm_18A5.c` | 45 | 45 | 0 | 0 | 50,340 | 92.09% | 79.93% | 3,980 |
| 2 | `src/sysdolphin/baselib/particle.c` | 40 | 40 | 0 | 0 | 42,884 | 92.79% | 80.79% | 3,091 |
| 3 | `src/melee/mp/mplib.c` | 31 | 31 | 0 | 0 | 19,164 | 97.83% | 93.53% | 417 |
| 4 | `src/melee/ft/chara/ftCommon/ftCo_0A01.c` | 26 | 26 | 0 | 0 | 30,704 | 93.14% | 71.06% | 2,105 |
| 5 | `src/melee/gm/gm_1601.c` | 26 | 26 | 0 | 0 | 17,280 | 93.86% | 72.96% | 1,061 |
| 6 | `src/melee/gm/gm_1832.c` | 22 | 22 | 0 | 0 | 17,040 | 96.57% | 90.78% | 584 |
| 7 | `src/melee/gm/gmregclear.c` | 18 | 18 | 0 | 0 | 15,064 | 97.14% | 92.73% | 431 |
| 8 | `src/melee/ty/toy.c` | 17 | 17 | 0 | 0 | 37,220 | 93.18% | 87.20% | 2,539 |
| 9 | `src/melee/gr/grbigblue.c` | 16 | 16 | 0 | 0 | 32,084 | 94.77% | 83.23% | 1,679 |
| 10 | `src/melee/cm/camera.c` | 15 | 15 | 0 | 0 | 12,220 | 96.16% | 91.46% | 469 |
| 11 | `src/sysdolphin/baselib/hsd_3AA7.c` | 14 | 14 | 0 | 0 | 28,064 | 84.81% | 73.77% | 4,262 |
| 12 | `src/melee/lb/lbaudio_ax.c` | 14 | 14 | 0 | 0 | 10,396 | 95.93% | 81.88% | 423 |
| 13 | `src/melee/ft/ftcoll.c` | 13 | 13 | 0 | 0 | 11,648 | 94.66% | 87.21% | 622 |
| 14 | `src/melee/mn/mnnamenew.c` | 13 | 13 | 0 | 0 | 11,016 | 95.10% | 87.25% | 540 |
| 15 | `src/melee/it/items/itlinkhookshot.c` | 11 | 11 | 0 | 0 | 9,288 | 98.48% | 94.42% | 141 |
| 16 | `src/melee/mn/mncharsel.c` | 10 | 10 | 0 | 0 | 39,256 | 92.08% | 86.91% | 3,109 |
| 17 | `src/melee/gr/grgreens.c` | 10 | 10 | 0 | 0 | 10,768 | 93.46% | 73.85% | 704 |
| 18 | `src/melee/ty/tydisplay.c` | 10 | 10 | 0 | 0 | 10,552 | 96.21% | 92.04% | 400 |
| 19 | `src/melee/gm/gmresult.c` | 10 | 10 | 0 | 0 | 9,596 | 96.21% | 85.63% | 364 |
| 20 | `src/melee/mn/mnsnap.c` | 9 | 9 | 0 | 0 | 20,328 | 98.04% | 92.48% | 399 |
| 21 | `src/sysdolphin/baselib/sislib.c` | 9 | 9 | 0 | 0 | 11,320 | 82.33% | 55.05% | 2,000 |
| 22 | `src/melee/gr/grcorneria.c` | 9 | 9 | 0 | 0 | 10,140 | 97.72% | 92.81% | 232 |
| 23 | `src/melee/gm/gm_16F1.c` | 8 | 8 | 0 | 0 | 10,100 | 98.14% | 95.09% | 188 |
| 24 | `src/melee/mn/mndiagram.c` | 8 | 8 | 0 | 0 | 10,100 | 98.53% | 96.11% | 148 |
| 25 | `src/melee/gr/grzebes.c` | 8 | 8 | 0 | 0 | 9,800 | 92.14% | 86.57% | 771 |
| 26 | `src/melee/gr/grvenom.c` | 8 | 8 | 0 | 0 | 9,312 | 97.55% | 92.10% | 228 |
| 27 | `src/melee/ty/tyfigupon.c` | 8 | 8 | 0 | 0 | 8,584 | 96.76% | 90.97% | 278 |
| 28 | `src/melee/mn/mnname.c` | 8 | 8 | 0 | 0 | 8,576 | 96.49% | 89.05% | 301 |
| 29 | `src/melee/gm/gm_1BA8.c` | 8 | 8 | 0 | 0 | 8,128 | 94.69% | 89.15% | 432 |
| 30 | `src/melee/ft/chara/ftKirby/ftkirbyspecialn.c` | 8 | 7 | 0 | 1 | 5,308 | 96.11% | 92.91% | 472 |
| 31 | `extern/dolphin/src/dolphin/thp/THPDec.c` | 7 | 7 | 0 | 0 | 15,980 | 97.12% | 88.43% | 460 |
| 32 | `src/sysdolphin/baselib/hsd_3B34.c` | 7 | 7 | 0 | 0 | 10,276 | 87.55% | 70.93% | 1,279 |
| 33 | `src/melee/if/ifstock.c` | 7 | 7 | 0 | 0 | 7,744 | 91.68% | 83.62% | 644 |
| 34 | `src/melee/gr/grkongo.c` | 7 | 7 | 0 | 0 | 7,644 | 95.58% | 81.22% | 338 |
| 35 | `src/melee/lb/lbbgflash.c` | 7 | 7 | 0 | 0 | 6,368 | 97.27% | 91.77% | 174 |
| 36 | `src/melee/gm/gmresultplayer.c` | 7 | 7 | 0 | 0 | 5,572 | 93.48% | 75.36% | 364 |
| 37 | `src/melee/gr/grinishie1.c` | 7 | 7 | 0 | 0 | 5,344 | 99.11% | 98.46% | 48 |
| 38 | `src/melee/mn/mndatadel.c` | 7 | 7 | 0 | 0 | 4,896 | 98.13% | 96.00% | 91 |
| 39 | `src/melee/it/itspawn.c` | 7 | 7 | 0 | 0 | 2,776 | 97.13% | 94.80% | 80 |
| 40 | `src/melee/ft/ftcpuattack.c` | 6 | 6 | 0 | 0 | 12,952 | 96.64% | 95.22% | 435 |
| 41 | `src/melee/mn/mnmainrule.c` | 6 | 6 | 0 | 0 | 6,624 | 90.31% | 84.21% | 642 |
| 42 | `src/melee/ty/tylist.c` | 6 | 6 | 0 | 0 | 5,380 | 93.64% | 76.84% | 342 |
| 43 | `src/melee/mn/mnstagesw.c` | 6 | 6 | 0 | 0 | 5,312 | 97.95% | 96.46% | 109 |
| 44 | `src/melee/gr/ground.c` | 6 | 6 | 0 | 0 | 4,052 | 94.39% | 77.33% | 227 |
| 45 | `src/melee/ft/chara/ftKirby/ftkirby.c` | 6 | 6 | 0 | 0 | 2,492 | 93.01% | 80.48% | 174 |
| 46 | `src/melee/gm/gmcamera.c` | 6 | 6 | 0 | 0 | 2,340 | 95.97% | 93.57% | 94 |
| 47 | `src/sysdolphin/baselib/texpdag.c` | 5 | 5 | 0 | 0 | 7,572 | 94.64% | 82.04% | 406 |
| 48 | `src/melee/gm/gmtou.c` | 5 | 5 | 0 | 0 | 7,532 | 96.69% | 91.78% | 249 |
| 49 | `src/melee/mn/mnitemsw.c` | 5 | 5 | 0 | 0 | 6,280 | 98.92% | 96.70% | 68 |
| 50 | `src/melee/gr/gricemt.c` | 5 | 5 | 0 | 0 | 4,920 | 95.90% | 87.89% | 202 |
| 51 | `src/melee/gr/grcastle.c` | 5 | 5 | 0 | 0 | 4,724 | 97.48% | 95.67% | 119 |
| 52 | `src/sysdolphin/baselib/synth.c` | 5 | 5 | 0 | 0 | 4,668 | 96.66% | 92.83% | 156 |
| 53 | `src/melee/if/textlib.c` | 5 | 5 | 0 | 0 | 3,196 | 98.04% | 93.04% | 63 |
| 54 | `src/melee/mn/mninfo.c` | 5 | 5 | 0 | 0 | 2,584 | 93.39% | 91.44% | 171 |
| 55 | `src/melee/ft/chara/ftCommon/ftCo_Attack100.c` | 5 | 5 | 0 | 0 | 2,552 | 96.56% | 86.93% | 88 |
| 56 | `src/melee/if/if_2F72.c` | 5 | 5 | 0 | 0 | 1,456 | 96.35% | 93.71% | 53 |
| 57 | `src/melee/lb/lb_00F9.c` | 4 | 4 | 0 | 0 | 8,908 | 92.30% | 84.95% | 686 |
| 58 | `src/melee/gm/gmmain_lib.c` | 4 | 4 | 0 | 0 | 5,632 | 81.87% | 77.30% | 1,021 |
| 59 | `src/melee/gr/grmutecity.c` | 4 | 4 | 0 | 0 | 5,452 | 98.46% | 95.42% | 84 |
| 60 | `src/sysdolphin/baselib/hsd_3B5C.c` | 4 | 4 | 0 | 0 | 5,008 | 86.62% | 79.93% | 670 |
| 61 | `src/melee/if/ifstatus.c` | 4 | 4 | 0 | 0 | 4,920 | 87.98% | 82.99% | 591 |
| 62 | `src/melee/gr/gronett.c` | 4 | 4 | 0 | 0 | 4,476 | 98.07% | 96.15% | 86 |
| 63 | `src/melee/mn/mndiagram2.c` | 4 | 4 | 0 | 0 | 4,200 | 98.43% | 97.47% | 66 |
| 64 | `src/melee/gm/gm_1A4C.c` | 4 | 4 | 0 | 0 | 3,988 | 99.25% | 98.87% | 30 |
| 65 | `src/melee/if/ifmagnify.c` | 4 | 4 | 0 | 0 | 3,524 | 98.09% | 90.54% | 67 |
| 66 | `src/melee/gm/gmallstar.c` | 4 | 4 | 0 | 0 | 3,180 | 89.30% | 84.53% | 340 |
| 67 | `src/melee/gr/grkinokoroute.c` | 4 | 4 | 0 | 0 | 3,164 | 98.90% | 91.15% | 35 |
| 68 | `src/melee/it/items/itsamusgrapple.c` | 4 | 4 | 0 | 0 | 3,048 | 98.54% | 97.15% | 45 |
| 69 | `src/melee/lb/lbmthp.c` | 4 | 4 | 0 | 0 | 1,600 | 97.86% | 96.95% | 34 |
| 70 | `src/melee/gm/gmstaffroll.c` | 3 | 3 | 0 | 0 | 8,384 | 97.74% | 96.54% | 190 |
| 71 | `src/melee/gr/grhomerun.c` | 3 | 3 | 0 | 0 | 6,172 | 92.70% | 89.33% | 451 |
| 72 | `src/melee/lb/lbcollision.c` | 3 | 3 | 0 | 0 | 5,900 | 92.75% | 89.51% | 428 |
| 73 | `src/melee/gm/gm_19EF.c` | 3 | 3 | 0 | 0 | 5,744 | 98.84% | 98.55% | 67 |
| 74 | `src/melee/mn/mndiagram3.c` | 3 | 3 | 0 | 0 | 5,396 | 97.43% | 95.42% | 139 |
| 75 | `src/melee/ft/chara/ftCommon/ftCo_Damage.c` | 3 | 3 | 0 | 0 | 5,028 | 94.67% | 93.08% | 268 |
| 76 | `src/melee/mn/mnvibration.c` | 3 | 3 | 0 | 0 | 4,768 | 95.98% | 94.29% | 192 |
| 77 | `src/melee/gr/grpstadium.c` | 3 | 3 | 0 | 0 | 4,128 | 97.62% | 91.23% | 98 |
| 78 | `src/melee/mn/mnevent.c` | 3 | 3 | 0 | 0 | 4,072 | 91.84% | 89.48% | 332 |
| 79 | `src/melee/mn/mnruleplus.c` | 3 | 3 | 0 | 0 | 3,848 | 87.42% | 85.18% | 484 |
| 80 | `src/melee/mn/mnsound.c` | 3 | 3 | 0 | 0 | 3,536 | 98.35% | 93.48% | 58 |
| 81 | `src/melee/gr/grshrineroute.c` | 3 | 3 | 0 | 0 | 3,140 | 97.19% | 89.12% | 88 |
| 82 | `src/melee/gm/gmclassic.c` | 3 | 3 | 0 | 0 | 3,108 | 91.02% | 87.80% | 279 |
| 83 | `src/melee/gr/grpura.c` | 3 | 3 | 0 | 0 | 2,828 | 97.86% | 90.58% | 61 |
| 84 | `src/melee/gr/grrcruise.c` | 3 | 3 | 0 | 0 | 2,716 | 96.15% | 91.43% | 105 |
| 85 | `src/melee/lb/lbdvd.c` | 3 | 3 | 0 | 0 | 2,484 | 99.09% | 98.74% | 23 |
| 86 | `src/melee/gr/grflatzone.c` | 3 | 3 | 0 | 0 | 2,264 | 98.81% | 95.63% | 27 |
| 87 | `src/melee/ft/ftdynamics.c` | 3 | 3 | 0 | 0 | 2,248 | 99.23% | 97.47% | 17 |
| 88 | `src/melee/gr/granime.c` | 3 | 3 | 0 | 0 | 2,200 | 98.71% | 98.50% | 28 |
| 89 | `src/melee/gm/gm_16AE.c` | 3 | 3 | 0 | 0 | 2,060 | 98.78% | 97.19% | 25 |
| 90 | `src/melee/gr/gryorster.c` | 3 | 3 | 0 | 0 | 1,852 | 96.89% | 87.45% | 58 |
| 91 | `src/melee/lb/lbrefract.c` | 3 | 3 | 0 | 0 | 1,724 | 93.62% | 86.86% | 110 |
| 92 | `src/melee/ft/chara/ftCommon/ftCo_DownBound.c` | 3 | 3 | 0 | 0 | 1,572 | 98.61% | 96.30% | 22 |
| 93 | `src/melee/mn/mncount.c` | 3 | 3 | 0 | 0 | 1,468 | 95.69% | 91.24% | 63 |
| 94 | `src/melee/if/soundtest.c` | 3 | 3 | 0 | 0 | 1,168 | 82.75% | 57.33% | 201 |
| 95 | `src/melee/ft/chara/ftKirby/ftkirbyspecialmars.c` | 3 | 3 | 0 | 0 | 940 | 98.49% | 98.05% | 14 |
| 96 | `src/melee/gr/grzakogenerator.c` | 3 | 3 | 0 | 0 | 488 | 91.17% | 81.25% | 43 |
| 97 | `src/melee/gr/grbigblueroute.c` | 2 | 2 | 0 | 0 | 4,672 | 96.91% | 92.12% | 144 |
| 98 | `src/melee/gr/groldpupupu.c` | 2 | 2 | 0 | 0 | 3,112 | 94.77% | 92.47% | 163 |
| 99 | `src/melee/mn/mnmain.c` | 2 | 2 | 0 | 0 | 2,608 | 98.14% | 97.73% | 48 |
| 100 | `src/sysdolphin/baselib/axdriver.c` | 2 | 2 | 0 | 0 | 2,532 | 94.98% | 82.63% | 127 |
| 101 | `src/melee/lb/lbshadow.c` | 2 | 2 | 0 | 0 | 2,512 | 98.53% | 96.03% | 37 |
| 102 | `src/melee/mn/mnsoundtest.c` | 2 | 2 | 0 | 0 | 2,324 | 95.10% | 91.59% | 114 |
| 103 | `src/melee/gr/grpushon.c` | 2 | 2 | 0 | 0 | 1,916 | 99.51% | 99.43% | 9 |
| 104 | `src/melee/mp/mpisland.c` | 2 | 2 | 0 | 0 | 1,884 | 98.03% | 96.53% | 37 |
| 105 | `src/melee/ft/chara/ftCommon/ftCo_DamageIce.c` | 2 | 2 | 0 | 0 | 1,812 | 98.15% | 97.43% | 34 |
| 106 | `src/melee/it/items/itlinkboomerang.c` | 2 | 2 | 0 | 0 | 1,440 | 99.86% | 99.80% | 2 |
| 107 | `src/melee/pl/pltrick.c` | 2 | 2 | 0 | 0 | 1,252 | 98.89% | 96.77% | 14 |
| 108 | `src/melee/ft/chara/ftCommon/ftCo_Guard.c` | 2 | 2 | 0 | 0 | 1,216 | 92.01% | 80.52% | 97 |
| 109 | `src/sysdolphin/baselib/cobj.c` | 2 | 2 | 0 | 0 | 1,208 | 99.87% | 99.76% | 2 |
| 110 | `src/melee/ft/chara/ftNana/ftNn_Init.c` | 2 | 2 | 0 | 0 | 1,044 | 99.89% | 99.88% | 1 |
| 111 | `src/melee/gr/grgreatbay.c` | 2 | 2 | 0 | 0 | 944 | 97.58% | 96.72% | 23 |
| 112 | `src/melee/it/items/itflipper.c` | 2 | 2 | 0 | 0 | 896 | 99.23% | 99.22% | 7 |
| 113 | `src/melee/ft/chara/ftCommon/ftCo_ItemThrow.c` | 2 | 2 | 0 | 0 | 840 | 92.78% | 90.37% | 61 |
| 114 | `src/sysdolphin/baselib/hsd_3B2E.c` | 2 | 2 | 0 | 0 | 788 | 90.72% | 89.95% | 73 |
| 115 | `src/melee/lb/lbmemory.c` | 2 | 2 | 0 | 0 | 708 | 97.45% | 96.11% | 18 |
| 116 | `src/melee/ft/chara/ftCommon/ftCo_Bury.c` | 2 | 2 | 0 | 0 | 636 | 94.48% | 93.67% | 35 |
| 117 | `src/melee/lb/lbarq.c` | 2 | 2 | 0 | 0 | 616 | 97.37% | 96.94% | 16 |
| 118 | `src/melee/ef/efasync.c` | 1 | 1 | 0 | 0 | 14,700 | 98.93% | 98.93% | 157 |
| 119 | `src/sysdolphin/baselib/psdisp.c` | 1 | 1 | 0 | 0 | 14,488 | 58.43% | 58.43% | 6,022 |
| 120 | `src/melee/ef/efsync.c` | 1 | 1 | 0 | 0 | 8,084 | 98.88% | 98.88% | 91 |
| 121 | `src/sysdolphin/baselib/hsd_3A94.c` | 1 | 1 | 0 | 0 | 4,852 | 95.18% | 95.18% | 234 |
| 122 | `src/melee/mn/mnstagesel.c` | 1 | 1 | 0 | 0 | 3,768 | 99.43% | 99.43% | 22 |
| 123 | `src/sysdolphin/baselib/sobjlib.c` | 1 | 1 | 0 | 0 | 2,692 | 99.89% | 99.89% | 3 |
| 124 | `src/melee/ft/ftafterimage.c` | 1 | 1 | 0 | 0 | 2,520 | 88.99% | 88.99% | 278 |
| 125 | `src/melee/gm/gmregtyfall.c` | 1 | 1 | 0 | 0 | 2,404 | 99.03% | 99.03% | 23 |
| 126 | `src/melee/ft/chara/ftCommon/ftCo_09F7.c` | 1 | 1 | 0 | 0 | 2,148 | 97.43% | 97.43% | 55 |
| 127 | `src/melee/gr/groldkongo.c` | 1 | 1 | 0 | 0 | 2,000 | 98.58% | 98.58% | 28 |
| 128 | `src/melee/vi/vi1201v1.c` | 1 | 1 | 0 | 0 | 1,912 | 99.39% | 99.39% | 12 |
| 129 | `src/melee/ft/ft_0892.c` | 1 | 1 | 0 | 0 | 1,712 | 98.98% | 98.98% | 17 |
| 130 | `src/melee/vi/vi1201v2.c` | 1 | 1 | 0 | 0 | 1,708 | 99.62% | 99.62% | 7 |
| 131 | `src/melee/mp/mpcoll.c` | 1 | 1 | 0 | 0 | 1,652 | 98.52% | 98.52% | 24 |
| 132 | `src/melee/gr/grfourside.c` | 1 | 1 | 0 | 0 | 1,412 | 90.02% | 90.02% | 141 |
| 133 | `src/melee/ft/chara/ftYoshi/ftYs_SpecialS.c` | 1 | 1 | 0 | 0 | 1,328 | 99.58% | 99.58% | 6 |
| 134 | `src/melee/it/items/itkusudama.c` | 1 | 1 | 0 | 0 | 1,324 | 99.37% | 99.37% | 8 |
| 135 | `src/melee/lb/lbcardnew.c` | 1 | 1 | 0 | 0 | 1,224 | 98.77% | 98.77% | 15 |
| 136 | `src/melee/ft/ft_0CDD.c` | 1 | 1 | 0 | 0 | 1,184 | 99.93% | 99.93% | 1 |
| 137 | `src/melee/it/itcoll.c` | 1 | 1 | 0 | 0 | 1,132 | 98.80% | 98.80% | 14 |
| 138 | `src/sysdolphin/baselib/texp.c` | 1 | 1 | 0 | 0 | 1,120 | 98.30% | 98.30% | 19 |
| 139 | `src/melee/vi/vi0401.c` | 1 | 1 | 0 | 0 | 1,040 | 98.69% | 98.69% | 14 |
| 140 | `src/melee/gr/grmaterial.c` | 1 | 1 | 0 | 0 | 968 | 98.55% | 98.55% | 14 |
| 141 | `src/melee/it/items/itarwinglaser.c` | 1 | 1 | 0 | 0 | 884 | 98.96% | 98.96% | 9 |
| 142 | `src/sysdolphin/baselib/leak.c` | 1 | 1 | 0 | 0 | 868 | 98.36% | 98.36% | 14 |
| 143 | `src/melee/if/textdraw.c` | 1 | 1 | 0 | 0 | 844 | 99.76% | 99.76% | 2 |
| 144 | `src/melee/if/ifprize.c` | 1 | 1 | 0 | 0 | 712 | 99.94% | 99.94% | 0 |
| 145 | `src/melee/lb/lbheap.c` | 1 | 1 | 0 | 0 | 696 | 96.48% | 96.48% | 25 |
| 146 | `src/melee/ft/ftmetal.c` | 1 | 1 | 0 | 0 | 660 | 96.82% | 96.82% | 21 |
| 147 | `src/melee/gm/gm_1B03.c` | 1 | 1 | 0 | 0 | 660 | 98.73% | 98.73% | 8 |
| 148 | `src/melee/vi/vi0501.c` | 1 | 1 | 0 | 0 | 648 | 99.31% | 99.31% | 4 |
| 149 | `src/melee/gm/gm_1BFA.c` | 1 | 1 | 0 | 0 | 640 | 95.34% | 95.34% | 30 |
| 150 | `src/melee/ft/ftmaterial.c` | 1 | 1 | 0 | 0 | 636 | 99.96% | 99.96% | 0 |
| 151 | `src/melee/gm/gm_1A3F.c` | 1 | 1 | 0 | 0 | 616 | 97.86% | 97.86% | 13 |
| 152 | `src/melee/lb/lb_0192.c` | 1 | 1 | 0 | 0 | 600 | 99.60% | 99.60% | 2 |
| 153 | `src/melee/ft/ft_0852.c` | 1 | 1 | 0 | 0 | 492 | 97.36% | 97.36% | 13 |
| 154 | `src/melee/it/items/itkyasarin.c` | 1 | 1 | 0 | 0 | 476 | 97.86% | 97.86% | 10 |
| 155 | `src/melee/it/items/itpikachuthunder.c` | 1 | 1 | 0 | 0 | 464 | 99.35% | 99.35% | 3 |
| 156 | `src/melee/lb/lbsnap.c` | 1 | 1 | 0 | 0 | 432 | 56.32% | 56.32% | 189 |
| 157 | `src/melee/if/ifcoget.c` | 1 | 1 | 0 | 0 | 328 | 94.33% | 94.33% | 19 |
| 158 | `src/melee/ft/chara/ftCommon/ftCo_WarpStar.c` | 1 | 1 | 0 | 0 | 308 | 99.87% | 99.87% | 0 |
| 159 | `src/melee/it/items/itlinkbomb.c` | 1 | 1 | 0 | 0 | 200 | 99.60% | 99.60% | 1 |

## Top Files By Fuzzy Gap

| Rank | Source file | Fuzzy gap bytes | Targets | Non-exact bytes | Avg fuzzy | Min fuzzy |
|---:|---|---:|---:|---:|---:|---:|
| 1 | `src/sysdolphin/baselib/psdisp.c` | 6,022 | 1 | 14,488 | 58.43% | 58.43% |
| 2 | `src/sysdolphin/baselib/hsd_3AA7.c` | 4,262 | 14 | 28,064 | 84.81% | 73.77% |
| 3 | `src/melee/gm/gm_18A5.c` | 3,980 | 45 | 50,340 | 92.09% | 79.93% |
| 4 | `src/melee/mn/mncharsel.c` | 3,109 | 10 | 39,256 | 92.08% | 86.91% |
| 5 | `src/sysdolphin/baselib/particle.c` | 3,091 | 40 | 42,884 | 92.79% | 80.79% |
| 6 | `src/melee/ty/toy.c` | 2,539 | 17 | 37,220 | 93.18% | 87.20% |
| 7 | `src/melee/ft/chara/ftCommon/ftCo_0A01.c` | 2,105 | 26 | 30,704 | 93.14% | 71.06% |
| 8 | `src/sysdolphin/baselib/sislib.c` | 2,000 | 9 | 11,320 | 82.33% | 55.05% |
| 9 | `src/melee/gr/grbigblue.c` | 1,679 | 16 | 32,084 | 94.77% | 83.23% |
| 10 | `src/sysdolphin/baselib/hsd_3B34.c` | 1,279 | 7 | 10,276 | 87.55% | 70.93% |
| 11 | `src/melee/gm/gm_1601.c` | 1,061 | 26 | 17,280 | 93.86% | 72.96% |
| 12 | `src/melee/gm/gmmain_lib.c` | 1,021 | 4 | 5,632 | 81.87% | 77.30% |
| 13 | `src/melee/gr/grzebes.c` | 771 | 8 | 9,800 | 92.14% | 86.57% |
| 14 | `src/melee/gr/grgreens.c` | 704 | 10 | 10,768 | 93.46% | 73.85% |
| 15 | `src/melee/lb/lb_00F9.c` | 686 | 4 | 8,908 | 92.30% | 84.95% |
| 16 | `src/sysdolphin/baselib/hsd_3B5C.c` | 670 | 4 | 5,008 | 86.62% | 79.93% |
| 17 | `src/melee/if/ifstock.c` | 644 | 7 | 7,744 | 91.68% | 83.62% |
| 18 | `src/melee/mn/mnmainrule.c` | 642 | 6 | 6,624 | 90.31% | 84.21% |
| 19 | `src/melee/ft/ftcoll.c` | 622 | 13 | 11,648 | 94.66% | 87.21% |
| 20 | `src/melee/if/ifstatus.c` | 591 | 4 | 4,920 | 87.98% | 82.99% |
| 21 | `src/melee/gm/gm_1832.c` | 584 | 22 | 17,040 | 96.57% | 90.78% |
| 22 | `src/melee/mn/mnnamenew.c` | 540 | 13 | 11,016 | 95.10% | 87.25% |
| 23 | `src/melee/mn/mnruleplus.c` | 484 | 3 | 3,848 | 87.42% | 85.18% |
| 24 | `src/melee/ft/chara/ftKirby/ftkirbyspecialn.c` | 472 | 8 | 5,308 | 96.11% | 92.91% |
| 25 | `src/melee/cm/camera.c` | 469 | 15 | 12,220 | 96.16% | 91.46% |
| 26 | `extern/dolphin/src/dolphin/thp/THPDec.c` | 460 | 7 | 15,980 | 97.12% | 88.43% |
| 27 | `src/melee/gr/grhomerun.c` | 451 | 3 | 6,172 | 92.70% | 89.33% |
| 28 | `src/melee/ft/ftcpuattack.c` | 435 | 6 | 12,952 | 96.64% | 95.22% |
| 29 | `src/melee/gm/gm_1BA8.c` | 432 | 8 | 8,128 | 94.69% | 89.15% |
| 30 | `src/melee/gm/gmregclear.c` | 431 | 18 | 15,064 | 97.14% | 92.73% |
| 31 | `src/melee/lb/lbcollision.c` | 428 | 3 | 5,900 | 92.75% | 89.51% |
| 32 | `src/melee/lb/lbaudio_ax.c` | 423 | 14 | 10,396 | 95.93% | 81.88% |
| 33 | `src/melee/mp/mplib.c` | 417 | 31 | 19,164 | 97.83% | 93.53% |
| 34 | `src/sysdolphin/baselib/texpdag.c` | 406 | 5 | 7,572 | 94.64% | 82.04% |
| 35 | `src/melee/ty/tydisplay.c` | 400 | 10 | 10,552 | 96.21% | 92.04% |
| 36 | `src/melee/mn/mnsnap.c` | 399 | 9 | 20,328 | 98.04% | 92.48% |
| 37 | `src/melee/gm/gmresult.c` | 364 | 10 | 9,596 | 96.21% | 85.63% |
| 38 | `src/melee/gm/gmresultplayer.c` | 364 | 7 | 5,572 | 93.48% | 75.36% |
| 39 | `src/melee/ty/tylist.c` | 342 | 6 | 5,380 | 93.64% | 76.84% |
| 40 | `src/melee/gm/gmallstar.c` | 340 | 4 | 3,180 | 89.30% | 84.53% |
| 41 | `src/melee/gr/grkongo.c` | 338 | 7 | 7,644 | 95.58% | 81.22% |
| 42 | `src/melee/mn/mnevent.c` | 332 | 3 | 4,072 | 91.84% | 89.48% |
| 43 | `src/melee/mn/mnname.c` | 301 | 8 | 8,576 | 96.49% | 89.05% |
| 44 | `src/melee/gm/gmclassic.c` | 279 | 3 | 3,108 | 91.02% | 87.80% |
| 45 | `src/melee/ty/tyfigupon.c` | 278 | 8 | 8,584 | 96.76% | 90.97% |
| 46 | `src/melee/ft/ftafterimage.c` | 278 | 1 | 2,520 | 88.99% | 88.99% |
| 47 | `src/melee/ft/chara/ftCommon/ftCo_Damage.c` | 268 | 3 | 5,028 | 94.67% | 93.08% |
| 48 | `src/melee/gm/gmtou.c` | 249 | 5 | 7,532 | 96.69% | 91.78% |
| 49 | `src/sysdolphin/baselib/hsd_3A94.c` | 234 | 1 | 4,852 | 95.18% | 95.18% |
| 50 | `src/melee/gr/grcorneria.c` | 232 | 9 | 10,140 | 97.72% | 92.81% |

## How This Was Computed

This report was generated from `projects/melee/checkout/build/GALE01/report.json`, using the report file timestamp shown at the top. Each row under `units[].functions[]` was treated as one function/target. The file grouping came from the owning unit's `metadata.source_path`.

Exact matched code uses objdiff's aggregate `measures.matched_code` and `measures.matched_code_percent`. A function only contributes exact matched code when its `fuzzy_match_percent` is exactly `100`; otherwise its full byte size remains in the exact-match gap.

Fuzzy-equivalent code bytes were computed per function as:

```text
function_size * (fuzzy_match_percent / 100)
```

Then those fuzzy-equivalent bytes were summed across all functions. The fuzzy-equivalent gap was computed as:

```text
total_code_bytes - summed_fuzzy_equivalent_code_bytes
```

So the `55,701` fuzzy-equivalent byte gap is a similarity-weighted gap, not a literal count of source bytes left to write. It means the remaining non-exact functions collectively differ from exact output by about that many byte-equivalents according to objdiff fuzzy scoring, while the exact-match gap remains `945,348` bytes because every non-100% function still receives zero exact-match credit.

Rows with no usable `fuzzy_match_percent` were counted as non-exact unknown-score rows and given zero fuzzy credit for the fuzzy-equivalent calculation.
