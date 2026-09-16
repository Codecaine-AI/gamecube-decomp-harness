
.audit/round3-template-probe/outline-explicit.o:     file format elf32-powerpc


Disassembly of section .text:

00000000 <getInstance__Fv>:
   0:	38 60 00 00 	li      r3,0
			2: R_PPC_EMB_SDA21	instance
   4:	4e 80 00 20 	blr

00000008 <set__8Probe<i>Fi>:
   8:	90 83 00 04 	stw     r4,4(r3)
   c:	4e 80 00 20 	blr

00000010 <eval__8Probe<i>Fi>:
  10:	38 64 00 07 	addi    r3,r4,7
  14:	4e 80 00 20 	blr

00000018 <__sinit_outline-explicit_cpp>:
  18:	7c 08 02 a6 	mflr    r0
  1c:	3c 80 00 00 	lis     r4,0
			1e: R_PPC_ADDR16_HA	__dt__8Probe<i>Fv
  20:	90 01 00 04 	stw     r0,4(r1)
  24:	3c 60 00 00 	lis     r3,0
			26: R_PPC_ADDR16_HA	__vt__8Probe<i>
  28:	38 03 00 00 	addi    r0,r3,0
			2a: R_PPC_ADDR16_LO	__vt__8Probe<i>
  2c:	94 21 ff f8 	stwu    r1,-8(r1)
  30:	3c 60 00 00 	lis     r3,0
			32: R_PPC_ADDR16_HA	@191
  34:	38 a3 00 00 	addi    r5,r3,0
			36: R_PPC_ADDR16_LO	@191
  38:	90 00 00 00 	stw     r0,0(0)
			3a: R_PPC_EMB_SDA21	instance
  3c:	38 84 00 00 	addi    r4,r4,0
			3e: R_PPC_ADDR16_LO	__dt__8Probe<i>Fv
  40:	38 60 00 00 	li      r3,0
			42: R_PPC_EMB_SDA21	instance
  44:	48 00 00 01 	bl      44 <__sinit_outline-explicit_cpp+0x2c>
			44: R_PPC_REL24	__register_global_object
  48:	80 01 00 0c 	lwz     r0,12(r1)
  4c:	38 21 00 08 	addi    r1,r1,8
  50:	7c 08 03 a6 	mtlr    r0
  54:	4e 80 00 20 	blr

00000058 <__dt__8Probe<i>Fv>:
  58:	7c 08 02 a6 	mflr    r0
  5c:	90 01 00 04 	stw     r0,4(r1)
  60:	94 21 ff e8 	stwu    r1,-24(r1)
  64:	93 e1 00 14 	stw     r31,20(r1)
  68:	7c 7f 1b 79 	mr.     r31,r3
  6c:	41 82 00 20 	beq     8c <__dt__8Probe<i>Fv+0x34>
  70:	3c 60 00 00 	lis     r3,0
			72: R_PPC_ADDR16_HA	__vt__8Probe<i>
  74:	38 63 00 00 	addi    r3,r3,0
			76: R_PPC_ADDR16_LO	__vt__8Probe<i>
  78:	7c 80 07 35 	extsh.  r0,r4
  7c:	90 7f 00 00 	stw     r3,0(r31)
  80:	40 81 00 0c 	ble     8c <__dt__8Probe<i>Fv+0x34>
  84:	7f e3 fb 78 	mr      r3,r31
  88:	48 00 00 01 	bl      88 <__dt__8Probe<i>Fv+0x30>
			88: R_PPC_REL24	__dl__FPv
  8c:	80 01 00 1c 	lwz     r0,28(r1)
  90:	7f e3 fb 78 	mr      r3,r31
  94:	83 e1 00 14 	lwz     r31,20(r1)
  98:	38 21 00 18 	addi    r1,r1,24
  9c:	7c 08 03 a6 	mtlr    r0
  a0:	4e 80 00 20 	blr
