.include "macros.inc"
.file "ftCo_ItemParasolDamageFall.c"

# 0x800CF4DC..0x800CF594 | size: 0xB8
.text
.balign 4

# .text:0x0 | 0x800CF4DC | size: 0x4C
.fn ftCo_800CF4DC, global
/* 800CF4DC 000CC0BC  7C 08 02 A6 */	mflr r0
/* 800CF4E0 000CC0C0  38 80 00 93 */	li r4, 0x93
/* 800CF4E4 000CC0C4  90 01 00 04 */	stw r0, 0x4(r1)
/* 800CF4E8 000CC0C8  38 A0 00 01 */	li r5, 0x1
/* 800CF4EC 000CC0CC  38 C0 00 00 */	li r6, 0x0
/* 800CF4F0 000CC0D0  94 21 FF E8 */	stwu r1, -0x18(r1)
/* 800CF4F4 000CC0D4  93 E1 00 14 */	stw r31, 0x14(r1)
/* 800CF4F8 000CC0D8  C0 22 95 78 */	lfs f1, "@183"@sda21(r0)
/* 800CF4FC 000CC0DC  83 E3 00 2C */	lwz r31, 0x2c(r3)
/* 800CF500 000CC0E0  FC 60 08 90 */	fmr f3, f1
/* 800CF504 000CC0E4  C0 42 95 7C */	lfs f2, "@184"@sda21(r0)
/* 800CF508 000CC0E8  4B F9 9E A5 */	bl Fighter_ChangeMotionState
/* 800CF50C 000CC0EC  7F E3 FB 78 */	mr r3, r31
/* 800CF510 000CC0F0  4B FA DF 59 */	bl ftCommon_ClampAirDrift
/* 800CF514 000CC0F4  80 01 00 1C */	lwz r0, 0x1c(r1)
/* 800CF518 000CC0F8  83 E1 00 14 */	lwz r31, 0x14(r1)
/* 800CF51C 000CC0FC  38 21 00 18 */	addi r1, r1, 0x18
/* 800CF520 000CC100  7C 08 03 A6 */	mtlr r0
/* 800CF524 000CC104  4E 80 00 20 */	blr
.endfn ftCo_800CF4DC

# .text:0x4C | 0x800CF528 | size: 0x4
.fn ftCo_ItemParasolDamageFall_Anim, global
/* 800CF528 000CC108  4E 80 00 20 */	blr
.endfn ftCo_ItemParasolDamageFall_Anim

# .text:0x50 | 0x800CF52C | size: 0x20
.fn ftCo_ItemParasolDamageFall_IASA, global
/* 800CF52C 000CC10C  7C 08 02 A6 */	mflr r0
/* 800CF530 000CC110  90 01 00 04 */	stw r0, 0x4(r1)
/* 800CF534 000CC114  94 21 FF F8 */	stwu r1, -0x8(r1)
/* 800CF538 000CC118  4B FC 12 F1 */	bl ftCo_DamageFall_IASA
/* 800CF53C 000CC11C  80 01 00 0C */	lwz r0, 0xc(r1)
/* 800CF540 000CC120  38 21 00 08 */	addi r1, r1, 0x8
/* 800CF544 000CC124  7C 08 03 A6 */	mtlr r0
/* 800CF548 000CC128  4E 80 00 20 */	blr
.endfn ftCo_ItemParasolDamageFall_IASA

# .text:0x70 | 0x800CF54C | size: 0x20
.fn ftCo_ItemParasolDamageFall_Phys, global
/* 800CF54C 000CC12C  7C 08 02 A6 */	mflr r0
/* 800CF550 000CC130  90 01 00 04 */	stw r0, 0x4(r1)
/* 800CF554 000CC134  94 21 FF F8 */	stwu r1, -0x8(r1)
/* 800CF558 000CC138  4B FB 58 59 */	bl ft_80084DB0
/* 800CF55C 000CC13C  80 01 00 0C */	lwz r0, 0xc(r1)
/* 800CF560 000CC140  38 21 00 08 */	addi r1, r1, 0x8
/* 800CF564 000CC144  7C 08 03 A6 */	mtlr r0
/* 800CF568 000CC148  4E 80 00 20 */	blr
.endfn ftCo_ItemParasolDamageFall_Phys

# .text:0x90 | 0x800CF56C | size: 0x28
.fn ftCo_ItemParasolDamageFall_Coll, global
/* 800CF56C 000CC14C  7C 08 02 A6 */	mflr r0
/* 800CF570 000CC150  3C 80 80 09 */	lis r4, ftCo_80090984@ha
/* 800CF574 000CC154  90 01 00 04 */	stw r0, 0x4(r1)
/* 800CF578 000CC158  38 84 09 84 */	addi r4, r4, ftCo_80090984@l
/* 800CF57C 000CC15C  94 21 FF F8 */	stwu r1, -0x8(r1)
/* 800CF580 000CC160  4B FB 41 8D */	bl ft_8008370C
/* 800CF584 000CC164  80 01 00 0C */	lwz r0, 0xc(r1)
/* 800CF588 000CC168  38 21 00 08 */	addi r1, r1, 0x8
/* 800CF58C 000CC16C  7C 08 03 A6 */	mtlr r0
/* 800CF590 000CC170  4E 80 00 20 */	blr
.endfn ftCo_ItemParasolDamageFall_Coll

# 0x804D8F58..0x804D8F60 | size: 0x8
.section .sdata2, "a"
.balign 8

# .sdata2:0x0 | 0x804D8F58 | size: 0x4
.obj "@183", local
	.float 0
.endobj "@183"

# .sdata2:0x4 | 0x804D8F5C | size: 0x4
.obj "@184", local
	.float 1
.endobj "@184"
