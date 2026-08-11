---
url: "https://www.daytona.io/docs/en/guides/openclaw/openclaw-sdk-sandbox/"
title: "Run OpenClaw in a Daytona Sandbox via SDK | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/guides/openclaw/openclaw-sdk-sandbox/#_top)

# Run OpenClaw in a Daytona Sandbox via SDK

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/guides/openclaw/openclaw-sdk-sandbox.md)Open

This guide shows how to run [OpenClaw](https://openclaw.ai/) inside a Daytona sandbox using the Daytona SDK. The script automatically creates and configures a sandbox with OpenClaw and provides an authenticated [preview URL](https://www.daytona.io/docs/en/preview/) for using OpenClaw in the browser.

* * *

### [\#](https://www.daytona.io/docs/en/guides/openclaw/openclaw-sdk-sandbox/\#1-workflow-overview) 1\. Workflow Overview

[Section titled “1. Workflow Overview”](https://www.daytona.io/docs/en/guides/openclaw/openclaw-sdk-sandbox/#1-workflow-overview)

When you run the script, it creates a Daytona sandbox, starts the OpenClaw gateway inside it, and prints a preview link for the dashboard:

```
$ npm start

Creating Daytona sandbox...

Configuring OpenClaw...

Starting OpenClaw...

(Ctrl+C to stop the script; the sandbox keeps running)

🔗 Secret link to Control UI: https://18790-xxxx.proxy.daytona.works#token=...

The sandbox is private - open the link while signed in to Daytona.

OpenClaw is ready.
```

Open the provided link in your browser to connect to the OpenClaw Control UI. The sandbox is private, so open it while signed in to Daytona; the preview URL returns `401` otherwise. The link carries the gateway token as a URL fragment (the Control UI consumes it and strips it from the address bar), and your browser pairs silently on the first attempt — no device-approval prompt.

Two layers therefore guard the dashboard: Daytona authentication on the preview URL, and the gateway token in the link. Still treat the link as a secret.

You can use the Control UI to chat with your assistant, configure Telegram and WhatsApp, and manage sessions. When you exit the script (Ctrl+C), the sandbox will not be deleted unless [sandbox persistence is disabled](https://www.daytona.io/docs/en/guides/openclaw/openclaw-sdk-sandbox#4-key-constants).

### [\#](https://www.daytona.io/docs/en/guides/openclaw/openclaw-sdk-sandbox/\#2-project-setup) 2\. Project Setup

[Section titled “2. Project Setup”](https://www.daytona.io/docs/en/guides/openclaw/openclaw-sdk-sandbox/#2-project-setup)

#### [\#](https://www.daytona.io/docs/en/guides/openclaw/openclaw-sdk-sandbox/\#clone-the-repository) Clone the Repository

[Section titled “Clone the Repository”](https://www.daytona.io/docs/en/guides/openclaw/openclaw-sdk-sandbox/#clone-the-repository)

Clone the Daytona [repository](https://github.com/daytona/guides) and go to the example directory:

```
git clone https://github.com/daytona/guides.git

cd guides/typescript/openclaw
```

#### [\#](https://www.daytona.io/docs/en/guides/openclaw/openclaw-sdk-sandbox/\#configure-environment) Configure Environment

[Section titled “Configure Environment”](https://www.daytona.io/docs/en/guides/openclaw/openclaw-sdk-sandbox/#configure-environment)

Get your API key from the [Daytona Dashboard](https://app.daytona.io/dashboard/keys).

Copy `.env.example` to `.env` and add your Daytona API key:

```
DAYTONA_API_KEY=your_daytona_key
```

A default OpenClaw configuration is stored in `openclaw.json`. You can customize it according to the [configuration reference](https://docs.openclaw.ai/gateway/configuration-reference). You can also add additional environment variables to `.env.sandbox` (e.g. `ANTHROPIC_API_KEY` for Claude) and they will be loaded into the sandbox.

#### [\#](https://www.daytona.io/docs/en/guides/openclaw/openclaw-sdk-sandbox/\#alternative-inject-the-key-as-a-daytona-secret) Alternative: Inject the Key as a Daytona Secret

[Section titled “Alternative: Inject the Key as a Daytona Secret”](https://www.daytona.io/docs/en/guides/openclaw/openclaw-sdk-sandbox/#alternative-inject-the-key-as-a-daytona-secret)

The default setup loads everything in `.env.sandbox` \- including `ANTHROPIC_API_KEY` \- into the sandbox as plain environment variables, so anything running inside the sandbox (OpenClaw, its agents, any code they run) can read the raw key with `env`. [Daytona Secrets](https://www.daytona.io/docs/en/secrets) keep the raw value out of the sandbox entirely: the environment variable holds only an opaque placeholder (`dtn_secret_<id>`), and Daytona’s outbound proxy substitutes the real value into HTTPS request headers at egress - and only for requests to the hosts the Secret allows. An agent that dumps the environment or exfiltrates it never sees a usable key.

The Secret-based flow needs `@daytona/sdk` 0.192.0 or newer and a one-time Secret setup:

1. Create the Secret once for your organization - in the [Daytona Dashboard](https://app.daytona.io/dashboard/secrets) or with a one-off script (save as `create-secret.ts` in the project directory and run `npx tsx create-secret.ts`):



```
import { Daytona } from '@daytona/sdk'

import * as dotenv from 'dotenv'

import { readFileSync } from 'node:fs'




dotenv.config() // DAYTONA_API_KEY from .env




async function main() {

     const sandboxEnv = dotenv.parse(readFileSync('.env.sandbox', 'utf8'))

     if (!sandboxEnv.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set in .env.sandbox')




     const daytona = new Daytona()

     await daytona.secret.create({

       name: 'anthropic-api-key',

       value: sandboxEnv.ANTHROPIC_API_KEY,

       hosts: ['api.anthropic.com'], // the only host the real key may be sent to

     })

}




main()
```

2. In `src/index.ts`, add a `secrets:` mapping (environment variable name to Secret name) to the sandbox creation, and delete the `ANTHROPIC_API_KEY` line from `.env.sandbox` so the raw key is no longer injected. Any other variables in `.env.sandbox` keep flowing into the sandbox through `envVars` as before:



```
const sandbox = await daytona.create({

     snapshot: DAYTONA_SNAPSHOT,

     autoStopInterval: 0,

     envVars: readEnvFile(ENV_SANDBOX_PATH),

     secrets: {

       ANTHROPIC_API_KEY: 'anthropic-api-key',

     },

     public: MAKE_PUBLIC,

})
```


Inside the sandbox, `env` now shows `ANTHROPIC_API_KEY=dtn_secret_...`, yet OpenClaw still authenticates: the key is sent as the `x-api-key` HTTPS request header to `api.anthropic.com`, where the proxy swaps in the real value. Substitution happens only in HTTPS request headers toward allowed hosts - requests to any other host carry the harmless placeholder. If you configure additional providers in `.env.sandbox`, create one Secret per key with that provider’s API host. See the [Secrets documentation](https://www.daytona.io/docs/en/secrets#substitution-scope) for the full substitution scope.

#### [\#](https://www.daytona.io/docs/en/guides/openclaw/openclaw-sdk-sandbox/\#run-the-example) Run the Example

[Section titled “Run the Example”](https://www.daytona.io/docs/en/guides/openclaw/openclaw-sdk-sandbox/#run-the-example)

Install dependencies and run:

```
npm install

npm start
```

The script creates the sandbox, starts the OpenClaw gateway, and prints a secret link with the token in the URL.

### [\#](https://www.daytona.io/docs/en/guides/openclaw/openclaw-sdk-sandbox/\#3-how-it-works) 3\. How It Works

[Section titled “3. How It Works”](https://www.daytona.io/docs/en/guides/openclaw/openclaw-sdk-sandbox/#3-how-it-works)

1. The script creates a [Daytona sandbox](https://www.daytona.io/docs/en/sandboxes) with `DAYTONA_SNAPSHOT` (e.g. `daytona-medium`) and loads env vars from `.env.sandbox`. The sandbox is private unless you set `MAKE_PUBLIC`.
2. A [preview link](https://www.daytona.io/docs/en/preview/) for `LOCAL_PROXY_PORT` is resolved first, because its origin has to be allowlisted in the gateway config before the gateway starts.
3. Your local `openclaw.json` is merged with built-in config — the generated gateway auth token and that preview origin as `gateway.controlUi.allowedOrigins` — and written to `~/.openclaw/openclaw.json` in the sandbox. The gateway binds loopback only, so nothing in the sandbox is reachable from outside except through the proxy below.
4. The OpenClaw gateway is started on `OPENCLAW_PORT` via [process execution](https://www.daytona.io/docs/en/process-code-execution), and the script waits until it responds (retrying the start if needed).
5. `src/local-pairing-proxy.cjs` is uploaded and started on `LOCAL_PROXY_PORT`. OpenClaw pairs every new browser as a device before it can use the Control UI, but it silently auto-approves pairing for clean local (loopback) connections once token auth succeeds. Daytona’s preview proxy adds forwarding headers that make browsers look remote, so this proxy strips them before forwarding to the gateway — your browser is treated as a local client and pairs instantly, with no approval prompt.
6. The preview link is printed with the gateway token appended as a `#token=...` URL fragment.
7. On Ctrl+C, the sandbox is deleted unless `PERSIST_SANDBOX` is `true` (the default), in which case it keeps running.

### [\#](https://www.daytona.io/docs/en/guides/openclaw/openclaw-sdk-sandbox/\#4-key-constants) 4\. Key Constants

[Section titled “4. Key Constants”](https://www.daytona.io/docs/en/guides/openclaw/openclaw-sdk-sandbox/#4-key-constants)

You can change behavior by editing the constants in [`src/index.ts`](https://github.com/daytona/guides/blob/main/typescript/openclaw/src/index.ts):

| Constant | Default | Description |
| --- | --- | --- |
| `PERSIST_SANDBOX` | true | When true, the sandbox is not deleted when the script exits |
| `MAKE_PUBLIC` | false | When false the sandbox stays private and the preview URL requires Daytona authentication |
| `OPENCLAW_PORT` | 18789 | OpenClaw Gateway and Control UI port |
| `SHOW_LOGS` | true | Stream OpenClaw stdout/stderr to the terminal |
| `LOCAL_PROXY_PORT` | 18790 | In-sandbox pairing proxy port; the preview link targets it |
| `DAYTONA_SNAPSHOT` | daytona-medium | Sandbox snapshot with OpenClaw preinstalled |

**Key advantages:**

- Secure, isolated execution in a Daytona sandbox
- Two-layer access: Daytona authentication on the private preview URL plus the gateway token
- No pairing prompts — browsers arriving via the preview link pair silently as local clients (token auth still required)
- Control UI and channels accessible via the secret preview link
- Optional: keep the sandbox running after exit (`PERSIST_SANDBOX`)