import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const PORT = Number(process.env.PORT || 4327);
const BASE = `http://127.0.0.1:${PORT}`;

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
    env: {
      ...process.env,
      NODE_ENV: 'test',
      ALLOW_IN_MEMORY_STORAGE: '1',
      PORT: String(PORT)
    },
    stdio: 'ignore'
  });
  try {
    await waitForServer();

    const syncImport = await request('/api/agents/import-manifest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirm_routing: true, manifest: {
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
      body: JSON.stringify({ confirm_routing: true, manifest: {
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

    const writerImport = await request('/api/agents/import-manifest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirm_routing: true, manifest: {
        schema_version: 'agent-manifest/v1',
        name: 'writer_agent',
        task_types: ['seo', 'writing'],
        pricing: { premium_rate: 0.08, basic_rate: 0.1 },
        success_rate: 0.97,
        avg_latency_sec: 8,
        healthcheck_url: `${BASE}/mock/writer/health`,
        job_endpoint: `${BASE}/mock/writer/jobs`
      } })
    });
    const writerAgentId = writerImport.body.agent.id;
    await request(`/api/agents/${writerAgentId}/verify`, { method: 'POST' });

    const seoImport = await request('/api/agents/import-manifest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirm_routing: true, manifest: {
        schema_version: 'agent-manifest/v1',
        name: 'seo_agent',
        task_types: ['seo'],
        pricing: { premium_rate: 0.06, basic_rate: 0.1 },
        success_rate: 0.99,
        avg_latency_sec: 5,
        healthcheck_url: `${BASE}/mock/writer/health`,
        job_endpoint: `${BASE}/mock/writer/jobs`
      } })
    });
    const seoAgentId = seoImport.body.agent.id;
    await request(`/api/agents/${seoAgentId}/verify`, { method: 'POST' });

    const syncJob = await request('/api/jobs', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ parent_agent_id: 'qa-runner', task_type: 'research', prompt: 'sync flow', budget_cap: 100 })
    });
    assert.equal(syncJob.status, 201);
    assert.equal(syncJob.body.status, 'completed');

    const needsInput = await request('/api/jobs', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ parent_agent_id: 'qa-runner', task_type: 'research', prompt: '市場調査して', budget_cap: 100 })
    });
    assert.equal(needsInput.status, 200);
    assert.equal(needsInput.body.status, 'needs_input');
    assert.equal(needsInput.body.needs_input, true);
    assert.ok(needsInput.body.questions.length >= 3);
    assert.ok(!needsInput.body.job_id);

    const clarifiedJob = await request('/api/jobs', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        parent_agent_id: 'qa-runner',
        task_type: 'research',
        prompt: '市場調査して。対象は日本のAI agent marketplace、納品はMarkdown比較表、観点は価格・導入難易度・開発者向け機能。',
        budget_cap: 100,
        skip_intake: true,
        input: { _broker: { intake: { confirmed: true, id: needsInput.body.intake.id } } }
      })
    });
    assert.equal(clarifiedJob.status, 201);
    assert.equal(clarifiedJob.body.status, 'completed');

    const followupJob = await request('/api/jobs', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        parent_agent_id: 'qa-runner',
        task_type: 'research',
        prompt: 'Follow-up answers: focus on Japan and include a final recommendation.',
        budget_cap: 100,
        followup_to_job_id: syncJob.body.job_id
      })
    });
    assert.equal(followupJob.status, 201);
    assert.equal(followupJob.body.status, 'completed');
    const followupState = await request(`/api/jobs/${followupJob.body.job_id}`);
    assert.equal(followupState.status, 200);
    assert.equal(followupState.body.input._broker.conversation.followupToJobId, syncJob.body.job_id);
    assert.equal(followupState.body.input._broker.conversation.turn, 2);
    assert.ok(followupState.body.input._broker.conversation.previousJob.summaryText.includes('Summary:'));

    const asyncJob = await request('/api/jobs', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ parent_agent_id: 'qa-runner', task_type: 'summary', agent_id: asyncAgentId, prompt: 'async flow', budget_cap: 1000 })
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

    const workflowJob = await request('/api/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        parent_agent_id: 'qa-runner',
        task_type: 'seo',
        prompt: 'Create a research-backed SEO strategy and landing page copy for a phone resale service.',
        budget_cap: 220,
        order_strategy: 'multi'
      })
    });
    assert.equal(workflowJob.status, 201);
    assert.equal(workflowJob.body.mode, 'workflow');
    assert.equal(workflowJob.body.selection_mode, 'multi');
    assert.equal(workflowJob.body.order_strategy_requested, 'multi');
    assert.equal(workflowJob.body.order_strategy_resolved, 'multi');
    assert.ok(workflowJob.body.workflow_job_id);
    assert.ok(workflowJob.body.child_runs.length >= 2);
    assert.ok(workflowJob.body.planned_task_types.includes('seo'));

    const workflowState = await request(`/api/jobs/${workflowJob.body.workflow_job_id}`);
    assert.equal(workflowState.status, 200);
    assert.equal(workflowState.body.jobKind, 'workflow');
    assert.equal(workflowState.body.status, 'completed');
    assert.ok((workflowState.body.workflow?.childRuns || []).length >= 2);

    const autoSingleJob = await request('/api/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        parent_agent_id: 'qa-runner',
        task_type: 'summary',
        prompt: 'Summarize this release note into three action items.',
        budget_cap: 100,
        order_strategy: 'auto'
      })
    });
    assert.equal(autoSingleJob.status, 201);
    assert.ok(['completed', 'dispatched', 'queued'].includes(autoSingleJob.body.status));
    assert.ok(!autoSingleJob.body.workflow_job_id);
    assert.equal(autoSingleJob.body.order_strategy_requested, 'auto');
    assert.equal(autoSingleJob.body.order_strategy_resolved, 'single');
    assert.equal(autoSingleJob.body.selection_mode, 'auto');

    const autoWorkflowJob = await request('/api/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        parent_agent_id: 'qa-runner',
        task_type: 'seo',
        prompt: 'Create an SEO strategy and landing page copy for a phone resale service.',
        budget_cap: 220,
        order_strategy: 'auto'
      })
    });
    assert.equal(autoWorkflowJob.status, 201);
    assert.equal(autoWorkflowJob.body.mode, 'workflow');
    assert.equal(autoWorkflowJob.body.selection_mode, 'multi');
    assert.equal(autoWorkflowJob.body.order_strategy_requested, 'auto');
    assert.equal(autoWorkflowJob.body.order_strategy_resolved, 'multi');
    assert.match(autoWorkflowJob.body.routing_reason, /multiple specialties/);
    assert.ok(autoWorkflowJob.body.workflow_job_id);
    assert.ok(autoWorkflowJob.body.child_runs.length >= 2);

    const audits = await request('/api/billing-audits');
    assert.equal(audits.status, 200);
    assert.ok(Array.isArray(audits.body.billing_audits));

    const snapshot = await request('/api/snapshot');
    assert.equal(snapshot.status, 200);
    assert.ok(Array.isArray(snapshot.body.jobs));
    assert.ok(Array.isArray(snapshot.body.billingAudits));

    console.log('e2e mock qa passed');
  } finally {
    child.kill('SIGTERM');
    await sleep(300);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
