---
url: "https://www.daytona.io/docs/en/playground.md"
title: undefined
---

# Playground

Daytona provides an interactive environment ("Playground") for creating sandboxes, running SDK operations, and exploring Daytona features directly from your browser.

- **Interactive sandbox creation**: configure and create sandboxes with custom resources
- **Code snippet generation**: automatically generate SDK code samples based on the values configured in the [management](#management) section
- [Web terminal](https://www.daytona.io/docs/en/web-terminal.md): run commands directly in your sandbox through a built-in web terminal
- [VNC access](https://www.daytona.io/docs/en/vnc-access.md): interact with GUI applications using [Computer Use](https://www.daytona.io/docs/en/computer-use.md) features

## Access from Dashboard

Go to [Daytona Dashboard ↗](https://app.daytona.io/dashboard/playground) to access the playground.

Playground consists of three tabs: [Sandbox](#sandbox), [Terminal](#terminal), and [VNC](#vnc). All three tabs operate on the same active sandbox.

## Sandbox

The sandbox tab provides an interactive interface to configure sandboxes and perform SDK operations. The left panel contains configurable parameters organized into collapsible sections. The right panel displays auto-generated code snippets that you can inspect, copy, and run.

### Management

The management section contains the parameters used to configure a sandbox. You can edit these parameters to customize your sandbox and its resources.

- [sandbox language](https://www.daytona.io/docs/en/sandboxes.md#multiple-runtime-support): select a programming language runtime for the sandbox
- [sandbox resources](https://www.daytona.io/docs/en/sandboxes.md#resources): configure resources allocated to the sandbox
- [sandbox lifecycle](https://www.daytona.io/docs/en/sandboxes.md#sandbox-lifecycle): set the sandbox lifecycle policies

:::note
In the management section, sandboxes are only created when you explicitly click **Run**, replacing any existing playground sandbox. In the [Terminal](#terminal) or [VNC](#vnc) tabs, if there are no active sandboxes, the playground automatically creates one using the configured parameters.
:::

### File system

The file system section provides operations to manage files and directories in the sandbox. You can modify files and directories in the sandbox using the following operations:

- **Create a new directory**: set the directory location and its permissions
- **List files and directories**: set the directory location
- **Delete files**: set the file location and delete directory checkbox

For more information, see [file system operations](https://www.daytona.io/docs/en/file-system-operations.md).

### Git operations

The Git operations section provides operations to manage Git repositories in the sandbox. You can clone, get repository status, and list branches using the following operations:

- **Clone a Git repository**: set the repository URL, destination, branch, commit ID, and credentials
- **Get repository status**: retrieve the repository status
- **List branches**: retrieve the list of branches in the repository

For more information, see [Git operations](https://www.daytona.io/docs/en/git-operations.md).

### Process and code execution

The process and code execution section provides operations to run code snippets and shell commands directly in the sandbox. Shell commands are fixed, while code snippets change automatically based on the selected [sandbox language](https://www.daytona.io/docs/en/sandboxes.md#multiple-runtime-support) parameter.

For more information, see [process and code execution](https://www.daytona.io/docs/en/process-code-execution.md).

## Terminal

The terminal tab provides a web-based terminal connected to the sandbox. This gives you direct command-line access to the sandbox environment for running commands, viewing files, and debugging.

The terminal runs on port `22222` and remains active as long as the sandbox is running. If the sandbox stops due to inactivity, start it again to restore terminal access.

:::note
Terminal access is restricted to authenticated members of your [organization](https://www.daytona.io/docs/en/organizations.md).
:::

For more information, see [web terminal](https://www.daytona.io/docs/en/web-terminal.md).

## VNC

The VNC tab provides graphical desktop access to the sandbox, enabling you to interact with GUI applications and test [Computer Use](https://www.daytona.io/docs/en/computer-use.md) features. The left panel contains interaction controls organized into sections. The right panel displays the desktop view.

For more information, see [VNC access](https://www.daytona.io/docs/en/vnc-access.md).

### Display

The display section provides options to inspect the sandbox desktop environment.

- **Get display information**: retrieve information about the available displays
- **List open windows**: retrieve a list of currently open windows

For more information, see [display operations](https://www.daytona.io/docs/en/computer-use.md#display-operations).

### Keyboard

The keyboard section provides options to send keyboard input to the sandbox.

- **Press a hotkey combination**: send a hotkey combination to the sandbox
- **Press a key**: press a key with optional modifiers
- **Type text**: type text into the active window

For more information, see [keyboard operations](https://www.daytona.io/docs/en/computer-use.md#keyboard-operations).

### Mouse

The mouse section provides options to control mouse input in the sandbox.

- **Click**: click at a specified position
- **Drag**: drag from one position to another
- **Move**: move the cursor to a specified position
- **Get cursor position**: retrieve the current cursor position

For more information, see [mouse operations](https://www.daytona.io/docs/en/computer-use.md#mouse-operations).

### Screenshot

The screenshot section provides options to capture screenshots of the sandbox desktop.

- **Take a screenshot**: select format, scale, and quality, show cursor, and capture the entire screen or specific regions

For more information, see [screenshot operations](https://www.daytona.io/docs/en/computer-use.md#screenshot-operations).