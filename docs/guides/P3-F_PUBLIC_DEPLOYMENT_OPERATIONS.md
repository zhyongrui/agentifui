# P3-F Public Deployment Operations

This guide completes `P3-F-01` through `P3-F-10`.

## Stable Public Entry

Primary ingress:

- `nginx` on `80/443`
- web on `127.0.0.1:3112`
- gateway on `127.0.0.1:4214`
- same-origin proxy for `/api/gateway/*`

Reference files:

- [agentifui-production.conf](/home/bistu/zyr/pros/agentifui/deploy/nginx/agentifui-production.conf)
- [agentifui-https.conf](/home/bistu/zyr/pros/agentifui/deploy/nginx/agentifui-https.conf)
- [agentifui.conf](/home/bistu/zyr/pros/agentifui/deploy/nginx/agentifui.conf)

## Emergency Public QA

Temporary browser QA can still use Cloudflare Tunnel:

- config sample: [agentifui-tunnel.example.yml](/home/bistu/zyr/pros/agentifui/deploy/cloudflared/agentifui-tunnel.example.yml)
- start pattern:

```bash
cloudflared tunnel --config deploy/cloudflared/agentifui-tunnel.example.yml run
```

Use this only when `80/443` cannot be changed quickly.

## Process Supervision

Systemd assets:

- [agentifui-web.service](/home/bistu/zyr/pros/agentifui/deploy/systemd/agentifui-web.service)
- [agentifui-gateway.service](/home/bistu/zyr/pros/agentifui/deploy/systemd/agentifui-gateway.service)
- [agentifui.target](/home/bistu/zyr/pros/agentifui/deploy/systemd/agentifui.target)

Container baseline:

- [compose.production.yml](/home/bistu/zyr/pros/agentifui/deploy/docker/compose.production.yml)

## TLS

Baseline:

1. issue with `certbot certonly --webroot`
2. install [agentifui-production.conf](/home/bistu/zyr/pros/agentifui/deploy/nginx/agentifui-production.conf)
3. run `nginx -t`
4. reload nginx
5. verify `certbot renew --dry-run`

## Secrets

Runtime secrets should live in `/etc/agentifui/agentifui.env`, created from [.env.production.example](/home/bistu/zyr/pros/agentifui/.env.production.example).

Rotation expectations:

- auth secret and Better Auth secret: rotate during a planned maintenance window
- database credentials: rotate with parallel DB user or password handoff
- runtime provider credentials: rotate independently and verify `/health` plus smoke deploy

Detailed rotation steps live in [P3-F_SECRETS_ROTATION.md](/home/bistu/zyr/pros/agentifui/docs/guides/P3-F_SECRETS_ROTATION.md).

## Metrics And Alerts

Reference assets:

- [prometheus-agentifui.yml](/home/bistu/zyr/pros/agentifui/deploy/monitoring/prometheus-agentifui.yml)
- [alert-rules.yml](/home/bistu/zyr/pros/agentifui/deploy/monitoring/alert-rules.yml)
- [grafana-agentifui-dashboard.json](/home/bistu/zyr/pros/agentifui/deploy/monitoring/grafana-agentifui-dashboard.json)

## Smoke

Deployment smoke now validates:

- `/login`
- `/api/gateway/health`
- workspace catalog
- workspace launch
- chat completion
- conversation reload
- admin context
- admin identity

Run:

```bash
SMOKE_BASE_URL=https://agentifui.example.com npm run smoke:deploy
```

Optional admin-specific credentials:

```bash
SMOKE_BASE_URL=https://agentifui.example.com \
SMOKE_ADMIN_EMAIL=root-admin@iflabx.com \
SMOKE_ADMIN_PASSWORD=Secure123 \
npm run smoke:deploy
```

## Forward-only Migrations

Operational rule:

- treat migrations as forward-only in normal deploys
- use restore-from-backup for rollback
- only write rollback SQL when a specific production incident demands it

See also [P3-F_FORWARD_ONLY_MIGRATIONS.md](/home/bistu/zyr/pros/agentifui/docs/guides/P3-F_FORWARD_ONLY_MIGRATIONS.md).
