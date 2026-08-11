---
url: "https://www.daytona.io/docs/en/go-sdk/options/"
title: "options | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/go-sdk/options/#_top)

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/go-sdk/options.md)Open

# options

[Section titled “options”](https://www.daytona.io/docs/en/go-sdk/options/#options)

```
import "github.com/daytona/clients/sdk-go/pkg/options"
```

Package options provides functional option types for configuring SDK operations.

This package uses the functional options pattern to provide a clean, extensible API for configuring optional parameters. Each option function returns a closure that modifies the corresponding options struct.

### [\#](https://www.daytona.io/docs/en/go-sdk/options/\#usage) Usage

[Section titled “Usage”](https://www.daytona.io/docs/en/go-sdk/options/#usage)

Options are passed as variadic arguments to SDK methods:

```
err := sandbox.Git.Clone(ctx, url, path,

    options.WithBranch("develop"),

    options.WithUsername("user"),

    options.WithPassword("token"),

)
```

### [\#](https://www.daytona.io/docs/en/go-sdk/options/\#generic-apply-function) Generic Apply Function

[Section titled “Generic Apply Function”](https://www.daytona.io/docs/en/go-sdk/options/#generic-apply-function)

The [Apply](https://www.daytona.io/docs/en/go-sdk/options/#Apply) function creates a new options struct and applies all provided option functions to it:

```
opts := options.Apply(

    options.WithBranch("main"),

    options.WithUsername("user"),

)

// opts.Branch == "main", opts.Username == "user"
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#index) Index

[Section titled “Index”](https://www.daytona.io/docs/en/go-sdk/options/#index)

- [func Apply\[T any\](opts …func(\*T)) \*T](https://www.daytona.io/docs/en/go-sdk/options/#Apply)
- [func WithAllowEmpty(allowEmpty bool) func(\*GitCommit)](https://www.daytona.io/docs/en/go-sdk/options/#WithAllowEmpty)
- [func WithAuthHost(host string) func(\*GitAuthenticate)](https://www.daytona.io/docs/en/go-sdk/options/#WithAuthHost)
- [func WithAuthProtocol(protocol string) func(\*GitAuthenticate)](https://www.daytona.io/docs/en/go-sdk/options/#WithAuthProtocol)
- [func WithBare(bare bool) func(\*GitInit)](https://www.daytona.io/docs/en/go-sdk/options/#WithBare)
- [func WithBranch(branch string) func(\*GitClone)](https://www.daytona.io/docs/en/go-sdk/options/#WithBranch)
- [func WithCloneDepth(depth int32) func(\*GitClone)](https://www.daytona.io/docs/en/go-sdk/options/#WithCloneDepth)
- [func WithCodeRunLanguage(language types.CodeLanguage) func(\*CodeRun)](https://www.daytona.io/docs/en/go-sdk/options/#WithCodeRunLanguage)
- [func WithCodeRunParams(params types.CodeRunParams) func(\*CodeRun)](https://www.daytona.io/docs/en/go-sdk/options/#WithCodeRunParams)
- [func WithCodeRunTimeout(timeout time.Duration) func(\*CodeRun)](https://www.daytona.io/docs/en/go-sdk/options/#WithCodeRunTimeout)
- [func WithCommandEnv(env map\[string\]string) func(\*ExecuteCommand)](https://www.daytona.io/docs/en/go-sdk/options/#WithCommandEnv)
- [func WithCommitId(commitID string) func(\*GitClone)](https://www.daytona.io/docs/en/go-sdk/options/#WithCommitId)
- [func WithConfigPath(path string) func(\*GitConfig)](https://www.daytona.io/docs/en/go-sdk/options/#WithConfigPath)
- [func WithConfigScope(scope string) func(\*GitConfig)](https://www.daytona.io/docs/en/go-sdk/options/#WithConfigScope)
- [func WithCreatePtyEnv(env map\[string\]string) func(\*CreatePty)](https://www.daytona.io/docs/en/go-sdk/options/#WithCreatePtyEnv)
- [func WithCreatePtySize(ptySize types.PtySize) func(\*CreatePty)](https://www.daytona.io/docs/en/go-sdk/options/#WithCreatePtySize)
- [func WithCustomContext(contextID string) func(\*RunCode)](https://www.daytona.io/docs/en/go-sdk/options/#WithCustomContext)
- [func WithCwd(cwd string) func(\*ExecuteCommand)](https://www.daytona.io/docs/en/go-sdk/options/#WithCwd)
- [func WithDepth(depth int32) func(\*ListFiles)](https://www.daytona.io/docs/en/go-sdk/options/#WithDepth)
- [func WithEnv(env map\[string\]string) func(\*RunCode)](https://www.daytona.io/docs/en/go-sdk/options/#WithEnv)
- [func WithExecuteTimeout(timeout time.Duration) func(\*ExecuteCommand)](https://www.daytona.io/docs/en/go-sdk/options/#WithExecuteTimeout)
- [func WithExtraIndexURLs(urls …string) func(\*PipInstall)](https://www.daytona.io/docs/en/go-sdk/options/#WithExtraIndexURLs)
- [func WithExtraOptions(options string) func(\*PipInstall)](https://www.daytona.io/docs/en/go-sdk/options/#WithExtraOptions)
- [func WithFindLinks(links …string) func(\*PipInstall)](https://www.daytona.io/docs/en/go-sdk/options/#WithFindLinks)
- [func WithForce(force bool) func(\*GitDeleteBranch)](https://www.daytona.io/docs/en/go-sdk/options/#WithForce)
- [func WithGroup(group string) func(\*SetFilePermissions)](https://www.daytona.io/docs/en/go-sdk/options/#WithGroup)
- [func WithIndexURL(url string) func(\*PipInstall)](https://www.daytona.io/docs/en/go-sdk/options/#WithIndexURL)
- [func WithInitialBranch(initialBranch string) func(\*GitInit)](https://www.daytona.io/docs/en/go-sdk/options/#WithInitialBranch)
- [func WithInsecureSkipTLS(insecureSkipTLS bool) func(\*GitClone)](https://www.daytona.io/docs/en/go-sdk/options/#WithInsecureSkipTLS)
- [func WithInterpreterTimeout(timeout time.Duration) func(\*RunCode)](https://www.daytona.io/docs/en/go-sdk/options/#WithInterpreterTimeout)
- [func WithLogChannel(logChannel chan string) func(\*CreateSandbox)](https://www.daytona.io/docs/en/go-sdk/options/#WithLogChannel)
- [func WithMode(mode string) func(\*CreateFolder)](https://www.daytona.io/docs/en/go-sdk/options/#WithMode)
- [func WithOwner(owner string) func(\*SetFilePermissions)](https://www.daytona.io/docs/en/go-sdk/options/#WithOwner)
- [func WithPassword(password string) func(\*GitClone)](https://www.daytona.io/docs/en/go-sdk/options/#WithPassword)
- [func WithPermissionMode(mode string) func(\*SetFilePermissions)](https://www.daytona.io/docs/en/go-sdk/options/#WithPermissionMode)
- [func WithPre() func(\*PipInstall)](https://www.daytona.io/docs/en/go-sdk/options/#WithPre)
- [func WithPtyEnv(env map\[string\]string) func(\*PtySession)](https://www.daytona.io/docs/en/go-sdk/options/#WithPtyEnv)
- [func WithPtySize(size types.PtySize) func(\*PtySession)](https://www.daytona.io/docs/en/go-sdk/options/#WithPtySize)
- [func WithPullBranch(branch string) func(\*GitPull)](https://www.daytona.io/docs/en/go-sdk/options/#WithPullBranch)
- [func WithPullPassword(password string) func(\*GitPull)](https://www.daytona.io/docs/en/go-sdk/options/#WithPullPassword)
- [func WithPullRemote(remote string) func(\*GitPull)](https://www.daytona.io/docs/en/go-sdk/options/#WithPullRemote)
- [func WithPullUsername(username string) func(\*GitPull)](https://www.daytona.io/docs/en/go-sdk/options/#WithPullUsername)
- [func WithPushBranch(branch string) func(\*GitPush)](https://www.daytona.io/docs/en/go-sdk/options/#WithPushBranch)
- [func WithPushPassword(password string) func(\*GitPush)](https://www.daytona.io/docs/en/go-sdk/options/#WithPushPassword)
- [func WithPushRemote(remote string) func(\*GitPush)](https://www.daytona.io/docs/en/go-sdk/options/#WithPushRemote)
- [func WithPushUsername(username string) func(\*GitPush)](https://www.daytona.io/docs/en/go-sdk/options/#WithPushUsername)
- [func WithRemoteFetch(fetch bool) func(\*GitRemoteAdd)](https://www.daytona.io/docs/en/go-sdk/options/#WithRemoteFetch)
- [func WithRemoteOverwrite(overwrite bool) func(\*GitRemoteAdd)](https://www.daytona.io/docs/en/go-sdk/options/#WithRemoteOverwrite)
- [func WithResetFiles(files \[\]string) func(\*GitReset)](https://www.daytona.io/docs/en/go-sdk/options/#WithResetFiles)
- [func WithResetMode(mode string) func(\*GitReset)](https://www.daytona.io/docs/en/go-sdk/options/#WithResetMode)
- [func WithResetTarget(target string) func(\*GitReset)](https://www.daytona.io/docs/en/go-sdk/options/#WithResetTarget)
- [func WithRestoreSource(source string) func(\*GitRestore)](https://www.daytona.io/docs/en/go-sdk/options/#WithRestoreSource)
- [func WithRestoreStaged(staged bool) func(\*GitRestore)](https://www.daytona.io/docs/en/go-sdk/options/#WithRestoreStaged)
- [func WithRestoreWorktree(worktree bool) func(\*GitRestore)](https://www.daytona.io/docs/en/go-sdk/options/#WithRestoreWorktree)
- [func WithSetUpstream(setUpstream bool) func(\*GitPush)](https://www.daytona.io/docs/en/go-sdk/options/#WithSetUpstream)
- [func WithTimeout(timeout time.Duration) func(\*CreateSandbox)](https://www.daytona.io/docs/en/go-sdk/options/#WithTimeout)
- [func WithUsername(username string) func(\*GitClone)](https://www.daytona.io/docs/en/go-sdk/options/#WithUsername)
- [func WithWaitForStart(waitForStart bool) func(\*CreateSandbox)](https://www.daytona.io/docs/en/go-sdk/options/#WithWaitForStart)
- [type CodeRun](https://www.daytona.io/docs/en/go-sdk/options/#CodeRun)
- [type CreateFolder](https://www.daytona.io/docs/en/go-sdk/options/#CreateFolder)
- [type CreatePty](https://www.daytona.io/docs/en/go-sdk/options/#CreatePty)
- [type CreateSandbox](https://www.daytona.io/docs/en/go-sdk/options/#CreateSandbox)
- [type ExecuteCommand](https://www.daytona.io/docs/en/go-sdk/options/#ExecuteCommand)
- [type GitAuthenticate](https://www.daytona.io/docs/en/go-sdk/options/#GitAuthenticate)
- [type GitClone](https://www.daytona.io/docs/en/go-sdk/options/#GitClone)
- [type GitCommit](https://www.daytona.io/docs/en/go-sdk/options/#GitCommit)
- [type GitConfig](https://www.daytona.io/docs/en/go-sdk/options/#GitConfig)
- [type GitDeleteBranch](https://www.daytona.io/docs/en/go-sdk/options/#GitDeleteBranch)
- [type GitInit](https://www.daytona.io/docs/en/go-sdk/options/#GitInit)
- [type GitPull](https://www.daytona.io/docs/en/go-sdk/options/#GitPull)
- [type GitPush](https://www.daytona.io/docs/en/go-sdk/options/#GitPush)
- [type GitRemoteAdd](https://www.daytona.io/docs/en/go-sdk/options/#GitRemoteAdd)
- [type GitReset](https://www.daytona.io/docs/en/go-sdk/options/#GitReset)
- [type GitRestore](https://www.daytona.io/docs/en/go-sdk/options/#GitRestore)
- [type ListFiles](https://www.daytona.io/docs/en/go-sdk/options/#ListFiles)
- [type PipInstall](https://www.daytona.io/docs/en/go-sdk/options/#PipInstall)
- [type PtySession](https://www.daytona.io/docs/en/go-sdk/options/#PtySession)
- [type RunCode](https://www.daytona.io/docs/en/go-sdk/options/#RunCode)
- [type SetFilePermissions](https://www.daytona.io/docs/en/go-sdk/options/#SetFilePermissions)

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-apply) func Apply

[Section titled “func Apply”](https://www.daytona.io/docs/en/go-sdk/options/#func-apply)

```
func Apply[T any](opts ...func(*T)) *T
```

Apply creates a new instance of type T and applies all provided option functions.

This generic function enables a consistent pattern for applying functional options across different option types. It allocates a zero-value instance of T, then applies each option function in order.

Example:

```
opts := options.Apply(

    options.WithBranch("main"),

    options.WithUsername("user"),

)
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withallowempty) func WithAllowEmpty

[Section titled “func WithAllowEmpty”](https://www.daytona.io/docs/en/go-sdk/options/#func-withallowempty)

```
func WithAllowEmpty(allowEmpty bool) func(*GitCommit)
```

WithAllowEmpty allows creating a commit even when there are no staged changes.

This is useful for triggering CI/CD pipelines or marking points in history without actual code changes.

Example:

```
resp, err := sandbox.Git.Commit(ctx, path, "Trigger rebuild", author, email,

    options.WithAllowEmpty(true),

)
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withauthhost) func WithAuthHost

[Section titled “func WithAuthHost”](https://www.daytona.io/docs/en/go-sdk/options/#func-withauthhost)

```
func WithAuthHost(host string) func(*GitAuthenticate)
```

WithAuthHost sets the host to authenticate against.

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withauthprotocol) func WithAuthProtocol

[Section titled “func WithAuthProtocol”](https://www.daytona.io/docs/en/go-sdk/options/#func-withauthprotocol)

```
func WithAuthProtocol(protocol string) func(*GitAuthenticate)
```

WithAuthProtocol sets the protocol to authenticate against.

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withbare) func WithBare

[Section titled “func WithBare”](https://www.daytona.io/docs/en/go-sdk/options/#func-withbare)

```
func WithBare(bare bool) func(*GitInit)
```

WithBare creates a bare repository without a working tree.

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withbranch) func WithBranch

[Section titled “func WithBranch”](https://www.daytona.io/docs/en/go-sdk/options/#func-withbranch)

```
func WithBranch(branch string) func(*GitClone)
```

WithBranch sets the branch to clone instead of the repository’s default branch.

Example:

```
err := sandbox.Git.Clone(ctx, url, path, options.WithBranch("develop"))
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withclonedepth) func WithCloneDepth

[Section titled “func WithCloneDepth”](https://www.daytona.io/docs/en/go-sdk/options/#func-withclonedepth)

```
func WithCloneDepth(depth int32) func(*GitClone)
```

WithCloneDepth creates a shallow clone truncated to the given number of commits.

Example:

```
err := sandbox.Git.Clone(ctx, url, path, options.WithCloneDepth(1))
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withcoderunlanguage) func WithCodeRunLanguage

[Section titled “func WithCodeRunLanguage”](https://www.daytona.io/docs/en/go-sdk/options/#func-withcoderunlanguage)

```
func WithCodeRunLanguage(language types.CodeLanguage) func(*CodeRun)
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withcoderunparams) func WithCodeRunParams

[Section titled “func WithCodeRunParams”](https://www.daytona.io/docs/en/go-sdk/options/#func-withcoderunparams)

```
func WithCodeRunParams(params types.CodeRunParams) func(*CodeRun)
```

WithCodeRunParams sets the code execution parameters.

Example:

```
result, err := sandbox.Process.CodeRun(ctx, code,

    options.WithCodeRunParams(types.CodeRunParams{Language: "python"}),

)
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withcoderuntimeout) func WithCodeRunTimeout

[Section titled “func WithCodeRunTimeout”](https://www.daytona.io/docs/en/go-sdk/options/#func-withcoderuntimeout)

```
func WithCodeRunTimeout(timeout time.Duration) func(*CodeRun)
```

WithCodeRunTimeout sets the timeout for code execution.

If the code doesn’t complete within the timeout, it will be terminated. The HTTP request waits for the full timeout, even beyond the client-wide HTTP timeout. A zero value disables the server-side limit (the wait is bounded only by ctx); negative values are rejected by the API. Values are rounded up to whole seconds (the API granularity).

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withcommandenv) func WithCommandEnv

[Section titled “func WithCommandEnv”](https://www.daytona.io/docs/en/go-sdk/options/#func-withcommandenv)

```
func WithCommandEnv(env map[string]string) func(*ExecuteCommand)
```

WithCommandEnv sets environment variables for the command.

These variables are added to the command’s environment in addition to the sandbox’s default environment.

Example:

```
result, err := sandbox.Process.ExecuteCommand(ctx, "echo $MY_VAR",

    options.WithCommandEnv(map[string]string{"MY_VAR": "hello"}),

)
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withcommitid) func WithCommitId

[Section titled “func WithCommitId”](https://www.daytona.io/docs/en/go-sdk/options/#func-withcommitid)

```
func WithCommitId(commitID string) func(*GitClone)
```

WithCommitId sets a specific commit SHA to checkout after cloning.

The repository is first cloned, then the specified commit is checked out, resulting in a detached HEAD state.

Example:

```
err := sandbox.Git.Clone(ctx, url, path, options.WithCommitId("abc123def"))
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withconfigpath) func WithConfigPath

[Section titled “func WithConfigPath”](https://www.daytona.io/docs/en/go-sdk/options/#func-withconfigpath)

```
func WithConfigPath(path string) func(*GitConfig)
```

WithConfigPath sets the repository path (required for the “local” scope).

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withconfigscope) func WithConfigScope

[Section titled “func WithConfigScope”](https://www.daytona.io/docs/en/go-sdk/options/#func-withconfigscope)

```
func WithConfigScope(scope string) func(*GitConfig)
```

WithConfigScope sets the config scope (“global”, “local” or “system”).

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withcreateptyenv) func WithCreatePtyEnv

[Section titled “func WithCreatePtyEnv”](https://www.daytona.io/docs/en/go-sdk/options/#func-withcreateptyenv)

```
func WithCreatePtyEnv(env map[string]string) func(*CreatePty)
```

WithCreatePtyEnv sets environment variables for CreatePty.

Example:

```
handle, err := sandbox.Process.CreatePty(ctx, "my-pty",

    options.WithCreatePtyEnv(map[string]string{"TERM": "xterm-256color"}),

)
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withcreateptysize) func WithCreatePtySize

[Section titled “func WithCreatePtySize”](https://www.daytona.io/docs/en/go-sdk/options/#func-withcreateptysize)

```
func WithCreatePtySize(ptySize types.PtySize) func(*CreatePty)
```

WithCreatePtySize sets the PTY terminal dimensions for CreatePty.

Example:

```
handle, err := sandbox.Process.CreatePty(ctx, "my-pty",

    options.WithCreatePtySize(types.PtySize{Rows: 24, Cols: 80}),

)
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withcustomcontext) func WithCustomContext

[Section titled “func WithCustomContext”](https://www.daytona.io/docs/en/go-sdk/options/#func-withcustomcontext)

```
func WithCustomContext(contextID string) func(*RunCode)
```

WithCustomContext sets the interpreter context ID for code execution.

Using a context allows you to maintain state (variables, imports, etc.) across multiple code executions. Create a context with CreateContext first.

Example:

```
ctx, _ := sandbox.CodeInterpreter.CreateContext(ctx, nil)

channels, err := sandbox.CodeInterpreter.RunCode(ctx, "x = 42",

    options.WithCustomContext(ctx["id"].(string)),

)
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withcwd) func WithCwd

[Section titled “func WithCwd”](https://www.daytona.io/docs/en/go-sdk/options/#func-withcwd)

```
func WithCwd(cwd string) func(*ExecuteCommand)
```

WithCwd sets the working directory for command execution.

Example:

```
result, err := sandbox.Process.ExecuteCommand(ctx, "ls -la",

    options.WithCwd("/home/user/project"),

)
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withdepth) func WithDepth

[Section titled “func WithDepth”](https://www.daytona.io/docs/en/go-sdk/options/#func-withdepth)

```
func WithDepth(depth int32) func(*ListFiles)
```

WithDepth sets how many levels deep to list. Depth 1 (the default) lists the directory’s entries, depth 2 also includes their children, and so on.

Example:

```
files, err := sandbox.FileSystem.ListFiles(ctx, "/home/user",

    options.WithDepth(3),

)
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withenv) func WithEnv

[Section titled “func WithEnv”](https://www.daytona.io/docs/en/go-sdk/options/#func-withenv)

```
func WithEnv(env map[string]string) func(*RunCode)
```

WithEnv sets environment variables for code execution.

These variables are available to the code during execution.

Example:

```
channels, err := sandbox.CodeInterpreter.RunCode(ctx, "import os; print(os.environ['API_KEY'])",

    options.WithEnv(map[string]string{"API_KEY": "secret"}),

)
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withexecutetimeout) func WithExecuteTimeout

[Section titled “func WithExecuteTimeout”](https://www.daytona.io/docs/en/go-sdk/options/#func-withexecutetimeout)

```
func WithExecuteTimeout(timeout time.Duration) func(*ExecuteCommand)
```

WithExecuteTimeout sets the timeout for command execution.

If the command doesn’t complete within the timeout, it will be terminated. The HTTP request waits for the full timeout, even beyond the client-wide HTTP timeout. A zero value disables the server-side limit (the wait is bounded only by ctx); negative values are rejected by the API. Values are rounded up to whole seconds (the API granularity).

Example:

```
result, err := sandbox.Process.ExecuteCommand(ctx, "sleep 60",

    options.WithExecuteTimeout(5*time.Minute),

)
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withextraindexurls) func WithExtraIndexURLs

[Section titled “func WithExtraIndexURLs”](https://www.daytona.io/docs/en/go-sdk/options/#func-withextraindexurls)

```
func WithExtraIndexURLs(urls ...string) func(*PipInstall)
```

WithExtraIndexURLs adds extra index URLs for pip install.

Extra indexes are checked in addition to the main index URL. Useful for installing packages from both PyPI and a private index.

Example:

```
image := daytona.Base("python:3.11").PipInstall(

    []string{"mypackage"},

    options.WithExtraIndexURLs("https://private.example.com/simple/"),

)
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withextraoptions) func WithExtraOptions

[Section titled “func WithExtraOptions”](https://www.daytona.io/docs/en/go-sdk/options/#func-withextraoptions)

```
func WithExtraOptions(options string) func(*PipInstall)
```

WithExtraOptions adds extra command-line options for pip install.

Use this for pip options not covered by other With\* functions.

Example:

```
image := daytona.Base("python:3.11").PipInstall(

    []string{"mypackage"},

    options.WithExtraOptions("--no-cache-dir --upgrade"),

)
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withfindlinks) func WithFindLinks

[Section titled “func WithFindLinks”](https://www.daytona.io/docs/en/go-sdk/options/#func-withfindlinks)

```
func WithFindLinks(links ...string) func(*PipInstall)
```

WithFindLinks adds find-links URLs for pip install.

Find-links URLs are searched for packages before the package index. Useful for installing packages from local directories or custom URLs.

Example:

```
image := daytona.Base("python:3.11").PipInstall(

    []string{"mypackage"},

    options.WithFindLinks("/path/to/wheels", "https://example.com/wheels/"),

)
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withforce) func WithForce

[Section titled “func WithForce”](https://www.daytona.io/docs/en/go-sdk/options/#func-withforce)

```
func WithForce(force bool) func(*GitDeleteBranch)
```

WithForce enables force deletion of a branch even if it’s not fully merged.

Use with caution as this can result in lost commits if the branch contains work that hasn’t been merged elsewhere.

Example:

```
err := sandbox.Git.DeleteBranch(ctx, path, "feature/abandoned",

    options.WithForce(true),

)
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withgroup) func WithGroup

[Section titled “func WithGroup”](https://www.daytona.io/docs/en/go-sdk/options/#func-withgroup)

```
func WithGroup(group string) func(*SetFilePermissions)
```

WithGroup sets the file group.

The group should be a valid group name on the sandbox system.

Example:

```
err := sandbox.FileSystem.SetFilePermissions(ctx, "/home/user/file.txt",

    options.WithGroup("users"),

)
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withindexurl) func WithIndexURL

[Section titled “func WithIndexURL”](https://www.daytona.io/docs/en/go-sdk/options/#func-withindexurl)

```
func WithIndexURL(url string) func(*PipInstall)
```

WithIndexURL sets the base URL of the Python Package Index.

Replaces the default PyPI ( [https://pypi.org/simple\](https://pypi.org/simple%5C)) with a custom index.

Example:

```
image := daytona.Base("python:3.11").PipInstall(

    []string{"mypackage"},

    options.WithIndexURL("https://my-pypi.example.com/simple/"),

)
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withinitialbranch) func WithInitialBranch

[Section titled “func WithInitialBranch”](https://www.daytona.io/docs/en/go-sdk/options/#func-withinitialbranch)

```
func WithInitialBranch(initialBranch string) func(*GitInit)
```

WithInitialBranch sets the name of the initial branch.

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withinsecureskiptls) func WithInsecureSkipTLS

[Section titled “func WithInsecureSkipTLS”](https://www.daytona.io/docs/en/go-sdk/options/#func-withinsecureskiptls)

```
func WithInsecureSkipTLS(insecureSkipTLS bool) func(*GitClone)
```

WithInsecureSkipTLS opts into skipping TLS certificate verification for the clone. Use ONLY when cloning from a trusted internal Git server with a self-signed or private-CA certificate. Credentials, if supplied, will be transmitted over an unverified TLS connection and are exposed to any MITM on the route.

Example:

```
err := sandbox.Git.Clone(ctx, url, path,

    options.WithInsecureSkipTLS(true),

)
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withinterpretertimeout) func WithInterpreterTimeout

[Section titled “func WithInterpreterTimeout”](https://www.daytona.io/docs/en/go-sdk/options/#func-withinterpretertimeout)

```
func WithInterpreterTimeout(timeout time.Duration) func(*RunCode)
```

WithInterpreterTimeout sets the execution timeout for code.

If the code doesn’t complete within the timeout, execution is terminated.

Example:

```
channels, err := sandbox.CodeInterpreter.RunCode(ctx, "import time; time.sleep(60)",

    options.WithInterpreterTimeout(5*time.Second),

)
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withlogchannel) func WithLogChannel

[Section titled “func WithLogChannel”](https://www.daytona.io/docs/en/go-sdk/options/#func-withlogchannel)

```
func WithLogChannel(logChannel chan string) func(*CreateSandbox)
```

WithLogChannel provides a channel for receiving build logs during sandbox creation.

When creating a sandbox from a custom image that requires building, build logs are streamed to the provided channel. The channel is closed when streaming completes. If no build is required, no logs are sent and the channel remains unused.

Example:

```
logChan := make(chan string)

go func() {

    for log := range logChan {

        fmt.Println(log)

    }

}()

sandbox, err := client.Create(ctx, params,

    options.WithLogChannel(logChan),

)
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withmode) func WithMode

[Section titled “func WithMode”](https://www.daytona.io/docs/en/go-sdk/options/#func-withmode)

```
func WithMode(mode string) func(*CreateFolder)
```

WithMode sets the Unix file permissions for the created folder.

The mode should be specified as an octal string (e.g., “0755”, “0700”). If not specified, defaults to “0755”.

Example:

```
err := sandbox.FileSystem.CreateFolder(ctx, "/home/user/mydir",

    options.WithMode("0700"),

)
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withowner) func WithOwner

[Section titled “func WithOwner”](https://www.daytona.io/docs/en/go-sdk/options/#func-withowner)

```
func WithOwner(owner string) func(*SetFilePermissions)
```

WithOwner sets the file owner.

The owner should be a valid username on the sandbox system.

Example:

```
err := sandbox.FileSystem.SetFilePermissions(ctx, "/home/user/file.txt",

    options.WithOwner("root"),

)
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withpassword) func WithPassword

[Section titled “func WithPassword”](https://www.daytona.io/docs/en/go-sdk/options/#func-withpassword)

```
func WithPassword(password string) func(*GitClone)
```

WithPassword sets the password or access token for HTTPS authentication when cloning.

For GitHub, use a Personal Access Token (PAT). For GitLab, use a Project Access Token or Personal Access Token. For Bitbucket, use an App Password.

Example:

```
err := sandbox.Git.Clone(ctx, url, path,

    options.WithUsername("username"),

    options.WithPassword("ghp_xxxxxxxxxxxx"),

)
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withpermissionmode) func WithPermissionMode

[Section titled “func WithPermissionMode”](https://www.daytona.io/docs/en/go-sdk/options/#func-withpermissionmode)

```
func WithPermissionMode(mode string) func(*SetFilePermissions)
```

WithPermissionMode sets the Unix file permissions.

The mode should be specified as an octal string (e.g., “0644”, “0755”).

Example:

```
err := sandbox.FileSystem.SetFilePermissions(ctx, "/home/user/file.txt",

    options.WithPermissionMode("0644"),

)
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withpre) func WithPre

[Section titled “func WithPre”](https://www.daytona.io/docs/en/go-sdk/options/#func-withpre)

```
func WithPre() func(*PipInstall)
```

WithPre enables installation of pre-release and development versions.

Example:

```
image := daytona.Base("python:3.11").PipInstall(

    []string{"mypackage"},

    options.WithPre(),

)
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withptyenv) func WithPtyEnv

[Section titled “func WithPtyEnv”](https://www.daytona.io/docs/en/go-sdk/options/#func-withptyenv)

```
func WithPtyEnv(env map[string]string) func(*PtySession)
```

WithPtyEnv sets environment variables for the PTY session.

Example:

```
session, err := sandbox.Process.CreatePtySession(ctx, "my-session",

    options.WithPtyEnv(map[string]string{"TERM": "xterm-256color"}),

)
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withptysize) func WithPtySize

[Section titled “func WithPtySize”](https://www.daytona.io/docs/en/go-sdk/options/#func-withptysize)

```
func WithPtySize(size types.PtySize) func(*PtySession)
```

WithPtySize sets the PTY terminal dimensions.

Example:

```
session, err := sandbox.Process.CreatePtySession(ctx, "my-session",

    options.WithPtySize(types.PtySize{Rows: 24, Cols: 80}),

)
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withpullbranch) func WithPullBranch

[Section titled “func WithPullBranch”](https://www.daytona.io/docs/en/go-sdk/options/#func-withpullbranch)

```
func WithPullBranch(branch string) func(*GitPull)
```

WithPullBranch sets the branch to pull instead of the current branch’s upstream.

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withpullpassword) func WithPullPassword

[Section titled “func WithPullPassword”](https://www.daytona.io/docs/en/go-sdk/options/#func-withpullpassword)

```
func WithPullPassword(password string) func(*GitPull)
```

WithPullPassword sets the password or access token for HTTPS authentication when pulling.

Example:

```
err := sandbox.Git.Pull(ctx, path,

    options.WithPullUsername("username"),

    options.WithPullPassword("ghp_xxxxxxxxxxxx"),

)
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withpullremote) func WithPullRemote

[Section titled “func WithPullRemote”](https://www.daytona.io/docs/en/go-sdk/options/#func-withpullremote)

```
func WithPullRemote(remote string) func(*GitPull)
```

WithPullRemote sets the remote to pull from instead of “origin”.

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withpullusername) func WithPullUsername

[Section titled “func WithPullUsername”](https://www.daytona.io/docs/en/go-sdk/options/#func-withpullusername)

```
func WithPullUsername(username string) func(*GitPull)
```

WithPullUsername sets the username for HTTPS authentication when pulling.

Example:

```
err := sandbox.Git.Pull(ctx, path,

    options.WithPullUsername("username"),

    options.WithPullPassword("github_token"),

)
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withpushbranch) func WithPushBranch

[Section titled “func WithPushBranch”](https://www.daytona.io/docs/en/go-sdk/options/#func-withpushbranch)

```
func WithPushBranch(branch string) func(*GitPush)
```

WithPushBranch sets the branch to push instead of the current branch.

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withpushpassword) func WithPushPassword

[Section titled “func WithPushPassword”](https://www.daytona.io/docs/en/go-sdk/options/#func-withpushpassword)

```
func WithPushPassword(password string) func(*GitPush)
```

WithPushPassword sets the password or access token for HTTPS authentication when pushing.

Example:

```
err := sandbox.Git.Push(ctx, path,

    options.WithPushUsername("username"),

    options.WithPushPassword("ghp_xxxxxxxxxxxx"),

)
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withpushremote) func WithPushRemote

[Section titled “func WithPushRemote”](https://www.daytona.io/docs/en/go-sdk/options/#func-withpushremote)

```
func WithPushRemote(remote string) func(*GitPush)
```

WithPushRemote sets the remote to push to instead of “origin”.

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withpushusername) func WithPushUsername

[Section titled “func WithPushUsername”](https://www.daytona.io/docs/en/go-sdk/options/#func-withpushusername)

```
func WithPushUsername(username string) func(*GitPush)
```

WithPushUsername sets the username for HTTPS authentication when pushing.

Example:

```
err := sandbox.Git.Push(ctx, path,

    options.WithPushUsername("username"),

    options.WithPushPassword("github_token"),

)
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withremotefetch) func WithRemoteFetch

[Section titled “func WithRemoteFetch”](https://www.daytona.io/docs/en/go-sdk/options/#func-withremotefetch)

```
func WithRemoteFetch(fetch bool) func(*GitRemoteAdd)
```

WithRemoteFetch fetches from the remote immediately after adding it.

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withremoteoverwrite) func WithRemoteOverwrite

[Section titled “func WithRemoteOverwrite”](https://www.daytona.io/docs/en/go-sdk/options/#func-withremoteoverwrite)

```
func WithRemoteOverwrite(overwrite bool) func(*GitRemoteAdd)
```

WithRemoteOverwrite replaces an existing remote with the same name.

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withresetfiles) func WithResetFiles

[Section titled “func WithResetFiles”](https://www.daytona.io/docs/en/go-sdk/options/#func-withresetfiles)

```
func WithResetFiles(files []string) func(*GitReset)
```

WithResetFiles constrains the reset to the given paths.

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withresetmode) func WithResetMode

[Section titled “func WithResetMode”](https://www.daytona.io/docs/en/go-sdk/options/#func-withresetmode)

```
func WithResetMode(mode string) func(*GitReset)
```

WithResetMode sets the reset mode (“soft”, “mixed”, “hard”, “merge” or “keep”).

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withresettarget) func WithResetTarget

[Section titled “func WithResetTarget”](https://www.daytona.io/docs/en/go-sdk/options/#func-withresettarget)

```
func WithResetTarget(target string) func(*GitReset)
```

WithResetTarget sets the revision to reset to.

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withrestoresource) func WithRestoreSource

[Section titled “func WithRestoreSource”](https://www.daytona.io/docs/en/go-sdk/options/#func-withrestoresource)

```
func WithRestoreSource(source string) func(*GitRestore)
```

WithRestoreSource restores file contents from the given revision instead of the index.

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withrestorestaged) func WithRestoreStaged

[Section titled “func WithRestoreStaged”](https://www.daytona.io/docs/en/go-sdk/options/#func-withrestorestaged)

```
func WithRestoreStaged(staged bool) func(*GitRestore)
```

WithRestoreStaged restores the staging index for the given files.

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withrestoreworktree) func WithRestoreWorktree

[Section titled “func WithRestoreWorktree”](https://www.daytona.io/docs/en/go-sdk/options/#func-withrestoreworktree)

```
func WithRestoreWorktree(worktree bool) func(*GitRestore)
```

WithRestoreWorktree restores the working tree for the given files.

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withsetupstream) func WithSetUpstream

[Section titled “func WithSetUpstream”](https://www.daytona.io/docs/en/go-sdk/options/#func-withsetupstream)

```
func WithSetUpstream(setUpstream bool) func(*GitPush)
```

WithSetUpstream records the pushed branch as the upstream tracking branch (git push —set-upstream).

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withtimeout) func WithTimeout

[Section titled “func WithTimeout”](https://www.daytona.io/docs/en/go-sdk/options/#func-withtimeout)

```
func WithTimeout(timeout time.Duration) func(*CreateSandbox)
```

WithTimeout sets the maximum duration to wait for sandbox creation to complete.

If the timeout is exceeded before the sandbox is ready, Create returns an error. The default timeout is 60 seconds.

Example:

```
sandbox, err := client.Create(ctx, params,

    options.WithTimeout(5*time.Minute),

)
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withusername) func WithUsername

[Section titled “func WithUsername”](https://www.daytona.io/docs/en/go-sdk/options/#func-withusername)

```
func WithUsername(username string) func(*GitClone)
```

WithUsername sets the username for HTTPS authentication when cloning.

For GitHub, GitLab, and similar services, the username is typically your account username or a placeholder like “git” when using tokens.

Example:

```
err := sandbox.Git.Clone(ctx, url, path,

    options.WithUsername("username"),

    options.WithPassword("github_token"),

)
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#func-withwaitforstart) func WithWaitForStart

[Section titled “func WithWaitForStart”](https://www.daytona.io/docs/en/go-sdk/options/#func-withwaitforstart)

```
func WithWaitForStart(waitForStart bool) func(*CreateSandbox)
```

WithWaitForStart controls whether \[daytona.Client.Create\] waits for the sandbox to reach the started state before returning.

When true (the default), Create blocks until the sandbox is fully started and ready for use. When false, Create returns immediately after the sandbox is created, which may be in a pending or building state.

Example:

```
// Return immediately without waiting for the sandbox to start

sandbox, err := client.Create(ctx, params,

    options.WithWaitForStart(false),

)
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#type-coderun) type CodeRun

[Section titled “type CodeRun”](https://www.daytona.io/docs/en/go-sdk/options/#type-coderun)

CodeRun holds optional parameters for \[daytona.ProcessService.CodeRun\].

```
type CodeRun struct {

    Params   *types.CodeRunParams // Code execution parameters

    Timeout  *time.Duration       // Execution timeout

    Language types.CodeLanguage   // Override the default language

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#type-createfolder) type CreateFolder

[Section titled “type CreateFolder”](https://www.daytona.io/docs/en/go-sdk/options/#type-createfolder)

CreateFolder holds optional parameters for \[daytona.FileSystemService.CreateFolder\].

```
type CreateFolder struct {

    Mode *string // Unix file permissions (e.g., "0755")

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#type-createpty) type CreatePty

[Section titled “type CreatePty”](https://www.daytona.io/docs/en/go-sdk/options/#type-createpty)

CreatePty holds optional parameters for \[daytona.ProcessService.CreatePty\].

```
type CreatePty struct {

    PtySize *types.PtySize    // Terminal dimensions (rows and columns)

    Env     map[string]string // Environment variables for the PTY session

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#type-createsandbox) type CreateSandbox

[Section titled “type CreateSandbox”](https://www.daytona.io/docs/en/go-sdk/options/#type-createsandbox)

CreateSandbox holds optional parameters for \[daytona.Client.Create\].

```
type CreateSandbox struct {

    Timeout      *time.Duration // Maximum time to wait for sandbox creation

    WaitForStart bool           // Whether to wait for the sandbox to reach started state

    LogChannel   chan string    // Channel for receiving build logs during image builds

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#type-executecommand) type ExecuteCommand

[Section titled “type ExecuteCommand”](https://www.daytona.io/docs/en/go-sdk/options/#type-executecommand)

ExecuteCommand holds optional parameters for \[daytona.ProcessService.ExecuteCommand\].

```
type ExecuteCommand struct {

    Cwd     *string           // Working directory for command execution

    Env     map[string]string // Environment variables

    Timeout *time.Duration    // Command execution timeout

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#type-gitauthenticate) type GitAuthenticate

[Section titled “type GitAuthenticate”](https://www.daytona.io/docs/en/go-sdk/options/#type-gitauthenticate)

GitAuthenticate holds optional parameters for \[daytona.GitService.DangerouslyAuthenticate\].

```
type GitAuthenticate struct {

    Host     *string // Host to authenticate against (defaults to "github.com")

    Protocol *string // Protocol to authenticate against (defaults to "https")

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#type-gitclone) type GitClone

[Section titled “type GitClone”](https://www.daytona.io/docs/en/go-sdk/options/#type-gitclone)

GitClone holds optional parameters for \[daytona.GitService.Clone\].

Fields are pointers to distinguish between unset values and zero values. Use the corresponding With\* functions to set these options.

```
type GitClone struct {

    Branch          *string // Branch to clone (defaults to repository's default branch)

    CommitId        *string // Specific commit SHA to checkout after cloning

    Username        *string // Username for HTTPS authentication

    Password        *string // Password or token for HTTPS authentication

    InsecureSkipTLS *bool   // Skip TLS certificate verification (insecure). Use only for trusted internal Git servers with self-signed or private-CA certs.

    Depth           *int32  // Create a shallow clone truncated to the given number of commits

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#type-gitcommit) type GitCommit

[Section titled “type GitCommit”](https://www.daytona.io/docs/en/go-sdk/options/#type-gitcommit)

GitCommit holds optional parameters for \[daytona.GitService.Commit\].

```
type GitCommit struct {

    AllowEmpty *bool // Allow creating commits with no staged changes

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#type-gitconfig) type GitConfig

[Section titled “type GitConfig”](https://www.daytona.io/docs/en/go-sdk/options/#type-gitconfig)

GitConfig holds optional parameters for the git config operations (\[daytona.GitService.SetConfig\], \[daytona.GitService.GetConfig\] and \[daytona.GitService.ConfigureUser\]).

```
type GitConfig struct {

    Scope *string // Config scope: "global" (default), "local" or "system"

    Path  *string // Repository path, required when scope is "local"

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#type-gitdeletebranch) type GitDeleteBranch

[Section titled “type GitDeleteBranch”](https://www.daytona.io/docs/en/go-sdk/options/#type-gitdeletebranch)

GitDeleteBranch holds optional parameters for \[daytona.GitService.DeleteBranch\].

```
type GitDeleteBranch struct {

    Force *bool // Force delete even if branch is not fully merged

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#type-gitinit) type GitInit

[Section titled “type GitInit”](https://www.daytona.io/docs/en/go-sdk/options/#type-gitinit)

GitInit holds optional parameters for \[daytona.GitService.Init\].

```
type GitInit struct {

    Bare          *bool   // Create a bare repository without a working tree

    InitialBranch *string // Name of the initial branch (defaults to the Git default)

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#type-gitpull) type GitPull

[Section titled “type GitPull”](https://www.daytona.io/docs/en/go-sdk/options/#type-gitpull)

GitPull holds optional parameters for \[daytona.GitService.Pull\].

```
type GitPull struct {

    Username *string // Username for HTTPS authentication

    Password *string // Password or token for HTTPS authentication

    Branch   *string // Branch to pull (defaults to the current branch's upstream)

    Remote   *string // Remote to pull from (defaults to "origin")

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#type-gitpush) type GitPush

[Section titled “type GitPush”](https://www.daytona.io/docs/en/go-sdk/options/#type-gitpush)

GitPush holds optional parameters for \[daytona.GitService.Push\].

```
type GitPush struct {

    Username    *string // Username for HTTPS authentication

    Password    *string // Password or token for HTTPS authentication

    Branch      *string // Branch to push (defaults to the current branch)

    Remote      *string // Remote to push to (defaults to "origin")

    SetUpstream *bool   // Record the pushed branch as the upstream tracking branch

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#type-gitremoteadd) type GitRemoteAdd

[Section titled “type GitRemoteAdd”](https://www.daytona.io/docs/en/go-sdk/options/#type-gitremoteadd)

GitRemoteAdd holds optional parameters for \[daytona.GitService.RemoteAdd\].

```
type GitRemoteAdd struct {

    Fetch     *bool // Fetch from the remote immediately after adding it

    Overwrite *bool // Replace an existing remote with the same name

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#type-gitreset) type GitReset

[Section titled “type GitReset”](https://www.daytona.io/docs/en/go-sdk/options/#type-gitreset)

GitReset holds optional parameters for \[daytona.GitService.Reset\].

```
type GitReset struct {

    Mode   *string  // Reset mode: "soft", "mixed" (default), "hard", "merge" or "keep"

    Target *string  // Revision to reset to (defaults to HEAD)

    Files  []string // Constrain the reset to the given paths

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#type-gitrestore) type GitRestore

[Section titled “type GitRestore”](https://www.daytona.io/docs/en/go-sdk/options/#type-gitrestore)

GitRestore holds optional parameters for \[daytona.GitService.Restore\].

```
type GitRestore struct {

    Staged   *bool   // Restore the staging index for the given files

    Worktree *bool   // Restore the working tree for the given files (default when neither is set)

    Source   *string // Restore file contents from the given revision instead of the index

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#type-listfiles) type ListFiles

[Section titled “type ListFiles”](https://www.daytona.io/docs/en/go-sdk/options/#type-listfiles)

ListFiles holds optional parameters for \[daytona.FileSystemService.ListFiles\].

```
type ListFiles struct {

    Depth *int32 // How many levels deep to list (default: 1, must be >= 1)

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#type-pipinstall) type PipInstall

[Section titled “type PipInstall”](https://www.daytona.io/docs/en/go-sdk/options/#type-pipinstall)

PipInstall holds optional parameters for \[daytona.Image.PipInstall\].

```
type PipInstall struct {

    FindLinks      []string // URLs to search for packages

    IndexURL       string   // Base URL of the Python Package Index

    ExtraIndexURLs []string // Extra index URLs for package lookup

    Pre            bool     // Allow pre-release and development versions

    ExtraOptions   string   // Additional pip command-line options

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#type-ptysession) type PtySession

[Section titled “type PtySession”](https://www.daytona.io/docs/en/go-sdk/options/#type-ptysession)

PtySession holds optional parameters for \[daytona.ProcessService.CreatePtySession\].

```
type PtySession struct {

    PtySize *types.PtySize    // Terminal dimensions (rows and columns)

    Env     map[string]string // Environment variables for the PTY session

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#type-runcode) type RunCode

[Section titled “type RunCode”](https://www.daytona.io/docs/en/go-sdk/options/#type-runcode)

RunCode holds optional parameters for \[daytona.CodeInterpreterService.RunCode\].

```
type RunCode struct {

    ContextID string            // Interpreter context ID for persistent state

    Env       map[string]string // Environment variables for code execution

    Timeout   *time.Duration    // Execution timeout

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/options/\#type-setfilepermissions) type SetFilePermissions

[Section titled “type SetFilePermissions”](https://www.daytona.io/docs/en/go-sdk/options/#type-setfilepermissions)

SetFilePermissions holds optional parameters for \[daytona.FileSystemService.SetFilePermissions\].

```
type SetFilePermissions struct {

    Mode  *string // Unix file permissions (e.g., "0644")

    Owner *string // File owner username

    Group *string // File group name

}
```