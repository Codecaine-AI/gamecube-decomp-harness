.fn __sinit_effectObj_cpp, local
/* 8024C99C 002498DC  7C 08 02 A6 */	mflr r0
/* 8024C9A0 002498E0  3C 60 80 40 */	lis r3, "@3585"@ha
/* 8024C9A4 002498E4  90 01 00 04 */	stw r0, 0x4(r1)
/* 8024C9A8 002498E8  94 21 FF F0 */	stwu r1, -0x10(r1)
/* 8024C9AC 002498EC  93 E1 00 0C */	stw r31, 0xc(r1)
/* 8024C9B0 002498F0  3B E3 C7 F8 */	addi r31, r3, "@3585"@l
/* 8024C9B4 002498F4  88 0D 97 CC */	lbz r0, "__init__smList__15JALList<5MSBgm>"@sda21(r0)
/* 8024C9B8 002498F8  7C 00 07 75 */	extsb. r0, r0
/* 8024C9BC 002498FC  40 82 00 28 */	bne .L_8024C9E4
/* 8024C9C0 00249900  38 6D 97 A8 */	li r3, "smList__15JALList<5MSBgm>"@sda21
/* 8024C9C4 00249904  4B DC 22 71 */	bl initiate__10JSUPtrListFv
/* 8024C9C8 00249908  3C 60 80 0E */	lis r3, "__dt__15JSUList<5MSBgm>Fv"@ha
/* 8024C9CC 0024990C  38 83 6A 44 */	addi r4, r3, "__dt__15JSUList<5MSBgm>Fv"@l
/* 8024C9D0 00249910  38 6D 97 A8 */	li r3, "smList__15JALList<5MSBgm>"@sda21
/* 8024C9D4 00249914  38 BF 00 00 */	addi r5, r31, 0x0
/* 8024C9D8 00249918  4B E3 5D 51 */	bl __register_global_object
/* 8024C9DC 0024991C  38 00 00 01 */	li r0, 0x1
/* 8024C9E0 00249920  98 0D 97 CC */	stb r0, "__init__smList__15JALList<5MSBgm>"@sda21(r0)
.L_8024C9E4:
/* 8024C9E4 00249924  88 0D 97 CD */	lbz r0, "__init__smList__24JALList<13MSSetSoundGrp>"@sda21(r0)
/* 8024C9E8 00249928  7C 00 07 75 */	extsb. r0, r0
/* 8024C9EC 0024992C  40 82 00 28 */	bne .L_8024CA14
/* 8024C9F0 00249930  38 6D 97 B4 */	li r3, "smList__24JALList<13MSSetSoundGrp>"@sda21
/* 8024C9F4 00249934  4B DC 22 41 */	bl initiate__10JSUPtrListFv
/* 8024C9F8 00249938  3C 60 80 0E */	lis r3, "__dt__24JSUList<13MSSetSoundGrp>Fv"@ha
/* 8024C9FC 0024993C  38 83 69 EC */	addi r4, r3, "__dt__24JSUList<13MSSetSoundGrp>Fv"@l
/* 8024CA00 00249940  38 6D 97 B4 */	li r3, "smList__24JALList<13MSSetSoundGrp>"@sda21
/* 8024CA04 00249944  38 BF 00 0C */	addi r5, r31, 0xc
/* 8024CA08 00249948  4B E3 5D 21 */	bl __register_global_object
/* 8024CA0C 0024994C  38 00 00 01 */	li r0, 0x1
/* 8024CA10 00249950  98 0D 97 CD */	stb r0, "__init__smList__24JALList<13MSSetSoundGrp>"@sda21(r0)
.L_8024CA14:
/* 8024CA14 00249954  88 0D 97 CE */	lbz r0, "__init__smList__21JALList<10MSSetSound>"@sda21(r0)
/* 8024CA18 00249958  7C 00 07 75 */	extsb. r0, r0
/* 8024CA1C 0024995C  40 82 00 28 */	bne .L_8024CA44
/* 8024CA20 00249960  38 6D 97 C0 */	li r3, "smList__21JALList<10MSSetSound>"@sda21
/* 8024CA24 00249964  4B DC 22 11 */	bl initiate__10JSUPtrListFv
/* 8024CA28 00249968  3C 60 80 0E */	lis r3, "__dt__21JSUList<10MSSetSound>Fv"@ha
/* 8024CA2C 0024996C  38 83 69 94 */	addi r4, r3, "__dt__21JSUList<10MSSetSound>Fv"@l
/* 8024CA30 00249970  38 6D 97 C0 */	li r3, "smList__21JALList<10MSSetSound>"@sda21
/* 8024CA34 00249974  38 BF 00 18 */	addi r5, r31, 0x18
/* 8024CA38 00249978  4B E3 5C F1 */	bl __register_global_object
/* 8024CA3C 0024997C  38 00 00 01 */	li r0, 0x1
/* 8024CA40 00249980  98 0D 97 CE */	stb r0, "__init__smList__21JALList<10MSSetSound>"@sda21(r0)
.L_8024CA44:
/* 8024CA44 00249984  88 0D 8F 8C */	lbz r0, "__init__smList__26JALList<15JALSeModEffDGrp>"@sda21(r0)
/* 8024CA48 00249988  7C 00 07 75 */	extsb. r0, r0
/* 8024CA4C 0024998C  40 82 00 28 */	bne .L_8024CA74
/* 8024CA50 00249990  38 6D 8E FC */	li r3, "smList__26JALList<15JALSeModEffDGrp>"@sda21
/* 8024CA54 00249994  4B DC 21 E1 */	bl initiate__10JSUPtrListFv
/* 8024CA58 00249998  3C 60 80 05 */	lis r3, "__dt__26JSUList<15JALSeModEffDGrp>Fv"@ha
/* 8024CA5C 0024999C  38 83 A8 0C */	addi r4, r3, "__dt__26JSUList<15JALSeModEffDGrp>Fv"@l
/* 8024CA60 002499A0  38 6D 8E FC */	li r3, "smList__26JALList<15JALSeModEffDGrp>"@sda21
/* 8024CA64 002499A4  38 BF 00 24 */	addi r5, r31, 0x24
/* 8024CA68 002499A8  4B E3 5C C1 */	bl __register_global_object
/* 8024CA6C 002499AC  38 00 00 01 */	li r0, 0x1
/* 8024CA70 002499B0  98 0D 8F 8C */	stb r0, "__init__smList__26JALList<15JALSeModEffDGrp>"@sda21(r0)
.L_8024CA74:
/* 8024CA74 002499B4  88 0D 8F 8D */	lbz r0, "__init__smList__26JALList<15JALSeModPitDGrp>"@sda21(r0)
/* 8024CA78 002499B8  7C 00 07 75 */	extsb. r0, r0
/* 8024CA7C 002499BC  40 82 00 28 */	bne .L_8024CAA4
/* 8024CA80 002499C0  38 6D 8F 08 */	li r3, "smList__26JALList<15JALSeModPitDGrp>"@sda21
/* 8024CA84 002499C4  4B DC 21 B1 */	bl initiate__10JSUPtrListFv
/* 8024CA88 002499C8  3C 60 80 05 */	lis r3, "__dt__26JSUList<15JALSeModPitDGrp>Fv"@ha
/* 8024CA8C 002499CC  38 83 A7 B4 */	addi r4, r3, "__dt__26JSUList<15JALSeModPitDGrp>Fv"@l
/* 8024CA90 002499D0  38 6D 8F 08 */	li r3, "smList__26JALList<15JALSeModPitDGrp>"@sda21
/* 8024CA94 002499D4  38 BF 00 30 */	addi r5, r31, 0x30
/* 8024CA98 002499D8  4B E3 5C 91 */	bl __register_global_object
/* 8024CA9C 002499DC  38 00 00 01 */	li r0, 0x1
/* 8024CAA0 002499E0  98 0D 8F 8D */	stb r0, "__init__smList__26JALList<15JALSeModPitDGrp>"@sda21(r0)
.L_8024CAA4:
/* 8024CAA4 002499E4  88 0D 8F 8E */	lbz r0, "__init__smList__26JALList<15JALSeModVolDGrp>"@sda21(r0)
/* 8024CAA8 002499E8  7C 00 07 75 */	extsb. r0, r0
/* 8024CAAC 002499EC  40 82 00 28 */	bne .L_8024CAD4
/* 8024CAB0 002499F0  38 6D 8F 14 */	li r3, "smList__26JALList<15JALSeModVolDGrp>"@sda21
/* 8024CAB4 002499F4  4B DC 21 81 */	bl initiate__10JSUPtrListFv
/* 8024CAB8 002499F8  3C 60 80 05 */	lis r3, "__dt__26JSUList<15JALSeModVolDGrp>Fv"@ha
/* 8024CABC 002499FC  38 83 A7 5C */	addi r4, r3, "__dt__26JSUList<15JALSeModVolDGrp>Fv"@l
/* 8024CAC0 00249A00  38 6D 8F 14 */	li r3, "smList__26JALList<15JALSeModVolDGrp>"@sda21
/* 8024CAC4 00249A04  38 BF 00 3C */	addi r5, r31, 0x3c
/* 8024CAC8 00249A08  4B E3 5C 61 */	bl __register_global_object
/* 8024CACC 00249A0C  38 00 00 01 */	li r0, 0x1
/* 8024CAD0 00249A10  98 0D 8F 8E */	stb r0, "__init__smList__26JALList<15JALSeModVolDGrp>"@sda21(r0)
.L_8024CAD4:
/* 8024CAD4 00249A14  88 0D 8F 8F */	lbz r0, "__init__smList__26JALList<15JALSeModEffFGrp>"@sda21(r0)
/* 8024CAD8 00249A18  7C 00 07 75 */	extsb. r0, r0
/* 8024CADC 00249A1C  40 82 00 28 */	bne .L_8024CB04
/* 8024CAE0 00249A20  38 6D 8F 20 */	li r3, "smList__26JALList<15JALSeModEffFGrp>"@sda21
/* 8024CAE4 00249A24  4B DC 21 51 */	bl initiate__10JSUPtrListFv
/* 8024CAE8 00249A28  3C 60 80 05 */	lis r3, "__dt__26JSUList<15JALSeModEffFGrp>Fv"@ha
/* 8024CAEC 00249A2C  38 83 A7 04 */	addi r4, r3, "__dt__26JSUList<15JALSeModEffFGrp>Fv"@l
/* 8024CAF0 00249A30  38 6D 8F 20 */	li r3, "smList__26JALList<15JALSeModEffFGrp>"@sda21
/* 8024CAF4 00249A34  38 BF 00 48 */	addi r5, r31, 0x48
/* 8024CAF8 00249A38  4B E3 5C 31 */	bl __register_global_object
/* 8024CAFC 00249A3C  38 00 00 01 */	li r0, 0x1
/* 8024CB00 00249A40  98 0D 8F 8F */	stb r0, "__init__smList__26JALList<15JALSeModEffFGrp>"@sda21(r0)
.L_8024CB04:
/* 8024CB04 00249A44  88 0D 8F 90 */	lbz r0, "__init__smList__26JALList<15JALSeModPitFGrp>"@sda21(r0)
/* 8024CB08 00249A48  7C 00 07 75 */	extsb. r0, r0
/* 8024CB0C 00249A4C  40 82 00 28 */	bne .L_8024CB34
/* 8024CB10 00249A50  38 6D 8F 2C */	li r3, "smList__26JALList<15JALSeModPitFGrp>"@sda21
/* 8024CB14 00249A54  4B DC 21 21 */	bl initiate__10JSUPtrListFv
/* 8024CB18 00249A58  3C 60 80 05 */	lis r3, "__dt__26JSUList<15JALSeModPitFGrp>Fv"@ha
/* 8024CB1C 00249A5C  38 83 A6 AC */	addi r4, r3, "__dt__26JSUList<15JALSeModPitFGrp>Fv"@l
/* 8024CB20 00249A60  38 6D 8F 2C */	li r3, "smList__26JALList<15JALSeModPitFGrp>"@sda21
/* 8024CB24 00249A64  38 BF 00 54 */	addi r5, r31, 0x54
/* 8024CB28 00249A68  4B E3 5C 01 */	bl __register_global_object
/* 8024CB2C 00249A6C  38 00 00 01 */	li r0, 0x1
/* 8024CB30 00249A70  98 0D 8F 90 */	stb r0, "__init__smList__26JALList<15JALSeModPitFGrp>"@sda21(r0)
.L_8024CB34:
/* 8024CB34 00249A74  88 0D 8F 91 */	lbz r0, "__init__smList__26JALList<15JALSeModVolFGrp>"@sda21(r0)
/* 8024CB38 00249A78  7C 00 07 75 */	extsb. r0, r0
/* 8024CB3C 00249A7C  40 82 00 28 */	bne .L_8024CB64
/* 8024CB40 00249A80  38 6D 8F 38 */	li r3, "smList__26JALList<15JALSeModVolFGrp>"@sda21
/* 8024CB44 00249A84  4B DC 20 F1 */	bl initiate__10JSUPtrListFv
/* 8024CB48 00249A88  3C 60 80 05 */	lis r3, "__dt__26JSUList<15JALSeModVolFGrp>Fv"@ha
/* 8024CB4C 00249A8C  38 83 A6 54 */	addi r4, r3, "__dt__26JSUList<15JALSeModVolFGrp>Fv"@l
/* 8024CB50 00249A90  38 6D 8F 38 */	li r3, "smList__26JALList<15JALSeModVolFGrp>"@sda21
/* 8024CB54 00249A94  38 BF 00 60 */	addi r5, r31, 0x60
/* 8024CB58 00249A98  4B E3 5B D1 */	bl __register_global_object
/* 8024CB5C 00249A9C  38 00 00 01 */	li r0, 0x1
/* 8024CB60 00249AA0  98 0D 8F 91 */	stb r0, "__init__smList__26JALList<15JALSeModVolFGrp>"@sda21(r0)
.L_8024CB64:
/* 8024CB64 00249AA4  88 0D 8F 92 */	lbz r0, "__init__smList__26JALList<15JALSeModEffDist>"@sda21(r0)
/* 8024CB68 00249AA8  7C 00 07 75 */	extsb. r0, r0
/* 8024CB6C 00249AAC  40 82 00 28 */	bne .L_8024CB94
/* 8024CB70 00249AB0  38 6D 8F 44 */	li r3, "smList__26JALList<15JALSeModEffDist>"@sda21
/* 8024CB74 00249AB4  4B DC 20 C1 */	bl initiate__10JSUPtrListFv
/* 8024CB78 00249AB8  3C 60 80 05 */	lis r3, "__dt__26JSUList<15JALSeModEffDist>Fv"@ha
/* 8024CB7C 00249ABC  38 83 A5 FC */	addi r4, r3, "__dt__26JSUList<15JALSeModEffDist>Fv"@l
/* 8024CB80 00249AC0  38 6D 8F 44 */	li r3, "smList__26JALList<15JALSeModEffDist>"@sda21
/* 8024CB84 00249AC4  38 BF 00 6C */	addi r5, r31, 0x6c
/* 8024CB88 00249AC8  4B E3 5B A1 */	bl __register_global_object
/* 8024CB8C 00249ACC  38 00 00 01 */	li r0, 0x1
/* 8024CB90 00249AD0  98 0D 8F 92 */	stb r0, "__init__smList__26JALList<15JALSeModEffDist>"@sda21(r0)
.L_8024CB94:
/* 8024CB94 00249AD4  88 0D 8F 93 */	lbz r0, "__init__smList__26JALList<15JALSeModPitDist>"@sda21(r0)
/* 8024CB98 00249AD8  7C 00 07 75 */	extsb. r0, r0
/* 8024CB9C 00249ADC  40 82 00 28 */	bne .L_8024CBC4
/* 8024CBA0 00249AE0  38 6D 8F 50 */	li r3, "smList__26JALList<15JALSeModPitDist>"@sda21
/* 8024CBA4 00249AE4  4B DC 20 91 */	bl initiate__10JSUPtrListFv
/* 8024CBA8 00249AE8  3C 60 80 05 */	lis r3, "__dt__26JSUList<15JALSeModPitDist>Fv"@ha
/* 8024CBAC 00249AEC  38 83 A5 A4 */	addi r4, r3, "__dt__26JSUList<15JALSeModPitDist>Fv"@l
/* 8024CBB0 00249AF0  38 6D 8F 50 */	li r3, "smList__26JALList<15JALSeModPitDist>"@sda21
/* 8024CBB4 00249AF4  38 BF 00 78 */	addi r5, r31, 0x78
/* 8024CBB8 00249AF8  4B E3 5B 71 */	bl __register_global_object
/* 8024CBBC 00249AFC  38 00 00 01 */	li r0, 0x1
/* 8024CBC0 00249B00  98 0D 8F 93 */	stb r0, "__init__smList__26JALList<15JALSeModPitDist>"@sda21(r0)
.L_8024CBC4:
/* 8024CBC4 00249B04  88 0D 8F 94 */	lbz r0, "__init__smList__26JALList<15JALSeModVolDist>"@sda21(r0)
/* 8024CBC8 00249B08  7C 00 07 75 */	extsb. r0, r0
/* 8024CBCC 00249B0C  40 82 00 28 */	bne .L_8024CBF4
/* 8024CBD0 00249B10  38 6D 8F 5C */	li r3, "smList__26JALList<15JALSeModVolDist>"@sda21
/* 8024CBD4 00249B14  4B DC 20 61 */	bl initiate__10JSUPtrListFv
/* 8024CBD8 00249B18  3C 60 80 05 */	lis r3, "__dt__26JSUList<15JALSeModVolDist>Fv"@ha
/* 8024CBDC 00249B1C  38 83 A5 4C */	addi r4, r3, "__dt__26JSUList<15JALSeModVolDist>Fv"@l
/* 8024CBE0 00249B20  38 6D 8F 5C */	li r3, "smList__26JALList<15JALSeModVolDist>"@sda21
/* 8024CBE4 00249B24  38 BF 00 84 */	addi r5, r31, 0x84
/* 8024CBE8 00249B28  4B E3 5B 41 */	bl __register_global_object
/* 8024CBEC 00249B2C  38 00 00 01 */	li r0, 0x1
/* 8024CBF0 00249B30  98 0D 8F 94 */	stb r0, "__init__smList__26JALList<15JALSeModVolDist>"@sda21(r0)
.L_8024CBF4:
/* 8024CBF4 00249B34  88 0D 8F 95 */	lbz r0, "__init__smList__26JALList<15JALSeModEffFunk>"@sda21(r0)
/* 8024CBF8 00249B38  7C 00 07 75 */	extsb. r0, r0
/* 8024CBFC 00249B3C  40 82 00 28 */	bne .L_8024CC24
/* 8024CC00 00249B40  38 6D 8F 68 */	li r3, "smList__26JALList<15JALSeModEffFunk>"@sda21
/* 8024CC04 00249B44  4B DC 20 31 */	bl initiate__10JSUPtrListFv
/* 8024CC08 00249B48  3C 60 80 05 */	lis r3, "__dt__26JSUList<15JALSeModEffFunk>Fv"@ha
/* 8024CC0C 00249B4C  38 83 A4 F4 */	addi r4, r3, "__dt__26JSUList<15JALSeModEffFunk>Fv"@l
/* 8024CC10 00249B50  38 6D 8F 68 */	li r3, "smList__26JALList<15JALSeModEffFunk>"@sda21
/* 8024CC14 00249B54  38 BF 00 90 */	addi r5, r31, 0x90
/* 8024CC18 00249B58  4B E3 5B 11 */	bl __register_global_object
/* 8024CC1C 00249B5C  38 00 00 01 */	li r0, 0x1
/* 8024CC20 00249B60  98 0D 8F 95 */	stb r0, "__init__smList__26JALList<15JALSeModEffFunk>"@sda21(r0)
.L_8024CC24:
/* 8024CC24 00249B64  88 0D 8F 96 */	lbz r0, "__init__smList__26JALList<15JALSeModPitFunk>"@sda21(r0)
/* 8024CC28 00249B68  7C 00 07 75 */	extsb. r0, r0
/* 8024CC2C 00249B6C  40 82 00 28 */	bne .L_8024CC54
/* 8024CC30 00249B70  38 6D 8F 74 */	li r3, "smList__26JALList<15JALSeModPitFunk>"@sda21
/* 8024CC34 00249B74  4B DC 20 01 */	bl initiate__10JSUPtrListFv
/* 8024CC38 00249B78  3C 60 80 05 */	lis r3, "__dt__26JSUList<15JALSeModPitFunk>Fv"@ha
/* 8024CC3C 00249B7C  38 83 A4 9C */	addi r4, r3, "__dt__26JSUList<15JALSeModPitFunk>Fv"@l
/* 8024CC40 00249B80  38 6D 8F 74 */	li r3, "smList__26JALList<15JALSeModPitFunk>"@sda21
/* 8024CC44 00249B84  38 BF 00 9C */	addi r5, r31, 0x9c
/* 8024CC48 00249B88  4B E3 5A E1 */	bl __register_global_object
/* 8024CC4C 00249B8C  38 00 00 01 */	li r0, 0x1
/* 8024CC50 00249B90  98 0D 8F 96 */	stb r0, "__init__smList__26JALList<15JALSeModPitFunk>"@sda21(r0)
.L_8024CC54:
/* 8024CC54 00249B94  88 0D 8F 97 */	lbz r0, "__init__smList__26JALList<15JALSeModVolFunk>"@sda21(r0)
/* 8024CC58 00249B98  7C 00 07 75 */	extsb. r0, r0
/* 8024CC5C 00249B9C  40 82 00 28 */	bne .L_8024CC84
/* 8024CC60 00249BA0  38 6D 8F 80 */	li r3, "smList__26JALList<15JALSeModVolFunk>"@sda21
/* 8024CC64 00249BA4  4B DC 1F D1 */	bl initiate__10JSUPtrListFv
/* 8024CC68 00249BA8  3C 60 80 05 */	lis r3, "__dt__26JSUList<15JALSeModVolFunk>Fv"@ha
/* 8024CC6C 00249BAC  38 83 A4 44 */	addi r4, r3, "__dt__26JSUList<15JALSeModVolFunk>Fv"@l
/* 8024CC70 00249BB0  38 6D 8F 80 */	li r3, "smList__26JALList<15JALSeModVolFunk>"@sda21
/* 8024CC74 00249BB4  38 BF 00 A8 */	addi r5, r31, 0xa8
/* 8024CC78 00249BB8  4B E3 5A B1 */	bl __register_global_object
/* 8024CC7C 00249BBC  38 00 00 01 */	li r0, 0x1
/* 8024CC80 00249BC0  98 0D 8F 97 */	stb r0, "__init__smList__26JALList<15JALSeModVolFunk>"@sda21(r0)
.L_8024CC84:
/* 8024CC84 00249BC4  80 01 00 14 */	lwz r0, 0x14(r1)
/* 8024CC88 00249BC8  83 E1 00 0C */	lwz r31, 0xc(r1)
/* 8024CC8C 00249BCC  38 21 00 10 */	addi r1, r1, 0x10
/* 8024CC90 00249BD0  7C 08 03 A6 */	mtlr r0
/* 8024CC94 00249BD4  4E 80 00 20 */	blr

