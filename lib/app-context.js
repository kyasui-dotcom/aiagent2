export const CAIT_APP_CONTEXT_SCHEMA = 'cait-app-context/v1';
export const APP_CONTEXT_TTL_MS = 24 * 60 * 60 * 1000;

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
  const source = Array.isArray(value) ? value : String(value || '').split(/[,\n]/);
  return [...new Set(source.map((item) => safeText(item, 500)).filter(Boolean))].slice(0, max);
}

function compactObject(value, options = {}, depth = 0) {
  if (value == null || depth > Number(options.depth ?? 5)) return value == null ? value : safeText(value, Number(options.maxText || 1000));
  if (Array.isArray(value)) return value.slice(0, Number(options.maxArray || 16)).map((item) => compactObject(item, options, depth + 1));
  if (typeof value !== 'object') return typeof value === 'string' ? safeText(value, Number(options.maxText || 1000)) : value;
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (/token|secret|password|private[_-]?key|api[_-]?key|bearer/i.test(key)) {
      output[safeText(key, 80)] = item ? '[redacted]' : item;
      continue;
    }
    output[safeText(key, 80)] = compactObject(item, options, depth + 1);
  }
  return output;
}

function objectList(value = [], max = 24) {
  return (Array.isArray(value) ? value : [])
    .filter((item) => item && typeof item === 'object')
    .map((item) => compactObject(item, { depth: 5, maxText: 1800, maxArray: 24 }))
    .slice(0, max);
}

export function normalizeCaitAppContext(raw = {}) {
  const source = raw?.context && typeof raw.context === 'object' ? raw.context : raw;
  const createdAt = safeText(source.created_at || source.createdAt || nowIso(), 80) || nowIso();
  const sourceApp = safeId(source.source_app || source.sourceApp || source.app_id || source.appId || source.app || 'app');
  const title = safeText(source.title || 'App context', 180);
  const id = safeText(source.id || `${sourceApp || 'app'}-${Date.now().toString(36)}`, 160);
  return {
    schema: CAIT_APP_CONTEXT_SCHEMA,
    id,
    source_app: sourceApp,
    source_app_label: safeText(source.source_app_label || source.sourceAppLabel || source.app_label || source.appLabel || sourceApp || 'App', 120),
    title,
    summary: safeText(source.summary || '', 1600),
    facts: safeList(source.facts || [], 40),
    assumptions: safeList(source.assumptions || [], 24),
    artifacts: objectList(source.artifacts || [], 40),
    metrics: objectList(source.metrics || [], 60),
    recommended_next_actions: safeList(source.recommended_next_actions || source.recommendedNextActions || [], 30),
    approval_requests: objectList(source.approval_requests || source.approvalRequests || [], 40),
    delivery_files: objectList(source.delivery_files || source.deliveryFiles || [], 30),
    handoff_targets: safeList(source.handoff_targets || source.handoffTargets || [], 20),
    raw_context: compactObject(source.raw_context || source.rawContext || {}, { depth: 5, maxText: 1400, maxArray: 16 }),
    created_at: createdAt
  };
}

export function createAppContextRecord(raw = {}, ownerInfo = {}, options = {}) {
  const payload = normalizeCaitAppContext(raw);
  const now = nowIso();
  const id = safeText(options.id || payload.id || `ctx-${Date.now().toString(36)}`, 160);
  const expiresAt = safeText(options.expiresAt || new Date(Date.now() + APP_CONTEXT_TTL_MS).toISOString(), 80);
  return {
    id,
    ownerLogin: safeText(ownerInfo.login || ownerInfo.owner || ownerInfo.email || '', 200).toLowerCase(),
    sourceApp: safeId(payload.source_app),
    sourceAppLabel: safeText(payload.source_app_label || payload.source_app, 120),
    title: safeText(payload.title || 'App context', 180),
    summary: safeText(payload.summary || '', 1600),
    payload: { ...payload, id },
    accessToken: safeText(options.accessToken || '', 200),
    status: safeText(options.status || 'ready', 40) || 'ready',
    expiresAt,
    createdAt: safeText(options.createdAt || now, 80),
    updatedAt: safeText(options.updatedAt || now, 80)
  };
}

export function publicAppContext(record = {}, options = {}) {
  if (!record?.id) return null;
  const payload = normalizeCaitAppContext(record.payload || {});
  const base = {
    id: record.id,
    source_app: safeId(record.sourceApp || payload.source_app),
    source_app_label: safeText(record.sourceAppLabel || payload.source_app_label, 120),
    title: safeText(record.title || payload.title, 180),
    summary: safeText(record.summary || payload.summary, 1600),
    status: safeText(record.status || 'ready', 40),
    expires_at: safeText(record.expiresAt || '', 80),
    created_at: safeText(record.createdAt || '', 80),
    updated_at: safeText(record.updatedAt || '', 80)
  };
  if (options.includePayload !== false) base.context = { ...payload, id: record.id };
  return base;
}

export function appContextIsExpired(record = {}, at = Date.now()) {
  const expires = Date.parse(String(record?.expiresAt || record?.expires_at || ''));
  return Number.isFinite(expires) && expires <= at;
}
