---
url: "https://www.daytona.io/docs/en/language-server-protocol/"
title: "Language Server Protocol | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/language-server-protocol/#_top)

# Language Server Protocol

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/language-server-protocol.md)Open

Language Server Protocol (LSP) support is available through LSP server instances created from a sandbox. A language server runs inside the sandbox and analyzes the project’s code, so your application gets IDE-grade code intelligence for code that never leaves the sandbox.

An LSP server covers code completions, file open and close notifications, document symbols, and sandbox-wide symbol search. Each server instance is scoped to one language and one project directory; Python and TypeScript language servers are available by default.

## [\#](https://www.daytona.io/docs/en/language-server-protocol/\#workflow) Workflow

[Section titled “Workflow”](https://www.daytona.io/docs/en/language-server-protocol/#workflow)

Follow this order when using LSP in a sandbox:

1. Create an LSP server instance with **`create_lsp_server`** or **`createLspServer`**
2. Call **`start()`** to initialize the language server; LSP methods fail until the server is started
3. Call **`didOpen()`** on a file before requesting completions or document symbols for that file
4. Use completions, document symbols, or sandbox symbols
5. Call **`didClose()`** when you finish with a file
6. Call **`stop()`** when the LSP server is no longer needed

## [\#](https://www.daytona.io/docs/en/language-server-protocol/\#create-lsp-servers) Create LSP servers

[Section titled “Create LSP servers”](https://www.daytona.io/docs/en/language-server-protocol/#create-lsp-servers)

Create an LSP server instance by providing the language ID and the path to the project.

- **Python**: **`LspLanguageId.PYTHON`**
- **TypeScript and JavaScript**: **`LspLanguageId.TYPESCRIPT`**
- **Custom**: Install the language server for your target language

- [Python](https://www.daytona.io/docs/en/language-server-protocol/#tab-panel-565)
- [TypeScript](https://www.daytona.io/docs/en/language-server-protocol/#tab-panel-566)
- [Ruby](https://www.daytona.io/docs/en/language-server-protocol/#tab-panel-567)
- [Go](https://www.daytona.io/docs/en/language-server-protocol/#tab-panel-568)
- [Java](https://www.daytona.io/docs/en/language-server-protocol/#tab-panel-569)

```
from daytona import Daytona, LspLanguageId

# Create Sandbox

daytona = Daytona()

sandbox = daytona.create()

# Create LSP server for Python

lsp_server = sandbox.create_lsp_server(

    language_id=LspLanguageId.PYTHON,

    path_to_project="workspace/project"

)
```

```
import { Daytona, LspLanguageId } from '@daytona/sdk'

// Create sandbox

const daytona = new Daytona()

const sandbox = await daytona.create()

// Create LSP server for TypeScript

const lspServer = await sandbox.createLspServer(

  LspLanguageId.TYPESCRIPT,

  'workspace/project'

)
```

```
require 'daytona'

# Create Sandbox

daytona = Daytona::Daytona.new

sandbox = daytona.create

# Create LSP server for Python

lsp_server = sandbox.create_lsp_server(

  language_id: Daytona::LspServer::Language::PYTHON,

  path_to_project: 'workspace/project'

)
```

```
// Create sandbox

client, err := daytona.NewClient()

if err != nil {

  log.Fatal(err)

}

ctx := context.Background()

sandbox, err := client.Create(ctx, nil)

if err != nil {

  log.Fatal(err)

}

// Create LSP server for Python

lsp := sandbox.CreateLspServer(types.LspLanguagePython, "workspace/project")
```

```
import io.daytona.sdk.Daytona;

import io.daytona.sdk.LspServer;

import io.daytona.sdk.Sandbox;

public class App {

    public static void main(String[] args) {

        try (Daytona daytona = new Daytona()) {

            Sandbox sandbox = daytona.create();

            LspServer lspServer = sandbox.createLspServer(

                    "python",

                    "workspace/project");

        }

    }

}
```

## [\#](https://www.daytona.io/docs/en/language-server-protocol/\#start-lsp-servers) Start LSP servers

[Section titled “Start LSP servers”](https://www.daytona.io/docs/en/language-server-protocol/#start-lsp-servers)

Start an LSP server by calling **`start()`** before any other LSP operation.

- [Python](https://www.daytona.io/docs/en/language-server-protocol/#tab-panel-570)
- [TypeScript](https://www.daytona.io/docs/en/language-server-protocol/#tab-panel-571)
- [Ruby](https://www.daytona.io/docs/en/language-server-protocol/#tab-panel-572)
- [Go](https://www.daytona.io/docs/en/language-server-protocol/#tab-panel-573)
- [Java](https://www.daytona.io/docs/en/language-server-protocol/#tab-panel-574)
- [API](https://www.daytona.io/docs/en/language-server-protocol/#tab-panel-575)

```
lsp = sandbox.create_lsp_server(

    language_id=LspLanguageId.PYTHON,

    path_to_project="workspace/project"

)

lsp.start()  # Initialize the server

# Now ready for LSP operations
```

```
const lsp = await sandbox.createLspServer(

  LspLanguageId.TYPESCRIPT,

  'workspace/project'

)

await lsp.start() // Initialize the server

// Now ready for LSP operations
```

```
lsp = sandbox.create_lsp_server(

  language_id: Daytona::LspServer::Language::PYTHON,

  path_to_project: 'workspace/project'

)

lsp.start  # Initialize the server

# Now ready for LSP operations
```

```
lsp := sandbox.CreateLspServer(types.LspLanguagePython, "workspace/project")

err := lsp.Start(ctx)  // Initialize the server

if err != nil {

  log.Fatal(err)

}

// Now ready for LSP operations
```

```
LspServer lsp = sandbox.createLspServer("typescript", "workspace/project");

lsp.start("typescript", "workspace/project");

// Now ready for LSP operations
```

```
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/lsp/start' \

  --request POST \

  --header 'Content-Type: application/json' \

  --data '{

  "languageId": "python",

  "pathToProject": "workspace/project"

}'
```

## [\#](https://www.daytona.io/docs/en/language-server-protocol/\#stop-lsp-servers) Stop LSP servers

[Section titled “Stop LSP servers”](https://www.daytona.io/docs/en/language-server-protocol/#stop-lsp-servers)

Stop an LSP server by calling **`stop()`** when the LSP server is no longer needed.

- [Python](https://www.daytona.io/docs/en/language-server-protocol/#tab-panel-576)
- [TypeScript](https://www.daytona.io/docs/en/language-server-protocol/#tab-panel-577)
- [Ruby](https://www.daytona.io/docs/en/language-server-protocol/#tab-panel-578)
- [Go](https://www.daytona.io/docs/en/language-server-protocol/#tab-panel-579)
- [Java](https://www.daytona.io/docs/en/language-server-protocol/#tab-panel-580)
- [API](https://www.daytona.io/docs/en/language-server-protocol/#tab-panel-581)

```
# When done with LSP features

lsp.stop()  # Clean up resources
```

```
// When done with LSP features

await lsp.stop() // Clean up resources
```

```
# When done with LSP features

lsp.stop  # Clean up resources
```

```
// When done with LSP features

err := lsp.Stop(ctx)  // Clean up resources

if err != nil {

  log.Fatal(err)

}
```

```
// When done with LSP features

lsp.stop("typescript", "workspace/project"); // Clean up resources
```

```
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/lsp/stop' \

  --request POST \

  --header 'Content-Type: application/json' \

  --data '{

  "languageId": "python",

  "pathToProject": "workspace/project"

}'
```

## [\#](https://www.daytona.io/docs/en/language-server-protocol/\#code-completions) Code completions

[Section titled “Code completions”](https://www.daytona.io/docs/en/language-server-protocol/#code-completions)

Get code completions for a specific position in a file by providing the file path and position.

- Position values are zero-based (`line: 0` is the first line)
- Call **`didOpen()`** on the file before requesting completions

- [Python](https://www.daytona.io/docs/en/language-server-protocol/#tab-panel-582)
- [TypeScript](https://www.daytona.io/docs/en/language-server-protocol/#tab-panel-583)
- [Ruby](https://www.daytona.io/docs/en/language-server-protocol/#tab-panel-584)
- [Go](https://www.daytona.io/docs/en/language-server-protocol/#tab-panel-585)
- [Java](https://www.daytona.io/docs/en/language-server-protocol/#tab-panel-586)
- [API](https://www.daytona.io/docs/en/language-server-protocol/#tab-panel-587)

```
completions = lsp_server.completions(

    path="workspace/project/main.py",

    position={"line": 10, "character": 15}

)

print(f"Completions: {completions}")
```

```
const completions = await lspServer.completions('workspace/project/main.ts', {

  line: 10,

  character: 15,

})

console.log('Completions:', completions)
```

```
completions = lsp_server.completions(

  path: 'workspace/project/main.py',

  position: { line: 10, character: 15 }

)

puts "Completions: #{completions}"
```

```
completions, err := lsp.Completions(ctx, "workspace/project/main.py",

  types.Position{Line: 10, Character: 15},

)

if err != nil {

  log.Fatal(err)

}

fmt.Printf("Completions: %v\n", completions)
```

```
var completions = lsp.completions(

    "typescript",

    "workspace/project",

    "workspace/project/Main.java",

    10,

    15);

System.out.println("Completions: " + completions);
```

```
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/lsp/completions' \

  --request POST \

  --header 'Content-Type: application/json' \

  --data '{

  "context": {

    "triggerCharacter": "",

    "triggerKind": 1

  },

  "languageId": "python",

  "pathToProject": "workspace/project",

  "position": {

    "character": 15,

    "line": 10

  },

  "uri": "workspace/project/main.py"

}'
```

## [\#](https://www.daytona.io/docs/en/language-server-protocol/\#file-notifications) File notifications

[Section titled “File notifications”](https://www.daytona.io/docs/en/language-server-protocol/#file-notifications)

Daytona provides methods to notify the LSP server when files are opened or closed. This enables completion and symbol tracking for the specified files.

### [\#](https://www.daytona.io/docs/en/language-server-protocol/\#open-file) Open file

[Section titled “Open file”](https://www.daytona.io/docs/en/language-server-protocol/#open-file)

Notify the language server that a file has been opened for editing by providing the path to the file. The server reads the file contents from disk at open time.

- [Python](https://www.daytona.io/docs/en/language-server-protocol/#tab-panel-588)
- [TypeScript](https://www.daytona.io/docs/en/language-server-protocol/#tab-panel-589)
- [Ruby](https://www.daytona.io/docs/en/language-server-protocol/#tab-panel-590)
- [Go](https://www.daytona.io/docs/en/language-server-protocol/#tab-panel-591)
- [Java](https://www.daytona.io/docs/en/language-server-protocol/#tab-panel-592)
- [API](https://www.daytona.io/docs/en/language-server-protocol/#tab-panel-593)

```
# Notify server that a file is open

lsp_server.did_open("workspace/project/main.py")
```

```
// Notify server that a file is open

await lspServer.didOpen('workspace/project/main.ts')
```

```
# Notify server that a file is open

lsp_server.did_open('workspace/project/main.py')
```

```
// Notify server that a file is open

err := lsp.DidOpen(ctx, "workspace/project/main.py")

if err != nil {

  log.Fatal(err)

}
```

```
// Notify server that a file is open

lsp.didOpen("typescript", "workspace/project", "workspace/project/Main.java");
```

```
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/lsp/did-open' \

  --request POST \

  --header 'Content-Type: application/json' \

  --data '{

  "languageId": "python",

  "pathToProject": "workspace/project",

  "uri": "workspace/project/main.py"

}'
```

### [\#](https://www.daytona.io/docs/en/language-server-protocol/\#close-file) Close file

[Section titled “Close file”](https://www.daytona.io/docs/en/language-server-protocol/#close-file)

Notify the language server that a file has been closed by providing the path to the file. This allows the server to clean up resources associated with that file.

- [Python](https://www.daytona.io/docs/en/language-server-protocol/#tab-panel-594)
- [TypeScript](https://www.daytona.io/docs/en/language-server-protocol/#tab-panel-595)
- [Ruby](https://www.daytona.io/docs/en/language-server-protocol/#tab-panel-596)
- [Go](https://www.daytona.io/docs/en/language-server-protocol/#tab-panel-597)
- [Java](https://www.daytona.io/docs/en/language-server-protocol/#tab-panel-598)
- [API](https://www.daytona.io/docs/en/language-server-protocol/#tab-panel-599)

```
# Notify server that a file is closed

lsp_server.did_close("workspace/project/main.py")
```

```
// Notify server that a file is closed

await lspServer.didClose('workspace/project/main.ts')
```

```
# Notify server that a file is closed

lsp_server.did_close('workspace/project/main.py')
```

```
// Notify server that a file is closed

err := lsp.DidClose(ctx, "workspace/project/main.py")

if err != nil {

  log.Fatal(err)

}
```

```
// Notify server that a file is closed

lsp.didClose("typescript", "workspace/project", "workspace/project/Main.java");
```

```
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/lsp/did-close' \

  --request POST \

  --header 'Content-Type: application/json' \

  --data '{

  "languageId": "python",

  "pathToProject": "workspace/project",

  "uri": "workspace/project/main.py"

}'
```

## [\#](https://www.daytona.io/docs/en/language-server-protocol/\#document-symbols) Document symbols

[Section titled “Document symbols”](https://www.daytona.io/docs/en/language-server-protocol/#document-symbols)

Retrieve symbols (functions, classes, variables, etc.) from a document by providing the path to the file.

- [Python](https://www.daytona.io/docs/en/language-server-protocol/#tab-panel-600)
- [TypeScript](https://www.daytona.io/docs/en/language-server-protocol/#tab-panel-601)
- [Ruby](https://www.daytona.io/docs/en/language-server-protocol/#tab-panel-602)
- [Go](https://www.daytona.io/docs/en/language-server-protocol/#tab-panel-603)
- [Java](https://www.daytona.io/docs/en/language-server-protocol/#tab-panel-604)
- [API](https://www.daytona.io/docs/en/language-server-protocol/#tab-panel-605)

```
symbols = lsp_server.document_symbols("workspace/project/main.py")

for symbol in symbols:

    print(f"Symbol: {symbol.name}, Kind: {symbol.kind}")
```

```
const symbols = await lspServer.documentSymbols('workspace/project/main.ts')

symbols.forEach((symbol) => {

  console.log(`Symbol: ${symbol.name}, Kind: ${symbol.kind}`)

})
```

```
symbols = lsp_server.document_symbols('workspace/project/main.py')

symbols.each do |symbol|

  puts "Symbol: #{symbol.name}, Kind: #{symbol.kind}"

end
```

```
symbols, err := lsp.DocumentSymbols(ctx, "workspace/project/main.py")

if err != nil {

  log.Fatal(err)

}

for _, symbol := range symbols {

  fmt.Printf("Symbol: %v\n", symbol)

}
```

```
var symbols = lsp.documentSymbols(

    "typescript",

    "workspace/project",

    "workspace/project/Main.java");

for (var symbol : symbols) {

    System.out.println("Symbol: " + symbol.getName() + ", Kind: " + symbol.getKind());

}
```

```
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/lsp/document-symbols?languageId=python&pathToProject=workspace/project&uri=workspace/project/main.py'
```

## [\#](https://www.daytona.io/docs/en/language-server-protocol/\#sandbox-symbols) Sandbox symbols

[Section titled “Sandbox symbols”](https://www.daytona.io/docs/en/language-server-protocol/#sandbox-symbols)

Search for symbols across all files in the sandbox by providing the query and the language ID. The Java SDK uses **`workspaceSymbols()`** instead of **`sandboxSymbols()`**.

- [Python](https://www.daytona.io/docs/en/language-server-protocol/#tab-panel-606)
- [TypeScript](https://www.daytona.io/docs/en/language-server-protocol/#tab-panel-607)
- [Ruby](https://www.daytona.io/docs/en/language-server-protocol/#tab-panel-608)
- [Go](https://www.daytona.io/docs/en/language-server-protocol/#tab-panel-609)
- [Java](https://www.daytona.io/docs/en/language-server-protocol/#tab-panel-610)
- [API](https://www.daytona.io/docs/en/language-server-protocol/#tab-panel-611)

```
symbols = lsp_server.sandbox_symbols("MyClass")

for symbol in symbols:

    print(f"Found: {symbol.name} at {symbol.location}")
```

```
const symbols = await lspServer.sandboxSymbols('MyClass')

symbols.forEach((symbol) => {

  console.log(`Found: ${symbol.name} at ${symbol.location}`)

})
```

```
symbols = lsp_server.sandbox_symbols('MyClass')

symbols.each do |symbol|

  puts "Found: #{symbol.name} at #{symbol.location}"

end
```

```
symbols, err := lsp.SandboxSymbols(ctx, "MyClass")

if err != nil {

  log.Fatal(err)

}

for _, symbol := range symbols {

  fmt.Printf("Found: %v\n", symbol)

}
```

```
var symbols = lsp.workspaceSymbols("MyClass", "typescript", "workspace/project");

for (var symbol : symbols) {

    System.out.println("Found: " + symbol.getName() + " at " + symbol.getLocation());

}
```

```
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/lsp/workspacesymbols?query=MyClass&languageId=python&pathToProject=workspace/project'
```