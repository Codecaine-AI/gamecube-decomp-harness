.include "macros.inc"
.file "ftCo_HammerLanding.c"

# 0x800C5F88..0x800C60C8 | size: 0x140
.text
.balign 4

# .text:0x0 | 0x800C5F88 | size: 0x98
.fn ftCo_HammerLanding_Enter, global
/* 800C5F88 000C2B68  7C 08 02 A6 */	mflr r0
/* 800C5F8C 000C2B6C  90 01 00 04 */	stw r0, 0x4(r1)
/* 800C5F90 000C2B70  3C 00 43 30 */	lis r0, 0x4330
/* 800C5F94 000C2B74  94 21 FF D8 */	stwu r1, -0x28(r1)
/* 800C5F98 000C2B78  93 E1 00 24 */	stw r31, 0x24(r1)
/* 800C5F9C 000C2B7C  93 C1 00 20 */	stw r30, 0x20(r1)
/* 800C5FA0 000C2B80  93 A1 00 1C */	stw r29, 0x1c(r1)
/* 800C5FA4 000C2B84  7C 7D 1B 78 */	mr r29, r3
/* 800C5FA8 000C2B88  80 8D AE B4 */	lwz r4, p_ftCommonData@sda21(r0)
/* 800C5FAC 000C2B8C  83 C3 00 2C */	lwz r30, 0x2c(r3)
/* 800C5FB0 000C2B90  80 84 06 B4 */	lwz r4, 0x6b4(r4)
/* 800C5FB4 000C2B94  C8 22 93 C8 */	lfd f1, "@232"@sda21(r0)
/* 800C5FB8 000C2B98  38 7E 00 00 */	addi r3, r30, 0x0
/* 800C5FBC 000C2B9C  6C 84 80 00 */	xoris r4, r4, 0x8000
/* 800C5FC0 000C2BA0  90 81 00 14 */	stw r4, 0x14(r1)
/* 800C5FC4 000C2BA4  90 01 00 10 */	stw r0, 0x10(r1)
/* 800C5FC8 000C2BA8  C8 01 00 10 */	lfd f0, 0x10(r1)
/* 800C5FCC 000C2BAC  EC 00 08 28 */	fsubs f0, f0, f1
/* 800C5FD0 000C2BB0  D0 1E 23 44 */	stfs f0, 0x2344(r30)
/* 800C5FD4 000C2BB4  4B FF F4 F1 */	bl ftCo_800C54C4
/* 800C5FD8 000C2BB8  3B E3 00 00 */	addi r31, r3, 0x0
/* 800C5FDC 000C2BBC  38 7E 00 00 */	addi r3, r30, 0x0
/* 800C5FE0 000C2BC0  4B FF F4 AD */	bl ftCo_800C548C
/* 800C5FE4 000C2BC4  C0 42 93 C0 */	lfs f2, "@230"@sda21(r0)
/* 800C5FE8 000C2BC8  38 7D 00 00 */	addi r3, r29, 0x0
/* 800C5FEC 000C2BCC  38 DF 00 00 */	addi r6, r31, 0x0
/* 800C5FF0 000C2BD0  38 80 01 39 */	li r4, 0x139
/* 800C5FF4 000C2BD4  38 A0 00 01 */	li r5, 0x1
/* 800C5FF8 000C2BD8  48 00 FA F5 */	bl ftCo_Landing_Enter
/* 800C5FFC 000C2BDC  7F C3 F3 78 */	mr r3, r30
/* 800C6000 000C2BE0  4B FF EE 95 */	bl ftCo_800C4E94
/* 800C6004 000C2BE4  80 01 00 2C */	lwz r0, 0x2c(r1)
/* 800C6008 000C2BE8  83 E1 00 24 */	lwz r31, 0x24(r1)
/* 800C600C 000C2BEC  83 C1 00 20 */	lwz r30, 0x20(r1)
/* 800C6010 000C2BF0  83 A1 00 1C */	lwz r29, 0x1c(r1)
/* 800C6014 000C2BF4  38 21 00 28 */	addi r1, r1, 0x28
/* 800C6018 000C2BF8  7C 08 03 A6 */	mtlr r0
/* 800C601C 000C2BFC  4E 80 00 20 */	blr
.endfn ftCo_HammerLanding_Enter

# .text:0x98 | 0x800C6020 | size: 0x64
.fn ftCo_HammerLanding_Anim, global
/* 800C6020 000C2C00  7C 08 02 A6 */	mflr r0
/* 800C6024 000C2C04  90 01 00 04 */	stw r0, 0x4(r1)
/* 800C6028 000C2C08  94 21 FF E8 */	stwu r1, -0x18(r1)
/* 800C602C 000C2C0C  93 E1 00 14 */	stw r31, 0x14(r1)
/* 800C6030 000C2C10  93 C1 00 10 */	stw r30, 0x10(r1)
/* 800C6034 000C2C14  7C 7E 1B 78 */	mr r30, r3
/* 800C6038 000C2C18  83 E3 00 2C */	lwz r31, 0x2c(r3)
/* 800C603C 000C2C1C  4B FF EF 29 */	bl ftCo_800C4F64
/* 800C6040 000C2C20  C0 3F 23 44 */	lfs f1, 0x2344(r31)
/* 800C6044 000C2C24  C0 02 93 D0 */	lfs f0, "@237"@sda21(r0)
/* 800C6048 000C2C28  FC 01 00 40 */	fcmpo cr0, f1, f0
/* 800C604C 000C2C2C  4C 40 13 82 */	cror eq, lt, eq
/* 800C6050 000C2C30  40 82 00 0C */	bne .L_800C605C
/* 800C6054 000C2C34  7F C3 F3 78 */	mr r3, r30
/* 800C6058 000C2C38  4B FF EE 81 */	bl ftCo_800C4ED8
.L_800C605C:
/* 800C605C 000C2C3C  C0 3F 23 44 */	lfs f1, 0x2344(r31)
/* 800C6060 000C2C40  C0 02 93 C0 */	lfs f0, "@230"@sda21(r0)
/* 800C6064 000C2C44  EC 01 00 28 */	fsubs f0, f1, f0
/* 800C6068 000C2C48  D0 1F 23 44 */	stfs f0, 0x2344(r31)
/* 800C606C 000C2C4C  80 01 00 1C */	lwz r0, 0x1c(r1)
/* 800C6070 000C2C50  83 E1 00 14 */	lwz r31, 0x14(r1)
/* 800C6074 000C2C54  83 C1 00 10 */	lwz r30, 0x10(r1)
/* 800C6078 000C2C58  38 21 00 18 */	addi r1, r1, 0x18
/* 800C607C 000C2C5C  7C 08 03 A6 */	mtlr r0
/* 800C6080 000C2C60  4E 80 00 20 */	blr
.endfn ftCo_HammerLanding_Anim

# .text:0xFC | 0x800C6084 | size: 0x4
.fn ftCo_HammerLanding_IASA, global
/* 800C6084 000C2C64  4E 80 00 20 */	blr
.endfn ftCo_HammerLanding_IASA

# .text:0x100 | 0x800C6088 | size: 0x20
.fn ftCo_HammerLanding_Phys, global
/* 800C6088 000C2C68  7C 08 02 A6 */	mflr r0
/* 800C608C 000C2C6C  90 01 00 04 */	stw r0, 0x4(r1)
/* 800C6090 000C2C70  94 21 FF F8 */	stwu r1, -0x8(r1)
/* 800C6094 000C2C74  4B FB EE A9 */	bl ft_80084F3C
/* 800C6098 000C2C78  80 01 00 0C */	lwz r0, 0xc(r1)
/* 800C609C 000C2C7C  38 21 00 08 */	addi r1, r1, 0x8
/* 800C60A0 000C2C80  7C 08 03 A6 */	mtlr r0
/* 800C60A4 000C2C84  4E 80 00 20 */	blr
.endfn ftCo_HammerLanding_Phys

# .text:0x120 | 0x800C60A8 | size: 0x20
.fn ftCo_HammerLanding_Coll, global
/* 800C60A8 000C2C88  7C 08 02 A6 */	mflr r0
/* 800C60AC 000C2C8C  90 01 00 04 */	stw r0, 0x4(r1)
/* 800C60B0 000C2C90  94 21 FF F8 */	stwu r1, -0x8(r1)
/* 800C60B4 000C2C94  4B FF F0 41 */	bl ftCo_HammerWait_Coll
/* 800C60B8 000C2C98  80 01 00 0C */	lwz r0, 0xc(r1)
/* 800C60BC 000C2C9C  38 21 00 08 */	addi r1, r1, 0x8
/* 800C60C0 000C2CA0  7C 08 03 A6 */	mtlr r0
/* 800C60C4 000C2CA4  4E 80 00 20 */	blr
.endfn ftCo_HammerLanding_Coll

# 0x804D8DA0..0x804D8DB8 | size: 0x18
.section .sdata2, "a"
.balign 8

# .sdata2:0x0 | 0x804D8DA0 | size: 0x4
.obj "@230", local
	.float 1
.endobj "@230"
	.4byte 0x00000000

# .sdata2:0x8 | 0x804D8DA8 | size: 0x8
.obj "@232", local
	.double 4503601774854144
.endobj "@232"

# .sdata2:0x10 | 0x804D8DB0 | size: 0x4
.obj "@237", local
	.float 0
.endobj "@237"

# .sdata2:0x14 | 0x804D8DB4 | size: 0x4
.obj gap_11_804D8DB4_sdata2, global
.hidden gap_11_804D8DB4_sdata2
	.4byte 0x00000000
.endobj gap_11_804D8DB4_sdata2
