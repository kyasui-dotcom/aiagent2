import assert from 'node:assert/strict';
import worker from '../worker.js';

const env = {
  APP_VERSION: '0.2.0-test',
  ALLOW_IN_MEMORY_STORAGE: '1',
  MY_BINDING: null,
  ASSETS: {
    async fetch() {
      return new Response('not found', { status: 404 });
    }
  }
};

async function request(path, init) {
  const res = await worker.fetch(new Request(`https://example.test${path}`, init), env);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

const auth = await request('/auth/status');
assert.equal(auth.status, 200);
assert.equal(auth.body.releaseStage, 'public');
assert.equal(auth.body.openWriteApiEnabled, false);
assert.equal(auth.body.guestRunReadEnabled, false);
assert.equal(auth.body.devApiEnabled, false);
assert.equal(auth.body.exposeJobSecrets, false);

const snapshot = await request('/api/snapshot');
assert.equal(snapshot.status, 200);
assert.deepEqual(snapshot.body.jobs, []);
assert.deepEqual(snapshot.body.billingAudits, []);

const register = await request('/api/agents', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ name: 'release_guard', task_types: 'summary' })
});
assert.equal(register.status, 401);

const createJob = await request('/api/jobs', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ parent_agent_id: 'qa', task_type: 'summary', prompt: 'release posture check' })
});
assert.equal(createJob.status, 401);

const seed = await request('/api/seed', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({})
});
assert.equal(seed.status, 403);

const retry = await request('/api/dev/dispatch-retry', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ job_id: 'missing' })
});
assert.equal(retry.status, 403);

console.log('release posture qa passed');
