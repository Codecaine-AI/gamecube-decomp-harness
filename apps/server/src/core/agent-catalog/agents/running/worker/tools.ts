import { defineTools } from "@agent-kernel/kernel/agent-definition";

/** Runtime registration is supplied by the worker tool profile and claim callback. */
export const REQUEST_WRITE_SET_WIDENING_TOOL_ID = "request_write_set_widening";

export const tools = defineTools(() => {});

export default tools;
