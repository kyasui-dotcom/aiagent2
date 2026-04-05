import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = Number(process.env.PORT || 4324);
const BASE = `http://127.0.0.1:${PORT}`;
const stateDir = mkdtempSync(join(tmpdir(), 'agent-broker-retry-timeout-qa-'));
const statePath = join(stateDir, 'broker-state.json');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, options);
  const text = await res.text();
  let body = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }
  return { status: res.status, body };
}

async function waitForServer(timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {}
    await sleep(200);
  }
  throw new Error('Server did not become ready in time');
}

async function main() {
  const badTaskType = 'retry_bad_endpoint_qa';
  const acceptedTaskType = 'retry_timeout_qa';

  const child = spawn('node', ['server.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(PORT), BROKER_STATE_PATH: statePath },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  try {
    await waitForServer();

    const badManifest = {
      name: 'retry_bad_agent',
      task_types: [badTaskType],
      pricing: { premium_rate: 0.15, basic_rate: 0.1 },
      healthcheck_url: `${BASE}/mock/research/health`,
      job_endpoint: `${BASE}/missing/jobs`
    };
    const importBad = await request('/api/agents/import-manifest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ manifest: badManifest })
    });
    const badAgentId = importBad.body.agent.id;
    await request(`/api/agents/${badAgentId}/verify`, { method: 'POST' });

    const badJob = await request('/api/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ parent_agent_id: 'qa-runner', task_type: badTaskType, prompt: 'bad endpoint retry test', budget_cap: 9999 })
    });
    assert.equal(badJob.status, 201);
    assert.equal(badJob.body.status, 'failed');

    const badJobState = await request(`/api/jobs/${badJob.body.job_id}`);
    assert.equal(badJobState.body.failureCategory, 'dispatch_http_4xx');
    assert.equal(badJobState.body.dispatch.retryable, false);

    const badRetry = await request('/api/dev/dispatch-retry', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ job_id: badJob.body.job_id })
    });
    assert.equal(badRetry.status, 409);

    const acceptedManifest = {
      name: 'retry_timeout_agent',
      task_types: [acceptedTaskType],
      pricing: { premium_rate: 0.15, basic_rate: 0.1 },
      healthcheck_url: `${BASE}/mock/research/health`,
      job_endpoint: `${BASE}/mock/accepted/jobs`
    };
    const importAccepted = await request('/api/agents/import-manifest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ manifest: acceptedManifest })
    });
    const acceptedAgentId = importAccepted.body.agent.id;
    await request(`/api/agents/${acceptedAgentId}/verify`, { method: 'POST' });

    const acceptedJob = await request('/api/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ parent_agent_id: 'qa-runner', task_type: acceptedTaskType, prompt: 'timeout test', budget_cap: 9999 })
    });
    assert.equal(acceptedJob.status, 201);
    assert.equal(acceptedJob.body.status, 'dispatched');

    await sleep(1100);
    const sweep = await request('/api/dev/timeout-sweep', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ max_age_sec: 1 })
    });
    assert.equal(sweep.status, 200);
    assert.equal(sweep.body.ok, true);
    assert.equal(sweep.body.count, 1);
    assert.ok(Array.isArray(sweep.body.timedOut));
    const swept = sweep.body.timedOut.find(item => item.id === acceptedJob.body.job_id);
    assert.ok(swept, 'accepted job should be timed out');
    assert.equal(swept.retryable, true);
    assert.equal(typeof swept.maxRetries, 'number');
    assert.ok(swept.maxRetries >= 1);
    assert.ok(swept.nextRetryAt);

    const snapshotAfterTimeout = await request('/api/snapshot');
    assert.equal(snapshotAfterTimeout.status, 200);
    const timeoutEvent = snapshotAfterTimeout.body.events.find(event => event.type === 'TIMEOUT' && event.meta?.jobId === acceptedJob.body.job_id);
    assert.ok(timeoutEvent, 'timeout event should be emitted');
    assert.equal(timeoutEvent.meta.retryable, true);
    assert.equal(timeoutEvent.meta.attempts, swept.attempts);
    assert.equal(timeoutEvent.meta.maxRetries, swept.maxRetries);
    assert.match(timeoutEvent.message, new RegExp(`retry ${swept.attempts + 1}/${swept.maxRetries} available`));

    const timedOutState = await request(`/api/jobs/${acceptedJob.body.job_id}`);
    assert.equal(timedOutState.body.status, 'timed_out');
    assert.equal(timedOutState.body.failureCategory, 'deadline_timeout');
    assert.equal(timedOutState.body.dispatch.retryable, true);
    assert.equal(timedOutState.body.dispatch.maxRetries, swept.maxRetries);

    const retryTimedOut = await request('/api/dev/dispatch-retry', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ job_id: acceptedJob.body.job_id })
    });
    assert.equal(retryTimedOut.status, 200);
    assert.equal(retryTimedOut.body.mode, 'dispatched');

    const retriedState = await request(`/api/jobs/${acceptedJob.body.job_id}`);
    assert.equal(retriedState.body.status, 'dispatched');
    assert.equal(retriedState.body.dispatch.retryable, false);
    assert.equal(retriedState.body.dispatch.nextRetryAt, null);

    console.log('retry timeout qa passed');
  } finally {
    child.kill('SIGTERM');
    await sleep(300);
    rmSync(stateDir, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
