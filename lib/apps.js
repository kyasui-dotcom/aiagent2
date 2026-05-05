export const APP_MANIFEST_SCHEMA_VERSION = 'app-manifest/v1';

const DEFAULT_X_CLIENT_OPS_URL = 'https://x.niche-s.com/';
const DEFAULT_CAIt_APP_BASE_URL = 'https://aiagent-marketplace.net';
const DEFAULT_CAIt_MCP = Object.freeze({
  enabled: true,
  serverUrl: `${DEFAULT_CAIt_APP_BASE_URL}/mcp`,
  transport: 'streamable_http',
  auth: 'none',
  tools: ['cait.list_apps', 'cait.list_agents'],
  resources: ['cait://apps', 'cait://agents']
});
const ALLOWED_APP_KINDS = new Set([
  'app',
  'application',
  'application_agent',
  'tool_app',
  'connector_app',
  'workflow_app'
]);
const ALLOWED_APP_VISIBILITY = new Set(['public', 'private', 'unlisted']);
const ALLOWED_APP_STATUS = new Set(['active', 'pending_review', 'verification_failed', 'deprecated']);

export const DEFAULT_APP_SEEDS = Object.freeze([
  {
    id: 'analytics-console',
    name: 'Analytics Console',
    kind: 'application_agent',
    description: 'Old-GA-style acquisition, search query, landing page, conversion, country, channel, and post-run measurement console for CAIt leaders.',
    baseUrl: DEFAULT_CAIt_APP_BASE_URL,
    entryUrl: `${DEFAULT_CAIt_APP_BASE_URL}/analytics-console.html`,
    capabilities: ['analytics_context', 'search_console_packet', 'ga4_packet', 'post_run_measurement'],
    requiredConnectors: ['google'],
    requiresApprovalFor: [],
    inputContract: {
      schemaVersion: 'cait-app-context/v1',
      accepts: ['metrics', 'search_queries', 'landing_pages', 'conversion_paths', 'channel_breakdown'],
      returns: ['facts', 'metrics', 'artifacts', 'recommended_next_actions']
    },
    mcp: { ...DEFAULT_CAIt_MCP },
    owner: 'built-in',
    visibility: 'public',
    status: 'active',
    verificationStatus: 'built_in',
    tags: ['analytics', 'seo', 'growth'],
    metadata: {
      builtIn: true,
      source: 'default-app-seed',
      manifest: {
        schema_version: APP_MANIFEST_SCHEMA_VERSION,
        kind: 'application_agent',
        name: 'Analytics Console',
        description: 'Acquisition, search, conversion, and post-run measurement context app for CAIt leaders.',
        entry_url: `${DEFAULT_CAIt_APP_BASE_URL}/analytics-console.html`,
        capabilities: ['analytics_context', 'search_console_packet', 'ga4_packet', 'post_run_measurement'],
        required_connectors: ['google'],
        mcp: { ...DEFAULT_CAIt_MCP }
      }
    },
    createdAt: nowIso(),
    updatedAt: nowIso()
  },
  {
    id: 'publisher-approval-studio',
    name: 'Publisher & Approval Studio',
    kind: 'application_agent',
    description: 'Content, page, metadata, directory submission, PR draft, and approval queue studio for external action handoffs.',
    baseUrl: DEFAULT_CAIt_APP_BASE_URL,
    entryUrl: `${DEFAULT_CAIt_APP_BASE_URL}/publisher-approval.html`,
    capabilities: ['content_management', 'approval_queue', 'directory_submission_packet', 'publisher_change_set'],
    requiredConnectors: ['github'],
    requiresApprovalFor: ['publish_change', 'directory_submit', 'github_pr', 'external_send'],
    inputContract: {
      schemaVersion: 'cait-app-context/v1',
      accepts: ['article_draft', 'landing_page_change', 'directory_packet', 'approval_request'],
      returns: ['approval_requests', 'artifacts', 'delivery_files', 'recommended_next_actions']
    },
    mcp: { ...DEFAULT_CAIt_MCP },
    owner: 'built-in',
    visibility: 'public',
    status: 'active',
    verificationStatus: 'built_in',
    tags: ['publisher', 'approval', 'seo'],
    metadata: {
      builtIn: true,
      source: 'default-app-seed',
      manifest: {
        schema_version: APP_MANIFEST_SCHEMA_VERSION,
        kind: 'application_agent',
        name: 'Publisher & Approval Studio',
        description: 'Content editing, approval queue, directory packet, and PR-ready change-set app.',
        entry_url: `${DEFAULT_CAIt_APP_BASE_URL}/publisher-approval.html`,
        capabilities: ['content_management', 'approval_queue', 'directory_submission_packet', 'publisher_change_set'],
        required_connectors: ['github'],
        mcp: { ...DEFAULT_CAIt_MCP }
      }
    },
    createdAt: nowIso(),
    updatedAt: nowIso()
  },
  {
    id: 'lead-ops-console',
    name: 'Lead Ops Console',
    kind: 'application_agent',
    description: 'Lead rows, public source evidence, statuses, owners, next actions, and email draft management before approval.',
    baseUrl: DEFAULT_CAIt_APP_BASE_URL,
    entryUrl: `${DEFAULT_CAIt_APP_BASE_URL}/lead-ops.html`,
    capabilities: ['lead_management', 'email_draft', 'crm_packet', 'outreach_review'],
    requiredConnectors: ['google'],
    requiresApprovalFor: ['email_send', 'crm_write', 'external_send'],
    inputContract: {
      schemaVersion: 'cait-app-context/v1',
      accepts: ['lead_rows', 'evidence_urls', 'email_drafts', 'next_actions'],
      returns: ['artifacts', 'approval_requests', 'recommended_next_actions']
    },
    mcp: { ...DEFAULT_CAIt_MCP },
    owner: 'built-in',
    visibility: 'public',
    status: 'active',
    verificationStatus: 'built_in',
    tags: ['crm', 'lead', 'email'],
    metadata: {
      builtIn: true,
      source: 'default-app-seed',
      manifest: {
        schema_version: APP_MANIFEST_SCHEMA_VERSION,
        kind: 'application_agent',
        name: 'Lead Ops Console',
        description: 'Lead and email draft review console that returns CRM and outreach packets to CAIt.',
        entry_url: `${DEFAULT_CAIt_APP_BASE_URL}/lead-ops.html`,
        capabilities: ['lead_management', 'email_draft', 'crm_packet', 'outreach_review'],
        required_connectors: ['google'],
        mcp: { ...DEFAULT_CAIt_MCP }
      }
    },
    createdAt: nowIso(),
    updatedAt: nowIso()
  },
  {
    id: 'delivery-manager',
    name: 'Delivery Manager',
    kind: 'application_agent',
    description: 'CAIt delivery package, file download, copy, reuse, and follow-up context manager.',
    baseUrl: DEFAULT_CAIt_APP_BASE_URL,
    entryUrl: `${DEFAULT_CAIt_APP_BASE_URL}/delivery-manager.html`,
    capabilities: ['delivery_package', 'file_download', 'delivery_reuse', 'follow_up_context'],
    requiredConnectors: [],
    requiresApprovalFor: [],
    inputContract: {
      schemaVersion: 'cait-app-context/v1',
      accepts: ['delivery_files', 'job_output', 'follow_up_context'],
      returns: ['delivery_files', 'artifacts', 'recommended_next_actions']
    },
    mcp: { ...DEFAULT_CAIt_MCP },
    owner: 'built-in',
    visibility: 'public',
    status: 'active',
    verificationStatus: 'built_in',
    tags: ['delivery', 'files', 'reuse'],
    metadata: {
      builtIn: true,
      source: 'default-app-seed',
      manifest: {
        schema_version: APP_MANIFEST_SCHEMA_VERSION,
        kind: 'application_agent',
        name: 'Delivery Manager',
        description: 'Delivery package and reusable file manager for CAIt follow-up work.',
        entry_url: `${DEFAULT_CAIt_APP_BASE_URL}/delivery-manager.html`,
        capabilities: ['delivery_package', 'file_download', 'delivery_reuse', 'follow_up_context'],
        mcp: { ...DEFAULT_CAIt_MCP }
      }
    },
    createdAt: nowIso(),
    updatedAt: nowIso()
  },
  {
    id: 'x-client-ops',
    name: 'X Client Ops',
    kind: 'application_agent',
    description: 'X post drafting, strategy context transfer, and approval-ready posting queue for CAIt action handoffs.',
    baseUrl: DEFAULT_X_CLIENT_OPS_URL,
    entryUrl: DEFAULT_X_CLIENT_OPS_URL,
    capabilities: ['x_post_draft', 'x_post_queue', 'social_action'],
    requiredConnectors: ['x'],
    requiresApprovalFor: ['post_now', 'send_external'],
    inputContract: {
      schemaVersion: 'cait-app-agent-transfer/v1',
      accepts: ['post_text', 'strategy', 'agent_context', 'delivery_summary', 'settings'],
      settingsKeys: [
        'brandName',
        'serviceLine',
        'targetClient',
        'defaultCta',
        'destinationLink',
        'serviceUrl',
        'workspaceNotes',
        'outputLanguage'
      ],
      requiredApprovalFor: ['post_now']
    },
    handoff: {
      createUrl: `${DEFAULT_X_CLIENT_OPS_URL.replace(/\/+$/, '')}/api/cait/handoff`,
      method: 'POST',
      openUrlParam: 'cait_handoff'
    },
    mcp: { ...DEFAULT_CAIt_MCP },
    owner: 'built-in',
    visibility: 'public',
    status: 'active',
    verificationStatus: 'built_in',
    tags: ['social', 'x', 'posting'],
    metadata: {
      builtIn: true,
      source: 'default-app-seed',
      manifest: {
        schema_version: APP_MANIFEST_SCHEMA_VERSION,
        kind: 'application_agent',
        name: 'X Client Ops',
        description: 'X post drafting, strategy context transfer, and approval-ready posting queue for CAIt action handoffs.',
        entry_url: DEFAULT_X_CLIENT_OPS_URL,
        capabilities: ['x_post_draft', 'x_post_queue', 'social_action'],
        required_connectors: ['x'],
        mcp: { ...DEFAULT_CAIt_MCP }
      }
    },
    createdAt: nowIso(),
    updatedAt: nowIso()
  }
]);

function nowIso() {
  return new Date().toISOString();
}

function usableTimestamp(value = '') {
  const ms = Date.parse(String(value || ''));
  return Number.isFinite(ms) && ms > Date.parse('2020-01-01T00:00:00.000Z');
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function safeString(value = '', max = 500) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function stringList(value, max = 24) {
  const raw = Array.isArray(value)
    ? value
    : String(value || '').split(/[,\n]/);
  return [...new Set(raw
    .map((item) => safeString(item, 120))
    .filter(Boolean))]
    .slice(0, max);
}

function objectValue(value, fallback = {}) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
}

function redactSecretFields(value, depth = 0) {
  if (value == null || depth > 6) return value;
  if (Array.isArray(value)) return value.map((item) => redactSecretFields(item, depth + 1));
  if (typeof value !== 'object') return value;
  const redacted = {};
  for (const [key, item] of Object.entries(value)) {
    if (/token|secret|password|private[_-]?key|api[_-]?key|bearer/i.test(key)) {
      redacted[key] = item ? '[redacted]' : item;
      continue;
    }
    redacted[key] = redactSecretFields(item, depth + 1);
  }
  return redacted;
}

function slugify(value = '') {
  return safeString(value, 120)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function appIdFromName(name = '') {
  const slug = slugify(name) || 'application';
  return `app_${slug}`;
}

function urlString(value = '') {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    const parsed = new URL(text);
    if (!['http:', 'https:'].includes(parsed.protocol)) return '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function isPrivateNetworkHostname(hostname = '') {
  const host = String(hostname || '').trim().toLowerCase();
  if (!host) return false;
  if (host === 'localhost' || host === '::1' || host.endsWith('.localhost')) return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^0\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  const private172 = host.match(/^172\.(\d+)\./);
  if (private172) {
    const second = Number(private172[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

function validateUrl(value = '', label = 'url', errors = [], options = {}) {
  const text = String(value || '').trim();
  if (!text) return;
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    errors.push(`${label} must be a valid URL`);
    return;
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) errors.push(`${label} must use http or https`);
  if (isPrivateNetworkHostname(parsed.hostname) && options.allowLocalEndpoints !== true) {
    errors.push(`${label} cannot use a private or local hostname unless local endpoints are allowed`);
  }
}

function normalizeHandoff(raw = {}, source = {}) {
  const handoff = objectValue(raw, {});
  const endpoints = objectValue(source.endpoints, {});
  const createUrl = urlString(
    handoff.create_url
    || handoff.createUrl
    || handoff.url
    || endpoints.handoff
    || endpoints.transfer
    || source.handoff_url
    || source.handoffUrl
  );
  const method = safeString(handoff.method || 'POST', 12).toUpperCase() || 'POST';
  const openUrlParam = safeString(handoff.open_url_param || handoff.openUrlParam || handoff.param || 'cait_handoff', 80) || 'cait_handoff';
  const normalized = {
    ...(Object.keys(handoff).length ? clone(handoff) : {}),
    createUrl,
    method,
    openUrlParam
  };
  if (!createUrl) delete normalized.createUrl;
  return normalized;
}

function normalizeMcp(raw = {}, source = {}) {
  const mcp = objectValue(raw, {});
  const endpoints = objectValue(source.endpoints, {});
  const serverUrl = urlString(
    mcp.server_url
    || mcp.serverUrl
    || mcp.url
    || endpoints.mcp
    || source.mcp_server_url
    || source.mcpServerUrl
  );
  const tools = stringList(mcp.tools || mcp.tool_names || mcp.toolNames || source.mcp_tools || source.mcpTools || [], 40);
  const resources = stringList(mcp.resources || source.mcp_resources || source.mcpResources || [], 40);
  const scopes = stringList(mcp.scopes || mcp.required_scopes || mcp.requiredScopes || [], 24);
  const enabled = Boolean(serverUrl || tools.length || resources.length || mcp.enabled === true || source.mcp_enabled === true || source.mcpEnabled === true);
  const normalized = {
    ...(Object.keys(mcp).length ? clone(mcp) : {}),
    enabled,
    serverUrl,
    tools,
    resources,
    scopes,
    transport: safeString(mcp.transport || source.mcp_transport || source.mcpTransport || (serverUrl ? 'streamable_http' : ''), 80),
    auth: safeString(mcp.auth || mcp.auth_type || mcp.authType || source.mcp_auth || '', 80)
  };
  if (!serverUrl) delete normalized.serverUrl;
  if (!tools.length) delete normalized.tools;
  if (!resources.length) delete normalized.resources;
  if (!scopes.length) delete normalized.scopes;
  if (!normalized.transport) delete normalized.transport;
  if (!normalized.auth) delete normalized.auth;
  return normalized;
}

export function normalizeAppManifest(raw = {}, options = {}) {
  const source = raw?.manifest && typeof raw.manifest === 'object' ? raw.manifest : raw;
  const metadata = objectValue(source.metadata, {});
  const endpoints = objectValue(source.endpoints, {});
  const schemaVersion = safeString(source.schema_version || source.schemaVersion || APP_MANIFEST_SCHEMA_VERSION, 80) || APP_MANIFEST_SCHEMA_VERSION;
  const kindInput = safeString(source.kind || source.app_kind || source.appKind || 'application', 80).toLowerCase();
  const kind = ALLOWED_APP_KINDS.has(kindInput) ? kindInput : 'application';
  const name = safeString(source.name || source.app_name || source.appName || source.title || 'application', 120);
  const baseUrl = urlString(source.base_url || source.baseUrl || source.homepage || source.url || endpoints.base || endpoints.homepage);
  const entryUrl = urlString(
    source.entry_url
    || source.entryUrl
    || source.launch_url
    || source.launchUrl
    || source.open_url
    || source.openUrl
    || endpoints.entry
    || endpoints.launch
    || endpoints.open
    || baseUrl
  );
  const healthcheckUrl = urlString(
    source.healthcheck_url
    || source.healthcheckUrl
    || source.health_url
    || source.healthUrl
    || endpoints.health
    || endpoints.healthcheck
  );
  const visibilityInput = safeString(source.visibility || metadata.visibility || 'public', 40).toLowerCase();
  const statusInput = safeString(source.status || metadata.status || 'active', 40).toLowerCase();
  const owner = safeString(source.owner || metadata.owner || options.owner || '', 120);
  const tags = stringList(source.tags || source.categories || metadata.tags || [], 24);
  const handoff = normalizeHandoff(source.handoff || source.transfer || {}, source);
  const mcp = normalizeMcp(source.mcp || source.mcp_server || source.mcpServer || {}, source);
  return {
    id: safeString(source.id || source.app_id || source.appId || metadata.id || appIdFromName(name), 120),
    schemaVersion,
    kind,
    name,
    description: safeString(source.description || source.summary || 'Registered CAIt app.', 1000),
    baseUrl,
    entryUrl,
    healthcheckUrl,
    capabilities: stringList(source.capabilities || source.actions || metadata.capabilities || [], 40),
    requiredConnectors: stringList(source.required_connectors || source.requiredConnectors || source.connectors || metadata.requiredConnectors || [], 24),
    requiresApprovalFor: stringList(source.requires_approval_for || source.requiresApprovalFor || source.confirmation_required_for || source.confirmationRequiredFor || [], 24),
    inputContract: clone(objectValue(source.input_contract || source.inputContract || source.usage_contract || source.usageContract, {})),
    handoff,
    mcp,
    tags,
    owner,
    visibility: ALLOWED_APP_VISIBILITY.has(visibilityInput) ? visibilityInput : 'public',
    status: ALLOWED_APP_STATUS.has(statusInput) ? statusInput : 'active',
    verificationStatus: safeString(source.verification_status || source.verificationStatus || metadata.verificationStatus || 'unverified', 80),
    manifestUrl: safeString(options.manifestUrl || source.manifest_url || source.manifestUrl || source.source_url || source.sourceUrl || '', 500),
    manifestSource: safeString(options.manifestSource || source.manifest_source || source.manifestSource || '', 500),
    metadata: clone(metadata),
    auth: clone(objectValue(source.auth, {})),
    raw: clone(source)
  };
}

export function validateAppManifest(manifest = {}, options = {}) {
  const errors = [];
  if (!safeString(manifest.name, 120)) errors.push('name required');
  if (!safeString(manifest.description, 1000)) errors.push('description required');
  if (!safeString(manifest.entryUrl, 500)) errors.push('entry_url required');
  validateUrl(manifest.baseUrl, 'base_url', errors, options);
  validateUrl(manifest.entryUrl, 'entry_url', errors, options);
  validateUrl(manifest.healthcheckUrl, 'healthcheck_url', errors, options);
  validateUrl(manifest.handoff?.createUrl, 'handoff.create_url', errors, options);
  validateUrl(manifest.mcp?.serverUrl, 'mcp.server_url', errors, options);
  if (manifest.kind && !ALLOWED_APP_KINDS.has(String(manifest.kind).toLowerCase())) errors.push('kind is not a supported app kind');
  return { ok: errors.length === 0, errors };
}

export function createAppFromInput(body = {}, ownerInfo = { owner: '', metadata: {} }, options = {}) {
  const manifest = normalizeAppManifest({
    ...body,
    owner: body.owner || ownerInfo.owner || '',
    metadata: {
      ...(ownerInfo.metadata && typeof ownerInfo.metadata === 'object' ? ownerInfo.metadata : {}),
      ...(body.metadata && typeof body.metadata === 'object' ? body.metadata : {})
    }
  }, options);
  const now = nowIso();
  const ownerMetadata = redactSecretFields(ownerInfo.metadata && typeof ownerInfo.metadata === 'object' ? ownerInfo.metadata : {});
  const manifestMetadata = redactSecretFields(manifest.metadata && typeof manifest.metadata === 'object' ? manifest.metadata : {});
  const storageManifest = redactSecretFields(manifest.raw && typeof manifest.raw === 'object' ? manifest.raw : {});
  return {
    id: manifest.id || appIdFromName(manifest.name),
    name: manifest.name,
    kind: manifest.kind,
    description: manifest.description,
    baseUrl: manifest.baseUrl,
    entryUrl: manifest.entryUrl,
    healthcheckUrl: manifest.healthcheckUrl,
    capabilities: manifest.capabilities,
    requiredConnectors: manifest.requiredConnectors,
    requiresApprovalFor: manifest.requiresApprovalFor,
    inputContract: manifest.inputContract,
    handoff: manifest.handoff,
    mcp: manifest.mcp,
    tags: manifest.tags,
    owner: manifest.owner || ownerInfo.owner || 'samurai',
    visibility: manifest.visibility,
    status: manifest.status,
    verificationStatus: options.verificationStatus || manifest.verificationStatus || 'unverified',
    manifestUrl: options.manifestUrl || manifest.manifestUrl || '',
    manifestSource: options.manifestSource || manifest.manifestSource || '',
    metadata: {
      ...ownerMetadata,
      ...manifestMetadata,
      manifest: {
        ...storageManifest,
        schema_version: manifest.schemaVersion,
        kind: manifest.kind,
        name: manifest.name,
        description: manifest.description,
        base_url: manifest.baseUrl,
        entry_url: manifest.entryUrl,
        healthcheck_url: manifest.healthcheckUrl,
        capabilities: manifest.capabilities,
        required_connectors: manifest.requiredConnectors,
        requires_approval_for: manifest.requiresApprovalFor,
        input_contract: manifest.inputContract,
        handoff: manifest.handoff,
        mcp: manifest.mcp,
        tags: manifest.tags
      }
    },
    createdAt: body.created_at || body.createdAt || now,
    updatedAt: now
  };
}

export function createAppFromManifest(manifest = {}, ownerInfo = { owner: '', metadata: {} }, options = {}) {
  return createAppFromInput({
    id: manifest.id,
    name: manifest.name,
    kind: manifest.kind,
    description: manifest.description,
    baseUrl: manifest.baseUrl,
    entryUrl: manifest.entryUrl,
    healthcheckUrl: manifest.healthcheckUrl,
    capabilities: manifest.capabilities,
    requiredConnectors: manifest.requiredConnectors,
    requiresApprovalFor: manifest.requiresApprovalFor,
    inputContract: manifest.inputContract,
    handoff: manifest.handoff,
    mcp: manifest.mcp,
    tags: manifest.tags,
    owner: manifest.owner || ownerInfo.owner,
    visibility: manifest.visibility,
    status: manifest.status,
    verificationStatus: options.verificationStatus || manifest.verificationStatus || 'manifest_loaded',
    manifestUrl: options.manifestUrl || manifest.manifestUrl || manifest.sourceUrl || '',
    manifestSource: options.manifestSource || manifest.manifestSource || 'manifest',
    metadata: {
      ...(manifest.metadata && typeof manifest.metadata === 'object' ? manifest.metadata : {}),
      importMode: options.importMode || 'manifest',
      sourceUrl: options.manifestUrl || manifest.manifestUrl || manifest.sourceUrl || ''
    }
  }, ownerInfo, {
    manifestUrl: options.manifestUrl || manifest.manifestUrl || manifest.sourceUrl || '',
    manifestSource: options.manifestSource || manifest.manifestSource || 'manifest',
    verificationStatus: options.verificationStatus || manifest.verificationStatus || 'manifest_loaded'
  });
}

export function appIsVisible(app = {}) {
  const metadata = app?.metadata && typeof app.metadata === 'object' ? app.metadata : {};
  return Boolean(
    app?.id
    && metadata.hidden_from_catalog !== true
    && !metadata.deleted_at
    && !metadata.deletedAt
    && String(app.status || '').toLowerCase() !== 'deprecated'
  );
}

export function mergeSystemApp(existing = {}, seed = {}) {
  const existingMetadata = existing?.metadata && typeof existing.metadata === 'object'
    ? { ...existing.metadata }
    : {};
  delete existingMetadata.hidden_from_catalog;
  delete existingMetadata.deleted_at;
  delete existingMetadata.deletedAt;
  delete existingMetadata.deleted_reason;
  delete existingMetadata.deletedReason;
  return {
    ...existing,
    ...clone(seed),
    createdAt: usableTimestamp(existing?.createdAt) ? existing.createdAt : (seed.createdAt || nowIso()),
    updatedAt: nowIso(),
    owner: seed.owner || existing?.owner || 'built-in',
    metadata: {
      ...existingMetadata,
      ...(seed?.metadata && typeof seed.metadata === 'object' ? seed.metadata : {}),
      manifest: clone(seed?.metadata?.manifest || existing?.metadata?.manifest || {})
    },
    status: seed.status || 'active',
    verificationStatus: seed.verificationStatus || existing?.verificationStatus || 'built_in',
    verificationCheckedAt: existing?.verificationCheckedAt || seed.verificationCheckedAt || nowIso(),
    verificationError: null,
    verificationDetails: clone(seed.verificationDetails || existing?.verificationDetails || null)
  };
}

export function sanitizeAppForPublic(app = {}) {
  if (!app) return null;
  const cloned = clone(app);
  delete cloned.auth;
  delete cloned.token;
  delete cloned.secret;
  if (!usableTimestamp(cloned.createdAt)) cloned.createdAt = usableTimestamp(cloned.updatedAt) ? cloned.updatedAt : nowIso();
  if (cloned.metadata?.manifest?.auth) {
    cloned.metadata.manifest.auth = {
      type: cloned.metadata.manifest.auth.type || 'configured',
      redacted: true
    };
  }
  if (cloned.metadata?.auth) {
    cloned.metadata.auth = { configured: true, redacted: true };
  }
  return cloned;
}
