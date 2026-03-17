# P3-F Secrets And Rotation

This guide is the explicit operating note for `P3-F-06`.

## Secret Inventory

Primary runtime secrets:

- `BETTER_AUTH_SECRET`
- `DATABASE_URL`
- `REDIS_URL`
- runtime provider credentials injected into the gateway process
- any tunnel or DNS API credentials used for public ingress automation

Baseline location:

- `/etc/agentifui/agentifui.env` on systemd hosts
- an equivalent secret store or injected env file for container deployments

## Rotation Rules

Auth/session secret rotation:

1. announce a maintenance window
2. deploy the new secret to web and gateway
3. restart both services together
4. run `npm run smoke:deploy`
5. confirm new logins work and old sessions are treated as expected

Database credential rotation:

1. create the replacement DB user or password
2. update the application secret store
3. restart gateway
4. verify `/api/gateway/health`
5. run `npm run smoke:deploy`
6. revoke the old DB credential

Runtime provider credential rotation:

1. install the new provider credential
2. restart gateway only
3. verify `/api/gateway/health`
4. run a focused workspace/chat smoke
5. revoke the old provider credential

## Verification

Minimum verification after any secret rotation:

- `GET /login`
- `GET /api/gateway/health`
- `POST /api/gateway/auth/login`
- `GET /api/gateway/workspace/apps`
- `POST /api/gateway/workspace/apps/launch`
- `POST /api/gateway/v1/chat/completions`
- `GET /api/gateway/admin/identity`

## Continuity Notes

- rotate gateway-facing secrets before changing public ingress, not during the same step
- when auth secrets rotate, expect old sessions to become invalid unless dual-secret support is added later
- runtime provider rotations should be validated on the same host class used for browser QA because host-specific issues have already shown up in this environment
