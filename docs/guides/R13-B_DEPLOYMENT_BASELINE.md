# R13-B Deployment Baseline

This document turns the current temporary browser-access setup into a repeatable production ingress baseline.

## Topology

- `nginx` listens on `80/443`
- Next.js web listens on `127.0.0.1:3112`
- Gateway listens on `127.0.0.1:4214`
- browser traffic uses one public origin
- `/api/gateway/*` is reverse-proxied to the gateway process

## Why This Exists

Earlier manual browser rounds used:

- direct server access to `http://121.194.33.60:3112`
- or `cloudflared tunnel --url http://127.0.0.1:3112 --no-autoupdate`

That was acceptable for temporary verification, but not for a stable public entry. The files in `deploy/` are the first stable baseline for `R13-B1` and `R13-B4`.

## Nginx

Reference config:

- [deploy/nginx/agentifui.conf](/home/bistu/zyr/pros/agentifui/deploy/nginx/agentifui.conf)

Important details:

- keep `/` pointed at `127.0.0.1:3112`
- keep `/api/gateway/` pointed at `127.0.0.1:4214`
- leave `proxy_buffering off` for `/api/gateway/` so chat streaming stays responsive
- preserve upgrade headers because Next and future gateway paths may use long-lived connections

After placing the file in `/etc/nginx/sites-available/agentifui.conf`, the expected flow is:

1. symlink into `/etc/nginx/sites-enabled/`
2. run `nginx -t`
3. reload `nginx`
4. add TLS separately, then switch the server block to `listen 443 ssl http2`

## Systemd

Reference units:

- [deploy/systemd/agentifui-gateway.service](/home/bistu/zyr/pros/agentifui/deploy/systemd/agentifui-gateway.service)
- [deploy/systemd/agentifui-web.service](/home/bistu/zyr/pros/agentifui/deploy/systemd/agentifui-web.service)

Expected host prerequisites:

- repo checked out at `/home/bistu/zyr/pros/agentifui`
- `npm install` already completed
- production build already generated
- `/etc/agentifui/agentifui.env` contains the runtime env vars

Recommended enable flow:

1. copy the two unit files into `/etc/systemd/system/`
2. adjust `User=` and `WorkingDirectory=` if the host differs
3. run `systemctl daemon-reload`
4. run `systemctl enable --now agentifui-gateway.service`
5. run `systemctl enable --now agentifui-web.service`
6. verify `systemctl status agentifui-gateway.service agentifui-web.service`

## Runtime Checks

Minimum post-deploy smoke:

1. `curl http://127.0.0.1:4214/health`
2. `curl -I http://127.0.0.1:3112/login`
3. `curl -I https://agentifui.example.com/login`
4. in a browser, log in and open `/chat`
5. verify `/api/gateway/workspace/apps` and `/api/gateway/workspace/conversations` both return `200`

## Known Boundaries

- TLS certificate automation is still the next step after this baseline
- the current unit files use `npm run start --workspace ...` for clarity, not a pinned absolute node path
- the current env-file path is a convention and may need adjustment per host
- if root access is unavailable, the fallback remains the temporary Cloudflare quick tunnel noted in the dev-log
