import assert from 'node:assert/strict';
import {
  authenticateOrderApiKey,
  createOrderApiKeyInState,
  revokeOrderApiKeyInState,
  sanitizeAccountSettingsForClient,
  touchOrderApiKeyUsageInState
} from '../lib/shared.js';

const state = { agents: [], jobs: [], events: [], accounts: [] };

const created = createOrderApiKeyInState(
  state,
  'alice',
  { login: 'alice', name: 'Alice Example', email: 'alice@example.com' },
  'github-app',
  { label: 'codex-desktop' }
);

const createdTest = createOrderApiKeyInState(
  state,
  'alice',
  { login: 'alice', name: 'Alice Example', email: 'alice@example.com' },
  'github-app',
  { label: 'codex-test', mode: 'test' }
);

assert.equal(created.account.login, 'alice');
assert.equal(created.apiKey.label, 'codex-desktop');
assert.ok(created.apiKey.token.startsWith('ai2k_'));
assert.equal(created.apiKey.mode, 'live');
assert.deepEqual(created.apiKey.scopes, ['order:create', 'order:read', 'agent:create', 'agent:write', 'agent:read']);
assert.equal(createdTest.apiKey.mode, 'test');
assert.ok(createdTest.apiKey.token.startsWith('ai2kt_'));

const auth = authenticateOrderApiKey(state, created.apiKey.token);
assert.ok(auth);
assert.equal(auth.account.login, 'alice');
assert.equal(auth.apiKey.label, 'codex-desktop');
assert.equal(auth.apiKey.active, true);
assert.equal(auth.apiKey.mode, 'live');
assert.ok(auth.apiKey.scopes.includes('agent:write'));

const authTest = authenticateOrderApiKey(state, createdTest.apiKey.token);
assert.ok(authTest);
assert.equal(authTest.apiKey.mode, 'test');

const touched = touchOrderApiKeyUsageInState(state, 'alice', auth.apiKey.id, {
  lastUsedPath: '/api/agents/import-manifest',
  lastUsedMethod: 'POST'
});
assert.ok(touched);
assert.equal(touched.apiKey.lastUsedPath, '/api/agents/import-manifest');
assert.equal(touched.apiKey.lastUsedMethod, 'POST');
assert.ok(touched.apiKey.lastUsedAt);

const sanitized = sanitizeAccountSettingsForClient(state.accounts[0]);
assert.ok(Array.isArray(sanitized.apiAccess.orderKeys));
assert.equal('agentKeys' in sanitized.apiAccess, false);
assert.equal('keyHash' in sanitized.apiAccess.orderKeys[0], false);
assert.equal(sanitized.apiAccess.orderKeys[0].label, 'codex-test');
assert.equal(sanitized.apiAccess.orderKeys[0].mode, 'test');
assert.ok(sanitized.apiAccess.orderKeys[0].scopes.includes('agent:write'));

const revoked = revokeOrderApiKeyInState(state, 'alice', auth.apiKey.id, { login: 'alice', name: 'Alice Example' }, 'github-app');
assert.ok(revoked);
assert.equal(revoked.apiKey.active, false);
assert.ok(revoked.apiKey.revokedAt);
assert.equal(authenticateOrderApiKey(state, created.apiKey.token), null);

console.log('api keys qa passed');
