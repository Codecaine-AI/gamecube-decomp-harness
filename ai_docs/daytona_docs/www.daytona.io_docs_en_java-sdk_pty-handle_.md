---
url: "https://www.daytona.io/docs/en/java-sdk/pty-handle/"
title: "PtyHandle | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/java-sdk/pty-handle/#_top)

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/java-sdk/pty-handle.md)Open

## [\#](https://www.daytona.io/docs/en/java-sdk/pty-handle/\#ptyhandle) PtyHandle

[Section titled “PtyHandle”](https://www.daytona.io/docs/en/java-sdk/pty-handle/#ptyhandle)

Handle for interacting with an active PTY session.

Supports bidirectional I/O, resize, kill, and waiting for connection/exit events.

### [\#](https://www.daytona.io/docs/en/java-sdk/pty-handle/\#methods) Methods

[Section titled “Methods”](https://www.daytona.io/docs/en/java-sdk/pty-handle/#methods)

#### [\#](https://www.daytona.io/docs/en/java-sdk/pty-handle/\#waitforconnection) waitForConnection()

[Section titled “waitForConnection()”](https://www.daytona.io/docs/en/java-sdk/pty-handle/#waitforconnection)

```
public void waitForConnection(long timeoutSeconds)
```

Waits for PTY websocket connection to be fully established.

**Parameters**:

- `timeoutSeconds` _long_ \- maximum seconds to wait

**Throws**:

- `DaytonaException` \- if connection fails or times out

#### [\#](https://www.daytona.io/docs/en/java-sdk/pty-handle/\#sendinput) sendInput()

[Section titled “sendInput()”](https://www.daytona.io/docs/en/java-sdk/pty-handle/#sendinput)

```
public void sendInput(String data)
```

Sends text input to PTY.

**Parameters**:

- `data` _String_ \- UTF-8 text to send

**Throws**:

- `DaytonaException` \- if sending fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/pty-handle/\#sendinput-1) sendInput()

[Section titled “sendInput()”](https://www.daytona.io/docs/en/java-sdk/pty-handle/#sendinput-1)

```
public void sendInput(byte[] data)
```

Sends binary input to PTY.

**Parameters**:

- `data` _byte\[\]_ \- binary payload

**Throws**:

- `DaytonaException` \- if sending fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/pty-handle/\#waitforexit) waitForExit()

[Section titled “waitForExit()”](https://www.daytona.io/docs/en/java-sdk/pty-handle/#waitforexit)

```
public PtyResult waitForExit()
```

Waits until the PTY session exits.

**Returns**:

- `PtyResult` \- final PTY result

**Throws**:

- `DaytonaException` \- if interrupted while waiting

#### [\#](https://www.daytona.io/docs/en/java-sdk/pty-handle/\#waitforexit-1) waitForExit()

[Section titled “waitForExit()”](https://www.daytona.io/docs/en/java-sdk/pty-handle/#waitforexit-1)

```
public PtyResult waitForExit(long timeoutSeconds)
```

Waits for PTY exit with timeout.

**Parameters**:

- `timeoutSeconds` _long_ \- maximum seconds to wait

**Returns**:

- `PtyResult` \- final PTY result, or timeout result when exit does not occur in time

**Throws**:

- `DaytonaException` \- if interrupted while waiting

#### [\#](https://www.daytona.io/docs/en/java-sdk/pty-handle/\#resize) resize()

[Section titled “resize()”](https://www.daytona.io/docs/en/java-sdk/pty-handle/#resize)

```
public void resize(int cols, int rows)
```

Resizes terminal dimensions.

**Parameters**:

- `cols` _int_ \- terminal width in columns
- `rows` _int_ \- terminal height in rows

#### [\#](https://www.daytona.io/docs/en/java-sdk/pty-handle/\#kill) kill()

[Section titled “kill()”](https://www.daytona.io/docs/en/java-sdk/pty-handle/#kill)

```
public void kill()
```

Terminates PTY session.

#### [\#](https://www.daytona.io/docs/en/java-sdk/pty-handle/\#disconnect) disconnect()

[Section titled “disconnect()”](https://www.daytona.io/docs/en/java-sdk/pty-handle/#disconnect)

```
public void disconnect()
```

Disconnects the PTY websocket.

#### [\#](https://www.daytona.io/docs/en/java-sdk/pty-handle/\#getsessionid) getSessionId()

[Section titled “getSessionId()”](https://www.daytona.io/docs/en/java-sdk/pty-handle/#getsessionid)

```
public String getSessionId()
```

Returns PTY session identifier.

**Returns**:

- `String` \- session ID

#### [\#](https://www.daytona.io/docs/en/java-sdk/pty-handle/\#getexitcode) getExitCode()

[Section titled “getExitCode()”](https://www.daytona.io/docs/en/java-sdk/pty-handle/#getexitcode)

```
public Integer getExitCode()
```

Returns PTY exit code when available.

**Returns**:

- `Integer` \- exit code, or `null` if not known yet

#### [\#](https://www.daytona.io/docs/en/java-sdk/pty-handle/\#geterror) getError()

[Section titled “getError()”](https://www.daytona.io/docs/en/java-sdk/pty-handle/#geterror)

```
public String getError()
```

Returns PTY error or exit reason.

**Returns**:

- `String` \- error message, or `null` when none

#### [\#](https://www.daytona.io/docs/en/java-sdk/pty-handle/\#isconnected) isConnected()

[Section titled “isConnected()”](https://www.daytona.io/docs/en/java-sdk/pty-handle/#isconnected)

```
public boolean isConnected()
```

Returns websocket connectivity status.

**Returns**:

- `boolean` \- `true` when socket is currently connected