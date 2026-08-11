---
url: "https://www.daytona.io/docs/en/tools/api.md"
title: undefined
---

# Daytona API Reference

A reference of supported operations using the Daytona API. Each section lists the available endpoints; full request and response schemas are in the linked OpenAPI specifications.

Interactive reference: https://www.daytona.io/docs/en/tools/api

## Daytona API

Daytona AI platform API Docs

- OpenAPI specification: https://www.daytona.io/docs/openapi.json
- Base URL: `https://app.daytona.io/api`

### config

- `GET /config` - Get config

### api-keys

- `GET /api-keys` - List API keys
- `POST /api-keys` - Create API key
- `GET /api-keys/current` - Get current API key's details
- `GET /api-keys/{name}` - Get API key
- `DELETE /api-keys/{name}` - Delete API key
- `DELETE /api-keys/{userId}/{name}` - Delete API key for user

### organizations

- `GET /organizations/invitations` - List organization invitations for authenticated user
- `GET /organizations/invitations/count` - Get count of organization invitations for authenticated user
- `POST /organizations/invitations/{invitationId}/accept` - Accept organization invitation
- `POST /organizations/invitations/{invitationId}/decline` - Decline organization invitation
- `GET /organizations` - List organizations
- `POST /organizations` - Create organization
- `PATCH /organizations/{organizationId}/default-region` - Set default region for organization
- `GET /organizations/{organizationId}` - Get organization by ID
- `DELETE /organizations/{organizationId}` - Delete organization
- `GET /organizations/{organizationId}/usage` - Get organization current usage overview
- `GET /organizations/{organizationId}/available-sandbox-classes` - List available sandbox classes for organization
- `PATCH /organizations/{organizationId}/quota` - Update organization quota
- `PATCH /organizations/{organizationId}/quota/{regionId}` - Update organization region quota
- `POST /organizations/{organizationId}/leave` - Leave organization
- `POST /organizations/{organizationId}/suspend` - Suspend organization
- `POST /organizations/{organizationId}/unsuspend` - Unsuspend organization
- `GET /organizations/otel-config/by-sandbox-auth-token/{authToken}` - Get organization OTEL config by sandbox auth token
- `GET /organizations/{organizationId}/otel-config` - Get organization OTEL config by organization ID
- `PUT /organizations/{organizationId}/otel-config` - Update organization OpenTelemetry configuration
- `DELETE /organizations/{organizationId}/otel-config` - Delete organization OpenTelemetry configuration
- `POST /organizations/{organizationId}/sandbox-default-limited-network-egress` - Update sandbox default limited network egress
- `POST /organizations/{organizationId}/preview-warning` - Update organization preview warning
- `PUT /organizations/{organizationId}/experimental-config` - Update experimental configuration
- `GET /organizations/{organizationId}/roles` - List organization roles
- `POST /organizations/{organizationId}/roles` - Create organization role
- `PUT /organizations/{organizationId}/roles/{roleId}` - Update organization role
- `DELETE /organizations/{organizationId}/roles/{roleId}` - Delete organization role
- `GET /organizations/{organizationId}/users` - List organization members
- `POST /organizations/{organizationId}/users/{userId}/access` - Update access for organization member
- `DELETE /organizations/{organizationId}/users/{userId}` - Delete organization member
- `GET /organizations/{organizationId}/invitations` - List pending organization invitations
- `POST /organizations/{organizationId}/invitations` - Create organization invitation
- `PUT /organizations/{organizationId}/invitations/{invitationId}` - Update organization invitation
- `POST /organizations/{organizationId}/invitations/{invitationId}/cancel` - Cancel organization invitation
- `GET /regions` - List all available regions for the organization
- `POST /regions` - Create a new region
- `GET /regions/{id}` - Get region by ID
- `PATCH /regions/{id}` - Update region configuration
- `DELETE /regions/{id}` - Delete a region
- `POST /regions/{id}/regenerate-proxy-api-key` - Regenerate proxy API key for a region
- `POST /regions/{id}/regenerate-ssh-gateway-api-key` - Regenerate SSH gateway API key for a region
- `POST /regions/{id}/regenerate-snapshot-manager-credentials` - Regenerate snapshot manager credentials for a region

### users

- `GET /users/me` - Get authenticated user
- `GET /users/account-providers` - Get available account providers
- `POST /users/linked-accounts` - Link account
- `DELETE /users/linked-accounts/{provider}/{providerUserId}` - Unlink account
- `POST /users/mfa/sms/enroll` - Enroll in SMS MFA

### regions

- `GET /shared-regions` - List all shared regions

### sandbox

- `GET /sandbox` - List sandboxes
- `POST /sandbox` - Create a new sandbox
- `GET /sandbox/paginated` - [DEPRECATED] List all sandboxes paginated
- `GET /sandbox/for-runner` - Get sandboxes for the authenticated runner
- `GET /sandbox/{sandboxIdOrName}` - Get sandbox details
- `DELETE /sandbox/{sandboxIdOrName}` - Delete sandbox
- `POST /sandbox/{sandboxIdOrName}/recover` - Recover sandbox from error state
- `POST /sandbox/{sandboxIdOrName}/start` - Start or resume sandbox
- `POST /sandbox/{sandboxIdOrName}/stop` - Stop sandbox
- `POST /sandbox/{sandboxIdOrName}/pause` - Pause sandbox
- `POST /sandbox/{sandboxIdOrName}/resize` - Resize sandbox resources
- `PUT /sandbox/{sandboxIdOrName}/labels` - Replace sandbox labels
- `PUT /sandbox/{sandboxId}/state` - Update sandbox state
- `POST /sandbox/{sandboxIdOrName}/backup` - Create sandbox backup
- `POST /sandbox/{sandboxIdOrName}/snapshot` - Create a snapshot from a sandbox
- `POST /sandbox/{sandboxIdOrName}/fork` - Fork a sandbox
- `GET /sandbox/{sandboxIdOrName}/forks` - Get sandbox fork children
- `GET /sandbox/{sandboxIdOrName}/parent` - Get sandbox fork parent
- `GET /sandbox/{sandboxIdOrName}/ancestors` - Get sandbox fork ancestor chain
- `POST /sandbox/{sandboxIdOrName}/public/{isPublic}` - Update public status
- `GET /sandbox/{sandboxId}/signing-key` - Get the signing key for a sandbox
- `POST /sandbox/{sandboxId}/signing-key/rotate` - Rotate the signing key, invalidating all previously signed URLs
- `POST /sandbox/{sandboxId}/last-activity` - Update sandbox last activity
- `POST /sandbox/{sandboxIdOrName}/autostop/{interval}` - Set sandbox auto-stop interval
- `POST /sandbox/{sandboxIdOrName}/autopause/{interval}` - Set sandbox auto-pause interval
- `POST /sandbox/{sandboxIdOrName}/ttl/{ttlMinutes}` - Set sandbox TTL
- `POST /sandbox/{sandboxIdOrName}/autoarchive/{interval}` - Set sandbox auto-archive interval
- `POST /sandbox/{sandboxIdOrName}/autodelete/{interval}` - Set sandbox auto-delete interval
- `POST /sandbox/{sandboxIdOrName}/network-settings` - Update sandbox network settings
- `PUT /sandbox/{sandboxIdOrName}/secrets` - Update sandbox secrets
- `POST /sandbox/{sandboxIdOrName}/archive` - Archive sandbox
- `GET /sandbox/{sandboxIdOrName}/ports/{port}/preview-url` - Get preview URL for a sandbox port
- `GET /sandbox/{sandboxIdOrName}/ports/{port}/signed-preview-url` - Get signed preview URL for a sandbox port
- `POST /sandbox/{sandboxIdOrName}/ports/{port}/signed-preview-url/{token}/expire` - Expire signed preview URL for a sandbox port
- `GET /sandbox/{sandboxIdOrName}/build-logs` - Get build logs
- `GET /sandbox/{sandboxIdOrName}/build-logs-url` - Get build logs URL
- `POST /sandbox/{sandboxIdOrName}/ssh-access` - Create SSH access for sandbox
- `DELETE /sandbox/{sandboxIdOrName}/ssh-access` - Revoke SSH access for sandbox
- `GET /sandbox/ssh-access/validate` - Validate SSH access for sandbox
- `GET /sandbox/{sandboxId}/toolbox-proxy-url` - Get toolbox proxy URL for a sandbox
- `GET /sandbox/{sandboxId}/organization` - Get organization by sandbox ID
- `GET /sandbox/{sandboxId}/region-quota` - Get region quota by sandbox ID
- `GET /sandbox/{sandboxId}/secrets` - Resolve sandbox secrets
- `GET /sandbox/{sandboxId}/telemetry/logs` - Get sandbox logs
- `GET /sandbox/{sandboxId}/telemetry/traces` - Get sandbox traces
- `GET /sandbox/{sandboxId}/telemetry/traces/{traceId}` - Get trace spans
- `GET /sandbox/{sandboxId}/telemetry/metrics` - Get sandbox metrics

### runners

- `GET /runners` - List all runners
- `POST /runners` - Create runner
- `GET /runners/me` - Get info for authenticated runner
- `GET /runners/by-sandbox/{sandboxId}` - Get runner by sandbox ID
- `GET /runners/by-snapshot-ref` - Get runners by snapshot ref
- `GET /runners/{id}` - Get runner by ID
- `DELETE /runners/{id}` - Delete runner
- `GET /runners/{id}/full` - Get runner by ID
- `PATCH /runners/{id}/scheduling` - Update runner scheduling status
- `PATCH /runners/{id}/draining` - Update runner draining status
- `POST /runners/healthcheck` - Runner healthcheck

### snapshots

- `GET /snapshots` - List all snapshots
- `POST /snapshots` - Create a new snapshot
- `GET /snapshots/{id}` - Get snapshot by ID or name
- `DELETE /snapshots/{id}` - Delete snapshot
- `GET /snapshots/{id}/build-logs` - Get snapshot build logs
- `GET /snapshots/{id}/build-logs-url` - Get snapshot build logs URL
- `POST /snapshots/{id}/activate` - Activate a snapshot
- `POST /snapshots/{id}/deactivate` - Deactivate a snapshot

### preview

- `GET /preview/{sandboxId}/public` - Check if sandbox is public
- `GET /preview/{sandboxId}/preview-warning` - Check if the preview warning page is enabled for the sandbox
- `GET /preview/{sandboxId}/validate/{authToken}` - Check if sandbox auth token is valid
- `GET /preview/{sandboxId}/signing-key` - Get the signing key for a sandbox
- `GET /preview/{sandboxId}/access` - Check if user has access to the sandbox
- `GET /preview/{signedPreviewToken}/{port}/sandbox-id` - Get sandbox ID from signed preview URL token

### volumes

- `GET /volumes` - List all volumes
- `POST /volumes` - Create a new volume
- `GET /volumes/{volumeId}` - Get volume details
- `DELETE /volumes/{volumeId}` - Delete volume
- `GET /volumes/by-name/{name}` - Get volume details by name

### jobs

- `GET /jobs` - List jobs for the runner
- `GET /jobs/poll` - Long poll for jobs
- `GET /jobs/{jobId}` - Get job details
- `POST /jobs/{jobId}/status` - Update job status

### warm-pools

- `GET /warm-pools` - List warm pools for the organization
- `POST /warm-pools` - Create a warm pool
- `PATCH /warm-pools/{id}` - Update a warm pool size
- `DELETE /warm-pools/{id}` - Delete a warm pool

### docker-registry

- `GET /docker-registry` - List registries
- `POST /docker-registry` - Create registry
- `GET /docker-registry/registry-push-access` - Get temporary registry access for pushing snapshots
- `GET /docker-registry/{id}` - Get registry
- `PATCH /docker-registry/{id}` - Update registry
- `DELETE /docker-registry/{id}` - Delete registry

### secret

- `GET /secret` - List secrets
- `POST /secret` - Create secret
- `GET /secret/paginated` - List secrets with pagination
- `GET /secret/{secretId}` - Get secret
- `PATCH /secret/{secretId}` - Update secret
- `DELETE /secret/{secretId}` - Delete secret

### admin

- `GET /admin/runners` - List all runners
- `POST /admin/runners` - Create runner
- `GET /admin/runners/{id}` - Get runner by ID
- `DELETE /admin/runners/{id}` - Delete runner
- `PATCH /admin/runners/{id}/scheduling` - Update runner scheduling status
- `POST /admin/sandbox/{sandboxId}/recover` - Recover sandbox from error state as an admin
- `GET /admin/users` - List all users
- `POST /admin/users` - Create user
- `POST /admin/users/{id}/regenerate-key-pair` - Regenerate user key pair
- `GET /admin/users/{id}` - Get user by ID
- `POST /admin/webhooks/organizations/{organizationId}/send` - Send a webhook message to an organization
- `GET /admin/webhooks/organizations/{organizationId}/messages/{messageId}/attempts` - Get delivery attempts for a webhook message
- `GET /admin/webhooks/status` - Get webhook service status
- `POST /admin/webhooks/organizations/{organizationId}/initialize` - Initialize webhooks for an organization
- `POST /admin/docker-registry/{id}/set-default` - Set default registry
- `GET /admin/snapshots/can-cleanup-image` - Check if an image can be cleaned up
- `PATCH /admin/snapshots/{id}/general` - Set snapshot general status
- `GET /admin/audit` - Get all audit logs
- `POST /admin/organizations` - Create organization for user
- `POST /admin/organizations/{organizationId}/quota/{regionId}` - Create organization region quota
- `PATCH /admin/organizations/{organizationId}/quota/{regionId}` - Update organization region quota
- `GET /admin/organizations/{organizationId}/quota/{regionId}/{sandboxClass}` - Get organization region quota
- `DELETE /admin/organizations/{organizationId}/quota/{regionId}/{sandboxClass}` - Delete organization region quota
- `POST /admin/organizations/{organizationId}/preview-warning` - Update organization preview warning

### webhooks

- `POST /webhooks/organizations/{organizationId}/app-portal-access` - Get Svix Consumer App Portal access for an organization
- `GET /webhooks/organizations/{organizationId}/initialization-status` - Get webhook initialization status for an organization
- `POST /webhooks/organizations/{organizationId}/initialize` - Initialize webhooks for an organization
- `POST /webhooks/organizations/{organizationId}/refresh-endpoints` - Refresh cached endpoint presence flag for an organization

### audit

- `GET /audit/organizations/{organizationId}` - Get audit logs for organization

### object-storage

- `GET /object-storage/push-access` - Get temporary storage access for pushing objects

### Health

- `GET /health` - HealthController_live
- `GET /health/ready` - HealthController_check

## Daytona Toolbox API

Daytona Toolbox API. The base URL comes from the sandbox's `toolboxProxyUrl` field (returned in sandbox DTO by the main Daytona API) plus the sandbox ID: `{toolboxProxyUrl}/{sandboxId}/{endpoint}`. Default for Daytona Cloud: `https://proxy.app.daytona.io/toolbox/{sandboxId}`.

- OpenAPI specification: https://www.daytona.io/docs/toolbox-openapi.json
- Base URL: `https://proxy.app.daytona.io/toolbox/{sandboxId}`

### computer-use

- `POST /computeruse/a11y/find` - Find accessibility nodes
- `POST /computeruse/a11y/node/focus` - Focus an accessibility node
- `POST /computeruse/a11y/node/invoke` - Invoke an action on an accessibility node
- `POST /computeruse/a11y/node/value` - Set the value of an accessibility node
- `GET /computeruse/a11y/tree` - Get accessibility tree
- `GET /computeruse/display/info` - Get display information
- `GET /computeruse/display/windows` - Get windows information
- `POST /computeruse/keyboard/hotkey` - Press hotkey
- `POST /computeruse/keyboard/key` - Press key
- `POST /computeruse/keyboard/type` - Type text
- `POST /computeruse/mouse/click` - Click mouse button
- `POST /computeruse/mouse/drag` - Drag mouse
- `POST /computeruse/mouse/move` - Move mouse cursor
- `GET /computeruse/mouse/position` - Get mouse position
- `POST /computeruse/mouse/scroll` - Scroll mouse wheel
- `GET /computeruse/process-status` - Get computer use process status
- `GET /computeruse/process/{processName}/errors` - Get process errors
- `GET /computeruse/process/{processName}/logs` - Get process logs
- `POST /computeruse/process/{processName}/restart` - Restart specific process
- `GET /computeruse/process/{processName}/status` - Get specific process status
- `GET /computeruse/recordings` - List all recordings
- `POST /computeruse/recordings/start` - Start a new recording
- `POST /computeruse/recordings/stop` - Stop a recording
- `GET /computeruse/recordings/{id}` - Get recording details
- `DELETE /computeruse/recordings/{id}` - Delete a recording
- `GET /computeruse/recordings/{id}/download` - Download a recording
- `GET /computeruse/screenshot` - Take a screenshot
- `GET /computeruse/screenshot/compressed` - Take a compressed screenshot
- `GET /computeruse/screenshot/region` - Take a region screenshot
- `GET /computeruse/screenshot/region/compressed` - Take a compressed region screenshot
- `POST /computeruse/start` - Start computer use processes
- `GET /computeruse/status` - Get computer use status
- `POST /computeruse/stop` - Stop computer use processes

### server

- `POST /env` - Update process environment
- `POST /init` - Initialize toolbox server

### file-system

- `GET /files` - List files and directories
- `DELETE /files` - Delete a file or directory
- `POST /files/bulk-download` - Download multiple files
- `POST /files/bulk-upload` - Upload multiple files
- `GET /files/download` - Download a file
- `GET /files/find` - Find text in files
- `POST /files/folder` - Create a folder
- `GET /files/info` - Get file information
- `POST /files/move` - Move or rename file/directory
- `POST /files/permissions` - Set file permissions
- `POST /files/replace` - Replace text in files
- `GET /files/search` - Search files by pattern
- `POST /files/upload-v2` - Upload a file

### git

- `POST /git/add` - Add files to Git staging
- `GET /git/branches` - List branches
- `POST /git/branches` - Create a new branch
- `DELETE /git/branches` - Delete a branch
- `POST /git/checkout` - Checkout branch or commit
- `POST /git/clone` - Clone a Git repository
- `POST /git/commit` - Commit changes
- `GET /git/config` - Get a Git config value
- `POST /git/config` - Set a Git config value
- `POST /git/config/user` - Configure Git user
- `POST /git/credentials` - Authenticate Git
- `GET /git/history` - Get commit history
- `POST /git/init` - Initialize a Git repository
- `POST /git/pull` - Pull changes from remote
- `POST /git/push` - Push changes to remote
- `GET /git/remotes` - List remotes
- `POST /git/remotes` - Add a remote
- `POST /git/reset` - Reset repository
- `POST /git/restore` - Restore files
- `GET /git/status` - Get Git status

### lsp

- `POST /lsp/completions` - Get code completions
- `POST /lsp/did-close` - Notify document closed
- `POST /lsp/did-open` - Notify document opened
- `GET /lsp/document-symbols` - Get document symbols
- `POST /lsp/start` - Start LSP server
- `POST /lsp/stop` - Stop LSP server
- `GET /lsp/workspacesymbols` - Get workspace symbols

### port

- `GET /port` - Get active ports
- `GET /port/{port}/in-use` - Check if port is in use

### process

- `POST /process/code-run` - Execute code
- `POST /process/execute` - Execute a command
- `GET /process/pty` - List all PTY sessions
- `POST /process/pty` - Create a new PTY session
- `GET /process/pty/{sessionId}` - Get PTY session information
- `DELETE /process/pty/{sessionId}` - Delete a PTY session
- `GET /process/pty/{sessionId}/connect` - Connect to PTY session via WebSocket
- `POST /process/pty/{sessionId}/resize` - Resize a PTY session
- `GET /process/session` - List all sessions
- `POST /process/session` - Create a new session
- `GET /process/session/entrypoint` - Get entrypoint session details
- `GET /process/session/entrypoint/logs` - Get entrypoint logs
- `GET /process/session/{sessionId}` - Get session details
- `DELETE /process/session/{sessionId}` - Delete a session
- `GET /process/session/{sessionId}/command/{commandId}` - Get session command details
- `POST /process/session/{sessionId}/command/{commandId}/input` - Send input to command
- `GET /process/session/{sessionId}/command/{commandId}/logs` - Get session command logs
- `POST /process/session/{sessionId}/exec` - Execute command in session

### interpreter

- `GET /process/interpreter/context` - List all user-created interpreter contexts
- `POST /process/interpreter/context` - Create a new interpreter context
- `DELETE /process/interpreter/context/{id}` - Delete an interpreter context
- `GET /process/interpreter/execute` - Execute code in an interpreter context

### system

- `GET /system/metrics` - Get sandbox resource metrics

### info

- `GET /user-home-dir` - Get user home directory
- `GET /version` - Get version
- `GET /work-dir` - Get working directory

## Daytona Analytics API

Daytona Analytics API - Read-only telemetry and usage data. Authenticated via Daytona API keys or JWT tokens.

- OpenAPI specification: https://www.daytona.io/docs/analytics-openapi.json
- Base URL: `https://analytics.app.daytona.io`

### Telemetry

- `GET /organization/{organizationId}/sandbox/{sandboxId}/telemetry/logs` - Get sandbox logs
- `GET /organization/{organizationId}/sandbox/{sandboxId}/telemetry/metrics` - Get sandbox metrics
- `GET /organization/{organizationId}/sandbox/{sandboxId}/telemetry/traces` - Get sandbox traces
- `GET /organization/{organizationId}/sandbox/{sandboxId}/telemetry/traces/{traceId}` - Get trace spans

### Usage

- `GET /organization/{organizationId}/sandbox/{sandboxId}/usage` - Get sandbox usage periods
- `GET /organization/{organizationId}/usage/aggregated` - Get aggregated usage
- `GET /organization/{organizationId}/usage/chart` - Get usage chart data
- `GET /organization/{organizationId}/usage/sandbox` - Get per-sandbox usage