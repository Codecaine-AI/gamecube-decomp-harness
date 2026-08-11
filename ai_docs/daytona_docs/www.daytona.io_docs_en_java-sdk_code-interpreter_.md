---
url: "https://www.daytona.io/docs/en/java-sdk/code-interpreter/"
title: "CodeInterpreter | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/java-sdk/code-interpreter/#_top)

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/java-sdk/code-interpreter.md)Open

## [\#](https://www.daytona.io/docs/en/java-sdk/code-interpreter/\#codeinterpreter) CodeInterpreter

[Section titled “CodeInterpreter”](https://www.daytona.io/docs/en/java-sdk/code-interpreter/#codeinterpreter)

Stateful code interpretation interface for a Sandbox.

Provides Python code execution in interpreter contexts that preserve state between runs.

### [\#](https://www.daytona.io/docs/en/java-sdk/code-interpreter/\#methods) Methods

[Section titled “Methods”](https://www.daytona.io/docs/en/java-sdk/code-interpreter/#methods)

#### [\#](https://www.daytona.io/docs/en/java-sdk/code-interpreter/\#runcode) runCode()

[Section titled “runCode()”](https://www.daytona.io/docs/en/java-sdk/code-interpreter/#runcode)

```
public ExecutionResult runCode(String code)
```

Executes Python code in the default interpreter context.

**Parameters**:

- `code` _String_ \- Python code to execute

**Returns**:

- `ExecutionResult` \- aggregated execution result

**Throws**:

- `DaytonaException` \- if code is empty, connection fails, or execution fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/code-interpreter/\#runcode-1) runCode()

[Section titled “runCode()”](https://www.daytona.io/docs/en/java-sdk/code-interpreter/#runcode-1)

```
public ExecutionResult runCode(String code, RunCodeOptions options)
```

Executes Python code with streaming callbacks and options.

**Parameters**:

- `code` _String_ \- Python code to execute
- `options` _RunCodeOptions_ \- execution options including callbacks and timeout; may be `null`

**Returns**:

- `ExecutionResult` \- aggregated execution result

**Throws**:

- `DaytonaException` \- if code is empty, connection fails, or execution fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/code-interpreter/\#createcontext) createContext()

[Section titled “createContext()”](https://www.daytona.io/docs/en/java-sdk/code-interpreter/#createcontext)

```
public InterpreterContext createContext()
```

Creates a new interpreter context using sandbox defaults.

**Returns**:

- `InterpreterContext` \- created interpreter context metadata

**Throws**:

- `DaytonaException` \- if context creation fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/code-interpreter/\#createcontext-1) createContext()

[Section titled “createContext()”](https://www.daytona.io/docs/en/java-sdk/code-interpreter/#createcontext-1)

```
public InterpreterContext createContext(String cwd)
```

Creates a new interpreter context.

**Parameters**:

- `cwd` _String_ \- working directory for the new context; `null` uses sandbox default

**Returns**:

- `InterpreterContext` \- created interpreter context metadata

**Throws**:

- `DaytonaException` \- if context creation fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/code-interpreter/\#listcontexts) listContexts()

[Section titled “listContexts()”](https://www.daytona.io/docs/en/java-sdk/code-interpreter/#listcontexts)

```
public List<InterpreterContext> listContexts()
```

Lists all user-created interpreter contexts.

**Returns**:

- `List\<InterpreterContext\>` \- list of interpreter contexts; empty list when no contexts exist

**Throws**:

- `DaytonaException` \- if listing contexts fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/code-interpreter/\#deletecontext) deleteContext()

[Section titled “deleteContext()”](https://www.daytona.io/docs/en/java-sdk/code-interpreter/#deletecontext)

```
public void deleteContext(String contextId)
```

Deletes an interpreter context.

**Parameters**:

- `contextId` _String_ \- context identifier to delete

**Throws**:

- `DaytonaException` \- if deletion fails

## [\#](https://www.daytona.io/docs/en/java-sdk/code-interpreter/\#runcodeoptions) RunCodeOptions

[Section titled “RunCodeOptions”](https://www.daytona.io/docs/en/java-sdk/code-interpreter/#runcodeoptions)

Options for `CodeInterpreter#runCode(String, RunCodeOptions)`.

### [\#](https://www.daytona.io/docs/en/java-sdk/code-interpreter/\#constructors) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/java-sdk/code-interpreter/#constructors)

#### [\#](https://www.daytona.io/docs/en/java-sdk/code-interpreter/\#new-runcodeoptions) new RunCodeOptions()

[Section titled “new RunCodeOptions()”](https://www.daytona.io/docs/en/java-sdk/code-interpreter/#new-runcodeoptions)

```
public RunCodeOptions()
```

### [\#](https://www.daytona.io/docs/en/java-sdk/code-interpreter/\#methods-1) Methods

[Section titled “Methods”](https://www.daytona.io/docs/en/java-sdk/code-interpreter/#methods-1)

#### [\#](https://www.daytona.io/docs/en/java-sdk/code-interpreter/\#gettimeout) getTimeout()

[Section titled “getTimeout()”](https://www.daytona.io/docs/en/java-sdk/code-interpreter/#gettimeout)

```
public Integer getTimeout()
```

**Returns**:

- `Integer` -

#### [\#](https://www.daytona.io/docs/en/java-sdk/code-interpreter/\#settimeout) setTimeout()

[Section titled “setTimeout()”](https://www.daytona.io/docs/en/java-sdk/code-interpreter/#settimeout)

```
public RunCodeOptions setTimeout(Integer timeout)
```

**Parameters**:

- `timeout` _Integer_ -

**Returns**:

- `RunCodeOptions` -

#### [\#](https://www.daytona.io/docs/en/java-sdk/code-interpreter/\#getonstdout) getOnStdout()

[Section titled “getOnStdout()”](https://www.daytona.io/docs/en/java-sdk/code-interpreter/#getonstdout)

```
public Consumer<String> getOnStdout()
```

**Returns**:

- `Consumer\<String\>` -

#### [\#](https://www.daytona.io/docs/en/java-sdk/code-interpreter/\#setonstdout) setOnStdout()

[Section titled “setOnStdout()”](https://www.daytona.io/docs/en/java-sdk/code-interpreter/#setonstdout)

```
public RunCodeOptions setOnStdout(Consumer<String> onStdout)
```

**Parameters**:

- `onStdout` _Consumer<String>_ -

**Returns**:

- `RunCodeOptions` -

#### [\#](https://www.daytona.io/docs/en/java-sdk/code-interpreter/\#getonstderr) getOnStderr()

[Section titled “getOnStderr()”](https://www.daytona.io/docs/en/java-sdk/code-interpreter/#getonstderr)

```
public Consumer<String> getOnStderr()
```

**Returns**:

- `Consumer\<String\>` -

#### [\#](https://www.daytona.io/docs/en/java-sdk/code-interpreter/\#setonstderr) setOnStderr()

[Section titled “setOnStderr()”](https://www.daytona.io/docs/en/java-sdk/code-interpreter/#setonstderr)

```
public RunCodeOptions setOnStderr(Consumer<String> onStderr)
```

**Parameters**:

- `onStderr` _Consumer<String>_ -

**Returns**:

- `RunCodeOptions` -

#### [\#](https://www.daytona.io/docs/en/java-sdk/code-interpreter/\#getonerror) getOnError()

[Section titled “getOnError()”](https://www.daytona.io/docs/en/java-sdk/code-interpreter/#getonerror)

```
public Consumer<CodeInterpreter.ExecutionError> getOnError()
```

**Returns**:

- `Consumer\<CodeInterpreter.ExecutionError\>` -

#### [\#](https://www.daytona.io/docs/en/java-sdk/code-interpreter/\#setonerror) setOnError()

[Section titled “setOnError()”](https://www.daytona.io/docs/en/java-sdk/code-interpreter/#setonerror)

```
public RunCodeOptions setOnError(Consumer<CodeInterpreter.ExecutionError> onError)
```

**Parameters**:

- `onError` _Consumer<CodeInterpreter.ExecutionError>_ -

**Returns**:

- `RunCodeOptions` -