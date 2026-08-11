---
url: "https://www.daytona.io/docs/en/python-sdk/async/async-git/"
title: "AsyncGit | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/python-sdk/async/async-git/#_top)

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/python-sdk/async/async-git.md)Open

## [\#](https://www.daytona.io/docs/en/python-sdk/async/async-git/\#asyncgit) AsyncGit

[Section titled “AsyncGit”](https://www.daytona.io/docs/en/python-sdk/async/async-git/#asyncgit)

```
class AsyncGit()
```

Provides Git operations within a Sandbox.

**Example**:

```
# Clone a repository

await sandbox.git.clone(

    url="https://github.com/user/repo.git",

    path="workspace/repo"

)

# Check repository status

status = await sandbox.git.status("workspace/repo")

print(f"Modified files: {status.modified}")

# Stage and commit changes

await sandbox.git.add("workspace/repo", ["file.txt"])

await sandbox.git.commit(

    path="workspace/repo",

    message="Update file",

    author="John Doe",

    email="john@example.com"

)
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/async/async-git/\#asyncgit__init__) AsyncGit.\_\_init\_\_

[Section titled “AsyncGit.\_\_init\_\_”](https://www.daytona.io/docs/en/python-sdk/async/async-git/#asyncgit__init__)

```
def __init__(api_client: GitApi)
```

Initializes a new Git handler instance.

**Arguments**:

- `api_client` _GitApi_ \- API client for Sandbox Git operations.

#### [\#](https://www.daytona.io/docs/en/python-sdk/async/async-git/\#asyncgitadd) AsyncGit.add

[Section titled “AsyncGit.add”](https://www.daytona.io/docs/en/python-sdk/async/async-git/#asyncgitadd)

```
@intercept_errors(message_prefix="Failed to add files: ")

@with_instrumentation()

async def add(path: str,

              files: list[str],

              request_timeout: float | None = None) -> None
```

Stages the specified files for the next commit, similar to
running ‘git add’ on the command line.

**Arguments**:

- `path` _str_ \- Path to the Git repository root. Relative paths are resolved based on
the sandbox working directory.
- `files` _list\[str\]_ \- List of file paths or directories to stage, relative to the repository root.
- `request_timeout` _float \| None_ \- Optional client-side request timeout in seconds. Client-side
only. It bounds how long the SDK waits for the HTTP response and does not cancel
the operation on the server. Positive values under 1 second are rounded up to 1
second; 0 disables the client-side timeout and negative values are rejected.

**Example**:

```
# Stage a single file

await sandbox.git.add("workspace/repo", ["file.txt"])

# Stage multiple files

await sandbox.git.add("workspace/repo", [\
\
    "src/main.py",\
\
    "tests/test_main.py",\
\
    "README.md"\
\
])
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/async/async-git/\#asyncgitbranches) AsyncGit.branches

[Section titled “AsyncGit.branches”](https://www.daytona.io/docs/en/python-sdk/async/async-git/#asyncgitbranches)

```
@intercept_errors(message_prefix="Failed to list branches: ")

@with_instrumentation()

async def branches(path: str,

                   request_timeout: float | None = None) -> ListBranchResponse
```

Lists branches in the repository.

**Arguments**:

- `path` _str_ \- Path to the Git repository root. Relative paths are resolved based on
the sandbox working directory.
- `request_timeout` _float \| None_ \- Optional client-side request timeout in seconds. Client-side
only. It bounds how long the SDK waits for the HTTP response and does not cancel
the operation on the server. Positive values under 1 second are rounded up to 1
second; 0 disables the client-side timeout and negative values are rejected.

**Returns**:

- `ListBranchResponse` \- List of branches in the repository.

**Example**:

```
response = await sandbox.git.branches("workspace/repo")

print(f"Branches: {response.branches}")
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/async/async-git/\#asyncgitclone) AsyncGit.clone

[Section titled “AsyncGit.clone”](https://www.daytona.io/docs/en/python-sdk/async/async-git/#asyncgitclone)

```
@intercept_errors(message_prefix="Failed to clone repository: ")

@with_instrumentation()

async def clone(url: str,

                path: str,

                branch: str | None = None,

                commit_id: str | None = None,

                username: str | None = None,

                password: str | None = None,

                insecure_skip_tls: bool | None = None,

                depth: int | None = None,

                request_timeout: float | None = None) -> None
```

Clones a Git repository into the specified path. It supports
cloning specific branches or commits, and can authenticate with the remote
repository if credentials are provided.

**Arguments**:

- `url` _str_ \- Repository URL to clone from.
- `path` _str_ \- Path where the repository should be cloned. Relative paths are resolved
based on the sandbox working directory.
- `branch` _str \| None_ \- Specific branch to clone. If not specified,
clones the default branch.
- `commit_id` _str \| None_ \- Specific commit to clone. If specified,
the repository will be left in a detached HEAD state at this commit.
- `username` _str \| None_ \- Git username for authentication.
- `password` _str \| None_ \- Git password or token for authentication.
- `insecure_skip_tls` _bool \| None_ \- Skip TLS certificate verification (insecure).
Use only for trusted internal Git servers with self-signed or private-CA certs;
credentials, if supplied, are transmitted over an unverified TLS connection.
- `depth` _int \| None_ \- Create a shallow clone truncated to the given number of commits.
- `request_timeout` _float \| None_ \- Optional client-side request timeout in seconds. Client-side
only. It bounds how long the SDK waits for the HTTP response and does not cancel
the operation on the server. Positive values under 1 second are rounded up to 1
second; 0 disables the client-side timeout and negative values are rejected.

**Example**:

```
# Clone the default branch

await sandbox.git.clone(

    url="https://github.com/user/repo.git",

    path="workspace/repo"

)

# Clone a specific branch with authentication

await sandbox.git.clone(

    url="https://github.com/user/private-repo.git",

    path="workspace/private",

    branch="develop",

    username="user",

    password="token"

)

# Clone a specific commit

await sandbox.git.clone(

    url="https://github.com/user/repo.git",

    path="workspace/repo-old",

    commit_id="abc123"

)
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/async/async-git/\#asyncgitcommit) AsyncGit.commit

[Section titled “AsyncGit.commit”](https://www.daytona.io/docs/en/python-sdk/async/async-git/#asyncgitcommit)

```
@intercept_errors(message_prefix="Failed to commit changes: ")

@with_instrumentation()

async def commit(path: str,

                 message: str,

                 author: str,

                 email: str,

                 allow_empty: bool = False,

                 request_timeout: float | None = None) -> GitCommitResponse
```

Creates a new commit with the staged changes. Make sure to stage
changes using the add() method before committing.

**Arguments**:

- `path` _str_ \- Path to the Git repository root. Relative paths are resolved based on
the sandbox working directory.
- `message` _str_ \- Commit message describing the changes.
- `author` _str_ \- Name of the commit author.
- `email` _str_ \- Email address of the commit author.
- `allow_empty` _bool_ \- Allow creating an empty commit when no changes are staged. Defaults to False.
- `request_timeout` _float \| None_ \- Optional client-side request timeout in seconds. Client-side
only. It bounds how long the SDK waits for the HTTP response and does not cancel
the operation on the server. Positive values under 1 second are rounded up to 1
second; 0 disables the client-side timeout and negative values are rejected.

**Example**:

```
# Stage and commit changes

await sandbox.git.add("workspace/repo", ["README.md"])

await sandbox.git.commit(

    path="workspace/repo",

    message="Update documentation",

    author="John Doe",

    email="john@example.com",

    allow_empty=True

)
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/async/async-git/\#asyncgitpush) AsyncGit.push

[Section titled “AsyncGit.push”](https://www.daytona.io/docs/en/python-sdk/async/async-git/#asyncgitpush)

```
@intercept_errors(message_prefix="Failed to push changes: ")

@with_instrumentation()

async def push(path: str,

               username: str | None = None,

               password: str | None = None,

               branch: str | None = None,

               remote: str | None = None,

               set_upstream: bool = False,

               request_timeout: float | None = None) -> None
```

Pushes all local commits on the current branch to the remote
repository. If the remote repository requires authentication, provide
username and password/token.

**Arguments**:

- `path` _str_ \- Path to the Git repository root. Relative paths are resolved based on
the sandbox working directory.
- `username` _str \| None_ \- Git username for authentication.
- `password` _str \| None_ \- Git password or token for authentication.
- `branch` _str \| None_ \- Branch to push. Defaults to the current branch.
- `remote` _str \| None_ \- Remote to push to. Defaults to “origin”.
- `set_upstream` _bool, optional_ \- Record the pushed branch as the upstream tracking
branch. Defaults to False.
- `request_timeout` _float \| None_ \- Optional client-side request timeout in seconds. Client-side
only. It bounds how long the SDK waits for the HTTP response and does not cancel
the operation on the server. Positive values under 1 second are rounded up to 1
second; 0 disables the client-side timeout and negative values are rejected.

**Example**:

```
# Push without authentication (for public repos or SSH)

await sandbox.git.push("workspace/repo")

# Push with authentication

await sandbox.git.push(

    path="workspace/repo",

    username="user",

    password="github_token"

)

# Push a new branch and set its upstream

await sandbox.git.push("workspace/repo", branch="feature", set_upstream=True)
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/async/async-git/\#asyncgitpull) AsyncGit.pull

[Section titled “AsyncGit.pull”](https://www.daytona.io/docs/en/python-sdk/async/async-git/#asyncgitpull)

```
@intercept_errors(message_prefix="Failed to pull changes: ")

@with_instrumentation()

async def pull(path: str,

               username: str | None = None,

               password: str | None = None,

               branch: str | None = None,

               remote: str | None = None,

               request_timeout: float | None = None) -> None
```

Pulls changes from the remote repository. If the remote repository requires authentication,
provide username and password/token.

**Arguments**:

- `path` _str_ \- Path to the Git repository root. Relative paths are resolved based on
the sandbox working directory.
- `username` _str \| None_ \- Git username for authentication.
- `password` _str \| None_ \- Git password or token for authentication.
- `branch` _str \| None_ \- Branch to pull. Defaults to the current branch’s upstream.
- `remote` _str \| None_ \- Remote to pull from. Defaults to “origin”.
- `request_timeout` _float \| None_ \- Optional client-side request timeout in seconds. Client-side
only. It bounds how long the SDK waits for the HTTP response and does not cancel
the operation on the server. Positive values under 1 second are rounded up to 1
second; 0 disables the client-side timeout and negative values are rejected.

**Example**:

```
# Pull without authentication

await sandbox.git.pull("workspace/repo")

# Pull with authentication

await sandbox.git.pull(

    path="workspace/repo",

    username="user",

    password="github_token"

)

# Pull a specific branch from a specific remote

await sandbox.git.pull("workspace/repo", remote="upstream", branch="main")
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/async/async-git/\#asyncgitstatus) AsyncGit.status

[Section titled “AsyncGit.status”](https://www.daytona.io/docs/en/python-sdk/async/async-git/#asyncgitstatus)

```
@intercept_errors(message_prefix="Failed to get status: ")

@with_instrumentation()

async def status(path: str, request_timeout: float | None = None) -> GitStatus
```

Gets the current Git repository status.

**Arguments**:

- `path` _str_ \- Path to the Git repository root. Relative paths are resolved based on
the sandbox working directory.
- `request_timeout` _float \| None_ \- Optional client-side request timeout in seconds. Client-side
only. It bounds how long the SDK waits for the HTTP response and does not cancel
the operation on the server. Positive values under 1 second are rounded up to 1
second; 0 disables the client-side timeout and negative values are rejected.

**Returns**:

- `GitStatus`\- Repository status information including:

  - current\_branch: Current branch name
  - file\_status: List of file statuses
  - ahead: Number of local commits not pushed to remote
  - behind: Number of remote commits not pulled locally
  - branch\_published: Whether the branch has been published to the remote repository

**Example**:

```
status = await sandbox.git.status("workspace/repo")

print(f"On branch: {status.current_branch}")

print(f"Commits ahead: {status.ahead}")

print(f"Commits behind: {status.behind}")
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/async/async-git/\#asyncgitcheckout_branch) AsyncGit.checkout\_branch

[Section titled “AsyncGit.checkout\_branch”](https://www.daytona.io/docs/en/python-sdk/async/async-git/#asyncgitcheckout_branch)

```
@intercept_errors(message_prefix="Failed to checkout branch: ")

@with_instrumentation()

async def checkout_branch(path: str,

                          branch: str,

                          request_timeout: float | None = None) -> None
```

Checkout branch in the repository.

**Arguments**:

- `path` _str_ \- Path to the Git repository root. Relative paths are resolved based on
the sandbox working directory.
- `branch` _str_ \- Name of the branch to checkout
- `request_timeout` _float \| None_ \- Optional client-side request timeout in seconds. Client-side
only. It bounds how long the SDK waits for the HTTP response and does not cancel
the operation on the server. Positive values under 1 second are rounded up to 1
second; 0 disables the client-side timeout and negative values are rejected.

**Example**:

```
# Checkout a branch

await sandbox.git.checkout_branch("workspace/repo", "feature-branch")
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/async/async-git/\#asyncgitcreate_branch) AsyncGit.create\_branch

[Section titled “AsyncGit.create\_branch”](https://www.daytona.io/docs/en/python-sdk/async/async-git/#asyncgitcreate_branch)

```
@intercept_errors(message_prefix="Failed to create branch: ")

@with_instrumentation()

async def create_branch(path: str,

                        name: str,

                        request_timeout: float | None = None) -> None
```

Create branch in the repository.

**Arguments**:

- `path` _str_ \- Path to the Git repository root. Relative paths are resolved based on
the sandbox working directory.
- `name` _str_ \- Name of the new branch to create
- `request_timeout` _float \| None_ \- Optional client-side request timeout in seconds. Client-side
only. It bounds how long the SDK waits for the HTTP response and does not cancel
the operation on the server. Positive values under 1 second are rounded up to 1
second; 0 disables the client-side timeout and negative values are rejected.

**Example**:

```
# Create a new branch

await sandbox.git.create_branch("workspace/repo", "new-feature")
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/async/async-git/\#asyncgitdelete_branch) AsyncGit.delete\_branch

[Section titled “AsyncGit.delete\_branch”](https://www.daytona.io/docs/en/python-sdk/async/async-git/#asyncgitdelete_branch)

```
@intercept_errors(message_prefix="Failed to delete branch: ")

@with_instrumentation()

async def delete_branch(path: str,

                        name: str,

                        request_timeout: float | None = None) -> None
```

Delete branch in the repository.

**Arguments**:

- `path` _str_ \- Path to the Git repository root. Relative paths are resolved based on
the sandbox working directory.
- `name` _str_ \- Name of the branch to delete
- `request_timeout` _float \| None_ \- Optional client-side request timeout in seconds. Client-side
only. It bounds how long the SDK waits for the HTTP response and does not cancel
the operation on the server. Positive values under 1 second are rounded up to 1
second; 0 disables the client-side timeout and negative values are rejected.

**Example**:

```
# Delete a branch

await sandbox.git.delete_branch("workspace/repo", "old-feature")
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/async/async-git/\#asyncgitinit) AsyncGit.init

[Section titled “AsyncGit.init”](https://www.daytona.io/docs/en/python-sdk/async/async-git/#asyncgitinit)

```
@intercept_errors(message_prefix="Failed to initialize repository: ")

@with_instrumentation()

async def init(path: str,

               bare: bool = False,

               initial_branch: str | None = None,

               request_timeout: float | None = None) -> None
```

Initializes a new Git repository at the specified path.

**Arguments**:

- `path` _str_ \- Path where the repository should be initialized. Relative paths are
resolved based on the sandbox working directory.
- `bare` _bool, optional_ \- Create a bare repository without a working tree. Defaults to False.
- `initial_branch` _str \| None_ \- Name of the initial branch. If not specified, uses the
Git default.
- `request_timeout` _float \| None_ \- Optional client-side request timeout in seconds. Client-side
only. It bounds how long the SDK waits for the HTTP response and does not cancel
the operation on the server. Positive values under 1 second are rounded up to 1
second; 0 disables the client-side timeout and negative values are rejected.

**Example**:

```
await sandbox.git.init("workspace/repo", initial_branch="main")
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/async/async-git/\#asyncgitreset) AsyncGit.reset

[Section titled “AsyncGit.reset”](https://www.daytona.io/docs/en/python-sdk/async/async-git/#asyncgitreset)

```
@intercept_errors(message_prefix="Failed to reset: ")

@with_instrumentation()

async def reset(path: str,

                mode: str | None = None,

                target: str | None = None,

                files: list[str] | None = None,

                request_timeout: float | None = None) -> None
```

Resets the current HEAD to the specified state.

**Arguments**:

- `path` _str_ \- Path to the Git repository root. Relative paths are resolved based on
the sandbox working directory.
- `mode` _str \| None_ \- Reset mode, one of “soft”, “mixed” (default), “hard”, “merge” or “keep”.
- `target` _str \| None_ \- Revision to reset to. Defaults to HEAD.
- `files` _list\[str\] \| None_ \- Constrain the reset to the given paths.
- `request_timeout` _float \| None_ \- Optional client-side request timeout in seconds. Client-side
only. It bounds how long the SDK waits for the HTTP response and does not cancel
the operation on the server. Positive values under 1 second are rounded up to 1
second; 0 disables the client-side timeout and negative values are rejected.

**Example**:

```
# Unstage all changes (mixed reset to HEAD)

await sandbox.git.reset("workspace/repo")

# Hard reset to a previous commit

await sandbox.git.reset("workspace/repo", mode="hard", target="HEAD~1")
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/async/async-git/\#asyncgitrestore) AsyncGit.restore

[Section titled “AsyncGit.restore”](https://www.daytona.io/docs/en/python-sdk/async/async-git/#asyncgitrestore)

```
@intercept_errors(message_prefix="Failed to restore files: ")

@with_instrumentation()

async def restore(path: str,

                  files: list[str],

                  staged: bool | None = None,

                  worktree: bool | None = None,

                  source: str | None = None,

                  request_timeout: float | None = None) -> None
```

Restores working tree files or unstages changes.

**Arguments**:

- `path` _str_ \- Path to the Git repository root. Relative paths are resolved based on
the sandbox working directory.
- `files` _list\[str\]_ \- File paths to restore.
- `staged` _bool \| None_ \- Restore the staging index for the given files.
- `worktree` _bool \| None_ \- Restore the working tree for the given files. Defaults to
True when neither staged nor worktree is provided.
- `source` _str \| None_ \- Restore file contents from the given revision instead of the index.
- `request_timeout` _float \| None_ \- Optional client-side request timeout in seconds. Client-side
only. It bounds how long the SDK waits for the HTTP response and does not cancel
the operation on the server. Positive values under 1 second are rounded up to 1
second; 0 disables the client-side timeout and negative values are rejected.

**Example**:

```
# Discard working tree changes

await sandbox.git.restore("workspace/repo", ["file.txt"])

# Unstage changes

await sandbox.git.restore("workspace/repo", ["file.txt"], staged=True)
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/async/async-git/\#asyncgitremote_add) AsyncGit.remote\_add

[Section titled “AsyncGit.remote\_add”](https://www.daytona.io/docs/en/python-sdk/async/async-git/#asyncgitremote_add)

```
@intercept_errors(message_prefix="Failed to add remote: ")

@with_instrumentation()

async def remote_add(path: str,

                     name: str,

                     url: str,

                     fetch: bool = False,

                     overwrite: bool = False,

                     request_timeout: float | None = None) -> None
```

Adds (or overwrites) a remote in the repository.

**Arguments**:

- `path` _str_ \- Path to the Git repository root. Relative paths are resolved based on
the sandbox working directory.
- `name` _str_ \- Name of the remote.
- `url` _str_ \- URL of the remote.
- `fetch` _bool, optional_ \- Fetch from the remote immediately after adding it. Defaults to False.
- `overwrite` _bool, optional_ \- Replace an existing remote with the same name. Defaults to False.
- `request_timeout` _float \| None_ \- Optional client-side request timeout in seconds. Client-side
only. It bounds how long the SDK waits for the HTTP response and does not cancel
the operation on the server. Positive values under 1 second are rounded up to 1
second; 0 disables the client-side timeout and negative values are rejected.

**Example**:

```
await sandbox.git.remote_add("workspace/repo", "origin", "https://github.com/user/repo.git")
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/async/async-git/\#asyncgitremotes) AsyncGit.remotes

[Section titled “AsyncGit.remotes”](https://www.daytona.io/docs/en/python-sdk/async/async-git/#asyncgitremotes)

```
@intercept_errors(message_prefix="Failed to list remotes: ")

@with_instrumentation()

async def remotes(path: str,

                  request_timeout: float | None = None) -> ListRemotesResponse
```

Lists the remotes configured in the repository.

**Arguments**:

- `path` _str_ \- Path to the Git repository root. Relative paths are resolved based on
the sandbox working directory.
- `request_timeout` _float \| None_ \- Optional client-side request timeout in seconds. Client-side
only. It bounds how long the SDK waits for the HTTP response and does not cancel
the operation on the server. Positive values under 1 second are rounded up to 1
second; 0 disables the client-side timeout and negative values are rejected.

**Returns**:

- `ListRemotesResponse` \- The configured remotes (name + URL).

**Example**:

```
response = await sandbox.git.remotes("workspace/repo")

for remote in response.remotes:

    print(f"{remote.name}: {remote.url}")
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/async/async-git/\#asyncgitremote_get) AsyncGit.remote\_get

[Section titled “AsyncGit.remote\_get”](https://www.daytona.io/docs/en/python-sdk/async/async-git/#asyncgitremote_get)

```
@intercept_errors(message_prefix="Failed to get remote: ")

@with_instrumentation()

async def remote_get(path: str,

                     name: str,

                     request_timeout: float | None = None) -> str | None
```

Gets the URL of a remote, or None when it does not exist.

**Arguments**:

- `path` _str_ \- Path to the Git repository root. Relative paths are resolved based on
the sandbox working directory.
- `name` _str_ \- Name of the remote.
- `request_timeout` _float \| None_ \- Optional client-side request timeout in seconds. Client-side
only. It bounds how long the SDK waits for the HTTP response and does not cancel
the operation on the server. Positive values under 1 second are rounded up to 1
second; 0 disables the client-side timeout and negative values are rejected.

**Returns**:

str \| None: The remote URL, or None when the remote does not exist.

**Example**:

```
url = await sandbox.git.remote_get("workspace/repo", "origin")
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/async/async-git/\#asyncgitset_config) AsyncGit.set\_config

[Section titled “AsyncGit.set\_config”](https://www.daytona.io/docs/en/python-sdk/async/async-git/#asyncgitset_config)

```
@intercept_errors(message_prefix="Failed to set config: ")

@with_instrumentation()

async def set_config(key: str,

                     value: str,

                     scope: str = "global",

                     path: str | None = None,

                     request_timeout: float | None = None) -> None
```

Sets a Git config value at the given scope.

**Arguments**:

- `key` _str_ \- Config key in dotted form (e.g. “user.name”).
- `value` _str_ \- Config value.
- `scope` _str, optional_ \- Config scope, one of “global” (default), “local” or “system”.
- `path` _str \| None_ \- Repository path, required when scope is “local”.
- `request_timeout` _float \| None_ \- Optional client-side request timeout in seconds. Client-side
only. It bounds how long the SDK waits for the HTTP response and does not cancel
the operation on the server. Positive values under 1 second are rounded up to 1
second; 0 disables the client-side timeout and negative values are rejected.

**Example**:

```
await sandbox.git.set_config("user.name", "John Doe")
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/async/async-git/\#asyncgitget_config) AsyncGit.get\_config

[Section titled “AsyncGit.get\_config”](https://www.daytona.io/docs/en/python-sdk/async/async-git/#asyncgitget_config)

```
@intercept_errors(message_prefix="Failed to get config: ")

@with_instrumentation()

async def get_config(key: str,

                     scope: str = "global",

                     path: str | None = None,

                     request_timeout: float | None = None) -> str | None
```

Gets a Git config value at the given scope, or None when unset.

**Arguments**:

- `key` _str_ \- Config key in dotted form (e.g. “user.name”).
- `scope` _str, optional_ \- Config scope, one of “global” (default), “local” or “system”.
- `path` _str \| None_ \- Repository path, required when scope is “local”.
- `request_timeout` _float \| None_ \- Optional client-side request timeout in seconds. Client-side
only. It bounds how long the SDK waits for the HTTP response and does not cancel
the operation on the server. Positive values under 1 second are rounded up to 1
second; 0 disables the client-side timeout and negative values are rejected.

**Returns**:

str \| None: The config value, or None when the key is not set.

**Example**:

```
name = await sandbox.git.get_config("user.name")
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/async/async-git/\#asyncgitconfigure_user) AsyncGit.configure\_user

[Section titled “AsyncGit.configure\_user”](https://www.daytona.io/docs/en/python-sdk/async/async-git/#asyncgitconfigure_user)

```
@intercept_errors(message_prefix="Failed to configure user: ")

@with_instrumentation()

async def configure_user(name: str,

                         email: str,

                         scope: str = "global",

                         path: str | None = None,

                         request_timeout: float | None = None) -> None
```

Configures the Git user name and email at the given scope.

**Arguments**:

- `name` _str_ \- User name (user.name).
- `email` _str_ \- User email (user.email).
- `scope` _str, optional_ \- Config scope, one of “global” (default), “local” or “system”.
- `path` _str \| None_ \- Repository path, required when scope is “local”.
- `request_timeout` _float \| None_ \- Optional client-side request timeout in seconds. Client-side
only. It bounds how long the SDK waits for the HTTP response and does not cancel
the operation on the server. Positive values under 1 second are rounded up to 1
second; 0 disables the client-side timeout and negative values are rejected.

**Example**:

```
await sandbox.git.configure_user("John Doe", "john@example.com")
```

#### [\#](https://www.daytona.io/docs/en/python-sdk/async/async-git/\#asyncgitdangerously_authenticate) AsyncGit.dangerously\_authenticate

[Section titled “AsyncGit.dangerously\_authenticate”](https://www.daytona.io/docs/en/python-sdk/async/async-git/#asyncgitdangerously_authenticate)

```
@intercept_errors(message_prefix="Failed to authenticate: ")

@with_instrumentation()

async def dangerously_authenticate(

        username: str,

        password: str,

        host: str | None = None,

        protocol: str | None = None,

        request_timeout: float | None = None) -> None
```

Persists Git credentials globally so that subsequent operations against the
given host authenticate automatically.

**Warnings**:

This stores the password in plaintext on disk via the Git credential store.

**Arguments**:

- `username` _str_ \- Git username.
- `password` _str_ \- Git password or token.
- `host` _str \| None_ \- Host to authenticate against. Defaults to “github.com”.
- `protocol` _str \| None_ \- Protocol to authenticate against. Defaults to “https”.
- `request_timeout` _float \| None_ \- Optional client-side request timeout in seconds. Client-side
only. It bounds how long the SDK waits for the HTTP response and does not cancel
the operation on the server. Positive values under 1 second are rounded up to 1
second; 0 disables the client-side timeout and negative values are rejected.

**Example**:

```
await sandbox.git.dangerously_authenticate("user", "github_token")
```

## [\#](https://www.daytona.io/docs/en/python-sdk/async/async-git/\#gitcommitresponse) GitCommitResponse

[Section titled “GitCommitResponse”](https://www.daytona.io/docs/en/python-sdk/async/async-git/#gitcommitresponse)

```
class GitCommitResponse()
```

Response from the git commit.

**Attributes**:

- `sha` _str_ \- The SHA of the commit