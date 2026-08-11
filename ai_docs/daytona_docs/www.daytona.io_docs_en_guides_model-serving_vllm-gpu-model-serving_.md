---
url: "https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/"
title: "Serve LLMs on GPU Sandboxes with vLLM | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/#_top)

# Serve LLMs on GPU Sandboxes with vLLM

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving.md)Open

This guide demonstrates how to serve an open-weights model on a Daytona [GPU sandbox](https://www.daytona.io/docs/en/sandboxes#gpu-sandboxes) with [vLLM](https://docs.vllm.ai/en/stable/) and query it from anywhere through a token-authenticated preview URL.

The serving side is a single script: it creates the sandbox, starts vLLM inside it, and prints the endpoint and its access token once the server is healthy. The endpoint is OpenAI-compatible, so existing clients work without modification; the guide shows examples querying it with curl, the OpenAI SDK, and LiteLLM. The model served is `google/gemma-4-26B-A4B-it`, but any model vLLM can serve works the same way.

* * *

### [\#](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/\#1-workflow-overview) 1\. Workflow Overview

[Section titled “1. Workflow Overview”](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/#1-workflow-overview)

Four steps take you from an API key to a live endpoint:

1. **Create**: Spin up a GPU sandbox from the stock `vllm/vllm-openai` image, no custom image build needed
2. **Serve**: Start `vllm serve` as a background session command inside the sandbox
3. **Wait**: Poll the server’s `/health` endpoint through the preview URL while streaming the startup logs to your terminal
4. **Hand off**: Print paste-ready `export ENDPOINT=...` and `export TOKEN=...` lines

All four are handled by a single script, `serve_vllm.py`; once it finishes, the sandbox keeps serving until you delete it. Three small clients show the endpoint in action: `query.sh` (curl), `query_openai.py` (OpenAI SDK with chat, streaming, and tool calling), and `query_litellm.py` (LiteLLM).

### [\#](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/\#2-setup) 2\. Setup

[Section titled “2. Setup”](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/#2-setup)

#### [\#](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/\#clone-the-repository) Clone the Repository

[Section titled “Clone the Repository”](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/#clone-the-repository)

Clone the [Daytona repository](https://github.com/daytona/guides.git) and navigate to the example directory:

```
git clone https://github.com/daytona/guides.git

cd guides/python/model-serving/vllm
```

#### [\#](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/\#create-virtual-environment) Create Virtual Environment

[Section titled “Create Virtual Environment”](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/#create-virtual-environment)

```
python3 -m venv venv

source venv/bin/activate
```

#### [\#](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/\#install-dependencies) Install Dependencies

[Section titled “Install Dependencies”](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/#install-dependencies)

```
pip install -e .
```

This installs the `daytona` SDK along with the `openai` and `litellm` clients used by the query examples.

#### [\#](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/\#configure-environment) Configure Environment

[Section titled “Configure Environment”](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/#configure-environment)

Get your Daytona API key from the [Daytona Dashboard](https://app.daytona.io/dashboard/keys) and set it in a `.env` file:

```
cp .env.example .env

# edit .env with your API key
```

The `.env.example` also has an optional `HF_TOKEN` entry. It is only required for gated Hugging Face models, though Hugging Face recommends a token for faster, less throttled downloads in general.

#### [\#](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/\#alternative-inject-the-token-as-a-daytona-secret) Alternative: Inject the Token as a Daytona Secret

[Section titled “Alternative: Inject the Token as a Daytona Secret”](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/#alternative-inject-the-token-as-a-daytona-secret)

If you use an `HF_TOKEN` at all, the default setup passes it into the sandbox as a plain environment variable, so anything running inside the sandbox can read the raw token with `env`. [Daytona Secrets](https://www.daytona.io/docs/en/secrets) keep the raw value out of the sandbox entirely: the environment variable holds only an opaque placeholder (`dtn_secret_<id>`), and Daytona’s outbound proxy substitutes the real value into HTTPS request headers at egress - and only for requests to the hosts the Secret allows. Code that dumps the environment or exfiltrates it never sees a usable token.

The Secret-based flow needs `daytona` 0.192.0 or newer and a one-time Secret setup:

1. Create the Secret once for your organization - in the [Daytona Dashboard](https://app.daytona.io/dashboard/secrets) or with a one-off script (save as `create_secret.py` next to this guide’s `.env` and run `python create_secret.py`):



```
import os




from dotenv import load_dotenv




from daytona import CreateSecretParams, Daytona




load_dotenv()




daytona = Daytona()

daytona.secret.create(CreateSecretParams(

       name="hf-token",

       value=os.environ["HF_TOKEN"],

       hosts=["huggingface.co"],  # the only host the real token may be sent to

))
```

2. In `serve_vllm.py`, swap the `HF_TOKEN` env var for a `secrets` mapping (environment variable name to Secret name):



```
env_vars = {"HF_TOKEN": os.environ["HF_TOKEN"]} if os.environ.get("HF_TOKEN") else {}

print(f"creating GPU sandbox from {VLLM_IMAGE} ...", flush=True)

sb = daytona.create(

       CreateSandboxFromImageParams(

           image=Image.base(VLLM_IMAGE),

           resources=Resources(

               gpu=1,

               gpu_type=[GpuType.H100, GpuType.RTX_PRO_6000],  # preference order

           ),

           auto_stop_interval=0,

           ephemeral=True,

           env_vars=env_vars,

           secrets={"HF_TOKEN": "hf-token"},

       ),

       timeout=600,

)
```


Inside the sandbox, `env` shows `HF_TOKEN=dtn_secret_...`, yet Hugging Face downloads still authenticate: `huggingface_hub` sends the token as an HTTPS `Authorization` header to `huggingface.co`, where the proxy swaps in the real value. The allowlist stays that small on purpose: `huggingface.co` only serves the authenticated resolve/metadata requests and then redirects the actual file downloads to CDN hosts, with a short-lived signature embedded in the redirect URL itself. The client drops the `Authorization` header on that cross-host redirect, so neither the token nor the placeholder ever travels to the CDNs - no CDN hosts need to be allowlisted, and downloads work unchanged. Substitution happens only in HTTPS request headers toward allowed hosts - requests to any other host carry the harmless placeholder. See the [Secrets documentation](https://www.daytona.io/docs/en/secrets#substitution-scope) for the full substitution scope.

### [\#](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/\#3-understanding-the-code) 3\. Understanding the Code

[Section titled “3. Understanding the Code”](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/#3-understanding-the-code)

Let’s walk through `serve_vllm.py`, the script that creates the sandbox and starts the server.

#### [\#](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/\#creating-the-gpu-sandbox) Creating the GPU Sandbox

[Section titled “Creating the GPU Sandbox”](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/#creating-the-gpu-sandbox)

The script targets `us-east-1`, currently the region for GPU sandboxes, and creates one directly from the official vLLM image:

- [Python](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/#tab-panel-468)

```
import os

import sys

import time

import requests

from dotenv import load_dotenv

from daytona import (

    CreateSandboxFromImageParams,

    Daytona,

    DaytonaConfig,

    GpuType,

    Image,

    Resources,

    SessionExecuteRequest,

)

load_dotenv()

MODEL = "google/gemma-4-26B-A4B-it"

SERVED_AS = "gemma-4-moe"

VLLM_IMAGE = "vllm/vllm-openai:v0.22.1"

PORT = 8000

TARGET = "us-east-1"  # current region for GPU sandboxes

SESSION = "vllm"  # name of the background session the server runs in

BOOT_TIMEOUT = 900  # max seconds to wait for the server to come up

daytona = Daytona(DaytonaConfig(target=TARGET))

env_vars = {"HF_TOKEN": os.environ["HF_TOKEN"]} if os.environ.get("HF_TOKEN") else {}

sb = daytona.create(

    CreateSandboxFromImageParams(

        image=Image.base(VLLM_IMAGE),

        resources=Resources(

            gpu=1,

            gpu_type=[GpuType.H100, GpuType.RTX_PRO_6000],  # preference order

        ),

        auto_stop_interval=0,

        ephemeral=True,

        env_vars=env_vars,

    ),

    timeout=600,

)
```

A few things worth noting:

- **Stock image**: `Image.base` pulls `vllm/vllm-openai` as-is. The whole serving stack ships in the image; the sandbox just adds the GPU.
- **One GPU per sandbox**: `gpu=1` is currently the per-sandbox maximum.
- **GPU preference**: `gpu_type` takes a single type or a priority list; the sandbox gets the first type with availability, here an H100 with an RTX PRO 6000 fallback.
- **No idle stop**: `auto_stop_interval=0` keeps the endpoint alive until you delete the sandbox.
- **HF\_TOKEN passthrough**: the script forwards your token into the sandbox if you set one; it is required only for gated models, and the default model is not gated.

#### [\#](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/\#starting-the-server) Starting the Server

[Section titled “Starting the Server”](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/#starting-the-server)

The server runs as a session command with `run_async=True`, so the script keeps control while vLLM boots:

- [Python](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/#tab-panel-469)

```
sb.process.create_session(SESSION)

cmd = sb.process.execute_session_command(

    SESSION,

    SessionExecuteRequest(

        command=(

            f"vllm serve {MODEL} --port {PORT} "

            f"--served-model-name {SERVED_AS} "

            "--enable-auto-tool-choice --tool-call-parser gemma4 "

            "--reasoning-parser gemma4 "

            "--enable-prefix-caching"

        ),

        run_async=True,

    ),

)

cmd_id = cmd.cmd_id
```

The flags expose the model under the short name `gemma-4-moe` and enable tool calling and reasoning output parsing. The call returns immediately, and `cmd_id` is the handle for asking about the command later; the wait loop below uses it to fetch logs and check whether the server is still alive.

#### [\#](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/\#waiting-for-the-server) Waiting for the Server

[Section titled “Waiting for the Server”](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/#waiting-for-the-server)

Model download and loading take a few minutes. While waiting, the script streams the server logs to your terminal and polls `/health` through the preview URL, giving up after `BOOT_TIMEOUT` (900 seconds by default):

- [Python](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/#tab-panel-470)

```
pv = sb.get_preview_link(PORT)

hdr = {"x-daytona-preview-token": pv.token}

deadline = time.time() + BOOT_TIMEOUT

ready = False

printed = 0

while time.time() < deadline:

    # logs are a cumulative snapshot; print only the new tail

    out = sb.process.get_session_command_logs(SESSION, cmd_id).output or ""

    if len(out) > printed:

        sys.stdout.write(out[printed:])

        sys.stdout.flush()

        printed = len(out)

    # vllm serve runs until killed; an exit code means it died

    exit_code = sb.process.get_session_command(SESSION, cmd_id).exit_code

    if exit_code is not None:

        print(f"!! vllm exited with code {exit_code}. Full log saved to {dump_log(cmd_id)}", flush=True)

        sys.exit(1)

    try:

        if requests.get(f"{pv.url}/health", headers=hdr, timeout=10).status_code == 200:

            ready = True

            break

    except requests.RequestException:

        pass

    time.sleep(10)
```

The preview link is the piece that exposes the server outside the sandbox: `pv.url` is reachable from anywhere, and requests authenticate with the `x-daytona-preview-token` header. The URL follows the structure `https://{port}-{sandboxId}.{daytonaProxyDomain}`, as described in the [preview docs](https://www.daytona.io/docs/en/preview). The same URL and token the script uses for health checks are the ones your clients will use for inference.

If the server process dies during boot, the script notices the exit code immediately, saves the full server log next to the script, and exits instead of waiting out the timeout.

Once healthy, the script prints the handoff:

```
ready - paste into your shell:

export ENDPOINT=https://8000-{sandboxId}.{daytonaProxyDomain}

export TOKEN={previewToken}

sandbox left UP: {sandboxId}

  reconnect:  daytona.get('{sandboxId}')

  delete:     daytona.get('{sandboxId}').delete()
```

The sandbox stays up either way: on success so the endpoint keeps serving, on failure so the already-downloaded weights aren’t lost. Delete it when you’re done.

### [\#](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/\#4-querying-the-endpoint) 4\. Querying the Endpoint

[Section titled “4. Querying the Endpoint”](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/#4-querying-the-endpoint)

Paste the printed `export` lines into your shell, then use any OpenAI-compatible client. Each example below ships as a ready-to-run file in the directory you cloned: `query.sh` for curl, `query_openai.py` for the OpenAI SDK, and `query_litellm.py` for LiteLLM.

- [curl](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/#tab-panel-476)
- [OpenAI SDK](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/#tab-panel-477)
- [LiteLLM](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/#tab-panel-478)

```
curl -sS --connect-timeout 30 --max-time 120 "$ENDPOINT/v1/chat/completions" \

  -H "x-daytona-preview-token: $TOKEN" \

  -H "Content-Type: application/json" \

  -d '{

    "model": "gemma-4-moe",

    "messages": [{"role": "user", "content": "Write a haiku about sandboxes for AI agents."}],

    "max_tokens": 64

  }'
```

```
from openai import OpenAI

client = OpenAI(

    base_url=f"{os.environ['ENDPOINT']}/v1",

    api_key="EMPTY",  # vLLM doesn't check it; auth is the preview-token header

    default_headers={"x-daytona-preview-token": os.environ["TOKEN"]},

)

resp = client.chat.completions.create(

    model="gemma-4-moe",

    messages=[{"role": "user", "content": "Write a haiku about ephemeral sandboxes."}],

    max_tokens=64,

)

print(resp.choices[0].message.content)
```

```
import litellm

resp = litellm.completion(

    model="hosted_vllm/gemma-4-moe",  # OpenAI-compatible vLLM server

    api_base=f"{os.environ['ENDPOINT']}/v1",

    api_key="EMPTY",

    extra_headers={"x-daytona-preview-token": os.environ["TOKEN"]},

    messages=[{"role": "user", "content": "Write a haiku about agents running code in the cloud."}],

    max_tokens=64,

)

print(resp.choices[0].message.content)
```

The only Daytona-specific detail in any of these is the `x-daytona-preview-token` header. Everything else is the standard OpenAI API surface. The next three examples continue with the OpenAI SDK, following `query_openai.py` through streaming, reasoning, and tool calling.

#### [\#](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/\#streaming) Streaming

[Section titled “Streaming”](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/#streaming)

After the plain chat call, `query_openai.py` shows an example that streams tokens as they arrive:

- [Python](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/#tab-panel-471)

```
stream = client.chat.completions.create(

    model="gemma-4-moe",

    messages=[{"role": "user", "content": "Write ten haikus about tokens streaming from a sandbox."}],

    max_tokens=512,

    stream=True,

)

for chunk in stream:

    print(chunk.choices[0].delta.content or "", end="", flush=True)

print()
```

#### [\#](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/\#reasoning) Reasoning

[Section titled “Reasoning”](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/#reasoning)

The server was started with `--reasoning-parser gemma4`, which separates the model’s thinking from its answer. For the gemma-4 family there is a catch: reasoning tokens are never generated unless the request asks for them, which is why the other examples in this guide respond directly. Passing `reasoning_effort` turns thinking mode on, and the parsed trace comes back in the message’s `reasoning` field:

- [Python](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/#tab-panel-472)

```
resp = client.chat.completions.create(

    model="gemma-4-moe",

    messages=[{"role": "user", "content": "Write a haiku about GPU sandboxes."}],

    reasoning_effort="low",

    max_tokens=2048,

)

print("\nreasoning:")

print(resp.choices[0].message.reasoning)

print("answer:")

print(resp.choices[0].message.content)
```

#### [\#](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/\#tool-calling) Tool Calling

[Section titled “Tool Calling”](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/#tool-calling)

The script finishes with tool calling. Because the server was started with `--enable-auto-tool-choice` and a tool-call parser, the model can emit structured tool calls. The loop is the standard OpenAI one: the model requests a call, you run it, feed the result back, and the model answers.

- [Python](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/#tab-panel-473)

```
def get_weather(city):

    rng = random.Random(city.lower())  # same city, same weather

    temp = rng.randint(-5, 35)

    sky = rng.choice(["sunny", "cloudy", "rainy", "foggy", "windy"])

    return f"{temp}°C and {sky} in {city}"

tools = [\
\
    {\
\
        "type": "function",\
\
        "function": {\
\
            "name": "get_weather",\
\
            "description": "Get the current weather for a city.",\
\
            "parameters": {\
\
                "type": "object",\
\
                "properties": {"city": {"type": "string"}},\
\
                "required": ["city"],\
\
            },\
\
        },\
\
    }\
\
]

messages = [{"role": "user", "content": "Write a haiku about the current weather in Paris."}]

resp = client.chat.completions.create(model="gemma-4-moe", messages=messages, tools=tools, max_tokens=256)

msg = resp.choices[0].message

if msg.tool_calls:

    messages.append(msg.model_dump(exclude_none=True))

    for call in msg.tool_calls:

        args = json.loads(call.function.arguments)

        result = get_weather(**args)

        print(f"\ntool call: {call.function.name}({args})")

        print(f"result:    {result}")

        messages.append({"role": "tool", "tool_call_id": call.id, "content": result})

    resp = client.chat.completions.create(model="gemma-4-moe", messages=messages, max_tokens=256)

    print("final:")

    print(resp.choices[0].message.content)
```

### [\#](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/\#5-access-and-authentication) 5\. Access and Authentication

[Section titled “5. Access and Authentication”](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/#5-access-and-authentication)

Two independent layers decide who can reach the model: Daytona’s preview proxy in front of the sandbox, and vLLM’s own API key check inside it. The guide has used one mode of the proxy layer so far; here is the full picture.

#### [\#](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/\#the-daytona-layer-preview-links) The Daytona Layer: Preview Links

[Section titled “The Daytona Layer: Preview Links”](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/#the-daytona-layer-preview-links)

Every request so far carried the preview token as a header. That is the default mode and the best fit for code you control, since the secret stays out of URLs, logs, and browser history. Preview links support two more modes for when the header is a poor fit.

**Signed URLs** embed a short-lived token in the URL itself:

- [Python](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/#tab-panel-474)

```
signed = sb.create_signed_preview_url(PORT, expires_in_seconds=3600)

print(signed.url)  # no headers needed, expires after an hour
```

Anything that accepts only a base URL can now call the model: chat frontends, no-code tools, a colleague’s notebook. And because the URL expires on schedule, sharing it is a bounded commitment rather than a permanent grant. Two details to know: the default expiry is only 60 seconds, so pass `expires_in_seconds` explicitly, and `sb.expire_signed_preview_url(PORT, signed.token)` revokes a URL early.

**Public previews** drop the proxy’s authentication entirely. Create the sandbox with `public=True` in the create params, and the preview URL serves anyone who has it, for as long as the sandbox stays up.

#### [\#](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/\#the-vllm-layer-api-keys) The vLLM Layer: API Keys

[Section titled “The vLLM Layer: API Keys”](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/#the-vllm-layer-api-keys)

Every query example sets `api_key="EMPTY"`. That is because vLLM, unless told otherwise, accepts any key; the field exists only to satisfy client constructors. Add `--api-key your-secret-key` to the `vllm serve` command (or set `VLLM_API_KEY` in the sandbox’s `env_vars`) and the check becomes real: the server requires `Authorization: Bearer your-secret-key`, which is exactly what OpenAI-compatible clients send as their `api_key`.

The two layers do not guard the same surface, though. The vLLM key covers the inference routes (`/v1` and similar prefixes), while [other endpoints on the same server](https://docs.vllm.ai/en/stable/usage/security/) accept requests without it. The Daytona token gates everything on the port.

That makes **public preview plus vLLM API key** a combination for sharing with people you broadly trust: the endpoint behaves like a standard OpenAI-style API, configured with nothing but a base URL and an `api_key`, so it works in any tool that accepts only those two fields. For anything more exposed than that, the Daytona layer is the better fit.

| Setup | Client needs | Good for |
| --- | --- | --- |
| Preview token header (guide default) | base URL + custom header | your own code |
| Signed URL | URL only; expires on schedule | temporary sharing |
| Public preview + vLLM API key | base URL + `api_key` | pointing existing apps at your model |
| Public preview, no key | base URL only | quick demos |

#### [\#](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/\#inside-the-sandbox) Inside the Sandbox

[Section titled “Inside the Sandbox”](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/#inside-the-sandbox)

Everything above governs requests arriving from outside. Code running inside the sandbox can skip all of it and talk to `http://localhost:8000` directly. The vLLM image ships Python with the `openai` package preinstalled (it is a vLLM dependency), so the SDK works there as-is:

- [Python](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/#tab-panel-475)

```
daytona = Daytona(DaytonaConfig(target="us-east-1"))

sb = daytona.get("sandbox-id")  # printed by serve_vllm.py

print(sb.process.code_run("""

from openai import OpenAI

client = OpenAI(base_url="http://localhost:8000/v1", api_key="EMPTY")

resp = client.chat.completions.create(

    model="gemma-4-moe",

    messages=[{"role": "user", "content": "Write a haiku about code that never leaves its sandbox."}],

    max_tokens=64,

)

print(resp.choices[0].message.content)

""").result)
```

No auth is needed because the traffic never leaves the sandbox. Anything the image doesn’t ship, like `litellm`, install first with `sb.process.exec("pip install litellm")`.

This colocated shape fits workloads where the data should live next to the model: batch inference (upload a dataset into the sandbox, process it against the local endpoint, download the results) or a self-contained agent that calls the local model and runs the code it writes, all in one sandbox.

### [\#](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/\#6-swapping-models) 6\. Swapping Models

[Section titled “6. Swapping Models”](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/#6-swapping-models)

To serve a different model, change three things in `serve_vllm.py`:

- `MODEL`: the Hugging Face model ID
- `SERVED_AS`: the name clients will pass as `model`
- The `--tool-call-parser` and `--reasoning-parser` flags, which are model-family specific

For gated models, set `HF_TOKEN` in your `.env`; the script forwards it into the sandbox automatically. Keep in mind that the model has to fit on a single GPU, since sandboxes have at most one.

### [\#](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/\#7-going-further-sandboxes-as-tool-runtimes) 7\. Going Further: Sandboxes as Tool Runtimes

[Section titled “7. Going Further: Sandboxes as Tool Runtimes”](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/#7-going-further-sandboxes-as-tool-runtimes)

In the tool calling example above, `get_weather` runs in the same process as the client. Daytona makes a stronger pattern natural: give each chat session its own CPU sandbox, and execute the model’s tool calls there. The GPU sandbox keeps serving every session, while each conversation gets an isolated runtime where model-written code can run, install packages, and touch files without affecting anyone else. When the session ends, delete its sandbox.

Only the tool function’s body changes; instead of computing the result locally, it runs the model’s request in the session’s sandbox, with `sandbox.process.code_run(...)` for code or `sandbox.process.exec(...)` for shell commands, and returns the output. The sandbox can also carry whatever harness the tools need: interpreters, test runners, project dependencies. The tool-calling loop stays exactly the same. Both halves of the application run on Daytona: the GPU sandbox where the model thinks, and the CPU sandboxes where its decisions execute.

### [\#](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/\#8-configuration-options) 8\. Configuration Options

[Section titled “8. Configuration Options”](https://www.daytona.io/docs/en/guides/model-serving/vllm-gpu-model-serving/#8-configuration-options)

Constants at the top of `serve_vllm.py`:

| Parameter | Default | Description |
| --- | --- | --- |
| `MODEL` | `google/gemma-4-26B-A4B-it` | Hugging Face model ID to serve |
| `SERVED_AS` | `gemma-4-moe` | Model name exposed by the API |
| `VLLM_IMAGE` | `vllm/vllm-openai:v0.22.1` | vLLM Docker image |
| `PORT` | `8000` | Port the server listens on |
| `TARGET` | `us-east-1` | Current region for GPU sandboxes |
| `BOOT_TIMEOUT` | `900` | Seconds to wait for the server to become healthy |

* * *

**Key advantages of this approach:**

- **No infrastructure to manage**: one script turns a stock Docker image into a served model on a GPU
- **Fast**: a live endpoint about five minutes after you run the script, no provisioning, no driver setup
- **Reachable anywhere**: the preview URL works from any machine, secured by a token header
- **OpenAI-compatible**: existing clients, SDKs, and frameworks work unchanged