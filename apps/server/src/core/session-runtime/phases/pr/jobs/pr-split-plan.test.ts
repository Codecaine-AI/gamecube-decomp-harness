import { describe, expect, test } from "bun:test";

import { buildPrSplitPlanFromChanges, renderPrSplitPlan } from "./pr-split-plan.js";

type Changes = Parameters<typeof buildPrSplitPlanFromChanges>[0];
type Options = Parameters<typeof buildPrSplitPlanFromChanges>[1];

function options(overrides: Partial<Options> = {}): Options {
  return {
    repoRoot: "/repo",
    baseRef: "origin/master",
    headRef: "deadbeef",
    currentBranch: "work",
    groupMode: "melee-subsystem",
    maxFilesPerPr: 30,
    branchPrefix: "pr-split",
    titlePrefix: "Melee decomp",
    sliceCheckCommand: "ninja changes_all",
    ...overrides,
  };
}

const gmSource = "src/melee/gm/gmtest.c";
const foreignHeader = "include/melee/gr/ground.h";

function supportChanges(): Changes {
  return [
    { path: gmSource, status: "M", source: "branch" },
    { path: foreignHeader, status: "M", source: "branch" },
  ];
}

describe("buildPrSplitPlanFromChanges support files", () => {
  test("attaches a foreign header without changing primary slice semantics", () => {
    const reason = "ground declarations are required by the GM match";
    const plan = buildPrSplitPlanFromChanges(
      supportChanges(),
      options({ supportAssignments: [{ path: `./${foreignHeader}`, sliceId: "gm", reason }] }),
    );

    expect(plan.totalFiles).toBe(2);
    expect(plan.slices).toHaveLength(1);
    const slice = plan.slices[0];
    expect(slice.id).toBe("gm");
    expect(slice.fileCount).toBe(2);
    expect(slice.files.map((file) => file.path)).toEqual([gmSource]);
    expect(slice.pathspecs).toEqual([gmSource]);
    expect(slice.supportFiles?.map((file) => file.path)).toEqual([foreignHeader]);
    expect(slice.supportPathspecs).toEqual([foreignHeader]);
    expect(slice.independence.kind).toBe("independent");
    expect(slice.independence.reasons).toContain(`carries 1 declared support file(s): ${foreignHeader}`);
    expect(slice.independence.requiredChecks).toContain(
      "verify merge-order safety (git merge-tree both orders) against any other open slice touching the same support file(s)",
    );
    expect(slice.warnings).toContain(`Declared support file ${foreignHeader} attached: ${reason}`);
    expect(slice.commands[1]).toContain(`-- ${gmSource} ${foreignHeader}`);
    expect(slice.isolationCommands[2]).toContain(`-- ${gmSource} ${foreignHeader}`);

    const rendered = renderPrSplitPlan(plan);
    expect(rendered).toContain(`Files:\n- M ${gmSource}\nSupport files:\n- M ${foreignHeader}`);
  });

  test("uses the documented default warning when no reason is declared", () => {
    const plan = buildPrSplitPlanFromChanges(
      supportChanges(),
      options({ supportAssignments: [{ path: foreignHeader, sliceId: "gm" }] }),
    );

    expect(plan.slices[0].warnings).toContain(
      `Declared support file ${foreignHeader} attached: operator-declared support for this slice's match`,
    );
  });

  test("attaches to a merged slice when its id contains the requested id as a member", () => {
    const grSource = "src/melee/gr/grtest.c";
    const plan = buildPrSplitPlanFromChanges(
      [
        ...supportChanges(),
        { path: grSource, status: "M", source: "branch" },
      ],
      options({
        minFilesPerPr: 2,
        lanes: { matchPaths: [gmSource, grSource], improvementPaths: [] },
        supportAssignments: [{ path: foreignHeader, sliceId: "gm" }],
      }),
    );

    expect(plan.slices).toHaveLength(1);
    expect(plan.slices[0].id).toBe("gm-gr");
    expect(plan.slices[0].supportPathspecs).toEqual([foreignHeader]);
  });

  test("does not guess merged membership from a coincidental id substring", () => {
    const naturallyHyphenated = "src/melee/gm-gr/combined.c";
    expect(() =>
      buildPrSplitPlanFromChanges(
        [
          { path: naturallyHyphenated, status: "M", source: "branch" },
          { path: foreignHeader, status: "M", source: "branch" },
        ],
        options({ supportAssignments: [{ path: foreignHeader, sliceId: "gm" }] }),
      ),
    ).toThrow(`Support file ${foreignHeader} targets unknown slice "gm"`);
  });

  test("rejects support attached to a local-only slice with no shipping match", () => {
    expect(() =>
      buildPrSplitPlanFromChanges(
        supportChanges(),
        options({
          lanes: { matchPaths: [], improvementPaths: [gmSource] },
          supportAssignments: [{ path: foreignHeader, sliceId: "local-gm" }],
        }),
      ),
    ).toThrow(`Support file ${foreignHeader} targets local-only slice "local-gm"`);
  });

  test("prefers proven shipping provenance when the same subsystem also has a local lane", () => {
    const grSource = "src/melee/gr/grtest.c";
    const gmLocal = "src/melee/gm/gmlocal.c";
    const plan = buildPrSplitPlanFromChanges(
      [
        ...supportChanges(),
        { path: grSource, status: "M", source: "branch" },
        { path: gmLocal, status: "M", source: "branch" },
      ],
      options({
        minFilesPerPr: 2,
        lanes: { matchPaths: [gmSource, grSource], improvementPaths: [gmLocal] },
        supportAssignments: [{ path: foreignHeader, sliceId: "gm" }],
      }),
    );

    expect(plan.slices.find((slice) => slice.id === "gm-gr")?.supportPathspecs).toEqual([foreignHeader]);
    expect(plan.slices.find((slice) => slice.id === "local-gm")?.supportPathspecs).toBeUndefined();
  });

  test("allows an explicitly mirrored support file in two match slices", () => {
    const grSource = "src/melee/gr/grtest.c";
    const plan = buildPrSplitPlanFromChanges(
      [
        ...supportChanges(),
        { path: grSource, status: "M", source: "branch" },
      ],
      options({
        lanes: { matchPaths: [gmSource, grSource], improvementPaths: [] },
        supportAssignments: [
          { path: foreignHeader, sliceId: "gm" },
          { path: foreignHeader, sliceId: "gr" },
        ],
      }),
    );

    expect(plan.slices).toHaveLength(2);
    expect(plan.slices.map((slice) => [slice.id, slice.supportPathspecs])).toEqual([
      ["gm", [foreignHeader]],
      ["gr", [foreignHeader]],
    ]);
  });

  test("counts support files against the hard PR file ceiling", () => {
    const plan = buildPrSplitPlanFromChanges(
      supportChanges(),
      options({
        maxFilesPerPr: 1,
        supportAssignments: [{ path: foreignHeader, sliceId: "gm" }],
      }),
    );

    expect(plan.slices[0].fileCount).toBe(2);
    expect(plan.slices[0].independence.kind).toBe("needs-merge");
    expect(plan.slices[0].independence.reasons).toContain(
      "slice has 2 files including declared support, above --max-files-per-pr=1",
    );
  });

  test("throws instead of dropping a support file with an unknown target slice", () => {
    expect(() =>
      buildPrSplitPlanFromChanges(
        supportChanges(),
        options({ supportAssignments: [{ path: foreignHeader, sliceId: "missing" }] }),
      ),
    ).toThrow(`Support file ${foreignHeader} targets unknown slice "missing"`);
  });
});

describe("buildPrSplitPlanFromChanges without support files", () => {
  test("preserves the primary-only shape and exact command pathspecs", () => {
    const changes: Changes = [{ path: gmSource, status: "M", source: "branch" }];
    const baseline = buildPrSplitPlanFromChanges(changes, options());
    const explicitEmpty = buildPrSplitPlanFromChanges(changes, options({ supportAssignments: [] }));

    expect(explicitEmpty).toEqual(baseline);
    const slice = baseline.slices[0];
    expect("supportFiles" in slice).toBe(false);
    expect("supportPathspecs" in slice).toBe(false);
    expect(slice.pathspecs).toEqual([gmSource]);
    expect(slice.commands).toEqual([
      "git switch -c pr-split/gm origin/master",
      `git diff --binary origin/master...deadbeef -- ${gmSource} | git apply --index`,
      "git commit -m 'Melee decomp: GM'",
    ]);
    expect(slice.isolationCommands[2]).toBe(
      `git diff --binary origin/master...deadbeef -- ${gmSource} | git -C "$SLICE_DIR" apply --index`,
    );
  });

  test("keeps an unassigned foreign header in its ordinary subsystem slice", () => {
    const plan = buildPrSplitPlanFromChanges(supportChanges(), options());

    expect(plan.slices.map((slice) => [slice.id, slice.pathspecs])).toEqual([
      ["gm", [gmSource]],
      ["gr", [foreignHeader]],
    ]);
    for (const slice of plan.slices) {
      expect("supportFiles" in slice).toBe(false);
      expect("supportPathspecs" in slice).toBe(false);
    }
  });

  test("preserves legacy oversized-slice wording when support is absent", () => {
    const secondGmSource = "src/melee/gm/gmsecond.c";
    const plan = buildPrSplitPlanFromChanges(
      [
        { path: gmSource, status: "M", source: "branch" },
        { path: secondGmSource, status: "M", source: "branch" },
      ],
      options({ maxFilesPerPr: 1 }),
    );
    const slice = plan.slices[0];

    expect(slice.independence.reasons).toContain("slice has 2 files, above --max-files-per-pr=1");
    expect(slice.warnings).toContain(
      "This slice has 2 files, above --max-files-per-pr=1; split it manually if review still feels heavy.",
    );
    expect(slice.independence.reasons.join(" ")).not.toContain("declared support");
  });
});
