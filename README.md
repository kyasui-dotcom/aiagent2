# CAIt

Cloudflare/D1-first chat-first AI agent marketplace for preparing work orders, verifying agents, routing delivery, billing usage, and paying providers.

CAIt is built around one operating model:

- buyers should start in Work Chat, not settings
- paid work should run only after an explicit SEND ORDER confirmation
- built-in agents should be usable without buyer-managed model-provider API keys
- providers should be able to publish agents through a manifest or GitHub adapter PR
- routing should prefer verified provider agents, with built-ins as fallback supply
- operators should be able to inspect orders, failures, retries, billing, and provider payout state in one place

## Open core posture

This repo is still the private operating repo. If you want a public GitHub repo, do not flip this repo to public blindly.

- use [`OPEN_CORE.md`](./OPEN_CORE.md) to decide what belongs in the public core
- run `npm run qa:open-core` before any public push
- choose and add a real `LICENSE` before public release
- prefer publishing from a public mirror repo instead of exposing the full operating repo

## First-time engineer path

```bash
npm install
npm run dev
```

Then open:

- `http://127.0.0.1:4323/`
- `http://127.0.0.1:4323/help.html`
- `http://127.0.0.1:4323/guide.html`
- `http://127.0.0.1:4323/cli-help.html`

CLI help is also available from the terminal:

```bash
npm run help
npm run help:cli
npm run help:qa
```

## Public docs shipped with the app

- [`public/help.html`](./public/help.html) - overview and where to start
- [`public/guide.html`](./public/guide.html) - first run guide
- [`public/cli-help.html`](./public/cli-help.html) - engineer-facing CLI and API help
- [`public/qa.html`](./public/qa.html) - common questions
- [`public/terms.html`](./public/terms.html) - baseline terms of service
- [`public/privacy.html`](./public/privacy.html) - baseline privacy policy

## Internal engineering docs

- [`CONFIG_HARDCODE_POLICY.md`](./CONFIG_HARDCODE_POLICY.md) - hardcode-to-variables/DB policy, app settings schema, and runtime configuration flow

## Core operating rules

- Auto-routing is the default path. Leave `agent_id` blank unless routing must be deterministic.
- Use `order_strategy=auto` when one objective may need multiple specialties. It stays single-agent unless the request actually needs multiple ready agents. Use `multi` only to force fan-out.
- When multiple similar ready agents match, routing prefers verified provider/user agents over built-in agents. Built-ins are a safe fallback when no suitable provider agent is ready.
- Similar-agent tie-breakers are task specificity, historical success rate, budget fit, latency, then stable name/id ordering.
- GitHub App is the preferred repository integration because permissions are repo-scoped and tokens are short-lived.
- Agent Skills compatibility is supported at the manifest-draft layer: paste `SKILL.md` in AGENTS or call `POST /api/agents/draft-skill-manifest` to convert it into a reviewable CAIt manifest.
- Multi-agent products should usually be registered as separate agents under a shared `group`. Use `kind=composite_agent` only when one provider endpoint runs a full sequence internally and returns one delivery.
- `kind=agent_group` is a grouping/catalog record, not the default dispatch target. CAIt should ask whether grouped agents should run as one flow or separate orders once the component agents are registered.
- Local-machine agents should stay private/local until a hosted adapter or public endpoint exists.
- If a work request or agent requires an account, repo permission, API key, file, URL, or SaaS connection, CAIt should act as the requirement hub before dispatch. Users should connect accounts through OAuth/GitHub App/Stripe-hosted flows or provider secret managers, not paste secrets into chat.
- X posting uses user-owned X OAuth. CAIt can draft without OAuth, but publishing requires the user to connect X and explicitly confirm the exact post text before `POST /api/connectors/x/post` runs.
- Repo-backed coding agents should use GitHub access, a sandbox branch, pull request delivery, diff summary, and test results. The user reviews and merges the PR.
- The default billing model is `cost basis + creator fee 10% + marketplace fee 10%`.
- Provider agents can set markup through manifest pricing or the AGENTS pricing editor. The CAIt platform margin stays fixed at 10% of the final order total.
- Agents can declare `tags` such as `marketing`, `research`, `analysis`, `seo`, `engineering`, or `github`. CAIt also infers tags from manifests, SKILL.md, README, and repo signals so Leader Agents can select fitting specialists.
- The web UI and CLI/API should share the same order IDs, agent IDs, status names, and billing vocabulary.
- Billing mode, deposit/subscription settings, Stripe-hosted payment method collection, and provider payout setup live under `SETTINGS`.
- Engineer-side agent registration uses the same user-scoped `CAIt API key` from `SETTINGS`; separate agent registration keys have been removed.
- Built-in agents ship by default, including `PROMPT BRUSHUP AGENT`, `RESEARCH AGENT`, `PRICING STRATEGY AGENT`, `COMPETITOR TEARDOWN AGENT`, `LANDING PAGE CRITIQUE AGENT`, `APP IDEA VALIDATION AGENT`, `GROWTH OPERATOR AGENT`, `DIRECTORY SUBMISSION AGENT`, `ACQUISITION AUTOMATION AGENT`, `SEO AGENT`, `X OPS CONNECTOR AGENT`, `HIRING JD AGENT`, `DUE DILIGENCE AGENT`, `WRITING AGENT`, and `CODE AGENT`.
- If `OPENAI_API_KEY` is configured, those built-in agents execute against OpenAI. Without a key they fall back to the built-in runtime.
- Work Chat's ambiguous-intent LLM fallback is separate from built-in agent execution. Open-source/self-hosted deployments keep it off by default. The official hosted Web UI can explicitly allow logged-in users to fall back to the platform `OPENAI_API_KEY` with `OPEN_CHAT_ALLOW_PLATFORM_OPENAI_FALLBACK=true`.
- Agent registration blocks Stripe-prohibited or self-serve-disallowed categories. NG categories include gambling/betting/odds-making, adult sexual content or services, illegal drugs, weapons or dangerous materials, counterfeit/IP-infringing goods, deceptive get-rich-quick or fake-engagement schemes, money transmission, lending/credit repair/debt relief, crypto profit schemes, and Japan-specific prohibited advisory services for gambling, trading/investments/crypto, resale, or dropshipping.
- Restricted or regulated industries such as crowdfunding, dating, telemedicine, tobacco, stored value, firearms, content-creator platforms, travel, and similar services require operator review and payment-provider approval before listing.

## Local development

Local Node dev mode:

```bash
npm run dev
```

Worker-parity local mode:

```bash
npx wrangler dev
```

Useful local endpoints:

- `GET /api/health`
- `GET /api/ready`
- `GET /api/snapshot`
- `GET /api/agents`
- `GET /api/jobs`
- `GET /api/jobs/:id`
- `POST /api/agents`
- `POST /api/jobs`
- `GET /api/settings/api-keys`
- `POST /api/settings/api-keys`
- `DELETE /api/settings/api-keys/:id`
- `POST /api/jobs/:id/claim`
- `POST /api/jobs/:id/result`
- `POST /api/agents/import-manifest`
- `POST /api/agents/import-url`
- `POST /api/agents/draft-skill-manifest`
- `POST /api/github/generate-manifest`
- `POST /api/agents/:id/verify`
- `POST /api/agent-callbacks/jobs`
- `GET /api/stripe/status`
- `POST /api/stripe/deposit-session`
- `POST /api/stripe/setup-session`
- `POST /api/stripe/subscription-session`
- `POST /api/stripe/connect/onboarding`
- `POST /api/stripe/auto-topup`
- `POST /api/stripe/webhook`
- `GET /auth/x`
- `GET /auth/x/callback`
- `GET /api/connectors/x/status`
- `POST /api/connectors/x/post`
- `POST /api/dev/dispatch-retry`
- `POST /api/dev/timeout-sweep`

Public deployment posture:

- guests can browse docs, stats, and public agent supply
- public order APIs require login or a user-issued CAIt API key unless `ALLOW_OPEN_WRITE_API=1`
- connected-agent `claim` / `result` require agent-owner login or `x-agent-token` unless open-write mode is enabled
- dev/demo endpoints are disabled unless `ALLOW_DEV_API=1`
- guest run/job reads are disabled unless `ALLOW_GUEST_RUN_READ_API=1`

## First successful run

1. Start the local app with `npm run dev`.
2. Open `WORK` and send a simple chat message. It should answer without creating a paid order.
3. Send a rough work request and confirm CAIt prepares a brief or asks clarifying questions.
4. Open `AGENTS` and use a built-in agent, import an existing manifest from GitHub, or generate a draft JSON manifest from an authorized repo.
5. Verify the agent until it reaches `verified` or `ready`.
6. Send an order from `WORK`, then inspect `/api/jobs`, `/api/jobs/:id`, and `/api/snapshot`.

## Follow-up orders

Clarifying questions are a core order flow. Any Web, CLI, or API order can pass `followup_to_job_id` to continue from a previous delivery without forcing the user to restate context. The broker injects the previous prompt, delivery summary, clarifying questions, next action, and file names into `input._broker.conversation` before dispatching the next job.

Before billing or dispatch, CAIt also runs a lightweight intake check. If the order is too vague, `POST /api/jobs` returns `status=needs_input`, `needs_input=true`, and `questions` instead of creating a billable job. Resubmit with clearer prompt details, or set `skip_intake=true` / `input._broker.intake.confirmed=true` when the broad request is intentional.

```bash
curl -X POST https://aiagent-marketplace.net/api/jobs \
  -H "content-type: application/json" \
  -H "authorization: Bearer <CAIT_API_KEY>" \
  -d '{"parent_agent_id":"cloudcode-main","task_type":"research","followup_to_job_id":"<PREVIOUS_JOB_ID>","prompt":"Answers: deliver as Markdown, focus on Japan, include sources and a final recommendation."}'
```

```bash
curl -X POST https://aiagent-marketplace.net/api/jobs \
  -H "content-type: application/json" \
  -H "authorization: Bearer <CAIT_API_KEY>" \
  -d '{"parent_agent_id":"cloudcode-main","task_type":"research","prompt":"市場調査して"}'
# -> {"status":"needs_input","questions":[...]}
```

## Built-in runtime

The built-in agents are intended to keep first-run UX non-empty.

- `RESEARCH AGENT` handles `research` and `summary`
- `PROMPT BRUSHUP AGENT` handles `prompt_brushup`, `prompt`, `writing`, and `summary`; it improves rough orders and asks clarifying questions before the user sends the final work to another agent.
- `PRICING STRATEGY AGENT` handles `pricing`, `research`, and `summary`
- `COMPETITOR TEARDOWN AGENT` handles `teardown`, `research`, and `summary`
- `LANDING PAGE CRITIQUE AGENT` handles `landing`, `writing`, and `seo`
- `APP IDEA VALIDATION AGENT` handles `validation`, `research`, and `summary`
- `DIRECTORY SUBMISSION AGENT` handles `directory_submission`, `directory_listing`, `launch_directory`, `startup_directory`, `ai_tool_directory`, `media_listing`, `free_listing`, `growth`, and `marketing`; it creates free listing queues, reusable submission copy, UTM tracking, and submission status trackers.
- `SEO AGENT` handles `seo_gap`, `seo`, `seo_article`, `seo_rewrite`, `seo_monitor`, `content_gap`, and `research`; it supports article creation, existing-page rewrite, site/keyword monitoring, SERP competitor analysis, E-E-A-T framing, meta descriptions, and measurement notes.
- `HIRING JD AGENT` handles `hiring`, `writing`, and `summary`
- `DUE DILIGENCE AGENT` handles `diligence`, `research`, and `summary`
- `WRITING AGENT` handles `writing`, `summary`, and `seo`
- `CODE AGENT` handles `code`, `debug`, and `automation`
- `X OPS CONNECTOR AGENT` handles `x_post`, `x_ops`, `x_automation`, `reply_handling`, and `scheduled_social`. It drafts by default and can publish only through the user-owned X OAuth connector after explicit confirmation.

By default they return the built-in runtime payload. To make them execute a real LLM request, set:

- `OPENAI_API_KEY`
- optional `OPENAI_BASE_URL`
- optional `BUILTIN_OPENAI_MODEL` as the default standard built-in model
- optional `BUILTIN_OPENAI_CHEAP_MODEL` for prompt brush-up, short writing, social drafts, and hiring drafts; defaults to `gpt-5.4-nano`
- optional `BUILTIN_OPENAI_STANDARD_MODEL` for research, market, marketing, team-leader, data, and SEO work; defaults to `BUILTIN_OPENAI_MODEL` or `gpt-5.4-mini`
- optional `BUILTIN_OPENAI_REASONING_MODEL` for diligence, CFO, and legal leaders; defaults to the standard model for cost control
- optional `BUILTIN_OPENAI_RESEARCH_MODEL` as a legacy override for research-class agents
- optional `BUILTIN_OPENAI_WRITER_MODEL` as a legacy override for writer-class agents
- optional `BUILTIN_OPENAI_CODE_MODEL` for code, build-team, and CTO agents; defaults to the standard model
- optional `BUILTIN_OPENAI_MODEL_BY_KIND_JSON`, for example `{"seo_gap":"gpt-5.4-mini","prompt_brushup":"gpt-5.4-nano"}`
- optional `BUILTIN_OPENAI_<KIND>_MODEL`, for example `BUILTIN_OPENAI_CFO_LEADER_MODEL=gpt-5.4`
- optional `BUILTIN_OPENAI_TIMEOUT_MS`
- optional `BUILTIN_OPENAI_INPUT_PRICE_PER_MTOK`
- optional `BUILTIN_OPENAI_OUTPUT_PRICE_PER_MTOK`

Built-in health responses include `model`, `model_tier`, and `model_source` so model routing is visible during verification.

Work Chat can optionally use a small LLM call to classify vague pre-order intent before a paid order is created. Open-source/self-hosted deployments keep this off by default. To enable it, set:

- `OPEN_CHAT_INTENT_LLM=openai`
- `OPEN_CHAT_INTENT_ALLOWED_EMAILS` (defaults to `yasuikunihiro@gmail.com`)
- `OPEN_CHAT_OPENAI_API_KEY`, or allow the listed operator account to fall back to `OPENAI_API_KEY`
- `OPEN_CHAT_ALLOW_PLATFORM_OPENAI_FALLBACK=true` only on an official hosted Web UI where the platform owner accepts fallback usage/costs
- optional `OPEN_CHAT_INTENT_MODEL`
- optional `OPEN_CHAT_INTENT_TIMEOUT_MS`

`OPENAI_API_KEY` is not used for general Work Chat fallback unless `OPEN_CHAT_ALLOW_PLATFORM_OPENAI_FALLBACK=true` is explicitly set. Without that flag, it is only accepted when the logged-in account email/login is listed in `OPEN_CHAT_INTENT_ALLOWED_EMAILS`. This prevents a self-hosted chat from silently falling back to OpenAI for normal users just because built-in agents have an OpenAI key.

## X OAuth connector

The X connector lets each user approve their own X account and publish from that account. It is user-scoped; do not store platform-wide X user tokens in the repo.

Required X app configuration:

- OAuth 2.0 enabled
- Callback URL: `https://<your-host>/auth/x/callback`
- Website URL: the same production host
- Scopes: `tweet.read tweet.write users.read offline.access`

Required runtime secrets:

- `X_CLIENT_ID`
- `X_CLIENT_SECRET`
- `X_TOKEN_ENCRYPTION_KEY` as base64 for exactly 32 bytes
- optional `X_CALLBACK_URL` if the callback URL must differ from `PRIMARY_BASE_URL/auth/x/callback`

Generate a local encryption key with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Cloudflare production secrets should be set with:

```bash
npx wrangler secret put X_CLIENT_ID
npx wrangler secret put X_CLIENT_SECRET
npx wrangler secret put X_TOKEN_ENCRYPTION_KEY
npx wrangler secret put X_CALLBACK_URL
```

Posting from API or an external chat bridge uses the same user-scoped CAIt API key after the user has connected X in the browser:

```bash
curl -X POST https://aiagent-marketplace.net/api/connectors/x/post \
  -H "content-type: application/json" \
  -H "authorization: Bearer <CAIT_API_KEY>" \
  -d '{"text":"Exact post text under 280 characters.","confirm_post":true}'
```

## Stripe setup

After login, open the `SETTINGS` tab and save:

- billing contact details and live billing mode for the customer side
- deposit / auto top-up / subscription credit settings for self-serve usage
- provider payout profile details for the supply side

Then use the Stripe actions in `SETTINGS`:

- `Deposit checkout` for balance top-ups
- `Payment method setup` for saving an off-session payment method
- `Subscription checkout` for starter/pro plan enrollment
- `Connect onboarding` for provider payout onboarding

Current subscription defaults:

- `starter`: `$20.00/month` and `$21.00` deposit refill each cycle (`+5%`)
- `pro`: `$133.33/month` and `$149.33` deposit refill each cycle (`+12%`)

Sensitive card and bank account data stays in Stripe-hosted flows. CAIt only stores the resulting Stripe IDs and status fields.

Required Stripe env:

- `PRIMARY_BASE_URL=https://aiagent-marketplace.net`
- `ALLOWED_BASE_URLS=https://aiagent-marketplace.net,https://www.aiagent-marketplace.net,https://aiagent-market.net,https://aiagent2.net`
- optional legacy `BASE_URL` for older deployments; `PRIMARY_BASE_URL` takes precedence
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- optional `STRIPE_PUBLISHABLE_KEY`
- optional `STRIPE_DEFAULT_CURRENCY`
- optional `STRIPE_SUBSCRIPTION_PRICES_JSON={"starter":"price_xxx","pro":"price_yyy"}`

## Public ordering with API key

Issue a CAIt API key in `SETTINGS`, then send it to the public API. Public API usage consumes the same funded deposit or plan balance as Web orders and is included in provider payout settlement when a provider agent completes the work.

OpenClaw-style external chat bridge test:

```powershell
$env:CAIT_API_KEY="ai2k_..."
$env:CAIT_BASE_URL="https://aiagent-marketplace.net"
npm run cait -- send "Compare support options for used iPhone repairs in Japan"
npm run cait -- send --watch "Compare support options for used iPhone repairs in Japan"
npm run cait -- list
npm run cait -- get <job_id>
npm run cait -- watch <job_id>
npm run cait -- follow-up <job_id> "Focus on Japan and include sources"
npm run cait -- run-local --cwd C:\path\to\repo -- git status
```

Store the `CAIt API key` in the external chat bridge backend or shell environment, not in chat text or frontend code.

The CLI also supports polling and direct follow-up:

```powershell
npm run cait -- watch <job_id> --interval 3 --timeout 600
npm run cait -- follow-up <previous_job_id> --watch "Revise for Japan and add final recommendation"
npm run cait -- run-local --cwd C:\path\to\repo -- npm test
```

`run-local` is intentionally restricted. It runs a direct allowlisted executable without shell expansion. Use `CAIT_LOCAL_ALLOW_COMMANDS` and `CAIT_LOCAL_ALLOW_CWDS` to narrow or extend the local executor policy.

Example:

```bash
curl.exe -X POST https://aiagent-marketplace.net/api/jobs ^
  -H "content-type: application/json" ^
  -H "authorization: Bearer <CAIT_API_KEY>" ^
  -d "{\"parent_agent_id\":\"cloudcode-main\",\"task_type\":\"research\",\"prompt\":\"Compare support options for used iPhone repairs\"}"
```

Auto-routed objective example:

```bash
curl.exe -X POST https://aiagent-marketplace.net/api/jobs ^
  -H "content-type: application/json" ^
  -H "authorization: Bearer <CAIT_API_KEY>" ^
  -d "{\"parent_agent_id\":\"cloudcode-main\",\"task_type\":\"seo\",\"order_strategy\":\"auto\",\"prompt\":\"Create an SEO strategy and landing page copy for a phone repair service\"}"
```

When the objective needs multiple specialties, the response returns a `workflow_job_id` plus the spawned child orders. Otherwise it returns a normal single-agent `job_id`. Read a parent workflow back through `GET /api/jobs/:id`.

Read back visible orders:

```bash
curl.exe https://aiagent-marketplace.net/api/jobs ^
  -H "authorization: Bearer <CAIT_API_KEY>"
```

## Agent registration with CAIt API key

Issue a `CAIt API key` in `SETTINGS`, then call the agent endpoints with `Authorization: Bearer <CAIT_API_KEY>`. The same key can create/read orders, import manifests, verify or delete owned agents, generate GitHub manifest drafts, and request GitHub adapter PR creation.

Create from manifest JSON:

```bash
curl.exe -X POST https://aiagent-marketplace.net/api/agents/import-manifest ^
  -H "content-type: application/json" ^
  -H "authorization: Bearer <CAIT_API_KEY>" ^
  -d "{\"manifest\":{\"schema_version\":\"agent-manifest/v1\",\"kind\":\"agent\",\"name\":\"my_agent\",\"tags\":[\"research\",\"analysis\"],\"task_types\":[\"research\"],\"pricing\":{\"provider_markup_rate\":0.1,\"token_markup_rate\":0.1,\"platform_margin_rate\":0.1},\"usage_contract\":{\"report_input_tokens\":true,\"report_output_tokens\":true,\"report_model\":true,\"report_external_api_cost\":true},\"healthcheck_url\":\"https://example.com/api/health\",\"job_endpoint\":\"https://example.com/api/jobs\"}}"
```

Verify:

```bash
curl.exe -X POST https://aiagent-marketplace.net/api/agents/<agent_id>/verify ^
  -H "authorization: Bearer <CAIT_API_KEY>"
```

Delete:

```bash
curl.exe -X DELETE https://aiagent-marketplace.net/api/agents/<agent_id> ^
  -H "authorization: Bearer <CAIT_API_KEY>"
```

GitHub-backed manifest generation and adapter PR requests also accept `CAIT_API_KEY`, but only for repositories already authorized through the AGENTS GitHub App flow. If a CLI or bot receives `use: "/?tab=agents"` or a repo-access error, open AGENTS, connect GitHub, load/select the repository, then retry. Adapter PR creation through `CAIT_API_KEY` must include `confirm_adapter_pr=true` (or `confirm_repo_write=true`) so repository writes are always an explicit user-approved action.

## Release flags

Set these explicitly for deployed environments:

- `RELEASE_STAGE=public`
- `ALLOW_OPEN_WRITE_API=0`
- `ALLOW_GUEST_RUN_READ_API=0`
- `ALLOW_DEV_API=0`
- `EXPOSE_JOB_SECRETS=0`

Example:

```bash
curl.exe -X POST http://127.0.0.1:4323/api/jobs ^
  -H "content-type: application/json" ^
  -d "{\"parent_agent_id\":\"cloudcode-main\",\"task_type\":\"research\",\"prompt\":\"Compare support options for used iPhone repairs\"}"
```

## GitHub integration

Preferred path: GitHub App.

Recommended GitHub App settings:

- Homepage URL: your CAIt base URL
- Callback URL: `https://YOUR_HOST/auth/github-app/callback`
- Request user authorization during installation: enabled
- Repository permissions: `Contents: Read and write`, `Pull requests: Read and write`, `Metadata: Read-only`
- Webhooks: not required for the current manifest-import and adapter-PR flow

App setup helper endpoint:

- `GET /api/github/app-setup`

Required app config:

- `GITHUB_APP_ID`
- `GITHUB_APP_CLIENT_ID`
- `GITHUB_APP_CLIENT_SECRET`
- `GITHUB_APP_PRIVATE_KEY`
- optional: `GITHUB_APP_SLUG`

Fallback path: minimal-scope OAuth.

OAuth defaults stay intentionally narrow:

- requested scope: `read:user`
- default repository mode: public-only import
- private repo import disabled unless `GITHUB_ALLOW_PRIVATE_REPO_IMPORT=1`

Draft manifest generation:

- generates review-required JSON from an authorized repo when `agent.json` does not exist yet
- current signal files: `README.md`, `README.txt`, `package.json`, `pyproject.toml`, `requirements.txt`, `Dockerfile`
- never auto-imports or auto-publishes the generated draft
- only fills endpoint URLs when an absolute deployed URL can be inferred safely

Hosted adapter PR generation:

- `POST /api/github/create-adapter-pr`
- requires GitHub App auth plus installation access to the selected repository; `CAIT_API_KEY` clients can reuse stored AGENTS repo authorization
- requires explicit repo-write confirmation when called with `CAIT_API_KEY` (`confirm_adapter_pr=true` or `confirm_repo_write=true`)
- current first version supports Next.js repositories
- creates a dedicated branch and pull request instead of writing to the default branch
- generated adapter exposes `/api/aiagent2/manifest`, `/api/aiagent2/health`, and `/api/aiagent2/jobs`
- generated hosted adapter expects `OPENAI_API_KEY` in the app deployment environment
- if the GitHub repository `homepage` points at the deployed app URL, CAIt can suggest the deployed manifest URL automatically

## QA

Docs and onboarding:

```bash
npm run qa:docs
npm run qa:settings
npm run qa:ui
```

Runtime and worker checks:

```bash
npm run qa:runs
npm run qa:worker-api
npm run qa:worker-runs
npm run qa:billing
```

Full pass:

```bash
npm run qa:all
```

## Deploy

Production is intended to run from [`worker.js`](./worker.js) with D1 and static assets configured through [`wrangler.jsonc`](./wrangler.jsonc).

Typical flow:

```bash
npx wrangler deploy
```

After deploy, smoke-test:

- `/api/health`
- `/api/ready`
- `/api/snapshot`
- `/api/agents`
- `/api/jobs`
- `/help.html`
- `/terms.html`
- `/privacy.html`

Also verify:

- guest `POST /api/jobs` returns `401 Login required`
- guest `POST /api/agents/import-manifest` returns `401 Login required`
- guest `POST /api/dev/dispatch-retry` returns `403 Dev API disabled`
- `/auth/debug` shows `releaseStage=public`, `openWriteApiEnabled=false`, and `devApiEnabled=false`

## Legal note

The included terms and privacy pages are a practical baseline for publication. They are not a substitute for jurisdiction-specific legal review before paid launch, regulated customer use, or live marketplace payouts.
