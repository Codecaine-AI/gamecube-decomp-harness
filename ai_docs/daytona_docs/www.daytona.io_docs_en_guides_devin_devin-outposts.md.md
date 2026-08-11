---
url: "https://www.daytona.io/docs/en/guides/devin/devin-outposts.md"
title: undefined
---

\# Run Devin Outposts on Daytona

Set up Devin Outposts so that every Devin session in your org does its work inside a Daytona sandbox you own.

\### Devin sessions

A Devin session is one task handed to Devin: fix this bug, upgrade this dependency, chase down this flaky test. You open the session from the Devin app or from Slack, describe the task, and Devin works on it while you follow its progress, answer questions, and course-correct.

A session runs across two components. The agent loop handles planning, model calls, tool selection, and the conversation you see, and it runs on Cognition's side in every deployment model. The session machine is an environment with a shell, an editor, a browser, and Devin's tooling installed; every tool call the agent loop issues executes there. In a standard session Cognition hosts the machine as well.

\### What Outposts changes

Outposts puts the session machine on compute you choose. You register an outpost with Cognition, and sessions created on that outpost are served by machines you operate. The agent loop stays hosted by Cognition, the session in the Devin app looks and behaves the same, and nobody creating sessions has to know anything changed. What moves is execution: shell commands, checked-out repositories, and browser automation now run on your infrastructure.

In this setup the machines are Daytona sandboxes. Each session gets its own, created on demand from a snapshot you define, stopped while the session sleeps, and deleted when the session ends.

\### Three pieces

\- Cognition hosts the Devin API, the agent loop, the outpost gateway, and a queue per outpost of sessions waiting for a machine.
\- An orchestrator, which you run, watches that queue, claims sessions for your outpost, and manages one sandbox per session.
\- Daytona hosts the sandboxes.

The flow for a new session: someone picks your outpost when creating it, the session lands in the outpost's queue, and the orchestrator claims it. The orchestrator creates a sandbox from your snapshot and launches Cognition's \`devin-remote\` binary inside: the sandbox downloads the exact build pinned for the session, verifies its checksum, and starts it, and the remote establishes an outbound WebSocket connection to the outpost gateway. All traffic between the agent loop and the machine flows through that tunnel, so a sandbox needs outbound HTTPS and nothing more. No inbound connectivity is required.

From there, session state drives sandbox state:

\- Active session: the sandbox runs and the worker serves it.
\- Session sleeps: the orchestrator releases its claim and stops the sandbox. The filesystem stays.
\- Session wakes: the orchestrator claims it again and starts the same sandbox. Repositories, branches, and half-finished work are where Devin left them.
\- Session terminated: the sandbox is deleted.

\### Set up

\#### Get the code

The orchestrator, the queue client, and the snapshot builders are published as a reference implementation in the Daytona guides repo under \[\`python/cognition/devin-outposts/\`\](https://github.com/daytona/guides/tree/main/python/cognition/devin-outposts). Clone it and install:

\`\`\`bash
git clone https://github.com/daytona/guides.git
cd guides/python/cognition/devin-outposts

python3.12 -m venv .venv
source .venv/bin/activate

pip install -e .
cp .env.example .env
\`\`\`

You will fill in the remaining Daytona settings in \`.env\` after connecting
Devin.

\#### Connect Devin

Run the connection command on the same machine as your browser:

\`\`\`bash
outposts-connect --platform linux
\`\`\`

The command opens Devin's connection page. A Devin organization administrator
with permission to manage enterprise settings and service users confirms the
outpost and clicks \*\*Connect\*\*. The browser returns a one-time code to a temporary
listener on \`http://localhost:8765/callback\`; \`outposts-connect\` exchanges it
with Devin and writes \`DEVIN\_OUTPOSTS\_TOKEN\`, \`DEVIN\_API\_URL\`, and \`OUTPOST\_ID\` to
this project's \`.env\`. The listener exits when the attempt finishes, and the
machine token never passes through the browser.

For a Windows outpost, the flow is identical:

\`\`\`bash
outposts-connect --platform windows
\`\`\`

To serve Linux and Windows outposts at the same time, run one orchestrator per
outpost, each from its own checkout with its own \`.env\`.

The command and browser must run on the same machine because the callback uses
\`localhost\`. For a headless or remote orchestrator host, run the connection on a
workstation and transfer \`.env\` securely, or use manual setup.

The connection creates an outpost and a service user with a machine-serving token.
The outpost appears in Devin under Settings and in the environment picker whenever
someone in your org creates a session.

\##### Manual setup

If the connection flow is unavailable, install the Devin CLI and use separate
tokens for outpost creation and machine serving:

\| Token \| Scope \| Used for \|
\| \-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\- \| \-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\- \| \-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\- \|
\| Outpost-create token \| \`account.outposts.orchestrator\` \| One-time outpost creation with \`devin worker outpost create\`. Remove it from your shell after the outpost exists. \|
\| \`DEVIN\_OUTPOSTS\_TOKEN\` \| \`account.outposts.machine\` \| Queue list, watch, claim, and release. Sandboxes never receive this token; each remote gets its claim's connect token. \|

\`\`\`bash
export DEVIN\_API\_URL="https://api.devin.ai"
export DEVIN\_OUTPOST\_CREATE\_TOKEN="replace-with-outpost-create-token"

devin worker outpost create daytona-linux \
 --platform linux \
 --description "Daytona Linux sandboxes for Devin Outposts" \
 --api-url "$DEVIN\_API\_URL" \
 --token "$DEVIN\_OUTPOST\_CREATE\_TOKEN"
\`\`\`

For Windows sandboxes, create a separate outpost with \`--platform windows\`. Each
outpost serves one platform and runs under its own orchestrator process.

Set \`DEVIN\_API\_URL\` to the API base only, for example
\`https://api.devin.ai\`; the queue client appends its own path segments. Copy the
returned outpost ID into \`OUTPOST\_ID\` in \`.env\`, and set \`DEVIN\_OUTPOSTS\_TOKEN\` to the
machine-serving token.

\#### Build the sandbox snapshot

Sandboxes are created from a snapshot, so build that next. You need a Daytona \[API key\](https://app.daytona.io/dashboard/keys) that can create snapshots and manage sandboxes; put it in \`DAYTONA\_API\_KEY\` in \`.env\`.

\`devin\_outposts/Dockerfile.default\` defines what every Linux session machine starts with. It builds on Daytona's standard sandbox image, which already carries Chromium and ffmpeg for Devin's browser and screen tooling, and it adds the GitHub CLI and the directories the Devin remote expects. Build and publish it with:

\`\`\`bash
set -a
. ./.env
set +a

build-devin-outposts-snapshot
\`\`\`

Snapshot names are derived from the Dockerfile contents, \`devin-outposts-default-\`, which makes the script safe to rerun: with an unchanged Dockerfile it finds the existing snapshot and stops. When sessions need extra runtimes or internal tools, add them to \`devin\_outposts/Dockerfile.default\` and run the build again. Either way, copy the printed snapshot name into \`SNAPSHOT\_NAME\` in \`.env\`.

The snapshot allocates 2 vCPU, 8 GiB of memory, and 10 GiB of disk to every sandbox created from it, and each concurrently served session runs one sandbox. If sandbox creation fails with a quota error, check your organization's \[tier limits\](https://www.daytona.io/docs/en/limits.md) and lower \`MAX\_CONCURRENT\_SESSIONS\` or the resource values in the builder.

Windows outposts use their own snapshot builder, \`build-devin-outposts-windows-snapshot\`; see the reference implementation's README for the Windows setup.

\### Run the orchestrator

With \`DEVIN\_OUTPOSTS\_TOKEN\`, \`DEVIN\_API\_URL\`, \`DAYTONA\_API\_KEY\`, \`OUTPOST\_ID\`, and \`SNAPSHOT\_NAME\` filled in, start it:

\`\`\`bash
set -a
. ./.env
set +a

devin-outposts-orchestrator
\`\`\`

Create a Devin session and pick your outpost in the environment picker. For each session it claims, the orchestrator will:

1\. Take the queue entry under its acceptor ID, so no other orchestrator instance grabs the same session.
2\. Create a sandbox named \`devin-\` from \`SNAPSHOT\_NAME\`, or restart the existing one when the session is waking from sleep.
3\. Clone any repositories listed in \`REPOS\` into the directory Devin expects, so its repository tooling finds them immediately.
4\. Download and checksum-verify the session's pinned \`devin-remote\` binary in the sandbox, launch it, then supervise both the remote process and the queue entry.
5\. Release the claim and stop the sandbox when the session sleeps; delete the sandbox when the session terminates.

A janitor loop runs alongside. It selects sandboxes in your workspace by their \`devin.outpost\_id\` label and removes any whose session no longer exists, so a crashed run cannot leak sandboxes.

The orchestrator itself runs anywhere with outbound HTTPS: a laptop, a VM, a container. Its state, the queue cursor and generated acceptor ID, lives in \`STATE\_DIR\` and survives restarts. Restarting mid-session is safe; on startup it re-attaches to every queue entry claimed under its acceptor ID.

\#### Configuration

\| Variable \| Required \| Notes \|
\| \-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\- \| \-\-\-\-\-\-\-: \| \-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\- \|
\| \`DEVIN\_OUTPOSTS\_TOKEN\` \| Yes \| Service-user key with the \`account.outposts.machine\` scope, written by \`outposts-connect\` or supplied during manual setup. Sent as a bearer token to the queue API. Sandboxes never receive it; each remote gets only its claim's connect token. \|
\| \`DEVIN\_API\_URL\` \| Yes \| Devin API base, for example \`https://api.devin.ai\`. \|
\| \`DAYTONA\_API\_KEY\` \| Yes \| Used by the Daytona SDK for snapshot creation and sandbox lifecycle calls. \|
\| \`OUTPOST\_ID\` \| Yes \| The outpost ID written by \`outposts-connect\` or returned by manual outpost creation. Run one orchestrator process per outpost. \|
\| \`SNAPSHOT\_NAME\` \| Yes \| Snapshot used to create serving sandboxes. \|
\| \`MAX\_CONCURRENT\_SESSIONS\` \| No \| Default \`5\`. The orchestrator does not claim more sessions than this at once. \|
\| \`ACCEPTOR\_ID\` \| No \| Leave blank for a generated ID that persists in \`STATE\_DIR\`. Do not share one acceptor ID across instances. \|
\| \`STATE\_DIR\` \| No \| Stores the watch cursor and generated acceptor ID. Default is \`~/.devin-outposts-orchestrator\`. \|
\| \`WORKDIR\` \| No \| Linux sandbox working directory for repository clones and the remote launch. Default is \`/home/daytona/workspace\`. \|
\| \`REPOS\` \| No \| Comma-separated clone URLs to pre-clone into each sandbox. \|
\| \`GIT\_USERNAME\` \| No \| Optional username for private repositories in \`REPOS\`. \|
\| \`GIT\_TOKEN\` \| No \| Optional token for private repositories in \`REPOS\`. Keep it local. \|
\| \`DEVIN\_CHROME\_PATH\` \| No \| Browser path inside Linux sandboxes. Default is \`/usr/bin/chromium\`. \|
\| \`WINDOWS\_WORKDIR\` \| No \| Windows outposts only: sandbox working directory. Default is \`C:\\repos\`. \|
\| \`DEVIN\_WINDOWS\_CHROME\_PATH\` \| No \| Windows outposts only: browser path inside the sandbox. Default is \`C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe\`. \|

\#### Repositories

Use \`REPOS\` when Devin should find repositories already checked out at the start of a session:

\`\`\`bash
REPOS=https://github.com/example/private-app.git,https://github.com/example/shared-lib.git
GIT\_USERNAME=replace-with-git-username
GIT\_TOKEN=replace-with-git-token
\`\`\`

The orchestrator clones these with \`sandbox.git.clone()\` before the worker starts. On resume, existing clones are left untouched, so branches and uncommitted changes survive sleep. Treat \`GIT\_TOKEN\` like any other secret and keep it in your local environment only.

\### What this buys you

\- Sleeping sessions are cheap. A session that sleeps costs you a stopped sandbox rather than a running machine, and it wakes with its filesystem intact.
\- Sessions cannot see each other. Each one works in its own sandbox, and termination deletes the whole machine.
\- You can look inside while Devin works. The sandbox appears in your Daytona dashboard under the session's name; exec into it, follow Devin's browser through the sandbox VNC view, or attach the observability you already use.
\- The machine image is under your control. Whatever you bake into the snapshot, every session starts with.

\### Further reading

\- \[Devin documentation\](https://docs.devin.ai)
\- \[Devin Outposts partner integrations\](https://docs.devin.ai/cloud/outposts/partners)
\- \[Devin enterprise deployment overview\](https://docs.devin.ai/enterprise/deployment/overview)
\- \[Run the Devin CLI in a Daytona sandbox\](https://www.daytona.io/docs/en/guides/devin/devin-cli-run-tasks-stream-logs-sandbox.md)
\- \[Daytona documentation\](https://www.daytona.io/docs/index.md)