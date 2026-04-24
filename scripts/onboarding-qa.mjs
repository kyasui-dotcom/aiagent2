import assert from 'node:assert/strict';
import worker from '../worker.js';

const env = {
  APP_VERSION: '0.2.0-test',
  ALLOW_OPEN_WRITE_API: '1',
  ALLOW_GUEST_RUN_READ_API: '1',
  ALLOW_DEV_API: '1',
  ALLOW_IN_MEMORY_STORAGE: '1',
  EXPOSE_JOB_SECRETS: '1',
  BASE_URL: 'https://aiagent2.example',
  MY_BINDING: null,
  ASSETS: {
    async fetch() {
      return new Response('not found', { status: 404 });
    }
  }
};

async function request(path, init) {
  const response = await worker.fetch(new Request(`https://aiagent2.example${path}`, init), env);
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input.url;
  const method = String(init.method || input?.method || 'GET').toUpperCase();
  if (url === 'https://ready.example/health') {
    return new Response(JSON.stringify({ ok: true, service: 'ready-agent' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (url === 'https://ready.example/jobs' && method === 'GET') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), { status: 405, headers: { 'content-type': 'application/json' } });
  }
  if (url === 'https://broken.example/health') {
    return new Response(JSON.stringify({ ok: true, service: 'broken-agent' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  if (url === 'https://broken.example/jobs' && method === 'GET') {
    return new Response(JSON.stringify({ error: 'missing route' }), { status: 404, headers: { 'content-type': 'application/json' } });
  }
  return originalFetch(input, init);
};

try {
  const readyImport = await request('/api/agents/import-manifest', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      manifest: {
        schema_version: 'agent-manifest/v1',
        name: 'ready_agent',
        task_types: ['seo'],
        success_rate: 0.95,
        avg_latency_sec: 10,
        healthcheck_url: 'https://ready.example/health',
        job_endpoint: 'https://ready.example/jobs'
      }
    })
  });
  assert.equal(readyImport.status, 201);
  const readyCheck = await request(`/api/agents/${readyImport.body.agent.id}/onboarding-check`);
  assert.equal(readyCheck.status, 200);
  assert.equal(readyCheck.body.onboarding.status, 'ready');
  assert.equal(readyCheck.body.onboarding.nextAction.title, 'Create the first run');
  assert.match(readyCheck.body.onboarding.explain.verify, /healthcheck/i);
  assert.ok(readyCheck.body.onboarding.checks.some((item) => item.key === 'job_endpoint' && item.status === 'pass'));

  const localOnlyImport = await request('/api/agents/import-manifest', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      manifest: {
        schema_version: 'agent-manifest/v1',
        name: 'local_only_agent',
        task_types: ['seo'],
        metadata: {
          repository: { provider: 'github', full_name: 'kyasui-dotcom/seo-agent' },
          endpoint_hints: {
            local_base_url: 'http://127.0.0.1:3001',
            local_healthcheck_url: 'http://127.0.0.1:3001/api/health',
            local_job_endpoint: 'http://127.0.0.1:3001/api/jobs'
          },
          execution_scope: 'local_desktop'
        }
      }
    })
  });
  assert.equal(localOnlyImport.status, 201);
  const localOnlyCheck = await request(`/api/agents/${localOnlyImport.body.agent.id}/onboarding-check`);
  assert.equal(localOnlyCheck.status, 200);
  assert.equal(localOnlyCheck.body.onboarding.status, 'local_only');
  assert.ok(localOnlyCheck.body.onboarding.summary.includes('local'));
  assert.ok(localOnlyCheck.body.onboarding.checks.some((item) => item.key === 'healthcheck' && /local/i.test(item.fix || '')));
  assert.ok(localOnlyCheck.body.onboarding.checks.some((item) => item.key === 'dispatch_readiness' && item.status === 'warn'));

  const brokenImport = await request('/api/agents/import-manifest', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      manifest: {
        schema_version: 'agent-manifest/v1',
        name: 'broken_agent',
        task_types: ['seo'],
        success_rate: 0.9,
        avg_latency_sec: 12,
        healthcheck_url: 'https://broken.example/health',
        job_endpoint: 'https://broken.example/jobs'
      }
    })
  });
  assert.equal(brokenImport.status, 201);
  const brokenCheck = await request(`/api/agents/${brokenImport.body.agent.id}/onboarding-check`);
  assert.equal(brokenCheck.status, 200);
  assert.equal(brokenCheck.body.onboarding.status, 'action_required');
  assert.ok(brokenCheck.body.onboarding.checks.some((item) => item.key === 'job_endpoint' && item.status === 'fail' && item.httpStatus === 404));
  assert.ok(brokenCheck.body.onboarding.checks.some((item) => item.key === 'job_endpoint' && /deploy/i.test(item.fix || '')));
  assert.equal(brokenCheck.body.onboarding.nextAction.title, 'Deploy the job route');
} finally {
  globalThis.fetch = originalFetch;
}

console.log('onboarding qa passed');
