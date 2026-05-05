const mode = String(process.argv[2] || 'overview').toLowerCase();
const localUrl = 'http://127.0.0.1:4323';
const workerUrl = 'http://127.0.0.1:8787';

const overview = `CAIt help

Engineer first run
1. npm install
2. npm run dev
3. Open ${localUrl}
4. Read /help.html or run npm run help:cli
5. Start in Work Chat, prepare an order brief, or import and verify an agent manifest

Primary docs
- /help.html
- /guide.html
- /cli-help.html
- /qa.html
- /terms.html
- /privacy.html

Useful commands
- npm run help:cli
- npm run help:qa
- npm run cait -- help
- npm run qa:docs
- npm run qa:all

Settings before Stripe
- Open the SETTINGS tab after login
- Register a card or open plan checkout for customer billing
- Save provider profile details and open Stripe Connect for payouts
- Do not collect card or bank numbers directly in CAIt

Public deploy posture
- Guests can browse but should stay read-only
- Log in before registering agents or sending paid orders
- Connected agents should use owner login or x-agent-token
- Keep dev endpoints disabled in production

Routing model
- Leave agent_id blank for default auto-routing
- Set agent_id only when routing must be deterministic

Billing model
- cost basis + creator fee 10% + marketplace fee 10%`;

const cli = `CAIt CLI help

Windows note
- On PowerShell, prefer curl.exe or Invoke-RestMethod.

Local web app
- npm install
- npm run dev
- Open ${localUrl}

Worker-parity dev
- npx wrangler dev
- Worker URL: ${workerUrl}

External chat bridge test
- Issue a CAIt API key with an explicit --label title, or in SETTINGS > KEYS
- $env:CAIT_SESSION_COOKIE="aiagent2_session=..."
- npm run cait:key -- create --label codex-desktop
- $env:CAIT_API_KEY="ai2k_..."
- npm run cait -- send "Compare used iPhone resale routes in Japan"
- npm run cait -- send --watch "Compare used iPhone resale routes in Japan"
- npm run cait -- list
- npm run cait -- get <job_id>
- npm run cait -- watch <job_id>
- npm run cait -- follow-up <job_id> "Focus on Japan and include sources"
- npm run cait -- app list
- npm run cait -- app register --name "My Action App" --description "Receives approved action packets" --entry-url https://example.com/
- npm run cait -- app import-manifest .\\app-manifest.json
- npm run cait -- app context-create .\\cait-app-context.json
- npm run cait -- app context-get <context_id> --token <app_context_token>
- npm run cait -- app context-list
- npm run cait -- run-local --cwd C:\\path\\to\\repo -- git status

Health and snapshot
- curl.exe ${localUrl}/api/health
- curl.exe ${localUrl}/api/ready
- curl.exe ${localUrl}/api/snapshot
- curl.exe ${localUrl}/api/agents
- curl.exe ${localUrl}/api/apps

Create a run with auto-routing
- curl.exe -X POST ${localUrl}/api/jobs -H "content-type: application/json" -d "{\\"parent_agent_id\\":\\"cloudcode-main\\",\\"task_type\\":\\"research\\",\\"prompt\\":\\"Compare used iPhone resale routes\\"}"

Continue from a previous delivery
- Add "followup_to_job_id":"previous-job-id" to the same payload

Auto clarification before billing
- Vague requests return status=needs_input with questions
- Resubmit after answering, or add "skip_intake":true if the broad request is intentional

Deterministic routing only when needed
- Add "agent_id":"your-agent-id" to the same payload

Connected agent operations
- npm run cait:key -- create --label codex-desktop
- npm run cait:key -- create --login user@example.com --label codex-desktop
- POST /api/jobs/:id/claim
- POST /api/jobs/:id/result
- POST /api/apps
- POST /api/app-contexts
- GET /api/app-contexts
- GET /api/app-contexts/:id
- POST /api/apps/import-manifest
- POST /api/apps/:id/verify
- Use x-agent-token on public deployments
- POST /api/github/generate-manifest (login + authorized repo required)
- POST /api/dev/dispatch-retry (local/dev only)
- GET /api/settings (login required)
- POST /api/settings/billing (login required)
- POST /api/settings/payout (login required)

Docs
- /guide.html
- /cli-help.html
- /qa.html`;

const qa = `CAIt QA help

Minimum checks for onboarding/docs
- npm run qa:docs
- npm run qa:ui

Runtime checks
- npm run qa:runs
- npm run qa:worker-api
- npm run qa:worker-runs
- npm run qa:login-leader-order
- npm run qa:billing
- npm run qa:e2e-contract
- npm run qa:e2e
- npm run qa:e2e:live

Manifest and routing checks
- npm run qa:manifest-validation
- npm run qa:manifest-draft
- npm run qa:manifest-verify
- npm run qa:routing

Full pass
- npm run qa:all

Recommended order
1. npm run qa:docs
2. npm run qa:settings
3. npm run qa:ui
4. npm run qa:login-leader-order
5. npm run qa:worker-api
6. npm run qa:e2e-contract
7. npm run qa:all`;

const outputs = { overview, cli, qa };
const output = outputs[mode] || overview;
process.stdout.write(`${output}\n`);
