const CAIT_APP_CONTEXT_SCHEMA = 'cait-app-context/v1';
const DEFAULT_CAIt_ORIGIN = 'https://aiagent-marketplace.net';

function nowIso() {
  return new Date().toISOString();
}

function safeText(value = '', max = 2000) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function safeId(value = '') {
  return safeText(value, 120).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
}

function safeList(value = [], max = 24) {
  const list = Array.isArray(value) ? value : String(value || '').split(/[,\n]/);
  return [...new Set(list.map((item) => safeText(item, 500)).filter(Boolean))].slice(0, max);
}

function safeObjectList(value = [], max = 24) {
  return (Array.isArray(value) ? value : [])
    .filter((item) => item && typeof item === 'object')
    .map((item) => compactObject(item, { depth: 4, maxText: 1200, maxArray: 12 }))
    .slice(0, max);
}

function compactObject(value, options = {}, depth = 0) {
  if (value == null || depth > Number(options.depth ?? 5)) return value == null ? value : safeText(value, Number(options.maxText || 1000));
  if (Array.isArray(value)) return value.slice(0, Number(options.maxArray || 12)).map((item) => compactObject(item, options, depth + 1));
  if (typeof value !== 'object') return typeof value === 'string' ? safeText(value, Number(options.maxText || 1000)) : value;
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (/token|secret|password|private[_-]?key|api[_-]?key|bearer/i.test(key)) {
      output[key] = item ? '[redacted]' : item;
      continue;
    }
    output[safeText(key, 80)] = compactObject(item, options, depth + 1);
  }
  return output;
}

function caitOrigin(options = {}) {
  if (options.caitOrigin) return String(options.caitOrigin || '').replace(/\/+$/, '');
  const host = String(window.location.hostname || '').toLowerCase();
  if (host === 'aiagent-marketplace.net' || host === 'www.aiagent-marketplace.net' || host === '127.0.0.1' || host === 'localhost') {
    return window.location.origin;
  }
  return DEFAULT_CAIt_ORIGIN;
}

async function createServerAppContext(context = {}, options = {}) {
  if (options.server === false) return null;
  const origin = caitOrigin(options);
  const headers = { 'content-type': 'application/json', accept: 'application/json' };
  const apiKey = safeText(options.apiKey || options.caitApiKey || '', 300);
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  const response = await fetch(`${origin}/api/app-contexts`, {
    method: 'POST',
    headers,
    credentials: origin === window.location.origin ? 'same-origin' : 'omit',
    body: JSON.stringify({
      app_id: context.source_app,
      context
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.chat_url) throw new Error(String(data?.error || `app context create failed (${response.status})`));
  return {
    ...data,
    chat_url: new URL(data.chat_url, origin).toString()
  };
}

export function buildCaitAppContext(raw = {}) {
  const createdAt = safeText(raw.created_at || raw.createdAt || nowIso(), 80) || nowIso();
  const sourceApp = safeId(raw.source_app || raw.sourceApp || raw.app || 'app');
  const title = safeText(raw.title || 'App context', 180);
  const id = safeText(raw.id || `${sourceApp || 'app'}-${Date.now().toString(36)}`, 160);
  return {
    schema: CAIT_APP_CONTEXT_SCHEMA,
    id,
    source_app: sourceApp,
    source_app_label: safeText(raw.source_app_label || raw.sourceAppLabel || raw.app_label || sourceApp || 'App', 120),
    title,
    summary: safeText(raw.summary || '', 1400),
    facts: safeList(raw.facts || [], 30),
    assumptions: safeList(raw.assumptions || [], 20),
    artifacts: safeObjectList(raw.artifacts || [], 24),
    metrics: safeObjectList(raw.metrics || [], 40),
    recommended_next_actions: safeList(raw.recommended_next_actions || raw.recommendedNextActions || [], 24),
    approval_requests: safeObjectList(raw.approval_requests || raw.approvalRequests || [], 24),
    delivery_files: safeObjectList(raw.delivery_files || raw.deliveryFiles || [], 24),
    handoff_targets: safeList(raw.handoff_targets || raw.handoffTargets || [], 16),
    raw_context: compactObject(raw.raw_context || raw.rawContext || {}, { depth: 5, maxText: 1000, maxArray: 10 }),
    created_at: createdAt
  };
}

export function storeCaitAppContext(raw = {}) {
  return buildCaitAppContext(raw);
}

export function caitAppContextChatPrompt(context = {}) {
  const c = buildCaitAppContext(context);
  const lines = [
    `Use this ${c.source_app_label || c.source_app} context with CAIt.`,
    '',
    `Title: ${c.title}`,
    c.summary ? `Summary: ${c.summary}` : '',
    c.handoff_targets.length ? `Preferred leaders/agents: ${c.handoff_targets.join(', ')}` : '',
    c.recommended_next_actions.length ? 'Recommended next actions:' : '',
    ...c.recommended_next_actions.slice(0, 8).map((item, index) => `${index + 1}. ${item}`),
    '',
    'Create the next order only after checking missing context and approval requirements.'
  ].filter(Boolean);
  return lines.join('\n');
}

export function caitAppContextThreadHtml(context = {}) {
  const c = buildCaitAppContext(context);
  const metrics = c.metrics.slice(0, 5).map((metric) => {
    const label = safeText(metric.label || metric.name || metric.metric || 'metric', 80);
    const value = safeText(metric.value ?? metric.current ?? '', 80);
    return `<li><strong>${escapeHtml(label)}</strong>${value ? `: ${escapeHtml(value)}` : ''}</li>`;
  }).join('');
  return [
    '<div class="app-context-card">',
    `<strong>Context received from ${escapeHtml(c.source_app_label || c.source_app)}</strong>`,
    `<p>${escapeHtml(c.summary || c.title)}</p>`,
    metrics ? `<ul>${metrics}</ul>` : '',
    c.recommended_next_actions.length ? `<p><strong>Next:</strong> ${escapeHtml(c.recommended_next_actions[0])}</p>` : '',
    '</div>'
  ].filter(Boolean).join('');
}

export async function sendContextToCait(raw = {}, options = {}) {
  const context = buildCaitAppContext(raw);
  const serverContext = await createServerAppContext(context, options);
  const target = serverContext.chat_url;
  if (options.open === false) return target;
  window.location.href = target;
  return target;
}

export function copyContextJson(raw = {}) {
  const context = buildCaitAppContext(raw);
  return navigator.clipboard.writeText(JSON.stringify(context, null, 2));
}

export function downloadContextJson(raw = {}, filename = 'cait-app-context.json') {
  const context = buildCaitAppContext(raw);
  const blob = new Blob([JSON.stringify(context, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function fetchCaitAppContextFromUrl(options = {}) {
  const url = new URL(window.location.href);
  let context = null;
  const serverId = url.searchParams.get('app_context_id') || url.searchParams.get('cait_app_context_id');
  const serverToken = url.searchParams.get('app_context_token') || url.searchParams.get('cait_app_context_token') || url.searchParams.get('token') || '';
  if (serverId) {
    try {
      const origin = caitOrigin(options);
      const fetchUrl = new URL(`/api/app-contexts/${encodeURIComponent(serverId)}`, origin);
      if (serverToken) fetchUrl.searchParams.set('app_context_token', serverToken);
      const response = await fetch(fetchUrl, { credentials: origin === window.location.origin ? 'same-origin' : 'omit' });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data?.app_context?.context) context = buildCaitAppContext(data.app_context.context);
    } catch {}
  }
  if (serverId && options.cleanupUrl !== false) {
    url.searchParams.delete('app_context_id');
    url.searchParams.delete('app_context_token');
    url.searchParams.delete('cait_app_context_id');
    url.searchParams.delete('cait_app_context_token');
    url.searchParams.delete('token');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }
  return context ? buildCaitAppContext(context) : null;
}

export async function consumeCaitAppContextForChat() {
  return fetchCaitAppContextFromUrl();
}

function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
