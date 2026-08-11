---
url: "https://www.daytona.io/docs/en/typescript-sdk/pty/"
title: "Pty | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/typescript-sdk/pty/#_top)

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/typescript-sdk/pty.md)Open

## [\#](https://www.daytona.io/docs/en/typescript-sdk/pty/\#ptyconnectoptions) PtyConnectOptions

[Section titled “PtyConnectOptions”](https://www.daytona.io/docs/en/typescript-sdk/pty/#ptyconnectoptions)

Options for connecting to a PTY session

**Properties**:

- `onData()` _(data: Uint8Array) => void \| Promise<void>_ \- Callback to handle PTY output data

**Parameters**:


  - `data` _Uint8Array_

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/pty/\#returns) Returns

[Section titled “Returns”](https://www.daytona.io/docs/en/typescript-sdk/pty/#returns)

`void` \| `Promise<void>`

## [\#](https://www.daytona.io/docs/en/typescript-sdk/pty/\#ptycreateoptions) PtyCreateOptions

[Section titled “PtyCreateOptions”](https://www.daytona.io/docs/en/typescript-sdk/pty/#ptycreateoptions)

Options for creating a PTY session

**Properties**:

- `cols?` _number_ \- Number of terminal columns
- `cwd?` _string_ \- Starting directory for the PTY session, defaults to the sandbox’s working directory
- `envs?` _Record<string, string>_ \- Environment variables for the PTY session
- `id` _string_ \- The unique identifier for the PTY session
- `rows?` _number_ \- Number of terminal rows

## [\#](https://www.daytona.io/docs/en/typescript-sdk/pty/\#ptyresult) PtyResult

[Section titled “PtyResult”](https://www.daytona.io/docs/en/typescript-sdk/pty/#ptyresult)

PTY session result on exit

**Properties**:

- `error?` _string_ \- Error message if the PTY failed
- `exitCode?` _number_ \- Exit code when the PTY process ends