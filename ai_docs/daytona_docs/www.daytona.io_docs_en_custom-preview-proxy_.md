---
url: "https://www.daytona.io/docs/en/custom-preview-proxy/"
title: "Custom Preview Proxy | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/custom-preview-proxy/#_top)

# Custom Preview Proxy

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/custom-preview-proxy.md)Open

Daytona provides a preview proxy service that can be used to handle [preview URLs](https://www.daytona.io/docs/en/preview) for sandboxes. This gives you full control over the preview experience, including custom domains, authentication, error handling, and styling.

- **Custom domain**: host your proxy under your own domain (e.g., `preview.yourcompany.com`)
- **User authentication**: implement custom authentication logic for private previews
- **Sandbox management**: automatically start stopped sandboxes before forwarding users
- **Custom error pages**: style error pages to match your brand
- **Preview warning control**: disable Daytona’s preview warning
- **CORS management**: override Daytona’s default CORS settings

## [\#](https://www.daytona.io/docs/en/custom-preview-proxy/\#how-it-works) How it works

[Section titled “How it works”](https://www.daytona.io/docs/en/custom-preview-proxy/#how-it-works)

When a user visits a preview URL, your custom proxy receives the request and can:

1. Authenticate the user using custom logic
2. Check sandbox status and start it if needed
3. Forward the request to the actual sandbox
4. Handle responses with custom styling and error pages
5. Send custom headers to control Daytona’s behavior

Your proxy should forward the `X-Forwarded-Host` header with the original request host when proxying requests to Daytona. By default, Daytona appends its own host to this header; see [Preserve X-Forwarded-Host](https://www.daytona.io/docs/en/custom-preview-proxy/#preserve-x-forwarded-host) to forward your value unchanged.

## [\#](https://www.daytona.io/docs/en/custom-preview-proxy/\#websocket-support) WebSocket support

[Section titled “WebSocket support”](https://www.daytona.io/docs/en/custom-preview-proxy/#websocket-support)

The preview proxy fully supports WebSocket connections. WebSocket upgrade requests (`Upgrade: websocket`) are automatically detected and proxied. WebSocket connections skip the preview warning page.

## [\#](https://www.daytona.io/docs/en/custom-preview-proxy/\#reserved-ports) Reserved ports

[Section titled “Reserved ports”](https://www.daytona.io/docs/en/custom-preview-proxy/#reserved-ports)

The following ports are reserved for internal services and always require authentication, even on public sandboxes:

| Port | Service |
| --- | --- |
| **`22222`** | [**Web** terminal](https://www.daytona.io/docs/en/web-terminal) |
| **`2280`** | Toolbox (IDE/development interface) |
| **`33333`** | Recording dashboard |

Your custom proxy should avoid exposing these ports unless you explicitly need access to these services.

## [\#](https://www.daytona.io/docs/en/custom-preview-proxy/\#proxy-headers) Proxy headers

[Section titled “Proxy headers”](https://www.daytona.io/docs/en/custom-preview-proxy/#proxy-headers)

Your proxy can send special headers to control Daytona’s behavior.

### [\#](https://www.daytona.io/docs/en/custom-preview-proxy/\#disable-preview-warning) Disable preview warning

[Section titled “Disable preview warning”](https://www.daytona.io/docs/en/custom-preview-proxy/#disable-preview-warning)

To disable Daytona’s preview warning page, send:

```
X-Daytona-Skip-Preview-Warning: true
```

The warning page is only shown to browser requests. It sets a `daytona-preview-page-accepted` cookie that persists for 24 hours after acceptance.

### [\#](https://www.daytona.io/docs/en/custom-preview-proxy/\#disable-cors) Disable CORS

[Section titled “Disable CORS”](https://www.daytona.io/docs/en/custom-preview-proxy/#disable-cors)

Daytona’s default CORS policy allows all origins with credentials. To override this and use your own CORS settings, send:

```
X-Daytona-Disable-CORS: true
```

### [\#](https://www.daytona.io/docs/en/custom-preview-proxy/\#disable-last-activity-update) Disable last activity update

[Section titled “Disable last activity update”](https://www.daytona.io/docs/en/custom-preview-proxy/#disable-last-activity-update)

To prevent sandbox last activity updates when previewing, set the `X-Daytona-Skip-Last-Activity-Update` header to `true`. This prevents Daytona from keeping sandboxes that have [auto-stop enabled](https://www.daytona.io/docs/en/sandboxes#auto-stop-interval) in a started state:

```
curl -H "X-Daytona-Skip-Last-Activity-Update: true" \

  https://3000-sandbox-123456.proxy.daytona.work
```

### [\#](https://www.daytona.io/docs/en/custom-preview-proxy/\#authentication) Authentication

[Section titled “Authentication”](https://www.daytona.io/docs/en/custom-preview-proxy/#authentication)

For private preview links, send:

```
X-Daytona-Preview-Token: {sandboxToken}
```

The `sandboxToken` can be fetched through the Daytona SDK or API using the [standard preview URL](https://www.daytona.io/docs/en/preview#standard-preview-url) methods.

### [\#](https://www.daytona.io/docs/en/custom-preview-proxy/\#preserve-x-forwarded-host) Preserve X-Forwarded-Host

[Section titled “Preserve X-Forwarded-Host”](https://www.daytona.io/docs/en/custom-preview-proxy/#preserve-x-forwarded-host)

By default, Daytona appends its own host to the `X-Forwarded-Host` header, so applications inside the sandbox receive both your proxy’s value and Daytona’s (e.g., `preview.yourcompany.com, 3000-sandbox-123456.proxy.daytona.work`).

If your application needs to see only the original host, for example to generate absolute URLs or validate the request host:

1. Include a valid **`X-Daytona-Preview-Token`** header (see [authentication](https://www.daytona.io/docs/en/custom-preview-proxy/#authentication)). To prevent spoofing, the trust header is only honored on authorized requests; requests without a valid token fall back to the default behavior
2. Set **`X-Forwarded-Host`** to the original request host
3. Send **`X-Daytona-Trust-Forwarded-Host: true`**

Daytona then forwards your `X-Forwarded-Host` value unchanged as the only value. The `X-Daytona-Trust-Forwarded-Host` header itself is never forwarded to the sandbox.

```
curl -H "X-Daytona-Trust-Forwarded-Host: true" \

  -H "X-Daytona-Preview-Token: {sandboxToken}" \

  -H "X-Forwarded-Host: preview.yourcompany.com" \

  https://3000-sandbox-123456.proxy.daytona.work
```

## [\#](https://www.daytona.io/docs/en/custom-preview-proxy/\#examples) Examples

[Section titled “Examples”](https://www.daytona.io/docs/en/custom-preview-proxy/#examples)

Examples of custom preview proxies are available on [GitHub](https://github.com/daytonaio/daytona-proxy-samples).