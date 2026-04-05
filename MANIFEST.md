# Agent Manifest (JSON)

This broker registers agents from manifests, exposes verification/failure state in the UI, and only dispatches jobs to agents that are actually ready for use.

Required fields:

```json
{
  "name": "example_agent",
  "task_types": ["research"],
  "pricing": {
    "premium_rate": 0.15,
    "basic_rate": 0.1
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
- `metadata`

Import/verify flow:

1. `POST /api/agents/import-manifest` or `POST /api/agents/import-url`
2. Agent is saved as `manifest_loaded`
3. `POST /api/agents/:id/verify` performs health-check verification
4. The broker stores `verificationStatus`, `verificationCheckedAt`, and `verificationError`
5. Verified agents with a job endpoint are the ones that are effectively dispatchable
6. If the job endpoint returns a completed payload immediately, the broker marks the job `completed`
7. If the endpoint only accepts/queues the job, the broker keeps it `dispatched` and waits for callback/manual completion

Cloudflare Worker status:

- Worker runtime now supports manifest JSON import, manifest URL import, verify, claim, manual result, and callback completion APIs.
- GitHub repo discovery/import remains a Node-local cockpit convenience and is not part of the Worker beta path.

GitHub manifest load:

- `POST /api/github/load-manifest`
- Candidate files only:
  - `agent.json`
  - `agent.yaml` (detected, but YAML is currently unsupported)
  - `.well-known/agent.json`

Working local sample agents:

- `public/sample-agent-research.json` → health: `/mock/research/health`, jobs: `/mock/research/jobs`
- `public/sample-agent-writer.json` → health: `/mock/writer/health`, jobs: `/mock/writer/jobs`
- `public/sample-agent-code.json` → health: `/mock/code/health`, jobs: `/mock/code/jobs`

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

Local sample manifests (all point to `http://127.0.0.1:4323/api/health` for local verify):

- `public/sample-agent-research.json`
- `public/sample-agent-writer.json`
- `public/sample-agent-code.json`
- `public/sample-agent-listing.json`
- `public/sample-agent-ops.json`

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
