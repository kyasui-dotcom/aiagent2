import { expect, test } from '@playwright/test';

test.describe('CAIt MCP discovery', () => {
  test('publishes public MCP discovery and catalog tools', async ({ request, baseURL }) => {
    const discoveryResponse = await request.get('/.well-known/mcp.json');
    expect(discoveryResponse.ok()).toBe(true);
    const discovery = await discoveryResponse.json();
    expect(discovery.server_url).toBe(`${baseURL}/mcp`);
    expect(discovery.capabilities.tools).toContain('cait.list_apps');
    expect(discovery.capabilities.resources).toContain('cait://apps');

    const initializeResponse = await request.post('/mcp', {
      data: { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }
    });
    expect(initializeResponse.ok()).toBe(true);
    const initialize = await initializeResponse.json();
    expect(initialize.result.serverInfo.name).toBe('cait-marketplace');

    const toolsResponse = await request.post('/mcp', {
      data: { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }
    });
    expect(toolsResponse.ok()).toBe(true);
    const tools = await toolsResponse.json();
    const appTool = tools.result.tools.find((tool) => tool.name === 'cait.list_apps');
    expect(appTool).toBeTruthy();
    expect(appTool.annotations.readOnlyHint).toBe(true);
    expect(appTool.outputSchema.properties.apps).toBeTruthy();

    const appsResponse = await request.post('/mcp', {
      data: {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'cait.list_apps', arguments: { query: 'analytics', limit: 5 } }
      }
    });
    expect(appsResponse.ok()).toBe(true);
    const apps = await appsResponse.json();
    const payload = JSON.parse(apps.result.content[0].text);
    expect(payload.apps.map((app) => app.id)).toContain('analytics-console');
    expect(payload.apps.some((app) => app.auth || app.secret || app.token)).toBe(false);
    expect(apps.result.structuredContent.apps.map((app) => app.id)).toContain('analytics-console');

    const templatesResponse = await request.post('/mcp', {
      data: { jsonrpc: '2.0', id: 4, method: 'resources/templates/list', params: {} }
    });
    expect(templatesResponse.ok()).toBe(true);
    const templates = await templatesResponse.json();
    expect(templates.result.resourceTemplates.map((template) => template.uriTemplate)).toContain('cait://apps{?query,limit}');

    const promptResponse = await request.post('/mcp', {
      data: {
        jsonrpc: '2.0',
        id: 5,
        method: 'prompts/get',
        params: { name: 'cait.choose_app_for_order', arguments: { objective: 'Review analytics before SEO work' } }
      }
    });
    expect(promptResponse.ok()).toBe(true);
    const prompt = await promptResponse.json();
    expect(prompt.result.messages[0].content.text).toContain('Review analytics before SEO work');

    const batchResponse = await request.post('/mcp', {
      data: [
        { jsonrpc: '2.0', id: 6, method: 'ping', params: {} },
        { jsonrpc: '2.0', id: 7, method: 'resources/read', params: { uri: 'cait://apps?query=analytics&limit=2' } }
      ]
    });
    expect(batchResponse.ok()).toBe(true);
    const batch = await batchResponse.json();
    expect(batch).toHaveLength(2);
    expect(batch[0].result).toEqual({});
    expect(batch[1].result.contents[0].text).toContain('analytics-console');

    const invalidResponse = await request.post('/mcp', {
      data: { jsonrpc: '2.0', id: 8, params: {} }
    });
    expect(invalidResponse.ok()).toBe(true);
    const invalid = await invalidResponse.json();
    expect(invalid.error.code).toBe(-32600);
  });
});
