import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createD1LikeStorage } from '../lib/storage.js';
import {
  createAppFromManifest,
  normalizeAppManifest,
  sanitizeAppForPublic,
  validateAppManifest
} from '../lib/apps.js';
import { createAppContextRecord, publicAppContext } from '../lib/app-context.js';

const filesToCheck = [
  '../lib/apps.js',
  '../lib/app-context.js',
  '../lib/storage.js',
  '../server.js',
  '../worker.js',
  '../public/chat.js',
  '../scripts/external-chat.mjs'
];

for (const relative of filesToCheck) {
  execFileSync(process.execPath, ['--check', fileURLToPath(new URL(relative, import.meta.url))], { stdio: 'pipe' });
}

const sampleManifest = {
  schema_version: 'app-manifest/v1',
  kind: 'application',
  name: 'My Action App',
  description: 'Receives approved CAIt action packets.',
  entry_url: 'https://example.com/',
  healthcheck_url: 'https://example.com/api/health',
  capabilities: ['x_post_queue', 'approval_packet'],
  required_connectors: ['x'],
  requires_approval_for: ['post_now'],
  input_contract: {
    schemaVersion: 'cait-app-agent-transfer/v1',
    accepts: ['post_text', 'strategy']
  },
  handoff: {
    create_url: 'https://example.com/api/cait/handoff',
    method: 'POST',
    open_url_param: 'cait_handoff'
  },
  mcp: {
    server_url: 'https://example.com/mcp',
    transport: 'streamable_http',
    auth: 'oauth',
    tools: ['example.prepare_packet'],
    resources: ['example://packets']
  },
  auth: {
    token: 'secret'
  }
};

const normalized = normalizeAppManifest(sampleManifest);
assert.equal(normalized.schemaVersion, 'app-manifest/v1');
assert.equal(normalized.kind, 'application');
assert.equal(normalized.entryUrl, 'https://example.com/');
assert.equal(normalized.handoff.createUrl, 'https://example.com/api/cait/handoff');
assert.equal(normalized.mcp.serverUrl, 'https://example.com/mcp');
assert.deepEqual(normalized.mcp.tools, ['example.prepare_packet']);
assert.deepEqual(normalized.capabilities, ['x_post_queue', 'approval_packet']);
assert.deepEqual(normalized.requiredConnectors, ['x']);
assert.deepEqual(validateAppManifest(normalized), { ok: true, errors: [] });

const app = createAppFromManifest(normalized, { owner: 'publisher', metadata: { githubLogin: 'publisher' } });
assert.equal(app.owner, 'publisher');
assert.equal(app.name, 'My Action App');
assert.equal(app.entryUrl, 'https://example.com/');
assert.equal(app.handoff.createUrl, 'https://example.com/api/cait/handoff');
assert.equal(app.mcp.serverUrl, 'https://example.com/mcp');

const publicApp = sanitizeAppForPublic({
  ...app,
  auth: { token: 'secret' },
  metadata: {
    ...app.metadata,
    manifest: {
      ...app.metadata.manifest,
      auth: { type: 'bearer', token: 'secret' }
    }
  }
});
assert.equal(publicApp.auth, undefined);
assert.equal(publicApp.metadata.manifest.auth.redacted, true);
assert.equal(publicApp.metadata.manifest.auth.token, undefined);

const storage = createD1LikeStorage(null, { allowInMemory: true });
const initial = await storage.getState();
assert.ok(Array.isArray(initial.apps), 'storage state should include apps');
assert.ok(Array.isArray(initial.appContexts), 'storage state should include app contexts');
assert.ok(initial.apps.some((item) => item.id === 'x-client-ops'), 'default X Client Ops app should be seeded');
const contextRecord = createAppContextRecord({
  source_app: 'x-client-ops',
  title: 'X action packet',
  summary: 'Approved post draft and strategy context.',
  facts: ['draft ready']
}, { login: 'publisher' }, { id: 'ctx-test', accessToken: 'ctx_secret' });
await storage.mutate(async (draft) => {
  draft.apps.unshift(app);
  draft.appContexts.unshift(contextRecord);
});
const after = await storage.getState();
assert.ok(after.apps.some((item) => item.id === app.id), 'custom app should persist in storage state');
assert.ok(after.appContexts.some((item) => item.id === 'ctx-test'), 'app context should persist in storage state');
assert.equal(publicAppContext(contextRecord).app_context_token, undefined, 'public app context must not expose token');

const server = readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../worker.js', import.meta.url), 'utf8');
const chat = readFileSync(new URL('../public/chat.js', import.meta.url), 'utf8');
const cli = readFileSync(new URL('../scripts/external-chat.mjs', import.meta.url), 'utf8');
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const cliHelp = readFileSync(new URL('../public/cli-help.html', import.meta.url), 'utf8');

for (const source of [server, worker]) {
  assert.ok(source.includes('/api/apps'), 'server runtimes should expose /api/apps');
  assert.ok(source.includes('/api/apps/import-manifest'), 'server runtimes should expose app manifest import');
  assert.ok(source.includes('/api/apps/import-url'), 'server runtimes should expose app URL import');
  assert.ok(source.includes('/api/app-contexts'), 'server runtimes should expose generic app context API');
  assert.ok(source.includes('/.well-known/mcp.json'), 'server runtimes should expose MCP discovery metadata');
  assert.ok(source.includes('/mcp'), 'server runtimes should expose an MCP JSON-RPC endpoint');
  assert.ok(source.includes('handleMcpRequest'), 'server runtimes should handle MCP JSON-RPC requests');
  assert.ok(source.includes('/api/apps\\/[^/]+\\/handoff') || source.includes('/api\\/apps\\/[^/]+\\/handoff'), 'server runtimes should expose app handoff proxy');
  assert.ok(source.includes('handleRegisterApp'), 'server runtimes should register apps');
  assert.ok(source.includes('handleAppHandoff'), 'server runtimes should proxy app handoff payloads');
  assert.ok(source.includes('handleCreateAppContext'), 'server runtimes should accept app context payloads');
  assert.ok(source.includes('handleVerifyApp'), 'server runtimes should verify apps');
  assert.ok(source.includes('apps:'), 'server runtimes should include apps in snapshots');
}

assert.ok(chat.includes('registeredApps: []'), 'chat state should include registered apps');
assert.ok(chat.includes("api(catalogApiPath('/api/apps', options)"), 'chat should refresh registered apps with paged catalog API');
assert.ok(chat.includes('appManifestSources'), 'chat should merge built-in and registered apps');
assert.ok(chat.includes('/api/apps/${encodeURIComponent(manifest.id || appId)}/handoff'), 'chat should call the same-origin app handoff proxy');

assert.ok(cli.includes('runAppCli'), 'CLI should expose app commands');
assert.ok(cli.includes('/api/apps/import-manifest'), 'CLI should import app manifests');
assert.ok(cli.includes('app register'), 'CLI usage should mention app register');
assert.ok(cli.includes('/api/app-contexts'), 'CLI should create and read server-side app contexts');
assert.ok(cli.includes('context-create'), 'CLI usage should mention app context creation');

assert.ok(readme.includes('/api/apps/import-manifest'), 'README should document app manifest import');
assert.ok(readme.includes('App registration with CAIt API key'), 'README should document app registration');
assert.ok(readme.includes('App context handoff'), 'README should document server-side app context handoff');
assert.ok(readme.includes('/api/app-contexts'), 'README should document the app context API');
assert.ok(cliHelp.includes('/api/apps/import-manifest'), 'CLI help page should document app manifest import');
assert.ok(cliHelp.includes('/api/app-contexts'), 'CLI help page should document app context API');
assert.ok(cliHelp.includes('APP CONTEXT HANDOFF'), 'CLI help page should document app context handoff');

console.log('app registration qa passed');
