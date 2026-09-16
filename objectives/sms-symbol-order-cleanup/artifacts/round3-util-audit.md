# Round 3 MarioUtil and LodAnm Audit

## Candidate

`round3-util-tooldata.patch` relocates existing `hashString` and `searchItemInfo` bodies from the game header into `ToolData.cpp`, correcting their names to map `Hash` and `SearchItemInfo`.
The code is not newly invented.
Both linked `GetValue` functions match all 204 bytes, and their complete disassembly shows the hash loop followed by the field search exactly as expressed in these existing helpers.
The map lists `Hash__Q24Koga8ToolDataFPCc` at UNUSED size 0x54, and `SearchItemInfo__Q24Koga8ToolDataCFPCc` at UNUSED size 0x8c.
The proposal uses static Hash because the map lacks const qualification and the observed call sites are const member functions; it does not read object state.
Definitions are in reverse map order, with Hash after Attach and before the linked GetValue methods, and SearchItemInfo after the two GetValue methods.
Requires serial parent compile, expected emitted-size verification, unchanged GetValue matching, and global comparison.
No shared source edits or builds were performed by this agent.

## Complete Cohort Dispositions

| Unit | Findings | Disposition |
|---|---|---|
| MarioUtil/ToolData | Eleven missing UNUSED methods. Two existing helper bodies have incorrect reconstructed names and header placement. Five FindElement overloads, three other GetValue overloads, and Detach have no bodies. | Candidate for two-symbol reduction; remaining nine require reconstruction. No inferred Detach or overload bodies added. |
| MarioUtil/DrawUtil | Missing map-weak JGeometry TRotation3 identity33, 0x30. No existing direct matrix initialization in game source corresponds to it. Many draw helper bodies are pre-existing empty stubs. Original object has no relocation calling identity33 from its own linked functions; map closure selects this weak copy for TBossEelHeartCoin::perform. | Uncertain original instantiation context, possibly one of absent UNUSED drawing bodies. Middleware implementation exists but forced instantiation/reference would only force validation. No patch. |
| MarioUtil/EffectUtil | Missing UNUSED SMS_GetJumpIntoWaterModelData, 0x20. Declaration exists, body and callers do not. | Absent body. Neither resource choice nor return type is proved by symbol name. No patch. |
| MarioUtil/ModelUtil | Missing UNUSED SMS_DumpJ3DModel, 0x4. Declaration exists, body and callers do not. | Absent body. A four-byte size is compatible with an empty debug implementation but supplies no original instructions; no stub added solely to clear validation. |
| MarioUtil/PacketUtil | Missing UNUSED SMS_InitPacket_CallDL, 0x88. Declaration exists, no body or callers. Adjacent initializer functions use reconstructed packet data types; shared ShapePacketCallBackFunc is itself an empty stub. | Absent body; packet layout and callback handling require original assembly reconstruction before adding this initializer. |
| MarioUtil/ShadowUtil | Twelve local-class generated-name differences already audited. | Known compiler-generated-name limitation; no source or validator workaround. |
| M3DUtil/LodAnm | Missing UNUSED MActor copyBckFrmCtrl/copyBtpFrmCtrl, both 0x90. Both exist as empty inline stubs in game header; their expected caller execChangeLod is also an empty 0x4 stub versus map 0x31c. | Absent real bodies. Moving empty definitions into the TU would conceal incompleteness. Reconstruct execChangeLod and copy logic together if additional original evidence becomes available. |
| MarioUtil/RumbleData | Data-only TU cannot resolve through text-only validator. | Coverage error already documented; no source fix. |

## Evidence Locations

Original map `orig/GMSJ01/files/mario.MAP` lines 61564-61576 cover ToolData.
Lines 61464, 61474, 61536, and 61829-61830 cover the missing EffectUtil, ModelUtil, PacketUtil, and LodAnm methods.
Line 61251 records DrawUtil identity33 and closure line 17480 selects it for the external consumer.
The current complete strict logs remain under `final-strict/`.
Read-only decomp-diff runs confirmed both ToolData GetValue overloads at 100 percent.
Full assembly comparisons are saved as `round3-util-tooldata-long-before.txt` and `round3-util-tooldata-string-before.txt`.
All map references to ToolData are saved in `round3-util-tooldata-map-evidence.txt`.
`git apply --check .audit/round3-util-tooldata.patch` passes against the current shared source tree.
