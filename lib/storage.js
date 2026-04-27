import { assessAgentRegistrationSafety, normalizeManifest } from './manifest.js';
import {
  DEFAULT_AGENT_SEEDS,
  DEPRECATED_AGENT_SEED_IDS,
  authenticateOrderApiKey as authenticateOrderApiKeyInState,
  hashSecret,
  makeEvent,
  nowIso
} from './shared.js';
import { APP_SETTING_DEFAULTS, WORK_ACTION_IDS } from '../public/work-action-registry.js';

const EVENT_LOG_RETENTION_LIMIT = 2000;
const CHAT_TRANSCRIPT_RETENTION_LIMIT = 2000;
const FEEDBACK_REPORT_RETENTION_LIMIT = 1000;
const DEPRECATED_AGENT_SEED_ID_SET = new Set(DEPRECATED_AGENT_SEED_IDS);
const DEPRECATED_AGENT_SEED_REASON = 'stripe_prohibited_or_restricted_builtin';
const UNSAFE_BUILT_IN_SEED_REASON = 'built_in_seed_failed_policy_review';
const D1_STATE_CACHE = new WeakMap();

const DEFAULT_EXACT_MATCH_ACTIONS = Object.freeze([
  {
    id: 'exact_open_work_timeline_en',
    phrase: 'work timeline',
    normalizedPhrase: 'work timeline',
    action: WORK_ACTION_IDS.OPEN_MARKETING_TIMELINE,
    enabled: true,
    source: 'built_in',
    notes: '',
    createdAt: nowIso(),
    updatedAt: nowIso()
  },
  {
    id: 'exact_open_work_timeline_ja',
    phrase: '実行履歴',
    normalizedPhrase: '実行履歴',
    action: WORK_ACTION_IDS.OPEN_MARKETING_TIMELINE,
    enabled: true,
    source: 'built_in',
    notes: '',
    createdAt: nowIso(),
    updatedAt: nowIso()
  }
]);

const DEFAULT_APP_SETTINGS = Object.freeze(
  Object.entries(APP_SETTING_DEFAULTS).map(([key, value]) => ({
    key: String(key || '').trim(),
    value: String(value || ''),
    source: 'default',
    createdAt: nowIso(),
    updatedAt: nowIso()
  }))
);

const inMemoryState = {
  agents: safeDefaultAgentSeeds(),
  jobs: [],
  events: [],
  accounts: [],
  feedbackReports: [],
  chatTranscripts: [],
  recurringOrders: [],
  emailDeliveries: [],
  exactMatchActions: structuredClone(DEFAULT_EXACT_MATCH_ACTIONS),
  appSettings: structuredClone(DEFAULT_APP_SETTINGS)
};

function builtInSeedManifest(seed = {}) {
  const manifest = seed?.metadata?.manifest && typeof seed.metadata.manifest === 'object'
    ? seed.metadata.manifest
    : {};
  return normalizeManifest({
    schema_version: 'agent-manifest/v1',
    agent_role: seed?.metadata?.agentRole || manifest.agent_role || 'worker',
    name: seed.name,
    description: seed.description,
    task_types: seed.taskTypes,
    ...manifest,
    metadata: {
      ...(manifest.metadata && typeof manifest.metadata === 'object' ? manifest.metadata : {}),
      builtIn: true,
      seedId: seed.id,
      seedCategory: seed?.metadata?.category || seed?.kind || ''
    }
  }, { allowLocalEndpoints: true });
}

function builtInSeedSafety(seed = {}) {
  return assessAgentRegistrationSafety(builtInSeedManifest(seed), { allowLocalEndpoints: true });
}

function isBuiltInSeedAllowed(seed = {}) {
  if (!seed?.id || DEPRECATED_AGENT_SEED_ID_SET.has(seed.id)) return false;
  return builtInSeedSafety(seed).ok;
}

function safeDefaultAgentSeeds() {
  return structuredClone(DEFAULT_AGENT_SEEDS.filter(isBuiltInSeedAllowed));
}

function isRuntimeHiddenAgent(agent = {}) {
  const metadata = agent?.metadata && typeof agent.metadata === 'object' ? agent.metadata : {};
  return Boolean(
    DEPRECATED_AGENT_SEED_ID_SET.has(agent?.id)
    || metadata.hidden_from_catalog
    || metadata.not_routable
    || metadata.deleted_at
    || metadata.deletedAt
    || String(agent?.verificationStatus || '').toLowerCase() === 'deprecated'
  );
}

function mergeSystemAgent(existing = {}, seed = {}) {
  const existingMetadata = existing?.metadata && typeof existing.metadata === 'object'
    ? { ...existing.metadata }
    : {};
  delete existingMetadata.hidden_from_catalog;
  delete existingMetadata.not_routable;
  delete existingMetadata.deleted_at;
  delete existingMetadata.deletedAt;
  delete existingMetadata.deleted_reason;
  delete existingMetadata.deletedReason;
  delete existingMetadata.deprecated_seed;
  return {
    ...existing,
    ...structuredClone(seed),
    earnings: Number(existing?.earnings ?? seed.earnings ?? 0),
    createdAt: existing?.createdAt || seed.createdAt || nowIso(),
    updatedAt: nowIso(),
    token: existing?.token || seed.token,
    metadata: {
      ...existingMetadata,
      ...(seed?.metadata && typeof seed.metadata === 'object' ? seed.metadata : {}),
      manifest: structuredClone(seed?.metadata?.manifest || existing?.metadata?.manifest || {})
    },
    verificationStatus: seed.verificationStatus,
    verificationCheckedAt: seed.verificationCheckedAt || existing?.verificationCheckedAt || nowIso(),
    verificationError: null,
    verificationDetails: structuredClone(seed.verificationDetails || existing?.verificationDetails || null)
  };
}

function softDeleteDeprecatedAgent(agent = {}, reason = DEPRECATED_AGENT_SEED_REASON) {
  const deletedAt = agent?.metadata?.deleted_at || agent?.metadata?.deletedAt || nowIso();
  return {
    ...agent,
    id: agent.id,
    name: agent.name || `DEPRECATED BUILT-IN AGENT ${agent.id || ''}`.trim(),
    description: agent.description || 'Deprecated built-in agent retained for audit only.',
    taskTypes: Array.isArray(agent.taskTypes) ? agent.taskTypes : [],
    online: false,
    owner: agent.owner || 'built-in',
    metadata: {
      ...(agent.metadata && typeof agent.metadata === 'object' ? agent.metadata : {}),
      deleted_at: deletedAt,
      deletedAt,
      deleted_reason: reason,
      deletedReason: reason,
      deprecated_seed: true,
      hidden_from_catalog: true,
      not_routable: true
    },
    verificationStatus: 'deprecated',
    verificationCheckedAt: agent.verificationCheckedAt || deletedAt,
    verificationError: agent.verificationError || 'Deprecated built-in retained for audit; not routable.',
    updatedAt: nowIso()
  };
}

function softDeleteUnsafeBuiltInSeed(existing = {}, seed = {}) {
  const safety = builtInSeedSafety(seed);
  const deletedAt = existing?.metadata?.deleted_at || existing?.metadata?.deletedAt || nowIso();
  return softDeleteDeprecatedAgent({
    ...existing,
    ...seed,
    online: false,
    metadata: {
      ...(existing?.metadata && typeof existing.metadata === 'object' ? existing.metadata : {}),
      ...(seed?.metadata && typeof seed.metadata === 'object' ? seed.metadata : {}),
      deleted_at: deletedAt,
      deletedAt,
      deleted_reason: UNSAFE_BUILT_IN_SEED_REASON,
      deletedReason: UNSAFE_BUILT_IN_SEED_REASON,
      policy_findings: safety.blocked || []
    },
    verificationError: safety.summary || 'Built-in seed failed policy review.'
  }, UNSAFE_BUILT_IN_SEED_REASON);
}

function ensureDefaultAgentsState(inputState = {}) {
  const agents = Array.isArray(inputState.agents)
    ? inputState.agents.filter((agent) => agent && !isRuntimeHiddenAgent(agent))
    : [];
  const byId = new Map(agents.map((agent) => [agent.id, agent]));
  for (const seed of DEFAULT_AGENT_SEEDS) {
    if (!isBuiltInSeedAllowed(seed)) {
      if (byId.has(seed.id)) byId.set(seed.id, softDeleteUnsafeBuiltInSeed(byId.get(seed.id), seed));
      continue;
    }
    byId.set(seed.id, mergeSystemAgent(byId.get(seed.id), seed));
  }
  return {
    ...inputState,
    agents: [...byId.values()].filter((agent) => !isRuntimeHiddenAgent(agent))
  };
}

function chatTranscriptTimestamp(transcript = {}) {
  return String(transcript?.createdAt || transcript?.created_at || transcript?.updatedAt || transcript?.updated_at || '').trim();
}

function jobTimestamp(job = {}) {
  return String(
    job?.completedAt
    || job?.completed_at
    || job?.failedAt
    || job?.failed_at
    || job?.timedOutAt
    || job?.timed_out_at
    || job?.lastCallbackAt
    || job?.last_callback_at
    || job?.startedAt
    || job?.started_at
    || job?.dispatchedAt
    || job?.dispatched_at
    || job?.claimedAt
    || job?.claimed_at
    || job?.createdAt
    || job?.created_at
    || ''
  ).trim();
}

function accountTimestamp(account = {}) {
  return String(account?.updatedAt || account?.updated_at || account?.createdAt || account?.created_at || '').trim();
}

function accountMergeKey(account = {}) {
  const login = String(account?.login || '').trim().toLowerCase();
  if (login) return `login:${login}`;
  const id = String(account?.id || '').trim().toLowerCase();
  return id ? `id:${id}` : '';
}

function apiKeyMergeKey(key = {}) {
  const id = String(key?.id || '').trim();
  if (id) return `id:${id}`;
  const keyHash = String(key?.keyHash || key?.key_hash || '').trim();
  if (keyHash) return `hash:${keyHash}`;
  const prefix = String(key?.prefix || '').trim();
  const createdAt = String(key?.createdAt || key?.created_at || '').trim();
  return prefix || createdAt ? `prefix:${prefix}:${createdAt}` : '';
}

function mergeOrderApiKeyRecord(existing = null, incoming = null) {
  if (!existing) return structuredClone(incoming);
  if (!incoming) return structuredClone(existing);
  const existingTs = String(existing.lastUsedAt || existing.updatedAt || existing.createdAt || existing.created_at || '').trim();
  const incomingTs = String(incoming.lastUsedAt || incoming.updatedAt || incoming.createdAt || incoming.created_at || '').trim();
  const preferred = incomingTs >= existingTs ? incoming : existing;
  const secondary = preferred === incoming ? existing : incoming;
  return {
    ...structuredClone(secondary),
    ...structuredClone(preferred),
    keyHash: preferred.keyHash || secondary.keyHash || preferred.key_hash || secondary.key_hash || '',
    revokedAt: preferred.revokedAt || secondary.revokedAt || preferred.revoked_at || secondary.revoked_at || ''
  };
}

function mergeOrderApiKeySets(existing = [], incoming = []) {
  const merged = new Map();
  for (const item of Array.isArray(existing) ? existing : []) {
    const key = apiKeyMergeKey(item);
    if (!key) continue;
    merged.set(key, structuredClone(item));
  }
  for (const item of Array.isArray(incoming) ? incoming : []) {
    const key = apiKeyMergeKey(item);
    if (!key) continue;
    merged.set(key, mergeOrderApiKeyRecord(merged.get(key), item));
  }
  return [...merged.values()];
}

function mergeUniqueStrings(...groups) {
  const seen = new Set();
  const values = [];
  for (const group of groups) {
    for (const value of Array.isArray(group) ? group : []) {
      const normalized = String(value || '').trim().toLowerCase();
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      values.push(normalized);
    }
  }
  return values;
}

function mergeUniqueObjects(existing = [], incoming = [], keyFn = (item) => JSON.stringify(item)) {
  const merged = new Map();
  for (const item of [...(Array.isArray(existing) ? existing : []), ...(Array.isArray(incoming) ? incoming : [])]) {
    const key = String(keyFn(item) || '').trim();
    if (!key) continue;
    merged.set(key, structuredClone(item));
  }
  return [...merged.values()];
}

function mergeAccountRecord(existing = null, incoming = null) {
  if (!existing) return structuredClone(incoming);
  if (!incoming) return structuredClone(existing);
  const existingTs = accountTimestamp(existing);
  const incomingTs = accountTimestamp(incoming);
  const preferred = incomingTs >= existingTs ? incoming : existing;
  const secondary = preferred === incoming ? existing : incoming;
  const preferredApiAccess = preferred.apiAccess && typeof preferred.apiAccess === 'object' ? preferred.apiAccess : {};
  const secondaryApiAccess = secondary.apiAccess && typeof secondary.apiAccess === 'object' ? secondary.apiAccess : {};
  return {
    ...structuredClone(secondary),
    ...structuredClone(preferred),
    aliases: mergeUniqueStrings(secondary.aliases, preferred.aliases, [secondary.login, preferred.login]),
    linkedIdentities: mergeUniqueObjects(secondary.linkedIdentities, preferred.linkedIdentities, (identity) => [
      identity?.provider,
      identity?.providerUserId || identity?.provider_user_id,
      identity?.login,
      identity?.email
    ].map((part) => String(part || '').trim().toLowerCase()).join(':')),
    apiAccess: {
      ...structuredClone(secondaryApiAccess),
      ...structuredClone(preferredApiAccess),
      orderKeys: mergeOrderApiKeySets(secondaryApiAccess.orderKeys, preferredApiAccess.orderKeys)
    }
  };
}

function mergeAccountSets(existing = [], incoming = []) {
  const merged = new Map();
  for (const item of Array.isArray(existing) ? existing : []) {
    const key = accountMergeKey(item);
    if (!key) continue;
    merged.set(key, structuredClone(item));
  }
  for (const item of Array.isArray(incoming) ? incoming : []) {
    const key = accountMergeKey(item);
    if (!key) continue;
    merged.set(key, mergeAccountRecord(merged.get(key), item));
  }
  return [...merged.values()]
    .sort((a, b) => accountTimestamp(b).localeCompare(accountTimestamp(a)));
}

function mergeJobSets(existing = [], incoming = []) {
  const merged = new Map();
  for (const item of Array.isArray(existing) ? existing : []) {
    if (!item?.id) continue;
    merged.set(item.id, structuredClone(item));
  }
  for (const item of Array.isArray(incoming) ? incoming : []) {
    if (!item?.id) continue;
    const prior = merged.get(item.id);
    merged.set(item.id, mergeJobRecord(prior, item));
  }
  return [...merged.values()]
    .sort((a, b) => jobTimestamp(b).localeCompare(jobTimestamp(a)));
}

function jobStatusRank(status = '') {
  switch (String(status || '').trim().toLowerCase()) {
    case 'completed':
    case 'failed':
    case 'timed_out':
      return 4;
    case 'dispatched':
    case 'running':
      return 3;
    case 'claimed':
      return 2;
    case 'queued':
    case 'blocked':
      return 1;
    default:
      return 0;
  }
}

function mergeJobLogs(existingLogs = [], incomingLogs = []) {
  const seen = new Set();
  const merged = [];
  for (const entry of [...(Array.isArray(existingLogs) ? existingLogs : []), ...(Array.isArray(incomingLogs) ? incomingLogs : [])]) {
    const line = String(entry || '').trim();
    if (!line || seen.has(line)) continue;
    seen.add(line);
    merged.push(line);
  }
  return merged;
}

function mergeJobRecord(existing = null, incoming = null) {
  if (!existing?.id) return structuredClone(incoming);
  if (!incoming?.id) return structuredClone(existing);
  const existingRank = jobStatusRank(existing.status);
  const incomingRank = jobStatusRank(incoming.status);
  const existingTs = jobTimestamp(existing);
  const incomingTs = jobTimestamp(incoming);
  let preferred = incoming;
  let secondary = existing;
  const existingTerminal = existingRank === 4;
  const incomingActive = ['queued', 'claimed', 'running', 'dispatched'].includes(String(incoming.status || '').trim().toLowerCase());
  const incomingClearedTerminalTimestamps = !incoming.completedAt && !incoming.completed_at
    && !incoming.failedAt && !incoming.failed_at
    && !incoming.timedOutAt && !incoming.timed_out_at;
  const incomingRetryMutation = existingTerminal
    && incomingActive
    && incomingClearedTerminalTimestamps
    && (
      Number(incoming.dispatch?.attempts || 0) > Number(existing.dispatch?.attempts || 0)
      || String(incoming.dispatch?.completionStatus || '') !== String(existing.dispatch?.completionStatus || '')
      || String(incoming.dispatchedAt || incoming.dispatched_at || '') !== String(existing.dispatchedAt || existing.dispatched_at || '')
      || (Array.isArray(incoming.logs) ? incoming.logs.length : 0) > (Array.isArray(existing.logs) ? existing.logs.length : 0)
    );
  if (incomingRetryMutation) {
    preferred = incoming;
    secondary = existing;
  } else if (existingRank > incomingRank) {
    preferred = existing;
    secondary = incoming;
  } else if (incomingRank > existingRank) {
    preferred = incoming;
    secondary = existing;
  } else if (existingTs > incomingTs) {
    preferred = existing;
    secondary = incoming;
  }
  return {
    ...structuredClone(secondary),
    ...structuredClone(preferred),
    logs: mergeJobLogs(secondary.logs, preferred.logs)
  };
}

function mergeChatTranscriptSets(existing = [], incoming = [], limit = CHAT_TRANSCRIPT_RETENTION_LIMIT) {
  const merged = new Map();
  for (const item of Array.isArray(existing) ? existing : []) {
    if (!item?.id) continue;
    merged.set(item.id, structuredClone(item));
  }
  for (const item of Array.isArray(incoming) ? incoming : []) {
    if (!item?.id) continue;
    merged.set(item.id, structuredClone(item));
  }
  return [...merged.values()]
    .sort((a, b) => chatTranscriptTimestamp(b).localeCompare(chatTranscriptTimestamp(a)))
    .slice(0, limit);
}

function normalizeExactMatchActionRecord(action = {}) {
  const phrase = String(action.phrase || '').trim();
  const normalizedPhrase = String(action.normalizedPhrase || phrase).trim().replace(/\s+/g, ' ').toLowerCase();
  return {
    id: String(action.id || '').trim() || `exact_${normalizedPhrase.replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/gi, '_') || 'rule'}`,
    phrase,
    normalizedPhrase,
    action: String(action.action || '').trim(),
    enabled: action.enabled !== false,
    source: String(action.source || 'manual').trim() || 'manual',
    notes: String(action.notes || '').trim(),
    createdAt: action.createdAt || nowIso(),
    updatedAt: action.updatedAt || action.createdAt || nowIso()
  };
}

function mergeExactMatchActions(existing = [], incoming = []) {
  const merged = new Map();
  for (const item of [...DEFAULT_EXACT_MATCH_ACTIONS, ...(Array.isArray(existing) ? existing : []), ...(Array.isArray(incoming) ? incoming : [])]) {
    const normalized = normalizeExactMatchActionRecord(item);
    if (!normalized.phrase || !normalized.action) continue;
    merged.set(normalized.id, structuredClone(normalized));
  }
  return [...merged.values()].sort((a, b) => String(a.phrase || '').localeCompare(String(b.phrase || '')));
}

function normalizeAppSettingRecord(setting = {}) {
  const key = String(setting?.key || '').trim();
  if (!key) return null;
  const value = String(setting?.value ?? '');
  return {
    key,
    value,
    source: String(setting?.source || 'manual').trim().slice(0, 40) || 'manual',
    createdAt: setting?.createdAt || setting?.created_at || nowIso(),
    updatedAt: setting?.updatedAt || setting?.updated_at || setting?.createdAt || setting?.created_at || nowIso()
  };
}

function mergeAppSettings(existing = [], incoming = []) {
  const merged = new Map();
  for (const item of DEFAULT_APP_SETTINGS) {
    const normalized = normalizeAppSettingRecord(item);
    if (!normalized) continue;
    merged.set(normalized.key, normalized);
  }
  for (const item of Array.isArray(existing) ? existing : []) {
    const normalized = normalizeAppSettingRecord(item);
    if (!normalized) continue;
    merged.set(normalized.key, normalized);
  }
  for (const item of Array.isArray(incoming) ? incoming : []) {
    const normalized = normalizeAppSettingRecord(item);
    if (!normalized) continue;
    merged.set(normalized.key, normalized);
  }
  return [...merged.values()].sort((a, b) => String(a.key || '').localeCompare(String(b.key || '')));
}

export const D1_SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS agents (\n  id TEXT PRIMARY KEY,\n  name TEXT NOT NULL,\n  description TEXT NOT NULL,\n  task_types TEXT NOT NULL,\n  premium_rate REAL NOT NULL,\n  basic_rate REAL NOT NULL DEFAULT 0.1,\n  success_rate REAL NOT NULL,\n  avg_latency_sec INTEGER NOT NULL,\n  online INTEGER NOT NULL DEFAULT 1,\n  owner TEXT,\n  manifest_url TEXT,\n  manifest_source TEXT,\n  token TEXT,\n  earnings REAL NOT NULL DEFAULT 0,\n  metadata_json TEXT,\n  created_at TEXT NOT NULL,\n  updated_at TEXT NOT NULL\n);\n\nCREATE TABLE IF NOT EXISTS jobs (\n  id TEXT PRIMARY KEY,\n  parent_agent_id TEXT NOT NULL,\n  task_type TEXT NOT NULL,\n  prompt TEXT NOT NULL,\n  input_json TEXT,\n  budget_cap REAL,\n  deadline_sec INTEGER,\n  priority TEXT NOT NULL,\n  status TEXT NOT NULL,\n  job_kind TEXT,\n  assigned_agent_id TEXT,\n  score REAL,\n  usage_json TEXT,\n  billing_estimate_json TEXT,\n  actual_billing_json TEXT,\n  output_json TEXT,\n  failure_reason TEXT,\n  failure_category TEXT,\n  callback_token TEXT,\n  dispatch_json TEXT,\n  workflow_parent_id TEXT,\n  workflow_task TEXT,\n  workflow_agent_name TEXT,\n  workflow_json TEXT,\n  executor_state_json TEXT,\n  original_prompt TEXT,\n  prompt_optimization_json TEXT,\n  selection_mode TEXT,\n  estimate_window_json TEXT,\n  billing_reservation_json TEXT,\n  logs_json TEXT,\n  created_at TEXT NOT NULL,\n  claimed_at TEXT,\n  dispatched_at TEXT,\n  started_at TEXT,\n  last_callback_at TEXT,\n  completed_at TEXT,\n  failed_at TEXT,\n  timed_out_at TEXT\n);\n\nCREATE TABLE IF NOT EXISTS events (\n  id TEXT PRIMARY KEY,\n  type TEXT NOT NULL,\n  message TEXT NOT NULL,\n  meta_json TEXT,\n  created_at TEXT NOT NULL\n);\n\nCREATE TABLE IF NOT EXISTS accounts (\n  id TEXT PRIMARY KEY,\n  login TEXT NOT NULL UNIQUE,\n  profile_json TEXT NOT NULL,\n  created_at TEXT NOT NULL,\n  updated_at TEXT NOT NULL\n);\n\nCREATE TABLE IF NOT EXISTS api_keys (\n  id TEXT PRIMARY KEY,\n  account_login TEXT NOT NULL,\n  label TEXT NOT NULL,\n  mode TEXT NOT NULL,\n  prefix TEXT,\n  key_hash TEXT NOT NULL UNIQUE,\n  scopes_json TEXT NOT NULL,\n  created_at TEXT NOT NULL,\n  last_used_at TEXT,\n  last_used_path TEXT,\n  last_used_method TEXT,\n  revoked_at TEXT,\n  updated_at TEXT NOT NULL\n);\n\nCREATE TABLE IF NOT EXISTS feedback_reports (\n  id TEXT PRIMARY KEY,\n  type TEXT NOT NULL,\n  status TEXT NOT NULL,\n  title TEXT NOT NULL,\n  message TEXT NOT NULL,\n  email TEXT,\n  reporter_login TEXT,\n  reviewed_by TEXT,\n  reviewed_at TEXT,\n  resolution_note TEXT,\n  context_json TEXT,\n  created_at TEXT NOT NULL,\n  updated_at TEXT NOT NULL\n);\n\nCREATE TABLE IF NOT EXISTS chat_transcripts (\n  id TEXT PRIMARY KEY,\n  kind TEXT NOT NULL,\n  prompt TEXT NOT NULL,\n  answer TEXT NOT NULL,\n  prompt_chars INTEGER NOT NULL DEFAULT 0,\n  answer_chars INTEGER NOT NULL DEFAULT 0,\n  redacted INTEGER NOT NULL DEFAULT 0,\n  answer_kind TEXT,\n  status TEXT,\n  task_type TEXT,\n  source TEXT,\n  page_path TEXT,\n  tab TEXT,\n  visitor_id TEXT,\n  logged_in INTEGER NOT NULL DEFAULT 0,\n  auth_provider TEXT,\n  account_hash TEXT,\n  url_count INTEGER NOT NULL DEFAULT 0,\n  file_count INTEGER NOT NULL DEFAULT 0,\n  file_chars INTEGER NOT NULL DEFAULT 0,\n  review_status TEXT NOT NULL DEFAULT 'new',\n  expected_handling TEXT,\n  improvement_note TEXT,\n  reviewed_by TEXT,\n  reviewed_at TEXT,\n  updated_at TEXT,\n  created_at TEXT NOT NULL\n);\n\nCREATE TABLE IF NOT EXISTS email_deliveries (\n  id TEXT PRIMARY KEY,\n  account_login TEXT,\n  recipient_email TEXT NOT NULL,\n  sender_email TEXT,\n  subject TEXT NOT NULL,\n  template TEXT,\n  provider TEXT NOT NULL,\n  status TEXT NOT NULL,\n  provider_message_id TEXT,\n  payload_json TEXT,\n  response_json TEXT,\n  error_text TEXT,\n  created_at TEXT NOT NULL,\n  updated_at TEXT NOT NULL\n);\n\nCREATE TABLE IF NOT EXISTS exact_match_actions (\n  id TEXT PRIMARY KEY,\n  phrase TEXT NOT NULL,\n  normalized_phrase TEXT NOT NULL,\n  action TEXT NOT NULL,\n  enabled INTEGER NOT NULL DEFAULT 1,\n  source TEXT,\n  notes TEXT,\n  created_at TEXT NOT NULL,\n  updated_at TEXT NOT NULL\n);\n\nCREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);\nCREATE INDEX IF NOT EXISTS idx_jobs_assigned_agent_id ON jobs(assigned_agent_id);\nCREATE INDEX IF NOT EXISTS idx_jobs_workflow_parent_id ON jobs(workflow_parent_id);\nCREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);\nCREATE INDEX IF NOT EXISTS idx_accounts_login ON accounts(login);\nCREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);\nCREATE INDEX IF NOT EXISTS idx_api_keys_account_login ON api_keys(account_login);\nCREATE INDEX IF NOT EXISTS idx_feedback_reports_created_at ON feedback_reports(created_at);\nCREATE INDEX IF NOT EXISTS idx_feedback_reports_status ON feedback_reports(status);\nCREATE INDEX IF NOT EXISTS idx_chat_transcripts_created_at ON chat_transcripts(created_at);\nCREATE INDEX IF NOT EXISTS idx_chat_transcripts_review_status ON chat_transcripts(review_status);\nCREATE INDEX IF NOT EXISTS idx_email_deliveries_account_login_created_at ON email_deliveries(account_login,created_at);\nCREATE INDEX IF NOT EXISTS idx_email_deliveries_status_created_at ON email_deliveries(status,created_at);\nCREATE INDEX IF NOT EXISTS idx_exact_match_actions_normalized_phrase ON exact_match_actions(normalized_phrase);`;

const RECURRING_D1_SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS recurring_orders (
  id TEXT PRIMARY KEY,
  owner_login TEXT NOT NULL,
  status TEXT NOT NULL,
  schedule_json TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  runs_attempted INTEGER NOT NULL DEFAULT 0,
  max_runs INTEGER NOT NULL DEFAULT 0,
  next_run_at TEXT,
  last_run_at TEXT,
  last_job_id TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_recurring_orders_owner_login ON recurring_orders(owner_login);
CREATE INDEX IF NOT EXISTS idx_recurring_orders_status_next_run ON recurring_orders(status,next_run_at);`;

const APP_SETTINGS_D1_SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  source TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_app_settings_updated_at ON app_settings(updated_at);`;

const STORAGE_SCHEMA_SQL = `${D1_SCHEMA_SQL}\n\n${RECURRING_D1_SCHEMA_SQL}\n\n${APP_SETTINGS_D1_SCHEMA_SQL}`;

export function createD1LikeStorage(db, options = {}) {
  const allowInMemory = options.allowInMemory === true;
  const stateCacheTtlMs = Math.max(0, Number(options.stateCacheTtlMs ?? 1500) || 0);
  const stateCache = db
    ? (() => {
        if (!D1_STATE_CACHE.has(db)) {
          D1_STATE_CACHE.set(db, { state: null, at: 0, promise: null, version: 0, initialized: false, initPromise: null });
        }
        return D1_STATE_CACHE.get(db);
      })()
    : { state: null, at: 0, promise: null, version: 0, initialized: false, initPromise: null };

  function cloneCachedState() {
    return stateCache.state ? structuredClone(stateCache.state) : null;
  }

  function cacheState(state = null, version = stateCache.version) {
    if (version !== stateCache.version) return;
    stateCache.state = state ? structuredClone(state) : null;
    stateCache.at = stateCache.state ? Date.now() : 0;
  }

  function invalidateStateCache() {
    stateCache.state = null;
    stateCache.at = 0;
    stateCache.promise = null;
    stateCache.version += 1;
  }

  function hasFreshStateCache() {
    return Boolean(stateCache.state && stateCacheTtlMs > 0 && (Date.now() - stateCache.at) < stateCacheTtlMs);
  }

  let writeChain = Promise.resolve();

  function enqueueWrite(work) {
    const runner = writeChain.then(work, work);
    writeChain = runner.catch(() => {});
    return runner;
  }

  async function persistState(nextState, options = {}) {
    await init();
    invalidateStateCache();
    const replace = options.replace === true;
    const existingJobRows = await db.prepare('SELECT * FROM jobs ORDER BY created_at DESC').all();
    const existingJobs = (existingJobRows.results || []).map(deserializeJob);
    const mergedJobs = mergeJobSets(existingJobs, nextState.jobs || []);
    const existingAccountRows = await db.prepare('SELECT * FROM accounts ORDER BY updated_at DESC').all();
    const existingAccounts = (existingAccountRows.results || []).map(deserializeAccount);
    const mergedAccounts = mergeAccountSets(existingAccounts, nextState.accounts || []);
    const existingChatRows = await db.prepare(`SELECT * FROM chat_transcripts ORDER BY created_at DESC LIMIT ${CHAT_TRANSCRIPT_RETENTION_LIMIT}`).all();
    const existingChatTranscripts = (existingChatRows.results || []).map(deserializeChatTranscript);
    const mergedChatTranscripts = mergeChatTranscriptSets(existingChatTranscripts, nextState.chatTranscripts || [], CHAT_TRANSCRIPT_RETENTION_LIMIT);
    const softDeletedDeprecatedAgents = await softDeleteDeprecatedSeedRows();
    if (replace) {
      await db.prepare('DELETE FROM agents').run();
      await db.prepare('DELETE FROM jobs').run();
      await db.prepare('DELETE FROM events').run();
      await db.prepare('DELETE FROM accounts').run();
      await db.prepare('DELETE FROM api_keys').run();
      await db.prepare('DELETE FROM feedback_reports').run();
      await db.prepare('DELETE FROM chat_transcripts').run();
      await db.prepare('DELETE FROM recurring_orders').run();
      await db.prepare('DELETE FROM email_deliveries').run();
      await db.prepare('DELETE FROM exact_match_actions').run();
      await db.prepare('DELETE FROM app_settings').run();
    }
    for (const a of nextState.agents) {
      if (!isRuntimeHiddenAgent(a)) await upsertAgent(a);
    }
    for (const a of softDeletedDeprecatedAgents) await upsertAgent(a);
    for (const j of mergedJobs) await upsertJob(j);
    for (const e of nextState.events) await insertEvent(e);
    for (const account of mergedAccounts) {
      await upsertAccount(account);
      await syncAccountApiKeys(account);
    }
    for (const report of (nextState.feedbackReports || [])) await upsertFeedbackReport(report);
    for (const transcript of mergedChatTranscripts) await upsertChatTranscript(transcript);
    for (const order of (nextState.recurringOrders || [])) await upsertRecurringOrder(order);
    for (const delivery of (nextState.emailDeliveries || [])) await upsertEmailDelivery(delivery);
    for (const action of mergeExactMatchActions([], nextState.exactMatchActions || [])) await upsertExactMatchAction(action);
    for (const setting of mergeAppSettings([], nextState.appSettings || [])) await upsertAppSetting(setting);
    const state = {
      ...nextState,
      jobs: mergedJobs,
      accounts: mergedAccounts,
      chatTranscripts: mergedChatTranscripts,
      exactMatchActions: mergeExactMatchActions([], nextState.exactMatchActions || []),
      appSettings: mergeAppSettings([], nextState.appSettings || [])
    };
    cacheState(state);
    return structuredClone(state);
  }

  if (!db) {
    if (!allowInMemory) {
      throw new Error('Cloudflare D1 binding is required. In-memory fallback is disabled for this runtime.');
    }
    return {
      kind: 'd1-ready',
      supportsPersistence: false,
      schemaSql: STORAGE_SCHEMA_SQL,
      async getState() {
        if (!inMemoryState.events.length) inMemoryState.events.push(makeEvent('LIVE', 'broker storage initialized'));
        if (hasFreshStateCache()) return cloneCachedState();
        const state = structuredClone(inMemoryState);
        cacheState(state);
        return structuredClone(state);
      },
      async getFreshState() {
        invalidateStateCache();
        if (!inMemoryState.events.length) inMemoryState.events.push(makeEvent('LIVE', 'broker storage initialized'));
        const state = structuredClone(inMemoryState);
        cacheState(state);
        return structuredClone(state);
      },
      async getJobById(jobId) {
        const id = String(jobId || '').trim();
        const job = (inMemoryState.jobs || []).find((item) => String(item?.id || '') === id) || null;
        return job ? structuredClone(job) : null;
      },
      async listJobs(options = {}) {
        const limit = Math.max(1, Math.min(100, Number(options.limit || 50) || 50));
        const offset = Math.max(0, Number(options.offset || 0) || 0);
        const identityLogins = new Set((Array.isArray(options.identityLogins) ? options.identityLogins : [])
          .map((value) => String(value || '').trim().toLowerCase())
          .filter(Boolean));
        const accountIds = new Set((Array.isArray(options.accountIds) ? options.accountIds : [])
          .map((value) => String(value || '').trim().toLowerCase())
          .filter(Boolean));
        const jobs = (Array.isArray(inMemoryState.jobs) ? inMemoryState.jobs : [])
          .filter((job) => {
            if (options.admin) return true;
            const requester = job?.input?._broker?.requester || {};
            const login = String(requester.login || requester.email || '').trim().toLowerCase();
            const accountId = String(requester.accountId || '').trim().toLowerCase();
            return (login && identityLogins.has(login)) || (accountId && accountIds.has(accountId));
          })
          .sort((left, right) => {
            const diff = String(right?.createdAt || '').localeCompare(String(left?.createdAt || ''));
            return diff || String(right?.id || '').localeCompare(String(left?.id || ''));
          })
          .slice(offset, offset + limit);
        return structuredClone(jobs);
      },
      async getAccountByLogin(login) {
        const safeLogin = String(login || '').trim().toLowerCase();
        const account = (inMemoryState.accounts || []).find((item) => String(item?.login || '').trim().toLowerCase() === safeLogin) || null;
        return account ? structuredClone(account) : null;
      },
      async authenticateOrderApiKey(rawKey) {
        const matched = authenticateOrderApiKeyInState({ accounts: inMemoryState.accounts || [] }, rawKey);
        return matched ? structuredClone(matched) : null;
      },
      async replaceState(nextState) {
        invalidateStateCache();
        inMemoryState.agents = nextState.agents;
        inMemoryState.jobs = mergeJobSets(inMemoryState.jobs, nextState.jobs || []);
        inMemoryState.events = nextState.events;
        inMemoryState.accounts = mergeAccountSets(inMemoryState.accounts, nextState.accounts || []);
        inMemoryState.feedbackReports = nextState.feedbackReports || [];
        inMemoryState.chatTranscripts = nextState.chatTranscripts || [];
        inMemoryState.recurringOrders = nextState.recurringOrders || [];
        inMemoryState.emailDeliveries = nextState.emailDeliveries || [];
        inMemoryState.exactMatchActions = mergeExactMatchActions(inMemoryState.exactMatchActions, nextState.exactMatchActions || []);
        inMemoryState.appSettings = mergeAppSettings(inMemoryState.appSettings, nextState.appSettings || []);
        if (!inMemoryState.events.length) inMemoryState.events.push(makeEvent('LIVE', 'broker storage initialized'));
        const state = structuredClone(inMemoryState);
        cacheState(state);
        return structuredClone(state);
      },
      async mutate(mutator) {
        if (!inMemoryState.events.length) inMemoryState.events.push(makeEvent('LIVE', 'broker storage initialized'));
        const draft = structuredClone(inMemoryState);
        const result = await mutator(draft);
        invalidateStateCache();
        inMemoryState.agents = draft.agents;
        inMemoryState.jobs = mergeJobSets(inMemoryState.jobs, draft.jobs || []);
        inMemoryState.events = draft.events;
        inMemoryState.accounts = mergeAccountSets(inMemoryState.accounts, draft.accounts || []);
        inMemoryState.feedbackReports = draft.feedbackReports || [];
        inMemoryState.chatTranscripts = draft.chatTranscripts || [];
        inMemoryState.recurringOrders = draft.recurringOrders || [];
        inMemoryState.emailDeliveries = draft.emailDeliveries || [];
        inMemoryState.exactMatchActions = mergeExactMatchActions(inMemoryState.exactMatchActions, draft.exactMatchActions || []);
        inMemoryState.appSettings = mergeAppSettings(inMemoryState.appSettings, draft.appSettings || []);
        if (!inMemoryState.events.length) inMemoryState.events.push(makeEvent('LIVE', 'broker storage initialized'));
        cacheState(inMemoryState);
        return result;
      },
      async mutateAccount(login, mutator) {
        const safeLogin = String(login || '').trim().toLowerCase();
        const account = (inMemoryState.accounts || []).find((item) => String(item?.login || '').trim().toLowerCase() === safeLogin) || null;
        const draft = { accounts: account ? [structuredClone(account)] : [] };
        const result = await mutator(draft);
        invalidateStateCache();
        inMemoryState.accounts = mergeAccountSets(inMemoryState.accounts, draft.accounts || []);
        cacheState(inMemoryState);
        return result;
      },
      async appendEvent(event) {
        inMemoryState.events.push(event);
        if (inMemoryState.events.length > EVENT_LOG_RETENTION_LIMIT) inMemoryState.events = inMemoryState.events.slice(-EVENT_LOG_RETENTION_LIMIT);
        cacheState(inMemoryState);
        return event;
      },
      async appendChatTranscript(transcript) {
        inMemoryState.chatTranscripts = mergeChatTranscriptSets(inMemoryState.chatTranscripts, [transcript], CHAT_TRANSCRIPT_RETENTION_LIMIT);
        cacheState(inMemoryState);
        return transcript;
      },
      async appendEmailDelivery(delivery) {
        inMemoryState.emailDeliveries.unshift(structuredClone(delivery));
        if (inMemoryState.emailDeliveries.length > 1000) inMemoryState.emailDeliveries = inMemoryState.emailDeliveries.slice(0, 1000);
        cacheState(inMemoryState);
        return delivery;
      },
      note: 'No DB binding available; using in-memory fallback.'
    };
  }

  let initialized = Boolean(stateCache.initialized);

  async function init() {
    if (initialized) return;
    if (stateCache.initialized) {
      initialized = true;
      return;
    }
    if (!stateCache.initPromise) {
      stateCache.initPromise = (async () => {
        const statements = STORAGE_SCHEMA_SQL.split(';').map(s => s.trim()).filter(Boolean);
        for (const sql of statements) await db.prepare(sql).run();
        await ensureChatTranscriptColumns();
        await ensureJobWorkflowColumns();
        await softDeleteDeprecatedSeedRows();
        const existingSeedRows = await db.prepare(`SELECT * FROM agents WHERE id IN (${DEFAULT_AGENT_SEEDS.map(() => '?').join(',')})`).bind(...DEFAULT_AGENT_SEEDS.map((agent) => agent.id)).all();
        const existingSeedMap = new Map((existingSeedRows.results || []).map((row) => [row.id, deserializeAgent(row)]));
        for (const seed of DEFAULT_AGENT_SEEDS) {
          if (!isBuiltInSeedAllowed(seed)) {
            const existing = existingSeedMap.get(seed.id);
            if (existing) await upsertAgent(softDeleteUnsafeBuiltInSeed(existing, seed));
            continue;
          }
          await upsertAgent(mergeSystemAgent(existingSeedMap.get(seed.id), seed));
        }
        const seedCheck = await db.prepare('SELECT COUNT(*) as count FROM events').first();
        if (!Number(seedCheck?.count || 0)) {
          await insertEvent(makeEvent('LIVE', 'broker storage initialized'));
        }
        stateCache.initialized = true;
      })().finally(() => {
        stateCache.initPromise = null;
      });
    }
    await stateCache.initPromise;
    initialized = true;
      }

  async function ensureChatTranscriptColumns() {
    const columns = await db.prepare('PRAGMA table_info(chat_transcripts)').all();
    const existing = new Set((columns.results || []).map((row) => row.name));
    const additions = [
      ['review_status', "review_status TEXT NOT NULL DEFAULT 'new'"],
      ['expected_handling', 'expected_handling TEXT'],
      ['improvement_note', 'improvement_note TEXT'],
      ['reviewed_by', 'reviewed_by TEXT'],
      ['reviewed_at', 'reviewed_at TEXT'],
      ['updated_at', 'updated_at TEXT'],
      ['session_id', 'session_id TEXT']
    ];
    for (const [name, ddl] of additions) {
      if (!existing.has(name)) await db.prepare(`ALTER TABLE chat_transcripts ADD COLUMN ${ddl}`).run();
    }
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_chat_transcripts_session_id ON chat_transcripts(session_id)').run();
  }

  async function ensureJobWorkflowColumns() {
    const columns = await db.prepare('PRAGMA table_info(jobs)').all();
    const existing = new Set((columns.results || []).map((row) => row.name));
    const additions = [
      ['job_kind', 'job_kind TEXT'],
      ['workflow_parent_id', 'workflow_parent_id TEXT'],
      ['workflow_task', 'workflow_task TEXT'],
      ['workflow_agent_name', 'workflow_agent_name TEXT'],
      ['workflow_json', 'workflow_json TEXT'],
      ['executor_state_json', 'executor_state_json TEXT'],
      ['original_prompt', 'original_prompt TEXT'],
      ['prompt_optimization_json', 'prompt_optimization_json TEXT'],
      ['selection_mode', 'selection_mode TEXT'],
      ['estimate_window_json', 'estimate_window_json TEXT'],
      ['billing_reservation_json', 'billing_reservation_json TEXT']
    ];
    for (const [name, ddl] of additions) {
      if (!existing.has(name)) await db.prepare(`ALTER TABLE jobs ADD COLUMN ${ddl}`).run();
    }
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_jobs_workflow_parent_id ON jobs(workflow_parent_id)').run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at)').run();
    await db.prepare('CREATE INDEX IF NOT EXISTS idx_jobs_workflow_parent_created_at ON jobs(workflow_parent_id,created_at)').run();
  }

  async function softDeleteDeprecatedSeedRows() {
    if (!DEPRECATED_AGENT_SEED_IDS.length) return [];
    const rows = await db.prepare(`SELECT * FROM agents WHERE id IN (${DEPRECATED_AGENT_SEED_IDS.map(() => '?').join(',')})`).bind(...DEPRECATED_AGENT_SEED_IDS).all();
    const softDeleted = (rows.results || []).map((row) => softDeleteDeprecatedAgent(deserializeAgent(row)));
    for (const agent of softDeleted) await upsertAgent(agent);
    return softDeleted;
  }

  function serializeAgent(agent) {
    const metadata = {
      ...(agent.metadata || {}),
      __verification: {
        status: agent.verificationStatus || null,
        checkedAt: agent.verificationCheckedAt || null,
        error: agent.verificationError || null,
        details: agent.verificationDetails || null
      }
    };
    return {
      id: agent.id,
      name: agent.name,
      description: agent.description,
      task_types: JSON.stringify(agent.taskTypes || []),
      premium_rate: Number(agent.providerMarkupRate ?? agent.tokenMarkupRate ?? agent.creatorFeeRate ?? agent.premiumRate ?? 0.1),
      basic_rate: Number(agent.platformMarginRate ?? agent.marketplaceFeeRate ?? agent.basicRate ?? 0.1),
      success_rate: Number(agent.successRate ?? 0.9),
      avg_latency_sec: Number(agent.avgLatencySec ?? 20),
      online: agent.online ? 1 : 0,
      owner: agent.owner || null,
      manifest_url: agent.manifestUrl || null,
      manifest_source: agent.manifestSource || null,
      token: agent.token || null,
      earnings: Number(agent.earnings ?? 0),
      metadata_json: JSON.stringify(metadata),
      created_at: agent.createdAt || nowIso(),
      updated_at: agent.updatedAt || nowIso()
    };
  }
  function deserializeAgent(row) {
    const metadata = safeJson(row.metadata_json, {});
    const verification = metadata?.__verification || {};
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      taskTypes: safeJson(row.task_types, []),
      providerMarkupRate: Number(row.premium_rate ?? 0.1),
      tokenMarkupRate: Number(row.premium_rate ?? 0.1),
      platformMarginRate: Number(row.basic_rate ?? 0.1),
      creatorFeeRate: Number(row.premium_rate ?? 0.1),
      marketplaceFeeRate: Number(row.basic_rate ?? 0.1),
      premiumRate: Number(row.premium_rate ?? 0.1),
      basicRate: Number(row.basic_rate ?? 0.1),
      successRate: Number(row.success_rate ?? 0.9),
      avgLatencySec: Number(row.avg_latency_sec ?? 20),
      online: Boolean(row.online),
      owner: row.owner,
      manifestUrl: row.manifest_url,
      manifestSource: row.manifest_source,
      token: row.token,
      earnings: Number(row.earnings ?? 0),
      metadata,
      verificationStatus: row.verification_status || verification.status || null,
      verificationCheckedAt: row.verification_checked_at || verification.checkedAt || null,
      verificationError: row.verification_error || verification.error || null,
      verificationDetails: verification.details || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
  function serializeJob(job) {
    return {
      id: job.id,
      parent_agent_id: job.parentAgentId,
      task_type: job.taskType,
      prompt: job.prompt,
      input_json: JSON.stringify(job.input || {}),
      budget_cap: job.budgetCap,
      deadline_sec: job.deadlineSec,
      priority: job.priority || 'normal',
      status: job.status,
      job_kind: job.jobKind || null,
      assigned_agent_id: job.assignedAgentId || null,
      score: job.score,
      usage_json: JSON.stringify(job.usage || null),
      billing_estimate_json: JSON.stringify(job.billingEstimate || null),
      actual_billing_json: JSON.stringify(job.actualBilling || null),
      output_json: JSON.stringify(job.output || null),
      failure_reason: job.failureReason || null,
      failure_category: job.failureCategory || null,
      callback_token: job.callbackToken || null,
      dispatch_json: JSON.stringify(job.dispatch || null),
      workflow_parent_id: job.workflowParentId || null,
      workflow_task: job.workflowTask || null,
      workflow_agent_name: job.workflowAgentName || null,
      workflow_json: JSON.stringify(job.workflow || null),
      executor_state_json: JSON.stringify(job.executorState || null),
      original_prompt: job.originalPrompt || null,
      prompt_optimization_json: JSON.stringify(job.promptOptimization || null),
      selection_mode: job.selectionMode || null,
      estimate_window_json: JSON.stringify(job.estimateWindow || null),
      billing_reservation_json: JSON.stringify(job.billingReservation || null),
      logs_json: JSON.stringify(job.logs || []),
      created_at: job.createdAt || nowIso(),
      claimed_at: job.claimedAt || null,
      dispatched_at: job.dispatchedAt || null,
      started_at: job.startedAt || null,
      last_callback_at: job.lastCallbackAt || null,
      completed_at: job.completedAt || null,
      failed_at: job.failedAt || null,
      timed_out_at: job.timedOutAt || null
    };
  }
  function deserializeJob(row) {
    return {
      id: row.id,
      parentAgentId: row.parent_agent_id,
      taskType: row.task_type,
      prompt: row.prompt,
      input: safeJson(row.input_json, {}),
      budgetCap: row.budget_cap,
      deadlineSec: row.deadline_sec,
      priority: row.priority,
      status: row.status,
      jobKind: row.job_kind || null,
      assignedAgentId: row.assigned_agent_id,
      score: row.score == null ? null : Number(row.score),
      usage: safeJson(row.usage_json, null),
      billingEstimate: safeJson(row.billing_estimate_json, null),
      actualBilling: safeJson(row.actual_billing_json, null),
      output: safeJson(row.output_json, null),
      failureReason: row.failure_reason,
      failureCategory: row.failure_category,
      callbackToken: row.callback_token,
      dispatch: safeJson(row.dispatch_json, null),
      workflowParentId: row.workflow_parent_id || null,
      workflowTask: row.workflow_task || null,
      workflowAgentName: row.workflow_agent_name || null,
      workflow: safeJson(row.workflow_json, null),
      executorState: safeJson(row.executor_state_json, null),
      originalPrompt: row.original_prompt || null,
      promptOptimization: safeJson(row.prompt_optimization_json, null),
      selectionMode: row.selection_mode || null,
      estimateWindow: safeJson(row.estimate_window_json, null),
      billingReservation: safeJson(row.billing_reservation_json, null),
      logs: safeJson(row.logs_json, []),
      createdAt: row.created_at,
      claimedAt: row.claimed_at,
      dispatchedAt: row.dispatched_at,
      startedAt: row.started_at,
      lastCallbackAt: row.last_callback_at,
      completedAt: row.completed_at,
      failedAt: row.failed_at,
      timedOutAt: row.timed_out_at
    };
  }
  function deserializeEvent(row) {
    return { id: row.id, type: row.type, message: row.message, meta: safeJson(row.meta_json, {}), ts: row.created_at };
  }
  function serializeAccount(account) {
    return {
      id: account.id,
      login: account.login,
      profile_json: JSON.stringify(account),
      created_at: account.createdAt || nowIso(),
      updated_at: account.updatedAt || nowIso()
    };
  }
  function deserializeAccount(row) {
    return safeJson(row.profile_json, {
      id: row.id,
      login: row.login,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  }
  function serializeApiKey(account = {}, key = {}) {
    const now = nowIso();
    return {
      id: String(key.id || '').trim(),
      account_login: String(account.login || '').trim().toLowerCase(),
      label: String(key.label || 'default').trim().slice(0, 80) || 'default',
      mode: ['live', 'test'].includes(String(key.mode || '').trim().toLowerCase()) ? String(key.mode).trim().toLowerCase() : 'live',
      prefix: String(key.prefix || '').trim(),
      key_hash: String(key.keyHash || key.key_hash || '').trim(),
      scopes_json: JSON.stringify(Array.isArray(key.scopes) ? key.scopes : []),
      created_at: String(key.createdAt || key.created_at || now).trim(),
      last_used_at: String(key.lastUsedAt || key.last_used_at || '').trim() || null,
      last_used_path: String(key.lastUsedPath || key.last_used_path || '').trim() || null,
      last_used_method: String(key.lastUsedMethod || key.last_used_method || '').trim().toUpperCase() || null,
      revoked_at: String(key.revokedAt || key.revoked_at || '').trim() || null,
      updated_at: String(account.updatedAt || account.updated_at || key.updatedAt || key.updated_at || now).trim()
    };
  }
  function deserializeApiKey(row) {
    return {
      id: row.id,
      label: row.label,
      mode: row.mode || 'live',
      prefix: row.prefix || '',
      scopes: safeJson(row.scopes_json, []),
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at || '',
      lastUsedPath: row.last_used_path || '',
      lastUsedMethod: row.last_used_method || '',
      revokedAt: row.revoked_at || '',
      active: !row.revoked_at
    };
  }
  function serializeFeedbackReport(report) {
    return {
      id: report.id,
      type: report.type,
      status: report.status || 'open',
      title: report.title,
      message: report.message,
      email: report.email || null,
      reporter_login: report.reporterLogin || null,
      reviewed_by: report.reviewedBy || null,
      reviewed_at: report.reviewedAt || null,
      resolution_note: report.resolutionNote || null,
      context_json: JSON.stringify(report.context || {}),
      created_at: report.createdAt || nowIso(),
      updated_at: report.updatedAt || nowIso()
    };
  }
  function deserializeFeedbackReport(row) {
    return {
      id: row.id,
      type: row.type,
      status: row.status || 'open',
      title: row.title,
      message: row.message,
      email: row.email || '',
      reporterLogin: row.reporter_login || '',
      reviewedBy: row.reviewed_by || '',
      reviewedAt: row.reviewed_at || '',
      resolutionNote: row.resolution_note || '',
      context: safeJson(row.context_json, {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
  function serializeChatTranscript(transcript) {
    return {
      id: transcript.id,
      kind: transcript.kind || 'work_chat',
      prompt: transcript.prompt || '',
      answer: transcript.answer || '',
      prompt_chars: Number(transcript.promptChars || 0),
      answer_chars: Number(transcript.answerChars || 0),
      redacted: transcript.redacted ? 1 : 0,
      answer_kind: transcript.answerKind || null,
      status: transcript.status || null,
      task_type: transcript.taskType || null,
      source: transcript.source || null,
      page_path: transcript.pagePath || null,
      tab: transcript.tab || null,
      session_id: transcript.sessionId || null,
      visitor_id: transcript.visitorId || null,
      logged_in: transcript.loggedIn ? 1 : 0,
      auth_provider: transcript.authProvider || null,
      account_hash: transcript.accountHash || null,
      url_count: Number(transcript.urlCount || 0),
      file_count: Number(transcript.fileCount || 0),
      file_chars: Number(transcript.fileChars || 0),
      review_status: transcript.reviewStatus || 'new',
      expected_handling: transcript.expectedHandling || null,
      improvement_note: transcript.improvementNote || null,
      reviewed_by: transcript.reviewedBy || null,
      reviewed_at: transcript.reviewedAt || null,
      updated_at: transcript.updatedAt || transcript.createdAt || nowIso(),
      created_at: transcript.createdAt || nowIso()
    };
  }
  function deserializeChatTranscript(row) {
    return {
      id: row.id,
      kind: row.kind || 'work_chat',
      prompt: row.prompt || '',
      answer: row.answer || '',
      promptChars: Number(row.prompt_chars || 0),
      answerChars: Number(row.answer_chars || 0),
      redacted: Boolean(row.redacted),
      answerKind: row.answer_kind || '',
      status: row.status || '',
      taskType: row.task_type || '',
      source: row.source || '',
      pagePath: row.page_path || '',
      tab: row.tab || '',
      sessionId: row.session_id || '',
      visitorId: row.visitor_id || '',
      loggedIn: Boolean(row.logged_in),
      authProvider: row.auth_provider || '',
      accountHash: row.account_hash || '',
      urlCount: Number(row.url_count || 0),
      fileCount: Number(row.file_count || 0),
      fileChars: Number(row.file_chars || 0),
      reviewStatus: row.review_status || 'new',
      expectedHandling: row.expected_handling || '',
      improvementNote: row.improvement_note || '',
      reviewedBy: row.reviewed_by || '',
      reviewedAt: row.reviewed_at || '',
      updatedAt: row.updated_at || row.created_at,
      createdAt: row.created_at
    };
  }
  function serializeEmailDelivery(delivery) {
    return {
      id: delivery.id,
      account_login: delivery.accountLogin || null,
      recipient_email: delivery.recipientEmail || '',
      sender_email: delivery.senderEmail || null,
      subject: delivery.subject || '',
      template: delivery.template || null,
      provider: delivery.provider || 'resend',
      status: delivery.status || 'queued',
      provider_message_id: delivery.providerMessageId || null,
      payload_json: JSON.stringify(delivery.payload || {}),
      response_json: JSON.stringify(delivery.response || {}),
      error_text: delivery.errorText || null,
      created_at: delivery.createdAt || nowIso(),
      updated_at: delivery.updatedAt || delivery.createdAt || nowIso()
    };
  }
  function deserializeEmailDelivery(row) {
    return {
      id: row.id,
      accountLogin: row.account_login || '',
      recipientEmail: row.recipient_email || '',
      senderEmail: row.sender_email || '',
      subject: row.subject || '',
      template: row.template || '',
      provider: row.provider || 'resend',
      status: row.status || 'queued',
      providerMessageId: row.provider_message_id || '',
      payload: safeJson(row.payload_json, {}),
      response: safeJson(row.response_json, {}),
      errorText: row.error_text || '',
      createdAt: row.created_at,
      updatedAt: row.updated_at || row.created_at
    };
  }
  function serializeExactMatchAction(action) {
    const normalized = normalizeExactMatchActionRecord(action);
    return {
      id: normalized.id,
      phrase: normalized.phrase,
      normalized_phrase: normalized.normalizedPhrase,
      action: normalized.action,
      enabled: normalized.enabled ? 1 : 0,
      source: normalized.source || null,
      notes: normalized.notes || null,
      created_at: normalized.createdAt || nowIso(),
      updated_at: normalized.updatedAt || normalized.createdAt || nowIso()
    };
  }
  function deserializeExactMatchAction(row) {
    return normalizeExactMatchActionRecord({
      id: row.id,
      phrase: row.phrase || '',
      normalizedPhrase: row.normalized_phrase || '',
      action: row.action || '',
      enabled: Boolean(row.enabled),
      source: row.source || '',
      notes: row.notes || '',
      createdAt: row.created_at,
      updatedAt: row.updated_at || row.created_at
    });
  }
  function serializeAppSetting(setting) {
    const normalized = normalizeAppSettingRecord(setting);
    return {
      key: normalized.key,
      value: normalized.value,
      source: normalized.source || null,
      created_at: normalized.createdAt || nowIso(),
      updated_at: normalized.updatedAt || normalized.createdAt || nowIso()
    };
  }
  function deserializeAppSetting(row) {
    return normalizeAppSettingRecord({
      key: row.key,
      value: row.value || '',
      source: row.source || '',
      created_at: row.created_at,
      updated_at: row.updated_at || row.created_at
    });
  }
  function serializeRecurringOrder(order) {
    const schedule = order.schedule && typeof order.schedule === 'object' ? order.schedule : {};
    return {
      id: order.id,
      owner_login: order.ownerLogin || order.owner_login || '',
      status: order.status || 'active',
      schedule_json: JSON.stringify(schedule),
      payload_json: JSON.stringify(order || {}),
      runs_attempted: Number(order.runsAttempted ?? order.runs_attempted ?? 0),
      max_runs: Number(order.maxRuns ?? order.max_runs ?? 0),
      next_run_at: order.nextRunAt || order.next_run_at || null,
      last_run_at: order.lastRunAt || order.last_run_at || null,
      last_job_id: order.lastJobId || order.last_job_id || null,
      last_error: order.lastError || order.last_error || null,
      created_at: order.createdAt || order.created_at || nowIso(),
      updated_at: order.updatedAt || order.updated_at || nowIso()
    };
  }
  function deserializeRecurringOrder(row) {
    const payload = safeJson(row.payload_json, {});
    return {
      ...payload,
      id: row.id,
      ownerLogin: row.owner_login || payload.ownerLogin || '',
      status: row.status || payload.status || 'active',
      schedule: safeJson(row.schedule_json, payload.schedule || {}),
      runsAttempted: Number(row.runs_attempted ?? payload.runsAttempted ?? 0),
      maxRuns: Number(row.max_runs ?? payload.maxRuns ?? 0),
      nextRunAt: row.next_run_at || payload.nextRunAt || null,
      lastRunAt: row.last_run_at || payload.lastRunAt || null,
      lastJobId: row.last_job_id || payload.lastJobId || null,
      lastError: row.last_error || payload.lastError || null,
      createdAt: row.created_at || payload.createdAt || nowIso(),
      updatedAt: row.updated_at || payload.updatedAt || nowIso()
    };
  }

  async function upsertAgent(agent) {
    const v = serializeAgent(agent);
    await db.prepare(`INSERT OR REPLACE INTO agents (id,name,description,task_types,premium_rate,basic_rate,success_rate,avg_latency_sec,online,owner,manifest_url,manifest_source,token,earnings,metadata_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(v.id, v.name, v.description, v.task_types, v.premium_rate, v.basic_rate, v.success_rate, v.avg_latency_sec, v.online, v.owner, v.manifest_url, v.manifest_source, v.token, v.earnings, v.metadata_json, v.created_at, v.updated_at)
      .run();
  }
  async function upsertJob(job) {
    const v = serializeJob(job);
    await db.prepare(`INSERT OR REPLACE INTO jobs (id,parent_agent_id,task_type,prompt,input_json,budget_cap,deadline_sec,priority,status,job_kind,assigned_agent_id,score,usage_json,billing_estimate_json,actual_billing_json,output_json,failure_reason,failure_category,callback_token,dispatch_json,workflow_parent_id,workflow_task,workflow_agent_name,workflow_json,executor_state_json,original_prompt,prompt_optimization_json,selection_mode,estimate_window_json,billing_reservation_json,logs_json,created_at,claimed_at,dispatched_at,started_at,last_callback_at,completed_at,failed_at,timed_out_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(v.id, v.parent_agent_id, v.task_type, v.prompt, v.input_json, v.budget_cap, v.deadline_sec, v.priority, v.status, v.job_kind, v.assigned_agent_id, v.score, v.usage_json, v.billing_estimate_json, v.actual_billing_json, v.output_json, v.failure_reason, v.failure_category, v.callback_token, v.dispatch_json, v.workflow_parent_id, v.workflow_task, v.workflow_agent_name, v.workflow_json, v.executor_state_json, v.original_prompt, v.prompt_optimization_json, v.selection_mode, v.estimate_window_json, v.billing_reservation_json, v.logs_json, v.created_at, v.claimed_at, v.dispatched_at, v.started_at, v.last_callback_at, v.completed_at, v.failed_at, v.timed_out_at)
      .run();
  }
  async function loadJobById(jobId) {
    const id = String(jobId || '').trim();
    if (!id) return null;
    const row = await db.prepare('SELECT * FROM jobs WHERE id=? LIMIT 1')
      .bind(id)
      .first();
    return row ? deserializeJob(row) : null;
  }
  async function listJobsSlice(options = {}) {
    const limit = Math.max(1, Math.min(100, Number(options.limit || 50) || 50));
    const offset = Math.max(0, Number(options.offset || 0) || 0);
    if (options.admin) {
      const rows = await db.prepare('SELECT * FROM jobs ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?')
        .bind(limit, offset)
        .all();
      return (rows.results || []).map(deserializeJob);
    }
    const identityLogins = [...new Set((Array.isArray(options.identityLogins) ? options.identityLogins : [])
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean))]
      .slice(0, 20);
    const accountIds = [...new Set((Array.isArray(options.accountIds) ? options.accountIds : [])
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean))]
      .slice(0, 20);
    const clauses = [];
    const params = [];
    if (identityLogins.length) {
      clauses.push(`lower(COALESCE(json_extract(input_json, '$._broker.requester.login'), json_extract(input_json, '$._broker.requester.email'), '')) IN (${identityLogins.map(() => '?').join(',')})`);
      params.push(...identityLogins);
    }
    if (accountIds.length) {
      clauses.push(`lower(COALESCE(json_extract(input_json, '$._broker.requester.accountId'), '')) IN (${accountIds.map(() => '?').join(',')})`);
      params.push(...accountIds);
    }
    if (!clauses.length) return [];
    const rows = await db.prepare(`SELECT * FROM jobs WHERE ${clauses.map((clause) => `(${clause})`).join(' OR ')} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`)
      .bind(...params, limit, offset)
      .all();
    return (rows.results || []).map(deserializeJob);
  }
  async function insertEvent(event) {
    await db.prepare(`INSERT OR REPLACE INTO events (id,type,message,meta_json,created_at) VALUES (?,?,?,?,?)`)
      .bind(event.id, event.type, event.message, JSON.stringify(event.meta || {}), event.ts || nowIso())
      .run();
  }
  async function upsertAccount(account) {
    const v = serializeAccount(account);
    await db.prepare(`INSERT OR REPLACE INTO accounts (id,login,profile_json,created_at,updated_at) VALUES (?,?,?,?,?)`)
      .bind(v.id, v.login, v.profile_json, v.created_at, v.updated_at)
      .run();
  }
  async function upsertApiKeyForAccount(account, key) {
    const v = serializeApiKey(account, key);
    if (!v.id || !v.account_login || !v.key_hash) return null;
    await db.prepare(`INSERT OR REPLACE INTO api_keys (id,account_login,label,mode,prefix,key_hash,scopes_json,created_at,last_used_at,last_used_path,last_used_method,revoked_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(v.id, v.account_login, v.label, v.mode, v.prefix, v.key_hash, v.scopes_json, v.created_at, v.last_used_at, v.last_used_path, v.last_used_method, v.revoked_at, v.updated_at)
      .run();
    return v;
  }
  async function syncAccountApiKeys(account) {
    const keys = Array.isArray(account?.apiAccess?.orderKeys) ? account.apiAccess.orderKeys : [];
    for (const key of keys) await upsertApiKeyForAccount(account, key);
  }
  async function loadAccountByLogin(login) {
    const safeLogin = String(login || '').trim().toLowerCase();
    if (!safeLogin) return null;
    const row = await db.prepare('SELECT * FROM accounts WHERE lower(login)=? LIMIT 1')
      .bind(safeLogin)
      .first();
    return row ? deserializeAccount(row) : null;
  }
  async function loadAccountsOnly() {
    const rows = await db.prepare('SELECT * FROM accounts ORDER BY updated_at DESC').all();
    return (rows.results || []).map(deserializeAccount);
  }
  async function loadApiKeyByHash(keyHash) {
    const safeHash = String(keyHash || '').trim();
    if (!safeHash) return null;
    const row = await db.prepare("SELECT * FROM api_keys WHERE key_hash=? AND (revoked_at IS NULL OR revoked_at='') LIMIT 1")
      .bind(safeHash)
      .first();
    if (!row) return null;
    const account = await loadAccountByLogin(row.account_login) || {
      id: `acct:${String(row.account_login || '').trim().toLowerCase()}`,
      login: String(row.account_login || '').trim().toLowerCase(),
      authProvider: 'api-key',
      createdAt: row.created_at || nowIso(),
      updatedAt: row.updated_at || row.created_at || nowIso()
    };
    return {
      account,
      apiKey: deserializeApiKey(row),
      keyKind: 'cait'
    };
  }
  async function upsertFeedbackReport(report) {
    const v = serializeFeedbackReport(report);
    await db.prepare(`INSERT OR REPLACE INTO feedback_reports (id,type,status,title,message,email,reporter_login,reviewed_by,reviewed_at,resolution_note,context_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(v.id, v.type, v.status, v.title, v.message, v.email, v.reporter_login, v.reviewed_by, v.reviewed_at, v.resolution_note, v.context_json, v.created_at, v.updated_at)
      .run();
  }
  async function upsertChatTranscript(transcript) {
    const v = serializeChatTranscript(transcript);
    await db.prepare(`INSERT OR REPLACE INTO chat_transcripts (id,kind,prompt,answer,prompt_chars,answer_chars,redacted,answer_kind,status,task_type,source,page_path,tab,session_id,visitor_id,logged_in,auth_provider,account_hash,url_count,file_count,file_chars,review_status,expected_handling,improvement_note,reviewed_by,reviewed_at,updated_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(v.id, v.kind, v.prompt, v.answer, v.prompt_chars, v.answer_chars, v.redacted, v.answer_kind, v.status, v.task_type, v.source, v.page_path, v.tab, v.session_id, v.visitor_id, v.logged_in, v.auth_provider, v.account_hash, v.url_count, v.file_count, v.file_chars, v.review_status, v.expected_handling, v.improvement_note, v.reviewed_by, v.reviewed_at, v.updated_at, v.created_at)
      .run();
  }
  async function upsertRecurringOrder(order) {
    const v = serializeRecurringOrder(order);
    await db.prepare(`INSERT OR REPLACE INTO recurring_orders (id,owner_login,status,schedule_json,payload_json,runs_attempted,max_runs,next_run_at,last_run_at,last_job_id,last_error,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(v.id, v.owner_login, v.status, v.schedule_json, v.payload_json, v.runs_attempted, v.max_runs, v.next_run_at, v.last_run_at, v.last_job_id, v.last_error, v.created_at, v.updated_at)
      .run();
  }
  async function upsertEmailDelivery(delivery) {
    const v = serializeEmailDelivery(delivery);
    await db.prepare(`INSERT OR REPLACE INTO email_deliveries (id,account_login,recipient_email,sender_email,subject,template,provider,status,provider_message_id,payload_json,response_json,error_text,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(v.id, v.account_login, v.recipient_email, v.sender_email, v.subject, v.template, v.provider, v.status, v.provider_message_id, v.payload_json, v.response_json, v.error_text, v.created_at, v.updated_at)
      .run();
  }
  async function upsertExactMatchAction(action) {
    const v = serializeExactMatchAction(action);
    await db.prepare(`INSERT OR REPLACE INTO exact_match_actions (id,phrase,normalized_phrase,action,enabled,source,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`)
      .bind(v.id, v.phrase, v.normalized_phrase, v.action, v.enabled, v.source, v.notes, v.created_at, v.updated_at)
      .run();
  }
  async function upsertAppSetting(setting) {
    const v = serializeAppSetting(setting);
    await db.prepare(`INSERT OR REPLACE INTO app_settings (key,value,source,created_at,updated_at) VALUES (?,?,?,?,?)`)
      .bind(v.key, v.value, v.source, v.created_at, v.updated_at)
      .run();
  }

  async function loadPersistedState() {
    const [agentsRes, jobsRes, eventsRes, accountsRes, feedbackReportsRes, chatTranscriptsRes, recurringOrdersRes, emailDeliveriesRes, exactMatchActionsRes, appSettingsRes] = await Promise.all([
      db.prepare('SELECT * FROM agents ORDER BY created_at DESC').all(),
      db.prepare('SELECT * FROM jobs ORDER BY created_at DESC').all(),
      db.prepare(`SELECT * FROM events ORDER BY created_at DESC LIMIT ${EVENT_LOG_RETENTION_LIMIT}`).all(),
      db.prepare('SELECT * FROM accounts ORDER BY updated_at DESC').all(),
      db.prepare(`SELECT * FROM feedback_reports ORDER BY created_at DESC LIMIT ${FEEDBACK_REPORT_RETENTION_LIMIT}`).all(),
      db.prepare(`SELECT * FROM chat_transcripts ORDER BY created_at DESC LIMIT ${CHAT_TRANSCRIPT_RETENTION_LIMIT}`).all(),
      db.prepare('SELECT * FROM recurring_orders ORDER BY updated_at DESC LIMIT 500').all(),
      db.prepare('SELECT * FROM email_deliveries ORDER BY created_at DESC LIMIT 1000').all(),
      db.prepare('SELECT * FROM exact_match_actions ORDER BY phrase ASC').all(),
      db.prepare('SELECT * FROM app_settings ORDER BY key ASC').all()
    ]);
    return {
      agents: (agentsRes.results || []).map(deserializeAgent).filter((agent) => !isRuntimeHiddenAgent(agent)),
      jobs: (jobsRes.results || []).map(deserializeJob),
      events: (eventsRes.results || []).map(deserializeEvent),
      accounts: (accountsRes.results || []).map(deserializeAccount),
      feedbackReports: (feedbackReportsRes.results || []).map(deserializeFeedbackReport),
      chatTranscripts: (chatTranscriptsRes.results || []).map(deserializeChatTranscript),
      recurringOrders: (recurringOrdersRes.results || []).map(deserializeRecurringOrder),
      emailDeliveries: (emailDeliveriesRes.results || []).map(deserializeEmailDelivery),
      exactMatchActions: mergeExactMatchActions([], (exactMatchActionsRes.results || []).map(deserializeExactMatchAction)),
      appSettings: mergeAppSettings([], (appSettingsRes.results || []).map(deserializeAppSetting))
    };
  }

  return {
    kind: 'd1',
    supportsPersistence: true,
    schemaSql: STORAGE_SCHEMA_SQL,
    async getState() {
      await init();
      if (hasFreshStateCache()) return cloneCachedState();
      if (!stateCache.promise) {
        const loadVersion = stateCache.version;
        stateCache.promise = (async () => {
          const state = await loadPersistedState();
          cacheState(state, loadVersion);
          return state;
        })();
      }
      try {
        return structuredClone(await stateCache.promise);
      } finally {
        stateCache.promise = null;
      }
    },
    async getFreshState() {
      await init();
      invalidateStateCache();
      const state = await loadPersistedState();
      cacheState(state);
      return structuredClone(state);
    },
    async getJobById(jobId) {
      await init();
      const job = await loadJobById(jobId);
      return job ? structuredClone(job) : null;
    },
    async listJobs(options = {}) {
      await init();
      const jobs = await listJobsSlice(options);
      return structuredClone(jobs);
    },
    async getAccountByLogin(login) {
      await init();
      const account = await loadAccountByLogin(login);
      return account ? structuredClone(account) : null;
    },
    async authenticateOrderApiKey(rawKey) {
      await init();
      const keyHash = hashSecret(rawKey);
      const indexed = await loadApiKeyByHash(keyHash);
      if (indexed) return structuredClone(indexed);
      const accounts = await loadAccountsOnly();
      const matched = authenticateOrderApiKeyInState({ accounts }, rawKey);
      if (matched?.apiKey?.id) {
        await upsertApiKeyForAccount(matched.account, {
          ...matched.apiKey,
          keyHash
        });
      }
      return matched ? structuredClone(matched) : null;
    },
    async replaceState(nextState) {
      return enqueueWrite(() => persistState(nextState, { replace: true }));
    },
    async mutate(mutator) {
      return enqueueWrite(async () => {
        await init();
        const draft = await this.getState();
        const result = await mutator(draft);
        await persistState(draft);
        return result;
      });
    },
    async mutateAccount(login, mutator) {
      return enqueueWrite(async () => {
        await init();
        const account = await loadAccountByLogin(login);
        const draft = { accounts: account ? [structuredClone(account)] : [] };
        const result = await mutator(draft);
        const safeLogin = String(login || '').trim().toLowerCase();
        const nextAccount = (draft.accounts || []).find((item) => String(item?.login || '').trim().toLowerCase() === safeLogin) || (draft.accounts || [])[0] || null;
        if (nextAccount) {
          invalidateStateCache();
          await upsertAccount(nextAccount);
          await syncAccountApiKeys(nextAccount);
        }
        return result;
      });
    },
    async appendEvent(event) {
      return enqueueWrite(async () => {
        await init();
        invalidateStateCache();
        await insertEvent(event);
        await db.prepare(`DELETE FROM events WHERE id NOT IN (SELECT id FROM events ORDER BY created_at DESC LIMIT ${EVENT_LOG_RETENTION_LIMIT})`).run();
        return event;
      });
    },
    async appendChatTranscript(transcript) {
      return enqueueWrite(async () => {
        await init();
        invalidateStateCache();
        await upsertChatTranscript(transcript);
        await db.prepare(`DELETE FROM chat_transcripts WHERE id NOT IN (SELECT id FROM chat_transcripts ORDER BY created_at DESC LIMIT ${CHAT_TRANSCRIPT_RETENTION_LIMIT})`).run();
        return transcript;
      });
    },
    async appendEmailDelivery(delivery) {
      return enqueueWrite(async () => {
        await init();
        invalidateStateCache();
        await upsertEmailDelivery(delivery);
        await db.prepare(`DELETE FROM email_deliveries WHERE id NOT IN (SELECT id FROM email_deliveries ORDER BY created_at DESC LIMIT 1000)`).run();
        return delivery;
      });
    }
  };
}

export function touchEvent(state, type, message, meta = {}) {
  state.events.unshift({ ...makeEvent(type, message, meta), createdAt: nowIso() });
  if (state.events.length > EVENT_LOG_RETENTION_LIMIT) state.events.length = EVENT_LOG_RETENTION_LIMIT;
}

function safeJson(value, fallback) { try { return value ? JSON.parse(value) : fallback; } catch { return fallback; } }
