import assert from 'node:assert/strict';
import worker from '../worker.js';
import { DEFAULT_AGENT_SEEDS } from '../lib/shared.js';
import { createD1LikeStorage } from '../lib/storage.js';

const env = {
  APP_VERSION: '0.2.0-test',
  ALLOW_OPEN_WRITE_API: '1',
  ALLOW_GUEST_RUN_READ_API: '1',
  ALLOW_DEV_API: '1',
  ALLOW_IN_MEMORY_STORAGE: '1',
  EXPOSE_JOB_SECRETS: '1',
  MY_BINDING: null,
  ASSETS: {
    async fetch() {
      return new Response('not found', { status: 404 });
    }
  }
};

const storage = createD1LikeStorage(env.MY_BINDING, { allowInMemory: true });

function buildVerifiedAgents() {
  return DEFAULT_AGENT_SEEDS.map((agent, index) => ({
    ...structuredClone(agent),
    verificationStatus: 'verified',
    verificationCheckedAt: `2026-04-05T07:0${index}:00.000Z`,
    verificationError: null,
    manifestSource: 'qa://worker-runs',
    metadata: {
      ...(agent.metadata || {}),
      builtIn: false,
      sample: false,
      category: '',
      manifest: {
        ...(agent.metadata?.manifest || {}),
        sample: false,
        category: '',
        healthcheckUrl: '',
        healthcheck_url: '',
        jobEndpoint: '',
        job_endpoint: '',
        endpoints: {},
        metadata: {
          ...((agent.metadata?.manifest && agent.metadata.manifest.metadata) || {}),
          sample: false,
          category: ''
        }
      },
      qaSeed: true
    }
  }));
}

async function resetState() {
  await storage.replaceState({
    agents: buildVerifiedAgents(),
    jobs: [],
    events: []
  });
}

async function request(path, init) {
  const res = await worker.fetch(new Request(`https://example.test${path}`, init), env);
  const body = await res.json();
  return { status: res.status, body };
}

await resetState();

const created = await request('/api/jobs', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    parent_agent_id: 'qa-runner',
    task_type: 'research',
    prompt: 'worker run lifecycle qa',
    budget_cap: 180,
    deadline_sec: 60
  })
});
assert.equal(created.status, 201);
assert.equal(created.body.status, 'queued');
assert.equal(created.body.matched_agent_id, 'agent_research_01');

const resolved = await request('/api/dev/resolve-job', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ job_id: created.body.job_id, mode: 'complete' })
});
assert.equal(resolved.status, 200);
assert.equal(resolved.body.status, 'completed');
assert.equal(resolved.body.job.status, 'completed');
assert.ok(resolved.body.billing.total > 0);

const completedJob = await request(`/api/jobs/${created.body.job_id}`);
assert.equal(completedJob.status, 200);
assert.equal(completedJob.body.job.status, 'completed');
assert.equal(completedJob.body.job.actualBilling.total, resolved.body.billing.total);

const manualJob = await request('/api/jobs', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    parent_agent_id: 'qa-runner',
    task_type: 'code',
    prompt: 'worker manual result qa',
    agent_id: 'agent_code_01',
    budget_cap: 260,
    deadline_sec: 60
  })
});
assert.equal(manualJob.status, 201);
assert.equal(manualJob.body.status, 'queued');

const claimed = await request(`/api/jobs/${manualJob.body.job_id}/claim`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ agent_id: 'agent_code_01' })
});
assert.equal(claimed.status, 200);
assert.equal(claimed.body.job.status, 'claimed');

const manualResult = await request(`/api/jobs/${manualJob.body.job_id}/result`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    agent_id: 'agent_code_01',
    status: 'completed',
    output: { summary: 'manual completion path works' },
    usage: { total_cost_basis: 140, compute_cost: 50, tool_cost: 20, labor_cost: 70 }
  })
});
assert.equal(manualResult.status, 200);
assert.equal(manualResult.body.job.status, 'completed');
assert.equal(manualResult.body.job.output.report.summary, 'manual completion path works');

const callbackJob = await request('/api/jobs', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    parent_agent_id: 'qa-runner',
    task_type: 'research',
    prompt: 'worker callback qa',
    agent_id: 'agent_research_01',
    budget_cap: 220,
    deadline_sec: 90
  })
});
assert.equal(callbackJob.status, 201);

const callbackClaim = await request(`/api/jobs/${callbackJob.body.job_id}/claim`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ agent_id: 'agent_research_01' })
});
assert.equal(callbackClaim.status, 200);

const callbackJobState = await request(`/api/jobs/${callbackJob.body.job_id}`);
const callbackToken = callbackJobState.body.job.callbackToken;
assert.ok(callbackToken);

const callbackCompletion = await request('/api/agent-callbacks/jobs', {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${callbackToken}` },
  body: JSON.stringify({
    job_id: callbackJob.body.job_id,
    agent_id: 'agent_research_01',
    status: 'completed',
    report: { summary: 'callback completion path works' },
    usage: { total_cost_basis: 88, compute_cost: 28, tool_cost: 10, labor_cost: 50 }
  })
});
assert.equal(callbackCompletion.status, 200);
assert.equal(callbackCompletion.body.job.status, 'completed');
assert.equal(callbackCompletion.body.job.output.report.summary, 'callback completion path works');

const timeoutCandidate = await request('/api/jobs', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    parent_agent_id: 'qa-runner',
    task_type: 'summary',
    prompt: 'worker timeout qa',
    budget_cap: 220,
    deadline_sec: 0
  })
});
assert.equal(timeoutCandidate.status, 201);
assert.equal(timeoutCandidate.body.status, 'queued');

const timedOut = await request('/api/dev/timeout-sweep', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ stale_ms: 0 })
});
assert.equal(timedOut.status, 200);
assert.equal(timedOut.body.count, 1);
assert.equal(timedOut.body.swept[0].id, timeoutCandidate.body.job_id);
assert.equal(timedOut.body.swept[0].status, 'timed_out');
assert.equal(timedOut.body.swept[0].retryable, true);

const snapshotAfterFirstTimeout = await request('/api/snapshot');
const firstTimeoutEvent = snapshotAfterFirstTimeout.body.events.find((event) => event.type === 'TIMEOUT' && event.meta?.jobId === timeoutCandidate.body.job_id);
assert.ok(firstTimeoutEvent);
assert.equal(firstTimeoutEvent.meta.retryable, true);
assert.match(firstTimeoutEvent.message, /retry 1\/2 available/);

const metricsAfterTimeout = await request('/api/metrics');
assert.equal(metricsAfterTimeout.status, 200);
assert.equal(metricsAfterTimeout.body.stats.retryableRuns, 1);
assert.equal(metricsAfterTimeout.body.stats.timedOutRuns, 1);
assert.ok(metricsAfterTimeout.body.stats.nextRetryAt);

const retried = await request('/api/dev/dispatch-retry', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ job_id: timeoutCandidate.body.job_id })
});
assert.equal(retried.status, 200);
assert.equal(retried.body.ok, true);
assert.equal(retried.body.job.status, 'queued');
assert.equal(retried.body.job.dispatch.retryable, false);
assert.equal(retried.body.job.dispatch.completionStatus, 'retry_queued');
assert.equal(retried.body.job.dispatch.attempts, 1);
assert.equal(retried.body.job.dispatch.maxRetries, 2);

await storage.mutate(async (draft) => {
  const job = draft.jobs.find((item) => item.id === timeoutCandidate.body.job_id);
  job.status = 'dispatched';
  job.dispatchedAt = new Date(Date.now() - 5_000).toISOString();
});

const timedOutAgain = await request('/api/dev/timeout-sweep', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ stale_ms: 0 })
});
assert.equal(timedOutAgain.status, 200);
assert.equal(timedOutAgain.body.count, 1);
assert.equal(timedOutAgain.body.swept[0].retryable, true);
assert.ok(timedOutAgain.body.swept[0].nextRetryAt);

const retriedAgain = await request('/api/dev/dispatch-retry', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ job_id: timeoutCandidate.body.job_id })
});
assert.equal(retriedAgain.status, 200);
assert.equal(retriedAgain.body.job.dispatch.attempts, 2);

await storage.mutate(async (draft) => {
  const job = draft.jobs.find((item) => item.id === timeoutCandidate.body.job_id);
  job.status = 'dispatched';
  job.dispatchedAt = new Date(Date.now() - 5_000).toISOString();
});

const timedOutFinal = await request('/api/dev/timeout-sweep', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ stale_ms: 0 })
});
assert.equal(timedOutFinal.status, 200);
assert.equal(timedOutFinal.body.count, 1);
assert.equal(timedOutFinal.body.swept[0].retryable, false);
assert.equal(timedOutFinal.body.swept[0].maxRetries, 2);

const snapshotAfterFinalTimeout = await request('/api/snapshot');
const finalTimeoutEvent = snapshotAfterFinalTimeout.body.events.find((event) => event.type === 'TIMEOUT' && event.meta?.jobId === timeoutCandidate.body.job_id && event.meta?.retryable === false);
assert.ok(finalTimeoutEvent);
assert.match(finalTimeoutEvent.message, /retries exhausted at 2\/2/);
assert.equal(finalTimeoutEvent.meta.maxRetries, 2);

const retryBlocked = await request('/api/dev/dispatch-retry', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ job_id: timeoutCandidate.body.job_id })
});
assert.equal(retryBlocked.status, 409);

const metrics = await request('/api/metrics');
assert.equal(metrics.status, 200);
assert.ok(metrics.body.stats.totalJobs >= 4);
assert.equal(typeof metrics.body.stats.terminalRuns, 'number');
assert.ok(metrics.body.event_count >= 5);
assert.equal(typeof metrics.body.billing_audit_count, 'number');
assert.ok(metrics.body.billing_audit_count >= 0);

await resetState();

const cronTimeoutCandidate = await request('/api/jobs', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    parent_agent_id: 'qa-runner',
    task_type: 'research',
    prompt: 'scheduled timeout sweep qa',
    budget_cap: 180,
    deadline_sec: 1
  })
});
assert.equal(cronTimeoutCandidate.status, 201);

await storage.mutate(async (draft) => {
  const job = draft.jobs.find((item) => item.id === cronTimeoutCandidate.body.job_id);
  job.status = 'running';
  job.startedAt = new Date(Date.now() - 5_000).toISOString();
  job.createdAt = job.startedAt;
});

await worker.scheduled({ cron: '* * * * *' }, env, {
  waitUntil(promise) {
    return promise;
  }
});

const cronTimedOut = await request(`/api/jobs/${cronTimeoutCandidate.body.job_id}`);
assert.equal(cronTimedOut.status, 200);
assert.equal(cronTimedOut.body.job.status, 'timed_out');
assert.equal(cronTimedOut.body.job.failureCategory, 'deadline_timeout');

const cronSnapshot = await request('/api/snapshot');
const cronTimeoutEvent = cronSnapshot.body.events.find((event) => event.type === 'TIMEOUT' && event.meta?.jobId === cronTimeoutCandidate.body.job_id);
assert.ok(cronTimeoutEvent);
assert.equal(cronTimeoutEvent.meta.source, 'cron');

await resetState();

const oldWorkflowAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
await storage.mutate(async (draft) => {
  draft.jobs.unshift(
    {
      id: 'qa-workflow-timeout-parent',
      jobKind: 'workflow',
      parentAgentId: 'qa-runner',
      taskType: 'cmo_leader',
      prompt: 'workflow timeout floor qa',
      status: 'running',
      deadlineSec: 1,
      createdAt: oldWorkflowAt,
      startedAt: oldWorkflowAt,
      estimateWindow: { durationMaxSec: 90 },
      logs: ['workflow timeout floor qa parent'],
      workflow: {
        plannedTasks: ['cmo_leader', 'research', 'growth'],
        childRuns: []
      }
    },
    {
      id: 'qa-workflow-timeout-queued-child',
      jobKind: 'workflow_child',
      parentAgentId: 'qa-runner',
      taskType: 'growth',
      workflowTask: 'growth',
      workflowAgentName: 'Growth Operator Agent',
      prompt: 'queued future workflow child should not timeout before dispatch turn',
      status: 'queued',
      assignedAgentId: 'agent_growth_01',
      deadlineSec: 1,
      createdAt: oldWorkflowAt,
      workflowParentId: 'qa-workflow-timeout-parent',
      estimateWindow: { durationMaxSec: 90 },
      dispatch: { completionStatus: 'queued_for_workflow_turn' },
      logs: ['workflow timeout floor qa queued child']
    },
    {
      id: 'qa-workflow-timeout-running-child',
      jobKind: 'workflow_child',
      parentAgentId: 'qa-runner',
      taskType: 'research',
      workflowTask: 'research',
      workflowAgentName: 'Research Agent',
      prompt: 'running workflow child should use workflow timeout floor',
      status: 'running',
      assignedAgentId: 'agent_research_01',
      deadlineSec: 1,
      createdAt: oldWorkflowAt,
      startedAt: oldWorkflowAt,
      workflowParentId: 'qa-workflow-timeout-parent',
      estimateWindow: { durationMaxSec: 90 },
      dispatch: { completionStatus: 'dispatch_scheduled', dispatchRequestedAt: oldWorkflowAt },
      logs: ['workflow timeout floor qa running child']
    }
  );
});

const workflowSweep = await request('/api/dev/timeout-sweep', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({})
});
assert.equal(workflowSweep.status, 200);
assert.equal(workflowSweep.body.count, 0, 'workflow parent/child runs should not be killed by a 1s deadline while inside the workflow timeout floor');

const workflowTimeoutState = await storage.getState();
const workflowTimeoutJobs = new Map(workflowTimeoutState.jobs.map((job) => [job.id, job]));
assert.equal(workflowTimeoutJobs.get('qa-workflow-timeout-parent').status, 'running');
assert.equal(workflowTimeoutJobs.get('qa-workflow-timeout-queued-child').status, 'queued');
assert.equal(workflowTimeoutJobs.get('qa-workflow-timeout-running-child').status, 'running');

await resetState();
const veryOldWorkflowAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
await storage.mutate(async (draft) => {
  draft.jobs.unshift(
    {
      id: 'qa-live-child-parent-timeout-guard',
      jobKind: 'workflow',
      parentAgentId: 'qa-runner',
      taskType: 'cmo_leader',
      prompt: 'live child parent timeout guard',
      status: 'running',
      createdAt: veryOldWorkflowAt,
      startedAt: veryOldWorkflowAt,
      logs: ['live child parent timeout guard'],
      workflow: {
        plannedTasks: ['cmo_leader', 'research'],
        childRuns: []
      }
    },
    {
      id: 'qa-live-child-parent-timeout-guard-child',
      jobKind: 'workflow_child',
      parentAgentId: 'qa-runner',
      taskType: 'research',
      workflowTask: 'research',
      workflowAgentName: 'Research Agent',
      prompt: 'queued child keeps parent alive',
      status: 'queued',
      assignedAgentId: 'agent_research_01',
      createdAt: veryOldWorkflowAt,
      workflowParentId: 'qa-live-child-parent-timeout-guard',
      logs: ['queued child keeps parent alive']
    }
  );
});
const liveChildParentSweep = await request('/api/dev/timeout-sweep', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({})
});
assert.equal(liveChildParentSweep.status, 200);
assert.equal(liveChildParentSweep.body.count, 0, 'workflow parent should not time out while a child is still queued or running');
const liveChildParentState = await storage.getState();
assert.equal(liveChildParentState.jobs.find((job) => job.id === 'qa-live-child-parent-timeout-guard').status, 'running');

console.log('worker runs qa passed');
