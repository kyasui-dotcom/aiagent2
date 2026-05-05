export const MCP_PROTOCOL_VERSION = '2025-06-18';
export const MCP_SERVER_NAME = 'cait-marketplace';

function safeString(value = '', max = 500) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function originFromRequestUrl(requestUrl = '', fallback = '') {
  try {
    const parsed = new URL(requestUrl, fallback || 'https://aiagent-marketplace.net');
    return parsed.origin;
  } catch {
    return fallback || 'https://aiagent-marketplace.net';
  }
}

function jsonText(value) {
  return JSON.stringify(value, null, 2);
}

function jsonRpcError(id, code, message, data) {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
      ...(data == null ? {} : { data })
    }
  };
}

function summarizeApp(app = {}) {
  return {
    id: safeString(app.id, 120),
    name: safeString(app.name, 160),
    description: safeString(app.description, 700),
    entry_url: safeString(app.entryUrl || app.entry_url, 800),
    capabilities: Array.isArray(app.capabilities) ? app.capabilities.slice(0, 40) : [],
    required_connectors: Array.isArray(app.requiredConnectors) ? app.requiredConnectors.slice(0, 24) : [],
    requires_approval_for: Array.isArray(app.requiresApprovalFor) ? app.requiresApprovalFor.slice(0, 24) : [],
    mcp: app.mcp && typeof app.mcp === 'object' ? app.mcp : null
  };
}

function summarizeAgent(agent = {}) {
  return {
    id: safeString(agent.id, 120),
    name: safeString(agent.name, 160),
    description: safeString(agent.description, 700),
    task_types: Array.isArray(agent.task_types) ? agent.task_types.slice(0, 24) : (Array.isArray(agent.taskTypes) ? agent.taskTypes.slice(0, 24) : []),
    status: safeString(agent.status, 80),
    verification_status: safeString(agent.verificationStatus || agent.verification_status, 80)
  };
}

function filterCatalog(items = [], query = '', limit = 20) {
  const needle = safeString(query, 160).toLowerCase();
  const max = Math.max(1, Math.min(50, Number(limit) || 20));
  return items
    .filter((item) => {
      if (!needle) return true;
      return [
        item.id,
        item.name,
        item.description,
        ...(Array.isArray(item.capabilities) ? item.capabilities : []),
        ...(Array.isArray(item.task_types) ? item.task_types : [])
      ].join(' ').toLowerCase().includes(needle);
    })
    .slice(0, max);
}

function toolResult(payload = {}) {
  return {
    content: [
      {
        type: 'text',
        text: jsonText(payload)
      }
    ],
    structuredContent: payload
  };
}

function resourceText(uri, payload = {}) {
  return {
    contents: [
      {
        uri,
        mimeType: 'application/json',
        text: jsonText(payload)
      }
    ]
  };
}

function mcpTools() {
  const catalogListSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      query: { type: 'string', description: 'Optional search text.' },
      limit: { type: 'number', minimum: 1, maximum: 50, description: 'Maximum number of records to return.' }
    }
  };
  return [
    {
      name: 'cait.list_apps',
      title: 'List CAIt apps',
      description: 'Search the public CAIt app catalog and return app handoff capabilities, connector needs, approval gates, and MCP metadata.',
      inputSchema: catalogListSchema,
      outputSchema: {
        type: 'object',
        required: ['apps', 'total'],
        properties: {
          apps: { type: 'array', items: { type: 'object' } },
          total: { type: 'number' }
        }
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true
      }
    },
    {
      name: 'cait.list_agents',
      title: 'List CAIt agents',
      description: 'Search the public CAIt agent catalog for routable worker and leader agents.',
      inputSchema: catalogListSchema,
      outputSchema: {
        type: 'object',
        required: ['agents', 'total'],
        properties: {
          agents: { type: 'array', items: { type: 'object' } },
          total: { type: 'number' }
        }
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true
      }
    }
  ];
}

function mcpResources() {
  return [
    {
      uri: 'cait://apps',
      name: 'CAIt app catalog',
      title: 'CAIt apps',
      description: 'Public CAIt app catalog with handoff and MCP metadata.',
      mimeType: 'application/json'
    },
    {
      uri: 'cait://agents',
      name: 'CAIt agent catalog',
      title: 'CAIt agents',
      description: 'Public CAIt worker and leader agent catalog.',
      mimeType: 'application/json'
    }
  ];
}

function mcpResourceTemplates() {
  return [
    {
      uriTemplate: 'cait://apps{?query,limit}',
      name: 'Search CAIt apps',
      title: 'Search CAIt apps',
      description: 'Search public CAIt apps by name, description, capability, connector, or tag.',
      mimeType: 'application/json'
    },
    {
      uriTemplate: 'cait://agents{?query,limit}',
      name: 'Search CAIt agents',
      title: 'Search CAIt agents',
      description: 'Search public CAIt agents by name, description, or task type.',
      mimeType: 'application/json'
    }
  ];
}

function mcpPrompts() {
  return [
    {
      name: 'cait.choose_app_for_order',
      title: 'Choose a CAIt app for an order',
      description: 'Help a client choose the right CAIt app or agent handoff for a concrete work order.',
      arguments: [
        {
          name: 'objective',
          description: 'The user objective or work order.',
          required: true
        }
      ]
    }
  ];
}

export function buildMcpDiscovery(requestUrl = '', options = {}) {
  const origin = originFromRequestUrl(requestUrl, options.origin || '');
  return {
    name: MCP_SERVER_NAME,
    title: 'CAIt Marketplace MCP',
    description: 'Public MCP endpoint for discovering CAIt apps, agent catalog entries, handoff capabilities, connector requirements, and approval gates.',
    protocol_version: MCP_PROTOCOL_VERSION,
    server_url: `${origin}/mcp`,
    capabilities: {
      tools: ['cait.list_apps', 'cait.list_agents'],
      resources: ['cait://apps', 'cait://agents'],
      resource_templates: ['cait://apps{?query,limit}', 'cait://agents{?query,limit}'],
      prompts: ['cait.choose_app_for_order']
    },
    auth: {
      type: 'none',
      note: 'This public endpoint exposes catalog metadata only. User data, app contexts, and write actions stay behind CAIt session or API-key auth.'
    }
  };
}

function parseResourceQuery(uri = '') {
  const text = safeString(uri, 500);
  const [, queryString = ''] = text.split('?');
  const params = new URLSearchParams(queryString);
  return {
    query: params.get('query') || '',
    limit: Number(params.get('limit') || 50) || 50
  };
}

function handleMcpJsonRpcSingle(body = {}, catalog = {}, options = {}) {
  const id = Object.prototype.hasOwnProperty.call(body, 'id') ? body.id : null;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return jsonRpcError(id, -32600, 'Invalid Request');
  if (body.jsonrpc && body.jsonrpc !== '2.0') return jsonRpcError(id, -32600, 'Invalid JSON-RPC version');
  const method = safeString(body.method, 120);
  if (!method) return jsonRpcError(id, -32600, 'Missing method');
  const params = body.params && typeof body.params === 'object' ? body.params : {};
  const apps = Array.isArray(catalog.apps) ? catalog.apps.map(summarizeApp).filter((item) => item.id) : [];
  const agents = Array.isArray(catalog.agents) ? catalog.agents.map(summarizeAgent).filter((item) => item.id) : [];
  const requestUrl = options.requestUrl || '';

  let result;
  if (method === 'initialize') {
    result = {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {
        tools: { listChanged: false },
        resources: { subscribe: false, listChanged: false },
        prompts: { listChanged: false }
      },
      serverInfo: {
        name: MCP_SERVER_NAME,
        title: 'CAIt Marketplace MCP',
        version: options.version || '0.2.0'
      },
      instructions: 'Use this server for public CAIt marketplace discovery. Do not send secrets or private user data to public catalog tools.'
    };
  } else if (method === 'ping') {
    result = {};
  } else if (method === 'tools/list') {
    result = { tools: mcpTools() };
  } else if (method === 'tools/call') {
    const name = safeString(params.name, 120);
    const args = params.arguments && typeof params.arguments === 'object' ? params.arguments : {};
    if (name === 'cait.list_apps') {
      result = toolResult({ apps: filterCatalog(apps, args.query, args.limit), total: apps.length });
    } else if (name === 'cait.list_agents') {
      result = toolResult({ agents: filterCatalog(agents, args.query, args.limit), total: agents.length });
    } else {
      return { jsonrpc: '2.0', id, error: { code: -32602, message: `Unknown tool: ${name || '(empty)'}` } };
    }
  } else if (method === 'resources/list') {
    result = { resources: mcpResources() };
  } else if (method === 'resources/templates/list') {
    result = { resourceTemplates: mcpResourceTemplates() };
  } else if (method === 'resources/read') {
    const uri = safeString(params.uri, 200);
    if (uri === 'cait://apps' || uri.startsWith('cait://apps?')) {
      const query = parseResourceQuery(uri);
      result = resourceText(uri, { apps: filterCatalog(apps, query.query, query.limit), total: apps.length, discovery: buildMcpDiscovery(requestUrl, options) });
    } else if (uri === 'cait://agents' || uri.startsWith('cait://agents?')) {
      const query = parseResourceQuery(uri);
      result = resourceText(uri, { agents: filterCatalog(agents, query.query, query.limit), total: agents.length, discovery: buildMcpDiscovery(requestUrl, options) });
    }
    else return { jsonrpc: '2.0', id, error: { code: -32602, message: `Unknown resource: ${uri || '(empty)'}` } };
  } else if (method === 'prompts/list') {
    result = { prompts: mcpPrompts() };
  } else if (method === 'prompts/get') {
    const name = safeString(params.name, 120);
    if (name !== 'cait.choose_app_for_order') return jsonRpcError(id, -32602, `Unknown prompt: ${name || '(empty)'}`);
    const objective = safeString(params.arguments?.objective || '', 800);
    result = {
      description: 'Choose a CAIt app or agent handoff for a marketplace work order.',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: [
              'Use the CAIt MCP catalog resources and tools to choose the best app or agent handoff for this objective.',
              'Prefer apps when the next step needs analytics context, approval state, lead review, delivery reuse, or an external action packet.',
              'Prefer agents when the next step is planning, research, writing, code, or another deliverable run.',
              `Objective: ${objective || '(not provided)'}`
            ].join('\n')
          }
        }
      ]
    };
  } else if (method === 'notifications/initialized') {
    return null;
  } else {
    return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method || '(empty)'}` } };
  }
  return { jsonrpc: '2.0', id, result };
}

export function handleMcpJsonRpc(body = {}, catalog = {}, options = {}) {
  if (Array.isArray(body)) {
    if (!body.length) return jsonRpcError(null, -32600, 'Invalid Request');
    const responses = body
      .map((item) => handleMcpJsonRpcSingle(item, catalog, options))
      .filter(Boolean);
    return responses.length ? responses : null;
  }
  return handleMcpJsonRpcSingle(body, catalog, options);
}
