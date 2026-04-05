import assert from 'node:assert/strict';
import { normalizeManifest, validateManifest } from '../lib/manifest.js';
import { verifyAgentByHealthcheck } from '../lib/verify.js';
const token = 'ownership-token-123';
const base = 'https://qa-agent.test';
const originalFetch = globalThis.fetch;

globalThis.fetch = async (url) => {
  const target = String(url);
  if (target === `${base}/health`) {
    return new Response(JSON.stringify({ ok: true, service: 'qa-agent' }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  }
  if (target === `${base}/.well-known/agent-challenge.txt`) {
    return new Response(`prove:${token}`, {
      status: 200,
      headers: { 'content-type': 'text/plain' }
    });
  }
  return new Response('not found', { status: 404, headers: { 'content-type': 'text/plain' } });
};

try {
  const manifest = normalizeManifest({
    schema_version: 'agent-manifest/v1',
    name: 'qa_agent',
    task_types: ['research'],
    pricing: { premium_rate: 0.2, basic_rate: 0.1 },
    healthcheck_url: `${base}/health`,
    verification: {
      challenge_path: '/.well-known/agent-challenge.txt',
      challenge_token: token
    }
  }, { sourceUrl: `${base}/agent.json` });

  const valid = validateManifest(manifest);
  assert.equal(valid.ok, true);

  const verified = await verifyAgentByHealthcheck({
    manifestUrl: `${base}/agent.json`,
    metadata: {
      manifest: {
        healthcheckUrl: `${base}/health`,
        sourceUrl: `${base}/agent.json`,
        verification: {
          challengePath: '/.well-known/agent-challenge.txt',
          challengeToken: token
        }
      }
    }
  });
  assert.equal(verified.ok, true);
  assert.equal(verified.details.ownershipChallenge, 'passed');

  const invalidSchema = validateManifest(normalizeManifest({
    schema_version: 'v0',
    name: 'bad',
    task_types: ['research'],
    pricing: { premium_rate: 0.2, basic_rate: 0.1 }
  }));
  assert.equal(invalidSchema.ok, false);

  const invalidChallenge = await verifyAgentByHealthcheck({
    manifestUrl: `${base}/agent.json`,
    metadata: {
      manifest: {
        healthcheckUrl: `${base}/health`,
        sourceUrl: `${base}/agent.json`,
        verification: {
          challengePath: '/.well-known/agent-challenge.txt',
          challengeToken: 'wrong-token'
        }
      }
    }
  });
  assert.equal(invalidChallenge.ok, false);
  assert.equal(invalidChallenge.code, 'ownership_challenge_failed');
  assert.equal(invalidChallenge.category, 'ownership_verification');
  assert.equal(invalidChallenge.details.ownershipChallenge, 'failed');

  const missingHealthcheck = await verifyAgentByHealthcheck({
    manifestUrl: `${base}/agent.json`,
    metadata: { manifest: { sourceUrl: `${base}/agent.json` } }
  });
  assert.equal(missingHealthcheck.ok, false);
  assert.equal(missingHealthcheck.code, 'healthcheck_http_error');
  assert.equal(missingHealthcheck.category, 'healthcheck_http');

  console.log('manifest verify qa passed');
} finally {
  globalThis.fetch = originalFetch;
}
