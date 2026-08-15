# Decomp Orchestrator Agent Instructions

## UI Server

When working on the orchestrator UI, assume the UI server is already running in
the background. Do not start `bun run ui:server`, `bun run ui`, or a UI dev
server unless the user specifically asks you to start one.

## UI Process Name

The dashboard-managed Melee process name is `melee-live`. Keep that game
process name stable instead of adding UI controls that let it drift. The UI
server may die while the detached process continues running, so a constant name
keeps the saved process file, status view, drain/stop controls, and kill command
easy to find.

## Dashboard Agent Prompt Previews

When changing agent prompt templates, prompt placeholders, or injected prompt
context, update the dashboard Agent preview path at the same time. Keep the
sample rendering and placeholder hydration in
`apps/server/src/core/agent-catalog/kernel-preview.ts`, the kernel catalog conversion in
`apps/server/src/core/agent-catalog/kernel-catalog.ts`, and the dashboard viewer rendering in
`apps/frontend/src/pages/workspace/agents/index.tsx` aligned with the real
prompt builder, so rendering changes are visible in the UI and do not leak raw
`{{PLACEHOLDER}}` text. Cover prompt/catalog/context changes with the nearby
Bun tests; do not start a new dashboard server unless the user asks.
