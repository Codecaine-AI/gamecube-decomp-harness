---
url: "https://www.daytona.io/docs/en/guides/opencode/opencode-plugin/"
title: "Run OpenCode with the Daytona Plugin | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/guides/opencode/opencode-plugin/#_top)

# Run OpenCode with the Daytona Plugin

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/guides/opencode/opencode-plugin.md)Open

This guide demonstrates how to run the [Daytona OpenCode plugin](https://www.npmjs.com/package/@daytona/opencode) which integrates Daytona sandboxes and OpenCode. When the plugin is active, all agent operations occur in secure sandboxes, with one sandbox per OpenCode session. The plugin also has the ability to sync changes between sandboxes and local Git branches.

### [\#](https://www.daytona.io/docs/en/guides/opencode/opencode-plugin/\#1-workflow-overview) 1\. Workflow Overview

[Section titled “1. Workflow Overview”](https://www.daytona.io/docs/en/guides/opencode/opencode-plugin/#1-workflow-overview)

When you run OpenCode with the Daytona plugin, sandboxes are created automatically inside OpenCode sessions. Operations such as running code, installing dependencies, and starting servers occur in the sandbox.

![OpenCode with Daytona plugin — sandbox toast and git branches](https://www.daytona.io/docs/_astro/opencode-plugin.CTF-x3LB_Z1H1b7i.webp)

Sandboxes are preserved until you delete the OpenCode session. If a local Git repository is detected, the plugin syncs changes between the sandbox and branches with the `opencode/` prefix.

### [\#](https://www.daytona.io/docs/en/guides/opencode/opencode-plugin/\#2-project-setup) 2\. Project Setup

[Section titled “2. Project Setup”](https://www.daytona.io/docs/en/guides/opencode/opencode-plugin/#2-project-setup)

#### [\#](https://www.daytona.io/docs/en/guides/opencode/opencode-plugin/\#add-the-plugin) Add the Plugin

[Section titled “Add the Plugin”](https://www.daytona.io/docs/en/guides/opencode/opencode-plugin/#add-the-plugin)

Add the Daytona plugin to your project by creating or editing `opencode.json` in the project directory:

```
{

  "$schema": "https://opencode.ai/config.json",

  "plugin": ["@daytona/opencode"]

}
```

OpenCode downloads the plugin automatically when it starts. To install the plugin globally instead, edit `~/.config/opencode/opencode.json` and add the same `plugin` entry.

#### [\#](https://www.daytona.io/docs/en/guides/opencode/opencode-plugin/\#configure-environment) Configure Environment

[Section titled “Configure Environment”](https://www.daytona.io/docs/en/guides/opencode/opencode-plugin/#configure-environment)

This plugin requires a [Daytona account](https://www.daytona.io/) and [Daytona API key](https://app.daytona.io/dashboard/keys) to create sandboxes.

Set your API key:

```
export DAYTONA_API_KEY="your-api-key"
```

Or create a `.env` file in your project root:

```
DAYTONA_API_KEY=your-api-key
```

#### [\#](https://www.daytona.io/docs/en/guides/opencode/opencode-plugin/\#run-opencode) Run OpenCode

[Section titled “Run OpenCode”](https://www.daytona.io/docs/en/guides/opencode/opencode-plugin/#run-opencode)

Initialize Git if needed, then start OpenCode:

```
git init

opencode
```

You can now use OpenCode as usual. As you work, you will see notifications in OpenCode indicating sandboxes are being created and changes are being synced to local branches.

To confirm the plugin is working, type `pwd` in the chat and you should see a path like `/home/daytona/project`.

To view live logs from the plugin for debugging:

```
tail -f ~/.local/share/opencode/log/daytona.log
```

#### [\#](https://www.daytona.io/docs/en/guides/opencode/opencode-plugin/\#version-control) Version control

[Section titled “Version control”](https://www.daytona.io/docs/en/guides/opencode/opencode-plugin/#version-control)

In your project directory, use Git to list and check out the branches OpenCode creates:

```
git branch

git checkout opencode/1
```

By default, new sessions start from the branch that was checked out when OpenCode was started. After this, synchronization only goes one way: from the sandbox to your local branch. To start working from a different branch, use git to check out that branch and start OpenCode again:

```
git checkout opencode/1

opencode
```

You can run as many OpenCode sessions in parallel as you want. Use Git to review and merge changes.

### [\#](https://www.daytona.io/docs/en/guides/opencode/opencode-plugin/\#3-understanding-the-plugin-architecture) 3\. Understanding the Plugin Architecture

[Section titled “3. Understanding the Plugin Architecture”](https://www.daytona.io/docs/en/guides/opencode/opencode-plugin/#3-understanding-the-plugin-architecture)

The Daytona plugin consists of several modules that provide custom tools, hooks for events, connections from sessions to sandboxes and system prompt transforms. These modules ensure every agent action runs in a [Daytona sandbox](https://www.daytona.io/docs/en/sandboxes) and that changes sync to local Git branches:

- **Custom tools:** Overrides bash, read, write, edit, etc., so they run in the sandbox.
- **System prompt transform:** Injects sandbox path and instructions into the agent’s system prompt.
- **Event handlers:** Handles session lifecycle events including cleanup (deleting sandboxes) and idle auto-commit (syncing changes to local git branches).
- **Session management:** Manages the creation and deletion of sandboxes and the mapping of sessions to sandboxes.

#### [\#](https://www.daytona.io/docs/en/guides/opencode/opencode-plugin/\#custom-tools) Custom tools

[Section titled “Custom tools”](https://www.daytona.io/docs/en/guides/opencode/opencode-plugin/#custom-tools)

The custom tools module registers overrides for OpenCode’s built-in tools so that every file and process operation goes through the Daytona SDK. It receives the project `id` and `worktree` from the plugin context and returns a tool map:

```
export async function customTools(ctx: PluginInput, sessionManager: DaytonaSessionManager) {

  logger.info('OpenCode started with Daytona plugin')

  const projectId = ctx.project.id

  const worktree = ctx.project.worktree

  return {

    bash: bashTool(sessionManager, projectId, worktree, ctx),

    // ... read, write, edit, multiedit, patch, ls, glob, grep, lsp, getPreviewURL

  }

}
```

For example, the plugin implementation of the bash tool uses the Daytona SDK to run the command in the sandbox:

```
async execute(args: { command: string; background?: boolean }, ctx: ToolContext) {

  const sessionId = ctx.sessionID

  const sandbox = await sessionManager.getSandbox(sessionId, projectId, worktree, pluginCtx)

  if (args.background) {

    // ... create or get exec session, then:

    const result = await sandbox.process.executeSessionCommand(execSessionId, {

      command: args.command,

      runAsync: true,

    })

    return `Command started in background (cmdId: ${result.cmdId})`

  } else {

    const result = await sandbox.process.executeCommand(args.command, repoPath)

    return `Exit code: ${result.exitCode}\n${result.result}`

  }

}
```

All stateful tools (bash, read, write, edit, glob, grep, ls, lsp, multiedit, patch) are overridden the same way. The plugin also adds a custom tool for [preview links](https://www.daytona.io/docs/en/preview/).

#### [\#](https://www.daytona.io/docs/en/guides/opencode/opencode-plugin/\#system-prompt-transform) System prompt transform

[Section titled “System prompt transform”](https://www.daytona.io/docs/en/guides/opencode/opencode-plugin/#system-prompt-transform)

The system prompt transform extends the system prompt to include instructions for the agent to work in the sandbox and use the background option for long-running commands:

```
export async function systemPromptTransform(ctx: PluginInput, repoPath: string) {

  return async (input: ExperimentalChatSystemTransformInput, output: ExperimentalChatSystemTransformOutput) => {

    output.system.push(

      [\
\
        '## Daytona Sandbox Integration',\
\
        'This session is integrated with a Daytona sandbox.',\
\
        `The main project repository is located at: ${repoPath}.`,\
\
        'Bash commands will run in this directory.',\
\
        'Put all projects in the project directory. Do NOT try to use the current working directory of the host system.',\
\
        "When executing long-running commands, use the 'background' option to run them asynchronously.",\
\
        'Before showing a preview URL, ensure the server is running in the sandbox on that port.',\
\
      ].join('\n'),

    )

  }

}
```

#### [\#](https://www.daytona.io/docs/en/guides/opencode/opencode-plugin/\#session-events) Session events

[Section titled “Session events”](https://www.daytona.io/docs/en/guides/opencode/opencode-plugin/#session-events)

The session events handler listens for OpenCode session lifecycle events and handles them appropriately. When you delete a session, the handler cleans up the corresponding sandbox. When a session becomes idle, it triggers auto-commit and sync:

```
export async function eventHandlers(ctx: PluginInput, sessionManager: DaytonaSessionManager, repoPath: string) {

  const projectId = ctx.project.id

  const worktree = ctx.project.worktree

  return async (args: any) => {

    const event = args.event

    if (event.type === EVENT_TYPE_SESSION_DELETED) {

      const sessionId = (event as EventSessionDeleted).properties.info.id

      await sessionManager.deleteSandbox(sessionId, projectId)

      toast.show({ title: 'Session deleted', message: 'Sandbox deleted successfully.', variant: 'success' })

    } else if (event.type === EVENT_TYPE_SESSION_IDLE) {

      const sessionId = event.properties.sessionID

      const sandbox = await sessionManager.getSandbox(sessionId, projectId, worktree, ctx)

      const branchNumber = sessionManager.getBranchNumberForSandbox(projectId, sandbox.id)

      if (!branchNumber) return

      const sessionGit = new SessionGitManager(sandbox, repoPath, worktree, branchNumber)

      await sessionGit.autoCommitAndPull(ctx)

    }

  }

}
```

#### [\#](https://www.daytona.io/docs/en/guides/opencode/opencode-plugin/\#file-synchronization) File synchronization

[Section titled “File synchronization”](https://www.daytona.io/docs/en/guides/opencode/opencode-plugin/#file-synchronization)

While OpenCode is in use, the plugin uses Git to keep session sandboxes and your local Git repository in sync. This only occurs if a git repository is detected in the project directory. On plugin start:

1. The plugin looks for a Git repository in the local directory.
2. A parallel repository is created in the sandbox with a single `opencode` branch, mirroring your current local branch.
3. A `sandbox` remote is added to your local repo using an SSH connection to the sandbox.
4. Your current `HEAD` is pushed to `opencode`, and the sandbox repo is reset to that state.
5. On session idle, the plugin commits in the sandbox on `opencode`, then pulls into a local branch (`opencode/1`, `opencode/2`, etc.) which is unique to each sandbox. A notification is shown when the sync is complete.

For more information on how the sync is implemented, see the [SessionGitManager](https://github.com/daytona/integrations/blob/main/packages/opencode-plugin/.opencode/plugin/daytona/git/session-git-manager.ts) class.

#### [\#](https://www.daytona.io/docs/en/guides/opencode/opencode-plugin/\#session-storage) Session storage

[Section titled “Session storage”](https://www.daytona.io/docs/en/guides/opencode/opencode-plugin/#session-storage)

The session manager stores which sandbox belongs to each project in JSON files (using the same base path as OpenCode via `xdg-basedir`).

- **macOS:**`~/.local/share/opencode/storage/daytona/[projectid].json`
- **Windows:**`%LOCALAPPDATA%\opencode\storage\daytona\[projectid].json`

Each file holds sandbox metadata for that project’s sessions so that sandboxes are retained between OpenCode uses.

**Key advantages:**

- Secure, isolated execution: each OpenCode session runs in its own Daytona sandbox
- Sandboxes persist until you delete the OpenCode session
- Live [preview links](https://www.daytona.io/docs/en/preview/) when a server starts in the sandbox
- Automatic git sync to local branches so you can review and merge agent changes
- No script to run: add the plugin and use OpenCode as usual