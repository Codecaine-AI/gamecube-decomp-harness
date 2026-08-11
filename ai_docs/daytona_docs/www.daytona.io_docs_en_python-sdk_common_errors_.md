---
url: "https://www.daytona.io/docs/en/python-sdk/common/errors/"
title: "Errors | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/python-sdk/common/errors/#_top)

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/python-sdk/common/errors.md)Open

##### [\#](https://www.daytona.io/docs/en/python-sdk/common/errors/\#source_api) SOURCE\_API

[Section titled “SOURCE\_API”](https://www.daytona.io/docs/en/python-sdk/common/errors/#source_api)

```
SOURCE_API = "DAYTONA_API"
```

Wire-format `source` identifier for errors originating from the Daytona
API. `source = None` means the response did not carry a structured
envelope (treat as opaque).

##### [\#](https://www.daytona.io/docs/en/python-sdk/common/errors/\#source_daemon) SOURCE\_DAEMON

[Section titled “SOURCE\_DAEMON”](https://www.daytona.io/docs/en/python-sdk/common/errors/#source_daemon)

```
SOURCE_DAEMON = "DAYTONA_DAEMON"
```

Wire-format `source` identifier for errors originating from the sandbox
daemon (toolbox).

##### [\#](https://www.daytona.io/docs/en/python-sdk/common/errors/\#source_proxy) SOURCE\_PROXY

[Section titled “SOURCE\_PROXY”](https://www.daytona.io/docs/en/python-sdk/common/errors/#source_proxy)

```
SOURCE_PROXY = "DAYTONA_PROXY"
```

Wire-format `source` identifier for errors originating from the Daytona
proxy.

## [\#](https://www.daytona.io/docs/en/python-sdk/common/errors/\#daytonaerror) DaytonaError

[Section titled “DaytonaError”](https://www.daytona.io/docs/en/python-sdk/common/errors/#daytonaerror)

```
class DaytonaError(Exception)
```

Base error for Daytona SDK.

**Example**:

```
try:

    sandbox = daytona.get("missing-sandbox")

except DaytonaError as exc:

    print(exc.status_code)

    print(exc.code)

    print(exc.message)
```

**Attributes**:

- `message` _str_ \- Error message
- `status_code` _int \| None_ \- HTTP status code (set only for errors translated
from an HTTP response; `None` for client-side errors).
- `code` _str \| None_ \- Machine-readable error code from the server envelope
(`None` for client-side errors).
- `source` _str \| None_ \- Originating service. `None` when the response
did not carry a structured envelope. Otherwise one of
:data:`SOURCE_API`, :data:`SOURCE_DAEMON`, :data:`SOURCE_PROXY`.
- `headers` _dict\[str, Any\]_ \- Response headers (empty for client-side errors).

#### [\#](https://www.daytona.io/docs/en/python-sdk/common/errors/\#daytonaerror__init__) DaytonaError.\_\_init\_\_

[Section titled “DaytonaError.\_\_init\_\_”](https://www.daytona.io/docs/en/python-sdk/common/errors/#daytonaerror__init__)

```
def __init__(message: str,

             status_code: int | None = None,

             headers: Mapping[str, Any] | None = None,

             code: str | None = None,

             source: str | None = None)
```

Initialize Daytona error.

**Arguments**:

- `message` _str_ \- Error message
- `status_code` _int \| None_ \- HTTP status code if the error came from a
Daytona service response.
- `headers` _Mapping\[str, Any\] \| None_ \- Response headers if available
- `code` _str \| None_ \- Machine-readable error code from the wire envelope
- `source` _str \| None_ \- Originating service from the wire envelope.
Left as `None` for SDK-side errors and for responses from
services that don’t emit the envelope.

#### [\#](https://www.daytona.io/docs/en/python-sdk/common/errors/\#daytonaerrorerror_code) DaytonaError.error\_code

[Section titled “DaytonaError.error\_code”](https://www.daytona.io/docs/en/python-sdk/common/errors/#daytonaerrorerror_code)

```
@property

def error_code() -> str | None
```

Deprecated alias of :attr:`code`, kept for backward compatibility.

## [\#](https://www.daytona.io/docs/en/python-sdk/common/errors/\#daytonanotfounderror) DaytonaNotFoundError

[Section titled “DaytonaNotFoundError”](https://www.daytona.io/docs/en/python-sdk/common/errors/#daytonanotfounderror)

```
class DaytonaNotFoundError(DaytonaError)
```

Error for when a resource is not found (HTTP 404).

**Example**:

```
try:

    sandbox.fs.download_file("/workspace/missing.txt")

except DaytonaNotFoundError as exc:

    print(exc.status_code)
```

## [\#](https://www.daytona.io/docs/en/python-sdk/common/errors/\#daytonaauthenticationerror) DaytonaAuthenticationError

[Section titled “DaytonaAuthenticationError”](https://www.daytona.io/docs/en/python-sdk/common/errors/#daytonaauthenticationerror)

```
class DaytonaAuthenticationError(DaytonaError)
```

Error for when authentication fails (HTTP 401).

**Example**:

```
try:

    for sandbox in daytona.list():

        print(sandbox.id)

except DaytonaAuthenticationError as exc:

    print(exc.status_code)
```

## [\#](https://www.daytona.io/docs/en/python-sdk/common/errors/\#daytonaforbiddenerror) DaytonaForbiddenError

[Section titled “DaytonaForbiddenError”](https://www.daytona.io/docs/en/python-sdk/common/errors/#daytonaforbiddenerror)

```
class DaytonaForbiddenError(DaytonaError)
```

Error for when the request is forbidden (HTTP 403).

**Example**:

```
try:

    daytona.get("sandbox-without-access")

except DaytonaForbiddenError as exc:

    print(exc.message)
```

## [\#](https://www.daytona.io/docs/en/python-sdk/common/errors/\#daytonaratelimiterror) DaytonaRateLimitError

[Section titled “DaytonaRateLimitError”](https://www.daytona.io/docs/en/python-sdk/common/errors/#daytonaratelimiterror)

```
class DaytonaRateLimitError(DaytonaError)
```

Error for when rate limit is exceeded (HTTP 429).

**Example**:

```
try:

    for sandbox in daytona.list():

        print(sandbox.id)

except DaytonaRateLimitError as exc:

    print(exc.code)
```

## [\#](https://www.daytona.io/docs/en/python-sdk/common/errors/\#daytonaconflicterror) DaytonaConflictError

[Section titled “DaytonaConflictError”](https://www.daytona.io/docs/en/python-sdk/common/errors/#daytonaconflicterror)

```
class DaytonaConflictError(DaytonaError)
```

Error for when a resource conflict occurs (HTTP 409).

**Example**:

```
try:

    params = CreateSandboxFromSnapshotParams(name="existing-sandbox")

    daytona.create(params)

except DaytonaConflictError as exc:

    print(exc.code)
```

## [\#](https://www.daytona.io/docs/en/python-sdk/common/errors/\#daytonabadrequesterror) DaytonaBadRequestError

[Section titled “DaytonaBadRequestError”](https://www.daytona.io/docs/en/python-sdk/common/errors/#daytonabadrequesterror)

```
class DaytonaBadRequestError(DaytonaError)
```

Error for malformed requests (HTTP 400).

The deprecated `DaytonaValidationError` alias remains for older callers
that historically grouped both HTTP 400 and HTTP 422 validation failures
under one name. New code should catch `DaytonaBadRequestError` and
`DaytonaUnprocessableEntityError` explicitly.

**Example**:

```
try:

    Image.debian_slim("3.8")

except DaytonaBadRequestError as exc:

    print(exc.message)
```

## [\#](https://www.daytona.io/docs/en/python-sdk/common/errors/\#daytonatimeouterror) DaytonaTimeoutError

[Section titled “DaytonaTimeoutError”](https://www.daytona.io/docs/en/python-sdk/common/errors/#daytonatimeouterror)

```
class DaytonaTimeoutError(DaytonaError)
```

Error for when a timeout occurs.

**Example**:

```
try:

    sandbox.wait_for_sandbox_start(timeout=1)

except DaytonaTimeoutError as exc:

    print(exc.message)
```

## [\#](https://www.daytona.io/docs/en/python-sdk/common/errors/\#daytonaconnectionerror) DaytonaConnectionError

[Section titled “DaytonaConnectionError”](https://www.daytona.io/docs/en/python-sdk/common/errors/#daytonaconnectionerror)

```
class DaytonaConnectionError(DaytonaError)
```

Error for when a network connection fails (can’t connect or mid-request drop).

## [\#](https://www.daytona.io/docs/en/python-sdk/common/errors/\#daytonaconnectiontimeouterror) DaytonaConnectionTimeoutError

[Section titled “DaytonaConnectionTimeoutError”](https://www.daytona.io/docs/en/python-sdk/common/errors/#daytonaconnectiontimeouterror)

```
class DaytonaConnectionTimeoutError(DaytonaConnectionError,

                                    DaytonaTimeoutError)
```

Error for when the transport layer times out connecting or reading from a Daytona service.

## [\#](https://www.daytona.io/docs/en/python-sdk/common/errors/\#daytonagoneerror) DaytonaGoneError

[Section titled “DaytonaGoneError”](https://www.daytona.io/docs/en/python-sdk/common/errors/#daytonagoneerror)

```
class DaytonaGoneError(DaytonaError)
```

Error for HTTP 410 — the target resource is permanently gone.

## [\#](https://www.daytona.io/docs/en/python-sdk/common/errors/\#daytonaunprocessableentityerror) DaytonaUnprocessableEntityError

[Section titled “DaytonaUnprocessableEntityError”](https://www.daytona.io/docs/en/python-sdk/common/errors/#daytonaunprocessableentityerror)

```
class DaytonaUnprocessableEntityError(DaytonaError)
```

Error for HTTP 422 — request is well-formed but semantically invalid.

## [\#](https://www.daytona.io/docs/en/python-sdk/common/errors/\#daytonainternalservererror) DaytonaInternalServerError

[Section titled “DaytonaInternalServerError”](https://www.daytona.io/docs/en/python-sdk/common/errors/#daytonainternalservererror)

```
class DaytonaInternalServerError(DaytonaError)
```

Error for HTTP 500 — server-side bug or unhandled condition.

## [\#](https://www.daytona.io/docs/en/python-sdk/common/errors/\#daytonabadgatewayerror) DaytonaBadGatewayError

[Section titled “DaytonaBadGatewayError”](https://www.daytona.io/docs/en/python-sdk/common/errors/#daytonabadgatewayerror)

```
class DaytonaBadGatewayError(DaytonaError)
```

Error for HTTP 502 — an upstream dependency rejected or dropped the request.

## [\#](https://www.daytona.io/docs/en/python-sdk/common/errors/\#daytonaserviceunavailableerror) DaytonaServiceUnavailableError

[Section titled “DaytonaServiceUnavailableError”](https://www.daytona.io/docs/en/python-sdk/common/errors/#daytonaserviceunavailableerror)

```
class DaytonaServiceUnavailableError(DaytonaError)
```

Error for HTTP 503 — the service is temporarily refusing traffic.

## [\#](https://www.daytona.io/docs/en/python-sdk/common/errors/\#daytonagitauthfailederror) DaytonaGitAuthFailedError

[Section titled “DaytonaGitAuthFailedError”](https://www.daytona.io/docs/en/python-sdk/common/errors/#daytonagitauthfailederror)

```
class DaytonaGitAuthFailedError(DaytonaAuthenticationError)
```

Git auth credentials were rejected by the remote.

## [\#](https://www.daytona.io/docs/en/python-sdk/common/errors/\#daytonagitreponotfounderror) DaytonaGitRepoNotFoundError

[Section titled “DaytonaGitRepoNotFoundError”](https://www.daytona.io/docs/en/python-sdk/common/errors/#daytonagitreponotfounderror)

```
class DaytonaGitRepoNotFoundError(DaytonaNotFoundError)
```

The requested git repository does not exist.

## [\#](https://www.daytona.io/docs/en/python-sdk/common/errors/\#daytonagitbranchnotfounderror) DaytonaGitBranchNotFoundError

[Section titled “DaytonaGitBranchNotFoundError”](https://www.daytona.io/docs/en/python-sdk/common/errors/#daytonagitbranchnotfounderror)

```
class DaytonaGitBranchNotFoundError(DaytonaNotFoundError)
```

The requested git branch does not exist.

## [\#](https://www.daytona.io/docs/en/python-sdk/common/errors/\#daytonagitbranchexistserror) DaytonaGitBranchExistsError

[Section titled “DaytonaGitBranchExistsError”](https://www.daytona.io/docs/en/python-sdk/common/errors/#daytonagitbranchexistserror)

```
class DaytonaGitBranchExistsError(DaytonaConflictError)
```

A git branch with this name already exists.

## [\#](https://www.daytona.io/docs/en/python-sdk/common/errors/\#daytonagitpushrejectederror) DaytonaGitPushRejectedError

[Section titled “DaytonaGitPushRejectedError”](https://www.daytona.io/docs/en/python-sdk/common/errors/#daytonagitpushrejectederror)

```
class DaytonaGitPushRejectedError(DaytonaConflictError)
```

Git push was rejected (non-fast-forward / stale ref).

## [\#](https://www.daytona.io/docs/en/python-sdk/common/errors/\#daytonagitdirtyworktreeerror) DaytonaGitDirtyWorktreeError

[Section titled “DaytonaGitDirtyWorktreeError”](https://www.daytona.io/docs/en/python-sdk/common/errors/#daytonagitdirtyworktreeerror)

```
class DaytonaGitDirtyWorktreeError(DaytonaConflictError)
```

Worktree has uncommitted changes.

## [\#](https://www.daytona.io/docs/en/python-sdk/common/errors/\#daytonagitmergeconflicterror) DaytonaGitMergeConflictError

[Section titled “DaytonaGitMergeConflictError”](https://www.daytona.io/docs/en/python-sdk/common/errors/#daytonagitmergeconflicterror)

```
class DaytonaGitMergeConflictError(DaytonaConflictError)
```

Git merge has conflicts that need manual resolution.

## [\#](https://www.daytona.io/docs/en/python-sdk/common/errors/\#daytonafilenotfounderror) DaytonaFileNotFoundError

[Section titled “DaytonaFileNotFoundError”](https://www.daytona.io/docs/en/python-sdk/common/errors/#daytonafilenotfounderror)

```
class DaytonaFileNotFoundError(DaytonaNotFoundError)
```

Filesystem entry was not found.

## [\#](https://www.daytona.io/docs/en/python-sdk/common/errors/\#daytonafileaccessdeniederror) DaytonaFileAccessDeniedError

[Section titled “DaytonaFileAccessDeniedError”](https://www.daytona.io/docs/en/python-sdk/common/errors/#daytonafileaccessdeniederror)

```
class DaytonaFileAccessDeniedError(DaytonaForbiddenError)
```

Insufficient permissions for the filesystem operation.

## [\#](https://www.daytona.io/docs/en/python-sdk/common/errors/\#daytonainvalidfilepatherror) DaytonaInvalidFilePathError

[Section titled “DaytonaInvalidFilePathError”](https://www.daytona.io/docs/en/python-sdk/common/errors/#daytonainvalidfilepatherror)

```
class DaytonaInvalidFilePathError(DaytonaBadRequestError)
```

The daemon rejected the supplied file path (code `INVALID_FILE_PATH`).

## [\#](https://www.daytona.io/docs/en/python-sdk/common/errors/\#daytonafilereadfailederror) DaytonaFileReadFailedError

[Section titled “DaytonaFileReadFailedError”](https://www.daytona.io/docs/en/python-sdk/common/errors/#daytonafilereadfailederror)

```
class DaytonaFileReadFailedError(DaytonaInternalServerError)
```

The daemon could not read the sandbox file (code `FILE_READ_FAILED`).

## [\#](https://www.daytona.io/docs/en/python-sdk/common/errors/\#daytonalspservernotinitializederror) DaytonaLspServerNotInitializedError

[Section titled “DaytonaLspServerNotInitializedError”](https://www.daytona.io/docs/en/python-sdk/common/errors/#daytonalspservernotinitializederror)

```
class DaytonaLspServerNotInitializedError(DaytonaBadRequestError)
```

LSP server must be started via /lsp/start first.

## [\#](https://www.daytona.io/docs/en/python-sdk/common/errors/\#daytonaprocessexecutiontimeouterror) DaytonaProcessExecutionTimeoutError

[Section titled “DaytonaProcessExecutionTimeoutError”](https://www.daytona.io/docs/en/python-sdk/common/errors/#daytonaprocessexecutiontimeouterror)

```
class DaytonaProcessExecutionTimeoutError(DaytonaTimeoutError)
```

A process exceeded its configured execution timeout.

## [\#](https://www.daytona.io/docs/en/python-sdk/common/errors/\#daytonaprocessnotfounderror) DaytonaProcessNotFoundError

[Section titled “DaytonaProcessNotFoundError”](https://www.daytona.io/docs/en/python-sdk/common/errors/#daytonaprocessnotfounderror)

```
class DaytonaProcessNotFoundError(DaytonaNotFoundError)
```

The requested process is not running.

## [\#](https://www.daytona.io/docs/en/python-sdk/common/errors/\#daytonasessionendederror) DaytonaSessionEndedError

[Section titled “DaytonaSessionEndedError”](https://www.daytona.io/docs/en/python-sdk/common/errors/#daytonasessionendederror)

```
class DaytonaSessionEndedError(DaytonaGoneError)
```

The shell session has ended.

## [\#](https://www.daytona.io/docs/en/python-sdk/common/errors/\#daytonacommandalreadycompletederror) DaytonaCommandAlreadyCompletedError

[Section titled “DaytonaCommandAlreadyCompletedError”](https://www.daytona.io/docs/en/python-sdk/common/errors/#daytonacommandalreadycompletederror)

```
class DaytonaCommandAlreadyCompletedError(DaytonaGoneError)
```

The shell command already finished.

## [\#](https://www.daytona.io/docs/en/python-sdk/common/errors/\#daytonaa11yunavailableerror) DaytonaA11yUnavailableError

[Section titled “DaytonaA11yUnavailableError”](https://www.daytona.io/docs/en/python-sdk/common/errors/#daytonaa11yunavailableerror)

```
class DaytonaA11yUnavailableError(DaytonaServiceUnavailableError)
```

The accessibility (AT-SPI) bus is not reachable.

## [\#](https://www.daytona.io/docs/en/python-sdk/common/errors/\#daytonarecordingstillactiveerror) DaytonaRecordingStillActiveError

[Section titled “DaytonaRecordingStillActiveError”](https://www.daytona.io/docs/en/python-sdk/common/errors/#daytonarecordingstillactiveerror)

```
class DaytonaRecordingStillActiveError(DaytonaConflictError)
```

The recording is still running; stop it first.

## [\#](https://www.daytona.io/docs/en/python-sdk/common/errors/\#daytonarecordingffmpegnotfounderror) DaytonaRecordingFfmpegNotFoundError

[Section titled “DaytonaRecordingFfmpegNotFoundError”](https://www.daytona.io/docs/en/python-sdk/common/errors/#daytonarecordingffmpegnotfounderror)

```
class DaytonaRecordingFfmpegNotFoundError(DaytonaServiceUnavailableError)
```

ffmpeg binary is not installed; required for recording.

#### [\#](https://www.daytona.io/docs/en/python-sdk/common/errors/\#error_class_from_status_code) error\_class\_from\_status\_code

[Section titled “error\_class\_from\_status\_code”](https://www.daytona.io/docs/en/python-sdk/common/errors/#error_class_from_status_code)

```
def error_class_from_status_code(

        status_code: int | None) -> type[DaytonaError]
```

Map an HTTP status code to the corresponding DaytonaError subclass.

#### [\#](https://www.daytona.io/docs/en/python-sdk/common/errors/\#create_daytona_error) create\_daytona\_error

[Section titled “create\_daytona\_error”](https://www.daytona.io/docs/en/python-sdk/common/errors/#create_daytona_error)

```
def create_daytona_error(message: str,

                         status_code: int | None = None,

                         headers: Mapping[str, Any] | None = None,

                         code: str | None = None,

                         source: str | None = None) -> DaytonaError
```

Create the appropriate DaytonaError subclass from structured error metadata.

Resolution order: `(source, code)` exact match → HTTP status code → base
:class:`DaytonaError`.

##### [\#](https://www.daytona.io/docs/en/python-sdk/common/errors/\#daytonaauthorizationerror) DaytonaAuthorizationError

[Section titled “DaytonaAuthorizationError”](https://www.daytona.io/docs/en/python-sdk/common/errors/#daytonaauthorizationerror)

```
DaytonaAuthorizationError = DaytonaForbiddenError
```

Deprecated alias for :class:`DaytonaForbiddenError`. Kept so existing
`except DaytonaAuthorizationError` blocks continue to work.

##### [\#](https://www.daytona.io/docs/en/python-sdk/common/errors/\#daytonavalidationerror) DaytonaValidationError

[Section titled “DaytonaValidationError”](https://www.daytona.io/docs/en/python-sdk/common/errors/#daytonavalidationerror)

```
DaytonaValidationError = DaytonaBadRequestError
```

Deprecated alias for :class:`DaytonaBadRequestError`. Kept so existing
`except DaytonaValidationError` blocks continue to work.