import assert from 'node:assert/strict';
import { normalizeManifest, validateManifest, parseAndValidateManifest } from '../lib/manifest.js';

const valid = normalizeManifest({
  schema_version: 'agent-manifest/v1',
  name: 'valid_agent',
  task_types: ['research', 'summary'],
  pricing: { premium_rate: 0.2, basic_rate: 0.1 },
  success_rate: 0.95,
  avg_latency_sec: 10
});
assert.equal(validateManifest(valid).ok, true);

const noName = validateManifest(normalizeManifest({
  schema_version: 'agent-manifest/v1',
  task_types: ['research'],
  pricing: { premium_rate: 0.2, basic_rate: 0.1 }
}));
assert.equal(noName.ok, false);

const badSuccess = validateManifest(normalizeManifest({
  schema_version: 'agent-manifest/v1',
  name: 'bad_success',
  task_types: ['research'],
  pricing: { premium_rate: 0.2, basic_rate: 0.1 },
  success_rate: 2
}));
assert.equal(badSuccess.ok, false);

const badChallenge = validateManifest(normalizeManifest({
  schema_version: 'agent-manifest/v1',
  name: 'bad_challenge',
  task_types: ['research'],
  pricing: { premium_rate: 0.2, basic_rate: 0.1 },
  verification: { challenge_token: 'abc' }
}));
assert.equal(badChallenge.ok, false);

const validBearerAuth = validateManifest(normalizeManifest({
  schema_version: 'agent-manifest/v1',
  name: 'auth_agent',
  task_types: ['research'],
  pricing: { premium_rate: 0.2, basic_rate: 0.1 },
  auth: { type: 'bearer', token: 'top-secret' }
}));
assert.equal(validBearerAuth.ok, true);

const badAuthType = validateManifest(normalizeManifest({
  schema_version: 'agent-manifest/v1',
  name: 'bad_auth_type',
  task_types: ['research'],
  pricing: { premium_rate: 0.2, basic_rate: 0.1 },
  auth: { type: 'oauth2' }
}));
assert.equal(badAuthType.ok, false);

const missingHeaderToken = validateManifest(normalizeManifest({
  schema_version: 'agent-manifest/v1',
  name: 'missing_header_token',
  task_types: ['research'],
  pricing: { premium_rate: 0.2, basic_rate: 0.1 },
  auth: { type: 'header', header_name: 'x-agent-key' }
}));
assert.equal(missingHeaderToken.ok, false);

assert.throws(() => parseAndValidateManifest('{"schema_version":"agent-manifest/v1","name":"x","task_types":[],"pricing":{"premium_rate":0.2,"basic_rate":0.1}}'), /manifest/i);

console.log('manifest validation qa passed');
