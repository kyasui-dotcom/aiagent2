import { createD1LikeStorage } from './lib/storage.js';
import { normalizeManifest, parseAndValidateManifest, sanitizeManifestForPublic, validateManifest } from './lib/manifest.js';
import { verifyAgentByHealthcheck } from './lib/verify.js';
import { buildAgentId, estimateBilling, estimateRunWindow, inferTaskType, makeEvent, normalizeTaskTypes, nowIso } from './lib/shared.js';

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers }
  });
}

function billingAuditEvents(events = []) {
  return events
    .filter((event) => event.type === 'BILLING_AUDIT' && event.meta?.kind === 'billing_audit')
    .map((event) => ({ id: event.id, ...event.meta, message: event.message }));
}

function statsOf(state) {
  const completed = state.jobs.filter((j) => j.actualBilling);
  const grossVolume = completed.reduce((n, j) => n + (j.actualBilling?.total || 0), 0);
  const api = completed.reduce((n, j) => n + (j.actualBilling?.apiCost || 0), 0);
  const rev = completed.reduce((n, j) => n + (j.actualBilling?.platformRevenue || 0), 0);
  const retryableRuns = state.jobs.filter((j) => j.dispatch?.retryable === true).length;
  const timedOutRuns = state.jobs.filter((j) => j.status === 'timed_out').length;
  const terminalRuns = state.jobs.filter((j) => ['completed', 'failed', 'timed_out'].includes(j.status)).length;
  const nextRetryAt = state.jobs
    .map((j) => j.dispatch?.nextRetryAt || null)
    .filter(Boolean)
    .sort()[0] || null;
  return {
    activeJobs: state.jobs.filter((j) => ['queued', 'claimed', 'running', 'dispatched'].includes(j.status)).length,
    onlineAgents: state.agents.filter((a) => a.online).length,
    grossVolume: +grossVolume.toFixed(1),
    todayCost: +api.toFixed(1),
    platformRevenue: +rev.toFixed(1),
    failedJobs: state.jobs.filter((j) => j.status === 'failed').length,
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

function cloneJob(job) {
  return job ? structuredClone(job) : null;
}

function createAgentFromInput(body = {}, ownerInfo = { owner: 'samurai', metadata: {} }) {
  const taskTypes = normalizeTaskTypes(body.task_types || body.taskTypes || 'summary');
  const verificationStatus = body.verification_status || body.verificationStatus || 'legacy_unverified';
  return {
    id: buildAgentId(body.name || 'agent'),
    name: String(body.name || 'custom_agent').toUpperCase(),
    description: body.description || 'Custom registered agent.',
    taskTypes: taskTypes.length ? taskTypes : ['summary'],
    premiumRate: Number(body.premium_rate ?? body.premiumRate ?? 0.1),
    basicRate: Number(body.basic_rate ?? body.basicRate ?? 0.1),
    successRate: Number(body.success_rate ?? body.successRate ?? 0.9),
    avgLatencySec: Number(body.avg_latency_sec ?? body.avgLatencySec ?? 20),
    online: body.online ?? true,
    token: String(body.token || `secret_${crypto.randomUUID().slice(0, 8)}`),
    earnings: Number(body.earnings ?? 0),
    owner: body.owner || ownerInfo.owner || 'samurai',
    manifestUrl: body.manifest_url || body.manifestUrl || null,
    manifestSource: body.manifest_source || body.manifestSource || null,
    metadata: { ...(ownerInfo.metadata || {}), ...(body.metadata || {}) },
    verificationStatus,
    verificationCheckedAt: body.verification_checked_at || body.verificationCheckedAt || null,
    verificationError: body.verification_error || body.verificationError || null,
    verificationDetails: body.verification_details || body.verificationDetails || null,
    createdAt: body.created_at || body.createdAt || nowIso(),
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
  }, ownerInfo);
}

function ownerInfoFromRequest(request) {
  const url = new URL(request.url);
  return {
    owner: 'samurai',
    metadata: {
      brokerCallbackUrl: `${url.origin}/api/agent-callbacks/jobs`
    }
  };
}

function normalizeUsageForBilling(rawUsage, fallbackApiCost = 100) {
  if (rawUsage && typeof rawUsage === 'object') {
    return {
      ...rawUsage,
      api_cost: rawUsage.api_cost ?? rawUsage.apiCost ?? fallbackApiCost,
      total_cost_basis: rawUsage.total_cost_basis ?? rawUsage.totalCostBasis,
      cost_basis: rawUsage.cost_basis ?? rawUsage.costBasis
    };
  }
  return { api_cost: Number(fallbackApiCost || 100) };
}

function isAgentVerified(agent) {
  return agent?.verificationStatus === 'verified';
}

function callbackTokenForJob() {
  return crypto.randomUUID().replace(/-/g, '');
}

function extractCallbackToken(request, body = {}) {
  const auth = String(request.headers.get('authorization') || '').trim();
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  const headerToken = String(request.headers.get('x-callback-token') || '').trim();
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
    failureReason: payload.failure_reason || payload.error || null
  };
}

function maxDispatchRetriesForJob(job) {
  return Math.max(0, Number(job?.dispatch?.maxRetries ?? 2));
}

function computeNextRetryAt(attempts, baseTime = Date.now()) {
  const retryDelaySec = Math.min(300, Math.max(5, 5 * (2 ** Math.max(0, attempts - 1))));
  return new Date(baseTime + retryDelaySec * 1000).toISOString();
}

function canRetryJob(job) {
  if (!job) return false;
  if (!['failed', 'timed_out', 'dispatched', 'queued'].includes(job.status)) return false;
  if (job.dispatch?.retryable === false) return false;
  const attempts = Number(job.dispatch?.attempts || 0);
  return attempts < maxDispatchRetriesForJob(job);
}

async function snapshot(storage) {
  const state = await storage.getState();
  return {
    stats: statsOf(state),
    agents: state.agents.map(publicAgent),
    jobs: state.jobs,
    events: state.events,
    billingAudits: billingAuditEvents(state.events),
    storage: {
      kind: storage.kind,
      supportsPersistence: storage.supportsPersistence,
      path: null,
      note: storage.note || (storage.kind === 'd1' ? 'Cloudflare D1 active' : 'In-memory fallback active')
    },
    auth: {
      loggedIn: false,
      githubConfigured: false,
      user: null
    }
  };
}

async function parseBody(request) {
  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Invalid JSON');
  }
}

async function touchEvent(storage, type, message, meta = {}) {
  const event = makeEvent(type, message, meta);
  await storage.mutate(async (draft) => {
    draft.events.push(event);
    if (draft.events.length > 300) draft.events = draft.events.slice(-300);
  });
  return event;
}

async function appendBillingAudit(storage, job, billing, meta = {}) {
  const audit = {
    id: crypto.randomUUID(),
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
  await touchEvent(storage, 'BILLING_AUDIT', `audit ${job.id.slice(0, 6)} total=${billing.total}`, audit);
}

function computeScore(agent, taskType) {
  const skillMatch = agent.taskTypes.includes(taskType) ? 1 : 0;
  const quality = Number(agent.successRate || 0);
  const speed = Math.max(0, 1 - Number(agent.avgLatencySec || 20) / 120);
  const reliability = agent.online ? 1 : 0;
  return +(skillMatch * 0.5 + quality * 0.25 + speed * 0.15 + reliability * 0.1).toFixed(3);
}

function pickAgent(agents, taskType, requestedAgentId = '') {
  const verified = agents.filter((a) => a.online && a.verificationStatus === 'verified');
  if (requestedAgentId) {
    const requested = verified.find((a) => a.id === requestedAgentId);
    if (!requested) return { error: 'Requested agent is unavailable or not verified' };
    if (!requested.taskTypes.includes(taskType)) return { error: 'Requested agent does not support this task type' };
    return { agent: requested, score: computeScore(requested, taskType), selectionMode: 'manual' };
  }
  const autoPicked = verified
    .filter((a) => a.taskTypes.includes(taskType))
    .map((agent) => ({ agent, score: computeScore(agent, taskType), selectionMode: 'auto' }))
    .sort((a, b) => b.score - a.score)[0];
  return autoPicked || null;
}

async function completeJobFromAgentResult(storage, jobId, agentId, payload = {}, meta = {}) {
  return storage.mutate(async (state) => {
    const job = state.jobs.find((item) => item.id === jobId);
    if (!job) return { error: 'Job not found', statusCode: 404 };
    if (isTerminalJobStatus(job.status)) {
      return { error: `Job is already terminal (${job.status})`, statusCode: 409, code: 'job_already_terminal', job };
    }
    if (meta.source === 'callback' && !canTransitionJob(job, 'callback')) {
      return { error: `Job status ${job.status} cannot be changed by callback`, statusCode: 409, code: transitionErrorCode(job, 'callback'), job };
    }
    if (meta.source === 'manual-result' && !canTransitionJob(job, 'manualResult')) {
      return { error: `Job status ${job.status} cannot be changed by manual result`, statusCode: 409, code: transitionErrorCode(job, 'manualResult'), job };
    }
    const agent = state.agents.find((item) => item.id === agentId);
    if (!agent) return { error: 'Agent not found', statusCode: 404 };
    if (!isAgentVerified(agent)) return { error: 'Agent is not verified', statusCode: 403 };
    if (job.assignedAgentId && job.assignedAgentId !== agent.id) return { error: 'Invalid assignment', statusCode: 401 };
    const completionAt = nowIso();
    const usage = normalizeUsageForBilling(payload?.usage, 100);
    const billing = estimateBilling(agent, usage);
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
    job.failedAt = null;
    job.failureReason = null;
    job.failureCategory = null;
    job.usage = usage;
    job.actualBilling = billing;
    job.dispatch = {
      ...(job.dispatch || {}),
      externalJobId: meta.externalJobId || job.dispatch?.externalJobId || null,
      completionSource: meta.source || job.dispatch?.completionSource || null,
      completionStatus: 'completed',
      completedAt: completionAt,
      lastCallbackAt: meta.source === 'callback' ? completionAt : (job.dispatch?.lastCallbackAt || null),
      retryable: false,
      nextRetryAt: null
    };
    job.logs = [...(job.logs || []), `completed by ${agent.id}`, `billed total=${billing.total}`];
    if (meta.source) job.logs.push(`completion source=${meta.source}`);
    if (meta.externalJobId) job.logs.push(`external_job_id=${meta.externalJobId}`);
    agent.earnings = +(Number(agent.earnings || 0) + billing.agentPayout).toFixed(1);
    return { ok: true, job: cloneJob(job), billing };
  });
}

async function failJob(storage, jobId, reason, extraLogs = [], options = {}) {
  return storage.mutate(async (state) => {
    const job = state.jobs.find((item) => item.id === jobId);
    if (!job) return null;
    if (isTerminalJobStatus(job.status)) return cloneJob(job);
    const failedAt = nowIso();
    const failureStatus = options.failureStatus || (job.status === 'dispatched' ? 'timed_out' : 'failed');
    job.status = failureStatus;
    job.failedAt = failedAt;
    job.failureReason = reason;
    job.failureCategory = options.failureCategory || job.failureCategory || 'agent_failed';
    if (failureStatus === 'timed_out') job.timedOutAt = failedAt;
    job.lastCallbackAt = options.source === 'callback' ? failedAt : (job.lastCallbackAt || null);
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
    job.logs = [...(job.logs || []), ...extraLogs, reason];
    return cloneJob(job);
  });
}

async function handleCreateJob(storage, request) {
  let body;
  try {
    body = await parseBody(request);
  } catch (error) {
    return json({ error: error.message }, 400);
  }
  if (!body.parent_agent_id || !body.prompt) {
    return json({ error: 'parent_agent_id and prompt required' }, 400);
  }
  const taskType = inferTaskType(body.task_type, body.prompt);
  const state = await storage.getState();
  await touchEvent(storage, 'JOB', `parent ${body.parent_agent_id} requested ${taskType}`);
  const requestedAgentId = String(body.agent_id || '').trim();
  const picked = pickAgent(state.agents, taskType, requestedAgentId);
  if (picked?.error) {
    return json({ error: picked.error, requested_agent_id: requestedAgentId, inferred_task_type: taskType }, 400);
  }
  if (!picked) {
    const failedJob = {
      id: crypto.randomUUID(),
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
      failureReason: 'No verified agent available',
      logs: [`created by ${body.parent_agent_id}`, 'matching failed: no verified agent available']
    };
    await storage.mutate(async (draft) => { draft.jobs.unshift(failedJob); });
    await touchEvent(storage, 'FAILED', `${taskType}/${failedJob.id.slice(0, 6)} no verified agent available`);
    return json({ job_id: failedJob.id, status: 'failed', failure_reason: failedJob.failureReason, inferred_task_type: taskType }, 201);
  }

  const job = {
    id: crypto.randomUUID(),
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
    callbackToken: callbackTokenForJob(),
    billingEstimate: estimateBilling(picked.agent, {
      api_cost: Number(body.estimated_api_cost || 100),
      total_cost_basis: Number(body.estimated_total_cost_basis || 0) || undefined,
      cost_basis: body.estimated_cost_basis || undefined
    }),
    estimateWindow: estimateRunWindow(picked.agent, taskType),
    logs: [`created by ${body.parent_agent_id}`, `${picked.selectionMode === 'manual' ? 'manually selected' : 'matched to'} ${picked.agent.id} score=${picked.score}`, `inferred taskType=${taskType}`],
    selectionMode: picked.selectionMode
  };
  await storage.mutate(async (draft) => { draft.jobs.unshift(job); });
  await touchEvent(storage, 'MATCHED', `${job.taskType}/${job.id.slice(0, 6)} -> ${picked.agent.name}`);
  return json({ job_id: job.id, matched_agent_id: job.assignedAgentId, selection_mode: picked.selectionMode, inferred_task_type: taskType, status: 'queued' }, 201);
}

async function handleRegisterAgent(storage, request) {
  let body;
  try {
    body = await parseBody(request);
  } catch (error) {
    return json({ error: error.message }, 400);
  }
  if (!body.name) return json({ error: 'name required' }, 400);
  const agent = createAgentFromInput(body, ownerInfoFromRequest(request));
  await storage.mutate(async (state) => { state.agents.unshift(agent); });
  await touchEvent(storage, 'REGISTERED', `${agent.name} registered with tasks ${agent.taskTypes.join(', ')}`);
  return json({ ok: true, agent }, 201);
}

async function handleImportManifest(storage, request) {
  let body;
  try {
    body = await parseBody(request);
  } catch (error) {
    return json({ error: error.message }, 400);
  }
  const manifest = normalizeManifest(body.manifest || {});
  const validation = validateManifest(manifest);
  if (!validation.ok) return json({ error: validation.errors.join('; ') }, 400);
  const agent = createAgentFromManifest(manifest, ownerInfoFromRequest(request), {
    manifestSource: 'manifest-json',
    verificationStatus: 'manifest_loaded',
    importMode: 'manifest-json'
  });
  await storage.mutate(async (state) => { state.agents.unshift(agent); });
  await touchEvent(storage, 'REGISTERED', `${agent.name} imported from manifest JSON (pending verification)`);
  return json({ ok: true, agent }, 201);
}

function validateManifestUrlInput(manifestUrl, env) {
  let parsed;
  try {
    parsed = new URL(String(manifestUrl || ''));
  } catch {
    throw new Error('manifest_url must be a valid URL');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('manifest_url must use http or https');
  const isLocalHost = ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname);
  const allowLocal = String(env?.ALLOW_LOCAL_MANIFEST_URLS || '') === '1';
  if (isLocalHost && !allowLocal) throw new Error('Local manifest URLs are disabled unless ALLOW_LOCAL_MANIFEST_URLS=1');
  return parsed.toString();
}

async function loadManifestFromUrl(manifestUrl, env) {
  const safeUrl = validateManifestUrlInput(manifestUrl, env);
  const response = await fetch(safeUrl, {
    headers: { accept: 'application/json, application/yaml;q=0.9, text/plain;q=0.8' }
  });
  if (!response.ok) throw new Error(`Manifest fetch failed (${response.status})`);
  const text = await response.text();
  return parseAndValidateManifest(text, {
    contentType: response.headers.get('content-type') || '',
    sourceUrl: safeUrl
  });
}

async function handleImportUrl(storage, request, env) {
  let body;
  try {
    body = await parseBody(request);
  } catch (error) {
    return json({ error: error.message }, 400);
  }
  if (!body.manifest_url) return json({ error: 'manifest_url required' }, 400);
  let manifest;
  try {
    manifest = await loadManifestFromUrl(body.manifest_url, env);
  } catch (error) {
    return json({ error: error.message }, 400);
  }
  const agent = createAgentFromManifest(manifest, ownerInfoFromRequest(request), {
    manifestUrl: body.manifest_url,
    manifestSource: body.manifest_url,
    verificationStatus: 'manifest_loaded',
    importMode: 'manifest-url'
  });
  await storage.mutate(async (state) => { state.agents.unshift(agent); });
  await touchEvent(storage, 'REGISTERED', `${agent.name} manifest loaded from URL`);
  return json({ ok: true, agent, import_mode: 'manifest-url', owner: agent.owner }, 201);
}

async function handleVerifyAgent(storage, agentId) {
  const result = await storage.mutate(async (state) => {
    const agent = state.agents.find((item) => item.id === agentId);
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
    return { ok: true, agent: publicAgent(agent), verification };
  });
  if (result.error) return json({ error: result.error }, result.statusCode || 400);
  if (result.verification.ok) {
    await touchEvent(storage, 'VERIFIED', `${result.agent.name} verification succeeded`);
  } else {
    await touchEvent(storage, 'FAILED', `${result.agent.name} verification failed: ${result.verification.reason}`);
  }
  return json(result);
}

async function handleClaimJob(storage, request, jobId) {
  let body = {};
  try {
    body = await parseBody(request);
  } catch (error) {
    return json({ error: error.message }, 400);
  }
  const result = await storage.mutate(async (state) => {
    const job = state.jobs.find((item) => item.id === jobId);
    if (!job) return { error: 'Job not found', statusCode: 404 };
    const requestedAgentId = String(body.agent_id || job.assignedAgentId || '').trim();
    const agent = state.agents.find((item) => item.id === requestedAgentId);
    if (!agent) return { error: 'Agent not found', statusCode: 404 };
    if (!isAgentVerified(agent)) return { error: 'Agent is not verified', statusCode: 403 };
    if (!agent.taskTypes.includes(job.taskType)) return { error: 'Agent cannot accept this job type', statusCode: 400 };
    if (isTerminalJobStatus(job.status)) return { error: `Job is already terminal (${job.status})`, statusCode: 409, code: 'job_already_terminal' };
    if (!canTransitionJob(job, 'claim')) return { error: `Job status ${job.status} cannot be claimed`, statusCode: 400, code: transitionErrorCode(job, 'claim') };
    job.assignedAgentId = agent.id;
    job.status = 'claimed';
    job.claimedAt = nowIso();
    job.logs = [...(job.logs || []), `claimed by ${agent.id}`];
    return { ok: true, job: cloneJob(job), agent: publicAgent(agent) };
  });
  if (result.error) return json({ error: result.error, code: result.code || null }, result.statusCode || 400);
  await touchEvent(storage, 'RUNNING', `${result.agent.name} claimed ${result.job.taskType}/${result.job.id.slice(0, 6)}`);
  return json(result);
}

async function handleSubmitResult(storage, request, jobId) {
  let body;
  try {
    body = await parseBody(request);
  } catch (error) {
    return json({ error: error.message }, 400);
  }
  const result = await completeJobFromAgentResult(storage, jobId, body.agent_id, body, { source: 'manual-result' });
  if (result.error) return json({ error: result.error, code: result.code || null }, result.statusCode || 400);
  await touchEvent(storage, 'COMPLETED', `${result.job.taskType}/${result.job.id.slice(0, 6)} completed by connected agent`);
  await touchEvent(storage, 'BILLED', `api=${result.billing.apiCost} total=${result.billing.total}`);
  await appendBillingAudit(storage, result.job, result.billing, { source: 'manual-result' });
  return json({
    ...result,
    delivery: {
      report: result.job.output?.report || null,
      files: result.job.output?.files || [],
      returnTargets: result.job.output?.returnTargets || ['chat', 'api', 'webhook']
    }
  });
}

async function handleAgentCallback(storage, request) {
  let body;
  try {
    body = await parseBody(request);
  } catch (error) {
    return json({ error: error.message }, 400);
  }
  if (!body.job_id || !body.agent_id) return json({ error: 'job_id and agent_id required' }, 400);
  const callback = normalizeCallbackPayload(body);
  const state = await storage.getState();
  const job = state.jobs.find((item) => item.id === body.job_id);
  if (!job) return json({ error: 'Job not found' }, 404);
  if (job.assignedAgentId !== body.agent_id) return json({ error: 'Invalid assignment' }, 401);
  if (!canTransitionJob(job, 'callback')) {
    const code = transitionErrorCode(job, 'callback');
    return json({ error: `Job status ${job.status} cannot be changed by callback`, code, job_status: job.status }, 409);
  }
  const providedToken = extractCallbackToken(request, body);
  if (!providedToken || providedToken !== job.callbackToken) return json({ error: 'Invalid callback token' }, 403);
  if (callback.status === 'failed') {
    const failed = await failJob(storage, body.job_id, callback.failureReason || 'Agent reported failure', [`failed by ${body.agent_id}`, 'failure source=callback'], {
      failureStatus: 'failed',
      failureCategory: 'agent_failed',
      source: 'callback',
      externalJobId: callback.externalJobId
    });
    if (!failed) return json({ error: 'Job not found' }, 404);
    await touchEvent(storage, 'FAILED', `${failed.taskType}/${failed.id.slice(0, 6)} failed by callback`);
    return json({
      ok: true,
      status: failed.status,
      job: failed,
      delivery: { report: null, files: [], returnTargets: [] }
    });
  }
  const result = await completeJobFromAgentResult(storage, body.job_id, body.agent_id, {
    report: callback.report,
    files: callback.files,
    usage: callback.usage,
    return_targets: callback.returnTargets
  }, { source: 'callback', externalJobId: callback.externalJobId });
  if (result.error) return json({ error: result.error, code: result.code || null, job_status: result.job?.status || null }, result.statusCode || 400);
  await touchEvent(storage, 'COMPLETED', `${result.job.taskType}/${result.job.id.slice(0, 6)} completed by callback`);
  await touchEvent(storage, 'BILLED', `api=${result.billing.apiCost} total=${result.billing.total}`);
  await appendBillingAudit(storage, result.job, result.billing, { source: 'callback' });
  return json({
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

async function handleResolveJob(storage, request) {
  let body;
  try {
    body = await parseBody(request);
  } catch (error) {
    return json({ error: error.message }, 400);
  }
  const mode = body.mode || 'complete';
  const result = await storage.mutate(async (state) => {
    const job = state.jobs.find((j) => j.id === body.job_id);
    if (!job) return { error: 'Job not found', statusCode: 404 };
    if (!job.assignedAgentId) return { error: 'No assigned agent', statusCode: 400 };
    const agent = state.agents.find((a) => a.id === job.assignedAgentId);
    if (!agent) return { error: 'Assigned agent not found', statusCode: 404 };
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
    const usage = { api_cost: Math.max(60, Math.min(240, Math.round((job.budgetCap || 180) * 0.35))), simulated: true };
    const billing = estimateBilling(agent, usage);
    job.dispatch = {
      ...(job.dispatch || {}),
      attempts: Math.max(1, Number(job.dispatch?.attempts || 0)),
      retryable: false,
      nextRetryAt: null,
      completionStatus: 'completed',
      lastAttemptAt: nowIso()
    };
    job.status = 'completed';
    job.completedAt = nowIso();
    job.usage = usage;
    job.output = { summary: `Simulated completion for ${job.taskType}`, naturalLanguageIntent: job.prompt };
    job.actualBilling = billing;
    job.logs.push(`completed by ${agent.id}`, `billed total=${billing.total}`);
    agent.earnings = +(Number(agent.earnings || 0) + billing.agentPayout).toFixed(1);
    return { status: 'completed', job, billing };
  });
  if (result.error) return json({ error: result.error }, result.statusCode || 400);
  if (result.status === 'failed') {
    await touchEvent(storage, 'FAILED', `${result.job.taskType}/${result.job.id.slice(0, 6)} failed`);
    return json({ status: 'failed', failure_reason: result.job.failureReason, job: result.job });
  }
  await touchEvent(storage, 'RUNNING', `${result.job.assignedAgentId} started ${result.job.taskType}/${result.job.id.slice(0, 6)}`);
  await touchEvent(storage, 'COMPLETED', `${result.job.taskType}/${result.job.id.slice(0, 6)} completed`);
  await touchEvent(storage, 'BILLED', `api=${result.billing.apiCost} total=${result.billing.total}`);
  await appendBillingAudit(storage, result.job, result.billing, { source: 'worker-dev-resolve-job' });
  return json({ status: 'completed', billing: result.billing, job: result.job });
}

async function handleGetJob(storage, jobId) {
  const state = await storage.getState();
  const job = state.jobs.find((item) => item.id === jobId);
  if (!job) return json({ error: 'Job not found' }, 404);
  return json({ job: cloneJob(job) });
}

async function handleRetryDispatch(storage, request) {
  let body;
  try {
    body = await parseBody(request);
  } catch (error) {
    return json({ error: error.message }, 400);
  }
  const jobId = String(body.job_id || '').trim();
  if (!jobId) return json({ error: 'job_id required' }, 400);

  const result = await storage.mutate(async (state) => {
    const job = state.jobs.find((item) => item.id === jobId);
    if (!job) return { error: 'Job not found', statusCode: 404 };
    if (!canRetryJob(job)) return { error: 'Job is not retryable', statusCode: 409 };
    job.status = 'queued';
    job.failedAt = null;
    job.timedOutAt = null;
    job.completedAt = null;
    job.failureReason = null;
    job.failureCategory = null;
    const attempts = Number(job.dispatch?.attempts || 0) + 1;
    job.logs = [...(job.logs || []), `worker retry requested; job reset to queued (attempt=${attempts})`];
    job.dispatch = {
      ...(job.dispatch || {}),
      attempts,
      retryable: false,
      nextRetryAt: null,
      completionStatus: 'retry_queued',
      retriedAt: nowIso(),
      maxRetries: maxDispatchRetriesForJob(job)
    };
    return { job: cloneJob(job) };
  });

  if (result.error) return json({ error: result.error }, result.statusCode || 400);
  await touchEvent(storage, 'RETRY', `${result.job.taskType}/${result.job.id.slice(0, 6)} moved back to queued`);
  return json({ ok: true, mode: 'queued', job: result.job });
}

async function handleTimeoutSweep(storage, request) {
  let body = {};
  try {
    body = await parseBody(request);
  } catch (error) {
    return json({ error: error.message }, 400);
  }
  const now = Date.now();
  const staleMs = Math.max(1, Number(body.stale_ms || 0)) || null;
  const result = await storage.mutate(async (state) => {
    const swept = [];
    for (const job of state.jobs) {
      if (!['queued', 'claimed', 'running', 'dispatched'].includes(job.status)) continue;
      const deadlineMs = Number(job.deadlineSec || 0) > 0 ? Number(job.deadlineSec) * 1000 : null;
      const basisMs = Date.parse(job.dispatchedAt || job.startedAt || job.createdAt || '') || now;
      const ageMs = Math.max(0, now - basisMs);
      const attempts = Number(job.dispatch?.attempts || 0);
      const nextAttempt = attempts + 1;
      const expiredByDeadline = deadlineMs != null && ageMs >= deadlineMs;
      const expiredByManualWindow = staleMs != null && ageMs >= staleMs;
      if (!expiredByDeadline && !expiredByManualWindow) continue;
      job.status = 'timed_out';
      job.timedOutAt = nowIso();
      job.failureReason = 'Run exceeded timeout window';
      job.failureCategory = 'deadline_timeout';
      job.logs = [...(job.logs || []), 'worker timeout sweep marked run as timed_out'];
      const maxRetries = maxDispatchRetriesForJob(job);
      const retryable = nextAttempt <= maxRetries;
      job.dispatch = {
        ...(job.dispatch || {}),
        attempts,
        retryable,
        nextRetryAt: retryable ? computeNextRetryAt(nextAttempt, now) : null,
        completionStatus: 'timed_out',
        maxRetries
      };
      swept.push({ id: job.id, status: job.status, retryable: job.dispatch.retryable, nextRetryAt: job.dispatch.nextRetryAt, attempts, maxRetries: job.dispatch.maxRetries });
    }
    return { swept };
  });

  for (const job of result.swept) {
    const retryMessage = job.retryable
      ? `run/${job.id.slice(0, 6)} timed out; retry ${job.attempts + 1}/${job.maxRetries} available`
      : `run/${job.id.slice(0, 6)} timed out; retries exhausted at ${job.attempts}/${job.maxRetries}`;
    await touchEvent(storage, 'TIMEOUT', retryMessage, {
      kind: 'run_timeout',
      jobId: job.id,
      retryable: job.retryable,
      attempts: job.attempts,
      maxRetries: job.maxRetries,
      nextRetryAt: job.nextRetryAt
    });
  }
  return json({ ok: true, swept: result.swept, count: result.swept.length });
}

async function handleSeed(storage) {
  const samples = [
    ['research', 'Compare used iPhone resale routes'],
    ['summary', 'Summarize broker operator workflow'],
    ['code', 'Improve retryable failure output']
  ];
  const state = await storage.getState();
  const seededIds = [];
  for (const [taskType, prompt] of samples) {
    const picked = pickAgent(state.agents, taskType);
    if (!picked) continue;
    const usage = { api_cost: 90, simulated: true };
    const billing = estimateBilling(picked.agent, usage);
    const job = {
      id: crypto.randomUUID(),
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
      actualBilling: billing,
      usage,
      output: { summary: 'demo output' },
      logs: ['seeded demo job']
    };
    await storage.mutate(async (draft) => {
      draft.jobs.unshift(job);
      const agent = draft.agents.find((a) => a.id === picked.agent.id);
      if (agent) agent.earnings = +(Number(agent.earnings || 0) + billing.agentPayout).toFixed(1);
    });
    seededIds.push(job.id);
    await touchEvent(storage, 'MATCHED', `${job.taskType}/${job.id.slice(0, 6)} -> ${picked.agent.name}`);
    await touchEvent(storage, 'COMPLETED', `${job.taskType}/${job.id.slice(0, 6)} completed`);
    await touchEvent(storage, 'BILLED', `api=${job.actualBilling.apiCost} total=${job.actualBilling.total}`);
    await appendBillingAudit(storage, job, job.actualBilling, { source: 'worker-seed' });
  }
  return json({ ok: true, job_ids: seededIds });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const storage = createD1LikeStorage(env.MY_BINDING || env.DB || null);
    const version = env.APP_VERSION || '0.2.0';
    const deployTarget = 'cloudflare-worker';

    if (url.pathname === '/api/health') {
      return json({ ok: true, service: 'aiagent2', version, deploy_target: deployTarget, time: nowIso() });
    }
    if (url.pathname === '/api/ready') {
      return json({ ok: true, ready: true, storage: { kind: storage.kind, supportsPersistence: storage.supportsPersistence }, version, deploy_target: deployTarget, time: nowIso() });
    }
    if (url.pathname === '/api/version') {
      return json({ ok: true, version, deploy_target: deployTarget, runtime: 'workerd', time: nowIso() });
    }
    if (url.pathname === '/api/metrics') {
      const snap = await snapshot(storage);
      return json({
        ok: true,
        version,
        deploy_target: deployTarget,
        stats: snap.stats,
        storage: snap.storage,
        billing_audit_count: (snap.billingAudits || []).length,
        event_count: (snap.events || []).length,
        time: nowIso()
      });
    }
    if (url.pathname === '/api/schema') {
      return json({ schema: storage.schemaSql });
    }
    if (url.pathname === '/api/snapshot') {
      return json(await snapshot(storage));
    }
    if (url.pathname === '/api/stats') {
      return json((await snapshot(storage)).stats);
    }
    if (url.pathname === '/api/agents') {
      if (request.method === 'POST') return handleRegisterAgent(storage, request);
      if (request.method === 'GET') return json({ agents: (await snapshot(storage)).agents });
    }
    if (url.pathname === '/api/agent-callbacks/jobs' && request.method === 'POST') {
      return handleAgentCallback(storage, request);
    }
    if (url.pathname === '/api/agents/import-manifest' && request.method === 'POST') {
      return handleImportManifest(storage, request);
    }
    if (url.pathname === '/api/agents/import-url' && request.method === 'POST') {
      return handleImportUrl(storage, request, env);
    }
    if (/^\/api\/agents\/[^/]+\/verify$/.test(url.pathname) && request.method === 'POST') {
      return handleVerifyAgent(storage, url.pathname.split('/')[3] || '');
    }
    if (url.pathname === '/api/jobs') {
      if (request.method === 'GET') return json({ jobs: (await snapshot(storage)).jobs });
      if (request.method === 'POST') return handleCreateJob(storage, request);
    }
    if (url.pathname.startsWith('/api/jobs/')) {
      const [, , , jobId = '', action = ''] = url.pathname.split('/');
      if (request.method === 'GET' && jobId) return handleGetJob(storage, jobId);
      if (request.method === 'POST' && action === 'claim' && jobId) return handleClaimJob(storage, request, jobId);
      if (request.method === 'POST' && action === 'result' && jobId) return handleSubmitResult(storage, request, jobId);
    }
    if (url.pathname === '/api/billing-audits') {
      return json({ billing_audits: (await snapshot(storage)).billingAudits });
    }
    if (url.pathname === '/api/dev/resolve-job' && request.method === 'POST') {
      return handleResolveJob(storage, request);
    }
    if (url.pathname === '/api/dev/dispatch-retry' && request.method === 'POST') {
      return handleRetryDispatch(storage, request);
    }
    if (url.pathname === '/api/dev/timeout-sweep' && request.method === 'POST') {
      return handleTimeoutSweep(storage, request);
    }
    if (url.pathname === '/api/seed' && request.method === 'POST') {
      return handleSeed(storage);
    }

    if (env.ASSETS) {
      const response = await env.ASSETS.fetch(request);
      if (response.status !== 404) return response;
    }

    return json({ error: 'Not found' }, 404);
  }
};
