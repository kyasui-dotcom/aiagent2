import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const PORT = Number(process.env.PORT || 4325);
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
  const child = spawn('node', ['server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(PORT),
      OPEN_CHAT_INTENT_LLM: 'openai',
      OPENAI_API_KEY: 'sk-should-not-be-used-for-work-chat',
      OPEN_CHAT_OPENAI_API_KEY: '',
      OPEN_CHAT_ALLOW_PLATFORM_OPENAI_FALLBACK: 'true',
      OPEN_CHAT_INTENT_ALLOWED_EMAILS: 'yasuikunihiro@gmail.com'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  try {
    await waitForServer();

    const chatIntentWithoutAllowedAccount = await request('/api/open-chat/intent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        prompt: 'I want more users and more revenue.',
        fallback_intent: 'natural_business_growth',
        user_language: 'English'
      })
    });
    assert.equal(chatIntentWithoutAllowedAccount.status, 503);
    assert.match(
      String(chatIntentWithoutAllowedAccount.body.error || ''),
      /OpenAI API key is not configured/,
      'Anonymous Work Chat must not reuse OPENAI_API_KEY as its LLM fallback key, even when platform fallback is enabled'
    );

    const imported = await request('/api/agents/import-manifest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        manifest: {
          schema_version: 'agent-manifest/v1',
          name: 'security_agent',
          task_types: ['research'],
          pricing: { premium_rate: 0.2, basic_rate: 0.1 },
          healthcheck_url: `${BASE}/mock/research/health`,
          verification: {
            challenge_url: 'https://example.com/.well-known/agent-challenge.txt',
            challenge_token: 'super-secret-token'
          },
          auth: {
            type: 'bearer',
            token: 'broker-only-secret'
          }
        }
      })
    });
    assert.equal(imported.status, 201);

    const agents = await request('/api/agents');
    assert.equal(agents.status, 200);
    const agent = agents.body.agents.find(a => a.id === imported.body.agent.id);
    assert.ok(agent);
    assert.equal(Boolean(agent.token), false, 'public agent should not expose token');
    assert.equal(agent.metadata.manifest.verification.challengeToken, undefined, 'public agent should not expose challenge token');
    assert.equal(agent.metadata.manifest.auth.token, undefined, 'public agent should not expose auth token');

    const localImport = await request('/api/agents/import-url', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ manifest_url: 'http://127.0.0.1:4323/public/removed-agent.json' })
    });
    assert.equal(localImport.status, 400, 'localhost manifest import should be blocked by default');

    const badScheme = await request('/api/agents/import-url', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ manifest_url: 'file:///tmp/agent.json' })
    });
    assert.equal(badScheme.status, 400, 'non-http scheme should be blocked');

    console.log('security hardening qa passed');
  } finally {
    child.kill('SIGTERM');
    await sleep(300);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
