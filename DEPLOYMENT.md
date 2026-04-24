# Deployment

## Target

Production target is **Cloudflare Workers + D1**.

Node [`server.js`](./server.js) exists only as an ephemeral local compatibility server. It does not persist runtime state to local JSON.

## Runtime status in this repo

Current Worker entrypoint: [`worker.js`](./worker.js)

Current Wrangler config: [`wrangler.jsonc`](./wrangler.jsonc)

Current D1 binding:
- `MY_BINDING`

Worker/API surface currently covered in repo:
- `GET /api/health`
- `GET /api/ready`
- `GET /api/version`
- `GET /api/metrics`
- `GET /api/schema`
- `GET /api/snapshot`
- `GET /api/stats`
- `GET /api/agents`
- `GET /api/jobs`
- `GET /api/jobs/:id`
- `GET /api/billing-audits`
- `POST /api/agents`
- `POST /api/agents/import-manifest`
- `POST /api/agents/import-url`
- `POST /api/agents/:id/verify`
- `POST /api/jobs`
- `POST /api/jobs/:id/claim`
- `POST /api/jobs/:id/result`
- `POST /api/agent-callbacks/jobs`
- `GET /auth/x`
- `GET /auth/x/callback`
- `GET /api/connectors/x/status`
- `POST /api/connectors/x/post`
- `POST /api/dev/resolve-job`
- `POST /api/dev/dispatch-retry`
- `POST /api/dev/timeout-sweep`
- `POST /api/seed`

Node-only/local-only extras:
- GitHub OAuth login
- GitHub repo manifest browsing/import

## Deploy blockers in this environment

Deploy was **not executed here** on April 5, 2026.

Exact blocker:
- no Cloudflare credentials are available in this environment
- networked deploy execution is restricted here

The repo is prepared so deploy is the next step once credentials are present.

## Required Cloudflare setup

1. Confirm [`wrangler.jsonc`](./wrangler.jsonc) points at the correct Worker name, assets directory, and D1 binding.
2. Confirm the D1 database exists and `database_id` / `database_name` are correct for the target account.
3. Set GitHub Actions secrets if using CI deploy:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`

## Required X connector setup

If the X Ops Connector should publish posts, configure an X OAuth 2.0 app before deploy:

- callback URL: `https://<production-host>/auth/x/callback`
- scopes: `tweet.read tweet.write users.read offline.access`

Set Worker secrets:

```bash
npx wrangler secret put X_CLIENT_ID
npx wrangler secret put X_CLIENT_SECRET
npx wrangler secret put X_TOKEN_ENCRYPTION_KEY
```

`X_TOKEN_ENCRYPTION_KEY` must be base64 for exactly 32 bytes. `X_CALLBACK_URL` is optional when `PRIMARY_BASE_URL` already resolves to the production host.

## Recommended deploy flow

```bash
npm install
npm run qa:all
npm run qa:worker-api
npm run qa:worker-runs
npx wrangler deploy
```

After deploy, smoke test:

```bash
curl https://<worker-host>/api/health
curl https://<worker-host>/api/ready
curl https://<worker-host>/api/snapshot
curl https://<worker-host>/api/agents
curl https://<worker-host>/api/jobs
```

## D1 schema

Canonical schema files:
- [`migrations/0001_init.sql`](./migrations/0001_init.sql)
- [`lib/storage.js`](./lib/storage.js)

`GET /api/schema` exposes the runtime schema string for verification.

## Release checklist

- validate [`wrangler.jsonc`](./wrangler.jsonc)
- confirm D1 binding exists
- run `npm run qa:all`
- deploy Worker
- smoke test UI asset load plus the API endpoints above
