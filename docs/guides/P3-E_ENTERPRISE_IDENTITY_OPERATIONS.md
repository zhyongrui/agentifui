# P3-E Enterprise Identity Operations

This guide captures the new enterprise-governance surfaces added in `P3-E-01` through `P3-E-10`.

## Scope

- domain-claim submission and root-admin review
- pending access review queues for SSO JIT users
- tenant-admin MFA reset
- break-glass session creation and revocation
- tenant governance state:
  - legal hold
  - retention overrides
  - SCIM planning hooks
  - policy-pack settings for runtime, sharing and artifact download

## Main Surfaces

- browser UI: `/admin/identity`
- read API: `GET /admin/identity`
- mutations:
  - `POST /admin/identity/domain-claims`
  - `PUT /admin/identity/domain-claims/:claimId/review`
  - `PUT /admin/identity/access-requests/:requestId/review`
  - `PUT /admin/identity/users/:userId/mfa/reset`
  - `POST /admin/identity/break-glass`
  - `PUT /admin/identity/break-glass/:sessionId`
  - `PUT /admin/identity/governance`

## SSO Domain Claims

Flow:

1. tenant admin or root admin creates a domain claim
2. root admin approves the claim
3. `/auth/sso/discovery` starts returning the approved provider
4. `/auth/sso/callback` provisions JIT users into the claimed tenant
5. if `jitUserStatus = pending`, an access-request row is created automatically

## Access Review Queue

Each pending access row can be:

- approved: user becomes `active`
- rejected: user becomes `suspended`
- transferred: pending user is moved to another tenant, along with auth rows and seeded roles/group memberships

## MFA Recovery

`PUT /admin/identity/users/:userId/mfa/reset` disables active MFA factors and consumes pending MFA login challenges.

Root-admin note:

- `/admin/identity` now scopes the MFA reset picker to the selected tenant by querying `/admin/users?tenantId=...`

## Break-glass

Break-glass is currently a governed audit object, not an impersonation feature.

- create: root admin only
- revoke: root admin only
- active sessions auto-expire when `/admin/identity` is queried and `expires_at < now()`

## Governance Metadata

Tenant governance is stored in `tenants.metadata.governance`.

Current fields:

- `legalHoldEnabled`
- `retentionOverrideDays`
- `scimPlanning.enabled`
- `scimPlanning.ownerEmail`
- `scimPlanning.notes`
- `policyPack.runtimeMode`
- `policyPack.sharingMode`
- `policyPack.artifactDownloadMode`

Current enforcement:

- `policyPack.sharingMode` caps new share creation and shared comment/editor actions
- `policyPack.artifactDownloadMode = owner_only` blocks shared artifact downloads while keeping preview access readable
- `retentionOverrideDays` extends cleanup windows across archived conversations, shares, run timeline, and stale knowledge sources
- `legalHoldEnabled` turns cleanup into a no-op retention window for that tenant

## Audit Coverage

New audit actions:

- `auth.access_request.created`
- `admin.identity.domain_claim.created`
- `admin.identity.domain_claim.reviewed`
- `admin.identity.access_request.reviewed`
- `admin.identity.mfa.reset`
- `admin.identity.break_glass.created`
- `admin.identity.break_glass.revoked`
- `admin.identity.governance.updated`

## Validation Notes

- the most important end-to-end test is [auth-domain-claims.test.ts](/home/bistu/zyr/pros/agentifui/apps/gateway/src/routes/auth-domain-claims.test.ts)
- the browser/admin surface entry is [identity/page.tsx](/home/bistu/zyr/pros/agentifui/apps/web/src/app/admin/identity/page.tsx)
