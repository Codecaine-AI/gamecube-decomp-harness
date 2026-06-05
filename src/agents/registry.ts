import { prReviewAgent } from "./pr-review/index.js";

export const agentRegistry = {
  director: {
    id: "director",
    role: "director",
    purpose: "Schedule decomp worker targets from board state and worker wake events.",
  },
  worker: {
    id: "worker",
    role: "worker",
    purpose: "Execute one leased Melee decomp target and return a durable worker report.",
  },
  "pr-review": prReviewAgent,
} as const;

export type RegisteredAgentId = keyof typeof agentRegistry;
