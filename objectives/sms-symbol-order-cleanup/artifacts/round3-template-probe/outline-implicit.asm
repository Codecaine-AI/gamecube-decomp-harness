
.audit/round3-template-probe/outline-implicit.o:     file format elf32-powerpc


Disassembly of section .text:

00000000 <getInstance__Fv>:
   0:	38 60 00 00 	li      r3,0
			2: R_PPC_EMB_SDA21	instance
   4:	4e 80 00 20 	blr

00000008 <__sinit_outline-implicit_cpp>:
   8:	7c 08 02 a6 	mflr    r0
   c:	3c 80 00 00 	lis     r4,0
			e: R_PPC_ADDR16_HA	__dt__8Probe<i>Fv
  10:	90 01 00 04 	stw     r0,4(r1)
  14:	3c 60 00 00 	lis     r3,0
			16: R_PPC_ADDR16_HA	__vt__8Probe<i>
  18:	38 03 00 00 	addi    r0,r3,0
			1a: R_PPC_ADDR16_LO	__vt__8Probe<i>
  1c:	94 21 ff f8 	stwu    r1,-8(r1)
  20:	3c 60 00 00 	lis     r3,0
			22: R_PPC_ADDR16_HA	@189
  24:	38 a3 00 00 	addi    r5,r3,0
			26: R_PPC_ADDR16_LO	@189
  28:	90 00 00 00 	stw     r0,0(0)
			2a: R_PPC_EMB_SDA21	instance
  2c:	38 84 00 00 	addi    r4,r4,0
			2e: R_PPC_ADDR16_LO	__dt__8Probe<i>Fv
  30:	38 60 00 00 	li      r3,0
			32: R_PPC_EMB_SDA21	instance
  34:	48 00 00 01 	bl      34 <__sinit_outline-implicit_cpp+0x2c>
			34: R_PPC_REL24	__register_global_object
  38:	80 01 00 0c 	lwz     r0,12(r1)
  3c:	38 21 00 08 	addi    r1,r1,8
  40:	7c 08 03 a6 	mtlr    r0
  44:	4e 80 00 20 	blr

00000048 <__dt__8Probe<i>Fv>:
  48:	7c 08 02 a6 	mflr    r0
  4c:	90 01 00 04 	stw     r0,4(r1)
  50:	94 21 ff e8 	stwu    r1,-24(r1)
  54:	93 e1 00 14 	stw     r31,20(r1)
  58:	7c 7f 1b 79 	mr.     r31,r3
  5c:	41 82 00 20 	beq     7c <__dt__8Probe<i>Fv+0x34>
  60:	3c 60 00 00 	lis     r3,0
			62: R_PPC_ADDR16_HA	__vt__8Probe<i>
  64:	38 63 00 00 	addi    r3,r3,0
			66: R_PPC_ADDR16_LO	__vt__8Probe<i>
  68:	7c 80 07 35 	extsh.  r0,r4
  6c:	90 7f 00 00 	stw     r3,0(r31)
  70:	40 81 00 0c 	ble     7c <__dt__8Probe<i>Fv+0x34>
  74:	7f e3 fb 78 	mr      r3,r31
  78:	48 00 00 01 	bl      78 <__dt__8Probe<i>Fv+0x30>
			78: R_PPC_REL24	__dl__FPv
  7c:	80 01 00 1c 	lwz     r0,28(r1)
  80:	7f e3 fb 78 	mr      r3,r31
  84:	83 e1 00 14 	lwz     r31,20(r1)
  88:	38 21 00 18 	addi    r1,r1,24
  8c:	7c 08 03 a6 	mtlr    r0
  90:	4e 80 00 20 	blr

00000094 <eval__8Probe<i>Fi>:
  94:	38 64 00 07 	addi    r3,r4,7
  98:	4e 80 00 20 	blr

0000009c <set__8Probe<i>Fi>:
  9c:	90 83 00 04 	stw     r4,4(r3)
  a0:	4e 80 00 20 	blr
