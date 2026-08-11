---
url: "https://www.daytona.io/docs/en/go-sdk/types/"
title: "types | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/go-sdk/types/#_top)

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/go-sdk/types.md)Open

# types

[Section titled “types”](https://www.daytona.io/docs/en/go-sdk/types/#types)

```
import "github.com/daytona/clients/sdk-go/pkg/types"
```

## [\#](https://www.daytona.io/docs/en/go-sdk/types/\#index) Index

[Section titled “Index”](https://www.daytona.io/docs/en/go-sdk/types/#index)

- [Constants](https://www.daytona.io/docs/en/go-sdk/types/#constants)
- [type Chart](https://www.daytona.io/docs/en/go-sdk/types/#Chart)
- [type CodeLanguage](https://www.daytona.io/docs/en/go-sdk/types/#CodeLanguage)
- [type CodeRunParams](https://www.daytona.io/docs/en/go-sdk/types/#CodeRunParams)
- [type CreateSecretParams](https://www.daytona.io/docs/en/go-sdk/types/#CreateSecretParams)
- [type CreateSnapshotParams](https://www.daytona.io/docs/en/go-sdk/types/#CreateSnapshotParams)
- [type DaytonaConfig](https://www.daytona.io/docs/en/go-sdk/types/#DaytonaConfig)
- [type ExecuteResponse](https://www.daytona.io/docs/en/go-sdk/types/#ExecuteResponse)
- [type ExecutionArtifacts](https://www.daytona.io/docs/en/go-sdk/types/#ExecutionArtifacts)
- [type ExecutionError](https://www.daytona.io/docs/en/go-sdk/types/#ExecutionError)
- [type ExecutionResult](https://www.daytona.io/docs/en/go-sdk/types/#ExecutionResult)
- [type ExperimentalConfig](https://www.daytona.io/docs/en/go-sdk/types/#ExperimentalConfig)
- [type FileDownloadRequest](https://www.daytona.io/docs/en/go-sdk/types/#FileDownloadRequest)
- [type FileDownloadResponse](https://www.daytona.io/docs/en/go-sdk/types/#FileDownloadResponse)
- [type FileInfo](https://www.daytona.io/docs/en/go-sdk/types/#FileInfo)
- [type FileStatus](https://www.daytona.io/docs/en/go-sdk/types/#FileStatus)
- [type FileUpload](https://www.daytona.io/docs/en/go-sdk/types/#FileUpload)
- [type GitCommitResponse](https://www.daytona.io/docs/en/go-sdk/types/#GitCommitResponse)
- [type GitRemote](https://www.daytona.io/docs/en/go-sdk/types/#GitRemote)
- [type GitStatus](https://www.daytona.io/docs/en/go-sdk/types/#GitStatus)
- [type GpuType](https://www.daytona.io/docs/en/go-sdk/types/#GpuType)
- [type ImageParams](https://www.daytona.io/docs/en/go-sdk/types/#ImageParams)
- [type ListSecretsQuery](https://www.daytona.io/docs/en/go-sdk/types/#ListSecretsQuery)
- [type ListSecretsResponse](https://www.daytona.io/docs/en/go-sdk/types/#ListSecretsResponse)
- [type LspLanguageID](https://www.daytona.io/docs/en/go-sdk/types/#LspLanguageID)
- [type OutputMessage](https://www.daytona.io/docs/en/go-sdk/types/#OutputMessage)
- [type PaginatedSnapshots](https://www.daytona.io/docs/en/go-sdk/types/#PaginatedSnapshots)
- [type Position](https://www.daytona.io/docs/en/go-sdk/types/#Position)
- [type PreviewLink](https://www.daytona.io/docs/en/go-sdk/types/#PreviewLink)
- [type PtyResult](https://www.daytona.io/docs/en/go-sdk/types/#PtyResult)
- [type PtySessionInfo](https://www.daytona.io/docs/en/go-sdk/types/#PtySessionInfo)
- [type PtySize](https://www.daytona.io/docs/en/go-sdk/types/#PtySize)
- [type Resources](https://www.daytona.io/docs/en/go-sdk/types/#Resources)
- [type SandboxBaseParams](https://www.daytona.io/docs/en/go-sdk/types/#SandboxBaseParams)
- [type SandboxClass](https://www.daytona.io/docs/en/go-sdk/types/#SandboxClass)
- [type ScreenshotOptions](https://www.daytona.io/docs/en/go-sdk/types/#ScreenshotOptions)
- [type ScreenshotRegion](https://www.daytona.io/docs/en/go-sdk/types/#ScreenshotRegion)
- [type ScreenshotResponse](https://www.daytona.io/docs/en/go-sdk/types/#ScreenshotResponse)
- [type Secret](https://www.daytona.io/docs/en/go-sdk/types/#Secret)
- [type SignedPreviewLink](https://www.daytona.io/docs/en/go-sdk/types/#SignedPreviewLink)
- [type Snapshot](https://www.daytona.io/docs/en/go-sdk/types/#Snapshot)
- [type SnapshotParams](https://www.daytona.io/docs/en/go-sdk/types/#SnapshotParams)
- [type UpdateSecretParams](https://www.daytona.io/docs/en/go-sdk/types/#UpdateSecretParams)
- [type Volume](https://www.daytona.io/docs/en/go-sdk/types/#Volume)
- [type VolumeMount](https://www.daytona.io/docs/en/go-sdk/types/#VolumeMount)

## [\#](https://www.daytona.io/docs/en/go-sdk/types/\#constants) Constants

[Section titled “Constants”](https://www.daytona.io/docs/en/go-sdk/types/#constants)

```
const CodeToolboxLanguageLabel = "code-toolbox-language"
```

## [\#](https://www.daytona.io/docs/en/go-sdk/types/\#type-chart) type Chart

[Section titled “type Chart”](https://www.daytona.io/docs/en/go-sdk/types/#type-chart)

```
type Chart = toolbox.Chart
```

## [\#](https://www.daytona.io/docs/en/go-sdk/types/\#type-codelanguage) type CodeLanguage

[Section titled “type CodeLanguage”](https://www.daytona.io/docs/en/go-sdk/types/#type-codelanguage)

CodeLanguage

```
type CodeLanguage string
```

```
const (

    CodeLanguagePython     CodeLanguage = "python"

    CodeLanguageJavaScript CodeLanguage = "javascript"

    CodeLanguageTypeScript CodeLanguage = "typescript"

)
```

## [\#](https://www.daytona.io/docs/en/go-sdk/types/\#type-coderunparams) type CodeRunParams

[Section titled “type CodeRunParams”](https://www.daytona.io/docs/en/go-sdk/types/#type-coderunparams)

CodeRunParams represents parameters for code execution

```
type CodeRunParams struct {

    Argv []string

    Env  map[string]string

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/types/\#type-createsecretparams) type CreateSecretParams

[Section titled “type CreateSecretParams”](https://www.daytona.io/docs/en/go-sdk/types/#type-createsecretparams)

CreateSecretParams contains parameters for creating a secret.

```
type CreateSecretParams struct {

    // Name is the secret name. It must match ^[a-zA-Z_][a-zA-Z0-9_-]*$ and be

    // unique within the organization (a duplicate name returns a 409 conflict).

    Name string

    // Value is the plaintext secret value. It is write-only and never returned.

    Value string

    // Description is an optional human-readable description.

    Description *string

    // Hosts are the allowed hosts this secret may be sent to. Entries are exact

    // hostnames or "*." wildcards (without ports).

    Hosts []string

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/types/\#type-createsnapshotparams) type CreateSnapshotParams

[Section titled “type CreateSnapshotParams”](https://www.daytona.io/docs/en/go-sdk/types/#type-createsnapshotparams)

CreateSnapshotParams represents parameters for creating a snapshot

```
type CreateSnapshotParams struct {

    Name           string

    Image          any // string or *Image

    Resources      *Resources

    Entrypoint     []string

    SkipValidation *bool

    SandboxClass   *SandboxClass

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/types/\#type-daytonaconfig) type DaytonaConfig

[Section titled “type DaytonaConfig”](https://www.daytona.io/docs/en/go-sdk/types/#type-daytonaconfig)

DaytonaConfig represents the configuration for the Daytona client. When a field is nil, the client will fall back to environment variables or defaults.

```
type DaytonaConfig struct {

    APIKey         string

    JWTToken       string

    OrganizationID string

    APIUrl         string

    Target         string

    OtelEnabled    bool // Enable OpenTelemetry tracing for SDK operations.

    // UseDeprecatedPolling observes sandbox state by legacy polling instead of

    // WebSocket event streaming. Defaults to false (event streaming). Can also be

    // enabled via the DAYTONA_USE_DEPRECATED_POLLING environment variable.

    //

    // Deprecated: polling-only mode will be removed in a future release; event

    // streaming is the default and falls back to polling automatically when

    // WebSockets are unavailable.

    UseDeprecatedPolling *bool

    // Timeout overrides the default per-request HTTP timeout (60s). A

    // non-positive value disables the client-wide timeout entirely. Executions

    // with an explicit execution timeout are not capped by this value.

    Timeout *time.Duration

    // HTTPClient supplies a custom *http.Client for API requests. It is copied

    // before use (Transport shared); Timeout, when set, overrides the copy's.

    HTTPClient   *http.Client

    Experimental *ExperimentalConfig

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/types/\#type-executeresponse) type ExecuteResponse

[Section titled “type ExecuteResponse”](https://www.daytona.io/docs/en/go-sdk/types/#type-executeresponse)

ExecuteResponse represents a command execution response

```
type ExecuteResponse struct {

    ExitCode  int

    Result    string

    Artifacts *ExecutionArtifacts // nil when no artifacts available

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/types/\#type-executionartifacts) type ExecutionArtifacts

[Section titled “type ExecutionArtifacts”](https://www.daytona.io/docs/en/go-sdk/types/#type-executionartifacts)

ExecutionArtifacts represents execution output artifacts

```
type ExecutionArtifacts struct {

    Stdout string

    Charts []Chart

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/types/\#type-executionerror) type ExecutionError

[Section titled “type ExecutionError”](https://www.daytona.io/docs/en/go-sdk/types/#type-executionerror)

ExecutionError represents a code execution error

```
type ExecutionError struct {

    Name      string

    Value     string

    Traceback *string // Optional stack trace; nil when not available

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/types/\#type-executionresult) type ExecutionResult

[Section titled “type ExecutionResult”](https://www.daytona.io/docs/en/go-sdk/types/#type-executionresult)

ExecutionResult represents code interpreter execution result

```
type ExecutionResult struct {

    Stdout string

    Stderr string

    Charts []Chart         // Optional charts from matplotlib

    Error  *ExecutionError // nil = success, non-nil = execution failed

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/types/\#type-experimentalconfig) type ExperimentalConfig

[Section titled “type ExperimentalConfig”](https://www.daytona.io/docs/en/go-sdk/types/#type-experimentalconfig)

ExperimentalConfig holds experimental feature flags for the Daytona client.

```
type ExperimentalConfig struct {

    // Deprecated: use DaytonaConfig.OtelEnabled. Kept for backwards compatibility.

    OtelEnabled bool

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/types/\#type-filedownloadrequest) type FileDownloadRequest

[Section titled “type FileDownloadRequest”](https://www.daytona.io/docs/en/go-sdk/types/#type-filedownloadrequest)

FileDownloadRequest

```
type FileDownloadRequest struct {

    Source      string

    Destination *string // nil = download to memory (return []byte), non-nil = save to file path

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/types/\#type-filedownloadresponse) type FileDownloadResponse

[Section titled “type FileDownloadResponse”](https://www.daytona.io/docs/en/go-sdk/types/#type-filedownloadresponse)

FileDownloadResponse represents a file download response

```
type FileDownloadResponse struct {

    Source string

    Result any     // []byte or string (path)

    Error  *string // nil = success, non-nil = error message

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/types/\#type-fileinfo) type FileInfo

[Section titled “type FileInfo”](https://www.daytona.io/docs/en/go-sdk/types/#type-fileinfo)

FileInfo represents file metadata

```
type FileInfo struct {

    Name         string

    Path         string

    Size         int64

    Mode         string

    ModifiedTime time.Time

    IsDirectory  bool

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/types/\#type-filestatus) type FileStatus

[Section titled “type FileStatus”](https://www.daytona.io/docs/en/go-sdk/types/#type-filestatus)

FileStatus represents the status of a file in git

```
type FileStatus struct {

    Path   string

    Status string

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/types/\#type-fileupload) type FileUpload

[Section titled “type FileUpload”](https://www.daytona.io/docs/en/go-sdk/types/#type-fileupload)

FileUpload represents a file to upload

```
type FileUpload struct {

    Source      any // []byte or string (path)

    Destination string

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/types/\#type-gitcommitresponse) type GitCommitResponse

[Section titled “type GitCommitResponse”](https://www.daytona.io/docs/en/go-sdk/types/#type-gitcommitresponse)

GitCommitResponse

```
type GitCommitResponse struct {

    SHA string

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/types/\#type-gitremote) type GitRemote

[Section titled “type GitRemote”](https://www.daytona.io/docs/en/go-sdk/types/#type-gitremote)

GitRemote describes a configured Git remote.

```
type GitRemote struct {

    Name string

    URL  string

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/types/\#type-gitstatus) type GitStatus

[Section titled “type GitStatus”](https://www.daytona.io/docs/en/go-sdk/types/#type-gitstatus)

GitStatus represents git repository status

```
type GitStatus struct {

    CurrentBranch   string

    Ahead           int

    Behind          int

    BranchPublished bool

    FileStatus      []FileStatus

    // Detached is true when HEAD is not on a branch (detached HEAD state).

    Detached bool

    // Upstream is the upstream tracking branch (e.g. "origin/main"), empty when unset.

    Upstream string

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/types/\#type-gputype) type GpuType

[Section titled “type GpuType”](https://www.daytona.io/docs/en/go-sdk/types/#type-gputype)

GpuType identifies a specific NVIDIA GPU model. Used in \[Resources.GpuType\] as an ordered preference list — the scheduler tries each in order and pins the sandbox/snapshot to the first that has capacity. It is an alias for the API client’s GpuType type.

```
type GpuType = apiclient.GpuType
```

```
const (

    GpuTypeH100       GpuType = apiclient.GPUTYPE_H100

    GpuTypeRtxPro6000 GpuType = apiclient.GPUTYPE_RTX_PRO_6000

)
```

## [\#](https://www.daytona.io/docs/en/go-sdk/types/\#type-imageparams) type ImageParams

[Section titled “type ImageParams”](https://www.daytona.io/docs/en/go-sdk/types/#type-imageparams)

ImageParams represents parameters for creating a sandbox from an image

```
type ImageParams struct {

    SandboxBaseParams

    Image     any // string or *Image

    Resources *Resources

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/types/\#type-listsecretsquery) type ListSecretsQuery

[Section titled “type ListSecretsQuery”](https://www.daytona.io/docs/en/go-sdk/types/#type-listsecretsquery)

ListSecretsQuery contains query parameters for filtering, sorting, and paginating when listing secrets. All fields are optional.

```
type ListSecretsQuery struct {

    // Pagination cursor from a previous response's NextCursor

    Cursor *string

    // Number of results per page (1-200, default 100)

    Limit *int

    // Filter by partial name match

    Name *string

    // Sort by field: "name", "createdAt", or "updatedAt" (default "createdAt")

    Sort *string

    // Sort direction: "asc" or "desc" (default "desc")

    Order *string

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/types/\#type-listsecretsresponse) type ListSecretsResponse

[Section titled “type ListSecretsResponse”](https://www.daytona.io/docs/en/go-sdk/types/#type-listsecretsresponse)

ListSecretsResponse represents a paginated list of secrets

```
type ListSecretsResponse struct {

    Items []*Secret

    // Total number of secrets matching the filters

    Total int

    // Cursor for the next page of results; nil when there are no further pages

    NextCursor *string

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/types/\#type-lsplanguageid) type LspLanguageID

[Section titled “type LspLanguageID”](https://www.daytona.io/docs/en/go-sdk/types/#type-lsplanguageid)

```
type LspLanguageID string
```

```
const (

    LspLanguagePython     LspLanguageID = "python"

    LspLanguageJavaScript LspLanguageID = "javascript"

    LspLanguageTypeScript LspLanguageID = "typescript"

)
```

## [\#](https://www.daytona.io/docs/en/go-sdk/types/\#type-outputmessage) type OutputMessage

[Section titled “type OutputMessage”](https://www.daytona.io/docs/en/go-sdk/types/#type-outputmessage)

OutputMessage represents an output message

```
type OutputMessage struct {

    Type      string `json:"type"`

    Text      string `json:"text"`

    Name      string `json:"name"`

    Value     string `json:"value"`

    Traceback string `json:"traceback"`

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/types/\#type-paginatedsnapshots) type PaginatedSnapshots

[Section titled “type PaginatedSnapshots”](https://www.daytona.io/docs/en/go-sdk/types/#type-paginatedsnapshots)

PaginatedSnapshots represents a paginated list of snapshots

```
type PaginatedSnapshots struct {

    Items      []*Snapshot

    Total      int

    Page       int

    TotalPages int

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/types/\#type-position) type Position

[Section titled “type Position”](https://www.daytona.io/docs/en/go-sdk/types/#type-position)

Position represents a position in a document

```
type Position struct {

    Line      int // zero-based

    Character int // zero-based

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/types/\#type-previewlink) type PreviewLink

[Section titled “type PreviewLink”](https://www.daytona.io/docs/en/go-sdk/types/#type-previewlink)

PreviewLink contains the URL and authentication token for a sandbox preview.

```
type PreviewLink struct {

    URL   string

    Token string

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/types/\#type-ptyresult) type PtyResult

[Section titled “type PtyResult”](https://www.daytona.io/docs/en/go-sdk/types/#type-ptyresult)

PtyResult represents PTY session exit information

```
type PtyResult struct {

    ExitCode *int    // nil = process still running, non-nil = exit code

    Error    *string // nil = success, non-nil = error message

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/types/\#type-ptysessioninfo) type PtySessionInfo

[Section titled “type PtySessionInfo”](https://www.daytona.io/docs/en/go-sdk/types/#type-ptysessioninfo)

PtySessionInfo represents PTY session information

```
type PtySessionInfo struct {

    ID        string

    Active    bool

    CWD       string // Current working directory; may be empty unavailable

    Cols      int

    Rows      int

    ProcessID *int // Process ID; may be nil if unavailable

    CreatedAt time.Time

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/types/\#type-ptysize) type PtySize

[Section titled “type PtySize”](https://www.daytona.io/docs/en/go-sdk/types/#type-ptysize)

PtySize represents terminal dimensions

```
type PtySize struct {

    Rows int

    Cols int

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/types/\#type-resources) type Resources

[Section titled “type Resources”](https://www.daytona.io/docs/en/go-sdk/types/#type-resources)

Resources represents resource allocation for a sandbox.

```
type Resources struct {

    CPU     int

    GPU     int

    GpuType []GpuType

    Memory  int

    Disk    int

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/types/\#type-sandboxbaseparams) type SandboxBaseParams

[Section titled “type SandboxBaseParams”](https://www.daytona.io/docs/en/go-sdk/types/#type-sandboxbaseparams)

SandboxBaseParams contains common parameters for sandbox creation.

```
type SandboxBaseParams struct {

    Name                string

    User                string

    Language            CodeLanguage

    EnvVars             map[string]string

    Labels              map[string]string

    Public              bool

    AutoStopInterval    *int // nil = no auto-stop, 0 = immediate stop

    AutoPauseInterval   *int // nil = server default when AutoStopInterval is also nil (60 for non-ephemeral pause-supporting classes, with auto-stop disabled), 0 = disabled. Only supported for sandbox classes that support pausing. Not allowed for ephemeral sandboxes. At most one of AutoPauseInterval and AutoStopInterval may be non-zero.

    AutoArchiveInterval *int // nil = no auto-archive, 0 = immediate archive

    AutoDeleteInterval  *int // nil = no auto-delete, 0 = immediate delete

    TtlMinutes          *int // Wall-clock max lifetime in minutes; 0 disables TTL

    Volumes             []VolumeMount

    // Secrets maps an environment variable name to the name of an existing

    // organization secret. For each entry, the env var is injected into the

    // sandbox holding the secret's opaque placeholder, which is resolved to the

    // real value only when the sandbox connects to one of the secret's allowed

    // hosts. The referenced secrets must already exist (see [Client.Secret]).

    Secrets          map[string]string

    NetworkBlockAll  bool

    NetworkAllowList *string

    DomainAllowList  *string

    Ephemeral        bool

    // LinkedSandbox is the ID or name of an existing sandbox to link the new sandbox to.

    // The new sandbox will be scheduled on the same runner as the linked sandbox so a local

    // network can be established between them.

    // Linked sandboxes must be ephemeral (AutoDeleteInterval=0) and cannot themselves be

    // linked to another sandbox.

    LinkedSandbox string

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/types/\#type-sandboxclass) type SandboxClass

[Section titled “type SandboxClass”](https://www.daytona.io/docs/en/go-sdk/types/#type-sandboxclass)

SandboxClass determines which runners can host sandboxes created from a snapshot. It is an alias for the API client’s SandboxClass type.

```
type SandboxClass = apiclient.SandboxClass
```

```
const (

    SandboxClassLinuxVM   SandboxClass = apiclient.SANDBOXCLASS_LINUX_VM

    SandboxClassContainer SandboxClass = apiclient.SANDBOXCLASS_CONTAINER

    SandboxClassAndroid   SandboxClass = apiclient.SANDBOXCLASS_ANDROID

)
```

## [\#](https://www.daytona.io/docs/en/go-sdk/types/\#type-screenshotoptions) type ScreenshotOptions

[Section titled “type ScreenshotOptions”](https://www.daytona.io/docs/en/go-sdk/types/#type-screenshotoptions)

```
type ScreenshotOptions struct {

    ShowCursor *bool    // nil = default, true = show, false = hide

    Format     *string  // nil = default format (PNG), or "jpeg", "webp", etc.

    Quality    *int     // nil = default quality, 0-100 for JPEG/WebP

    Scale      *float64 // nil = 1.0, scaling factor for the screenshot

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/types/\#type-screenshotregion) type ScreenshotRegion

[Section titled “type ScreenshotRegion”](https://www.daytona.io/docs/en/go-sdk/types/#type-screenshotregion)

ScreenshotRegion represents a screenshot region

```
type ScreenshotRegion struct {

    X      int

    Y      int

    Width  int

    Height int

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/types/\#type-screenshotresponse) type ScreenshotResponse

[Section titled “type ScreenshotResponse”](https://www.daytona.io/docs/en/go-sdk/types/#type-screenshotresponse)

```
type ScreenshotResponse struct {

    Image     string // base64-encoded image data

    Width     int

    Height    int

    SizeBytes *int // Size in bytes

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/types/\#type-secret) type Secret

[Section titled “type Secret”](https://www.daytona.io/docs/en/go-sdk/types/#type-secret)

Secret represents an organization-scoped secret.

A Secret stores a write-only plaintext value that is never returned by the API. When referenced from a sandbox, the env var holds the opaque \[Secret.Placeholder\] token, which is resolved to the real value only for the secret’s allowed \[Secret.Hosts\].

```
type Secret struct {

    ID          string  `json:"id"`

    Name        string  `json:"name"`

    Description *string `json:"description,omitempty"`

    // Placeholder is the opaque token injected as the env var value in sandboxes.

    Placeholder string `json:"placeholder"`

    // Hosts are the allowed hosts this secret may be sent to. Entries are exact

    // hostnames or "*." wildcards (without ports).

    Hosts     []string  `json:"hosts"`

    CreatedAt time.Time `json:"createdAt"`

    UpdatedAt time.Time `json:"updatedAt"`

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/types/\#type-signedpreviewlink) type SignedPreviewLink

[Section titled “type SignedPreviewLink”](https://www.daytona.io/docs/en/go-sdk/types/#type-signedpreviewlink)

SignedPreviewLink contains the signed URL, authentication token, port, and sandbox ID for a sandbox preview.

```
type SignedPreviewLink struct {

    SandboxID string

    Port      int

    Token     string

    URL       string

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/types/\#type-snapshot) type Snapshot

[Section titled “type Snapshot”](https://www.daytona.io/docs/en/go-sdk/types/#type-snapshot)

Snapshot represents a Daytona snapshot

```
type Snapshot struct {

    ID             string     `json:"id"`

    OrganizationID string     `json:"organizationId,omitempty"`

    General        bool       `json:"general"`

    Name           string     `json:"name"`

    ImageName      string     `json:"imageName,omitempty"`

    State          string     `json:"state"`

    Size           *float64   `json:"size,omitempty"`

    Entrypoint     []string   `json:"entrypoint,omitempty"`

    CPU            int        `json:"cpu"`

    GPU            int        `json:"gpu"`

    Memory         int        `json:"mem"` // API uses "mem" not "memory"

    Disk           int        `json:"disk"`

    ErrorReason    *string    `json:"errorReason,omitempty"` // nil = success, non-nil = error reason if snapshot failed

    SkipValidation bool       `json:"skipValidation"`

    CreatedAt      time.Time  `json:"createdAt"`

    UpdatedAt      time.Time  `json:"updatedAt"`

    LastUsedAt     *time.Time `json:"lastUsedAt,omitempty"`

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/types/\#type-snapshotparams) type SnapshotParams

[Section titled “type SnapshotParams”](https://www.daytona.io/docs/en/go-sdk/types/#type-snapshotparams)

SnapshotParams represents parameters for creating a sandbox from a snapshot

```
type SnapshotParams struct {

    SandboxBaseParams

    Snapshot string

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/types/\#type-updatesecretparams) type UpdateSecretParams

[Section titled “type UpdateSecretParams”](https://www.daytona.io/docs/en/go-sdk/types/#type-updatesecretparams)

UpdateSecretParams contains parameters for updating a secret. Only the non-nil fields are applied.

```
type UpdateSecretParams struct {

    // Value is the new plaintext secret value. It is write-only and never returned.

    Value *string

    // Description is an optional human-readable description.

    Description *string

    // Hosts are the allowed hosts this secret may be sent to. Entries are exact

    // hostnames or "*." wildcards (without ports).

    Hosts []string

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/types/\#type-volume) type Volume

[Section titled “type Volume”](https://www.daytona.io/docs/en/go-sdk/types/#type-volume)

Volume represents a Daytona volume

```
type Volume struct {

    ID             string    `json:"id"`

    Name           string    `json:"name"`

    OrganizationID string    `json:"organizationId"`

    State          string    `json:"state"`

    ErrorReason    *string   `json:"errorReason,omitempty"`

    CreatedAt      time.Time `json:"createdAt"`

    UpdatedAt      time.Time `json:"updatedAt"`

    LastUsedAt     time.Time `json:"lastUsedAt,omitempty"`

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/types/\#type-volumemount) type VolumeMount

[Section titled “type VolumeMount”](https://www.daytona.io/docs/en/go-sdk/types/#type-volumemount)

VolumeMount represents a volume mount configuration

```
type VolumeMount struct {

    VolumeID  string // ID or name of the volume to mount

    MountPath string

    Subpath   *string // Optional subpath within the volume; nil = mount entire volume

}
```