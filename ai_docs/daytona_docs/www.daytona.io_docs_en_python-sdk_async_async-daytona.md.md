---
url: "https://www.daytona.io/docs/en/python-sdk/async/async-daytona.md"
title: undefined
---

\# AsyncDaytona

\## AsyncDaytona

\`\`\`python
class AsyncDaytona()
\`\`\`

Main class for interacting with the Daytona API.

This class provides asynchronous methods to create, manage, and interact with Daytona Sandboxes.
It can be initialized either with explicit configuration or using environment variables.

\*\*Attributes\*\*:

\- \`volume\` \_AsyncVolumeService\_ - Service for managing volumes.
\- \`snapshot\` \_AsyncSnapshotService\_ - Service for managing snapshots.
\- \`secret\` \_AsyncSecretService\_ - Service for managing secrets.


\*\*Example\*\*:

 Using environment variables:
\`\`\`python
async with AsyncDaytona() as daytona: # Uses DAYTONA\_API\_KEY, DAYTONA\_API\_URL
 sandbox = await daytona.create()
\`\`\`

 Using explicit configuration:
\`\`\`python
config = DaytonaConfig(
 api\_key="your-api-key",
 api\_url="https://your-api.com",
 target="us"
)
try:
 daytona = AsyncDaytona(config)
 sandbox = await daytona.create()
finally:
 await daytona.close()
\`\`\`

 Using OpenTelemetry tracing:
\`\`\`python
config = DaytonaConfig(
 api\_key="your-api-key",
 experimental={"otelEnabled": True}
)
async with AsyncDaytona(config) as daytona:
 sandbox = await daytona.create()
 # All SDK operations will be traced
\# OpenTelemetry traces are flushed on close
\`\`\`

\#### AsyncDaytona.\\\_\\\_init\\\_\\\_

\`\`\`python
def \_\_init\_\_(config: DaytonaConfig \| None = None)
\`\`\`

Initializes Daytona instance with optional configuration.

If no config is provided, reads from environment variables:
\- \`DAYTONA\_API\_KEY\`: Required API key for authentication
\- \`DAYTONA\_API\_URL\`: Required api URL
\- \`DAYTONA\_TARGET\`: Optional target environment (if not provided, default region for the organization is used)

\*\*Arguments\*\*:

\- \`config\` \_DaytonaConfig \| None\_ - Object containing api\_key, api\_url, and target.


\*\*Raises\*\*:

\- \`DaytonaError\` - If API key is not provided either through config or environment variables


\*\*Example\*\*:

\`\`\`python
from daytona import Daytona, DaytonaConfig
\# Using environment variables
daytona1 = AsyncDaytona()
await daytona1.close()
\# Using explicit configuration
config = DaytonaConfig(
 api\_key="your-api-key",
 api\_url="https://your-api.com",
 target="us"
)
daytona2 = AsyncDaytona(config)
await daytona2.close()
\`\`\`

\#### AsyncDaytona.\\\_\\\_aenter\\\_\\\_

\`\`\`python
async def \_\_aenter\_\_()
\`\`\`

Async context manager entry.

\#### AsyncDaytona.\\\_\\\_aexit\\\_\\\_

\`\`\`python
async def \_\_aexit\_\_(exc\_type: type\[BaseException\] \| None = None,
 exc\_value: BaseException \| None = None,
 traceback: TracebackType \| None = None)
\`\`\`

Async context manager exit - ensures proper cleanup.

\#### AsyncDaytona.close

\`\`\`python
async def close()
\`\`\`

Close the HTTP session and clean up resources.

This method should be called when you're done using the AsyncDaytona instance
to properly close the underlying HTTP sessions and avoid resource leaks.

\*\*Example\*\*:

\`\`\`python
daytona = AsyncDaytona()
try:
 sandbox = await daytona.create()
 # ... use sandbox ...
finally:
 await daytona.close()
\`\`\`

 Or better yet, use as async context manager:
\`\`\`python
async with AsyncDaytona() as daytona:
 sandbox = await daytona.create()
 # ... use sandbox ...
\# Automatically closed
\`\`\`

\#### AsyncDaytona.create

\`\`\`python
@overload
async def create(params: CreateSandboxFromSnapshotParams \| None = None,
 \*,
 timeout: float = 60) -> AsyncSandbox
\`\`\`

Creates Sandboxes from specified or default snapshot. You can specify various parameters,
including language, image, environment variables, and volumes.

\*\*Arguments\*\*:

\- \`params\` \_CreateSandboxFromSnapshotParams \| None\_ - Parameters for Sandbox creation. If not provided,
 defaults to default Daytona snapshot and Python language.
\- \`timeout\` \_float\_ - Timeout (in seconds) for sandbox creation. 0 means no timeout.
 Default is 60 seconds.


\*\*Returns\*\*:

\- \`Sandbox\` - The created Sandbox instance.


\*\*Raises\*\*:

\- \`DaytonaError\` - If timeout, auto\_stop\_interval or auto\_archive\_interval is negative;
 If sandbox fails to start or times out


\*\*Example\*\*:

 Create a default Python Sandbox:
\`\`\`python
sandbox = await daytona.create()
\`\`\`

 Create a custom Sandbox:
\`\`\`python
params = CreateSandboxFromSnapshotParams(
 language="python",
 snapshot="my-snapshot-id",
 env\_vars={"DEBUG": "true"},
 auto\_stop\_interval=0,
 auto\_archive\_interval=60,
 auto\_delete\_interval=120
)
sandbox = await daytona.create(params, timeout=40)
\`\`\`

\#### AsyncDaytona.create

\`\`\`python
@overload
async def create(
 params: CreateSandboxFromImageParams \| None = None,
 \*,
 timeout: float = 60,
 on\_snapshot\_create\_logs: Callable\[\[str\], None\] \| None = None
) -\> AsyncSandbox
\`\`\`

Creates Sandboxes from specified image available on some registry or declarative Daytona Image.
You can specify various parameters, including resources, language, image, environment variables,
and volumes. Daytona creates snapshot from provided image and uses it to create Sandbox.

\*\*Arguments\*\*:

\- \`params\` \_CreateSandboxFromImageParams \| None\_ - Parameters for Sandbox creation from image.
\- \`timeout\` \_float\_ - Timeout (in seconds) for sandbox creation. 0 means no timeout.
 Default is 60 seconds.
\- \`on\_snapshot\_create\_logs\` \_Callable\[\[str\], None\] \| None\_ - This callback function
 handles snapshot creation logs.


\*\*Returns\*\*:

\- \`Sandbox\` - The created Sandbox instance.


\*\*Raises\*\*:

\- \`DaytonaError\` - If timeout, auto\_stop\_interval or auto\_archive\_interval is negative;
 If sandbox fails to start or times out


\*\*Example\*\*:

 Create a default Python Sandbox from image:
\`\`\`python
sandbox = await daytona.create(CreateSandboxFromImageParams(image="debian:12.9"))
\`\`\`

 Create a custom Sandbox from declarative Image definition:
\`\`\`python
declarative\_image = (
 Image.base("alpine:3.18")
 .pipInstall(\["numpy", "pandas"\])
 .env({"MY\_ENV\_VAR": "My Environment Variable"})
)
params = CreateSandboxFromImageParams(
 language="python",
 image=declarative\_image,
 env\_vars={"DEBUG": "true"},
 resources=Resources(cpu=2, memory=4),
 auto\_stop\_interval=0,
 auto\_archive\_interval=60,
 auto\_delete\_interval=120
)
sandbox = await daytona.create(
 params,
 timeout=40,
 on\_snapshot\_create\_logs=lambda chunk: print(chunk, end=""),
)
\`\`\`

\#### AsyncDaytona.delete

\`\`\`python
@with\_instrumentation()
async def delete(sandbox: AsyncSandbox,
 timeout: float = 60,
 wait: bool = False) -> None
\`\`\`

Deletes a Sandbox.

By default returns as soon as the deletion request is accepted (fire-and-forget).
Pass \`\`wait=True\`\` to block until the Sandbox reaches the 'destroyed' state.

\*\*Arguments\*\*:

\- \`sandbox\` \_Sandbox\_ - The Sandbox instance to delete.
\- \`timeout\` \_float\_ - Timeout (in seconds) for the request and, when \`\`wait\`\`
 is True, for reaching 'destroyed'. 0 means no timeout. Default is 60 seconds.
\- \`wait\` \_bool\_ - If True, wait until the Sandbox is destroyed. Defaults to False.


\*\*Raises\*\*:

\- \`DaytonaError\` - If sandbox fails to delete or times out


\*\*Example\*\*:

\`\`\`python
sandbox = await daytona.create()
\# ... use sandbox ...
await daytona.delete(sandbox) # Clean up when done
\`\`\`

\#### AsyncDaytona.get

\`\`\`python
@intercept\_errors(message\_prefix="Failed to get sandbox: ")
@with\_instrumentation()
async def get(sandbox\_id\_or\_name: str,
 request\_timeout: float \| None = None) -> AsyncSandbox
\`\`\`

Gets a Sandbox by its ID or name.

\*\*Arguments\*\*:

\- \`sandbox\_id\_or\_name\` \_str\_ - The ID or name of the Sandbox to retrieve.
\- \`request\_timeout\` \_float \| None\_ - Optional client-side request timeout in seconds. Client-side
 only. It bounds how long the SDK waits for the HTTP response and does not cancel
 the operation on the server. Positive values under 1 second are rounded up to 1
 second; 0 disables the client-side timeout and negative values are rejected.


\*\*Returns\*\*:

\- \`Sandbox\` - The Sandbox instance.


\*\*Raises\*\*:

\- \`DaytonaError\` - If sandbox\_id\_or\_name is not provided.


\*\*Example\*\*:

\`\`\`python
sandbox = await daytona.get("my-sandbox-id-or-name")
print(sandbox.state)
\`\`\`

\#### AsyncDaytona.list

\`\`\`python
@intercept\_errors(message\_prefix="Failed to list sandboxes: ")
@with\_instrumentation()
async def list(
 query: ListSandboxesQuery \| None = None,
 request\_timeout: float \| None = None) -> AsyncIterator\[AsyncSandbox\]
\`\`\`

Iterates over Sandboxes matching the given query.

\*\*Arguments\*\*:

\- \`query\` - Optional filters, sorting, and per-page size.
\- \`request\_timeout\` \_float \| None\_ - Optional client-side request timeout in seconds. Client-side
 only. It bounds how long the SDK waits for the HTTP response and does not cancel
 the operation on the server. Positive values under 1 second are rounded up to 1
 second; 0 disables the client-side timeout and negative values are rejected.


\*\*Yields\*\*:

\- \`AsyncSandbox\` - Each Sandbox matching the query.


\*\*Example\*\*:

\`\`\`python
from daytona import ListSandboxesQuery

async for sandbox in daytona.list(ListSandboxesQuery(labels={"env": "dev"})):
 print(sandbox.id)
\`\`\`

\#### AsyncDaytona.start

\`\`\`python
@with\_instrumentation()
async def start(sandbox: AsyncSandbox, timeout: float = 60) -> None
\`\`\`

Starts a Sandbox and waits for it to be ready.

\*\*Arguments\*\*:

\- \`sandbox\` \_Sandbox\_ - The Sandbox to start.
\- \`timeout\` \_float\_ - Optional timeout in seconds to wait for the Sandbox to start.
 0 means no timeout. Default is 60 seconds.


\*\*Raises\*\*:

\- \`DaytonaError\` - If timeout is negative; If Sandbox fails to start or times out

\#### AsyncDaytona.stop

\`\`\`python
@with\_instrumentation()
async def stop(sandbox: AsyncSandbox, timeout: float = 60) -> None
\`\`\`

Stops a Sandbox and waits for it to be stopped.

\*\*Arguments\*\*:

\- \`sandbox\` \_Sandbox\_ - The sandbox to stop
\- \`timeout\` \_float\_ - Optional timeout (in seconds) for sandbox stop.
 0 means no timeout. Default is 60 seconds.


\*\*Raises\*\*:

\- \`DaytonaError\` - If timeout is negative; If Sandbox fails to stop or times out

\## CodeLanguage

\`\`\`python
class CodeLanguage(str, Enum)
\`\`\`

Programming languages supported by Daytona

\*\*Enum Members\*\*:
 \- \`PYTHON\` ("python")
 \- \`TYPESCRIPT\` ("typescript")
 \- \`JAVASCRIPT\` ("javascript")

\## DaytonaConfig

\`\`\`python
class DaytonaConfig(BaseModel)
\`\`\`

Configuration options for initializing the Daytona client.

\*\*Attributes\*\*:

\- \`api\_key\` \_str \| None\_ - API key for authentication with the Daytona API. If not set, it must be provided
 via the environment variable \`DAYTONA\_API\_KEY\`, or a JWT token must be provided instead.
\- \`jwt\_token\` \_str \| None\_ - JWT token for authentication with the Daytona API. If not set, it must be provided
 via the environment variable \`DAYTONA\_JWT\_TOKEN\`, or an API key must be provided instead.
\- \`organization\_id\` \_str \| None\_ - Organization ID used for JWT-based authentication. Required if a JWT token
 is provided, and must be set either here or in the environment variable \`DAYTONA\_ORGANIZATION\_ID\`.
\- \`api\_url\` \_str \| None\_ - URL of the Daytona API. Defaults to \`'https://app.daytona.io/api'\` if not set
 here or in the environment variable \`DAYTONA\_API\_URL\`.
\- \`server\_url\` \_str \| None\_ - Deprecated. Use \`api\_url\` instead. This property will be removed
 in a future version.
\- \`target\` \_str \| None\_ - Target runner location for the Sandbox. Default region for the organization is used
 if not set here or in the environment variable \`DAYTONA\_TARGET\`.
\- \`connection\_pool\_maxsize\` \_int \| None\_ - Maximum number of simultaneous HTTP connections
 the SDK will open. Defaults to 250. Set to \`None\` to remove the limit, which is
 recommended when running many concurrent long-lived operations like \`process.exec\`.
\- \`otel\_enabled\` \_bool \| None\_ - Enable OpenTelemetry tracing for SDK operations. Defaults
 to \`None\`, which falls back to the \`DAYTONA\_OTEL\_ENABLED\` environment variable.
\- \`use\_deprecated\_polling\` \_bool \| None\_ - Observe sandbox state by legacy polling instead
 of WebSocket event streaming. Defaults to \`\`False\`\` (event streaming). Can also be
 enabled via the \`\`DAYTONA\_USE\_DEPRECATED\_POLLING\`\` environment variable.

 .. deprecated::
 Polling-only mode will be removed in a future release; event streaming is the
 default and falls back to polling automatically when WebSockets are unavailable.
\- \`\_experimental\` \_dict\[str, any\] \| None\_ - Configuration for experimental features.


\*\*Example\*\*:

\`\`\`python
config = DaytonaConfig(api\_key="your-api-key")
\`\`\`
\`\`\`python
config = DaytonaConfig(jwt\_token="your-jwt-token", organization\_id="your-organization-id")
\`\`\`

\## CreateSandboxBaseParams

\`\`\`python
class CreateSandboxBaseParams(BaseModel)
\`\`\`

Base parameters for creating a new Sandbox.

\*\*Attributes\*\*:

\- \`name\` \_str \| None\_ - Name of the Sandbox.
\- \`language\` \_CodeLanguage \| CodeLanguageLiteral \| None\_ - Programming language for the Sandbox.
 Defaults to "python".
\- \`os\_user\` \_str \| None\_ - OS user for the Sandbox.
\- \`env\_vars\` \_dict\[str, str\] \| None\_ - Environment variables to set in the Sandbox.
\- \`labels\` \_dict\[str, str\] \| None\_ - Custom labels for the Sandbox.
\- \`public\` \_bool \| None\_ - Whether the Sandbox should be public.
\- \`timeout\` \_float \| None\_ - Timeout in seconds for Sandbox to be created and started.
\- \`auto\_stop\_interval\` \_int \| None\_ - Interval in minutes after which Sandbox will
 automatically stop if no Sandbox event occurs during that time. Default is 15 minutes
 (for sandbox classes that support pausing, auto-pause defaults to 60 minutes instead
 and auto-stop is disabled). 0 means no auto-stop.
\- \`auto\_pause\_interval\` \_int \| None\_ - Auto-pause interval in minutes (0 means disabled).
 Only supported for sandbox classes that support pausing.
 Not allowed for ephemeral sandboxes. At most one of auto\_stop\_interval and
 auto\_pause\_interval may be non-zero. For non-ephemeral sandbox classes that
 support pausing, defaults to 60 minutes (with auto-stop disabled) when
 neither interval is provided.
\- \`auto\_archive\_interval\` \_int \| None\_ - Interval in minutes after which a continuously stopped Sandbox will
 automatically archive. Default is 7 days.
 0 means the maximum interval will be used.
\- \`auto\_delete\_interval\` \_int \| None\_ - Interval in minutes after which a continuously stopped Sandbox will
 automatically be deleted. By default, auto-delete is disabled.
 Negative value means disabled, 0 means delete immediately upon stopping.
\- \`ttl\_minutes\` \_int \| None\_ - Maximum time to live in minutes, counted as wall-clock time since
 creation regardless of sandbox state. When it elapses the sandbox is destroyed, even if
 it is stopped, paused, or archived. 0 means disabled.
\- \`volumes\` \_list\[VolumeMount\] \| None\_ - List of volumes mounts to attach to the Sandbox.
\- \`secrets\` \_dict\[str, str\] \| None\_ - Map of environment variable name to the name of an existing
 organization Secret to mount into the Sandbox. The env var is set to the Secret's opaque
 placeholder, not the plaintext; the real value is substituted transparently on outbound
 requests to the Secret's allowed hosts. Every referenced Secret name must already exist
 in the organization.
\- \`network\_block\_all\` \_bool \| None\_ - Whether to block all network access for the Sandbox.
\- \`network\_allow\_list\` \_str \| None\_ - Comma-separated list of allowed CIDR network addresses for the Sandbox.
\- \`domain\_allow\_list\` \_str \| None\_ - Comma-separated list of allowed domains for the Sandbox.
\- \`ephemeral\` \_bool \| None\_ - Whether the Sandbox should be ephemeral.
 If True, auto\_delete\_interval will be set to 0.
\- \`linked\_sandbox\` \_str \| None\_ - ID or name of an existing Sandbox to link the new Sandbox to. The new
 Sandbox will be scheduled on the same runner as the linked Sandbox so a local network can be
 established between them. Linked Sandboxes must be
 ephemeral (auto\_delete\_interval=0) and cannot themselves be linked to another Sandbox.

\## CreateSandboxFromImageParams

\`\`\`python
class CreateSandboxFromImageParams(CreateSandboxBaseParams)
\`\`\`

Parameters for creating a new Sandbox from an image.

\*\*Attributes\*\*:

\- \`image\` \_str \| Image\_ - Custom Docker image to use for the Sandbox. If an Image object is provided,
 the image will be dynamically built.
\- \`resources\` \_Resources \| None\_ - Resource configuration for the Sandbox. If not provided, sandbox will
 have default resources.

\## CreateSandboxFromSnapshotParams

\`\`\`python
class CreateSandboxFromSnapshotParams(CreateSandboxBaseParams)
\`\`\`

Parameters for creating a new Sandbox from a snapshot.

\*\*Attributes\*\*:

\- \`snapshot\` \_str \| None\_ - Name of the snapshot to use for the Sandbox.