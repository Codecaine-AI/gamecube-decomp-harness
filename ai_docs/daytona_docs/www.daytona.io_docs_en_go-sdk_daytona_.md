---
url: "https://www.daytona.io/docs/en/go-sdk/daytona/"
title: "daytona | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/go-sdk/daytona/#_top)

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/go-sdk/daytona.md)Open

# daytona

[Section titled “daytona”](https://www.daytona.io/docs/en/go-sdk/daytona/#daytona)

```
import "github.com/daytona/clients/sdk-go/pkg/daytona"
```

Package daytona provides a Go SDK for interacting with the Daytona platform.

The Daytona SDK enables developers to programmatically create, manage, and interact with sandboxes - isolated development environments that can run code, execute commands, and manage files.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#getting-started) Getting Started

[Section titled “Getting Started”](https://www.daytona.io/docs/en/go-sdk/daytona/#getting-started)

Create a client using your API key or JWT token:

```
client, err := daytona.NewClient()

if err != nil {

    log.Fatal(err)

}
```

The client reads configuration from environment variables:

- DAYTONA\_API\_KEY: API key for authentication
- DAYTONA\_JWT\_TOKEN: JWT token for authentication (alternative to API key)
- DAYTONA\_ORGANIZATION\_ID: Organization ID (required when using JWT token)
- DAYTONA\_API\_URL: API URL (defaults to [https://app.daytona.io/api\](https://app.daytona.io/api%5C))
- DAYTONA\_TARGET: Target environment

Or provide configuration explicitly:

```
client, err := daytona.NewClientWithConfig(&types.DaytonaConfig{

    APIKey: "your-api-key",

    APIUrl: "https://your-instance.daytona.io/api",

})
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#creating-sandboxes) Creating Sandboxes

[Section titled “Creating Sandboxes”](https://www.daytona.io/docs/en/go-sdk/daytona/#creating-sandboxes)

Create a sandbox from a snapshot:

```
sandbox, err := client.Create(ctx, types.SnapshotParams{

    Snapshot: "my-snapshot",

})
```

Create a sandbox from a Docker image:

```
sandbox, err := client.Create(ctx, types.ImageParams{

    Image: "python:3.11",

})
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#working-with-sandboxes) Working with Sandboxes

[Section titled “Working with Sandboxes”](https://www.daytona.io/docs/en/go-sdk/daytona/#working-with-sandboxes)

Execute code in a sandbox:

```
result, err := sandbox.Process.CodeRun(ctx, "print('Hello, World!')")
```

Run shell commands:

```
result, err := sandbox.Process.ExecuteCommand(ctx, "ls -la")
```

## [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#index) Index

[Section titled “Index”](https://www.daytona.io/docs/en/go-sdk/daytona/#index)

- [Constants](https://www.daytona.io/docs/en/go-sdk/daytona/#constants)
- [Variables](https://www.daytona.io/docs/en/go-sdk/daytona/#variables)
- [type AccessibilityFindOptions](https://www.daytona.io/docs/en/go-sdk/daytona/#AccessibilityFindOptions)
- [type AccessibilityService](https://www.daytona.io/docs/en/go-sdk/daytona/#AccessibilityService)
  - [func NewAccessibilityService(toolboxClient \*toolbox.APIClient, otel \*otelState) \*AccessibilityService](https://www.daytona.io/docs/en/go-sdk/daytona/#NewAccessibilityService)
  - [func (a \*AccessibilityService) FindNodes(ctx context.Context, opts \*AccessibilityFindOptions) (\*toolbox.AccessibilityNodesResponse, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#AccessibilityService.FindNodes)
  - [func (a \*AccessibilityService) FocusNode(ctx context.Context, id string) error](https://www.daytona.io/docs/en/go-sdk/daytona/#AccessibilityService.FocusNode)
  - [func (a \*AccessibilityService) GetTree(ctx context.Context, opts \*AccessibilityTreeOptions) (\*toolbox.AccessibilityTreeResponse, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#AccessibilityService.GetTree)
  - [func (a \*AccessibilityService) InvokeNode(ctx context.Context, id string, action \*string) error](https://www.daytona.io/docs/en/go-sdk/daytona/#AccessibilityService.InvokeNode)
  - [func (a \*AccessibilityService) SetNodeValue(ctx context.Context, id string, value string) error](https://www.daytona.io/docs/en/go-sdk/daytona/#AccessibilityService.SetNodeValue)
- [type AccessibilityTreeOptions](https://www.daytona.io/docs/en/go-sdk/daytona/#AccessibilityTreeOptions)
- [type Client](https://www.daytona.io/docs/en/go-sdk/daytona/#Client)
  - [func NewClient() (\*Client, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#NewClient)
  - [func NewClientWithConfig(config \*types.DaytonaConfig) (\*Client, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#NewClientWithConfig)
  - [func (c \*Client) Close(ctx context.Context) error](https://www.daytona.io/docs/en/go-sdk/daytona/#Client.Close)
  - [func (c \*Client) Create(ctx context.Context, params any, opts …func(\*options.CreateSandbox)) (\*Sandbox, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#Client.Create)
  - [func (c \*Client) Get(ctx context.Context, sandboxIDOrName string) (\*Sandbox, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#Client.Get)
  - [func (c \*Client) List(ctx context.Context, query \*ListSandboxesQuery) \*SandboxIterator](https://www.daytona.io/docs/en/go-sdk/daytona/#Client.List)
  - [func (c \*Client) ListSeq(ctx context.Context, query \*ListSandboxesQuery) iter.Seq2\[\*Sandbox, error\]](https://www.daytona.io/docs/en/go-sdk/daytona/#Client.ListSeq)
- [type CodeInterpreterService](https://www.daytona.io/docs/en/go-sdk/daytona/#CodeInterpreterService)
  - [func NewCodeInterpreterService(toolboxClient \*toolbox.APIClient, otel \*otelState) \*CodeInterpreterService](https://www.daytona.io/docs/en/go-sdk/daytona/#NewCodeInterpreterService)
  - [func (c \*CodeInterpreterService) CreateContext(ctx context.Context, cwd \*string) (map\[string\]any, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#CodeInterpreterService.CreateContext)
  - [func (c \*CodeInterpreterService) DeleteContext(ctx context.Context, contextID string) error](https://www.daytona.io/docs/en/go-sdk/daytona/#CodeInterpreterService.DeleteContext)
  - [func (c \*CodeInterpreterService) ListContexts(ctx context.Context) (\[\]map\[string\]any, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#CodeInterpreterService.ListContexts)
  - [func (c \*CodeInterpreterService) RunCode(ctx context.Context, code string, opts …func(\*options.RunCode)) (\*OutputChannels, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#CodeInterpreterService.RunCode)
- [type ComputerUseService](https://www.daytona.io/docs/en/go-sdk/daytona/#ComputerUseService)
  - [func NewComputerUseService(toolboxClient \*toolbox.APIClient, otel \*otelState) \*ComputerUseService](https://www.daytona.io/docs/en/go-sdk/daytona/#NewComputerUseService)
  - [func (c \*ComputerUseService) Accessibility() \*AccessibilityService](https://www.daytona.io/docs/en/go-sdk/daytona/#ComputerUseService.Accessibility)
  - [func (c \*ComputerUseService) Display() \*DisplayService](https://www.daytona.io/docs/en/go-sdk/daytona/#ComputerUseService.Display)
  - [func (c \*ComputerUseService) GetStatus(ctx context.Context) (map\[string\]any, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#ComputerUseService.GetStatus)
  - [func (c \*ComputerUseService) Keyboard() \*KeyboardService](https://www.daytona.io/docs/en/go-sdk/daytona/#ComputerUseService.Keyboard)
  - [func (c \*ComputerUseService) Mouse() \*MouseService](https://www.daytona.io/docs/en/go-sdk/daytona/#ComputerUseService.Mouse)
  - [func (c \*ComputerUseService) Recording() \*RecordingService](https://www.daytona.io/docs/en/go-sdk/daytona/#ComputerUseService.Recording)
  - [func (c \*ComputerUseService) Screenshot() \*ScreenshotService](https://www.daytona.io/docs/en/go-sdk/daytona/#ComputerUseService.Screenshot)
  - [func (c \*ComputerUseService) Start(ctx context.Context) error](https://www.daytona.io/docs/en/go-sdk/daytona/#ComputerUseService.Start)
  - [func (c \*ComputerUseService) Stop(ctx context.Context) error](https://www.daytona.io/docs/en/go-sdk/daytona/#ComputerUseService.Stop)
- [type DisplayService](https://www.daytona.io/docs/en/go-sdk/daytona/#DisplayService)
  - [func NewDisplayService(toolboxClient \*toolbox.APIClient, otel \*otelState) \*DisplayService](https://www.daytona.io/docs/en/go-sdk/daytona/#NewDisplayService)
  - [func (d \*DisplayService) GetInfo(ctx context.Context) (map\[string\]any, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#DisplayService.GetInfo)
  - [func (d \*DisplayService) GetWindows(ctx context.Context) (map\[string\]any, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#DisplayService.GetWindows)
- [type DockerImage](https://www.daytona.io/docs/en/go-sdk/daytona/#DockerImage)
  - [func Base(baseImage string) \*DockerImage](https://www.daytona.io/docs/en/go-sdk/daytona/#Base)
  - [func DebianSlim(pythonVersion \*string) \*DockerImage](https://www.daytona.io/docs/en/go-sdk/daytona/#DebianSlim)
  - [func FromDockerfile(dockerfile string) \*DockerImage](https://www.daytona.io/docs/en/go-sdk/daytona/#FromDockerfile)
  - [func (img \*DockerImage) Add(source, destination string) \*DockerImage](https://www.daytona.io/docs/en/go-sdk/daytona/#DockerImage.Add)
  - [func (img \*DockerImage) AddLocalDir(localPath, remotePath string) \*DockerImage](https://www.daytona.io/docs/en/go-sdk/daytona/#DockerImage.AddLocalDir)
  - [func (img \*DockerImage) AddLocalFile(localPath, remotePath string) \*DockerImage](https://www.daytona.io/docs/en/go-sdk/daytona/#DockerImage.AddLocalFile)
  - [func (img \*DockerImage) AptGet(packages \[\]string) \*DockerImage](https://www.daytona.io/docs/en/go-sdk/daytona/#DockerImage.AptGet)
  - [func (img \*DockerImage) Cmd(cmd \[\]string) \*DockerImage](https://www.daytona.io/docs/en/go-sdk/daytona/#DockerImage.Cmd)
  - [func (img \*DockerImage) Contexts() \[\]DockerImageContext](https://www.daytona.io/docs/en/go-sdk/daytona/#DockerImage.Contexts)
  - [func (img \*DockerImage) Copy(source, destination string) \*DockerImage](https://www.daytona.io/docs/en/go-sdk/daytona/#DockerImage.Copy)
  - [func (img \*DockerImage) Dockerfile() string](https://www.daytona.io/docs/en/go-sdk/daytona/#DockerImage.Dockerfile)
  - [func (img \*DockerImage) Entrypoint(cmd \[\]string) \*DockerImage](https://www.daytona.io/docs/en/go-sdk/daytona/#DockerImage.Entrypoint)
  - [func (img \*DockerImage) Env(key, value string) \*DockerImage](https://www.daytona.io/docs/en/go-sdk/daytona/#DockerImage.Env)
  - [func (img \*DockerImage) Expose(ports \[\]int) \*DockerImage](https://www.daytona.io/docs/en/go-sdk/daytona/#DockerImage.Expose)
  - [func (img \*DockerImage) Label(key, value string) \*DockerImage](https://www.daytona.io/docs/en/go-sdk/daytona/#DockerImage.Label)
  - [func (img \*DockerImage) PipInstall(packages \[\]string, opts …func(\*options.PipInstall)) \*DockerImage](https://www.daytona.io/docs/en/go-sdk/daytona/#DockerImage.PipInstall)
  - [func (img \*DockerImage) Run(command string) \*DockerImage](https://www.daytona.io/docs/en/go-sdk/daytona/#DockerImage.Run)
  - [func (img \*DockerImage) User(username string) \*DockerImage](https://www.daytona.io/docs/en/go-sdk/daytona/#DockerImage.User)
  - [func (img \*DockerImage) Volume(paths \[\]string) \*DockerImage](https://www.daytona.io/docs/en/go-sdk/daytona/#DockerImage.Volume)
  - [func (img \*DockerImage) Workdir(path string) \*DockerImage](https://www.daytona.io/docs/en/go-sdk/daytona/#DockerImage.Workdir)
- [type DockerImageContext](https://www.daytona.io/docs/en/go-sdk/daytona/#DockerImageContext)
- [type DownloadProgress](https://www.daytona.io/docs/en/go-sdk/daytona/#DownloadProgress)
- [type DownloadStreamOption](https://www.daytona.io/docs/en/go-sdk/daytona/#DownloadStreamOption)
  - [func WithDownloadProgress(fn func(DownloadProgress)) DownloadStreamOption](https://www.daytona.io/docs/en/go-sdk/daytona/#WithDownloadProgress)
- [type FileSystemService](https://www.daytona.io/docs/en/go-sdk/daytona/#FileSystemService)
  - [func NewFileSystemService(toolboxClient \*toolbox.APIClient, otel \*otelState) \*FileSystemService](https://www.daytona.io/docs/en/go-sdk/daytona/#NewFileSystemService)
  - [func (f \*FileSystemService) CreateFolder(ctx context.Context, path string, opts …func(\*options.CreateFolder)) error](https://www.daytona.io/docs/en/go-sdk/daytona/#FileSystemService.CreateFolder)
  - [func (f \*FileSystemService) DeleteFile(ctx context.Context, path string, recursive bool) error](https://www.daytona.io/docs/en/go-sdk/daytona/#FileSystemService.DeleteFile)
  - [func (f \*FileSystemService) DownloadFile(ctx context.Context, remotePath string, localPath \*string) (\[\]byte, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#FileSystemService.DownloadFile)
  - [func (f \*FileSystemService) DownloadFileStream(ctx context.Context, remotePath string, opts …DownloadStreamOption) (io.ReadCloser, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#FileSystemService.DownloadFileStream)
  - [func (f \*FileSystemService) FindFiles(ctx context.Context, path, pattern string) (any, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#FileSystemService.FindFiles)
  - [func (f \*FileSystemService) GetFileInfo(ctx context.Context, path string) (\*types.FileInfo, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#FileSystemService.GetFileInfo)
  - [func (f \*FileSystemService) ListFiles(ctx context.Context, path string, opts …func(\*options.ListFiles)) (\[\]\*types.FileInfo, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#FileSystemService.ListFiles)
  - [func (f \*FileSystemService) MoveFiles(ctx context.Context, source, destination string) error](https://www.daytona.io/docs/en/go-sdk/daytona/#FileSystemService.MoveFiles)
  - [func (f \*FileSystemService) ReplaceInFiles(ctx context.Context, files \[\]string, pattern, newValue string) (any, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#FileSystemService.ReplaceInFiles)
  - [func (f \*FileSystemService) SearchFiles(ctx context.Context, path, pattern string) (any, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#FileSystemService.SearchFiles)
  - [func (f \*FileSystemService) SetFilePermissions(ctx context.Context, path string, opts …func(\*options.SetFilePermissions)) error](https://www.daytona.io/docs/en/go-sdk/daytona/#FileSystemService.SetFilePermissions)
  - [func (f \*FileSystemService) UploadFile(ctx context.Context, source any, destination string) error](https://www.daytona.io/docs/en/go-sdk/daytona/#FileSystemService.UploadFile)
  - [func (f \*FileSystemService) UploadFileStream(ctx context.Context, source io.Reader, remotePath string, opts …UploadStreamOption) error](https://www.daytona.io/docs/en/go-sdk/daytona/#FileSystemService.UploadFileStream)
- [type GitService](https://www.daytona.io/docs/en/go-sdk/daytona/#GitService)
  - [func NewGitService(toolboxClient \*toolbox.APIClient, otel \*otelState) \*GitService](https://www.daytona.io/docs/en/go-sdk/daytona/#NewGitService)
  - [func (g \*GitService) Add(ctx context.Context, path string, files \[\]string) error](https://www.daytona.io/docs/en/go-sdk/daytona/#GitService.Add)
  - [func (g \*GitService) Branches(ctx context.Context, path string) (\[\]string, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#GitService.Branches)
  - [func (g \*GitService) Checkout(ctx context.Context, path, name string) error](https://www.daytona.io/docs/en/go-sdk/daytona/#GitService.Checkout)
  - [func (g \*GitService) Clone(ctx context.Context, url, path string, opts …func(\*options.GitClone)) error](https://www.daytona.io/docs/en/go-sdk/daytona/#GitService.Clone)
  - [func (g \*GitService) Commit(ctx context.Context, path, message, author, email string, opts …func(\*options.GitCommit)) (\*types.GitCommitResponse, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#GitService.Commit)
  - [func (g \*GitService) ConfigureUser(ctx context.Context, name, email string, opts …func(\*options.GitConfig)) error](https://www.daytona.io/docs/en/go-sdk/daytona/#GitService.ConfigureUser)
  - [func (g \*GitService) CreateBranch(ctx context.Context, path, name string) error](https://www.daytona.io/docs/en/go-sdk/daytona/#GitService.CreateBranch)
  - [func (g \*GitService) DangerouslyAuthenticate(ctx context.Context, username, password string, opts …func(\*options.GitAuthenticate)) error](https://www.daytona.io/docs/en/go-sdk/daytona/#GitService.DangerouslyAuthenticate)
  - [func (g \*GitService) DeleteBranch(ctx context.Context, path, name string, opts …func(\*options.GitDeleteBranch)) error](https://www.daytona.io/docs/en/go-sdk/daytona/#GitService.DeleteBranch)
  - [func (g \*GitService) GetConfig(ctx context.Context, key string, opts …func(\*options.GitConfig)) (string, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#GitService.GetConfig)
  - [func (g \*GitService) Init(ctx context.Context, path string, opts …func(\*options.GitInit)) error](https://www.daytona.io/docs/en/go-sdk/daytona/#GitService.Init)
  - [func (g \*GitService) Pull(ctx context.Context, path string, opts …func(\*options.GitPull)) error](https://www.daytona.io/docs/en/go-sdk/daytona/#GitService.Pull)
  - [func (g \*GitService) Push(ctx context.Context, path string, opts …func(\*options.GitPush)) error](https://www.daytona.io/docs/en/go-sdk/daytona/#GitService.Push)
  - [func (g \*GitService) RemoteAdd(ctx context.Context, path, name, url string, opts …func(\*options.GitRemoteAdd)) error](https://www.daytona.io/docs/en/go-sdk/daytona/#GitService.RemoteAdd)
  - [func (g \*GitService) RemoteGet(ctx context.Context, path, name string) (string, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#GitService.RemoteGet)
  - [func (g \*GitService) Remotes(ctx context.Context, path string) (\[\]types.GitRemote, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#GitService.Remotes)
  - [func (g \*GitService) Reset(ctx context.Context, path string, opts …func(\*options.GitReset)) error](https://www.daytona.io/docs/en/go-sdk/daytona/#GitService.Reset)
  - [func (g \*GitService) Restore(ctx context.Context, path string, files \[\]string, opts …func(\*options.GitRestore)) error](https://www.daytona.io/docs/en/go-sdk/daytona/#GitService.Restore)
  - [func (g \*GitService) SetConfig(ctx context.Context, key, value string, opts …func(\*options.GitConfig)) error](https://www.daytona.io/docs/en/go-sdk/daytona/#GitService.SetConfig)
  - [func (g \*GitService) Status(ctx context.Context, path string) (\*types.GitStatus, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#GitService.Status)
- [type KeyboardService](https://www.daytona.io/docs/en/go-sdk/daytona/#KeyboardService)
  - [func NewKeyboardService(toolboxClient \*toolbox.APIClient, otel \*otelState) \*KeyboardService](https://www.daytona.io/docs/en/go-sdk/daytona/#NewKeyboardService)
  - [func (k \*KeyboardService) Hotkey(ctx context.Context, keys string) error](https://www.daytona.io/docs/en/go-sdk/daytona/#KeyboardService.Hotkey)
  - [func (k \*KeyboardService) Press(ctx context.Context, key string, modifiers \[\]string) error](https://www.daytona.io/docs/en/go-sdk/daytona/#KeyboardService.Press)
  - [func (k \*KeyboardService) Type(ctx context.Context, text string, delay \*int) error](https://www.daytona.io/docs/en/go-sdk/daytona/#KeyboardService.Type)
- [type ListSandboxesQuery](https://www.daytona.io/docs/en/go-sdk/daytona/#ListSandboxesQuery)
- [type LspServerService](https://www.daytona.io/docs/en/go-sdk/daytona/#LspServerService)
  - [func NewLspServerService(toolboxClient \*toolbox.APIClient, languageID types.LspLanguageID, projectPath string, otel \*otelState) \*LspServerService](https://www.daytona.io/docs/en/go-sdk/daytona/#NewLspServerService)
  - [func (l \*LspServerService) Completions(ctx context.Context, path string, position types.Position) (any, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#LspServerService.Completions)
  - [func (l \*LspServerService) DidClose(ctx context.Context, path string) error](https://www.daytona.io/docs/en/go-sdk/daytona/#LspServerService.DidClose)
  - [func (l \*LspServerService) DidOpen(ctx context.Context, path string) error](https://www.daytona.io/docs/en/go-sdk/daytona/#LspServerService.DidOpen)
  - [func (l \*LspServerService) DocumentSymbols(ctx context.Context, path string) (\[\]any, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#LspServerService.DocumentSymbols)
  - [func (l \*LspServerService) SandboxSymbols(ctx context.Context, query string) (\[\]any, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#LspServerService.SandboxSymbols)
  - [func (l \*LspServerService) Start(ctx context.Context) error](https://www.daytona.io/docs/en/go-sdk/daytona/#LspServerService.Start)
  - [func (l \*LspServerService) Stop(ctx context.Context) error](https://www.daytona.io/docs/en/go-sdk/daytona/#LspServerService.Stop)
- [type MouseService](https://www.daytona.io/docs/en/go-sdk/daytona/#MouseService)
  - [func NewMouseService(toolboxClient \*toolbox.APIClient, otel \*otelState) \*MouseService](https://www.daytona.io/docs/en/go-sdk/daytona/#NewMouseService)
  - [func (m \*MouseService) Click(ctx context.Context, x, y int, button \*string, double \*bool) (map\[string\]any, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#MouseService.Click)
  - [func (m \*MouseService) Drag(ctx context.Context, startX, startY, endX, endY int, button \*string) (map\[string\]any, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#MouseService.Drag)
  - [func (m \*MouseService) GetPosition(ctx context.Context) (map\[string\]any, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#MouseService.GetPosition)
  - [func (m \*MouseService) Move(ctx context.Context, x, y int) (map\[string\]any, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#MouseService.Move)
  - [func (m \*MouseService) Scroll(ctx context.Context, x, y int, direction string, amount \*int) (bool, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#MouseService.Scroll)
- [type OutputChannels](https://www.daytona.io/docs/en/go-sdk/daytona/#OutputChannels)
- [type ProcessService](https://www.daytona.io/docs/en/go-sdk/daytona/#ProcessService)
  - [func NewProcessService(toolboxClient \*toolbox.APIClient, otel \*otelState, language types.CodeLanguage) \*ProcessService](https://www.daytona.io/docs/en/go-sdk/daytona/#NewProcessService)
  - [func (p \*ProcessService) CodeRun(ctx context.Context, code string, opts …func(\*options.CodeRun)) (\*types.ExecuteResponse, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#ProcessService.CodeRun)
  - [func (p \*ProcessService) ConnectPty(ctx context.Context, sessionID string) (\*PtyHandle, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#ProcessService.ConnectPty)
  - [func (p \*ProcessService) CreatePty(ctx context.Context, id string, opts …func(\*options.CreatePty)) (\*PtyHandle, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#ProcessService.CreatePty)
  - [func (p \*ProcessService) CreatePtySession(ctx context.Context, id string, opts …func(\*options.PtySession)) (\*types.PtySessionInfo, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#ProcessService.CreatePtySession)
  - [func (p \*ProcessService) CreateSession(ctx context.Context, sessionID string) error](https://www.daytona.io/docs/en/go-sdk/daytona/#ProcessService.CreateSession)
  - [func (p \*ProcessService) DeleteSession(ctx context.Context, sessionID string) error](https://www.daytona.io/docs/en/go-sdk/daytona/#ProcessService.DeleteSession)
  - [func (p \*ProcessService) ExecuteCommand(ctx context.Context, command string, opts …func(\*options.ExecuteCommand)) (\*types.ExecuteResponse, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#ProcessService.ExecuteCommand)
  - [func (p \*ProcessService) ExecuteSessionCommand(ctx context.Context, sessionID, command string, runAsync bool, suppressInputEcho bool) (map\[string\]any, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#ProcessService.ExecuteSessionCommand)
  - [func (p \*ProcessService) GetEntrypointLogs(ctx context.Context) (\*toolbox.SessionCommandLogsResponse, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#ProcessService.GetEntrypointLogs)
  - [func (p \*ProcessService) GetEntrypointLogsStream(ctx context.Context, stdout, stderr chan<- string) error](https://www.daytona.io/docs/en/go-sdk/daytona/#ProcessService.GetEntrypointLogsStream)
  - [func (p \*ProcessService) GetEntrypointSession(ctx context.Context) (\*toolbox.Session, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#ProcessService.GetEntrypointSession)
  - [func (p \*ProcessService) GetPtySessionInfo(ctx context.Context, sessionID string) (\*types.PtySessionInfo, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#ProcessService.GetPtySessionInfo)
  - [func (p \*ProcessService) GetSession(ctx context.Context, sessionID string) (map\[string\]any, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#ProcessService.GetSession)
  - [func (p \*ProcessService) GetSessionCommand(ctx context.Context, sessionID, commandID string) (map\[string\]any, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#ProcessService.GetSessionCommand)
  - [func (p \*ProcessService) GetSessionCommandLogs(ctx context.Context, sessionID, commandID string) (\*toolbox.SessionCommandLogsResponse, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#ProcessService.GetSessionCommandLogs)
  - [func (p \*ProcessService) GetSessionCommandLogsStream(ctx context.Context, sessionID, commandID string, stdout, stderr chan<- string) error](https://www.daytona.io/docs/en/go-sdk/daytona/#ProcessService.GetSessionCommandLogsStream)
  - [func (p \*ProcessService) KillPtySession(ctx context.Context, sessionID string) error](https://www.daytona.io/docs/en/go-sdk/daytona/#ProcessService.KillPtySession)
  - [func (p \*ProcessService) ListPtySessions(ctx context.Context) (\[\]\*types.PtySessionInfo, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#ProcessService.ListPtySessions)
  - [func (p \*ProcessService) ListSessions(ctx context.Context) (\[\]map\[string\]any, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#ProcessService.ListSessions)
  - [func (p \*ProcessService) ResizePtySession(ctx context.Context, sessionID string, ptySize types.PtySize) (\*types.PtySessionInfo, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#ProcessService.ResizePtySession)
- [type PtyHandle](https://www.daytona.io/docs/en/go-sdk/daytona/#PtyHandle)
  - [func (h \*PtyHandle) DataChan() <-chan \[\]byte](https://www.daytona.io/docs/en/go-sdk/daytona/#PtyHandle.DataChan)
  - [func (h \*PtyHandle) Disconnect() error](https://www.daytona.io/docs/en/go-sdk/daytona/#PtyHandle.Disconnect)
  - [func (h \*PtyHandle) Error() \*string](https://www.daytona.io/docs/en/go-sdk/daytona/#PtyHandle.Error)
  - [func (h \*PtyHandle) ExitCode() \*int](https://www.daytona.io/docs/en/go-sdk/daytona/#PtyHandle.ExitCode)
  - [func (h \*PtyHandle) IsConnected() bool](https://www.daytona.io/docs/en/go-sdk/daytona/#PtyHandle.IsConnected)
  - [func (h \*PtyHandle) Kill(ctx context.Context) error](https://www.daytona.io/docs/en/go-sdk/daytona/#PtyHandle.Kill)
  - [func (h \*PtyHandle) Read(p \[\]byte) (n int, err error)](https://www.daytona.io/docs/en/go-sdk/daytona/#PtyHandle.Read)
  - [func (h \*PtyHandle) Resize(ctx context.Context, cols, rows int) (\*types.PtySessionInfo, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#PtyHandle.Resize)
  - [func (h \*PtyHandle) SendInput(data \[\]byte) error](https://www.daytona.io/docs/en/go-sdk/daytona/#PtyHandle.SendInput)
  - [func (h \*PtyHandle) SessionID() string](https://www.daytona.io/docs/en/go-sdk/daytona/#PtyHandle.SessionID)
  - [func (h \*PtyHandle) Wait(ctx context.Context) (\*types.PtyResult, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#PtyHandle.Wait)
  - [func (h \*PtyHandle) WaitForConnection(ctx context.Context) error](https://www.daytona.io/docs/en/go-sdk/daytona/#PtyHandle.WaitForConnection)
  - [func (h \*PtyHandle) Write(p \[\]byte) (n int, err error)](https://www.daytona.io/docs/en/go-sdk/daytona/#PtyHandle.Write)
- [type PushAccessCredentials](https://www.daytona.io/docs/en/go-sdk/daytona/#PushAccessCredentials)
- [type RecordingService](https://www.daytona.io/docs/en/go-sdk/daytona/#RecordingService)
  - [func NewRecordingService(toolboxClient \*toolbox.APIClient) \*RecordingService](https://www.daytona.io/docs/en/go-sdk/daytona/#NewRecordingService)
  - [func (r \*RecordingService) Delete(ctx context.Context, id string) error](https://www.daytona.io/docs/en/go-sdk/daytona/#RecordingService.Delete)
  - [func (r \*RecordingService) Download(ctx context.Context, id string, localPath string) error](https://www.daytona.io/docs/en/go-sdk/daytona/#RecordingService.Download)
  - [func (r \*RecordingService) Get(ctx context.Context, id string) (\*toolbox.Recording, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#RecordingService.Get)
  - [func (r \*RecordingService) List(ctx context.Context) (\*toolbox.ListRecordingsResponse, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#RecordingService.List)
  - [func (r \*RecordingService) Start(ctx context.Context, label \*string) (\*toolbox.Recording, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#RecordingService.Start)
  - [func (r \*RecordingService) Stop(ctx context.Context, id string) (\*toolbox.Recording, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#RecordingService.Stop)
- [type Sandbox](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox)
  - [func NewSandbox(client \*Client, toolboxClient \*toolbox.APIClient, dto sandboxDTO, language types.CodeLanguage, subscriptionManager \*common.EventSubscriptionManager) \*Sandbox](https://www.daytona.io/docs/en/go-sdk/daytona/#NewSandbox)
  - [func (s \*Sandbox) Archive(ctx context.Context) error](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox.Archive)
  - [func (s \*Sandbox) CreateLspServer(languageID types.LspLanguageID, pathToProject string) \*LspServerService](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox.CreateLspServer)
  - [func (s \*Sandbox) CreateSnapshot(ctx context.Context, name string) error](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox.CreateSnapshot)
  - [func (s \*Sandbox) CreateSnapshotWithTimeout(ctx context.Context, name string, timeout time.Duration) error](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox.CreateSnapshotWithTimeout)
  - [func (s \*Sandbox) Delete(ctx context.Context) error](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox.Delete)
  - [func (s \*Sandbox) DeleteAndWait(ctx context.Context, timeout time.Duration) error](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox.DeleteAndWait)
  - [func (s \*Sandbox) DeleteWithTimeout(ctx context.Context, timeout time.Duration) error](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox.DeleteWithTimeout)
  - [func (s \*Sandbox) DownloadURL(ctx context.Context, path string, ttlSeconds \*int) (string, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox.DownloadURL)
  - [func (s \*Sandbox) ExperimentalCreateSnapshot(ctx context.Context, name string) error](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox.ExperimentalCreateSnapshot)
  - [func (s \*Sandbox) ExperimentalCreateSnapshotWithTimeout(ctx context.Context, name string, timeout time.Duration) error](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox.ExperimentalCreateSnapshotWithTimeout)
  - [func (s \*Sandbox) ExperimentalFork(ctx context.Context, name \*string) (\*Sandbox, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox.ExperimentalFork)
  - [func (s \*Sandbox) ExperimentalForkWithTimeout(ctx context.Context, name \*string, timeout time.Duration) (\*Sandbox, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox.ExperimentalForkWithTimeout)
  - [func (s \*Sandbox) ExpireSignedPreviewLink(ctx context.Context, port int, token string) error](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox.ExpireSignedPreviewLink)
  - [func (s \*Sandbox) Fork(ctx context.Context, name \*string) (\*Sandbox, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox.Fork)
  - [func (s \*Sandbox) ForkWithTimeout(ctx context.Context, name \*string, timeout time.Duration) (\*Sandbox, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox.ForkWithTimeout)
  - [func (s \*Sandbox) GetMetrics(ctx context.Context, start, end \*time.Time) (\[\]SandboxMetrics, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox.GetMetrics)
  - [func (s \*Sandbox) GetMetricsLatest(ctx context.Context) (SandboxMetrics, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox.GetMetricsLatest)
  - [func (s \*Sandbox) GetPreviewLink(ctx context.Context, port int) (\*types.PreviewLink, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox.GetPreviewLink)
  - [func (s \*Sandbox) GetSignedPreviewLink(ctx context.Context, port int, expiresInSeconds int) (\*types.SignedPreviewLink, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox.GetSignedPreviewLink)
  - [func (s \*Sandbox) GetUserHomeDir(ctx context.Context) (string, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox.GetUserHomeDir)
  - [func (s \*Sandbox) GetWorkingDir(ctx context.Context) (string, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox.GetWorkingDir)
  - [func (s \*Sandbox) Pause(ctx context.Context) error](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox.Pause)
  - [func (s \*Sandbox) PauseWithTimeout(ctx context.Context, timeout time.Duration) error](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox.PauseWithTimeout)
  - [func (s \*Sandbox) RefreshData(ctx context.Context) error](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox.RefreshData)
  - [func (s \*Sandbox) Resize(ctx context.Context, resources \*types.Resources) error](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox.Resize)
  - [func (s \*Sandbox) ResizeWithTimeout(ctx context.Context, resources \*types.Resources, timeout time.Duration) error](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox.ResizeWithTimeout)
  - [func (s \*Sandbox) RotateSigningKey(ctx context.Context) error](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox.RotateSigningKey)
  - [func (s \*Sandbox) SetAutoArchiveInterval(ctx context.Context, intervalMinutes \*int) error](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox.SetAutoArchiveInterval)
  - [func (s \*Sandbox) SetAutoDeleteInterval(ctx context.Context, intervalMinutes \*int) error](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox.SetAutoDeleteInterval)
  - [func (s \*Sandbox) SetLabels(ctx context.Context, labels map\[string\]string) error](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox.SetLabels)
  - [func (s \*Sandbox) Start(ctx context.Context) error](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox.Start)
  - [func (s \*Sandbox) StartWithTimeout(ctx context.Context, timeout time.Duration) error](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox.StartWithTimeout)
  - [func (s \*Sandbox) Stop(ctx context.Context) error](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox.Stop)
  - [func (s \*Sandbox) StopWithTimeout(ctx context.Context, timeout time.Duration, force bool) error](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox.StopWithTimeout)
  - [func (s \*Sandbox) UpdateEnv(ctx context.Context, env map\[string\]string, unset \[\]string) error](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox.UpdateEnv)
  - [func (s \*Sandbox) UpdateNetworkSettings(ctx context.Context, settings apiclient.UpdateSandboxNetworkSettings) error](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox.UpdateNetworkSettings)
  - [func (s \*Sandbox) UpdateSecrets(ctx context.Context, secrets map\[string\]string) error](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox.UpdateSecrets)
  - [func (s \*Sandbox) UploadURL(ctx context.Context, path string, ttlSeconds \*int) (string, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox.UploadURL)
  - [func (s \*Sandbox) WaitForResize(ctx context.Context, timeout time.Duration) error](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox.WaitForResize)
  - [func (s \*Sandbox) WaitForStart(ctx context.Context, timeout time.Duration) error](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox.WaitForStart)
  - [func (s \*Sandbox) WaitForStop(ctx context.Context, timeout time.Duration) error](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox.WaitForStop)
- [type SandboxIterator](https://www.daytona.io/docs/en/go-sdk/daytona/#SandboxIterator)
  - [func (it \*SandboxIterator) Err() error](https://www.daytona.io/docs/en/go-sdk/daytona/#SandboxIterator.Err)
  - [func (it \*SandboxIterator) Next() bool](https://www.daytona.io/docs/en/go-sdk/daytona/#SandboxIterator.Next)
  - [func (it \*SandboxIterator) Value() \*Sandbox](https://www.daytona.io/docs/en/go-sdk/daytona/#SandboxIterator.Value)
- [type SandboxListSortDirection](https://www.daytona.io/docs/en/go-sdk/daytona/#SandboxListSortDirection)
- [type SandboxListSortField](https://www.daytona.io/docs/en/go-sdk/daytona/#SandboxListSortField)
- [type SandboxMetrics](https://www.daytona.io/docs/en/go-sdk/daytona/#SandboxMetrics)
- [type SandboxState](https://www.daytona.io/docs/en/go-sdk/daytona/#SandboxState)
- [type ScreenshotService](https://www.daytona.io/docs/en/go-sdk/daytona/#ScreenshotService)
  - [func NewScreenshotService(toolboxClient \*toolbox.APIClient, otel \*otelState) \*ScreenshotService](https://www.daytona.io/docs/en/go-sdk/daytona/#NewScreenshotService)
  - [func (s \*ScreenshotService) TakeFullScreen(ctx context.Context, showCursor \*bool) (\*types.ScreenshotResponse, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#ScreenshotService.TakeFullScreen)
  - [func (s \*ScreenshotService) TakeRegion(ctx context.Context, region types.ScreenshotRegion, showCursor \*bool) (\*types.ScreenshotResponse, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#ScreenshotService.TakeRegion)
- [type SecretService](https://www.daytona.io/docs/en/go-sdk/daytona/#SecretService)
  - [func NewSecretService(client \*Client) \*SecretService](https://www.daytona.io/docs/en/go-sdk/daytona/#NewSecretService)
  - [func (s \*SecretService) Create(ctx context.Context, params \*types.CreateSecretParams) (\*types.Secret, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#SecretService.Create)
  - [func (s \*SecretService) Delete(ctx context.Context, secretID string) error](https://www.daytona.io/docs/en/go-sdk/daytona/#SecretService.Delete)
  - [func (s \*SecretService) Get(ctx context.Context, secretID string) (\*types.Secret, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#SecretService.Get)
  - [func (s \*SecretService) List(ctx context.Context, query \*types.ListSecretsQuery) (\*types.ListSecretsResponse, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#SecretService.List)
  - [func (s \*SecretService) Update(ctx context.Context, secretID string, params \*types.UpdateSecretParams) (\*types.Secret, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#SecretService.Update)
- [type SnapshotService](https://www.daytona.io/docs/en/go-sdk/daytona/#SnapshotService)
  - [func NewSnapshotService(client \*Client) \*SnapshotService](https://www.daytona.io/docs/en/go-sdk/daytona/#NewSnapshotService)
  - [func (s \*SnapshotService) Create(ctx context.Context, params \*types.CreateSnapshotParams) (\*types.Snapshot, <-chan string, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#SnapshotService.Create)
  - [func (s \*SnapshotService) Delete(ctx context.Context, snapshot \*types.Snapshot) error](https://www.daytona.io/docs/en/go-sdk/daytona/#SnapshotService.Delete)
  - [func (s \*SnapshotService) Get(ctx context.Context, nameOrID string) (\*types.Snapshot, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#SnapshotService.Get)
  - [func (s \*SnapshotService) List(ctx context.Context, page \*int, limit \*int) (\*types.PaginatedSnapshots, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#SnapshotService.List)
- [type UploadProgress](https://www.daytona.io/docs/en/go-sdk/daytona/#UploadProgress)
- [type UploadStreamOption](https://www.daytona.io/docs/en/go-sdk/daytona/#UploadStreamOption)
  - [func WithUploadProgress(fn func(UploadProgress)) UploadStreamOption](https://www.daytona.io/docs/en/go-sdk/daytona/#WithUploadProgress)
- [type VolumeService](https://www.daytona.io/docs/en/go-sdk/daytona/#VolumeService)
  - [func NewVolumeService(client \*Client) \*VolumeService](https://www.daytona.io/docs/en/go-sdk/daytona/#NewVolumeService)
  - [func (v \*VolumeService) Create(ctx context.Context, name string) (\*types.Volume, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#VolumeService.Create)
  - [func (v \*VolumeService) Delete(ctx context.Context, volume \*types.Volume) error](https://www.daytona.io/docs/en/go-sdk/daytona/#VolumeService.Delete)
  - [func (v \*VolumeService) Get(ctx context.Context, name string) (\*types.Volume, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#VolumeService.Get)
  - [func (v \*VolumeService) List(ctx context.Context) (\[\]\*types.Volume, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#VolumeService.List)
  - [func (v \*VolumeService) WaitForReady(ctx context.Context, volume \*types.Volume, timeout time.Duration) (\*types.Volume, error)](https://www.daytona.io/docs/en/go-sdk/daytona/#VolumeService.WaitForReady)

## [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#constants) Constants

[Section titled “Constants”](https://www.daytona.io/docs/en/go-sdk/daytona/#constants)

CamelCase enum constants, matching idiomatic Go naming (the underlying api-client uses SCREAMING\_SNAKE\_CASE which is non-idiomatic in Go).

```
const (

    SandboxStateCreating         = apiclient.SANDBOXSTATE_CREATING

    SandboxStateRestoring        = apiclient.SANDBOXSTATE_RESTORING

    SandboxStateDestroyed        = apiclient.SANDBOXSTATE_DESTROYED

    SandboxStateDestroying       = apiclient.SANDBOXSTATE_DESTROYING

    SandboxStateStarted          = apiclient.SANDBOXSTATE_STARTED

    SandboxStateStopped          = apiclient.SANDBOXSTATE_STOPPED

    SandboxStateStarting         = apiclient.SANDBOXSTATE_STARTING

    SandboxStateStopping         = apiclient.SANDBOXSTATE_STOPPING

    SandboxStateError            = apiclient.SANDBOXSTATE_ERROR

    SandboxStateBuildFailed      = apiclient.SANDBOXSTATE_BUILD_FAILED

    SandboxStatePendingBuild     = apiclient.SANDBOXSTATE_PENDING_BUILD

    SandboxStateBuildingSnapshot = apiclient.SANDBOXSTATE_BUILDING_SNAPSHOT

    SandboxStateUnknown          = apiclient.SANDBOXSTATE_UNKNOWN

    SandboxStatePullingSnapshot  = apiclient.SANDBOXSTATE_PULLING_SNAPSHOT

    SandboxStateArchived         = apiclient.SANDBOXSTATE_ARCHIVED

    SandboxStateArchiving        = apiclient.SANDBOXSTATE_ARCHIVING

    SandboxStateResizing         = apiclient.SANDBOXSTATE_RESIZING

    SandboxStateSnapshotting     = apiclient.SANDBOXSTATE_SNAPSHOTTING

    SandboxStateForking          = apiclient.SANDBOXSTATE_FORKING

    SandboxStatePausing          = apiclient.SANDBOXSTATE_PAUSING

    SandboxStatePaused           = apiclient.SANDBOXSTATE_PAUSED

    SandboxStateResuming         = apiclient.SANDBOXSTATE_RESUMING

)
```

```
const (

    SandboxListSortFieldName           = apiclient.SANDBOXLISTSORTFIELD_NAME

    SandboxListSortFieldCpu            = apiclient.SANDBOXLISTSORTFIELD_CPU

    SandboxListSortFieldMemoryGib      = apiclient.SANDBOXLISTSORTFIELD_MEMORY_GIB

    SandboxListSortFieldDiskGib        = apiclient.SANDBOXLISTSORTFIELD_DISK_GIB

    SandboxListSortFieldLastActivityAt = apiclient.SANDBOXLISTSORTFIELD_LAST_ACTIVITY_AT

    SandboxListSortFieldCreatedAt      = apiclient.SANDBOXLISTSORTFIELD_CREATED_AT

)
```

```
const (

    SandboxListSortDirectionAsc  = apiclient.SANDBOXLISTSORTDIRECTION_ASC

    SandboxListSortDirectionDesc = apiclient.SANDBOXLISTSORTDIRECTION_DESC

)
```

## [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#variables) Variables

[Section titled “Variables”](https://www.daytona.io/docs/en/go-sdk/daytona/#variables)

Version is the semantic version of the Daytona SDK.

This value is embedded at build time from the VERSION file.

Example:

```
fmt.Printf("Daytona SDK version: %s\n", daytona.Version)
```

```
var Version = strings.TrimSpace(version)
```

## [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#type-accessibilityfindoptions) type AccessibilityFindOptions

[Section titled “type AccessibilityFindOptions”](https://www.daytona.io/docs/en/go-sdk/daytona/#type-accessibilityfindoptions)

AccessibilityFindOptions configures an accessibility node search.

```
type AccessibilityFindOptions struct {

    Scope     *string

    PID       *int

    Role      *string

    Name      *string

    NameMatch *string

    States    []string

    Limit     *int

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#type-accessibilityservice) type AccessibilityService

[Section titled “type AccessibilityService”](https://www.daytona.io/docs/en/go-sdk/daytona/#type-accessibilityservice)

AccessibilityService provides AT-SPI accessibility operations.

AccessibilityService exposes thin SDK wrappers over the toolbox accessibility endpoints. Access through [ComputerUseService.Accessibility](https://www.daytona.io/docs/en/go-sdk/daytona/#ComputerUseService.Accessibility).

```
type AccessibilityService struct {

    // contains filtered or unexported fields

}
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-newaccessibilityservice) func NewAccessibilityService

[Section titled “func NewAccessibilityService”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-newaccessibilityservice)

```
func NewAccessibilityService(toolboxClient *toolbox.APIClient, otel *otelState) *AccessibilityService
```

NewAccessibilityService creates a new AccessibilityService.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-accessibilityservice-findnodes) func (\*AccessibilityService) FindNodes

[Section titled “func (\*AccessibilityService) FindNodes”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-accessibilityservice-findnodes)

```
func (a *AccessibilityService) FindNodes(ctx context.Context, opts *AccessibilityFindOptions) (*toolbox.AccessibilityNodesResponse, error)
```

FindNodes finds AT-SPI accessibility nodes matching the provided filters.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-accessibilityservice-focusnode) func (\*AccessibilityService) FocusNode

[Section titled “func (\*AccessibilityService) FocusNode”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-accessibilityservice-focusnode)

```
func (a *AccessibilityService) FocusNode(ctx context.Context, id string) error
```

FocusNode focuses an AT-SPI accessibility node.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-accessibilityservice-gettree) func (\*AccessibilityService) GetTree

[Section titled “func (\*AccessibilityService) GetTree”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-accessibilityservice-gettree)

```
func (a *AccessibilityService) GetTree(ctx context.Context, opts *AccessibilityTreeOptions) (*toolbox.AccessibilityTreeResponse, error)
```

GetTree fetches the AT-SPI accessibility tree.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-accessibilityservice-invokenode) func (\*AccessibilityService) InvokeNode

[Section titled “func (\*AccessibilityService) InvokeNode”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-accessibilityservice-invokenode)

```
func (a *AccessibilityService) InvokeNode(ctx context.Context, id string, action *string) error
```

InvokeNode invokes an AT-SPI accessibility node action.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-accessibilityservice-setnodevalue) func (\*AccessibilityService) SetNodeValue

[Section titled “func (\*AccessibilityService) SetNodeValue”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-accessibilityservice-setnodevalue)

```
func (a *AccessibilityService) SetNodeValue(ctx context.Context, id string, value string) error
```

SetNodeValue sets an AT-SPI accessibility node value.

## [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#type-accessibilitytreeoptions) type AccessibilityTreeOptions

[Section titled “type AccessibilityTreeOptions”](https://www.daytona.io/docs/en/go-sdk/daytona/#type-accessibilitytreeoptions)

AccessibilityTreeOptions configures an accessibility tree request.

```
type AccessibilityTreeOptions struct {

    Scope    *string

    PID      *int

    MaxDepth *int

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#type-client) type Client

[Section titled “type Client”](https://www.daytona.io/docs/en/go-sdk/daytona/#type-client)

Client is the main entry point for interacting with the Daytona platform.

Client provides methods to create, retrieve, list, and manage sandboxes. It handles authentication, API communication, and provides access to services like Volume and Snapshot management.

Create a Client using [NewClient](https://www.daytona.io/docs/en/go-sdk/daytona/#NewClient) or [NewClientWithConfig](https://www.daytona.io/docs/en/go-sdk/daytona/#NewClientWithConfig):

```
client, err := daytona.NewClient()

if err != nil {

    log.Fatal(err)

}
```

The Client is safe for concurrent use by multiple goroutines.

```
type Client struct {

    // Otel holds OpenTelemetry state; nil when OTel is disabled.

    Otel *otelState

    // Volume provides methods for managing persistent volumes.

    Volume *VolumeService

    // Snapshot provides methods for managing sandbox snapshots.

    Snapshot *SnapshotService

    // Secret provides methods for managing organization secrets.

    Secret *SecretService

    // contains filtered or unexported fields

}
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-newclient) func NewClient

[Section titled “func NewClient”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-newclient)

```
func NewClient() (*Client, error)
```

NewClient creates a new Daytona client with default configuration.

NewClient reads configuration from environment variables:

- DAYTONA\_API\_KEY or DAYTONA\_JWT\_TOKEN for authentication (one is required)
- DAYTONA\_ORGANIZATION\_ID (required when using JWT token)
- DAYTONA\_API\_URL for custom API endpoint
- DAYTONA\_TARGET for target environment

For explicit configuration, use [NewClientWithConfig](https://www.daytona.io/docs/en/go-sdk/daytona/#NewClientWithConfig) instead.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-newclientwithconfig) func NewClientWithConfig

[Section titled “func NewClientWithConfig”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-newclientwithconfig)

```
func NewClientWithConfig(config *types.DaytonaConfig) (*Client, error)
```

NewClientWithConfig creates a new Daytona client with a custom configuration.

Configuration values provided in config take precedence over environment variables. Any configuration field left empty will fall back to the corresponding environment variable (see [NewClient](https://www.daytona.io/docs/en/go-sdk/daytona/#NewClient) for the list of supported variables).

Example:

```
client, err := daytona.NewClientWithConfig(&types.DaytonaConfig{

    APIKey:         "your-api-key",

    APIUrl:         "https://custom.daytona.io/api",

    OrganizationID: "org-123",

})

if err != nil {

    log.Fatal(err)

}
```

Returns an error if neither API key nor JWT token is provided, or if JWT token is provided without an organization ID.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-client-close) func (\*Client) Close

[Section titled “func (\*Client) Close”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-client-close)

```
func (c *Client) Close(ctx context.Context) error
```

Close shuts down the client and releases resources. When OpenTelemetry is enabled, Close flushes and shuts down the OTel providers. It is safe to call Close even when OTel is not enabled.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-client-create) func (\*Client) Create

[Section titled “func (\*Client) Create”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-client-create)

```
func (c *Client) Create(ctx context.Context, params any, opts ...func(*options.CreateSandbox)) (*Sandbox, error)
```

Create creates a new sandbox with the specified parameters.

The params argument accepts either \[types.SnapshotParams\] to create from a snapshot, or \[types.ImageParams\] to create from a Docker image:

```
// Create from a snapshot

sandbox, err := client.Create(ctx, types.SnapshotParams{

    Snapshot: "my-snapshot",

    SandboxBaseParams: types.SandboxBaseParams{

        Name: "my-sandbox",

    },

})

// Create from a Docker image

sandbox, err := client.Create(ctx, types.ImageParams{

    Image: "python:3.11",

    Resources: &types.Resources{

        CPU:    2,

        Memory: 4096,

    },

})
```

By default, Create waits for the sandbox to reach the started state before returning. Use \[options.WithWaitForStart\](false) to return immediately after creation.

Optional parameters can be configured using functional options:

- \[options.WithTimeout\]: Set maximum wait time for creation
- \[options.WithWaitForStart\]: Control whether to wait for started state
- \[options.WithLogChannel\]: Receive build logs during image builds

Returns the created [Sandbox](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox) or an error if creation fails.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-client-get) func (\*Client) Get

[Section titled “func (\*Client) Get”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-client-get)

```
func (c *Client) Get(ctx context.Context, sandboxIDOrName string) (*Sandbox, error)
```

Get retrieves an existing sandbox by its ID or name.

The sandboxIDOrName parameter accepts either the sandbox’s unique ID or its human-readable name. If a sandbox with the given identifier is not found, a [\\\*errors.DaytonaError](https://pkg.go.dev/errors/#DaytonaError) matching [errors.ErrNotFound](https://pkg.go.dev/errors/#ErrNotFound) is returned.

Example:

```
sandbox, err := client.Get(ctx, "my-sandbox")

if err != nil {

    if errors.Is(err, sdkerrors.ErrNotFound) {

        log.Println("Sandbox not found")

    }

    return err

}
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-client-list) func (\*Client) List

[Section titled “func (\*Client) List”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-client-list)

```
func (c *Client) List(ctx context.Context, query *ListSandboxesQuery) *SandboxIterator
```

List returns an iterator over Sandboxes matching the given query, following the [database/sql.Rows](https://pkg.go.dev/database/sql/#Rows) / [bufio.Scanner](https://pkg.go.dev/bufio/#Scanner) iterator pattern.

For Go 1.23+ range-over-func consumers, see [Client.ListSeq](https://www.daytona.io/docs/en/go-sdk/daytona/#Client.ListSeq).

Example:

```
iter := client.List(ctx, &ListSandboxesQuery{Labels: map[string]string{"env": "dev"}})

for iter.Next() {

    fmt.Println(iter.Value().ID)

}

if err := iter.Err(); err != nil {

    log.Fatal(err)

}
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-client-listseq) func (\*Client) ListSeq

[Section titled “func (\*Client) ListSeq”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-client-listseq)

```
func (c *Client) ListSeq(ctx context.Context, query *ListSandboxesQuery) iter.Seq2[*Sandbox, error]
```

ListSeq returns a Go 1.23+ range-over-func iterator over Sandboxes matching the given query. Each yielded pair is (sandbox, error); a non-nil error terminates iteration and the consumer should break out of the range.

Example:

```
for sandbox, err := range client.ListSeq(ctx, &ListSandboxesQuery{...}) {

    if err != nil {

        log.Fatal(err)

    }

    fmt.Println(sandbox.ID)

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#type-codeinterpreterservice) type CodeInterpreterService

[Section titled “type CodeInterpreterService”](https://www.daytona.io/docs/en/go-sdk/daytona/#type-codeinterpreterservice)

CodeInterpreterService provides Python code execution capabilities for a sandbox.

CodeInterpreterService enables running Python code in isolated execution contexts with support for streaming output, persistent state, and environment variables. It uses WebSockets for real-time output streaming. Access through \[Sandbox.CodeInterpreter\].

Example:

```
// Simple code execution

channels, err := sandbox.CodeInterpreter.RunCode(ctx, "print('Hello, World!')")

if err != nil {

    return err

}

// Wait for completion and get result

result := <-channels.Done

fmt.Println(result.Stdout)

// With persistent context

ctxInfo, _ := sandbox.CodeInterpreter.CreateContext(ctx, nil)

contextID := ctxInfo["id"].(string)

channels, _ = sandbox.CodeInterpreter.RunCode(ctx, "x = 42",

    options.WithCustomContext(contextID),

)

<-channels.Done

channels, _ = sandbox.CodeInterpreter.RunCode(ctx, "print(x)",

    options.WithCustomContext(contextID),

)
```

```
type CodeInterpreterService struct {

    // contains filtered or unexported fields

}
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-newcodeinterpreterservice) func NewCodeInterpreterService

[Section titled “func NewCodeInterpreterService”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-newcodeinterpreterservice)

```
func NewCodeInterpreterService(toolboxClient *toolbox.APIClient, otel *otelState) *CodeInterpreterService
```

NewCodeInterpreterService creates a new CodeInterpreterService.

This is typically called internally by the SDK when creating a [Sandbox](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox). Users should access CodeInterpreterService through \[Sandbox.CodeInterpreter\] rather than creating it directly.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-codeinterpreterservice-createcontext) func (\*CodeInterpreterService) CreateContext

[Section titled “func (\*CodeInterpreterService) CreateContext”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-codeinterpreterservice-createcontext)

```
func (c *CodeInterpreterService) CreateContext(ctx context.Context, cwd *string) (map[string]any, error)
```

CreateContext creates an isolated execution context for persistent state.

Contexts allow you to maintain state (variables, imports, etc.) across multiple code executions. Without a context, each RunCode call starts fresh.

Parameters:

- cwd: Optional working directory for the context

Example:

```
// Create a context

ctxInfo, err := sandbox.CodeInterpreter.CreateContext(ctx, nil)

if err != nil {

    return err

}

contextID := ctxInfo["id"].(string)

// Use the context to maintain state

sandbox.CodeInterpreter.RunCode(ctx, "x = 42", options.WithCustomContext(contextID))

sandbox.CodeInterpreter.RunCode(ctx, "print(x)", options.WithCustomContext(contextID)) // prints 42

// Clean up when done

sandbox.CodeInterpreter.DeleteContext(ctx, contextID)
```

Returns context information including “id”, “cwd”, “language”, “active”, and “createdAt”.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-codeinterpreterservice-deletecontext) func (\*CodeInterpreterService) DeleteContext

[Section titled “func (\*CodeInterpreterService) DeleteContext”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-codeinterpreterservice-deletecontext)

```
func (c *CodeInterpreterService) DeleteContext(ctx context.Context, contextID string) error
```

DeleteContext removes an execution context and releases its resources.

Parameters:

- contextID: The context identifier to delete

Example:

```
err := sandbox.CodeInterpreter.DeleteContext(ctx, contextID)
```

Returns an error if the context doesn’t exist or deletion fails.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-codeinterpreterservice-listcontexts) func (\*CodeInterpreterService) ListContexts

[Section titled “func (\*CodeInterpreterService) ListContexts”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-codeinterpreterservice-listcontexts)

```
func (c *CodeInterpreterService) ListContexts(ctx context.Context) ([]map[string]any, error)
```

ListContexts returns all active execution contexts.

Example:

```
contexts, err := sandbox.CodeInterpreter.ListContexts(ctx)

if err != nil {

    return err

}

for _, ctx := range contexts {

    fmt.Printf("Context %s (language: %s)\n", ctx["id"], ctx["language"])

}
```

Returns a slice of context information maps.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-codeinterpreterservice-runcode) func (\*CodeInterpreterService) RunCode

[Section titled “func (\*CodeInterpreterService) RunCode”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-codeinterpreterservice-runcode)

```
func (c *CodeInterpreterService) RunCode(ctx context.Context, code string, opts ...func(*options.RunCode)) (*OutputChannels, error)
```

RunCode executes Python code and returns channels for streaming output.

This method establishes a WebSocket connection to execute code asynchronously, streaming stdout and stderr as they become available.

Optional parameters can be configured using functional options:

- \[options.WithCustomContext\]: Use a persistent context for state
- \[options.WithEnv\]: Set environment variables
- \[options.WithInterpreterTimeout\]: Set execution timeout

Example:

```
// Basic execution

channels, err := sandbox.CodeInterpreter.RunCode(ctx, `

    for i in range(5):

        print(f"Count: {i}")

`)

if err != nil {

    return err

}

// Stream output

for msg := range channels.Stdout {

    fmt.Print(msg.Text)

}

// Get final result

result := <-channels.Done

if result.Error != nil {

    fmt.Printf("Error: %s\n", result.Error.Value)

}

// With options

channels, err := sandbox.CodeInterpreter.RunCode(ctx, "import os; print(os.environ['API_KEY'])",

    options.WithEnv(map[string]string{"API_KEY": "secret"}),

    options.WithInterpreterTimeout(30*time.Second),

)
```

Returns [OutputChannels](https://www.daytona.io/docs/en/go-sdk/daytona/#OutputChannels) for receiving streamed output, or an error if connection fails.

## [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#type-computeruseservice) type ComputerUseService

[Section titled “type ComputerUseService”](https://www.daytona.io/docs/en/go-sdk/daytona/#type-computeruseservice)

ComputerUseService provides desktop automation operations for a sandbox.

ComputerUseService enables GUI automation including mouse control, keyboard input, screenshots, display management, and screen recording. The desktop environment must be started before using these features. Access through \[Sandbox.ComputerUse\].

Example:

```
cu := sandbox.ComputerUse

// Start the desktop environment

if err := cu.Start(ctx); err != nil {

    return err

}

defer cu.Stop(ctx)

// Take a screenshot

screenshot, err := cu.Screenshot().TakeFullScreen(ctx, nil)

if err != nil {

    return err

}

// Click at coordinates

cu.Mouse().Click(ctx, 100, 200, nil, nil)

// Type text

cu.Keyboard().Type(ctx, "Hello, World!", nil)
```

```
type ComputerUseService struct {

    // contains filtered or unexported fields

}
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-newcomputeruseservice) func NewComputerUseService

[Section titled “func NewComputerUseService”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-newcomputeruseservice)

```
func NewComputerUseService(toolboxClient *toolbox.APIClient, otel *otelState) *ComputerUseService
```

NewComputerUseService creates a new ComputerUseService.

This is typically called internally by the SDK when creating a [Sandbox](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox). Users should access ComputerUseService through \[Sandbox.ComputerUse\] rather than creating it directly.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-computeruseservice-accessibility) func (\*ComputerUseService) Accessibility

[Section titled “func (\*ComputerUseService) Accessibility”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-computeruseservice-accessibility)

```
func (c *ComputerUseService) Accessibility() *AccessibilityService
```

Accessibility returns the [AccessibilityService](https://www.daytona.io/docs/en/go-sdk/daytona/#AccessibilityService) for AT-SPI accessibility operations.

The service is lazily initialized on first access.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-computeruseservice-display) func (\*ComputerUseService) Display

[Section titled “func (\*ComputerUseService) Display”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-computeruseservice-display)

```
func (c *ComputerUseService) Display() *DisplayService
```

Display returns the [DisplayService](https://www.daytona.io/docs/en/go-sdk/daytona/#DisplayService) for display information.

The service is lazily initialized on first access.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-computeruseservice-getstatus) func (\*ComputerUseService) GetStatus

[Section titled “func (\*ComputerUseService) GetStatus”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-computeruseservice-getstatus)

```
func (c *ComputerUseService) GetStatus(ctx context.Context) (map[string]any, error)
```

GetStatus returns the current status of the desktop environment.

Example:

```
status, err := cu.GetStatus(ctx)

if err != nil {

    return err

}

fmt.Printf("Desktop status: %v\n", status["status"])
```

Returns a map containing status information.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-computeruseservice-keyboard) func (\*ComputerUseService) Keyboard

[Section titled “func (\*ComputerUseService) Keyboard”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-computeruseservice-keyboard)

```
func (c *ComputerUseService) Keyboard() *KeyboardService
```

Keyboard returns the [KeyboardService](https://www.daytona.io/docs/en/go-sdk/daytona/#KeyboardService) for keyboard operations.

The service is lazily initialized on first access.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-computeruseservice-mouse) func (\*ComputerUseService) Mouse

[Section titled “func (\*ComputerUseService) Mouse”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-computeruseservice-mouse)

```
func (c *ComputerUseService) Mouse() *MouseService
```

Mouse returns the [MouseService](https://www.daytona.io/docs/en/go-sdk/daytona/#MouseService) for mouse operations.

The service is lazily initialized on first access.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-computeruseservice-recording) func (\*ComputerUseService) Recording

[Section titled “func (\*ComputerUseService) Recording”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-computeruseservice-recording)

```
func (c *ComputerUseService) Recording() *RecordingService
```

Recording returns the [RecordingService](https://www.daytona.io/docs/en/go-sdk/daytona/#RecordingService) for screen recording operations.

The service is lazily initialized on first access.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-computeruseservice-screenshot) func (\*ComputerUseService) Screenshot

[Section titled “func (\*ComputerUseService) Screenshot”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-computeruseservice-screenshot)

```
func (c *ComputerUseService) Screenshot() *ScreenshotService
```

Screenshot returns the [ScreenshotService](https://www.daytona.io/docs/en/go-sdk/daytona/#ScreenshotService) for capturing screen images.

The service is lazily initialized on first access.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-computeruseservice-start) func (\*ComputerUseService) Start

[Section titled “func (\*ComputerUseService) Start”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-computeruseservice-start)

```
func (c *ComputerUseService) Start(ctx context.Context) error
```

Start initializes and starts the desktop environment.

The desktop environment must be started before using mouse, keyboard, or screenshot operations. Call [ComputerUseService.Stop](https://www.daytona.io/docs/en/go-sdk/daytona/#ComputerUseService.Stop) when finished.

Example:

```
if err := cu.Start(ctx); err != nil {

    return err

}

defer cu.Stop(ctx)
```

Returns an error if the desktop fails to start.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-computeruseservice-stop) func (\*ComputerUseService) Stop

[Section titled “func (\*ComputerUseService) Stop”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-computeruseservice-stop)

```
func (c *ComputerUseService) Stop(ctx context.Context) error
```

Stop shuts down the desktop environment and releases resources.

Example:

```
err := cu.Stop(ctx)
```

Returns an error if the desktop fails to stop gracefully.

## [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#type-displayservice) type DisplayService

[Section titled “type DisplayService”](https://www.daytona.io/docs/en/go-sdk/daytona/#type-displayservice)

DisplayService provides display information and window management operations.

DisplayService enables querying display configuration and window information. Access through [ComputerUseService.Display](https://www.daytona.io/docs/en/go-sdk/daytona/#ComputerUseService.Display).

```
type DisplayService struct {

    // contains filtered or unexported fields

}
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-newdisplayservice) func NewDisplayService

[Section titled “func NewDisplayService”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-newdisplayservice)

```
func NewDisplayService(toolboxClient *toolbox.APIClient, otel *otelState) *DisplayService
```

NewDisplayService creates a new DisplayService.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-displayservice-getinfo) func (\*DisplayService) GetInfo

[Section titled “func (\*DisplayService) GetInfo”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-displayservice-getinfo)

```
func (d *DisplayService) GetInfo(ctx context.Context) (map[string]any, error)
```

GetInfo returns information about connected displays.

Example:

```
info, err := display.GetInfo(ctx)

if err != nil {

    return err

}

displays := info["displays"]

fmt.Printf("Connected displays: %v\n", displays)
```

Returns a map containing display information.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-displayservice-getwindows) func (\*DisplayService) GetWindows

[Section titled “func (\*DisplayService) GetWindows”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-displayservice-getwindows)

```
func (d *DisplayService) GetWindows(ctx context.Context) (map[string]any, error)
```

GetWindows returns information about open windows.

Example:

```
result, err := display.GetWindows(ctx)

if err != nil {

    return err

}

windows := result["windows"]

fmt.Printf("Open windows: %v\n", windows)
```

Returns a map containing window information.

## [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#type-dockerimage) type DockerImage

[Section titled “type DockerImage”](https://www.daytona.io/docs/en/go-sdk/daytona/#type-dockerimage)

DockerImage provides a fluent interface for building Docker images declaratively.

DockerImage allows you to define Docker images using Go code instead of Dockerfiles. Methods can be chained to build up the image definition, which is then converted to a Dockerfile when used with [SnapshotService.Create](https://www.daytona.io/docs/en/go-sdk/daytona/#SnapshotService.Create).

Example:

```
// Create a Python image with dependencies

image := daytona.Base("python:3.11-slim").

    AptGet([]string{"git", "curl"}).

    PipInstall([]string{"numpy", "pandas"}).

    Workdir("/app").

    Env("PYTHONUNBUFFERED", "1")

// Use with snapshot creation

snapshot, logChan, err := client.Snapshot.Create(ctx, &types.CreateSnapshotParams{

    Name:  "my-python-env",

    DockerImage: image,

})
```

```
type DockerImage struct {

    // contains filtered or unexported fields

}
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-base) func Base

[Section titled “func Base”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-base)

```
func Base(baseImage string) *DockerImage
```

Base creates a new Image from a base Docker image.

This is typically the starting point for building an image definition. The baseImage parameter is any valid Docker image reference.

Example:

```
image := daytona.Base("ubuntu:22.04")

image := daytona.Base("python:3.11-slim")

image := daytona.Base("node:18-alpine")
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-debianslim) func DebianSlim

[Section titled “func DebianSlim”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-debianslim)

```
func DebianSlim(pythonVersion *string) *DockerImage
```

DebianSlim creates a Python image based on Debian slim.

This is a convenience function for creating Python environments. If pythonVersion is nil, defaults to Python 3.12.

Example:

```
// Use default Python 3.12

image := daytona.DebianSlim(nil)

// Use specific version

version := "3.10"

image := daytona.DebianSlim(&version)
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-fromdockerfile) func FromDockerfile

[Section titled “func FromDockerfile”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-fromdockerfile)

```
func FromDockerfile(dockerfile string) *DockerImage
```

FromDockerfile creates an Image from an existing Dockerfile string.

Use this when you have an existing Dockerfile you want to use.

Example:

```
dockerfile := `FROM python:3.11

RUN pip install numpy

WORKDIR /app`

image := daytona.FromDockerfile(dockerfile)
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-dockerimage-add) func (\*DockerImage) Add

[Section titled “func (\*DockerImage) Add”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-dockerimage-add)

```
func (img *DockerImage) Add(source, destination string) *DockerImage
```

Add adds an ADD instruction to the image.

ADD supports URLs and automatic tar extraction. For simple file copying, prefer [DockerImage.Copy](https://www.daytona.io/docs/en/go-sdk/daytona/#DockerImage.Copy).

Example:

```
image := daytona.Base("ubuntu:22.04").

    Add("https://example.com/app.tar.gz", "/app/")
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-dockerimage-addlocaldir) func (\*DockerImage) AddLocalDir

[Section titled “func (\*DockerImage) AddLocalDir”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-dockerimage-addlocaldir)

```
func (img *DockerImage) AddLocalDir(localPath, remotePath string) *DockerImage
```

AddLocalDir adds a local directory to the build context and copies it to the image.

The directory is uploaded to object storage and included in the Docker build context.

Example:

```
image := daytona.Base("python:3.11").

    AddLocalDir("./src", "/app/src")
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-dockerimage-addlocalfile) func (\*DockerImage) AddLocalFile

[Section titled “func (\*DockerImage) AddLocalFile”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-dockerimage-addlocalfile)

```
func (img *DockerImage) AddLocalFile(localPath, remotePath string) *DockerImage
```

AddLocalFile adds a local file to the build context and copies it to the image.

The file is uploaded to object storage and included in the Docker build context.

Example:

```
image := daytona.Base("python:3.11").

    AddLocalFile("./requirements.txt", "/app/requirements.txt").

    Run("pip install -r /app/requirements.txt")
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-dockerimage-aptget) func (\*DockerImage) AptGet

[Section titled “func (\*DockerImage) AptGet”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-dockerimage-aptget)

```
func (img *DockerImage) AptGet(packages []string) *DockerImage
```

AptGet adds an apt-get install instruction for system packages.

This automatically handles updating the package list and cleaning up afterward to minimize image size.

Example:

```
image := daytona.Base("ubuntu:22.04").AptGet([]string{"git", "curl", "build-essential"})
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-dockerimage-cmd) func (\*DockerImage) Cmd

[Section titled “func (\*DockerImage) Cmd”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-dockerimage-cmd)

```
func (img *DockerImage) Cmd(cmd []string) *DockerImage
```

Cmd sets the default command for the image.

If an entrypoint is set, the cmd provides default arguments to it.

Example:

```
image := daytona.Base("python:3.11").

    Cmd([]string{"python", "app.py"})
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-dockerimage-contexts) func (\*DockerImage) Contexts

[Section titled “func (\*DockerImage) Contexts”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-dockerimage-contexts)

```
func (img *DockerImage) Contexts() []DockerImageContext
```

Contexts returns the build contexts for local files/directories.

This is called internally when creating snapshots to upload local files.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-dockerimage-copy) func (\*DockerImage) Copy

[Section titled “func (\*DockerImage) Copy”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-dockerimage-copy)

```
func (img *DockerImage) Copy(source, destination string) *DockerImage
```

Copy adds a COPY instruction to copy files into the image.

For local files, use [DockerImage.AddLocalFile](https://www.daytona.io/docs/en/go-sdk/daytona/#DockerImage.AddLocalFile) instead, which handles uploading to the build context.

Example:

```
image := daytona.Base("python:3.11").

    Copy("requirements.txt", "/app/requirements.txt")
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-dockerimage-dockerfile) func (\*DockerImage) Dockerfile

[Section titled “func (\*DockerImage) Dockerfile”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-dockerimage-dockerfile)

```
func (img *DockerImage) Dockerfile() string
```

Dockerfile returns the generated Dockerfile content.

This is called internally when creating snapshots.

Example:

```
image := daytona.Base("python:3.11").PipInstall([]string{"numpy"})

fmt.Println(image.Dockerfile())

// Output:

// RUN pip install numpy
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-dockerimage-entrypoint) func (\*DockerImage) Entrypoint

[Section titled “func (\*DockerImage) Entrypoint”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-dockerimage-entrypoint)

```
func (img *DockerImage) Entrypoint(cmd []string) *DockerImage
```

Entrypoint sets the entrypoint for the image.

The cmd parameter is the command and arguments as a slice.

Example:

```
image := daytona.Base("python:3.11").

    Entrypoint([]string{"python", "-m", "myapp"})
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-dockerimage-env) func (\*DockerImage) Env

[Section titled “func (\*DockerImage) Env”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-dockerimage-env)

```
func (img *DockerImage) Env(key, value string) *DockerImage
```

Env sets an environment variable in the image.

Example:

```
image := daytona.Base("python:3.11").

    Env("PYTHONUNBUFFERED", "1").

    Env("APP_ENV", "production")
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-dockerimage-expose) func (\*DockerImage) Expose

[Section titled “func (\*DockerImage) Expose”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-dockerimage-expose)

```
func (img *DockerImage) Expose(ports []int) *DockerImage
```

Expose declares ports that the container listens on.

This is documentation for users and tools; it doesn’t actually publish ports.

Example:

```
image := daytona.Base("python:3.11").

    Expose([]int{8080, 8443})
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-dockerimage-label) func (\*DockerImage) Label

[Section titled “func (\*DockerImage) Label”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-dockerimage-label)

```
func (img *DockerImage) Label(key, value string) *DockerImage
```

Label adds metadata to the image.

Example:

```
image := daytona.Base("python:3.11").

    Label("maintainer", "team@example.com").

    Label("version", "1.0.0")
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-dockerimage-pipinstall) func (\*DockerImage) PipInstall

[Section titled “func (\*DockerImage) PipInstall”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-dockerimage-pipinstall)

```
func (img *DockerImage) PipInstall(packages []string, opts ...func(*options.PipInstall)) *DockerImage
```

PipInstall adds a pip install instruction for Python packages.

Optional parameters can be configured using functional options:

- \[options.WithFindLinks\]: Add find-links URLs
- \[options.WithIndexURL\]: Set custom PyPI index
- \[options.WithExtraIndexURLs\]: Add extra index URLs
- \[options.WithPre\]: Allow pre-release versions
- \[options.WithExtraOptions\]: Add additional pip options

Example:

```
// Basic installation

image := daytona.Base("python:3.11").PipInstall([]string{"numpy", "pandas"})

// With options

image := daytona.Base("python:3.11").PipInstall(

    []string{"torch"},

    options.WithIndexURL("https://download.pytorch.org/whl/cpu"),

    options.WithExtraOptions("--no-cache-dir"),

)
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-dockerimage-run) func (\*DockerImage) Run

[Section titled “func (\*DockerImage) Run”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-dockerimage-run)

```
func (img *DockerImage) Run(command string) *DockerImage
```

Run adds a RUN instruction to execute a shell command.

Example:

```
image := daytona.Base("ubuntu:22.04").

    Run("mkdir -p /app/data").

    Run("chmod 755 /app")
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-dockerimage-user) func (\*DockerImage) User

[Section titled “func (\*DockerImage) User”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-dockerimage-user)

```
func (img *DockerImage) User(username string) *DockerImage
```

User sets the user for subsequent instructions and container runtime.

Example:

```
image := daytona.Base("python:3.11").

    Run("useradd -m appuser").

    User("appuser").

    Workdir("/home/appuser")
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-dockerimage-volume) func (\*DockerImage) Volume

[Section titled “func (\*DockerImage) Volume”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-dockerimage-volume)

```
func (img *DockerImage) Volume(paths []string) *DockerImage
```

Volume declares mount points for the container.

Example:

```
image := daytona.Base("python:3.11").

    Volume([]string{"/data", "/logs"})
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-dockerimage-workdir) func (\*DockerImage) Workdir

[Section titled “func (\*DockerImage) Workdir”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-dockerimage-workdir)

```
func (img *DockerImage) Workdir(path string) *DockerImage
```

Workdir sets the working directory for subsequent instructions.

Example:

```
image := daytona.Base("python:3.11").

    Workdir("/app").

    Run("pip install -r requirements.txt")
```

## [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#type-dockerimagecontext) type DockerImageContext

[Section titled “type DockerImageContext”](https://www.daytona.io/docs/en/go-sdk/daytona/#type-dockerimagecontext)

DockerImageContext represents a local file or directory to include in the build context.

When using [DockerImage.AddLocalFile](https://www.daytona.io/docs/en/go-sdk/daytona/#DockerImage.AddLocalFile) or [DockerImage.AddLocalDir](https://www.daytona.io/docs/en/go-sdk/daytona/#DockerImage.AddLocalDir), the file/directory is uploaded to object storage and included in the Docker build context.

```
type DockerImageContext struct {

    SourcePath  string // Local path to the file or directory

    ArchivePath string // Path within the build context archive

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#type-downloadprogress) type DownloadProgress

[Section titled “type DownloadProgress”](https://www.daytona.io/docs/en/go-sdk/daytona/#type-downloadprogress)

DownloadProgress contains progress information for a streaming download.

```
type DownloadProgress struct {

    // BytesReceived is the cumulative number of bytes read so far.

    BytesReceived int64

    // TotalBytes is the total number of bytes expected, if known.

    // Zero means unknown.

    TotalBytes int64

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#type-downloadstreamoption) type DownloadStreamOption

[Section titled “type DownloadStreamOption”](https://www.daytona.io/docs/en/go-sdk/daytona/#type-downloadstreamoption)

DownloadStreamOption configures the behavior of DownloadFileStream.

```
type DownloadStreamOption func(*downloadStreamConfig)
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-withdownloadprogress) func WithDownloadProgress

[Section titled “func WithDownloadProgress”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-withdownloadprogress)

```
func WithDownloadProgress(fn func(DownloadProgress)) DownloadStreamOption
```

WithDownloadProgress returns an option that enables progress tracking for streaming downloads. The callback receives the cumulative bytes read and, when available, the total bytes expected.

## [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#type-filesystemservice) type FileSystemService

[Section titled “type FileSystemService”](https://www.daytona.io/docs/en/go-sdk/daytona/#type-filesystemservice)

FileSystemService provides file system operations for a sandbox.

FileSystemService enables file and directory management including creating, reading, writing, moving, and deleting files. It also supports file searching and permission management. Access through \[Sandbox.FileSystem\].

Example:

```
// List files in a directory

files, err := sandbox.FileSystem.ListFiles(ctx, "/home/user")

// Create a directory

err = sandbox.FileSystem.CreateFolder(ctx, "/home/user/mydir")

// Upload a file

err = sandbox.FileSystem.UploadFile(ctx, "/local/path/file.txt", "/home/user/file.txt")

// Download a file

data, err := sandbox.FileSystem.DownloadFile(ctx, "/home/user/file.txt", nil)
```

```
type FileSystemService struct {

    // contains filtered or unexported fields

}
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-newfilesystemservice) func NewFileSystemService

[Section titled “func NewFileSystemService”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-newfilesystemservice)

```
func NewFileSystemService(toolboxClient *toolbox.APIClient, otel *otelState) *FileSystemService
```

NewFileSystemService creates a new FileSystemService with the provided toolbox client.

This is typically called internally by the SDK when creating a [Sandbox](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox). Users should access FileSystemService through \[Sandbox.FileSystem\] rather than creating it directly.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-filesystemservice-createfolder) func (\*FileSystemService) CreateFolder

[Section titled “func (\*FileSystemService) CreateFolder”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-filesystemservice-createfolder)

```
func (f *FileSystemService) CreateFolder(ctx context.Context, path string, opts ...func(*options.CreateFolder)) error
```

CreateFolder creates a directory at the specified path.

The path parameter specifies the absolute path for the new directory. Parent directories are created automatically if they don’t exist.

Optional parameters can be configured using functional options:

- \[options.WithMode\]: Set Unix file permissions (defaults to “0755”)

Example:

```
// Create with default permissions

err := sandbox.FileSystem.CreateFolder(ctx, "/home/user/mydir")

// Create with custom permissions

err := sandbox.FileSystem.CreateFolder(ctx, "/home/user/private",

    options.WithMode("0700"),

)
```

Returns an error if the directory creation fails.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-filesystemservice-deletefile) func (\*FileSystemService) DeleteFile

[Section titled “func (\*FileSystemService) DeleteFile”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-filesystemservice-deletefile)

```
func (f *FileSystemService) DeleteFile(ctx context.Context, path string, recursive bool) error
```

DeleteFile deletes a file or directory.

Parameters:

- path: The file or directory path to delete
- recursive: If true, delete directories and their contents recursively

Example:

```
// Delete a file

err := sandbox.FileSystem.DeleteFile(ctx, "/home/user/file.txt", false)

// Delete a directory recursively

err := sandbox.FileSystem.DeleteFile(ctx, "/home/user/mydir", true)
```

Returns an error if the deletion fails (e.g., path doesn’t exist, permission denied, or attempting to delete a non-empty directory without recursive=true).

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-filesystemservice-downloadfile) func (\*FileSystemService) DownloadFile

[Section titled “func (\*FileSystemService) DownloadFile”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-filesystemservice-downloadfile)

```
func (f *FileSystemService) DownloadFile(ctx context.Context, remotePath string, localPath *string) ([]byte, error)
```

DownloadFile downloads a file from the sandbox.

Parameters:

- remotePath: The path to the file in the sandbox
- localPath: Optional local path to save the file. If nil, only returns the data.

Returns the file contents as a byte slice. If localPath is provided, also writes the contents to that local file.

Example:

```
// Download and get contents

data, err := sandbox.FileSystem.DownloadFile(ctx, "/home/user/file.txt", nil)

fmt.Println(string(data))

// Download and save to local file

localPath := "/tmp/downloaded.txt"

data, err := sandbox.FileSystem.DownloadFile(ctx, "/home/user/file.txt", &localPath)
```

Returns an error if the file doesn’t exist or cannot be read.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-filesystemservice-downloadfilestream) func (\*FileSystemService) DownloadFileStream

[Section titled “func (\*FileSystemService) DownloadFileStream”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-filesystemservice-downloadfilestream)

```
func (f *FileSystemService) DownloadFileStream(ctx context.Context, remotePath string, opts ...DownloadStreamOption) (io.ReadCloser, error)
```

DownloadFileStream downloads a single file from the sandbox as a stream without buffering the entire file into memory. The returned [io.ReadCloser](https://pkg.go.dev/io/#ReadCloser) can be piped directly to an HTTP response, written to a file, or processed on the fly.

The caller must close the returned [io.ReadCloser](https://pkg.go.dev/io/#ReadCloser) when done.

Parameters:

- remotePath: Path to the file in the sandbox. Relative paths are resolved based on the sandbox working directory.

Returns an [io.ReadCloser](https://pkg.go.dev/io/#ReadCloser) streaming the file content.

Example:

```
// Stream to an HTTP response

stream, err := sandbox.FileSystem.DownloadFileStream(ctx, "workspace/report.pdf")

if err != nil {

    log.Fatal(err)

}

defer stream.Close()

io.Copy(w, stream) // w is an http.ResponseWriter

// Stream to a local file

stream, err := sandbox.FileSystem.DownloadFileStream(ctx, "workspace/large-file.bin")

if err != nil {

    log.Fatal(err)

}

defer stream.Close()

out, _ := os.Create("local-copy.bin")

defer out.Close()

io.Copy(out, stream)
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-filesystemservice-findfiles) func (\*FileSystemService) FindFiles

[Section titled “func (\*FileSystemService) FindFiles”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-filesystemservice-findfiles)

```
func (f *FileSystemService) FindFiles(ctx context.Context, path, pattern string) (any, error)
```

FindFiles searches for text content within files.

Parameters:

- path: The directory to search in
- pattern: The text pattern to search for (supports regex)

Returns a list of matches, each containing the file path, line number, and matching content.

Example:

```
result, err := sandbox.FileSystem.FindFiles(ctx, "/home/user/project", "TODO:")

if err != nil {

    return err

}

matches := result.([]map[string]any)

for _, match := range matches {

    fmt.Printf("%s:%d: %s\n", match["file"], match["line"], match["content"])

}
```

Returns an error if the search fails.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-filesystemservice-getfileinfo) func (\*FileSystemService) GetFileInfo

[Section titled “func (\*FileSystemService) GetFileInfo”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-filesystemservice-getfileinfo)

```
func (f *FileSystemService) GetFileInfo(ctx context.Context, path string) (*types.FileInfo, error)
```

GetFileInfo retrieves metadata for a file or directory.

The path parameter specifies the file or directory path.

Returns \[types.FileInfo\] containing the file’s name, size, permissions, modification time, and whether it’s a directory.

Example:

```
info, err := sandbox.FileSystem.GetFileInfo(ctx, "/home/user/file.txt")

if err != nil {

    return err

}

fmt.Printf("Size: %d bytes, Modified: %s\n", info.Size, info.ModifiedTime)
```

Returns an error if the path doesn’t exist.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-filesystemservice-listfiles) func (\*FileSystemService) ListFiles

[Section titled “func (\*FileSystemService) ListFiles”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-filesystemservice-listfiles)

```
func (f *FileSystemService) ListFiles(ctx context.Context, path string, opts ...func(*options.ListFiles)) ([]*types.FileInfo, error)
```

ListFiles lists files and directories in the specified path.

The path parameter specifies the directory to list.

Returns a slice of \[types.FileInfo\] containing metadata for each file and directory, including name, size, permissions, modification time, and whether it’s a directory.

Example:

```
files, err := sandbox.FileSystem.ListFiles(ctx, "/home/user")

if err != nil {

    return err

}

for _, file := range files {

    if file.IsDirectory {

        fmt.Printf("[DIR]  %s\n", file.Name)

    } else {

        fmt.Printf("[FILE] %s (%d bytes)\n", file.Name, file.Size)

    }

}
```

Returns an error if the path doesn’t exist or isn’t accessible.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-filesystemservice-movefiles) func (\*FileSystemService) MoveFiles

[Section titled “func (\*FileSystemService) MoveFiles”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-filesystemservice-movefiles)

```
func (f *FileSystemService) MoveFiles(ctx context.Context, source, destination string) error
```

MoveFiles moves or renames a file or directory.

Parameters:

- source: The current path of the file or directory
- destination: The new path for the file or directory

This operation can be used for both moving and renaming:

- Same directory, different name = rename
- Different directory = move

Example:

```
// Rename a file

err := sandbox.FileSystem.MoveFiles(ctx, "/home/user/old.txt", "/home/user/new.txt")

// Move a file to another directory

err := sandbox.FileSystem.MoveFiles(ctx, "/home/user/file.txt", "/home/user/backup/file.txt")
```

Returns an error if the operation fails.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-filesystemservice-replaceinfiles) func (\*FileSystemService) ReplaceInFiles

[Section titled “func (\*FileSystemService) ReplaceInFiles”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-filesystemservice-replaceinfiles)

```
func (f *FileSystemService) ReplaceInFiles(ctx context.Context, files []string, pattern, newValue string) (any, error)
```

ReplaceInFiles replaces text in multiple files.

Parameters:

- files: List of file paths to process
- pattern: The text pattern to search for (supports regex)
- newValue: The replacement text

Returns a list of results for each file, indicating success or failure.

Example:

```
files := []string{"/home/user/file1.txt", "/home/user/file2.txt"}

result, err := sandbox.FileSystem.ReplaceInFiles(ctx, files, "oldValue", "newValue")

if err != nil {

    return err

}

results := result.([]map[string]any)

for _, r := range results {

    if r["success"].(bool) {

        fmt.Printf("Updated: %s\n", r["file"])

    } else {

        fmt.Printf("Failed: %s - %s\n", r["file"], r["error"])

    }

}
```

Returns an error if the operation fails entirely.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-filesystemservice-searchfiles) func (\*FileSystemService) SearchFiles

[Section titled “func (\*FileSystemService) SearchFiles”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-filesystemservice-searchfiles)

```
func (f *FileSystemService) SearchFiles(ctx context.Context, path, pattern string) (any, error)
```

SearchFiles searches for files matching a pattern in a directory.

Parameters:

- path: The directory to search in
- pattern: The glob pattern to match file names (e.g., “\*.txt”, “test\_\*”)

Returns a map containing a “files” key with a list of matching file paths.

Example:

```
result, err := sandbox.FileSystem.SearchFiles(ctx, "/home/user", "*.go")

if err != nil {

    return err

}

files := result.(map[string]any)["files"].([]string)

for _, file := range files {

    fmt.Println(file)

}
```

Returns an error if the search fails.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-filesystemservice-setfilepermissions) func (\*FileSystemService) SetFilePermissions

[Section titled “func (\*FileSystemService) SetFilePermissions”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-filesystemservice-setfilepermissions)

```
func (f *FileSystemService) SetFilePermissions(ctx context.Context, path string, opts ...func(*options.SetFilePermissions)) error
```

SetFilePermissions sets file permissions, owner, and group.

The path parameter specifies the file or directory to modify.

Optional parameters can be configured using functional options:

- \[options.WithPermissionMode\]: Set Unix file permissions (e.g., “0644”)
- \[options.WithOwner\]: Set file owner username
- \[options.WithGroup\]: Set file group name

Example:

```
// Set permissions only

err := sandbox.FileSystem.SetFilePermissions(ctx, "/home/user/script.sh",

    options.WithPermissionMode("0755"),

)

// Set owner and group

err := sandbox.FileSystem.SetFilePermissions(ctx, "/home/user/file.txt",

    options.WithOwner("root"),

    options.WithGroup("users"),

)

// Set all at once

err := sandbox.FileSystem.SetFilePermissions(ctx, "/home/user/file.txt",

    options.WithPermissionMode("0640"),

    options.WithOwner("user"),

    options.WithGroup("staff"),

)
```

Returns an error if the operation fails.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-filesystemservice-uploadfile) func (\*FileSystemService) UploadFile

[Section titled “func (\*FileSystemService) UploadFile”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-filesystemservice-uploadfile)

```
func (f *FileSystemService) UploadFile(ctx context.Context, source any, destination string) error
```

UploadFile uploads a file to the sandbox.

Parameters:

- source: Either a local file path (string) or file contents (\[\]byte)
- destination: The destination path in the sandbox

Example:

```
// Upload from local file path

err := sandbox.FileSystem.UploadFile(ctx, "/local/path/file.txt", "/home/user/file.txt")

// Upload from byte slice

content := []byte("Hello, World!")

err := sandbox.FileSystem.UploadFile(ctx, content, "/home/user/hello.txt")
```

Returns an error if the upload fails.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-filesystemservice-uploadfilestream) func (\*FileSystemService) UploadFileStream

[Section titled “func (\*FileSystemService) UploadFileStream”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-filesystemservice-uploadfilestream)

```
func (f *FileSystemService) UploadFileStream(ctx context.Context, source io.Reader, remotePath string, opts ...UploadStreamOption) error
```

UploadFileStream streams a file to the sandbox without buffering it in memory. The reader is piped directly into a multipart request, so heap usage stays flat regardless of source size. The HTTP layer uses chunked transfer encoding, so the source’s natural EOF terminates the upload — no advance size is needed. Cancellation flows through the context: cancelling ctx aborts the in-flight HTTP request.

Example:

```
f, _ := os.Open("/local/big.bin")

defer f.Close()

err := sandbox.FileSystem.UploadFileStream(ctx, f, "/home/user/big.bin",

    WithUploadProgress(func(p UploadProgress) {

        log.Printf("%d bytes sent", p.BytesSent)

    }),

)
```

## [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#type-gitservice) type GitService

[Section titled “type GitService”](https://www.daytona.io/docs/en/go-sdk/daytona/#type-gitservice)

GitService provides Git operations for a sandbox.

GitService enables common Git workflows including cloning repositories, staging and committing changes, managing branches, and syncing with remote repositories. It is accessed through the \[Sandbox.Git\] field.

Example:

```
// Clone a repository

err := sandbox.Git.Clone(ctx, "https://github.com/user/repo.git", "/home/user/repo")

// Make changes and commit

err = sandbox.Git.Add(ctx, "/home/user/repo", []string{"."})

resp, err := sandbox.Git.Commit(ctx, "/home/user/repo", "Initial commit", "John Doe", "john@example.com")

// Push to remote

err = sandbox.Git.Push(ctx, "/home/user/repo",

    options.WithPushUsername("username"),

    options.WithPushPassword("token"),

)
```

```
type GitService struct {

    // contains filtered or unexported fields

}
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-newgitservice) func NewGitService

[Section titled “func NewGitService”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-newgitservice)

```
func NewGitService(toolboxClient *toolbox.APIClient, otel *otelState) *GitService
```

NewGitService creates a new GitService with the provided toolbox client.

This is typically called internally by the SDK when creating a [Sandbox](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox). Users should access GitService through \[Sandbox.Git\] rather than creating it directly.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-gitservice-add) func (\*GitService) Add

[Section titled “func (\*GitService) Add”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-gitservice-add)

```
func (g *GitService) Add(ctx context.Context, path string, files []string) error
```

Add stages files for the next commit.

The path parameter specifies the repository directory. The files parameter is a list of file paths (relative to the repository root) to stage. Use ”.” to stage all changes.

Example:

```
// Stage specific files

err := sandbox.Git.Add(ctx, "/home/user/repo", []string{"file1.txt", "src/main.go"})

// Stage all changes

err := sandbox.Git.Add(ctx, "/home/user/repo", []string{"."})
```

Returns an error if the add operation fails.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-gitservice-branches) func (\*GitService) Branches

[Section titled “func (\*GitService) Branches”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-gitservice-branches)

```
func (g *GitService) Branches(ctx context.Context, path string) ([]string, error)
```

Branches lists all branches in a Git repository.

The path parameter specifies the repository directory.

Example:

```
branches, err := sandbox.Git.Branches(ctx, "/home/user/repo")

if err != nil {

    return err

}

for _, branch := range branches {

    fmt.Println(branch)

}
```

Returns a slice of branch names or an error if the operation fails.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-gitservice-checkout) func (\*GitService) Checkout

[Section titled “func (\*GitService) Checkout”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-gitservice-checkout)

```
func (g *GitService) Checkout(ctx context.Context, path, name string) error
```

Checkout switches to a different branch or commit.

The path parameter specifies the repository directory. The name parameter specifies the branch name or commit SHA to checkout.

Example:

```
// Switch to a branch

err := sandbox.Git.Checkout(ctx, "/home/user/repo", "develop")

// Checkout a specific commit

err := sandbox.Git.Checkout(ctx, "/home/user/repo", "abc123def")
```

Returns an error if the checkout fails (e.g., branch doesn’t exist, uncommitted changes).

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-gitservice-clone) func (\*GitService) Clone

[Section titled “func (\*GitService) Clone”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-gitservice-clone)

```
func (g *GitService) Clone(ctx context.Context, url, path string, opts ...func(*options.GitClone)) error
```

Clone clones a Git repository into the specified path.

The url parameter specifies the repository URL (HTTPS or SSH format). The path parameter specifies the destination directory for the cloned repository.

Optional parameters can be configured using functional options:

- \[options.WithBranch\]: Clone a specific branch instead of the default
- \[options.WithCommitId\]: Checkout a specific commit after cloning
- \[options.WithUsername\]: Username for authentication (HTTPS)
- \[options.WithPassword\]: Password or token for authentication (HTTPS)

Example:

```
// Clone the default branch

err := sandbox.Git.Clone(ctx, "https://github.com/user/repo.git", "/home/user/repo")

// Clone a specific branch with authentication

err := sandbox.Git.Clone(ctx, "https://github.com/user/private-repo.git", "/home/user/repo",

    options.WithBranch("develop"),

    options.WithUsername("username"),

    options.WithPassword("github_token"),

)

// Clone and checkout a specific commit

err := sandbox.Git.Clone(ctx, "https://github.com/user/repo.git", "/home/user/repo",

    options.WithCommitId("abc123"),

)
```

Returns an error if the clone operation fails.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-gitservice-commit) func (\*GitService) Commit

[Section titled “func (\*GitService) Commit”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-gitservice-commit)

```
func (g *GitService) Commit(ctx context.Context, path, message, author, email string, opts ...func(*options.GitCommit)) (*types.GitCommitResponse, error)
```

Commit creates a new Git commit with the staged changes.

Parameters:

- path: The repository directory
- message: The commit message
- author: The author name for the commit
- email: The author email for the commit

Optional parameters can be configured using functional options:

- \[options.WithAllowEmpty\]: Allow creating commits with no changes

Example:

```
// Create a commit

resp, err := sandbox.Git.Commit(ctx, "/home/user/repo",

    "Add new feature",

    "John Doe",

    "john@example.com",

)

if err != nil {

    return err

}

fmt.Printf("Created commit: %s\n", resp.SHA)

// Create an empty commit

resp, err := sandbox.Git.Commit(ctx, "/home/user/repo",

    "Empty commit for CI trigger",

    "John Doe",

    "john@example.com",

    options.WithAllowEmpty(true),

)
```

Returns the \[types.GitCommitResponse\] containing the commit SHA, or an error if the commit fails.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-gitservice-configureuser) func (\*GitService) ConfigureUser

[Section titled “func (\*GitService) ConfigureUser”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-gitservice-configureuser)

```
func (g *GitService) ConfigureUser(ctx context.Context, name, email string, opts ...func(*options.GitConfig)) error
```

ConfigureUser configures the git user name and email at the given scope.

Optional parameters can be configured using functional options:

- \[options.WithConfigScope\]: Config scope (“global” (default), “local” or “system”)
- \[options.WithConfigPath\]: Repository path, required when scope is “local”

Example:

```
err := sandbox.Git.ConfigureUser(ctx, "John Doe", "john@example.com")
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-gitservice-createbranch) func (\*GitService) CreateBranch

[Section titled “func (\*GitService) CreateBranch”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-gitservice-createbranch)

```
func (g *GitService) CreateBranch(ctx context.Context, path, name string) error
```

CreateBranch creates a new branch at the current HEAD.

The path parameter specifies the repository directory. The name parameter specifies the name for the new branch.

Note: This creates the branch but does not switch to it. Use [GitService.Checkout](https://www.daytona.io/docs/en/go-sdk/daytona/#GitService.Checkout) to switch to the new branch after creation.

Example:

```
// Create a new branch

err := sandbox.Git.CreateBranch(ctx, "/home/user/repo", "feature/new-feature")

if err != nil {

    return err

}

// Switch to the new branch

err = sandbox.Git.Checkout(ctx, "/home/user/repo", "feature/new-feature")
```

Returns an error if the branch creation fails (e.g., branch already exists).

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-gitservice-dangerouslyauthenticate) func (\*GitService) DangerouslyAuthenticate

[Section titled “func (\*GitService) DangerouslyAuthenticate”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-gitservice-dangerouslyauthenticate)

```
func (g *GitService) DangerouslyAuthenticate(ctx context.Context, username, password string, opts ...func(*options.GitAuthenticate)) error
```

DangerouslyAuthenticate persists git credentials globally so that subsequent operations against the given host authenticate automatically.

This stores the password in plaintext on disk via the git credential store.

Optional parameters can be configured using functional options:

- \[options.WithAuthHost\]: Host to authenticate against (defaults to “github.com”)
- \[options.WithAuthProtocol\]: Protocol to authenticate against (defaults to “https”)

Example:

```
err := sandbox.Git.DangerouslyAuthenticate(ctx, "user", "github_token")
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-gitservice-deletebranch) func (\*GitService) DeleteBranch

[Section titled “func (\*GitService) DeleteBranch”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-gitservice-deletebranch)

```
func (g *GitService) DeleteBranch(ctx context.Context, path, name string, opts ...func(*options.GitDeleteBranch)) error
```

DeleteBranch deletes a branch from the repository.

The path parameter specifies the repository directory. The name parameter specifies the branch to delete.

Optional parameters can be configured using functional options:

- \[options.WithForce\]: Force delete the branch even if not fully merged

Note: You cannot delete the currently checked out branch.

Example:

```
// Delete a merged branch

err := sandbox.Git.DeleteBranch(ctx, "/home/user/repo", "feature/old-feature")

// Force delete an unmerged branch

err := sandbox.Git.DeleteBranch(ctx, "/home/user/repo", "feature/abandoned",

    options.WithForce(true),

)
```

Returns an error if the deletion fails.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-gitservice-getconfig) func (\*GitService) GetConfig

[Section titled “func (\*GitService) GetConfig”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-gitservice-getconfig)

```
func (g *GitService) GetConfig(ctx context.Context, key string, opts ...func(*options.GitConfig)) (string, error)
```

GetConfig returns a git config value at the given scope, or an empty string when the key is not set.

Optional parameters can be configured using functional options:

- \[options.WithConfigScope\]: Config scope (“global” (default), “local” or “system”)
- \[options.WithConfigPath\]: Repository path, required when scope is “local”

Example:

```
name, err := sandbox.Git.GetConfig(ctx, "user.name")
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-gitservice-init) func (\*GitService) Init

[Section titled “func (\*GitService) Init”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-gitservice-init)

```
func (g *GitService) Init(ctx context.Context, path string, opts ...func(*options.GitInit)) error
```

Init initializes a new Git repository at the specified path.

Optional parameters can be configured using functional options:

- \[options.WithBare\]: Create a bare repository without a working tree
- \[options.WithInitialBranch\]: Name of the initial branch

Example:

```
err := sandbox.Git.Init(ctx, "/home/user/repo", options.WithInitialBranch("main"))
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-gitservice-pull) func (\*GitService) Pull

[Section titled “func (\*GitService) Pull”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-gitservice-pull)

```
func (g *GitService) Pull(ctx context.Context, path string, opts ...func(*options.GitPull)) error
```

Pull fetches and merges changes from the remote repository.

The path parameter specifies the repository directory.

Optional parameters can be configured using functional options:

- \[options.WithPullUsername\]: Username for authentication
- \[options.WithPullPassword\]: Password or token for authentication

Example:

```
// Pull from a public repository

err := sandbox.Git.Pull(ctx, "/home/user/repo")

// Pull with authentication

err := sandbox.Git.Pull(ctx, "/home/user/repo",

    options.WithPullUsername("username"),

    options.WithPullPassword("github_token"),

)
```

Returns an error if the pull fails (e.g., merge conflicts, authentication failure).

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-gitservice-push) func (\*GitService) Push

[Section titled “func (\*GitService) Push”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-gitservice-push)

```
func (g *GitService) Push(ctx context.Context, path string, opts ...func(*options.GitPush)) error
```

Push pushes local commits to the remote repository.

The path parameter specifies the repository directory.

Optional parameters can be configured using functional options:

- \[options.WithPushUsername\]: Username for authentication
- \[options.WithPushPassword\]: Password or token for authentication

Example:

```
// Push to a public repository (no auth required)

err := sandbox.Git.Push(ctx, "/home/user/repo")

// Push with authentication

err := sandbox.Git.Push(ctx, "/home/user/repo",

    options.WithPushUsername("username"),

    options.WithPushPassword("github_token"),

)
```

Returns an error if the push fails (e.g., authentication failure, remote rejection).

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-gitservice-remoteadd) func (\*GitService) RemoteAdd

[Section titled “func (\*GitService) RemoteAdd”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-gitservice-remoteadd)

```
func (g *GitService) RemoteAdd(ctx context.Context, path, name, url string, opts ...func(*options.GitRemoteAdd)) error
```

RemoteAdd adds (or overwrites) a remote in the repository.

Optional parameters can be configured using functional options:

- \[options.WithRemoteFetch\]: Fetch from the remote immediately after adding it
- \[options.WithRemoteOverwrite\]: Replace an existing remote with the same name

Example:

```
err := sandbox.Git.RemoteAdd(ctx, "/home/user/repo", "origin", "https://github.com/user/repo.git")
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-gitservice-remoteget) func (\*GitService) RemoteGet

[Section titled “func (\*GitService) RemoteGet”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-gitservice-remoteget)

```
func (g *GitService) RemoteGet(ctx context.Context, path, name string) (string, error)
```

RemoteGet returns the URL of a remote, or an empty string when it does not exist.

Example:

```
url, err := sandbox.Git.RemoteGet(ctx, "/home/user/repo", "origin")
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-gitservice-remotes) func (\*GitService) Remotes

[Section titled “func (\*GitService) Remotes”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-gitservice-remotes)

```
func (g *GitService) Remotes(ctx context.Context, path string) ([]types.GitRemote, error)
```

Remotes lists the remotes configured in the repository.

Example:

```
remotes, err := sandbox.Git.Remotes(ctx, "/home/user/repo")

for _, r := range remotes {

    fmt.Printf("%s: %s\n", r.Name, r.URL)

}
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-gitservice-reset) func (\*GitService) Reset

[Section titled “func (\*GitService) Reset”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-gitservice-reset)

```
func (g *GitService) Reset(ctx context.Context, path string, opts ...func(*options.GitReset)) error
```

Reset resets the current HEAD to the specified state.

Optional parameters can be configured using functional options:

- \[options.WithResetMode\]: Reset mode (“soft”, “mixed”, “hard”, “merge” or “keep”)
- \[options.WithResetTarget\]: Revision to reset to (defaults to HEAD)
- \[options.WithResetFiles\]: Constrain the reset to the given paths

Example:

```
// Unstage all changes (mixed reset to HEAD)

err := sandbox.Git.Reset(ctx, "/home/user/repo")

// Hard reset to a previous commit

err := sandbox.Git.Reset(ctx, "/home/user/repo",

    options.WithResetMode("hard"),

    options.WithResetTarget("HEAD~1"),

)
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-gitservice-restore) func (\*GitService) Restore

[Section titled “func (\*GitService) Restore”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-gitservice-restore)

```
func (g *GitService) Restore(ctx context.Context, path string, files []string, opts ...func(*options.GitRestore)) error
```

Restore restores working tree files or unstages changes for the given paths.

Optional parameters can be configured using functional options:

- \[options.WithRestoreStaged\]: Restore the staging index for the given files
- \[options.WithRestoreWorktree\]: Restore the working tree for the given files
- \[options.WithRestoreSource\]: Restore from the given revision instead of the index

Example:

```
// Discard working tree changes

err := sandbox.Git.Restore(ctx, "/home/user/repo", []string{"file.txt"})

// Unstage changes

err := sandbox.Git.Restore(ctx, "/home/user/repo", []string{"file.txt"},

    options.WithRestoreStaged(true),

)
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-gitservice-setconfig) func (\*GitService) SetConfig

[Section titled “func (\*GitService) SetConfig”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-gitservice-setconfig)

```
func (g *GitService) SetConfig(ctx context.Context, key, value string, opts ...func(*options.GitConfig)) error
```

SetConfig sets a git config value at the given scope.

Optional parameters can be configured using functional options:

- \[options.WithConfigScope\]: Config scope (“global” (default), “local” or “system”)
- \[options.WithConfigPath\]: Repository path, required when scope is “local”

Example:

```
err := sandbox.Git.SetConfig(ctx, "user.name", "John Doe")
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-gitservice-status) func (\*GitService) Status

[Section titled “func (\*GitService) Status”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-gitservice-status)

```
func (g *GitService) Status(ctx context.Context, path string) (*types.GitStatus, error)
```

Status returns the current Git status of a repository.

The path parameter specifies the repository directory to check.

The returned \[types.GitStatus\] contains:

- CurrentBranch: The name of the currently checked out branch
- Ahead: Number of commits ahead of the remote tracking branch
- Behind: Number of commits behind the remote tracking branch
- BranchPublished: Whether the branch has been pushed to remote
- FileStatus: List of files with their staging and working tree status

Example:

```
status, err := sandbox.Git.Status(ctx, "/home/user/repo")

if err != nil {

    return err

}

fmt.Printf("On branch %s\n", status.CurrentBranch)

fmt.Printf("Ahead: %d, Behind: %d\n", status.Ahead, status.Behind)

for _, file := range status.FileStatus {

    fmt.Printf("%s %s\n", file.Status, file.Path)

}
```

Returns an error if the status operation fails or the path is not a Git repository.

## [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#type-keyboardservice) type KeyboardService

[Section titled “type KeyboardService”](https://www.daytona.io/docs/en/go-sdk/daytona/#type-keyboardservice)

KeyboardService provides keyboard input operations.

KeyboardService enables typing text, pressing keys, and executing keyboard shortcuts. Access through [ComputerUseService.Keyboard](https://www.daytona.io/docs/en/go-sdk/daytona/#ComputerUseService.Keyboard).

```
type KeyboardService struct {

    // contains filtered or unexported fields

}
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-newkeyboardservice) func NewKeyboardService

[Section titled “func NewKeyboardService”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-newkeyboardservice)

```
func NewKeyboardService(toolboxClient *toolbox.APIClient, otel *otelState) *KeyboardService
```

NewKeyboardService creates a new KeyboardService.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-keyboardservice-hotkey) func (\*KeyboardService) Hotkey

[Section titled “func (\*KeyboardService) Hotkey”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-keyboardservice-hotkey)

```
func (k *KeyboardService) Hotkey(ctx context.Context, keys string) error
```

Hotkey executes a keyboard shortcut.

Parameters:

- keys: A single atomic hotkey chord as a string (e.g., “ctrl+c”, “alt+tab”, “cmd+shift+t”, “ctrl + c”, “shift”). Uses the same normalized key contract as Press.

Example:

```
// Copy (Ctrl+C)

err := keyboard.Hotkey(ctx, "ctrl+c")

// Paste (Ctrl+V)

err := keyboard.Hotkey(ctx, "ctrl+v")

// Switch windows (Alt+Tab)

err := keyboard.Hotkey(ctx, "alt+tab")
```

Returns an error if the hotkey fails.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-keyboardservice-press) func (\*KeyboardService) Press

[Section titled “func (\*KeyboardService) Press”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-keyboardservice-press)

```
func (k *KeyboardService) Press(ctx context.Context, key string, modifiers []string) error
```

Press simulates pressing a key with optional modifiers.

Parameters:

- key: The key to press. Canonical names include “enter”, “escape”, “tab”, letters, digits, unshifted punctuation, function keys, and grammar-safe numpad names such as “num\_plus”. Named keys are case-insensitive, and common aliases such as “Return” and “Escape” are normalized.
- modifiers: Canonical modifier names are “ctrl”, “alt”, “shift”, and “cmd”. Common aliases such as “control”, “option”, “meta”, and “win” are normalized.

Example:

```
// Press Enter

err := keyboard.Press(ctx, "enter", nil)

// Press Ctrl+S

err := keyboard.Press(ctx, "s", []string{"ctrl"})

// Press Ctrl+Shift+N

err := keyboard.Press(ctx, "n", []string{"ctrl", "shift"})
```

Returns an error if the key press fails.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-keyboardservice-type) func (\*KeyboardService) Type

[Section titled “func (\*KeyboardService) Type”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-keyboardservice-type)

```
func (k *KeyboardService) Type(ctx context.Context, text string, delay *int) error
```

Type simulates typing the specified text.

Parameters:

- text: The text to type
- delay: Delay in milliseconds between keystrokes, nil for default

Example:

```
// Type text with default speed

err := keyboard.Type(ctx, "Hello, World!", nil)

// Type with custom delay between keystrokes

delay := 50

err := keyboard.Type(ctx, "Slow typing", &delay)
```

Returns an error if typing fails.

## [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#type-listsandboxesquery) type ListSandboxesQuery

[Section titled “type ListSandboxesQuery”](https://www.daytona.io/docs/en/go-sdk/daytona/#type-listsandboxesquery)

ListSandboxesQuery contains query parameters for filtering and sorting when listing sandboxes.

```
type ListSandboxesQuery struct {

    // Per-page fetch size. Does NOT limit the total number of Sandboxes returned.

    Limit *int

    // Filter by ID prefix (case-insensitive)

    ID  *string

    // Filter by name prefix (case-insensitive)

    Name *string

    // Filter by labels

    Labels map[string]string

    // Filter by states

    States []apiclient.SandboxState

    // Filter by snapshot names

    Snapshots []string

    // Filter by targets

    Targets []string

    // Filter by minimum CPU

    MinCpu *int

    // Filter by maximum CPU

    MaxCpu *int

    // Filter by minimum memory in GiB

    MinMemoryGib *int

    // Filter by maximum memory in GiB

    MaxMemoryGib *int

    // Filter by minimum disk space in GiB

    MinDiskGib *int

    // Filter by maximum disk space in GiB

    MaxDiskGib *int

    // Filter by public status

    IsPublic *bool

    // Filter by recoverable status

    IsRecoverable *bool

    // Include sandboxes created after this timestamp

    CreatedAtAfter *time.Time

    // Include sandboxes created before this timestamp

    CreatedAtBefore *time.Time

    // Include sandboxes with last activity after this timestamp

    LastActivityAfter *time.Time

    // Include sandboxes with last activity before this timestamp

    LastActivityBefore *time.Time

    // Include sandboxes scheduled for auto destroy after this timestamp

    AutoDestroyAtAfter *time.Time

    // Include sandboxes scheduled for auto destroy before this timestamp

    AutoDestroyAtBefore *time.Time

    // Sort by field

    Sort *apiclient.SandboxListSortField

    // Sort direction

    Order *apiclient.SandboxListSortDirection

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#type-lspserverservice) type LspServerService

[Section titled “type LspServerService”](https://www.daytona.io/docs/en/go-sdk/daytona/#type-lspserverservice)

LspServerService provides Language Server Protocol (LSP) operations for a sandbox.

LspServerService enables IDE-like features such as code completion, symbol search, and document analysis through LSP. The service manages a language server instance for a specific language and project path. Access through [Sandbox.CreateLspServer](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox.CreateLspServer).

Example:

```
// Create an LSP server for Python

lsp := sandbox.CreateLspServer(types.LspLanguagePython, "/home/user/project")

// Start the language server

if err := lsp.Start(ctx); err != nil {

    return err

}

defer lsp.Stop(ctx)

// Open a file for analysis

if err := lsp.DidOpen(ctx, "/home/user/project/main.py"); err != nil {

    return err

}

// Get code completions

completions, err := lsp.Completions(ctx, "/home/user/project/main.py",

    types.Position{Line: 10, Character: 5})
```

```
type LspServerService struct {

    // contains filtered or unexported fields

}
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-newlspserverservice) func NewLspServerService

[Section titled “func NewLspServerService”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-newlspserverservice)

```
func NewLspServerService(toolboxClient *toolbox.APIClient, languageID types.LspLanguageID, projectPath string, otel *otelState) *LspServerService
```

NewLspServerService creates a new LspServerService.

This is typically called internally by the SDK through [Sandbox.CreateLspServer](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox.CreateLspServer). Users should obtain an LspServerService through [Sandbox.CreateLspServer](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox.CreateLspServer) rather than creating it directly.

Parameters:

- toolboxClient: The toolbox API client
- languageID: The language identifier (e.g., \[types.LspLanguagePython\])
- projectPath: The root path of the project for LSP analysis

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-lspserverservice-completions) func (\*LspServerService) Completions

[Section titled “func (\*LspServerService) Completions”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-lspserverservice-completions)

```
func (l *LspServerService) Completions(ctx context.Context, path string, position types.Position) (any, error)
```

Completions returns code completion suggestions at a position.

The file should be opened with [LspServerService.DidOpen](https://www.daytona.io/docs/en/go-sdk/daytona/#LspServerService.DidOpen) before requesting completions.

Parameters:

- path: Absolute path to the file
- position: Cursor position (line and character, 0-indexed)

Example:

```
lsp.DidOpen(ctx, "/home/user/project/main.py")

completions, err := lsp.Completions(ctx, "/home/user/project/main.py",

    types.Position{Line: 10, Character: 5})

if err != nil {

    return err

}

fmt.Printf("Completions: %v\n", completions)
```

Returns completion items or an error.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-lspserverservice-didclose) func (\*LspServerService) DidClose

[Section titled “func (\*LspServerService) DidClose”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-lspserverservice-didclose)

```
func (l *LspServerService) DidClose(ctx context.Context, path string) error
```

DidClose notifies the language server that a file was closed.

Call this when you’re done working with a file to allow the server to release resources associated with it.

Parameters:

- path: Absolute path to the file

Example:

```
err := lsp.DidClose(ctx, "/home/user/project/main.py")
```

Returns an error if the notification fails.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-lspserverservice-didopen) func (\*LspServerService) DidOpen

[Section titled “func (\*LspServerService) DidOpen”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-lspserverservice-didopen)

```
func (l *LspServerService) DidOpen(ctx context.Context, path string) error
```

DidOpen notifies the language server that a file was opened.

This should be called before requesting completions or symbols for a file. The path is automatically converted to a file:// URI if needed.

Parameters:

- path: Absolute path to the file

Example:

```
err := lsp.DidOpen(ctx, "/home/user/project/main.py")
```

Returns an error if the notification fails.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-lspserverservice-documentsymbols) func (\*LspServerService) DocumentSymbols

[Section titled “func (\*LspServerService) DocumentSymbols”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-lspserverservice-documentsymbols)

```
func (l *LspServerService) DocumentSymbols(ctx context.Context, path string) ([]any, error)
```

DocumentSymbols returns all symbols (functions, classes, variables) in a document.

Parameters:

- path: Absolute path to the file

Example:

```
symbols, err := lsp.DocumentSymbols(ctx, "/home/user/project/main.py")

if err != nil {

    return err

}

for _, sym := range symbols {

    fmt.Printf("Symbol: %v\n", sym)

}
```

Returns a slice of symbol information or an error.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-lspserverservice-sandboxsymbols) func (\*LspServerService) SandboxSymbols

[Section titled “func (\*LspServerService) SandboxSymbols”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-lspserverservice-sandboxsymbols)

```
func (l *LspServerService) SandboxSymbols(ctx context.Context, query string) ([]any, error)
```

SandboxSymbols searches for symbols across the entire workspace.

Use this to find symbols (functions, classes, etc.) by name across all files in the project.

Parameters:

- query: Search query to match symbol names

Example:

```
symbols, err := lsp.SandboxSymbols(ctx, "MyClass")

if err != nil {

    return err

}

for _, sym := range symbols {

    fmt.Printf("Found: %v\n", sym)

}
```

Returns a slice of matching symbols or an error.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-lspserverservice-start) func (\*LspServerService) Start

[Section titled “func (\*LspServerService) Start”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-lspserverservice-start)

```
func (l *LspServerService) Start(ctx context.Context) error
```

Start initializes and starts the language server.

The language server must be started before using other LSP operations. Call [LspServerService.Stop](https://www.daytona.io/docs/en/go-sdk/daytona/#LspServerService.Stop) when finished to release resources.

Example:

```
if err := lsp.Start(ctx); err != nil {

    return err

}

defer lsp.Stop(ctx)
```

Returns an error if the server fails to start.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-lspserverservice-stop) func (\*LspServerService) Stop

[Section titled “func (\*LspServerService) Stop”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-lspserverservice-stop)

```
func (l *LspServerService) Stop(ctx context.Context) error
```

Stop shuts down the language server and releases resources.

Example:

```
err := lsp.Stop(ctx)
```

Returns an error if the server fails to stop gracefully.

## [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#type-mouseservice) type MouseService

[Section titled “type MouseService”](https://www.daytona.io/docs/en/go-sdk/daytona/#type-mouseservice)

MouseService provides mouse control operations.

MouseService enables cursor movement, clicking, dragging, and scrolling. Access through [ComputerUseService.Mouse](https://www.daytona.io/docs/en/go-sdk/daytona/#ComputerUseService.Mouse).

```
type MouseService struct {

    // contains filtered or unexported fields

}
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-newmouseservice) func NewMouseService

[Section titled “func NewMouseService”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-newmouseservice)

```
func NewMouseService(toolboxClient *toolbox.APIClient, otel *otelState) *MouseService
```

NewMouseService creates a new MouseService.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-mouseservice-click) func (\*MouseService) Click

[Section titled “func (\*MouseService) Click”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-mouseservice-click)

```
func (m *MouseService) Click(ctx context.Context, x, y int, button *string, double *bool) (map[string]any, error)
```

Click performs a mouse click at the specified coordinates.

Parameters:

- x: X coordinate to click
- y: Y coordinate to click
- button: Mouse button (“left”, “right”, “middle”), nil for left click
- double: Whether to double-click, nil for single click

Example:

```
// Single left click

pos, err := mouse.Click(ctx, 100, 200, nil, nil)

// Right click

button := "right"

pos, err := mouse.Click(ctx, 100, 200, &button, nil)

// Double click

doubleClick := true

pos, err := mouse.Click(ctx, 100, 200, nil, &doubleClick)
```

Returns a map with the click “x” and “y” coordinates.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-mouseservice-drag) func (\*MouseService) Drag

[Section titled “func (\*MouseService) Drag”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-mouseservice-drag)

```
func (m *MouseService) Drag(ctx context.Context, startX, startY, endX, endY int, button *string) (map[string]any, error)
```

Drag performs a mouse drag operation from start to end coordinates.

Parameters:

- startX, startY: Starting coordinates
- endX, endY: Ending coordinates
- button: Mouse button to use, nil for left button

Example:

```
// Drag from (100, 100) to (300, 300)

pos, err := mouse.Drag(ctx, 100, 100, 300, 300, nil)
```

Returns a map with the final “x” and “y” coordinates.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-mouseservice-getposition) func (\*MouseService) GetPosition

[Section titled “func (\*MouseService) GetPosition”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-mouseservice-getposition)

```
func (m *MouseService) GetPosition(ctx context.Context) (map[string]any, error)
```

GetPosition returns the current cursor position.

Example:

```
pos, err := mouse.GetPosition(ctx)

if err != nil {

    return err

}

fmt.Printf("Cursor at (%v, %v)\n", pos["x"], pos["y"])
```

Returns a map with “x” and “y” coordinates.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-mouseservice-move) func (\*MouseService) Move

[Section titled “func (\*MouseService) Move”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-mouseservice-move)

```
func (m *MouseService) Move(ctx context.Context, x, y int) (map[string]any, error)
```

Move moves the cursor to the specified coordinates.

Parameters:

- x: Target X coordinate
- y: Target Y coordinate

Example:

```
pos, err := mouse.Move(ctx, 500, 300)
```

Returns a map with the new “x” and “y” coordinates.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-mouseservice-scroll) func (\*MouseService) Scroll

[Section titled “func (\*MouseService) Scroll”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-mouseservice-scroll)

```
func (m *MouseService) Scroll(ctx context.Context, x, y int, direction string, amount *int) (bool, error)
```

Scroll performs a mouse scroll operation at the specified coordinates.

Parameters:

- x, y: Coordinates where the scroll occurs
- direction: Scroll direction (“up”, “down”)
- amount: Scroll amount, nil for default

Example:

```
// Scroll down at position (500, 400)

success, err := mouse.Scroll(ctx, 500, 400, "down", nil)

// Scroll up with specific amount

amount := 5

success, err := mouse.Scroll(ctx, 500, 400, "up", &amount)
```

Returns true if the scroll was successful.

## [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#type-outputchannels) type OutputChannels

[Section titled “type OutputChannels”](https://www.daytona.io/docs/en/go-sdk/daytona/#type-outputchannels)

OutputChannels provides channels for streaming execution output.

All channels are closed when execution completes or encounters an error. The Done channel always receives exactly one message with the final result.

```
type OutputChannels struct {

    Stdout <-chan *types.OutputMessage   // Receives stdout messages as they occur

    Stderr <-chan *types.OutputMessage   // Receives stderr messages as they occur

    Errors <-chan *types.ExecutionError  // Receives execution errors

    Done   <-chan *types.ExecutionResult // Receives final result when execution completes

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#type-processservice) type ProcessService

[Section titled “type ProcessService”](https://www.daytona.io/docs/en/go-sdk/daytona/#type-processservice)

ProcessService provides process execution operations for a sandbox.

ProcessService enables command execution, session management, and PTY (pseudo-terminal) operations. It supports both synchronous command execution and interactive terminal sessions. Access through \[Sandbox.Process\].

Example:

```
// Execute a command

result, err := sandbox.Process.ExecuteCommand(ctx, "echo 'Hello, World!'")

fmt.Println(result.Result)

// Execute with options

result, err := sandbox.Process.ExecuteCommand(ctx, "ls -la",

    options.WithCwd("/home/user/project"),

    options.WithExecuteTimeout(30*time.Second),

)

// Create an interactive PTY session

handle, err := sandbox.Process.CreatePty(ctx, "my-terminal")

defer handle.Disconnect()
```

```
type ProcessService struct {

    // contains filtered or unexported fields

}
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-newprocessservice) func NewProcessService

[Section titled “func NewProcessService”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-newprocessservice)

```
func NewProcessService(toolboxClient *toolbox.APIClient, otel *otelState, language types.CodeLanguage) *ProcessService
```

NewProcessService creates a new ProcessService with the provided toolbox client.

This is typically called internally by the SDK when creating a [Sandbox](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox). Users should access ProcessService through \[Sandbox.Process\] rather than creating it directly.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-processservice-coderun) func (\*ProcessService) CodeRun

[Section titled “func (\*ProcessService) CodeRun”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-processservice-coderun)

```
func (p *ProcessService) CodeRun(ctx context.Context, code string, opts ...func(*options.CodeRun)) (*types.ExecuteResponse, error)
```

CodeRun executes code in a language-specific runtime and returns the result.

The code is executed directly by the daemon’s code-run endpoint using the specified language runtime (Python, JavaScript, or TypeScript). This is different from [ProcessService.ExecuteCommand](https://www.daytona.io/docs/en/go-sdk/daytona/#ProcessService.ExecuteCommand) which runs shell commands.

Parameters:

- code: The source code to execute
- language: The language runtime to use (e.g. \[types.CodeLanguagePython\])

Optional parameters can be configured using functional options:

- \[options.WithCodeRunParams\]: Set argv and environment variables
- \[options.WithCodeRunTimeout\]: Set execution timeout

Example:

```
// Run Python code

result, err := sandbox.Process.CodeRun(ctx, "print('Hello')", types.CodeLanguagePython)

fmt.Println(result.Result)

// Run with options

result, err := sandbox.Process.CodeRun(ctx, code, types.CodeLanguagePython,

    options.WithCodeRunParams(types.CodeRunParams{

        Argv: []string{"--verbose"},

        Env:  map[string]string{"DEBUG": "1"},

    }),

    options.WithCodeRunTimeout(30*time.Second),

)
```

Returns \[types.ExecuteResponse\] containing the output, exit code, and any artifacts (such as charts), or an error.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-processservice-connectpty) func (\*ProcessService) ConnectPty

[Section titled “func (\*ProcessService) ConnectPty”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-processservice-connectpty)

```
func (p *ProcessService) ConnectPty(ctx context.Context, sessionID string) (*PtyHandle, error)
```

ConnectPty establishes a WebSocket connection to an existing PTY session.

Returns a [PtyHandle](https://www.daytona.io/docs/en/go-sdk/daytona/#PtyHandle) for interacting with the terminal. The handle provides:

- DataChan(): Channel for receiving terminal output
- SendInput(): Method for sending keyboard input
- Resize(): Method for changing terminal size
- Disconnect(): Method for closing the connection

Parameters:

- sessionID: The PTY session to connect to

Example:

```
handle, err := sandbox.Process.ConnectPty(ctx, "my-terminal")

if err != nil {

    return err

}

defer handle.Disconnect()

// Wait for connection

if err := handle.WaitForConnection(ctx); err != nil {

    return err

}

// Read output

for data := range handle.DataChan() {

    fmt.Print(string(data))

}
```

Returns a [PtyHandle](https://www.daytona.io/docs/en/go-sdk/daytona/#PtyHandle) for terminal interaction, or an error.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-processservice-createpty) func (\*ProcessService) CreatePty

[Section titled “func (\*ProcessService) CreatePty”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-processservice-createpty)

```
func (p *ProcessService) CreatePty(ctx context.Context, id string, opts ...func(*options.CreatePty)) (*PtyHandle, error)
```

CreatePty creates a new PTY session and immediately connects to it.

This is a convenience method that combines [ProcessService.CreatePtySession](https://www.daytona.io/docs/en/go-sdk/daytona/#ProcessService.CreatePtySession) and [ProcessService.ConnectPty](https://www.daytona.io/docs/en/go-sdk/daytona/#ProcessService.ConnectPty) into a single operation.

Parameters:

- id: Unique identifier for the PTY session

Optional parameters can be configured using functional options:

- \[options.WithCreatePtySize\]: Set terminal dimensions
- \[options.WithCreatePtyEnv\]: Set environment variables

Example:

```
handle, err := sandbox.Process.CreatePty(ctx, "interactive-shell",

    options.WithCreatePtySize(types.PtySize{Rows: 24, Cols: 80}),

    options.WithCreatePtyEnv(map[string]string{"TERM": "xterm-256color"}),

)

if err != nil {

    return err

}

defer handle.Disconnect()

// Wait for connection

if err := handle.WaitForConnection(ctx); err != nil {

    return err

}

// Send a command

handle.SendInput([]byte("ls -la\n"))

// Read output

for data := range handle.DataChan() {

    fmt.Print(string(data))

}
```

Returns a [PtyHandle](https://www.daytona.io/docs/en/go-sdk/daytona/#PtyHandle) for terminal interaction, or an error.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-processservice-createptysession) func (\*ProcessService) CreatePtySession

[Section titled “func (\*ProcessService) CreatePtySession”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-processservice-createptysession)

```
func (p *ProcessService) CreatePtySession(ctx context.Context, id string, opts ...func(*options.PtySession)) (*types.PtySessionInfo, error)
```

CreatePtySession creates a PTY (pseudo-terminal) session.

A PTY session provides a terminal interface for interactive applications. Use [ProcessService.ConnectPty](https://www.daytona.io/docs/en/go-sdk/daytona/#ProcessService.ConnectPty) to connect to the session after creation.

Parameters:

- id: Unique identifier for the session

Optional parameters can be configured using functional options:

- \[options.WithPtySize\]: Set terminal dimensions (rows and columns)
- \[options.WithPtyEnv\]: Set environment variables

Example:

```
// Create with default settings

session, err := sandbox.Process.CreatePtySession(ctx, "my-terminal")

// Create with custom size

session, err := sandbox.Process.CreatePtySession(ctx, "my-terminal",

    options.WithPtySize(types.PtySize{Rows: 24, Cols: 80}),

)
```

Returns \[types.PtySessionInfo\] containing session details, or an error.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-processservice-createsession) func (\*ProcessService) CreateSession

[Section titled “func (\*ProcessService) CreateSession”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-processservice-createsession)

```
func (p *ProcessService) CreateSession(ctx context.Context, sessionID string) error
```

CreateSession creates a named session for executing multiple commands.

Sessions allow you to execute multiple commands while maintaining state (like environment variables and working directory) between commands.

Example:

```
// Create a session

err := sandbox.Process.CreateSession(ctx, "my-session")

if err != nil {

    return err

}

defer sandbox.Process.DeleteSession(ctx, "my-session")

// Execute commands in the session

result, err := sandbox.Process.ExecuteSessionCommand(ctx, "my-session", "cd /home/user", false)

result, err = sandbox.Process.ExecuteSessionCommand(ctx, "my-session", "pwd", false)
```

Returns an error if session creation fails.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-processservice-deletesession) func (\*ProcessService) DeleteSession

[Section titled “func (\*ProcessService) DeleteSession”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-processservice-deletesession)

```
func (p *ProcessService) DeleteSession(ctx context.Context, sessionID string) error
```

DeleteSession removes a session and releases its resources.

The sessionID parameter identifies the session to delete.

Example:

```
err := sandbox.Process.DeleteSession(ctx, "my-session")
```

Returns an error if the session doesn’t exist or deletion fails.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-processservice-executecommand) func (\*ProcessService) ExecuteCommand

[Section titled “func (\*ProcessService) ExecuteCommand”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-processservice-executecommand)

```
func (p *ProcessService) ExecuteCommand(ctx context.Context, command string, opts ...func(*options.ExecuteCommand)) (*types.ExecuteResponse, error)
```

ExecuteCommand executes a shell command and returns the result.

The command is executed in a shell context. For complex commands, consider using proper shell escaping or wrapping in a script.

Optional parameters can be configured using functional options:

- \[options.WithCwd\]: Set the working directory for command execution
- \[options.WithCommandEnv\]: Set environment variables
- \[options.WithExecuteTimeout\]: Set execution timeout

Example:

```
// Simple command

result, err := sandbox.Process.ExecuteCommand(ctx, "echo 'Hello'")

if err != nil {

    return err

}

fmt.Println(result.Result)

// Command with options

result, err := sandbox.Process.ExecuteCommand(ctx, "npm install",

    options.WithCwd("/home/user/project"),

    options.WithExecuteTimeout(5*time.Minute),

)

// Check exit code

if result.ExitCode != 0 {

    fmt.Printf("Command failed with exit code %d\n", result.ExitCode)

}
```

Returns \[types.ExecuteResponse\] containing the output and exit code, or an error.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-processservice-executesessioncommand) func (\*ProcessService) ExecuteSessionCommand

[Section titled “func (\*ProcessService) ExecuteSessionCommand”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-processservice-executesessioncommand)

```
func (p *ProcessService) ExecuteSessionCommand(ctx context.Context, sessionID, command string, runAsync bool, suppressInputEcho bool) (map[string]any, error)
```

ExecuteSessionCommand executes a command within a session.

Parameters:

- sessionID: The session to execute the command in
- command: The command to execute
- runAsync: If true, return immediately without waiting for completion
- suppressInputEcho: If true, suppress input echo

When runAsync is true, use [ProcessService.GetSessionCommand](https://www.daytona.io/docs/en/go-sdk/daytona/#ProcessService.GetSessionCommand) to check status and [ProcessService.GetSessionCommandLogs](https://www.daytona.io/docs/en/go-sdk/daytona/#ProcessService.GetSessionCommandLogs) to retrieve output.

Example:

```
// Synchronous execution

result, err := sandbox.Process.ExecuteSessionCommand(ctx, "my-session", "ls -la", false)

if err != nil {

    return err

}

fmt.Println(result["stdout"])

// Asynchronous execution

result, err := sandbox.Process.ExecuteSessionCommand(ctx, "my-session", "long-running-cmd", true)

cmdID := result["id"].(string)

// Later: check status with GetSessionCommand(ctx, "my-session", cmdID)
```

Returns command result including id, exitCode (if completed), stdout, and stderr.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-processservice-getentrypointlogs) func (\*ProcessService) GetEntrypointLogs

[Section titled “func (\*ProcessService) GetEntrypointLogs”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-processservice-getentrypointlogs)

```
func (p *ProcessService) GetEntrypointLogs(ctx context.Context) (*toolbox.SessionCommandLogsResponse, error)
```

GetEntrypointLogs retrieves the output logs of the sandbox entrypoint.

Example:

```
logs, err := sandbox.Process.GetEntrypointLogs(ctx)

if err != nil {

    return err

}

fmt.Println(logs)
```

Returns a string containing the entrypoint command output logs.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-processservice-getentrypointlogsstream) func (\*ProcessService) GetEntrypointLogsStream

[Section titled “func (\*ProcessService) GetEntrypointLogsStream”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-processservice-getentrypointlogsstream)

```
func (p *ProcessService) GetEntrypointLogsStream(ctx context.Context, stdout, stderr chan<- string) error
```

GetEntrypointLogsStream streams entrypoint logs as they become available.

This method establishes a WebSocket connection to stream sandbox entrypoint logs in real-time. The stdout and stderr channels receive log chunks as strings and are closed when the stream ends or an error occurs.

Parameters:

- stdout: Channel to receive stdout output
- stderr: Channel to receive stderr output

The caller should provide buffered channels to avoid blocking.

Example:

```
stdout := make(chan string, 100)

stderr := make(chan string, 100)

go func() {

    err := sandbox.Process.GetEntrypointLogsStream(ctx, stdout, stderr)

    if err != nil {

        log.Printf("Stream error: %v", err)

    }

}()

for {

    select {

    case chunk, ok := <-stdout:

        if !ok {

            stdout = nil

        } else {

            fmt.Print(chunk)

        }

    case chunk, ok := <-stderr:

        if !ok {

            stderr = nil

        } else {

            fmt.Fprint(os.Stderr, chunk)

        }

    }

    if stdout == nil && stderr == nil {

        break

    }

}
```

Returns an error if the connection fails or stream encounters an error.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-processservice-getentrypointsession) func (\*ProcessService) GetEntrypointSession

[Section titled “func (\*ProcessService) GetEntrypointSession”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-processservice-getentrypointsession)

```
func (p *ProcessService) GetEntrypointSession(ctx context.Context) (*toolbox.Session, error)
```

GetEntrypointSession retrieves information about the entrypoint session.

Returns an entrypoint session information containing:

- SessionId: The entrypoint session identifier
- Commands: List of commands executed in the entrypoint session

Example:

```
info, err := sandbox.Process.GetEntrypointSession(ctx)

if err != nil {

    return err

}

fmt.Printf("Session: %s\n", info.SessionId)
```

Returns an error if the session doesn’t exist.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-processservice-getptysessioninfo) func (\*ProcessService) GetPtySessionInfo

[Section titled “func (\*ProcessService) GetPtySessionInfo”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-processservice-getptysessioninfo)

```
func (p *ProcessService) GetPtySessionInfo(ctx context.Context, sessionID string) (*types.PtySessionInfo, error)
```

GetPtySessionInfo retrieves information about a PTY session.

Parameters:

- sessionID: The PTY session identifier

Example:

```
info, err := sandbox.Process.GetPtySessionInfo(ctx, "my-terminal")

if err != nil {

    return err

}

fmt.Printf("Terminal size: %dx%d\n", info.Cols, info.Rows)
```

Returns \[types.PtySessionInfo\] with session details, or an error.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-processservice-getsession) func (\*ProcessService) GetSession

[Section titled “func (\*ProcessService) GetSession”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-processservice-getsession)

```
func (p *ProcessService) GetSession(ctx context.Context, sessionID string) (map[string]any, error)
```

GetSession retrieves information about a session.

The sessionID parameter identifies the session to query.

Returns a map containing:

- sessionId: The session identifier
- commands: List of commands executed in the session

Example:

```
info, err := sandbox.Process.GetSession(ctx, "my-session")

if err != nil {

    return err

}

fmt.Printf("Session: %s\n", info["sessionId"])
```

Returns an error if the session doesn’t exist.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-processservice-getsessioncommand) func (\*ProcessService) GetSessionCommand

[Section titled “func (\*ProcessService) GetSessionCommand”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-processservice-getsessioncommand)

```
func (p *ProcessService) GetSessionCommand(ctx context.Context, sessionID, commandID string) (map[string]any, error)
```

GetSessionCommand retrieves the status of a command in a session.

Parameters:

- sessionID: The session containing the command
- commandID: The command identifier (from ExecuteSessionCommand result)

Example:

```
status, err := sandbox.Process.GetSessionCommand(ctx, "my-session", cmdID)

if err != nil {

    return err

}

if exitCode, ok := status["exitCode"]; ok {

    fmt.Printf("Command completed with exit code: %v\n", exitCode)

} else {

    fmt.Println("Command still running")

}
```

Returns command status including id, command text, and exitCode (if completed).

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-processservice-getsessioncommandlogs) func (\*ProcessService) GetSessionCommandLogs

[Section titled “func (\*ProcessService) GetSessionCommandLogs”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-processservice-getsessioncommandlogs)

```
func (p *ProcessService) GetSessionCommandLogs(ctx context.Context, sessionID, commandID string) (*toolbox.SessionCommandLogsResponse, error)
```

GetSessionCommandLogs retrieves the output logs of a command.

Parameters:

- sessionID: The session containing the command
- commandID: The command identifier

Example:

```
logs, err := sandbox.Process.GetSessionCommandLogs(ctx, "my-session", cmdID)

if err != nil {

    return err

}

fmt.Println(logs["logs"])
```

Returns a map containing the “logs” key with command output.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-processservice-getsessioncommandlogsstream) func (\*ProcessService) GetSessionCommandLogsStream

[Section titled “func (\*ProcessService) GetSessionCommandLogsStream”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-processservice-getsessioncommandlogsstream)

```
func (p *ProcessService) GetSessionCommandLogsStream(ctx context.Context, sessionID, commandID string, stdout, stderr chan<- string) error
```

GetSessionCommandLogsStream streams command logs as they become available.

This method establishes a WebSocket connection to stream logs in real-time. The stdout and stderr channels receive log chunks as strings and are closed when the stream ends or an error occurs.

Parameters:

- sessionID: The session containing the command
- commandID: The command identifier
- stdout: Channel to receive stdout output
- stderr: Channel to receive stderr output

The caller should provide buffered channels to avoid blocking.

Example:

```
stdout := make(chan string, 100)

stderr := make(chan string, 100)

go func() {

    err := sandbox.Process.GetSessionCommandLogsStream(ctx, "session", "cmd", stdout, stderr)

    if err != nil {

        log.Printf("Stream error: %v", err)

    }

}()

for {

    select {

    case chunk, ok := <-stdout:

        if !ok {

            stdout = nil

        } else {

            fmt.Print(chunk)

        }

    case chunk, ok := <-stderr:

        if !ok {

            stderr = nil

        } else {

            fmt.Fprint(os.Stderr, chunk)

        }

    }

    if stdout == nil && stderr == nil {

        break

    }

}
```

Returns an error if the connection fails or stream encounters an error.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-processservice-killptysession) func (\*ProcessService) KillPtySession

[Section titled “func (\*ProcessService) KillPtySession”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-processservice-killptysession)

```
func (p *ProcessService) KillPtySession(ctx context.Context, sessionID string) error
```

KillPtySession terminates a PTY session.

This ends the terminal session and any processes running in it.

Parameters:

- sessionID: The PTY session to terminate

Example:

```
err := sandbox.Process.KillPtySession(ctx, "my-terminal")
```

Returns an error if the session doesn’t exist or termination fails.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-processservice-listptysessions) func (\*ProcessService) ListPtySessions

[Section titled “func (\*ProcessService) ListPtySessions”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-processservice-listptysessions)

```
func (p *ProcessService) ListPtySessions(ctx context.Context) ([]*types.PtySessionInfo, error)
```

ListPtySessions returns all active PTY sessions.

Example:

```
sessions, err := sandbox.Process.ListPtySessions(ctx)

if err != nil {

    return err

}

for _, session := range sessions {

    fmt.Printf("PTY: %s (%dx%d)\n", session.ID, session.Cols, session.Rows)

}
```

Returns a slice of \[types.PtySessionInfo\], or an error.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-processservice-listsessions) func (\*ProcessService) ListSessions

[Section titled “func (\*ProcessService) ListSessions”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-processservice-listsessions)

```
func (p *ProcessService) ListSessions(ctx context.Context) ([]map[string]any, error)
```

ListSessions returns all active sessions.

Example:

```
sessions, err := sandbox.Process.ListSessions(ctx)

if err != nil {

    return err

}

for _, session := range sessions {

    fmt.Printf("Session: %s\n", session["sessionId"])

}
```

Returns a slice of session information maps, or an error.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-processservice-resizeptysession) func (\*ProcessService) ResizePtySession

[Section titled “func (\*ProcessService) ResizePtySession”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-processservice-resizeptysession)

```
func (p *ProcessService) ResizePtySession(ctx context.Context, sessionID string, ptySize types.PtySize) (*types.PtySessionInfo, error)
```

ResizePtySession changes the terminal dimensions of a PTY session.

This sends a SIGWINCH signal to applications, notifying them of the size change.

Parameters:

- sessionID: The PTY session to resize
- ptySize: New terminal dimensions

Example:

```
newSize := types.PtySize{Rows: 40, Cols: 120}

info, err := sandbox.Process.ResizePtySession(ctx, "my-terminal", newSize)

if err != nil {

    return err

}

fmt.Printf("New size: %dx%d\n", info.Cols, info.Rows)
```

Returns updated \[types.PtySessionInfo\], or an error.

## [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#type-ptyhandle) type PtyHandle

[Section titled “type PtyHandle”](https://www.daytona.io/docs/en/go-sdk/daytona/#type-ptyhandle)

PtyHandle manages a WebSocket connection to a PTY (pseudo-terminal) session.

PtyHandle provides methods for sending input, receiving output via channels, resizing the terminal, and managing the connection lifecycle. It implements [io.Reader](https://pkg.go.dev/io/#Reader) and [io.Writer](https://pkg.go.dev/io/#Writer) interfaces for integration with standard Go I/O.

Create a PtyHandle using [ProcessService.CreatePty](https://www.daytona.io/docs/en/go-sdk/daytona/#ProcessService.CreatePty).

Example:

```
// Create a PTY session

handle, err := sandbox.Process.CreatePty(ctx, "my-pty", nil)

if err != nil {

    return err

}

defer handle.Disconnect()

// Wait for connection to be established

if err := handle.WaitForConnection(ctx); err != nil {

    return err

}

// Send input

handle.SendInput([]byte("ls -la\n"))

// Read output from channel

for data := range handle.DataChan() {

    fmt.Print(string(data))

}

// Or use as io.Reader

io.Copy(os.Stdout, handle)
```

```
type PtyHandle struct {

    // contains filtered or unexported fields

}
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-ptyhandle-datachan) func (\*PtyHandle) DataChan

[Section titled “func (\*PtyHandle) DataChan”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-ptyhandle-datachan)

```
func (h *PtyHandle) DataChan() <-chan []byte
```

DataChan returns a channel for receiving PTY output.

The channel receives raw bytes from the terminal. It is closed when the PTY session ends or the connection is closed.

Example:

```
for data := range handle.DataChan() {

    fmt.Print(string(data))

}
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-ptyhandle-disconnect) func (\*PtyHandle) Disconnect

[Section titled “func (\*PtyHandle) Disconnect”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-ptyhandle-disconnect)

```
func (h *PtyHandle) Disconnect() error
```

Disconnect closes the WebSocket connection and releases resources.

Call this when done with the PTY session. This does not terminate the underlying process - use [PtyHandle.Kill](https://www.daytona.io/docs/en/go-sdk/daytona/#PtyHandle.Kill) for that.

Example:

```
defer handle.Disconnect()
```

Returns an error if the WebSocket close fails.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-ptyhandle-error) func (\*PtyHandle) Error

[Section titled “func (\*PtyHandle) Error”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-ptyhandle-error)

```
func (h *PtyHandle) Error() *string
```

Error returns the error message if the PTY session failed, or nil otherwise.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-ptyhandle-exitcode) func (\*PtyHandle) ExitCode

[Section titled “func (\*PtyHandle) ExitCode”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-ptyhandle-exitcode)

```
func (h *PtyHandle) ExitCode() *int
```

ExitCode returns the exit code of the PTY process, or nil if still running.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-ptyhandle-isconnected) func (\*PtyHandle) IsConnected

[Section titled “func (\*PtyHandle) IsConnected”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-ptyhandle-isconnected)

```
func (h *PtyHandle) IsConnected() bool
```

IsConnected returns true if the WebSocket connection is active.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-ptyhandle-kill) func (\*PtyHandle) Kill

[Section titled “func (\*PtyHandle) Kill”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-ptyhandle-kill)

```
func (h *PtyHandle) Kill(ctx context.Context) error
```

Kill terminates the PTY session and its associated process.

This operation is irreversible. The process receives a SIGKILL signal and terminates immediately.

Example:

```
err := handle.Kill(ctx)
```

Returns an error if the kill operation fails.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-ptyhandle-read) func (\*PtyHandle) Read

[Section titled “func (\*PtyHandle) Read”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-ptyhandle-read)

```
func (h *PtyHandle) Read(p []byte) (n int, err error)
```

Read implements [io.Reader](https://pkg.go.dev/io/#Reader) for reading PTY output.

This method blocks until data is available or the PTY closes (returns [io.EOF](https://pkg.go.dev/io/#EOF)). Use with [io.Copy](https://pkg.go.dev/io/#Copy), [bufio.Scanner](https://pkg.go.dev/bufio/#Scanner), or any standard Go I/O utilities.

Example:

```
// Copy all output to stdout

io.Copy(os.Stdout, handle)

// Use with bufio.Scanner

scanner := bufio.NewScanner(handle)

for scanner.Scan() {

    fmt.Println(scanner.Text())

}
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-ptyhandle-resize) func (\*PtyHandle) Resize

[Section titled “func (\*PtyHandle) Resize”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-ptyhandle-resize)

```
func (h *PtyHandle) Resize(ctx context.Context, cols, rows int) (*types.PtySessionInfo, error)
```

Resize changes the PTY terminal dimensions.

This notifies terminal applications about the new dimensions via SIGWINCH signal. Call this when the terminal display size changes.

Parameters:

- cols: Number of columns (width in characters)
- rows: Number of rows (height in characters)

Example:

```
info, err := handle.Resize(ctx, 120, 40)
```

Returns updated \[types.PtySessionInfo\] or an error.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-ptyhandle-sendinput) func (\*PtyHandle) SendInput

[Section titled “func (\*PtyHandle) SendInput”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-ptyhandle-sendinput)

```
func (h *PtyHandle) SendInput(data []byte) error
```

SendInput sends input data to the PTY session.

The data is sent as raw bytes and will be processed as if typed in the terminal. Use this to send commands, keystrokes, or any terminal input.

Example:

```
// Send a command

handle.SendInput([]byte("ls -la\n"))

// Send Ctrl+C

handle.SendInput([]byte{0x03})
```

Returns an error if the PTY is not connected or sending fails.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-ptyhandle-sessionid) func (\*PtyHandle) SessionID

[Section titled “func (\*PtyHandle) SessionID”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-ptyhandle-sessionid)

```
func (h *PtyHandle) SessionID() string
```

SessionID returns the unique identifier for this PTY session.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-ptyhandle-wait) func (\*PtyHandle) Wait

[Section titled “func (\*PtyHandle) Wait”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-ptyhandle-wait)

```
func (h *PtyHandle) Wait(ctx context.Context) (*types.PtyResult, error)
```

Wait blocks until the PTY process exits and returns the result.

Example:

```
result, err := handle.Wait(ctx)

if err != nil {

    return err

}

if result.ExitCode != nil {

    fmt.Printf("Process exited with code: %d\n", *result.ExitCode)

}
```

Returns \[types.PtyResult\] with exit code and any error, or an error if the context is cancelled.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-ptyhandle-waitforconnection) func (\*PtyHandle) WaitForConnection

[Section titled “func (\*PtyHandle) WaitForConnection”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-ptyhandle-waitforconnection)

```
func (h *PtyHandle) WaitForConnection(ctx context.Context) error
```

WaitForConnection waits for the WebSocket connection to be established.

This method blocks until the PTY session is ready to receive input and send output, or until a timeout (10 seconds) expires. Always call this after creating a PTY to ensure the connection is ready.

Example:

```
handle, _ := sandbox.Process.CreatePty(ctx, "my-pty", nil)

if err := handle.WaitForConnection(ctx); err != nil {

    return fmt.Errorf("PTY connection failed: %w", err)

}
```

Returns an error if the connection times out or fails.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-ptyhandle-write) func (\*PtyHandle) Write

[Section titled “func (\*PtyHandle) Write”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-ptyhandle-write)

```
func (h *PtyHandle) Write(p []byte) (n int, err error)
```

Write implements [io.Writer](https://pkg.go.dev/io/#Writer) for sending input to the PTY.

Example:

```
// Write directly

handle.Write([]byte("echo hello\n"))

// Use with io.Copy

io.Copy(handle, strings.NewReader("echo hello\n"))
```

## [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#type-pushaccesscredentials) type PushAccessCredentials

[Section titled “type PushAccessCredentials”](https://www.daytona.io/docs/en/go-sdk/daytona/#type-pushaccesscredentials)

PushAccessCredentials holds temporary credentials for uploading to object storage.

These credentials are obtained from the API and used for uploading build contexts when creating snapshots with custom [DockerImage](https://www.daytona.io/docs/en/go-sdk/daytona/#DockerImage) definitions.

```
type PushAccessCredentials struct {

    StorageURL     string `json:"storageUrl"`

    AccessKey      string `json:"accessKey"`

    Secret         string `json:"secret"`

    SessionToken   string `json:"sessionToken"`

    Bucket         string `json:"bucket"`

    OrganizationID string `json:"organizationId"`

    Region         string `json:"region"`

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#type-recordingservice) type RecordingService

[Section titled “type RecordingService”](https://www.daytona.io/docs/en/go-sdk/daytona/#type-recordingservice)

RecordingService provides screen recording operations.

RecordingService enables starting, stopping, and managing screen recordings. Access through [ComputerUseService.Recording](https://www.daytona.io/docs/en/go-sdk/daytona/#ComputerUseService.Recording).

```
type RecordingService struct {

    // contains filtered or unexported fields

}
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-newrecordingservice) func NewRecordingService

[Section titled “func NewRecordingService”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-newrecordingservice)

```
func NewRecordingService(toolboxClient *toolbox.APIClient) *RecordingService
```

NewRecordingService creates a new RecordingService.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-recordingservice-delete) func (\*RecordingService) Delete

[Section titled “func (\*RecordingService) Delete”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-recordingservice-delete)

```
func (r *RecordingService) Delete(ctx context.Context, id string) error
```

Delete deletes a recording by ID.

Parameters:

- id: The ID of the recording to delete

Example:

```
err := cu.Recording().Delete(ctx, recordingID)

if err != nil {

    return err

}

fmt.Println("Recording deleted")
```

Returns an error if the deletion fails.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-recordingservice-download) func (\*RecordingService) Download

[Section titled “func (\*RecordingService) Download”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-recordingservice-download)

```
func (r *RecordingService) Download(ctx context.Context, id string, localPath string) error
```

Download downloads a recording file and saves it to a local path.

The file is streamed directly to disk without loading the entire content into memory.

Parameters:

- id: The ID of the recording to download
- localPath: Path to save the recording file locally

Example:

```
err := cu.Recording().Download(ctx, recordingID, "local_recording.mp4")

if err != nil {

    return err

}

fmt.Println("Recording downloaded")
```

Returns an error if the download fails.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-recordingservice-get) func (\*RecordingService) Get

[Section titled “func (\*RecordingService) Get”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-recordingservice-get)

```
func (r *RecordingService) Get(ctx context.Context, id string) (*toolbox.Recording, error)
```

Get gets details of a specific recording by ID.

Parameters:

- id: The ID of the recording to retrieve

Example:

```
recording, err := cu.Recording().Get(ctx, recordingID)

if err != nil {

    return err

}

fmt.Printf("Recording: %s\n", recording.GetFileName())

fmt.Printf("Status: %s\n", recording.GetStatus())

fmt.Printf("Duration: %v seconds\n", recording.GetDurationSeconds())
```

Returns \[toolbox.Recording\] with recording details.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-recordingservice-list) func (\*RecordingService) List

[Section titled “func (\*RecordingService) List”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-recordingservice-list)

```
func (r *RecordingService) List(ctx context.Context) (*toolbox.ListRecordingsResponse, error)
```

List lists all recordings (active and completed).

Example:

```
recordings, err := cu.Recording().List(ctx)

if err != nil {

    return err

}

fmt.Printf("Found %d recordings\n", len(recordings.GetRecordings()))

for _, rec := range recordings.GetRecordings() {

    fmt.Printf("- %s: %s\n", rec.GetFileName(), rec.GetStatus())

}
```

Returns \[toolbox.ListRecordingsResponse\] with all recordings.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-recordingservice-start) func (\*RecordingService) Start

[Section titled “func (\*RecordingService) Start”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-recordingservice-start)

```
func (r *RecordingService) Start(ctx context.Context, label *string) (*toolbox.Recording, error)
```

Start starts a new screen recording session.

Parameters:

- label: Optional custom label for the recording

Example:

```
// Start a recording with a label

recording, err := cu.Recording().Start(ctx, stringPtr("my-test-recording"))

if err != nil {

    return err

}

fmt.Printf("Recording started: %s\n", recording.GetId())

fmt.Printf("File: %s\n", recording.GetFilePath())
```

Returns \[toolbox.Recording\] with recording details.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-recordingservice-stop) func (\*RecordingService) Stop

[Section titled “func (\*RecordingService) Stop”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-recordingservice-stop)

```
func (r *RecordingService) Stop(ctx context.Context, id string) (*toolbox.Recording, error)
```

Stop stops an active screen recording session.

Parameters:

- id: The ID of the recording to stop

Example:

```
result, err := cu.Recording().Stop(ctx, recordingID)

if err != nil {

    return err

}

fmt.Printf("Recording stopped: %v seconds\n", result.GetDurationSeconds())

fmt.Printf("Saved to: %s\n", result.GetFilePath())
```

Returns \[toolbox.Recording\] with recording details.

## [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#type-sandbox) type Sandbox

[Section titled “type Sandbox”](https://www.daytona.io/docs/en/go-sdk/daytona/#type-sandbox)

Sandbox represents a Daytona sandbox environment.

A Sandbox provides an isolated development environment with file system, git, process execution, code interpretation, and desktop automation capabilities. Sandboxes can be started, stopped, archived, and deleted.

Access sandbox capabilities through the service fields:

- FileSystem: File and directory operations
- Git: Git repository operations
- Process: Command execution and PTY sessions
- CodeInterpreter: Python code execution
- ComputerUse: Desktop automation (mouse, keyboard, screenshots)

Language Server Protocol (LSP) servers are created on demand via [Sandbox.CreateLspServer](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox.CreateLspServer).

Example:

```
// Create and use a sandbox

sandbox, err := client.Create(ctx)

if err != nil {

    return err

}

defer sandbox.Delete(ctx)

// Execute a command

result, err := sandbox.Process.ExecuteCommand(ctx, "echo 'Hello'")

// Work with files

err = sandbox.FileSystem.UploadFile(ctx, "local.txt", "/home/user/remote.txt")
```

```
type Sandbox struct {

    ToolboxClient *toolbox.APIClient // Internal API client

    ID             string                 // Unique sandbox identifier

    Name           string                 // Human-readable sandbox name

    OrganizationId string                 // Organization ID of the sandbox

    Snapshot       *string                // Daytona snapshot used to create the sandbox

    User           string                 // OS user running in the sandbox

    Labels         map[string]string      // Custom labels attached to the sandbox

    Public         bool                   // Whether the sandbox is publicly accessible

    Target         string                 // Target region/environment where the sandbox runs

    Cpu            float32                // Number of CPUs allocated to the sandbox

    Gpu            float32                // Number of GPUs allocated to the sandbox

    Memory         float32                // Amount of memory allocated to the sandbox in GiB

    Disk           float32                // Amount of disk space allocated to the sandbox in GiB

    State          apiclient.SandboxState // Current sandbox state

    ErrorReason    *string                // Error message if the sandbox is in an error state

    Recoverable    *bool                  // Whether the sandbox error is recoverable

    BackupState    *string                // Current state of the sandbox backup

    // AutoStopInterval is the time in minutes of inactivity before auto-stopping.

    // 0 means disabled.

    AutoStopInterval int

    // AutoPauseInterval is the time in minutes of inactivity before auto-pausing.

    // 0 means disabled. Only supported for sandbox classes that support pausing.

    // Mutually exclusive with AutoStopInterval.

    AutoPauseInterval int

    // AutoArchiveInterval is the time in minutes after stopping before auto-archiving.

    // Set to 0 to disable auto-archiving.

    AutoArchiveInterval int

    // AutoDeleteInterval is the time in minutes after stopping before auto-deletion.

    // Set to -1 to disable auto-deletion.

    // Set to 0 to delete immediately upon stopping.

    AutoDeleteInterval int

    CreatedAt       *string // When the sandbox was created

    UpdatedAt       *string // When the sandbox was last updated

    LastActivityAt  *string // When the sandbox last had activity

    ToolboxProxyUrl string  // Toolbox proxy URL for the sandbox

    AutoDestroyAt   *string // When the sandbox will be automatically destroyed (based on TTL)

    // Env contains environment variables set in the sandbox.

    // Not populated by [Client.List]; call [Sandbox.RefreshData] on each item to populate.

    Env map[string]string

    // BackupCreatedAt is the timestamp of the last backup.

    // Not populated by [Client.List]; call [Sandbox.RefreshData] on each item to populate.

    BackupCreatedAt *string

    // Volumes attached to the sandbox.

    // Not populated by [Client.List]; call [Sandbox.RefreshData] on each item to populate.

    Volumes []apiclient.SandboxVolume

    // BuildInfo contains build information for the sandbox if it was created from a dynamic build.

    // Not populated by [Client.List]; call [Sandbox.RefreshData] on each item to populate.

    BuildInfo *apiclient.BuildInfo

    // NetworkBlockAll blocks all network access when true. Nil when not populated.

    // Not populated by [Client.List]; call [Sandbox.RefreshData] on each item to populate.

    NetworkBlockAll *bool

    // NetworkAllowList is a comma-separated list of allowed CIDR addresses.

    // Not populated by [Client.List]; call [Sandbox.RefreshData] on each item to populate.

    NetworkAllowList *string

    // DomainAllowList is a comma-separated list of allowed domains.

    // Not populated by [Client.List]; call [Sandbox.RefreshData] on each item to populate.

    DomainAllowList *string

    FileSystem      *FileSystemService      // File system operations

    Git             *GitService             // Git operations

    Process         *ProcessService         // Process and PTY operations

    CodeInterpreter *CodeInterpreterService // Python code execution

    ComputerUse     *ComputerUseService     // Desktop automation

    // contains filtered or unexported fields

}
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-newsandbox) func NewSandbox

[Section titled “func NewSandbox”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-newsandbox)

```
func NewSandbox(client *Client, toolboxClient *toolbox.APIClient, dto sandboxDTO, language types.CodeLanguage, subscriptionManager *common.EventSubscriptionManager) *Sandbox
```

NewSandbox creates a new Sandbox instance from an API DTO.

dto may be either \*\[apiclient.Sandbox\] (returned by single-sandbox endpoints such as Create, Get, Fork, RefreshData) or \*\[apiclient.SandboxListItem\] (returned by the list endpoint). When dto is a \*\[apiclient.SandboxListItem\], the fields documented as “Not populated by [Client.List](https://www.daytona.io/docs/en/go-sdk/daytona/#Client.List)” remain at their zero values; call [Sandbox.RefreshData](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox.RefreshData) to populate them.

This is typically called internally by the SDK. Users should obtain sandboxes via [Client.Create](https://www.daytona.io/docs/en/go-sdk/daytona/#Client.Create), [Client.Get](https://www.daytona.io/docs/en/go-sdk/daytona/#Client.Get), or [Client.List](https://www.daytona.io/docs/en/go-sdk/daytona/#Client.List) rather than calling this directly.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-sandbox-archive) func (\*Sandbox) Archive

[Section titled “func (\*Sandbox) Archive”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-sandbox-archive)

```
func (s *Sandbox) Archive(ctx context.Context) error
```

Archive archives the sandbox, preserving its state in cost-effective storage.

When sandboxes are archived, the entire filesystem state is moved to object storage, making it possible to keep sandboxes available for extended periods at reduced cost. Use [Sandbox.Start](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox.Start) to unarchive and resume.

Example:

```
err := sandbox.Archive(ctx)

if err != nil {

    return err

}

// Sandbox is now archived and can be restored later
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-sandbox-createlspserver) func (\*Sandbox) CreateLspServer

[Section titled “func (\*Sandbox) CreateLspServer”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-sandbox-createlspserver)

```
func (s *Sandbox) CreateLspServer(languageID types.LspLanguageID, pathToProject string) *LspServerService
```

CreateLspServer creates a Language Server Protocol (LSP) server scoped to a language and project path within the sandbox.

The returned [LspServerService](https://www.daytona.io/docs/en/go-sdk/daytona/#LspServerService) must be started with [LspServerService.Start](https://www.daytona.io/docs/en/go-sdk/daytona/#LspServerService.Start) before use, and stopped with [LspServerService.Stop](https://www.daytona.io/docs/en/go-sdk/daytona/#LspServerService.Stop) when finished.

Example:

```
lsp := sandbox.CreateLspServer(types.LspLanguagePython, "/home/user/project")

if err := lsp.Start(ctx); err != nil {

    return err

}

defer lsp.Stop(ctx)
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-sandbox-createsnapshot) func (\*Sandbox) CreateSnapshot

[Section titled “func (\*Sandbox) CreateSnapshot”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-sandbox-createsnapshot)

```
func (s *Sandbox) CreateSnapshot(ctx context.Context, name string) error
```

CreateSnapshot creates a snapshot from the current state of the sandbox with a default timeout of 60 seconds.

This captures the sandbox’s filesystem into a reusable snapshot that can be used to create new sandboxes. The sandbox will temporarily enter a ‘snapshotting’ state and return to its previous state when complete.

Example:

```
err := sandbox.CreateSnapshot(ctx, "my-snapshot")

if err != nil {

    return err

}
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-sandbox-createsnapshotwithtimeout) func (\*Sandbox) CreateSnapshotWithTimeout

[Section titled “func (\*Sandbox) CreateSnapshotWithTimeout”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-sandbox-createsnapshotwithtimeout)

```
func (s *Sandbox) CreateSnapshotWithTimeout(ctx context.Context, name string, timeout time.Duration) error
```

CreateSnapshotWithTimeout creates a snapshot from the current state of the sandbox with a custom timeout. 0 means no timeout.

Example:

```
err := sandbox.CreateSnapshotWithTimeout(ctx, "my-snapshot", 2*time.Minute)
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-sandbox-delete) func (\*Sandbox) Delete

[Section titled “func (\*Sandbox) Delete”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-sandbox-delete)

```
func (s *Sandbox) Delete(ctx context.Context) error
```

Delete deletes the sandbox with a default timeout of 60 seconds.

The method issues the delete API call and returns immediately without waiting for the sandbox to reach the “destroyed” state. This matches the historical behavior. Use [Sandbox.DeleteAndWait](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox.DeleteAndWait) to block until destruction.

Example:

```
err := sandbox.Delete(ctx)
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-sandbox-deleteandwait) func (\*Sandbox) DeleteAndWait

[Section titled “func (\*Sandbox) DeleteAndWait”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-sandbox-deleteandwait)

```
func (s *Sandbox) DeleteAndWait(ctx context.Context, timeout time.Duration) error
```

DeleteAndWait deletes the sandbox and blocks until it reaches the “destroyed” state or the timeout is exceeded. 0 means no timeout.

Example:

```
err := sandbox.DeleteAndWait(ctx, 60*time.Second)
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-sandbox-deletewithtimeout) func (\*Sandbox) DeleteWithTimeout

[Section titled “func (\*Sandbox) DeleteWithTimeout”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-sandbox-deletewithtimeout)

```
func (s *Sandbox) DeleteWithTimeout(ctx context.Context, timeout time.Duration) error
```

DeleteWithTimeout deletes the sandbox with a custom timeout for the API call. 0 means no timeout.

Like [Sandbox.Delete](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox.Delete), this returns as soon as the API call completes without waiting for the “destroyed” state. Use [Sandbox.DeleteAndWait](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox.DeleteAndWait) to block until destruction.

Example:

```
err := sandbox.DeleteWithTimeout(ctx, 2*time.Minute)
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-sandbox-downloadurl) func (\*Sandbox) DownloadURL

[Section titled “func (\*Sandbox) DownloadURL”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-sandbox-downloadurl)

```
func (s *Sandbox) DownloadURL(ctx context.Context, path string, ttlSeconds *int) (string, error)
```

DownloadURL creates a pre-signed URL for downloading a file from the sandbox. The URL works with any HTTP client without auth headers and stays valid across sandbox restarts (downloads succeed only while the sandbox is running). The signing key is cached locally for up to 15 seconds; if the key was rotated from another client, URLs may be rejected until the cache refreshes.

```
url, err := sandbox.DownloadURL(ctx, "/home/user/report.pdf", nil)

// curl "$url" -o report.pdf
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-sandbox-experimentalcreatesnapshot) func (\*Sandbox) ExperimentalCreateSnapshot

[Section titled “func (\*Sandbox) ExperimentalCreateSnapshot”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-sandbox-experimentalcreatesnapshot)

```
func (s *Sandbox) ExperimentalCreateSnapshot(ctx context.Context, name string) error
```

ExperimentalCreateSnapshot creates a snapshot from the current state of the sandbox.

Deprecated: Use CreateSnapshot instead. This method will be removed in a future release.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-sandbox-experimentalcreatesnapshotwithtimeout) func (\*Sandbox) ExperimentalCreateSnapshotWithTimeout

[Section titled “func (\*Sandbox) ExperimentalCreateSnapshotWithTimeout”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-sandbox-experimentalcreatesnapshotwithtimeout)

```
func (s *Sandbox) ExperimentalCreateSnapshotWithTimeout(ctx context.Context, name string, timeout time.Duration) error
```

ExperimentalCreateSnapshotWithTimeout creates a snapshot with a custom timeout.

Deprecated: Use CreateSnapshotWithTimeout instead. This method will be removed in a future release.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-sandbox-experimentalfork) func (\*Sandbox) ExperimentalFork

[Section titled “func (\*Sandbox) ExperimentalFork”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-sandbox-experimentalfork)

```
func (s *Sandbox) ExperimentalFork(ctx context.Context, name *string) (*Sandbox, error)
```

ExperimentalFork forks the sandbox with a default timeout of 60 seconds.

Deprecated: Use Fork instead. This method will be removed in a future release.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-sandbox-experimentalforkwithtimeout) func (\*Sandbox) ExperimentalForkWithTimeout

[Section titled “func (\*Sandbox) ExperimentalForkWithTimeout”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-sandbox-experimentalforkwithtimeout)

```
func (s *Sandbox) ExperimentalForkWithTimeout(ctx context.Context, name *string, timeout time.Duration) (*Sandbox, error)
```

ExperimentalForkWithTimeout forks the sandbox with a custom timeout.

Deprecated: Use ForkWithTimeout instead. This method will be removed in a future release.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-sandbox-expiresignedpreviewlink) func (\*Sandbox) ExpireSignedPreviewLink

[Section titled “func (\*Sandbox) ExpireSignedPreviewLink”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-sandbox-expiresignedpreviewlink)

```
func (s *Sandbox) ExpireSignedPreviewLink(ctx context.Context, port int, token string) error
```

ExpireSignedPreviewLink expires a previously generated signed preview link.

This invalidates the signed preview link token, preventing any further access.

Example:

```
err := sandbox.ExpireSignedPreviewLink(ctx, 3000, "preview-token-to-expire")

if err != nil {

    return err

}
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-sandbox-fork) func (\*Sandbox) Fork

[Section titled “func (\*Sandbox) Fork”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-sandbox-fork)

```
func (s *Sandbox) Fork(ctx context.Context, name *string) (*Sandbox, error)
```

Fork forks the sandbox with a default timeout of 60 seconds, creating a new sandbox with an identical filesystem.

The forked sandbox is a copy-on-write clone of the original. It starts with the same disk contents but operates independently from that point on. Fork waits for the new sandbox to reach the “started” state before returning.

Example:

```
forked, err := sandbox.Fork(ctx, nil)

if err != nil {

    return err

}

fmt.Printf("Forked sandbox: %s\n", forked.ID)
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-sandbox-forkwithtimeout) func (\*Sandbox) ForkWithTimeout

[Section titled “func (\*Sandbox) ForkWithTimeout”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-sandbox-forkwithtimeout)

```
func (s *Sandbox) ForkWithTimeout(ctx context.Context, name *string, timeout time.Duration) (*Sandbox, error)
```

ForkWithTimeout forks the sandbox with a custom timeout, creating a new sandbox with an identical filesystem.

The forked sandbox is a copy-on-write clone of the original. It starts with the same disk contents but operates independently from that point on. ForkWithTimeout waits for the new sandbox to reach the “started” state before returning. 0 means no timeout.

Example:

```
forked, err := sandbox.ForkWithTimeout(ctx, nil, 2*time.Minute)

if err != nil {

    return err

}

fmt.Printf("Forked sandbox: %s\n", forked.ID)
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-sandbox-getmetrics) func (\*Sandbox) GetMetrics

[Section titled “func (\*Sandbox) GetMetrics”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-sandbox-getmetrics)

```
func (s *Sandbox) GetMetrics(ctx context.Context, start, end *time.Time) ([]SandboxMetrics, error)
```

GetMetrics returns historical time-series resource usage metrics for the sandbox.

A nil start defaults to the sandbox creation time; a nil end defaults to the current time. Samples are returned ordered ascending by timestamp.

Example:

```
samples, err := sandbox.GetMetrics(ctx, nil, nil)

if err != nil {

    return err

}

for _, m := range samples {

    fmt.Printf("%s CPU: %.1f%%\n", m.Timestamp.Format(time.RFC3339), m.CPUUsedPct)

}
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-sandbox-getmetricslatest) func (\*Sandbox) GetMetricsLatest

[Section titled “func (\*Sandbox) GetMetricsLatest”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-sandbox-getmetricslatest)

```
func (s *Sandbox) GetMetricsLatest(ctx context.Context) (SandboxMetrics, error)
```

GetMetricsLatest returns the most recent resource usage sample directly from the sandbox daemon.

Unlike GetMetrics, which returns aggregated historical samples, this returns the single current reading without going through the telemetry backend.

Example:

```
m, err := sandbox.GetMetricsLatest(ctx)

if err != nil {

    return err

}

fmt.Printf("CPU: %.1f%%\n", m.CPUUsedPct)
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-sandbox-getpreviewlink) func (\*Sandbox) GetPreviewLink

[Section titled “func (\*Sandbox) GetPreviewLink”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-sandbox-getpreviewlink)

```
func (s *Sandbox) GetPreviewLink(ctx context.Context, port int) (*types.PreviewLink, error)
```

GetPreviewLink returns a preview link for accessing a port on the sandbox.

The returned PreviewLink contains both the URL and an authentication token. For private sandboxes, the token must be sent via the “x-daytona-preview-token” request header.

Example:

```
preview, err := sandbox.GetPreviewLink(ctx, 3000)

if err != nil {

    return err

}

fmt.Printf("URL: %s\nToken: %s\n", preview.URL, preview.Token)
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-sandbox-getsignedpreviewlink) func (\*Sandbox) GetSignedPreviewLink

[Section titled “func (\*Sandbox) GetSignedPreviewLink”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-sandbox-getsignedpreviewlink)

```
func (s *Sandbox) GetSignedPreviewLink(ctx context.Context, port int, expiresInSeconds int) (*types.SignedPreviewLink, error)
```

GetSignedPreviewLink retrieves a signed preview URL for the sandbox at the specified port, valid for up to expiresInSeconds seconds.

Example:

```
preview, err := sandbox.GetSignedPreviewLink(ctx, 3000, 3600)

if err != nil {

    return err

}

fmt.Printf("Sandbox ID: %s\nPort: %d\nURL: %s\nToken: %s\n", preview.SandboxID, preview.Port, preview.URL, preview.Token)
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-sandbox-getuserhomedir) func (\*Sandbox) GetUserHomeDir

[Section titled “func (\*Sandbox) GetUserHomeDir”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-sandbox-getuserhomedir)

```
func (s *Sandbox) GetUserHomeDir(ctx context.Context) (string, error)
```

GetUserHomeDir returns the user’s home directory path in the sandbox.

Example:

```
homeDir, err := sandbox.GetUserHomeDir(ctx)

if err != nil {

    return err

}

fmt.Printf("Home directory: %s\n", homeDir) // e.g., "/home/daytona"
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-sandbox-getworkingdir) func (\*Sandbox) GetWorkingDir

[Section titled “func (\*Sandbox) GetWorkingDir”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-sandbox-getworkingdir)

```
func (s *Sandbox) GetWorkingDir(ctx context.Context) (string, error)
```

GetWorkingDir returns the current working directory in the sandbox.

Example:

```
workDir, err := sandbox.GetWorkingDir(ctx)

if err != nil {

    return err

}

fmt.Printf("Working directory: %s\n", workDir)
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-sandbox-pause) func (\*Sandbox) Pause

[Section titled “func (\*Sandbox) Pause”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-sandbox-pause)

```
func (s *Sandbox) Pause(ctx context.Context) error
```

Pause pauses the Sandbox, freezing all running processes. Uses a default timeout of 60 seconds.

The Sandbox will enter a ‘pausing’ state and transition to ‘paused’ when complete.

Example:

```
err := sandbox.Pause(ctx)

if err != nil {

    return err

}
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-sandbox-pausewithtimeout) func (\*Sandbox) PauseWithTimeout

[Section titled “func (\*Sandbox) PauseWithTimeout”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-sandbox-pausewithtimeout)

```
func (s *Sandbox) PauseWithTimeout(ctx context.Context, timeout time.Duration) error
```

PauseWithTimeout pauses the Sandbox with a custom timeout. 0 means no timeout.

Example:

```
err := sandbox.PauseWithTimeout(ctx, 2*time.Minute)
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-sandbox-refreshdata) func (\*Sandbox) RefreshData

[Section titled “func (\*Sandbox) RefreshData”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-sandbox-refreshdata)

```
func (s *Sandbox) RefreshData(ctx context.Context) error
```

RefreshData refreshes the sandbox data from the API.

This updates all sandbox fields from the server, including those not populated by [Client.List](https://www.daytona.io/docs/en/go-sdk/daytona/#Client.List) (Env, NetworkBlockAll, NetworkAllowList, DomainAllowList, Volumes, BuildInfo, BackupCreatedAt).

Example:

```
err := sandbox.RefreshData(ctx)

if err != nil {

    return err

}

fmt.Printf("Current state: %s\n", sandbox.State)
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-sandbox-resize) func (\*Sandbox) Resize

[Section titled “func (\*Sandbox) Resize”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-sandbox-resize)

```
func (s *Sandbox) Resize(ctx context.Context, resources *types.Resources) error
```

Resize resizes the sandbox resources with a default timeout of 60 seconds.

Changes the CPU, memory, or disk allocation. Resizing a started sandbox accepts only CPU and memory increases. Disk resize requires a stopped sandbox; disk can only grow. GPU is not resizable — to change GPU, create a new sandbox.

Returns an error if resources.GPU or resources.GpuType is set.

Example:

```
err := sandbox.Resize(ctx, &types.Resources{CPU: 4, Memory: 8})

sandbox.Stop(ctx)

err := sandbox.Resize(ctx, &types.Resources{CPU: 2, Memory: 4, Disk: 30})
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-sandbox-resizewithtimeout) func (\*Sandbox) ResizeWithTimeout

[Section titled “func (\*Sandbox) ResizeWithTimeout”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-sandbox-resizewithtimeout)

```
func (s *Sandbox) ResizeWithTimeout(ctx context.Context, resources *types.Resources, timeout time.Duration) error
```

ResizeWithTimeout resizes the sandbox resources with a custom timeout.

Changes the CPU, memory, or disk allocation. Resizing a started sandbox accepts only CPU and memory increases. Disk resize requires a stopped sandbox; disk can only grow. GPU is not resizable — to change GPU, create a new sandbox. A timeout of 0 means no timeout.

Returns an error if resources.GPU or resources.GpuType is set.

Example:

```
err := sandbox.ResizeWithTimeout(ctx, &types.Resources{CPU: 4, Memory: 8}, 2*time.Minute)
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-sandbox-rotatesigningkey) func (\*Sandbox) RotateSigningKey

[Section titled “func (\*Sandbox) RotateSigningKey”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-sandbox-rotatesigningkey)

```
func (s *Sandbox) RotateSigningKey(ctx context.Context) error
```

RotateSigningKey rotates the sandbox signing key and invalidates previously signed URLs.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-sandbox-setautoarchiveinterval) func (\*Sandbox) SetAutoArchiveInterval

[Section titled “func (\*Sandbox) SetAutoArchiveInterval”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-sandbox-setautoarchiveinterval)

```
func (s *Sandbox) SetAutoArchiveInterval(ctx context.Context, intervalMinutes *int) error
```

SetAutoArchiveInterval sets the auto-archive interval in minutes.

The sandbox will be automatically archived after being stopped for this many minutes. Set to 0 to disable auto-archiving (sandbox will never auto-archive).

Example:

```
// Archive after 30 minutes of being stopped

interval := 30

err := sandbox.SetAutoArchiveInterval(ctx, &interval)

// Disable auto-archiving

interval := 0

err := sandbox.SetAutoArchiveInterval(ctx, &interval)
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-sandbox-setautodeleteinterval) func (\*Sandbox) SetAutoDeleteInterval

[Section titled “func (\*Sandbox) SetAutoDeleteInterval”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-sandbox-setautodeleteinterval)

```
func (s *Sandbox) SetAutoDeleteInterval(ctx context.Context, intervalMinutes *int) error
```

SetAutoDeleteInterval sets the auto-delete interval in minutes.

The sandbox will be automatically deleted after being stopped for this many minutes.

Special values:

- -1: Disable auto-deletion (sandbox will never auto-delete)
- 0: Delete immediately upon stopping

Example:

```
// Delete after 60 minutes of being stopped

interval := 60

err := sandbox.SetAutoDeleteInterval(ctx, &interval)

// Delete immediately when stopped

interval := 0

err := sandbox.SetAutoDeleteInterval(ctx, &interval)

// Never auto-delete

interval := -1

err := sandbox.SetAutoDeleteInterval(ctx, &interval)
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-sandbox-setlabels) func (\*Sandbox) SetLabels

[Section titled “func (\*Sandbox) SetLabels”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-sandbox-setlabels)

```
func (s *Sandbox) SetLabels(ctx context.Context, labels map[string]string) error
```

SetLabels sets custom labels on the sandbox.

Labels are key-value pairs that can be used for organization and filtering. This replaces all existing labels.

Example:

```
err := sandbox.SetLabels(ctx, map[string]string{

    "environment": "development",

    "team": "backend",

    "project": "api-server",

})
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-sandbox-start) func (\*Sandbox) Start

[Section titled “func (\*Sandbox) Start”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-sandbox-start)

```
func (s *Sandbox) Start(ctx context.Context) error
```

Start starts the sandbox with a default timeout of 60 seconds.

If the sandbox is already running, this is a no-op. For custom timeout, use [Sandbox.StartWithTimeout](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox.StartWithTimeout).

Example:

```
err := sandbox.Start(ctx)

if err != nil {

    return err

}

// Sandbox is now running
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-sandbox-startwithtimeout) func (\*Sandbox) StartWithTimeout

[Section titled “func (\*Sandbox) StartWithTimeout”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-sandbox-startwithtimeout)

```
func (s *Sandbox) StartWithTimeout(ctx context.Context, timeout time.Duration) error
```

StartWithTimeout starts the sandbox with a custom timeout.

The method blocks until the sandbox reaches the “started” state or the timeout is exceeded. 0 means no timeout.

Example:

```
err := sandbox.StartWithTimeout(ctx, 2*time.Minute)

if err != nil {

    return err

}
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-sandbox-stop) func (\*Sandbox) Stop

[Section titled “func (\*Sandbox) Stop”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-sandbox-stop)

```
func (s *Sandbox) Stop(ctx context.Context) error
```

Stop stops the sandbox with a default timeout of 60 seconds.

Stopping a sandbox preserves its state. Use [Sandbox.Start](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox.Start) to resume. For custom timeout or force stop, use [Sandbox.StopWithTimeout](https://www.daytona.io/docs/en/go-sdk/daytona/#Sandbox.StopWithTimeout).

Example:

```
err := sandbox.Stop(ctx)
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-sandbox-stopwithtimeout) func (\*Sandbox) StopWithTimeout

[Section titled “func (\*Sandbox) StopWithTimeout”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-sandbox-stopwithtimeout)

```
func (s *Sandbox) StopWithTimeout(ctx context.Context, timeout time.Duration, force bool) error
```

StopWithTimeout stops the sandbox with a custom timeout.

The method blocks until the sandbox reaches the “stopped” state or the timeout is exceeded. 0 means no timeout. Set force to true to use SIGKILL instead of SIGTERM.

Example:

```
err := sandbox.StopWithTimeout(ctx, 2*time.Minute, false)
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-sandbox-updateenv) func (\*Sandbox) UpdateEnv

[Section titled “func (\*Sandbox) UpdateEnv”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-sandbox-updateenv)

```
func (s *Sandbox) UpdateEnv(ctx context.Context, env map[string]string, unset []string) error
```

UpdateEnv updates the sandbox daemon’s process environment, setting the variables in env and removing the names in unset.

Newly spawned processes, sessions, and PTYs inherit the change; already-running processes keep their existing environment.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-sandbox-updatenetworksettings) func (\*Sandbox) UpdateNetworkSettings

[Section titled “func (\*Sandbox) UpdateNetworkSettings”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-sandbox-updatenetworksettings)

```
func (s *Sandbox) UpdateNetworkSettings(ctx context.Context, settings apiclient.UpdateSandboxNetworkSettings) error
```

UpdateNetworkSettings updates outbound network policy for this sandbox on the runner (for example block all traffic, restore general internet access, or apply a CIDR allow list) without stopping the sandbox.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-sandbox-updatesecrets) func (\*Sandbox) UpdateSecrets

[Section titled “func (\*Sandbox) UpdateSecrets”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-sandbox-updatesecrets)

```
func (s *Sandbox) UpdateSecrets(ctx context.Context, secrets map[string]string) error
```

UpdateSecrets replaces the set of vault secrets mounted in this sandbox.

Each key is an environment variable name and each value is the name of an existing organization secret (see the Secrets field on \[types.SandboxBaseParams\]). Pass an empty map to detach all secrets; a nil map is rejected so an uninitialized map can’t detach them by accident.

Attached, detached, and rotated secrets take effect for outbound requests within seconds. New environment variables only become visible to processes spawned after the update, and a sandbox created without any secrets must be restarted before newly attached secrets work.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-sandbox-uploadurl) func (\*Sandbox) UploadURL

[Section titled “func (\*Sandbox) UploadURL”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-sandbox-uploadurl)

```
func (s *Sandbox) UploadURL(ctx context.Context, path string, ttlSeconds *int) (string, error)
```

UploadURL creates a pre-signed URL for uploading a file to the sandbox. Send a POST request with the file as multipart/form-data. The URL works with any HTTP client without auth headers. The signing key is cached locally for up to 15 seconds; if the key was rotated from another client, URLs may be rejected until the cache refreshes.

```
url, err := sandbox.UploadURL(ctx, "/home/user/data.bin", nil)

// curl -X POST -F "file=@local.bin" "$url"
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-sandbox-waitforresize) func (\*Sandbox) WaitForResize

[Section titled “func (\*Sandbox) WaitForResize”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-sandbox-waitforresize)

```
func (s *Sandbox) WaitForResize(ctx context.Context, timeout time.Duration) error
```

WaitForResize waits for the sandbox resize operation to complete.

This method polls the sandbox state until it’s no longer resizing, encounters an error state, or the timeout is exceeded. 0 means no timeout.

Example:

```
err := sandbox.WaitForResize(ctx, 2*time.Minute)
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-sandbox-waitforstart) func (\*Sandbox) WaitForStart

[Section titled “func (\*Sandbox) WaitForStart”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-sandbox-waitforstart)

```
func (s *Sandbox) WaitForStart(ctx context.Context, timeout time.Duration) error
```

WaitForStart waits for the sandbox to reach the “started” state.

This method polls the sandbox state until it’s started, encounters an error state, or the timeout is exceeded. 0 means no timeout.

Example:

```
err := sandbox.WaitForStart(ctx, 2*time.Minute)

if err != nil {

    return err

}

// Sandbox is now running
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-sandbox-waitforstop) func (\*Sandbox) WaitForStop

[Section titled “func (\*Sandbox) WaitForStop”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-sandbox-waitforstop)

```
func (s *Sandbox) WaitForStop(ctx context.Context, timeout time.Duration) error
```

WaitForStop waits for the sandbox to reach the “stopped” state.

This method polls the sandbox state until it’s stopped or the timeout is exceeded. 0 means no timeout.

Example:

```
err := sandbox.WaitForStop(ctx, 2*time.Minute)
```

## [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#type-sandboxiterator) type SandboxIterator

[Section titled “type SandboxIterator”](https://www.daytona.io/docs/en/go-sdk/daytona/#type-sandboxiterator)

SandboxIterator iterates over Sandboxes returned by [Client.List](https://www.daytona.io/docs/en/go-sdk/daytona/#Client.List), following the standard Go iterator pattern used by [database/sql.Rows](https://pkg.go.dev/database/sql/#Rows) and [bufio.Scanner](https://pkg.go.dev/bufio/#Scanner).

For Go 1.23+ range-over-func consumers, see [Client.ListSeq](https://www.daytona.io/docs/en/go-sdk/daytona/#Client.ListSeq).

```
type SandboxIterator struct {

    // contains filtered or unexported fields

}
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-sandboxiterator-err) func (\*SandboxIterator) Err

[Section titled “func (\*SandboxIterator) Err”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-sandboxiterator-err)

```
func (it *SandboxIterator) Err() error
```

Err returns the first error encountered during iteration, if any. Callers should check Err after [SandboxIterator.Next](https://www.daytona.io/docs/en/go-sdk/daytona/#SandboxIterator.Next) returns false.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-sandboxiterator-next) func (\*SandboxIterator) Next

[Section titled “func (\*SandboxIterator) Next”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-sandboxiterator-next)

```
func (it *SandboxIterator) Next() bool
```

Next advances the iterator to the next sandbox. It returns true if a sandbox is available (accessible via [SandboxIterator.Value](https://www.daytona.io/docs/en/go-sdk/daytona/#SandboxIterator.Value)), or false if iteration has finished or an error occurred. After Next returns false, callers should inspect [SandboxIterator.Err](https://www.daytona.io/docs/en/go-sdk/daytona/#SandboxIterator.Err).

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-sandboxiterator-value) func (\*SandboxIterator) Value

[Section titled “func (\*SandboxIterator) Value”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-sandboxiterator-value)

```
func (it *SandboxIterator) Value() *Sandbox
```

Value returns the current sandbox. Only valid after [SandboxIterator.Next](https://www.daytona.io/docs/en/go-sdk/daytona/#SandboxIterator.Next) has returned true.

## [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#type-sandboxlistsortdirection) type SandboxListSortDirection

[Section titled “type SandboxListSortDirection”](https://www.daytona.io/docs/en/go-sdk/daytona/#type-sandboxlistsortdirection)

SandboxListSortDirection selects ascending or descending order for [Client.List](https://www.daytona.io/docs/en/go-sdk/daytona/#Client.List).

```
type SandboxListSortDirection = apiclient.SandboxListSortDirection
```

## [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#type-sandboxlistsortfield) type SandboxListSortField

[Section titled “type SandboxListSortField”](https://www.daytona.io/docs/en/go-sdk/daytona/#type-sandboxlistsortfield)

SandboxListSortField selects the field used to order results from [Client.List](https://www.daytona.io/docs/en/go-sdk/daytona/#Client.List).

```
type SandboxListSortField = apiclient.SandboxListSortField
```

## [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#type-sandboxmetrics) type SandboxMetrics

[Section titled “type SandboxMetrics”](https://www.daytona.io/docs/en/go-sdk/daytona/#type-sandboxmetrics)

SandboxMetrics is a single point-in-time sample of historical sandbox resource usage.

```
type SandboxMetrics struct {

    CPUCount   int32

    CPUUsedPct float64

    DiskTotal  int64

    DiskUsed   int64

    MemTotal   int64

    MemUsed    int64

    MemCache   int64

    Timestamp  time.Time

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#type-sandboxstate) type SandboxState

[Section titled “type SandboxState”](https://www.daytona.io/docs/en/go-sdk/daytona/#type-sandboxstate)

SandboxState represents the lifecycle state of a Sandbox.

```
type SandboxState = apiclient.SandboxState
```

## [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#type-screenshotservice) type ScreenshotService

[Section titled “type ScreenshotService”](https://www.daytona.io/docs/en/go-sdk/daytona/#type-screenshotservice)

ScreenshotService provides screen capture operations.

ScreenshotService enables capturing full screen or region screenshots. Access through [ComputerUseService.Screenshot](https://www.daytona.io/docs/en/go-sdk/daytona/#ComputerUseService.Screenshot).

```
type ScreenshotService struct {

    // contains filtered or unexported fields

}
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-newscreenshotservice) func NewScreenshotService

[Section titled “func NewScreenshotService”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-newscreenshotservice)

```
func NewScreenshotService(toolboxClient *toolbox.APIClient, otel *otelState) *ScreenshotService
```

NewScreenshotService creates a new ScreenshotService.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-screenshotservice-takefullscreen) func (\*ScreenshotService) TakeFullScreen

[Section titled “func (\*ScreenshotService) TakeFullScreen”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-screenshotservice-takefullscreen)

```
func (s *ScreenshotService) TakeFullScreen(ctx context.Context, showCursor *bool) (*types.ScreenshotResponse, error)
```

TakeFullScreen captures a screenshot of the entire screen.

Parameters:

- showCursor: Whether to include the cursor in the screenshot, nil for default

Example:

```
// Capture full screen

screenshot, err := ss.TakeFullScreen(ctx, nil)

if err != nil {

    return err

}

// screenshot.Image contains the base64-encoded image data

// Capture with cursor visible

showCursor := true

screenshot, err := ss.TakeFullScreen(ctx, &showCursor)
```

Returns \[types.ScreenshotResponse\] with the captured image.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-screenshotservice-takeregion) func (\*ScreenshotService) TakeRegion

[Section titled “func (\*ScreenshotService) TakeRegion”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-screenshotservice-takeregion)

```
func (s *ScreenshotService) TakeRegion(ctx context.Context, region types.ScreenshotRegion, showCursor *bool) (*types.ScreenshotResponse, error)
```

TakeRegion captures a screenshot of a specific screen region.

Parameters:

- region: The region to capture (X, Y, Width, Height)
- showCursor: Whether to include the cursor in the screenshot, nil for default

Example:

```
// Capture a 200x100 region starting at (50, 50)

region := types.ScreenshotRegion{X: 50, Y: 50, Width: 200, Height: 100}

screenshot, err := ss.TakeRegion(ctx, region, nil)

if err != nil {

    return err

}
```

Returns \[types.ScreenshotResponse\] with the captured image.

## [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#type-secretservice) type SecretService

[Section titled “type SecretService”](https://www.daytona.io/docs/en/go-sdk/daytona/#type-secretservice)

SecretService provides organization-scoped secret management operations.

SecretService enables creating, listing, retrieving, updating, and deleting secrets. A secret stores a write-only plaintext value that is never returned by the API. Secrets can be referenced when creating a sandbox (see the Secrets field on \[types.SandboxBaseParams\]); the env var injected into the sandbox holds the secret’s opaque placeholder, which is resolved to the real value only for the secret’s allowed hosts. Access through \[Client.Secret\].

Example:

```
// Create a new secret

secret, err := client.Secret.Create(ctx, &types.CreateSecretParams{

    Name:  "anthropic-prod",

    Value: "sk-ant-...",

    Hosts: []string{"api.anthropic.com"},

})

if err != nil {

    return err

}

// List secrets page by page

page, err := client.Secret.List(ctx, nil)
```

```
type SecretService struct {

    // contains filtered or unexported fields

}
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-newsecretservice) func NewSecretService

[Section titled “func NewSecretService”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-newsecretservice)

```
func NewSecretService(client *Client) *SecretService
```

NewSecretService creates a new SecretService.

This is typically called internally by the SDK when creating a [Client](https://www.daytona.io/docs/en/go-sdk/daytona/#Client). Users should access SecretService through \[Client.Secret\] rather than creating it directly.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-secretservice-create) func (\*SecretService) Create

[Section titled “func (\*SecretService) Create”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-secretservice-create)

```
func (s *SecretService) Create(ctx context.Context, params *types.CreateSecretParams) (*types.Secret, error)
```

Create creates a new organization secret.

The plaintext value is write-only and is never returned. The name must match ^\[a-zA-Z\_\]\[a-zA-Z0-9\_-\]\*$ and be unique within the organization; a duplicate name returns a conflict error.

Parameters:

- params: Secret creation parameters including name, value, optional description, and allowed hosts

Example:

```
secret, err := client.Secret.Create(ctx, &types.CreateSecretParams{

    Name:  "anthropic-prod",

    Value: "sk-ant-...",

    Hosts: []string{"api.anthropic.com"},

})

if err != nil {

    return err

}
```

Returns the created \[types.Secret\] or an error.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-secretservice-delete) func (\*SecretService) Delete

[Section titled “func (\*SecretService) Delete”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-secretservice-delete)

```
func (s *SecretService) Delete(ctx context.Context, secretID string) error
```

Delete permanently removes a secret identified by its ID.

This operation is irreversible.

Parameters:

- secretID: The secret ID

Example:

```
err := client.Secret.Delete(ctx, secretID)

if err != nil {

    return err

}
```

Returns an error if the ID is unknown (404) or deletion fails.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-secretservice-get) func (\*SecretService) Get

[Section titled “func (\*SecretService) Get”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-secretservice-get)

```
func (s *SecretService) Get(ctx context.Context, secretID string) (*types.Secret, error)
```

Get retrieves a secret by its ID.

Parameters:

- secretID: The secret ID

Example:

```
secret, err := client.Secret.Get(ctx, secretID)

if err != nil {

    var notFound *errors.DaytonaNotFoundError

    if errors.As(err, &notFound) {

        log.Println("Secret not found")

    }

    return err

}

fmt.Printf("Secret %s allows hosts: %v\n", secret.Name, secret.Hosts)
```

Returns the \[types.Secret\] or an error if the ID is unknown (404).

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-secretservice-list) func (\*SecretService) List

[Section titled “func (\*SecretService) List”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-secretservice-list)

```
func (s *SecretService) List(ctx context.Context, query *types.ListSecretsQuery) (*types.ListSecretsResponse, error)
```

List returns one page of the organization’s secrets.

The plaintext value is never returned; each secret carries only its opaque placeholder. Pass the NextCursor of a response as the Cursor of the next query to fetch the following page; a nil NextCursor means there are no further pages.

Parameters:

- query: Optional filtering, sorting, and pagination parameters. May be nil, in which case the first page is returned with server defaults (100 results sorted by creation time, newest first).

Example:

```
limit := 50

query := &types.ListSecretsQuery{Limit: &limit}

for {

    page, err := client.Secret.List(ctx, query)

    if err != nil {

        return err

    }

    fmt.Printf("Fetched %d of %d secrets\n", len(page.Items), page.Total)

    for _, secret := range page.Items {

        fmt.Printf("Secret %s -> %s\n", secret.Name, secret.Placeholder)

    }

    if page.NextCursor == nil {

        break

    }

    query.Cursor = page.NextCursor

}
```

Returns a \[types.ListSecretsResponse\] holding the page’s secrets, the total number of secrets matching the filters, and the next-page cursor, or an error if the request fails.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-secretservice-update) func (\*SecretService) Update

[Section titled “func (\*SecretService) Update”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-secretservice-update)

```
func (s *SecretService) Update(ctx context.Context, secretID string, params *types.UpdateSecretParams) (*types.Secret, error)
```

Update modifies an existing secret identified by its ID.

Only the non-nil fields of params are applied. The plaintext value is write-only and is never returned.

Parameters:

- secretID: The secret ID
- params: Fields to update (value, description, allowed hosts)

Example:

```
newValue := "sk-ant-rotated-..."

secret, err := client.Secret.Update(ctx, secretID, &types.UpdateSecretParams{

    Value: &newValue,

    Hosts: []string{"api.anthropic.com", "*.anthropic.com"},

})

if err != nil {

    return err

}
```

Returns the updated \[types.Secret\] or an error if the ID is unknown (404).

## [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#type-snapshotservice) type SnapshotService

[Section titled “type SnapshotService”](https://www.daytona.io/docs/en/go-sdk/daytona/#type-snapshotservice)

SnapshotService provides snapshot (image template) management operations.

SnapshotService enables creating, managing, and deleting snapshots that serve as templates for sandboxes. Snapshots can be built from Docker images or custom [DockerImage](https://www.daytona.io/docs/en/go-sdk/daytona/#DockerImage) definitions with build contexts. Access through \[Client.Snapshot\].

Example:

```
// Create a snapshot from an existing image

snapshot, logChan, err := client.Snapshot.Create(ctx, &types.CreateSnapshotParams{

    Name:  "my-python-env",

    Image: "python:3.11-slim",

})

if err != nil {

    return err

}

// Stream build logs

for log := range logChan {

    fmt.Println(log)

}

// Create a snapshot from a custom Image definition

image := daytona.Base("python:3.11-slim").

    PipInstall([]string{"numpy", "pandas"}).

    Workdir("/app")

snapshot, logChan, err := client.Snapshot.Create(ctx, &types.CreateSnapshotParams{

    Name:  "custom-python-env",

    Image: image,

})
```

```
type SnapshotService struct {

    // contains filtered or unexported fields

}
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-newsnapshotservice) func NewSnapshotService

[Section titled “func NewSnapshotService”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-newsnapshotservice)

```
func NewSnapshotService(client *Client) *SnapshotService
```

NewSnapshotService creates a new SnapshotService.

This is typically called internally by the SDK when creating a [Client](https://www.daytona.io/docs/en/go-sdk/daytona/#Client). Users should access SnapshotService through \[Client.Snapshot\] rather than creating it directly.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-snapshotservice-create) func (\*SnapshotService) Create

[Section titled “func (\*SnapshotService) Create”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-snapshotservice-create)

```
func (s *SnapshotService) Create(ctx context.Context, params *types.CreateSnapshotParams) (*types.Snapshot, <-chan string, error)
```

Create builds a new snapshot from an image and streams build logs.

The image parameter can be either a Docker image reference string (e.g., “python:3.11”) or an [DockerImage](https://www.daytona.io/docs/en/go-sdk/daytona/#DockerImage) builder object for custom Dockerfile definitions.

Parameters:

- params: Snapshot creation parameters including name, image, resources, and entrypoint

Example:

```
// Create from Docker Hub image

snapshot, logChan, err := client.Snapshot.Create(ctx, &types.CreateSnapshotParams{

    Name:  "my-env",

    Image: "python:3.11-slim",

})

if err != nil {

    return err

}

// Stream build logs

for log := range logChan {

    fmt.Println(log)

}

// Create with custom image and resources

image := daytona.Base("python:3.11").PipInstall([]string{"numpy"})

snapshot, logChan, err := client.Snapshot.Create(ctx, &types.CreateSnapshotParams{

    Name:  "custom-env",

    Image: image,

    Resources: &types.Resources{CPU: 2, Memory: 4096},

})
```

Returns the created \[types.Snapshot\], a channel for streaming build logs, or an error. The log channel is closed when the build completes or fails.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-snapshotservice-delete) func (\*SnapshotService) Delete

[Section titled “func (\*SnapshotService) Delete”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-snapshotservice-delete)

```
func (s *SnapshotService) Delete(ctx context.Context, snapshot *types.Snapshot) error
```

Delete permanently removes a snapshot.

Sandboxes created from this snapshot will continue to work, but no new sandboxes can be created from it after deletion.

Parameters:

- snapshot: The snapshot to delete

Example:

```
err := client.Snapshot.Delete(ctx, snapshot)

if err != nil {

    return err

}
```

Returns an error if deletion fails.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-snapshotservice-get) func (\*SnapshotService) Get

[Section titled “func (\*SnapshotService) Get”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-snapshotservice-get)

```
func (s *SnapshotService) Get(ctx context.Context, nameOrID string) (*types.Snapshot, error)
```

Get retrieves a snapshot by name or ID.

Parameters:

- nameOrID: The snapshot name or unique ID

Example:

```
snapshot, err := client.Snapshot.Get(ctx, "my-python-env")

if err != nil {

    return err

}

fmt.Printf("Snapshot %s: %s\n", snapshot.Name, snapshot.State)
```

Returns the \[types.Snapshot\] or an error if not found.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-snapshotservice-list) func (\*SnapshotService) List

[Section titled “func (\*SnapshotService) List”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-snapshotservice-list)

```
func (s *SnapshotService) List(ctx context.Context, page *int, limit *int) (*types.PaginatedSnapshots, error)
```

List returns snapshots with optional pagination.

Parameters:

- page: Page number (1-indexed), nil for first page
- limit: Maximum snapshots per page, nil for default

Example:

```
pageNumber, pageSize := 2, 10

page, err := client.Snapshot.List(ctx, &pageNumber, &pageSize)

if err != nil {

    return err

}

fmt.Printf("Page %d of %d (%d snapshots total)\n", page.Page, page.TotalPages, page.Total)

for _, snapshot := range page.Items {

    fmt.Printf("%s (%s)\n", snapshot.Name, snapshot.ImageName)

}
```

Returns \[types.PaginatedSnapshots\] containing the snapshots and pagination info.

## [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#type-uploadprogress) type UploadProgress

[Section titled “type UploadProgress”](https://www.daytona.io/docs/en/go-sdk/daytona/#type-uploadprogress)

UploadProgress contains progress information for a streaming upload.

```
type UploadProgress struct {

    // BytesSent is the cumulative number of bytes written to the wire so far.

    BytesSent int64

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#type-uploadstreamoption) type UploadStreamOption

[Section titled “type UploadStreamOption”](https://www.daytona.io/docs/en/go-sdk/daytona/#type-uploadstreamoption)

UploadStreamOption configures the behavior of UploadFileStream.

```
type UploadStreamOption func(*uploadStreamConfig)
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-withuploadprogress) func WithUploadProgress

[Section titled “func WithUploadProgress”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-withuploadprogress)

```
func WithUploadProgress(fn func(UploadProgress)) UploadStreamOption
```

WithUploadProgress returns an option that enables progress tracking for streaming uploads. The callback fires once per chunk written to the wire with the cumulative byte count.

## [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#type-volumeservice) type VolumeService

[Section titled “type VolumeService”](https://www.daytona.io/docs/en/go-sdk/daytona/#type-volumeservice)

VolumeService provides persistent storage volume management operations.

VolumeService enables creating, managing, and deleting persistent storage volumes that can be attached to sandboxes. Volumes persist data independently of sandbox lifecycle and can be shared between sandboxes. Access through \[Client.Volume\].

Example:

```
// Create a new volume

volume, err := client.Volume.Create(ctx, "my-data-volume")

if err != nil {

    return err

}

// Wait for volume to be ready

volume, err = client.Volume.WaitForReady(ctx, volume, 60*time.Second)

if err != nil {

    return err

}

// List all volumes

volumes, err := client.Volume.List(ctx)
```

```
type VolumeService struct {

    // contains filtered or unexported fields

}
```

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-newvolumeservice) func NewVolumeService

[Section titled “func NewVolumeService”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-newvolumeservice)

```
func NewVolumeService(client *Client) *VolumeService
```

NewVolumeService creates a new VolumeService.

This is typically called internally by the SDK when creating a [Client](https://www.daytona.io/docs/en/go-sdk/daytona/#Client). Users should access VolumeService through \[Client.Volume\] rather than creating it directly.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-volumeservice-create) func (\*VolumeService) Create

[Section titled “func (\*VolumeService) Create”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-volumeservice-create)

```
func (v *VolumeService) Create(ctx context.Context, name string) (*types.Volume, error)
```

Create creates a new persistent storage volume.

The volume starts in “pending” state and transitions to “ready” when available. Use [VolumeService.WaitForReady](https://www.daytona.io/docs/en/go-sdk/daytona/#VolumeService.WaitForReady) to wait for the volume to become ready.

Parameters:

- name: Unique name for the volume

Example:

```
volume, err := client.Volume.Create(ctx, "my-data-volume")

if err != nil {

    return err

}

// Wait for volume to be ready

volume, err = client.Volume.WaitForReady(ctx, volume, 60*time.Second)
```

Returns the created \[types.Volume\] or an error.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-volumeservice-delete) func (\*VolumeService) Delete

[Section titled “func (\*VolumeService) Delete”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-volumeservice-delete)

```
func (v *VolumeService) Delete(ctx context.Context, volume *types.Volume) error
```

Delete permanently removes a volume and all its data.

This operation is irreversible. Ensure no sandboxes are using the volume before deletion.

Parameters:

- volume: The volume to delete

Example:

```
err := client.Volume.Delete(ctx, volume)

if err != nil {

    return err

}
```

Returns an error if deletion fails.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-volumeservice-get) func (\*VolumeService) Get

[Section titled “func (\*VolumeService) Get”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-volumeservice-get)

```
func (v *VolumeService) Get(ctx context.Context, name string) (*types.Volume, error)
```

Get retrieves a volume by its name.

Parameters:

- name: The volume name

Example:

```
volume, err := client.Volume.Get(ctx, "my-data-volume")

if err != nil {

    return err

}

fmt.Printf("Volume state: %s\n", volume.State)
```

Returns the \[types.Volume\] or an error if not found.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-volumeservice-list) func (\*VolumeService) List

[Section titled “func (\*VolumeService) List”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-volumeservice-list)

```
func (v *VolumeService) List(ctx context.Context) ([]*types.Volume, error)
```

List returns all volumes in the organization.

Example:

```
volumes, err := client.Volume.List(ctx)

if err != nil {

    return err

}

for _, vol := range volumes {

    fmt.Printf("Volume %s: %s\n", vol.Name, vol.State)

}
```

Returns a slice of \[types.Volume\] or an error if the request fails.

### [\#](https://www.daytona.io/docs/en/go-sdk/daytona/\#func-volumeservice-waitforready) func (\*VolumeService) WaitForReady

[Section titled “func (\*VolumeService) WaitForReady”](https://www.daytona.io/docs/en/go-sdk/daytona/#func-volumeservice-waitforready)

```
func (v *VolumeService) WaitForReady(ctx context.Context, volume *types.Volume, timeout time.Duration) (*types.Volume, error)
```

WaitForReady waits for a volume to reach the “ready” state.

This method polls the volume status until it becomes ready, reaches an error state, or the timeout expires. The polling interval is 1 second.

Parameters:

- volume: The volume to wait for
- timeout: Maximum time to wait for the volume to become ready

Example:

```
volume, err := client.Volume.Create(ctx, "my-volume")

if err != nil {

    return err

}

// Wait up to 2 minutes for the volume to be ready

volume, err = client.Volume.WaitForReady(ctx, volume, 2*time.Minute)

if err != nil {

    return fmt.Errorf("volume failed to become ready: %w", err)

}
```

Returns the updated \[types.Volume\] when ready, or an error if the timeout expires or the volume enters an error state.