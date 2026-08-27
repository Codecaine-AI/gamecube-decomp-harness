import { describe, expect, test } from "bun:test";
import { localizeConfigureArgs, parseCiBuildMatrix } from "./workflow.js";

const BUILD_WORKFLOW = `
jobs:
  build-ninja:
    steps:
      - name: Build
        shell: bash
        run: |
          config_args=$(printf '%s ' \\
            '--compilers /compilers' \\
            '--max-errors 0' \\
            '--verbose' \\
            '--version \${{matrix.version}}' \\
            '--no-always-apply' \\
            '--sym off')

          case '\${{matrix.mode}}' in
            'link')
              config_args=$(printf '%s ' \\
                '--map' \\
                '--require-protos' \\
                '--reloc-diffs none' \\
                "$config_args")
              python configure.py $config_args
              ninja "$root/config.json"
              ninja
              ninja diff | tee diff.log
              python .github/scripts/check_complete.py "$root/report.json"
              ;;
            'test')
              config_args=$(printf '%s ' \\
                '--linkable' \\
                "$config_args")
              python configure.py $config_args
              ninja
              ;;
            'diff')
              python configure.py $config_args
              ninja diff
              ;;
            'clang')
              python configure.py --non-matching $config_args
              ninja
              ;;
          esac
`;

describe("parseCiBuildMatrix", () => {
  test("reads base and mode arguments from the Build step", () => {
    expect(parseCiBuildMatrix(BUILD_WORKFLOW)).toEqual({
      baseArgs: [
        "--compilers",
        "/compilers",
        "--max-errors",
        "0",
        "--verbose",
        "--version",
        "GALE01",
        "--no-always-apply",
        "--sym",
        "off",
      ],
      modes: {
        link: ["--map", "--require-protos", "--reloc-diffs", "none"],
        test: ["--linkable"],
      },
    });
  });

  test("fails when the base printf block is missing", () => {
    expect(() => parseCiBuildMatrix("jobs:\n  build-ninja:\n    steps: []\n"))
      .toThrow("CI workflow base config_args printf block was not found");
  });

  test("fails when the link case arm is missing", () => {
    const withoutLink = BUILD_WORKFLOW.replace("'link')", "'other')");
    expect(() => parseCiBuildMatrix(withoutLink))
      .toThrow("CI workflow link mode case arm was not found");
  });
});

describe("localizeConfigureArgs", () => {
  test("removes container-only arguments and appends the local wrapper", () => {
    expect(localizeConfigureArgs([
      "--map",
      "--compilers",
      "/compilers",
      "--max-errors",
      "0",
      "--verbose",
      "--version",
      "GALE01",
    ], { wrapperPath: "/checkout/build/tools/wibo" })).toEqual([
      "--map",
      "--max-errors",
      "0",
      "--version",
      "GALE01",
      "--wrapper",
      "/checkout/build/tools/wibo",
    ]);
  });
});
