import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createD1LikeStorage } from '../lib/storage.js';
import { buildMcpDiscovery, handleMcpJsonRpc, MCP_PROTOCOL_VERSION } from '../lib/mcp.js';

execFileSync(process.execPath, ['--check', fileURLToPath(new URL('../lib/mcp.js', import.meta.url))], { stdio: 'pipe' });

const discovery = buildMcpDiscovery('https://aiagent-marketplace.net/apps.html');
assert.equal(discovery.server_url, 'https://aiagent-marketplace.net/mcp');
assert.equal(discovery.protocol_version, MCP_PROTOCOL_VERSION);
assert.ok(discovery.capabilities.tools.includes('cait.list_apps'));
assert.ok(discovery.capabilities.resources.includes('cait://apps'));

const storage = createD1LikeStorage(null, { allowInMemory: true });
const state = await storage.getState();
const catalog = { apps: state.apps, agents: state.agents };

const initialize = handleMcpJsonRpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }, catalog, { version: 'qa' });
assert.equal(initialize.result.protocolVersion, MCP_PROTOCOL_VERSION);
assert.equal(initialize.result.serverInfo.name, 'cait-marketplace');

const ping = handleMcpJsonRpc({ jsonrpc: '2.0', id: 11, method: 'ping', params: {} }, catalog);
assert.deepEqual(ping.result, {});

const tools = handleMcpJsonRpc({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }, catalog);
const listAppsTool = tools.result.tools.find((tool) => tool.name === 'cait.list_apps');
assert.ok(listAppsTool);
assert.equal(listAppsTool.annotations.readOnlyHint, true);
assert.ok(listAppsTool.outputSchema.properties.apps);

const apps = handleMcpJsonRpc({
  jsonrpc: '2.0',
  id: 3,
  method: 'tools/call',
  params: { name: 'cait.list_apps', arguments: { query: 'analytics', limit: 5 } }
}, catalog);
const appPayload = JSON.parse(apps.result.content[0].text);
assert.ok(appPayload.apps.some((app) => app.id === 'analytics-console'));
assert.ok(appPayload.apps.every((app) => app.auth === undefined), 'MCP app catalog must not expose auth objects');
assert.deepEqual(apps.result.structuredContent, appPayload);

const templates = handleMcpJsonRpc({ jsonrpc: '2.0', id: 9, method: 'resources/templates/list', params: {} }, catalog);
assert.ok(templates.result.resourceTemplates.some((template) => template.uriTemplate === 'cait://apps{?query,limit}'));

const resource = handleMcpJsonRpc({
  jsonrpc: '2.0',
  id: 4,
  method: 'resources/read',
  params: { uri: 'cait://apps?query=analytics&limit=2' }
}, catalog, { requestUrl: 'https://aiagent-marketplace.net/mcp' });
assert.equal(resource.result.contents[0].mimeType, 'application/json');
assert.ok(resource.result.contents[0].text.includes('analytics-console'));

const prompts = handleMcpJsonRpc({ jsonrpc: '2.0', id: 5, method: 'prompts/list', params: {} }, catalog);
assert.ok(prompts.result.prompts.some((prompt) => prompt.name === 'cait.choose_app_for_order'));

const prompt = handleMcpJsonRpc({
  jsonrpc: '2.0',
  id: 6,
  method: 'prompts/get',
  params: { name: 'cait.choose_app_for_order', arguments: { objective: 'Review analytics before SEO work' } }
}, catalog);
assert.ok(prompt.result.messages[0].content.text.includes('Review analytics before SEO work'));

const batch = handleMcpJsonRpc([
  { jsonrpc: '2.0', id: 7, method: 'ping', params: {} },
  { jsonrpc: '2.0', id: 8, method: 'tools/list', params: {} }
], catalog);
assert.equal(batch.length, 2);

const invalid = handleMcpJsonRpc({ jsonrpc: '2.0', id: 10, params: {} }, catalog);
assert.equal(invalid.error.code, -32600);

console.log('mcp qa passed');
