import {
  type BulletListNode,
  type ContextUsageNode,
  type ListItemNode,
  type OrderedListNode,
  type ParagraphNode,
  type PromptBlockNode,
  type PromptInline,
  type SectionNode,
} from "@codecaine-ai/prompt-kit";

export { definePrompt, renderXmlMarkdown } from "@codecaine-ai/prompt-kit";

type InlineInput = PromptInline | PromptInline[];
type BlockInput = PromptBlockNode | string;

export type ListItemInput = string | ListItemNode;

export interface ListItemOptions {
  id?: string;
  metadata?: Record<string, unknown>;
}

export interface ListOptions {
  id?: string;
  metadata?: Record<string, unknown>;
}

export interface OrderedListOptions extends ListOptions {
  start?: number;
}

export interface SectionOptions {
  id?: string;
  title?: string;
  attrs?: SectionNode["attrs"];
  metadata?: Record<string, unknown>;
}

export interface UsesContextOptions {
  id?: string;
  tag?: string;
  instructions?: readonly string[] | readonly BlockInput[];
  metadata?: Record<string, unknown>;
}

function inline(input: InlineInput | undefined): PromptInline[] {
  if (input === undefined) return [];
  return Array.isArray(input) ? input : [input];
}

function paragraph(content: InlineInput): ParagraphNode {
  return {
    type: "paragraph",
    id: undefined,
    metadata: undefined,
    content: inline(content),
  };
}

function blocks(inputs: readonly BlockInput[] = []): PromptBlockNode[] {
  return inputs.map((input) => (typeof input === "string" ? paragraph(input) : input));
}

export function item(
  content: InlineInput,
  children: readonly BlockInput[] = [],
  options: ListItemOptions = {},
): ListItemNode {
  return {
    type: "listItem",
    id: options.id,
    metadata: options.metadata,
    content: inline(content),
    children: blocks(children),
  };
}

function normalizeListItem(input: ListItemInput): ListItemNode {
  return typeof input === "string" ? item(input) : input;
}

export function bulletList(
  items: readonly ListItemInput[],
  options: ListOptions = {},
): BulletListNode {
  return {
    type: "bulletList",
    id: options.id,
    metadata: options.metadata,
    items: items.map(normalizeListItem),
  };
}

export function orderedList(
  items: readonly ListItemInput[],
  options: OrderedListOptions = {},
): OrderedListNode {
  return {
    type: "orderedList",
    id: options.id,
    metadata: options.metadata,
    start: options.start,
    items: items.map(normalizeListItem),
  };
}

export function section(
  tag: string,
  children: readonly BlockInput[] = [],
  options: SectionOptions = {},
): SectionNode {
  return {
    type: "section",
    id: options.id,
    metadata: options.metadata,
    tag,
    title: options.title,
    attrs: options.attrs,
    children: blocks(children),
  };
}

export function usesContext(
  contextId: string,
  options: UsesContextOptions = {},
): ContextUsageNode {
  const instructions = options.instructions ?? [];
  const instructionNodes =
    instructions.length > 0 && instructions.every((entry) => typeof entry === "string")
      ? [bulletList(instructions as readonly string[])]
      : blocks(instructions as readonly BlockInput[]);

  return {
    type: "contextUsage",
    id: options.id,
    metadata: options.metadata,
    contextId,
    tag: options.tag,
    instructions: instructionNodes,
  };
}
