---
url: "https://www.daytona.io/docs/en/guides/openclaw/openclaw-run-secure-sandbox/"
title: "Run OpenClaw in a Daytona Sandbox via CLI | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/guides/openclaw/openclaw-run-secure-sandbox/#_top)

# Run OpenClaw in a Daytona Sandbox via CLI

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/guides/openclaw/openclaw-run-secure-sandbox.md)Open

This guide walks you through setting up [OpenClaw](https://openclaw.ai/) inside a Daytona sandbox and configuring Telegram and WhatsApp channels.

Running OpenClaw in a Daytona sandbox keeps your AI assistant isolated from your local machine, provides a secure environment for code execution, and ensures your bot stays online 24/7 without tying up your personal computer.

### [\#](https://www.daytona.io/docs/en/guides/openclaw/openclaw-run-secure-sandbox/\#prerequisites) Prerequisites

[Section titled “Prerequisites”](https://www.daytona.io/docs/en/guides/openclaw/openclaw-run-secure-sandbox/#prerequisites)

- Daytona account and API key (Get it from [Daytona Dashboard](https://app.daytona.io/dashboard/keys))
- Local terminal (macOS, Linux, or Windows)

### [\#](https://www.daytona.io/docs/en/guides/openclaw/openclaw-run-secure-sandbox/\#install-the-daytona-cli) Install the Daytona CLI

[Section titled “Install the Daytona CLI”](https://www.daytona.io/docs/en/guides/openclaw/openclaw-run-secure-sandbox/#install-the-daytona-cli)

- [Mac/Linux](https://www.daytona.io/docs/en/guides/openclaw/openclaw-run-secure-sandbox/#tab-panel-495)
- [Windows](https://www.daytona.io/docs/en/guides/openclaw/openclaw-run-secure-sandbox/#tab-panel-496)

```
brew install daytonaio/cli/daytona
```

```
powershell -Command "irm https://get.daytona.io/windows | iex"
```

### [\#](https://www.daytona.io/docs/en/guides/openclaw/openclaw-run-secure-sandbox/\#authenticate-with-daytona) Authenticate with Daytona

[Section titled “Authenticate with Daytona”](https://www.daytona.io/docs/en/guides/openclaw/openclaw-run-secure-sandbox/#authenticate-with-daytona)

Log in to your Daytona account using your API key:

```
daytona login --api-key=YOUR_API_KEY
```

Replace `YOUR_API_KEY` with your actual Daytona API key.

### [\#](https://www.daytona.io/docs/en/guides/openclaw/openclaw-run-secure-sandbox/\#create-a-sandbox) Create a Sandbox

[Section titled “Create a Sandbox”](https://www.daytona.io/docs/en/guides/openclaw/openclaw-run-secure-sandbox/#create-a-sandbox)

Create a sandbox for running OpenClaw:

```
daytona sandbox create --name openclaw --snapshot daytona-medium --auto-stop 0
```

OpenClaw comes preinstalled in the default Daytona snapshot, so the command above is all you need.

### [\#](https://www.daytona.io/docs/en/guides/openclaw/openclaw-run-secure-sandbox/\#connect-to-the-sandbox) Connect to the Sandbox

[Section titled “Connect to the Sandbox”](https://www.daytona.io/docs/en/guides/openclaw/openclaw-run-secure-sandbox/#connect-to-the-sandbox)

SSH into your sandbox:

```
daytona ssh openclaw
```

### [\#](https://www.daytona.io/docs/en/guides/openclaw/openclaw-run-secure-sandbox/\#run-openclaw-onboarding) Run OpenClaw Onboarding

[Section titled “Run OpenClaw Onboarding”](https://www.daytona.io/docs/en/guides/openclaw/openclaw-run-secure-sandbox/#run-openclaw-onboarding)

Configure OpenClaw in one command. Run this inside the SSH session:

```
openclaw onboard --non-interactive --accept-risk \

  --anthropic-api-key YOUR_ANTHROPIC_KEY \

  --skip-daemon --skip-channels --skip-skills --skip-hooks --skip-health
```

- `--skip-daemon` matters here: Daytona sandboxes have no service manager, so you start the gateway manually below.
- Using a different provider? Swap the key flag (`--openai-api-key`, `--openrouter-api-key`, and so on). Run `openclaw onboard --help` for the full list.
- Channels, skills, and hooks are skipped now and configured later.

Onboarding configures a gateway auth token. Print it from the sandbox:

```
node -p "require(process.env.HOME + '/.openclaw/openclaw.json').gateway.auth.token"
```

Save this token - you’ll need it to connect to the dashboard.

### [\#](https://www.daytona.io/docs/en/guides/openclaw/openclaw-run-secure-sandbox/\#allow-dashboard-access-through-the-preview-url) Allow Dashboard Access Through the Preview URL

[Section titled “Allow Dashboard Access Through the Preview URL”](https://www.daytona.io/docs/en/guides/openclaw/openclaw-run-secure-sandbox/#allow-dashboard-access-through-the-preview-url)

The gateway accepts browser connections only from allowed origins, and Daytona’s preview proxy sits in front of it - configure both before starting the gateway.

In your local terminal (not inside the sandbox SSH session), get the preview URL for the gateway port:

```
daytona preview-url openclaw --port 18789
```

This generates a [signed preview URL](https://www.daytona.io/docs/en/preview/#signed-preview-url) that securely exposes the port. You will open it in the browser later.

Copy the URL it prints — for example `https://18789-r0enfyhje6plfaaj.daytonaproxy01.net`. You will open it in the browser later, and the gateway needs to know that exact origin.

Back in the sandbox SSH session, allow that origin and trust the in-sandbox preview proxy:

```
openclaw config set gateway.controlUi.allowedOrigins '["https://18789-r0enfyhje6plfaaj.daytonaproxy01.net"]'

openclaw config set gateway.trustedProxies '["127.0.0.1"]'
```

Replace the example URL with the one the CLI printed for your sandbox.

### [\#](https://www.daytona.io/docs/en/guides/openclaw/openclaw-run-secure-sandbox/\#start-the-gateway) Start the Gateway

[Section titled “Start the Gateway”](https://www.daytona.io/docs/en/guides/openclaw/openclaw-run-secure-sandbox/#start-the-gateway)

Run the gateway in the background:

```
nohup openclaw gateway run > /tmp/gateway.log 2>&1 &
```

The `&` runs the gateway as a background process, keeping your terminal free for other commands. The `nohup` ensures the gateway keeps running even after you close the SSH connection.

Verify it is up:

```
openclaw gateway health
```

The command reports the gateway status, so `OK` means you are good to continue.

### [\#](https://www.daytona.io/docs/en/guides/openclaw/openclaw-run-secure-sandbox/\#access-the-dashboard) Access the Dashboard

[Section titled “Access the Dashboard”](https://www.daytona.io/docs/en/guides/openclaw/openclaw-run-secure-sandbox/#access-the-dashboard)

The OpenClaw dashboard is a web interface for managing your assistant, monitoring connections, and configuring channels.

Open the [preview URL](https://www.daytona.io/docs/en/preview/) you generated earlier in your browser, and paste your gateway token when the Control UI prompts for it (the value you printed after onboarding).

### [\#](https://www.daytona.io/docs/en/guides/openclaw/openclaw-run-secure-sandbox/\#pair-your-browser) Pair Your Browser

[Section titled “Pair Your Browser”](https://www.daytona.io/docs/en/guides/openclaw/openclaw-run-secure-sandbox/#pair-your-browser)

OpenClaw uses device pairing as a security measure - only approved devices can connect to and control your assistant. When you first attempt to connect from the dashboard, your browser registers as a new device that needs approval.

List pending device requests:

```
openclaw devices list
```

Approve your device:

```
openclaw devices approve REQUEST_ID
```

Replace `REQUEST_ID` with the value from the **Request** column.

The dashboard shows a **Device pairing required** screen until you approve; it reconnects automatically after the approval completes.

Once connected, you should see a green status indicator - your OpenClaw is now ready to use.

### [\#](https://www.daytona.io/docs/en/guides/openclaw/openclaw-run-secure-sandbox/\#security) Security

[Section titled “Security”](https://www.daytona.io/docs/en/guides/openclaw/openclaw-run-secure-sandbox/#security)

Running OpenClaw this way provides three layers of security:

1. **Preview URL:** Time-limited access to the dashboard port
2. **Gateway token:** Required to authenticate with the dashboard
3. **Device approval:** Only approved devices can connect and control your assistant

Even if someone obtains your dashboard URL, they cannot connect without the gateway token and an approved device.

* * *

### [\#](https://www.daytona.io/docs/en/guides/openclaw/openclaw-run-secure-sandbox/\#configure-telegram) Configure Telegram

[Section titled “Configure Telegram”](https://www.daytona.io/docs/en/guides/openclaw/openclaw-run-secure-sandbox/#configure-telegram)

Set up a Telegram bot to chat with OpenClaw.

#### [\#](https://www.daytona.io/docs/en/guides/openclaw/openclaw-run-secure-sandbox/\#create-a-telegram-bot) Create a Telegram Bot

[Section titled “Create a Telegram Bot”](https://www.daytona.io/docs/en/guides/openclaw/openclaw-run-secure-sandbox/#create-a-telegram-bot)

1. Open Telegram and search for **@BotFather**
2. Send `/start`, then `/newbot`
3. Enter a name for your bot
4. Enter a username for your bot
5. Copy the bot token provided

#### [\#](https://www.daytona.io/docs/en/guides/openclaw/openclaw-run-secure-sandbox/\#configure-openclaw) Configure OpenClaw

[Section titled “Configure OpenClaw”](https://www.daytona.io/docs/en/guides/openclaw/openclaw-run-secure-sandbox/#configure-openclaw)

Enable Telegram and set your bot token:

```
openclaw config set channels.telegram.enabled true

openclaw config set channels.telegram.botToken YOUR_BOT_TOKEN
```

Verify the configuration:

```
openclaw config get channels.telegram
```

#### [\#](https://www.daytona.io/docs/en/guides/openclaw/openclaw-run-secure-sandbox/\#restart-the-gateway) Restart the Gateway

[Section titled “Restart the Gateway”](https://www.daytona.io/docs/en/guides/openclaw/openclaw-run-secure-sandbox/#restart-the-gateway)

```
pkill -f "openclaw gateway" || true

nohup openclaw gateway run > /tmp/gateway.log 2>&1 &
```

#### [\#](https://www.daytona.io/docs/en/guides/openclaw/openclaw-run-secure-sandbox/\#complete-verification) Complete Verification

[Section titled “Complete Verification”](https://www.daytona.io/docs/en/guides/openclaw/openclaw-run-secure-sandbox/#complete-verification)

1. Open your bot’s chat in Telegram and click **Start**
2. A pairing code will appear. List and approve the pairing request:

```
openclaw pairing list telegram

openclaw pairing approve telegram PAIRING_CODE
```

Pairing codes expire after 1 hour. You can now message your OpenClaw through Telegram.

* * *

### [\#](https://www.daytona.io/docs/en/guides/openclaw/openclaw-run-secure-sandbox/\#configure-whatsapp) Configure WhatsApp

[Section titled “Configure WhatsApp”](https://www.daytona.io/docs/en/guides/openclaw/openclaw-run-secure-sandbox/#configure-whatsapp)

Set up WhatsApp to chat with OpenClaw.

#### [\#](https://www.daytona.io/docs/en/guides/openclaw/openclaw-run-secure-sandbox/\#install-the-whatsapp-plugin) Install the WhatsApp plugin

[Section titled “Install the WhatsApp plugin”](https://www.daytona.io/docs/en/guides/openclaw/openclaw-run-secure-sandbox/#install-the-whatsapp-plugin)

Unlike Telegram, WhatsApp ships as a separate plugin, so install and enable it first:

```
openclaw plugins install clawhub:@openclaw/whatsapp --acknowledge-clawhub-risk

openclaw plugins enable whatsapp
```

`--acknowledge-clawhub-risk` accepts the ClawHub release trust prompt up front. Installing does not enable a plugin, so the `enable` step is required — without it the gateway reports that the channel is configured but the plugin is not trusted.

#### [\#](https://www.daytona.io/docs/en/guides/openclaw/openclaw-run-secure-sandbox/\#link-whatsapp-qr) Link WhatsApp (QR)

[Section titled “Link WhatsApp (QR)”](https://www.daytona.io/docs/en/guides/openclaw/openclaw-run-secure-sandbox/#link-whatsapp-qr)

From the sandbox SSH session, start the QR link flow:

```
openclaw channels login --channel whatsapp
```

Open WhatsApp on your phone, go to **Settings → Linked Devices → Link a Device**, and scan the QR code displayed in your terminal.

#### [\#](https://www.daytona.io/docs/en/guides/openclaw/openclaw-run-secure-sandbox/\#restart-the-gateway-1) Restart the Gateway

[Section titled “Restart the Gateway”](https://www.daytona.io/docs/en/guides/openclaw/openclaw-run-secure-sandbox/#restart-the-gateway-1)

```
pkill -f "openclaw gateway" || true

nohup openclaw gateway run > /tmp/gateway.log 2>&1 &
```

#### [\#](https://www.daytona.io/docs/en/guides/openclaw/openclaw-run-secure-sandbox/\#start-chatting) Start Chatting

[Section titled “Start Chatting”](https://www.daytona.io/docs/en/guides/openclaw/openclaw-run-secure-sandbox/#start-chatting)

Send a message to yourself in WhatsApp — OpenClaw replies in the same chat, and you can give it instructions directly there.

No pairing approval is needed here: with no allowlist configured, the linked account’s own number is allowed by default. Pairing applies to unknown senders, which is why Telegram needs it but messaging yourself on WhatsApp does not.

* * *

### [\#](https://www.daytona.io/docs/en/guides/openclaw/openclaw-run-secure-sandbox/\#update-openclaw) Update OpenClaw

[Section titled “Update OpenClaw”](https://www.daytona.io/docs/en/guides/openclaw/openclaw-run-secure-sandbox/#update-openclaw)

The snapshot’s global npm tree is owned by root, so plain `openclaw update` cannot write to it. Update from the sandbox SSH session with:

```
sudo env "PATH=$PATH" npm install --global openclaw@latest

openclaw doctor
```

`openclaw doctor` migrates any older config after the update. Then restart the gateway (`pkill` \+ `nohup` as above).