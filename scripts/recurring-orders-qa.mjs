import assert from 'node:assert/strict';
import worker from '../worker.js';
import { DEFAULT_AGENT_SEEDS, createOrderApiKeyInState, upsertAccountSettingsInState } from '../lib/shared.js';
import { createD1LikeStorage } from '../lib/storage.js';

const env = {
  APP_VERSION: '0.2.0-test',
  ALLOW_OPEN_WRITE_API: '0',
  ALLOW_GUEST_RUN_READ_API: '0',
  ALLOW_DEV_API: '1',
  ALLOW_IN_MEMORY_STORAGE: '1',
  EXPOSE_JOB_SECRETS: '1',
  PRIMARY_BASE_URL: 'https://qa.example',
  MY_BINDING: null,
  ASSETS: {
    async fetch() {
      return new Response('not found', { status: 404 });
    }
  }
};

const storage = createD1LikeStorage(env.MY_BINDING, { allowInMemory: true, stateCacheTtlMs: 0 });
const user = { login: 'recurring-user', name: 'Recurring User', email: 'recurring@example.com' };
let orderToken = '';

function buildVerifiedAgents() {
  return DEFAULT_AGENT_SEEDS.map((agent, index) => ({
    ...structuredClone(agent),
    verificationStatus: 'verified',
    verificationCheckedAt: `2026-04-18T00:0${index}:00.000Z`,
    verificationError: null,
    manifestSource: 'qa://recurring-orders',
    metadata: {
      ...(agent.metadata || {}),
      builtIn: false,
      sample: false,
      category: '',
      manifest: {
        ...(agent.metadata?.manifest || {}),
        healthcheckUrl: '',
        healthcheck_url: '',
        jobEndpoint: '',
        job_endpoint: '',
        endpoints: {}
      },
      qaSeed: true
    }
  }));
}

async function resetState() {
  const state = {
    agents: buildVerifiedAgents(),
    jobs: [],
    events: [],
    accounts: [],
    feedbackReports: [],
    chatTranscripts: [],
    recurringOrders: []
  };
  const createdKey = createOrderApiKeyInState(state, user.login, user, 'github-app', { label: 'recurring-qa' });
  orderToken = createdKey.apiKey.token;
  upsertAccountSettingsInState(state, user.login, user, 'github-app', {
    billing: {
      mode: 'monthly_invoice',
      depositBalance: 1200,
      billingEmail: user.email,
      legalName: user.name
    },
    stripe: {
      defaultPaymentMethodId: 'pm_recurring_ready',
      defaultPaymentMethodStatus: 'ready'
    }
  });
  await storage.replaceState(state);
}

async function request(path, init = {}) {
  const headers = new Headers(init.headers || {});
  if (!headers.has('content-type') && init.body) headers.set('content-type', 'application/json');
  if (!headers.has('authorization')) headers.set('authorization', `Bearer ${orderToken}`);
  const res = await worker.fetch(new Request(`https://qa.example${path}`, { ...init, headers }), env);
  const body = await res.json();
  return { status: res.status, body };
}

await resetState();

const created = await request('/api/recurring-orders', {
  method: 'POST',
  body: JSON.stringify({
    parent_agent_id: 'qa-recurring',
    task_type: 'research',
    prompt: 'Research new AI agent marketplace launches and send a concise summary.',
    budget_cap: 180,
    deadline_sec: 90,
    schedule: { interval: 'daily', time: '09:00', timezone: 'Asia/Tokyo' },
    max_runs: 2
  })
});
assert.equal(created.status, 201);
assert.equal(created.body.ok, true);
assert.ok(created.body.recurring_order.id.startsWith('recurring_'));
assert.equal(created.body.recurring_order.status, 'active');
assert.equal(created.body.recurring_order.schedule.interval, 'daily');
assert.ok(Number.isFinite(Date.parse(created.body.recurring_order.nextRunAt)));

const listed = await request('/api/recurring-orders');
assert.equal(listed.status, 200);
assert.equal(listed.body.recurring_orders.length, 1);
assert.equal(listed.body.recurring_orders[0].id, created.body.recurring_order.id);

await storage.mutate(async (draft) => {
  const order = draft.recurringOrders.find((item) => item.id === created.body.recurring_order.id);
  order.nextRunAt = '2026-04-17T00:00:00.000Z';
});

const swept = await request('/api/dev/recurring-sweep', {
  method: 'POST',
  body: JSON.stringify({ at: '2026-04-18T00:00:00.000Z', limit: 5 })
});
assert.equal(swept.status, 200);
assert.equal(swept.body.due_count, 1);
assert.equal(swept.body.results.length, 1);
assert.ok(swept.body.results[0].job_id);
assert.equal(swept.body.results[0].status, 'queued');

const jobsAfterSweep = await request('/api/jobs');
assert.equal(jobsAfterSweep.status, 200);
assert.equal(jobsAfterSweep.body.jobs.length, 1);
assert.equal(jobsAfterSweep.body.jobs[0].input._broker.recurring.recurringOrderId, created.body.recurring_order.id);
const stateAfterSweep = await storage.getState();
const recurringAfterSweep = stateAfterSweep.recurringOrders.find((item) => item.id === created.body.recurring_order.id);
const accountAfterSweep = stateAfterSweep.accounts.find((item) => item.login === user.login);
assert.equal(recurringAfterSweep.runsCreated, 1);
assert.equal(recurringAfterSweep.lastJobId, swept.body.results[0].job_id);
assert.equal(Number(accountAfterSweep.billing.depositReserved), 0);
assert.equal(jobsAfterSweep.body.jobs[0].billingReservation.mode, 'monthly_invoice');

const paused = await request(`/api/recurring-orders/${created.body.recurring_order.id}`, {
  method: 'PATCH',
  body: JSON.stringify({ status: 'paused' })
});
assert.equal(paused.status, 200);
assert.equal(paused.body.recurring_order.status, 'paused');

await storage.mutate(async (draft) => {
  const order = draft.recurringOrders.find((item) => item.id === created.body.recurring_order.id);
  order.nextRunAt = '2026-04-17T00:00:00.000Z';
});

const pausedSweep = await request('/api/dev/recurring-sweep', {
  method: 'POST',
  body: JSON.stringify({ at: '2026-04-18T00:00:00.000Z', limit: 5 })
});
assert.equal(pausedSweep.status, 200);
assert.equal(pausedSweep.body.due_count, 0);

const resumed = await request(`/api/recurring-orders/${created.body.recurring_order.id}`, {
  method: 'PATCH',
  body: JSON.stringify({ status: 'active', schedule: { interval: 'daily', time: '09:00', timezone: 'Asia/Tokyo' } })
});
assert.equal(resumed.status, 200);
assert.equal(resumed.body.recurring_order.status, 'active');

const cronCreated = await request('/api/recurring-orders', {
  method: 'POST',
  body: JSON.stringify({
    parent_agent_id: 'qa-recurring',
    task_type: 'summary',
    prompt: 'Summarize this scheduled cron handler QA.',
    budget_cap: 120,
    deadline_sec: 90,
    schedule: { interval: 'hourly', every: 1, timezone: 'Asia/Tokyo' },
    max_runs: 1
  })
});
assert.equal(cronCreated.status, 201);

await storage.mutate(async (draft) => {
  const order = draft.recurringOrders.find((item) => item.id === cronCreated.body.recurring_order.id);
  order.nextRunAt = '2026-04-17T00:00:00.000Z';
});

const waitUntilPromises = [];
await worker.scheduled({ cron: '*/15 * * * *' }, env, {
  waitUntil(promise) {
    waitUntilPromises.push(promise);
  }
});
await Promise.all(waitUntilPromises);

const afterCron = await storage.getState();
const cronOrder = afterCron.recurringOrders.find((item) => item.id === cronCreated.body.recurring_order.id);
assert.equal(cronOrder.status, 'completed');
assert.equal(cronOrder.runsCreated, 1);
assert.ok(afterCron.jobs.some((job) => job.input?._broker?.recurring?.recurringOrderId === cronCreated.body.recurring_order.id));

const deleted = await request(`/api/recurring-orders/${created.body.recurring_order.id}`, { method: 'DELETE' });
assert.equal(deleted.status, 200);
assert.equal(deleted.body.ok, true);

console.log('recurring orders qa passed');
