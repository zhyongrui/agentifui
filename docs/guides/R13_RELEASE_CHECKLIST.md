# R13 Release Checklist

This checklist is the repeatable release path for the current Phase 1 stack.

## Before Deploy

1. Pull the latest `main` onto the server checkout.
2. Confirm the runtime env file is in place:
   - `/etc/agentifui/agentifui.env`
   - start from [.env.production.example](/home/bistu/zyr/pros/agentifui/.env.production.example)
3. Install dependencies and build:
   - `npm ci`
   - `npm run build`
4. Validate the database migration path:
   - `DATABASE_URL=... npm run db:migrate`

## Ingress

1. For plain HTTP bootstrap, use [agentifui.conf](/home/bistu/zyr/pros/agentifui/deploy/nginx/agentifui.conf).
2. For the stable public entry, use [agentifui-https.conf](/home/bistu/zyr/pros/agentifui/deploy/nginx/agentifui-https.conf).
3. Run:
   - `nginx -t`
   - `systemctl reload nginx`
4. Verify `/api/gateway/*` stays same-origin under the public host.

## TLS

1. Point DNS at the server before requesting a certificate.
2. Bootstrap the certificate:
   - `certbot certonly --webroot -w /var/www/certbot -d agentifui.example.com`
3. Verify renewal:
   - `certbot renew --dry-run`
4. Confirm the timer exists:
   - `systemctl status certbot.timer`

## Process Control

1. Copy the systemd units from [deploy/systemd](/home/bistu/zyr/pros/agentifui/deploy/systemd).
2. Run:
   - `systemctl daemon-reload`
   - `systemctl enable --now agentifui-gateway.service`
   - `systemctl enable --now agentifui-web.service`
3. Verify:
   - `systemctl status agentifui-gateway.service`
   - `systemctl status agentifui-web.service`

## Smoke

Run the HTTP smoke first:

```bash
SMOKE_BASE_URL=https://agentifui.example.com \
SMOKE_EMAIL=smoke@example.net \
SMOKE_PASSWORD=Secure123 \
npm run smoke:deploy
```

Then run the browser smoke:

```bash
PUBLIC_BASE_URL=https://agentifui.example.com \
PUBLIC_SMOKE_EMAIL=smoke@example.net \
PUBLIC_SMOKE_PASSWORD=Secure123 \
PUBLIC_SMOKE_CHAT_PATH=/chat \
npm run smoke:browser
```

Expected outcome:

- `/login` loads over HTTPS
- `/api/gateway/health` returns `200`
- login succeeds without SSO, pending-state or MFA blockers
- `/apps` renders
- `/chat` or a concrete `/chat/:conversationId` route renders

## Rollback

1. `git checkout <last-known-good-tag-or-commit>`
2. `npm ci && npm run build`
3. `systemctl restart agentifui-gateway.service agentifui-web.service`
4. rerun `npm run smoke:deploy`

## Temporary Public Access Fallback

If `80/443` ingress is blocked during investigation, the temporary fallback from prior rounds is still:

```bash
cloudflared tunnel --url http://127.0.0.1:3112 --no-autoupdate
```

This is only for short-lived verification. The stable path remains nginx on `80/443`.
