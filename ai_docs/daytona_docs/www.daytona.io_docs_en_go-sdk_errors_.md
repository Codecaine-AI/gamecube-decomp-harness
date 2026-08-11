---
url: "https://www.daytona.io/docs/en/go-sdk/errors/"
title: "errors | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/go-sdk/errors/#_top)

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/go-sdk/errors.md)Open

# errors

[Section titled “errors”](https://www.daytona.io/docs/en/go-sdk/errors/#errors)

```
import "github.com/daytona/clients/sdk-go/pkg/errors"
```

Package errors defines the typed error model used by the Daytona Go SDK.

Every error returned by the SDK is a \`\*DaytonaError\` carrying a human-readable message, the HTTP \`StatusCode\` (when applicable), an optional machine-readable \`Code\` / \`Source\` pair, and the response \`Headers\`. There are no per-status struct types — a single concrete type keeps the surface small and unambiguous.

Branching is done with \`errors.Is\` against the package-level sentinels:

```
if errors.Is(err, sdkerrors.ErrNotFound) {

    // any HTTP 404 from any source

}

if errors.Is(err, sdkerrors.ErrGitAuthFailed) {

    // precisely DAYTONA_DAEMON / GIT_AUTH_FAILED

}

if errors.Is(err, sdkerrors.ErrAuthentication) {

    // the same git-auth error ALSO matches the broader 401 sentinel,

    // mirroring the inheritance hierarchy of the other Daytona SDKs.

}
```

Reading metadata off an error is done with \`errors.As\`:

```
var de *sdkerrors.DaytonaError

if errors.As(err, &de) {

    log.Printf("status=%d code=%s source=%s", de.StatusCode, de.Code, de.Source)

}
```

## [\#](https://www.daytona.io/docs/en/go-sdk/errors/\#index) Index

[Section titled “Index”](https://www.daytona.io/docs/en/go-sdk/errors/#index)

- [Constants](https://www.daytona.io/docs/en/go-sdk/errors/#constants)
- [Variables](https://www.daytona.io/docs/en/go-sdk/errors/#variables)
- [func ConvertAPIError(err error, httpResp \*http.Response) error](https://www.daytona.io/docs/en/go-sdk/errors/#ConvertAPIError)
- [func ConvertToolboxError(err error, httpResp \*http.Response) error](https://www.daytona.io/docs/en/go-sdk/errors/#ConvertToolboxError)
- [type DaytonaAuthenticationError](https://www.daytona.io/docs/en/go-sdk/errors/#DaytonaAuthenticationError)
  - [func NewDaytonaAuthenticationError(message string, headers http.Header) \*DaytonaAuthenticationError](https://www.daytona.io/docs/en/go-sdk/errors/#NewDaytonaAuthenticationError)
  - [func (e \*DaytonaAuthenticationError) Unwrap() error](https://www.daytona.io/docs/en/go-sdk/errors/#DaytonaAuthenticationError.Unwrap)
- [type DaytonaConflictError](https://www.daytona.io/docs/en/go-sdk/errors/#DaytonaConflictError)
  - [func NewDaytonaConflictError(message string, headers http.Header) \*DaytonaConflictError](https://www.daytona.io/docs/en/go-sdk/errors/#NewDaytonaConflictError)
  - [func (e \*DaytonaConflictError) Unwrap() error](https://www.daytona.io/docs/en/go-sdk/errors/#DaytonaConflictError.Unwrap)
- [type DaytonaError](https://www.daytona.io/docs/en/go-sdk/errors/#DaytonaError)
  - [func NewDaytonaConnectionError(message string) \*DaytonaError](https://www.daytona.io/docs/en/go-sdk/errors/#NewDaytonaConnectionError)
  - [func NewDaytonaError(message string, statusCode int, headers http.Header) \*DaytonaError](https://www.daytona.io/docs/en/go-sdk/errors/#NewDaytonaError)
  - [func NewDaytonaErrorFromBody(body \[\]byte, statusCode int, headers http.Header) \*DaytonaError](https://www.daytona.io/docs/en/go-sdk/errors/#NewDaytonaErrorFromBody)
  - [func NewDaytonaTimeoutError(message string) \*DaytonaError](https://www.daytona.io/docs/en/go-sdk/errors/#NewDaytonaTimeoutError)
  - [func NewDaytonaValidationError(message string, headers http.Header) \*DaytonaError](https://www.daytona.io/docs/en/go-sdk/errors/#NewDaytonaValidationError)
  - [func (e \*DaytonaError) As(target any) bool](https://www.daytona.io/docs/en/go-sdk/errors/#DaytonaError.As)
  - [func (e \*DaytonaError) Error() string](https://www.daytona.io/docs/en/go-sdk/errors/#DaytonaError.Error)
  - [func (e \*DaytonaError) Is(target error) bool](https://www.daytona.io/docs/en/go-sdk/errors/#DaytonaError.Is)
- [type DaytonaForbiddenError](https://www.daytona.io/docs/en/go-sdk/errors/#DaytonaForbiddenError)
  - [func NewDaytonaForbiddenError(message string, headers http.Header) \*DaytonaForbiddenError](https://www.daytona.io/docs/en/go-sdk/errors/#NewDaytonaForbiddenError)
  - [func (e \*DaytonaForbiddenError) Unwrap() error](https://www.daytona.io/docs/en/go-sdk/errors/#DaytonaForbiddenError.Unwrap)
- [type DaytonaNotFoundError](https://www.daytona.io/docs/en/go-sdk/errors/#DaytonaNotFoundError)
  - [func NewDaytonaNotFoundError(message string, headers http.Header) \*DaytonaNotFoundError](https://www.daytona.io/docs/en/go-sdk/errors/#NewDaytonaNotFoundError)
  - [func (e \*DaytonaNotFoundError) Unwrap() error](https://www.daytona.io/docs/en/go-sdk/errors/#DaytonaNotFoundError.Unwrap)
- [type DaytonaRateLimitError](https://www.daytona.io/docs/en/go-sdk/errors/#DaytonaRateLimitError)
  - [func NewDaytonaRateLimitError(message string, headers http.Header) \*DaytonaRateLimitError](https://www.daytona.io/docs/en/go-sdk/errors/#NewDaytonaRateLimitError)
  - [func (e \*DaytonaRateLimitError) Unwrap() error](https://www.daytona.io/docs/en/go-sdk/errors/#DaytonaRateLimitError.Unwrap)
- [type DaytonaServerError](https://www.daytona.io/docs/en/go-sdk/errors/#DaytonaServerError)
  - [func NewDaytonaServerError(message string, statusCode int, headers http.Header) \*DaytonaServerError](https://www.daytona.io/docs/en/go-sdk/errors/#NewDaytonaServerError)
  - [func (e \*DaytonaServerError) Unwrap() error](https://www.daytona.io/docs/en/go-sdk/errors/#DaytonaServerError.Unwrap)
- [type DaytonaTimeoutError](https://www.daytona.io/docs/en/go-sdk/errors/#DaytonaTimeoutError)
  - [func (e \*DaytonaTimeoutError) Unwrap() error](https://www.daytona.io/docs/en/go-sdk/errors/#DaytonaTimeoutError.Unwrap)
- [type DaytonaValidationError](https://www.daytona.io/docs/en/go-sdk/errors/#DaytonaValidationError)
  - [func (e \*DaytonaValidationError) Unwrap() error](https://www.daytona.io/docs/en/go-sdk/errors/#DaytonaValidationError.Unwrap)

## [\#](https://www.daytona.io/docs/en/go-sdk/errors/\#constants) Constants

[Section titled “Constants”](https://www.daytona.io/docs/en/go-sdk/errors/#constants)

```
const (

    SourceAPI    = "DAYTONA_API"

    SourceDaemon = "DAYTONA_DAEMON"

    SourceProxy  = "DAYTONA_PROXY"

)
```

## [\#](https://www.daytona.io/docs/en/go-sdk/errors/\#variables) Variables

[Section titled “Variables”](https://www.daytona.io/docs/en/go-sdk/errors/#variables)

```
var (

    // HTTP status-class sentinels. Names follow HTTP terminology.

    ErrBadRequest          = &DaytonaError{StatusCode: http.StatusBadRequest}

    ErrAuthentication      = &DaytonaError{StatusCode: http.StatusUnauthorized}

    ErrForbidden           = &DaytonaError{StatusCode: http.StatusForbidden}

    ErrNotFound            = &DaytonaError{StatusCode: http.StatusNotFound}

    ErrTimeout             = &DaytonaError{StatusCode: http.StatusRequestTimeout}

    ErrConflict            = &DaytonaError{StatusCode: http.StatusConflict}

    ErrGone                = &DaytonaError{StatusCode: http.StatusGone}

    ErrUnprocessableEntity = &DaytonaError{StatusCode: http.StatusUnprocessableEntity}

    ErrRateLimit           = &DaytonaError{StatusCode: http.StatusTooManyRequests}

    ErrInternalServer      = &DaytonaError{StatusCode: http.StatusInternalServerError}

    ErrBadGateway          = &DaytonaError{StatusCode: http.StatusBadGateway}

    ErrServiceUnavailable  = &DaytonaError{StatusCode: http.StatusServiceUnavailable}

    ErrGatewayTimeout      = &DaytonaError{StatusCode: http.StatusGatewayTimeout}

    // Deprecated: use ErrBadRequest. Kept so existing callers do not break.

    ErrValidation = ErrBadRequest

    // Deprecated: use ErrForbidden. Kept so existing callers do not break.

    ErrAuthorization = ErrForbidden

    // Daemon: git.

    ErrGitAuthFailed     = &DaytonaError{Source: SourceDaemon, Code: "GIT_AUTH_FAILED"}

    ErrGitRepoNotFound   = &DaytonaError{Source: SourceDaemon, Code: "GIT_REPO_NOT_FOUND"}

    ErrGitBranchNotFound = &DaytonaError{Source: SourceDaemon, Code: "GIT_BRANCH_NOT_FOUND"}

    ErrGitBranchExists   = &DaytonaError{Source: SourceDaemon, Code: "GIT_BRANCH_EXISTS"}

    ErrGitPushRejected   = &DaytonaError{Source: SourceDaemon, Code: "GIT_PUSH_REJECTED"}

    ErrGitDirtyWorktree  = &DaytonaError{Source: SourceDaemon, Code: "GIT_DIRTY_WORKTREE"}

    ErrGitMergeConflict  = &DaytonaError{Source: SourceDaemon, Code: "GIT_MERGE_CONFLICT"}

    // Daemon: filesystem.

    ErrFileNotFound     = &DaytonaError{Source: SourceDaemon, Code: "FILE_NOT_FOUND"}

    ErrFileAccessDenied = &DaytonaError{Source: SourceDaemon, Code: "FILE_ACCESS_DENIED"}

    // ErrInvalidFilePath matches DAYTONA_DAEMON / INVALID_FILE_PATH (HTTP 400).

    ErrInvalidFilePath = &DaytonaError{Source: SourceDaemon, Code: "INVALID_FILE_PATH"}

    // ErrFileReadFailed matches DAYTONA_DAEMON / FILE_READ_FAILED (HTTP 500).

    ErrFileReadFailed = &DaytonaError{Source: SourceDaemon, Code: "FILE_READ_FAILED"}

    // Daemon: LSP.

    ErrLspServerNotInitialized = &DaytonaError{Source: SourceDaemon, Code: "LSP_SERVER_NOT_INITIALIZED"}

    // Daemon: process / session.

    ErrProcessExecutionTimeout = &DaytonaError{Source: SourceDaemon, Code: "PROCESS_EXECUTION_TIMEOUT"}

    ErrProcessNotFound         = &DaytonaError{Source: SourceDaemon, Code: "PROCESS_NOT_FOUND"}

    ErrSessionEnded            = &DaytonaError{Source: SourceDaemon, Code: "SESSION_ENDED"}

    ErrCommandAlreadyCompleted = &DaytonaError{Source: SourceDaemon, Code: "COMMAND_ALREADY_COMPLETED"}

    // Daemon: computer-use.

    ErrA11yUnavailable         = &DaytonaError{Source: SourceDaemon, Code: "A11Y_UNAVAILABLE"}

    ErrRecordingStillActive    = &DaytonaError{Source: SourceDaemon, Code: "RECORDING_STILL_ACTIVE"}

    ErrRecordingFfmpegNotFound = &DaytonaError{Source: SourceDaemon, Code: "RECORDING_FFMPEG_NOT_FOUND"}

)
```

## [\#](https://www.daytona.io/docs/en/go-sdk/errors/\#func-convertapierror) func ConvertAPIError

[Section titled “func ConvertAPIError”](https://www.daytona.io/docs/en/go-sdk/errors/#func-convertapierror)

```
func ConvertAPIError(err error, httpResp *http.Response) error
```

ConvertAPIError converts an error returned by the generated api-client-go (and an optional \`\*http.Response\`) into a \`\*DaytonaError\`.

## [\#](https://www.daytona.io/docs/en/go-sdk/errors/\#func-converttoolboxerror) func ConvertToolboxError

[Section titled “func ConvertToolboxError”](https://www.daytona.io/docs/en/go-sdk/errors/#func-converttoolboxerror)

```
func ConvertToolboxError(err error, httpResp *http.Response) error
```

ConvertToolboxError converts an error returned by the generated toolbox-api-client-go into a \`\*DaytonaError\`.

## [\#](https://www.daytona.io/docs/en/go-sdk/errors/\#type-daytonaauthenticationerror) type DaytonaAuthenticationError

[Section titled “type DaytonaAuthenticationError”](https://www.daytona.io/docs/en/go-sdk/errors/#type-daytonaauthenticationerror)

Deprecated: match with \`errors.Is(err, ErrAuthentication)\` instead.

```
type DaytonaAuthenticationError struct{ *DaytonaError }
```

### [\#](https://www.daytona.io/docs/en/go-sdk/errors/\#func-newdaytonaauthenticationerror) func NewDaytonaAuthenticationError

[Section titled “func NewDaytonaAuthenticationError”](https://www.daytona.io/docs/en/go-sdk/errors/#func-newdaytonaauthenticationerror)

```
func NewDaytonaAuthenticationError(message string, headers http.Header) *DaytonaAuthenticationError
```

Deprecated: use NewDaytonaError(message, http.StatusUnauthorized, headers).

### [\#](https://www.daytona.io/docs/en/go-sdk/errors/\#func-daytonaauthenticationerror-unwrap) func (\*DaytonaAuthenticationError) Unwrap

[Section titled “func (\*DaytonaAuthenticationError) Unwrap”](https://www.daytona.io/docs/en/go-sdk/errors/#func-daytonaauthenticationerror-unwrap)

```
func (e *DaytonaAuthenticationError) Unwrap() error
```

## [\#](https://www.daytona.io/docs/en/go-sdk/errors/\#type-daytonaconflicterror) type DaytonaConflictError

[Section titled “type DaytonaConflictError”](https://www.daytona.io/docs/en/go-sdk/errors/#type-daytonaconflicterror)

Deprecated: match with \`errors.Is(err, ErrConflict)\` instead.

```
type DaytonaConflictError struct{ *DaytonaError }
```

### [\#](https://www.daytona.io/docs/en/go-sdk/errors/\#func-newdaytonaconflicterror) func NewDaytonaConflictError

[Section titled “func NewDaytonaConflictError”](https://www.daytona.io/docs/en/go-sdk/errors/#func-newdaytonaconflicterror)

```
func NewDaytonaConflictError(message string, headers http.Header) *DaytonaConflictError
```

Deprecated: use NewDaytonaError(message, http.StatusConflict, headers).

### [\#](https://www.daytona.io/docs/en/go-sdk/errors/\#func-daytonaconflicterror-unwrap) func (\*DaytonaConflictError) Unwrap

[Section titled “func (\*DaytonaConflictError) Unwrap”](https://www.daytona.io/docs/en/go-sdk/errors/#func-daytonaconflicterror-unwrap)

```
func (e *DaytonaConflictError) Unwrap() error
```

## [\#](https://www.daytona.io/docs/en/go-sdk/errors/\#type-daytonaerror) type DaytonaError

[Section titled “type DaytonaError”](https://www.daytona.io/docs/en/go-sdk/errors/#type-daytonaerror)

DaytonaError is the single error type returned by the SDK. Use \`errors.As(err, &target \*DaytonaError)\` to read its fields and \`errors.Is(err, sentinel)\` to branch on the kind.

```
type DaytonaError struct {

    Message    string

    StatusCode int

    Code       string

    Source     string

    Headers    http.Header

}
```

### [\#](https://www.daytona.io/docs/en/go-sdk/errors/\#func-newdaytonaconnectionerror) func NewDaytonaConnectionError

[Section titled “func NewDaytonaConnectionError”](https://www.daytona.io/docs/en/go-sdk/errors/#func-newdaytonaconnectionerror)

```
func NewDaytonaConnectionError(message string) *DaytonaError
```

NewDaytonaConnectionError is a convenience constructor for transport-level failures with no HTTP response (DNS, dial, TLS, mid-request drop).

### [\#](https://www.daytona.io/docs/en/go-sdk/errors/\#func-newdaytonaerror) func NewDaytonaError

[Section titled “func NewDaytonaError”](https://www.daytona.io/docs/en/go-sdk/errors/#func-newdaytonaerror)

```
func NewDaytonaError(message string, statusCode int, headers http.Header) *DaytonaError
```

NewDaytonaError builds a DaytonaError with the given message, status code and headers. \`Source\` is left empty for SDK-internal errors unless the translation layer populates it from a server-side envelope. Most callers should use this directly; the sentinels below are for branching with \`errors.Is\`, not for constructing errors.

### [\#](https://www.daytona.io/docs/en/go-sdk/errors/\#func-newdaytonaerrorfrombody) func NewDaytonaErrorFromBody

[Section titled “func NewDaytonaErrorFromBody”](https://www.daytona.io/docs/en/go-sdk/errors/#func-newdaytonaerrorfrombody)

```
func NewDaytonaErrorFromBody(body []byte, statusCode int, headers http.Header) *DaytonaError
```

NewDaytonaErrorFromBody parses a JSON response body and builds a DaytonaError. When the body carries its own \`statusCode\` field that overrides the caller-supplied one (server-side envelopes are authoritative).

### [\#](https://www.daytona.io/docs/en/go-sdk/errors/\#func-newdaytonatimeouterror) func NewDaytonaTimeoutError

[Section titled “func NewDaytonaTimeoutError”](https://www.daytona.io/docs/en/go-sdk/errors/#func-newdaytonatimeouterror)

```
func NewDaytonaTimeoutError(message string) *DaytonaError
```

NewDaytonaTimeoutError is a convenience constructor for client-side timeouts. Equivalent to \`NewDaytonaError(message, http.StatusRequestTimeout, nil)\`.

### [\#](https://www.daytona.io/docs/en/go-sdk/errors/\#func-newdaytonavalidationerror) func NewDaytonaValidationError

[Section titled “func NewDaytonaValidationError”](https://www.daytona.io/docs/en/go-sdk/errors/#func-newdaytonavalidationerror)

```
func NewDaytonaValidationError(message string, headers http.Header) *DaytonaError
```

Deprecated: use NewDaytonaError(message, http.StatusBadRequest, headers).

### [\#](https://www.daytona.io/docs/en/go-sdk/errors/\#func-daytonaerror-as) func (\*DaytonaError) As

[Section titled “func (\*DaytonaError) As”](https://www.daytona.io/docs/en/go-sdk/errors/#func-daytonaerror-as)

```
func (e *DaytonaError) As(target any) bool
```

As lets \`errors.As\` populate the deprecated typed errors with their original status-code semantics, even though the SDK only produces \*DaytonaError. Runs only after the stdlib’s direct assignability check, so \`errors.As(err, &de)\` with a \*DaytonaError target is unaffected.

### [\#](https://www.daytona.io/docs/en/go-sdk/errors/\#func-daytonaerror-error) func (\*DaytonaError) Error

[Section titled “func (\*DaytonaError) Error”](https://www.daytona.io/docs/en/go-sdk/errors/#func-daytonaerror-error)

```
func (e *DaytonaError) Error() string
```

### [\#](https://www.daytona.io/docs/en/go-sdk/errors/\#func-daytonaerror-is) func (\*DaytonaError) Is

[Section titled “func (\*DaytonaError) Is”](https://www.daytona.io/docs/en/go-sdk/errors/#func-daytonaerror-is)

```
func (e *DaytonaError) Is(target error) bool
```

Is implements the \`errors.Is\` contract. A target matches when it is one of the package-level sentinels and either:

- the target carries a non-empty \`Code\`, in which case BOTH \`Source\` and \`Code\` must match exactly (domain-code sentinel), or
- the target carries a non-zero \`StatusCode\`, in which case the receiver’s \`StatusCode\` must match (status-class sentinel).

Because the SDK always stamps the HTTP status alongside the domain code, \`errors.Is(err, ErrGitAuthFailed)\` and \`errors.Is(err, ErrAuthentication)\` both match the same underlying error — mirroring the inheritance hierarchy used by the Python/TypeScript/Java SDKs.

## [\#](https://www.daytona.io/docs/en/go-sdk/errors/\#type-daytonaforbiddenerror) type DaytonaForbiddenError

[Section titled “type DaytonaForbiddenError”](https://www.daytona.io/docs/en/go-sdk/errors/#type-daytonaforbiddenerror)

Deprecated: match with \`errors.Is(err, ErrForbidden)\` instead.

```
type DaytonaForbiddenError struct{ *DaytonaError }
```

### [\#](https://www.daytona.io/docs/en/go-sdk/errors/\#func-newdaytonaforbiddenerror) func NewDaytonaForbiddenError

[Section titled “func NewDaytonaForbiddenError”](https://www.daytona.io/docs/en/go-sdk/errors/#func-newdaytonaforbiddenerror)

```
func NewDaytonaForbiddenError(message string, headers http.Header) *DaytonaForbiddenError
```

Deprecated: use NewDaytonaError(message, http.StatusForbidden, headers).

### [\#](https://www.daytona.io/docs/en/go-sdk/errors/\#func-daytonaforbiddenerror-unwrap) func (\*DaytonaForbiddenError) Unwrap

[Section titled “func (\*DaytonaForbiddenError) Unwrap”](https://www.daytona.io/docs/en/go-sdk/errors/#func-daytonaforbiddenerror-unwrap)

```
func (e *DaytonaForbiddenError) Unwrap() error
```

## [\#](https://www.daytona.io/docs/en/go-sdk/errors/\#type-daytonanotfounderror) type DaytonaNotFoundError

[Section titled “type DaytonaNotFoundError”](https://www.daytona.io/docs/en/go-sdk/errors/#type-daytonanotfounderror)

Deprecated: match with \`errors.Is(err, ErrNotFound)\` instead.

```
type DaytonaNotFoundError struct{ *DaytonaError }
```

### [\#](https://www.daytona.io/docs/en/go-sdk/errors/\#func-newdaytonanotfounderror) func NewDaytonaNotFoundError

[Section titled “func NewDaytonaNotFoundError”](https://www.daytona.io/docs/en/go-sdk/errors/#func-newdaytonanotfounderror)

```
func NewDaytonaNotFoundError(message string, headers http.Header) *DaytonaNotFoundError
```

Deprecated: use NewDaytonaError(message, http.StatusNotFound, headers).

### [\#](https://www.daytona.io/docs/en/go-sdk/errors/\#func-daytonanotfounderror-unwrap) func (\*DaytonaNotFoundError) Unwrap

[Section titled “func (\*DaytonaNotFoundError) Unwrap”](https://www.daytona.io/docs/en/go-sdk/errors/#func-daytonanotfounderror-unwrap)

```
func (e *DaytonaNotFoundError) Unwrap() error
```

## [\#](https://www.daytona.io/docs/en/go-sdk/errors/\#type-daytonaratelimiterror) type DaytonaRateLimitError

[Section titled “type DaytonaRateLimitError”](https://www.daytona.io/docs/en/go-sdk/errors/#type-daytonaratelimiterror)

Deprecated: match with \`errors.Is(err, ErrRateLimit)\` instead.

```
type DaytonaRateLimitError struct{ *DaytonaError }
```

### [\#](https://www.daytona.io/docs/en/go-sdk/errors/\#func-newdaytonaratelimiterror) func NewDaytonaRateLimitError

[Section titled “func NewDaytonaRateLimitError”](https://www.daytona.io/docs/en/go-sdk/errors/#func-newdaytonaratelimiterror)

```
func NewDaytonaRateLimitError(message string, headers http.Header) *DaytonaRateLimitError
```

Deprecated: use NewDaytonaError(message, http.StatusTooManyRequests, headers).

### [\#](https://www.daytona.io/docs/en/go-sdk/errors/\#func-daytonaratelimiterror-unwrap) func (\*DaytonaRateLimitError) Unwrap

[Section titled “func (\*DaytonaRateLimitError) Unwrap”](https://www.daytona.io/docs/en/go-sdk/errors/#func-daytonaratelimiterror-unwrap)

```
func (e *DaytonaRateLimitError) Unwrap() error
```

## [\#](https://www.daytona.io/docs/en/go-sdk/errors/\#type-daytonaservererror) type DaytonaServerError

[Section titled “type DaytonaServerError”](https://www.daytona.io/docs/en/go-sdk/errors/#type-daytonaservererror)

Deprecated: match with \`errors.Is(err, ErrInternalServer)\` or compare StatusCode >= 500 on \*DaytonaError instead.

```
type DaytonaServerError struct{ *DaytonaError }
```

### [\#](https://www.daytona.io/docs/en/go-sdk/errors/\#func-newdaytonaservererror) func NewDaytonaServerError

[Section titled “func NewDaytonaServerError”](https://www.daytona.io/docs/en/go-sdk/errors/#func-newdaytonaservererror)

```
func NewDaytonaServerError(message string, statusCode int, headers http.Header) *DaytonaServerError
```

Deprecated: use NewDaytonaError(message, statusCode, headers).

### [\#](https://www.daytona.io/docs/en/go-sdk/errors/\#func-daytonaservererror-unwrap) func (\*DaytonaServerError) Unwrap

[Section titled “func (\*DaytonaServerError) Unwrap”](https://www.daytona.io/docs/en/go-sdk/errors/#func-daytonaservererror-unwrap)

```
func (e *DaytonaServerError) Unwrap() error
```

## [\#](https://www.daytona.io/docs/en/go-sdk/errors/\#type-daytonatimeouterror) type DaytonaTimeoutError

[Section titled “type DaytonaTimeoutError”](https://www.daytona.io/docs/en/go-sdk/errors/#type-daytonatimeouterror)

Deprecated: match with \`errors.Is(err, ErrTimeout)\` or \`errors.Is(err, ErrGatewayTimeout)\` instead.

```
type DaytonaTimeoutError struct{ *DaytonaError }
```

### [\#](https://www.daytona.io/docs/en/go-sdk/errors/\#func-daytonatimeouterror-unwrap) func (\*DaytonaTimeoutError) Unwrap

[Section titled “func (\*DaytonaTimeoutError) Unwrap”](https://www.daytona.io/docs/en/go-sdk/errors/#func-daytonatimeouterror-unwrap)

```
func (e *DaytonaTimeoutError) Unwrap() error
```

## [\#](https://www.daytona.io/docs/en/go-sdk/errors/\#type-daytonavalidationerror) type DaytonaValidationError

[Section titled “type DaytonaValidationError”](https://www.daytona.io/docs/en/go-sdk/errors/#type-daytonavalidationerror)

Deprecated: match with \`errors.Is(err, ErrBadRequest)\` instead.

```
type DaytonaValidationError struct{ *DaytonaError }
```

### [\#](https://www.daytona.io/docs/en/go-sdk/errors/\#func-daytonavalidationerror-unwrap) func (\*DaytonaValidationError) Unwrap

[Section titled “func (\*DaytonaValidationError) Unwrap”](https://www.daytona.io/docs/en/go-sdk/errors/#func-daytonavalidationerror-unwrap)

```
func (e *DaytonaValidationError) Unwrap() error
```