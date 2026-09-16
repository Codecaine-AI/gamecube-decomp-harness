.include "macros.inc"
.file "ftCo_CargoLanding.c"

# 0x8009BD4C..0x8009BE54 | size: 0x108
.text
.balign 4

# .text:0x0 | 0x8009BD4C | size: 0x78
.fn ftCo_8009BD4C, global
/* 8009BD4C 0009892C  7C 08 02 A6 */	mflr r0
/* 8009BD50 00098930  38 A0 00 01 */	li r5, 0x1
/* 8009BD54 00098934  90 01 00 04 */	stw r0, 0x4(r1)
/* 8009BD58 00098938  38 C0 00 00 */	li r6, 0x0
/* 8009BD5C 0009893C  94 21 FF D0 */	stwu r1, -0x30(r1)
/* 8009BD60 00098940  93 E1 00 2C */	stw r31, 0x2c(r1)
/* 8009BD64 00098944  93 C1 00 28 */	stw r30, 0x28(r1)
/* 8009BD68 00098948  7C 7E 1B 78 */	mr r30, r3
/* 8009BD6C 0009894C  83 E3 00 2C */	lwz r31, 0x2c(r3)
/* 8009BD70 00098950  80 9F 02 CC */	lwz r4, 0x2cc(r31)
/* 8009BD74 00098954  C0 04 00 28 */	lfs f0, 0x28(r4)
/* 8009BD78 00098958  D0 1F 23 44 */	stfs f0, 0x2344(r31)
/* 8009BD7C 0009895C  80 9F 02 CC */	lwz r4, 0x2cc(r31)
/* 8009BD80 00098960  C0 22 8D 58 */	lfs f1, "@231"@sda21(r0)
/* 8009BD84 00098964  80 84 00 04 */	lwz r4, 0x4(r4)
/* 8009BD88 00098968  C0 42 8D 5C */	lfs f2, "@232"@sda21(r0)
/* 8009BD8C 0009896C  38 84 00 08 */	addi r4, r4, 0x8
/* 8009BD90 00098970  48 03 9D 5D */	bl ftCo_Landing_Enter
/* 8009BD94 00098974  7F C3 F3 78 */	mr r3, r30
/* 8009BD98 00098978  C0 22 8D 58 */	lfs f1, "@231"@sda21(r0)
/* 8009BD9C 0009897C  4B FD 33 F5 */	bl ftAnim_SetAnimRate
/* 8009BDA0 00098980  80 7F 1A 58 */	lwz r3, 0x1a58(r31)
/* 8009BDA4 00098984  38 80 01 0A */	li r4, 0x10a
/* 8009BDA8 00098988  48 00 07 FD */	bl ftCo_8009C5A4
/* 8009BDAC 0009898C  80 01 00 34 */	lwz r0, 0x34(r1)
/* 8009BDB0 00098990  83 E1 00 2C */	lwz r31, 0x2c(r1)
/* 8009BDB4 00098994  83 C1 00 28 */	lwz r30, 0x28(r1)
/* 8009BDB8 00098998  38 21 00 30 */	addi r1, r1, 0x30
/* 8009BDBC 0009899C  7C 08 03 A6 */	mtlr r0
/* 8009BDC0 000989A0  4E 80 00 20 */	blr
.endfn ftCo_8009BD4C

# .text:0x78 | 0x8009BDC4 | size: 0x50
.fn ftCo_CargoLanding_Anim, global
/* 8009BDC4 000989A4  7C 08 02 A6 */	mflr r0
/* 8009BDC8 000989A8  90 01 00 04 */	stw r0, 0x4(r1)
/* 8009BDCC 000989AC  94 21 FF E8 */	stwu r1, -0x18(r1)
/* 8009BDD0 000989B0  93 E1 00 14 */	stw r31, 0x14(r1)
/* 8009BDD4 000989B4  83 E3 00 2C */	lwz r31, 0x2c(r3)
/* 8009BDD8 000989B8  C0 02 8D 58 */	lfs f0, "@231"@sda21(r0)
/* 8009BDDC 000989BC  C0 3F 23 44 */	lfs f1, 0x2344(r31)
/* 8009BDE0 000989C0  FC 01 00 40 */	fcmpo cr0, f1, f0
/* 8009BDE4 000989C4  4C 40 13 82 */	cror eq, lt, eq
/* 8009BDE8 000989C8  40 82 00 08 */	bne .L_8009BDF0
/* 8009BDEC 000989CC  4B FF F7 2D */	bl ftCo_8009B518
.L_8009BDF0:
/* 8009BDF0 000989D0  C0 3F 23 44 */	lfs f1, 0x2344(r31)
/* 8009BDF4 000989D4  C0 02 8D 5C */	lfs f0, "@232"@sda21(r0)
/* 8009BDF8 000989D8  EC 01 00 28 */	fsubs f0, f1, f0
/* 8009BDFC 000989DC  D0 1F 23 44 */	stfs f0, 0x2344(r31)
/* 8009BE00 000989E0  80 01 00 1C */	lwz r0, 0x1c(r1)
/* 8009BE04 000989E4  83 E1 00 14 */	lwz r31, 0x14(r1)
/* 8009BE08 000989E8  38 21 00 18 */	addi r1, r1, 0x18
/* 8009BE0C 000989EC  7C 08 03 A6 */	mtlr r0
/* 8009BE10 000989F0  4E 80 00 20 */	blr
.endfn ftCo_CargoLanding_Anim

# .text:0xC8 | 0x8009BE14 | size: 0x20
.fn ftCo_CargoLanding_Phys, global
/* 8009BE14 000989F4  7C 08 02 A6 */	mflr r0
/* 8009BE18 000989F8  90 01 00 04 */	stw r0, 0x4(r1)
/* 8009BE1C 000989FC  94 21 FF F8 */	stwu r1, -0x8(r1)
/* 8009BE20 00098A00  4B FE 91 1D */	bl ft_80084F3C
/* 8009BE24 00098A04  80 01 00 0C */	lwz r0, 0xc(r1)
/* 8009BE28 00098A08  38 21 00 08 */	addi r1, r1, 0x8
/* 8009BE2C 00098A0C  7C 08 03 A6 */	mtlr r0
/* 8009BE30 00098A10  4E 80 00 20 */	blr
.endfn ftCo_CargoLanding_Phys

# .text:0xE8 | 0x8009BE34 | size: 0x20
.fn ftCo_CargoLanding_Coll, global
/* 8009BE34 00098A14  7C 08 02 A6 */	mflr r0
/* 8009BE38 00098A18  90 01 00 04 */	stw r0, 0x4(r1)
/* 8009BE3C 00098A1C  94 21 FF F8 */	stwu r1, -0x8(r1)
/* 8009BE40 00098A20  4B FF F8 15 */	bl ftCo_CargoWait_Coll
/* 8009BE44 00098A24  80 01 00 0C */	lwz r0, 0xc(r1)
/* 8009BE48 00098A28  38 21 00 08 */	addi r1, r1, 0x8
/* 8009BE4C 00098A2C  7C 08 03 A6 */	mtlr r0
/* 8009BE50 00098A30  4E 80 00 20 */	blr
.endfn ftCo_CargoLanding_Coll

# 0x804D8738..0x804D8740 | size: 0x8
.section .sdata2, "a"
.balign 8

# .sdata2:0x0 | 0x804D8738 | size: 0x4
.obj "@231", local
	.float 0
.endobj "@231"

# .sdata2:0x4 | 0x804D873C | size: 0x4
.obj "@232", local
	.float 1
.endobj "@232"
