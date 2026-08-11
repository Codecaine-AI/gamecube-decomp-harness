---
url: "https://www.daytona.io/docs/en/python-sdk/sync/lsp-server/"
title: "LspServer | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/python-sdk/sync/lsp-server/#_top)

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/python-sdk/sync/lsp-server.md)Open

## [\#](https://www.daytona.io/docs/en/python-sdk/sync/lsp-server/\#lspserver) LspServer

[Section titled “LspServer”](https://www.daytona.io/docs/en/python-sdk/sync/lsp-server/#lspserver)

```
class LspServer()
```

Provides Language Server Protocol functionality for code intelligence to provide
IDE-like features such as code completion, symbol search, and more.

#### [\#](https://www.daytona.io/docs/en/python-sdk/sync/lsp-server/\#lspserver__init__) LspServer.\_\_init\_\_

[Section titled “LspServer.\_\_init\_\_”](https://www.daytona.io/docs/en/python-sdk/sync/lsp-server/#lspserver__init__)

```
def __init__(language_id: LspLanguageId | LspLanguageIdLiteral,

             path_to_project: str, api_client: LspApi)
```

Initializes a new LSP server instance.

**Arguments**:

- `language_id` _LspLanguageId \| LspLanguageIdLiteral_ \- The language server type
(e.g., LspLanguageId.TYPESCRIPT).
- `path_to_project` _str_ \- Absolute path to the project root directory.
- `api_client` _LspApi_ \- API client for Sandbox operations.

#### [\#](https://www.daytona.io/docs/en/python-sdk/sync/lsp-server/\#lspserverstart) LspServer.start

[Section titled “LspServer.start”](https://www.daytona.io/docs/en/python-sdk/sync/lsp-server/#lspserverstart)

```
@intercept_errors(message_prefix="Failed to start LSP server: ")

@with_instrumentation()

def start(request_timeout: float | None = None) -> None
```

Starts the language server.

This method must be called before using any other LSP functionality.
It initializes the language server for the specified language and project.

**Arguments**:

- `request_timeout` _float \| None_ \- Optional client-side request timeout in seconds. Client-side
only. It bounds how long the SDK waits for the HTTP response and does not cancel
the operation on the server. Positive values under 1 second are rounded up to 1
second; 0 disables the client-side timeout and negative values are rejected.

**Example**:

```
lsp = sandbox.create_lsp_server("typescript", "workspace/project")

lsp.start()  # Initialize the server

# Now ready for LSP operations
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/sync/lsp-server/\#lspserverstop) LspServer.stop

[Section titled “LspServer.stop”](https://www.daytona.io/docs/en/python-sdk/sync/lsp-server/#lspserverstop)

```
@intercept_errors(message_prefix="Failed to stop LSP server: ")

@with_instrumentation()

def stop(request_timeout: float | None = None) -> None
```

Stops the language server.

This method should be called when the LSP server is no longer needed to
free up system resources.

**Arguments**:

- `request_timeout` _float \| None_ \- Optional client-side request timeout in seconds. Client-side
only. It bounds how long the SDK waits for the HTTP response and does not cancel
the operation on the server. Positive values under 1 second are rounded up to 1
second; 0 disables the client-side timeout and negative values are rejected.

**Example**:

```
# When done with LSP features

lsp.stop()  # Clean up resources
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/sync/lsp-server/\#lspserverdid_open) LspServer.did\_open

[Section titled “LspServer.did\_open”](https://www.daytona.io/docs/en/python-sdk/sync/lsp-server/#lspserverdid_open)

```
@intercept_errors(message_prefix="Failed to open file: ")

@with_instrumentation()

def did_open(path: str, request_timeout: float | None = None) -> None
```

Notifies the language server that a file has been opened.

This method should be called when a file is opened in the editor to enable
language features like diagnostics and completions for that file. The server
will begin tracking the file’s contents and providing language features.

**Arguments**:

- `path` _str_ \- Path to the opened file. Relative paths are resolved based on the project path
set in the LSP server constructor.
- `request_timeout` _float \| None_ \- Optional client-side request timeout in seconds. Client-side
only. It bounds how long the SDK waits for the HTTP response and does not cancel
the operation on the server. Positive values under 1 second are rounded up to 1
second; 0 disables the client-side timeout and negative values are rejected.

**Example**:

```
# When opening a file for editing

lsp.did_open("workspace/project/src/index.ts")

# Now can get completions, symbols, etc. for this file
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/sync/lsp-server/\#lspserverdid_close) LspServer.did\_close

[Section titled “LspServer.did\_close”](https://www.daytona.io/docs/en/python-sdk/sync/lsp-server/#lspserverdid_close)

```
@intercept_errors(message_prefix="Failed to close file: ")

@with_instrumentation()

def did_close(path: str, request_timeout: float | None = None) -> None
```

Notify the language server that a file has been closed.

This method should be called when a file is closed in the editor to allow
the language server to clean up any resources associated with that file.

**Arguments**:

- `path` _str_ \- Path to the closed file. Relative paths are resolved based on the project path
set in the LSP server constructor.
- `request_timeout` _float \| None_ \- Optional client-side request timeout in seconds. Client-side
only. It bounds how long the SDK waits for the HTTP response and does not cancel
the operation on the server. Positive values under 1 second are rounded up to 1
second; 0 disables the client-side timeout and negative values are rejected.

**Example**:

```
# When done editing a file

lsp.did_close("workspace/project/src/index.ts")
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/sync/lsp-server/\#lspserverdocument_symbols) LspServer.document\_symbols

[Section titled “LspServer.document\_symbols”](https://www.daytona.io/docs/en/python-sdk/sync/lsp-server/#lspserverdocument_symbols)

```
@intercept_errors(message_prefix="Failed to get symbols from document: ")

@with_instrumentation()

def document_symbols(path: str,

                     request_timeout: float | None = None) -> list[LspSymbol]
```

Gets symbol information (functions, classes, variables, etc.) from a document.

**Arguments**:

- `path` _str_ \- Path to the file to get symbols from. Relative paths are resolved based on the project path
set in the LSP server constructor.
- `request_timeout` _float \| None_ \- Optional client-side request timeout in seconds. Client-side
only. It bounds how long the SDK waits for the HTTP response and does not cancel
the operation on the server. Positive values under 1 second are rounded up to 1
second; 0 disables the client-side timeout and negative values are rejected.

**Returns**:

- `list[LspSymbol]`\- List of symbols in the document. Each symbol includes:

  - name: The symbol’s name
  - kind: The symbol’s kind (function, class, variable, etc.)
  - location: The location of the symbol in the file

**Example**:

```
# Get all symbols in a file

symbols = lsp.document_symbols("workspace/project/src/index.ts")

for symbol in symbols:

    print(f"{symbol.kind} {symbol.name}: {symbol.location}")
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/sync/lsp-server/\#lspserverworkspace_symbols) LspServer.workspace\_symbols

[Section titled “LspServer.workspace\_symbols”](https://www.daytona.io/docs/en/python-sdk/sync/lsp-server/#lspserverworkspace_symbols)

```
@deprecated(

    reason=

    "Method is deprecated. Use `sandbox_symbols` instead. This method will be removed in a future version."

)

@with_instrumentation()

def workspace_symbols(query: str,

                      request_timeout: float | None = None) -> list[LspSymbol]
```

Searches for symbols matching the query string across all files
in the Sandbox.

**Arguments**:

- `query` _str_ \- Search query to match against symbol names.
- `request_timeout` _float \| None_ \- Optional client-side request timeout in seconds. Client-side
only. It bounds how long the SDK waits for the HTTP response and does not cancel
the operation on the server. Positive values under 1 second are rounded up to 1
second; 0 disables the client-side timeout and negative values are rejected.

**Returns**:

- `list[LspSymbol]` \- List of matching symbols from all files.

#### [\#](https://www.daytona.io/docs/en/python-sdk/sync/lsp-server/\#lspserversandbox_symbols) LspServer.sandbox\_symbols

[Section titled “LspServer.sandbox\_symbols”](https://www.daytona.io/docs/en/python-sdk/sync/lsp-server/#lspserversandbox_symbols)

```
@intercept_errors(message_prefix="Failed to get symbols from sandbox: ")

@with_instrumentation()

def sandbox_symbols(query: str,

                    request_timeout: float | None = None) -> list[LspSymbol]
```

Searches for symbols matching the query string across all files
in the Sandbox.

**Arguments**:

- `query` _str_ \- Search query to match against symbol names.
- `request_timeout` _float \| None_ \- Optional client-side request timeout in seconds. Client-side
only. It bounds how long the SDK waits for the HTTP response and does not cancel
the operation on the server. Positive values under 1 second are rounded up to 1
second; 0 disables the client-side timeout and negative values are rejected.

**Returns**:

- `list[LspSymbol]`\- List of matching symbols from all files. Each symbol
includes:

  - name: The symbol’s name
  - kind: The symbol’s kind (function, class, variable, etc.)
  - location: The location of the symbol in the file

**Example**:

```
# Search for all symbols containing "User"

symbols = lsp.sandbox_symbols("User")

for symbol in symbols:

    print(f"{symbol.name} in {symbol.location}")
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/sync/lsp-server/\#lspservercompletions) LspServer.completions

[Section titled “LspServer.completions”](https://www.daytona.io/docs/en/python-sdk/sync/lsp-server/#lspservercompletions)

```
@intercept_errors(message_prefix="Failed to get completions: ")

@with_instrumentation()

def completions(path: str,

                position: LspCompletionPosition,

                request_timeout: float | None = None) -> CompletionList
```

Gets completion suggestions at a position in a file.

**Arguments**:

- `path` _str_ \- Path to the file. Relative paths are resolved based on the project path
set in the LSP server constructor.
- `position` _LspCompletionPosition_ \- Cursor position to get completions for.
- `request_timeout` _float \| None_ \- Optional client-side request timeout in seconds. Client-side
only. It bounds how long the SDK waits for the HTTP response and does not cancel
the operation on the server. Positive values under 1 second are rounded up to 1
second; 0 disables the client-side timeout and negative values are rejected.

**Returns**:

- `CompletionList`\- List of completion suggestions. The list includes:

  - isIncomplete: Whether more items might be available
  - items: List of completion items, each containing:
  - label: The text to insert
  - kind: The kind of completion
  - detail: Additional details about the item
  - documentation: Documentation for the item
  - sortText: Text used to sort the item in the list
  - filterText: Text used to filter the item
  - insertText: The actual text to insert (if different from label)

**Example**:

```
# Get completions at a specific position

pos = LspCompletionPosition(line=10, character=15)

completions = lsp.completions("workspace/project/src/index.ts", pos)

for item in completions.items:

    print(f"{item.label} ({item.kind}): {item.detail}")
```

## [\#](https://www.daytona.io/docs/en/python-sdk/sync/lsp-server/\#lsplanguageid) LspLanguageId

[Section titled “LspLanguageId”](https://www.daytona.io/docs/en/python-sdk/sync/lsp-server/#lsplanguageid)

```
class LspLanguageId(str, Enum)
```

Language IDs for Language Server Protocol (LSP).

**Enum Members**:

- `PYTHON` (“python”)
- `TYPESCRIPT` (“typescript”)
- `JAVASCRIPT` (“javascript”)

## [\#](https://www.daytona.io/docs/en/python-sdk/sync/lsp-server/\#lspcompletionposition) LspCompletionPosition

[Section titled “LspCompletionPosition”](https://www.daytona.io/docs/en/python-sdk/sync/lsp-server/#lspcompletionposition)

```
@dataclass

class LspCompletionPosition()
```

Represents a zero-based completion position in a text document,
specified by line number and character offset.

**Attributes**:

- `line` _int_ \- Zero-based line number in the document.
- `character` _int_ \- Zero-based character offset on the line.