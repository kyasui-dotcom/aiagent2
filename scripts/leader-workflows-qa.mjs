import assert from 'node:assert/strict';
import worker from '../worker.js';

const env = {
  APP_VERSION: '0.2.0-test',
  ALLOW_OPEN_WRITE_API: '1',
  ALLOW_GUEST_RUN_READ_API: '1',
  ALLOW_DEV_API: '1',
  EXPOSE_JOB_SECRETS: '1',
  SESSION_SECRET: 'leader-workflow-qa-secret',
  STRIPE_SECRET_KEY: 'sk_test_worker_qa',
  STRIPE_WEBHOOK_SECRET: 'whsec_worker_api_qa',
  STRIPE_DEFAULT_CURRENCY: 'USD',
  BASE_URL: 'https://example.test',
  ALLOW_IN_MEMORY_STORAGE: '1',
  GOOGLE_CLIENT_ID: 'google-worker-api-qa-client-id',
  GOOGLE_CLIENT_SECRET: 'google-worker-api-qa-client-secret',
  MY_BINDING: null,
  ASSETS: {
    async fetch() {
      return new Response('not found', { status: 404 });
    }
  }
};

async function request(path, init = {}) {
  const waitUntilPromises = [];
  const ctx = {
    waitUntil(promise) {
      waitUntilPromises.push(Promise.resolve(promise));
    }
  };
  const res = await worker.fetch(new Request(`https://example.test${path}`, init), env, ctx);
  const text = await res.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {}
  await Promise.allSettled(waitUntilPromises);
  return { status: res.status, body };
}

const cases = [
  {
    taskType: 'research_team_leader',
    prompt: 'Research team leader: compare the main competitors, identify the decision blockers, and deliver one final evidence-backed recommendation.',
    minChildren: 4
  },
  {
    taskType: 'build_team_leader',
    prompt: 'Build team leader: review a web app architecture problem, plan the implementation/debug path, and deliver a final technical recommendation.',
    minChildren: 3
  },
  {
    taskType: 'cto_leader',
    prompt: 'CTO leader: assess architecture, implementation risk, and operations tradeoffs for an AI marketplace app and deliver the final engineering recommendation.',
    minChildren: 4
  },
  {
    taskType: 'cpo_leader',
    prompt: 'CPO leader: analyze onboarding friction, feature prioritization, and user evidence, then deliver the final product recommendation.',
    minChildren: 4
  },
  {
    taskType: 'cfo_leader',
    prompt: 'CFO leader: analyze pricing, unit economics, billing risk, and revenue tradeoffs for a subscription AI marketplace, then deliver the final finance recommendation.',
    minChildren: 3
  },
  {
    taskType: 'legal_leader',
    prompt: 'Legal leader: analyze privacy policy, terms, and compliance risks for an AI marketplace and deliver the final legal recommendation.',
    minChildren: 3
  },
  {
    taskType: 'cmo_leader',
    prompt: 'CMO leader: analyze channels, competitors, and signup conversion, then deliver the final growth recommendation.',
    minChildren: 5
  }
];

for (const testCase of cases) {
  const created = await request('/api/jobs', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      parent_agent_id: 'qa-runner',
      task_type: testCase.taskType,
      prompt: testCase.prompt,
      order_strategy: 'multi',
      skip_intake: true,
      budget_cap: 500
    })
  });
  assert.equal(created.status, 201, `${testCase.taskType} should create successfully`);
  assert.ok(created.body.workflow_job_id, `${testCase.taskType} should return a workflow job id`);

  let latest = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    latest = await request(`/api/jobs/${created.body.workflow_job_id}`);
    assert.equal(latest.status, 200, `${testCase.taskType} workflow fetch should succeed`);
    if (latest.body?.job?.status === 'completed' || latest.body?.job?.status === 'failed') break;
  }

  const job = latest.body?.job || {};
  const childRuns = Array.isArray(job.workflow?.childRuns) ? job.workflow.childRuns : [];
  assert.equal(job.status, 'completed', `${testCase.taskType} workflow should complete`);
  assert.ok(childRuns.length >= testCase.minChildren, `${testCase.taskType} should create enough child runs`);
  assert.ok(childRuns.some((run) => run.taskType === testCase.taskType), `${testCase.taskType} should include the leader child run`);
  assert.ok(childRuns.some((run) => run.taskType !== testCase.taskType), `${testCase.taskType} should include at least one specialist child run`);
  assert.equal(Number(job.workflow?.statusCounts?.failed || 0), 0, `${testCase.taskType} should not leave failed child runs`);
  assert.equal(Number(job.workflow?.statusCounts?.blocked || 0), 0, `${testCase.taskType} should not leave blocked child runs at completion`);
  assert.equal(Number(job.workflow?.statusCounts?.queued || 0), 0, `${testCase.taskType} should not leave queued child runs at completion`);
  assert.equal(Number(job.workflow?.statusCounts?.running || 0), 0, `${testCase.taskType} should not leave running child runs at completion`);
  assert.ok(String(job.output?.summary || '').trim(), `${testCase.taskType} should produce a final summary`);
}

console.log('leader workflows qa passed');
