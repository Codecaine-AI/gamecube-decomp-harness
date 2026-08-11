---
url: "https://www.daytona.io/docs/en/tools/api/#daytona/"
title: "Daytona API Reference"
---

[Skip to content](https://www.daytona.io/docs/en/tools/api/#_top)

# Daytona API Reference

[OpenAPI Specification](https://www.daytona.io/docs/openapi.json)[Toolbox OpenAPI Specification](https://www.daytona.io/docs/toolbox-openapi.json)[Analytics OpenAPI Specification](https://www.daytona.io/docs/analytics-openapi.json)Open

Scalar API Reference

v1.0

OpenAPI 3.0.0

# Daytona

[Daytona Platforms Inc.](mailto:support@daytona.com)

[Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0)

Download OpenAPI Document
yaml

Daytona AI platform API Docs

Server

Server:https://app.daytona.io/api

Client Libraries

Shell

Ruby

Node.js

PHP

Python

MoreSelect from all clients

Shell Curl

## config  (Collapsed)

​Copy link

config Operations

- get/config

Show More

## api-keys  (Collapsed)

​Copy link

api-keys Operations

- post/api-keys
- get/api-keys
- get/api-keys/current
- get/api-keys/{name}
- delete/api-keys/{name}
- delete/api-keys/{userId}/{name}

Show More

## organizations  (Collapsed)

​Copy link

organizations Operations

- get/organizations/invitations
- get/organizations/invitations/count
- post/organizations/invitations/{invitationId}/accept
- post/organizations/invitations/{invitationId}/decline
- post/organizations
- get/organizations
- patch/organizations/{organizationId}/default-region
- get/organizations/{organizationId}
- delete/organizations/{organizationId}
- get/organizations/{organizationId}/usage
- get/organizations/{organizationId}/available-sandbox-classes
- patch/organizations/{organizationId}/quota
- patch/organizations/{organizationId}/quota/{regionId}
- post/organizations/{organizationId}/leave
- post/organizations/{organizationId}/suspend
- post/organizations/{organizationId}/unsuspend
- get/organizations/otel-config/by-sandbox-auth-token/{authToken}
- get/organizations/{organizationId}/otel-config
- put/organizations/{organizationId}/otel-config
- delete/organizations/{organizationId}/otel-config
- post/organizations/{organizationId}/sandbox-default-limited-network-egress
- post/organizations/{organizationId}/preview-warning
- put/organizations/{organizationId}/experimental-config
- post/organizations/{organizationId}/roles
- get/organizations/{organizationId}/roles
- put/organizations/{organizationId}/roles/{roleId}
- delete/organizations/{organizationId}/roles/{roleId}
- get/organizations/{organizationId}/users
- post/organizations/{organizationId}/users/{userId}/access
- delete/organizations/{organizationId}/users/{userId}
- post/organizations/{organizationId}/invitations
- get/organizations/{organizationId}/invitations
- put/organizations/{organizationId}/invitations/{invitationId}
- post/organizations/{organizationId}/invitations/{invitationId}/cancel
- get/regions
- post/regions
- get/regions/{id}
- delete/regions/{id}
- patch/regions/{id}
- post/regions/{id}/regenerate-proxy-api-key
- post/regions/{id}/regenerate-ssh-gateway-api-key
- post/regions/{id}/regenerate-snapshot-manager-credentials

Show More

## users  (Collapsed)

​Copy link

users Operations

- get/users/me
- get/users/account-providers
- post/users/linked-accounts
- delete/users/linked-accounts/{provider}/{providerUserId}
- post/users/mfa/sms/enroll

Show More

## regions  (Collapsed)

​Copy link

regions Operations

- get/shared-regions

Show More

## sandbox  (Collapsed)

​Copy link

sandbox Operations

- get/sandbox
- post/sandbox
- get/sandbox/paginated
- get/sandbox/for-runner
- get/sandbox/{sandboxIdOrName}
- delete/sandbox/{sandboxIdOrName}
- post/sandbox/{sandboxIdOrName}/recover
- post/sandbox/{sandboxIdOrName}/start
- post/sandbox/{sandboxIdOrName}/stop
- post/sandbox/{sandboxIdOrName}/pause
- post/sandbox/{sandboxIdOrName}/resize
- put/sandbox/{sandboxIdOrName}/labels
- put/sandbox/{sandboxId}/state
- post/sandbox/{sandboxIdOrName}/backup
- post/sandbox/{sandboxIdOrName}/snapshot
- post/sandbox/{sandboxIdOrName}/fork
- get/sandbox/{sandboxIdOrName}/forks
- get/sandbox/{sandboxIdOrName}/parent
- get/sandbox/{sandboxIdOrName}/ancestors
- post/sandbox/{sandboxIdOrName}/public/{isPublic}
- get/sandbox/{sandboxId}/signing-key
- post/sandbox/{sandboxId}/signing-key/rotate
- post/sandbox/{sandboxId}/last-activity
- post/sandbox/{sandboxIdOrName}/autostop/{interval}
- post/sandbox/{sandboxIdOrName}/autopause/{interval}
- post/sandbox/{sandboxIdOrName}/ttl/{ttlMinutes}
- post/sandbox/{sandboxIdOrName}/autoarchive/{interval}
- post/sandbox/{sandboxIdOrName}/autodelete/{interval}
- post/sandbox/{sandboxIdOrName}/network-settings
- put/sandbox/{sandboxIdOrName}/secrets
- post/sandbox/{sandboxIdOrName}/archive
- get/sandbox/{sandboxIdOrName}/ports/{port}/preview-url
- get/sandbox/{sandboxIdOrName}/ports/{port}/signed-preview-url
- post/sandbox/{sandboxIdOrName}/ports/{port}/signed-preview-url/{token}/expire
- get/sandbox/{sandboxIdOrName}/build-logs
- get/sandbox/{sandboxIdOrName}/build-logs-url
- post/sandbox/{sandboxIdOrName}/ssh-access
- delete/sandbox/{sandboxIdOrName}/ssh-access
- get/sandbox/ssh-access/validate
- get/sandbox/{sandboxId}/toolbox-proxy-url
- get/sandbox/{sandboxId}/organization
- get/sandbox/{sandboxId}/region-quota
- get/sandbox/{sandboxId}/secrets
- get/sandbox/{sandboxId}/telemetry/logs
- get/sandbox/{sandboxId}/telemetry/traces
- get/sandbox/{sandboxId}/telemetry/traces/{traceId}
- get/sandbox/{sandboxId}/telemetry/metrics

Show More

## runners  (Collapsed)

​Copy link

runners Operations

- post/runners
- get/runners
- get/runners/me
- get/runners/by-sandbox/{sandboxId}
- get/runners/by-snapshot-ref
- get/runners/{id}
- delete/runners/{id}
- get/runners/{id}/full
- patch/runners/{id}/scheduling
- patch/runners/{id}/draining
- post/runners/healthcheck

Show More

## snapshots  (Collapsed)

​Copy link

snapshots Operations

- post/snapshots
- get/snapshots
- get/snapshots/{id}
- delete/snapshots/{id}
- get/snapshots/{id}/build-logs
- get/snapshots/{id}/build-logs-url
- post/snapshots/{id}/activate
- post/snapshots/{id}/deactivate

Show More

## preview  (Collapsed)

​Copy link

preview Operations

- get/preview/{sandboxId}/public
- get/preview/{sandboxId}/preview-warning
- get/preview/{sandboxId}/validate/{authToken}
- get/preview/{sandboxId}/signing-key
- get/preview/{sandboxId}/access
- get/preview/{signedPreviewToken}/{port}/sandbox-id

Show More

## volumes  (Collapsed)

​Copy link

volumes Operations

- get/volumes
- post/volumes
- get/volumes/{volumeId}
- delete/volumes/{volumeId}
- get/volumes/by-name/{name}

Show More

## jobs  (Collapsed)

​Copy link

jobs Operations

- get/jobs
- get/jobs/poll
- get/jobs/{jobId}
- post/jobs/{jobId}/status

Show More

## warm-pools  (Collapsed)

​Copy link

warm-pools Operations

- get/warm-pools
- post/warm-pools
- patch/warm-pools/{id}
- delete/warm-pools/{id}

Show More

## docker-registry  (Collapsed)

​Copy link

docker-registry Operations

- post/docker-registry
- get/docker-registry
- get/docker-registry/registry-push-access
- get/docker-registry/{id}
- patch/docker-registry/{id}
- delete/docker-registry/{id}

Show More

## secret  (Collapsed)

​Copy link

secret Operations

- post/secret
- get/secret
- get/secret/paginated
- get/secret/{secretId}
- patch/secret/{secretId}
- delete/secret/{secretId}

Show More

## admin  (Collapsed)

​Copy link

admin Operations

- post/admin/runners
- get/admin/runners
- get/admin/runners/{id}
- delete/admin/runners/{id}
- patch/admin/runners/{id}/scheduling
- post/admin/sandbox/{sandboxId}/recover
- post/admin/users
- get/admin/users
- post/admin/users/{id}/regenerate-key-pair
- get/admin/users/{id}
- post/admin/webhooks/organizations/{organizationId}/send
- get/admin/webhooks/organizations/{organizationId}/messages/{messageId}/attempts
- get/admin/webhooks/status
- post/admin/webhooks/organizations/{organizationId}/initialize
- post/admin/docker-registry/{id}/set-default
- get/admin/snapshots/can-cleanup-image
- patch/admin/snapshots/{id}/general
- get/admin/audit
- post/admin/organizations
- post/admin/organizations/{organizationId}/quota/{regionId}
- patch/admin/organizations/{organizationId}/quota/{regionId}
- get/admin/organizations/{organizationId}/quota/{regionId}/{sandboxClass}
- delete/admin/organizations/{organizationId}/quota/{regionId}/{sandboxClass}
- post/admin/organizations/{organizationId}/preview-warning

Show More

## webhooks  (Collapsed)

​Copy link

webhooks Operations

- post/webhooks/organizations/{organizationId}/app-portal-access
- get/webhooks/organizations/{organizationId}/initialization-status
- post/webhooks/organizations/{organizationId}/initialize
- post/webhooks/organizations/{organizationId}/refresh-endpoints

Show More

## audit  (Collapsed)

​Copy link

audit Operations

- get/audit/organizations/{organizationId}

Show More

## object-storage  (Collapsed)

​Copy link

object-storage Operations

- get/object-storage/push-access

Show More

## Health  (Collapsed)

​Copy link

Health Operations

- get/health
- get/health/ready

Show More

## Models

Show More

Show sidebar

GET

Server: https://app.daytona.io/api

/config

Copy URL

Send Send get request to https://app.daytona.io/api/config

GET

Copy URLSend Send get request to https://app.daytona.io/api/config

Close Client

Get config

AllAuthCookiesHeadersQuery

All

## Authentication  (Collapsed)

Select Auth Type

## Variables

| Enabled | Key | Value |
| --- | --- | --- |

## Cookies

| Enabled | Key | Value |
| --- | --- | --- |
|  |  |  |

## Headers

| Enabled | Key | Value |
| --- | --- | --- |
|  | accept | application/json |
|  |  |  |

## Query Parameters

| Enabled | Key | Value |
| --- | --- | --- |
|  |  |  |

## Request Body

No Body

| None |
| --- |

## Code Snippet (Collapsed)

Shell Curl

Response

AllCookiesHeadersBody

All

[Powered By Scalar.com](https://www.scalar.com/)

.,,uod8B8bou,,. ..,uod8BBBBBBBBBBBBBBBBRPFT?l!i:. \|\|\|\|\|\|\|\|\|\|\|\|\|\|!?TFPRBBBBBBBBBBBBBBB8m=, \|\|\|\| '""^^!!\|\|\|\|\|\|\|\|\|\|TFPRBBBVT!:...! \|\|\|\| '""^^!!\|\|\|\|\|?!:.......! \|\|\|\| \|\|\|\|.........! \|\|\|\| \|\|\|\|.........! \|\|\|\| \|\|\|\|.........! \|\|\|\| \|\|\|\|.........! \|\|\|\| \|\|\|\|.........! \|\|\|\| \|\|\|\|.........! \|\|\|\|, \|\|\|\|.........\` \|\|\|\|\|!!-.\_ \|\|\|\|.......;. ':!\|\|\|\|\|\|\|\|\|!!-.\_ \|\|\|\|.....bBBBBWdou,. bBBBBB86foi!\|\|\|\|\|\|\|!!-..:\|\|\|!..bBBBBBBBBBBBBBBY! ::!?TFPRBBBBBB86foi!\|\|\|\|\|\|\|\|!!bBBBBBBBBBBBBBBY..! :::::::::!?TFPRBBBBBB86ftiaabBBBBBBBBBBBBBBY....! :::;\`"^!:;::::::!?TFPRBBBBBBBBBBBBBBBBBBBY......! ;::::::...''^::::::::::!?TFPRBBBBBBBBBBY........! .ob86foi;::::::::::::::::::::::::!?TFPRBY..........\` .b888888888886foi;:::::::::::::::::::::::..........\` .b888888888888888888886foi;::::::::::::::::...........b888888888888888888888888888886foi;:::::::::......\`!Tf998888888888888888888888888888888886foi;:::....\` '"^!\|Tf9988888888888888888888888888888888!::..\` '"^!\|Tf998888888888888888888888889!! '\` '"^!\|Tf9988888888888888888!!\` iBBbo. '"^!\|Tf998888888889!\` WBBBBbo. '"^!\|Tf9989!\` YBBBP^' '"^!\` \`

Send Request

ctrlControl

↵Enter