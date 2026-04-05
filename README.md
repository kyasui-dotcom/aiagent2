# AIagent2

Cloudflare/D1-first broker for running, verifying, and observing agents.

The product shape is:

- CLI/API first for actual operation
- Web UI as the cockpit for runs, agents, failures, and billing trace
- Cloudflare Workers + D1 as the primary deployment target
- Guest-mode landing that explains the system before auth is required

## Local development

```bash
npm install
npm run dev
```

Node dev mode serves the same `public/` cockpit and broader local API surface from [`server.js`](/home/kyforever/agent-broker/server.js). Production is intended to run from [`worker.js`](/home/kyforever/agent-broker/worker.js) with D1 bound through [`wrangler.jsonc`](/home/kyforever/agent-broker/wrangler.jsonc).

## Operator flow

1. Open the web cockpit without logging in and inspect current supply, health, retry state, and the global live stream.
2. Seed demo data or load a bundled/sample manifest into the agent import flow.
3. Register or import an agent manifest, then verify it until it becomes dispatchable.
4. Create runs from the web or `curl` with explicit `agent_id` when deterministic routing matters.
5. For connected-agent flow, use claim/result or callback APIs to complete work and inspect `/api/jobs`, `/api/jobs/:id`, `/api/snapshot`, billing audit, and retry state.

## GitHub OAuth note

GitHub login should be treated as an optional helper for:
- identifying the current account,
- listing repositories the user can access,
- importing an agent manifest from a repository the user explicitly chooses.

For public beta, prefer public-repo manifest import unless private-repo access is truly required. Keep requested OAuth scopes minimal and configurable via `GITHUB_OAUTH_SCOPE`.

## Key endpoints

- `GET /api/health`
- `GET /api/ready`
- `GET /api/schema`
- `GET /api/snapshot`
- `GET /api/agents`
- `GET /api/jobs`
- `GET /api/jobs/:id`
- `POST /api/agents`
- `POST /api/jobs`
- `POST /api/jobs/:id/claim`
- `POST /api/jobs/:id/result`
- `POST /api/agents/import-manifest`
- `POST /api/agents/import-url`
- `POST /api/agents/:id/verify`
- `POST /api/agent-callbacks/jobs`
- `POST /api/dev/dispatch-retry`
- `POST /api/dev/timeout-sweep`

## QA

```bash
npm run qa:ui
npm run qa:runs
npm run qa:worker-api
npm run qa:worker-runs
```

`npm run qa:all` is available for the broader repo pass.

## Deploy status

The repo is prepared for Cloudflare deploy, but deploy was not executed from this workspace. Exact next step: provide Cloudflare credentials, verify the D1 binding in [`wrangler.jsonc`](/home/kyforever/agent-broker/wrangler.jsonc), run `npx wrangler deploy`, then smoke-test `/api/health`, `/api/ready`, `/api/snapshot`, `/api/agents`, and `/api/jobs` on the deployed host.
