import { describe, expect, test } from "bun:test";
import { codeLines, identityExplanation, proposalConfidence, targetFromKey } from "./browser-model";

describe("clickable source reading",()=>{
  const symbols=[{canonical:"fn_80001234",proposed:"Camera_Update",confidence:.8,subject:"main/melee/cm/camera:fn_80001234",status:"substituted"}];
  test("preserves source text and line numbers without linking comments or string literals",()=>{
    const source='/* fn_80001234\n fn_80001234 */\nfn_80001234("fn_80001234");\n';
    const lines=codeLines(source,symbols,false);
    expect(lines.map(l=>l.map(t=>t.text).join("")).join("\n")).toBe(source);
    expect(lines.flat().filter(t=>t.subject)).toHaveLength(1);
    expect(lines[2]!.find(t=>t.subject)?.canonical).toBe("fn_80001234");
  });
  test("maps proposed reading names back to canonical target keys",()=>{
    const token=codeLines("Camera_Update();",symbols,true).flat().find(t=>t.subject)!;
    expect(targetFromKey(token.subject!).symbol).toBe("fn_80001234");
    expect(targetFromKey(token.subject!).unit).toBe("main/melee/cm/camera");
  });
  test("does not link ambiguous or shadowed bindings",()=>{
    expect(codeLines("fn_80001234();",[{...symbols[0]!,status:"shadowed_binding"}],false).flat().some(t=>t.subject)).toBe(false);
  });
  test("explains aggregate data targets without claiming they are single variables",()=>{
    expect(identityExplanation({...targetFromKey("main/melee/cm/camera:.bss"),kind:"data"})).toContain("section containing several objects");
  });
});

test("low-confidence names stay clickable and retain their confidence",()=>{
  const tokens=codeLines("Possible_Name();",[{canonical:"fn_80000000",proposed:"Possible_Name",confidence:0.35,subject:"main/test:fn_80000000",status:"substituted"}],true).flat();
  expect(tokens[0]?.subject).toBe("main/test:fn_80000000");
  expect(tokens[0]?.confidence).toBe(0.35);
  expect(proposalConfidence(tokens[0]?.confidence)).toBe("35% confidence · tentative");
  expect(proposalConfidence(0)).toBe("0% confidence · tentative");
  expect(proposalConfidence(null)).toBe("confidence not recorded");
});

test("proposed mode keeps unchanged canonical occurrences linked",()=>{
  const symbols=[{canonical:"fn_80000000",proposed:"Possible_Name",confidence:.6,subject:"main/test:fn_80000000",status:"substituted"}];
  const linked=codeLines("Possible_Name(); fn_80000000();",symbols,true).flat().filter(t=>t.subject);
  expect(linked).toHaveLength(2);
  expect(linked.map(t=>t.canonical)).toEqual(["fn_80000000","fn_80000000"]);
});
