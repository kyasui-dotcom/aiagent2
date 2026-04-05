import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = Number(process.env.PORT || 4328);
const BASE = `http://127.0.0.1:${PORT}`;
const stateDir = mkdtempSync(join(tmpdir(), 'agent-broker-deploy-ops-qa-'));
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
    env: {
      ...process.env,
      PORT: String(PORT),
      BROKER_STATE_PATH: statePath,
      APP_VERSION: '0.2.0-test',
      DEPLOY_TARGET: 'cloudflare-worker'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  try {
    await waitForServer();

    const health = await request('/api/health');
    assert.equal(health.status, 200);
    assert.equal(health.body.version, '0.2.0-test');
    assert.equal(health.body.deploy_target, 'cloudflare-worker');

    const ready = await request('/api/ready');
    assert.equal(ready.status, 200);
    assert.equal(ready.body.ready, true);

    const version = await request('/api/version');
    assert.equal(version.status, 200);
    assert.equal(version.body.version, '0.2.0-test');

    const metrics = await request('/api/metrics');
    assert.equal(metrics.status, 200);
    assert.equal(metrics.body.deploy_target, 'cloudflare-worker');
    assert.ok(metrics.body.storage.kind);

    const envExample = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
    assert.ok(envExample.includes('SESSION_SECRET='));
    assert.ok(envExample.includes('BROKER_STATE_PATH='));

    const deploymentDoc = readFileSync(new URL('../DEPLOYMENT.md', import.meta.url), 'utf8');
    assert.ok(deploymentDoc.includes('Cloudflare Workers + D1'));
    assert.ok(deploymentDoc.includes('/api/ready'));

    console.log('deployment ops qa passed');
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
