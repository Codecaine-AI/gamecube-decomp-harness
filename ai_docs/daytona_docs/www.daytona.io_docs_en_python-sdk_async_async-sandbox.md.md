---
url: "https://www.daytona.io/docs/en/python-sdk/async/async-sandbox.md"
title: undefined
---

\# AsyncSandbox

\## AsyncSandbox

\`\`\`python
@with\_events
class AsyncSandbox(SandboxDto)
\`\`\`

Represents a Daytona Sandbox.

\*\*Attributes\*\*:

\- \`fs\` \_AsyncFileSystem\_ - File system operations interface.
\- \`git\` \_AsyncGit\_ - Git operations interface.
\- \`process\` \_AsyncProcess\_ - Process execution interface.
\- \`computer\_use\` \_AsyncComputerUse\_ - Computer use operations interface for desktop automation.
\- \`code\_interpreter\` \_AsyncCodeInterpreter\_ - Stateful interpreter interface for executing code.
 Currently supports only Python. For other languages, use the \`process.code\_run\` interface.
\- \`id\` \_str\_ - Unique identifier for the Sandbox.
\- \`name\` \_str\_ - Name of the Sandbox.
\- \`organization\_id\` \_str\_ - Organization ID of the Sandbox.
\- \`snapshot\` \_str \| None\_ - Daytona snapshot used to create the Sandbox.
\- \`user\` \_str\_ - OS user running in the Sandbox.
\- \`env\` \_dict\[str, str\] \| None\_ - Environment variables set in the Sandbox (not returned by list
 results; call \`refresh\_data()\` on each item to populate).
\- \`labels\` \_dict\[str, str\]\_ - Custom labels attached to the Sandbox.
\- \`public\` \_bool\_ - Whether the Sandbox is publicly accessible.
\- \`target\` \_str\_ - Target location of the runner where the Sandbox runs.
\- \`cpu\` \_int\_ - Number of CPUs allocated to the Sandbox.
\- \`gpu\` \_int\_ - Number of GPUs allocated to the Sandbox.
\- \`memory\` \_int\_ - Amount of memory allocated to the Sandbox in GiB.
\- \`disk\` \_int\_ - Amount of disk space allocated to the Sandbox in GiB.
\- \`state\` \_SandboxState \| None\_ - Current state of the Sandbox (e.g., "started", "stopped").
\- \`error\_reason\` \_str \| None\_ - Error message if Sandbox is in error state.
\- \`recoverable\` \_bool \| None\_ - Whether the Sandbox error is recoverable.
\- \`backup\_state\` \_str \| None\_ - Current state of Sandbox backup.
\- \`backup\_created\_at\` \_str \| None\_ - When the backup was created (not returned by list results;
 call \`refresh\_data()\` on each item to populate).
\- \`auto\_stop\_interval\` \_int \| None\_ - Auto-stop interval in minutes.
\- \`auto\_pause\_interval\` \_int \| None\_ - Auto-pause interval in minutes (0 means disabled).
 Only supported for sandbox classes that support pausing.
 At most one of auto\_stop\_interval and auto\_pause\_interval may be non-zero.
\- \`auto\_archive\_interval\` \_int \| None\_ - Auto-archive interval in minutes.
\- \`auto\_delete\_interval\` \_int \| None\_ - Auto-delete interval in minutes.
\- \`volumes\` \_list\[SandboxVolume\] \| None\_ - Volumes attached to the Sandbox (not returned by list
 results; call \`refresh\_data()\` on each item to populate).
\- \`build\_info\` \_BuildInfo \| None\_ - Build information for the Sandbox if it was created from
 dynamic build (not returned by list results; call \`refresh\_data()\` on each item to populate).
\- \`created\_at\` \_str \| None\_ - When the Sandbox was created.
\- \`updated\_at\` \_str \| None\_ - When the Sandbox was last updated.
\- \`last\_activity\_at\` \_str \| None\_ - When the Sandbox last had activity.
\- \`auto\_destroy\_at\` \_str \| None\_ - When the Sandbox will be automatically destroyed (only set when a TTL
 is configured).
\- \`network\_block\_all\` \_bool \| None\_ - Whether to block all network access for the Sandbox
 (not returned by list results; call \`refresh\_data()\` on each item to populate).
\- \`network\_allow\_list\` \_str \| None\_ - Comma-separated list of allowed CIDR network addresses for
 the Sandbox (not returned by list results; call \`refresh\_data()\` on each item to populate).
\- \`domain\_allow\_list\` \_str \| None\_ - Comma-separated list of allowed domains for
 the Sandbox (not returned by list results; call \`refresh\_data()\` on each item to populate).
\- \`toolbox\_proxy\_url\` \_str\_ - The toolbox proxy URL for the Sandbox.

\##### env: \`dict\[str, str\] \| None\`

\`\`\`python
env = None
\`\`\`

pyright: ignore\[reportRedeclaration\]

\##### network\\\_block\\\_all: \`bool \| None\`

\`\`\`python
network\_block\_all = None
\`\`\`

pyright: ignore\[reportRedeclaration\]

\#### AsyncSandbox.\\\_\\\_init\\\_\\\_

\`\`\`python
def \_\_init\_\_(sandbox\_dto: SandboxDto \| SandboxListItem,
 toolbox\_api: ApiClient,
 sandbox\_api: SandboxApi,
 language: str,
 subscription\_manager: AsyncEventSubscriptionManager,
 pool\_tracker: AsyncPoolSaturationTracker \| None = None,
 analytics\_api\_url\_provider: Callable\[\[\], Awaitable\[str \| None\]\]
 \| None = None)
\`\`\`

Initialize a new Sandbox instance.

\*\*Arguments\*\*:

\- \`sandbox\_dto\` \_SandboxDto \| SandboxListItem\_ - The sandbox data from the API.
\- \`toolbox\_api\` \_ApiClient\_ - API client for toolbox operations.
\- \`sandbox\_api\` \_SandboxApi\_ - API client for Sandbox operations.
\- \`language\` \_str\_ - Language code for the Sandbox code\_run.
\- \`subscription\_manager\` - AsyncEventSubscriptionManager for real-time updates.
\- \`pool\_tracker\` \_AsyncPoolSaturationTracker \| None\_ - Tracker for connection pool saturation.

\#### AsyncSandbox.refresh\\\_data

\`\`\`python
@intercept\_errors(message\_prefix="Failed to refresh sandbox data: ")
@with\_instrumentation()
async def refresh\_data(request\_timeout: float \| None = None) -> None
\`\`\`

Refreshes the Sandbox data from the API.

\*\*Arguments\*\*:

\- \`request\_timeout\` \_float \| None\_ - Optional client-side request timeout in seconds. Client-side
 only. It bounds how long the SDK waits for the HTTP response and does not cancel
 the operation on the server. Positive values under 1 second are rounded up to 1
 second; 0 disables the client-side timeout and negative values are rejected.


\*\*Example\*\*:

\`\`\`python
await sandbox.refresh\_data()
print(f"Sandbox {sandbox.id}:")
print(f"State: {sandbox.state}")
print(f"Resources: {sandbox.cpu} CPU, {sandbox.memory} GiB RAM")
\`\`\`

\#### AsyncSandbox.get\\\_user\\\_home\\\_dir

\`\`\`python
@intercept\_errors(message\_prefix="Failed to get user home directory: ")
@with\_instrumentation()
async def get\_user\_home\_dir() -> str
\`\`\`

Gets the user's home directory path inside the Sandbox.

\*\*Returns\*\*:

\- \`str\` - The absolute path to the user's home directory inside the Sandbox.


\*\*Example\*\*:

\`\`\`python
user\_home\_dir = await sandbox.get\_user\_home\_dir()
print(f"Sandbox user home: {user\_home\_dir}")
\`\`\`

\#### AsyncSandbox.get\\\_work\\\_dir

\`\`\`python
@intercept\_errors(message\_prefix="Failed to get working directory path: ")
@with\_instrumentation()
async def get\_work\_dir() -> str
\`\`\`

Gets the working directory path inside the Sandbox.

\*\*Returns\*\*:

\- \`str\` - The absolute path to the Sandbox working directory. Uses the WORKDIR specified in
 the Dockerfile if present, or falling back to the user's home directory if not.


\*\*Example\*\*:

\`\`\`python
work\_dir = await sandbox.get\_work\_dir()
print(f"Sandbox working directory: {work\_dir}")
\`\`\`

\#### AsyncSandbox.get\\\_metrics\\\_latest

\`\`\`python
@intercept\_errors(message\_prefix="Failed to get sandbox metrics: ")
@with\_instrumentation()
async def get\_metrics\_latest() -> SandboxMetrics
\`\`\`

Gets the most recent resource usage sample directly from the Sandbox daemon.

Unlike :meth:\`get\_metrics\`, which returns aggregated historical samples, this returns
the single current reading without going through the telemetry backend.

\*\*Returns\*\*:

\- \`SandboxMetrics\` - The current CPU, memory, and disk usage sample for the Sandbox.

\#### AsyncSandbox.get\\\_metrics

\`\`\`python
@intercept\_errors(message\_prefix="Failed to get sandbox metrics: ")
@with\_instrumentation()
async def get\_metrics(start: datetime \| None = None,
 end: datetime \| None = None) -> list\[SandboxMetrics\]
\`\`\`

Gets historical time-series resource usage metrics for the Sandbox.

When the deployment runs a dedicated Analytics API, metrics are fetched from it
directly; otherwise they are fetched through the control-plane telemetry proxy.

\*\*Arguments\*\*:

\- \`start\` \_datetime \| None\_ - Start of the time range. Defaults to the Sandbox
 creation time.
\- \`end\` \_datetime \| None\_ - End of the time range. Defaults to the current time.


\*\*Returns\*\*:

\- \`list\[SandboxMetrics\]\` - Time-ordered usage samples over the requested range.

\#### AsyncSandbox.create\\\_lsp\\\_server

\`\`\`python
@with\_instrumentation()
def create\_lsp\_server(language\_id: LspLanguageId \| LspLanguageIdLiteral,
 path\_to\_project: str) -> AsyncLspServer
\`\`\`

Creates a new Language Server Protocol (LSP) server instance.

The LSP server provides language-specific features like code completion,
diagnostics, and more.

\*\*Arguments\*\*:

\- \`language\_id\` \_LspLanguageId \| LspLanguageIdLiteral\_ - The language server type (e.g., LspLanguageId.PYTHON).
\- \`path\_to\_project\` \_str\_ - Path to the project root directory. Relative paths are resolved
 based on the sandbox working directory.


\*\*Returns\*\*:

\- \`LspServer\` - A new LSP server instance configured for the specified language.


\*\*Example\*\*:

\`\`\`python
lsp = sandbox.create\_lsp\_server("python", "workspace/project")
\`\`\`

\#### AsyncSandbox.set\\\_labels

\`\`\`python
@intercept\_errors(message\_prefix="Failed to set labels: ")
@with\_instrumentation()
async def set\_labels(labels: dict\[str, str\],
 request\_timeout: float \| None = None) -> dict\[str, str\]
\`\`\`

Sets labels for the Sandbox.

Labels are key-value pairs that can be used to organize and identify Sandboxes.

\*\*Arguments\*\*:

\- \`labels\` \_dict\[str, str\]\_ - Dictionary of key-value pairs representing Sandbox labels.
\- \`request\_timeout\` \_float \| None\_ - Optional client-side request timeout in seconds. Client-side
 only. It bounds how long the SDK waits for the HTTP response and does not cancel
 the operation on the server. Positive values under 1 second are rounded up to 1
 second; 0 disables the client-side timeout and negative values are rejected.


\*\*Returns\*\*:

 dict\[str, str\]: Dictionary containing the updated Sandbox labels.


\*\*Example\*\*:

\`\`\`python
new\_labels = sandbox.set\_labels({
 "project": "my-project",
 "environment": "development",
 "team": "backend"
})
print(f"Updated labels: {new\_labels}")
\`\`\`

\#### AsyncSandbox.download\\\_url

\`\`\`python
@intercept\_errors(message\_prefix="Failed to create download URL: ")
@with\_instrumentation()
async def download\_url(path: str, ttl\_seconds: int \| None = None) -> str
\`\`\`

Creates a pre-signed URL for downloading a file from the Sandbox.

The URL works with any HTTP client without auth headers and stays valid across
sandbox restarts (downloads succeed only while the sandbox is running). The signing
key is cached locally for up to 15 seconds; if the key was rotated from another
client, URLs may be rejected until the cache refreshes.

\*\*Arguments\*\*:

\- \`path\` \_str\_ - Path to the file in the Sandbox.
\- \`ttl\_seconds\` \_int \| None\_ - How long the URL stays valid, in seconds.
 Defaults to 3600. Zero or negative means the URL never expires.


\*\*Returns\*\*:

\- \`str\` - Pre-signed download URL.


\*\*Example\*\*:

\`\`\`python
url = await sandbox.download\_url("/home/user/report.pdf")
\`\`\`
\`\`\`bash
curl "$url" -o report.pdf
\`\`\`

\#### AsyncSandbox.upload\\\_url

\`\`\`python
@intercept\_errors(message\_prefix="Failed to create upload URL: ")
@with\_instrumentation()
async def upload\_url(path: str, ttl\_seconds: int \| None = None) -> str
\`\`\`

Creates a pre-signed URL for uploading a file to the Sandbox.

Send a POST request with the file as multipart/form-data. The URL works with any
HTTP client without auth headers. The signing key is cached locally for up to
15 seconds; if the key was rotated from another client, URLs may be rejected
until the cache refreshes.

\*\*Arguments\*\*:

\- \`path\` \_str\_ - Destination path for the uploaded file in the Sandbox.
\- \`ttl\_seconds\` \_int \| None\_ - How long the URL stays valid, in seconds.
 Defaults to 3600. Zero or negative means the URL never expires.


\*\*Returns\*\*:

\- \`str\` - Pre-signed upload URL.


\*\*Example\*\*:

\`\`\`python
url = await sandbox.upload\_url("/home/user/data.bin")
\`\`\`
\`\`\`bash
curl -X POST -F "file=@local.bin" "$url"
\`\`\`

\#### AsyncSandbox.rotate\\\_signing\\\_key

\`\`\`python
@intercept\_errors(message\_prefix="Failed to rotate signing key: ")
@with\_instrumentation()
async def rotate\_signing\_key() -> None
\`\`\`

Rotates the sandbox signing key, invalidating all previously signed URLs.

\*\*Example\*\*:

\`\`\`python
await sandbox.rotate\_signing\_key()
\# all URLs created before this call now return 401
\`\`\`

\#### AsyncSandbox.start

\`\`\`python
@intercept\_errors(message\_prefix="Failed to start sandbox: ")
@with\_timeout()
@with\_instrumentation()
async def start(timeout: float \| None = 60)
\`\`\`

Starts the Sandbox and waits for it to be ready.

\*\*Arguments\*\*:

\- \`timeout\` \_float \| None\_ - Maximum time to wait in seconds. 0 means no timeout. Default is 60 seconds.


\*\*Raises\*\*:

\- \`DaytonaError\` - If timeout is negative. If sandbox fails to start or times out.


\*\*Example\*\*:

\`\`\`python
sandbox = daytona.get("my-sandbox-id")
sandbox.start(timeout=40) # Wait up to 40 seconds
print("Sandbox started successfully")
\`\`\`

\#### AsyncSandbox.recover

\`\`\`python
@intercept\_errors(message\_prefix="Failed to recover sandbox: ")
@with\_timeout()
async def recover(timeout: float \| None = 60)
\`\`\`

Recovers the Sandbox from a recoverable error and waits for it to be ready.

\*\*Arguments\*\*:

\- \`timeout\` \_float \| None\_ - Maximum time to wait in seconds. 0 means no timeout. Default is 60 seconds.


\*\*Raises\*\*:

\- \`DaytonaError\` - If timeout is negative. If sandbox fails to recover or times out.


\*\*Example\*\*:

\`\`\`python
sandbox = daytona.get("my-sandbox-id")
await sandbox.recover(timeout=40) # Wait up to 40 seconds
print("Sandbox recovered successfully")
\`\`\`

\#### AsyncSandbox.stop

\`\`\`python
@intercept\_errors(message\_prefix="Failed to stop sandbox: ")
@with\_timeout()
@with\_instrumentation()
async def stop(timeout: float \| None = 60, force: bool = False)
\`\`\`

Stops the Sandbox and waits for it to be fully stopped.

\*\*Arguments\*\*:

\- \`timeout\` \_float \| None\_ - Maximum time to wait in seconds. 0 means no timeout. Default is 60 seconds.
\- \`force\` \_bool\_ - If True, uses SIGKILL instead of SIGTERM to stop the sandbox. Default is False.


\*\*Raises\*\*:

\- \`DaytonaError\` - If timeout is negative; If sandbox fails to stop or times out


\*\*Example\*\*:

\`\`\`python
sandbox = daytona.get("my-sandbox-id")
await sandbox.stop()
print("Sandbox stopped successfully")
\`\`\`

\#### AsyncSandbox.delete

\`\`\`python
@intercept\_errors(message\_prefix="Failed to remove sandbox: ")
@with\_timeout()
@with\_instrumentation()
async def delete(timeout: float \| None = 60, wait: bool = False) -> None
\`\`\`

Deletes the Sandbox.

By default returns as soon as the deletion request is accepted (fire-and-forget).
Pass \`\`wait=True\`\` to block until the Sandbox reaches the 'destroyed' state.

\*\*Arguments\*\*:

\- \`timeout\` \_float \| None\_ - Timeout (in seconds) for the request and, when \`\`wait\`\`
 is True, for reaching 'destroyed'. 0 means no timeout. Default is 60 seconds.
\- \`wait\` \_bool\_ - If True, wait until the Sandbox is destroyed. Defaults to False.

\#### AsyncSandbox.wait\\\_for\\\_sandbox\\\_start

\`\`\`python
@intercept\_errors(
 message\_prefix="Failure during waiting for sandbox to start: ")
@with\_timeout()
@with\_instrumentation()
async def wait\_for\_sandbox\_start(timeout: float \| None = 60) -> None
\`\`\`

Waits for the Sandbox to reach the 'started' state.

\*\*Arguments\*\*:

\- \`timeout\` \_float \| None\_ - Maximum time to wait in seconds. 0 means no timeout. Default is 60 seconds.


\*\*Raises\*\*:

\- \`DaytonaError\` - If timeout is negative; If Sandbox fails to start or times out;

\#### AsyncSandbox.wait\\\_for\\\_sandbox\\\_stop

\`\`\`python
@intercept\_errors(
 message\_prefix="Failure during waiting for sandbox to stop: ")
@with\_timeout()
@with\_instrumentation()
async def wait\_for\_sandbox\_stop(timeout: float \| None = 60) -> None
\`\`\`

Waits for the Sandbox to reach the 'stopped' state.
Treats destroyed as stopped to cover ephemeral sandboxes that are automatically deleted after stopping.

\*\*Arguments\*\*:

\- \`timeout\` \_float \| None\_ - Maximum time to wait in seconds. 0 means no timeout. Default is 60 seconds.


\*\*Raises\*\*:

\- \`DaytonaError\` - If timeout is negative. If Sandbox fails to stop or times out.

\#### AsyncSandbox.set\\\_autostop\\\_interval

\`\`\`python
@intercept\_errors(message\_prefix="Failed to set auto-stop interval: ")
@with\_instrumentation()
async def set\_autostop\_interval(interval: int,
 request\_timeout: float \| None = None) -> None
\`\`\`

Sets the auto-stop interval for the Sandbox.

The Sandbox will automatically stop after being idle (no new events) for the specified interval.
Events include any state changes or interactions with the Sandbox through the SDK.
Interactions using Sandbox Previews are not included.

\*\*Arguments\*\*:

\- \`interval\` \_int\_ - Number of minutes of inactivity before auto-stopping.
 Set to 0 to disable auto-stop. Defaults to 15.
\- \`request\_timeout\` \_float \| None\_ - Optional client-side request timeout in seconds. Client-side
 only. It bounds how long the SDK waits for the HTTP response and does not cancel
 the operation on the server. Positive values under 1 second are rounded up to 1
 second; 0 disables the client-side timeout and negative values are rejected.


\*\*Raises\*\*:

\- \`DaytonaValidationError\` - If interval is negative


\*\*Example\*\*:

\`\`\`python
\# Auto-stop after 1 hour
sandbox.set\_autostop\_interval(60)
\# Or disable auto-stop
sandbox.set\_autostop\_interval(0)
\`\`\`

\#### AsyncSandbox.set\\\_auto\\\_pause\\\_interval

\`\`\`python
@intercept\_errors(message\_prefix="Failed to set auto-pause interval: ")
@with\_instrumentation()
async def set\_auto\_pause\_interval(interval: int) -> None
\`\`\`

Sets the auto-pause interval for the Sandbox.

The Sandbox will automatically pause after being idle (no new events) for the specified interval.
Only supported for sandbox classes that support pausing.

\*\*Arguments\*\*:

\- \`interval\` \_int\_ - Number of minutes of inactivity before auto-pausing.
 Set to 0 to disable auto-pause.


\*\*Raises\*\*:

\- \`DaytonaValidationError\` - If interval is negative


\*\*Example\*\*:

\`\`\`python
\# Auto-pause after 1 hour
await sandbox.set\_auto\_pause\_interval(60)
\# Or disable auto-pause
await sandbox.set\_auto\_pause\_interval(0)
\`\`\`

\#### AsyncSandbox.set\\\_ttl

\`\`\`python
@intercept\_errors(message\_prefix="Failed to set TTL: ")
@with\_instrumentation()
async def set\_ttl(ttl\_minutes: int,
 request\_timeout: float \| None = None) -> None
\`\`\`

Sets the TTL (time to live) for the Sandbox.

The Sandbox will be destroyed after the specified number of minutes, counted as
wall-clock time from the current moment, regardless of its state (started, stopped,
paused, or archived). Setting to 0 disables the TTL.

\*\*Arguments\*\*:

\- \`ttl\_minutes\` \_int\_ - Number of minutes until the Sandbox is destroyed.
 Set to 0 to disable the TTL.
\- \`request\_timeout\` \_float \| None\_ - Optional client-side request timeout in seconds. Client-side
 only. It bounds how long the SDK waits for the HTTP response and does not cancel
 the operation on the server. Positive values under 1 second are rounded up to 1
 second; 0 disables the client-side timeout and negative values are rejected.


\*\*Raises\*\*:

\- \`DaytonaValidationError\` - If ttl\_minutes is negative


\*\*Example\*\*:

\`\`\`python
\# Set TTL to 1 hour
await sandbox.set\_ttl(60)
\# Or disable TTL
await sandbox.set\_ttl(0)
\`\`\`

\#### AsyncSandbox.set\\\_auto\\\_archive\\\_interval

\`\`\`python
@intercept\_errors(message\_prefix="Failed to set auto-archive interval: ")
@with\_instrumentation()
async def set\_auto\_archive\_interval(interval: int,
 request\_timeout: float \| None = None
 ) -\> None
\`\`\`

Sets the auto-archive interval for the Sandbox.

The Sandbox will automatically archive after being continuously stopped for the specified interval.

\*\*Arguments\*\*:

\- \`interval\` \_int\_ - Number of minutes after which a continuously stopped Sandbox will be auto-archived.
 Set to 0 for the maximum interval. Default is 7 days.
\- \`request\_timeout\` \_float \| None\_ - Optional client-side request timeout in seconds. Client-side
 only. It bounds how long the SDK waits for the HTTP response and does not cancel
 the operation on the server. Positive values under 1 second are rounded up to 1
 second; 0 disables the client-side timeout and negative values are rejected.


\*\*Raises\*\*:

\- \`DaytonaValidationError\` - If interval is negative


\*\*Example\*\*:

\`\`\`python
\# Auto-archive after 1 hour
sandbox.set\_auto\_archive\_interval(60)
\# Or use the maximum interval
sandbox.set\_auto\_archive\_interval(0)
\`\`\`

\#### AsyncSandbox.set\\\_auto\\\_delete\\\_interval

\`\`\`python
@intercept\_errors(message\_prefix="Failed to set auto-delete interval: ")
@with\_instrumentation()
async def set\_auto\_delete\_interval(interval: int,
 request\_timeout: float \| None = None
 ) -\> None
\`\`\`

Sets the auto-delete interval for the Sandbox.

The Sandbox will automatically delete after being continuously stopped for the specified interval.

\*\*Arguments\*\*:

\- \`interval\` \_int\_ - Number of minutes after which a continuously stopped Sandbox will be auto-deleted.
 Set to negative value to disable auto-delete. Set to 0 to delete immediately upon stopping.
 By default, auto-delete is disabled.
\- \`request\_timeout\` \_float \| None\_ - Optional client-side request timeout in seconds. Client-side
 only. It bounds how long the SDK waits for the HTTP response and does not cancel
 the operation on the server. Positive values under 1 second are rounded up to 1
 second; 0 disables the client-side timeout and negative values are rejected.


\*\*Example\*\*:

\`\`\`python
\# Auto-delete after 1 hour
sandbox.set\_auto\_delete\_interval(60)
\# Or delete immediately upon stopping
sandbox.set\_auto\_delete\_interval(0)
\# Or disable auto-delete
sandbox.set\_auto\_delete\_interval(-1)
\`\`\`

\#### AsyncSandbox.update\\\_network\\\_settings

\`\`\`python
@intercept\_errors(message\_prefix="Failed to update network settings: ")
@with\_instrumentation()
async def update\_network\_settings(
 \*,
 network\_block\_all: bool \| None = None,
 network\_allow\_list: str \| None = None,
 domain\_allow\_list: str \| None = None,
 request\_timeout: float \| None = None) -> None
\`\`\`

Updates outbound network policy on the runner (block all, restore access, or CIDR allow list).

\*\*Arguments\*\*:

\- \`network\_block\_all\` - When \`\`True\`\`, blocks all outbound traffic. When \`\`False\`\`, restores general
 outbound access (and clears a stored allow list).
\- \`network\_allow\_list\` - Comma-separated IPv4 CIDRs to allow; implies not blocking all.
\- \`domain\_allow\_list\` - Comma-separated domains to allow; implies not blocking all.
\- \`request\_timeout\` \_float \| None\_ - Optional client-side request timeout in seconds. Client-side
 only. It bounds how long the SDK waits for the HTTP response and does not cancel
 the operation on the server. Positive values under 1 second are rounded up to 1
 second; 0 disables the client-side timeout and negative values are rejected.


\*\*Raises\*\*:

\- \`DaytonaValidationError\` - If neither argument is set.


\*\*Example\*\*:

\`\`\`python
await sandbox.update\_network\_settings(network\_block\_all=True)
await sandbox.update\_network\_settings(network\_block\_all=False)
\`\`\`

\#### AsyncSandbox.update\\\_secrets

\`\`\`python
@intercept\_errors(message\_prefix="Failed to update secrets: ")
@with\_instrumentation()
async def update\_secrets(secrets: dict\[str, str\]) -> None
\`\`\`

Updates the set of vault secrets mounted in the Sandbox, replacing the previously mounted set.

Attached, detached and rotated secrets take effect for outbound requests within seconds.
New environment variables only become visible to processes spawned after the update, and a
Sandbox created without any secrets must be restarted for newly attached secrets to work.

\*\*Arguments\*\*:

\- \`secrets\` \_dict\[str, str\]\_ - Map of environment variable name to the name of an existing
 organization Secret. Pass an empty dict to detach all secrets.


\*\*Example\*\*:

\`\`\`python
await sandbox.update\_secrets({"ANTHROPIC\_API\_KEY": "anthropic-prod"})
await sandbox.update\_secrets({}) # detach all
\`\`\`

\#### AsyncSandbox.update\\\_env

\`\`\`python
@intercept\_errors(message\_prefix="Failed to update environment: ")
@with\_instrumentation()
async def update\_env(env: dict\[str, str\],
 \*,
 unset: list\[str\] \| None = None) -> None
\`\`\`

Updates the Sandbox daemon's process environment.

Newly spawned processes, sessions and PTYs inherit the change; already-running processes
keep their environment.

\*\*Arguments\*\*:

\- \`env\` \_dict\[str, str\]\_ - Environment variables to set.
\- \`unset\` \_list\[str\] \| None\_ - Environment variable names to remove before \`env\` is applied.


\*\*Example\*\*:

\`\`\`python
await sandbox.update\_env({"MY\_VAR": "value"}, unset=\["OLD\_VAR"\])
\`\`\`

\#### AsyncSandbox.get\\\_preview\\\_link

\`\`\`python
@intercept\_errors(message\_prefix="Failed to get preview link: ")
@with\_instrumentation()
async def get\_preview\_link(port: int,
 request\_timeout: float \| None = None
 ) -\> PortPreviewUrl
\`\`\`

Retrieves the preview link for the sandbox at the specified port. If the port is closed,
it will be opened automatically. For private sandboxes, a token is included to grant access
to the URL.

\*\*Arguments\*\*:

\- \`port\` \_int\_ - The port to open the preview link on.
\- \`request\_timeout\` \_float \| None\_ - Optional client-side request timeout in seconds. Client-side
 only. It bounds how long the SDK waits for the HTTP response and does not cancel
 the operation on the server. Positive values under 1 second are rounded up to 1
 second; 0 disables the client-side timeout and negative values are rejected.


\*\*Returns\*\*:

\- \`PortPreviewUrl\` - The response object for the preview link, which includes the \`url\`
 and the \`token\` (to access private sandboxes).


\*\*Example\*\*:

\`\`\`python
preview\_link = sandbox.get\_preview\_link(3000)
print(f"Preview URL: {preview\_link.url}")
print(f"Token: {preview\_link.token}")
\`\`\`

\#### AsyncSandbox.create\\\_signed\\\_preview\\\_url

\`\`\`python
@intercept\_errors(message\_prefix="Failed to create signed preview url: ")
async def create\_signed\_preview\_url(
 port: int,
 expires\_in\_seconds: int \| None = None,
 request\_timeout: float \| None = None) -> SignedPortPreviewUrl
\`\`\`

Creates a signed preview URL for the sandbox at the specified port.

\*\*Arguments\*\*:

\- \`port\` \_int\_ - The port to open the preview link on.
\- \`expires\_in\_seconds\` \_int \| None\_ - The number of seconds the signed preview
 url will be valid for. Defaults to 60 seconds.
\- \`request\_timeout\` \_float \| None\_ - Optional client-side request timeout in seconds. Client-side
 only. It bounds how long the SDK waits for the HTTP response and does not cancel
 the operation on the server. Positive values under 1 second are rounded up to 1
 second; 0 disables the client-side timeout and negative values are rejected.


\*\*Returns\*\*:

\- \`SignedPortPreviewUrl\` - The response object for the signed preview url.

\#### AsyncSandbox.expire\\\_signed\\\_preview\\\_url

\`\`\`python
@intercept\_errors(message\_prefix="Failed to expire signed preview url: ")
async def expire\_signed\_preview\_url(port: int,
 token: str,
 request\_timeout: float \| None = None
 ) -\> None
\`\`\`

Expires a signed preview URL for the sandbox at the specified port.

\*\*Arguments\*\*:

\- \`port\` \_int\_ - The port to expire the signed preview url on.
\- \`token\` \_str\_ - The token to expire the signed preview url on.
\- \`request\_timeout\` \_float \| None\_ - Optional client-side request timeout in seconds. Client-side
 only. It bounds how long the SDK waits for the HTTP response and does not cancel
 the operation on the server. Positive values under 1 second are rounded up to 1
 second; 0 disables the client-side timeout and negative values are rejected.

\#### AsyncSandbox.archive

\`\`\`python
@intercept\_errors(message\_prefix="Failed to archive sandbox: ")
@with\_instrumentation()
async def archive(request\_timeout: float \| None = None) -> None
\`\`\`

Archives the sandbox, making it inactive and preserving its state. When sandboxes are
archived, the entire filesystem state is moved to cost-effective object storage, making it
possible to keep sandboxes available for an extended period. The tradeoff between archived
and stopped states is that starting an archived sandbox takes more time, depending on its size.
Sandbox must be stopped before archiving.

\*\*Arguments\*\*:

\- \`request\_timeout\` \_float \| None\_ - Optional client-side request timeout in seconds. Client-side
 only. It bounds how long the SDK waits for the HTTP response and does not cancel
 the operation on the server. Positive values under 1 second are rounded up to 1
 second; 0 disables the client-side timeout and negative values are rejected.

\#### AsyncSandbox.resize

\`\`\`python
@intercept\_errors(message\_prefix="Failed to resize sandbox: ")
@with\_timeout()
@with\_instrumentation()
async def resize(resources: Resources, timeout: float \| None = 60) -> None
\`\`\`

Resizes the Sandbox resources.

Changes the CPU, memory, or disk allocation. Hot resize (on a running Sandbox) accepts
only CPU and memory increases. Disk resize requires a stopped Sandbox; disk can only
grow. GPU is not resizable — to change GPU, create a new Sandbox.

\*\*Arguments\*\*:

\- \`resources\` \_Resources\_ - New resource configuration. Only cpu, memory, and disk are
 applied; setting gpu or gpu\_type raises an error.
\- \`timeout\` \_Optional\[float\]\_ - Timeout in seconds for the resize operation. 0 means no
 timeout. Default is 60 seconds.


\*\*Raises\*\*:

\- \`DaytonaError\` - If hot-resize constraints are violated, disk resize is attempted on
 a running Sandbox, disk decrease is attempted, no fields are provided, gpu or
 gpu\_type is set, or the operation times out.


\*\*Example\*\*:

\`\`\`python
await sandbox.resize(Resources(cpu=4, memory=8))

await sandbox.stop()
await sandbox.resize(Resources(cpu=2, memory=4, disk=30))
\`\`\`

\#### AsyncSandbox.wait\\\_for\\\_resize\\\_complete

\`\`\`python
@intercept\_errors(
 message\_prefix="Failure during waiting for resize to complete: ")
@with\_timeout()
@with\_instrumentation()
async def wait\_for\_resize\_complete(timeout: float \| None = 60) -> None
\`\`\`

Waits for the Sandbox resize operation to complete.

\*\*Arguments\*\*:

\- \`timeout\` \_Optional\[float\]\_ - Maximum time to wait in seconds. 0 means no timeout. Default is 60 seconds.


\*\*Raises\*\*:

\- \`DaytonaError\` - If timeout is negative. If resize operation times out.

\#### AsyncSandbox.create\\\_ssh\\\_access

\`\`\`python
@intercept\_errors(message\_prefix="Failed to create SSH access: ")
@with\_instrumentation()
async def create\_ssh\_access(
 expires\_in\_minutes: int \| None = None,
 request\_timeout: float \| None = None) -> SshAccessDto
\`\`\`

Creates an SSH access token for the sandbox.

\*\*Arguments\*\*:

\- \`expires\_in\_minutes\` \_int \| None\_ - The number of minutes the SSH access token will be valid for.
\- \`request\_timeout\` \_float \| None\_ - Optional client-side request timeout in seconds. Client-side
 only. It bounds how long the SDK waits for the HTTP response and does not cancel
 the operation on the server. Positive values under 1 second are rounded up to 1
 second; 0 disables the client-side timeout and negative values are rejected.

\#### AsyncSandbox.revoke\\\_ssh\\\_access

\`\`\`python
@intercept\_errors(message\_prefix="Failed to revoke SSH access: ")
@with\_instrumentation()
async def revoke\_ssh\_access(token: str,
 request\_timeout: float \| None = None) -> None
\`\`\`

Revokes an SSH access token for the sandbox.

\*\*Arguments\*\*:

\- \`token\` \_str\_ - The token to revoke.
\- \`request\_timeout\` \_float \| None\_ - Optional client-side request timeout in seconds. Client-side
 only. It bounds how long the SDK waits for the HTTP response and does not cancel
 the operation on the server. Positive values under 1 second are rounded up to 1
 second; 0 disables the client-side timeout and negative values are rejected.

\#### AsyncSandbox.validate\\\_ssh\\\_access

\`\`\`python
@intercept\_errors(message\_prefix="Failed to validate SSH access: ")
@with\_instrumentation()
async def validate\_ssh\_access(
 token: str,
 request\_timeout: float \| None = None) -> SshAccessValidationDto
\`\`\`

Validates an SSH access token for the sandbox.

\*\*Arguments\*\*:

\- \`token\` \_str\_ - The token to validate.
\- \`request\_timeout\` \_float \| None\_ - Optional client-side request timeout in seconds. Client-side
 only. It bounds how long the SDK waits for the HTTP response and does not cancel
 the operation on the server. Positive values under 1 second are rounded up to 1
 second; 0 disables the client-side timeout and negative values are rejected.

\#### AsyncSandbox.refresh\\\_activity

\`\`\`python
@intercept\_errors(message\_prefix="Failed to refresh sandbox activity: ")
async def refresh\_activity(request\_timeout: float \| None = None) -> None
\`\`\`

Refreshes the sandbox activity to reset the timer for automated lifecycle management actions.

This method updates the sandbox's last activity timestamp without changing its state.
It is useful for keeping long-running sessions alive while there is still user activity.

\*\*Arguments\*\*:

\- \`request\_timeout\` \_float \| None\_ - Optional client-side request timeout in seconds. Client-side
 only. It bounds how long the SDK waits for the HTTP response and does not cancel
 the operation on the server. Positive values under 1 second are rounded up to 1
 second; 0 disables the client-side timeout and negative values are rejected.


\*\*Example\*\*:

\`\`\`python
await sandbox.refresh\_activity()
\`\`\`

\#### AsyncSandbox.fork

\`\`\`python
@intercept\_errors(message\_prefix="Failed to fork sandbox: ")
@with\_timeout()
@with\_instrumentation()
async def fork(name: str \| None = None,
 timeout: float \| None = 60) -> "AsyncSandbox"
\`\`\`

Forks the Sandbox, creating a new Sandbox with an identical filesystem.

The forked Sandbox is a copy-on-write clone of the original. It starts
with the same disk contents but operates independently from that point on.

\*\*Arguments\*\*:

\- \`name\` \_str \| None\_ - Optional name for the forked Sandbox. If not provided, a unique name will be generated.
\- \`timeout\` \_float \| None\_ - Maximum time to wait in seconds. 0 means no timeout. Default is 60 seconds.


\*\*Returns\*\*:

\- \`AsyncSandbox\` - The forked Sandbox.


\*\*Raises\*\*:

\- \`DaytonaError\` - If the fork operation fails or times out.


\*\*Example\*\*:

\`\`\`python
sandbox = await daytona.get("my-sandbox")
forked = await sandbox.fork(name="my-fork")
print(f"Forked sandbox: {forked.id}")
\`\`\`

\#### AsyncSandbox.create\\\_snapshot

\`\`\`python
@intercept\_errors(message\_prefix="Failed to create snapshot: ")
@with\_timeout()
@with\_instrumentation()
async def create\_snapshot(name: str, timeout: float \| None = 60) -> None
\`\`\`

Creates a snapshot from the current state of the Sandbox.

This captures the Sandbox's filesystem into a reusable snapshot that can be
used to create new Sandboxes. The Sandbox will temporarily enter a
'snapshotting' state and return to its previous state when complete.

\*\*Arguments\*\*:

\- \`name\` \_str\_ - Name for the new snapshot.
\- \`timeout\` \_float \| None\_ - Maximum time to wait in seconds. 0 means no timeout. Default is 60 seconds.


\*\*Raises\*\*:

\- \`DaytonaError\` - If the snapshot operation fails or times out.


\*\*Example\*\*:

\`\`\`python
sandbox = await daytona.get("my-sandbox")
await sandbox.create\_snapshot("my-snapshot")
print("Snapshot created successfully")
\`\`\`

\#### AsyncSandbox.pause

\`\`\`python
@intercept\_errors(message\_prefix="Failed to pause sandbox")
@with\_timeout()
@with\_instrumentation()
async def pause(timeout: float = 60) -> None
\`\`\`

Pauses the Sandbox, freezing all running processes.

The Sandbox will enter a 'pausing' state and transition to 'paused' when
complete. While paused, the Sandbox retains its state in memory but does
not consume CPU cycles.

\*\*Arguments\*\*:

\- \`timeout\` - Maximum time to wait in seconds. 0 means no timeout.
 Defaults to 60-second timeout.


\*\*Raises\*\*:

\- \`DaytonaError\` - If timeout is negative or the operation fails/times out.

\## Resources

\`\`\`python
@dataclass
class Resources()
\`\`\`

Resources configuration for Sandbox.

\*\*Attributes\*\*:

\- \`cpu\` \_int \| None\_ - Number of CPU cores to allocate.
\- \`memory\` \_int \| None\_ - Amount of memory in GiB to allocate.
\- \`disk\` \_int \| None\_ - Amount of disk space in GiB to allocate.
\- \`gpu\` \_int \| None\_ - Number of GPUs to allocate.
\- \`gpu\_type\` \_GpuType \| list\[GpuType\] \| None\_ - Preferred GPU type for the Sandbox.


\*\*Example\*\*:

\`\`\`python
resources = Resources(
 cpu=2,
 memory=4, # 4GiB RAM
 disk=20, # 20GiB disk
 gpu=1,
 gpu\_type=GpuType.H100,
)
params = CreateSandboxFromImageParams(
 image=Image.debian\_slim("3.12"),
 language="python",
 resources=resources
)
\`\`\`

\## ListSandboxesQuery

\`\`\`python
@dataclass
class ListSandboxesQuery()
\`\`\`

Query parameters for filtering and sorting when listing Sandboxes.

\*\*Attributes\*\*:

\- \`limit\` - Per-page fetch size. Does NOT limit the total number of
 Sandboxes returned.
\- \`id\` - Filter by ID prefix (case-insensitive).
\- \`name\` - Filter by name prefix (case-insensitive).
\- \`labels\` - Filter by labels.
\- \`states\` - Filter by states.
\- \`snapshots\` - Filter by snapshot names.
\- \`targets\` - Filter by targets.
\- \`min\_cpu\` - Filter by minimum CPU.
\- \`max\_cpu\` - Filter by maximum CPU.
\- \`min\_memory\_gib\` - Filter by minimum memory in GiB.
\- \`max\_memory\_gib\` - Filter by maximum memory in GiB.
\- \`min\_disk\_gib\` - Filter by minimum disk space in GiB.
\- \`max\_disk\_gib\` - Filter by maximum disk space in GiB.
\- \`is\_public\` - Filter by public status.
\- \`is\_recoverable\` - Filter by recoverable status.
\- \`created\_at\_after\` \_datetime\_ - Include sandboxes created after this timestamp.
\- \`created\_at\_before\` \_datetime\_ - Include sandboxes created before this timestamp.
\- \`last\_activity\_after\` \_datetime\_ - Include sandboxes with last activity after this timestamp.
\- \`last\_activity\_before\` \_datetime\_ - Include sandboxes with last activity before this timestamp.
\- \`auto\_destroy\_at\_after\` \_datetime\_ - Include sandboxes scheduled for auto destroy after this timestamp.
\- \`auto\_destroy\_at\_before\` \_datetime\_ - Include sandboxes scheduled for auto destroy before this timestamp.
\- \`sort\` - Field to sort by.
\- \`order\` - Sort direction.

\## SandboxMetrics

\`\`\`python
@dataclass
class SandboxMetrics()
\`\`\`

A single point-in-time sample of historical Sandbox resource usage.

Each instance corresponds to one aggregation bucket returned by the telemetry
backend. Use :meth:\`Sandbox.get\_metrics\` to fetch a time-ordered list of these,
or :meth:\`Sandbox.get\_metrics\_latest\` for the current sample.

\*\*Attributes\*\*:

\- \`cpu\_count\` \_int\_ - Number of CPU cores allocated to the Sandbox.
\- \`cpu\_used\_pct\` \_float\_ - CPU utilization as a percentage of the allocated limit.
\- \`disk\_total\` \_int\_ - Total disk space in bytes.
\- \`disk\_used\` \_int\_ - Used disk space in bytes.
\- \`mem\_total\` \_int\_ - Total memory in bytes.
\- \`mem\_used\` \_int\_ - Used memory in bytes.
\- \`mem\_cache\` \_int\_ - Memory used by the page cache in bytes.
\- \`timestamp\` \_datetime\_ - Timestamp of this sample.

\#### sandbox\\\_metrics\\\_from\\\_system\\\_metrics

\`\`\`python
def sandbox\_metrics\_from\_system\_metrics(
 system\_metrics: \_SystemMetrics) -> SandboxMetrics
\`\`\`

Converts a live daemon \`\`SystemMetrics\`\` snapshot into a \`\`SandboxMetrics\`\` sample.

\#### pivot\\\_sandbox\\\_metrics

\`\`\`python
def pivot\_sandbox\_metrics(
 points: Iterable\[tuple\[str \| None, str \| None, float \| None\]\]
) -\> list\[SandboxMetrics\]
\`\`\`

Buckets \`\`(metric\_name, timestamp, value)\`\` triples by timestamp into \`\`SandboxMetrics\`\` samples.