---
url: "https://www.daytona.io/docs/en/typescript-sdk/code-interpreter/"
title: "CodeInterpreter | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/typescript-sdk/code-interpreter/#_top)

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/typescript-sdk/code-interpreter.md)Open

## [\#](https://www.daytona.io/docs/en/typescript-sdk/code-interpreter/\#codeinterpreter) CodeInterpreter

[Section titled “CodeInterpreter”](https://www.daytona.io/docs/en/typescript-sdk/code-interpreter/#codeinterpreter)

Handles Python code interpretation and execution within a Sandbox.

Provides methods to execute code (currently only Python) in isolated interpreter contexts,
manage contexts, and stream execution output via callbacks.

For other languages, use the `codeRun` method from the `Process` interface, or execute the appropriate command directly in the sandbox terminal.

### [\#](https://www.daytona.io/docs/en/typescript-sdk/code-interpreter/\#constructors) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/typescript-sdk/code-interpreter/#constructors)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/code-interpreter/\#new-codeinterpreter) new CodeInterpreter()

[Section titled “new CodeInterpreter()”](https://www.daytona.io/docs/en/typescript-sdk/code-interpreter/#new-codeinterpreter)

```
new CodeInterpreter(

   clientConfig: Configuration,

   apiClient: InterpreterApi,

   getPreviewToken: () => Promise<string>): CodeInterpreter
```

**Parameters**:

- `clientConfig` _Configuration_
- `apiClient` _InterpreterApi_
- `getPreviewToken` _() =\> Promise<string>_

**Returns**:

- `CodeInterpreter`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/code-interpreter/\#methods) Methods

[Section titled “Methods”](https://www.daytona.io/docs/en/typescript-sdk/code-interpreter/#methods)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/code-interpreter/\#createcontext) createContext()

[Section titled “createContext()”](https://www.daytona.io/docs/en/typescript-sdk/code-interpreter/#createcontext)

```
createContext(cwd?: string): Promise<InterpreterContext>
```

Create a new isolated interpreter context.

**Parameters**:

- `cwd?` _string_ \- Working directory for the context. Uses sandbox working directory if omitted.

**Returns**:

- `Promise<InterpreterContext>` \- The created context.

**Example:**

```
const ctx = await sandbox.codeInterpreter.createContext()

await sandbox.codeInterpreter.runCode('x = 10', { context: ctx })

await sandbox.codeInterpreter.deleteContext(ctx.id!)
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/code-interpreter/\#deletecontext) deleteContext()

[Section titled “deleteContext()”](https://www.daytona.io/docs/en/typescript-sdk/code-interpreter/#deletecontext)

```
deleteContext(context: InterpreterContext): Promise<void>
```

Delete an interpreter context and shut down its worker process.

**Parameters**:

- `context` _InterpreterContext_ \- Context to delete.

**Returns**:

- `Promise<void>`

**Example:**

```
const ctx = await sandbox.codeInterpreter.createContext()

// ... use context ...

await sandbox.codeInterpreter.deleteContext(ctx)
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/code-interpreter/\#listcontexts) listContexts()

[Section titled “listContexts()”](https://www.daytona.io/docs/en/typescript-sdk/code-interpreter/#listcontexts)

```
listContexts(): Promise<InterpreterContext[]>
```

List all user-created interpreter contexts (default context is excluded).

**Returns**:

- `Promise<InterpreterContext[]>` \- List of contexts.

**Example:**

```
const contexts = await sandbox.codeInterpreter.listContexts()

for (const ctx of contexts) {

  console.log(ctx.id, ctx.language, ctx.cwd)

}
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/code-interpreter/\#runcode) runCode()

[Section titled “runCode()”](https://www.daytona.io/docs/en/typescript-sdk/code-interpreter/#runcode)

```
runCode(code: string, options: RunCodeOptions): Promise<ExecutionResult>
```

Run Python code in the sandbox.

**Parameters**:

- `code` _string_ \- Code to run.
- `options` _RunCodeOptions =_ \- Execution options (context, envs, callbacks, timeout).

**Returns**:

- `Promise<ExecutionResult>` \- ExecutionResult containing stdout, stderr and optional error info.

**Example:**

```
const handleStdout = (msg: OutputMessage) => process.stdout.write(`STDOUT: ${msg.output}`)

const handleStderr = (msg: OutputMessage) => process.stdout.write(`STDERR: ${msg.output}`)

const handleError = (err: ExecutionError) =>

  console.error(`ERROR: ${err.name}: ${err.value}\n${err.traceback ?? ''}`)

const code = `

import sys

import time

for i in range(5):

    print(i)

    time.sleep(1)

sys.stderr.write("Counting done!")

`

const result = await codeInterpreter.runCode(code, {

  onStdout: handleStdout,

  onStderr: handleStderr,

  onError: handleError,

  timeout: 10,

})
```

* * *

## [\#](https://www.daytona.io/docs/en/typescript-sdk/code-interpreter/\#executionerror) ExecutionError

[Section titled “ExecutionError”](https://www.daytona.io/docs/en/typescript-sdk/code-interpreter/#executionerror)

Represents an error that occurred during code execution.

**Properties**:

- `name` _string_ \- Error type/class name (e.g., “ValueError”, “SyntaxError”).
- `traceback?` _string_ \- Full traceback for the error, if available.
- `value` _string_ \- Error value/message.

## [\#](https://www.daytona.io/docs/en/typescript-sdk/code-interpreter/\#executionresult) ExecutionResult

[Section titled “ExecutionResult”](https://www.daytona.io/docs/en/typescript-sdk/code-interpreter/#executionresult)

Result of code execution.

**Properties**:

- `error?` _ExecutionError_ \- Details about an execution error, if one occurred.
- `stderr` _string_ \- Standard error captured during execution.
- `stdout` _string_ \- Standard output captured during execution.

## [\#](https://www.daytona.io/docs/en/typescript-sdk/code-interpreter/\#outputmessage) OutputMessage

[Section titled “OutputMessage”](https://www.daytona.io/docs/en/typescript-sdk/code-interpreter/#outputmessage)

Represents stdout or stderr output from code execution.

**Properties**:

- `output` _string_ \- Output content.

## [\#](https://www.daytona.io/docs/en/typescript-sdk/code-interpreter/\#runcodeoptions) RunCodeOptions

[Section titled “RunCodeOptions”](https://www.daytona.io/docs/en/typescript-sdk/code-interpreter/#runcodeoptions)

Options for executing code in the interpreter.

**Properties**:

- `context?` _InterpreterContext_ \- Interpreter context to run code in.

- `envs?` _Record<string, string>_ \- Environment variables for this execution.

- `onError()?` _(error: ExecutionError) => any_ \- Callback for execution errors (e.g., runtime exceptions).

**Parameters**:


  - `error` _ExecutionError_

**Returns**:
  - `any`
- `onStderr()?` _(message: OutputMessage) => any_ \- Callback for stderr messages.

**Parameters**:


  - `message` _OutputMessage_

**Returns**:
  - `any`
- `onStdout()?` _(message: OutputMessage) => any_ \- Callback for stdout messages.

**Parameters**:


  - `message` _OutputMessage_

**Returns**:
  - `any`
- `timeout?` _number_ \- Timeout in seconds. Set to 0 for no timeout. Default is 10 minutes.