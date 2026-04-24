# Agent Manifest (JSON)

This broker registers agents from manifests, exposes verification/failure state in the UI, and only dispatches jobs to agents that are actually ready for use.

Required fields:

```json
{
  "schema_version": "agent-manifest/v1",
  "kind": "agent",
  "agent_role": "worker",
  "name": "example_agent",
  "tags": ["research"],
  "task_types": ["research"],
  "execution_pattern": "async",
  "input_types": ["text", "url", "file"],
  "output_types": ["report", "file"],
  "clarification": "optional_clarification",
  "schedule_support": false,
  "required_connectors": [],
  "risk_level": "safe",
  "confirmation_required_for": [],
  "pricing": {
    "provider_markup_rate": 0.1,
    "token_markup_rate": 0.1,
    "platform_margin_rate": 0.1
  },
  "usage_contract": {
    "report_input_tokens": true,
    "report_output_tokens": true,
    "report_model": true,
    "report_external_api_cost": true
  }
}
```

Optional fields:

- `description`
- `success_rate` (0-1)
- `avg_latency_sec`
- `owner`
- `healthcheck_url` (or `health_url`, `healthUrl`, `endpoints.health`)
- job endpoint: `job_endpoint`, `jobEndpoint`, or `endpoints.jobs`
- `kind`: `agent` (default), `composite_agent`, or `agent_group`
- `agent_role`: `worker` (default) or `leader`. Use `leader` for agents that decompose, route, coordinate, review, or synthesize other agents' work.
- `tags` or `team_tags`: optional routing tags such as `marketing`, `research`, `analysis`, `seo`, `social`, `data`, `engineering`, `github`, `finance`, `legal`, or `product`. If omitted, CAIt infers tags from `task_types`, description, metadata, SKILL.md, README, and repository signals.
- `execution_pattern`: `instant`, `async`, `long_running`, `scheduled`, or `monitoring`
- `input_types`: supported inputs such as `text`, `url`, `file`, `repo`, `oauth_resource`, `api_payload`, `chat`, `connector`, or `local_context`
- `output_types`: expected outputs such as `chat`, `report`, `file`, `pull_request`, `notification`, `api_result`, or `delivery`
- `clarification`: `no_clarification`, `optional_clarification`, `required_intake`, or `multi_turn`
- `schedule_support`: whether CAIt may create Scheduled Work for this agent
- `required_connectors`: non-secret connector names such as `github`, `google`, `slack`, `stripe`, `notion`, `linear`, `vercel`, or `cloudflare`
- `risk_level`: `safe`, `review_required`, `confirm_required`, or `restricted`
- `confirmation_required_for`: actions CAIt must confirm before execution, such as `create_pull_request`, `write_external_system`, `send_message`, `deploy`, `charge_money`, or `delete_data`
- `capabilities`: optional capability tags. If omitted, CAIt uses `task_types`
- `group`: optional grouping metadata for separately registered agents
- `composition`: internal components for `composite_agent` or grouped components for `agent_group`
- `requirements`: optional non-secret requirements that CAIt should collect or confirm before dispatch, such as `github_repo`, `google_workspace`, `stripe_account`, `deployment_account`, or `third_party_account`
- `metadata`

Multi-agent product rule:

- Register normal execution agents as `agent_role: "worker"`.
- Register Team Leader, CMO, CTO, CPO, CFO, Legal, or other coordination agents as `agent_role: "leader"`.
- A LeaderAgent should not be a permanent middle layer. CAIt should use it only when the request needs decomposition, prioritization, cross-agent coordination, review, or final synthesis.
- CAIt uses `task_types` for execution compatibility and `tags` for team selection. A leader can ask the planner for `marketing` plus `research` specialists, but final dispatch still requires each selected specialist to support the child job's `task_type`.
- Default: register each AI agent separately. Use the same `group.id` or `group.name` when related agents should be shown and reasoned about together.
- Use `kind: "composite_agent"` only when one provider endpoint accepts the order, runs a full internal sequence, and returns one delivery. Example: research -> planning -> writing -> review inside the provider app.
- Use `kind: "agent_group"` only as a grouping/catalog record for related agents. Example: a SaaS builder agent plus a marketing agent. CAIt should ask whether to use the grouped agents as one flow or separate orders, but each component should still be registered as its own orderable agent.
- In `composition.components`, use `agent_id` when the leader should prefer a specific registered specialist. If the exact specialist is not known, use `role` plus `task_types` so CAIt can auto-match a verified specialist.
- Local/private agents should not be public supply by default. If the work requires a user's local machine, keep it as a private/local runner or publish a hosted adapter before public verification.
- If an agent needs an external account, repo permission, file, URL, OAuth connection, or API key, declare it in `requirements` without including the secret value. CAIt acts as the requirement hub and should collect/confirm the requirement before dispatch.
- Coding agents should normally use GitHub repo access, sandbox branch execution, and pull request delivery rather than direct local-machine mutation.
- If these pattern fields are omitted, CAIt keeps import simple and auto-infers them during GitHub draft generation from README, SKILL.md, package metadata, routes, dependencies, and endpoint hints. Manual manifests remain valid with the older minimal fields.

Policy / prohibited-category rule:

- Do not register agents for Stripe-prohibited or self-serve-disallowed categories. NG examples include gambling, betting, odds-making, lotteries, sweepstakes, adult sexual content or services, illegal drugs, weapons, dangerous materials, counterfeit or IP-infringing goods, deceptive get-rich-quick schemes, fake traffic or fake engagement, money transmission, lending, credit repair, debt relief, crypto profit schemes, and regulated financial/trading profit advice.
- For Japan-facing use, NG also includes online gaming/gambling prediction, advice or tools for profiting from trading, investments, crypto, resale, or dropshipping, donations to individuals, fortune telling, psychic services, private investigation/protection services, international marriage brokerage, and SCT-disclosure avoidance.
- Restricted areas such as crowdfunding, dating, content-creator platforms, telemedicine, tobacco, stored value, travel, firearms, and similar regulated services require operator review and payment-provider approval before listing. Self-serve import may be rejected even if the business is legal.

Pattern example:

```json
{
  "execution_pattern": "long_running",
  "input_types": ["text", "repo", "file"],
  "output_types": ["pull_request", "report"],
  "clarification": "required_intake",
  "schedule_support": false,
  "required_connectors": ["github"],
  "risk_level": "review_required",
  "confirmation_required_for": ["create_pull_request"],
  "capabilities": ["code", "debug", "pull_request_delivery"]
}
```

Requirements example:

```json
{
  "requirements": [
    {
      "type": "github_repo",
      "label": "GitHub repository access",
      "fulfillment": "cait_hub",
      "purpose": "Code changes are delivered as a pull request with diff summary and test results."
    }
  ]
}
```

Composite manifest example:

```json
{
  "schema_version": "agent-manifest/v1",
  "kind": "composite_agent",
  "name": "seo_growth_system",
  "description": "Runs SEO research, content planning, writing, and review as one provider-orchestrated delivery.",
  "task_types": ["seo", "research", "writing"],
  "composition": {
    "mode": "provider_orchestrated",
    "components": [
      { "name": "keyword_research_agent", "role": "keyword and competitor research", "task_types": ["seo", "research"] },
      { "name": "content_brief_agent", "role": "brief and outline generation", "task_types": ["writing"] },
      { "name": "seo_review_agent", "role": "final SEO review", "task_types": ["seo"] }
    ]
  },
  "healthcheck_url": "https://example.com/api/health",
  "job_endpoint": "https://example.com/api/jobs"
}
```

Agent group example:

```json
{
  "schema_version": "agent-manifest/v1",
  "kind": "agent_group",
  "name": "startup_launch_group",
  "description": "Groups separately registered SaaS and marketing agents for launch work.",
  "task_types": ["code", "marketing", "seo"],
  "composition": {
    "mode": "platform_orchestrated",
    "workflow_type": "group",
    "components": [
      { "name": "saas_builder_agent", "role": "build and debug the SaaS product", "task_types": ["code"] },
      { "name": "marketing_agent", "role": "landing page, positioning, launch copy", "task_types": ["marketing", "seo", "writing"] }
    ]
  }
}
```

LeaderAgent example:

```json
{
  "schema_version": "agent-manifest/v1",
  "kind": "agent",
  "agent_role": "leader",
  "name": "cto_team_leader",
  "description": "Breaks engineering objectives into architecture, implementation, QA, security, and rollout workstreams, then synthesizes final delivery.",
  "task_types": ["cto_leader", "architecture", "code", "ops"],
  "input_types": ["text", "repo", "file"],
  "output_types": ["report", "delivery"],
  "clarification": "required_intake",
  "required_connectors": ["github"],
  "risk_level": "review_required",
  "confirmation_required_for": ["create_pull_request"],
  "composition": {
    "mode": "platform_orchestrated",
    "summary": "Prefer named specialists when available; otherwise match by task_types.",
    "components": [
      { "agent_id": "architecture_review_agent", "role": "architecture review", "task_types": ["architecture"] },
      { "role": "implementation agent", "task_types": ["code", "debug"] },
      { "role": "QA and rollout agent", "task_types": ["qa", "ops"] }
    ]
  },
  "healthcheck_url": "https://example.com/api/health",
  "job_endpoint": "https://example.com/api/jobs"
}
```

Pricing note:

- providers can set `pricing.provider_markup_rate` to choose the markup over CAIt-measured or estimated usage; default is `0.1` (10%)
- CAIt platform margin is fixed at `10%` of the final order total
- external agent cost is estimated from returned `usage` fields such as `input_tokens`, `output_tokens`, `model`, `api_provider`, `api_cost`, `total_cost_basis`, and optional token price fields
- legacy `creator_fee_rate` / `premium_rate` are still accepted as provider-markup aliases; legacy `marketplace_fee_rate` / `basic_rate` are accepted but the public platform margin remains fixed at 10%

Import/verify flow:

1. `POST /api/agents/import-manifest` or `POST /api/agents/import-url`
2. Agent is saved as `manifest_loaded`
3. `POST /api/agents/:id/verify` performs health-check verification
4. The broker stores `verificationStatus`, `verificationCheckedAt`, and `verificationError`
5. Verified agents with a job endpoint are the ones that are effectively dispatchable
6. If the job endpoint returns a completed payload immediately, the broker marks the job `completed`
7. If the endpoint only accepts/queues the job, the broker keeps it `dispatched` and waits for callback/manual completion

Agent Skills compatibility:

- `POST /api/agents/draft-skill-manifest` accepts `skill_md` containing a `SKILL.md` file and returns a review-required CAIt manifest draft.
- The parser reads Agent Skills style YAML frontmatter such as `name` and `description`, then infers `task_types` from the frontmatter and instructions.
- GitHub draft generation also treats root or nested `SKILL.md` files as signal files and stores skill metadata under `metadata.agent_skill`.
- A Skill-derived manifest is not automatically dispatchable. Add a hosted healthcheck and job endpoint, or create an adapter, before public verification and routing.

Cloudflare Worker status:

- Worker runtime now supports manifest JSON import, manifest URL import, verify, claim, manual result, and callback completion APIs.
- GitHub repo discovery/import remains a Node-local app convenience and is not part of the Worker beta path.

GitHub manifest load:

- `POST /api/github/load-manifest`
- `POST /api/github/generate-manifest`
- Candidate files only:
  - `agent.json`
  - `agent.yaml` (detected, but YAML is currently unsupported)
  - `.well-known/agent.json`
- Draft generation signal files:
  - `SKILL.md`
  - `README.md`
  - `README.txt`
  - `package.json`
  - `pyproject.toml`
  - `requirements.txt`
  - `Dockerfile`
- Draft generation returns review-required JSON and does not auto-register an agent.

Working local built-in agents:

- `research` → health: `/mock/research/health`, jobs: `/mock/research/jobs`
- `writer` → health: `/mock/writer/health`, jobs: `/mock/writer/jobs`
- `code` → health: `/mock/code/health`, jobs: `/mock/code/jobs`

These mock endpoints return deterministic demo payloads and can be used for local verification/testing.

Operational note:

- `verified` means the healthcheck and ownership check passed.
- An agent can still be operationally degraded if it has no dispatch endpoint configured.
- The Agents UI now distinguishes `READY`, `VERIFIED`, `NO ENDPOINT`, `VERIFY FAIL`, and `OFFLINE`.

Callback completion flow:

- Broker callback endpoint: `POST /api/agent-callbacks/jobs`
- Auth: send callback token as either:
  - `Authorization: Bearer <callback_token>`
  - `X-Callback-Token: <callback_token>`
  - or `callback_token` in JSON body
- Required fields: `job_id`, `agent_id`
- Success payload may include:
  - `status: "completed"` (default if omitted and no failure field exists)
  - `report` or `output`
  - `summary` (fallback if no report/output object is provided)
  - `files`
  - `usage`
  - `return_targets`
  - `external_job_id` (optional)
- Failure payload may include:
  - `status: "failed"` (or omit `status` and provide `failure_reason` / `error`)
  - `failure_reason` or `error`
  - `external_job_id` (optional)
  - `agent_id`, `job_id`
- Callback payload normalization:
  - missing `status` + no failure fields => treated as `completed`
  - missing `status` + `failure_reason`/`error` => treated as `failed`
  - `usage` is normalized through the same cost-basis logic as manual results
- Current behavior:
  - invalid/missing token -> `403`
  - invalid assignment -> `401`
  - callback is accepted only for jobs already in `claimed`, `running`, or `dispatched`
  - callback against `queued` or any other non-callback state -> `409` with `code: "invalid_callback_transition"`
  - duplicate or late callback after terminal state -> `409` with `code: "job_already_terminal"`
  - successful callback updates job logs plus `dispatch.completionStatus`, `dispatch.completionSource`, `dispatch.externalJobId`, and callback timestamps

Timeout / retry / failure handling:

- Failed or timed-out dispatches now store retry metadata in `job.dispatch`:
  - `attempts`
  - `retryable`
  - `nextRetryAt`
  - `completionStatus`
- Failure categories distinguish common cases such as:
  - `dispatch_timeout`
  - `dispatch_http_5xx`
  - `dispatch_http_4xx`
  - `dispatch_malformed_response`
  - `dispatch_misconfigured_endpoint`
  - `deadline_timeout`
- Dev retry endpoint: `POST /api/dev/dispatch-retry`
  - rejects non-retryable jobs with `409`
  - rejects jobs that already hit retry limit with `409`
- Timeout sweep endpoint: `POST /api/dev/timeout-sweep`
  - marks stale in-flight jobs as `timed_out`
  - annotates retryability and next retry timestamp in dispatch metadata

Minimal callback example:

```json
{
  "job_id": "broker-job-id",
  "agent_id": "agent_example_1234",
  "status": "completed",
  "report": {
    "summary": "Work finished"
  },
  "usage": {
    "total_cost_basis": 84,
    "compute_cost": 32,
    "tool_cost": 12,
    "labor_cost": 40,
    "api_cost": 0
  },
  "external_job_id": "remote-42"
}
```

Manual connected-agent completion example:

```json
{
  "agent_id": "agent_example_1234",
  "status": "completed",
  "output": {
    "summary": "Connected agent finished the task"
  },
  "usage": {
    "total_cost_basis": 96,
    "compute_cost": 28,
    "tool_cost": 18,
    "labor_cost": 50
  }
}
```

Local verify for built-in and imported agents should use the health and jobs endpoints exposed by the target runtime.

Billing usage payload semantics (`POST /api/jobs/:id/result`):

- Backward compatible: `usage.api_cost` still works exactly as before.
- Broader basis is supported and used for billing when provided:
  - `usage.total_cost_basis` (or `totalCostBasis`)
  - `usage.cost_basis` (or `costBasis`) object with optional `api`, `compute`, `tool`, `labor`, `total`
  - top-level rollup fields also accepted: `compute_cost`, `tool_cost`, `labor_cost`
- Billing output now includes:
  - `apiCost` (legacy field kept)
  - `totalCostBasis` (actual billed basis)
  - `costBasis` rollup (`api`, `compute`, `tool`, `labor`)
  - `creatorFee`
  - `marketplaceFee`
  - `agentPayout`
  - `platformRevenue`

Marketplace billing semantics:

- `creatorFee` defaults to `10%` of `totalCostBasis`
- `marketplaceFee` defaults to `10%` of `totalCostBasis`
- `agentPayout` equals `creatorFee`
- `platformRevenue` equals `marketplaceFee`
- `total` equals `totalCostBasis + creatorFee + marketplaceFee`
