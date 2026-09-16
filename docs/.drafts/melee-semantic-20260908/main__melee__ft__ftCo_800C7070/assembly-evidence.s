.include "macros.inc"
.file "ftCo_800C7070.c"

# 0x800C7070..0x800C70D0 | size: 0x60
.text
.balign 4

# .text:0x0 | 0x800C7070 | size: 0x60
.fn ftCo_800C7070, global
/* 800C7070 000C3C50  7C 08 02 A6 */	mflr r0
/* 800C7074 000C3C54  38 80 00 0D */	li r4, 0xd
/* 800C7078 000C3C58  90 01 00 04 */	stw r0, 0x4(r1)
/* 800C707C 000C3C5C  38 A0 00 00 */	li r5, 0x0
/* 800C7080 000C3C60  38 C0 00 00 */	li r6, 0x0
/* 800C7084 000C3C64  94 21 FF E8 */	stwu r1, -0x18(r1)
/* 800C7088 000C3C68  93 E1 00 14 */	stw r31, 0x14(r1)
/* 800C708C 000C3C6C  C0 22 94 10 */	lfs f1, "@183"@sda21(r0)
/* 800C7090 000C3C70  83 E3 00 2C */	lwz r31, 0x2c(r3)
/* 800C7094 000C3C74  FC 60 08 90 */	fmr f3, f1
/* 800C7098 000C3C78  C0 42 94 14 */	lfs f2, "@184"@sda21(r0)
/* 800C709C 000C3C7C  4B FA 23 11 */	bl Fighter_ChangeMotionState
/* 800C70A0 000C3C80  88 1F 22 19 */	lbz r0, 0x2219(r31)
/* 800C70A4 000C3C84  38 60 00 01 */	li r3, 0x1
/* 800C70A8 000C3C88  50 60 2E B4 */	rlwimi r0, r3, 5, 26, 26
/* 800C70AC 000C3C8C  98 1F 22 19 */	stb r0, 0x2219(r31)
/* 800C70B0 000C3C90  88 1F 22 19 */	lbz r0, 0x2219(r31)
/* 800C70B4 000C3C94  50 60 36 72 */	rlwimi r0, r3, 6, 25, 25
/* 800C70B8 000C3C98  98 1F 22 19 */	stb r0, 0x2219(r31)
/* 800C70BC 000C3C9C  80 01 00 1C */	lwz r0, 0x1c(r1)
/* 800C70C0 000C3CA0  83 E1 00 14 */	lwz r31, 0x14(r1)
/* 800C70C4 000C3CA4  38 21 00 18 */	addi r1, r1, 0x18
/* 800C70C8 000C3CA8  7C 08 03 A6 */	mtlr r0
/* 800C70CC 000C3CAC  4E 80 00 20 */	blr
.endfn ftCo_800C7070

# 0x804D8DF0..0x804D8DF8 | size: 0x8
.section .sdata2, "a"
.balign 8

# .sdata2:0x0 | 0x804D8DF0 | size: 0x4
.obj "@183", local
	.float 0
.endobj "@183"

# .sdata2:0x4 | 0x804D8DF4 | size: 0x4
.obj "@184", local
	.float 1
.endobj "@184"
