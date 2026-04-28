import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { DEFAULT_AGENT_SEEDS, createOrderApiKeyInState } from '../lib/shared.js';

const PORT = Number(process.env.PORT || 4335);
const MANIFEST_PORT = Number(process.env.MANIFEST_PORT || 4336);
const BASE = `http://127.0.0.1:${PORT}`;
const MANIFEST_BASE = `http://127.0.0.1:${MANIFEST_PORT}`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, options);
  const text = await response.text();
  let body = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }
  return { status: response.status, body };
}

async function waitForServer(timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${BASE}/api/health`);
      if (response.ok) return;
    } catch {}
    await sleep(200);
  }
  throw new Error('Server did not become ready in time');
}

function startManifestServer() {
  const manifests = {
    '/writer-manifest.json': {
      schema_version: 'agent-manifest/v1',
      name: 'e2e_url_writer',
      description: 'Writes channel-specific launch copy from research findings.',
      task_types: ['writing'],
      pricing: { provider_markup_rate: 0.1, platform_margin_rate: 0.1 },
      success_rate: 0.97,
      avg_latency_sec: 8,
      healthcheck_url: `${BASE}/mock/writer/health`,
      job_endpoint: `${BASE}/mock/writer/jobs`
    },
    '/x-manifest.json': {
      schema_version: 'agent-manifest/v1',
      name: 'e2e_url_x_adapter',
      description: 'Publishes approved X and Twitter post packets after explicit approval.',
      task_types: ['twitter'],
      tags: ['social', 'x', 'marketing'],
      metadata: { task_type_scores: { x_post: 0.94 } },
      pricing: { provider_markup_rate: 0.1, platform_margin_rate: 0.1 },
      success_rate: 0.96,
      avg_latency_sec: 9,
      healthcheck_url: `${BASE}/mock/x_post/health`,
      job_endpoint: `${BASE}/mock/x_post/jobs`
    }
  };
  const server = createServer((req, res) => {
    const manifest = manifests[req.url || ''];
    if (!manifest) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not found' }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(manifest));
  });
  return new Promise((resolve) => {
    server.listen(MANIFEST_PORT, '127.0.0.1', () => resolve(server));
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    if (!server || !server.listening) {
      resolve();
      return;
    }
    server.close(() => resolve());
  });
}

function stopChild(child) {
  return new Promise((resolve) => {
    if (!child || child.exitCode !== null || child.signalCode) {
      resolve();
      return;
    }
    const killTimer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {}
    }, 1500);
    child.once('exit', () => {
      clearTimeout(killTimer);
      resolve();
    });
    try {
      child.kill('SIGTERM');
    } catch {
      clearTimeout(killTimer);
      resolve();
    }
  });
}

function authHeaders(token, extra = {}) {
  return {
    'content-type': 'application/json',
    authorization: `Bearer ${token}`,
    ...extra
  };
}

async function assertPreview(path, token, payload, expected = {}) {
  const preview = await request(path, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(payload)
  });
  assert.equal(preview.status, 428);
  assert.equal(preview.body.code, 'routing_confirmation_required');
  assert.equal(preview.body.needs_confirmation, true);
  assert.equal(preview.body.required, 'confirm_routing=true');
  assert.equal(preview.body.routing_confirmation.inferred.layer, expected.layer);
  if (expected.role) assert.equal(preview.body.routing_confirmation.inferred.role, expected.role);
  if (expected.upstreamTask) {
    assert.ok(preview.body.routing_confirmation.inferred.upstream.task_types.includes(expected.upstreamTask));
  }
  if (expected.downstreamTask) {
    assert.ok(preview.body.routing_confirmation.inferred.downstream.task_types.includes(expected.downstreamTask));
  }
  return preview;
}

async function assertConfirmed(path, token, payload, expected = {}) {
  const confirmed = await request(path, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({ ...payload, confirm_routing: true })
  });
  assert.equal(confirmed.status, 201);
  assert.equal(confirmed.body.ok, true);
  assert.equal(confirmed.body.agent.metadata.routing_confirmation.confirmed, true);
  assert.equal(confirmed.body.agent.metadata.agent_layer, expected.layer);
  if (expected.role) assert.equal(confirmed.body.agent.metadata.role, expected.role);
  if (expected.upstreamTask) assert.ok(confirmed.body.agent.metadata.upstream_task_types.includes(expected.upstreamTask));
  if (expected.downstreamTask) assert.ok(confirmed.body.agent.metadata.downstream_task_types.includes(expected.downstreamTask));
  return confirmed;
}

async function main() {
  const manifestServer = await startManifestServer();
  const seededState = { agents: structuredClone(DEFAULT_AGENT_SEEDS), jobs: [], events: [], accounts: [] };
  const issued = createOrderApiKeyInState(
    seededState,
    'routing-e2e-owner',
    { login: 'routing-e2e-owner', name: 'Routing E2E Owner', email: 'routing-e2e@example.com' },
    'github-app',
    { label: 'routing-confirmation-e2e' }
  );
  const child = spawn('node', ['server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      APP_VERSION: '0.2.0-test',
      PORT: String(PORT),
      BOOTSTRAP_STATE_JSON: JSON.stringify(seededState),
      RELEASE_STAGE: 'public',
      ALLOW_IN_MEMORY_STORAGE: '1',
      ALLOW_OPEN_WRITE_API: '0',
      ALLOW_DEV_API: '1',
      ALLOW_GUEST_RUN_READ_API: '0',
      ALLOW_LOCAL_MANIFEST_URLS: '1',
      SESSION_SECRET: 'agent-registration-routing-e2e'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  try {
    await waitForServer();
    const token = issued.apiKey.token;

    const unauthorized = await request('/api/agents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'unauthorized_agent', task_types: ['research'] })
    });
    assert.equal(unauthorized.status, 401);

    const manualPayload = {
      name: 'e2e_manual_research',
      description: 'Researches sources, compares options, and returns evidence with confidence.',
      task_types: 'research,summary'
    };
    await assertPreview('/api/agents', token, manualPayload, {
      layer: 'research',
      role: 'evidence_builder',
      downstreamTask: 'writing'
    });
    const preConfirmCatalog = await request('/api/agents');
    assert.equal(preConfirmCatalog.status, 200);
    assert.equal(preConfirmCatalog.body.agents.some((agent) => agent.name === 'E2E_MANUAL_RESEARCH'), false);
    const manualConfirmed = await assertConfirmed('/api/agents', token, manualPayload, {
      layer: 'research',
      role: 'evidence_builder',
      downstreamTask: 'writing'
    });

    const manifestPayload = {
      manifest: {
        schema_version: 'agent-manifest/v1',
        name: 'e2e_manifest_x_adapter',
        description: 'Publishes approved X and Twitter post packets after explicit approval.',
        task_types: ['twitter'],
        tags: ['social', 'x', 'marketing'],
        metadata: { task_type_scores: { x_post: 0.95 } },
        pricing: { provider_markup_rate: 0.1, platform_margin_rate: 0.1 },
        success_rate: 0.96,
        avg_latency_sec: 9,
        healthcheck_url: `${BASE}/mock/x_post/health`,
        job_endpoint: `${BASE}/mock/x_post/jobs`
      }
    };
    const manifestPreview = await assertPreview('/api/agents/import-manifest', token, manifestPayload, {
      layer: 'execution',
      role: 'channel_adapter',
      upstreamTask: 'writing'
    });
    assert.ok(manifestPreview.body.routing_confirmation.inferred.upstream.resolved.some((agent) => agent.id === 'agent_writer_01'));
    const manifestConfirmed = await assertConfirmed('/api/agents/import-manifest', token, manifestPayload, {
      layer: 'execution',
      role: 'channel_adapter',
      upstreamTask: 'writing'
    });
    assert.equal(manifestConfirmed.body.agent.verificationStatus, 'verified');

    const urlPayload = { manifest_url: `${MANIFEST_BASE}/writer-manifest.json` };
    await assertPreview('/api/agents/import-url', token, urlPayload, {
      layer: 'content_generation',
      role: 'writer_planner',
      upstreamTask: 'research'
    });
    const urlConfirmed = await assertConfirmed('/api/agents/import-url', token, urlPayload, {
      layer: 'content_generation',
      role: 'writer_planner',
      upstreamTask: 'research'
    });
    assert.equal(urlConfirmed.body.import_mode, 'manifest-url');
    assert.equal(urlConfirmed.body.agent.verificationStatus, 'verified');

    const camelCaseConfirmed = await request('/api/agents/import-url', {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify({
        manifest_url: `${MANIFEST_BASE}/x-manifest.json`,
        confirmRouting: true
      })
    });
    assert.equal(camelCaseConfirmed.status, 201);
    assert.equal(camelCaseConfirmed.body.agent.metadata.routing_confirmation.confirmed, true);
    assert.equal(camelCaseConfirmed.body.agent.metadata.agent_layer, 'execution');

    const catalog = await request('/api/agents');
    assert.equal(catalog.status, 200);
    const manualPublic = catalog.body.agents.find((agent) => agent.id === manualConfirmed.body.agent.id);
    const manifestPublic = catalog.body.agents.find((agent) => agent.id === manifestConfirmed.body.agent.id);
    const urlPublic = catalog.body.agents.find((agent) => agent.id === urlConfirmed.body.agent.id);
    assert.equal(manualPublic.links.layer, 'research');
    assert.equal(manifestPublic.links.layer, 'execution');
    assert.ok(manifestPublic.links.upstream.task_types.includes('writing'));
    assert.equal(urlPublic.links.layer, 'content_generation');

    console.log('agent registration routing e2e qa passed');
  } finally {
    await stopChild(child);
    await closeServer(manifestServer);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
