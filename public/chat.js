import {
  chatEngineBuildIntakeCombinedPrompt,
  chatEngineBuildIntakeState,
  chatEngineBuildJobPayload,
  chatEngineBuildOrderDraft,
  chatEngineBuildPrepareOrderPayload,
  chatEngineDraftBrief,
  chatEngineIsNeedsInputResponse
} from './chat-engine.js?v=20260504a';
import {
  deliveryExecutionPromptPresentation,
  extractSocialPostTextFromDeliveryContent
} from './delivery-action-contract.js?v=20260501a';
import {
  caitAppContextChatPrompt,
  caitAppContextThreadHtml,
  consumeCaitAppContextForChat
} from './cait-app-bridge.js?v=20260505b';
import {
  isLeaderCatalogQuestionIntentText,
  isNonOrderConversationIntentText
} from './work-intent-resolver.js?v=20260505c';

const CHATUX_RETURN_PATH = '/chat';
const CHATUX_BACKFILL_INTERVAL_MS = 10000;
const CHATUX_CATALOG_PAGE_SIZE = 10;
const CHATUX_CATALOG_CACHE_TTL_MS = 60000;
const CHATUX_PROGRESS_MAX_POLLS = 300;
const CHATUX_WELCOME_TEXT = '何がしたいですか？';
const X_CLIENT_OPS_URL = 'https://x.niche-s.com/';

function leaderCatalogChatAnswer(prompt = '') {
  const ja = looksJapanese(prompt);
  return ja
    ? [
        '利用できる主なリーダーは以下です。これは案内回答なので、まだ注文も課金も発生していません。',
        '',
        '- CMO Leader: 集客、SEO、SNS、ローンチ、計測までを品質重視で組み立てる',
        '- CTO Leader: 技術方針、実装計画、リポジトリ修正、デプロイやロールバックを整理する',
        '- CPO Leader: プロダクト戦略、UX、優先順位、検証計画を整理する',
        '- CFO Leader: 価格、収支、ユニットエコノミクス、資金繰りを整理する',
        '- Legal Leader: 規約、プライバシー、コンプライアンス、リスクを確認する',
        '- Research Team Leader: 複数ソースの調査、比較、意思決定メモをまとめる',
        '- Build Team Leader: 実装タスクを分解し、専門エージェントやアプリへの引き継ぎをまとめる',
        '- Secretary Leader: 日程、返信、会議準備、秘書業務の流れを整理する',
        '',
        '迷う場合は、やりたい成果をそのまま書けば CAIt がリーダーか専門エージェントかを判断します。実行する場合だけ Send order を押してください。'
      ].join('\n')
    : [
        'Available leaders are below. This is a chat answer, so no order or billing happened.',
        '',
        '- CMO Leader: acquisition, SEO, social, launch, and measurement work',
        '- CTO Leader: technical direction, implementation planning, repo changes, deploy and rollback planning',
        '- CPO Leader: product strategy, UX, prioritization, and validation planning',
        '- CFO Leader: pricing, unit economics, cash flow, and finance decisions',
        '- Legal Leader: terms, privacy, compliance, and risk review',
        '- Research Team Leader: multi-source research, comparisons, and decision memos',
        '- Build Team Leader: implementation breakdowns and specialist/app handoffs',
        '- Secretary Leader: scheduling, replies, meeting prep, and assistant workflows',
        '',
        'If you are unsure, describe the outcome you want and CAIt will choose a leader or specialist. Paid work only starts when you press Send order.'
      ].join('\n');
}

const APP_AGENT_MANIFESTS = [
  {
    id: 'analytics-console',
    name: 'Analytics Console',
    kind: 'application_agent',
    description: 'Old-GA-style acquisition, search query, landing page, conversion, country, channel, and post-run measurement console for CAIt leaders.',
    baseUrl: '/analytics-console.html',
    entryUrl: '/analytics-console.html',
    capabilities: ['analytics_context', 'search_console_packet', 'ga4_packet', 'post_run_measurement'],
    requiresApprovalFor: [],
    inputContract: {
      schemaVersion: 'cait-app-context/v1',
      accepts: ['metrics', 'search_queries', 'landing_pages', 'conversion_paths', 'channel_breakdown'],
      returns: ['facts', 'metrics', 'artifacts', 'recommended_next_actions']
    },
    tags: ['analytics', 'seo', 'growth'],
    reusePrompt: 'Open Analytics Console, review acquisition evidence, then send the context to CAIt for the CMO, SEO, or Growth leader.'
  },
  {
    id: 'publisher-approval-studio',
    name: 'Publisher & Approval Studio',
    kind: 'application_agent',
    description: 'Content, page, metadata, directory submission, PR draft, and approval queue studio for external action handoffs.',
    baseUrl: '/publisher-approval.html',
    entryUrl: '/publisher-approval.html',
    capabilities: ['content_management', 'approval_queue', 'directory_submission_packet', 'publisher_change_set'],
    requiresApprovalFor: ['publish_change', 'directory_submit', 'github_pr', 'external_send'],
    inputContract: {
      schemaVersion: 'cait-app-context/v1',
      accepts: ['article_draft', 'landing_page_change', 'directory_packet', 'approval_request'],
      returns: ['approval_requests', 'artifacts', 'delivery_files', 'recommended_next_actions']
    },
    tags: ['publisher', 'approval', 'seo'],
    reusePrompt: 'Open Publisher & Approval Studio to edit, approve, or block the next external content/action packet before execution.'
  },
  {
    id: 'lead-ops-console',
    name: 'Lead Ops Console',
    kind: 'application_agent',
    description: 'Lead rows, public source evidence, statuses, owners, next actions, and email draft management before approval.',
    baseUrl: '/lead-ops.html',
    entryUrl: '/lead-ops.html',
    capabilities: ['lead_management', 'email_draft', 'crm_packet', 'outreach_review'],
    requiresApprovalFor: ['email_send', 'crm_write', 'external_send'],
    inputContract: {
      schemaVersion: 'cait-app-context/v1',
      accepts: ['lead_rows', 'evidence_urls', 'email_drafts', 'next_actions'],
      returns: ['artifacts', 'approval_requests', 'recommended_next_actions']
    },
    tags: ['crm', 'lead', 'email'],
    reusePrompt: 'Open Lead Ops Console to review lead rows and email drafts, then send a lead packet back to CAIt.'
  },
  {
    id: 'delivery-manager',
    name: 'Delivery Manager',
    kind: 'application_agent',
    description: 'CAIt delivery package, file download, copy, reuse, and follow-up context manager.',
    baseUrl: '/delivery-manager.html',
    entryUrl: '/delivery-manager.html',
    capabilities: ['delivery_package', 'file_download', 'delivery_reuse', 'follow_up_context'],
    requiresApprovalFor: [],
    inputContract: {
      schemaVersion: 'cait-app-context/v1',
      accepts: ['delivery_files', 'job_output', 'follow_up_context'],
      returns: ['delivery_files', 'artifacts', 'recommended_next_actions']
    },
    tags: ['delivery', 'files', 'reuse'],
    reusePrompt: 'Open Delivery Manager to reuse a prior delivery, download files, or send a follow-up context back to CAIt.'
  },
  {
    id: 'x-client-ops',
    name: 'X Client Ops',
    kind: 'application_agent',
    description: 'Action app for X post drafts, strategy context, and pre-approval posting queues.',
    baseUrl: X_CLIENT_OPS_URL,
    entryUrl: X_CLIENT_OPS_URL,
    capabilities: ['x_post_draft', 'x_post_queue', 'social_action'],
    requiresApprovalFor: ['post_now', 'send_external'],
    inputContract: {
      schemaVersion: 'cait-app-agent-transfer/v1',
      accepts: ['post_text', 'strategy', 'agent_context', 'delivery_summary', 'settings'],
      settingsKeys: ['brandName', 'serviceLine', 'targetClient', 'defaultCta', 'destinationLink', 'serviceUrl', 'workspaceNotes', 'outputLanguage'],
      requiredApprovalFor: ['post_now']
    },
    handoff: {
      createUrl: `${X_CLIENT_OPS_URL.replace(/\/+$/, '')}/api/cait/handoff`,
      method: 'POST',
      openUrlParam: 'cait_handoff'
    },
    reusePrompt: 'Create an X post, reflect the strategy, and prepare the final handoff to X Client Ops.'
  }
];

function makeVisitorId() {
  try {
    const bytes = new Uint8Array(8);
    window.crypto.getRandomValues(bytes);
    return `chatux-${Array.from(bytes).map((item) => item.toString(16).padStart(2, '0')).join('')}`;
  } catch {
    return `chatux-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  }
}

const state = {
  auth: null,
  draft: null,
  pendingIntake: null,
  activeLeader: null,
  draftRevision: 0,
  orderId: '',
  polling: null,
  deliveryBackfill: null,
  trackedOrderIds: new Set(),
  deliveredOrderIds: new Set(),
  appAgentHistory: [],
  aiAgentHistory: [],
  recentJobs: [],
  recentJobsFetchedAt: 0,
  recentJobsRequest: null,
  registeredApps: [],
  registeredAppsFetchedAt: 0,
  registeredAppsRequest: null,
  registeredAppsTotal: 0,
  registeredAppsHasMore: false,
  appContexts: [],
  appContextsFetchedAt: 0,
  appContextsRequest: null,
  workerAgents: [],
  workerAgentsFetchedAt: 0,
  workerAgentsRequest: null,
  workerAgentsTotal: 0,
  workerAgentsHasMore: false,
  pendingRecoveryPayloads: [],
  busy: false,
  visitorId: makeVisitorId()
};

const deliveryFileStore = new Map();
const appTransferStore = new Map();

const $ = (id) => document.getElementById(id);
const els = {
  authStatus: $('authStatus'),
  chatThread: $('chatThread'),
  composer: $('composer'),
  promptInput: $('promptInput'),
  sendMessageBtn: $('sendMessageBtn'),
  resetBtn: $('resetBtn'),
  openChatListBtn: $('openChatListBtn'),
  openWorkerListBtn: $('openWorkerListBtn'),
  openAppListBtn: $('openAppListBtn'),
  openInfoBtn: $('openInfoBtn'),
  adminNavLink: $('adminNavLink'),
  activeLeaderStatus: $('activeLeaderStatus'),
  utilityModal: $('utilityModal'),
  utilityModalTitle: $('utilityModalTitle'),
  utilityModalBody: $('utilityModalBody'),
  utilityModalCloseBtn: $('utilityModalCloseBtn')
};

const DEFAULT_PROMPT_PLACEHOLDER = '例: サイトの集客を増やしたい';
const PENDING_ORDER_PLACEHOLDER = 'Add an adjustment, or type SEND ORDER to dispatch...';
const INTAKE_PLACEHOLDER = 'Answer the questions above before CAIt prepares the order...';

function escapeHtml(value = '') {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function compact(value = '', max = 280) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length <= max ? text : `${text.slice(0, max - 1).trim()}...`;
}

function listValues(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function isoNow() {
  return new Date().toISOString();
}

function normalizeUsageId(value = '') {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_.:-]+/g, '-').replace(/^-+|-+$/g, '');
}

function compactUsageText(value = '', max = 420) {
  return compact(String(value || '').replace(/\r\n/g, '\n'), max);
}

function compactTransferText(value = '', max = 1200) {
  const text = String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trim()}…`;
}

function compactTransferObject(value = null, options = {}) {
  const maxText = Math.max(120, Number(options.maxText || 900));
  const maxArray = Math.max(1, Number(options.maxArray || 12));
  const depth = Math.max(0, Number(options.depth || 0));
  if (value == null) return value;
  if (typeof value === 'string') return compactTransferText(value, maxText);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value.slice(0, maxArray).map((item) => compactTransferObject(item, { maxText, maxArray, depth: depth - 1 }));
  }
  if (typeof value === 'object') {
    if (depth <= 0) return {};
    const result = {};
    for (const [key, item] of Object.entries(value).slice(0, 28)) {
      if (/token|secret|password|cookie|authorization|csrf/i.test(key)) continue;
      result[key] = compactTransferObject(item, { maxText, maxArray, depth: depth - 1 });
    }
    return result;
  }
  return String(value || '');
}

function usageDisplayDate(value = '') {
  const time = Date.parse(value || '');
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

function mergeUsageEntry(list = [], entry = {}, options = {}) {
  const id = normalizeUsageId(entry.id || entry.key || entry.name);
  if (!id) return Array.isArray(list) ? list : [];
  const now = isoNow();
  const limit = Math.max(1, Number(options.limit || 40));
  const existing = (Array.isArray(list) ? list : []).find((item) => normalizeUsageId(item.id || item.key || item.name) === id) || {};
  const merged = {
    ...existing,
    ...entry,
    id,
    firstUsedAt: existing.firstUsedAt || entry.firstUsedAt || now,
    lastUsedAt: entry.lastUsedAt || now,
    useCount: Number(existing.useCount || 0) + (options.increment === false ? 0 : 1)
  };
  return [
    merged,
    ...(Array.isArray(list) ? list : []).filter((item) => normalizeUsageId(item.id || item.key || item.name) !== id)
  ].slice(0, limit);
}

function normalizeAppAgentManifest(app = {}) {
  const id = normalizeUsageId(app.id || app.name);
  if (!id) return null;
  const baseUrl = String(app.baseUrl || app.base_url || app.url || '').trim();
  const entryUrl = String(app.entryUrl || app.entry_url || app.launchUrl || app.launch_url || baseUrl).trim();
  return {
    id,
    name: String(app.name || 'Application').trim(),
    kind: String(app.kind || 'application').trim(),
    description: String(app.description || '').trim(),
    baseUrl,
    entryUrl,
    capabilities: listValues(app.capabilities || app.actions || []),
    requiredConnectors: listValues(app.requiredConnectors || app.required_connectors || app.connectors || []),
    requiresApprovalFor: listValues(app.requiresApprovalFor || app.requires_approval_for || []),
    inputContract: app.inputContract || app.input_contract || null,
    handoff: app.handoff || null,
    tags: listValues(app.tags || []),
    owner: String(app.owner || '').trim(),
    status: String(app.status || '').trim(),
    verificationStatus: String(app.verificationStatus || app.verification_status || '').trim(),
    reusePrompt: String(app.reusePrompt || app.reuse_prompt || `Use ${app.name || 'this app'} as the final action app when it fits the order.`).trim()
  };
}

function appManifestSources() {
  const byId = new Map();
  for (const item of [...APP_AGENT_MANIFESTS, ...(Array.isArray(state.registeredApps) ? state.registeredApps : [])]) {
    const normalized = normalizeAppAgentManifest(item);
    if (!normalized) continue;
    byId.set(normalized.id, { ...(byId.get(normalized.id) || {}), ...normalized });
  }
  return [...byId.values()];
}

function appManifestById(id = '') {
  const safeId = normalizeUsageId(id);
  return appManifestSources().find((manifest) => normalizeUsageId(manifest.id) === safeId) || null;
}

function rememberAppAgentUsage(id = '', details = {}, options = {}) {
  const manifest = appManifestById(id);
  if (!manifest) return null;
  const entry = {
    id: manifest.id,
    name: manifest.name,
    kind: manifest.kind,
    description: manifest.description,
    baseUrl: manifest.baseUrl,
    entryUrl: manifest.entryUrl || manifest.baseUrl,
    capabilities: manifest.capabilities || [],
    requiresApprovalFor: manifest.requiresApprovalFor || [],
    inputContract: manifest.inputContract || null,
    handoff: manifest.handoff || null,
    reusePrompt: manifest.reusePrompt || '',
    ...details,
    lastContext: {
      ...(details.lastContext && typeof details.lastContext === 'object' ? details.lastContext : {}),
      title: compactUsageText(details.lastContext?.title || details.title || '', 140),
      product: compactUsageText(details.lastContext?.product || details.product || '', 140),
      audience: compactUsageText(details.lastContext?.audience || details.audience || '', 180),
      goal: compactUsageText(details.lastContext?.goal || details.goal || '', 140),
      channel: compactUsageText(details.lastContext?.channel || details.channel || '', 140),
      source: compactUsageText(details.lastContext?.source || details.source || '', 140)
    }
  };
  state.appAgentHistory = mergeUsageEntry(state.appAgentHistory, entry, { limit: 24, increment: options.increment !== false });
  return state.appAgentHistory[0] || null;
}

function taskLabel(taskType = '') {
  const safeTask = String(taskType || '').trim().toLowerCase();
  const labels = {
    cmo_leader: 'CMO Leader',
    research_team_leader: 'Research Team Leader',
    build_team_leader: 'Build Team Leader',
    cto_leader: 'CTO Leader',
    cpo_leader: 'CPO Leader',
    cfo_leader: 'CFO Leader',
    legal_leader: 'Legal Leader',
    research: 'Research Agent',
    teardown: 'Competitor Teardown Agent',
    data_analysis: 'Data Analysis Agent',
    growth: 'Growth Operator Agent',
    media_planner: 'Media Planner Agent',
    writing: 'Writing Agent',
    list_creator: 'List Creator Agent',
    landing: 'Landing Agent',
    seo_gap: 'SEO Agent',
    acquisition_automation: 'Acquisition Automation Agent',
    directory_submission: 'Directory Submission Agent',
    x_post: 'X Ops Connector Agent'
  };
  if (labels[safeTask]) return labels[safeTask];
  return safeTask
    ? safeTask.split(/[_\s-]+/).filter(Boolean).map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(' ')
    : 'AI Agent';
}

function conversationOwnerFromPrepared(value = {}, fallback = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const intake = source.intake && typeof source.intake === 'object' ? source.intake : {};
  const owner = source.conversationOwner
    || source.conversation_owner
    || intake.conversationOwner
    || intake.conversation_owner
    || fallback.conversationOwner
    || {};
  const ownerType = String(owner.type || source.ownerType || source.owner_type || fallback.ownerType || '').trim().toLowerCase();
  const fallbackLeaderTaskType = ownerType ? '' : (fallback.activeLeaderTaskType || '');
  const fallbackLeaderName = ownerType ? '' : (fallback.activeLeaderName || '');
  const taskType = String(
    owner.taskType
    || owner.task_type
    || source.activeLeaderTaskType
    || source.active_leader_task_type
    || intake.activeLeaderTaskType
    || intake.active_leader_task_type
    || fallbackLeaderTaskType
    || ''
  ).trim().toLowerCase();
  const label = String(
    owner.label
    || source.activeLeaderName
    || source.active_leader_name
    || intake.activeLeaderName
    || intake.active_leader_name
    || fallbackLeaderName
    || (taskType ? taskLabel(taskType) : 'CAIt')
  ).trim();
  const reason = String(owner.reason || source.reason || fallback.reason || '').trim();
  if ((ownerType === 'leader' || taskType) && taskType) {
    return {
      type: 'leader',
      taskType,
      label: label || taskLabel(taskType),
      reason
    };
  }
  return {
    type: 'cait',
    taskType: '',
    label: 'CAIt',
    reason
  };
}

function sameConversationOwner(left = {}, right = {}) {
  return String(left?.type || '') === String(right?.type || '')
    && String(left?.taskType || '') === String(right?.taskType || '')
    && String(left?.label || '') === String(right?.label || '');
}

function renderActiveLeaderStatus() {
  if (!els.activeLeaderStatus) return;
  const leader = state.activeLeader;
  if (leader?.taskType) {
    els.activeLeaderStatus.textContent = `Lead: ${leader.label || taskLabel(leader.taskType)}`;
    els.activeLeaderStatus.dataset.owner = 'leader';
    els.activeLeaderStatus.title = leader.reason || 'This leader is gathering details and coordinating the order.';
    return;
  }
  els.activeLeaderStatus.textContent = 'CAIt routing';
  els.activeLeaderStatus.dataset.owner = 'cait';
  els.activeLeaderStatus.title = 'CAIt will route to a specialist directly or hand broad work to a leader.';
}

function setConversationOwnerFromPrepared(prepared = {}, options = {}) {
  const previous = state.activeLeader
    ? { type: 'leader', ...state.activeLeader }
    : { type: 'cait', label: 'CAIt', taskType: '' };
  const owner = conversationOwnerFromPrepared(prepared, {
    activeLeaderTaskType: options.activeLeaderTaskType || state.activeLeader?.taskType || '',
    activeLeaderName: options.activeLeaderName || state.activeLeader?.label || '',
    conversationOwner: options.conversationOwner || null
  });
  state.activeLeader = owner.type === 'leader'
    ? {
        taskType: owner.taskType,
        label: owner.label || taskLabel(owner.taskType),
        reason: owner.reason || ''
      }
    : null;
  renderActiveLeaderStatus();
  const changed = !sameConversationOwner(previous, state.activeLeader ? { type: 'leader', ...state.activeLeader } : { type: 'cait', label: 'CAIt', taskType: '' });
  if (options.announce === true && changed) {
    if (state.activeLeader) {
      const label = state.activeLeader.label || taskLabel(state.activeLeader.taskType);
      appendTextMessage('assistant', chatText(
        `${label} is now leading this order. CAIt will stay as the router, and ${label} will gather missing details, request approvals, and coordinate specialists/apps.`,
        `${label} にチャット主体を切り替えます。CAIt はルーターとして残り、${label} が不足情報の確認、承認ポイント、専門エージェント/アプリ連携を進めます。`,
        options.sample || prepared.prompt || ''
      ), { tone: 'ok', label: 'CAIt' });
    } else {
      appendTextMessage('assistant', chatText(
        'CAIt will keep this chat and route directly to the best specialist unless the scope becomes leader-level.',
        'この内容は CAIt が会話主体のまま、必要な専門エージェントへ直接ルーティングします。スコープが広がった場合はリーダーへ切り替えます。',
        options.sample || prepared.prompt || ''
      ), { tone: 'ok', label: 'CAIt' });
    }
  }
  return state.activeLeader;
}

function activeActorLabel(fallback = 'CAIt') {
  return state.activeLeader?.label || fallback;
}

function agentUsageKey(entry = {}) {
  return normalizeUsageId(entry.agentId || `${entry.taskType || 'agent'}-${entry.name || ''}`);
}

function rememberAiAgentUsage(entry = {}, options = {}) {
  const taskType = String(entry.taskType || entry.task_type || '').trim().toLowerCase();
  const name = String(entry.name || entry.agentName || taskLabel(taskType)).trim() || 'AI Agent';
  const id = agentUsageKey({ ...entry, taskType, name });
  if (!id) return null;
  const safeEntry = {
    id,
    name,
    agentId: String(entry.agentId || '').trim(),
    taskType,
    route: String(entry.route || '').trim(),
    status: String(entry.status || '').trim(),
    source: String(entry.source || '').trim() || 'chatux',
    originalPrompt: compactUsageText(entry.originalPrompt || entry.prompt || '', 900),
    reusePrompt: compactUsageText(entry.reusePrompt || entry.originalPrompt || entry.prompt || '', 900),
    lastOrderId: String(entry.lastOrderId || entry.orderId || '').trim(),
    summary: compactUsageText(entry.summary || '', 260)
  };
  state.aiAgentHistory = mergeUsageEntry(state.aiAgentHistory, safeEntry, { limit: 48, increment: options.increment !== false });
  return state.aiAgentHistory[0] || null;
}

function rememberTrackedOrder(orderId = '') {
  const safeId = String(orderId || '').trim();
  if (!safeId) return;
  state.trackedOrderIds.add(safeId);
}

function markOrderDelivered(orderId = '') {
  const safeId = String(orderId || '').trim();
  if (!safeId) return;
  state.deliveredOrderIds.add(safeId);
}

function safeFileName(value = '', fallback = 'delivery.md') {
  const raw = String(value || fallback || 'delivery.md').trim() || 'delivery.md';
  const cleaned = raw
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 140)
    .trim();
  return cleaned || fallback || 'delivery.md';
}

function fileMimeType(name = '', content = '') {
  if (/\.html?$/i.test(name) || /<!doctype html|<html[\s>]/i.test(content)) return 'text/html;charset=utf-8';
  if (/\.(md|markdown|mdx)$/i.test(name)) return 'text/markdown;charset=utf-8';
  if (/\.json$/i.test(name)) return 'application/json;charset=utf-8';
  return 'text/plain;charset=utf-8';
}

function registerDeliveryFile(file = {}, fallbackName = 'delivery.md') {
  const name = safeFileName(file.name || fallbackName, fallbackName);
  const content = String(file.content || '');
  const id = `file-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}`;
  deliveryFileStore.set(id, {
    name,
    content,
    type: String(file.type || fileMimeType(name, content)).trim() || fileMimeType(name, content)
  });
  while (deliveryFileStore.size > 80) {
    const first = deliveryFileStore.keys().next().value;
    if (!first) break;
    deliveryFileStore.delete(first);
  }
  return { id, name, content };
}

async function copyTextToClipboard(text = '') {
  const value = String(text || '');
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

function downloadTextFile(file = {}) {
  const content = String(file.content || '');
  const name = safeFileName(file.name || 'delivery.md', 'delivery.md');
  const blob = new Blob([content], { type: String(file.type || fileMimeType(name, content)) });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function combinedMarkdownFile(files = []) {
  const sections = (Array.isArray(files) ? files : [])
    .map((file, index) => {
      const name = safeFileName(file?.name || `delivery-${index + 1}.md`, `delivery-${index + 1}.md`);
      const content = String(file?.content || '').trim();
      if (!content) return '';
      const fence = /\.html?$/i.test(name) ? 'html' : (/\.json$/i.test(name) ? 'json' : 'markdown');
      return [`## ${name}`, '', `\`\`\`${fence}`, content, '```'].join('\n');
    })
    .filter(Boolean);
  return {
    name: `delivery-bundle-${new Date().toISOString().slice(0, 10)}.md`,
    type: 'text/markdown;charset=utf-8',
    content: ['# Delivery bundle', '', ...sections].join('\n')
  };
}

function looksJapanese(value = '') {
  return /[\u3040-\u30ff\u3400-\u9fff]/.test(String(value || ''));
}

function chatLanguage(sample = '') {
  if (looksJapanese(sample)) return 'ja';
  const pageLanguage = String(document.documentElement?.lang || '').toLowerCase();
  return pageLanguage.startsWith('ja') ? 'ja' : 'en';
}

function chatText(en, ja, sample = '') {
  return chatLanguage(sample) === 'ja' ? ja : en;
}

async function api(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers || {});
  if (!headers.has('content-type')) headers.set('content-type', 'application/json');
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && state.auth?.csrfToken) {
    headers.set('x-aiagent2-csrf', state.auth.csrfToken);
  }
  if (state.visitorId) headers.set('x-aiagent2-visitor-id', state.visitorId);
  const response = await fetch(path, {
    ...options,
    method,
    headers,
    credentials: 'same-origin'
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(String(data?.error || `Request failed (${response.status})`));
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

function setBusy(next) {
  state.busy = Boolean(next);
  els.sendMessageBtn.disabled = state.busy;
  document.querySelectorAll('[data-chat-action="send-order"]').forEach((button) => {
    button.disabled = state.busy || !state.draft;
  });
  document.querySelectorAll('[data-x-post-submit]').forEach((button) => {
    button.disabled = state.busy;
  });
}

function scrollThread() {
  els.chatThread.scrollTop = els.chatThread.scrollHeight;
}

function appendMessage(role, body, options = {}) {
  const article = document.createElement('article');
  article.className = `message ${role}${options.tone ? ` ${options.tone}` : ''}`;
  article.innerHTML = [
    `<div class="message-meta">${escapeHtml(options.label || (role === 'user' ? 'You' : role === 'system' ? 'Status' : 'CAIt'))}</div>`,
    `<div class="message-body">${body}</div>`
  ].join('');
  els.chatThread.appendChild(article);
  scrollThread();
  return article;
}

function appendTextMessage(role, text, options = {}) {
  return appendMessage(role, escapeHtml(text), options);
}

function statusLabel(job = {}) {
  const status = String(job.status || '').trim() || 'created';
  const visibleStatus = statusDisplayLabel(status);
  if (job.jobKind === 'workflow' || job.workflow) {
    const counts = job.workflow?.statusCounts || {};
    const total = Number(counts.total || job.workflow?.plannedChildRunCount || 0) || 0;
    const completed = Number(counts.completed || 0) || 0;
    const blocked = Number(counts.blocked || 0) || 0;
    const failed = Number(counts.failed || 0) || 0;
    const suffix = total ? `, ${completed}/${total} runs complete${blocked ? `, ${blocked} waiting` : ''}${failed ? `, ${failed} failed` : ''}` : '';
    return `${visibleStatus}${suffix}`;
  }
  return visibleStatus;
}

function statusDisplayLabel(status = '') {
  const safe = String(status || '').trim().toLowerCase();
  if (safe === 'blocked') return 'waiting';
  if (safe === 'timed_out') return 'timed out';
  return String(status || '').trim() || 'created';
}

function isTerminalStatus(status = '') {
  return ['completed', 'failed', 'timed_out', 'blocked'].includes(String(status || '').toLowerCase());
}

function extractOrderId(created = {}) {
  return String(created.workflow_job_id || created.workflowJobId || created.job_id || created.jobId || '').trim();
}

function deliveryFiles(job = {}) {
  const output = job.output && typeof job.output === 'object' ? job.output : {};
  const delivery = output.delivery && typeof output.delivery === 'object' ? output.delivery : {};
  const report = output.report && typeof output.report === 'object' ? output.report : {};
  const deliveryReport = delivery.report && typeof delivery.report === 'object' ? delivery.report : {};
  const candidates = [
    ...(Array.isArray(output.files) ? output.files : []),
    ...(Array.isArray(report.files) ? report.files : []),
    ...(Array.isArray(delivery.files) ? delivery.files : []),
    ...(Array.isArray(deliveryReport.files) ? deliveryReport.files : [])
  ];
  const seen = new Set();
  return candidates
    .filter((file) => file && (file.content || file.name))
    .filter((file) => {
      const key = `${file.name || ''}:${String(file.content || '').slice(0, 120)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}

function deliveryText(job = {}) {
  const output = job.output && typeof job.output === 'object' ? job.output : {};
  const report = output.report && typeof output.report === 'object' ? output.report : {};
  const delivery = output.delivery && typeof output.delivery === 'object' ? output.delivery : {};
  const deliveryReport = delivery.report && typeof delivery.report === 'object' ? delivery.report : {};
  const bullets = [
    ...(Array.isArray(report.bullets) ? report.bullets : []),
    ...(Array.isArray(deliveryReport.bullets) ? deliveryReport.bullets : [])
  ].filter(Boolean).slice(0, 8);
  return [
    output.summary || report.summary || delivery.summary || deliveryReport.summary || job.failureReason || '',
    bullets.length ? bullets.map((item) => `- ${item}`).join('\n') : '',
    report.nextAction || report.next_action || deliveryReport.nextAction || deliveryReport.next_action || ''
  ].filter(Boolean).join('\n\n').trim();
}

function rememberAiAgentsFromDraft(draft = {}, created = {}, payload = {}) {
  const taskType = String(draft.taskType || draft.task_type || payload.task_type || '').trim().toLowerCase();
  if (!taskType) return;
  rememberAiAgentUsage({
    name: taskLabel(taskType),
    taskType,
    route: String(draft.resolvedOrderStrategy || draft.resolved_order_strategy || payload.order_strategy || '').trim(),
    status: String(created.status || created.mode || 'accepted').trim(),
    originalPrompt: draft.originalPrompt || payload.input?.original_prompt || draft.prompt || payload.prompt || '',
    reusePrompt: draft.originalPrompt || payload.input?.original_prompt || draft.prompt || payload.prompt || '',
    lastOrderId: extractOrderId(created),
    summary: created.routing_reason || 'Accepted from Chat UX.'
  });
}

function rememberAiAgentsFromJob(job = {}) {
  const orderId = String(job?.id || '').trim();
  const objective = job.workflow?.objective || job.originalPrompt || job.input?.original_prompt || job.prompt || '';
  const primaryTask = String((Array.isArray(job.workflow?.plannedTasks) ? job.workflow.plannedTasks[0] : '') || job.taskType || '').trim().toLowerCase();
  if (primaryTask) {
    rememberAiAgentUsage({
      name: taskLabel(primaryTask),
      taskType: primaryTask,
      route: job.jobKind === 'workflow' || job.workflow ? 'workflow' : 'single',
      status: job.status || '',
      originalPrompt: objective,
      reusePrompt: objective,
      lastOrderId: orderId,
      summary: statusLabel(job)
    }, { increment: false });
  }
  const childRuns = Array.isArray(job.workflow?.childRuns) ? job.workflow.childRuns : [];
  for (const child of childRuns) {
    const taskType = String(child.taskType || child.dispatchTaskType || '').trim().toLowerCase();
    if (!taskType) continue;
    rememberAiAgentUsage({
      name: child.agentName || taskLabel(taskType),
      agentId: child.agentId || '',
      taskType,
      route: 'workflow_child',
      status: child.status || '',
      originalPrompt: objective,
      reusePrompt: objective,
      lastOrderId: child.id || orderId,
      summary: child.sequencePhase ? `Workflow phase: ${child.sequencePhase}` : ''
    }, { increment: false });
  }
}

function appAgentSourceAgentsFromJob(job = {}) {
  const agents = [];
  const primaryTask = String((Array.isArray(job.workflow?.plannedTasks) ? job.workflow.plannedTasks[0] : '') || job.taskType || '').trim().toLowerCase();
  if (primaryTask) {
    agents.push({
      role: 'primary',
      name: taskLabel(primaryTask),
      taskType: primaryTask,
      status: String(job.status || '').trim(),
      orderId: String(job.id || '').trim()
    });
  }
  const childRuns = Array.isArray(job.workflow?.childRuns) ? job.workflow.childRuns : [];
  for (const child of childRuns) {
    const taskType = String(child.taskType || child.dispatchTaskType || '').trim().toLowerCase();
    if (!taskType) continue;
    agents.push({
      role: child.sequencePhase || 'workflow_child',
      name: String(child.agentName || taskLabel(taskType)).trim(),
      agentId: String(child.agentId || '').trim(),
      taskType,
      dispatchTaskType: String(child.dispatchTaskType || '').trim(),
      status: String(child.status || '').trim(),
      orderId: String(child.id || '').trim()
    });
  }
  return agents.slice(0, 18);
}

function appAgentDeliveryArtifactsFromJob(job = {}) {
  return deliveryFiles(job).map((file) => ({
    name: String(file?.name || 'delivery.md').trim(),
    contentType: String(file?.content_type || file?.contentType || file?.type || fileMimeType(file?.name || '', file?.content || '')).trim(),
    summary: compactTransferText(file?.summary || file?.description || '', 280),
    contentPreview: compactTransferText(file?.content || '', 900)
  })).slice(0, 8);
}

function appAgentActionKind(manifest = {}, options = {}) {
  const explicit = String(options.actionKind || options.action?.kind || '').trim();
  if (explicit) return explicit;
  const caps = listValues(manifest.capabilities || []).join(' ').toLowerCase();
  const accepts = listValues(manifest.inputContract?.accepts || []).join(' ').toLowerCase();
  const combined = `${caps} ${accepts}`;
  if (/x[_\s-]?post|twitter|tweet/.test(combined)) return 'x_post_handoff';
  if (/social|post|community/.test(combined)) return 'social_handoff';
  if (/email|gmail|newsletter/.test(combined)) return 'email_handoff';
  if (/github|pull[_\s-]?request|repo|code/.test(combined)) return 'code_handoff';
  if (/crm|lead|sales|acquisition/.test(combined)) return 'acquisition_handoff';
  return 'app_handoff';
}

function appAgentRequiresApproval(manifest = {}, options = {}) {
  if (options.requiresApproval != null) return Boolean(options.requiresApproval);
  const approval = listValues(manifest.requiresApprovalFor || []);
  const caps = listValues(manifest.capabilities || []).join(' ').toLowerCase();
  return Boolean(
    approval.length
    || /(post|send|publish|submit|schedule|external|crm|email|x_|twitter)/i.test(approval.join(' '))
    || /(post|send|publish|submit|schedule|external|crm|email|x[_\s-]?post|twitter)/i.test(caps)
  );
}

function appAgentBaseTransferPacket(appId = '', job = {}, options = {}) {
  const manifest = appManifestById(appId) || {};
  const strategy = options.strategy && typeof options.strategy === 'object' ? options.strategy : {};
  const draft = options.draft && typeof options.draft === 'object' ? options.draft : {};
  const suppliedAction = options.action && typeof options.action === 'object' ? options.action : {};
  const objective = String(job.workflow?.objective || job.originalPrompt || job.input?.original_prompt || job.prompt || '').trim();
  const primaryTask = String((Array.isArray(job.workflow?.plannedTasks) ? job.workflow.plannedTasks[0] : '') || job.taskType || '').trim().toLowerCase();
  const agents = appAgentSourceAgentsFromJob(job);
  const settings = {
    brandName: strategy.product || '',
    serviceLine: strategy.product || '',
    targetClient: strategy.audience || '',
    defaultCta: strategy.goal || '',
    destinationLink: strategy.url || '',
    serviceUrl: strategy.url || '',
    channel: strategy.channel || '',
    outputLanguage: looksJapanese(objective) ? 'ja' : 'en',
    workspaceNotes: compactTransferText([
      strategy.strategy,
      objective ? `Original objective:\n${objective}` : '',
      agents.length ? `Agent chain:\n${agents.map((agent) => `- ${agent.name} (${agent.taskType}, ${agent.status || 'unknown'})`).join('\n')}` : ''
    ].filter(Boolean).join('\n\n'), 2200)
  };
  return {
    schema_version: 'cait-app-agent-transfer/v1',
    transfer_id: `transfer-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}`,
    created_at: isoNow(),
    platform: {
      name: 'CAIt',
      source: 'chatux',
      return_path: CHATUX_RETURN_PATH
    },
    app: {
      id: manifest.id || appId,
      name: manifest.name || appId,
      kind: manifest.kind || 'application_agent',
      capabilities: manifest.capabilities || [],
      input_contract: manifest.inputContract || null
    },
    order: {
      id: String(job.id || '').trim(),
      status: String(job.status || '').trim(),
      taskType: primaryTask,
      objective: compactTransferText(objective, 1200),
      workflow: Boolean(job.workflow || job.jobKind === 'workflow'),
      statusLabel: statusLabel(job)
    },
    agents,
    delivery: {
      summary: compactTransferText(deliveryText(job), 1800),
      artifacts: appAgentDeliveryArtifactsFromJob(job)
    },
    settings,
    action: {
      kind: appAgentActionKind(manifest, { ...options, action: suppliedAction }),
      text: compactTransferText(suppliedAction.text || draft.text || '', 1200),
      source: compactTransferText(suppliedAction.source || draft.source || 'CAIt delivery', 160),
      requiresApproval: appAgentRequiresApproval(manifest, { ...options, action: suppliedAction }),
      ...compactTransferObject(suppliedAction, { depth: 3, maxText: 700, maxArray: 8 })
    }
  };
}

function registerAppTransferPayload(payload = {}) {
  const id = String(payload.transfer_id || payload.transferId || `transfer-${Date.now().toString(36)}`).trim();
  if (!id) return '';
  appTransferStore.set(id, payload);
  while (appTransferStore.size > 40) {
    const first = appTransferStore.keys().next().value;
    appTransferStore.delete(first);
  }
  return id;
}

function authorityRequestFromJob(job = {}) {
  const output = job.output && typeof job.output === 'object' ? job.output : {};
  const report = output.report && typeof output.report === 'object' ? output.report : {};
  const request = report.authority_request
    || report.authorityRequest
    || report.action_required
    || report.actionRequired
    || report.executor_request
    || report.executorRequest
    || null;
  return request && typeof request === 'object' ? request : null;
}

function authorityNeedsApproval(request = null) {
  if (!request || typeof request !== 'object') return false;
  const missingConnectors = listValues(request.missing_connectors || request.missingConnectors || request.connectors);
  const missingCapabilities = listValues(request.missing_connector_capabilities || request.missingConnectorCapabilities || request.capabilities);
  const googleSources = listValues(request.required_google_sources || request.requiredGoogleSources || request.google_source_types || request.googleSourceTypes);
  const reason = String(request.reason || request.message || request.summary || '').trim();
  return Boolean(
    missingConnectors.length
    || missingCapabilities.length
    || googleSources.length
    || request.required_channel_selection
    || request.requiredChannelSelection
    || /(approval|approve|connector|required|missing|connect|confirm|publish|send|post|承認|接続|未接続|確認|投稿|送信|必要)/i.test(reason)
  );
}

function fileLooksLikeSocialPostPack(file = {}) {
  const name = String(file?.name || '').toLowerCase();
  const type = String(file?.content_type || file?.contentType || file?.type || '').toLowerCase();
  const content = String(file?.content || '').toLowerCase();
  return Boolean(
    /social[_-\s]?post|x[_-\s]?post|tweet|twitter|post[-_\s]?pack|sns/.test(name)
    || /social[_-\s]?post|x[_-\s]?post|tweet|twitter/.test(type)
    || /x post draft|tweet text|post text|投稿本文|投稿ドラフト/.test(content)
  );
}

function xPostDraftFromJob(job = {}) {
  const files = deliveryFiles(job);
  const orderedFiles = [
    ...files.filter(fileLooksLikeSocialPostPack),
    ...files.filter((file) => !fileLooksLikeSocialPostPack(file))
  ];
  for (const file of orderedFiles) {
    const text = extractSocialPostTextFromDeliveryContent(file?.content || '', { maxLength: 280 });
    if (text) {
      return {
        text,
        source: String(file?.name || 'delivery file').trim() || 'delivery file'
      };
    }
  }
  const summaryText = deliveryText(job);
  const text = extractSocialPostTextFromDeliveryContent(summaryText, { maxLength: 280 });
  return text ? { text, source: 'delivery summary' } : null;
}

function compactStrategyText(value = '', max = 1500) {
  const text = String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trim()}…`;
}

function strategySnippetFromContent(content = '') {
  const text = String(content || '').replace(/\r\n/g, '\n').trim();
  if (!text) return '';
  const headings = [
    'Answer first',
    'Context extracted from the order',
    'Customer and positioning hypothesis',
    'First growth bottleneck',
    '7-day acquisition experiment',
    'Execution packet',
    'Priority media queue',
    'SEO page packet',
    'Distribution templates',
    'Handoff to leader'
  ];
  const snippets = [];
  for (const heading of headings) {
    const pattern = new RegExp(`(?:^|\\n)#{1,4}\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?(?=\\n#{1,4}\\s+|$)`, 'i');
    const match = text.match(pattern);
    if (match?.[0]) snippets.push(match[0].trim());
  }
  if (!snippets.length) {
    const lines = text.split('\n')
      .filter((line) => /(strategy|growth|channel|audience|conversion|goal|cta|seo|x\/social|distribution|bottleneck|execution|handoff|戦略|集客|対象|顧客|購入|登録|投稿|配信|導線)/i.test(line))
      .slice(0, 18);
    if (lines.length) snippets.push(lines.join('\n'));
  }
  return compactStrategyText(snippets.join('\n\n'), 900);
}

function strategyFieldFromText(text = '', labels = []) {
  const source = String(text || '');
  for (const label of labels) {
    const table = source.match(new RegExp(`\\|\\s*${label}\\s*\\|\\s*([^|\\n]+?)\\s*\\|`, 'i'));
    if (table?.[1]) return compact(table[1], 180);
    const field = source.match(new RegExp(`(?:^|\\n)\\s*(?:[-*]\\s*)?${label}\\s*[:：]\\s*([^\\n]+)`, 'i'));
    if (field?.[1]) return compact(field[1], 180);
  }
  return '';
}

function xStrategyContextFromJob(job = {}) {
  const files = deliveryFiles(job);
  const summary = deliveryText(job);
  const parts = [];
  if (summary) parts.push(`Delivery summary:\n${summary}`);
  for (const file of files) {
    const snippet = strategySnippetFromContent(file?.content || '');
    if (!snippet) continue;
    parts.push(`From ${String(file?.name || 'delivery file').trim() || 'delivery file'}:\n${snippet}`);
  }
  const allText = parts.join('\n\n');
  const urlMatch = allText.match(/https?:\/\/[^\s)\]|]+/i);
  return {
    strategy: compactStrategyText(allText, 1500),
    product: strategyFieldFromText(allText, ['Product', 'Service', '商材', 'サービス']),
    audience: strategyFieldFromText(allText, ['ICP', 'Primary audience', 'Audience', 'Target customer', '対象顧客', '対象']),
    goal: strategyFieldFromText(allText, ['Conversion', 'Goal', 'Objective', '目的', 'CV']),
    channel: strategyFieldFromText(allText, ['Candidate channels', 'Primary lane', 'Channel', 'チャネル']),
    url: urlMatch?.[0] || ''
  };
}

function xPostConnectHint() {
  if (!state.auth?.loggedIn) {
    return `<a class="primary-btn inline-btn file-action" href="${escapeHtml(loginHref('google'))}">Sign in</a>`;
  }
  if (state.auth?.xConfigured === false || state.auth?.xTokenEncryptionConfigured === false) {
    return '<span class="chat-hint">X OAuth is not configured for this environment.</span>';
  }
  if (state.auth?.xLinked || state.auth?.xAuthorized) {
    return '<span class="chat-hint">Connected X account will be checked before posting.</span>';
  }
  return `<a class="ghost-btn inline-btn file-action" href="${escapeHtml(xAuthHref())}">Connect X</a>`;
}

function xClientOpsHandoffUrl(jobId = '', draft = {}) {
  const url = new URL(X_CLIENT_OPS_URL);
  url.searchParams.set('cait_x_post', String(draft?.text || '').trim());
  url.searchParams.set('cait_source', String(draft?.source || 'CAIt delivery').trim());
  url.searchParams.set('cait_title', 'CAIt final X post draft');
  if (draft?.strategy) url.searchParams.set('cait_strategy', String(draft.strategy).trim());
  if (draft?.product) url.searchParams.set('cait_product', String(draft.product).trim());
  if (draft?.audience) url.searchParams.set('cait_audience', String(draft.audience).trim());
  if (draft?.goal) url.searchParams.set('cait_goal', String(draft.goal).trim());
  if (draft?.channel) url.searchParams.set('cait_channel', String(draft.channel).trim());
  if (draft?.url) url.searchParams.set('cait_url', String(draft.url).trim());
  if (jobId) url.searchParams.set('cait_job', String(jobId).trim());
  return url.toString();
}

function xClientOpsPayloadFromUrl(value = '') {
  const url = new URL(value || X_CLIENT_OPS_URL, window.location.origin);
  return {
    schema_version: 'cait-app-agent-transfer/v1',
    text: url.searchParams.get('cait_x_post') || '',
    source: url.searchParams.get('cait_source') || 'CAIt delivery',
    title: url.searchParams.get('cait_title') || 'CAIt final X post draft',
    jobId: url.searchParams.get('cait_job') || '',
    strategy: url.searchParams.get('cait_strategy') || '',
    product: url.searchParams.get('cait_product') || '',
    audience: url.searchParams.get('cait_audience') || '',
    goal: url.searchParams.get('cait_goal') || '',
    channel: url.searchParams.get('cait_channel') || '',
    url: url.searchParams.get('cait_url') || ''
  };
}

function appContextFromTransferPayload(appId = '', payload = {}) {
  const manifest = appManifestById(appId) || {};
  const order = payload.order && typeof payload.order === 'object' ? payload.order : {};
  const settings = payload.settings && typeof payload.settings === 'object' ? payload.settings : {};
  const delivery = payload.delivery && typeof payload.delivery === 'object' ? payload.delivery : {};
  const artifacts = [
    payload.action ? { type: 'action', title: payload.action.title || payload.title || 'Action packet', content: payload.action.text || payload.summary || '' } : null,
    delivery.summary ? { type: 'delivery_summary', title: payload.title || 'Delivery summary', content: delivery.summary } : null,
    ...(Array.isArray(payload.files) ? payload.files : []).map((file) => ({
      type: 'file',
      name: file?.name || '',
      content_type: file?.type || '',
      content: file?.content || ''
    }))
  ].filter(Boolean);
  return {
    source_app: normalizeUsageId(manifest.id || appId || 'app'),
    source_app_label: manifest.name || appId || 'App',
    title: payload.title || payload.action?.title || `CAIt handoff for ${manifest.name || 'app'}`,
    summary: payload.summary || delivery.summary || payload.action?.text || '',
    facts: [
      order.id ? `Order ID: ${order.id}` : '',
      order.status ? `Order status: ${order.status}` : '',
      payload.source ? `Source: ${payload.source}` : ''
    ].filter(Boolean),
    artifacts,
    recommended_next_actions: [
      manifest.requiresApprovalFor?.length ? `Review approval requirements: ${manifest.requiresApprovalFor.join(', ')}` : '',
      'Use this server-side CAIt context to continue the app action without URL-embedded payloads.'
    ].filter(Boolean),
    approval_requests: Array.isArray(payload.approval_requests) ? payload.approval_requests : [],
    handoff_targets: [manifest.id || appId].filter(Boolean),
    raw_context: compactTransferObject({
      transfer_id: payload.transfer_id || '',
      app_id: appId,
      order,
      settings,
      delivery,
      action: payload.action || null,
      context: payload.context || null
    }, { depth: 5, maxText: 900, maxArray: 12 })
  };
}

function appAgentContextOpenUrl(appId = '', appContextResult = {}, payload = {}) {
  const manifest = appManifestById(appId) || {};
  const href = String(manifest.entryUrl || manifest.baseUrl || '').trim();
  if (!href) return '';
  const url = new URL(href, window.location.origin);
  url.searchParams.set('cait_source', 'CAIt');
  url.searchParams.set('cait_context_schema', 'cait-app-context/v1');
  if (appContextResult?.app_context_id) url.searchParams.set('cait_app_context_id', String(appContextResult.app_context_id));
  if (appContextResult?.app_context_token) url.searchParams.set('cait_app_context_token', String(appContextResult.app_context_token));
  if (payload?.order?.id) url.searchParams.set('cait_job', String(payload.order.id).trim());
  return url.toString();
}

async function createAppAgentContextOpenUrl(appId = '', payload = {}) {
  const result = await api('/api/app-contexts', {
    method: 'POST',
    body: JSON.stringify({
      app_id: appId,
      context: appContextFromTransferPayload(appId, payload)
    })
  });
  const openUrl = appAgentContextOpenUrl(appId, result, payload);
  if (!openUrl) throw new Error(`${appManifestById(appId)?.name || 'App'} does not have an entry URL for context handoff.`);
  return openUrl;
}

async function createAppAgentHandoffUrl(appId = '', payload = {}) {
  const manifest = appManifestById(appId);
  const createUrl = manifest?.handoff?.createUrl ? `/api/apps/${encodeURIComponent(manifest.id || appId)}/handoff` : '';
  if (!createUrl) return createAppAgentContextOpenUrl(appId, payload);
  const data = await api(createUrl, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  const handoffUrl = data?.handoff_url || data?.handoffUrl || data?.open_url || data?.openUrl || data?.url || '';
  if (!handoffUrl) throw new Error(String(data?.error || `${manifest?.name || 'App agent'} handoff response did not include a URL.`));
  return String(handoffUrl || manifest?.entryUrl || X_CLIENT_OPS_URL);
}

async function createXClientOpsHandoffUrl(payload = {}, fallbackUrl = '') {
  return createAppAgentHandoffUrl('x-client-ops', payload, fallbackUrl);
}

function xClientOpsTransferPayload(job = {}, draft = {}, strategy = {}) {
  const transfer = appAgentBaseTransferPacket('x-client-ops', job, { draft, strategy });
  return {
    schema_version: 'cait-app-agent-transfer/v1',
    transfer_id: transfer.transfer_id,
    text: String(draft?.text || '').trim(),
    source: String(draft?.source || 'CAIt delivery').trim(),
    title: 'CAIt final X post draft',
    jobId: String(job?.id || '').trim(),
    strategy: strategy.strategy || '',
    product: strategy.product || '',
    audience: strategy.audience || '',
    goal: strategy.goal || '',
    channel: strategy.channel || '',
    url: strategy.url || '',
    source_agent: transfer.agents[0] || null,
    agents: transfer.agents,
    context: {
      platform: transfer.platform,
      app: transfer.app,
      order: transfer.order,
      delivery: transfer.delivery
    },
    settings: transfer.settings,
    transfer
  };
}

function renderXPostTool(job = {}) {
  const draft = xPostDraftFromJob(job);
  if (!draft?.text) return '';
  const jobId = String(job?.id || '').trim();
  const strategy = xStrategyContextFromJob(job);
  const transferPayload = xClientOpsTransferPayload(job, draft, strategy);
  const transferId = registerAppTransferPayload(transferPayload);
  const xClientOpsUrl = xClientOpsHandoffUrl(jobId, { ...draft, ...strategy });
  rememberAppAgentUsage('x-client-ops', {
    title: 'CAIt final X post draft',
    lastHandoffUrl: xClientOpsUrl,
    lastOrderId: jobId,
    source: draft.source,
    product: strategy.product,
    audience: strategy.audience,
    goal: strategy.goal,
    channel: strategy.channel,
    lastContext: {
      title: 'CAIt final X post draft',
      source: draft.source,
      product: strategy.product,
      audience: strategy.audience,
      goal: strategy.goal,
      channel: strategy.channel
    },
    lastTransfer: compactTransferObject(transferPayload, { depth: 4, maxText: 700, maxArray: 8 })
  }, { increment: false });
  return [
    '<div class="x-post-card">',
    '<strong>Final action: X Client Ops</strong>',
    '<div class="chat-hint">CAIt has attached the X post draft and strategy context prepared during the workflow. Open X Client Ops to load the draft into the posting queue and use the strategy as context for this action.</div>',
    `<label class="x-post-label" for="x-post-${escapeHtml(jobId || 'draft')}">X post draft (${String(draft.text).length}/280)</label>`,
    `<textarea class="x-post-editor" id="x-post-${escapeHtml(jobId || 'draft')}" data-x-post-text="${escapeHtml(jobId)}" data-x-post-source="${escapeHtml(draft.source)}" data-app-transfer-id="${escapeHtml(transferId)}" rows="5">${escapeHtml(draft.text)}</textarea>`,
    `<div class="chat-hint">Source: ${escapeHtml(draft.source)}${strategy.strategy ? ' / Strategy attached' : ''} / Agent-app transfer attached</div>`,
    '<div class="inline-actions">',
    `<a class="primary-btn inline-btn file-action" href="${escapeHtml(xClientOpsUrl)}" target="_blank" rel="noopener noreferrer" data-x-client-ops-link="${escapeHtml(jobId)}" data-app-transfer-id="${escapeHtml(transferId)}">Open X Client Ops</a>`,
    `<button class="ghost-btn inline-btn file-action" type="button" data-x-post-copy="${escapeHtml(jobId)}">Copy X draft</button>`,
    `<button class="ghost-btn inline-btn file-action" type="button" data-x-post-submit="${escapeHtml(jobId)}">Post via CAIt connector</button>`,
    xPostConnectHint(),
    '</div>',
    '<span class="chat-hint">CAIt will not post automatically from a summary alone. X Client Ops or the CAIt connector still requires the final user action.</span>',
    '</div>'
  ].filter(Boolean).join('\n');
}

function appAgentHandoffTitle(job = {}) {
  const text = deliveryText(job);
  const first = String(text || '').split('\n').map((line) => line.trim()).find(Boolean) || '';
  return compact(first.replace(/^#+\s*/, ''), 140) || `CAIt delivery ${String(job?.id || '').slice(0, 8)}`;
}

function appAgentGenericTransferPayload(appId = '', job = {}) {
  const text = deliveryText(job);
  return {
    ...appAgentBaseTransferPacket(appId, job, {
      actionKind: 'app_handoff',
      action: {
        source: 'CAIt delivery',
        text,
        title: appAgentHandoffTitle(job)
      }
    }),
    title: appAgentHandoffTitle(job),
    source: 'CAIt delivery',
    summary: compactTransferText(text, 1800)
  };
}

function appHandoffRememberDetails(appId = '', payload = {}, handoffUrl = '', source = 'generic_app_handoff') {
  const settings = payload.settings && typeof payload.settings === 'object' ? payload.settings : {};
  const order = payload.order && typeof payload.order === 'object' ? payload.order : {};
  return rememberAppAgentUsage(appId, {
    title: payload.title || payload.action?.title || 'CAIt app handoff',
    lastHandoffUrl: handoffUrl,
    lastOrderId: order.id || '',
    source,
    product: settings.serviceLine || settings.brandName || '',
    audience: settings.targetClient || '',
    goal: settings.defaultCta || '',
    channel: settings.channel || '',
    lastContext: payload,
    lastTransfer: compactTransferObject(payload, { depth: 4, maxText: 700, maxArray: 8 })
  });
}

function appAgentHandoffCandidates(job = {}) {
  const hasXPostTool = Boolean(xPostDraftFromJob(job)?.text);
  return appManifestSources()
    .filter((entry) => {
      if (!entry?.id || (!entry.entryUrl && !entry.baseUrl && !entry.handoff?.createUrl)) return false;
      if (normalizeUsageId(entry.id) === 'x-client-ops' && hasXPostTool) return false;
      if (String(entry.status || '').toLowerCase() === 'deprecated') return false;
      return true;
    })
    .slice(0, 6);
}

function renderAppHandoffTools(job = {}) {
  if (!isTerminalStatus(job.status)) return '';
  const entries = appAgentHandoffCandidates(job);
  if (!entries.length) return '';
  const rows = entries.map((entry) => {
    const payload = appAgentGenericTransferPayload(entry.id, job);
    const transferId = registerAppTransferPayload(payload);
    const hasPostHandoff = Boolean(entry.handoff?.createUrl);
    const directUrl = String(entry.entryUrl || entry.baseUrl || '').trim();
    const capabilities = Array.isArray(entry.capabilities) ? entry.capabilities.slice(0, 3).map(usageBadge).join('') : '';
    return [
      '<div class="app-handoff-row">',
      '<div class="app-handoff-main">',
      `<strong>${escapeHtml(entry.name || 'Registered app')}</strong>`,
      `<span>${escapeHtml(entry.description || 'Receive this CAIt delivery as structured app context.')}</span>`,
      capabilities ? `<div class="usage-badges">${capabilities}</div>` : '',
      '</div>',
      '<div class="app-handoff-actions">',
      `<button class="primary-btn inline-btn file-action" type="button" data-app-agent-handoff="${escapeHtml(entry.id)}" data-app-transfer-id="${escapeHtml(transferId)}">${hasPostHandoff ? 'Send context' : 'Open with context'}</button>`,
      directUrl ? `<a class="ghost-btn inline-btn file-action" href="${escapeHtml(directUrl)}" target="_blank" rel="noopener noreferrer">Open app</a>` : '',
      '</div>',
      '</div>'
    ].filter(Boolean).join('\n');
  }).join('\n');
  return [
    '<div class="app-handoff-card">',
    '<strong>App handoff</strong>',
    '<div class="chat-hint">Send this delivery, files, agent chain, and order context to registered apps through their handoff API or a server-side CAIt app context. External execution still requires that app or connector to ask for final approval.</div>',
    rows,
    '</div>'
  ].join('\n');
}

function recentAppAgentEntries() {
  const historyById = new Map(state.appAgentHistory.map((entry) => [normalizeUsageId(entry.id || entry.name), entry]));
  const entries = appManifestSources().map((manifest) => {
    const history = historyById.get(normalizeUsageId(manifest.id)) || {};
    return {
      ...manifest,
      ...history,
      id: manifest.id,
      name: manifest.name,
      description: history.description || manifest.description,
      baseUrl: history.baseUrl || manifest.baseUrl,
      entryUrl: history.entryUrl || manifest.entryUrl || manifest.baseUrl,
      capabilities: history.capabilities || manifest.capabilities || [],
      requiredConnectors: history.requiredConnectors || manifest.requiredConnectors || [],
      requiresApprovalFor: history.requiresApprovalFor || manifest.requiresApprovalFor || [],
      handoff: history.handoff || manifest.handoff || null,
      reusePrompt: history.reusePrompt || manifest.reusePrompt || ''
    };
  });
  return entries.sort((left, right) => {
    const leftUsed = Date.parse(left.lastUsedAt || '') || 0;
    const rightUsed = Date.parse(right.lastUsedAt || '') || 0;
    return rightUsed - leftUsed;
  });
}

function usageBadge(text = '') {
  const safe = String(text || '').trim();
  return safe ? `<span class="usage-badge">${escapeHtml(safe)}</span>` : '';
}

function appAgentRowsHtml(entries = []) {
  if (!entries.length) {
    return '<div class="chat-hint">No app usage yet. Open an app from a delivery or the Apps panel to add it here.</div>';
  }
  return entries.map((entry) => {
    const used = entry.lastUsedAt ? `Last used ${usageDisplayDate(entry.lastUsedAt)}` : 'Available';
    const context = entry.lastContext && typeof entry.lastContext === 'object' ? entry.lastContext : {};
    const meta = [
      used,
      context.product ? `Product: ${context.product}` : '',
      context.goal ? `Goal: ${context.goal}` : '',
      context.channel ? `Channel: ${context.channel}` : ''
    ].filter(Boolean).join(' / ');
    const capabilities = Array.isArray(entry.capabilities) ? entry.capabilities.slice(0, 4).map(usageBadge).join('') : '';
    return [
      '<div class="usage-row">',
      '<div class="usage-main">',
      `<strong>${escapeHtml(entry.name || 'Application')}</strong>`,
      `<span>${escapeHtml(entry.description || '')}</span>`,
      `<span class="usage-meta">${escapeHtml(meta)}</span>`,
      capabilities ? `<div class="usage-badges">${capabilities}</div>` : '',
      '</div>',
      '<div class="usage-actions">',
      `<button class="ghost-btn inline-btn file-action" type="button" data-app-agent-open="${escapeHtml(entry.id)}">Open</button>`,
      `<button class="primary-btn inline-btn file-action" type="button" data-app-agent-reuse="${escapeHtml(entry.id)}">Use again</button>`,
      '</div>',
      '</div>'
    ].filter(Boolean).join('\n');
  }).join('\n');
}

function normalizeAppContextRecord(record = {}) {
  const context = record.context && typeof record.context === 'object' ? record.context : {};
  const id = String(record.id || context.id || '').trim();
  if (!id) return null;
  return {
    id,
    sourceApp: String(record.source_app || context.source_app || '').trim(),
    sourceAppLabel: String(record.source_app_label || context.source_app_label || record.source_app || context.source_app || 'App').trim(),
    title: String(record.title || context.title || 'App context').trim(),
    summary: String(record.summary || context.summary || '').trim(),
    status: String(record.status || 'ready').trim(),
    createdAt: String(record.created_at || context.created_at || '').trim(),
    updatedAt: String(record.updated_at || '').trim(),
    expiresAt: String(record.expires_at || '').trim(),
    context: Object.keys(context).length ? context : null
  };
}

function appContextRowsHtml(entries = []) {
  const contexts = (Array.isArray(entries) ? entries : []).map(normalizeAppContextRecord).filter(Boolean);
  if (!contexts.length) {
    return '<div class="chat-hint">No server-side app contexts yet. Use Send to CAIt inside an app to save a reusable context packet here.</div>';
  }
  return contexts.slice(0, 12).map((entry) => {
    const meta = [
      entry.sourceAppLabel,
      entry.status ? `Status: ${entry.status}` : '',
      entry.createdAt ? `Created ${usageDisplayDate(entry.createdAt)}` : ''
    ].filter(Boolean).join(' / ');
    return [
      '<div class="usage-row app-context-history-row">',
      '<div class="usage-main">',
      `<strong>${escapeHtml(entry.title || 'App context')}</strong>`,
      `<span class="usage-meta">${escapeHtml(meta)}</span>`,
      entry.summary ? `<span>${escapeHtml(compactUsageText(entry.summary, 220))}</span>` : '',
      '</div>',
      '<div class="usage-actions">',
      `<button class="primary-btn inline-btn file-action" type="button" data-app-context-load="${escapeHtml(entry.id)}">Load into chat</button>`,
      `<a class="ghost-btn inline-btn file-action" href="/chat?app_context_id=${encodeURIComponent(entry.id)}">Open</a>`,
      '</div>',
      '</div>'
    ].filter(Boolean).join('\n');
  }).join('\n');
}

function aiAgentRowsHtml(entries = []) {
  if (!entries.length) {
    return `<div class="chat-hint">${escapeHtml(chatText(
      'No AI agent usage yet. Leaders and child agents used in orders or deliveries will appear here.',
      'まだAIエージェント利用履歴はありません。発注または納品取得後に、使ったリーダー・子エージェントがここに追加されます。'
    ))}</div>`;
  }
  return entries.slice(0, 12).map((entry) => {
    const used = entry.lastUsedAt ? `Last used ${usageDisplayDate(entry.lastUsedAt)}` : 'Available';
    const task = entry.taskType ? `Task: ${entry.taskType}` : '';
    const route = entry.route ? `Route: ${entry.route}` : '';
    const meta = [used, task, route, entry.status ? `Status: ${entry.status}` : ''].filter(Boolean).join(' / ');
    return [
      '<div class="usage-row">',
      '<div class="usage-main">',
      `<strong>${escapeHtml(entry.name || taskLabel(entry.taskType))}</strong>`,
      `<span class="usage-meta">${escapeHtml(meta)}</span>`,
      entry.summary ? `<span>${escapeHtml(entry.summary)}</span>` : '',
      entry.originalPrompt ? `<span class="usage-preview">${escapeHtml(compactUsageText(entry.originalPrompt, 180))}</span>` : '',
      '</div>',
      '<div class="usage-actions">',
      `<button class="primary-btn inline-btn file-action" type="button" data-ai-agent-reuse="${escapeHtml(entry.id)}">Use again</button>`,
      '</div>',
      '</div>'
    ].filter(Boolean).join('\n');
  }).join('\n');
}

function usageLibraryHtml(scope = 'all') {
  const showApps = scope === 'all' || scope === 'apps';
  const showAgents = scope === 'all' || scope === 'agents';
  const showContexts = scope === 'all' || scope === 'apps' || scope === 'contexts';
  return [
    '<div class="usage-panel">',
    `<strong>${escapeHtml(chatText('Usage History', '利用履歴'))}</strong>`,
    `<div class="chat-hint">${escapeHtml(chatText(
      'Reuse past apps and AI agents from chat. Apps are for final actions; AI agents can restart similar orders from previous conditions.',
      'チャットから過去に使ったアプリとAIエージェントを呼び出せます。アプリは最終アクション、AIエージェントは前回条件の再発注に使います。'
    ))}</div>`,
    showContexts ? '<h3>Server App Contexts</h3>' : '',
    showContexts ? appContextRowsHtml(state.appContexts) : '',
    showApps ? '<h3>Apps</h3>' : '',
    showApps ? appAgentRowsHtml(recentAppAgentEntries()) : '',
    showAgents ? '<h3>AI Agents</h3>' : '',
    showAgents ? aiAgentRowsHtml(state.aiAgentHistory) : '',
    '<div class="chat-hint">Commands: /apps, /agents, /history</div>',
    '</div>'
  ].filter(Boolean).join('\n');
}

function libraryCommandScope(prompt = '') {
  const text = String(prompt || '').trim();
  const lower = text.toLowerCase();
  if (/^\/(?:history|tools|library)\b/.test(lower)) return 'all';
  if (/^\/(?:contexts|app-contexts|context)\b/.test(lower)) return 'contexts';
  if (/(最近|過去|使った|利用した).*(アプリ).*(ai\s*agent|aiagent|エージェント).*(一覧|履歴|呼び出|見せて|表示)/i.test(text)) return 'all';
  if (/(最近|過去|使った|利用した).*(ai\s*agent|aiagent|エージェント).*(アプリ).*(一覧|履歴|呼び出|見せて|表示)/i.test(text)) return 'all';
  if (/^\/apps\b/.test(lower) || /^(最近|過去|使った|利用した)?.*(アプリ).*(一覧|履歴|呼び出|見せて|表示)/.test(text)) return 'apps';
  if (/^\/agents\b/.test(lower) || /^\/aiagents\b/.test(lower) || /^(最近|過去|使った|利用した)?.*(ai\s*agent|aiagent|エージェント).*(一覧|履歴|呼び出|見せて|表示)/i.test(text)) return 'agents';
  if (/(最近|過去|使った|利用した).*(アプリ|ai\s*agent|aiagent|エージェント).*(一覧|履歴|呼び出|見せて|表示)/i.test(text)) return 'all';
  return '';
}

function directAppCommandId(prompt = '') {
  const text = String(prompt || '').trim();
  if (/x\s*client\s*ops/i.test(text) && /(open|launch|use|開|起動|呼び出|使)/i.test(text)) return 'x-client-ops';
  return '';
}

function catalogCacheFresh(fetchedAt = 0) {
  const timestamp = Number(fetchedAt || 0);
  return timestamp > 0 && Date.now() - timestamp < CHATUX_CATALOG_CACHE_TTL_MS;
}

function catalogApiPath(path = '', options = {}) {
  const url = new URL(path, window.location.origin);
  const requestedLimit = Number(options.limit || CHATUX_CATALOG_PAGE_SIZE);
  const requestedOffset = Number(options.offset || 0);
  const limit = Number.isFinite(requestedLimit) ? Math.max(1, requestedLimit) : CHATUX_CATALOG_PAGE_SIZE;
  const offset = Number.isFinite(requestedOffset) ? Math.max(0, requestedOffset) : 0;
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('offset', String(offset));
  return `${url.pathname}${url.search}`;
}

function mergeCatalogById(existing = [], incoming = []) {
  const byId = new Map();
  for (const item of [...(Array.isArray(existing) ? existing : []), ...(Array.isArray(incoming) ? incoming : [])]) {
    const id = normalizeUsageId(item?.id || item?.name);
    if (!id) continue;
    byId.set(id, { ...(byId.get(id) || {}), ...item });
  }
  return [...byId.values()];
}

async function refreshRegisteredApps(options = {}) {
  const force = options.force === true;
  const offset = Math.max(0, Number(options.offset || 0));
  const append = options.append === true || offset > 0;
  if (!force && !append && catalogCacheFresh(state.registeredAppsFetchedAt)) return state.registeredApps;
  if (state.registeredAppsRequest) return state.registeredAppsRequest;
  state.registeredAppsRequest = api(catalogApiPath('/api/apps', options), { method: 'GET' })
    .then((result) => {
      const apps = Array.isArray(result?.apps) ? result.apps : [];
      state.registeredApps = append ? mergeCatalogById(state.registeredApps, apps) : apps;
      state.registeredAppsTotal = Math.max(state.registeredApps.length, Number(result?.total || 0));
      const nextOffset = Number(result?.offset ?? offset) + apps.length;
      state.registeredAppsHasMore = Boolean(result?.hasMore ?? (state.registeredAppsTotal > nextOffset));
      state.registeredAppsFetchedAt = Date.now();
      return state.registeredApps;
    })
    .finally(() => {
      state.registeredAppsRequest = null;
    });
  return state.registeredAppsRequest;
}

async function refreshAppContexts(options = {}) {
  const force = options.force === true;
  const limit = Math.max(1, Math.min(50, Number(options.limit || 10) || 10));
  if (!force && catalogCacheFresh(state.appContextsFetchedAt)) return state.appContexts;
  if (state.appContextsRequest) return state.appContextsRequest;
  const url = new URL('/api/app-contexts', window.location.origin);
  url.searchParams.set('limit', String(limit));
  state.appContextsRequest = api(`${url.pathname}${url.search}`, { method: 'GET' })
    .then((result) => {
      const contexts = Array.isArray(result?.app_contexts) ? result.app_contexts : [];
      state.appContexts = contexts;
      state.appContextsFetchedAt = Date.now();
      return state.appContexts;
    })
    .finally(() => {
      state.appContextsRequest = null;
    });
  return state.appContextsRequest;
}

async function fetchAppContext(contextId = '') {
  const id = String(contextId || '').trim();
  if (!id) throw new Error('App context id is required.');
  const result = await api(`/api/app-contexts/${encodeURIComponent(id)}`, { method: 'GET' });
  const context = result?.app_context?.context;
  if (!context || typeof context !== 'object') throw new Error('App context response did not include a context payload.');
  return context;
}

function recentJobsApiPath(options = {}) {
  const url = new URL('/api/jobs', window.location.origin);
  url.searchParams.set('limit', String(Math.max(1, Math.min(50, Number(options.limit || 30) || 30))));
  if (state.visitorId) url.searchParams.set('visitor_id', state.visitorId);
  return `${url.pathname}${url.search}`;
}

async function refreshRecentJobs(options = {}) {
  const force = options.force === true;
  if (!force && catalogCacheFresh(state.recentJobsFetchedAt)) return state.recentJobs;
  if (state.recentJobsRequest) return state.recentJobsRequest;
  state.recentJobsRequest = api(recentJobsApiPath(options), { method: 'GET' })
    .then((result) => {
      const jobs = Array.isArray(result?.jobs) ? result.jobs : [];
      state.recentJobs = jobs;
      state.recentJobsFetchedAt = Date.now();
      for (const job of jobs) rememberAiAgentsFromJob(job);
      return state.recentJobs;
    })
    .finally(() => {
      state.recentJobsRequest = null;
    });
  return state.recentJobsRequest;
}

async function refreshWorkerAgents(options = {}) {
  const force = options.force === true;
  const offset = Math.max(0, Number(options.offset || 0));
  const append = options.append === true || offset > 0;
  if (!force && !append && catalogCacheFresh(state.workerAgentsFetchedAt)) return state.workerAgents;
  if (state.workerAgentsRequest) return state.workerAgentsRequest;
  state.workerAgentsRequest = api(catalogApiPath('/api/agents', options), { method: 'GET' })
    .then((result) => {
      const agents = Array.isArray(result?.agents) ? result.agents : [];
      state.workerAgents = append ? mergeCatalogById(state.workerAgents, agents) : agents;
      state.workerAgentsTotal = Math.max(state.workerAgents.length, Number(result?.total || 0));
      const nextOffset = Number(result?.offset ?? offset) + agents.length;
      state.workerAgentsHasMore = Boolean(result?.hasMore ?? (state.workerAgentsTotal > nextOffset));
      state.workerAgentsFetchedAt = Date.now();
      return state.workerAgents;
    })
    .finally(() => {
      state.workerAgentsRequest = null;
    });
  return state.workerAgentsRequest;
}

function warmUtilityCatalogs() {
  void refreshWorkerAgents().catch(() => {});
  void refreshRegisteredApps().catch(() => {});
  void refreshAppContexts().catch(() => {});
  void refreshRecentJobs().catch(() => {});
}

async function appendUsageLibrary(scope = 'all') {
  if (scope === 'all') {
    try {
      await Promise.all([
        refreshRegisteredApps(),
        refreshAppContexts(),
        refreshRecentJobs()
      ]);
    } catch {}
  } else if (scope === 'apps') {
    try {
      await Promise.all([
        refreshRegisteredApps(),
        refreshAppContexts()
      ]);
    } catch {}
  } else if (scope === 'agents') {
    try {
      await refreshRecentJobs();
    } catch {}
  } else if (scope === 'contexts') {
    try {
      await refreshAppContexts();
    } catch {}
  }
  appendMessage('assistant', usageLibraryHtml(scope), { tone: 'ok', label: 'Library' });
  setBusy(state.busy);
}

function utilityEmptyHtml(message = 'Nothing to show yet.') {
  return `<div class="utility-empty">${escapeHtml(message)}</div>`;
}

function shortDateTime(value = '') {
  const ms = Date.parse(String(value || ''));
  if (!Number.isFinite(ms)) return '';
  return new Date(ms).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function openUtilityModal(title = 'Panel', body = '') {
  if (!els.utilityModal || !els.utilityModalTitle || !els.utilityModalBody) return;
  els.utilityModalTitle.textContent = title;
  els.utilityModalBody.innerHTML = body || utilityEmptyHtml();
  els.utilityModal.hidden = false;
}

function utilityModalIsOpen(title = '') {
  return Boolean(els.utilityModal && !els.utilityModal.hidden && els.utilityModalTitle?.textContent === title);
}

function closeUtilityModal() {
  if (!els.utilityModal) return;
  els.utilityModal.hidden = true;
}

function jobUtilityRows(jobs = []) {
  const rows = (Array.isArray(jobs) ? jobs : []).filter((job) => job?.id).slice(0, 30).map((job) => {
    const task = taskLabel(job.taskType || job.workflowTask || 'work');
    const meta = [
      statusLabel(job),
      shortDateTime(job.createdAt || job.updatedAt || job.completedAt),
      job.id ? `#${String(job.id).slice(0, 8)}` : ''
    ].filter(Boolean).join(' / ');
    const summary = compact(job.output?.summary || job.output?.report?.summary || job.failureReason || job.prompt || '', 180);
    return [
      '<div class="utility-row">',
      '<div class="utility-main">',
      `<strong>${escapeHtml(task)}</strong>`,
      `<span class="utility-meta">${escapeHtml(meta)}</span>`,
      summary ? `<span>${escapeHtml(summary)}</span>` : '',
      '</div>',
      '<div class="utility-actions">',
      `<button class="ghost-btn file-action" type="button" data-utility-open-job="${escapeHtml(job.id)}">Open</button>`,
      '</div>',
      '</div>'
    ].filter(Boolean).join('\n');
  });
  return rows.length ? `<div class="utility-list">${rows.join('\n')}</div>` : utilityEmptyHtml('No chat orders are visible yet.');
}

async function showChatListPanel() {
  openUtilityModal('Chats', utilityEmptyHtml('Loading recent chats and orders...'));
  try {
    const jobs = await refreshRecentJobs({ force: true, limit: 30 });
    openUtilityModal('Chats', [
      '<div class="chat-hint">Recent orders are restored here so completed work can be reopened after reloads.</div>',
      jobUtilityRows(jobs)
    ].join('\n'));
  } catch (error) {
    openUtilityModal('Chats', utilityEmptyHtml(orderErrorMessage(error)));
  }
}

function agentUtilityRows(agents = []) {
  const rows = (Array.isArray(agents) ? agents : []).filter((agent) => agent?.id).slice(0, 60).map((agent) => {
    const taskTypes = Array.isArray(agent.taskTypes) ? agent.taskTypes : (Array.isArray(agent.task_types) ? agent.task_types : []);
    const primaryTask = String(taskTypes[0] || agent.taskType || '').trim();
    const meta = [
      agent.id,
      taskTypes.slice(0, 4).join(', '),
      agent.status || agent.verificationStatus || ''
    ].filter(Boolean).join(' / ');
    return [
      '<div class="utility-row">',
      '<div class="utility-main">',
      `<strong>${escapeHtml(agent.name || taskLabel(primaryTask) || agent.id)}</strong>`,
      `<span class="utility-meta">${escapeHtml(meta)}</span>`,
      agent.description ? `<span>${escapeHtml(compact(agent.description, 190))}</span>` : '',
      '</div>',
      '<div class="utility-actions">',
      primaryTask ? `<button class="ghost-btn file-action" type="button" data-utility-agent-task="${escapeHtml(primaryTask)}" data-utility-agent-id="${escapeHtml(agent.id)}" data-utility-agent-name="${escapeHtml(agent.name || taskLabel(primaryTask) || agent.id)}">Use</button>` : '',
      '</div>',
      '</div>'
    ].filter(Boolean).join('\n');
  });
  return rows.length ? `<div class="utility-list">${rows.join('\n')}</div>` : utilityEmptyHtml('No workers are visible for this account yet.');
}

function catalogLoadMoreHtml(kind = '', loaded = 0, total = 0, hasMore = false) {
  const safeLoaded = Math.max(0, Number(loaded || 0));
  const safeTotal = Math.max(safeLoaded, Number(total || 0));
  const count = safeTotal > 0 ? `Showing ${safeLoaded} of ${safeTotal}` : `Showing ${safeLoaded}`;
  if (!hasMore) return safeLoaded ? `<div class="utility-more"><span class="utility-meta">${escapeHtml(count)}</span></div>` : '';
  return [
    '<div class="utility-more">',
    `<span class="utility-meta">${escapeHtml(count)}</span>`,
    `<button class="ghost-btn inline-btn file-action" type="button" data-utility-load-more="${escapeHtml(kind)}">Load more</button>`,
    '</div>'
  ].join('\n');
}

function workersPanelHtml(status = '') {
  return [
    '<div class="chat-hint">Use opens a chat order draft with that worker role. Execution still follows normal intake and approval gates.</div>',
    status ? `<div class="chat-hint">${escapeHtml(status)}</div>` : '',
    agentUtilityRows(state.workerAgents),
    catalogLoadMoreHtml('workers', state.workerAgents.length, state.workerAgentsTotal, state.workerAgentsHasMore)
  ].filter(Boolean).join('\n');
}

function appPanelHtml(status = '') {
  const appCount = appManifestSources().length;
  const staticCount = APP_AGENT_MANIFESTS.length;
  const total = state.registeredAppsTotal ? state.registeredAppsTotal + staticCount : appCount;
  return [
    status ? `<div class="chat-hint">${escapeHtml(status)}</div>` : '',
    usageLibraryHtml('apps'),
    catalogLoadMoreHtml('apps', appCount, total, state.registeredAppsHasMore)
  ].filter(Boolean).join('\n');
}

async function showWorkerListPanel() {
  openUtilityModal('Workers', state.workerAgents.length ? workersPanelHtml('Refreshing worker list...') : utilityEmptyHtml('Loading first 10 workers...'));
  try {
    await refreshWorkerAgents();
    if (utilityModalIsOpen('Workers')) openUtilityModal('Workers', workersPanelHtml());
  } catch (error) {
    if (utilityModalIsOpen('Workers')) {
      openUtilityModal('Workers', state.workerAgents.length ? workersPanelHtml(orderErrorMessage(error)) : utilityEmptyHtml(orderErrorMessage(error)));
    }
  }
}

async function showAppListPanel() {
  openUtilityModal('Apps', appPanelHtml('Loading first 10 registered apps and recent app contexts...'));
  try {
    await Promise.all([
      refreshRegisteredApps(),
      refreshAppContexts()
    ]);
    if (utilityModalIsOpen('Apps')) openUtilityModal('Apps', appPanelHtml());
  } catch (error) {
    if (utilityModalIsOpen('Apps')) {
      openUtilityModal('Apps', appPanelHtml(`Registered apps could not be refreshed. ${orderErrorMessage(error)}`));
    }
  }
}

async function loadAppContextIntoChat(contextId = '') {
  const context = await fetchAppContext(contextId);
  appendMessage('assistant', caitAppContextThreadHtml(context), { label: 'App context', tone: 'ok' });
  els.promptInput.value = caitAppContextChatPrompt(context);
  els.promptInput.focus();
  closeUtilityModal();
}

async function loadMoreUtilityCatalog(kind = '') {
  if (kind === 'workers') {
    openUtilityModal('Workers', workersPanelHtml('Loading more workers...'));
    try {
      await refreshWorkerAgents({ offset: state.workerAgents.length, append: true, force: true });
      if (utilityModalIsOpen('Workers')) openUtilityModal('Workers', workersPanelHtml());
    } catch (error) {
      if (utilityModalIsOpen('Workers')) openUtilityModal('Workers', workersPanelHtml(orderErrorMessage(error)));
    }
  } else if (kind === 'apps') {
    openUtilityModal('Apps', appPanelHtml('Loading more apps...'));
    try {
      await refreshRegisteredApps({ offset: state.registeredApps.length, append: true, force: true });
      if (utilityModalIsOpen('Apps')) openUtilityModal('Apps', appPanelHtml());
    } catch (error) {
      if (utilityModalIsOpen('Apps')) openUtilityModal('Apps', appPanelHtml(orderErrorMessage(error)));
    }
  }
}

function showInfoPanel() {
  const auth = state.auth || {};
  const login = auth.login || auth.user?.login || auth.user?.email || '';
  const xState = auth.xLinked || auth.xAuthorized ? 'connected' : (auth.xConfigured === false ? 'not configured' : 'not connected');
  const adminAction = auth.isPlatformAdmin || auth.admin ? '<a class="ghost-btn file-action" href="/admin">Admin</a>' : '';
  openUtilityModal('Info', [
    '<div class="utility-list">',
    '<div class="utility-row"><div class="utility-main">',
    '<strong>Account</strong>',
    `<span class="utility-meta">${escapeHtml(login || 'Not signed in')}</span>`,
    `<span>X connector: ${escapeHtml(xState)}</span>`,
    '</div><div class="utility-actions">',
    auth.loggedIn || login ? `${adminAction}<a class="ghost-btn file-action" href="${escapeHtml(xAuthHref())}">Connect X</a><button class="ghost-btn file-action" type="button" data-chat-logout>Sign out</button>` : `<a class="ghost-btn file-action" href="${escapeHtml(loginHref('google'))}">Sign in</a>`,
    '</div></div>',
    '<div class="utility-row"><div class="utility-main"><strong>Resources</strong><span class="utility-meta">Docs, terms, privacy, and help.</span></div><div class="utility-actions"><a class="ghost-btn file-action" href="/help.html">Help</a><a class="ghost-btn file-action" href="/resources.html">Resources</a></div></div>',
    '</div>'
  ].join('\n'));
}

function findAppAgentEntry(id = '') {
  const safeId = normalizeUsageId(id);
  return recentAppAgentEntries().find((entry) => normalizeUsageId(entry.id) === safeId) || null;
}

function findAiAgentEntry(id = '') {
  const safeId = normalizeUsageId(id);
  return state.aiAgentHistory.find((entry) => normalizeUsageId(entry.id) === safeId) || null;
}

function openAppAgent(id = '', options = {}) {
  const entry = findAppAgentEntry(id);
  if (!entry) {
    appendTextMessage('assistant', chatText(
      'The selected app was not found. Use /apps to review the list.',
      '指定されたアプリが見つかりませんでした。/apps で一覧を確認してください。'
    ), { tone: 'error', label: 'Library' });
    return false;
  }
  const href = String(options.href || entry.lastHandoffUrl || entry.entryUrl || entry.baseUrl || '').trim();
  if (!href) {
    appendTextMessage('assistant', chatText(
      `${entry.name} does not have a launch URL yet.`,
      `${entry.name} の起動URLがありません。`
    ), { tone: 'error', label: 'Library' });
    return false;
  }
  rememberAppAgentUsage(entry.id, {
    lastHandoffUrl: href,
    lastContext: entry.lastContext || {},
    source: options.source || 'chat_library_open'
  });
  window.open(href, '_blank', 'noopener,noreferrer');
  appendTextMessage('system', chatText(
    `Opened ${entry.name}.`,
    `${entry.name}を開きました。`
  ), { label: 'Library' });
  return true;
}

async function reuseAppAgent(id = '') {
  const entry = findAppAgentEntry(id);
  if (!entry) {
    appendTextMessage('assistant', chatText(
      'The selected app was not found. Use /apps to review the list.',
      '指定されたアプリが見つかりませんでした。/apps で一覧を確認してください。'
    ), { tone: 'error', label: 'Library' });
    return;
  }
  if (entry.lastHandoffUrl) {
    openAppAgent(id, { href: entry.lastHandoffUrl, source: 'chat_library_reuse_handoff' });
    return;
  }
  const prompt = String(entry.reusePrompt || `Use ${entry.name} for the final action layer.`).trim();
  appendTextMessage('assistant', chatText(
    `I will prepare an order using ${entry.name}.`,
    `${entry.name}を使う前提で注文確認を作ります。`,
    prompt
  ), { label: 'Library' });
  await prepareOrder(prompt);
}

async function reuseAiAgent(id = '') {
  const entry = findAiAgentEntry(id);
  if (!entry) {
    appendTextMessage('assistant', chatText(
      'The selected AI agent history was not found. Use /agents to review the list.',
      '指定されたAIエージェント履歴が見つかりませんでした。/agents で一覧を確認してください。'
    ), { tone: 'error', label: 'Library' });
    return;
  }
  const basePrompt = String(entry.reusePrompt || entry.originalPrompt || '').trim();
  const prompt = basePrompt || `Use ${entry.name || taskLabel(entry.taskType)} again for the same kind of work.`;
  const label = entry.name || taskLabel(entry.taskType);
  appendTextMessage('assistant', chatText(
    `I will prepare an order reusing ${label} with the previous conditions.`,
    `${label}を前回条件ベースで再利用する注文確認を作ります。`,
    prompt
  ), { label: 'Library' });
  await prepareOrder(prompt, { originalPrompt: prompt, taskType: entry.taskType || entry.task_type || '' });
}

function renderAuthorityRequest(job = {}) {
  const authority = authorityRequestFromJob(job);
  if (!authorityNeedsApproval(authority)) return '';
  const missingConnectors = listValues(authority.missing_connectors || authority.missingConnectors || authority.connectors);
  const missingCapabilities = listValues(authority.missing_connector_capabilities || authority.missingConnectorCapabilities || authority.capabilities);
  const required = [...missingCapabilities, ...missingConnectors].filter(Boolean);
  const reason = String(authority.reason || authority.message || authority.summary || job.failureReason || 'External action requires approval before execution.').trim();
  const xNeeded = required.some((item) => /(^x$|x\.post|twitter|tweet)/i.test(item));
  const openWorkHref = `/${job.id ? `#${encodeURIComponent(job.id)}` : ''}`;
  const actionLinks = [];
  if (xNeeded && !state.auth?.loggedIn) {
    actionLinks.push(`<a class="primary-btn inline-btn file-action" href="${escapeHtml(loginHref('google'))}">Sign in</a>`);
  } else if (xNeeded && !state.auth?.xLinked && !state.auth?.xAuthorized && state.auth?.xConfigured !== false && state.auth?.xTokenEncryptionConfigured !== false) {
    actionLinks.push(`<a class="primary-btn inline-btn file-action" href="${escapeHtml(xAuthHref())}">Connect X</a>`);
  }
  actionLinks.push(`<a class="ghost-btn inline-btn file-action" href="${escapeHtml(openWorkHref)}">Open chat approval</a>`);
  return [
    '<div class="approval-card">',
    '<strong>承認が必要です / Action approval required</strong>',
    `<div>Reason: ${escapeHtml(reason)}</div>`,
    required.length ? `<div>Required: ${escapeHtml(required.join(', '))}</div>` : '',
    '<div>Status: CAIt has not posted, sent, or published externally yet.</div>',
    actionLinks.length ? `<div class="inline-actions">${actionLinks.join('')}</div>` : '',
    '<span class="chat-hint">Review the exact file content below before approving the external action.</span>',
    '</div>'
  ].filter(Boolean).join('\n');
}

function renderFileCards(files = []) {
  const bundle = files.length > 1 ? registerDeliveryFile(combinedMarkdownFile(files), 'delivery-bundle.md') : null;
  const bundleActions = bundle
    ? [
      '<div class="file-actions bundle-actions">',
      `<button class="primary-btn inline-btn file-action" type="button" data-file-action="download" data-file-id="${escapeHtml(bundle.id)}">Download all MD</button>`,
      `<button class="ghost-btn inline-btn file-action" type="button" data-file-action="copy" data-file-id="${escapeHtml(bundle.id)}">Copy all</button>`,
      '</div>'
    ].join('')
    : '';
  const cards = files.map((file, index) => {
    const registered = registerDeliveryFile(file, `delivery-${index + 1}.md`);
    const name = registered.name;
    const content = registered.content.trim();
    const isHtml = /\.html?$/i.test(name) || /<!doctype html|<html[\s>]/i.test(content);
    const downloadLabel = isHtml ? 'Download HTML' : 'Download MD';
    const preview = isHtml
      ? `<iframe class="html-preview" sandbox="allow-scripts allow-forms allow-popups" referrerpolicy="no-referrer" srcdoc="${escapeHtml(content)}" title="${escapeHtml(name)} preview"></iframe>`
      : '';
    return [
      '<details class="file-card">',
      `<summary>${escapeHtml(name)}</summary>`,
      '<div class="file-actions">',
      `<button class="primary-btn inline-btn file-action" type="button" data-file-action="download" data-file-id="${escapeHtml(registered.id)}">${escapeHtml(downloadLabel)}</button>`,
      `<button class="ghost-btn inline-btn file-action" type="button" data-file-action="copy" data-file-id="${escapeHtml(registered.id)}">Copy</button>`,
      '</div>',
      `<pre>${escapeHtml(content || '(empty file)')}</pre>`,
      preview,
      '</details>'
    ].join('');
  }).join('');
  return [bundleActions, cards].filter(Boolean).join('');
}

function renderDelivery(job = {}) {
  rememberAiAgentsFromJob(job);
  const files = deliveryFiles(job);
  const text = deliveryText(job) || `Order ${job.id || ''} is ${statusDisplayLabel(job.status || 'updated')}.`;
  const body = [
    renderAuthorityRequest(job),
    renderXPostTool(job),
    renderAppHandoffTools(job),
    `<strong>Delivery update</strong>\n${escapeHtml(text)}`,
    files.length ? renderFileCards(files) : ''
  ].filter(Boolean).join('\n\n');
  appendMessage(isTerminalStatus(job.status) ? 'assistant' : 'system', body, {
    tone: job.status === 'completed' ? 'ok' : (job.status === 'failed' || job.status === 'timed_out' ? 'error' : (job.status === 'blocked' ? 'warn' : '')),
    label: isTerminalStatus(job.status) ? 'Delivery' : 'Progress'
  });
}

function renderDeliveryOnce(job = {}, options = {}) {
  const safeId = String(job?.id || '').trim();
  if (!safeId || !isTerminalStatus(job.status)) return false;
  if (state.deliveredOrderIds.has(safeId) && !options.force) return false;
  rememberTrackedOrder(safeId);
  renderDelivery(job);
  markOrderDelivered(safeId);
  return true;
}

function rememberPendingRecoveryPayload(payload = {}) {
  if (!payload || typeof payload !== 'object') return;
  state.pendingRecoveryPayloads = [
    payload,
    ...state.pendingRecoveryPayloads
  ].slice(0, 5);
}

function clearPendingRecoveryPayload(payload = {}) {
  if (!payload || typeof payload !== 'object') return;
  const targetPrompt = normalizeRecoveryText(payload.prompt || '');
  state.pendingRecoveryPayloads = state.pendingRecoveryPayloads.filter((item) => normalizeRecoveryText(item.prompt || '') !== targetPrompt);
}

async function backfillChatDeliveries(options = {}) {
  const jobs = await refreshRecentJobs({ force: true, limit: 30 });
  let delivered = 0;
  for (const job of jobs) {
    const safeId = String(job?.id || '').trim();
    if (!safeId) continue;
    const matchesTracked = state.trackedOrderIds.has(safeId);
    const matchesRecovery = state.pendingRecoveryPayloads.some((payload) => recoveryCandidate(job, payload));
    if (!matchesTracked && !matchesRecovery) continue;
    rememberTrackedOrder(safeId);
    if (!state.orderId && matchesRecovery) state.orderId = safeId;
    if (isTerminalStatus(job.status)) {
      if (options.renderTerminalDeliveries === false && !matchesRecovery) continue;
      if (renderDeliveryOnce(job, { force: options.force === true })) delivered += 1;
    } else if (!state.polling && safeId === state.orderId) {
      startPolling(safeId);
    }
  }
  return delivered;
}

function startDeliveryBackfillLoop(options = {}) {
  if (state.deliveryBackfill) return;
  let runs = 0;
  const tick = async () => {
    runs += 1;
    try {
      await backfillChatDeliveries(options);
    } catch {}
    if (runs >= Number(options.maxRuns || 36)) {
      window.clearInterval(state.deliveryBackfill);
      state.deliveryBackfill = null;
    }
  };
  void tick();
  state.deliveryBackfill = window.setInterval(tick, CHATUX_BACKFILL_INTERVAL_MS);
}

function draftBrief(prompt, prepared) {
  return chatEngineDraftBrief(prompt, prepared);
}

function updateComposerMode() {
  const pending = Boolean(state.draft);
  const intake = Boolean(state.pendingIntake);
  els.promptInput.rows = intake ? 4 : (pending ? 2 : 3);
  els.promptInput.placeholder = intake ? INTAKE_PLACEHOLDER : (pending ? PENDING_ORDER_PLACEHOLDER : DEFAULT_PROMPT_PLACEHOLDER);
}

function isNeedsInputResponse(response = {}) {
  return chatEngineIsNeedsInputResponse(response);
}

function sleep(ms = 0) {
  return new Promise((resolve) => window.setTimeout(resolve, Math.max(0, Number(ms || 0))));
}

function normalizeRecoveryText(value = '') {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function recoverySessionId(source = {}) {
  const input = source?.input && typeof source.input === 'object' ? source.input : {};
  const broker = input._broker && typeof input._broker === 'object' ? input._broker : {};
  return String(
    source?.session_id
    || source?.sessionId
    || input.session_id
    || input.sessionId
    || broker.chatSessionId
    || broker.chatux?.visitor_id
    || ''
  ).trim();
}

function recoveryPromptMatches(job = {}, payload = {}) {
  const requested = normalizeRecoveryText(payload?.prompt || '');
  if (!requested) return false;
  const candidates = [
    job.prompt,
    job.originalPrompt,
    job.workflow?.objective
  ].map(normalizeRecoveryText).filter(Boolean);
  return candidates.some((candidate) => (
    candidate === requested
    || (requested.length > 80 && candidate.includes(requested.slice(0, 80)))
    || (candidate.length > 80 && requested.includes(candidate.slice(0, 80)))
  ));
}

function recoveryCandidate(job = {}, payload = {}) {
  if (!job?.id) return false;
  const parentAgent = String(payload?.parent_agent_id || '').trim();
  if (parentAgent && String(job.parentAgentId || '') !== parentAgent) return false;
  const createdMs = Date.parse(job.createdAt || job.created_at || '');
  if (!Number.isFinite(createdMs) || Date.now() - createdMs > 10 * 60 * 1000) return false;
  const requestedSession = recoverySessionId(payload);
  const jobSession = recoverySessionId(job);
  return Boolean(
    recoveryPromptMatches(job, payload)
    || (requestedSession && jobSession && requestedSession === jobSession)
  );
}

function createdPayloadFromRecoveredJob(job = {}) {
  const isWorkflow = job?.jobKind === 'workflow' || Boolean(job?.workflow);
  return {
    ok: true,
    recovered: true,
    status: job.status || 'queued',
    mode: isWorkflow ? 'workflow' : (job.status || 'queued'),
    ...(isWorkflow ? { workflow_job_id: job.id } : { job_id: job.id }),
    workflow: job.workflow || undefined,
    routing_reason: 'Recovered from order history after the create response failed.'
  };
}

async function recoverAcceptedOrderAfterCreateError(payload = {}, error = null) {
  const status = Number(error?.status || 0);
  const message = String(error?.message || error || '').toLowerCase();
  const shouldTry = status >= 500 || /failed to fetch|networkerror|load failed|network request failed/.test(message);
  if (!shouldTry) return null;
  appendTextMessage('system', 'The create response failed, but the order may already be saved. Checking history before retrying.');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt) await sleep(900 * attempt);
    try {
      const result = await api(`/api/jobs?limit=20&visitor_id=${encodeURIComponent(state.visitorId)}`);
      const recovered = (Array.isArray(result?.jobs) ? result.jobs : [])
        .filter((job) => recoveryCandidate(job, payload))
        .sort((left, right) => {
          const preferWorkflow = (job) => (job?.jobKind === 'workflow' || job?.workflow ? 1 : 0);
          const workflowDiff = preferWorkflow(right) - preferWorkflow(left);
          if (workflowDiff) return workflowDiff;
          return String(right?.createdAt || '').localeCompare(String(left?.createdAt || ''));
        })[0] || null;
      if (recovered?.id) {
        rememberTrackedOrder(recovered.id);
        return createdPayloadFromRecoveredJob(recovered);
      }
    } catch {}
  }
  return null;
}

function startIntake(response = {}, originalPrompt = '') {
  state.pendingIntake = chatEngineBuildIntakeState(response, originalPrompt);
  setConversationOwnerFromPrepared(response, { sample: originalPrompt });
  const questions = Array.isArray(state.pendingIntake.questions) ? state.pendingIntake.questions.filter(Boolean).slice(0, 8) : [];
  const owner = state.pendingIntake.conversationOwner || conversationOwnerFromPrepared(response);
  const label = owner.type === 'leader' ? (owner.label || activeActorLabel('Intake')) : 'Intake';
  const leadLine = owner.type === 'leader'
    ? chatText(
        `${owner.label || 'The selected leader'} needs these details before dispatch.`,
        `${owner.label || '選択されたリーダー'} が実行前に確認したい内容です。`,
        originalPrompt
      )
    : '';
  state.draft = null;
  state.draftRevision += 1;
  updateComposerMode();
  appendTextMessage('assistant', [
    response.message || 'I need a few more details before preparing or dispatching the order.',
    leadLine,
    state.pendingIntake.selectedAgentName ? `Selected worker: ${state.pendingIntake.selectedAgentName}` : '',
    '',
    'Answer what you can:',
    ...questions.map((question, index) => `${index + 1}. ${question}`),
    '',
    'Nothing has been dispatched yet.'
  ].filter(Boolean).join('\n'), { tone: 'ok', label });
}

async function answerPendingIntake(answer = '') {
  const intake = state.pendingIntake;
  if (!intake) return false;
  const text = String(answer || '').trim();
  if (!text) {
    appendTextMessage('assistant', looksJapanese(intake.originalPrompt)
      ? '分かる範囲で回答してください。まだ発注は開始していません。'
      : 'Answer what you can first. Nothing has been dispatched yet.', { tone: 'error', label: 'Intake' });
    return true;
  }
  const combined = chatEngineBuildIntakeCombinedPrompt(intake, text);
  state.pendingIntake = null;
  updateComposerMode();
  await prepareOrder(combined, {
    intakeAnswered: true,
    originalPrompt: intake.originalPrompt || combined,
    taskType: intake.taskType || intake.task_type || '',
    selectedAgentId: intake.selectedAgentId || intake.selected_agent_id || '',
    selectedAgentName: intake.selectedAgentName || intake.selected_agent_name || '',
    activeLeaderTaskType: intake.activeLeaderTaskType || intake.active_leader_task_type || intake.conversationOwner?.taskType || state.activeLeader?.taskType || '',
    activeLeaderName: intake.activeLeaderName || intake.active_leader_name || intake.conversationOwner?.label || state.activeLeader?.label || ''
  });
  return true;
}

function orderConfirmationHtml(options = {}) {
  const draft = state.draft || {};
  const updated = options.updated === true;
  const task = draft.taskType || '-';
  const route = String(draft.resolvedOrderStrategy || 'single').toUpperCase();
  const reason = draft.reason || draft.routeHint || 'Prepared from your chat request.';
  const prompt = draft.prompt || '';
  const selectedAgent = String(draft.selectedAgentName || draft.selected_agent_name || draft.selectedAgentId || draft.selected_agent_id || '').trim();
  const owner = conversationOwnerFromPrepared(draft);
  const lead = owner.type === 'leader' ? `${owner.label || taskLabel(owner.taskType)} (${owner.taskType})` : 'CAIt specialist router';
  return [
    `<strong>${updated ? 'Updated order check' : 'Order check'}</strong>`,
    '',
    `Lead: ${escapeHtml(lead)}`,
    `Task: ${escapeHtml(task)}`,
    `Route: ${escapeHtml(route)}`,
    selectedAgent ? `Selected worker: ${escapeHtml(selectedAgent)}` : '',
    `Reason: ${escapeHtml(reason)}`,
    '',
    '<details class="file-card order-brief" open>',
    '<summary>Instruction that will be sent</summary>',
    `<pre>${escapeHtml(prompt)}</pre>`,
    '</details>',
    '<div class="inline-actions">',
    '<button class="primary-btn inline-btn" type="button" data-chat-action="send-order">Send order</button>',
    '<button class="ghost-btn inline-btn" type="button" data-chat-action="reset-chat">Reset</button>',
    '</div>',
    '<span class="chat-hint">Type adjustments here to update this order, or type SEND ORDER to dispatch.</span>'
  ].join('\n');
}

function appendOrderConfirmation(options = {}) {
  appendMessage('assistant', orderConfirmationHtml(options), { tone: 'ok', label: activeActorLabel('Order check') });
  updateComposerMode();
  setBusy(state.busy);
}

function chatIntentConversationContext() {
  return [...els.chatThread.querySelectorAll('.message')]
    .slice(-10)
    .map((item) => {
      const role = item.classList.contains('user') ? 'user' : 'assistant';
      const content = String(item.querySelector('.message-body')?.textContent || '').replace(/\s+/g, ' ').trim();
      return content ? { role, content: content.slice(0, 900) } : null;
    })
    .filter(Boolean);
}

function isStructuredOrderBriefText(value = '') {
  const text = String(value || '').trim();
  return /^Task:\s.+/mi.test(text) && /^Goal:\s.+/mi.test(text) && /^Deliver:\s.+/mi.test(text);
}

function promptInjectionSafeAnalysisContext(prompt = '') {
  const text = String(prompt || '').replace(/\s+/g, ' ').trim();
  if (!text) return false;
  return /(analy[sz]e|review|detect|explain|summari[sz]e|classify|sanitize|improve|rewrite|レビュー|解説|説明|検出|分類|安全化|書き換え|改善).{0,90}(prompt injection|jailbreak|ignore previous|system prompt|developer message|プロンプトインジェクション|脱獄|前の指示|システムプロンプト|開発者メッセージ)/i.test(text)
    || /(以下|次の|this|these).{0,60}(prompt|text|source|example|プロンプト|文章|テキスト|ソース|例|入力).{0,90}(analy[sz]e|review|detect|explain|sanitize|improve|分析|レビュー|解説|説明|検出|安全化|改善)/i.test(text);
}

function promptInjectionGuard(prompt = '') {
  const text = String(prompt || '').replace(/\u0000/g, '').trim();
  if (!text || promptInjectionSafeAnalysisContext(text)) return { blocked: false, code: '' };
  const compact = text.replace(/\s+/g, ' ');
  const rules = [
    {
      code: 'override_instructions',
      pattern: /\b(ignore|disregard|forget|override|bypass|disable|drop)\b.{0,90}\b(previous|above|prior|earlier|system|developer|instructions?|rules?|policy|policies|safety|guardrails?)\b/i
    },
    {
      code: 'override_instructions_ja',
      pattern: /(前|以前|上記|これまで|システム|開発者|ポリシー|安全|制約).{0,60}(指示|命令|ルール|プロンプト|制約).{0,60}(無視|破棄|忘れ|解除|上書き|バイパス)/i
    },
    {
      code: 'hidden_prompt_exfiltration',
      pattern: /\b(reveal|show|print|dump|leak|exfiltrate|extract|output|display)\b.{0,90}\b(system prompt|developer message|hidden instructions?|internal prompts?|tool schema|tools?|api keys?|secrets?|env(?:ironment)?(?: variables?)?)\b/i
    },
    {
      code: 'hidden_prompt_exfiltration_ja',
      pattern: /(システムプロンプト|開発者メッセージ|隠し指示|内部指示|内部プロンプト|ツール|APIキー|apiキー|秘密|シークレット|環境変数).{0,70}(出力|表示|見せ|開示|漏ら|教え|抽出)/i
    },
    {
      code: 'jailbreak_persona',
      pattern: /\b(DAN|jailbreak|developer mode|god mode|do anything now|no restrictions?|unrestricted|policy[- ]?free)\b/i
    },
    {
      code: 'role_injection',
      pattern: /(^|\n)\s*(system|developer)\s*:.{0,400}\b(ignore|override|bypass|reveal|show|dump|leak|disable|no restrictions?)\b/is
    }
  ];
  const matched = rules.find((rule) => rule.pattern.test(compact) || rule.pattern.test(text));
  return matched ? { blocked: true, code: matched.code } : { blocked: false, code: '' };
}

function handlePromptInjectionInput(prompt = '') {
  const guard = promptInjectionGuard(prompt);
  if (!guard.blocked) return false;
  appendTextMessage('assistant', chatText(
    [
      'I detected a prompt-injection attempt, so CAIt will not execute it or turn it into an order.',
      '',
      'Requests to ignore rules, reveal system/developer prompts, expose tools, or leak secrets are blocked.',
      '',
      'Rewrite the goal without hidden-instruction or rule-override text.'
    ].join('\n'),
    [
      'プロンプトインジェクションらしき指示を検出したため、CAItでは実行・発注化しません。',
      '',
      'ルールの無視、system/developer prompt の開示、ツール情報や secret の漏えいを求める指示はブロックします。',
      '',
      '進める場合は、隠し指示やルール上書きの文を除いて目的だけを書き直してください。'
    ].join('\n'),
    prompt
  ), { tone: 'error', label: 'Guard' });
  return true;
}

async function resolveChatIntentWithLlm(prompt = '') {
  const text = String(prompt || '').trim();
  if (!text || isStructuredOrderBriefText(text)) return null;
  if (promptInjectionGuard(text).blocked) return null;
  try {
    const result = await api('/api/open-chat/intent', {
      method: 'POST',
      body: JSON.stringify({
        prompt: text,
        conversation_context: chatIntentConversationContext(),
        desired_output: 'First decide whether this is normal chat or an order request. If it is normal chat, answer in chat. If it is executable work with enough context, return a CAIt order brief. If a Team Leader needs intake first, return adaptive intake_questions before any proposal.',
        user_language: looksJapanese(text) ? 'Japanese' : 'English',
        input_counts: { url_count: 0, file_count: 0, file_chars: 0 }
      })
    });
    return result?.ok ? result : null;
  } catch {
    return null;
  }
}

function normalizeLlmIntakeQuestions(value = []) {
  const seen = new Set();
  return (Array.isArray(value) ? value : [])
    .map((item) => String(item || '').replace(/\s+/g, ' ').trim())
    .filter((item) => item.length >= 12 && item.length <= 260)
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .filter((item) => !/(password|secret|api key|hidden prompt|system prompt|ignore previous|パスワード|秘密|システムプロンプト|隠しプロンプト)/i.test(item))
    .slice(0, 6);
}

function leaderTaskTypeFromIntentResult(prompt = '', result = {}) {
  const text = `${prompt}\n${result?.summary || ''}\n${result?.narrowing_question || ''}`.toLowerCase();
  const intent = String(result?.intent || '').trim();
  if (/(cto|architecture|technical|repo|github|code|deploy|技術|実装|リポジトリ|デプロイ)/i.test(text)) return 'cto_leader';
  if (/(cpo|product|ux|roadmap|feature|プロダクト|機能|ux|ロードマップ)/i.test(text)) return 'cpo_leader';
  if (/(cfo|pricing|finance|unit economics|cash|価格|財務|収支|粗利)/i.test(text)) return 'cfo_leader';
  if (/(legal|privacy|terms|contract|compliance|規約|法務|契約|プライバシー)/i.test(text)) return 'legal_leader';
  if (/(research|compare|decision|調査|比較|意思決定)/i.test(text)) return 'research_team_leader';
  if (/(build team|implementation|debug|実装|修正|バグ)/i.test(text)) return 'build_team_leader';
  if (intent === 'natural_business_growth' || intent === 'natural_marketing_launch' || /(growth|marketing|sales|acquisition|launch|集客|売上|マーケ|ローンチ)/i.test(text)) return 'cmo_leader';
  return '';
}

async function handleChatIntentWithLlm(prompt = '') {
  const result = await resolveChatIntentWithLlm(prompt);
  if (!result) return false;
  const action = String(result.action || '').trim();
  if (action === 'answer_in_chat') {
    appendTextMessage('assistant', result.chat_answer || result.summary || chatText(
      'I can answer that here. No order was created.',
      'ここで回答します。新しいオーダーは作成していません。',
      prompt
    ), { tone: 'info', label: 'Chat' });
    return true;
  }
  if (action === 'ask_clarifying_question') {
    const intakeQuestions = normalizeLlmIntakeQuestions(result.intake_questions || result.intakeQuestions || []);
    const leaderTaskType = leaderTaskTypeFromIntentResult(prompt, result);
    if (leaderTaskType && intakeQuestions.length >= 3) {
      startIntake({
        status: 'needs_input',
        needs_input: true,
        reason: 'leader_context_required',
        inferred_task_type: leaderTaskType,
        prompt,
        questions: intakeQuestions,
        message: looksJapanese(prompt)
          ? 'リーダーが提案前に確認したい内容です。まだ実行も課金もしていません。'
          : 'The leader needs this context before proposing. Nothing has run or been billed yet.',
        conversationOwner: {
          type: 'leader',
          taskType: leaderTaskType,
          label: taskLabel(leaderTaskType),
          reason: result.summary || 'OpenAI-generated leader intake.'
        },
        intake: {
          originalPrompt: prompt,
          taskType: leaderTaskType,
          questions: intakeQuestions,
          questionSource: 'openai'
        }
      }, prompt);
      return true;
    }
    appendTextMessage('assistant', [
      result.summary || '',
      result.narrowing_question || chatText(
        'What should the final output look like?',
        '最終的にどんな形のアウトプットが欲しいですか？',
        prompt
      ),
      '',
      chatText('No order or billing happened yet.', 'まだ注文も課金も発生していません。', prompt)
    ].filter(Boolean).join('\n'), { tone: 'info', label: 'Chat' });
    return true;
  }
  if (action === 'prepare_order' || action === 'use_previous_brief') {
    const brief = String(result.order_brief || '').trim();
    if (promptInjectionGuard(brief || prompt).blocked) {
      handlePromptInjectionInput(brief || prompt);
      return true;
    }
    await prepareOrder(brief || prompt, { originalPrompt: prompt, intakeChecked: true });
    return true;
  }
  return false;
}

function addChatAdjustmentToDraft(prompt = '') {
  const text = String(prompt || '').trim();
  if (!state.draft || !text) return false;
  const label = looksJapanese(text) ? '追加調整' : 'User adjustment';
  state.draft.prompt = [state.draft.prompt, `${label}:\n${text}`].filter(Boolean).join('\n\n');
  state.draft.updatedAt = new Date().toISOString();
  state.draftRevision += 1;
  appendOrderConfirmation({ updated: true });
  return true;
}

function handleNonOrderConversation(prompt = '') {
  const text = String(prompt || '').trim();
  if (!text || !isNonOrderConversationIntentText(text)) return false;
  if (isLeaderCatalogQuestionIntentText(text)) {
    appendTextMessage('assistant', leaderCatalogChatAnswer(text), { tone: 'info', label: 'Chat' });
    return true;
  }
  const ja = looksJapanese(text);
  const hasDraft = Boolean(state.draft);
  const hasIntake = Boolean(state.pendingIntake);
  const hasOrder = Boolean(state.orderId);
  if (/^(pause|hold|stop|later|not now|cancel|一旦保留|いったん保留|保留|あとで|後で|また後で|ストップ|止めて|中断|キャンセル|やめる|やっぱやめる|今はやめる)/i.test(text.replace(/[?？!！。.,、\s]+$/g, ''))) {
    state.pendingIntake = null;
    updateComposerMode();
  }
  appendTextMessage('assistant', ja
    ? [
      '発注外の会話として扱いました。新しいオーダーは作成していません。',
      '',
      hasOrder ? `直近のオーダー: ${state.orderId}` : '追跡中のオーダー: なし',
      hasDraft ? '準備済みの発注ドラフトは残っています。送る場合だけ SEND ORDER を押してください。' : '',
      hasIntake ? '確認質問は閉じました。必要ならもう一度依頼内容を書いてください。' : '',
      '続けて相談できます。'
    ].filter(Boolean).join('\n')
    : [
      'I treated that as chat, not an order. No new order was created.',
      '',
      hasOrder ? `Current order: ${state.orderId}` : 'Tracked order: none',
      hasDraft ? 'The prepared draft is still available. Press SEND ORDER only when you want to run it.' : '',
      hasIntake ? 'I closed the clarification state. Rewrite the request if you want to prepare it again.' : '',
      'You can keep discussing it here.'
    ].filter(Boolean).join('\n'), { tone: 'info', label: 'Chat' });
  return true;
}

async function prepareOrder(prompt, options = {}) {
  const prepared = await api('/api/work/prepare-order', {
    method: 'POST',
    body: JSON.stringify(chatEngineBuildPrepareOrderPayload(prompt, {
      requestedStrategy: 'auto',
      taskType: options.taskType || options.task_type || '',
      selectedAgentId: options.selectedAgentId || options.selected_agent_id || '',
      selectedAgentName: options.selectedAgentName || options.selected_agent_name || '',
      activeLeaderTaskType: options.activeLeaderTaskType || options.active_leader_task_type || state.activeLeader?.taskType || '',
      activeLeaderName: options.activeLeaderName || options.active_leader_name || state.activeLeader?.label || '',
      intakeAnswered: options.intakeAnswered === true
    }))
  });
  setConversationOwnerFromPrepared(prepared, { ...options, announce: true, sample: options.originalPrompt || prompt });
  if (isNeedsInputResponse(prepared)) {
    startIntake(prepared, prompt);
    return;
  }
  state.draft = chatEngineBuildOrderDraft(prompt, prepared, { ...options, intakeChecked: true });
  state.pendingIntake = null;
  state.draftRevision += 1;
  appendOrderConfirmation();
}

async function sendOrder() {
  if (!state.draft) return;
  setBusy(true);
  try {
    const acceptedDraft = state.draft;
    const actorLabel = activeActorLabel('CAIt');
    const payload = chatEngineBuildJobPayload(state.draft, {
      parentAgentId: 'chatux',
      source: 'chatux',
      visitorId: state.visitorId,
      budgetCap: 500,
      deadlineSec: 300,
      broker: {
        chatux: {
          delivery_channel: 'chat',
          return_path: CHATUX_RETURN_PATH,
          visitor_id: state.visitorId
        },
        intake: {
          prepared_in_chat: true,
          answered: acceptedDraft.intakeAnswered === true,
          checked_at: acceptedDraft.updatedAt || new Date().toISOString()
        }
      }
    });
    rememberPendingRecoveryPayload(payload);
    startDeliveryBackfillLoop();
    appendTextMessage('system', 'Sending order. I will keep polling and post progress here.');
    let created;
    try {
      created = await api('/api/jobs', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    } catch (error) {
      const recovered = await recoverAcceptedOrderAfterCreateError(payload, error);
      if (!recovered) throw error;
      created = recovered;
      appendTextMessage('assistant', 'Recovered the saved order after the create response failed. Switching to progress tracking.', { tone: 'ok', label: actorLabel });
    }
    if (isNeedsInputResponse(created)) {
      startIntake(created, state.draft?.originalPrompt || payload.prompt);
      return;
    }
    state.orderId = extractOrderId(created);
    if (state.orderId) {
      rememberTrackedOrder(state.orderId);
      clearPendingRecoveryPayload(payload);
    }
    rememberAiAgentsFromDraft(acceptedDraft, created, payload);
    state.draft = null;
    state.draftRevision += 1;
    updateComposerMode();
    appendTextMessage('assistant', [
      'Order accepted.',
      '',
      `Order ID: ${state.orderId || '-'}`,
      `Status: ${created.status || created.mode || 'created'}`,
      created.routing_reason ? `Route reason: ${created.routing_reason}` : ''
    ].filter(Boolean).join('\n'), { tone: 'ok', label: actorLabel });
    if (state.orderId) startPolling(state.orderId);
    else startDeliveryBackfillLoop({ maxRuns: 60 });
  } catch (error) {
    appendTextMessage('assistant', orderErrorMessage(error), { tone: 'error', label: 'Waiting' });
  } finally {
    setBusy(false);
  }
}

function orderErrorMessage(error) {
  const message = String(error?.message || 'Order failed.');
  if (error?.status === 401) {
    return `${message}\n\nSign in first, then return to this chat screen.\nGoogle: ${loginHref('google')}\nGitHub: ${loginHref('github')}`;
  }
  if (/payment|funding|deposit/i.test(message)) {
    return `${message}\n\nOpen the main app settings to add billing, then retry from this chat.`;
  }
  return message;
}

function xIdentityFromConnectorStatus(status = {}) {
  const x = status?.x && typeof status.x === 'object' ? status.x : {};
  const username = String(x.username || '').trim().replace(/^@+/, '');
  const userId = String(x.xUserId || x.providerUserId || '').trim();
  const displayName = String(x.displayName || '').trim();
  return {
    configured: x.configured !== false && x.encryptionConfigured !== false,
    connected: Boolean(x.connected && username),
    username,
    handle: username ? `@${username}` : '',
    userId,
    label: username ? `@${username}` : (displayName || userId || 'connected X account')
  };
}

async function postXDraftFromChat(jobId = '', postText = '') {
  const exactText = String(postText || '').trim();
  if (!exactText) {
    appendTextMessage('assistant', 'X post text is empty. Add the exact text first.', { tone: 'error', label: 'X action' });
    return;
  }
  if (exactText.length > 280) {
    appendTextMessage('assistant', `X post is ${exactText.length} characters. Shorten it to 280 or less before posting.`, { tone: 'error', label: 'X action' });
    return;
  }
  setBusy(true);
  try {
    const status = await api('/api/connectors/x/status', { method: 'GET' });
    const identity = xIdentityFromConnectorStatus(status);
    if (!identity.configured) {
      appendTextMessage('assistant', 'X OAuth is not configured for this environment, so CAIt cannot post from this chat yet.', { tone: 'error', label: 'X action' });
      return;
    }
    if (!identity.connected) {
      appendMessage('assistant', [
        'X is not connected yet.',
        '',
        `<a class="primary-btn inline-btn file-action" href="${escapeHtml(xAuthHref())}">Connect X</a>`,
        '<span class="chat-hint">After connecting, return here and press Post to X again. The draft will stay in this chat.</span>'
      ].join('\n'), { tone: 'warn', label: 'X action' });
      return;
    }
    const prompt = deliveryExecutionPromptPresentation('x_post', {
      postText: exactText,
      xAccountLabel: identity.label
    });
    if (!window.confirm(prompt.confirm)) {
      appendTextMessage('system', prompt.stopped || 'X execution stopped for this delivery.', { label: 'X action' });
      return;
    }
    const result = await api('/api/connectors/x/post', {
      method: 'POST',
      body: JSON.stringify({
        text: exactText,
        confirm_post: true,
        approved_x_username: identity.handle || identity.username || '',
        approved_x_user_id: identity.userId || '',
        approved_text: exactText,
        source: 'chatux_x_action_tool',
        job_id: String(jobId || '').trim()
      })
    });
    const postedUrl = String(result?.url || '').trim();
    appendTextMessage('assistant', [
      'Posted to X after explicit confirmation.',
      '',
      postedUrl || `Tweet ID: ${String(result?.tweet_id || '').trim() || '(returned without id)'}`,
      '',
      `Account: ${identity.label}`
    ].filter(Boolean).join('\n'), { tone: 'ok', label: 'X action' });
  } catch (error) {
    if (error?.status === 401) {
      appendTextMessage('assistant', [
        'Sign in is required before posting to X.',
        '',
        `Google: ${loginHref('google')}`,
        `GitHub: ${loginHref('github')}`
      ].join('\n'), { tone: 'error', label: 'X action' });
      return;
    }
    const data = error?.data && typeof error.data === 'object' ? error.data : {};
    const action = data?.action && typeof data.action === 'object' ? data.action : {};
    const next = String(data.required || action.message || action.href || '').trim();
    appendTextMessage('assistant', [
      String(error?.message || 'X post failed.'),
      next ? `Next: ${next}` : '',
      data.needs_connector ? 'Connect X, then press Post to X again from this card.' : ''
    ].filter(Boolean).join('\n\n'), { tone: 'error', label: 'X action' });
  } finally {
    setBusy(false);
  }
}

function startPolling(orderId) {
  if (state.polling) window.clearInterval(state.polling);
  let lastKey = '';
  let pollCount = 0;
  const tick = async () => {
    pollCount += 1;
    try {
      const result = await api(`/api/jobs/${encodeURIComponent(orderId)}?visitor_id=${encodeURIComponent(state.visitorId)}`);
      const job = result.job && typeof result.job === 'object' ? { ...result.job, id: result.job.id || orderId } : { id: orderId };
      const key = `${job.status}|${job.completedAt || ''}|${job.failedAt || ''}|${job.failureReason || ''}|${JSON.stringify(job.workflow?.statusCounts || {})}`;
      if (key !== lastKey) {
        lastKey = key;
        appendTextMessage('system', `Order ${orderId.slice(0, 8)}: ${statusLabel(job)}`);
      }
      if (isTerminalStatus(job.status)) {
        window.clearInterval(state.polling);
        state.polling = null;
        renderDeliveryOnce(job);
      }
      if (pollCount >= CHATUX_PROGRESS_MAX_POLLS) {
        window.clearInterval(state.polling);
        state.polling = null;
        appendTextMessage('system', 'Live progress polling reached its limit, so I switched to background order-history checks. No new order was created. Reload or ask for status to check again.');
        startDeliveryBackfillLoop({ maxRuns: 60 });
      }
    } catch (error) {
      window.clearInterval(state.polling);
      state.polling = null;
      appendTextMessage('assistant', orderErrorMessage(error), { tone: 'error', label: 'Progress stopped' });
      appendTextMessage('system', 'I will keep checking order history and post the delivery here if the work completes.');
      startDeliveryBackfillLoop({ maxRuns: 60 });
    }
  };
  void tick();
  state.polling = window.setInterval(tick, 3500);
}

function loginHref(provider) {
  const url = new URL(`/auth/${provider}`, window.location.origin);
  url.searchParams.set('return_to', CHATUX_RETURN_PATH);
  url.searchParams.set('login_source', 'chatux');
  url.searchParams.set('visitor_id', state.visitorId);
  return `${url.pathname}${url.search}`;
}

function xAuthHref() {
  const url = new URL('/auth/x', window.location.origin);
  url.searchParams.set('return_to', CHATUX_RETURN_PATH);
  url.searchParams.set('login_source', 'chatux');
  url.searchParams.set('visitor_id', state.visitorId);
  return `${url.pathname}${url.search}`;
}

async function signOut() {
  setBusy(true);
  try {
    const result = await api('/auth/logout', { method: 'POST' });
    state.auth = {};
    window.location.href = String(result?.redirect_to || '/').trim() || '/';
  } catch (error) {
    appendTextMessage('assistant', orderErrorMessage(error), { tone: 'error', label: 'Sign out' });
  } finally {
    setBusy(false);
  }
}

async function refreshAuth() {
  try {
    const auth = await api('/auth/status', { method: 'GET' });
    state.auth = auth || {};
    const loggedIn = Boolean(auth.loggedIn || auth.login || auth.user);
    if (!loggedIn) {
      const loginUrl = new URL('/login', window.location.origin);
      const nextPath = `${window.location.pathname === '/chat.html' ? CHATUX_RETURN_PATH : window.location.pathname}${window.location.search}${window.location.hash}`;
      loginUrl.searchParams.set('next', nextPath || CHATUX_RETURN_PATH);
      loginUrl.searchParams.set('source', 'gate_chat');
      window.location.replace(`${loginUrl.pathname}${loginUrl.search}`);
      return;
    }
    const login = auth.login || auth.user?.login || 'account';
    if (els.adminNavLink) els.adminNavLink.hidden = !(auth.isPlatformAdmin || auth.admin);
    els.authStatus.innerHTML = loggedIn
      ? `<span>Signed in as ${escapeHtml(login)}</span><button class="status-logout-btn" type="button" data-chat-logout>Sign out</button>`
      : `<a href="${escapeHtml(loginHref('google'))}">Google sign in</a> or <a href="${escapeHtml(loginHref('github'))}">GitHub sign in</a> to order`;
    warmUtilityCatalogs();
  } catch {
    els.authStatus.textContent = 'Session status unavailable.';
  } finally {
    startDeliveryBackfillLoop({ maxRuns: 6, renderTerminalDeliveries: false });
  }
}

function resetChat() {
  if (state.polling) window.clearInterval(state.polling);
  if (state.deliveryBackfill) window.clearInterval(state.deliveryBackfill);
  state.polling = null;
  state.deliveryBackfill = null;
  state.draft = null;
  state.pendingIntake = null;
  state.activeLeader = null;
  deliveryFileStore.clear();
  appTransferStore.clear();
  state.draftRevision += 1;
  state.orderId = '';
  els.chatThread.innerHTML = '';
  renderActiveLeaderStatus();
  appendTextMessage('assistant', CHATUX_WELCOME_TEXT);
  updateComposerMode();
  setBusy(false);
  startDeliveryBackfillLoop({ maxRuns: 6, renderTerminalDeliveries: false });
}

async function hydrateAppContextFromUrl() {
  const context = await consumeCaitAppContextForChat();
  if (!context) return false;
  appendMessage('assistant', caitAppContextThreadHtml(context), { label: 'App context', tone: 'ok' });
  els.promptInput.value = caitAppContextChatPrompt(context);
  els.promptInput.focus();
  return true;
}

els.composer.addEventListener('submit', async (event) => {
  event.preventDefault();
  const prompt = String(els.promptInput.value || '').trim();
  if (!prompt) return;
  els.promptInput.value = '';
  appendTextMessage('user', prompt);
  setBusy(true);
  try {
    const libraryScope = libraryCommandScope(prompt);
    const appCommandId = directAppCommandId(prompt);
    if (libraryScope) {
      await appendUsageLibrary(libraryScope);
    } else if (appCommandId) {
      openAppAgent(appCommandId, { source: 'chat_command' });
    } else if (/^(send|send order|発注|注文|実行)$/i.test(prompt) && state.draft) {
      await sendOrder();
    } else if (handlePromptInjectionInput(prompt)) {
      // blocked before intent classification, draft adjustment, or dispatch prep
    } else if (handleNonOrderConversation(prompt)) {
      // handled as chat, not a work order
    } else if (state.pendingIntake) {
      await answerPendingIntake(prompt);
    } else if (state.draft) {
      addChatAdjustmentToDraft(prompt);
    } else if (await handleChatIntentWithLlm(prompt)) {
      // OpenAI classified this as chat, clarification, or an order-ready brief.
    } else {
      await prepareOrder(prompt);
    }
  } catch (error) {
    appendTextMessage('assistant', orderErrorMessage(error), { tone: 'error' });
  } finally {
    setBusy(false);
  }
});

els.authStatus?.addEventListener('click', (event) => {
  if (event.target.closest('[data-chat-logout]')) void signOut();
});

els.chatThread.addEventListener('click', async (event) => {
  const appOpenButton = event.target.closest('[data-app-agent-open]');
  if (appOpenButton) {
    openAppAgent(appOpenButton.dataset.appAgentOpen || '', { source: 'chat_library_button' });
    return;
  }
  const appReuseButton = event.target.closest('[data-app-agent-reuse]');
  if (appReuseButton) {
    setBusy(true);
    try {
      await reuseAppAgent(appReuseButton.dataset.appAgentReuse || '');
    } catch (error) {
      appendTextMessage('assistant', orderErrorMessage(error), { tone: 'error', label: 'Library' });
    } finally {
      setBusy(false);
    }
    return;
  }
  const aiAgentReuseButton = event.target.closest('[data-ai-agent-reuse]');
  if (aiAgentReuseButton) {
    setBusy(true);
    try {
      await reuseAiAgent(aiAgentReuseButton.dataset.aiAgentReuse || '');
    } catch (error) {
      appendTextMessage('assistant', orderErrorMessage(error), { tone: 'error', label: 'Library' });
    } finally {
      setBusy(false);
    }
    return;
  }
  const appHandoffButton = event.target.closest('[data-app-agent-handoff]');
  if (appHandoffButton) {
    event.preventDefault();
    const appId = String(appHandoffButton.dataset.appAgentHandoff || '').trim();
    const transferId = String(appHandoffButton.dataset.appTransferId || '').trim();
    const manifest = appManifestById(appId);
    const payload = appTransferStore.get(transferId) || null;
    if (!manifest || !payload) {
      appendTextMessage('assistant', 'The app handoff context is no longer available. Reload the delivery or run the order again.', { tone: 'error', label: 'App handoff' });
      return;
    }
    setBusy(true);
    try {
      const handoffUrl = await createAppAgentHandoffUrl(appId, payload);
      if (!handoffUrl) throw new Error(`${manifest.name || 'App'} does not have an entry URL or handoff URL.`);
      appHandoffRememberDetails(appId, payload, handoffUrl, 'generic_app_handoff');
      window.open(handoffUrl, '_blank', 'noopener,noreferrer');
      appendTextMessage('system', `Sent CAIt transfer context to ${manifest.name || 'the registered app'} and opened the handoff URL.`, { label: 'App handoff' });
    } catch (error) {
      try {
        const contextUrl = await createAppAgentContextOpenUrl(appId, payload);
        appHandoffRememberDetails(appId, payload, contextUrl, 'generic_app_context_fallback');
        window.open(contextUrl, '_blank', 'noopener,noreferrer');
        appendTextMessage('assistant', `${manifest.name || 'App'} handoff API failed, so I created a server-side CAIt app context and opened the app with only the context id/token in the URL.\n\n${String(error?.message || error || '')}`, { tone: 'warn', label: 'App handoff' });
      } catch (fallbackError) {
        appendTextMessage('assistant', String(error?.message || error || 'App handoff failed.'), { tone: 'error', label: 'App handoff' });
      }
    } finally {
      setBusy(false);
    }
    return;
  }
  const xClientOpsLink = event.target.closest('[data-x-client-ops-link]');
  if (xClientOpsLink) {
    event.preventDefault();
    const card = xClientOpsLink.closest('.x-post-card');
    const textarea = card?.querySelector('[data-x-post-text]');
    const text = String(textarea?.value || '').trim();
    if (!text) {
      appendTextMessage('assistant', 'X post text is empty. Add the exact text first.', { tone: 'error', label: 'X action' });
      return;
    }
    if (text.length > 280) {
      appendTextMessage('assistant', `X post is ${text.length} characters. Shorten it to 280 or less before opening X Client Ops.`, { tone: 'error', label: 'X action' });
      return;
    }
    const fallbackUrl = new URL(xClientOpsLink.href || X_CLIENT_OPS_URL);
    fallbackUrl.searchParams.set('cait_x_post', text);
    fallbackUrl.searchParams.set('cait_source', textarea?.dataset.xPostSource || 'CAIt chat action');
    const transferId = String(xClientOpsLink.dataset.appTransferId || textarea?.dataset.appTransferId || '').trim();
    const transferPayload = transferId ? appTransferStore.get(transferId) || null : null;
    const payload = {
      ...(transferPayload || {}),
      ...xClientOpsPayloadFromUrl(fallbackUrl.toString()),
      text,
      source: textarea?.dataset.xPostSource || 'CAIt chat action',
      transfer_id: transferPayload?.transfer_id || transferId || '',
      settings: {
        ...((transferPayload?.settings && typeof transferPayload.settings === 'object') ? transferPayload.settings : {}),
        workspaceNotes: compactTransferText([
          transferPayload?.settings?.workspaceNotes || '',
          `Approved/current X draft:\n${text}`
        ].filter(Boolean).join('\n\n'), 2200)
      },
      context: transferPayload?.context || transferPayload?.transfer?.context || transferPayload?.transfer || null
    };
    setBusy(true);
    try {
      const handoffUrl = await createXClientOpsHandoffUrl(payload, fallbackUrl.toString());
      rememberAppAgentUsage('x-client-ops', {
        title: payload.title || 'CAIt final X post draft',
        lastHandoffUrl: handoffUrl,
        lastOrderId: payload.jobId || '',
        source: payload.source || 'CAIt chat action',
        product: payload.product || '',
        audience: payload.audience || '',
        goal: payload.goal || '',
        channel: payload.channel || '',
        lastContext: payload,
        lastTransfer: compactTransferObject(payload, { depth: 4, maxText: 700, maxArray: 8 })
      });
      window.open(handoffUrl, '_blank', 'noopener,noreferrer');
      appendTextMessage('system', 'Called X Client Ops directly and opened the generated handoff URL.', { label: 'X action' });
    } catch (error) {
      rememberAppAgentUsage('x-client-ops', {
        title: payload.title || 'CAIt final X post draft',
        lastHandoffUrl: fallbackUrl.toString(),
        lastOrderId: payload.jobId || '',
        source: payload.source || 'CAIt chat action',
        product: payload.product || '',
        audience: payload.audience || '',
        goal: payload.goal || '',
        channel: payload.channel || '',
        lastContext: payload,
        lastTransfer: compactTransferObject(payload, { depth: 4, maxText: 700, maxArray: 8 })
      });
      window.open(fallbackUrl.toString(), '_blank', 'noopener,noreferrer');
      appendTextMessage('assistant', `X Client Ops API call failed, so I opened the fallback URL handoff instead.\n\n${String(error?.message || error || '')}`, { tone: 'warn', label: 'X action' });
    } finally {
      setBusy(false);
    }
    return;
  }
  const xCopyButton = event.target.closest('[data-x-post-copy]');
  if (xCopyButton) {
    const card = xCopyButton.closest('.x-post-card');
    const textarea = card?.querySelector('[data-x-post-text]');
    const text = String(textarea?.value || '').trim();
    void copyTextToClipboard(text)
      .then(() => appendTextMessage('system', 'Copied X post draft.'))
      .catch(() => appendTextMessage('assistant', 'Could not copy the X post draft.', { tone: 'error', label: 'X action' }));
    return;
  }
  const xSubmitButton = event.target.closest('[data-x-post-submit]');
  if (xSubmitButton) {
    const card = xSubmitButton.closest('.x-post-card');
    const textarea = card?.querySelector('[data-x-post-text]');
    void postXDraftFromChat(xSubmitButton.dataset.xPostSubmit || '', textarea?.value || '');
    return;
  }
  const fileButton = event.target.closest('[data-file-action]');
  if (fileButton) {
    const file = deliveryFileStore.get(String(fileButton.dataset.fileId || ''));
    if (!file) {
      appendTextMessage('system', 'This file is no longer available in the chat buffer.');
      return;
    }
    const action = String(fileButton.dataset.fileAction || '').trim();
    if (action === 'download') {
      downloadTextFile(file);
      appendTextMessage('system', `Downloaded ${file.name}.`);
    } else if (action === 'copy') {
      void copyTextToClipboard(file.content)
        .then(() => appendTextMessage('system', `Copied ${file.name}.`))
        .catch(() => appendTextMessage('assistant', `Could not copy ${file.name}. Use Download instead.`, { tone: 'error' }));
    }
    return;
  }
  const button = event.target.closest('[data-chat-action]');
  if (!button) return;
  const action = String(button.dataset.chatAction || '').trim();
  if (action === 'send-order') {
    void sendOrder();
  } else if (action === 'reset-chat') {
    resetChat();
  }
});

els.utilityModalBody?.addEventListener('click', async (event) => {
  const logoutButton = event.target.closest('[data-chat-logout]');
  if (logoutButton) {
    await signOut();
    return;
  }
  const openJobButton = event.target.closest('[data-utility-open-job]');
  if (openJobButton) {
    const jobId = String(openJobButton.dataset.utilityOpenJob || '').trim();
    if (jobId) {
      rememberTrackedOrder(jobId);
      closeUtilityModal();
      appendTextMessage('system', `Reopened order ${jobId.slice(0, 8)} from history.`);
      startPolling(jobId);
    }
    return;
  }
  const loadMoreButton = event.target.closest('[data-utility-load-more]');
  if (loadMoreButton) {
    await loadMoreUtilityCatalog(String(loadMoreButton.dataset.utilityLoadMore || '').trim());
    return;
  }
  const appContextLoadButton = event.target.closest('[data-app-context-load]');
  if (appContextLoadButton) {
    setBusy(true);
    try {
      await loadAppContextIntoChat(appContextLoadButton.dataset.appContextLoad || '');
    } catch (error) {
      appendTextMessage('assistant', orderErrorMessage(error), { tone: 'error', label: 'App context' });
    } finally {
      setBusy(false);
    }
    return;
  }
  const agentTaskButton = event.target.closest('[data-utility-agent-task]');
  if (agentTaskButton) {
    const task = String(agentTaskButton.dataset.utilityAgentTask || '').trim();
    const agentId = String(agentTaskButton.dataset.utilityAgentId || '').trim();
    const agentName = String(agentTaskButton.dataset.utilityAgentName || '').trim();
    if (task) {
      closeUtilityModal();
      const label = agentName || taskLabel(task);
      const prompt = `Use the selected worker "${label}" (${agentId || task}) for the next order.`;
      appendTextMessage('assistant', chatText(
        `I will prepare an order in chat using ${label}.`,
        `I will prepare an order in chat using ${label}.`,
        prompt
      ), { label: 'Workers' });
      setBusy(true);
      try {
        await prepareOrder(prompt, {
          originalPrompt: prompt,
          taskType: task,
          selectedAgentId: agentId,
          selectedAgentName: label
        });
      } catch (error) {
        appendTextMessage('assistant', orderErrorMessage(error), { tone: 'error', label: 'Workers' });
      } finally {
        setBusy(false);
      }
    }
    return;
  }
  const appOpenButton = event.target.closest('[data-app-agent-open]');
  if (appOpenButton) {
    openAppAgent(appOpenButton.dataset.appAgentOpen || '', { source: 'utility_apps_panel' });
    return;
  }
  const appReuseButton = event.target.closest('[data-app-agent-reuse]');
  if (appReuseButton) {
    setBusy(true);
    try {
      await reuseAppAgent(appReuseButton.dataset.appAgentReuse || '');
      closeUtilityModal();
    } catch (error) {
      appendTextMessage('assistant', orderErrorMessage(error), { tone: 'error', label: 'Library' });
    } finally {
      setBusy(false);
    }
    return;
  }
  const aiAgentReuseButton = event.target.closest('[data-ai-agent-reuse]');
  if (aiAgentReuseButton) {
    setBusy(true);
    try {
      await reuseAiAgent(aiAgentReuseButton.dataset.aiAgentReuse || '');
      closeUtilityModal();
    } catch (error) {
      appendTextMessage('assistant', orderErrorMessage(error), { tone: 'error', label: 'Library' });
    } finally {
      setBusy(false);
    }
  }
});

els.openChatListBtn?.addEventListener('click', () => {
  void showChatListPanel();
});

els.openWorkerListBtn?.addEventListener('click', () => {
  void showWorkerListPanel();
});

els.openAppListBtn?.addEventListener('click', () => { void showAppListPanel(); });
els.openInfoBtn?.addEventListener('click', showInfoPanel);
els.utilityModalCloseBtn?.addEventListener('click', closeUtilityModal);
els.utilityModal?.addEventListener('click', (event) => {
  if (event.target?.closest?.('[data-utility-close]')) closeUtilityModal();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && els.utilityModal && !els.utilityModal.hidden) closeUtilityModal();
});

els.resetBtn.addEventListener('click', resetChat);

renderActiveLeaderStatus();
updateComposerMode();
void hydrateAppContextFromUrl();
void refreshAuth();
