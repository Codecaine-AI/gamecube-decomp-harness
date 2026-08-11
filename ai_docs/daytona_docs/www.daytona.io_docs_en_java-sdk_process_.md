---
url: "https://www.daytona.io/docs/en/java-sdk/process/"
title: "Process | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/java-sdk/process/#_top)

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/java-sdk/process.md)Open

## [\#](https://www.daytona.io/docs/en/java-sdk/process/\#process) Process

[Section titled “Process”](https://www.daytona.io/docs/en/java-sdk/process/#process)

Process and session execution interface for a Sandbox.

Supports single-command execution, code execution, long-running sessions, and PTY terminal
sessions.

### [\#](https://www.daytona.io/docs/en/java-sdk/process/\#methods) Methods

[Section titled “Methods”](https://www.daytona.io/docs/en/java-sdk/process/#methods)

#### [\#](https://www.daytona.io/docs/en/java-sdk/process/\#executecommand) executeCommand()

[Section titled “executeCommand()”](https://www.daytona.io/docs/en/java-sdk/process/#executecommand)

```
public ExecuteResponse executeCommand(String command)
```

Executes a shell command with default options.

**Parameters**:

- `command` _String_ \- command to execute

**Returns**:

- `ExecuteResponse` \- execution result

**Throws**:

- `DaytonaException` \- if execution fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/process/\#executecommand-1) executeCommand()

[Section titled “executeCommand()”](https://www.daytona.io/docs/en/java-sdk/process/#executecommand-1)

```
public ExecuteResponse executeCommand(String command, String cwd, Map<String, String> env, Integer timeout)
```

Executes a shell command.

**Parameters**:

- `command` _String_ \- command to execute
- `cwd` _String_ \- working directory, or `null` to use sandbox default
- `env` _Map<String, String>_ \- environment variables to set for the command
- `timeout` _Integer_ \- timeout in seconds

**Returns**:

- `ExecuteResponse` \- execution result

**Throws**:

- `DaytonaException` \- if execution fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/process/\#coderun) codeRun()

[Section titled “codeRun()”](https://www.daytona.io/docs/en/java-sdk/process/#coderun)

```
public ExecuteResponse codeRun(String code)
```

Executes source code using Sandbox language tooling.

**Parameters**:

- `code` _String_ \- source code to execute

**Returns**:

- `ExecuteResponse` \- execution result

**Throws**:

- `DaytonaException` \- if execution fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/process/\#coderun-1) codeRun()

[Section titled “codeRun()”](https://www.daytona.io/docs/en/java-sdk/process/#coderun-1)

```
public ExecuteResponse codeRun(String code, Map<String, String> env, Integer timeout)
```

**Parameters**:

- `code` _String_ -
- `env` _Map<String, String>_ -
- `timeout` _Integer_ -

**Returns**:

- `ExecuteResponse` -

#### [\#](https://www.daytona.io/docs/en/java-sdk/process/\#coderun-2) codeRun()

[Section titled “codeRun()”](https://www.daytona.io/docs/en/java-sdk/process/#coderun-2)

```
public ExecuteResponse codeRun(String code, List<String> argv, Map<String, String> env, Integer timeout)
```

**Parameters**:

- `code` _String_ -
- `argv` _List<String>_ -
- `env` _Map<String, String>_ -
- `timeout` _Integer_ -

**Returns**:

- `ExecuteResponse` -

#### [\#](https://www.daytona.io/docs/en/java-sdk/process/\#createsession) createSession()

[Section titled “createSession()”](https://www.daytona.io/docs/en/java-sdk/process/#createsession)

```
public void createSession(String sessionId)
```

Creates a persistent background session.

**Parameters**:

- `sessionId` _String_ \- unique session identifier

**Throws**:

- `DaytonaException` \- if session creation fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/process/\#getsession) getSession()

[Section titled “getSession()”](https://www.daytona.io/docs/en/java-sdk/process/#getsession)

```
public Session getSession(String sessionId)
```

Returns session metadata.

**Parameters**:

- `sessionId` _String_ \- session identifier

**Returns**:

- `Session` \- session metadata

**Throws**:

- `DaytonaException` \- if retrieval fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/process/\#getentrypointsession) getEntrypointSession()

[Section titled “getEntrypointSession()”](https://www.daytona.io/docs/en/java-sdk/process/#getentrypointsession)

```
public Session getEntrypointSession()
```

Returns entrypoint session metadata.

**Returns**:

- `Session` \- entrypoint session metadata

**Throws**:

- `DaytonaException` \- if retrieval fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/process/\#executesessioncommand) executeSessionCommand()

[Section titled “executeSessionCommand()”](https://www.daytona.io/docs/en/java-sdk/process/#executesessioncommand)

```
public SessionExecuteResponse executeSessionCommand(String sessionId, SessionExecuteRequest req)
```

Executes a command in an existing session.

**Parameters**:

- `sessionId` _String_ \- session identifier
- `req` _SessionExecuteRequest_ \- execution request

**Returns**:

- `SessionExecuteResponse` \- command execution response

**Throws**:

- `DaytonaException` \- if execution fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/process/\#getsessioncommand) getSessionCommand()

[Section titled “getSessionCommand()”](https://www.daytona.io/docs/en/java-sdk/process/#getsessioncommand)

```
public Command getSessionCommand(String sessionId, String commandId)
```

Returns metadata for a command executed in a session.

**Parameters**:

- `sessionId` _String_ \- session identifier
- `commandId` _String_ \- command identifier

**Returns**:

- `Command` \- command metadata

**Throws**:

- `DaytonaException` \- if retrieval fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/process/\#getsessioncommandlogs) getSessionCommandLogs()

[Section titled “getSessionCommandLogs()”](https://www.daytona.io/docs/en/java-sdk/process/#getsessioncommandlogs)

```
public SessionCommandLogsResponse getSessionCommandLogs(String sessionId, String commandId)
```

Returns logs for a command executed in a session.

**Parameters**:

- `sessionId` _String_ \- session identifier
- `commandId` _String_ \- command identifier

**Returns**:

- `SessionCommandLogsResponse` \- command logs

**Throws**:

- `DaytonaException` \- if retrieval fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/process/\#getentrypointlogs) getEntrypointLogs()

[Section titled “getEntrypointLogs()”](https://www.daytona.io/docs/en/java-sdk/process/#getentrypointlogs)

```
public SessionCommandLogsResponse getEntrypointLogs()
```

Returns one-shot logs for the sandbox entrypoint session.

**Returns**:

- `SessionCommandLogsResponse` \- entrypoint logs

**Throws**:

- `DaytonaException` \- if retrieval fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/process/\#getentrypointlogs-1) getEntrypointLogs()

[Section titled “getEntrypointLogs()”](https://www.daytona.io/docs/en/java-sdk/process/#getentrypointlogs-1)

```
public void getEntrypointLogs(Consumer<String> onStdout, Consumer<String> onStderr)
```

Streams logs for the sandbox entrypoint session via WebSocket.

**Parameters**:

- `onStdout` _Consumer<String>_ \- callback for stdout chunks
- `onStderr` _Consumer<String>_ \- callback for stderr chunks

**Throws**:

- `DaytonaException` \- if streaming fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/process/\#sendsessioncommandinput) sendSessionCommandInput()

[Section titled “sendSessionCommandInput()”](https://www.daytona.io/docs/en/java-sdk/process/#sendsessioncommandinput)

```
public void sendSessionCommandInput(String sessionId, String commandId, String data)
```

Sends input data to a command executed in a session.

**Parameters**:

- `sessionId` _String_ \- session identifier
- `commandId` _String_ \- command identifier
- `data` _String_ \- input text to send

**Throws**:

- `DaytonaException` \- if sending input fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/process/\#deletesession) deleteSession()

[Section titled “deleteSession()”](https://www.daytona.io/docs/en/java-sdk/process/#deletesession)

```
public void deleteSession(String sessionId)
```

Deletes a session.

**Parameters**:

- `sessionId` _String_ \- session identifier

**Throws**:

- `DaytonaException` \- if deletion fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/process/\#listsessions) listSessions()

[Section titled “listSessions()”](https://www.daytona.io/docs/en/java-sdk/process/#listsessions)

```
public List<Session> listSessions()
```

Lists all sessions in the Sandbox.

**Returns**:

- `List\<Session\>` \- session list

**Throws**:

- `DaytonaException` \- if listing fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/process/\#createpty) createPty()

[Section titled “createPty()”](https://www.daytona.io/docs/en/java-sdk/process/#createpty)

```
public PtyHandle createPty(PtyCreateOptions options)
```

Creates a PTY terminal session.

**Parameters**:

- `options` _PtyCreateOptions_ \- PTY options, or `null` to use defaults

**Returns**:

- `PtyHandle` \- PTY handle for streaming I/O and lifecycle operations

**Throws**:

- `DaytonaException` \- if PTY session creation fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/process/\#connectpty) connectPty()

[Section titled “connectPty()”](https://www.daytona.io/docs/en/java-sdk/process/#connectpty)

```
public PtyHandle connectPty(String sessionId)
```

Connects to an existing PTY terminal session.

**Parameters**:

- `sessionId` _String_ \- PTY session identifier

**Returns**:

- `PtyHandle` \- PTY handle for streaming I/O and lifecycle operations

**Throws**:

- `DaytonaException` \- if websocket connection setup fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/process/\#connectpty-1) connectPty()

[Section titled “connectPty()”](https://www.daytona.io/docs/en/java-sdk/process/#connectpty-1)

```
public PtyHandle connectPty(String sessionId, PtyCreateOptions options)
```

Connects to an existing PTY terminal session.

**Parameters**:

- `sessionId` _String_ \- PTY session identifier
- `options` _PtyCreateOptions_ \- PTY options, used for data callback configuration

**Returns**:

- `PtyHandle` \- PTY handle for streaming I/O and lifecycle operations

**Throws**:

- `DaytonaException` \- if websocket connection setup fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/process/\#listptysessions) listPtySessions()

[Section titled “listPtySessions()”](https://www.daytona.io/docs/en/java-sdk/process/#listptysessions)

```
public List<PtySessionInfo> listPtySessions()
```

Lists PTY sessions in the Sandbox.

**Returns**:

- `List\<PtySessionInfo\>` \- PTY session information list

**Throws**:

- `DaytonaException` \- if listing fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/process/\#getptysessioninfo) getPtySessionInfo()

[Section titled “getPtySessionInfo()”](https://www.daytona.io/docs/en/java-sdk/process/#getptysessioninfo)

```
public PtySessionInfo getPtySessionInfo(String sessionId)
```

Returns PTY session information.

**Parameters**:

- `sessionId` _String_ \- PTY session identifier

**Returns**:

- `PtySessionInfo` \- PTY session information

**Throws**:

- `DaytonaException` \- if retrieval fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/process/\#resizeptysession) resizePtySession()

[Section titled “resizePtySession()”](https://www.daytona.io/docs/en/java-sdk/process/#resizeptysession)

```
public void resizePtySession(String sessionId, int cols, int rows)
```

Resizes an active PTY session.

**Parameters**:

- `sessionId` _String_ \- PTY session identifier
- `cols` _int_ \- terminal width in columns
- `rows` _int_ \- terminal height in rows

**Throws**:

- `DaytonaException` \- if resize fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/process/\#killptysession) killPtySession()

[Section titled “killPtySession()”](https://www.daytona.io/docs/en/java-sdk/process/#killptysession)

```
public void killPtySession(String sessionId)
```

Terminates a PTY session.

**Parameters**:

- `sessionId` _String_ \- PTY session identifier

**Throws**:

- `DaytonaException` \- if termination fails