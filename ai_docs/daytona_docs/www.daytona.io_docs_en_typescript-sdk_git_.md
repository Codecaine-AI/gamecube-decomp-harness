---
url: "https://www.daytona.io/docs/en/typescript-sdk/git/"
title: "Git | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/typescript-sdk/git/#_top)

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/typescript-sdk/git.md)Open

## [\#](https://www.daytona.io/docs/en/typescript-sdk/git/\#git) Git

[Section titled “Git”](https://www.daytona.io/docs/en/typescript-sdk/git/#git)

Provides Git operations within a Sandbox.

### [\#](https://www.daytona.io/docs/en/typescript-sdk/git/\#constructors) Constructors

[Section titled “Constructors”](https://www.daytona.io/docs/en/typescript-sdk/git/#constructors)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/git/\#new-git) new Git()

[Section titled “new Git()”](https://www.daytona.io/docs/en/typescript-sdk/git/#new-git)

```
new Git(apiClient: GitApi): Git
```

**Parameters**:

- `apiClient` _GitApi_

**Returns**:

- `Git`

### [\#](https://www.daytona.io/docs/en/typescript-sdk/git/\#methods) Methods

[Section titled “Methods”](https://www.daytona.io/docs/en/typescript-sdk/git/#methods)

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/git/\#add) add()

[Section titled “add()”](https://www.daytona.io/docs/en/typescript-sdk/git/#add)

```
add(path: string, files: string[]): Promise<void>
```

Stages the specified files for the next commit, similar to
running ‘git add’ on the command line.

**Parameters**:

- `path` _string_ \- Path to the Git repository root. Relative paths are resolved based on the sandbox working directory.
- `files` _string\[\]_ \- List of file paths or directories to stage, relative to the repository root

**Returns**:

- `Promise<void>`

**Examples:**

```
// Stage a single file

await git.add('workspace/repo', ['file.txt']);
```

```
// Stage whole repository

await git.add('workspace/repo', ['.']);
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/git/\#branches) branches()

[Section titled “branches()”](https://www.daytona.io/docs/en/typescript-sdk/git/#branches)

```
branches(path: string): Promise<ListBranchResponse>
```

List branches in the repository.

**Parameters**:

- `path` _string_ \- Path to the Git repository root. Relative paths are resolved based on the sandbox working directory.

**Returns**:

- `Promise<ListBranchResponse>` \- List of branches in the repository

**Example:**

```
const response = await git.branches('workspace/repo');

console.log(`Branches: ${response.branches}`);
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/git/\#checkoutbranch) checkoutBranch()

[Section titled “checkoutBranch()”](https://www.daytona.io/docs/en/typescript-sdk/git/#checkoutbranch)

```
checkoutBranch(path: string, branch: string): Promise<void>
```

Checkout branche in the repository.

**Parameters**:

- `path` _string_ \- Path to the Git repository root. Relative paths are resolved based on the sandbox working directory.
- `branch` _string_ \- Name of the branch to checkout

**Returns**:

- `Promise<void>`

**Example:**

```
await git.checkoutBranch('workspace/repo', 'new-feature');
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/git/\#clone) clone()

[Section titled “clone()”](https://www.daytona.io/docs/en/typescript-sdk/git/#clone)

```
clone(

   url: string,

   path: string,

   branch?: string,

   commitId?: string,

   username?: string,

   password?: string,

   insecureSkipTls?: boolean,

depth?: number): Promise<void>
```

Clones a Git repository into the specified path. It supports
cloning specific branches or commits, and can authenticate with the remote
repository if credentials are provided.

**Parameters**:

- `url` _string_ \- Repository URL to clone from
- `path` _string_ \- Path where the repository should be cloned. Relative paths are resolved based on the sandbox working directory.
- `branch?` _string_ \- Specific branch to clone. If not specified, clones the default branch
- `commitId?` _string_ \- Specific commit to clone. If specified, the repository will be left in a detached HEAD state at this commit
- `username?` _string_ \- Git username for authentication
- `password?` _string_ \- Git password or token for authentication
- `insecureSkipTls?` _boolean_ \- Skip TLS certificate verification (insecure). Use only for trusted internal Git servers with self-signed or private-CA certs.
- `depth?` _number_ \- Create a shallow clone truncated to the given number of commits.

**Returns**:

- `Promise<void>`

**Examples:**

```
// Clone the default branch

await git.clone(

  'https://github.com/user/repo.git',

  'workspace/repo'

);
```

```
// Clone a specific branch with authentication

await git.clone(

  'https://github.com/user/private-repo.git',

  'workspace/private',

  branch='develop',

  username='user',

  password='token'

);
```

```
// Clone a specific commit

await git.clone(

  'https://github.com/user/repo.git',

  'workspace/repo-old',

  commitId='abc123'

);
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/git/\#commit) commit()

[Section titled “commit()”](https://www.daytona.io/docs/en/typescript-sdk/git/#commit)

```
commit(

   path: string,

   message: string,

   author: string,

   email: string,

allowEmpty?: boolean): Promise<GitCommitResponse>
```

Commits staged changes.

**Parameters**:

- `path` _string_ \- Path to the Git repository root. Relative paths are resolved based on the sandbox working directory.
- `message` _string_ \- Commit message describing the changes
- `author` _string_ \- Name of the commit author
- `email` _string_ \- Email address of the commit author
- `allowEmpty?` _boolean_ \- Allow creating an empty commit when no changes are staged

**Returns**:

- `Promise<GitCommitResponse>`

**Example:**

```
// Stage and commit changes

await git.add('workspace/repo', ['README.md']);

await git.commit(

  'workspace/repo',

  'Update documentation',

  'John Doe',

  'john@example.com',

  true

);
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/git/\#configureuser) configureUser()

[Section titled “configureUser()”](https://www.daytona.io/docs/en/typescript-sdk/git/#configureuser)

```
configureUser(

   name: string,

   email: string,

   scope?: string,

path?: string): Promise<void>
```

Configures the Git user name and email at the given scope.

**Parameters**:

- `name` _string_ \- User name (user.name)
- `email` _string_ \- User email (user.email)
- `scope?` _string = ‘global’_ \- Config scope, one of “global” (default), “local” or “system”
- `path?` _string_ \- Repository path, required when scope is “local”

**Returns**:

- `Promise<void>`

**Example:**

```
await git.configureUser('John Doe', 'john@example.com');
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/git/\#createbranch) createBranch()

[Section titled “createBranch()”](https://www.daytona.io/docs/en/typescript-sdk/git/#createbranch)

```
createBranch(path: string, name: string): Promise<void>
```

Create branch in the repository.

**Parameters**:

- `path` _string_ \- Path to the Git repository root. Relative paths are resolved based on the sandbox working directory.
- `name` _string_ \- Name of the new branch to create

**Returns**:

- `Promise<void>`

**Example:**

```
await git.createBranch('workspace/repo', 'new-feature');
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/git/\#dangerouslyauthenticate) dangerouslyAuthenticate()

[Section titled “dangerouslyAuthenticate()”](https://www.daytona.io/docs/en/typescript-sdk/git/#dangerouslyauthenticate)

```
dangerouslyAuthenticate(

   username: string,

   password: string,

   host?: string,

protocol?: string): Promise<void>
```

Persists Git credentials globally so that subsequent operations against the
given host authenticate automatically.

**Parameters**:

- `username` _string_ \- Git username
- `password` _string_ \- Git password or token
- `host?` _string_ \- Host to authenticate against. Defaults to “github.com”
- `protocol?` _string_ \- Protocol to authenticate against. Defaults to “https”

**Returns**:

- `Promise<void>`

##### [\#](https://www.daytona.io/docs/en/typescript-sdk/git/\#remarks) Remarks

[Section titled “Remarks”](https://www.daytona.io/docs/en/typescript-sdk/git/#remarks)

This stores the password in plaintext on disk via the Git credential store.

**Example:**

```
await git.dangerouslyAuthenticate('user', 'github_token');
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/git/\#deletebranch) deleteBranch()

[Section titled “deleteBranch()”](https://www.daytona.io/docs/en/typescript-sdk/git/#deletebranch)

```
deleteBranch(path: string, name: string): Promise<void>
```

Delete branche in the repository.

**Parameters**:

- `path` _string_ \- Path to the Git repository root. Relative paths are resolved based on the sandbox working directory.
- `name` _string_ \- Name of the branch to delete

**Returns**:

- `Promise<void>`

**Example:**

```
await git.deleteBranch('workspace/repo', 'new-feature');
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/git/\#getconfig) getConfig()

[Section titled “getConfig()”](https://www.daytona.io/docs/en/typescript-sdk/git/#getconfig)

```
getConfig(

   key: string,

   scope?: string,

path?: string): Promise<string>
```

Gets a Git config value at the given scope, or undefined when unset.

**Parameters**:

- `key` _string_ \- Config key in dotted form (e.g. “user.name”)
- `scope?` _string = ‘global’_ \- Config scope, one of “global” (default), “local” or “system”
- `path?` _string_ \- Repository path, required when scope is “local”

**Returns**:

- `Promise<string>` \- The config value, or undefined when the key is not set

**Example:**

```
const name = await git.getConfig('user.name');
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/git/\#init) init()

[Section titled “init()”](https://www.daytona.io/docs/en/typescript-sdk/git/#init)

```
init(

   path: string,

   bare?: boolean,

initialBranch?: string): Promise<void>
```

Initializes a new Git repository at the specified path.

**Parameters**:

- `path` _string_ \- Path where the repository should be initialized. Relative paths are resolved based on the sandbox working directory.
- `bare?` _boolean_ \- Create a bare repository without a working tree
- `initialBranch?` _string_ \- Name of the initial branch. If not specified, uses the Git default

**Returns**:

- `Promise<void>`

**Example:**

```
await git.init('workspace/repo', false, 'main');
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/git/\#pull) pull()

[Section titled “pull()”](https://www.daytona.io/docs/en/typescript-sdk/git/#pull)

```
pull(

   path: string,

   username?: string,

   password?: string,

   branch?: string,

remote?: string): Promise<void>
```

Pulls changes from the remote repository.

**Parameters**:

- `path` _string_ \- Path to the Git repository root. Relative paths are resolved based on the sandbox working directory.
- `username?` _string_ \- Git username for authentication
- `password?` _string_ \- Git password or token for authentication
- `branch?` _string_ \- Branch to pull. Defaults to the current branch’s upstream
- `remote?` _string_ \- Remote to pull from. Defaults to “origin”

**Returns**:

- `Promise<void>`

**Examples:**

```
// Pull from a public repository

await git.pull('workspace/repo');
```

```
// Pull from a private repository

await git.pull(

  'workspace/repo',

  'user',

  'token'

);
```

```
// Pull a specific branch from a specific remote

await git.pull('workspace/repo', undefined, undefined, 'main', 'upstream');
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/git/\#push) push()

[Section titled “push()”](https://www.daytona.io/docs/en/typescript-sdk/git/#push)

```
push(

   path: string,

   username?: string,

   password?: string,

   branch?: string,

   remote?: string,

setUpstream?: boolean): Promise<void>
```

Push local changes to the remote repository.

**Parameters**:

- `path` _string_ \- Path to the Git repository root. Relative paths are resolved based on the sandbox working directory.
- `username?` _string_ \- Git username for authentication
- `password?` _string_ \- Git password or token for authentication
- `branch?` _string_ \- Branch to push. Defaults to the current branch
- `remote?` _string_ \- Remote to push to. Defaults to “origin”
- `setUpstream?` _boolean_ \- Record the pushed branch as the upstream tracking branch

**Returns**:

- `Promise<void>`

**Examples:**

```
// Push to a public repository

await git.push('workspace/repo');
```

```
// Push to a private repository

await git.push(

  'workspace/repo',

  'user',

  'token'

);
```

```
// Push a new branch and set its upstream

await git.push('workspace/repo', undefined, undefined, 'feature', undefined, true);
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/git/\#remoteadd) remoteAdd()

[Section titled “remoteAdd()”](https://www.daytona.io/docs/en/typescript-sdk/git/#remoteadd)

```
remoteAdd(

   path: string,

   name: string,

   url: string,

   fetch?: boolean,

overwrite?: boolean): Promise<void>
```

Adds (or overwrites) a remote in the repository.

**Parameters**:

- `path` _string_ \- Path to the Git repository root. Relative paths are resolved based on the sandbox working directory.
- `name` _string_ \- Name of the remote
- `url` _string_ \- URL of the remote
- `fetch?` _boolean_ \- Fetch from the remote immediately after adding it
- `overwrite?` _boolean_ \- Replace an existing remote with the same name

**Returns**:

- `Promise<void>`

**Example:**

```
await git.remoteAdd('workspace/repo', 'origin', 'https://github.com/user/repo.git');
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/git/\#remoteget) remoteGet()

[Section titled “remoteGet()”](https://www.daytona.io/docs/en/typescript-sdk/git/#remoteget)

```
remoteGet(path: string, name: string): Promise<string>
```

Gets the URL of a remote, or undefined when it does not exist.

**Parameters**:

- `path` _string_ \- Path to the Git repository root. Relative paths are resolved based on the sandbox working directory.
- `name` _string_ \- Name of the remote

**Returns**:

- `Promise<string>` \- The remote URL, or undefined when the remote does not exist

**Example:**

```
const url = await git.remoteGet('workspace/repo', 'origin');
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/git/\#remotes) remotes()

[Section titled “remotes()”](https://www.daytona.io/docs/en/typescript-sdk/git/#remotes)

```
remotes(path: string): Promise<ListRemotesResponse>
```

Lists the remotes configured in the repository.

**Parameters**:

- `path` _string_ \- Path to the Git repository root. Relative paths are resolved based on the sandbox working directory.

**Returns**:

- `Promise<ListRemotesResponse>` \- The configured remotes (name + URL)

**Example:**

```
const response = await git.remotes('workspace/repo');

response.remotes.forEach((r) => console.log(`${r.name}: ${r.url}`));
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/git/\#reset) reset()

[Section titled “reset()”](https://www.daytona.io/docs/en/typescript-sdk/git/#reset)

```
reset(

   path: string,

   mode?: string,

   target?: string,

files?: string[]): Promise<void>
```

Resets the current HEAD to the specified state.

**Parameters**:

- `path` _string_ \- Path to the Git repository root. Relative paths are resolved based on the sandbox working directory.
- `mode?` _string_ \- Reset mode, one of “soft”, “mixed” (default), “hard”, “merge” or “keep”
- `target?` _string_ \- Revision to reset to. Defaults to HEAD
- `files?` _string\[\]_ \- Constrain the reset to the given paths

**Returns**:

- `Promise<void>`

**Examples:**

```
// Unstage all changes (mixed reset to HEAD)

await git.reset('workspace/repo');
```

```
// Hard reset to a previous commit

await git.reset('workspace/repo', 'hard', 'HEAD~1');
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/git/\#restore) restore()

[Section titled “restore()”](https://www.daytona.io/docs/en/typescript-sdk/git/#restore)

```
restore(

   path: string,

   files: string[],

   staged?: boolean,

   worktree?: boolean,

source?: string): Promise<void>
```

Restores working tree files or unstages changes.

**Parameters**:

- `path` _string_ \- Path to the Git repository root. Relative paths are resolved based on the sandbox working directory.
- `files` _string\[\]_ \- File paths to restore
- `staged?` _boolean_ \- Restore the staging index for the given files
- `worktree?` _boolean_ \- Restore the working tree for the given files. Defaults to true when neither staged nor worktree is provided
- `source?` _string_ \- Restore file contents from the given revision instead of the index

**Returns**:

- `Promise<void>`

**Examples:**

```
// Discard working tree changes

await git.restore('workspace/repo', ['file.txt']);
```

```
// Unstage changes

await git.restore('workspace/repo', ['file.txt'], true);
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/git/\#setconfig) setConfig()

[Section titled “setConfig()”](https://www.daytona.io/docs/en/typescript-sdk/git/#setconfig)

```
setConfig(

   key: string,

   value: string,

   scope?: string,

path?: string): Promise<void>
```

Sets a Git config value at the given scope.

**Parameters**:

- `key` _string_ \- Config key in dotted form (e.g. “user.name”)
- `value` _string_ \- Config value
- `scope?` _string = ‘global’_ \- Config scope, one of “global” (default), “local” or “system”
- `path?` _string_ \- Repository path, required when scope is “local”

**Returns**:

- `Promise<void>`

**Example:**

```
await git.setConfig('user.name', 'John Doe');
```

* * *

#### [\#](https://www.daytona.io/docs/en/typescript-sdk/git/\#status) status()

[Section titled “status()”](https://www.daytona.io/docs/en/typescript-sdk/git/#status)

```
status(path: string): Promise<GitStatus>
```

Gets the current status of the Git repository.

**Parameters**:

- `path` _string_ \- Path to the Git repository root. Relative paths are resolved based on the sandbox working directory.

**Returns**:

- `Promise<GitStatus>`\- Current repository status including:

  - currentBranch: Name of the current branch
  - ahead: Number of commits ahead of the remote branch
  - behind: Number of commits behind the remote branch
  - branchPublished: Whether the branch has been published to the remote repository
  - fileStatus: List of file statuses

**Example:**

```
const status = await sandbox.git.status('workspace/repo');

console.log(`Current branch: ${status.currentBranch}`);

console.log(`Commits ahead: ${status.ahead}`);

console.log(`Commits behind: ${status.behind}`);
```

* * *

## [\#](https://www.daytona.io/docs/en/typescript-sdk/git/\#gitcommitresponse) GitCommitResponse

[Section titled “GitCommitResponse”](https://www.daytona.io/docs/en/typescript-sdk/git/#gitcommitresponse)

Response from the git commit.

**Properties**:

- `sha` _string_ \- The SHA of the commit