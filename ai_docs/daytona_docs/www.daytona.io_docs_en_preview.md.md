---
url: "https://www.daytona.io/docs/en/preview.md"
title: undefined
---

\# Preview

Daytona provides preview URLs for accessing services running in your sandboxes. Any process listening for HTTP traffic on ports \`1\` - \`65535\` can be previewed through a generated URL.

Daytona supports two types of preview URLs, each with a different authentication mechanism:

\- \[Standard preview URL\](#standard-preview-url) uses the sandbox ID in the URL and requires a separate token for authentication
\- \[Signed preview URL\](#signed-preview-url) embeds the authentication token directly in the URL, requiring no headers

\## Authentication

If a sandbox has its \`public\` property set to \`true\`, preview links are publicly accessible without authentication. Otherwise, authentication is required. The authentication mechanism depends on the preview URL type.

:::note
Standard and signed preview tokens are not interchangeable. The token from \`get\_preview\_link()\` is used as a preview access token (sent via the \`x-daytona-preview-token\` header). The token from \`create\_signed\_preview\_url()\` is embedded in the URL itself: it cannot be used as a standard preview token, and vice versa.
:::

\## Standard preview URL

The standard preview URL includes your sandbox ID in the URL and provides a separate token for authentication.

URL structure: \`https://{port}-{sandboxId}.{daytonaProxyDomain}\`

The token resets automatically when the sandbox restarts. Any previously issued standard preview tokens become invalid. Call the \`get\_preview\_link()\` method again after starting the sandbox to obtain a fresh token. Use standard preview URLs for programmatic access and API integrations where you control the HTTP headers.

\`\`\`python
preview\_info = sandbox.get\_preview\_link(3000)

print(f"URL: {preview\_info.url}")
print(f"Token: {preview\_info.token}")

\# Use with requests
import requests
response = requests.get(
 preview\_info.url,
 headers={"x-daytona-preview-token": preview\_info.token}
)
\`\`\`

\`\`\`typescript
const previewInfo = await sandbox.getPreviewLink(3000);

console.log(\`URL: ${previewInfo.url}\`);
console.log(\`Token: ${previewInfo.token}\`);

// Use with fetch
const response = await fetch(previewInfo.url, {
 headers: { 'x-daytona-preview-token': previewInfo.token }
});
\`\`\`

\`\`\`ruby
preview\_info = sandbox.preview\_url(3000)

puts "Preview link url: #{preview\_info.url}"
puts "Preview link token: #{preview\_info.token}"
\`\`\`

\`\`\`go
preview, err := sandbox.GetPreviewLink(ctx, 3000)
if err != nil {
 log.Fatal(err)
}
fmt.Printf("URL: %s\\n", preview.URL)
fmt.Printf("Token: %s\\n", preview.Token)
\`\`\`

\`\`\`bash
curl 'https://app.daytona.io/api/sandbox/{sandboxId}/ports/3000/preview-url' \
 --header 'Authorization: Bearer '
\`\`\`

\### Authentication

Authenticate by sending the token in the \`x-daytona-preview-token\` header:

\`\`\`bash
curl -H "x-daytona-preview-token: vg5c0ylmcimr8b\_v1ne0u6mdnvit6gc0" \
 https://3000-sandbox-123456.proxy.daytona.work
\`\`\`

\## Signed preview URL

The signed preview URL embeds the authentication token directly in the URL, eliminating the need for separate headers. The token persists across sandbox restarts until it expires, or is revoked manually before expiry. Set a custom expiry time for the token:

\- Default: \`60\` seconds
\- Minimum: \`1\` second
\- Maximum: \`86,400\` seconds (24 hours)
\- Recommended: \`3600\` seconds (1 hour)

:::tip
Always set the \`expires\_in\_seconds\` parameter explicitly. The default of 60 seconds is short due to security considerations. Most use cases should use at least 3600 (1 hour).
:::

URL structure: \`https://{port}-{token}.{daytonaProxyDomain}\`

Use signed preview URLs when sharing links with users who cannot set custom headers, embedding previews in iframes or emails, or creating time-limited shareable links.

\`\`\`python
\# Create a signed preview URL that expires in 3600 seconds (1 hour)
signed\_url = sandbox.create\_signed\_preview\_url(3000, expires\_in\_seconds=3600)

print(f"URL: {signed\_url.url}") # Token is embedded in the URL
print(f"Token: {signed\_url.token}") # Can be used to revoke access

\# Use directly - no headers needed
import requests
response = requests.get(signed\_url.url)

\# Revoke the token before expiry if needed
sandbox.expire\_signed\_preview\_url(3000, signed\_url.token)
\`\`\`

\`\`\`typescript
// Create a signed preview URL that expires in 3600 seconds (1 hour)
const signedUrl = await sandbox.getSignedPreviewUrl(3000, 3600);

console.log(\`URL: ${signedUrl.url}\`); // Token is embedded in the URL
console.log(\`Token: ${signedUrl.token}\`); // Can be used to revoke access

// Use directly - no headers needed
const response = await fetch(signedUrl.url);

// Revoke the token before expiry if needed
await sandbox.expireSignedPreviewUrl(3000, signedUrl.token);
\`\`\`

\`\`\`ruby
\# Create a signed preview URL that expires in 3600 seconds (1 hour)
signed\_url = sandbox.create\_signed\_preview\_url(3000, 3600)

puts "URL: #{signed\_url.url}"
puts "Token: #{signed\_url.token}"
\`\`\`

\`\`\`go
// Create a signed preview URL that expires in 3600 seconds (1 hour)
signedPreview, err := sandbox.GetSignedPreviewLink(ctx, 3000, 3600)
if err != nil {
 log.Fatal(err)
}

fmt.Printf("URL: %s\\n", signedPreview.URL) // Token is embedded in the URL
fmt.Printf("Token: %s\\n", signedPreview.Token) // Can be used to revoke access

// Revoke the token before expiry if needed
if err := sandbox.ExpireSignedPreviewLink(ctx, 3000, signedPreview.Token); err != nil {
 log.Fatal(err)
}
\`\`\`

\`\`\`bash
daytona preview-url  --port 3000 --expires 3600
\`\`\`

\`\`\`bash
curl 'https://app.daytona.io/api/sandbox/{sandboxId}/ports/3000/signed-preview-url?expiresInSeconds=3600' \
 --header 'Authorization: Bearer '
\`\`\`

\### Authentication

The token is embedded in the URL itself, so no additional headers are required:

\`\`\`bash
curl https://3000-.proxy.daytona.work
\`\`\`

:::tip
Port \`22222\` is used by the \[web terminal\](https://www.daytona.io/docs/en/web-terminal.md) to access the terminal using preview URLs.
:::

\## Warning page

When opening a preview link in a browser for the first time, Daytona displays a warning page. This warning informs users about potential risks of visiting the preview URL and only appears when loading the link in a browser.

To skip the warning page:

\- Send the \`X-Daytona-Skip-Preview-Warning: true\` header
\- Upgrade to \[Tier 3\](https://www.daytona.io/docs/en/limits.md)
\- Deploy a \[custom preview proxy\](https://www.daytona.io/docs/en/custom-preview-proxy.md)