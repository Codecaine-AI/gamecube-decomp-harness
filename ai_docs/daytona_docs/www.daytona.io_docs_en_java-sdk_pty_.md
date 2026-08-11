---
url: "https://www.daytona.io/docs/en/java-sdk/pty/"
title: "Pty | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/java-sdk/pty/#_top)

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/java-sdk/pty.md)Open

## [\#](https://www.daytona.io/docs/en/java-sdk/pty/\#ptycreateoptions) PtyCreateOptions

[Section titled “PtyCreateOptions”](https://www.daytona.io/docs/en/java-sdk/pty/#ptycreateoptions)

Options used when creating a PTY session in a Sandbox.

### [\#](https://www.daytona.io/docs/en/java-sdk/pty/\#constructors) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/java-sdk/pty/#constructors)

#### [\#](https://www.daytona.io/docs/en/java-sdk/pty/\#new-ptycreateoptions) new PtyCreateOptions()

[Section titled “new PtyCreateOptions()”](https://www.daytona.io/docs/en/java-sdk/pty/#new-ptycreateoptions)

```
public PtyCreateOptions()
```

Creates PTY options with default dimensions (`120x30`).

#### [\#](https://www.daytona.io/docs/en/java-sdk/pty/\#new-ptycreateoptions-1) new PtyCreateOptions()

[Section titled “new PtyCreateOptions()”](https://www.daytona.io/docs/en/java-sdk/pty/#new-ptycreateoptions-1)

```
public PtyCreateOptions(String id, int cols, int rows, Consumer<byte[]> onData)
```

Creates PTY options with explicit values.

**Parameters**:

- `id` _String_ \- custom PTY session identifier; if `null`, the server generates one
- `cols` _int_ \- terminal width in columns
- `rows` _int_ \- terminal height in rows
- `onData` _Consumer<byte\[\]>_ \- callback invoked for each PTY output chunk

### [\#](https://www.daytona.io/docs/en/java-sdk/pty/\#methods) Methods

[Section titled “Methods”](https://www.daytona.io/docs/en/java-sdk/pty/#methods)

#### [\#](https://www.daytona.io/docs/en/java-sdk/pty/\#getid) getId()

[Section titled “getId()”](https://www.daytona.io/docs/en/java-sdk/pty/#getid)

```
public String getId()
```

Returns the PTY session identifier to request.

**Returns**:

- `String` \- requested PTY session identifier, or `null` to auto-generate

#### [\#](https://www.daytona.io/docs/en/java-sdk/pty/\#setid) setId()

[Section titled “setId()”](https://www.daytona.io/docs/en/java-sdk/pty/#setid)

```
public PtyCreateOptions setId(String id)
```

Sets the PTY session identifier.

**Parameters**:

- `id` _String_ \- PTY session identifier

**Returns**:

- `PtyCreateOptions` \- this options instance

#### [\#](https://www.daytona.io/docs/en/java-sdk/pty/\#getcols) getCols()

[Section titled “getCols()”](https://www.daytona.io/docs/en/java-sdk/pty/#getcols)

```
public int getCols()
```

Returns terminal width in columns.

**Returns**:

- `int` \- terminal width

#### [\#](https://www.daytona.io/docs/en/java-sdk/pty/\#setcols) setCols()

[Section titled “setCols()”](https://www.daytona.io/docs/en/java-sdk/pty/#setcols)

```
public PtyCreateOptions setCols(int cols)
```

Sets terminal width in columns.

**Parameters**:

- `cols` _int_ \- terminal width

**Returns**:

- `PtyCreateOptions` \- this options instance

#### [\#](https://www.daytona.io/docs/en/java-sdk/pty/\#getrows) getRows()

[Section titled “getRows()”](https://www.daytona.io/docs/en/java-sdk/pty/#getrows)

```
public int getRows()
```

Returns terminal height in rows.

**Returns**:

- `int` \- terminal height

#### [\#](https://www.daytona.io/docs/en/java-sdk/pty/\#setrows) setRows()

[Section titled “setRows()”](https://www.daytona.io/docs/en/java-sdk/pty/#setrows)

```
public PtyCreateOptions setRows(int rows)
```

Sets terminal height in rows.

**Parameters**:

- `rows` _int_ \- terminal height

**Returns**:

- `PtyCreateOptions` \- this options instance

#### [\#](https://www.daytona.io/docs/en/java-sdk/pty/\#getondata) getOnData()

[Section titled “getOnData()”](https://www.daytona.io/docs/en/java-sdk/pty/#getondata)

```
public Consumer<byte[]> getOnData()
```

Returns callback used for streaming PTY output.

**Returns**:

- `Consumer\<byte[]\>` \- PTY output callback, or `null` when not configured

#### [\#](https://www.daytona.io/docs/en/java-sdk/pty/\#setondata) setOnData()

[Section titled “setOnData()”](https://www.daytona.io/docs/en/java-sdk/pty/#setondata)

```
public PtyCreateOptions setOnData(Consumer<byte[]> onData)
```

Sets callback invoked for each PTY output chunk.

**Parameters**:

- `onData` _Consumer<byte\[\]>_ \- callback receiving raw PTY bytes

**Returns**:

- `PtyCreateOptions` \- this options instance

#### [\#](https://www.daytona.io/docs/en/java-sdk/pty/\#getcwd) getCwd()

[Section titled “getCwd()”](https://www.daytona.io/docs/en/java-sdk/pty/#getcwd)

```
public String getCwd()
```

Returns the working directory for the PTY session.

**Returns**:

- `String` \- working directory, or `null` to use the sandbox default

#### [\#](https://www.daytona.io/docs/en/java-sdk/pty/\#setcwd) setCwd()

[Section titled “setCwd()”](https://www.daytona.io/docs/en/java-sdk/pty/#setcwd)

```
public PtyCreateOptions setCwd(String cwd)
```

Sets the working directory for the PTY session.

**Parameters**:

- `cwd` _String_ \- working directory

**Returns**:

- `PtyCreateOptions` \- this options instance

#### [\#](https://www.daytona.io/docs/en/java-sdk/pty/\#getenvs) getEnvs()

[Section titled “getEnvs()”](https://www.daytona.io/docs/en/java-sdk/pty/#getenvs)

```
public Map<String, String> getEnvs()
```

Returns environment variables for the PTY session.

**Returns**:

- `Map\<String, String\>` \- environment variables, or `null` when none configured

#### [\#](https://www.daytona.io/docs/en/java-sdk/pty/\#setenvs) setEnvs()

[Section titled “setEnvs()”](https://www.daytona.io/docs/en/java-sdk/pty/#setenvs)

```
public PtyCreateOptions setEnvs(Map<String, String> envs)
```

Sets environment variables for the PTY session.

**Parameters**:

- `envs` _Map<String, String>_ \- environment variables

**Returns**:

- `PtyCreateOptions` \- this options instance

## [\#](https://www.daytona.io/docs/en/java-sdk/pty/\#ptyresult) PtyResult

[Section titled “PtyResult”](https://www.daytona.io/docs/en/java-sdk/pty/#ptyresult)

Final outcome of a PTY session.

Contains exit status and an optional error/exit reason reported by the PTY backend.

### [\#](https://www.daytona.io/docs/en/java-sdk/pty/\#constructors-1) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/java-sdk/pty/#constructors-1)

#### [\#](https://www.daytona.io/docs/en/java-sdk/pty/\#new-ptyresult) new PtyResult()

[Section titled “new PtyResult()”](https://www.daytona.io/docs/en/java-sdk/pty/#new-ptyresult)

```
public PtyResult(int exitCode, String error)
```

Creates a PTY result object.

**Parameters**:

- `exitCode` _int_ \- exit code returned by the PTY process; negative values indicate no exit code
- `error` _String_ \- optional error or exit reason

### [\#](https://www.daytona.io/docs/en/java-sdk/pty/\#methods-1) Methods

[Section titled “Methods”](https://www.daytona.io/docs/en/java-sdk/pty/#methods-1)

#### [\#](https://www.daytona.io/docs/en/java-sdk/pty/\#getexitcode) getExitCode()

[Section titled “getExitCode()”](https://www.daytona.io/docs/en/java-sdk/pty/#getexitcode)

```
public int getExitCode()
```

Returns the process exit code.

**Returns**:

- `int` \- PTY process exit code

#### [\#](https://www.daytona.io/docs/en/java-sdk/pty/\#geterror) getError()

[Section titled “getError()”](https://www.daytona.io/docs/en/java-sdk/pty/#geterror)

```
public String getError()
```

Returns the PTY error or exit reason when available.

**Returns**:

- `String` \- error message, or `null` when the session ended successfully