import { lintBannedIdioms } from "/Users/Ford/Github Repos/Codecaine/gamecube-decomp-harness/apps/server/src/core/agent-catalog/agents/running/worker/micro-gates.ts";
const diffCpp = `diff --git a/src/MoveBG/MapObjHide.cpp b/src/MoveBG/MapObjHide.cpp
--- a/src/MoveBG/MapObjHide.cpp
+++ b/src/MoveBG/MapObjHide.cpp
@@ -1,3 +1,8 @@
+static void dummy(Vec* v)
+{
+	*v = (Vec) { 0.0f, 0.0f, 0.0f };
+}
+static void forceSdata2Order(void) { }
`;
const diffC = diffCpp.replaceAll(".cpp", ".c");
console.log("cpp:", JSON.stringify(lintBannedIdioms(diffCpp, { targetFunction: "foo" })));
console.log("c  :", JSON.stringify(lintBannedIdioms(diffC, { targetFunction: "foo" })));
