---
url: "https://www.daytona.io/docs/en/java-sdk/sandbox/"
title: "Sandbox | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/java-sdk/sandbox/#_top)

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/java-sdk/sandbox.md)Open

## [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#sandbox) Sandbox

[Section titled “Sandbox”](https://www.daytona.io/docs/en/java-sdk/sandbox/#sandbox)

Represents a Daytona Sandbox instance.

Exposes lifecycle controls and operation facades for process execution, file-system access,
and Git. State changes are streamed over WebSocket by default with polling as a safety net,
or observed by polling only when the deprecated polling mode is enabled.

**Properties**:

- `process` _Process_ \- Process execution interface for this Sandbox.
- `fs` _FileSystem_ \- File-system operations interface for this Sandbox.
- `git` _Git_ \- Git operations interface for this Sandbox.
- `computerUse` _ComputerUse_ \- Computer use (desktop automation) interface for this Sandbox.
- `codeInterpreter` _CodeInterpreter_ \- Stateful code interpreter for this Sandbox (Python).

### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#methods) Methods

[Section titled “Methods”](https://www.daytona.io/docs/en/java-sdk/sandbox/#methods)

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#createlspserver) createLspServer()

[Section titled “createLspServer()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#createlspserver)

```
public LspServer createLspServer(String languageId, String pathToProject)
```

Creates an LSP server instance for the specified language and project.

**Parameters**:

- `languageId` _String_ \- language server to start (e.g. “typescript”, “python”, “go”)
- `pathToProject` _String_ \- absolute path to the project root inside the sandbox

**Returns**:

- `LspServer` \- a new `LspServer` configured for the given language

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#start) start()

[Section titled “start()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#start)

```
public void start()
```

Starts this Sandbox with default timeout.

**Throws**:

- `DaytonaException` \- if the Sandbox fails to start

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#start-1) start()

[Section titled “start()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#start-1)

```
public void start(long timeoutSeconds)
```

Starts this Sandbox and waits for readiness.

**Parameters**:

- `timeoutSeconds` _long_ \- maximum seconds to wait; `0` disables timeout

**Throws**:

- `DaytonaException` \- if start fails or times out

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#stop) stop()

[Section titled “stop()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#stop)

```
public void stop()
```

Stops this Sandbox with default timeout.

**Throws**:

- `DaytonaException` \- if the Sandbox fails to stop

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#stop-1) stop()

[Section titled “stop()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#stop-1)

```
public void stop(long timeoutSeconds)
```

Stops this Sandbox and waits until fully stopped.

**Parameters**:

- `timeoutSeconds` _long_ \- maximum seconds to wait; `0` disables timeout

**Throws**:

- `DaytonaException` \- if stop fails or times out

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#waituntilstopped) waitUntilStopped()

[Section titled “waitUntilStopped()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#waituntilstopped)

```
public void waitUntilStopped(long timeoutSeconds)
```

Waits until Sandbox reaches `stopped` (or `destroyed`) state.

**Parameters**:

- `timeoutSeconds` _long_ \- maximum seconds to wait; `0` disables timeout

**Throws**:

- `DaytonaException` \- if timeout is invalid, state becomes error, or timeout expires

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#delete) delete()

[Section titled “delete()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#delete)

```
public void delete()
```

Deletes this Sandbox.

Fires the delete API call and returns immediately without waiting for the
Sandbox to reach the `destroyed` state. Use `#delete(long, boolean)`
with `wait=true` to block until destruction completes.

**Throws**:

- `DaytonaException` \- if the delete API call fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#delete-1) delete()

[Section titled “delete()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#delete-1)

```
public void delete(long timeoutSeconds)
```

Deletes this Sandbox.

Fires the delete API call and returns immediately. Use
`#delete(long, boolean)` with `wait=true` to block until destroyed.

**Parameters**:

- `timeoutSeconds` _long_ \- timeout for the HTTP request (and for waiting when `wait` is true in `#delete(long, boolean)`)

**Throws**:

- `DaytonaException` \- if the delete API call fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#delete-2) delete()

[Section titled “delete()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#delete-2)

```
public void delete(long timeoutSeconds, boolean wait)
```

Deletes this Sandbox, optionally waiting for it to reach the `destroyed` state.

**Parameters**:

- `timeoutSeconds` _long_ \- maximum seconds to wait when `wait` is true; `0` disables timeout. Ignored when `wait` is false.
- `wait` _boolean_ \- if `true`, block until the Sandbox is destroyed

**Throws**:

- `DaytonaException` \- if deletion fails or times out

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#setlabels) setLabels()

[Section titled “setLabels()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#setlabels)

```
public Map<String, String> setLabels(Map<String, String> labels)
```

Replaces Sandbox labels.

**Parameters**:

- `labels` _Map<String, String>_ \- label map to apply

**Returns**:

- `Map\<String, String\>` \- updated labels

**Throws**:

- `DaytonaException` \- if label update fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#setautostopinterval) setAutostopInterval()

[Section titled “setAutostopInterval()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#setautostopinterval)

```
public void setAutostopInterval(int minutes)
```

Sets Sandbox auto-stop interval.

**Parameters**:

- `minutes` _int_ \- idle minutes before automatic stop

**Throws**:

- `DaytonaException` \- if the update fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#setautopauseinterval) setAutoPauseInterval()

[Section titled “setAutoPauseInterval()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#setautopauseinterval)

```
public void setAutoPauseInterval(int minutes)
```

Sets Sandbox auto-pause interval.

**Parameters**:

- `minutes` _int_ \- idle minutes before automatic pause (0 means disabled)

**Throws**:

- `DaytonaException` \- if the update fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#setautoarchiveinterval) setAutoArchiveInterval()

[Section titled “setAutoArchiveInterval()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#setautoarchiveinterval)

```
public void setAutoArchiveInterval(int minutes)
```

Sets Sandbox auto-archive interval.

**Parameters**:

- `minutes` _int_ \- minutes in stopped state before automatic archive

**Throws**:

- `DaytonaException` \- if the update fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#setautodeleteinterval) setAutoDeleteInterval()

[Section titled “setAutoDeleteInterval()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#setautodeleteinterval)

```
public void setAutoDeleteInterval(int minutes)
```

Sets Sandbox auto-delete interval.

**Parameters**:

- `minutes` _int_ \- minutes before automatic deletion after stop

**Throws**:

- `DaytonaException` \- if the update fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#setttl) setTtl()

[Section titled “setTtl()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#setttl)

```
public void setTtl(int ttlMinutes)
```

Sets Sandbox TTL (time to live) in minutes. Set to 0 to disable the TTL.
The deadline is computed server-side; call `#refreshData()` and read the updated
value via `#getAutoDestroyAt()`.

**Parameters**:

- `ttlMinutes` _int_ \- minutes until the Sandbox is destroyed, or 0 to disable

**Throws**:

- `IllegalArgumentException` \- if ttlMinutes is negative
- `DaytonaException` \- if the update fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#updatenetworksettings) updateNetworkSettings()

[Section titled “updateNetworkSettings()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#updatenetworksettings)

```
public void updateNetworkSettings(UpdateSandboxNetworkSettings settings)
```

Updates outbound network policy on the runner (block all, restore access, or CIDR allow list).

**Parameters**:

- `settings` _UpdateSandboxNetworkSettings_ \- request body; at least one of networkBlockAll or networkAllowList must be set

**Throws**:

- `DaytonaException` \- if the update fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#updatesecrets) updateSecrets()

[Section titled “updateSecrets()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#updatesecrets)

```
public void updateSecrets(Map<String, String> secrets)
```

Replaces the set of vault secrets mounted in this Sandbox.

Each key is an environment variable name and each value is the name of an existing
organization Secret. Pass an empty map to detach all secrets. Attached, detached, and
rotated secrets take effect for outbound requests within seconds. New environment
variables are only visible to processes spawned after the update; a Sandbox created
without secrets must be restarted for newly attached secrets to work.

**Parameters**:

- `secrets` _Map<String, String>_ \- map of environment variable name to organization Secret name

**Throws**:

- `DaytonaException` \- if the update fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#getuserhomedir) getUserHomeDir()

[Section titled “getUserHomeDir()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#getuserhomedir)

```
public String getUserHomeDir()
```

Returns home directory path for Sandbox user.

**Returns**:

- `String` \- absolute home directory path

**Throws**:

- `DaytonaException` \- if the request fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#getmetricslatest) getMetricsLatest()

[Section titled “getMetricsLatest()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#getmetricslatest)

```
public SandboxMetrics getMetricsLatest()
```

Gets the most recent resource usage sample directly from the sandbox daemon.

Unlike `#getMetrics`, which returns aggregated historical samples, this returns
the single current reading without going through the telemetry backend.

**Returns**:

- `SandboxMetrics` \- the current resource usage sample for the sandbox

**Throws**:

- `DaytonaException` \- if the request fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#getmetrics) getMetrics()

[Section titled “getMetrics()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#getmetrics)

```
public List<SandboxMetrics> getMetrics(OffsetDateTime start, OffsetDateTime end)
```

Gets historical time-series resource usage metrics for the sandbox.

When the deployment runs a dedicated Analytics API, metrics are fetched from it directly;
otherwise they are fetched through the control-plane telemetry proxy. A `null` start
defaults to the sandbox creation time; a `null` end defaults to the current time.
Samples are returned ordered ascending by timestamp.

**Parameters**:

- `start` _OffsetDateTime_ \- start of the time range, or `null` for the sandbox creation time
- `end` _OffsetDateTime_ \- end of the time range, or `null` for the current time

**Returns**:

- `List\<SandboxMetrics\>` \- time-ordered usage samples over the requested range

**Throws**:

- `DaytonaException` \- if the request fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#getworkdir) getWorkDir()

[Section titled “getWorkDir()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#getworkdir)

```
public String getWorkDir()
```

Returns current working directory path.

**Returns**:

- `String` \- absolute working directory path

**Throws**:

- `DaytonaException` \- if the request fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#updateenv) updateEnv()

[Section titled “updateEnv()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#updateenv)

```
public void updateEnv(Map<String, String> env)
```

Updates the Sandbox daemon’s process environment.

Newly spawned processes, sessions, and PTYs inherit the change; already-running
processes keep their environment.

**Parameters**:

- `env` _Map<String, String>_ \- environment variables to set in the daemon’s process environment

**Throws**:

- `DaytonaException` \- if the update fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#updateenv-1) updateEnv()

[Section titled “updateEnv()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#updateenv-1)

```
public void updateEnv(Map<String, String> env, List<String> unset)
```

Updates the Sandbox daemon’s process environment.

Newly spawned processes, sessions, and PTYs inherit the change; already-running
processes keep their environment.

**Parameters**:

- `env` _Map<String, String>_ \- environment variables to set in the daemon’s process environment; `null` to set none
- `unset` _List<String>_ \- environment variable names to remove; `null` to remove none

**Throws**:

- `DaytonaException` \- if the update fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#downloadurl) downloadUrl()

[Section titled “downloadUrl()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#downloadurl)

```
public String downloadUrl(String path, Long ttlSeconds)
```

Creates a pre-signed URL for downloading a file from the Sandbox.

The URL works with any HTTP client without auth headers and stays valid across
sandbox restarts (downloads succeed only while the sandbox is running). The signing
key is cached locally for up to 15 seconds; if the key was rotated from another
client, URLs may be rejected until the cache refreshes.

```
String url = sandbox.downloadUrl("/home/user/report.pdf", null);

// curl "$url" -o report.pdf
```

**Parameters**:

- `path` _String_ \- Path to the file in the Sandbox.
- `ttlSeconds` _Long_ \- How long the URL stays valid, in seconds. Defaults to 3600. Zero or negative means never expires.

**Returns**:

- `String` \- Pre-signed download URL.

**Throws**:

- `DaytonaException` \- if the signing key cannot be fetched.

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#downloadurl-1) downloadUrl()

[Section titled “downloadUrl()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#downloadurl-1)

```
public String downloadUrl(String path)
```

Creates a pre-signed URL for downloading a file from the Sandbox.

**Parameters**:

- `path` _String_ \- Path to the file in the Sandbox.

**Returns**:

- `String` \- Pre-signed download URL.

**Throws**:

- `DaytonaException` \- if the signing key cannot be fetched.

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#uploadurl) uploadUrl()

[Section titled “uploadUrl()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#uploadurl)

```
public String uploadUrl(String path, Long ttlSeconds)
```

Creates a pre-signed URL for uploading a file to the Sandbox.

Send a POST request with the file as multipart/form-data. The URL works with any
HTTP client without auth headers. The signing key is cached locally for up to
15 seconds; if the key was rotated from another client, URLs may be rejected
until the cache refreshes.

```
String url = sandbox.uploadUrl("/home/user/data.bin", null);

// curl -X POST -F "file=@local.bin" "$url"
```

**Parameters**:

- `path` _String_ \- Destination path for the uploaded file in the Sandbox.
- `ttlSeconds` _Long_ \- How long the URL stays valid, in seconds. Defaults to 3600. Zero or negative means never expires.

**Returns**:

- `String` \- Pre-signed upload URL.

**Throws**:

- `DaytonaException` \- if the signing key cannot be fetched.

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#uploadurl-1) uploadUrl()

[Section titled “uploadUrl()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#uploadurl-1)

```
public String uploadUrl(String path)
```

Creates a pre-signed URL for uploading a file to the Sandbox.

**Parameters**:

- `path` _String_ \- Destination path for the uploaded file in the Sandbox.

**Returns**:

- `String` \- Pre-signed upload URL.

**Throws**:

- `DaytonaException` \- if the signing key cannot be fetched.

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#rotatesigningkey) rotateSigningKey()

[Section titled “rotateSigningKey()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#rotatesigningkey)

```
public void rotateSigningKey()
```

Rotates the sandbox signing key, invalidating all previously signed URLs.

**Throws**:

- `DaytonaException` \- if the signing key rotation fails.

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#waituntilstarted) waitUntilStarted()

[Section titled “waitUntilStarted()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#waituntilstarted)

```
public void waitUntilStarted(long timeoutSeconds)
```

Waits until Sandbox reaches `started` state.

**Parameters**:

- `timeoutSeconds` _long_ \- maximum seconds to wait; `0` disables timeout

**Throws**:

- `DaytonaException` \- if timeout is invalid, state becomes failure, or timeout expires

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#waitforresizecomplete) waitForResizeComplete()

[Section titled “waitForResizeComplete()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#waitforresizecomplete)

```
public void waitForResizeComplete(long timeoutSeconds)
```

Waits for a resize operation to complete.

**Parameters**:

- `timeoutSeconds` _long_ \- maximum seconds to wait; `0` disables timeout

**Throws**:

- `DaytonaException` \- if resize times out or fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#refreshdata) refreshData()

[Section titled “refreshData()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#refreshdata)

```
public void refreshData()
```

Refreshes local Sandbox fields from latest API state. After refresh, all fields
— including those not returned by `Daytona#list` — are populated.

**Throws**:

- `DaytonaException` \- if refresh fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#fork) fork()

[Section titled “fork()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#fork)

```
public Sandbox fork()
```

Forks this Sandbox, creating a new Sandbox with an identical filesystem.
Uses default timeout of 60 seconds.

Example usage:

```
Sandbox forked = sandbox.fork();

System.out.println(forked.getId());
```

**Returns**:

- `Sandbox` \- the forked `Sandbox` in started state

**Throws**:

- `DaytonaException` \- if the fork operation fails or times out

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#fork-1) fork()

[Section titled “fork()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#fork-1)

```
public Sandbox fork(String name, long timeoutSeconds)
```

Forks this Sandbox, creating a new Sandbox with an identical filesystem.
The forked Sandbox is a copy-on-write clone of the original.

Example usage:

```
Sandbox forked = sandbox.fork("my-fork", 120);

System.out.println(forked.getId());
```

**Parameters**:

- `name` _String_ \- optional name for the forked Sandbox; `null` for auto-generated
- `timeoutSeconds` _long_ \- maximum seconds to wait for the forked Sandbox to start; `0` disables timeout

**Returns**:

- `Sandbox` \- the forked `Sandbox` in started state

**Throws**:

- `DaytonaException` \- if the fork operation fails or times out

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#experimentalfork) experimentalFork()

[Section titled “experimentalFork()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#experimentalfork)

```
public Sandbox experimentalFork()
```

Forks this Sandbox, creating a new Sandbox with an identical filesystem.
Uses default timeout of 60 seconds.

**Deprecated**: Use `#fork()` instead. This method will be removed in a future version.

**Returns**:

- `Sandbox` \- the forked `Sandbox` in started state

**Throws**:

- `DaytonaException` \- if the fork operation fails or times out

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#experimentalfork-1) experimentalFork()

[Section titled “experimentalFork()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#experimentalfork-1)

```
public Sandbox experimentalFork(String name, long timeoutSeconds)
```

Forks this Sandbox, creating a new Sandbox with an identical filesystem.
The forked Sandbox is a copy-on-write clone of the original.

**Deprecated**: Use `#fork(String, long)` instead. This method will be removed in a future version.

**Parameters**:

- `name` _String_ \- optional name for the forked Sandbox; `null` for auto-generated
- `timeoutSeconds` _long_ \- maximum seconds to wait for the forked Sandbox to start; `0` disables timeout

**Returns**:

- `Sandbox` \- the forked `Sandbox` in started state

**Throws**:

- `DaytonaException` \- if the fork operation fails or times out

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#createsnapshot) createSnapshot()

[Section titled “createSnapshot()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#createsnapshot)

```
public void createSnapshot(String name)
```

Creates a snapshot from the current state of this Sandbox.
Uses default timeout of 60 seconds.

Example usage:

```
sandbox.createSnapshot("my-snapshot");
```

**Parameters**:

- `name` _String_ \- name for the new snapshot

**Throws**:

- `DaytonaException` \- if the snapshot operation fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#createsnapshot-1) createSnapshot()

[Section titled “createSnapshot()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#createsnapshot-1)

```
public void createSnapshot(String name, long timeoutSeconds)
```

Creates a snapshot from the current state of this Sandbox.
The Sandbox will temporarily enter a ‘snapshotting’ state and return to its previous state when complete.

Example usage:

```
sandbox.createSnapshot("my-snapshot", 120);
```

**Parameters**:

- `name` _String_ \- name for the new snapshot
- `timeoutSeconds` _long_ \- maximum seconds to wait for the snapshot operation to complete; `0` disables timeout

**Throws**:

- `DaytonaException` \- if the snapshot operation fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#experimentalcreatesnapshot) experimentalCreateSnapshot()

[Section titled “experimentalCreateSnapshot()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#experimentalcreatesnapshot)

```
public void experimentalCreateSnapshot(String name)
```

Creates a snapshot from the current state of this Sandbox.
Uses default timeout of 60 seconds.

**Deprecated**: Use `#createSnapshot(String)` instead. This method will be removed in a future version.

**Parameters**:

- `name` _String_ \- name for the new snapshot

**Throws**:

- `DaytonaException` \- if the snapshot operation fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#experimentalcreatesnapshot-1) experimentalCreateSnapshot()

[Section titled “experimentalCreateSnapshot()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#experimentalcreatesnapshot-1)

```
public void experimentalCreateSnapshot(String name, long timeoutSeconds)
```

Creates a snapshot from the current state of this Sandbox.
The Sandbox will temporarily enter a ‘snapshotting’ state and return to its previous state when complete.

**Deprecated**: Use `#createSnapshot(String, long)` instead. This method will be removed in a future version.

**Parameters**:

- `name` _String_ \- name for the new snapshot
- `timeoutSeconds` _long_ \- maximum seconds to wait for the snapshot operation to complete; `0` disables timeout

**Throws**:

- `DaytonaException` \- if the snapshot operation fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#pause) pause()

[Section titled “pause()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#pause)

```
public void pause() throws DaytonaException
```

Pauses the Sandbox, freezing all running processes.
Uses default timeout of 60 seconds.

**Throws**:

- `DaytonaException` \- if the pause operation fails

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#pause-1) pause()

[Section titled “pause()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#pause-1)

```
public void pause(long timeoutSeconds) throws DaytonaException
```

Pauses the Sandbox, freezing all running processes.
Completes when the Sandbox has left the `pausing` state — any non-error
terminal state (paused, stopped, archived, etc.) is accepted.

**Parameters**:

- `timeoutSeconds` _long_ \- maximum time to wait in seconds (0 = no timeout)

**Throws**:

- `DaytonaException` \- if timeout is negative or the operation fails/times out

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#getid) getId()

[Section titled “getId()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#getid)

```
public String getId()
```

**Returns**:

- `String` \- Sandbox ID.

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#getname) getName()

[Section titled “getName()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#getname)

```
public String getName()
```

**Returns**:

- `String` \- Sandbox name.

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#getorganizationid) getOrganizationId()

[Section titled “getOrganizationId()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#getorganizationid)

```
public String getOrganizationId()
```

**Returns**:

- `String` \- organization ID that owns this Sandbox.

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#getsnapshot) getSnapshot()

[Section titled “getSnapshot()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#getsnapshot)

```
public String getSnapshot()
```

**Returns**:

- `String` \- Daytona snapshot used to create this Sandbox, or `null` if none.

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#getuser) getUser()

[Section titled “getUser()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#getuser)

```
public String getUser()
```

**Returns**:

- `String` \- OS user running in the Sandbox.

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#getlabels) getLabels()

[Section titled “getLabels()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#getlabels)

```
public Map<String, String> getLabels()
```

**Returns**:

- `Map\<String, String\>` \- custom labels attached to the Sandbox.

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#getpublic) getPublic()

[Section titled “getPublic()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#getpublic)

```
public Boolean getPublic()
```

**Returns**:

- `Boolean` \- whether the Sandbox HTTP preview is publicly accessible.

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#gettarget) getTarget()

[Section titled “getTarget()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#gettarget)

```
public String getTarget()
```

**Returns**:

- `String` \- target region/environment where the Sandbox runs.

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#getcpu) getCpu()

[Section titled “getCpu()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#getcpu)

```
public int getCpu()
```

**Returns**:

- `int` \- allocated CPU cores.

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#getgpu) getGpu()

[Section titled “getGpu()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#getgpu)

```
public int getGpu()
```

**Returns**:

- `int` \- allocated GPU units.

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#getmemory) getMemory()

[Section titled “getMemory()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#getmemory)

```
public int getMemory()
```

**Returns**:

- `int` \- allocated memory in GiB.

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#getdisk) getDisk()

[Section titled “getDisk()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#getdisk)

```
public int getDisk()
```

**Returns**:

- `int` \- allocated disk in GiB.

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#getstate) getState()

[Section titled “getState()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#getstate)

```
public String getState()
```

**Returns**:

- `String` \- current lifecycle state (e.g. “started”, “stopped”).

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#geterrorreason) getErrorReason()

[Section titled “getErrorReason()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#geterrorreason)

```
public String getErrorReason()
```

**Returns**:

- `String` \- error message if the Sandbox is in an error state, or `null`.

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#getrecoverable) getRecoverable()

[Section titled “getRecoverable()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#getrecoverable)

```
public Boolean getRecoverable()
```

**Returns**:

- `Boolean` \- whether the Sandbox error is recoverable, or `null` if unknown.

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#getbackupstate) getBackupState()

[Section titled “getBackupState()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#getbackupstate)

```
public String getBackupState()
```

**Returns**:

- `String` \- current state of the Sandbox backup as a string, or `null`.

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#getautostopinterval) getAutoStopInterval()

[Section titled “getAutoStopInterval()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#getautostopinterval)

```
public Integer getAutoStopInterval()
```

**Returns**:

- `Integer` \- auto-stop interval in minutes (0 means disabled).

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#getautopauseinterval) getAutoPauseInterval()

[Section titled “getAutoPauseInterval()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#getautopauseinterval)

```
public Integer getAutoPauseInterval()
```

**Returns**:

- `Integer` \- auto-pause interval in minutes (0 means disabled).

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#getautoarchiveinterval) getAutoArchiveInterval()

[Section titled “getAutoArchiveInterval()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#getautoarchiveinterval)

```
public Integer getAutoArchiveInterval()
```

**Returns**:

- `Integer` \- auto-archive interval in minutes.

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#getautodeleteinterval) getAutoDeleteInterval()

[Section titled “getAutoDeleteInterval()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#getautodeleteinterval)

```
public Integer getAutoDeleteInterval()
```

**Returns**:

- `Integer` \- auto-delete interval in minutes (negative means disabled).

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#getcreatedat) getCreatedAt()

[Section titled “getCreatedAt()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#getcreatedat)

```
public String getCreatedAt()
```

**Returns**:

- `String` \- when the Sandbox was created, or `null`.

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#getupdatedat) getUpdatedAt()

[Section titled “getUpdatedAt()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#getupdatedat)

```
public String getUpdatedAt()
```

**Returns**:

- `String` \- when the Sandbox was last updated, or `null`.

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#getlastactivityat) getLastActivityAt()

[Section titled “getLastActivityAt()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#getlastactivityat)

```
public String getLastActivityAt()
```

**Returns**:

- `String` \- when the Sandbox last had activity, or `null`.

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#getautodestroyat) getAutoDestroyAt()

[Section titled “getAutoDestroyAt()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#getautodestroyat)

```
public String getAutoDestroyAt()
```

**Returns**:

- `String` \- when the Sandbox expires, or `null` if no TTL is set.

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#gettoolboxproxyurl) getToolboxProxyUrl()

[Section titled “getToolboxProxyUrl()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#gettoolboxproxyurl)

```
public String getToolboxProxyUrl()
```

**Returns**:

- `String` \- toolbox proxy URL.

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#getenv) getEnv()

[Section titled “getEnv()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#getenv)

```
public Map<String, String> getEnv()
```

Returns Sandbox environment variables.

Not returned by `Daytona#list`; call `#refreshData()` on each item to populate.

**Returns**:

- `Map\<String, String\>` \- environment map, or `null` if not yet populated

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#getnetworkblockall) getNetworkBlockAll()

[Section titled “getNetworkBlockAll()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#getnetworkblockall)

```
public Boolean getNetworkBlockAll()
```

Returns whether all network access is blocked for this Sandbox.

Not returned by `Daytona#list`; call `#refreshData()` on each item to populate.

**Returns**:

- `Boolean` \- block-all flag, or `null` if not yet populated

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#getnetworkallowlist) getNetworkAllowList()

[Section titled “getNetworkAllowList()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#getnetworkallowlist)

```
public String getNetworkAllowList()
```

Returns the comma-separated CIDR allow list, if any.

Not returned by `Daytona#list`; call `#refreshData()` on each item to populate.

**Returns**:

- `String` \- allow list, or `null`

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#getdomainallowlist) getDomainAllowList()

[Section titled “getDomainAllowList()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#getdomainallowlist)

```
public String getDomainAllowList()
```

Returns the comma-separated list of allowed domains, if any.

Not returned by `Daytona#list`; call `#refreshData()` on each item to populate.

**Returns**:

- `String` \- allowed domains, or `null`

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#getvolumes) getVolumes()

[Section titled “getVolumes()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#getvolumes)

```
public List<SandboxVolume> getVolumes()
```

Returns volumes attached to the Sandbox.

Not returned by `Daytona#list`; call `#refreshData()` on each item to populate.

**Returns**:

- `List\<SandboxVolume\>` \- immutable list of attached volumes, or `null` if not yet populated

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#getbuildinfo) getBuildInfo()

[Section titled “getBuildInfo()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#getbuildinfo)

```
public BuildInfo getBuildInfo()
```

Returns build information if the Sandbox was created from a dynamic build.

Not returned by `Daytona#list`; call `#refreshData()` on each item to populate.

**Returns**:

- `BuildInfo` \- build info, or `null`

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#getbackupcreatedat) getBackupCreatedAt()

[Section titled “getBackupCreatedAt()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#getbackupcreatedat)

```
public String getBackupCreatedAt()
```

Returns the creation timestamp of the last backup.

Not returned by `Daytona#list`; call `#refreshData()` on each item to populate.

**Returns**:

- `String` \- backup timestamp, or `null`

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#getprocess) getProcess()

[Section titled “getProcess()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#getprocess)

```
public Process getProcess()
```

**Returns**:

- `Process` \- process operations facade.

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#getfs) getFs()

[Section titled “getFs()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#getfs)

```
public FileSystem getFs()
```

**Returns**:

- `FileSystem` \- file-system operations facade.

#### [\#](https://www.daytona.io/docs/en/java-sdk/sandbox/\#getgit) getGit()

[Section titled “getGit()”](https://www.daytona.io/docs/en/java-sdk/sandbox/#getgit)

```
public Git getGit()
```

**Returns**:

- `Git` \- Git operations facade.