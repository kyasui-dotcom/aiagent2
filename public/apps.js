const listEl = document.querySelector('[data-context-list]');
const registryListEl = document.querySelector('[data-app-registry-list]');
const featuredListEl = document.querySelector('[data-featured-app-list]');

function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function compact(value = '', max = 220) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length <= max ? text : `${text.slice(0, max - 1).trim()}...`;
}

function displayDate(value = '') {
  const time = Date.parse(String(value || ''));
  if (!Number.isFinite(time)) return '';
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(time));
  } catch {
    return new Date(time).toLocaleString();
  }
}

function setText(selector, value) {
  document.querySelectorAll(selector).forEach((el) => {
    el.textContent = String(value);
  });
}

function list(value = []) {
  return Array.isArray(value) ? value.map((item) => String(item || '').trim()).filter(Boolean) : [];
}

function normalizeApp(record = {}) {
  const inputContract = record.inputContract && typeof record.inputContract === 'object' ? record.inputContract : {};
  const handoff = record.handoff && typeof record.handoff === 'object' ? record.handoff : {};
  const capabilities = list(record.capabilities);
  const requiredConnectors = list(record.requiredConnectors || record.required_connectors);
  const requiresApprovalFor = list(record.requiresApprovalFor || record.requires_approval_for);
  const mcp = record.mcp && typeof record.mcp === 'object' ? record.mcp : {};
  const returns = list(inputContract.returns);
  const id = String(record.id || '').trim();
  if (!id) return null;
  const isAction = requiresApprovalFor.length > 0
    || Boolean(handoff.createUrl || handoff.create_url)
    || capabilities.some((item) => /(^|_)(publish|submit|send|action|queue|handoff)(_|$)/i.test(item));
  return {
    id,
    name: String(record.name || id).trim(),
    description: String(record.description || '').trim(),
    entryUrl: String(record.entryUrl || record.entry_url || '').trim(),
    status: String(record.status || 'active').trim(),
    verificationStatus: String(record.verificationStatus || record.verification_status || 'unverified').trim(),
    owner: String(record.owner || '').trim(),
    capabilities,
    requiredConnectors,
    requiresApprovalFor,
    mcp: {
      enabled: Boolean(mcp.enabled || mcp.serverUrl || mcp.server_url),
      serverUrl: String(mcp.serverUrl || mcp.server_url || '').trim(),
      tools: list(mcp.tools),
      resources: list(mcp.resources)
    },
    returns,
    tags: list(record.tags),
    isAction
  };
}

function sameOriginAppUrl(value = '') {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    const parsed = new URL(text, window.location.origin);
    const isBuiltInCaitHost = /^(?:www\.)?(?:aiagent-marketplace\.net|aiagent-market\.net|aiagent2\.net)$/i.test(parsed.hostname);
    const isKnownLocalApp = [
      '/analytics-console.html',
      '/publisher-approval.html',
      '/lead-ops.html',
      '/delivery-manager.html',
      '/apps.html'
    ].includes(parsed.pathname);
    if (isBuiltInCaitHost && isKnownLocalApp) {
      return `${window.location.origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    return parsed.toString();
  } catch {
    return text;
  }
}

function appTypeLabel(app) {
  if (app.isAction) return 'Action app';
  if (app.returns.length || app.capabilities.some((item) => /context|analytics|packet|delivery|measurement|crm/i.test(item))) return 'Context app';
  return 'Registered app';
}

function renderAppChips(items = [], emptyLabel = '') {
  const values = list(items).slice(0, 5);
  if (!values.length && emptyLabel) return `<span class="mini-chip">${escapeHtml(emptyLabel)}</span>`;
  return values.map((item) => `<span class="mini-chip">${escapeHtml(item.replace(/_/g, ' '))}</span>`).join('');
}

function updateAppMetrics(apps = []) {
  const contextCount = apps.filter((app) => !app.isAction).length;
  const actionCount = apps.filter((app) => app.isAction).length;
  const connectorCount = new Set(apps.flatMap((app) => app.requiredConnectors)).size;
  setText('[data-app-count]', apps.length || '0');
  setText('[data-context-app-count]', contextCount || '0');
  setText('[data-action-app-count]', actionCount || '0');
  setText('[data-connector-count]', connectorCount || '0');
}

function renderApps(records = []) {
  if (!registryListEl) return;
  const apps = records.map(normalizeApp).filter(Boolean);
  updateAppMetrics(apps);
  if (!apps.length) {
    registryListEl.innerHTML = '<div class="notice">No registered apps are visible yet.</div>';
    return;
  }
  registryListEl.innerHTML = apps.map((app) => {
    const meta = [
      appTypeLabel(app),
      app.status ? `Status: ${app.status}` : '',
      app.verificationStatus ? `Verification: ${app.verificationStatus}` : '',
      app.owner ? `Owner: ${app.owner}` : ''
    ].filter(Boolean).join(' / ');
    const openUrl = sameOriginAppUrl(app.entryUrl) || `/chat?app_id=${encodeURIComponent(app.id)}`;
    return [
      '<article class="app-registry-row">',
      '<div>',
      `<div class="status-row"><h3>${escapeHtml(app.name)}</h3><span class="status-pill">${escapeHtml(appTypeLabel(app))}</span></div>`,
      `<p class="context-meta">${escapeHtml(meta)}</p>`,
      app.description ? `<p>${escapeHtml(compact(app.description, 180))}</p>` : '',
      '<div class="inline-actions">',
      renderAppChips(app.requiredConnectors, 'No connector'),
      renderAppChips(app.requiresApprovalFor, app.isAction ? 'Approval required' : ''),
      app.mcp.enabled ? '<span class="mini-chip">MCP ready</span>' : '',
      '</div>',
      '</div>',
      '<div class="context-actions">',
      `<a class="primary-btn" href="${escapeHtml(openUrl)}">Open</a>`,
      '</div>',
      '</article>'
    ].filter(Boolean).join('');
  }).join('');
}

function renderFeaturedApps(records = []) {
  if (!featuredListEl) return;
  const apps = records.map(normalizeApp).filter(Boolean);
  const featureCopy = new Map([
    ['analytics-console', { tag: 'SEO / CMO', description: 'Find the next growth move from traffic evidence.' }],
    ['publisher-approval-studio', { tag: 'Approval', description: 'Review external publishing changes before they leave CAIt.' }],
    ['lead-ops-console', { tag: 'Growth', description: 'Turn sourced leads into reviewed outreach drafts.' }],
    ['delivery-manager', { tag: 'Follow-up', description: 'Reuse finished work as the next brief.' }],
    ['x-client-ops', { tag: 'Social', description: 'Prepare approved social action packets.' }]
  ]);
  const featured = [...featureCopy.keys()]
    .map((id) => apps.find((app) => app.id === id))
    .filter(Boolean);
  if (!featured.length) {
    featuredListEl.innerHTML = '<div class="notice">No featured apps are visible yet.</div>';
    return;
  }
  featuredListEl.innerHTML = featured.map((app) => {
    const copy = featureCopy.get(app.id) || {};
    const href = sameOriginAppUrl(app.entryUrl) || `/chat?app_id=${encodeURIComponent(app.id)}`;
    return [
      `<a class="detail-card panel" href="${escapeHtml(href)}">`,
      `<span class="kicker">${escapeHtml(copy.tag || appTypeLabel(app))}</span>`,
      `<h2>${escapeHtml(app.name)}</h2>`,
      `<p>${escapeHtml(copy.description || compact(app.description, 150))}</p>`,
      '<div class="inline-actions">',
      renderAppChips(app.tags.length ? app.tags : app.capabilities, ''),
      app.mcp.enabled ? '<span class="mini-chip">MCP</span>' : '',
      '</div>',
      '</a>'
    ].join('');
  }).join('');
}

async function loadApps() {
  if (!registryListEl) return;
  try {
    const response = await fetch('/api/apps?limit=100', {
      credentials: 'same-origin',
      headers: { accept: 'application/json' }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String(data?.error || `Request failed (${response.status})`));
    const apps = Array.isArray(data.apps) ? data.apps : [];
    renderApps(apps);
    renderFeaturedApps(apps);
  } catch (error) {
    updateAppMetrics([]);
    registryListEl.innerHTML = `<div class="notice">Registered apps could not be loaded. ${escapeHtml(String(error?.message || error || ''))}</div>`;
  }
}

function normalizeContext(record = {}) {
  const context = record.context && typeof record.context === 'object' ? record.context : {};
  const id = String(record.id || context.id || '').trim();
  if (!id) return null;
  return {
    id,
    source: String(record.source_app_label || context.source_app_label || record.source_app || context.source_app || 'App').trim(),
    title: String(record.title || context.title || 'App context').trim(),
    summary: String(record.summary || context.summary || '').trim(),
    status: String(record.status || 'ready').trim(),
    createdAt: String(record.created_at || context.created_at || '').trim()
  };
}

function renderNotice(message = '') {
  if (!listEl) return;
  listEl.innerHTML = `<div class="notice">${escapeHtml(message)}</div>`;
}

function renderContexts(records = []) {
  if (!listEl) return;
  const contexts = records.map(normalizeContext).filter(Boolean);
  if (!contexts.length) {
    renderNotice('No app contexts yet. Open an app, review data or approvals, then press Send to CAIt.');
    return;
  }
  listEl.innerHTML = contexts.map((item) => {
    const meta = [
      item.source,
      item.status ? `Status: ${item.status}` : '',
      item.createdAt ? `Created ${displayDate(item.createdAt)}` : ''
    ].filter(Boolean).join(' / ');
    return [
      '<article class="context-row">',
      '<div>',
      `<h3>${escapeHtml(item.title)}</h3>`,
      `<p class="context-meta">${escapeHtml(meta)}</p>`,
      item.summary ? `<p>${escapeHtml(compact(item.summary))}</p>` : '',
      '</div>',
      '<div class="context-actions">',
      `<a class="primary-btn" href="/chat?app_context_id=${encodeURIComponent(item.id)}">Use in chat</a>`,
      '</div>',
      '</article>'
    ].filter(Boolean).join('');
  }).join('');
}

async function loadContexts() {
  if (!listEl) return;
  try {
    const response = await fetch('/api/app-contexts?limit=10', {
      credentials: 'same-origin',
      headers: { accept: 'application/json' }
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      listEl.innerHTML = [
        '<div class="notice">',
        'Sign in to view server-side app contexts for your account. ',
        '<a href="/login?next=%2Fapps.html&amp;source=app_contexts">Sign in</a>',
        '</div>'
      ].join('');
      return;
    }
    if (!response.ok) throw new Error(String(data?.error || `Request failed (${response.status})`));
    renderContexts(Array.isArray(data.app_contexts) ? data.app_contexts : []);
  } catch (error) {
    renderNotice(`Recent contexts could not be loaded. ${String(error?.message || error || '')}`);
  }
}

void loadApps();
void loadContexts();
