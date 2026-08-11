---
url: "https://www.daytona.io/docs/en/git-operations.md"
title: undefined
---

# Git Operations

Git operations are available through the `git` module of a sandbox. Operations run through the Daytona API, so your application works with repositories in a sandbox directly, without installing Git clients or executing shell commands inside it.

The `git` module covers cloning repositories, checking status, managing branches, staging and committing changes, pushing and pulling with authentication, and inspecting commit history. Private repositories authenticate with personal access tokens passed per operation.

## Basic operations

Daytona provides methods to clone, check status, and manage Git repositories in sandboxes.

Git operations assume you are operating in the sandbox user's home directory (e.g. `workspace` implies `/home/[username]/workspace`). Use a leading `/` when providing absolute paths.

### Clone repositories

Clone a Git repository into a sandbox by providing the URL and path to clone it to. You can clone public or private repositories, specific branches or commits, and authenticate using personal access tokens.


```python
# Basic clone
sandbox.git.clone(
    url="https://github.com/user/repo.git",
    path="workspace/repo"
)

# Clone with authentication
sandbox.git.clone(
    url="https://github.com/user/repo.git",
    path="workspace/repo",
    username="git",
    password="personal_access_token"
)

# Clone specific branch
sandbox.git.clone(
    url="https://github.com/user/repo.git",
    path="workspace/repo",
    branch="develop"
)

# Clone a specific commit (detached HEAD)
sandbox.git.clone(
    url="https://github.com/user/repo.git",
    path="workspace/repo-old",
    commit_id="abc123def456"
)

# Clone from a self-signed internal Git server (insecure)
sandbox.git.clone(
    url="https://internal-git.example.com/org/repo.git",
    path="workspace/repo",
    insecure_skip_tls=True
)
```


```typescript
// Basic clone
await sandbox.git.clone(
    "https://github.com/user/repo.git",
    "workspace/repo"
);

// Clone with authentication
await sandbox.git.clone(
    "https://github.com/user/repo.git",
    "workspace/repo",
    undefined,
    undefined,
    "git",
    "personal_access_token"
);

// Clone specific branch
await sandbox.git.clone(
    "https://github.com/user/repo.git",
    "workspace/repo",
    "develop"
);

// Clone a specific commit (detached HEAD)
await sandbox.git.clone(
    "https://github.com/user/repo.git",
    "workspace/repo-old",
    undefined,
    "abc123def456"
);

// Clone from a self-signed internal Git server (insecure)
await sandbox.git.clone(
    "https://internal-git.example.com/org/repo.git",
    "workspace/repo",
    undefined,
    undefined,
    undefined,
    undefined,
    true
);
```


```ruby
# Basic clone
sandbox.git.clone(
  url: 'https://github.com/user/repo.git',
  path: 'workspace/repo'
)

# Clone with authentication
sandbox.git.clone(
  url: 'https://github.com/user/repo.git',
  path: 'workspace/repo',
  username: 'git',
  password: 'personal_access_token'
)

# Clone specific branch
sandbox.git.clone(
  url: 'https://github.com/user/repo.git',
  path: 'workspace/repo',
  branch: 'develop'
)

# Clone a specific commit (detached HEAD)
sandbox.git.clone(
  url: 'https://github.com/user/repo.git',
  path: 'workspace/repo-old',
  commit_id: 'abc123def456'
)

# Clone from a self-signed internal Git server (insecure)
sandbox.git.clone(
  url: 'https://internal-git.example.com/org/repo.git',
  path: 'workspace/repo',
  insecure_skip_tls: true
)
```


```go
// Basic clone
err := sandbox.Git.Clone(ctx, "https://github.com/user/repo.git", "workspace/repo")
if err != nil {
	log.Fatal(err)
}

// Clone with authentication
err = sandbox.Git.Clone(ctx, "https://github.com/user/repo.git", "workspace/repo",
	options.WithUsername("git"),
	options.WithPassword("personal_access_token"),
)
if err != nil {
	log.Fatal(err)
}

// Clone specific branch
err = sandbox.Git.Clone(ctx, "https://github.com/user/repo.git", "workspace/repo",
	options.WithBranch("develop"),
)
if err != nil {
	log.Fatal(err)
}

// Clone a specific commit (detached HEAD)
err = sandbox.Git.Clone(ctx, "https://github.com/user/repo.git", "workspace/repo-old",
	options.WithCommitId("abc123def456"),
)
if err != nil {
	log.Fatal(err)
}

// Clone from a self-signed internal Git server (insecure)
err = sandbox.Git.Clone(ctx, "https://internal-git.example.com/org/repo.git", "workspace/repo",
	options.WithInsecureSkipTLS(true),
)
if err != nil {
	log.Fatal(err)
}
```


```java
// Basic clone
sandbox.git.clone("https://github.com/user/repo.git", "workspace/repo");

// Clone with authentication
sandbox.git.clone(
    "https://github.com/user/repo.git",
    "workspace/repo",
    null,
    null,
    "git",
    "personal_access_token"
);

// Clone specific branch
sandbox.git.clone(
    "https://github.com/user/repo.git",
    "workspace/repo",
    "develop",
    null,
    null,
    null
);

// Clone a specific commit (detached HEAD)
sandbox.git.clone(
    "https://github.com/user/repo.git",
    "workspace/repo-old",
    null,
    "abc123def456",
    null,
    null
);

// Clone from a self-signed internal Git server (insecure)
sandbox.git.clone(
    "https://internal-git.example.com/org/repo.git",
    "workspace/repo",
    null,
    null,
    null,
    null,
    true
);
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/git/clone' \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "branch": "",
  "commit_id": "",
  "depth": 0,
  "insecure_skip_tls": false,
  "password": "",
  "path": "",
  "url": "",
  "username": ""
}'
```


### Get repository status

Get the status of a Git repository by providing the path to the repository. 

You can get the current branch, modified files, and the number of commits ahead and behind the upstream tracking branch. When no upstream is configured, `ahead` and `behind` are zero and `branch_published` is false. The response also includes `upstream` (for example `origin/main`) and `detached` when HEAD is not on a branch.


```python
# Get repository status
status = sandbox.git.status("workspace/repo")
print(f"Current branch: {status.current_branch}")
print(f"Upstream: {status.upstream}")
print(f"Detached HEAD: {status.detached}")
print(f"Commits ahead: {status.ahead}")
print(f"Commits behind: {status.behind}")
for file in status.file_status:
    print(f"File: {file.name}")

# List branches
response = sandbox.git.branches("workspace/repo")
print(f"Checked out branch: {response.current}")
for branch in response.branches:
    print(f"Branch: {branch}")
```


```typescript
// Get repository status
const status = await sandbox.git.status("workspace/repo");
console.log(`Current branch: ${status.currentBranch}`);
console.log(`Upstream: ${status.upstream}`);
console.log(`Detached HEAD: ${status.detached}`);
console.log(`Commits ahead: ${status.ahead}`);
console.log(`Commits behind: ${status.behind}`);
status.fileStatus.forEach(file => {
    console.log(`File: ${file.name}`);
});

// List branches
const response = await sandbox.git.branches("workspace/repo");
console.log(`Checked out branch: ${response.current}`);
response.branches.forEach(branch => {
    console.log(`Branch: ${branch}`);
});
```


```ruby
# Get repository status
status = sandbox.git.status('workspace/repo')
puts "Current branch: #{status.current_branch}"
puts "Upstream: #{status.upstream}"
puts "Detached HEAD: #{status.detached}"
puts "Commits ahead: #{status.ahead}"
puts "Commits behind: #{status.behind}"
status.file_status.each do |file|
  puts "File: #{file.name}"
end

# List branches
response = sandbox.git.branches('workspace/repo')
puts "Checked out branch: #{response.current}"
response.branches.each do |branch|
  puts "Branch: #{branch}"
end
```


```go
// Get repository status
status, err := sandbox.Git.Status(ctx, "workspace/repo")
if err != nil {
	log.Fatal(err)
}
fmt.Printf("Current branch: %s\n", status.CurrentBranch)
fmt.Printf("Commits ahead: %d\n", status.Ahead)
fmt.Printf("Commits behind: %d\n", status.Behind)
for _, file := range status.FileStatus {
	fmt.Printf("File: %s\n", file.Path)
}

// List branches
branches, err := sandbox.Git.Branches(ctx, "workspace/repo")
if err != nil {
	log.Fatal(err)
}
for _, branch := range branches {
	fmt.Printf("Branch: %s\n", branch)
}
```


```java
import io.daytona.sdk.model.GitStatus;
import java.util.List;

// Get repository status
GitStatus status = sandbox.git.status("workspace/repo");
System.out.println("Current branch: " + status.getCurrentBranch());
System.out.println("Commits ahead: " + status.getAhead());
System.out.println("Commits behind: " + status.getBehind());
for (GitStatus.FileStatus file : status.getFileStatus()) {
    System.out.println("File: " + file.getName());
}

// List branches
Object rawBranches = sandbox.git.branches("workspace/repo").get("branches");
if (rawBranches instanceof List<?> branchList) {
    for (Object branch : branchList) {
        System.out.println("Branch: " + branch);
    }
}
```


```bash
# Get repository status
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/git/status?path=workspace/repo'

# List branches
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/git/branches?path=workspace/repo'
```


## Branch operations

Daytona provides methods to manage branches in Git repositories. You can create, switch, and delete branches. Checkout accepts a branch name or a commit SHA.

### Create branches

Create a new branch by providing the path to the repository and the name of the new branch.


```python
# Create a new branch
sandbox.git.create_branch("workspace/repo", "new-feature")
```


```typescript
// Create new branch
await sandbox.git.createBranch('workspace/repo', 'new-feature');
```


```ruby
# Create a new branch
sandbox.git.create_branch('workspace/repo', 'new-feature')
```


```go
// Create a new branch
err := sandbox.Git.CreateBranch(ctx, "workspace/repo", "new-feature")
if err != nil {
	log.Fatal(err)
}
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/git/branches' \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "name": "",
  "path": ""
}'
```


### Checkout branches or commits

Checkout a branch or commit by providing the path to the repository and the name of the branch or commit SHA. Pass a commit SHA to enter detached HEAD state.


```python
# Checkout a branch
sandbox.git.checkout_branch("workspace/repo", "feature-branch")

# Checkout a commit (detached HEAD)
sandbox.git.checkout_branch("workspace/repo", "abc123def456")
```


```typescript
// Checkout a branch
await sandbox.git.checkoutBranch('workspace/repo', 'feature-branch');

// Checkout a commit (detached HEAD)
await sandbox.git.checkoutBranch('workspace/repo', 'abc123def456');
```


```ruby
# Checkout a branch
sandbox.git.checkout_branch('workspace/repo', 'feature-branch')

# Checkout a commit (detached HEAD)
sandbox.git.checkout_branch('workspace/repo', 'abc123def456')
```


```go
// Checkout a branch
err := sandbox.Git.Checkout(ctx, "workspace/repo", "feature-branch")
if err != nil {
	log.Fatal(err)
}

// Checkout a commit (detached HEAD)
err = sandbox.Git.Checkout(ctx, "workspace/repo", "abc123def456")
if err != nil {
	log.Fatal(err)
}
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/git/checkout' \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "branch": "",
  "path": ""
}'
```


### Delete branches

Delete a branch by providing the path to the repository and the name of the branch.


```python
# Delete a branch
sandbox.git.delete_branch("workspace/repo", "old-feature")
```


```typescript
// Delete a branch
await sandbox.git.deleteBranch('workspace/repo', 'old-feature');
```


```ruby
# Delete a branch
sandbox.git.delete_branch('workspace/repo', 'old-feature')
```


```go
// Delete a branch
err := sandbox.Git.DeleteBranch(ctx, "workspace/repo", "old-feature")
if err != nil {
	log.Fatal(err)
}

// Force delete an unmerged branch
err = sandbox.Git.DeleteBranch(ctx, "workspace/repo", "old-feature",
	options.WithForce(true),
)
if err != nil {
	log.Fatal(err)
}
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/git/branches' \
  --request DELETE \
  --header 'Content-Type: application/json' \
  --data '{
  "name": "",
  "path": ""
}'
```


## Stage changes

Stage specific files, all changes, or the whole repository by providing the path to the repository and the files to stage.


```python
# Stage a single file
sandbox.git.add("workspace/repo", ["file.txt"])

# Stage multiple files
sandbox.git.add("workspace/repo", [
    "src/main.py",
    "tests/test_main.py",
    "README.md"
])
```


```typescript
// Stage a single file
await sandbox.git.add('workspace/repo', ['file.txt']);

// Stage multiple files
await sandbox.git.add('workspace/repo', [
  'src/main.ts',
  'tests/main.test.ts',
  'README.md',
]);

// Stage whole repository
await sandbox.git.add('workspace/repo', ['.']);
```


```ruby
# Stage a single file
sandbox.git.add('workspace/repo', ['file.txt'])
```


```go
// Stage a single file
err := sandbox.Git.Add(ctx, "workspace/repo", []string{"file.txt"})
if err != nil {
	log.Fatal(err)
}

// Stage multiple files
err = sandbox.Git.Add(ctx, "workspace/repo", []string{
	"src/main.py",
	"tests/test_main.py",
	"README.md",
})
if err != nil {
	log.Fatal(err)
}

// Stage whole repository
err = sandbox.Git.Add(ctx, "workspace/repo", []string{"."})
if err != nil {
	log.Fatal(err)
}
```


```java
import java.util.List;

// Stage a single file
sandbox.git.add("workspace/repo", List.of("file.txt"));

// Stage multiple files
sandbox.git.add(
    "workspace/repo",
    List.of("src/main.py", "tests/test_main.py", "README.md")
);

// Stage whole repository
sandbox.git.add("workspace/repo", List.of("."));
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/git/add' \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "files": [
    ""
  ],
  "path": ""
}'
```


## Commit changes

Commit changes by providing the path to the repository, the message, author, and email.


```python
# Stage and commit changes
sandbox.git.add("workspace/repo", ["README.md"])
sandbox.git.commit(
    path="workspace/repo",
    message="Update documentation",
    author="John Doe",
    email="john@example.com",
    allow_empty=True
)
```


```typescript
// Stage and commit changes
await sandbox.git.add('workspace/repo', ['README.md']);
await sandbox.git.commit(
  'workspace/repo',
  'Update documentation',
  'John Doe',
  'john@example.com',
  true
);
```


```ruby
# Stage and commit changes
sandbox.git.add('workspace/repo', ['README.md'])
sandbox.git.commit('workspace/repo', 'Update documentation', 'John Doe', 'john@example.com', true)
```


```go
// Stage and commit changes
err := sandbox.Git.Add(ctx, "workspace/repo", []string{"README.md"})
if err != nil {
	log.Fatal(err)
}

response, err := sandbox.Git.Commit(ctx, "workspace/repo",
	"Update documentation",
	"John Doe",
	"john@example.com",
	options.WithAllowEmpty(true),
)
if err != nil {
	log.Fatal(err)
}
fmt.Printf("Commit SHA: %s\n", response.SHA)
```


```java
import io.daytona.sdk.model.GitCommitResponse;
import java.util.List;

// Stage and commit changes
sandbox.git.add("workspace/repo", List.of("README.md"));
GitCommitResponse response = sandbox.git.commit(
    "workspace/repo",
    "Update documentation",
    "John Doe",
    "john@example.com"
);
System.out.println("Commit hash: " + response.getHash());
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/git/commit' \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "allow_empty": true,
  "author": "",
  "email": "",
  "message": "",
  "path": ""
}'
```


## Remote operations

Daytona provides methods to work with remote repositories in Git. You can push and pull changes from remote repositories.

### Push changes

Push changes to a remote repository by providing the path to the repository and the username and password to authenticate.


```python
# Push without authentication (for public repos or SSH)
sandbox.git.push("workspace/repo")

# Push with authentication
sandbox.git.push(
    path="workspace/repo",
    username="user",
    password="github_token"
)
```


```typescript
// Push to a public repository
await sandbox.git.push('workspace/repo');

// Push to a private repository
await sandbox.git.push(
  'workspace/repo',
  'user',
  'token'
);
```


```ruby
# Push without authentication (for public repos or SSH)
sandbox.git.push('workspace/repo')

# Push with authentication
sandbox.git.push(
  path: 'workspace/repo',
  username: 'user',
  password: 'github_token'
)
```


```go
// Push without authentication (for public repos or SSH)
err := sandbox.Git.Push(ctx, "workspace/repo")
if err != nil {
	log.Fatal(err)
}

// Push with authentication
err = sandbox.Git.Push(ctx, "workspace/repo",
	options.WithPushUsername("user"),
	options.WithPushPassword("github_token"),
)
if err != nil {
	log.Fatal(err)
}
```


```java
// Push without authentication (for public repos or SSH)
sandbox.git.push("workspace/repo");
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/git/push' \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "password": "",
  "path": "",
  "username": ""
}'
```

The `branch`, `remote`, and `set_upstream` parameters are available on the toolbox API only.


### Pull changes

Pull changes from a remote repository by providing the path to the repository and the username and password to authenticate.


```python
# Pull without authentication
sandbox.git.pull("workspace/repo")

# Pull with authentication
sandbox.git.pull(
    path="workspace/repo",
    username="user",
    password="github_token"
)
```


```typescript
// Pull from a public repository
await sandbox.git.pull('workspace/repo');

// Pull from a private repository
await sandbox.git.pull(
  'workspace/repo',
  'user',
  'token'
);
```


```ruby
# Pull without authentication
sandbox.git.pull('workspace/repo')

# Pull with authentication
sandbox.git.pull(
  path: 'workspace/repo',
  username: 'user',
  password: 'github_token'
)
```


```go
// Pull without authentication
err := sandbox.Git.Pull(ctx, "workspace/repo")
if err != nil {
	log.Fatal(err)
}

// Pull with authentication
err = sandbox.Git.Pull(ctx, "workspace/repo",
	options.WithPullUsername("user"),
	options.WithPullPassword("github_token"),
)
if err != nil {
	log.Fatal(err)
}
```


```java
// Pull without authentication
sandbox.git.pull("workspace/repo");
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/git/pull' \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "password": "",
  "path": "",
  "username": ""
}'
```

The `branch` and `remote` parameters are available on the toolbox API only.


## Advanced operations

Daytona provides additional Git operations through the [Toolbox API](https://www.daytona.io/docs/en/tools/api.md#daytona-toolbox).

### Initialize a repository

Initialize a new Git repository by providing the path to the repository and the name of the first branch. Set `bare` to create a repository without a working tree.


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/git/init' \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "bare": false,
  "initial_branch": "main",
  "path": "workspace/repo"
}'
```


### Reset changes

Reset the current HEAD to the specified state by providing the path to the repository, the mode and the target revision to reset to. Pass `files` to constrain the reset to specific paths.


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/git/reset' \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "files": [],
  "mode": "mixed",
  "path": "workspace/repo",
  "target": "HEAD~1"
}'
```


### Restore files

Restore working tree files or unstage changes by providing the path to the repository, the files to restore, the source revision, and whether to restore from the staged index or working tree.


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/git/restore' \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "files": ["src/main.py"],
  "path": "workspace/repo",
  "source": "",
  "staged": false,
  "worktree": true
}'
```


### Get commit history

Return the commit log for a repository.


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/git/history?path=workspace/repo'
```


### Manage remotes

Add a remote or get the URL of a remote by providing the path to the repository, the name of the remote, and the URL of the remote. 

1. Set **`fetch`** to **`true`** to fetch from the remote immediately after adding it
2. Set **`overwrite`** to **`true`** to replace an existing remote with the same name


```python
# Add a remote
sandbox.git.remote_add("workspace/repo", "origin", "https://github.com/user/repo.git")

# Add a remote, fetch from it, and replace an existing remote with the same name
sandbox.git.remote_add(
    path="workspace/repo",
    name="upstream",
    url="https://github.com/other/repo.git",
    fetch=True,
    overwrite=True
)

# Get the URL of a remote (None when it does not exist)
url = sandbox.git.remote_get("workspace/repo", "origin")
```


```typescript
// Add a remote
await sandbox.git.remoteAdd('workspace/repo', 'origin', 'https://github.com/user/repo.git');

// Add a remote, fetch from it, and replace an existing remote with the same name
await sandbox.git.remoteAdd(
  'workspace/repo',
  'upstream',
  'https://github.com/other/repo.git',
  true,
  true
);

// Get the URL of a remote (undefined when it does not exist)
const url = await sandbox.git.remoteGet('workspace/repo', 'origin');
```


```ruby
# Add a remote
sandbox.git.remote_add('workspace/repo', 'origin', 'https://github.com/user/repo.git')

# Add a remote, fetch from it, and replace an existing remote with the same name
sandbox.git.remote_add(
  'workspace/repo',
  'upstream',
  'https://github.com/other/repo.git',
  fetch: true,
  overwrite: true
)

# Get the URL of a remote (nil when it does not exist)
url = sandbox.git.remote_get('workspace/repo', 'origin')
```


```go
// Add a remote
err := sandbox.Git.RemoteAdd(ctx, "workspace/repo", "origin", "https://github.com/user/repo.git")
if err != nil {
	log.Fatal(err)
}

// Add a remote, fetch from it, and replace an existing remote with the same name
err = sandbox.Git.RemoteAdd(ctx, "workspace/repo", "upstream", "https://github.com/other/repo.git",
	options.WithRemoteFetch(true),
	options.WithRemoteOverwrite(true),
)
if err != nil {
	log.Fatal(err)
}

// Get the URL of a remote (empty string when it does not exist)
url, err := sandbox.Git.RemoteGet(ctx, "workspace/repo", "origin")
if err != nil {
	log.Fatal(err)
}
fmt.Printf("Remote URL: %s\n", url)
```


```java
// Add a remote
sandbox.git.remoteAdd("workspace/repo", "origin", "https://github.com/user/repo.git");

// Add a remote, fetch from it, and replace an existing remote with the same name
sandbox.git.remoteAdd(
    "workspace/repo",
    "upstream",
    "https://github.com/other/repo.git",
    true,
    true
);

// Get the URL of a remote (null when it does not exist)
String url = sandbox.git.remoteGet("workspace/repo", "origin");
```


```bash
# List remotes
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/git/remotes?path=workspace/repo'

# Add a remote
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/git/remotes' \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "fetch": false,
  "name": "origin",
  "overwrite": false,
  "path": "workspace/repo",
  "url": "https://github.com/user/repo.git"
}'
```


### Configure Git

Read or write Git config values by providing the key and the value. Set **`scope`** to **`local`** together with the repository **`path`** to configure a single repository.

- **Scope**: **`global`** (default), **`local`**, or **`system`**


```python
# Set a config value at the global scope
sandbox.git.set_config("core.editor", "vim")

# Set a config value for a single repository
sandbox.git.set_config(
    key="core.editor",
    value="vim",
    scope="local",
    path="workspace/repo"
)

# Get a config value (None when unset)
editor = sandbox.git.get_config("core.editor")
```


```typescript
// Set a config value at the global scope
await sandbox.git.setConfig('core.editor', 'vim');

// Set a config value for a single repository
await sandbox.git.setConfig('core.editor', 'vim', 'local', 'workspace/repo');

// Get a config value (undefined when unset)
const editor = await sandbox.git.getConfig('core.editor');
```


```ruby
# Set a config value at the global scope
sandbox.git.set_config('core.editor', 'vim')

# Set a config value for a single repository
sandbox.git.set_config('core.editor', 'vim', scope: 'local', path: 'workspace/repo')

# Get a config value (nil when unset)
editor = sandbox.git.get_config('core.editor')
```


```go
// Set a config value at the global scope
err := sandbox.Git.SetConfig(ctx, "core.editor", "vim")
if err != nil {
	log.Fatal(err)
}

// Set a config value for a single repository
err = sandbox.Git.SetConfig(ctx, "core.editor", "vim",
	options.WithConfigScope("local"),
	options.WithConfigPath("workspace/repo"),
)
if err != nil {
	log.Fatal(err)
}

// Get a config value
editor, err := sandbox.Git.GetConfig(ctx, "core.editor")
if err != nil {
	log.Fatal(err)
}
fmt.Printf("Editor: %s\n", editor)
```


```java
// Set a config value at the global scope
sandbox.git.setConfig("core.editor", "vim");

// Set a config value for a single repository
sandbox.git.setConfig("core.editor", "vim", "local", "workspace/repo");

// Get a config value (null when unset)
String editor = sandbox.git.getConfig("core.editor");
```


```bash
# Get a config value
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/git/config?key=user.name&scope=global'

# Set a config value
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/git/config' \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "key": "core.editor",
  "path": "",
  "scope": "global",
  "value": "vim"
}'
```


### Configure user

Configure the Git user name and email by providing the `name` and `email` values. Set `scope` to `local` together with the repository `path` to configure the user for a single repository.

- **Scope**: **`global`** (default), **`local`**


```python
# Configure the global Git user
sandbox.git.configure_user("John Doe", "john@example.com")

# Configure the user for a single repository
sandbox.git.configure_user(
    name="John Doe",
    email="john@example.com",
    scope="local",
    path="workspace/repo"
)
```


```typescript
// Configure the global Git user
await sandbox.git.configureUser('John Doe', 'john@example.com');

// Configure the user for a single repository
await sandbox.git.configureUser(
  'John Doe',
  'john@example.com',
  'local',
  'workspace/repo'
);
```


```ruby
# Configure the global Git user
sandbox.git.configure_user('John Doe', 'john@example.com')

# Configure the user for a single repository
sandbox.git.configure_user(
  'John Doe',
  'john@example.com',
  scope: 'local',
  path: 'workspace/repo'
)
```


```go
// Configure the global Git user
err := sandbox.Git.ConfigureUser(ctx, "John Doe", "john@example.com")
if err != nil {
	log.Fatal(err)
}

// Configure the user for a single repository
err = sandbox.Git.ConfigureUser(ctx, "John Doe", "john@example.com",
	options.WithConfigScope("local"),
	options.WithConfigPath("workspace/repo"),
)
if err != nil {
	log.Fatal(err)
}
```


```java
// Configure the global Git user
sandbox.git.configureUser("John Doe", "john@example.com");

// Configure the user for a single repository
sandbox.git.configureUser(
    "John Doe",
    "john@example.com",
    "local",
    "workspace/repo"
);
```


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/git/config/user' \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "email": "john@example.com",
  "name": "John Doe",
  "path": "",
  "scope": "global"
}'
```


### Authenticate credentials

Persist Git credentials globally via the credential store by providing the host, protocol, username, and password. Credentials are stored in plaintext on disk.


```bash
curl 'https://proxy.app.daytona.io/toolbox/{sandboxId}/git/credentials' \
  --request POST \
  --header 'Content-Type: application/json' \
  --data '{
  "host": "github.com",
  "password": "personal_access_token",
  "protocol": "https",
  "username": "git"
}'
```