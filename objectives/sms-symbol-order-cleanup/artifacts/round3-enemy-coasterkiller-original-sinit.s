.fn __sinit_coasterkiller_cpp, local
/* 803470B8 00343FF8  7C 08 02 A6 */	mflr r0
/* 803470BC 00343FFC  3C 60 80 40 */	lis r3, "@2869"@ha
/* 803470C0 00344000  90 01 00 04 */	stw r0, 0x4(r1)
/* 803470C4 00344004  94 21 FF F0 */	stwu r1, -0x10(r1)
/* 803470C8 00344008  93 E1 00 0C */	stw r31, 0xc(r1)
/* 803470CC 0034400C  3B E3 00 E0 */	addi r31, r3, "@2869"@l
/* 803470D0 00344010  88 0D 97 CC */	lbz r0, "__init__smList__15JALList<5MSBgm>"@sda21(r0)
/* 803470D4 00344014  7C 00 07 75 */	extsb. r0, r0
/* 803470D8 00344018  40 82 00 28 */	bne .L_80347100
/* 803470DC 0034401C  38 6D 97 A8 */	li r3, "smList__15JALList<5MSBgm>"@sda21
/* 803470E0 00344020  4B CC 7B 55 */	bl initiate__10JSUPtrListFv
/* 803470E4 00344024  3C 60 80 0E */	lis r3, "__dt__15JSUList<5MSBgm>Fv"@ha
/* 803470E8 00344028  38 83 6A 44 */	addi r4, r3, "__dt__15JSUList<5MSBgm>Fv"@l
/* 803470EC 0034402C  38 6D 97 A8 */	li r3, "smList__15JALList<5MSBgm>"@sda21
/* 803470F0 00344030  38 BF 00 18 */	addi r5, r31, 0x18
/* 803470F4 00344034  4B D3 B6 35 */	bl __register_global_object
/* 803470F8 00344038  38 00 00 01 */	li r0, 0x1
/* 803470FC 0034403C  98 0D 97 CC */	stb r0, "__init__smList__15JALList<5MSBgm>"@sda21(r0)
.L_80347100:
/* 80347100 00344040  88 0D 97 CD */	lbz r0, "__init__smList__24JALList<13MSSetSoundGrp>"@sda21(r0)
/* 80347104 00344044  7C 00 07 75 */	extsb. r0, r0
/* 80347108 00344048  40 82 00 28 */	bne .L_80347130
/* 8034710C 0034404C  38 6D 97 B4 */	li r3, "smList__24JALList<13MSSetSoundGrp>"@sda21
/* 80347110 00344050  4B CC 7B 25 */	bl initiate__10JSUPtrListFv
/* 80347114 00344054  3C 60 80 0E */	lis r3, "__dt__24JSUList<13MSSetSoundGrp>Fv"@ha
/* 80347118 00344058  38 83 69 EC */	addi r4, r3, "__dt__24JSUList<13MSSetSoundGrp>Fv"@l
/* 8034711C 0034405C  38 6D 97 B4 */	li r3, "smList__24JALList<13MSSetSoundGrp>"@sda21
/* 80347120 00344060  38 BF 00 24 */	addi r5, r31, 0x24
/* 80347124 00344064  4B D3 B6 05 */	bl __register_global_object
/* 80347128 00344068  38 00 00 01 */	li r0, 0x1
/* 8034712C 0034406C  98 0D 97 CD */	stb r0, "__init__smList__24JALList<13MSSetSoundGrp>"@sda21(r0)
.L_80347130:
/* 80347130 00344070  88 0D 97 CE */	lbz r0, "__init__smList__21JALList<10MSSetSound>"@sda21(r0)
/* 80347134 00344074  7C 00 07 75 */	extsb. r0, r0
/* 80347138 00344078  40 82 00 28 */	bne .L_80347160
/* 8034713C 0034407C  38 6D 97 C0 */	li r3, "smList__21JALList<10MSSetSound>"@sda21
/* 80347140 00344080  4B CC 7A F5 */	bl initiate__10JSUPtrListFv
/* 80347144 00344084  3C 60 80 0E */	lis r3, "__dt__21JSUList<10MSSetSound>Fv"@ha
/* 80347148 00344088  38 83 69 94 */	addi r4, r3, "__dt__21JSUList<10MSSetSound>Fv"@l
/* 8034714C 0034408C  38 6D 97 C0 */	li r3, "smList__21JALList<10MSSetSound>"@sda21
/* 80347150 00344090  38 BF 00 30 */	addi r5, r31, 0x30
/* 80347154 00344094  4B D3 B5 D5 */	bl __register_global_object
/* 80347158 00344098  38 00 00 01 */	li r0, 0x1
/* 8034715C 0034409C  98 0D 97 CE */	stb r0, "__init__smList__21JALList<10MSSetSound>"@sda21(r0)
.L_80347160:
/* 80347160 003440A0  88 0D 8F 8C */	lbz r0, "__init__smList__26JALList<15JALSeModEffDGrp>"@sda21(r0)
/* 80347164 003440A4  7C 00 07 75 */	extsb. r0, r0
/* 80347168 003440A8  40 82 00 28 */	bne .L_80347190
/* 8034716C 003440AC  38 6D 8E FC */	li r3, "smList__26JALList<15JALSeModEffDGrp>"@sda21
/* 80347170 003440B0  4B CC 7A C5 */	bl initiate__10JSUPtrListFv
/* 80347174 003440B4  3C 60 80 05 */	lis r3, "__dt__26JSUList<15JALSeModEffDGrp>Fv"@ha
/* 80347178 003440B8  38 83 A8 0C */	addi r4, r3, "__dt__26JSUList<15JALSeModEffDGrp>Fv"@l
/* 8034717C 003440BC  38 6D 8E FC */	li r3, "smList__26JALList<15JALSeModEffDGrp>"@sda21
/* 80347180 003440C0  38 BF 00 3C */	addi r5, r31, 0x3c
/* 80347184 003440C4  4B D3 B5 A5 */	bl __register_global_object
/* 80347188 003440C8  38 00 00 01 */	li r0, 0x1
/* 8034718C 003440CC  98 0D 8F 8C */	stb r0, "__init__smList__26JALList<15JALSeModEffDGrp>"@sda21(r0)
.L_80347190:
/* 80347190 003440D0  88 0D 8F 8D */	lbz r0, "__init__smList__26JALList<15JALSeModPitDGrp>"@sda21(r0)
/* 80347194 003440D4  7C 00 07 75 */	extsb. r0, r0
/* 80347198 003440D8  40 82 00 28 */	bne .L_803471C0
/* 8034719C 003440DC  38 6D 8F 08 */	li r3, "smList__26JALList<15JALSeModPitDGrp>"@sda21
/* 803471A0 003440E0  4B CC 7A 95 */	bl initiate__10JSUPtrListFv
/* 803471A4 003440E4  3C 60 80 05 */	lis r3, "__dt__26JSUList<15JALSeModPitDGrp>Fv"@ha
/* 803471A8 003440E8  38 83 A7 B4 */	addi r4, r3, "__dt__26JSUList<15JALSeModPitDGrp>Fv"@l
/* 803471AC 003440EC  38 6D 8F 08 */	li r3, "smList__26JALList<15JALSeModPitDGrp>"@sda21
/* 803471B0 003440F0  38 BF 00 48 */	addi r5, r31, 0x48
/* 803471B4 003440F4  4B D3 B5 75 */	bl __register_global_object
/* 803471B8 003440F8  38 00 00 01 */	li r0, 0x1
/* 803471BC 003440FC  98 0D 8F 8D */	stb r0, "__init__smList__26JALList<15JALSeModPitDGrp>"@sda21(r0)
.L_803471C0:
/* 803471C0 00344100  88 0D 8F 8E */	lbz r0, "__init__smList__26JALList<15JALSeModVolDGrp>"@sda21(r0)
/* 803471C4 00344104  7C 00 07 75 */	extsb. r0, r0
/* 803471C8 00344108  40 82 00 28 */	bne .L_803471F0
/* 803471CC 0034410C  38 6D 8F 14 */	li r3, "smList__26JALList<15JALSeModVolDGrp>"@sda21
/* 803471D0 00344110  4B CC 7A 65 */	bl initiate__10JSUPtrListFv
/* 803471D4 00344114  3C 60 80 05 */	lis r3, "__dt__26JSUList<15JALSeModVolDGrp>Fv"@ha
/* 803471D8 00344118  38 83 A7 5C */	addi r4, r3, "__dt__26JSUList<15JALSeModVolDGrp>Fv"@l
/* 803471DC 0034411C  38 6D 8F 14 */	li r3, "smList__26JALList<15JALSeModVolDGrp>"@sda21
/* 803471E0 00344120  38 BF 00 54 */	addi r5, r31, 0x54
/* 803471E4 00344124  4B D3 B5 45 */	bl __register_global_object
/* 803471E8 00344128  38 00 00 01 */	li r0, 0x1
/* 803471EC 0034412C  98 0D 8F 8E */	stb r0, "__init__smList__26JALList<15JALSeModVolDGrp>"@sda21(r0)
.L_803471F0:
/* 803471F0 00344130  88 0D 8F 8F */	lbz r0, "__init__smList__26JALList<15JALSeModEffFGrp>"@sda21(r0)
/* 803471F4 00344134  7C 00 07 75 */	extsb. r0, r0
/* 803471F8 00344138  40 82 00 28 */	bne .L_80347220
/* 803471FC 0034413C  38 6D 8F 20 */	li r3, "smList__26JALList<15JALSeModEffFGrp>"@sda21
/* 80347200 00344140  4B CC 7A 35 */	bl initiate__10JSUPtrListFv
/* 80347204 00344144  3C 60 80 05 */	lis r3, "__dt__26JSUList<15JALSeModEffFGrp>Fv"@ha
/* 80347208 00344148  38 83 A7 04 */	addi r4, r3, "__dt__26JSUList<15JALSeModEffFGrp>Fv"@l
/* 8034720C 0034414C  38 6D 8F 20 */	li r3, "smList__26JALList<15JALSeModEffFGrp>"@sda21
/* 80347210 00344150  38 BF 00 60 */	addi r5, r31, 0x60
/* 80347214 00344154  4B D3 B5 15 */	bl __register_global_object
/* 80347218 00344158  38 00 00 01 */	li r0, 0x1
/* 8034721C 0034415C  98 0D 8F 8F */	stb r0, "__init__smList__26JALList<15JALSeModEffFGrp>"@sda21(r0)
.L_80347220:
/* 80347220 00344160  88 0D 8F 90 */	lbz r0, "__init__smList__26JALList<15JALSeModPitFGrp>"@sda21(r0)
/* 80347224 00344164  7C 00 07 75 */	extsb. r0, r0
/* 80347228 00344168  40 82 00 28 */	bne .L_80347250
/* 8034722C 0034416C  38 6D 8F 2C */	li r3, "smList__26JALList<15JALSeModPitFGrp>"@sda21
/* 80347230 00344170  4B CC 7A 05 */	bl initiate__10JSUPtrListFv
/* 80347234 00344174  3C 60 80 05 */	lis r3, "__dt__26JSUList<15JALSeModPitFGrp>Fv"@ha
/* 80347238 00344178  38 83 A6 AC */	addi r4, r3, "__dt__26JSUList<15JALSeModPitFGrp>Fv"@l
/* 8034723C 0034417C  38 6D 8F 2C */	li r3, "smList__26JALList<15JALSeModPitFGrp>"@sda21
/* 80347240 00344180  38 BF 00 6C */	addi r5, r31, 0x6c
/* 80347244 00344184  4B D3 B4 E5 */	bl __register_global_object
/* 80347248 00344188  38 00 00 01 */	li r0, 0x1
/* 8034724C 0034418C  98 0D 8F 90 */	stb r0, "__init__smList__26JALList<15JALSeModPitFGrp>"@sda21(r0)
.L_80347250:
/* 80347250 00344190  88 0D 8F 91 */	lbz r0, "__init__smList__26JALList<15JALSeModVolFGrp>"@sda21(r0)
/* 80347254 00344194  7C 00 07 75 */	extsb. r0, r0
/* 80347258 00344198  40 82 00 28 */	bne .L_80347280
/* 8034725C 0034419C  38 6D 8F 38 */	li r3, "smList__26JALList<15JALSeModVolFGrp>"@sda21
/* 80347260 003441A0  4B CC 79 D5 */	bl initiate__10JSUPtrListFv
/* 80347264 003441A4  3C 60 80 05 */	lis r3, "__dt__26JSUList<15JALSeModVolFGrp>Fv"@ha
/* 80347268 003441A8  38 83 A6 54 */	addi r4, r3, "__dt__26JSUList<15JALSeModVolFGrp>Fv"@l
/* 8034726C 003441AC  38 6D 8F 38 */	li r3, "smList__26JALList<15JALSeModVolFGrp>"@sda21
/* 80347270 003441B0  38 BF 00 78 */	addi r5, r31, 0x78
/* 80347274 003441B4  4B D3 B4 B5 */	bl __register_global_object
/* 80347278 003441B8  38 00 00 01 */	li r0, 0x1
/* 8034727C 003441BC  98 0D 8F 91 */	stb r0, "__init__smList__26JALList<15JALSeModVolFGrp>"@sda21(r0)
.L_80347280:
/* 80347280 003441C0  88 0D 8F 92 */	lbz r0, "__init__smList__26JALList<15JALSeModEffDist>"@sda21(r0)
/* 80347284 003441C4  7C 00 07 75 */	extsb. r0, r0
/* 80347288 003441C8  40 82 00 28 */	bne .L_803472B0
/* 8034728C 003441CC  38 6D 8F 44 */	li r3, "smList__26JALList<15JALSeModEffDist>"@sda21
/* 80347290 003441D0  4B CC 79 A5 */	bl initiate__10JSUPtrListFv
/* 80347294 003441D4  3C 60 80 05 */	lis r3, "__dt__26JSUList<15JALSeModEffDist>Fv"@ha
/* 80347298 003441D8  38 83 A5 FC */	addi r4, r3, "__dt__26JSUList<15JALSeModEffDist>Fv"@l
/* 8034729C 003441DC  38 6D 8F 44 */	li r3, "smList__26JALList<15JALSeModEffDist>"@sda21
/* 803472A0 003441E0  38 BF 00 84 */	addi r5, r31, 0x84
/* 803472A4 003441E4  4B D3 B4 85 */	bl __register_global_object
/* 803472A8 003441E8  38 00 00 01 */	li r0, 0x1
/* 803472AC 003441EC  98 0D 8F 92 */	stb r0, "__init__smList__26JALList<15JALSeModEffDist>"@sda21(r0)
.L_803472B0:
/* 803472B0 003441F0  88 0D 8F 93 */	lbz r0, "__init__smList__26JALList<15JALSeModPitDist>"@sda21(r0)
/* 803472B4 003441F4  7C 00 07 75 */	extsb. r0, r0
/* 803472B8 003441F8  40 82 00 28 */	bne .L_803472E0
/* 803472BC 003441FC  38 6D 8F 50 */	li r3, "smList__26JALList<15JALSeModPitDist>"@sda21
/* 803472C0 00344200  4B CC 79 75 */	bl initiate__10JSUPtrListFv
/* 803472C4 00344204  3C 60 80 05 */	lis r3, "__dt__26JSUList<15JALSeModPitDist>Fv"@ha
/* 803472C8 00344208  38 83 A5 A4 */	addi r4, r3, "__dt__26JSUList<15JALSeModPitDist>Fv"@l
/* 803472CC 0034420C  38 6D 8F 50 */	li r3, "smList__26JALList<15JALSeModPitDist>"@sda21
/* 803472D0 00344210  38 BF 00 90 */	addi r5, r31, 0x90
/* 803472D4 00344214  4B D3 B4 55 */	bl __register_global_object
/* 803472D8 00344218  38 00 00 01 */	li r0, 0x1
/* 803472DC 0034421C  98 0D 8F 93 */	stb r0, "__init__smList__26JALList<15JALSeModPitDist>"@sda21(r0)
.L_803472E0:
/* 803472E0 00344220  88 0D 8F 94 */	lbz r0, "__init__smList__26JALList<15JALSeModVolDist>"@sda21(r0)
/* 803472E4 00344224  7C 00 07 75 */	extsb. r0, r0
/* 803472E8 00344228  40 82 00 28 */	bne .L_80347310
/* 803472EC 0034422C  38 6D 8F 5C */	li r3, "smList__26JALList<15JALSeModVolDist>"@sda21
/* 803472F0 00344230  4B CC 79 45 */	bl initiate__10JSUPtrListFv
/* 803472F4 00344234  3C 60 80 05 */	lis r3, "__dt__26JSUList<15JALSeModVolDist>Fv"@ha
/* 803472F8 00344238  38 83 A5 4C */	addi r4, r3, "__dt__26JSUList<15JALSeModVolDist>Fv"@l
/* 803472FC 0034423C  38 6D 8F 5C */	li r3, "smList__26JALList<15JALSeModVolDist>"@sda21
/* 80347300 00344240  38 BF 00 9C */	addi r5, r31, 0x9c
/* 80347304 00344244  4B D3 B4 25 */	bl __register_global_object
/* 80347308 00344248  38 00 00 01 */	li r0, 0x1
/* 8034730C 0034424C  98 0D 8F 94 */	stb r0, "__init__smList__26JALList<15JALSeModVolDist>"@sda21(r0)
.L_80347310:
/* 80347310 00344250  88 0D 8F 95 */	lbz r0, "__init__smList__26JALList<15JALSeModEffFunk>"@sda21(r0)
/* 80347314 00344254  7C 00 07 75 */	extsb. r0, r0
/* 80347318 00344258  40 82 00 28 */	bne .L_80347340
/* 8034731C 0034425C  38 6D 8F 68 */	li r3, "smList__26JALList<15JALSeModEffFunk>"@sda21
/* 80347320 00344260  4B CC 79 15 */	bl initiate__10JSUPtrListFv
/* 80347324 00344264  3C 60 80 05 */	lis r3, "__dt__26JSUList<15JALSeModEffFunk>Fv"@ha
/* 80347328 00344268  38 83 A4 F4 */	addi r4, r3, "__dt__26JSUList<15JALSeModEffFunk>Fv"@l
/* 8034732C 0034426C  38 6D 8F 68 */	li r3, "smList__26JALList<15JALSeModEffFunk>"@sda21
/* 80347330 00344270  38 BF 00 A8 */	addi r5, r31, 0xa8
/* 80347334 00344274  4B D3 B3 F5 */	bl __register_global_object
/* 80347338 00344278  38 00 00 01 */	li r0, 0x1
/* 8034733C 0034427C  98 0D 8F 95 */	stb r0, "__init__smList__26JALList<15JALSeModEffFunk>"@sda21(r0)
.L_80347340:
/* 80347340 00344280  88 0D 8F 96 */	lbz r0, "__init__smList__26JALList<15JALSeModPitFunk>"@sda21(r0)
/* 80347344 00344284  7C 00 07 75 */	extsb. r0, r0
/* 80347348 00344288  40 82 00 28 */	bne .L_80347370
/* 8034734C 0034428C  38 6D 8F 74 */	li r3, "smList__26JALList<15JALSeModPitFunk>"@sda21
/* 80347350 00344290  4B CC 78 E5 */	bl initiate__10JSUPtrListFv
/* 80347354 00344294  3C 60 80 05 */	lis r3, "__dt__26JSUList<15JALSeModPitFunk>Fv"@ha
/* 80347358 00344298  38 83 A4 9C */	addi r4, r3, "__dt__26JSUList<15JALSeModPitFunk>Fv"@l
/* 8034735C 0034429C  38 6D 8F 74 */	li r3, "smList__26JALList<15JALSeModPitFunk>"@sda21
/* 80347360 003442A0  38 BF 00 B4 */	addi r5, r31, 0xb4
/* 80347364 003442A4  4B D3 B3 C5 */	bl __register_global_object
/* 80347368 003442A8  38 00 00 01 */	li r0, 0x1
/* 8034736C 003442AC  98 0D 8F 96 */	stb r0, "__init__smList__26JALList<15JALSeModPitFunk>"@sda21(r0)
.L_80347370:
/* 80347370 003442B0  88 0D 8F 97 */	lbz r0, "__init__smList__26JALList<15JALSeModVolFunk>"@sda21(r0)
/* 80347374 003442B4  7C 00 07 75 */	extsb. r0, r0
/* 80347378 003442B8  40 82 00 28 */	bne .L_803473A0
/* 8034737C 003442BC  38 6D 8F 80 */	li r3, "smList__26JALList<15JALSeModVolFunk>"@sda21
/* 80347380 003442C0  4B CC 78 B5 */	bl initiate__10JSUPtrListFv
/* 80347384 003442C4  3C 60 80 05 */	lis r3, "__dt__26JSUList<15JALSeModVolFunk>Fv"@ha
/* 80347388 003442C8  38 83 A4 44 */	addi r4, r3, "__dt__26JSUList<15JALSeModVolFunk>Fv"@l
/* 8034738C 003442CC  38 6D 8F 80 */	li r3, "smList__26JALList<15JALSeModVolFunk>"@sda21
/* 80347390 003442D0  38 BF 00 C0 */	addi r5, r31, 0xc0
/* 80347394 003442D4  4B D3 B3 95 */	bl __register_global_object
/* 80347398 003442D8  38 00 00 01 */	li r0, 0x1
/* 8034739C 003442DC  98 0D 8F 97 */	stb r0, "__init__smList__26JALList<15JALSeModVolFunk>"@sda21(r0)
.L_803473A0:
/* 803473A0 003442E0  80 01 00 14 */	lwz r0, 0x14(r1)
/* 803473A4 003442E4  83 E1 00 0C */	lwz r31, 0xc(r1)
/* 803473A8 003442E8  38 21 00 10 */	addi r1, r1, 0x10
/* 803473AC 003442EC  7C 08 03 A6 */	mtlr r0
/* 803473B0 003442F0  4E 80 00 20 */	blr

