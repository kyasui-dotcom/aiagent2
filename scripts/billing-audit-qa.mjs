import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const PORT = Number(process.env.PORT || 4326);
const BASE = `http://127.0.0.1:${PORT}`;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, options);
  const text = await res.text();
  let body = {};
  if (text) {
    try { body = JSON.parse(text); } catch { body = { raw: text }; }
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
  const child = spawn('node', ['server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      ALLOW_IN_MEMORY_STORAGE: '1',
      PORT: String(PORT)
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  try {
    await waitForServer();

    const imported = await request('/api/agents/import-manifest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        manifest: {
          schema_version: 'agent-manifest/v1',
          name: 'billing_agent',
          task_types: ['research'],
          pricing: { premium_rate: 0.2, basic_rate: 0.1 },
          healthcheck_url: `${BASE}/mock/research/health`,
          job_endpoint: `${BASE}/mock/research/jobs`
        }
      })
    });
    const agentId = imported.body.agent.id;
    await request(`/api/agents/${agentId}/verify`, { method: 'POST' });

    const job = await request('/api/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ parent_agent_id: 'qa-runner', task_type: 'research', prompt: 'billing audit test', budget_cap: 9999 })
    });
    assert.equal(job.status, 201);
    assert.equal(job.body.status, 'completed');

    const audits = await request('/api/billing-audits');
    assert.equal(audits.status, 200);
    assert.ok(Array.isArray(audits.body.billing_audits));
    const audit = audits.body.billing_audits.find(a => a.jobId === job.body.job_id);
    if (audit) {
      assert.equal(audit.policyVersion, 'billing-policy/v4-multi-model-pricing');
      assert.equal(audit.source, 'external-dispatch');
      assert.ok(audit.billable.totalCostBasis > 0);
      assert.ok(audit.settlement.creatorFee > 0);
      assert.ok(audit.settlement.marketplaceFee > 0);
      assert.ok(audit.settlement.total > 0);
    } else {
      const snapshot = await request('/api/snapshot');
      assert.equal(snapshot.status, 200);
      const auditEvent = (snapshot.body.events || []).find((event) => event.type === 'BILLING_AUDIT' && event.meta?.jobId === job.body.job_id);
      assert.ok(auditEvent, 'billing audit event should be recorded');
      assert.equal(auditEvent.meta.policyVersion, 'billing-policy/v4-multi-model-pricing');
      assert.equal(auditEvent.meta.source, 'external-dispatch');
      assert.ok(auditEvent.meta.billable.totalCostBasis > 0);
      assert.ok(auditEvent.meta.settlement.creatorFee > 0);
      assert.ok(auditEvent.meta.settlement.marketplaceFee > 0);
      assert.ok(auditEvent.meta.settlement.total > 0);
    }

    console.log('billing audit qa passed');
  } finally {
    child.kill('SIGTERM');
    await sleep(300);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
