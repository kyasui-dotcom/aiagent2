import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createOrderApiKeyInState } from '../lib/shared.js';

const PORT = Number(process.env.PORT || 4331);
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
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {}
    await sleep(200);
  }
  throw new Error('Server did not become ready in time');
}

async function main() {
  const seededState = { agents: [], jobs: [], events: [], accounts: [] };
  const issued = createOrderApiKeyInState(
    seededState,
    'alice',
    { login: 'alice', name: 'Alice Example', email: 'alice@example.com' },
    'github-app',
    { label: 'provider-cli' }
  );
  const child = spawn('node', ['server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      ALLOW_IN_MEMORY_STORAGE: '1',
      PORT: String(PORT),
      BOOTSTRAP_STATE_JSON: JSON.stringify(seededState),
      RELEASE_STAGE: 'public',
      ALLOW_OPEN_WRITE_API: '0',
      ALLOW_DEV_API: '1',
      ALLOW_GUEST_RUN_READ_API: '0'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  try {
    await waitForServer();

    const importResult = await request('/api/agents/import-manifest', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${issued.apiKey.token}`
      },
      body: JSON.stringify({
        manifest: {
          schema_version: 'agent-manifest/v1',
          name: 'agent_api_qa',
          task_types: ['research'],
          pricing: { provider_markup_rate: 0.1, platform_margin_rate: 0.1 },
          success_rate: 0.95,
          avg_latency_sec: 10,
          healthcheck_url: `${BASE}/mock/research/health`,
          job_endpoint: `${BASE}/mock/research/jobs`
        }
      })
    });
    assert.equal(importResult.status, 201);
    assert.equal(importResult.body.ok, true);
    assert.equal(importResult.body.agent.owner, 'alice');

    const agentId = importResult.body.agent.id;
    const verifyResult = await request(`/api/agents/${agentId}/verify`, {
      method: 'POST',
      headers: { authorization: `Bearer ${issued.apiKey.token}` }
    });
    assert.equal(verifyResult.status, 200);
    assert.equal(verifyResult.body.verification.ok, true);

    const onboardingResult = await request(`/api/agents/${agentId}/onboarding-check`, {
      headers: { authorization: `Bearer ${issued.apiKey.token}` }
    });
    assert.equal(onboardingResult.status, 200);
    assert.equal(onboardingResult.body.ok, true);

    const pricingResult = await request(`/api/agents/${agentId}/pricing`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${issued.apiKey.token}`
      },
      body: JSON.stringify({ provider_markup_rate: 0.25 })
    });
    assert.equal(pricingResult.status, 200);
    assert.equal(pricingResult.body.ok, true);
    assert.equal(pricingResult.body.agent.providerMarkupRate, 0.25);
    assert.equal(pricingResult.body.agent.metadata.manifest.pricing.provider_markup_rate, 0.25);

    const deleteResult = await request(`/api/agents/${agentId}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${issued.apiKey.token}` }
    });
    assert.equal(deleteResult.status, 200);
    assert.equal(deleteResult.body.ok, true);

    const invalidOrderKeyOnAgentImport = await request('/api/agents/import-manifest', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer ai2k_invalid'
      },
      body: JSON.stringify({
        manifest: {
          schema_version: 'agent-manifest/v1',
          name: 'invalid_agent',
          task_types: ['research'],
          pricing: { premium_rate: 0.1, basic_rate: 0.1 }
        }
      })
    });
    assert.equal(invalidOrderKeyOnAgentImport.status, 401);

    console.log('agent api e2e qa passed');
  } finally {
    child.kill('SIGTERM');
    await sleep(300);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
