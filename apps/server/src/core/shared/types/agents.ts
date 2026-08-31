export type AgentRole =
  | "worker"
  | "pr-reviewer"
  | "pr-splitter"
  | "librarian"
  | "reconcile"
  | "qa-repair";
export type RuntimeAgentRole = AgentRole;

export interface PiPromptKernelContextInput {
  loaderKind: string;
  inputRef?: string;
  content: string;
}

export interface PiPromptKernelContext {
  turnPrompt?: string;
  inputs: PiPromptKernelContextInput[];
  renderedContext?: string;
}

export interface PiPromptBundle {
  systemPrompt: string;
  userPrompt: string;
  systemTemplatePath: string;
  userTemplatePath: string;
  kernelContext?: PiPromptKernelContext;
}
