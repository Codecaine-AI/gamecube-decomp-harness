.fn __sinit_MarNameRefGen_cpp, local
/* 800F6074 000F2FB4  7C 08 02 A6 */	mflr r0
/* 800F6078 000F2FB8  3C 60 80 3F */	lis r3, "@6138"@ha
/* 800F607C 000F2FBC  90 01 00 04 */	stw r0, 0x4(r1)
/* 800F6080 000F2FC0  94 21 FF F0 */	stwu r1, -0x10(r1)
/* 800F6084 000F2FC4  93 E1 00 0C */	stw r31, 0xc(r1)
/* 800F6088 000F2FC8  3B E3 22 20 */	addi r31, r3, "@6138"@l
/* 800F608C 000F2FCC  88 0D 97 CC */	lbz r0, "__init__smList__15JALList<5MSBgm>"@sda21(r0)
/* 800F6090 000F2FD0  7C 00 07 75 */	extsb. r0, r0
/* 800F6094 000F2FD4  40 82 00 28 */	bne .L_800F60BC
/* 800F6098 000F2FD8  38 6D 97 A8 */	li r3, "smList__15JALList<5MSBgm>"@sda21
/* 800F609C 000F2FDC  4B F1 8B 99 */	bl initiate__10JSUPtrListFv
/* 800F60A0 000F2FE0  3C 60 80 0E */	lis r3, "__dt__15JSUList<5MSBgm>Fv"@ha
/* 800F60A4 000F2FE4  38 83 6A 44 */	addi r4, r3, "__dt__15JSUList<5MSBgm>Fv"@l
/* 800F60A8 000F2FE8  38 6D 97 A8 */	li r3, "smList__15JALList<5MSBgm>"@sda21
/* 800F60AC 000F2FEC  38 BF 00 00 */	addi r5, r31, 0x0
/* 800F60B0 000F2FF0  4B F8 C6 79 */	bl __register_global_object
/* 800F60B4 000F2FF4  38 00 00 01 */	li r0, 0x1
/* 800F60B8 000F2FF8  98 0D 97 CC */	stb r0, "__init__smList__15JALList<5MSBgm>"@sda21(r0)
.L_800F60BC:
/* 800F60BC 000F2FFC  88 0D 97 CD */	lbz r0, "__init__smList__24JALList<13MSSetSoundGrp>"@sda21(r0)
/* 800F60C0 000F3000  7C 00 07 75 */	extsb. r0, r0
/* 800F60C4 000F3004  40 82 00 28 */	bne .L_800F60EC
/* 800F60C8 000F3008  38 6D 97 B4 */	li r3, "smList__24JALList<13MSSetSoundGrp>"@sda21
/* 800F60CC 000F300C  4B F1 8B 69 */	bl initiate__10JSUPtrListFv
/* 800F60D0 000F3010  3C 60 80 0E */	lis r3, "__dt__24JSUList<13MSSetSoundGrp>Fv"@ha
/* 800F60D4 000F3014  38 83 69 EC */	addi r4, r3, "__dt__24JSUList<13MSSetSoundGrp>Fv"@l
/* 800F60D8 000F3018  38 6D 97 B4 */	li r3, "smList__24JALList<13MSSetSoundGrp>"@sda21
/* 800F60DC 000F301C  38 BF 00 0C */	addi r5, r31, 0xc
/* 800F60E0 000F3020  4B F8 C6 49 */	bl __register_global_object
/* 800F60E4 000F3024  38 00 00 01 */	li r0, 0x1
/* 800F60E8 000F3028  98 0D 97 CD */	stb r0, "__init__smList__24JALList<13MSSetSoundGrp>"@sda21(r0)
.L_800F60EC:
/* 800F60EC 000F302C  88 0D 97 CE */	lbz r0, "__init__smList__21JALList<10MSSetSound>"@sda21(r0)
/* 800F60F0 000F3030  7C 00 07 75 */	extsb. r0, r0
/* 800F60F4 000F3034  40 82 00 28 */	bne .L_800F611C
/* 800F60F8 000F3038  38 6D 97 C0 */	li r3, "smList__21JALList<10MSSetSound>"@sda21
/* 800F60FC 000F303C  4B F1 8B 39 */	bl initiate__10JSUPtrListFv
/* 800F6100 000F3040  3C 60 80 0E */	lis r3, "__dt__21JSUList<10MSSetSound>Fv"@ha
/* 800F6104 000F3044  38 83 69 94 */	addi r4, r3, "__dt__21JSUList<10MSSetSound>Fv"@l
/* 800F6108 000F3048  38 6D 97 C0 */	li r3, "smList__21JALList<10MSSetSound>"@sda21
/* 800F610C 000F304C  38 BF 00 18 */	addi r5, r31, 0x18
/* 800F6110 000F3050  4B F8 C6 19 */	bl __register_global_object
/* 800F6114 000F3054  38 00 00 01 */	li r0, 0x1
/* 800F6118 000F3058  98 0D 97 CE */	stb r0, "__init__smList__21JALList<10MSSetSound>"@sda21(r0)
.L_800F611C:
/* 800F611C 000F305C  88 0D 8F 8C */	lbz r0, "__init__smList__26JALList<15JALSeModEffDGrp>"@sda21(r0)
/* 800F6120 000F3060  7C 00 07 75 */	extsb. r0, r0
/* 800F6124 000F3064  40 82 00 28 */	bne .L_800F614C
/* 800F6128 000F3068  38 6D 8E FC */	li r3, "smList__26JALList<15JALSeModEffDGrp>"@sda21
/* 800F612C 000F306C  4B F1 8B 09 */	bl initiate__10JSUPtrListFv
/* 800F6130 000F3070  3C 60 80 05 */	lis r3, "__dt__26JSUList<15JALSeModEffDGrp>Fv"@ha
/* 800F6134 000F3074  38 83 A8 0C */	addi r4, r3, "__dt__26JSUList<15JALSeModEffDGrp>Fv"@l
/* 800F6138 000F3078  38 6D 8E FC */	li r3, "smList__26JALList<15JALSeModEffDGrp>"@sda21
/* 800F613C 000F307C  38 BF 00 24 */	addi r5, r31, 0x24
/* 800F6140 000F3080  4B F8 C5 E9 */	bl __register_global_object
/* 800F6144 000F3084  38 00 00 01 */	li r0, 0x1
/* 800F6148 000F3088  98 0D 8F 8C */	stb r0, "__init__smList__26JALList<15JALSeModEffDGrp>"@sda21(r0)
.L_800F614C:
/* 800F614C 000F308C  88 0D 8F 8D */	lbz r0, "__init__smList__26JALList<15JALSeModPitDGrp>"@sda21(r0)
/* 800F6150 000F3090  7C 00 07 75 */	extsb. r0, r0
/* 800F6154 000F3094  40 82 00 28 */	bne .L_800F617C
/* 800F6158 000F3098  38 6D 8F 08 */	li r3, "smList__26JALList<15JALSeModPitDGrp>"@sda21
/* 800F615C 000F309C  4B F1 8A D9 */	bl initiate__10JSUPtrListFv
/* 800F6160 000F30A0  3C 60 80 05 */	lis r3, "__dt__26JSUList<15JALSeModPitDGrp>Fv"@ha
/* 800F6164 000F30A4  38 83 A7 B4 */	addi r4, r3, "__dt__26JSUList<15JALSeModPitDGrp>Fv"@l
/* 800F6168 000F30A8  38 6D 8F 08 */	li r3, "smList__26JALList<15JALSeModPitDGrp>"@sda21
/* 800F616C 000F30AC  38 BF 00 30 */	addi r5, r31, 0x30
/* 800F6170 000F30B0  4B F8 C5 B9 */	bl __register_global_object
/* 800F6174 000F30B4  38 00 00 01 */	li r0, 0x1
/* 800F6178 000F30B8  98 0D 8F 8D */	stb r0, "__init__smList__26JALList<15JALSeModPitDGrp>"@sda21(r0)
.L_800F617C:
/* 800F617C 000F30BC  88 0D 8F 8E */	lbz r0, "__init__smList__26JALList<15JALSeModVolDGrp>"@sda21(r0)
/* 800F6180 000F30C0  7C 00 07 75 */	extsb. r0, r0
/* 800F6184 000F30C4  40 82 00 28 */	bne .L_800F61AC
/* 800F6188 000F30C8  38 6D 8F 14 */	li r3, "smList__26JALList<15JALSeModVolDGrp>"@sda21
/* 800F618C 000F30CC  4B F1 8A A9 */	bl initiate__10JSUPtrListFv
/* 800F6190 000F30D0  3C 60 80 05 */	lis r3, "__dt__26JSUList<15JALSeModVolDGrp>Fv"@ha
/* 800F6194 000F30D4  38 83 A7 5C */	addi r4, r3, "__dt__26JSUList<15JALSeModVolDGrp>Fv"@l
/* 800F6198 000F30D8  38 6D 8F 14 */	li r3, "smList__26JALList<15JALSeModVolDGrp>"@sda21
/* 800F619C 000F30DC  38 BF 00 3C */	addi r5, r31, 0x3c
/* 800F61A0 000F30E0  4B F8 C5 89 */	bl __register_global_object
/* 800F61A4 000F30E4  38 00 00 01 */	li r0, 0x1
/* 800F61A8 000F30E8  98 0D 8F 8E */	stb r0, "__init__smList__26JALList<15JALSeModVolDGrp>"@sda21(r0)
.L_800F61AC:
/* 800F61AC 000F30EC  88 0D 8F 8F */	lbz r0, "__init__smList__26JALList<15JALSeModEffFGrp>"@sda21(r0)
/* 800F61B0 000F30F0  7C 00 07 75 */	extsb. r0, r0
/* 800F61B4 000F30F4  40 82 00 28 */	bne .L_800F61DC
/* 800F61B8 000F30F8  38 6D 8F 20 */	li r3, "smList__26JALList<15JALSeModEffFGrp>"@sda21
/* 800F61BC 000F30FC  4B F1 8A 79 */	bl initiate__10JSUPtrListFv
/* 800F61C0 000F3100  3C 60 80 05 */	lis r3, "__dt__26JSUList<15JALSeModEffFGrp>Fv"@ha
/* 800F61C4 000F3104  38 83 A7 04 */	addi r4, r3, "__dt__26JSUList<15JALSeModEffFGrp>Fv"@l
/* 800F61C8 000F3108  38 6D 8F 20 */	li r3, "smList__26JALList<15JALSeModEffFGrp>"@sda21
/* 800F61CC 000F310C  38 BF 00 48 */	addi r5, r31, 0x48
/* 800F61D0 000F3110  4B F8 C5 59 */	bl __register_global_object
/* 800F61D4 000F3114  38 00 00 01 */	li r0, 0x1
/* 800F61D8 000F3118  98 0D 8F 8F */	stb r0, "__init__smList__26JALList<15JALSeModEffFGrp>"@sda21(r0)
.L_800F61DC:
/* 800F61DC 000F311C  88 0D 8F 90 */	lbz r0, "__init__smList__26JALList<15JALSeModPitFGrp>"@sda21(r0)
/* 800F61E0 000F3120  7C 00 07 75 */	extsb. r0, r0
/* 800F61E4 000F3124  40 82 00 28 */	bne .L_800F620C
/* 800F61E8 000F3128  38 6D 8F 2C */	li r3, "smList__26JALList<15JALSeModPitFGrp>"@sda21
/* 800F61EC 000F312C  4B F1 8A 49 */	bl initiate__10JSUPtrListFv
/* 800F61F0 000F3130  3C 60 80 05 */	lis r3, "__dt__26JSUList<15JALSeModPitFGrp>Fv"@ha
/* 800F61F4 000F3134  38 83 A6 AC */	addi r4, r3, "__dt__26JSUList<15JALSeModPitFGrp>Fv"@l
/* 800F61F8 000F3138  38 6D 8F 2C */	li r3, "smList__26JALList<15JALSeModPitFGrp>"@sda21
/* 800F61FC 000F313C  38 BF 00 54 */	addi r5, r31, 0x54
/* 800F6200 000F3140  4B F8 C5 29 */	bl __register_global_object
/* 800F6204 000F3144  38 00 00 01 */	li r0, 0x1
/* 800F6208 000F3148  98 0D 8F 90 */	stb r0, "__init__smList__26JALList<15JALSeModPitFGrp>"@sda21(r0)
.L_800F620C:
/* 800F620C 000F314C  88 0D 8F 91 */	lbz r0, "__init__smList__26JALList<15JALSeModVolFGrp>"@sda21(r0)
/* 800F6210 000F3150  7C 00 07 75 */	extsb. r0, r0
/* 800F6214 000F3154  40 82 00 28 */	bne .L_800F623C
/* 800F6218 000F3158  38 6D 8F 38 */	li r3, "smList__26JALList<15JALSeModVolFGrp>"@sda21
/* 800F621C 000F315C  4B F1 8A 19 */	bl initiate__10JSUPtrListFv
/* 800F6220 000F3160  3C 60 80 05 */	lis r3, "__dt__26JSUList<15JALSeModVolFGrp>Fv"@ha
/* 800F6224 000F3164  38 83 A6 54 */	addi r4, r3, "__dt__26JSUList<15JALSeModVolFGrp>Fv"@l
/* 800F6228 000F3168  38 6D 8F 38 */	li r3, "smList__26JALList<15JALSeModVolFGrp>"@sda21
/* 800F622C 000F316C  38 BF 00 60 */	addi r5, r31, 0x60
/* 800F6230 000F3170  4B F8 C4 F9 */	bl __register_global_object
/* 800F6234 000F3174  38 00 00 01 */	li r0, 0x1
/* 800F6238 000F3178  98 0D 8F 91 */	stb r0, "__init__smList__26JALList<15JALSeModVolFGrp>"@sda21(r0)
.L_800F623C:
/* 800F623C 000F317C  88 0D 8F 92 */	lbz r0, "__init__smList__26JALList<15JALSeModEffDist>"@sda21(r0)
/* 800F6240 000F3180  7C 00 07 75 */	extsb. r0, r0
/* 800F6244 000F3184  40 82 00 28 */	bne .L_800F626C
/* 800F6248 000F3188  38 6D 8F 44 */	li r3, "smList__26JALList<15JALSeModEffDist>"@sda21
/* 800F624C 000F318C  4B F1 89 E9 */	bl initiate__10JSUPtrListFv
/* 800F6250 000F3190  3C 60 80 05 */	lis r3, "__dt__26JSUList<15JALSeModEffDist>Fv"@ha
/* 800F6254 000F3194  38 83 A5 FC */	addi r4, r3, "__dt__26JSUList<15JALSeModEffDist>Fv"@l
/* 800F6258 000F3198  38 6D 8F 44 */	li r3, "smList__26JALList<15JALSeModEffDist>"@sda21
/* 800F625C 000F319C  38 BF 00 6C */	addi r5, r31, 0x6c
/* 800F6260 000F31A0  4B F8 C4 C9 */	bl __register_global_object
/* 800F6264 000F31A4  38 00 00 01 */	li r0, 0x1
/* 800F6268 000F31A8  98 0D 8F 92 */	stb r0, "__init__smList__26JALList<15JALSeModEffDist>"@sda21(r0)
.L_800F626C:
/* 800F626C 000F31AC  88 0D 8F 93 */	lbz r0, "__init__smList__26JALList<15JALSeModPitDist>"@sda21(r0)
/* 800F6270 000F31B0  7C 00 07 75 */	extsb. r0, r0
/* 800F6274 000F31B4  40 82 00 28 */	bne .L_800F629C
/* 800F6278 000F31B8  38 6D 8F 50 */	li r3, "smList__26JALList<15JALSeModPitDist>"@sda21
/* 800F627C 000F31BC  4B F1 89 B9 */	bl initiate__10JSUPtrListFv
/* 800F6280 000F31C0  3C 60 80 05 */	lis r3, "__dt__26JSUList<15JALSeModPitDist>Fv"@ha
/* 800F6284 000F31C4  38 83 A5 A4 */	addi r4, r3, "__dt__26JSUList<15JALSeModPitDist>Fv"@l
/* 800F6288 000F31C8  38 6D 8F 50 */	li r3, "smList__26JALList<15JALSeModPitDist>"@sda21
/* 800F628C 000F31CC  38 BF 00 78 */	addi r5, r31, 0x78
/* 800F6290 000F31D0  4B F8 C4 99 */	bl __register_global_object
/* 800F6294 000F31D4  38 00 00 01 */	li r0, 0x1
/* 800F6298 000F31D8  98 0D 8F 93 */	stb r0, "__init__smList__26JALList<15JALSeModPitDist>"@sda21(r0)
.L_800F629C:
/* 800F629C 000F31DC  88 0D 8F 94 */	lbz r0, "__init__smList__26JALList<15JALSeModVolDist>"@sda21(r0)
/* 800F62A0 000F31E0  7C 00 07 75 */	extsb. r0, r0
/* 800F62A4 000F31E4  40 82 00 28 */	bne .L_800F62CC
/* 800F62A8 000F31E8  38 6D 8F 5C */	li r3, "smList__26JALList<15JALSeModVolDist>"@sda21
/* 800F62AC 000F31EC  4B F1 89 89 */	bl initiate__10JSUPtrListFv
/* 800F62B0 000F31F0  3C 60 80 05 */	lis r3, "__dt__26JSUList<15JALSeModVolDist>Fv"@ha
/* 800F62B4 000F31F4  38 83 A5 4C */	addi r4, r3, "__dt__26JSUList<15JALSeModVolDist>Fv"@l
/* 800F62B8 000F31F8  38 6D 8F 5C */	li r3, "smList__26JALList<15JALSeModVolDist>"@sda21
/* 800F62BC 000F31FC  38 BF 00 84 */	addi r5, r31, 0x84
/* 800F62C0 000F3200  4B F8 C4 69 */	bl __register_global_object
/* 800F62C4 000F3204  38 00 00 01 */	li r0, 0x1
/* 800F62C8 000F3208  98 0D 8F 94 */	stb r0, "__init__smList__26JALList<15JALSeModVolDist>"@sda21(r0)
.L_800F62CC:
/* 800F62CC 000F320C  88 0D 8F 95 */	lbz r0, "__init__smList__26JALList<15JALSeModEffFunk>"@sda21(r0)
/* 800F62D0 000F3210  7C 00 07 75 */	extsb. r0, r0
/* 800F62D4 000F3214  40 82 00 28 */	bne .L_800F62FC
/* 800F62D8 000F3218  38 6D 8F 68 */	li r3, "smList__26JALList<15JALSeModEffFunk>"@sda21
/* 800F62DC 000F321C  4B F1 89 59 */	bl initiate__10JSUPtrListFv
/* 800F62E0 000F3220  3C 60 80 05 */	lis r3, "__dt__26JSUList<15JALSeModEffFunk>Fv"@ha
/* 800F62E4 000F3224  38 83 A4 F4 */	addi r4, r3, "__dt__26JSUList<15JALSeModEffFunk>Fv"@l
/* 800F62E8 000F3228  38 6D 8F 68 */	li r3, "smList__26JALList<15JALSeModEffFunk>"@sda21
/* 800F62EC 000F322C  38 BF 00 90 */	addi r5, r31, 0x90
/* 800F62F0 000F3230  4B F8 C4 39 */	bl __register_global_object
/* 800F62F4 000F3234  38 00 00 01 */	li r0, 0x1
/* 800F62F8 000F3238  98 0D 8F 95 */	stb r0, "__init__smList__26JALList<15JALSeModEffFunk>"@sda21(r0)
.L_800F62FC:
/* 800F62FC 000F323C  88 0D 8F 96 */	lbz r0, "__init__smList__26JALList<15JALSeModPitFunk>"@sda21(r0)
/* 800F6300 000F3240  7C 00 07 75 */	extsb. r0, r0
/* 800F6304 000F3244  40 82 00 28 */	bne .L_800F632C
/* 800F6308 000F3248  38 6D 8F 74 */	li r3, "smList__26JALList<15JALSeModPitFunk>"@sda21
/* 800F630C 000F324C  4B F1 89 29 */	bl initiate__10JSUPtrListFv
/* 800F6310 000F3250  3C 60 80 05 */	lis r3, "__dt__26JSUList<15JALSeModPitFunk>Fv"@ha
/* 800F6314 000F3254  38 83 A4 9C */	addi r4, r3, "__dt__26JSUList<15JALSeModPitFunk>Fv"@l
/* 800F6318 000F3258  38 6D 8F 74 */	li r3, "smList__26JALList<15JALSeModPitFunk>"@sda21
/* 800F631C 000F325C  38 BF 00 9C */	addi r5, r31, 0x9c
/* 800F6320 000F3260  4B F8 C4 09 */	bl __register_global_object
/* 800F6324 000F3264  38 00 00 01 */	li r0, 0x1
/* 800F6328 000F3268  98 0D 8F 96 */	stb r0, "__init__smList__26JALList<15JALSeModPitFunk>"@sda21(r0)
.L_800F632C:
/* 800F632C 000F326C  88 0D 8F 97 */	lbz r0, "__init__smList__26JALList<15JALSeModVolFunk>"@sda21(r0)
/* 800F6330 000F3270  7C 00 07 75 */	extsb. r0, r0
/* 800F6334 000F3274  40 82 00 28 */	bne .L_800F635C
/* 800F6338 000F3278  38 6D 8F 80 */	li r3, "smList__26JALList<15JALSeModVolFunk>"@sda21
/* 800F633C 000F327C  4B F1 88 F9 */	bl initiate__10JSUPtrListFv
/* 800F6340 000F3280  3C 60 80 05 */	lis r3, "__dt__26JSUList<15JALSeModVolFunk>Fv"@ha
/* 800F6344 000F3284  38 83 A4 44 */	addi r4, r3, "__dt__26JSUList<15JALSeModVolFunk>Fv"@l
/* 800F6348 000F3288  38 6D 8F 80 */	li r3, "smList__26JALList<15JALSeModVolFunk>"@sda21
/* 800F634C 000F328C  38 BF 00 A8 */	addi r5, r31, 0xa8
/* 800F6350 000F3290  4B F8 C3 D9 */	bl __register_global_object
/* 800F6354 000F3294  38 00 00 01 */	li r0, 0x1
/* 800F6358 000F3298  98 0D 8F 97 */	stb r0, "__init__smList__26JALList<15JALSeModVolFunk>"@sda21(r0)
.L_800F635C:
/* 800F635C 000F329C  80 01 00 14 */	lwz r0, 0x14(r1)
/* 800F6360 000F32A0  83 E1 00 0C */	lwz r31, 0xc(r1)
/* 800F6364 000F32A4  38 21 00 10 */	addi r1, r1, 0x10
/* 800F6368 000F32A8  7C 08 03 A6 */	mtlr r0
/* 800F636C 000F32AC  4E 80 00 20 */	blr

