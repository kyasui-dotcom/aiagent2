import assert from 'node:assert/strict';
import worker from '../worker.js';

const env = {
  APP_VERSION: '0.2.0-test',
  MY_BINDING: null,
  ASSETS: {
    async fetch() {
      return new Response('not found', { status: 404 });
    }
  }
};

async function request(path, init) {
  const res = await worker.fetch(new Request(`https://example.test${path}`, init), env);
  const body = await res.json();
  return { status: res.status, body };
}

const health = await request('/api/health');
assert.equal(health.status, 200);
assert.equal(health.body.version, '0.2.0-test');
assert.equal(health.body.deploy_target, 'cloudflare-worker');

const ready = await request('/api/ready');
assert.equal(ready.status, 200);
assert.equal(ready.body.ready, true);
assert.equal(ready.body.version, '0.2.0-test');

const version = await request('/api/version');
assert.equal(version.status, 200);
assert.equal(version.body.version, '0.2.0-test');
assert.equal(version.body.runtime, 'workerd');

const metrics = await request('/api/metrics');
assert.equal(metrics.status, 200);
assert.equal(metrics.body.version, '0.2.0-test');
assert.equal(metrics.body.deploy_target, 'cloudflare-worker');
assert.ok(metrics.body.stats);
assert.ok(metrics.body.storage);
assert.equal(typeof metrics.body.stats.retryableRuns, 'number');
assert.equal(typeof metrics.body.stats.timedOutRuns, 'number');
assert.equal(typeof metrics.body.stats.terminalRuns, 'number');
assert.ok(metrics.body.stats.nextRetryAt === null || typeof metrics.body.stats.nextRetryAt === 'string');
assert.equal(typeof metrics.body.billing_audit_count, 'number');
assert.equal(typeof metrics.body.event_count, 'number');

const registered = await request('/api/agents', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    name: 'qa_register',
    description: 'qa registered worker agent',
    task_types: 'research,summary'
  })
});
assert.equal(registered.status, 201);
assert.equal(registered.body.ok, true);
assert.equal(registered.body.agent.name, 'QA_REGISTER');

const imported = await request('/api/agents/import-manifest', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    manifest: {
      schema_version: 'agent-manifest/v1',
      name: 'qa_manifest',
      description: 'qa manifest import',
      task_types: ['ops'],
      pricing: { premium_rate: 0.2, basic_rate: 0.1 },
      success_rate: 0.95,
      avg_latency_sec: 12,
      healthcheck_url: 'https://worker-qa.example/health',
      endpoints: { jobs: 'https://worker-qa.example/jobs' }
    }
  })
});
assert.equal(imported.status, 201);
assert.equal(imported.body.ok, true);
assert.equal(imported.body.agent.verificationStatus, 'manifest_loaded');

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url;
  if (url === 'https://worker-qa.example/manifest.json') {
    return new Response(JSON.stringify({
      schema_version: 'agent-manifest/v1',
      name: 'qa_import_url',
      task_types: ['research'],
      pricing: { premium_rate: 0.15, basic_rate: 0.1 },
      success_rate: 0.96,
      avg_latency_sec: 9,
      healthcheck_url: 'https://worker-qa.example/health'
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (url === 'https://worker-qa.example/health') {
    return new Response(JSON.stringify({ ok: true, service: 'qa-agent' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return originalFetch(input, init);
};

try {
  const importedByUrl = await request('/api/agents/import-url', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ manifest_url: 'https://worker-qa.example/manifest.json' })
  });
  assert.equal(importedByUrl.status, 201);
  assert.equal(importedByUrl.body.ok, true);

  const verified = await request(`/api/agents/${importedByUrl.body.agent.id}/verify`, { method: 'POST' });
  assert.equal(verified.status, 200);
  assert.equal(verified.body.verification.ok, true);
  assert.equal(verified.body.agent.verificationStatus, 'verified');
} finally {
  globalThis.fetch = originalFetch;
}

console.log('worker api qa passed');
