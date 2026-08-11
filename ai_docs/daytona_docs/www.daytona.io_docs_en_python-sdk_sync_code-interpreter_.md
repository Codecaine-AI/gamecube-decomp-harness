---
url: "https://www.daytona.io/docs/en/python-sdk/sync/code-interpreter/"
title: "CodeInterpreter | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/python-sdk/sync/code-interpreter/#_top)

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/python-sdk/sync/code-interpreter.md)Open

## [\#](https://www.daytona.io/docs/en/python-sdk/sync/code-interpreter/\#codeinterpreter) CodeInterpreter

[Section titled “CodeInterpreter”](https://www.daytona.io/docs/en/python-sdk/sync/code-interpreter/#codeinterpreter)

```
class CodeInterpreter()
```

Handles code interpretation and execution within a Sandbox. Currently supports only Python.

This class provides methods to execute code in isolated interpreter contexts,
manage contexts, and stream execution output via callbacks. If subsequent code executions
are performed in the same context, the variables, imports, and functions defined in
the previous execution will be available.

For other languages, use the `code_run` method from the `Process` interface,
or execute the appropriate command directly in the sandbox terminal.

#### [\#](https://www.daytona.io/docs/en/python-sdk/sync/code-interpreter/\#codeinterpreter__init__) CodeInterpreter.\_\_init\_\_

[Section titled “CodeInterpreter.\_\_init\_\_”](https://www.daytona.io/docs/en/python-sdk/sync/code-interpreter/#codeinterpreter__init__)

```
def __init__(api_client: InterpreterApi, http_client: httpx.Client)
```

Initialize a new CodeInterpreter instance.

**Arguments**:

- `api_client` \- API client for interpreter operations.
- `http_client` \- Shared httpx.Client whose connection pool the WS upgrade reuses.

#### [\#](https://www.daytona.io/docs/en/python-sdk/sync/code-interpreter/\#codeinterpreterrun_code) CodeInterpreter.run\_code

[Section titled “CodeInterpreter.run\_code”](https://www.daytona.io/docs/en/python-sdk/sync/code-interpreter/#codeinterpreterrun_code)

```
@intercept_errors(message_prefix="Failed to run code: ")

def run_code(code: str,

             *,

             context: InterpreterContext | None = None,

             on_stdout: OutputHandler[OutputMessage] | None = None,

             on_stderr: OutputHandler[OutputMessage] | None = None,

             on_error: OutputHandler[ExecutionError] | None = None,

             envs: dict[str, str] | None = None,

             timeout: int | None = None) -> ExecutionResult
```

Execute Python code in the sandbox.

By default, code runs in the default shared context which persists variables,
imports, and functions across executions. To run in an isolated context,
create a new context with `create_context()` and pass it as `context` argument.

**Arguments**:

- `code` _str_ \- Code to execute.
- `context` _InterpreterContext \| None_ \- Context to run code in. If not provided, uses default context.
- `on_stdout` _OutputHandler\[OutputMessage\] \| None_ \- Callback for stdout messages.
- `on_stderr` _OutputHandler\[OutputMessage\] \| None_ \- Callback for stderr messages.
- `on_error` _OutputHandler\[ExecutionError\] \| None_ \- Callback for execution errors
(e.g., syntax errors, runtime errors).
- `envs` _dict\[str, str\] \| None_ \- Environment variables for this execution.
- `timeout` _int \| None_ \- Timeout in seconds. 0 means no timeout. Default is 10 minutes.

**Returns**:

- `ExecutionResult` \- Result object containing stdout, stderr and error if any.

**Raises**:

- `DaytonaTimeoutError` \- If execution times out.
- `DaytonaError` \- If execution fails due to communication or other SDK errors.

**Examples**:

```
def handle_stdout(msg: OutputMessage):

    print(f"STDOUT: {msg.output}", end="")

def handle_stderr(msg: OutputMessage):

    print(f"STDERR: {msg.output}", end="")

def handle_error(err: ExecutionError):

    print(f"ERROR: {err.name}: {err.value}")

code = '''

import sys

import time

for i in range(5):

    print(i)

    time.sleep(1)

sys.stderr.write("Counting done!")

'''

result = sandbox.code_interpreter.run_code(

    code=code,

    on_stdout=handle_stdout,

    on_stderr=handle_stderr,

    on_error=handle_error,

    timeout=10

)
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/sync/code-interpreter/\#codeinterpretercreate_context) CodeInterpreter.create\_context

[Section titled “CodeInterpreter.create\_context”](https://www.daytona.io/docs/en/python-sdk/sync/code-interpreter/#codeinterpretercreate_context)

```
@intercept_errors(message_prefix="Failed to create interpreter context: ")

def create_context(cwd: str | None = None,

                   request_timeout: float | None = None) -> InterpreterContext
```

Create a new isolated interpreter context.

Contexts provide isolated execution environments with their own global namespace.
Variables, imports, and functions defined in one context don’t affect others.

**Arguments**:

- `cwd` _str \| None_ \- Working directory for the context. If not specified, uses sandbox working directory.
- `request_timeout` _float \| None_ \- Optional client-side request timeout in seconds. Client-side
only. It bounds how long the SDK waits for the HTTP response and does not cancel
the operation on the server. Positive values under 1 second are rounded up to 1
second; 0 disables the client-side timeout and negative values are rejected.

**Returns**:

- `InterpreterContext` \- The created context with its ID and metadata.

**Raises**:

- `DaytonaError` \- If context creation fails.

**Examples**:

```
# Create isolated context

ctx = sandbox.code_interpreter.create_context()

# Execute code in this context

sandbox.code_interpreter.run_code("x = 100", context=ctx)

# Variable only exists in this context

result = sandbox.code_interpreter.run_code("print(x)", context=ctx)  # OK

# Won't see the variable in default context

result = sandbox.code_interpreter.run_code("print(x)")  # NameError

# Clean up

sandbox.code_interpreter.delete_context(ctx)
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/sync/code-interpreter/\#codeinterpreterlist_contexts) CodeInterpreter.list\_contexts

[Section titled “CodeInterpreter.list\_contexts”](https://www.daytona.io/docs/en/python-sdk/sync/code-interpreter/#codeinterpreterlist_contexts)

```
@intercept_errors(message_prefix="Failed to list interpreter contexts: ")

def list_contexts(

        request_timeout: float | None = None) -> list[InterpreterContext]
```

List all user-created interpreter contexts.

The default context is not included in this list. Only contexts created
via `create_context()` are returned.

**Arguments**:

- `request_timeout` _float \| None_ \- Optional client-side request timeout in seconds. Client-side
only. It bounds how long the SDK waits for the HTTP response and does not cancel
the operation on the server. Positive values under 1 second are rounded up to 1
second; 0 disables the client-side timeout and negative values are rejected.

**Returns**:

- `list[InterpreterContext]` \- List of context objects.

**Raises**:

- `DaytonaError` \- If listing fails.

**Examples**:

```
contexts = sandbox.code_interpreter.list_contexts()

for ctx in contexts:

    print(f"Context {ctx.id}: {ctx.language} at {ctx.cwd}")
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/sync/code-interpreter/\#codeinterpreterdelete_context) CodeInterpreter.delete\_context

[Section titled “CodeInterpreter.delete\_context”](https://www.daytona.io/docs/en/python-sdk/sync/code-interpreter/#codeinterpreterdelete_context)

```
@intercept_errors(message_prefix="Failed to delete interpreter context: ")

def delete_context(context: InterpreterContext,

                   request_timeout: float | None = None) -> None
```

Delete an interpreter context and shut down all associated processes.

This permanently removes the context and all its state (variables, imports, etc.).
The default context cannot be deleted.

**Arguments**:

- `context` _InterpreterContext_ \- Context to delete.
- `request_timeout` _float \| None_ \- Optional client-side request timeout in seconds. Client-side
only. It bounds how long the SDK waits for the HTTP response and does not cancel
the operation on the server. Positive values under 1 second are rounded up to 1
second; 0 disables the client-side timeout and negative values are rejected.

**Raises**:

- `DaytonaError` \- If deletion fails or context not found.

**Examples**:

```
ctx = sandbox.code_interpreter.create_context()

# ... use context ...

sandbox.code_interpreter.delete_context(ctx)
```

## [\#](https://www.daytona.io/docs/en/python-sdk/sync/code-interpreter/\#outputmessage) OutputMessage

[Section titled “OutputMessage”](https://www.daytona.io/docs/en/python-sdk/sync/code-interpreter/#outputmessage)

```
class OutputMessage(BaseModel)
```

Represents stdout or stderr output from code execution.

**Attributes**:

- `output` \- The output content.

## [\#](https://www.daytona.io/docs/en/python-sdk/sync/code-interpreter/\#executionerror) ExecutionError

[Section titled “ExecutionError”](https://www.daytona.io/docs/en/python-sdk/sync/code-interpreter/#executionerror)

```
class ExecutionError(BaseModel)
```

Represents an error that occurred during code execution.

**Attributes**:

- `name` \- The error type/class name (e.g., “ValueError”, “SyntaxError”).
- `value` \- The error value.
- `traceback` \- Full traceback of the error.

## [\#](https://www.daytona.io/docs/en/python-sdk/sync/code-interpreter/\#executionresult) ExecutionResult

[Section titled “ExecutionResult”](https://www.daytona.io/docs/en/python-sdk/sync/code-interpreter/#executionresult)

```
class ExecutionResult(BaseModel)
```

Result of code execution.

**Attributes**:

- `stdout` \- Standard output from the code execution.
- `stderr` \- Standard error output from the code execution.
- `error` \- Error details if execution failed, None otherwise.