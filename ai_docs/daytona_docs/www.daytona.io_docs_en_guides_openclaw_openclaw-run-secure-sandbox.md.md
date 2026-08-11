---
url: "https://www.daytona.io/docs/en/guides/openclaw/openclaw-run-secure-sandbox.md"
title: undefined
---

\# Run OpenClaw in a Daytona Sandbox via CLI

This guide walks you through setting up \[OpenClaw\](https://openclaw.ai/) inside a Daytona sandbox and configuring Telegram and WhatsApp channels.

Running OpenClaw in a Daytona sandbox keeps your AI assistant isolated from your local machine, provides a secure environment for code execution, and ensures your bot stays online 24/7 without tying up your personal computer.

\### Prerequisites

\- Daytona account and API key (Get it from \[Daytona Dashboard\](https://app.daytona.io/dashboard/keys))
\- Local terminal (macOS, Linux, or Windows)

\### Install the Daytona CLI

 \`\`\`bash
 brew install daytonaio/cli/daytona
 \`\`\`
 \`\`\`bash
 powershell -Command "irm https://get.daytona.io/windows \| iex"
 \`\`\`

:::note
Already have the CLI? Check your version with \`daytona --version\` and keep it current — older versions miss newer sandbox commands. \[Upgrade to the latest version\](https://www.daytona.io/docs/en/tools/cli.md).
:::

\### Authenticate with Daytona

Log in to your Daytona account using your API key:

\`\`\`bash
daytona login --api-key=YOUR\_API\_KEY
\`\`\`

Replace \`YOUR\_API\_KEY\` with your actual Daytona API key.

\### Create a Sandbox

Create a sandbox for running OpenClaw:

\`\`\`bash
daytona sandbox create --name openclaw --snapshot daytona-medium --auto-stop 0
\`\`\`

OpenClaw comes preinstalled in the default Daytona snapshot, so the command above is all you need.

:::note
The \`--auto-stop 0\` flag disables automatic shutdown, keeping OpenClaw accessible until you manually stop or delete the sandbox. Use the \`daytona-medium\` snapshot so the OpenClaw gateway has enough memory headroom; smaller classes may run out of memory.
:::

\### Connect to the Sandbox

SSH into your sandbox:

\`\`\`bash
daytona ssh openclaw
\`\`\`

\### Run OpenClaw Onboarding

Configure OpenClaw in one command. Run this inside the SSH session:

\`\`\`bash
openclaw onboard --non-interactive --accept-risk \
 --anthropic-api-key YOUR\_ANTHROPIC\_KEY \
 --skip-daemon --skip-channels --skip-skills --skip-hooks --skip-health
\`\`\`

\- \`--skip-daemon\` matters here: Daytona sandboxes have no service manager, so you start the gateway manually below.
\- Using a different provider? Swap the key flag (\`--openai-api-key\`, \`--openrouter-api-key\`, and so on). Run \`openclaw onboard --help\` for the full list.
\- Channels, skills, and hooks are skipped now and configured later.

:::note
Running \`openclaw onboard\` without flags starts a conversational setup assistant that configures OpenClaw through chat, and it requires an interactive terminal. \`openclaw onboard --classic\` runs the older step-by-step wizard instead.
:::

Onboarding configures a gateway auth token. Print it from the sandbox:

\`\`\`bash
node -p "require(process.env.HOME + '/.openclaw/openclaw.json').gateway.auth.token"
\`\`\`

Save this token - you'll need it to connect to the dashboard.

:::note
\`openclaw config get gateway.auth.token\` returns \`\_\_OPENCLAW\_REDACTED\_\_\` instead of the value, because the CLI masks secrets in its output. Read it from the config file as shown above.
:::

\### Allow Dashboard Access Through the Preview URL

The gateway accepts browser connections only from allowed origins, and Daytona's preview proxy sits in front of it - configure both before starting the gateway.

In your local terminal (not inside the sandbox SSH session), get the preview URL for the gateway port:

\`\`\`bash
daytona preview-url openclaw --port 18789
\`\`\`

This generates a \[signed preview URL\](https://www.daytona.io/docs/en/preview.md#signed-preview-url) that securely exposes the port. You will open it in the browser later.

Copy the URL it prints — for example \`https://18789-r0enfyhje6plfaaj.daytonaproxy01.net\`. You will open it in the browser later, and the gateway needs to know that exact origin.

Back in the sandbox SSH session, allow that origin and trust the in-sandbox preview proxy:

\`\`\`bash
openclaw config set gateway.controlUi.allowedOrigins '\["https://18789-r0enfyhje6plfaaj.daytonaproxy01.net"\]'
openclaw config set gateway.trustedProxies '\["127.0.0.1"\]'
\`\`\`

Replace the example URL with the one the CLI printed for your sandbox.

:::caution
Paste the URL exactly as the CLI printed it: scheme and host only, \*\*no trailing slash\*\* and no path. The gateway compares the browser's origin literally, and a browser sends \`https://host\` (no trailing slash) — so an entry like \`https://host/\` will silently fail to match and the connection is rejected. Note that browser address bars often display a trailing slash, so copy from the terminal rather than the address bar.
:::

\### Start the Gateway

Run the gateway in the background:

\`\`\`bash
nohup openclaw gateway run > /tmp/gateway.log 2>&1 &
\`\`\`

The \`&\` runs the gateway as a background process, keeping your terminal free for other commands. The \`nohup\` ensures the gateway keeps running even after you close the SSH connection.

Verify it is up:

\`\`\`bash
openclaw gateway health
\`\`\`

The command reports the gateway status, so \`OK\` means you are good to continue.

\### Access the Dashboard

The OpenClaw dashboard is a web interface for managing your assistant, monitoring connections, and configuring channels.

Open the \[preview URL\](https://www.daytona.io/docs/en/preview.md) you generated earlier in your browser, and paste your gateway token when the Control UI prompts for it (the value you printed after onboarding).

:::tip
The preview URL expires after 1 hour by default (customizable with \`--expires\` flag). When it expires, simply run the same CLI command to generate a new one.
:::

\### Pair Your Browser

OpenClaw uses device pairing as a security measure - only approved devices can connect to and control your assistant. When you first attempt to connect from the dashboard, your browser registers as a new device that needs approval.

List pending device requests:

\`\`\`bash
openclaw devices list
\`\`\`

Approve your device:

\`\`\`bash
openclaw devices approve REQUEST\_ID
\`\`\`

Replace \`REQUEST\_ID\` with the value from the \*\*Request\*\* column.

The dashboard shows a \*\*Device pairing required\*\* screen until you approve; it reconnects automatically after the approval completes.

Once connected, you should see a green status indicator - your OpenClaw is now ready to use.

\### Security

Running OpenClaw this way provides three layers of security:

1\. \*\*Preview URL:\*\* Time-limited access to the dashboard port
2\. \*\*Gateway token:\*\* Required to authenticate with the dashboard
3\. \*\*Device approval:\*\* Only approved devices can connect and control your assistant

Even if someone obtains your dashboard URL, they cannot connect without the gateway token and an approved device.

:::caution
Keep your gateway token and preview URL secret. Do not share them publicly.
:::

\-\-\-

\### Configure Telegram

Set up a Telegram bot to chat with OpenClaw.

\#### Create a Telegram Bot

1\. Open Telegram and search for \*\*@BotFather\*\*
2\. Send \`/start\`, then \`/newbot\`
3\. Enter a name for your bot
4\. Enter a username for your bot
5\. Copy the bot token provided

\#### Configure OpenClaw

Enable Telegram and set your bot token:

\`\`\`bash
openclaw config set channels.telegram.enabled true
openclaw config set channels.telegram.botToken YOUR\_BOT\_TOKEN
\`\`\`

Verify the configuration:

\`\`\`bash
openclaw config get channels.telegram
\`\`\`

\#### Restart the Gateway

\`\`\`bash
pkill -f "openclaw gateway" \|\| true
nohup openclaw gateway run > /tmp/gateway.log 2>&1 &
\`\`\`

:::note
\`openclaw gateway stop\` and \`openclaw gateway restart\` manage gateways installed as a system service. This setup runs the gateway as a plain background process, so stop it with \`pkill\` and start it again with \`nohup\`.
:::

\#### Complete Verification

1\. Open your bot's chat in Telegram and click \*\*Start\*\*
2\. A pairing code will appear. List and approve the pairing request:

\`\`\`bash
openclaw pairing list telegram
openclaw pairing approve telegram PAIRING\_CODE
\`\`\`

Pairing codes expire after 1 hour. You can now message your OpenClaw through Telegram.

\-\-\-

\### Configure WhatsApp

Set up WhatsApp to chat with OpenClaw.

\#### Install the WhatsApp plugin

Unlike Telegram, WhatsApp ships as a separate plugin, so install and enable it first:

\`\`\`bash
openclaw plugins install clawhub:@openclaw/whatsapp --acknowledge-clawhub-risk
openclaw plugins enable whatsapp
\`\`\`

\`--acknowledge-clawhub-risk\` accepts the ClawHub release trust prompt up front. Installing does not enable a plugin, so the \`enable\` step is required — without it the gateway reports that the channel is configured but the plugin is not trusted.

:::note
If you run the login command below before installing, OpenClaw prompts you with \*\*Install WhatsApp plugin?\*\* and offers ClawHub or npm. Choosing \*\*Download from ClawHub\*\* is equivalent to the first command above, but you still need \`openclaw plugins enable whatsapp\` afterwards.
:::

\#### Link WhatsApp (QR)

From the sandbox SSH session, start the QR link flow:

\`\`\`bash
openclaw channels login --channel whatsapp
\`\`\`

Open WhatsApp on your phone, go to \*\*Settings → Linked Devices → Link a Device\*\*, and scan the QR code displayed in your terminal.

\#### Restart the Gateway

\`\`\`bash
pkill -f "openclaw gateway" \|\| true
nohup openclaw gateway run > /tmp/gateway.log 2>&1 &
\`\`\`

\#### Start Chatting

Send a message to yourself in WhatsApp — OpenClaw replies in the same chat, and you can give it instructions directly there.

No pairing approval is needed here: with no allowlist configured, the linked account's own number is allowed by default. Pairing applies to unknown senders, which is why Telegram needs it but messaging yourself on WhatsApp does not.

:::tip
To allow other users to chat with OpenClaw, add their phone numbers to the WhatsApp allowlist (\`channels.whatsapp.allowFrom\`), for example \`openclaw config set channels.whatsapp.allowFrom '\["+15551234567"\]'\`. For allowlists, personal-number mode, and self-chat details, see the \[OpenClaw WhatsApp docs\](https://docs.openclaw.ai/channels/whatsapp).
:::

\-\-\-

\### Update OpenClaw

The snapshot's global npm tree is owned by root, so plain \`openclaw update\` cannot write to it. Update from the sandbox SSH session with:

\`\`\`bash
sudo env "PATH=$PATH" npm install --global openclaw@latest
openclaw doctor
\`\`\`

\`openclaw doctor\` migrates any older config after the update. Then restart the gateway (\`pkill\` + \`nohup\` as above).