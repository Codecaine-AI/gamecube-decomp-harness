---
url: "https://www.daytona.io/docs/en/preview/"
title: "Preview | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/preview/#_top)

# Preview

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/preview.md)Open

Daytona provides preview URLs for accessing services running in your sandboxes. Any process listening for HTTP traffic on ports `1` \- `65535` can be previewed through a generated URL.

Daytona supports two types of preview URLs, each with a different authentication mechanism:

- [Standard preview URL](https://www.daytona.io/docs/en/preview/#standard-preview-url) uses the sandbox ID in the URL and requires a separate token for authentication
- [Signed preview URL](https://www.daytona.io/docs/en/preview/#signed-preview-url) embeds the authentication token directly in the URL, requiring no headers

## [\#](https://www.daytona.io/docs/en/preview/\#authentication) Authentication

[Section titled “Authentication”](https://www.daytona.io/docs/en/preview/#authentication)

If a sandbox has its `public` property set to `true`, preview links are publicly accessible without authentication. Otherwise, authentication is required. The authentication mechanism depends on the preview URL type.

## [\#](https://www.daytona.io/docs/en/preview/\#standard-preview-url) Standard preview URL

[Section titled “Standard preview URL”](https://www.daytona.io/docs/en/preview/#standard-preview-url)

The standard preview URL includes your sandbox ID in the URL and provides a separate token for authentication.

URL structure: `https://{port}-{sandboxId}.{daytonaProxyDomain}`

The token resets automatically when the sandbox restarts. Any previously issued standard preview tokens become invalid. Call the `get_preview_link()` method again after starting the sandbox to obtain a fresh token. Use standard preview URLs for programmatic access and API integrations where you control the HTTP headers.

- [Python](https://www.daytona.io/docs/en/preview/#tab-panel-865)
- [TypeScript](https://www.daytona.io/docs/en/preview/#tab-panel-866)
- [Ruby](https://www.daytona.io/docs/en/preview/#tab-panel-867)
- [Go](https://www.daytona.io/docs/en/preview/#tab-panel-868)
- [API](https://www.daytona.io/docs/en/preview/#tab-panel-869)

```
preview_info = sandbox.get_preview_link(3000)

print(f"URL: {preview_info.url}")

print(f"Token: {preview_info.token}")

# Use with requests

import requests

response = requests.get(

    preview_info.url,

    headers={"x-daytona-preview-token": preview_info.token}

)
```

```
const previewInfo = await sandbox.getPreviewLink(3000);

console.log(`URL: ${previewInfo.url}`);

console.log(`Token: ${previewInfo.token}`);

// Use with fetch

const response = await fetch(previewInfo.url, {

  headers: { 'x-daytona-preview-token': previewInfo.token }

});
```

```
preview_info = sandbox.preview_url(3000)

puts "Preview link url: #{preview_info.url}"

puts "Preview link token: #{preview_info.token}"
```

```
preview, err := sandbox.GetPreviewLink(ctx, 3000)

if err != nil {

    log.Fatal(err)

}

fmt.Printf("URL: %s\n", preview.URL)

fmt.Printf("Token: %s\n", preview.Token)
```

```
curl 'https://app.daytona.io/api/sandbox/{sandboxId}/ports/3000/preview-url' \

  --header 'Authorization: Bearer <API_KEY>'
```

### [\#](https://www.daytona.io/docs/en/preview/\#authentication-1) Authentication

[Section titled “Authentication”](https://www.daytona.io/docs/en/preview/#authentication-1)

Authenticate by sending the token in the `x-daytona-preview-token` header:

```
curl -H "x-daytona-preview-token: vg5c0ylmcimr8b_v1ne0u6mdnvit6gc0" \

  https://3000-sandbox-123456.proxy.daytona.work
```

## [\#](https://www.daytona.io/docs/en/preview/\#signed-preview-url) Signed preview URL

[Section titled “Signed preview URL”](https://www.daytona.io/docs/en/preview/#signed-preview-url)

The signed preview URL embeds the authentication token directly in the URL, eliminating the need for separate headers. The token persists across sandbox restarts until it expires, or is revoked manually before expiry. Set a custom expiry time for the token:

- Default: `60` seconds
- Minimum: `1` second
- Maximum: `86,400` seconds (24 hours)
- Recommended: `3600` seconds (1 hour)

URL structure: `https://{port}-{token}.{daytonaProxyDomain}`

Use signed preview URLs when sharing links with users who cannot set custom headers, embedding previews in iframes or emails, or creating time-limited shareable links.

- [Python](https://www.daytona.io/docs/en/preview/#tab-panel-870)
- [TypeScript](https://www.daytona.io/docs/en/preview/#tab-panel-871)
- [Ruby](https://www.daytona.io/docs/en/preview/#tab-panel-872)
- [Go](https://www.daytona.io/docs/en/preview/#tab-panel-873)
- [CLI](https://www.daytona.io/docs/en/preview/#tab-panel-874)
- [API](https://www.daytona.io/docs/en/preview/#tab-panel-875)

```
# Create a signed preview URL that expires in 3600 seconds (1 hour)

signed_url = sandbox.create_signed_preview_url(3000, expires_in_seconds=3600)

print(f"URL: {signed_url.url}")  # Token is embedded in the URL

print(f"Token: {signed_url.token}")  # Can be used to revoke access

# Use directly - no headers needed

import requests

response = requests.get(signed_url.url)

# Revoke the token before expiry if needed

sandbox.expire_signed_preview_url(3000, signed_url.token)
```

```
// Create a signed preview URL that expires in 3600 seconds (1 hour)

const signedUrl = await sandbox.getSignedPreviewUrl(3000, 3600);

console.log(`URL: ${signedUrl.url}`);  // Token is embedded in the URL

console.log(`Token: ${signedUrl.token}`);  // Can be used to revoke access

// Use directly - no headers needed

const response = await fetch(signedUrl.url);

// Revoke the token before expiry if needed

await sandbox.expireSignedPreviewUrl(3000, signedUrl.token);
```

```
# Create a signed preview URL that expires in 3600 seconds (1 hour)

signed_url = sandbox.create_signed_preview_url(3000, 3600)

puts "URL: #{signed_url.url}"

puts "Token: #{signed_url.token}"
```

```
// Create a signed preview URL that expires in 3600 seconds (1 hour)

signedPreview, err := sandbox.GetSignedPreviewLink(ctx, 3000, 3600)

if err != nil {

    log.Fatal(err)

}

fmt.Printf("URL: %s\n", signedPreview.URL)   // Token is embedded in the URL

fmt.Printf("Token: %s\n", signedPreview.Token) // Can be used to revoke access

// Revoke the token before expiry if needed

if err := sandbox.ExpireSignedPreviewLink(ctx, 3000, signedPreview.Token); err != nil {

    log.Fatal(err)

}
```

```
daytona preview-url <sandbox-name> --port 3000 --expires 3600
```

```
curl 'https://app.daytona.io/api/sandbox/{sandboxId}/ports/3000/signed-preview-url?expiresInSeconds=3600' \

  --header 'Authorization: Bearer <API_KEY>'
```

### [\#](https://www.daytona.io/docs/en/preview/\#authentication-2) Authentication

[Section titled “Authentication”](https://www.daytona.io/docs/en/preview/#authentication-2)

The token is embedded in the URL itself, so no additional headers are required:

```
curl https://3000-<value>.proxy.daytona.work
```

## [\#](https://www.daytona.io/docs/en/preview/\#warning-page) Warning page

[Section titled “Warning page”](https://www.daytona.io/docs/en/preview/#warning-page)

When opening a preview link in a browser for the first time, Daytona displays a warning page. This warning informs users about potential risks of visiting the preview URL and only appears when loading the link in a browser.

To skip the warning page:

- Send the `X-Daytona-Skip-Preview-Warning: true` header
- Upgrade to [Tier 3](https://www.daytona.io/docs/en/limits)
- Deploy a [custom preview proxy](https://www.daytona.io/docs/en/custom-preview-proxy)