---
url: "https://www.daytona.io/docs/en/language-server-protocol.md"
title: undefined
---

# Language Server Protocol

Language Server Protocol (LSP) support is available through LSP server instances created from a sandbox. A language server runs inside the sandbox and analyzes the project's code, so your application gets IDE-grade code intelligence for code that never leaves the sandbox.

An LSP server covers code completions, file open and close notifications, document symbols, and sandbox-wide symbol search. Each server instance is scoped to one language and one project directory; Python and TypeScript language servers are available by default.

## Workflow

Follow this order when using LSP in a sandbox:

1. Create an LSP server instance with **`create_lsp_server`** or **`createLspServer`**
2. Call **`start()`** to initialize the language server; LSP methods fail until the server is started
3. Call **`didOpen()`** on a file before requesting completions or document symbols for that file
4. Use completions, document symbols, or sandbox symbols
5. Call **`didClose()`** when you finish with a file
6. Call **`stop()`** when the LSP server is no longer needed

## Create LSP servers

Create an LSP server instance by providing the language ID and the path to the project.

- **Python**: **`LspLanguageId.PYTHON`**
- **TypeScript and JavaScript**: **`LspLanguageId.TYPESCRIPT`**
- **Custom**: Install the language server for your target language


```python
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


```typescript
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


```ruby
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


```go
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


```java
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


## Start LSP servers

Start an LSP server by calling **`start()`** before any other LSP operation.


```python
lsp = sandbox.create_lsp_server(
    language_id=LspLanguageId.PYTHON,
    path_to_project="workspace/project"
)
lsp.start()  # Initialize the server
# Now ready for LSP operations
```


```typescript
const lsp = await sandbox.createLspServer(
  LspLanguageId.TYPESCRIPT,
  'workspace/project'
)
await lsp.start() // Initialize the server
// Now ready for LSP operations
```


```ruby
lsp = sandbox.create_lsp_server(
  language_id: Daytona::LspServer::Language::PYTHON,
  path_to_project: 'workspace/project'
)
lsp.start  # Initialize the server
# Now ready for LSP operations
```


```go
lsp := sandbox.CreateLspServer(types.LspLanguagePython, "workspace/project")
err := lsp.Start(ctx)  // Initialize the server
if err != nil {
	log.Fatal(err)
}
// Now ready for LSP operations
```


```java
LspServer lsp = sandbox.createLspServer("typescript", "workspace/project");
lsp.start("typescript", "workspace/project");
// Now ready for LSP operations
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/lsp/start' \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "languageId": "python",
  "pathToProject": "workspace/project"
}'
```


## Stop LSP servers

Stop an LSP server by calling **`stop()`** when the LSP server is no longer needed.


```python
# When done with LSP features
lsp.stop()  # Clean up resources
```


```typescript
// When done with LSP features
await lsp.stop() // Clean up resources
```


```ruby
# When done with LSP features
lsp.stop  # Clean up resources
```


```go
// When done with LSP features
err := lsp.Stop(ctx)  // Clean up resources
if err != nil {
	log.Fatal(err)
}
```


```java
// When done with LSP features
lsp.stop("typescript", "workspace/project"); // Clean up resources
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/lsp/stop' \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "languageId": "python",
  "pathToProject": "workspace/project"
}'
```


## Code completions

Get code completions for a specific position in a file by providing the file path and position.

- Position values are zero-based (`line: 0` is the first line)
- Call **`didOpen()`** on the file before requesting completions


```python
completions = lsp_server.completions(
    path="workspace/project/main.py",
    position={"line": 10, "character": 15}
)
print(f"Completions: {completions}")
```


```typescript
const completions = await lspServer.completions('workspace/project/main.ts', {
  line: 10,
  character: 15,
})
console.log('Completions:', completions)
```


```ruby
completions = lsp_server.completions(
  path: 'workspace/project/main.py',
  position: { line: 10, character: 15 }
)
puts "Completions: #{completions}"
```


```go
completions, err := lsp.Completions(ctx, "workspace/project/main.py",
	types.Position{Line: 10, Character: 15},
)
if err != nil {
	log.Fatal(err)
}
fmt.Printf("Completions: %v\n", completions)
```


```java
var completions = lsp.completions(
    "typescript",
    "workspace/project",
    "workspace/project/Main.java",
    10,
    15);
System.out.println("Completions: " + completions);
```


```bash
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


## File notifications

Daytona provides methods to notify the LSP server when files are opened or closed. This enables completion and symbol tracking for the specified files.

### Open file

Notify the language server that a file has been opened for editing by providing the path to the file. The server reads the file contents from disk at open time.


```python
# Notify server that a file is open
lsp_server.did_open("workspace/project/main.py")
```


```typescript
// Notify server that a file is open
await lspServer.didOpen('workspace/project/main.ts')
```


```ruby
# Notify server that a file is open
lsp_server.did_open('workspace/project/main.py')
```


```go
// Notify server that a file is open
err := lsp.DidOpen(ctx, "workspace/project/main.py")
if err != nil {
	log.Fatal(err)
}
```


```java
// Notify server that a file is open
lsp.didOpen("typescript", "workspace/project", "workspace/project/Main.java");
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/lsp/did-open' \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "languageId": "python",
  "pathToProject": "workspace/project",
  "uri": "workspace/project/main.py"
}'
```


### Close file

Notify the language server that a file has been closed by providing the path to the file. This allows the server to clean up resources associated with that file.


```python
# Notify server that a file is closed
lsp_server.did_close("workspace/project/main.py")
```


```typescript
// Notify server that a file is closed
await lspServer.didClose('workspace/project/main.ts')
```


```ruby
# Notify server that a file is closed
lsp_server.did_close('workspace/project/main.py')
```


```go
// Notify server that a file is closed
err := lsp.DidClose(ctx, "workspace/project/main.py")
if err != nil {
	log.Fatal(err)
}
```


```java
// Notify server that a file is closed
lsp.didClose("typescript", "workspace/project", "workspace/project/Main.java");
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/lsp/did-close' \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "languageId": "python",
  "pathToProject": "workspace/project",
  "uri": "workspace/project/main.py"
}'
```


## Document symbols

Retrieve symbols (functions, classes, variables, etc.) from a document by providing the path to the file.


```python
symbols = lsp_server.document_symbols("workspace/project/main.py")
for symbol in symbols:
    print(f"Symbol: {symbol.name}, Kind: {symbol.kind}")
```


```typescript
const symbols = await lspServer.documentSymbols('workspace/project/main.ts')
symbols.forEach((symbol) => {
  console.log(`Symbol: ${symbol.name}, Kind: ${symbol.kind}`)
})
```


```ruby
symbols = lsp_server.document_symbols('workspace/project/main.py')
symbols.each do |symbol|
  puts "Symbol: #{symbol.name}, Kind: #{symbol.kind}"
end
```


```go
symbols, err := lsp.DocumentSymbols(ctx, "workspace/project/main.py")
if err != nil {
	log.Fatal(err)
}
for _, symbol := range symbols {
	fmt.Printf("Symbol: %v\n", symbol)
}
```


```java
var symbols = lsp.documentSymbols(
    "typescript",
    "workspace/project",
    "workspace/project/Main.java");
for (var symbol : symbols) {
    System.out.println("Symbol: " + symbol.getName() + ", Kind: " + symbol.getKind());
}
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/lsp/document-symbols?languageId=python&pathToProject=workspace/project&uri=workspace/project/main.py'
```


## Sandbox symbols

Search for symbols across all files in the sandbox by providing the query and the language ID. The Java SDK uses **`workspaceSymbols()`** instead of **`sandboxSymbols()`**.


```python
symbols = lsp_server.sandbox_symbols("MyClass")
for symbol in symbols:
    print(f"Found: {symbol.name} at {symbol.location}")
```


```typescript
const symbols = await lspServer.sandboxSymbols('MyClass')
symbols.forEach((symbol) => {
  console.log(`Found: ${symbol.name} at ${symbol.location}`)
})
```


```ruby
symbols = lsp_server.sandbox_symbols('MyClass')
symbols.each do |symbol|
  puts "Found: #{symbol.name} at #{symbol.location}"
end
```


```go
symbols, err := lsp.SandboxSymbols(ctx, "MyClass")
if err != nil {
	log.Fatal(err)
}
for _, symbol := range symbols {
	fmt.Printf("Found: %v\n", symbol)
}
```


```java
var symbols = lsp.workspaceSymbols("MyClass", "typescript", "workspace/project");
for (var symbol : symbols) {
    System.out.println("Found: " + symbol.getName() + " at " + symbol.getLocation());
}
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/lsp/workspacesymbols?query=MyClass&languageId=python&pathToProject=workspace/project'
```