import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = Number(process.env.PORT || 4327);
const BASE = `http://127.0.0.1:${PORT}`;
const stateDir = mkdtempSync(join(tmpdir(), 'agent-broker-e2e-qa-'));
const statePath = join(stateDir, 'broker-state.json');

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, options);
  const text = await res.text();
  let body = {};
  if (text) { try { body = JSON.parse(text); } catch { body = { raw: text }; } }
  return { status: res.status, body };
}
async function waitForServer(timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { const res = await fetch(`${BASE}/api/health`); if (res.ok) return; } catch {}
    await sleep(200);
  }
  throw new Error('Server did not become ready in time');
}

async function main() {
  const child = spawn('node', ['server.js'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(PORT), BROKER_STATE_PATH: statePath },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  try {
    await waitForServer();

    const syncImport = await request('/api/agents/import-manifest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ manifest: {
        schema_version: 'agent-manifest/v1',
        name: 'sync_agent',
        task_types: ['research'],
        pricing: { premium_rate: 0.05, basic_rate: 0.1 },
        success_rate: 0.99,
        avg_latency_sec: 5,
        healthcheck_url: `${BASE}/mock/research/health`,
        job_endpoint: `${BASE}/mock/research/jobs`
      } })
    });
    const syncAgentId = syncImport.body.agent.id;
    await request(`/api/agents/${syncAgentId}/verify`, { method: 'POST' });

    const asyncImport = await request('/api/agents/import-manifest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ manifest: {
        schema_version: 'agent-manifest/v1',
        name: 'async_agent',
        task_types: ['summary'],
        pricing: { premium_rate: 0.35, basic_rate: 0.1 },
        success_rate: 0.8,
        avg_latency_sec: 40,
        healthcheck_url: `${BASE}/mock/research/health`,
        job_endpoint: `${BASE}/mock/accepted/jobs`
      } })
    });
    const asyncAgentId = asyncImport.body.agent.id;
    await request(`/api/agents/${asyncAgentId}/verify`, { method: 'POST' });

    const syncJob = await request('/api/jobs', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ parent_agent_id: 'qa-runner', task_type: 'research', prompt: 'sync flow', budget_cap: 100 })
    });
    assert.equal(syncJob.status, 201);
    assert.equal(syncJob.body.status, 'completed');

    const asyncJob = await request('/api/jobs', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ parent_agent_id: 'qa-runner', task_type: 'summary', prompt: 'async flow', budget_cap: 1000 })
    });
    assert.equal(asyncJob.status, 201);
    assert.equal(asyncJob.body.status, 'dispatched');

    const asyncJobState = await request(`/api/jobs/${asyncJob.body.job_id}`);
    const token = asyncJobState.body.callbackToken;
    const callback = await request('/api/agent-callbacks/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        job_id: asyncJob.body.job_id,
        agent_id: asyncAgentId,
        status: 'completed',
        report: { summary: 'async finished' },
        usage: { total_cost_basis: 70, compute_cost: 20, tool_cost: 10, labor_cost: 40 }
      })
    });
    assert.equal(callback.status, 200);

    const audits = await request('/api/billing-audits');
    assert.equal(audits.status, 200);
    assert.ok(audits.body.billing_audits.length >= 2);

    const snapshot = await request('/api/snapshot');
    assert.equal(snapshot.status, 200);
    assert.ok(snapshot.body.jobs.length >= 2);
    assert.ok(snapshot.body.billingAudits.length >= 2);

    console.log('e2e mock qa passed');
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
