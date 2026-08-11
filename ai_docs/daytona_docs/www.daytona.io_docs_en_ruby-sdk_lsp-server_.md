---
url: "https://www.daytona.io/docs/en/ruby-sdk/lsp-server/"
title: "LspServer | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/ruby-sdk/lsp-server/#_top)

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/ruby-sdk/lsp-server.md)Open

## [\#](https://www.daytona.io/docs/en/ruby-sdk/lsp-server/\#lspserver) LspServer

[Section titled “LspServer”](https://www.daytona.io/docs/en/ruby-sdk/lsp-server/#lspserver)

LspServer class for Daytona SDK.

### [\#](https://www.daytona.io/docs/en/ruby-sdk/lsp-server/\#constructors) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/ruby-sdk/lsp-server/#constructors)

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/lsp-server/\#new-lspserver) new LspServer()

[Section titled “new LspServer()”](https://www.daytona.io/docs/en/ruby-sdk/lsp-server/#new-lspserver)

```
def initialize(language_id:, path_to_project:, toolbox_api:, sandbox_id:, otel_state: nil)
```

**Parameters**:

- `language_id` _Symbol_ -
- `path_to_project` _String_ -
- `toolbox_api` _DaytonaToolboxApiClient:LspApi_ -
- `sandbox_id` _String_ -
- `otel_state` _Daytona:OtelState, nil_ -

**Returns**:

- `LspServer` \- a new instance of LspServer

### [\#](https://www.daytona.io/docs/en/ruby-sdk/lsp-server/\#methods) Methods

[Section titled “Methods”](https://www.daytona.io/docs/en/ruby-sdk/lsp-server/#methods)

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/lsp-server/\#language_id) language\_id()

[Section titled “language\_id()”](https://www.daytona.io/docs/en/ruby-sdk/lsp-server/#language_id)

```
def language_id()
```

**Returns**:

- `Symbol`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/lsp-server/\#path_to_project) path\_to\_project()

[Section titled “path\_to\_project()”](https://www.daytona.io/docs/en/ruby-sdk/lsp-server/#path_to_project)

```
def path_to_project()
```

**Returns**:

- `String`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/lsp-server/\#toolbox_api) toolbox\_api()

[Section titled “toolbox\_api()”](https://www.daytona.io/docs/en/ruby-sdk/lsp-server/#toolbox_api)

```
def toolbox_api()
```

**Returns**:

- `DaytonaToolboxApiClient:LspApi`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/lsp-server/\#sandbox_id) sandbox\_id()

[Section titled “sandbox\_id()”](https://www.daytona.io/docs/en/ruby-sdk/lsp-server/#sandbox_id)

```
def sandbox_id()
```

**Returns**:

- `String`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/lsp-server/\#completions) completions()

[Section titled “completions()”](https://www.daytona.io/docs/en/ruby-sdk/lsp-server/#completions)

```
def completions(path:, position:)
```

Gets completion suggestions at a position in a file

**Parameters**:

- `path` _String_ -
- `position` _Daytona:LspServer:Position_ -

**Returns**:

- `DaytonaApiClient:CompletionList`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/lsp-server/\#did_close) did\_close()

[Section titled “did\_close()”](https://www.daytona.io/docs/en/ruby-sdk/lsp-server/#did_close)

```
def did_close(path)
```

Notify the language server that a file has been closed.
This method should be called when a file is closed in the editor to allow
the language server to clean up any resources associated with that file.

**Parameters**:

- `path` _String_ -

**Returns**:

- `void`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/lsp-server/\#did_open) did\_open()

[Section titled “did\_open()”](https://www.daytona.io/docs/en/ruby-sdk/lsp-server/#did_open)

```
def did_open(path)
```

Notifies the language server that a file has been opened.
This method should be called when a file is opened in the editor to enable
language features like diagnostics and completions for that file. The server
will begin tracking the file’s contents and providing language features.

**Parameters**:

- `path` _String_ -

**Returns**:

- `void`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/lsp-server/\#document_symbols) document\_symbols()

[Section titled “document\_symbols()”](https://www.daytona.io/docs/en/ruby-sdk/lsp-server/#document_symbols)

```
def document_symbols(path)
```

Gets symbol information (functions, classes, variables, etc.) from a document.

**Parameters**:

- `path` _String_ -

**Returns**:

- `Array\<DaytonaToolboxApiClient:LspSymbol]`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/lsp-server/\#sandbox_symbols) sandbox\_symbols()

[Section titled “sandbox\_symbols()”](https://www.daytona.io/docs/en/ruby-sdk/lsp-server/#sandbox_symbols)

```
def sandbox_symbols(query)
```

Searches for symbols matching the query string across all files
in the Sandbox.

**Parameters**:

- `query` _String_ -

**Returns**:

- `Array\<DaytonaToolboxApiClient:LspSymbol]`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/lsp-server/\#start) start()

[Section titled “start()”](https://www.daytona.io/docs/en/ruby-sdk/lsp-server/#start)

```
def start()
```

Starts the language server.
This method must be called before using any other LSP functionality.
It initializes the language server for the specified language and project.

**Returns**:

- `void`

#### [\#](https://www.daytona.io/docs/en/ruby-sdk/lsp-server/\#stop) stop()

[Section titled “stop()”](https://www.daytona.io/docs/en/ruby-sdk/lsp-server/#stop)

```
def stop()
```

Stops the language server.
This method should be called when the LSP server is no longer needed to
free up system resources.

**Returns**:

- `void`