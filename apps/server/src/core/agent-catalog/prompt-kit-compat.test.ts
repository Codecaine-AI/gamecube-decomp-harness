import { expect, test } from "bun:test";
import {
  bulletList,
  definePrompt,
  item,
  orderedList,
  renderXmlMarkdown,
  section,
  usesContext,
} from "./prompt-kit-compat.js";

test("preserves the removed Prompt Kit builder shapes and rendering", () => {
  const prompt = definePrompt({
    id: "prompt-kit-compat",
    nodes: [
      section(
        "instructions",
        [
          "Read & verify.",
          bulletList([
            "Plain item",
            item(
              "Nested item",
              [orderedList(["First step", "Second step"], { start: 3 })],
              { id: "nested-item" },
            ),
          ]),
          usesContext("worker-packet", {
            tag: "packet",
            instructions: ["Stay in scope", "Report evidence"],
          }),
        ],
        {
          id: "instructions-section",
          title: "Instructions",
          attrs: { mode: "strict", omitted: null },
          metadata: { owner: "harness" },
        },
      ),
    ],
  });

  expect(prompt.nodes).toEqual([
    {
      type: "section",
      id: "instructions-section",
      metadata: { owner: "harness" },
      tag: "instructions",
      title: "Instructions",
      attrs: { mode: "strict", omitted: null },
      children: [
        {
          type: "paragraph",
          id: undefined,
          metadata: undefined,
          content: ["Read & verify."],
        },
        {
          type: "bulletList",
          id: undefined,
          metadata: undefined,
          items: [
            {
              type: "listItem",
              id: undefined,
              metadata: undefined,
              content: ["Plain item"],
              children: [],
            },
            {
              type: "listItem",
              id: "nested-item",
              metadata: undefined,
              content: ["Nested item"],
              children: [
                {
                  type: "orderedList",
                  id: undefined,
                  metadata: undefined,
                  start: 3,
                  items: [
                    {
                      type: "listItem",
                      id: undefined,
                      metadata: undefined,
                      content: ["First step"],
                      children: [],
                    },
                    {
                      type: "listItem",
                      id: undefined,
                      metadata: undefined,
                      content: ["Second step"],
                      children: [],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: "contextUsage",
          id: undefined,
          metadata: undefined,
          contextId: "worker-packet",
          tag: "packet",
          instructions: [
            {
              type: "bulletList",
              id: undefined,
              metadata: undefined,
              items: [
                {
                  type: "listItem",
                  id: undefined,
                  metadata: undefined,
                  content: ["Stay in scope"],
                  children: [],
                },
                {
                  type: "listItem",
                  id: undefined,
                  metadata: undefined,
                  content: ["Report evidence"],
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    },
  ]);

  expect(renderXmlMarkdown(prompt)).toBe(`<instructions mode="strict">
    Read &amp; verify.

    - Plain item
    - Nested item
        3. First step
        4. Second step

    <packet context_id="worker-packet">
        - Stay in scope
        - Report evidence
    </packet>
</instructions>`);
});
