import http from 'node:http';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createLocalStorage } from './lib/storage.js';
import { buildAgentId, estimateBilling, estimateRunWindow, computeScore, inferTaskType, makeEvent, normalizeTaskTypes, nowIso } from './lib/shared.js';
import { MANIFEST_CANDIDATE_PATHS, normalizeManifest, parseAndValidateManifest, sanitizeManifestForPublic, validateManifest } from './lib/manifest.js';
import { verifyAgentByHealthcheck } from './lib/verify.js';

const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const storagePath = process.env.BROKER_STATE_PATH || join(process.cwd(), '.data', 'broker-state.json');
const storage = createLocalStorage(storagePath);
const sseClients = new Set();
const sessions = new Map();
const oauthStates = new Map();
const sessionSecret = process.env.SESSION_SECRET || 'dev-session-secret';
const githubClientId = process.env.GITHUB_CLIENT_ID || '';
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET || '';
const appVersion = process.env.APP_VERSION || '0.2.0';
const deployTarget = process.env.DEPLOY_TARGET || 'cloudflare-worker';

function json(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers });
  res.end(JSON.stringify(body, null, 2));
}
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => data += c);
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}
function parseCookies(req) {
  const raw = req.headers.cookie || '';
  return Object.fromEntries(raw.split(';').map(v => v.trim()).filter(Boolean).map(part => {
    const i = part.indexOf('=');
    return i === -1 ? [part, ''] : [part.slice(0, i), decodeURIComponent(part.slice(i + 1))];
  }));
}
function sign(value) {
  return createHmac('sha256', sessionSecret).update(value).digest('hex');
}
function makeSessionCookie(sessionId) {
  const payload = `${sessionId}.${sign(sessionId)}`;
  return `aiagent2_session=${encodeURIComponent(payload)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`;
}
function getSession(req) {
  const cookies = parseCookies(req);
  const raw = cookies.aiagent2_session;
  if (!raw) return null;
  const [id, signature] = String(raw).split('.');
  if (!id || !signature || sign(id) !== signature) return null;
  return sessions.get(id) || null;
}
function baseUrl(req) {
  const configured = (process.env.BASE_URL || '').trim();
  if (configured) return configured.replace(/\/$/, '');
  return `${(req.headers['x-forwarded-proto'] || 'http')}://${req.headers.host}`.replace(/\/$/, '');
}
function redirect(res, location, headers = {}) {
  res.writeHead(302, { Location: location, ...headers });
  res.end();
}
async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error_description || data.error || `Request failed (${response.status})`);
  return data;
}
async function fetchAllGithubRepos(token) {
  const headers = { authorization: `Bearer ${token}`, 'user-agent': 'aiagent2' };
  const collected = [];
  for (let page = 1; page <= 5; page += 1) {
    const url = `https://api.github.com/user/repos?per_page=100&page=${page}&sort=updated&visibility=all&affiliation=owner,collaborator,organization_member`;
    const repos = await fetchJson(url, { headers });
    if (!Array.isArray(repos) || !repos.length) break;
    collected.push(...repos);
    if (repos.length < 100) break;
  }
  const seen = new Set();
  return collected.filter(repo => {
    if (!repo?.full_name || seen.has(repo.full_name)) return false;
    seen.add(repo.full_name);
    return true;
  });
}
function serveStatic(res, path) {
  const file = join(process.cwd(), 'public', path === '/' ? 'index.html' : path.slice(1));
  if (!existsSync(file)) return false;
  res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'text/plain; charset=utf-8' });
  res.end(readFileSync(file));
  return true;
}
function sampleAgentPayload(kind, body = {}) {
  const prompt = String(body.goal || body.prompt || '').trim();
  const fallbackPrompt = prompt || 'No prompt provided.';
  const map = {
    research: {
      summary: `Research summary ready: ${fallbackPrompt}`,
      report: {
        summary: 'Research sample delivery',
        bullets: [
          '市場比較の要点を抽出',
          '価格帯と候補を整理',
          '次アクションを提案'
        ],
        nextAction: '必要なら詳細比較表に展開'
      },
      usage: { total_cost_basis: 72, compute_cost: 20, tool_cost: 12, labor_cost: 40, api_cost: 0 }
    },
    writer: {
      summary: `Writer draft ready: ${fallbackPrompt}`,
      report: {
        summary: 'Writer sample delivery',
        headline: 'まず試すべき3つの訴求',
        bullets: [
          'ベネフィット先出し',
          '不安解消を中盤に配置',
          'CTAを最後に明確化'
        ]
      },
      usage: { total_cost_basis: 64, labor_cost: 38, compute_cost: 16, tool_cost: 10, api_cost: 0 }
    },
    code: {
      summary: `Code implementation plan ready: ${fallbackPrompt}`,
      report: {
        summary: 'Code sample delivery',
        bullets: [
          '再現条件を確認',
          '修正箇所を分離',
          'テスト観点を列挙'
        ],
        nextAction: '修正パッチ作成へ進行可能'
      },
      usage: { total_cost_basis: 98, compute_cost: 42, labor_cost: 40, tool_cost: 16, api_cost: 0 }
    }
  };
  const picked = map[kind] || map.research;
  return {
    accepted: true,
    status: 'completed',
    summary: picked.summary,
    report: picked.report,
    files: [
      {
        name: `${kind}-delivery.md`,
        type: 'text/markdown',
        content: `# ${kind} delivery\n\n${picked.summary}`
      }
    ],
    usage: picked.usage,
    return_targets: ['chat', 'api']
  };
}
function broadcast(event) {
  const packet = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of sseClients) res.write(packet);
}
async function touchEvent(type, message, meta = {}) {
  const event = makeEvent(type, message, meta);
  await storage.mutate(async (state) => {
    state.events.push(event);
    if (state.events.length > 300) state.events = state.events.slice(-300);
  });
  broadcast(event);
  return event;
}
async function appendBillingAudit(job, billing, meta = {}) {
  if (!job || !billing) return null;
  const audit = {
    id: randomUUID(),
    kind: 'billing_audit',
    ts: nowIso(),
    jobId: job.id,
    agentId: job.assignedAgentId || meta.agentId || null,
    status: job.status,
    policyVersion: billing.policyVersion || 'billing-policy/v1',
    source: meta.source || 'unknown',
    billable: {
      totalCostBasis: billing.totalCostBasis,
      apiCost: billing.apiCost,
      costBasis: billing.costBasis,
      rates: billing.rates
    },
    settlement: {
      baseFee: billing.baseFee,
      premiumFee: billing.premiumFee,
      platformFee: billing.platformFee,
      agentPayout: billing.agentPayout,
      platformRevenue: billing.platformRevenue,
      total: billing.total
    }
  };
  await touchEvent('BILLING_AUDIT', `audit ${job.id.slice(0, 6)} total=${billing.total}`, audit);
  return audit;
}
function pickAgent(agents, taskType, budgetCap, requestedAgentId = '') {
  const verified = agents.filter(a => a.online && a.verificationStatus === 'verified');
  if (requestedAgentId) {
    const requested = verified.find(a => a.id === requestedAgentId);
    if (!requested) return { error: 'Requested agent is unavailable or not verified' };
    if (!requested.taskTypes.includes(taskType)) return { error: 'Requested agent does not support this task type' };
    return { agent: requested, score: computeScore(requested, taskType, budgetCap), selectionMode: 'manual' };
  }
  const autoPicked = verified
    .filter(a => a.taskTypes.includes(taskType))
    .map(agent => ({ agent, score: computeScore(agent, taskType, budgetCap), selectionMode: 'auto' }))
    .sort((a, b) => b.score - a.score)[0];
  return autoPicked || null;
}
function statsOf(state) {
  const completed = state.jobs.filter(j => j.actualBilling);
  const grossVolume = completed.reduce((n, j) => n + (j.actualBilling?.total || 0), 0);
  const api = completed.reduce((n, j) => n + (j.actualBilling?.apiCost || 0), 0);
  const rev = completed.reduce((n, j) => n + (j.actualBilling?.platformRevenue || 0), 0);
  const retryableRuns = state.jobs.filter(j => j.dispatch?.retryable === true).length;
  const timedOutRuns = state.jobs.filter(j => j.status === 'timed_out').length;
  const terminalRuns = state.jobs.filter(j => ['completed', 'failed', 'timed_out'].includes(j.status)).length;
  const nextRetryAt = state.jobs
    .map(j => j.dispatch?.nextRetryAt || null)
    .filter(Boolean)
    .sort()[0] || null;
  return {
    activeJobs: state.jobs.filter(j => ['queued', 'claimed', 'running', 'dispatched'].includes(j.status)).length,
    onlineAgents: state.agents.filter(a => a.online).length,
    grossVolume: +grossVolume.toFixed(1),
    todayCost: +api.toFixed(1),
    platformRevenue: +rev.toFixed(1),
    failedJobs: state.jobs.filter(j => j.status === 'failed').length,
    retryableRuns,
    timedOutRuns,
    terminalRuns,
    nextRetryAt,
    totalJobs: state.jobs.length
  };
}
function publicAgent(agent) {
  const { token, ...rest } = agent;
  const cloned = structuredClone(rest);
  if (cloned.metadata?.manifest) cloned.metadata.manifest = sanitizeManifestForPublic(cloned.metadata.manifest);
  return cloned;
}
function createAgentFromInput(body = {}) {
  const taskTypes = normalizeTaskTypes(body.task_types || body.taskTypes || 'summary');
  const verificationStatus = body.verification_status || body.verificationStatus || 'legacy_unverified';
  const verificationCheckedAt = body.verification_checked_at || body.verificationCheckedAt || null;
  const verificationError = body.verification_error || body.verificationError || null;
  const verificationDetails = body.verification_details || body.verificationDetails || null;
  return {
    id: buildAgentId(body.name || 'agent'),
    name: String(body.name || 'custom_agent').toUpperCase(),
    description: body.description || 'Custom registered agent.',
    taskTypes: taskTypes.length ? taskTypes : ['summary'],
    premiumRate: Number(body.premium_rate ?? body.premiumRate ?? 0.1),
    basicRate: Number(body.basic_rate ?? body.basicRate ?? 0.1),
    successRate: Number(body.success_rate ?? body.successRate ?? 0.9),
    avgLatencySec: Number(body.avg_latency_sec ?? body.avgLatencySec ?? 20),
    online: true,
    token: `secret_${randomUUID().slice(0, 8)}`,
    earnings: 0,
    owner: body.owner || 'samurai',
    manifestUrl: body.manifest_url || body.manifestUrl || null,
    manifestSource: body.manifest_source || body.manifestSource || null,
    metadata: body.metadata || {},
    verificationStatus,
    verificationCheckedAt,
    verificationError,
    verificationDetails,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
}
function createAgentFromManifest(manifest, ownerInfo = { owner: 'samurai', metadata: {} }, options = {}) {
  return createAgentFromInput({
    name: manifest.name,
    description: manifest.description || `Imported from manifest ${options.manifestUrl || ''}`.trim(),
    task_types: manifest.taskTypes,
    premium_rate: manifest.premiumRate,
    basic_rate: manifest.basicRate,
    success_rate: manifest.successRate,
    avg_latency_sec: manifest.avgLatencySec,
    owner: manifest.owner || ownerInfo.owner,
    manifest_url: options.manifestUrl || manifest.sourceUrl || null,
    manifest_source: options.manifestSource || 'manifest',
    verification_status: options.verificationStatus || 'manifest_loaded',
    metadata: {
      ...ownerInfo.metadata,
      ...(manifest.metadata || {}),
      importMode: options.importMode || 'manifest',
      manifest: {
        ...manifest.raw,
        schema_version: manifest.schemaVersion,
        task_types: manifest.taskTypes,
        healthcheckUrl: manifest.healthcheckUrl || '',
        verification: manifest.verification || {},
        sourceUrl: options.manifestUrl || manifest.sourceUrl || null,
        endpoints: manifest.raw?.endpoints && typeof manifest.raw.endpoints === 'object' ? manifest.raw.endpoints : {},
        jobEndpoint: manifest.raw?.jobEndpoint || manifest.raw?.job_endpoint || manifest.raw?.endpoints?.jobs || ''
      }
    }
  });
}
function normalizeUsageForBilling(rawUsage, fallbackApiCost = 100) {
  if (rawUsage && typeof rawUsage === 'object') {
    return {
      ...rawUsage,
      api_cost: rawUsage.api_cost ?? rawUsage.apiCost,
      total_cost_basis: rawUsage.total_cost_basis ?? rawUsage.totalCostBasis,
      cost_basis: rawUsage.cost_basis ?? rawUsage.costBasis
    };
  }
  return { api_cost: Number(fallbackApiCost || 100) };
}
function isAgentVerified(agent) {
  return agent?.verificationStatus === 'verified';
}
function resolveAgentJobEndpoint(agent) {
  const manifest = agent?.metadata?.manifest || {};
  const endpoints = manifest.endpoints && typeof manifest.endpoints === 'object' ? manifest.endpoints : {};
  const candidates = [
    manifest.jobEndpoint,
    manifest.job_endpoint,
    manifest.jobsUrl,
    manifest.jobs_url,
    endpoints.jobs,
    endpoints.job,
    endpoints.dispatch,
    endpoints.submit
  ];
  for (const candidate of candidates) {
    const value = String(candidate || '').trim();
    if (value) return value;
  }
  return '';
}
function buildDispatchPayload(job, agent) {
  return {
    job_id: job.id,
    task_type: job.taskType,
    prompt: job.prompt,
    input: job.input || {},
    parent_agent_id: job.parentAgentId,
    assigned_agent_id: agent.id,
    budget_cap: job.budgetCap,
    deadline_sec: job.deadlineSec,
    priority: job.priority,
    created_at: job.createdAt,
    callback_url: agent?.metadata?.brokerCallbackUrl || null,
    callback_token: job.callbackToken || null,
    return_targets: ['api']
  };
}
function callbackTokenForJob(job) {
  return sign(`callback:${job.id}:${job.assignedAgentId || 'unassigned'}`);
}
function extractCallbackToken(req, body = {}) {
  const auth = String(req.headers.authorization || '').trim();
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  const headerToken = String(req.headers['x-callback-token'] || '').trim();
  if (headerToken) return headerToken;
  return String(body.callback_token || '').trim();
}
const JOB_TRANSITIONS = {
  claim: ['queued', 'dispatched', 'running', 'claimed'],
  callback: ['claimed', 'running', 'dispatched'],
  manualResult: ['queued', 'claimed', 'running', 'dispatched'],
  retry: ['failed', 'timed_out', 'dispatched', 'queued'],
  timeout: ['queued', 'claimed', 'running', 'dispatched'],
  complete: ['queued', 'claimed', 'running', 'dispatched'],
  fail: ['queued', 'claimed', 'running', 'dispatched']
};
function normalizeJobStatus(status) {
  return String(status || '').trim().toLowerCase();
}
function isTerminalJobStatus(status) {
  return ['completed', 'failed', 'timed_out'].includes(normalizeJobStatus(status));
}
function canTransitionJob(job, action) {
  const status = normalizeJobStatus(job?.status);
  const allowed = JOB_TRANSITIONS[action] || [];
  return allowed.includes(status);
}
function transitionErrorCode(job, action) {
  if (isTerminalJobStatus(job?.status)) return 'job_already_terminal';
  if (action === 'callback') return 'invalid_callback_transition';
  return 'invalid_job_transition';
}
function canCallbackMutateJob(job) {
  return canTransitionJob(job, 'callback');
}
function normalizeDispatchResponse(responseBody = {}) {
  const body = responseBody && typeof responseBody === 'object' ? responseBody : {};
  const status = String(body.status || '').trim().toLowerCase();
  const accepted = body.accepted === true || status === 'accepted' || status === 'queued' || status === 'running' || status === 'dispatched';
  const completed = status === 'completed' || Boolean(body.report || body.output || body.summary || (Array.isArray(body.files) && body.files.length));
  return {
    accepted,
    completed,
    status: completed ? 'completed' : (status || (accepted ? 'accepted' : 'unknown')),
    report: body.report || body.output || { summary: body.summary || 'No report provided.' },
    files: Array.isArray(body.files) ? body.files : [],
    returnTargets: body.return_targets || body.returnTargets || ['api'],
    usage: normalizeUsageForBilling(body.usage, 100),
    externalJobId: body.external_job_id || body.remote_job_id || body.job_id || null,
    raw: body
  };
}
function normalizeCallbackPayload(body = {}) {
  const payload = body && typeof body === 'object' ? body : {};
  const status = String(payload.status || (payload.failure_reason || payload.error ? 'failed' : 'completed')).trim().toLowerCase();
  const normalizedStatus = status === 'failed' ? 'failed' : 'completed';
  return {
    status: normalizedStatus,
    report: payload.report || payload.output || { summary: payload.summary || (normalizedStatus === 'failed' ? 'Agent reported failure' : 'No report provided.') },
    files: Array.isArray(payload.files) ? payload.files : [],
    usage: normalizeUsageForBilling(payload.usage, 100),
    returnTargets: payload.return_targets || payload.returnTargets || ['chat', 'api', 'webhook'],
    externalJobId: payload.external_job_id || payload.remote_job_id || null,
    failureReason: payload.failure_reason || payload.error || null,
    raw: payload
  };
}
function classifyDispatchFailure(statusCode, errorMessage = '') {
  const msg = String(errorMessage || '').toLowerCase();
  if (msg.includes('timed out') || msg.includes('timeout')) return { category: 'dispatch_timeout', retryable: true };
  if (statusCode >= 500) return { category: 'dispatch_http_5xx', retryable: true };
  if (statusCode >= 400) return { category: 'dispatch_http_4xx', retryable: false };
  if (msg.includes('malformed') || msg.includes('json')) return { category: 'dispatch_malformed_response', retryable: false };
  if (msg.includes('endpoint')) return { category: 'dispatch_misconfigured_endpoint', retryable: false };
  return { category: 'dispatch_error', retryable: true };
}
function computeNextRetryAt(attempts, baseTime = Date.now()) {
  const retryDelaySec = Math.min(300, Math.max(5, 5 * (2 ** Math.max(0, attempts - 1))));
  return new Date(baseTime + retryDelaySec * 1000).toISOString();
}
function maxDispatchRetriesForJob(job) {
  const explicit = Number(job?.dispatch?.maxRetries);
  if (Number.isFinite(explicit) && explicit >= 0) return explicit;
  return 3;
}
function canRetryDispatch(job) {
  const attempts = Number(job?.dispatch?.attempts || 0);
  return attempts < maxDispatchRetriesForJob(job);
}
function buildDispatchFailureMeta(job, statusCode, errorMessage = '') {
  const classified = classifyDispatchFailure(statusCode, errorMessage);
  const attempts = Number(job?.dispatch?.attempts || 0) + 1;
  const retryable = classified.retryable && canRetryDispatch({ ...job, dispatch: { ...(job?.dispatch || {}), attempts } });
  return {
    category: classified.category,
    retryable,
    attempts,
    nextRetryAt: retryable ? computeNextRetryAt(attempts) : null
  };
}
async function failJob(jobId, reason, extraLogs = [], options = {}) {
  return storage.mutate(async (draft) => {
    const job = draft.jobs.find(j => j.id === jobId);
    if (!job) return null;
    if (isTerminalJobStatus(job.status)) return job;
    const failureStatus = options.failureStatus || (job.status === 'dispatched' ? 'timed_out' : 'failed');
    const failedAt = nowIso();
    job.status = failureStatus;
    if (failureStatus === 'timed_out') job.timedOutAt = failedAt;
    job.failedAt = failedAt;
    job.lastCallbackAt = options.source === 'callback' ? failedAt : (job.lastCallbackAt || null);
    job.failureReason = reason;
    job.failureCategory = options.failureCategory || job.failureCategory || 'agent_failed';
    job.dispatch = {
      ...(job.dispatch || {}),
      externalJobId: options.externalJobId || job.dispatch?.externalJobId || null,
      completionSource: options.source || job.dispatch?.completionSource || null,
      completionStatus: failureStatus,
      failedAt,
      lastCallbackAt: options.source === 'callback' ? failedAt : (job.dispatch?.lastCallbackAt || null),
      retryable: options.retryable ?? job.dispatch?.retryable ?? false,
      nextRetryAt: options.nextRetryAt ?? job.dispatch?.nextRetryAt ?? null,
      attempts: options.attempts ?? job.dispatch?.attempts ?? 0
    };
    for (const line of extraLogs) job.logs.push(line);
    job.logs.push(reason);
    return job;
  });
}
async function completeJobFromAgentResult(jobId, agentId, payload = {}, meta = {}) {
  return storage.mutate(async (state) => {
    const job = state.jobs.find(j => j.id === jobId);
    if (!job) return { error: 'Job not found', statusCode: 404 };
    if (isTerminalJobStatus(job.status)) {
      return {
        error: `Job is already terminal (${job.status})`,
        statusCode: 409,
        code: 'job_already_terminal',
        job
      };
    }
    if (meta.source === 'callback' && !canTransitionJob(job, 'callback')) {
      return {
        error: `Job status ${job.status} cannot be changed by callback`,
        statusCode: 409,
        code: transitionErrorCode(job, 'callback'),
        job
      };
    }
    if (meta.source === 'manual-result' && !canTransitionJob(job, 'manualResult')) {
      return {
        error: `Job status ${job.status} cannot be changed by manual result`,
        statusCode: 409,
        code: transitionErrorCode(job, 'manualResult'),
        job
      };
    }
    const agent = state.agents.find(a => a.id === agentId);
    if (!agent) return { error: 'Agent not found', statusCode: 404 };
    if (!isAgentVerified(agent)) return { error: 'Agent is not verified', statusCode: 403 };
    if (job.assignedAgentId && job.assignedAgentId !== agent.id) return { error: 'Invalid assignment', statusCode: 401 };
    const usage = normalizeUsageForBilling(payload?.usage, 100);
    const billing = estimateBilling(agent, usage);
    const completionAt = nowIso();
    job.assignedAgentId = agent.id;
    job.startedAt = job.startedAt || completionAt;
    job.lastCallbackAt = meta.source === 'callback' ? completionAt : (job.lastCallbackAt || null);
    job.status = 'completed';
    job.output = {
      report: payload.report || payload.output || { summary: payload.summary || 'No report provided.' },
      files: Array.isArray(payload.files) ? payload.files : [],
      returnTargets: payload.return_targets || payload.returnTargets || ['chat', 'api', 'webhook']
    };
    job.completedAt = completionAt;
    job.usage = usage;
    job.actualBilling = billing;
    job.dispatch = {
      ...(job.dispatch || {}),
      externalJobId: meta.externalJobId || job.dispatch?.externalJobId || null,
      completionSource: meta.source || job.dispatch?.completionSource || null,
      completionStatus: 'completed',
      completedAt: completionAt,
      lastCallbackAt: meta.source === 'callback' ? completionAt : (job.dispatch?.lastCallbackAt || null)
    };
    job.logs.push(`completed by ${agent.id}`, `billed total=${billing.total}`);
    if (meta.source) job.logs.push(`completion source=${meta.source}`);
    if (meta.externalJobId) job.logs.push(`external_job_id=${meta.externalJobId}`);
    agent.earnings = +(Number(agent.earnings || 0) + billing.agentPayout).toFixed(1);
    return { ok: true, job, billing, agent };
  });
}
function billingAuditEvents(events = []) {
  return events
    .filter(event => event.type === 'BILLING_AUDIT' && event.meta?.kind === 'billing_audit')
    .map(event => ({ id: event.id, ...event.meta, message: event.message }));
}
function buildDispatchHeaders(agent) {
  const manifestAuth = agent?.metadata?.manifest?.auth;
  if (!manifestAuth || typeof manifestAuth !== 'object') return {};
  const type = String(manifestAuth.type || 'none').trim().toLowerCase();
  const token = String(manifestAuth.token || '').trim();
  if (!token || type === 'none') return {};
  if (type === 'bearer') {
    const prefix = String(manifestAuth.prefix || 'Bearer').trim() || 'Bearer';
    return { authorization: `${prefix} ${token}` };
  }
  if (type === 'header') {
    const headerName = String(manifestAuth.headerName || manifestAuth.header_name || '').trim();
    if (!headerName) return {};
    const prefix = String(manifestAuth.prefix || '').trim();
    return { [headerName]: prefix ? `${prefix} ${token}` : token };
  }
  return {};
}
async function postJsonWithTimeout(url, payload, timeoutMs = 10000, extraHeaders = {}) {
  const controller = new AbortController();
  const timer = delay(timeoutMs, null, { signal: controller.signal }).then(() => controller.abort()).catch(() => {});
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', ...extraHeaders },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const text = await response.text();
    let body = {};
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        throw new Error(`Dispatch response was not valid JSON (${response.status})`);
      }
    }
    return { response, body };
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`Dispatch timed out after ${timeoutMs}ms`);
    throw error;
  } finally {
    controller.abort();
    await timer;
  }
}
async function dispatchJobToAssignedAgent(job, agent) {
  const endpoint = resolveAgentJobEndpoint(agent);
  if (!endpoint) {
    return { ok: false, failureReason: 'Assigned verified agent does not expose a job endpoint in manifest metadata' };
  }
  const payload = buildDispatchPayload(job, agent);
  const dispatchHeaders = buildDispatchHeaders(agent);
  const { response, body } = await postJsonWithTimeout(endpoint, payload, 10000, dispatchHeaders);
  if (!response.ok) {
    const reason = body?.error || body?.message || `Dispatch failed with status ${response.status}`;
    return { ok: false, endpoint, failureReason: reason, statusCode: response.status, responseBody: body };
  }
  const normalized = normalizeDispatchResponse(body);
  if (!normalized.accepted && !normalized.completed) {
    return { ok: false, endpoint, failureReason: 'Dispatch response was malformed or did not acknowledge the job', statusCode: response.status, responseBody: body };
  }
  return { ok: true, endpoint, normalized, statusCode: response.status, responseBody: body };
}
function makeGithubRawManifestUrl(owner, repo, branch, candidatePath) {
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${candidatePath}`;
}
async function fetchGithubManifestCandidate(sessionToken, owner, repo, branch, candidatePath) {
  const encodedPath = String(candidatePath).split('/').map(part => encodeURIComponent(part)).join('/');
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;
  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${sessionToken}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'aiagent2'
    }
  });
  if (response.status === 404) return { ok: false, status: 404, candidatePath };
  if (!response.ok) return { ok: false, status: response.status, candidatePath, error: `GitHub API returned ${response.status}` };
  const payload = await response.json().catch(() => ({}));
  const decoded = payload?.content ? Buffer.from(String(payload.content).replace(/\n/g, ''), 'base64').toString('utf8') : '';
  if (!decoded) return { ok: false, status: 422, candidatePath, error: 'Manifest candidate file is empty' };
  return {
    ok: true,
    candidatePath,
    manifestUrl: makeGithubRawManifestUrl(owner, repo, branch, candidatePath),
    contentType: payload?.type || ''
      ? (candidatePath.endsWith('.json') ? 'application/json' : candidatePath.endsWith('.yaml') ? 'application/yaml' : '')
      : '',
    text: decoded
  };
}
function validateManifestUrlInput(manifestUrl) {
  let parsed;
  try {
    parsed = new URL(String(manifestUrl || ''));
  } catch {
    throw new Error('manifest_url must be a valid URL');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('manifest_url must use http or https');
  const isLocalHost = ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname);
  const allowLocal = process.env.ALLOW_LOCAL_MANIFEST_URLS === '1';
  if (isLocalHost && !allowLocal) throw new Error('Local manifest URLs are disabled unless ALLOW_LOCAL_MANIFEST_URLS=1');
  return parsed.toString();
}
async function loadManifestFromUrl(manifestUrl) {
  const safeManifestUrl = validateManifestUrlInput(manifestUrl);
  const response = await fetch(safeManifestUrl, { headers: { accept: 'application/json, application/yaml;q=0.9, text/plain;q=0.8' } });
  if (!response.ok) throw new Error(`Manifest fetch failed (${response.status})`);
  const text = await response.text();
  return parseAndValidateManifest(text, { contentType: response.headers.get('content-type') || '', sourceUrl: safeManifestUrl });
}
async function migrateLegacyAgents() {
  await storage.mutate(async (state) => {
    for (const agent of state.agents) {
      if (!agent.verificationStatus) {
        agent.verificationStatus = 'legacy_unverified';
        agent.verificationCheckedAt = null;
        agent.verificationError = 'Legacy agent requires manifest verification';
        agent.verificationDetails = {
          category: 'legacy_agent',
          code: 'legacy_requires_manifest',
          reason: 'Legacy agent requires manifest verification'
        };
        agent.updatedAt = nowIso();
      }
    }
  });
}
function authStatus(req) {
  const session = getSession(req);
  return {
    loggedIn: Boolean(session?.user),
    githubConfigured: Boolean(githubClientId && githubClientSecret),
    user: session?.user || null
  };
}
function ownerFromRequest(req) {
  const session = getSession(req);
  const callbackBase = baseUrl(req);
  if (!session?.user) return { owner: 'samurai', metadata: { brokerCallbackUrl: `${callbackBase}/api/agent-callbacks/jobs` } };
  return {
    owner: session.user.login,
    metadata: {
      githubLogin: session.user.login,
      githubName: session.user.name,
      githubAvatarUrl: session.user.avatarUrl,
      githubProfileUrl: session.user.profileUrl,
      brokerCallbackUrl: `${callbackBase}/api/agent-callbacks/jobs`
    }
  };
}

async function snapshot(req) {
  const state = await storage.getState();
  return {
    stats: statsOf(state),
    agents: state.agents.map(publicAgent),
    jobs: state.jobs,
    events: state.events,
    billingAudits: billingAuditEvents(state.events),
    storage: { kind: storage.kind, supportsPersistence: storage.supportsPersistence, path: storagePath, note: storage.note || null },
    auth: authStatus(req)
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname.startsWith('/app') || url.pathname === '/styles.css' || url.pathname === '/client.js')) {
    if (serveStatic(res, url.pathname === '/' ? '/index.html' : url.pathname)) return;
  }
  if (req.method === 'GET' && url.pathname === '/auth/status') return json(res, 200, authStatus(req));
  if (req.method === 'GET' && url.pathname === '/auth/debug') {
    const callback = `${baseUrl(req)}/auth/github/callback`;
    return json(res, 200, {
      baseUrl: baseUrl(req),
      callback,
      githubConfigured: Boolean(githubClientId && githubClientSecret),
      githubScope: process.env.GITHUB_OAUTH_SCOPE || 'read:user user:email repo',
      hasClientId: Boolean(githubClientId),
      hasClientSecret: Boolean(githubClientSecret),
      host: req.headers.host,
      forwardedProto: req.headers['x-forwarded-proto'] || null
    });
  }
  if (req.method === 'GET' && url.pathname === '/auth/github') {
    if (!(githubClientId && githubClientSecret)) return json(res, 503, { error: 'GitHub OAuth is not configured yet. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.' });
    const state = randomBytes(16).toString('hex');
    oauthStates.set(state, { createdAt: Date.now() });
    const callback = `${baseUrl(req)}/auth/github/callback`;
    const githubScope = process.env.GITHUB_OAUTH_SCOPE || 'read:user user:email repo';
    const githubUrl = new URL('https://github.com/login/oauth/authorize');
    githubUrl.searchParams.set('client_id', githubClientId);
    githubUrl.searchParams.set('redirect_uri', callback);
    githubUrl.searchParams.set('scope', githubScope);
    githubUrl.searchParams.set('state', state);
    return redirect(res, githubUrl.toString());
  }
  if (req.method === 'GET' && url.pathname === '/auth/github/callback') {
    if (!(githubClientId && githubClientSecret)) return redirect(res, '/?auth_error=github_not_configured');
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (!code || !state || !oauthStates.has(state)) return redirect(res, '/?auth_error=invalid_oauth_state');
    oauthStates.delete(state);
    try {
      const callback = `${baseUrl(req)}/auth/github/callback`;
      const token = await fetchJson('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ client_id: githubClientId, client_secret: githubClientSecret, code, redirect_uri: callback, state })
      });
      const user = await fetchJson('https://api.github.com/user', {
        headers: { authorization: `Bearer ${token.access_token}`, 'user-agent': 'aiagent2' }
      });
      const sessionId = randomBytes(24).toString('hex');
      sessions.set(sessionId, {
        user: {
          id: user.id,
          login: user.login,
          name: user.name,
          avatarUrl: user.avatar_url,
          profileUrl: user.html_url
        },
        githubAccessToken: token.access_token,
        createdAt: Date.now()
      });
      return redirect(res, '/', { 'Set-Cookie': makeSessionCookie(sessionId) });
    } catch (error) {
      return redirect(res, `/?auth_error=${encodeURIComponent(error.message)}`);
    }
  }
  if (req.method === 'POST' && url.pathname === '/auth/logout') {
    const cookies = parseCookies(req);
    const raw = cookies.aiagent2_session;
    const [id] = String(raw || '').split('.');
    if (id) sessions.delete(id);
    return json(res, 200, { ok: true }, { 'Set-Cookie': 'aiagent2_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' });
  }
  if (req.method === 'GET' && url.pathname === '/api/github/repos') {
    const session = getSession(req);
    if (!session?.githubAccessToken) return json(res, 401, { error: 'Login required' });
    try {
      const repos = await fetchAllGithubRepos(session.githubAccessToken);
      return json(res, 200, {
        repos: repos.map(repo => ({
          id: repo.id,
          name: repo.name,
          fullName: repo.full_name,
          description: repo.description,
          private: repo.private,
          defaultBranch: repo.default_branch,
          htmlUrl: repo.html_url,
          owner: repo.owner?.login
        }))
      });
    } catch (error) {
      return json(res, 500, { error: error.message });
    }
  }
  if (req.method === 'POST' && url.pathname === '/api/github/load-manifest') {
    const session = getSession(req);
    if (!session?.githubAccessToken) return json(res, 401, { error: 'Login required' });
    const body = await parseBody(req).catch(err => ({ __error: err.message }));
    if (body.__error) return json(res, 400, { error: body.__error });
    if (!body.owner || !body.repo) return json(res, 400, { error: 'owner and repo required' });
    try {
      const headers = { authorization: `Bearer ${session.githubAccessToken}`, 'user-agent': 'aiagent2' };
      const repoMeta = await fetchJson(`https://api.github.com/repos/${body.owner}/${body.repo}`, { headers });
      const attempts = [];
      let manifest = null;
      let selectedCandidate = null;
      for (const candidatePath of MANIFEST_CANDIDATE_PATHS) {
        const loaded = await fetchGithubManifestCandidate(session.githubAccessToken, body.owner, body.repo, repoMeta.default_branch, candidatePath);
        if (!loaded.ok) {
          attempts.push({ path: candidatePath, status: loaded.status, error: loaded.error || null });
          continue;
        }
        try {
          manifest = parseAndValidateManifest(loaded.text, { contentType: loaded.contentType, sourceUrl: loaded.manifestUrl });
          selectedCandidate = loaded;
          attempts.push({ path: candidatePath, status: 200, parsed: true });
          break;
        } catch (error) {
          attempts.push({ path: candidatePath, status: 422, error: error.message });
        }
      }
      if (!manifest || !selectedCandidate) {
        return json(res, 404, { error: 'No valid manifest found in candidate files', candidate_paths: MANIFEST_CANDIDATE_PATHS.filter(p => p.endsWith('.json')), attempts });
      }
      const ownerInfo = ownerFromRequest(req);
      const agent = createAgentFromManifest(manifest, ownerInfo, {
        manifestUrl: selectedCandidate.manifestUrl,
        manifestSource: `github:${repoMeta.full_name}:${selectedCandidate.candidatePath}`,
        verificationStatus: 'manifest_loaded',
        importMode: 'github-manifest-candidate'
      });
      await storage.mutate(async (state) => { state.agents.unshift(agent); });
      await touchEvent('REGISTERED', `${agent.name} manifest loaded from ${repoMeta.full_name}/${selectedCandidate.candidatePath}`);
      return json(res, 201, {
        ok: true,
        agent,
        repo: { fullName: repoMeta.full_name, private: repoMeta.private },
        manifest_url: selectedCandidate.manifestUrl,
        candidate_path: selectedCandidate.candidatePath,
        candidate_paths_checked: MANIFEST_CANDIDATE_PATHS.filter(p => p.endsWith('.json')),
        attempts
      });
    } catch (error) {
      return json(res, 500, { error: error.message });
    }
  }
  if (req.method === 'POST' && url.pathname === '/api/github/import-repo') {
    return json(res, 410, {
      error: 'Deprecated endpoint. Repository analysis import is disabled.',
      use: '/api/github/load-manifest'
    });
  }
  if (req.method === 'GET' && url.pathname === '/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    sseClients.add(res);
    const state = await storage.getState();
    for (const event of state.events.slice(-25)) res.write(`data: ${JSON.stringify(event)}\n\n`);
    req.on('close', () => sseClients.delete(res));
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { ok: true, service: 'aiagent2', version: appVersion, deploy_target: deployTarget, time: nowIso() });
  if (req.method === 'GET' && url.pathname === '/api/ready') return json(res, 200, { ok: true, ready: true, storage: { kind: storage.kind, supportsPersistence: storage.supportsPersistence }, version: appVersion, deploy_target: deployTarget, time: nowIso() });
  if (req.method === 'GET' && url.pathname === '/api/version') return json(res, 200, { ok: true, version: appVersion, deploy_target: deployTarget, node: process.version, time: nowIso() });
  if (req.method === 'GET' && url.pathname === '/api/metrics') {
    const snap = await snapshot(req);
    return json(res, 200, {
      ok: true,
      version: appVersion,
      deploy_target: deployTarget,
      stats: snap.stats,
      storage: snap.storage,
      billing_audit_count: (snap.billingAudits || []).length,
      event_count: (snap.events || []).length,
      time: nowIso()
    });
  }
  if (req.method === 'GET' && url.pathname === '/mock/research/health') return json(res, 200, { ok: true, service: 'sample_research_agent', kind: 'research', time: nowIso() });
  if (req.method === 'GET' && url.pathname === '/mock/writer/health') return json(res, 200, { ok: true, service: 'sample_writer_agent', kind: 'writer', time: nowIso() });
  if (req.method === 'GET' && url.pathname === '/mock/code/health') return json(res, 200, { ok: true, service: 'sample_code_agent', kind: 'code', time: nowIso() });
  if (req.method === 'POST' && url.pathname === '/mock/research/jobs') {
    const body = await parseBody(req).catch(err => ({ __error: err.message }));
    if (body.__error) return json(res, 400, { error: body.__error });
    return json(res, 200, sampleAgentPayload('research', body));
  }
  if (req.method === 'POST' && url.pathname === '/mock/writer/jobs') {
    const body = await parseBody(req).catch(err => ({ __error: err.message }));
    if (body.__error) return json(res, 400, { error: body.__error });
    return json(res, 200, sampleAgentPayload('writer', body));
  }
  if (req.method === 'POST' && url.pathname === '/mock/code/jobs') {
    const body = await parseBody(req).catch(err => ({ __error: err.message }));
    if (body.__error) return json(res, 400, { error: body.__error });
    return json(res, 200, sampleAgentPayload('code', body));
  }
  if (req.method === 'POST' && url.pathname === '/mock/accepted/jobs') {
    const body = await parseBody(req).catch(err => ({ __error: err.message }));
    if (body.__error) return json(res, 400, { error: body.__error });
    return json(res, 202, { accepted: true, status: 'accepted', external_job_id: `remote-${String(body.job_id || '').slice(0, 8)}` });
  }
  if (req.method === 'GET' && url.pathname === '/api/snapshot') return json(res, 200, await snapshot(req));
  if (req.method === 'GET' && url.pathname === '/api/schema') return json(res, 200, { schema: storage.schemaSql });
  if (req.method === 'GET' && url.pathname === '/api/stats') return json(res, 200, (await snapshot(req)).stats);
  if (req.method === 'GET' && url.pathname === '/api/agents') return json(res, 200, { agents: (await snapshot(req)).agents });
  if (req.method === 'GET' && url.pathname === '/api/jobs') return json(res, 200, { jobs: (await snapshot(req)).jobs });
  if (req.method === 'GET' && url.pathname === '/api/billing-audits') return json(res, 200, { billing_audits: (await snapshot(req)).billingAudits });
  if (req.method === 'GET' && url.pathname.startsWith('/api/jobs/')) {
    const id = url.pathname.split('/').pop();
    const state = await storage.getState();
    const job = state.jobs.find(j => j.id === id);
    return job ? json(res, 200, job) : json(res, 404, { error: 'Job not found' });
  }
  if (req.method === 'POST' && url.pathname === '/api/agent-callbacks/jobs') {
    const body = await parseBody(req).catch(err => ({ __error: err.message }));
    if (body.__error) return json(res, 400, { error: body.__error });
    if (!body.job_id || !body.agent_id) return json(res, 400, { error: 'job_id and agent_id required' });
    const callback = normalizeCallbackPayload(body);
    const current = await storage.getState();
    const job = current.jobs.find(j => j.id === body.job_id);
    if (!job) return json(res, 404, { error: 'Job not found' });
    if (job.assignedAgentId !== body.agent_id) return json(res, 401, { error: 'Invalid assignment' });
    if (!canTransitionJob(job, 'callback')) {
      const code = transitionErrorCode(job, 'callback');
      return json(res, 409, { error: `Job status ${job.status} cannot be changed by callback`, code, job_status: job.status });
    }
    const providedToken = extractCallbackToken(req, body);
    if (!providedToken || providedToken !== job.callbackToken) return json(res, 403, { error: 'Invalid callback token' });
    if (callback.status === 'failed') {
      if (isTerminalJobStatus(job.status)) {
        return json(res, 409, { error: `Job is already terminal (${job.status})`, code: 'job_already_terminal', job_status: job.status });
      }
      const failed = await failJob(body.job_id, callback.failureReason || 'Agent reported failure', [`failed by ${body.agent_id}`, 'failure source=callback'], { failureStatus: 'failed', failureCategory: 'agent_failed', source: 'callback', externalJobId: callback.externalJobId });
      if (!failed) return json(res, 404, { error: 'Job not found' });
      await touchEvent('FAILED', `${failed.taskType}/${failed.id.slice(0, 6)} failed by callback`);
      return json(res, 200, {
        ok: true,
        status: failed.status,
        job: failed,
        delivery: {
          report: null,
          files: [],
          returnTargets: []
        }
      });
    }
    const result = await completeJobFromAgentResult(body.job_id, body.agent_id, {
      report: callback.report,
      files: callback.files,
      usage: callback.usage,
      return_targets: callback.returnTargets
    }, { source: 'callback', externalJobId: callback.externalJobId });
    if (result.error) return json(res, result.statusCode || 400, { error: result.error, code: result.code || null, job_status: result.job?.status || null });
    await touchEvent('COMPLETED', `${result.job.taskType}/${result.job.id.slice(0, 6)} completed by callback`);
    await touchEvent('BILLED', `api=${result.billing.apiCost} total=${result.billing.total}`);
    await appendBillingAudit(result.job, result.billing, { source: 'callback' });
    return json(res, 200, {
      ok: true,
      status: result.job.status,
      job: result.job,
      billing: result.billing,
      delivery: {
        report: result.job.output?.report || null,
        files: result.job.output?.files || [],
        returnTargets: result.job.output?.returnTargets || ['chat', 'api', 'webhook']
      }
    });
  }
  if (req.method === 'POST' && url.pathname === '/api/agents') {
    const body = await parseBody(req).catch(err => ({ __error: err.message }));
    if (body.__error) return json(res, 400, { error: body.__error });
    if (!body.name) return json(res, 400, { error: 'name required' });
    const ownerInfo = ownerFromRequest(req);
    const agent = createAgentFromInput({ ...body, owner: body.owner || ownerInfo.owner, metadata: { ...(body.metadata || {}), ...ownerInfo.metadata } });
    await storage.mutate(async (state) => { state.agents.unshift(agent); });
    await touchEvent('REGISTERED', `${agent.name} registered with tasks ${agent.taskTypes.join(', ')}`);
    return json(res, 201, { ok: true, agent });
  }
  if (req.method === 'POST' && url.pathname === '/api/agents/import-manifest') {
    const body = await parseBody(req).catch(err => ({ __error: err.message }));
    if (body.__error) return json(res, 400, { error: body.__error });
    const manifest = normalizeManifest(body.manifest || {});
    const validation = validateManifest(manifest);
    if (!validation.ok) return json(res, 400, { error: validation.errors.join('; ') });
    const ownerInfo = ownerFromRequest(req);
    const agent = createAgentFromManifest(manifest, ownerInfo, { manifestSource: 'manifest-json', verificationStatus: 'manifest_loaded', importMode: 'manifest-json' });
    await storage.mutate(async (state) => { state.agents.unshift(agent); });
    await touchEvent('REGISTERED', `${agent.name} imported from manifest JSON (pending verification)`);
    return json(res, 201, { ok: true, agent });
  }
  if (req.method === 'POST' && url.pathname === '/api/agents/import-url') {
    const body = await parseBody(req).catch(err => ({ __error: err.message }));
    if (body.__error) return json(res, 400, { error: body.__error });
    if (!body.manifest_url) return json(res, 400, { error: 'manifest_url required' });
    let manifest = null;
    try {
      manifest = await loadManifestFromUrl(body.manifest_url);
    } catch (error) {
      return json(res, 400, { error: error.message });
    }
    const ownerInfo = ownerFromRequest(req);
    const agent = createAgentFromManifest(manifest, ownerInfo, {
      manifestUrl: body.manifest_url,
      manifestSource: body.manifest_url,
      verificationStatus: 'manifest_loaded',
      importMode: 'manifest-url'
    });
    await storage.mutate(async (state) => { state.agents.unshift(agent); });
    await touchEvent('REGISTERED', `${agent.name} manifest loaded from URL`);
    return json(res, 201, { ok: true, agent, import_mode: 'manifest-url', owner: ownerInfo.owner });
  }
  if (req.method === 'POST' && url.pathname.match(/^\/api\/agents\/([^/]+)\/verify$/)) {
    const id = url.pathname.split('/')[3];
    const result = await storage.mutate(async (state) => {
      const agent = state.agents.find(a => a.id === id);
      if (!agent) return { error: 'Agent not found', statusCode: 404 };
      const verification = await verifyAgentByHealthcheck(agent);
      agent.verificationStatus = verification.status;
      agent.verificationCheckedAt = verification.checkedAt;
      agent.verificationError = verification.ok ? null : verification.reason;
      agent.verificationDetails = {
        category: verification.category || (verification.ok ? 'verified' : 'unknown'),
        code: verification.code || (verification.ok ? 'verified' : 'verification_failed'),
        reason: verification.reason || null,
        healthcheckUrl: verification.healthcheckUrl || null,
        challengeUrl: verification.challengeUrl || verification.details?.challengeUrl || null,
        details: verification.details || null
      };
      agent.updatedAt = nowIso();
      return { ok: true, agent, verification };
    });
    if (result.error) return json(res, result.statusCode || 400, { error: result.error });
    if (result.verification.ok) {
      await touchEvent('VERIFIED', `${result.agent.name} verification succeeded`);
    } else {
      await touchEvent('FAILED', `${result.agent.name} verification failed: ${result.verification.reason}`);
    }
    return json(res, 200, result);
  }
  if (req.method === 'POST' && url.pathname === '/api/jobs') {
    const body = await parseBody(req).catch(err => ({ __error: err.message }));
    if (body.__error) return json(res, 400, { error: body.__error });
    if (!body.parent_agent_id || !body.prompt) return json(res, 400, { error: 'parent_agent_id and prompt required' });
    const taskType = inferTaskType(body.task_type, body.prompt);
    const state = await storage.getState();
    await touchEvent('JOB', `parent ${body.parent_agent_id} requested ${taskType}`);
    const requestedAgentId = String(body.agent_id || '').trim();
    const picked = pickAgent(state.agents, taskType, body.budget_cap || 0, requestedAgentId);
    if (picked?.error) return json(res, 400, { error: picked.error, requested_agent_id: requestedAgentId, inferred_task_type: taskType });
    if (!picked) {
      const failedJob = {
        id: randomUUID(),
        parentAgentId: body.parent_agent_id,
        taskType,
        prompt: body.prompt,
        input: body.input || {},
        budgetCap: body.budget_cap || null,
        deadlineSec: body.deadline_sec || null,
        priority: body.priority || 'normal',
        status: 'failed',
        assignedAgentId: null,
        score: null,
        createdAt: nowIso(),
        failedAt: nowIso(),
        failureReason: 'No agent available',
        logs: [`created by ${body.parent_agent_id}`, 'matching failed: no agent available']
      };
      await storage.mutate(async (draft) => { draft.jobs.unshift(failedJob); });
      await touchEvent('FAILED', `${taskType}/${failedJob.id.slice(0, 6)} no agent available`);
      return json(res, 201, { job_id: failedJob.id, status: 'failed', failure_reason: failedJob.failureReason, inferred_task_type: taskType });
    }
    const job = {
      id: randomUUID(),
      parentAgentId: body.parent_agent_id,
      taskType,
      prompt: body.prompt,
      input: body.input || {},
      budgetCap: body.budget_cap || null,
      deadlineSec: body.deadline_sec || null,
      priority: body.priority || 'normal',
      status: 'queued',
      assignedAgentId: picked.agent.id,
      score: picked.score,
      createdAt: nowIso(),
      billingEstimate: estimateBilling(picked.agent, {
        api_cost: Number(body.estimated_api_cost || 100),
        total_cost_basis: Number(body.estimated_total_cost_basis || 0) || undefined,
        cost_basis: body.estimated_cost_basis || undefined
      }),
      estimateWindow: estimateRunWindow(picked.agent, taskType),
      logs: [`created by ${body.parent_agent_id}`, `${picked.selectionMode === 'manual' ? 'manually selected' : 'matched to'} ${picked.agent.id} score=${picked.score}`, `inferred taskType=${taskType}`],
      selectionMode: picked.selectionMode
    };
    job.callbackToken = callbackTokenForJob(job);
    await storage.mutate(async (draft) => { draft.jobs.unshift(job); });
    await touchEvent('MATCHED', `${job.taskType}/${job.id.slice(0, 6)} -> ${picked.agent.name}`);

    try {
      const dispatch = await dispatchJobToAssignedAgent(job, picked.agent);
      const final = await storage.mutate(async (draft) => {
        const draftJob = draft.jobs.find(j => j.id === job.id);
        const draftAgent = draft.agents.find(a => a.id === picked.agent.id);
        if (!draftJob) return { error: 'Job disappeared during dispatch', statusCode: 500 };
        if (!dispatch.ok) {
          const failureMeta = buildDispatchFailureMeta(draftJob, dispatch.statusCode, dispatch.failureReason);
          draftJob.status = 'failed';
          draftJob.failedAt = nowIso();
          draftJob.failureReason = dispatch.failureReason;
          draftJob.failureCategory = failureMeta.category;
          draftJob.dispatch = {
            ...(draftJob.dispatch || {}),
            endpoint: dispatch.endpoint || draftJob.dispatch?.endpoint || null,
            statusCode: dispatch.statusCode || null,
            responseStatus: dispatch.responseBody?.status || null,
            lastAttemptAt: nowIso(),
            attempts: failureMeta.attempts,
            retryable: failureMeta.retryable,
            nextRetryAt: failureMeta.nextRetryAt,
            completionStatus: 'failed'
          };
          draftJob.logs.push(`dispatch failed for ${picked.agent.id}`, dispatch.failureReason, `retryable=${failureMeta.retryable}`);
          return { ok: true, mode: 'failed', job: draftJob };
        }

        draftJob.dispatchedAt = nowIso();
        draftJob.startedAt = draftJob.startedAt || draftJob.dispatchedAt;
        draftJob.status = 'dispatched';
        draftJob.dispatch = {
          endpoint: dispatch.endpoint,
          statusCode: dispatch.statusCode,
          externalJobId: dispatch.normalized.externalJobId,
          responseStatus: dispatch.normalized.status,
          lastAttemptAt: nowIso(),
          attempts: Number(draftJob.dispatch?.attempts || 0) + 1,
          retryable: false,
          nextRetryAt: null,
          completionStatus: dispatch.normalized.completed ? 'completed' : 'accepted'
        };
        draftJob.logs.push(`dispatched to ${picked.agent.id} endpoint=${dispatch.endpoint}`);

        if (dispatch.normalized.completed) {
          const billing = estimateBilling(picked.agent, dispatch.normalized.usage);
          draftJob.status = 'completed';
          draftJob.completedAt = nowIso();
          draftJob.usage = dispatch.normalized.usage;
          draftJob.output = {
            report: dispatch.normalized.report,
            files: dispatch.normalized.files,
            returnTargets: dispatch.normalized.returnTargets
          };
          draftJob.actualBilling = billing;
          draftJob.logs.push(`completed by dispatch response from ${picked.agent.id}`, `billed total=${billing.total}`);
          if (draftAgent) draftAgent.earnings = +(Number(draftAgent.earnings || 0) + billing.agentPayout).toFixed(1);
          return { ok: true, mode: 'completed', job: draftJob, billing };
        }

        draftJob.status = 'dispatched';
        draftJob.logs.push(`dispatch accepted by ${picked.agent.id} status=${dispatch.normalized.status}`);
        return { ok: true, mode: 'dispatched', job: draftJob };
      });

      if (final.error) return json(res, final.statusCode || 500, { error: final.error });
      if (final.mode === 'failed') {
        await touchEvent('FAILED', `${job.taskType}/${job.id.slice(0, 6)} dispatch failed`);
        return json(res, 201, {
          job_id: job.id,
          matched_agent_id: job.assignedAgentId,
          selection_mode: picked.selectionMode,
          inferred_task_type: taskType,
          status: 'failed',
          failure_reason: final.job.failureReason,
          estimated_cost: job.billingEstimate,
          estimate_window: job.estimateWindow
        });
      }
      if (final.mode === 'completed') {
        await touchEvent('COMPLETED', `${job.taskType}/${job.id.slice(0, 6)} completed by external dispatch`);
        await touchEvent('BILLED', `api=${final.billing.apiCost} total=${final.billing.total}`);
        await appendBillingAudit(final.job, final.billing, { source: 'external-dispatch' });
        return json(res, 201, {
          job_id: job.id,
          matched_agent_id: job.assignedAgentId,
          selection_mode: picked.selectionMode,
          inferred_task_type: taskType,
          status: 'completed',
          estimated_cost: job.billingEstimate,
          estimate_window: job.estimateWindow,
          actual_billing: final.billing,
          delivery: {
            report: final.job.output?.report || null,
            files: final.job.output?.files || [],
            returnTargets: final.job.output?.returnTargets || ['api']
          }
        });
      }
      await touchEvent('RUNNING', `${picked.agent.name} accepted external dispatch for ${job.taskType}/${job.id.slice(0, 6)}`);
      return json(res, 201, {
        job_id: job.id,
        matched_agent_id: job.assignedAgentId,
        selection_mode: picked.selectionMode,
        estimated_cost: job.billingEstimate,
        estimate_window: job.estimateWindow,
        inferred_task_type: taskType,
        status: 'dispatched'
      });
    } catch (error) {
      const failed = await storage.mutate(async (draft) => {
        const draftJob = draft.jobs.find(j => j.id === job.id);
        if (!draftJob) return null;
        const failureMeta = buildDispatchFailureMeta(draftJob, 0, error.message);
        draftJob.status = 'failed';
        draftJob.failedAt = nowIso();
        draftJob.failureReason = error.message;
        draftJob.failureCategory = failureMeta.category;
        draftJob.dispatch = {
          ...(draftJob.dispatch || {}),
          lastAttemptAt: nowIso(),
          attempts: failureMeta.attempts,
          retryable: failureMeta.retryable,
          nextRetryAt: failureMeta.nextRetryAt,
          completionStatus: 'failed'
        };
        draftJob.logs.push(`dispatch exception for ${picked.agent.id}`, error.message, `retryable=${failureMeta.retryable}`);
        return draftJob;
      });
      await touchEvent('FAILED', `${job.taskType}/${job.id.slice(0, 6)} dispatch exception`);
      return json(res, 201, {
        job_id: job.id,
        matched_agent_id: job.assignedAgentId,
        selection_mode: picked.selectionMode,
        estimated_cost: job.billingEstimate,
        estimate_window: job.estimateWindow,
        inferred_task_type: taskType,
        status: 'failed',
        failure_reason: failed?.failureReason || error.message
      });
    }
  }
  const claimMatch = req.method === 'POST' && url.pathname.match(/^\/api\/jobs\/([^/]+)\/claim$/);
  if (claimMatch) {
    const body = await parseBody(req).catch(err => ({ __error: err.message }));
    if (body.__error) return json(res, 400, { error: body.__error });
    const result = await storage.mutate(async (state) => {
      const job = state.jobs.find(j => j.id === claimMatch[1]);
      if (!job) return { error: 'Job not found', statusCode: 404 };
      const agent = state.agents.find(a => a.id === body.agent_id);
      if (!agent) return { error: 'Agent not found', statusCode: 404 };
      if (!isAgentVerified(agent)) return { error: 'Agent is not verified', statusCode: 403 };
      if (!agent.taskTypes.includes(job.taskType)) return { error: 'Agent cannot accept this job type', statusCode: 400 };
      if (isTerminalJobStatus(job.status)) return { error: `Job is already terminal (${job.status})`, statusCode: 409, code: 'job_already_terminal' };
      if (!canTransitionJob(job, 'claim')) return { error: `Job status ${job.status} cannot be claimed`, statusCode: 400, code: transitionErrorCode(job, 'claim') };
      job.assignedAgentId = agent.id;
      job.status = 'claimed';
      job.claimedAt = nowIso();
      job.logs.push(`claimed by ${agent.id}`);
      return { ok: true, job, agent };
    });
    if (result.error) return json(res, result.statusCode || 400, { error: result.error });
    await touchEvent('RUNNING', `${result.agent.name} claimed ${result.job.taskType}/${result.job.id.slice(0, 6)}`);
    return json(res, 200, result);
  }

  const resultSubmitMatch = req.method === 'POST' && url.pathname.match(/^\/api\/jobs\/([^/]+)\/result$/);
  if (resultSubmitMatch) {
    const body = await parseBody(req).catch(err => ({ __error: err.message }));
    if (body.__error) return json(res, 400, { error: body.__error });
    const result = await completeJobFromAgentResult(resultSubmitMatch[1], body.agent_id, body, { source: 'manual-result' });
    if (result.error) return json(res, result.statusCode || 400, { error: result.error });
    await touchEvent('COMPLETED', `${result.job.taskType}/${result.job.id.slice(0, 6)} completed by connected agent`);
    await touchEvent('BILLED', `api=${result.billing.apiCost} total=${result.billing.total}`);
    await appendBillingAudit(result.job, result.billing, { source: 'manual-result' });
    return json(res, 200, {
      ...result,
      delivery: {
        report: result.job.output?.report || null,
        files: result.job.output?.files || [],
        returnTargets: result.job.output?.returnTargets || ['chat', 'api', 'webhook']
      }
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/dev/dispatch-retry') {
    const body = await parseBody(req).catch(err => ({ __error: err.message }));
    if (body.__error) return json(res, 400, { error: body.__error });
    if (!body.job_id) return json(res, 400, { error: 'job_id required' });
    const current = await storage.getState();
    const job = current.jobs.find(j => j.id === body.job_id);
    if (!job) return json(res, 404, { error: 'Job not found' });
    const agent = current.agents.find(a => a.id === job.assignedAgentId);
    if (!agent) return json(res, 404, { error: 'Assigned agent not found' });
    if (!isAgentVerified(agent)) return json(res, 403, { error: 'Assigned agent is not verified' });
    if (!canTransitionJob(job, 'retry')) return json(res, 400, { error: `Job status ${job.status} is not retryable`, code: transitionErrorCode(job, 'retry') });
    if (job.status === 'failed' && job.dispatch && job.dispatch.retryable === false) {
      return json(res, 409, { error: 'Job is marked non-retryable', failure_category: job.failureCategory, dispatch: job.dispatch });
    }
    if (!canRetryDispatch(job)) {
      return json(res, 409, { error: 'Retry limit reached', attempts: Number(job.dispatch?.attempts || 0), max_retries: maxDispatchRetriesForJob(job) });
    }
    try {
      const dispatch = await dispatchJobToAssignedAgent(job, agent);
      const final = await storage.mutate(async (draft) => {
        const draftJob = draft.jobs.find(j => j.id === job.id);
        const draftAgent = draft.agents.find(a => a.id === agent.id);
        if (!draftJob) return { error: 'Job not found', statusCode: 404 };
        if (!dispatch.ok) {
          const failureMeta = buildDispatchFailureMeta(draftJob, dispatch.statusCode, dispatch.failureReason);
          draftJob.status = 'failed';
          draftJob.failedAt = nowIso();
          draftJob.failureReason = dispatch.failureReason;
          draftJob.failureCategory = failureMeta.category;
          draftJob.dispatch = {
            ...(draftJob.dispatch || {}),
            endpoint: dispatch.endpoint || draftJob.dispatch?.endpoint || null,
            statusCode: dispatch.statusCode || null,
            responseStatus: dispatch.responseBody?.status || null,
            lastAttemptAt: nowIso(),
            attempts: failureMeta.attempts,
            retryable: failureMeta.retryable,
            nextRetryAt: failureMeta.nextRetryAt,
            completionStatus: 'failed'
          };
          draftJob.logs.push('manual dispatch retry failed', dispatch.failureReason, `retryable=${failureMeta.retryable}`);
          return { ok: true, mode: 'failed', job: draftJob };
        }
        draftJob.dispatchedAt = nowIso();
        draftJob.startedAt = draftJob.startedAt || draftJob.dispatchedAt;
        draftJob.status = 'dispatched';
        draftJob.failureReason = null;
        draftJob.dispatch = {
          endpoint: dispatch.endpoint,
          statusCode: dispatch.statusCode,
          externalJobId: dispatch.normalized.externalJobId,
          responseStatus: dispatch.normalized.status,
          lastAttemptAt: nowIso(),
          attempts: Number(draftJob.dispatch?.attempts || 0) + 1,
          retryable: false,
          nextRetryAt: null,
          completionStatus: dispatch.normalized.completed ? 'completed' : 'accepted'
        };
        if (dispatch.normalized.completed) {
          const billing = estimateBilling(agent, dispatch.normalized.usage);
          draftJob.status = 'completed';
          draftJob.completedAt = nowIso();
          draftJob.usage = dispatch.normalized.usage;
          draftJob.output = {
            report: dispatch.normalized.report,
            files: dispatch.normalized.files,
            returnTargets: dispatch.normalized.returnTargets
          };
          draftJob.actualBilling = billing;
          draftJob.logs.push('manual dispatch retry completed job', `billed total=${billing.total}`);
          if (draftAgent) draftAgent.earnings = +(Number(draftAgent.earnings || 0) + billing.agentPayout).toFixed(1);
          return { ok: true, mode: 'completed', job: draftJob, billing };
        }
        draftJob.status = 'dispatched';
        draftJob.logs.push('manual dispatch retry accepted');
        return { ok: true, mode: 'dispatched', job: draftJob };
      });
      if (final.error) return json(res, final.statusCode || 500, { error: final.error });
      if (final.mode === 'completed') {
        await touchEvent('COMPLETED', `${job.taskType}/${job.id.slice(0, 6)} completed after retry`);
        await touchEvent('BILLED', `api=${final.billing.apiCost} total=${final.billing.total}`);
        await appendBillingAudit(final.job, final.billing, { source: 'dispatch-retry' });
      } else if (final.mode === 'dispatched') {
        await touchEvent('RUNNING', `${agent.name} accepted retry for ${job.taskType}/${job.id.slice(0, 6)}`);
      } else {
        await touchEvent('FAILED', `${job.taskType}/${job.id.slice(0, 6)} retry failed`);
      }
      return json(res, 200, final);
    } catch (error) {
      const failureMeta = buildDispatchFailureMeta(job, 0, error.message);
      const failed = await failJob(job.id, error.message, ['manual dispatch retry exception'], {
        failureCategory: failureMeta.category,
        retryable: failureMeta.retryable,
        nextRetryAt: failureMeta.nextRetryAt,
        attempts: failureMeta.attempts
      });
      await touchEvent('FAILED', `${job.taskType}/${job.id.slice(0, 6)} retry exception`);
      return json(res, 500, { error: failed?.failureReason || error.message, dispatch: failed?.dispatch || null });
    }
  }
  if (req.method === 'POST' && url.pathname === '/api/dev/timeout-sweep') {
    const body = await parseBody(req).catch(err => ({ __error: err.message }));
    if (body.__error) return json(res, 400, { error: body.__error });
    const maxAgeSec = Math.max(1, Number(body.max_age_sec || 300));
    const now = Date.now();
    const result = await storage.mutate(async (draft) => {
      const timedOut = [];
      for (const job of draft.jobs) {
        if (!canTransitionJob(job, 'timeout')) continue;
        const basis = job.dispatchedAt || job.startedAt || job.createdAt;
        const ageMs = Math.max(0, now - new Date(basis).getTime());
        if (ageMs < maxAgeSec * 1000) continue;
        const attempts = Number(job.dispatch?.attempts || 0);
        const nextAttempt = attempts + 1;
        const maxRetries = maxDispatchRetriesForJob(job);
        const retryable = nextAttempt <= maxRetries;
        job.status = 'timed_out';
        job.timedOutAt = nowIso();
        job.failedAt = nowIso();
        job.failureReason = `Timed out after ${maxAgeSec}s`;
        job.failureCategory = 'deadline_timeout';
        job.dispatch = {
          ...(job.dispatch || {}),
          completionStatus: 'timed_out',
          failedAt: job.failedAt,
          attempts,
          retryable,
          nextRetryAt: retryable ? computeNextRetryAt(nextAttempt, now) : null,
          maxRetries
        };
        job.logs.push(`timeout sweep marked timed_out at ${job.timedOutAt}`, `retryable=${retryable}`, `attempts=${attempts}/${maxRetries}`);
        timedOut.push({ id: job.id, taskType: job.taskType, status: job.status, retryable, nextRetryAt: job.dispatch.nextRetryAt, attempts, maxRetries });
      }
      return { ok: true, timedOut };
    });
    for (const item of result.timedOut) {
      const retryMessage = item.retryable
        ? `${item.taskType}/${item.id.slice(0, 6)} timed out; retry ${item.attempts + 1}/${item.maxRetries} available`
        : `${item.taskType}/${item.id.slice(0, 6)} timed out; retries exhausted at ${item.attempts}/${item.maxRetries}`;
      await touchEvent('TIMEOUT', retryMessage, {
        kind: 'run_timeout',
        jobId: item.id,
        retryable: item.retryable,
        attempts: item.attempts,
        maxRetries: item.maxRetries,
        nextRetryAt: item.nextRetryAt
      });
    }
    return json(res, 200, { ok: true, count: result.timedOut.length, timedOut: result.timedOut });
  }
  if (req.method === 'POST' && url.pathname === '/api/dev/resolve-job') {
    const body = await parseBody(req).catch(err => ({ __error: err.message }));
    if (body.__error) return json(res, 400, { error: body.__error });
    const mode = body.mode || 'complete';
    const result = await storage.mutate(async (state) => {
      const job = state.jobs.find(j => j.id === body.job_id);
      if (!job) return { error: 'Job not found', statusCode: 404 };
      if (!job.assignedAgentId) {
        job.status = 'failed';
        job.failedAt = nowIso();
        job.failureReason = job.failureReason || 'No assigned agent';
        return { status: 'failed', job };
      }
      const agent = state.agents.find(a => a.id === job.assignedAgentId);
      if (!agent) return { error: 'Assigned agent not found', statusCode: 404 };
      if (!isAgentVerified(agent)) return { error: 'Assigned agent is not verified', statusCode: 403 };
      job.startedAt = nowIso();
      job.status = 'running';
      job.logs.push(`started by ${agent.id}`);
      if (mode === 'fail') {
        job.status = 'failed';
        job.failedAt = nowIso();
        job.failureReason = 'Simulated failure';
        job.logs.push('simulated failure');
        return { status: 'failed', job };
      }
      const apiCost = Number(body.api_cost || Math.max(60, Math.min(240, Math.round((job.budgetCap || 180) * 0.35))));
      const usage = normalizeUsageForBilling({
        api_cost: apiCost,
        total_cost_basis: body.total_cost_basis,
        cost_basis: body.cost_basis
      }, apiCost);
      const billing = estimateBilling(agent, usage);
      job.status = 'completed';
      job.completedAt = nowIso();
      job.usage = { ...usage, simulated: true };
      job.output = { summary: `Simulated completion for ${job.taskType}`, naturalLanguageIntent: job.prompt };
      job.actualBilling = billing;
      job.logs.push(`completed by ${agent.id}`, `billed total=${billing.total}`);
      agent.earnings = +(Number(agent.earnings || 0) + billing.agentPayout).toFixed(1);
      return { status: 'completed', job, billing };
    });
    if (result.error) return json(res, result.statusCode || 400, { error: result.error });
    if (result.status === 'failed') {
      await touchEvent('FAILED', `${result.job.taskType}/${result.job.id.slice(0, 6)} failed`);
      return json(res, 200, { status: 'failed', failure_reason: result.job.failureReason, job: result.job });
    }
    await touchEvent('RUNNING', `${result.job.assignedAgentId} started ${result.job.taskType}/${result.job.id.slice(0, 6)}`);
    await touchEvent('COMPLETED', `${result.job.taskType}/${result.job.id.slice(0, 6)} completed`);
    await touchEvent('BILLED', `api=${result.billing.apiCost} total=${result.billing.total}`);
    await appendBillingAudit(result.job, result.billing, { source: 'dev-resolve-job' });
    return json(res, 200, { status: 'completed', billing: result.billing, job: result.job });
  }
  if (req.method === 'POST' && url.pathname === '/api/seed') {
    const samples = [
      ['research', '中古iPhone 13の買取比較'],
      ['writing', '比較結果をLPコピーに変換'],
      ['code', '料金計算ロジックのバグ修正'],
      ['summary', '商流を短く整理']
    ];
    const seededIds = [];
    for (const [taskType, prompt] of samples) {
      const state = await storage.getState();
      const picked = pickAgent(state.agents, taskType, 300);
      if (!picked) continue;
      const apiCost = Math.floor(80 + Math.random() * 60);
      const usage = { api_cost: apiCost, simulated: true };
      const billing = estimateBilling(picked.agent, usage);
      const job = {
        id: randomUUID(),
        parentAgentId: 'cloudcode-main',
        taskType,
        prompt,
        input: {},
        budgetCap: 300,
        deadlineSec: 120,
        priority: 'normal',
        status: 'completed',
        assignedAgentId: picked.agent.id,
        score: picked.score,
        createdAt: nowIso(),
        startedAt: nowIso(),
        completedAt: nowIso(),
        billingEstimate: estimateBilling(picked.agent, 100),
        actualBilling: billing,
        usage,
        output: { summary: 'demo output' },
        logs: ['seeded demo job']
      };
      await storage.mutate(async (draft) => {
        draft.jobs.unshift(job);
        const agent = draft.agents.find(a => a.id === picked.agent.id);
        if (agent) agent.earnings = +(Number(agent.earnings || 0) + billing.agentPayout).toFixed(1);
      });
      seededIds.push(job.id);
      await touchEvent('MATCHED', `${job.taskType}/${job.id.slice(0, 6)} -> ${picked.agent.name}`);
      await touchEvent('COMPLETED', `${job.taskType}/${job.id.slice(0, 6)} completed`);
      await touchEvent('BILLED', `api=${job.actualBilling.apiCost} total=${job.actualBilling.total}`);
      await appendBillingAudit(job, job.actualBilling, { source: 'seed' });
    }
    return json(res, 200, { ok: true, job_ids: seededIds });
  }
  if (serveStatic(res, url.pathname)) return;
  return json(res, 404, { error: 'Not found' });
});

const port = process.env.PORT || 4323;
const host = process.env.HOST || '127.0.0.1';
server.listen(port, host, async () => {
  await migrateLegacyAgents();
  await touchEvent('LIVE', 'broker online');
  console.log(`agent-market-app running at http://${host}:${port}`);
});
