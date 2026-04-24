import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const PORT = Number(process.env.PORT || 4323);
const BASE = `http://127.0.0.1:${PORT}`;

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
  const taskType = 'callback_qa_research';

  const child = spawn('node', ['server.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let output = '';
  child.stdout.on('data', chunk => { output += chunk.toString(); });
  child.stderr.on('data', chunk => { output += chunk.toString(); });

  try {
    await waitForServer();

    const importRes = await request('/api/agents/import-url', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ manifest_url: `${BASE}/public/removed-agent.json` })
    });
    assert.equal(importRes.status, 400, 'import-url should reject /public path directly if not fetchable');

    const manifest = {
      name: 'callback_qa_agent',
      task_types: [taskType],
      pricing: { premium_rate: 0.15, basic_rate: 0.1 },
      healthcheck_url: `${BASE}/mock/research/health`,
      job_endpoint: `${BASE}/mock/accepted/jobs`
    };
    const importJson = await request('/api/agents/import-manifest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ manifest })
    });
    assert.equal(importJson.status, 201, 'manifest import should succeed');
    const agentId = importJson.body.agent.id;

    const verifyRes = await request(`/api/agents/${agentId}/verify`, { method: 'POST' });
    assert.equal(verifyRes.status, 200, 'verify should succeed');
    assert.equal(verifyRes.body.agent.verificationStatus, 'verified');

    const jobRes = await request('/api/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        parent_agent_id: 'qa-runner',
        task_type: taskType,
        prompt: 'callback flow qa',
        budget_cap: 200
      })
    });
    assert.equal(jobRes.status, 201, 'job creation should succeed');
    assert.equal(jobRes.body.status, 'dispatched', 'accepted dispatch should remain dispatched');
    const jobId = jobRes.body.job_id;

    const jobGet = await request(`/api/jobs/${jobId}`);
    assert.equal(jobGet.status, 200);
    const callbackToken = jobGet.body.callbackToken;
    assert.ok(callbackToken, 'callback token should be present');

    const callbackOk = await request('/api/agent-callbacks/jobs', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${callbackToken}`
      },
      body: JSON.stringify({
        job_id: jobId,
        agent_id: agentId,
        status: 'completed',
        report: { summary: 'async done' },
        usage: { total_cost_basis: 80, compute_cost: 20, tool_cost: 10, labor_cost: 50 },
        external_job_id: 'remote-qa-1'
      })
    });
    assert.equal(callbackOk.status, 200, 'callback completion should succeed');
    assert.equal(callbackOk.body.status, 'completed');

    const dup = await request('/api/agent-callbacks/jobs', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${callbackToken}`
      },
      body: JSON.stringify({ job_id: jobId, agent_id: agentId, status: 'completed', report: { summary: 'dup' } })
    });
    assert.equal(dup.status, 409, 'duplicate callback should fail');
    assert.equal(dup.body.code, 'job_already_terminal');

    const jobRes2 = await request('/api/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        parent_agent_id: 'qa-runner',
        task_type: taskType,
        prompt: 'callback failure qa',
        budget_cap: 200
      })
    });
    const jobId2 = jobRes2.body.job_id;
    const jobGet2 = await request(`/api/jobs/${jobId2}`);
    const callbackToken2 = jobGet2.body.callbackToken;

    const failCb = await request('/api/agent-callbacks/jobs', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${callbackToken2}`
      },
      body: JSON.stringify({ job_id: jobId2, agent_id: agentId, status: 'failed', failure_reason: 'remote worker failed' })
    });
    assert.equal(failCb.status, 200, 'failure callback should succeed');
    assert.equal(failCb.body.status, 'failed');

    console.log('callback qa passed');
  } finally {
    child.kill('SIGTERM');
    await sleep(300);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
